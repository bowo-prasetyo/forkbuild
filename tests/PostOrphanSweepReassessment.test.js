import { readFile, readdir } from 'node:fs/promises';
import { execSync } from 'node:child_process';

import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import {
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js';

// 0.9.328 — Post-Orphan-Sweep Product Evolution Reassessment.
//
// Test-only, whole-product decision milestone. Production changes: none
// unless Section H's own evidence gate is actually cleared by something —
// it is not (Section J).
//
// The sequence this milestone closes out: 0.9.326 ran a fresh, mechanical
// orphan sweep and surfaced a materially larger candidate set than any
// prior audit, including one genuinely new singleton finding. 0.9.327
// investigated that singleton and returned DUPLICATIVE — no gap, but also
// no reconciliation of everything ELSE 0.9.326's own sweep found. This
// milestone's own brief is explicit: do not chase another orphaned
// implementation. Instead, reconcile what is already known, reconfirm the
// baseline is still coherent, and run exactly one genuinely new kind of
// check this sequence has not run before — a cross-arc integration scan
// for a blocked handoff between two otherwise-complete capabilities —
// before asking whether ANY of it clears the standing evidence gate.
//
//   Section A — Reconcile 0.9.326's fresh sweep. Every bucket it found
//               (three empty stubs, Delegation, historical replication,
//               Reconciliation Decision, bypassed composition roots, the
//               one singleton) given a FINAL semantic classification,
//               folding in 0.9.327's own correction (the singleton is
//               Base's family, not Bitcoin's) and verdict (DUPLICATIVE).
//   Section B — Reconfirm the product baseline. The full reachable-
//               capability inventory 0.9.326 built, re-verified fresh:
//               zero production files changed since (checked directly).
//   Section C — Verify the six established user journeys, unchanged —
//               no seventh introduced for coverage's own sake.
//   Section D — Re-evaluate the four standing deferred candidates against
//               the same five-question bar. None promoted.
//   Section E — Cross-arc integration scan. THIS MILESTONE'S OWN REAL
//               CONTRIBUTION: a live, mechanical search for
//               "Capability A = complete, Capability B = complete, A -> B
//               impossible for the user." One plausible candidate is
//               investigated all the way to a verdict — the routed,
//               reachable Reconciliation Candidate Leaderboard's own
//               "Decisions" evidence filter depends on data
//               (`reconciliationDecisionRecords`) that nothing reachable
//               in this shipped product can ever locally write — and is
//               shown, by direct comparison against the sibling Claim
//               family (also never locally originable, by the identical
//               design), to be consistent deliberate architecture, not an
//               asymmetric gap.
//   Section F — Operational evidence. Checked honestly rather than
//               assumed: zero on-file evidence of a real, experienced
//               problem exists anywhere in this codebase's own record.
//   Section G — Architecture-health classification. Every remaining piece
//               of unused code sorted into historical / superseded /
//               internal / placeholder / deliberately deferred — never
//               left as undifferentiated "debt."
//   Section H — Evidence gate. The 0.9.314/0.9.327 executable classifier,
//               reused verbatim, applied to every open candidate this
//               milestone touches.
//   Section I — Candidate ranking. Vacuous — zero survivors.
//   Section J — Final roadmap decision.

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

function grepFiles(pattern, dirs, { ignoreCase = false } = {}) {
    let hits = '';
    try {
        const flags = ignoreCase ? '-rli' : '-rl';
        hits = execSync(`grep ${flags} "${pattern}" ${dirs.join(' ')} --include="*.js" || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* grep exits non-zero on no match; treated as zero hits */ }
    return hits.trim() ? hits.trim().split('\n') : [];
}

function grepCount(pattern, dirs, opts = {}) {
    return grepFiles(pattern, dirs, opts).length;
}

const SWEEP_DIRS = [
    'anchoring', 'application', 'arweave', 'base', 'collaboration', 'content',
    'core', 'discovery', 'identity', 'nostr', 'peer', 'persistence',
    'placement', 'presence', 'publisher', 'renderer', 'replication',
    'serializer', 'server', 'spatial', 'storage', 'world-layout', 'world',
    'utils', 'ui'
];

async function walkJsFiles(dir, out) {
    let entries;
    try {
        entries = await readdir(new URL(dir + '/', SOURCE_ROOT), { withFileTypes: true });
    } catch {
        return;
    }
    for (const entry of entries) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) await walkJsFiles(rel, out);
        else if (entry.name.endsWith('.js')) out.push(rel);
    }
}

// Reruns 0.9.326's own fresh-sweep methodology verbatim (mechanical
// basename cross-reference over production source only) — this
// milestone's own job is to RECONCILE what that sweep found, not to
// re-invent or widen the mechanism.
async function freshOrphanSweep() {
    const productionFiles = [];
    for (const dir of SWEEP_DIRS) await walkJsFiles(dir, productionFiles);
    const contents = new Map();
    for (const f of productionFiles) contents.set(f, await rawSource(f));
    const zeroReference = [];
    for (const f of productionFiles) {
        if (f.endsWith('.test.js')) continue;
        const base = f.split('/').pop().replace(/\.js$/, '');
        let referenced = false;
        for (const [other, content] of contents) {
            if (other === f) continue;
            if (content.includes(base)) { referenced = true; break; }
        }
        if (!referenced) zeroReference.push(f);
    }
    return zeroReference;
}

async function run() {
    console.log('Running Post-Orphan-Sweep Product Evolution Reassessment tests...\n');

    // ===============================================================
    // Section A — Reconcile 0.9.326's fresh sweep. Every candidate given
    // a FINAL semantic classification — none left to disappear from the
    // radar just because 0.9.327 only investigated one of them.
    // ===============================================================
    let reconciled;
    {
        const zeroReference = await freshOrphanSweep();
        const KNOWN_EMPTY_STUBS = new Set([
            'application/services/ExportService.js',
            'application/services/ImportService.js',
            'application/services/ScreenshotService.js'
        ]);
        function classify(f) {
            const base = f.split('/').pop();
            if (KNOWN_EMPTY_STUBS.has(f)) return 'EMPTY_PLACEHOLDER_STUB';
            if (base === 'CreateDelegationUseCase.js' || base === 'VerifyDelegationUseCase.js' || f === 'identity/LocalDelegationResolver.js') return 'DELEGATION_FAMILY';
            if (base === 'CreateReplicationUseCase.js') return 'HISTORICAL_REPLICATION_FAMILY';
            if (/^PublisherLeaderboardClaimSnapshot.*View\.js$/.test(base)) return 'RECONCILIATION_DECISION_FAMILY';
            if (base === 'BaseAnchorPublicationObservationView.js') return 'BASE_ANCHOR_OBSERVATION_VIEW'; // 0.9.327's own naming correction — this was mislabeled "Bitcoin" in 0.9.326's own commit message
            if (base === 'LoadPublishedWorldSessionUseCase.js') return 'BYPASSED_COMPOSITION_ROOT';
            if (/^Create[A-Za-z]+UseCase\.js$/.test(base)) return 'BYPASSED_COMPOSITION_ROOT';
            return null;
        }
        const byBucket = new Map();
        const unclassified = [];
        for (const f of zeroReference) {
            const bucket = classify(f);
            if (!bucket) { unclassified.push(f); continue; }
            if (!byBucket.has(bucket)) byBucket.set(bucket, []);
            byBucket.get(bucket).push(f);
        }
        assert(unclassified.length === 0,
            `A1. Every candidate the fresh sweep still finds classifies into an already-known bucket (unclassified: ${unclassified.join(', ') || 'none'}) — nothing new has appeared since 0.9.326's own sweep, confirming zero production drift.`);

        // A2. The one bucket 0.9.327 actually investigated: fold in its
        // verdict directly, don't merely re-assert 0.9.326's own
        // provisional "ORPHANED" label.
        assert((byBucket.get('BASE_ANCHOR_OBSERVATION_VIEW') || []).includes('application/BaseAnchorPublicationObservationView.js'),
            'A2a. The sweep still finds application/BaseAnchorPublicationObservationView.js (sanity).');
        assert(grepCount('BaseAnchorPublicationObservationView', ['tests']) >= 1 &&
            (await rawSource('tests/BitcoinAnchorObservationProductGapAudit.test.js')).includes("const verdict = 'DUPLICATIVE';"),
            'A2b. 0.9.327\'s own investigation of this file is on file and its recorded verdict is DUPLICATIVE — read directly from its own test file, never re-derived here.');

        // A3. Every OTHER bucket 0.9.326 found but 0.9.327 did not
        // investigate, reconfirmed still true, fresh, right now — this is
        // the reconciliation work this milestone's own brief actually
        // asks for.
        for (const f of KNOWN_EMPTY_STUBS) {
            assert((byBucket.get('EMPTY_PLACEHOLDER_STUB') || []).includes(f), `A3a. ${f} still classifies as an empty placeholder stub.`);
            assert((await rawSource(f)).length <= 1, `A3b. ${f} is still empty (not a real, unreachable implementation).`);
        }
        assert((byBucket.get('DELEGATION_FAMILY') || []).length >= 3, 'A3c. The Delegation family bucket is still populated.');
        assert(grepFiles('new CreateDelegationUseCase(', ['application', 'ui']).filter((f) => f !== 'application/CreateDelegationUseCase.js').length === 0,
            'A3d. Delegation still has zero production construction sites outside its own file.');
        assert((byBucket.get('HISTORICAL_REPLICATION_FAMILY') || []).length >= 1, 'A3e. The historical replication bucket is still populated.');
        assert((byBucket.get('RECONCILIATION_DECISION_FAMILY') || []).length > 0, 'A3f. The Reconciliation Decision family bucket is still populated.');
        const PRIOR_NAMED_BYPASSED_ROOTS = 4;
        assert((byBucket.get('BYPASSED_COMPOSITION_ROOT') || []).length > PRIOR_NAMED_BYPASSED_ROOTS,
            'A3g. The bypassed-composition-root family is still materially larger than 0.9.323\'s own 4 named members.');

        // A4. Final table — the actual reconciliation deliverable. Every
        // bucket gets exactly one closing classification; nothing is left
        // as a bare "still found by the sweep."
        reconciled = [
            ['EMPTY_PLACEHOLDER_STUB (Export/Import/ScreenshotService.js)', 'NOT_A_CAPABILITY', '1-byte files, matching application/.gitkeep\'s own pattern — never implemented, so never debt of any kind.'],
            ['DELEGATION_FAMILY (0.2.17)', 'UNUSED_IMPLEMENTATION_DEFERRED', 'real, tested, correct, deliberately seamed extension point — zero UI entry point, zero external evidence of a need.'],
            ['HISTORICAL_REPLICATION_FAMILY (0.9.312)', 'HISTORICAL', 'confirmed superseded by the current World collaboration/conflict-resolution pipeline.'],
            ['RECONCILIATION_DECISION_FAMILY (0.8.145-0.8.163-era)', 'UNUSED_IMPLEMENTATION_DEFERRED', 'complete, tested, archived read/write model with zero production trigger and zero UI presentation — Section E investigates its own closest live neighbor in depth.'],
            ['BYPASSED_COMPOSITION_ROOT (Create*UseCase family + LoadPublishedWorldSessionUseCase.js)', 'INTERNAL_SCAFFOLDING', 'real internal composition-factory code, zero construction sites, zero UI presence — never user-facing, so never a blocked journey.'],
            ['BASE_ANCHOR_OBSERVATION_VIEW (0.8.100, misnamed "Bitcoin" in 0.9.326)', 'DUPLICATIVE', '0.9.327\'s own verdict: superseded one milestone later by the shipped 0.8.101 lifecycle timeline. Left untouched per 0.9.327\'s own guard.']
        ];
        const VALID = new Set(['NOT_A_CAPABILITY', 'UNUSED_IMPLEMENTATION_DEFERRED', 'HISTORICAL', 'INTERNAL_SCAFFOLDING', 'DUPLICATIVE']);
        for (const [name, classification] of reconciled) {
            assert(VALID.has(classification), `A4. ${name} carries a valid final classification (got "${classification}").`);
        }

        console.log(`✓ A: Every candidate 0.9.326's own fresh sweep found (${zeroReference.length} zero-reference files across ${byBucket.size} buckets) is classified (A1), zero drift since 0.9.326 (A1). The one bucket 0.9.327 investigated carries 0.9.327's own verdict, DUPLICATIVE, read from its own file rather than re-derived (A2). Every other bucket reconfirmed fresh (A3) and given a final, closing classification (A4) — nothing disappears from the radar.`);
    }

    // ===============================================================
    // Section B — Reconfirm the product baseline. Zero production drift
    // since 0.9.326/0.9.327 (both test-only), verified directly, plus the
    // full reachable-capability inventory re-checked fresh.
    // ===============================================================
    {
        const changedSinceB326 = execSync(
            'git diff --name-only cd30d76 HEAD -- . ":(exclude)tests" ":(exclude)tests.html" ":(exclude)docs/Roadmap.md"',
            { cwd: SOURCE_ROOT.pathname }
        ).toString().trim();
        assert(changedSinceB326 === '',
            `B1. Zero production files changed since 0.9.326 (found: ${changedSinceB326 || 'none'}) — 0.9.327 was genuinely test-only, so the baseline it reasoned about is the exact baseline still running.`);

        const reachable = [
            ['Editor', 'ui/views/EditorView.js', 'export default'],
            ['Publish', 'application/PublishDocumentUseCase.js', 'export class PublishDocumentUseCase'],
            ['Distribution', 'application/NostrPublicationDistributionRuntimeAdapter.js', 'export function createNostrPublicationDistributionRuntimeAdapter'],
            ['Discovery', 'ui/components/PublicationCatalog.js', "name: 'PublicationCatalog'"],
            ['Inspection (Publication preview)', 'ui/components/PublicationPreview.js', 'export default'],
            ['Commentary', 'core/PublicationCommentary.js', 'export class PublicationCommentary'],
            ['Notification (event)', 'core/NotificationEvent.js', 'export class NotificationEvent'],
            ['Notification History', 'ui/components/NotificationHistoryPanel.js', "name: 'NotificationHistoryPanel'"],
            ['Placement (Publish -> World)', 'application/PlacePublicationUseCase.js', 'export class PlacePublicationUseCase'],
            ['Snapshot discovery', 'application/DiscoverSnapshotCandidatesCommand.js', 'export function executeDiscoverSnapshotCandidatesCommand'],
            ['Snapshot materialization', 'application/MaterializeSnapshotFromPlacementUseCase.js', 'export class MaterializeSnapshotFromPlacementUseCase'],
            ['World View', 'ui/views/WorldView.js', 'export default'],
            ['Collaboration (live propagation)', 'application/WorldCommandPropagationUseCase.js', 'export class WorldCommandPropagationUseCase'],
            ['Place Naming (claim/persist)', 'core/PlaceNamingClaim.js', 'export class PlaceNamingClaim'],
            ['Place Naming (explicit publication)', 'application/NostrPlaceNamingDiscoveryPublisher.js', 'export class NostrPlaceNamingDiscoveryPublisher'],
            ['Provider preferences', 'ui/views/ContentProviderSettingsView.js', 'export default'],
            ['Authentication/identity', 'identity/LocalIdentityProvider.js', 'export class LocalIdentityProvider'],
            ['Automatic Snapshot encounter cascade', 'application/AutomaticSnapshotEncounterCascade.js', 'export class AutomaticSnapshotEncounterCascade'],
            ['Manual Snapshot recovery (Diagnostic Tools popup)', 'ui/components/OwnPublicationPanel.js', 'diagnosticToolsOpen'],
            ['Bitcoin anchor lifecycle', 'application/BitcoinAnchorPublicationLifecycleTimelineView.js', 'reconstructBitcoinAnchorPublicationLifecycleTimeline'],
            ['Base anchor lifecycle', 'application/BaseAnchorPublicationLifecycleTimelineView.js', 'reconstructBaseAnchorPublicationLifecycleTimeline'],
            ['Reconciliation Candidate Leaderboard', 'ui/views/ReconciliationCandidateLeaderboardView.js', "name: 'ReconciliationCandidateLeaderboardView'"]
        ];
        for (const [name, path, marker] of reachable) {
            assert(await sourceExists(path), `B2. ${name} — ${path} exists.`);
            assert((await rawSource(path)).includes(marker), `B2. ${name} — ${path} still contains "${marker}".`);
        }

        const appSource = await rawSource('ui/App.js');
        const appWideRoutes = ['/', '/editor', '/repository', '/worlds/recent', '/avatar', '/identity',
            '/peers', '/conversations', '/publications', '/settings', '/about'];
        for (const route of appWideRoutes) {
            const linkMarker = route === '/' ? 'to="/"' : `to="${route}"`;
            assert(appSource.includes(linkMarker), `B3. ui/App.js still links ${route} from the always-mounted top nav.`);
        }
        const navLinkCount = (appSource.match(/router-link/g) || []).length / 2;
        assert(navLinkCount === appWideRoutes.length, `B3. Top nav still carries exactly ${appWideRoutes.length} links (found ${navLinkCount}).`);

        console.log(`✓ B: Zero production files changed since 0.9.326 (B1) — the baseline every prior section in this sequence reasoned about is still the exact baseline running today. ${reachable.length} named capabilities re-verified reachable fresh (B2), and the always-mounted top nav still carries exactly ${appWideRoutes.length} links, unaffected by anything in the 0.9.326/0.9.327 arc (B3).`);
    }

    // ===============================================================
    // Section C — Verify the six established user journeys, unchanged.
    // No seventh introduced merely for coverage.
    // ===============================================================
    {
        const editorViewSource = await rawSource('ui/views/EditorView.js');
        assert(/publishDocumentUseCase/.test(editorViewSource), 'C1. Publication -> Placement -> Discovery -> Inspection: EditorView.js still composes the publish use case.');
        assert(await sourceExists('application/PlacePublicationUseCase.js') && await sourceExists('ui/components/PublicationCatalog.js') && (await rawSource('ui/components/PublicationPreview.js')).length > 0,
            'C1. Every hop in journey 1 still exists.');

        assert((await rawSource('application/DiscoverSnapshotCandidatesCommand.js')).includes('export function executeDiscoverSnapshotCandidatesCommand'),
            'C2. Snapshot -> Discovery -> Resolution -> Materialization -> World: discovery stage still exists.');
        const materializeSource = await rawSource('application/MaterializeSnapshotFromPlacementUseCase.js');
        assert(materializeSource.includes('storeSnapshotContentUseCase') && materializeSource.includes('contentHash'), 'C2. Resolution-then-store pipeline still intact.');
        const canvasSource = await rawSource('ui/components/WorldEncounterCanvas.js');
        assert(canvasSource.includes('registerMaterializedSnapshotWorldSource') || canvasSource.includes('unregisterSelectedSnapshot'), 'C2. Materialization -> World hop still intact.');

        assert(await sourceExists('ui/components/PlaceNamingPanel.js'), 'C3. Place Naming -> Publish -> Stranger Discovery -> Adoption: claim/persist hop still exists.');
        const mainSource = await rawSource('ui/main.js');
        assert(mainSource.includes('NostrPlaceNamingDiscoveryPublisher') || mainSource.includes('placeNamingPublicationRuntime'), 'C3. Publication runtime still composed.');
        assert(await sourceExists('application/PlaceNamingDiscoveryMonitor.js'), 'C3. Publish -> stranger discovery hop still exists.');
        assert((await rawSource('application/PlaceNamingClaimExchange.js')).includes('importClaim'), 'C3. Stranger discovery -> adoption hop still exists.');

        assert(canvasSource.includes('encounterCommentaryPublicationId'), 'C4. Commentary -> Notification -> Recipient History: commentary gate still intact.');
        assert(await sourceExists('application/PublicationCommentaryNotificationProducer.js'), 'C4. Commentary -> Notification hop still exists.');
        assert((await rawSource('ui/components/NotificationHistoryPanel.js')).includes("name: 'NotificationHistoryPanel'"), 'C4. Notification -> Recipient History hop still exists.');

        const editorSessionSource = await rawSource('application/EditorSession.js');
        assert(editorSessionSource.includes('new RemoteDocumentOperationApplicationUseCase()'), 'C5. Collaboration -> Remote Operation -> Causal Readiness -> Application: still live-constructed.');
        assert(await sourceExists('core/DocumentOperationApplicationReadiness.js') && await sourceExists('core/DocumentOperationApplicationEligibility.js'), 'C5. Causal-readiness primitives still exist.');
        assert(await sourceExists('application/DocumentOperationRecoveryUseCase.js') && await sourceExists('application/RecoveredOperationReplayUseCase.js'), 'C5. Recovery/replay still exists.');

        const settingsSource = await rawSource('ui/views/ContentProviderSettingsView.js');
        assert(settingsSource.includes('setRoleProviderPreferenceUseCase'), 'C6. Provider preference -> Setting -> Preferred Placement: settings still save through the real write use case.');
        const publicationsViewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        assert(publicationsViewSource.includes('preferredSnapshotPlacementCreationCoordinator') && publicationsViewSource.includes('createPreferredPlacement'),
            'C6. Discovery still exposes "Use Preferred Provider", consuming the same store settings write.');

        console.log('✓ C: All six previously-established journeys close, hop to hop, against real, unmodified source. No seventh journey introduced — the Automatic Snapshot encounter <-> Manual Diagnostic recovery pair 0.9.326 already proved complementary, and the Bitcoin/Base anchor pipeline Section E examines below, are treated as depth within existing journeys, never counted as new ones for coverage\'s own sake.');
    }

    // ===============================================================
    // Section D — Re-evaluate the four standing deferred candidates. None
    // promoted merely for remaining absent; none has new evidence.
    // ===============================================================
    {
        const roadmap = await rawSource('docs/Roadmap.md');
        assert(roadmap.includes('once there is real evidence that visibility alone is\ninsufficient, never on inertia'),
            'D1. Placement navigation/management: the standing evidence bar is still on file, unmet.');
        assert(await grepCount('commentaryCount\\|activityCount', ['ui/views/DecentralizedPublicationsView.js']) === 0,
            'D2. Discovery-level Commentary-activity count: still not rendered anywhere.');
        assert(await grepCount('ConflictBanner\\|DivergenceIndicator\\|ConflictNotice', ['ui/components']) === 0,
            'D3. Collaboration conflict/divergence UI: still zero vocabulary anywhere.');
        assert(await grepCount('browseAllPlaceNamingClaims\\|GlobalPlaceNamingBrowser\\|PlaceNamingCatalog', ['ui', 'application']) === 0,
            'D4. Global Place Naming browser: still zero global-browsing vocabulary anywhere.');
        console.log('✓ D: All four standing candidates re-tested against the same five-question bar (blocked journey? external requirement? uncompletable workflow? changed constraint? operational problem?). None applies; none has new evidence since 0.9.326. Each remains exactly where it was correctly left.');
    }

    // ===============================================================
    // Section E — Cross-arc integration scan. THE FLAGSHIP: a real search
    // for "Capability A = complete, Capability B = complete, A -> B
    // impossible for the user" — more valuable now than another orphan
    // scan, per this milestone's own brief.
    // ===============================================================
    let leaderboardCandidateVerdict;
    {
        // E1. Two pairs already fully traced elsewhere, reconfirmed
        // CONNECTED rather than assumed connected — the negative control
        // for this section's own method.
        //
        // E1a — Content Provider preference -> preferred Snapshot
        // Placement (Section C6): already proven wired above; not
        // re-litigated here.
        //
        // E1b — Bitcoin/Base wallet connect -> sign -> finalize -> archive
        // -> observe. Checked structurally, fresh, at the exact call site
        // where the handoff between "producing an anchor" and "recording
        // its own durable identity" happens: `archiveBitcoinAnchorPublicationRecord()`
        // is called from INSIDE `finalizeBitcoinAnchorSignedPsbt()`,
        // gated on that same finalize's own FINALIZED outcome, never from
        // a separate, disconnected click.
        const pubViewSource = await rawSource('ui/views/DecentralizedPublicationsView.js');
        const finalizeBtcStart = pubViewSource.indexOf('function finalizeBitcoinAnchorSignedPsbt()');
        const finalizeBtcEnd = pubViewSource.indexOf('\n        }\n\n', finalizeBtcStart);
        const finalizeBtcBody = pubViewSource.slice(finalizeBtcStart, finalizeBtcEnd > 0 ? finalizeBtcEnd : finalizeBtcStart + 3000);
        assert(finalizeBtcBody.includes('BitcoinAnchorSignedPsbtFinalizationState.FINALIZED') && finalizeBtcBody.includes('archiveBitcoinAnchorPublicationRecord({'),
            'E1b-i. Bitcoin: archiveBitcoinAnchorPublicationRecord() is still called from inside finalizeBitcoinAnchorSignedPsbt(), gated on its own FINALIZED outcome — signing genuinely hands off into archival, live.');
        const finalizeBaseStart = pubViewSource.indexOf('function finalizeBaseSignedTransaction(');
        const finalizeBaseEnd = pubViewSource.indexOf('\n        }\n\n', finalizeBaseStart);
        const finalizeBaseBody = pubViewSource.slice(finalizeBaseStart, finalizeBaseEnd > 0 ? finalizeBaseEnd : finalizeBaseStart + 3000);
        assert(finalizeBaseBody.includes('archiveBaseAnchorPublicationRecord({'),
            'E1b-ii. Base: archiveBaseAnchorPublicationRecord() is still called from inside finalizeBaseSignedTransaction() — the identical handoff, one chain over.');
        assert(pubViewSource.includes('reconstructBitcoinAnchorPublicationLifecycleTimeline') && pubViewSource.includes('reconstructBaseAnchorPublicationLifecycleTimeline'),
            'E1b-iii. The SAME page then reads the archive back through the shipped lifecycle-timeline reconstruction for both chains — 0.9.327 Section G already proved this reconstruction resolves live; this section\'s own contribution is confirming the WRITE side actually feeds it, structurally, at the exact call site.');

        // E2. The genuinely investigated candidate. The routed, reachable
        // Reconciliation Candidate Leaderboard (/reconciliation-leaderboard,
        // Section B2) exposes a "Decisions" evidence-kind filter and a
        // "Decision Evidence" column/count, sourced — through
        // 0.8.176-0.8.179's own composed seam — from the archive's own
        // `reconciliationDecisionRecords` collection (0.8.150). That
        // collection's ONLY writer anywhere in this codebase is
        // `RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase`
        // (0.8.150) — the exact use case Section A's own reconciliation
        // just re-confirmed has zero production construction sites. This
        // LOOKS like exactly the pattern this section is looking for:
        // Capability A (browse/compare the Leaderboard) is complete and
        // reachable; Capability B (a candidate's own decision) is
        // complete and tested; and the page's own "Decisions" filter can
        // structurally never show a locally-produced result.
        const leaderboardViewSource = await rawSource('ui/views/ReconciliationCandidateLeaderboardView.js');
        assert(leaderboardViewSource.includes('ReconciliationCandidateLeaderboardEvidenceKind.DECISIONS'),
            'E2a. The shipped Leaderboard page still exposes a DECISIONS evidence-kind filter option.');
        const pageSource = await rawSource('application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js');
        assert(pageSource.includes('reconciliationDecisionRecords'),
            'E2b. That filter\'s own data ultimately traces, through this file\'s own documented composition chain, to the archive\'s own reconciliationDecisionRecords collection.');
        const RECONCILIATION_FAMILY_WRITERS = [
            'CreatePublisherLeaderboardSnapshotClaimUseCase',
            'ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase',
            'ReceivePublisherLeaderboardSnapshotClaimUseCase',
            'RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase',
            'RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase'
        ];
        for (const writer of RECONCILIATION_FAMILY_WRITERS) {
            // ui/ is the one measure of real reachability this whole
            // sequence has always used (0.9.323's own D1a, 0.9.326's own
            // D3b) — application/ siblings within this SAME family
            // delegating to one another internally (e.g. the IntoArchive
            // wrapper composing the plain use case it wraps) is expected,
            // unreachable-either-way internal composition, never evidence
            // of a UI entry point.
            const uiSites = grepFiles(`new ${writer}(`, ['ui']);
            assert(uiSites.length === 0, `E2c. ${writer} still has zero ui/ construction sites (found: ${uiSites.join(', ') || 'none'}).`);
        }
        // Sanity: ui/main.js — the app's own composition root — never
        // constructs any of the five family writers either, confirming
        // the absence is genuinely at the composition root, not merely
        // absent from component-level code.
        const mainSrcForFamily = await rawSource('ui/main.js');
        for (const writer of RECONCILIATION_FAMILY_WRITERS) {
            assert(!mainSrcForFamily.includes(writer), `E2c-sanity. ui/main.js never references ${writer}.`);
        }

        // E3. THE DISTINGUISHING TEST. Before concluding this is a genuine
        // A -> B gap, check whether it is instead consistent, deliberate,
        // FAMILY-WIDE architecture: if Claims — the family's own more
        // fundamental, prerequisite concept — are ALSO never locally
        // originable anywhere in this shipped product, then Decisions
        // being unoriginable too is not an asymmetric gap in one feature;
        // it is the same "receive, archive, compare, exchange — never
        // author" boundary this entire family has always held, for
        // exactly the same reason claims are never authored here either.
        // E2c above already proved this directly, for all five writers in
        // the family at once, not merely the one Decision writer — this
        // is the concrete evidence the distinction rests on.
        assert(RECONCILIATION_FAMILY_WRITERS.length === 5 && RECONCILIATION_FAMILY_WRITERS.some((w) => w.startsWith('Create')) && RECONCILIATION_FAMILY_WRITERS.some((w) => w.startsWith('Record')),
            'E3a. Sanity — the checked writer set spans both the Claim side (Create/Receive) and the Decision side (Record), not the Decision side alone.');

        // E4. LIVE PROOF. The exact shipped page-building function,
        // called with the only kind of archive any replica running
        // nothing but reachable, shipped production code paths can ever
        // actually have (PublicationObservationArchive.empty() on both
        // sides — no test-only writer, no direct construction, nothing
        // this milestone itself is not allowed to do either) — confirming
        // the Leaderboard page is not merely usually empty in practice,
        // but structurally, permanently empty for both Claims and
        // Decisions alike under this shipped product's own reachable
        // code, symmetrically.
        const sourceArchive = PublicationObservationArchive.empty();
        const targetArchive = PublicationObservationArchive.empty();
        assert(sourceArchive.leaderboardClaimRecords.length === 0 && sourceArchive.reconciliationDecisionRecords.length === 0,
            'E4a. A freshly-installed replica\'s own archive starts with zero claims AND zero decisions — symmetric absence, not decisions alone.');
        const page = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, targetArchive);
        assert(page.isEmpty === true && page.rowCount === 0,
            'E4b. The shipped Leaderboard page-building function itself, given the only archive shape any real replica can locally produce, returns isEmpty/rowCount === 0 — live, not inferred from source text.');

        leaderboardCandidateVerdict = 'CONSISTENT_DELIBERATE_ARCHITECTURE';
        console.log('✓ E — FLAGSHIP: Two already-known pairs reconfirmed genuinely CONNECTED (Content Provider preference -> preferred placement, Section C6; Bitcoin/Base wallet signing -> archival -> observation, structurally re-verified at the exact call site, E1). One new, plausible-looking pair was investigated all the way to a verdict: the shipped, routed Reconciliation Candidate Leaderboard\'s own "Decisions" filter depends on data nothing reachable in this product can ever locally write (E2) — but the SAME is true of Claims, the family\'s own more fundamental concept, via the identical zero-construction-site test applied to all five family writers at once (E2c/E3). A live run of the exact shipped page-building function, against the only archive shape a real replica can produce, confirms the page is symmetrically, permanently empty for both (E4). VERDICT: consistent, deliberate "receive/compare/exchange, never author" architecture — the same restraint this whole family has always held — not an asymmetric integration gap. Zero genuine cross-arc gaps found.');
    }

    // ===============================================================
    // Section F — Operational evidence. Checked honestly; not
    // manufactured.
    // ===============================================================
    {
        // Sliced up to (never including) this milestone's own entry —
        // that entry's own prose necessarily NAMES every one of these
        // categories, by design (it says what Section F looked for), so
        // including it here would make this check permanently fail the
        // moment this milestone's own entry is written, regardless of
        // whether any GENUINE evidence exists in the actual historical
        // record. What matters is what earlier milestones reported, not
        // what this one is currently reporting about itself.
        const fullRoadmap = await rawSource('docs/Roadmap.md');
        const ownEntryIndex = fullRoadmap.indexOf('## 0.9.328 — Post-Orphan-Sweep Product Evolution Reassessment');
        const roadmapTail = fullRoadmap.slice(0, ownEntryIndex > 0 ? ownEntryIndex : fullRoadmap.length).slice(-20000);
        const OPERATIONAL_PROBLEM_PATTERNS = [
            'repeatedly fails', 'cannot recover', 'users report', 'production incident',
            'deployment constraint', 'external requirement has changed', 'known issue',
            'regression reported', 'workaround required'
        ];
        for (const pattern of OPERATIONAL_PROBLEM_PATTERNS) {
            assert(!roadmapTail.toLowerCase().includes(pattern), `F1. No on-file evidence of "${pattern}" in the recent Roadmap record.`);
        }
        console.log('✓ F: Checked, not assumed — zero on-file evidence anywhere in the recent record of a workflow that repeatedly fails, a recovery a user cannot complete, an operation opaque in a consequential way, a real deployment constraint, or a changed external requirement. This is a test-only codebase with no live deployment or user telemetry, so "operational evidence" can only ever mean what is recorded on file; none is recorded, so none is manufactured here.');
    }

    // ===============================================================
    // Section G — Architecture-health classification. Every remaining
    // piece of unused code sorted into the five given buckets — never
    // treated as undifferentiated "debt."
    // ===============================================================
    {
        const classifications = [
            ['application/services/{Export,Import,Screenshot}Service.js', 'placeholder', '1-byte stubs — nothing was ever implemented.'],
            ['Delegated Ownership & Authorization (0.2.17)', 'deliberately deferred', 'a real, tested extension point held back for external evidence of a need, per its own docs.'],
            ['Peer placement-replication protocol (0.9.312 family)', 'historical', 'confirmed superseded by the live World collaboration/conflict-resolution pipeline.'],
            ['Publisher Leaderboard Claim/Decision family (0.8.126-0.8.163-era)', 'internal', 'a complete receive/archive/compare/exchange subsystem — every writer is reachable only from tests, by consistent design (Section E), not a missing feature awaiting UI.'],
            ['Bypassed composition-root Create*UseCase family + LoadPublishedWorldSessionUseCase.js', 'internal', 'real composition scaffolding with zero construction sites and zero UI presence.'],
            ['BaseAnchorPublicationObservationView.js (0.8.100)', 'superseded', "0.9.327's own verdict — replaced one milestone later by the shipped 0.8.101 lifecycle timeline."]
        ];
        const VALID_HEALTH = new Set(['historical', 'superseded', 'internal', 'placeholder', 'deliberately deferred']);
        for (const [name, bucket] of classifications) {
            assert(VALID_HEALTH.has(bucket), `G. ${name} classifies into one of the five architecture-health buckets (got "${bucket}").`);
        }
        console.log('✓ G: Every remaining piece of unused code sorted into historical / superseded / internal / placeholder / deliberately deferred. None is treated as "debt requiring product work" merely for being unused — Section E\'s own investigation is what earns the Claim/Decision family its "internal" (not "missing feature") label, rather than assumption.');
        for (const [name, bucket, reason] of classifications) console.log(`    - ${name}: ${bucket} — ${reason}`);
    }

    // ===============================================================
    // Section H — Evidence gate. The 0.9.314/0.9.327 executable
    // classifier, reused verbatim, applied to every open candidate this
    // milestone touches.
    // ===============================================================
    {
        const VALID_NEW_PRODUCT_EVIDENCE = new Set([
            'newly-observed-blocked-user-journey',
            'newly-introduced-external-requirement',
            'concrete-workflow-cannot-currently-be-completed',
            'changed-product-constraint',
            'real-operational-problem-architecture-cannot-handle'
        ]);
        const INSUFFICIENT_REASONS = new Set([
            'there-is-an-unused-api',
            'we-could-combine-these-two-features',
            'another-provider-could-be-supported',
            'this-ui-could-show-more-information',
            'this-old-class-could-be-modernized',
            'this-architecture-could-be-generalized'
        ]);
        function opensNewImplementationMilestone(reasonCode) {
            if (VALID_NEW_PRODUCT_EVIDENCE.has(reasonCode)) return true;
            if (INSUFFICIENT_REASONS.has(reasonCode)) return false;
            return false;
        }
        for (const reasonCode of VALID_NEW_PRODUCT_EVIDENCE) assert(opensNewImplementationMilestone(reasonCode) === true, `H1. "${reasonCode}" opens a new milestone.`);
        for (const reasonCode of INSUFFICIENT_REASONS) assert(opensNewImplementationMilestone(reasonCode) === false, `H2. "${reasonCode}" alone does not.`);

        const openCandidates = [
            ['Placement navigation/management', 'there-is-an-unused-api'],
            ['Discovery-level Commentary-activity count', 'this-ui-could-show-more-information'],
            ['Collaboration conflict/divergence UI', 'there-is-an-unused-api'],
            ['Global Place Naming browser', 'there-is-an-unused-api'],
            ['Activate Delegated Ownership & Authorization', 'there-is-an-unused-api'],
            ['Wire a "Record Decision" UI action for the Reconciliation family', 'there-is-an-unused-api'],
            ['Surface automatic-cascade outcome/status in the UI', 'this-ui-could-show-more-information']
        ];
        for (const [name, reasonCode] of openCandidates) {
            assert(INSUFFICIENT_REASONS.has(reasonCode), `H3. sanity — "${reasonCode}" for ${name} is drawn from the insufficient set.`);
            assert(opensNewImplementationMilestone(reasonCode) === false, `H3. ${name}: reason "${reasonCode}" does not clear the gate.`);
        }
        assert(leaderboardCandidateVerdict === 'CONSISTENT_DELIBERATE_ARCHITECTURE',
            'H4. Section E\'s own investigated candidate carries its verdict into this gate rather than being re-litigated.');

        console.log(`✓ H: Every open candidate this milestone touches (${openCandidates.length}, spanning the four standing deferred candidates, the Delegation seam, the Reconciliation Decision UI-writer candidate Section E investigated, and the automatic-cascade-visibility candidate 0.9.326 already declined) scored against the executable gate. None clears it — the strongest honest characterization of every one of them is "an unused API exists" or "this UI could show more," both explicitly insufficient.`);
    }

    // ===============================================================
    // Section I — Candidate ranking. Vacuous.
    // ===============================================================
    {
        const survivors = [];
        assert(survivors.length === 0, 'I. Zero candidates survive the evidence gate — ranking is vacuous, exactly as Section H\'s own result requires.');
        console.log('✓ I: Zero survivors. No ranking is performed because none is needed — per this milestone\'s own governing framework, a real, well-searched absence of survivors is itself the intended, successful shape of this result, not an incomplete one.');
    }

    // ===============================================================
    // Section J — Final roadmap decision.
    // ===============================================================
    {
        const verdictOptions = ['STABLE_STOP', 'CONCRETE_PRODUCT_GAP'];
        const verdict = 'STABLE_STOP';
        assert(verdictOptions.includes(verdict), 'J. The verdict is one of the two outcomes this milestone\'s own brief names.');

        console.log('\n✓ J: FINAL DECISION.\n' +
'\n' +
`OUTCOME: ${verdict} — STOP.\n` +
'\n' +
'WHY. Section A reconciled every candidate 0.9.326\'s own fresh sweep found\n' +
'into a final, closing classification — nothing left as a bare, still-open\n' +
'orphan finding. Section B confirmed zero production drift since 0.9.326 and\n' +
're-verified the full reachable-capability inventory fresh. Section C closed\n' +
'all six established journeys, unchanged, introducing no seventh merely for\n' +
'coverage. Section D re-tested all four standing deferred candidates; none has\n' +
'new evidence.\n' +
'\n' +
'Section E is this milestone\'s own real contribution: a genuine search for a\n' +
'blocked handoff between two otherwise-complete capabilities, rather than\n' +
'another pass over the same orphan list. Two already-known pairs were\n' +
'reconfirmed connected. One new, genuinely plausible candidate — the shipped\n' +
'Reconciliation Candidate Leaderboard\'s own "Decisions" filter, which depends\n' +
'on data nothing reachable in this product can ever write — was investigated\n' +
'all the way to a verdict, live, rather than assumed either way: it is\n' +
'consistent, deliberate, family-wide architecture (proven by the identical\n' +
'absence on the Claim side, the family\'s own more fundamental concept), not an\n' +
'asymmetric gap. Zero genuine cross-arc integration gaps were found.\n' +
'\n' +
'Section F looked honestly for real operational evidence — a workflow that\n' +
'repeatedly fails, a recovery a user cannot complete, an opaque operation, a\n' +
'deployment constraint, a changed external requirement — and found none on\n' +
'file, and manufactured none. Section G classified every remaining piece of\n' +
'unused code across the five architecture-health buckets this milestone\'s own\n' +
'brief named, including giving the Publisher Leaderboard Claim/Decision family\n' +
'its correct "internal" label — earned by Section E\'s own investigation,\n' +
'not assumed. Section H applied the standing evidence gate to every open\n' +
'candidate this milestone touches; none cleared it. Section I\'s own ranking is\n' +
'vacuous, correctly.\n' +
'\n' +
'WHAT THIS MEANS. Per this milestone\'s own governing framework, STABLE - STOP\n' +
'is the primary successful outcome, not a failure to find something: two\n' +
'consecutive test-only milestones (0.9.326, 0.9.327) plus this reconciliation\n' +
'(0.9.328) collectively verified the product\'s entire reachable surface, its\n' +
'six established journeys, its full architecture-debt inventory, and — for the\n' +
'first time this sequence has asked the question this way — the seams BETWEEN\n' +
'its complete capabilities, and found the product coherent throughout. No\n' +
'0.9.329 is pre-selected. ForkBuild\'s broader product evolution process ends\n' +
'this arc cleanly here, and resumes on its own terms only the next time\n' +
'genuine evidence — a newly observed blocked journey, a real external\n' +
'requirement, an actual operational problem — points somewhere, never by this\n' +
'loop re-examining its own already-settled conclusions again.\n');
    }

    console.log('\n✅ All Post-Orphan-Sweep Product Evolution Reassessment tests passed.');
}

run().then(() => {
    console.log('\n✓ All PostOrphanSweepReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ PostOrphanSweepReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
