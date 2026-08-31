import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondenceView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.171 — Revalidation Observation Candidate Correspondence Projection.
//
// Section A: empty history — zero counts, empty correspondences
// Section B: a single observation — one correspondence entry, correctly shaped
// Section C: FLAGSHIP — observationCount vs candidateCount:
//            O1=C1, O2=C1, O3=C2, O4=C1 -> observationCount 4, candidateCount 2
// Section D: CRITICAL ARCHITECTURAL TEST — candidate identity != plan
//            identity: O1=C1+P1+matches, O2=C1+P2+no-match both correspond
//            to the SAME candidate C1, while planIdentity/candidateMatchesPlan
//            remain distinct per entry
// Section E: same candidate+decision against different plans/presence
//            remain two separate observations/correspondences
// Section F: same candidate+plan+decision but different observedAt remain distinct
// Section G: three candidate shapes remain closed, entries embed candidate/
//            decision/planIdentity/etc unchanged
// Section H: ordering follows supplied history, never re-sorted
// Section I: no mutation, frozen results
// Section J: malformed input tolerance
// Section K: determinism, and reconstruct()'s archive-reading boundary
// Section L: vocabulary/import boundary

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function genuineDecisionRecord(candidate, decision, decidedAt) {
    return Object.freeze({ decided: true, candidate: Object.freeze(candidate), decision, decidedAt: decidedAt.toISOString() });
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

function appendAll(observations) {
    let history = [];
    for (const observation of observations) {
        history = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, observation);
    }
    return history;
}

const T1 = new Date('2026-08-30T10:00:00Z');
const T2 = new Date('2026-08-30T10:03:00Z');
const T3 = new Date('2026-08-30T10:07:00Z');
const OBS_T1 = new Date('2026-08-30T12:00:00Z');
const OBS_T2 = new Date('2026-08-30T12:05:00Z');
const OBS_T3 = new Date('2026-08-30T12:10:00Z');
const OBS_T4 = new Date('2026-08-30T12:15:00Z');

const C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' });
const C2 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-2' });

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty history.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence([]);
        assert(result.observationCount === 0, '1. empty history reports observationCount 0');
        assert(result.candidateCount === 0, '2. empty history reports candidateCount 0');
        assert(result.correspondences.length === 0, '3. empty history reports an empty correspondences array');
    }
    console.log('✓ Section A: an empty history produces an empty correspondence result');

    // ---------------------------------------------------------------
    // Section B — a single observation.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const planWithC1 = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, planWithC1, OBS_T1);
        const history = appendAll([O1]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(history);
        assert(result.observationCount === 1, '4. one observation reports observationCount 1');
        assert(result.candidateCount === 1, '5. one observation reports candidateCount 1');
        const [entry] = result.correspondences;
        assert(entry.observationIndex === 0, '6. entry carries observationIndex 0');
        assert(serialize(entry.candidate) === serialize(C1), '7. entry carries the candidate, read from the embedded decision, unchanged');
        assert(serialize(entry.decision) === serialize(D1), '8. entry carries the whole decision record unchanged');
        assert(serialize(entry.planIdentity) === serialize(O1.planIdentity), '9. entry carries planIdentity unchanged');
        assert(entry.candidatePresent === O1.candidatePresent, '10. entry carries candidatePresent unchanged');
        assert(entry.candidateType === O1.candidateType, '11. entry carries candidateType unchanged');
        assert(entry.candidateMatchesPlan === O1.candidateMatchesPlan, '12. entry carries candidateMatchesPlan unchanged');
        assert(entry.observedAt === OBS_T1.toISOString(), '13. entry carries observedAt as the exact ISO string');
    }
    console.log('✓ Section B: a single observation produces one correctly shaped correspondence entry');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: observationCount vs candidateCount.
    //   O1 -> C1, O2 -> C1, O3 -> C2, O4 -> C1
    //   observationCount = 4, candidateCount = 2, all four entries present.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'OBSERVE', T2);
        const planWithBoth = planNaming({ claims: ['Claim-1', 'Claim-2'] });

        const O1 = observe(D1, planWithBoth, OBS_T1);
        const O2 = observe(D1, planWithBoth, OBS_T2);
        const O3 = observe(D2, planWithBoth, OBS_T3);
        const O4 = observe(D1, planWithBoth, OBS_T4);

        const history = appendAll([O1, O2, O3, O4]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(history);

        assert(result.observationCount === 4, '14. FLAGSHIP — four history entries produce observationCount 4');
        assert(result.candidateCount === 2, '15. FLAGSHIP — only two distinct candidates (C1, C2) exist across the four observations');

        const [e1, e2, e3, e4] = result.correspondences;
        assert(e1.observationIndex === 0 && e2.observationIndex === 1 && e3.observationIndex === 2 && e4.observationIndex === 3, '16. FLAGSHIP — observationIndex tracks position in supplied history, 0 through 3');
        assert(serialize(e1.candidate) === serialize(C1), '17. FLAGSHIP — e1 refers to candidate C1');
        assert(serialize(e2.candidate) === serialize(C1), '18. FLAGSHIP — e2 also refers to candidate C1');
        assert(serialize(e3.candidate) === serialize(C2), '19. FLAGSHIP — e3 refers to candidate C2');
        assert(serialize(e4.candidate) === serialize(C1), '20. FLAGSHIP — e4 also refers to candidate C1');
        assert(result.correspondences.length === 4, '21. FLAGSHIP — all four correspondence entries remain present, even though only two candidates exist');
    }
    console.log('✓ Section C: FLAGSHIP — observationCount and candidateCount diverge exactly as the milestone\'s own worked example requires, with all four entries retained');

    // ---------------------------------------------------------------
    // Section D — CRITICAL ARCHITECTURAL TEST: candidate identity != plan
    // identity != observation identity. The same candidate, decided once,
    // observed against two different plans with opposite match outcomes,
    // must still be identified as the SAME candidate throughout.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const planA = planNaming({ claims: ['Claim-1'] });
        const planB = planNaming({ claims: [] });

        const O1 = observe(D1, planA, OBS_T1);
        const O2 = observe(D1, planB, OBS_T2);
        assert(O1.candidateMatchesPlan === true, 'test setup — O1 must genuinely match its plan');
        assert(O2.candidateMatchesPlan === false, 'test setup — O2 must genuinely NOT match its plan');
        assert(O1.planIdentity.planFingerprint !== O2.planIdentity.planFingerprint, 'test setup — O1 and O2 must be checked against structurally different plans');

        const history = appendAll([O1, O2]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(history);

        assert(result.observationCount === 2, '22. CRITICAL — two observations report observationCount 2');
        assert(result.candidateCount === 1, '23. CRITICAL — both observations correspond to the SAME single candidate C1, despite differing plans and match outcomes');

        const [e1, e2] = result.correspondences;
        assert(serialize(e1.candidate) === serialize(e2.candidate), '24. CRITICAL — both entries carry the identical candidate C1');
        assert(serialize(e1.candidate) === serialize(C1), '25. CRITICAL — that shared candidate is exactly C1');
        assert(e1.planIdentity.planFingerprint !== e2.planIdentity.planFingerprint, '26. CRITICAL — the two entries retain their own DISTINCT plan identities');
        assert(e1.candidateMatchesPlan === true && e2.candidateMatchesPlan === false, '27. CRITICAL — the two entries retain their own distinct revalidation facts (candidateMatchesPlan)');
        assert(e1.observedAt !== e2.observedAt, '28. CRITICAL — the two entries retain their own distinct observedAt values');
    }
    console.log('✓ Section D: CRITICAL — candidate identity is held distinct from plan identity and observation identity: the same candidate observed against two different plans is identified as ONE candidate while every other per-observation fact stays distinct');

    // ---------------------------------------------------------------
    // Section E — the same candidate and decision, observed against
    // different plans (different presence outcomes), remain two separate
    // observations/correspondences.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const planPresent = planNaming({ claims: ['Claim-1'] });
        const planAbsent = planNaming({ claims: [] });

        const O_present = observe(D1, planPresent, OBS_T1);
        const O_absent = observe(D1, planAbsent, OBS_T2);
        assert(O_present.candidatePresent === true, 'test setup — O_present must genuinely find the candidate present');
        assert(O_absent.candidatePresent === false, 'test setup — O_absent must genuinely find the candidate absent');

        const history = appendAll([O_present, O_absent]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(history);

        assert(result.observationCount === 2, '29. two observations against two plans remain two distinct correspondence entries');
        assert(result.candidateCount === 1, '30. the shared candidate is still counted once');
        assert(result.correspondences[0].candidatePresent === true, '31. entry 0 reports candidatePresent true');
        assert(result.correspondences[1].candidatePresent === false, '32. entry 1 reports candidatePresent false');
    }
    console.log('✓ Section E: the same candidate and decision observed against different plans remain two separate correspondence entries');

    // ---------------------------------------------------------------
    // Section F — same candidate, plan, and decision, differing only in
    // observedAt, remain distinct.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });

        const O_first = observe(D1, plan, OBS_T1);
        const O_second = observe(D1, plan, OBS_T2);

        const history = appendAll([O_first, O_second]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(history);

        assert(result.observationCount === 2, '33. two observations differing only in observedAt remain two distinct correspondence entries');
        assert(result.candidateCount === 1, '34. the shared candidate is still counted once');
        assert(result.correspondences[0].observedAt === OBS_T1.toISOString(), '35. entry 0 carries the first observedAt');
        assert(result.correspondences[1].observedAt === OBS_T2.toISOString(), '36. entry 1 carries the second observedAt');
        assert(serialize(result.correspondences[0].candidate) === serialize(result.correspondences[1].candidate), '37. both entries still name the identical candidate');
    }
    console.log('✓ Section F: two observations sharing candidate, plan, and decision but differing only in observedAt remain distinct correspondence entries');

    // ---------------------------------------------------------------
    // Section G — all three candidate shapes remain closed; entries embed
    // their fields unchanged.
    // ---------------------------------------------------------------
    {
        const divergentCandidate = Object.freeze({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'Claim-D', snapshotIndex: 0 });
        const claimOnlyCandidate = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-E' });
        const snapshotOnlyCandidate = Object.freeze({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 3 });

        const D_DIVERGENT = genuineDecisionRecord(divergentCandidate, 'OBSERVE', T1);
        const D_CLAIM = genuineDecisionRecord(claimOnlyCandidate, 'DEFER', T2);
        const D_SNAPSHOT = genuineDecisionRecord(snapshotOnlyCandidate, 'OBSERVE', T3);
        const plan = planNaming({ divergent: [['Claim-D', 0]], claims: ['Claim-E'], snapshots: [3] });

        const O_DIVERGENT = observe(D_DIVERGENT, plan, OBS_T1);
        const O_CLAIM = observe(D_CLAIM, plan, OBS_T2);
        const O_SNAPSHOT = observe(D_SNAPSHOT, plan, OBS_T3);

        const history = appendAll([O_DIVERGENT, O_CLAIM, O_SNAPSHOT]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(history);

        assert(result.correspondences[0].candidate.type === 'DIVERGENT_CORRESPONDENCE', '38. divergent-correspondence candidate type preserved');
        assert(serialize(result.correspondences[0].candidate) === serialize(divergentCandidate), '39. divergent-correspondence candidate embedded whole, unchanged');
        assert(result.correspondences[1].candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', '40. claim-without-snapshot candidate type preserved');
        assert(!('snapshotIndex' in result.correspondences[1].candidate), '41. claim-without-snapshot candidate carries no snapshotIndex field');
        assert(result.correspondences[2].candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', '42. snapshot-without-claim candidate type preserved');
        assert(!('claimId' in result.correspondences[2].candidate), '43. snapshot-without-claim candidate carries no claimId field');
        assert(result.candidateCount === 3, '44. three structurally distinct candidates are counted as three');
        assert(result.correspondences[0].candidateType === 'DIVERGENT_CORRESPONDENCE', '45. candidateType field mirrors the candidate\'s own type');
    }
    console.log('✓ Section G: all three candidate shapes remain closed and each entry embeds its own fields whole, unchanged');

    // ---------------------------------------------------------------
    // Section H — ordering follows supplied history, never re-sorted by
    // observedAt.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);
        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'] });

        const O_LATE = observe(D1, plan, OBS_T4);
        const O_EARLY = observe(D2, plan, OBS_T1);

        const history = appendAll([O_LATE, O_EARLY]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(history);

        assert(result.correspondences[0].observedAt === OBS_T4.toISOString(), '46. the correspondence entry order follows supplied history order, not chronological order');
        assert(result.correspondences[1].observedAt === OBS_T1.toISOString(), '47. the later-appended, earlier-observed entry stays second, matching history\'s own order');
    }
    console.log('✓ Section H: correspondence order follows supplied history order exactly — never re-sorted by observedAt');

    // ---------------------------------------------------------------
    // Section I — no mutation, frozen results.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const history = appendAll([O1]);
        const historyJsonBefore = serialize(history);
        const observationJsonBefore = serialize(O1);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(history);

        assert(serialize(history) === historyJsonBefore, '48. the input history is never mutated');
        assert(serialize(O1) === observationJsonBefore, '49. the original observation record is never mutated');
        assert(Object.isFrozen(result), '50. the result is frozen');
        assert(Object.isFrozen(result.correspondences), '51. correspondences is frozen');
        assert(Object.isFrozen(result.correspondences[0]), '52. each correspondence entry is itself frozen');
    }
    console.log('✓ Section I: the input history and original observation records are never mutated, and every returned object/array is frozen');

    // ---------------------------------------------------------------
    // Section J — malformed input tolerance.
    // ---------------------------------------------------------------
    {
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence().observationCount === 0, '53. calling with no arguments defaults to an empty result, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(null).observationCount === 0, '54. null history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(undefined).observationCount === 0, '55. undefined history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence('not an array').observationCount === 0, '56. a non-array history degrades to empty, never throws');
        assert(describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(42).observationCount === 0, '57. a non-array, non-object history degrades to empty, never throws');

        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const mixed = [null, undefined, 42, 'not an observation', {}, { observed: false, outcome: 'INVALID_OBSERVATION' }, { observed: 'true' }, O1];
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(mixed);
        assert(result.observationCount === 1, '58. non-genuine entries are silently excluded, leaving only the one genuine observation');
        assert(result.correspondences[0].observationIndex === 0, '59. observationIndex is assigned only to genuine entries, after exclusion, so the sole surviving entry gets index 0');
    }
    console.log('✓ Section J: malformed/absent input degrades to a valid, empty result rather than throwing, and non-genuine entries are silently excluded');

    // ---------------------------------------------------------------
    // Section K — determinism, and reconstruct()'s archive-reading
    // boundary: the pure function never consults current archive state.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C2, 'DEFER', T2);
        const plan = planNaming({ claims: ['Claim-1', 'Claim-2'] });
        const O1 = observe(D1, plan, OBS_T1);
        const O2 = observe(D2, plan, OBS_T2);
        const history = appendAll([O1, O2]);

        const once = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(history);
        const twice = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(history);
        assert(serialize(once) === serialize(twice), '60. repeated calls on an identical history are byte-identical');

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendRevalidationObservationRecord(O1);
        archive = archive.appendRevalidationObservationRecord(O2);
        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(archive);
        assert(serialize(reconstructed) === serialize(once), '61. reconstruct() over an archive holding the SAME observations agrees exactly with describe() over the raw history');
        assert(reconstructed.observationCount === 2, '62. reconstruct() reports exactly the observations the archive genuinely holds, never more, never fewer');

        const emptyResult = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence([]);
        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(PublicationObservationArchive.empty());
        assert(serialize(emptyReconstructed) === serialize(emptyResult), '63. reconstruct() over an empty archive agrees exactly with describe() over an empty history');

        const invalidArchiveReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(null);
        assert(serialize(invalidArchiveReconstructed) === serialize(emptyResult), '64. reconstruct() over an invalid/missing archive degrades to the empty-history result, never a throw');
    }
    console.log('✓ Section K: repeated computation over the same history is byte-identical, and reconstruct() reads only the archive\'s own stored observation history');

    // ---------------------------------------------------------------
    // Section L — vocabulary/import boundary: no rediscovery of 0.8.144 or
    // 0.8.157, no interpretive vocabulary.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(appendAll([O1]));

        const topKeys = Object.keys(result).sort();
        assert(serialize(topKeys) === serialize(['observationCount', 'candidateCount', 'correspondences'].sort()), '65. the result carries exactly the documented, factual top-level fields');

        const entryKeys = Object.keys(result.correspondences[0]).sort();
        assert(serialize(entryKeys) === serialize(['observationIndex', 'candidate', 'decision', 'planIdentity', 'candidatePresent', 'candidateType', 'candidateMatchesPlan', 'observedAt'].sort()), '66. an entry carries exactly the documented, factual fields');

        const forbidden = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'unknown'];
        for (const term of forbidden) {
            assert(!topKeys.includes(term) && !entryKeys.includes(term), `67. the result never carries state-machine vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondenceView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['resolved', 'unresolved', 'pending', 'superseded', 'active', 'stale', 'correct', 'incorrect', 'approved', 'rejected', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'winner', 'execute', 'authoritative', 'trust', 'confidence', 'reputation', 'severity'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `68. this file's own code never carries "${term}"`);
        }

        // This milestone must not call 0.8.144 or 0.8.157 to rediscover a
        // candidate — this file's own describeXxx() has zero imports, and
        // its reconstructXxx() imports exactly ONE module: the 0.8.167
        // observation-history archive reconstruction seam.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 1, '69. this file imports exactly one module');
        assert(importLines[0].includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js'), '70. the one import is the 0.8.167 observation-history archive reconstruction seam, never 0.8.144\'s own candidate-selection boundary or 0.8.157\'s own revalidation module');
        assert(!codeOnly.includes('reconciliationplanview') && !codeOnly.includes('describepublisherleaderboardclaimsnapshotreconciliationcandidate') && !codeOnly.includes('candidaterevalidationview'), '71. this file never calls 0.8.144\'s own candidate-selection function or 0.8.157\'s own revalidation function to rediscover anything');
    }
    console.log('✓ Section L: the result carries no state-machine or interpretive vocabulary, and the module never rediscovers a candidate via 0.8.144, 0.8.157, or any plan/discovery module');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondenceView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondenceView.test.js FAILED:', error);
    process.exitCode = 1;
});
