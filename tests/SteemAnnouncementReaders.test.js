import { SteemPublicationDiscoveryQueryService } from '../application/steem/SteemPublicationDiscoveryQueryService.js';
import { SteemSnapshotDiscoveryQueryService } from '../application/steem/SteemSnapshotDiscoveryQueryService.js';
import { SteemPlaceNamingDiscoverySource } from '../application/steem/SteemPlaceNamingDiscoverySource.js';
import { PublicationCommentarySteemDistribution } from '../application/steem/PublicationCommentarySteemDistribution.js';
import { SteemDiscoveryReadOutcome, createSteemDiscoveryThreadReader } from '../application/steem/SteemDiscoveryThreadReader.js';
import { DiscoverPublicationCommentaryUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryUseCase.js';
import { queryDecentralizedWorldDiscovery } from '../application/discovery/DecentralizedWorldDiscoveryQuery.js';
import { SnapshotCandidateDiscoveryQueryService } from '../application/snapshot/SnapshotCandidateDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryOutcome } from '../application/snapshot/SnapshotCandidateDiscoveryOutcome.js';
import { PlaceNamingDiscoveryQueryService } from '../application/placeNaming/PlaceNamingDiscoveryQueryService.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { assert } from './support/Assert.js';

const NOW = new Date('2026-09-28T00:00:00Z');

// A reader over a fake chain holding one thread per family for September 2026.
function readerWith(envelopesByFamily, { unavailable = false } = {}) {
    const rpc = {
        async getContentReplies(author, permlink) {
            if (unavailable) throw new Error('no Steem API node answered');
            const family = permlink.replace(/^forkbuild-/, '').replace(/-\d{4}-\d{2}$/, '');
            return (envelopesByFamily[family] ?? []).map((envelope, i) => ({
                parent_author: author,
                parent_permlink: permlink,
                author: 'alice',
                permlink: `${family}-${i}`,
                created: '2026-09-27T00:00:00',
                json_metadata: JSON.stringify({ forkbuild: { version: 1, family, envelope } })
            }));
        }
    };
    return createSteemDiscoveryThreadReader({ rpc, now: () => NOW });
}

const publicationEnvelope = (overrides = {}) => ({ protocol: 'forkbuild', version: 1, kind: 'PUBLICATION', objectId: 'pub-1', uri: 'ar://ABC123', ...overrides });
const snapshotEnvelope = (overrides = {}) => ({ protocol: 'forkbuild-snapshot-discovery', version: 1, contentHash: 'hash-1', locator: 'ar://TX1', storage: 'ar', ...overrides });

function placeNamingEnvelope(regionId, name) {
    const claim = {
        id: `claim-${regionId}`,
        worldId: 'world-1',
        regionId,
        name,
        authorIdentityId: 'did:key:zAlice',
        createdAt: '2026-09-01T00:00:00.000Z',
        signature: { algorithm: 'ed25519', signer: 'did:key:zAlice', signature: 'sig', signedHash: 'hash', domain: 'forkbuild.place-naming-claim' }
    };
    return { protocol: 'forkbuild-place-naming-discovery', version: 1, worldId: 'world-1', regionId, claim };
}

// Publications become leads through the shared discovery query.
{
    const service = new SteemPublicationDiscoveryQueryService({
        reader: readerWith({ publication: [publicationEnvelope(), publicationEnvelope({ protocol: 'something-else' }), publicationEnvelope({ objectId: 'pub-2', uri: 'ipfs://bafy' })] })
    });
    assert(service.origin === 'dweb:steem:forkbuild', `origin names the thread accounts (got ${service.origin})`);
    const leads = await queryDecentralizedWorldDiscovery(service, 'forkbuild-publication');
    assert(leads.length === 2, `malformed envelopes are dropped (got ${leads.length})`);
    assert(leads[0].uri === 'ar://ABC123' && leads[0].storage === 'ar' && leads[0].origin === 'dweb:steem:forkbuild', 'a lead carries uri, storage and origin');
    assert(leads[1].storage === 'ipfs', 'storage comes from the uri scheme');
    assert((await service.search('forkbuild-snapshot')).length === 0, 'other tags find nothing');

    const down = new SteemPublicationDiscoveryQueryService({ reader: readerWith({}, { unavailable: true }) });
    assert((await down.search('forkbuild-publication')).length === 0, 'an unreachable chain yields no leads, never a throw');
    console.log('✓ publication leads');
}

// Snapshots join the composite candidate search with an honest outcome.
{
    const service = new SteemSnapshotDiscoveryQueryService({
        reader: readerWith({ snapshot: [snapshotEnvelope(), snapshotEnvelope({ contentHash: 'hash-2', locator: 'ipfs://x', storage: 'ipfs', publicationId: 'pub-1', claimedPosition: { x: 1, y: 0, z: 2 } }), { junk: true }] })
    });
    const found = await service.searchWithOutcome('forkbuild-snapshot');
    assert(found.outcome === SnapshotCandidateDiscoveryOutcome.FOUND && found.candidates.length === 2, 'two candidates found');
    assert(found.candidates[1].publicationId === 'pub-1' && found.candidates[1].claimedPosition.x === 1, 'a placed snapshot keeps its publication and position');
    assert(await service.resolveLocator('forkbuild-snapshot', 'hash-2') === 'ipfs://x', 'resolveLocator finds by content hash');

    const composite = new SnapshotCandidateDiscoveryQueryService([service, new SteemSnapshotDiscoveryQueryService({ reader: readerWith({ snapshot: [snapshotEnvelope()] }) })]);
    assert((await composite.search('forkbuild-snapshot')).length === 2, 'the composite deduplicates the same candidate from two sources');

    const down = new SteemSnapshotDiscoveryQueryService({ reader: readerWith({}, { unavailable: true }) });
    const unavailable = await down.searchWithOutcome('forkbuild-snapshot');
    assert(unavailable.outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE, 'an unreachable chain is unavailable, not empty');
    const empty = await new SteemSnapshotDiscoveryQueryService({ reader: readerWith({}) }).searchWithOutcome('forkbuild-snapshot');
    assert(empty.outcome === SnapshotCandidateDiscoveryOutcome.EMPTY, 'nothing announced is empty');
    console.log('✓ snapshot candidates');
}

// Place naming keeps only the requested region.
{
    const source = new SteemPlaceNamingDiscoverySource({
        reader: readerWith({ 'place-naming': [placeNamingEnvelope('region-1', 'Old Oak'), placeNamingEnvelope('region-2', 'Far Hill'), { junk: true }] })
    });
    const tag = derivePlaceNamingDiscoveryTag('world-1', 'region-1');
    const payloads = await source.search(tag);
    assert(payloads.length === 1 && payloads[0].claim.name === 'Old Oak', 'only the requested region is returned');

    const query = new PlaceNamingDiscoveryQueryService([source]);
    const described = await query.search(tag);
    assert(Array.isArray(described) && described.length === 1, `the place naming query parses Steem payloads (got ${JSON.stringify(described)})`);

    let caught = null;
    try {
        await new SteemPlaceNamingDiscoverySource({ reader: readerWith({}, { unavailable: true }) }).search(tag);
    } catch (error) {
        caught = error;
    }
    assert(caught?.message.includes('no discovery thread could be read'), 'an unreachable chain rejects, like the Nostr source');
    console.log('✓ place naming claims by region');
}

// Commentary goes through the exchange, filtered by publication.
{
    const distribution = new PublicationCommentarySteemDistribution({
        reader: readerWith({ commentary: [{ commentaryId: 'c1', publicationId: 'pub-1' }, { commentaryId: 'c2', publicationId: 'pub-2' }, { commentaryId: 'bad', publicationId: 'pub-1' }] })
    });
    const imported = [];
    const exchange = {
        importCommentaryEnvelope(envelope) {
            if (envelope.commentaryId === 'bad') throw new Error('signature does not verify');
            imported.push(envelope.commentaryId);
            return { isNew: true, commentary: { commentaryId: envelope.commentaryId } };
        }
    };
    const admitted = await new DiscoverPublicationCommentaryUseCase(distribution, exchange).execute({ publicationId: 'pub-1' });
    assert(admitted.length === 1 && JSON.stringify(imported) === '["c1"]', 'only verified comments on this publication are admitted');

    let caught = null;
    try {
        await new PublicationCommentarySteemDistribution({ reader: readerWith({}, { unavailable: true }) }).discover();
    } catch (error) {
        caught = error;
    }
    assert(caught !== null, 'an unreachable chain rejects, so a refresh reports Steem as failed');
    console.log('✓ commentary');
}

// The reader outcome names are shared with the snapshot outcome.
assert(SteemDiscoveryReadOutcome.UNAVAILABLE === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE, 'outcome names match');
