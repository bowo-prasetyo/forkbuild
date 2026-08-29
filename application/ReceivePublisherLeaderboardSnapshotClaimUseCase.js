import { importPublisherLeaderboardSnapshotClaim, PublisherLeaderboardSnapshotClaimImportOutcome } from './PublisherLeaderboardSnapshotClaimExchange.js';
import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';
import { appendLeaderboardClaimHistoryEntry } from './LeaderboardClaimHistory.js';
import { PublicationObservationArchiveProvenanceOrigin, isValidPublicationObservationArchiveProvenanceOrigin } from './PublicationObservationArchiveProvenance.js';

// 0.8.123 — Signed Leaderboard Claim Archive: the receiving boundary.
//
// 0.8.122 gave a replica a way to turn an imported signed claim into a
// hydrated, structurally verified `PublisherLeaderboardSnapshotClaim` —
// and stopped there, deliberately: "receiving a signed claim through
// this milestone NEVER causes ForkBuild to alter its own leaderboard,
// persist anything, or treat the claim as more than an unopened envelope
// until [a separate, explicit] call runs." This class is the ONE,
// explicit construction boundary for the next step that milestone left
// unbuilt — turning that unopened envelope into a durable receipt on
// file, and nothing further:
//
//   payload (untrusted JSON / raw text)
//        │  importPublisherLeaderboardSnapshotClaim()   (0.8.122, UNCHANGED)
//        ▼
//   a hydrated claim, structurally verified
//        │  new LeaderboardClaimRecord({ claim, receivedAt, origin })   (0.8.123)
//        ▼
//   a durable receipt
//        │  appendLeaderboardClaimHistoryEntry()   (0.8.123, UNCHANGED)
//        ▼
//   a longer LeaderboardClaimHistory
//
// FOUR STEPS, EXACTLY, NEVER A FIFTH. `execute()` (1) accepts an imported
// signed claim, (2) structurally validates it is a genuine claim by
// delegating — never re-implementing — 0.8.122's own
// `importPublisherLeaderboardSnapshotClaim()`, (3) creates the durable
// receipt record, and (4) appends it. It never does a fifth thing: it
// never calls `application/PublisherLeaderboardSnapshotClaimVerification.js#verifyPublisherLeaderboardSnapshotClaim()`,
// never reads or touches `application/PublicationObservationArchive.js`,
// and never compares the received claim against this replica's own
// evidence in any way. A claim can be cryptographically genuine and
// structurally valid while being semantically stale or simply about a
// different replica's own reality entirely (see 0.8.121's own header,
// "The Signature Authenticates The Claim, Never The Evidence Itself") —
// this class records the STATEMENT exactly as it arrived, never rewrites
// the archive's own understanding of it based on today's computation. A
// caller who wants to know whether a particular received record still
// agrees with local evidence runs `verifyPublisherLeaderboardSnapshotClaim()`
// itself, separately, exactly as 0.8.122 already required for import
// alone — that discipline is unchanged and unextended here.
//
// NEVER THROWS FOR MALFORMED OR UNVERIFIABLE INPUT — THE IDENTICAL
// DISCIPLINE 0.8.122's OWN `importPublisherLeaderboardSnapshotClaim()`
// ALREADY HOLDS, REUSED HERE RATHER THAN REINVENTED. A payload that fails
// import (`INVALID_CLAIM` / `UNVERIFIABLE_CLAIM`) never becomes a
// receipt, never touches `history`, and is reported back as the exact
// same outcome 0.8.122 already names — this class invents no parallel
// failure vocabulary for a failure 0.8.122 already describes precisely.
// Only a missing/malformed `verifier` (a programmer error, checked once,
// at construction) or an invalid `origin` argument throws.
//
// `history` IS TAKEN AND RETURNED, NEVER HELD AS HIDDEN INSTANCE STATE —
// THE IDENTICAL IMMUTABLE-INPUT/IMMUTABLE-OUTPUT SHAPE
// `application/PublicationObservationArchive.js`'s OWN `.with...()`
// METHODS ALREADY HOLD. `execute(history, payload, origin)` never mutates
// the `history` array a caller passes in; on success it returns a NEW,
// longer, frozen array (via `appendLeaderboardClaimHistoryEntry()`,
// unchanged) for the caller to hold onto — exactly like
// `PublicationObservationArchive#withXxx()` returns a new archive rather
// than mutating the one it was called on. On failure, the returned
// `history` is a frozen COPY of the array handed in, unchanged in
// content.
//
// `origin` DEFAULTS TO `IMPORTED`, REUSING 0.8.83's OWN TWO-VALUE
// PROVENANCE VOCABULARY — NEVER A THIRD ONE. This use case's entire
// reason to exist is receiving a claim from somewhere else, so
// `PublicationObservationArchiveProvenanceOrigin.IMPORTED` is the honest
// default for every ordinary call. The parameter remains overridable
// (rather than hardcoded) only so a replica that also wants to keep its
// OWN freshly signed claims (from `application/
// CreatePublisherLeaderboardSnapshotClaimUseCase.js`) side by side in the
// identical history can label those `LOCAL` — a caller's own choice this
// class never makes on its behalf.
export const LeaderboardClaimReceiptOutcome = Object.freeze({
    RECEIVED: 'received',
    INVALID_CLAIM: PublisherLeaderboardSnapshotClaimImportOutcome.INVALID_CLAIM,
    UNVERIFIABLE_CLAIM: PublisherLeaderboardSnapshotClaimImportOutcome.UNVERIFIABLE_CLAIM
});

export class ReceivePublisherLeaderboardSnapshotClaimUseCase {
    constructor(verifier) {
        if (!verifier || typeof verifier.verifyPublisherLeaderboardSnapshotClaim !== 'function') {
            throw new Error('ReceivePublisherLeaderboardSnapshotClaimUseCase: an authorization verifier capable of verifyPublisherLeaderboardSnapshotClaim is required');
        }
        this._verifier = verifier;
    }

    // Returns a frozen `{ outcome, history, record, reason }`:
    //
    //   RECEIVED           — `record` is a genuine, freshly constructed
    //                        `LeaderboardClaimRecord`; `history` is a new,
    //                        longer array with it appended. `reason` is
    //                        `null`. This is NOT a statement that the
    //                        claim is true, current, or authoritative —
    //                        see this file's own header.
    //   INVALID_CLAIM      — `record` is `null`; `history` is unchanged.
    //                        The payload was not a structurally valid
    //                        claim — see 0.8.122's own
    //                        `importPublisherLeaderboardSnapshotClaim()`
    //                        for exactly what this covers.
    //   UNVERIFIABLE_CLAIM  — `record` is `null`; `history` is unchanged.
    //                        The payload was a well-formed candidate claim
    //                        whose signature did not structurally verify.
    //
    // Never throws for malformed or unverifiable `payload` — only a
    // missing/malformed `verifier` (checked at construction) or an
    // invalid `origin` argument throws.
    execute(history, payload, origin = PublicationObservationArchiveProvenanceOrigin.IMPORTED) {
        if (!isValidPublicationObservationArchiveProvenanceOrigin(origin)) {
            throw new Error('ReceivePublisherLeaderboardSnapshotClaimUseCase: origin must be a valid provenance origin (local or imported)');
        }
        const existingHistory = Object.freeze((Array.isArray(history) ? history : []).slice());

        const importResult = importPublisherLeaderboardSnapshotClaim(payload, this._verifier);
        if (importResult.outcome !== PublisherLeaderboardSnapshotClaimImportOutcome.IMPORTED) {
            return Object.freeze({
                outcome: importResult.outcome,
                history: existingHistory,
                record: null,
                reason: importResult.reason
            });
        }

        const record = new LeaderboardClaimRecord({ claim: importResult.claim, receivedAt: new Date(), origin });
        const nextHistory = appendLeaderboardClaimHistoryEntry(existingHistory, record);

        return Object.freeze({
            outcome: LeaderboardClaimReceiptOutcome.RECEIVED,
            history: nextHistory,
            record,
            reason: null
        });
    }
}
