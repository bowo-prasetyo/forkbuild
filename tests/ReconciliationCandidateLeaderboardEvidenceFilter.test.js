import {
    ReconciliationCandidateLeaderboardEvidenceKind,
    ReconciliationCandidateLeaderboardReplicaRelation,
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js';

// 0.8.184 — Reconciliation Candidate Evidence Filter Projection.
//
// Section A: malformed/absent `page` degrades to an empty result, never
//            throws.
// Section B: `filter` absent/malformed, or explicitly `{ evidenceKind:
//            'ALL', replicaRelation: 'ALL' }` — every genuine row survives,
//            unchanged, in the original order, as the SAME object
//            references (never copies).
// Section C: FLAGSHIP — the milestone's own regression: SOURCE_ONLY /
//            TARGET_ONLY / SHARED / ALL over four candidates, zero-count
//            rows included.
// Section D: two-dimensional queries — `evidenceKind` narrows which
//            evidence dimension a relation is read from ("Observation +
//            Target-only", "Decision + Source-only", "Shared" reading
//            either dimension).
// Section E: unrecognized/malformed evidenceKind/replicaRelation values
//            degrade to ALL rather than throwing or silently matching
//            nothing.
// Section F: surviving rows are reference-identical to their originals —
//            filtering never manufactures or modifies evidence counts;
//            `page` itself is never mutated.
// Section G: rows keep `page.rows`' own relative order — no reordering.
// Section H: vocabulary/import boundary — zero imports, no ranking
//            vocabulary, the enums carry exactly their documented values.
// Section I: the view's own wiring — filteredPage is computed via 0.8.184's
//            own describeXxx(), driven by two dropdowns, and handed to the
//            table as its own `page` prop instead of the raw, unfiltered
//            page — without touching any existing reconstructXxx() call.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function evidence(sharedCount, sourceOnlyCount, targetOnlyCount) {
    return Object.freeze({ sharedCount, sourceOnlyCount, targetOnlyCount });
}

function row(candidateId, decisionEvidence, observationEvidence) {
    return Object.freeze({
        candidate: Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId: candidateId }),
        decisionEvidence,
        observationEvidence
    });
}

function pageOf(rows) {
    return Object.freeze({ isEmpty: rows.length === 0, rowCount: rows.length, rows: Object.freeze(rows) });
}

function candidateIds(result) {
    return result.rows.map((r) => r.candidate.claimId);
}

// The milestone's own flagship scenario, verbatim:
//   C1: source-only observation = 1
//   C2: target-only observation = 1
//   C3: shared observation = 1
//   C4: no asymmetric evidence (a shared DECISION only, so C4 still shows
//       up under SHARED without carrying any source-only/target-only
//       evidence of its own)
function buildFlagshipPage() {
    const c1 = row('C1', evidence(0, 0, 0), evidence(0, 1, 0));
    const c2 = row('C2', evidence(0, 0, 0), evidence(0, 0, 1));
    const c3 = row('C3', evidence(0, 0, 0), evidence(1, 0, 0));
    const c4 = row('C4', evidence(1, 0, 0), evidence(0, 0, 0));
    return pageOf([c1, c2, c3, c4]);
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — malformed/absent page.
    // ---------------------------------------------------------------
    {
        for (const malformed of [null, undefined, 'not-an-object', 42, {}, { rows: 'not-an-array' }, { rows: null }]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(malformed, 'ALL');
            assert(result.isEmpty === true, `1. malformed page (${serialize(malformed)}) reports isEmpty true`);
            assert(result.rowCount === 0, `2. malformed page (${serialize(malformed)}) reports rowCount 0`);
            assert(Array.isArray(result.rows) && result.rows.length === 0, `3. malformed page (${serialize(malformed)}) reports an empty rows array`);
            assert(Object.isFrozen(result) && Object.isFrozen(result.rows), `4. malformed page (${serialize(malformed)}) still returns a frozen, valid result`);
        }
        assert(describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter().isEmpty === true, '5. calling with no arguments defaults to an empty result, never throws');

        const genuinePage = buildFlagshipPage();
        const malformedEntryPage = pageOf([genuinePage.rows[0], null, 'not-a-row', { candidate: {} }, genuinePage.rows[1]]);
        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(malformedEntryPage, 'ALL');
        assert(result.rowCount === 2, '6. malformed row entries are silently excluded, genuine ones survive');
        assert(serialize(candidateIds(result)) === serialize(['C1', 'C2']), '7. surviving rows keep their original relative order');
    }
    console.log('✓ Section A: malformed/absent page (and malformed row entries within an otherwise genuine page) degrade to a valid, filtered result rather than throwing');

    // ---------------------------------------------------------------
    // Section B — no filtering: ALL/ALL is the identity projection.
    // ---------------------------------------------------------------
    {
        const page = buildFlagshipPage();

        const noFilter = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, undefined);
        assert(noFilter.rowCount === 4, '8. no filter argument at all keeps every genuine row');
        assert(serialize(candidateIds(noFilter)) === serialize(['C1', 'C2', 'C3', 'C4']), '9. no filter argument preserves original order');

        const explicitAll = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, { evidenceKind: 'ALL', replicaRelation: 'ALL' });
        assert(serialize(candidateIds(explicitAll)) === serialize(candidateIds(noFilter)), '10. explicit ALL/ALL matches the no-filter default exactly');

        const bareAllString = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, 'ALL');
        assert(serialize(candidateIds(bareAllString)) === serialize(candidateIds(noFilter)), '11. the bare string "ALL" matches the no-filter default exactly');
    }
    console.log('✓ Section B: an absent, malformed, or explicit ALL/ALL filter is the identity projection over every genuine row');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP, exactly as the milestone's own request states
    // it.
    // ---------------------------------------------------------------
    {
        const page = buildFlagshipPage();

        const sourceOnly = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, ReconciliationCandidateLeaderboardReplicaRelation.SOURCE_ONLY);
        assert(serialize(candidateIds(sourceOnly)) === serialize(['C1']), '12. FLAGSHIP — SOURCE_ONLY selects exactly C1');

        const targetOnly = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, ReconciliationCandidateLeaderboardReplicaRelation.TARGET_ONLY);
        assert(serialize(candidateIds(targetOnly)) === serialize(['C2']), '13. FLAGSHIP — TARGET_ONLY selects exactly C2');

        const shared = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, ReconciliationCandidateLeaderboardReplicaRelation.SHARED);
        assert(serialize(candidateIds(shared)) === serialize(['C3', 'C4']), '14. FLAGSHIP — SHARED selects exactly C3 and C4 (one via observation evidence, one via decision evidence)');

        const all = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, ReconciliationCandidateLeaderboardReplicaRelation.ALL);
        assert(serialize(candidateIds(all)) === serialize(['C1', 'C2', 'C3', 'C4']), '15. FLAGSHIP — ALL selects every candidate');
    }
    console.log('✓ Section C: FLAGSHIP — SOURCE_ONLY / TARGET_ONLY / SHARED / ALL match the milestone\'s own regression exactly, including the zero-asymmetric-evidence row');

    // ---------------------------------------------------------------
    // Section D — two-dimensional queries (evidenceKind + replicaRelation).
    // ---------------------------------------------------------------
    {
        // The milestone's own worked example:
        //   C1  Decisions:   Shared 1 / Source-only 1 / Target-only 0
        //       Observations Shared 1 / Source-only 0 / Target-only 2
        //   C2  Decisions:   Shared 2 / Source-only 0 / Target-only 0
        //       Observations Shared 0 / Source-only 1 / Target-only 0
        const c1 = row('C1', evidence(1, 1, 0), evidence(1, 0, 2));
        const c2 = row('C2', evidence(2, 0, 0), evidence(0, 1, 0));
        const page = pageOf([c1, c2]);

        const observationTargetOnly = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, {
            evidenceKind: ReconciliationCandidateLeaderboardEvidenceKind.OBSERVATIONS,
            replicaRelation: ReconciliationCandidateLeaderboardReplicaRelation.TARGET_ONLY
        });
        assert(serialize(candidateIds(observationTargetOnly)) === serialize(['C1']), '16. Observation + Target-only selects only C1');

        const decisionSourceOnly = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, {
            evidenceKind: ReconciliationCandidateLeaderboardEvidenceKind.DECISIONS,
            replicaRelation: ReconciliationCandidateLeaderboardReplicaRelation.SOURCE_ONLY
        });
        assert(serialize(candidateIds(decisionSourceOnly)) === serialize(['C1']), '17. Decision + Source-only selects C1 again');

        const anyShared = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, ReconciliationCandidateLeaderboardReplicaRelation.SHARED);
        assert(serialize(candidateIds(anyShared)) === serialize(['C1', 'C2']), '18. Shared (default evidenceKind ALL) selects both C1 and C2 because each carries shared evidence somewhere');

        const decisionTargetOnly = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, {
            evidenceKind: ReconciliationCandidateLeaderboardEvidenceKind.DECISIONS,
            replicaRelation: ReconciliationCandidateLeaderboardReplicaRelation.TARGET_ONLY
        });
        assert(decisionTargetOnly.rowCount === 0, '19. Decision + Target-only selects nobody — neither candidate has a target-only DECISION, even though C1 has target-only observations');
    }
    console.log('✓ Section D: evidenceKind narrows the dimension a relation is read from, exactly as the milestone\'s own worked example describes');

    // ---------------------------------------------------------------
    // Section E — unrecognized/malformed dimension values degrade to ALL.
    // ---------------------------------------------------------------
    {
        const page = buildFlagshipPage();
        const baseline = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, undefined);

        for (const malformedFilter of ['not-a-relation', 42, { evidenceKind: 'bogus', replicaRelation: 'bogus' }, { evidenceKind: 'DECISIONS' }, { replicaRelation: 'not-real' }]) {
            const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, malformedFilter);
            assert(serialize(candidateIds(result)) === serialize(candidateIds(baseline)), `20. unrecognized filter (${serialize(malformedFilter)}) degrades to ALL/ALL rather than throwing or matching nothing`);
        }
    }
    console.log('✓ Section E: unrecognized evidenceKind/replicaRelation values degrade to ALL — never a throw, never a silent empty result');

    // ---------------------------------------------------------------
    // Section F — reference identity, no manufactured/modified counts, no
    // mutation of `page`.
    // ---------------------------------------------------------------
    {
        const page = buildFlagshipPage();
        const before = serialize(page);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, ReconciliationCandidateLeaderboardReplicaRelation.SHARED);

        assert(serialize(page) === before, '21. the supplied page is never mutated');
        assert(result.rows[0] === page.rows[2], '22. a surviving row is the ORIGINAL row object, referenced rather than copied (C3)');
        assert(result.rows[1] === page.rows[3], '23. a surviving row is the ORIGINAL row object, referenced rather than copied (C4)');
        assert(result.rows[0].decisionEvidence === page.rows[2].decisionEvidence, '24. a surviving row\'s own evidence objects are the ORIGINAL objects too');
        assert(Object.isFrozen(result), '25. the result is frozen');
        assert(Object.isFrozen(result.rows), '26. the rows array is frozen');

        const again = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, ReconciliationCandidateLeaderboardReplicaRelation.SHARED);
        assert(serialize(again) === serialize(result), '27. calling describeXxx() twice with byte-identical arguments returns a byte-identical result');
    }
    console.log('✓ Section F: filtering never manufactures or modifies evidence counts — surviving rows are reference-identical to their originals, `page` itself is never mutated, and computation is deterministic');

    // ---------------------------------------------------------------
    // Section G — no reordering.
    // ---------------------------------------------------------------
    {
        const c1 = row('C1', evidence(0, 1, 0), evidence(0, 0, 0));
        const c2 = row('C2', evidence(0, 1, 0), evidence(0, 0, 0));
        const c3 = row('C3', evidence(0, 0, 0), evidence(0, 0, 0));
        const c4 = row('C4', evidence(0, 1, 0), evidence(0, 0, 0));
        const page = pageOf([c1, c2, c3, c4]);

        const result = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, ReconciliationCandidateLeaderboardReplicaRelation.SOURCE_ONLY);
        assert(serialize(candidateIds(result)) === serialize(['C1', 'C2', 'C4']), '28. surviving rows keep page.rows\' own relative order — never reordered by a candidate\'s own evidence');
    }
    console.log('✓ Section G: rows are a subsequence of page.rows, in page.rows\' own relative order — filtering never reorders');

    // ---------------------------------------------------------------
    // Section H — vocabulary/import boundary.
    // ---------------------------------------------------------------
    {
        assert(serialize(ReconciliationCandidateLeaderboardEvidenceKind) === serialize({ ALL: 'ALL', DECISIONS: 'DECISIONS', OBSERVATIONS: 'OBSERVATIONS' }), '29. ReconciliationCandidateLeaderboardEvidenceKind carries exactly its documented three values');
        assert(serialize(ReconciliationCandidateLeaderboardReplicaRelation) === serialize({ ALL: 'ALL', SHARED: 'SHARED', SOURCE_ONLY: 'SOURCE_ONLY', TARGET_ONLY: 'TARGET_ONLY' }), '30. ReconciliationCandidateLeaderboardReplicaRelation carries exactly its documented four values');
        assert(Object.isFrozen(ReconciliationCandidateLeaderboardEvidenceKind) && Object.isFrozen(ReconciliationCandidateLeaderboardReplicaRelation), '31. both enums are frozen');

        const moduleSource = await (await import('node:fs/promises')).readFile(new URL('../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js', import.meta.url), 'utf8');
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n').toLowerCase();

        const importLines = moduleSource.split('\n').filter((line) => line.trim().startsWith('import '));
        assert(importLines.length === 0, '32. this file imports nothing');

        const forbiddenInCode = ['score', 'rank', 'winner', 'correct', 'incorrect', 'preferred', 'status', 'confidence', 'sort(', 'inconsistent', 'superseded', 'authoritative', 'resolved', 'conflicting', 'repair', 'replace', 'reject', 'merge', 'delete', 'apply', 'execute', 'trust', 'reputation', 'needs attention'];
        for (const term of forbiddenInCode) {
            assert(!codeOnly.includes(term), `33. this file's own code never carries "${term}"`);
        }
    }
    console.log('✓ Section H: this file imports nothing, its own code carries no ranking/judgment vocabulary, and both enums carry exactly their documented, frozen values');

    // ---------------------------------------------------------------
    // Section I — the view's own wiring.
    // ---------------------------------------------------------------
    {
        const moduleSource = await (await import('node:fs/promises')).readFile(
            new URL('../ui/views/ReconciliationCandidateLeaderboardView.js', import.meta.url), 'utf8'
        );
        const codeOnly = moduleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        assert(codeOnly.includes("from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js'"), '34. the view imports 0.8.184\'s own evidence-filter module');
        assert((codeOnly.match(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter\(/g) || []).length === 1,
            '35. the view calls 0.8.184\'s own describeXxx() exactly once');
        assert(/filteredPage\s*=\s*computed/.test(codeOnly), '36. filteredPage is its own reactive computed value');

        assert(moduleSource.includes('v-model="evidenceKindFilter"'), '37. the template binds an Evidence type control to evidenceKindFilter');
        assert(moduleSource.includes('v-model="replicaRelationFilter"'), '38. the template binds a Replica relation control to replicaRelationFilter');
        assert(moduleSource.includes(':page="filteredPage"'), '39. the table receives filteredPage as its own page prop, never the raw, unfiltered page');
        assert(!moduleSource.includes(':page="page"'), '40. the table is never handed the raw, unfiltered page directly');

        // No existing evidence computation changed — page/evidenceDetail are
        // still each computed by exactly one reconstructXxx() call of their
        // own; filtering never mutates page in place.
        assert((codeOnly.match(/reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage\(/g) || []).length === 1,
            '41. the view still calls 0.8.179\'s own reconstructXxx() exactly once');
        assert((codeOnly.match(/reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail\(/g) || []).length === 1,
            '42. the view still calls 0.8.182\'s own reconstructXxx() exactly once');
        assert(!/page\.value\s*=/.test(codeOnly), '43. page itself is never reassigned by filtering — filteredPage is a separate, derived computed value');
    }
    console.log('✓ Section I: the view computes filteredPage via 0.8.184\'s own describeXxx(), driven by two new dropdowns, and hands filteredPage (never the raw page) to the table — without touching any existing reconstructXxx() call or mutating page itself');

    console.log('\nAll ReconciliationCandidateLeaderboardEvidenceFilter tests passed.');
}

run().catch((error) => {
    console.error('ReconciliationCandidateLeaderboardEvidenceFilter.test.js FAILED:', error);
    process.exitCode = 1;
});
