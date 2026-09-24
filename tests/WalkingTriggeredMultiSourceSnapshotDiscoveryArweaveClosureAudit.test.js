import { execSync } from 'node:child_process';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/snapshot/placement/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationSnapshotPlacement } from '../core/PublicationSnapshotPlacement.js';
import { SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, SNAPSHOT_DISCOVERY_ENVELOPE_VERSION } from '../core/SnapshotDiscoveryEnvelope.js';
import { NostrSnapshotDiscoveryQueryService } from '../application/nostr/NostrSnapshotDiscoveryQueryService.js';
import { ArweaveSnapshotDiscoveryQueryService } from '../application/arweave/ArweaveSnapshotDiscoveryQueryService.js';
import { SnapshotCandidateDiscoveryQueryService } from '../application/snapshot/SnapshotCandidateDiscoveryQueryService.js';
import { composeSnapshotCandidateDiscoveryRuntime } from '../application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/snapshot/WorldSnapshotDiscoveryMonitor.js';
import { DEFAULT_DISCOVERY_REFRESH_RADIUS } from '../application/snapshot/ShouldRefreshSnapshotDiscovery.js';
import { DecentralizedSnapshotResolver } from '../application/snapshot/DecentralizedSnapshotResolver.js';
import { executeResolveSelectedSnapshotCommand } from '../application/snapshot/ResolveSelectedSnapshotCommand.js';
import { DecentralizedSnapshotResolutionOutcome } from '../application/snapshot/DecentralizedSnapshotResolutionOutcome.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/snapshot/materialization/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { AutomaticSnapshotEncounterCascade } from '../application/snapshot/AutomaticSnapshotEncounterCascade.js';
import { AutomaticSnapshotEncounterCascadeOutcome } from '../application/snapshot/AutomaticSnapshotEncounterCascadeOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/snapshot/placement/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/snapshot/placement/SnapshotWorldRegistrationOutcome.js';
import { WorldDiscoverySourceRegistry } from '../application/discovery/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoveryRegistry } from '../application/discovery/WorldDiscoveryRegistryProjection.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { Publication } from '../publisher/Publication.js';
import { worldViewFiles, mainFiles } from './support/SourceFileGroups.js';

// 0.9.501 — Walking-Triggered Multi-Source Snapshot Discovery End-to-End
// Integration Audit (Arweave Closure).
//
// Type: test-only closure audit. Zero production changes.
//
// tests/WalkingTriggeredSnapshotCandidateDiscoveryIntegrationAudit.test.js
// (0.9.486) wired Local+Nostr walking-triggered discovery into the real
// production command/monitor. tests/WalkingTriggeredMultiSourceSnapshotDiscoveryEndToEndIntegrationAudit
// .test.js (0.9.487) drove that Local+Nostr arc all the way to a rendered
// World Encounter, through the real, already-production
// `AutomaticSnapshotEncounterCascade` (0.9.187/0.9.193) `ui/views/WorldView.js`
// already wires to `worldSnapshotDiscoveryMonitor`. tests/
// SnapshotCandidateDiscoveryArweaveCompositionIntegrationAudit.test.js
// (0.9.500) then composed Arweave in as a genuine third source, alongside
// Local and Nostr, behind the identical `search(discoveryTag)` composite —
// but only against the BARE composite, never through the walking trigger,
// and never past a `search()` call. This file is the missing closure: the
// SAME 0.9.487 flagship question, asked again with Arweave as the
// candidate's own source —
//
//   Can an Arweave-discovered Snapshot travel through the EXACT SAME
//   downstream pipeline as a Local- or Nostr-discovered Snapshot, without
//   introducing an Arweave-specific branch anywhere?
//
//   Walking
//      │
//      ▼
//   distance threshold (application/snapshot/ShouldRefreshSnapshotDiscovery.js)
//      │
//      ▼
//   DiscoverSnapshotCandidatesCommand
//      │
//      ▼
//   SnapshotCandidateDiscoveryQueryService
//      ├── Local
//      ├── Nostr
//      └── Arweave
//             │
//             ▼
//        candidate set (WorldSnapshotDiscoveryMonitor#lastResult)
//             │
//             ▼
//        AutomaticSnapshotEncounterCascade#processCandidate()
//        (0.9.187/0.9.193, UNMODIFIED — the SAME real orchestrator
//         ui/views/WorldView.js already wires to the monitor above)
//             │
//             ├── RESOLVE   (DecentralizedSnapshotResolver, real
//             │              ArweaveContentStore, genuine hash
//             │              verification)
//             ├── MATERIALIZE
//             ├── PLACE
//             └── REGISTER  (WorldDiscoverySourceRegistry)
//             │
//             ▼
//        World Encounter (describeWorldFromDiscoveryRegistry)
//
// THE AUTOMATIC CASCADE ALREADY EXISTS AND IS ALREADY WIRED — a finding
// this milestone's own requesting brief did not assume. Some file headers
// in this arc (`application/snapshot/WorldSnapshotDiscoveryMonitor.js`'s own
// 0.9.186 comment) still describe "composing background discovery with
// [resolve/materialize/place/register]" as "a separate, later, unscheduled
// seam" — true when THAT file was written, superseded since 0.9.187/0.9.193:
// `ui/views/WorldView.js`'s own `refreshSpatialUI()` already feeds
// `worldSnapshotDiscoveryMonitor.observe()`'s own `lastResult`, one
// candidate at a time, straight into a real, live
// `AutomaticSnapshotEncounterCascade` on every spatial tick. This audit
// therefore proves the flagship path through that REAL AUTOMATIC
// orchestrator — never a hand-rolled stand-in for it — because that really
// is how a walking-discovered candidate reaches the World today.
//
//   Section A — Real production topology: exactly one Local/Nostr/Arweave
//               construction site each, one composite, one monitor, and
//               ui/views/WorldView.js's own real cascade wired to that
//               SAME monitor's lastResult.
//   Section B — Walking actually triggers all three sources, through the
//               real movement/threshold machinery — never a bare
//               queryService.search() call.
//   Section C — Arweave candidate fidelity: contentHash/locator=ar://
//               <content-tx>/storage='ar', announcement tx id never leaks
//               into locator, observed at the walking-triggered monitor.
//   Section D — Cross-source convergence and same-hash/different-locator
//               distinctness, walking-triggered.
//   Section E — Source failure isolation across all eight combinations,
//               through the walking trigger.
//   Section F — THE FLAGSHIP PATH: a real Arweave announcement reaches
//               walking discovery and is driven, by the REAL, PRODUCTION
//               AutomaticSnapshotEncounterCascade, through resolve /
//               verify / materialize / place / register, ending in a
//               genuine World Encounter.
//   Section G — Provenance stays separate: discovery source, content
//               storage, publication identity, and announcement
//               transaction identity never collapse into one field.
//   Section H — No World-specific Arweave logic anywhere in the
//               downstream pipeline (monitor, command, resolver,
//               placement, registration, cascade); no second Arweave
//               material-loading path exists.
//   Section I — Performance baseline, measured under the real walking
//               workflow: one GraphQL request + N gateway fetches per
//               observation.
//   Section J — Race and lifecycle: a slow Arweave source never lets a
//               stale observation overwrite a newer one, and Arweave
//               failure/latency never breaks the monitor's own lifecycle.
//   Section K — The architectural invariant: once a candidate enters the
//               composite, its source is irrelevant to every downstream
//               component — the SAME cascade instance drives a Local-,
//               Nostr-, and Arweave-discovered candidate to REGISTERED
//               with no branch of its own.
//   Section L — Scope guard: zero production changes.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

function readSource(relativePath) {
    return execSync(`cat "${relativePath}"`, { cwd: SOURCE_ROOT.pathname }).toString();
}

function stripLineComments(source) {
    return source.replace(/\/\/.*$/gm, '');
}

function pos(x, y, z) { return { x, y, z }; }
function ctx(position) { return { position }; }

async function flushMicrotasks() {
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeNostrQueryImpl(events) {
    return async () => events;
}

function makeNostrEnvelopeEvent({ contentHash, locator, storage }) {
    return { content: JSON.stringify({ protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION, contentHash, locator, storage }) };
}

function arweaveEnvelopeJson({ contentHash, locator, storage, publicationId }) {
    const content = { protocol: SNAPSHOT_DISCOVERY_ENVELOPE_PROTOCOL, version: SNAPSHOT_DISCOVERY_ENVELOPE_VERSION, contentHash, locator, storage };
    if (publicationId !== undefined) {
        content.publicationId = publicationId;
        content.claimedPosition = { x: 0, y: 0, z: 0 };
    }
    return JSON.stringify(content);
}

// A deterministic, network-free stand-in for both Arweave's GraphQL
// gateway and its raw transaction gateway — mirrors
// tests/ArweaveSnapshotDiscoveryQueryService.test.js's own makeFakeGateway,
// extended here to ALSO serve the announced CONTENT transaction's own
// bytes (never just its envelope), so the flagship section (F) can
// retrieve real Snapshot material through a real ArweaveContentStore
// against the SAME fake transport.
function makeFakeArweaveGateway({ transactionIds = [], envelopes = {}, contentBodies = {} } = {}) {
    let graphqlCalls = 0;
    let gatewayCalls = 0;
    const gatewayRequestedIds = [];
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if ((options.method || 'GET') === 'POST') {
            graphqlCalls += 1;
            return { ok: true, json: async () => ({ data: { transactions: { edges: transactionIds.map((id) => ({ node: { id } })) } } }) };
        }
        gatewayCalls += 1;
        const id = parsed.pathname.slice(1);
        gatewayRequestedIds.push(id);
        if (Object.prototype.hasOwnProperty.call(envelopes, id)) {
            return { ok: true, headers: { get: () => null }, text: async () => envelopes[id] };
        }
        if (Object.prototype.hasOwnProperty.call(contentBodies, id)) {
            return { ok: true, headers: { get: () => null }, text: async () => contentBodies[id] };
        }
        return { ok: false, headers: { get: () => null }, text: async () => 'not found' };
    }
    return { fetchImpl, counts: () => ({ graphqlCalls, gatewayCalls }), gatewayRequestedIds };
}

// A signer whose sign() always throws — every scenario below only ever
// needs ArweaveContentStore#get() (retrieval); nothing in this file
// exercises put() (publishing), so the write side is deliberately left
// unusable rather than silently faked.
function unusedSigner() {
    return { sign: async () => { throw new Error('ArweaveContentStore#put() is not exercised by this audit'); } };
}

// Builds the SAME shape ui/main.js's own production wiring builds: a
// discoverSnapshotCandidatesCommand backed by the real three-source
// composite, and a WorldSnapshotDiscoveryMonitor wrapping it.
function buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService = null, arweaveSnapshotDiscoveryQueryService = null, placementCatalog }) {
    const { queryService } = composeSnapshotCandidateDiscoveryRuntime({ nostrSnapshotDiscoveryQueryService, arweaveSnapshotDiscoveryQueryService, placementCatalog });
    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
        discoveryTag: 'forkbuild-snapshot',
        discoveryQueryService: queryService
    });
    const monitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });
    return { queryService, discoverSnapshotCandidatesCommand, monitor };
}

// Builds the SAME shape ui/views/WorldView.js's own refreshSpatialUI()
// wires: resolveSelectedSnapshotCommand/materializeSelectedSnapshotCommand
// over a caller-supplied contentStore, plus a fresh
// AutomaticSnapshotEncounterCascade over a fresh registry and a trivial
// publication/placement lookup table this test controls directly (playing
// the SAME role WorldNavigationSession#getPlacementInfoForPublication()/
// findPublicationById() play in production).
function buildAutomaticCascade({ queryService, contentStore, placementsByPublicationId = {}, publicationsByPublicationId = {} }) {
    const resolver = new DecentralizedSnapshotResolver(queryService);
    const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({ candidate, resolver, contentStore });

    const localContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
    const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);
    const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({ resolution, materializer });

    const registry = new WorldDiscoverySourceRegistry();
    const cascade = new AutomaticSnapshotEncounterCascade({
        resolveSelectedSnapshotCommand,
        materializeSelectedSnapshotCommand,
        worldDiscoverySourceRegistry: registry,
        resolvePlacementInfo: (publicationId) => placementsByPublicationId[publicationId] || null,
        findPublicationById: (publicationId) => publicationsByPublicationId[publicationId] || null
    });
    return { cascade, registry, localContentStore };
}

async function run() {
    console.log('=== 0.9.501 — Walking-Triggered Multi-Source Snapshot Discovery End-to-End Integration Audit (Arweave Closure) ===\n');

    // ===============================================================
    // Section A — Real production topology.
    // ===============================================================
    {
        const mainSource = stripLineComments((await Promise.all(mainFiles().map((file) => readSource(file)))).join('\n'));
        const worldViewSource = stripLineComments(worldViewFiles().map((file) => readSource(file)).join('\n'));

        const nostrSites = execSync('grep -rlE "new NostrSnapshotDiscoveryQueryService\\(" application ui --include="*.js" || true', { cwd: SOURCE_ROOT.pathname }).toString().trim().split('\n').filter(Boolean);
        const arweaveSites = execSync('grep -rlE "new ArweaveSnapshotDiscoveryQueryService\\(" application ui --include="*.js" || true', { cwd: SOURCE_ROOT.pathname }).toString().trim().split('\n').filter(Boolean);
        assert(arweaveSites.length === 1 && arweaveSites[0] === 'ui/main.js',
            `1. exactly one production file constructs an ArweaveSnapshotDiscoveryQueryService (found: ${JSON.stringify(arweaveSites)}).`);
        assert(nostrSites.length >= 1, '2. NostrSnapshotDiscoveryQueryService is still constructed somewhere in production (unchanged Nostr wiring).');

        assert((mainSource.match(/composeSnapshotCandidateDiscoveryRuntime\(/g) || []).length === 1,
            '3. composeSnapshotCandidateDiscoveryRuntime() is called exactly once — one composite, never a duplicate.');
        assert((mainSource.match(/new WorldSnapshotDiscoveryMonitor\(/g) || []).length === 1,
            '4. exactly one WorldSnapshotDiscoveryMonitor is constructed — one walking-trigger path, never a second, Arweave-specific one.');
        assert(/arweaveSnapshotDiscoveryQueryService,/.test(mainSource) && /composeSnapshotCandidateDiscoveryRuntime\(\{\s*\n\s*nostrSnapshotDiscoveryQueryService: snapshotDiscoveryQueryService,\s*\n\s*arweaveSnapshotDiscoveryQueryService,\s*\n\s*placementCatalog: publicationSnapshotPlacementCatalog/.test(mainSource),
            '5. the production composite is built from exactly Nostr + Arweave + the Local placement catalog — no fourth collaborator, no alternate discovery path.');

        // The real automatic cascade — proving the closure path this
        // milestone audits is not hypothetical: it is wired, today, in
        // production, from the SAME monitor Sections B-E below drive.
        assert((worldViewSource.match(/new AutomaticSnapshotEncounterCascade\(/g) || []).length === 1,
            '6. ui/views/WorldView.js constructs exactly one AutomaticSnapshotEncounterCascade.');
        assert(/worldSnapshotDiscoveryMonitor\.observe\(spatialContext\.value\)\.then\(\(\) => \{\s*\n\s*const candidates = worldSnapshotDiscoveryMonitor\.lastResult;\s*\n\s*if \(Array\.isArray\(candidates\)\) \{\s*\n\s*candidates\.forEach\(\(candidate\) => automaticSnapshotEncounterCascade\.processCandidate\(candidate\)/.test(worldViewSource),
            '7. the SAME worldSnapshotDiscoveryMonitor observation this file drives is, in real production, fed one candidate at a time straight into automaticSnapshotEncounterCascade.processCandidate() — the closure path this milestone audits is the SAME one running live today, never a hypothetical this file invents.');

        console.log('✓ Section A: real production topology confirmed — one Local catalog, one Nostr service, one Arweave service, one composite, one walking monitor, and the real, already-wired AutomaticSnapshotEncounterCascade feeding straight off that monitor\'s own lastResult. No duplicate Arweave service, no alternate discovery path.');
    }

    // ===============================================================
    // Section B — Walking actually triggers all three sources.
    // ===============================================================
    {
        let localCalls = 0, nostrCalls = 0, arweaveGraphqlCalls = 0;

        const catalog = { list() { localCalls += 1; return [{ contentHash: 'hash-b-local', locator: 'ipfs://CID-b-local', storage: 'ipfs', publicationId: 'pub-b' }]; } };
        const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: async () => { nostrCalls += 1; return [makeNostrEnvelopeEvent({ contentHash: 'hash-b-nostr', locator: 'ar://b-nostr', storage: 'ar' })]; } });
        const ARWEAVE_ID = 'AnnounceTxB0000000000000000000000000000';
        const gateway = makeFakeArweaveGateway({ transactionIds: [ARWEAVE_ID], envelopes: { [ARWEAVE_ID]: arweaveEnvelopeJson({ contentHash: 'hash-b-arweave', locator: 'ar://ContentTxB0000000000000000000000000', storage: 'ar' }) } });
        const arweaveService = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        const originalGraphqlFetch = arweaveService._searchAnnouncementTransactionIds.bind(arweaveService);
        arweaveService._searchAnnouncementTransactionIds = (tag) => { arweaveGraphqlCalls += 1; return originalGraphqlFetch(tag); };

        const { monitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: nostrService, arweaveSnapshotDiscoveryQueryService: arweaveService, placementCatalog: catalog });

        // A single real walking observation, through the real movement-
        // threshold decision boundary — never a bare queryService.search().
        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(localCalls === 1, '1. the walking observation reached the Local source.');
        assert(nostrCalls === 1, '2. the walking observation reached the Nostr source.');
        assert(arweaveGraphqlCalls === 1, '3. the walking observation reached the Arweave source (its own GraphQL step invoked exactly once).');
        assert(monitor.lastResult.length === 3
            && monitor.lastResult.some((c) => c.contentHash === 'hash-b-local')
            && monitor.lastResult.some((c) => c.contentHash === 'hash-b-nostr')
            && monitor.lastResult.some((c) => c.contentHash === 'hash-b-arweave'),
            '4. all three sources\' own candidates converge into the monitor\'s single lastResult, from one movement -> threshold -> observation -> three-source query call.');

        // The pre-existing movement gate still holds with three real
        // sources behind it — a sub-threshold movement never re-queries.
        localCalls = 0; nostrCalls = 0; arweaveGraphqlCalls = 0;
        await monitor.observe(ctx(pos(1, 0, 0)));
        assert(localCalls === 0 && nostrCalls === 0 && arweaveGraphqlCalls === 0,
            '5. a sub-threshold movement triggers none of the three sources — the existing request-id race protection\'s own movement gate is preserved with Arweave in the loop.');

        console.log('✓ Section B: a real movement → threshold-crossing → observation reaches all three sources in one call, and the pre-existing movement gate still suppresses a sub-threshold re-query.');
    }

    // ===============================================================
    // Section C — Arweave candidate fidelity, walking-triggered.
    // ===============================================================
    {
        const ANNOUNCEMENT_ID = 'AnnounceTxC0000000000000000000000000000';
        const CONTENT_TX = 'ar://ContentTxC00000000000000000000000000';
        const gateway = makeFakeArweaveGateway({
            transactionIds: [ANNOUNCEMENT_ID],
            envelopes: { [ANNOUNCEMENT_ID]: arweaveEnvelopeJson({ contentHash: 'hash-c', locator: CONTENT_TX, storage: 'ar' }) }
        });
        const arweaveService = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        const emptyCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        const { monitor } = buildWalkingPipeline({ arweaveSnapshotDiscoveryQueryService: arweaveService, placementCatalog: emptyCatalog });

        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(monitor.lastResult.length === 1, '1. exactly one Arweave-origin candidate reaches the walking-triggered monitor.');
        const candidate = monitor.lastResult[0];
        assert(candidate.contentHash === 'hash-c', '2. contentHash survives unchanged.');
        assert(candidate.locator === CONTENT_TX && candidate.locator.startsWith('ar://'), '3. locator is the announced ar://<content-transaction> locator, unchanged.');
        assert(candidate.storage === 'ar', '4. storage survives unchanged.');
        assert(candidate.locator !== `ar://${ANNOUNCEMENT_ID}` && !candidate.locator.includes(ANNOUNCEMENT_ID),
            '5. the ANNOUNCEMENT transaction id (the id this file\'s own gateway fetch targeted) never leaks into the candidate\'s own locator, observed at the far side of the full walking pipeline.');

        console.log('✓ Section C: an Arweave announcement\'s contentHash/locator/storage survive the walking-triggered pipeline verbatim, and the announcement transaction id never leaks into the locator.');
    }

    // ===============================================================
    // Section D — Cross-source convergence, walking-triggered.
    // ===============================================================
    {
        // D1. Identical claim from all three sources collapses to one.
        const sharedContentHash = 'hash-d-shared';
        const sharedLocator = 'ar://ContentTxD-shared0000000000000000000';
        const catalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        catalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-d-shared', contentHash: sharedContentHash, storage: 'ar', locator: sharedLocator }));
        const nostrService = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl([makeNostrEnvelopeEvent({ contentHash: sharedContentHash, locator: sharedLocator, storage: 'ar' })]) });
        const ANNOUNCEMENT_ID_1 = 'AnnounceTxD10000000000000000000000000000';
        const gateway1 = makeFakeArweaveGateway({ transactionIds: [ANNOUNCEMENT_ID_1], envelopes: { [ANNOUNCEMENT_ID_1]: arweaveEnvelopeJson({ contentHash: sharedContentHash, locator: sharedLocator, storage: 'ar' }) } });
        const arweaveService = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway1.fetchImpl });

        const { monitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: nostrService, arweaveSnapshotDiscoveryQueryService: arweaveService, placementCatalog: catalog });
        await monitor.observe(ctx(pos(0, 0, 0)));
        assert(monitor.lastResult.length === 1 && monitor.lastResult[0].contentHash === sharedContentHash,
            '1. the identical storage+contentHash+locator claim, reported by Local, Nostr, AND Arweave at once, collapses to exactly one candidate at the walking-triggered monitor.');

        // D2. Same contentHash, different locator (Arweave vs. Nostr) stays distinct.
        const ANNOUNCEMENT_ID_2 = 'AnnounceTxD20000000000000000000000000000';
        const gateway2 = makeFakeArweaveGateway({ transactionIds: [ANNOUNCEMENT_ID_2], envelopes: { [ANNOUNCEMENT_ID_2]: arweaveEnvelopeJson({ contentHash: 'hash-d-multi', locator: 'ar://ContentTxD-ARWEAVE', storage: 'ar' }) } });
        const arweaveService2 = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway2.fetchImpl });
        const nostrService2 = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl([makeNostrEnvelopeEvent({ contentHash: 'hash-d-multi', locator: 'ar://ContentTxD-NOSTR', storage: 'ar' })]) });
        const emptyCatalog2 = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());

        const { monitor: monitor2 } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService: nostrService2, arweaveSnapshotDiscoveryQueryService: arweaveService2, placementCatalog: emptyCatalog2 });
        await monitor2.observe(ctx(pos(0, 0, 0)));
        assert(monitor2.lastResult.length === 2
            && monitor2.lastResult.some((c) => c.locator === 'ar://ContentTxD-ARWEAVE')
            && monitor2.lastResult.some((c) => c.locator === 'ar://ContentTxD-NOSTR'),
            '2. the same contentHash reported under two DIFFERENT locators (Arweave vs. Nostr) remains two separate candidates at the walking-triggered monitor.');

        console.log('✓ Section D: the existing storage+contentHash+locator dedup identity holds exactly through the walking-triggered pipeline — convergence when the claim genuinely matches, distinctness when only the contentHash matches.');
    }

    // ===============================================================
    // Section E — Source failure isolation, walking-triggered.
    // ===============================================================
    {
        const workingLocalCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
        workingLocalCatalog.add(new PublicationSnapshotPlacement({ publicationId: 'pub-e', contentHash: 'hash-e-local', storage: 'ipfs', locator: 'ipfs://e-local' }));
        const emptyLocalCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());

        const workingNostr = new NostrSnapshotDiscoveryQueryService({ queryImpl: makeNostrQueryImpl([makeNostrEnvelopeEvent({ contentHash: 'hash-e-nostr', locator: 'ar://e-nostr', storage: 'ar' })]) });
        const failingNostr = { search: () => Promise.reject(new Error('nostr-down')) };

        function makeWorkingArweave() {
            const id = 'AnnounceTxE0000000000000000000000000000';
            const gateway = makeFakeArweaveGateway({ transactionIds: [id], envelopes: { [id]: arweaveEnvelopeJson({ contentHash: 'hash-e-arweave', locator: 'ar://e-arweave', storage: 'ar' }) } });
            return new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        }
        const failingArweave = { search: () => Promise.reject(new Error('arweave-down')) };

        const matrix = [
            { local: true, nostr: true, arweave: true, expect: ['hash-e-local', 'hash-e-nostr', 'hash-e-arweave'] },
            { local: false, nostr: true, arweave: true, expect: ['hash-e-nostr', 'hash-e-arweave'] },
            { local: true, nostr: false, arweave: true, expect: ['hash-e-local', 'hash-e-arweave'] },
            { local: true, nostr: true, arweave: false, expect: ['hash-e-local', 'hash-e-nostr'] },
            { local: false, nostr: false, arweave: true, expect: ['hash-e-arweave'] },
            { local: false, nostr: true, arweave: false, expect: ['hash-e-nostr'] },
            { local: true, nostr: false, arweave: false, expect: ['hash-e-local'] },
            { local: false, nostr: false, arweave: false, expect: [] }
        ];

        let index = 0;
        for (const row of matrix) {
            index += 1;
            const placementCatalog = row.local ? workingLocalCatalog : emptyLocalCatalog;
            const nostrSnapshotDiscoveryQueryService = row.nostr ? workingNostr : failingNostr;
            const arweaveSnapshotDiscoveryQueryService = row.arweave ? makeWorkingArweave() : failingArweave;

            const { monitor } = buildWalkingPipeline({ nostrSnapshotDiscoveryQueryService, arweaveSnapshotDiscoveryQueryService, placementCatalog });
            await monitor.observe(ctx(pos(0, 0, 0)));

            const got = (monitor.lastResult || []).map((c) => c.contentHash).sort();
            const want = row.expect.slice().sort();
            assert(monitor.lastError === null, `${index}. Local=${row.local ? '✓' : '✗'} Nostr=${row.nostr ? '✓' : '✗'} Arweave=${row.arweave ? '✓' : '✗'}: the walking-triggered monitor never records an error, whatever the availability combination.`);
            assert(JSON.stringify(got) === JSON.stringify(want), `${index}b. expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}.`);
        }

        console.log('✓ Section E: all eight Local/Nostr/Arweave availability combinations, exercised through the real walking trigger (never the bare composite), leave the monitor in exactly the expected state — an Arweave-only observation (row 5) still surfaces its candidate, and an Arweave outage (rows 4/7/8) never disturbs Local/Nostr.');
    }

    // ===============================================================
    // Section F — THE FLAGSHIP PATH.
    //
    //   ARWEAVE ANNOUNCEMENT -> walking discovery -> candidate ->
    //   AutomaticSnapshotEncounterCascade (the REAL, production
    //   orchestrator) -> resolve -> verify -> materialize -> place ->
    //   register -> World Encounter
    // ===============================================================
    {
        // --- ARWEAVE ANNOUNCEMENT ---------------------------------------
        // A real publisher would have already: hashed Snapshot bytes,
        // uploaded them as an Arweave CONTENT transaction, then announced
        // { contentHash, locator: ar://<content-tx>, storage: 'ar',
        // publicationId, claimedPosition } in a SEPARATE, tagged
        // ANNOUNCEMENT transaction (application/
        // ArweaveSnapshotDiscoveryPublisher.js, 0.9.498). `publicationId`
        // is required here — never for locator/hash fidelity, but because
        // AutomaticSnapshotEncounterCascade#processCandidate() (0.9.187)
        // treats it as the one fact naming WHICH Publication's placement to
        // even ask about; a candidate without one is INELIGIBLE by design
        // (see that file's own header, "a publicationId is the processing
        // subject"). `claimedPosition` itself is never consumed — the
        // cascade always asks resolvePlacementInfo() for an INDEPENDENT,
        // already-known placement instead (see Section F's own assertion
        // 8, below).
        const snapshotBytesText = 'flagship-arweave-snapshot-bytes-0.9.501';
        const contentHash = computeContentHash(snapshotBytesText);
        const publicationId = 'pub-flagship-arweave';
        const ANNOUNCEMENT_TX = 'AnnounceTxFlagship00000000000000000000000';
        const CONTENT_TX = 'ContentTxFlagship000000000000000000000000';
        const contentLocator = `ar://${CONTENT_TX}`;

        const gateway = makeFakeArweaveGateway({
            transactionIds: [ANNOUNCEMENT_TX],
            envelopes: { [ANNOUNCEMENT_TX]: arweaveEnvelopeJson({ contentHash, locator: contentLocator, storage: 'ar', publicationId }) },
            contentBodies: { [CONTENT_TX]: snapshotBytesText }
        });
        const arweaveSnapshotDiscoveryQueryService = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        const emptyCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());

        // --- WALKING DISCOVERY -------------------------------------------
        const { queryService, monitor } = buildWalkingPipeline({ arweaveSnapshotDiscoveryQueryService, placementCatalog: emptyCatalog });
        await monitor.observe(ctx(pos(0, 0, 0)));

        // --- CANDIDATE -----------------------------------------------------
        assert(monitor.lastError === null, '1. no error is recorded by the walking-triggered monitor.');
        assert(monitor.lastResult.length === 1, '2. exactly one candidate reached the monitor.');
        const discoveredCandidate = monitor.lastResult[0];
        assert(discoveredCandidate.contentHash === contentHash && discoveredCandidate.locator === contentLocator && discoveredCandidate.storage === 'ar',
            '3. the walking-discovered candidate is an unresolved locator claim, carrying exactly the announced contentHash/locator/storage.');
        assert(discoveredCandidate.bytes === undefined,
            '4. the candidate carries no bytes of its own — discovery and retrieval remain two separate steps.');

        // --- THE REAL, PRODUCTION AUTOMATIC CASCADE ------------------------
        // A real DecentralizedSnapshotResolver (0.9.152, unmodified) against
        // a real ArweaveContentStore (0.9.132, unmodified) — the exact
        // production content-store CLASS `ui/main.js`'s own
        // `snapshotRetrievalContentStore` already is, injected here with a
        // fake `fetchImpl` for determinism — wired into the SAME, real,
        // unmodified `AutomaticSnapshotEncounterCascade` `ui/views/WorldView.js`
        // already wires to `worldSnapshotDiscoveryMonitor`.
        const arweaveContentStore = new ArweaveContentStore({ signer: unusedSigner(), fetchImpl: gateway.fetchImpl });
        const knownPlacement = { placementId: 'placement-flagship', publicationId, position: { x: 42, y: 0, z: 7 } };
        const publication = new Publication({ id: publicationId, title: 'Flagship Arweave Snapshot' });
        const { cascade, registry, localContentStore } = buildAutomaticCascade({
            queryService,
            contentStore: arweaveContentStore,
            placementsByPublicationId: { [publicationId]: knownPlacement },
            publicationsByPublicationId: { [publicationId]: publication }
        });

        // Exactly the real production call site: `WorldSnapshotDiscoveryMonitor
        // #lastResult`, handed one candidate at a time to
        // `AutomaticSnapshotEncounterCascade#processCandidate()`.
        const result = await cascade.processCandidate(discoveredCandidate);

        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            `5. the walking-discovered Arweave candidate reaches REGISTERED through the real, unmodified AutomaticSnapshotEncounterCascade (got ${result.outcome}, reason: ${result.reason}).`);
        assert(result.contentHash === contentHash && result.publicationId === publicationId,
            '6. the cascade\'s own result names the correct contentHash/publicationId.');

        // --- SNAPSHOT MATERIAL, VERIFIED ---------------------------------
        assert(await localContentStore.has({ hash: contentHash }),
            '7. this replica now genuinely possesses the bytes locally — a fresh has() check against the real local content store succeeds, proving retrieval and hash verification actually ran (not merely a mocked-through outcome).');

        // --- PLACEMENT: BORROWED, NEVER RECOMPUTED FROM THE LOCATOR --------
        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 1, '8. exactly one World Encounter now exists.');
        const encounter = view.publications[0];
        assert(encounter.objectId === publicationId, '9. the World Encounter names the correct Publication.');
        assert(encounter.x === 42 && encounter.y === 0 && encounter.z === 7,
            '10. the World Encounter sits at exactly the ALREADY-KNOWN placement\'s own position — never at the Arweave-claimed { x: 0, y: 0, z: 0 } the announcement itself carried, proving the cascade never promotes a claimed position to authoritative placement.');

        console.log('✓ Section F: ARWEAVE ANNOUNCEMENT → walking discovery → candidate → the REAL, PRODUCTION AutomaticSnapshotEncounterCascade (resolve → verify → materialize → place → register) → World Encounter — every step the real, unmodified production class, exactly as ui/views/WorldView.js already runs it on every spatial tick.');
    }

    // ===============================================================
    // Section G — Provenance stays separate.
    // ===============================================================
    {
        const ANNOUNCEMENT_ID = 'AnnounceTxG0000000000000000000000000000';
        const CONTENT_TX = 'ar://ContentTxG00000000000000000000000000';
        const gateway = makeFakeArweaveGateway({
            transactionIds: [ANNOUNCEMENT_ID],
            envelopes: { [ANNOUNCEMENT_ID]: arweaveEnvelopeJson({ contentHash: 'hash-g', locator: CONTENT_TX, storage: 'ar' }) }
        });
        const arweaveService = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });
        const { monitor } = buildWalkingPipeline({ arweaveSnapshotDiscoveryQueryService: arweaveService, placementCatalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()) });
        await monitor.observe(ctx(pos(0, 0, 0)));

        const candidate = monitor.lastResult[0];

        // 1. `storage` names CONTENT STORAGE ('ar'), never discovery
        // provenance ('arweave-discovery' or similar) — the identical
        // string a Local-catalog or Nostr-discovered candidate for the
        // same backend would also carry.
        assert(candidate.storage === 'ar', '1. `storage` names the content storage backend, not which source discovered the candidate.');

        // 2. No field on the candidate names WHICH discovery source
        // (Local/Nostr/Arweave) produced it — discovery provenance is
        // information the CALLER already has (which source's search()
        // this candidate arrived through), never baked into the shared
        // candidate vocabulary.
        const candidateKeys = Object.keys(candidate).sort();
        assert(!candidateKeys.some((k) => /source|origin|discover|provenance/i.test(k)),
            `2. the candidate carries no discovery-provenance field of any kind — keys are exactly ${JSON.stringify(candidateKeys)}.`);

        // 3. The announcement transaction id (announcement identity) never
        // appears anywhere on the candidate — confirmed again here, at
        // the provenance-specific angle: not merely "not in locator" (C5)
        // but absent from the object entirely.
        assert(!candidateKeys.includes('announcementId') && JSON.stringify(candidate).indexOf(ANNOUNCEMENT_ID) === -1,
            '3. the announcement transaction id (announcement identity) appears nowhere on the reported candidate — a wholly separate identity from contentHash/locator/storage.');

        // 4. publicationId (publication identity), when present, is its
        // own field — never merged into, or derived from, storage/locator.
        const ANNOUNCEMENT_ID_2 = 'AnnounceTxG20000000000000000000000000000';
        const gateway2 = makeFakeArweaveGateway({
            transactionIds: [ANNOUNCEMENT_ID_2],
            envelopes: { [ANNOUNCEMENT_ID_2]: arweaveEnvelopeJson({ contentHash: 'hash-g2', locator: 'ar://ContentTxG2', storage: 'ar', publicationId: 'pub-g2' }) }
        });
        const arweaveService2 = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway2.fetchImpl });
        const { monitor: monitor2 } = buildWalkingPipeline({ arweaveSnapshotDiscoveryQueryService: arweaveService2, placementCatalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()) });
        await monitor2.observe(ctx(pos(0, 0, 0)));
        const candidateWithPublication = monitor2.lastResult[0];
        assert(candidateWithPublication.publicationId === 'pub-g2', '4. publicationId (publication identity), when present, is carried on its own, distinct field.');
        assert(candidateWithPublication.storage === 'ar' && candidateWithPublication.locator === 'ar://ContentTxG2',
            '5. publicationId never overwrites, or is derived from, storage/locator — all three coexist independently.');

        console.log('✓ Section G: discovery provenance (which source found it), content storage (`storage`), publication identity (`publicationId`), and announcement transaction identity remain four independent facts — none merged into, or confused with, another, at the walking-triggered monitor.');
    }

    // ===============================================================
    // Section H — No World-specific Arweave logic.
    // ===============================================================
    {
        const filesThatMustNotMentionArweave = [
            'application/snapshot/WorldSnapshotDiscoveryMonitor.js',
            'application/snapshot/DiscoverSnapshotCandidatesCommand.js',
            'application/snapshot/placement/SnapshotPlacementResolver.js',
            'application/snapshot/placement/SnapshotWorldPlacement.js',
            'application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js',
            'application/snapshot/AutomaticSnapshotEncounterCascade.js',
            'application/worldEncounter/WorldEncounterIntegration.js',
            'application/discovery/WorldDiscoveryRegistryProjection.js',
            'application/discovery/WorldDiscoverySourceRegistry.js',
            'core/WorldEncounter.js'
        ];
        for (const file of filesThatMustNotMentionArweave) {
            const source = stripLineComments(readSource(file));
            assert(!/arweave/i.test(source), `1. ${file} contains no mention of Arweave, in any casing — it has no idea Arweave discovery exists.`);
        }

        // No second Arweave material-loading path introduced by walking
        // discovery: exactly one production construction site for the
        // Arweave query service, and every ArweaveContentStore
        // construction site is one of the two pre-existing, unrelated
        // (read vs. write) composition roots this milestone did not touch.
        const arweaveQuerySites = execSync('grep -rlE "new ArweaveSnapshotDiscoveryQueryService\\(" application ui --include="*.js" || true', { cwd: SOURCE_ROOT.pathname }).toString().trim().split('\n').filter(Boolean);
        assert(arweaveQuerySites.length === 1, `2. exactly one production ArweaveSnapshotDiscoveryQueryService construction site exists (found: ${JSON.stringify(arweaveQuerySites)}).`);

        // UPDATED 0.9.505 — Register Arweave as Snapshot Content Store.
        // 'ui/main.js' is now a third known site: it registers Arweave into
        // application/snapshot/placement/SnapshotPlacementStoreRegistry.js for Snapshot
        // PLACEMENT (create/resolve a placement's own content) — a
        // genuinely different concern from either pre-existing site
        // (Discovery's read-only retrieval, Distribution's write+announce),
        // and still no Snapshot-DISCOVERY-specific material-loading path,
        // which remains this section's own invariant.
        const arweaveContentStoreSites = execSync('grep -rlE "new ArweaveContentStore\\(" application ui --include="*.js" || true', { cwd: SOURCE_ROOT.pathname }).toString().trim().split('\n').filter(Boolean);
        const knownPreExistingSites = ['application/snapshot/DiscoverSnapshotRuntimeComposition.js', 'application/snapshot/SnapshotDistributionRuntimeComposition.js', 'ui/main.js'];
        assert(arweaveContentStoreSites.every((f) => knownPreExistingSites.includes(f)),
            `3. every ArweaveContentStore construction site is one of the known, unrelated (discovery/distribution/placement) composition roots — no new, Snapshot-discovery-specific material-loading path was introduced (found: ${JSON.stringify(arweaveContentStoreSites)}).`);
        // UPDATED 0.9.505 — ui/main.js now constructs exactly ONE
        // ArweaveContentStore directly, for Snapshot Placement (registered
        // into application/snapshot/placement/SnapshotPlacementStoreRegistry.js) — never a
        // second, Discovery-specific one; Discovery-side retrieval still
        // goes exclusively through composeDiscoverSnapshotRuntime()'s own
        // construction, untouched by this milestone.
        const mainSourceForContentStoreCheck = stripLineComments((await Promise.all(mainFiles().map((file) => readSource(file)))).join('\n'));
        assert((mainSourceForContentStoreCheck.match(/new ArweaveContentStore\(/g) || []).length === 1,
            '3b. ui/main.js constructs exactly one ArweaveContentStore directly (0.9.505, Snapshot Placement) — never a second, Discovery-specific one alongside composeDiscoverSnapshotRuntime()\'s own retrieval-side construction.');

        // The composite/composition files, and the cascade itself, stay
        // generic across sources — no `if (storage === 'ar')` branch
        // anywhere.
        const genericSource = stripLineComments(readSource('application/snapshot/SnapshotCandidateDiscoveryQueryService.js'))
            + stripLineComments(readSource('application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js'))
            + stripLineComments(readSource('application/snapshot/AutomaticSnapshotEncounterCascade.js'));
        assert(!/storage\s*===?\s*['"](ar|arweave)['"]/i.test(genericSource),
            '4. the composite, its composition file, and the automatic cascade contain no storage-string branch singling out Arweave — every source is treated identically.');

        console.log('✓ Section H: none of WorldSnapshotDiscoveryMonitor, DiscoverSnapshotCandidatesCommand, SnapshotPlacementResolver, the placement/registration/World-Encounter chain, or the real automatic cascade itself, know Arweave exists — confirmed by source inspection, and no second Arweave material-loading path was found.');
    }

    // ===============================================================
    // Section I — Performance baseline, under the real walking workflow.
    // ===============================================================
    {
        const transactionIds = ['AnnounceTxI1', 'AnnounceTxI2', 'AnnounceTxI3', 'AnnounceTxI4'];
        const envelopes = {};
        transactionIds.forEach((id, i) => { envelopes[id] = arweaveEnvelopeJson({ contentHash: `hash-i-${i}`, locator: `ar://content-i-${i}`, storage: 'ar' }); });
        const gateway = makeFakeArweaveGateway({ transactionIds, envelopes });
        const arweaveService = new ArweaveSnapshotDiscoveryQueryService({ fetchImpl: gateway.fetchImpl });

        let arweaveSearchCalls = 0;
        const originalSearch = arweaveService.search.bind(arweaveService);
        arweaveService.search = (...args) => { arweaveSearchCalls += 1; return originalSearch(...args); };

        const { monitor } = buildWalkingPipeline({ arweaveSnapshotDiscoveryQueryService: arweaveService, placementCatalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()) });

        // ONE real walking observation.
        await monitor.observe(ctx(pos(0, 0, 0)));

        assert(arweaveSearchCalls === 1, `1. one walking-triggered observation invokes the Arweave source's own search() exactly once (got ${arweaveSearchCalls}).`);
        const { graphqlCalls, gatewayCalls } = gateway.counts();
        assert(graphqlCalls === 1, `2. that one observation issues exactly one GraphQL request (got ${graphqlCalls}).`);
        assert(gatewayCalls === transactionIds.length, `3. that one observation issues exactly one gateway fetch per discovered announcement transaction (${transactionIds.length} announced, ${gatewayCalls} fetched).`);
        assert(monitor.lastResult.length === transactionIds.length, '4. every discovered Arweave candidate reaches the monitor from that single observation.');

        // A SECOND observation below the movement threshold costs nothing
        // additional — the movement gate, not the query cost, is what
        // keeps this baseline from growing on every UI tick.
        const countsBefore = gateway.counts();
        await monitor.observe(ctx(pos(1, 0, 0)));
        const countsAfter = gateway.counts();
        assert(countsAfter.graphqlCalls === countsBefore.graphqlCalls && countsAfter.gatewayCalls === countsBefore.gatewayCalls,
            '5. a sub-threshold second observation adds zero additional GraphQL/gateway cost — the measured baseline is per DISTINCT observation, not per UI tick.');

        console.log(`✓ Section I: measured baseline under the real walking workflow — exactly 1 GraphQL request + N (=${transactionIds.length}) gateway fetches per DISTINCT walking-triggered observation, and the Arweave source's own search() invoked exactly once per observation. Left deliberately unoptimized, per this milestone's own brief — evidence for a later product/runtime decision, not an optimization performed here.`);
    }

    // ===============================================================
    // Section J — Race and lifecycle.
    // ===============================================================
    {
        // J1. A genuinely slow Arweave source inside the REAL composite —
        // observation A is slow, observation B completes first; stale A
        // must never overwrite B.
        let arweaveCalls = 0;
        let resolveFirst, resolveSecond;
        const slowThenFastArweave = {
            search() {
                arweaveCalls += 1;
                if (arweaveCalls === 1) {
                    return new Promise((resolve) => { resolveFirst = () => resolve([{ contentHash: 'from-STALE-A', locator: 'ar://stale', storage: 'ar' }]); });
                }
                return new Promise((resolve) => { resolveSecond = () => resolve([{ contentHash: 'from-FRESH-B', locator: 'ar://fresh', storage: 'ar' }]); });
            }
        };
        const { monitor } = buildWalkingPipeline({ arweaveSnapshotDiscoveryQueryService: slowThenFastArweave, placementCatalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()) });

        const contextA = ctx(pos(0, 0, 0));
        const contextB = ctx(pos(0, 0, DEFAULT_DISCOVERY_REFRESH_RADIUS + 1));

        const observationA = monitor.observe(contextA);
        const observationB = monitor.observe(contextB);
        await flushMicrotasks();

        resolveSecond();
        await observationB;
        assert(monitor.lastResult[0].contentHash === 'from-FRESH-B', '1. the newer observation\'s own result is applied.');

        resolveFirst();
        await observationA;
        await flushMicrotasks();
        assert(monitor.lastResult[0].contentHash === 'from-FRESH-B',
            '2. the stale, slow Arweave observation\'s own late-arriving result never overwrites the newer observation\'s already-applied result — the monitor\'s own request-id protection holds with a real composite whose own Arweave source is genuinely slow.');
        assert(monitor.executing === false, '3. the monitor\'s own executing flag settles back to false once both observations have resolved.');

        // J2. Arweave failure/latency never breaks the movement lifecycle —
        // a subsequent, unrelated observation still runs cleanly.
        const flakyThenGoneArweave = { search: () => Promise.reject(new Error('arweave-timeout')) };
        const { monitor: monitor2 } = buildWalkingPipeline({ arweaveSnapshotDiscoveryQueryService: flakyThenGoneArweave, placementCatalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()) });
        await monitor2.observe(ctx(pos(0, 0, 0)));
        assert(monitor2.lastError === null && Array.isArray(monitor2.lastResult) && monitor2.executing === false,
            '4. an Arweave failure never surfaces as a monitor-level error, never leaves `executing` stuck true, and never prevents lastResult from settling to a clean array.');
        // A later, distinct observation (movement threshold crossed again)
        // still runs, proving the lifecycle was never wedged by the
        // earlier Arweave failure.
        await monitor2.observe(ctx(pos(0, 0, DEFAULT_DISCOVERY_REFRESH_RADIUS + 1)));
        assert(monitor2.lastError === null, '5. a subsequent, unrelated observation after an Arweave failure still runs cleanly — the movement lifecycle was never broken.');

        console.log('✓ Section J: the monitor\'s own request-id staleness protection governs a genuinely slow real Arweave source exactly as it already does for any other source, and Arweave latency/failure never breaks the walking/movement lifecycle for later observations.');
    }

    // ===============================================================
    // Section K — The architectural invariant: source is irrelevant
    // downstream.
    // ===============================================================
    {
        // Drive a Local-, a Nostr-, and an Arweave-discovered candidate —
        // identical in every way except which source produced them and
        // where their own bytes live — through ONE SHARED
        // AutomaticSnapshotEncounterCascade instance. If source mattered to
        // ANY downstream component, one of these three would need
        // different wiring, a different registry, or a different cascade;
        // none does.
        const localBytes = 'k-local-bytes', nostrBytes = 'k-nostr-bytes', arweaveBytes = 'k-arweave-bytes';
        const localHash = computeContentHash(localBytes), nostrHash = computeContentHash(nostrBytes), arweaveHash = computeContentHash(arweaveBytes);

        const localCandidate = { contentHash: localHash, locator: 'local-ref', storage: 'local', publicationId: 'pub-k-local' };
        const nostrCandidate = { contentHash: nostrHash, locator: 'nostr-ref', storage: 'local', publicationId: 'pub-k-nostr' };
        const CONTENT_TX = 'ContentTxK00000000000000000000000000000';
        const arweaveGateway = makeFakeArweaveGateway({ contentBodies: { [CONTENT_TX]: arweaveBytes } });
        const arweaveContentStore = new ArweaveContentStore({ signer: unusedSigner(), fetchImpl: arweaveGateway.fetchImpl });
        const arweaveCandidate = { contentHash: arweaveHash, locator: `ar://${CONTENT_TX}`, storage: 'ar', publicationId: 'pub-k-arweave' };

        // ONE shared multi-store dispatcher — the SAME idea
        // `application/snapshot/placement/SnapshotPlacementStoreRegistry.js` already embodies
        // one layer over, built inline here only because this section's
        // whole point is "one shared cascade, three different sources,"
        // never a NEW production abstraction.
        const genericStore = { get: async () => { throw new Error('unreachable in this section'); } };
        genericStore.get = async (reference) => {
            if (reference.uri && reference.uri.startsWith('ar://')) return arweaveContentStore.get(reference);
            if (reference.uri === 'local-ref') return localBytes;
            if (reference.uri === 'nostr-ref') return nostrBytes;
            return null;
        };

        const registry = new WorldDiscoverySourceRegistry();
        const placements = {
            'pub-k-local': { placementId: 'p-local', publicationId: 'pub-k-local', position: { x: 1, y: 1, z: 1 } },
            'pub-k-nostr': { placementId: 'p-nostr', publicationId: 'pub-k-nostr', position: { x: 2, y: 2, z: 2 } },
            'pub-k-arweave': { placementId: 'p-arweave', publicationId: 'pub-k-arweave', position: { x: 3, y: 3, z: 3 } }
        };
        const publications = {
            'pub-k-local': new Publication({ id: 'pub-k-local', title: 'Local' }),
            'pub-k-nostr': new Publication({ id: 'pub-k-nostr', title: 'Nostr' }),
            'pub-k-arweave': new Publication({ id: 'pub-k-arweave', title: 'Arweave' })
        };
        const resolver = new DecentralizedSnapshotResolver({ search: async () => [] });
        const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({ candidate, resolver, contentStore: genericStore });
        const localContentStore = new LocalContentStore(new InMemoryStorageProvider());
        const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(new StoreSnapshotContentUseCase(localContentStore));
        const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({ resolution, materializer });
        const sharedCascade = new AutomaticSnapshotEncounterCascade({
            resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand,
            worldDiscoverySourceRegistry: registry,
            resolvePlacementInfo: (publicationId) => placements[publicationId] || null,
            findPublicationById: (publicationId) => publications[publicationId] || null
        });

        const localResult = await sharedCascade.processCandidate(localCandidate);
        const nostrResult = await sharedCascade.processCandidate(nostrCandidate);
        const arweaveResult = await sharedCascade.processCandidate(arweaveCandidate);

        for (const [label, result] of [['Local', localResult], ['Nostr', nostrResult], ['Arweave', arweaveResult]]) {
            assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, `1. ${label}: the SAME shared cascade instance drives this candidate to REGISTERED (got ${result.outcome}).`);
        }
        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 3, '2. all three candidates registered into the SAME registry produce three independent World Encounters.');
        assert(view.publications.some((p) => p.objectId === 'pub-k-arweave' && p.x === 3 && p.y === 3 && p.z === 3),
            '3. the Arweave-origin encounter sits at exactly its own placed position, alongside the Local- and Nostr-origin ones, indistinguishable in shape.');

        // The cascade's own source never branches on `candidate.storage`.
        assert(!/candidate\.storage/i.test(stripLineComments(readSource('application/snapshot/AutomaticSnapshotEncounterCascade.js'))),
            '4. AutomaticSnapshotEncounterCascade.js never reads candidate.storage at all — it cannot branch on something it never looks at.');
        // Nor does the resolver, materializer, or placement/registration bridge.
        const downstreamSource = stripLineComments(readSource('application/snapshot/DecentralizedSnapshotResolver.js'))
            + stripLineComments(readSource('application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js'))
            + stripLineComments(readSource('application/snapshot/placement/SnapshotWorldPlacement.js'))
            + stripLineComments(readSource('application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js'));
        assert(!/storage\s*===\s*['"](ar|arweave|ipfs|local)['"]/i.test(downstreamSource),
            '5. none of the resolver, materializer, placement, or registration files branch on a specific storage string.');

        console.log('✓ Section K: ONE shared, real AutomaticSnapshotEncounterCascade instance drives Local-, Nostr-, and Arweave-discovered candidates to REGISTERED with no per-source branch anywhere in the cascade or its downstream collaborators. Once a candidate enters the composite, its source is irrelevant to every downstream component.');
    }

    // ===============================================================
    // Section L — Scope guard.
    // ===============================================================
    {
        const changedFiles = execSync('git status --porcelain', { cwd: SOURCE_ROOT.pathname })
            .toString().split('\n').map((line) => line.replace(/\n$/, '')).filter(Boolean)
            .map((line) => line.slice(3).trim());
        const unexpectedProductionChanges = changedFiles.filter((f) => !f.startsWith('tests/') && f !== 'tests.html');
        assert(unexpectedProductionChanges.length === 0,
            `1. this milestone's own working-tree changes are scoped to tests/ and tests.html only — zero production changes (found unexpected: ${JSON.stringify(unexpectedProductionChanges)}).`);

        console.log('✓ Section L: zero production changes — this milestone is a test-only closure audit, exactly as its own brief requires.');
    }

    console.log('\n✓ FINAL DECISION.\n' +
'\n' +
'OUTCOME: WALKING_TRIGGERED_MULTI_SOURCE_SNAPSHOT_DISCOVERY_CLOSED.\n' +
'\n' +
'WHY. Production topology holds exactly as composed — one Local catalog, one Nostr service, one Arweave service,\n' +
'one composite, one walking monitor, and the real, already-wired AutomaticSnapshotEncounterCascade feeding straight\n' +
'off that monitor\'s own lastResult (Section A). A single real movement → threshold-crossing → observation reaches\n' +
'all three sources at once, and the pre-existing movement gate still suppresses a sub-threshold re-query (Section B).\n' +
'An Arweave announcement\'s contentHash/locator/storage survive the walking pipeline verbatim, with the announcement\n' +
'transaction id never leaking into the locator (Section C). The existing dedup identity converges an identical claim\n' +
'from all three sources and keeps a same-hash/different-locator pair distinct, walking-triggered (Section D). All\n' +
'eight Local/Nostr/Arweave availability combinations, exercised through the real walking trigger, leave the monitor\n' +
'in exactly the expected state with no source ever a fallback for another (Section E).\n' +
'\n' +
'THE FLAGSHIP PATH closes end to end, through the REAL, ALREADY-PRODUCTION AutomaticSnapshotEncounterCascade: a real\n' +
'Arweave announcement is discovered by walking, and the SAME orchestrator ui/views/WorldView.js already runs on\n' +
'every spatial tick resolves it through a real ArweaveContentStore with genuine hash verification, materializes it\n' +
'into local possession, places it at an already-known World position (never the Arweave-claimed one), registers it\n' +
'into the real WorldDiscoverySourceRegistry, and renders it as a genuine World Encounter (Section F). Discovery\n' +
'provenance, content storage, publication identity, and announcement transaction identity remain four independent\n' +
'facts, never merged (Section G). None of WorldSnapshotDiscoveryMonitor, DiscoverSnapshotCandidatesCommand,\n' +
'SnapshotPlacementResolver, the placement/registration/World-Encounter chain, or the cascade itself know Arweave\n' +
'exists, and no second Arweave material-loading path exists (Section H). The measured baseline under the real\n' +
'walking workflow is exactly one GraphQL request plus one gateway fetch per discovered announcement, per DISTINCT\n' +
'observation — deliberately left unoptimized (Section I). The monitor\'s own request-id protection holds against a\n' +
'genuinely slow real Arweave source, and Arweave failure/latency never breaks the movement lifecycle (Section J).\n' +
'ONE SHARED real cascade instance drives Local-, Nostr-, and Arweave-discovered candidates all to REGISTERED with no\n' +
'source-specific branch anywhere in the cascade or its downstream collaborators (Section K). This milestone itself\n' +
'makes zero production changes (Section L).\n' +
'\n' +
'THE ARCHITECTURAL INVARIANT THIS AUDIT ESTABLISHES: once an Arweave candidate enters\n' +
'SnapshotCandidateDiscoveryQueryService, its source is irrelevant to every downstream component — Local, Nostr, and\n' +
'Arweave candidates share one identical downstream contract, all the way to World Encounter, through the SAME\n' +
'already-production automatic cascade.\n' +
'\n' +
'WHAT THIS MEANS FOR THE PRODUCT. Arweave Snapshot publishing exists, Arweave Snapshot discovery exists, Arweave\n' +
'participates in the common candidate query, walking-triggered discovery reaches it, the ALREADY-AUTOMATIC cascade\n' +
'resolves/verifies/materializes/places/registers it with no code change of its own, and no source-specific downstream\n' +
'path exists anywhere. The technical architecture for walking-triggered multi-source Snapshot discovery is complete\n' +
'AND already runs live, unattended, on every spatial tick — not merely reachable through a person\'s own explicit\n' +
'click. The measured cost — one GraphQL request plus one gateway body fetch per discovered Arweave announcement, per\n' +
'distinct walking observation — is the one piece of evidence a future product decision about caching, batching,\n' +
'throttling, or ranking would need; this milestone deliberately does not perform that optimization, and does not\n' +
'conclude one is needed. Absent a concrete, evidence-backed product requirement surfacing a real problem with that\n' +
'measured cost, the recommended next step is STABLE / STOP — a product reassessment, not another implementation\n' +
'milestone.\n');

    console.log('\n✅ All Walking-Triggered Multi-Source Snapshot Discovery End-to-End Integration Audit (Arweave Closure) tests passed.');
}

run().then(() => {
    console.log('\n✓ All WalkingTriggeredMultiSourceSnapshotDiscoveryArweaveClosureAudit tests passed');
}).catch((error) => {
    console.error('\n✗ WalkingTriggeredMultiSourceSnapshotDiscoveryArweaveClosureAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
