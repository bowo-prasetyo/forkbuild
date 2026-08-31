import { describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement } from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreementView.js';

// 0.8.178 — Reconciliation Candidate Leaderboard Page View.
//
// Section A: malformed/absent readModel — empty page view, never throws
// Section B: a genuine, empty 0.8.177 read model — empty state
// Section C: a single, well-formed row — field fidelity, reference identity
// Section D: FLAGSHIP — the three-candidate scenario from this milestone's
//            own design, displayed exactly as supplied
// Section E: malformed individual rows are dropped, genuine rows survive,
//            in their original relative order
// Section F: row order preserves the input's own order, unchanged
// Section G: no mutation, frozen results, determinism
// Section H: exact field shape — no extra fields, ever
// Section I: vocabulary/import boundary — no ranking vocabulary, imports
//            nothing at all
// Section J: interop — a real 0.8.177 read model flows through unchanged

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

const C1 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-1' });
const C2 = Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: 'Claim-2' });
const C3 = Object.freeze({ type: 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM', snapshotIndex: 3 });

function evidence(sharedCount, sourceOnlyCount, targetOnlyCount) {
    return Object.freeze({ sharedCount, sourceOnlyCount, targetOnlyCount });
}

function readModelRow(candidate, decisionEvidence, observationEvidence) {
    return Object.freeze({ candidate, decisionEvidence, observationEvidence });
}

function rowFor(view, candidate) {
    return view.rows.find((row) => serialize(row.candidate) === serialize(candidate));
}

// The FLAGSHIP scenario, built as a literal read-model-shaped object — this
// milestone's own describeXxx() never cares how a read model was produced,
// so the test does not need to walk decision/observation histories through
// the lower layers to exercise it:
//   C1: Decisions Shared=2 Source=1 Target=0; Observations Shared=1 Source=0 Target=2
//   C2: Decisions Shared=1 Source=0 Target=0; Observations Shared=0 Source=2 Target=0
//   C3: Decisions Shared=0 Source=0 Target=1; Observations Shared=1 Source=0 Target=0
function buildFlagshipReadModel() {
    return Object.freeze({
        candidateCount: 3,
        candidates: Object.freeze([
            readModelRow(C1, evidence(2, 1, 0), evidence(1, 0, 2)),
            readModelRow(C2, evidence(1, 0, 0), evidence(0, 2, 0)),
            readModelRow(C3, evidence(0, 0, 1), evidence(1, 0, 0))
        ])
    });
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — malformed/absent readModel.
    // ---------------------------------------------------------------
    {
        const malformedInputs = [null, undefined, 'not-an-object', 42, {}, { candidates: 'not-an-array' }, { candidates: null }, []];
        for (const malformed of malformedInputs) {
            const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(malformed);
            assert(view.isEmpty === true, `1. malformed input (${serialize(malformed)}) reports isEmpty true`);
            assert(view.rowCount === 0, `2. malformed input (${serialize(malformed)}) reports rowCount 0`);
            assert(Array.isArray(view.rows) && view.rows.length === 0, `3. malformed input (${serialize(malformed)}) reports an empty rows array`);
            assert(Object.isFrozen(view) && Object.isFrozen(view.rows), `4. malformed input (${serialize(malformed)}) still returns a frozen, valid result`);
        }
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView().isEmpty === true, '5. calling with no argument degrades to an empty page view, never throws');
    }
    console.log('✓ Section A: malformed/absent input degrades to a valid, empty page view rather than throwing');

    // ---------------------------------------------------------------
    // Section B — a genuine, empty 0.8.177 read model.
    // ---------------------------------------------------------------
    {
        const emptyReadModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(undefined);
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(emptyReadModel);
        assert(view.isEmpty === true, '6. a genuine empty read model (candidateCount 0) renders the empty state');
        assert(view.rowCount === 0, '7. a genuine empty read model reports rowCount 0');
        assert(view.rows.length === 0, '8. a genuine empty read model reports zero rows');
    }
    console.log('✓ Section B: a genuine, empty 0.8.177 read model renders as the empty page state');

    // ---------------------------------------------------------------
    // Section C — a single, well-formed row: field fidelity.
    // ---------------------------------------------------------------
    {
        const readModel = Object.freeze({
            candidateCount: 1,
            candidates: Object.freeze([readModelRow(C1, evidence(1, 0, 0), evidence(1, 0, 0))])
        });
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(readModel);

        assert(view.isEmpty === false, '9. a non-empty read model reports isEmpty false');
        assert(view.rowCount === 1, '10. exactly one row');
        const [row] = view.rows;
        assert(row.candidate === C1, '11. the row\'s own candidate is the ORIGINAL object, referenced rather than copied');
        assert(row.decisionEvidence.sharedCount === 1 && row.decisionEvidence.sourceOnlyCount === 0 && row.decisionEvidence.targetOnlyCount === 0, '12. decisionEvidence is 0.8.177\'s own counts, unchanged');
        assert(row.observationEvidence.sharedCount === 1 && row.observationEvidence.sourceOnlyCount === 0 && row.observationEvidence.targetOnlyCount === 0, '13. observationEvidence is 0.8.177\'s own counts, unchanged');
    }
    console.log('✓ Section C: a single well-formed row is displayed with exact field fidelity and candidate reference identity');

    // ---------------------------------------------------------------
    // Section D — FLAGSHIP.
    // ---------------------------------------------------------------
    {
        const readModel = buildFlagshipReadModel();
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(readModel);

        assert(view.rowCount === 3, '14. FLAGSHIP — exactly three rows');
        assert(view.isEmpty === false, '15. FLAGSHIP — not the empty state');

        const c1 = rowFor(view, C1);
        assert(c1 !== undefined, '16. FLAGSHIP — C1 appears exactly once');
        assert(c1.decisionEvidence.sharedCount === 2 && c1.decisionEvidence.sourceOnlyCount === 1 && c1.decisionEvidence.targetOnlyCount === 0, '17. FLAGSHIP — C1 decisionEvidence displayed exactly as supplied: Shared=2 Source=1 Target=0');
        assert(c1.observationEvidence.sharedCount === 1 && c1.observationEvidence.sourceOnlyCount === 0 && c1.observationEvidence.targetOnlyCount === 2, '18. FLAGSHIP — C1 observationEvidence displayed exactly as supplied: Shared=1 Source=0 Target=2');

        const c2 = rowFor(view, C2);
        assert(c2 !== undefined, '19. FLAGSHIP — C2 appears exactly once');
        assert(c2.decisionEvidence.sharedCount === 1 && c2.decisionEvidence.sourceOnlyCount === 0 && c2.decisionEvidence.targetOnlyCount === 0, '20. FLAGSHIP — C2 decisionEvidence displayed exactly as supplied: Shared=1 Source=0 Target=0');
        assert(c2.observationEvidence.sharedCount === 0 && c2.observationEvidence.sourceOnlyCount === 2 && c2.observationEvidence.targetOnlyCount === 0, '21. FLAGSHIP — C2 observationEvidence displayed exactly as supplied: Shared=0 Source=2 Target=0');

        const c3 = rowFor(view, C3);
        assert(c3 !== undefined, '22. FLAGSHIP — C3 appears exactly once');
        assert(c3.decisionEvidence.sharedCount === 0 && c3.decisionEvidence.sourceOnlyCount === 0 && c3.decisionEvidence.targetOnlyCount === 1, '23. FLAGSHIP — C3 decisionEvidence displayed exactly as supplied: Shared=0 Source=0 Target=1');
        assert(c3.observationEvidence.sharedCount === 1 && c3.observationEvidence.sourceOnlyCount === 0 && c3.observationEvidence.targetOnlyCount === 0, '24. FLAGSHIP — C3 observationEvidence displayed exactly as supplied: Shared=1 Source=0 Target=0');

        // Row order is C1, C2, C3 — the input's own order — never reordered
        // by evidence weight (C1 carries the most total evidence, C3 the
        // least; a score-driven leaderboard would put C1 first and C3
        // last regardless of input order, but this file never computes
        // that score at all).
        const actualOrder = view.rows.map((row) => serialize(row.candidate));
        const expectedOrder = [serialize(C1), serialize(C2), serialize(C3)];
        assert(serialize(actualOrder) === serialize(expectedOrder), '25. FLAGSHIP — rows stay in C1, C2, C3 order — never reordered by evidence weight');

        const forbidden = ['winner', 'correct', 'incorrect', 'valid', 'stale', 'conflict', 'conflicting', 'resolved', 'rank', 'score', 'confidence', 'status', 'preferred'];
        const allText = serialize(view).toLowerCase();
        for (const term of forbidden) {
            assert(!allText.includes(term), `26. FLAGSHIP — the result never carries judgment/ranking vocabulary ('${term}')`);
        }
    }
    console.log('✓ Section D: FLAGSHIP — the three-candidate scenario is displayed exactly as supplied, in its own order, without being turned into a score');

    // ---------------------------------------------------------------
    // Section E — malformed individual rows are dropped.
    // ---------------------------------------------------------------
    {
        const readModel = Object.freeze({
            candidateCount: 5,
            candidates: Object.freeze([
                readModelRow(C1, evidence(1, 0, 0), evidence(1, 0, 0)),
                null,
                Object.freeze({ candidate: C2 }), // missing decisionEvidence/observationEvidence
                Object.freeze({ decisionEvidence: evidence(1, 0, 0), observationEvidence: evidence(1, 0, 0) }), // missing candidate
                readModelRow(C3, evidence(0, 0, 1), evidence(1, 0, 0))
            ])
        });

        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(readModel);
        assert(view.rowCount === 2, '27. malformed entries are dropped — only the two genuine rows survive');
        const order = view.rows.map((row) => serialize(row.candidate));
        assert(serialize(order) === serialize([serialize(C1), serialize(C3)]), '28. surviving rows (C1, C3) keep their original relative order');
    }
    console.log('✓ Section E: malformed individual rows are silently dropped, never thrown on, and never reorder the survivors');

    // ---------------------------------------------------------------
    // Section E2 — missing/non-finite individual counts default to 0.
    // ---------------------------------------------------------------
    {
        const readModel = Object.freeze({
            candidateCount: 1,
            candidates: Object.freeze([
                readModelRow(C1, Object.freeze({ sharedCount: 'not-a-number' }), Object.freeze({}))
            ])
        });
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(readModel);
        assert(view.rowCount === 1, '29. a row with malformed individual counts is still displayed, never dropped');
        const [row] = view.rows;
        assert(row.decisionEvidence.sharedCount === 0 && row.decisionEvidence.sourceOnlyCount === 0 && row.decisionEvidence.targetOnlyCount === 0, '30. a missing/non-finite count degrades to 0, never NaN or undefined');
        assert(row.observationEvidence.sharedCount === 0 && row.observationEvidence.sourceOnlyCount === 0 && row.observationEvidence.targetOnlyCount === 0, '31. every missing count on an empty observationEvidence object degrades to 0');
    }
    console.log('✓ Section E2: missing or non-finite individual counts degrade to 0 rather than NaN/undefined, without dropping the row');

    // ---------------------------------------------------------------
    // Section F — row order preserves the input's own order.
    // ---------------------------------------------------------------
    {
        const readModel = Object.freeze({
            candidateCount: 3,
            candidates: Object.freeze([
                readModelRow(C3, evidence(0, 0, 1), evidence(1, 0, 0)),
                readModelRow(C1, evidence(2, 1, 0), evidence(1, 0, 2)),
                readModelRow(C2, evidence(1, 0, 0), evidence(0, 2, 0))
            ])
        });
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(readModel);
        const actualOrder = view.rows.map((row) => serialize(row.candidate));
        const expectedOrder = [serialize(C3), serialize(C1), serialize(C2)];
        assert(serialize(actualOrder) === serialize(expectedOrder), '32. row order is the input\'s own order (C3, C1, C2), unchanged — never re-sorted by type, count, or outcome');
    }
    console.log('✓ Section F: row order is the input\'s own order, verbatim, regardless of candidate type or evidence weight');

    // ---------------------------------------------------------------
    // Section G — no mutation, frozen results, determinism.
    // ---------------------------------------------------------------
    {
        const readModel = buildFlagshipReadModel();
        const before = serialize(readModel);

        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(readModel);

        assert(serialize(readModel) === before, '33. the supplied readModel is never mutated');
        assert(Object.isFrozen(view), '34. the result is frozen');
        assert(Object.isFrozen(view.rows), '35. the rows array is frozen');
        assert(Object.isFrozen(view.rows[0]), '36. a row is frozen');
        assert(Object.isFrozen(view.rows[0].decisionEvidence), '37. a row\'s own decisionEvidence is frozen');
        assert(Object.isFrozen(view.rows[0].observationEvidence), '38. a row\'s own observationEvidence is frozen');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(readModel);
        assert(serialize(again) === serialize(view), '39. calling describeXxx() twice with a byte-identical argument returns a byte-identical result');
    }
    console.log('✓ Section G: no mutation of the supplied read model, every returned object/array is frozen, and computation is deterministic');

    // ---------------------------------------------------------------
    // Section H — exact field shape.
    // ---------------------------------------------------------------
    {
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(buildFlagshipReadModel());

        const topKeys = Object.keys(view).sort();
        assert(serialize(topKeys) === serialize(['isEmpty', 'rowCount', 'rows'].sort()), '40. the top level carries exactly isEmpty, rowCount, and rows — no aggregate counts, no ranking fields');

        for (const row of view.rows) {
            const rowKeys = Object.keys(row).sort();
            assert(serialize(rowKeys) === serialize(['candidate', 'decisionEvidence', 'observationEvidence'].sort()), '41. each row carries exactly candidate, decisionEvidence, observationEvidence');

            const decisionKeys = Object.keys(row.decisionEvidence).sort();
            assert(serialize(decisionKeys) === serialize(['sharedCount', 'sourceOnlyCount', 'targetOnlyCount'].sort()), '42. decisionEvidence carries exactly the three documented counts');

            const observationKeys = Object.keys(row.observationEvidence).sort();
            assert(serialize(observationKeys) === serialize(['sharedCount', 'sourceOnlyCount', 'targetOnlyCount'].sort()), '43. observationEvidence carries exactly the three documented counts');
        }
    }
    console.log('✓ Section H: the page view carries exactly the documented, minimal fields — no score, rank, or status field ever appears');

    // ---------------------------------------------------------------
    // Section I — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();
        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'valid', 'preferred', 'status', 'confidence', 'sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'conflict', 'stale', 'repair', 'replace', 'reject', 'merge', 'delete', 'apply', 'execute', 'trust', 'reputation'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `44. this file's own code never carries "${term}"`);
        }

        const importLines = moduleSource.split('\n').filter((line) => line.startsWith('import '));
        assert(importLines.length === 0, '45. this file imports NOTHING — the architectural point of this milestone');
    }
    console.log('✓ Section I: this file\'s own code carries no ranking/judgment vocabulary, and imports nothing at all — no path back into reconciliation logic');

    // ---------------------------------------------------------------
    // Section J — interop: a real 0.8.177 read model flows through
    // unchanged.
    // ---------------------------------------------------------------
    {
        const D1 = Object.freeze({ decided: true, candidate: C1, decision: 'OBSERVE', decidedAt: new Date('2026-08-31T06:00:00Z').toISOString() });
        const evidenceAgreement = describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceAgreement([D1], [D1], [], []);
        const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(evidenceAgreement);
        const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(readModel);

        assert(view.rowCount === readModel.candidateCount, '46. a real 0.8.177 read model\'s rowCount matches its own candidateCount');
        for (const entry of readModel.candidates) {
            const row = rowFor(view, entry.candidate);
            assert(row !== undefined, '47. every real 0.8.177 candidate has a corresponding row');
            assert(row.candidate === entry.candidate, '48. the row\'s own candidate is 0.8.177\'s own object, referenced');
            assert(serialize(row.decisionEvidence) === serialize(entry.decisionEvidence), '49. decisionEvidence matches 0.8.177\'s own row exactly');
            assert(serialize(row.observationEvidence) === serialize(entry.observationEvidence), '50. observationEvidence matches 0.8.177\'s own row exactly');
        }
    }
    console.log('✓ Section J: a real, end-to-end 0.8.177 read model flows through describeXxx() unchanged');

    console.log('\nAll PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView tests passed.');
}

run().catch((error) => {
    console.error('PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView.test.js FAILED:', error);
    process.exitCode = 1;
});
