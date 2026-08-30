import { describePublisherLeaderboardSnapshot } from '../application/PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardSnapshotFingerprint } from '../application/PublisherLeaderboardSnapshotFingerprint.js';
import { LeaderboardClaimRecord } from '../application/LeaderboardClaimRecord.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from '../application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationView.js';
import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherLeaderboardSnapshotClaim } from '../core/PublisherLeaderboardSnapshotClaim.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.8.158 — Reconciliation Decision History Revalidation Projection.
//
// Section A: input validation — null/malformed decisionHistory, malformed
//            plan; never throws
// Section B: single decision, all three candidate types
// Section C: multiple decisions — one independent 0.8.157 evaluation each
// Section D: FLAGSHIP — the same history evaluated against two explicitly
//            supplied plans (D1..D4 historical vs. a later plan) produces
//            different candidateMatchesPlan values while preserving every
//            historical decision unchanged
// Section E: candidate multiplicity — [D1, D1, D2] produces three
//            revalidation entries, never deduplicated
// Section F: disposition independence — OBSERVE/DEFER never affect
//            candidate matching
// Section G: candidate identity precision — C1/S1 != C1/S2,
//            CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT(C1) !=
//            SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM(S1)
// Section H: immutability
// Section I: determinism
// Section J: architectural boundary — exactly one import (0.8.157), no
//            archive/plan-reconstruction/0.8.144/verification/
//            decision-generation imports, no state-machine vocabulary,
//            no reconstructXxx() entry point

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

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

const E2 = '2'.repeat(64);
const E3 = '3'.repeat(64);
const E4 = '4'.repeat(64);
const E_WRONG = '9'.repeat(64);
const BOB = new PublisherIdentityRecord({ publisherId: 'Bob' });
const DIANA = new PublisherIdentityRecord({ publisherId: 'Diana' });

function signedClaim(identityProvider, { evidenceFingerprint, policyVersion, snapshotFingerprint, createdAt = new Date('2026-08-30T00:00:00Z') }) {
    const signerIdentityId = resolveSigningIdentityId(identityProvider);
    let claim = new PublisherLeaderboardSnapshotClaim({ evidenceFingerprint, policyVersion, snapshotFingerprint, signerIdentityId, createdAt });
    const signature = identityProvider.signCanonical(claim.getSigningDescriptor());
    return claim.withSignature(signature);
}

function recordFor(claim, receivedAt = new Date('2026-08-30T04:00:00Z')) {
    return new LeaderboardClaimRecord({ claim, receivedAt });
}

function decide(plan, selection, disposition, decidedAt) {
    return describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, selection, disposition, decidedAt);
}

const T1 = new Date('2026-08-30T10:00:00Z');
const T2 = new Date('2026-08-30T10:03:00Z');
const T3 = new Date('2026-08-30T10:06:00Z');
const T4 = new Date('2026-08-30T10:09:00Z');

// The identical four-scenario world 0.8.144/0.8.153/0.8.156/0.8.157's own
// tests already use: Claim B genuinely diverges against both S2 (index 0)
// and S3 (index 1), Claim C has no corresponding snapshot, Snapshot S4
// (index 2) has no corresponding claim.
function buildWorld() {
    const bob = makeIdentity('Bob');
    const carl = makeIdentity('Carl');

    const s2 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
    const s3 = snapshotOf(E2, makeLeaderboard(makePolicy(2), [makeEntry(1, BOB, 5)]));
    const s4 = snapshotOf(E4, makeLeaderboard(makePolicy(4), [makeEntry(1, DIANA, 9)]));
    const snapshots = [s2, s3, s4];

    const claimB = signedClaim(bob, { evidenceFingerprint: E_WRONG, policyVersion: 2, snapshotFingerprint: fingerprintOf(s2) });
    const claimC = signedClaim(carl, { evidenceFingerprint: E3, policyVersion: 1, snapshotFingerprint: 'f'.repeat(64) });

    const claimHistory = [recordFor(claimB), recordFor(claimC)];
    const verifier = new LocalAuthorizationVerifier();
    const plan = describePublisherLeaderboardClaimSnapshotReconciliationPlan(claimHistory, snapshots, verifier);

    return { plan, claimB, claimC };
}

function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({ decided: true, candidate: Object.freeze(candidate), decision, decidedAt: decidedAt.toISOString() });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — input validation.
    // ---------------------------------------------------------------
    {
        const { plan } = buildWorld();

        const nullHistory = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation(null, plan);
        assert(nullHistory.decisionCount === 0, '1. a null decisionHistory produces decisionCount: 0');
        assert(nullHistory.presentCandidateCount === 0, '2. a null decisionHistory produces presentCandidateCount: 0');
        assert(nullHistory.absentCandidateCount === 0, '3. a null decisionHistory produces absentCandidateCount: 0');
        assert(Array.isArray(nullHistory.revalidations) && nullHistory.revalidations.length === 0, '4. a null decisionHistory produces revalidations: []');

        const undefinedHistory = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation(undefined, plan);
        assert(undefinedHistory.decisionCount === 0, '5. an undefined decisionHistory degrades identically to null, never throws');

        const notAnArray = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation('not a history', plan);
        assert(notAnArray.decisionCount === 0, '6. a non-array decisionHistory degrades to decisionCount: 0, never throws');

        const emptyArray = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([], plan);
        assert(emptyArray.decisionCount === 0 && emptyArray.revalidations.length === 0, '7. an empty array produces decisionCount: 0 and revalidations: []');

        const malformedEntries = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation(
            [null, undefined, 'not a decision', { decided: false }, { decided: true, decision: 'OBSERVE', decidedAt: T1.toISOString() }],
            plan
        );
        assert(malformedEntries.decisionCount === 0, '8. an array of entirely malformed entries produces decisionCount: 0, never throws');

        const genuine = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'anything' }, 'OBSERVE', T1);
        const nullPlan = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([genuine], null);
        assert(nullPlan.decisionCount === 1, '9. a null plan still reports decisionCount: 1 for a genuine decision, never throws');
        assert(nullPlan.revalidations[0].candidatePresent === false, '10. a null plan reads candidatePresent: false for every decision');
        assert(nullPlan.absentCandidateCount === 1 && nullPlan.presentCandidateCount === 0, '11. a null plan reports the one distinct candidate as absent');

        const malformedPlan = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([genuine], { claimsWithoutCorrespondence: 'not an array' });
        assert(malformedPlan.revalidations[0].candidatePresent === false, '12. a malformed plan degrades to candidatePresent: false, never throws');
    }
    console.log('✓ Section A: malformed/absent decision histories and plans degrade to explicit, non-throwing outcomes');

    // ---------------------------------------------------------------
    // Section B — single decision, all three candidate types.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();

        const D_DIVERGENT = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const rDivergent = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([D_DIVERGENT], plan);
        assert(rDivergent.decisionCount === 1, '13. a single decision produces decisionCount: 1');
        assert(rDivergent.revalidations.length === 1, '14. a single decision produces exactly one revalidations entry');
        assert(rDivergent.revalidations[0].decisionIndex === 0, '15. the single entry carries decisionIndex: 0');
        assert(rDivergent.revalidations[0].candidateType === 'DIVERGENT_CORRESPONDENCE', '16. DIVERGENT_CORRESPONDENCE candidateType is preserved');
        assert(rDivergent.revalidations[0].candidatePresent === true && rDivergent.revalidations[0].candidateMatchesPlan === true, '17. a genuine DIVERGENT_CORRESPONDENCE candidate is present in the plan it was drawn from');
        assert(rDivergent.presentCandidateCount === 1 && rDivergent.absentCandidateCount === 0, '18. one present distinct candidate is tallied');
        assert(serialize(rDivergent.revalidations[0].decision) === serialize(D_DIVERGENT), '19. the decision is echoed unchanged');

        const D_CLAIM = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T1);
        const rClaim = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([D_CLAIM], plan);
        assert(rClaim.revalidations[0].candidateType === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', '20. CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidateType is preserved');
        assert(rClaim.revalidations[0].candidatePresent === true, '21. a genuine CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate is present in the plan it was drawn from');

        const D_SNAPSHOT = decide(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'OBSERVE', T1);
        const rSnapshot = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([D_SNAPSHOT], plan);
        assert(rSnapshot.revalidations[0].candidateType === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', '22. SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM candidateType is preserved');
        assert(rSnapshot.revalidations[0].candidatePresent === true, '23. a genuine SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM candidate is present in the plan it was drawn from');

        const emptyPlan = Object.freeze({ divergentCorrespondences: [], claimsWithoutCorrespondence: [], snapshotsWithoutCorrespondence: [] });
        const rAbsent = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([D_DIVERGENT], emptyPlan);
        assert(rAbsent.revalidations[0].candidatePresent === false, '24. an empty plan reports the candidate as absent');
        assert(rAbsent.presentCandidateCount === 0 && rAbsent.absentCandidateCount === 1, '25. an empty plan tallies the one distinct candidate as absent');
    }
    console.log('✓ Section B: a single decision of any of the three candidate types is correctly revalidated');

    // ---------------------------------------------------------------
    // Section C — multiple decisions: one independent 0.8.157 evaluation
    // per decision.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();

        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);
        const D3 = decide(plan, { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 }, 'OBSERVE', T3);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([D1, D2, D3], plan);
        assert(result.decisionCount === 3, '26. three genuine decisions produce decisionCount: 3');
        assert(result.revalidations.length === 3, '27. three genuine decisions produce three revalidations entries');
        assert(result.revalidations.every((entry) => entry.candidatePresent === true), '28. all three candidates, each drawn from the plan itself, are present');
        assert(result.presentCandidateCount === 3 && result.absentCandidateCount === 0, '29. three distinct candidates are all tallied as present');
        assert(
            result.revalidations[0].decisionIndex === 0 && result.revalidations[1].decisionIndex === 1 && result.revalidations[2].decisionIndex === 2,
            '30. decisionIndex tracks position in decisionHistory\'s own order'
        );
        assert(
            serialize(result.revalidations[0].decision) === serialize(D1)
            && serialize(result.revalidations[1].decision) === serialize(D2)
            && serialize(result.revalidations[2].decision) === serialize(D3),
            '31. each entry echoes its own decision, in order, unchanged'
        );

        // A malformed entry mixed into an otherwise genuine history is
        // silently excluded, never counted, never given its own index.
        const withMalformedEntry = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([D1, { decided: false }, D2], plan);
        assert(withMalformedEntry.decisionCount === 2, '32. a malformed entry mixed into an otherwise genuine history is silently excluded from decisionCount');
        assert(withMalformedEntry.revalidations.length === 2, '33. the malformed entry contributes no revalidations entry');
        assert(withMalformedEntry.revalidations[1].decisionIndex === 1, '34. the following genuine entry\'s decisionIndex is not left with a gap for the excluded entry');
    }
    console.log('✓ Section C: multiple decisions each receive their own independent 0.8.157 evaluation, and malformed entries are silently excluded');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP: the same history evaluated against two
    // explicitly supplied plans. This milestone's own worked example:
    //   D1 -> C1/S1 -> OBSERVE      D3 -> C1/S2 -> OBSERVE
    //   D2 -> C2     -> DEFER       D4 -> S3     -> DEFER
    // revalidated against a later plan naming only C1/S1, C2, and S3.
    // ---------------------------------------------------------------
    {
        const c1s1 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: 'B', snapshotIndex: 0 };
        const c2 = { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'C' };
        const c1s2 = { type: 'DIVERGENT_CORRESPONDENCE', claimId: 'B', snapshotIndex: 1 };
        const s3Candidate = { type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 };

        const D1 = genuineDecisionRecord(c1s1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(c2, 'DEFER', T2);
        const D3 = genuineDecisionRecord(c1s2, 'OBSERVE', T3);
        const D4 = genuineDecisionRecord(s3Candidate, 'DEFER', T4);
        const history = [D1, D2, D3, D4];

        // Historical plan: every candidate this history ever named is
        // present — the plan each decision was originally recorded
        // against.
        const divergence = Object.freeze({ evidenceFingerprintDiffers: true, policyVersionDiffers: false, snapshotFingerprintDiffers: false });
        const historicalPlan = Object.freeze({
            divergentCorrespondences: [Object.freeze({ claimId: 'B', snapshotIndex: 0, divergence }), Object.freeze({ claimId: 'B', snapshotIndex: 1, divergence })],
            claimsWithoutCorrespondence: [Object.freeze({ claimId: 'C' })],
            snapshotsWithoutCorrespondence: [Object.freeze({ snapshotIndex: 2 })]
        });

        const revalidatedAgainstHistoricalPlan = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation(history, historicalPlan);
        assert(revalidatedAgainstHistoricalPlan.decisionCount === 4, '35. FLAGSHIP — decisionCount is 4 against the historical plan');
        assert(revalidatedAgainstHistoricalPlan.revalidations.every((entry) => entry.candidatePresent === true), '36. FLAGSHIP — every decision reads present against the plan it was recorded against');

        // A later, explicitly supplied plan naming only C1/S1, C2, and S3 —
        // C1/S2 (D3's own candidate) no longer occurs in it at all.
        const laterPlan = Object.freeze({
            divergentCorrespondences: [Object.freeze({ claimId: 'B', snapshotIndex: 0, divergence })],
            claimsWithoutCorrespondence: [Object.freeze({ claimId: 'C' })],
            snapshotsWithoutCorrespondence: [Object.freeze({ snapshotIndex: 2 })]
        });

        const revalidatedAgainstLaterPlan = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation(history, laterPlan);
        assert(revalidatedAgainstLaterPlan.decisionCount === 4, '37. FLAGSHIP — decisionCount remains 4 against the later plan; the history itself never shrinks');
        assert(revalidatedAgainstLaterPlan.revalidations[0].candidatePresent === true, '38. FLAGSHIP — D1 (C1/S1) reads present against the later plan');
        assert(revalidatedAgainstLaterPlan.revalidations[1].candidatePresent === true, '39. FLAGSHIP — D2 (C2) reads present against the later plan');
        assert(revalidatedAgainstLaterPlan.revalidations[2].candidatePresent === false, '40. FLAGSHIP — D3 (C1/S2) reads absent — the later plan no longer carries that candidate');
        assert(revalidatedAgainstLaterPlan.revalidations[3].candidatePresent === true, '41. FLAGSHIP — D4 (S3) reads present against the later plan');

        // D3 itself is never rewritten, flagged, or altered — the decision
        // remains a historical fact, echoed exactly.
        assert(serialize(revalidatedAgainstLaterPlan.revalidations[2].decision) === serialize(D3), '42. FLAGSHIP — D3 is echoed completely unchanged despite reading absent');
        assert(revalidatedAgainstLaterPlan.revalidations[2].decision.decision === 'OBSERVE', '43. FLAGSHIP — D3\'s own recorded disposition is still exactly "OBSERVE", never altered because its candidate is absent from the later plan');
        assert(revalidatedAgainstLaterPlan.revalidations[2].candidateType === 'DIVERGENT_CORRESPONDENCE', '44. FLAGSHIP — D3 does not become "wrong," "superseded," or "obsolete" — only its own candidateType is stated, alongside candidatePresent: false');

        // Neither call implies anything was wrong, resolved, or should
        // change — the two revalidations differ solely because the
        // supplied plan differs.
        assert(
            revalidatedAgainstHistoricalPlan.revalidations[2].candidatePresent !== revalidatedAgainstLaterPlan.revalidations[2].candidatePresent,
            '45. FLAGSHIP — the identical historical decision (D3) produces two different, independently-computed candidatePresent facts depending solely on which plan is supplied'
        );
        assert(revalidatedAgainstLaterPlan.presentCandidateCount === 3 && revalidatedAgainstLaterPlan.absentCandidateCount === 1, '46. FLAGSHIP — the later plan tallies 3 present and 1 absent distinct candidates, matching D1/D2/D4 present and D3 absent');
    }
    console.log('✓ Section D: FLAGSHIP — the same decision history evaluated against a later plan produces different candidateMatchesPlan values while every historical decision is preserved unchanged');

    // ---------------------------------------------------------------
    // Section E — candidate multiplicity: [D1, D1, D2] produces three
    // revalidation entries, never deduplicated.
    // ---------------------------------------------------------------
    {
        const decisionC1 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'dup-claim' }, 'OBSERVE', T1);
        const decisionC2 = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'other-claim' }, 'DEFER', T2);
        const plan = Object.freeze({
            divergentCorrespondences: [],
            claimsWithoutCorrespondence: [Object.freeze({ claimId: 'dup-claim' }), Object.freeze({ claimId: 'other-claim' })],
            snapshotsWithoutCorrespondence: []
        });

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([decisionC1, decisionC1, decisionC2], plan);
        assert(result.decisionCount === 3, '47. [D1, D1, D2] produces decisionCount: 3, never deduplicated to 2');
        assert(result.revalidations.length === 3, '48. [D1, D1, D2] produces exactly three revalidations entries');
        assert(
            result.revalidations[0].decisionIndex === 0 && result.revalidations[1].decisionIndex === 1 && result.revalidations[2].decisionIndex === 2,
            '49. each of the three entries carries its own sequential decisionIndex, including the repeated D1'
        );
        assert(
            serialize(result.revalidations[0].decision) === serialize(result.revalidations[1].decision),
            '50. both D1 entries echo the identical decision record content'
        );
        assert(result.revalidations.every((entry) => entry.candidatePresent === true), '51. all three entries read candidatePresent: true');

        // Multiplicity in the HISTORY (repeated decisions) never inflates
        // the number of DISTINCT candidates.
        assert(result.presentCandidateCount === 2 && result.absentCandidateCount === 0, '52. only two distinct candidates are tallied — dup-claim once, other-claim once — despite dup-claim being decided upon twice');
    }
    console.log('✓ Section E: candidate/decision multiplicity in decisionHistory is preserved exactly — [D1, D1, D2] yields three revalidations, never deduplicated');

    // ---------------------------------------------------------------
    // Section F — disposition independence.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const selection = { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 };
        const D_OBSERVE = decide(plan, selection, 'OBSERVE', T1);
        const D_DEFER = decide(plan, selection, 'DEFER', T2);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([D_OBSERVE, D_DEFER], plan);
        assert(result.revalidations[0].candidatePresent === result.revalidations[1].candidatePresent, '53. OBSERVE and DEFER against the identical candidate/plan report the identical candidatePresent value');
        assert(result.revalidations[0].candidateMatchesPlan === result.revalidations[1].candidateMatchesPlan, '54. OBSERVE and DEFER report the identical candidateMatchesPlan value');
        assert(result.revalidations[0].candidateType === result.revalidations[1].candidateType, '55. OBSERVE and DEFER report the identical candidateType');
        // Two decisions about the identical candidate are still one
        // distinct candidate for the candidate-level tally.
        assert(result.presentCandidateCount === 1 && result.absentCandidateCount === 0, '56. OBSERVE and DEFER against the same candidate contribute one distinct present candidate, not two');

        const laterPlan = Object.freeze({ divergentCorrespondences: [], claimsWithoutCorrespondence: [], snapshotsWithoutCorrespondence: [] });
        const resultAbsent = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([D_OBSERVE, D_DEFER], laterPlan);
        assert(resultAbsent.revalidations.every((entry) => entry.candidatePresent === false), '57. both OBSERVE and DEFER read candidatePresent: false identically once the candidate is absent from the supplied plan');
    }
    console.log('✓ Section F: OBSERVE vs. DEFER never affects candidate matching or candidate-level tallies');

    // ---------------------------------------------------------------
    // Section G — candidate identity precision.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();

        const D_S1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D_S2 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 1 }, 'OBSERVE', T2);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([D_S1, D_S2], plan);
        assert(result.presentCandidateCount === 2, '58. C1/S1 and C1/S2 are counted as two distinct present candidates, never collapsed into one');

        // A CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate and a
        // SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM candidate must never collide
        // merely because they carry the identical value under different
        // field names/types.
        const sharedValue = '7';
        const collisionPlan = Object.freeze({
            divergentCorrespondences: [],
            claimsWithoutCorrespondence: [],
            snapshotsWithoutCorrespondence: [Object.freeze({ snapshotIndex: Number(sharedValue) })]
        });
        const claimCandidateDecision = genuineDecisionRecord({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: sharedValue }, 'OBSERVE', T1);
        const rCollision = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([claimCandidateDecision], collisionPlan);
        assert(rCollision.revalidations[0].candidatePresent === false, '59. a CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT candidate never matches a snapshotsWithoutCorrespondence entry sharing the identical numeric/string value');

        const snapshotCandidateDecision = genuineDecisionRecord({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: Number(sharedValue) }, 'OBSERVE', T1);
        const reverseCollisionPlan = Object.freeze({
            divergentCorrespondences: [],
            claimsWithoutCorrespondence: [Object.freeze({ claimId: sharedValue })],
            snapshotsWithoutCorrespondence: []
        });
        const rReverseCollision = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([snapshotCandidateDecision], reverseCollisionPlan);
        assert(rReverseCollision.revalidations[0].candidatePresent === false, '60. a SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM candidate never matches a claimsWithoutCorrespondence entry sharing the identical numeric/string value');

        // Combining both differently-typed candidates in one history: two
        // distinct candidates despite the shared field value, both absent.
        const combined = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([claimCandidateDecision, snapshotCandidateDecision], Object.freeze({ divergentCorrespondences: [], claimsWithoutCorrespondence: [], snapshotsWithoutCorrespondence: [] }));
        assert(combined.decisionCount === 2 && combined.absentCandidateCount === 2, '61. type-distinct candidates sharing a field value are tallied as two separate candidates, never one');
    }
    console.log('✓ Section G: candidate identity is precise — distinct snapshotIndex values and distinct candidate types never collide');

    // ---------------------------------------------------------------
    // Section H — immutability.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const history = [D1];
        const historyJsonBefore = serialize(history);
        const planJsonBefore = serialize(plan);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation(history, plan);

        assert(serialize(history) === historyJsonBefore, '62. the original decisionHistory is never mutated');
        assert(serialize(plan) === planJsonBefore, '63. the supplied plan is never mutated');
        assert(Object.isFrozen(result), '64. the result is frozen');
        assert(Object.isFrozen(result.revalidations), '65. the revalidations array is frozen');
        assert(Object.isFrozen(result.revalidations[0]), '66. each revalidations entry is frozen');
        assert(result.revalidations[0].decision === D1, '67. the echoed decision is the original decision record itself, by reference, never a reconstructed copy');
    }
    console.log('✓ Section H: neither decisionHistory nor plan is ever mutated, and the result (and every entry within it) is frozen');

    // ---------------------------------------------------------------
    // Section I — determinism.
    // ---------------------------------------------------------------
    {
        const { plan, claimB, claimC } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const D2 = decide(plan, { type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: claimC.id }, 'DEFER', T2);

        const once = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([D1, D2], plan);
        const twice = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([D1, D2], plan);
        assert(serialize(once) === serialize(twice), '68. repeated calls with the identical decisionHistory/plan produce a byte-identical result');
    }
    console.log('✓ Section I: repeated calls with equivalent arguments produce byte-identical results');

    // ---------------------------------------------------------------
    // Section J — architectural boundary.
    // ---------------------------------------------------------------
    {
        const { plan, claimB } = buildWorld();
        const D1 = decide(plan, { type: 'DIVERGENT_CORRESPONDENCE', claimId: claimB.id, snapshotIndex: 0 }, 'OBSERVE', T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation([D1], plan);

        const topKeys = Object.keys(result).sort();
        assert(serialize(topKeys) === serialize(['decisionCount', 'presentCandidateCount', 'absentCandidateCount', 'revalidations'].sort()), '69. the result carries exactly the documented, factual top-level fields');

        const entryKeys = Object.keys(result.revalidations[0]).sort();
        assert(serialize(entryKeys) === serialize(['decisionIndex', 'decision', 'candidatePresent', 'candidateType', 'candidateMatchesPlan'].sort()), '70. each revalidations entry carries exactly the documented fields');

        const forbidden = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'unknown', 'valid', 'invalid'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term), `71. the result never carries state-machine vocabulary ('${term}')`);
        }

        const fs = await import('node:fs/promises');
        const moduleSource = await fs.readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'authoritative', 'trust', 'confidence', 'reputation', 'severity', 'ranking'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `72. this file's own code never carries "${term}"`);
        }

        // Exactly one import — 0.8.157's own decision-to-plan revalidation
        // boundary, reused whole. No plan-projection, decision-history
        // archive, decision-generation, candidate-selection, or
        // verification module is ever imported.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1, '73. this file imports exactly one module');
        assert(
            importLines[0].includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.js'),
            '74. the one import is 0.8.157\'s own decision-to-plan revalidation boundary'
        );
        assert(!codeOnly.includes('archive'), '75. this file never mentions an archive of any kind');
        assert(!codeOnly.includes('planview'), '76. this file never imports the plan-reconstruction module');
        assert(!codeOnly.includes('decisionhistoryview'), '77. this file never imports 0.8.150\'s own archive-reading decision history seam');
        assert(!codeOnly.includes('reconciliationdecision.js') && !codeOnly.includes('reconciliationdecisionhistory.js'), '78. this file never imports the decision-generation or decision-history-append modules');

        // Never calls 0.8.145 to create a new decision, and never calls
        // 0.8.144 to make a new candidate selection directly.
        assert(!codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationdecision(') , '79. this file never calls 0.8.145\'s own decision-recording function to create a new decision');
        assert(!codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationcandidate('), '80. this file never calls 0.8.144\'s own candidate-selection function directly — only 0.8.157 does');

        // No reconstructXxx() entry point at all — deliberately, per this
        // file's own header, mirroring 0.8.157's own choice.
        const revalidationModule = await import('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationView.js');
        assert(typeof revalidationModule.describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation === 'function', '81. describeXxx() is exported');
        assert(revalidationModule.reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidation === undefined, '82. no reconstructXxx() is exported — this file never invents a way to reconstruct a plan from current archive state');
    }
    console.log('✓ Section J: the result and the module\'s own source carry no state-machine or interpretive vocabulary, the module imports exactly 0.8.157\'s own revalidation boundary, and it exposes no reconstructXxx() entry point');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationView.test.js FAILED:', error);
    process.exitCode = 1;
});
