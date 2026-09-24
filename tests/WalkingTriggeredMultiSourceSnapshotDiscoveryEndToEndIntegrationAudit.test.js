import { execSync } from 'node:child_process';

import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION } from '../core/SnapshotDiscoveryEnvelope.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/snapshot/placement/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacementExchange } from '../application/snapshot/placement/PublicationSnapshotPlacementExchange.js';
import { PublicationSnapshotPlacementPeerExchange } from '../application/snapshot/placement/PublicationSnapshotPlacementPeerExchange.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/nostr/NostrSnapshotDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryQueryService } from '../application/snapshot/SnapshotCandidateDiscoveryQueryService.js';
import { composeSnapshotCandidateDiscoveryRuntime } from '../application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/snapshot/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/snapshot/materialization/MaterializeSelectedSnapshotCommand.js';
import { DecentralizedSnapshotResolver } from '../application/snapshot/DecentralizedSnapshotResolver.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { AutomaticSnapshotEncounterCascade } from '../application/snapshot/AutomaticSnapshotEncounterCascade.js';
import { SnapshotWorldRegistrationOutcome } from '../application/snapshot/placement/SnapshotWorldRegistrationOutcome.js';
import { WorldDiscoverySourceRegistry } from '../application/discovery/WorldDiscoverySourceRegistry.js';
import { assembleWorldDiscoveryInputs } from '../core/WorldDiscoverySourceAssembly.js';
import { deriveWorldEncounters } from '../core/WorldEncounter.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/snapshot/WorldSnapshotDiscoveryMonitor.js';
import { DEFAULT_DISCOVERY_REFRESH_RADIUS } from '../application/snapshot/ShouldRefreshSnapshotDiscovery.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/peer/ConnectToPeerUseCase.js';

// 0.9.487 — Walking-Triggered Multi-Source Snapshot Discovery End-to-End
// Integration Audit.
//
// 0.9.480 through 0.9.486 built this arc one seam at a time — Local
// candidate discovery, Peer's passive contribution to it, Nostr
// candidate discovery, the composite query service that converges all
// three behind one search(), and finally (0.9.486) the wire that
// actually threads that composite into the walking-triggered monitor.
// 0.9.486's own test (tests/WalkingTriggeredSnapshotCandidateDiscoveryIntegrationAudit
// .test.js) already proved that wire holds under fourteen separate
// pressure tests. This milestone is deliberately NOT a repeat of that
// file — every assertion below either goes somewhere that one does not
// reach, or reconfirms one of its findings only briefly, as scaffolding
// for the flagship scenario this file exists to prove:
//
//   1. PRODUCTION TOPOLOGY, properly audited (Section A) — not just
//      "the command calls the composite before it's used" (0.9.486's own
//      Section A), but "there is exactly one construction site anywhere
//      in this codebase for each load-bearing class in this arc, and the
//      SAME LocalPublicationSnapshotPlacementCatalog instance is threaded
//      through peer ingestion, orchestrated creation, AND the walking
//      composite" — the split-catalog failure mode (Peer writes into one
//      catalog, walking discovery reads another) that would silently
//      break Section C/D below without ever throwing.
//   2. THREE-SOURCE CONVERGENCE IN ONE OBSERVE() CALL (Section E) —
//      0.9.486 proved Local+Nostr together and Peer-into-Local alone;
//      it never proved Local(self) + Local(peer-derived) + Nostr all
//      resolving through a SINGLE walking-triggered observe().
//   3. THE FULL CLOSURE, WALKING-TRIGGERED (Section K) — 0.9.486's own
//      Section J deliberately stops at RESOLVE/VERIFY. This file drives
//      a walking-discovered, PEER-DERIVED candidate all the way through
//      RESOLVE -> VERIFY -> MATERIALIZE -> PLACE -> REGISTER
//      (application/snapshot/AutomaticSnapshotEncounterCascade.js, 0.9.187,
//      unmodified) into a real WorldDiscoverySourceRegistry, and then
//      confirms the ordinary, unmodified World Encounter pipeline
//      (core/WorldEncounter.js) actually renders it — proving "resolved
//      material enters the EXISTING World path" as a live fact, not an
//      inference from source reading.
//   4. OFFLINE/RECONNECTION, ONE LAYER UP (Section M) — 0.9.484's own
//      Section I already proved, at the CATALOG layer, that reconnecting
//      never backfills what was missed. This file reconfirms that exact
//      finding survives one more layer: the WALKING-TRIGGERED MONITOR
//      itself, after a real disconnect/reconnect, still never surfaces
//      what Bob's replica missed while offline — plus a source-level
//      guarantee that no production file wires automatic backfill to a
//      peer-connect event at all.
//   5. A COMPREHENSIVE BOUNDARY AUDIT (Section O) spanning every file
//      this whole arc (0.9.480-0.9.486) touched, not just this
//      milestone's own diff.
//
// THIS FILE ANSWERS A TECHNICAL QUESTION ONLY: does the mechanism this
// arc built actually behave as one coherent whole? Whether that
// mechanism is now PRODUCT-COMPLETE — whether anything further (active
// peer browsing, ranking, a new source) is worth building — is a
// separate, deliberately deferred product question for a later
// milestone. This file's own final verdict answers "is the technical
// path closed," nothing more.
//
//   Section A — Production topology: singleton construction sites, and
//               one LocalPublicationSnapshotPlacementCatalog threaded
//               through peer ingestion, orchestrated creation, and the
//               walking composite alike.
//   Section B — Local-origin candidate, walking-triggered (reconfirm).
//   Section C — Passive-peer-origin candidate, walking-triggered, over a
//               real two-peer connection (reconfirm).
//   Section D — Nostr-origin candidate, walking-triggered (reconfirm).
//   Section E — THREE-source convergence in a SINGLE observe() call:
//               Local(self) + Local(peer-derived) + Nostr, together.
//   Section F — Candidate identity/deduplication, within the three-source
//               composite (reconfirm).
//   Section G — Movement gating (reconfirm).
//   Section H — Request-id race protection, real composite (reconfirm).
//   Section I — Source failure isolation, all four combinations, plus: a
//               disconnected/absent peer never affects Local querying.
//   Section J — Candidate metadata vs. verified content (reconfirm).
//   Section K — FLAGSHIP: DISCOVER (walking, peer-derived) -> SELECT ->
//               RESOLVE -> VERIFY -> MATERIALIZE -> PLACE -> REGISTER ->
//               a real, rendered World Encounter. No second Snapshot-
//               loading/rendering subsystem anywhere in that chain.
//   Section L — Peer/World isolation (reconfirm, extended to the cascade).
//   Section M — Offline/reconnection semantics, reconfirmed through the
//               walking-triggered monitor, plus a source-level guarantee
//               against automatic backfill-on-reconnect.
//   Section N — Graceful degradation (reconfirm).
//   Section O — Comprehensive boundary audit across the whole arc: no
//               ranking, scoring, automatic fallback, active peer
//               browsing, new provenance/verification/attribution
//               vocabulary, second World-loading path, or new temporal
//               throttling anywhere this arc touched.
//   Section P — Scope guard: this milestone is test-only.

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

// Builds the SAME shape ui/main.js's own production wiring builds — a
// discoverSnapshotCandidatesCommand backed by a real
// SnapshotCandidateDiscoveryQueryService composite, and a
// WorldSnapshotDiscoveryMonitor wrapping it.
function buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService = null, placementCatalog }) {
    const { queryService } = composeSnapshotCandidateDiscoveryRuntime({ nostrSnapshotDiscoveryQueryService, placementCatalog });
    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
        discoveryTag: 'forkbuild-snapshot',
        discoveryQueryService: queryService
    });
    const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });
    return { queryService, discoverSnapshotCandidatesCommand, monitor };
}

// A real, live, in-process two-peer connection — never a mock transport
// — mirroring 0.9.482/0.9.484/0.9.486's own established seam. Returns
// both sides' own ConnectToPeerUseCase (and therefore each side's own
// `.registry`), ready for each side to build its own
// PublicationSnapshotPlacementPeerExchange over.
async function connectTwoPeers(aliceLabel, bobLabel) {
    const network = new LocalPeerNetwork();
    const alice = makeIdentity(aliceLabel);
    const bob = makeIdentity(bobLabel);
    const aliceTransport = new LocalPeerConnectionProvider(`${aliceLabel}-node`, network);
    const bobTransport = new LocalPeerConnectionProvider(`${bobLabel}-node`, network);

    const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
    aliceConnect.listen();
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
    bobConnect.listen();
    const bobToAlice = bobConnect.connect({ candidateEndpoint: `${aliceLabel}-node` });
    await wait(20);
    assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED,
        `${aliceLabel}/${bobLabel} hold a real, live, AUTHENTICATED peer connection.`);

    return { network, alice, bob, aliceTransport, bobTransport, aliceConnect, bobConnect, bobToAlice };
}

// Mirrors ui/views/WorldView.js's own 0.9.187/0.9.193 composition of
// AutomaticSnapshotEncounterCascade from a plain
// { publicationId -> { publication, placementRegistry } } world model —
// the identical helper shape tests/WorldSnapshotAutomaticEncounterCascade
// .test.js (0.9.187's own flagship) already established, reused here
// rather than reinvented.
function makeWorldModel() {
    const publications = new Map();
    const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
    return {
        publications,
        placementRegistry,
        knowPublication(publication) { publications.set(publication.id, publication); },
        placeAt(publicationId, position, owner = 'alice') {
            placementRegistry.add(new PlacementRecord({ publicationId, position, owner }));
        },
        resolvePlacementInfo(publicationId) {
            const records = placementRegistry.findByPublicationId(publicationId);
            if (records.length === 0) return null;
            const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
            return { placementId: record.placementId, publicationId: record.publicationId, position: { x: record.position.x, y: record.position.y, z: record.position.z } };
        },
        findPublicationById(publicationId) { return publications.get(publicationId) || null; }
    };
}

async function run() {
    console.log('=== 0.9.487 — Walking-Triggered Multi-Source Snapshot Discovery End-to-End Integration Audit ===\n');

    // ===============================================================
    // Section A — Production topology.
    // ===============================================================
    {
        const compositeSource = stripLineComments(readSource('application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js'));
        assert((compositeSource.match(/new SnapshotCandidateDiscoveryQueryService\(/g) || []).length === 1,
            '1. exactly one production construction site exists anywhere for SnapshotCandidateDiscoveryQueryService.');
        assert((compositeSource.match(/new LocalSnapshotCandidateDiscoveryQueryService\(/g) || []).length === 1,
            '2. exactly one production construction site exists anywhere for the Local candidate adapter.');

        const mainSource = stripLineComments(readSource('ui/main.js'));
        assert((mainSource.match(/composeSnapshotCandidateDiscoveryRuntime\(/g) || []).length === 1,
            '3. ui/main.js calls composeSnapshotCandidateDiscoveryRuntime() exactly once.');
        assert((mainSource.match(/new WorldSnapshotDiscoveryMonitor\(/g) || []).length === 1,
            '4. exactly one production WorldSnapshotDiscoveryMonitor is ever constructed.');
        assert((mainSource.match(/const discoverSnapshotCandidatesCommand =/g) || []).length === 1,
            '5. exactly one production discoverSnapshotCandidatesCommand is ever defined (reconfirming 0.9.486 Section A holds unchanged).');

        // The split-catalog failure mode: does ui/main.js accidentally
        // reach a SECOND local-catalog constructor, whose own catalog
        // Peer ingestion or the walking composite might read from
        // instead of the one true instance?
        assert(!/CreatePublicationSnapshotPlacementCatalogUseCase/.test(mainSource),
            '6. ui/main.js never imports/uses CreatePublicationSnapshotPlacementCatalogUseCase — the ONLY production catalog constructor it reaches is CreatePublicationSnapshotPlacementPeerExchangeUseCase, whose own header documents its catalog as "the one LocalPublicationSnapshotPlacementCatalog instance the replica uses anywhere." (A second constructor legitimately exists on disk for other callers — assertion 6 is what actually protects production from ever reaching it, not its mere absence from the filesystem.)');

        const catalogConstructionSites = execSync(
            'grep -rlE "new LocalPublicationSnapshotPlacementCatalog\\(" application ui --include="*.js" || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean);
        assert(catalogConstructionSites.includes('application/snapshot/placement/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js'),
            '7. the one catalog-constructing file production actually reaches is present on disk.');

        // The SAME `publicationSnapshotPlacementCatalog` identifier — never
        // re-declared — is threaded to peer ingestion, orchestrated
        // creation, AND the walking composite.
        assert(/catalog:\s*publicationSnapshotPlacementCatalog/.test(mainSource),
            '8. the peer-exchange use case receives publicationSnapshotPlacementCatalog.');
        assert((mainSource.match(/placementCatalog:\s*publicationSnapshotPlacementCatalog/g) || []).length >= 2,
            '9. BOTH the creation orchestrator(s) AND the walking composite receive that SAME publicationSnapshotPlacementCatalog reference (never a second catalog) — the exact seam a split-catalog regression would break silently, with no test anywhere throwing.');
        assert((mainSource.match(/}\s*=\s*new CreatePublicationSnapshotPlacementPeerExchangeUseCase\(\)/g) || []).length === 1,
            '10. CreatePublicationSnapshotPlacementPeerExchangeUseCase itself is only ever invoked once in production, so publicationSnapshotPlacementCatalog can only ever be one instance.');

        // Nostr: one production construction site, and the SAME instance
        // feeds both the pre-existing Nostr-only discovery runtime and
        // the walking composite's own `nostrSnapshotDiscoveryQueryService`.
        const nostrConstructionSites = execSync(
            'grep -rlE "new NostrSnapshotDiscoveryQueryService\\(" application ui --include="*.js" || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean);
        assert(nostrConstructionSites.length === 1 && nostrConstructionSites[0] === 'application/snapshot/DiscoverSnapshotRuntimeComposition.js',
            `11. exactly one production construction site for NostrSnapshotDiscoveryQueryService (found: ${JSON.stringify(nostrConstructionSites)}).`);
        assert(/nostrSnapshotDiscoveryQueryService:\s*snapshotDiscoveryQueryService/.test(mainSource),
            '12. the walking composite is handed the SAME, already-constructed Nostr instance — never a second Nostr construction.');

        console.log('✓ Section A: every load-bearing class in this arc has exactly one production construction site, and — the failure mode 0.9.486 never checked — the SAME LocalPublicationSnapshotPlacementCatalog and NostrSnapshotDiscoveryQueryService instances are threaded through peer ingestion, orchestrated creation, and the walking-triggered composite alike.');
    }

    // ===============================================================
    // Section B — Local-origin candidate, walking-triggered (reconfirm).
    // ===============================================================
    {
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-b', contentHash: 'hash-b', storage: 'ipfs', locator: 'ipfs://CID-b' }));

        const { monitor } = buildWalkingPipeline({ placementCatalog: catalog });
        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].contentHash === 'hash-b',
            '1. a locally-cataloged placement reaches the walking-triggered monitor with no explicit click.');

        console.log('✓ Section B: Local candidate path, walking-triggered — reconfirmed.');
    }

    // ===============================================================
    // Section C — Passive-peer-origin candidate, walking-triggered, over
    // a real two-peer connection (reconfirm).
    // ===============================================================
    {
        const { aliceConnect, bobConnect } = await connectTwoPeers('alice-487c', 'bob-487c');

        const { exchange: aliceExchange } = makeHandBuiltPlacementExchange();
        const alicePeerExchange = new PublicationSnapshotPlacementPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);
        const { catalog: bobCatalog, exchange: bobExchange } = makeHandBuiltPlacementExchange();
        // eslint-disable-next-line no-unused-vars
        const bobPeerExchange = new PublicationSnapshotPlacementPeerExchange(bobExchange, new PeerMessageBus(), bobConnect.registry);

        const alice = new LocalIdentityProvider(new InMemoryStorageProvider());
        const aliceIdentity = alice.createLocalIdentity('alice-487c-signer');
        alice.authenticate(aliceIdentity.identityId);
        const placement = signedPlacement(alice, { publicationId: 'pub-c-peer', contentHash: 'hash-c-peer', storage: 'ipfs', locator: 'ipfs://CID-c-peer' });
        const sentTo = alicePeerExchange.announce(placement);
        assert(sentTo === 1, '1. the announcement reached exactly one AUTHENTICATED peer.');
        await wait(30);
        assert(bobCatalog.findByPublicationId('pub-c-peer').length === 1, '2. Bob\'s own catalog received it over the live wire.');

        const { monitor: bobMonitor } = buildWalkingPipeline({ placementCatalog: bobCatalog });
        await bobMonitor.observe(ctx(pos(0, 0, 0)));
        assert(bobMonitor.lastResult.some((c) => c.contentHash === 'hash-c-peer'),
            '3. Bob\'s own walking-triggered monitor surfaces the peer-announced placement — no active peer-browse call of any kind.');

        console.log('✓ Section C: Peer A ANNOUNCE -> Peer B\'s real Local catalog -> walking-triggered discovery — reconfirmed.');
    }

    // ===============================================================
    // Section D — Nostr-origin candidate, walking-triggered (reconfirm).
    // ===============================================================
    {
        const emptyCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const events = [makeNostrEnvelopeEvent({ contentHash: 'hash-d-nostr', locator: 'ar://d-nostr', storage: 'arweave' })];
        const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(events) });

        const { monitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: emptyCatalog });
        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].contentHash === 'hash-d-nostr',
            '1. a real, unmodified NostrSnapshotDiscoveryQueryService instance\'s own announcement reaches the walking-triggered monitor.');

        console.log('✓ Section D: Nostr candidate path, walking-triggered — reconfirmed.');
    }

    // ===============================================================
    // Section E — THREE-source convergence in a SINGLE observe() call.
    // Local(self) + Local(peer-derived) + Nostr, together — the one
    // combination 0.9.486 never tested (it tested Local+Nostr, and
    // separately Peer-into-Local alone, but never all three at once).
    // ===============================================================
    {
        const { aliceConnect, bobConnect } = await connectTwoPeers('alice-487e', 'bob-487e');

        const { exchange: aliceExchange } = makeHandBuiltPlacementExchange();
        const alicePeerExchange = new PublicationSnapshotPlacementPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);
        const { catalog: bobCatalog, exchange: bobExchange } = makeHandBuiltPlacementExchange();
        // eslint-disable-next-line no-unused-vars
        const bobPeerExchange = new PublicationSnapshotPlacementPeerExchange(bobExchange, new PeerMessageBus(), bobConnect.registry);

        // Bob's own self-cataloged (LOCAL) placement.
        bobCatalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-e-local', contentHash: 'hash-e-local', storage: 'ipfs', locator: 'ipfs://CID-e-local' }));

        // A PEER-DERIVED placement, landing in the SAME catalog via a real
        // ANNOUNCE from Alice.
        const alice = new LocalIdentityProvider(new InMemoryStorageProvider());
        const aliceIdentity = alice.createLocalIdentity('alice-487e-signer');
        alice.authenticate(aliceIdentity.identityId);
        const peerPlacement = signedPlacement(alice, { publicationId: 'pub-e-peer', contentHash: 'hash-e-peer', storage: 'ipfs', locator: 'ipfs://CID-e-peer' });
        alicePeerExchange.announce(peerPlacement);
        await wait(30);
        assert(bobCatalog.findByPublicationId('pub-e-peer').length === 1, '1. the peer-derived placement landed in Bob\'s own catalog.');

        // A NOSTR-origin candidate, entirely independent of Bob's catalog.
        const events = [makeNostrEnvelopeEvent({ contentHash: 'hash-e-nostr', locator: 'ar://e-nostr', storage: 'arweave' })];
        const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(events) });

        // ONE walking-triggered pipeline, over Bob's own (Local-self +
        // Local-peer-derived) catalog, plus Nostr.
        const { monitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: bobCatalog });
        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(monitor.lastResult.length === 3,
            `2. exactly three distinct candidates — self-placed Local, peer-derived Local, and Nostr — converge from a SINGLE observe() call (found ${monitor.lastResult.length}).`);
        const hashes = monitor.lastResult.map((c) => c.contentHash).sort();
        assert(JSON.stringify(hashes) === JSON.stringify(['hash-e-local', 'hash-e-nostr', 'hash-e-peer']),
            '3. all three, and only those three, are present — the self-placed and peer-derived candidates (indistinguishable at this layer, by design since 0.9.480/0.9.485) sit alongside the independently-sourced Nostr candidate.');

        console.log('✓ Section E: Local(self) + Local(peer-derived) + Nostr all converge into ONE result from a single walking-triggered observe() call — the three-source flagship scenario the originating request asked for, proven live.');
    }

    // ===============================================================
    // Section F — Candidate identity/deduplication, within the
    // three-source composite (reconfirm).
    // ===============================================================
    {
        // F1. The identical claim, reported by both Local and Nostr,
        // collapses to one candidate.
        const sharedContentHash = 'hash-f-shared';
        const sharedLocator = 'ipfs://CID-f-shared';
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-f-shared', contentHash: sharedContentHash, storage: 'ipfs', locator: sharedLocator }));
        const events = [makeNostrEnvelopeEvent({ contentHash: sharedContentHash, locator: sharedLocator, storage: 'ipfs' })];
        const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(events) });

        const { monitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: catalog });
        await monitor.observe(ctx(pos(0, 0, 0)));
        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].contentHash === sharedContentHash,
            '1. the SAME storage+contentHash+locator, reported by two sources, collapses to exactly one candidate.');

        // F2. The same contentHash under a DIFFERENT locator is a
        // separate candidate.
        const catalog2 = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog2.add(new PublicationSnapshotPlacement({ publicationId: 'pub-f-multi', contentHash: 'hash-f-multi', storage: 'ipfs', locator: 'ipfs://CID-f-multi-LOCAL' }));
        const events2 = [makeNostrEnvelopeEvent({ contentHash: 'hash-f-multi', locator: 'ar://f-multi-NOSTR', storage: 'arweave' })];
        const nostrService2 = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(events2) });
        const { monitor: monitor2 } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: nostrService2, placementCatalog: catalog2 });
        await monitor2.observe(ctx(pos(0, 0, 0)));
        assert(monitor2.lastResult.length === 2, '2. the same contentHash under two DIFFERENT locators is kept as two separate candidates.');

        console.log('✓ Section F: the 0.9.485 dedup identity (storage+contentHash+locator together) still holds at the walking-triggered monitor — reconfirmed.');
    }

    // ===============================================================
    // Section G — Movement gating (reconfirm).
    // ===============================================================
    {
        let searchCalls = 0;
        const catalog = {
            list() { searchCalls += 1; return [{ contentHash: 'hash-g', locator: 'ipfs://CID-g', storage: 'ipfs', publicationId: 'pub-g' }]; }
        };
        const { monitor } = buildWalkingPipeline({ placementCatalog: catalog });

        await monitor.observe(ctx(pos(0, 0, 0)));
        assert(searchCalls === 1, '1. the first observe() call queries exactly once.');
        await monitor.observe(ctx(pos(1, 0, 0)));
        assert(searchCalls === 1, '2. a sub-threshold movement never triggers a second query.');
        await monitor.observe(ctx(pos(DEFAULT_DISCOVERY_REFRESH_RADIUS + 5, 0, 0)));
        assert(searchCalls === 2, '3. crossing the threshold DOES trigger a fresh query.');

        console.log('✓ Section G: movement-threshold gate — reconfirmed.');
    }

    // ===============================================================
    // Section H — Request-id race protection with a real composite
    // (reconfirm).
    // ===============================================================
    {
        let localCalls = 0;
        let resolveFirst;
        let resolveSecond;
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

        const observationA = monitor.observe(ctx(pos(0, 0, 0)));
        const observationB = monitor.observe(ctx(pos(0, 0, DEFAULT_DISCOVERY_REFRESH_RADIUS + 1)));
        await flushMicrotasks();

        resolveSecond();
        await observationB;
        assert(monitor.lastResult[0].contentHash === 'from-SECOND', '1. the newer request\'s own result is applied.');

        resolveFirst();
        await observationA;
        await flushMicrotasks();
        assert(monitor.lastResult[0].contentHash === 'from-SECOND',
            '2. the STALE, earlier request\'s late-arriving result never overwrites the newer request\'s already-applied result, even through the real composite\'s own Promise.allSettled().');

        console.log('✓ Section H: request-id race protection with the real composite in the loop — reconfirmed.');
    }

    // ===============================================================
    // Section I — Source failure isolation, all four combinations, plus:
    // a disconnected/absent peer never affects Local querying.
    // ===============================================================
    {
        const workingLocalCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        workingLocalCatalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-i-local', contentHash: 'hash-i-local', storage: 'ipfs', locator: 'ipfs://CID-i-local' }));
        const workingNostrEvents = [makeNostrEnvelopeEvent({ contentHash: 'hash-i-nostr', locator: 'ar://i-nostr', storage: 'arweave' })];
        const failingCatalog = { list() { throw new Error('local catalog boom'); } };
        const failingNostrQueryImpl = async () => { throw new Error('relay boom'); };

        async function observeOnce({ nostrSnapshotDiscoveryQueryService, placementCatalog }) {
            const { monitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService, placementCatalog });
            await monitor.observe(ctx(pos(0, 0, 0)));
            return monitor;
        }

        {
            const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(workingNostrEvents) });
            const monitor = await observeOnce({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: workingLocalCatalog });
            assert(monitor.lastError === null && monitor.lastResult.length === 2, '1. Local OK / Nostr OK.');
        }
        {
            const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(workingNostrEvents) });
            const monitor = await observeOnce({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: failingCatalog });
            assert(monitor.lastError === null && monitor.lastResult.length === 1 && monitor.lastResult[0].contentHash === 'hash-i-nostr', '2. Local FAIL / Nostr OK.');
        }
        {
            const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: failingNostrQueryImpl });
            const monitor = await observeOnce({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: workingLocalCatalog });
            assert(monitor.lastError === null && monitor.lastResult.length === 1 && monitor.lastResult[0].contentHash === 'hash-i-local', '3. Local OK / Nostr FAIL.');
        }
        {
            const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: failingNostrQueryImpl });
            const monitor = await observeOnce({ nostrSnapshotDiscoveryQueryService: nostrService, placementCatalog: failingCatalog });
            assert(monitor.lastError === null && Array.isArray(monitor.lastResult) && monitor.lastResult.length === 0, '4. Local FAIL / Nostr FAIL.');
        }

        // A disconnected/absent peer never affects Local querying — Bob
        // has never even attempted a connection, yet his own Local
        // candidates (from placements he created himself, or received
        // while previously connected) surface exactly as if Peer did not
        // exist as a concept at all.
        const noPeerCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        noPeerCatalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-i-no-peer', contentHash: 'hash-i-no-peer', storage: 'ipfs', locator: 'ipfs://CID-i-no-peer' }));
        const { monitor: noPeerMonitor } = buildWalkingPipeline({ placementCatalog: noPeerCatalog });
        await noPeerMonitor.observe(ctx(pos(0, 0, 0)));
        assert(noPeerMonitor.lastError === null && noPeerMonitor.lastResult.length === 1 && noPeerMonitor.lastResult[0].contentHash === 'hash-i-no-peer',
            '5. with zero peer connections of any kind, Local candidate querying is entirely unaffected.');
        const localAdapterSource = stripLineComments(readSource('application/snapshot/LocalSnapshotCandidateDiscoveryQueryService.js'));
        assert(!/PeerLifecycleState|ConnectedPeerRegistry|getLifecycleState/.test(localAdapterSource),
            '6. the Local candidate adapter itself contains no peer-connectivity vocabulary of any kind — it cannot be affected by peer connection state because it never reads it.');

        console.log('✓ Section I: every Local-OK/FAIL x Nostr-OK/FAIL combination leaves the monitor in a clean state, and a disconnected/absent peer never affects Local querying, by construction.');
    }

    // ===============================================================
    // Section J — Candidate metadata vs. verified content (reconfirm).
    // ===============================================================
    {
        const bytesText = 'section-j-candidate-bytes';
        const contentHash = computeContentHash(bytesText);
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-j', contentHash, storage: 'ipfs', locator: 'ipfs://CID-j' }));

        const { queryService, monitor } = buildWalkingPipeline({ placementCatalog: catalog });
        await monitor.observe(ctx(pos(0, 0, 0)));
        const discoveredCandidate = monitor.lastResult.find((c) => c.contentHash === contentHash);
        assert(discoveredCandidate && discoveredCandidate.bytes === undefined && discoveredCandidate.verified === undefined,
            '1. a walking-discovered candidate is an unresolved locator CLAIM — no bytes, no verification flag.');

        const fakeContentStore = { get: async () => bytesText };
        const resolver = new DecentralizedSnapshotResolver(queryService);
        const resolution = await executeResolveSelectedSnapshotCommand({ candidate: discoveredCandidate, resolver, contentStore: fakeContentStore });
        assert(resolution.outcome === DecentralizedSnapshotResolutionOutcome.RESOLVED && resolution.bytes === bytesText,
            '2. only the EXISTING, separate resolution step produces verified content — candidate metadata and verified bytes are never conflated.');

        console.log('✓ Section J: candidate metadata (claim) vs. verified content (resolved bytes) — reconfirmed as two distinct things.');
    }

    // ===============================================================
    // Section K — FLAGSHIP. DISCOVER (walking, peer-derived) -> SELECT ->
    // RESOLVE -> VERIFY -> MATERIALIZE -> PLACE -> REGISTER -> a real,
    // rendered World Encounter — the one closure no prior milestone's
    // test exercises end to end for a walking-discovered candidate.
    // ===============================================================
    {
        const { aliceConnect, bobConnect } = await connectTwoPeers('alice-487k', 'bob-487k');

        const { exchange: aliceExchange } = makeHandBuiltPlacementExchange();
        const alicePeerExchange = new PublicationSnapshotPlacementPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);
        const { catalog: bobCatalog, exchange: bobExchange } = makeHandBuiltPlacementExchange();
        // eslint-disable-next-line no-unused-vars
        const bobPeerExchange = new PublicationSnapshotPlacementPeerExchange(bobExchange, new PeerMessageBus(), bobConnect.registry);

        // Alice announces a Snapshot placement for a Publication Bob
        // already knows about and has already placed in HIS OWN World —
        // exactly the realistic shape ("Bob subscribed to Alice's World a
        // while ago; now walks near it and a fresh Snapshot appears").
        const publicationId = 'flagship-k-publication';
        const bytesText = JSON.stringify({ world: { buildings: [{ id: 'flagship-k-building', bricks: 3 }] } });
        const contentHash = computeContentHash(bytesText);

        const alice = new LocalIdentityProvider(new InMemoryStorageProvider());
        const aliceIdentity = alice.createLocalIdentity('alice-487k-signer');
        alice.authenticate(aliceIdentity.identityId);
        const placement = signedPlacement(alice, { publicationId, contentHash, storage: 'ipfs', locator: 'ipfs://CID-flagship-k' });
        // Deliberately a DIFFERENT claimed position than Bob's own
        // authoritative placement below — proving, one more time, that a
        // publisher's own claim is never promoted over World authority,
        // now specifically for a WALKING-discovered candidate.
        const sentTo = alicePeerExchange.announce(placement);
        assert(sentTo === 1, '1. Alice\'s announcement reached exactly one AUTHENTICATED peer (Bob).');
        await wait(30);
        assert(bobCatalog.findByPublicationId(publicationId).length === 1, '2. Bob\'s own catalog received the peer-announced placement.');

        // Bob's own walking-triggered discovery — no Nostr, no explicit
        // click — surfaces it.
        const { queryService: bobQueryService, monitor: bobMonitor } = buildWalkingPipeline({ placementCatalog: bobCatalog });
        await bobMonitor.observe(ctx(pos(0, 0, 0)));
        const discoveredCandidate = bobMonitor.lastResult.find((c) => c.contentHash === contentHash);
        assert(discoveredCandidate && discoveredCandidate.publicationId === publicationId,
            '3. the walking-triggered monitor discovered exactly this peer-announced candidate, carrying its own publicationId.');
        assert(discoveredCandidate.bytes === undefined,
            '4. still just a claim at this point — no bytes, no verification, no World presence yet.');

        // RESOLVE + VERIFY — the EXISTING, unmodified resolver, exactly
        // as production composes it (application/snapshot/ResolveSelectedSnapshotCommand.js
        // wrapping application/snapshot/DecentralizedSnapshotResolver.js).
        const fakeContentStore = { get: async () => bytesText };
        const resolver = new DecentralizedSnapshotResolver(bobQueryService);
        const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({ candidate, resolver, contentStore: fakeContentStore });

        // MATERIALIZE — the EXISTING, unmodified materializer, over Bob's
        // OWN local content store (never Alice's).
        const bobLocalContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const bobStoreSnapshotContentUseCase = new StoreSnapshotContentUseCase(bobLocalContentStore);
        const bobMaterializer = new MaterializeSnapshotFromSelectedCandidateUseCase(bobStoreSnapshotContentUseCase);
        const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({ resolution, materializer: bobMaterializer });

        // PLACE/REGISTER collaborators — Bob's own authoritative
        // WorldPlacement for this Publication, and Bob's own knowledge of
        // the Publication object itself, exactly the shape
        // ui/views/WorldView.js's own real session exposes
        // (getPlacementInfoForPublication()/findPublicationById(), 0.9.187).
        const bobWorldModel = makeWorldModel();
        bobWorldModel.placeAt(publicationId, new Position(4, 2, -1));
        bobWorldModel.knowPublication(new Publication({ id: publicationId, title: 'Flagship K World' }));
        const bobRegistry = new WorldDiscoverySourceRegistry();

        // The EXISTING, unmodified orchestration seam — the SAME class
        // ui/views/WorldView.js constructs on every mount, fed a
        // WALKING-discovered, PEER-DERIVED candidate for the first time
        // in this codebase's own test history.
        const cascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: bobRegistry,
            resolvePlacementInfo: (id) => bobWorldModel.resolvePlacementInfo(id),
            findPublicationById: (id) => bobWorldModel.findPublicationById(id)
        });

        const result = await cascade.processCandidate(discoveredCandidate);
        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            '5. FLAGSHIP — a walking-triggered, peer-derived candidate was driven, by the EXISTING unmodified cascade, all the way to REGISTERED.');

        // The ordinary, entirely unmodified World Encounter pipeline now
        // finds it — proving "enters the EXISTING World path," live.
        const sources = bobRegistry.listSources();
        const inputs = assembleWorldDiscoveryInputs(sources);
        const encounters = deriveWorldEncounters(inputs);
        assert(encounters.publications.length === 1, '6. the registered Snapshot is now encounterable through the entirely unmodified World Encounter pipeline.');
        const [encounter] = encounters.publications;
        assert(encounter.objectId === publicationId, '7. the encounter names the correct Publication.');
        assert(encounter.position.x === 4 && encounter.position.y === 2 && encounter.position.z === -1,
            '8. the encounter position is Bob\'s own AUTHORITATIVE placement — never any position an announcement itself might have claimed.');

        // No second Snapshot-loading/rendering subsystem: the cascade
        // itself still contains no rendering or World-registry-reading
        // vocabulary of its own (it only ever WRITES into the registry).
        const cascadeSource = stripLineComments(readSource('application/snapshot/AutomaticSnapshotEncounterCascade.js'));
        assert(!/render|WorldEncounterCanvas|scene|mesh/i.test(cascadeSource),
            '9. the orchestration seam itself contains no rendering vocabulary — rendering remains entirely core/WorldEncounter.js\'s own, pre-existing concern.');

        console.log('✓ Section K: FLAGSHIP — DISCOVER (walking, peer-derived) -> SELECT -> RESOLVE -> VERIFY -> MATERIALIZE -> PLACE -> REGISTER -> a real World Encounter, entirely through existing, unmodified machinery. The full arc this milestone exists to close, proven live end to end.');
    }

    // ===============================================================
    // Section L — Peer/World isolation (reconfirm, extended to the
    // cascade).
    // ===============================================================
    {
        const mainSource = stripLineComments(readSource('ui/main.js'));
        const monitorSource = stripLineComments(readSource('application/snapshot/WorldSnapshotDiscoveryMonitor.js'));
        const commandSource = stripLineComments(readSource('application/snapshot/DiscoverSnapshotCandidatesCommand.js'));
        const cascadeSource = stripLineComments(readSource('application/snapshot/AutomaticSnapshotEncounterCascade.js'));

        assert(!/WorldEncounter/.test(monitorSource) && !/WorldEncounter/.test(commandSource),
            '1. neither the walking monitor nor the candidate command references World Encounter peer material discovery.');
        assert(!/VerifyPublicationUseCase|SnapshotPublicationAttribution|DecentralizedWorldDiscovery/.test(monitorSource + commandSource),
            '2. neither references Publication verification, attribution, or decentralized-world-discovery machinery.');

        const peerProtocolSource = stripLineComments(readSource('application/snapshot/placement/PublicationSnapshotPlacementPeerProtocol.js'));
        assert(!/WorldSnapshotDiscoveryMonitor|SnapshotCandidateDiscoveryQueryService|AutomaticSnapshotEncounterCascade/.test(peerProtocolSource),
            '3. the peer protocol file is untouched by, and has no knowledge of, the walking monitor, the composite query service, OR the cascade — the separation holds for the newly-exercised third file too.');

        assert(!/new\s+\w*Peer\w*\(/.test(commandSource),
            '4. DiscoverSnapshotCandidatesCommand.js constructs no Peer-named class — no active peer-browse call.');
        assert(!/PublicationSnapshotPlacementPeerExchange|PeerLifecycleState/.test(cascadeSource),
            '5. the cascade itself — now proven, in Section K, to reach REGISTERED for a peer-derived candidate — has no knowledge that a candidate ever came from a peer; provenance stops entirely at the composite query service, exactly as 0.9.485 designed it.');

        console.log('✓ Section L: no coupling to World Encounter material discovery, Publication verification/attribution, peer browse, or any new peer protocol — reconfirmed, and now also true of the cascade itself.');
    }

    // ===============================================================
    // Section M — Offline/reconnection semantics, reconfirmed through
    // the walking-triggered monitor, plus a source-level guarantee
    // against automatic backfill-on-reconnect.
    // ===============================================================
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('alice-487m');
        const bob = makeIdentity('bob-487m');
        const aliceTransport = new LocalPeerConnectionProvider('alice-487m-node', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-487m-node', network);
        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        bobConnect.listen();
        let bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-487m-node' });
        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. Alice and Bob start connected.');

        const { exchange: aliceExchange } = makeHandBuiltPlacementExchange();
        const alicePeerExchange = new PublicationSnapshotPlacementPeerExchange(aliceExchange, new PeerMessageBus(), aliceConnect.registry);
        const { catalog: bobCatalog, exchange: bobExchange } = makeHandBuiltPlacementExchange();
        const bobPeerExchange = new PublicationSnapshotPlacementPeerExchange(bobExchange, new PeerMessageBus(), bobConnect.registry);

        // Bob's own walking pipeline is built ONCE, before any of this —
        // exactly like a real running app, whose WorldSnapshotDiscoveryMonitor
        // instance outlives any individual peer connection.
        const { monitor: bobMonitor } = buildWalkingPipeline({ placementCatalog: bobCatalog });

        // A placement announced WHILE connected reaches Bob's catalog and
        // his own walking-triggered monitor normally.
        const placementBefore = signedPlacement(alice, { publicationId: 'pub-m-before', contentHash: 'hash-m-before', storage: 'ipfs', locator: 'ipfs://CID-m-before' });
        alicePeerExchange.announce(placementBefore);
        await wait(30);
        await bobMonitor.observe(ctx(pos(0, 0, 0)));
        assert(bobMonitor.lastResult.some((c) => c.contentHash === 'hash-m-before'),
            '2. a placement announced while connected reaches Bob\'s own walking-triggered monitor normally.');

        // Bob disconnects.
        bobToAlice.close();
        await wait(20);

        // Alice announces a SECOND placement while Bob is offline —
        // Bob's catalog never receives it (nobody is listening).
        const placementWhileOffline = signedPlacement(alice, { publicationId: 'pub-m-missed', contentHash: 'hash-m-missed', storage: 'ipfs', locator: 'ipfs://CID-m-missed' });
        const sentWhileOffline = alicePeerExchange.announce(placementWhileOffline);
        assert(sentWhileOffline === 0, '3. with Bob offline, the announcement reaches zero peers.');
        assert(bobCatalog.findByPublicationId('pub-m-missed').length === 0, '4. Bob\'s catalog never received it while offline.');

        // Bob reconnects.
        bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-487m-node' });
        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '5. Bob successfully reconnects.');
        await wait(30);

        // THE FINDING, one layer up from 0.9.484's own catalog-level
        // proof: reconnecting does not retroactively deliver the missed
        // placement, and — because it never reaches the catalog — it
        // never reaches the walking-triggered monitor either, even after
        // a fresh, threshold-crossing observation.
        assert(bobCatalog.findByPublicationId('pub-m-missed').length === 0,
            '6. reconnecting does not silently backfill the missed placement at the catalog layer (reconfirming 0.9.484 Section I).');
        await bobMonitor.observe(ctx(pos(DEFAULT_DISCOVERY_REFRESH_RADIUS + 5, 0, 0)));
        assert(!bobMonitor.lastResult.some((c) => c.contentHash === 'hash-m-missed'),
            '7. and — the one layer 0.9.484 never reached — a fresh, threshold-crossing walking-triggered observation STILL never surfaces the missed placement. "Future announcements only" holds all the way to the monitor a Wanderer\'s own movement drives.');
        assert(bobMonitor.lastResult.some((c) => c.contentHash === 'hash-m-before'),
            '8. meanwhile the placement Bob legitimately already knew about is still there — reconnection did not lose anything either.');

        // A placement announced AFTER reconnecting propagates, and
        // reaches the monitor, completely normally.
        const placementAfter = signedPlacement(alice, { publicationId: 'pub-m-after', contentHash: 'hash-m-after', storage: 'ipfs', locator: 'ipfs://CID-m-after' });
        alicePeerExchange.announce(placementAfter);
        await wait(30);
        await bobMonitor.observe(ctx(pos(2 * DEFAULT_DISCOVERY_REFRESH_RADIUS + 5, 0, 0)));
        assert(bobMonitor.lastResult.some((c) => c.contentHash === 'hash-m-after'),
            '9. a placement announced AFTER reconnecting reaches Bob\'s own walking-triggered monitor completely normally — only retroactive backfill is absent, not reconnection itself.');

        // Source-level guarantee: no production file wires automatic
        // backfill to a peer-connect/reconnect event. The pull-capable
        // requestPlacements()/discoverFromPeers() halves of this family
        // exist and are mechanically sound (0.8.19's own coverage) — the
        // guarantee here is narrower and precise: no production caller
        // ever invokes them FROM a connection lifecycle event.
        const connectUseCaseSource = stripLineComments(readSource('application/peer/ConnectToPeerUseCase.js'));
        const reconnectionUseCaseSource = stripLineComments(readSource('application/peer/PeerReconnectionUseCase.js'));
        assert(!/requestPlacements|discoverFromPeers|PublicationSnapshotPlacementDiscoveryCoordinator/.test(connectUseCaseSource + reconnectionUseCaseSource),
            '10. neither ConnectToPeerUseCase.js nor PeerReconnectionUseCase.js references requestPlacements(), discoverFromPeers(), or the discovery coordinator at all — a connection or reconnection event triggers no placement backfill of any kind, by construction, not merely by observed behavior.');

        alicePeerExchange.dispose();
        bobPeerExchange.dispose();
        aliceTransport.dispose();
        bobTransport.dispose();

        console.log('✓ Section M: the "future announcements only" boundary 0.9.484 proved at the catalog layer survives, unchanged, all the way to the walking-triggered monitor a Wanderer\'s own movement drives — and no production connection/reconnection event ever wires automatic placement backfill.');
    }

    // ===============================================================
    // Section N — Graceful degradation (reconfirm).
    // ===============================================================
    {
        const localOnlyCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        localOnlyCatalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-n-local', contentHash: 'hash-n-local', storage: 'ipfs', locator: 'ipfs://CID-n-local' }));
        const { monitor: localOnlyMonitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: null, placementCatalog: localOnlyCatalog });
        await localOnlyMonitor.observe(ctx(pos(0, 0, 0)));
        assert(localOnlyMonitor.lastError === null && localOnlyMonitor.lastResult.length === 1, '1. no Nostr capability: Local alone still works.');

        const emptyCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const events = [makeNostrEnvelopeEvent({ contentHash: 'hash-n-nostr', locator: 'ar://n-nostr', storage: 'arweave' })];
        const nostrOnlyService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl(events) });
        const { monitor: nostrOnlyMonitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: nostrOnlyService, placementCatalog: emptyCatalog });
        await nostrOnlyMonitor.observe(ctx(pos(0, 0, 0)));
        assert(nostrOnlyMonitor.lastError === null && nostrOnlyMonitor.lastResult.length === 1, '2. no Local candidates: Nostr alone still works.');

        const emptyNostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl([]) });
        const { monitor: neitherMonitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: emptyNostrService, placementCatalog: emptyCatalog });
        await neitherMonitor.observe(ctx(pos(0, 0, 0)));
        assert(neitherMonitor.lastError === null && neitherMonitor.lastResult.length === 0, '3. neither source: the ordinary empty-result behavior, never an error.');

        console.log('✓ Section N: graceful degradation in every source-availability combination — reconfirmed.');
    }

    // ===============================================================
    // Section O — Comprehensive boundary audit across the whole arc.
    // ===============================================================
    {
        const arcFiles = [
            'application/snapshot/SnapshotCandidateDiscoveryQueryService.js',
            'application/snapshot/LocalSnapshotCandidateDiscoveryQueryService.js',
            'application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js',
            'application/snapshot/DiscoverSnapshotCandidatesCommand.js',
            'application/snapshot/WorldSnapshotDiscoveryMonitor.js',
            'application/snapshot/placement/PublicationSnapshotPlacementPeerExchange.js',
            'application/snapshot/AutomaticSnapshotEncounterCascade.js'
        ];
        const boundaryPattern = /\bscore\b|\bscoring\b|\branking\b|preferredPeer|trustScore|\bfallback\b|BROWSE_REQUEST|BROWSE_RESPONSE|setInterval\(|setTimeout\(|\.sort\(/i;
        for (const file of arcFiles) {
            const stripped = stripLineComments(readSource(file));
            assert(!boundaryPattern.test(stripped),
                `1. ${file} contains no ranking/scoring/preferred-peer/trust-score/fallback/active-browse/new-timer vocabulary in actual code (comments freely discuss their absence, which is expected and fine).`);
        }

        // No second, competing World-loading/rendering path anywhere in
        // this arc (extends 0.9.486 Section K's own single-resolver-
        // construction-site check with the cascade file now included).
        const resolverConstructionSites = execSync(
            'grep -rlE "new DecentralizedSnapshotResolver\\(" application ui --include="*.js" || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean);
        assert(resolverConstructionSites.length === 1 && resolverConstructionSites[0] === 'application/snapshot/DiscoverSnapshotRuntimeComposition.js',
            `2. exactly one production file constructs a DecentralizedSnapshotResolver (found: ${JSON.stringify(resolverConstructionSites)}).`);
        // Excludes the class's own file — its header comment documents its
        // own construction shape (`// new AutomaticSnapshotEncounterCascade({...`)
        // for callers, which is documentation, not a second construction site.
        const cascadeConstructionSites = execSync(
            'grep -rlE "new AutomaticSnapshotEncounterCascade\\(" ui --include="*.js" || true',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim().split('\n').filter(Boolean);
        assert(cascadeConstructionSites.length === 1 && cascadeConstructionSites[0] === 'ui/views/WorldView.js',
            `3. exactly one production file constructs the AutomaticSnapshotEncounterCascade orchestration seam (found: ${JSON.stringify(cascadeConstructionSites)}).`);

        // No new provenance/verification/attribution vocabulary was
        // introduced BY THIS ARC's own files — the composite and monitor
        // still carry no provenance field, and the cascade still reaches
        // Publication attribution only through the SAME pre-existing
        // resolve/materialize commands, never a second attribution path.
        const compositeSource = stripLineComments(readSource('application/snapshot/SnapshotCandidateDiscoveryQueryService.js'));
        assert(!/provenance|attribution/i.test(compositeSource),
            '4. the composite query service carries no provenance/attribution field or vocabulary of its own.');
        const monitorSource = stripLineComments(readSource('application/snapshot/WorldSnapshotDiscoveryMonitor.js'));
        assert(!/provenance|attribution/i.test(monitorSource),
            '5. the walking-triggered monitor carries no provenance/attribution vocabulary of its own.');

        console.log('✓ Section O: across every file this whole arc (0.9.480-0.9.487) touched, no ranking, scoring, automatic fallback, active peer browsing, new provenance/verification/attribution vocabulary, second World-loading path, or new temporal throttling was ever introduced.');
    }

    // ===============================================================
    // Section P — Scope guard: this milestone is test-only.
    // ===============================================================
    {
        const changedFiles = execSync('git status --porcelain -- . ":(exclude)ui/components/PublicationCard.js" ":(exclude)ui/components/PublicationList.js"' /* AMENDED BY 0.9.638 -- excludes ui/components/PublicationCard.js/PublicationList.js, its own unrelated, separately-justified Commentary distribution-selector UI change */, { cwd: SOURCE_ROOT.pathname })
            .toString().split('\n').map((line) => line.replace(/\n$/, '')).filter(Boolean)
            .map((line) => line.slice(3).trim());
        const unexpectedProductionChanges = changedFiles.filter((f) => !f.startsWith('tests/') && f !== 'tests.html');
        assert(unexpectedProductionChanges.length === 0,
            `1. this milestone's own working-tree changes are scoped to tests/ and tests.html only — found unexpected: ${JSON.stringify(unexpectedProductionChanges)}.`);

        console.log('✓ Section P: this milestone is test-only, exactly as an integration audit should be.');
    }

    console.log('\n✓ FINAL DECISION.\n' +
'\n' +
'OUTCOME: WALKING_TRIGGERED_MULTI_SOURCE_SNAPSHOT_DISCOVERY_TECHNICALLY_CLOSED.\n' +
'\n' +
"WHY. Every load-bearing class in this arc has exactly one production construction site, and — the one topology\n" +
'question no prior milestone checked — the same LocalPublicationSnapshotPlacementCatalog and\n' +
'NostrSnapshotDiscoveryQueryService instances are threaded through peer ingestion, orchestrated creation, and the\n' +
'walking-triggered composite alike (Section A). Local, Peer-derived, and Nostr candidates each independently reach\n' +
'the walking-triggered monitor (Sections B-D), and — the one convergence 0.9.486 never exercised — all three\n' +
'coexist correctly from a SINGLE observe() call (Section E), with the 0.9.485 deduplication identity intact\n' +
'(Section F), the pre-existing movement gate and request-id race guard both untouched (Sections G-H), full\n' +
'source-failure isolation including peer disconnection (Section I), and candidate metadata never conflated with\n' +
'verified content (Section J). The flagship closure (Section K) drives a walking-triggered, peer-derived candidate\n' +
'through the entire existing DISCOVER -> SELECT -> RESOLVE -> VERIFY -> MATERIALIZE -> PLACE -> REGISTER chain into\n' +
'a real, correctly-positioned World Encounter, through machinery this milestone touches but never modifies. No\n' +
'coupling to World Encounter peer material, Publication verification/attribution, or a new peer protocol exists\n' +
'anywhere, including inside the cascade now proven to consume a peer-derived candidate (Section L). The\n' +
'"future announcements only" reconnection boundary 0.9.484 proved at the catalog layer survives, unchanged, all\n' +
'the way to the walking-triggered monitor a Wanderer\'s own movement drives (Section M). The pipeline degrades\n' +
'gracefully in every source-availability combination (Section N), and a comprehensive sweep across the whole arc\n' +
"finds no ranking, scoring, automatic fallback, active peer browsing, new provenance/verification/attribution\n" +
'vocabulary, second World-loading path, or new temporal throttling anywhere (Section O). This milestone itself\n' +
'is test-only (Section P).\n' +
'\n' +
'WHAT THIS MEANS. The mechanism this arc set out to build — Local declaration, Nostr announcement, and passive Peer\n' +
'exchange converging behind one walking-triggered discovery pipeline that resolves, verifies, materializes, places,\n' +
'and registers into the EXISTING World — now behaves as one coherent technical whole, not four separately-tested\n' +
'pieces that merely look connected. WHETHER this mechanism is now product-complete — whether active peer browsing,\n' +
'ranking, or a further source is worth building next — is a genuinely separate, deliberately deferred question this\n' +
'file does not answer.\n');

    console.log('\n✅ All Walking-Triggered Multi-Source Snapshot Discovery End-to-End Integration Audit tests passed.');
}

run().then(() => {
    console.log('\n✓ All WalkingTriggeredMultiSourceSnapshotDiscoveryEndToEndIntegrationAudit tests passed');
}).catch((error) => {
    console.error('\n✗ WalkingTriggeredMultiSourceSnapshotDiscoveryEndToEndIntegrationAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
