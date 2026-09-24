import { readFile } from 'node:fs/promises';

import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { ObserverLocalEncounterStore } from '../application/ObserverLocalEncounterStore.js';
import { describeObserverLocalPublicationEncounter } from '../core/ObserverLocalPublicationEncounter.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
import { registerMaterializedSnapshotWorldSource } from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { resolveSnapshotWorldPositionClaim } from '../application/SnapshotWorldPositionClaim.js';
import { SnapshotWorldPositionClaimOutcome } from '../application/SnapshotWorldPositionClaimOutcome.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { worldEncounterCanvasFiles } from './support/SourceFileGroups.js';

// 0.9.571 — Observer-Local / Authoritative Placement Presentation Closure
// Reassessment.
//
// TYPE: test-only. Production changes: none.
//
// 0.9.570 shipped the fix 0.9.569 located: `projectedObserverLocalEncounters`
// (ui/components/WorldEncounterCanvas.js) now suppresses an observer-local
// row whenever its `publicationId` already has an authoritative
// `publicationRows` entry (matched by `objectId`), and shipped its own
// ten-section regression suite,
// tests/SuppressObserverLocalGhostsAfterAuthoritativePlacement.test.js.
//
// DELIBERATELY SMALLER THAN THE PRECEDING AUDITS. 0.9.570's own suite
// already covers: the raw repro (Section B), identity-vs-coordinate and
// identity-vs-contentHash adversaries (C/D/E), inspection continuity (F),
// async/request-id race independence (G), session isolation (H), reactive
// un-suppression on placement removal (I), and a source-level guard against
// a new store seam or a `claimedPosition` read (J). 0.9.568's own amended
// Section K separately proved Open/Fork/Explore/Comment stay correct on
// BOTH the primary and the stale observer-local marker under a real,
// adversarial contentHash-collision fixture, with the authoritative
// PlacementRegistry byte-for-byte unchanged throughout, and its own Section
// L already walked a full discover → encounter → distribute → converge
// journey through real distribution/discovery machinery. This file does not
// repeat any of that — it cites it. What it adds is the one genuinely
// untested angle: whether the DISTINCT, entirely decentralized
// `claimedPosition` mechanism (application/SnapshotWorldPositionClaim.js)
// can, in fact, ever influence suppression — proven BEHAVIORALLY here
// (Section B), not merely by the source-text grep 0.9.570 Section J4 already
// ran — plus one closure-grade round-trip journey (Section C) and a verdict
// (Section D).
//
// CORE INVARIANT UNDER TEST (unchanged from 0.9.570): for a Publication P,
// its observer-local representation is projected only when P has no current
// authoritative placement (`publicationRows` entry, matched by `objectId`)
// in the active World. Nothing else — not `claimedPosition`, not
// coordinate agreement, not `contentHash` agreement — is permitted to
// affect that decision.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function flushMicrotasks() {
    await new Promise((resolve) => setTimeout(resolve, 0));
    for (let i = 0; i < 10; i++) {
        await Promise.resolve();
    }
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function readSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}
function codeOnly(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// ===================================================================
// Harness — identical to 0.9.570's own harness (tests/
// SuppressObserverLocalGhostsAfterAuthoritativePlacement.test.js), reused
// verbatim rather than re-invented, per this codebase's own established
// precedent for a closure/reassessment file sharing its predecessor's rig.
// ===================================================================

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

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
    console.log('Running Observer-Local / Authoritative Placement Presentation Closure Reassessment tests...\n');

    // =======================================================================
    // Section A — permanent regression witness.
    //
    // Re-runs 0.9.568 Section D's own original failure scenario end to end,
    // once, as the witness this milestone commits to keeping green forever.
    // Not new coverage — 0.9.570 Section B already proved this — restated
    // here as the flagship closure artifact for this specific arc.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const publication = makePublication({ id: 'closure-witness-pub', title: 'Closure Witness Publication', contentHash: 'hash-witness' });

        recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 5, y: 0, z: 5 } });
        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        assert(ctx.projectedObserverLocalEncounters.length === 1 && ctx.projectedPublications.length === 0,
            'A1. discover P while UNPLACED -> observer-local encounter -> "Discovered here" renders, alone.');

        const result = placeAuthoritatively(registry, publication, { x: 70, y: 0, z: 70 });
        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'A2. Setup: authoritative placement succeeds.');
        assert(ctx.projectedPublications.length === 1 && ctx.projectedObserverLocalEncounters.length === 0,
            'A3. authoritatively place P -> ONLY the authoritative representation remains; the 0.9.568 Section D duplicate does not recur.');
        unmountCanvas(ctx);
        console.log('✓ A: the original 0.9.568 Section D failure scenario, replayed end to end, is closed — this is the permanent regression witness for this arc.');
    }

    // =======================================================================
    // Section B — claimed-position independence, proven behaviorally.
    //
    // NEW coverage: 0.9.570 Section J4 confirmed, by reading source text,
    // that the filter body never mentions `claimedPosition`. This section
    // proves the same fact behaviorally, exercising the real, independent
    // `resolveSnapshotWorldPositionClaim()` across all four combinations of
    // {claim present/absent} x {authoritative placement present/absent} on
    // one Publication and confirming ONLY the placement axis ever moves the
    // observer-local projection.
    // =======================================================================
    {
        function candidateFor(publication, claimedPosition) {
            const candidate = { contentHash: publication.contentHash, locator: `local://${publication.id}`, storage: 'local' };
            if (claimedPosition) {
                candidate.publicationId = publication.id;
                candidate.claimedPosition = claimedPosition;
            }
            return candidate;
        }

        // B1 — claim absent, placement absent: marker visible.
        {
            const registry = new WorldDiscoverySourceRegistry();
            const store = new ObserverLocalEncounterStore();
            const publication = makePublication({ id: 'closure-claim-b1', title: 'Closure Claim B1', contentHash: 'hash-claim-b1' });
            recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 1, y: 0, z: 1 } });
            const claim = resolveSnapshotWorldPositionClaim(candidateFor(publication, null), publication.id);
            assert(claim.outcome === SnapshotWorldPositionClaimOutcome.ABSENT, 'B1a. Setup: no claim was made.');

            const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
            mountCanvas(ctx);
            assert(ctx.projectedObserverLocalEncounters.length === 1, 'B1b. claimedPosition ABSENT, PlacementRecord ABSENT -> visible.');
            unmountCanvas(ctx);
        }

        // B2 — claim present, placement absent: marker STILL visible. This
        // is the row that actually tests something: application/
        // SnapshotWorldPositionClaim.js's own header states a claim is
        // "never... a commitment to place" and is consumed only by an
        // explicit, person-initiated OwnPublicationPanel action — never
        // automatically. Resolving a real, CLAIMED, well-formed claim here
        // and never feeding it into `registry` proves that non-automaticity
        // holds all the way through to this presentation layer.
        {
            const registry = new WorldDiscoverySourceRegistry();
            const store = new ObserverLocalEncounterStore();
            const publication = makePublication({ id: 'closure-claim-b2', title: 'Closure Claim B2', contentHash: 'hash-claim-b2' });
            recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 2, y: 0, z: 2 } });
            const claim = resolveSnapshotWorldPositionClaim(candidateFor(publication, { x: 33, y: 0, z: 33 }), publication.id);
            assert(claim.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED && claim.position.x === 33,
                'B2a. Setup: a real, well-formed claim resolves CLAIMED for this exact publicationId.');

            const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
            mountCanvas(ctx);
            assert(ctx.projectedObserverLocalEncounters.length === 1,
                'B2b. claimedPosition PRESENT (and CLAIMED), PlacementRecord ABSENT -> still visible — a resolved claim, by itself, is never treated as a placement.');
            unmountCanvas(ctx);
        }

        // B3 — claim absent, placement present: marker suppressed.
        {
            const registry = new WorldDiscoverySourceRegistry();
            const store = new ObserverLocalEncounterStore();
            const publication = makePublication({ id: 'closure-claim-b3', title: 'Closure Claim B3', contentHash: 'hash-claim-b3' });
            recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 3, y: 0, z: 3 } });
            placeAuthoritatively(registry, publication, { x: 44, y: 0, z: 44 });

            const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
            mountCanvas(ctx);
            assert(ctx.projectedObserverLocalEncounters.length === 0, 'B3a. claimedPosition ABSENT, PlacementRecord PRESENT -> suppressed.');
            unmountCanvas(ctx);
        }

        // B4 — claim present AND placement present, independently: marker
        // suppressed — by the placement, never by the claim (B2 already
        // proved the claim alone cannot do it).
        {
            const registry = new WorldDiscoverySourceRegistry();
            const store = new ObserverLocalEncounterStore();
            const publication = makePublication({ id: 'closure-claim-b4', title: 'Closure Claim B4', contentHash: 'hash-claim-b4' });
            recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 4, y: 0, z: 4 } });
            const claim = resolveSnapshotWorldPositionClaim(candidateFor(publication, { x: 55, y: 0, z: 55 }), publication.id);
            assert(claim.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, 'B4a. Setup: the claim resolves CLAIMED here too.');
            placeAuthoritatively(registry, publication, { x: 44, y: 0, z: 44 }); // deliberately disagrees with claim.position

            const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
            mountCanvas(ctx);
            assert(ctx.projectedObserverLocalEncounters.length === 0,
                'B4b. claimedPosition PRESENT, PlacementRecord PRESENT -> suppressed — and, per B2, this is entirely attributable to the placement axis.');
            unmountCanvas(ctx);
        }

        // Structural close: WorldEncounterCanvas.js never even imports the
        // claim-resolution module — the two mechanisms are not merely
        // "not wired together today," they are structurally incapable of
        // interacting.
        const canvasSource = codeOnly((await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n'));
        assert(!canvasSource.includes('SnapshotWorldPositionClaim') && !canvasSource.includes('claimedPosition'),
            'B5. ui/components/WorldEncounterCanvas.js neither imports application/SnapshotWorldPositionClaim.js nor reads claimedPosition anywhere in its own source — the independence B1-B4 exercised behaviorally is also structural, not incidental.');

        console.log('✓ B: across all four combinations of {claimedPosition present/absent} x {authoritative PlacementRecord present/absent}, exercised against a REAL resolveSnapshotWorldPositionClaim() call, only the PlacementRecord axis ever moves the observer-local projection — proven behaviorally, and confirmed structurally impossible to violate.');
    }

    // =======================================================================
    // Section C — flagship round-trip walk.
    //
    // One coherent Wanderer journey, run through TWO full placement/removal
    // cycles rather than one (0.9.570 Section I only exercised a single
    // placed -> removed transition). Open/Fork/Explore/Comment on the
    // observer-local marker, across convergence, are exercised here too —
    // 0.9.570 Section F exercised only Open; 0.9.568's own amended Section K
    // already put Fork/Explore/Comment through a harder, contentHash-
    // colliding adversarial fixture with a real PlacementRegistry, cited
    // rather than repeated — this section's own job is the coherent,
    // ordinary-path journey, not a second adversarial pass.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const contentHash = 'closure-walk-hash';
        const publication = makePublication({ id: 'closure-walk-pub', title: 'Closure Walk Publication', contentHash });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publication.id]: true });

        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();

        const openPublicationCommand = commandSpy();
        const forkPublicationCommand = commandSpy();
        const explorePublicationCommand = commandSpy();
        const getPublicationCommentariesCommand = (publicationId) => [{ commentaryId: 'walk-c1', publicationId, content: 'hi', authorIdentityId: 'bob' }];

        const ctx = buildCanvasInstance({
            registry, observerLocalEncounterRegistry: store, materialSources: { local: localSource }, materialVerifier: verifier,
            openPublicationCommand, forkPublicationCommand, explorePublicationCommand, getPublicationCommentariesCommand
        });
        mountCanvas(ctx);

        // Walk -> discover P.
        recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash, position: { x: 8, y: 0, z: 8 } });
        assert(ctx.projectedObserverLocalEncounters.length === 1, 'C1. Walk -> discover P -> observer-local encounter renders.');

        // Inspect P.
        ctx.selectObserverLocalEncounter({ publicationId: publication.id, contentHash });
        await flushMicrotasks();
        assert(ctx.observerLocalEncounterActionablePublication && ctx.observerLocalEncounterActionablePublication.id === publication.id,
            'C2. Inspect P -> resolves to the real Publication.');
        ctx.toggleObserverLocalEncounterCommentary();
        await flushMicrotasks();
        assert(ctx.observerLocalEncounterCommentaryPublicationId === publication.id && ctx.observerLocalEncounterCommentaries.length === 1,
            'C3. Commentary, opened while still unplaced, resolves keyed to the correct publicationId.');

        // P becomes authoritatively placed (first cycle).
        const firstPlacement = placeAuthoritatively(registry, publication, { x: 80, y: 0, z: 80 });
        assert(firstPlacement.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'C4. Setup: first authoritative placement succeeds.');
        assert(ctx.projectedPublications.length === 1 && ctx.projectedObserverLocalEncounters.length === 0,
            'C5. Ghost disappears -> only the authoritative marker remains.');
        assert(ctx.selectedObserverLocalEncounter !== null && ctx.observerLocalEncounterActionablePublication.id === publication.id,
            'C6. Inspection remains -> the still-open panel keeps resolving to the same, correct Publication.');

        // Open/Fork/Explore/Comment, from the now-stale-but-still-open
        // inspection panel, all remain correct after convergence.
        ctx.openObserverLocalEncounterPublication();
        ctx.forkObserverLocalEncounterPublication();
        ctx.exploreObserverLocalEncounterPublication();
        assert(openPublicationCommand.calls.length === 1 && openPublicationCommand.calls[0][0].id === publication.id, 'C7. Open still resolves correctly after convergence.');
        assert(forkPublicationCommand.calls.length === 1 && forkPublicationCommand.calls[0][0].id === publication.id, 'C8. Fork still resolves correctly after convergence.');
        assert(explorePublicationCommand.calls.length === 1 && explorePublicationCommand.calls[0][0].id === publication.id, 'C9. Explore still resolves correctly after convergence.');
        ctx.refreshObserverLocalEncounterCommentaries();
        assert(ctx.observerLocalEncounterCommentaries.length === 1, 'C10. Comment still resolves correctly after convergence.');

        // The primary marker's own selection is independently actionable
        // too — convergence produced a real, ordinary primary marker, not
        // a placeholder.
        ctx.selectEncounter({ kind: 'PUBLICATION', objectId: publication.id });
        assert(ctx.selectionOutcome.status === 'RESOLVED', 'C11. The authoritative marker itself also selects normally.');

        // Walk away: the placement is removed (an existing, unrelated
        // lifecycle path — never something this filter itself triggers).
        removeAuthoritativePlacement(registry, publication);
        assert(ctx.projectedPublications.length === 0 && ctx.projectedObserverLocalEncounters.length === 1,
            'C12. Walk away -> placement removed -> the observer-local marker reappears.');

        // Return: re-placed a SECOND time. Proves the filter round-trips
        // repeatedly, not merely once.
        const secondPlacement = placeAuthoritatively(registry, publication, { x: 90, y: 0, z: 90 });
        assert(secondPlacement.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'C13. Setup: second authoritative placement succeeds.');
        assert(ctx.projectedPublications.length === 1 && ctx.projectedObserverLocalEncounters.length === 0,
            'C14. Return -> re-placed -> the authoritative representation remains, suppressing the ghost again — a second, independent convergence, not a one-shot flag left over from the first.');

        unmountCanvas(ctx);
        console.log('✓ C: one coherent walk -> discover -> inspect -> place -> ghost disappears -> inspection (and every cross-surface action reachable from it) remains -> walk away -> return -> re-place, run through TWO full convergence cycles, stays correct throughout.');
    }

    // =======================================================================
    // Section D — verdict.
    // =======================================================================
    {
        const classifications = [
            ['Is the ghost-marker arc (0.9.568 Section D\'s own finding) closed?', 'CONFIRMED — Section A: the original failure scenario, replayed end to end, no longer reproduces.'],
            ['Can `claimedPosition`, by itself, ever suppress or resurrect an observer-local marker?', 'NO — Section B: proven across all four presence/absence combinations against a real resolveSnapshotWorldPositionClaim() call, and structurally confirmed absent from WorldEncounterCanvas.js\'s own source.'],
            ['Does suppression survive a realistic full journey, including a SECOND independent convergence?', 'YES — Section C: discover, inspect, place, walk away, and re-place all resolve correctly, with every cross-surface action (Open/Fork/Explore/Comment) remaining correct throughout.'],
            ['Is suppression reactive in both directions and session-isolated?', 'ALREADY CONFIRMED — 0.9.570 Sections H/I, not re-tested here.'],
            ['Do Open/Fork/Explore/Comment stay correct on both markers under an adversarial contentHash collision, with the PlacementRegistry left byte-for-byte unchanged?', 'ALREADY CONFIRMED — 0.9.568\'s own amended Section K, not re-tested here.'],
            ['Does a real, distributed discover -> encounter -> convergence journey (through actual distribution/discovery machinery, not this file\'s lightweight harness) already exist?', 'ALREADY CONFIRMED — 0.9.568\'s own amended Section L, not re-tested here.'],
            ['Is there a new store lifecycle seam, or any other change outside the one seam 0.9.569 located?', 'NO — ALREADY CONFIRMED — 0.9.570 Section J, not re-tested here.']
        ];
        for (const [question, verdict] of classifications) {
            assert(typeof question === 'string' && typeof verdict === 'string' && verdict.length > 0, `D. classification entry malformed: ${question}`);
        }
        console.log('\nCLOSURE_REASSESSMENT complete. Verdict table:');
        for (const [question, verdict] of classifications) {
            console.log(`  - ${question}\n    -> ${verdict}`);
        }

        console.log(`
PRODUCT_COMPLETE. No additional production work is warranted by this
milestone. The architecture this sequence converged on:

  PlacementRecord           = authoritative, persistent World state
  claimedPosition            = publisher-originated, decentralized claim
                                (never automatically consumed, never a
                                 commitment to place — Section B)
  ObserverLocalEncounter     = observer-originated, session-local, ephemeral
  projectedObserverLocalEncounters
                              = a presentation projection that yields to
                                authority, and to authority alone

is a stable, closed endpoint for this arc:

  0.9.565  Position-claim boundary audit
      v
  0.9.566  Distribute existing claim
      v
  0.9.567  Distributed claim E2E
      v
  0.9.568  Spatial continuity reassessment
      v
  0.9.569  Convergence boundary audit
      v
  0.9.570  Suppress observer-local ghost
      v
  0.9.571  Closure reassessment
      v
            STOP

This milestone recommends against opening any further work in this specific
area purely because more architecture could theoretically be added.`);

        console.log('\n✅ All Observer-Local / Authoritative Placement Presentation Closure Reassessment tests passed.');
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
