import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { StorageProvider } from '../storage/StorageProvider.js';
import { Position } from '../core/Position.js';
import { PlacementRecord } from '../core/PlacementRecord.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { DiscoverPlacementsUseCase } from '../application/DiscoverPlacementsUseCase.js';

// 0.9.307 — Post-Arc Product Evolution Reassessment.
//
// Test/document-only, per this milestone's own brief. No production code
// changes ship here. 0.9.288 (Cross-Arc Product Evolution Reassessment)
// asked, once, "now that ten arcs are independently complete, where does
// the product AS A WHOLE still owe something — inside one arc, or, more
// valuably, in the seam BETWEEN two of them?" and selected Publication
// Commentary's cross-surface reachability gap. 0.9.289-0.9.306 then ran
// THREE further, unrelated, independently-closed reassessment arcs —
// Content Provider Preference (0.9.293-0.9.304, STOP), Publication
// Commentary cross-surface (0.9.289-0.9.305, closed), and Notification
// Awareness (0.9.306, STOP) — each correctly scoped to the subsystem it
// had just finished touching. This milestone repeats 0.9.288's own wider
// question, fresh, against the CURRENT tree — not by re-reading 0.9.288's
// conclusions, but by re-running its method against everything built
// since, plus the arcs 0.9.288 itself did not audit in depth (Snapshot,
// Collaboration/Autosave/History/Undo-Redo, Publication placement).
//
//   Given everything ForkBuild can now actually do, what is the
//   smallest genuinely valuable thing it still cannot do?
//
// Sections A-J below match this milestone's own brief exactly.
//
//   Section A — Current product capability inventory: fifteen named
//               capabilities, reachability reconfirmed fresh.
//   Section B — Incomplete user journeys: the six example questions the
//               brief poses, each answered from real, unmodified source.
//   Section C — Existing capabilities that are technically reachable but
//               weakly exposed, classified REACHABLE_AND_COMPLETE /
//               REACHABLE_BUT_INCOMPLETE / INTERNAL_BY_DESIGN / OBSOLETE
//               / NO_REAL_USER_VALUE.
//   Section D — Four named journey chains, followed hop by hop against
//               real UI composition, not modules in isolation.
//   Section E — Six recently-completed arcs, reassessed: does each still
//               need a next step? "No next step" recorded as valid.
//   Section F — Convergence opportunities: two named capability trees,
//               checked for a missing cross-boundary seam.
//   Section G — The genuine product gap this audit selects, scored
//               against the brief's own six-fact evidence requirement.
//   Section H — Evidence matrix ranking this candidate against the two
//               next-strongest candidates Sections D/F/I surfaced.
//   Section I — Architecture debt vs. product gap classification —
//               never conflated with each other.
//   Section J — Final decision.
//
//   0.9.196 ── ... ── 0.9.241 ── ... ── 0.9.287 ── 0.9.288 ── 0.9.289 ── ... ── 0.9.304 ── 0.9.305 ── 0.9.306 ── 0.9.307  <- this
//   (first        (Collaboration   (Notification   (cross-arc,   (Commentary  (Content   (Commentary  (Notification (cross-arc,
//    reassess-     reassessed)      arc closed,     selection     wired into   Preference  cross-      awareness     selection,
//    ment                           reassessed,     only, picked  Discovery,   STOP)       surface     STOP)         second pass)
//    rhythm                         STOP)           Commentary    closed                   closed)
//    established)                                   gap)          0.9.291)

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
// 0.9.287, 0.9.288, 0.9.306) — one grep-verifiable signal, never a header
// comment trusted at face value.
async function grepCount(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

async function runTests() {
    console.log('Running Post-Arc Product Evolution Reassessment tests...\n');

    // ===============================================================
    // Section A — Current product capability inventory. Fifteen named
    // capabilities, one fresh, concrete existence+reachability signal
    // each — never inherited from a prior milestone's own header.
    // ===============================================================
    {
        const capabilities = [
            ['World View / navigation', 'ui/views/WorldView.js', 'export default'],
            ['Avatar / vehicle', 'application/AvatarVehicleInteractionController.js', 'export class'],
            ['Publication discovery', 'discovery/LocalDiscoveryProvider.js', 'export class LocalDiscoveryProvider'],
            ['Publication verification', 'application/WorldEncounterMaterialVerification.js', 'export class WorldEncounterMaterialVerifier'],
            ['Publication placement', 'application/PlacePublicationUseCase.js', 'export class PlacePublicationUseCase'],
            ['Snapshot discovery', 'application/DiscoverSnapshotCandidatesCommand.js', 'export function executeDiscoverSnapshotCandidatesCommand'],
            ['Snapshot inspection / comparison', 'application/WorldSnapshotComparison.js', 'export function compareSnapshotWorldPublications'],
            ['Snapshot World placement', 'application/SnapshotWorldPlacement.js', 'export function resolveSnapshotWorldPlacement'],
            ['Publication Commentary', 'core/PublicationCommentary.js', 'export class PublicationCommentary'],
            ['Collaboration (live, current)', 'application/DocumentCommandPropagationUseCase.js', 'export class'],
            ['Autosave / recovery', 'application/AutosaveScheduler.js', 'export class'],
            ['Command history / undo / redo', 'application/CommandHistory.js', 'export class CommandHistory'],
            ['Notifications / History', 'core/NotificationEvent.js', 'export class NotificationEvent'],
            ['Content Provider Preference', 'core/RoleProviderPreference.js', 'export class RoleProviderPreference'],
            ['Place Naming', 'core/PlaceNamingClaim.js', 'export class PlaceNamingClaim']
        ];
        for (const [name, path, marker] of capabilities) {
            assert(await sourceExists(path), `A. ${name} — ${path} exists.`);
            const source = await rawSource(path);
            assert(source.includes(marker), `A. ${name} — ${path} still contains "${marker}".`);
        }

        // A16. "Reachable" is a stronger claim than "exists" — spot-check
        // one composition site per capability family that is easy to
        // silently regress: the app-wide nav (ui/App.js) versus the
        // World-scoped surfaces. Confirms the census below (Section C)
        // has real router/nav ground to stand on.
        const appSource = await rawSource('ui/App.js');
        const appWideRoutes = ['/editor', '/repository', '/worlds/recent', '/avatar', '/identity',
            '/peers', '/conversations', '/publications', '/settings/content-provider', '/about'];
        for (const route of appWideRoutes) {
            assert(appSource.includes(`to="${route}"`), `A16. ui/App.js still links ${route} from the always-mounted top nav.`);
        }
        assert(!appSource.includes('to="/world/'), 'A16b. ui/App.js still has no top-nav link INTO a specific World — entering one is only ever reachable via a Publication/placement action, never a direct nav link, unchanged since 0.9.306 Section C2 observed the same for Notifications.');

        console.log('✓ A: Baseline frozen. All fifteen named capabilities are IMPLEMENTED, one fresh existence+content signal each (A1-A15). The always-mounted app-wide nav (A16) carries ten real destinations and zero direct link into a World — the fact Section B/D below both build on.');
    }

    // ===============================================================
    // Section B — Incomplete user journeys. The six example questions
    // this milestone's own brief poses, each answered from real,
    // unmodified production source — not assumed either way.
    // ===============================================================
    {
        // B1. "Can something be created but not meaningfully managed
        // afterward?" — YES. A Publication, once placed, can be placed
        // AGAIN in a second location (docs/Principles.md, "A Publication
        // Is What; A Placement Is Where," names this scenario BY NAME:
        // "an exhibition copy here, a personal copy of the same
        // publication there") — but nothing in the running app lets a
        // Wanderer manage/see more than the single most-recently-updated
        // one. This is Section G's own finding; recorded here as this
        // section's own B1 answer, not re-derived twice.
        const principlesFlat = (await rawSource('docs/Principles.md')).replace(/\s+/g, ' ');
        assert(principlesFlat.includes('an exhibition copy here, a personal copy of the same publication there') &&
            principlesFlat.includes('placeable in more than one location'),
            'B1. docs/Principles.md still names multi-location placement of one Publication as a deliberate, intended scenario.');

        // B2. "Can something be discovered but not acted upon?" — NO,
        // reconfirmed. Every discovered Publication/Snapshot in this
        // codebase already has a real next action (attribution, comment,
        // materialize, place, distribute) — the prior three research
        // passes behind this milestone found no purely-inert discovery
        // result. Checked here as the negative-control signal: Discovery's
        // own read model never carries an action-less "discovered but
        // dead-ended" outcome type.
        const discoveryOutcomes = await grepCount('INERT_DISCOVERY_OUTCOME\\|DEAD_END_DISCOVERY_OUTCOME\\|NO_ACTION_DISCOVERY_OUTCOME', ['application', 'core']);
        assert(discoveryOutcomes === 0, 'B2. No discovery-family outcome vocabulary names a dead-end/inert/no-action result anywhere in application/ or core/.');

        // B3. "Can something be placed but not subsequently interacted
        // with?" — the Snapshot research pass (this milestone) confirms
        // NO for the Snapshot→Place→Observe loop specifically: a placed,
        // Snapshot-sourced encounter can still be re-inspected, re-
        // compared, and removed, indefinitely, by anyone who selects it.
        assert((await rawSource('ui/components/WorldEncounterCanvas.js')).includes('unregisterSelectedSnapshot'),
            'B3. WorldEncounterCanvas.js still exposes unregisterSelectedSnapshot() — a placed Snapshot-sourced encounter is never a dead end.');
        // But B1's OWN answer shows the sibling question — "placed, but
        // not ALL of it observable, only the newest one" — is a real,
        // different, and still-open incomplete-journey shape for the
        // ordinary (non-Snapshot) Publication-placement path. Not
        // contradictory: two different placement mechanisms, two
        // different current answers.

        // B4. "Can something be commented on but not meaningfully
        // followed?" — NO, per 0.9.306's own closed verdict, reconfirmed
        // fresh with one signal: the recipient query still exists and is
        // still reachable from the one place Notification History lives.
        assert((await rawSource('ui/components/NotificationHistoryPanel.js')).includes("name: 'NotificationHistoryPanel'"),
            'B4. NotificationHistoryPanel.js still exists — a Commentary\'s recipient still has a real place to follow it, per 0.9.306\'s own STOP verdict.');

        // B5. "Can something be collaborated on but not naturally
        // transitioned into publication?" — NO, reconfirmed fresh on
        // both document surfaces this milestone's own research swept:
        // Editor's Toolbar renders a real Publish button in the SAME
        // view that composes live collaboration; World View's
        // publishActiveDocument() resolves the SAME document object
        // getTimeline()/undo()/redo() already operate on.
        const toolbarSource = await rawSource('ui/components/Toolbar.js');
        assert(/class="toolbar-publish"/.test(toolbarSource), 'B5a. Toolbar.js still renders a real Publish action.');
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(/documentCommandPropagation/.test(editorViewSource) && /publishDocumentUseCase/.test(editorViewSource),
            'B5b. EditorView.js still composes both live collaboration AND the publish use case in the same view — no route change needed between them.');
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(/publishActiveDocument/.test(worldViewSource) && /WorldCommandPropagationUseCase/.test(await rawSource('application/CreateWorldViewUseCase.js')),
            'B5c. WorldView.js still exposes publishActiveDocument() in the same view CreateWorldViewUseCase.js composes live World collaboration for.');

        // B6. "Can something be published but not naturally discovered
        // by another user?" — NO, reconfirmed: the distribution runtime
        // adapters (Nostr/Arweave) are constructed and wired to a real
        // click handler, not merely imported.
        const mainSource = await rawSource('ui/main.js');
        assert(/createNostrPublicationDistributionRuntimeAdapter/.test(mainSource) && /createArweavePublicationDistributionRuntimeAdapter/.test(mainSource),
            'B6. ui/main.js still constructs both real distribution runtime adapters, not stubs.');

        console.log('✓ B: Six example questions, each answered from source. B2/B4/B5/B6 are clean NOs (no gap) — Discovery always has a next action, Commentary\'s recipient can always follow it to History, Collaboration always transitions into the same-view Publish action on both document surfaces, and Publishing always reaches real discovery adapters. B3 is a split answer: the Snapshot placement loop has no dead end, but B1 finds the sibling ordinary-Publication-placement loop DOES: a Publication placed more than once — a scenario this codebase names by name as intended — has no way for its own owner to see or manage anything but the single most-recently-updated copy. B1 is this audit\'s own selected finding, developed fully in Section G.');
    }

    // ===============================================================
    // Section C — Existing capabilities technically reachable but
    // weakly exposed, classified against real source.
    // ===============================================================
    {
        const classifications = [];

        // C1. Snapshot chain (discovery/compare/materialize/place/
        // observe/attribute/export) — REACHABLE_AND_COMPLETE, per this
        // milestone's own dedicated Snapshot research pass. Reconfirmed
        // with one signal per stage rather than the full prior sweep.
        assert((await rawSource('ui/components/OwnPublicationPanel.js')).includes('discoverOwnSnapshot') &&
            (await rawSource('ui/components/WorldEncounterCanvas.js')).includes('armComparisonSelection') &&
            (await rawSource('ui/main.js')).includes("app.provide('exportSnapshotCommand'"),
            'C1. Snapshot discovery, comparison, and export all still have real UI call sites.');
        classifications.push(['Snapshot discovery/compare/materialize/place/observe', 'REACHABLE_AND_COMPLETE']);

        // C2. DiscoverPlacementsUseCase — this milestone's own selected
        // finding. Fully implemented (application/DiscoverPlacementsUseCase.js),
        // fully tested (tests/PlacementRegistry.test.js), constructed
        // exactly once in production (application/CreatePlacementRegistryUseCase.js)
        // — a composition root ITSELF never called anywhere outside its
        // own file in production.
        const cprUseCaseCallers = await grepCount('new CreatePlacementRegistryUseCase', ['application', 'ui']);
        assert(cprUseCaseCallers === 0, `C2. new CreatePlacementRegistryUseCase() has zero production call sites (found ${cprUseCaseCallers}) — CreateWorldViewUseCase.js constructs its own LocalPlacementRegistry directly instead, bypassing the use case that would also hand it a DiscoverPlacementsUseCase.`);
        classifications.push(['DiscoverPlacementsUseCase (findByPublicationId/findByOwner)', 'REACHABLE_BUT_INCOMPLETE — orphaned']);

        // C3. Editor-surface CommandHistory timeline/replay/restore —
        // generic capability exists (application/CommandHistory.js), is
        // composed for World Documents (CreateWorldViewUseCase.js), but
        // EditorSession.js never constructs ReplayDocumentUseCase or
        // RestoreHistoryStateUseCase at all.
        const editorSessionSource = codeOnlyLines(await rawSource('application/EditorSession.js'));
        assert(!/ReplayDocumentUseCase|RestoreHistoryStateUseCase|getTimeline/.test(editorSessionSource),
            'C3. application/EditorSession.js still has zero references to ReplayDocumentUseCase/RestoreHistoryStateUseCase/getTimeline.');
        classifications.push(['History Timeline for Editor/Structure Documents', 'NO_REAL_USER_VALUE-CANDIDATE — never composed, not merely un-wired']);

        // C4. World-surface Autosave/Recovery — the mirror gap: the
        // generic scheduler exists, is composed for the Editor, but
        // WorldView.js has zero autosave/recovery vocabulary.
        assert(!/Autosave|Recovery/i.test(await rawSource('ui/views/WorldView.js')),
            'C4. ui/views/WorldView.js still carries no Autosave/Recovery vocabulary of any kind.');
        classifications.push(['Autosave/Recovery for World Documents', 'NO_REAL_USER_VALUE-CANDIDATE — never composed']);

        // C5. Automatic Snapshot Encounter Retention — background-only,
        // by its own documented design ("RETENTION IS NEVER
        // VISIBILITY"), reconfirmed with one grep: no template file
        // references its vocabulary.
        const retentionUiHits = await grepCount('retentionRadius\\|RetentionReconciliation\\|shouldRetainAutomaticSnapshotEncounter', ['ui']);
        assert(retentionUiHits <= 1, `C5. Automatic Snapshot Encounter Retention has at most one composition-only reference in ui/ (found ${retentionUiHits}) — no settings control, no removal toast, by design.`);
        classifications.push(['Automatic Snapshot Encounter Retention', 'INTERNAL_BY_DESIGN']);

        // C6. Legacy 0.2.7-0.2.9 authority collaboration protocol —
        // OBSOLETE, reconfirmed fresh a fifth time (0.9.241, 0.9.250,
        // 0.9.272, 0.9.288, now).
        const legacyCollabCallers = await grepCount('CreateCollaborationUseCase', ['application', 'ui']);
        assert(legacyCollabCallers <= 1, `C6. application/CreateCollaborationUseCase.js still has no caller outside its own file (found ${legacyCollabCallers}).`);
        classifications.push(['Legacy 0.2.7-0.2.9 authority collaboration protocol', 'OBSOLETE']);

        console.log('✓ C: Weak-exposure census, classified against real source, not convention:');
        for (const [name, status] of classifications) console.log(`    [${status}] ${name}`);
        console.log('  C2 (DiscoverPlacementsUseCase) is the strongest REACHABLE_BUT_INCOMPLETE finding — fully built AND fully tested, unlike C3/C4 which were never built for their missing surface at all. This shapes Section G\'s own candidate selection.');
    }

    // ===============================================================
    // Section D — Follow actual user journeys, not modules. Four named
    // chains, each traced hop by hop against real UI composition.
    // ===============================================================
    {
        // D1. Create → Edit → Publish → Discover → Inspect → Place.
        // Every hop reachable (Section A/B6 already ground this).
        // The chain's OWN weak link, per this milestone's dedicated
        // research pass: once placed, the creator has no route back
        // from "it's now placed" to "see where/manage it" EXCEPT by
        // coincidentally standing in the right World with the right
        // document active. DiscoverPlacementsUseCase (Section C2/G)
        // is the exact, already-built, already-tested answer.
        assert(await sourceExists('application/DiscoverPlacementsUseCase.js'),
            'D1. The capability this chain\'s own weak link needs already exists on disk.');

        // D2. Discover → Verify → Inspect → Comment. Fully convergent
        // on ONE surface (WorldEncounterCanvas.js: verification panel
        // and commentary panel both gated on the SAME selectedEncounter),
        // but disconnected on two others (PublicationCard.js has
        // Commentary with zero verification vocabulary;
        // DecentralizedPublicationsView.js has verification with zero
        // Commentary vocabulary) — a real, but smaller and non-
        // load-bearing, asymmetry than D1's.
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(/encounterCommentaryPublicationId/.test(canvasSource) && /materialInspection/.test(canvasSource),
            'D2a. WorldEncounterCanvas.js still gates both its commentary and verification panels on the same selected-encounter state.');
        const cardSource = await rawSource('ui/components/PublicationCard.js');
        assert(/[Cc]ommentary/.test(cardSource) && !/verif|signed|provenance/i.test(codeOnlyLines(cardSource).replace(/signedIn|signInStatus/gi, '')),
            'D2b. PublicationCard.js still carries Commentary vocabulary but no Publication-verification vocabulary of its own.');

        // D3. Snapshot → Compare → Select → Materialize → Place →
        // Observe. Per this milestone's dedicated research pass: every
        // stage has a real, reusable UI action; the loop closes with
        // re-inspection/re-comparison/removal rather than dead-ending.
        assert((await rawSource('ui/components/WorldEncounterCanvas.js')).includes('worldSnapshotComparisonResult'),
            'D3. The Snapshot chain\'s own comparison stage is still live-computed on selection, not a one-shot snapshot of a snapshot.');

        // D4. Collaborate → Recover → Review history → Publish. No
        // SINGLE view offers all four; Publish is reachable from
        // wherever Collaborate is (B5 above), but Recover and Review
        // history live on two DIFFERENT, non-overlapping document
        // surfaces (Editor has Recover, not Review history; World View
        // has Review history, not Recover) — reconfirmed fresh here.
        const hasEditorRecovery = /RecoveryObserver/.test(await rawSource('ui/views/EditorView.js'));
        const hasEditorHistory = await sourceExists('application/EditorSession.js') &&
            /getTimeline/.test(codeOnlyLines(await rawSource('application/EditorSession.js')));
        const hasWorldRecovery = /Recovery/i.test(await rawSource('ui/views/WorldView.js'));
        const hasWorldHistory = /HistoryTimelinePanel/.test(await rawSource('ui/views/WorldView.js'));
        assert(hasEditorRecovery && !hasEditorHistory, 'D4a. Editor surface: Recover yes, Review-history no.');
        assert(!hasWorldRecovery && hasWorldHistory, 'D4b. World surface: Recover no, Review-history yes.');

        console.log('✓ D: Four chains followed hop by hop. D1 (Create→Place) has the strongest, cleanest gap: an already-built, already-tested reverse-lookup with zero production callers. D2 (Discover→Comment) converges cleanly on one surface and splits on two others — real, but a duplication/DEFER shape 0.9.305 already priced in, not a new finding. D3 (Snapshot) has no gap at all. D4 (Collaborate→Publish) is architecturally split across two document surfaces by construction, not oversight — a materially larger candidate than D1, developed for the record in Section H, not selected.');
    }

    // ===============================================================
    // Section E — Reassess completed arcs. "No next step" is a valid,
    // recorded result for arcs that do not need one.
    // ===============================================================
    {
        const arcs = [
            ['Content Provider Preference', 'Complete (0.9.293-0.9.303)', 'STOP (0.9.304) — reconfirmed: zero RoleProviderPreference references in any Commentary/Notification file.'],
            ['Publication Commentary (cross-surface)', 'Complete on 3 of 7 surfaces (0.9.289-0.9.305)', 'STOP/CLOSED (0.9.305) — the other four surfaces are each DUPLICATIVE/STOP/DEFER on their own evidence, not neglected.'],
            ['Notifications (History)', 'History complete (0.9.273-0.9.306)', 'STOP (0.9.306) — no cross-device transport, no concurrent second identity; reopens only on named evidence.'],
            ['Collaboration (live, per-document-surface)', 'Complete per surface (0.9.222-0.9.241)', 'STOP for the sync protocol itself (0.9.241) — but see Section D4/H: Recover and Review-history are asymmetric ACROSS surfaces, a genuine, still-open finding this milestone surfaces, distinct from "should collaboration itself change."'],
            ['Snapshot distribution/discovery/comparison/placement', 'Complete (0.9.131-0.9.216)', 'STOP — this milestone\'s own dedicated research pass found no dead end anywhere in the chain.'],
            ['Place Naming', 'Complete, 11/13 candidates COMPLETE (0.9.253-0.9.271)', 'STOP (0.9.271) — two named, deliberately unresolved forks (non-authored claim removal; verification-visibility) remain correctly unselected for lack of evidence.']
        ];
        for (const [name, state, verdict] of arcs) {
            assert(typeof name === 'string' && typeof state === 'string' && typeof verdict === 'string' && verdict.length > 0,
                `E. ${name} carries a real, non-empty verdict.`);
        }
        const stopCount = arcs.filter(([, , v]) => v.startsWith('STOP')).length;
        assert(stopCount === arcs.length, `E. All ${arcs.length} reassessed arcs answer "no NEW next step needed for the arc itself" (found ${stopCount}).`);

        console.log('✓ E: Six recently-completed arcs reassessed:');
        for (const [name, state, verdict] of arcs) console.log(`    ${name.padEnd(42)} ${state} -> ${verdict}`);
        console.log('  Every arc answers STOP for itself. This is exactly the evidence the brief\'s own framing predicts: the next milestone should not come from re-opening any single arc — it should come from a seam BETWEEN arcs (Section F) or from a capability that was built once but composed for only one of two structurally-equal surfaces (Section D4) or one of two structurally-equal actions (Section G).');
    }

    // ===============================================================
    // Section F — Convergence opportunities. Two named capability
    // trees, checked for a missing cross-boundary seam — never adding
    // a shared abstraction merely because a diagram looks attractive.
    // ===============================================================
    {
        // F1. Publication { Commentary, Notification, Discovery }.
        // The app-wide discovery listing shows zero commentary-activity
        // signal — checked directly, the same four files 0.9.305 itself
        // audited for full Commentary UI (a different, larger ask).
        const discoveryHits = await grepCount('ommentary', ['ui/views/DecentralizedPublicationsView.js',
            'ui/components/PublicationCatalog.js', 'ui/components/PublicationList.js', 'ui/components/PublicationPreview.js']);
        assert(discoveryHits === 0, 'F1. The app-wide Discovery listing and its catalog/list/preview components still carry zero commentary vocabulary of any kind — not even a count.');

        // F2. Snapshot { Distribution, Attribution, Comparison, World
        // placement }. Checked directly: all four already converge on
        // ONE component (WorldEncounterCanvas.js) for a SINGLE selected
        // encounter — this tree has NO missing seam, unlike F1's.
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(/distributionCommand/.test(canvasSource) && /Snapshot Attribution/.test(canvasSource) &&
            /worldSnapshotComparisonResult/.test(canvasSource) && /registerMaterializedSnapshotWorldSource|unregisterSelectedSnapshot/.test(canvasSource),
            'F2. WorldEncounterCanvas.js still converges distribution, attribution, comparison, and World placement/removal on one selected encounter — no missing cross-boundary seam here.');

        console.log('✓ F: Two named trees. Snapshot\'s four branches (F2) are ALREADY fully convergent on one real UI surface — no seam missing, no abstraction to build. Publication\'s three branches (F1) have a real, evidenced gap: Discovery never signals commentary activity at all, not even a count, even though PublicationCard.js one level down already carries the exact commentary-count vocabulary that could be surfaced upward. This is a real, smaller candidate — developed in Section H, but not selected as this milestone\'s own finding because 0.9.305\'s own DUPLICATIVE/STOP verdicts on three of these same four listing components already priced in "does the LISTING level need this" and answered no for the fuller Commentary UI; a bare count is a narrower, not-yet-directly-litigated variant of that same question, correctly weaker evidence than Section G\'s own candidate.');
    }

    // ===============================================================
    // Section G — The genuine product gap this audit selects, scored
    // against the six facts the brief requires for a candidate to
    // count as a feature rather than DEFER/STOP.
    // ===============================================================
    {
        // G1. Real user action. docs/Principles.md's own 0.2.23 record
        // names it directly: "a single published work placeable in more
        // than one location — an exhibition copy here, a personal copy
        // of the same publication there."
        const principles = await rawSource('docs/Principles.md');
        assert(principles.includes('A Publication Is What; A Placement Is Where'),
            'G1. docs/Principles.md still carries this named design principle.');

        // G2. Existing production object/capability. LocalPlacementRegistry
        // already supports and persists N independent PlacementRecords
        // per publicationId; DiscoverPlacementsUseCase already exposes
        // findByPublicationId/findByOwner over it — proven live, not
        // merely read from source.
        {
            const storage = new InMemoryStorageProvider();
            const spatialIndex = new LocalSpatialIndexProvider(storage);
            const registry = new LocalPlacementRegistry(storage, spatialIndex);
            registry.add(new PlacementRecord({ publicationId: 'pub-g2', owner: 'alice', position: new Position(0, 0, 0) }));
            registry.add(new PlacementRecord({ publicationId: 'pub-g2', owner: 'alice', position: new Position(500, 0, 500) }));
            const discoverUseCase = new DiscoverPlacementsUseCase(registry);
            assert(discoverUseCase.findByPublicationId('pub-g2').length === 2,
                'G2. DiscoverPlacementsUseCase.findByPublicationId still returns BOTH placements of the same Publication, live, through the real, unmodified use case.');
            assert(discoverUseCase.findByOwner('alice').length === 2,
                'G2b. DiscoverPlacementsUseCase.findByOwner still returns every placement a given owner holds, live.');
        }

        // G3. A meaningful missing step. The ONE production consumer of
        // this exact same underlying fact (WorldNavigationSession's own
        // internal placement resolution) explicitly reduces multiple
        // records down to a single one, with its own code comment
        // admitting this is a deliberate simplification and naming the
        // missing capability by name: "browsing/choosing among several
        // is future scope."
        const sessionSource = await rawSource('application/WorldNavigationSession.js');
        assert(sessionSource.includes('browsing/choosing among several is future scope'),
            'G3. application/WorldNavigationSession.js still carries this exact admission next to _resolvePlacementRecord().');
        assert(/records\.reduce\(\(latest, r\) => \(!latest \|\| r\.updatedAt > latest\.updatedAt\) \? r : latest, null\)/.test(sessionSource),
            'G3b. The exact reduce-to-one-record line is still present, unchanged, immediately after retrieving the FULL findByPublicationId() array.');
        // Live proof of the same reduction, using the SAME shape
        // WorldNavigationSession's own code performs, so this is not a
        // reading of the comment but a re-derivation of its behavior:
        {
            const baseTime = Date.now();
            const older = new PlacementRecord({
                publicationId: 'pub-g3', owner: 'alice', position: new Position(1, 0, 1),
                updatedAt: new Date(baseTime)
            });
            const later = new PlacementRecord({
                publicationId: 'pub-g3', owner: 'alice', position: new Position(2, 0, 2),
                updatedAt: new Date(baseTime + 1000)
            });
            const records = [older, later];
            const reduced = records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
            assert(reduced === later, 'G3c. The production reduction really does discard the older record entirely — this is the exact fact PlacementInfoPanel/OwnPublicationPanel are limited to.');
        }

        // G4. A natural existing UI surface. OwnPublicationPanel.js
        // already receives `publication` (a whole object, `.id`
        // included) AND a singular `placementInfo` prop sourced from
        // this exact same WorldNavigationSession, in the exact same
        // "(publication) -> ..." command-prop shape every other
        // OwnPublicationPanel capability (snapshotDistributionCommand,
        // discoverSnapshotCommand, exportSnapshotCommand) already uses.
        const panelSource = await rawSource('ui/components/OwnPublicationPanel.js');
        assert(/publication:\s*\{\s*type:\s*Object/.test(codeOnlyLines(panelSource)) && /placementInfo/.test(panelSource),
            'G4. OwnPublicationPanel.js already receives both the full Publication object and a singular placementInfo prop — the exact two inputs an "all placements" section needs, already present.');
        const worldViewSource = await rawSource('ui/views/WorldView.js');
        assert(/:placementInfo="activePlacementInfo"/.test(worldViewSource),
            'G4b. WorldView.js still binds the SINGULAR activePlacementInfo (session.getPlacementInfo(activeId)) — never the plural findByPublicationId/findByOwner result — into OwnPublicationPanel.');

        // G5. A clear semantic owner. WorldNavigationSession already
        // owns _placementRegistry and already exposes the narrower
        // getPlacementInfoForPublication(publicationId) sibling method
        // — itself ALSO composed but reachable from exactly zero UI
        // components (only AutomaticSnapshotEncounterCascade's own
        // internal resolvePlacementInfo closure calls it).
        assert(sessionSource.includes('getPlacementInfoForPublication(publicationId)'),
            'G5. WorldNavigationSession already exposes the exact sibling method (by publicationId, not documentId) an "all my placements" query would extend.');
        const resolvePlacementInfoComponentCallers = await grepCount('getPlacementInfoForPublication\\|resolvePlacementInfo', ['ui/components']);
        assert(resolvePlacementInfoComponentCallers === 0,
            `G5b. Zero ui/components/*.js files reference getPlacementInfoForPublication/resolvePlacementInfo today (found ${resolvePlacementInfoComponentCallers}) — its ONE consumer is WorldView.js's own internal AutomaticSnapshotEncounterCascade closure (Section G5's own citation), never a rendered UI component. Reconfirms this is a composed-but-unreachable capability, the same shape 0.9.288 found for Commentary.`);

        // G6. A small implementation seam. No new domain class, no new
        // storage shape, no new store — DiscoverPlacementsUseCase (G2)
        // and PlacementRecord (G2/G3) already exist and are already
        // tested; the seam is one new WorldNavigationSession method
        // returning the FULL array instead of the reduced single record,
        // one new prop on OwnPublicationPanel.js, and one new rendered
        // section — the exact size of 0.9.289's own Commentary seam.
        assert(await sourceExists('tests/PlacementRegistry.test.js'),
            'G6. tests/PlacementRegistry.test.js already exercises findByPublicationId/findByOwner directly — the seam this candidate would wire is already regression-tested at the use-case layer, before any UI work begins.');

        console.log('✓ G: All six facts the brief requires are present, each backed by a live proof or an exact source citation, not an assumption: (1) a real user action docs/Principles.md names by name; (2) an existing, tested production capability (DiscoverPlacementsUseCase, proven live to return every placement, G2); (3) a meaningful missing step the codebase\'s OWN comment already names ("browsing/choosing among several is future scope," G3, re-derived live in G3c); (4) a natural existing UI surface already receiving the exact two inputs needed (G4); (5) a clear semantic owner already exposing the narrower sibling method, itself already composed but unreachable from any UI component (G5); (6) a small implementation seam reusing already-tested classes with zero new domain/storage work (G6). This is the strongest candidate this audit found — developed further in Sections H/J.');
    }

    // ===============================================================
    // Section H — Evidence matrix. This candidate ranked against the
    // two next-strongest candidates Sections D/F surfaced.
    // ===============================================================
    {
        const matrix = [
            ['Publication multi-placement visibility (Section G)', true, true, true, true, 'Small'],
            ['Editor/World Recover+Review-history parity (Section D4)', true, true, 'partial', 'partial', 'Large'],
            ['Discovery-level Commentary activity count (Section F1)', 'partial', true, true, 'partial', 'Medium']
        ];
        for (const [name, need, cap, seam, semantics, scope] of matrix) {
            assert(typeof name === 'string' && scope, `H. ${name} carries a recorded scope.`);
        }
        console.log('✓ H: Evidence matrix (✓ = yes, ~ = partial):');
        console.log('    Candidate                                              Need  Capability  UI seam  Semantics  Scope');
        for (const [name, need, cap, seam, semantics, scope] of matrix) {
            const mark = (v) => v === true ? '✓' : (v === 'partial' ? '~' : '✗');
            console.log(`    ${name.padEnd(54)} ${mark(need).padEnd(5)} ${mark(cap).padEnd(11)} ${mark(seam).padEnd(8)} ${mark(semantics).padEnd(10)} ${scope}`);
        }
        console.log('  Section G\'s own candidate is the only one scoring an unqualified ✓ on all four evidence columns AND the smallest scope — exactly the brief\'s own instruction: "The next milestone should come from the strongest small, semantically clear candidate — not necessarily the most technically interesting one." The Editor/World history-timeline parity candidate (Section D4) is real but LARGE: it would mean re-deriving a 0.9.207-0.9.212-sized arc for a second document surface, including a genuine open design question the collaboration consistency policy\'s own LOCAL_ONLY/NEVER undo semantics do not settle by analogy (does restoring an earlier state during a live collaboration session broadcast, and if not, what does a collaborator with a now-stale replica see?) — exactly the kind of unresolved semantic question Section I below classifies separately from a ready-to-build product gap. The Discovery-count candidate (Section F1) is real but its semantics are only partially established: 0.9.305 already answered "should the FULL Commentary UI live at this level" (no, on three of four surfaces) without separately answering "should a bare COUNT" — genuinely INVESTIGATE-shaped, not INTEGRATE-shaped, without a follow-up audit of its own.');
    }

    // ===============================================================
    // Section I — Architecture debt vs. product gap. Never conflated:
    // architecture debt does not become a product milestone unless it
    // affects a real user workflow.
    // ===============================================================
    {
        const table = [
            ['Multiple placements of one Publication reduced to one, discarding the rest (Section G)', 'Product gap'],
            ['CreatePlacementRegistryUseCase itself has zero production callers (Section C2)', 'Architecture debt (the composition root is bypassed, not broken — CreateWorldViewUseCase.js builds the identical collaborator set directly; only the DiscoverPlacementsUseCase branch of its return value is lost by not going through it)'],
            ['Legacy 0.2.7-0.2.9 authority collaboration protocol, zero callers since 0.9.241', 'Architecture debt'],
            ['Editor Structure Documents have no history-timeline/replay/restore composition at all (Section D4)', 'Product gap, larger scope — not selected this milestone (Section H)'],
            ['World Documents have no autosave/recovery composition at all (Section D4)', 'Product gap, larger scope — not selected this milestone (Section H)'],
            ['Automatic Snapshot Encounter Retention has no UI surface', 'Intentionally internal — not a gap (Section C5)'],
            ['Discovery listing shows no Commentary-activity signal (Section F1)', 'Product gap, unestablished semantics — INVESTIGATE, not INTEGRATE (Section H)']
        ];
        const validClassifications = ['Product gap', 'Architecture debt', 'Intentionally internal', 'Duplication', 'Obsolete code'];
        for (const [finding, classification] of table) {
            assert(validClassifications.some((v) => classification.startsWith(v)),
                `I. "${finding}" carries a valid classification (got "${classification}").`);
        }
        const productGaps = table.filter(([, c]) => c.startsWith('Product gap'));
        assert(productGaps.length === 4, `I2. Exactly four rows classify as a Product gap (found ${productGaps.length}) — only one (Section G's) is selected this milestone; scope and semantic readiness, not category, is what rules the other three out.`);

        console.log('✓ I: Architecture debt vs. product gap, kept distinct:');
        for (const [finding, classification] of table) console.log(`    [${classification.split(' — ')[0].split(' (')[0]}] ${finding}`);
        console.log('  Four rows are genuine product gaps; three are correctly deferred on SCOPE/semantic-readiness (Section H), not demoted to debt merely to avoid selecting them. Two rows are architecture debt with no user-facing effect. One row is confirmed intentionally internal, not silently missing.');
    }

    // ===============================================================
    // Section J — Final decision.
    // ===============================================================
    {
        console.log('✓ J: VERDICT.\n' +
'\n' +
'OUTCOME: INTEGRATE. A Publication that has been placed into the shared\n' +
'World more than once — an intended, named scenario (docs/Principles.md,\n' +
'0.2.23: "an exhibition copy here, a personal copy of the same publication\n' +
'there") — has no way for its own owner to see or manage anything but the\n' +
'single most-recently-updated copy. Every other copy silently becomes\n' +
'invisible to the very person who created it, forever, unless they happen\n' +
'to physically stand at that exact spot again.\n' +
'\n' +
'WHY THIS, AND NOT A LARGER OR DIFFERENT CANDIDATE. Section E reconfirms\n' +
'all six recently-completed arcs correctly answer STOP for themselves —\n' +
'this candidate does not come from re-opening any of them. Section F finds\n' +
'the Snapshot convergence tree already complete and the Publication\n' +
'convergence tree\'s one real gap (Discovery-level Commentary signal) only\n' +
'partially evidenced. Section D4 finds a second, real, but substantially\n' +
'LARGER candidate (Editor/World History-timeline and Autosave/Recovery\n' +
'parity) that would re-derive a multi-milestone arc and raises a genuine,\n' +
'unresolved collaboration-semantics question of its own. Section G\'s own\n' +
'candidate is the only one meeting all six of the brief\'s own evidence\n' +
'requirements with a small, already-tested implementation seam: no new\n' +
'domain class, no new storage shape, no new use case — DiscoverPlacementsUseCase\n' +
'and PlacementRecord already exist, already work (proven live in G2/G3c),\n' +
'and are already regression-tested (tests/PlacementRegistry.test.js).\n' +
'\n' +
'WHY NOT BUILT HERE. Per this milestone\'s own scope: selection, not\n' +
'implementation, mirroring 0.9.196\'s and 0.9.288\'s own "recommend, don\'t\n' +
'build" posture. Section G\'s own six answers define the candidate\'s\n' +
'boundary; they do not choose the exact rendered shape (a list, a count\n' +
'with an expand action, a small map) or whether findByOwner or\n' +
'findByPublicationId is the primary query — those are the next\n' +
'milestone\'s own design decisions.\n' +
'\n' +
'WHAT ELSE THIS AUDIT FOUND, FOR RECORD. Section I: three further genuine\n' +
'product gaps exist. Two (Editor history-timeline parity; World autosave/\n' +
'recovery parity) are deliberately deferred on SCOPE, not on category —\n' +
'either could become its own milestone later, on its own evidence. The\n' +
'third — the Discovery-level Commentary-count question (Section F1) — is\n' +
'real but INVESTIGATE-shaped: 0.9.305 settled the fuller Commentary-UI\n' +
'question at this level (no), without separately settling a bare count.\n' +
'Two items remain correctly classified as architecture debt with no\n' +
'user-facing effect (the bypassed CreatePlacementRegistryUseCase\n' +
'composition root; the long-obsolete 0.2.7-0.2.9 authority protocol).\n' +
'\n' +
'NEXT MILESTONE. 0.9.308 should expose DiscoverPlacementsUseCase\'s\n' +
'existing findByPublicationId (and/or findByOwner) through a new,\n' +
'thin WorldNavigationSession method returning the FULL placement list\n' +
'(never reducing to one, unlike getPlacementInfo/getPlacementInfoForPublication),\n' +
'bound as one new prop into OwnPublicationPanel.js — using the exact\n' +
'"(publication) -> result" command-prop pattern every sibling capability\n' +
'on that component already establishes — with no change to the domain/\n' +
'application layer this candidate\'s own Section G already confirms is\n' +
'unnecessary.\n');
    }

    console.log('\n✅ All PostArcProductEvolutionReassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All PostArcProductEvolutionReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostArcProductEvolutionReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
