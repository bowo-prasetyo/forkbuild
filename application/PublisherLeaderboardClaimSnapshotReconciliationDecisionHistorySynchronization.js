import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference
} from './PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js';
import {
    exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory,
    applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange
} from './PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange.js';

// 0.8.152 — Reconciliation Decision History Synchronization.
//
// 0.8.150 gave a replica a durable, archive-backed home for its own
// reconciliation decisions. 0.8.151 gave two replicas a way to TRANSPORT an
// entire decision history between them — export, import, apply — but
// blindly: exporting a whole history re-sends every decision a replica has
// ever recorded, whether or not the other side already holds it. 0.8.149
// gave two replicas a way to LEARN exactly which decisions differ — but
// purely as a read: it never moves anything itself. Neither file was ever
// asked to work together in one call. This file is that missing connective
// layer, one level above both — the identical composition
// `application/PublisherLeaderboardClaimHistorySynchronization.js` (0.8.131)
// already proved one subject over, held here again over decision histories
// instead of claim histories:
//
//   sourceHistory                                    targetHistory
//        │                                                 │
//        └──────────── describe the difference ────────────┘
//                    (0.8.149, UNCHANGED)
//                              │
//                              ▼
//                   { sourceOnly, targetOnly, ... }
//                              │
//     exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization()   (THIS MILESTONE)
//         — exports ONLY sourceOnly, via
//           exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()
//           (0.8.151, UNCHANGED)
//                              │
//                              ▼
//                  { protocolVersion: 1, decisions: [...] }
//                              │
//     applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization()   (THIS MILESTONE)
//         — delegates directly to
//           applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange()
//           (0.8.151, UNCHANGED)
//                              │
//                              ▼
//                    targetHistory, now also holding every decision it was
//                    genuinely missing — nothing it already had, resent
//
// DIFFERENCE DETERMINES WHAT IS MISSING; EXCHANGE TRANSPORTS IT;
// SYNCHRONIZATION COMPOSES THE TWO WITHOUT CREATING A THIRD ALGORITHM — THE
// ONE RULE THIS FILE EXISTS TO ENFORCE. Every one of the four functions
// below is a thin composition of functions this milestone does not touch:
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference()`
// (0.8.149), `exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`/
// `applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange()`
// (0.8.151). Grep this file and there is no second decision-identity
// comparison, no second JSON envelope shape, and no second append path
// anywhere in it — every one of those already exists, exactly once, one
// file away. This file invents nothing except the ONE new idea 0.8.149 and
// 0.8.151 never combined on their own: "export only what the difference
// says one side is missing."
//
// DIRECTIONAL, EXPLICIT, AND NEVER RECIPROCAL ON ITS OWN.
// `exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(sourceHistory,
// targetHistory)` answers exactly one direction — "what decisions does
// `source` have that `target` lacks?" — and produces a payload meant for
// `target` alone. It never also computes or returns the reverse; a caller
// wanting two replicas fully caught up calls this file's own functions
// twice, with the two histories swapped, exactly as
// `application/PublisherLeaderboardClaimHistorySynchronization.js`'s own
// header already documents one subject over ("a caller wanting two
// replicas to fully converge runs the identical exchange in both
// directions"). See this file's own FLAGSHIP test, below, for exactly
// that: four replicas, each synchronization call explicit and one-way —
// never one call that mutates more than one side at once.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization()`
// — A PURE, UNMODIFIED PASSTHROUGH TO 0.8.149's OWN DIFFERENCE PROJECTION,
// KEPT AS ITS OWN NAMED ENTRY POINT SO A CALLER WORKING AT THIS FILE'S OWN
// VOCABULARY NEVER HAS TO REACH INTO
// `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js`
// DIRECTLY. It computes no new comparison algorithm and returns exactly
// 0.8.149's own frozen `{ sourceCount, targetCount, sourceOnlyCount,
// targetOnlyCount, sourceOnly, targetOnly, sameHistory }` shape, byte for
// byte — the identical decision-identity, multiset-aware comparison 0.8.149
// already proved, unchanged.
//
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization()`
// — THE ARCHIVE-READING COUNTERPART, LIKEWISE A PURE PASSTHROUGH. It reads
// each side's own durable decision history straight out of its own
// `PublicationObservationArchive` via 0.8.149's own
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference()`
// (which in turn reads through 0.8.150's own archive seam) — the identical
// two-step 0.8.131's own claim-history counterpart already performs, reused
// here rather than reimplemented. An invalid or missing
// `sourceArchive`/`targetArchive` degrades to an empty history
// independently on each side, never a throw — the same tolerance every
// other `reconstructXxx()` in this family already holds.
//
// `exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization()`
// — THE ONE GENUINELY NEW COMPOSITION THIS MILESTONE ADDS. It computes the
// difference (above), then hands `difference.sourceOnly` — and ONLY
// `difference.sourceOnly` — to
// `exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`
// (0.8.151, UNCHANGED). The resulting payload is EXACTLY 0.8.151's own wire
// shape, `{ protocolVersion: 1, decisions: [...] }` — never a new envelope,
// never a "synchronization" field, never a diff summary riding alongside
// the decisions. A receiver of this payload cannot tell, from the payload
// alone, that it was produced by a synchronization call rather than a full
// `exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`
// call — it is one, deliberately, so `importXxx()` and `applyXxx()`
// (0.8.151, UNCHANGED) need not learn a new shape to consume it. When the
// two histories already agree, `sourceOnly` is empty and this function
// exports a genuine, well-formed empty history payload — exactly as
// 0.8.151's own `exportXxx([])` already does for an empty array — never a
// special "nothing to synchronize" sentinel.
//
// `applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization()`
// — A DIRECT, UNMODIFIED DELEGATION TO 0.8.151's OWN IMPORTER/APPLIER. It
// performs NOTHING of its own beyond calling
// `applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange(targetHistory,
// payload)` and returning its result exactly as given — every structural
// validation rule, every decision-identity deduplication rule, every
// per-entry rejection, and every idempotency guarantee 0.8.151 already
// proved apply here completely unchanged. Exactly like 0.8.151's own
// `applyXxx()`, this takes no verifier argument at all — a decision record
// carries no signature (0.8.151's own header, "Unlike a signed claim"),
// so there is nothing here to verify either.
//
// LOCAL DUPLICATES ARE NEVER NORMALIZED BY SYNCHRONIZATION — INHERITED,
// NEVER RESTATED. If Alice holds `[D1, D1, D2]` and Bob holds `[D1, D3]`,
// this file never first collapses Alice's own genuine duplicate before
// computing a difference or exporting a payload — 0.8.149's own multiset
// difference (never a set difference) governs exactly what "missing"
// means, and 0.8.151's own exchange-level deduplication alone governs
// what a receiving side folds in. Synchronization sits strictly between
// the two, unchanged, and is never itself a hidden history-cleanup
// mechanism — see this file's own FLAGSHIP, below, where a replica's own
// pre-existing local multiplicity survives every synchronization call.
//
// STRICT BOUNDARIES THIS MILESTONE DELIBERATELY HOLDS — NOT MERELY
// OMITTED. This file never:
//   - interprets a difference as a conflict, inconsistency, or need for
//     resolution — the same candidate decided `OBSERVE` on one replica and
//     `DEFER` on the other is transported as two historical facts, exactly
//     as 0.8.149 already reports it, and this file draws no conclusion
//     about which disposition should win;
//   - deletes or replaces a decision already on file — synchronization
//     only ever APPENDS, via 0.8.151's own unchanged append path;
//   - deduplicates a replica's own pre-existing, genuinely local
//     multiplicity — see "Local duplicates are never normalized," above;
//   - modifies any archive collection other than by way of a caller's own,
//     separate `.save()`/persistence step — a `PublicationObservationArchive`
//     is read ONLY by
//     `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization()`,
//     and never written to by any function in this file;
//   - reconstructs a plan, re-selects a candidate, or recomputes a
//     decision — every transported record's own `candidate`/`decision`/
//     `decidedAt` fields travel exactly as 0.8.151 already carries them;
//   - performs background or network I/O of any kind — every function
//     here is synchronous, and calling any of them twice with
//     byte-identical arguments returns a byte-identical result;
//   - persists anything automatically — nothing here calls `.save()` on
//     any archive or storage provider; a caller owns persisting whatever
//     history or archive this file's own functions return, exactly as
//     0.8.149/0.8.150/0.8.151 already require of their own callers;
//   - invents a new decision-identity rule — `decisionIdentity =
//     structural identity of (candidate, decision, decidedAt)` remains
//     EXACTLY 0.8.149's/0.8.151's own rule, imported by composition, never
//     restated or narrowed here;
//   - introduces a new wire protocol or envelope shape — every payload
//     this file produces or consumes is byte-identical in shape to
//     0.8.151's own, unchanged `{ protocolVersion, decisions }` envelope;
//   - offers a bidirectional "synchronize both ways in one call"
//     convenience function — see "Directional, explicit, and never
//     reciprocal on its own," above.
//
// FLAGSHIP. Four replicas, directional synchronization around a ring, then
// back:
//
//   Alice: [D1, D2, D2]     (D2 recorded twice, LOCALLY, genuinely)
//   Bob:   [D2, D3]
//   Carol: [D1, D3, D4]
//   Dave:  [D4]
//
//   Alice -> Bob    (Bob gains D1; his own D2 already matches one of
//                     Alice's two copies)
//   Bob   -> Carol  (Carol gains D2; her own D1/D3 already on file)
//   Carol -> Dave   (Dave gains D1, D3; his own D4 already on file)
//   Dave  -> Alice  (Alice gains nothing new — D1/D2/D4 all already on
//                     file, D3 never reached Dave until after this
//                     forward pass began)
//
// followed by the explicit reverse pass, proving directionality: none of
// the four forward calls above ever moved anything backward on its own.
// Repeating an already-converged synchronization pair exports zero
// decisions and applies as a genuine no-op — `secondApply.history ===
// firstApply.history`, the exact same instance, never merely an equal one.
// Throughout, Alice's own genuine local D2 duplicate is never collapsed,
// and a candidate decided differently on two replicas (this file's own
// import from 0.8.149 already proves this at the difference layer) would
// transport as two distinct records, never merged, had the flagship world
// included one.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No latest-decision-per-
// candidate view, no decision supersession, no decision conflict
// detection, no majority/consensus computation, no automatic
// `OBSERVE`/`DEFER` interpretation, no decision expiration, no decision
// authorization, no automatic execution, no automatic reconciliation, no
// conflict resolution, and no network transport of any kind — every step
// here still runs only when a caller explicitly calls it, exactly as every
// file it composes already requires. No bidirectional "synchronize both
// ways in one call" convenience function — see "Directional, explicit, and
// never reciprocal on its own," above; a caller wanting full convergence
// still makes two (or more) explicit calls, one per direction, exactly
// like 0.8.131's own header already asks of its own claim-history
// synchronization.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(sourceHistory, targetHistory) {
    return describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceHistory, targetHistory);
}

export function reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(sourceArchive, targetArchive) {
    return reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceArchive, targetArchive);
}

// exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization()
// — the one genuinely new composition: export ONLY the decisions
// `sourceHistory` holds that `targetHistory` does not (see this file's own
// header). The returned payload is EXACTLY
// `exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`'s
// own (0.8.151, UNCHANGED) shape and tolerance — malformed/absent
// `sourceHistory`/`targetHistory` degrade to an empty difference, which in
// turn exports a genuine, well-formed empty history payload, never a
// throw.
export function exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(sourceHistory, targetHistory) {
    const difference = describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(sourceHistory, targetHistory);
    return exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(difference.sourceOnly);
}

// applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization()
// — a direct, unmodified delegation to
// `applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange()`
// (0.8.151, UNCHANGED). See this file's own header for why this is a
// deliberate pass-through rather than a new operation: a synchronization
// payload IS an ordinary 0.8.151 decision-history exchange payload. No
// verifier argument exists here either — see this file's own header.
export function applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization(targetHistory, payload) {
    return applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange(targetHistory, payload);
}
