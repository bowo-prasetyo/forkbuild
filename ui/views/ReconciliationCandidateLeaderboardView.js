import { ref, computed, inject } from 'vue';
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
// is untouched by filtering entirely: a row hidden by the filter simply
// never renders its own "Inspect Evidence" button; its detail was never
// computed differently to begin with.
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

        return {
            page, evidenceDetail, comparisonState,
            evidenceKindFilter, replicaRelationFilter, filteredPage,
            evidenceKindOptions: RECONCILIATION_CANDIDATE_LEADERBOARD_EVIDENCE_KIND_OPTIONS,
            replicaRelationOptions: RECONCILIATION_CANDIDATE_LEADERBOARD_REPLICA_RELATION_OPTIONS,
            peerArchiveText, hasPeerArchive, peerArchiveInvalid, usePeerArchive, clearPeerArchive
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

            <ReconciliationCandidateLeaderboardTable :page="filteredPage" :evidence-detail="evidenceDetail" :comparison-state="comparisonState" />
        </section>
    `
};
