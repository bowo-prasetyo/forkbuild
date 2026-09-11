import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin, isValidPublicationObservationArchiveProvenanceOrigin } from './PublicationObservationArchiveProvenance.js';
import {
    ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase,
    LeaderboardClaimArchiveReceiptOutcome
} from './ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase.js';
import { reconstructPublisherLeaderboardSnapshot } from './PublisherLeaderboardSnapshot.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationPlan } from './PublisherLeaderboardClaimSnapshotReconciliationPlanView.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationCandidate } from './PublisherLeaderboardClaimSnapshotReconciliation.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecision } from './PublisherLeaderboardClaimSnapshotReconciliationDecision.js';
import {
    RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase,
    ReconciliationDecisionArchiveOutcome
} from './RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js';
import {
    RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase,
    RevalidationObservationArchiveOutcome
} from './RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase.js';

// 0.9.407 — Reconciliation Workspace Execution Boundary.
//
// 0.9.405 proved, LIVE, that a complete five-stage reconciliation producer
// chain already exists and genuinely works (claim receipt -> plan ->
// candidate selection -> decision -> revalidation observation) but that NO
// existing user operation owns producing those records — POSSIBILITY C, an
// entire absent front door, not one missing wiring edge. 0.9.406 then asked
// the separate, narrower question of WHICH existing object should become
// that front door, and rejected every existing candidate (Publications,
// Peer Connections, the Leaderboard itself, and automatic reconciliation)
// — the Leaderboard most decisively, being self-documented, repeatedly, as
// a read-only diagnostic surface. This file is the product-owned execution
// boundary that decision leaves standing: ONE explicit application
// operation representing "reconcile this replica's own local evidence
// against this genuine piece of peer evidence" — composing the five
// existing, UNCHANGED stages, never reimplementing any of them.
//
//   "local Publication"                "peer evidence"
//   (this replica's OWN                (a genuine, signed
//    PublicationObservationArchive —    PublisherLeaderboardSnapshotClaim,
//    the durable substrate every        obtained from a peer by whatever
//    other reconstructXxx() in this     portable, out-of-band means this
//    codebase already reads live,       codebase already ships for claim
//    e.g. DecentralizedPublicationsView)exchange — imported/pasted JSON)
//        │                                   │
//        └───────────────────┬───────────────┘
//                             ▼
//         ReconcilePublisherLeaderboardSnapshotClaimUseCase#execute()
//                             │
//                             ▼
//   1. claim receipt    ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase (0.8.130, UNCHANGED)
//                             │
//                             ▼
//   2. reconciliation plan  describePublisherLeaderboardClaimSnapshotReconciliationPlan() (0.8.143, UNCHANGED)
//                             │            over the receiving archive's own claimHistory
//                             │            and THIS replica's own reconstructPublisherLeaderboardSnapshot() (0.8.117, UNCHANGED)
//                             ▼
//   3. candidate selection  describePublisherLeaderboardClaimSnapshotReconciliationCandidate() (0.8.144, UNCHANGED)
//                             │            selection is MECHANICALLY DERIVED from the plan's own
//                             │            list membership for the EXACT claim just received —
//                             │            never an arbitrary, caller-supplied candidate
//                             ▼
//   4. decision          describePublisherLeaderboardClaimSnapshotReconciliationDecision() (0.8.145, UNCHANGED)
//                        + RecordXxxIntoArchiveUseCase (0.8.150, UNCHANGED)
//                             │            disposition is ALWAYS 'OBSERVE' — invoking this
//                             │            operation IS the explicit act of a caller looking at
//                             │            the candidate; see "Why the decision is always OBSERVE," below
//                             ▼
//   5. revalidation observation  describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation() (0.8.162, UNCHANGED)
//                        + RecordXxxIntoArchiveUseCase (0.8.167, UNCHANGED)
//                             │
//                             ▼
//              existing reconciliationDecisionRecords / revalidationObservationRecords
//                        (PublicationObservationArchive's OWN durable collections)
//                             │
//                             ▼
//              Reconciliation Candidate Leaderboard (0.8.179-0.8.188, unchanged, still read-only)
//
// THE WORKSPACE PRODUCES; THE LEADERBOARD OBSERVES — THE ONE INVARIANT THIS
// MILESTONE EXISTS TO ESTABLISH. This file is, as of this milestone, the
// SOLE application-level operation that composes claim receipt through
// revalidation observation into one durable write. Nothing in `ui/` calls
// it yet (that is 0.9.408's own, separately sized, later question — a
// presentation surface over this exact seam) and nothing calls it
// automatically — see "Explicit execution only," below.
//
// EXPLICIT INPUTS ONLY — NO ARBITRARY CANDIDATE, NO PRECONSTRUCTED
// DECISION, NO SYNTHETIC OBSERVATION, NO LEADERBOARD OBJECT, NO UI STATE,
// NO `source`/`automatic` FLAG. `execute()` takes exactly `localArchive` (a
// genuine `PublicationObservationArchive`, or a safe empty default),
// `peerEvidencePayload` (the portable claim payload a caller obtained from
// a peer — identical shape `ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase`
// already accepts, never reinterpreted here), and `executedAt` (an
// explicit "when," exactly like every other file in this family — see "No
// clock," below). Every fact downstream of those three arguments —
// claimHistory, the local snapshot, the plan, the selected candidate, the
// decision, the observation — is COMPUTED, never accepted as a shortcut
// around the real pipeline.
//
// SELECTION IS MECHANICAL, NEVER A CALLER'S FREE CHOICE. Once the peer
// claim is received, its own `claim.id` is already known; this file looks
// up that EXACT claimId in the plan's own `divergentCorrespondences` and
// `claimsWithoutCorrespondence` lists (0.8.143's own, unmodified lists) and
// builds the one `selection` object 0.8.144 itself would recognize for
// whichever relationship the plan already reports. It never inspects any
// OTHER claim's correspondence, never breaks a tie, and never invents a
// selection the plan itself does not already name. If the received claim
// corresponds to this replica's own snapshot WITHOUT diverging (the
// evidence already agrees), the plan names no candidate for it at all —
// this file reports `NO_RECONCILIATION_CANDIDATE` rather than fabricating
// one; see `ReconcilePublisherLeaderboardSnapshotClaimOutcome`, below.
//
// WHY THE DECISION IS ALWAYS 'OBSERVE', NEVER A CALLER-SUPPLIED
// DISPOSITION. 0.8.145's own vocabulary records what a caller CHOSE TO DO
// about a candidate — 'OBSERVE' ("looked at this and is noting that fact")
// or 'DEFER' ("looked at this and is explicitly postponing further
// action"). This operation's entire reason to exist is the act of looking
// — a caller who runs it is, by that very act, observing the candidate
// this milestone's own diagram calls "an explicit user action." It is
// never invoked to defer anything (deferring requires no pipeline run at
// all — a caller simply does not reconcile yet), so 'OBSERVE' is not a
// caller-supplied disposition smuggled in through another name; it is the
// one disposition this operation's own explicit invocation already means.
//
// STAGE 5 CHECKS THE SAME DECISION AGAINST THE SAME PLAN, AT THE SAME
// MOMENT — A GENUINE, IF IMMEDIATE, REVALIDATION, NEVER A SECOND DECISION.
// 0.8.162's own header allows an observation to be made at any later
// moment against any explicitly supplied plan; this operation supplies the
// IDENTICAL `plan` it just computed and the IDENTICAL `executedAt` it just
// used for the decision, because both facts are true at once: the decision
// was just made, and checking it against the plan that produced it is
// still a genuine, real observation (`candidatePresent`/
// `candidateMatchesPlan`, computed for real, not asserted) — never a
// second copy of the decision under an observation's name.
//
// EXPLICIT EXECUTION ONLY — NO AUTOMATIC RECONCILIATION, NO BACKGROUND
// POLLING, NO RECONCILIATION ON LEADERBOARD LOAD, NO RECONCILIATION ON
// PEER CONNECTION, NO RETRY SCHEDULER, NO IMPLICIT RECONCILIATION WHEN
// EVIDENCE IS IMPORTED. This class has no timer, no interval, no
// subscription, no event listener, and no constructor argument that could
// make `execute()` run itself. It runs exactly once per call, synchronously
// composing five already-synchronous, already-pure stages (excepting the
// two durable archive writes), and produces exactly one result. See
// 0.9.406's own flagship finding — "SIGNING IS NEVER AUTOMATIC" — held here
// one layer up: RECONCILING IS NEVER AUTOMATIC EITHER.
//
// NO CLOCK OF ITS OWN — `executedAt` IS EXPLICIT, MIRRORING 0.8.145's OWN
// `decidedAt` AND 0.8.162's OWN `observedAt` RESTRAINT, ONE LAYER UP. A
// missing, `null`, or otherwise invalid `executedAt` (not a `Date`, not a
// value a `Date` can be constructed from) is reported as
// `INVALID_EXECUTED_AT` before `localArchive`/`peerEvidencePayload` are
// even touched — the archive returned is the exact instance (or its safe,
// empty degradation) handed in, unchanged, and no claim is ever received.
//
// FAILURE ISOLATION — EACH STAGE'S OWN EXISTING FAILURE SEMANTICS ARE
// PRESERVED, NEVER COLLAPSED INTO A GENERIC "WORKSPACE ERROR." An
// unreceivable claim reports EXACTLY `LeaderboardClaimArchiveReceiptOutcome.
// INVALID_CLAIM`/`UNVERIFIABLE_CLAIM` (0.8.130's own vocabulary, unchanged)
// and the pipeline stops at stage 1 — `plan`/`candidate`/`decision`/
// `observation` are all `null`. A claim with no reconciliation candidate
// stops at stage 2 with `NO_RECONCILIATION_CANDIDATE` — `decision`/
// `observation` stay `null`; `plan`/`candidate` are real. The two archive
// writes (stages 4 and 5) can each independently report their own existing
// `INVALID_DECISION`/`INVALID_OBSERVATION` outcome (0.8.150's/0.8.167's own
// vocabulary) rather than a new one, though in ordinary use neither is
// reachable, because this file only ever hands each of them a record it
// just built from a genuinely selected candidate.
//
// `outcome` — THE TOP-LEVEL RESULT FIELD EVERY `RecordXxx`/`ReceiveXxx` USE
// CASE IN THIS FAMILY ALREADY RETURNS, EXTENDED ONE LAYER UP RATHER THAN
// REINVENTED. Its value is ALWAYS one of an EXISTING enum's own literal
// values (`LeaderboardClaimArchiveReceiptOutcome.*`,
// `ReconciliationDecisionArchiveOutcome.*`,
// `RevalidationObservationArchiveOutcome.*`) naming the outcome of the
// FURTHEST stage this call actually reached — EXCEPT the two outcomes this
// file's own `ReconcilePublisherLeaderboardSnapshotClaimOutcome` below
// introduces, because no existing stage already names "the supplied
// `executedAt` was invalid" or "the plan named no candidate for this exact
// claim." Neither is a lifecycle state (`STARTED`/`RUNNING`/`COMPLETE`) —
// both are ordinary, falsifiable DATA facts, exactly like every other
// outcome in this family. A fully completed reconciliation reports
// `RevalidationObservationArchiveOutcome.RECORDED` — the SAME literal
// 0.8.167's own use case already returns, echoed here, never re-labeled.
//
// NO PARALLEL RECONCILIATION STORE. This file appends to the SAME
// `PublicationObservationArchive` every other reconciliation file already
// writes to (`reconciliationDecisionRecords`/`revalidationObservationRecords`,
// via 0.8.150's/0.8.167's own unmodified `appendXxx()` methods) — it
// introduces no fourteenth collection, no parallel workspace-only ledger,
// and no new archive shape of any kind.
//
// `archive` IS TAKEN AND RETURNED, NEVER HELD AS HIDDEN INSTANCE STATE —
// THE IDENTICAL IMMUTABLE-INPUT/IMMUTABLE-OUTPUT SHAPE EVERY FILE IN THIS
// FAMILY ALREADY HOLDS. `execute()` never mutates `localArchive`; on any
// outcome it returns the FURTHEST new archive this call actually produced
// (or the original, unchanged, if no stage that writes was ever reached).
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **No UI.** No route, no publication selector, no peer-evidence
//   selector, no "Run" button, no Leaderboard change. See 0.9.408's own,
//   separately sized, later question.
// - **No automatic execution of any kind.** See "Explicit execution only,"
//   above.
// - **No new reconciliation states, no new candidate persistence, no new
//   evidence format.** This file mints exactly two new outcome literals
//   (see `outcome`, above) and zero new record shapes — every record it
//   produces is byte-identical to what 0.8.145's/0.8.162's own functions
//   already produce.
// - **No peer discovery, peer archive acquisition, ranking, trust scoring,
//   or reconciliation history UI.** None of that vocabulary appears in this
//   file.
// - **No trust or correctness judgment about the peer claim.** Exactly
//   like every stage it composes, this file never decides which side of a
//   divergence is "correct" — it only produces the SAME neutral candidate/
//   decision/observation records those stages already produce.
export const ReconcilePublisherLeaderboardSnapshotClaimOutcome = Object.freeze({
    INVALID_EXECUTED_AT: 'INVALID_EXECUTED_AT',
    NO_RECONCILIATION_CANDIDATE: 'NO_RECONCILIATION_CANDIDATE'
});

export class ReconcilePublisherLeaderboardSnapshotClaimUseCase {
    constructor(verifier) {
        // Delegates construction-time validation of `verifier` to the
        // EXISTING use case that already requires one capable of
        // `verifyPublisherLeaderboardSnapshotClaim` — never a second,
        // duplicated check of the same requirement.
        this._verifier = verifier;
        this._receiveClaimUseCase = new ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase(verifier);
        this._recordDecisionUseCase = new RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase();
        this._recordObservationUseCase = new RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase();
    }

    // Returns a frozen result. `outcome` is always one of the literals
    // documented in this file's own header; the stage fields
    // (`receipt`/`plan`/`candidate`/`decision`/`observation`) are `null`
    // for every stage this call did not reach, and are otherwise EXACTLY
    // the real result the composed, UNCHANGED function/use case for that
    // stage already returns — never re-shaped, never summarized.
    //
    //   { outcome, archive, receipt, plan, candidate, decision, observation }
    //
    // Never throws for malformed `localArchive`, `peerEvidencePayload`, or
    // `executedAt` — only a missing/malformed `verifier` (checked at
    // construction) or an invalid `claimReceiptOrigin` argument throws,
    // identically to `ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase`'s
    // own `execute()`.
    execute(localArchive, peerEvidencePayload, executedAt, claimReceiptOrigin = PublicationObservationArchiveProvenanceOrigin.IMPORTED) {
        if (!isValidPublicationObservationArchiveProvenanceOrigin(claimReceiptOrigin)) {
            throw new Error('ReconcilePublisherLeaderboardSnapshotClaimUseCase: claimReceiptOrigin must be a valid provenance origin (local or imported)');
        }
        const existingArchive = localArchive instanceof PublicationObservationArchive ? localArchive : PublicationObservationArchive.empty();

        const executedAtDate = executedAt instanceof Date ? executedAt : new Date(executedAt);
        if (executedAt === null || executedAt === undefined || Number.isNaN(executedAtDate.getTime())) {
            return emptyResult(ReconcilePublisherLeaderboardSnapshotClaimOutcome.INVALID_EXECUTED_AT, existingArchive);
        }

        // Stage 1 — claim receipt. The ONE real use case this codebase
        // ships for it (0.8.130, UNCHANGED).
        const receipt = this._receiveClaimUseCase.execute(existingArchive, peerEvidencePayload, claimReceiptOrigin);
        if (receipt.outcome !== LeaderboardClaimArchiveReceiptOutcome.RECEIVED) {
            return Object.freeze({
                outcome: receipt.outcome,
                archive: receipt.archive,
                receipt,
                plan: null,
                candidate: null,
                decision: null,
                observation: null
            });
        }

        // Stage 2 — reconciliation plan, over the receiving archive's own
        // claim history and THIS replica's own, freshly reconstructed
        // snapshot (0.8.117/0.8.143, UNCHANGED). Never a peer-supplied
        // snapshot, never a second archive — "local Publication" IS
        // `receipt.archive`, read back through its own reconstruction.
        const localSnapshot = reconstructPublisherLeaderboardSnapshot(receipt.archive);
        const plan = describePublisherLeaderboardClaimSnapshotReconciliationPlan(receipt.archive.leaderboardClaimRecords, [localSnapshot], this._verifier);

        // Stage 3 — candidate selection, mechanically derived from the
        // EXACT claim just received; see "Selection is mechanical," above.
        const claimId = receipt.record.claim.id;
        const selection = deriveSelectionForReceivedClaim(plan, claimId);
        if (!selection) {
            return Object.freeze({
                outcome: ReconcilePublisherLeaderboardSnapshotClaimOutcome.NO_RECONCILIATION_CANDIDATE,
                archive: receipt.archive,
                receipt,
                plan,
                candidate: null,
                decision: null,
                observation: null
            });
        }
        const candidate = describePublisherLeaderboardClaimSnapshotReconciliationCandidate(plan, selection);
        if (!candidate.selected) {
            // Cannot occur in practice — `selection` is derived from the
            // SAME `plan` this candidate lookup itself reads — kept as an
            // explicit, non-throwing outcome rather than an assumption.
            return Object.freeze({
                outcome: ReconcilePublisherLeaderboardSnapshotClaimOutcome.NO_RECONCILIATION_CANDIDATE,
                archive: receipt.archive,
                receipt,
                plan,
                candidate,
                decision: null,
                observation: null
            });
        }

        // Stage 4 — decision, always 'OBSERVE'; see "Why the decision is
        // always OBSERVE," above. Recorded via the ONE real archive-writing
        // use case this codebase ships for it (0.8.150, UNCHANGED).
        const decisionRecord = describePublisherLeaderboardClaimSnapshotReconciliationDecision(plan, selection, 'OBSERVE', executedAtDate);
        const decision = this._recordDecisionUseCase.execute(receipt.archive, decisionRecord, PublicationObservationArchiveProvenanceOrigin.LOCAL);
        if (decision.outcome !== ReconciliationDecisionArchiveOutcome.RECORDED) {
            return Object.freeze({
                outcome: decision.outcome,
                archive: decision.archive,
                receipt,
                plan,
                candidate,
                decision,
                observation: null
            });
        }

        // Stage 5 — revalidation observation, over the SAME decision and
        // the SAME plan, at the SAME `executedAt`; see "Stage 5 checks the
        // same decision," above. Recorded via the ONE real archive-writing
        // use case this codebase ships for it (0.8.167, UNCHANGED).
        const observationRecord = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation(decisionRecord, plan, executedAtDate);
        const observation = this._recordObservationUseCase.execute(decision.archive, observationRecord, PublicationObservationArchiveProvenanceOrigin.LOCAL);

        return Object.freeze({
            outcome: observation.outcome,
            archive: observation.archive,
            receipt,
            plan,
            candidate,
            decision,
            observation
        });
    }
}

function emptyResult(outcome, archive) {
    return Object.freeze({ outcome, archive, receipt: null, plan: null, candidate: null, decision: null, observation: null });
}

// Mechanical selection derivation — see "Selection is mechanical, never a
// caller's free choice," above. Reads ONLY `plan.divergentCorrespondences`/
// `plan.claimsWithoutCorrespondence` (0.8.143's own, unmodified lists) for
// the exact `claimId` just received; never inspects any other entry, never
// falls back to a default, and never invents a `snapshotIndex` — it is
// always the SAME one 0.8.143 already reported for that correspondence.
function deriveSelectionForReceivedClaim(plan, claimId) {
    const divergentList = Array.isArray(plan.divergentCorrespondences) ? plan.divergentCorrespondences : [];
    const divergent = divergentList.find((entry) => entry.claimId === claimId);
    if (divergent) {
        return Object.freeze({ type: 'DIVERGENT_CORRESPONDENCE', claimId, snapshotIndex: divergent.snapshotIndex });
    }

    const withoutCorrespondenceList = Array.isArray(plan.claimsWithoutCorrespondence) ? plan.claimsWithoutCorrespondence : [];
    const withoutCorrespondence = withoutCorrespondenceList.find((entry) => entry.claimId === claimId);
    if (withoutCorrespondence) {
        return Object.freeze({ type: 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', claimId });
    }

    return null;
}
