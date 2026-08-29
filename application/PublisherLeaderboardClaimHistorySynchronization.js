import { reconstructPublisherLeaderboardClaimHistory } from './PublisherLeaderboardClaimHistoryView.js';
import {
    describePublisherLeaderboardClaimHistoryDifference,
    reconstructPublisherLeaderboardClaimHistoryDifference
} from './PublisherLeaderboardClaimHistoryDifference.js';
import {
    exportPublisherLeaderboardClaimHistory,
    applyPublisherLeaderboardClaimHistoryExchange
} from './PublisherLeaderboardClaimHistoryExchange.js';

// 0.8.131 — Claim History Synchronization Exchange.
//
// 0.8.126 gave two replicas a way to TRANSPORT an entire claim history —
// export, import, apply — but blindly: exporting a whole history re-sends
// every receipt a replica has ever recorded, whether or not the other side
// already holds it. 0.8.127 gave two replicas a way to LEARN exactly which
// receipts differ — but purely as a read: it never moves anything itself.
// Neither file was ever asked to work together in one call. This file is
// that missing connective layer, one level above both, unchanged:
//
//   sourceHistory                                    targetHistory
//        │                                                 │
//        └──────────── describe the difference ────────────┘
//                    (0.8.127, UNCHANGED)
//                              │
//                              ▼
//                   { sourceOnly, targetOnly, ... }
//                              │
//     exportPublisherLeaderboardClaimHistorySynchronization()   (THIS MILESTONE)
//         — exports ONLY sourceOnly, via exportPublisherLeaderboardClaimHistory()
//           (0.8.126, UNCHANGED)
//                              │
//                              ▼
//                  { protocolVersion: 1, claims: [...] }
//                              │
//     applyPublisherLeaderboardClaimHistorySynchronization()   (THIS MILESTONE)
//         — delegates directly to applyPublisherLeaderboardClaimHistoryExchange()
//           (0.8.126, UNCHANGED)
//                              │
//                              ▼
//                    targetHistory, now also holding every receipt it was
//                    genuinely missing — nothing it already had, resent
//
// AN ORCHESTRATOR, NEVER A SECOND ENGINE — THE ONE RULE THIS FILE EXISTS TO
// ENFORCE. Every one of the four functions below is a thin composition of
// functions this milestone does not touch: `describePublisherLeaderboardClaimHistoryDifference()`/
// `reconstructPublisherLeaderboardClaimHistoryDifference()` (0.8.127),
// `exportPublisherLeaderboardClaimHistory()`/
// `applyPublisherLeaderboardClaimHistoryExchange()` (0.8.126), and
// `reconstructPublisherLeaderboardClaimHistory()` (0.8.130's own
// archive-reading seam). Grep this file and there is no second receipt-
// identity comparison, no second JSON envelope shape, no second append
// path, and no second archive-reading routine anywhere in it — every one
// of those already exists, exactly once, one or two files away. This file
// invents nothing except the ONE new idea 0.8.126 and 0.8.127 never
// combined on their own: "export only what the difference says one side is
// missing."
//
// DIRECTIONAL, EXPLICIT, AND NEVER RECIPROCAL ON ITS OWN. `exportPublisherLeaderboardClaimHistorySynchronization(sourceHistory,
// targetHistory)` answers exactly one direction — "what does `source` have
// that `target` lacks?" — and produces a payload meant for `target` alone.
// It never also computes or returns the reverse; a caller wanting both
// replicas fully caught up calls this file's own functions twice, with the
// two histories swapped, exactly as `application/
// PublisherLeaderboardClaimHistoryExchange.js`'s own header already
// documents for its own `applyPublisherLeaderboardClaimHistoryExchange()`
// ("a caller wanting two replicas to fully converge runs the identical
// exchange in both directions"). See this file's own FLAGSHIP test, below,
// for exactly that: two separate, explicit synchronization calls, one per
// direction — never one call that mutates both sides at once.
//
// `describePublisherLeaderboardClaimHistorySynchronization()` — A PURE,
// UNMODIFIED PASSTHROUGH TO 0.8.127'S OWN DIFFERENCE PROJECTION, KEPT AS
// ITS OWN NAMED ENTRY POINT SO A CALLER WORKING AT THIS FILE'S OWN
// VOCABULARY NEVER HAS TO REACH INTO `PublisherLeaderboardClaimHistoryDifference.js`
// DIRECTLY. It computes no new comparison algorithm and returns exactly
// 0.8.127's own frozen `{ sourceCount, targetCount, sourceOnlyCount,
// targetOnlyCount, sameHistory, sourceOnly, targetOnly }` shape, byte for
// byte — the identical receipt-identity, multiset-aware comparison 0.8.127
// already proved, unchanged.
//
// `reconstructPublisherLeaderboardClaimHistorySynchronization()` — THE
// ARCHIVE-READING COUNTERPART, LIKEWISE A PURE PASSTHROUGH. It reads each
// side's own durable `LeaderboardClaimHistory` straight out of its own
// `PublicationObservationArchive` via `reconstructPublisherLeaderboardClaimHistory()`
// (0.8.130's own seam), then hands both, unchanged, to
// `describePublisherLeaderboardClaimHistorySynchronization()` above — the
// identical two-step 0.8.127's own `reconstructPublisherLeaderboardClaimHistoryDifference()`
// already performs, reused here rather than reimplemented. An invalid or
// missing `sourceArchive`/`targetArchive` degrades to an empty history
// independently on each side, never a throw — the same tolerance every
// other `reconstructXxx()` in this family already holds.
//
// `exportPublisherLeaderboardClaimHistorySynchronization()` — THE ONE
// GENUINELY NEW COMPOSITION THIS MILESTONE ADDS. It computes the
// difference (above), then hands `difference.sourceOnly` — and ONLY
// `difference.sourceOnly` — to `exportPublisherLeaderboardClaimHistory()`
// (0.8.126, UNCHANGED). The resulting payload is EXACTLY 0.8.126's own
// wire shape, `{ protocolVersion: 1, claims: [...] }` — never a new
// envelope, never a "synchronization" field, never a diff summary riding
// alongside the receipts. A receiver of this payload cannot tell, from the
// payload alone, that it was produced by a synchronization call rather
// than a full `exportPublisherLeaderboardClaimHistory()` call — it is one,
// deliberately, so `importPublisherLeaderboardClaimHistory()` and
// `applyPublisherLeaderboardClaimHistoryExchange()` (0.8.126, UNCHANGED)
// need not learn a new shape to consume it. When the two histories already
// agree, `sourceOnly` is empty and this function exports a genuine,
// well-formed empty history payload — exactly as 0.8.126's own
// `exportPublisherLeaderboardClaimHistory([])` already does for an empty
// array — never a special "nothing to synchronize" sentinel.
//
// `applyPublisherLeaderboardClaimHistorySynchronization()` — A DIRECT,
// UNMODIFIED DELEGATION TO 0.8.126'S OWN IMPORTER/APPLIER. It performs
// NOTHING of its own beyond calling `applyPublisherLeaderboardClaimHistoryExchange(targetHistory,
// payload, verifier)` and returning its result exactly as given — every
// structural verification rule, every receipt-identity deduplication rule,
// every per-entry rejection, and every idempotency guarantee 0.8.126
// already proved apply here completely unchanged. This is deliberate: a
// synchronization payload IS an ordinary 0.8.126 history-exchange payload
// (see immediately above), so applying one is not a new operation — it is
// the SAME operation, reached through this file's own name for a
// caller who thinks in terms of "synchronize," never "exchange."
//
// STRICT BOUNDARIES THIS MILESTONE DELIBERATELY HOLDS — NOT MERELY
// OMITTED. This file never:
//   - performs semantic claim verification of any kind (no import from
//     `PublisherLeaderboardSnapshotClaimVerification.js`,
//     `PublisherLeaderboardClaimVerificationView.js`, or
//     `PublisherLeaderboardClaimVerificationHistoryView.js` appears here —
//     see 0.8.127's own identical restraint, held again);
//   - decides which signer is trustworthy, or ranks/scores any signer or
//     claim in any way;
//   - deletes or replaces a receipt already on file — synchronization
//     only ever APPENDS, via 0.8.126's own unchanged append path;
//   - deduplicates two GENUINELY distinct receipts of the same claim
//     (0.8.123's own multiplicity rule is inherited unchanged through
//     0.8.126/0.8.127 and is never weakened here — see this file's own
//     FLAGSHIP, below, where `B1` and `B2` both survive);
//   - modifies any evidence collection on any archive — a
//     `PublicationObservationArchive` is read ONLY by
//     `reconstructPublisherLeaderboardClaimHistorySynchronization()`, and
//     never written to by any function in this file;
//   - reconstructs an achievement, a ranking, or a leaderboard of any
//     kind;
//   - introduces a synchronization-specific timestamp of any kind — a
//     receipt's own `receivedAt` travels exactly as 0.8.126 already
//     carries it, unregenerated;
//   - performs background or network I/O of any kind — every function
//     here is synchronous, and calling any of them twice with
//     byte-identical arguments returns a byte-identical result;
//   - persists anything automatically — nothing here calls `.save()` on
//     any archive or storage provider; a caller owns persisting whatever
//     history or archive this file's own functions return, exactly as
//     0.8.126/0.8.127/0.8.130 already require of their own callers;
//   - invents a new receipt-identity rule — `receiptIdentity = structural
//     identity of (claim, receivedAt, origin)` remains EXACTLY 0.8.126's/
//     0.8.127's own rule, imported by composition, never restated or
//     narrowed here;
//   - introduces a new wire protocol or envelope shape — every payload
//     this file produces or consumes is byte-identical in shape to
//     0.8.126's own, unchanged `{ protocolVersion, claims }` envelope.
//
// FLAGSHIP. Alice holds `[A, B, B1]`: her own claim A, a receipt for Bob's
// claim B she genuinely shares byte-for-byte with Bob, and her own
// additional, distinct receipt for that same claim B (`B1` — a genuinely
// different `receivedAt`/`origin`, not a different claim). Bob holds
// `[B, B2, C]`: his own copy of the shared B receipt, his own additional,
// distinct receipt for claim B (`B2`), and a received claim C. Running
// `exportPublisherLeaderboardClaimHistorySynchronization(aliceHistory,
// bobHistory)` names Alice's exclusive receipts (`[A, B1]`, mirroring
// 0.8.127's own difference exactly); applying that payload to Bob's
// history via `applyPublisherLeaderboardClaimHistorySynchronization()`
// folds both onto the end of Bob's own history. Running the identical
// pair the other direction — `exportPublisherLeaderboardClaimHistorySynchronization(bobHistory,
// aliceHistory)` then applying the result to Alice's own, ORIGINAL history
// — folds Bob's exclusive receipts (`[B2, C]`) onto Alice's. Both
// replicas now hold five receipts each — `A`, `B`, `B1`, `B2`, `C` — and a
// following `describePublisherLeaderboardClaimHistorySynchronization()`
// call reports `sameHistory === true`, `sourceOnlyCount === 0`,
// `targetOnlyCount === 0`, even though the two histories hold their five
// receipts in genuinely different orders (append-only history, never
// reordered — 0.8.123's own restraint, unchanged). Crucially, `B1` and
// `B2` remain two separate receipts throughout — neither synchronization
// call ever collapses them, exactly as 0.8.123's own multiplicity rule
// requires.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No claim
// conflict/agreement projection ("which claims share a signer, an
// evidence fingerprint, or a snapshot fingerprint, without collapsing that
// into a trust judgment" — real, separately sized, later work). No
// automatic, periodic, or background synchronization of any kind — every
// step here still runs only when a caller explicitly calls it, exactly as
// every file it composes already requires. No bidirectional
// "synchronize both ways in one call" convenience function — see
// "Directional, explicit, and never reciprocal on its own," above; a
// caller wanting full convergence still makes two explicit calls, one per
// direction, exactly like 0.8.126's own header already asks of its own
// `applyPublisherLeaderboardClaimHistoryExchange()`.
export function describePublisherLeaderboardClaimHistorySynchronization(sourceHistory, targetHistory) {
    return describePublisherLeaderboardClaimHistoryDifference(sourceHistory, targetHistory);
}

export function reconstructPublisherLeaderboardClaimHistorySynchronization(sourceArchive, targetArchive) {
    return reconstructPublisherLeaderboardClaimHistoryDifference(sourceArchive, targetArchive);
}

// exportPublisherLeaderboardClaimHistorySynchronization() — the one
// genuinely new composition: export ONLY the receipts `sourceHistory`
// holds that `targetHistory` does not (see this file's own header). The
// returned payload is EXACTLY `exportPublisherLeaderboardClaimHistory()`'s
// own (0.8.126, UNCHANGED) shape and tolerance — malformed/absent
// `sourceHistory`/`targetHistory` degrade to an empty difference, which in
// turn exports a genuine, well-formed empty history payload, never a
// throw.
export function exportPublisherLeaderboardClaimHistorySynchronization(sourceHistory, targetHistory) {
    const difference = describePublisherLeaderboardClaimHistorySynchronization(sourceHistory, targetHistory);
    return exportPublisherLeaderboardClaimHistory(difference.sourceOnly);
}

// applyPublisherLeaderboardClaimHistorySynchronization() — a direct,
// unmodified delegation to `applyPublisherLeaderboardClaimHistoryExchange()`
// (0.8.126, UNCHANGED). See this file's own header for why this is a
// deliberate pass-through rather than a new operation: a synchronization
// payload IS an ordinary claim-history exchange payload.
export function applyPublisherLeaderboardClaimHistorySynchronization(targetHistory, payload, verifier) {
    return applyPublisherLeaderboardClaimHistoryExchange(targetHistory, payload, verifier);
}
