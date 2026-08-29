import { ReceivePublisherLeaderboardSnapshotClaimUseCase, LeaderboardClaimReceiptOutcome } from './ReceivePublisherLeaderboardSnapshotClaimUseCase.js';
import { PublicationObservationArchive } from './PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin, isValidPublicationObservationArchiveProvenanceOrigin } from './PublicationObservationArchiveProvenance.js';

// 0.8.130 — Durable Signed Leaderboard Claim History Archive Integration:
// the receiving boundary, now writing to a durable archive.
//
// 0.8.123 built `ReceivePublisherLeaderboardSnapshotClaimUseCase` as the
// ONE, explicit construction boundary from an imported payload to a durable
// `LeaderboardClaimRecord`, appended to a plain, caller-held
// `LeaderboardClaimHistory` array — deliberately never touching
// application/PublicationObservationArchive.js at all (see that use case's
// own header, "it never... reads or touches application/
// PublicationObservationArchive.js"). 0.8.130 gave the archive itself a
// durable home for exactly that array — `leaderboardClaimRecords`. This
// file is the thin, EXPLICIT persistence boundary connecting the two:
//
//   portable payload (untrusted JSON / raw text)
//        │  ReceivePublisherLeaderboardSnapshotClaimUseCase#execute()  (0.8.123, UNCHANGED)
//        │    │  importPublisherLeaderboardSnapshotClaim()   (0.8.122, UNCHANGED)
//        │    ▼
//        │  a hydrated claim, structurally verified
//        │    │  new LeaderboardClaimRecord({ claim, receivedAt, origin })  (0.8.123, UNCHANGED)
//        │    ▼
//        │  a durable receipt
//        ▼
//   archive.appendLeaderboardClaimRecord(record, origin)   (0.8.130)
//        │
//        ▼
//   a new PublicationObservationArchive
//
// THE EXISTING USE CASE REMAINS RESPONSIBLE FOR THE CLAIM-HISTORY
// OPERATION; THIS FILE ADDS ONLY THE ARCHIVE PERSISTENCE BOUNDARY — THE ONE
// RULE THIS FILE EXISTS TO HOLD. `ReceivePublisherLeaderboardSnapshotClaimUseCase`'s
// own contract (import, structurally validate, construct the receipt,
// never verify semantically, never touch an archive) is NOT reimplemented
// here — this class DELEGATES to it, unchanged, passing
// `archive.leaderboardClaimRecords` as the plain history array that use
// case already expects. This class's own, entirely new work is exactly one
// further step: taking the `LeaderboardClaimRecord` that delegate produces
// and appending it to a REAL `PublicationObservationArchive` via that
// class's own `appendLeaderboardClaimRecord()` (0.8.130, UNCHANGED) —
// never a second, competing claim-construction path.
//
// NO SEMANTIC VERIFICATION, NO RANKING, NO TRUST DECISION, NO AUTOMATIC
// EVIDENCE SYNCHRONIZATION — THE IDENTICAL EXCLUSIONS
// `ReceivePublisherLeaderboardSnapshotClaimUseCase`'s OWN HEADER ALREADY
// HOLDS, RESTATED HERE ONE LAYER UP. `execute()` never calls
// `application/PublisherLeaderboardSnapshotClaimVerification.js#verifyPublisherLeaderboardSnapshotClaim()`,
// never compares the received claim against the archive's own evidence,
// and never mutates any of the archive's other ten collections. A claim
// can be cryptographically genuine and structurally valid while being
// semantically stale, or about a different replica's own reality entirely
// — this class records the STATEMENT exactly as it arrived, durably, and
// stops there. A caller who wants to know whether a particular received
// record still agrees with local evidence runs application/
// PublisherLeaderboardClaimVerificationHistoryView.js's own
// `reconstructPublisherLeaderboardClaimVerificationHistory()` (0.8.125,
// UNCHANGED) itself, separately, exactly as every other file in this
// family already requires.
//
// NEVER THROWS FOR MALFORMED OR UNVERIFIABLE INPUT — THE IDENTICAL
// DISCIPLINE `ReceivePublisherLeaderboardSnapshotClaimUseCase`'s OWN
// `execute()` ALREADY HOLDS, REUSED HERE RATHER THAN REINVENTED. A payload
// that fails import (`INVALID_CLAIM`/`UNVERIFIABLE_CLAIM`) never becomes a
// receipt, never touches `archive`, and is reported back as the exact same
// outcome the delegate already names. Only a missing/malformed `verifier`
// (checked once, at construction, by the delegate itself) or an invalid
// `origin` argument throws.
//
// `archive` IS TAKEN AND RETURNED, NEVER HELD AS HIDDEN INSTANCE STATE —
// THE IDENTICAL IMMUTABLE-INPUT/IMMUTABLE-OUTPUT SHAPE EVERY
// `PublicationObservationArchive#appendXxx()` METHOD ALREADY HOLDS.
// `execute(archive, payload, origin)` never mutates the archive a caller
// passes in; on success it returns a NEW archive holding the appended
// record. On failure, the returned `archive` is the exact same instance
// (or its safe, empty degradation) handed in, unchanged.
//
// `origin` DEFAULTS TO `IMPORTED`, REUSING 0.8.83's OWN TWO-VALUE
// PROVENANCE VOCABULARY — NEVER A THIRD ONE, AND USED FOR BOTH THE
// RECEIPT'S OWN `origin` FIELD AND THE ARCHIVE'S OWN PARALLEL PROVENANCE
// TAG. This class's entire reason to exist is receiving a claim from
// somewhere else, so `PublicationObservationArchiveProvenanceOrigin.IMPORTED`
// is the honest default for every ordinary call. The parameter remains
// overridable (rather than hardcoded) only so a replica that also wants to
// keep its OWN freshly signed claims (from application/
// CreatePublisherLeaderboardSnapshotClaimUseCase.js) side by side in the
// identical archive collection can label those `LOCAL` — a caller's own
// choice this class never makes on its behalf.
export { LeaderboardClaimReceiptOutcome as LeaderboardClaimArchiveReceiptOutcome };

export class ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase {
    constructor(verifier) {
        this._delegate = new ReceivePublisherLeaderboardSnapshotClaimUseCase(verifier);
    }

    // Returns a frozen `{ outcome, archive, record, reason }`:
    //
    //   RECEIVED           — `record` is a genuine, freshly constructed
    //                        `LeaderboardClaimRecord`; `archive` is a new
    //                        `PublicationObservationArchive` with it
    //                        appended. `reason` is `null`. This is NOT a
    //                        statement that the claim is true, current, or
    //                        authoritative — see this file's own header.
    //   INVALID_CLAIM      — `record` is `null`; `archive` is the exact
    //                        instance (or its safe, empty degradation)
    //                        handed in, unchanged. The payload was not a
    //                        structurally valid claim — see 0.8.122's own
    //                        `importPublisherLeaderboardSnapshotClaim()`
    //                        for exactly what this covers.
    //   UNVERIFIABLE_CLAIM  — `record` is `null`; `archive` unchanged. The
    //                        payload was a well-formed candidate claim
    //                        whose signature did not structurally verify.
    //
    // Never throws for malformed or unverifiable `payload` — only a
    // missing/malformed `verifier` (checked at construction, by the
    // delegate) or an invalid `origin` argument throws.
    execute(archive, payload, origin = PublicationObservationArchiveProvenanceOrigin.IMPORTED) {
        if (!isValidPublicationObservationArchiveProvenanceOrigin(origin)) {
            throw new Error('ReceivePublisherLeaderboardSnapshotClaimIntoArchiveUseCase: origin must be a valid provenance origin (local or imported)');
        }
        const existingArchive = archive instanceof PublicationObservationArchive ? archive : PublicationObservationArchive.empty();

        const received = this._delegate.execute(existingArchive.leaderboardClaimRecords, payload, origin);
        if (received.outcome !== LeaderboardClaimReceiptOutcome.RECEIVED) {
            return Object.freeze({
                outcome: received.outcome,
                archive: existingArchive,
                record: null,
                reason: received.reason
            });
        }

        const nextArchive = existingArchive.appendLeaderboardClaimRecord(received.record, origin);

        return Object.freeze({
            outcome: LeaderboardClaimReceiptOutcome.RECEIVED,
            archive: nextArchive,
            record: received.record,
            reason: null
        });
    }
}
