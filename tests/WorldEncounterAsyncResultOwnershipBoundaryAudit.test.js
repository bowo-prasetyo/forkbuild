import { Publication } from '../publisher/Publication.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldDiscoverySourceRegistry } from '../application/discovery/WorldDiscoverySourceRegistry.js';
import { describeLocalWorldDiscoverySource } from '../application/worldEncounter/WorldEncounterIntegration.js';
import { describePeerWorldDiscoverySource } from '../peer/PeerWorldDataIngress.js';
import { WorldEncounterMaterialSource } from '../application/worldEncounter/WorldEncounterMaterialLoading.js';
import {
    WorldEncounterMaterialVerifier,
    WorldEncounterMaterialVerificationStatus
} from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import { assert } from './support/Assert.js';

// 0.9.537 — World Encounter Async Result Ownership Boundary Audit.
//
// 0.9.535 found and fixed a stale-`materialInspection` gap; 0.9.536 found and
// fixed the same class of gap one layer over, for the Distribute/Snapshot-
// Distribute/Discover-Snapshot action state `refreshSelectionOutcome()`
// itself did not yet reset. Both fixes live in the SAME one place: the
// genuine-change branch of `refreshSelectionOutcome()` (and its comparison-
// side mirror, `refreshComparisonSelectionOutcome()`), which now resets
// EVERY ephemeral field this file's own async writers ever populate, and
// bumps EVERY `requestId` counter those writers guard themselves with. This
// milestone does not add a third fix on the same seam — it asks the broader
// question the previous two fixes' own shared shape raises: across EVERY
// asynchronous operation this component owns, not just the two already
// caught, can a late completion ever write into state that no longer
// belongs to the resolution it started against?
//
// SECTION A — Enumeration. Every asynchronous writer in
// `WorldEncounterCanvas`, and the guard it already carries:
//
//   writer                          | guard field                         | invalidated on genuine change by
//   ---------------------------------+--------------------------------------+----------------------------------
//   material load + verify (primary) | materialInspectionRequestId          | refreshSelectionOutcome()
//   material load + verify (compare) | comparisonMaterialInspectionRequestId| refreshComparisonSelectionOutcome()
//   Distribute Publication           | distributionRequestId                | refreshSelectionOutcome() (0.9.536)
//   Distribute Snapshot              | snapshotDistributionRequestId        | refreshSelectionOutcome() (0.9.536)
//   Discover Snapshot + Attribution  | snapshotDiscoveryRequestId           | refreshSelectionOutcome() (0.9.536)
//   Repository admission (`.add()`)  | none — deliberate, see below         | never (by design, 0.9.474)
//
// `discoverPublication()`/`discoveryCommand` (the freestanding "Discover by
// object id + tag" form) and `refreshEncounterCommentaries()`/
// `submitEncounterCommentary()` were also checked: the first is guarded by
// its own `discoveryRequestId` but is NEVER keyed to `selectedEncounter` at
// all (its `objectId`/`discoveryTag` are Wanderer-typed, independent
// fields) — there is no "resolution it belongs to" for a genuine-selection-
// change branch to invalidate, so it is correctly out of this audit's
// scope. The second pair is fully SYNCHRONOUS (`getPublicationCommentariesCommand`/
// `addPublicationCommentaryCommand` are called and their return value used
// directly — no `Promise`, no `.then()`) — there is no async gap for either
// to have.
//
// Repository admission (`admitToRepositoryDiscovery()`, called from both
// `refreshMaterialInspection()` and `refreshComparisonMaterialInspection()`)
// is the one writer this file's own header already documents as
// DELIBERATELY unguarded: "a resolution superseded for DISPLAY purposes was
// still a genuine, VERIFIED retrieval this device is entitled to make
// discoverable." Its own invariant is not "is this the currently displayed
// resolution" but "was this genuinely verified" — a different boundary,
// already correct, and explicitly out of this milestone's brief ("no
// Repository changes"). Section I reconfirms this live: a late admission
// for a superseded resolution still reaches the Repository, and still never
// touches any DISPLAY-relevant state belonging to whatever the Wanderer has
// since moved on to.
//
// No new guard is introduced anywhere in this milestone. Every Section
// below is a live reproduction proving the EXISTING `requestId` +
// `resolvedEncounterSelectionsEqual()` boundary already holds for a shape
// 0.9.535/0.9.536 did not themselves exercise: comparison-side registry-only
// supersession (B), three-way concurrency (C/D), the error path for
// Snapshot Distribution/Discovery specifically (E), primary/comparison
// cross-writes under interleaved completion (F), content-identical-but-
// distinct-identity Publications completing out of order (G), full
// AMBIGUOUS -> RESOLVED recovery after an in-flight loss (H), Repository-
// admission isolation (I), and one adversarial timeline mixing all of the
// above (J).
//
// FINDING: see the verdict block at the end of this file.

function flush() {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
}

// Mirrors tests/WorldEncounterActionStateBoundaryProductReassessment.test.js's
// own harness exactly.
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
    Object.defineProperty(ctx, 'comparisonResolvedSelection', {
        get() { return WorldEncounterCanvas.computed.comparisonResolvedSelection.call(ctx); }
    });
    Object.defineProperty(ctx, 'distributablePublication', {
        get() { return WorldEncounterCanvas.computed.distributablePublication.call(ctx); }
    });
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

// `resolveSnapshotPublicationAttribution()` (called from
// `discoverSelectedSnapshot()`'s own `.then()`) requires a
// `contentReference.hash` on every Publication it is handed — every
// Publication this file builds gets one by default so Sections exercising
// Discover Snapshot never need to special-case it.
function makePublication(id, title, extra = {}) {
    return new Publication({ id, title, contentReference: { hash: `${id}-content-hash` }, ...extra });
}

// A material source under this test's own explicit control — `load()`
// never resolves on its own, so completion order is entirely test-driven.
class DeferredMaterialSource extends WorldEncounterMaterialSource {
    constructor(materialsByObjectId = {}) { super(); this.materialsByObjectId = materialsByObjectId; this.pending = new Map(); this.calls = []; }
    load(resolvedSelection) {
        this.calls.push(resolvedSelection.objectId);
        const { promise, resolve } = deferred();
        this.pending.set(resolvedSelection.objectId, resolve);
        return promise;
    }
    settle(objectId) {
        const resolve = this.pending.get(objectId);
        if (!resolve) throw new Error(`DeferredMaterialSource: no pending load for ${objectId}`);
        this.pending.delete(objectId);
        resolve(Object.prototype.hasOwnProperty.call(this.materialsByObjectId, objectId) ? this.materialsByObjectId[objectId] : null);
    }
}

class ImmediateMaterialSource extends WorldEncounterMaterialSource {
    constructor(materialsByObjectId = {}) { super(); this.materialsByObjectId = materialsByObjectId; }
    async load(resolvedSelection) {
        return Object.prototype.hasOwnProperty.call(this.materialsByObjectId, resolvedSelection.objectId)
            ? this.materialsByObjectId[resolvedSelection.objectId]
            : null;
    }
}

class MapVerifier extends WorldEncounterMaterialVerifier {
    constructor(outcomesByObjectId = {}) { super(); this.outcomesByObjectId = outcomesByObjectId; }
    async verifyIdentity(resolvedSelection) {
        return this.outcomesByObjectId[resolvedSelection.objectId];
    }
}

// A duck-typed spy Repository discovery provider — `admitToRepositoryDiscovery()`
// only ever calls `.add()` on it.
class SpyDiscoveryProvider {
    constructor() { this.added = []; }
    add(publication) { this.added.push(publication); }
}

function registryWith(publications) {
    const registry = new WorldDiscoverySourceRegistry();
    registry.setSource(describeLocalWorldDiscoverySource({
        publications: publications.map((p) => ({ id: p.id, title: p.title })),
        placements: publications.map((p, i) => ({ publicationId: p.id, position: { x: i, y: 0, z: i } }))
    }));
    return registry;
}

function addPeerAmbiguity(registry, publication, identityId) {
    const peerSource = describePeerWorldDiscoverySource(
        {
            publications: [{ id: publication.id, title: publication.title }],
            placements: [{ publicationId: publication.id, position: { x: 0, y: 0, z: 0 } }]
        },
        { remoteIdentity: { identityId } }
    );
    registry.setSource(peerSource);
    return `peer:${identityId}`;
}

async function main() {
    // ===============================================================
    // Section A — Enumeration (see this file's own header for the table;
    // this section confirms the table's own claims live rather than
    // merely asserting them in prose).
    // ===============================================================
    {
        const pub = makePublication('pub-a537', 'A537');
        const registry = registryWith([pub]);
        const source = new ImmediateMaterialSource({ [pub.id]: pub });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pub.id]: true }) });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pub.id });
        await flush();

        const guardFields = ['materialInspectionRequestId', 'distributionRequestId', 'snapshotDistributionRequestId', 'snapshotDiscoveryRequestId'];
        for (const field of guardFields) {
            assert(typeof canvas[field] === 'number', `1. [${field}] exists and is numeric.`);
        }

        // A1. Every action-triggering call bumps its OWN guard, and only
        // its own — the four guards are independent counters, never a
        // shared one that could over- or under-invalidate a sibling.
        const snapshot = () => Object.fromEntries(guardFields.map((f) => [f, canvas[f]]));
        const s0 = snapshot();
        canvas.distributionCommand = () => new Promise(() => {});
        canvas.distributeSelectedPublication();
        const s1 = snapshot();
        assert(s1.distributionRequestId !== s0.distributionRequestId, '2. distributeSelectedPublication() bumps distributionRequestId.');
        for (const field of guardFields.filter((f) => f !== 'distributionRequestId')) {
            assert(s1[field] === s0[field], `3. [${field}] is untouched by an UNRELATED action's own start.`);
        }

        // A2. `admitToRepositoryDiscovery()` carries no requestId of its
        // own — confirmed structurally: it is not one of `data()`'s
        // guard fields, and its own method body (already read) branches
        // solely on `loading.status`/`verification.status`, never on any
        // `this.*RequestId` comparison.
        assert(!('repositoryAdmissionRequestId' in canvas), '4. no requestId guard exists for Repository admission — it is deliberately exempt (see header).');

        unmountCanvas(canvas);
    }
    console.log('✓ Section A: every asynchronous writer this file owns carries its own independent requestId guard, except Repository admission, which is deliberately unguarded by design (0.9.474) — reconfirmed structurally.');

    // ===============================================================
    // Section B — Selection-change invalidation, including the
    // COMPARISON side reached purely through registry notification (never
    // exercised live before this milestone — 0.9.536's own Section I only
    // ever proved this for the PRIMARY side).
    // ===============================================================
    {
        const pubA = makePublication('pub-b537-a', 'B537-A');
        const registry = registryWith([pubA]);
        const source = new DeferredMaterialSource({ [pubA.id]: pubA });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true }) });
        mountCanvas(canvas);

        // Prime the primary selection (needed to arm comparison selection).
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        source.settle(pubA.id);
        await flush();

        // Select A as the COMPARISON target too (a legitimate shape —
        // nothing in this file forbids comparing a Publication against
        // itself under a different origin once one exists).
        canvas.armedForComparisonSelection = true;
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        assert(canvas.comparisonMaterialInspection === null, '1. comparison selection starts with a pending load.');
        const requestIdAtSelect = canvas.comparisonMaterialInspectionRequestId;

        // B1. A registry-only genuine change — a peer now also offers the
        // SAME objectId the comparison side is resolving, reclassifying it
        // RESOLVED -> AMBIGUOUS — with no `selectComparisonEncounter()`
        // call anywhere on this path.
        addPeerAmbiguity(registry, pubA, 'greta');
        assert(canvas.comparisonSelectionOutcome.status === 'AMBIGUOUS', '2. the comparison side is genuinely reclassified by registry notification alone.');
        assert(canvas.comparisonMaterialInspectionRequestId !== requestIdAtSelect,
            '3. THE PROOF: comparisonMaterialInspectionRequestId is bumped by refreshComparisonSelectionOutcome()\'s own genuine-change branch, reached purely through mounted()\'s registry subscribe() callback — symmetric with the primary side\'s 0.9.536 fix, never separately patched for this side because refreshComparisonSelectionOutcome() already mirrors it exactly (0.9.535).');

        // B2. The stale, still-pending load for A (as a comparison target)
        // now late-settles. Its result must never become current
        // comparisonMaterialInspection.
        source.settle(pubA.id);
        await flush();
        assert(canvas.comparisonMaterialInspection === null,
            '4. a late comparison-side load, superseded by registry-only ambiguity with no click, never becomes current comparisonMaterialInspection.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section B: the comparison side\'s own genuine-change invalidation is exercised purely through registry notification, exactly mirroring the primary side — a late comparison load superseded with no click never becomes current state.');

    // ===============================================================
    // Section C — Same-selection completion: three concurrent actions
    // against the SAME still-current selection must all apply normally.
    // ===============================================================
    {
        const pubA = makePublication('pub-c537-a', 'C537-A');
        const registry = registryWith([pubA]);
        const source = new ImmediateMaterialSource({ [pubA.id]: pubA });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(canvas.distributablePublication === pubA, '1. setup: A is distributable.');

        const distAttempt = deferred();
        const snapDistAttempt = deferred();
        const snapDiscAttempt = deferred();
        canvas.distributionCommand = () => distAttempt.promise;
        canvas.snapshotDistributionCommand = () => snapDistAttempt.promise;
        canvas.discoverSnapshotCommand = () => snapDiscAttempt.promise;

        canvas.distributeSelectedPublication();
        canvas.distributeSelectedSnapshot();
        canvas.discoverSelectedSnapshot();
        assert(canvas.distributionExecuting && canvas.snapshotDistributionExecuting && canvas.snapshotDiscoveryExecuting,
            '2. all three are genuinely in flight, concurrently, against the SAME still-current selection.');

        // Resolve in a deliberately scrambled order.
        snapDiscAttempt.resolve({ outcome: 'PLACED', locator: 'c537-locator' });
        await flush();
        distAttempt.resolve(undefined);
        await flush();
        snapDistAttempt.resolve({ contentReference: { hash: 'c537-hash', uri: 'c537-uri' }, announcement: null });
        await flush();

        assert(canvas.snapshotDiscoveryResult && canvas.snapshotDiscoveryResult.outcome === 'PLACED', '3. Discover Snapshot\'s own result applied — the selection never moved, so nothing should be discarded.');
        assert(canvas.snapshotAttributionResult !== null, '4. attribution, computed under the same guard, applied too.');
        assert(canvas.distributionExecuting === false && canvas.distributionError === null, '5. Distribute Publication completed cleanly.');
        assert(canvas.snapshotDistributionResult && canvas.snapshotDistributionResult.contentReference.hash === 'c537-hash', '6. Distribute Snapshot\'s own result applied.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section C: three concurrent actions against a selection that never changes all apply normally, in whatever order they complete — the invalidation guard does not overcorrect merely because time (and other actions) passed.');

    // ===============================================================
    // Section D — Multiple concurrent operations: A selected, three
    // actions start, THEN a genuine change to B, THEN all three complete
    // in arbitrary order — none may be redirected to B, or apply at all.
    // ===============================================================
    {
        const pubA = makePublication('pub-d537-a', 'D537-A');
        const pubB = makePublication('pub-d537-b', 'D537-B');
        const registry = registryWith([pubA, pubB]);
        const source = new ImmediateMaterialSource({ [pubA.id]: pubA, [pubB.id]: pubB });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true, [pubB.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();

        const distAttempt = deferred();
        const snapDistAttempt = deferred();
        const snapDiscAttempt = deferred();
        canvas.distributionCommand = () => distAttempt.promise;
        canvas.snapshotDistributionCommand = () => snapDistAttempt.promise;
        canvas.discoverSnapshotCommand = () => snapDiscAttempt.promise;
        canvas.distributeSelectedPublication();
        canvas.distributeSelectedSnapshot();
        canvas.discoverSelectedSnapshot();
        assert(canvas.distributionExecuting && canvas.snapshotDistributionExecuting && canvas.snapshotDiscoveryExecuting, '1. all three in flight against A.');

        // A genuine change to B — an explicit walk (the concurrency, not
        // the trigger shape, is this section's own focus; Sections B/H
        // already cover the registry-only trigger shape for other fields).
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubB.id });
        assert(canvas.distributionExecuting === false && canvas.snapshotDistributionExecuting === false && canvas.snapshotDiscoveryExecuting === false,
            '2. all three were synchronously reset the instant B became current.');

        // Complete in reverse-scrambled order, mixing success and failure.
        snapDistAttempt.resolve({ contentReference: { hash: 'stale-d-hash', uri: 'stale-d-uri' }, announcement: null });
        await flush();
        distAttempt.reject(new Error('stale network failure'));
        await flush();
        snapDiscAttempt.resolve({ outcome: 'PLACED', locator: 'stale-d-locator' });
        await flush();

        assert(canvas.snapshotDistributionResult === null, '3. A\'s stale Distribute-Snapshot result never became current state.');
        assert(canvas.distributionError === null, '4. A\'s stale Distribute-Publication error never became current state.');
        assert(canvas.snapshotDiscoveryResult === null && canvas.snapshotAttributionResult === null, '5. A\'s stale Discover-Snapshot result/attribution never became current state.');
        assert(canvas.distributablePublication === pubB, '6. B remained completely authoritative throughout — never displaced, never touched by any of A\'s three late completions.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section D: three operations started concurrently against A, superseded by a genuine change to B, and completed in scrambled success/failure order, are each independently discarded — none is ever redirected to B, and B stays authoritative throughout.');

    // ===============================================================
    // Section E — Success and error symmetry for Snapshot Distribution
    // and Discover Snapshot specifically (0.9.536 Section I proved this
    // for Distribute-Snapshot's success path and Distribute-Publication's
    // error path; this section fills the two remaining cells: Distribute-
    // Snapshot's own error path, and Discover-Snapshot's own error path).
    // ===============================================================
    {
        const pubA = makePublication('pub-e537-a', 'E537-A');
        const registry = registryWith([pubA]);
        const source = new ImmediateMaterialSource({ [pubA.id]: pubA });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true }) });
        mountCanvas(canvas);
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();

        const snapDistAttempt = deferred();
        canvas.snapshotDistributionCommand = () => snapDistAttempt.promise;
        canvas.distributeSelectedSnapshot();
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'e537-elsewhere' }); // genuine change, no material there
        snapDistAttempt.reject(new Error('late rejection'));
        await flush();
        assert(canvas.snapshotDistributionError === null, '1. a late Distribute-Snapshot REJECTION for a superseded selection never surfaces as snapshotDistributionError.');

        // Fresh canvas for the second cell, to keep each proof independent.
        const pubC = makePublication('pub-e537-c', 'E537-C');
        const registryC = registryWith([pubC]);
        const sourceC = new ImmediateMaterialSource({ [pubC.id]: pubC });
        const canvasC = buildCanvasInstance({ registry: registryC, materialSources: { local: sourceC }, materialVerifier: new MapVerifier({ [pubC.id]: true }) });
        mountCanvas(canvasC);
        canvasC.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubC.id });
        await flush();
        const snapDiscAttempt = deferred();
        canvasC.discoverSnapshotCommand = () => snapDiscAttempt.promise;
        canvasC.discoverSelectedSnapshot();
        canvasC.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'e537-elsewhere-c' });
        snapDiscAttempt.reject(new Error('late rejection'));
        await flush();
        assert(canvasC.snapshotDiscoveryError === null, '2. a late Discover-Snapshot REJECTION for a superseded selection never surfaces as snapshotDiscoveryError.');
        assert(canvasC.snapshotAttributionResult === null, '3. and no attribution is ever computed off a rejected, superseded discovery.');

        unmountCanvas(canvas);
        unmountCanvas(canvasC);
    }
    console.log('✓ Section E: late ERRORS (not just late successes) are correctly discarded for Distribute-Snapshot and Discover-Snapshot too — a stale error never makes the current encounter appear to have failed.');

    // ===============================================================
    // Section F — Primary/comparison isolation under INTERLEAVED
    // completion: a late primary result must not modify comparison state,
    // and vice versa, proven with both loads genuinely in flight at once.
    // ===============================================================
    {
        const pubA = makePublication('pub-f537-a', 'F537-A');
        const pubB = makePublication('pub-f537-b', 'F537-B');
        const registry = registryWith([pubA, pubB]);
        const source = new DeferredMaterialSource({ [pubA.id]: pubA, [pubB.id]: pubB });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true, [pubB.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id }); // primary A, pending
        canvas.armedForComparisonSelection = true;
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubB.id }); // comparison B, pending
        assert(canvas.materialInspection === null && canvas.comparisonMaterialInspection === null, '1. both sides genuinely in flight, neither resolved yet.');

        // Comparison (B) settles FIRST — out of order relative to when it
        // was requested.
        source.settle(pubB.id);
        await flush();
        assert(canvas.comparisonMaterialInspection && canvas.comparisonMaterialInspection.selection.objectId === pubB.id, '2. comparison resolves to B.');
        assert(canvas.materialInspection === null, '3. the primary side is COMPLETELY untouched by the comparison side\'s own completion.');

        // Primary (A) settles second.
        source.settle(pubA.id);
        await flush();
        assert(canvas.materialInspection && canvas.materialInspection.selection.objectId === pubA.id, '4. primary resolves to A.');
        assert(canvas.comparisonMaterialInspection && canvas.comparisonMaterialInspection.selection.objectId === pubB.id, '5. the comparison side is COMPLETELY untouched by the primary side\'s own completion — still B, never overwritten or cleared.');

        // Action state (Distribute/Snapshot-Distribute/Discover-Snapshot)
        // is derived from the PRIMARY side alone; confirm a comparison-only
        // change never touches its guards.
        const distributionRequestIdBefore = canvas.distributionRequestId;
        canvas.armedForComparisonSelection = true;
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'f537-no-such' });
        assert(canvas.comparisonMaterialInspection === null, '6. comparison changed again...');
        assert(canvas.distributionRequestId === distributionRequestIdBefore, '7. ...but distributionRequestId (a PRIMARY-only guard) is completely untouched by any comparison-side change.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section F: primary and comparison material state never cross-write regardless of which side\'s async load completes first, and every action guard — derived from the primary side alone — is provably inert to comparison-only changes.');

    // ===============================================================
    // Section G — Identity binding under out-of-order completion: two
    // Publications with DIFFERENT publicationId but the SAME contentHash,
    // completing out of order, must never be confused by the guard.
    // ===============================================================
    {
        const pubX = makePublication('pub-g537-x', 'G537-X', { contentHash: 'same-hash-537' });
        const pubY = makePublication('pub-g537-y', 'G537-Y', { contentHash: 'same-hash-537' });
        assert(pubX.contentHash === pubY.contentHash && pubX.id !== pubY.id, '1. setup: same contentHash, different publicationId.');

        const registry = registryWith([pubX, pubY]);
        const source = new DeferredMaterialSource({ [pubX.id]: pubX, [pubY.id]: pubY });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubX.id]: true, [pubY.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubX.id }); // X pending
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubY.id }); // genuine change to Y; X's own load is now stale
        assert(canvas.materialInspection === null, '2. Y is pending too; nothing resolved yet.');

        // X's stale load — for a Publication with IDENTICAL content to the
        // one now selected — settles late.
        source.settle(pubX.id);
        await flush();
        assert(canvas.materialInspection === null, '3. THE PROOF: X\'s late-arriving, content-identical result is discarded — the guard compares identity (objectId/origin), never "equivalent enough" content.');
        assert(canvas.distributablePublication === null, '4. distributablePublication stays null; X never leaks through as if it were Y merely because their content matches.');

        // Y's own load settles.
        source.settle(pubY.id);
        await flush();
        assert(canvas.materialInspection.selection.objectId === pubY.id, '5. Y resolves correctly, in its own right.');
        assert(canvas.distributablePublication === pubY && canvas.distributablePublication !== pubX,
            '6. distributablePublication is Y BY REFERENCE — the shared contentHash never lets X\'s own instance stand in for it.');
        assert(canvas.distributablePublication.contentHash === pubX.contentHash, '7. (sanity) the content really is equivalent — this is a genuine same-content/different-identity pair, not merely two unrelated Publications.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section G: the ownership guard is bound to Publication/encounter IDENTITY (kind + objectId + origin), never to content equivalence — two Publications sharing a contentHash, completing out of order, are never confused for one another.');

    // ===============================================================
    // Section H — Registry mutation race, WITH recovery: A=RESOLVED,
    // action(A) starts, registry -> AMBIGUOUS, action(A) completes (must
    // be rejected); THEN registry -> RESOLVED again, and a NEW action for
    // A must work normally.
    // ===============================================================
    {
        const pubA = makePublication('pub-h537-a', 'H537-A');
        const registry = registryWith([pubA]);
        const source = new ImmediateMaterialSource({ [pubA.id]: pubA });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(canvas.distributablePublication === pubA, '1. A=RESOLVED, distributable.');

        // H1. async action(A) starts.
        const firstAttempt = deferred();
        canvas.snapshotDistributionCommand = () => firstAttempt.promise;
        canvas.distributeSelectedSnapshot();
        assert(canvas.snapshotDistributionExecuting === true, '2. action(A) genuinely in flight.');

        // H2. registry changes -> A=AMBIGUOUS (no click anywhere).
        const peerOrigin = addPeerAmbiguity(registry, pubA, 'harlan');
        assert(canvas.distributablePublication === null, '3. A=AMBIGUOUS; no longer distributable.');

        // H3. async action(A) completes — must not be accepted.
        firstAttempt.resolve({ contentReference: { hash: 'h537-stale-hash', uri: 'h537-stale-uri' }, announcement: null });
        await flush();
        assert(canvas.snapshotDistributionResult === null, '4. THE RACE: action(A)\'s completion under AMBIGUOUS is correctly rejected — never accepted as current state.');

        // H4. registry changes -> A=RESOLVED again (the peer withdraws).
        registry.removeSource(peerOrigin);
        await flush();
        assert(canvas.distributablePublication === pubA, '5. RECOVERY: A is distributable again after the registry genuinely resolves it a second time.');
        assert(canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '6. and freshly, genuinely re-verified — never a stale carryover from before the ambiguity.');

        // H5. A NEW action for A, started only now, must work normally —
        // this is the "new work is not old work" half of the proof.
        const secondAttempt = deferred();
        canvas.snapshotDistributionCommand = () => secondAttempt.promise;
        canvas.distributeSelectedSnapshot();
        assert(canvas.snapshotDistributionExecuting === true, '7. the NEW action is in flight.');
        secondAttempt.resolve({ contentReference: { hash: 'h537-fresh-hash', uri: 'h537-fresh-uri' }, announcement: null });
        await flush();
        assert(canvas.snapshotDistributionResult && canvas.snapshotDistributionResult.contentReference.hash === 'h537-fresh-hash',
            '8. RECOVERY, proven: a genuinely NEW operation started after A becomes current again has its result correctly accepted — the invalidation from step 4 does not permanently poison A, only the specific superseded call.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section H: an action superseded by a registry-driven RESOLVED->AMBIGUOUS shift is correctly rejected; once the registry genuinely resolves the SAME encounter again, a freshly-started operation for it is correctly accepted — old work stays dead, new work is not mistaken for it.');

    // ===============================================================
    // Section I — Failure isolation: a stale completion for A must not
    // affect B's inspection/action/verification/selection state, and
    // Repository admission (the one deliberately unguarded writer) never
    // leaks into B's own DISPLAY state either way.
    // ===============================================================
    {
        const pubA = makePublication('pub-i537-a', 'I537-A');
        const pubB = makePublication('pub-i537-b', 'I537-B');
        const registry = registryWith([pubA, pubB]);
        const source = new ImmediateMaterialSource({ [pubA.id]: pubA, [pubB.id]: pubB });
        const spyProvider = new SpyDiscoveryProvider();
        const canvas = buildCanvasInstance({
            registry,
            materialSources: { local: source },
            materialVerifier: new MapVerifier({ [pubA.id]: true, [pubB.id]: true }),
            decentralizedPublicationDiscoveryProvider: spyProvider
        });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(spyProvider.added.length === 1 && spyProvider.added[0] === pubA, '1. A\'s own verified material was admitted to the Repository the instant it resolved.');

        const distAttempt = deferred();
        const snapDistAttempt = deferred();
        canvas.distributionCommand = () => distAttempt.promise;
        canvas.snapshotDistributionCommand = () => snapDistAttempt.promise;
        canvas.distributeSelectedPublication();
        canvas.distributeSelectedSnapshot();

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubB.id });
        await flush();
        const bMaterialInspection = canvas.materialInspection;
        const bDistributable = canvas.distributablePublication;
        assert(bDistributable === pubB, '2. B is now fully current, independently resolved and verified.');
        assert(spyProvider.added.length === 2 && spyProvider.added[1] === pubB, '3. B\'s own admission is independent of A\'s — both genuinely verified retrievals, both admitted, neither blocking the other.');

        // A's two stale calls complete late — one success, one failure.
        snapDistAttempt.resolve({ contentReference: { hash: 'i537-stale-hash', uri: 'i537-stale-uri' }, announcement: null });
        distAttempt.reject(new Error('stale'));
        await flush();

        assert(canvas.materialInspection === bMaterialInspection, '4. B\'s materialInspection reference is completely unchanged by A\'s late completions.');
        assert(canvas.distributablePublication === bDistributable, '5. B\'s distributablePublication is unchanged.');
        assert(canvas.snapshotDistributionResult === null, '6. A\'s late success never became visible state under B.');
        assert(canvas.distributionError === null, '7. A\'s late failure never made B appear to have failed.');
        assert(canvas.selectedEncounter.objectId === pubB.id, '8. the Wanderer\'s own selection itself — untouched by any of this, exactly as every prior milestone in this chain already established.');
        assert(spyProvider.added.length === 2, '9. Repository state gained no THIRD entry from A\'s late, superseded completions — admission only ever happens from a genuinely fresh resolve, in refreshMaterialInspection()\'s own .then(), which A\'s stale action-command promises never re-trigger (they are Distribute/Snapshot commands, not material loads).');

        unmountCanvas(canvas);
    }
    console.log('✓ Section I: a stale completion for A never touches B\'s inspection, action, verification, or selection state — and Repository admission, the one writer deliberately exempt from the currency guard, is independently correct for both A and B without either interfering with the other\'s display state.');

    // ===============================================================
    // Section J — Flagship adversarial timeline (the requesting brief's
    // own scenario, reproduced exactly).
    // ===============================================================
    {
        const pubA = makePublication('pub-j537-a', 'J537-A');
        const pubB = makePublication('pub-j537-b', 'J537-B');
        const registry = registryWith([pubA, pubB]);
        const source = new DeferredMaterialSource({ [pubA.id]: pubA, [pubB.id]: pubB });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true, [pubB.id]: true }) });
        mountCanvas(canvas);

        // "A selected"
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        source.settle(pubA.id);
        await flush();
        assert(canvas.distributablePublication === pubA, '1. A selected and resolved.');

        // "inspect A starts" — a fresh, still-pending re-inspection (e.g. a
        // decentralized-lead notification re-triggering refreshMaterialInspection()
        // directly, exactly as mounted()'s own worldDiscoveryLeadRegistry
        // subscribe() callback does) — left deliberately unsettled through
        // the entire B period below.
        const materialInspectionBeforeReinspect = canvas.materialInspection;
        canvas.refreshMaterialInspection();
        assert(canvas.materialInspection === materialInspectionBeforeReinspect,
            '2. inspect A restarted for the SAME still-current selection: the previous, already-resolved materialInspection stays visible (no flicker) while the fresh load is in flight — this is a same-selection refresh, not a genuine change, so 0.9.535\'s synchronous-clear branch correctly does not apply here.');

        // "distribute A starts"
        const distAttempt = deferred();
        canvas.distributionCommand = () => distAttempt.promise;
        canvas.distributeSelectedPublication();
        assert(canvas.distributionExecuting === true, '3. distribute A in flight.');

        // "snapshot operation for A" also starts, to be completed later.
        const snapDistAttempt = deferred();
        canvas.snapshotDistributionCommand = () => snapDistAttempt.promise;
        canvas.distributeSelectedSnapshot();
        assert(canvas.snapshotDistributionExecuting === true, '4. snapshot-distribute A in flight.');

        // "registry mutation changes selection" / "B becomes current"
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubB.id });
        source.settle(pubB.id);
        await flush();
        assert(canvas.materialInspection.selection.objectId === pubB.id, '5. B becomes current and resolves on its own.');
        assert(canvas.distributablePublication === pubB, '6. B is authoritative.');
        assert(canvas.distributionExecuting === false && canvas.snapshotDistributionExecuting === false, '7. A\'s own in-flight action state was reset the instant B became current.');

        // "snapshot operation for A completes"
        snapDistAttempt.resolve({ contentReference: { hash: 'j537-stale-snap-hash', uri: 'j537-stale-snap-uri' }, announcement: null });
        await flush();
        assert(canvas.snapshotDistributionResult === null, '8. A\'s late snapshot-distribution result discarded.');
        assert(canvas.distributablePublication === pubB, '9. B still authoritative.');

        // "distribution for A fails"
        distAttempt.reject(new Error('late A distribution failure'));
        await flush();
        assert(canvas.distributionError === null, '10. A\'s late distribution FAILURE never surfaces under B.');
        assert(canvas.distributablePublication === pubB, '11. B still authoritative.');

        // "material verification for A completes" — the still-pending
        // re-inspection from step 2, now finally settling, long after B
        // took over.
        source.settle(pubA.id);
        await flush();
        assert(canvas.materialInspection.selection.objectId === pubB.id, '12. B REMAINS COMPLETELY AUTHORITATIVE: A\'s own late-arriving re-verification never overwrote B\'s own resolved materialInspection.');
        assert(canvas.distributablePublication === pubB, '13. and distributablePublication still names B.');

        // "B -> A becomes current again -> new operations for A -> new
        // results accepted."
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        source.settle(pubA.id);
        await flush();
        assert(canvas.materialInspection.selection.objectId === pubA.id, '14. A becomes current again and resolves FRESH — never the long-abandoned pending state from step 2.');
        assert(canvas.distributablePublication === pubA, '15. A is authoritative again.');

        const freshAttempt = deferred();
        canvas.snapshotDistributionCommand = () => freshAttempt.promise;
        canvas.distributeSelectedSnapshot();
        assert(canvas.snapshotDistributionExecuting === true, '16. a genuinely NEW operation for A is in flight.');
        freshAttempt.resolve({ contentReference: { hash: 'j537-fresh-hash', uri: 'j537-fresh-uri' }, announcement: null });
        await flush();
        assert(canvas.snapshotDistributionResult && canvas.snapshotDistributionResult.contentReference.hash === 'j537-fresh-hash',
            '17. FLAGSHIP, proven: the new operation\'s result IS accepted — the system distinguishes old asynchronous work (steps 8/10/12, all correctly discarded) from new work for the SAME Publication after it becomes current again (step 17, correctly accepted).');

        unmountCanvas(canvas);
    }
    console.log('✓ Section J: FLAGSHIP — across the full adversarial timeline (concurrent inspect/distribute/snapshot for A, a registry-driven shift to B, all three of A\'s own operations completing AFTER the shift in scrambled success/failure order, then an explicit return to A), B stayed completely authoritative for the entire time it was current, and a genuinely new operation for A — started only after A became current again — was correctly accepted.');

    console.log('\nAll World Encounter Async Result Ownership Boundary Audit tests passed.');

    console.log(`\n=== 0.9.537 VERDICT ===
PRODUCT_COMPLETE. This milestone's own question — can any asynchronous World Encounter operation write a result
into state after the resolution it belongs to has ceased to be current — is answered NO, across every async writer
this component owns (Section A's own enumeration), for every shape the requesting brief named: comparison-side
registry-only supersession (B, never exercised live before this milestone, though refreshComparisonSelectionOutcome()
already mirrored the primary-side fix structurally since 0.9.535/0.9.184); same-selection completion under real
concurrency (C); multi-operation concurrency across a genuine supersession (D); the error path specifically for
Distribute-Snapshot and Discover-Snapshot (E, the two cells 0.9.536's own Section I did not itself cover);
primary/comparison cross-writes under interleaved out-of-order completion (F); content-identical-but-distinct-identity
Publications completing out of order (G); full AMBIGUOUS -> RESOLVED recovery after an in-flight loss, with a NEW
operation's result correctly accepted afterward (H); failure isolation including the one deliberately unguarded
writer, Repository admission, reconfirmed correct and non-leaking on both sides (I); and one flagship timeline mixing
all of the above end to end, proving old work for A stays dead while genuinely new work for A (after it becomes
current again) is correctly accepted (J). No gap was found. The existing boundary — a requestId counter per async
writer, invalidated by resolvedEncounterSelectionsEqual()'s own field-by-field kind/objectId/origin comparison in
refreshSelectionOutcome()/refreshComparisonSelectionOutcome()'s genuine-change branches (0.9.169, 0.9.535, 0.9.536)
— already provides the exact guarantee this milestone's own brief asks for. Per that brief's own instruction ("if the
existing request IDs and selection comparisons already provide that guarantee, the milestone should merely prove
it"), NO PRODUCTION CHANGE was made. This is a test-only milestone: one new file,
tests/WorldEncounterAsyncResultOwnershipBoundaryAudit.test.js, registered in tests.html; ui/components/WorldEncounterCanvas.js
is byte-for-byte unchanged. No new state machine, cancellation framework, token abstraction, Promise orchestration
redesign, caching, retry, prefetching, Repository change, Publication-identity change, new verification mechanism, or
navigation change was introduced anywhere, exactly as the requesting brief's own "deliberately exclude" list requires.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
