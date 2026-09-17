import { readFile } from 'node:fs/promises';

import { Publication } from '../publisher/Publication.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { WorldFocusKind } from '../core/WorldFocusContext.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeLocalWorldDiscoverySource, LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import { describePeerWorldDiscoverySource } from '../peer/PeerWorldDataIngress.js';
import {
    registerMaterializedSnapshotWorldSource
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { WorldEncounterMaterialSource } from '../application/WorldEncounterMaterialLoading.js';
import {
    WorldEncounterMaterialVerifier,
    WorldEncounterMaterialVerificationStatus
} from '../application/WorldEncounterMaterialVerification.js';
import { inspectWorldEncounterMaterial } from '../application/WorldEncounterMaterialInspection.js';
import {
    PublicationMaterialProvenanceOrigin,
    describePublicationMaterialProvenanceFromInspection
} from '../application/PublicationMaterialProvenance.js';

// 0.9.535 — Wanderer World Session Continuity Product Reassessment.
//
// 0.9.532 through 0.9.534 audited a Publication's own journey INTO World —
// discovery, the complete Create->Distribute->Discover->Repository->
// Explore->World->Evidence arc, and the Repository catalog's own lifecycle
// as a Publication passes through it. None of them ever asked what happens
// once a Wanderer is ALREADY inside a World: does the session stay
// coherent as they walk, select different placed Publications one after
// another, inspect material, and return to something they encountered
// earlier? This milestone asks that question, against the real,
// unmodified (except where explicitly noted below) production session
// machinery.
//
// VOCABULARY CORRECTION, ESTABLISHED BEFORE SECTION A EVEN STARTS — the
// originating brief's own "focusWorld()"/"WorldNavigationSession -> World/
// focus -> Wanderer position -> encountered Publication -> material
// inspection" chain describes TWO structurally independent mechanisms this
// codebase already keeps apart, never one:
//
//   application/WorldNavigationSession.js         ui/components/WorldEncounterCanvas.js
//     "which Publication's World            "which placed object, if any,
//      am I in" (focusDocument()/            is currently selected inside
//      navigateToDocument(), the real         THIS World" (selectEncounter(),
//      focusWorld() target)                   selectedEncounter/materialInspection)
//            │                                          │
//            ▼                                          ▼
//     one World at a time,                    zero or more placed
//     camera + active document                Publications, chosen by an
//     only — never touches                    explicit marker CLICK, never
//     WorldEncounter/verify/                   by Wanderer proximity — see
//     discover (0.9.532 Section G,             Section C, below, for the
//     reconfirmed fresh in Section A)          live proof.
//
// A third, unrelated "focus" vocabulary — `core/WorldFocusContext.js`'s own
// Region/Landmark/Structure/Collaborator/GeographicPlace "Info panel"
// concept — coexists with both and names no `PUBLICATION` kind at all
// (Section A). This file uses each real name precisely, and never treats
// any one of the three as a stand-in for either of the others.
//
//   Section A — Session identity: WorldNavigationSession state, World
//               Encounter selection state, material inspection state, and
//               Publication identity are four separate facts, live and
//               structurally, never collapsed into one.
//   Section B — Focus changes: a cross-World A->B->A round trip
//               (WorldNavigationSession) and a within-World A->B->A round
//               trip (selectEncounter()) each preserve identity by
//               reference and never re-verify/re-discover on arrival.
//   Section C — Walking continuity across real candidate shapes: ordinary
//               local, peer, and Snapshot placements, an unavailable
//               target, and multiple simultaneous candidates — corrected
//               against the real architecture: there is no proximity/
//               "nearby" trigger anywhere in this pipeline; encounters are
//               selected, never walked into automatically.
//   Section D — Encounter continuity: reselecting an unchanged encounter
//               never reloads; an unrelated registry mutation never
//               reloads; a genuine walk-away-and-back always reloads
//               fresh — reusing 0.9.169's own established guard, not a
//               new cache.
//   Section E — Encounter replacement: every ephemeral per-selection field
//               resets atomically on a fresh selection, live — including
//               ONE GENUINE GAP this milestone FOUND AND FIXED (see the
//               production-change note below).
//   Section F — Inspection state: the Wanderer-facing consequence of
//               Section E's fix, proven against the real rendered
//               condition and the real Distribute-action gate.
//   Section G — Temporary failure isolation: A available, B unavailable, A
//               available again — A's second success is never poisoned by
//               B's failure, and a third, untouched sibling stays
//               untouched throughout.
//   Section H — Repository isolation, the reverse boundary of 0.9.534:
//               every pure describe/derive/inspect function stays
//               read-only; the one deliberate write path
//               (admitToRepositoryDiscovery) stays exactly as narrowly
//               gated as 0.9.523/0.9.524 already left it; a walk-back
//               re-admission is 0.9.523/0.9.534's own already-established,
//               deliberately-unfixed DELIBERATE_ASYMMETRY, reconfirmed
//               here rather than "fixed" — see that Section's own header
//               for why closing it would contradict standing precedent.
//   Section I — Trust/evidence vocabulary continuity: switching between
//               three differently-verified, differently-provenanced
//               encounters never cross-contaminates one's status/
//               provenance into another's.
//   Section J — Flagship: Enter World -> walk -> encounter A -> inspect/
//               verify A -> walk on -> encounter B -> inspect/verify B ->
//               return toward A -> encounter A again -> inspect A. The
//               final A is proven to be Publication A BY REFERENCE, not
//               merely "material with the same hash," with a freshly
//               re-run (never reused) verification that still reads
//               VERIFIED, never B's REJECTED.
//
// PRODUCTION CHANGE, NARROW AND NAMED HERE RATHER THAN DISCOVERED MID-FILE:
// while proving Section E/F, this milestone found a real, live gap
// `ui/components/WorldEncounterCanvas.js` already had, since 0.9.169: a
// GENUINE selection change (a real walk from one encounter to a different
// one) tail-calls `refreshMaterialInspection()`/`refreshComparisonMaterialInspection()`
// asynchronously, but never cleared `materialInspection`/
// `comparisonMaterialInspection` FIRST — so the previous encounter's own
// already-resolved `{loading, verification}` (and, through
// `distributablePublication`, its own loaded `Publication` instance) stayed
// live-readable, and its Distribute/Snapshot-Distribute/Discover-Snapshot
// actions stayed enabled, for the entire async gap until the NEW
// encounter's own material actually resolved. Two one-line fixes close it:
// `refreshSelectionOutcome()` and its comparison-target sibling
// `refreshComparisonSelectionOutcome()` each now clear their own
// `materialInspection`/`comparisonMaterialInspection` to `null`
// synchronously, in the exact branch that already decides a genuine change
// occurred — never touching the 0.9.169 "no redundant reload" guard those
// branches already gate on. Sections E and F prove this precisely, live,
// both before-the-fact structurally (the fix is present) and after-the-fact
// behaviorally (the gap no longer reproduces).
//
// Deliberately excluded, per the requesting brief: no new World session
// manager, no new encounter state machine, no caching, no automatic
// rediscovery/re-verification/prefetching, no Repository mutation beyond
// the one already-existing gate, no new Publication identity, no new World
// persistence, no navigation refactor, no new trust vocabulary, no new
// provenance model, no automatic cleanup, no performance optimization.
//
// FINDING: see the verdict block at the end of this file.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred() {
    let resolve;
    const promise = new Promise((res) => { resolve = res; });
    return { promise, resolve };
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// The same real PublishDocumentUseCase/LocalPublisherProvider pair every
// real Editor publish goes through — mirrors 0.9.533/0.9.534's own
// identically-purposed helper exactly.
function publishMinimalDocument(storage, title, author = 'alice') {
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, null, null, null);

    const world = new World();
    const building = new Building({ creator: author });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    const document = new Document({
        world,
        metadata: new DocumentMetadata({ title, author, license: new License({ id: LicenseId.CC0_1_0 }) })
    });
    return publishDocumentUseCase.execute({ document });
}

function asPeer(identityId) {
    return { remoteIdentity: { identityId } };
}

// The exact `WorldEncounterCanvas.data()`/`.methods` composition
// tests/WorldViewCapabilityReassessmentAudit.test.js's own
// `buildCanvasInstance()` already established as this codebase's real,
// live "mount a real canvas instance without the DOM/Vue layer" harness —
// extended here with the two extra computed getters (`materialProvenance`,
// `distributablePublication`) and the `decentralizedPublicationDiscoveryProvider`
// prop Section H needs, none of which change how the base harness works.
function buildCanvasInstance({ registry = null, view, materialSources = null, materialVerifier = null, decentralizedPublicationDiscoveryProvider = null } = {}) {
    const ctx = {
        registry,
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier,
        decentralizedPublicationDiscoveryProvider
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    Object.defineProperty(ctx, 'resolvedEncounterSelection', {
        get() { return WorldEncounterCanvas.computed.resolvedEncounterSelection.call(ctx); }
    });
    Object.defineProperty(ctx, 'resolvedLead', {
        get() { return WorldEncounterCanvas.computed.resolvedLead.call(ctx); }
    });
    Object.defineProperty(ctx, 'comparisonResolvedSelection', {
        get() { return WorldEncounterCanvas.computed.comparisonResolvedSelection.call(ctx); }
    });
    Object.defineProperty(ctx, 'materialProvenance', {
        get() { return WorldEncounterCanvas.computed.materialProvenance.call(ctx); }
    });
    Object.defineProperty(ctx, 'distributablePublication', {
        get() { return WorldEncounterCanvas.computed.distributablePublication.call(ctx); }
    });
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

// Counts real load() calls per objectId — the one instrument Section D
// needs to distinguish "reused a prior result" from "reloaded fresh"
// without guessing from timing alone.
class RecordingMaterialSource extends WorldEncounterMaterialSource {
    constructor(materialsByObjectId = {}) { super(); this.materialsByObjectId = materialsByObjectId; this.calls = []; }
    async load(resolvedSelection) {
        this.calls.push(resolvedSelection.objectId);
        return Object.prototype.hasOwnProperty.call(this.materialsByObjectId, resolvedSelection.objectId)
            ? this.materialsByObjectId[resolvedSelection.objectId]
            : null;
    }
    countFor(objectId) { return this.calls.filter((id) => id === objectId).length; }
}

// A material source under this test's own control — `load()` never
// resolves on its own; the test resolves it explicitly, exactly when it
// wants to observe the in-flight gap Sections E/F/G exercise.
class DeferredMaterialSource extends WorldEncounterMaterialSource {
    constructor() { super(); this.pending = new Map(); }
    load(resolvedSelection) {
        const { promise, resolve } = deferred();
        this.pending.set(resolvedSelection.objectId, resolve);
        return promise;
    }
    settle(objectId, material) {
        const resolve = this.pending.get(objectId);
        if (!resolve) throw new Error(`DeferredMaterialSource: no pending load for ${objectId}`);
        this.pending.delete(objectId);
        resolve(material);
    }
}

// A verifier whose decision is looked up per-objectId — lets one shared
// canvas walk between several encounters with different, independently
// controlled verification outcomes.
class MapVerifier extends WorldEncounterMaterialVerifier {
    constructor(outcomesByObjectId = {}) { super(); this.outcomesByObjectId = outcomesByObjectId; }
    async verifyIdentity(resolvedSelection) {
        return this.outcomesByObjectId[resolvedSelection.objectId];
    }
}

async function main() {
    // ===============================================================
    // Section A — Session identity: four separate facts, never one.
    // ===============================================================
    {
        // A1. Structural, reconfirmed fresh: WorldNavigationSession.js
        // (the "which World" layer) never imports or names the World
        // Encounter selection/material/verification family (the "which
        // placed object" layer) — the same boundary 0.9.532 Section G
        // already established, re-checked against current HEAD rather
        // than assumed to still hold.
        const sessionSource = await readSource('application/WorldNavigationSession.js');
        assert(!/WorldEncounter|selectedEncounter|resolvedEncounterSelection/.test(sessionSource),
            '1. application/WorldNavigationSession.js names no World Encounter concept anywhere in its own source — session/camera state and encounter-selection state are two files, not two facets of one.');

        // A2. `core/WorldFocusContext.js`'s own "Info panel" focus
        // vocabulary is a THIRD, disjoint concept — it names no
        // PUBLICATION kind at all.
        assert(Object.values(WorldFocusKind).length === 5 && !Object.values(WorldFocusKind).includes('PUBLICATION'),
            `2. WorldFocusKind carries exactly its own five Region/Landmark/Structure/Collaborator/GeographicPlace values (found: ${Object.values(WorldFocusKind).join(', ')}) and no PUBLICATION kind — this "focus" never means "encounter a Publication."`);

        // A3. LIVE: four independently-obtained facts for one real
        // Publication, none of them equal to (nor derived from) another
        // by identity.
        const publication = new Publication({ id: 'pub-a-535', documentId: 'doc-a-535', title: 'Session Identity', author: 'alice' });
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: publication.id, title: publication.title }],
            placements: [{ publicationId: publication.id, position: { x: 0, y: 0, z: 0 } }]
        }));
        const materialSources = { local: new RecordingMaterialSource({ [publication.id]: publication }) };
        const canvas = buildCanvasInstance({ registry, materialSources, materialVerifier: new MapVerifier({ [publication.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publication.id });
        await flush();

        const sessionState = canvas.registry; // "session/World navigation" stand-in at this layer
        const selectionState = canvas.selectedEncounter; // "which object is focused"
        const inspectionState = canvas.materialInspection; // "what was loaded/verified"
        assert(sessionState !== selectionState && selectionState !== inspectionState && sessionState !== inspectionState,
            '3. LIVE: registry (World state), selectedEncounter (focus state), and materialInspection (inspection state) are three distinct object references, never aliases of one another.');
        assert(typeof selectionState.objectId === 'string' && selectionState.objectId === publication.id,
            '4. LIVE: selectedEncounter.objectId is a plain string — the Publication\'s own id — never a re-derived or wrapped identity.');
        assert(inspectionState.loading.material === publication,
            '5. LIVE: materialInspection.loading.material IS (by reference) the fourth fact, the Publication itself — forwarded verbatim, never reconstructed from partial data.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section A: Session/World-navigation state, World Encounter selection state, material inspection state, and Publication identity are four separate facts — proven structurally (WorldNavigationSession.js names no encounter concept; WorldFocusContext.js names no Publication concept) and live (four distinct references for one real Publication, never aliased).');

    // ===============================================================
    // Section B — Focus changes: cross-World and within-World round
    // trips both preserve identity, never re-verify on return.
    // ===============================================================
    {
        // B1. Cross-World (WorldNavigationSession): A -> B -> A.
        // WorldNavigationSession.js's own real 3D rendering chain
        // (RenderWorldViewUseCase.js -> Renderer.js -> 'three') is not
        // importable in this test environment, so this file never
        // constructs a live instance of it — exactly the restraint every
        // other Section in this file already applies to the movement/
        // rendering layer generally (see Section C's own note). The two
        // real facts this Section needs about it are checked precisely,
        // by reading its own unmodified source, rather than assumed:
        const sessionSource = await readSource('application/WorldNavigationSession.js');
        // (a) findPublicationById() is confirmed, verbatim, to be a
        // one-line delegate to an injected discovery capability's own
        // findById() — so exercising discoveryProvider.findById() twice,
        // directly, IS exercising the identical code path a Wanderer's
        // own "arrive at A, arrive at B, arrive at A again" would run.
        //
        // AMENDED BY 0.9.597 — Publication Action Provider Continuity
        // Fix. findPublicationById() now delegates to
        // `_publicationActionDiscoveryProvider` — a SEPARATE, optional
        // capability that falls back to `discoveryProvider` itself when
        // none is supplied (see WorldNavigationSession's own constructor
        // comment) — rather than to `_discoveryProvider` directly. This
        // section's own harness never wires `publicationActionDiscoveryProvider`
        // (see its own session-construction code, below), so the fallback
        // applies and `_publicationActionDiscoveryProvider === discoveryProvider`
        // here — the "exercising discoveryProvider.findById() twice IS
        // exercising the identical code path" claim above still holds,
        // it is just no longer a literal one-line body to match verbatim.
        assert(sessionSource.includes("findPublicationById(publicationId) {\n        if (!this._publicationActionDiscoveryProvider || typeof publicationId !== 'string' || publicationId.length === 0) return null;\n        return this._publicationActionDiscoveryProvider.findById(publicationId) || null;\n    }"),
            '1. AMENDED BY 0.9.597 — sanity — findPublicationById() is confirmed, verbatim, to be a direct one-line delegate to `_publicationActionDiscoveryProvider.findById()`, never a re-derivation; that capability itself falls back to `discoveryProvider` (this section\'s own, unmodified injected instance) when no separate one is wired.');
        // (b) focusDocument()'s own body never names discovery or
        // verification — 0.9.532 Section G's own extraction, reconfirmed
        // fresh — so a THIRD call (the return trip) is still proven
        // camera/active-document-only by the same unconditional source
        // fact that already covers the first two calls.
        const focusDocumentBody = sessionSource.match(/focusDocument\(documentId, \{ setActive = true \} = \{\}\) \{([\s\S]*?)\n {4}\}/);
        assert(focusDocumentBody && !/WorldEncounter|verify|discover/i.test(focusDocumentBody[1]),
            '2. focusDocument()\'s own body never names discovery/verification — every call, including a return trip, only ever moves the camera/active document.');

        // B1 (live). The reference-stability claim itself, exercised
        // live through the real collaborator focusDocument()'s own
        // camera-move sits in front of: A -> B -> A.
        //
        // NOTE ON IDENTITY AT THIS LAYER: LocalDiscoveryProvider.findById()
        // re-hydrates a fresh Publication.fromJSON(record) on every call
        // (it is storage-backed, never an in-memory cache) — so even TWO
        // consecutive calls for the SAME id never share an object
        // reference here, by design, unlike the in-memory World Encounter
        // layer Section B4/E/F/J exercise below. "Identity preserved" at
        // THIS layer therefore means VALUE identity (id/documentId), never
        // reference identity — the correct, narrower claim for a
        // storage-backed provider, not a weaker proof of it.
        const storage = new InMemoryStorageProvider();
        const pubA = publishMinimalDocument(storage, 'World A');
        const pubB = publishMinimalDocument(storage, 'World B');
        const discoveryProvider = new LocalDiscoveryProvider(storage);

        const foundA1 = discoveryProvider.findById(pubA.id);
        discoveryProvider.findById(pubB.id); // "arrive at B"
        const foundA2 = discoveryProvider.findById(pubA.id); // "return to A"
        assert(foundA1.id === pubA.id && foundA2.id === pubA.id && foundA1.documentId === foundA2.documentId,
            '3. LIVE: findById(A) resolves to the same publicationId/documentId before and after a B visit in between — no second, distinct Publication was manufactured for the return, even though this storage-backed provider never hands back the same object reference twice.');

        // B3. Repository catalog: none of this ever added, removed, or
        // otherwise touched a single entry in the catalog underneath —
        // pure lookups throughout.
        assert(discoveryProvider.list().length === 2, '4. the catalog still holds exactly the two Publications it started with — no entry manufactured by navigating, forward or back.');

        // B4. Within-World (WorldEncounterCanvas): the SAME kind of
        // round trip, one layer down — selectEncounter(A) ->
        // selectEncounter(B) -> selectEncounter(A) again.
        const publicationA = new Publication({ id: 'pub-b535-a', documentId: 'doc-b535-a', title: 'Encounter A', author: 'alice' });
        const publicationB = new Publication({ id: 'pub-b535-b', documentId: 'doc-b535-b', title: 'Encounter B', author: 'bob' });
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: publicationA.id, title: publicationA.title }, { id: publicationB.id, title: publicationB.title }],
            placements: [
                { publicationId: publicationA.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: publicationB.id, position: { x: 10, y: 0, z: 10 } }
            ]
        }));
        const source = new RecordingMaterialSource({ [publicationA.id]: publicationA, [publicationB.id]: publicationB });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [publicationA.id]: true, [publicationB.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationA.id });
        await flush();
        const firstEncounterA = canvas.materialInspection.loading.material;

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationB.id });
        await flush();
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationA.id });
        await flush();
        const secondEncounterA = canvas.materialInspection.loading.material;

        assert(firstEncounterA === publicationA && secondEncounterA === publicationA && firstEncounterA === secondEncounterA,
            '6. LIVE: walking A -> B -> A within one World resolves back to the exact same Publication instance both times — never a duplicate or reconstructed identity for the return visit.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section B: a cross-World focus round trip (WorldNavigationSession) and a within-World encounter round trip (selectEncounter()) both return to the exact same Publication instance, never manufacture a new one, never re-verify/re-discover on the camera-only return leg, and never add or remove a single Repository catalog entry.');

    // ===============================================================
    // Section C — Walking continuity across real candidate shapes;
    // vocabulary correction: there is no proximity/"nearby" trigger.
    // ===============================================================
    {
        // C1. Structural correction: the movement layer never touches
        // Publication/encounter state, and the encounter layer never
        // gates on distance.
        const movementSource = await readSource('application/AvatarMovementController.js');
        assert(!/Publication|Encounter/.test(movementSource),
            '1. application/AvatarMovementController.js names no Publication/Encounter concept anywhere — movement is physics/input only.');
        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        const canvasMethodsAndComputed = canvasSource.slice(canvasSource.indexOf('    computed: {'), canvasSource.indexOf('    template: `'));
        const codeOnlyMethods = canvasMethodsAndComputed.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/nearby|proximity|radius/i.test(codeOnlyMethods),
            '2. WorldEncounterCanvas.js\'s own computed/methods bodies contain no nearby/proximity/radius vocabulary — selection is never distance-gated, confirming its own header\'s "no proximity, no discovery relevance" restraint still holds in the real code, not merely in a comment.');

        // C2. LIVE: ordinary local, peer, and Snapshot placements all
        // resolve as genuine, independent encounters.
        const localPub = new Publication({ id: 'pub-c535-local', title: 'Local' });
        const peerPub = new Publication({ id: 'pub-c535-peer', title: 'Peer' });
        const snapshotPub = new Publication({ id: 'pub-c535-snap', title: 'Snapshot' });

        const registry = new WorldDiscoverySourceRegistry();
        // The local origin is registered ONCE, up front, carrying both
        // localPub and the C4 ambiguous candidate from the start — a
        // registry holds exactly one CURRENT source per origin
        // (WorldDiscoverySourceRegistry.js's own "setSource(source)"
        // contract), so a SECOND describeLocalWorldDiscoverySource() call
        // later in this Section would replace, not add to, this one.
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: localPub.id, title: localPub.title }, { id: 'pub-c535-ambig', title: 'Ambiguous' }],
            placements: [
                { publicationId: localPub.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: 'pub-c535-ambig', position: { x: 3, y: 0, z: 3 } }
            ]
        }));
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: peerPub.id, title: peerPub.title }],
            placements: [{ publicationId: peerPub.id, position: { x: 1, y: 0, z: 1 } }]
        }, asPeer('did:key:zC535')));
        registerMaterializedSnapshotWorldSource(registry, {
            outcome: SnapshotWorldPlacementOutcome.PLACED,
            contentHash: 'hash-c535', publicationId: snapshotPub.id, placementId: 'placement-c535',
            position: { x: 2, y: 0, z: 2 }, reason: null
        }, snapshotPub);

        const source = new RecordingMaterialSource({ [localPub.id]: localPub, [peerPub.id]: peerPub, [snapshotPub.id]: snapshotPub });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source, peer: source } });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: localPub.id });
        assert(canvas.selectionOutcome.status === 'RESOLVED' && canvas.resolvedEncounterSelection.origin === LOCAL_WORLD_DISCOVERY_ORIGIN,
            '3. an ordinary local placement resolves RESOLVED with the local origin.');

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: peerPub.id });
        assert(canvas.selectionOutcome.status === 'RESOLVED' && canvas.resolvedEncounterSelection.origin.startsWith('peer:'),
            '4. a peer placement resolves RESOLVED with its own peer: origin.');

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: snapshotPub.id });
        assert(canvas.selectionOutcome.status === 'RESOLVED' && canvas.resolvedEncounterSelection.origin.startsWith('snapshot:'),
            '5. a Snapshot placement resolves RESOLVED with its own snapshot: origin.');

        // C3. Unavailable material: an objectId with no placement
        // anywhere resolves UNAVAILABLE, never a stale/partial encounter.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-c535-ghost' });
        assert(canvas.selectionOutcome.status === 'UNAVAILABLE' && canvas.resolvedEncounterSelection === null && canvas.materialInspection === null,
            '6. an unplaced objectId resolves UNAVAILABLE, with no resolved selection and no material inspection ever attempted.');

        // C4. Multiple simultaneous candidates: the SAME objectId (already
        // placed locally, above) ALSO placed by a second, peer source
        // resolves AMBIGUOUS, offering every candidate rather than
        // guessing one.
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-c535-ambig', title: 'Ambiguous' }],
            placements: [{ publicationId: 'pub-c535-ambig', position: { x: 4, y: 0, z: 4 } }]
        }, asPeer('did:key:zC535b')));
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-c535-ambig' });
        assert(canvas.selectionOutcome.status === 'AMBIGUOUS' && canvas.selectionOutcome.candidates.length === 2 && canvas.resolvedEncounterSelection === null,
            '7. the same objectId placed by two sources resolves AMBIGUOUS with both candidates offered, and resolvedEncounterSelection stays null until the Wanderer explicitly chooses one — never an automatic pick.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section C: local, peer, and Snapshot placements all resolve as genuine, independent encounters; an unplaced target resolves UNAVAILABLE; two sources placing one objectId resolve AMBIGUOUS with every candidate offered. Corrected against the real architecture: movement never touches encounter state and encounter selection is never distance-gated — "walking triggers an encounter" describes no mechanism that exists; selection is an explicit marker click, always.');

    // ===============================================================
    // Section D — Encounter continuity: no unnecessary reload, and no
    // incorrect skip either. Reuses 0.9.169's own established guard.
    // ===============================================================
    {
        const pubA = new Publication({ id: 'pub-d535-a', title: 'D-A' });
        const pubB = new Publication({ id: 'pub-d535-b', title: 'D-B' });
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: pubA.id, title: pubA.title }, { id: pubB.id, title: pubB.title }],
            placements: [
                { publicationId: pubA.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: pubB.id, position: { x: 1, y: 0, z: 1 } }
            ]
        }));
        const source = new RecordingMaterialSource({ [pubA.id]: pubA, [pubB.id]: pubB });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true, [pubB.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(source.countFor(pubA.id) === 1, '1. selecting A loads it exactly once.');

        // D2. An unrelated registry mutation (a third source, at a
        // DIFFERENT origin so it never replaces the existing local
        // source A/B already live at, holding neither encounter) never
        // reloads the currently-selected A.
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-d535-unrelated', title: 'Unrelated' }],
            placements: [{ publicationId: 'pub-d535-unrelated', position: { x: 9, y: 0, z: 9 } }]
        }, asPeer('did:key:zD535unrelated')));
        await flush();
        assert(source.countFor(pubA.id) === 1, '2. an unrelated registry registration never reloads A\'s own already-current material — 0.9.169\'s own guard, reconfirmed.');

        // D3. Reselecting the exact same, already-current encounter
        // (a double-click, or simply re-emitting the same marker's own
        // select event) never reloads either — the one legitimate skip.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(source.countFor(pubA.id) === 1, '3. reselecting the SAME already-current encounter never triggers a second load.');

        // D4. Walking to B, then back to A, DOES reload both times —
        // a genuine change always re-runs the full pipeline; nothing is
        // cached across the round trip.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubB.id });
        await flush();
        assert(source.countFor(pubB.id) === 1, '4. walking to B loads it fresh.');
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(source.countFor(pubA.id) === 2, '5. THE CORE CLAIM: walking back to A re-runs discover->resolve->verify->materialize fresh a SECOND time — current semantics never cache a prior encounter\'s own result across an intervening selection, and this milestone introduces no cache to change that.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section D: an unrelated registry mutation and a redundant reselection of the SAME current encounter both skip reloading (0.9.169\'s own established, unmodified guard); a genuine walk to a different encounter, and a genuine walk back, both always reload fresh — exactly what current semantics already require, reconfirmed live rather than newly cached.');

    // ===============================================================
    // Section E — Encounter replacement: atomic reset of every
    // ephemeral field, including the one gap this milestone found and
    // fixed.
    // ===============================================================
    {
        const pubA = new Publication({ id: 'pub-e535-a', title: 'E-A' });
        const pubB = new Publication({ id: 'pub-e535-b', title: 'E-B' });
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: pubA.id, title: pubA.title }, { id: pubB.id, title: pubB.title }],
            placements: [
                { publicationId: pubA.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: pubB.id, position: { x: 1, y: 0, z: 1 } }
            ]
        }));
        const source = new RecordingMaterialSource({ [pubA.id]: pubA, [pubB.id]: pubB });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true, [pubB.id]: false }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '1. setup: A resolves VERIFIED.');
        canvas.resolvedSelectionChoice = { kind: 'PUBLICATION', objectId: pubA.id, origin: LOCAL_WORLD_DISCOVERY_ORIGIN };
        canvas.snapshotDiscoveryResult = { stale: 'from A' };
        canvas.encounterCommentaries = [{ text: 'about A' }];

        // E1. THE FIX, PROVEN LIVE: the instant selectEncounter(B) is
        // called — synchronously, before B's own load even settles —
        // materialInspection (and the Publication it exposes for
        // distribution) must already be cleared, never still reading A.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubB.id });
        assert(canvas.materialInspection === null,
            '2. THE FIX: immediately after a genuine selection change, materialInspection is already null — A\'s own resolved evidence never lingers, readable, under B\'s new identity during B\'s own in-flight load.');
        assert(canvas.distributablePublication === null,
            '3. THE FIX, consequence: distributablePublication is null in that same instant — a Distribute click landing in this exact window can no longer act on A\'s Publication while B is what the Wanderer sees selected.');

        // E2. Every other ephemeral field this component owns resets in
        // the same synchronous call — no leakage of A's own transient
        // state into B's fresh selection.
        assert(canvas.resolvedSelectionChoice === null, '4. resolvedSelectionChoice resets on a fresh selection.');
        assert(canvas.snapshotDiscoveryResult === null, '5. snapshotDiscoveryResult resets on a fresh selection.');
        assert(Array.isArray(canvas.encounterCommentaries) && canvas.encounterCommentaries.length === 0, '6. encounterCommentaries resets to empty on a fresh selection.');

        await flush();
        assert(canvas.materialInspection.selection.objectId === pubB.id && canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED,
            '7. once B\'s own load settles, materialInspection correctly names B and carries B\'s own REJECTED verdict — never A\'s VERIFIED.');

        // E3. Race safety: a LATE response for an already-superseded
        // selection is discarded, never allowed to overwrite the
        // current (different) encounter's own correct result — the
        // sibling-isolation complement to 0.9.534's own catalog-sibling
        // finding, here for TEMPORAL siblings within one session.
        const deferredSource = new DeferredMaterialSource();
        const raceCanvas = buildCanvasInstance({ registry, materialSources: { local: deferredSource }, materialVerifier: new MapVerifier({ [pubA.id]: true, [pubB.id]: false }) });
        mountCanvas(raceCanvas);
        raceCanvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id }); // A's load now pending, deliberately held
        raceCanvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubB.id }); // walked to B before A ever resolved
        deferredSource.settle(pubB.id, pubB);
        await flush();
        assert(raceCanvas.materialInspection.selection.objectId === pubB.id, '8. B\'s own (faster) response lands correctly while A is still pending.');
        deferredSource.settle(pubA.id, pubA); // A's stale response arrives LAST
        await flush();
        assert(raceCanvas.materialInspection.selection.objectId === pubB.id,
            '9. A\'s late, now-stale response never overwrites B\'s already-current materialInspection — the requestId guard holds across a genuine walk-away, not merely across a same-selection re-trigger.');

        unmountCanvas(canvas);
        unmountCanvas(raceCanvas);
    }
    console.log('✓ Section E: every ephemeral per-selection field resets atomically on a fresh selection, including — after this milestone\'s own fix — materialInspection/distributablePublication, which previously stayed readable as A\'s own stale evidence for the entire async gap after walking to B. A late, superseded response for an abandoned encounter never overwrites the current one.');

    // ===============================================================
    // Section F — Inspection state: the Wanderer-facing proof of
    // Section E's fix, against the real rendered condition and the
    // real action-enablement gate.
    // ===============================================================
    {
        const pubA = new Publication({ id: 'pub-f535-a', title: 'F-A' });
        const pubB = new Publication({ id: 'pub-f535-b', title: 'F-B' });
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: pubA.id, title: pubA.title }, { id: pubB.id, title: pubB.title }],
            placements: [
                { publicationId: pubA.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: pubB.id, position: { x: 1, y: 0, z: 1 } }
            ]
        }));
        const deferredSource = new DeferredMaterialSource();
        const canvas = buildCanvasInstance({ registry, materialSources: { local: deferredSource }, materialVerifier: new MapVerifier({ [pubA.id]: true, [pubB.id]: false }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        deferredSource.settle(pubA.id, pubA);
        await flush();
        assert(canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '1. setup: A fully resolves VERIFIED.');

        // F1. Walk to B; deliberately never settle B's own load yet —
        // this is the exact window the fix closes.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubB.id });

        // The real template condition gating the Material/Verification
        // panel, reproduced exactly (`v-if="selectedEncounter && materialInspection"`,
        // ui/components/WorldEncounterCanvas.js) — while B's load is
        // in flight, this must evaluate false, so nothing renders,
        // rather than rendering A's own stale panel under B's title.
        const materialPanelWouldRender = Boolean(canvas.selectedEncounter && canvas.materialInspection);
        assert(materialPanelWouldRender === false,
            '2. THE PROOF: with B selected and its own material still in flight, the real Material/Verification panel condition evaluates false — the Wanderer sees no evidence panel at all, never A\'s own stale VERIFIED status rendered as if it described B.');

        // The real Distribute-button gate, reproduced exactly
        // (`:disabled="!distributablePublication || distributionExecuting"`).
        const distributeButtonDisabled = !canvas.distributablePublication || canvas.distributionExecuting;
        assert(distributeButtonDisabled === true,
            '3. THE PROOF: the real Distribute button stays disabled during that same window — a click landing here cannot act on A\'s Publication while B is what is visibly selected.');

        // F2. Once B's own material actually resolves, the panel
        // correctly shows B's own facts — never A's.
        deferredSource.settle(pubB.id, pubB);
        await flush();
        assert(canvas.materialInspection.selection.objectId === pubB.id && canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED,
            '4. once resolved, the panel\'s own data is genuinely B\'s (REJECTED) — never a carryover of A\'s (VERIFIED).');
        assert(canvas.distributablePublication === pubB,
            '5. distributablePublication now correctly names B (distributablePublication is gated by loading.status alone, per 0.9.104\'s own established, unmodified contract — never by verification.status) — and, crucially, it is B, never a carryover of A\'s own reference from before the walk.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section F: proven against the REAL rendered condition and the REAL Distribute-button gate — a Wanderer switching selection while material is still resolving sees no stale evidence panel and cannot trigger an action against the abandoned encounter\'s own Publication. This is the direct, user-visible payoff of Section E\'s fix.');

    // ===============================================================
    // Section G — Temporary failure isolation: A available, B
    // unavailable, A available again; an untouched sibling stays
    // untouched throughout.
    // ===============================================================
    {
        const pubA = new Publication({ id: 'pub-g535-a', title: 'G-A' });
        const pubC = new Publication({ id: 'pub-g535-c', title: 'G-C (untouched sibling)' });
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: pubA.id, title: pubA.title }, { id: 'pub-g535-b', title: 'G-B' }, { id: pubC.id, title: pubC.title }],
            placements: [
                { publicationId: pubA.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: 'pub-g535-b', position: { x: 1, y: 0, z: 1 } },
                { publicationId: pubC.id, position: { x: 2, y: 0, z: 2 } }
            ]
        }));
        // B has a resolvable placement but no registered material — the
        // real "temporarily unavailable" shape (a source that currently
        // has nothing for it), not a stale/unresolvable selection.
        const source = new RecordingMaterialSource({ [pubA.id]: pubA, [pubC.id]: pubC });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true, [pubC.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(canvas.materialInspection.loading.status === 'AVAILABLE' && canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '1. A is available and verifies.');

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-g535-b' });
        await flush();
        assert(canvas.materialInspection.loading.status === 'UNAVAILABLE' && canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE,
            '2. B is temporarily unavailable — UNAVAILABLE loading collapses to UNVERIFIABLE, never REJECTED, exactly as application/WorldEncounterMaterialInspection.js already establishes.');

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(canvas.materialInspection.loading.status === 'AVAILABLE' && canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '3. A is available AGAIN, exactly as before — B\'s own failure never poisoned A\'s own material source or verifier for a later revisit.');

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubC.id });
        await flush();
        assert(canvas.materialInspection.loading.status === 'AVAILABLE' && canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED && canvas.materialInspection.loading.material === pubC,
            '4. sibling C, never involved in A/B\'s own failure sequence, resolves correctly and untouched when finally visited.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section G: a temporary failure (B, unavailable) never poisons the same material source/verifier for a later, successful revisit of A, and never touches an untouched sibling (C) — failure isolation holds across time within one session, not merely across sibling catalog entries as 0.9.534 already proved.');

    // ===============================================================
    // Section H — Repository isolation: the reverse boundary of
    // 0.9.534. Pure functions stay read-only; the one deliberate write
    // path stays exactly as narrowly gated as 0.9.523/0.9.524 already
    // left it; a walk-back re-admission reconfirms, never contradicts,
    // 0.9.523/0.9.534's own deliberately-unfixed DELIBERATE_ASYMMETRY.
    // ===============================================================
    {
        const provider = new DecentralizedPublicationDiscoveryProvider();
        const pubVerified = new Publication({ id: 'pub-h535-verified', documentId: 'doc-h535-v', title: 'H Verified' });
        const pubRejected = new Publication({ id: 'pub-h535-rejected', documentId: 'doc-h535-r', title: 'H Rejected' });
        const pubUnverifiable = new Publication({ id: 'pub-h535-unverifiable', documentId: 'doc-h535-u', title: 'H Unverifiable' });

        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: pubVerified.id }, { id: pubRejected.id }, { id: pubUnverifiable.id }],
            placements: [
                { publicationId: pubVerified.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: pubRejected.id, position: { x: 1, y: 0, z: 1 } },
                { publicationId: pubUnverifiable.id, position: { x: 2, y: 0, z: 2 } }
            ]
        }, asPeer('did:key:zH535')));

        const source = new RecordingMaterialSource({ [pubVerified.id]: pubVerified, [pubRejected.id]: pubRejected, [pubUnverifiable.id]: pubUnverifiable });
        const canvas = buildCanvasInstance({
            registry, materialSources: { peer: source },
            materialVerifier: new MapVerifier({ [pubVerified.id]: true, [pubRejected.id]: false /* unverifiable: no entry -> undefined */ }),
            decentralizedPublicationDiscoveryProvider: provider
        });
        mountCanvas(canvas);

        // H1. Merely walking to, selecting, and inspecting a REJECTED or
        // UNVERIFIABLE encounter never writes to the Repository catalog
        // — observation stays observation.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubRejected.id });
        await flush();
        assert(canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED && provider.list().length === 0,
            '1. a REJECTED encounter is fully inspected without ever writing to the Repository catalog.');

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubUnverifiable.id });
        await flush();
        assert(canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.UNVERIFIABLE && provider.list().length === 0,
            '2. an UNVERIFIABLE encounter (no verifier decision) is likewise fully inspected without any catalog write.');

        // H2. The one deliberate write path fires only for the fully
        // AVAILABLE + VERIFIED cell, exactly as 0.9.523/0.9.524 already
        // established and left unmodified by this milestone.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubVerified.id });
        await flush();
        assert(canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED && provider.list().length === 1 && provider.list()[0] === pubVerified,
            '3. only the VERIFIED encounter is admitted, by the exact same Publication reference materialInspection itself resolved to — no reconstruction, no second copy.');

        // H3. Walking away and back to the SAME already-admitted,
        // already-verified Publication is — structurally — just one
        // more independent admission EVENT, exactly like a Nostr
        // relay re-announcement or an Arweave re-crawl already are per
        // tests/RepositoryPublicationLifecycleProductReassessment.test.js
        // Section C. This milestone does NOT add an existence/uniqueness
        // check to close it: doing so would directly contradict
        // 0.9.523's own established, and 0.9.534's own freshly
        // RECONFIRMED, DELIBERATE_ASYMMETRY finding — "don't introduce
        // new deduplication rules merely to make a test pass" applies
        // here exactly as it did there.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubRejected.id }); // walk away
        await flush();
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubVerified.id }); // walk back
        await flush();
        assert(provider.list().length === 2 && provider.list()[0] === pubVerified && provider.list()[1] === pubVerified,
            '4. RECONFIRMED, NOT A NEW GAP: walking back to an already-admitted, already-verified Publication appends a second catalog entry for it, by the same reference — this is 0.9.523/0.9.534\'s own already-blessed catalog multiplicity, one more independently-triggered admission event, never a corrupted or duplicated IDENTITY (both entries share the identical id/documentId and are the identical object by reference).');
        assert(provider.findById(pubVerified.id) === pubVerified,
            '5. findById() still resolves the one correct answer despite the catalog multiplicity, exactly as 0.9.534 Section C already proved for repeated discovery generally.');

        // H4. No EXISTING entry is ever mutated or removed by any of the
        // walking above — only ever appended to, matching 0.9.524
        // Section E's own "existing entries untouched" finding, one
        // layer up (a session-continuity walk, not merely a second
        // independent admission attempt).
        const beforeMutationCheck = provider.list();
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubRejected.id });
        await flush();
        assert(provider.list().length === beforeMutationCheck.length && provider.list().every((p, i) => p === beforeMutationCheck[i]),
            '6. a subsequent REJECTED encounter, inspected after the fact, changes nothing about the existing catalog entries — no removal, no replacement, no reordering.');

        // H5. Structural: the admission gate itself still checks
        // AVAILABLE + instanceof Publication + VERIFIED alone — no
        // origin/family branch was added by this milestone (this
        // milestone touches refreshSelectionOutcome()/
        // refreshComparisonSelectionOutcome() only — see Section E/F —
        // never admitToRepositoryDiscovery() itself).
        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        const admitBody = canvasSource.slice(canvasSource.indexOf('admitToRepositoryDiscovery(loading, verification) {'), canvasSource.indexOf('\n        },', canvasSource.indexOf('admitToRepositoryDiscovery(loading, verification) {')));
        assert(/loading\.status === 'AVAILABLE'/.test(admitBody) && /loading\.material instanceof Publication/.test(admitBody) && /verification\.status === 'VERIFIED'/.test(admitBody),
            '7. admitToRepositoryDiscovery()\'s own gate is untouched by this milestone — still exactly AVAILABLE + instanceof Publication + VERIFIED, nothing added, nothing loosened.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section H: observation (selection, inspection, REJECTED/UNVERIFIABLE outcomes) never writes to the Repository catalog. The one deliberate write path stays exactly as narrowly gated as 0.9.523/0.9.524 left it, untouched by this milestone. A walk-back re-admission of an already-verified Publication is 0.9.523/0.9.534\'s own already-established, deliberately-unfixed catalog multiplicity, reconfirmed rather than newly "fixed" — no existing entry is ever mutated or removed by any amount of walking.');

    // ===============================================================
    // Section I — Trust/evidence vocabulary continuity: switching focus
    // never cross-contaminates one encounter's status/provenance into
    // another's.
    // ===============================================================
    {
        // I1. Direct orchestration-layer proof, mirroring 0.9.532
        // Section D/E's own technique: two independently-produced
        // results never share a reference or a status.
        const verifiedResult = await inspectWorldEncounterMaterial({
            resolvedSelection: { kind: 'PUBLICATION', objectId: 'pub-i535-a', origin: 'local' },
            materialSources: { local: { async load() { return { id: 'pub-i535-a' }; } } },
            verifier: new MapVerifier({ 'pub-i535-a': true })
        });
        const rejectedResult = await inspectWorldEncounterMaterial({
            resolvedSelection: { kind: 'PUBLICATION', objectId: 'pub-i535-b', origin: 'local' },
            materialSources: { local: { async load() { return { id: 'pub-i535-b' }; } } },
            verifier: new MapVerifier({ 'pub-i535-b': false })
        });
        assert(verifiedResult !== rejectedResult && verifiedResult.verification !== rejectedResult.verification,
            '1. two independently-inspected encounters never share an object reference for their own verification result.');
        assert(verifiedResult.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED && rejectedResult.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED,
            '2. each carries exactly its own status — never the other\'s.');

        const localProvenance = describePublicationMaterialProvenanceFromInspection({ lead: null });
        const decentralizedProvenance = describePublicationMaterialProvenanceFromInspection({ lead: { uri: 'ar://tx-i535' } });
        assert(localProvenance.origin === PublicationMaterialProvenanceOrigin.LOCAL && decentralizedProvenance.origin === PublicationMaterialProvenanceOrigin.DECENTRALIZED,
            '3. provenance stays the same two-value, per-observation fact this codebase already established — reconfirmed, not re-derived.');

        // I2. LIVE, through the real canvas: a walk across THREE
        // differently-verified encounters (VERIFIED, REJECTED,
        // UNVERIFIABLE) never lets one's status leak into either of the
        // others, checked pairwise at every step of the walk.
        const pubV = new Publication({ id: 'pub-i535-v', title: 'V' });
        const pubR = new Publication({ id: 'pub-i535-r', title: 'R' });
        const pubU = new Publication({ id: 'pub-i535-u', title: 'U' });
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: pubV.id }, { id: pubR.id }, { id: pubU.id }],
            placements: [
                { publicationId: pubV.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: pubR.id, position: { x: 1, y: 0, z: 1 } },
                { publicationId: pubU.id, position: { x: 2, y: 0, z: 2 } }
            ]
        }));
        const source = new RecordingMaterialSource({ [pubV.id]: pubV, [pubR.id]: pubR, [pubU.id]: pubU });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubV.id]: true, [pubR.id]: false }) });
        mountCanvas(canvas);

        const observed = [];
        for (const id of [pubV.id, pubR.id, pubU.id, pubV.id, pubU.id, pubR.id]) {
            canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: id });
            await flush();
            observed.push({ id, status: canvas.materialInspection.verification.status, selectionId: canvas.materialInspection.selection.objectId });
        }
        const expectedStatus = {
            [pubV.id]: WorldEncounterMaterialVerificationStatus.VERIFIED,
            [pubR.id]: WorldEncounterMaterialVerificationStatus.REJECTED,
            [pubU.id]: WorldEncounterMaterialVerificationStatus.UNVERIFIABLE
        };
        for (const step of observed) {
            assert(step.selectionId === step.id && step.status === expectedStatus[step.id],
                `4. at every step of a six-visit walk across three encounters, materialInspection names exactly the encounter just selected (${step.id}) with exactly ITS OWN status (${step.status}) — never a neighbor's.`);
        }

        unmountCanvas(canvas);
    }
    console.log('✓ Section I: VERIFIED/REJECTED/UNVERIFIABLE and LOCAL/DECENTRALIZED stay two independent, per-observation facts throughout a six-visit walk across three differently-verified encounters — no status or provenance from one encounter is ever presented as describing another.');

    // ===============================================================
    // Section J — Flagship: a realistic Wanderer session, end to end.
    // ===============================================================
    {
        // Enter World: a cross-World focus, exactly as any of the real
        // entry surfaces (Repository/Notification/Search) would produce
        // — session-level, camera-only, per Section B (which already
        // proved that layer's own reference stability; this flagship
        // reconfirms only that the target Publication is genuinely
        // resolvable at the moment of entry, then moves on to the richer
        // walk/encounter/inspect/return sequence the brief actually asks
        // this Section to prove, one layer down).
        const storage = new InMemoryStorageProvider();
        const worldPublication = publishMinimalDocument(storage, 'Flagship World');
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        assert(discoveryProvider.findById(worldPublication.id).id === worldPublication.id, '1. Enter World: the target World\'s own Publication resolves before the walk begins (value identity — see Section B\'s own note on this storage-backed provider never handing back the same reference twice).');

        // Walk, and encounter Publication A (peer, will verify).
        const publicationA = new Publication({ id: 'pub-j535-a', documentId: 'doc-j535-a', title: 'Flagship A', author: 'alice' });
        const publicationB = new Publication({ id: 'pub-j535-b', documentId: 'doc-j535-b', title: 'Flagship B', author: 'bob' });
        const repositoryProvider = new DecentralizedPublicationDiscoveryProvider();
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: publicationA.id }, { id: publicationB.id }],
            placements: [
                { publicationId: publicationA.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: publicationB.id, position: { x: 20, y: 0, z: 20 } }
            ]
        }, asPeer('did:key:zFlagship')));
        const source = new RecordingMaterialSource({ [publicationA.id]: publicationA, [publicationB.id]: publicationB });
        const canvas = buildCanvasInstance({
            registry, materialSources: { peer: source },
            materialVerifier: new MapVerifier({ [publicationA.id]: true, [publicationB.id]: false }),
            decentralizedPublicationDiscoveryProvider: repositoryProvider
        });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationA.id });
        await flush();
        assert(canvas.materialInspection.loading.material === publicationA && canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '2. Encounter Publication A; inspect/verify A: VERIFIED, and materialInspection genuinely holds A by reference.');
        assert(source.countFor(publicationA.id) === 1, '3. A was loaded exactly once so far.');
        assert(repositoryProvider.list().length === 1 && repositoryProvider.list()[0] === publicationA,
            '4. A\'s own VERIFIED encounter is admitted into the Repository catalog, by reference.');

        // Continue walking; encounter Publication B (will be rejected).
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationB.id });
        assert(canvas.materialInspection === null, '5. THE FIX, live in the flagship: the instant the Wanderer walks on to B, A\'s own stale evidence is already cleared — never lingering under B\'s new identity.');
        await flush();
        assert(canvas.materialInspection.loading.material === publicationB && canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED,
            '6. Inspect/verify B: REJECTED, genuinely B\'s own material.');
        assert(repositoryProvider.list().length === 1,
            '7. B\'s own REJECTED encounter is never admitted — the Repository catalog still holds only A.');

        // Return toward A; encounter A again; inspect A.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: publicationA.id });
        assert(canvas.materialInspection === null, '8. and again on the return leg: B\'s own now-stale REJECTED evidence is cleared immediately, before A\'s own fresh load even starts.');
        await flush();

        // THE FLAGSHIP CLAIM: the final A is Publication A BY REFERENCE
        // — not merely "material with the same hash" — with a FRESHLY
        // RE-RUN verification (never A's own first-visit result object
        // reused) that still, correctly, reads VERIFIED, never leaking
        // B's REJECTED.
        assert(canvas.materialInspection.loading.material === publicationA,
            '9. THE FLAGSHIP CLAIM: the final encounter\'s own material IS (===) Publication A, the exact same instance the Wanderer\'s first visit already held — never a reconstruction, and never merely "the same id."');
        assert(canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '10. the final verification correctly reads VERIFIED again — B\'s own REJECTED never leaked into this second visit to A.');
        assert(source.countFor(publicationA.id) === 2,
            '11. A\'s own verification was genuinely RE-RUN for this second visit (a second real load() call), not reused from the first visit\'s own cached result — current semantics require a fresh run on every genuine selection change, proven true for the return leg specifically, not merely assumed.');
        assert(repositoryProvider.list().length === 2 && repositoryProvider.list().every((p) => p === publicationA),
            '12. the second, independent VERIFIED admission event for A appends one more entry, by the identical reference — 0.9.523/0.9.534\'s own reconfirmed DELIBERATE_ASYMMETRY, not a new identity and not a corrupted one.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section J: FLAGSHIP — Enter World, walk, encounter A (VERIFIED), continue walking, encounter B (REJECTED), return toward A, encounter A again, inspect A. The final A is proven, live, to be Publication A by reference, with a genuinely re-run (never reused) verification that reads VERIFIED again, never B\'s REJECTED — the fix from Section E/F holds through the full, realistic round trip, not merely in isolation.');

    console.log('\nAll Wanderer World Session Continuity Product Reassessment tests passed.');
    console.log('\n=== 0.9.535 VERDICT ===');
    console.log(`SESSION_CONTINUITY_GAP_FOUND_AND_FIXED. This milestone's own architectural question — does a clean
distinction already exist between Session state, World navigation/focus state, Encounter state, Material inspection
state, and Publication identity — is answered YES, live (Section A), and PROVEN rather than re-architected: the real
production code already keeps WorldNavigationSession (Section B), selectedEncounter (Sections C/D), materialInspection
(Sections E/F/G), and a Publication's own identity (Sections A/B/J) as four genuinely separate facts. Within that
already-sound structure, this milestone found and fixed ONE real, narrow, live gap: a genuine walk from one
encounter to a different one left the PREVIOUS encounter's own already-resolved material/verification (and, through
distributablePublication, its own loaded Publication instance and enabled Distribute/Snapshot actions) readable and
actionable for the entire async gap until the NEW encounter's own material resolved (Sections E/F). The fix is two
one-line, symmetric additions to refreshSelectionOutcome()/refreshComparisonSelectionOutcome() — clearing
materialInspection/comparisonMaterialInspection synchronously in the exact branch that already decides a genuine
selection change occurred — touching nothing about 0.9.169's own "no redundant reload" guard, nothing about
admission (Section H), and nothing about identity (Sections A/B/J). Section H separately reconfirms, rather than
"fixes," 0.9.523/0.9.534's own deliberately-unfixed catalog multiplicity for a repeated/walk-back admission: closing
that would contradict a standing, twice-established architectural decision this milestone was never asked to
reopen. No new World session manager, encounter state machine, cache, or Repository mutation mechanism was
introduced anywhere in this file or in the production fix. Per this milestone's own brief: the Publication/
Repository/World continuity arc (0.9.532-0.9.534) and this session-continuity question together now cover
Publication-entering-World, Repository-holding-Publication, and Wanderer-moving-through-World-once-inside — the
next milestone should come from a different, genuinely new product boundary, not from re-auditing any of these
again absent new evidence.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
