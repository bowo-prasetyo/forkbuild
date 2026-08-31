import { ref, computed } from 'vue';
import {
    ReconciliationCandidateLeaderboardEvidenceImportOutcome,
    importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetailView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentityView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairsView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView.js';
import ReconciliationCandidateLeaderboardEvidenceExportComparisonTable from '../components/ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js';
import ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector from '../components/ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector.js';

// 0.8.192/0.8.194/0.8.196/0.8.201 — Reconciliation Candidate Leaderboard
// Evidence Export Comparison UI, its Detail extension, its Identity
// Inspection extension, and its Explicit Record-Pair Selection extension.
//
// 0.8.189/0.8.190/0.8.191/0.8.193/0.8.195 built a complete, pure,
// application-layer chain that turns two already-exported evidence
// documents into a small, page-ready summary, the exact records behind it,
// AND each record's own identity named field by field — but every one of
// those five files stops short of pixels on purpose (see each file's own
// header, "Any markup, DOM nodes, or control-rendering technology
// choice... separate, later, UI-layer work"). This is that UI-layer work,
// and nothing more — 0.8.192 first wired the summary half; 0.8.194 wired
// the record-detail half onto the SAME page; 0.8.196 wires the record-
// identity half onto the SAME page again, per the milestone's own
// instruction ("this should not replace 0.8.193's records — it should
// provide an additional inspection layer"):
//
//   Source Evidence Export JSON ──┐
//                                 ├─► 0.8.188 importXxx() (twice, once per side)
//   Target Evidence Export JSON ──┘         │
//                                            ▼
//                              0.8.189 describeXxx() (comparison)
//                                            │
//                              ┌─────────────┴─────────────┐
//                              ▼                            ▼
//                 0.8.190 describeXxx() (read model)   0.8.193 describeXxx() (detail)
//                              │                            │
//                              ▼                            ├──────────────┐
//                 0.8.191 describeXxx() (view)               │              ▼
//                              │                            │   0.8.195 describeXxx() (record identity)
//                              ▼                            ▼              │
//                     ReconciliationCandidateLeaderboardEvidenceExportComparisonTable ◄┘
//                                            │
//                                            ▼
//                                         Browser
//
// `comparisonView`, `comparisonDetail`, AND `comparisonIdentity` ARE EACH
// COMPUTED OFF `comparison`/`comparisonDetail` — NEVER OFF ONE ANOTHER'S
// SIBLING. 0.8.193's own header is explicit that it "reads 0.8.189's own
// result directly... never 0.8.190's own read model or 0.8.191's own
// view," precisely so the counts a reader sees and the records that same
// reader can expand are never at risk of drifting apart through some
// intermediate reshaping. This file honors that by calling
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail()`
// over `comparison.value` — the identical 0.8.189 result `readModel`/
// `comparisonView` are themselves computed from — never over `readModel`
// or `comparisonView`. 0.8.195's own header is equally explicit that its
// one argument is always 0.8.193's own already-computed result, so
// `comparisonIdentity` below is computed over `comparisonDetail.value`
// directly — never over `comparison.value`, `readModel.value`, or
// `comparisonView.value` — the identical one-argument contract 0.8.195's
// own file already documents.
//
// TWO EXPLICIT TEXT INPUTS, ONE EXPLICIT "COMPARE" CLICK — NEVER A LIVE
// RECOMPUTATION ON EVERY KEYSTROKE. `sourceExportText`/`targetExportText`
// are page-local, never-persisted refs a person types or pastes into;
// nothing is imported, compared, or rendered until `compareEvidence()`
// fires, on an explicit click — the identical "never on every keystroke,
// and never automatically" discipline `usePeerArchive()`/
// `importEvidenceExport()` already hold on
// `ReconciliationCandidateLeaderboardView.js`.
//
// EACH SIDE IS VALIDATED THROUGH 0.8.188'S OWN `importXxx()` INDEPENDENTLY
// — NEVER A NEW VALIDATION ALGORITHM, AND NEVER ONE SIDE BLOCKING THE
// OTHER. `compareEvidence()` calls `importXxx()` once for
// `sourceExportText.value` and once for `targetExportText.value`. A side
// whose text fails validation (malformed JSON, wrong `protocolVersion`, any
// other structural defect 0.8.188 already rejects) leaves THAT side's own
// `sourceDocument`/`targetDocument` completely untouched and sets only
// `sourceInvalid`/`targetInvalid` — the identical "an invalid paste never
// quietly resets an already-supplied genuine value" discipline
// `usePeerArchive()`/`importEvidenceExport()` already hold, applied
// independently to each of the two sides here: a malformed Target paste
// never prevents a genuinely valid Source from being used, and vice versa.
//
// THE COMPARISON CHAIN IS CALLED OVER `sourceDocument`/`targetDocument` —
// NEVER OVER THE RAW TEXT, AND NEVER RE-IMPLEMENTED. `comparison`,
// `readModel`, and `comparisonView` below are three `computed()` values
// forming the exact 0.8.189 -> 0.8.190 -> 0.8.191 chain, each calling the
// next layer's own `describeXxx()` over the previous layer's own already-
// computed result, unchanged. This file performs no evidence partitioning,
// no count tallying, and no presentation shaping of its own — every fact
// on screen is one of those three functions' own fact, read verbatim.
// `sourceDocument`/`targetDocument` may be `null` (nothing validated yet,
// on either or both sides) — 0.8.189's own `describeXxx()` already
// degrades a `null`/`undefined` export to an honest, empty comparison
// rather than throwing, so `comparisonView` is always a genuine, renderable
// object, never `null`.
//
// TWO SEPARATE, PORTABLE DOCUMENTS — NEVER A THIRD ARCHIVE, AND NEVER
// MERGED INTO THE LIVE LEADERBOARD. This file never imports
// `PublicationObservationArchive`, never injects
// `publicationObservationArchiveStorage`, and never reads or writes
// `sourceArchive`/`targetArchive`/`page`/`evidenceDetail` — the entirely
// separate state `ReconciliationCandidateLeaderboardView.js` owns. Neither
// `sourceDocument` nor `targetDocument` here ever becomes "the current
// archive," is ever persisted, or ever feeds back into the live
// leaderboard comparison — this is 0.8.189's own "a comparison, not a
// reconciliation" boundary, held here again at the UI layer: LIVE ARCHIVE
// COMPARISON and EVIDENCE-EXPORT COMPARISON are two distinct concepts,
// neither silently feeding the other.
//
// SUMMARY, RECORD DETAIL, AND RECORD IDENTITY ON THE SAME PAGE — NEVER A
// REGROUP BY CANDIDATE. This view hands `comparisonView.value` (0.8.191's
// own compact counts), `comparisonDetail.value` (0.8.193's own record
// arrays), AND `comparisonIdentity.value` (0.8.195's own named-field
// identity objects) straight to
// `ReconciliationCandidateLeaderboardEvidenceExportComparisonTable`, which
// renders the three independent summary-count tables 0.8.192 already
// established, each now with its own "Inspect records" control that reveals
// 0.8.193's own flat `shared`/`sourceOnly`/`targetOnly` arrays for that one
// dimension, and (for decision/observation evidence only) each individual
// record now with its own "Inspect identity" control that reveals 0.8.195's
// own named fields for that one record — never a candidate-centric
// regrouping of that evidence. If a reader eventually needs candidate-
// centric inspection, that is a separate, explicit projection, not a silent
// change to this flat one (0.8.193's own header, "Evidence stays flat,"
// held here again at the UI layer).
//
// 0.8.201 — EXPLICIT RECORD-PAIR SELECTION IS A FOURTH, INDEPENDENT CHAIN
// OFF `comparisonDetail`, NEVER OFF `comparisonIdentity`. `explicitPairs`
// (this file's own new page-local ref, `{ decisionPairs: [], observationPairs: [] }`)
// starts empty and only ever changes through `addDecisionPair()`/
// `removeDecisionPair()`/`addObservationPair()`/`removeObservationPair()`
// below, each fired by an event
// `ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector`
// emits — this view never builds a pair itself, only stores the pair the
// component reports a human already built. `explicitRecordPairs`,
// `recordDifferences`, `recordDifferenceReadModel`, and
// `pairedRecordDifferenceView` below are four more `computed()` values,
// forming the exact 0.8.198 -> 0.8.197 -> 0.8.199 -> 0.8.200 chain, each
// reading only the previous layer's own already-computed result — the
// identical "each layer forks off its own stated source, never a sibling"
// discipline the 0.8.189 -> 0.8.190 -> 0.8.191 chain and the 0.8.193 ->
// 0.8.195 fork already hold above. This chain starts at `explicitPairs`
// itself, not at `comparisonDetail` — the record POOL a human picks from
// is `comparisonDetail`'s own arrays (read directly by the selector
// component below), but the PAIR a human builds is independent, page-local
// state with no further dependency on `comparison`/`readModel`/
// `comparisonView`/`comparisonIdentity`.
//
// SYNCHRONOUS, NO NETWORK, NO PERSISTENCE. `compareEvidence()` never
// contacts a server (no `fetch`/`XMLHttpRequest`/`WebSocket` anywhere in
// this file) and never writes to `localStorage`/`sessionStorage`/any
// storage adapter — `sourceExportText`/`targetExportText`/
// `sourceDocument`/`targetDocument` live only in this component's own
// page-local reactive state; reloading the page loses all of it, on
// purpose, exactly like `peerArchiveText`/`importedEvidenceText` already do
// on `ReconciliationCandidateLeaderboardView.js`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Merging, synchronizing, or reconciling the two exported documents.**
//   See "Two separate, portable documents," above — `sourceOnly`/
//   `targetOnly` describe absence from one document, never a correction to
//   apply.
// - **Reading either live archive, or any live-archive comparison.** This
//   view's only inputs are two pasted evidence-export documents.
// - **Regrouping the inspected evidence, or the inspected identity, by
//   candidate.** See "Summary, record detail, and record identity on the
//   same page," above — the flat shape stays flat.
// - **A rank, score, winner, correct/incorrect, valid, stale, preferred,
//   status, or confidence field or vocabulary of any kind.** Inherited
//   unchanged from every layer beneath this one.
// - **Persistence of either pasted document, or of the comparison itself,
//   anywhere.** See "Synchronous, no network, no persistence," above.
// - **Automatically pairing, suggesting, or ranking a candidate pair.**
//   Every entry in `explicitPairs` is a pair a human built by hand through
//   the selector component's own two dropdowns — see 0.8.201's own header,
//   above.
// - **Persistence of `explicitPairs` across a reload or across sessions.**
//   `clearComparison()` now also resets `explicitPairs` back to empty,
//   exactly like every other piece of comparison state on this page.
// - **A top-nav entry point.** Reached by URL only, the identical
//   "reached from elsewhere, never top-nav" shape 0.8.180's own
//   `/reconciliation-leaderboard` route already holds — see
//   `ui/router/index.js`.
export default {
    name: 'ReconciliationCandidateLeaderboardEvidenceExportComparisonView',
    components: {
        ReconciliationCandidateLeaderboardEvidenceExportComparisonTable,
        ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector
    },
    setup() {
        // Page-local, never-persisted paste state — two entirely
        // independent textareas, never a single combined field.
        const sourceExportText = ref('');
        const targetExportText = ref('');

        // Page-local, never-persisted imported-document state. Each starts
        // `null` (nothing validated yet) and only ever changes through
        // `compareEvidence()` below, on an explicit click, and only on its
        // own side — see this file's own header, "Each side is validated
        // through 0.8.188's own importXxx() independently."
        const sourceDocument = ref(null);
        const targetDocument = ref(null);
        const sourceInvalid = ref(false);
        const targetInvalid = ref(false);
        const hasCompared = ref(false);

        function compareEvidence() {
            const sourceResult = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(sourceExportText.value);
            if (sourceResult.outcome === ReconciliationCandidateLeaderboardEvidenceImportOutcome.IMPORTED) {
                sourceDocument.value = sourceResult.document;
                sourceInvalid.value = false;
            } else {
                sourceInvalid.value = true;
            }

            const targetResult = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(targetExportText.value);
            if (targetResult.outcome === ReconciliationCandidateLeaderboardEvidenceImportOutcome.IMPORTED) {
                targetDocument.value = targetResult.document;
                targetInvalid.value = false;
            } else {
                targetInvalid.value = true;
            }

            hasCompared.value = true;
        }

        // 0.8.201 — Page-local, never-persisted explicit-pairing state. See
        // this file's own header, "Explicit record-pair selection is a
        // fourth, independent chain." This view never builds a pair itself
        // — each handler below only ever appends/removes the exact pair the
        // selector component reports a human already built.
        const explicitPairs = ref({ decisionPairs: [], observationPairs: [] });

        function clearComparison() {
            sourceExportText.value = '';
            targetExportText.value = '';
            sourceDocument.value = null;
            targetDocument.value = null;
            sourceInvalid.value = false;
            targetInvalid.value = false;
            hasCompared.value = false;
            explicitPairs.value = { decisionPairs: [], observationPairs: [] };
        }

        function addDecisionPair(pair) {
            explicitPairs.value = {
                ...explicitPairs.value,
                decisionPairs: [...explicitPairs.value.decisionPairs, pair]
            };
        }

        function removeDecisionPair(index) {
            explicitPairs.value = {
                ...explicitPairs.value,
                decisionPairs: explicitPairs.value.decisionPairs.filter((_, entryIndex) => entryIndex !== index)
            };
        }

        function addObservationPair(pair) {
            explicitPairs.value = {
                ...explicitPairs.value,
                observationPairs: [...explicitPairs.value.observationPairs, pair]
            };
        }

        function removeObservationPair(index) {
            explicitPairs.value = {
                ...explicitPairs.value,
                observationPairs: explicitPairs.value.observationPairs.filter((_, entryIndex) => entryIndex !== index)
            };
        }

        // The 0.8.189 -> 0.8.190 -> 0.8.191 chain, unchanged, each reading
        // only the previous layer's own already-computed result — see this
        // file's own header, "The comparison chain is called over
        // sourceDocument/targetDocument." `comparisonDetail` forks off
        // `comparison` directly, exactly as the diagram above draws — it is
        // never computed from `readModel` or `comparisonView`. `comparisonIdentity`
        // is then computed off `comparisonDetail` directly — 0.8.195's own
        // one-argument contract — never off `comparison`, `readModel`, or
        // `comparisonView`.
        const comparison = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceDocument.value, targetDocument.value));
        const readModel = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(comparison.value));
        const comparisonView = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView(readModel.value));
        const comparisonDetail = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonDetail(comparison.value));
        const comparisonIdentity = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity(comparisonDetail.value));

        // 0.8.201 — The 0.8.198 -> 0.8.197 -> 0.8.199 -> 0.8.200 chain,
        // each reading only the previous layer's own already-computed
        // result, starting from `explicitPairs` (this file's own new
        // page-local state, above) rather than from `comparison`/
        // `comparisonDetail` — see this file's own header, "Explicit
        // record-pair selection is a fourth, independent chain."
        const explicitRecordPairs = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs(explicitPairs.value));
        const recordDifferences = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference(explicitRecordPairs.value));
        const recordDifferenceReadModel = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(recordDifferences.value));
        const pairedRecordDifferenceView = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView(recordDifferenceReadModel.value));

        return {
            sourceExportText, targetExportText,
            sourceInvalid, targetInvalid, hasCompared,
            compareEvidence, clearComparison,
            comparisonView, comparisonDetail, comparisonIdentity,
            explicitPairs, addDecisionPair, removeDecisionPair, addObservationPair, removeObservationPair,
            pairedRecordDifferenceView
        };
    },
    template: `
        <section class="evidence-export-comparison-view reconciliation-leaderboard-view">
            <h1>Evidence Export Comparison</h1>
            <p class="reconciliation-leaderboard-note">
                Compare two previously exported evidence reports — a report from
                last week against one from today, or a report you exported
                against one a peer sent you. This never reads either replica's
                own live archive and never merges into, replaces, or recomputes
                the Reconciliation Candidate Leaderboard — it is a comparison
                between two separate, portable documents, nothing more.
            </p>

            <div class="evidence-inspection-adapter">
                <span class="evidence-inspection-adapter-title">Source Evidence Export</span>
                <label class="form-field">
                    <span class="form-label">Source evidence export JSON</span>
                    <textarea class="form-input identity-export-json" rows="6" v-model="sourceExportText"
                              placeholder="Paste a source evidence export document JSON"></textarea>
                </label>
                <p v-if="sourceInvalid" class="identity-unlock-error">
                    This is not a valid evidence export document — the Source side was not updated.
                </p>
            </div>

            <div class="evidence-inspection-adapter">
                <span class="evidence-inspection-adapter-title">Target Evidence Export</span>
                <label class="form-field">
                    <span class="form-label">Target evidence export JSON</span>
                    <textarea class="form-input identity-export-json" rows="6" v-model="targetExportText"
                              placeholder="Paste a target evidence export document JSON"></textarea>
                </label>
                <p v-if="targetInvalid" class="identity-unlock-error">
                    This is not a valid evidence export document — the Target side was not updated.
                </p>
            </div>

            <div class="identity-mgmt-actions">
                <button type="button" class="action-btn action-btn--secondary" @click="compareEvidence">
                    Compare Evidence
                </button>
                <button type="button" class="action-btn action-btn--secondary" v-if="hasCompared" @click="clearComparison">
                    Clear Comparison
                </button>
            </div>

            <ReconciliationCandidateLeaderboardEvidenceExportComparisonTable v-if="hasCompared" :view="comparisonView" :detail="comparisonDetail" :identity="comparisonIdentity" />

            <ReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairSelector
                v-if="hasCompared"
                :detail="comparisonDetail"
                :explicit-pairs="explicitPairs"
                :paired-view="pairedRecordDifferenceView"
                @add-decision-pair="addDecisionPair"
                @remove-decision-pair="removeDecisionPair"
                @add-observation-pair="addObservationPair"
                @remove-observation-pair="removeObservationPair"
            />
        </section>
    `
};
