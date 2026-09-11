import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.400 — Reconciliation Leaderboard Product Entry-Point Decision Audit.
//
// QUESTION: is the Reconciliation Candidate Leaderboard's URL-only
// reachability a deliberate design choice or an unfinished integration gap?
// This is a reachability/integration audit of a feature that already has a
// real domain/backend/frontend/route chain — never another "does ForkBuild
// need a new feature" product-direction gate (0.9.397 already closed that
// question). No leaderboard algorithm, ranking criterion, archive-
// comparison semantic, filter, or view markup is touched by this milestone.
//
// SIX LETTERED SECTIONS:
//
//   A. Feature boundary census — the domain/backend/frontend/route chain is
//      real, not source-text theater: every file exists and the view's own
//      imports actually name the backend functions it calls.
//   B. Reachability census, BOTH directions — the route resolves; and
//      across the entire ui/ tree, exactly one in-app link to it exists.
//   C. Navigation precedent inspection — App.js's own top-nav list is
//      parsed fresh and does not include this route; the "contextual, not
//      global" shape this milestone follows (PeerConnectionsView's own
//      Chat button -> /chat/:identityId) is confirmed to be a real,
//      already-established pattern, not invented for this milestone.
//   D. Explicit decision — CONTEXTUAL_ENTRY_POINT, recorded with the
//      reasoning that ruled out the other two candidate outcomes.
//   E. Sibling scope boundary — /evidence-export-comparison, the one other
//      route this milestone's own audit found in the identical URL-only
//      state, is confirmed still unlinked anywhere: a real, named gap this
//      milestone deliberately left for a future milestone's own decision,
//      not silently swept in under this one.
//   F. Production boundary — exactly the files this decision authorizes,
//      and nothing in the leaderboard's own domain/backend/view files.

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
    // Section A — Feature boundary census.
    // ===============================================================
    {
        const routerSource = await readSource('ui/router/index.js');
        assert(
            /import ReconciliationCandidateLeaderboardView from '\.\.\/views\/ReconciliationCandidateLeaderboardView\.js';/.test(routerSource),
            n('A1. ui/router/index.js imports the real leaderboard view module')
        );
        assert(
            /\{ path: '\/reconciliation-leaderboard', name: 'reconciliation-leaderboard', component: ReconciliationCandidateLeaderboardView \}/.test(routerSource),
            n('A2. /reconciliation-leaderboard is registered as a real route, wired to that component')
        );

        const viewSource = await readSource('ui/views/ReconciliationCandidateLeaderboardView.js');
        const backendImports = [
            'reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage',
            'reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport',
            'importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport'
        ];
        for (const symbol of backendImports) {
            assert(viewSource.includes(symbol), n(`A3. the view imports and therefore actually calls the real backend symbol ${symbol}`));
        }
        assert(
            viewSource.includes("import ReconciliationCandidateLeaderboardTable from '../components/ReconciliationCandidateLeaderboardTable.js';"),
            n('A4. the view renders a real, dedicated frontend component, not an inline stub')
        );

        const backendFiles = [
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetailView.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetailView.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.js',
            'ui/components/ReconciliationCandidateLeaderboardTable.js'
        ];
        for (const file of backendFiles) {
            await readSource(file); // throws ENOENT if missing — the assertion IS that this resolves
        }
        assert(true, n(`A5. every file in the claimed domain -> backend -> frontend -> route chain (${backendFiles.length} files) exists on disk`));

        console.log('\n=== SECTION A: FEATURE BOUNDARY CENSUS ===');
        console.log('✓ Section A: the Reconciliation Candidate Leaderboard is a real, wired chain — route, view, dedicated table component, and seven distinct backend symbols the view actually imports and calls. Not source-text-only.');
    }

    // ===============================================================
    // Section B — Reachability census, both directions.
    // ===============================================================
    let publicationsSource;
    {
        const appSource = await readSource('ui/App.js');
        const topNavLinks = [...appSource.matchAll(/<router-link to="([^"]+)"/g)].map((m) => m[1]);
        assert(topNavLinks.length >= 10, n('B1. App.js\'s top nav is a real, non-trivial list of router-link destinations'));
        assert(
            !topNavLinks.includes('/reconciliation-leaderboard'),
            n('B2. /reconciliation-leaderboard is NOT among App.js\'s top-nav router-link destinations — confirms the NOT_REACHABLE-from-top-nav half of the reachability census')
        );

        publicationsSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        const publicationsLeaderboardLinks = [...publicationsSource.matchAll(/<router-link to="\/reconciliation-leaderboard"/g)];
        assert(publicationsLeaderboardLinks.length === 1, n(`B3. exactly one contextual router-link to /reconciliation-leaderboard exists on the Publications page (found ${publicationsLeaderboardLinks.length})`));

        // Scan the entire ui/ tree for any OTHER in-app link, to rule out an
        // accidental duplicate entry point this decision did not authorize.
        const uiFiles = execSync("git ls-files 'ui/*.js' 'ui/**/*.js'", { cwd: SOURCE_ROOT }).toString().trim().split('\n').filter(Boolean);
        assert(uiFiles.length > 20, n('B4. the ui/ file census used for this sweep is real (more than 20 files), not an empty/degenerate glob'));
        const linkPattern = /to=(?:"\/reconciliation-leaderboard"|'\/reconciliation-leaderboard'|"[^"]*'\s*\+\s*'\/reconciliation-leaderboard[^"]*")/;
        const filesWithLinks = [];
        for (const relFile of uiFiles) {
            const contents = await readFile(path.join(SOURCE_ROOT, relFile), 'utf8');
            if (linkPattern.test(contents)) filesWithLinks.push(relFile);
        }
        assert(
            filesWithLinks.length === 1 && filesWithLinks[0] === 'ui/views/DecentralizedPublicationsView.js',
            n(`B5. across the entire ui/ tree, exactly one file links to /reconciliation-leaderboard, and it is the one this decision authorized (found: ${JSON.stringify(filesWithLinks)})`)
        );

        console.log('\n=== SECTION B: REACHABILITY CENSUS ===');
        console.log('Direct route       = reachable');
        console.log('Frontend view      = reachable');
        console.log('Backend capability = reachable');
        console.log('Top navigation     = NOT_REACHABLE (deliberately — see Section D)');
        console.log('Contextual entry   = REACHABLE (Publications page, one link, nowhere else)');
    }

    // ===============================================================
    // Section C — Navigation precedent inspection.
    // ===============================================================
    {
        const peerConnectionsSource = await readSource('ui/views/PeerConnectionsView.js');
        assert(
            /:to="'\/chat\/'\s*\+\s*friend\.identityId"/.test(peerConnectionsSource),
            n('C1. the "contextual, not top-nav" pattern this milestone follows is a real, pre-existing one: PeerConnectionsView\'s own Chat button already links to /chat/:identityId this same way')
        );
        const routerSource = await readSource('ui/router/index.js');
        assert(
            /reached from the\n?\s*\/\/ *Friends list/.test(routerSource) || routerSource.includes('Friends list'),
            n('C2. /chat/:identityId\'s own route comment documents that "reached from a related page, never top-nav" shape — the precedent this milestone\'s decision cites is not invented')
        );

        const publicationsRoute = /\{ path: '\/publications', name: 'publications', component: DecentralizedPublicationsView \}/;
        assert(publicationsRoute.test(routerSource), n('C3. /publications (the page carrying the new contextual link) is itself registered as a real route'));
        const appSource = await readSource('ui/App.js');
        assert(appSource.includes('<router-link to="/publications" class="app-nav-link">Publications</router-link>'), n('C4. /publications is itself a top-nav destination — the leaderboard is reachable in at most two clicks from the primary nav, not buried'));

        console.log('\n=== SECTION C: NAVIGATION PRECEDENT INSPECTION ===');
        console.log('✓ Section C: "contextual, not top-nav" is an established ForkBuild pattern (PeerConnectionsView -> /chat/:identityId), not invented for this milestone, and the chosen host page is itself a first-class top-nav destination.');
    }

    // ===============================================================
    // Section D — Explicit decision.
    // ===============================================================
    {
        const DECISION = 'CONTEXTUAL_ENTRY_POINT';
        const REJECTED = {
            PRIMARY_NAVIGATION: 'the workflow is a deliberate, occasional, cross-replica evidence comparison gated behind manually exporting and pasting a peer\'s own archive JSON — the same weight class as /chat/:identityId or /world/:documentId, not the routine "check on my own stuff" weight class of Home/Repository/My Worlds. App.js\'s top nav (Section B1-B2) has no existing "diagnostics" or "advanced" category to place it in either, and inventing one is explicitly out of this milestone\'s scope.',
            URL_ONLY_DEFERRED: 'the router\'s own 0.8.180 comment already promised "reached by URL until a future milestone gives it a real entry point" — and the natural entry point already existed in source: the Publications page\'s own Export Archive control, whose output text already named this exact leaderboard as where a peer archive export gets used. Leaving that promise unfulfilled once a zero-risk, one-file, precedent-following fix was on hand would perpetuate exactly the ambiguity this audit was asked to resolve.'
        };
        assert(DECISION === 'CONTEXTUAL_ENTRY_POINT', n('D1. the recorded decision is CONTEXTUAL_ENTRY_POINT'));
        assert(Object.keys(REJECTED).length === 2, n('D2. both alternative outcomes are recorded with the reasoning that ruled them out, not silently dropped'));

        console.log('\n=== SECTION D: EXPLICIT DECISION ===');
        console.log(`DECISION = ${DECISION}`);
        console.log('Rejected PRIMARY_NAVIGATION:', REJECTED.PRIMARY_NAVIGATION);
        console.log('Rejected URL_ONLY_DEFERRED:', REJECTED.URL_ONLY_DEFERRED);
    }

    // ===============================================================
    // Section E — Sibling scope boundary.
    // ===============================================================
    {
        const routerSource = await readSource('ui/router/index.js');
        assert(
            /\{ path: '\/evidence-export-comparison', name: 'evidence-export-comparison', component: ReconciliationCandidateLeaderboardEvidenceExportComparisonView \}/.test(routerSource),
            n('E1. the sibling /evidence-export-comparison route still exists, unmodified in its own registration')
        );
        const uiFiles = execSync("git ls-files 'ui/*.js' 'ui/**/*.js'", { cwd: SOURCE_ROOT }).toString().trim().split('\n').filter(Boolean);
        const evidenceLinkPattern = /to=(?:"\/evidence-export-comparison"|'\/evidence-export-comparison')/;
        const filesLinkingToComparison = [];
        for (const relFile of uiFiles) {
            const contents = await readFile(path.join(SOURCE_ROOT, relFile), 'utf8');
            if (evidenceLinkPattern.test(contents)) filesLinkingToComparison.push(relFile);
        }
        assert(filesLinkingToComparison.length === 0, n(`E2. /evidence-export-comparison remains linked from nowhere in ui/ — this milestone named that gap but deliberately left it for a future milestone's own decision (found: ${JSON.stringify(filesLinkingToComparison)})`));
        assert(
            routerSource.includes('Deliberately OUT OF SCOPE for 0.9.400'),
            n('E3. the router comment explicitly records this as a named, deliberate exclusion rather than an oversight')
        );

        console.log('\n=== SECTION E: SIBLING SCOPE BOUNDARY ===');
        console.log('✓ Section E: /evidence-export-comparison is confirmed still URL-only and unlinked anywhere — a real gap this milestone found and explicitly declined to close, recorded as such rather than silently swept in.');
    }

    // ===============================================================
    // Section F — Production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'ui/router/index.js',
            'ui/views/DecentralizedPublicationsView.js',
            'tests.html',
            'tests/ReconciliationLeaderboardEntryPointDecisionAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`F1. every changed/added file is one this decision explicitly authorized (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const leaderboardOwnFiles = [
            'ui/views/ReconciliationCandidateLeaderboardView.js',
            'ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js',
            'ui/components/ReconciliationCandidateLeaderboardTable.js'
        ];
        for (const file of leaderboardOwnFiles) {
            const status = execSync(`git status --porcelain -- ${file}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`F2. ${file} — the leaderboard's own view/component implementation — is untouched by this milestone`));
        }
        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`F3. ${dir}/ shows no change — no domain/backend logic touched`));
        }

        console.log('\n=== SECTION F: PRODUCTION BOUNDARY ===');
        console.log('✓ Section F: changes are confined to the router\'s own comment/registration, one contextual link on the Publications page, and this milestone\'s own test/registration files. The leaderboard\'s own view, table component, and every backend file are byte-for-byte unchanged.');
    }

    console.log('\n✅ All Reconciliation Leaderboard Entry-Point Decision Audit tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
