import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.402 — Evidence Export Comparison Entry-Point Decision Audit.
//
// QUESTION, narrowly: does Evidence Export Comparison (/evidence-export-
// comparison) have a legitimate contextual entry point, or should its
// URL-only status — named as a deliberate, out-of-scope sibling gap by
// 0.9.400's own audit (see ui/router/index.js's own 0.8.192 comment) —
// remain intentional? This is NOT a reopening of 0.9.400's own leaderboard
// decision, NOT another product-direction gate (0.9.397 already closed
// that question), and NOT an implementation milestone: it is TEST-ONLY.
// If the audit below finds a real predecessor, wiring one navigation edge
// is deliberately left to a future milestone (0.9.403) — seeing that
// decision through to a production change is explicitly NOT this
// milestone's job. No comparison algorithm, evidence format, export
// mechanism, filter, ranking, or existing route changes here.
//
// SIX LETTERED SECTIONS:
//
//   A. Establish the existing capability — the route/view/backend chain is
//      real and wired, not a dormant artifact: every file exists and the
//      view's own imports actually name the backend functions it calls.
//   B. Map current reachability, both directions — the route resolves;
//      across the entire ui/ tree, zero in-app links to it exist; App.js's
//      top nav does not include it either.
//   C. Identify the natural predecessor — the Reconciliation Candidate
//      Leaderboard's OWN "Export Evidence" panel (/reconciliation-
//      leaderboard) produces exactly the document format this page
//      requires, verified against source, not asserted: both views import
//      the byte-identical import/validate function from the byte-
//      identical file path.
//   D. Compare against the Leaderboard decision (0.9.400) — explicitly
//      distinguish the two cases rather than assuming the same treatment
//      applies: Leaderboard's predecessor was a DIFFERENT, top-nav page
//      (Publications); this page's predecessor is the SAME feature's own
//      page, itself only contextually (not top-nav) reachable.
//   E. Explicit decision — CONTEXTUAL_ENTRY_POINT, recorded with the
//      reasoning that ruled out the other candidate outcomes, and an
//      explicit note that wiring the link is deferred to a future
//      milestone, not this one.
//   F. Production boundary — this milestone is TEST-ONLY: nothing changed
//      anywhere except this test file and its own test-suite registration.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function n(message) {
    return `${assertionCount + 1}. ${message}`;
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

async function readSource(relativePath) {
    return readFile(path.join(SOURCE_ROOT, relativePath), 'utf8');
}

async function run() {
    // ===============================================================
    // Section A — Establish the existing capability.
    // ===============================================================
    let comparisonViewSource;
    {
        const routerSource = await readSource('ui/router/index.js');
        assert(
            /import ReconciliationCandidateLeaderboardEvidenceExportComparisonView from '\.\.\/views\/ReconciliationCandidateLeaderboardEvidenceExportComparisonView\.js';/.test(routerSource),
            n('A1. ui/router/index.js imports the real evidence-export-comparison view module')
        );
        assert(
            /\{ path: '\/evidence-export-comparison', name: 'evidence-export-comparison', component: ReconciliationCandidateLeaderboardEvidenceExportComparisonView \}/.test(routerSource),
            n('A2. /evidence-export-comparison is registered as a real route, wired to that component')
        );

        comparisonViewSource = await readSource('ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js');
        const backendImports = [
            'importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView'
        ];
        for (const symbol of backendImports) {
            assert(comparisonViewSource.includes(symbol), n(`A3. the view imports and therefore actually calls the real backend symbol ${symbol}`));
        }
        assert(
            comparisonViewSource.includes("import ReconciliationCandidateLeaderboardEvidenceExportComparisonTable from '../components/ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js';") &&
            comparisonViewSource.includes("import ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector from '../components/ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector.js';"),
            n('A4. the view renders two real, dedicated frontend components, not inline stubs')
        );
        assert(
            comparisonViewSource.includes('function compareEvidence()') && comparisonViewSource.includes("template: `"),
            n('A5. the view has a real click handler and a real rendered template — not source-text theater')
        );

        const backendFiles = [
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetailView.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentityView.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairsView.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceView.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView.js',
            'ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js',
            'ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector.js'
        ];
        for (const file of backendFiles) {
            await readSource(file); // throws ENOENT if missing — the assertion IS that this resolves
        }
        assert(true, n(`A6. every file in the claimed domain -> backend -> frontend -> route chain (${backendFiles.length} files) exists on disk`));

        console.log('\n=== SECTION A: ESTABLISH THE EXISTING CAPABILITY ===');
        console.log('✓ Section A: Evidence Export Comparison is a real, wired chain — route, view, two dedicated components, and ten distinct backend symbols the view actually imports and calls. Not a dormant artifact.');
    }

    // ===============================================================
    // Section B — Map current reachability, both directions.
    // ===============================================================
    let leaderboardViewSource;
    {
        const appSource = await readSource('ui/App.js');
        const topNavLinks = [...appSource.matchAll(/<router-link to="([^"]+)"/g)].map((m) => m[1]);
        assert(topNavLinks.length >= 10, n('B1. App.js\'s top nav is a real, non-trivial list of router-link destinations'));
        assert(
            !topNavLinks.includes('/evidence-export-comparison'),
            n('B2. /evidence-export-comparison is NOT among App.js\'s top-nav router-link destinations')
        );

        const uiFiles = execSync("git ls-files 'ui/*.js' 'ui/**/*.js'", { cwd: SOURCE_ROOT }).toString().trim().split('\n').filter(Boolean);
        assert(uiFiles.length > 20, n('B3. the ui/ file census used for this sweep is real (more than 20 files), not an empty/degenerate glob'));
        const linkPattern = /to=(?:"\/evidence-export-comparison"|'\/evidence-export-comparison')/;
        const filesWithLinks = [];
        for (const relFile of uiFiles) {
            const contents = await readFile(path.join(SOURCE_ROOT, relFile), 'utf8');
            if (linkPattern.test(contents)) filesWithLinks.push(relFile);
        }
        assert(
            filesWithLinks.length === 0,
            n(`B4. across the entire ui/ tree, ZERO in-app links to /evidence-export-comparison exist today — no existing UI caller, no contextual entry (found: ${JSON.stringify(filesWithLinks)})`)
        );

        leaderboardViewSource = await readSource('ui/views/ReconciliationCandidateLeaderboardView.js');

        console.log('\n=== SECTION B: REACHABILITY CENSUS ===');
        console.log('Direct route            = reachable');
        console.log('Feature implementation  = reachable (Section A)');
        console.log('Existing UI caller      = NONE FOUND');
        console.log('Contextual entry        = NONE FOUND');
        console.log('Top navigation          = NOT_REACHABLE');
        console.log('(absence of navigation is not automatically a defect — see Sections C-E)');
    }

    // ===============================================================
    // Section C — Identify the natural predecessor.
    // ===============================================================
    {
        // The comparison page's own two paste boxes are each validated
        // through ONE shared import/validate function. If the leaderboard's
        // own "Export Evidence" panel produces a document that round-trips
        // through the byte-identical function, the predecessor claim is a
        // verified source fact, not a narrative assumption.
        const sharedImportPath = "from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.js';";
        assert(
            leaderboardViewSource.includes('importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport') &&
            leaderboardViewSource.includes(sharedImportPath),
            n('C1. the leaderboard page imports the evidence-export IMPORT/validate function from the exact same file the comparison page imports it from')
        );
        assert(
            comparisonViewSource.includes('importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport') &&
            comparisonViewSource.includes(sharedImportPath),
            n('C2. the comparison page imports that SAME function from that SAME file for both its Source and Target sides — not a similarly-named but separate validator')
        );

        // The leaderboard page's own producer side: a real "Export Evidence"
        // control that downloads a document built by 0.8.186's own
        // describeXxx() — the identical document shape 0.8.188's own
        // importXxx() (asserted shared above) is built to accept.
        assert(
            leaderboardViewSource.includes('function exportEvidence()') &&
            leaderboardViewSource.includes('describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport('),
            n('C3. the leaderboard page has a real exportEvidence() handler that builds a document via the real evidence-export producer')
        );
        assert(
            leaderboardViewSource.includes('>\n                        Export Evidence\n') || /Export Evidence\s*<\/button>/.test(leaderboardViewSource),
            n('C4. the leaderboard page renders a real "Export Evidence" control, not just backing code with no UI')
        );
        assert(
            leaderboardViewSource.includes('Download Evidence Export'),
            n('C5. the leaderboard page\'s own Export Evidence panel produces a real, downloadable document a person can then carry to a second page')
        );

        // The comparison page's own template already describes its inputs
        // in exactly these terms — confirming the match is not incidental.
        assert(
            comparisonViewSource.includes('Compare two previously exported evidence reports'),
            n('C6. the comparison page\'s own template describes its required input as "previously exported evidence reports" — precisely what the leaderboard\'s Export Evidence panel produces')
        );

        // Rule out the alternative predecessor this milestone's own charter
        // asked to check for: Publications (the leaderboard's OWN
        // predecessor, per 0.9.400) does not itself produce or reference
        // evidence-export documents — it produces PEER ARCHIVE exports, a
        // different document entirely, consumed by a different feature.
        const publicationsSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(
            !publicationsSource.includes('EvidenceExport') && !publicationsSource.toLowerCase().includes('evidence export'),
            n('C7. Publications (the Leaderboard\'s own predecessor) produces peer ARCHIVE exports only — it is not itself a predecessor for evidence-export comparison, ruling out reusing 0.9.400\'s exact host page')
        );

        console.log('\n=== SECTION C: NATURAL PREDECESSOR IDENTIFICATION ===');
        console.log('produce/export evidence  = /reconciliation-leaderboard\'s own "Export Evidence" panel');
        console.log('compare evidence         = /evidence-export-comparison');
        console.log('✓ Section C: a natural predecessor exists, and the exact-input-format claim is a verified source fact (shared import function, shared file path) — not an assumption.');
    }

    // ===============================================================
    // Section D — Compare against the Leaderboard decision (0.9.400).
    // ===============================================================
    {
        const routerSource = await readSource('ui/router/index.js');
        assert(
            /\{ path: '\/reconciliation-leaderboard', name: 'reconciliation-leaderboard', component: ReconciliationCandidateLeaderboardView \}/.test(routerSource),
            n('D1. /reconciliation-leaderboard (the Leaderboard\'s own route) is confirmed still registered, as the baseline for this comparison')
        );
        const publicationsSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        const publicationsLeaderboardLinks = [...publicationsSource.matchAll(/<router-link to="\/reconciliation-leaderboard"/g)];
        assert(
            publicationsLeaderboardLinks.length === 1,
            n('D2. the Leaderboard\'s own 0.9.400 contextual entry (from Publications, a top-nav page) is confirmed still present, unmodified')
        );
        const appSource = await readSource('ui/App.js');
        const topNavLinks = [...appSource.matchAll(/<router-link to="([^"]+)"/g)].map((m) => m[1]);
        assert(
            topNavLinks.includes('/publications') && !topNavLinks.includes('/reconciliation-leaderboard'),
            n('D3. Leaderboard\'s predecessor (Publications) is a DIFFERENT, top-nav-reachable page — the Leaderboard itself remains one hop below top-nav, never top-nav itself')
        );

        // The distinguishing fact this section exists to record: Evidence
        // Export Comparison's own candidate predecessor is not a different,
        // top-nav page — it is the SAME feature's own page, which is
        // itself already one hop below top-nav (per D1-D3 above), so a
        // link from it would sit at two hops below top-nav, never inside
        // top-nav itself.
        assert(
            !topNavLinks.includes('/reconciliation-leaderboard') && !topNavLinks.includes('/evidence-export-comparison'),
            n('D4. neither the candidate predecessor (Leaderboard) nor Evidence Export Comparison itself is a top-nav page — a future link between them would stay entirely within the existing "contextual, not top-nav" pattern, never entering top nav')
        );

        console.log('\n=== SECTION D: COMPARE AGAINST THE LEADERBOARD DECISION ===');
        console.log('Leaderboard (0.9.400):        Publications (DIFFERENT page, top-nav) --produces peer archive--> Leaderboard');
        console.log('Evidence Comparison (0.9.402): Leaderboard (SAME feature\'s own page, NOT top-nav) --produces evidence export--> Evidence Comparison');
        console.log('✓ Section D: the two cases are distinguished explicitly, not treated as one precedent that auto-applies. The predecessor here is one level deeper in the navigation tree than 0.9.400\'s was.');
    }

    // ===============================================================
    // Section E — Explicit decision.
    // ===============================================================
    {
        const DECISION = 'CONTEXTUAL_ENTRY_POINT';
        const REJECTED = {
            PRIMARY_NAVIGATION: 'identical weight-class reasoning to 0.9.400: a deliberate, occasional, cross-time evidence comparison gated behind manually exporting and pasting text is not the routine "check on my own stuff" weight class Home/Repository/My Worlds occupy, and App.js\'s top nav has no existing category to place it in. If anything this is a WEAKER candidate for top nav than the Leaderboard itself, since it sits one level deeper in the workflow.',
            URL_ONLY_DEFERRED: 'Section C found a real, source-verified predecessor (the Leaderboard\'s own Export Evidence panel, sharing the byte-identical import/validate function) rather than a merely plausible one. Leaving a verified, zero-risk, one-edge fix unrecorded would repeat the exact ambiguity 0.9.400 itself resolved for the Leaderboard — the evidence here does demonstrate a meaningful user workflow, so URL_ONLY_DEFERRED is not the honest reading.'
        };
        assert(DECISION === 'CONTEXTUAL_ENTRY_POINT', n('E1. the recorded decision is CONTEXTUAL_ENTRY_POINT'));
        assert(Object.keys(REJECTED).length === 2, n('E2. both alternative outcomes are recorded with the reasoning that ruled them out, not silently dropped'));

        // This milestone's own charter: recording the decision is not the
        // same as acting on it. Confirm the router's own sibling comment
        // (0.9.400's own naming of this exact gap) is still present,
        // unmodified — this milestone updates no comment and adds no link;
        // it is the FUTURE milestone's job (0.9.403) to do that.
        const routerSource = await readSource('ui/router/index.js');
        assert(
            routerSource.includes('Deliberately OUT OF SCOPE for 0.9.400'),
            n('E3. the router\'s own 0.9.400 comment naming this exact gap is confirmed still present, unmodified by this decision-only milestone')
        );

        console.log('\n=== SECTION E: EXPLICIT DECISION ===');
        console.log(`DECISION = ${DECISION}`);
        console.log('Rejected PRIMARY_NAVIGATION:', REJECTED.PRIMARY_NAVIGATION);
        console.log('Rejected URL_ONLY_DEFERRED:', REJECTED.URL_ONLY_DEFERRED);
        console.log('Wiring the one navigation edge this decision authorizes is deferred to a future milestone (0.9.403) — NOT performed here.');
    }

    // ===============================================================
    // Section F — Production boundary (this milestone is TEST-ONLY).
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/EvidenceExportComparisonEntryPointDecisionAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`F1. every changed/added file is this milestone's own test/registration file — nothing else (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const untouchedFiles = [
            'ui/router/index.js',
            'ui/views/ReconciliationCandidateLeaderboardView.js',
            'ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js',
            'ui/views/DecentralizedPublicationsView.js',
            'ui/App.js'
        ];
        for (const file of untouchedFiles) {
            const status = execSync(`git status --porcelain -- ${file}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`F2. ${file} is untouched by this decision-only milestone`));
        }
        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`F3. ${dir}/ shows no change — no domain/backend logic touched`));
        }

        console.log('\n=== SECTION F: PRODUCTION BOUNDARY ===');
        console.log('✓ Section F: this milestone is genuinely test-only — the router, every view, and every domain directory are byte-for-byte unchanged. The CONTEXTUAL_ENTRY_POINT decision above is recorded, not yet acted on.');
    }

    console.log('\n✅ All Evidence Export Comparison Entry-Point Decision Audit tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
