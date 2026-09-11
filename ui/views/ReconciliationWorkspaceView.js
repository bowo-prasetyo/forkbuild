import { PublicationObservationArchive } from '../../application/PublicationObservationArchive.js';
import {
    ReconcilePublisherLeaderboardSnapshotClaimUseCase,
    ReconcilePublisherLeaderboardSnapshotClaimOutcome
} from '../../application/ReconcilePublisherLeaderboardSnapshotClaimUseCase.js';
import { LocalAuthorizationVerifier } from '../../identity/LocalAuthorizationVerifier.js';

// The literal success value `execute()` itself returns on a fully
// completed run — see "Result presentation," below, for exactly why this
// is a raw literal rather than a further import: this file's own
// dependency stays exactly ONE seam wide (`ReconcilePublisherLeaderboardSnapshotClaimUseCase`
// alone), never reaching one layer deeper into the revalidation-observation
// stage's own module just to name the identical value that seam already
// re-exposes as its own `outcome`.
const RECONCILIATION_RECORDED_OUTCOME = 'RECORDED';

// 0.9.408 — Reconciliation Workspace UI.
//
// 0.9.407 built the production-owned execution seam — application/
// ReconcilePublisherLeaderboardSnapshotClaimUseCase.js, ONE explicit
// operation composing the five existing, UNCHANGED reconciliation stages —
// and left it with zero call sites anywhere in `ui/` on purpose (see that
// file's own header, "No UI... a presentation surface over this exact
// seam" is "0.9.408's own, separately sized, later question"). This file
// is exactly that surface, and nothing more:
//
//   Local Archive (this replica's own, existing            Peer Evidence (a
//    publicationObservationArchiveStorage —                paste, the SAME
//    the IDENTICAL mechanism ui/views/                     evidence-family
//    ReconciliationCandidateLeaderboardView.js's own        convention 0.9.404
//    `sourceArchive` and ui/views/                          already established
//    DecentralizedPublicationsView.js's own                 for peer archives/
//    `publicationObservationArchive` already read/write)    evidence exports)
//              │                                                    │
//              └──────────────────────┬─────────────────────────────┘
//                                      ▼
//                                [Reconcile]
//                                      │
//                                      ▼
//         ReconcilePublisherLeaderboardSnapshotClaimUseCase#execute()
//                        (0.9.407, UNCHANGED — the ONE seam)
//                                      │
//                                      ▼
//               existing reconciliationDecisionRecords /
//               revalidationObservationRecords, persisted back through
//               the SAME publicationObservationArchiveStorage this page
//               loaded `localArchive` from — never a parallel store
//                                      │
//                                      ▼
//            candidate produced?  ──yes──►  "View in Leaderboard"
//                    │                       (a plain router-link to the
//                    no                       EXISTING, UNCHANGED, still
//                    ▼                        read-only /reconciliation-
//         explain NO_RECONCILIATION_CANDIDATE  leaderboard route)
//
// THIS FILE INVOKES THE USE CASE; IT NEVER REPRODUCES WHAT IT DOES. It
// imports exactly one production seam — `ReconcilePublisherLeaderboardSnapshotClaimUseCase`
// — and never imports any of the five lower-level stages that seam itself
// composes (claim receipt, plan, candidate selection, decision, revalidation
// observation). There is no candidate-selection logic, no decision logic, no
// revalidation logic, no scoring, no ranking, and no trust evaluation
// anywhere below this comment — every one of those questions is answered
// by `execute()` alone. `RECONCILIATION_RECORDED_OUTCOME`, above, is the one
// literal success value `execute()` itself already returns (see "Result
// presentation," below) — a plain string constant, deliberately never a
// further import one layer down into the stage that value happens to
// originate from.
//
// LOCAL ARCHIVE SELECTION REUSES THE EXISTING MECHANISM, NEVER A NEW
// ARCHIVE REPRESENTATION. `localArchive` is `publicationObservationArchiveStorage
// .load()` — byte-identical to how `ui/views/ReconciliationCandidateLeaderboardView.js`
// already obtains its own `sourceArchive`. There is no archive picker, no
// second storage adapter, and no new archive shape; a replica has exactly
// one local archive, and this page reads and writes the same one every
// other page in this family already does.
//
// PEER EVIDENCE INPUT REUSES THE EXISTING PASTE/IMPORT CONVENTION, NEVER
// PEER DISCOVERY. `peerEvidenceText` is a person's own paste of a peer's
// own exported, signed leaderboard-snapshot claim JSON — the identical
// "paste portable JSON, explicit click, no acquisition of any kind"
// convention `usePeerArchive()`/`importEvidenceExport()` already established
// in `ReconciliationCandidateLeaderboardView.js` (0.8.181/0.8.188). The raw
// text is handed to `execute()` completely unparsed — `execute()`'s own
// first stage (0.8.130, UNCHANGED) already accepts either raw text or a
// parsed payload; this file never calls `JSON.parse()` itself, and never
// inspects the claim's own fields before handing it over.
//
// EXPLICIT EXECUTION ONLY — THE IDENTICAL RESTRAINT `ReconcilePublisherLeaderboardSnapshotClaimUseCase`'s
// OWN HEADER ALREADY HOLDS, ONE LAYER UP. `reconcile()`, below, is the ONLY
// place this file ever constructs or calls the use case, and it runs ONLY
// on an explicit click. There is no `mounted`/`created` hook, no `watch`
// on `peerEvidenceText` or on the injected storage, and no reconciliation
// triggered by opening this page, changing the pasted text, or navigating
// here — mirroring every other explicit-click seam this codebase already
// has (`usePeerArchive`, `importEvidenceExport`, `exportEvidence`).
//
// THE RESULTING ARCHIVE IS PERSISTED THROUGH THE SAME STORAGE ADAPTER,
// BEST-EFFORT, THE IDENTICAL DISCIPLINE `DecentralizedPublicationsView.js`'s
// OWN `persistPublicationObservationArchive()` ALREADY HOLDS. `execute()`
// itself never mutates or persists anything (see 0.9.407's own header,
// "`archive` IS TAKEN AND RETURNED, NEVER HELD AS HIDDEN INSTANCE STATE") —
// it is this UI's own explicit job, as the caller, to save the archive it
// gets back to the SAME `publicationObservationArchiveStorage` it loaded
// `localArchive` from, so the existing, unchanged Leaderboard (which reads
// from that identical storage) can observe what this click just produced.
// A failed save is swallowed, never allowed to interrupt the result already
// shown on screen — the identical restraint that function's own header
// documents for the identical reason.
//
// RESULT PRESENTATION EXPOSES THE EXISTING OUTCOME VOCABULARY DIRECTLY,
// NEVER A NEW UI LIFECYCLE. There is no STARTED/RUNNING/COMPLETE/SUCCESS
// state anywhere in this file. Exactly two facts distinguish what the
// template below shows:
//   - a candidate was produced (`result.outcome === RECONCILIATION_RECORDED_OUTCOME`
//     — the literal 0.9.407 already returns for a fully completed run) ->
//     "View in Leaderboard", a plain navigation edge, never a second
//     candidate table;
//   - `result.outcome === ReconcilePublisherLeaderboardSnapshotClaimOutcome.NO_RECONCILIATION_CANDIDATE`
//     -> an explanation that no candidate was produced, in those words;
//   - anything else -> `result.outcome`'s own literal value, displayed
//     verbatim (INVALID_CLAIM/UNVERIFIABLE_CLAIM/INVALID_EXECUTED_AT/
//     INVALID_DECISION/INVALID_OBSERVATION) — never re-labeled, never
//     collapsed into a generic "workspace error."
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Automatic reconciliation, peer discovery, peer archive downloading,
//   background reconciliation, retry, or scheduling.** See "Explicit
//   execution only," above.
// - **Reconciliation history, progress tracking, candidate ranking, trust
//   scores, or a new candidate store.** `result` is page-local, never-
//   persisted UI state (reloading this page loses it, on purpose) — the
//   only DURABLE effect of a click is the archive save described above,
//   into the SAME collections every other reconciliation file already
//   writes to.
// - **A new evidence format.** `peerEvidenceText` is handed to `execute()`
//   exactly as pasted.
// - **Leaderboard mutation, or a duplicate candidate view.** The Leaderboard
//   remains exactly what 0.9.406/0.9.407 decided it must stay — this page
//   never imports `ReconciliationCandidateLeaderboardTable`/
//   `ReconciliationCandidateLeaderboardView`, and never renders a row,
//   count, or candidate list of its own.
// - **A generic "ReconciliationManager," or a multi-step wizard.** One
//   form, one button, one result — see the template below.
export default {
    name: 'ReconciliationWorkspaceView',
    inject: {
        // The SAME app-wide storage adapter ui/main.js already provides as
        // `publicationObservationArchiveStorage` — never a second one.
        // Optional (`default: null`) purely so this component degrades to
        // an honest, never-persisted empty archive rather than throwing
        // when nothing provides it (the identical shape PublicationCard.js's
        // own `inject` already uses for its own optional collaborators).
        publicationObservationArchiveStorage: { default: null }
    },
    data() {
        return {
            peerEvidenceText: '',
            // `result` is `null` until the first explicit "Reconcile"
            // click — see "Result presentation," above. It is the
            // UNCHANGED, frozen object `ReconcilePublisherLeaderboardSnapshotClaimUseCase#execute()`
            // itself returns; this file never re-shapes it.
            result: null
        };
    },
    computed: {
        // See "Result presentation," above — the ONE fact that decides
        // whether "View in Leaderboard" appears.
        candidateProduced() {
            return this.result !== null && this.result.outcome === RECONCILIATION_RECORDED_OUTCOME;
        },
        noReconciliationCandidate() {
            return this.result !== null && this.result.outcome === ReconcilePublisherLeaderboardSnapshotClaimOutcome.NO_RECONCILIATION_CANDIDATE;
        }
    },
    methods: {
        // The ONE explicit action this workspace offers — see "Explicit
        // execution only," above. Constructs the use case fresh on every
        // click (mirroring how every other file in this family constructs
        // its own use case instance rather than holding one across calls),
        // hands it exactly the three genuine inputs the use case itself
        // requires — `localArchive`, the pasted `peerEvidencePayload`, and
        // an explicit `executedAt` this click itself supplies — and never
        // constructs a candidate, plan, decision, or observation itself.
        reconcile() {
            // See "Local archive selection reuses the existing mechanism,"
            // above — read fresh on every click, never cached, so a
            // Publication Archive import/export that happened elsewhere on
            // this same replica is always reflected.
            const localArchive = this.publicationObservationArchiveStorage
                ? this.publicationObservationArchiveStorage.load()
                : PublicationObservationArchive.empty();
            const useCase = new ReconcilePublisherLeaderboardSnapshotClaimUseCase(new LocalAuthorizationVerifier());
            const executedAt = new Date();
            this.result = useCase.execute(localArchive, this.peerEvidenceText, executedAt);

            // See "The resulting archive is persisted," above.
            if (this.publicationObservationArchiveStorage && this.result.archive instanceof PublicationObservationArchive) {
                try {
                    this.publicationObservationArchiveStorage.save(this.result.archive);
                } catch (error) {
                    // Intentionally swallowed — see this file's own header.
                }
            }
        },
        clearResult() {
            this.result = null;
        }
    },
    template: `
        <section class="reconciliation-workspace-view">
            <h1>Reconciliation Workspace</h1>
            <p class="reconciliation-leaderboard-note">
                Reconcile this replica's own local archive against one piece of
                peer evidence, explicitly. Nothing on this page runs
                automatically — reconciliation happens only when you click
                "Reconcile," below.
            </p>

            <div class="evidence-inspection-adapter">
                <span class="evidence-inspection-adapter-title">Local Archive</span>
                <p class="form-hint form-hint--neutral">
                    This replica's own recorded evidence — the same archive the
                    Publications page and the Reconciliation Candidate Leaderboard
                    already read and write. There is no separate archive to pick.
                </p>
            </div>

            <div class="evidence-inspection-adapter">
                <span class="evidence-inspection-adapter-title">Peer Evidence</span>
                <p class="form-hint form-hint--neutral">
                    Paste a peer's own exported, signed leaderboard snapshot claim
                    below (Export Claim, on their replica).
                </p>
                <label class="form-field">
                    <span class="form-label">Peer evidence JSON</span>
                    <textarea class="form-input identity-export-json" rows="6" v-model="peerEvidenceText"
                              placeholder="Paste a peer's exported leaderboard snapshot claim JSON"></textarea>
                </label>
            </div>

            <div class="identity-mgmt-actions">
                <button type="button" class="action-btn action-btn--primary" @click="reconcile">
                    Reconcile
                </button>
                <button type="button" class="action-btn action-btn--secondary" v-if="result" @click="clearResult">
                    Clear Result
                </button>
            </div>

            <div v-if="result" class="evidence-inspection-adapter reconciliation-workspace-result">
                <span class="evidence-inspection-adapter-title">Result</span>
                <template v-if="candidateProduced">
                    <p class="form-hint form-hint--neutral">
                        Reconciliation produced a candidate, recorded as a decision
                        and a revalidation observation in this replica's own
                        archive.
                    </p>
                    <router-link to="/reconciliation-leaderboard" class="action-btn action-btn--secondary">
                        View in Leaderboard
                    </router-link>
                </template>
                <template v-else-if="noReconciliationCandidate">
                    <p class="form-hint form-hint--neutral">
                        No reconciliation candidate was produced — this peer's
                        evidence already agrees with this replica's own local
                        snapshot.
                    </p>
                </template>
                <template v-else>
                    <p class="identity-unlock-error">
                        Reconciliation did not complete — outcome: {{ result.outcome }}
                    </p>
                </template>
            </div>
        </section>
    `
};
