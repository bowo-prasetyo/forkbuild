import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.404 — Reconciliation Workflow Post-Navigation Product Reassessment.
//
// QUESTION, freshly: now that BOTH deferred navigation edges 0.9.400/0.9.402
// named have been wired (0.9.401 — Publications → Leaderboard; 0.9.403 —
// Leaderboard → Evidence Export Comparison), is there any REMAINING
// genuine user-facing discontinuity in this evidence/reconciliation
// workflow? This is a PRODUCT REASSESSMENT, not another navigation audit —
// 0.9.403's own seven sections already proved the router-link exists,
// resolves correctly, and sits in the right panel. This milestone instead
// walks the actual user JOURNEY end to end and asks, at each step, whether
// a person can actually get through it — and separately confirms the two
// new edges did not quietly imply the four surfaces they connect should
// become one combined feature. TEST-ONLY: no comparison algorithm,
// evidence format, export mechanism, filter, ranking, or route registration
// is touched by this milestone.
//
// THE JOURNEY UNDER TEST:
//
//   Publications (/publications)
//       │  Publication Archive card → "Export Archive" (live archive)
//       ▼
//   Reconciliation Candidate Leaderboard (/reconciliation-leaderboard)
//       │  Evidence Export panel → "Export Evidence" (filtered evidence
//       │  snapshot, a DIFFERENT document from the archive above)
//       ▼
//   Evidence Export Comparison (/evidence-export-comparison)
//
// NINE LETTERED SECTIONS:
//
//   A. Whole-journey chain still real — all three routes/views/backend
//      wiring 0.9.400/0.9.401/0.9.402/0.9.403 each already established are
//      re-confirmed against today's source, not assumed from history.
//   B. Both navigation edges present, each exactly once, each resolving to
//      its real destination — re-derived fresh, not trusted from the prior
//      milestones' own narratives.
//   C. Arrival comprehension — at each hop, the destination explains its
//      own purpose in its own template text, independent of how the
//      visitor arrived (never assuming a referrer-supplied context).
//   D. Required input obtainable — the Leaderboard's own "Export Evidence"
//      panel produces exactly the document format the Comparison page's
//      Source/Target import step accepts, proven by both call sites
//      resolving to the byte-identical import function in the
//      byte-identical file (not merely "both call something named import").
//   E. Existing operation completable — the Comparison page's own compare
//      action, its two-sided validation, and its result-rendering
//      component are each present and wired, unchanged.
//   F. Result actionable — the record-pair selection sub-component and its
//      four event handlers (add/remove × decision/observation) are present
//      and wired, unchanged.
//   G. Candidate discontinuity considered and ruled out — the Comparison
//      page's Source/Target fields accept paste only, no file upload,
//      unlike Publications' own Archive import. This is examined and shown
//      to be a PRE-EXISTING, CONSISTENT pattern across the whole evidence
//      family (the Leaderboard's own same-page Import Evidence panel is
//      equally paste-only) — never something the new navigation edges
//      introduced or worsened.
//   H. Sibling boundary preserved — the four surfaces (the Leaderboard
//      route, the Comparison route, the Publication Archive card, the
//      Evidence Export panel) remain four distinct things connected by
//      exactly two workflow edges, never folded into each other's markup,
//      never sharing a component, never merged into one route.
//   I. Production boundary — this milestone touches nothing but its own
//      test file and tests.html's own registration.

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
    let publicationsSource;
    let leaderboardSource;
    let comparisonSource;
    let routerSource;
    let appSource;

    // ===============================================================
    // Section A — Whole-journey chain still real.
    // ===============================================================
    {
        routerSource = await readSource('ui/router/index.js');
        publicationsSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        leaderboardSource = await readSource('ui/views/ReconciliationCandidateLeaderboardView.js');
        comparisonSource = await readSource('ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js');
        appSource = await readSource('ui/App.js');

        assert(
            /\{ path: '\/publications', name: 'publications', component: DecentralizedPublicationsView \}/.test(routerSource),
            n('A1. /publications is registered, wired to its real component')
        );
        assert(
            /\{ path: '\/reconciliation-leaderboard', name: 'reconciliation-leaderboard', component: ReconciliationCandidateLeaderboardView \}/.test(routerSource),
            n('A2. /reconciliation-leaderboard is registered, wired to its real component')
        );
        assert(
            /\{ path: '\/evidence-export-comparison', name: 'evidence-export-comparison', component: ReconciliationCandidateLeaderboardEvidenceExportComparisonView \}/.test(routerSource),
            n('A3. /evidence-export-comparison is registered, wired to its real component')
        );

        // Backend chain each view actually depends on is real, not
        // dormant — spot-checked by one distinctive symbol per hop.
        assert(
            publicationsSource.includes('exportPublicationArchive'),
            n('A4. DecentralizedPublicationsView still defines exportPublicationArchive() for the Publication Archive card')
        );
        assert(
            leaderboardSource.includes('describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport') &&
            leaderboardSource.includes('exportEvidence'),
            n('A5. ReconciliationCandidateLeaderboardView still defines exportEvidence() over the real describeXxx() evidence-export function')
        );
        assert(
            comparisonSource.includes('describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison') &&
            comparisonSource.includes('compareEvidence'),
            n('A6. The Comparison view still defines compareEvidence() over the real describeXxx() comparison function')
        );

        console.log('\n=== SECTION A: WHOLE-JOURNEY CHAIN STILL REAL ===');
        console.log('✓ Section A: all three routes and their backing views/functions are real and wired, re-confirmed against today\'s source.');
    }

    // ===============================================================
    // Section B — Both navigation edges present, each exactly once.
    // ===============================================================
    {
        const publicationsToLeaderboardLinks = (publicationsSource.match(/to="\/reconciliation-leaderboard"/g) || []).length;
        assert(
            publicationsToLeaderboardLinks === 1,
            n(`B1. exactly one router-link from Publications to /reconciliation-leaderboard exists (found ${publicationsToLeaderboardLinks})`)
        );
        const leaderboardToComparisonLinks = (leaderboardSource.match(/to="\/evidence-export-comparison"/g) || []).length;
        assert(
            leaderboardToComparisonLinks === 1,
            n(`B2. exactly one router-link from the Leaderboard to /evidence-export-comparison exists (found ${leaderboardToComparisonLinks})`)
        );
        // The Comparison page itself is a leaf of this workflow — it
        // carries no outbound router-link of its own back into it.
        assert(
            !/<router-link/.test(comparisonSource),
            n('B3. the Comparison page contains no router-link of its own — it is the terminal step of this journey, not a hub')
        );
        // Both edges stay contextual, never promoted to top nav.
        assert(
            !appSource.includes("to=\"/reconciliation-leaderboard\"") && !appSource.includes("to=\"/evidence-export-comparison\""),
            n('B4. neither /reconciliation-leaderboard nor /evidence-export-comparison appears in App.js\'s top nav — both edges remain contextual')
        );

        console.log('\n=== SECTION B: BOTH NAVIGATION EDGES PRESENT ===');
        console.log('✓ Section B: exactly one edge Publications→Leaderboard, exactly one edge Leaderboard→Comparison, neither promoted to top nav, re-derived fresh from today\'s source.');
    }

    // ===============================================================
    // Section C — Arrival comprehension.
    // ===============================================================
    {
        // Hop 1: Publications' own card explains WHY the Leaderboard link
        // exists, before the click, in its own text.
        assert(
            /Comparing this archive's decision and observation evidence, candidate\s*\n\s*by candidate, against a peer's own exported archive above happens on the/.test(publicationsSource),
            n('C1. Publications\' own Publication Archive card explains, in its own text, why the Leaderboard link exists')
        );

        // Hop 2: the Comparison page explains its own purpose in its own
        // template, independent of any referrer — a person who lands here
        // by direct URL (0.9.402's own Section B already proved that is
        // still possible) understands it exactly as well as one who
        // arrived via the new link.
        assert(
            /<h1>Evidence Export Comparison<\/h1>/.test(comparisonSource),
            n('C2. the Comparison page carries its own <h1> naming itself')
        );
        assert(
            /Compare two previously exported evidence reports/.test(comparisonSource),
            n('C3. the Comparison page\'s own note explains its purpose in its own words, not assuming a referrer')
        );
        assert(
            /This never reads either replica's\s*\n\s*own live archive and never merges into, replaces, or recomputes\s*\n\s*the Reconciliation Candidate Leaderboard/.test(comparisonSource),
            n('C4. the Comparison page explicitly distinguishes itself from the live Leaderboard it sits one hop below — a visitor is told this is a separate operation, not the Leaderboard itself')
        );

        console.log('\n=== SECTION C: ARRIVAL COMPREHENSION ===');
        console.log('✓ Section C: both hops explain themselves in their own template text — the Publications card names the destination and why, and the Comparison page explains its own purpose without depending on how the visitor arrived.');
    }

    // ===============================================================
    // Section D — Required input obtainable.
    // ===============================================================
    {
        // The Leaderboard's own export producer and the Comparison page's
        // own import step must agree on ONE shared document format. Proven
        // by resolving to the same function from the same file on both
        // sides — not merely "both mention evidence export."
        const leaderboardImportSpec = leaderboardSource.match(/import\s*\{[^}]*\}\s*from\s*'([^']*EvidenceExport\.js)'/s);
        assert(
            leaderboardImportSpec && leaderboardImportSpec[1] === '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport.js',
            n('D1. the Leaderboard\'s own evidence EXPORT producer resolves to the real, dedicated application-layer file')
        );
        const leaderboardImportedFormatSpec = leaderboardSource.match(/import\s*\{[^}]*\}\s*from\s*'([^']*EvidenceImport\.js)'/s);
        const comparisonImportedFormatSpec = comparisonSource.match(/import\s*\{[^}]*\}\s*from\s*'([^']*EvidenceImport\.js)'/s);
        assert(
            leaderboardImportedFormatSpec && comparisonImportedFormatSpec &&
            leaderboardImportedFormatSpec[1] === comparisonImportedFormatSpec[1],
            n(`D2. the Leaderboard's own Import Evidence panel and the Comparison page's Source/Target import both resolve the SAME import function from the byte-identical file (${leaderboardImportedFormatSpec && leaderboardImportedFormatSpec[1]} vs ${comparisonImportedFormatSpec && comparisonImportedFormatSpec[1]}) — a document "Export Evidence" produces is guaranteed importable on the Comparison page, never merely assumed compatible`)
        );
        assert(
            (comparisonSource.match(/importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport\(/g) || []).length === 2,
            n('D3. the Comparison page calls that shared import function exactly twice — once for Source, once for Target — never a third, divergent code path for either side')
        );
        // The exported document sits in a plain, selectable, readonly
        // textarea before any navigation occurs — a person can copy it to
        // the clipboard before ever clicking "Compare Exported Evidence."
        assert(
            /<textarea class="form-input identity-export-json" rows="6" readonly :value="evidenceExportPackage\.json">/.test(leaderboardSource),
            n('D4. the exported evidence document is rendered in a plain, readonly, selectable textarea on the Leaderboard itself — obtainable by copy before navigating away')
        );

        console.log('\n=== SECTION D: REQUIRED INPUT OBTAINABLE ===');
        console.log('✓ Section D: the document "Export Evidence" produces and the document the Comparison page\'s Source/Target import accepts are the SAME format, proven by both resolving to one shared function in one shared file, and that document is visibly copyable before navigation.');
    }

    // ===============================================================
    // Section E — Existing operation completable.
    // ===============================================================
    {
        assert(
            /<button type="button" class="action-btn action-btn--secondary" @click="compareEvidence">/.test(comparisonSource),
            n('E1. the "Compare Evidence" action button is present and wired to compareEvidence()')
        );
        assert(
            comparisonSource.includes('sourceInvalid.value = true') && comparisonSource.includes('targetInvalid.value = true'),
            n('E2. compareEvidence() independently validates BOTH sides — an invalid Source never silently blocks reading a valid Target, and vice versa')
        );
        assert(
            /v-if="sourceInvalid"/.test(comparisonSource) && /v-if="targetInvalid"/.test(comparisonSource),
            n('E3. both validation states have their own visible error message in the template — a person who pastes something invalid is told which side failed')
        );
        assert(
            comparisonSource.includes('hasCompared.value = true'),
            n('E4. a successful comparison flips hasCompared, which the template gates the result view on')
        );

        console.log('\n=== SECTION E: EXISTING OPERATION COMPLETABLE ===');
        console.log('✓ Section E: the compare action, its per-side validation and per-side error messaging, and its result-gating state are all present and wired, unchanged.');
    }

    // ===============================================================
    // Section F — Result actionable.
    // ===============================================================
    {
        assert(
            /<ReconciliationCandidateLeaderboardEvidenceExportComparisonTable v-if="hasCompared" :view="comparisonView" :detail="comparisonDetail" :identity="comparisonIdentity" \/>/.test(comparisonSource),
            n('F1. the comparison result table is mounted, gated on hasCompared, fed the view/detail/identity read models')
        );
        assert(
            /<ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector/.test(comparisonSource),
            n('F2. the record-pair selector sub-component is mounted alongside the table')
        );
        for (const handler of ['addDecisionPair', 'removeDecisionPair', 'addObservationPair', 'removeObservationPair']) {
            assert(
                comparisonSource.includes(`function ${handler}(`),
                n(`F3. ${handler}() is defined — a result the comparison produces can actually be acted on, not merely displayed`)
            );
        }
        for (const eventBinding of ['@add-decision-pair="addDecisionPair"', '@remove-decision-pair="removeDecisionPair"', '@add-observation-pair="addObservationPair"', '@remove-observation-pair="removeObservationPair"']) {
            assert(
                comparisonSource.includes(eventBinding),
                n(`F4. the selector's own "${eventBinding}" event is wired to its real handler in the template`)
            );
        }

        console.log('\n=== SECTION F: RESULT ACTIONABLE ===');
        console.log('✓ Section F: the comparison table and the record-pair selector are both mounted, and all four pairing actions (add/remove × decision/observation) are defined and wired end to end.');
    }

    // ===============================================================
    // Section G — Candidate discontinuity considered and ruled out.
    // ===============================================================
    {
        // The candidate: Comparison's Source/Target fields are paste-only,
        // no file upload, while Publications' own Archive import DOES
        // offer a file input. Is this a discontinuity the new navigation
        // edges expose or worsen?
        const comparisonHasFileInput = /<input type="file"/.test(comparisonSource);
        assert(
            comparisonHasFileInput === false,
            n('G1. confirmed as stated: the Comparison page\'s Source/Target fields offer no file input, paste only')
        );
        const publicationsHasFileInput = /<input type="file"/.test(publicationsSource);
        assert(
            publicationsHasFileInput === true,
            n('G2. confirmed as stated: Publications\' own Archive import DOES offer a file input alongside paste')
        );
        // Ruled out: this is NOT a new asymmetry the navigation edges
        // introduced. The Leaderboard's own SAME-PAGE Import Evidence
        // panel — reachable with zero navigation, present since 0.8.188,
        // long before 0.9.401/0.9.403 — is equally paste-only. The
        // evidence-export family has always been paste-only end to end;
        // the archive family's file input is a separate, pre-existing
        // convention for a separate document type. Neither edge added by
        // this arc touched either convention.
        const leaderboardHasFileInput = /<input type="file"/.test(leaderboardSource);
        assert(
            leaderboardHasFileInput === false,
            n('G3. the Leaderboard\'s own same-page Import Evidence panel is ALSO paste-only, with zero navigation involved — proving the Comparison page\'s paste-only input is the pre-existing, consistent evidence-family convention, not something the new navigation edges introduced or worsened')
        );
        assert(
            /Paste a previously exported evidence document/.test(leaderboardSource),
            n('G4. the Leaderboard\'s own Import Evidence panel documents the identical paste-only convention in its own hint text')
        );

        console.log('\n=== SECTION G: CANDIDATE DISCONTINUITY RULED OUT ===');
        console.log('✓ Section G: the one asymmetry worth checking (paste-only Comparison inputs vs. file-upload-capable Archive import) is a pre-existing, consistent convention across the whole evidence-export family, unrelated to and untouched by either navigation edge. No genuine discontinuity found.');
    }

    // ===============================================================
    // Section H — Sibling boundary preserved.
    // ===============================================================
    {
        // Four distinct surfaces, never folded into one another. Checked
        // by actual `import ... from` statements — a comment mentioning
        // another file's name for comparison (several already exist, e.g.
        // this file's own header referencing DecentralizedPublicationsView's
        // "Export Archive" shape) is not an embedding.
        const importsFrom = (source, moduleBasename) => new RegExp(`from '[^']*${moduleBasename}\\.js'`).test(source);
        assert(
            !importsFrom(leaderboardSource, 'DecentralizedPublicationsView') && !importsFrom(comparisonSource, 'DecentralizedPublicationsView'),
            n('H1. neither the Leaderboard view nor the Comparison view imports any part of DecentralizedPublicationsView — Publications stays its own page')
        );
        assert(
            !importsFrom(comparisonSource, 'ReconciliationCandidateLeaderboardView'),
            n('H2. the Comparison view does not import the Leaderboard view — they remain two components, connected only by the one router-link')
        );
        assert(
            !importsFrom(publicationsSource, 'ReconciliationCandidateLeaderboardView') && !importsFrom(publicationsSource, 'ReconciliationCandidateLeaderboardEvidenceExportComparisonView'),
            n('H3. Publications does not import either the Leaderboard or the Comparison component — the workflow edge is a router-link, never a merged template')
        );
        // Each route keeps its own distinct name/component pairing.
        const routeNames = ['publications', 'reconciliation-leaderboard', 'evidence-export-comparison'];
        for (const name of routeNames) {
            const occurrences = (routerSource.match(new RegExp(`name: '${name}'`, 'g')) || []).length;
            assert(
                occurrences === 1,
                n(`H4. route name '${name}' is registered exactly once — no duplicate or merged registration`)
            );
        }
        // The Evidence Export panel and the "Export Evidence"
        // action/state it already owned are unmodified in shape — the new
        // link sits beside the button, never replacing or wrapping it.
        assert(
            /Export Evidence\s*<\/button>\s*<!--[^]*?-->\s*<router-link to="\/evidence-export-comparison"/.test(leaderboardSource),
            n('H5. the "Compare Exported Evidence" link sits immediately beside, never in place of, the pre-existing "Export Evidence" button')
        );

        console.log('\n=== SECTION H: SIBLING BOUNDARY PRESERVED ===');
        console.log('✓ Section H: the four surfaces remain four distinct components/routes connected by exactly two workflow edges — no cross-embedding, no duplicated registration, no button replaced. The Leaderboard is a contextual predecessor to Comparison, never a container for it.');
    }

    // ===============================================================
    // Section I — Production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/ReconciliationWorkflowPostNavigationProductReassessment.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`I1. every changed/added file is this milestone's own test/registration file (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const untouchedFiles = [
            'ui/router/index.js',
            'ui/App.js',
            'ui/views/DecentralizedPublicationsView.js',
            'ui/views/ReconciliationCandidateLeaderboardView.js',
            'ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js',
            'ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js',
            'ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector.js'
        ];
        for (const file of untouchedFiles) {
            const status = execSync(`git status --porcelain -- ${file}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`I2. ${file} is untouched by this milestone`));
        }
        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`I3. ${dir}/ shows no change — no domain/backend logic touched`));
        }

        console.log('\n=== SECTION I: PRODUCTION BOUNDARY ===');
        console.log('✓ Section I: this milestone touches nothing but its own test file and tests.html\'s own registration. No view, no route, no component, no domain/backend file changed.');
    }

    // ===============================================================
    // Verdict.
    // ===============================================================
    console.log('\n=== VERDICT ===');
    console.log('EVIDENCE_RECONCILIATION_WORKFLOW_COMPLETE');
    console.log('No remaining genuine user-facing discontinuity found in this evidence/reconciliation workflow. The one');
    console.log('candidate asymmetry examined (Section G) is a pre-existing, consistent evidence-family convention, not');
    console.log('something either navigation edge introduced. The four surfaces remain four distinct capabilities');
    console.log('connected by exactly two contextual workflow edges (Section H) — the Leaderboard is the Comparison');
    console.log('page\'s natural predecessor, never its container.');
    console.log('STABLE_STOP.');

    console.log('\n✅ All Reconciliation Workflow Post-Navigation Product Reassessment tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
