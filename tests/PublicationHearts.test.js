import { PublicationHeart, currentHeartsFor } from '../core/publication/PublicationHeart.js';
import { PUBLICATION_HEART_DISTRIBUTION_KIND } from '../core/publication/PublicationHeartDistributionEnvelope.js';
import { PublicationCommentary } from '../core/publication/PublicationCommentary.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { PublicationHeartStore } from '../storage/PublicationHeartStore.js';
import { PublicationCommentaryStore } from '../storage/PublicationCommentaryStore.js';
import { HeartDistributionPreferenceStore } from '../storage/HeartDistributionPreferenceStore.js';
import { PublicationHeartExchange } from '../application/publication/heart/PublicationHeartExchange.js';
import { SetPublicationHeartUseCase } from '../application/publication/heart/SetPublicationHeartUseCase.js';
import { withHeartRouting } from '../application/publication/heart/withHeartRouting.js';
import { PublicationHeartNotificationBridge, PUBLICATION_HEARTED_EVENT_TYPE } from '../application/publication/heart/PublicationHeartNotifications.js';
import { PublicationHeartDistributionLog, createPublicationHeartDistributor } from '../application/publication/heart/PublicationHeartDistributor.js';
import { NostrPublicationHeartDistribution, HEART_DISCOVERY_TAG } from '../application/nostr/NostrPublicationHeartDistribution.js';
import { PublicationCommentaryDistributionExchange } from '../application/publication/commentary/PublicationCommentaryDistributionExchange.js';
import { createIdentityNames } from '../application/publication/identityNames.js';
import { isUserFacingError } from '../core/app/UserFacingError.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';
import { assert } from './support/Assert.js';

// Hearts (docs/Protocol.md, "Publication Hearts"): a signed record per tap,
// each person's latest one counting; carried with comments but never as one;
// a Nostr reaction, taken back with a deletion request.

const PUB = 'pub-house';
const at = (seconds) => new Date(Date.UTC(2026, 9, 18, 12, 0, seconds));

function device(label) {
    const identityProvider = makeIdentity(label);
    const storage = new InMemoryStorageProvider();
    const verifier = new LocalAuthorizationVerifier();
    const heartStore = new PublicationHeartStore(storage);
    const heartExchange = new PublicationHeartExchange(heartStore, identityProvider, verifier);
    const commentaryStore = new PublicationCommentaryStore(storage);
    const commentaryExchange = new PublicationCommentaryDistributionExchange(commentaryStore, identityProvider, verifier);
    return { identityProvider, id: resolveSigningIdentityId(identityProvider), storage, heartStore, heartExchange, commentaryStore, commentaryExchange };
}

// The record: a person's latest word counts, ties settled the same everywhere.
{
    const records = [
        new PublicationHeart({ heartId: 'a1', publicationId: PUB, authorIdentityId: 'did:a', authorName: 'alice', hearted: true, createdAt: at(1) }),
        new PublicationHeart({ heartId: 'b1', publicationId: PUB, authorIdentityId: 'did:b', hearted: true, createdAt: at(2) }),
        new PublicationHeart({ heartId: 'a2', publicationId: PUB, authorIdentityId: 'did:a', hearted: false, createdAt: at(3) }),
        new PublicationHeart({ heartId: 'c1', publicationId: PUB, authorIdentityId: 'did:c', hearted: true, createdAt: at(4) }),
        new PublicationHeart({ heartId: 'x1', publicationId: 'other', authorIdentityId: 'did:a', hearted: true, createdAt: at(5) })
    ];
    const current = currentHeartsFor(records, PUB);
    assert(current.map((heart) => heart.authorIdentityId).join() === 'did:c,did:b', `taken back is gone, newest first (got ${current.map((h) => h.authorIdentityId)})`);
    const tie = currentHeartsFor([
        new PublicationHeart({ heartId: 'k1', publicationId: PUB, authorIdentityId: 'did:k', hearted: false, createdAt: at(9) }),
        new PublicationHeart({ heartId: 'k2', publicationId: PUB, authorIdentityId: 'did:k', hearted: true, createdAt: at(9) })
    ], PUB);
    assert(tie.length === 1, 'at the same moment, the greater heartId wins, on every device');
    assert(new PublicationHeart({ publicationId: PUB, authorIdentityId: 'did:a', authorName: '  ' + 'n'.repeat(80) }).authorName.length === 60, 'a chosen name is trimmed and capped');
    assert(PublicationHeart.fromJSON({ publicationId: PUB }) === null, 'an incomplete record is not restored');
    console.log('✓ each person\'s latest record counts');
}

// Signed over every field: a forged or altered heart is refused.
{
    const alice = device('alice');
    const bob = device('bob');
    const heart = new PublicationHeart({ publicationId: PUB, authorIdentityId: alice.id, authorName: 'alice', hearted: true, createdAt: at(1) });
    const envelope = alice.heartExchange.exportHeart(heart);
    assert(envelope.kind === PUBLICATION_HEART_DISTRIBUTION_KIND && envelope.signature, 'exported signed, with its kind');
    const first = bob.heartExchange.importHeartEnvelope(envelope);
    assert(first.isNew && first.heart.authorName === 'alice' && bob.heartStore.currentHearts(PUB).length === 1, 'accepted and kept');
    assert(bob.heartExchange.importHeartEnvelope(envelope).isNew === false, 'the same heart again is not new');
    for (const [field, value] of [['hearted', false], ['authorName', 'mallory'], ['publicationId', 'other']]) {
        let refused = false;
        try {
            bob.heartExchange.importHeartEnvelope({ ...envelope, heartId: `t-${field}`, [field]: value });
        } catch {
            refused = true;
        }
        assert(refused, `a heart with ${field} changed is refused`);
    }
    let notOwn = false;
    try {
        bob.heartExchange.exportHeart(heart);
    } catch {
        notOwn = true;
    }
    assert(notOwn, 'nobody signs another person\'s heart');
    console.log('✓ hearts are signed by their author over every field');
}

// One tap: a new record under the identity's name, a repeat tap nothing.
{
    const alice = device('alice');
    const useCase = new SetPublicationHeartUseCase(alice.heartStore, alice.identityProvider, { now: () => at(5) });
    const given = useCase.execute({ publicationId: PUB, hearted: true });
    assert(given && given.hearted && given.authorIdentityId === alice.id && given.authorName === 'alice', 'given, signed in as alice under her name');
    assert(useCase.execute({ publicationId: PUB, hearted: true }) === null, 'a second heart is no new record');
    const taken = useCase.execute({ publicationId: PUB, hearted: false });
    assert(taken && !taken.hearted && taken.createdAt > given.createdAt, 'taken back, after the heart even at the same moment');
    assert(alice.heartStore.currentHearts(PUB).length === 0, 'and gone');
    const signedOut = new SetPublicationHeartUseCase(new PublicationHeartStore(new InMemoryStorageProvider()), null);
    let refusal = null;
    try {
        signedOut.execute({ publicationId: PUB, hearted: true });
    } catch (error) {
        refusal = error;
    }
    assert(isUserFacingError(refusal), 'signed out, a heart asks for a name first');
    console.log('✓ one tap gives or takes back a heart');
}

// Carried with comments, never as one: the routed exchange sends a heart to
// the heart store, and an older copy's comment exchange refuses one.
{
    const alice = device('alice');
    const bob = device('bob');
    const heard = [];
    const routed = withHeartRouting(bob.commentaryExchange, bob.heartExchange, { onHeart: (result) => heard.push(result) });
    const heartEnvelope = alice.heartExchange.exportHeart(new PublicationHeart({ publicationId: PUB, authorIdentityId: alice.id, createdAt: at(1) }));
    const comment = new PublicationCommentary({ publicationId: PUB, authorIdentityId: alice.id, content: 'Nice porch' });
    const commentEnvelope = alice.commentaryExchange.exportCommentary(comment);
    const viaHeart = routed.importCommentaryEnvelope(heartEnvelope);
    const viaComment = routed.importCommentaryEnvelope(commentEnvelope);
    assert(viaHeart.heart && !viaHeart.commentary && heard.length === 1, 'a heart reaches the heart store, with no comment in the result');
    assert(viaComment.commentary && bob.commentaryStore.getForPublication(PUB).length === 1 && bob.heartStore.currentHearts(PUB).length === 1, 'a comment still reaches the comments, and no heart becomes one');
    let olderRefuses = false;
    try {
        device('carol').commentaryExchange.importCommentaryEnvelope(heartEnvelope);
    } catch {
        olderRefuses = true;
    }
    assert(olderRefuses, 'a copy without hearts reads a heart as a malformed comment and skips it');
    const ownHeart = new PublicationHeart({ publicationId: PUB, authorIdentityId: alice.id });
    const aliceRouted = withHeartRouting(alice.commentaryExchange, alice.heartExchange);
    assert(aliceRouted.exportCommentary(ownHeart).kind === PUBLICATION_HEART_DISTRIBUTION_KIND && aliceRouted.exportCommentary(comment).content === 'Nice porch', 'and exports each as itself');
    console.log('✓ hearts ride the comment carriers without becoming comments');
}

// The builder hears of a new heart, and only that.
{
    const builder = device('builder');
    const fan = device('fan');
    const sent = [];
    const discovery = { findById: (id) => (id === PUB ? { id: PUB, title: 'House', publisherIdentity: { id: builder.id } } : null) };
    const bridge = new PublicationHeartNotificationBridge(discovery, builder.identityProvider, builder.heartStore, (event) => sent.push(event));
    const give = (hearted, seconds) => builder.heartExchange.importHeartEnvelope(fan.heartExchange.exportHeart(new PublicationHeart({ publicationId: PUB, authorIdentityId: fan.id, authorName: 'fan', hearted, createdAt: at(seconds) })));
    bridge.handleHeartReceived(give(true, 1));
    assert(sent.length === 1 && sent[0].eventType === PUBLICATION_HEARTED_EVENT_TYPE && sent[0].payload.author === 'fan' && sent[0].payload.title === 'House', 'a heart on your build tells you, by name');
    bridge.handleHeartReceived(give(false, 2));
    const late = give(true, 0);
    bridge.handleHeartReceived(late);
    assert(sent.length === 1, 'a heart taken back, or an older heart arriving late, tells no one');
    console.log('✓ the builder hears of a new heart');
}

// Nostr: a reaction other apps show, and a deletion request to take it back.
{
    const alice = device('alice');
    const envelope = alice.heartExchange.exportHeart(new PublicationHeart({ publicationId: PUB, authorIdentityId: alice.id, createdAt: at(1) }));
    const reaction = NostrPublicationHeartDistribution.eventFor(envelope);
    assert(reaction.kind === 7 && reaction.content === '❤️', 'a heart is a kind-7 ❤️ reaction');
    assert(reaction.tags.some((tag) => tag[0] === 't' && tag[1] === HEART_DISCOVERY_TAG) && reaction.tags.some((tag) => tag[0] === 't' && tag[1] === `forkbuild-heart:${PUB}`), 'tagged for all hearts and for this build');
    const back = alice.heartExchange.exportHeart(new PublicationHeart({ publicationId: PUB, authorIdentityId: alice.id, hearted: false, createdAt: at(2) }));
    const deletion = NostrPublicationHeartDistribution.eventFor(back, { replaces: ['a'.repeat(64), 'not-an-id'] });
    assert(deletion.kind === 5 && deletion.tags.filter((tag) => tag[0] === 'e').length === 1 && deletion.tags.some((tag) => tag[0] === 'k' && tag[1] === '7'), 'taking it back asks relays to delete the earlier reaction');

    const published = [];
    const relayEvents = [
        { id: '1'.repeat(64), tags: reaction.tags },
        { id: '2'.repeat(64), tags: deletion.tags },
        { id: '1'.repeat(64), tags: reaction.tags },
        { id: '3'.repeat(64), tags: [['forkbuild', 'not json']] }
    ];
    const carrier = new NostrPublicationHeartDistribution({
        relayUrls: ['wss://one.example', 'wss://two.example'],
        publishImpl: async (relayUrl, event) => { published.push([relayUrl, event.kind]); return { published: true, id: 'f'.repeat(64) }; },
        queryImpl: async (relayUrl) => (relayUrl === 'wss://one.example' ? relayEvents : Promise.reject(new Error('down')))
    });
    const result = await carrier.publish(envelope);
    assert(result.locator === 'f'.repeat(64) && published.length === 2, 'sent to every relay');
    const found = await carrier.discover(PUB);
    assert(found.length === 2 && found.every((record) => record.kind === PUBLICATION_HEART_DISTRIBUTION_KIND), `each event once, unreadable ones dropped, one relay down (got ${found.length})`);
    console.log('✓ on Nostr a heart is a reaction, taken back by a deletion request');
}

// The distributor: peers always, then the network chosen for hearts.
{
    const alice = device('alice');
    const announced = [];
    const sent = [];
    const log = new PublicationHeartDistributionLog(new InMemoryStorageProvider());
    let network = 'nostr';
    const nostr = { publish: async (envelope, options) => { sent.push(['nostr', envelope.hearted, options.replaces || []]); return { published: true, locator: (envelope.hearted ? 'a' : 'b').repeat(64) }; } };
    const steem = { publish: async (envelope) => { sent.push(['steem', envelope.hearted]); return { published: true, locator: 'steem-1' }; } };
    const distribute = createPublicationHeartDistributor({
        peerExchange: { announce: (heart) => announced.push(heart.heartId) },
        heartExchange: alice.heartExchange,
        substrateFor: (key) => ({ nostr, steem })[key] || null,
        provider: () => network,
        distributionLog: log
    });
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    const heart = new PublicationHeart({ publicationId: PUB, authorIdentityId: alice.id, createdAt: at(1) });
    distribute(heart);
    await flush();
    distribute(new PublicationHeart({ publicationId: PUB, authorIdentityId: alice.id, hearted: false, createdAt: at(2) }));
    await flush();
    assert(announced.length === 2 && sent[0][0] === 'nostr' && sent[1][2][0] === 'a'.repeat(64), `to peers and Nostr by default; taking it back names the reaction it replaces (got ${JSON.stringify(sent)})`);
    network = 'steem';
    distribute(new PublicationHeart({ publicationId: PUB, authorIdentityId: alice.id, createdAt: at(3) }));
    network = 'peers';
    distribute(new PublicationHeart({ publicationId: PUB, authorIdentityId: alice.id, hearted: false, createdAt: at(4) }));
    await flush();
    assert(sent.length === 3 && sent[2][0] === 'steem' && announced.length === 4, 'another network when chosen; Local & peers only sends it to peers alone');
    console.log('✓ a heart goes to peers and the network chosen for hearts');
}

// The setting: Nostr unless changed.
{
    const store = new HeartDistributionPreferenceStore(new InMemoryStorageProvider());
    assert(store.get() === 'nostr', 'Nostr by default');
    store.save('arweave');
    assert(store.get() === 'arweave', 'then the network chosen');
    let refused = false;
    try {
        store.save('carrier-pigeon');
    } catch {
        refused = true;
    }
    assert(refused, 'never an unknown network');
    console.log('✓ hearts go to Nostr unless changed in Settings');
}

// Names: yours, then the one people publish under, then the one they chose.
{
    const signerOf = (publication) => publication.signer;
    const publications = [
        { id: 'p1', signer: 'did:alice', author: 'Alice old', publishedAt: '2026-01-01T00:00:00Z' },
        { id: 'p2', signer: 'did:alice', author: 'Alice', publishedAt: '2026-06-01T00:00:00Z', builtWith: [{ identityId: 'did:bob', name: 'Bob the helper' }] },
        { id: 'p3', signer: null, author: 'Impostor', publishedAt: '2026-07-01T00:00:00Z' }
    ];
    const names = createIdentityNames({ publications: () => publications, signerOf, ownIdentity: () => ({ id: 'did:me', name: 'Me' }) });
    assert(names.nameFor('did:me').name === 'Me' && names.nameFor('did:me').source === 'you', 'your own name');
    assert(names.nameFor('did:alice', 'Totally Bob').name === 'Alice', 'the name of their newest verified build beats the one they chose');
    assert(names.nameFor('did:bob').name === 'Bob the helper', 'else the name a signed build credits them by');
    assert(names.nameFor('did:carol', 'carol').source === 'chosen' && names.nameFor('did:dave') === null, 'else their chosen name, else nothing');
    console.log('✓ people are named from what this device can tell');
}
