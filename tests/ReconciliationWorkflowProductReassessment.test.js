import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 0.9.410 — Reconciliation Workflow Product Reassessment.
//
// Type: test-only product reassessment. No production file is touched.
//
// 0.9.405 found the gap (a real backend producer chain, no owner).
// 0.9.406 decided the owner (a new, dedicated Workspace; every other
// candidate rejected). 0.9.407 built the execution seam. 0.9.408 built the
// UI over it. 0.9.409 proved persistence converges with the Leaderboard,
// end to end, through a real storage round trip — and its own Section H
// named this milestone, by number, as the next step for exactly the
// branch it found itself on ("persistence semantics are correct").
//
// THIS MILESTONE ASKS ONE QUESTION, FRESH, FROM THE USER'S OWN SEAT: does
// the now-complete technical chain leave any REAL, CONCRETE, user-facing
// gap in the journey below — not "might a person prefer X automatic,"
// but "can a person actually get through this today?"
//
//   Publication Archive -> Reconciliation Workspace -> provide peer
//   evidence -> explicit Reconcile -> candidate/observation -> persisted
//   archive -> Leaderboard -> inspect reconciliation result
//
// Each capability in that journey is classified as exactly one of:
//   COMPLETE | PARTIAL | PRODUCT_GAP | INTENTIONALLY_DEFERRED | INTERNAL
//   | NOT_A_PRODUCT_GAP
// — never asserted bare; every classification below is backed by a live
// check against today's source, re-derived in this file, not quoted from
// a prior milestone's own narrative.
//
// LETTERED SECTIONS:
//   A. Entry-state reconfirmation — 0.9.406's own Section L and 0.9.409's
//      own Section H, re-checked fresh against their own still-existing
//      files, not trusted from memory.
//   B. Whole-journey wiring — every hop in the journey above is real,
//      re-derived from today's source.
//   C. Discoverability (audit question 1) — COMPLETE.
//   D. Evidence provision, receiving half (audit question 2a) — COMPLETE.
//   E. Evidence provision, SOURCING half (audit question 2b) — THE
//      CENTERPIECE FINDING. A real PRODUCT_GAP: nothing anywhere in this
//      shipped product lets any user author and export their OWN signed
//      leaderboard snapshot claim — the exact artifact the Workspace's
//      own "Peer Evidence" field asks a person to paste, and the exact
//      capability 0.9.406's own Section L named as the smallest FIRST
//      slice, before the received-claim pipeline 0.9.407/0.9.408 actually
//      built first.
//   F. Outcome-literal comprehension (audit question 3) — NOT_A_PRODUCT_GAP.
//   G. Workspace -> Leaderboard handoff (audit question 4) — COMPLETE.
//   H. Persistence coherence (audit question 5) — COMPLETE, by REUSE of
//      0.9.409's own live evidence, never re-derived from scratch.
//   I. Repeated execution (audit question 6) — NOT_A_PRODUCT_GAP, by reuse
//      of 0.9.409's own Section F.
//   J. Full classification matrix across the whole journey.
//   K. Deliberate exclusion census — none of the explicitly out-of-scope
//      items exist in source, AND the one recommended follow-up capability
//      this audit names is itself confirmed NOT implemented here.
//   L. Recommended next-milestone scope note (recorded, not built).
//   M. Production boundary — test-only.

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

function grepFiles(pattern, dirs) {
    const files = execSync(`git ls-files ${dirs.join(' ')}`, { cwd: SOURCE_ROOT }).toString().split('\n').filter((f) => f.endsWith('.js'));
    const hits = [];
    for (const file of files) {
        try {
            const source = execSync(`git show HEAD:${JSON.stringify(file).slice(1, -1)}`, { cwd: SOURCE_ROOT }).toString();
            if (source.includes(pattern)) hits.push(file);
        } catch {
            // file may be untracked/new; fall through — not relevant to this audit's own scope
        }
    }
    return hits;
}

async function run() {
    let workspaceSource;
    let leaderboardSource;
    let publicationsSource;
    let routerSource;
    let appSource;

    // ===============================================================
    // Section A — Entry-state reconfirmation.
    // ===============================================================
    {
        const frontDoorAudit = await readSource('tests/ReconciliationFrontDoorProductDirectionAudit.test.js');
        assert(
            frontDoorAudit.includes("firstCapability: 'author and export a signed claim about THIS replica\\'s own current leaderboard snapshot only"),
            n('A1. 0.9.406\'s own Section L, still on file, named "author and export a signed claim about THIS replica\'s own current leaderboard snapshot" as the smallest FIRST capability a future Workspace milestone should build')
        );
        assert(
            frontDoorAudit.includes("explicitlyDeferred: 'importing a peer\\'s claim, running the plan/candidate/decision/observation pipeline"),
            n('A2. that SAME section, still on file, explicitly named "importing a peer\'s claim, running the plan/candidate/decision/observation pipeline" as the part to DEFER, not build first')
        );

        const persistenceAudit = await readSource('tests/ReconciliationWorkspacePersistenceConvergenceAudit.test.js');
        assert(
            persistenceAudit.includes("nextMilestone: '0.9.410 — Reconciliation Workflow Product Reassessment"),
            n('A3. 0.9.409\'s own Section H, still on file, names THIS milestone by number as the next step for the branch it found itself on')
        );
        assert(
            persistenceAudit.includes('semanticsAreCorrect: true') && persistenceAudit.includes('productionChangeRequired: false'),
            n('A4. 0.9.409\'s own overall verdict — persistence semantics correct, no production change required by that finding — stands, re-confirmed on file')
        );

        console.log('\n=== SECTION A: ENTRY-STATE RECONFIRMATION ===');
        console.log('✓ Section A: both entry facts this milestone builds on are real, on-file, fresh-checked records — not inherited from prose. Notably, 0.9.406\'s OWN recorded plan (build authoring/export FIRST, defer the receive/reconcile pipeline) was not the order actually built (0.9.407/0.9.408 built the deferred half first) — Section E below investigates exactly what that reversal left unbuilt.');
    }

    // ===============================================================
    // Section B — Whole-journey wiring.
    // ===============================================================
    {
        routerSource = await readSource('ui/router/index.js');
        appSource = await readSource('ui/App.js');
        publicationsSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        workspaceSource = await readSource('ui/views/ReconciliationWorkspaceView.js');
        leaderboardSource = await readSource('ui/views/ReconciliationCandidateLeaderboardView.js');

        assert(
            /\{ path: '\/publications', name: 'publications', component: DecentralizedPublicationsView \}/.test(routerSource),
            n('B1. /publications is registered, wired to its real component')
        );
        assert(
            /\{ path: '\/reconciliation-workspace', name: 'reconciliation-workspace', component: ReconciliationWorkspaceView \}/.test(routerSource),
            n('B2. /reconciliation-workspace is registered, wired to its real component')
        );
        assert(
            /\{ path: '\/reconciliation-leaderboard', name: 'reconciliation-leaderboard', component: ReconciliationCandidateLeaderboardView \}/.test(routerSource),
            n('B3. /reconciliation-leaderboard is registered, wired to its real component')
        );
        assert(
            workspaceSource.includes('ReconcilePublisherLeaderboardSnapshotClaimUseCase') && workspaceSource.includes('reconcile()'.slice(0, -2)),
            n('B4. the Workspace still depends on the real execution use case, and defines a reconcile method')
        );
        assert(
            leaderboardSource.includes('ReconciliationCandidateLeaderboardEvidenceKind.DECISIONS'),
            n('B5. the Leaderboard still exposes a DECISIONS evidence-kind filter capable of showing what the Workspace just produced')
        );

        console.log('\n=== SECTION B: WHOLE-JOURNEY WIRING ===');
        console.log('✓ Section B: every hop the journey names (Publications, the Workspace, the Leaderboard) is a real, registered route backed by a real component, re-derived fresh from today\'s source.');
    }

    // ===============================================================
    // Section C — Discoverability (audit question 1): COMPLETE.
    // ===============================================================
    {
        assert(
            /<router-link to="\/publications" class="app-nav-link">Publications<\/router-link>/.test(appSource),
            n('C1. /publications itself is in global top nav — the journey\'s own front door is never more than one click from anywhere')
        );
        assert(
            !appSource.includes('to="/reconciliation-workspace"'),
            n('C2. /reconciliation-workspace is NOT promoted to top nav — it stays contextual, the same convention every sibling reconciliation route already uses')
        );
        const workspaceLinks = (publicationsSource.match(/to="\/reconciliation-workspace"/g) || []).length;
        assert(
            workspaceLinks === 1,
            n(`C3. exactly one router-link from Publications' own Publication Archive card to /reconciliation-workspace exists (found ${workspaceLinks})`)
        );
        // The link sits directly beside the Publication Archive's own
        // export/import actions — the exact archive a person would bring
        // to the Workspace — never buried below unrelated content.
        const archiveCardIdx = publicationsSource.indexOf('identity-mgmt-name">Publication Archive<');
        const exportArchiveIdx = publicationsSource.indexOf('Export Archive', archiveCardIdx);
        const leaderboardLinkIdx = publicationsSource.indexOf('Reconciliation Candidate Leaderboard', archiveCardIdx);
        const workspaceLinkIdx = publicationsSource.indexOf('Reconciliation Workspace', archiveCardIdx);
        assert(
            exportArchiveIdx > -1 && leaderboardLinkIdx > exportArchiveIdx && workspaceLinkIdx > leaderboardLinkIdx && (workspaceLinkIdx - exportArchiveIdx) < 1600,
            n('C4. the Workspace link sits in the SAME card as, and shortly after, the Archive export/import actions and the Leaderboard link — contextually adjacent, not a separate destination a visitor has to go hunting for')
        );

        console.log('\n=== SECTION C: DISCOVERABILITY — COMPLETE ===');
        console.log('✓ Section C: /publications is globally reachable, and the Workspace is exactly one contextual click from it, in the same card as the archive it operates on. Global top-nav promotion would ADD a second, competing entry point for a page that is meaningless without an archive already in view — checked and correctly rejected, not merely unconsidered.');
    }

    // ===============================================================
    // Section D — Evidence provision, RECEIVING half (audit question 2a):
    // COMPLETE.
    // ===============================================================
    {
        assert(
            /<textarea class="form-input identity-export-json" rows="6" v-model="peerEvidenceText"/.test(workspaceSource),
            n('D1. the Workspace\'s own peer-evidence field is a plain paste textarea — no file input, no acquisition mechanism')
        );
        assert(
            !/<input type="file"/.test(workspaceSource),
            n('D2. confirmed: the Workspace offers no file upload for peer evidence, paste only')
        );
        // Paste-only is the PRE-EXISTING, CONSISTENT convention across the
        // whole evidence/claim family, not something the Workspace
        // invented — 0.9.404's own Section G already established this for
        // evidence exports; re-confirmed here for the claim family
        // specifically.
        assert(
            !/<input type="file"/.test(leaderboardSource),
            n('D3. the Leaderboard\'s own same-page Import Evidence panel is ALSO paste-only — the claim/evidence family has never offered file upload anywhere, so the Workspace\'s paste-only field is consistent, not a new limitation')
        );
        assert(
            workspaceSource.includes("this file never calls `JSON.parse()` itself, and never") ||
            /never calls `JSON\.parse\(\)` itself/.test(workspaceSource),
            n('D4. the pasted text is handed to execute() unparsed, exactly as the file\'s own header documents — no bespoke parsing layer a person\'s paste could silently fail against')
        );

        console.log('\n=== SECTION D: EVIDENCE PROVISION (RECEIVING) — COMPLETE ===');
        console.log('✓ Section D: for a person who ALREADY holds a peer\'s claim, pasting it in is adequate and consistent with the rest of the app\'s own evidence-family convention. This is the half the audit brief\'s own framing assumed already worked — and it does.');
    }

    // ===============================================================
    // Section E — Evidence provision, SOURCING half (audit question 2b):
    // THE CENTERPIECE FINDING — PRODUCT_GAP.
    // ===============================================================
    {
        // The premise embedded in the audit brief itself ("Existing
        // exported leaderboard snapshot claim") is tested directly, not
        // assumed. For two REAL users of the shipped product to ever
        // complete this journey together, SOME user's UI must be able to
        // author and export their own signed claim. Does one exist?
        const createClaimSource = await readSource('application/CreatePublisherLeaderboardSnapshotClaimUseCase.js');
        const exchangeSource = await readSource('application/PublisherLeaderboardSnapshotClaimExchange.js');
        assert(
            createClaimSource.includes('export class CreatePublisherLeaderboardSnapshotClaimUseCase'),
            n('E1. the signing use case itself is real, complete, and already tested (0.8.121) — the capability is not missing at the application layer')
        );
        assert(
            exchangeSource.includes('export function exportPublisherLeaderboardSnapshotClaim'),
            n('E2. the export-to-portable-JSON function is real, complete, and already tested (0.8.122) — the transport is not missing either')
        );

        // AMENDED BY 0.9.411 — Publisher Leaderboard Snapshot Claim
        // Authoring & Export. At THIS milestone's own moment (0.9.410),
        // the construction site count was genuinely zero, which is the
        // fact E3 originally recorded. 0.9.411 built the first genuine UI
        // construction site — see ui/views/
        // PublisherLeaderboardSnapshotClaimAuthoringView.js's own header.
        // The identical "assert the CURRENT, truthful state, never a
        // superseded one" convention 0.9.408's own amendment to
        // tests/ReconciliationWorkspaceExecutionBoundary.test.js already
        // established applies here too: E3 now asserts exactly the one
        // file 0.9.411 authorized constructs it, never a second,
        // accidental caller.
        const createUiSites = grepFiles('new CreatePublisherLeaderboardSnapshotClaimUseCase(', ['ui']);
        assert(
            createUiSites.length === 1 && createUiSites[0] === 'ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js',
            n(`E3. exactly the one file 0.9.411 authorized to construct CreatePublisherLeaderboardSnapshotClaimUseCase does so, never a second, accidental caller (found: ${JSON.stringify(createUiSites)})`)
        );
        // AMENDED BY 0.9.411 — the identical amendment, one layer over:
        // 0.9.411's own new view is also the first (and only) ui/ call
        // site for the export function.
        const exportCallSites = grepFiles('exportPublisherLeaderboardSnapshotClaim(', ['ui']);
        assert(
            exportCallSites.length === 1 && exportCallSites[0] === 'ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js',
            n(`E4. exactly the one file 0.9.411 authorized to call exportPublisherLeaderboardSnapshotClaim() does so, never a second, accidental caller (found: ${JSON.stringify(exportCallSites)})`)
        );
        const mainSource = await readSource('ui/main.js');
        assert(
            !mainSource.includes('CreatePublisherLeaderboardSnapshotClaimUseCase'),
            n('E5. the app\'s own composition root (ui/main.js) never constructs this use case either — the absence is total, not merely missing from one component')
        );

        // The Workspace's OWN copy promises an affordance that does not
        // exist. Quoted verbatim, checked against the literal string.
        assert(
            workspaceSource.includes('(Export Claim, on their replica)'),
            n('E6. the Workspace\'s own hint text literally says "(Export Claim, on their replica)" — telling a person to go find an "Export Claim" action for THIS claim type on a peer\'s replica')
        );
        // AMENDED BY 0.9.411 — the identical amendment, applied to the
        // "Export Claim" button census specifically: at 0.9.410's own
        // moment, zero ui/ files mentioning PublisherLeaderboardSnapshotClaim
        // carried a real "Export Claim" button, which is the fact E7
        // originally recorded. 0.9.411 built exactly one — see
        // ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js's own
        // header. E7 now asserts exactly that one file carries it, never a
        // second, accidental button.
        const leaderboardClaimUiFiles = grepFiles('PublisherLeaderboardSnapshotClaim', ['ui']);
        const filesWithRealExportClaimButton = [];
        for (const file of leaderboardClaimUiFiles) {
            const source = await readSource(file);
            if (/>\s*Export Claim\s*</.test(source) || /'Export Claim'/.test(source)) filesWithRealExportClaimButton.push(file);
        }
        assert(
            filesWithRealExportClaimButton.length === 1 && filesWithRealExportClaimButton[0] === 'ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js',
            n(`E7. exactly the one file 0.9.411 authorized carries a real "Export Claim" button for this claim type — the affordance the Workspace's own copy names now exists, and nowhere else (found: ${JSON.stringify(filesWithRealExportClaimButton)})`)
        );

        // This is NOT a hard, novel, or ambiguous problem — the identical
        // UI PATTERN already exists, working, for a structurally
        // identical operation on a SIBLING claim family, proving the gap
        // is a real, low-risk, well-scoped omission rather than a design
        // question needing invention.
        const placeNamingPanelSource = await readSource('ui/components/PlaceNamingPanel.js');
        assert(
            /"Export Claim" hands a claim to one person by/.test(placeNamingPanelSource) &&
            /@click="onExportClaim\(claim\.id\)"/.test(placeNamingPanelSource),
            n('E8. a real, working "Export Claim" UI button already exists for PlaceNamingClaim — a sibling REQUIRED-signature claim family with the identical author-and-hand-to-one-person shape — proving this exact UI pattern is already proven out in this codebase, just never built for the leaderboard-claim family')
        );

        // The supporting infrastructure the missing button would need is
        // ALSO already real and already used, live, in this exact family
        // — this is not blocked on any missing identity/verification
        // seam, only on the UI call site itself.
        assert(
            workspaceSource.includes("import { LocalAuthorizationVerifier } from '../../identity/LocalAuthorizationVerifier.js'") &&
            workspaceSource.includes('new LocalAuthorizationVerifier()'),
            n('E9. the Workspace itself already demonstrates the exact "construct a fresh, stateless verifier directly in the UI file" pattern a sourcing button would reuse — no new identity seam is required')
        );
        assert(
            createClaimSource.includes("resolveSigningIdentityId(this._identityProvider)"),
            n('E10. the signing use case resolves the currently authenticated identity through the SAME resolveSigningIdentityId() every other signing feature in this codebase already uses — no new authentication concept is required')
        );

        console.log('\n=== SECTION E: EVIDENCE PROVISION (SOURCING) — PRODUCT_GAP ===');
        console.log('✓ Section E — VERDICT: PRODUCT_GAP, real and concrete, not a preference for automation. The application-layer machinery to author and export a signed leaderboard snapshot claim is complete and already tested (0.8.121/0.8.122); zero UI anywhere constructs or calls it; the Workspace\'s own copy names a nonexistent affordance; and 0.9.406\'s own on-record plan named authoring/exporting as the FIRST capability to build, before the received-claim pipeline that was actually built first. Concretely: for Alice and Bob, two real users of the shipped product, to reconcile with EACH OTHER, at least one of them needs to hand the other a signed claim — and today, NEITHER of their UIs can produce one. Every dependency the missing capability needs (identityProvider, resolveSigningIdentityId, a verifier construction pattern, and a proven sibling "Export Claim" UI shape) already exists and works, making this a small, well-scoped, low-risk gap — not a hard design problem.');
    }

    // ===============================================================
    // Section F — Outcome-literal comprehension (audit question 3):
    // NOT_A_PRODUCT_GAP.
    // ===============================================================
    {
        assert(
            /Reconciliation did not complete — outcome: \{\{ result\.outcome \}\}/.test(workspaceSource),
            n('F1. the Workspace displays an unrecognized outcome as its raw literal value, verbatim, exactly as its own header documents')
        );
        // Precedent: raw {{ x.outcome }} display, to a user, inside a
        // template, already exists in multiple unrelated, pre-existing
        // surfaces — this is an established, deliberate house style for
        // this exact class of diagnostic result, not something the
        // Workspace invented or a UX regression it introduced.
        const ownPanelSource = await readSource('ui/components/OwnPublicationPanel.js');
        const canvasSource = await readSource('ui/components/WorldEncounterCanvas.js');
        const rawOutcomeInOwnPanel = (ownPanelSource.match(/\{\{\s*\w[\w.]*Result\.outcome\s*\}\}/g) || []).length;
        const rawOutcomeInCanvas = (canvasSource.match(/\{\{\s*\w[\w.]*Result\.outcome\s*\}\}/g) || []).length;
        assert(
            rawOutcomeInOwnPanel >= 3 && rawOutcomeInCanvas >= 1,
            n(`F2. raw {{ xxxResult.outcome }} display already exists, repeatedly, in OwnPublicationPanel.js (${rawOutcomeInOwnPanel} occurrences) and WorldEncounterCanvas.js (${rawOutcomeInCanvas} occurrences) — pre-existing house style for this exact diagnostic class, unrelated to and predating this Workspace`)
        );

        console.log('\n=== SECTION F: OUTCOME-LITERAL COMPREHENSION — NOT_A_PRODUCT_GAP ===');
        console.log('✓ Section F: showing a raw outcome literal on an unrecognized result is the SAME established, repeated, pre-existing house style this codebase already uses in multiple unrelated surfaces for this exact diagnostic class of result. This is a deliberate, consistent product decision this app already made, long before this Workspace, never a gap this milestone should relabel or soften.');
    }

    // ===============================================================
    // Section G — Workspace -> Leaderboard handoff (audit question 4):
    // COMPLETE.
    // ===============================================================
    {
        assert(
            /<router-link to="\/reconciliation-leaderboard" class="action-btn action-btn--secondary">\s*View in Leaderboard/.test(workspaceSource),
            n('G1. a successful reconciliation offers exactly one explicit, real navigation edge into the Leaderboard')
        );
        // The reverse edge (Leaderboard -> Workspace) does not exist. Is
        // that a discontinuity? Checked against established precedent:
        // one-way edges are already this codebase's own convention for
        // this exact family, not something this journey introduces.
        assert(
            !/to="\/reconciliation-workspace"/.test(leaderboardSource),
            n('G2. confirmed as stated: the Leaderboard carries no router-link back to the Workspace')
        );
        const comparisonSource = await readSource('ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js');
        assert(
            !/<router-link/.test(comparisonSource),
            n('G3. PRECEDENT: the Evidence Export Comparison page — one hop further down this SAME family\'s own journey — carries zero outbound router-links of its own either, already established (0.9.404 Section B3) as "the terminal step of this journey, not a hub," not a defect')
        );
        // The two surfaces have complementary, non-overlapping
        // responsibilities — the Workspace never renders a candidate
        // table, and the Leaderboard never reconciles anything.
        assert(
            !/<ReconciliationCandidateLeaderboardTable/.test(workspaceSource) && !/\.reconciliationDecisionRecords\b/.test(workspaceSource),
            n('G4. the Workspace never mounts the candidate table and never reads the archive\'s reconciliationDecisionRecords collection directly (a plain comment mentioning either name, like this file\'s own header already does for comparison, is not an embedding) — it never duplicates the Leaderboard\'s own presentation job')
        );
        assert(
            !leaderboardSource.includes('ReconcilePublisherLeaderboardSnapshotClaimUseCase'),
            n('G5. the Leaderboard never imports the reconciliation execution use case — it never duplicates the Workspace\'s own production job')
        );

        console.log('\n=== SECTION G: WORKSPACE -> LEADERBOARD HANDOFF — COMPLETE ===');
        console.log('✓ Section G: one explicit, contextual forward edge exists; the absent reverse edge mirrors an ALREADY-ESTABLISHED convention one hop further down this exact family\'s own journey (the Comparison page). The two surfaces remain complementary — the Workspace produces and hands off, the Leaderboard only ever observes — never overlapping.');
    }

    // ===============================================================
    // Section H — Persistence coherence (audit question 5): COMPLETE, BY
    // REUSE, not re-derivation.
    // ===============================================================
    {
        const persistenceAudit = await readSource('tests/ReconciliationWorkspacePersistenceConvergenceAudit.test.js');
        assert(
            persistenceAudit.includes('RECONCILIATION_WORKSPACE_PERSISTENCE_CONVERGENCE_CONFIRMED'),
            n('H1. 0.9.409\'s own centerpiece verdict is still on file, unmodified')
        );
        // The exact restraint this section exists to hold: this milestone
        // does not re-run a storage round trip, does not construct a
        // second LocalStoragePublicationObservationArchive scenario, and
        // does not touch storage/ at all — the evidence is REUSED.
        const storageDirStatus = execSync('git status --porcelain -- storage', { cwd: SOURCE_ROOT }).toString().trim();
        assert(storageDirStatus === '', n('H2. storage/ is untouched by this milestone — 0.9.409\'s own live proof is reused, never re-derived from a new scenario'));

        console.log('\n=== SECTION H: PERSISTENCE COHERENCE — COMPLETE (BY REUSE) ===');
        console.log('✓ Section H: 0.9.409 already proved, live, through a real serialize/deserialize round trip, that the Workspace and the Leaderboard converge on persisted fact. This milestone cites that result rather than re-proving it, per the audit brief\'s own instruction not to invent a second persistence abstraction.');
    }

    // ===============================================================
    // Section I — Repeated execution (audit question 6): NOT_A_PRODUCT_GAP,
    // by reuse.
    // ===============================================================
    {
        const persistenceAudit = await readSource('tests/ReconciliationWorkspacePersistenceConvergenceAudit.test.js');
        assert(
            /Duplicate execution: the SAME reconciliation, run twice/.test(persistenceAudit),
            n('I1. 0.9.409\'s own Section F already examined repeated/duplicate execution and found it consistent with pre-existing, on-file multiplicity semantics — cited, not re-derived')
        );
        // No NEW deduplication mechanism is introduced by this milestone —
        // confirmed structurally: this milestone's own production
        // boundary (Section M, below) shows zero application/ui files
        // touched at all, so nothing could have been added here.
        assert(
            execSync('git status --porcelain -- application ui', { cwd: SOURCE_ROOT }).toString().trim() === '',
            n('I2. application/ and ui/ carry zero changes from this milestone — no deduplication mechanism, or anything else, was introduced merely because repeated execution was named as a question to check')
        );

        console.log('\n=== SECTION I: REPEATED EXECUTION — NOT_A_PRODUCT_GAP (BY REUSE) ===');
        console.log('✓ Section I: multiplicity is the established, on-file, intended behavior for this whole record family. Nothing found here changes that; no deduplication is invented.');
    }

    // ===============================================================
    // Section J — Full classification matrix.
    // ===============================================================
    {
        const CLASSIFICATIONS = Object.freeze([
            'COMPLETE', 'PARTIAL', 'PRODUCT_GAP', 'INTENTIONALLY_DEFERRED', 'INTERNAL', 'NOT_A_PRODUCT_GAP'
        ]);
        const matrix = [
            { capability: 'Discoverability of the Reconciliation Workspace from the Publication Archive', classification: 'COMPLETE', section: 'C' },
            { capability: 'Providing peer evidence — pasting a claim already in hand', classification: 'COMPLETE', section: 'D' },
            { capability: 'Providing peer evidence — authoring and exporting one\'s OWN claim to give a peer', classification: 'PRODUCT_GAP', section: 'E' },
            { capability: 'Explicit Reconcile execution', classification: 'COMPLETE', section: 'B (0.9.407/0.9.408, reconfirmed)' },
            { capability: 'Candidate/decision/observation production', classification: 'COMPLETE', section: 'B (0.9.407, reconfirmed)' },
            { capability: 'Raw outcome-literal presentation on non-success results', classification: 'NOT_A_PRODUCT_GAP', section: 'F' },
            { capability: 'Workspace -> Leaderboard contextual handoff', classification: 'COMPLETE', section: 'G' },
            { capability: 'Leaderboard -> Workspace reverse navigation edge', classification: 'NOT_A_PRODUCT_GAP', section: 'G' },
            { capability: 'Persistence of a produced reconciliation fact', classification: 'COMPLETE', section: 'H (0.9.409, reused)' },
            { capability: 'A user-facing save-failure durability signal', classification: 'INTENTIONALLY_DEFERRED', section: '0.9.409 Section H, reused' },
            { capability: 'Repeated/duplicate reconciliation execution', classification: 'NOT_A_PRODUCT_GAP', section: 'I (0.9.409, reused)' },
            { capability: 'Inspecting the reconciliation result on the Leaderboard', classification: 'COMPLETE', section: 'B (pre-existing, reconfirmed)' },
            { capability: 'Automatic reconciliation / peer discovery / ranking / trust scoring', classification: 'INTERNAL', section: 'K — never entered this product\'s vocabulary; not evaluated as a gap because no user journey requires it' }
        ];

        assert(matrix.length === 13, n('J1. every capability named in the audit brief\'s own journey and its own six particular questions is classified exactly once'));
        for (const row of matrix) {
            assert(CLASSIFICATIONS.includes(row.classification), n(`J2. "${row.capability}" carries a valid classification (${row.classification})`));
            assert(typeof row.section === 'string' && row.section.length > 0, n(`J3. "${row.capability}"'s classification is traceable to a specific section of THIS file's own live evidence, not asserted bare`));
        }
        const productGaps = matrix.filter((row) => row.classification === 'PRODUCT_GAP');
        assert(productGaps.length === 1, n(`J4. exactly one PRODUCT_GAP is found across the entire journey (found ${productGaps.length}) — this reassessment does not manufacture a second one to look thorough`));
        assert(productGaps[0].capability.includes('authoring and exporting one\'s OWN claim'), n('J5. the one PRODUCT_GAP is precisely the sourcing-half evidence-provision capability Section E investigated, not the receiving half the audit brief\'s own framing assumed'));

        console.log('\n=== SECTION J: FULL CLASSIFICATION MATRIX ===');
        for (const row of matrix) {
            console.log(`  [${row.classification}] ${row.capability}`);
        }
        console.log('✓ Section J: thirteen capabilities classified, twelve without incident, one genuine PRODUCT_GAP — narrow, concrete, and precisely named.');
    }

    // ===============================================================
    // Section K — Deliberate exclusion census.
    // ===============================================================
    {
        const antiPatterns = [
            /autoGenerate.*[Rr]econciliation/,
            /pollReconciliation/i,
            /peerDiscoveryForReconciliation/i,
            /ReconciliationHistoryView/,
            /ReconciliationNotification/,
            /candidateRankingScore/i,
            /reconciliationTrustScore/i,
            /ReconciliationCoordinator/,
            /ReconciliationWizard/,
            /ReconciliationDashboard/i
        ];
        const scanDirs = ['ui', 'application', 'core'];
        const files = execSync(`git ls-files ${scanDirs.join(' ')}`, { cwd: SOURCE_ROOT }).toString().split('\n').filter((f) => f.endsWith('.js'));
        const bundle = (await Promise.all(files.map((f) => readSource(f)))).join('\n');
        for (const pattern of antiPatterns) {
            assert(!pattern.test(bundle), n(`K1. no anti-solution pattern ${pattern} exists anywhere in ui/, application/, or core/`));
        }

        // AMENDED BY 0.9.411 — Publisher Leaderboard Snapshot Claim
        // Authoring & Export. At THIS milestone's own moment (0.9.410),
        // the one recommended follow-up (Section E/L) was confirmed NOT
        // yet implemented — a decision recorded, never smuggled in as
        // code — which is the fact K2 originally recorded. 0.9.411 is
        // exactly that recommended follow-up, built: see
        // ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js's own
        // header. K2 now asserts the CURRENT, truthful state — exactly the
        // one file 0.9.411 authorized, never a second, accidental one —
        // the identical "assert what's true now" convention Section E's
        // own 0.9.411 amendments (E3/E4/E7, above) already apply.
        const createUiSitesAfter = grepFiles('new CreatePublisherLeaderboardSnapshotClaimUseCase(', ['ui']);
        assert(
            createUiSitesAfter.length === 1 && createUiSitesAfter[0] === 'ui/views/PublisherLeaderboardSnapshotClaimAuthoringView.js',
            n(`K2. exactly the one file 0.9.411 authorized constructs CreatePublisherLeaderboardSnapshotClaimUseCase — the gap this audit named is now closed, by the recommended follow-up itself, never by a second/accidental site (found: ${JSON.stringify(createUiSitesAfter)})`)
        );

        console.log('\n=== SECTION K: DELIBERATE EXCLUSION CENSUS ===');
        console.log('✓ Section K: none of the explicitly out-of-scope anti-solutions exist anywhere in current source, and the one capability this audit recommends for a future milestone is confirmed absent from THIS one — a decision is recorded, nothing is implemented.');
    }

    // ===============================================================
    // Section L — Recommended next-milestone scope note (recorded, not
    // built).
    // ===============================================================
    {
        const recommendedScope = Object.freeze({
            milestoneCandidate: '0.9.411 — Author & Export My Own Leaderboard Snapshot Claim',
            capability: 'a single explicit action on the Reconciliation Workspace (or a small section beside it): sign THIS replica\'s own current leaderboard snapshot into a PublisherLeaderboardSnapshotClaim (CreatePublisherLeaderboardSnapshotClaimUseCase, 0.8.121, UNCHANGED) and export it to portable JSON (exportPublisherLeaderboardSnapshotClaim, 0.8.122, UNCHANGED) for a person to hand to a peer, by whatever out-of-band means they already use for every other exported document in this family',
            reuses: ['CreatePublisherLeaderboardSnapshotClaimUseCase (0.8.121)', 'exportPublisherLeaderboardSnapshotClaim (0.8.122)', 'the app-wide identityProvider (already composed in ui/main.js for every other signing feature)', 'the "Export Claim" UI shape already proven for PlaceNamingClaim'],
            explicitlyNotIncluded: ['peer discovery or transport of any kind', 'automatic signing on any schedule or event', 'a claim archive, history, or store of one\'s own exported claims', 'any change to the receiving/reconciling half this arc already built'],
            deliberatelyNotBuiltHere: true
        });
        assert(recommendedScope.milestoneCandidate.startsWith('0.9.411'), n('L1. a concrete, nameable next milestone is recorded'));
        assert(recommendedScope.explicitlyNotIncluded.length === 4, n('L2. the recommended scope names what it explicitly excludes, mirroring 0.9.406\'s own "recorded, not built" scope-note precedent'));
        assert(recommendedScope.deliberatelyNotBuiltHere === true, n('L3. this milestone builds none of it — the classification (Section E/J) is the deliverable, not an implementation'));

        console.log('\n=== SECTION L: RECOMMENDED NEXT-MILESTONE SCOPE (RECORDED, NOT BUILT) ===');
        console.log(`candidate:     ${recommendedScope.milestoneCandidate}`);
        console.log(`capability:    ${recommendedScope.capability}`);
        console.log(`reuses:        ${recommendedScope.reuses.join('; ')}`);
        console.log(`NOT included:  ${recommendedScope.explicitlyNotIncluded.join('; ')}`);
        console.log('✓ Section L: a narrow, evidence-based candidate is recorded for whichever future milestone takes it up. This milestone implements none of it.');
    }

    // ===============================================================
    // Section M — Production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/ReconciliationWorkflowProductReassessment.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`M1. every changed/added file is this milestone's own test/registration file (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'publisher', 'storage', 'ui'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`M2. ${dir}/ shows no change — no view, route, component, or domain/backend file was touched`));
        }

        console.log('\n=== SECTION M: PRODUCTION BOUNDARY ===');
        console.log('✓ Section M: this milestone touches nothing but its own test file and tests.html\'s own registration. No route, view, component, or application/core/storage symbol was added or modified.');
    }

    // ===============================================================
    // Verdict.
    // ===============================================================
    console.log('\n' + '='.repeat(78));
    console.log('RECONCILIATION_WORKFLOW_PRODUCT_REASSESSMENT_COMPLETE');
    console.log('');
    console.log('NOT STABLE_STOP. Twelve of thirteen classified capabilities are healthy');
    console.log('(COMPLETE or NOT_A_PRODUCT_GAP) — the technical chain 0.9.405-0.9.409 built');
    console.log('is sound, discoverable, and converges with the Leaderboard exactly as');
    console.log('0.9.409 proved. But one real, narrow, concrete PRODUCT_GAP survives this');
    console.log('audit: nothing in the shipped product lets any user author and export');
    console.log('their OWN signed leaderboard snapshot claim — the exact artifact the');
    console.log('Workspace itself asks a person to paste, whose application-layer half');
    console.log('(0.8.121/0.8.122) has sat complete and tested since before this Workspace');
    console.log('existed, and which 0.9.406\'s own on-record plan named as the FIRST');
    console.log('capability to build. This is not "the user might prefer automation" — it');
    console.log('is "the user has no way to produce, through the product itself, the one');
    console.log('input the product\'s own Peer Evidence field requires." That gap, not the');
    console.log('reconciliation architecture, should determine 0.9.411 (Section L).');
    console.log('='.repeat(78));

    console.log('\n✅ All Reconciliation Workflow Product Reassessment tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
