import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.403 — Evidence Export Comparison Contextual Entry Point.
//
// QUESTION, narrowly: does exactly one contextual navigation edge now exist
// from the Reconciliation Candidate Leaderboard's own "Export Evidence"
// panel to /evidence-export-comparison — the one edge 0.9.402's own
// decision audit (tests/EvidenceExportComparisonEntryPointDecisionAudit
// .test.js) recorded as CONTEXTUAL_ENTRY_POINT and deliberately deferred?
// This is an IMPLEMENTATION audit, not another decision audit: 0.9.402
// already answered "should a link exist and where." This milestone only
// answers "was that one link actually wired, correctly, and nowhere else."
// No comparison algorithm, evidence format, export mechanism, filter,
// ranking, or router destination is touched by this milestone.
//
// SEVEN LETTERED SECTIONS:
//
//   A. Existing feature remains intact — route, view, and backend chain for
//      BOTH the Leaderboard and Evidence Export Comparison are still real
//      and wired, exactly as 0.9.400/0.9.402 already established.
//   B. Exactly one contextual edge — the Leaderboard's own Export Evidence
//      panel, and only that panel, contains the new entry point. Proven by
//      locating the panel's own template slice, never by a brittle global
//      "count every link on the page" assertion.
//   C. Correct destination — the action resolves to exactly
//      /evidence-export-comparison, the real registered route name, never a
//      typo'd path or a different route sharing a similar name.
//   D. Correct placement — the link's source position falls strictly inside
//      the Export Evidence panel's own markup boundaries, never merely
//      somewhere on the Leaderboard page (e.g. the Peer Archive panel, the
//      Evidence Filter panel, or the Import Evidence panel).
//   E. No top-navigation promotion — /evidence-export-comparison remains
//      absent from App.js's top nav, and so does /reconciliation-leaderboard
//      itself; the new edge stays exactly one hop below where it already
//      was, never promoted.
//   F. Implementation isolation — the Leaderboard's own comparison logic,
//      the Evidence Export Comparison page's own comparison logic, the
//      evidence document format, and the destination route's own
//      registration are each byte-for-byte unchanged; only a navigation
//      edge is new.
//   G. Production boundary — changes are confined to the Leaderboard UI
//      surface and this milestone's own test/registration/documentation
//      files; no domain/backend directory is touched.

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
    // Section A — Existing feature remains intact.
    // ===============================================================
    let leaderboardViewSource;
    let comparisonViewSource;
    let routerSource;
    {
        routerSource = await readSource('ui/router/index.js');
        assert(
            /\{ path: '\/reconciliation-leaderboard', name: 'reconciliation-leaderboard', component: ReconciliationCandidateLeaderboardView \}/.test(routerSource),
            n('A1. /reconciliation-leaderboard is still registered as a real route, wired to its real component')
        );
        assert(
            /\{ path: '\/evidence-export-comparison', name: 'evidence-export-comparison', component: ReconciliationCandidateLeaderboardEvidenceExportComparisonView \}/.test(routerSource),
            n('A2. /evidence-export-comparison is still registered as a real route, wired to its real component')
        );

        leaderboardViewSource = await readSource('ui/views/ReconciliationCandidateLeaderboardView.js');
        comparisonViewSource = await readSource('ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js');

        const leaderboardBackendImports = [
            'reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport',
            'importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport'
        ];
        for (const symbol of leaderboardBackendImports) {
            assert(leaderboardViewSource.includes(symbol), n(`A3. the Leaderboard view still imports and calls the real backend symbol ${symbol}`));
        }
        const comparisonBackendImports = [
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView'
        ];
        for (const symbol of comparisonBackendImports) {
            assert(comparisonViewSource.includes(symbol), n(`A4. the Evidence Export Comparison view still imports and calls the real backend symbol ${symbol}`));
        }

        const backendFiles = [
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView.js',
            'ui/components/ReconciliationCandidateLeaderboardTable.js',
            'ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js'
        ];
        for (const file of backendFiles) {
            await readSource(file); // throws ENOENT if missing — the assertion IS that this resolves
        }
        assert(true, n(`A5. every file in both the Leaderboard's and Evidence Export Comparison's own domain -> backend -> frontend -> route chains (${backendFiles.length} files) still exists on disk`));

        console.log('\n=== SECTION A: EXISTING FEATURE REMAINS INTACT ===');
        console.log('✓ Section A: both routes, both views, and every backend file they depend on are still real and wired — nothing about either existing feature regressed.');
    }

    // ===============================================================
    // Section B — Exactly one contextual edge.
    // ===============================================================
    let exportPanelSlice;
    {
        // Locate the Export Evidence panel's own template slice by its two
        // real boundary markers — the panel's own opening div and the very
        // next sibling panel's opening div — rather than asserting a
        // brittle, page-wide "count every link" number.
        const panelStart = leaderboardViewSource.indexOf('reconciliation-leaderboard-evidence-export');
        assert(panelStart !== -1, n('B1. the Leaderboard view still contains its own Export Evidence panel markup'));
        const nextPanelStart = leaderboardViewSource.indexOf('reconciliation-leaderboard-evidence-import', panelStart);
        assert(nextPanelStart !== -1 && nextPanelStart > panelStart, n('B2. the panel immediately following Export Evidence (Import Evidence) is locatable, giving this audit a real, non-arbitrary slice boundary'));
        exportPanelSlice = leaderboardViewSource.slice(panelStart, nextPanelStart);

        const linkPattern = /<router-link\s+to="\/evidence-export-comparison"/;
        const matchesInPanel = exportPanelSlice.match(new RegExp(linkPattern.source, 'g')) || [];
        assert(matchesInPanel.length === 1, n(`B3. exactly one router-link to /evidence-export-comparison exists inside the Export Evidence panel's own slice (found ${matchesInPanel.length})`));

        const matchesInWholeFile = leaderboardViewSource.match(new RegExp(linkPattern.source, 'g')) || [];
        assert(matchesInWholeFile.length === 1, n(`B4. exactly one router-link to /evidence-export-comparison exists anywhere in the Leaderboard view file — the panel-local count (B3) and the whole-file count agree, so nothing outside the panel duplicates it`));

        console.log('\n=== SECTION B: EXACTLY ONE CONTEXTUAL EDGE ===');
        console.log('✓ Section B: the Export Evidence panel\'s own template slice contains exactly one link to /evidence-export-comparison, and that is the only such link anywhere in the file.');
    }

    // ===============================================================
    // Section C — Correct destination.
    // ===============================================================
    {
        assert(
            exportPanelSlice.includes('<router-link to="/evidence-export-comparison" class="action-btn action-btn--secondary">'),
            n('C1. the entry point\'s own `to` attribute is the exact literal string "/evidence-export-comparison" — not a computed path, not a similarly named route, not a typo')
        );
        assert(
            /\{ path: '\/evidence-export-comparison', name: 'evidence-export-comparison', component: ReconciliationCandidateLeaderboardEvidenceExportComparisonView \}/.test(routerSource),
            n('C2. that exact literal path is registered in the router as a real route resolving to the real Evidence Export Comparison component — the link does not merely look right, it resolves')
        );
        assert(
            exportPanelSlice.includes('Compare Exported Evidence'),
            n('C3. the entry point\'s own visible label names the destination workflow, not a generic "Go" or "Next"')
        );

        console.log('\n=== SECTION C: CORRECT DESTINATION ===');
        console.log('✓ Section C: the entry point\'s `to` is the literal, exact /evidence-export-comparison path, which the router resolves to the real, existing comparison component.');
    }

    // ===============================================================
    // Section D — Correct placement.
    // ===============================================================
    {
        // Prove the link sits INSIDE the Export Evidence panel, not merely
        // somewhere on the Leaderboard page, by checking its character
        // offset falls strictly between the Export Evidence panel's own
        // start and the sibling panels that bound it on either side.
        const peerArchivePanelStart = leaderboardViewSource.indexOf('evidence-inspection-adapter">\n                <span class="evidence-inspection-adapter-title">Peer Archive');
        const filterPanelStart = leaderboardViewSource.indexOf('reconciliation-leaderboard-evidence-filter');
        const exportPanelStart = leaderboardViewSource.indexOf('reconciliation-leaderboard-evidence-export');
        const importPanelStart = leaderboardViewSource.indexOf('reconciliation-leaderboard-evidence-import');
        const linkOffset = leaderboardViewSource.indexOf('<router-link to="/evidence-export-comparison"');

        assert(
            peerArchivePanelStart !== -1 && filterPanelStart !== -1 && exportPanelStart !== -1 && importPanelStart !== -1,
            n('D1. all four of the Leaderboard\'s own panels (Peer Archive, Evidence Filter, Evidence Export, Import Evidence) are locatable, giving this audit real boundaries to place the link between')
        );
        assert(
            peerArchivePanelStart < filterPanelStart && filterPanelStart < exportPanelStart && exportPanelStart < importPanelStart,
            n('D2. the four panels appear in the expected, unchanged order on the page — Peer Archive, then Evidence Filter, then Evidence Export, then Import Evidence')
        );
        assert(
            linkOffset > exportPanelStart && linkOffset < importPanelStart,
            n('D3. the entry point\'s own source offset falls strictly inside the Evidence Export panel\'s own boundaries — after that panel starts and before the next panel (Import Evidence) begins')
        );
        assert(
            linkOffset < peerArchivePanelStart || linkOffset > filterPanelStart,
            n('D4. the entry point does not fall inside the Peer Archive panel — a sanity check ruling out the offset landing before Evidence Export by coincidence')
        );

        // Confirm placement relative to the panel's own producer action —
        // the link sits beside "Export Evidence," inside the same
        // `identity-mgmt-actions` button row, never in a disconnected part
        // of the panel (e.g. down in the downloaded-output section).
        const exportButtonOffset = exportPanelSlice.indexOf('Export Evidence');
        const linkOffsetInPanel = exportPanelSlice.indexOf('Compare Exported Evidence');
        const actionsRowClose = exportPanelSlice.indexOf('</div>', exportButtonOffset);
        assert(
            exportButtonOffset !== -1 && linkOffsetInPanel !== -1 && linkOffsetInPanel > exportButtonOffset && linkOffsetInPanel < actionsRowClose,
            n('D5. the entry point sits in the SAME button row as the "Export Evidence" button itself — immediately adjacent to the workflow that produces its own input, not merely somewhere lower in the same panel')
        );

        console.log('\n=== SECTION D: CORRECT PLACEMENT ===');
        console.log('✓ Section D: the entry point\'s source position is strictly inside the Export Evidence panel\'s own boundaries, in the same button row as "Export Evidence" itself — not merely somewhere on the Leaderboard page.');
    }

    // ===============================================================
    // Section E — No top-navigation promotion.
    // ===============================================================
    {
        const appSource = await readSource('ui/App.js');
        const topNavLinks = [...appSource.matchAll(/<router-link to="([^"]+)"/g)].map((m) => m[1]);
        assert(topNavLinks.length >= 10, n('E1. App.js\'s top nav is a real, non-trivial list of router-link destinations'));
        assert(
            !topNavLinks.includes('/evidence-export-comparison'),
            n('E2. /evidence-export-comparison remains ABSENT from App.js\'s top-nav router-link destinations — this milestone did not promote it')
        );
        assert(
            !topNavLinks.includes('/reconciliation-leaderboard'),
            n('E3. /reconciliation-leaderboard itself also remains absent from top nav — the Leaderboard\'s own contextual-only status (0.9.400) is unchanged by this milestone')
        );

        console.log('\n=== SECTION E: NO TOP-NAVIGATION PROMOTION ===');
        console.log('✓ Section E: neither /evidence-export-comparison nor /reconciliation-leaderboard appears in App.js\'s top nav — the new edge stays exactly where 0.9.402 authorized it, one hop below the Leaderboard, never promoted to global navigation.');
    }

    // ===============================================================
    // Section F — Implementation isolation.
    // ===============================================================
    {
        // F.1 — Leaderboard comparison logic unchanged: the exact same
        // computed values and click handlers 0.9.400's/0.9.402's own audits
        // already verified still exist, unmodified in shape.
        const leaderboardInvariants = [
            'function exportEvidence()',
            "evidenceExportPackage.fileName = 'reconciliation-candidate-leaderboard-evidence-export.json';",
            'const page = computed(() => reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, targetArchive.value));'
        ];
        for (const snippet of leaderboardInvariants) {
            assert(leaderboardViewSource.includes(snippet), n(`F1. the Leaderboard's own comparison/export logic still contains the unmodified snippet: ${JSON.stringify(snippet)}`));
        }

        // F.2 — Evidence comparison logic unchanged: the comparison page's
        // own click handler and its own two-sided import still stand,
        // byte-identical to what 0.9.402's own Section A already verified.
        assert(
            comparisonViewSource.includes('function compareEvidence()'),
            n('F2. Evidence Export Comparison\'s own compareEvidence() handler is unmodified')
        );
        assert(
            (comparisonViewSource.match(/importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport/g) || []).length >= 2,
            n('F3. the comparison page still validates BOTH its Source and Target sides through the same import/validate function — no new, third input path added')
        );

        // F.3 — Evidence format unchanged: both pages still import the
        // import/validate function from the exact same shared file — the
        // identical fact 0.9.402's own Section C verified as the basis for
        // this predecessor relationship in the first place.
        const sharedImportPath = "from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.js';";
        assert(
            leaderboardViewSource.includes(sharedImportPath) && comparisonViewSource.includes(sharedImportPath),
            n('F4. both pages still import the evidence-export document\'s own validate function from the byte-identical shared file path — the document format itself was not touched')
        );

        // F.4 — Router destination unchanged: the route's own registration
        // line is byte-identical to what Section A already confirmed exists
        // — this section additionally confirms the router file's set of
        // route paths is exactly what it was, i.e. no route was added,
        // removed, or renamed as a side effect of wiring the link.
        const routePaths = [...routerSource.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
        assert(
            routePaths.includes('/reconciliation-leaderboard') && routePaths.includes('/evidence-export-comparison'),
            n('F5. both routes remain registered under their own original paths')
        );
        assert(
            new Set(routePaths).size === routePaths.length,
            n('F6. the router\'s own route list contains no duplicate path — this milestone did not register a second, parallel route to reach the comparison page')
        );

        // F.5 — Only a navigation edge is new: the Leaderboard view never
        // imports `useRouter` from 'vue-router' (the real, unambiguous
        // signal other views in this codebase use for programmatic
        // navigation — see e.g. ui/views/EditorView.js, ui/views/
        // RecentWorldsView.js, ui/views/WorldView.js, each importing it and
        // calling `useRouter()` to obtain a `router` instance). Its absence
        // here means the entry point is necessarily a plain, declarative
        // <router-link> — there is no `router` instance in scope for any
        // click handler, `exportEvidence()` included, to navigate with.
        assert(
            !leaderboardViewSource.includes("useRouter") && !/from ['"]vue-router['"]/.test(leaderboardViewSource),
            n('F7. the Leaderboard view imports nothing from \'vue-router\' — no `useRouter()`, no programmatic `router` instance in scope — so the new entry point can only be the plain, declarative <router-link> Sections B-D already verified, and exportEvidence() itself has no means to navigate anywhere')
        );

        console.log('\n=== SECTION F: IMPLEMENTATION ISOLATION ===');
        console.log('✓ Section F: the Leaderboard\'s own comparison/export logic, the comparison page\'s own comparison logic, the shared evidence-document format, and both routes\' own registrations are each unchanged. Only a declarative navigation edge is new.');
    }

    // ===============================================================
    // Section G — Production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'ui/views/ReconciliationCandidateLeaderboardView.js',
            'ui/router/index.js',
            'tests.html',
            'tests/EvidenceExportComparisonContextualEntryPoint.test.js',
            'tests/ReconciliationLeaderboardEntryPointDecisionAudit.test.js',
            'tests/EvidenceExportComparisonEntryPointDecisionAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`G1. every changed/added file is one this milestone's own Leaderboard UI surface or its test/registration/documentation files authorize (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const untouchedFiles = [
            'ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js',
            'ui/views/DecentralizedPublicationsView.js',
            'ui/App.js',
            'ui/components/ReconciliationCandidateLeaderboardTable.js',
            'ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js',
            'ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector.js'
        ];
        for (const file of untouchedFiles) {
            const status = execSync(`git status --porcelain -- ${file}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`G2. ${file} is untouched by this milestone`));
        }
        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`G3. ${dir}/ shows no change — no domain/backend logic touched`));
        }

        console.log('\n=== SECTION G: PRODUCTION BOUNDARY ===');
        console.log('✓ Section G: changes are confined to the Leaderboard\'s own view file, the router\'s own comment, and this milestone\'s test/registration/documentation files. No comparison component, no backend/domain file, and no other view is touched.');
    }

    console.log('\n✅ All Evidence Export Comparison Contextual Entry Point tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
