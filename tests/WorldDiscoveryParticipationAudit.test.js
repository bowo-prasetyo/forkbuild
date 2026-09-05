import { readFile } from 'node:fs/promises';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoveryRegistry } from '../application/WorldDiscoveryRegistryProjection.js';
import { describeLocalWorldDiscoverySource, LOCAL_WORLD_DISCOVERY_ORIGIN } from '../application/WorldEncounterIntegration.js';
import { describePeerWorldDiscoverySource, derivePeerWorldOrigin } from '../peer/PeerWorldDataIngress.js';
import { bootstrapWorldDiscoveryRuntime } from '../application/WorldDiscoveryRuntimeBootstrap.js';
import {
    registerMaterializedSnapshotWorldSource,
    materializedSnapshotWorldOrigin
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { deriveWorldEncounters, WorldEncounterKind } from '../core/WorldEncounter.js';
import { describeWorldEncounterSelectionIdentity } from '../core/WorldEncounterSelectionIdentity.js';
import {
    loadWorldEncounterMaterial,
    WorldEncounterMaterialSource,
    WorldEncounterMaterialLoadStatus
} from '../application/WorldEncounterMaterialLoading.js';
import { Publication } from '../publisher/Publication.js';

// 0.9.165 — World Discovery Participation Audit.
//
// 0.9.150 through 0.9.164 answered a VERTICAL question one seam at a time:
// can a single Snapshot travel DISCOVER -> SELECT -> RESOLVE -> VERIFY ->
// ATTRIBUTE -> MATERIALIZE -> PLACE -> REGISTER -> RENDER, and does every
// identity along that path stay exactly what it claims to be? Both audits
// (0.9.162, 0.9.164) passed. This milestone asks the wider, HORIZONTAL
// question those two audits deliberately left unasked:
//
//   "Now that Snapshot material can participate in the World exactly like
//    other World-discovered material, is the overall World discovery
//    model coherent when local, peer, and Snapshot sources all
//    participate simultaneously — through the REAL composition root,
//    under REAL concurrent membership changes, and across every existing
//    read path over the registry, not only the one 0.9.161 rendered?"
//
// TEST-ONLY, BY DESIGN — EXACTLY LIKE 0.9.162 AND 0.9.164. Every file this
// milestone touches lives under `tests/` alone (Section G's own structural
// sweep). Where an earlier audit already proved an invariant (0.9.162's
// three-source coexistence, 0.9.164's identity chain), this file does not
// re-run that proof — it reads real, unmodified production code for
// seams NEITHER prior audit exercised, and characterizes what it finds.
// Per the brief that requested this milestone: found defects are PROVEN
// and NAMED, never fixed here — closing a genuine gap is separate, later,
// unscheduled work, exactly as 0.9.163 was separate from 0.9.162.
//
//   Section A: composition-root coexistence — local (bootstrapped once,
//              0.9.14), peer, and Snapshot (0.9.160) all reach one
//              rendered canvas through the REAL `bootstrapWorldDiscoveryRuntime()`
//              entry point, never a hand-built registry alone.
//   Section B: concurrent lifecycle — register all three, then unregister
//              peer, replace Snapshot, and replace local, one step at a
//              time, against one already-mounted canvas. Every step's own
//              effect is checked BOTH behaviorally (the canvas's own
//              projection) and structurally (reference-equality on every
//              OTHER origin's own untouched registry entry).
//   Section C: THE TWO-PROJECTION ASYMMETRY — the same publicationId,
//              contributed by all three sources, read through both
//              existing projections this codebase already has: the
//              COMBINED one (`describeWorldFromDiscoveryRegistry()`,
//              0.9.8/0.9.10) that `WorldEncounterCanvas` actually renders,
//              and the PER-SOURCE one (0.9.19's own
//              `deriveWorldEncounters()`-per-source mechanism) that backs
//              multi-origin selection disambiguation. `anchorCount` is
//              cross-source-blended in the first and strictly per-origin
//              in the second — both already correct at their OWN,
//              separately documented, layer; this section is the first
//              place both are measured side by side.
//   Section D: local lifecycle parity — the registry itself has no
//              special case for `'local'`: it is exactly as replaceable
//              and removable as `'peer:*'`/`'snapshot:*'`, even though
//              the real, running composition root (0.9.14) only ever sets
//              it once and never replaces or removes it live. Registry
//              generality and production usage are two different facts;
//              this section names the gap between them without closing it.
//   Section E: rendering uniformity, precisely scoped — no source-family
//              branching (`origin === 'local'`, `.startsWith('peer:')`,
//              `.startsWith('snapshot:')`) exists anywhere in the actual
//              encounter-marker rendering pipeline, confirmed as a
//              structural sweep over exactly the computed properties that
//              produce a rendered marker — deliberately narrower than a
//              whole-file sweep, because this file's own two other
//              legitimate `origin` vocabularies (material provenance
//              display, decentralized lead selection) are NOT part of
//              this claim and must not be mistaken for a violation of it.
//   Section F: THE GENUINE GAP THIS AUDIT FOUND — FIXED BY 0.9.166. A
//              materialized, registered, rendered Snapshot's own resolved
//              selection could never load its material through
//              `application/WorldEncounterMaterialLoading.js`'s ordinary
//              `loadWorldEncounterMaterial()` path. That file's own
//              `materialSourceFor()` (0.9.21) recognized exactly two
//              origin families — `origin === 'local'` and
//              `origin.startsWith('peer:')` — predating Snapshot's own
//              arrival as a World source family by over a hundred
//              milestones. A `"snapshot:<contentHash>:<publicationId>"`
//              origin matched neither branch, so `loadWorldEncounterMaterial()`
//              reported `UNAVAILABLE` unconditionally for it. This
//              milestone did not fix it — 0.9.166 did, adding exactly one
//              more branch to `materialSourceFor()` that routes a
//              `snapshot:*` origin to the SAME `materialSources.local`
//              slot `origin === 'local'` already uses (see that file's own
//              0.9.166 header for why). Section F below is UPDATED,
//              post-0.9.166, to confirm the fix directly against the same
//              real function: a registered Snapshot's own resolved
//              selection now loads through `materialSources.local`, never
//              through a separate `snapshot`-named slot — see
//              `tests/SnapshotWorldEncounterMaterialLoading.test.js` for
//              that fix's own dedicated test contract.
//   Section G: structural sweep — this milestone adds no production file,
//              and no dedup/reconciliation/merge/trust/ranking vocabulary
//              anywhere it touches.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function placedResult(contentHash, publicationId, position, placementId = 'placement-x') {
    return { outcome: SnapshotWorldPlacementOutcome.PLACED, contentHash, publicationId, placementId, position, reason: null };
}

// Reproduces ui/views/WorldView.js's own real wiring by hand — identical to
// tests/SnapshotWorldConvergenceAudit.test.js's and tests/
// SnapshotWorldSourceIdentityAudit.test.js's own buildCanvasInstance().
function buildCanvasInstance({ registry = null, view } = {}) {
    const ctx = {
        registry,
        view: view !== undefined ? view : WorldEncounterCanvas.props.view.default()
    };
    Object.assign(ctx, WorldEncounterCanvas.data.call(ctx));
    Object.assign(ctx, WorldEncounterCanvas.methods);
    return ctx;
}

function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

function projectedPublicationsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}

function peer(identityId) {
    return { remoteIdentity: { identityId } };
}

// `WorldEncounterCanvas`'s own `projectedPublications` computed property
// (0.9.1) intentionally exposes only `{ objectId, label, x, y }` — `x`/`y`
// there are SCREEN-projected coordinates (`projectToCanvas(row.x)`/
// `projectToCanvas(row.z)`), not the raw World position, and `z`/
// `anchorCount`/`placementCount` are dropped entirely. Position assertions
// in this file read the raw, unprojected reading instead — the exact same
// `describeWorldFromDiscoveryRegistry()` result `WorldEncounterCanvas`'s
// own `worldView` data property already holds (0.9.10) — while count/
// objectId-presence/liveness assertions still read the real, mounted
// canvas's own `projectedPublications`, so both what-is-observable and
// what-is-rendered are each checked through their own real mechanism.
function viewById(registry) {
    const view = describeWorldFromDiscoveryRegistry(registry);
    return Object.fromEntries(view.publications.map((p) => [p.objectId, p]));
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — composition-root coexistence: local (bootstrapped once,
    // 0.9.14), peer, and Snapshot (0.9.160) all reach one rendered canvas
    // through the REAL bootstrapWorldDiscoveryRuntime() entry point.
    // ---------------------------------------------------------------
    {
        const bootstrap = bootstrapWorldDiscoveryRuntime({
            localWorldDiscoveryRecords: {
                publications: [{ id: 'pub-boot-local', title: 'Boot Local' }],
                placements: [{ publicationId: 'pub-boot-local', position: { x: 5, y: 0, z: 5 } }]
            }
        });
        const { registry } = bootstrap;
        assert(registry.listSources().length === 1 && registry.listSources()[0].origin === LOCAL_WORLD_DISCOVERY_ORIGIN,
            '1. sanity — bootstrapWorldDiscoveryRuntime() registers exactly the local source, under 0.9.8\'s own origin constant');

        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-boot-peer', title: 'Boot Peer' }],
            placements: [{ publicationId: 'pub-boot-peer', position: { x: 6, y: 0, z: 6 } }]
        }, peer('did:key:zBootPeer')));

        const publication = new Publication({ id: 'pub-boot-snapshot', title: 'Boot Snapshot' });
        const registration = registerMaterializedSnapshotWorldSource(
            registry, placedResult('hash-boot', 'pub-boot-snapshot', { x: 7, y: 0, z: 7 }), publication
        );
        assert(registration.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, '2. the Snapshot registers successfully against the SAME bootstrapped registry');

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const projected = projectedPublicationsOf(canvas);
        assert(projected.length === 3, `3. all three sources — bootstrapped local, live peer, registered Snapshot — reach the SAME rendered canvas; got ${projected.length}`);
        const byId = Object.fromEntries(projected.map((p) => [p.objectId, p]));
        assert(byId['pub-boot-local'] && byId['pub-boot-peer'] && byId['pub-boot-snapshot'], '4. every one of the three Publications is present under its own objectId');

        unmountCanvas(canvas);
        bootstrap.dispose();
        console.log('✓ Section A: composition-root coexistence — local (via the real bootstrap), a live peer, and a registered Snapshot all reach one rendered canvas through the real, unmodified 0.9.14 entry point');
    }

    // ---------------------------------------------------------------
    // Section B — concurrent lifecycle: register all three, then
    // unregister peer, replace Snapshot, and replace local, one step at a
    // time, against one already-mounted canvas — checked both
    // behaviorally and via reference-equality on every untouched entry.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        let notifyCount = 0;
        registry.subscribe(() => { notifyCount += 1; });

        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        assert(projectedPublicationsOf(canvas).length === 0, '1. an already-mounted canvas over an empty registry shows nothing');

        // Step 1 — register local.
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-conc-1', title: 'Concurrent Local' }],
            placements: [{ publicationId: 'pub-conc-1', position: { x: 1, y: 0, z: 1 } }]
        }));
        assert(notifyCount === 1, '2. registering local notifies exactly once');
        assert(projectedPublicationsOf(canvas).length === 1, '3. the already-mounted canvas reflects it with zero further action');

        // Step 2 — register peer.
        registry.setSource(describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-conc-2', title: 'Concurrent Peer' }],
            placements: [{ publicationId: 'pub-conc-2', position: { x: 2, y: 0, z: 2 } }]
        }, peer('did:key:zConc')));
        assert(notifyCount === 2, '4. registering peer notifies exactly once more');
        assert(projectedPublicationsOf(canvas).length === 2, '5. the canvas now shows both');

        // Step 3 — register Snapshot.
        const snapshotPublication = new Publication({ id: 'pub-conc-3', title: 'Concurrent Snapshot' });
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-conc-1', 'pub-conc-3', { x: 3, y: 0, z: 3 }), snapshotPublication);
        assert(notifyCount === 3, '6. registering the Snapshot notifies exactly once more');
        let projected = projectedPublicationsOf(canvas);
        assert(projected.length === 3, '7. the canvas now shows all three, each at its own position');
        let byIdView = viewById(registry);
        assert(byIdView['pub-conc-1'].x === 1 && byIdView['pub-conc-2'].x === 2 && byIdView['pub-conc-3'].x === 3, '8. every position is exactly its own contributor\'s, none overwritten by another\'s registration');

        // Capture reference identity of the local and Snapshot entries
        // BEFORE unregistering peer, so their own untouched-ness can be
        // proven by `===`, never merely by re-reading the same values.
        const localEntryBeforePeerRemoval = registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN);
        const snapshotOriginConc = materializedSnapshotWorldOrigin('hash-conc-1', 'pub-conc-3');
        const snapshotEntryBeforePeerRemoval = registry.listSources().find((s) => s.origin === snapshotOriginConc);

        // Step 4 — unregister peer.
        registry.removeSource(derivePeerWorldOrigin(peer('did:key:zConc')));
        assert(notifyCount === 4, '9. unregistering peer notifies exactly once more');
        projected = projectedPublicationsOf(canvas);
        assert(projected.length === 2, `10. only peer's own contribution disappears; got ${projected.length}`);
        let byId = Object.fromEntries(projected.map((p) => [p.objectId, p]));
        assert(!byId['pub-conc-2'] && byId['pub-conc-1'] && byId['pub-conc-3'], '11. local and Snapshot both survive peer\'s own removal, untouched');
        assert(registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN) === localEntryBeforePeerRemoval,
            '12. THE ISOLATION PROOF — local\'s own registry entry is the exact SAME object reference after peer\'s removal, never replaced, cloned, or touched');
        assert(registry.listSources().find((s) => s.origin === snapshotOriginConc) === snapshotEntryBeforePeerRemoval,
            '13. THE ISOLATION PROOF — the Snapshot\'s own registry entry is likewise the exact SAME object reference after peer\'s removal');

        // Step 5 — replace Snapshot (SAME contentHash+publicationId pair,
        // hence the SAME derived origin per 0.9.163 — a re-materialization
        // reporting a moved position, exercising the in-place "replacement,
        // not accumulation" path rather than a fresh slot).
        const localEntryBeforeSnapshotReplace = registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN);
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-conc-1', 'pub-conc-3', { x: 33, y: 0, z: 33 }), snapshotPublication);
        assert(notifyCount === 5, '14. replacing the Snapshot notifies exactly once more');
        projected = projectedPublicationsOf(canvas);
        assert(projected.length === 2, '15. re-registering the SAME contentHash+publicationId pair replaces in place — still exactly two encounters, never a third');
        byIdView = viewById(registry);
        assert(byIdView['pub-conc-3'].x === 33, '16. the replaced Snapshot registration\'s own new position takes effect');
        assert(registry.listSources().find((s) => s.origin === LOCAL_WORLD_DISCOVERY_ORIGIN) === localEntryBeforeSnapshotReplace,
            '17. local\'s own entry is untouched, by reference, across the Snapshot\'s own in-place replacement');

        // Step 6 — replace local (new records entirely, including a
        // second Publication).
        const snapshotEntryBeforeLocalReplace = registry.listSources().find((s) => s.origin === snapshotOriginConc);
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [
                { id: 'pub-conc-1', title: 'Concurrent Local Moved' },
                { id: 'pub-conc-4', title: 'Concurrent Local New' }
            ],
            placements: [
                { publicationId: 'pub-conc-1', position: { x: 100, y: 0, z: 100 } },
                { publicationId: 'pub-conc-4', position: { x: 4, y: 0, z: 4 } }
            ]
        }));
        assert(notifyCount === 6, '18. replacing local notifies exactly once more');
        projected = projectedPublicationsOf(canvas);
        assert(projected.length === 3, `19. local\'s replacement is reflected in full (two Publications now), alongside the untouched Snapshot registration; got ${projected.length}`);
        byIdView = viewById(registry);
        assert(byIdView['pub-conc-1'].x === 100 && byIdView['pub-conc-4'] && byIdView['pub-conc-4'].x === 4, '20. local\'s own replacement took full effect');
        assert(registry.listSources().find((s) => s.origin === snapshotOriginConc) === snapshotEntryBeforeLocalReplace,
            '21. THE ISOLATION PROOF, SYMMETRIC — the Snapshot\'s own entry is untouched, by reference, across local\'s own replacement');

        // Step 7 — clear.
        registry.clear();
        assert(notifyCount === 7, '22. clear() notifies exactly once');
        assert(projectedPublicationsOf(canvas).length === 0, '23. the already-mounted canvas reflects the fully cleared registry with zero further action');

        unmountCanvas(canvas);
        console.log('✓ Section B: concurrent lifecycle — register/unregister/replace, interleaved across local, peer, and Snapshot, each notifies exactly once, and every operation\'s effect is provably scoped to its own origin — proven by reference equality on every OTHER origin\'s untouched registry entry, live through one already-mounted canvas throughout');
    }

    // ---------------------------------------------------------------
    // Section C — THE TWO-PROJECTION ASYMMETRY: the same publicationId,
    // contributed by all three sources, read through both existing
    // projections this codebase already has.
    // ---------------------------------------------------------------
    {
        const localSource = describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-shared-count', title: 'Local Count' }],
            placements: [{ publicationId: 'pub-shared-count', position: { x: 1, y: 0, z: 1 } }],
            anchors: [{ publicationId: 'pub-shared-count' }, { publicationId: 'pub-shared-count' }]
        });
        const peerSource = describePeerWorldDiscoverySource({
            publications: [{ id: 'pub-shared-count', title: 'Peer Count' }],
            placements: [{ publicationId: 'pub-shared-count', position: { x: 2, y: 0, z: 2 } }]
        }, peer('did:key:zCount'));

        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(localSource);
        registry.setSource(peerSource);
        const snapshotPublication = new Publication({ id: 'pub-shared-count', title: 'Snapshot Count' });
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-count', 'pub-shared-count', { x: 3, y: 0, z: 3 }), snapshotPublication);
        const snapshotOrigin = materializedSnapshotWorldOrigin('hash-count', 'pub-shared-count');
        const snapshotSource = registry.listSources().find((s) => s.origin === snapshotOrigin);

        // THE COMBINED PROJECTION — what WorldEncounterCanvas actually
        // renders (application/WorldDiscoveryRegistryProjection.js, 0.9.10,
        // via application/WorldEncounterIntegration.js, 0.9.8).
        const combinedView = describeWorldFromDiscoveryRegistry(registry);
        assert(combinedView.publications.length === 3, `1. sanity — three sources sharing one publicationId still produce three encounters (0.9.162's own established finding); got ${combinedView.publications.length}`);
        assert(combinedView.publications.every((p) => p.anchorCount === 2),
            `2. THE COMBINED PROJECTION BLENDS ANCHOR COUNTS ACROSS SOURCES — every one of the three encounters reports anchorCount === 2, including the peer- and Snapshot-sourced rows that each contributed ZERO anchors of their own, because core/WorldEncounter.js#deriveWorldEncounters() counts anchors against the FULLY ASSEMBLED (all-sources-concatenated) anchor list, filtered by publicationId alone — never scoped to which source's own placement produced a given encounter; got ${JSON.stringify(combinedView.publications.map((p) => p.anchorCount))}`);

        // THE PER-SOURCE PROJECTION — the mechanism 0.9.19's own
        // core/WorldEncounterSelectionIdentity.js#deriveWorldEncounterSelectionIdentities()
        // already uses internally for multi-origin selection
        // disambiguation: deriveWorldEncounters() called ONCE PER SOURCE,
        // on that source's own six arrays alone — reproduced here directly
        // (same real function, same real per-source inputs) so this
        // section can compare an actual number against Section C's own
        // combined one above, not merely cite that file's own header.
        const localOwnEncounters = deriveWorldEncounters(localSource);
        const peerOwnEncounters = deriveWorldEncounters(peerSource);
        const snapshotOwnEncounters = deriveWorldEncounters(snapshotSource);
        assert(localOwnEncounters.publications[0].anchorCount === 2, '3. local\'s OWN per-source reading reports its own two anchors');
        assert(peerOwnEncounters.publications[0].anchorCount === 0, '4. THE ASYMMETRY, MADE CONCRETE — peer\'s OWN per-source reading reports anchorCount 0 (peer contributed none), even though the SAME publicationId reads anchorCount 2 in the combined projection above');
        assert(snapshotOwnEncounters.publications[0].anchorCount === 0, '5. the Snapshot\'s OWN per-source reading likewise reports anchorCount 0 — the Snapshot bridge never contributes an anchor record of any kind');

        // Both readings are individually correct, at their own documented
        // layer (0.9.8/0.9.10 vs 0.9.19) — this section's own finding is
        // that they now visibly disagree with each other for the FIRST
        // time a three-source, shared-publicationId scenario is actually
        // constructed and measured, something no single-family Snapshot
        // audit (0.9.162, 0.9.164) ever had reason to compute.
        assert(WorldEncounterKind.PUBLICATION === 'PUBLICATION', '6. sanity — the shared kind enum used by both projections is unchanged');
        console.log('✓ Section C: the two-projection asymmetry — the SAME publicationId, contributed by local/peer/Snapshot together, reports a cross-source-blended anchorCount (2) through the combined projection WorldEncounterCanvas renders, and a strictly per-origin anchorCount (2/0/0) through the per-source projection multi-origin selection already uses — both correct at their own layer, never previously measured side by side');
    }

    // ---------------------------------------------------------------
    // Section D — local lifecycle parity: the registry has no special
    // case for 'local'; it is exactly as replaceable/removable as any
    // other origin, even though production (0.9.14) never exercises that.
    // ---------------------------------------------------------------
    {
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-local-lifecycle', title: 'Local Lifecycle One' }],
            placements: [{ publicationId: 'pub-local-lifecycle', position: { x: 1, y: 0, z: 1 } }]
        }));
        assert(registry.listSources().length === 1 && registry.listSources()[0].origin === 'local', '1. sanity — local occupies the plain string origin \'local\', structurally identical to any other slot key');

        // REPLACE — a second setSource() call under the same 'local'
        // origin replaces it outright, exactly like 'peer:*'/'snapshot:*'
        // (0.9.9's own "replacement, not accumulation," applied here with
        // no origin-based exception of any kind).
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-local-lifecycle-2', title: 'Local Lifecycle Two' }],
            placements: [{ publicationId: 'pub-local-lifecycle-2', position: { x: 2, y: 0, z: 2 } }]
        }));
        assert(registry.listSources().length === 1, '2. \'local\' replaces in place exactly like any other origin — never accumulates a second local slot');
        const view = describeWorldFromDiscoveryRegistry(registry);
        assert(view.publications.length === 1 && view.publications[0].objectId === 'pub-local-lifecycle-2', '3. the FIRST local registration is gone entirely, with no tombstone, exactly 0.9.9\'s own documented contract for any origin');

        // REMOVE — the registry places no restriction on removing
        // 'local'; nothing marks it "permanent" or "exempt from removal".
        registry.removeSource('local');
        assert(registry.listSources().length === 0, '4. \'local\' can be removed via the plain, existing registry API — the same call any peer/Snapshot lifecycle bridge already uses for its own origin');

        // Contrast against the REAL, RUNNING composition root: 0.9.14's
        // own bootstrapWorldDiscoveryRuntime() sets 'local' exactly once,
        // at startup, and wires NO live subscription that would ever
        // call registry.setSource('local', ...)/removeSource('local')
        // again — confirmed directly against that file's own,
        // unmodified source rather than merely cited from its header.
        const bootstrapSource = await readFile(new URL('../application/WorldDiscoveryRuntimeBootstrap.js', import.meta.url), 'utf8');
        const bootstrapCodeOnly = bootstrapSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const setSourceCallCount = (bootstrapCodeOnly.match(/registry\.setSource\(/g) || []).length;
        assert(setSourceCallCount === 1, `5. THE GAP NAMED, NOT CLOSED — bootstrapWorldDiscoveryRuntime() calls registry.setSource() exactly ONCE in its own EXECUTABLE code (the one-time local registration); it contains no live path that would ever replace or remove 'local' again, even though the registry itself (Sections above) places no such restriction — got ${setSourceCallCount} call(s)`);
        assert(!/removeSource\(\s*LOCAL_WORLD_DISCOVERY_ORIGIN|removeSource\(\s*'local'/.test(bootstrapCodeOnly), '6. bootstrapWorldDiscoveryRuntime() never removes the local origin under any circumstance');

        console.log('✓ Section D: local lifecycle parity — the registry itself treats \'local\' exactly like any other origin (replaceable, removable, no special case); the real, running composition root simply never exercises that generality for \'local\' today — a gap between capability and current usage, named here, not closed');
    }

    // ---------------------------------------------------------------
    // Section E — rendering uniformity, precisely scoped: no
    // source-family branching in the actual encounter-marker rendering
    // pipeline — deliberately narrower than a whole-file sweep, since
    // this codebase's OTHER, unrelated `origin` vocabularies (material
    // provenance display, decentralized lead selection) are not part of
    // this claim.
    // ---------------------------------------------------------------
    {
        const canvasSource = await readFile(new URL('../ui/components/WorldEncounterCanvas.js', import.meta.url), 'utf8');
        const markerSource = await readFile(new URL('../ui/components/WorldEncounterMarker.js', import.meta.url), 'utf8');

        // Isolate exactly the computed properties this file's own Section
        // A/B already proved produce the rendered marker list — never the
        // whole file, which legitimately contains OTHER, unrelated
        // `.origin` vocabularies (`selectionOutcome`'s own multi-source
        // "Choose Source" UI, `materialProvenance.origin`,
        // `discoveryResult.provenance.origin`) that this section's own
        // claim is not about and must not flag as a false positive.
        function computedBody(source, name) {
            const marker = `    ${name}(`;
            const start = source.indexOf(marker);
            assert(start !== -1, `computed property ${name} not found — has WorldEncounterCanvas.js's own structure changed?`);
            const braceStart = source.indexOf('{', start);
            let depth = 0;
            for (let i = braceStart; i < source.length; i++) {
                if (source[i] === '{') depth += 1;
                if (source[i] === '}') {
                    depth -= 1;
                    if (depth === 0) return source.slice(braceStart, i + 1);
                }
            }
            throw new Error(`unterminated body for ${name}`);
        }

        const renderingSourceFamilyPattern = /origin\s*===\s*['"]local['"]|origin\.startsWith\(\s*['"]peer:|origin\.startsWith\(\s*['"]snapshot:|kind\s*===\s*['"]SNAPSHOT['"]/;

        const projectedPublicationsBody = computedBody(canvasSource, 'projectedPublications');
        assert(!renderingSourceFamilyPattern.test(projectedPublicationsBody), '1. projectedPublications (the computed property Section A/B\'s own markers are read from) contains no source-family branching of any kind');

        const publicationRowsBody = computedBody(canvasSource, 'publicationRows');
        assert(!renderingSourceFamilyPattern.test(publicationRowsBody), '2. publicationRows likewise contains none');

        assert(!renderingSourceFamilyPattern.test(markerSource), '3. ui/components/WorldEncounterMarker.js — the component that actually renders one marker — contains no source-family branching anywhere in the whole file');

        // Confirmed behaviorally too: a Snapshot-sourced marker and a
        // local-sourced marker, read back from the SAME projection used
        // in Sections A/B, expose identical field shapes.
        const registry = new WorldDiscoverySourceRegistry();
        registry.setSource(describeLocalWorldDiscoverySource({
            publications: [{ id: 'pub-uniform-local', title: 'Uniform Local' }],
            placements: [{ publicationId: 'pub-uniform-local', position: { x: 1, y: 0, z: 1 } }]
        }));
        registerMaterializedSnapshotWorldSource(registry, placedResult('hash-uniform', 'pub-uniform-snapshot', { x: 2, y: 0, z: 2 }),
            new Publication({ id: 'pub-uniform-snapshot', title: 'Uniform Snapshot' }));
        const canvas = buildCanvasInstance({ registry });
        mountCanvas(canvas);
        const [markerLocal, markerSnapshot] = projectedPublicationsOf(canvas).sort((a, b) => a.x - b.x);
        assert(JSON.stringify(Object.keys(markerLocal).sort()) === JSON.stringify(Object.keys(markerSnapshot).sort()),
            '4. a local-sourced marker and a Snapshot-sourced marker carry the IDENTICAL set of fields — no Snapshot-only or local-only field exists on either');
        unmountCanvas(canvas);

        console.log('✓ Section E: rendering uniformity, precisely scoped — no source-family branching exists in the actual marker-rendering computed properties or in WorldEncounterMarker.js itself, and a local marker and a Snapshot marker are structurally identical field-for-field');
    }

    // ---------------------------------------------------------------
    // Section F — THE GENUINE GAP THIS AUDIT FOUND, FIXED BY 0.9.166: a
    // registered Snapshot's own resolved selection now loads its material
    // through the ordinary loadWorldEncounterMaterial() path, via the SAME
    // materialSources.local slot 'local'-origin selections already use.
    // ---------------------------------------------------------------
    {
        class RecordingMaterialSource extends WorldEncounterMaterialSource {
            constructor(material) { super(); this.material = material; this.loadCallCount = 0; }
            async load(resolvedSelection) { this.loadCallCount += 1; return this.material; }
        }

        const localMaterialSource = new RecordingMaterialSource({ bytes: 'local material' });
        const peerMaterialSource = new RecordingMaterialSource({ bytes: 'peer material' });
        const decentralizedMaterialSource = new RecordingMaterialSource({ bytes: 'decentralized material' });
        // A Snapshot-shaped material source registered under every OTHER
        // plausible key a caller might have guessed before 0.9.166 —
        // proving the fix genuinely routes through `materialSources.local`
        // and never invents a fourth, Snapshot-named slot alongside it.
        const snapshotMaterialSource = new RecordingMaterialSource({ bytes: 'snapshot material' });

        const publicationId = 'pub-material-gap';
        const contentHash = 'hash-material-gap';
        const snapshotOrigin = materializedSnapshotWorldOrigin(contentHash, publicationId);
        assert(typeof snapshotOrigin === 'string' && snapshotOrigin.startsWith('snapshot:'), '1. sanity — a real, registered Snapshot\'s own origin genuinely starts with \'snapshot:\'');

        const resolvedSnapshotSelection = describeWorldEncounterSelectionIdentity({
            kind: WorldEncounterKind.PUBLICATION, objectId: publicationId, origin: snapshotOrigin
        });
        assert(resolvedSnapshotSelection !== null, '2. sanity — this is a well-formed resolved selection, exactly the shape a real "Choose Source"/auto-resolved click would produce for a registered Snapshot');

        const materialSources = {
            local: localMaterialSource,
            peer: peerMaterialSource,
            decentralized: decentralizedMaterialSource,
            snapshot: snapshotMaterialSource
        };

        const snapshotResult = await loadWorldEncounterMaterial({ resolvedSelection: resolvedSnapshotSelection, materialSources });
        assert(snapshotResult.status === WorldEncounterMaterialLoadStatus.AVAILABLE, `3. THE GAP IS CLOSED — a resolved selection naming a REAL registered Snapshot's own origin now reports AVAILABLE; got status '${snapshotResult.status}'`);
        assert(snapshotResult.material === localMaterialSource.material, '4. the material returned is materialSources.local\'s own — the SAME slot \'local\'-origin selections already use, never a separate Snapshot-shaped result');
        assert(localMaterialSource.loadCallCount === 1, '5. THE FIX, MADE CONCRETE — a snapshot:* origin dispatches to materialSources.local\'s own load(), exactly once');
        assert(snapshotMaterialSource.loadCallCount === 0, '6. materialSources.snapshot (a guessed, never-adopted key) is never called — 0.9.166 added no fourth, Snapshot-named slot');
        assert(peerMaterialSource.loadCallCount === 0 && decentralizedMaterialSource.loadCallCount === 0,
            '7. neither of the OTHER registered sources was spuriously called either — a snapshot:* origin dispatches to exactly one slot, never several');

        // Sanity, both directions — the SAME function still correctly
        // dispatches 'local' and 'peer:...' origins exactly as before,
        // proving 0.9.166 added a branch rather than changing existing
        // routing.
        const resolvedLocalSelection = describeWorldEncounterSelectionIdentity({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-x', origin: LOCAL_WORLD_DISCOVERY_ORIGIN });
        const localResult = await loadWorldEncounterMaterial({ resolvedSelection: resolvedLocalSelection, materialSources });
        assert(localResult.status === WorldEncounterMaterialLoadStatus.AVAILABLE && localMaterialSource.loadCallCount === 2, '8. sanity — the SAME function still correctly dispatches a \'local\' origin to materialSources.local');

        const resolvedPeerSelection = describeWorldEncounterSelectionIdentity({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-y', origin: 'peer:did:key:zMaterialGap' });
        const peerResult = await loadWorldEncounterMaterial({ resolvedSelection: resolvedPeerSelection, materialSources });
        assert(peerResult.status === WorldEncounterMaterialLoadStatus.AVAILABLE && peerMaterialSource.loadCallCount === 1, '9. sanity — the SAME function still correctly dispatches a \'peer:*\' origin to materialSources.peer');

        // Structural confirmation, tied to the behavioral proof above:
        // materialSourceFor() now DOES mention 'snapshot' — exactly one
        // branch, routing to materialSources.local, never a new slot name.
        const loadingSource = await readFile(new URL('../application/WorldEncounterMaterialLoading.js', import.meta.url), 'utf8');
        const materialSourceForStart = loadingSource.indexOf('function materialSourceFor(');
        const materialSourceForEnd = loadingSource.indexOf('\n}\n', materialSourceForStart);
        const materialSourceForBody = loadingSource.slice(materialSourceForStart, materialSourceForEnd);
        assert(/origin\.startsWith\('snapshot:'\)/.test(materialSourceForBody), '10. materialSourceFor() now recognizes a \'snapshot:\' origin prefix');
        assert(!/materialSources\.snapshot/.test(materialSourceForBody), '11. ...and still routes it to materialSources.local, never to a materialSources.snapshot slot of its own');

        console.log('✓ Section F: THE GENUINE GAP, FIXED BY 0.9.166 — a registered, rendered Snapshot\'s own resolved selection now loads its material through loadWorldEncounterMaterial(), via the SAME materialSources.local slot \'local\'-origin selections already use; see tests/SnapshotWorldEncounterMaterialLoading.test.js for that fix\'s own dedicated test contract.');
    }

    // ---------------------------------------------------------------
    // Section G — structural sweep: this milestone adds no production
    // file, and no dedup/reconciliation/merge/trust/ranking vocabulary
    // anywhere it touches.
    // ---------------------------------------------------------------
    {
        const filesToSweep = [
            '../application/WorldDiscoverySourceRegistry.js',
            '../application/WorldDiscoveryRuntimeBootstrap.js',
            '../application/MaterializedSnapshotWorldDiscoveryBridge.js',
            '../application/WorldDiscoveryRegistryProjection.js',
            '../application/WorldEncounterMaterialLoading.js',
            '../core/WorldEncounter.js',
            '../core/WorldDiscoverySourceAssembly.js'
        ];
        for (const relativePath of filesToSweep) {
            const source = await readFile(new URL(relativePath, import.meta.url), 'utf8');
            const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
            assert(!/dedup|reconcil|merge\(|\btrust\b|ranking|priorit/i.test(codeOnly), `1. ${relativePath} contains no deduplication/reconciliation/merge/trust/ranking/prioritization vocabulary in its own executable code`);
        }
        console.log('✓ Section G: structural sweep — this milestone is test-only; no dedup/reconciliation/merge/trust/ranking vocabulary exists in any file this audit exercised');
    }

    console.log('\n✅ All World Discovery Participation Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
