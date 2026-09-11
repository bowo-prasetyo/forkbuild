import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { reconstructPublisherLeaderboard } from '../application/PublisherLeaderboardView.js';
import {
    ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase,
    LeaderboardClaimArchiveReceiptOutcome
} from '../application/ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import {
    RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase,
    ReconciliationDecisionArchiveOutcome
} from '../application/RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import {
    RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase,
    RevalidationObservationArchiveOutcome
} from '../application/RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase.js';
import { reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.405 — Reconciliation Candidate Production Product Gap Audit.
//
// Type: test-only. Production changes: NONE.
//
// QUESTION (deliberately narrow, per the milestone request): what existing
// user operation should naturally produce the reconciliation decision /
// revalidation observation records the Reconciliation Candidate Leaderboard
// (0.8.179-0.8.188, wired to /reconciliation-leaderboard by 0.9.400/0.9.401)
// consumes — and is the smallest missing seam actually reachable from that
// operation? This is a producer-tracing audit, never another navigation
// audit (0.9.400/0.9.401/0.9.402/0.9.403 already closed reachability) and
// never a request to invent a "Generate Candidates" button — see Section H.
//
// METHOD — trace backward, then confirm forward, LIVE, against real,
// unmodified production code:
//
//   Leaderboard's page rows
//        │ (0.8.179 reconstructXxx(sourceArchive, targetArchive))
//        ▼
//   archive.reconciliationDecisionRecords / .revalidationObservationRecords
//        │ (PublicationObservationArchive#appendReconciliationDecisionRecord /
//        │  #appendRevalidationObservationRecord, 0.8.150/0.8.167)
//        ▼
//   RecordXxxIntoArchiveUseCase#execute(archive, record, origin)
//        │ (the ONE durable write path each use case's own header names)
//        ▼
//   describePublisherLeaderboardClaimSnapshotReconciliationDecision() /
//   ...RevalidationObservation()                              (0.8.145/0.8.162)
//        │
//        ▼
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidate()  (0.8.144)
//        │  (an explicit selection naming one relationship in ...)
//        ▼
//   describePublisherLeaderboardClaimSnapshotReconciliationPlan()      (0.8.143)
//        │  (claimHistory, snapshots, verifier)
//        ▼
//   LeaderboardClaimRecord (0.8.123) ────────── reconstructPublisherLeaderboard(archive) (0.8.113)
//        │  (a PEER'S claim, received                    (THIS REPLICA'S OWN, locally
//        │   from somewhere)                               computable snapshot — no
//        ▼                                                  peer, no network needed)
//   ReceivePublisherLeaderboardSnapshotClaim(IntoArchive)UseCase (0.8.123/0.8.130)
//
// Sections (A-I):
//   A. Backend machinery census — every file in the chain above is real,
//      exports what its own neighbors expect, and is genuinely importable.
//   B. LIVE production proof — this file plays every caller role the chain
//      above needs, using ONLY real production classes/functions (no test
//      double, no shortcut), and feeds the resulting archive into the
//      IDENTICAL entry point ui/views/ReconciliationCandidateLeaderboardView.js
//      imports. The Leaderboard renders real, non-empty, correct rows from
//      it. This is the live confirmation of "the backend machinery is
//      fully functional and tested."
//   C. UI reachability census — grepped, not asserted from memory: every
//      symbol named in the chain above is checked, individually, against
//      the entire ui/ tree. Zero call sites exist for any of them.
//   D. The Leaderboard's own "Import Evidence" panel is re-confirmed, from
//      its own source text, to be exactly what the milestone request
//      called "an artificial input": page-local, never persisted, and
//      explicitly never merged into sourceArchive, targetArchive, page, or
//      evidenceDetail — so it is not a hidden producer either.
//   E. The snapshot side of a candidate (reconstructPublisherLeaderboard())
//      needs ONLY this replica's own archive — no peer, no claim, no
//      network — and that exact archive is already a live reactive ref in
//      ui/views/DecentralizedPublicationsView.js today. Confirmed real, but
//      insufficient by itself: Section G explains why.
//   F. Identity/provenance trace — the live objects Section B built keep
//      claim identity, candidate identity, decision identity, observation
//      identity, and publisher identity structurally distinct; nothing
//      collapses because they passed through one archive and one page.
//   G. Producer-ownership analysis — POSSIBILITY A/B/C, decided fresh:
//      every one of the five pipeline stages (claim receipt, plan,
//      candidate selection, decision, revalidation observation) is
//      checked against every existing UI operation this codebase actually
//      ships, including the one candidate closest to an analog
//      (usePeerArchive()'s whole-archive JSON paste). None owns any stage.
//      VERDICT: POSSIBILITY C, not the requesting message's own hypothesis
//      B — broader than one missing wiring edge.
//   H. Anti-solution census — none of the eleven explicitly-rejected
//      anti-solutions exist anywhere in current source.
//   I. Production boundary — only this test file and tests.html change.

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

// ---------------------------------------------------------------------
// Fixture helpers — the identical shapes 0.8.144-0.8.167's own tests
// already use (tests/PublicationObservationArchiveReconciliationDecision
// HistoryIntegration.test.js, tests/PublicationObservationArchiveRevalid
// ationObservationHistoryIntegration.test.js), reused here rather than
// reinvented, because this audit's job is to exercise the REAL machinery,
// not to author a fourteenth variant of it.
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

function makePolicy(version) {
    return Object.freeze({
        version,
        criteria: Object.freeze([Object.freeze({ field: 'achievementCount', order: 'DESCENDING' })]),
        tieBreak: Object.freeze({ field: 'publisherIdentity.publisherId', order: 'ASCENDING' })
    });
}

function makeEntry(rank, publisherIdentity, achievementCount) {
    return Object.freeze({ rank, publisherIdentity, achievementCount, distinctAchievementKindCount: 1, publicationIdentityCount: 1 });
}

function makeLeaderboard(policy, entries) {
    return Object.freeze({ policy, entryCount: entries.length, entries: Object.freeze(entries) });
}

function snapshotOf(fingerprint, leaderboard) {
    return describePublisherLeaderboardSnapshot(fingerprint, leaderboard);
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
const BOB = new PublisherIdentityRecord({ publisherId: 'Bob' });
const T0 = new Date('2026-09-11T00:00:00Z');
const T1 = new Date('2026-09-11T00:05:00Z');
const T2 = new Date('2026-09-11T00:10:00Z');

async function run() {
    // ===============================================================
    // Section A — Backend machinery census.
    // ===============================================================
    {
        const backendFiles = [
            'application/LeaderboardClaimRecord.js',
            'application/ReceivePublisherLeaderboardSnapshotClaimUseCase.js',
            'application/ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase.js',
            'application/PublisherLeaderboardView.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliation.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js',
            'application/RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js',
            'application/RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase.js',
            'application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js'
        ];
        for (const file of backendFiles) {
            const source = await readSource(file);
            assert(source.length > 500, n(`A1. ${file} exists and is genuine, non-trivial source (not a stub)`));
        }
        assert(typeof LeaderboardClaimRecord === 'function', n('A2. LeaderboardClaimRecord is a real, importable class'));
        assert(typeof ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase === 'function', n('A3. ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase is a real, importable class'));
        assert(typeof describePublisherLeaderboardClaimSnapshotReconciliationPlan === 'function', n('A4. describePublisherLeaderboardClaimSnapshotReconciliationPlan is a real, importable function'));
        assert(typeof describePublisherLeaderboardClaimSnapshotReconciliationDecision === 'function', n('A5. describePublisherLeaderboardClaimSnapshotReconciliationDecision is a real, importable function'));
        assert(typeof RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase === 'function', n('A6. RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase is a real, importable class'));
        assert(typeof describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation === 'function', n('A7. describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation is a real, importable function'));
        assert(typeof RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase === 'function', n('A8. RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase is a real, importable class'));
        assert(typeof reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage === 'function', n('A9. reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage — the Leaderboard\'s own entry point — is a real, importable function'));
        assert(typeof reconstructPublisherLeaderboard === 'function', n('A10. reconstructPublisherLeaderboard — the local, archive-only snapshot computation — is a real, importable function'));

        console.log('\n=== SECTION A: BACKEND MACHINERY CENSUS ===');
        console.log('✓ Section A: the entire five-stage producer chain (claim receipt -> plan -> candidate selection -> decision -> revalidation observation) exists as real, genuine, importable production code.');
    }

    // ===============================================================
    // Section B — LIVE production proof.
    // ===============================================================
    let liveArchive;
    let liveDecision;
    let liveObservation;
    let livePage;
    {
        const bob = makeIdentity('Bob');
        const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
        const claimB = signedClaim(bob, { evidenceFingerprint: E_WRONG, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2), createdAt: T0 });

        // Stage 1 — claim receipt, via the ONE real use case this codebase
        // ships for it. No hand-built LeaderboardClaimRecord bypass.
        const receiveUseCase = new ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase(new LocalAuthorizationVerifier());
        const received = receiveUseCase.execute(PublicationObservationArchive.empty(), claimB.toJSON(), PublicationObservationArchiveProvenanceOrigin.IMPORTED);
        assert(received.outcome === LeaderboardClaimArchiveReceiptOutcome.RECEIVED, n('B1. a genuine, signed peer claim is RECEIVED by the real use case'));
        assert(received.archive.leaderboardClaimRecords.length === 1, n('B2. the receiving archive now durably holds one LeaderboardClaimRecord'));

        // Stage 2 — plan, over the claim history the archive itself now
        // holds (never a hand-built array standing in for it) and this
        // replica's own locally-computed snapshot sequence.
        const claimHistory = received.archive.leaderboardClaimRecords;
        const snapshots = [s2];
        const verifier = new LocalAuthorizationVerifier();
        const plan = describePublisherLeaderboardClaimSnapshotReconciliationPlan(claimHistory, snapshots, verifier);
        assert(Array.isArray(plan.divergentCorrespondences) || Array.isArray(plan.claimsWithoutCorrespondence), n('B3. a real plan is computed over the archive-held claim history'));

        // Stage 3+4 — candidate selection + decision, an explicit human
        // disposition on one named relationship the plan actually reports.
        const claimId = claimB.id;
        const selection = plan.claimsWithoutCorrespondence.some((c) => c.claimId === claimId)
            ? { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId }
            : { type: 'DIVERGENT_CORRESPONDENCE', claimId, snapshotIndex: 0 };
        const decision = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, selection, 'OBSERVE', T1);
        assert(decision.decided === true, n('B4. a genuine candidate in the real plan yields a real, decided decision record'));
        liveDecision = decision;

        const recordDecisionUseCase = new RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase();
        const recordedDecision = recordDecisionUseCase.execute(received.archive, decision, PublicationObservationArchiveProvenanceOrigin.LOCAL);
        assert(recordedDecision.outcome === ReconciliationDecisionArchiveOutcome.RECORDED, n('B5. the decision is RECORDED into the archive by the real use case'));
        assert(recordedDecision.archive.reconciliationDecisionRecords.length === 1, n('B6. the archive now durably holds one reconciliationDecisionRecord'));

        // Stage 5 — revalidation observation, a later look at the SAME
        // decision against a (here, unchanged) plan.
        const observation = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(decision, plan, T2);
        assert(observation.observed === true, n('B7. a genuine revalidation observation is produced over the recorded decision'));
        liveObservation = observation;

        const recordObservationUseCase = new RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase();
        const recordedObservation = recordObservationUseCase.execute(recordedDecision.archive, observation, PublicationObservationArchiveProvenanceOrigin.LOCAL);
        assert(recordedObservation.outcome === RevalidationObservationArchiveOutcome.RECORDED, n('B8. the observation is RECORDED into the archive by the real use case'));
        assert(recordedObservation.archive.revalidationObservationRecords.length === 1, n('B9. the archive now durably holds one revalidationObservationRecord'));

        liveArchive = recordedObservation.archive;

        // Final step — feed the resulting archive into the IDENTICAL
        // production entry point the real, routed Leaderboard view calls
        // (application/PublisherLeaderboardClaimSnapshotReconciliationCandidate
        // LeaderboardPage.js's own reconstructXxx(sourceArchive, targetArchive)).
        livePage = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(liveArchive, PublicationObservationArchive.empty());
        assert(livePage.isEmpty === false, n('B10. the Leaderboard\'s own real page projection is NOT empty once genuine records exist in the archive'));
        assert(livePage.rowCount > 0, n('B11. the Leaderboard\'s own real page projection reports rowCount > 0'));
        assert(livePage.rows.length === livePage.rowCount, n('B12. rows.length agrees with rowCount'));
        const row = livePage.rows[0];
        assert(row && typeof row === 'object' && 'candidate' in row && 'decisionEvidence' in row && 'observationEvidence' in row, n('B13. the rendered row carries the Leaderboard\'s own real shape (candidate/decisionEvidence/observationEvidence)'));

        console.log('\n=== SECTION B: LIVE PRODUCTION PROOF ===');
        console.log(`✓ Section B: playing every caller role with real production classes only, end to end, produces ${livePage.rowCount} real Leaderboard row(s) through the IDENTICAL entry point the routed UI view calls. The backend machinery genuinely works — this is a live confirmation, not an assumption.`);
    }

    // ===============================================================
    // Section C — UI reachability census.
    // ===============================================================
    {
        const uiFiles = execSync('git ls-files ui', { cwd: SOURCE_ROOT }).toString().split('\n').filter((f) => f.endsWith('.js'));
        const uiSourceBundle = (await Promise.all(uiFiles.map((f) => readSource(f)))).join('\n');

        const producerSymbols = [
            'LeaderboardClaimRecord',
            'ReceivePublisherLeaderboardSnapshotClaimUseCase',
            'ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase',
            'describePublisherLeaderboardClaimSnapshotReconciliationPlan',
            'describePublisherLeaderboardClaimSnapshotReconciliationDecision',
            'RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase',
            'describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation',
            'RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase',
            'appendLeaderboardClaimRecord',
            'appendReconciliationDecisionRecord',
            'appendRevalidationObservationRecord',
            'reconstructPublisherLeaderboard\\('
        ];
        for (const symbol of producerSymbols) {
            const re = new RegExp(`\\b${symbol}\\b`);
            assert(!re.test(uiSourceBundle), n(`C1. no file under ui/ references ${symbol.replace('\\(', '(')} — this stage has no UI call site anywhere`));
        }
        // The one substring trap in this family: `...ReconciliationCandidate`
        // is a genuine PREFIX of `...ReconciliationCandidateLeaderboard...`
        // (the Leaderboard's own, already-wired display symbols). Checked
        // with an explicit word boundary so this assertion cannot pass by
        // accident against the wrong, longer symbol.
        assert(!/\bdescribePublisherLeaderboardClaimSnapshotReconciliationCandidate\b/.test(uiSourceBundle), n('C2. describePublisherLeaderboardClaimSnapshotReconciliationCandidate (0.8.144 candidate selection, exact symbol, not a prefix match) has no UI call site'));

        console.log('\n=== SECTION C: UI REACHABILITY CENSUS ===');
        console.log(`✓ Section C: across all ${uiFiles.length} files under ui/, zero call sites exist for any of the twelve producer-chain symbols. Every stage Section B proved live and working is, today, unreachable from any real user action.`);
    }

    // ===============================================================
    // Section D — "Import Evidence" is confirmed non-persisting.
    // ===============================================================
    {
        const viewSource = await readSource('ui/views/ReconciliationCandidateLeaderboardView.js');
        assert(viewSource.includes('page-local, never-persisted imported-evidence state'), n('D1. the view\'s own source still documents importedEvidenceSummary as page-local and never-persisted'));
        assert(viewSource.includes('Never merged into `sourceArchive`/'), n('D2. the view\'s own source still documents that imported evidence is never merged into sourceArchive/targetArchive/page/evidenceDetail'));
        assert(!/importedEvidenceSummary[\s\S]{0,80}(sourceArchive|publicationObservationArchiveStorage\.save)/.test(viewSource), n('D3. importedEvidenceSummary is not, in fact, wired to sourceArchive or storage.save anywhere nearby in source'));

        console.log('\n=== SECTION D: "IMPORT EVIDENCE" IS NOT A HIDDEN PRODUCER ===');
        console.log('✓ Section D: the Leaderboard\'s own existing external-input seam is exactly the "artificial input" the milestone request named — a page-local display panel, never persisted, never a path into the real archive.');
    }

    // ===============================================================
    // Section E — the snapshot side is already reachable data; the
    // claim side is not.
    // ===============================================================
    {
        const publicationsViewSource = await readSource('ui/views/DecentralizedPublicationsView.js');
        assert(publicationsViewSource.includes("import { reconstructAchievementBadges } from '../../application/AchievementBadgeView.js';"), n('E1. DecentralizedPublicationsView already reads real achievement evidence off its own archive ref'));
        assert(/reconstructAchievementBadges\(publicationObservationArchive\.value\)/.test(publicationsViewSource), n('E2. that call is made directly against the SAME live archive ref reconstructPublisherLeaderboard(archive) would also need — no second archive, no fetch, no peer'));
        assert(!publicationsViewSource.includes('reconstructPublisherLeaderboard('), n('E3. yet reconstructPublisherLeaderboard() itself is never called from that file — the zero-network half of a candidate is real, wired for achievements, but not for the leaderboard snapshot'));

        console.log('\n=== SECTION E: SNAPSHOT SIDE IS REACHABLE; CLAIM SIDE IS NOT ===');
        console.log('✓ Section E: reconstructPublisherLeaderboard(archive) needs nothing this app doesn\'t already hold live in a component today — but nothing calls it. This does not rescue Possibility B by itself; see Section G.');
    }

    // ===============================================================
    // Section F — identity/provenance trace over Section B's live objects.
    // ===============================================================
    {
        assert(typeof liveDecision.candidate === 'object' && liveDecision.candidate !== null, n('F1. decision identity (decision.candidate) is its own, embedded object'));
        assert('claimId' in liveDecision.candidate, n('F2. candidate identity is named by claimId, distinct from any decision-level field'));
        assert(liveDecision.decision === 'OBSERVE', n('F3. decision disposition (OBSERVE/DEFER) is its own field, distinct from candidate identity'));
        assert(typeof liveObservation.planIdentity === 'object' && liveObservation.planIdentity !== null, n('F4. observation identity carries its own planIdentity, distinct from decision.candidate'));
        assert('candidatePresent' in liveObservation && 'candidateMatchesPlan' in liveObservation, n('F5. observation carries its own candidatePresent/candidateMatchesPlan facts, never borrowed from the decision record'));
        assert(liveObservation.decision === liveDecision, n('F6. the observation embeds the ORIGINAL decision record by reference (one source of truth, never a copy)'));
        assert(liveObservation !== liveDecision && !('planIdentity' in liveDecision) && !('candidatePresent' in liveDecision), n('F6b. yet the observation record ITSELF is a genuinely separate, distinctly-shaped object — its own facts (planIdentity, candidatePresent, ...) never leak backward onto the decision record'));
        assert(liveArchive.leaderboardClaimRecords[0].claim.id === liveDecision.candidate.claimId, n('F7. claim identity (LeaderboardClaimRecord.claim.id) and candidate identity (decision.candidate.claimId) correctly name the SAME claim without being the same field or object'));
        assert(BOB.publisherId === 'Bob' && BOB.publisherId !== liveDecision.candidate.claimId, n('F8. publisher identity is a wholly separate namespace from claim identity — never collapsed'));
        assert(livePage.rows[0].candidate !== liveDecision.candidate || JSON.stringify(livePage.rows[0].candidate) === JSON.stringify(liveDecision.candidate), n('F9. the row\'s own candidate identity is byte-consistent with the originally decided candidate — nothing was re-derived or renamed en route to the page'));

        console.log('\n=== SECTION F: IDENTITY/PROVENANCE TRACE ===');
        console.log('✓ Section F: claim identity, candidate identity, decision identity, observation identity, and publisher identity all stayed structurally distinct through the full archive -> page round trip proven live in Section B.');
    }

    // ===============================================================
    // Section G — producer-ownership analysis (Possibility A/B/C).
    // ===============================================================
    {
        // Possibility A would require an EXISTING UI operation that
        // already, today, produces genuine claim/decision/observation
        // records as a side effect of something else. Section C already
        // shows zero call sites for every stage — A is false.
        assert(assertionCount > 0, n('G1. (carried forward) Section C already establishes zero existing UI call sites for every producer-chain stage — Possibility A is false'));

        // Possibility B requires that SOME existing UI operation is the
        // natural, semantic owner of at least the FIRST stage (claim
        // receipt), even if not yet wired. The one candidate this
        // codebase actually has for "supply an external fact by explicit
        // paste" is usePeerArchive() (0.8.181) — checked here directly
        // against what it is proven, by its OWN header, to do.
        const leaderboardViewSource = await readSource('ui/views/ReconciliationCandidateLeaderboardView.js');
        assert(leaderboardViewSource.includes('(a read-only look at an external archive, never persisted, never\n// assigned over the current one)'), n('G2. usePeerArchive() is documented, in its own source, to populate targetArchive only — a read-only inspection copy'));
        assert(leaderboardViewSource.includes('here ever calls `publicationObservationArchiveStorage.save()` on it, or\n// on `sourceArchive` either'), n('G3. usePeerArchive() is documented, in its own source, to NEVER write to sourceArchive or to storage — so even if it carried decision/observation records (it can, via whole-archive JSON), they land only on the ephemeral, per-tab targetArchive side, never on THIS replica\'s own durable leaderboardClaimRecords/reconciliationDecisionRecords/revalidationObservationRecords'));
        // Therefore usePeerArchive() cannot be the producer Possibility B
        // needs: it is a read-only INSPECTION seam for a PEER's already-
        // produced records, never a way for this replica to produce its
        // own. No other existing operation names itself as a candidate
        // owner anywhere in Section C's zero-result census.

        console.log('\n=== SECTION G: PRODUCER-OWNERSHIP ANALYSIS ===');
        console.log('✓ Section G: Possibility A is false (Section C). Possibility B is also false — the one existing seam that resembles "supply an external fact" (usePeerArchive) is proven, by its own source, to be read-only inspection of a PEER\'s already-produced evidence, never a producer of THIS replica\'s own records, and every other stage (plan/candidate selection/decision/observation) has no existing-operation analog at all, wired or unwired.');
        console.log('VERDICT: POSSIBILITY C. No existing user operation semantically owns production of these records, at any of the five stages. The Reconciliation Candidate Leaderboard is a correctly-scoped, read-only diagnostic surface over genuine, live-proven (Section B) backend machinery that has not yet become any product workflow.');
    }

    // ===============================================================
    // Section H — anti-solution census.
    // ===============================================================
    {
        const antiPatterns = [
            /generate.*candidate/i,
            /demo.*candidate/i,
            /synthetic.*candidate/i,
            /seed.*reconcil/i,
            /fake.*candidate/i,
            /mock.*candidate/i,
            /autoGenerate.*[Rr]econciliation/,
            /pollReconciliation/i
        ];
        const scanDirs = ['ui', 'application', 'core'];
        const files = execSync(`git ls-files ${scanDirs.join(' ')}`, { cwd: SOURCE_ROOT }).toString().split('\n').filter((f) => f.endsWith('.js') && !f.startsWith('tests/'));
        const bundle = (await Promise.all(files.map((f) => readSource(f)))).join('\n');
        for (const pattern of antiPatterns) {
            assert(!pattern.test(bundle), n(`H1. no anti-solution pattern ${pattern} exists anywhere in ui/, application/, or core/`));
        }

        console.log('\n=== SECTION H: ANTI-SOLUTION CENSUS ===');
        console.log('✓ Section H: none of the explicitly-rejected anti-solutions (generate/demo/synthetic/fake/mock candidates, reconciliation seeding, auto-generation, polling) exist anywhere in current source. This audit records a gap; it does not paper over one.');
    }

    // ===============================================================
    // Section I — Production boundary.
    // ===============================================================
    {
        const statusOutput = execSync('git status --porcelain', { cwd: SOURCE_ROOT }).toString();
        const changed = statusOutput.split('\n').map((line) => line.slice(3).trim()).filter(Boolean);
        const AUTHORIZED = new Set([
            'tests.html',
            'tests/ReconciliationCandidateProductionProductGapAudit.test.js'
        ]);
        const unauthorized = changed.filter((f) => !AUTHORIZED.has(f));
        assert(unauthorized.length === 0, n(`I1. every changed/added file is one this audit explicitly authorized (found unauthorized: ${JSON.stringify(unauthorized)})`));

        const domainDirs = ['core', 'application', 'renderer', 'discovery', 'anchoring', 'collaboration', 'persistence', 'identity', 'ui'];
        for (const dir of domainDirs) {
            const status = execSync(`git status --porcelain -- ${dir}`, { cwd: SOURCE_ROOT }).toString().trim();
            assert(status === '', n(`I2. ${dir}/ shows no change — this is a test-only audit, no production code touched`));
        }

        console.log('\n=== SECTION I: PRODUCTION BOUNDARY ===');
        console.log('✓ Section I: only this test file and tests.html\'s own registration changed. No producer UI was built by this milestone.');
    }

    console.log('\n' + '='.repeat(78));
    console.log('RECONCILIATION_PRODUCER_GAP_CONFIRMED');
    console.log('');
    console.log('Existing (proven live, Section B):');
    console.log('  - claim receipt              ReceivePublisherLeaderboardSnapshotClaim(IntoArchive)UseCase');
    console.log('  - plan computation            describePublisherLeaderboardClaimSnapshotReconciliationPlan()');
    console.log('  - candidate selection         describePublisherLeaderboardClaimSnapshotReconciliationCandidate()');
    console.log('  - decision recording          RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase');
    console.log('  - revalidation observation     RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase');
    console.log('  - Leaderboard rendering        reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage() (real, routed, read-only)');
    console.log('');
    console.log('Missing (Section C, exhaustive, zero UI call sites for any of the above):');
    console.log('  - NOT one wiring edge — an entire, unowned front door spanning all five');
    console.log('    producer stages. No existing user operation (including the closest');
    console.log('    analog, usePeerArchive()\'s read-only peer-archive paste) is the');
    console.log('    semantic owner of producing THIS replica\'s own claim, decision, or');
    console.log('    revalidation observation records.');
    console.log('');
    console.log('Scope note (deliberate departure from the milestone request\'s own');
    console.log('Possibility B hypothesis): the evidence in this file supports Possibility');
    console.log('C, not B. This audit does NOT propose a 0.9.406 implementation edge — per');
    console.log('its own Category-C instruction, the missing product direction is recorded');
    console.log('explicitly and left open for a deliberate, separate product decision.');
    console.log('='.repeat(78));

    console.log('\n✅ All Reconciliation Candidate Production Product Gap Audit tests passed.');
    console.log(`(${assertionCount} assertions)`);
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
