import default_ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector from '../ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector.js';

// 0.8.201 — Explicit Record-Pair Selection UI.
//
// This milestone adds one new UI-layer file:
//   ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector.js
//     — an Options API, zero-`application/`-import presentation/selection
//       component, executed directly below via its own `computed`/
//       `methods`, exactly the way
//       ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js
//       is already exercised by
//       ReconciliationCandidateLeaderboardEvidenceExportComparisonUI.test.js
// and extends one existing file, `ui/views/
// ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js` (a
// Composition API view, never executed directly in this Node-based test,
// only source-inspected, the same discipline Section M of the sibling UI
// test already holds).
//
// Section A: FLAGSHIP — decisionPool()/observationPool() flatten a
//            0.8.193-shaped detail's own three partitions
//            (sourceOnly/shared/targetOnly) into one selectable list, in
//            that fixed section order, every record labeled with its own
//            originating section.
// Section B: "Add Pair" is enabled only once BOTH a source key and a
//            target key are selected, independently per dimension.
// Section C: addDecisionPair()/addObservationPair() emit the exact
//            original record references (never a clone) as `{ source,
//            target }`, and reset that dimension's own pending keys.
// Section D: the identical record may be picked as both source and
//            target, and the identical pair may be added more than once —
//            neither is blocked, mirroring 0.8.198's own "multiplicity
//            remains meaningful."
// Section E: removeDecisionPair()/removeObservationPair() emit exactly the
//            supplied index.
// Section F: decisionPairs/observationPairs/decisionDifferences/
//            observationDifferences/isResultEmpty degrade to empty/true on
//            malformed or absent `explicitPairs`/`pairedView` props,
//            without throwing.
// Section G: a malformed/absent `detail` prop degrades both pools to `[]`
//            (both "Add Pair" buttons stay disabled), without throwing.
// Section H: the component's own source imports nothing from
//            `application/`, and calls none of 0.8.198's/0.8.197's/
//            0.8.199's/0.8.200's own `describeXxx()` functions.
// Section I: the component's own source carries no network, persistence,
//            or ranking/judgment vocabulary.
// Section J: the view's own new wiring — imports all four new application
//            modules, owns `explicitPairs` as page-local state reset by
//            `clearComparison()`, computes the 0.8.198 -> 0.8.197 ->
//            0.8.199 -> 0.8.200 chain off `explicitPairs` (never off
//            `comparison`/`comparisonDetail`/`comparisonIdentity`), and
//            wires the new component's four pair events to its own
//            add/remove handlers.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
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
        planIdentity: Object.freeze({ algorithm: 'SHA-256', planFingerprint: 'a'.repeat(60) + String(seconds).padStart(4, '0'), candidateCount: 1 }),
        candidatePresent: true,
        candidateType: candidate.type,
        candidateMatchesPlan: true,
        observedAt: `2026-08-31T01:00:${String(seconds).padStart(2, '0')}.000Z`
    });
}

const selector = default_ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector;

// Builds a test `ctx` mimicking what Vue's own runtime would expose as
// `this` inside the component — props/data merged with overrides, PLUS
// this component's own `computed` properties evaluated once up front (so
// a method reading `this.decisionPool`, exactly as it would inside a real
// mounted component, sees the identical array `selector.computed.
// decisionPool.call(ctx)` itself returns) — the same "call computed
// directly, then wire the result onto ctx" approach the sibling Table
// component's own test already uses for `rendered`, applied here so
// `methods` depending on a `computed` sibling behave identically to the
// real component.
function ctxOf(overrides = {}) {
    const emitted = [];
    const ctx = {
        detail: null,
        explicitPairs: null,
        pairedView: null,
        pendingDecisionSourceKey: '',
        pendingDecisionTargetKey: '',
        pendingObservationSourceKey: '',
        pendingObservationTargetKey: '',
        $emit(name, payload) {
            emitted.push({ name, payload });
        },
        ...overrides
    };
    ctx.decisionPool = selector.computed.decisionPool.call(ctx);
    ctx.observationPool = selector.computed.observationPool.call(ctx);
    ctx.canAddDecisionPair = selector.computed.canAddDecisionPair.call(ctx);
    ctx.canAddObservationPair = selector.computed.canAddObservationPair.call(ctx);
    return { ctx, emitted };
}

async function main() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: pool flattening.
    // ---------------------------------------------------------------
    const dSourceOnly = [decisionRecord('so-1', 'CONFIRMED', 1)];
    const dShared = [decisionRecord('sh-1', 'CONFIRMED', 2), decisionRecord('sh-2', 'REJECTED', 3)];
    const dTargetOnly = [decisionRecord('to-1', 'REJECTED', 4)];
    const oSourceOnly = [observationRecord('oso-1', 10)];
    const oShared = [observationRecord('osh-1', 11)];
    const oTargetOnly = [observationRecord('oto-1', 12), observationRecord('oto-2', 13)];

    const detail = Object.freeze({
        decisionEvidence: Object.freeze({ shared: dShared, sourceOnly: dSourceOnly, targetOnly: dTargetOnly }),
        observationEvidence: Object.freeze({ shared: oShared, sourceOnly: oSourceOnly, targetOnly: oTargetOnly })
    });

    {
        const { ctx } = ctxOf({ detail });
        const decisionPool = selector.computed.decisionPool.call(ctx);
        const observationPool = selector.computed.observationPool.call(ctx);
        assert(decisionPool.length === 4, '1. FLAGSHIP — decisionPool() flattens all three decision partitions (1+2+1=4)');
        assert(decisionPool.map((entry) => entry.section).join(',') === 'sourceOnly,shared,shared,targetOnly',
            '2. FLAGSHIP — decisionPool() lists sourceOnly, then shared, then targetOnly, in that fixed order');
        assert(decisionPool[0].record === dSourceOnly[0], '3. FLAGSHIP — a pool entry carries the original record reference, never a clone');
        assert(observationPool.length === 4, '4. FLAGSHIP — observationPool() flattens all three observation partitions (1+1+2=4)');
        assert(observationPool.map((entry) => entry.section).join(',') === 'sourceOnly,shared,targetOnly,targetOnly',
            '5. FLAGSHIP — observationPool() lists sourceOnly, then shared, then targetOnly, in that fixed order');
        assert(new Set(decisionPool.map((entry) => entry.key)).size === decisionPool.length, '6. every pool entry has a distinct key');
    }
    console.log('✓ Section A: FLAGSHIP — decisionPool()/observationPool() flatten all three partitions in fixed order, preserving record identity');

    // ---------------------------------------------------------------
    // Section B — "Add Pair" gating.
    // ---------------------------------------------------------------
    {
        const { ctx } = ctxOf({ detail });
        assert(selector.computed.canAddDecisionPair.call(ctx) === false, '7. canAddDecisionPair is false with neither key selected');
        ctx.pendingDecisionSourceKey = 'sourceOnly:0';
        assert(selector.computed.canAddDecisionPair.call(ctx) === false, '8. canAddDecisionPair stays false with only a source selected');
        ctx.pendingDecisionTargetKey = 'shared:0';
        assert(selector.computed.canAddDecisionPair.call(ctx) === true, '9. canAddDecisionPair is true once both a source and a target are selected');

        assert(selector.computed.canAddObservationPair.call(ctx) === false, '10. canAddObservationPair is independently false with neither observation key selected');
        ctx.pendingObservationSourceKey = 'sourceOnly:0';
        ctx.pendingObservationTargetKey = 'targetOnly:1';
        assert(selector.computed.canAddObservationPair.call(ctx) === true, '11. canAddObservationPair is true once both observation keys are selected');
    }
    console.log('✓ Section B: "Add Pair" is enabled only once both a source and a target key are selected, independently per dimension');

    // ---------------------------------------------------------------
    // Section C — addDecisionPair()/addObservationPair() emit original
    //             references and reset pending keys.
    // ---------------------------------------------------------------
    {
        const { ctx, emitted } = ctxOf({
            detail,
            pendingDecisionSourceKey: 'sourceOnly:0',
            pendingDecisionTargetKey: 'shared:1'
        });
        selector.methods.addDecisionPair.call(ctx);
        assert(emitted.length === 1 && emitted[0].name === 'add-decision-pair', '12. addDecisionPair() emits exactly one "add-decision-pair" event');
        assert(emitted[0].payload.source === dSourceOnly[0], '13. the emitted pair\'s source is the original sourceOnly record reference');
        assert(emitted[0].payload.target === dShared[1], '14. the emitted pair\'s target is the original shared record reference');
        assert(ctx.pendingDecisionSourceKey === '' && ctx.pendingDecisionTargetKey === '', '15. addDecisionPair() resets both decision pending keys back to unselected');
    }
    {
        const { ctx, emitted } = ctxOf({
            detail,
            pendingObservationSourceKey: 'targetOnly:0',
            pendingObservationTargetKey: 'targetOnly:1'
        });
        selector.methods.addObservationPair.call(ctx);
        assert(emitted.length === 1 && emitted[0].name === 'add-observation-pair', '16. addObservationPair() emits exactly one "add-observation-pair" event');
        assert(emitted[0].payload.source === oTargetOnly[0] && emitted[0].payload.target === oTargetOnly[1], '17. the emitted observation pair carries the original references');
        assert(ctx.pendingObservationSourceKey === '' && ctx.pendingObservationTargetKey === '', '18. addObservationPair() resets both observation pending keys back to unselected');
    }
    {
        // Calling addDecisionPair() with an incomplete selection never emits.
        const { ctx, emitted } = ctxOf({ detail, pendingDecisionSourceKey: 'sourceOnly:0' });
        selector.methods.addDecisionPair.call(ctx);
        assert(emitted.length === 0, '19. addDecisionPair() emits nothing when only one side of the pair is selected');
    }
    console.log('✓ Section C: addDecisionPair()/addObservationPair() emit the original record references and reset that dimension\'s own pending keys');

    // ---------------------------------------------------------------
    // Section D — same-record and duplicate pairs are never blocked.
    // ---------------------------------------------------------------
    {
        const { ctx, emitted } = ctxOf({
            detail,
            pendingDecisionSourceKey: 'shared:0',
            pendingDecisionTargetKey: 'shared:0'
        });
        assert(selector.computed.canAddDecisionPair.call(ctx) === true, '20. picking the identical record as both source and target is never blocked');
        selector.methods.addDecisionPair.call(ctx);
        assert(emitted[0].payload.source === dShared[0] && emitted[0].payload.target === dShared[0], '21. a self-paired record is emitted with source === target, unchanged');
    }
    {
        const { ctx: firstCtx, emitted: firstEmitted } = ctxOf({ detail, pendingDecisionSourceKey: 'sourceOnly:0', pendingDecisionTargetKey: 'shared:0' });
        selector.methods.addDecisionPair.call(firstCtx);
        const { ctx: secondCtx, emitted: secondEmitted } = ctxOf({ detail, pendingDecisionSourceKey: 'sourceOnly:0', pendingDecisionTargetKey: 'shared:0' });
        selector.methods.addDecisionPair.call(secondCtx);
        assert(serialize(firstEmitted[0].payload) === serialize(secondEmitted[0].payload), '22. adding the identical pair twice is never blocked or deduplicated by this component');
    }
    console.log('✓ Section D: the identical record may be paired with itself, and the identical pair may be added more than once — neither is blocked');

    // ---------------------------------------------------------------
    // Section E — removeDecisionPair()/removeObservationPair() emit index.
    // ---------------------------------------------------------------
    {
        const { ctx, emitted } = ctxOf({ detail });
        selector.methods.removeDecisionPair.call(ctx, 2);
        selector.methods.removeObservationPair.call(ctx, 0);
        assert(serialize(emitted) === serialize([
            { name: 'remove-decision-pair', payload: 2 },
            { name: 'remove-observation-pair', payload: 0 }
        ]), '23. removeDecisionPair()/removeObservationPair() each emit exactly the supplied index, on the correctly named event');
    }
    console.log('✓ Section E: removeDecisionPair()/removeObservationPair() emit exactly the supplied index');

    // ---------------------------------------------------------------
    // Section F — malformed/absent explicitPairs/pairedView degrade
    //             cleanly, never throw.
    // ---------------------------------------------------------------
    for (const malformed of [null, undefined, 'not an object', 42, [], { decisionPairs: 'nope' }]) {
        const { ctx } = ctxOf({ explicitPairs: malformed, pairedView: malformed });
        assert(serialize(selector.computed.decisionPairs.call(ctx)) === '[]', `24. malformed explicitPairs (${serialize(malformed)}) degrades decisionPairs to []`);
        assert(serialize(selector.computed.observationPairs.call(ctx)) === '[]', `25. malformed explicitPairs (${serialize(malformed)}) degrades observationPairs to []`);
        assert(serialize(selector.computed.decisionDifferences.call(ctx)) === '[]', `26. malformed pairedView (${serialize(malformed)}) degrades decisionDifferences to []`);
        assert(serialize(selector.computed.observationDifferences.call(ctx)) === '[]', `27. malformed pairedView (${serialize(malformed)}) degrades observationDifferences to []`);
        assert(selector.computed.isResultEmpty.call(ctx) === true, `28. malformed pairedView (${serialize(malformed)}) degrades isResultEmpty to true`);
    }
    {
        const { ctx } = ctxOf({
            explicitPairs: { decisionPairs: [{ source: dShared[0], target: dShared[1] }], observationPairs: [] },
            pairedView: { isEmpty: false, decisionDifferences: [{ differenceCount: 1, differingFields: ['decision'] }], observationDifferences: [] }
        });
        assert(selector.computed.decisionPairs.call(ctx).length === 1, '29. a genuine explicitPairs.decisionPairs is read through unchanged');
        assert(selector.computed.isResultEmpty.call(ctx) === false, '30. a genuine pairedView.isEmpty === false is read through unchanged');
    }
    console.log('✓ Section F: malformed/absent explicitPairs/pairedView degrade every computed property to an empty/true default, never throwing');

    // ---------------------------------------------------------------
    // Section G — malformed/absent detail degrades both pools to [].
    // ---------------------------------------------------------------
    for (const malformed of [null, undefined, 'not an object', 42, { decisionEvidence: 'nope' }]) {
        const { ctx } = ctxOf({ detail: malformed });
        assert(serialize(selector.computed.decisionPool.call(ctx)) === '[]', `31. malformed detail (${serialize(malformed)}) degrades decisionPool to []`);
        assert(serialize(selector.computed.observationPool.call(ctx)) === '[]', `32. malformed detail (${serialize(malformed)}) degrades observationPool to []`);
    }
    console.log('✓ Section G: a malformed or absent detail prop degrades both record pools to [], without throwing');

    // ---------------------------------------------------------------
    // Section H/I — module source: zero application/ imports, zero calls
    //               into the 0.8.198/0.8.197/0.8.199/0.8.200 chain, and no
    //               network/persistence/ranking vocabulary.
    // ---------------------------------------------------------------
    const selectorModuleSource = await (await import('node:fs/promises')).readFile(
        new URL('../ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector.js', import.meta.url), 'utf8'
    );
    const selectorCodeOnly = selectorModuleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    assert(!selectorCodeOnly.includes('import '), '33. the selector component imports nothing at all — the identical zero-imports discipline the Table component holds');
    for (const forbiddenCall of [
        'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs(',
        'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference(',
        'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(',
        'describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView('
    ]) {
        assert(!selectorCodeOnly.includes(forbiddenCall), `35. the selector component's own code never calls ${forbiddenCall}— that chain is the parent view's own responsibility`);
    }
    console.log('✓ Section H: the selector component imports nothing and never calls the 0.8.198/0.8.197/0.8.199/0.8.200 chain itself');

    {
        const networkTerms = ['fetch(', 'xmlhttprequest', 'websocket'];
        for (const term of networkTerms) {
            assert(!selectorCodeOnly.toLowerCase().includes(term), `36. the selector component's own code never carries network vocabulary ("${term}")`);
        }
        const persistenceTerms = ['localstorage', 'sessionstorage', 'indexeddb', '.save(', 'storage.set'];
        for (const term of persistenceTerms) {
            assert(!selectorCodeOnly.toLowerCase().includes(term), `37. the selector component's own code never carries persistence vocabulary ("${term}")`);
        }
        const judgmentTerms = ['winner', 'confidence', 'conflict', '.sort(', 'authoritative', 'better', 'worse'];
        for (const term of judgmentTerms) {
            assert(!selectorCodeOnly.toLowerCase().includes(term), `38. the selector component's own code never carries ranking/judgment vocabulary ("${term}")`);
        }
    }
    console.log('✓ Section I: the selector component\'s own code carries no network, persistence, or ranking/judgment vocabulary');

    // ---------------------------------------------------------------
    // Section J — the view's own new wiring (source-inspected only, the
    //             same discipline the sibling UI test already holds for
    //             this Composition API file).
    // ---------------------------------------------------------------
    const viewModuleSource = await (await import('node:fs/promises')).readFile(
        new URL('../ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js', import.meta.url), 'utf8'
    );
    for (const requiredImport of [
        "from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairsView.js'",
        "from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceView.js'",
        "from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel.js'",
        "from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView.js'",
        "from '../components/ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector.js'"
    ]) {
        assert(viewModuleSource.includes(requiredImport), `39. the view imports the new 0.8.201 module (${requiredImport})`);
    }
    assert(viewModuleSource.includes('const explicitPairs = ref({ decisionPairs: [], observationPairs: [] });'), '40. the view owns explicitPairs as page-local ref state, starting empty on both sides');
    assert(viewModuleSource.includes('explicitPairs.value = { decisionPairs: [], observationPairs: [] };'), '41. clearComparison() resets explicitPairs back to empty');
    assert(
        viewModuleSource.includes('describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs(explicitPairs.value)'),
        '42. the 0.8.198 stage is computed off explicitPairs.value directly'
    );
    assert(
        viewModuleSource.includes('describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference(explicitRecordPairs.value)'),
        '43. the 0.8.197 stage is computed off the 0.8.198 stage\'s own result, never off explicitPairs directly'
    );
    assert(
        viewModuleSource.includes('describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(recordDifferences.value)'),
        '44. the 0.8.199 stage is computed off the 0.8.197 stage\'s own result'
    );
    assert(
        viewModuleSource.includes('describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView(recordDifferenceReadModel.value)'),
        '45. the 0.8.200 stage is computed off the 0.8.199 stage\'s own result'
    );
    for (const wiredEvent of ['@add-decision-pair="addDecisionPair"', '@remove-decision-pair="removeDecisionPair"', '@add-observation-pair="addObservationPair"', '@remove-observation-pair="removeObservationPair"']) {
        assert(viewModuleSource.includes(wiredEvent), `46. the view wires the selector's own ${wiredEvent} event to its own handler`);
    }
    console.log('✓ Section J: the view owns explicitPairs as page-local state, computes the 0.8.198 -> 0.8.197 -> 0.8.199 -> 0.8.200 chain off it, and wires all four pair events');

    console.log('\nAll ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelectorUI tests passed.');
}

main().catch((error) => {
    console.error(error.message);
    process.exit(1);
});
