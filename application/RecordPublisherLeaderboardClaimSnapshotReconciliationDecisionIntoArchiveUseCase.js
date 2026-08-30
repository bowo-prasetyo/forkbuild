import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin, isValidPublicationObservationArchiveProvenanceOrigin } from './PublicationObservationArchiveProvenance.js';

// 0.8.150 — Durable Reconciliation Decision History Archive Integration:
// the recording boundary, now writing to a durable archive.
//
// 0.8.145 built `describePublisherLeaderboardClaimSnapshotReconciliationDecision()`
// as the ONE, explicit boundary from a genuinely-selected candidate and an
// explicit disposition to a durable decision record — deliberately handed
// back to the caller, who decides whether and how to keep it (see that
// file's own header, "Deliberately excluded," bullet three). 0.8.146 gave
// that record a plain, caller-held, append-only home
// (`PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory`).
// 0.8.150 gave the archive itself a durable home for exactly that array —
// `reconciliationDecisionRecords`. This file is the thin, EXPLICIT
// persistence boundary connecting the two:
//
//   a genuine 0.8.145 decision record
//   (`{ decided: true, candidate, decision, decidedAt }`,
//    already computed by the CALLER — never by this file)
//        │
//        ▼
//   archive.appendReconciliationDecisionRecord(decision, origin)   (0.8.150)
//        │
//        ▼
//   a new PublicationObservationArchive
//
// UNLIKE `ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase.js`
// (0.8.130), THIS FILE DELEGATES TO NO INTERMEDIATE USE CASE — BECAUSE NONE
// EXISTS. 0.8.145 is a pure function, not a class-shaped use case; a caller
// already holds its own already-computed decision record (typically the
// direct return value of `describePublisherLeaderboardClaimSnapshotReconciliationDecision()`)
// before ever reaching this file. This class's entire, tiny job is exactly
// what its own name says: RECORD an already-decided decision INTO an
// archive — nothing upstream of that decision is this file's concern.
//
// NO VERIFICATION, NO PLAN RECONSTRUCTION, NO CANDIDATE REDISCOVERY, NO
// DUPLICATE ELIMINATION, NO STATE TRANSITION, NO `OBSERVE`/`DEFER`
// INTERPRETATION, NO AUTOMATIC RECONCILIATION — THE COMPLETE LIST OF WHAT
// THIS FILE DELIBERATELY DOES NOT DO. `execute()` never calls
// `application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// or any other module in the reconciliation family to re-derive, verify, or
// second-guess the decision record a caller hands it — it trusts the
// record's own `decided === true` exactly as far as
// `application/PublicationObservationArchive.js`'s own
// `appendReconciliationDecisionRecord()` already trusts it, and no further.
// This class never deduplicates two decisions naming the same candidate,
// never computes or reads any "current"/"resolved"/"pending" state, and
// never triggers any reconciliation action of any kind — see
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`'s
// own header, "A Reconciliation Decision Records An Explicit Choice," held
// here once more, one layer up.
//
// NEVER THROWS FOR A NON-GENUINE DECISION RECORD. A `decision` that is not
// a genuine `{ decided: true, ... }` object (missing, `null`, a
// `{ decided: false, ... }` outcome, or any other malformed value) is
// reported as `INVALID_DECISION` — never a thrown error, and never
// silently appended. Only an invalid `origin` argument throws.
//
// `archive` IS TAKEN AND RETURNED, NEVER HELD AS HIDDEN INSTANCE STATE —
// THE IDENTICAL IMMUTABLE-INPUT/IMMUTABLE-OUTPUT SHAPE EVERY
// `PublicationObservationArchive#appendXxx()` METHOD ALREADY HOLDS.
// `execute(archive, decision, origin)` never mutates the archive a caller
// passes in; on success it returns a NEW archive holding the appended
// record. On failure, the returned `archive` is the exact same instance
// (or its safe, empty degradation) handed in, unchanged.
//
// `origin` DEFAULTS TO `LOCAL`, THE OPPOSITE DEFAULT FROM
// `ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase.js`'s OWN
// `IMPORTED` DEFAULT — AND DELIBERATELY SO. A received claim's most
// ordinary path into this codebase is arriving FROM SOMEWHERE ELSE; a
// reconciliation decision's most ordinary path is a caller ON THIS REPLICA
// looking at its own reconciliation plan and explicitly recording what it
// decided — `PublicationObservationArchiveProvenanceOrigin.LOCAL` is the
// honest default for that ordinary call. The parameter remains overridable
// only so a replica importing a decision another replica already recorded
// (a genuinely separate, later capability — see this codebase's own
// roadmap, "Reconciliation Decision History Synchronization Exchange") can
// label it `IMPORTED` — a caller's own choice this class never makes on its
// behalf.
export const ReconciliationDecisionArchiveOutcome = Object.freeze({
    RECORDED: 'RECORDED',
    INVALID_DECISION: 'INVALID_DECISION'
});

export class RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase {
    // Returns a frozen `{ outcome, archive, record, reason }`:
    //
    //   RECORDED         — `record` is exactly the `decision` object
    //                       supplied; `archive` is a new
    //                       `PublicationObservationArchive` with it
    //                       appended. `reason` is `null`. This is NOT a
    //                       statement that the disposition is correct, that
    //                       the candidate should be acted on, or that any
    //                       reconciliation happened — see this file's own
    //                       header.
    //   INVALID_DECISION — `record` is `null`; `archive` is the exact
    //                       instance (or its safe, empty degradation)
    //                       handed in, unchanged. `decision` was not a
    //                       genuine `{ decided: true, candidate, decision,
    //                       decidedAt }` record.
    //
    // Never throws for a malformed `decision` — only an invalid `origin`
    // argument throws.
    execute(archive, decision, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!isValidPublicationObservationArchiveProvenanceOrigin(origin)) {
            throw new Error('RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase: origin must be a valid provenance origin (local or imported)');
        }
        const existingArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();

        if (!decision || typeof decision !== 'object' || decision.decided !== true) {
            return Object.freeze({
                outcome: ReconciliationDecisionArchiveOutcome.INVALID_DECISION,
                archive: existingArchive,
                record: null,
                reason: 'NOT_A_GENUINE_DECISION_RECORD'
            });
        }

        const nextArchive = existingArchive.appendReconciliationDecisionRecord(decision, origin);

        return Object.freeze({
            outcome: ReconciliationDecisionArchiveOutcome.RECORDED,
            archive: nextArchive,
            record: decision,
            reason: null
        });
    }
}
