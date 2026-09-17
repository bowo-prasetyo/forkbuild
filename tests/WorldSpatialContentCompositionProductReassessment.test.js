import { readFile } from 'node:fs/promises';

import { WorldDiscoverySourceRegistry } from '../application/WorldDiscoverySourceRegistry.js';
import { ObserverLocalEncounterStore } from '../application/ObserverLocalEncounterStore.js';
import { describeObserverLocalPublicationEncounter } from '../core/ObserverLocalPublicationEncounter.js';
import { resolveSnapshotWorldPlacement } from '../application/SnapshotWorldPlacement.js';
import {
    registerMaterializedSnapshotWorldSource,
    unregisterMaterializedSnapshotWorldSource
} from '../application/MaterializedSnapshotWorldDiscoveryBridge.js';
import { StoreSnapshotContentOutcome } from '../application/StoreSnapshotContentOutcome.js';
import { SnapshotWorldPlacementOutcome } from '../application/SnapshotWorldPlacementOutcome.js';
import { SnapshotWorldRegistrationOutcome } from '../application/SnapshotWorldRegistrationOutcome.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { resolveSnapshotWorldPositionClaim } from '../application/SnapshotWorldPositionClaim.js';
import { SnapshotWorldPositionClaimOutcome } from '../application/SnapshotWorldPositionClaimOutcome.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Publication } from '../publisher/Publication.js';
import { ContentReference } from '../core/ContentReference.js';
import WorldEncounterCanvas from '../ui/components/WorldEncounterCanvas.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';

// 0.9.578 — World Spatial Content Composition Product Reassessment.
//
// TYPE: test-only reassessment. No production code changed.
//
// 0.9.576 closed World identity + session lifecycle; 0.9.577 closed the
// create -> edit -> publish -> fork -> reload boundary. Both left the same
// adjacent question standing, unexamined as a WHOLE: this codebase has
// deliberately built three, architecturally distinct ways for something
// to appear spatially in World View —
//
//   PlacementRecord            = authoritative, persistent World state
//                                 (core/PlacementRecord.js +
//                                 placement/LocalPlacementRegistry.js,
//                                 surfaced via application/
//                                 WorldDiscoverySourceRegistry.js's own
//                                 registerMaterializedSnapshotWorldSource())
//   claimedPosition             = a publisher's own, decentralized,
//                                 NEVER-automatically-consumed position
//                                 claim (application/
//                                 SnapshotWorldPositionClaim.js, consumed
//                                 only via ui/components/
//                                 OwnPublicationPanel.js#useClaimedSnapshotPosition())
//   ObserverLocalEncounter      = a Wanderer's own session-scoped,
//                                 ephemeral discovery (core/
//                                 ObserverLocalPublicationEncounter.js +
//                                 application/ObserverLocalEncounterStore.js)
//
// — and every prior milestone in this lineage (0.9.565 through 0.9.571)
// tested each mechanism ALONE, or two at a time. None ever put all three
// into ONE World, at once, and asked the actual product question: does
// the Wanderer's experience keep them apart when they physically collide?
// This milestone is that reassessment.
//
// CENTRAL FINDING, STATED UP FRONT (see Section C for the evidence): the
// brief this milestone started from assumed a Wanderer could "encounter"
// a claimedPosition while walking, the same way they encounter a
// PlacementRecord or an ObserverLocalEncounter. That assumption is FALSE,
// and demonstrably so — `ui/components/WorldEncounterCanvas.js` (the only
// surface a walking Wanderer's own World View renders through) neither
// imports `application/SnapshotWorldPositionClaim.js` nor reads
// `claimedPosition` anywhere (already proven structurally by 0.9.571
// Section B5, reconfirmed here); a claim lives ENTIRELY inside
// `ui/components/OwnPublicationPanel.js`'s own component-instance state,
// visible only to the Publication's own owner while THEY inspect a
// discovery candidate, never rendered as a marker of any kind. A claim
// becomes spatially visible to a Wanderer only once it converges into an
// ordinary authoritative placement via the SAME explicit
// place -> register chain any other Snapshot uses — at which point it is
// no longer presented as a claim at all. Section I's own walkthrough is
// written around this corrected fact rather than the brief's original
// (mistaken) framing, which is itself the most useful thing this
// reassessment found.
//
//   A — Spatial-content inventory: confirms, structurally, that exactly
//       three mechanisms exist and a fourth does not.
//   B — Authoritative placement: PlacementRecord's own persistent
//       identity, independent of contentHash, claimedPosition, and
//       ObserverLocalEncounter — reconfirmed against the real
//       LocalPlacementRegistry, not merely the discovery-registry layer
//       0.9.571 already exercised.
//   C — Distributed claimedPosition: proves, behaviorally, that a
//       CONSUMED claim still renders NOTHING in World View until an
//       independent, explicit place+register action follows — the
//       central finding above.
//   D — Observer-local discovery: one fresh confirming journey, citing
//       0.9.552-0.9.554/0.9.568-0.9.571 rather than repeating their own
//       exhaustive coverage.
//   E — Three-way coexistence: the flagship data-level scene — one World,
//       one authoritative placement, one unconverted claim, one
//       observer-local encounter, plus every identity adversary the brief
//       named (shared contentHash, shared coordinates, a claim addressed
//       to the wrong Publication).
//   F — Convergence in context: 0.9.570/571's own suppression mechanism,
//       re-run inside Section E's noisier scene rather than in isolation.
//   G — Selection & inspection semantics: the two independent selection
//       state machines, both populated at once, cross-checked against
//       three Publications sharing one contentHash.
//   H — Vocabulary sweep: an automated grep of both components' own
//       `template` literals for the exact banned/expected words the
//       brief named.
//   I — Walkthrough: the corrected flagship journey.
//   J — Cross-session behavior: two independent WorldView mounts sharing
//       one registry; a fresh OwnPublicationPanel instance's own claim
//       state starts empty regardless of what a prior instance decided.
//   K — Failure isolation: two REAL failure paths already built into
//       registerMaterializedSnapshotWorldSource() (a non-PLACED
//       materialization; a publicationId mismatch), plus a malformed
//       observer-local encounter, each proven not to disturb any sibling
//       Publication's own presentation.
//   L — Verdict.
//
// Deliberately excluded, per this milestone's own originating brief: any
// new spatial-content abstraction, automatic placement of claimed
// positions, reputation/trust scoring, moderation, spatial ranking,
// coordinate-based deduplication, new collision rules, World physics
// changes, new discovery mechanisms, persistent observer-local
// encounters, automatic conversion of claims into PlacementRecords. This
// file changes no production code; it is reassessment only.

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
function templateOf(source, startMarker) {
    const start = source.indexOf(startMarker);
    assert(start !== -1, `templateOf(): could not find "${startMarker}"`);
    const backtickStart = source.indexOf('`', start);
    const backtickEnd = source.lastIndexOf('`');
    assert(backtickEnd > backtickStart, 'templateOf(): could not find the template literal\'s own closing backtick');
    return source.slice(backtickStart + 1, backtickEnd);
}

// ===================================================================
// Harness — reuses tests/ObserverLocalAuthoritativePlacementPresentation
// ClosureReassessment.test.js's own canvas harness and tests/
// DistributedPublicationPositionClaimEndToEndProductReassessment.test.js's
// own OwnPublicationPanel harness, verbatim, per this codebase's own
// established precedent for a coexistence reassessment reusing its
// predecessors' rigs rather than inventing a third one.
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

// The real ui/components/OwnPublicationPanel.js interaction surface —
// mirrors tests/DistributedPublicationPositionClaimEndToEndProductReassessment.test.js's
// own panelCtx() exactly.
function panelCtx(overrides = {}) {
    return {
        publication: null,
        placementInfo: null,
        worldDiscoverySourceRegistry: null,
        selectedSnapshotCandidate: null,
        selectedSnapshotMaterializationResult: null,
        selectedSnapshotWorldPlacementResult: null,
        selectedSnapshotWorldRegistrationResult: null,
        selectedSnapshotWorldPositionClaimResult: null,
        useClaimedSnapshotPosition: OwnPublicationPanel.methods.useClaimedSnapshotPosition,
        placeMaterializedSnapshot: OwnPublicationPanel.methods.placeMaterializedSnapshot,
        registerMaterializedSnapshot: OwnPublicationPanel.methods.registerMaterializedSnapshot,
        ...overrides
    };
}

function candidateFor(publication, claimedPosition, publicationIdOverride) {
    const candidate = { contentHash: publication.contentHash, locator: `local://${publication.id}`, storage: 'local' };
    if (claimedPosition) {
        candidate.publicationId = publicationIdOverride !== undefined ? publicationIdOverride : publication.id;
        candidate.claimedPosition = claimedPosition;
    }
    return candidate;
}

function materializedResultFor(publication) {
    return { outcome: StoreSnapshotContentOutcome.STORED, contentHash: publication.contentHash, contentReference: publication.contentReference };
}

async function run() {
    console.log('Running World Spatial Content Composition Product Reassessment tests...\n');

    // =======================================================================
    // Section A — spatial-content inventory.
    //
    // Structural, not behavioral: confirms exactly three mechanisms exist,
    // and a fourth does not. Every fact below is a source citation, never
    // an assumption.
    // =======================================================================
    {
        const canvasSource = codeOnly(await readSource('ui/components/WorldEncounterCanvas.js'));
        const panelSource = codeOnly(await readSource('ui/components/OwnPublicationPanel.js'));

        // Mechanism 1 — authoritative placement. Rendered via
        // `projectedPublications`, sourced from `publicationRows`
        // (`effectiveView.publications`), which is itself either the
        // page-local `view` prop or, when a `registry` is supplied,
        // `worldView` — refreshed only from
        // `WorldDiscoverySourceRegistry#listSources()`. No second source
        // of `publicationRows` exists.
        assert(canvasSource.includes('projectedPublications()') && canvasSource.includes('publicationRows()'),
            'A1. WorldEncounterCanvas.js defines exactly the authoritative-placement pipeline this milestone assumes.');

        // Mechanism 2 — observer-local encounter. A third, genuinely
        // separate projected array (`projectedObserverLocalEncounters`),
        // never merged into `projectedPublications` — see that computed's
        // own header, "0.9.552."
        assert(canvasSource.includes('projectedObserverLocalEncounters()'),
            'A2. WorldEncounterCanvas.js defines the observer-local pipeline as its own, separate computed.');

        // Mechanism 3 — claimedPosition. NEVER referenced by
        // WorldEncounterCanvas.js at all (reconfirms 0.9.571 Section B5);
        // its own only call site is OwnPublicationPanel.js.
        assert(!canvasSource.includes('claimedPosition') && !canvasSource.includes('SnapshotWorldPositionClaim'),
            'A3. WorldEncounterCanvas.js — the sole renderer of a walking Wanderer\'s World View — has no notion of claimedPosition whatsoever.');
        assert(panelSource.includes('resolveSnapshotWorldPositionClaim') && panelSource.includes('useClaimedSnapshotPosition'),
            'A3b. OwnPublicationPanel.js is the one, sole call site of the claimedPosition mechanism.');

        // No fourth mechanism: the only two `v-for` marker loops in
        // WorldEncounterCanvas.js's own template are `projectedPublications`
        // and `projectedObserverLocalEncounters` (avatars are a distinct,
        // pre-existing, non-Publication concept, named here only to show
        // it's accounted for and not a stray fourth "spatial content"
        // mechanism this milestone would need to reassess).
        const markerLoops = (canvasSource.match(/v-for="marker in (\w+)"/g) || []).map((m) => m.match(/v-for="marker in (\w+)"/)[1]);
        assert(markerLoops.length >= 2, 'A4a. sanity: the regex actually captured marker loops from the template.');
        assert(markerLoops.includes('projectedPublications') && markerLoops.includes('projectedObserverLocalEncounters'),
            'A4b. both known mechanisms\' own marker loops are present.');
        const nonAvatarNonKnownLoops = markerLoops.filter((name) => name !== 'projectedPublications' && name !== 'projectedObserverLocalEncounters' && name !== 'projectedAvatars');
        assert(nonAvatarNonKnownLoops.length === 0,
            `A4c. no fourth Publication-shaped marker loop exists in WorldEncounterCanvas.js's own template — found: ${JSON.stringify(nonAvatarNonKnownLoops)}.`);

        console.log('✓ A: exactly three spatial-content mechanisms exist in production — PlacementRecord-backed authoritative placement, the entirely separate observer-local encounter pipeline, and the claimedPosition mechanism, which is structurally confined to OwnPublicationPanel.js and never reaches WorldEncounterCanvas.js at all. No fourth mechanism was found.');
    }

    // =======================================================================
    // Section B — authoritative placement, reconfirmed at the
    // PERSISTENT-IDENTITY layer (core/PlacementRecord.js +
    // placement/LocalPlacementRegistry.js), one layer below the
    // discovery-registry layer 0.9.571 already exercised exhaustively.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const registry = new LocalPlacementRegistry(storageProvider, null);

        const recordA = new PlacementRecord({ publicationId: 'pub-B-A', position: { x: 1, y: 0, z: 1 } });
        const recordB = new PlacementRecord({ publicationId: 'pub-B-B', position: { x: 2, y: 0, z: 2 } });
        registry.add(recordA);
        registry.add(recordB);

        // B1 — independent of contentHash: LocalPlacementRegistry exposes
        // no findByContentHash() of any kind — its only identity lookup is
        // findByPublicationId(). Two Publications could share a
        // contentHash (0.9.163's own finding) and this layer has no way to
        // even ask the question by hash.
        assert(typeof registry.findByContentHash !== 'function',
            'B1. LocalPlacementRegistry has no contentHash-keyed lookup of any kind — identity here is publicationId, structurally, not incidentally.');
        assert(registry.findByPublicationId('pub-B-A').length === 1 && registry.findByPublicationId('pub-B-A')[0].publicationId === 'pub-B-A',
            'B1b. findByPublicationId() resolves each record to its own, correct publicationId.');
        assert(registry.findByPublicationId('pub-B-B').length === 1 && registry.findByPublicationId('pub-B-B')[0].publicationId === 'pub-B-B',
            'B1c. the sibling record resolves independently, never conflated.');

        // B2 — independent of claimedPosition and ObserverLocalEncounter:
        // structural — neither file imports or mentions either concept.
        const placementRecordSource = codeOnly(await readSource('core/PlacementRecord.js'));
        const localPlacementRegistrySource = codeOnly(await readSource('placement/LocalPlacementRegistry.js'));
        for (const [name, source] of [['core/PlacementRecord.js', placementRecordSource], ['placement/LocalPlacementRegistry.js', localPlacementRegistrySource]]) {
            assert(!source.includes('claimedPosition') && !source.includes('ObserverLocal'),
                `B2. ${name} references neither claimedPosition nor ObserverLocalEncounter — the persistent placement layer is unaware either exists.`);
        }

        // B3 — persistence: a fresh registry instance over the SAME
        // storage sees both records, byte-identical, without either ever
        // having touched a WorldDiscoverySourceRegistry, an
        // ObserverLocalEncounterStore, or a claimedPosition of any kind.
        const reloadedRegistry = new LocalPlacementRegistry(storageProvider, null);
        const reloadedA = reloadedRegistry.get(recordA.placementId);
        const reloadedB = reloadedRegistry.get(recordB.placementId);
        assert(reloadedA.publicationId === 'pub-B-A' && reloadedA.position.x === 1, 'B3a. record A survives a fresh registry instance over the same storage, unchanged.');
        assert(reloadedB.publicationId === 'pub-B-B' && reloadedB.position.x === 2, 'B3b. record B survives independently, unchanged.');

        console.log('✓ B: PlacementRecord\'s own persistent identity is keyed to publicationId alone — no contentHash-keyed lookup exists at all — and both core/PlacementRecord.js and placement/LocalPlacementRegistry.js remain structurally unaware claimedPosition or ObserverLocalEncounter exist.');
    }

    // =======================================================================
    // Section C — distributed claimedPosition: presentation semantics,
    // proven behaviorally. THIS IS THE MILESTONE'S CENTRAL FINDING.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publication = makePublication({ id: 'closure-C-pub', title: 'Section C Publication', contentHash: 'hash-C' });

        // C1 — before any claim is even consumed, the canvas (sharing the
        // SAME registry a real place+register action would use) shows
        // nothing for this Publication.
        const ctx = buildCanvasInstance({ registry });
        mountCanvas(ctx);
        assert(ctx.projectedPublications.length === 0, 'C1. Setup: nothing registered yet — the World is empty for this Publication.');

        // C2 — consume a real, well-formed, CLAIMED claim via the actual
        // production entry point, `useClaimedSnapshotPosition()`.
        const panel = panelCtx({ publication, selectedSnapshotCandidate: candidateFor(publication, { x: 77, y: 0, z: 77 }), worldDiscoverySourceRegistry: registry });
        panel.useClaimedSnapshotPosition();
        assert(panel.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED
            && panel.selectedSnapshotWorldPositionClaimResult.position.x === 77,
            'C2. Setup: the claim resolves CLAIMED, at position (77,0,77).');

        // C3 — THE CENTRAL FINDING. A CONSUMED claim, on its own, produces
        // ZERO spatial presentation. The canvas still shows nothing — not
        // a ghost, not a "suggested position" marker, not anything —
        // because nothing has called registerMaterializedSnapshotWorldSource()
        // yet, and WorldEncounterCanvas.js has no notion of claimedPosition
        // at all (Section A3). A Wanderer walking the World at this exact
        // moment cannot "encounter" this claim in any way.
        assert(ctx.projectedPublications.length === 0 && ctx.projectedObserverLocalEncounters.length === 0,
            'C3. A CONSUMED claim renders NOTHING in World View — no marker of any kind exists for it until an independent, explicit placement follows.');

        // C4 — a claim addressed to a DIFFERENT Publication (MISMATCHED)
        // is distinguished, in the panel's own result, from an absent
        // claim — but is equally invisible in World View, for the same
        // structural reason.
        const otherPublication = makePublication({ id: 'closure-C-other', title: 'Section C Other', contentHash: 'hash-C-other' });
        const mismatchedPanel = panelCtx({ publication: otherPublication, selectedSnapshotCandidate: candidateFor(publication, { x: 88, y: 0, z: 88 }), worldDiscoverySourceRegistry: registry });
        mismatchedPanel.useClaimedSnapshotPosition();
        assert(mismatchedPanel.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.MISMATCHED
            && mismatchedPanel.selectedSnapshotWorldPositionClaimResult.position === null,
            'C4. A candidate\'s claim addressed to a DIFFERENT publicationId resolves MISMATCHED, with no fabricated position.');
        assert(ctx.projectedPublications.length === 0, 'C4b. still nothing rendered for either Publication.');

        // C5 — the claim consumed in C2 now converges into an ORDINARY
        // authoritative placement via the SAME explicit place -> register
        // chain any other Snapshot uses. Once registered, it carries no
        // "claim" residue anywhere in the projected row — indistinguishable
        // in shape and vocabulary from a placement that was never a claim.
        panel.selectedSnapshotMaterializationResult = materializedResultFor(publication);
        panel.placeMaterializedSnapshot();
        assert(panel.selectedSnapshotWorldPlacementResult.outcome === SnapshotWorldPlacementOutcome.PLACED
            && panel.selectedSnapshotWorldPlacementResult.position.x === 77,
            'C5a. placeMaterializedSnapshot() borrows the CONSUMED claim\'s own position (77,0,77), not any fallback placementInfo.');
        panel.registerMaterializedSnapshot();
        assert(panel.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED,
            'C5b. registerMaterializedSnapshot() succeeds.');
        assert(ctx.projectedPublications.length === 1
            && ctx.projectedPublications[0].objectId === publication.id
            && Object.keys(ctx.projectedPublications[0]).sort().join(',') === 'label,objectId,x,y',
            'C5c. NOW, and only now, a marker appears — and it is an ORDINARY projectedPublications row (objectId/label/x/y only), carrying no "claim" field, no distinct rendering, no distinct vocabulary. A converged claim is, to the Wanderer, indistinguishable from any other authoritative placement.');

        unmountCanvas(ctx);
        console.log('✓ C: a distributed claimedPosition, even once explicitly CONSUMED, produces no spatial presentation of any kind until an independent, explicit place+register action follows — and once it does, it converges into an ordinary authoritative marker with no continuing "claim" identity. The brief\'s own framing ("a Wanderer encounters a claim while walking") does not hold; this is the milestone\'s central finding.');
    }

    // =======================================================================
    // Section D — observer-local discovery: one fresh confirming journey.
    // Exhaustively covered already by 0.9.552-0.9.554/0.9.568-0.9.571;
    // this section adds only the one fact those milestones had no reason
    // to check — that a real, persistent LocalPlacementRegistry stays at
    // zero records throughout an entire discover/inspect/comment journey.
    // =======================================================================
    {
        const storageProvider = new InMemoryStorageProvider();
        const placementRegistry = new LocalPlacementRegistry(storageProvider, null);
        const contentHash = 'hash-D';
        const publication = makePublication({ id: 'closure-D-pub', title: 'Section D Publication', contentHash });
        knowPublicationsLocally(storageProvider, [publication]);
        const localSource = new LocalWorldEncounterMaterialSource(storageProvider);
        const verifier = new MapVerifier({ [publication.id]: true });

        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const getPublicationCommentariesCommand = (publicationId) => [{ commentaryId: 'd1', publicationId, content: 'hi', authorIdentityId: 'bob' }];
        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store, materialSources: { local: localSource }, materialVerifier: verifier, getPublicationCommentariesCommand });
        mountCanvas(ctx);

        recordObserverLocalEncounter(store, { publicationId: publication.id, contentHash, position: { x: 9, y: 0, z: 9 } });
        assert(ctx.projectedObserverLocalEncounters.length === 1 && ctx.projectedPublications.length === 0,
            'D1. discover P while unplaced -> "Discovered here", alone.');
        assert(placementRegistry.list().length === 0, 'D1b. the real, persistent PlacementRegistry has zero records — discovery never writes one.');

        ctx.selectObserverLocalEncounter({ publicationId: publication.id, contentHash });
        await flushMicrotasks();
        assert(ctx.observerLocalEncounterActionablePublication && ctx.observerLocalEncounterActionablePublication.id === publication.id,
            'D2. Inspect P -> resolves to the real Publication.');
        ctx.toggleObserverLocalEncounterCommentary();
        await flushMicrotasks();
        assert(ctx.observerLocalEncounterCommentaries.length === 1, 'D3. Commentary resolves correctly.');
        assert(placementRegistry.list().length === 0, 'D3b. still zero PlacementRecords — inspection and commentary never promote anything.');

        const claimAttempt = resolveSnapshotWorldPositionClaim(candidateFor(publication, null), publication.id);
        assert(claimAttempt.outcome === SnapshotWorldPositionClaimOutcome.ABSENT, 'D4. no claimedPosition authority exists for this Publication either — never consulted, never fabricated.');

        unmountCanvas(ctx);
        console.log('✓ D: observer-local discovery, inspection, and commentary all proceed correctly while a REAL, persistent LocalPlacementRegistry stays at zero records throughout — full behavioral coverage already established by 0.9.552-0.9.554/0.9.568-0.9.571, cited rather than repeated.');
    }

    // =======================================================================
    // Section E — three-way coexistence: the flagship data-level scene,
    // plus every identity adversary the brief named.
    // =======================================================================
    let sceneCtx, sceneRegistry, sceneStore, P1, P2, P3, P4, sceneStorageProvider, sceneVerifier;
    {
        sceneStorageProvider = new InMemoryStorageProvider();
        sceneRegistry = new WorldDiscoverySourceRegistry();
        sceneStore = new ObserverLocalEncounterStore();

        // Three Publications, ALL sharing one contentHash — the strongest
        // adversary this codebase already knows to try (0.9.163).
        const sharedHash = 'three-way-shared-hash';
        P1 = makePublication({ id: 'scene-P1-authoritative', title: 'P1 Authoritative', contentHash: sharedHash });
        P2 = makePublication({ id: 'scene-P2-claim', title: 'P2 Claim', contentHash: sharedHash });
        P3 = makePublication({ id: 'scene-P3-observer-local', title: 'P3 Observer-Local', contentHash: sharedHash });

        knowPublicationsLocally(sceneStorageProvider, [P1, P2, P3]);
        const localSource = new LocalWorldEncounterMaterialSource(sceneStorageProvider);
        sceneVerifier = new MapVerifier({ [P1.id]: true, [P2.id]: true, [P3.id]: true });

        const openPublicationCommand = commandSpy();
        const forkPublicationCommand = commandSpy();
        const explorePublicationCommand = commandSpy();
        const getPublicationCommentariesCommand = (publicationId) => [{ commentaryId: `c-${publicationId}`, publicationId, content: 'hi', authorIdentityId: 'bob' }];

        sceneCtx = buildCanvasInstance({
            registry: sceneRegistry, observerLocalEncounterRegistry: sceneStore,
            materialSources: { local: localSource }, materialVerifier: sceneVerifier,
            openPublicationCommand, forkPublicationCommand, explorePublicationCommand, getPublicationCommentariesCommand
        });
        mountCanvas(sceneCtx);

        // P1: authoritative placement, at (10,0,10).
        const p1Result = placeAuthoritatively(sceneRegistry, P1, { x: 10, y: 0, z: 10 });
        assert(p1Result.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'E1. Setup: P1 is authoritatively placed.');

        // P2: a claim CONSUMED, at coordinates IDENTICAL to P3's own
        // observer-local encounter below — never placed or registered.
        const p2Panel = panelCtx({ publication: P2, selectedSnapshotCandidate: candidateFor(P2, { x: 20, y: 0, z: 20 }), worldDiscoverySourceRegistry: sceneRegistry });
        p2Panel.useClaimedSnapshotPosition();
        assert(p2Panel.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, 'E2. Setup: P2\'s claim is CLAIMED, never placed.');

        // P3: observer-local, at the SAME (20,0,20) P2's own claim named —
        // identity, not coordinate, must be what keeps these apart.
        recordObserverLocalEncounter(sceneStore, { publicationId: P3.id, contentHash: sharedHash, position: { x: 20, y: 0, z: 20 } });

        // ---- Assertions: exactly the right thing appears, exactly once ----
        assert(sceneCtx.projectedPublications.length === 1 && sceneCtx.projectedPublications[0].objectId === P1.id,
            'E3. Only P1 renders as an authoritative marker.');
        assert(sceneCtx.projectedObserverLocalEncounters.length === 1 && sceneCtx.projectedObserverLocalEncounters[0].publicationId === P3.id,
            'E4. Only P3 renders as an observer-local marker.');
        // P2 appears in neither array — its claim exists only inside
        // p2Panel's own component-instance state, which this shared
        // sceneCtx never reads or references.
        const anyReferenceToP2 = sceneCtx.projectedPublications.some((r) => r.objectId === P2.id)
            || sceneCtx.projectedObserverLocalEncounters.some((r) => r.publicationId === P2.id);
        assert(!anyReferenceToP2, 'E5. P2 appears NOWHERE in World View — spatial coincidence with P3\'s own coordinates never leaked it into either projected array.');

        // ---- Identity adversary: identical coordinates, different
        // Publications, never conflated. ----
        assert(sceneCtx.projectedPublications[0].x !== undefined && sceneCtx.projectedObserverLocalEncounters[0].x !== undefined,
            'E6a. sanity: both P1 and P3 carry a real projected coordinate.');
        // P1 sits at (10,0,10), P3's own marker at (20,0,20) — genuinely
        // different World coordinates, proving suppression/rendering keys
        // on publicationId, not proximity, without relying on floating
        // canvas-space comparison.
        assert(P1.id !== P3.id, 'E6b. sanity: P1 and P3 are different Publications.');

        // ---- Identity adversary: shared contentHash never merges rows. ----
        assert(P1.contentHash === P2.contentHash && P2.contentHash === P3.contentHash, 'E7a. sanity: all three Publications really do share one contentHash.');
        assert(sceneCtx.projectedPublications[0].objectId === P1.id
            && sceneCtx.projectedObserverLocalEncounters[0].publicationId === P3.id,
            'E7b. despite the shared contentHash, P1\'s own authoritative row and P3\'s own observer-local row each carry their own, distinct, correct publicationId — never each other\'s.');

        // ---- Convergence adversary: authoritative placement appearing
        // AFTER an observer-local discovery, run here as a FOURTH
        // Publication (P4) so Section F can build on it while P1/P2/P3
        // above stay as untouched noise. ----
        P4 = makePublication({ id: 'scene-P4-convergent', title: 'P4 Convergent', contentHash: 'scene-P4-own-hash' });
        knowPublicationsLocally(sceneStorageProvider, [P4]);
        sceneVerifier._map[P4.id] = true;
        recordObserverLocalEncounter(sceneStore, { publicationId: P4.id, contentHash: P4.contentHash, position: { x: 30, y: 0, z: 30 } });
        assert(sceneCtx.projectedObserverLocalEncounters.some((m) => m.publicationId === P4.id)
            && sceneCtx.projectedObserverLocalEncounters.length === 2,
            'E8. P4 discovered locally first, alongside P3 — both render, P1 and (absent) P2 unaffected.');
        const p4Placement = placeAuthoritatively(sceneRegistry, P4, { x: 31, y: 0, z: 31 });
        assert(p4Placement.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'E9. Setup: P4 now ALSO becomes authoritatively placed.');
        assert(sceneCtx.projectedPublications.length === 2
            && sceneCtx.projectedPublications.some((r) => r.objectId === P1.id)
            && sceneCtx.projectedPublications.some((r) => r.objectId === P4.id),
            'E10. P1 and P4 both now render authoritatively.');
        assert(sceneCtx.projectedObserverLocalEncounters.length === 1 && sceneCtx.projectedObserverLocalEncounters[0].publicationId === P3.id,
            'E11. P4\'s own observer-local ghost is suppressed by its NEW authoritative placement — P3\'s own ghost, an entirely different Publication, is completely unaffected.');

        console.log('✓ E: one World, one authoritative placement (P1), one consumed-but-never-placed claim (P2), one observer-local discovery (P3), and a fourth Publication (P4) converging from observer-local to authoritative mid-scene — three Publications sharing one contentHash, two sharing one coordinate — and every representation stayed exactly, correctly separate. Spatial coincidence never implied semantic equivalence.');
    }

    // =======================================================================
    // Section F — convergence in context: re-run 0.9.570/571's own
    // suppression mechanism INSIDE Section E's noisier scene, proving it
    // never disturbs P1 (authoritative), P2 (an unconverted claim,
    // referenced nowhere in this component), or P3 (a DIFFERENT,
    // unrelated observer-local encounter) at any step.
    // =======================================================================
    {
        // P4 is currently converged (placed, ghost suppressed) — walk
        // away: remove its authoritative placement.
        unregisterMaterializedSnapshotWorldSource(sceneRegistry, P4.contentHash, P4.id);
        assert(sceneCtx.projectedPublications.length === 1 && sceneCtx.projectedPublications[0].objectId === P1.id,
            'F1. P4\'s authoritative marker is gone; P1\'s own stays completely untouched.');
        assert(sceneCtx.projectedObserverLocalEncounters.length === 2
            && sceneCtx.projectedObserverLocalEncounters.some((m) => m.publicationId === P4.id)
            && sceneCtx.projectedObserverLocalEncounters.some((m) => m.publicationId === P3.id),
            'F2. P4\'s own observer-local ghost reappears; P3\'s own, unrelated ghost was there the whole time, undisturbed.');

        // Return: re-place P4 a second time.
        const secondPlacement = placeAuthoritatively(sceneRegistry, P4, { x: 32, y: 0, z: 32 });
        assert(secondPlacement.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'F3. Setup: second placement succeeds.');
        assert(sceneCtx.projectedPublications.length === 2, 'F4. P1 and P4 both authoritative again.');
        assert(sceneCtx.projectedObserverLocalEncounters.length === 1 && sceneCtx.projectedObserverLocalEncounters[0].publicationId === P3.id,
            'F5. P4 suppressed again; P3 remains, exactly as before — a second, independent convergence in a scene with real, unrelated Publications present the whole time, not merely a single-object toy scene.');

        console.log('✓ F: the suppression mechanism converges and reverts correctly a second time while P1 (authoritative) and P3 (an unrelated observer-local encounter) never move — convergence remains a pure presentation projection over publicationId identity, never a broader recomputation that could catch an innocent bystander.');
    }

    // =======================================================================
    // Section G — selection & inspection semantics: the two independent
    // selection state machines, BOTH populated at once, cross-checked
    // against three Publications (P1/P2/P3) sharing one contentHash.
    // =======================================================================
    {
        // Select P1 via the PRIMARY selection machinery.
        sceneCtx.selectEncounter({ kind: 'PUBLICATION', objectId: P1.id });
        assert(sceneCtx.selectionOutcome.status === 'RESOLVED' && sceneCtx.selectionOutcome.resolvedSelection.objectId === P1.id,
            'G1. Primary selection resolves to P1, exactly, despite P1/P3 sharing one contentHash.');

        // Independently, select P3's own observer-local marker.
        sceneCtx.selectObserverLocalEncounter({ publicationId: P3.id, contentHash: P3.contentHash });
        await flushMicrotasks();
        assert(sceneCtx.observerLocalEncounterResolvedSelection && sceneCtx.observerLocalEncounterResolvedSelection.objectId === P3.id,
            'G2. Observer-local selection resolves to P3, independently.');

        // The PRIMARY selection's own outcome is completely untouched by
        // the observer-local selection that just happened, one line above.
        assert(sceneCtx.selectionOutcome.status === 'RESOLVED' && sceneCtx.selectionOutcome.resolvedSelection.objectId === P1.id,
            'G3. Selecting P3 through the observer-local pathway left the PRIMARY selection (still P1) completely unchanged — two independent state machines, not one reused for both.');

        assert(sceneCtx.observerLocalEncounterActionablePublication && sceneCtx.observerLocalEncounterActionablePublication.id === P3.id,
            'G4. Inspection resolves to P3, never P1 or P2, despite the shared contentHash.');

        // P2's own claim has no selection surface in this component at
        // all — already proven structurally in Section A3; reconfirmed
        // behaviorally here by the simple fact that P2 never appeared in
        // either projected array (Section E5), so there is no marker for
        // a Wanderer to click on in the first place.
        assert(!sceneCtx.projectedPublications.some((r) => r.objectId === P2.id)
            && !sceneCtx.projectedObserverLocalEncounters.some((r) => r.publicationId === P2.id),
            'G5. P2 remains unselectable through this component — there is nothing rendered for it to select.');

        console.log('✓ G: the primary (`selectEncounter`/`selectionOutcome`) and observer-local (`selectObserverLocalEncounter`/`observerLocalEncounterResolvedSelection`) selection machines stayed fully independent with BOTH populated simultaneously, and inspection resolved each Publication to its own correct identity despite all three sharing one contentHash.');
    }

    // =======================================================================
    // Section H — vocabulary sweep: an automated grep of both components'
    // own `template` literals.
    // =======================================================================
    {
        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        const panelSource = await readSource('ui/components/OwnPublicationPanel.js');
        // HTML comments inside a template literal are developer notes,
        // never rendered UI text (e.g. OwnPublicationPanel.js's own
        // template carries a comment mentioning a hypothetical "trusted"
        // label it explicitly never built) — stripped before the sweep so
        // this check reflects what a Wanderer actually sees, not prose
        // ABOUT what was deliberately not built.
        function stripHtmlComments(text) {
            return text.replace(/<!--[\s\S]*?-->/g, ' ');
        }
        const canvasTemplate = stripHtmlComments(templateOf(canvasSource, "\n    template:")).toLowerCase();
        const panelTemplate = stripHtmlComments(templateOf(panelSource, "\n    template:")).toLowerCase();

        const banned = ['official', 'trusted', 'verified location', 'owned', 'permanent'];
        for (const word of banned) {
            assert(!canvasTemplate.includes(word), `H1. WorldEncounterCanvas.js's own template never uses the word "${word}".`);
            assert(!panelTemplate.includes(word), `H2. OwnPublicationPanel.js's own template never uses the word "${word}".`);
        }

        const expectedCanvasPhrases = ['discovered here', 'discovered publication', 'placements'];
        for (const phrase of expectedCanvasPhrases) {
            assert(canvasTemplate.includes(phrase), `H3. WorldEncounterCanvas.js's own template uses the established phrase "${phrase}".`);
        }
        const expectedPanelPhrases = ['use claimed position', 'claimed position', 'place materialized snapshot'];
        for (const phrase of expectedPanelPhrases) {
            assert(panelTemplate.includes(phrase), `H4. OwnPublicationPanel.js's own template uses the established phrase "${phrase}".`);
        }

        console.log('✓ H: neither component\'s own template ever uses "official," "trusted," "verified location," "owned," or "permanent" to describe a placement, a claim, or an observer-local encounter — and each component\'s own established, narrower vocabulary ("Discovered here," "Claimed Position," "Placements") is exactly where the brief expected it.');
    }

    // =======================================================================
    // Section I — walkthrough: the CORRECTED flagship journey (see this
    // file's own header for why the brief's original framing — a Wanderer
    // "encountering" a claim while walking — does not hold).
    // =======================================================================
    {
        // The Wanderer, still standing in Section E/F/G's own World,
        // walks toward P3's own spot and inspects it (already observer-
        // local from Section E).
        sceneCtx.selectObserverLocalEncounter({ publicationId: P3.id, contentHash: P3.contentHash });
        await flushMicrotasks();
        assert(sceneCtx.observerLocalEncounterActionablePublication.id === P3.id, 'I1. Wanderer inspects P3, discovered locally.');
        sceneCtx.openObserverLocalEncounterPublication();

        // Off to the side of the Wanderer's own walk — a DIFFERENT actor,
        // P2's own publisher, explicitly consumes their claim and places
        // it, through OwnPublicationPanel, entirely independent of
        // anything the Wanderer is doing.
        const p2Panel = panelCtx({ publication: P2, selectedSnapshotCandidate: candidateFor(P2, { x: 40, y: 0, z: 40 }), worldDiscoverySourceRegistry: sceneRegistry });
        p2Panel.useClaimedSnapshotPosition();
        p2Panel.selectedSnapshotMaterializationResult = materializedResultFor(P2);
        p2Panel.placeMaterializedSnapshot();
        p2Panel.registerMaterializedSnapshot();
        assert(p2Panel.selectedSnapshotWorldRegistrationResult.outcome === SnapshotWorldRegistrationOutcome.REGISTERED, 'I2. P2\'s publisher places and registers their own claimed position.');

        // The Wanderer, continuing to walk the SAME live World, now sees
        // P2 too — as an ORDINARY authoritative marker, never as anything
        // called out as a former "claim."
        assert(sceneCtx.projectedPublications.some((r) => r.objectId === P2.id && r.x !== undefined),
            'I3. The Wanderer now encounters P2, reactively, the moment it converged — with no special "claim" presentation.');

        // The Wanderer also walks past P1 — authoritative from the very
        // start of the scene.
        sceneCtx.selectEncounter({ kind: 'PUBLICATION', objectId: P1.id });
        assert(sceneCtx.selectionOutcome.resolvedSelection.objectId === P1.id, 'I4. Wanderer also encounters P1, unaffected by anything since.');

        // The Wanderer returns to P3's own original spot: still, and only
        // ever, observer-local — it was never placed, and nothing in this
        // walk ever promoted it.
        assert(sceneCtx.projectedObserverLocalEncounters.some((m) => m.publicationId === P3.id),
            'I5. P3 remains observer-local on return — the Wanderer\'s own walk never converted it to anything else.');
        assert(!sceneCtx.projectedPublications.some((r) => r.objectId === P3.id), 'I5b. P3 never became authoritative merely because the Wanderer walked past it twice.');

        console.log('✓ I: a full walkthrough — discover P3, inspect it, a DIFFERENT actor converts P2\'s own claim into a placement off to the side, the Wanderer\'s own live World reactively picks it up with no residual "claim" framing, P1 remains encounterable throughout, and P3 stays observer-local on return. The brief\'s own scenario (a Wanderer directly "encountering" and "using" a claim while walking) does not describe this product — a claim is never something a Wanderer meets in the World; it is something a PUBLISHER decides, off-World, and only its RESULT is ever encountered.');
    }

    // =======================================================================
    // Section J — cross-session behavior.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const publication = makePublication({ id: 'closure-J-pub', title: 'Section J Publication', contentHash: 'hash-J' });
        placeAuthoritatively(registry, publication, { x: 5, y: 0, z: 5 });

        const storeA = new ObserverLocalEncounterStore();
        const storeB = new ObserverLocalEncounterStore();
        const ctxA = buildCanvasInstance({ registry, observerLocalEncounterRegistry: storeA });
        const ctxB = buildCanvasInstance({ registry, observerLocalEncounterRegistry: storeB });
        mountCanvas(ctxA);
        mountCanvas(ctxB);

        // The shared authoritative placement is visible identically in
        // BOTH sessions immediately.
        assert(ctxA.projectedPublications.length === 1 && ctxB.projectedPublications.length === 1,
            'J1. PlacementRecord/registry state is genuinely shared — both sessions see the SAME authoritative marker.');

        // Session A discovers a SECOND, genuinely novel Publication
        // locally; session B never does.
        const novelPublication = makePublication({ id: 'closure-J-novel', title: 'Section J Novel', contentHash: 'hash-J-novel' });
        recordObserverLocalEncounter(storeA, { publicationId: novelPublication.id, contentHash: novelPublication.contentHash, position: { x: 6, y: 0, z: 6 } });
        assert(ctxA.projectedObserverLocalEncounters.length === 1, 'J2. Session A now shows the novel discovery.');
        assert(ctxB.projectedObserverLocalEncounters.length === 0,
            'J3. Session B — sharing the SAME registry, but its OWN, separate ObserverLocalEncounterStore — never inherited it. Observation is genuinely session-scoped, never a fact about the registry both sessions share.');

        // A brand-new, THIRD session/mount, constructed AFTER session A's
        // own discovery, still starts empty — a new session does not
        // inherit an observer-local marker merely because another session
        // observed it, at any point in time, not only "before it existed."
        const storeC = new ObserverLocalEncounterStore();
        const ctxC = buildCanvasInstance({ registry, observerLocalEncounterRegistry: storeC });
        mountCanvas(ctxC);
        assert(ctxC.projectedObserverLocalEncounters.length === 0 && ctxC.projectedPublications.length === 1,
            'J4. A fresh THIRD session sees the shared authoritative placement (genuinely shared state) but starts with zero observer-local encounters (genuinely session-local state), even though session A already recorded one.');

        unmountCanvas(ctxA); unmountCanvas(ctxB); unmountCanvas(ctxC);

        // claimedPosition-consumption is likewise never registry-backed —
        // a fresh OwnPublicationPanel instance for the SAME Publication
        // starts with no memory of a prior instance's own decision.
        const firstPanel = panelCtx({ publication: novelPublication, selectedSnapshotCandidate: candidateFor(novelPublication, { x: 7, y: 0, z: 7 }) });
        firstPanel.useClaimedSnapshotPosition();
        assert(firstPanel.selectedSnapshotWorldPositionClaimResult.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED, 'J5. Setup: the first panel instance consumed a real claim.');
        const freshPanel = panelCtx({ publication: novelPublication });
        assert(freshPanel.selectedSnapshotWorldPositionClaimResult === null,
            'J6. A fresh OwnPublicationPanel instance for the identical Publication starts with no claim result at all — consuming a claim is component-instance state, never persisted or shared across instances.');

        console.log('✓ J: PlacementRecord/registry state is genuinely shared across sessions; ObserverLocalEncounterStore state is genuinely session-scoped, including for a brand-new session created AFTER another session\'s own discovery; and claimedPosition consumption lives only in the OwnPublicationPanel instance that performed it.');
    }

    // =======================================================================
    // Section K — failure isolation. Two REAL failure paths already built
    // into registerMaterializedSnapshotWorldSource() (never a mock), plus
    // one malformed observer-local encounter.
    // =======================================================================
    {
        const registry = new WorldDiscoverySourceRegistry();
        const store = new ObserverLocalEncounterStore();
        const survivor = makePublication({ id: 'closure-K-survivor', title: 'Section K Survivor', contentHash: 'hash-K-survivor' });
        placeAuthoritatively(registry, survivor, { x: 1, y: 0, z: 1 });
        recordObserverLocalEncounter(store, { publicationId: 'closure-K-ghost', contentHash: 'hash-K-ghost', position: { x: 2, y: 0, z: 2 } });

        const ctx = buildCanvasInstance({ registry, observerLocalEncounterRegistry: store });
        mountCanvas(ctx);
        assert(ctx.projectedPublications.length === 1 && ctx.projectedObserverLocalEncounters.length === 1, 'K0. Setup: one authoritative survivor, one observer-local ghost.');

        // K1 — a materialization that never reached STORED/ALREADY_AVAILABLE
        // (real UNPLACED path, never mocked): registerMaterializedSnapshotWorldSource()
        // returns the failure outcome WITHOUT ever calling registry.setSource().
        const failing = makePublication({ id: 'closure-K-failing', title: 'Section K Failing', contentHash: 'hash-K-failing' });
        const unplaced = resolveSnapshotWorldPlacement({ outcome: StoreSnapshotContentOutcome.STORED, contentHash: failing.contentHash }, null);
        assert(unplaced.outcome === SnapshotWorldPlacementOutcome.UNPLACED, 'K1a. Setup: no placementInfo -> a real UNPLACED result.');
        const unplacedRegistration = registerMaterializedSnapshotWorldSource(registry, unplaced, failing);
        assert(unplacedRegistration.outcome === SnapshotWorldPlacementOutcome.UNPLACED, 'K1b. registerMaterializedSnapshotWorldSource() passes the failure through unchanged.');
        assert(ctx.projectedPublications.length === 1 && ctx.projectedPublications[0].objectId === survivor.id,
            'K1c. the survivor\'s own authoritative marker is completely untouched by the failing Publication\'s own UNPLACED outcome.');
        assert(ctx.projectedObserverLocalEncounters.length === 1, 'K1d. the unrelated observer-local ghost is likewise untouched.');

        // K2 — a publicationId mismatch: registerMaterializedSnapshotWorldSource()
        // throws BEFORE ever calling registry.setSource() (see that
        // function's own guard, which runs strictly before the one write
        // it ever performs).
        const wrongPublication = makePublication({ id: 'closure-K-wrong-identity', title: 'Wrong Identity', contentHash: 'hash-K-wrong' });
        const placementForFailing = resolveSnapshotWorldPlacement(
            { outcome: StoreSnapshotContentOutcome.STORED, contentHash: failing.contentHash },
            { placementId: 'placement:failing', publicationId: failing.id, position: { x: 3, y: 0, z: 3 } }
        );
        let threw = false;
        try {
            registerMaterializedSnapshotWorldSource(registry, placementForFailing, wrongPublication);
        } catch (error) {
            threw = true;
        }
        assert(threw, 'K2a. a publicationId mismatch between the placement result and the publication object throws, as designed.');
        assert(ctx.projectedPublications.length === 1 && ctx.projectedPublications[0].objectId === survivor.id,
            'K2b. the survivor remains the ONLY authoritative marker — the failed registration attempt for an unrelated Publication left the registry completely unchanged.');
        assert(ctx.projectedObserverLocalEncounters.length === 1, 'K2c. the observer-local ghost is likewise unaffected by an authoritative-placement failure elsewhere.');

        // K3 — a malformed observer-local encounter (missing contentHash)
        // is silently ignored by describeObserverLocalPublicationEncounter()
        // (returns null) — recordObserverLocalEncounter()'s own assert
        // exists only to catch a TEST bug; production code path is
        // store.record(), which itself ignores anything malformed handed
        // to it directly.
        const malformed = describeObserverLocalPublicationEncounter({ publicationId: 'closure-K-malformed', contentHash: '', encounterPosition: { x: 4, y: 0, z: 4 } });
        assert(malformed === null, 'K3a. Setup: a missing contentHash produces no encounter at all.');
        store.record(malformed);
        assert(ctx.projectedObserverLocalEncounters.length === 1, 'K3b. store.record(null) is silently ignored — the World remains exactly as usable as before, and the pre-existing ghost is untouched.');
        assert(ctx.projectedPublications.length === 1, 'K3c. the authoritative survivor is, of course, entirely unaffected by an observer-local malformation.');

        unmountCanvas(ctx);
        console.log('✓ K: two real placement-registration failure paths (a non-PLACED materialization; a publicationId mismatch) and one malformed observer-local encounter each left every OTHER Publication\'s own presentation — authoritative or observer-local — completely untouched, and left the World itself fully usable throughout.');
    }

    // =======================================================================
    // Section L — verdict.
    // =======================================================================
    {
        const classifications = [
            ['Do exactly three spatial-content mechanisms exist, and no fourth?', 'YES — Section A: structurally confirmed against both components\' own source and template.'],
            ['Is authoritative placement (PlacementRecord) independent of contentHash, claimedPosition, and ObserverLocalEncounter?', 'YES — Section B: reconfirmed at the persistent LocalPlacementRegistry layer, not merely the discovery-registry layer 0.9.571 already covered.'],
            ['Can a Wanderer ever spatially "encounter" a claimedPosition before it is explicitly placed?', 'NO — Section C, the milestone\'s own central finding: a consumed claim renders nothing until an independent place+register action converges it into an ordinary placement.'],
            ['Does spatial coincidence (shared contentHash, shared coordinates) ever cause two mechanisms/Publications to merge?', 'NO — Section E: three Publications sharing one contentHash, two sharing one coordinate, all stayed correctly separate.'],
            ['Does convergence/suppression stay correct with unrelated Publications present as noise?', 'YES — Section F: a second full convergence cycle, with P1/P3 as live bystanders, left both untouched.'],
            ['Do the two independent selection state machines stay independent when BOTH are populated at once?', 'YES — Section G, cross-checked against three Publications sharing one contentHash.'],
            ['Does the existing product vocabulary avoid collapsing "placed"/"claimed"/"discovered" into stronger, unearned words?', 'YES — Section H: an automated sweep of both components\' own templates found none of "official," "trusted," "verified location," "owned," "permanent."'],
            ['Does a realistic walkthrough combining all three mechanisms hold together?', 'YES, WITH A CORRECTION — Section I: the walkthrough holds, but only once reframed around Section C\'s own finding that a claim is a publisher-side decision, never a Wanderer-side encounter.'],
            ['Is the intended cross-session asymmetry (shared placement / session-local observation / instance-local claim) real?', 'YES — Section J, including a brand-new third session created AFTER another session\'s own discovery.'],
            ['Does a failure in one Publication\'s own spatial processing ever corrupt a sibling Publication\'s presentation?', 'NO — Section K: two real registration-failure paths and one malformed encounter, all isolated.']
        ];
        for (const [question, verdict] of classifications) {
            assert(typeof question === 'string' && typeof verdict === 'string' && verdict.length > 0, `L. classification entry malformed: ${question}`);
        }
        console.log('\nSPATIAL_CONTENT_COMPOSITION_REASSESSMENT complete. Verdict table:');
        for (const [question, verdict] of classifications) {
            console.log(`  - ${question}\n    -> ${verdict}`);
        }

        console.log(`
PRODUCT_COMPLETE. No production code change is warranted by this
milestone. The one thing worth carrying forward is a CORRECTED mental
model, not a code change: claimedPosition is not a fourth spatial-content
mechanism a Wanderer perceives in the World — it is a publisher-side
decision that either never becomes spatially real, or converges
completely into the ordinary authoritative-placement mechanism the
moment it does. The three-way architecture this sequence audited:

  PlacementRecord         = authoritative, persistent, World-wide
  claimedPosition          = publisher-side, pre-spatial, invisible in
                              World View until explicitly placed
  ObserverLocalEncounter   = observer-side, session-local, ephemeral

composes correctly under every adversarial combination this milestone
tried: shared contentHash, shared coordinates, a claim addressed to the
wrong Publication, a mid-scene convergence with unrelated bystanders
present, two independently populated selection machines, cross-session
isolation, and two real (never mocked) failure paths.

This milestone recommends moving on from Publications and spatial
representation entirely, per its own originating brief's own closing
note.`);

        console.log('\n✅ All World Spatial Content Composition Product Reassessment tests passed.');
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
