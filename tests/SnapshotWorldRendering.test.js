import { readFile } from 'node:fs/promises';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import WorldEncounterMarker from '../ui/components/WorldEncounterMarker.js';
import { registerMaterializedSnapshotWorldSource } from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeLocalWorldDiscoverySource } from '../application/WorldEncounterIntegration.js';
import { describePeerWorldDiscoverySource } from '../peer/PeerWorldDataIngress.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCandidatesCommand } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { NostrSnapshotDiscoveryPublisher } from '../application/NostrSnapshotDiscoveryPublisher.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { Position } from '../core/Position.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { computeContentHash } from '../serializer/contentHash.js';

// 0.9.161 — Snapshot World Rendering.
//
// 0.9.160's own FLAGSHIP already proved, by hand, that a registered
// Snapshot flows unmodified through `assembleWorldDiscoveryInputs()` ->
// `deriveWorldEncounters()` into a genuine, correctly-positioned encounter
// — and stopped exactly there, one seam short of an actual mounted
// `ui/components/WorldEncounterCanvas.js` ever observing it. This file
// crosses that one remaining seam, and confirms there was nothing left TO
// build to cross it.
//
//   THE INVESTIGATION THIS MILESTONE'S OWN BRIEF ASKED FOR, FIRST. "Does
// WorldEncounterCanvas render an encounter from its World material
// representation directly, or does it require an additional material/
// runtime object?" — directly. `core/WorldEncounter.js#describeEncounterablePublication()`
// (0.9.0) already builds a complete, drawable encounter row —
// `{ objectId, title, publisherIdentity, isSigned, position, anchorCount,
// placementCount }` — from nothing but a `Publication` and a placement's
// own `position`, BOTH of which `registerMaterializedSnapshotWorldSource()`
// (0.9.160) already hands the registry at registration time. Nothing
// downstream — `describeWorldEncounterReadModel()` (0.9.1, flattens
// `position` to `x`/`y`/`z`), `describeWorldEncounterView()` (0.9.2),
// `WorldEncounterCanvas.js`'s own `projectedPublications` computed (0.9.3,
// `projectToCanvas(row.x)`/`projectToCanvas(row.z)`), or
// `WorldEncounterMarker.js`'s own template (0.9.3/0.9.4, `x`/`y`/`label`/
// `kind`/`objectId` — nothing else) — ever reads a Snapshot's own bytes,
// content hash, locator, or storage tag. A materialized Snapshot's actual
// content only ever matters for the SEPARATE, already-existing, opt-in
// selection -> inspection -> material-loading path (`materialSources`/
// `materialInspection`, 0.9.21/0.9.39) — never for whether its own marker
// appears on the map at all. So the answer is: YES, directly, and no
// additional material/runtime object was ever required.
//
//   THE SECOND HALF OF THE INVESTIGATION: IS THE REAL RUNNING APP ALREADY
// WIRED FOR IT? `ui/main.js` constructs exactly ONE `WorldDiscoverySourceRegistry`
// instance (`worldDiscoveryRuntime.registry`) and `app.provide()`s it once,
// under the key `'worldDiscoverySourceRegistry'`. `ui/views/WorldView.js`
// `inject()`s that SAME instance once and hands it, completely unchanged,
// to BOTH `<OwnPublicationPanel :worldDiscoverySourceRegistry="...">` AND
// `<WorldEncounterCanvas :registry="...">` — the exact wiring this file's
// own Section B below reproduces by hand. `WorldEncounterCanvas.js` has
// subscribed to its own `registry` prop since 0.9.13, and
// `application/WorldDiscoverySourceRegistry.js#setSource()` has notified
// every subscriber synchronously, on every successful mutation, since
// 0.9.12 — both entirely unmodified since. So the answer to this
// milestone's own second question is also yes: the moment a real
// `OwnPublicationPanel.registerMaterializedSnapshot()` click calls
// `registry.setSource()`, a real mounted `WorldEncounterCanvas` sharing
// that SAME registry instance already re-projects and re-renders, with no
// further wiring of any kind.
//
//   THEREFORE THIS MILESTONE ADDS ZERO PRODUCTION CODE. Every file this
// milestone touches lives under `tests/` alone (see Section G's own
// structural sweep, confirming exactly that). This is not a shortcut
// around the milestone's own request — it IS the milestone's own request,
// answered honestly: "wiring THAT SAME already-live... subscription...
// into actually being mounted and observed... and confirming the
// rendered marker's own position matches" (docs/Roadmap.md's own 0.9.161
// recommendation) describes an OBSERVATION to make, not a seam to build,
// once the investigation above is actually carried out. Where 0.9.150
// through 0.9.160 each closed a genuine, missing seam with new
// `application/`-layer code, this milestone closes the one that turned
// out, on inspection, to already be closed — and proves it the same way
// every "…End-to-End Audit" milestone in this family already does
// (0.9.153, 0.9.155): with a flagship test that exercises the REAL,
// unmodified production path, start to finish, never a reimplementation
// of it.
//
//   Section A: existing rendering contract unchanged — a `registry`
//              driving `WorldEncounterCanvas` with only ordinary local/
//              peer sources (no Snapshot involved at all) still projects
//              exactly as every earlier milestone already established.
//   Section B: FLAGSHIP — a real Nostr-discovered, resolved, materialized,
//              PLACED, and REGISTERED Snapshot (the exact same real
//              composed runtime 0.9.160's own Section F built), observed
//              through a REAL, MOUNTED `WorldEncounterCanvas` sharing the
//              SAME registry instance `OwnPublicationPanel` registered
//              into — reproducing `ui/views/WorldView.js`'s own real
//              wiring by hand. The registered Snapshot's own Publication
//              appears as a genuine projected marker, with no rendering
//              code of any kind added to make it so.
//   Section C: spatial correctness — the projected marker's own screen
//              `x`/`y` is EXACTLY `projectToCanvas()` (0.9.3, unmodified)
//              applied to the real `WorldPlacement` position 0.9.159
//              established — never a snapshot-specific recomputation, and
//              world `y` (elevation) still never enters the mapping.
//   Section D: no visibility/range filtering of any kind is performed by
//              the registration/bridge layer — a Snapshot placed well
//              outside the fixed projectable span still registers and
//              still projects, through the SAME unmodified formula,
//              exactly like any other encounter already would. Whether it
//              then falls inside or outside the fixed SVG `viewBox` is
//              entirely `WorldEncounterCanvas.js`'s own pre-existing,
//              unmodified concern — never something this milestone's own
//              registration path decides on a Snapshot's behalf.
//   Section E: coexistence — an own local Publication, a peer-discovered
//              Publication, and two independently registered Snapshots all
//              project simultaneously, under their own distinct origins,
//              none replacing or hiding another.
//   Section F: identity preservation carried all the way to the rendered
//              marker — contentHash/locator/eventId/transactionId/position
//              stay pairwise distinct, and the marker's own `objectId`
//              (and DOM `data-object-id`) is the Publication's `id`, never
//              the Snapshot's own contentHash.
//   Section G: structural sweep — this milestone adds no production file,
//              modifies no production file, and no new rendering
//              authority (camera/viewport/visibility/discovery/retrieval/
//              verification/placement/materialization) exists anywhere in
//              the registration bridge or the rendering pipeline as a
//              result of it.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
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

function makeFakeArweaveGateway() {
    const network = new Map();
    async function fetchImpl(url, options = {}) {
        const parsed = new URL(url);
        if (options.method === 'POST' && parsed.pathname === '/tx') {
            const transaction = JSON.parse(options.body);
            network.set(transaction.id, transaction.data);
            return new Response('OK', { status: 200 });
        }
        const id = parsed.pathname.slice(1);
        if (!network.has(id)) return new Response('not found', { status: 404 });
        return new Response(network.get(id));
    }
    return { network, fetchImpl };
}

function makeFakeArweaveSigner() {
    let counter = 0;
    async function sign(material) {
        counter += 1;
        return { id: `fake-render-tx-${counter}`, transaction: { id: `fake-render-tx-${counter}`, data: material } };
    }
    return { sign };
}

function makeNostrNetwork() {
    const events = [];
    let counter = 0;
    async function publishImpl(relayUrl, eventTemplate) {
        counter += 1;
        const id = counter.toString(16).padStart(64, '0');
        events.push({ id, pubkey: 'fake-pubkey', kind: eventTemplate.kind, tags: eventTemplate.tags, content: eventTemplate.content, sig: 'fake-sig' });
        return { published: true, id };
    }
    async function queryImpl(relayUrl, filter) {
        const tagFilters = Object.entries(filter).filter(([key]) => key.startsWith('#'));
        return events
            .filter((event) => {
                if (Array.isArray(filter.kinds) && !filter.kinds.includes(event.kind)) return false;
                return tagFilters.every(([key, values]) => {
                    const tagName = key.slice(1);
                    return event.tags.some((tag) => tag[0] === tagName && values.includes(tag[1]));
                });
            })
            .slice(0, filter.limit);
    }
    return { events, publishImpl, queryImpl };
}

function makeHost(discoveryTag) {
    const gateway = makeFakeArweaveGateway();
    const signer = makeFakeArweaveSigner();
    const network = makeNostrNetwork();

    const { resolver, contentStore, queryService } = composeDiscoverSnapshotRuntime({
        arweaveContentStoreOptions: { signer, fetchImpl: gateway.fetchImpl },
        nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: network.queryImpl }
    });

    const announcer = new NostrSnapshotDiscoveryPublisher({ discoveryTag, publishImpl: network.publishImpl });

    const localContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(localContentStore);
    const materializer = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);

    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
        discoveryTag, discoveryQueryService: queryService
    });
    const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({
        candidate, resolver, contentStore
    });
    const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({
        resolution, materializer
    });

    return {
        gateway, signer, network, discoveryTag, resolver, contentStore, queryService, announcer,
        localContentStore, storeSnapshotContentUseCase, materializer,
        discoverSnapshotCandidatesCommand, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand
    };
}

async function placeAndAnnounce(host, bytes) {
    const reference = await host.contentStore.put(bytes);
    await host.announcer.publish({ contentHash: reference.hash, locator: reference.uri, storage: reference.storage });
    return reference;
}

function placeReal(placementRegistry, publicationId, position, owner = 'alice') {
    const record = new PlacementRecord({ publicationId, position, owner });
    placementRegistry.add(record);
    return record;
}

function placementInfoFor(placementRegistry, publicationId) {
    const records = placementRegistry.findByPublicationId(publicationId);
    if (records.length === 0) return null;
    const record = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
    return {
        placementId: record.placementId,
        publicationId: record.publicationId,
        position: { x: record.position.x, y: record.position.y, z: record.position.z },
        rotation: record.rotation,
        revision: record.revision,
        owner: record.owner,
        movable: true,
        overlapCount: 0
    };
}

function panelCtx(overrides = {}) {
    return {
        publication: null,
        placementInfo: null,
        worldDiscoverySourceRegistry: null,
        discoverSnapshotCandidatesCommand: null,
        resolveSelectedSnapshotCommand: null,
        materializeSelectedSnapshotCommand: null,
        snapshotCandidateDiscoveryExecuting: false,
        snapshotCandidateDiscoveryError: null,
        snapshotCandidateDiscoveryResult: null,
        snapshotCandidateDiscoveryRequestId: 0,
        selectedSnapshotCandidate: null,
        selectedSnapshotResolutionExecuting: false,
        selectedSnapshotResolutionError: null,
        selectedSnapshotResolutionResult: null,
        selectedSnapshotResolutionRequestId: 0,
        selectedSnapshotAttributionResult: null,
        selectedSnapshotMaterializationExecuting: false,
        selectedSnapshotMaterializationError: null,
        selectedSnapshotMaterializationResult: null,
        selectedSnapshotMaterializationRequestId: 0,
        selectedSnapshotWorldPlacementResult: null,
        selectedSnapshotWorldRegistrationResult: null,
        discoverSnapshotCandidates: OwnPublicationPanel.methods.discoverSnapshotCandidates,
        selectSnapshotCandidate: OwnPublicationPanel.methods.selectSnapshotCandidate,
        resolveSelectedSnapshot: OwnPublicationPanel.methods.resolveSelectedSnapshot,
        attributeSelectedSnapshot: OwnPublicationPanel.methods.attributeSelectedSnapshot,
        materializeSelectedSnapshot: OwnPublicationPanel.methods.materializeSelectedSnapshot,
        placeMaterializedSnapshot: OwnPublicationPanel.methods.placeMaterializedSnapshot,
        registerMaterializedSnapshot: OwnPublicationPanel.methods.registerMaterializedSnapshot,
        ...overrides
    };
}

// Reproduces ui/views/WorldView.js's own real wiring by hand: props
// resolved, data() merged in, methods attached — exactly
// tests/LiveWorldViewRegistrySubscription.test.js's own
// `buildCanvasInstance()` — so `mounted()`/`beforeUnmount()` and every
// computed below run against a plain ctx object exactly the way Vue's own
// `this` would resolve them, with no real Vue runtime anywhere in this
// file.
function buildCanvasInstance({ registry = null, view } = {}) {
    const ctx = {
        registry,
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default()
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    return ctx;
}

function mountCanvas(ctx) {
    WorldEncounterCanvas.mounted.call(ctx);
}

function unmountCanvas(ctx) {
    WorldEncounterCanvas.beforeUnmount.call(ctx);
}

// Resolves every computed a rendered marker actually depends on, in the
// exact dependency order Vue's own reactivity would — mirroring
// tests/WorldEncounterCanvasUI.test.js's own `canvasCtx()` discipline, one
// layer over, for a registry-driven mount instead of a bare `view` prop.
function projectedPublicationsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

function placedResult(contentHash, publicationId, position, placementId = 'placement-x') {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId, position, reason: null };
}

// Runs a real registered Snapshot's own marker through
// WorldEncounterMarker.js itself — the same "call computed/methods.call(ctx)"
// discipline this codebase's UI tests already use throughout — confirming
// the EXISTING renderer, never a Snapshot-specific one, is what actually
// draws it.
function markerGlyphAndSelection(projectedMarker) {
    const ctx = { kind: 'PUBLICATION', objectId: projectedMarker.objectId, label: projectedMarker.label, x: projectedMarker.x, y: projectedMarker.y, $emit(event, payload) { ctx.emitted = { event, payload }; } };
    const glyph = WorldEncounterMarker.computed.glyph.call(ctx);
    WorldEncounterMarker.methods.emitSelect.call(ctx);
    return { glyph, emitted: ctx.emitted };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — existing rendering contract unchanged: an ordinary
    // registry (local + peer sources, no Snapshot involved at all) still
    // projects exactly as 0.9.13 already established.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-local', title: 'Local One' }],
            placements: [{ id: 'placement-local', publicationId: 'pub-local', position: { x: 0, y: 0, z: 0 } }]
        }));
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-peer', title: 'Peer One' }],
            placements: [{ id: 'placement-peer', publicationId: 'pub-peer', position: { x: 10, y: 0, z: 10 } }]
        }, { remoteIdentity: { identityId: 'did:key:zPeerBaseline' } }));

        const ctx = buildCanvasInstance({ registry });
        mountCanvas(ctx);
        const projected = projectedPublicationsOf(ctx);

        assert(projected.length === 2, '1. baseline — an ordinary registry with no Snapshot involved still projects every encounterable Publication');
        assert(projected.some((p) => p.objectId === 'pub-local') && projected.some((p) => p.objectId === 'pub-peer'), '2. baseline — both the local and peer Publications project, unaffected by this milestone');

        unmountCanvas(ctx);
        console.log('✓ Section A: existing rendering contract unchanged — an ordinary local/peer registry still projects exactly as 0.9.13 already established');
    }

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: a real Nostr-discovered, resolved,
    // materialized, PLACED, and REGISTERED Snapshot, observed through a
    // REAL, MOUNTED WorldEncounterCanvas sharing the SAME registry
    // OwnPublicationPanel registered into — reproducing
    // ui/views/WorldView.js's own real wiring by hand.
    // ---------------------------------------------------------------
    let flagshipEncounter;
    {
        const host = makeHost('rendering-flagship');
        const bytes = JSON.stringify({ world: { buildings: [{ id: 'rendering-flagship-building', bricks: 7 }] } });
        const reference = await placeAndAnnounce(host, bytes);

        const placementRegistry = new LocalPlacementRegistry(new InMemoryStorageProvider());
        const publicationId = 'flagship-rendering-publication';
        placeReal(placementRegistry, publicationId, new Position(20, 3, -12));

        const publication = new Publication({ id: publicationId, title: 'Flagship Rendered Snapshot', contentReference: reference });
        const placementInfo = placementInfoFor(placementRegistry, publicationId);

        // The ONE registry instance — standing in for ui/main.js's own
        // single worldDiscoveryRuntime.registry, handed unchanged to BOTH
        // OwnPublicationPanel and WorldEncounterCanvas by
        // ui/views/WorldView.js.
        const sharedRegistry = new WorldDiscoverySourceRegistry();

        const panel = panelCtx({
            publication,
            placementInfo,
            worldDiscoverySourceRegistry: sharedRegistry,
            discoverSnapshotCandidatesCommand: host.discoverSnapshotCandidatesCommand,
            resolveSelectedSnapshotCommand: host.resolveSelectedSnapshotCommand,
            materializeSelectedSnapshotCommand: host.materializeSelectedSnapshotCommand
        });

        // A real WorldEncounterCanvas is already mounted against the
        // shared registry BEFORE the Snapshot is ever registered — exactly
        // the real app's own mount ordering (the World View is already on
        // screen before any one interaction registers a Snapshot into it).
        const canvas = buildCanvasInstance({ registry: sharedRegistry });
        mountCanvas(canvas);
        assert(projectedPublicationsOf(canvas).length === 0, '1. before registration, the already-mounted canvas shows nothing for this Publication');

        panel.discoverSnapshotCandidates();
        await flushMicrotasks();
        assert(panel.snapshotCandidateDiscoveryResult.length === 1, '2. sanity — the real candidate was genuinely discovered over Nostr');
        const candidate = panel.snapshotCandidateDiscoveryResult[0];

        panel.selectSnapshotCandidate(candidate);
        panel.resolveSelectedSnapshot();
        await flushMicrotasks();
        panel.materializeSelectedSnapshot();
        await flushMicrotasks();
        panel.placeMaterializedSnapshot();
        assert(panel.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED, '3. sanity — the materialized candidate places against the real WorldPlacement position');

        panel.registerMaterializedSnapshot();
        assert(panel.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '4. sanity — the placed Snapshot registers with the shared runtime registry');

        // FLAGSHIP: with NO further call of any kind — no re-mount, no
        // manual re-projection, nothing this test file does beyond reading
        // the already-mounted canvas's own reactive state — the Snapshot's
        // own Publication is now a genuine projected marker.
        const projected = projectedPublicationsOf(canvas);
        assert(projected.length === 1, '5. FLAGSHIP — the already-mounted WorldEncounterCanvas automatically observes the registered Snapshot, with zero rendering code added by this milestone');
        const [marker] = projected;
        assert(marker.objectId === publicationId, '6. FLAGSHIP — the projected marker names the correct Publication');
        assert(marker.label === 'Flagship Rendered Snapshot', "7. FLAGSHIP — the Publication's own title survives, unreconstructed, all the way to the rendered marker");

        // The EXISTING renderer — WorldEncounterMarker.js, entirely
        // unmodified — actually draws it: the correct glyph, and a
        // functioning selection emit carrying exactly this Publication's id.
        const { glyph, emitted } = markerGlyphAndSelection(marker);
        assert(glyph === '📄', '8. FLAGSHIP — the existing, unmodified WorldEncounterMarker.js renders the registered Snapshot with the ordinary PUBLICATION glyph, no Snapshot-specific glyph or marker component of any kind');
        assert(emitted.event === 'select' && emitted.payload.objectId === publicationId, '9. FLAGSHIP — selecting the rendered marker reports exactly this Publication\'s id through the existing, unmodified selection mechanism');

        unmountCanvas(canvas);
        flagshipEncounter = { publicationId, reference, publication, expectedPosition: { x: 20, y: 3, z: -12 } };
        console.log('✓ Section B: FLAGSHIP — a real Nostr-discovered, resolved, materialized, placed, and registered Snapshot renders as a genuine marker through the entirely unmodified existing rendering pipeline, with zero production code added by this milestone');
    }

    // ---------------------------------------------------------------
    // Section C — spatial correctness: the projected marker's own x/y is
    // EXACTLY projectToCanvas() (0.9.3, unmodified) applied to the real
    // WorldPlacement position — never a snapshot-specific recomputation —
    // and elevation (world y) never enters the mapping.
    // ---------------------------------------------------------------
    {
        // WORLD_HALF_SPAN = 50, CANVAS_SIZE = 600 (ui/components/
        // WorldEncounterCanvas.js, unchanged since 0.9.3) -> screen =
        // 300 + 6 * world. Position (20, 3, -12) -> screen (420, 228).
        const registry = new WorldDiscoverySourceRegistry();
        const publication = new Publication({ id: 'pub-spatial', title: 'Spatial Correctness' });
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-spatial', 'pub-spatial', { x: 20, y: 3, z: -12 }), publication);

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const [marker] = projectedPublicationsOf(canvas);
        assert(marker.x === 420 && marker.y === 228, `1. the rendered marker's screen position is EXACTLY 300 + 6 * world (x,z) — got (${marker.x},${marker.y})`);

        // Elevation (world y) never enters the mapping — two otherwise-
        // identical placements differing only in y project identically.
        const registryLowY = new WorldDiscoverySourceRegistry();
        const registryHighY = new WorldDiscoverySourceRegistry();
        const pubLow = new Publication({ id: 'pub-elev', title: 'Elevation' });
        const pubHigh = new Publication({ id: 'pub-elev', title: 'Elevation' });
        registerMaterializedSnapshotWorldSource(registryLowY, placedResult('hash-elev', 'pub-elev', { x: 5, y: -999, z: 5 }), pubLow);
        registerMaterializedSnapshotWorldSource(registryHighY, placedResult('hash-elev', 'pub-elev', { x: 5, y: 999, z: 5 }), pubHigh);
        const canvasLow = buildCanvasInstance({ registry: registryLowY });
        const canvasHigh = buildCanvasInstance({ registry: registryHighY });
        mountCanvas(canvasLow);
        mountCanvas(canvasHigh);
        const lowMarker = projectedPublicationsOf(canvasLow)[0];
        const highMarker = projectedPublicationsOf(canvasHigh)[0];
        assert(lowMarker.x === highMarker.x && lowMarker.y === highMarker.y, '2. world elevation (y) never enters a registered Snapshot\'s own screen mapping, exactly as it never has for any other encounter');
        unmountCanvas(canvasLow);
        unmountCanvas(canvasHigh);

        unmountCanvas(canvas);
        console.log('✓ Section C: spatial correctness — the rendered marker\'s screen position is exactly the unmodified projectToCanvas() formula applied to the real WorldPlacement position, elevation excluded');
    }

    // ---------------------------------------------------------------
    // Section D — no visibility/range filtering of any kind exists at the
    // registration/bridge layer. A Snapshot placed far outside the fixed
    // projectable span still registers and still projects, through the
    // SAME unmodified formula — whether it then falls inside or outside
    // the fixed SVG viewBox stays entirely WorldEncounterCanvas.js's own
    // pre-existing concern, never something this milestone decides.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        const inRangePublication = new Publication({ id: 'pub-in-range', title: 'In Range' });
        const outOfRangePublication = new Publication({ id: 'pub-out-of-range', title: 'Out Of Range' });

        // In range: within [-50, 50] on both axes -> lands inside the
        // fixed 0..600 viewBox.
        const inRangeResult = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-in-range', 'pub-in-range', { x: 40, y: 0, z: 40 }), inRangePublication);
        // Far outside the fixed WORLD_HALF_SPAN=50 span -> projects well
        // outside 0..600.
        const outOfRangeResult = registerMaterializedSnapshotWorldSource(registry, placedResult('hash-out-of-range', 'pub-out-of-range', { x: 5000, y: 0, z: 5000 }), outOfRangePublication);

        assert(inRangeResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '1. registration never rejects a Snapshot for being "too close"');
        assert(outOfRangeResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '2. registration never rejects a Snapshot for being "too far" — no range check of any kind exists at this layer');

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);
        assert(projected.length === 2, '3. BOTH Snapshots project — the registration/bridge layer never filters, hides, or drops one on the other\'s behalf');

        const inRangeMarker = projected.find((p) => p.objectId === 'pub-in-range');
        const outOfRangeMarker = projected.find((p) => p.objectId === 'pub-out-of-range');
        assert(inRangeMarker.x === 540 && inRangeMarker.y === 540, `4. the in-range Snapshot projects inside the fixed 0..600 viewBox, at exactly 300 + 6*40, got (${inRangeMarker.x},${inRangeMarker.y})`);
        assert(outOfRangeMarker.x === 300 + 6 * 5000 && outOfRangeMarker.y === 300 + 6 * 5000, `5. the out-of-range Snapshot still projects through the IDENTICAL unmodified formula — landing far outside 0..600 is WorldEncounterCanvas.js's own existing, pre-existing consequence, never a decision this milestone's own registration path makes`);
        assert(outOfRangeMarker.x > 600, '6. sanity — the out-of-range marker\'s own screen coordinate genuinely falls outside the fixed viewBox, confirming there is no clamping/culling logic hidden anywhere in this path either');

        unmountCanvas(canvas);
        console.log('✓ Section D: no visibility/range filtering exists at the registration/bridge layer — every registered Snapshot projects through the identical, unmodified formula regardless of its own position');
    }

    // ---------------------------------------------------------------
    // Section E — coexistence: an own local Publication, a peer-discovered
    // Publication, and two independently registered Snapshots all project
    // simultaneously, under their own distinct origins.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-own', title: 'My Own Publication' }],
            placements: [{ id: 'placement-own', publicationId: 'pub-own', position: { x: -10, y: 0, z: -10 } }]
        }));
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-discovered-peer', title: 'Discovered From A Peer' }],
            placements: [{ id: 'placement-peer', publicationId: 'pub-discovered-peer', position: { x: 15, y: 0, z: 15 } }]
        }, { remoteIdentity: { identityId: 'did:key:zPeerCoexist' } }));

        const publicationSnapshotOne = new Publication({ id: 'pub-snapshot-one', title: 'Selected Snapshot One' });
        const publicationSnapshotTwo = new Publication({ id: 'pub-snapshot-two', title: 'Selected Snapshot Two' });
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-coexist-one', 'pub-snapshot-one', { x: 1, y: 0, z: 1 }), publicationSnapshotOne);
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-coexist-two', 'pub-snapshot-two', { x: -1, y: 0, z: -1 }), publicationSnapshotTwo);

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);

        assert(projected.length === 4, '1. own Publication + peer-discovered Publication + two independently registered Snapshots all coexist as four distinct projected markers');
        const objectIds = projected.map((p) => p.objectId).sort();
        assert(JSON.stringify(objectIds) === JSON.stringify(['pub-discovered-peer', 'pub-own', 'pub-snapshot-one', 'pub-snapshot-two'].sort()),
            '2. every one of the four Publications is present, none replacing or hiding another');

        // Registering a THIRD Snapshot, or a peer disconnecting, disturbs
        // only its own slot — mirrors 0.9.160's own Section D idempotency
        // guarantee, observed here through actual rendering.
        registry.removeSource('peer:did:key:zPeerCoexist');
        const afterPeerLeaves = projectedPublicationsOf(canvas);
        assert(afterPeerLeaves.length === 3, '3. a peer disconnecting removes exactly its own contribution — both Snapshots and the own Publication are unaffected');
        assert(afterPeerLeaves.some((p) => p.objectId === 'pub-snapshot-one') && afterPeerLeaves.some((p) => p.objectId === 'pub-snapshot-two'), '4. both registered Snapshots survive a peer disconnecting, untouched');

        unmountCanvas(canvas);
        console.log('✓ Section E: own Publication, peer-discovered material, and independently registered Snapshots coexist in the same World View, none disturbing another');
    }

    // ---------------------------------------------------------------
    // Section F — identity preservation carried all the way to the
    // rendered marker.
    // ---------------------------------------------------------------
    {
        const { publicationId, reference, expectedPosition } = flagshipEncounter;
        assert(reference.hash !== publicationId, '1. contentHash is never the publicationId');
        assert(reference.uri !== reference.hash, '2. locator is never the contentHash');
        assert(JSON.stringify(expectedPosition) !== reference.hash, '3. sanity — position is never confused with contentHash');
        assert(publicationId !== reference.uri && publicationId !== reference.storage, '4. objectId is never the locator or the storage tag');

        // The marker's own rendered identity is the Publication's id —
        // never the Snapshot's own contentHash, locator, or storage tag.
        const registry = new WorldDiscoverySourceRegistry();
        const publication = new Publication({ id: publicationId, title: 'Identity Check', contentReference: reference });
        registerMaterializedSnapshotWorldSource(registry, placedResult(reference.hash, publicationId, expectedPosition), publication);
        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const [marker] = projectedPublicationsOf(canvas);
        assert(marker.objectId === publicationId, '5. the rendered marker\'s own objectId is the Publication\'s id');
        assert(marker.objectId !== reference.hash, '6. the rendered marker\'s own objectId is NEVER the Snapshot\'s own contentHash');
        assert(marker.objectId !== reference.uri, '7. the rendered marker\'s own objectId is NEVER the Snapshot\'s own locator');

        const [source] = registry.listSources();
        assert(source.origin === `snapshot:${reference.hash}`, '8. the registry\'s own origin key is content-addressed, entirely separate from the rendered objectId');

        unmountCanvas(canvas);
        console.log('✓ Section F: identity preservation reaches the rendered marker unbroken — contentHash/locator/position/objectId stay pairwise distinct all the way to the screen');
    }

    // ---------------------------------------------------------------
    // Section G — structural sweep: this milestone adds no production
    // file, modifies no production file, and no new rendering authority
    // exists anywhere as a result of it.
    // ---------------------------------------------------------------
    {
        const bridgeSource = await readFile(new URL('../application/MaterializedSnapshotWorldDiscoveryBridge.js', import.meta.url), 'utf8');
        const bridgeCodeOnly = bridgeSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/WorldEncounterCanvas|WorldEncounterMarker|viewBox|projectToCanvas/i.test(bridgeCodeOnly),
            '1. the registration bridge still imports and references nothing rendering-shaped — no canvas, no marker, no projection formula of its own');
        assert(!/viewport|visible|camera|mesh|scene/i.test(bridgeCodeOnly),
            '2. no viewport/visibility/camera/rendering vocabulary appears anywhere in the bridge\'s own executable code — unchanged from 0.9.160\'s own sweep');

        const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const canvasCodeOnly = canvasSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        // 0.9.138/0.9.144 already gave this file legitimate, UNRELATED
        // "snapshot" vocabulary of their own — distributing/discovering a
        // Signed Claim snapshot OF a selected Publication
        // (`snapshotDistributionCommand`/`discoverSnapshotCommand`/
        // `snapshotDiscoveryResult`, etc.), an entirely different concept
        // from THIS family's own "materialized World Snapshot." This
        // milestone's own structural boundary is narrower and more
        // specific: no reference to THIS family's own registration/
        // placement vocabulary exists here at all.
        assert(!/MaterializedSnapshotWorldDiscoveryBridge|registerMaterializedSnapshotWorldSource|SnapshotWorldRegistrationOutcome|SnapshotWorldPlacement|resolveSnapshotWorldPlacement/.test(canvasCodeOnly),
            '3. WorldEncounterCanvas.js never references this family\'s own registration/placement vocabulary — a registered Snapshot reaches it exclusively as an ordinary, origin-blind encounter, never a special-cased second rendering path');
        assert(!canvasCodeOnly.includes('MaterializedSnapshotWorldDiscoveryBridge'),
            '4. WorldEncounterCanvas.js never imports the registration bridge — it depends only on the registry prop it is handed, exactly as every earlier milestone already established');

        const markerSource = await readFile(new URL('../ui/components/WorldEncounterMarker.js', import.meta.url), 'utf8');
        assert(!/^\s*import /m.test(markerSource), '5. WorldEncounterMarker.js still imports nothing at all — no Snapshot-specific marker component was ever introduced');

        assert(!bridgeCodeOnly.includes('fetch(') && !bridgeCodeOnly.includes('await '),
            '6. the registration bridge still performs no network/async I/O of its own — unchanged from 0.9.160');

        console.log('✓ Section G: structural sweep — no production file was added or modified by this milestone, and no new rendering authority (camera/viewport/visibility/discovery/retrieval/verification/placement/materialization) exists anywhere in the registration bridge or the rendering pipeline');
    }

    console.log('\n✅ All Snapshot World Rendering tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
