import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import ReconciliationWorkspaceView from '../ui/views/ReconciliationWorkspaceView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { reconstructPublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimArchiveReceiptOutcome } from '../application/ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase.js';
import { RevalidationObservationArchiveOutcome } from '../application/RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase.js';
import { ReconcilePublisherLeaderboardSnapshotClaimOutcome } from '../application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.408 — Reconciliation Workspace UI.
//
// Type: production implementation + comprehensive convergence test.
//
// 0.9.407 built application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js
// — ONE explicit operation composing the five existing, UNCHANGED
// reconciliation stages — and deliberately left it with no UI call site.
// This milestone builds exactly that call site,
// ui/views/ReconciliationWorkspaceView.js: a small, explicit workspace that
// invokes the use case on an explicit click and hands off to the existing,
// unchanged, read-only Leaderboard. Sections A-H follow the milestone
// request's own lettered coverage.
//
//   A. Reachability — a real route exists and is reachable from an
//      existing contextual surface (the Publications page's own
//      Publication Archive card, beside its existing Leaderboard link).
//   B. Correct dependency — the view imports ONLY
//      ReconcilePublisherLeaderboardSnapshotClaimUseCase from the
//      reconciliation-producing family, never any of the five lower-level
//      stages that use case itself composes, and constructs it in exactly
//      one place.
//   C. Explicit execution — no lifecycle hook, watcher, timer, or
//      interval anywhere in the file; the use case is constructed and
//      called from nowhere but the click-bound reconcile() method.
//   D. Real production execution — reconcile() is called directly (this
//      component is Options-API-only precisely so it can be, without a
//      real Vue runtime) against real production classes, for a
//      divergent claim (candidate produced, archive durably updated
//      through the injected storage) and an agreeing claim
//      (NO_RECONCILIATION_CANDIDATE).
//   E. Result presentation — the template branches on exactly the real
//      outcome literals, never an invented lifecycle word.
//   F. Leaderboard handoff — exactly one router-link to
//      /reconciliation-leaderboard, gated on candidateProduced alone; no
//      second candidate table, no Leaderboard component import.
//   G. Boundary — none of candidate selection / decision / revalidation /
//      archive mutation / scoring / ranking / trust vocabulary appears in
//      the file's own code.
//   H. Failure isolation — a malformed peer-evidence payload reports
//      EXACTLY LeaderboardClaimArchiveReceiptOutcome.INVALID_CLAIM,
//      displayed verbatim, never a generic "workspace error."

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

// A genuine IMPORT means the symbol is actually bound by an
// `import { ... } from` statement — never merely mentioned in a comment.
// Identical helper to tests/ReconciliationWorkspaceExecutionBoundary.test.js's
// own `importsSymbol()`.
function importsSymbol(text, symbol) {
    return new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from`, 's').test(text);
}

// ---------------------------------------------------------------------
// Fixture helpers — byte-identical in shape to
// tests/ReconciliationWorkspaceExecutionBoundary.test.js's own, reused
// here rather than reinvented, because this milestone's job is to exercise
// the UI's own wiring onto that exact seam, not to author a further
// variant of the underlying reconciliation machinery's own fixtures.
// ---------------------------------------------------------------------

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// The IDENTICAL `publicationObservationArchiveStorage` shape
// ui/main.js's own LocalStoragePublicationObservationArchive provides
// (`load()`/`save(archive)`), backed by a plain in-memory field rather than
// window.localStorage — the fake this test's own Section D needs to prove
// the injected storage is genuinely read from and written to.
class FakePublicationObservationArchiveStorage {
    constructor(archive = PublicationObservationArchive.empty()) {
        this._archive = archive;
        this.saveCallCount = 0;
    }
    load() { return this._archive; }
    save(archive) { this._archive = archive; this.saveCallCount += 1; }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return provider;
}

function fingerprintOf(snapshot) {
    return describePublisherLeaderboardSnapshotFingerprint(snapshot).fingerprint;
}

function signedClaim(identityProvider, { evidenceFingerprint, policyVersion, snapshotFingerprint, createdAt }) {
    const signerIdentityId = resolveSigningIdentityId(identityProvider);
    let claim = new PublisherLeaderboardSnapshotClaim({ evidenceFingerprint, policyVersion, snapshotFingerprint, signerIdentityId, createdAt });
    const signature = identityProvider.signCanonical(claim.getSigningDescriptor());
    return claim.withSignature(signature);
}

const E_WRONG = '9'.repeat(64);

// The SAME "call data()/computed/methods.call(ctx)" discipline
// tests/LiveWorldView.test.js's own header names — there is no real Vue
// runtime anywhere in this test suite (`ui/views/ReconciliationWorkspaceView.js`
// is deliberately Options-API-only, with no `setup()`/`inject()` import
// from 'vue', precisely so this is possible).
function buildWorkspaceInstance({ publicationObservationArchiveStorage = null } = {}) {
    const ctx = { publicationObservationArchiveStorage };
    Object.assign(ctx, ReconciliationWorkspaceView.data());
    Object.assign(ctx, ReconciliationWorkspaceView.methods);
    return ctx;
}

function candidateProducedOf(ctx) {
    return ReconciliationWorkspaceView.computed.candidateProduced.call(ctx);
}
function noReconciliationCandidateOf(ctx) {
    return ReconciliationWorkspaceView.computed.noReconciliationCandidate.call(ctx);
}

async function run() {
    // ===============================================================
    // Section A — Reachability.
    // ===============================================================
    {
        assert(typeof ReconciliationWorkspaceView === 'object' && ReconciliationWorkspaceView !== null, n('A1. ui/views/ReconciliationWorkspaceView.js exports a real component object'));
        assert(ReconciliationWorkspaceView.name === 'ReconciliationWorkspaceView', n('A2. the component is genuinely named ReconciliationWorkspaceView'));

        const routerSource = await readSource('ui/router/index.js');
        assert(routerSource.includes("path: '/reconciliation-workspace'"), n('A3. /reconciliation-workspace is registered in ui/router/index.js'));
        assert(routerSource.includes('ReconciliationWorkspaceView'), n('A4. the registered route points at ReconciliationWorkspaceView'));
        assert(/import\s+ReconciliationWorkspaceView\s+from\s+'[^']+'/.test(routerSource), n('A5. the router genuinely default-imports ReconciliationWorkspaceView, never merely names it'));

        const publicationsSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(/<router-link\s+to="\/reconciliation-workspace"/.test(publicationsSource), n('A6. an existing contextual surface (the Publications page) carries a real <router-link> to /reconciliation-workspace'));

        console.log('\n=== SECTION A: REACHABILITY ===');
        console.log('✓ Section A: /reconciliation-workspace is a real, registered route, reachable from the Publications page\'s own existing Publication Archive card.');
    }

    // ===============================================================
    // Section B — Correct dependency.
    // ===============================================================
    {
        const source = await readSource('ui/views/ReconciliationWorkspaceView.js');
        assert(importsSymbol(source, 'ReconcilePublisherLeaderboardSnapshotClaimUseCase'), n('B1. the view genuinely imports ReconcilePublisherLeaderboardSnapshotClaimUseCase'));

        const lowerLevelSymbols = [
            'ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase',
            'ReceivePublisherLeaderboardSnapshotClaimUseCase',
            'describePublisherLeaderboardClaimSnapshotReconciliationPlan',
            'describePublisherLeaderboardClaimSnapshotReconciliationCandidate',
            'describePublisherLeaderboardClaimSnapshotReconciliationDecision',
            'RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase',
            'describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation',
            'RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase'
        ];
        for (const symbol of lowerLevelSymbols) {
            assert(!importsSymbol(source, symbol), n(`B2. the view never imports the lower-level stage symbol ${symbol} — only the composed use case`));
        }

        const constructionSites = (source.match(/new\s+ReconcilePublisherLeaderboardSnapshotClaimUseCase\s*\(/g) || []).length;
        assert(constructionSites === 1, n(`B3. the use case is constructed in exactly one place in the file (found ${constructionSites})`));

        const codeOnlyForB = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/ReconciliationCandidateLeaderboardTable|ReconciliationCandidateLeaderboardView/.test(codeOnlyForB), n('B4. the view\'s own code never imports the Leaderboard\'s own table or view component — no duplicate candidate view'));

        console.log('\n=== SECTION B: CORRECT DEPENDENCY ===');
        console.log('✓ Section B: the view depends on ReconcilePublisherLeaderboardSnapshotClaimUseCase alone, never any of the five lower-level stages it composes, constructed in exactly one place.');
    }

    // ===============================================================
    // Section C — Explicit execution.
    // ===============================================================
    {
        assert(!('mounted' in ReconciliationWorkspaceView), n('C1. the component defines no mounted() hook'));
        assert(!('created' in ReconciliationWorkspaceView), n('C2. the component defines no created() hook'));
        assert(!('watch' in ReconciliationWorkspaceView), n('C3. the component defines no watch block'));

        const source = await readSource('ui/views/ReconciliationWorkspaceView.js');
        assert(!/setInterval|setTimeout|requestAnimationFrame|addEventListener|\.on\(/.test(source), n('C4. the view contains no timer, interval, animation-frame loop, or event subscription of any kind'));

        const executeCallSites = (source.match(/useCase\.execute\(/g) || []).length;
        assert(executeCallSites === 1, n(`C5. execute() is called in exactly one place (found ${executeCallSites})`));

        // The one call site is inside methods.reconcile, and reconcile is
        // bound to the template's own explicit click handler, never a
        // lifecycle hook or a watcher.
        assert(/@click="reconcile"/.test(source), n('C6. the template binds reconcile() to an explicit @click handler'));
        assert(typeof ReconciliationWorkspaceView.methods.reconcile === 'function', n('C7. reconcile is a real method'));

        // Merely constructing a fresh instance/opening the workspace,
        // changing the pasted text, or reading a computed property never
        // runs anything — data()/computed never touch the use case.
        const ctx = buildWorkspaceInstance({ publicationObservationArchiveStorage: new FakePublicationObservationArchiveStorage() });
        ctx.peerEvidenceText = 'not even attempted yet';
        assert(ctx.result === null, n('C8. opening the workspace (constructing data()) leaves result null — nothing ran'));
        candidateProducedOf(ctx);
        noReconciliationCandidateOf(ctx);
        assert(ctx.result === null, n('C9. reading the computed presentation facts never itself triggers reconciliation'));

        console.log('\n=== SECTION C: EXPLICIT EXECUTION ===');
        console.log('✓ Section C: no lifecycle hook, watcher, timer, or interval exists; execute() is called from exactly one place, reachable only through the explicit, click-bound reconcile() method.');
    }

    // ===============================================================
    // Section D — Real production execution (FLAGSHIP).
    // ===============================================================
    {
        // --- A genuine, divergent peer claim against genuine (empty)
        // local evidence — the identical flagship shape
        // tests/ReconciliationWorkspaceExecutionBoundary.test.js's own
        // Section B already proves at the application layer, carried one
        // layer further into the UI's own click handler.
        const bob = makeIdentity('Bob');
        const localSnapshot = reconstructPublisherLeaderboardSnapshot(PublicationObservationArchive.empty());
        const realSnapshotFingerprint = fingerprintOf(localSnapshot);
        const claimB = signedClaim(bob, { evidenceFingerprint: E_WRONG, policyVersion: localSnapshot.policy.version, snapshotFingerprint: realSnapshotFingerprint, createdAt: new Date('2026-09-11T00:00:00Z') });

        const storage = new FakePublicationObservationArchiveStorage(PublicationObservationArchive.empty());
        const ctx = buildWorkspaceInstance({ publicationObservationArchiveStorage: storage });
        // The genuine peer-evidence input mechanism: raw pasted JSON text,
        // handed straight through, unparsed by this file — see
        // ui/views/ReconciliationWorkspaceView.js's own header.
        ctx.peerEvidenceText = JSON.stringify(claimB.toJSON());

        ctx.reconcile();

        assert(ctx.result !== null, n('D1. reconcile() genuinely produced a result'));
        assert(ctx.result.outcome === RevalidationObservationArchiveOutcome.RECORDED, n('D2. the REAL production use case ran end to end — outcome is the literal RECORDED value'));
        assert(ctx.result.receipt !== null && ctx.result.receipt.outcome === LeaderboardClaimArchiveReceiptOutcome.RECEIVED, n('D3. stage 1 (claim receipt) genuinely ran inside the real use case'));
        assert(ctx.result.candidate !== null && ctx.result.candidate.selected === true, n('D4. a real candidate was genuinely selected'));
        assert(ctx.result.decision !== null && ctx.result.observation !== null, n('D5. a real decision and a real revalidation observation were both produced'));
        assert(candidateProducedOf(ctx) === true, n('D6. the view\'s own candidateProduced computed genuinely reflects the real outcome'));
        assert(noReconciliationCandidateOf(ctx) === false, n('D7. noReconciliationCandidate is correctly false for a completed reconciliation'));

        // The injected storage — never a parallel store — genuinely holds
        // the new durable records; the SAME storage the existing,
        // unchanged Leaderboard reads from.
        assert(storage.saveCallCount === 1, n('D8. the workspace persisted the resulting archive through the injected storage exactly once'));
        assert(storage.load().leaderboardClaimRecords.length === 1, n('D9. the persisted archive durably holds the received claim record'));
        assert(storage.load().reconciliationDecisionRecords.length === 1, n('D10. the persisted archive durably holds the recorded decision'));
        assert(storage.load().revalidationObservationRecords.length === 1, n('D11. the persisted archive durably holds the recorded revalidation observation'));
        assert(storage.load() === ctx.result.archive, n('D12. the persisted archive is the EXACT archive instance the use case itself returned — never a copy or a re-derived one'));

        // --- An agreeing (non-divergent) claim: the plan names no
        // candidate, and the workspace correctly reports
        // NO_RECONCILIATION_CANDIDATE rather than fabricating one.
        const dave = makeIdentity('Dave');
        const localForAgreement = PublicationObservationArchive.empty();
        const realLocalSnapshot = reconstructPublisherLeaderboardSnapshot(localForAgreement);
        const claimD = signedClaim(dave, {
            evidenceFingerprint: realLocalSnapshot.evidenceFingerprint,
            policyVersion: realLocalSnapshot.policy.version,
            snapshotFingerprint: fingerprintOf(realLocalSnapshot),
            createdAt: new Date('2026-09-11T00:05:00Z')
        });

        const storage2 = new FakePublicationObservationArchiveStorage(localForAgreement);
        const ctx2 = buildWorkspaceInstance({ publicationObservationArchiveStorage: storage2 });
        ctx2.peerEvidenceText = JSON.stringify(claimD.toJSON());
        ctx2.reconcile();

        assert(ctx2.result.outcome === ReconcilePublisherLeaderboardSnapshotClaimOutcome.NO_RECONCILIATION_CANDIDATE, n('D13. an agreeing claim reports the REAL NO_RECONCILIATION_CANDIDATE literal, never a fabricated candidate'));
        assert(ctx2.result.decision === null && ctx2.result.observation === null, n('D14. no decision or observation record exists for an agreeing claim'));
        assert(candidateProducedOf(ctx2) === false, n('D15. candidateProduced is correctly false for NO_RECONCILIATION_CANDIDATE'));
        assert(noReconciliationCandidateOf(ctx2) === true, n('D16. noReconciliationCandidate is correctly true'));
        // The claim itself was still genuinely received and durably held —
        // stage 1 ran even though no candidate followed.
        assert(storage2.load().leaderboardClaimRecords.length === 1, n('D17. the received claim is still durably persisted even when no candidate followed'));
        assert(storage2.load().reconciliationDecisionRecords.length === 0, n('D18. no decision record was fabricated for the agreeing claim'));

        console.log('\n=== SECTION D: REAL PRODUCTION EXECUTION ===');
        console.log('✓ Section D: reconcile() genuinely drives the real, unmocked ReconcilePublisherLeaderboardSnapshotClaimUseCase end to end for both a divergent claim (candidate produced, archive durably persisted through the injected storage) and an agreeing claim (NO_RECONCILIATION_CANDIDATE, no candidate fabricated).');
    }

    // ===============================================================
    // Section E — Result presentation.
    // ===============================================================
    {
        const source = await readSource('ui/views/ReconciliationWorkspaceView.js');
        const templateMatch = source.match(/template:\s*`([\s\S]*)`\s*\};?\s*$/);
        assert(templateMatch !== null, n('E1. the component exports a real template string'));
        const template = templateMatch[1];

        assert(template.includes('candidateProduced'), n('E2. the template branches on the real candidateProduced fact'));
        assert(template.includes('noReconciliationCandidate'), n('E3. the template branches on the real noReconciliationCandidate fact'));
        assert(template.includes('result.outcome'), n('E4. the template falls back to displaying the use case\'s own raw outcome literal verbatim'));

        const forbiddenLifecycleWords = [/\bSTARTED\b/, /\bRUNNING\b/, /\bRECONCILING\b/, /\bIN_PROGRESS\b/, /\bPENDING\b/, /\bCOMPLETED\b/, /\bSUCCESS\b/, /\bNO_CHANGES\b/];
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        for (const pattern of forbiddenLifecycleWords) {
            assert(!pattern.test(codeOnly), n(`E5. the file's own CODE (never its prose comments) contains no invented lifecycle word matching ${pattern}`));
        }

        console.log('\n=== SECTION E: RESULT PRESENTATION ===');
        console.log('✓ Section E: the template exposes the real candidateProduced/noReconciliationCandidate facts and the use case\'s own raw outcome literal, with no invented STARTED/RUNNING/COMPLETED/SUCCESS-style vocabulary anywhere in the file\'s own code.');
    }

    // ===============================================================
    // Section F — Leaderboard handoff.
    // ===============================================================
    {
        const source = await readSource('ui/views/ReconciliationWorkspaceView.js');
        const routerLinkMatches = source.match(/<router-link[^>]*>/g) || [];
        assert(routerLinkMatches.length === 1, n(`F1. the view contains exactly one <router-link> (found ${routerLinkMatches.length})`));
        assert(/<router-link\s+to="\/reconciliation-leaderboard"/.test(source), n('F2. the one router-link points at the existing, unchanged /reconciliation-leaderboard route'));

        // The link is gated on candidateProduced alone — a v-if scoped to
        // exactly the "candidate produced" branch, per this file's own
        // template structure.
        const candidateBranch = source.match(/v-if="candidateProduced"[\s\S]*?<\/template>/);
        assert(candidateBranch !== null && candidateBranch[0].includes('router-link'), n('F3. the Leaderboard link lives inside the candidateProduced branch, never the no-candidate or failure branches'));

        const codeOnlyForF = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/ReconciliationCandidateLeaderboardTable/.test(codeOnlyForF), n('F4. no second candidate table exists anywhere in this file\'s own code'));

        console.log('\n=== SECTION F: LEADERBOARD HANDOFF ===');
        console.log('✓ Section F: exactly one contextual router-link to the existing /reconciliation-leaderboard route, shown only when a candidate was produced; no duplicate candidate table.');
    }

    // ===============================================================
    // Section G — Boundary.
    // ===============================================================
    {
        const source = await readSource('ui/views/ReconciliationWorkspaceView.js');
        const codeOnly = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        const forbiddenInCode = [
            'divergentCorrespondence', 'claimsWithoutCorrespondence', 'snapshotsWithoutCorrespondence',
            'selectCandidate', 'buildSelection',
            'decidedAt', "'OBSERVE'", "'DEFER'",
            'observedAt', 'candidateMatchesPlan', 'candidatePresent',
            '.reconciliationDecisionRecords', '.revalidationObservationRecords', '.leaderboardClaimRecords',
            'rank', 'score', 'trust'
        ];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), n(`G1. the view's own code never carries "${term}" — every reconciliation-internal fact stays inside the composed use case`));
        }

        // The only archive collection access anywhere in the file is the
        // instanceof check guarding the best-effort save — proven directly
        // rather than merely by the substring checks above.
        const archiveCollectionAccess = (codeOnly.match(/\.\w*Records\b/g) || []).filter((m) => m !== '');
        assert(archiveCollectionAccess.length === 0, n('G2. the view never reads any of the archive\'s own record collections directly'));

        console.log('\n=== SECTION G: BOUNDARY ===');
        console.log('✓ Section G: no candidate-selection, decision, revalidation, archive-collection, scoring, ranking, or trust vocabulary appears in the view\'s own code — every one of those questions stays inside the composed use case.');
    }

    // ===============================================================
    // Section H — Failure isolation.
    // ===============================================================
    {
        const storage = new FakePublicationObservationArchiveStorage(PublicationObservationArchive.empty());
        const ctx = buildWorkspaceInstance({ publicationObservationArchiveStorage: storage });
        ctx.peerEvidenceText = 'this is not JSON at all, just a malformed paste';
        ctx.reconcile();

        assert(ctx.result.outcome === LeaderboardClaimArchiveReceiptOutcome.INVALID_CLAIM, n('H1. a malformed peer-evidence paste reports EXACTLY the existing LeaderboardClaimArchiveReceiptOutcome.INVALID_CLAIM literal'));
        assert(candidateProducedOf(ctx) === false, n('H2. candidateProduced is correctly false for a malformed payload'));
        assert(noReconciliationCandidateOf(ctx) === false, n('H3. noReconciliationCandidate is correctly false for a malformed payload — it is a distinct fact, never conflated'));
        assert(storage.load().leaderboardClaimRecords.length === 0, n('H4. no claim was durably recorded for a malformed payload'));

        // Checked against the file's own CODE — never its prose comments,
        // which legitimately NAME the forbidden phrase once, in English, to
        // document that it was deliberately never minted (the identical,
        // established pattern tests/ReconciliationWorkspaceExecutionBoundary
        // .test.js's own Section D already uses for its own forbidden
        // words).
        const source = await readSource('ui/views/ReconciliationWorkspaceView.js');
        const codeOnlyForH = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!/workspace\s*error/i.test(codeOnlyForH), n('H5. the file\'s own code never mints a generic "workspace error" label of any kind'));

        console.log('\n=== SECTION H: FAILURE ISOLATION ===');
        console.log('✓ Section H: a malformed peer-evidence paste reports the EXISTING LeaderboardClaimArchiveReceiptOutcome.INVALID_CLAIM literal, displayed verbatim — never collapsed into a generic "workspace error."');
    }

    // ===============================================================
    // Production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/ReconciliationWorkspaceUi.test.js',
            'ui/views/ReconciliationWorkspaceView.js',
            'ui/router/index.js',
            'ui/views/DecentralizedPublicationsView.js',
            // Pre-existing audits whose own, prior-milestone assertions
            // this milestone legitimately supersedes get a minimal, clearly
            // labeled amendment rather than silently going stale — the
            // identical, established convention 0.9.403's own commit
            // already set for tests/ReconciliationLeaderboardEntryPointDecisionAudit.test.js.
            // Each amended file's own "AMENDED BY 0.9.408" comment names
            // exactly which single assertion changed and why.
            'tests/ReconciliationWorkspaceExecutionBoundary.test.js',
            'tests/ReconciliationLeaderboardEntryPointDecisionAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`I1. every changed/added file is one this milestone explicitly authorized (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const domainDirsExcludingUi = ['core', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'application', 'storage'];
        for (const dir of domainDirsExcludingUi) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`I2. ${dir}/ shows no change — this milestone touches only ui/ and its own test`));
        }

        console.log('\n=== PRODUCTION BOUNDARY ===');
        console.log('✓ Only ui/views/ReconciliationWorkspaceView.js (new), ui/router/index.js, ui/views/DecentralizedPublicationsView.js, this test file, and tests.html\'s own registration changed. No existing reconciliation-producing file was modified.');
    }

    console.log('\n' + '='.repeat(78));
    console.log('RECONCILIATION_WORKSPACE_UI_ESTABLISHED');
    console.log('');
    console.log('ui/views/ReconciliationWorkspaceView.js is now the first user-facing');
    console.log('surface over application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js');
    console.log('(0.9.407) — a small, explicit workspace: choose genuine inputs (the');
    console.log('existing local archive, a pasted peer claim), explicitly execute');
    console.log('reconciliation, expose the real result, and hand off to the existing,');
    console.log('unchanged, read-only Reconciliation Candidate Leaderboard.');
    console.log('='.repeat(78));

    console.log('\n✅ All Reconciliation Workspace UI tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
