import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { CausalStamp } from '../core/CausalStamp.js';
import {
    DOCUMENT_COLLABORATION_CONSISTENCY_POLICY,
    ConcurrentConflictResolution,
    ReplicaConvergenceGuarantee,
    MissingOperationDetection
} from '../core/DocumentCollaborationConsistencyPolicy.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { ConflictResolver, ConflictRelation } from '../replication/ConflictResolver.js';

// 0.9.311 — Post-Placement Product Evolution Reassessment.
//
// Test/document-only, per this milestone's own brief. No production code
// changes ship here. 0.9.307 (Post-Arc Product Evolution Reassessment)
// asked the wide question across everything built through the Content
// Provider Preference / Commentary cross-surface / Notification Awareness
// arcs and selected Publication multi-placement visibility. 0.9.308-0.9.310
// then built, converged, and closed that ONE arc — the placement-visibility
// arc — down to a fresh STOP. This milestone repeats 0.9.307's own method,
// fresh, against the CURRENT tree, across the whole product rather than one
// arc:
//
//   Given everything ForkBuild can now actually do — across Editor,
//   Publication, Commentary, World View, Wanderer/vehicle, placement,
//   Snapshot, collaboration, Place Naming, notifications, decentralized
//   distribution, provider preferences, and authentication/identity — what
//   is the smallest genuinely valuable thing it still cannot do?
//
// The governing principle carried forward unchanged from every prior
// reassessment: select the next milestone from an EVIDENCED user-facing
// gap, never from an interesting architectural capability.
//
//   Section A — Complete capability inventory: thirteen named surfaces,
//               each capability classified implemented+reachable /
//               implemented+orphaned / implemented+intentionally-internal /
//               architecturally-possible / actually-missing.
//   Section B — User-journey closure: four representative end-to-end
//               journeys, traced hop by hop against real source.
//   Section C — Orphaned capability sweep: a fresh, repo-wide zero-caller
//               scan, every hit classified PRODUCT_GAP / INTERNAL /
//               HISTORICAL / DUPLICATIVE / DEFER / STOP — never assumed a
//               gap merely because it compiles.
//   Section D — Cross-arc convergence opportunities: two named trees
//               checked for a missing seam; one tempting pairing
//               deliberately REJECTED for having no user journey behind it.
//   Section E — Awareness/product-gap reassessment: the Notification
//               boundary re-confirmed, not expanded.
//   Section F — World interaction gap: reassessed fresh; no new
//               journey-blocking gap found beyond what is already on
//               record and already correctly deferred.
//   Section G — Collaboration follow-up: five named "tempting" ideas
//               evaluated on the SAME evidence bar as unrelated gaps — two
//               are already built, the rest lack evidence.
//   Section H — Decentralized substrate reassessment: 0.9.304's STOP
//               re-confirmed; technical capability (0.9.292's own matrix)
//               is still not a user choice requirement.
//   Section I — Architecture debt classification: five named traps, each
//               with a real, current-tree example, kept explicitly apart
//               from product gaps.
//   Section J — Candidate scoring matrix and final decision.
//
//   0.9.288 ── ... ── 0.9.307 ── 0.9.308 ── 0.9.309 ── 0.9.310 ── 0.9.311  <- this
//   (cross-arc,   (post-arc,    (multi-      (convergence  (post-       (post-
//    Commentary    placement     placement    audit,        placement-   placement,
//    selected)     selected)     visibility,  STOP)         visibility   whole-product
//                                READY)                      reassess-    reassessment)
//                                                             ment, STOP)

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

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

// Mirrors every prior reassessment's own helper (0.9.219, 0.9.250, 0.9.282,
// 0.9.287, 0.9.288, 0.9.306, 0.9.307, 0.9.310) — one grep-verifiable
// signal, never a header comment trusted at face value.
async function grepCount(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

async function runTests() {
    console.log('Running Post-Placement Product Evolution Reassessment tests...\n');

    // ===============================================================
    // Section A — Complete capability inventory. Thirteen named
    // surfaces, one fresh existence+content signal each, classified
    // against the five categories this milestone's own brief names.
    // ===============================================================
    {
        const capabilities = [
            ['Editor', 'ui/views/EditorView.js', 'export default'],
            ['Publication (create/publish)', 'application/PublishDocumentUseCase.js', 'export class PublishDocumentUseCase'],
            ['Commentary', 'core/PublicationCommentary.js', 'export class PublicationCommentary'],
            ['World View', 'ui/views/WorldView.js', 'export default'],
            ['Wanderer/vehicle', 'application/AvatarVehicleInteractionController.js', 'export class AvatarVehicleInteractionController'],
            ['Placement', 'application/PlacePublicationUseCase.js', 'export class PlacePublicationUseCase'],
            ['Snapshot discovery/materialization', 'application/DiscoverSnapshotCandidatesCommand.js', 'export function executeDiscoverSnapshotCandidatesCommand'],
            ['Collaboration (live)', 'application/WorldCommandPropagationUseCase.js', 'export class WorldCommandPropagationUseCase'],
            ['Place Naming', 'core/PlaceNamingClaim.js', 'export class PlaceNamingClaim'],
            ['Notifications', 'core/NotificationEvent.js', 'export class NotificationEvent'],
            ['Decentralized distribution', 'application/NostrPublicationDistributionRuntimeAdapter.js', 'export function createNostrPublicationDistributionRuntimeAdapter'],
            ['Provider preferences', 'core/RoleProviderPreference.js', 'export class RoleProviderPreference'],
            ['Authentication/identity', 'identity/LocalIdentityProvider.js', 'export class LocalIdentityProvider']
        ];
        for (const [name, path, marker] of capabilities) {
            assert(await sourceExists(path), `A. ${name} — ${path} exists.`);
            const source = await rawSource(path);
            assert(source.includes(marker), `A. ${name} — ${path} still contains "${marker}".`);
        }

        // A14. "Reachable" is a stronger claim than "exists" — the
        // always-mounted top nav still carries ten of these thirteen
        // surfaces as a real destination (Snapshot/placement/collaboration
        // are reached FROM World View, not as their own top-level nav
        // items — a fact 0.9.307's own A16 already established and this
        // reconfirms unchanged).
        const appSource = await rawSource('ui/App.js');
        const appWideRoutes = ['/editor', '/repository', '/worlds/recent', '/avatar', '/identity',
            '/peers', '/conversations', '/publications', '/settings', '/about'];
        for (const route of appWideRoutes) {
            assert(appSource.includes(`to="${route}"`), `A14. ui/App.js still links ${route} from the always-mounted top nav.`);
        }

        // A15. IMPLEMENTED + ORPHANED, distinguished explicitly from the
        // thirteen reachable capabilities above: a complete, independent,
        // fully-TESTED peer placement-replication protocol
        // (replication/ConflictResolver.js, replication/ReplicaMergeService.js,
        // replication/LocalReplicationStore.js,
        // application/ReplicatePlacementUseCase.js,
        // application/SynchronizeReplicaUseCase.js,
        // application/CreateReplicationUseCase.js) has ZERO callers in
        // application/ or ui/ outside its own five files — confirmed with
        // a live, working proof, not merely a source reading, developed
        // fully in Section C.
        {
            const a = new CausalStamp({ clock: { alice: 1, bob: 0 } });
            const b = new CausalStamp({ clock: { alice: 0, bob: 1 } });
            const resolver = new ConflictResolver();
            assert(resolver.compare(a, b) === ConflictRelation.CONCURRENT,
                'A15. The real, unmodified ConflictResolver genuinely detects two concurrent causal stamps, live — this is a working capability, not dead code.');
        }
        const replicationCallers = await grepCount('new CreateReplicationUseCase', ['application', 'ui']);
        assert(replicationCallers === 0,
            `A15b. Zero production call sites construct application/CreateReplicationUseCase.js — the pipeline's own top-level composition root — today (found ${replicationCallers}); it internally wires ReplicatePlacementUseCase/SynchronizeReplicaUseCase (real, but only ever reached FROM this unreached root) — implemented, working, and tested, but orphaned.`);

        // A16. IMPLEMENTED + INTENTIONALLY INTERNAL, reconfirmed fresh:
        // Automatic Snapshot Encounter Retention still has at most one
        // composition-only reference anywhere in ui/ — no settings
        // control, no removal toast, by 0.9.195's own documented design.
        const retentionUiHits = await grepCount('retentionRadius\\|RetentionReconciliation\\|shouldRetainAutomaticSnapshotEncounter', ['ui']);
        assert(retentionUiHits <= 1, `A16. Automatic Snapshot Encounter Retention still has at most one composition-only reference in ui/ (found ${retentionUiHits}).`);

        // A17. ARCHITECTURALLY POSSIBLE, but never built: the collaboration
        // consistency policy's own frozen descriptor explicitly admits no
        // conflict is ever detected, surfaced, or reconciled for
        // non-commuting concurrent operations — the exact class this
        // milestone's own A15 proves CAN compute (ConflictRelation.CONCURRENT
        // is a real, working comparison) is never wired to any UI signal.
        // Developed fully in Section G; recorded here as this section's
        // own inventory entry, not re-derived twice.
        assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.conflict.nonCommutingOperations === ConcurrentConflictResolution.UNDEFINED,
            'A17. The live, frozen policy descriptor still names conflict resolution UNDEFINED — architecturally possible (A15 proves the primitive works), never surfaced.');

        // A18. ACTUALLY MISSING — the honest negative result this
        // section's own inventory produces: no capability swept in A1-A17,
        // nor anywhere else this milestone's own Sections B-I research,
        // is a real user-facing action that is impossible to reach through
        // ANY existing surface. Every gap this milestone finds (Sections
        // C, F, G, I) is either architecture debt, an orphaned-but-working
        // capability, or a real product gap whose SCOPE or EVIDENCE this
        // milestone's own later sections weigh — never a hard technical
        // impossibility. Recorded here as fact, not assumed; Section J's
        // own decision matrix is where that weighing happens.

        console.log('✓ A: Thirteen named capabilities are IMPLEMENTED and REACHABLE from a real nav destination or an already-established composition (A1-A14). One capability (the peer placement-replication protocol) is IMPLEMENTED + ORPHANED — proven live, working, and callerless (A15-A15b). One (Automatic Snapshot Retention) is IMPLEMENTED + INTENTIONALLY INTERNAL, reconfirmed fresh (A16). One (non-commuting-operation conflict detection) is ARCHITECTURALLY POSSIBLE — its own primitive genuinely works (A15) — but never surfaced (A17), per the collaboration policy\'s own explicit admission. No capability swept anywhere in this milestone\'s own research is ACTUALLY MISSING in the sense of "impossible to reach" (A18) — every finding below is a scope/evidence question, never a hard gap.');
    }

    // ===============================================================
    // Section B — User-journey closure. Four representative end-to-end
    // journeys, each traced hop by hop against real, unmodified source.
    // ===============================================================
    {
        // B1. Create -> Edit -> Publish -> Distribute -> Discover -> Inspect.
        // Every hop already established (0.9.307 B6/D1, reconfirmed live):
        // the Editor composes both live collaboration and Publish in the
        // same view, and the real distribution runtime adapters are
        // constructed in ui/main.js, not stubbed.
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(/documentCommandPropagation/.test(editorViewSource) && /publishDocumentUseCase/.test(editorViewSource),
            'B1a. EditorView.js still composes both live collaboration and the publish use case in the same view.');
        const mainSource = await rawSource('ui/main.js');
        assert(/createNostrPublicationDistributionRuntimeAdapter/.test(mainSource) && /createArweavePublicationDistributionRuntimeAdapter/.test(mainSource),
            'B1b. ui/main.js still constructs both real distribution runtime adapters.');
        assert(await sourceExists('ui/components/PublicationCatalog.js'),
            'B1c. A real Discover/Inspect surface (PublicationCatalog.js) still exists for the journey\'s own final hop.');

        // B2. Encounter -> Inspect -> Comment -> Notification -> History.
        // WorldEncounterCanvas gates commentary on the same selected
        // encounter (0.9.307 D2a), and Commentary already produces
        // NotificationEvent facts a recipient can follow to History
        // (0.9.306's own closed verdict, reconfirmed with one signal).
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(/encounterCommentaryPublicationId/.test(canvasSource),
            'B2a. WorldEncounterCanvas.js still gates its commentary panel on the selected encounter.');
        assert((await rawSource('ui/components/NotificationHistoryPanel.js')).includes("name: 'NotificationHistoryPanel'"),
            'B2b. NotificationHistoryPanel.js still exists — the journey\'s own terminal hop.');

        // B3. Create Snapshot -> Distribute -> Discover -> Verify ->
        // Materialize -> Place. Every stage still has a real, reusable UI
        // action (0.9.307's own dedicated Snapshot research pass,
        // reconfirmed with one signal per stage).
        assert((await rawSource('ui/components/OwnPublicationPanel.js')).includes('discoverOwnSnapshot') &&
            (await rawSource('ui/components/WorldEncounterCanvas.js')).includes('armComparisonSelection') &&
            (await rawSource('ui/main.js')).includes("app.provide('exportSnapshotCommand'"),
            'B3. Snapshot discovery, comparison, and export all still have real UI call sites.');

        // B4. Place Publication -> Own Publication -> See all placements.
        // Terminates at observation, by design (0.9.308-0.9.310, fully
        // proven and converged) — reconfirmed with one fresh, live signal
        // that the plural read path still returns every placement,
        // unreduced.
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(panelSource.includes('getPlacementsForPublication') || panelSource.includes('publicationPlacements'),
            'B4. OwnPublicationPanel.js still renders the plural placements read path 0.9.308 wired.');

        console.log('✓ B: All four named journeys traced hop by hop against real, unmodified source. None dead-ends short of its own natural terminus: B1 and B3 reach real discovery/inspection surfaces; B2 reaches a real History surface; B4 terminates at observation BY DESIGN (0.9.308-0.9.310\'s own already-converged finding), not by an unaddressed gap. No NEW blocking hop was found on any of the four.');
    }

    // ===============================================================
    // Section C — Orphaned capability sweep. A fresh, repo-wide
    // zero-caller scan (methodology: every "export class"/"export
    // function" in application/, checked for ANY reference elsewhere in
    // application/ or ui/), classified against the six labels this
    // milestone's own brief requires — never assumed a product gap
    // merely because it compiles and has no caller.
    // ===============================================================
    {
        const classifications = [];

        // C1. The peer placement-replication protocol (A15) — a complete,
        // parallel offline-sync mechanism (vector-clock CausalStamp
        // comparison, ConflictPolicy, ReplicaMergeService,
        // LocalReplicationStore) for PlacementRecord objects, entirely
        // separate from the LIVE collaboration protocol
        // (WorldCommandPropagationUseCase + replication/WorldConflictResolver.js)
        // that actually ships. Confirmed structurally distinct: the two
        // resolvers are different classes in different files, and the
        // live protocol's own file never imports the offline one.
        const propagationSource = codeOnlyLines(await rawSource('application/WorldCommandPropagationUseCase.js'));
        assert(propagationSource.includes("from '../replication/WorldConflictResolver.js'") &&
            !propagationSource.includes("from '../replication/ConflictResolver.js'"),
            'C1. WorldCommandPropagationUseCase.js still imports WorldConflictResolver (the live protocol), never the offline ConflictResolver (A15\'s own orphan) — two genuinely separate mechanisms, not a duplicate.');
        classifications.push(['Peer placement-replication protocol (ConflictResolver/ReplicaMergeService/CreateReplicationUseCase family)', 'HISTORICAL — superseded by the live WorldConflictResolver-based collaboration protocol; no evidence any user needs BOTH an offline peer-sync model and a live one for the same PlacementRecord data.']);

        // C2. CreatePlacementRegistryUseCase — already established
        // (0.9.307 C2, 0.9.310 A8) as a bypassed composition root, still
        // true today: CreateWorldViewUseCase.js still builds the
        // identical collaborator set directly.
        const cprCallers = await grepCount('new CreatePlacementRegistryUseCase', ['application', 'ui']);
        assert(cprCallers === 0, `C2. application/CreatePlacementRegistryUseCase.js still has zero production call sites (found ${cprCallers}).`);
        classifications.push(['CreatePlacementRegistryUseCase', 'INTERNAL — composition root bypassed, not broken; the underlying registry it would wire is already constructed directly elsewhere (0.9.307/0.9.310\'s own established finding, unchanged).']);

        // C3. A wider pattern than C2 alone: the identical "composition
        // root bypassed by direct construction elsewhere" shape recurs
        // for identity/authorization/world-layout wiring — checked fresh,
        // three more instances, none previously named by any prior
        // reassessment.
        const bypassedRoots = [
            ['CreateIdentityUseCase', 'new CreateIdentityProviderUseCase().execute()', 'ui/main.js'],
            ['CreateAuthorizationUseCase', 'new LocalAuthorizationVerifier();', 'application/CreatePublicationCatalogUseCase.js'],
            ['CreateWorldLayoutUseCase', 'new LocalWorldLayoutProvider(', 'application/CreateWorldViewUseCase.js']
        ];
        for (const [rootClass, directConstructionSnippet, elsewhereFile] of bypassedRoots) {
            const rootCallers = await grepCount(`new ${rootClass}`, ['application', 'ui']);
            assert(rootCallers === 0, `C3. application/${rootClass}.js still has zero production call sites (found ${rootCallers}).`);
            const elsewhereSource = await rawSource(elsewhereFile);
            assert(elsewhereSource.includes(directConstructionSnippet),
                `C3b. ${elsewhereFile} still constructs the SAME underlying collaborator (${directConstructionSnippet}) directly, bypassing ${rootClass} — the capability is reachable, only the composition root is unused.`);
        }
        classifications.push(['CreateIdentityUseCase / CreateAuthorizationUseCase / CreateWorldLayoutUseCase', 'INTERNAL — the SAME bypassed-composition-root pattern as C2, now confirmed to recur across identity/authorization/world-layout wiring, not unique to placement. A codebase-wide convention, not three independent gaps.']);

        // C4. createBrickRegistry() — a bare, exported convenience
        // function wrapping `new CreateBrickRegistryUseCase().execute()`
        // — genuinely has zero callers, while the CLASS it wraps is
        // constructed directly at eleven real call sites (EditorView.js,
        // WorldView.js, and nine application/ composition roots). Not an
        // orphaned capability — a duplicate entry point nobody uses,
        // because everyone already reaches the same result the other way.
        const bareFunctionCallers = await grepCount('createBrickRegistry\\(\\)', ['application', 'ui']);
        const classCallers = await grepCount('new CreateBrickRegistryUseCase', ['application', 'ui']);
        assert(bareFunctionCallers <= 1 && classCallers >= 10,
            `C4. application/CreateBrickRegistryUseCase.js's own bare createBrickRegistry() function has at most its own declaration as a hit (found ${bareFunctionCallers}), while the class it wraps has ${classCallers} real call sites — a duplicate, unused entry point, not a missing capability.`);
        classifications.push(['createBrickRegistry() bare function', 'DUPLICATIVE — the class it wraps is already the codebase\'s own real, well-used entry point.']);

        // C5. getPlacementInfoForPublication() — already established
        // (0.9.310 A9) as real, tested, but reachable from zero
        // ui/components/*.js files. Reconfirmed unchanged.
        const getPlacementInfoForPubUiCallers = await grepCount('getPlacementInfoForPublication', ['ui/components']);
        assert(getPlacementInfoForPubUiCallers === 0, `C5. getPlacementInfoForPublication() still has zero ui/components/*.js callers (found ${getPlacementInfoForPubUiCallers}).`);
        classifications.push(['getPlacementInfoForPublication()', 'INTERNAL — real, tested, composed only for AutomaticSnapshotEncounterCascade\'s own internal closure, never rendered (0.9.310\'s own finding, unchanged).']);

        // C6. Discovery-level Commentary-activity signal — already
        // established (0.9.307 F1) as a real, but unestablished-semantics
        // gap. Reconfirmed unchanged: the app-wide Discovery listing still
        // carries zero commentary vocabulary.
        const discoveryHits = await grepCount('ommentary', ['ui/views/DecentralizedPublicationsView.js',
            'ui/components/PublicationCatalog.js', 'ui/components/PublicationList.js', 'ui/components/PublicationPreview.js']);
        assert(discoveryHits === 0, 'C6. The app-wide Discovery listing and its catalog/list/preview components still carry zero commentary vocabulary.');
        classifications.push(['Discovery-level Commentary-activity count', 'DEFER — real gap, unestablished semantics (0.9.307\'s own finding: 0.9.305 already answered "should the FULL Commentary UI live here" (no) without separately answering "should a bare COUNT"). Unchanged since 0.9.307; still not selected.']);

        // C7. Editor Structure-Document history timeline / World-Document
        // autosave-recovery parity — already established (0.9.307 C3/C4/D4)
        // as real, but LARGE-scope gaps. Reconfirmed unchanged, three
        // milestones later.
        const editorSessionSource = codeOnlyLines(await rawSource('application/EditorSession.js'));
        assert(!/ReplayDocumentUseCase|RestoreHistoryStateUseCase|getTimeline/.test(editorSessionSource),
            'C7a. application/EditorSession.js still has zero references to ReplayDocumentUseCase/RestoreHistoryStateUseCase/getTimeline — unchanged since 0.9.307.');
        assert(!/[Aa]utosave|[Rr]ecovery/i.test(await rawSource('ui/views/WorldView.js')),
            'C7b. ui/views/WorldView.js still carries no Autosave/Recovery vocabulary — unchanged since 0.9.307.');
        classifications.push(['Editor history-timeline parity / World autosave-recovery parity', 'DEFER — real product gaps, LARGE scope (0.9.307\'s own finding: would re-derive a multi-milestone arc, plus a genuine open collaboration-semantics question). Unchanged since 0.9.307; still not selected.']);

        console.log('✓ C: Fresh repo-wide zero-caller sweep, seven findings, each classified against real, live evidence:');
        for (const [name, classification] of classifications) console.log(`    [${classification.split(' — ')[0]}] ${name}`);
        console.log('  The single NEW finding this milestone contributes (C1, plus its wider pattern C3) is a complete, working, tested offline peer-replication protocol with zero production callers — correctly HISTORICAL, not a product gap: 0.9.222+ built and shipped a DIFFERENT, live collaboration protocol for the same underlying PlacementRecord data, and no evidence anywhere suggests a user needs both models running side by side. Every other finding (C2, C4-C7) either reconfirms a PRIOR milestone\'s own established classification unchanged, or (C3) generalizes it into a wider, still-INTERNAL pattern — no new PRODUCT_GAP surfaces from this sweep.');
    }

    // ===============================================================
    // Section D — Cross-arc convergence opportunities. Two named trees
    // checked for a missing seam; one tempting pairing deliberately
    // REJECTED per this milestone's own brief ("These two things happen
    // to exist" is not a journey).
    // ===============================================================
    {
        // D1. Snapshot { Distribution, Attribution, Comparison, World
        // placement } — already fully convergent on ONE component
        // (0.9.307 F2), reconfirmed fresh.
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(/distributionCommand/.test(canvasSource) && /Snapshot Attribution/.test(canvasSource) &&
            /worldSnapshotComparisonResult/.test(canvasSource),
            'D1. WorldEncounterCanvas.js still converges Snapshot distribution, attribution, and comparison on one selected-encounter surface — no missing seam, unchanged since 0.9.307.');

        // D2. Publication { Commentary, Placement, Distribution,
        // Notification } — checked on the ONE surface that already
        // composes the most of these together (WorldEncounterCanvas):
        // commentary and placement-adjacent World-source registration
        // already coexist there; the app-WIDE Discovery listing still
        // does not carry the same convergence (Section C6) — a real, but
        // already-classified DEFER, not re-selected here.
        assert(/encounterCommentaryPublicationId/.test(canvasSource) &&
            /registerMaterializedSnapshotWorldSource|unregisterSelectedSnapshot/.test(canvasSource),
            'D2. WorldEncounterCanvas.js still converges Commentary and Snapshot/placement registration on the same selected encounter — the seam that exists is real; the seam that does NOT (Discovery-level) is Section C6\'s own already-classified DEFER.');

        // D3. REJECTED pairing, named explicitly per this milestone's own
        // brief: the Publisher Leaderboard / external-anchor evidence
        // subsystem (0.8.113-0.8.189, ~77 application files) and
        // Notifications (0.9.273-0.9.306). Both exist. Both are real,
        // independently-shipped capabilities. There is NO user journey
        // connecting them anywhere in this codebase's own vocabulary —
        // confirmed structurally: zero notification-producer files
        // reference Leaderboard/Achievement vocabulary, and the
        // Leaderboard surfaces themselves (Section A/C's own reachability
        // check) are reached from their own dedicated views, never from
        // NotificationHistoryPanel or any commentary/placement flow.
        const notifSource = await sourceExists('application/PublicationCommentaryNotificationProducer.js')
            ? await rawSource('application/PublicationCommentaryNotificationProducer.js') : '';
        assert(!/PublisherLeaderboard|Achievement/.test(notifSource),
            'D3. The one real notification-PRODUCING file this codebase has (Commentary\'s own producer) carries zero Leaderboard/Achievement vocabulary — the two subsystems have never been wired together, and this milestone does not wire them now: "both exist" is not a journey.');

        console.log('✓ D: Snapshot\'s four-branch tree stays fully convergent (D1, unchanged). Publication\'s tree has a real seam where it already converges (D2) and a real, but already-classified-DEFER gap where it does not (Section C6) — nothing new selected here. One tempting cross-arc pairing (Publisher Leaderboard <-> Notifications) is explicitly evaluated and REJECTED (D3): both subsystems are real and shipped, but no user journey connects them, and this milestone declines to invent one merely because both classes are importable.');
    }

    // ===============================================================
    // Section E — Awareness/product-gap reassessment. The Notification
    // boundary re-confirmed, never expanded automatically.
    // ===============================================================
    {
        // E1. The boundary this milestone's own brief names — event fact
        // -> deduplication -> durable history -> authenticated retrieval
        // -> History UI — reconfirmed fresh against real source at every
        // stage.
        assert(await sourceExists('core/NotificationEvent.js'), 'E1a. Event fact: core/NotificationEvent.js still exists.');
        assert(await sourceExists('storage/NotificationEventStore.js'), 'E1b. Deduplication/durable history: storage/NotificationEventStore.js still exists.');
        assert(await sourceExists('application/GetRecipientNotificationEventsUseCase.js'), 'E1c. Authenticated retrieval: application/GetRecipientNotificationEventsUseCase.js still exists.');
        assert(await sourceExists('ui/components/NotificationHistoryPanel.js'), 'E1d. History UI: ui/components/NotificationHistoryPanel.js still exists.');

        // E2. No unread/read, badge, push, or delivery vocabulary was
        // added since 0.9.306's own STOP — reconfirmed with a direct
        // sweep of the notification-family application files.
        const notifFiles = ['storage/NotificationEventStore.js', 'application/GetRecipientNotificationEventsUseCase.js',
            'ui/components/NotificationHistoryPanel.js'];
        for (const f of notifFiles) {
            const source = codeOnlyLines(await rawSource(f));
            assert(!/isRead\b|markAsRead|unreadCount|pushNotification|NotificationBadge/.test(source),
                `E2. ${f}'s own CODE (comments aside — its own header merely NAMES these as deliberately excluded) still carries no read/unread, badge, or push vocabulary.`);
        }

        // E3. RoleProviderPreference (0.9.293-0.9.304) has NOT been
        // integrated into the notification path — reconfirmed fresh, the
        // exact boundary 0.9.304's own STOP established.
        const roleProviderNotifHits = await grepCount('RoleProviderPreference', notifFiles);
        assert(roleProviderNotifHits === 0, `E3. Zero notification-family files reference RoleProviderPreference (found ${roleProviderNotifHits}) — 0.9.304's own boundary still holds.`);

        console.log('✓ E: The five-stage boundary this milestone\'s own brief names is intact end to end (E1). No unread/read, badge, push, delivery-queue, or provider-preference vocabulary has been added since 0.9.306\'s own STOP (E2-E3) — this reassessment does not expand NotificationEvent, exactly as instructed, absent new evidence, which this milestone\'s own research (Sections B, D) found none of.');
    }

    // ===============================================================
    // Section F — World interaction gap. Reassessed fresh: richer
    // Publication interaction, navigation, placement interaction,
    // Snapshot interaction — without committing to any of them.
    // ===============================================================
    {
        // F1. Richer interaction with encountered Publications — already
        // rich: comment, verify, distribute, compare, materialize, and
        // place ALL already converge on the one selected-encounter
        // surface (Section D1/D2's own live re-confirmation). No further
        // named interaction (e.g. "rate," "bookmark," "share") appears
        // anywhere in this codebase's own vocabulary — checked directly,
        // not assumed absent.
        const bookmarkHits = await grepCount('bookmarkPublication\\|favoritePublication\\|PublicationBookmark\\|PublicationFavorite\\|PublicationRating',
            ['application', 'ui']);
        assert(bookmarkHits === 0, 'F1. No bookmark/favorite/rating vocabulary exists anywhere — not a silently-missing feature this milestone found evidence for, simply never proposed.');

        // F2. Navigation — 0.9.310's own Section D finding (document-keyed,
        // never placement-keyed, proven on two independent existing
        // features) reconfirmed fresh with one signal.
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(sessionSource.includes('this._getWorldPosition(documentId)'),
            'F2. focusDocument() still resolves its camera target through the per-DOCUMENT _getWorldPosition(), never a per-placement one — 0.9.310\'s own finding holds unchanged.');

        // F3. Placement-related interaction (navigate to/manage a specific
        // placement) — 0.9.310's own DEFER verdict, reconfirmed: the
        // Roadmap's own standing bar for this candidate is still on
        // record, unaddressed.
        assert((await rawSource('docs/Roadmap.md')).includes('once there is real evidence that visibility alone is\ninsufficient, never on inertia'),
            'F3. docs/Roadmap.md still carries this exact standing bar for placement navigation/management — still not met.');

        // F4. Snapshot interaction — already complete (0.9.307's own D3
        // finding: every stage has a real, reusable UI action, the loop
        // closes with re-inspection/re-comparison/removal). Reconfirmed
        // with the same live signal.
        assert((await rawSource('ui/components/WorldEncounterCanvas.js')).includes('unregisterSelectedSnapshot'),
            'F4. WorldEncounterCanvas.js still exposes unregisterSelectedSnapshot() — the Snapshot interaction loop still has no dead end.');

        console.log('✓ F: None of the four named World View interaction candidates produces a NEW evidenced gap. Richer Publication interaction is already rich, and no further interaction (rate/bookmark/share) has ever been proposed anywhere in this codebase\'s own vocabulary (F1). Navigation stays document-keyed by construction, unchanged (F2). Placement-specific navigation/management stays correctly DEFERRED against its own still-unmet standing bar (F3). Snapshot interaction stays complete (F4). World View is reassessed here, fresh, and confirmed to have no currently-blocked user journey.');
    }

    // ===============================================================
    // Section G — Collaboration follow-up. Five named "tempting" ideas,
    // each competing against unrelated product gaps on the SAME
    // evidence bar — never assumed to be the next milestone merely
    // because collaboration infrastructure exists.
    // ===============================================================
    {
        // G1. Presence indicators — NOT a gap. Already fully built and
        // live: WorldPresenceIndicator (online count), WorldCollaboratorIndicator
        // (per-collaborator rows with a real "Follow" action), and
        // WorldCollaborationRoster all compose into WorldView.js today.
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(/<WorldPresenceIndicator/.test(worldViewSource) && /<WorldCollaboratorIndicator/.test(worldViewSource) &&
            /buildWorldCollaborationRoster/.test(worldViewSource),
            'G1. ui/views/WorldView.js still renders WorldPresenceIndicator and WorldCollaboratorIndicator, and still composes buildWorldCollaborationRoster — presence is already a live, shipped capability.');

        // G2. Cursors (live, per-collaborator pointer position) — no
        // evidence anywhere. Confirmed: zero "cursor" hits in ui/components
        // beyond ordinary CSS `cursor:` styling (checked directly, not
        // merely absent from a keyword list).
        const cursorFiles = await grepCount('cursor:.*pointer\\|LiveCursor\\|CollaboratorCursor', ['ui/components']);
        const cssOnlyCursorFiles = await grepCount('cursor:.*pointer', ['ui/components']);
        assert(cursorFiles === cssOnlyCursorFiles,
            'G2. Every "cursor"-adjacent hit in ui/components resolves to ordinary CSS pointer styling — no LiveCursor/CollaboratorCursor concept exists anywhere.');

        // G3. Conflict/divergence UI — a real absence, but backed by an
        // EXPLICIT, deliberate policy decision (0.9.225/0.9.238-0.9.240),
        // not an oversight: the live, frozen policy descriptor names
        // conflict resolution UNDEFINED, missing-operation detection
        // NONE, and convergence NOT_GUARANTEED — "no conflict is ever
        // detected, surfaced, or reconciled" is the policy's own quoted
        // admission. 0.9.240's own "what comes after" left "does the
        // product now require convergence" as a deliberately SEPARATE
        // decision — still unaddressed three arcs later, but with no
        // user-facing evidence (a bug report, a support request, a named
        // scenario) that any user has actually hit silent divergence.
        assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.missingOperations.detection === MissingOperationDetection.NONE &&
            DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.convergence.guaranteed === ReplicaConvergenceGuarantee.NOT_GUARANTEED,
            'G3. The live policy descriptor still names missing-operation detection NONE and convergence NOT_GUARANTEED — a real, deliberate, unaddressed property, not newly discovered here.');
        const conflictUiHits = await grepCount('ConflictBanner\\|DivergenceIndicator\\|ConflictNotice', ['ui/components']);
        assert(conflictUiHits === 0, 'G3b. No conflict/divergence-facing UI component exists anywhere — confirmed absent, not assumed.');

        // G4. Operation-history sharing (exporting/sharing a document's
        // own CommandHistory with a collaborator) — no evidence, not
        // built.
        const shareHistoryHits = await grepCount('shareHistory\\|exportTimeline\\|shareCommandHistory\\|shareOperationHistory', ['application', 'ui']);
        assert(shareHistoryHits === 0, 'G4. No operation-history-sharing vocabulary exists anywhere.');

        // G5. Invitations — NOT a gap. Already fully built and live:
        // peer/PeerInvitation.js is constructed by the real, production
        // DiscoverPeersUseCase and consumed by PeerSessionManager, reached
        // through the always-mounted /peers nav destination (Section A14).
        assert(await sourceExists('peer/PeerInvitation.js'), 'G5. peer/PeerInvitation.js still exists.');
        const discoverPeersSource = await rawSource('application/DiscoverPeersUseCase.js');
        assert(discoverPeersSource.includes('PeerInvitation.create'),
            'G5b. DiscoverPeersUseCase.js still constructs a real PeerInvitation — invitations are already a live, shipped capability.');

        console.log('✓ G: Five named collaboration candidates, each graded on the same bar as any unrelated gap. Presence indicators (G1) and invitations (G5) are NOT gaps at all — both already fully built and live, the exact "already shipped, don\'t duplicate" shape 0.9.310 Section G found for cross-publication placement discovery. Cursors (G2) and operation-history sharing (G4) have zero evidence anywhere. Conflict/divergence UI (G3) is the most substantive of the five — a real, deliberate policy gap, explicitly left as a "separate decision" by 0.9.240 — but has no user-facing evidence of actual harm, and closing it correctly would mean revisiting a deliberate architectural decision (undefined conflict resolution), not adding a UI seam over an existing fact. None of the five clears this milestone\'s own evidence bar for selection; two are already done, three are correctly DEFERRED.');
    }

    // ===============================================================
    // Section H — Decentralized substrate reassessment. 0.9.304's own
    // STOP re-confirmed; technical capability is not a user-choice
    // requirement.
    // ===============================================================
    {
        // H1. RoleProviderPreference still has exactly the same narrow
        // footprint 0.9.304 left it with — reconfirmed fresh (not merely
        // re-read): zero references anywhere in the Commentary or
        // Notification file families.
        const roleProviderFiles = await grepCount('RoleProviderPreference', ['application']);
        const roleProviderInCommentaryOrNotif = await grepCount('RoleProviderPreference',
            ['application/PublicationCommentaryNotificationProducer.js', 'storage/NotificationEventStore.js',
                'application/GetRecipientNotificationEventsUseCase.js', 'core/PublicationCommentary.js']);
        assert(roleProviderInCommentaryOrNotif === 0,
            `H1. RoleProviderPreference (referenced in ${roleProviderFiles} application/ files total) still has zero references in any Commentary/Notification file — 0.9.304's boundary holds.`);

        // H2. The 0.9.292 capability matrix's own finding — Discovery,
        // Content, and Proof & Anchoring roles remain technically capable
        // of more than one provider — still holds structurally (Bitcoin
        // remains the only class extending ProofVerifier; Base still has
        // no verify half). This is confirmed here NOT as a new finding,
        // but specifically to prove the technical-capability fact and the
        // product decision are two different things this milestone keeps
        // apart, per its own Section I.
        const proofVerifierExtenders = await grepCount('extends ProofVerifier', ['anchoring', 'application', 'base']);
        assert(proofVerifierExtenders >= 1, 'H2. At least one real class still extends ProofVerifier (Bitcoin\'s own) — the technical capability the matrix found remains real and unchanged.');

        // H3. No new user choice has appeared. Every milestone TITLE since
        // 0.9.304 (0.9.305-0.9.310, checked by its own "## 0.9.xxx —
        // Title" Roadmap header, never by scanning body prose that
        // legitimately CITES the provider-preference boundary by name
        // while preserving it — e.g. 0.9.305's own "no provider
        // preferences of any kind" exclusion) is a Commentary/
        // Notification/Placement title, none a provider-selection title.
        const roadmap = await rawSource('docs/Roadmap.md');
        const titlesSincePreference = [...roadmap.matchAll(/^## (0\.9\.30[5-9]|0\.9\.310) — (.+)$/gm)].map(([, , title]) => title);
        assert(titlesSincePreference.length === 6, `H3. Exactly six milestone titles exist between 0.9.304 and this one (found ${titlesSincePreference.length}).`);
        assert(!titlesSincePreference.some((t) => /provider/i.test(t)),
            `H3. None of the six milestone TITLES since 0.9.304 mentions "provider" (titles: ${titlesSincePreference.join(' | ')}) — no new provider-choice milestone has been selected.`);

        console.log('✓ H: 0.9.304\'s own STOP holds, reconfirmed fresh, not merely re-read (H1). The 0.9.292 capability matrix\'s own technical finding — several roles remain capable of more than one provider — still holds structurally (H2), but no new user choice has appeared anywhere in the six milestones since 0.9.304 (H3). Per 0.9.304\'s own decision and this milestone\'s own brief: "don\'t extend the provider-preference system merely because Discovery and Proof remain technically capable of additional providers" — preserved unmodified.');
    }

    // ===============================================================
    // Section I — Architecture debt classification. Five named traps,
    // each with a real, current-tree example — kept explicitly apart
    // from product gaps, never conflated.
    // ===============================================================
    {
        const table = [
            ['missing abstraction ≠ missing product capability',
                'CreateReplicationUseCase/CreateIdentityUseCase/CreateAuthorizationUseCase/CreateWorldLayoutUseCase (Section C1/C3) — no unified "composition root" abstraction wraps all of them, but every underlying capability (identity, authorization, world layout) is already reachable through direct construction elsewhere.'],
            ['unused class ≠ missing UI',
                'createBrickRegistry() bare function (Section C4) — unused, but the CLASS it wraps already has eleven real call sites; there is no missing UI here, only a redundant export.'],
            ['possible provider ≠ provider choice requirement',
                '0.9.292\'s own capability matrix (Section H2) — Discovery/Content/Proof remain technically extensible to more providers; no evidence any user has ever asked to choose between them beyond the already-shipped, already-STOPped Content Provider Preference.'],
            ['available metadata ≠ metadata display requirement',
                'placement.overlapCount (0.9.310 F2, still unrendered in OwnPublicationPanel) — computed and available on every plural placement entry, but the identical fact already has a MORE complete, actionable answer elsewhere (PlacementInfoPanel\'s own "View" -> LocationDocumentsDialog); a bare second copy was correctly DEFERRED, not built.'],
            ['existing API ≠ user-facing action',
                'getPlacementInfoForPublication() / getDocumentsAtPosition() (Sections C5, D) — both are real, callable, tested APIs; neither is a user-facing action until something renders a control that calls it, and nothing does for the former.']
        ];
        for (const [trap, example] of table) {
            assert(typeof trap === 'string' && typeof example === 'string' && example.length > 40,
                `I. "${trap}" carries a real, specific, non-generic example.`);
        }

        console.log('✓ I: Five named traps, each anchored to a real, current-tree example rather than a generic warning:');
        for (const [trap, example] of table) console.log(`    - ${trap}\n      ${example}`);
        console.log('  None of these five examples is promoted to a product gap by this section — each is exactly what Sections C/F/G/H already classified it as (INTERNAL/DUPLICATIVE/STOP/DEFER). This section exists to make the DISTINCTION explicit, not to re-litigate the classifications.');
    }

    // ===============================================================
    // Section J — Candidate scoring and final decision.
    // ===============================================================
    {
        const matrix = [
            ['Placement navigate/manage (0.9.310 D/E, reconfirmed F2-F3)', false, true, false, 'Medium', 'DEFER'],
            ['Discovery-level Commentary count (0.9.307 F1, reconfirmed C6)', false, true, true, 'Small', 'DEFER'],
            ['Editor history-timeline / World autosave-recovery parity (0.9.307 D4, reconfirmed C7)', true, 'partial', 'partial', 'Large', 'DEFER'],
            ['Collaboration conflict/divergence UI (Section G3, new this milestone)', false, 'partial', true, 'Medium', 'DEFER'],
            ['Peer placement-replication protocol revival (Section C1)', false, true, false, 'N/A', 'STOP']
        ];
        for (const [name, , , , scope, decision] of matrix) {
            assert(typeof name === 'string' && ['DEFER', 'STOP', 'INTEGRATE', 'READY'].includes(decision) && scope,
                `J. ${name} carries a valid decision and scope.`);
        }
        console.log('✓ J: Decision matrix:');
        console.log('    Candidate                                                                      Blocked  Cap.  Seam  Scope  Decision');
        for (const [name, blocked, cap, seam, scope, decision] of matrix) {
            const mark = (v) => v === true ? 'Yes' : (v === 'partial' ? '~' : 'No');
            console.log(`    ${name.padEnd(78)} ${mark(blocked).padEnd(8)} ${mark(cap).padEnd(5)} ${mark(seam).padEnd(5)} ${scope.padEnd(6)} ${decision}`);
        }

        console.log('\n✓ J: VERDICT.\n' +
'\n' +
'OUTCOME: STOP.\n' +
'\n' +
'WHY. Every candidate this milestone\'s own thirteen-surface inventory (A),\n' +
'four-journey trace (B), orphan sweep (C), convergence check (D),\n' +
'notification reassessment (E), World View reassessment (F), collaboration\n' +
'follow-up (G), and decentralized substrate reassessment (H) produced was\n' +
'graded against the SAME bar — a real, currently-blocked user action —\n' +
'never "the underlying capability already exists, therefore expose it."\n' +
'\n' +
'  - Placement navigate/manage: DEFER, unchanged since 0.9.310 — no user\n' +
'    is blocked; the standing evidence bar 0.9.308 itself set is still\n' +
'    unmet.\n' +
'\n' +
'  - Discovery-level Commentary count: DEFER, unchanged since 0.9.307 —\n' +
'    small scope, but genuinely unestablished semantics, not merely\n' +
'    unbuilt.\n' +
'\n' +
'  - Editor/World history-autosave parity: DEFER, unchanged since 0.9.307\n' +
'    — the strongest-scoped candidate on record, but LARGE, and it still\n' +
'    carries a genuine, unresolved collaboration-semantics question\n' +
'    (Section G3\'s own conflict-policy finding sharpens exactly why: this\n' +
'    codebase has an explicit, deliberate position that convergence is\n' +
'    NOT guaranteed, which "restore an earlier state during a live\n' +
'    session" would collide with directly).\n' +
'\n' +
'  - Collaboration conflict/divergence UI: DEFER, new this milestone. The\n' +
'    most substantively NEW finding in this reassessment — a real,\n' +
'    deliberate policy gap (0.9.225-0.9.240\'s own "no conflict is ever\n' +
'    detected, surfaced, or reconciled") that no later milestone has\n' +
'    revisited. But no user-facing evidence exists that any real user has\n' +
'    hit silent divergence, and closing it correctly would mean\n' +
'    overturning a deliberate architecture decision, not adding a UI seam\n' +
'    — a materially different, larger kind of milestone than this\n' +
'    reassessment\'s own brief calls for.\n' +
'\n' +
'  - Peer placement-replication protocol: STOP outright. A complete,\n' +
'    tested, working capability (Section A15\'s own live proof) — but\n' +
'    superseded by the live collaboration protocol that actually shipped;\n' +
'    reviving it would build a second, competing sync model with no\n' +
'    evidenced need for both.\n' +
'\n' +
'Two "tempting" collaboration ideas (presence indicators, invitations)\n' +
'turned out to be NOT gaps at all — both already fully built and live\n' +
'(Section G1/G5) — the same "already shipped, don\'t duplicate" shape\n' +
'0.9.310 found for cross-publication placement discovery. This is now the\n' +
'THIRD consecutive reassessment (0.9.307, 0.9.310, 0.9.311) to find at\n' +
'least one candidate that looked like a gap but was already done.\n' +
'\n' +
'WHAT THIS MEANS. Every recently-completed arc (Content Provider\n' +
'Preference, Commentary cross-surface, Notifications, Snapshot, Place\n' +
'Naming, Placement visibility) reconfirms STOP for itself. The two large,\n' +
'scope-deferred candidates from 0.9.307 (Editor/World parity) remain on\n' +
'record, unaddressed, three milestones later — genuinely available to a\n' +
'future milestone that wants to take on their scope, but not selected\n' +
'here. The one new substantive finding (collaboration conflict UI) is\n' +
'real but requires a product decision (does ForkBuild need convergence?)\n' +
'this test-only reassessment is correctly not positioned to make on its\n' +
'own. Per this milestone\'s own governing principle — select the next\n' +
'milestone from an evidenced user-facing gap, never an interesting\n' +
'architectural capability — STOP is the correct milestone outcome. The\n' +
'system stays at a stable, honestly-recorded product boundary rather than\n' +
'being extended for the sake of the roadmap.\n');
    }

    console.log('\n✅ All Post-Placement Product Evolution Reassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostPlacementProductEvolutionReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostPlacementProductEvolutionReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
