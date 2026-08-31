// 0.8.192/0.8.194 — Reconciliation Candidate Leaderboard Evidence Export
// Comparison Table, and its Detail extension.
//
// 0.8.191 shaped an export-vs-export comparison into a small, page-ready
// object — one `isEmpty` flag, one `metadata` block, and three independent
// count triples (`candidateSummary`/`decisionEvidence`/`observationEvidence`).
// 0.8.192 rendered that object as three summary tables and nothing more.
// 0.8.193 later built the record-level answer those summary numbers cannot
// give on their own — "which exact records account for this count?" — but
// stopped short of pixels on purpose. This file's 0.8.194 extension is that
// remaining hand-off: the SAME three summary tables 0.8.192 already draws,
// each now with an "Inspect records" control that reveals 0.8.193's own
// `shared`/`sourceOnly`/`targetOnly` record arrays for that one dimension —
// the identical role `ReconciliationCandidateEvidenceDetailPanel.js` (0.8.182)
// already plays for the sibling (live-archive) leaderboard family, one
// dimension at a time instead of one candidate at a time:
//
//   0.8.191 Comparison View ──┐
//                             ├─► 0.8.192/0.8.194 THIS FILE — a projection renderer
//   0.8.193 Comparison Detail ┘
//             │
//             ▼
//   Evidence Export Comparison table, with per-dimension record inspection (on screen)
//
// A PROJECTION RENDERER, NOT A SECOND COMPARISON ENGINE — THE IDENTICAL
// DISCIPLINE `ReconciliationCandidateLeaderboardTable.js` ALREADY HOLDS.
// This file imports nothing from `application/`: it takes a `view` prop
// shaped exactly like 0.8.191's own result and a `detail` prop shaped
// exactly like 0.8.193's own result, and renders each verbatim — no count is
// added, dropped, combined, or recomputed, and no record is fabricated from
// a count or vice versa. A caller that wants this table fed from two real
// exported documents composes 0.8.188's own `importXxx()` and the full
// 0.8.189/0.8.190/0.8.191/0.8.193 chain itself (see
// `ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js`)
// and hands both final results down as the `view`/`detail` props — this
// component never imports, parses, computes, or validates either one.
//
// THE UI NEVER CALCULATES A COUNT FROM THE DETAIL RECORDS, AND NEVER
// CALCULATES A RECORD FROM A COUNT. `view.candidateSummary.sharedCount` and
// `detail.candidates.shared.length` are two independently-computed facts
// that happen to agree because both trace back to the identical 0.8.189
// result — this file never reads `.length` off a `detail` array to display
// a count (the count column always renders `view`'s own count field), and
// never uses a `view` count to decide how many detail rows to show (the
// detail columns always render exactly `detail`'s own array, whatever its
// length). See `ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js`'s
// own header, "Both comparisonView and comparisonDetail are computed off
// the same comparison."
//
// THREE INDEPENDENT TABLES, NEVER ONE COMBINED STATUS — 0.8.189'S OWN
// FLAGSHIP DISTINCTION, HELD HERE AGAIN THREE LAYERS UP. Candidate
// presence, decision evidence, and observation evidence each render as
// their own, separate three-column table (Source-only / Shared /
// Target-only) with their own, separate "Inspect records" control.
// Expanding one dimension's records never expands, affects, or reveals
// anything about another dimension — a reader sees three independent
// facts, never one interpretation of them.
//
// DETAIL RECORDS STAY FLAT — NEVER REGROUPED BY CANDIDATE. Every record
// list this component renders is 0.8.193's own flat, cross-candidate array,
// in 0.8.193's own order — never sorted, never bucketed under a candidate's
// own heading. A record's own `candidate` field (present on every decision
// and observation record) is shown alongside that record, so a reader can
// still see which candidate it concerns, without this component ever using
// that field to GROUP its own output.
//
// EXPAND/COLLAPSE IS PURELY LOCAL, PRESENTATIONAL STATE — NEVER PERSISTED,
// NEVER AFFECTS `view`/`detail` THEMSELVES. `expanded` (this component's own
// `data()`) tracks only whether each of the three dimensions' own record
// columns are currently shown; toggling it triggers no computation, no
// network call, and no mutation of either prop — it resets to fully
// collapsed whenever this component remounts, exactly the "entirely local,
// presentational state" `expandedKeys` already holds on
// `ReconciliationCandidateLeaderboardTable.js`. Summary counts render
// immediately and unconditionally; detail records render only once their
// own dimension is expanded — the summary stays the primary surface even
// once a large export is loaded.
//
// CANDIDATE IDENTITY IS DECODED FOR DISPLAY ONLY — NEVER RE-DERIVED OR
// RE-COMPARED. `candidateLabel()` below duplicates
// `ReconciliationCandidateLeaderboardTable.js`'s own `describeCandidateLabel()`
// decoding (`{ type, claimId?, snapshotIndex? }` -> a short readable
// phrase), for the identical reason that file's own header already gives
// for its own duplication: this component imports nothing from
// `application/`, and nothing from any sibling `ui/` file either — every
// projection component in this family decodes a candidate's own shape for
// itself. Decoding a candidate for a text label never influences, and is
// never influenced by, `view`'s own counts or `detail`'s own partitioning.
//
// METADATA IS RENDERED AS PLAIN FACTS, NEVER PROSE. `metadata.
// comparisonState.source`/`target`/`same` and `metadata.filter.source`/
// `target`/`same` are printed as the same plain strings/booleans 0.8.189
// through 0.8.191 already established — never turned into "matching
// reports," "conflicting reports," or any other narrative label.
//
// MALFORMED/ABSENT `view`/`detail` DEGRADES TO THE EMPTY STATE — NEVER
// THROWS. This component tolerates a `view` or `detail` that is `null`,
// `undefined`, or missing a genuine section the same way
// `ReconciliationCandidateLeaderboardTable.js` tolerates a malformed
// `page`: it degrades to the empty-state message, or an empty record
// column, rather than throwing. A malformed `detail` never prevents a
// genuine `view` from rendering its own counts, and the reverse.
//
// PURE PRESENTATION — NO COMPUTATION, NO IMPORT, NO COMPARISON, NO
// MUTATION, BEYOND ITS OWN LOCAL EXPAND/COLLAPSE STATE. This component only
// ever reads the `view`/`detail` props it is handed and its own `expanded`
// data.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Regrouping the inspected evidence by candidate.** See "Detail records
//   stay flat," above — 0.8.193 already made the flat-pooling choice this
//   component preserves; a candidate-centric inspection view, if it ever
//   becomes useful, is separate, later, dedicated projection work.
// - **A rank, score, winner, better/worse, correct/incorrect, conflict,
//   stale, confidence, or recommendation column of any kind.** Inherited
//   unchanged from every layer beneath this one.
// - **Persistence, synchronization, or archive/import access of any
//   kind.** This component only ever reads the props it is handed and its
//   own local expand/collapse state.
// - **Recomputing a count from a detail array's own `.length`, or
//   fabricating a detail row from a count.** See "The UI never calculates a
//   count from the detail records," above.

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

const EMPTY_RECORDS = Object.freeze({
    shared: Object.freeze([]),
    sourceOnly: Object.freeze([]),
    targetOnly: Object.freeze([])
});

function recordsOf(detail, key) {
    const section = isGenuineSection(detail) ? detail[key] : undefined;
    if (!isGenuineSection(section)) return EMPTY_RECORDS;
    return Object.freeze({
        shared: Array.isArray(section.shared) ? section.shared : EMPTY_RECORDS.shared,
        sourceOnly: Array.isArray(section.sourceOnly) ? section.sourceOnly : EMPTY_RECORDS.sourceOnly,
        targetOnly: Array.isArray(section.targetOnly) ? section.targetOnly : EMPTY_RECORDS.targetOnly
    });
}

// candidateLabel() — duplicated from `ReconciliationCandidateLeaderboardTable.js`'s
// own `describeCandidateLabel()`, for the identical reason that file's own
// header already gives for its own duplication of 0.8.144's candidate-shape
// decoding: this component imports nothing, from `application/` or from any
// sibling `ui/` file.
export function candidateLabel(candidate) {
    if (!candidate || typeof candidate !== 'object') return 'Unknown candidate';
    if (candidate.type === 'DIVERGENT_CORRESPONDENCE') {
        return `Claim ${candidate.claimId} ↔ Snapshot #${candidate.snapshotIndex}`;
    }
    if (candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT') {
        return `Claim ${candidate.claimId} (no corresponding Snapshot)`;
    }
    if (candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM') {
        return `Snapshot #${candidate.snapshotIndex} (no corresponding Claim)`;
    }
    return 'Unknown candidate';
}

function formatWhen(isoString) {
    return typeof isoString === 'string' && isoString.length > 0 ? isoString : 'unknown time';
}

// decisionRecordLabel()/observationRecordLabel() — a record's own candidate
// is shown alongside it (per this milestone's own request, "display
// candidate information when available") without ever grouping records
// under that candidate's own heading — see this file's own header, "Detail
// records stay flat."
export function decisionRecordLabel(record) {
    if (!record || typeof record !== 'object') return 'Unknown decision record';
    const disposition = typeof record.decision === 'string' ? record.decision : 'UNKNOWN';
    return `${candidateLabel(record.candidate)} — ${disposition} — decided ${formatWhen(record.decidedAt)}`;
}

export function observationRecordLabel(record) {
    if (!record || typeof record !== 'object') return 'Unknown observation record';
    const decision = record.decision && typeof record.decision === 'object' ? record.decision : null;
    const disposition = decision && typeof decision.decision === 'string' ? decision.decision : 'UNKNOWN';
    return `${candidateLabel(record.candidate)} — ${disposition} — observed ${formatWhen(record.observedAt)}`;
}

export default {
    name: 'ReconciliationCandidateLeaderboardEvidenceExportComparisonTable',
    props: {
        view: { type: Object, default: null },
        detail: { type: Object, default: null }
    },
    data() {
        // Entirely local, presentational, never-persisted expand state —
        // see this file's own header, "Expand/collapse is purely local,
        // presentational state." Resets to fully collapsed on every mount.
        return {
            expanded: {
                candidates: false,
                decisionEvidence: false,
                observationEvidence: false
            }
        };
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
        },
        candidateRecords() {
            return recordsOf(this.detail, 'candidates');
        },
        decisionRecords() {
            return recordsOf(this.detail, 'decisionEvidence');
        },
        observationRecords() {
            return recordsOf(this.detail, 'observationEvidence');
        }
    },
    methods: {
        toggleExpanded(dimension) {
            this.expanded[dimension] = !this.expanded[dimension];
        },
        candidateLabel,
        decisionRecordLabel,
        observationRecordLabel
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
                    <button type="button" class="action-btn action-btn--secondary evidence-export-comparison-inspect-btn" @click="toggleExpanded('candidates')">
                        {{ expanded.candidates ? 'Hide records ▲' : 'Inspect records ▼' }}
                    </button>
                    <div v-if="expanded.candidates" class="evidence-detail-columns">
                        <div class="evidence-detail-column">
                            <h5>Source-only ({{ candidateRecords.sourceOnly.length }})</h5>
                            <p v-if="candidateRecords.sourceOnly.length === 0" class="evidence-detail-empty">None</p>
                            <ul v-else class="evidence-detail-list">
                                <li v-for="(record, index) in candidateRecords.sourceOnly" :key="'c-so-' + index">{{ candidateLabel(record) }}</li>
                            </ul>
                        </div>
                        <div class="evidence-detail-column">
                            <h5>Shared ({{ candidateRecords.shared.length }})</h5>
                            <p v-if="candidateRecords.shared.length === 0" class="evidence-detail-empty">None</p>
                            <ul v-else class="evidence-detail-list">
                                <li v-for="(record, index) in candidateRecords.shared" :key="'c-sh-' + index">{{ candidateLabel(record) }}</li>
                            </ul>
                        </div>
                        <div class="evidence-detail-column">
                            <h5>Target-only ({{ candidateRecords.targetOnly.length }})</h5>
                            <p v-if="candidateRecords.targetOnly.length === 0" class="evidence-detail-empty">None</p>
                            <ul v-else class="evidence-detail-list">
                                <li v-for="(record, index) in candidateRecords.targetOnly" :key="'c-to-' + index">{{ candidateLabel(record) }}</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="evidence-export-comparison-dimension">
                    <h4 class="evidence-detail-group-title">Decision evidence</h4>
                    <table class="evidence-export-comparison-dimension-table">
                        <thead><tr><th>Source-only</th><th>Shared</th><th>Target-only</th></tr></thead>
                        <tbody><tr><td>{{ decisionEvidence.sourceOnlyCount }}</td><td>{{ decisionEvidence.sharedCount }}</td><td>{{ decisionEvidence.targetOnlyCount }}</td></tr></tbody>
                    </table>
                    <button type="button" class="action-btn action-btn--secondary evidence-export-comparison-inspect-btn" @click="toggleExpanded('decisionEvidence')">
                        {{ expanded.decisionEvidence ? 'Hide records ▲' : 'Inspect records ▼' }}
                    </button>
                    <div v-if="expanded.decisionEvidence" class="evidence-detail-columns">
                        <div class="evidence-detail-column">
                            <h5>Source-only ({{ decisionRecords.sourceOnly.length }})</h5>
                            <p v-if="decisionRecords.sourceOnly.length === 0" class="evidence-detail-empty">None</p>
                            <ul v-else class="evidence-detail-list">
                                <li v-for="(record, index) in decisionRecords.sourceOnly" :key="'d-so-' + index">{{ decisionRecordLabel(record) }}</li>
                            </ul>
                        </div>
                        <div class="evidence-detail-column">
                            <h5>Shared ({{ decisionRecords.shared.length }})</h5>
                            <p v-if="decisionRecords.shared.length === 0" class="evidence-detail-empty">None</p>
                            <ul v-else class="evidence-detail-list">
                                <li v-for="(record, index) in decisionRecords.shared" :key="'d-sh-' + index">{{ decisionRecordLabel(record) }}</li>
                            </ul>
                        </div>
                        <div class="evidence-detail-column">
                            <h5>Target-only ({{ decisionRecords.targetOnly.length }})</h5>
                            <p v-if="decisionRecords.targetOnly.length === 0" class="evidence-detail-empty">None</p>
                            <ul v-else class="evidence-detail-list">
                                <li v-for="(record, index) in decisionRecords.targetOnly" :key="'d-to-' + index">{{ decisionRecordLabel(record) }}</li>
                            </ul>
                        </div>
                    </div>
                </div>

                <div class="evidence-export-comparison-dimension">
                    <h4 class="evidence-detail-group-title">Observation evidence</h4>
                    <table class="evidence-export-comparison-dimension-table">
                        <thead><tr><th>Source-only</th><th>Shared</th><th>Target-only</th></tr></thead>
                        <tbody><tr><td>{{ observationEvidence.sourceOnlyCount }}</td><td>{{ observationEvidence.sharedCount }}</td><td>{{ observationEvidence.targetOnlyCount }}</td></tr></tbody>
                    </table>
                    <button type="button" class="action-btn action-btn--secondary evidence-export-comparison-inspect-btn" @click="toggleExpanded('observationEvidence')">
                        {{ expanded.observationEvidence ? 'Hide records ▲' : 'Inspect records ▼' }}
                    </button>
                    <div v-if="expanded.observationEvidence" class="evidence-detail-columns">
                        <div class="evidence-detail-column">
                            <h5>Source-only ({{ observationRecords.sourceOnly.length }})</h5>
                            <p v-if="observationRecords.sourceOnly.length === 0" class="evidence-detail-empty">None</p>
                            <ul v-else class="evidence-detail-list">
                                <li v-for="(record, index) in observationRecords.sourceOnly" :key="'o-so-' + index">{{ observationRecordLabel(record) }}</li>
                            </ul>
                        </div>
                        <div class="evidence-detail-column">
                            <h5>Shared ({{ observationRecords.shared.length }})</h5>
                            <p v-if="observationRecords.shared.length === 0" class="evidence-detail-empty">None</p>
                            <ul v-else class="evidence-detail-list">
                                <li v-for="(record, index) in observationRecords.shared" :key="'o-sh-' + index">{{ observationRecordLabel(record) }}</li>
                            </ul>
                        </div>
                        <div class="evidence-detail-column">
                            <h5>Target-only ({{ observationRecords.targetOnly.length }})</h5>
                            <p v-if="observationRecords.targetOnly.length === 0" class="evidence-detail-empty">None</p>
                            <ul v-else class="evidence-detail-list">
                                <li v-for="(record, index) in observationRecords.targetOnly" :key="'o-to-' + index">{{ observationRecordLabel(record) }}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </template>
        </div>
    `
};
