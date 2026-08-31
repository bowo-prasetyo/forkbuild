import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from '../application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummaryView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';

// 0.8.175 — Reconciliation Candidate Evidence Summary Projection.
//
// Section A: empty histories — zero counts, empty candidates
// Section B: decision-only candidate — zero observations, correctly shaped
// Section C: observation-only candidate — zero decisions, correctly shaped
//            (the projection is not secretly "decision-driven")
// Section D: a candidate carrying both decisions and observations
// Section E: candidate order — first appearance across decisions, then
//            observation-only candidates in their own appearance order
// Section F: history order preserved within decisions/observations lists,
//            never re-sorted chronologically
// Section G: FLAGSHIP — the milestone's own worked example (C1/C2/C3)
// Section H: malformed input tolerance, independently per history
// Section I: no mutation, frozen results, determinism
// Section J: reconstruct()'s archive-reading boundary, calling 0.8.153 and
//            0.8.171 exactly once each
// Section K: vocabulary/import boundary — no judgment vocabulary, imports
//            only 0.8.153 and 0.8.171

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

const T1 = new Date('2026-08-30T10:00:00Z');
const T2 = new Date('2026-08-30T10:03:00Z');
const T3 = new Date('2026-08-30T10:07:00Z');
const OBS_T1 = new Date('2026-08-30T12:00:00Z');
const OBS_T2 = new Date('2026-08-30T12:05:00Z');
const OBS_T3 = new Date('2026-08-30T12:10:00Z');
const OBS_T4 = new Date('2026-08-30T12:15:00Z');
const OBS_T5 = new Date('2026-08-30T12:20:00Z');

const C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' });
const C2 = Object.freeze({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 2 });
const C3 = Object.freeze({ type: 'DIVERGENT_CORRESPONDENCE', claimId: 'Claim-3', snapshotIndex: 5 });

async function run() {
    // ---------------------------------------------------------------
    // Section A — empty histories.
    // ---------------------------------------------------------------
    {
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary([], []);
        assert(result.candidateCount === 0, '1. two empty histories report candidateCount 0');
        assert(result.decisionCount === 0, '2. two empty histories report decisionCount 0');
        assert(result.observationCount === 0, '3. two empty histories report observationCount 0');
        assert(result.candidates.length === 0, '4. two empty histories report an empty candidates array');
        assert(Object.isFrozen(result), '5. an empty result is frozen');
        assert(Object.isFrozen(result.candidates), '6. an empty candidates array is frozen');
    }
    console.log('✓ Section A: two empty histories produce an empty evidence summary');

    // ---------------------------------------------------------------
    // Section B — decision-only candidate.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionHistory = appendDecisions([D1]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(decisionHistory, []);

        assert(result.candidateCount === 1, '7. a decision-only history reports candidateCount 1');
        assert(result.decisionCount === 1, '8. a decision-only history reports decisionCount 1');
        assert(result.observationCount === 0, '9. a decision-only history reports observationCount 0');
        const [entry] = result.candidates;
        assert(serialize(entry.candidate) === serialize(C1), '10. candidate shape preserved unchanged, by value');
        assert(entry.decisionCount === 1, '11. the candidate\'s own decisionCount is 1');
        assert(entry.decisions.length === 1, '12. the candidate\'s own decisions list carries one entry');
        assert(serialize(entry.decisions[0]) === serialize({ decision: 'OBSERVE', decidedAt: T1.toISOString() }), '13. the decision entry carries decision/decidedAt unchanged');
        assert(entry.observationCount === 0, '14. a candidate with no observation evidence reports observationCount 0');
        assert(entry.observations.length === 0, '15. a candidate with no observation evidence reports an empty observations array — never fabricated');
    }
    console.log('✓ Section B: a decision-only candidate is reported with zero observation evidence, never fabricated');

    // ---------------------------------------------------------------
    // Section C — observation-only candidate: the projection is not
    // secretly "decision-driven."
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const observationHistory = appendObservations([O1]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary([], observationHistory);

        assert(result.candidateCount === 1, '16. an observation-only history reports candidateCount 1');
        assert(result.decisionCount === 0, '17. an observation-only history reports decisionCount 0');
        assert(result.observationCount === 1, '18. an observation-only history reports observationCount 1');
        const [entry] = result.candidates;
        assert(serialize(entry.candidate) === serialize(C1), '19. candidate shape preserved unchanged, by value, from the embedded decision');
        assert(entry.decisionCount === 0, '20. a candidate with no decision evidence in decisionHistory reports decisionCount 0');
        assert(entry.decisions.length === 0, '21. a candidate with no decision evidence reports an empty decisions array — never derived from the observation\'s own embedded decision');
        assert(entry.observationCount === 1, '22. the candidate\'s own observationCount is 1');
        assert(serialize(entry.observations[0].decision) === serialize(D1), '23. the observation entry carries the whole embedded decision record unchanged');
        assert(serialize(Object.keys(entry.observations[0]).sort()) === serialize(['decision', 'planIdentity', 'candidatePresent', 'candidateType', 'candidateMatchesPlan', 'observedAt'].sort()), '24. an observation entry carries exactly its documented fields');
    }
    console.log('✓ Section C: a candidate with observation evidence and NO decision evidence still appears — this projection is not decision-driven');

    // ---------------------------------------------------------------
    // Section D — a candidate carrying both decisions and observations.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C1, 'DEFER', T2);
        const decisionHistory = appendDecisions([D1, D2]);

        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const O2 = observe(D2, plan, OBS_T2);
        const observationHistory = appendObservations([O1, O2]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(decisionHistory, observationHistory);
        assert(result.candidateCount === 1, '25. one candidate carrying both kinds of evidence still counts once');
        assert(result.decisionCount === 2, '26. decisionCount reflects the decision history');
        assert(result.observationCount === 2, '27. observationCount reflects the observation history');
        const [entry] = result.candidates;
        assert(entry.decisionCount === 2 && entry.decisions.length === 2, '28. the candidate carries both decisions');
        assert(entry.observationCount === 2 && entry.observations.length === 2, '29. the candidate carries both observations');
    }
    console.log('✓ Section D: a candidate carrying evidence from both branches merges into exactly one combined entry');

    // ---------------------------------------------------------------
    // Section E — candidate order: first appearance across decisions, then
    // observation-only candidates in their own appearance order.
    // ---------------------------------------------------------------
    {
        // Decisions name C2 then C1 (in that order); observations name C1,
        // then a brand-new C3, then C2.
        const D1 = genuineDecisionRecord(C2, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C1, 'OBSERVE', T2);
        const decisionHistory = appendDecisions([D1, D2]);

        const plan = planNaming({ claims: ['Claim-1', 'Claim-3'], snapshots: [2] });
        const O1 = observe(D2, plan, OBS_T1); // C1
        const D3 = genuineDecisionRecord(C3, 'OBSERVE', T3);
        const O2 = observe(D3, plan, OBS_T2); // C3 — no decision in decisionHistory
        const O3 = observe(D1, plan, OBS_T3); // C2
        const observationHistory = appendObservations([O1, O2, O3]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(decisionHistory, observationHistory);
        const order = result.candidates.map((entry) => entry.candidate);
        assert(serialize(order) === serialize([C2, C1, C3]), '30. candidates are ordered by first appearance in decisionHistory (C2, C1), then observation-only candidates in their own first-appearance order (C3)');
    }
    console.log('✓ Section E: candidate order follows first appearance across decisions, then observation-only candidates in their own appearance order');

    // ---------------------------------------------------------------
    // Section F — history order preserved within decisions/observations,
    // never re-sorted chronologically.
    // ---------------------------------------------------------------
    {
        // D2 is recorded with an EARLIER decidedAt than D1, but D1 precedes
        // D2 in decisionHistory's own append order.
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T2);
        const D2 = genuineDecisionRecord(C1, 'DEFER', T1);
        const decisionHistory = appendDecisions([D1, D2]);

        const plan = planNaming({ claims: ['Claim-1'] });
        // O2 is recorded with an EARLIER observedAt than O1, but O1
        // precedes O2 in observationHistory's own append order.
        const O1 = observe(D1, plan, OBS_T2);
        const O2 = observe(D2, plan, OBS_T1);
        const observationHistory = appendObservations([O1, O2]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(decisionHistory, observationHistory);
        const [entry] = result.candidates;
        assert(serialize(entry.decisions.map((d) => d.decidedAt)) === serialize([T2.toISOString(), T1.toISOString()]), '31. decisions preserve decisionHistory\'s own append order, never re-sorted by decidedAt');
        assert(serialize(entry.observations.map((o) => o.observedAt)) === serialize([OBS_T2.toISOString(), OBS_T1.toISOString()]), '32. observations preserve observationHistory\'s own append order, never re-sorted by observedAt');
    }
    console.log('✓ Section F: decisions/observations preserve each history\'s own order — this is an evidence assembly, never a timeline');

    // ---------------------------------------------------------------
    // Section G — FLAGSHIP. C1: D1,D2 / O1,O2,O3. C2: D3 / O4.
    // C3: (no decisions) / O5. C3 must still appear.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const D2 = genuineDecisionRecord(C1, 'DEFER', T2);
        const D3 = genuineDecisionRecord(C2, 'OBSERVE', T3);
        const decisionHistory = appendDecisions([D1, D2, D3]);

        const plan = planNaming({ claims: ['Claim-1'], snapshots: [2] });
        const O1 = observe(D1, plan, OBS_T1);
        const O2 = observe(D2, plan, OBS_T2);
        const O3 = observe(D1, plan, OBS_T3);
        const O4 = observe(D3, plan, OBS_T4);
        // C3's own decision is never appended to decisionHistory — only
        // its observation is recorded.
        const D4 = genuineDecisionRecord(C3, 'OBSERVE', T3);
        const O5 = observe(D4, plan, OBS_T5);
        const observationHistory = appendObservations([O1, O2, O3, O4, O5]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(decisionHistory, observationHistory);

        assert(result.candidateCount === 3, '33. FLAGSHIP: three distinct candidates, C1, C2, and C3');
        assert(result.decisionCount === 3, '34. FLAGSHIP: decisionCount reflects the three recorded decisions (C3\'s own decision was never recorded)');
        assert(result.observationCount === 5, '35. FLAGSHIP: observationCount reflects all five recorded observations');

        const [c1Entry, c2Entry, c3Entry] = result.candidates;
        assert(serialize(c1Entry.candidate) === serialize(C1), '36. FLAGSHIP: first candidate group is C1, first to appear in decisionHistory');
        assert(c1Entry.decisionCount === 2 && c1Entry.observationCount === 3, '37. FLAGSHIP: C1 carries its two decisions and three observations');

        assert(serialize(c2Entry.candidate) === serialize(C2), '38. FLAGSHIP: second candidate group is C2, second to appear in decisionHistory');
        assert(c2Entry.decisionCount === 1 && c2Entry.observationCount === 1, '39. FLAGSHIP: C2 carries its one decision and one observation');

        assert(serialize(c3Entry.candidate) === serialize(C3), '40. FLAGSHIP: THE CRITICAL ASSERTION — C3 still appears, despite having NO decision in decisionHistory');
        assert(c3Entry.decisionCount === 0 && c3Entry.decisions.length === 0, '41. FLAGSHIP: C3\'s own decisionCount is 0 and its decisions list is empty — never fabricated from its observation\'s own embedded decision');
        assert(c3Entry.observationCount === 1 && c3Entry.observations.length === 1, '42. FLAGSHIP: C3 carries its one observation');
    }
    console.log('✓ Section G: FLAGSHIP — C3 appears with observation evidence and zero decision evidence, proving the projection is not decision-driven');

    // ---------------------------------------------------------------
    // Section H — malformed input tolerance, independently per history.
    // ---------------------------------------------------------------
    {
        const emptyBoth = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(null, undefined);
        assert(serialize(emptyBoth) === serialize({ candidateCount: 0, decisionCount: 0, observationCount: 0, candidates: [] }), '43. two malformed histories degrade to the empty result');

        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionHistory = appendDecisions([D1]);
        const malformedObservations = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(decisionHistory, 'not-an-array');
        assert(malformedObservations.candidateCount === 1 && malformedObservations.decisionCount === 1 && malformedObservations.observationCount === 0, '44. a malformed observation history degrades only that side to empty, leaving genuine decision evidence intact');

        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const observationHistory = appendObservations([O1, { observed: false }, null, 42]);
        const malformedDecisions = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary({ not: 'an-array' }, observationHistory);
        assert(malformedDecisions.candidateCount === 1 && malformedDecisions.decisionCount === 0 && malformedDecisions.observationCount === 1, '45. a malformed decision history degrades only that side to empty, and non-genuine observation entries are silently excluded');
    }
    console.log('✓ Section H: malformed input degrades independently per history, never throws');

    // ---------------------------------------------------------------
    // Section I — no mutation, frozen results, determinism.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionHistory = appendDecisions([D1]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const observationHistory = appendObservations([O1]);

        const beforeDecision = serialize(decisionHistory);
        const beforeObservation = serialize(observationHistory);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(decisionHistory, observationHistory);
        assert(serialize(decisionHistory) === beforeDecision, '46. decisionHistory is never mutated');
        assert(serialize(observationHistory) === beforeObservation, '47. observationHistory is never mutated');

        assert(Object.isFrozen(result), '48. the result is frozen');
        assert(Object.isFrozen(result.candidates), '49. candidates array is frozen');
        assert(Object.isFrozen(result.candidates[0]), '50. a candidate entry is frozen');
        assert(Object.isFrozen(result.candidates[0].decisions), '51. a candidate\'s own decisions array is frozen');
        assert(Object.isFrozen(result.candidates[0].decisions[0]), '52. a decision entry is frozen');
        assert(Object.isFrozen(result.candidates[0].observations), '53. a candidate\'s own observations array is frozen');
        assert(Object.isFrozen(result.candidates[0].observations[0]), '54. an observation entry is frozen');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(decisionHistory, observationHistory);
        assert(serialize(again) === serialize(result), '55. calling describeXxx() twice with byte-identical arguments returns a byte-identical result');
    }
    console.log('✓ Section I: no mutation of any supplied history, every returned object/array is frozen, and computation is deterministic');

    // ---------------------------------------------------------------
    // Section J — reconstruct()'s archive-reading boundary.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionHistory = appendDecisions([D1]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const observationHistory = appendObservations([O1]);

        const archive = new PublicationObservationArchive({
            reconciliationDecisionRecords: decisionHistory,
            revalidationObservationRecords: observationHistory
        });

        const described = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(decisionHistory, observationHistory);
        const reconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(archive);
        assert(serialize(reconstructed) === serialize(described), '56. reconstruct() over an archive holding the SAME histories agrees exactly with describe() over the raw histories');

        const emptyDescribed = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary([], []);
        const emptyReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(PublicationObservationArchive.empty());
        assert(serialize(emptyReconstructed) === serialize(emptyDescribed), '57. reconstruct() over an empty archive agrees exactly with describe() over empty histories');

        const invalidReconstructed = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(null);
        assert(serialize(invalidReconstructed) === serialize(emptyDescribed), '58. reconstruct() over an invalid/missing archive degrades to the empty-histories result, never a throw');
    }
    console.log('✓ Section J: reconstruct() reads both of the archive\'s own stored histories via 0.8.153\'s and 0.8.171\'s own seams, agreeing exactly with describe() over the equivalent raw histories');

    // ---------------------------------------------------------------
    // Section K — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const D1 = genuineDecisionRecord(C1, 'OBSERVE', T1);
        const decisionHistory = appendDecisions([D1]);
        const plan = planNaming({ claims: ['Claim-1'] });
        const O1 = observe(D1, plan, OBS_T1);
        const observationHistory = appendObservations([O1]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummary(decisionHistory, observationHistory);

        const topKeys = Object.keys(result).sort();
        assert(serialize(topKeys) === serialize(['candidateCount', 'decisionCount', 'observationCount', 'candidates'].sort()), '59. the result carries exactly the documented, factual top-level fields');

        const entryKeys = Object.keys(result.candidates[0]).sort();
        assert(serialize(entryKeys) === serialize(['candidate', 'decisionCount', 'decisions', 'observationCount', 'observations'].sort()), '60. a combined candidate entry carries exactly the documented, factual fields');

        const forbidden = ['correct', 'incorrect', 'valid', 'invalid', 'current', 'latest', 'stale', 'superseded', 'resolved', 'winner', 'score', 'rank', 'unresolved', 'pending', 'active', 'approved', 'rejected', 'unknown', 'changed', 'reversed', 'final', 'preferred', 'conflicting', 'corrected'];
        const allKeys = [...topKeys, ...entryKeys];
        for (const term of forbidden) {
            assert(!allKeys.includes(term), `61. the result never carries judgment vocabulary ('${term}')`);
        }

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummaryView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        // 'valid'/'invalid' are deliberately excluded from this code-text
        // check (unlike the result-keys check above) because this file's
        // own, legitimate imports/identifiers name 0.8.171's
        // "RevalidationObservation" modules — the identical exclusion
        // 0.8.171's own test applies for the identical reason.
        const forbiddenInCode = ['correct', 'incorrect', 'current', 'latest', 'stale', 'superseded', 'resolved', 'winner', 'score', 'rank', 'repair', 'replace', 'accept', 'reject', 'merge', 'delete', 'apply', 'execute', 'authoritative', 'trust', 'confidence', 'reputation', 'severity', 'changed', 'reversed', 'final', 'preferred', 'conflicting', 'corrected'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `62. this file's own code never carries "${term}"`);
        }

        // This milestone must import exactly 0.8.153's and 0.8.171's own
        // correspondence projections — never 0.8.144, 0.8.157, either
        // history-storage module, or either candidate-evolution module.
        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        const importBlock = moduleSource.slice(0, moduleSource.indexOf('\n\n'));
        assert(importLines.length === 2, '63. this file imports from exactly two modules');
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondenceView.js'), '64. one import is 0.8.153\'s own decision-candidate correspondence projection');
        assert(importBlock.includes('PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondenceView.js'), '65. the other import is 0.8.171\'s own observation-candidate correspondence projection');
        assert(!codeOnly.includes('decisionhistoryview') && !codeOnly.includes('decisionhistory.js') && !codeOnly.includes('revalidationobservationhistoryview') && !codeOnly.includes('revalidationobservation.js') && !codeOnly.includes('candidatedecisionevolutionview') && !codeOnly.includes('candidatedecisionrevalidationobservationevolutionview'), '66. this file never imports either history-storage module, either raw observation-recording module, or either candidate-evolution module');
    }
    console.log('✓ Section K: the result carries no judgment vocabulary, and the module imports only 0.8.153\'s and 0.8.171\'s own correspondence projections, never rediscovering candidate identity or deriving one branch from the other');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummaryView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceSummaryView.test.js FAILED:', error);
    process.exitCode = 1;
});
