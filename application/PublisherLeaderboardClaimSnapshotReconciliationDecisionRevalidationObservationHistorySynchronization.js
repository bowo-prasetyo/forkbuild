import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference
} from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js';
import {
    exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory,
    applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange
} from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange.js';

// 0.8.169 — Revalidation Observation History Synchronization.
//
// 0.8.167 gave a replica a durable, archive-backed home for its own
// revalidation observations. 0.8.168 gave two replicas a way to TRANSPORT an
// entire observation history between them — export, import, apply — but
// blindly: exporting a whole history re-sends every observation a replica
// has ever recorded, whether or not the other side already holds it. 0.8.166
// gave two replicas a way to LEARN exactly which observations differ — but
// purely as a read: it never moves anything itself. Neither file was ever
// asked to work together in one call. This file is that missing connective
// layer, one level above both — the identical composition
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistorySynchronization.js`
// (0.8.152) already proved one subject over, held here again over
// revalidation-observation histories instead of decision histories:
//
//   sourceHistory                                    targetHistory
//        │                                                 │
//        └──────────── describe the difference ────────────┘
//                    (0.8.166, UNCHANGED)
//                              │
//                              ▼
//                   { sourceOnly, targetOnly, ... }
//                              │
//     exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization()   (THIS MILESTONE)
//         — exports ONLY sourceOnly, via
//           exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()
//           (0.8.168, UNCHANGED)
//                              │
//                              ▼
//                  { protocolVersion: 1, observations: [...] }
//                              │
//     applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization()   (THIS MILESTONE)
//         — delegates directly to
//           applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange()
//           (0.8.168, UNCHANGED)
//                              │
//                              ▼
//                    targetHistory, now also holding every observation it
//                    was genuinely missing — nothing it already had, resent
//
// DIFFERENCE DETERMINES WHAT IS MISSING; EXCHANGE TRANSPORTS IT;
// SYNCHRONIZATION COMPOSES THE TWO WITHOUT CREATING A THIRD ALGORITHM — THE
// ONE RULE THIS FILE EXISTS TO ENFORCE, THE IDENTICAL RULE 0.8.152'S OWN
// HEADER ALREADY HOLDS ONE SUBJECT OVER. Every one of the four functions
// below is a thin composition of functions this milestone does not touch:
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference()`
// (0.8.166), `exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()`/
// `applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange()`
// (0.8.168). Grep this file and there is no second observation-identity
// comparison, no second JSON envelope shape, and no second append path
// anywhere in it — every one of those already exists, exactly once, one file
// away. This file invents nothing except the ONE new idea 0.8.166 and 0.8.168
// never combined on their own: "export only what the difference says one
// side is missing."
//
// DIRECTIONAL, EXPLICIT, AND NEVER RECIPROCAL ON ITS OWN — THE IDENTICAL
// RESTRAINT 0.8.152'S OWN HEADER ALREADY HOLDS.
// `exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(sourceHistory,
// targetHistory)` answers exactly one direction — "what observations does
// `source` have that `target` lacks?" — and produces a payload meant for
// `target` alone. It never also computes or returns the reverse; a caller
// wanting two replicas fully caught up calls this file's own functions
// twice, with the two histories swapped, exactly as 0.8.152's own header
// already documents one layer down. See this file's own FLAGSHIP test,
// below, for exactly that: four replicas, each synchronization call explicit
// and one-way — never one call that mutates more than one side at once.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization()`
// — A PURE, UNMODIFIED PASSTHROUGH TO 0.8.166's OWN DIFFERENCE PROJECTION,
// KEPT AS ITS OWN NAMED ENTRY POINT so a caller working at this file's own
// vocabulary never has to reach into
// `PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js`
// directly. It computes no new comparison algorithm and returns exactly
// 0.8.166's own frozen `{ sourceCount, targetCount, sourceOnlyCount,
// targetOnlyCount, sourceOnly, targetOnly, sameHistory }` shape, byte for
// byte — the identical six-field observation-identity, multiset-aware
// comparison 0.8.166 already proved, unchanged.
//
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization()`
// — THE ARCHIVE-READING COUNTERPART, LIKEWISE A PURE PASSTHROUGH. It reads
// each side's own durable observation history straight out of its own
// `PublicationObservationArchive` via 0.8.166's own
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference()`
// (which in turn reads through 0.8.167's own archive seam) — the identical
// two-step 0.8.152's own decision-history counterpart already performs,
// reused here rather than reimplemented. An invalid or missing
// `sourceArchive`/`targetArchive` degrades to an empty history independently
// on each side, never a throw — the same tolerance every other
// `reconstructXxx()` in this family already holds.
//
// `exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization()`
// — THE ONE GENUINELY NEW COMPOSITION THIS MILESTONE ADDS. It computes the
// difference (above), then hands `difference.sourceOnly` — and ONLY
// `difference.sourceOnly` — to
// `exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()`
// (0.8.168, UNCHANGED). The resulting payload is EXACTLY 0.8.168's own wire
// shape, `{ protocolVersion: 1, observations: [...] }` — never a new
// envelope, never a "synchronization" field, never a diff summary riding
// alongside the observations. A receiver of this payload cannot tell, from
// the payload alone, that it was produced by a synchronization call rather
// than a full
// `exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()`
// call — it is one, deliberately, so `importXxx()` and `applyXxx()` (0.8.168,
// UNCHANGED) need not learn a new shape to consume it. When the two
// histories already agree, `sourceOnly` is empty and this function exports a
// genuine, well-formed empty history payload — exactly as 0.8.168's own
// `exportXxx([])` already does for an empty array — never a special
// "nothing to synchronize" sentinel.
//
// `applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization()`
// — A DIRECT, UNMODIFIED DELEGATION TO 0.8.168's OWN IMPORTER/APPLIER. It
// performs NOTHING of its own beyond calling
// `applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange(targetHistory,
// payload)` and returning its result exactly as given — every structural
// validation rule, every observation-identity deduplication rule, every
// per-entry rejection, and every idempotency guarantee 0.8.168 already
// proved apply here completely unchanged. Exactly like 0.8.168's own
// `applyXxx()`, this takes no verifier argument at all — an observation
// record carries no signature (0.8.168's own header, "No verifier"), so
// there is nothing here to verify either.
//
// TWO DISTINCT MULTIPLICITY RULES ARE NEVER CONFLATED INTO ONE — THE MOST
// IMPORTANT DESIGN POINT THIS MILESTONE ADDS ON TOP OF 0.8.152's OWN
// TEMPLATE, BECAUSE THE OBSERVATION-EXCHANGE LAYER (0.8.168) DEDUPLICATES
// DIFFERENTLY THAN THE DECISION-EXCHANGE LAYER (0.8.151) READS. 0.8.166's own
// `describeXxx()` performs MULTISET subtraction — `[O1, O1, O2]` against
// `[O1]` reports `sourceOnly = [O1, O2]`, because only ONE of source's two
// `O1` copies is cancelled by target's single `O1`. But 0.8.168's own
// `applyXxx()` deduplicates incoming observations by EXACT KEY membership
// against `history`'s existing set, not by remaining multiset count — an
// incoming observation whose key already exists anywhere in `history` is
// always recognized as a duplicate and skipped, regardless of how many
// copies `history` already holds. So exporting `sourceOnly = [O1, O2]` and
// applying it to `target = [O1]` does NOT reproduce two copies of `O1` on
// `target` — the exported `O1` is recognized as already-present and skipped,
// and only `O2` is genuinely new. This file introduces no third identity
// rule to reconcile the two: it simply composes 0.8.166's own multiset
// difference with 0.8.168's own key-membership exchange dedup exactly as
// each already behaves, unchanged — see this file's own SUBTLE test, below,
// which proves this composed behavior directly rather than asserting a
// naive expectation that never held for 0.8.168 in the first place.
//
// LOCAL DUPLICATES ARE NEVER NORMALIZED BY SYNCHRONIZATION — INHERITED,
// NEVER RESTATED. If Alice holds `[O1, O1, O2]` and Bob holds `[O1, O3]`,
// this file never first collapses Alice's own genuine duplicate before
// computing a difference or exporting a payload — 0.8.166's own multiset
// difference (never a set difference) governs exactly what "missing" means
// on the READ side, and 0.8.168's own exchange-level, key-based
// deduplication alone governs what a receiving side folds in on the WRITE
// side. Synchronization sits strictly between the two, unchanged, and is
// never itself a hidden history-cleanup mechanism.
//
// STRICT BOUNDARIES THIS MILESTONE DELIBERATELY HOLDS — NOT MERELY OMITTED.
// This file never:
//   - interprets a difference as a conflict, inconsistency, or need for
//     resolution — the same candidate observed as present against one
//     replica's plan and absent against another's is transported as two
//     historical facts, exactly as 0.8.166 already reports it, and this file
//     draws no conclusion about which observation should win;
//   - deletes or replaces an observation already on file — synchronization
//     only ever APPENDS, via 0.8.168's own unchanged append path;
//   - deduplicates a replica's own pre-existing, genuinely local
//     multiplicity — see "Local duplicates are never normalized," above;
//   - modifies any archive collection other than by way of a caller's own,
//     separate `.save()`/persistence step — a `PublicationObservationArchive`
//     is read ONLY by
//     `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization()`,
//     and never written to by any function in this file;
//   - recomputes a plan, revalidates a decision, or recomputes a plan
//     fingerprint — every transported record's own `decision`/
//     `planIdentity`/`candidatePresent`/`candidateType`/`candidateMatchesPlan`/
//     `observedAt` fields travel exactly as 0.8.168 already carries them;
//   - performs background or network I/O of any kind — every function here
//     is synchronous, and calling any of them twice with byte-identical
//     arguments returns a byte-identical result;
//   - persists anything automatically — nothing here calls `.save()` on any
//     archive or storage provider; a caller owns persisting whatever history
//     or archive this file's own functions return, exactly as
//     0.8.166/0.8.167/0.8.168 already require of their own callers;
//   - invents a new observation-identity rule — `observationIdentity =
//     structural identity of (decision, planIdentity, candidatePresent,
//     candidateType, candidateMatchesPlan, observedAt)` remains EXACTLY
//     0.8.166's/0.8.168's own rule, imported by composition, never restated
//     or narrowed here;
//   - introduces a new wire protocol or envelope shape — every payload this
//     file produces or consumes is byte-identical in shape to 0.8.168's own,
//     unchanged `{ protocolVersion, observations }` envelope;
//   - offers a bidirectional "synchronize both ways in one call" convenience
//     function — see "Directional, explicit, and never reciprocal on its
//     own," above.
//
// FLAGSHIP. Four replicas, five distinct observations, directional
// synchronization around a ring, then explicit reverse calls (the identical
// two-phase structure 0.8.152's own flagship already establishes — a single
// forward ring alone does not fully converge a four-node ring; see 0.8.152's
// own header, "the forward ring never moves anything backward or sideways
// on its own"):
//
//   Alice: [O1, O2]
//   Bob:   [O2, O3]
//   Carol: [O3, O4]
//   Dave:  [O4, O5]
//
//   Forward:  Alice->Bob, Bob->Carol, Carol->Dave, Dave->Alice
//   Reverse:  Bob->Alice, Carol->Bob, Dave->Carol, Alice->Dave
//
// After both passes, every replica converges to EXACTLY the five-observation
// union `{O1..O5}`. Repeating an already-converged synchronization call
// exports zero observations and applies as a genuine no-op —
// `secondApply.history === firstApply.history`, the exact same instance,
// never merely an equal one — the identical idempotence guarantee 0.8.152's
// own flagship already establishes.
//
// SUBTLE: LOCAL DUPLICATES VERSUS EXCHANGE DEDUPLICATION. `source = [O1, O1,
// O2]`, `target = [O1]`. 0.8.166 reports `sourceOnly = [O1, O2]` — one O1
// survives the multiset subtraction, never zero (see 0.8.166's own
// multiplicity-preservation discipline). Exporting that `sourceOnly` and
// applying it to `target` does NOT grow `target` to `[O1, O1, O2]`: 0.8.168's
// own exchange dedup recognizes the exported `O1` as already present on
// `target` (by exact key, not by remaining multiset count) and skips it,
// leaving `target = [O1, O2]` — one new observation (`O2`) applied, one
// exchange-level duplicate (`O1`) skipped. See "Two distinct multiplicity
// rules are never conflated into one," above, for why this is correct
// composed behavior, not a bug this file introduces or must work around.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No latest-observation-per-
// candidate view, no observation supersession, no observation conflict
// detection, no majority/consensus computation, no automatic
// present/absent interpretation, no observation expiration, no observation
// authorization, no automatic execution, no automatic reconciliation, no
// conflict resolution, and no network transport of any kind — every step
// here still runs only when a caller explicitly calls it, exactly as every
// file it composes already requires. No bidirectional "synchronize both ways
// in one call" convenience function — see "Directional, explicit, and never
// reciprocal on its own," above; a caller wanting full convergence still
// makes two (or more) explicit calls, one per direction, exactly like
// 0.8.152's own header already asks of its own decision-history
// synchronization.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(sourceHistory, targetHistory) {
    return describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceHistory, targetHistory);
}

export function reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(sourceArchive, targetArchive) {
    return reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceArchive, targetArchive);
}

// exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization()
// — the one genuinely new composition: export ONLY the observations
// `sourceHistory` holds that `targetHistory` does not (see this file's own
// header). The returned payload is EXACTLY
// `exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()`'s
// own (0.8.168, UNCHANGED) shape and tolerance — malformed/absent
// `sourceHistory`/`targetHistory` degrade to an empty difference, which in
// turn exports a genuine, well-formed empty history payload, never a throw.
export function exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(sourceHistory, targetHistory) {
    const difference = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(sourceHistory, targetHistory);
    return exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(difference.sourceOnly);
}

// applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization()
// — a direct, unmodified delegation to
// `applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange()`
// (0.8.168, UNCHANGED). See this file's own header for why this is a
// deliberate pass-through rather than a new operation: a synchronization
// payload IS an ordinary 0.8.168 observation-history exchange payload. No
// verifier argument exists here either — see this file's own header.
export function applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization(targetHistory, payload) {
    return applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange(targetHistory, payload);
}
