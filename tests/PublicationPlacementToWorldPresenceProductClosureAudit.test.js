import { readFile } from 'node:fs/promises';

import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacePublicationUseCase } from '../application/placement/PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from '../application/placement/MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from '../application/placement/RemoveWorldPlacementUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/publication/LoadPublicationDocumentUseCase.js';
import { LoadPublishedWorldSessionUseCase } from '../application/publication/LoadPublishedWorldSessionUseCase.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { GridPlacementStrategy } from '../application/placement/InitialPlacementStrategy.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { SpatialCameraController } from '../application/world/SpatialCameraController.js';
import { ContentReference } from '../core/ContentReference.js';
import { Publication } from '../publisher/Publication.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { worldEncounterCanvasFiles, worldViewFiles, worldNavigationSessionFiles } from './support/SourceFileGroups.js';

// 0.9.606 — Publication Placement-to-World Presence Product Closure Audit.
//
// TYPE: test-only product/architecture closure audit. NO PRODUCTION
// CHANGES. This is the final-closure gate for the arc 0.9.594-0.9.605
// closed: DISCOVER -> RESOLVE -> VERIFY -> ADMIT -> PLACE ->
// PlacementRecord -> Publication-aware World discovery ->
// LoadPublishedWorldSessionUseCase -> verified material -> World
// document -> RENDER. Every prior milestone in this family proved ONE
// seam at a time; this milestone reproduces the WHOLE journey across
// real production boundaries (never a hand-assembled final state),
// checks identity/placement/presence semantics hold throughout, and
// then asks the deliberately skeptical product question: is there a
// genuine user-facing gap left, or is the arc actually done.
//
// CENTRAL RESULT (Section F): the arc is NOT fully closed. A real
// session boundary (this replica's process restarting, e.g. a page
// reload) loses `decentralizedPublicationDiscoveryProvider`'s entire
// in-memory contents (ui/main.js constructs exactly one instance, never
// persisted — see that file's own 0.9.337 comment). A PlacementRecord
// survives (LocalPlacementRegistry is storage-backed) but
// LocalWorldLayoutProvider.findVisibleDocuments() can only resolve a
// spatial-index hit's publicationId back to a documentId by asking the
// (now-empty) discovery provider — WorldPlacement itself deliberately
// carries no documentId (core/WorldPlacement.js's own architectural
// invariant: "a WorldPlacement does NOT own a world; it points to one
// via publicationId"). So the Publication doesn't merely fail to
// render — it never re-enters `visible`/`nearby` at all, and therefore
// never reaches `_loadWorld()`'s own try/catch, so it's not even
// classified "Unavailable" (WorldView.js's own failedWorlds section).
// It silently vanishes, indistinguishable from having never been
// admitted. This is a real architectural limitation 0.9.605 did not
// introduce and does not address — see Section F/L for the live proof
// and the resulting classification.
//
// SECTIONS (mirroring the requesting brief's own lettering):
//   A. Full journey reproduction, real boundaries only.
//   B. Identity continuity (PublicationId/documentId/contentHash/
//      placementId all independent, never inferred from equality).
//   C. Placement semantics (explicit Place only; claimedPosition inert).
//   D. World-presence state table, live-verified against real signals.
//   E. Lifecycle transitions (place/remove/re-place; material flapping).
//   F. Persistence across a REAL session boundary — the central result.
//   G. Multi-Publication isolation.
//   H. Existing local-World regression (fork-policy/_resolveWorldDocument).
//   I. Observational boundaries — rendering causes no mutation.
//   J. UI journey audit (source-level, against real ui/ files).
//   K. Findings classification.
//   L. Closure classification.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

if (typeof globalThis.window === 'undefined') {
    const store = new Map();
    globalThis.window = {
        localStorage: {
            getItem: (k) => (store.has(k) ? store.get(k) : null),
            setItem: (k, v) => { store.set(k, String(v)); },
            removeItem: (k) => { store.delete(k); },
            key: (i) => Array.from(store.keys())[i] ?? null,
            get length() { return store.size; }
        }
    };
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Same minimal renderer stand-in the 0.9.605 flagship (and
// DocumentLifecycle.test.js before it) already uses.
function stubRenderer(extra = {}) {
    return {
        addWorld() {}, removeWorld() {}, dispose() {},
        clearSelection() {}, clearHover() {},
        getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 } }; },
        setCameraState() {},
        ...extra
    };
}

function serializedDocumentBytes(documentId, title = 'D') {
    const world = new World({ id: documentId });
    const building = new Building({ creator: 'x' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const doc = new Document({ world, metadata: new DocumentMetadata({ title, author: 'x' }) });
    return JSON.stringify(new DocumentSerializer().serialize(doc));
}

// Stands in for 0.9.595's own admission gate (AVAILABLE + VERIFIED
// only) — a Publication reaches `decentralizedProvider.add()` in
// production only after passing that gate.
function seedRepositoryAdmittedPublication(decentralizedProvider, { id, documentId = id, title = 'Discovered Work', author = 'someone-else', contentReference = null } = {}) {
    const publication = new Publication({
        id, documentId, title, author,
        contentReference: contentReference || new ContentReference({ hash: 'a'.repeat(64) })
    });
    decentralizedProvider.add(publication);
    return publication;
}

// Builds every collaborator application/world/CreateWorldViewUseCase.js
// itself builds (post-0.9.605), in the SAME shape and order, over a
// real, unmodified WorldNavigationSession — reused verbatim from
// tests/PublicationWorldRenderingDiscoveryWiringFix.test.js's own
// buildHarness(), which Section A below re-verifies still matches the
// real production file. `decentralized`, if supplied, is threaded in
// as-is — callers control its identity/lifetime, which is exactly what
// Section F needs to vary across a simulated session boundary.
function buildHarness(storage, { decentralized = null } = {}) {
    const identity = new LocalIdentityProvider(storage);
    identity.login('alice');
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const publicationActionDiscoveryProvider = decentralized
        ? new CompositeDiscoveryProvider([discoveryProvider, decentralized])
        : discoveryProvider;
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, publicationActionDiscoveryProvider);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage);
    const loadPublishedWorldSessionUseCase = new LoadPublishedWorldSessionUseCase(publisher, new DocumentSerializer(), contentStore);
    const placePublicationUseCase = new PlacePublicationUseCase(
        spatialIndexProvider, publicationActionDiscoveryProvider, loadPublicationDocumentUseCase, brickRegistry, placementRegistry, identity
    );
    const moveWorldPlacementUseCase = new MoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry, null, identity);
    const removeWorldPlacementUseCase = new RemoveWorldPlacementUseCase(spatialIndexProvider, placementRegistry);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, identity, placePublicationUseCase, new GridPlacementStrategy());
    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase,
        loadPublishedWorldSessionUseCase,
        worldLayoutProvider,
        publishDocumentUseCase,
        identityProvider: identity,
        discoveryProvider,
        publicationActionDiscoveryProvider,
        placementRegistry,
        placePublicationUseCase,
        moveWorldPlacementUseCase,
        removeWorldPlacementUseCase
    });
    session._session = stubRenderer();
    // getSpatialState() (Section F/J's own target — the exact read
    // ui/views/WorldView.js's refreshSpatialUI() consumes) needs a
    // camera controller; start() itself pulls in the real renderer
    // stack, so this wires the SAME minimal stub SpatialCameraController
    // already wraps in production, directly, mirroring session._session
    // above rather than calling start().
    session._spatialCameraController = new SpatialCameraController(session._session);
    return {
        session, identity, contentStore, discoveryProvider, publicationActionDiscoveryProvider,
        worldLayoutProvider, spatialIndexProvider, placementRegistry, placePublicationUseCase,
        removeWorldPlacementUseCase, publishDocumentUseCase, storage
    };
}

const findings = [];
function record(id, classification, summary) {
    findings.push({ id, classification, summary });
}

async function run() {
    console.log('Running Publication Placement-to-World Presence Product Closure Audit...\n');

    // ===============================================================
    // Section A — Full journey reproduction, crossing real boundaries.
    // Not a hand-assembled final state: DISCOVER (seed into the
    // decentralized provider, exactly as a resolved encounter would),
    // ADMIT (the same accumulator production code admits into),
    // explicit PLACE (the real session.placePublication(), the same
    // method WorldView.js's placeOwnPublication() calls), then RENDER
    // through the real, unmodified _loadWorld().
    // ===============================================================
    let journey;
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralized });

        const bytes = serializedDocumentBytes('journey-doc', 'Journey World');
        const contentReference = harness.contentStore.put(bytes);
        const publication = seedRepositoryAdmittedPublication(decentralized, {
            id: 'journey-pub', documentId: 'journey-doc', contentReference
        });

        assert(harness.placementRegistry.findByPublicationId(publication.id).length === 0,
            'A1. Before any explicit Place, admission alone creates no placement.');

        const placement = harness.session.placePublication(publication.id, { x: 77, y: 0, z: 77 });
        assert(placement !== null, 'A2. Explicit Place, through the real session method a user action actually invokes, succeeds.');

        const visible = harness.worldLayoutProvider.findVisibleDocuments({ x: 77, y: 0, z: 77 }, 10);
        assert(visible.includes(publication.documentId), 'A3. The real worldLayoutProvider now surfaces it at the placed position.');

        harness.session._loadWorld(publication.documentId);
        const loaded = harness.session.getDocument(publication.documentId);
        assert(loaded.world.getBuildings()[0].getBricks().length === 1,
            'A4. RENDER: real content, not a placeholder — the full DISCOVER->ADMIT->PLACE->RENDER path closes end to end.');

        journey = { storage, harness, publication, decentralized };
        console.log('✓ A — full journey reproduced end to end against real, unmodified production classes.');
    }

    // ===============================================================
    // Section B — Identity continuity. PublicationId, documentId,
    // contentHash and placementId are four independently-assigned
    // values; the chain between them is established by real
    // structural references, never by coincidental equality.
    // ===============================================================
    {
        const { harness, publication } = journey;
        assert(publication.id !== publication.documentId,
            'B1. PublicationId !== documentId — independently assigned (publisher/Publication.js: id = createId(), documentId = document.world.id).');
        assert(publication.documentId !== publication.contentReference.hash,
            'B2. documentId !== contentHash — a documentId is an author-chosen World id; contentHash is derived from serialized bytes.');
        const record = harness.placementRegistry.findByPublicationId(publication.id)[0];
        assert(record.placementId !== publication.id && record.placementId !== publication.documentId && record.placementId !== publication.contentReference.hash,
            'B3. placementId is its own, fourth, independently-assigned identity — never reused from any of the other three.');
        assert(record.publicationId === publication.id,
            'B4. The PlacementRecord references the Publication by publicationId — a real structural field, not inferred from any of the id/documentId/contentHash values matching by chance.');
        const loaded = harness.session.getDocument(publication.documentId);
        assert(loaded.world.id === publication.documentId,
            'B5. The rendered World carries documentId, never publicationId or contentHash — resolved via LoadPublishedWorldSessionUseCase\'s own contentStore.get(contentReference) -> DocumentSerializer.deserialize() chain, not by any of the three colliding.');
        assert(harness.contentStore.has(publication.contentReference) === true,
            'B6. The material is addressed at contentStore by contentHash specifically (LocalContentStore is a content-addressed store) — a fifth, independent coordinate space from documentId/publicationId/placementId.');

        console.log('✓ B — PublicationId, documentId, contentHash and placementId are four/five genuinely independent identities; the chain between them is carried by real fields (contentReference, publicationId, world.id), never substituted or inferred.');
    }

    // ===============================================================
    // Section C — Placement semantics: explicit Place is the only path
    // to a PlacementRecord; claimedPosition stays inert.
    // ===============================================================
    {
        const placeSrc = await readSource('application/placement/PlacePublicationUseCase.js');
        assert(!/claimedPosition/.test(placeSrc),
            'C1. PlacePublicationUseCase.js never reads claimedPosition — position is only ever the caller\'s own explicit argument.');

        const canvasSrc = (await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n');
        assert(/claimedPosition` REMAINS INERT/.test(canvasSrc) || /claimedPosition.*never reads/.test(canvasSrc) || /admitToRepositoryDiscovery\(\) never reads `claimedPosition`/.test(canvasSrc),
            'C2. WorldEncounterCanvas.js\'s own admission path documents, in its own header, that claimedPosition is never read for admission or placement.');

        // Live: a resolved+admitted Publication that was NEVER explicitly
        // placed has no PlacementRecord at all, no matter how long it sits
        // discovered/admitted.
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralized });
        const pub = seedRepositoryAdmittedPublication(decentralized, { id: 'c-pub', documentId: 'c-doc' });
        assert(harness.placementRegistry.findByPublicationId(pub.id).length === 0,
            'C3. LIVE: admitted-but-never-placed has zero PlacementRecords — discovery/admission alone never manufactures one.');

        // Explicit Place is the only production call site that can.
        const placement = harness.session.placePublication(pub.id, { x: 5, y: 0, z: 5 });
        assert(placement !== null && harness.placementRegistry.findByPublicationId(pub.id).length === 1,
            'C4. LIVE: only the explicit placePublication() call creates one, and exactly one.');

        console.log('✓ C — explicit Place remains the only path to an authoritative, owned PlacementRecord; claimedPosition stays inert at both the use-case and the encounter-admission layer, live-reconfirmed.');
    }

    // ===============================================================
    // Section D — World-presence state table, live-verified against
    // REAL observable signals (worldLayoutProvider.findVisibleDocuments/
    // getSpatialState's loaded/nearby/failed, never inferred from
    // PlacementRecord existing alone). Each row is checked against an
    // ACTUAL provider call, not asserted from milestone history.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralized });
        const ORIGIN = { x: 0, y: 0, z: 0 };
        const WIDE = 1e9;

        // Row 1 — discovered, unplaced: NOT YET admitted at all (a raw
        // resolved candidate the encounter surface holds locally, before
        // admitToRepositoryDiscovery()). Not in any discovery provider.
        const encountered = new Publication({ id: 'd1-pub', documentId: 'd1-doc', contentReference: new ContentReference({ hash: '1'.repeat(64) }) });
        assert(!harness.worldLayoutProvider.findVisibleDocuments(ORIGIN, WIDE).includes(encountered.documentId),
            'D1. [discovered, unplaced/unadmitted] absent from World discovery entirely — matches "Encounter/actionable Publication," not yet Repository-visible.');

        // Row 2 — admitted, unplaced. LIVE RESULT (see this file's own
        // header/Section F comment on why this differs from the brief's
        // own naive table): 0.2.24's pre-existing deterministic-grid
        // fallback (unchanged by 0.9.605 — see world-layout/
        // LocalWorldLayoutProvider.js's own header) already makes an
        // ADMITTED Publication world-present at a computed, non-authored
        // position once material resolves, with NO explicit Place. This
        // is not a regression 0.9.605 introduced (the fallback mechanism
        // predates this entire arc) — it is a WIDENING of an existing
        // mechanism to a new discovery source, and this audit reports it
        // rather than assuming the brief's own hypothesis.
        const bytes2 = serializedDocumentBytes('d2-doc', 'Admitted Unplaced');
        const ref2 = harness.contentStore.put(bytes2);
        const admittedOnly = seedRepositoryAdmittedPublication(decentralized, { id: 'd2-pub', documentId: 'd2-doc', contentReference: ref2 });
        assert(harness.placementRegistry.findByPublicationId(admittedOnly.id).length === 0,
            'D2a. [admitted, unplaced] genuinely has no PlacementRecord.');
        const gridPos = harness.worldLayoutProvider.getPosition(admittedOnly.documentId);
        assert(harness.worldLayoutProvider.findVisibleDocuments(gridPos, 1).includes(admittedOnly.documentId),
            'D2b. [admitted, unplaced] LIVE: already world-visible at its own deterministic grid position — pre-existing 0.2.24 fallback behavior, now reachable for Repository-admitted Publications too (a side effect of 0.9.605\'s discovery widening, not a new mechanism). See Section K, finding D2.');
        harness.session._loadWorld(admittedOnly.documentId);
        assert(harness.session.getDocument(admittedOnly.documentId) !== null,
            'D2c. [admitted, unplaced] LIVE: and genuinely renders (real material, via the same material bridge) — so "admitted, unplaced" is NOT distinct from "placed, material available" in current production behavior. The distinguishing UI fact is WHERE it renders (an arbitrary deterministic slot vs. the user\'s own chosen position), not WHETHER it renders.');

        // Row 3 — placed, material available (the flagship shape).
        const bytes3 = serializedDocumentBytes('d3-doc', 'Placed Available');
        const ref3 = harness.contentStore.put(bytes3);
        const placedAvailable = seedRepositoryAdmittedPublication(decentralized, { id: 'd3-pub', documentId: 'd3-doc', contentReference: ref3 });
        harness.session.placePublication(placedAvailable.id, { x: 300, y: 0, z: 300 });
        harness.session._loadWorld(placedAvailable.documentId);
        assert(harness.session.getDocument(placedAvailable.documentId).world.id === 'd3-doc',
            'D3. [placed, material available] renders, at the explicitly-chosen position (300,300) — the authoritative case.');

        // Row 4 — placed, material unavailable: discoverable/positioned
        // (spatial index has nothing to say about material), but
        // _loadWorld() refuses, and — critically — updateSpatialView()'s
        // own try/catch (application/world/WorldNavigationSession.js) is what
        // turns that refusal into the "Unavailable" UI signal
        // (ui/views/WorldView.js's own failedWorlds section), never a
        // silent success.
        const neverPut = new ContentReference({ hash: '4'.repeat(64) });
        const placedUnavailable = seedRepositoryAdmittedPublication(decentralized, { id: 'd4-pub', documentId: 'd4-doc', contentReference: neverPut });
        harness.session.placePublication(placedUnavailable.id, { x: 301, y: 0, z: 301 });
        assert(harness.worldLayoutProvider.findVisibleDocuments({ x: 301, y: 0, z: 301 }, 1).includes(placedUnavailable.documentId),
            'D4a. [placed, material unavailable] discoverable/positioned.');
        let threw4 = null;
        try { harness.session._loadWorld(placedUnavailable.documentId); } catch (e) { threw4 = e; }
        assert(threw4 !== null && /content not found/.test(threw4.message),
            'D4b. [placed, material unavailable] _loadWorld() refuses with a distinct, honest error — this is exactly the case updateSpatialView()\'s try/catch (WorldNavigationSession.js line ~3750) converts into a failedLoads entry, which ui/views/WorldView.js\'s own "Unavailable (N)" section (line ~5472) renders BY TITLE/AUTHOR (enriched from the same publicationActionDiscoveryProvider-backed listPublicationsUseCase, 0.9.339) — not merely a raw id. This state IS truthfully communicated to the user.');

        // Row 5 — placement removed: no PlacementRecord, and (per D2)
        // still resolves to whatever the deterministic grid fallback
        // gives it if material remains available — "no World presence"
        // in the brief's own table means no EXPLICIT/OWNED presence,
        // not literal absence from view, given D2's own live result.
        //
        // Removed at the DOMAIN layer (RemoveWorldPlacementUseCase,
        // keyed by placementId — universal) rather than through
        // session.removePlacement(documentId): the latter is
        // documentId-keyed (via _resolvePlacementRecord ->
        // _findPublications -> the narrow discoveryProvider) and, for a
        // Repository-admitted-only Publication like this one, cannot
        // resolve a placement to act on at all — a real, separate,
        // already-documented limit this audit verifies precisely in
        // Section J, not conflated with this row's own narrower claim
        // (that removal, once reached, behaves correctly).
        const placementIdToRemove = harness.placementRegistry.findByPublicationId(placedAvailable.id)[0].placementId;
        harness.removeWorldPlacementUseCase.execute(placementIdToRemove);
        assert(harness.placementRegistry.findByPublicationId(placedAvailable.id).length === 0,
            'D5. [placement removed] PlacementRecord genuinely gone.');

        // Row 6 — unverified: never reaches any discovery provider at
        // all (the admission gate is AVAILABLE + VERIFIED only,
        // 0.9.523/0.9.595) — identical to Row 1's own live check.
        assert(!harness.worldLayoutProvider.findVisibleDocuments(ORIGIN, WIDE).includes('d6-never-admitted-doc'),
            'D6. [unverified] never discovered — the admission gate (0.9.595) is the only door, and this document never passed through it.');

        console.log('✓ D — six states checked against REAL provider calls. Five of six match the brief\'s own hypothesis. Row 2 (admitted, unplaced) does NOT: it already renders today, via a pre-existing (0.2.24), unmodified grid-fallback mechanism newly reachable for Repository-admitted Publications as a side effect of 0.9.605\'s discovery widening. Recorded as finding D2 in Section K — not a regression, not something to silently assume away.');
    }

    // ===============================================================
    // Section E — Lifecycle transitions: place -> remove -> place
    // again; material available -> unavailable -> available again.
    // No automatic placement or cleanup at any transition.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralized });
        const bytes = serializedDocumentBytes('e-doc', 'Lifecycle');
        const ref = harness.contentStore.put(bytes);
        const pub = seedRepositoryAdmittedPublication(decentralized, { id: 'e-pub', documentId: 'e-doc', contentReference: ref });

        // unplaced -> Place -> placed + visible
        harness.session.placePublication(pub.id, { x: 900, y: 0, z: 900 });
        assert(harness.worldLayoutProvider.getPosition(pub.documentId).x === 900,
            'E1. Place -> placed at the exact chosen position.');
        harness.session._loadWorld(pub.documentId);
        assert(harness.session.getDocument(pub.documentId) !== null, 'E2. placed + visible -> renders.');

        // Remove -> unplaced/not-owned (per D2/D5, may still resolve via
        // grid fallback if material remains — checked explicitly, not
        // assumed). Domain-layer removal, per D5's own comment on why
        // session.removePlacement(documentId) cannot reach a
        // Repository-admitted-only Publication.
        const placementIdToRemoveE = harness.placementRegistry.findByPublicationId(pub.id)[0].placementId;
        harness.removeWorldPlacementUseCase.execute(placementIdToRemoveE);
        assert(harness.placementRegistry.findByPublicationId(pub.id).length === 0, 'E3. Remove -> PlacementRecord gone.');
        const positionAfterRemove = harness.worldLayoutProvider.getPosition(pub.documentId);
        assert(positionAfterRemove.x !== 900, 'E4. Position after Remove is no longer the removed explicit placement — it fell back to the deterministic grid slot (per D2), never a stale copy of the removed position.');

        // Place again -> placed + visible, at a NEW explicit position.
        const secondPlacement = harness.session.placePublication(pub.id, { x: -900, y: 0, z: -900 });
        assert(secondPlacement !== null, 'E5. Place again succeeds.');
        assert(harness.worldLayoutProvider.getPosition(pub.documentId).x === -900,
            'E6. Re-placed at the NEW explicit position — no stale state from the removed placement.');
        assert(harness.placementRegistry.findByPublicationId(pub.id).length === 1,
            'E7. Exactly one current PlacementRecord after remove+re-place — no accumulation of dead records the registry still returns.');

        // Material flapping: available -> unavailable -> available again,
        // for the SAME already-placed Publication, no placement touched.
        harness.session._loadWorld(pub.documentId);
        assert(harness.session.getDocument(pub.documentId).world.id === 'e-doc', 'E8. [material available] renders.');

        // Simulate unavailability: remove the underlying bytes from
        // storage directly (LocalContentStore has no delete(), so this
        // reaches into storage the same way a real "peer went offline"
        // scenario would leave contentStore.get() failing) — the
        // PlacementRecord/discovery entry are UNTOUCHED.
        storage.remove('content:' + ref.hash);
        harness.session._unloadWorld ? harness.session._unloadWorld(pub.documentId) : null; // best-effort unload if the API allows it
        let threwUnavailable = null;
        try { harness.session._loadWorld(pub.documentId); } catch (e) { threwUnavailable = e; }
        assert(threwUnavailable !== null, 'E9. [material available -> unavailable] a fresh load attempt now refuses — the placement itself is completely untouched by the material going missing.');
        assert(harness.placementRegistry.findByPublicationId(pub.id).length === 1,
            'E10. Material becoming unavailable never removed or altered the PlacementRecord — no automatic cleanup.');

        // Restore material -> available again -> renders again.
        storage.save('content:' + ref.hash, bytes);
        harness.session._loadWorld(pub.documentId);
        assert(harness.session.getDocument(pub.documentId).world.id === 'e-doc',
            'E11. [material unavailable -> available again] renders again, from the SAME still-intact placement — no re-Place needed.');

        console.log('✓ E — full lifecycle (place -> remove -> re-place; material available -> unavailable -> available) behaves deterministically, with no automatic placement or cleanup at any transition.');
    }

    // ===============================================================
    // Section F — Persistence across a REAL session boundary. THE
    // CENTRAL RESULT of this audit. "Session 1" places a
    // Repository-admitted Publication and renders it. "Session 2" is a
    // FRESH WorldNavigationSession/discovery composition over the SAME
    // durable storage — reproducing what actually happens across a
    // real ui/main.js reload, where storageProvider persists but
    // `decentralizedPublicationDiscoveryProvider` is a fresh, empty,
    // module-level instance (that file's own 0.9.337 comment says so
    // explicitly: "the ONE instance this replica EVER constructs").
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();

        // SESSION 1.
        const decentralized1 = new DecentralizedPublicationDiscoveryProvider();
        const h1 = buildHarness(storage, { decentralized: decentralized1 });
        const bytes = serializedDocumentBytes('f-doc', 'Session Boundary Test');
        const ref = h1.contentStore.put(bytes);
        const pub = seedRepositoryAdmittedPublication(decentralized1, { id: 'f-pub', documentId: 'f-doc', contentReference: ref });
        h1.session.placePublication(pub.id, { x: 4000, y: 0, z: 4000 });
        h1.session._loadWorld(pub.documentId);
        assert(h1.session.getDocument(pub.documentId).world.id === 'f-doc', 'F1. Session 1: renders, exactly like every other section here.');

        // SESSION 2 — same durable storage, FRESH decentralized
        // provider (nothing re-admitted — no encounter re-ran).
        const decentralized2 = new DecentralizedPublicationDiscoveryProvider();
        const h2 = buildHarness(storage, { decentralized: decentralized2 });

        assert(h2.placementRegistry.findByPublicationId(pub.id).length === 1,
            'F2. Session 2: the PlacementRecord itself DID survive — LocalPlacementRegistry is storage-backed, exactly as intended.');
        const rawSpatialHit = h2.spatialIndexProvider.discover({ x: 4000, y: 0, z: 4000 }, 10);
        assert(rawSpatialHit.length === 1 && rawSpatialHit[0].publicationId === pub.id,
            'F3. Session 2: the raw spatial index also still has the placement, keyed by publicationId, exactly as core/WorldPlacement.js documents.');

        const visible2 = h2.worldLayoutProvider.findVisibleDocuments({ x: 4000, y: 0, z: 4000 }, 10);
        assert(!visible2.includes(pub.documentId),
            'F4. *** THE GAP *** Session 2: worldLayoutProvider.findVisibleDocuments() no longer surfaces it AT ALL — not merely unrenderable, genuinely absent from the visible set. LocalWorldLayoutProvider.findVisibleDocuments() can only translate the spatial index\'s publicationId hit back into a documentId by calling discoveryProvider.findById(publicationId) (world-layout/LocalWorldLayoutProvider.js) — and the fresh decentralized2 provider has never heard of "f-pub".');

        let threwSession2 = null;
        try { h2.session._loadWorld(pub.documentId); } catch (e) { threwSession2 = e; }
        assert(threwSession2 !== null && /no document found/.test(threwSession2.message),
            'F5. Session 2: _loadWorld() fails with the SAME "no document found" error as a Publication that was never admitted at all (Section D, row 6) — genuinely indistinguishable from "this was never placed."');

        // The critical UI-truthfulness consequence: because it never
        // re-enters `visible`, the real streaming loop
        // (updateSpatialView()) never even ATTEMPTS to load it, so it
        // never reaches _failedLoads either — it does not appear in
        // WorldView.js's own "Unavailable" section (Section D4b), and
        // it does not appear in "Worlds in View" or "Nearby" either.
        // From the user's perspective it is simply gone, with no error,
        // no "Unavailable" badge, nothing — worse than the material-
        // missing case (D4), which at least gets a truthful, visible
        // failure state.
        const state2 = h2.session.getSpatialState();
        assert(!state2.loaded.includes(pub.documentId) && !state2.nearby.includes(pub.documentId) && !state2.failed.includes(pub.documentId),
            'F6. Session 2: getSpatialState() — the EXACT read ui/views/WorldView.js\'s refreshSpatialUI() consumes to populate loadedWorlds/nearbyWorlds/failedWorlds — places this documentId in NONE of the three lists. No UI surface this codebase has today can tell the user this Publication used to be here.');

        // Confirm this is NOT a PlacementRecord authority violation and
        // NOT a claimedPosition leak — it is purely a discovery-lookup
        // seam, consistent with Section C/E's own findings.
        assert(h2.placementRegistry.findByPublicationId(pub.id)[0].position.x === 4000,
            'F7. The surviving PlacementRecord\'s OWN position is still exactly correct (4000) — this is not a data-loss or corruption bug, purely a discovery/resolution gap sitting downstream of a completely intact, correctly-positioned durable record.');

        // Root-cause confirmation at the source level: WorldPlacement
        // really does not carry documentId, so there genuinely is no
        // OTHER durable path from a PlacementRecord back to a
        // resolvable Publication than the (non-persistent) discovery
        // provider.
        const placementSrc = await readSource('core/WorldPlacement.js');
        assert(/does NOT own\s*\n?\/\/ a world\. It points to one via publicationId/.test(placementSrc),
            'F8. Source-confirmed root cause: WorldPlacement\'s own architectural invariant means a documentId can only ever be recovered by asking a discovery provider for the publicationId — there is no second, redundant, already-persisted path this milestone could exploit instead.');
        const mainSrc = await readSource('ui/main.js');
        assert(/const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider\(\);/.test(mainSrc),
            'F9. Source-confirmed: ui/main.js constructs exactly one, never-persisted, module-scope instance — reconfirming Session 2\'s harness faithfully reproduces what a real reload actually does, not a synthetic worst case.');

        console.log('✓ F — THE CENTRAL RESULT: a durable, correctly-positioned PlacementRecord survives a real session boundary; the Publication it points to does not, because nothing durable maps its publicationId back to a documentId/material once the in-memory Repository is gone. The Publication does not merely fail to render — it vanishes from every World-presence signal the UI reads, indistinguishable from never having been placed at all. See Section L for classification.');
    }

    // ===============================================================
    // Section G — Multi-Publication isolation.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralized });

        const p1Ref = harness.contentStore.put(serializedDocumentBytes('g1-doc', 'P1'));
        const p1 = seedRepositoryAdmittedPublication(decentralized, { id: 'g1-pub', documentId: 'g1-doc', contentReference: p1Ref });
        harness.session.placePublication(p1.id, { x: 5001, y: 0, z: 5001 });

        const p2Ref = harness.contentStore.put(serializedDocumentBytes('g2-doc', 'P2'));
        const p2 = seedRepositoryAdmittedPublication(decentralized, { id: 'g2-pub', documentId: 'g2-doc', contentReference: p2Ref });
        harness.session.placePublication(p2.id, { x: 5002, y: 0, z: 5002 });

        const p3 = seedRepositoryAdmittedPublication(decentralized, { id: 'g3-pub', documentId: 'g3-doc' }); // admitted, unplaced

        const p4 = new Publication({ id: 'g4-pub', documentId: 'g4-doc', contentReference: new ContentReference({ hash: '4'.repeat(64) }) }); // never admitted

        harness.session._loadWorld(p1.documentId);
        harness.session._loadWorld(p2.documentId);

        // Remove P1's placement only (domain-layer, per D5's own
        // comment on session.removePlacement(documentId)'s narrow-
        // discoveryProvider limit for Repository-admitted Publications).
        const p1PlacementId = harness.placementRegistry.findByPublicationId(p1.id)[0].placementId;
        harness.removeWorldPlacementUseCase.execute(p1PlacementId);

        assert(harness.placementRegistry.findByPublicationId(p1.id).length === 0, 'G1. P1: placement gone.');
        assert(harness.placementRegistry.findByPublicationId(p2.id).length === 1 && harness.worldLayoutProvider.getPosition(p2.documentId).x === 5002,
            'G2. P2: completely unaffected — still placed at its own, exact position.');
        assert(harness.placementRegistry.findByPublicationId(p3.id).length === 0,
            'G3. P3: still unplaced (was never placed to begin with; removing P1 changed nothing about it).');
        const allVisible = harness.worldLayoutProvider.findVisibleDocuments({ x: 0, y: 0, z: 0 }, 1e9);
        assert(!allVisible.includes(p4.documentId),
            'G4. P4: still entirely excluded — never admitted, unaffected by any of P1/P2/P3\'s own lifecycle events.');

        console.log('✓ G — removing P1\'s placement affects only P1: P2 stays placed, P3 stays unplaced-but-admitted, P4 stays excluded. No shared/global "current Publication" state leaks across them.');
    }

    // ===============================================================
    // Section H — Existing local-World regression.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const harness = buildHarness(storage); // no decentralized provider — every pre-0.9.605 caller's own shape

        function makeDoc(title) {
            const world = new World({});
            const building = new Building({ creator: 'alice' });
            building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
            world.addBuilding(building);
            return new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice' }) });
        }
        const localPub = harness.publishDocumentUseCase.execute({ document: makeDoc('Local Document') });
        harness.session._loadWorld(localPub.documentId);
        assert(harness.session.getDocument(localPub.documentId).world.getBuildings().length === 1,
            'H1. A locally-published document still renders via the ordinary LOCAL path — untouched by anything in this audit.');
        assert(harness.session.isDocumentPublished(localPub.documentId) === true,
            'H2. Still correctly marked published via _isKnownPublication()/_findPublications() (the narrow, unwidened discoveryProvider) — fork-policy\'s own choke point, unchanged.');

        const sessionSrc = (await Promise.all(worldNavigationSessionFiles().map((file) => readSource(file)))).join('\n');
        const findPublicationsBody = sessionSrc.match(/_findPublications\(documentId\) \{[\s\S]*?\n {4}\}/);
        assert(findPublicationsBody !== null && /this\._discoveryProvider/.test(findPublicationsBody[0]) && !/this\._publicationActionDiscoveryProvider/.test(findPublicationsBody[0]),
            'H3. Source-reconfirmed: fork-policy\'s own _findPublications() still reads only the narrow discoveryProvider — this audit touched nothing.');
        assert(/_resolveWorldDocument\(documentId\)/.test(sessionSrc),
            'H4. _resolveWorldDocument()\'s own local-first, fallback-second design (0.9.605) is exactly as shipped — this audit adds no new call sites, no new fallback branch.');

        console.log('✓ H — local-document rendering and fork-policy semantics are both exactly as 0.9.605 shipped them; _resolveWorldDocument()\'s own local-first design is unmodified and unthreatened by this audit\'s own findings.');
    }

    // ===============================================================
    // Section I — Observational boundaries.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const decentralized = new DecentralizedPublicationDiscoveryProvider();
        const harness = buildHarness(storage, { decentralized });
        const pub = seedRepositoryAdmittedPublication(decentralized, { id: 'i-pub', documentId: 'i-doc' }); // never materialized

        const placementCountBefore = harness.placementRegistry.findByPublicationId(pub.id).length;
        const admittedCountBefore = decentralized.list().length;

        harness.worldLayoutProvider.findVisibleDocuments({ x: 0, y: 0, z: 0 }, 1e9);
        harness.worldLayoutProvider.getPosition(pub.documentId);
        let threw = null;
        try { harness.session._loadWorld(pub.documentId); } catch (e) { threw = e; }

        assert(threw !== null, 'I0. Sanity: a genuine attempt, genuinely refused.');
        assert(harness.placementRegistry.findByPublicationId(pub.id).length === placementCountBefore, 'I1. No placement created by rendering/discovery queries.');
        assert(decentralized.list().length === admittedCountBefore, 'I2. Nothing admitted/re-admitted as a side effect of a render attempt.');
        assert(harness.contentStore.has(pub.contentReference) === false, 'I3. No material acquired/materialized as a side effect.');

        const layoutSrc = await readSource('world-layout/LocalWorldLayoutProvider.js');
        assert(!/this\._spatialIndexProvider\.add\(|this\._discoveryProvider\.add\(/.test(layoutSrc),
            'I4. LocalWorldLayoutProvider.js itself still never calls .add() on either collaborator.');

        console.log('✓ I — rendering remains a pure, side-effect-free consumer: no placement, no admission, no material acquisition, whether an attempt succeeds or fails. Section F\'s own gap is a READ failure, never a mutation.');
    }

    // ===============================================================
    // Section J — UI journey audit (source-level, against real ui/
    // files — no browser in this environment, so reachability is
    // proven by the actual markup/wiring existing, exactly the same
    // evidentiary standard Section A of every prior milestone in this
    // family already used for production composition files).
    // ===============================================================
    {
        const worldViewSrc = (await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n');
        const panelSrc = await readSource('ui/components/OwnPublicationPanel.js');

        // Discover / understand.
        assert(/listPublicationsUseCase\.execute\(\)/.test(worldViewSrc),
            'J1. DISCOVER: WorldView.js populates allPublications from the real listPublicationsUseCase, enriched with the decentralized/Repository provider (0.9.339) — reachable today, not hypothetical.');
        assert(/class="own-publication-placements"/.test(panelSrc) && /Placements \(\{\{ publicationPlacements\.length \}\}\)/.test(panelSrc),
            'J2. UNDERSTAND: OwnPublicationPanel.js already renders a Publication\'s own metadata and its live placement count/detail (0.9.308) — a real, reachable surface, not a stub.');

        // Place.
        assert(/placeOwnPublication\(\)\s*\{/.test(panelSrc) && /this\.placePublicationCommand\(publication\)/.test(panelSrc),
            'J3. PLACE: OwnPublicationPanel.js\'s placeOwnPublication() is a real method wired to placePublicationCommand (0.9.600) — the same session.placePublication() this audit\'s own harness calls throughout.');

        // Find it afterward.
        assert(/world-view-section--error/.test(worldViewSrc) && /Unavailable \(\{\{ failedWorlds\.length \}\}\)/.test(worldViewSrc),
            'J4. FIND AFTERWARD (failure case): WorldView.js renders a distinct, honest "Unavailable" section for anything updateSpatialView() attempted and failed to load — by title/author, not a bare id (Section D4b\'s own live proof).');
        assert(/Worlds in View \(\{\{ loadedWorlds\.length \}\}\)/.test(worldViewSrc) && /Nearby/.test(worldViewSrc),
            'J5. FIND AFTERWARD (success case): "Worlds in View" and a nearby-worlds section both exist and both read straight from session.getSpatialState() — the SAME state Section D/F above queried directly.');
        assert(/refreshSpatialUI\(\)/.test(worldViewSrc) && /session\.updateSpatialView\(\)/.test(worldViewSrc),
            'J6. These sections refresh on the real navigation loop (updateSpatialView -> refreshSpatialUI), not a one-time snapshot — a Publication that becomes visible/unavailable updates the UI without a page reload.');

        // Remove / move.
        assert(/@move="openPlacementEditor\(placementInfo\)"/.test(worldViewSrc) && /@remove="removePlacementFromPanel\(placementInfo\)"/.test(worldViewSrc),
            'J7. REMOVE/MOVE: PlacementInfoPanel already wires both actions for the active placement (0.9.197) — existing controls, none invented by this audit.');

        // J7 shows the CONTROLS exist; this checks whether PlacementInfoPanel
        // actually APPEARS for a Repository-admitted-only Publication's own
        // placement — a question distinct from Section F (no session
        // boundary crossed here at all). getPlacementInfo()/movePlacement()/
        // removePlacement() are all documentId-keyed, resolving through
        // _resolvePlacementRecord() -> _findPublications() -> the narrow,
        // unwidened discoveryProvider (Section H3's own source check) —
        // the SAME choke point fork-policy uses, and the SAME one
        // application/world/WorldNavigationSession.js's own placePublication()
        // header (immediately above movePlacement()) documents as a
        // DELIBERATE boundary, citing 0.9.596's own fork-policy rationale.
        {
            const jStorage = new InMemoryStorageProvider();
            const jDecentralized = new DecentralizedPublicationDiscoveryProvider();
            const jHarness = buildHarness(jStorage, { decentralized: jDecentralized });
            const jPub = seedRepositoryAdmittedPublication(jDecentralized, { id: 'j-pub', documentId: 'j-doc' });
            jHarness.session.placePublication(jPub.id, { x: 1, y: 0, z: 1 }); // publicationId-keyed — succeeds (Section A/C).

            assert(jHarness.session.getPlacementInfo(jPub.documentId) === null,
                'J9. LIVE: getPlacementInfo(documentId) — the read PlacementInfoPanel\'s own v-if is gated on — returns null for this ALREADY-PLACED Repository-admitted Publication, even with no session boundary crossed. The panel never appears, so J7\'s own Move/Remove buttons are unreachable for it today.');
            let movedThrew = null;
            try { jHarness.session.movePlacement(jPub.documentId, { x: 2, y: 0, z: 2 }); } catch (e) { movedThrew = e; }
            assert(movedThrew !== null && /has no known placement to move/.test(movedThrew.message),
                'J10. LIVE: movePlacement(documentId) throws for the same reason — confirming this is a real, reachable boundary, not a hypothetical.');
        }

        // What Section F's own gap means for this list: a documentId
        // that fell out of `visible` never reaches loadedWorlds,
        // nearbyWorlds, OR failedWorlds — confirmed structurally: all
        // three are derived from `state.loaded`/`state.nearby`/
        // `state.failed`, and Section F6 already proved a Session-2
        // documentId is absent from all three at the session layer.
        assert(/failedWorlds\.value = state\.failed\.map/.test(worldViewSrc) && /nearbyWorlds\.value = state\.nearby/.test(worldViewSrc) && /loadedWorlds\.value = state\.loaded\.map/.test(worldViewSrc),
            'J8. Structural confirmation: all three lists are pure derivations of getSpatialState()\'s own loaded/nearby/failed arrays — there is no FOURTH, independent UI surface that could catch Section F\'s gap by some other route. The gap is real at the UI layer, not merely at the session API layer.');

        console.log('✓ J — every capability the brief asks about (discover/understand/place/find/remove/move) is backed by real, reachable, already-shipped UI wiring, confirmed at the source level against the actual files — EXCEPT that Section F\'s gap is confirmed to also be a genuine UI gap: there is no surface that can show a Session-2-orphaned placement at all.');
    }

    // ===============================================================
    // Section K — Findings classification.
    // ===============================================================
    {
        record('K-D2', 'EXPECTED_BEHAVIOR',
            'An admitted-but-never-explicitly-placed Publication already renders at a deterministic grid position (0.2.24, pre-existing; 0.9.605 only widened WHICH discoveryProvider feeds it). Explicit Place\'s real, unique authority is WHERE it renders and WHO owns a signed, durable record — never WHETHER it appears at all. Not a regression; not actionable.');
        record('K-PlacementsListActions', 'FUTURE_OPTION',
            'OwnPublicationPanel\'s multi-placement list (0.9.308) is read-only per row (no per-row navigate/remove) — already recorded as deliberate future scope in that milestone\'s own header. Reconfirmed still true; not this audit\'s to promote into a requirement.');
        record('K-MoveRemoveDocumentIdScope', 'EXPECTED_BOUNDARY',
            'LIVE-CONFIRMED (Section J9/J10): getPlacementInfo()/movePlacement()/removePlacement() cannot reach a Repository-admitted-only Publication\'s own placement, even within a single session — they resolve documentId->publication through the narrow discoveryProvider (_findPublications()), never publicationActionDiscoveryProvider. application/world/WorldNavigationSession.js\'s own placePublication() header documents this as DELIBERATE, citing 0.9.596\'s fork-policy rationale, and 0.9.595\'s own commit message already flagged the read-side half of this exact limit for OwnPublicationPanel. Sharpened here: it also blocks PlacementInfoPanel\'s Move/Remove UI (J7) for such a placement. Pre-existing, already-documented, not introduced by this audit — recorded precisely rather than silently assumed fixed by 0.9.605.');
        record('K-F', 'ARCHITECTURAL_GAP',
            'Section F: a durable PlacementRecord survives a real session boundary; the Publication it points to does not, because publicationId->documentId/material resolution depends entirely on a non-persisted, in-memory discovery accumulator (DecentralizedPublicationDiscoveryProvider), and WorldPlacement deliberately carries no documentId of its own to fall back on. The Publication vanishes from every World-presence UI signal with no error, no "Unavailable" badge — worse than a genuine material failure, which at least surfaces honestly (Section D4/J4). Fixing this durably requires either persisting Repository admission or widening what a placement/PlacementRecord itself durably carries — both are storage-shape changes, i.e., architectural, not a wiring seam like 0.9.603-0.9.605\'s own fixes.');
        record('K-Cosmetic', 'COSMETIC',
            'None found: title/author enrichment (0.9.339), loaded/nearby/failed sectioning, and placement detail rendering are all already correct and truthful for every state this audit could actually produce and inspect.');

        console.log('\nSection K — classification of every finding this audit produced:');
        for (const f of findings) {
            console.log(`  [${f.classification}] ${f.id}: ${f.summary}`);
        }
    }

    // ===============================================================
    // Section L — Closure classification.
    // ===============================================================
    {
        console.log(`
================================================================
CLOSURE — 0.9.606
================================================================

CLASSIFICATION: ARCHITECTURAL_GAP_CONFIRMED

Sections A-E, G, H, I and most of J confirm the arc 0.9.594-0.9.605
built is genuinely solid: identity is never substituted (B), explicit
Place remains the sole path to an owned, authoritative placement and
claimedPosition stays inert (C), lifecycle transitions are
deterministic with no automatic placement or cleanup (E), multiple
Publications stay isolated (G), local-document rendering and
fork-policy are untouched (H), rendering stays observational (I), and
every discover/understand/place/find/remove/move capability the brief
asked about is backed by real, already-shipped UI wiring (J).

Section D additionally corrects the brief's own hypothesized state
table on one point (finding K-D2): "admitted, unplaced" already renders
today, via a pre-existing mechanism outside this arc's own scope — not
a gap, but worth recording precisely rather than silently assuming the
brief's table was exactly right.

Section F is this audit's own genuine result (finding K-F): a real
session boundary (this replica's process restarting — the exact
scenario Repository admission, 0.9.595, was introduced to make
Publications survive) does NOT survive today. The PlacementRecord
itself persists correctly, but the Publication it points to becomes
completely unreachable — not merely unrenderable, absent from every
World-presence signal the UI reads (Section F6/J8) — because nothing
durable maps a placement's publicationId back to a documentId/material
once the in-memory Repository accumulator that made it discoverable in
the first place is gone. This is a real architectural limitation: the
smallest fix is not a wiring substitution like 0.9.603-0.9.605's own
seams, but a genuine storage-shape decision (persist Repository
admission, or widen what a placement durably carries) — explicitly
outside what a wiring-only milestone, or this test-only audit, may do.

RECOMMENDATION — exactly one next milestone: a narrow, test-only
"Placement Identity Persistence Boundary Audit," in the same restrained
spirit as 0.9.602-0.9.604, whose job is ONLY to determine the smallest
sufficient fix for Section F's own gap — e.g. whether persisting
DecentralizedPublicationDiscoveryProvider's admitted set, or instead
recording a minimal durable publicationId->{documentId,contentReference}
association at placement time, is the narrower change — before any
implementation milestone attempts it. This audit deliberately does not
prejudge which; that determination is exactly the kind of question this
arc's own discipline reserves for a dedicated boundary audit.

WHAT THIS AUDIT DID NOT DO: no production code was changed; no new UI,
provider, storage, or placement semantics were added; Section F's gap
is reported, not fixed.
================================================================
`);
    }

    console.log('✅ All Publication Placement-to-World Presence Product Closure Audit tests passed.');
}

run().catch((error) => {
    console.error('PublicationPlacementToWorldPresenceProductClosureAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
