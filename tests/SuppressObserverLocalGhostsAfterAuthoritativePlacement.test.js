
import { WorldDiscoverySourceRegistry } from '../application/discovery/WorldDiscoverySourceRegistry.js';
import { ObserverLocalEncounterStore } from '../application/worldEncounter/ObserverLocalEncounterStore.js';
import { describeObserverLocalPublicationEncounter } from '../core/ObserverLocalPublicationEncounter.js';
import { resolveSnapshotWorldPlacement } from '../application/snapshot/placement/SnapshotWorldPlacement.js';
import { registerMaterializedSnapshotWorldSource } from '../application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js';
import { StoreSnapshotContentOutcome } from '../application/snapshot/materialization/StoreSnapshotContentOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/snapshot/placement/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/snapshot/placement/SnapshotWorldRegistrationOutcome.js';
import { LocalWorldEncounterMaterialSource } from '../application/worldEncounter/LocalWorldEncounterMaterialSource.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { worldEncounterCanvasFiles, worldViewFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.570 — Suppress Observer-Local Ghosts After Authoritative Placement.
//
// TYPE: production fix. Production changes: one filtering step inside
// `ui/components/WorldEncounterCanvas.js`'s own `projectedObserverLocalEncounters`
// computed.
//
// 0.9.568 Section D found a real PRODUCT_GAP: a Publication discovered
// while UNPLACED (recording a session-scoped "Discovered here"
// observer-local encounter) that LATER, within the SAME session, reaches
// the primary `WorldDiscoverySourceRegistry` channel renders BOTH a
// permanent, fully-actionable marker AND a stale observer-local ghost,
// simultaneously, for the rest of that session. 0.9.569's own boundary
// audit located the fix precisely: a filtering step inside
// `projectedObserverLocalEncounters`, keyed by `publicationId` against
// `publicationRows`'s own `objectId` — no change to
// `ObserverLocalEncounterStore.js`, `WorldView.js`, `PlacementRecord`, or
// `WorldDiscoverySourceRegistry`, and no new prop, event, or subscription.
// This milestone implements exactly that filter and verifies it.
//
// CORE INVARIANT: an observer-local encounter for Publication P is not
// projected for rendering whenever `publicationRows` currently contains an
// authoritative row for P (matched by `objectId`). The existence or
// absence of a `claimedPosition` never, by itself, affects this — see
// Section E/F below.
//
// PRODUCT DECISION (left open by 0.9.569 Section H, made here): an
// observer-local inspection already open on a converging encounter is
// left alone — not dismissed, not mutated. `selectedObserverLocalEncounter`/
// `observerLocalEncounterInspection` are independent selection state, never
// re-derived from the projected marker list, and the existing product copy
// already disclaims permanence for an observer-local encounter, so a
// stale-but-still-open inspection panel is consistent with what the
// product already says. See Section F below.
//
// DELIBERATELY EXCLUDED — PER 0.9.569'S OWN RECOMMENDATION.
// - No lifecycle seam (`dismiss()`/`remove()`/`expire()`/`convertToPlacement()`)
//   added to `ObserverLocalEncounterStore.js`. The filter is purely
//   presentational; the store's own recorded encounters are untouched.
// - No dependency on `claimedPosition`. The question this filter answers
//   is "does this Publication already have authoritative World placement,"
//   never "does the publisher claim this position."
// - No new prop, event, subscription, or polling loop.
// - No forced dismissal of an open observer-local inspection.

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// ===================================================================
// Harness — mirrors 0.9.569's own harness, trimmed to this milestone's
// own needs.
// ===================================================================

function knowPublicationsLocally(storageProvider, publications) {
    const existing = storageProvider.load('forkbuild-publications') || [];
    storageProvider.save('forkbuild-publications', [...existing, ...publications.map((p) => p.toJSON())]);
}

function makePublication({ id, title, contentHash }) {
    return new Publication({
        id, documentId: `${id}-doc`, title, author: 'alice', contentHash,
        contentReference: new ContentReference({ hash: contentHash, uri: `local://${id}`, storage: 'local' })
    });
}

function placeAuthoritatively(registry, publication, position) {
    const placementInfo = { placementId: `placement:${publication.id}`, publicationId: publication.id, position };
    const materialization = { outcome: StoreSnapshotContentOutcome.STORED, contentHash: publication.contentHash, contentReference: publication.contentReference };
    const placement = resolveSnapshotWorldPlacement(materialization, placementInfo);
    assert(placement.outcome === SnapshotWorldPlacementOutcome.PLACED, 'placeAuthoritatively() setup: the placement itself must resolve to PLACED');
    return registerMaterializedSnapshotWorldSource(registry, placement, publication);
}

function removeAuthoritativePlacement(registry, publication) {
    registry.removeSource(`snapshot:${publication.contentHash}:${publication.id}`);
}

function recordObserverLocalEncounter(store, { publicationId, contentHash, position }) {
    const encounter = describeObserverLocalPublicationEncounter({ publicationId, contentHash, encounterPosition: position });
    assert(encounter, 'recordObserverLocalEncounter() setup: describeObserverLocalPublicationEncounter() must succeed for well-formed input');
    store.record(encounter);
    return encounter;
}

function commandSpy() {
    const calls = [];
    const fn = (...args) => { calls.push(args); };
    fn.calls = calls;
    return fn;
}

class MapVerifier {
    constructor(map) { this._map = map; }
    async verifyIdentity(resolvedSelection) {
        return this._map[resolvedSelection && resolvedSelection.objectId] === true;
    }
}

function buildCanvasInstance({
    registry = null,
    observerLocalEncounterRegistry = null,
    materialSources = null,
    materialVerifier = null,
    openPublicationCommand = null,
    forkPublicationCommand = null,
    explorePublicationCommand = null,
    getPublicationCommentariesCommand = null
} = {}) {
    const ctx = {
        registry, observerLocalEncounterRegistry, view: WorldEncounterCanvas.props.view.default(),
        materialSources, materialVerifier,
        openPublicationCommand, forkPublicationCommand, explorePublicationCommand, getPublicationCommentariesCommand
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    for (const name of [
        'effectiveView', 'publicationRows', 'projectedPublications', 'projectedObserverLocalEncounters',
        'observerLocalEncounterResolvedSelection', 'observerLocalEncounterActionablePublication',
        'observerLocalEncounterCommentaryPublicationId'
    ]) {
        Object.defineProperty(ctx, name, { get() { return WorldEncounterCanvas.computed[name].call(ctx); } });
    }
    return ctx;
}
function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

async function run() {
    console.log('Running Suppress Observer-Local Ghosts After Authoritative Placement tests...\n');

    // =======================================================================
    // Section A — normal observer-local encounter: no PlacementRecord,
    // marker renders.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const publication = makePublication({ id: 'section-a-pub', title: 'Section A Publication', contentHash: 'hash-a' });
        recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 1, y: 0, z: 1 } });

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        assert(ctx.projectedPublications.length === 0 && ctx.projectedObserverLocalEncounters.length === 1,
            'A1. With no authoritative placement: the observer-local marker renders, unaffected by the new filter.');
        assert(ctx.projectedObserverLocalEncounters[0].publicationId === publication.id, 'A2. The rendered row carries the correct publicationId.');
        unmountCanvas(ctx);
        console.log('✓ A: an ordinary observer-local encounter with no authoritative placement is unaffected — no regression.');
    }

    // =======================================================================
    // Section B — registration transition: the actual bug, fixed.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const publication = makePublication({ id: 'section-b-pub', title: 'Section B Publication', contentHash: 'hash-b' });
        recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 2, y: 0, z: 2 } });

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        assert(ctx.projectedObserverLocalEncounters.length === 1, 'B1. Setup: the observer-local marker renders before registration.');

        const result = placeAuthoritatively(registry, publication, { x: 40, y: 0, z: 40 });
        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'B2. Setup: the authoritative registration itself succeeds.');

        assert(ctx.projectedPublications.length === 1 && ctx.projectedPublications[0].objectId === publication.id,
            'B3. The authoritative marker renders, permanently.');
        assert(ctx.projectedObserverLocalEncounters.length === 0,
            'B4. THE FIX: the observer-local ghost is gone — the same publicationId is no longer double-rendered.');
        unmountCanvas(ctx);
        console.log('✓ B: registering an authoritative placement for a publicationId already carrying an observer-local marker suppresses that marker; the authoritative marker alone remains.');
    }

    // =======================================================================
    // Section C — same coordinates, different Publications: identity-based.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const sharedPosition = { x: 10, y: 0, z: 10 };
        const p1 = makePublication({ id: 'section-c-p1', title: 'Section C P1', contentHash: 'hash-c1' });
        const p2 = makePublication({ id: 'section-c-p2', title: 'Section C P2', contentHash: 'hash-c2' });
        recordObserverLocalEncounter(store, { publicationId: p1.id, contentHash: p1.contentHash, position: sharedPosition });
        recordObserverLocalEncounter(store, { publicationId: p2.id, contentHash: p2.contentHash, position: sharedPosition });
        placeAuthoritatively(registry, p1, sharedPosition);

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        assert(ctx.projectedPublications.length === 1 && ctx.projectedPublications[0].objectId === p1.id, 'C1. Only P1 is authoritatively placed.');
        assert(ctx.projectedObserverLocalEncounters.length === 1 && ctx.projectedObserverLocalEncounters[0].publicationId === p2.id,
            'C2. P1\'s own observer-local ghost is suppressed; P2\'s survives — identical coordinates never conflate the two identities.');
        unmountCanvas(ctx);
        console.log('✓ C: the filter is identity-based, not coordinate-based — P1 registered, P2 (same coordinates, different publicationId) keeps its own marker.');
    }

    // =======================================================================
    // Section D — same content hash, different Publications.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const sharedHash = 'shared-hash-d';
        const p1 = makePublication({ id: 'section-d-p1', title: 'Section D P1', contentHash: sharedHash });
        const p2 = makePublication({ id: 'section-d-p2', title: 'Section D P2', contentHash: sharedHash });
        recordObserverLocalEncounter(store, { publicationId: p1.id, contentHash: sharedHash, position: { x: 0, y: 0, z: 0 } });
        recordObserverLocalEncounter(store, { publicationId: p2.id, contentHash: sharedHash, position: { x: 1, y: 0, z: 1 } });
        placeAuthoritatively(registry, p1, { x: 20, y: 0, z: 20 });

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        assert(ctx.projectedObserverLocalEncounters.length === 1 && ctx.projectedObserverLocalEncounters[0].publicationId === p2.id,
            'D1. P2\'s own observer-local marker survives despite sharing P1\'s contentHash — the filter is keyed by publicationId, never contentHash.');
        unmountCanvas(ctx);
        console.log('✓ D: contentHash equality alone never suppresses an unrelated Publication\'s own marker.');
    }

    // =======================================================================
    // Section E — different coordinates: registration suppresses regardless
    // of coordinate agreement.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const publication = makePublication({ id: 'section-e-pub', title: 'Section E Publication', contentHash: 'hash-e' });
        recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 12, y: 0, z: 8 } });
        placeAuthoritatively(registry, publication, { x: 99, y: 0, z: 99 });

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        assert(ctx.projectedObserverLocalEncounters.length === 0,
            'E1. The stale marker is suppressed despite the observer-local and authoritative positions genuinely disagreeing — convergence is an identity decision, never a coordinate-equality one.');
        unmountCanvas(ctx);
        console.log('✓ E: a position disagreement between the observer-local encounter and the authoritative placement never blocks suppression.');
    }

    // =======================================================================
    // Section F — inspection continuity: an already-open inspection is left
    // alone, not forcibly dismissed, when its marker is suppressed.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const contentHash = 'section-f-hash';
        const publication = makePublication({ id: 'section-f-pub', title: 'Section F Publication', contentHash });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publication.id]: true });

        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash, position: { x: 3, y: 0, z: 3 } });

        const openPublicationCommand = commandSpy();
        const ctx = buildCanvasInstance({
            registry, observerLocalEncounterRegistry: store, materialSources: { local: localSource }, materialVerifier: verifier, openPublicationCommand
        });
        mountCanvas(ctx);

        ctx.selectObserverLocalEncounter({ publicationId: publication.id, contentHash });
        await flushMicrotasks();
        assert(ctx.observerLocalEncounterActionablePublication && ctx.observerLocalEncounterActionablePublication.id === publication.id,
            'F1. Setup: the inspection resolves normally, before convergence.');

        placeAuthoritatively(registry, publication, { x: 15, y: 0, z: 15 });
        assert(ctx.projectedObserverLocalEncounters.length === 0, 'F2. Sanity — the marker itself is now suppressed.');

        assert(ctx.selectedObserverLocalEncounter !== null && ctx.selectedObserverLocalEncounter.publicationId === publication.id,
            'F3. The selection is untouched by the marker\'s disappearance — the product decision (marker disappears ≠ inspection forcibly disappears) is honored.');
        assert(ctx.observerLocalEncounterActionablePublication && ctx.observerLocalEncounterActionablePublication.id === publication.id,
            'F4. The already-resolved inspection stays open and correct.');
        ctx.openObserverLocalEncounterPublication();
        assert(openPublicationCommand.calls.length === 1 && openPublicationCommand.calls[0][0].id === publication.id,
            'F5. Open, from the now-stale-but-still-open inspection panel, still resolves correctly.');
        unmountCanvas(ctx);
        console.log('✓ F: an observer-local inspection already open when its marker converges stays open and fully actionable — suppression is purely a rendering-list change, never a selection-state mutation.');
    }

    // =======================================================================
    // Section G — async race: an in-flight inspection request is not
    // resurrected or corrupted by a concurrent registration.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const contentHash = 'section-g-hash';
        const publication = makePublication({ id: 'section-g-pub', title: 'Section G Publication', contentHash });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publication.id]: true });

        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash, position: { x: 4, y: 0, z: 4 } });

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store, materialSources: { local: localSource }, materialVerifier: verifier });
        mountCanvas(ctx);

        ctx.selectObserverLocalEncounter({ publicationId: publication.id, contentHash });
        const requestIdAfterSelect = ctx.observerLocalEncounterInspectionRequestId;

        placeAuthoritatively(registry, publication, { x: 25, y: 0, z: 25 });
        assert(ctx.projectedObserverLocalEncounters.length === 0, 'G1. Sanity — the marker is suppressed mid-flight.');
        assert(ctx.observerLocalEncounterInspectionRequestId === requestIdAfterSelect,
            'G2. The registration never bumps the request id — the projection filter introduces no new asynchronous step and guards nothing new.');

        await flushMicrotasks();
        assert(ctx.observerLocalEncounterInspection !== null && ctx.observerLocalEncounterInspectionRequestId === requestIdAfterSelect,
            'G3. The in-flight inspection completes normally, resolved by the SAME requestId it started with, undisturbed by the suppression that happened mid-flight.');
        unmountCanvas(ctx);
        console.log('✓ G: an old, still-resolving inspection request is neither corrupted nor used to resurrect a now-suppressed marker.');
    }

    // =======================================================================
    // Section H — session isolation: a placement in one session's registry
    // never suppresses an observer-local encounter in another session.
    // =======================================================================
    {
        const registryOne = new WorldDiscoverySourceRegistry();
        const storeOne = new ObserverLocalEncounterStore();
        const registryTwo = new WorldDiscoverySourceRegistry();
        const storeTwo = new ObserverLocalEncounterStore();
        const publication = makePublication({ id: 'section-h-pub', title: 'Section H Publication', contentHash: 'hash-h' });

        recordObserverLocalEncounter(storeOne, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 1, y: 0, z: 1 } });
        recordObserverLocalEncounter(storeTwo, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 2, y: 0, z: 2 } });
        placeAuthoritatively(registryOne, publication, { x: 50, y: 0, z: 50 });

        const ctxOne = buildCanvasInstance({ registry: registryOne, observerLocalEncounterRegistry: storeOne });
        const ctxTwo = buildCanvasInstance({ registry: registryTwo, observerLocalEncounterRegistry: storeTwo });
        mountCanvas(ctxOne);
        mountCanvas(ctxTwo);

        assert(ctxOne.projectedObserverLocalEncounters.length === 0, 'H1. Session One: the marker is suppressed, correctly, for its own placement.');
        assert(ctxTwo.projectedObserverLocalEncounters.length === 1,
            'H2. Session Two: the SAME publicationId still renders its own observer-local marker — Session One\'s own registry never reaches Session Two\'s own canvas instance at all.');
        unmountCanvas(ctxOne);
        unmountCanvas(ctxTwo);
        console.log('✓ H: a `WorldEncounterCanvas` instance only ever reads its OWN `registry`/`observerLocalEncounterRegistry` pair — an authoritative placement in one World/session never suppresses an observer-local encounter fed by a genuinely different registry pair.');
    }

    // =======================================================================
    // Section I — placement removal: the filter is reactive, never a
    // one-way "once placed, forever hidden" flag.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const publication = makePublication({ id: 'section-i-pub', title: 'Section I Publication', contentHash: 'hash-i' });
        recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 6, y: 0, z: 6 } });
        placeAuthoritatively(registry, publication, { x: 60, y: 0, z: 60 });

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        assert(ctx.projectedObserverLocalEncounters.length === 0, 'I1. Setup: suppressed while the authoritative placement exists.');

        removeAuthoritativePlacement(registry, publication);
        assert(ctx.projectedPublications.length === 0, 'I2. Sanity — the authoritative row is genuinely gone.');
        assert(ctx.projectedObserverLocalEncounters.length === 1 && ctx.projectedObserverLocalEncounters[0].publicationId === publication.id,
            'I3. The observer-local marker reappears once the authoritative placement it was suppressed against is gone — the filter reacts to CURRENT `publicationRows` membership on every recomputation, never a cached, sticky suppression decided once and kept forever.');
        unmountCanvas(ctx);
        console.log('✓ I: suppression is fully reactive to current World registry state in both directions, never a permanent, one-way flag.');
    }

    // =======================================================================
    // Section J — production guard: no new lifecycle seam, no
    // `claimedPosition` dependency, no change outside the one seam 0.9.569
    // located.
    // =======================================================================
    {
        const storeSource = codeOnly(await readSource('application/worldEncounter/ObserverLocalEncounterStore.js'));
        for (const forbidden of ['dismiss(', 'remove(', 'evict(', 'expire(', 'convertToPlacement(', '_encounters.delete']) {
            assert(!storeSource.includes(forbidden), `J1. ObserverLocalEncounterStore.js still defines no '${forbidden}' seam — this fix stays purely presentational, exactly as 0.9.569 recommended.`);
        }

        const canvasSource = codeOnly((await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n'));
        assert(canvasSource.includes('projectedObserverLocalEncounters()'), 'J2. Sanity — the seam this milestone targets still exists under its own name.');
        const filterBody = canvasSource.split('projectedObserverLocalEncounters() {')[1].split('\n        },')[0];
        assert(filterBody.includes('publicationRows') && filterBody.includes('objectId') && filterBody.includes('publicationId'),
            'J3. The filter reads `publicationRows`/`objectId` against `publicationId`, exactly the identity key 0.9.569 Section E/F proved correct.');
        assert(!filterBody.includes('claimedPosition'),
            'J4. The filter never reads `claimedPosition` — the question answered is "does this Publication already have authoritative World placement," never "does the publisher claim this position."');

        const worldViewSource = codeOnly((await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n'));
        assert(!/observerLocalEncounterRegistry[\s\S]{0,200}(registry|worldDiscoverySourceRegistry)\.(listSources|list)\(/.test(worldViewSource),
            'J5. WorldView.js still never reconciles the two registries itself — the fix stayed inside WorldEncounterCanvas.js, the seam 0.9.569 located.');

        console.log('✓ J: the fix is exactly the one, narrow filtering step 0.9.569 recommended — no new lifecycle seam on the store, no `claimedPosition` dependency, and no reconciliation logic leaked into WorldView.js.');
    }

    console.log('\n✅ All Suppress Observer-Local Ghosts After Authoritative Placement tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
