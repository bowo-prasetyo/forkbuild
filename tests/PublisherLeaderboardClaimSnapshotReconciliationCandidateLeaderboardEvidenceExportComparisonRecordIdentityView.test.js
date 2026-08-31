import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentityView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetailView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison.js';

// 0.8.195 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Record Identity View.
//
// Section A: FLAGSHIP — the milestone's own worked example. Three
//            observations differing by exactly one field each
//            (candidateMatchesPlan true/false; observedAt T1/T2) prove
//            0.8.189 already treats them as distinct records, and this
//            file's own named fields make the exact differing field
//            plainly visible.
// Section B: a decision record's identity is exactly its own four named
//            fields — decided/candidate/decision/decidedAt — nothing more,
//            nothing less.
// Section C: an observation record's identity is exactly its own seven
//            named fields, with `decision` forwarded as the full embedded
//            decision record, never flattened to a disposition string.
// Section D: no candidate-presence section on this file's own result;
//            evidence stays flat, never regrouped by candidate.
// Section E: order is preserved, position for position, matching 0.8.193's
//            own array order exactly.
// Section F: malformed/absent input degrades to an empty, valid projection
//            on every section, never throws; a malformed record within an
//            otherwise genuine array degrades in place.
// Section G: determinism, no mutation, frozen output.
// Section H: vocabulary/import boundary — zero imports, no reconstructXxx,
//            no JSON.stringify()/diff/comparison vocabulary, no
//            ranking/judgment/synchronization vocabulary.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function candidateOf(claimId) {
    return Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId });
}

function decisionOf(candidate, decision, decidedAt, decided = true) {
    return Object.freeze({ decided, candidate, decision, decidedAt });
}

function planIdentityOf(planFingerprint) {
    return Object.freeze({ planFingerprint });
}

function observationOf(candidate, decision, planIdentity, candidatePresent, candidateType, candidateMatchesPlan, observedAt) {
    return Object.freeze({ candidate, decision, planIdentity, candidatePresent, candidateType, candidateMatchesPlan, observedAt });
}

function detailOf(shared, sourceOnly, targetOnly) {
    return Object.freeze({
        sharedCount: shared.length,
        sourceOnlyCount: sourceOnly.length,
        targetOnlyCount: targetOnly.length,
        shared: Object.freeze(shared.slice()),
        sourceOnly: Object.freeze(sourceOnly.slice()),
        targetOnly: Object.freeze(targetOnly.slice())
    });
}

function entryOf(candidate, decisionDetail, observationDetail) {
    return Object.freeze({ candidate, decisionDetail, observationDetail });
}

function exportOf(entries, filter, comparisonState) {
    return Object.freeze({
        protocolVersion: 1,
        comparisonState,
        filter: Object.freeze({ ...filter }),
        candidateCount: entries.length,
        candidates: Object.freeze(entries.slice())
    });
}

const ALL_FILTER = Object.freeze({ evidenceKind: 'ALL', replicaRelation: 'ALL' });

function recordIdentityFor(sourceExport, targetExport) {
    const comparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceExport, targetExport);
    const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(comparison);
    return {
        detail,
        identity: describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity(detail)
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    let flagshipIdentity;
    let flagshipDetail;
    {
        const C1 = candidateOf('C1');
        const decision1 = decisionOf(C1, 'OBSERVE', '2026-08-30T00:00:00.000Z');
        const plan1 = planIdentityOf('FP1');

        const T1 = '2026-08-31T06:00:00.000Z';
        const T2 = '2026-08-31T09:00:00.000Z';

        // O1 is the anchor: present identically in both documents, so
        // 0.8.189 reports it as shared.
        const O1 = observationOf(C1, decision1, plan1, true, 'CLAIM', true, T1);
        // O2 differs from O1 by exactly one field — candidateMatchesPlan —
        // and appears only in the source document.
        const O2 = observationOf(C1, decision1, plan1, true, 'CLAIM', false, T1);
        // O3 differs from O1 by exactly one field — observedAt — and
        // appears only in the target document.
        const O3 = observationOf(C1, decision1, plan1, true, 'CLAIM', true, T2);

        const sourceExport = exportOf(
            [entryOf(C1, detailOf([], [], []), detailOf([O1, O2], [], []))],
            ALL_FILTER,
            'PEER_PRESENT'
        );
        const targetExport = exportOf(
            [entryOf(C1, detailOf([], [], []), detailOf([O1, O3], [], []))],
            ALL_FILTER,
            'PEER_PRESENT'
        );

        const { detail, identity } = recordIdentityFor(sourceExport, targetExport);
        flagshipIdentity = identity;
        flagshipDetail = detail;

        // 0.8.189 already considers O1/O2/O3 three distinct records — the
        // invariant this milestone exists to preserve, never re-derive.
        assert(detail.observationEvidence.shared.length === 1, '1. FLAGSHIP — O1 is the one shared observation');
        assert(detail.observationEvidence.sourceOnly.length === 1, '2. FLAGSHIP — O2 is the one source-only observation');
        assert(detail.observationEvidence.targetOnly.length === 1, '3. FLAGSHIP — O3 is the one target-only observation');

        const sharedIdentity = identity.observationEvidence.shared[0];
        const sourceOnlyIdentity = identity.observationEvidence.sourceOnly[0];
        const targetOnlyIdentity = identity.observationEvidence.targetOnly[0];

        // The shared/source-only pair differs by exactly one named field:
        // candidateMatchesPlan. Every other field is identical.
        assert(sharedIdentity.candidateMatchesPlan === true && sourceOnlyIdentity.candidateMatchesPlan === false, '4. FLAGSHIP — candidateMatchesPlan is plainly visible as the field distinguishing O1 from O2');
        assert(sharedIdentity.observedAt === sourceOnlyIdentity.observedAt, '5. FLAGSHIP — O1 and O2 agree on observedAt, isolating candidateMatchesPlan as the one differing field');
        assert(sharedIdentity.candidatePresent === sourceOnlyIdentity.candidatePresent && sharedIdentity.candidateType === sourceOnlyIdentity.candidateType, '6. FLAGSHIP — O1 and O2 agree on candidatePresent/candidateType');

        // The shared/target-only pair differs by exactly one named field:
        // observedAt. Every other field is identical.
        assert(sharedIdentity.observedAt === T1 && targetOnlyIdentity.observedAt === T2, '7. FLAGSHIP — observedAt is plainly visible as the field distinguishing O1 from O3');
        assert(sharedIdentity.candidateMatchesPlan === targetOnlyIdentity.candidateMatchesPlan, '8. FLAGSHIP — O1 and O3 agree on candidateMatchesPlan, isolating observedAt as the one differing field');

        // Both differing records are still each individually a complete,
        // named-field identity — never collapsed toward O1 or toward each
        // other.
        assert(serialize(sourceOnlyIdentity) !== serialize(sharedIdentity), '9. FLAGSHIP — the source-only identity object is not byte-identical to the shared identity object');
        assert(serialize(targetOnlyIdentity) !== serialize(sharedIdentity), '10. FLAGSHIP — the target-only identity object is not byte-identical to the shared identity object');
    }
    console.log('✓ Section A: FLAGSHIP — three observations differing by exactly one field each make that one field plainly visible through named identity fields, while 0.8.189\'s own distinct-record determination is preserved unchanged');

    // ---------------------------------------------------------------
    // Section B — a decision record's identity is exactly its own four
    // named fields.
    // ---------------------------------------------------------------
    {
        const C1 = candidateOf('C1');
        const D1 = decisionOf(C1, 'OBSERVE', '2026-08-30T00:00:00.000Z');
        const sourceExport = exportOf([entryOf(C1, detailOf([D1], [], []), detailOf([], [], []))], ALL_FILTER, 'PEER_PRESENT');
        const targetExport = exportOf([entryOf(C1, detailOf([], [], []), detailOf([], [], []))], ALL_FILTER, 'PEER_PRESENT');
        const { identity } = recordIdentityFor(sourceExport, targetExport);

        assert(identity.decisionEvidence.sourceOnly.length === 1, '11. sanity — D1 lands as source-only decision evidence');
        const decisionIdentity = identity.decisionEvidence.sourceOnly[0];
        assert(Object.keys(decisionIdentity).sort().join(',') === 'candidate,decided,decidedAt,decision', '12. a decision identity object carries exactly candidate/decided/decidedAt/decision — nothing more, nothing less');
        assert(decisionIdentity.decided === true, '13. decided is forwarded unchanged');
        assert(decisionIdentity.candidate === D1.candidate, '14. candidate is forwarded by reference, unchanged');
        assert(decisionIdentity.decision === 'OBSERVE', '15. decision is forwarded unchanged');
        assert(decisionIdentity.decidedAt === '2026-08-30T00:00:00.000Z', '16. decidedAt is forwarded unchanged');
    }
    console.log('✓ Section B: a decision record\'s identity is exactly its own four named fields — decided/candidate/decision/decidedAt — read directly off the record, nothing added or dropped');

    // ---------------------------------------------------------------
    // Section C — an observation record's identity is exactly its own
    // seven named fields; `decision` stays the full embedded record.
    // ---------------------------------------------------------------
    {
        const C1 = candidateOf('C1');
        const D1 = decisionOf(C1, 'DEFER', '2026-08-30T00:00:00.000Z');
        const plan1 = planIdentityOf('FP7');
        const O1 = observationOf(C1, D1, plan1, false, 'NONE', false, '2026-08-31T00:00:00.000Z');
        const sourceExport = exportOf([entryOf(C1, detailOf([], [], []), detailOf([O1], [], []))], ALL_FILTER, 'PEER_PRESENT');
        const targetExport = exportOf([entryOf(C1, detailOf([], [], []), detailOf([], [], []))], ALL_FILTER, 'PEER_PRESENT');
        const { identity } = recordIdentityFor(sourceExport, targetExport);

        assert(identity.observationEvidence.sourceOnly.length === 1, '17. sanity — O1 lands as source-only observation evidence');
        const observationIdentity = identity.observationEvidence.sourceOnly[0];
        assert(
            Object.keys(observationIdentity).sort().join(',') === 'candidate,candidateMatchesPlan,candidatePresent,candidateType,decision,observedAt,planIdentity',
            '18. an observation identity object carries exactly candidate/decision/planIdentity/candidatePresent/candidateType/candidateMatchesPlan/observedAt — nothing more, nothing less'
        );
        assert(observationIdentity.candidate === C1, '19. candidate is forwarded by reference, unchanged');
        assert(observationIdentity.decision === D1, '20. decision is the full embedded decision record by reference, never flattened to a disposition string');
        assert(observationIdentity.decision.decision === 'DEFER' && observationIdentity.decision.decidedAt === '2026-08-30T00:00:00.000Z', '21. the embedded decision record\'s own decidedAt/decision fields remain reachable exactly where 0.8.162 already put them');
        assert(observationIdentity.planIdentity === plan1, '22. planIdentity is forwarded by reference, unchanged');
        assert(observationIdentity.candidatePresent === false && observationIdentity.candidateType === 'NONE' && observationIdentity.candidateMatchesPlan === false, '23. candidatePresent/candidateType/candidateMatchesPlan are forwarded as facts, unchanged');
        assert(observationIdentity.observedAt === '2026-08-31T00:00:00.000Z', '24. observedAt is forwarded unchanged');
    }
    console.log('✓ Section C: an observation record\'s identity is exactly its own seven named fields, with `decision` forwarded as the full embedded decision record');

    // ---------------------------------------------------------------
    // Section D — no candidate-presence section; evidence stays flat.
    // ---------------------------------------------------------------
    {
        assert(!('candidates' in flagshipIdentity), '25. this file\'s own result carries no `candidates` section — a caller wanting candidate presence already has 0.8.193\'s own `candidates` section');
        assert(Object.keys(flagshipIdentity).sort().join(',') === 'decisionEvidence,observationEvidence', '26. this file\'s own result carries exactly decisionEvidence/observationEvidence, nothing else');
        assert(!('byCandidate' in flagshipIdentity.decisionEvidence) && !('byCandidate' in flagshipIdentity.observationEvidence), '27. no per-candidate grouping key is introduced on either section');
    }
    console.log('✓ Section D: no candidate-presence section on this file\'s own result; decisionEvidence/observationEvidence stay flat, cross-candidate arrays');

    // ---------------------------------------------------------------
    // Section E — order preserved, position for position.
    // ---------------------------------------------------------------
    {
        const observedAts = flagshipDetail.observationEvidence.shared.map((r) => r.observedAt)
            .concat(flagshipDetail.observationEvidence.sourceOnly.map((r) => r.observedAt))
            .concat(flagshipDetail.observationEvidence.targetOnly.map((r) => r.observedAt));
        const identityObservedAts = flagshipIdentity.observationEvidence.shared.map((r) => r.observedAt)
            .concat(flagshipIdentity.observationEvidence.sourceOnly.map((r) => r.observedAt))
            .concat(flagshipIdentity.observationEvidence.targetOnly.map((r) => r.observedAt));
        assert(serialize(observedAts) === serialize(identityObservedAts), '28. every identity array holds one identity object per input record, in the exact same position and order 0.8.193 itself already established');
    }
    console.log('✓ Section E: identity arrays match 0.8.193\'s own arrays position for position — no reordering, no dropped or added entries');

    // ---------------------------------------------------------------
    // Section F — malformed/absent input degrades, never throws.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-a-detail', 42, {}, { decisionEvidence: 'nope' }, { observationEvidence: { shared: 'nope' } }]) {
            const identity = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity(malformed);
            assert(Array.isArray(identity.decisionEvidence.shared) && identity.decisionEvidence.shared.length === 0, `29. malformed input (${serialize(malformed)}) degrades decisionEvidence.shared to an empty array`);
            assert(Array.isArray(identity.observationEvidence.sourceOnly) && identity.observationEvidence.sourceOnly.length === 0, `30. malformed input (${serialize(malformed)}) degrades observationEvidence.sourceOnly to an empty array`);
            assert(Array.isArray(identity.observationEvidence.targetOnly) && identity.observationEvidence.targetOnly.length === 0, `31. malformed input (${serialize(malformed)}) degrades observationEvidence.targetOnly to an empty array`);
        }

        // A malformed record within an otherwise genuine array degrades in
        // place — every input position still has exactly one output
        // position, with `undefined` fields rather than a thrown error or a
        // dropped entry.
        const detailWithMalformedRecords = Object.freeze({
            decisionEvidence: Object.freeze({ shared: Object.freeze([null, 'not-a-record', 42]), sourceOnly: Object.freeze([]), targetOnly: Object.freeze([]) }),
            observationEvidence: Object.freeze({ shared: Object.freeze([]), sourceOnly: Object.freeze([undefined]), targetOnly: Object.freeze([]) })
        });
        const identity = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity(detailWithMalformedRecords);
        assert(identity.decisionEvidence.shared.length === 3, '32. a malformed record does not get dropped — the output array still has one entry per input position');
        for (const entry of identity.decisionEvidence.shared) {
            assert(entry.decided === undefined && entry.candidate === undefined && entry.decision === undefined && entry.decidedAt === undefined, '33. a malformed decision record degrades to an identity object whose fields are all undefined, never throws');
        }
        assert(identity.observationEvidence.sourceOnly.length === 1, '34. a malformed observation record does not get dropped');
        const malformedObservationIdentity = identity.observationEvidence.sourceOnly[0];
        assert(Object.values(malformedObservationIdentity).every((value) => value === undefined), '35. a malformed observation record degrades to an identity object whose fields are all undefined, never throws');
    }
    console.log('✓ Section F: malformed or absent detail input degrades every section to an empty, valid projection; a malformed individual record degrades in place rather than being dropped or throwing');

    // ---------------------------------------------------------------
    // Section G — determinism, no mutation, frozen output.
    // ---------------------------------------------------------------
    {
        const before = serialize(flagshipDetail);
        const first = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity(flagshipDetail);
        const second = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity(flagshipDetail);
        assert(serialize(first) === serialize(second), '36. calling describeXxx() twice with a byte-identical detail returns a byte-identical result');
        assert(serialize(flagshipDetail) === before, '37. describeXxx() never mutates the supplied detail');

        assert(Object.isFrozen(first), '38. the result is frozen');
        assert(Object.isFrozen(first.decisionEvidence) && Object.isFrozen(first.observationEvidence), '39. each section is frozen');
        assert(Object.isFrozen(first.decisionEvidence.shared) && Object.isFrozen(first.observationEvidence.shared), '40. each section\'s arrays are frozen');
        assert(first.observationEvidence.shared.length > 0 && Object.isFrozen(first.observationEvidence.shared[0]), '41. each individual identity object is frozen');
    }
    console.log('✓ Section G: describeXxx() is deterministic, never mutates the supplied detail, and returns frozen output throughout');

    // ---------------------------------------------------------------
    // Section H — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentityView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const codeOnlyLower = codeOnly.toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 0, '42. this file imports nothing — a pure, duck-typed transform of whatever shape it is handed');
        assert(!/function reconstruct/.test(codeOnly), '43. this file declares no reconstructXxx() of its own — there is no comparison, no export pair, and no archive pair to reconstruct from');
        assert(!codeOnly.includes('JSON.stringify'), '44. this file never calls JSON.stringify() — 0.8.189\'s own comparison is never duplicated here');

        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'preferred', 'status', 'confidence', '.sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'reject(', 'merge', 'delete', 'dedup', 'trust', 'reputation', 'needs attention', 'upload', 'download', 'transmit', 'fetch(', 'signature', 'new date(', 'date.now', 'synchroniz', 'similarity', 'diff('];
        for (const term of forbiddenInCode) {
            assert(!codeOnlyLower.includes(term), `45. this file's own code never carries "${term}"`);
        }
    }
    console.log('✓ Section H: imports nothing, declares no reconstructXxx() of its own, never calls JSON.stringify(), and carries no ranking/judgment/synchronization/comparison vocabulary');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentityView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentityView.test.js FAILED:', error);
    process.exitCode = 1;
});
