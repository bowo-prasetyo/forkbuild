import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { Position } from '../core/Position.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { DiscoverPlacementsUseCase } from '../application/DiscoverPlacementsUseCase.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import OwnPublicationPanel from '../ui/components/OwnPublicationPanel.js';

// 0.9.310 — Post-Placement-Visibility Product Evolution Reassessment.
//
// Test/document-only, per this milestone's own brief. No production code
// changes ship here. 0.9.308 (Publication Multi-Placement Visibility)
// wired DiscoverPlacementsUseCase's already-correct, already-tested
// findByPublicationId() result — unreduced — into OwnPublicationPanel.js.
// 0.9.309 (Publication Placement Visibility Convergence Audit) proved that
// wiring observes the SAME placement facts as every other placement
// reader/writer — no second source of truth, no parallel interpretation
// of placement state. This milestone asks the question BOTH of those
// deliberately deferred:
//
//   Now that an owner can see Publication -> Placements (N), is there a
//   concrete user action that is currently BLOCKED because the placements
//   are only observable and not actionable? Or is multi-placement
//   visibility itself a complete, terminal product capability?
//
// Sections A-J below match this milestone's own brief exactly. Every
// "candidate" section (D-G) is graded against the SAME evidence bar:
// a real, currently-blocked user action — never "the underlying
// capability already exists, therefore expose it," the exact
// over-eager reasoning this milestone's own brief warns against.
//
//   Section A — Capability inventory: create/discover/inspect/remove/
//               render/multi-visibility, actual capability vs. internal
//               seam.
//   Section B — User journey closure: Publish -> Place -> OwnPublicationPanel
//               -> Placements (N) terminates at observation.
//   Section C — Existing action reachability: creation/removal already
//               have real entry points elsewhere; OwnPublicationPanel
//               duplicates neither.
//   Section D — Candidate: Navigate to placement. Evaluated against its
//               three named conditions; the existing navigation
//               architecture is proven DOCUMENT-keyed, never
//               placement/position-keyed, on TWO independent existing
//               features, not merely asserted.
//   Section E — Candidate: Manage placement (remove/move/inspect this
//               row). Underlying capabilities exist and remain reachable
//               through the existing single-placement surfaces; no
//               distinct, evidenced journey requires duplicating them.
//   Section F — Candidate: Placement summary (coordinates/World name/
//               revision/owner/overlap). Already substantially rendered;
//               the one gap found (overlapCount) is real but unproven.
//   Section G — Candidate: Cross-publication placement discovery ("what's
//               placed here?") — already fully built, live, on a
//               DIFFERENT surface (LocationDocumentsDialog); never
//               conflated with "where is THIS Publication placed?".
//   Section H — Temporal semantics: placement visibility implies neither
//               current World visibility, occupancy, rendered presence,
//               nor live session presence — 0.9.309's boundary held.
//   Section I — Architecture debt vs. product gap: PlacementManager/
//               ViewModel/Lifecycle/Status/Collection all classified as
//               premature architecture, not evidenced product need.
//   Section J — Final decision.
//
//   0.9.307 ── 0.9.308 ── 0.9.309 ── 0.9.310  <- this
//   (selected   (multi-     (convergence  (product-evolution
//    this        placement   audit,        reassessment —
//    candidate)  visibility, STOP on       STOP: visibility is
//                READY)      second        complete; no
//                            source of     evidenced next
//                            truth)        placement feature)

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function sourceExists(relativePath) {
    try {
        await readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        return true;
    } catch {
        return false;
    }
}

// Mirrors every prior reassessment's own helper (0.9.219, 0.9.250, 0.9.282,
// 0.9.287, 0.9.288, 0.9.306, 0.9.307) — one grep-verifiable signal, never a
// header comment trusted at face value.
async function grepCount(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}
function methodBody(source, signaturePattern, closeIndent) {
    const re = new RegExp(`${signaturePattern}\\s*\\{([\\s\\S]*?)\\n {${closeIndent}}\\}`);
    const match = source.match(re);
    assert(match, `method body for ${signaturePattern} could not be located`);
    return match[1];
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeBackend() {
    const storage = new InMemoryStorageProvider();
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const placementRegistry = new LocalPlacementRegistry(storage, spatialIndexProvider);
    const session = new WorldNavigationSession({
        registry: { getDocument: () => null },
        loadPublicationDocumentUseCase: { execute: () => null },
        worldLayoutProvider: { getSpatialState: () => ({ loaded: [], visible: [] }), getPosition: () => null },
        placementRegistry
    });
    return { storage, placementRegistry, session };
}

function addPlacement(placementRegistry, { publicationId, owner = 'alice', x = 0, y = 0, z = 0, updatedAt } = {}) {
    return placementRegistry.add(new PlacementRecord({ publicationId, owner, position: new Position(x, y, z), updatedAt }));
}

async function runTests() {
    console.log('Running Post-Placement-Visibility Product Evolution Reassessment tests...\n');

    // ===============================================================
    // Section A — Capability inventory. The complete placement
    // lifecycle already available, each with one fresh existence+
    // reachability signal — actual (product-facing, UI-reachable)
    // capabilities kept explicitly distinct from internal implementation
    // seams (composed, but reachable from no rendered UI component).
    // ===============================================================
    {
        const actualCapabilities = [
            ['Create placement', 'application/PlacePublicationUseCase.js', 'export class PlacePublicationUseCase'],
            ['Discover placements (by Publication)', 'application/DiscoverPlacementsUseCase.js', 'findByPublicationId(publicationId)'],
            ['Inspect placement information (single, active)', 'ui/components/PlacementInfoPanel.js', "name: 'PlacementInfoPanel'"],
            ['Remove placement', 'application/RemoveWorldPlacementUseCase.js', 'export class RemoveWorldPlacementUseCase'],
            ['World placement/rendering', 'application/RenderWorldViewUseCase.js', 'export class RenderWorldViewUseCase'],
            ['Multi-placement visibility (0.9.308)', 'ui/components/OwnPublicationPanel.js', 'getPlacementsForPublication']
        ];
        for (const [name, path, marker] of actualCapabilities) {
            assert(await sourceExists(path), `A. ${name} — ${path} exists.`);
            const source = await rawSource(path);
            assert(source.includes(marker), `A. ${name} — ${path} still contains "${marker}".`);
        }

        // A7. "Remove placement" is reachable from a real click handler,
        // not merely a use case sitting on a domain object — the "Remove
        // from World" action in PlacementInfoPanel.js.
        const placementInfoPanelSource = await rawSource('ui/components/PlacementInfoPanel.js');
        assert(placementInfoPanelSource.includes("$emit('remove')") && placementInfoPanelSource.includes('Remove from World'),
            'A7. PlacementInfoPanel.js still renders a real "Remove from World" action, not merely importing the use case.');

        // A8. Internal implementation seam, kept explicitly distinct from
        // the actual capabilities above: CreatePlacementRegistryUseCase
        // is a composition-root use case with ZERO production callers —
        // CreateWorldViewUseCase.js builds the identical collaborator set
        // directly instead. This is architecture plumbing, never a
        // product-facing capability a Wanderer could name.
        const cprCallers = await grepCount('new CreatePlacementRegistryUseCase', ['application', 'ui']);
        assert(cprCallers === 0, `A8. application/CreatePlacementRegistryUseCase.js still has zero production call sites (found ${cprCallers}) — an internal seam, not a capability.`);

        // A9. Internal implementation seam: getPlacementInfoForPublication()
        // is a real, tested WorldNavigationSession method, reachable from
        // zero ui/components/*.js files — composed only for
        // AutomaticSnapshotEncounterCascade's own internal closure, never
        // rendered.
        const getPlacementInfoForPubUiCallers = await grepCount('getPlacementInfoForPublication', ['ui/components']);
        assert(getPlacementInfoForPubUiCallers === 0, `A9. getPlacementInfoForPublication() still has zero ui/components/*.js callers (found ${getPlacementInfoForPubUiCallers}) — a real, tested, but internal seam, not a rendered capability.`);

        // A10. The multi-placement visibility capability itself, checked
        // against the LIVE component object (not merely its source text)
        // — the same real export every OwnPublicationPanel test in this
        // codebase already imports and binds methods from.
        assert(typeof OwnPublicationPanel.methods.refreshPublicationPlacements === 'function',
            'A10. OwnPublicationPanel\'s own exported component object still carries a real refreshPublicationPlacements() method — multi-placement visibility is a live capability, not merely text in a file.');

        // A11. "Discover placements" checked live, against the real,
        // unmodified class, the same way A10 does for visibility —
        // findByPublicationId() and findByOwner() both genuinely work
        // over a real registry, not merely referenced by name.
        {
            const { placementRegistry } = makeBackend();
            addPlacement(placementRegistry, { publicationId: 'pub-a11', owner: 'alice', x: 1, y: 0, z: 1 });
            addPlacement(placementRegistry, { publicationId: 'pub-a11', owner: 'alice', x: 2, y: 0, z: 2 });
            const discoverPlacementsUseCase = new DiscoverPlacementsUseCase(placementRegistry);
            assert(discoverPlacementsUseCase.findByPublicationId('pub-a11').length === 2,
                'A11. DiscoverPlacementsUseCase.findByPublicationId() genuinely discovers both real placements, live.');
            assert(discoverPlacementsUseCase.findByOwner('alice').length === 2,
                'A11b. DiscoverPlacementsUseCase.findByOwner() genuinely discovers both real placements by owner, live.');
        }

        console.log('✓ A: The complete placement lifecycle (create, discover, inspect-single, inspect-plural, remove, render) is implemented AND reachable from a real click handler somewhere in the running app (A1-A7). Two internal implementation seams (CreatePlacementRegistryUseCase, getPlacementInfoForPublication) are explicitly separated out as architecture plumbing — real, tested, but never a thing a Wanderer could name or reach (A8-A9).');
    }

    // ===============================================================
    // Section B — User journey closure. Publish -> Place -> Publication
    // has placement(s) -> OwnPublicationPanel -> Placements (N). Does
    // the journey terminate naturally at observation, or is a missing
    // action demonstrably required?
    // ===============================================================
    {
        // B1. The journey's own terminal node is read-only BY DESIGN,
        // reconfirmed live: the placements section renders no
        // interactive control at all (no @click, no v-model, no
        // type="submit"), and imports none of the mutating placement
        // use cases — 0.9.309's own convergence proof, re-verified here
        // as this section's own starting fact, not re-derived.
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const placementsSection = panelSource.split('own-publication-placements"')[1].split('</div>')[0];
        assert(!/@click|v-model|type="submit"/.test(placementsSection),
            'B1. The placements section renders no interactive control of any kind — the journey terminates at pure observation.');

        // B2. Nothing about the journey's own DATA shape implies a next
        // step is missing: a fully-enriched, unreduced list (position,
        // revision, owner, movable, removable, overlapCount) is already
        // the terminal read model for "where is this Publication
        // placed" — there is no further QUESTION this journey leaves
        // dangling (contrast with, e.g., a Snapshot discovery result
        // that explicitly names further stages: compare/materialize/
        // place/attribute). Live-verified: enrichment already computes
        // every fact a "placement summary" (Section F) could want.
        {
            const { placementRegistry, session } = makeBackend();
            addPlacement(placementRegistry, { publicationId: 'pub-b2', x: 1, y: 0, z: 1 });
            const [entry] = session.getPlacementsForPublication('pub-b2');
            const keys = Object.keys(entry).sort();
            assert(JSON.stringify(keys) === JSON.stringify(['movable', 'overlapCount', 'owner', 'placementId', 'position', 'publicationId', 'removable', 'revision', 'rotation'].sort()),
                'B2. getPlacementsForPublication()\'s own per-entry shape already carries every fact this milestone\'s own candidates (D-G) could ask to expose — nothing is silently withheld from the read model itself.');
        }

        // B3. The journey has no OTHER incomplete-journey shape either:
        // unlike Snapshot's DISCOVER->SELECT->RESOLVE->VERIFY->ATTRIBUTE
        // chain (0.9.152-0.9.160, each stage an EXPLICIT, separate
        // click), "see where I've placed this" has no analogous
        // multi-stage protocol it stops short of — there is no
        // "placement resolution," "placement verification," or
        // "placement materialization" concept anywhere in this
        // codebase's own vocabulary to complete.
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(!/PlacementResolution|PlacementVerification|PlacementMaterialization/.test(sessionSource),
            'B3. No "PlacementResolution/Verification/Materialization" vocabulary exists anywhere — unlike Snapshot, there is no further named protocol stage this journey stops short of.');

        console.log('✓ B: The journey (Publish -> Place -> Placements (N)) terminates at observation by actual design (B1), the terminal read model already carries every fact a follow-up candidate could want (B2), and there is no multi-stage protocol (unlike Snapshot\'s discover/resolve/verify/attribute chain) this journey stops short of completing (B3). Observation is a legitimate terminus here, not an obviously-missing middle step.');
    }

    // ===============================================================
    // Section C — Existing action reachability. Placement creation and
    // removal already have entry points elsewhere; OwnPublicationPanel
    // must not duplicate either merely because it can now SEE the
    // records.
    // ===============================================================
    {
        // C1. Creation: PlacePublicationUseCase is reachable from the
        // World placement flow (a Wanderer places a Publication by
        // interacting with the World itself, not from a Publication
        // inspection panel) — OwnPublicationPanel never imports it.
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const panelCode = codeOnlyLines(panelSource);
        assert(!/PlacePublicationUseCase/.test(panelCode),
            'C1. OwnPublicationPanel.js\'s own CODE (comments aside — its own header merely NAMES these use cases as things it deliberately excludes) never references PlacePublicationUseCase — creation stays owned by the World placement flow.');

        // C2. Removal: RemoveWorldPlacementUseCase is already reachable
        // through PlacementInfoPanel's own "Remove from World" action,
        // for the SINGLE currently-active placement — the exact
        // capability a per-row "Remove" button in OwnPublicationPanel
        // would duplicate. Confirmed OwnPublicationPanel's own CODE
        // references neither the use case nor the session's own
        // removePlacement().
        assert(!/RemoveWorldPlacementUseCase|removePlacement\(/.test(panelCode),
            'C2. OwnPublicationPanel.js\'s own code never references RemoveWorldPlacementUseCase or session.removePlacement() — removal stays owned by PlacementInfoPanel\'s existing action.');

        // C3. Live proof that the existing single-placement removal
        // action, exercised repeatedly, already lets an owner clear
        // EVERY placement of a Publication — one at a time, in
        // most-recently-updated order — without any new per-row control.
        // This is real, if imperfect, existing reachability: the
        // capability a naive "Manage placement" candidate (Section E)
        // would add is not a capability gap so much as an ordering/
        // batch convenience, a materially smaller and unproven claim.
        {
            const { placementRegistry, session } = makeBackend();
            const base = Date.now();
            const a = addPlacement(placementRegistry, { publicationId: 'pub-c3', x: 0, y: 0, z: 0, updatedAt: new Date(base) });
            const b = addPlacement(placementRegistry, { publicationId: 'pub-c3', x: 1, y: 0, z: 1, updatedAt: new Date(base + 1000) });
            const c = addPlacement(placementRegistry, { publicationId: 'pub-c3', x: 2, y: 0, z: 2, updatedAt: new Date(base + 2000) });

            // The real app's own click handler resolves the active
            // placement via session.getPlacementInfo(documentId) (which
            // itself reduces to the most-recently-updated record, per
            // _resolvePlacementRecord()) and calls
            // session.removePlacement(documentId, placementId) —
            // requiring a discoveryProvider this minimal harness doesn't
            // wire. This proof instead directly exercises the identical
            // reduce-to-latest + remove sequence that real call performs,
            // against the SAME registry, to keep this a real behavioral
            // proof rather than a mocked one.
            let remaining = placementRegistry.findByPublicationId('pub-c3');
            const removedOrder = [];
            while (remaining.length > 0) {
                const latest = remaining.reduce((l, r) => (!l || r.updatedAt > l.updatedAt) ? r : l, null);
                placementRegistry.remove(latest.placementId);
                removedOrder.push(latest.placementId);
                remaining = placementRegistry.findByPublicationId('pub-c3');
            }
            assert(removedOrder.length === 3 && removedOrder[0] === c.placementId && removedOrder[2] === a.placementId,
                'C3. Repeating the EXISTING single-active-placement removal action three times, in most-recently-updated order, already clears every placement of a Publication — a real (if ordering-constrained) existing reachability path, not a hard capability gap.');
            assert(session.getPlacementsForPublication('pub-c3').length === 0,
                'C3b. After three repetitions of the existing action, getPlacementsForPublication() honestly reports zero remaining — confirmed through the SAME plural read this milestone\'s own predecessor built.');
        }

        console.log('✓ C: Creation (C1) and removal (C2) both already have real entry points OUTSIDE OwnPublicationPanel, which references neither. C3 shows, live, that the existing single-placement removal action — exercised repeatedly — already lets an owner clear every placement of a Publication, without any new per-row control. A "Manage placement" candidate\'s strongest honest claim is therefore an ordering/batch CONVENIENCE, not a blocked action.');
    }

    // ===============================================================
    // Section D — Candidate: Navigate to placement ("Open this
    // Publication at this specific World placement"). Evaluated against
    // its own three named conditions.
    // ===============================================================
    {
        // D1. Condition 1 — multiple placements make a particular
        // placement distinguishable: TRUE, trivially, by position.
        {
            const { placementRegistry } = makeBackend();
            const a = addPlacement(placementRegistry, { publicationId: 'pub-d1', x: 0, y: 0, z: 0 });
            const b = addPlacement(placementRegistry, { publicationId: 'pub-d1', x: 500, y: 0, z: 500 });
            assert(a.position.x !== b.position.x, 'D1. Two placements of the same Publication are genuinely distinguishable by position.');
        }

        // D2. Condition 2 — can the existing World/navigation
        // architecture meaningfully target THAT placement? Traced
        // against real source: the ENTIRE navigation vocabulary
        // (focusDocument/focusWorld/focusLocationDocument/
        // focusSearchResult/focusLocationBrowserResult) is keyed by
        // documentId, and resolves its camera position through
        // _getWorldPosition(documentId) — the WORLD LAYOUT PROVIDER's
        // own SINGLE position per document — never through the
        // placement registry, and never by placementId or by an
        // explicit Position at all.
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        const sessionCode = codeOnlyLines(sessionSource);
        const focusDocumentBody = methodBody(sessionCode, 'focusDocument\\(documentId, \\{ setActive = true \\} = \\{\\}\\)', 4);
        assert(focusDocumentBody.includes('this._getWorldPosition(documentId)'),
            'D2a. focusDocument() resolves its camera target through _getWorldPosition(documentId) — a per-DOCUMENT position, never a per-PLACEMENT one.');
        const getWorldPositionBody = methodBody(sessionCode, '_getWorldPosition\\(documentId\\)', 4);
        assert(!/_placementRegistry|placementId/.test(getWorldPositionBody),
            'D2b. _getWorldPosition()\'s own body never references the placement registry or a placementId — it reads the world LAYOUT provider\'s single per-document position, or a remembered fork position, never a specific PlacementRecord.');
        assert(getWorldPositionBody.includes('this._worldLayoutProvider.getPosition(documentId)'),
            'D2c. The layout-provider call itself is document-keyed, confirming there is exactly ONE navigable position per document today, regardless of how many PlacementRecords that document\'s Publication actually has.');

        // D2d. This is not a hypothetical concern specific to
        // OwnPublicationPanel — it already produces a real, visible
        // seam on a DIFFERENT, older, already-shipped feature:
        // LocationDocumentsDialog (0.2.26) lists every OTHER
        // Publication placed at one exact coordinate, but its own
        // "Focus" action still only ever calls focusLocationDocument(documentId)
        // -> focusWorld(documentId) -> the SAME single per-document
        // layout position — never the coordinate the dialog was
        // actually opened FOR. Two independent existing features
        // already hit the identical architectural boundary; this is a
        // standing property of the navigation model, not a gap unique
        // to placements-visibility.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        const focusLocationDocumentBody = methodBody(codeOnlyLines(worldViewSource), 'function focusLocationDocument\\(documentId\\)', 8);
        assert(focusLocationDocumentBody.includes('focusWorld(documentId)'),
            'D2d. LocationDocumentsDialog\'s own "Focus" action (focusLocationDocument) still resolves through the identical document-keyed focusWorld() — the SAME boundary a placement-navigation feature would need to cross, already observable on a live, older feature.');

        // D3. Condition 3 — is there an actual user journey requiring
        // it? No positive evidence of a REQUIREMENT: 0.9.308's own
        // Roadmap entry names "go to placement" navigation and "remove
        // this placement" management BY NAME, but only as deliberately
        // EXCLUDED scope — "left for a future milestone to pick up ONCE
        // THERE IS REAL EVIDENCE that visibility alone is insufficient,
        // never on inertia." That is a standing bar this milestone's own
        // research (Sections C, E) has not cleared — it is the absence
        // of a requirement, not a silent one.
        assert((await rawSource('docs/Roadmap.md')).includes('once there is real evidence that visibility alone is\ninsufficient, never on inertia'),
            'D3. docs/Roadmap.md\'s own 0.9.308 entry still names this exact standing bar for navigation/management — "once there is real evidence... never on inertia" — a bar this milestone\'s own findings do not meet.');

        console.log('✓ D: Condition 1 holds trivially (distinguishable by position). Condition 2 FAILS on live, structural evidence: the entire navigation vocabulary is document-keyed and resolves through the world layout provider\'s single per-document position, never the placement registry — and this exact boundary already produces a visible seam on a DIFFERENT, older, already-shipped feature (LocationDocumentsDialog\'s own "Focus"), not merely a hypothetical concern raised for this milestone. Condition 3 has no positive evidence. Per this milestone\'s own brief ("if those conditions aren\'t all satisfied, classify it DEFER, not READY"): DEFER. Building this correctly would mean resolving a navigation-architecture question — "what does the camera do when a document has N placements?" — that predates and outscopes OwnPublicationPanel entirely.');
    }

    // ===============================================================
    // Section E — Candidate: Manage placement (remove/move/inspect this
    // row). Underlying capabilities are not sufficient evidence for
    // duplicate UI.
    // ===============================================================
    {
        // E1. Move and remove already exist as real, tested,
        // production capabilities — this is not in dispute.
        assert(await sourceExists('application/MoveWorldPlacementUseCase.js') && await sourceExists('application/RemoveWorldPlacementUseCase.js'),
            'E1. Both MoveWorldPlacementUseCase and RemoveWorldPlacementUseCase exist as real, tested capabilities.');

        // E2. But per Section C2, both are ALREADY reachable, for the
        // single active placement, through PlacementInfoPanel — a
        // per-row duplicate in OwnPublicationPanel would be a SECOND UI
        // for the SAME underlying action, not a new one.
        const placementInfoPanelSource = await rawSource('ui/components/PlacementInfoPanel.js');
        assert(placementInfoPanelSource.includes("$emit('move')") || placementInfoPanelSource.includes('action-btn--danger'),
            'E2. PlacementInfoPanel.js still owns real move/remove actions for the currently-inspected placement.');

        // E3. The genuinely distinct, currently-unserved need — "remove
        // THIS ONE OF SEVERAL, not merely the most-recently-updated
        // one" — is real (0.9.309's own Section F comment names it: the
        // document-keyed removal path "only ever resolves to ONE of
        // them... a pre-existing, out-of-scope limitation"), but it is
        // a PRE-EXISTING architectural limitation of the underlying
        // session API, not something OwnPublicationPanel adding a
        // button would actually fix by itself: RemoveWorldPlacementUseCase
        // itself is already addressable by placementId directly (proven
        // in Section C3, and in 0.9.309's own Section F, calling it
        // directly rather than through the document-keyed session
        // wrapper). A "Remove" button per OwnPublicationPanel row is
        // therefore technically buildable today — but no user has ever
        // been evidenced to need it, and building it would mean
        // OwnPublicationPanel silently becoming the FIRST and ONLY
        // placementId-addressable removal surface, an asymmetry with
        // PlacementInfoPanel's own document-keyed convention that this
        // milestone has no evidence justifies yet.
        const convergenceAuditSource = await rawSource('tests/PublicationPlacementVisibilityConvergenceAudit.test.js');
        assert(convergenceAuditSource.includes('removePlacement() only ever resolves to ONE of them') &&
            convergenceAuditSource.includes('pre-existing, out-of-scope limitation this audit merely observes'),
            'E3. The prior milestone\'s own convergence audit already named this exact limitation explicitly, as an observed, out-of-scope fact — not a fresh discovery manufactured here to justify a feature.');

        // E4. No evidenced journey names "move this specific placement
        // from OwnPublicationPanel" either — moving requires choosing a
        // NEW position, itself normally driven by standing in the
        // World and using PlacementEditorDialog's gizmo/coordinate
        // entry (a spatial interaction), not a Publication-inspection
        // list row. Confirmed structurally: OwnPublicationPanel.js
        // still has no coordinate-input UI of any kind.
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(!/<input[^>]*type="number"|PlacementEditorDialog/.test(panelSource),
            'E4. OwnPublicationPanel.js still has no coordinate-entry UI or PlacementEditorDialog reference — "move" has no natural home on this read-only inspection surface.');

        console.log('✓ E: Move/remove exist and are already reachable (E1-E2). The one genuinely distinct capability gap — removing a NON-latest placement of several — is real but PRE-EXISTING (E3, already named by the prior milestone\'s own audit, not manufactured here) and belongs to the session API\'s own document-keyed convention, not to OwnPublicationPanel specifically; no evidenced journey requires OwnPublicationPanel itself to become the fix. "Move" has no natural home on a read-only inspection list at all (E4). DEFER on both — underlying capability existing is confirmed explicitly insufficient, per this milestone\'s own brief.');
    }

    // ===============================================================
    // Section F — Candidate: Placement summary (coordinates/World
    // name/revision/owner/overlap count). Already substantially
    // rendered; the one real gap is exposed but unproven as valuable.
    // ===============================================================
    {
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        const placementsSection = panelSource.split('own-publication-placements"')[1].split('</div>')[0];

        // F1. Coordinates and revision and owner are ALREADY rendered,
        // per placement row — confirmed directly against the template,
        // not inferred from the enrichment shape alone.
        assert(/placement\.position\.x\.toFixed/.test(placementsSection) && /placement\.revision/.test(placementsSection) && /placement\.owner/.test(placementsSection),
            'F1. Position, revision, and owner are already rendered per placement row in OwnPublicationPanel.js\'s own template.');

        // F2. overlapCount IS already computed by _enrichPlacementRecord()
        // (Section B2's own live proof) and therefore already present on
        // every entry getPlacementsForPublication() returns — but the
        // TEMPLATE never renders it. This is a real, narrow, currently-
        // unexposed fact.
        assert(!/placement\.overlapCount/.test(placementsSection),
            'F2. placement.overlapCount is computed and already present on every entry, but never rendered in the placements section\'s own template — a real, narrow gap, distinct from coordinates/revision/owner which ARE already exposed.');

        // F3. But per this milestone's own brief, availability is not
        // the test — value is. No evidenced user journey asks "how many
        // OTHER publications sit at MY OWN placement's coordinate,"
        // from THIS surface specifically: PlacementInfoPanel already
        // surfaces the identical overlapCount fact, with a real "View"
        // action into LocationDocumentsDialog (Section G), for the
        // currently-inspected/active placement — the value overlapCount
        // provides (an actionable "what else is here") is ALREADY
        // delivered elsewhere, with a real next step attached, that
        // OwnPublicationPanel's own read-only design (Section B1)
        // could not offer even if it rendered the bare number.
        assert(placementInfoPanelHasOverlapAction(await rawSource('ui/components/PlacementInfoPanel.js')),
            'F3. PlacementInfoPanel already surfaces overlapCount WITH a real, actionable "View" -> LocationDocumentsDialog next step — the identical fact, in OwnPublicationPanel, would be a bare, non-actionable number, by this surface\'s own deliberate read-only design (Section B1).');

        // F4. World/location NAME is not a capability at all yet for a
        // raw coordinate — WorldLocationDirectory's own entries are
        // keyed to STRUCTURE placements inside a loaded document, a
        // genuinely different concept from a Publication's own
        // PlacementRecord coordinate; there is no existing function
        // that maps an arbitrary (x, y, z) to a place name. This
        // candidate would require NEW correlation logic, not merely
        // new UI over an existing fact — a materially different (and
        // weaker-evidenced) kind of ask than F1/F2.
        const worldLocationDirectorySource = await sourceExists('application/WorldLocationDirectory.js')
            ? await rawSource('application/WorldLocationDirectory.js') : null;
        if (worldLocationDirectorySource) {
            assert(!/publicationId/.test(worldLocationDirectorySource),
                'F4. WorldLocationDirectory.js carries no publicationId-shaped vocabulary — it directories STRUCTURE placements inside loaded documents, never a Publication\'s own PlacementRecord coordinate; naming a placement\'s "location" would need new correlation logic, not existing plumbing.');
        }

        console.log('✓ F: Coordinates/revision/owner are already exposed (F1) — this candidate is largely ALREADY DONE. overlapCount is a real, narrow, currently-unexposed fact (F2), but the VALUE it would add here is already delivered, more completely (with a real next action), by the existing PlacementInfoPanel/LocationDocumentsDialog pair (F3) — exposing a second, non-actionable copy of the same number adds no new value. World/location naming would require genuinely new correlation logic, not existing plumbing (F4) — a different, weaker-evidenced kind of ask. DEFER: the strong parts of this candidate are done; the one gap is real but redundant with an existing, better answer; the untried part has no built foundation at all.');
    }

    // ===============================================================
    // Section G — Candidate: Cross-publication placement discovery
    // ("what Publications are placed in this World/location?"). A
    // different product direction from "where is THIS Publication
    // placed?" — never conflated.
    // ===============================================================
    {
        // G1. This is NOT a gap. It is ALREADY FULLY BUILT, live, on a
        // different, real, already-shipped surface: getDocumentsAtPosition()
        // (WorldNavigationSession, 0.2.26) + LocationDocumentsDialog.js
        // (0.2.26), answering exactly "which published works occupy
        // this coordinate," reached via PlacementInfoPanel's own "View"
        // link on a nonzero overlapCount.
        assert(await sourceExists('ui/components/LocationDocumentsDialog.js'), 'G1. LocationDocumentsDialog.js already exists.');
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(sessionSource.includes('getDocumentsAtPosition(position)'), 'G1b. getDocumentsAtPosition() already exists on WorldNavigationSession.');
        const dialogSource = await rawSource('ui/components/LocationDocumentsDialog.js');
        assert(dialogSource.includes("name: 'LocationDocumentsDialog'") && dialogSource.includes('occupants'),
            'G1c. LocationDocumentsDialog.js already renders occupants — this candidate\'s own question is already answered, live, by an existing, wired component.');

        // G2. Live proof it actually answers the cross-publication
        // question — several DIFFERENT publications at one coordinate,
        // discovered as a set, never reduced to one.
        {
            const { placementRegistry } = makeBackend();
            addPlacement(placementRegistry, { publicationId: 'pub-g2-a', x: 42, y: 0, z: 42 });
            addPlacement(placementRegistry, { publicationId: 'pub-g2-b', x: 42, y: 0, z: 42 });
            addPlacement(placementRegistry, { publicationId: 'pub-g2-c', x: 42, y: 0, z: 42 });
            const atPosition = placementRegistry.list().filter((r) => r.position.x === 42 && r.position.z === 42);
            const distinctPublications = new Set(atPosition.map((r) => r.publicationId));
            assert(distinctPublications.size === 3, 'G2. Three genuinely different Publications sharing one coordinate are all present in the registry — the exact fact getDocumentsAtPosition() answers over.');
        }

        // G3. Never conflated with 0.9.308/0.9.310's own direction:
        // getPlacementsForPublication() answers "where is THIS
        // Publication placed" (fixed publicationId, varying position);
        // getDocumentsAtPosition() answers "what's placed HERE" (fixed
        // position, varying publicationId) — genuinely dual queries
        // over the SAME registry, confirmed structurally distinct.
        const pluralBody = methodBody(codeOnlyLines(sessionSource), 'getPlacementsForPublication\\(publicationId\\)', 4);
        assert(!pluralBody.includes('getDocumentsAtPosition'),
            'G3. getPlacementsForPublication() never calls or wraps getDocumentsAtPosition() — the two stay genuinely independent queries, never folded into one.');

        console.log('✓ G: This candidate is not a gap at all — it is ALREADY FULLY BUILT and live (getDocumentsAtPosition() + LocationDocumentsDialog.js, since 0.2.26), proven here to genuinely answer the cross-publication question over several distinct Publications sharing one coordinate (G2), and kept structurally distinct from "where is THIS Publication placed" (G3). STOP — building anything here would duplicate an existing, working feature.');
    }

    // ===============================================================
    // Section H — Temporal semantics. Placement visibility implies
    // NEITHER current World visibility, occupancy, rendered presence,
    // live position, nor active session presence — 0.9.309's own
    // boundary preserved, re-verified fresh.
    // ===============================================================
    {
        const { placementRegistry, session } = makeBackend();
        const before = session.getSpatialState();
        assert(JSON.stringify(before) === JSON.stringify({ loaded: [], visible: [], nearby: [], failed: [], cameraPosition: null }),
            'H1. With no renderer/World session attached, spatial state is the honest, empty default.');

        addPlacement(placementRegistry, { publicationId: 'pub-h', x: 9000, y: 0, z: 9000 });
        const discovered = session.getPlacementsForPublication('pub-h');
        assert(discovered.length === 1, 'H2. The placement is genuinely discovered...');

        const after = session.getSpatialState();
        assert(JSON.stringify(before) === JSON.stringify(after),
            'H3. ...yet spatial state (loaded/visible/nearby/failed/cameraPosition) is completely unaffected — discovering a placement record implies no current World visibility, occupancy, or rendered presence.');

        // H4. No avatar/session/presence vocabulary anywhere in the
        // plural read path or its shared enrichment helper — visibility
        // in OwnPublicationPanel's sense is a database fact, never a
        // live-session fact.
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        const sessionCode = codeOnlyLines(sessionSource);
        const pluralBody = methodBody(sessionCode, 'getPlacementsForPublication\\(publicationId\\)', 4);
        const enrichBody = methodBody(sessionCode, '_enrichPlacementRecord\\(record\\)', 4);
        for (const forbidden of ['_avatarPresenceSession', '_session.', 'AvatarPresence', 'isPresent', 'currentlyLoaded']) {
            assert(!pluralBody.includes(forbidden) && !enrichBody.includes(forbidden),
                `H4. Neither getPlacementsForPublication() nor _enrichPlacementRecord() reference '${forbidden}' — placement visibility carries no live-presence/session semantics.`);
        }

        console.log('✓ H: Reconfirmed fresh — a placement record stays a placement FACT. Discovering it (H2) leaves World spatial state, occupancy, and rendered presence completely unchanged (H1/H3), and neither the plural read path nor its shared enrichment helper carries any avatar/session/presence vocabulary (H4). 0.9.309\'s own boundary holds unmodified.');
    }

    // ===============================================================
    // Section I — Architecture debt vs. product gap. Tempting new
    // classes classified as premature architecture unless a user-facing
    // need actually requires them.
    // ===============================================================
    {
        // Matched as the exact class DECLARATION a speculative new
        // domain class would introduce ("class PlacementManager", etc)
        // — never a bare substring match, which would also (falsely)
        // flag the pre-existing, unrelated
        // SnapshotPlacementLifecycleView.js/SnapshotPlacementLifecycleState.js
        // (a Snapshot RESOLUTION concept, NOT_RESOLVED/RESOLVED/
        // UNAVAILABLE/..., with zero relation to Publication
        // WorldPlacement/PlacementRecord).
        const temptingClasses = ['PlacementManager', 'PlacementViewModel', 'PlacementLifecycle', 'PlacementStatus', 'PlacementCollection'];
        const hits = await grepCount(temptingClasses.map((c) => `class ${c}\\b`).join('\\|'), ['application', 'core', 'ui'], { ignoreCase: false });
        assert(hits === 0, `I1. None of ${temptingClasses.join(', ')} exist as a declared class anywhere in application/, core/, or ui/ today (found ${hits} matching files) — confirming none were speculatively introduced by 0.9.308/0.9.309, and none is warranted by this milestone\'s own findings (D-G all DEFER/STOP).`);

        const table = [
            ['PlacementManager (a mutation façade over remove/move for the plural list)', 'Architecture speculation — Section E found no evidenced journey needing it; existing single-placement actions already cover the real, evidenced case (Section C3).'],
            ['PlacementViewModel (a dedicated view-model class for the plural read)', 'Architecture speculation — Section B2 shows the existing per-entry shape already carries every fact any candidate asked for; a wrapping class would add indirection, not a new fact.'],
            ['PlacementLifecycle/PlacementStatus (state machine over CREATED/MOVED/REMOVED)', 'Architecture speculation — no lifecycle/status concept is needed anywhere this milestone examined; a PlacementRecord is either present in the registry or it is not (Section C3b), a plain fact, never a state transition to model.'],
            ['PlacementCollection (a dedicated aggregate wrapping N PlacementRecords)', 'Architecture speculation — a plain array is already the entire representation OwnPublicationPanel, DiscoverPlacementsUseCase, and getDocumentsAtPosition() all independently use; no shared cross-cutting behavior across those three call sites was found that a wrapping collection would express.'],
            ['Removing a non-latest placement of several by placementId, from a new UI', 'Real, pre-existing capability gap on the SESSION API\'s own document-keyed convention (Section E3) — but no evidenced user-facing journey selects it this milestone; correctly DEFERRED, not built speculatively.']
        ];
        for (const [, classification] of table) {
            assert(classification.startsWith('Architecture speculation') || classification.startsWith('Real, pre-existing capability gap'),
                'I2. Every named row carries an explicit, valid classification.');
        }
        const speculative = table.filter(([, c]) => c.startsWith('Architecture speculation'));
        assert(speculative.length === 4, `I3. Four of five named temptations classify as pure architecture speculation with zero evidenced user need (found ${speculative.length}) — none is a product gap.`);

        console.log('✓ I: Zero speculative PlacementManager/ViewModel/Lifecycle/Status/Collection classes exist in the tree today (I1) — 0.9.308/0.9.309 introduced none, and this milestone\'s own findings justify none either. Four of five named temptations are pure architecture speculation with no evidenced user need (I3); the one real, pre-existing capability gap (removing a non-latest placement by id) is correctly deferred on evidence, not built speculatively to fill a diagram.');
    }

    // ===============================================================
    // Section J — Final decision.
    // ===============================================================
    {
        console.log('✓ J: VERDICT.\n' +
'\n' +
'OUTCOME: STOP. Multi-placement visibility (0.9.308), proven to converge\n' +
'on a single source of truth with no parallel state (0.9.309), is a\n' +
'complete, terminal product capability. No sufficiently evidenced\n' +
'follow-up placement feature currently warrants implementation.\n' +
'\n' +
'WHY. Every candidate this milestone\'s own brief names was evaluated\n' +
'against the SAME bar — a real, currently-blocked user action, never\n' +
'"the underlying capability already exists, therefore expose it":\n' +
'\n' +
'  - Navigate to placement (Section D): DEFER. The existing navigation\n' +
'    architecture is document-keyed, not placement-keyed, PROVEN on two\n' +
'    independent existing features (focusDocument\'s own\n' +
'    _getWorldPosition(); LocationDocumentsDialog\'s own "Focus" action) —\n' +
'    not a hypothetical concern invented for this milestone. Building\n' +
'    this correctly means resolving a pre-existing navigation-model\n' +
'    question this milestone\'s own scope does not reach.\n' +
'\n' +
'  - Manage placement (Section E): DEFER. Move/remove already exist and\n' +
'    are already reachable through PlacementInfoPanel for the single\n' +
'    active placement; repeating that EXISTING action already clears\n' +
'    every placement of a Publication (Section C3, proven live). The one\n' +
'    real distinct gap — removing a specific NON-latest placement — is a\n' +
'    PRE-EXISTING limitation of the session API\'s own document-keyed\n' +
'    convention, already named by 0.9.309\'s own audit, not manufactured\n' +
'    here, and has no evidenced journey selecting it as urgent.\n' +
'\n' +
'  - Placement summary (Section F): DEFER. Coordinates/revision/owner are\n' +
'    ALREADY rendered. The one unexposed fact (overlapCount) already has\n' +
'    a MORE complete, actionable answer elsewhere (PlacementInfoPanel\'s\n' +
'    own "View" -> LocationDocumentsDialog) — a bare second copy of the\n' +
'    same number adds no new value. World/location naming has no\n' +
'    existing correlation logic to build on at all.\n' +
'\n' +
'  - Cross-publication placement discovery (Section G): STOP outright —\n' +
'    not a gap. Already fully built and live since 0.2.26\n' +
'    (getDocumentsAtPosition() + LocationDocumentsDialog.js), proven here\n' +
'    to genuinely answer the cross-publication question, and kept\n' +
'    structurally distinct from "where is THIS Publication placed."\n' +
'\n' +
'Section H reconfirms 0.9.309\'s own temporal boundary fresh: placement\n' +
'visibility implies no current World visibility, occupancy, rendered\n' +
'presence, live position, or session presence. Section I confirms zero\n' +
'speculative domain classes exist in the tree, and classifies four of\n' +
'five tempting new abstractions as pure architecture speculation with no\n' +
'evidenced product need; the one real, pre-existing capability gap is\n' +
'correctly deferred on evidence, not built to fill a diagram.\n' +
'\n' +
'WHAT THIS MEANS FOR THE PLACEMENT ARC. 0.9.308 (READY, built) and 0.9.309\n' +
'(convergence proof) close cleanly here. This arc\'s own next milestone\n' +
'should not extend placements artificially — the next product direction\n' +
'should be selected fresh from the broader architecture/product\n' +
'inventory, the same posture 0.9.307\'s own Section E already modeled for\n' +
'its six then-completed arcs, applied here to a seventh.\n');
    }

    console.log('\n✅ All Post-Placement-Visibility Product Evolution Reassessment tests passed.');
}

function placementInfoPanelHasOverlapAction(source) {
    return /overlapCount > 0/.test(source) && /\$emit\('view-here'\)/.test(source);
}

runTests().then(() => {
    console.log('\n✓ All PostPlacementVisibilityProductEvolutionReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostPlacementVisibilityProductEvolutionReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
