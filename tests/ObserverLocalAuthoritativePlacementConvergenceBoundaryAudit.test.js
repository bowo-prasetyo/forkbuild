import { readFile } from 'node:fs/promises';

import { WorldDiscoverySourceRegistry } from '../application/discovery/WorldDiscoverySourceRegistry.js';
import { describeWorldFromDiscoveryRegistry } from '../application/discovery/WorldDiscoveryRegistryProjection.js';
import { ObserverLocalEncounterStore } from '../application/worldEncounter/ObserverLocalEncounterStore.js';
import { describeObserverLocalPublicationEncounter } from '../core/ObserverLocalPublicationEncounter.js';
import { resolveSnapshotWorldPlacement } from '../application/snapshot/placement/SnapshotWorldPlacement.js';
import { registerMaterializedSnapshotWorldSource } from '../application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js';
import { StoreSnapshotContentOutcome } from '../application/snapshot/materialization/StoreSnapshotContentOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/snapshot/placement/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/snapshot/placement/SnapshotWorldRegistrationOutcome.js';
import { LocalWorldEncounterMaterialSource } from '../application/worldEncounter/LocalWorldEncounterMaterialSource.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import { worldEncounterCanvasFiles, worldViewFiles } from './support/SourceFileGroups.js';

// 0.9.569 — Observer-Local to Authoritative Placement Presentation
// Convergence Boundary Audit.
//
// TYPE: test-only boundary audit. Production changes: none.
//
// 0.9.568 Section D found a real, reproducible PRODUCT_GAP: a Publication
// discovered while UNPLACED (recording a session-scoped "Discovered here"
// observer-local encounter) that LATER, within the SAME session, reaches
// the primary `WorldDiscoverySourceRegistry` channel by any real,
// already-shipped means renders BOTH a permanent, fully-actionable marker
// AND a stale observer-local ghost, simultaneously, for the rest of that
// session. That milestone's own recommendation, quoted verbatim: "make
// the observer-local rendering layer stop presenting a publicationId
// already present in the primary registry — a presentational filter
// requiring no new PlacementRecord, no automatic promotion, and no change
// to either mechanism's own authority boundary."
//
// This milestone does not re-litigate whether the gap is real (0.9.568
// Section D already proved that, through two independent real production
// paths) or whether it is safe to leave the underlying records alone
// (0.9.568 Section K already proved Open/Fork/Explore/Comment stay fully
// correct on both markers). It asks the narrower question 0.9.568's own
// recommendation leaves open: WHERE, EXACTLY, does that filter belong, and
// on WHAT identity key? Test-only, throughout — no filter is added to
// production source by this milestone. A follow-up (recommended here as
// 0.9.570, not implemented) would add exactly the filter this milestone
// locates.
//
//   Section A. Reproduce the exact duplicate directly (a leaner
//              construction than 0.9.568 Section D's own full
//              publish/distribute/discover harness — see that section for
//              the end-to-end production-path proof; this one isolates
//              the presentation layer itself).
//   Section B. The existing authoritative-transition signal — no new
//              event is required.
//   Section C. Observer-local lifecycle trace — the store carries no
//              removal/expiry seam of any kind.
//   Section D. Authoritative lifecycle trace — `publicationRows`'s own
//              `objectId` is already the one reactive "is this
//              publicationId placed" signal.
//   Section E. Identity matching — the convergence key must be
//              `publicationId`, never `contentHash` and never a
//              coordinate.
//   Section F. Position disagreement — convergence must be decided by
//              identity, never by coordinate (dis)agreement.
//   Section G. User-facing semantics — the existing product vocabulary
//              and rendering model has exactly two states (permanent
//              marker, ephemeral ghost) and no third "converted" state;
//              suppression, not transformation, is the only change the
//              existing UI seam can express without inventing new UI.
//   Section H. Inspection continuity — an open observer-local inspection
//              is independent, local, selection state, never derived
//              from the projected marker list a filter would change.
//   Section I. Async race independence — the primary channel's own
//              reactive update and the observer-local inspection's own
//              `requestId` guard live on two completely independent
//              reactive channels; nothing here introduces, or is exposed
//              to, a new race.
//   Section J. Smallest ownership boundary — a structural sweep of
//              `ObserverLocalEncounterStore.js`, `WorldView.js`, and
//              `WorldEncounterCanvas.js` locating the one seam capable of
//              this filter today.
//   Section K. Reference-filter validation — a small, LOCAL, NEVER-SHIPPED
//              pure function implementing the hypothesized filter,
//              exercised against every fixture built in Sections A/E/F to
//              confirm the identity key and seam this milestone recommends
//              actually produce the correct result.
//   Section L. Verdict and recommendation for 0.9.570.
//
// CLASSIFICATION VOCABULARY: the same `ALREADY_CORRECT`/`PRODUCT_GAP`/
// `ARCHITECTURAL_GAP`/`DELIBERATE_BOUNDARY` vocabulary 0.9.553/0.9.568
// already established.
//
// DELIBERATELY EXCLUDED — PER THIS MILESTONE'S OWN BRIEF. No change to
// `ObserverLocalEncounterStore.js`, `WorldEncounterCanvas.js`,
// `WorldView.js`, `PlacementRecord`, or any other production file. No
// deletion or mutation of an observer-local encounter. No promotion of a
// `claimedPosition` to a `PlacementRecord`. No redesign of the inspection
// model. Section K's reference filter is a test-only proof, never
// imported by, or copy-pasted verbatim into, production source by this
// milestone — 0.9.570 is expected to write its own, reviewed
// implementation.

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
function methodBody(source, signaturePattern, closeIndent) {
    const re = new RegExp(`${signaturePattern}\\s*\\{([\\s\\S]*?)\\n {${closeIndent}}\\}`);
    const match = source.match(re);
    assert(match, `method body for ${signaturePattern} could not be located`);
    return match[1];
}

// ===================================================================
// Harness — a leaner subset of 0.9.568's own harness, duplicated here
// per this codebase's own established per-file harness convention.
// This milestone does not need the Arweave/Nostr distribution host at
// all: 0.9.567/0.9.568 already proved a real claim reaches the primary
// registry end to end. Here, a Publication is registered directly
// through the SAME `resolveSnapshotWorldPlacement()` +
// `registerMaterializedSnapshotWorldSource()` pair 0.9.568's own
// Sections E/K/L already used for exactly this purpose — the identical
// production call, just without re-deriving the distribution pipeline
// that feeds it.
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

// Registers `publication` as an authoritative primary-channel row, at
// `position`, through the real `resolveSnapshotWorldPlacement()` +
// `registerMaterializedSnapshotWorldSource()` pair — the SAME two calls
// 0.9.568 Sections E/K/L already used to place a Publication without
// re-deriving the distribution pipeline that ordinarily produces the
// `placementInfo` these two calls consume.
function placeAuthoritatively(registry, publication, position) {
    const placementInfo = { placementId: `placement:${publication.id}`, publicationId: publication.id, position };
    const materialization = { outcome: StoreSnapshotContentOutcome.STORED, contentHash: publication.contentHash, contentReference: publication.contentReference };
    const placement = resolveSnapshotWorldPlacement(materialization, placementInfo);
    assert(placement.outcome === SnapshotWorldPlacementOutcome.PLACED, 'placeAuthoritatively() setup: the placement itself must resolve to PLACED');
    return registerMaterializedSnapshotWorldSource(registry, placement, publication);
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

// WorldEncounterCanvas real-component harness — mirrors 0.9.558's own
// `buildCanvasInstance()`, trimmed to the collaborators this milestone
// actually exercises.
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
        'observerLocalEncounterResolvedSelection',
        'observerLocalEncounterActionablePublication',
        'observerLocalEncounterCommentaryPublicationId'
    ]) {
        Object.defineProperty(ctx, name, { get() { return WorldEncounterCanvas.computed[name].call(ctx); } });
    }
    return ctx;
}
function mountCanvas(ctx) { WorldEncounterCanvas.mounted.call(ctx); }
function unmountCanvas(ctx) { WorldEncounterCanvas.beforeUnmount.call(ctx); }

// Re-derives `effectiveView`/`publicationRows`/`projectedPublications`
// straight off whatever `ctx.worldView` currently holds — real
// production wiring (see Section B) already keeps `ctx.worldView` itself
// live via `registry.subscribe()`; this helper only re-runs the plain,
// synchronous computed chain hanging off it, exactly as a real Vue
// re-render would.
function projectedPublicationsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedPublications.call(ctx);
}
function publicationRowsOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return ctx.publicationRows;
}
// AMENDED BY 0.9.570 — `projectedObserverLocalEncounters` now itself reads
// `this.publicationRows` (the shipped filter), so this helper must prime
// `ctx.effectiveView`/`ctx.publicationRows` first, exactly as
// `projectedPublicationsOf()`/`publicationRowsOf()` already do — mirroring
// what a real Vue re-render's own dependency chain would already keep
// current on its own.
function projectedObserverLocalEncountersOf(ctx) {
    ctx.effectiveView = WorldEncounterCanvas.computed.effectiveView.call(ctx);
    ctx.publicationRows = WorldEncounterCanvas.computed.publicationRows.call(ctx);
    return WorldEncounterCanvas.computed.projectedObserverLocalEncounters.call(ctx);
}

// ===================================================================
// Section K's own reference filter — a LOCAL, TEST-ONLY, NEVER-SHIPPED
// pure function. It exists purely to let this audit VALIDATE the
// identity key and seam it recommends against real fixtures, before any
// production code is written. See this file's own header, "Deliberately
// excluded."
// ===================================================================
function hypotheticalConvergedObserverLocalRows(observerLocalRows, publicationRows) {
    const placedPublicationIds = new Set(publicationRows.map((row) => row.objectId));
    return observerLocalRows.filter((row) => !placedPublicationIds.has(row.publicationId));
}

async function run() {
    console.log('Running Observer-Local to Authoritative Placement Presentation Convergence Boundary Audit tests...\n');

    // =======================================================================
    // Section A — reproduce the exact duplicate directly.
    //
    // AMENDED BY 0.9.570 — Suppress Observer-Local Ghosts After
    // Authoritative Placement, in place, mirroring this codebase's own
    // established amendment precedent (e.g. 0.9.566 amending 0.9.565's own
    // Section B for the identical situation) rather than leaving a
    // now-false "the duplicate still renders" assertion behind. This
    // section's own T0/T1 setup, and A1-A3, are unchanged; A4/A5 (which
    // asserted the duplicate itself) are replaced below with the opposite,
    // now-true fact: the shipped filter suppresses it. See
    // tests/SuppressObserverLocalGhostsAfterAuthoritativePlacement.test.js
    // for the full production-fix test suite this milestone added.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const publication = makePublication({ id: 'section-a-pub', title: 'Section A Publication', contentHash: 'hash-a' });

        // T0 — an ordinary observer-local encounter, exactly as the
        // automatic cascade would record one for an UNPLACED Publication
        // (0.9.552-0.9.559; reproduced directly here since 0.9.568
        // Section D already proved the full cascade produces this exact
        // shape).
        recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 1, y: 0, z: 1 } });

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        assert(projectedPublicationsOf(ctx).length === 0 && projectedObserverLocalEncountersOf(ctx).length === 1,
            'A1. Before any authoritative placement: the primary channel is empty, and exactly one "Discovered here" marker renders.');

        // T1 — still within the SAME mount (same registry, same store),
        // the Publication reaches the primary channel — exactly 0.9.568
        // Section D's own "STILL WITHIN THE SAME SESSION" condition.
        const result = placeAuthoritatively(registry, publication, { x: 40, y: 0, z: 40 });
        assert(result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'A2. Setup: the authoritative registration itself succeeds.');

        const primaryAfter = projectedPublicationsOf(ctx);
        const observerLocalAfter = projectedObserverLocalEncountersOf(ctx);
        assert(primaryAfter.length === 1 && primaryAfter[0].objectId === publication.id,
            'A3. After registration: the primary channel correctly, permanently renders the Publication.');
        assert(observerLocalAfter.length === 0,
            'A4. (AMENDED BY 0.9.570) THE DUPLICATE, FIXED: the observer-local ghost for this same publicationId no longer renders — projectedObserverLocalEncounters now suppresses any row whose publicationId already has a publicationRows entry.');
        assert(store.list().length === 1 && store.list()[0].publicationId === publication.id,
            'A5. (AMENDED BY 0.9.570) The underlying recorded encounter itself is untouched — ObserverLocalEncounterStore.js still holds it (Section C\'s own "no removal seam" finding still holds); only the RENDERED projection changed. This is the presentation-only boundary 0.9.569 Section J/L called for.');
        unmountCanvas(ctx);

        console.log('✓ A: (AMENDED BY 0.9.570) the double presentation this section used to reproduce is now fixed at the presentation layer alone — the observer-local encounter stays recorded in the store, but no longer renders once its publicationId also has an authoritative placement.');
    }

    // =======================================================================
    // Section B — the existing authoritative-transition signal.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const publication = makePublication({ id: 'section-b-pub', title: 'Section B Publication', contentHash: 'hash-b' });
        recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 2, y: 0, z: 2 } });

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        assert(ctx.worldView !== null, 'B1. mounted() seeds `worldView` from the registry immediately — no separate "fetch on demand" step exists.');

        // Registering a placement calls the registry's OWN setSource(),
        // which the real, already-subscribed listener 0.9.13 wired reacts
        // to automatically — `ctx.worldView` updates itself, with no
        // manual re-fetch call from this test.
        const worldViewBefore = ctx.worldView;
        placeAuthoritatively(registry, publication, { x: 5, y: 0, z: 5 });
        assert(ctx.worldView !== worldViewBefore, 'B2. THE EXISTING SIGNAL: `ctx.worldView` is already a DIFFERENT object immediately after registration, with no explicit refresh call from this test — the real `registry.subscribe()` listener 0.9.13 wired already fired and already called `refreshWorldViewFromRegistry()` on this component\'s behalf.');
        assert(publicationRowsOf(ctx).some((row) => row.objectId === publication.id),
            'B3. The updated `worldView` genuinely reflects the new authoritative row.');

        // Structural: the listener 0.9.13 wired is unconditional and
        // parameterless — it is already the correct "something changed,
        // re-derive" signal a convergence filter would read from, and
        // needs no new argument (a publicationId, a diff, a reason) added
        // to it to work.
        const canvasSource = codeOnly((await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n'));
        assert(canvasSource.includes('this.unsubscribeWorldRegistry = this.registry.subscribe(() => {'),
            'B4. The real subscription is confirmed, verbatim, against live source: a bare, no-argument listener — exactly the shape a convergence filter (itself a plain computed reading `publicationRows`) needs and nothing more.');

        // The observer-local side already carries the same shape, one
        // store over (0.9.552) — a filter needs NEITHER side to grow a
        // new notification payload.
        assert(canvasSource.includes('this.unsubscribeObserverLocalEncounterRegistry = this.observerLocalEncounterRegistry.subscribe(() => {'),
            'B5. The observer-local store\'s own subscription is the identical shape — both existing signals a convergence filter would depend on already exist, are already wired into THIS SAME component instance, and require no new event of any kind.');

        unmountCanvas(ctx);
        console.log('✓ B: the "this Publication now has an authoritative PlacementRecord" signal a convergence filter needs already exists and is already wired — `WorldEncounterCanvas`\'s own pre-existing `registry.subscribe()` listener (0.9.13) already keeps `worldView`/`publicationRows` live. No new event, notification, or polling loop is required.');
    }

    // =======================================================================
    // Section C — observer-local lifecycle trace: no removal seam exists.
    // =======================================================================
    {
        const storeSource = codeOnly(await readSource('application/worldEncounter/ObserverLocalEncounterStore.js'));
        // Deliberately scoped to `_encounters`-affecting names only —
        // `_listeners.delete(id)` (subscription cleanup) is a real,
        // legitimate, and entirely unrelated method this same file already
        // has; it must not trip this check.
        for (const forbidden of ['remove(', 'evict(', 'expire(', 'clear(', '_encounters.delete']) {
            assert(!storeSource.includes(forbidden), `C1. ObserverLocalEncounterStore.js defines no '${forbidden}' encounter-removal seam.`);
        }
        assert(storeSource.includes('_encounters.set(key, encounter)') && !storeSource.includes('_encounters.delete'),
            'C2. `record()` only ever `.set()`s — replacing an identical key\'s own prior entry (0.9.552\'s own documented "replace, never accumulate" rule) — but nothing in this file ever `.delete()`s an `_encounters` entry.');

        // Behavioral: recording a SECOND encounter for a genuinely
        // different key never touches the first — confirming `record()`'s
        // own replace-by-key behavior is scoped exactly to its own key,
        // never a broader "supersede everything for this publicationId"
        // rule that might accidentally double as a removal mechanism.
        const store = new ObserverLocalEncounterStore();
        recordObserverLocalEncounter(store, { publicationId: 'pub-c1', contentHash: 'hash-c1', position: { x: 0, y: 0, z: 0 } });
        recordObserverLocalEncounter(store, { publicationId: 'pub-c2', contentHash: 'hash-c2', position: { x: 1, y: 0, z: 1 } });
        assert(store.list().length === 2, 'C3. Two genuinely distinct encounters both remain recorded — confirming there is no incidental eviction of any kind.');

        console.log('✓ C: `ObserverLocalEncounterStore.js` carries no removal, expiry, or eviction seam of any kind — by design (0.9.552\'s own "deliberately excluded" list). A convergence fix cannot live inside this store without first re-opening and amending that file\'s own documented contract; this audit does not recommend doing so (see Section J/L).');
    }

    // =======================================================================
    // Section D — authoritative lifecycle trace: `publicationRows`'s own
    // `objectId` is already the reactive placement signal.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publication = makePublication({ id: 'section-d-pub', title: 'Section D Publication', contentHash: 'hash-d' });
        const ctx = buildCanvasInstance({ registry });
        mountCanvas(ctx);

        assert(publicationRowsOf(ctx).length === 0, 'D1. Before registration: `publicationRows` genuinely reports zero rows.');
        placeAuthoritatively(registry, publication, { x: 7, y: 0, z: 7 });
        const rows = publicationRowsOf(ctx);
        assert(rows.length === 1 && rows[0].objectId === publication.id,
            'D2. After registration: `publicationRows` carries exactly one row, keyed by `objectId` === the SAME `publicationId` an observer-local encounter carries.');

        // Structural: `publicationRows`'s own row shape (0.9.0, unchanged)
        // never carries a `contentHash` field — confirming a convergence
        // filter has exactly one usable identity field to join against,
        // never a choice between two.
        const readModelSource = codeOnly(await readSource('application/worldEncounter/WorldEncounterReadModel.js'));
        const readModelBody = methodBody(readModelSource, 'function describeWorldEncounterReadModel\\(encounters\\)', 0);
        const publicationRowShape = readModelBody.split('const publications = publicationEncounters.map((encounter) => Object.freeze({')[1].split('}));')[0];
        assert(!publicationRowShape.includes('contentHash'), 'D3. The publication row shape itself never carries a `contentHash` field — `objectId` (publicationId) is the ONLY identity field a convergence filter could join against from this side.');
        assert(publicationRowShape.includes('objectId: encounter.objectId'), 'D3b. Sanity — `objectId` is genuinely present on the row this check is inspecting.');

        unmountCanvas(ctx);
        console.log('✓ D: `publicationRows`\'s own `objectId`, already computed, already reactive (Section B), and already free of any second identity field, is the one existing signal a convergence filter needs to answer "does this publicationId already have an authoritative presence" — no new read path into `PlacementRecord`, `LocalPlacementRegistry`, or `WorldNavigationSession` is required.');
    }

    // =======================================================================
    // Section E — identity matching: `publicationId`, never `contentHash`,
    // never a coordinate.
    //
    // AMENDED BY 0.9.570 — E2/E3/E4 below now read the RAW, pre-projection
    // store contents (`store.list()`) rather than `projectedObserverLocalEncountersOf(ctx)`
    // directly, since that projection is now itself filtered by the
    // shipped fix — reading it directly would make the reference-filter
    // simulation these three checks perform trivially idempotent rather
    // than a genuine cross-check. E2b/E3b, new, confirm the shipped
    // production filter's live output agrees with the reference filter
    // applied to those same raw contents. E1, E5, E6 are unchanged — E5/E6
    // never depended on a pre-existing duplicate in the first place (Q1
    // was only ever placed, never observer-local-recorded).
    // =======================================================================
    {
        // E1/E2 — two DIFFERENT Publications sharing one contentHash: a
        // filter keyed by contentHash would wrongly suppress P2's own
        // observer-local marker the moment P1 alone is registered. A
        // filter keyed by publicationId does not.
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const sharedHash = 'shared-content-hash-e';
        const p1 = makePublication({ id: 'section-e-p1', title: 'Section E P1', contentHash: sharedHash });
        const p2 = makePublication({ id: 'section-e-p2', title: 'Section E P2', contentHash: sharedHash });
        recordObserverLocalEncounter(store, { publicationId: p1.id, contentHash: sharedHash, position: { x: 0, y: 0, z: 0 } });
        recordObserverLocalEncounter(store, { publicationId: p2.id, contentHash: sharedHash, position: { x: 1, y: 0, z: 1 } });
        placeAuthoritatively(registry, p1, { x: 20, y: 0, z: 20 });

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        const publicationRows = publicationRowsOf(ctx);
        const observerLocalRows = projectedObserverLocalEncountersOf(ctx);
        const rawObserverLocalRows = store.list().map((e) => ({ publicationId: e.publicationId, contentHash: e.contentHash }));
        assert(publicationRows.length === 1 && publicationRows[0].objectId === p1.id, 'E1. Only P1 reaches the primary channel.');
        assert(rawObserverLocalRows.length === 2, 'E2. Sanity — the store itself still holds both P1 and P2\'s recorded encounters (Section C\'s own "no removal seam" finding) — the fix, below, changes only the RENDERED projection, never the store.');
        assert(observerLocalRows.length === 1 && observerLocalRows[0].publicationId === p2.id,
            'E2b. (AMENDED BY 0.9.570) The shipped production filter already suppresses ONLY P1\'s own stale marker, live — P2\'s marker survives.');

        const converged = hypotheticalConvergedObserverLocalRows(rawObserverLocalRows, publicationRows);
        assert(converged.length === 1 && converged[0].publicationId === p2.id,
            'E3. A publicationId-keyed filter, applied to the RAW store contents, correctly suppresses ONLY P1\'s own stale marker — P2\'s marker survives, confirming a contentHash-keyed filter would have been WRONG here (it would have suppressed P2 too, despite P2 having no authoritative placement of its own at all).');
        assert(converged.length === observerLocalRows.length && converged.every((row, i) => row.publicationId === observerLocalRows[i].publicationId),
            'E3b. (AMENDED BY 0.9.570) The reference filter, applied to the raw store contents, agrees row-for-row with the shipped production filter\'s own live output — confirming 0.9.570 implemented the exact identity key this audit located.');

        // E4 — the reverse sanity: a naive contentHash-keyed filter would
        // fail this exact fixture, proving the choice of key is not
        // incidental. Deliberately re-derived from the RAW store contents
        // (see this section's own 0.9.570 amendment note) so this
        // demonstration keeps exercising a genuine two-row fixture rather
        // than the now-already-filtered production output.
        const contentHashKeyedPlacedHashes = new Set(publicationRows.map(() => sharedHash));
        const wronglyConverged = rawObserverLocalRows.filter((row) => !contentHashKeyedPlacedHashes.has(row.contentHash));
        assert(wronglyConverged.length === 0, 'E4. Demonstrated failure mode: a contentHash-keyed filter over this SAME raw fixture wrongly suppresses BOTH P1 and P2 — confirming `contentHash` is the wrong identity key, exactly as 0.9.568 Section L\'s own finding ("no content-hash shortcut ever collapses P1 and P2\'s spatial or object identity") already implied for this convergence question specifically.');
        unmountCanvas(ctx);

        // E5/E6 — two DIFFERENT Publications claiming the SAME position: a
        // filter keyed by coordinate would wrongly suppress an unrelated
        // Publication's own marker merely because some OTHER Publication
        // was placed at that exact coordinate.
        const registry2 = new WorldDiscoverySourceRegistry();
        const store2 = new ObserverLocalEncounterStore();
        const sharedPosition = { x: 10, y: 0, z: 10 };
        const q1 = makePublication({ id: 'section-e-q1', title: 'Section E Q1', contentHash: 'hash-q1' });
        const q2 = makePublication({ id: 'section-e-q2', title: 'Section E Q2', contentHash: 'hash-q2' });
        recordObserverLocalEncounter(store2, { publicationId: q2.id, contentHash: q2.contentHash, position: sharedPosition });
        placeAuthoritatively(registry2, q1, sharedPosition);

        const ctx2 = buildCanvasInstance({ registry: registry2, observerLocalEncounterRegistry: store2 });
        mountCanvas(ctx2);
        const publicationRows2 = publicationRowsOf(ctx2);
        const observerLocalRows2 = projectedObserverLocalEncountersOf(ctx2);
        assert(publicationRows2.length === 1 && publicationRows2[0].objectId === q1.id, 'E5. Setup: Q1 alone is authoritatively placed, at the exact coordinate Q2\'s own observer-local encounter also happens to occupy.');
        const converged2 = hypotheticalConvergedObserverLocalRows(observerLocalRows2, publicationRows2);
        assert(converged2.length === 1 && converged2[0].publicationId === q2.id,
            'E6. A publicationId-keyed filter leaves Q2\'s own marker untouched — coordinate coincidence with an unrelated, already-placed Publication never suppresses it. A coordinate-keyed filter would have wrongly suppressed Q2 here.');
        unmountCanvas(ctx2);

        console.log('✓ E: `publicationId` — the SAME field already present on both a `publicationRows` row (`objectId`) and an observer-local row (`publicationId`) — is the only identity key that resolves both adversarial fixtures correctly; `contentHash` and coordinate equality each independently produce a wrong result on at least one of them.');
    }

    // =======================================================================
    // Section F — position disagreement: convergence is decided by
    // identity, never by coordinate (dis)agreement.
    //
    // AMENDED BY 0.9.570 — F1/F2 now read the RAW store contents, for the
    // same reason given in Section E's own 0.9.570 amendment note; F3, new,
    // confirms the shipped filter's live output.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const publication = makePublication({ id: 'section-f-pub', title: 'Section F Publication', contentHash: 'hash-f' });
        recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash: publication.contentHash, position: { x: 12, y: 0, z: 8 } });
        placeAuthoritatively(registry, publication, { x: 10, y: 0, z: 10 });

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        const publicationRows = publicationRowsOf(ctx);
        const observerLocalRows = projectedObserverLocalEncountersOf(ctx);
        const rawObserverLocalRows = store.list().map((e) => ({ publicationId: e.publicationId, contentHash: e.contentHash }));
        assert(rawObserverLocalRows[0].publicationId === publicationRows[0].objectId, 'F1. Sanity — same publicationId, deliberately DIFFERENT recorded positions ((12,0,8) vs (10,0,10)).');

        const converged = hypotheticalConvergedObserverLocalRows(rawObserverLocalRows, publicationRows);
        assert(converged.length === 0,
            'F2. The publicationId-keyed filter suppresses the stale marker despite the position disagreement — convergence is an identity decision, never a coordinate-equality one. This mirrors 0.9.568\'s own spatial-continuity finding that coordinate equality never implies identity, applied here in the opposite direction: coordinate DISAGREEMENT must not block a convergence that identity alone already justifies.');
        assert(observerLocalRows.length === 0,
            'F3. (AMENDED BY 0.9.570) The shipped production filter already suppresses this marker live, agreeing with the reference filter above — the position disagreement does not block it in production either.');
        unmountCanvas(ctx);

        console.log('✓ F: convergence is correctly decided by `publicationId` identity alone; a genuinely different observer-local position never blocks it, and (per Section E) a genuinely coincidental shared position never forces it for an unrelated Publication.');
    }

    // =======================================================================
    // Section G — user-facing semantics: suppression, not transformation,
    // is the only change the existing rendering model can express.
    // =======================================================================
    {
        const canvasSource = codeOnly((await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n'));
        // The two rendering surfaces are genuinely separate template
        // blocks (0.9.552's own deliberate architecture boundary) — there
        // is no shared "marker" component, no shared inspection panel, and
        // no intermediate/"promoted" visual state between them.
        assert(canvasSource.includes("v-for=\"marker in projectedPublications\""), 'G1. The primary channel renders through its own `<WorldEncounterMarker>` v-for.');
        assert(canvasSource.includes("v-for=\"marker in projectedObserverLocalEncounters\""), 'G2. The observer-local channel renders through its own, entirely separate `<g>` v-for.');
        for (const forbidden of ['observer-local-promoted', 'converted-marker', 'upgradedMarker', 'transitioningEncounter']) {
            assert(!canvasSource.includes(forbidden), `G3. No "${forbidden}"-shaped intermediate visual state exists anywhere in the file — there is no half-way "converting" marker to fade or morph.`);
        }
        // The observer-local inspection panel's own real copy is already
        // scoped, honest, and disclaiming (0.9.568 Section H already
        // verified this verbatim) — suppressing the marker entirely, once
        // an authoritative row exists, does not require rewriting this
        // copy for a "placed" case it would then never need to describe.
        assert(canvasSource.includes('This was discovered during your current World session. It has not been placed'),
            'G4. The existing observer-local copy is confirmed, verbatim, to describe only the pre-convergence state — it never claims permanence, so removing the marker (rather than relabeling it) is fully consistent with what the product already says about it.');

        console.log('✓ G: the product\'s own existing rendering model offers exactly two states — a permanent primary marker, and an ephemeral observer-local ghost — with no third, "just registered"/"converting" visual state anywhere in the current UI. Suppressing the stale marker outright, once its publicationId is also present in `publicationRows`, is the change consistent with the vocabulary and interaction model that already exists; inventing a transition animation or a merged marker would be new UI, outside a presentational filter\'s own scope.');
    }

    // =======================================================================
    // Section H — inspection continuity: selection state is independent
    // of the projected marker list.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const contentHash = 'section-h-hash';
        const publication = makePublication({ id: 'section-h-pub', title: 'Section H Publication', contentHash });
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

        // The Wanderer inspects the observer-local marker BEFORE the
        // authoritative registration arrives.
        ctx.selectObserverLocalEncounter({ publicationId: publication.id, contentHash });
        await flushMicrotasks();
        assert(ctx.observerLocalEncounterActionablePublication && ctx.observerLocalEncounterActionablePublication.id === publication.id,
            'H1. Setup: the inspection resolves normally, before convergence.');

        // THEN the authoritative registration arrives, mid-inspection —
        // the exact ordering this milestone's own brief (item H) named.
        placeAuthoritatively(registry, publication, { x: 15, y: 0, z: 15 });
        assert(publicationRowsOf(ctx).some((row) => row.objectId === publication.id), 'H2. Sanity — the primary channel now genuinely carries this publicationId too.');

        // `selectedObserverLocalEncounter`/`observerLocalEncounterInspection`
        // are read directly here — NEVER re-derived from
        // `projectedObserverLocalEncounters` — so a hypothetical filter
        // that removes this row from the RENDERED list cannot, by
        // construction, touch this already-open selection.
        assert(ctx.selectedObserverLocalEncounter !== null && ctx.selectedObserverLocalEncounter.publicationId === publication.id,
            'H3. The selection survives the authoritative registration untouched — `selectObserverLocalEncounter()`\'s own source (0.9.554) writes `{ publicationId, contentHash }` once, from the clicked marker, and nothing anywhere re-validates it against the live `projectedObserverLocalEncounters` list afterward.');
        assert(ctx.observerLocalEncounterActionablePublication && ctx.observerLocalEncounterActionablePublication.id === publication.id,
            'H4. The already-resolved inspection itself also survives — confirming 0.9.568 Section K\'s own finding one step further: not only do actions on a stale marker stay safe, an inspection ALREADY OPEN when convergence happens stays open and correct too.');
        ctx.openObserverLocalEncounterPublication();
        assert(openPublicationCommand.calls.length === 1 && openPublicationCommand.calls[0][0].id === publication.id,
            'H5. Open, from the now-stale-but-still-open inspection panel, still resolves correctly.');

        // Structural confirmation that this independence is not
        // incidental: `selectObserverLocalEncounter()`'s own body never
        // reads `projectedObserverLocalEncounters` or `publicationRows`.
        const canvasSource = codeOnly((await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n'));
        const selectBody = methodBody(canvasSource, 'selectObserverLocalEncounter\\(marker\\)', 8);
        for (const forbidden of ['projectedObserverLocalEncounters', 'publicationRows', 'projectedPublications']) {
            assert(!selectBody.includes(forbidden), `H6. selectObserverLocalEncounter()'s own body never reads '${forbidden}' — the selection is a plain, independent write, structurally incapable of being invalidated by a change to the projected list a future filter would alter.`);
        }

        unmountCanvas(ctx);
        console.log('✓ H: an observer-local inspection already open when the same Publication converges stays open, correctly resolved, and fully actionable — a presentational filter over `projectedObserverLocalEncounters` alone (never touching `selectedObserverLocalEncounter`/`observerLocalEncounterInspection`) cannot corrupt it, by construction. This establishes what the existing seams already permit; it does not, per this milestone\'s own brief, decide what SHOULD happen to an open inspection — that remains an explicit product decision for 0.9.570 to make, not an accident this audit forces.');
    }

    // =======================================================================
    // Section I — async race independence.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const contentHash = 'section-i-hash';
        const publication = makePublication({ id: 'section-i-pub', title: 'Section I Publication', contentHash });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publication.id]: true });

        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash, position: { x: 4, y: 0, z: 4 } });

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store, materialSources: { local: localSource }, materialVerifier: verifier });
        mountCanvas(ctx);

        // Start an inspection (kicks off `refreshObserverLocalEncounterInspection()`,
        // which bumps `observerLocalEncounterInspectionRequestId` and
        // begins an async resolution) but do NOT await it yet.
        ctx.selectObserverLocalEncounter({ publicationId: publication.id, contentHash });
        const requestIdAfterSelect = ctx.observerLocalEncounterInspectionRequestId;

        // While that inspection is still in flight, the authoritative
        // registration arrives — a synchronous call, on the registry's
        // own independent reactive channel.
        placeAuthoritatively(registry, publication, { x: 25, y: 0, z: 25 });
        assert(ctx.observerLocalEncounterInspectionRequestId === requestIdAfterSelect,
            'I1. Registering a placement never bumps `observerLocalEncounterInspectionRequestId` — the two channels (primary registry membership, observer-local inspection loading) are read from, and guarded by, completely independent state; nothing about the registry\'s own notification path touches this counter.');

        await flushMicrotasks();
        assert(ctx.observerLocalEncounterInspection !== null && ctx.observerLocalEncounterInspectionRequestId === requestIdAfterSelect,
            'I2. The in-flight inspection completes normally, resolved by the SAME requestId it started with — the registration that happened mid-flight neither invalidated nor duplicated it.');

        // Reverse ordering: registration first, THEN the inspection
        // request — confirming no ordering-dependent corruption either.
        const registry2 = new WorldDiscoverySourceRegistry();
        const store2 = new ObserverLocalEncounterStore();
        const publication2 = makePublication({ id: 'section-i-pub-2', title: 'Section I Publication 2', contentHash: 'section-i-hash-2' });
        knowPublicationsLocally(storageProvider, [publication2]);
        recordObserverLocalEncounter(store2, { publicationId: publication2.id, contentHash: publication2.contentHash, position: { x: 6, y: 0, z: 6 } });
        placeAuthoritatively(registry2, publication2, { x: 30, y: 0, z: 30 });
        const ctx2 = buildCanvasInstance({ registry: registry2, observerLocalEncounterRegistry: store2, materialSources: { local: localSource }, materialVerifier: new MapVerifier({ [publication2.id]: true }) });
        mountCanvas(ctx2);
        ctx2.selectObserverLocalEncounter({ publicationId: publication2.id, contentHash: publication2.contentHash });
        await flushMicrotasks();
        assert(ctx2.observerLocalEncounterActionablePublication && ctx2.observerLocalEncounterActionablePublication.id === publication2.id,
            'I3. The reverse ordering (registration already landed before the inspection is even opened) resolves correctly too — no stale pre-registration state exists anywhere to resurrect.');

        unmountCanvas(ctx);
        unmountCanvas(ctx2);
        console.log('✓ I: the primary registry\'s own reactive update and the observer-local inspection\'s own `requestId` guard are two structurally independent channels — an authoritative placement arriving before, during, or after an observer-local inspection never corrupts, duplicates, or resurrects that inspection in either direction. A future presentational filter, being a pure computed reading both already-live channels, introduces no new race of its own: it has no asynchronous step, no request to guard, and nothing it could resurrect.');
    }

    // =======================================================================
    // Section J — smallest ownership boundary: a structural sweep.
    // =======================================================================
    {
        const storeSource = codeOnly(await readSource('application/worldEncounter/ObserverLocalEncounterStore.js'));
        for (const forbidden of ['WorldDiscoverySourceRegistry', 'PlacementRecord', 'LocalPlacementRegistry', 'publicationRows', 'effectiveView']) {
            assert(!storeSource.includes(forbidden), `J1. ObserverLocalEncounterStore.js never references '${forbidden}' — it has no way to know whether ANY publicationId it holds is authoritatively placed, and per its own header must stay "a genuinely new, session-scoped surface," never one that reaches back into the primary channel's own vocabulary. It is NOT the right owner for this filter.`);
        }

        const worldViewSource = codeOnly((await Promise.all(worldViewFiles().map((file) => readSource(file)))).join('\n'));
        assert(!/observerLocalEncounterRegistry[\s\S]{0,200}(registry|worldDiscoverySourceRegistry)\.(listSources|list)\(/.test(worldViewSource),
            'J2. WorldView.js never joins `observerLocalEncounterRegistry` state against `registry`/`worldDiscoverySourceRegistry` membership anywhere in its own body — it hands both straight through to `WorldEncounterCanvas` as two of that component\'s own props, exactly as its own header already documents ("registry stays the ONE seam WorldEncounterCanvas reads authoritative World state through," "handed straight through"). It is a composer, never a reconciler, and per that same established convention should not become one merely to host this filter.');
        assert(worldViewSource.includes('observerLocalEncounterRegistry'), 'J2b. Sanity — WorldView.js does genuinely wire the prop through (confirming J2 is a real absence of reconciliation, not merely an absence of the prop itself).');

        // WorldEncounterCanvas.js already holds BOTH `publicationRows` and
        // `observerLocalEncounters` as sibling computed state, in the same
        // component instance, each already reactively fed (Section B) —
        // the one place a pure "does this publicationId already have a
        // publicationRows row" computed can be added with zero new props,
        // zero new stores, and zero new subscriptions.
        const canvasSource = codeOnly((await Promise.all(worldEncounterCanvasFiles().map((file) => readSource(file)))).join('\n'));
        assert(canvasSource.includes('publicationRows()') && canvasSource.includes('observerLocalEncounters:'),
            'J3. WorldEncounterCanvas.js already holds `publicationRows` (registry-derived) and `observerLocalEncounters` (store-derived) as two independent, already-reactive members of the SAME component instance — the only file, of the three swept here, in a position to compute their intersection without any new wiring.');
        assert(canvasSource.includes('projectedObserverLocalEncounters()'),
            'J4. `projectedObserverLocalEncounters` — the exact computed the template already renders from — already exists in this file and is already the one, and only, place `observerLocalEncounters` is turned into what actually renders; it is the narrowest possible seam for a publicationId-membership filter, requiring a change to this one computed\'s own body and nothing upstream or downstream of it.');

        console.log('✓ J: `ObserverLocalEncounterStore.js` cannot host this filter without violating its own documented, deliberately-scoped contract (Section C); `WorldView.js` is, by its own established and consistently-applied convention, a composer rather than a reconciler and should stay one; `WorldEncounterCanvas.js`\'s own `projectedObserverLocalEncounters` computed — which already reads sibling, already-reactive `publicationRows`/`observerLocalEncounters` state in the same instance — is the smallest existing seam capable of expressing this filter.');
    }

    // =======================================================================
    // Section K — reference-filter validation.
    //
    // AMENDED BY 0.9.570 — K1 now reads the RAW store contents (see Section
    // E's own amendment note); K2 cross-checks the reference filter against
    // the raw contents; K2b, new, confirms the shipped filter's own live
    // output agrees.
    // =======================================================================
    {
        // Re-run the adversarial fixtures from Sections E/F through the
        // SAME local, never-shipped reference filter, collected here as
        // one final cross-check that the recommended key (publicationId)
        // and seam (a filter over `projectedObserverLocalEncounters`,
        // fed by `publicationRows`) jointly produce the correct answer on
        // every fixture this audit built — not merely each in isolation.
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const placed = makePublication({ id: 'section-k-placed', title: 'Section K Placed', contentHash: 'hash-k-placed' });
        const unplaced = makePublication({ id: 'section-k-unplaced', title: 'Section K Unplaced', contentHash: 'hash-k-placed' }); // shares contentHash with `placed`
        recordObserverLocalEncounter(store, { publicationId: placed.id, contentHash: placed.contentHash, position: { x: 1, y: 0, z: 1 } });
        recordObserverLocalEncounter(store, { publicationId: unplaced.id, contentHash: unplaced.contentHash, position: { x: 50, y: 0, z: 50 } });
        placeAuthoritatively(registry, placed, { x: 99, y: 0, z: 99 }); // deliberately disagrees with the recorded observer-local position

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        const publicationRows = publicationRowsOf(ctx);
        const observerLocalRows = projectedObserverLocalEncountersOf(ctx);
        const rawObserverLocalRows = store.list().map((e) => ({ publicationId: e.publicationId, contentHash: e.contentHash }));
        assert(rawObserverLocalRows.length === 2, 'K1. Sanity — both markers exist in the raw store, pre-filter.');

        const converged = hypotheticalConvergedObserverLocalRows(rawObserverLocalRows, publicationRows);
        assert(converged.length === 1 && converged[0].publicationId === unplaced.id,
            'K2. The reference filter, applied to a fixture combining shared contentHash AND position disagreement AND a genuine placement in one scenario, produces exactly the right result: the placed Publication\'s own stale marker is gone, the unplaced one (despite sharing its contentHash) remains.');
        assert(observerLocalRows.length === 1 && observerLocalRows[0].publicationId === unplaced.id,
            'K2b. (AMENDED BY 0.9.570) The shipped production filter\'s own live output agrees exactly, on this same compound fixture.');

        // O(1)-per-row shape: the filter never does anything more
        // expensive than a Set lookup per observer-local row — confirming
        // it stays well inside `projectedObserverLocalEncounters`'s own
        // existing "plain .map(), no ranking, no sorting" complexity
        // budget (this file's own header, 0.9.552).
        const filterSource = hypotheticalConvergedObserverLocalRows.toString();
        assert(!/\.sort\(|\.find\(|\.some\(|\.every\(/.test(filterSource),
            'K3. The reference implementation is a single Set construction plus one `.filter()` — no per-row `.find()`/`.some()` scan, no sort, matching `projectedObserverLocalEncounters`\'s own existing "no ranking, sorting, or scoring" restraint (0.9.552).');

        unmountCanvas(ctx);
        console.log('✓ K: a filter keyed by `publicationId`, fed by `publicationRows`\'s own already-computed `objectId` set, correctly resolves every fixture this audit built — including the compound case (shared contentHash + disagreeing position + a genuine placement) exercising Sections E and F\'s own findings together — at O(1) additional cost per observer-local row.');
    }

    // =======================================================================
    // Section L — verdict and recommendation for 0.9.570.
    // =======================================================================
    {
        const classifications = [
            ['Is the 0.9.568 Section D duplicate reproducible at the presentation layer alone, independent of the specific cascade/panel path that first found it?', 'CONFIRMED — Section A.'],
            ['Does suppressing it require a new event, notification, or polling mechanism?', 'NO — Section B: the registry\'s own pre-existing (0.9.13) subscription already keeps the needed signal live.'],
            ['Can the fix live inside ObserverLocalEncounterStore.js?', 'NO — Section C/J: that file\'s own documented contract carries no removal seam and no knowledge of the primary registry; adding either would be a second milestone of its own, not a side effect of this one.'],
            ['What identity key must the fix use?', '`publicationId` — Section E/F/K: `contentHash` and coordinate (dis)agreement each independently produce a wrong result on at least one adversarial fixture; `publicationId` alone resolves all of them, including in combination.'],
            ['Can the fix live inside WorldView.js?', 'NO, BY THIS CODEBASE\'S OWN ESTABLISHED CONVENTION — Section J: that file is a composer, not a reconciler, for every other registry/store pair it already hands to WorldEncounterCanvas; making it one here would be a new, inconsistent role for that file.'],
            ['Where is the smallest capable seam?', '`ui/components/WorldEncounterCanvas.js`\'s own `projectedObserverLocalEncounters` computed — Section J: the one place already holding both `publicationRows` and `observerLocalEncounters` as live sibling state in the same instance.'],
            ['Does an open observer-local inspection need to be redesigned first?', 'NO — Section H: `selectedObserverLocalEncounter`/`observerLocalEncounterInspection` are independent of the projected list a filter would change, and stay correct through convergence today, with no redesign. (This audit does not decide what SHOULD happen to an open inspection when convergence occurs — that remains 0.9.570\'s own explicit product decision, not a side effect this audit\'s findings force.)'],
            ['Does the fix introduce a new race?', 'NO — Section I: the primary channel\'s own reactivity and the observer-local inspection\'s own requestId guard are already independent; a pure, synchronous filter adds no asynchronous step of its own.'],
            ['Does the existing product vocabulary support outright suppression (vs. some transitional/merged visual state)?', 'YES — Section G: the current rendering model has exactly two states and no third; suppression is the only change expressible without new UI.']
        ];
        for (const [question, verdict] of classifications) {
            assert(typeof question === 'string' && typeof verdict === 'string' && verdict.length > 0, `L. classification entry malformed: ${question}`);
        }
        console.log('\nCONVERGENCE_BOUNDARY_LOCATED. Verdict table:');
        for (const [question, verdict] of classifications) {
            console.log(`  - ${question}\n    -> ${verdict}`);
        }

        console.log('\nRECOMMENDATION FOR 0.9.570 (IMPLEMENTED — see AMENDED notes on Sections A/E/F/K, above, and tests/SuppressObserverLocalGhostsAfterAuthoritativePlacement.test.js): add exactly one new computed step to `ui/components/WorldEncounterCanvas.js`\'s own `projectedObserverLocalEncounters` — filtering out any observer-local row whose `publicationId` already appears (by `objectId`) in `publicationRows` — with no change to `ObserverLocalEncounterStore.js`, `WorldView.js`, `PlacementRecord`, or `WorldDiscoverySourceRegistry`, and no new prop, event, or subscription. 0.9.570 also made its own explicit, documented decision (left open by this audit\'s own Section H) about whether an inspection panel already open on a converging encounter should be left alone, dismissed, or transitioned: LEFT ALONE — an already-open observer-local inspection is independent selection state, never re-derived from the projected marker list, and the existing product copy already disclaims permanence for it.');
    }

    console.log('\n✅ All Observer-Local to Authoritative Placement Presentation Convergence Boundary Audit tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
