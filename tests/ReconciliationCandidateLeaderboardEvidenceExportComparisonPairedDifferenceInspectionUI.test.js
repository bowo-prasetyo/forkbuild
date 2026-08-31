import default_ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector, {
    pairDifferenceKey
} from '../ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector.js';

// 0.8.202 — Paired Record Difference Inspection UI.
//
// 0.8.201 already rendered every explicit pair's own difference summary
// inline, unconditionally, underneath the pairing controls. This milestone
// extends that SAME component — no new application-layer file, per the
// stakeholder note that motivated it — so each pair's own summary now
// carries a 1-based "Decision Pair N"/"Observation Pair N" label and an
// "Inspect differences" toggle over that one pair's own source/target
// labels and differing-field list, exactly the expand/collapse discipline
// `ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js`
// already holds for "Inspect records"/"Inspect identity."
//
// Section A: Rendering — the template names both dimensions' pair labels,
//            an "Inspect differences"/"Hide differences" toggle per pair,
//            and a zero-difference pair's own "No differences" summary and
//            "Identical on every named field" detail line, never omitted.
// Section B: Positional correspondence — pairDifferenceKey()/
//            decisionPairs[i]/decisionDifferences[i] all correlate by
//            shared array index alone, proven with deliberately duplicate
//            records and deliberately identical difference summaries.
// Section C: Interaction — togglePairDifference()/isPairDifferenceExpanded()
//            open/close exactly the named pair's own panel, independently
//            of every other pair; removing a pair (simulated the same way
//            the parent view actually does it — filtering both
//            `explicitPairs` and, via a fresh `pairedView`, the difference
//            arrays together) never leaves a later pair's own difference
//            attached to an earlier pair's own position.
// Section D: Architectural boundaries — the component's own source still
//            imports nothing, still calls none of 0.8.198's/0.8.197's/
//            0.8.199's/0.8.200's own describeXxx() functions, and still
//            carries no sorting/ranking/verdict vocabulary, even after the
//            0.8.202 extension.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function candidateOf(claimId) {
    return Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId });
}

function decisionRecord(claimId, decision, seconds) {
    return Object.freeze({
        decided: true,
        candidate: candidateOf(claimId),
        decision,
        decidedAt: `2026-08-31T00:00:${String(seconds).padStart(2, '0')}.000Z`
    });
}

function observationRecord(claimId, seconds) {
    const candidate = candidateOf(claimId);
    return Object.freeze({
        candidate,
        decision: decisionRecord(claimId, 'OBSERVE', seconds),
        planIdentity: Object.freeze({ algorithm: 'SHA-256', planFingerprint: 'b'.repeat(60) + String(seconds).padStart(4, '0'), candidateCount: 1 }),
        candidatePresent: true,
        candidateType: candidate.type,
        candidateMatchesPlan: true,
        observedAt: `2026-08-31T01:00:${String(seconds).padStart(2, '0')}.000Z`
    });
}

const selector = default_ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector;

// Builds a test `ctx` the same way the sibling 0.8.201 test does — props
// merged with overrides, plus `expandedPairDifferences` defaulted to a
// fresh object exactly as the component's own data() would supply, so
// togglePairDifference()/isPairDifferenceExpanded() behave identically to
// how they would inside a real mounted component.
function ctxOf(overrides = {}) {
    const ctx = {
        detail: null,
        explicitPairs: null,
        pairedView: null,
        expandedPairDifferences: {},
        ...overrides
    };
    ctx.decisionPairs = selector.computed.decisionPairs.call(ctx);
    ctx.observationPairs = selector.computed.observationPairs.call(ctx);
    ctx.decisionDifferences = selector.computed.decisionDifferences.call(ctx);
    ctx.observationDifferences = selector.computed.observationDifferences.call(ctx);
    return ctx;
}

async function main() {
    // ---------------------------------------------------------------
    // Section A — Rendering.
    // ---------------------------------------------------------------
    const template = selector.template;
    assert(template.includes('Decision Pair {{ index + 1 }}'), '1. FLAGSHIP — the template labels each decision pair with a 1-based "Decision Pair N" heading');
    assert(template.includes('Observation Pair {{ index + 1 }}'), '2. FLAGSHIP — the template labels each observation pair with a 1-based "Observation Pair N" heading, independently of decision pairs');
    assert((template.match(/Inspect differences/g) || []).length === 2, '3. the template exposes exactly two "Inspect differences" toggle templates — one per dimension\'s own v-for row');
    assert((template.match(/Hide differences/g) || []).length === 2, '4. the template exposes exactly two "Hide differences" collapse labels — one per dimension\'s own v-for row');
    assert(template.includes("'No differences'"), '5. a zero-difference pair\'s own summary reads "No differences" rather than being omitted');
    assert(template.includes('Identical on every named field'), '6. a zero-difference pair\'s own expanded detail reads "Identical on every named field" rather than an empty panel');
    assert(template.includes('v-for="field in summary.differingFields"'), '7. an expanded pair\'s own differing-field list iterates summary.differingFields directly, one <li> per field name');
    assert(template.includes("decisionRecordLabel(decisionPairs[index] && decisionPairs[index].source)"), '8. an expanded decision pair\'s own Source line reads decisionPairs[index] at the SAME index as the difference being shown');
    assert(template.includes("decisionRecordLabel(decisionPairs[index] && decisionPairs[index].target)"), '9. an expanded decision pair\'s own Target line reads decisionPairs[index] at the SAME index as the difference being shown');
    assert(template.includes("observationRecordLabel(observationPairs[index] && observationPairs[index].source)"), '10. an expanded observation pair\'s own Source line reads observationPairs[index] at the SAME index as the difference being shown');
    console.log('✓ Section A: Rendering — both dimensions get their own 1-based pair labels, an Inspect/Hide differences toggle, and a zero-difference pair is shown rather than hidden');

    // ---------------------------------------------------------------
    // Section B — Positional correspondence, with deliberately duplicate
    //             records and deliberately identical difference summaries.
    // ---------------------------------------------------------------
    {
        // P1 and P3 are literally the same record pair; P2 differs. D1 and
        // D3 are also byte-identical difference summaries, on purpose — the
        // milestone's own regression concern is that a UI relying on
        // record identity or on comparing summaries to each other could
        // conflate them. This component correlates strictly by array
        // index, never by either.
        const shared = decisionRecord('dup-1', 'CONFIRMED', 1);
        const other = decisionRecord('dup-2', 'REJECTED', 2);
        const explicitPairs = {
            decisionPairs: [
                { source: shared, target: shared },   // P1
                { source: shared, target: other },    // P2
                { source: shared, target: shared }    // P3 — identical to P1
            ],
            observationPairs: []
        };
        const pairedView = {
            isEmpty: false,
            decisionDifferences: [
                { differenceCount: 0, differingFields: [] },                 // D1 — matches P1
                { differenceCount: 1, differingFields: ['decision'] },       // D2 — matches P2
                { differenceCount: 0, differingFields: [] }                  // D3 — byte-identical to D1, matches P3
            ],
            observationDifferences: []
        };
        const ctx = ctxOf({ explicitPairs, pairedView });

        assert(ctx.decisionPairs.length === 3 && ctx.decisionDifferences.length === 3, '11. FLAGSHIP — all three pairs and all three difference summaries survive, in the original order, despite P1/P3 being duplicate pairs and D1/D3 being duplicate summaries');
        assert(ctx.decisionPairs[0] === explicitPairs.decisionPairs[0] && ctx.decisionPairs[2] === explicitPairs.decisionPairs[2], '12. FLAGSHIP — decisionPairs[0] and decisionPairs[2] are two DISTINCT pair entries, even though they describe the identical source/target records');
        assert(ctx.decisionDifferences[1].differenceCount === 1 && ctx.decisionDifferences[1].differingFields[0] === 'decision', '13. FLAGSHIP — decisionDifferences[1] (index 1) is P2\'s own summary — the only non-zero one — never conflated with P1\'s or P3\'s zero-difference summary by proximity');
        assert(ctx.decisionDifferences[0].differenceCount === 0 && ctx.decisionDifferences[2].differenceCount === 0, '14. FLAGSHIP — decisionDifferences[0] and decisionDifferences[2] (P1\'s and P3\'s own positions) both stay zero-difference, independently');

        assert(pairDifferenceKey('decision', 0) === 'decision:0', '15. pairDifferenceKey(\'decision\', 0) builds the exact local key shape the milestone itself names');
        assert(pairDifferenceKey('decision', 2) === 'decision:2', '16. pairDifferenceKey(\'decision\', 2) builds a key distinct from index 0, purely by index, never by record content');
        assert(pairDifferenceKey('decision', 0) !== pairDifferenceKey('decision', 2), '17. P1 and P3 (identical records, identical difference summaries) still receive two DISTINCT inspection keys, one per array position');
    }
    console.log('✓ Section B: Positional correspondence — pairs and their own difference summaries correlate strictly by shared array index, proven with duplicate records and duplicate summaries');

    // ---------------------------------------------------------------
    // Section C — Interaction: expand/collapse, and removal never
    //             misattributes a later pair's own difference to an
    //             earlier position.
    // ---------------------------------------------------------------
    {
        const ctx = ctxOf();
        const key0 = pairDifferenceKey('decision', 0);
        const key1 = pairDifferenceKey('decision', 1);

        assert(selector.methods.isPairDifferenceExpanded.call(ctx, key0) === false, '18. a pair\'s own difference panel starts collapsed');
        selector.methods.togglePairDifference.call(ctx, key0);
        assert(selector.methods.isPairDifferenceExpanded.call(ctx, key0) === true, '19. togglePairDifference() opens the named pair\'s own panel');
        assert(selector.methods.isPairDifferenceExpanded.call(ctx, key1) === false, '20. toggling one pair\'s own panel never opens a different pair\'s own panel');

        selector.methods.togglePairDifference.call(ctx, key1);
        assert(selector.methods.isPairDifferenceExpanded.call(ctx, key0) === true && selector.methods.isPairDifferenceExpanded.call(ctx, key1) === true,
            '21. two different pairs\' own panels can be open at the same time, independently');

        selector.methods.togglePairDifference.call(ctx, key0);
        assert(selector.methods.isPairDifferenceExpanded.call(ctx, key0) === false && selector.methods.isPairDifferenceExpanded.call(ctx, key1) === true,
            '22. collapsing one pair\'s own panel never collapses a different pair\'s own panel');
    }
    {
        // P1, P2, P3 with distinct differences D1, D2, D3. Removing pair
        // index 1 (P2) is simulated exactly the way the parent view's own
        // removeDecisionPair() does it — filtering explicitPairs by index —
        // and the paired chain is recomputed fresh (0.8.198 -> 0.8.197 ->
        // 0.8.199 -> 0.8.200 always run over the CURRENT explicitPairs, so
        // pairedView after a removal is a brand-new result, never a stale
        // one the component itself edits).
        const p1 = decisionRecord('rm-1', 'CONFIRMED', 1);
        const p2 = decisionRecord('rm-2', 'CONFIRMED', 2);
        const p3 = decisionRecord('rm-3', 'CONFIRMED', 3);
        const beforeExplicitPairs = {
            decisionPairs: [
                { source: p1, target: p1 },
                { source: p2, target: p2 },
                { source: p3, target: p3 }
            ],
            observationPairs: []
        };
        const beforePairedView = {
            isEmpty: false,
            decisionDifferences: [
                { differenceCount: 0, differingFields: [] },
                { differenceCount: 1, differingFields: ['decision'] },
                { differenceCount: 2, differingFields: ['decision', 'decidedAt'] }
            ],
            observationDifferences: []
        };
        const before = ctxOf({ explicitPairs: beforeExplicitPairs, pairedView: beforePairedView });
        assert(before.decisionDifferences[2].differenceCount === 2, '23. before removal, position 2 (P3) carries P3\'s own two-field difference');

        // Remove index 1 (P2) — exactly the parent view's own
        // removeDecisionPair(1) filter, applied to explicitPairs; the
        // recomputed pairedView reflects the SAME new pairing, in the SAME
        // new order (P1 then P3), never P2's own stale difference.
        const afterExplicitPairs = {
            decisionPairs: beforeExplicitPairs.decisionPairs.filter((_, index) => index !== 1),
            observationPairs: []
        };
        const afterPairedView = {
            isEmpty: false,
            decisionDifferences: [
                { differenceCount: 0, differingFields: [] },                    // P1's own, unchanged
                { differenceCount: 2, differingFields: ['decision', 'decidedAt'] } // P3's own, now at position 1
            ],
            observationDifferences: []
        };
        const after = ctxOf({ explicitPairs: afterExplicitPairs, pairedView: afterPairedView });

        assert(after.decisionPairs.length === 2, '24. after removing pair index 1, exactly two pairs remain');
        assert(after.decisionPairs[0].source === p1, '25. after removal, position 0 is still P1 — untouched by the removal of a LATER pair');
        assert(after.decisionPairs[1].source === p3, '26. after removal, position 1 is now P3 — shifted down from position 2, never P2\'s own leftover data');
        assert(after.decisionDifferences[1].differenceCount === 2 && after.decisionDifferences[1].differingFields.join(',') === 'decision,decidedAt',
            '27. FLAGSHIP — after removing pair index 1 (P2), the pair now AT position 1 (P3) shows P3\'s own two-field difference, never P2\'s own one-field difference and never P1\'s own zero-difference summary');
        assert(after.decisionDifferences[0].differenceCount === 0, '28. position 0\'s own difference (P1\'s, zero) is unaffected by the removal of a later pair');
    }
    console.log('✓ Section C: Interaction — expand/collapse is independent per pair, and removing a pair never misattributes a later pair\'s own difference to an earlier position');

    // ---------------------------------------------------------------
    // Section D — Architectural boundaries, preserved through the 0.8.202
    //             extension.
    // ---------------------------------------------------------------
    const selectorModuleSource = await (await import('node:fs/promises')).readFile(
        new URL('../ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector.js', import.meta.url), 'utf8'
    );
    const selectorCodeOnly = selectorModuleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    assert(!selectorCodeOnly.includes('import '), '29. the component still imports nothing at all, even after the 0.8.202 extension');
    for (const forbiddenCall of [
        'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs(',
        'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference(',
        'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(',
        'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView('
    ]) {
        assert(!selectorCodeOnly.includes(forbiddenCall), `30. the component still never calls ${forbiddenCall}`);
    }
    {
        const judgmentTerms = ['winner', 'confidence', 'conflict', '.sort(', 'authoritative', 'better', 'worse', 'status', 'verdict', 'rank'];
        for (const term of judgmentTerms) {
            assert(!selectorCodeOnly.toLowerCase().includes(term), `31. the 0.8.202 extension introduces no ranking/judgment/verdict vocabulary ("${term}")`);
        }
    }
    assert(selectorModuleSource.includes('export function pairDifferenceKey('), '32. pairDifferenceKey() is exported, the identical shape identityKey() already holds one file over');
    assert(selector.data().expandedPairDifferences && typeof selector.data().expandedPairDifferences === 'object' && Object.keys(selector.data().expandedPairDifferences).length === 0,
        '33. the component\'s own data() starts with expandedPairDifferences as a fresh, empty object — no pair\'s own panel open by default');
    console.log('✓ Section D: Architectural boundaries — zero imports, no direct calls into the 0.8.198/0.8.197/0.8.199/0.8.200 chain, and no new ranking/judgment vocabulary, preserved through the 0.8.202 extension');

    console.log('\nAll ReconciliationCandidateLeaderboardEvidenceExportComparisonPairedDifferenceInspectionUI tests passed.');
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
