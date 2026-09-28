import { LocalContentStore } from '../content/LocalContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { SnapshotPlacementStoreRegistry } from '../application/snapshot/placement/SnapshotPlacementStoreRegistry.js';
import { DecentralizedSnapshotResolver } from '../application/snapshot/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { executeResolveSelectedSnapshotCommand } from '../application/snapshot/ResolveSelectedSnapshotCommand.js';
import { executeDiscoverSnapshotCommand } from '../application/snapshot/DiscoverSnapshotCommand.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/snapshot/materialization/StoreSnapshotContentOutcome.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// A Snapshot whose bytes this device already holds is resolved from its own
// content store, without asking the network; anything wrong with the local
// copy falls through to the network as before.

const BYTES = JSON.stringify({ snapshot: 'a build someone announced', bricks: [1, 2, 3] });
const HASH = computeContentHash(BYTES);

// A network store for storage 'ar' that counts its reads.
function makeNetworkStore(serve = BYTES) {
    const store = {
        storage: 'ar',
        reads: 0,
        async get() { store.reads += 1; return serve; },
        async put() { throw new Error('not used'); }
    };
    return store;
}

function makeScenario({ serve = BYTES, discovered = null } = {}) {
    const network = makeNetworkStore(serve);
    const storeRegistry = new SnapshotPlacementStoreRegistry().register(network);
    const local = new LocalContentStore(new InMemoryStorageProvider());
    const candidate = { contentHash: HASH, locator: 'ar://tx-1', storage: 'ar' };
    const resolver = new DecentralizedSnapshotResolver({ search: async () => discovered || [candidate] });
    return { network, storeRegistry, local, candidate, resolver };
}

async function run() {
    // Section A: a local hit skips the network.
    {
        const { network, storeRegistry, local, candidate, resolver } = makeScenario();
        local.put(BYTES);
        const result = await resolver.resolveCandidate(candidate, { storeRegistry, localContentStore: local });
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'A1. resolved from the local store');
        assert(result.bytes === BYTES, 'A2. the local bytes are returned');
        assert(network.reads === 0, 'A3. the network store is never read');
        assert(result.locator === candidate.locator && result.storage === 'ar' && result.candidates[0] === candidate,
            'A4. the result still names the candidate handed in');

        const noNetwork = await resolver.resolveCandidate(candidate, { localContentStore: local });
        assert(noNetwork.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED, 'A5. a local hit needs no network store at all');
        console.log('✓ Section A: a local hit skips the network');
    }

    // Section B: a local miss goes to the network, as before.
    {
        const { network, storeRegistry, local, candidate, resolver } = makeScenario();
        const result = await resolver.resolveCandidate(candidate, { storeRegistry, localContentStore: local });
        assert(result.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && network.reads === 1, 'B1. fetched from the network');

        const withoutLocal = await resolver.resolveCandidate(candidate, { storeRegistry });
        assert(withoutLocal.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && network.reads === 2, 'B2. no local store: the network, unchanged');

        const noStore = await resolver.resolveCandidate(candidate, { localContentStore: local });
        assert(noStore.outcome === DecentralizedSnapshotResolutionOutcome.STORE_UNAVAILABLE, 'B3. a miss with no network store is still STORE_UNAVAILABLE');
        console.log('✓ Section B: a local miss goes to the network');
    }

    // Section C: a bad local copy is never trusted and never blocks the network.
    {
        const { network, storeRegistry, candidate, resolver } = makeScenario();
        const corrupt = {
            has: () => true,
            get: async () => 'not the announced bytes'
        };
        const mismatch = await resolver.resolveCandidate(candidate, { storeRegistry, localContentStore: corrupt });
        assert(mismatch.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && mismatch.bytes === BYTES && network.reads === 1,
            'C1. local bytes that do not verify fall through to the network');

        const failing = { has: () => true, get: async () => { throw new Error('disk read failed'); } };
        const failed = await resolver.resolveCandidate(candidate, { storeRegistry, localContentStore: failing });
        assert(failed.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && network.reads === 2, 'C2. a failing local read falls through');

        const throwingHas = { has: () => { throw new Error('boom'); }, get: async () => BYTES };
        const threw = await resolver.resolveCandidate(candidate, { storeRegistry, localContentStore: throwingHas });
        assert(threw.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && network.reads === 3, 'C3. a throwing has() falls through');

        const vanished = { has: () => true, get: async () => null };
        await resolver.resolveCandidate(candidate, { storeRegistry, localContentStore: vanished });
        assert(network.reads === 4, 'C4. an entry gone between has() and get() falls through');

        const bad = makeScenario({ serve: 'wrong bytes' });
        const badResult = await bad.resolver.resolveCandidate(bad.candidate, { storeRegistry: bad.storeRegistry, localContentStore: corrupt });
        assert(badResult.outcome === DecentralizedSnapshotResolutionOutcome.CONTENT_HASH_MISMATCH,
            'C5. when both copies are wrong, the network\'s mismatch is reported');
        console.log('✓ Section C: a bad local copy is never trusted');
    }

    // Section D: both commands forward the local store; resolve() uses it too.
    {
        const { network, storeRegistry, local, resolver } = makeScenario();
        local.put(BYTES);
        const selected = await executeResolveSelectedSnapshotCommand({
            candidate: { contentHash: HASH, locator: 'ar://tx-1', storage: 'ar' }, resolver, storeRegistry, localContentStore: local
        });
        assert(selected.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && network.reads === 0, 'D1. the selected-candidate command reads locally');

        const discovered = await executeDiscoverSnapshotCommand({
            discoveryTag: 'forkbuild-snapshot', contentHash: HASH, resolver, storeRegistry, localContentStore: local
        });
        assert(discovered.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && network.reads === 0, 'D2. the discover command reads locally');
        console.log('✓ Section D: both commands read locally');
    }

    // Section E: once fetched and stored, a Snapshot is never fetched again.
    {
        const { network, storeRegistry, local, candidate, resolver } = makeScenario();
        const storeUseCase = new StoreSnapshotContentUseCase(local);
        const first = await resolver.resolveCandidate(candidate, { storeRegistry, localContentStore: local });
        const stored = await storeUseCase.execute({ contentHash: HASH, bytes: first.bytes });
        assert(stored.outcome === StoreSnapshotContentOutcome.STORED && network.reads === 1, 'E1. the first visit fetches and stores');

        const second = await resolver.resolveCandidate(candidate, { storeRegistry, localContentStore: local });
        assert(second.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && network.reads === 1, 'E2. the next visit reads the stored copy');
        const again = await storeUseCase.execute({ contentHash: HASH, bytes: second.bytes });
        assert(again.outcome === StoreSnapshotContentOutcome.ALREADY_AVAILABLE, 'E3. and storing it reports ALREADY_AVAILABLE');
        console.log('✓ Section E: fetched once, never again');
    }

    console.log('\nAll LocalFirstSnapshotResolution tests passed.');
}

await run().catch((error) => {
    console.error('LocalFirstSnapshotResolution.test.js FAILED:', error);
    process.exitCode = 1;
});
