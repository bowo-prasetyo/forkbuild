import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin, isValidPublicationObservationArchiveProvenanceOrigin } from './PublicationObservationArchiveProvenance.js';

// 0.8.167 — Durable Revalidation Observation History Archive Integration:
// the recording boundary, now writing to a durable archive.
//
// 0.8.162 built `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation()`
// as the ONE, explicit boundary from a historical decision record and an
// explicitly supplied plan to a durable observation record — deliberately
// handed back to the caller, who decides whether and how to keep it (see
// that file's own header, "No persistence, no `PublicationObservationArchive`
// integration... Integrating this record into `PublicationObservationArchive`
// ... is separate, later work (0.8.163/0.8.164, per this milestone's own
// request), never built here"). 0.8.163 gave that record a plain,
// caller-held, append-only home (`PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory`).
// 0.8.167 gave the archive itself a durable home for exactly that array —
// `revalidationObservationRecords`. This file is the thin, EXPLICIT
// persistence boundary connecting the two, mirroring application/
// RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionIntoArchiveUseCase.js
// (0.8.150) exactly, one subject over:
//
//   a genuine 0.8.162 observation record
//   (`{ observed: true, decision, planIdentity, candidatePresent,
//      candidateType, candidateMatchesPlan, observedAt }`,
//    already computed by the CALLER — never by this file)
//        │
//        ▼
//   archive.appendRevalidationObservationRecord(observation, origin)   (0.8.167)
//        │
//        ▼
//   a new PublicationObservationArchive
//
// UNLIKE `ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase.js`
// (0.8.130), THIS FILE DELEGATES TO NO INTERMEDIATE USE CASE — BECAUSE NONE
// EXISTS, THE IDENTICAL REASON 0.8.150'S OWN USE CASE ALREADY GIVES. 0.8.162
// is a pure function, not a class-shaped use case; a caller already holds
// its own already-computed observation record (typically the direct return
// value of
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation()`)
// before ever reaching this file. This class's entire, tiny job is exactly
// what its own name says: RECORD an already-observed observation INTO an
// archive — nothing upstream of that observation is this file's concern.
//
// NO RECOMPUTATION, NO REVALIDATION OF THE DECISION, NO PLAN
// RECONSTRUCTION, NO CANDIDATE REDISCOVERY, NO DUPLICATE ELIMINATION, NO
// CALL TO 0.8.157-0.8.162 — THE COMPLETE LIST OF WHAT THIS FILE
// DELIBERATELY DOES NOT DO. `execute()` never calls `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`
// (0.8.162), `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationPlanIdentityView.js`
// (0.8.161), `application/PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity.js`
// (0.8.160), or any other module in the revalidation family to re-derive,
// verify, or second-guess the observation record a caller hands it — it
// trusts the record's own `observed === true` exactly as far as
// `application/PublicationObservationArchive.js`'s own
// `appendRevalidationObservationRecord()` already trusts it, and no
// further. This class never deduplicates two observations naming the same
// decision or plan, never computes or reads any "current"/"resolved"/
// "stale" state, and never triggers any revalidation action of any kind —
// see `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`'s
// own header, "A Record Of What Was Explicitly Observed, Never A New
// Decision," held here once more, one layer up.
//
// NEVER THROWS FOR A NON-GENUINE OBSERVATION RECORD. An `observation` that
// is not a genuine `{ observed: true, ... }` object (missing, `null`, an
// `{ observed: false, outcome: 'INVALID_OBSERVATION' }` outcome, or any
// other malformed value) is reported as `INVALID_OBSERVATION` — never a
// thrown error, and never silently appended. Only an invalid `origin`
// argument throws.
//
// `archive` IS TAKEN AND RETURNED, NEVER HELD AS HIDDEN INSTANCE STATE —
// THE IDENTICAL IMMUTABLE-INPUT/IMMUTABLE-OUTPUT SHAPE EVERY
// `PublicationObservationArchive#appendXxx()` METHOD ALREADY HOLDS.
// `execute(archive, observation, origin)` never mutates the archive a
// caller passes in; on success it returns a NEW archive holding the
// appended record. On failure, the returned `archive` is the exact same
// instance (or its safe, empty degradation) handed in, unchanged.
//
// `origin` DEFAULTS TO `LOCAL`, THE IDENTICAL DEFAULT 0.8.150'S OWN
// RECORDING USE CASE ALREADY HOLDS, FOR THE IDENTICAL REASON. A
// revalidation observation's most ordinary path into this codebase is a
// caller ON THIS REPLICA explicitly checking one of its own historical
// decisions against an explicitly supplied plan —
// `PublicationObservationArchiveProvenanceOrigin.LOCAL` is the honest
// default for that ordinary call. The parameter remains overridable only
// so a replica importing an observation another replica already recorded
// (a genuinely separate, later capability) can label it `IMPORTED` — a
// caller's own choice this class never makes on its behalf.
export const RevalidationObservationArchiveOutcome = Object.freeze({
    RECORDED: 'RECORDED',
    INVALID_OBSERVATION: 'INVALID_OBSERVATION'
});

export class RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase {
    // Returns a frozen `{ outcome, archive, record, reason }`:
    //
    //   RECORDED           — `record` is exactly the `observation` object
    //                        supplied; `archive` is a new
    //                        `PublicationObservationArchive` with it
    //                        appended. `reason` is `null`. This is NOT a
    //                        statement that the underlying decision is
    //                        correct, that the plan is current, or that any
    //                        revalidation action happened — see this file's
    //                        own header.
    //   INVALID_OBSERVATION — `record` is `null`; `archive` is the exact
    //                        instance (or its safe, empty degradation)
    //                        handed in, unchanged. `observation` was not a
    //                        genuine `{ observed: true, decision,
    //                        planIdentity, candidatePresent, candidateType,
    //                        candidateMatchesPlan, observedAt }` record.
    //
    // Never throws for a malformed `observation` — only an invalid `origin`
    // argument throws.
    execute(archive, observation, origin = PublicationObservationArchiveProvenanceOrigin.LOCAL) {
        if (!isValidPublicationObservationArchiveProvenanceOrigin(origin)) {
            throw new Error('RecordPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationIntoArchiveUseCase: origin must be a valid provenance origin (local or imported)');
        }
        const existingArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();

        if (!observation || typeof observation !== 'object' || observation.observed !== true) {
            return Object.freeze({
                outcome: RevalidationObservationArchiveOutcome.INVALID_OBSERVATION,
                archive: existingArchive,
                record: null,
                reason: 'NOT_A_GENUINE_OBSERVATION_RECORD'
            });
        }

        const nextArchive = existingArchive.appendRevalidationObservationRecord(observation, origin);

        return Object.freeze({
            outcome: RevalidationObservationArchiveOutcome.RECORDED,
            archive: nextArchive,
            record: observation,
            reason: null
        });
    }
}
