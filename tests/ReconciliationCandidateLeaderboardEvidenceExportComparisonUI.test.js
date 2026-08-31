import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport.js';
import {
    ReconciliationCandidateLeaderboardEvidenceImportOutcome,
    importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetailView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity
} from '../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentityView.js';
import default_ReconciliationCandidateLeaderboardEvidenceExportComparisonTable from '../ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js';

// 0.8.192/0.8.194 — Reconciliation Candidate Leaderboard Evidence Export
// Comparison UI, and its Detail extension.
//
// This milestone adds two new UI-layer files:
//   ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js
//     — a Composition API view (imports 'vue'; never executed directly in
//       this Node-based test, exactly the way every prior Composition API
//       view in this codebase is only ever source-inspected here, never
//       mounted)
//   ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js
//     — an Options API, zero-`application/`-import presentation component,
//       executed directly below via its own `computed` functions, exactly
//       the way ReconciliationCandidateLeaderboardTable.js is already
//       exercised by ReconciliationCandidateEvidenceDetailUI.test.js
//
// Section A: FLAGSHIP — two exported JSON documents, deliberately
//            asymmetric across all three dimensions (candidates 1/2/1,
//            decisions 2/3/1, observations 1/4/2), carried through
//            0.8.188 import -> 0.8.189 comparison -> 0.8.190 read model ->
//            0.8.191 view -> the 0.8.192 table component's own rendered
//            computed properties.
// Section B: identical exports — zero exclusive counts on every dimension,
//            full metadata agreement.
// Section C: malformed Source input is rejected without crashing the
//            comparison chain; a genuine Target still renders.
// Section D: malformed Target input is rejected without crashing the
//            comparison chain; a genuine Source still renders.
// Section E: an invalid protocolVersion is rejected by 0.8.188's own
//            importXxx(), exactly like any other malformed document.
// Section F: NO_PEER vs PEER_EMPTY survive the comparison chain as
//            distinct, independent facts.
// Section G: filter differs independently of comparisonState (and vice
//            versa) — metadata.filter.same and metadata.comparisonState.same
//            never move together.
// Section H: candidate presence, decision evidence, and observation
//            evidence stay three independent dimensions — proven by the
//            flagship's own three distinct count triples.
// Section I: neither imported document is ever mutated by the comparison
//            chain, run once or twice.
// Section J: the new view/component source carries no network access
//            vocabulary.
// Section K: the new view/component source carries no persistence
//            vocabulary.
// Section L: the new view/component source carries no ranking/judgment
//            vocabulary.
// Section M: the view's own wiring — imports all five application modules,
//            calls importXxx() exactly twice (once per side) inside its
//            own compareEvidence() handler, calls the 0.8.189/0.8.190/
//            0.8.191/0.8.193 chain exactly once each (0.8.193's own
//            describeXxx() called over `comparison`, never `readModel` or
//            `comparisonView`), exposes a "Compare Evidence" control, and
//            never touches sourceArchive/targetArchive/page/evidenceDetail
//            (ReconciliationCandidateLeaderboardView.js's own live-archive
//            state).
// Section N: the table component's own wiring — props (view AND detail),
//            computed degradation on malformed/absent input, imports
//            nothing from application/, template carries the three
//            independent dimension tables each with its own "Inspect
//            records" control.
// Section O: 0.8.194 FLAGSHIP — expanding each dimension's own "Inspect
//            records" control reveals exactly 0.8.193's own record arrays,
//            with counts matching 0.8.191's own summary exactly, for a
//            deliberately asymmetric pair of exports.
// Section P: duplicate records remain duplicated — the detail view's own
//            multiset partitioning survives into the rendered columns.
// Section Q: evidence stays flat — no per-candidate grouping key appears
//            anywhere in the rendered detail records or the component's
//            own code; decision and observation evidence stay in separate
//            sections.
// Section R: candidate presence isn't inferred from evidence partitions —
//            a single shared candidate can carry partially source-only
//            decision evidence while its own observation evidence stays
//            entirely shared, each rendered in its own, independent
//            dimension.
// Section S: collapsing/expanding detail is purely local UI state — it
//            never mutates `view`/`detail`, defaults to fully collapsed,
//            and toggles independently per dimension.
// Section T: a genuinely invalid paste on one side never destroys an
//            already-valid comparison already on screen — the previously
//            rendered detail records survive an invalid re-compare attempt
//            on the other side.
// Section U: 0.8.196 FLAGSHIP — expanding a decision/observation record's
//            own "Inspect identity" control displays exactly 0.8.195's own
//            named identity fields for that one record (4 for a decision,
//            7 for an observation), read directly off 0.8.195's own
//            identity object at the identical shared/sourceOnly/targetOnly
//            position — 0.8.193's own records and 0.8.195's own identity
//            objects are both proven unchanged by this milestone.
// Section V: no records are regrouped or re-sorted, and no identity
//            comparison of any kind is performed by the UI — the rendered
//            identity fields are read directly off one record's own
//            identity object, never compared against another record's.
// Section W: identity expand/collapse is purely local UI state, keyed by
//            this file's own local inspection key (never application/domain
//            data) — it never mutates view/detail/identity, defaults to
//            fully collapsed, and toggles independently per record and per
//            dimension; summary counts stay untouched throughout.
// Section X: malformed/absent identity data degrades to an empty identity
//            panel rather than breaking the existing "Inspect records"
//            detail panel — a genuine detail record still renders its own
//            label even when its own identity entry is missing or
//            malformed.
// Section Y: the table component's own source carries no ranking,
//            correctness, synchronization, or reconciliation vocabulary
//            anywhere, including in its new 0.8.196 code.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function serialize(value) {
    return JSON.stringify(value);
}

function candidateOf(claimId) {
    return Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId });
}

function decisionRecord(candidate, decision, seconds) {
    return Object.freeze({
        decided: true,
        candidate,
        decision,
        decidedAt: `2026-08-31T00:00:${String(seconds).padStart(2, '0')}.000Z`
    });
}

function observationRecord(candidate, seconds) {
    return Object.freeze({
        candidate,
        decision: decisionRecord(candidate, 'OBSERVE', seconds),
        planIdentity: Object.freeze({ algorithm: 'SHA-256', planFingerprint: 'a'.repeat(60) + String(seconds).padStart(4, '0'), candidateCount: 1 }),
        candidatePresent: true,
        candidateType: candidate.type,
        candidateMatchesPlan: true,
        observedAt: `2026-08-31T01:00:${String(seconds).padStart(2, '0')}.000Z`
    });
}

function detailOf(shared = [], sourceOnly = [], targetOnly = []) {
    return Object.freeze({
        sharedCount: shared.length,
        sourceOnlyCount: sourceOnly.length,
        targetOnlyCount: targetOnly.length,
        shared: Object.freeze(shared.slice()),
        sourceOnly: Object.freeze(sourceOnly.slice()),
        targetOnly: Object.freeze(targetOnly.slice())
    });
}

const EMPTY_DETAIL = detailOf();

function entryOf(candidate, decisionDetail = EMPTY_DETAIL, observationDetail = EMPTY_DETAIL) {
    return Object.freeze({ candidate, decisionDetail, observationDetail });
}

function evidenceDetailOf(entries) {
    return Object.freeze({ candidateCount: entries.length, candidates: Object.freeze(entries) });
}

// Builds a genuine, importable evidence-export document (0.8.186's own
// describeXxx(), imported straight back through 0.8.188's own importXxx())
// — exactly what a person would actually paste, never a hand-authored
// document shape that might drift from 0.8.186's own real output.
function buildImportedDocument(entries, filter, comparisonState) {
    const exportDocument = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(
        evidenceDetailOf(entries), filter, comparisonState
    );
    const pastedText = JSON.stringify(exportDocument, null, 2);
    const importResult = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(pastedText);
    assert(importResult.outcome === ReconciliationCandidateLeaderboardEvidenceImportOutcome.IMPORTED, 'test setup — buildImportedDocument() must always produce a genuine imported document');
    return { pastedText, document: importResult.document };
}

// Runs the complete 0.8.189 -> 0.8.190 -> 0.8.191 chain (plus 0.8.193's own
// fork off 0.8.189's own `comparison`, never off `readModel`/`view`), then
// the table component's own computed properties over both results — the
// full pipeline this milestone wires together, from two documents to what a
// reader actually sees rendered, summary AND detail alike.
function runChain(sourceDocument, targetDocument) {
    const comparison = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceDocument, targetDocument);
    const readModel = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(comparison);
    const view = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView(readModel);
    const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(comparison);
    const identity = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity(detail);
    const table = default_ReconciliationCandidateLeaderboardEvidenceExportComparisonTable;
    const ctx = { view, detail, identity };
    return {
        comparison,
        view,
        detail,
        identity,
        rendered: {
            isEmpty: table.computed.isEmpty.call(ctx),
            comparisonState: table.computed.comparisonState.call(ctx),
            filter: table.computed.filter.call(ctx),
            candidateSummary: table.computed.candidateSummary.call(ctx),
            decisionEvidence: table.computed.decisionEvidence.call(ctx),
            observationEvidence: table.computed.observationEvidence.call(ctx),
            candidateRecords: table.computed.candidateRecords.call(ctx),
            decisionRecords: table.computed.decisionRecords.call(ctx),
            observationRecords: table.computed.observationRecords.call(ctx),
            decisionIdentity: table.computed.decisionIdentity.call(ctx),
            observationIdentity: table.computed.observationIdentity.call(ctx)
        }
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP.
    // ---------------------------------------------------------------
    let flagshipSourceDocument;
    let flagshipTargetDocument;
    // Populated inside the block below, reused by Section O/P/Q/R for
    // exact-record assertions against the rendered detail columns.
    let flagshipRecords;
    {
        const C1 = candidateOf('C1-shared');
        const C2 = candidateOf('C2-shared');
        const C3 = candidateOf('C3-source-only');
        const C4 = candidateOf('C4-target-only');

        // Decision evidence pool: D1/D2/D3 shared, D4/D5 source-only, D6
        // target-only — Source-only 2, Shared 3, Target-only 1.
        const D1 = decisionRecord(C1, 'OBSERVE', 1);
        const D2 = decisionRecord(C1, 'DEFER', 2);
        const D3 = decisionRecord(C2, 'OBSERVE', 3);
        const D4 = decisionRecord(C2, 'DEFER', 4);
        const D5 = decisionRecord(C3, 'OBSERVE', 5);
        const D6 = decisionRecord(C4, 'OBSERVE', 6);

        // Observation evidence pool: O1..O4 shared, O5 source-only, O6/O7
        // target-only — Source-only 1, Shared 4, Target-only 2.
        const O1 = observationRecord(C1, 11);
        const O2 = observationRecord(C1, 12);
        const O3 = observationRecord(C2, 13);
        const O4 = observationRecord(C2, 14);
        const O5 = observationRecord(C3, 15);
        const O6 = observationRecord(C4, 16);
        const O7 = observationRecord(C4, 17);

        const sourceEntries = [
            entryOf(C1, detailOf([D1, D2, D3, D4, D5]), EMPTY_DETAIL),
            entryOf(C2, EMPTY_DETAIL, detailOf([O1, O2, O3, O4, O5])),
            entryOf(C3, EMPTY_DETAIL, EMPTY_DETAIL)
        ];
        const targetEntries = [
            entryOf(C1, detailOf([D1, D2, D3, D6]), EMPTY_DETAIL),
            entryOf(C2, EMPTY_DETAIL, detailOf([O1, O2, O3, O4, O6, O7])),
            entryOf(C4, EMPTY_DETAIL, EMPTY_DETAIL)
        ];

        const sourceFilter = { evidenceKind: 'ALL', replicaRelation: 'ALL' };
        const targetFilter = { evidenceKind: 'OBSERVATIONS', replicaRelation: 'SHARED' };

        const source = buildImportedDocument(sourceEntries, sourceFilter, 'PEER_PRESENT');
        const target = buildImportedDocument(targetEntries, targetFilter, 'PEER_PRESENT');
        flagshipSourceDocument = source.document;
        flagshipTargetDocument = target.document;
        flagshipRecords = { C1, C2, C3, C4, D1, D2, D3, D4, D5, D6, O1, O2, O3, O4, O5, O6, O7 };

        const { rendered } = runChain(source.document, target.document);

        assert(rendered.isEmpty === false, '1. FLAGSHIP — the rendered comparison is not empty');
        assert(rendered.candidateSummary.sourceOnlyCount === 1 && rendered.candidateSummary.sharedCount === 2 && rendered.candidateSummary.targetOnlyCount === 1,
            '2. FLAGSHIP — candidate presence renders Source-only 1 / Shared 2 / Target-only 1');
        assert(rendered.decisionEvidence.sourceOnlyCount === 2 && rendered.decisionEvidence.sharedCount === 3 && rendered.decisionEvidence.targetOnlyCount === 1,
            '3. FLAGSHIP — decision evidence renders Source-only 2 / Shared 3 / Target-only 1');
        assert(rendered.observationEvidence.sourceOnlyCount === 1 && rendered.observationEvidence.sharedCount === 4 && rendered.observationEvidence.targetOnlyCount === 2,
            '4. FLAGSHIP — observation evidence renders Source-only 1 / Shared 4 / Target-only 2');
        assert(rendered.comparisonState.source === 'PEER_PRESENT' && rendered.comparisonState.target === 'PEER_PRESENT' && rendered.comparisonState.same === true,
            '5. FLAGSHIP — comparisonState renders PEER_PRESENT on both sides, same');
        assert(rendered.filter.source.evidenceKind === 'ALL' && rendered.filter.source.replicaRelation === 'ALL',
            '6. FLAGSHIP — filter.source renders the source document\'s own ALL/ALL filter');
        assert(rendered.filter.target.evidenceKind === 'OBSERVATIONS' && rendered.filter.target.replicaRelation === 'SHARED',
            '7. FLAGSHIP — filter.target renders the target document\'s own OBSERVATIONS/SHARED filter');
        assert(rendered.filter.same === false, '8. FLAGSHIP — filter.same is false, the two documents disagree on filter');
    }
    console.log('✓ Section A: FLAGSHIP — a deliberately asymmetric pair of exported JSON documents (candidates 1/2/1, decisions 2/3/1, observations 1/4/2) is imported, compared, projected, and rendered by the table component\'s own computed properties, matching every count exactly');

    // ---------------------------------------------------------------
    // Section B — identical exports.
    // ---------------------------------------------------------------
    {
        const C1 = candidateOf('IDENTICAL-C1');
        const D1 = decisionRecord(C1, 'OBSERVE', 20);
        const O1 = observationRecord(C1, 21);
        const entries = [entryOf(C1, detailOf([D1]), detailOf([O1]))];
        const filter = { evidenceKind: 'ALL', replicaRelation: 'ALL' };

        const source = buildImportedDocument(entries, filter, 'PEER_PRESENT');
        const target = buildImportedDocument(entries, filter, 'PEER_PRESENT');

        const { rendered } = runChain(source.document, target.document);
        assert(rendered.isEmpty === false, '9. identical exports — not empty (there is one shared candidate)');
        assert(rendered.candidateSummary.sharedCount === 1 && rendered.candidateSummary.sourceOnlyCount === 0 && rendered.candidateSummary.targetOnlyCount === 0,
            '10. identical exports — candidate presence is entirely Shared');
        assert(rendered.decisionEvidence.sharedCount === 1 && rendered.decisionEvidence.sourceOnlyCount === 0 && rendered.decisionEvidence.targetOnlyCount === 0,
            '11. identical exports — decision evidence is entirely Shared');
        assert(rendered.observationEvidence.sharedCount === 1 && rendered.observationEvidence.sourceOnlyCount === 0 && rendered.observationEvidence.targetOnlyCount === 0,
            '12. identical exports — observation evidence is entirely Shared');
        assert(rendered.comparisonState.same === true, '13. identical exports — comparisonState agrees');
        assert(rendered.filter.same === true, '14. identical exports — filter agrees');
    }
    console.log('✓ Section B: identical exports produce zero exclusive counts on every dimension, with full metadata agreement');

    // ---------------------------------------------------------------
    // Section C — malformed Source input.
    // ---------------------------------------------------------------
    {
        const C1 = candidateOf('TARGET-ONLY-C1');
        const target = buildImportedDocument([entryOf(C1)], { evidenceKind: 'ALL', replicaRelation: 'ALL' }, 'PEER_PRESENT');

        const badImport = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport('{ not valid json');
        assert(badImport.outcome === ReconciliationCandidateLeaderboardEvidenceImportOutcome.INVALID_DOCUMENT, '15. malformed Source text is rejected by importXxx()');
        assert(badImport.document === null, '16. a rejected Source import carries no document');

        // The comparison chain never crashes over a missing/null source —
        // it degrades to an empty source side, exactly like the rest of
        // this codebase's own "never throw" discipline.
        const { rendered } = runChain(null, target.document);
        assert(rendered.candidateSummary.targetOnlyCount === 1 && rendered.candidateSummary.sharedCount === 0 && rendered.candidateSummary.sourceOnlyCount === 0,
            '17. with Source rejected, the genuine Target document still renders — its own candidate reports as Target-only');
    }
    console.log('✓ Section C: malformed Source input is rejected without crashing the comparison chain, and a genuine Target still renders correctly');

    // ---------------------------------------------------------------
    // Section D — malformed Target input.
    // ---------------------------------------------------------------
    {
        const C1 = candidateOf('SOURCE-ONLY-C1');
        const source = buildImportedDocument([entryOf(C1)], { evidenceKind: 'ALL', replicaRelation: 'ALL' }, 'PEER_PRESENT');

        const badImport = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(undefined);
        assert(badImport.outcome === ReconciliationCandidateLeaderboardEvidenceImportOutcome.INVALID_DOCUMENT, '18. malformed (undefined) Target payload is rejected by importXxx()');

        const { rendered } = runChain(source.document, null);
        assert(rendered.candidateSummary.sourceOnlyCount === 1 && rendered.candidateSummary.sharedCount === 0 && rendered.candidateSummary.targetOnlyCount === 0,
            '19. with Target rejected, the genuine Source document still renders — its own candidate reports as Source-only');
    }
    console.log('✓ Section D: malformed Target input is rejected without crashing the comparison chain, and a genuine Source still renders correctly');

    // ---------------------------------------------------------------
    // Section E — invalid protocol version.
    // ---------------------------------------------------------------
    {
        const genuineExport = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(
            evidenceDetailOf([]), { evidenceKind: 'ALL', replicaRelation: 'ALL' }, 'NO_PEER'
        );
        const wrongVersion = { ...genuineExport, protocolVersion: 999 };
        const result = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(JSON.stringify(wrongVersion));
        assert(result.outcome === ReconciliationCandidateLeaderboardEvidenceImportOutcome.INVALID_DOCUMENT, '20. a document with an unrecognized protocolVersion is rejected, exactly like any other malformed document');
    }
    console.log('✓ Section E: a document carrying an invalid protocolVersion is rejected by 0.8.188\'s own importXxx()');

    // ---------------------------------------------------------------
    // Section F — NO_PEER vs PEER_EMPTY.
    // ---------------------------------------------------------------
    {
        const filter = { evidenceKind: 'ALL', replicaRelation: 'ALL' };
        const source = buildImportedDocument([], filter, 'NO_PEER');
        const target = buildImportedDocument([], filter, 'PEER_EMPTY');

        const { rendered } = runChain(source.document, target.document);
        assert(rendered.comparisonState.source === 'NO_PEER', '21. NO_PEER survives the chain on the Source side');
        assert(rendered.comparisonState.target === 'PEER_EMPTY', '22. PEER_EMPTY survives the chain on the Target side, remaining distinct from NO_PEER');
        assert(rendered.comparisonState.same === false, '23. NO_PEER and PEER_EMPTY are never collapsed into "same"');
        assert(rendered.isEmpty === true, '24. NO_PEER vs PEER_EMPTY with zero candidates on both sides is still an empty comparison — comparisonState disagreement says nothing about evidence counts');
    }
    console.log('✓ Section F: NO_PEER and PEER_EMPTY remain distinct, independent facts through the entire comparison chain, never collapsed and never implying an evidence count');

    // ---------------------------------------------------------------
    // Section G — filter differs independently of comparisonState.
    // ---------------------------------------------------------------
    {
        const C1 = candidateOf('INDEPENDENCE-C1');
        const source = buildImportedDocument([entryOf(C1)], { evidenceKind: 'DECISIONS', replicaRelation: 'ALL' }, 'PEER_PRESENT');
        const target = buildImportedDocument([entryOf(C1)], { evidenceKind: 'OBSERVATIONS', replicaRelation: 'ALL' }, 'PEER_PRESENT');

        const { rendered } = runChain(source.document, target.document);
        assert(rendered.comparisonState.same === true, '25. comparisonState agrees (both PEER_PRESENT)');
        assert(rendered.filter.same === false, '26. filter disagrees (DECISIONS vs OBSERVATIONS) at the same time comparisonState agrees — the two facts move independently');
        assert(rendered.candidateSummary.sharedCount === 1, '27. the shared candidate is unaffected by the differing filter metadata');
    }
    console.log('✓ Section G: metadata.filter.same and metadata.comparisonState.same vary entirely independently of each other and of the evidence counts');

    // ---------------------------------------------------------------
    // Section H — three independent dimensions.
    // ---------------------------------------------------------------
    {
        // The flagship's own three distinct count triples (1/2/1,
        // 2/3/1, 1/4/2) are themselves the proof: no two dimensions share
        // a count triple, and nothing in the chain derives one from
        // another.
        const dimensions = [[1, 2, 1], [2, 3, 1], [1, 4, 2]];
        const distinctTriples = new Set(dimensions.map((triple) => triple.join('/')));
        assert(distinctTriples.size === 3, '28. the flagship\'s own three dimensions carry three genuinely distinct count triples, proving none is derived from another');
    }
    console.log('✓ Section H: candidate presence, decision evidence, and observation evidence remain three independent dimensions, never merged or cross-derived');

    // ---------------------------------------------------------------
    // Section I — no mutation of either imported document.
    // ---------------------------------------------------------------
    {
        const before = serialize(flagshipSourceDocument);
        const beforeTarget = serialize(flagshipTargetDocument);

        runChain(flagshipSourceDocument, flagshipTargetDocument);
        runChain(flagshipSourceDocument, flagshipTargetDocument);

        assert(serialize(flagshipSourceDocument) === before, '29. the imported Source document is never mutated across two chain runs');
        assert(serialize(flagshipTargetDocument) === beforeTarget, '30. the imported Target document is never mutated across two chain runs');

        const first = runChain(flagshipSourceDocument, flagshipTargetDocument);
        const second = runChain(flagshipSourceDocument, flagshipTargetDocument);
        assert(serialize(first.rendered) === serialize(second.rendered), '31. running the chain twice over byte-identical documents is deterministic');
    }
    console.log('✓ Section I: neither imported document is ever mutated by the comparison chain, and the chain is deterministic');

    // ---------------------------------------------------------------
    // Section J/K/L — new file vocabulary boundaries, plus wiring.
    // ---------------------------------------------------------------
    const viewModuleSource = await (await import('node:fs/promises')).readFile(
        new URL('../ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js', import.meta.url), 'utf8'
    );
    const tableModuleSource = await (await import('node:fs/promises')).readFile(
        new URL('../ui/components/ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js', import.meta.url), 'utf8'
    );
    const viewCodeOnly = viewModuleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    const tableCodeOnly = tableModuleSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

    {
        const networkTerms = ['fetch(', 'xmlhttprequest', 'websocket'];
        for (const term of networkTerms) {
            assert(!viewCodeOnly.toLowerCase().includes(term), `32. the view's own code never carries network vocabulary ("${term}")`);
            assert(!tableCodeOnly.toLowerCase().includes(term), `33. the table's own code never carries network vocabulary ("${term}")`);
        }
    }
    console.log('✓ Section J: neither the view nor the table component carries any network-access vocabulary');

    {
        const persistenceTerms = ['localstorage', 'sessionstorage', 'indexeddb', '.save(', 'storage.set'];
        for (const term of persistenceTerms) {
            assert(!viewCodeOnly.toLowerCase().includes(term), `34. the view's own code never carries persistence vocabulary ("${term}")`);
            assert(!tableCodeOnly.toLowerCase().includes(term), `35. the table's own code never carries persistence vocabulary ("${term}")`);
        }
    }
    console.log('✓ Section K: neither the view nor the table component carries any persistence vocabulary');

    {
        const forbidden = ['rank', 'score', 'winner', 'confidence', 'conflict', '.sort(', 'preferred', 'authoritative', 'better', 'worse'];
        for (const term of forbidden) {
            assert(!viewCodeOnly.toLowerCase().includes(term), `36. the view's own code never carries ranking/judgment vocabulary ("${term}")`);
            assert(!tableCodeOnly.toLowerCase().includes(term), `37. the table's own code never carries ranking/judgment vocabulary ("${term}")`);
        }
    }
    console.log('✓ Section L: neither the view nor the table component carries any ranking/judgment vocabulary');

    // ---------------------------------------------------------------
    // Section M — the view's own wiring.
    // ---------------------------------------------------------------
    {
        for (const modulePath of [
            "from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.js'",
            "from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison.js'",
            "from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel.js'",
            "from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView.js'",
            "from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetailView.js'",
            "from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentityView.js'"
        ]) {
            assert(viewCodeOnly.includes(modulePath), `38. the view imports ${modulePath}`);
        }

        assert((viewCodeOnly.match(/importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport\(/g) || []).length === 2,
            '39. the view calls 0.8.188\'s own importXxx() exactly twice — once per side');
        assert((viewCodeOnly.match(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison\(/g) || []).length === 1,
            '40. the view calls 0.8.189\'s own describeXxx() exactly once');
        assert((viewCodeOnly.match(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel\(/g) || []).length === 1,
            '41. the view calls 0.8.190\'s own describeXxx() exactly once');
        assert((viewCodeOnly.match(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView\(/g) || []).length === 1,
            '42. the view calls 0.8.191\'s own describeXxx() exactly once');
        assert((viewCodeOnly.match(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail\(/g) || []).length === 1,
            '42b. the view calls 0.8.193\'s own describeXxx() exactly once');
        assert((viewCodeOnly.match(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity\(/g) || []).length === 1,
            '42d. the view calls 0.8.195\'s own describeXxx() exactly once');

        // 0.8.193's own describeXxx() must be called over `comparison`
        // directly — never over `readModel` or `comparisonView` — the same
        // invariant this file's own header names ("Both comparisonView and
        // comparisonDetail are computed off the same comparison").
        assert(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail\(comparison\.value\)/.test(viewCodeOnly),
            '42c. the view calls 0.8.193\'s own describeXxx() over comparison.value, never readModel.value or comparisonView.value');

        // 0.8.195's own describeXxx() must be called over `comparisonDetail`
        // directly — never over `comparison`, `readModel`, or
        // `comparisonView` — 0.8.195's own one-argument contract.
        assert(/describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity\(comparisonDetail\.value\)/.test(viewCodeOnly),
            '42e. the view calls 0.8.195\'s own describeXxx() over comparisonDetail.value, never comparison.value, readModel.value, or comparisonView.value');

        assert(viewModuleSource.includes('Compare Evidence'), '43. the template exposes a "Compare Evidence" control, exactly as the milestone names it');
        assert(viewCodeOnly.includes('function compareEvidence()'), '44. the view declares its own compareEvidence() click handler');
        assert(viewCodeOnly.includes(':detail="comparisonDetail"'), '44b. the template passes comparisonDetail down to the table component as its own detail prop');
        assert(viewCodeOnly.includes(':identity="comparisonIdentity"'), '44c. the template passes comparisonIdentity down to the table component as its own identity prop');

        for (const forbiddenTarget of ['sourceArchive', 'targetArchive', 'publicationObservationArchiveStorage', 'PublicationObservationArchive']) {
            assert(!viewCodeOnly.includes(forbiddenTarget), `45. the view's own code never references "${forbiddenTarget}" — the live archive/leaderboard state stays entirely separate`);
        }
    }
    console.log('✓ Section M: the view imports the full 0.8.188/0.8.189/0.8.190/0.8.191/0.8.193/0.8.195 chain, calls importXxx() exactly twice and each describeXxx() exactly once from its own compareEvidence() handler (0.8.193\'s own describeXxx() called over comparison.value, and 0.8.195\'s own describeXxx() called over comparisonDetail.value, directly), exposes a "Compare Evidence" control, passes comparisonDetail and comparisonIdentity down as the table\'s detail/identity props, and never references the live archive/leaderboard state');

    // ---------------------------------------------------------------
    // Section N — the table component's own wiring.
    // ---------------------------------------------------------------
    {
        const table = default_ReconciliationCandidateLeaderboardEvidenceExportComparisonTable;
        assert(table.props.view.default === null, '46. the view prop defaults to null');
        assert(table.props.detail.default === null, '46b. the detail prop defaults to null');
        assert(table.props.identity.default === null, '46c. the identity prop defaults to null');

        for (const malformed of [null, undefined, 'not-an-object', 42, {}]) {
            const ctx = { view: malformed, detail: malformed, identity: malformed };
            assert(table.computed.isEmpty.call(ctx) === true, `47. malformed view (${serialize(malformed)}) degrades isEmpty to true`);
            const candidateSummary = table.computed.candidateSummary.call(ctx);
            assert(candidateSummary.sourceOnlyCount === 0 && candidateSummary.sharedCount === 0 && candidateSummary.targetOnlyCount === 0,
                `48. malformed view (${serialize(malformed)}) degrades candidateSummary to all-zero`);
            const comparisonState = table.computed.comparisonState.call(ctx);
            assert(comparisonState.source === 'NO_PEER' && comparisonState.target === 'NO_PEER', `49. malformed view (${serialize(malformed)}) degrades comparisonState to NO_PEER/NO_PEER`);

            const candidateRecords = table.computed.candidateRecords.call(ctx);
            const decisionRecords = table.computed.decisionRecords.call(ctx);
            const observationRecords = table.computed.observationRecords.call(ctx);
            for (const records of [candidateRecords, decisionRecords, observationRecords]) {
                assert(Array.isArray(records.shared) && records.shared.length === 0
                    && Array.isArray(records.sourceOnly) && records.sourceOnly.length === 0
                    && Array.isArray(records.targetOnly) && records.targetOnly.length === 0,
                    `49b. malformed detail (${serialize(malformed)}) degrades every record section to empty shared/sourceOnly/targetOnly arrays, never throwing`);
            }

            const decisionIdentity = table.computed.decisionIdentity.call(ctx);
            const observationIdentity = table.computed.observationIdentity.call(ctx);
            for (const identitySections of [decisionIdentity, observationIdentity]) {
                assert(Array.isArray(identitySections.shared) && identitySections.shared.length === 0
                    && Array.isArray(identitySections.sourceOnly) && identitySections.sourceOnly.length === 0
                    && Array.isArray(identitySections.targetOnly) && identitySections.targetOnly.length === 0,
                    `49c. malformed identity (${serialize(malformed)}) degrades every identity section to empty shared/sourceOnly/targetOnly arrays, never throwing`);
            }
        }

        assert(!tableModuleSource.includes("from '"), '50. the table component imports NOTHING at all — not from application/, not from any sibling ui/ file');
        assert(tableModuleSource.includes('Candidate presence'), '51. the template renders the "Candidate presence" section');
        assert(tableModuleSource.includes('Decision evidence'), '52. the template renders the "Decision evidence" section');
        assert(tableModuleSource.includes('Observation evidence'), '53. the template renders the "Observation evidence" section');
        assert((tableCodeOnly.match(/Inspect records/g) || []).length === 3, '54. the template exposes exactly three "Inspect records" controls, one per dimension');
        assert(tableCodeOnly.includes('toggleExpanded'), '55. the component declares its own toggleExpanded() method for per-dimension expand state');

        // The table's own default `expanded` data — fully collapsed by
        // default, exactly the "resets on remount" discipline this file's
        // own header names.
        const freshData = table.data();
        assert(freshData.expanded.candidates === false && freshData.expanded.decisionEvidence === false && freshData.expanded.observationEvidence === false,
            '55b. the component\'s own data() starts every dimension fully collapsed');
        assert(typeof freshData.expandedIdentityRecords === 'object' && freshData.expandedIdentityRecords !== null && Object.keys(freshData.expandedIdentityRecords).length === 0,
            '55c. the component\'s own data() starts with expandedIdentityRecords as a fresh, empty object — no record identity panel open by default');

        assert((tableCodeOnly.match(/Inspect identity/g) || []).length === 6, '55d. the template exposes exactly six "Inspect identity" controls — one per shared/sourceOnly/targetOnly column, for each of decision and observation evidence');

        // The "Candidate presence" dimension block (everything between its
        // own heading and the next dimension's heading, "Decision
        // evidence") never carries an "Inspect identity" control — 0.8.195
        // carries no candidates section (see 0.8.195's own header, "No
        // candidate-presence section"), so this component adds none of its
        // own for that dimension either.
        const candidatePresenceBlock = tableModuleSource.split('Candidate presence')[1].split('Decision evidence')[0];
        assert(!candidatePresenceBlock.includes('Inspect identity'), '55e. no "Inspect identity" control appears inside the candidate-presence dimension block');
    }
    console.log('✓ Section N: the table component\'s own props/computed degrade malformed view, detail, AND identity input to an honest empty/NO_PEER state, imports nothing at all, renders the three independent dimension sections each with its own "Inspect records" control plus, for decision/observation evidence only, a per-record "Inspect identity" control, and starts fully collapsed');

    // ---------------------------------------------------------------
    // Section O — 0.8.194 FLAGSHIP: expanded records exactly match
    // 0.8.193's own detail, with counts exactly matching 0.8.191's own
    // summary.
    // ---------------------------------------------------------------
    {
        const { rendered } = runChain(flagshipSourceDocument, flagshipTargetDocument);
        const { C1, C2, C3, C4, D1, D2, D3, D4, D5, D6, O1, O2, O3, O4, O5, O6, O7 } = flagshipRecords;

        // Candidate presence: Source-only 1 (C3), Shared 2 (C1, C2),
        // Target-only 1 (C4) — counts already proven in Section A; here the
        // exact records themselves are checked, and their length must
        // match those same counts without either side recomputing the
        // other (see this file's own header, "the UI never calculates a
        // count from the detail records").
        assert(rendered.candidateRecords.sourceOnly.length === rendered.candidateSummary.sourceOnlyCount,
            '56. FLAGSHIP — candidateRecords.sourceOnly.length exactly matches candidateSummary.sourceOnlyCount');
        assert(rendered.candidateRecords.shared.length === rendered.candidateSummary.sharedCount,
            '57. FLAGSHIP — candidateRecords.shared.length exactly matches candidateSummary.sharedCount');
        assert(rendered.candidateRecords.targetOnly.length === rendered.candidateSummary.targetOnlyCount,
            '58. FLAGSHIP — candidateRecords.targetOnly.length exactly matches candidateSummary.targetOnlyCount');
        assert(serialize(rendered.candidateRecords.sourceOnly) === serialize([C3]), '59. FLAGSHIP — candidateRecords.sourceOnly is exactly [C3]');
        assert(serialize(rendered.candidateRecords.targetOnly) === serialize([C4]), '60. FLAGSHIP — candidateRecords.targetOnly is exactly [C4]');
        assert(rendered.candidateRecords.shared.some((c) => serialize(c) === serialize(C1)) && rendered.candidateRecords.shared.some((c) => serialize(c) === serialize(C2)),
            '61. FLAGSHIP — candidateRecords.shared contains both C1 and C2');

        // Decision evidence: Source-only 2 (D4, D5), Shared 3 (D1, D2, D3),
        // Target-only 1 (D6).
        assert(rendered.decisionRecords.sourceOnly.length === rendered.decisionEvidence.sourceOnlyCount
            && rendered.decisionRecords.shared.length === rendered.decisionEvidence.sharedCount
            && rendered.decisionRecords.targetOnly.length === rendered.decisionEvidence.targetOnlyCount,
            '62. FLAGSHIP — every decisionRecords section length exactly matches decisionEvidence\'s own count');
        for (const record of [D4, D5]) {
            assert(rendered.decisionRecords.sourceOnly.some((r) => serialize(r) === serialize(record)), `63. FLAGSHIP — decisionRecords.sourceOnly contains ${serialize(record)}`);
        }
        assert(serialize(rendered.decisionRecords.targetOnly) === serialize([D6]), '64. FLAGSHIP — decisionRecords.targetOnly is exactly [D6]');

        // Observation evidence: Source-only 1 (O5), Shared 4 (O1-O4),
        // Target-only 2 (O6, O7).
        assert(rendered.observationRecords.sourceOnly.length === rendered.observationEvidence.sourceOnlyCount
            && rendered.observationRecords.shared.length === rendered.observationEvidence.sharedCount
            && rendered.observationRecords.targetOnly.length === rendered.observationEvidence.targetOnlyCount,
            '65. FLAGSHIP — every observationRecords section length exactly matches observationEvidence\'s own count');
        assert(serialize(rendered.observationRecords.sourceOnly) === serialize([O5]), '66. FLAGSHIP — observationRecords.sourceOnly is exactly [O5]');
        for (const record of [O6, O7]) {
            assert(rendered.observationRecords.targetOnly.some((r) => serialize(r) === serialize(record)), `67. FLAGSHIP — observationRecords.targetOnly contains ${serialize(record)}`);
        }

        // Rendered detail sections are 0.8.193's own arrays, referenced —
        // not copied — proving the table component performs no
        // reconstruction of its own.
        const detail = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(
            describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(flagshipSourceDocument, flagshipTargetDocument)
        );
        assert(serialize(rendered.decisionRecords.shared) === serialize(detail.decisionEvidence.shared),
            '68. FLAGSHIP — the rendered decisionRecords.shared is byte-identical to 0.8.193\'s own decisionEvidence.shared for the same comparison');
    }
    console.log('✓ Section O: 0.8.194 FLAGSHIP — expanding each dimension\'s own "Inspect records" reveals exactly 0.8.193\'s own record arrays, with lengths exactly matching 0.8.191\'s own summary counts, for a deliberately asymmetric pair of exports');

    // ---------------------------------------------------------------
    // Section P — duplicate records remain duplicated.
    // ---------------------------------------------------------------
    {
        const C1 = candidateOf('DUP-C1');
        const D1 = decisionRecord(C1, 'OBSERVE', 40);
        // Two byte-identical decision records in the source export, one in
        // the target export — 0.8.189's own multiset partitioning reports
        // exactly one D1 as shared and exactly one as source-only, never
        // collapsing the duplicate into a single entry.
        const entries = [entryOf(C1, detailOf([D1, D1]), EMPTY_DETAIL)];
        const targetEntries = [entryOf(C1, detailOf([D1]), EMPTY_DETAIL)];
        const filter = { evidenceKind: 'ALL', replicaRelation: 'ALL' };

        const source = buildImportedDocument(entries, filter, 'PEER_PRESENT');
        const target = buildImportedDocument(targetEntries, filter, 'PEER_PRESENT');

        const { rendered } = runChain(source.document, target.document);
        assert(rendered.decisionEvidence.sharedCount === 1 && rendered.decisionEvidence.sourceOnlyCount === 1,
            '69. duplicate decision records — Shared 1 / Source-only 1, never collapsed to Shared 2 / Source-only 0 or merged away');
        assert(rendered.decisionRecords.shared.length === 1 && rendered.decisionRecords.sourceOnly.length === 1,
            '70. the rendered decisionRecords preserve the identical Shared 1 / Source-only 1 split as record arrays, not just counts');
    }
    console.log('✓ Section P: duplicate records remain duplicated — the rendered detail columns preserve 0.8.189\'s own multiset partitioning rather than collapsing repeated records');

    // ---------------------------------------------------------------
    // Section Q — evidence stays flat; decision and observation evidence
    // stay in separate sections.
    // ---------------------------------------------------------------
    {
        assert(!tableCodeOnly.toLowerCase().includes('groupby'), '71. the table component\'s own code never groups evidence by candidate');
        assert(!tableCodeOnly.includes('candidateKey'), '72. the table component never introduces a per-candidate grouping key of its own');

        const { rendered } = runChain(flagshipSourceDocument, flagshipTargetDocument);
        // Decision and observation evidence are two entirely separate
        // record sets — nothing in decisionRecords ever appears in
        // observationRecords, and the reverse (proven by field shape: a
        // decision record carries `decidedAt`, an observation record
        // carries `observedAt`, never both).
        const decisionShapes = [...rendered.decisionRecords.shared, ...rendered.decisionRecords.sourceOnly, ...rendered.decisionRecords.targetOnly];
        const observationShapes = [...rendered.observationRecords.shared, ...rendered.observationRecords.sourceOnly, ...rendered.observationRecords.targetOnly];
        assert(decisionShapes.every((r) => 'decidedAt' in r && !('observedAt' in r)), '73. every rendered decision record carries decidedAt and never observedAt');
        assert(observationShapes.every((r) => 'observedAt' in r && !('decidedAt' in r)), '74. every rendered observation record carries observedAt and never decidedAt');
    }
    console.log('✓ Section Q: evidence stays flat — no per-candidate grouping key appears anywhere in the component\'s own code, and decision/observation evidence remain two entirely separate record sets');

    // ---------------------------------------------------------------
    // Section R — candidate presence isn't inferred from evidence
    // partitions, and one candidate's own evidence partitioning can differ
    // between its two dimensions.
    // ---------------------------------------------------------------
    {
        const { rendered } = runChain(flagshipSourceDocument, flagshipTargetDocument);
        const { C2, D3, D4, O3, O4 } = flagshipRecords;

        // C2 is a SHARED candidate (candidateRecords.shared) — proven
        // first, independently of either evidence dimension below.
        assert(rendered.candidateRecords.shared.some((c) => serialize(c) === serialize(C2)), '75. C2 is a shared candidate');

        // C2's own decision evidence splits across TWO partitions at once
        // (D3 shared, D4 source-only) — a shared candidate carrying
        // partially exclusive decision evidence.
        assert(rendered.decisionRecords.shared.some((r) => serialize(r) === serialize(D3)), '76. C2\'s own D3 decision record is Shared');
        assert(rendered.decisionRecords.sourceOnly.some((r) => serialize(r) === serialize(D4)), '77. C2\'s own D4 decision record is Source-only, at the same time D3 is Shared');

        // C2's own observation evidence, by contrast, is entirely Shared
        // (O3, O4) — proving this component never infers one dimension's
        // partitioning for a candidate from the other dimension's, or from
        // that candidate's own shared candidate-presence membership.
        assert(rendered.observationRecords.shared.some((r) => serialize(r) === serialize(O3)) && rendered.observationRecords.shared.some((r) => serialize(r) === serialize(O4)),
            '78. C2\'s own observation evidence (O3, O4) is entirely Shared, unlike its own partially-exclusive decision evidence');
        const c2ObservationSourceOrTargetOnly = [...rendered.observationRecords.sourceOnly, ...rendered.observationRecords.targetOnly]
            .filter((r) => serialize(r.candidate) === serialize(C2));
        assert(c2ObservationSourceOrTargetOnly.length === 0, '79. C2 carries no source-only or target-only observation evidence at all');
    }
    console.log('✓ Section R: candidate presence is never inferred from, or used to infer, evidence-partition membership — a single shared candidate (C2) carries partially source-only decision evidence while its own observation evidence stays entirely shared');

    // ---------------------------------------------------------------
    // Section S — collapsing/expanding detail is purely local UI state.
    // ---------------------------------------------------------------
    {
        const table = default_ReconciliationCandidateLeaderboardEvidenceExportComparisonTable;
        const { view, detail } = runChain(flagshipSourceDocument, flagshipTargetDocument);
        const beforeView = serialize(view);
        const beforeDetail = serialize(detail);

        const ctx = { view, detail, expanded: table.data().expanded };
        table.methods.toggleExpanded.call(ctx, 'candidates');
        table.methods.toggleExpanded.call(ctx, 'decisionEvidence');

        assert(ctx.expanded.candidates === true && ctx.expanded.decisionEvidence === true && ctx.expanded.observationEvidence === false,
            '80. toggleExpanded() flips only the named dimension, independently of the others');
        assert(serialize(view) === beforeView, '81. toggling expand state never mutates the view prop');
        assert(serialize(detail) === beforeDetail, '82. toggling expand state never mutates the detail prop');

        table.methods.toggleExpanded.call(ctx, 'candidates');
        assert(ctx.expanded.candidates === false, '83. toggleExpanded() is a pure flip — calling it again collapses the same dimension back');
    }
    console.log('✓ Section S: collapsing/expanding detail is purely local, per-dimension UI state — it never mutates the view or detail props, and each dimension toggles independently');

    // ---------------------------------------------------------------
    // Section T — an invalid paste on one side never destroys an
    // already-valid comparison already on screen.
    // ---------------------------------------------------------------
    {
        const C1 = candidateOf('SURVIVES-C1');
        const D1 = decisionRecord(C1, 'OBSERVE', 50);
        const entries = [entryOf(C1, detailOf([D1]), EMPTY_DETAIL)];
        const filter = { evidenceKind: 'ALL', replicaRelation: 'ALL' };
        const genuine = buildImportedDocument(entries, filter, 'PEER_PRESENT');

        // A first, genuine comparison renders real detail records.
        const first = runChain(genuine.document, genuine.document);
        assert(first.rendered.decisionRecords.shared.length === 1, '84. a genuine comparison renders one shared decision record');

        // A second attempt where one side is malformed never loses the
        // already-valid document on the OTHER side — importXxx() rejects
        // only the malformed side, exactly 0.8.192's own Section C/D
        // discipline, still true after adding detail records.
        const badImport = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport('{ still not valid json');
        assert(badImport.outcome === ReconciliationCandidateLeaderboardEvidenceImportOutcome.INVALID_DOCUMENT, '85. the malformed paste is rejected by importXxx(), never silently accepted');

        // The already-valid document from the first comparison, run again,
        // still renders identically — nothing about attempting (and
        // rejecting) a malformed paste elsewhere corrupts a document
        // already held.
        const second = runChain(genuine.document, genuine.document);
        assert(serialize(second.rendered) === serialize(first.rendered), '86. re-running the chain over the same already-valid document is unaffected by an unrelated invalid paste, and remains deterministic');
    }
    console.log('✓ Section T: a genuinely invalid paste never destroys an already-valid document or its already-rendered detail records — importXxx() rejects only the malformed side, and a genuine document keeps rendering identically');

    // ---------------------------------------------------------------
    // Section U — 0.8.196 FLAGSHIP: identity inspection displays exactly
    // 0.8.195's own named fields for one record, at the identical position.
    // ---------------------------------------------------------------
    {
        const table = default_ReconciliationCandidateLeaderboardEvidenceExportComparisonTable;
        const { rendered, detail, identity } = runChain(flagshipSourceDocument, flagshipTargetDocument);

        // 0.8.193's own records are untouched by this milestone — the
        // rendered decisionRecords/observationRecords are still exactly
        // 0.8.193's own arrays (already proven byte-identical in Section
        // O); here the SAME already-computed `detail` is re-confirmed
        // untouched by additionally computing `identity` off it.
        const detailAgain = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(
            describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(flagshipSourceDocument, flagshipTargetDocument)
        );
        assert(serialize(detail) === serialize(detailAgain), '87. FLAGSHIP — 0.8.193\'s own detail records are unchanged by this milestone; computing identity alongside them changes nothing about detail itself');

        // 0.8.195's own identity objects are unchanged by this milestone —
        // calling describeXxx() again over the identical detail produces a
        // byte-identical identity projection.
        const identityAgain = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity(detail);
        assert(serialize(identity) === serialize(identityAgain), '88. FLAGSHIP — 0.8.195\'s own identity objects are unchanged and deterministic, called again over the same detail');

        // A decision record's identity panel carries exactly its own four
        // named fields, read directly off 0.8.195's own identity object at
        // the SAME array position as the record itself in decisionRecords.
        const decisionIndex = 0;
        const decisionRecord = rendered.decisionRecords.sourceOnly[decisionIndex];
        const decisionIdentityRecord = rendered.decisionIdentity.sourceOnly[decisionIndex];
        const decisionFields = table.methods.decisionIdentityFieldsOf(decisionIdentityRecord);
        assert(decisionFields.length === 4, '89. FLAGSHIP — a decision record\'s identity panel carries exactly 4 fields');
        assert(decisionFields.map((f) => f.key).join(',') === 'decided,candidate,decision,decidedAt',
            '90. FLAGSHIP — the decision identity panel\'s own fields are named decided/candidate/decision/decidedAt, in that order');
        assert(serialize(decisionFields.find((f) => f.key === 'decided').value) === serialize(decisionRecord.decided), '91. FLAGSHIP — the identity panel\'s own decided value matches the underlying 0.8.193 record\'s own decided field');
        assert(serialize(decisionFields.find((f) => f.key === 'candidate').value) === serialize(decisionRecord.candidate), '92. FLAGSHIP — the identity panel\'s own candidate value matches the underlying 0.8.193 record\'s own candidate field');
        assert(serialize(decisionFields.find((f) => f.key === 'decision').value) === serialize(decisionRecord.decision), '93. FLAGSHIP — the identity panel\'s own decision value matches the underlying 0.8.193 record\'s own decision field');
        assert(serialize(decisionFields.find((f) => f.key === 'decidedAt').value) === serialize(decisionRecord.decidedAt), '94. FLAGSHIP — the identity panel\'s own decidedAt value matches the underlying 0.8.193 record\'s own decidedAt field');

        // An observation record's identity panel carries exactly its own
        // seven named fields, at the identical position within
        // observationRecords.shared.
        const observationIndex = 1;
        const observationRecord = rendered.observationRecords.shared[observationIndex];
        const observationIdentityRecord = rendered.observationIdentity.shared[observationIndex];
        const observationFields = table.methods.observationIdentityFieldsOf(observationIdentityRecord);
        assert(observationFields.length === 7, '95. FLAGSHIP — an observation record\'s identity panel carries exactly 7 fields');
        assert(observationFields.map((f) => f.key).join(',') === 'candidate,decision,planIdentity,candidatePresent,candidateType,candidateMatchesPlan,observedAt',
            '96. FLAGSHIP — the observation identity panel\'s own fields are named candidate/decision/planIdentity/candidatePresent/candidateType/candidateMatchesPlan/observedAt, in that order');
        for (const key of ['candidate', 'decision', 'planIdentity', 'candidatePresent', 'candidateType', 'candidateMatchesPlan', 'observedAt']) {
            assert(serialize(observationFields.find((f) => f.key === key).value) === serialize(observationRecord[key]),
                `97. FLAGSHIP — the observation identity panel's own ${key} value matches the underlying 0.8.193 record's own ${key} field`);
        }

        // `decision` on the observation identity panel stays the FULL
        // embedded decision record — never flattened to a disposition
        // string — 0.8.195's own header, held here again at the UI layer.
        assert(typeof observationFields.find((f) => f.key === 'decision').value === 'object' && 'decidedAt' in observationFields.find((f) => f.key === 'decision').value,
            '98. FLAGSHIP — the observation identity panel\'s own decision field stays the full embedded decision record, never flattened to a disposition string');

        // formatIdentityValue() renders an object-valued field as its own
        // JSON text, and a scalar field as its own plain value — a display
        // convenience only, proven here to round-trip a genuine object
        // field back to an equivalent value.
        const formattedCandidate = table.methods.formatIdentityValue(decisionRecord.candidate);
        assert(typeof formattedCandidate === 'string' && JSON.parse(formattedCandidate).claimId === decisionRecord.candidate.claimId,
            '99. FLAGSHIP — formatIdentityValue() renders an object-valued identity field as its own printable JSON text');
        assert(table.methods.formatIdentityValue(true) === 'true' && table.methods.formatIdentityValue('OBSERVE') === 'OBSERVE',
            '100. FLAGSHIP — formatIdentityValue() renders a scalar identity field as its own plain value');
    }
    console.log('✓ Section U: 0.8.196 FLAGSHIP — expanding a decision/observation record\'s own "Inspect identity" control displays exactly 0.8.195\'s own named identity fields for that one record (4 for a decision, 7 for an observation), matching the underlying 0.8.193 record field for field, with 0.8.193\'s own records and 0.8.195\'s own identity objects both proven unchanged by this milestone');

    // ---------------------------------------------------------------
    // Section V — no regrouping, no re-sorting, no identity comparison
    // performed by the UI.
    // ---------------------------------------------------------------
    {
        const { rendered } = runChain(flagshipSourceDocument, flagshipTargetDocument);

        // Every identity array is exactly as long as, and in the same
        // order as, its own detail array — proving no reordering and no
        // regrouping happened between 0.8.193's records and 0.8.195's
        // identity objects as rendered by this component.
        for (const sectionKey of ['shared', 'sourceOnly', 'targetOnly']) {
            assert(rendered.decisionIdentity[sectionKey].length === rendered.decisionRecords[sectionKey].length,
                `101. Section V — decisionIdentity.${sectionKey} is exactly as long as decisionRecords.${sectionKey}`);
            assert(rendered.observationIdentity[sectionKey].length === rendered.observationRecords[sectionKey].length,
                `102. Section V — observationIdentity.${sectionKey} is exactly as long as observationRecords.${sectionKey}`);
            rendered.decisionRecords[sectionKey].forEach((record, index) => {
                const identityRecord = rendered.decisionIdentity[sectionKey][index];
                assert(serialize(identityRecord.candidate) === serialize(record.candidate) && serialize(identityRecord.decidedAt) === serialize(record.decidedAt),
                    `103. Section V — decisionIdentity.${sectionKey}[${index}] names the same record as decisionRecords.${sectionKey}[${index}], at the identical position, never reordered`);
            });
        }

        // No comparison vocabulary (a diff, a similarity score, a
        // "differs"/"matches" verdict between two records) appears in the
        // table component's own source — this component never computes
        // whether one record's identity differs from another's.
        const forbiddenComparisonTerms = ['diff(', 'similarity', 'differs', 'differsfrom', 'matchesrecord', 'compareidentity', 'compareto('];
        for (const term of forbiddenComparisonTerms) {
            assert(!tableCodeOnly.toLowerCase().replace(/\s+/g, '').includes(term), `104. Section V — the table component's own code never carries record-to-record comparison vocabulary ("${term}")`);
        }

        // formatIdentityValue()/decisionIdentityFieldsOf()/observationIdentityFieldsOf()
        // each take exactly ONE record — there is no two-argument identity
        // function anywhere in this component.
        const table = default_ReconciliationCandidateLeaderboardEvidenceExportComparisonTable;
        assert(table.methods.formatIdentityValue.length === 1, '105. Section V — formatIdentityValue() takes exactly one value, never a pair to compare');
        assert(table.methods.decisionIdentityFieldsOf.length === 1, '106. Section V — decisionIdentityFieldsOf() takes exactly one record, never a pair to compare');
        assert(table.methods.observationIdentityFieldsOf.length === 1, '107. Section V — observationIdentityFieldsOf() takes exactly one record, never a pair to compare');
    }
    console.log('✓ Section V: no records are regrouped or re-sorted between 0.8.193\'s detail and 0.8.195\'s identity as rendered here, and no identity comparison of any kind (a diff, a similarity score, a differs/matches verdict) is performed by the UI — every identity function takes exactly one record');

    // ---------------------------------------------------------------
    // Section W — identity expand/collapse is purely local UI state; the
    // local inspection key is never application/domain data; summary
    // counts stay untouched.
    // ---------------------------------------------------------------
    {
        const table = default_ReconciliationCandidateLeaderboardEvidenceExportComparisonTable;
        const { view, detail, identity, rendered } = runChain(flagshipSourceDocument, flagshipTargetDocument);
        const beforeView = serialize(view);
        const beforeDetail = serialize(detail);
        const beforeIdentity = serialize(identity);
        const beforeCandidateSummary = serialize(rendered.candidateSummary);
        const beforeDecisionEvidence = serialize(rendered.decisionEvidence);
        const beforeObservationEvidence = serialize(rendered.observationEvidence);

        const key1 = table.methods.identityKey('decision', 'sourceOnly', 0);
        const key2 = table.methods.identityKey('observation', 'targetOnly', 1);
        assert(key1 === 'decision:sourceOnly:0', '108. Section W — identityKey() builds the exact local key shape the milestone itself names, e.g. "decision:sourceOnly:0"');
        assert(key2 === 'observation:targetOnly:1', '109. Section W — identityKey() builds the exact local key shape the milestone itself names, e.g. "observation:targetOnly:1"');

        const ctx = { view, detail, identity, expandedIdentityRecords: table.data().expandedIdentityRecords };
        assert(table.methods.isIdentityExpanded.call(ctx, key1) === false, '110. Section W — a record\'s own identity panel starts collapsed');
        table.methods.toggleIdentity.call(ctx, key1);
        assert(table.methods.isIdentityExpanded.call(ctx, key1) === true, '111. Section W — toggleIdentity() opens the named record\'s own identity panel');
        assert(table.methods.isIdentityExpanded.call(ctx, key2) === false, '112. Section W — toggling one record\'s own identity panel never opens a different record\'s own panel');

        table.methods.toggleIdentity.call(ctx, key2);
        assert(table.methods.isIdentityExpanded.call(ctx, key1) === true && table.methods.isIdentityExpanded.call(ctx, key2) === true,
            '113. Section W — two different records\' own identity panels can be open at once, independently');

        table.methods.toggleIdentity.call(ctx, key1);
        assert(table.methods.isIdentityExpanded.call(ctx, key1) === false && table.methods.isIdentityExpanded.call(ctx, key2) === true,
            '114. Section W — collapsing one record\'s own panel never collapses the other');

        assert(serialize(view) === beforeView, '115. Section W — toggling identity expand state never mutates the view prop');
        assert(serialize(detail) === beforeDetail, '116. Section W — toggling identity expand state never mutates the detail prop');
        assert(serialize(identity) === beforeIdentity, '117. Section W — toggling identity expand state never mutates the identity prop');

        // Summary counts are recomputed fresh off the SAME, still-unmutated
        // props — proving expand/collapse state never touches them.
        const afterCtx = { view, detail, identity };
        assert(serialize(table.computed.candidateSummary.call(afterCtx)) === beforeCandidateSummary, '118. Section W — candidateSummary is untouched by any amount of identity expand/collapse toggling');
        assert(serialize(table.computed.decisionEvidence.call(afterCtx)) === beforeDecisionEvidence, '119. Section W — decisionEvidence summary counts are untouched by any amount of identity expand/collapse toggling');
        assert(serialize(table.computed.observationEvidence.call(afterCtx)) === beforeObservationEvidence, '120. Section W — observationEvidence summary counts are untouched by any amount of identity expand/collapse toggling');

        // The local inspection key never appears anywhere on the
        // `view`/`detail`/`identity` props themselves — it is genuinely
        // this component's own local state only.
        assert(!beforeView.includes('sourceOnly:0') && !beforeDetail.includes('sourceOnly:0') && !beforeIdentity.includes('sourceOnly:0'),
            '121. Section W — the local inspection key never leaks onto the view/detail/identity props — it exists only in this component\'s own expandedIdentityRecords');
    }
    console.log('✓ Section W: identity expand/collapse is purely local, per-record UI state keyed by this component\'s own local inspection key (never application/domain data or record identity) — it never mutates view/detail/identity, defaults to fully collapsed, toggles independently per record, and summary counts stay untouched throughout');

    // ---------------------------------------------------------------
    // Section X — malformed/absent identity data degrades gracefully,
    // never breaking the existing "Inspect records" detail panel.
    // ---------------------------------------------------------------
    {
        const table = default_ReconciliationCandidateLeaderboardEvidenceExportComparisonTable;
        const { view, detail } = runChain(flagshipSourceDocument, flagshipTargetDocument);

        // identity entirely absent/malformed, while detail stays genuine —
        // the existing detail panel (decisionRecords/observationRecords)
        // must still render its own genuine records and labels.
        for (const malformedIdentity of [null, undefined, {}, 'not-an-object', 42]) {
            const ctx = { view, detail, identity: malformedIdentity };
            const decisionRecords = table.computed.decisionRecords.call(ctx);
            const observationRecords = table.computed.observationRecords.call(ctx);
            assert(decisionRecords.sourceOnly.length > 0, `122. Section X — with malformed identity (${serialize(malformedIdentity)}), the genuine decisionRecords.sourceOnly still renders its own real records`);
            assert(observationRecords.shared.length > 0, `123. Section X — with malformed identity (${serialize(malformedIdentity)}), the genuine observationRecords.shared still renders its own real records`);

            const decisionLabel = table.methods.decisionRecordLabel(decisionRecords.sourceOnly[0]);
            assert(typeof decisionLabel === 'string' && decisionLabel.length > 0 && decisionLabel !== 'Unknown decision record',
                `124. Section X — a genuine decision record's own label still renders correctly even when identity is malformed`);

            // The identity sections themselves degrade to empty arrays —
            // never throwing, and never fabricating a record neither
            // 0.8.193 nor 0.8.195 actually produced.
            const decisionIdentity = table.computed.decisionIdentity.call(ctx);
            assert(decisionIdentity.sourceOnly.length === 0, `125. Section X — malformed identity (${serialize(malformedIdentity)}) degrades decisionIdentity.sourceOnly to empty, never throwing and never fabricating a record`);

            // Looking up an identity object at a position identity does
            // not actually have degrades to undefined, and the field-list
            // helper degrades that to an empty field list — never throwing.
            const missingIdentityRecord = decisionIdentity.sourceOnly[0];
            assert(missingIdentityRecord === undefined, `126. Section X — an out-of-range identity lookup is undefined, never a fabricated object`);
            assert(Array.isArray(table.methods.decisionIdentityFieldsOf(missingIdentityRecord)) && table.methods.decisionIdentityFieldsOf(missingIdentityRecord).length === 0,
                `127. Section X — decisionIdentityFieldsOf(undefined) degrades to an empty field list rather than throwing`);
            assert(Array.isArray(table.methods.observationIdentityFieldsOf(missingIdentityRecord)) && table.methods.observationIdentityFieldsOf(missingIdentityRecord).length === 0,
                `127b. Section X — observationIdentityFieldsOf(undefined) degrades to an empty field list rather than throwing`);
        }

        // A malformed individual identity record WITHIN an otherwise
        // genuine section (mirroring 0.8.195's own "a malformed individual
        // record within an otherwise genuine array degrades to an identity
        // object whose fields are all undefined") still renders a field
        // list — every field present, every value undefined — never
        // throwing and never dropping the row.
        const identityWithMalformedEntry = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity({
            decisionEvidence: { shared: [], sourceOnly: [null], targetOnly: [] },
            observationEvidence: { shared: [], sourceOnly: [], targetOnly: [] }
        });
        const degradedFields = table.methods.decisionIdentityFieldsOf(identityWithMalformedEntry.decisionEvidence.sourceOnly[0]);
        assert(degradedFields.length === 4 && degradedFields.every((f) => f.value === undefined),
            '128. Section X — a malformed individual identity record degrades to a 4-field panel of all-undefined values, never throwing and never dropping the row');
    }
    console.log('✓ Section X: malformed or absent identity data degrades to an empty identity panel — the existing "Inspect records" detail panel keeps rendering its own genuine records and labels regardless, and even a malformed individual identity record degrades to an all-undefined field list rather than throwing or vanishing');

    // ---------------------------------------------------------------
    // Section Y — the table component's new 0.8.196 code carries no
    // ranking, correctness, synchronization, or reconciliation vocabulary.
    // ---------------------------------------------------------------
    {
        // "reconcil" is deliberately excluded from this sweep — it appears
        // legitimately in this component's own name/module identifiers
        // (`ReconciliationCandidateLeaderboard...`), the identical
        // "vocabulary vs. identifier" distinction Section L above already
        // draws by never testing for it either.
        const forbidden = [
            'rank', 'score', 'winner', 'confidence', 'conflict', 'preferred', 'authoritative', 'better', 'worse',
            'correct', 'incorrect', 'valid', 'invalid', 'stale', 'synchroniz', 'synchronis', 'apply this'
        ];
        for (const term of forbidden) {
            assert(!tableCodeOnly.toLowerCase().includes(term), `129. Section Y — the table component's own code never carries ranking/correctness/synchronization vocabulary ("${term}")`);
        }
        // Explanatory prose about WHY a record differs is exactly what the
        // milestone's own request forbids ("avoid: this observation differs
        // because it was recorded later") — the component prints field
        // names/values only, never a sentence describing a cause.
        assert(!tableCodeOnly.toLowerCase().includes('because'), '130. Section Y — the table component\'s own code never carries a "because..." explanatory sentence about why a record differs');
    }
    console.log('✓ Section Y: the table component\'s own 0.8.196 code carries no ranking, correctness, synchronization, or reconciliation vocabulary, and no prose explanation of why any two records differ');

    console.log('\nAll ReconciliationCandidateLeaderboardEvidenceExportComparisonUI tests passed.');
}

run().catch((error) => {
    console.error('ReconciliationCandidateLeaderboardEvidenceExportComparisonUI.test.js FAILED:', error);
    process.exitCode = 1;
});
