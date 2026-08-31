// 0.8.201 — Explicit Record-Pair Selection UI.
//
// 0.8.198 through 0.8.200 built a complete, pure, application-layer chain
// that turns an EXPLICITLY SUPPLIED pairing of two records into named
// per-pair differences and a page-ready summary — but every one of those
// three files stops short of pixels on purpose (see each file's own
// header, "a UI where a human explicitly selects two records to pair (if
// ever built) is separate, later, UI-layer work"). This file is that
// hand-off, and nothing more: the control that lets a human actually BUILD
// an explicit pair by picking two records off the existing comparison
// page, and the panel that renders 0.8.200's own view of the result.
//
//   0.8.193 Comparison Detail  ──► record pools (this file reads FROM)
//                                        │
//                              a human picks two records
//                                        │
//                                        ▼
//                          0.8.198 Explicit Record Pairs
//                                        │
//                                        ▼
//                          0.8.197 Record Difference Projection
//                                        │
//                                        ▼
//                          0.8.199 Record Difference Read Model
//                                        │
//                                        ▼
//                          0.8.200 Paired Record Difference View
//                                        │
//                                        ▼
//                                     Browser
//
// A PROJECTION RENDERER AND A SELECTION CONTROL — NEVER THE PIPELINE
// ITSELF. This file imports nothing from `application/`, the identical
// zero-imports discipline `ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js`
// already holds. It never calls any of 0.8.198's, 0.8.197's, 0.8.199's, or
// 0.8.200's own `describeXxx()` functions — that entire chain is called
// exactly once each, in exactly that order, by
// `ui/views/ReconciliationCandidateLeaderboardEvidenceExportComparisonView.js`,
// which owns `explicitPairs` (the raw pairing state this component reads
// and requests changes to) and hands this component the chain's own final
// result as a `pairedView` prop. This component only ever reads the
// `detail`/`explicitPairs`/`pairedView` props it is handed and its own
// local pending-selection state.
//
// A HUMAN CHOOSES BOTH SIDES OF EVERY PAIR — NEVER AN AUTOMATIC OR
// SUGGESTED MATCH. The two `<select>` controls per dimension (Source
// record / Target record) list every decision or observation record
// 0.8.193 partitioned into that dimension's `shared`/`sourceOnly`/
// `targetOnly` arrays, POOLED FLAT and UNFILTERED — a record's own
// partition never hides it from selection, and no record is ever
// pre-selected, ranked, or suggested as a likely match. `addDecisionPair()`/
// `addObservationPair()` only ever build the pair a human has explicitly
// picked from both dropdowns; there is no `.find()`, no candidate-identity
// lookup, no timestamp comparison, and no other heuristic anywhere in this
// file — the identical "no automatic pairing" rule 0.8.197/0.8.198 already
// hold, held here again at the point where a human actually does the
// choosing.
//
// RECORD IDENTITY IS PRESERVED — A SELECTED RECORD IS THE ORIGINAL
// REFERENCE, NEVER CLONED. `recordAt()` below looks a chosen pool entry up
// by its own local key and returns 0.8.193's own record object unchanged;
// `add-decision-pair`/`add-observation-pair` are emitted with
// `{ source, target }` built from those same references, for the parent
// view to hand to 0.8.198 unmodified — the identical "supplied source/
// target are the original references" invariant 0.8.198's own header
// already documents.
//
// A PENDING SELECTION IS PURELY LOCAL, PRESENTATIONAL STATE — NEVER PART
// OF `explicitPairs` UNTIL "ADD PAIR" IS EXPLICITLY CLICKED.
// `pendingDecisionSourceKey`/`pendingDecisionTargetKey`/
// `pendingObservationSourceKey`/`pendingObservationTargetKey` (this
// component's own `data()`) track only which dropdown option is currently
// highlighted; nothing is added to `explicitPairs`, and no chain is run,
// until `addDecisionPair()`/`addObservationPair()` fires, on an explicit
// click. Adding a pair resets that dimension's own two pending keys back
// to unselected — the next pair starts from a clean pick, never from the
// previous pair's own leftover selection.
//
// SAME-RECORD AND DUPLICATE PAIRS ARE NEVER BLOCKED — INHERITED UNCHANGED
// FROM 0.8.198'S OWN "MULTIPLICITY REMAINS MEANINGFUL." A human may
// deliberately pick the same record as both source and target (to confirm
// it is self-identical), or add the identical pair more than once; this
// file performs no deduplication and no "these look the same" check of its
// own — "Add Pair" is enabled exactly when a source AND a target have both
// been picked, nothing more.
//
// EVERY PAIR ADDED REMAINS ADDED UNTIL EXPLICITLY REMOVED — NEVER
// AUTO-EXPIRED, NEVER RE-ORDERED. The pair list under each dimension
// renders `explicitPairs.decisionPairs`/`explicitPairs.observationPairs`
// verbatim, in the parent's own array order; `removeDecisionPair(index)`/
// `removeObservationPair(index)` ask the parent to drop exactly the pair at
// that position — this component never reorders, merges, or edits an
// already-added pair in place.
//
// THE RESULT PANEL RENDERS 0.8.200'S OWN FACTS, POSITION-FOR-POSITION
// AGAINST `explicitPairs` — NEVER A NEW COMPARISON. `pairedView.
// decisionDifferences[i]`/`observationDifferences[i]` is 0.8.200's own
// per-pair `{ differenceCount, differingFields }` summary; this component
// never recomputes it, and reads it strictly for display. The SOURCE/
// TARGET LABELS shown alongside that summary come from
// `explicitPairs.decisionPairs[i]`/`observationPairs[i]` — the ORIGINAL
// record references this component itself supplied when the pair was
// added — never from `pairedView` itself, which (0.8.199's own header,
// "reading a pair's own source/target," inherited unchanged through
// 0.8.200) never carries them. This positional correlation is safe only
// because 0.8.198 through 0.8.200 each preserve one entry per input pair,
// in the input pair's own order, without ever dropping a position — the
// exact invariant each of those files' own header documents ("every
// position in an input pair array still has exactly one corresponding
// position in the output array").
//
// A RECORD'S OWN CANDIDATE IS SHOWN ALONGSIDE IT, NEVER USED TO GROUP THE
// POOL. `candidateLabel()`/`decisionRecordLabel()`/`observationRecordLabel()`
// below are duplicated from `ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js`'s
// own functions of the same name, for the identical reason that file's own
// header already gives for its own duplication of 0.8.144's candidate-shape
// decoding: this component imports nothing, from `application/` or from any
// sibling `ui/` file. Every dropdown option and pair-list entry is
// labeled, never bucketed under a candidate's own heading — the pool stays
// the flat, cross-candidate list 0.8.193 already produces.
//
// MALFORMED/ABSENT `detail`/`explicitPairs`/`pairedView` DEGRADES TO AN
// EMPTY, DISABLED STATE — NEVER THROWS. An absent or malformed `detail`
// degrades both pools to `[]` (both dropdowns render only their own
// placeholder option, and "Add Pair" stays disabled); an absent or
// malformed `explicitPairs` degrades both pair lists to `[]`; an absent or
// malformed `pairedView` degrades the result panel to its own empty state.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any automatic, suggested, or ranked pairing.** See "A human chooses
//   both sides of every pair," above — the flagship constraint this
//   milestone exists to hold.
// - **Filtering, ranking, or reordering either dimension's own record
//   pool.** Every record 0.8.193 partitioned into `shared`/`sourceOnly`/
//   `targetOnly` for that dimension is selectable, in that same flat order.
// - **Editing an already-added pair in place, or deduplicating two pairs
//   that "look the same."** See "Every pair added remains added," above.
// - **Persisting `explicitPairs`, or the pending selection, across a
//   reload or across sessions.** Both stay page-local state, owned by the
//   parent view and this component respectively, exactly like every other
//   piece of state on this page.
// - **A rank, score, winner, correct/incorrect, valid, stale, preferred,
//   status, or confidence field or vocabulary of any kind.** Inherited
//   unchanged from every layer beneath this one.
// - **Calling any of 0.8.198's, 0.8.197's, 0.8.199's, or 0.8.200's own
//   `describeXxx()` directly.** See "A projection renderer and a selection
//   control," above — that chain is the parent view's own responsibility.

function isGenuineSection(value) {
    return Boolean(value) && typeof value === 'object';
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

// poolKey() — builds this component's own local, UI-only selection key
// (e.g. `sourceOnly:0`), identical in spirit to the Table component's own
// `identityKey()` — never read from, written onto, or compared against any
// `detail`/`explicitPairs`/`pairedView` record, and never used as record
// identity itself.
function poolKey(section, index) {
    return `${section}:${index}`;
}

// poolOf() — flattens one dimension's own `{ shared, sourceOnly,
// targetOnly }` arrays into a single, flat, selectable list — see this
// file's own header, "Filtering, ranking, or reordering... " (deliberately
// excluded). Every record stays labeled with its own originating section,
// purely for display; nothing about a record's section affects whether it
// is selectable.
function poolOf(records) {
    const entries = [];
    for (const section of ['sourceOnly', 'shared', 'targetOnly']) {
        records[section].forEach((record, index) => {
            entries.push({ key: poolKey(section, index), section, record });
        });
    }
    return entries;
}

function recordAt(pool, key) {
    const entry = pool.find((candidate) => candidate.key === key);
    return entry ? entry.record : undefined;
}

function pairsOf(explicitPairs, key) {
    const raw = isGenuineSection(explicitPairs) ? explicitPairs[key] : undefined;
    return Array.isArray(raw) ? raw : [];
}

function differencesOf(pairedView, key) {
    const raw = isGenuineSection(pairedView) ? pairedView[key] : undefined;
    return Array.isArray(raw) ? raw : [];
}

// candidateLabel()/decisionRecordLabel()/observationRecordLabel() —
// duplicated verbatim from
// ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js's own
// functions of the same name — see this file's own header, "A record's
// own candidate is shown alongside it."
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
    name: 'ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector',
    props: {
        detail: { type: Object, default: null },
        explicitPairs: { type: Object, default: null },
        pairedView: { type: Object, default: null }
    },
    emits: ['add-decision-pair', 'remove-decision-pair', 'add-observation-pair', 'remove-observation-pair'],
    data() {
        // Entirely local, presentational, never-persisted pending-selection
        // state — see this file's own header, "A pending selection is
        // purely local, presentational state."
        return {
            pendingDecisionSourceKey: '',
            pendingDecisionTargetKey: '',
            pendingObservationSourceKey: '',
            pendingObservationTargetKey: ''
        };
    },
    computed: {
        decisionPool() {
            return poolOf(recordsOf(this.detail, 'decisionEvidence'));
        },
        observationPool() {
            return poolOf(recordsOf(this.detail, 'observationEvidence'));
        },
        canAddDecisionPair() {
            return this.pendingDecisionSourceKey !== '' && this.pendingDecisionTargetKey !== '';
        },
        canAddObservationPair() {
            return this.pendingObservationSourceKey !== '' && this.pendingObservationTargetKey !== '';
        },
        decisionPairs() {
            return pairsOf(this.explicitPairs, 'decisionPairs');
        },
        observationPairs() {
            return pairsOf(this.explicitPairs, 'observationPairs');
        },
        decisionDifferences() {
            return differencesOf(this.pairedView, 'decisionDifferences');
        },
        observationDifferences() {
            return differencesOf(this.pairedView, 'observationDifferences');
        },
        isResultEmpty() {
            if (!isGenuineSection(this.pairedView)) return true;
            return typeof this.pairedView.isEmpty === 'boolean' ? this.pairedView.isEmpty : true;
        }
    },
    methods: {
        addDecisionPair() {
            if (!this.canAddDecisionPair) return;
            const source = recordAt(this.decisionPool, this.pendingDecisionSourceKey);
            const target = recordAt(this.decisionPool, this.pendingDecisionTargetKey);
            this.$emit('add-decision-pair', { source, target });
            this.pendingDecisionSourceKey = '';
            this.pendingDecisionTargetKey = '';
        },
        addObservationPair() {
            if (!this.canAddObservationPair) return;
            const source = recordAt(this.observationPool, this.pendingObservationSourceKey);
            const target = recordAt(this.observationPool, this.pendingObservationTargetKey);
            this.$emit('add-observation-pair', { source, target });
            this.pendingObservationSourceKey = '';
            this.pendingObservationTargetKey = '';
        },
        removeDecisionPair(index) {
            this.$emit('remove-decision-pair', index);
        },
        removeObservationPair(index) {
            this.$emit('remove-observation-pair', index);
        },
        candidateLabel,
        decisionRecordLabel,
        observationRecordLabel
    },
    template: `
        <div class="evidence-export-comparison-pairing">
            <h4 class="evidence-detail-group-title">Explicit Record Pairing</h4>
            <p class="reconciliation-leaderboard-note">
                Nothing here decides which records correspond — pick a source
                record and a target record yourself, from either export, in
                either partition, then add them as an explicit pair.
            </p>

            <div class="evidence-pair-selector">
                <h5>Decision evidence</h5>
                <div class="evidence-pair-selector-controls">
                    <label class="form-field">
                        <span class="form-label">Source record</span>
                        <select class="form-input" v-model="pendingDecisionSourceKey">
                            <option value="">Select a source record…</option>
                            <option v-for="entry in decisionPool" :key="'dps-' + entry.key" :value="entry.key">
                                {{ decisionRecordLabel(entry.record) }} ({{ entry.section }})
                            </option>
                        </select>
                    </label>
                    <label class="form-field">
                        <span class="form-label">Target record</span>
                        <select class="form-input" v-model="pendingDecisionTargetKey">
                            <option value="">Select a target record…</option>
                            <option v-for="entry in decisionPool" :key="'dpt-' + entry.key" :value="entry.key">
                                {{ decisionRecordLabel(entry.record) }} ({{ entry.section }})
                            </option>
                        </select>
                    </label>
                    <button type="button" class="action-btn action-btn--secondary" :disabled="!canAddDecisionPair" @click="addDecisionPair">
                        Add Pair
                    </button>
                </div>
                <ul v-if="decisionPairs.length > 0" class="evidence-pair-list">
                    <li v-for="(pair, index) in decisionPairs" :key="'ddp-' + index">
                        <span>{{ decisionRecordLabel(pair.source) }} ↔ {{ decisionRecordLabel(pair.target) }}</span>
                        <button type="button" class="action-btn action-btn--secondary evidence-pair-remove-btn" @click="removeDecisionPair(index)">Remove</button>
                    </li>
                </ul>
                <p v-else class="evidence-detail-empty">No decision pairs selected yet.</p>
            </div>

            <div class="evidence-pair-selector">
                <h5>Observation evidence</h5>
                <div class="evidence-pair-selector-controls">
                    <label class="form-field">
                        <span class="form-label">Source record</span>
                        <select class="form-input" v-model="pendingObservationSourceKey">
                            <option value="">Select a source record…</option>
                            <option v-for="entry in observationPool" :key="'ops-' + entry.key" :value="entry.key">
                                {{ observationRecordLabel(entry.record) }} ({{ entry.section }})
                            </option>
                        </select>
                    </label>
                    <label class="form-field">
                        <span class="form-label">Target record</span>
                        <select class="form-input" v-model="pendingObservationTargetKey">
                            <option value="">Select a target record…</option>
                            <option v-for="entry in observationPool" :key="'opt-' + entry.key" :value="entry.key">
                                {{ observationRecordLabel(entry.record) }} ({{ entry.section }})
                            </option>
                        </select>
                    </label>
                    <button type="button" class="action-btn action-btn--secondary" :disabled="!canAddObservationPair" @click="addObservationPair">
                        Add Pair
                    </button>
                </div>
                <ul v-if="observationPairs.length > 0" class="evidence-pair-list">
                    <li v-for="(pair, index) in observationPairs" :key="'odp-' + index">
                        <span>{{ observationRecordLabel(pair.source) }} ↔ {{ observationRecordLabel(pair.target) }}</span>
                        <button type="button" class="action-btn action-btn--secondary evidence-pair-remove-btn" @click="removeObservationPair(index)">Remove</button>
                    </li>
                </ul>
                <p v-else class="evidence-detail-empty">No observation pairs selected yet.</p>
            </div>

            <div class="evidence-pair-differences">
                <h5>Paired Record Differences</h5>
                <p v-if="isResultEmpty" class="evidence-detail-empty">No explicit pairs added yet, on either side.</p>
                <template v-else>
                    <div v-if="decisionDifferences.length > 0" class="evidence-pair-difference-group">
                        <h6>Decision pairs</h6>
                        <ul class="evidence-detail-list">
                            <li v-for="(summary, index) in decisionDifferences" :key="'ddd-' + index">
                                {{ decisionRecordLabel(decisionPairs[index] && decisionPairs[index].source) }} ↔ {{ decisionRecordLabel(decisionPairs[index] && decisionPairs[index].target) }}:
                                <span v-if="summary.differenceCount === 0">identical on every named field</span>
                                <span v-else>differs on {{ summary.differingFields.join(', ') }}</span>
                            </li>
                        </ul>
                    </div>
                    <div v-if="observationDifferences.length > 0" class="evidence-pair-difference-group">
                        <h6>Observation pairs</h6>
                        <ul class="evidence-detail-list">
                            <li v-for="(summary, index) in observationDifferences" :key="'odd-' + index">
                                {{ observationRecordLabel(observationPairs[index] && observationPairs[index].source) }} ↔ {{ observationRecordLabel(observationPairs[index] && observationPairs[index].target) }}:
                                <span v-if="summary.differenceCount === 0">identical on every named field</span>
                                <span v-else>differs on {{ summary.differingFields.join(', ') }}</span>
                            </li>
                        </ul>
                    </div>
                </template>
            </div>
        </div>
    `
};
