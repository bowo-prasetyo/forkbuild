import { Publication } from '../publisher/Publication.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldDiscoverySourceRegistry } from '../application/discovery/WorldDiscoverySourceRegistry.js';
import { describeLocalWorldDiscoverySource, LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/worldEncounter/WorldEncounterIntegration.js';
import { describePeerWorldDiscoverySource } from '../peer/PeerWorldDataIngress.js';
import { WorldEncounterMaterialSource } from '../application/worldEncounter/WorldEncounterMaterialLoading.js';
import {
    WorldEncounterMaterialVerifier,
    WorldEncounterMaterialVerificationStatus
} from '../application/worldEncounter/WorldEncounterMaterialVerification.js';
import { assert } from './support/Assert.js';

// 0.9.536 — World Encounter Action-State Boundary Product Reassessment.
//
// 0.9.535 found and fixed one real gap: a GENUINE selection change left the
// PREVIOUS encounter's own already-resolved `materialInspection` (and,
// through `distributablePublication`, its own loaded `Publication`
// instance) readable and actionable for the entire async gap until the NEW
// encounter's own material actually resolved. That fix was proven against
// exactly one trigger for "genuine change": an EXPLICIT marker click
// (`selectEncounter()`). This milestone asks the question 0.9.535 never
// asked: is `selectEncounter()` the ONLY path that can produce a genuine
// `resolvedEncounterSelection` change, or can one happen with no click at
// all?
//
// It cannot, for `materialInspection` itself — 0.9.535's own fix lives in
// `refreshSelectionOutcome()`, the ONE place both `selectEncounter()` and
// `mounted()`'s own registry `subscribe()` callback both funnel through.
// But `distributionExecuting`/`distributionError`/`distributionRequestId`,
// `snapshotDistributionExecuting`/`Error`/`Result`/`RequestId`, and
// `snapshotDiscoveryExecuting`/`Error`/`Result`/`RequestId`/
// `snapshotAttributionResult` were reset ONLY from `selectEncounter()`
// itself, one level higher up — never from `refreshSelectionOutcome()`'s
// own genuine-change branch. A registry mutation alone — a second source
// starting (or stopping) to offer the SAME still-selected encounter,
// reclassifying it between `RESOLVED` and `AMBIGUOUS`
// (application/worldEncounter/WorldEncounterSelectionOutcome.js, 0.9.20, unmodified) —
// reaches that branch with NO `selectEncounter()` call anywhere on its own
// path. Section I below reproduces exactly that: a Distribute/Snapshot
// action already in flight against the OLD resolution, still guarded by an
// UNBUMPED `requestId`, whose late result silently became state now
// displayed under a DIFFERENT (or absent) resolution.
//
// PRODUCTION CHANGE: `refreshSelectionOutcome()`'s own genuine-change
// branch now also resets all Distribute/Snapshot-Distribute/
// Discover-Snapshot ephemeral action state, mirroring the exact block
// `selectEncounter()` already ran (0.9.104/0.9.138/0.9.144) — a plain,
// direct duplication, not an extraction, so the change touches no other
// method's own dependency surface (several existing tests hand-assemble a
// fake canvas context from a hand-picked SUBSET of `WorldEncounterCanvas.
// methods`; an extraction changing what `selectEncounter()` itself calls
// would have silently broken every one of them).
//
//   Section A — Selection invalidation boundary: a genuine change (with OR
//               without an explicit click) clears materialInspection/
//               comparisonMaterialInspection; a non-genuine notification
//               clears neither, and leaves every other per-selection field
//               untouched.
//   Section B — Action gating: distributablePublication (the one gate all
//               three actions share) is null immediately after a genuine
//               change reached with NO selectEncounter() call at all.
//   Section C — Rendered-state consistency: the real template conditions
//               (Material panel, three action buttons) evaluate correctly
//               during the async gap after such a change.
//   Section D — Primary vs comparison: changing one side's resolution
//               never touches the other's materialInspection, and
//               distributablePublication is derived from the PRIMARY side
//               alone.
//   Section E — Verification-dependent actions: distributablePublication
//               is gated by loading.status alone, reconfirmed across
//               unavailable/unverifiable/rejected/verified, never newly
//               gated by verification.status by this milestone.
//   Section F — Failure after selection: B's own resolution failure is
//               rendered as B's failure, never a fallback to A's stale
//               success.
//   Section G — Recovery: a genuine walk back to A always reloads fresh
//               (0.9.169's own guard, reconfirmed, not a new cache); an
//               unrelated notification for the CURRENT selection still
//               never reloads.
//   Section H — Identity binding: distributablePublication is the actual
//               resolved Publication instance by reference, never a
//               look-alike from a different resolution.
//   Section I — THE FIX, proven live: a Distribute/Snapshot-Distribute/
//               Discover-Snapshot call already in flight against a
//               resolution that is then genuinely superseded — with NO
//               selectEncounter() call anywhere on that path — never
//               writes its late result/error into now-current state.
//   Section J — Flagship: a realistic session mixing explicit walks and a
//               mid-action registry-driven resolution shift, proving
//               action safety end to end.
//
// Deliberately excluded, per the requesting brief: no new state machine, no
// global action-authorization framework, no cancellation/async-task-
// management infrastructure, no caching, no prefetching, no automatic
// retry, no new verification/Repository/Publication-identity semantics, no
// navigation changes, no new trust vocabulary.
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

// Mirrors tests/WandererWorldSessionContinuityProductReassessment.test.js's
// own identically-purposed harness exactly — the established, real "mount a
// canvas instance without the DOM/Vue layer" convention.
function buildCanvasInstance({ registry = null, view, materialSources = null, materialVerifier = null } = {}) {
    const ctx = {
        registry,
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default(),
        materialSources,
        materialVerifier
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

function makePublication(id, title) {
    return new Publication({ id, title });
}

// A material source under this test's own explicit control — `load()`
// never resolves on its own, mirroring 0.9.535's own `DeferredMaterialSource`
// exactly, one file over.
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

// A synchronous source — resolves immediately with whatever this test
// configured, or `null` (UNAVAILABLE) when no material was registered.
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

// Builds a registry whose one PUBLICATION objectId starts served by
// `local` alone (RESOLVED) and can be pushed to AMBIGUOUS by adding a peer
// source, and back to RESOLVED by removing it — Section I/J's own trigger
// for "a genuine resolvedEncounterSelection change with NO
// selectEncounter() call anywhere on its path."
function buildAmbiguityCapableRegistry(publication) {
    const registry = new WorldDiscoverySourceRegistry();
    registry.setSource(describeLocalWorldDiscoverySource({
        publications: [{ id: publication.id, title: publication.title }],
        placements: [{ publicationId: publication.id, position: { x: 0, y: 0, z: 0 } }]
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
    // Section A — Selection invalidation boundary.
    // ===============================================================
    {
        const pubA = makePublication('pub-a536-a', 'A536-A');
        const registry = buildAmbiguityCapableRegistry(pubA);
        const source = new ImmediateMaterialSource({ [pubA.id]: pubA });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '1. setup: A resolves VERIFIED via local alone.');
        canvas.encounterCommentaries = [{ text: 'about A' }];

        // A1. A NON-genuine notification (re-`setSource` of the exact same
        // origin/objectId — a field-for-field identical local source,
        // which application/discovery/WorldDiscoverySourceRegistry.js's own header
        // documents as still notifying subscribers — with no candidate-set
        // change at all) must leave EVERYTHING untouched, including the
        // state 0.9.536 newly resets in the genuine branch. This is the
        // "don't unnecessarily clear unrelated state" half of the audit.
        const untouchedInspection = canvas.materialInspection;
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: pubA.id, title: pubA.title }],
            placements: [{ publicationId: pubA.id, position: { x: 0, y: 0, z: 0 } }]
        }));
        assert(canvas.materialInspection === untouchedInspection, '2. a non-genuine registry notification leaves materialInspection completely untouched (same reference).');
        assert(Array.isArray(canvas.encounterCommentaries) && canvas.encounterCommentaries.length === 1, '3. a non-genuine notification never clears unrelated per-selection state (commentary).');

        // A2. A GENUINE change reached with NO selectEncounter() call —
        // adding a peer source for the SAME objectId reclassifies
        // RESOLVED -> AMBIGUOUS, so resolvedEncounterSelection goes from
        // {local} to null. materialInspection must clear synchronously.
        addPeerAmbiguity(registry, pubA, 'bob');
        assert(canvas.materialInspection === null, '4. THE BOUNDARY: a genuine change reached purely through registry notification (no click) clears materialInspection synchronously, exactly like an explicit selectEncounter() walk already did before this milestone.');

        // A3. Unrelated per-selection state (commentary) is NOT cleared by
        // this path — only selectEncounter()'s own EXPLICIT reselect does
        // that (0.9.291). This milestone narrows exactly the gap it found;
        // it does not fold every reset into this branch.
        assert(Array.isArray(canvas.encounterCommentaries) && canvas.encounterCommentaries.length === 1,
            '5. commentary state is deliberately left alone by this narrower, registry-driven path — still the same selectedEncounter marker, from the Wanderer\'s own point of view.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section A: a genuine resolvedEncounterSelection change clears materialInspection whether reached by an explicit click or by registry notification alone; a non-genuine notification clears nothing at all.');

    // ===============================================================
    // Section B — Action gating without a click.
    // ===============================================================
    {
        const pubA = makePublication('pub-b536-a', 'B536-A');
        const registry = buildAmbiguityCapableRegistry(pubA);
        const source = new ImmediateMaterialSource({ [pubA.id]: pubA });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(canvas.distributablePublication === pubA, '1. setup: distributablePublication names A.');

        addPeerAmbiguity(registry, pubA, 'carol');
        assert(canvas.distributablePublication === null,
            '2. THE GATE: distributablePublication is null the instant a genuine change reaches refreshSelectionOutcome() with no click — never A\'s own stale Publication reference, even though the Wanderer never touched a marker.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section B: distributablePublication — the one gate Distribute/Snapshot-Distribute/Discover-Snapshot all share — is null immediately after a registry-only genuine change, with no selectEncounter() call anywhere on that path.');

    // ===============================================================
    // Section C — Rendered-state consistency during the gap.
    // ===============================================================
    {
        const pubA = makePublication('pub-c536-a', 'C536-A');
        const pubB = makePublication('pub-c536-b', 'C536-B');
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: pubA.id, title: pubA.title }, { id: pubB.id, title: pubB.title }],
            placements: [
                { publicationId: pubA.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: pubB.id, position: { x: 1, y: 0, z: 1 } }
            ]
        }));
        const deferredSource = new DeferredMaterialSource({ [pubA.id]: pubA, [pubB.id]: pubB });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: deferredSource }, materialVerifier: new MapVerifier({ [pubA.id]: true, [pubB.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        deferredSource.settle(pubA.id);
        await flush();
        assert(canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED, '1. setup: A fully resolves VERIFIED.');

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubB.id }); // B's own load deliberately never settled yet

        // The real template conditions, reproduced exactly.
        const materialPanelWouldRender = Boolean(canvas.selectedEncounter && canvas.materialInspection);
        const distributeDisabled = !canvas.distributablePublication || canvas.distributionExecuting;
        const snapshotDistributeDisabled = !canvas.distributablePublication || canvas.snapshotDistributionExecuting;
        const discoverSnapshotDisabled = !canvas.distributablePublication || canvas.snapshotDiscoveryExecuting;
        assert(materialPanelWouldRender === false, '2. the Material/Verification panel condition evaluates false during the gap — no stale A evidence rendered under B\'s identity.');
        assert(distributeDisabled === true, '3. Distribute stays disabled during the gap.');
        assert(snapshotDistributeDisabled === true, '4. Distribute Snapshot stays disabled during the gap.');
        assert(discoverSnapshotDisabled === true, '5. Discover Snapshot stays disabled during the gap.');

        deferredSource.settle(pubB.id);
        await flush();
        assert(canvas.materialInspection.selection.objectId === pubB.id, '6. once resolved, the panel genuinely names B.');
        assert(canvas.distributablePublication === pubB, '7. distributablePublication now correctly names B, never a carryover of A.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section C: the real Material panel and all three action-button gates stay correctly disabled/hidden for the entire async gap after a genuine change, tested against the literal template conditions.');

    // ===============================================================
    // Section D — Primary vs comparison: asymmetric transitions.
    // ===============================================================
    {
        const pubA = makePublication('pub-d536-a', 'D536-A');
        const pubB = makePublication('pub-d536-b', 'D536-B');
        const pubC = makePublication('pub-d536-c', 'D536-C');
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: pubA.id, title: pubA.title }, { id: pubB.id, title: pubB.title }, { id: pubC.id, title: pubC.title }],
            placements: [
                { publicationId: pubA.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: pubB.id, position: { x: 1, y: 0, z: 1 } },
                { publicationId: pubC.id, position: { x: 2, y: 0, z: 2 } }
            ]
        }));
        const source = new ImmediateMaterialSource({ [pubA.id]: pubA, [pubB.id]: pubB, [pubC.id]: pubC });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true, [pubB.id]: true, [pubC.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        canvas.armedForComparisonSelection = true;
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubC.id }); // routes to selectComparisonEncounter()
        await flush();
        assert(canvas.materialInspection.selection.objectId === pubA.id, '1. setup: primary is A.');
        assert(canvas.comparisonMaterialInspection.selection.objectId === pubC.id, '2. setup: comparison is C.');

        // D1. Primary A -> B never touches the comparison side.
        canvas.armedForComparisonSelection = false;
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubB.id });
        assert(canvas.materialInspection === null, '3. primary change clears the PRIMARY materialInspection synchronously.');
        assert(canvas.comparisonMaterialInspection && canvas.comparisonMaterialInspection.selection.objectId === pubC.id,
            '4. the comparison side is completely untouched by a primary-only change — still C, still resolved.');
        await flush();
        assert(canvas.distributablePublication === pubB, '5. distributablePublication now names the PRIMARY (B), never the comparison target (C).');

        // D2. Comparison C -> (unavailable target) never touches primary.
        canvas.armedForComparisonSelection = true;
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'no-such-publication' });
        assert(canvas.comparisonMaterialInspection === null, '6. comparison change clears the COMPARISON materialInspection synchronously.');
        assert(canvas.materialInspection && canvas.materialInspection.selection.objectId === pubB.id,
            '7. the primary side is completely untouched by a comparison-only change — still B, still resolved.');
        assert(canvas.distributablePublication === pubB, '8. distributablePublication is unaffected by the comparison side changing at all — it is derived from the PRIMARY selection alone, never the comparison one.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section D: primary and comparison materialInspection are two independent facts — a change on one side never clears, reloads, or influences the other, and every action gate (distributablePublication) is derived from the PRIMARY side alone, never the comparison target.');

    // ===============================================================
    // Section E — Verification-dependent actions: reconfirming the
    // existing, unmodified 0.9.104 contract across the full table.
    // ===============================================================
    {
        const table = [
            { label: 'unavailable', hasMaterial: false, verifierOutcome: undefined, expectAvailable: false },
            { label: 'available/unverifiable', hasMaterial: true, verifierOutcome: undefined, expectAvailable: true, expectVerification: WorldEncounterMaterialVerificationStatus.UNVERIFIABLE },
            { label: 'available/rejected', hasMaterial: true, verifierOutcome: false, expectAvailable: true, expectVerification: WorldEncounterMaterialVerificationStatus.REJECTED },
            { label: 'available/verified', hasMaterial: true, verifierOutcome: true, expectAvailable: true, expectVerification: WorldEncounterMaterialVerificationStatus.VERIFIED }
        ];
        for (const row of table) {
            const pub = makePublication(`pub-e536-${row.label.replace(/[^a-z]/g, '')}`, row.label);
            const registry = new WorldDiscoverySourceRegistry();
            registry.setSource(describeLocalWorldDiscoverySource({
                publications: [{ id: pub.id, title: pub.title }],
                placements: [{ publicationId: pub.id, position: { x: 0, y: 0, z: 0 } }]
            }));
            const source = new ImmediateMaterialSource(row.hasMaterial ? { [pub.id]: pub } : {});
            const verifier = row.verifierOutcome === undefined ? null : new MapVerifier({ [pub.id]: row.verifierOutcome });
            const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: verifier });
            mountCanvas(canvas);
            canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pub.id });
            await flush();

            if (row.expectAvailable) {
                assert(canvas.distributablePublication === pub, `1. [${row.label}] distributablePublication names the loaded Publication.`);
                assert(canvas.materialInspection.verification.status === row.expectVerification, `2. [${row.label}] verification status is ${row.expectVerification}.`);
            } else {
                assert(canvas.distributablePublication === null, `1. [${row.label}] distributablePublication is null — no material loaded at all.`);
            }
            unmountCanvas(canvas);
        }
    }
    console.log('✓ Section E: distributablePublication stays gated by loading.status alone across the full unavailable/unverifiable/rejected/verified table — reconfirming 0.9.104\'s own established contract, never newly narrowed or widened by this milestone.');

    // ===============================================================
    // Section F — Failure after selection: no fallback to A.
    // ===============================================================
    {
        const pubA = makePublication('pub-f536-a', 'F536-A');
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: pubA.id, title: pubA.title }],
            placements: [{ publicationId: pubA.id, position: { x: 0, y: 0, z: 0 } }]
        }));
        const source = new ImmediateMaterialSource({ [pubA.id]: pubA });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(canvas.distributablePublication === pubA && canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '1. setup: A verified and actionable.');

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: 'not-in-any-source' });
        await flush();
        assert(canvas.selectionOutcome.status === 'UNAVAILABLE', '2. B is a genuinely unavailable target.');
        assert(canvas.materialInspection === null, '3. materialInspection stays null for an unavailable selection — never A\'s own stale VERIFIED state shown as if it described B.');
        assert(canvas.distributablePublication === null, '4. no action is enabled for an unavailable selection — never a fallback to A\'s own Publication.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section F: a genuinely unavailable target is rendered as unavailable — never as a silent fallback to the previous encounter\'s own last-good material or action state.');

    // ===============================================================
    // Section G — Recovery: fresh reload on walk-back, no reload for an
    // unrelated notification of the SAME selection.
    // ===============================================================
    {
        const pubA = makePublication('pub-g536-a', 'G536-A');
        const pubB = makePublication('pub-g536-b', 'G536-B');
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: pubA.id, title: pubA.title }, { id: pubB.id, title: pubB.title }],
            placements: [
                { publicationId: pubA.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: pubB.id, position: { x: 1, y: 0, z: 1 } }
            ]
        }));
        const source = new ImmediateMaterialSource({ [pubA.id]: pubA, [pubB.id]: pubB });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true, [pubB.id]: false }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        const firstInspection = canvas.materialInspection;

        // G1. An unrelated registry notification for the CURRENT (still A)
        // selection never reloads — 0.9.169's own guard, reconfirmed.
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: pubA.id, title: pubA.title }, { id: pubB.id, title: pubB.title }],
            placements: [
                { publicationId: pubA.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: pubB.id, position: { x: 1, y: 0, z: 1 } }
            ]
        }));
        await flush();
        assert(canvas.materialInspection === firstInspection, '1. a non-genuine notification for the current selection never triggers a redundant reload.');

        // G2. Walk to B, then back to A — a genuine round trip.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubB.id });
        await flush();
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        assert(canvas.materialInspection === null, '2. the walk-back is itself a genuine change — materialInspection clears synchronously exactly like the initial walk away did.');
        await flush();
        assert(canvas.materialInspection.selection.objectId === pubA.id
            && canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '3. A resolves fresh on return — a genuinely re-run inspection, never a stale one reused, and never B\'s own REJECTED verdict.');
        assert(canvas.materialInspection !== firstInspection, '4. the fresh A result is a NEW inspection object, not the one retained from before the walk to B.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section G: a genuine walk-away-and-back always reloads fresh; an unrelated notification for the still-current selection never does — clearing stale state and redundant reloading stay two different things, exactly as 0.9.169 already established.');

    // ===============================================================
    // Section H — Identity binding: distributablePublication is the
    // actual current resolution's own Publication instance, by reference.
    // ===============================================================
    {
        // Two DISTINCT Publication instances that deliberately share a
        // title (their own would-be "content") but are different objects
        // with different ids — the identity a click must never confuse.
        const pubA = makePublication('pub-h536-a', 'Same Title');
        const pubB = makePublication('pub-h536-b', 'Same Title');
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: pubA.id, title: pubA.title }, { id: pubB.id, title: pubB.title }],
            placements: [
                { publicationId: pubA.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: pubB.id, position: { x: 1, y: 0, z: 1 } }
            ]
        }));
        const source = new ImmediateMaterialSource({ [pubA.id]: pubA, [pubB.id]: pubB });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true, [pubB.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(canvas.distributablePublication === pubA && canvas.distributablePublication !== pubB,
            '1. distributablePublication is A BY REFERENCE — never merely "a Publication with the same title."');

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubB.id });
        await flush();
        assert(canvas.distributablePublication === pubB && canvas.distributablePublication !== pubA,
            '2. after selecting B, distributablePublication is B BY REFERENCE — the identical title never causes A\'s own instance to leak through as B\'s action target.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section H: distributablePublication is bound to the CURRENT resolution\'s own Publication instance by reference — identical content (title) between two distinct encounters never lets one\'s identity stand in for the other\'s.');

    // ===============================================================
    // Section I — THE FIX, proven live: a late in-flight action result,
    // superseded by a registry-only genuine change (no click), must never
    // become current state.
    // ===============================================================
    {
        const pubA = makePublication('pub-i536-a', 'I536-A');
        const registry = buildAmbiguityCapableRegistry(pubA);
        const source = new ImmediateMaterialSource({ [pubA.id]: pubA });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true }) });
        mountCanvas(canvas);

        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(canvas.distributablePublication === pubA, '1. setup: A is distributable.');

        // I1. Start a Snapshot Distribution against A; hold it pending.
        const distributeAttempt = deferred();
        canvas.snapshotDistributionCommand = () => distributeAttempt.promise;
        canvas.distributeSelectedSnapshot();
        assert(canvas.snapshotDistributionExecuting === true, '2. the call is genuinely in flight against A.');
        const requestIdAtClickTime = canvas.snapshotDistributionRequestId;

        // I2. A genuine change reaches refreshSelectionOutcome() with NO
        // selectEncounter() call anywhere on this path — a peer source
        // appears offering the SAME still-selected objectId, reclassifying
        // RESOLVED -> AMBIGUOUS.
        addPeerAmbiguity(registry, pubA, 'dave');
        assert(canvas.distributablePublication === null, '3. distributablePublication is already null — the Wanderer can no longer even click again.');

        // I3. THE FIX: the guard was already invalidated synchronously, in
        // the SAME branch, before A's own pending call ever settles.
        assert(canvas.snapshotDistributionRequestId !== requestIdAtClickTime,
            '4. THE FIX: snapshotDistributionRequestId was bumped by the genuine-change branch itself — the in-flight call\'s own guard is already stale before it ever resolves.');
        assert(canvas.snapshotDistributionExecuting === false, '5. THE FIX: snapshotDistributionExecuting was reset synchronously — the UI no longer even shows "Distributing…" for a resolution that no longer exists.');

        // I4. A's late result finally arrives. Without the fix, this
        // would write into snapshotDistributionResult/Executing, visibly
        // presenting evidence of a completed action against a resolution
        // the Wanderer's own selection has already moved past.
        distributeAttempt.resolve({ contentReference: { hash: 'stale-a-hash', uri: 'stale-a-uri' }, announcement: null });
        await flush();
        assert(canvas.snapshotDistributionResult === null,
            '6. THE FIX, proven: A\'s late-arriving result never became current state — snapshotDistributionResult stays null, never showing "stale-a-hash" under a resolution that has since moved on.');
        assert(canvas.snapshotDistributionExecuting === false, '7. snapshotDistributionExecuting still correctly reads false.');

        // I5. The identical proof for Distribute Publication's own error
        // path — a REJECTION arriving late must not surface as a current
        // notice either.
        const pubC = makePublication('pub-i536-c', 'I536-C');
        const registryC = buildAmbiguityCapableRegistry(pubC);
        const sourceC = new ImmediateMaterialSource({ [pubC.id]: pubC });
        const canvasC = buildCanvasInstance({ registry: registryC, materialSources: { local: sourceC }, materialVerifier: new MapVerifier({ [pubC.id]: true }) });
        mountCanvas(canvasC);
        canvasC.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubC.id });
        await flush();
        const distributionAttempt = deferred();
        canvasC.distributionCommand = () => distributionAttempt.promise;
        canvasC.distributeSelectedPublication();
        const distributionRequestIdAtClick = canvasC.distributionRequestId;
        addPeerAmbiguity(registryC, pubC, 'erin');
        assert(canvasC.distributionRequestId !== distributionRequestIdAtClick, '8. distributionRequestId is likewise bumped by the genuine-change branch.');
        distributionAttempt.reject(new Error('network failure'));
        await flush();
        assert(canvasC.distributionError === null,
            '9. THE FIX, proven for the error path too: a late REJECTION for a superseded resolution never surfaces as distributionError under the current (now different) state.');

        unmountCanvas(canvas);
        unmountCanvas(canvasC);
    }
    console.log('✓ Section I: THE FIX — a Distribute/Snapshot-Distribute action already in flight, superseded by a registry-only genuine change with NO click anywhere on that path, never writes its late result or error into now-current state. Both the success path (snapshotDistributionResult) and the error path (distributionError) are proven live.');

    // ===============================================================
    // Section J — Flagship: a realistic session, action safety proven
    // end to end through a mixed explicit-walk / registry-driven journey.
    // ===============================================================
    {
        const pubA = makePublication('pub-j536-a', 'J536-A');
        const pubB = makePublication('pub-j536-b', 'J536-B');
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: pubA.id, title: pubA.title }, { id: pubB.id, title: pubB.title }],
            placements: [
                { publicationId: pubA.id, position: { x: 0, y: 0, z: 0 } },
                { publicationId: pubB.id, position: { x: 1, y: 0, z: 1 } }
            ]
        }));
        const source = new ImmediateMaterialSource({ [pubA.id]: pubA, [pubB.id]: pubB });
        const canvas = buildCanvasInstance({ registry, materialSources: { local: source }, materialVerifier: new MapVerifier({ [pubA.id]: true, [pubB.id]: false }) });
        mountCanvas(canvas);

        // Encounter A: material available, verified, action available.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(canvas.distributablePublication === pubA && canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '1. Encounter A: verified and actionable.');

        // Start an action against A, hold it pending.
        const attempt = deferred();
        canvas.snapshotDistributionCommand = () => attempt.promise;
        canvas.distributeSelectedSnapshot();
        assert(canvas.snapshotDistributionExecuting === true, '2. A\'s own action is in flight.');

        // Select B — an EXPLICIT walk (selectEncounter()'s own existing
        // reset already covers this leg; reconfirmed as part of the
        // realistic flagship path).
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubB.id });
        assert(canvas.distributablePublication === null, '3. Action immediately becomes unavailable the instant B is selected.');
        assert(canvas.snapshotDistributionExecuting === false, '4. A\'s own in-flight action state was reset by the explicit walk.');
        attempt.resolve({ contentReference: { hash: 'a-hash', uri: 'a-uri' }, announcement: null });
        await flush();
        assert(canvas.snapshotDistributionResult === null, '5. A\'s late result never became B\'s state.');

        await flush();
        assert(canvas.materialInspection.selection.objectId === pubB.id
            && canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.REJECTED,
            '6. B resolves on its own — REJECTED, never A\'s VERIFIED.');
        assert(canvas.distributablePublication === pubB, '7. B\'s own state now determines actions.');

        // A registry-only ambiguity shift on B (no click) — the SAME class
        // of genuine change Section I proved, now inside the realistic
        // flagship path: start a second action against B, then supersede
        // it with no click at all.
        const secondAttempt = deferred();
        canvas.discoverSnapshotCommand = () => secondAttempt.promise;
        canvas.discoverSelectedSnapshot();
        assert(canvas.snapshotDiscoveryExecuting === true, '8. B\'s own Discover Snapshot action is in flight.');
        addPeerAmbiguity(registry, pubB, 'flynn');
        assert(canvas.distributablePublication === null, '9. B\'s own action becomes unavailable the instant the registry alone reclassifies its resolution, with no click.');
        secondAttempt.resolve({ outcome: 'PLACED', locator: 'somewhere' });
        await flush();
        assert(canvas.snapshotDiscoveryResult === null, '10. B\'s own late result, superseded with no click, never became current state either.');

        // Return to A: an explicit walk back, genuine, always fresh.
        canvas.selectEncounter({ kind: WorldEncounterKind.PUBLICATION, objectId: pubA.id });
        await flush();
        assert(canvas.materialInspection.selection.objectId === pubA.id
            && canvas.materialInspection.verification.status === WorldEncounterMaterialVerificationStatus.VERIFIED,
            '11. A\'s own actions become available again, freshly re-verified — never B\'s own REJECTED, never A\'s own long-abandoned pending attempt from step 2.');
        assert(canvas.distributablePublication === pubA, '12. FLAGSHIP: at every point across this journey, an action could only ever operate on state belonging to the currently selected encounter.');

        unmountCanvas(canvas);
    }
    console.log('✓ Section J: FLAGSHIP — across a realistic session mixing explicit walks and a mid-action, registry-only resolution shift with no click at all, an action was never available for, and never silently completed against, anything but the currently selected encounter.');

    console.log('\nAll World Encounter Action-State Boundary Product Reassessment tests passed.');

    console.log(`\n=== 0.9.536 VERDICT ===
ACTION_STATE_BOUNDARY_GAP_FOUND_AND_FIXED. This milestone's own question — can an action ever be presented or
enabled based on state that no longer belongs to the currently selected encounter — is answered: the one gate every
Distribute/Snapshot-Distribute/Discover-Snapshot action shares, distributablePublication, was ALREADY correct for
every case 0.9.535 proved (an explicit selectEncounter() walk, Sections B/C/D/E/F/G/H here reconfirm this holds for
every candidate shape, both selection sides, and the full verification table). But 0.9.535's own fix lived in
refreshSelectionOutcome() precisely because that method — not selectEncounter() — is the ONE place both an explicit
click and a bare registry notification both funnel through; the ephemeral Distribute/Snapshot-Distribute/
Discover-Snapshot execution/error/result/requestId state this milestone audited was reset only from
selectEncounter() itself, one level up, and so was NOT invalidated when a genuine resolvedEncounterSelection change
reached refreshSelectionOutcome() by registry notification alone (Section I, reproduced live: an action already in
flight against a resolution later reclassified RESOLVED<->AMBIGUOUS with no click anywhere on that path kept its
requestId guard unbumped, so its late result/error silently became state displayed under a since-moved-on
resolution). The fix is a direct, in-place duplication of the exact reset block selectEncounter() already ran,
added to refreshSelectionOutcome()'s own genuine-change branch — never an extraction into a shared method, since
several existing tests hand-assemble a fake canvas context from a hand-picked SUBSET of WorldEncounterCanvas.methods,
and a shared method would have silently changed selectEncounter()'s own dependency surface out from under every one
of them. No new state machine, cancellation infrastructure, or action-authorization framework was introduced
anywhere in this file or in the production fix; the Repository/Publication-identity/verification vocabulary from
0.9.532-0.9.535 is unchanged and untouched throughout.`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
