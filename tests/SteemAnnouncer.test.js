import { createSteemAnnouncer, SteemAnnouncementError } from '../application/steem/SteemAnnouncer.js';
import { SteemPublicationDiscoveryPublisher } from '../application/steem/SteemPublicationDiscoveryPublisher.js';
import { SteemSnapshotDiscoveryPublisher } from '../application/steem/SteemSnapshotDiscoveryPublisher.js';
import { SteemPlaceNamingDiscoveryPublisher } from '../application/steem/SteemPlaceNamingDiscoveryPublisher.js';
import { PublicationCommentarySteemDistribution } from '../application/steem/PublicationCommentarySteemDistribution.js';
import { createSteemDiscoveryThreadReader } from '../application/steem/SteemDiscoveryThreadReader.js';
import { SteemPublicationDiscoveryQueryService } from '../application/steem/SteemPublicationDiscoveryQueryService.js';
import { SteemSnapshotDiscoveryQueryService } from '../application/steem/SteemSnapshotDiscoveryQueryService.js';
import { SteemPlaceNamingDiscoverySource } from '../application/steem/SteemPlaceNamingDiscoverySource.js';
import { steemDiscoveryAnnouncementOperations, steemDiscoveryAnnouncementPermlink, STEEM_MAX_TRANSACTION_BYTES } from '../core/SteemDiscoveryAnnouncement.js';
import { SteemAnnouncingConfiguration } from '../core/SteemAnnouncingConfiguration.js';
import { SteemAnnouncingConfigurationStore } from '../storage/SteemAnnouncingConfigurationStore.js';
import { SetSteemAnnouncingConfigurationUseCase } from '../application/settings/SetSteemAnnouncingConfigurationUseCase.js';
import { PlaceNamingClaim } from '../core/PlaceNamingClaim.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

const NOW = new Date('2026-10-05T12:00:00Z');

// A fake chain: threads that exist, and every broadcast reply stored as the
// chain would, so the readers can read announcements back.
function fakeChain({ threads = ['forkbuild-publication-2026-10', 'forkbuild-snapshot-2026-10', 'forkbuild-place-naming-2026-10', 'forkbuild-commentary-2026-10'], closed = [] } = {}) {
    const replies = new Map();
    const broadcasts = [];
    const contentCalls = [];
    const rpc = {
        async getContent(author, permlink) {
            contentCalls.push(permlink);
            if (!threads.includes(permlink)) return { author: '', permlink: '' };
            return { author, permlink, allow_replies: !closed.includes(permlink) };
        },
        async getContentReplies(author, permlink) {
            return replies.get(`${author}/${permlink}`) ?? [];
        }
    };
    const broadcaster = {
        async broadcast(account, operations) {
            broadcasts.push({ account, operations });
            const [, comment] = operations[0];
            const key = `${comment.parent_author}/${comment.parent_permlink}`;
            replies.set(key, [...(replies.get(key) ?? []), { ...comment, created: '2026-10-05T12:00:00' }]);
            return { transactionId: `tx${broadcasts.length}` };
        }
    };
    return { rpc, broadcaster, broadcasts, contentCalls };
}

function announcerFor(chain, { account = 'alice', broadcaster = chain.broadcaster } = {}) {
    let n = 0;
    return createSteemAnnouncer({
        rpc: chain.rpc,
        getBroadcaster: () => broadcaster,
        getAccount: () => account,
        appVersion: '1.0.0',
        now: () => NOW,
        randomSuffix: () => `abcdefg${n++}`
    });
}

async function rejection(promise) {
    try {
        await promise;
        return null;
    } catch (error) {
        return error;
    }
}

// The operations follow docs/Protocol.md.
{
    assert(steemDiscoveryAnnouncementPermlink(1790000000000, 'ab12cd34') === `forkbuild-${(1790000000000).toString(36)}-ab12cd34`, 'permlink from time and suffix');
    const [[kind, comment], [optionsKind, options]] = steemDiscoveryAnnouncementOperations({
        author: 'alice', threadAccount: 'forkbuild', threadPermlink: 'forkbuild-snapshot-2026-10',
        family: 'snapshot', envelope: { contentHash: 'h' }, permlink: 'forkbuild-x-abcdefgh', appVersion: '1.0.0'
    });
    assert(kind === 'comment' && comment.parent_author === 'forkbuild' && comment.parent_permlink === 'forkbuild-snapshot-2026-10', 'a reply to the thread');
    assert(comment.title === '' && comment.body.length > 0, 'no title, a non-empty body');
    const metadata = JSON.parse(comment.json_metadata);
    assert(metadata.app === 'forkbuild/1.0.0' && metadata.forkbuild.version === 1 && metadata.forkbuild.family === 'snapshot' && metadata.forkbuild.envelope.contentHash === 'h', 'metadata carries the envelope');
    assert(optionsKind === 'comment_options' && options.max_accepted_payout === '0.000 SBD' && options.allow_votes === true, 'payout declined, votes on');
    console.log('✓ announcement operations');
}

// Announcing goes to the current month's thread, signed as the configured account.
{
    const chain = fakeChain();
    const announcement = await announcerFor(chain).announce('snapshot', { contentHash: 'h' });
    assert(chain.broadcasts.length === 1 && chain.broadcasts[0].account === 'alice', 'broadcast as the configured account');
    assert(announcement.status === 'accepted' && announcement.transactionId === 'tx1', 'accepted, with its transaction');
    assert(announcement.threadPermlink === 'forkbuild-snapshot-2026-10' && announcement.id.startsWith('@alice/forkbuild-'), `the October thread (got ${announcement.threadPermlink})`);
    assert(announcement.url === `https://steemit.com/${announcement.id}`, 'a link to the reply');

    const announcer = announcerFor(chain);
    await announcer.announce('snapshot', { a: 1 });
    await announcer.announce('snapshot', { a: 2 });
    assert(chain.contentCalls.filter((p) => p === 'forkbuild-snapshot-2026-10').length === 2, 'an open thread is checked once per announcer');
    console.log('✓ announcing to the current thread');
}

// Every refusal says what to do.
{
    const noAccount = await rejection(announcerFor(fakeChain(), { account: null }).announce('snapshot', {}));
    assert(noAccount instanceof SteemAnnouncementError && noAccount.message.includes('Network Settings → Steem'), 'no account points at the settings');

    const noKeychain = await rejection(announcerFor(fakeChain(), { broadcaster: null }).announce('snapshot', {}));
    assert(noKeychain?.message.includes('Steem Keychain was not found'), 'no Keychain says so');

    const missing = fakeChain({ threads: [] });
    const noThread = await rejection(announcerFor(missing).announce('commentary', {}));
    assert(noThread?.message.includes("@forkbuild/forkbuild-commentary-2026-10 doesn't exist yet") && missing.broadcasts.length === 0, 'a missing thread is named and nothing is broadcast');

    const closed = await rejection(announcerFor(fakeChain({ closed: ['forkbuild-snapshot-2026-10'] })).announce('snapshot', {}));
    assert(closed?.message.includes('no longer accepts replies'), 'a closed thread is refused');

    const tooBig = await rejection(announcerFor(fakeChain()).announce('snapshot', { blob: 'x'.repeat(STEEM_MAX_TRANSACTION_BYTES) }));
    assert(tooBig?.message.includes('transaction limit'), 'an oversized announcement is refused');

    const declining = fakeChain();
    const declined = await rejection(announcerFor(declining, { broadcaster: { broadcast: async () => { throw new Error('Request was canceled by the user.'); } } }).announce('snapshot', {}));
    assert(declined?.message === 'Request was canceled by the user.', "Keychain's refusal is passed on");

    const unreachable = await rejection(announcerFor({ ...fakeChain(), rpc: { getContent: async () => { throw new Error('no Steem API node answered'); } } }).announce('snapshot', {}));
    assert(unreachable?.message.includes("Couldn't check this month's Steem discovery thread"), 'an unreachable node stops the announcement');
    console.log('✓ refusals');
}

// Round trip: what each publisher announces, the matching reader finds.
{
    const chain = fakeChain();
    const announcer = announcerFor(chain);
    const reader = createSteemDiscoveryThreadReader({ rpc: chain.rpc, now: () => NOW });

    const publication = await new SteemPublicationDiscoveryPublisher({ announcer }).publish({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-1', uri: 'ar://ABC123' });
    assert(publication.published && publication.id.startsWith('@alice/') && publication.relayUrl.endsWith('/@forkbuild/forkbuild-publication-2026-10'), 'the publication publisher reports the reply and thread');
    assert(await new SteemPublicationDiscoveryPublisher({ announcer }).publish({ junk: true }) === null, 'a malformed publication envelope resolves to null');
    const leads = await new SteemPublicationDiscoveryQueryService({ reader }).search('forkbuild-publication');
    assert(leads.length === 1 && leads[0].uri === 'ar://ABC123', 'the publication is read back');

    await new SteemSnapshotDiscoveryPublisher({ announcer }).publish({ contentHash: 'hash-1', locator: 'ar://TX1', storage: 'ar', publicationId: 'pub-1', claimedPosition: { x: 1, y: 0, z: 2 } });
    const snapshots = await new SteemSnapshotDiscoveryQueryService({ reader }).search('forkbuild-snapshot');
    assert(snapshots.length === 1 && snapshots[0].contentHash === 'hash-1' && snapshots[0].claimedPosition.z === 2, 'the snapshot is read back with its position');

    const claim = PlaceNamingClaim.fromJSON({
        id: 'claim-1', worldId: 'world-1', regionId: 'region-1', name: 'Old Oak', authorIdentityId: 'did:key:zAlice', createdAt: '2026-10-01T00:00:00.000Z',
        signature: { algorithm: 'ed25519', signer: 'did:key:zAlice', signature: 'sig', signedHash: 'hash', domain: 'forkbuild.place-naming-claim' }
    });
    const named = await new SteemPlaceNamingDiscoveryPublisher({ announcer }).publish(claim);
    const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
    assert(named.discoveryTag === tag, 'the place naming publisher reports the region tag');
    const payloads = await new SteemPlaceNamingDiscoverySource({ reader }).search(tag);
    assert(payloads.length === 1 && payloads[0].claim.name === 'Old Oak', 'the place name is read back');

    const commentary = new PublicationCommentarySteemDistribution({ reader, announcer });
    const posted = await commentary.publish({ commentaryId: 'c1', publicationId: 'pub-1' });
    assert(posted.published && posted.locator.startsWith('@alice/'), 'commentary is posted');
    const comments = await commentary.discover();
    assert(comments.length === 1 && comments[0].commentaryId === 'c1', 'the comment is read back');
    assert(await rejection(new PublicationCommentarySteemDistribution({ reader }).publish({})) !== null, 'without an announcer, publishing is refused');
    console.log('✓ round trip through every family');
}

// The account setting.
{
    const store = new SteemAnnouncingConfigurationStore(new InMemoryStorageProvider());
    assert(store.get() === null, 'no account by default');
    const saved = new SetSteemAnnouncingConfigurationUseCase({ steemAnnouncingConfigurationStore: store }).execute({ account: ' @alice ' });
    assert(saved.account === 'alice' && store.get().account === 'alice', 'the account is saved without @ or spaces');
    let caught = null;
    try {
        new SteemAnnouncingConfiguration({ account: 'Not Valid' });
    } catch (error) {
        caught = error;
    }
    assert(caught?.message.includes('is not a Steem account name'), 'a bad name is refused');
    console.log('✓ the announcing account setting');
}

// The publication and place naming compositions choose the Steem publisher.
{
    const { composePublicationDistributionRuntime } = await import('../application/publication/distribution/PublicationDistributionRuntimeComposition.js');
    const { composePlaceNamingPublicationRuntime } = await import('../application/placeNaming/PlaceNamingPublicationRuntimeComposition.js');
    const announcer = announcerFor(fakeChain());
    // Material upload is outside this test; any signer shape satisfies the uploader.
    const arweaveUploaderOptions = { signer: { sign: async () => {} } };
    const steemPublicationDiscoveryPublisher = new SteemPublicationDiscoveryPublisher({ announcer });
    const runtime = composePublicationDistributionRuntime({ discoveryProvider: 'steem', steemPublicationDiscoveryPublisher, arweaveUploaderOptions });
    assert(runtime.publisher === steemPublicationDiscoveryPublisher, 'publication distribution uses the Steem publisher for "steem"');
    let caught = null;
    try {
        composePublicationDistributionRuntime({ discoveryProvider: 'steem', arweaveUploaderOptions });
    } catch (error) {
        caught = error;
    }
    assert(caught?.message.includes('announcing on Steem is not available'), 'without a Steem publisher, "steem" is refused with a reason');

    const steemPlaceNamingDiscoveryPublisher = new SteemPlaceNamingDiscoveryPublisher({ announcer });
    const placeNaming = composePlaceNamingPublicationRuntime({ discoveryProvider: 'steem', steemPlaceNamingDiscoveryPublisher });
    assert(placeNaming.discoveryPublisher === steemPlaceNamingDiscoveryPublisher, 'place naming uses the Steem publisher for "steem"');
    console.log('✓ compositions choose the Steem publishers');
}
