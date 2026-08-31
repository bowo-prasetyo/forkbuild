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
import ReconciliationCandidateLeaderboardEvidenceExportComparisonTable from '../components/ReconciliationCandidateLeaderboardEvidenceExportComparisonTable.js';

// 0.8.192 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// UI.
//
// 0.8.189/0.8.190/0.8.191 built a complete, pure, application-layer chain
// that turns two already-exported evidence documents into a small,
// page-ready comparison — but every one of those three files stops short of
// pixels on purpose (see each file's own header, "Any markup, DOM nodes, or
// control-rendering technology choice... separate, later, UI-layer work").
// This is that UI-layer work, and nothing more — the second, independent
// workflow 0.8.191's own request named:
//
//   Source Evidence Export JSON ──┐
//                                 ├─► 0.8.188 importXxx() (twice, once per side)
//   Target Evidence Export JSON ──┘         │
//                                            ▼
//                              0.8.189 describeXxx() (comparison)
//                                            │
//                                            ▼
//                              0.8.190 describeXxx() (read model)
//                                            │
//                                            ▼
//                              0.8.191 describeXxx() (view)
//                                            │
//                                            ▼
//                     ReconciliationCandidateLeaderboardEvidenceExportComparisonTable
//                                            │
//                                            ▼
//                                         Browser
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
// NO CANDIDATE-LEVEL EXPANDABLE EVIDENCE — THE SAME DELIBERATE BOUNDARY
// 0.8.191'S OWN HEADER AND THE COMPONENT THIS VIEW RENDERS BOTH HOLD. This
// view hands `comparisonView.value` straight to
// `ReconciliationCandidateLeaderboardEvidenceExportComparisonTable`, which
// renders three independent summary-count tables and nothing more — no
// "Inspect Evidence" button, no per-record list, exactly 0.8.191's own
// compressed shape. Detailed cross-export record inspection, if it ever
// becomes useful, is separate, later, dedicated projection work.
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
// - **Candidate-level expandable evidence records.** See "No
//   candidate-level expandable evidence," above.
// - **A rank, score, winner, correct/incorrect, valid, stale, preferred,
//   status, or confidence field or vocabulary of any kind.** Inherited
//   unchanged from every layer beneath this one.
// - **Persistence of either pasted document, or of the comparison itself,
//   anywhere.** See "Synchronous, no network, no persistence," above.
// - **A top-nav entry point.** Reached by URL only, the identical
//   "reached from elsewhere, never top-nav" shape 0.8.180's own
//   `/reconciliation-leaderboard` route already holds — see
//   `ui/router/index.js`.
export default {
    name: 'ReconciliationCandidateLeaderboardEvidenceExportComparisonView',
    components: { ReconciliationCandidateLeaderboardEvidenceExportComparisonTable },
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

        function clearComparison() {
            sourceExportText.value = '';
            targetExportText.value = '';
            sourceDocument.value = null;
            targetDocument.value = null;
            sourceInvalid.value = false;
            targetInvalid.value = false;
            hasCompared.value = false;
        }

        // The 0.8.189 -> 0.8.190 -> 0.8.191 chain, unchanged, each reading
        // only the previous layer's own already-computed result — see this
        // file's own header, "The comparison chain is called over
        // sourceDocument/targetDocument."
        const comparison = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparison(sourceDocument.value, targetDocument.value));
        const readModel = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonReadModel(comparison.value));
        const comparisonView = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonView(readModel.value));

        return {
            sourceExportText, targetExportText,
            sourceInvalid, targetInvalid, hasCompared,
            compareEvidence, clearComparison,
            comparisonView
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

            <ReconciliationCandidateLeaderboardEvidenceExportComparisonTable v-if="hasCompared" :view="comparisonView" />
        </section>
    `
};
