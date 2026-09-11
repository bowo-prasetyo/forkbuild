import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { reconstructPublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js';
import { LeaderboardClaimArchiveReceiptOutcome } from '../application/ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase.js';
import { ReconciliationDecisionArchiveOutcome } from '../application/RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase.js';
import { RevalidationObservationArchiveOutcome } from '../application/RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase.js';
import {
    ReconcilePublisherLeaderboardSnapshotClaimUseCase,
    ReconcilePublisherLeaderboardSnapshotClaimOutcome
} from '../application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.407 — Reconciliation Workspace Execution Boundary.
//
// Type: production implementation + comprehensive convergence test.
//
// 0.9.405 proved LIVE that a complete five-stage reconciliation producer
// chain works but has no owner (POSSIBILITY C). 0.9.406 then decided WHICH
// existing object should become that front door and rejected every one of
// them, most decisively the Leaderboard itself, self-documented as
// read-only. This milestone builds the smallest production seam that
// answers both: application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js,
// ONE explicit application operation composing the five existing,
// UNCHANGED stages, invoked only by explicit caller action, taking only
// genuine local-archive + peer-claim-payload inputs.
//
// Sections (A-H), following the milestone request's own lettered coverage:
//   A. Operation ownership — the new file is real, and it is the ONLY file
//      in application/ or ui/ that imports the claim-receipt stage
//      together with BOTH archive-writing stages (decision + observation).
//   B. Real five-stage execution — the operation, called with real
//      production classes, actually walks claim receipt -> plan ->
//      candidate selection -> decision -> revalidation observation, for
//      both a divergent-correspondence claim and a claim without any
//      corresponding local snapshot; an agreeing (non-divergent) claim
//      correctly stops at NO_RECONCILIATION_CANDIDATE rather than
//      fabricating a candidate.
//   C. Existing stores — the resulting archive's own, pre-existing
//      collections (leaderboardClaimRecords/reconciliationDecisionRecords/
//      revalidationObservationRecords) hold the new records; no parallel
//      "workspace" store exists anywhere.
//   D. Result semantics — the operation's own success outcome IS the
//      literal 0.8.167 RevalidationObservationArchiveOutcome.RECORDED
//      value, never a re-labeled or invented one; no STARTED/RUNNING/
//      COMPLETE-style lifecycle vocabulary appears anywhere in the new
//      file.
//   E. Explicitness — nothing under ui/ references the new operation; the
//      new file itself contains no timer, interval, or event subscription
//      of any kind.
//   F. Leaderboard remains read-only — the Leaderboard's own view/page
//      files still do not import the new operation (the invalid direction
//      stays absent) while the operation's own written archive is, in the
//      valid direction, exactly what the Leaderboard's existing, unchanged
//      read path already renders correctly.
//   G. Failure isolation — a malformed claim payload reports EXACTLY
//      LeaderboardClaimArchiveReceiptOutcome.INVALID_CLAIM, never a new
//      generic "workspace error"; an invalid `executedAt` reports
//      INVALID_EXECUTED_AT before the archive is touched at all.
//   H. Production boundary — only the new application file, this test
//      file, and tests.html's own registration changed.

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

// A genuine COMPOSITION/IMPORT means the symbol is actually IMPORTED (an
// `import { ... } from` binding a file's own code can construct and call)
// — never merely mentioned in a comment. Hoisted to module scope (rather
// than declared inside Section A's own block, below) so Section E's own
// 0.9.408 amendment can reuse it too.
function importsSymbol(text, symbol) {
    return new RegExp(`import\\s*\\{[^}]*\\b${symbol}\\b[^}]*\\}\\s*from`, 's').test(text);
}

// ---------------------------------------------------------------------
// Fixture helpers — the identical shapes 0.9.405's own live proof uses,
// reused here rather than reinvented, because this milestone's job is to
// exercise the new SEAM, not to author a fifteenth variant of the
// underlying reconciliation machinery's own fixtures.
// ---------------------------------------------------------------------

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
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

const E2 = '2'.repeat(64);
const E_WRONG = '9'.repeat(64);
const T0 = new Date('2026-09-11T00:00:00Z');

async function run() {
    // ===============================================================
    // Section A — Operation ownership.
    // ===============================================================
    {
        const source = await readSource('application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js');
        assert(source.length > 500, n('A1. application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js exists and is genuine, non-trivial source'));
        assert(typeof ReconcilePublisherLeaderboardSnapshotClaimUseCase === 'function', n('A2. ReconcilePublisherLeaderboardSnapshotClaimUseCase is a real, importable class'));
        assert(typeof ReconcilePublisherLeaderboardSnapshotClaimOutcome === 'object' && ReconcilePublisherLeaderboardSnapshotClaimOutcome !== null, n('A3. ReconcilePublisherLeaderboardSnapshotClaimOutcome is a real, importable outcome object'));

        const applicationFiles = execSync('git ls-files application', { cwd: SOURCE_ROOT }).toString().split('\n').filter((f) => f.endsWith('.js'));
        const uiFiles = execSync('git ls-files ui', { cwd: SOURCE_ROOT }).toString().split('\n').filter((f) => f.endsWith('.js'));
        const otherFiles = [...applicationFiles, ...uiFiles].filter((f) => f !== 'application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js');

        const receiptSymbol = 'ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase';
        const decisionWriteSymbol = 'RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase';
        const observationWriteSymbol = 'RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase';

        // `importsSymbol()` (module scope, above) — a genuine COMPOSITION
        // means the symbol is actually IMPORTED (an `import { ... } from`
        // binding this file's own code can construct and call) — never
        // merely mentioned in a comment, as `application/
        // PublicationObservationArchive.js`'s own doc prose and this
        // decision-writer's sibling observation-writer file each innocently
        // do when explaining their own relationship to it.
        let coOccurrenceCount = 0;
        const coOccurringFiles = [];
        for (const file of otherFiles) {
            const text = await readSource(file);
            const hasReceipt = importsSymbol(text, receiptSymbol);
            const hasDecisionWrite = importsSymbol(text, decisionWriteSymbol);
            const hasObservationWrite = importsSymbol(text, observationWriteSymbol);
            if (hasReceipt && hasDecisionWrite && hasObservationWrite) {
                coOccurrenceCount += 1;
                coOccurringFiles.push(file);
            }
        }
        assert(coOccurrenceCount === 0, n(`A4. no file other than the new use case, anywhere under application/ or ui/, IMPORTS all three of claim receipt + decision recording + observation recording together — the new file is the ONLY composition of the full producer chain (found: ${JSON.stringify(coOccurringFiles)})`));

        console.log('\n=== SECTION A: OPERATION OWNERSHIP ===');
        console.log('✓ Section A: ReconcilePublisherLeaderboardSnapshotClaimUseCase is real, and the sole file composing the full five-stage producer chain.');
    }

    // ===============================================================
    // Section B — Real five-stage execution.
    // ===============================================================
    let divergentResult;
    {
        const bob = makeIdentity('Bob');
        // Correspondence (0.8.139's own rule, unchanged) is decided purely
        // by `snapshotFingerprintMatches` — the claim's own asserted
        // `snapshotFingerprint` against the LOCAL archive's own, genuinely
        // reconstructed snapshot fingerprint. A claim whose
        // `evidenceFingerprint` deliberately differs from what that same
        // local snapshot actually carries, while its `snapshotFingerprint`
        // genuinely matches, is 0.8.144's own FLAGSHIP divergence shape —
        // corresponds, but disagrees on the evidence fingerprint.
        const localSnapshot = reconstructPublisherLeaderboardSnapshot(PublicationObservationArchive.empty());
        const realSnapshotFingerprint = fingerprintOf(localSnapshot);
        const claimB = signedClaim(bob, { evidenceFingerprint: E_WRONG, policyVersion: localSnapshot.policy.version, snapshotFingerprint: realSnapshotFingerprint, createdAt: T0 });

        // "local Publication" — this replica's own, empty-but-genuine
        // PublicationObservationArchive. "peer evidence" — the peer's
        // genuine, signed claim payload, exactly as it would arrive
        // out-of-band from a peer.
        const useCase = new ReconcilePublisherLeaderboardSnapshotClaimUseCase(new LocalAuthorizationVerifier());
        const localArchive = PublicationObservationArchive.empty();
        const result = useCase.execute(localArchive, claimB.toJSON(), T0);
        divergentResult = result;

        assert(result.outcome === RevalidationObservationArchiveOutcome.RECORDED, n('B1. a genuine, divergent peer claim against genuine (empty) local evidence reconciles to completion — outcome is the REAL 0.8.167 RECORDED literal'));
        assert(result.receipt !== null && result.receipt.outcome === LeaderboardClaimArchiveReceiptOutcome.RECEIVED, n('B2. stage 1 (claim receipt) genuinely ran — receipt.outcome is the real RECEIVED literal'));
        assert(result.archive.leaderboardClaimRecords.length === 1, n('B3. the resulting archive durably holds one leaderboardClaimRecord'));
        assert(result.plan !== null && Array.isArray(result.plan.divergentCorrespondences), n('B4. stage 2 (plan) genuinely ran — a real plan with a real divergentCorrespondences array is present'));
        assert(result.plan.divergentCorrespondences.some((c) => c.claimId === claimB.id), n('B5. the plan genuinely names this exact claim as a divergent correspondence — never a different or synthetic claimId'));
        assert(result.candidate !== null && result.candidate.selected === true && result.candidate.type === 'DIVERGENT_CORRESPONDENCE', n('B6. stage 3 (candidate selection) genuinely ran and selected the DIVERGENT_CORRESPONDENCE relationship the plan itself reported — never a caller-supplied selection'));
        assert(result.decision !== null && result.decision.outcome === ReconciliationDecisionArchiveOutcome.RECORDED, n('B7. stage 4 (decision) genuinely ran and was RECORDED into the archive'));
        assert(result.decision.record.decision === 'OBSERVE', n('B8. the recorded disposition is OBSERVE — the operation\'s own explicit invocation IS the act of observing, never a caller-supplied disposition'));
        assert(result.archive.reconciliationDecisionRecords.length === 1, n('B9. the resulting archive durably holds one reconciliationDecisionRecord'));
        assert(result.observation !== null && result.observation.outcome === RevalidationObservationArchiveOutcome.RECORDED, n('B10. stage 5 (revalidation observation) genuinely ran and was RECORDED into the archive'));
        assert(result.observation.record.decision === result.decision.record, n('B11. the observation embeds the ORIGINAL decision record by reference — one source of truth, never a copy'));
        assert(result.archive.revalidationObservationRecords.length === 1, n('B12. the resulting archive durably holds one revalidationObservationRecord'));

        // A claim with NO corresponding local snapshot at all (a wildly
        // different policyVersion) — stage 3 must select
        // CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT, never DIVERGENT_CORRESPONDENCE.
        const carol = makeIdentity('Carol');
        const claimC = signedClaim(carol, { evidenceFingerprint: E2, policyVersion: 999, snapshotFingerprint: E_WRONG, createdAt: T0 });
        const resultC = useCase.execute(PublicationObservationArchive.empty(), claimC.toJSON(), T0);
        assert(resultC.outcome === RevalidationObservationArchiveOutcome.RECORDED, n('B13. a claim without any corresponding local snapshot ALSO reconciles to completion'));
        assert(resultC.candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', n('B14. stage 3 correctly selected CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT — mechanically derived from the plan, never DIVERGENT_CORRESPONDENCE by default'));

        // An AGREEING claim — genuinely corresponds to the local snapshot
        // and does NOT diverge. The plan names no candidate for it; the
        // operation must stop cleanly rather than fabricate one. The claim
        // asserts EXACTLY this replica's own (empty-archive) reality —
        // every field echoed straight off the SAME reconstruction
        // `execute()` itself will independently perform.
        const dave = makeIdentity('Dave');
        const localForAgreement = PublicationObservationArchive.empty();
        const realLocalSnapshot = reconstructPublisherLeaderboardSnapshot(localForAgreement);
        const claimD = signedClaim(dave, {
            evidenceFingerprint: realLocalSnapshot.evidenceFingerprint,
            policyVersion: realLocalSnapshot.policy.version,
            snapshotFingerprint: fingerprintOf(realLocalSnapshot),
            createdAt: T0
        });
        const resultD = useCase.execute(localForAgreement, claimD.toJSON(), T0);
        assert(resultD.outcome === ReconcilePublisherLeaderboardSnapshotClaimOutcome.NO_RECONCILIATION_CANDIDATE, n('B15. an agreeing (non-divergent) claim stops at NO_RECONCILIATION_CANDIDATE rather than fabricating a candidate'));
        assert(resultD.decision === null && resultD.observation === null, n('B16. no decision or observation record is produced when the plan names no candidate'));
        assert(resultD.plan !== null, n('B17. the plan itself is still genuinely present — the operation reached stage 2 before stopping'));

        console.log('\n=== SECTION B: REAL FIVE-STAGE EXECUTION ===');
        console.log('✓ Section B: the new operation genuinely walks claim receipt -> plan -> candidate selection -> decision -> revalidation observation using real production classes, for both divergent and no-correspondence claims, and correctly declines to fabricate a candidate for an agreeing claim.');
    }

    // ===============================================================
    // Section C — Existing stores, no parallel workspace store.
    // ===============================================================
    {
        assert(divergentResult.archive instanceof PublicationObservationArchive, n('C1. the operation writes into a genuine PublicationObservationArchive — the SAME durable substrate every other reconciliation file already writes to'));
        assert(typeof divergentResult.archive.appendReconciliationDecisionRecord === 'function', n('C2. the archive\'s own existing appendReconciliationDecisionRecord method is the write path — not a new one'));
        assert(typeof divergentResult.archive.appendRevalidationObservationRecord === 'function', n('C3. the archive\'s own existing appendRevalidationObservationRecord method is the write path — not a new one'));

        const archiveSource = await readSource('application/PublicationObservationArchive.js');
        assert(!/reconciliationWorkspace|workspaceRecord|workspaceStore/i.test(archiveSource), n('C4. PublicationObservationArchive.js introduces no parallel "workspace" collection of any kind'));

        const newFileSource = await readSource('application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js');
        assert(!/new\s+Map\s*\(|new\s+Set\s*\(/.test(newFileSource.replace(/\/\/.*$/gm, '')), n('C5. the new use case holds no in-memory collection of its own — it introduces no hidden, parallel store'));

        console.log('\n=== SECTION C: EXISTING STORES, NO PARALLEL WORKSPACE STORE ===');
        console.log('✓ Section C: the operation\'s records reach the SAME, existing PublicationObservationArchive collections every other reconciliation file already writes to; no parallel workspace-only store exists anywhere.');
    }

    // ===============================================================
    // Section D — Result semantics: existing vocabulary, not an invented
    // lifecycle.
    // ===============================================================
    {
        assert(divergentResult.outcome === RevalidationObservationArchiveOutcome.RECORDED, n('D1. the success outcome IS the literal 0.8.167 RevalidationObservationArchiveOutcome.RECORDED value, echoed unchanged, never re-labeled'));

        // Checked against the OUTCOME VALUES THEMSELVES — the actual data a
        // caller receives and branches on — never against this file's own
        // prose, which legitimately NAMES the forbidden words once, in
        // English, to document that they were deliberately never minted
        // (the identical, established pattern 0.8.145's own header already
        // uses to name 'ACCEPT'/'REJECT' as excluded without containing
        // them as values).
        const allOutcomeValues = [
            ...Object.values(ReconcilePublisherLeaderboardSnapshotClaimOutcome),
            LeaderboardClaimArchiveReceiptOutcome.RECEIVED,
            LeaderboardClaimArchiveReceiptOutcome.INVALID_CLAIM,
            LeaderboardClaimArchiveReceiptOutcome.UNVERIFIABLE_CLAIM,
            ReconciliationDecisionArchiveOutcome.RECORDED,
            ReconciliationDecisionArchiveOutcome.INVALID_DECISION,
            RevalidationObservationArchiveOutcome.RECORDED,
            RevalidationObservationArchiveOutcome.INVALID_OBSERVATION
        ];
        const forbiddenLifecycleWords = [/STARTED/, /RUNNING/, /COMPLETE/, /IN_PROGRESS/, /PENDING/];
        for (const value of allOutcomeValues) {
            for (const pattern of forbiddenLifecycleWords) {
                assert(!pattern.test(value), n(`D2. outcome value "${value}" contains no invented lifecycle word matching ${pattern} — every possible \`outcome\` this operation can ever return is one of these exact, existing/data-fact literals`));
            }
        }
        // The only two NEW literals this file introduces are genuine data
        // facts (an invalid explicit timestamp; a plan naming no candidate
        // for this exact claim) — never a lifecycle state.
        assert(ReconcilePublisherLeaderboardSnapshotClaimOutcome.INVALID_EXECUTED_AT === 'INVALID_EXECUTED_AT', n('D3. INVALID_EXECUTED_AT is exactly the one new, non-lifecycle outcome literal for a malformed explicit timestamp'));
        assert(ReconcilePublisherLeaderboardSnapshotClaimOutcome.NO_RECONCILIATION_CANDIDATE === 'NO_RECONCILIATION_CANDIDATE', n('D4. NO_RECONCILIATION_CANDIDATE is exactly the one new, non-lifecycle outcome literal for an agreeing claim'));
        assert(Object.keys(ReconcilePublisherLeaderboardSnapshotClaimOutcome).length === 2, n('D5. exactly two new outcome literals exist — no third, unnecessary one was added'));

        console.log('\n=== SECTION D: RESULT SEMANTICS ===');
        console.log('✓ Section D: the operation returns the EXISTING reconciliation result vocabulary (RECEIVED/RECORDED/INVALID_*) rather than inventing a STARTED/RUNNING/COMPLETE-style lifecycle; its own two new literals are ordinary data facts, not states.');
    }

    // ===============================================================
    // Section E — Explicitness: no automatic caller anywhere.
    // ===============================================================
    {
        const uiFiles = execSync('git ls-files ui', { cwd: SOURCE_ROOT }).toString().split('\n').filter((f) => f.endsWith('.js'));
        // AMENDED BY 0.9.408 — Reconciliation Workspace UI. At THIS
        // milestone's own moment (0.9.407), the operation genuinely had
        // zero callers anywhere in `ui/`, which is the fact E1 originally
        // recorded. 0.9.408 built the first genuine UI call site — see
        // ui/views/ReconciliationWorkspaceView.js's own header. A boundary
        // test that kept asserting a superseded fact would be exactly the
        // staleness tests/ReconciliationLeaderboardEntryPointDecisionAudit
        // .test.js's own 0.9.403 amendment already rejected, so E1 now
        // asserts the CURRENT, truthful reachability instead: exactly the
        // one file 0.9.408 authorized GENUINELY IMPORTS the operation
        // (checked with this file's own `importsSymbol()`, Section A,
        // above — a real `import { ... }` binding, never a raw substring),
        // never a second, accidental caller — a router comment that merely
        // NAMES the file by name, as ui/router/index.js's own 0.9.408
        // comment does, correctly does not count.
        const uiFilesImportingOperation = [];
        for (const file of uiFiles) {
            const text = await readSource(file);
            if (importsSymbol(text, 'ReconcilePublisherLeaderboardSnapshotClaimUseCase')) {
                uiFilesImportingOperation.push(file);
            }
        }
        assert(
            uiFilesImportingOperation.length === 1 && uiFilesImportingOperation[0] === 'ui/views/ReconciliationWorkspaceView.js',
            n(`E1. exactly the one file 0.9.408 authorized to call this operation genuinely imports it — never a second, accidental caller (found: ${JSON.stringify(uiFilesImportingOperation)})`)
        );

        const newFileSource = await readSource('application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js');
        assert(!/setInterval|setTimeout|requestAnimationFrame|addEventListener|\.on\(/.test(newFileSource), n('E2. the new file contains no timer, interval, animation-frame loop, or event subscription of any kind — it can only ever run because a caller explicitly calls execute()'));
        assert(!/automatic\s*=\s*true|source\s*=\s*['"]leaderboard['"]/.test(newFileSource), n('E3. the new file accepts no automatic=true flag and no source="leaderboard" flag'));

        const applicationFiles = execSync('git ls-files application', { cwd: SOURCE_ROOT }).toString().split('\n').filter((f) => f.endsWith('.js') && f !== 'application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js');
        const applicationSourceBundle = (await Promise.all(applicationFiles.map((f) => readSource(f)))).join('\n');
        assert(!/\bReconcilePublisherLeaderboardSnapshotClaimUseCase\b/.test(applicationSourceBundle), n('E4. no OTHER application/ file references ReconcilePublisherLeaderboardSnapshotClaimUseCase either — it has no caller anywhere in current source'));

        console.log('\n=== SECTION E: EXPLICITNESS ===');
        console.log('✓ Section E: the new operation has zero call sites anywhere in current source (ui/ or application/), no timer/interval/subscription of its own, and accepts no automatic or source-flavored flag — it can only run because an explicit caller invokes execute().');
    }

    // ===============================================================
    // Section F — Leaderboard remains read-only; producer -> records ->
    // Leaderboard stays the only valid direction.
    // ===============================================================
    {
        const leaderboardViewSource = await readSource('ui/views/ReconciliationCandidateLeaderboardView.js');
        assert(!/\bReconcilePublisherLeaderboardSnapshotClaimUseCase\b/.test(leaderboardViewSource), n('F1. the Leaderboard\'s own view still does not reference the new reconciliation-producing operation — Leaderboard -> producer remains explicitly absent'));

        // The valid direction: feed the WORKSPACE operation\'s own written
        // archive into the Leaderboard\'s existing, UNCHANGED, read-only
        // entry point and confirm it renders the real row it produced.
        const page = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(divergentResult.archive, PublicationObservationArchive.empty());
        assert(page.isEmpty === false, n('F2. the Leaderboard\'s own real page projection is NOT empty once the workspace operation has produced genuine records'));
        assert(page.rowCount === 1, n('F3. exactly one real row is produced from the workspace\'s own single reconciliation run'));
        const row = page.rows[0];
        assert(row.candidate.claimId === divergentResult.candidate.claimId, n('F4. the row\'s own candidate identity is byte-consistent with the candidate the WORKSPACE operation itself selected — producer -> records -> Leaderboard, never the reverse'));
        assert(row.decisionEvidence.sourceOnlyCount === 1, n('F5. the row\'s own decision evidence genuinely reflects the ONE decision record the workspace operation just wrote into the source archive'));

        console.log('\n=== SECTION F: LEADERBOARD REMAINS READ-ONLY ===');
        console.log('✓ Section F: Leaderboard -> producer stays absent (F1); producer -> existing records -> Leaderboard is the only direction that exists, and it genuinely renders what the workspace operation produced (F2-F4).');
    }

    // ===============================================================
    // Section G — Failure isolation: existing per-stage vocabulary,
    // never a generic "workspace error."
    // ===============================================================
    {
        const useCase = new ReconcilePublisherLeaderboardSnapshotClaimUseCase(new LocalAuthorizationVerifier());

        const malformed = useCase.execute(PublicationObservationArchive.empty(), {}, T0);
        assert(malformed.outcome === LeaderboardClaimArchiveReceiptOutcome.INVALID_CLAIM, n('G1. a malformed peer-evidence payload reports EXACTLY the existing LeaderboardClaimArchiveReceiptOutcome.INVALID_CLAIM literal — never a new, generic "workspace error"'));
        assert(malformed.plan === null && malformed.candidate === null && malformed.decision === null && malformed.observation === null, n('G2. every downstream stage stays null — the pipeline genuinely stopped at stage 1, nothing further was attempted'));
        assert(malformed.archive instanceof PublicationObservationArchive && malformed.archive.leaderboardClaimRecords.length === 0, n('G3. no claim was durably recorded for a malformed payload'));

        const invalidTiming = useCase.execute(PublicationObservationArchive.empty(), {}, null);
        assert(invalidTiming.outcome === ReconcilePublisherLeaderboardSnapshotClaimOutcome.INVALID_EXECUTED_AT, n('G4. a missing/invalid executedAt reports INVALID_EXECUTED_AT before anything else is attempted'));
        assert(invalidTiming.receipt === null, n('G5. an invalid executedAt means the claim receipt stage never even ran — no partial side effect of any kind'));

        console.log('\n=== SECTION G: FAILURE ISOLATION ===');
        console.log('✓ Section G: a malformed claim reports the EXISTING LeaderboardClaimArchiveReceiptOutcome.INVALID_CLAIM literal, and an invalid explicit timestamp is rejected before any stage runs — neither is collapsed into a new, generic "workspace error."');
    }

    // ===============================================================
    // Section H — Production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/ReconciliationWorkspaceExecutionBoundary.test.js',
            'application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`H1. every changed/added file is one this milestone explicitly authorized (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const domainDirsExcludingNewFile = ['core', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'ui'];
        for (const dir of domainDirsExcludingNewFile) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`H2. ${dir}/ shows no change — this milestone touches only the one new application file`));
        }

        const applicationStatus = execSync('git status --porcelain -- application', { cwd: SOURCE_ROOT }).toString().split('\n').map((line) => line.trim()).filter(Boolean);
        const applicationChangedFiles = applicationStatus.map((line) => line.slice(3).trim());
        assert(applicationChangedFiles.length === 1 && applicationChangedFiles[0] === 'application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js', n('H3. application/ shows exactly one changed file — the new use case — never a modification to any EXISTING reconciliation-family file'));

        console.log('\n=== SECTION H: PRODUCTION BOUNDARY ===');
        console.log('✓ Section H: only application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js (new), this test file, and tests.html\'s own registration changed. No existing production file was modified.');
    }

    console.log('\n' + '='.repeat(78));
    console.log('RECONCILIATION_WORKSPACE_EXECUTION_BOUNDARY_ESTABLISHED');
    console.log('');
    console.log('application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js is now the');
    console.log('ONE explicit application operation composing the full, UNCHANGED five-stage');
    console.log('reconciliation producer chain, reachable only by explicit caller action.');
    console.log('The Leaderboard remains exactly what 0.9.406 decided it must stay: a');
    console.log('read-only observer of records this new operation — and only this operation —');
    console.log('produces. No UI was built; that is 0.9.408\'s own, separately sized question.');
    console.log('='.repeat(78));

    console.log('\n✅ All Reconciliation Workspace Execution Boundary tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
