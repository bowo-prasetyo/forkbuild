import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';
import { reconstructPublisherLeaderboardClaimHistory } from './PublisherLeaderboardClaimHistoryView.js';

// 0.8.129 — Claim History Timeline Projection.
//
// 0.8.128 answered "what measurable facts exist in this replica's own
// stored claim history?" — plain counts, tallied without regard to order.
// It deliberately never answered a narrower, order-sensitive question a
// set of counts is not shaped to answer either:
//
//   "What happened, and in what chronological order, in THIS replica's
//    OWN stored claim history?"
//
// This file is that projection, and nothing more — a temporal NARRATION
// layer, never another verification or ranking layer, over a replica's own
// `LeaderboardClaimHistory` (0.8.123's plain, ordered array of
// `LeaderboardClaimRecord`):
//
//   LeaderboardClaimHistory (0.8.123, UNCHANGED)
//          │
//          │  describePublisherLeaderboardClaimHistoryTimeline()  (THIS MILESTONE)
//          ▼
//   { entries: [{ claimId, signerIdentityId, evidenceFingerprint,
//                 policyVersion, snapshotFingerprint, claimCreatedAt,
//                 receivedAt, origin }, ...],
//     entryCount }
//
// Each timeline entry is derived directly from one genuine
// `LeaderboardClaimRecord` — nothing here is computed, inferred, or
// aggregated across records the way 0.8.128's own count maps are.
//
// `claimCreatedAt` VS `receivedAt` — THE ONE DISTINCTION THIS MILESTONE
// EXISTS TO MAKE OBSERVABLE. These are two different clocks, and this file
// never collapses them:
//
//   claimCreatedAt  — `claim.createdAt` (0.8.121, UNCHANGED). When the
//                      SIGNER created and signed the claim, on the
//                      signer's own clock. Carried through unchanged as
//                      plain metadata; never consulted for ordering.
//
//   receivedAt      — `record.receivedAt` (0.8.123, UNCHANGED). When THIS
//                      REPLICA'S OWN clock saw the claim arrive. THE
//                      timeline's own primary ordering key — see "The
//                      Timeline Orders By Reception, Not Creation," below.
//
// Concretely:
//
//   Claim A created 10:00, received by this replica at 10:05
//   Claim B created 09:55, received by this replica at 11:00
//
// Claim A appears BEFORE claim B in this replica's own timeline, even
// though B was created earlier by its signer — because the question this
// file answers is "when did this fact enter THIS REPLICA'S OWN history,"
// never "in what order did signers create their claims." A signer's own
// creation-time ordering is a fact about a DIFFERENT replica's clock
// (namely, the signer's) and is never something this replica can honestly
// reconstruct as a global order from its own local reception log alone.
//
// THE TIMELINE ORDERS BY RECEPTION, NOT CREATION. Entries are sorted by:
//
//   1. `receivedAt` ascending
//   2. original `history` array position, ascending, as the tie-break
//
// and by nothing else. `claimCreatedAt` NEVER determines position, signer
// identity is NEVER a tie-break, claim id is NEVER a tie-break, and no
// comparison anywhere in this file is locale-dependent (`receivedAt` is
// compared as `Date#getTime()`, never `localeCompare()` on any field). The
// history-array position is the tie-break specifically because two
// receipts can legitimately share the identical `receivedAt` — a batch
// import, or two records constructed with the same literal timestamp — and
// this file needs SOME deterministic order for those regardless; the order
// `history` itself already holds them in (oldest appended first, per
// `application/LeaderboardClaimHistory.js`'s own append-only discipline)
// is the one order this file has that carries no invented meaning.
//
// A PROJECTION OF HISTORY, NEVER A DEDUPLICATED CLAIM LIST — THE IDENTICAL
// RESTRAINT 0.8.128'S OWN "NO DEDUPLICATION OF HISTORY" ALREADY HOLDS, HELD
// HERE AGAIN OVER ORDER INSTEAD OF COUNTS. The same claim received three
// times (0.8.123's own multiplicity rule, UNCHANGED — once LOCAL, twice
// IMPORTED, say) produces THREE timeline entries, one per receipt, each
// carrying its own `receivedAt`/`origin` — never collapsed into one entry
// because the underlying `claimId` repeats. `entryCount` is `entries.length`
// exactly, i.e. a receipt count in the same sense 0.8.128's own `claimCount`
// is a receipt count, never a distinct-claim count.
//
// EACH ENTRY IS A NEW, PLAIN, FROZEN OBJECT OF NAMED SCALAR FIELDS — NEVER
// THE ORIGINAL `LeaderboardClaimRecord`, AND NEVER `record.toJSON()`. This
// is a deliberate departure from 0.8.127's own `sourceOnly`/`targetOnly`
// shape (the original record instances). A timeline entry is a NARRATION
// of a receipt for a reader, not a unit a caller feeds back into
// `application/PublisherLeaderboardClaimHistoryExchange.js`'s own
// import/apply pipeline (0.8.127's own record instances already serve
// that job, unchanged); the small, deliberately named shape this file
// documents in its own header is what a timeline reader actually wants —
// `claimId` rather than a nested `claim` object, `claimCreatedAt` named
// distinctly from `receivedAt` so the two clocks are never confused by a
// reader skimming field names alone. `receivedAt` is serialized as an ISO
// string (`Date#toISOString()`), exactly as `LeaderboardClaimRecord#toJSON()`
// already serializes it, so a timeline entry is trivially JSON-safe and
// byte-comparable without a caller reaching back into the original record.
// `claimCreatedAt` is serialized the identical way, off `claim.createdAt`.
//
// ARCHITECTURAL BOUNDARY: A RECEIPT LOG, NEVER A VERDICT — THE IDENTICAL
// BOUNDARY 0.8.127/0.8.128 ALREADY HOLD, HELD HERE AGAIN OVER CHRONOLOGY
// INSTEAD OF DIFFERENCE OR STATISTICS. This file imports nothing from
// `application/PublisherLeaderboardSnapshotClaimVerification.js`,
// `application/PublisherLeaderboardClaimVerificationView.js`, or
// `application/PublisherLeaderboardClaimVerificationHistoryView.js`
// (0.8.120/0.8.124/0.8.125) — grep it and none of that vocabulary appears.
// The timeline can only ever say "this claim receipt exists in the
// history, and these are its associated timestamps and metadata" — never
// "was this claim valid when it was received?" A claim appears in the
// timeline even if its signature is currently invalid; a claim whose
// semantic verification outcome later changes (because THIS replica's own
// current evidence changed) remains the SAME historical receipt, at the
// SAME timeline position, with the SAME fields, forever. See
// `application/LeaderboardClaimRecord.js`'s own header, "A Receipt, Never
// A Verdict" — held here a third time, over a chronological narration
// instead of a single stored fact.
//
// NO SEMANTIC INTERPRETATION, NO SCORE, NO RANK. This file carries no
// `valid`, `verified`, `trusted`, `trust`, `confidence`, `status`, `score`,
// `rank`, or `reputation` field, individually or combined, anywhere in its
// result or its own source.
//
// `describePublisherLeaderboardClaimHistoryTimeline()`/
// `reconstructPublisherLeaderboardClaimHistoryTimeline()` — THE IDENTICAL
// SPLIT EVERY OTHER FILE IN THE CLAIM-HISTORY FAMILY ALREADY HOLDS, EVEN
// THOUGH THERE IS STILL NO ARCHIVE TO RECONSTRUCT FROM.
// `describePublisherLeaderboardClaimHistoryTimeline()` is the pure
// computation, over one plain `LeaderboardClaimHistory` array.
// `reconstructPublisherLeaderboardClaimHistoryTimeline()` is presently a
// thin, identity wrapper around it — word for word
// `application/PublisherLeaderboardClaimHistoryStatisticsView.js`'s own
// `reconstructPublisherLeaderboardClaimHistoryStatistics()` reasoning, held
// here again: `LeaderboardClaimHistory` is already the plain, in-memory
// collection a caller holds directly, never something wrapped inside a
// `PublicationObservationArchive` that would need extraction first. The two
// names are kept distinct anyway so a future milestone that integrates
// claim history into `PublicationObservationArchive` (0.8.130) can teach
// the reconstruction to accept an archive without disturbing this file's
// own pure computation or any caller already using it directly.
//
// NO `sequence` FIELD IN THIS FIRST VERSION — DELIBERATELY. The internal,
// stable tie-break this file uses (original `history` array position) is
// kept as an implementation detail, never exposed as a named field. A
// future version MAY add a `sequence` field, but only if it means exactly
// "original history position" and never a newly invented event number —
// see this file's own header, "The Timeline Orders By Reception, Not
// Creation," for the one ordering fact `sequence` would be allowed to
// expose. Keeping the projection narrower for now costs nothing: a reader
// who needs the tie-break can already recover it by noting which entries
// share a `receivedAt` and trusting `entries`' own array order.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates the input history or any record it holds. Returns frozen
// objects and a frozen array throughout. Calling either function twice
// with a byte-identical argument returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY TIMELINE — NEVER THROWS. `null`,
// `undefined`, a non-array, or an array containing entries that are not
// genuine `LeaderboardClaimRecord` instances are all tolerated exactly as
// `application/PublisherLeaderboardClaimHistoryStatisticsView.js`'s own
// `describePublisherLeaderboardClaimHistoryStatistics()` already tolerates
// its own history argument: non-`LeaderboardClaimRecord` entries are
// silently excluded, and an entirely malformed/absent history produces an
// empty, frozen `entries` array and `entryCount` 0.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No verification, trust, or
// "was this claim valid when it was received" determination of any kind —
// see "Architectural Boundary," above. No ranking, scoring, or "best
// signer" determination of any kind — see 0.8.112's own, already-built,
// explicitly evaluative `PublisherRankingPolicy.js` for where that concern
// lives. No integration with `PublicationObservationArchive` — that is
// 0.8.130's own, separately sized question. No `sequence` field — see "No
// `sequence` Field In This First Version," above.
export function describePublisherLeaderboardClaimHistoryTimeline(history) {
    const records = (Array.isArray(history) ? history : []).filter((record) => record instanceof LeaderboardClaimRecord);

    const indexed = records.map((record, position) => ({ record, position }));
    indexed.sort((a, b) => {
        const receivedAtDelta = a.record.receivedAt.getTime() - b.record.receivedAt.getTime();
        if (receivedAtDelta !== 0) return receivedAtDelta;
        return a.position - b.position;
    });

    const entries = indexed.map(({ record }) => Object.freeze({
        claimId: record.claim.id,
        signerIdentityId: record.claim.signerIdentityId,
        evidenceFingerprint: record.claim.evidenceFingerprint,
        policyVersion: record.claim.policyVersion,
        snapshotFingerprint: record.claim.snapshotFingerprint,
        claimCreatedAt: record.claim.createdAt.toISOString(),
        receivedAt: record.receivedAt.toISOString(),
        origin: record.origin
    }));

    return Object.freeze({
        entries: Object.freeze(entries),
        entryCount: entries.length
    });
}

// reconstructPublisherLeaderboardClaimHistoryTimeline() — 0.8.130's own
// promised archive-reading entry point, mirroring
// `reconstructPublisherLeaderboardClaimHistoryStatistics()` exactly, one
// projection over: it pulls this replica's own stored `LeaderboardClaimHistory`
// straight out of `archive` via application/
// PublisherLeaderboardClaimHistoryView.js's own
// `reconstructPublisherLeaderboardClaimHistory()` (0.8.130), then hands it,
// unchanged, to the pure computation above. An invalid/missing `archive`
// degrades to `PublicationObservationArchive.empty()`, never a throw.
export function reconstructPublisherLeaderboardClaimHistoryTimeline(archive) {
    return describePublisherLeaderboardClaimHistoryTimeline(reconstructPublisherLeaderboardClaimHistory(archive));
}
