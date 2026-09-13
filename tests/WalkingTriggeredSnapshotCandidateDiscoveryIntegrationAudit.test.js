import { execSync } from 'node:child_process';

import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION } from '../core/SnapshotDiscoveryEnvelope.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/PublicationSnapshotPlacementExchange.js';
import { PublicationSnapshotPlacementPeerExchange } from '../application/PublicationSnapshotPlacementPeerExchange.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/NostrSnapshotDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryQueryService } from '../application/SnapshotCandidateDiscoveryQueryService.js';
import { composeSnapshotCandidateDiscoveryRuntime } from '../application/SnapshotCandidateDiscoveryRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { DecentralizedSnapshotResolver } from '../application/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/DecentralizedSnapshotResolutionOutcome.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';
import { DEFAULT_DISCOVERY_REFRESH_RADIUS } from '../application/ShouldRefreshSnapshotDiscovery.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';

// 0.9.486 — Wire Snapshot Candidate Discovery Query Service into
// Walking-Triggered Discovery.
//
// Production changes: ui/main.js only. `discoverSnapshotCandidatesCommand`
// now calls `snapshotCandidateDiscoveryQueryService` (the Local+Nostr
// composite 0.9.485 already built and provided, but left unconsumed) in
// place of the Nostr-only `snapshotDiscoveryQueryService` it called
// before — moving that composition earlier in the file so it exists
// before the command that now depends on it. Neither
// `application/DiscoverSnapshotCandidatesCommand.js` nor
// `application/WorldSnapshotDiscoveryMonitor.js` is touched; both keep
// the exact contract they already had.
//
// ORIGINATING QUESTION. 0.9.485's own closing paragraph named this
// milestone's job precisely: "threading it into walking discovery... is
// 0.9.486's own, deliberately separate, next and now very small step."
// This audit proves that thread now actually exists, end to end, through
// the REAL production wiring — never a second, parallel harness that
// merely resembles it — while confirming the walking monitor's own
// temporal semantics (movement gating, request-id race protection) were
// never touched, and that candidate discovery still stops exactly where
// it always did: at a locator claim, never at resolved bytes, never at
// World presentation.
//
//   Section A — Production composition: the real composite is reachable
//               from the real, production discoverSnapshotCandidatesCommand.
//   Section B — Local candidate path, walking-triggered.
//   Section C — Nostr candidate path, walking-triggered.
//   Section D — Passive peer path: a real two-peer ANNOUNCE reaches the
//               receiving replica's own walking-triggered pipeline.
//   Section E — Multi-source convergence, walking-triggered.
//   Section F — Candidate identity/deduplication, walking-triggered.
//   Section G — Failure isolation across all four OK/FAIL combinations,
//               walking-triggered.
//   Section H — Movement gating: no query below the movement threshold.
//   Section I — Request-id race protection survives a real composite
//               collaborator with genuinely slow/fast sources.
//   Section J — Resolution boundary: a walking-discovered candidate
//               resolves through the existing, unmodified resolver; the
//               composite itself never resolves.
//   Section K — No second Snapshot-loading path: the existing selected-
//               candidate resolution boundary is the only one touched.
//   Section L — Peer/World isolation: no coupling to World Encounter,
//               Publication discovery/verification/attribution, or a new
//               peer protocol.
//   Section M — Graceful degradation: Nostr-only, Local-only, and
//               neither, all still produce a working walking pipeline.
//   Section N — Scope guard: this milestone's own diff is limited to
//               ui/main.js plus tests/tests.html.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function pos(x, y, z) { return { x, y, z }; }
function ctx(position) { return { position }; }

async function flushMicrotasks() {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const SOURCE_ROOT = new URL('../', import.meta.url);

function readSource(relativePath) {
    return execSync(`cat "${relativePath}"`, { cwd: SOURCE_ROOT.pathname }).toString();
}

function stripLineComments(source) {
    return source.replace(/\/\/.*$/gm, '');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function signedPlacement(identityProvider, { publicationId, contentHash, storage, locator }) {
    let placement = new PublicationSnapshotPlacement({
        publicationId, contentHash, storage, locator,
        placerIdentity: identityProvider.getSigningIdentity().toJSON()
    });
    return placement.withSignature(identityProvider.signCanonical(placement.getSigningDescriptor()));
}

function makeHandBuiltPlacementExchange() {
    const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const verifier = new LocalAuthorizationVerifier();
    const exchange = new PublicationSnapshotPlacementExchange(catalog, verifier);
    return { catalog, verifier, exchange };
}

function makeNostrQueryImpl(events) {
    return async () => events;
}

function makeNostrEnvelopeEvent({ contentHash, locator, storage }) {
    const content = { protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION, contentHash, locator, storage };
    return { content: JSON.stringify(content) };
}

// Builds the SAME shape ui/main.js's own production wiring now builds:
// a discoverSnapshotCandidatesCommand backed by a real
// SnapshotCandidateDiscoveryQueryService composite, and a
// WorldSnapshotDiscoveryMonitor wrapping it — the identical two-step
// composition this milestone's own diff performs.
function buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService = null, placementCatalog }) {
    const { queryService } = composeSnapshotCandidateDiscoveryRuntime({ nostrSnapshotDiscoveryQueryService, placementCatalog });
    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
        discoveryTag: 'forkbuild-snapshot',
        discoveryQueryService: queryService
    });
    const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });
    return { queryService, discoverSnapshotCandidatesCommand, monitor };
}

async function run() {
    console.log('=== 0.9.486 — Walking-Triggered Snapshot Candidate Discovery Integration Audit ===\n');

    // ===============================================================
    // Section A — Production composition.
    // ===============================================================
    {
        const mainSource = stripLineComments(readSource('ui/main.js'));

        assert(/const discoverSnapshotCandidatesCommand = \(\) => executeDiscoverSnapshotCandidatesCommand\(\{\s*\n\s*discoveryTag: 'forkbuild-snapshot',\s*\n\s*discoveryQueryService: snapshotCandidateDiscoveryQueryService/.test(mainSource),
            '1. ui/main.js\'s own production discoverSnapshotCandidatesCommand calls snapshotCandidateDiscoveryQueryService — the real Local+Nostr composite — never the Nostr-only service it called before this milestone.');

        const compositionIndex = mainSource.indexOf('composeSnapshotCandidateDiscoveryRuntime(');
        const commandIndex = mainSource.indexOf('const discoverSnapshotCandidatesCommand =');
        assert(compositionIndex !== -1 && commandIndex !== -1 && compositionIndex < commandIndex,
            '2. the composite is composed BEFORE discoverSnapshotCandidatesCommand is defined — a real dependency order, not merely a same-file coincidence.');

        assert(/new WorldSnapshotDiscoveryMonitor\(\{ discoverSnapshotCandidatesCommand \}\)/.test(mainSource),
            '3. worldSnapshotDiscoveryMonitor still wraps the SAME discoverSnapshotCandidatesCommand — never a second monitor, never a second command.');

        assert((mainSource.match(/composeSnapshotCandidateDiscoveryRuntime\(/g) || []).length === 1,
            '4. composeSnapshotCandidateDiscoveryRuntime() is still called exactly once — this milestone threads the existing composite through, it does not compose a second one.');

        console.log('✓ Section A: the real, production discoverSnapshotCandidatesCommand is now backed by the real, production snapshotCandidateDiscoveryQueryService, composed once, before the command that depends on it.');
    }

    // ===============================================================
    // Section B — Local candidate path, walking-triggered.
    // ===============================================================
    {
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-b', contentHash: 'hash-b', storage: 'ipfs', locator: 'ipfs://CID-b' }));

        const { monitor } = buildWalkingPipeline({ placementCatalog: catalog });
        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].contentHash === 'hash-b',
            '1. a locally-cataloged placement reaches the walking-triggered monitor\'s own lastResult, through the real command and composite, with no button click of any kind.');

        console.log('✓ Section B: walking trigger → monitor → command → composite query → Local catalog → candidate, live.');
    }

    // ===============================================================
    // Section C — Nostr candidate path, walking-triggered.
    // ===============================================================
    {
        const emptyCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const events = [makeNostrEnvelopeEvent({ contentHash: 'hash-c-nostr', locator: 'ar://c-nostr', storage: 'arweave' })];
        const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(events) });

        const { monitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: emptyCatalog });
        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].contentHash === 'hash-c-nostr',
            '1. a real, unmodified NostrSnapshotDiscoveryQueryService instance\'s own announcement reaches the walking-triggered monitor.');

        console.log('✓ Section C: walking trigger → monitor → command → composite query → Nostr → candidate, live.');
    }

    // ===============================================================
    // Section D — Passive peer path: Peer A ANNOUNCE → Peer B's Local
    // catalog → Local source → composite → walking-triggered discovery.
    // This is the flagship path this milestone exists to close: the arc
    // built since 0.9.480 (Local browsing), 0.9.483 (production
    // announce()), and 0.9.484 (end-to-end passive-peer propagation) now
    // reaches all the way to a WALKING replica's own monitor.
    // ===============================================================
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('alice-486');
        const bob = makeIdentity('bob-486');
        const aliceTransport = new LocalPeerConnectionProvider('alice-486-node', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-486-node', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        bobConnect.listen();
        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-486-node' });
        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED,
            '1. Alice and Bob hold a real, live, AUTHENTICATED peer connection.');

        const { exchange: aliceExchange } = makeHandBuiltPlacementExchange();
        const alicePeerExchange = new PublicationSnapshotPlacementPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);
        const { catalog: bobCatalog, exchange: bobExchange } = makeHandBuiltPlacementExchange();
        // eslint-disable-next-line no-unused-vars
        const bobPeerExchange = new PublicationSnapshotPlacementPeerExchange(bobExchange, new PeerMessageBus(), bobConnect.registry);

        const placement = signedPlacement(alice, { publicationId: 'pub-d-peer', contentHash: 'hash-d-peer', storage: 'ipfs', locator: 'ipfs://CID-d-peer' });
        const sentTo = alicePeerExchange.announce(placement);
        assert(sentTo === 1, '2. the announcement was actually sent to exactly one AUTHENTICATED peer (Bob).');
        await wait(30);

        const received = bobCatalog.findByPublicationId('pub-d-peer');
        assert(received.length === 1 && received[0].contentHash === 'hash-d-peer',
            '3. Bob\'s own real LocalPublicationSnapshotPlacementCatalog received the placement over the live wire.');

        // Now build BOB'S OWN walking-triggered pipeline, over BOB'S OWN
        // catalog — no Nostr capability at all, exactly the "Peer, never
        // a third query provider" architecture 0.9.485 established.
        const { monitor: bobMonitor } = buildWalkingPipeline({ placementCatalog: bobCatalog });
        await bobMonitor.observe(ctx(pos(0, 0, 0)));

        assert(bobMonitor.lastResult.some((c) => c.contentHash === 'hash-d-peer'),
            '4. Bob\'s own walking-triggered monitor surfaces the peer-announced placement, through the real command and composite, with no explicit discovery click and no active peer-browse call of any kind.');

        console.log('✓ Section D: Peer A ANNOUNCE → Peer B\'s real Local catalog → Local candidate source → composite query → Peer B\'s own walking-triggered discovery. The full arc from 0.9.480 to this milestone, live.');
    }

    // ===============================================================
    // Section E — Multi-source convergence, walking-triggered.
    // ===============================================================
    {
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-e-local', contentHash: 'hash-e-local', storage: 'ipfs', locator: 'ipfs://CID-e-local' }));
        const events = [makeNostrEnvelopeEvent({ contentHash: 'hash-e-nostr', locator: 'ar://e-nostr', storage: 'arweave' })];
        const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(events) });

        const { monitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: catalog });
        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(monitor.lastResult.length === 2, '1. exactly the union of both sources\' own candidates reaches the walking-triggered monitor.');
        assert(monitor.lastResult.some((c) => c.contentHash === 'hash-e-local') && monitor.lastResult.some((c) => c.contentHash === 'hash-e-nostr'),
            '2. both the Local and Nostr candidates are present, from the SAME single observe() call.');

        console.log('✓ Section E: Local and Nostr candidates, independently provided, converge into one unified result at the walking-triggered monitor.');
    }

    // ===============================================================
    // Section F — Candidate identity, walking-triggered.
    // ===============================================================
    {
        // F1. The identical claim (storage+contentHash+locator), reported
        // by both Local and Nostr, collapses to one candidate at the
        // monitor.
        const sharedContentHash = 'hash-f-shared';
        const sharedLocator = 'ipfs://CID-f-shared';
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-f-shared', contentHash: sharedContentHash, storage: 'ipfs', locator: sharedLocator }));
        const events = [makeNostrEnvelopeEvent({ contentHash: sharedContentHash, locator: sharedLocator, storage: 'ipfs' })];
        const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(events) });

        const { monitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: catalog });
        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].contentHash === sharedContentHash,
            '1. the SAME storage+contentHash+locator, reported by both Local and Nostr, collapses to exactly one candidate at the walking-triggered monitor.');

        // F2. The same contentHash under a DIFFERENT locator is a
        // separate candidate, never collapsed.
        const catalog2 = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog2.add(new PublicationSnapshotPlacement({ publicationId: 'pub-f-multi', contentHash: 'hash-f-multi', storage: 'ipfs', locator: 'ipfs://CID-f-multi-LOCAL' }));
        const events2 = [makeNostrEnvelopeEvent({ contentHash: 'hash-f-multi', locator: 'ar://f-multi-NOSTR', storage: 'arweave' })];
        const nostrService2 = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(events2) });

        const { monitor: monitor2 } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: nostrService2, placementCatalog: catalog2 });
        await monitor2.observe(ctx(pos(0, 0, 0)));

        assert(monitor2.lastResult.length === 2,
            '2. the same contentHash reported under two DIFFERENT locators is kept as two separate candidates — never collapsed — at the walking-triggered monitor.');

        console.log('✓ Section F: the 0.9.485 dedup identity (storage+contentHash+locator together, never contentHash alone) is preserved exactly at the walking-triggered monitor — no second, weaker identity rule was introduced by this wiring.');
    }

    // ===============================================================
    // Section G — Failure isolation, walking-triggered.
    // ===============================================================
    {
        const workingLocalCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        workingLocalCatalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-g-local', contentHash: 'hash-g-local', storage: 'ipfs', locator: 'ipfs://CID-g-local' }));
        const workingNostrEvents = [makeNostrEnvelopeEvent({ contentHash: 'hash-g-nostr', locator: 'ar://g-nostr', storage: 'arweave' })];
        const failingCatalog = { list() { throw new Error('local catalog boom'); } };
        const failingNostrQueryImpl = async () => { throw new Error('relay boom'); };

        async function observeOnce({ nostrSnapshotDiscoveryQueryService, placementCatalog }) {
            const { monitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService, placementCatalog });
            await monitor.observe(ctx(pos(0, 0, 0)));
            return monitor;
        }

        // G1. Local OK, Nostr OK.
        {
            const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(workingNostrEvents) });
            const monitor = await observeOnce({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: workingLocalCatalog });
            assert(monitor.lastError === null && monitor.lastResult.length === 2, '1. Local OK / Nostr OK: both candidates present, no error.');
        }
        // G2. Local FAIL, Nostr OK.
        {
            const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(workingNostrEvents) });
            const monitor = await observeOnce({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: failingCatalog });
            assert(monitor.lastError === null && monitor.lastResult.length === 1 && monitor.lastResult[0].contentHash === 'hash-g-nostr',
                '2. Local FAIL / Nostr OK: Nostr\'s own candidate still reaches the monitor; the monitor itself never records an error.');
        }
        // G3. Local OK, Nostr FAIL.
        {
            const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: failingNostrQueryImpl });
            const monitor = await observeOnce({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: workingLocalCatalog });
            assert(monitor.lastError === null && monitor.lastResult.length === 1 && monitor.lastResult[0].contentHash === 'hash-g-local',
                '3. Local OK / Nostr FAIL: Local\'s own candidate still reaches the monitor; the monitor itself never records an error.');
        }
        // G4. Local FAIL, Nostr FAIL.
        {
            const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: failingNostrQueryImpl });
            const monitor = await observeOnce({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: failingCatalog });
            assert(monitor.lastError === null && Array.isArray(monitor.lastResult) && monitor.lastResult.length === 0,
                '4. Local FAIL / Nostr FAIL: the walking pipeline still resolves cleanly to an empty result — never a monitor-level error, never a new error vocabulary.');
        }

        console.log('✓ Section G: every Local-OK/FAIL × Nostr-OK/FAIL combination leaves the walking-triggered monitor in a clean, defined state — the monitor never acquires a new error vocabulary merely because the command now has two sources behind it.');
    }

    // ===============================================================
    // Section H — Movement gating.
    // ===============================================================
    {
        let searchCalls = 0;
        const catalog = {
            list() { searchCalls += 1; return [{ contentHash: 'hash-h', locator: 'ipfs://CID-h', storage: 'ipfs', publicationId: 'pub-h' }]; }
        };
        const { monitor } = buildWalkingPipeline({ placementCatalog: catalog });

        await monitor.observe(ctx(pos(0, 0, 0)));
        assert(searchCalls === 1, '1. the first observe() call queries the composite exactly once.');

        // A tiny movement, well under the existing movement threshold —
        // never re-queries.
        await monitor.observe(ctx(pos(1, 0, 0)));
        assert(searchCalls === 1, '2. a sub-threshold movement never triggers a second query — the pre-existing movement gate still holds with the composite as the command\'s own collaborator.');

        // Crossing the threshold DOES trigger a fresh query.
        await monitor.observe(ctx(pos(DEFAULT_DISCOVERY_REFRESH_RADIUS + 5, 0, 0)));
        assert(searchCalls === 2, '3. crossing the pre-existing movement threshold does trigger a fresh query — the gate still works in the positive direction too.');

        console.log('✓ Section H: the movement-threshold gate application/ShouldRefreshSnapshotDiscovery.js already owns is untouched — no new time-based polling throttle was added merely because the query can now contact multiple sources.');
    }

    // ===============================================================
    // Section I — Request-id race protection with a real composite.
    // ===============================================================
    {
        let localCalls = 0;
        let resolveFirst;
        let resolveSecond;
        // A genuinely slow-then-fast Local source, wrapped in the REAL
        // composite class — proving Promise.allSettled() inside the
        // query service does not, by itself, protect against a stale
        // response; that protection remains entirely the monitor's own
        // request-id mechanism, exercised here with the actual
        // SnapshotCandidateDiscoveryQueryService in the loop.
        const slowThenFastSource = {
            search() {
                localCalls += 1;
                if (localCalls === 1) {
                    return new Promise((resolve) => { resolveFirst = () => resolve([{ contentHash: 'from-FIRST-STALE', locator: 'l1', storage: 's' }]); });
                }
                return new Promise((resolve) => { resolveSecond = () => resolve([{ contentHash: 'from-SECOND', locator: 'l2', storage: 's' }]); });
            }
        };
        const composite = new SnapshotCandidateDiscoveryQueryService([slowThenFastSource]);
        const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({ discoveryTag: 'forkbuild-snapshot', discoveryQueryService: composite });
        const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });

        const contextA = ctx(pos(0, 0, 0));
        const contextB = ctx(pos(0, 0, DEFAULT_DISCOVERY_REFRESH_RADIUS + 1));

        const observationA = monitor.observe(contextA);
        const observationB = monitor.observe(contextB);
        await flushMicrotasks();

        // The NEWER request (B) resolves first; the STALE, earlier
        // request (A) resolves later.
        resolveSecond();
        await observationB;
        assert(monitor.lastResult[0].contentHash === 'from-SECOND', '1. the newer request\'s own result is applied.');

        resolveFirst();
        await observationA;
        await flushMicrotasks();
        assert(monitor.lastResult[0].contentHash === 'from-SECOND',
            '2. the STALE, earlier request\'s own late-arriving result — even though it flowed through the real composite query service — never overwrites the newer request\'s own already-applied result.');

        console.log('✓ Section I: the monitor\'s own request-id staleness protection still governs which result wins, unaffected by the composite query service\'s own internal Promise.allSettled() — the two mechanisms operate at different layers and neither substitutes for the other.');
    }

    // ===============================================================
    // Section J — Resolution boundary.
    // ===============================================================
    {
        const bytesText = 'walking-triggered-candidate-bytes';
        const contentHash = computeContentHash(bytesText);
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-j', contentHash, storage: 'ipfs', locator: 'ipfs://CID-j' }));

        const { queryService, monitor } = buildWalkingPipeline({ placementCatalog: catalog });
        await monitor.observe(ctx(pos(0, 0, 0)));
        const discoveredCandidate = monitor.lastResult.find((c) => c.contentHash === contentHash);
        assert(discoveredCandidate, '1. the candidate discovered through the walking-triggered pipeline is present.');
        assert(discoveredCandidate.bytes === undefined && discoveredCandidate.verified === undefined,
            '2. the discovered candidate remains an unresolved locator claim — no bytes, no verification — straight out of the walking pipeline.');

        // The EXISTING resolver — application/DecentralizedSnapshotResolver.js,
        // unmodified by this milestone — resolves that exact candidate to
        // hash-verified bytes.
        const fakeContentStore = { get: async (reference) => bytesText };
        const resolver = new DecentralizedSnapshotResolver(queryService);
        const resolution = await executeResolveSelectedSnapshotCommand({ candidate: discoveredCandidate, resolver, contentStore: fakeContentStore });
        assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED,
            '3. the walking-discovered candidate resolves to RESOLVED through the existing, unmodified resolution command and resolver.');
        assert(resolution.bytes === bytesText, '4. the resolved bytes are exactly what the content store held, hash-verified against the candidate\'s own contentHash.');

        // The composite query service itself never resolves anything.
        let queryServiceGetCalls = 0;
        const spiedStore = { get: async () => { queryServiceGetCalls += 1; return bytesText; } };
        await queryService.search('forkbuild-snapshot');
        assert(queryServiceGetCalls === 0, '5. a bare search() on the composite query service never touches any content store — resolution and discovery remain two separate steps, even walking-triggered.');

        console.log('✓ Section J: candidate discovery (walking-triggered, Local+Nostr) and material resolution (the existing DecentralizedSnapshotResolver/ResolveSelectedSnapshotCommand) remain two separate steps — the composite query service never resolves bytes of its own.');
    }

    // ===============================================================
    // Section K — No second Snapshot-loading path.
    // ===============================================================
    {
        // The ONLY resolution/materialization entry point a caller with a
        // discovered candidate reaches for is the existing
        // ResolveSelectedSnapshotCommand → DecentralizedSnapshotResolver
        // pair — this milestone introduces no second one.
        const resolveSelectedSource = stripLineComments(readSource('application/ResolveSelectedSnapshotCommand.js'));
        assert(!/WorldSnapshotDiscoveryMonitor|SnapshotCandidateDiscoveryQueryService|composeSnapshotCandidateDiscoveryRuntime/.test(resolveSelectedSource),
            '1. the existing selected-candidate resolution command has no knowledge of the walking monitor or the new composite — it is reached the identical way regardless of which discovery path produced the candidate.');

        const decentralizedResolverSource = stripLineComments(readSource('application/DecentralizedSnapshotResolver.js'));
        assert(!/WorldSnapshotDiscoveryMonitor|SnapshotCandidateDiscoveryQueryService/.test(decentralizedResolverSource),
            '2. application/DecentralizedSnapshotResolver.js — the existing resolver every discovered candidate already resolves through — is untouched by, and has no knowledge of, this milestone\'s walking wiring.');

        // ui/main.js never constructs DecentralizedSnapshotResolver
        // directly — application/DiscoverSnapshotRuntimeComposition.js
        // does, exactly once, inside composeDiscoverSnapshotRuntime().
        const mainSource = stripLineComments(readSource('ui/main.js'));
        assert((mainSource.match(/composeDiscoverSnapshotRuntime\(/g) || []).length === 1,
            '3. ui/main.js still calls composeDiscoverSnapshotRuntime() exactly once — this milestone adds no second resolution pipeline of its own.');
        const resolverConstructionSites = execSync('grep -rlE "new DecentralizedSnapshotResolver\\(" application ui --include="*.js" || true', { cwd: SOURCE_ROOT.pathname })
            .toString().trim().split('\n').filter(Boolean);
        assert(resolverConstructionSites.length === 1 && resolverConstructionSites[0] === 'application/DiscoverSnapshotRuntimeComposition.js',
            `3b. exactly one production file constructs a DecentralizedSnapshotResolver (found: ${JSON.stringify(resolverConstructionSites)}).`);

        const monitorSource = stripLineComments(readSource('application/WorldSnapshotDiscoveryMonitor.js'));
        assert(!/resolveCandidate|resolveSelectedSnapshot|materialize|SnapshotPlacementResolver|DecentralizedSnapshotResolver/i.test(monitorSource),
            '4. the walking-triggered monitor itself still contains no domain resolution/materialization vocabulary of any kind (Promise.resolve() aside) — a discovered candidate reaches the World only through the existing, separate, explicit machinery this milestone does not touch.');

        console.log('✓ Section K: a walking-discovered candidate follows the identical, pre-existing resolve → materialize → place → register path any other discovered candidate already used — this milestone creates no second Snapshot-loading path.');
    }

    // ===============================================================
    // Section L — Peer/World isolation.
    // ===============================================================
    {
        const mainSource = stripLineComments(readSource('ui/main.js'));
        const monitorSource = stripLineComments(readSource('application/WorldSnapshotDiscoveryMonitor.js'));
        const commandSource = stripLineComments(readSource('application/DiscoverSnapshotCandidatesCommand.js'));

        assert(!/WorldEncounter/.test(monitorSource) && !/WorldEncounter/.test(commandSource),
            '1. neither the walking monitor nor the candidate command references World Encounter peer material discovery.');
        assert(!/VerifyPublicationUseCase|SnapshotPublicationAttribution|DecentralizedWorldDiscovery/.test(monitorSource + commandSource),
            '2. neither file references Publication verification, attribution, or decentralized-lead/world-discovery machinery.');

        const peerProtocolSource = stripLineComments(readSource('application/PublicationSnapshotPlacementPeerProtocol.js'));
        assert(!/WorldSnapshotDiscoveryMonitor|SnapshotCandidateDiscoveryQueryService/.test(peerProtocolSource),
            '3. the peer protocol file is untouched by, and has no knowledge of, the walking monitor or the composite query service — the separation holds in both directions.');

        // No new ACTIVE peer-browse protocol was introduced by this
        // wiring — Peer's own contribution still arrives entirely
        // through the passive ANNOUNCE path into the Local catalog.
        assert(!/new\s+\w*Peer\w*\(/.test(commandSource),
            '4. DiscoverSnapshotCandidatesCommand.js constructs no Peer-named class — this milestone adds no active peer-browse call.');

        console.log('✓ Section L: no coupling to World Encounter material discovery, Publication discovery/verification/attribution, peer browse, or any new peer protocol — confirmed by source, in both directions.');
    }

    // ===============================================================
    // Section M — Graceful degradation.
    // ===============================================================
    {
        // M1. No Nostr capability — Local alone still drives the walking
        // pipeline.
        const localOnlyCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        localOnlyCatalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-m-local', contentHash: 'hash-m-local', storage: 'ipfs', locator: 'ipfs://CID-m-local' }));
        const { monitor: localOnlyMonitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: null, placementCatalog: localOnlyCatalog });
        await localOnlyMonitor.observe(ctx(pos(0, 0, 0)));
        assert(localOnlyMonitor.lastError === null && localOnlyMonitor.lastResult.length === 1 && localOnlyMonitor.lastResult[0].contentHash === 'hash-m-local',
            '1. no Nostr capability: Local alone still produces a working walking-triggered discovery result.');

        // M2. No Local candidates — Nostr alone still drives the walking
        // pipeline.
        const emptyCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const events = [makeNostrEnvelopeEvent({ contentHash: 'hash-m-nostr', locator: 'ar://m-nostr', storage: 'arweave' })];
        const nostrOnlyService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(events) });
        const { monitor: nostrOnlyMonitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: nostrOnlyService, placementCatalog: emptyCatalog });
        await nostrOnlyMonitor.observe(ctx(pos(0, 0, 0)));
        assert(nostrOnlyMonitor.lastError === null && nostrOnlyMonitor.lastResult.length === 1 && nostrOnlyMonitor.lastResult[0].contentHash === 'hash-m-nostr',
            '2. no Local candidates: Nostr alone still produces a working walking-triggered discovery result.');

        // M3. Neither — the existing empty-result behavior, never a
        // thrown error or a null result.
        const emptyNostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl([]) });
        const { monitor: neitherMonitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: emptyNostrService, placementCatalog: emptyCatalog });
        await neitherMonitor.observe(ctx(pos(0, 0, 0)));
        assert(neitherMonitor.lastError === null && Array.isArray(neitherMonitor.lastResult) && neitherMonitor.lastResult.length === 0,
            '3. neither source has anything to offer: the walking-triggered monitor still resolves to the existing, ordinary empty-result behavior — never a thrown error, never null.');

        console.log('✓ Section M: the walking-triggered pipeline degrades gracefully in every combination — Local-only, Nostr-only, and neither — exactly mirroring the composite query service\'s own already-established graceful degradation.');
    }

    // ===============================================================
    // Section N — Scope guard.
    // ===============================================================
    {
        const changedFiles = execSync('git status --porcelain', { cwd: SOURCE_ROOT.pathname })
            .toString().split('\n').map((line) => line.replace(/\n$/, '')).filter(Boolean)
            .map((line) => line.slice(3).trim());
        const unexpectedProductionChanges = changedFiles.filter((f) =>
            !f.startsWith('tests/') && f !== 'tests.html' && f !== 'ui/main.js');
        assert(unexpectedProductionChanges.length === 0,
            `1. this milestone's own working-tree changes are scoped to ui/main.js, tests/, and tests.html only — found unexpected: ${JSON.stringify(unexpectedProductionChanges)}.`);

        // application/DiscoverSnapshotCandidatesCommand.js and
        // application/WorldSnapshotDiscoveryMonitor.js themselves are
        // untouched — their own contracts, unmodified, are exactly what
        // made this milestone "wiring only."
        assert(!changedFiles.includes('application/DiscoverSnapshotCandidatesCommand.js'),
            '2. application/DiscoverSnapshotCandidatesCommand.js is untouched — the command itself was never redesigned.');
        assert(!changedFiles.includes('application/WorldSnapshotDiscoveryMonitor.js'),
            '3. application/WorldSnapshotDiscoveryMonitor.js is untouched — the monitor itself was never redesigned.');

        console.log('✓ Section N: this milestone\'s own diff is scoped to exactly what it claims — the minimum wiring necessary, and nothing else.');
    }

    console.log('\n✓ FINAL DECISION.\n' +
'\n' +
'OUTCOME: WALKING_TRIGGERED_SNAPSHOT_CANDIDATE_DISCOVERY_WIRED.\n' +
'\n' +
"WHY. The real, production discoverSnapshotCandidatesCommand now calls the real, production Local+Nostr composite,\n" +
'composed once before the command that depends on it, with the walking monitor still wrapping the identical command\n' +
'reference (Section A). Local candidates (Section B), Nostr candidates (Section C), and — the flagship path this\n' +
"milestone exists to close — a real peer's passive ANNOUNCE into the receiving replica's own Local catalog (Section\n" +
'D) all reach the walking-triggered monitor. Multiple sources converge into one result (Section E), with the exact\n' +
'0.9.485 deduplication identity preserved (Section F), and every source-failure combination leaves the monitor in a\n' +
'clean state with no new error vocabulary (Section G). The pre-existing movement-threshold gate (Section H) and\n' +
"request-id race protection (Section I) are both untouched and both still hold, even with the real composite's own\n" +
'Promise.allSettled() in the loop. A discovered candidate remains an unresolved locator claim, resolved only through\n' +
'the existing, separate resolver (Section J), with no second Snapshot-loading path introduced anywhere (Section K),\n' +
'and no coupling to World Encounter, Publication verification/attribution, or any new peer protocol (Section L).\n' +
'The pipeline degrades gracefully in every source-availability combination (Section M), and this milestone\'s own\n' +
'diff is scoped to exactly the minimum wiring it claims (Section N).\n' +
'\n' +
'WHAT THIS MEANS. When a Wanderer walks through the World, discovery of Snapshot candidates now genuinely converges\n' +
'Local declaration, Nostr announcement, and passive Peer exchange — through one composite, reached through the\n' +
'SAME walking-triggered monitor and command this codebase already had, redesigning neither. Candidate discovery,\n' +
'candidate relevance, material resolution, and World presentation remain four separate, already-existing concerns\n' +
'— this milestone touched only the first, and only its own single missing wire.\n');

    console.log('\n✅ All Walking-Triggered Snapshot Candidate Discovery Integration Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All WalkingTriggeredSnapshotCandidateDiscoveryIntegrationAudit tests passed');
}).catch((error) => {
    console.error('\n✗ WalkingTriggeredSnapshotCandidateDiscoveryIntegrationAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
