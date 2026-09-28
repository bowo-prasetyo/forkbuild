import { AnnouncementIndex } from '../application/announcementIndex/AnnouncementIndex.js';
import { AnnouncementKind } from '../application/announcementIndex/AnnouncementKinds.js';
import { RecordingDiscoverySource, IndexedAnnouncementSource, IndexBackedPublicationDiscoveryService } from '../application/announcementIndex/IndexedDiscoverySources.js';
import { composeSnapshotCandidateDiscoveryRuntime } from '../application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js';
import { SnapshotCandidateDiscoveryOutcome } from '../application/snapshot/SnapshotCandidateDiscoveryOutcome.js';
import { PlaceNamingDiscoveryQueryService } from '../application/placeNaming/PlaceNamingDiscoveryQueryService.js';
import { queryDecentralizedWorldDiscovery } from '../application/discovery/DecentralizedWorldDiscoveryQuery.js';
import { derivePlaceNamingDiscoveryTag } from '../core/PlaceNamingDiscoveryEnvelope.js';
import { PlaceNamingDiscoveryMonitor } from '../application/placeNaming/PlaceNamingDiscoveryMonitor.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Announcement Index, Phase 1 (docs/AnnouncementIndex.md): what discovery
// finds is recorded, survives a restart, and is answered back beside the
// network through the aggregators that already exist.

const SNAPSHOT_TAG = 'forkbuild-snapshot';
const PLACE_TAG = derivePlaceNamingDiscoveryTag('world-1', 'region-1');

function snapshot(hash, extra = {}) {
    return { contentHash: hash, locator: `ar://${hash}`, storage: 'ar', ...extra };
}

function envelope({ id = 'claim-1', worldId = 'world-1', regionId = 'region-1', signature = 'sig-1' } = {}) {
    return {
        protocol: 'forkbuild-place-naming-discovery',
        version: 1,
        worldId,
        regionId,
        claim: {
            id, worldId, regionId,
            name: 'Old Oak Crossing',
            authorIdentityId: 'did:key:zAlice',
            createdAt: '2026-01-01T00:00:00.000Z',
            signature: { algorithm: 'ed25519', signer: 'did:key:zAlice', signature, signedHash: 'hash', domain: 'forkbuild.place-naming-claim' }
        }
    };
}

function indexWith({ storage = new InMemoryStorageProvider(), ...options } = {}) {
    let clock = 1000;
    const index = new AnnouncementIndex({ storage, now: () => clock, ...options });
    return { index, storage, tick: (ms = 1) => { clock += ms; } };
}

async function run() {
    // Section A: recording, keys, and survival across instances.
    {
        const { index, storage, tick } = indexWith();
        const first = index.record(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, [snapshot('a'), snapshot('b'), { junk: true }], 'nostr');
        assert(first.added === 2 && first.updated === 0, 'A1. well-formed candidates are added, junk is skipped');
        tick();
        const again = index.record(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, [snapshot('a')], 'arweave');
        assert(again.added === 0 && again.updated === 1, 'A2. the same announcement from another origin is seen again, not duplicated');

        const reopened = new AnnouncementIndex({ storage });
        const listed = reopened.list(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG);
        assert(listed.length === 2, 'A3. records survive a new index over the same storage');
        assert(listed[0].contentHash === 'a', 'A4. the most recently seen record comes first');
        assert(reopened.list(AnnouncementKind.SNAPSHOT, 'other-tag').length === 0, 'A5. tags are kept apart');
        assert(JSON.stringify(reopened.tags(AnnouncementKind.SNAPSHOT)) === JSON.stringify([SNAPSHOT_TAG]), 'A6. tags() names every tag holding records');

        listed[0].contentHash = 'mutated';
        assert(reopened.list(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG)[0].contentHash === 'a', 'A7. list() hands back copies');
        console.log('✓ Section A: records are keyed, merged across origins, and persisted');
    }

    // Section B: limits.
    {
        const { index, tick } = indexWith({ maxRecordsPerTag: 2, maxPayloadBytes: 200 });
        index.record(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, [snapshot('old')], 'nostr');
        tick();
        index.record(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, [snapshot('mid')], 'nostr');
        tick();
        index.record(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, [snapshot('new')], 'nostr');
        const hashes = index.list(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG).map((c) => c.contentHash);
        assert(JSON.stringify(hashes) === JSON.stringify(['new', 'mid']), 'B1. past the cap, the least recently seen record is removed');

        const big = index.record(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, [snapshot('x'.repeat(300))], 'nostr');
        assert(big.added === 0, 'B2. an oversized payload is refused');
        console.log('✓ Section B: per-tag cap and payload size cap');
    }

    // Section C: kind checks.
    {
        const { index } = indexWith();
        const withPosition = snapshot('p', { publicationId: 'pub-1', claimedPosition: { x: 1, y: 2, z: 3 }, extra: 'dropped' });
        index.record(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, [withPosition, snapshot('q', { publicationId: 'pub-2' })], 'nostr');
        const [p, q] = index.list(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG).sort((a, b) => a.contentHash.localeCompare(b.contentHash));
        assert(p.publicationId === 'pub-1' && p.claimedPosition.z === 3 && p.extra === undefined, 'C1. a snapshot keeps its known fields only');
        assert(q.publicationId === undefined, 'C2. publicationId without claimedPosition is dropped, as the envelope requires');

        const result = index.record(AnnouncementKind.PLACE_NAMING, PLACE_TAG, [
            JSON.stringify(envelope()),
            envelope({ signature: 'forged' }),
            envelope({ regionId: 'region-2' }),
            'not json'
        ], 'nostr');
        assert(result.added === 2, 'C3. two claims with the same id but different signatures are both kept; another region\'s claim and junk are refused');

        const leads = index.record(AnnouncementKind.PUBLICATION, 'tag', [{ uri: 'ar://x', storage: 'ar' }, { uri: '' }], 'dweb:nostr:relay');
        assert(leads.added === 1, 'C4. a publication lead needs a uri');
        let threw = false;
        try { index.record('unknown', 'tag', [{}], 'nostr'); } catch { threw = true; }
        assert(threw, 'C5. an unknown kind is a programming error');
        console.log('✓ Section C: each kind parses, keys and refuses its own way');
    }

    // Section D: RecordingDiscoverySource.
    {
        const { index } = indexWith();
        const network = {
            search: async () => [snapshot('n1')],
            searchWithOutcome: async () => ({ outcome: SnapshotCandidateDiscoveryOutcome.FOUND, candidates: [snapshot('n2')] })
        };
        const recording = new RecordingDiscoverySource(network, { index, kind: AnnouncementKind.SNAPSHOT, origin: 'nostr' });
        const results = await recording.search(SNAPSHOT_TAG);
        assert(results.length === 1 && results[0].contentHash === 'n1', 'D1. search() returns exactly what the source returned');
        await recording.searchWithOutcome(SNAPSHOT_TAG);
        assert(index.list(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG).length === 2, 'D2. both search() and searchWithOutcome() results are recorded');

        const plain = new RecordingDiscoverySource({ search: async () => [] }, { index, kind: AnnouncementKind.SNAPSHOT, origin: 'x' });
        assert(plain.searchWithOutcome === undefined, 'D3. searchWithOutcome() is only offered when the source offers it');

        const failing = new RecordingDiscoverySource({ search: async () => { throw new Error('relay down'); } }, { index, kind: AnnouncementKind.PLACE_NAMING, origin: 'nostr' });
        let rejected = false;
        try { await failing.search(PLACE_TAG); } catch { rejected = true; }
        assert(rejected, 'D4. a failing source still fails, so callers can report it');

        const brokenIndex = { record: () => { throw new Error('storage full'); } };
        const unharmed = new RecordingDiscoverySource(network, { index: brokenIndex, kind: AnnouncementKind.SNAPSHOT, origin: 'nostr' });
        assert((await unharmed.search(SNAPSHOT_TAG)).length === 1, 'D5. a failure to record never breaks the search');
        console.log('✓ Section D: recording is transparent to callers');
    }

    // Section E: the index answers through the existing Snapshot aggregator.
    {
        const { index } = indexWith();
        index.record(AnnouncementKind.SNAPSHOT, SNAPSHOT_TAG, [snapshot('seen-yesterday')], 'nostr');
        const nostr = new RecordingDiscoverySource({ search: async () => [snapshot('today')] }, { index, kind: AnnouncementKind.SNAPSHOT, origin: 'nostr' });
        const { queryService } = composeSnapshotCandidateDiscoveryRuntime({
            nostrSnapshotDiscoveryQueryService: nostr,
            announcementIndexSource: new IndexedAnnouncementSource({ index, kind: AnnouncementKind.SNAPSHOT }),
            placementCatalog: { list: () => [] }
        });
        const hashes = (await queryService.search(SNAPSHOT_TAG)).map((c) => c.contentHash).sort();
        assert(JSON.stringify(hashes) === JSON.stringify(['seen-yesterday', 'today']), 'E1. an announcement no longer on the network is still discovered');

        const offline = composeSnapshotCandidateDiscoveryRuntime({
            nostrSnapshotDiscoveryQueryService: { searchWithOutcome: async () => ({ outcome: SnapshotCandidateDiscoveryOutcome.UNAVAILABLE, candidates: [] }), search: async () => [] },
            announcementIndexSource: new IndexedAnnouncementSource({ index: indexWith().index, kind: AnnouncementKind.SNAPSHOT }),
            placementCatalog: { list: () => [] }
        }).queryService;
        const offlineOutcome = await offline.searchWithOutcome(SNAPSHOT_TAG);
        assert(offlineOutcome.outcome === SnapshotCandidateDiscoveryOutcome.EMPTY, 'E2. the local catalog still decides EMPTY vs UNAVAILABLE as before; an empty index adds no false success');
        const indexOnly = new IndexedAnnouncementSource({ index: indexWith().index, kind: AnnouncementKind.SNAPSHOT });
        assert((await indexOnly.searchWithOutcome(SNAPSHOT_TAG)).outcome === SnapshotCandidateDiscoveryOutcome.UNAVAILABLE, 'E3. an empty index reports UNAVAILABLE, never EMPTY');
        console.log('✓ Section E: Snapshot discovery returns what earlier searches found');
    }

    // Section F: Place Naming.
    {
        const { index } = indexWith();
        const nostr = new RecordingDiscoverySource({ search: async () => [JSON.stringify(envelope({ id: 'claim-old' }))] }, { index, kind: AnnouncementKind.PLACE_NAMING, origin: 'nostr' });
        await new PlaceNamingDiscoveryQueryService([nostr]).search(PLACE_TAG);

        const relayDown = { search: async () => { throw new Error('relay down'); } };
        const service = new PlaceNamingDiscoveryQueryService([relayDown, new IndexedAnnouncementSource({ index, kind: AnnouncementKind.PLACE_NAMING })]);
        const results = await service.search(PLACE_TAG);
        assert(results.length === 1 && results[0].claim.id === 'claim-old', 'F1. a claim found earlier is still discovered while every relay is down');
        console.log('✓ Section F: Place Naming discovery returns what earlier searches found');
    }

    // Section G: Publication leads keep their origin.
    {
        const { index } = indexWith();
        let online = true;
        const nostr = {
            origin: 'dweb:nostr:wss://relay.example',
            search: async () => { if (!online) throw new Error('offline'); return [{ uri: 'ar://first', storage: 'ar' }]; }
        };
        const backed = new IndexBackedPublicationDiscoveryService(nostr, { index, kind: AnnouncementKind.PUBLICATION });
        assert(backed.origin === nostr.origin, 'G1. the wrapped service keeps its origin');
        await queryDecentralizedWorldDiscovery(backed, 'pub-tag');

        online = false;
        const leads = await queryDecentralizedWorldDiscovery(backed, 'pub-tag');
        assert(leads.length === 1 && leads[0].uri === 'ar://first' && leads[0].origin === nostr.origin, 'G2. offline, the lead seen before comes back under its own origin');

        const other = new IndexBackedPublicationDiscoveryService({ origin: 'dweb:arweave', search: async () => [] }, { index, kind: AnnouncementKind.PUBLICATION });
        assert((await other.search('pub-tag')).length === 0, 'G3. another origin never receives that lead');

        online = true;
        const merged = await backed.search('pub-tag');
        assert(merged.length === 1, 'G4. a lead found both now and before is returned once');
        console.log('✓ Section G: Publication leads are kept per origin');
    }

    // Section H: Phase 2, World View shows indexed Place Naming claims before
    // the network answers, and the network answer then replaces them.
    {
        const { index } = indexWith();
        index.record(AnnouncementKind.PLACE_NAMING, PLACE_TAG, [envelope({ id: 'claim-saved' })], 'nostr');
        const indexedOnly = new PlaceNamingDiscoveryQueryService([new IndexedAnnouncementSource({ index, kind: AnnouncementKind.PLACE_NAMING })]);

        let answerNetwork;
        const monitor = new PlaceNamingDiscoveryMonitor({
            discoverPlaceNamingClaimsCommand: () => new Promise((resolve) => { answerNetwork = resolve; }),
            resolveClaimPosition: () => ({ x: 0, z: 0 })
        });
        const here = { x: 0, z: 0 };
        const observing = monitor.observe(here);
        assert(monitor.seed(here, await indexedOnly.search(PLACE_TAG)) === true, 'H1. seed() fills an empty result');
        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].claim.id === 'claim-saved', 'H2. the indexed claim is shown before the network answers');

        answerNetwork([envelope({ id: 'claim-network' })]);
        await observing;
        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].claim.id === 'claim-network', 'H3. the network answer replaces the seeded result');
        assert(monitor.seed(here, [envelope({ id: 'late' })]) === false, 'H4. a late seed never overwrites a network answer');

        const far = new PlaceNamingDiscoveryMonitor({ resolveClaimPosition: () => ({ x: 5000, z: 5000 }) });
        far.seed(here, [envelope()]);
        assert(far.lastResult.length === 0, 'H5. seeded claims still go through the same nearby filter');
        console.log('✓ Section H: indexed Place Naming claims show first, then give way to the network');
    }

    console.log('\nAll AnnouncementIndex tests passed.');
}

await run().catch((error) => {
    console.error('AnnouncementIndex.test.js FAILED:', error);
    process.exitCode = 1;
});
