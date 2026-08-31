import { ref, reactive, computed, inject } from 'vue';
import { PublicationObservationArchive } from '../../application/PublicationObservationArchive.js';
import {
    importPublicationObservationArchive,
    PublicationObservationArchiveImportOutcome
} from '../../application/PublicationObservationArchiveExport.js';
import {
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage.js';
import {
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetailView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState.js';
import {
    ReconciliationCandidateLeaderboardEvidenceKind,
    ReconciliationCandidateLeaderboardReplicaRelation,
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetailView.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport.js';
import {
    ReconciliationCandidateLeaderboardEvidenceImportOutcome,
    importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport,
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport
} from '../../application/PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport.js';
import ReconciliationCandidateLeaderboardTable from '../components/ReconciliationCandidateLeaderboardTable.js';

// 0.8.181 — Explicit Peer Archive Leaderboard Comparison.
//
// 0.8.180 wired this replica's own real archive all the way through to a
// rendered leaderboard, but `targetArchive` was `PublicationObservationArchive
// .empty()`, full stop — no seam existed anywhere in the running app to
// supply a genuinely different second archive, so every row's counts
// necessarily landed entirely in `sourceOnlyCount`. This milestone adds
// exactly one thing: a way for a person to supply a REAL peer archive
// explicitly, so `targetArchive` can, for the first time, be something
// other than an honest absence.
//
//   sourceArchive (this replica's own, durable, unchanged) ──┐
//                                                             ├─► 0.8.179 reconstructXxx() ─► page
//   targetArchive (PublicationObservationArchive.empty() ────┘
//                  until a person explicitly supplies a peer's own
//                  exported archive below — never fetched, never
//                  synchronized, never fabricated)
//
// THE SUPPLY MECHANISM IS 0.8.82'S OWN `importPublicationObservationArchive()`,
// REUSED VERBATIM — NOT A NEW COMPARISON ALGORITHM, NOT A NEW ARCHIVE
// ADAPTER. That function already does exactly what a peer archive needs
// here: validate an externally-supplied JSON payload and, for a genuine
// one, reconstruct a real `PublicationObservationArchive` instance via
// `fromJSON()`. This file calls it exactly once, from `usePeerArchive()`,
// on an explicit click — never on every keystroke, and never
// automatically.
//
// THIS IS INSPECTION'S OWN "NEVER BECOMES THE ACTIVE ARCHIVE" DISCIPLINE
// (0.8.86), HELD HERE FOR A SECOND, INDEPENDENT REASON. 0.8.86 drew the
// line between IMPORT (replaces `sourceArchive`, persisted) and INSPECT
// (a read-only look at an external archive, never persisted, never
// assigned over the current one) because those are genuinely different
// actions on the SAME replica's own archive. This milestone needs a third
// action again barred from ever becoming "the current archive": the
// pasted JSON becomes `targetArchive` — a second, independent, real
// archive this comparison reads ALONGSIDE `sourceArchive` — and nothing
// here ever calls `publicationObservationArchiveStorage.save()` on it, or
// on `sourceArchive` either. Closing this tab and reopening the page
// returns `targetArchive` to `PublicationObservationArchive.empty()`
// every time; only a person's own peer archive, from wherever they keep
// it, ever makes it real again.
//
// NO SYNCHRONIZATION. Supplying a peer archive here never merges it into
// `sourceArchive`, never writes anything to `sourceArchive`'s own
// storage, and never produces a "combined" or "reconciled" archive of any
// kind — see 0.8.169's own boundary, held here one layer up: this
// milestone answers "what does this replica's evidence look like compared
// with that replica's?", never "how should these replicas be
// reconciled?". `sourceArchive` and `targetArchive` are each read, never
// written, by every function this file calls.
//
// NO NEW EVIDENCE COMPUTATION, NO NEW WRAPPER VOCABULARY. `page` is still
// exactly 0.8.179's own `reconstructXxx()` result, called exactly once,
// handed straight to the table component unchanged — the identical
// "reconstructXxx() obtains the fact, the renderer only ever displays it"
// split every projection in this family already holds. Neither the
// evidence agreement (0.8.176), the read model (0.8.177), nor the page
// view (0.8.178) changed to make this possible — both were already
// capable of taking two genuine archives; only this view's own
// `targetArchive` was ever hardcoded.
//
// MALFORMED PEER INPUT IS REJECTED, NEVER SILENTLY TREATED AS EMPTY.
// `usePeerArchive()` re-checks `importPublicationObservationArchive()`'s
// own `outcome` and, for `INVALID_ARCHIVE`, leaves `targetArchive`
// completely untouched — a bad paste never quietly resets a
// already-supplied genuine peer archive back to empty, and never gets
// treated as "the peer replica has nothing recorded." `peerArchiveInvalid`
// exists only to surface that rejection on screen.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Rank, score, winner, conflict status, or any judgment about which
//   archive is correct.** Inherited unchanged from every layer beneath
//   this one — see 0.8.176's own flagship restraint.
// - **Automatic synchronization, merging, or a "Fix"/"Sync" action of any
//   kind.** See "No synchronization," above.
// - **Discovering or fetching a peer's archive over the network.** A real
//   peer-discovery/exchange feature is separate, later work; this
//   milestone's own supply mechanism is a person's own explicit paste,
//   exactly like every other external-archive seam this codebase already
//   has (Compare Fingerprint, Import Archive, Inspect Archive).
// - **Persisting the supplied peer archive anywhere.** It lives only in
//   this component's own page-local `targetArchive` ref; reloading the
//   page loses it, on purpose.
// - **Pagination or visual polish of the leaderboard table itself.**
//   Unchanged, real, separately sized, later work. (Evidence filtering
//   itself arrived in 0.8.184 — see below.)
//
// 0.8.182 — Reconciliation Candidate Evidence Detail View adds exactly one
// more computed value on top of the above, `evidenceDetail`, obtained by
// calling 0.8.182's own `reconstructXxx()` over the IDENTICAL
// `sourceArchive`/`targetArchive.value` this view already hands to 0.8.179's
// own `reconstructXxx()` for `page` — never a third archive, never a
// different pair. Swapping the peer archive (`usePeerArchive()`/
// `clearPeerArchive()`, unchanged from 0.8.181) recomputes `page` and
// `evidenceDetail` together, from the same two archives, so a row's own
// counts and its own expanded detail can never drift out of sync with each
// other after a peer archive is supplied or cleared.
//
// 0.8.183 — Reconciliation Candidate Leaderboard Comparison State adds
// exactly one more computed value on top of the above, `comparisonState`,
// obtained by calling 0.8.183's own `describeXxx()` over this view's own
// `hasPeerArchive` ref and `targetArchive.value` — the IDENTICAL two
// pieces of state 0.8.181 already tracked, never a third. `hasPeerArchive`
// already distinguished "no peer supplied" from "a peer was explicitly
// supplied" at the click-handler level (`usePeerArchive()`/
// `clearPeerArchive()`, both unchanged); this milestone's only new step is
// naming that distinction explicitly — `NO_PEER` / `PEER_EMPTY` /
// `PEER_PRESENT` — and handing it to the template and the table so a
// reader never mistakes "no peer supplied" for "an explicitly supplied
// peer that happens to have nothing recorded." No evidence count anywhere
// in `page`/`evidenceDetail` changes because of `comparisonState`; it is a
// parallel fact, read once, alongside them.
//
// 0.8.184 — Reconciliation Candidate Evidence Filter Projection adds
// exactly one more computed value on top of the above, `filteredPage`,
// obtained by calling 0.8.184's own `describeXxx()` over this view's own
// `page` (unchanged, 0.8.179's own result) and two new, page-local refs —
// `evidenceKindFilter`/`replicaRelationFilter` — driven by two new
// dropdowns in the template below. `page` ITSELF IS NEVER REASSIGNED OR
// FILTERED IN PLACE — see 0.8.184's own header, "`filter` narrows
// `page.rows` — it never mutates `page` itself." `filteredPage`, not
// `page`, is what gets handed down to
// `ReconciliationCandidateLeaderboardTable` as its own `page` prop; the
// table renders whatever page-shaped object it is given without knowing,
// or needing to know, that a filter was ever applied — exactly the way it
// already renders 0.8.179's own unfiltered `page` today. `evidenceDetail`
// itself (0.8.182's own computed value) is untouched by filtering — see
// 0.8.185, immediately below, for what a reader now sees when they
// actually open a surviving row's own detail panel.
//
// 0.8.185 — Reconciliation Candidate Filtered Evidence Detail Projection
// adds exactly one more computed value on top of the above,
// `filteredEvidenceDetail`, obtained by calling 0.8.185's own
// `describeXxx()` over this view's own `evidenceDetail` (unchanged,
// 0.8.182's own result) and the SAME two filter refs `filteredPage`
// already reads — `evidenceKindFilter`/`replicaRelationFilter` — never a
// third, independent filter selection. `evidenceDetail` ITSELF IS NEVER
// REASSIGNED — see 0.8.185's own header, "the original 0.8.182 detail
// remains unchanged." `filteredEvidenceDetail`, not `evidenceDetail`, is
// what gets handed down to `ReconciliationCandidateLeaderboardTable` as
// its own `evidence-detail` prop; the table (and the detail panel it
// renders) needed no change of their own at all to render a filtered
// result, because 0.8.185's own result is shaped exactly like 0.8.182's —
// `{ candidateCount, candidates: [{ candidate, decisionDetail,
// observationDetail }] }` — so a reader who filters the leaderboard down
// to, say, Observations + Target-only and then opens a surviving row's
// own "Inspect Evidence" panel sees only the observation records that
// made that row survive, never the candidate's full, unfiltered detail.
//
// 0.8.187 — Reconciliation Candidate Leaderboard Evidence Export UI
// Integration adds exactly one more computed value, `evidenceExport`, and
// one click handler, `exportEvidence()`, on top of everything above. This
// is the "download/export button" 0.8.186's own header deliberately left
// for later — a UI action, never a fourth comparison algorithm.
//
//   filteredEvidenceDetail (0.8.185) ──┐
//   filter selection (0.8.184's own vocabulary, read a THIRD time) ──┤
//   comparisonState (0.8.183) ─────────┴──► 0.8.186's own describeXxx()
//                                                       │
//                                                       ▼
//                                          evidenceExport (this milestone)
//                                                       │
//                                                       ▼
//                                              a `data:` URI a person
//                                              clicks to download
//
// `evidenceExport` CALLS 0.8.186'S OWN `describeXxx()` — NOT ITS OWN
// `reconstructXxx()`. This view already holds the exact three facts
// `reconstructXxx()` would otherwise have to recompute from the two
// archives (`filteredEvidenceDetail`, the SAME `evidenceKindFilter`/
// `replicaRelationFilter` pair `filteredPage`/`filteredEvidenceDetail`
// themselves already read, and `comparisonState`) — calling `describeXxx()`
// directly hands 0.8.186 those already-computed facts unchanged rather
// than reading either archive a further time. This is precisely the
// milestone's own request: the export is downstream of filtering and
// detail projection, never a second, independent evidence-selection
// algorithm.
//
// EXPORTING NEVER RECOMPUTES, RE-FILTERS, OR RE-DERIVES ANYTHING. Clicking
// "Export Evidence" does not calculate an evidence count, filter a
// candidate, inspect either archive, compare an observation, deduplicate a
// record, sort a candidate, or construct an export record — every one of
// those questions was already answered by 0.8.184/0.8.185/0.8.183 before
// this milestone's own code runs at all. `exportEvidence()` only ever:
// (1) calls 0.8.186's own `describeXxx()` over the three already-computed
// facts above, (2) serializes the result with `JSON.stringify()`, and
// (3) builds a `data:` URI from that JSON — reused verbatim from
// `DecentralizedPublicationsView.js`'s own "Export Archive" shape (a
// person clicks a real link to save the file; nothing here triggers a
// download programmatically, contacts a server, or persists the peer
// archive).
//
// 0.8.183'S NO_PEER/PEER_EMPTY DISTINCTION SURVIVES INTO THE EXPORT
// UNCHANGED. `comparisonState.value` — the same computed value the
// template already branches its Peer Archive hint text on — is forwarded
// to `describeXxx()` exactly as it stands; an export produced under
// `NO_PEER` and one produced under `PEER_EMPTY` can hold byte-identical
// (empty) `candidates` while the document itself still says which one it
// was, never collapsing the two into one indistinguishable empty export.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. Automatic export on every
// filter change, clipboard synchronization, server upload, and scheduled
// export are each a separate, later concern — see 0.8.186's own header,
// "no UI in this milestone," now resolved by exactly this much UI and no
// more.
//
// 0.8.188 — Reconciliation Candidate Leaderboard Evidence Export Import
// adds exactly one more page-local, never-persisted piece of state,
// `importedEvidenceSummary`, and one click handler, `importEvidenceExport()`
// — the read side of the export this view has offered since 0.8.187.
//
//   importedEvidenceText (a person's own paste) ──► 0.8.188's own importXxx()
//                                                              │
//                                                    { outcome, document }
//                                                              │
//                                                    0.8.188's own describeXxx()
//                                                              │
//                                                              ▼
//                                              importedEvidenceSummary
//                                        (comparisonState, candidateCount,
//                                         decisionRecordCount,
//                                         observationRecordCount)
//
// IMPORTING NEVER TOUCHES `sourceArchive`/`targetArchive`, `page`, OR
// `evidenceDetail`. An imported document is READ-ONLY INSPECTION OF A
// SEPARATE, PORTABLE FACT — never a third archive, never merged into the
// live comparison, and never assigned over `filteredPage`/
// `filteredEvidenceDetail`. This is the identical "never becomes the
// active archive" boundary 0.8.181's own `usePeerArchive()` already holds
// for a peer archive, held here again for an imported evidence document:
// the live leaderboard remains `sourceArchive + targetArchive -> live
// comparison`; an imported document remains its own, entirely separate,
// `portable evidence document -> read-only inspection`. Nothing in this
// milestone reads `PublicationObservationArchive`, recomputes evidence
// agreement, or calls 0.8.176/0.8.177/0.8.182/0.8.184/0.8.185 a further
// time.
//
// `importEvidenceExport()` CALLS 0.8.188'S OWN `importXxx()` EXACTLY ONCE,
// ON AN EXPLICIT CLICK — NEVER ON EVERY KEYSTROKE, AND NEVER
// AUTOMATICALLY. A genuine document produces a summary via 0.8.188's own
// `describeXxx()`, called exactly once over `importXxx()`'s own already-
// validated `document`; an `INVALID_DOCUMENT` outcome leaves
// `importedEvidenceSummary` completely untouched and only sets
// `importedEvidenceInvalid` — the identical "a bad paste never quietly
// resets an already-imported genuine document" discipline `usePeerArchive()`
// already holds for a peer archive.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. Merging an imported document
// into the live leaderboard, re-validating any decision or observation it
// carries, comparing it against `sourceArchive`/`targetArchive`, and
// persisting it anywhere are each explicitly out of scope — see this
// file's own header, "Importing never touches," above, and 0.8.188's own
// module header for the full architectural boundary.
export const RECONCILIATION_CANDIDATE_LEADERBOARD_EVIDENCE_KIND_OPTIONS = [
    { value: ReconciliationCandidateLeaderboardEvidenceKind.ALL, label: 'All' },
    { value: ReconciliationCandidateLeaderboardEvidenceKind.DECISIONS, label: 'Decisions' },
    { value: ReconciliationCandidateLeaderboardEvidenceKind.OBSERVATIONS, label: 'Observations' }
];

export const RECONCILIATION_CANDIDATE_LEADERBOARD_REPLICA_RELATION_OPTIONS = [
    { value: ReconciliationCandidateLeaderboardReplicaRelation.ALL, label: 'All' },
    { value: ReconciliationCandidateLeaderboardReplicaRelation.SHARED, label: 'Shared' },
    { value: ReconciliationCandidateLeaderboardReplicaRelation.SOURCE_ONLY, label: 'Source-only' },
    { value: ReconciliationCandidateLeaderboardReplicaRelation.TARGET_ONLY, label: 'Target-only' }
];
export default {
    name: 'ReconciliationCandidateLeaderboardView',
    components: { ReconciliationCandidateLeaderboardTable },
    setup() {
        const publicationObservationArchiveStorage = inject('publicationObservationArchiveStorage', null);
        const sourceArchive = publicationObservationArchiveStorage
            ? publicationObservationArchiveStorage.load()
            : PublicationObservationArchive.empty();

        // Page-local, never-persisted peer archive state. `targetArchive`
        // starts exactly as 0.8.180 left it — an honest
        // `PublicationObservationArchive.empty()` — and only ever becomes
        // something else through `usePeerArchive()` below, on an explicit
        // click.
        const peerArchiveText = ref('');
        const targetArchive = ref(PublicationObservationArchive.empty());
        const hasPeerArchive = ref(false);
        const peerArchiveInvalid = ref(false);

        // The one place this file calls 0.8.82's own
        // `importPublicationObservationArchive()` — exactly once per
        // click, never on every keystroke. A genuine payload becomes the
        // new `targetArchive`; an invalid one is rejected and leaves
        // whatever `targetArchive` already held untouched.
        function usePeerArchive() {
            const outcome = importPublicationObservationArchive(peerArchiveText.value);
            if (outcome.outcome === PublicationObservationArchiveImportOutcome.IMPORTED) {
                targetArchive.value = outcome.archive;
                hasPeerArchive.value = true;
                peerArchiveInvalid.value = false;
            } else {
                peerArchiveInvalid.value = true;
            }
        }

        // Returns to the honest-empty default — never a mode of
        // `usePeerArchive()` itself, always its own explicit click.
        function clearPeerArchive() {
            targetArchive.value = PublicationObservationArchive.empty();
            peerArchiveText.value = '';
            hasPeerArchive.value = false;
            peerArchiveInvalid.value = false;
        }

        const page = computed(() => reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, targetArchive.value));
        const evidenceDetail = computed(() => reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(sourceArchive, targetArchive.value));

        // 0.8.183 — the explicit NO_PEER / PEER_EMPTY / PEER_PRESENT fact,
        // read from the identical `hasPeerArchive`/`targetArchive` this view
        // already tracks. Never a third archive, never a new evidence
        // computation — see this file's own header, "0.8.183," above.
        const comparisonState = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(hasPeerArchive.value, targetArchive.value));

        // 0.8.184 — page-local, never-persisted filter selection. Defaults
        // to ALL/ALL, the identity projection — see 0.8.184's own
        // `describeXxx()` header, "`replicaRelation: 'ALL'` means 'do not
        // filter by relation at all.'" `filteredPage` recomputes whenever
        // either selection changes, or whenever `page` itself does (a new
        // peer archive supplied/cleared) — always over `page`'s own current
        // value, never a stale one.
        const evidenceKindFilter = ref(ReconciliationCandidateLeaderboardEvidenceKind.ALL);
        const replicaRelationFilter = ref(ReconciliationCandidateLeaderboardReplicaRelation.ALL);
        const filteredPage = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(
            page.value,
            { evidenceKind: evidenceKindFilter.value, replicaRelation: replicaRelationFilter.value }
        ));

        // 0.8.185 — the SAME two filter refs above, read a second time, to
        // narrow WHICH RECORDS `evidenceDetail`'s own per-candidate
        // `decisionDetail`/`observationDetail` lists may show, so an
        // "Inspect Evidence" panel opened under a row that survived the
        // current filter shows only the records compatible with that
        // filter — never the full, unfiltered detail 0.8.182 alone would
        // show. `evidenceDetail` itself (0.8.182's own result) is never
        // reassigned or mutated — see 0.8.185's own header, "the original
        // 0.8.182 detail remains unchanged." There is no third filter
        // ref: the single Evidence Filter box above the table drives both
        // `filteredPage` and `filteredEvidenceDetail` at once.
        const filteredEvidenceDetail = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(
            evidenceDetail.value,
            { evidenceKind: evidenceKindFilter.value, replicaRelation: replicaRelationFilter.value }
        ));

        // 0.8.187 — the export document a click on "Export Evidence"
        // below hands to the browser. Calls 0.8.186's own describeXxx()
        // over the THREE already-computed facts above — filteredEvidenceDetail,
        // the same evidenceKindFilter/replicaRelationFilter pair, and
        // comparisonState — never a fourth, independently recomputed
        // evidence selection. See this file's own header, "0.8.187."
        const evidenceExport = computed(() => describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(
            filteredEvidenceDetail.value,
            { evidenceKind: evidenceKindFilter.value, replicaRelation: replicaRelationFilter.value },
            comparisonState.value
        ));

        // Page-local, never-persisted download state — mirrors
        // ui/views/DecentralizedPublicationsView.js's own "Export
        // Archive" shape exactly: a `data:` URI a person clicks to
        // download, never a programmatically triggered download.
        const evidenceExportPackage = reactive({ json: '', fileName: '', downloadHref: '' });

        function exportEvidence() {
            const json = JSON.stringify(evidenceExport.value, null, 2);
            evidenceExportPackage.json = json;
            evidenceExportPackage.fileName = 'reconciliation-candidate-leaderboard-evidence-export.json';
            evidenceExportPackage.downloadHref = 'data:application/json;charset=utf-8,' + encodeURIComponent(json);
        }

        // 0.8.188 — page-local, never-persisted imported-evidence state.
        // `importedEvidenceSummary` starts `null` (nothing imported yet)
        // and only ever changes through `importEvidenceExport()` below, on
        // an explicit click. Never merged into `sourceArchive`/
        // `targetArchive`, `page`, or `evidenceDetail` — see this file's
        // own header, "0.8.188."
        const importedEvidenceText = ref('');
        const importedEvidenceSummary = ref(null);
        const importedEvidenceInvalid = ref(false);

        function importEvidenceExport() {
            const result = importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(importedEvidenceText.value);
            if (result.outcome === ReconciliationCandidateLeaderboardEvidenceImportOutcome.IMPORTED) {
                importedEvidenceSummary.value = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport(result.document);
                importedEvidenceInvalid.value = false;
            } else {
                importedEvidenceInvalid.value = true;
            }
        }

        function clearImportedEvidence() {
            importedEvidenceText.value = '';
            importedEvidenceSummary.value = null;
            importedEvidenceInvalid.value = false;
        }

        return {
            page, evidenceDetail, comparisonState,
            evidenceKindFilter, replicaRelationFilter, filteredPage, filteredEvidenceDetail,
            evidenceKindOptions: RECONCILIATION_CANDIDATE_LEADERBOARD_EVIDENCE_KIND_OPTIONS,
            replicaRelationOptions: RECONCILIATION_CANDIDATE_LEADERBOARD_REPLICA_RELATION_OPTIONS,
            peerArchiveText, hasPeerArchive, peerArchiveInvalid, usePeerArchive, clearPeerArchive,
            evidenceExportPackage, exportEvidence,
            importedEvidenceText, importedEvidenceSummary, importedEvidenceInvalid, importEvidenceExport, clearImportedEvidence
        };
    },
    template: `
        <section class="reconciliation-leaderboard-view">
            <h1>Reconciliation Candidate Leaderboard</h1>
            <p class="reconciliation-leaderboard-note">
                Decision and observation evidence this replica has recorded for each
                reconciliation candidate, compared explicitly against the peer archive
                supplied below. Nothing here merges, replaces, or reconciles either
                archive — this is a comparison, never a reconciliation.
            </p>

            <div class="evidence-inspection-adapter">
                <span class="evidence-inspection-adapter-title">Peer Archive</span>
                <p v-if="comparisonState === 'NO_PEER'" class="form-hint form-hint--neutral">
                    No peer archive supplied yet — every count below is Source-only
                    until you paste one. Paste a peer replica's own exported archive
                    (Export Archive, on the Publications page) and click
                    "Use as Peer Archive".
                </p>
                <p v-else-if="comparisonState === 'PEER_EMPTY'" class="form-hint form-hint--neutral">
                    Comparing against an explicitly supplied peer archive — but that
                    peer archive has no decision or observation records of its own
                    recorded yet, so every count below is still Source-only. This is
                    a real, supplied peer, not the no-peer default.
                </p>
                <p v-else class="form-hint form-hint--neutral">
                    Comparing against an explicitly supplied peer archive.
                </p>
                <label class="form-field">
                    <span class="form-label">Peer archive JSON</span>
                    <textarea class="form-input identity-export-json" rows="6" v-model="peerArchiveText"
                              placeholder="Paste a peer replica's exported archive JSON"></textarea>
                </label>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="usePeerArchive">
                        Use as Peer Archive
                    </button>
                    <button type="button" class="action-btn action-btn--secondary" v-if="hasPeerArchive" @click="clearPeerArchive">
                        Clear Peer Archive
                    </button>
                </div>
                <p v-if="peerArchiveInvalid" class="identity-unlock-error">
                    This is not a valid archive export — nothing was compared.
                </p>
            </div>

            <div class="evidence-inspection-adapter reconciliation-leaderboard-evidence-filter">
                <span class="evidence-inspection-adapter-title">Evidence Filter</span>
                <label class="form-field">
                    <span class="form-label">Evidence type</span>
                    <select class="form-input" v-model="evidenceKindFilter">
                        <option v-for="option in evidenceKindOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </select>
                </label>
                <label class="form-field">
                    <span class="form-label">Replica relation</span>
                    <select class="form-input" v-model="replicaRelationFilter">
                        <option v-for="option in replicaRelationOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                    </select>
                </label>
            </div>

            <div class="evidence-inspection-adapter reconciliation-leaderboard-evidence-export">
                <span class="evidence-inspection-adapter-title">Evidence Export</span>
                <p class="form-hint form-hint--neutral">
                    Exports exactly the evidence currently shown above — the same Evidence
                    Filter selection and the same peer comparison state — as a portable
                    JSON document. Nothing here recomputes evidence, filters a candidate,
                    or contacts a server.
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="exportEvidence">
                        Export Evidence
                    </button>
                </div>
                <div v-if="evidenceExportPackage.json" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Exported Evidence</span>
                    <textarea class="form-input identity-export-json" rows="6" readonly :value="evidenceExportPackage.json"></textarea>
                    <div class="identity-mgmt-actions">
                        <a class="modal-btn modal-btn--primary" :href="evidenceExportPackage.downloadHref" :download="evidenceExportPackage.fileName">Download Evidence Export</a>
                    </div>
                </div>
            </div>

            <div class="evidence-inspection-adapter reconciliation-leaderboard-evidence-import">
                <span class="evidence-inspection-adapter-title">Import Evidence Export</span>
                <p class="form-hint form-hint--neutral">
                    Paste a previously exported evidence document (from the Evidence
                    Export panel above, this replica's own or a peer's) to inspect it.
                    This never merges into, replaces, or recomputes the live leaderboard
                    above — it is a read-only look at a separate, portable document.
                </p>
                <label class="form-field">
                    <span class="form-label">Evidence export JSON</span>
                    <textarea class="form-input identity-export-json" rows="6" v-model="importedEvidenceText"
                              placeholder="Paste an exported evidence document JSON"></textarea>
                </label>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="importEvidenceExport">
                        Import Evidence
                    </button>
                    <button type="button" class="action-btn action-btn--secondary" v-if="importedEvidenceSummary" @click="clearImportedEvidence">
                        Clear Imported Evidence
                    </button>
                </div>
                <p v-if="importedEvidenceInvalid" class="identity-unlock-error">
                    This is not a valid evidence export document — nothing was imported.
                </p>
                <div v-if="importedEvidenceSummary" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Imported Evidence</span>
                    <p>Comparison: {{ importedEvidenceSummary.comparisonState }}</p>
                    <p>Candidates: {{ importedEvidenceSummary.candidateCount }}</p>
                    <p>Decisions: {{ importedEvidenceSummary.decisionRecordCount }}</p>
                    <p>Observations: {{ importedEvidenceSummary.observationRecordCount }}</p>
                </div>
            </div>

            <ReconciliationCandidateLeaderboardTable :page="filteredPage" :evidence-detail="filteredEvidenceDetail" :comparison-state="comparisonState" />
        </section>
    `
};
