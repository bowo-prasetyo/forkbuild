import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreementView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetailView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.182 — Reconciliation Candidate Evidence Detail View.
//
// Section A: empty evidence agreement — zero candidates, empty result
// Section B: FLAGSHIP — the milestone's own worked example: C1 shared
//            decision + source-only decision, C1 shared observation
//            against Plan P1 + source-only observation against Plan P2,
//            C1 target-only observation against Plan P3
// Section C: table counts and detail counts always agree, over the SAME
//            0.8.176 result — no arithmetic needed to relate them
// Section D: same candidate/decision, different plan, remain two distinct
//            observation detail records
// Section E: same candidate/plan, different observedAt, remain two
//            distinct observation detail records
// Section F: record order is preserved, never re-sorted
// Section G: no record is fabricated from a count
// Section H: no archive/history is ever mutated
// Section I: reconstruct()'s archive-reading boundary, and agreement with
//            0.8.177's own reconstructXxx() over the identical archives
// Section J: malformed input tolerance
// Section K: vocabulary/import boundary — no judgment vocabulary, imports
//            only 0.8.176; never reaches into 0.8.177/0.8.178/0.8.179

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({ decided: true, candidate: Object.freeze(candidate), decision, decidedAt: decidedAt.toISOString() });
}

function appendDecisions(decisions) {
    let history = [];
    for (const decision of decisions) {
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, decision);
    }
    return history;
}

function planNaming({ claims = [], snapshots = [], divergent = [] } = {}) {
    return Object.freeze({
        divergentCorrespondences: Object.freeze(divergent.map(([claimId, snapshotIndex]) => Object.freeze({
            claimId,
            snapshotIndex,
            divergence: Object.freeze({ evidenceFingerprintDiffers: true, policyVersionDiffers: false, snapshotFingerprintDiffers: false })
        }))),
        claimsWithoutCorrespondence: Object.freeze(claims.map((claimId) => Object.freeze({ claimId }))),
        snapshotsWithoutCorrespondence: Object.freeze(snapshots.map((snapshotIndex) => Object.freeze({ snapshotIndex })))
    });
}

function observe(decisionRecord, plan, observedAt) {
    const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(decisionRecord, plan, observedAt);
    assert(result.observed === true, 'test setup — observe() must always produce a genuine observation');
    return result;
}

function appendObservations(observations) {
    let history = [];
    for (const observation of observations) {
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, observation);
    }
    return history;
}

const T1 = new Date('2026-08-31T06:00:00Z');
const T2 = new Date('2026-08-31T06:03:00Z');
const OBS_T1 = new Date('2026-08-31T12:00:00Z');
const OBS_T2 = new Date('2026-08-31T12:05:00Z');
const OBS_T3 = new Date('2026-08-31T12:10:00Z');
const OBS_T4 = new Date('2026-08-31T12:15:00Z');

const C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' });

function candidateEntryFor(result, candidate) {
    return result.candidates.find((entry) => serialize(entry.candidate) === serialize(candidate));
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty evidence agreement.
    // ---------------------------------------------------------------
    {
        const emptyAgreement = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement([], [], [], []);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(emptyAgreement);
        assert(result.candidateCount === 0, '1. an empty evidence agreement reports candidateCount 0');
        assert(result.candidates.length === 0, '2. an empty, frozen candidates array');
        assert(Object.isFrozen(result), '3. the result is frozen');
        assert(Object.isFrozen(result.candidates), '4. the candidates array is frozen');
    }
    console.log('✓ Section A: an empty evidence agreement produces an empty detail result');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP.
    //
    //   C1
    //     shared decision D1
    //     source-only decision D2
    //     shared observation O1 against Plan P1
    //     source-only observation O2 against Plan P2
    //     target-only observation O3 against Plan P3
    // ---------------------------------------------------------------
    let flagshipTableCounts;
    let flagshipDetail;
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C1, 'DEFER', T2);
        const sourceDecisionHistory = appendDecisions([D1, D2]);
        const targetDecisionHistory = appendDecisions([D1]);

        const P1 = planNaming({ claims: ['Claim-1'] });
        const P2 = planNaming({ claims: ['Claim-1', 'Claim-2'] });
        const P3 = planNaming({ claims: ['Claim-1'], snapshots: [9] });
        const O1 = observe(D1, P1, OBS_T1); // shared
        const O2 = observe(D1, P2, OBS_T2); // source-only
        const O3 = observe(D1, P3, OBS_T3); // target-only

        const sourceObservationHistory = appendObservations([O1, O2]);
        const targetObservationHistory = appendObservations([O1, O3]);

        const evidenceAgreement = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            sourceDecisionHistory, targetDecisionHistory, sourceObservationHistory, targetObservationHistory
        );
        const c1Agreement = candidateEntryFor(evidenceAgreement, C1);
        flagshipTableCounts = {
            decisionShared: c1Agreement.decisionAgreement.sharedDecisionCount,
            decisionSourceOnly: c1Agreement.decisionAgreement.sourceOnlyDecisionCount,
            decisionTargetOnly: c1Agreement.decisionAgreement.targetOnlyDecisionCount,
            observationShared: c1Agreement.observationAgreement.sharedObservationCount,
            observationSourceOnly: c1Agreement.observationAgreement.sourceOnlyObservationCount,
            observationTargetOnly: c1Agreement.observationAgreement.targetOnlyObservationCount
        };

        const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(evidenceAgreement);
        flagshipDetail = detail;
        assert(detail.candidateCount === 1, '5. FLAGSHIP — exactly one candidate');
        const c1 = candidateEntryFor(detail, C1);
        assert(c1 !== undefined, '6. FLAGSHIP — C1 appears exactly once');

        // 1. the table counts are unchanged.
        assert(c1.decisionDetail.sharedCount === 1 && c1.decisionDetail.sourceOnlyCount === 1 && c1.decisionDetail.targetOnlyCount === 0, '7. FLAGSHIP — decisionDetail counts: shared D1, source-only D2');
        assert(c1.observationDetail.sharedCount === 1 && c1.observationDetail.sourceOnlyCount === 1 && c1.observationDetail.targetOnlyCount === 1, '8. FLAGSHIP — observationDetail counts: shared O1, source-only O2, target-only O3');

        // 2. opening C1 reveals exactly those records.
        assert(c1.decisionDetail.shared.length === 1 && c1.decisionDetail.shared[0] === D1, '9. FLAGSHIP — decisionDetail.shared holds exactly D1, by reference');
        assert(c1.decisionDetail.sourceOnly.length === 1 && c1.decisionDetail.sourceOnly[0] === D2, '10. FLAGSHIP — decisionDetail.sourceOnly holds exactly D2, by reference');
        assert(c1.decisionDetail.targetOnly.length === 0, '11. FLAGSHIP — decisionDetail.targetOnly is empty');

        assert(c1.observationDetail.shared.length === 1, '12. FLAGSHIP — observationDetail.shared holds exactly one record');
        assert(c1.observationDetail.sourceOnly.length === 1, '13. FLAGSHIP — observationDetail.sourceOnly holds exactly one record');
        assert(c1.observationDetail.targetOnly.length === 1, '14. FLAGSHIP — observationDetail.targetOnly holds exactly one record');

        // 3. shared/source-only/target-only classification is preserved.
        assert(c1.observationDetail.shared[0].observedAt === O1.observedAt, '15. FLAGSHIP — the shared observation detail record is O1');
        assert(c1.observationDetail.sourceOnly[0].observedAt === O2.observedAt, '16. FLAGSHIP — the source-only observation detail record is O2');
        assert(c1.observationDetail.targetOnly[0].observedAt === O3.observedAt, '17. FLAGSHIP — the target-only observation detail record is O3');

        // 4. decision and observation evidence remain separate.
        assert(Object.keys(c1).sort().join(',') === ['candidate', 'decisionDetail', 'observationDetail'].sort().join(','), '18. FLAGSHIP — decisionDetail and observationDetail are two separate fields, never merged');

        // 5. planFingerprint survives into observation detail.
        assert(c1.observationDetail.shared[0].planIdentity.planFingerprint === O1.planIdentity.planFingerprint, '19. FLAGSHIP — the shared observation detail record carries P1\'s own planFingerprint');
        assert(c1.observationDetail.sourceOnly[0].planIdentity.planFingerprint === O2.planIdentity.planFingerprint, '20. FLAGSHIP — the source-only observation detail record carries P2\'s own planFingerprint');
        assert(c1.observationDetail.targetOnly[0].planIdentity.planFingerprint === O3.planIdentity.planFingerprint, '21. FLAGSHIP — the target-only observation detail record carries P3\'s own planFingerprint');
        const fingerprints = new Set([
            c1.observationDetail.shared[0].planIdentity.planFingerprint,
            c1.observationDetail.sourceOnly[0].planIdentity.planFingerprint,
            c1.observationDetail.targetOnly[0].planIdentity.planFingerprint
        ]);
        assert(fingerprints.size === 3, '22. FLAGSHIP — P1/P2/P3 produce three genuinely distinct plan fingerprints');

        // 6. candidateMatchesPlan is displayed as a fact, not interpreted.
        for (const record of [...c1.observationDetail.shared, ...c1.observationDetail.sourceOnly, ...c1.observationDetail.targetOnly]) {
            assert(typeof record.candidateMatchesPlan === 'boolean', '23. FLAGSHIP — candidateMatchesPlan is a plain boolean on every observation detail record');
        }

        // 7. record order is preserved (see Section F for a dedicated,
        // multi-record regression).
        assert(c1.observationDetail.shared[0].candidate !== undefined, '24. FLAGSHIP — candidate is surfaced onto every observation detail record');
        assert(serialize(c1.observationDetail.shared[0].candidate) === serialize(C1), '25. FLAGSHIP — the surfaced candidate is C1, read off the record\'s own embedded decision');

        // 8. no records are fabricated from counts — every returned record
        // is one of the exact objects constructed above, by reference.
        assert(c1.observationDetail.shared[0].decision === O1.decision, '26. FLAGSHIP — the shared observation detail record embeds O1\'s own decision record, by reference');
        assert(c1.observationDetail.shared[0].planIdentity === O1.planIdentity, '27. FLAGSHIP — the shared observation detail record embeds O1\'s own planIdentity, by reference');

        // 9. no archive is modified — see Section H below for the dedicated
        // mutation regression.
    }
    console.log('✓ Section B: FLAGSHIP — C1\'s shared/source-only decision and shared/source-only/target-only observation (each against a distinct plan) surface as exact records, classification preserved, planFingerprint intact, candidateMatchesPlan a plain fact');

    // ---------------------------------------------------------------
    // Section C — table counts and detail counts always agree, over the
    // SAME 0.8.176 result.
    // ---------------------------------------------------------------
    {
        assert(flagshipDetail !== undefined && flagshipTableCounts !== undefined, 'test setup — Section B must have run first');
        const c1 = candidateEntryFor(flagshipDetail, C1);
        assert(c1.decisionDetail.sharedCount === flagshipTableCounts.decisionShared, '28. decisionDetail.sharedCount matches the table\'s own count, from the identical 0.8.176 result');
        assert(c1.decisionDetail.sourceOnlyCount === flagshipTableCounts.decisionSourceOnly, '29. decisionDetail.sourceOnlyCount matches the table\'s own count');
        assert(c1.decisionDetail.targetOnlyCount === flagshipTableCounts.decisionTargetOnly, '30. decisionDetail.targetOnlyCount matches the table\'s own count');
        assert(c1.observationDetail.sharedCount === flagshipTableCounts.observationShared, '31. observationDetail.sharedCount matches the table\'s own count');
        assert(c1.observationDetail.sourceOnlyCount === flagshipTableCounts.observationSourceOnly, '32. observationDetail.sourceOnlyCount matches the table\'s own count');
        assert(c1.observationDetail.targetOnlyCount === flagshipTableCounts.observationTargetOnly, '33. observationDetail.targetOnlyCount matches the table\'s own count');

        assert(c1.decisionDetail.shared.length === c1.decisionDetail.sharedCount, '34. decisionDetail.shared.length always agrees with decisionDetail.sharedCount');
        assert(c1.observationDetail.targetOnly.length === c1.observationDetail.targetOnlyCount, '35. observationDetail.targetOnly.length always agrees with observationDetail.targetOnlyCount');
    }
    console.log('✓ Section C: the count a table would display and the record count a detail view would display always agree — both read off the identical 0.8.176 result, no arithmetic required');

    // ---------------------------------------------------------------
    // Section D — same candidate, same decision, different plan: two
    // distinct observation detail records, never collapsed.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionHistory = appendDecisions([D1]);
        const planA = planNaming({ claims: ['Claim-1'] });
        const planB = planNaming({ claims: ['Claim-1', 'Claim-9'] });
        const observationA = observe(D1, planA, OBS_T1);
        const observationB = observe(D1, planB, OBS_T1);
        assert(observationA.planIdentity.planFingerprint !== observationB.planIdentity.planFingerprint, 'test setup — planA and planB genuinely differ');

        const sourceObservationHistory = appendObservations([observationA, observationB]);
        const evidenceAgreement = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            decisionHistory, decisionHistory, sourceObservationHistory, []
        );
        const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(evidenceAgreement);
        const c1 = candidateEntryFor(detail, C1);
        assert(c1.observationDetail.sourceOnly.length === 2, '36. same candidate/decision, different plan, remain two distinct observation detail records — never collapsed into one');
        const fingerprintsSeen = new Set(c1.observationDetail.sourceOnly.map((record) => record.planIdentity.planFingerprint));
        assert(fingerprintsSeen.size === 2, '37. the two records carry two genuinely distinct planFingerprints');
    }
    console.log('✓ Section D: same candidate, same decision, different plan — two distinct observation detail records, never merged because they "look similar"');

    // ---------------------------------------------------------------
    // Section E — same candidate, same plan, different observedAt: two
    // distinct observation detail records, never collapsed.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionHistory = appendDecisions([D1]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const observationA = observe(D1, plan, OBS_T1);
        const observationB = observe(D1, plan, OBS_T2);
        assert(observationA.observedAt !== observationB.observedAt, 'test setup — the two observations genuinely differ in observedAt');
        assert(observationA.planIdentity.planFingerprint === observationB.planIdentity.planFingerprint, 'test setup — the two observations share the identical plan');

        const sourceObservationHistory = appendObservations([observationA, observationB]);
        const evidenceAgreement = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            decisionHistory, decisionHistory, sourceObservationHistory, []
        );
        const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(evidenceAgreement);
        const c1 = candidateEntryFor(detail, C1);
        assert(c1.observationDetail.sourceOnly.length === 2, '38. same candidate, same plan, different observedAt, remain two distinct observation detail records');
        const observedAtSeen = new Set(c1.observationDetail.sourceOnly.map((record) => record.observedAt));
        assert(observedAtSeen.size === 2, '39. the two records carry two genuinely distinct observedAt values');
    }
    console.log('✓ Section E: same candidate, same plan, different observedAt — two distinct observation detail records, never collapsed merely because they look similar');

    // ---------------------------------------------------------------
    // Section F — record order is preserved, never re-sorted by THIS file
    // — the detail order always matches 0.8.176's own array order exactly,
    // record for record, whatever that order is (0.8.172's own chronological
    // observedAt ordering, unchanged all the way through 0.8.173/0.8.174/
    // 0.8.176 — this file introduces no `sort()` of its own on top of it).
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C1, 'DEFER', T2);
        const decisionHistory = appendDecisions([D1, D2]);
        const planA = planNaming({ claims: ['Claim-1'] });
        const planB = planNaming({ claims: ['Claim-1', 'Claim-2'] });
        const planC = planNaming({ claims: ['Claim-1', 'Claim-2', 'Claim-3'] });
        const observationA = observe(D1, planA, OBS_T3);
        const observationB = observe(D2, planB, OBS_T1);
        const observationC = observe(D1, planC, OBS_T4);

        const sourceObservationHistory = appendObservations([observationA, observationB, observationC]);
        const evidenceAgreement = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(
            decisionHistory, decisionHistory, sourceObservationHistory, []
        );
        const c1Agreement = candidateEntryFor(evidenceAgreement, C1);
        const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(evidenceAgreement);
        const c1 = candidateEntryFor(detail, C1);

        assert(c1Agreement.observationAgreement.sourceOnly.length >= 2, 'test setup — 0.8.176 groups at least two source-only observations under C1');
        assert(c1.observationDetail.sourceOnly.length === c1Agreement.observationAgreement.sourceOnly.length, '40. this file drops or adds no record relative to 0.8.176\'s own list');
        for (let i = 0; i < c1Agreement.observationAgreement.sourceOnly.length; i += 1) {
            assert(c1.observationDetail.sourceOnly[i].observedAt === c1Agreement.observationAgreement.sourceOnly[i].observedAt, `41. observationDetail.sourceOnly[${i}] is 0.8.176's own record at that exact position — never reordered`);
            assert(c1.observationDetail.sourceOnly[i].decision === c1Agreement.observationAgreement.sourceOnly[i].decision, `42. observationDetail.sourceOnly[${i}] embeds 0.8.176's own decision record at that exact position, by reference`);
        }
    }
    console.log('✓ Section F: observation (and decision) detail records keep 0.8.176\'s own exact order, record for record — this file introduces no additional sort of its own');

    // ---------------------------------------------------------------
    // Section G — no record is fabricated from a count.
    // ---------------------------------------------------------------
    {
        // Deliberately malformed: a candidates array whose entry claims a
        // large sharedDecisionCount but supplies genuinely empty lists —
        // this file must never synthesize placeholder records to make the
        // count and the list agree.
        const forgedAgreement = Object.freeze({
            candidates: Object.freeze([
                Object.freeze({
                    candidate: C1,
                    decisionAgreement: Object.freeze({
                        sharedDecisionCount: 5, sourceOnlyDecisionCount: 0, targetOnlyDecisionCount: 0,
                        sharedDecisions: Object.freeze([]), sourceOnly: Object.freeze([]), targetOnly: Object.freeze([])
                    }),
                    observationAgreement: Object.freeze({
                        sharedObservationCount: 0, sourceOnlyObservationCount: 0, targetOnlyObservationCount: 0,
                        sharedObservations: Object.freeze([]), sourceOnly: Object.freeze([]), targetOnly: Object.freeze([])
                    })
                })
            ])
        });
        const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(forgedAgreement);
        const c1 = candidateEntryFor(detail, C1);
        assert(c1.decisionDetail.shared.length === 0, '43. a forged sharedDecisionCount never causes this file to synthesize placeholder records — the list this file returns is exactly the list it was handed');
        assert(c1.decisionDetail.sharedCount === 5, '44. the count is still forwarded verbatim (this file is not responsible for a caller\'s own internal inconsistency — see 0.8.176\'s own contract, which this file trusts)');
    }
    console.log('✓ Section G: this file never synthesizes a placeholder record to make a count and a list agree — every list is exactly the list 0.8.176 supplied, by reference');

    // ---------------------------------------------------------------
    // Section H — no archive/history is ever mutated.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const sourceDecisionHistory = appendDecisions([D1]);
        const targetDecisionHistory = appendDecisions([D1]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const sourceObservationHistory = appendObservations([O1]);
        const targetObservationHistory = appendObservations([O1]);

        const sourceArchive = new PublicationObservationArchive({
            reconciliationDecisionRecords: sourceDecisionHistory,
            revalidationObservationRecords: sourceObservationHistory
        });
        const targetArchive = new PublicationObservationArchive({
            reconciliationDecisionRecords: targetDecisionHistory,
            revalidationObservationRecords: targetObservationHistory
        });
        const beforeSource = serialize(sourceArchive);
        const beforeTarget = serialize(targetArchive);

        const result = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(sourceArchive, targetArchive);

        assert(serialize(sourceArchive) === beforeSource, '45. sourceArchive is never mutated');
        assert(serialize(targetArchive) === beforeTarget, '46. targetArchive is never mutated');
        assert(Object.isFrozen(result), '47. the result is frozen');
        assert(Object.isFrozen(result.candidates[0]), '48. a candidate entry is frozen');
        assert(Object.isFrozen(result.candidates[0].decisionDetail), '49. decisionDetail is frozen');
        assert(Object.isFrozen(result.candidates[0].decisionDetail.shared), '50. decisionDetail.shared is frozen');
        assert(Object.isFrozen(result.candidates[0].observationDetail), '51. observationDetail is frozen');
        assert(Object.isFrozen(result.candidates[0].observationDetail.shared), '52. observationDetail.shared is frozen');
        assert(Object.isFrozen(result.candidates[0].observationDetail.shared[0]), '53. an observation detail record is frozen');

        const again = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(sourceArchive, targetArchive);
        assert(serialize(again) === serialize(result), '54. calling reconstructXxx() twice with byte-identical archives returns a byte-identical result');
    }
    console.log('✓ Section H: no archive is ever mutated, every returned object/array is frozen, and computation is deterministic');

    // ---------------------------------------------------------------
    // Section I — reconstruct()'s archive-reading boundary, and agreement
    // with the identical 0.8.176 result the counts path (0.8.177) itself
    // reads.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C1, 'DEFER', T2);
        const sourceDecisionHistory = appendDecisions([D1]);
        const targetDecisionHistory = appendDecisions([D1, D2]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const sourceObservationHistory = appendObservations([O1]);
        const targetObservationHistory = appendObservations([O1]);

        const sourceArchive = new PublicationObservationArchive({
            reconciliationDecisionRecords: sourceDecisionHistory,
            revalidationObservationRecords: sourceObservationHistory
        });
        const targetArchive = new PublicationObservationArchive({
            reconciliationDecisionRecords: targetDecisionHistory,
            revalidationObservationRecords: targetObservationHistory
        });

        const evidenceAgreement = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement(sourceArchive, targetArchive);
        const describedFromAgreement = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(evidenceAgreement);
        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(sourceArchive, targetArchive);
        assert(serialize(reconstructed) === serialize(describedFromAgreement), '55. reconstruct() agrees exactly with describe() over 0.8.176\'s own reconstructed evidence agreement');

        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(PublicationObservationArchive.empty(), PublicationObservationArchive.empty());
        assert(emptyReconstructed.candidateCount === 0, '56. reconstruct() over two empty archives reports zero candidates');

        const invalidReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(null, undefined);
        assert(invalidReconstructed.candidateCount === 0, '57. reconstruct() over invalid/missing archives degrades to an empty result, never a throw');
    }
    console.log('✓ Section I: reconstruct() reads 0.8.176\'s own seam exactly once, agreeing with describe() over the identical evidence agreement');

    // ---------------------------------------------------------------
    // Section J — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(null).candidateCount === 0, '58. a null evidenceAgreement degrades to an empty result');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(undefined).candidateCount === 0, '59. an undefined evidenceAgreement degrades to an empty result');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail({}).candidateCount === 0, '60. an evidenceAgreement missing a genuine candidates array degrades to an empty result');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail({ candidates: 'not-an-array' }).candidateCount === 0, '61. a non-array candidates field degrades to an empty result');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail().candidateCount === 0, '62. calling with no arguments never throws');
    }
    console.log('✓ Section J: malformed/absent input degrades to a valid, empty result rather than throwing');

    // ---------------------------------------------------------------
    // Section K — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        assert(flagshipDetail !== undefined, 'test setup — Section B must have run first');
        const c1 = candidateEntryFor(flagshipDetail, C1);

        const topKeys = Object.keys(flagshipDetail).sort();
        assert(serialize(topKeys) === serialize(['candidateCount', 'candidates'].sort()), '63. the top-level result carries exactly the documented fields');

        const entryKeys = Object.keys(c1).sort();
        assert(serialize(entryKeys) === serialize(['candidate', 'decisionDetail', 'observationDetail'].sort()), '64. a candidate entry carries exactly the documented fields');

        const decisionDetailKeys = Object.keys(c1.decisionDetail).sort();
        assert(serialize(decisionDetailKeys) === serialize(['sharedCount', 'sourceOnlyCount', 'targetOnlyCount', 'shared', 'sourceOnly', 'targetOnly'].sort()), '65. decisionDetail carries exactly the documented fields');

        const observationDetailKeys = Object.keys(c1.observationDetail).sort();
        assert(serialize(observationDetailKeys) === serialize(['sharedCount', 'sourceOnlyCount', 'targetOnlyCount', 'shared', 'sourceOnly', 'targetOnly'].sort()), '66. observationDetail carries exactly the documented fields');

        const observationRecordKeys = Object.keys(c1.observationDetail.shared[0]).sort();
        assert(serialize(observationRecordKeys) === serialize(['candidate', 'decision', 'planIdentity', 'candidatePresent', 'candidateType', 'candidateMatchesPlan', 'observedAt'].sort()), '67. an observation detail record carries exactly the documented fields');

        const decisionRecordKeys = Object.keys(c1.decisionDetail.shared[0]).sort();
        assert(serialize(decisionRecordKeys) === serialize(['decided', 'candidate', 'decision', 'decidedAt'].sort()), '68. a decision detail record is 0.8.145\'s own record, unchanged');

        const forbidden = ['conflict', 'conflicting', 'inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'trusted', 'trust', 'confidence', 'score', 'reputation', 'rank', 'winner', 'correct', 'incorrect', 'latest', 'current', 'final', 'stale'];
        const allKeys = [...topKeys, ...entryKeys, ...decisionDetailKeys, ...observationDetailKeys, ...observationRecordKeys, ...decisionRecordKeys];
        for (const term of forbidden) {
            assert(!allKeys.includes(term), `69. the result never carries judgment vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetailView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['inconsistent', 'superseded', 'preferred', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'trust', 'confidence', 'reputation', 'severity', 'sort(', 'verify'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `70. this file's own code never carries "${term}"`);
        }

        // This milestone must import exactly 0.8.176's own evidence
        // agreement projection — never 0.8.177/0.8.178/0.8.179 (the counts
        // path — a sibling reading of 0.8.176, never this file's own
        // dependency), never a raw history/difference module, and never
        // either archive-reading seam directly.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1, '71. this file imports from exactly one module');
        const importBlock = moduleSource.slice(0, moduleSource.indexOf('\n\n'));
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreementView.js'), '72. the one import is 0.8.176\'s own candidate evidence agreement projection');
        assert(!codeOnly.includes('leaderboardreadmodel') && !codeOnly.includes('leaderboardview') && !codeOnly.includes('leaderboardpage'), '73. this file never imports the counts path (0.8.177/0.8.178/0.8.179) — the two paths independently read the identical 0.8.176 result');
    }
    console.log('✓ Section K: the result carries no judgment vocabulary, and the module imports only 0.8.176\'s own evidence agreement projection — never the counts path');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetailView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetailView.test.js FAILED:', error);
    process.exitCode = 1;
});
