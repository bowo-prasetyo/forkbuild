// 0.8.192 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Table.
//
// 0.8.191 shaped an export-vs-export comparison into a small, page-ready
// object — one `isEmpty` flag, one `metadata` block, and three independent
// count triples (`candidateSummary`/`decisionEvidence`/`observationEvidence`).
// Nothing yet turns that object into pixels. This component is that
// hand-off, and nothing more — the identical role
// `ReconciliationCandidateLeaderboardTable.js` (0.8.180) already plays for
// 0.8.178's own page result, one layer up in the sibling (live-archive)
// leaderboard family:
//
//   0.8.191 Comparison View
//             │
//             ▼
//   0.8.192 THIS FILE — a projection renderer
//             │
//             ▼
//   Evidence Export Comparison table (on screen)
//
// A PROJECTION RENDERER, NOT A SECOND COMPARISON ENGINE — THE IDENTICAL
// DISCIPLINE `ReconciliationCandidateLeaderboardTable.js` ALREADY HOLDS.
// This file imports nothing from `application/`: it takes a `view` prop
// shaped exactly like 0.8.191's own result and renders it verbatim — no
// count is added, dropped, combined, or recomputed, and no dimension is
// checked against another. A caller that wants this table fed from two
// real exported documents composes 0.8.188's own `importXxx()` and 0.8.189/
// 0.8.190/0.8.191's own `describeXxx()` chain itself (see
// `ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js`)
// and hands the final result down as the `view` prop — this component
// never imports, parses, or validates a document of its own.
//
// THREE INDEPENDENT TABLES, NEVER ONE COMBINED STATUS — 0.8.189'S OWN
// FLAGSHIP DISTINCTION, HELD HERE AGAIN THREE LAYERS UP. Candidate
// presence, decision evidence, and observation evidence each render as
// their own, separate three-column table (Source-only / Shared /
// Target-only). Nothing in this file sums a row across tables, colors one
// table by another's counts, or renders a single verdict spanning all
// three — a reader sees three independent facts, never one interpretation
// of them.
//
// METADATA IS RENDERED AS PLAIN FACTS, NEVER PROSE. `metadata.
// comparisonState.source`/`target`/`same` and `metadata.filter.source`/
// `target`/`same` are printed as the same plain strings/booleans 0.8.189
// through 0.8.191 already established — never turned into "matching
// reports," "conflicting reports," or any other narrative label.
//
// MALFORMED/ABSENT `view` DEGRADES TO THE EMPTY STATE — NEVER THROWS. This
// component tolerates a `view` that is `null`, `undefined`, or missing a
// genuine `metadata`/`candidateSummary`/`decisionEvidence`/
// `observationEvidence` section the same way
// `ReconciliationCandidateLeaderboardTable.js` tolerates a malformed
// `page`: it degrades to the empty-state message rather than throwing.
//
// PURE PRESENTATION — NO COMPUTATION, NO IMPORT, NO COMPARISON, NO
// MUTATION. This component only ever reads the `view` prop it is handed.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Candidate-level expandable evidence records.** 0.8.189 deliberately
//   provides detailed record comparison; 0.8.190/0.8.191 deliberately
//   compress that into summary counts. This table respects that boundary —
//   there is no "Inspect Evidence" button here, and no per-record list
//   anywhere in this file. If detailed cross-export record inspection ever
//   becomes useful, it deserves its own, later projection — never a quiet
//   expansion of this one.
// - **A rank, score, winner, better/worse, correct/incorrect, conflict,
//   stale, confidence, or recommendation column of any kind.** Inherited
//   unchanged from every layer beneath this one.
// - **Persistence, synchronization, or archive/import access of any
//   kind.** This component only ever reads the `view` prop it is handed.

function isGenuineSection(value) {
    return Boolean(value) && typeof value === 'object';
}

const EMPTY_SECTION = Object.freeze({ sourceOnlyCount: 0, sharedCount: 0, targetOnlyCount: 0 });

function sectionOf(view, key) {
    const section = isGenuineSection(view) ? view[key] : undefined;
    return isGenuineSection(section) ? section : EMPTY_SECTION;
}

const DEFAULT_COMPARISON_STATE = Object.freeze({ source: 'NO_PEER', target: 'NO_PEER', same: true });
const DEFAULT_FILTER_SIDE = Object.freeze({ evidenceKind: 'ALL', replicaRelation: 'ALL' });
const DEFAULT_FILTER = Object.freeze({ source: DEFAULT_FILTER_SIDE, target: DEFAULT_FILTER_SIDE, same: true });

function comparisonStateOf(view) {
    const metadata = isGenuineSection(view) ? view.metadata : undefined;
    const raw = isGenuineSection(metadata) ? metadata.comparisonState : undefined;
    return isGenuineSection(raw) ? raw : DEFAULT_COMPARISON_STATE;
}

function filterSideOf(side) {
    return isGenuineSection(side) ? side : DEFAULT_FILTER_SIDE;
}

function filterOf(view) {
    const metadata = isGenuineSection(view) ? view.metadata : undefined;
    const raw = isGenuineSection(metadata) ? metadata.filter : undefined;
    if (!isGenuineSection(raw)) return DEFAULT_FILTER;
    return Object.freeze({
        source: filterSideOf(raw.source),
        target: filterSideOf(raw.target),
        same: typeof raw.same === 'boolean' ? raw.same : false
    });
}

export default {
    name: 'ReconciliationCandidateLeaderboardEvidenceExportComparisonTable',
    props: {
        view: { type: Object, default: null }
    },
    computed: {
        isEmpty() {
            if (!isGenuineSection(this.view)) return true;
            return typeof this.view.isEmpty === 'boolean' ? this.view.isEmpty : true;
        },
        comparisonState() {
            return comparisonStateOf(this.view);
        },
        filter() {
            return filterOf(this.view);
        },
        candidateSummary() {
            return sectionOf(this.view, 'candidateSummary');
        },
        decisionEvidence() {
            return sectionOf(this.view, 'decisionEvidence');
        },
        observationEvidence() {
            return sectionOf(this.view, 'observationEvidence');
        }
    },
    template: `
        <div class="evidence-export-comparison-table">
            <div class="evidence-export-comparison-metadata">
                <div class="evidence-export-comparison-metadata-block">
                    <span class="evidence-inspection-adapter-title">Comparison State</span>
                    <dl class="evidence-fields">
                        <div class="evidence-field"><dt>Source</dt><dd>{{ comparisonState.source }}</dd></div>
                        <div class="evidence-field"><dt>Target</dt><dd>{{ comparisonState.target }}</dd></div>
                        <div class="evidence-field"><dt>Same</dt><dd>{{ comparisonState.same ? 'yes' : 'no' }}</dd></div>
                    </dl>
                </div>
                <div class="evidence-export-comparison-metadata-block">
                    <span class="evidence-inspection-adapter-title">Filter</span>
                    <dl class="evidence-fields">
                        <div class="evidence-field"><dt>Source</dt><dd>{{ filter.source.evidenceKind }} / {{ filter.source.replicaRelation }}</dd></div>
                        <div class="evidence-field"><dt>Target</dt><dd>{{ filter.target.evidenceKind }} / {{ filter.target.replicaRelation }}</dd></div>
                        <div class="evidence-field"><dt>Same</dt><dd>{{ filter.same ? 'yes' : 'no' }}</dd></div>
                    </dl>
                </div>
            </div>

            <p v-if="isEmpty" class="empty-state">No candidates, decision evidence, or observation evidence in either export.</p>
            <template v-else>
                <div class="evidence-export-comparison-dimension">
                    <h4 class="evidence-detail-group-title">Candidate presence</h4>
                    <table class="evidence-export-comparison-dimension-table">
                        <thead><tr><th>Source-only</th><th>Shared</th><th>Target-only</th></tr></thead>
                        <tbody><tr><td>{{ candidateSummary.sourceOnlyCount }}</td><td>{{ candidateSummary.sharedCount }}</td><td>{{ candidateSummary.targetOnlyCount }}</td></tr></tbody>
                    </table>
                </div>

                <div class="evidence-export-comparison-dimension">
                    <h4 class="evidence-detail-group-title">Decision evidence</h4>
                    <table class="evidence-export-comparison-dimension-table">
                        <thead><tr><th>Source-only</th><th>Shared</th><th>Target-only</th></tr></thead>
                        <tbody><tr><td>{{ decisionEvidence.sourceOnlyCount }}</td><td>{{ decisionEvidence.sharedCount }}</td><td>{{ decisionEvidence.targetOnlyCount }}</td></tr></tbody>
                    </table>
                </div>

                <div class="evidence-export-comparison-dimension">
                    <h4 class="evidence-detail-group-title">Observation evidence</h4>
                    <table class="evidence-export-comparison-dimension-table">
                        <thead><tr><th>Source-only</th><th>Shared</th><th>Target-only</th></tr></thead>
                        <tbody><tr><td>{{ observationEvidence.sourceOnlyCount }}</td><td>{{ observationEvidence.sharedCount }}</td><td>{{ observationEvidence.targetOnlyCount }}</td></tr></tbody>
                    </table>
                </div>
            </template>
        </div>
    `
};
