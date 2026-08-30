// 0.8.149 — Reconciliation Decision History Difference Projection.
//
// 0.8.146 gave a replica an append-only, in-memory collection of its own
// explicit reconciliation decisions (0.8.145's own records) and three
// lookups over it, but deliberately excluded any notion of comparing that
// collection against a PEER's own — see 0.8.146's own header, "Deliberately
// excluded," and 0.8.148's own, bullet three ("Historical decision
// difference between two replicas' histories. That is 0.8.149's own,
// separately sized, later question."). This file answers exactly that
// question, and nothing else — the decision-history analogue of
// `application/PublisherLeaderboardClaimHistoryDifference.js` (0.8.127), one
// subject over: where that file diffs a replica's own stored claim
// RECEIPTS, this file diffs a replica's own stored reconciliation DECISIONS
// (0.8.146's own, plain, ordered array of 0.8.145's own decision records):
//
//   Alice's decision history              Bob's decision history
//        │                                          │
//        └──── "these differ somehow" ───────────────┘
//                  — but WHICH RECORDS, exactly, does
//                    each side have that the other lacks?
//
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceHistory, targetHistory)
//     -> { sourceCount, targetCount, sourceOnlyCount, targetOnlyCount,
//          sourceOnly, targetOnly, sameHistory }
//
// DECISION IDENTITY, NOT CANDIDATE IDENTITY, GOVERNS THE COMPARISON — THE
// MOST IMPORTANT DESIGN POINT, AND THE IDENTICAL DISCIPLINE 0.8.127'S OWN
// `canonicalReceiptKey()` ALREADY HOLDS ONE SUBJECT OVER. A decision
// record's identity for this file's own purposes is its COMPLETE STRUCTURAL
// CONTENT — candidate + decision + decidedAt, exactly as 0.8.145 produced
// it:
//
//   decisionIdentity = structural identity of (candidate, decision, decidedAt)
//
// So these four records are all mutually distinct:
//
//   OBSERVE(B, S2, t1)
//   DEFER(B, S2, t1)     <- same candidate as above, different decision
//   OBSERVE(B, S2, t2)   <- same candidate+decision, different decidedAt
//   OBSERVE(B, S3, t1)   <- different candidate (different snapshotIndex)
//
// This file never deduplicates by `candidate` alone — the identical
// distinction 0.8.146's own header already draws
// (`decision history entry != reconciliation candidate`) and 0.8.148's own
// timeline already preserves through chronology. Concretely, the
// "particularly valuable test" this milestone exists to hold: a candidate
// that received `OBSERVE` on one replica and `DEFER` on the other —
// `OBSERVE(B<->S2, t1)` on Alice, `DEFER(B<->S2, t1)` on Bob — reports BOTH
// records as exclusive, one on each side, never as "the same candidate,
// already covered." Comparison is by CONTENT, never by object identity,
// array position, or candidate alone.
//
// MULTISET DIFFERENCE, NEVER A SET DIFFERENCE — THE IDENTICAL DISCIPLINE
// 0.8.127'S OWN `extractUnmatched()` ALREADY HOLDS FOR CLAIM RECEIPTS, HELD
// HERE AGAIN OVER DECISION RECORDS. `[D1, D1, D2]` compared against
// `[D1, D2]` reports exactly one `D1` as source-only — the second `D1` has
// no counterpart left once the first has been matched — never zero (a naive
// "is D1 present in target?" check) and never two (a comparison that never
// consumes a match). This matters concretely for decision history: two
// independently recorded, byte-identical decisions are two historical
// facts, exactly as 0.8.146's own header already establishes for appending.
//
// EACH RESULT ELEMENT IS THE ORIGINAL DECISION RECORD ITSELF, NEVER A
// RECONSTRUCTED COPY. This mirrors 0.8.127's own departure from a
// `toJSON()` projection for the identical reason: a 0.8.145 decision record
// is already the exact, plain, frozen unit a caller would hand to a future
// synchronization/export step (0.8.150's own, separately sized, later
// question) without any further transformation.
//
// ONLY GENUINE 0.8.145 `{ decided: true, candidate, decision, decidedAt }`
// RECORDS ARE EVER COMPARED — THE IDENTICAL TOLERANCE 0.8.146's OWN
// `appendXxx()` AND 0.8.148's OWN TIMELINE ALREADY HOLD. Anything else in
// either input array — `undefined`, `null`, a genuine-looking
// `{ decided: false, ... }` outcome, or any other malformed value — is
// silently excluded from both sides before comparison, never thrown on and
// never fabricated into a phantom entry.
//
// NO ORDERING, NO GROUPING, NO STATISTICS. `sourceOnly`/`targetOnly` are
// reported in each side's own original history order — oldest recorded
// first — never sorted by `decidedAt` (that is 0.8.148's own, separately
// sized question, already answered and deliberately not repeated here),
// grouped by candidate, or reduced to a count of distinct candidates versus
// distinct decisions (0.8.147's own, separately sized question).
//
// NO INTERPRETATION OF THE DIFFERENCE — THE IDENTICAL RESTRAINT 0.8.127'S
// OWN HEADER ALREADY HOLDS, HELD HERE AGAIN OVER DECISIONS. The result
// carries no `inconsistent`, `conflicting`, `superseded`, `preferred`,
// `authoritative`, or `resolved` field or verb anywhere. Two replicas
// disagreeing about the disposition of the identical candidate is stated
// plainly as two exclusive records, one on each side — this file draws no
// conclusion about which disposition should win, whether the disagreement
// needs resolving, or what happens next. That is a later, separately sized
// question this milestone does not answer.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates either input history or any record either one holds.
// Calling either function twice with equivalent arguments returns a
// byte-identical result.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference()`
// — THE IDENTICAL SPLIT 0.8.127'S OWN CLAIM HISTORY DIFFERENCE AND 0.8.148'S
// OWN TIMELINE ALREADY HOLD.
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference()`
// is the pure computation, over two plain, in-memory decision-history
// arrays (0.8.146's own shape).
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference()`
// below is presently a thin placeholder that reads no decision history from
// either `sourceArchive`/`targetArchive` at all — `PublicationObservationArchive`
// does not yet hold a reconciliation decision history collection (the
// identical boundary 0.8.148's own `reconstructXxx()` already holds), so
// this function always computes over two empty histories, regardless of
// what either archive actually contains — a valid, `sameHistory: true`
// result, never a throw. A future milestone that teaches
// `PublicationObservationArchive` to hold a reconciliation decision history
// can teach this one function to read it on each side, without disturbing
// the pure computation above or any caller already using it directly.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS AT ALL, THE IDENTICAL BOUNDARY
// 0.8.147'S OWN STATISTICS PROJECTION AND 0.8.148'S OWN TIMELINE PROJECTION
// ALREADY HOLD. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliation.js`, or any
// other module naming a plan, a candidate-selection boundary, a divergence,
// a correspondence, a verification, a claim, a snapshot, or archive
// reconstruction — it trusts nothing about how either history was produced
// beyond its own documented shape, and never calls 0.8.144 through 0.8.148
// to re-derive or double-check anything.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any export, import, or application of the exclusive decisions found.**
//   `sourceOnly`/`targetOnly` are read-only facts about the difference;
//   folding either side's exclusive decisions into the other history is
//   0.8.150's own, separately sized, later question ("Reconciliation
//   Decision History Synchronization Exchange").
// - **Any interpretation of a difference as a conflict, inconsistency, or
//   need for resolution.** See "No interpretation of the difference,"
//   above.
// - **Deduplication of any kind.** See "Multiset difference, never a set
//   difference," above — identical decisions remain separate entries,
//   always.
// - **Any reconciliation ACTION, applying anything, or execution of any
//   kind.** See 0.8.145's/0.8.146's/0.8.147's/0.8.148's own headers — this
//   file inherits that boundary for free by never introducing action
//   vocabulary of its own.
// - **Plan reconstruction, candidate selection, correspondence discovery,
//   divergence detection, or signature verification.** This file reads
//   only each history's own already-embedded `candidate`/`decision`/
//   `decidedAt` fields, never a freshly computed plan.
// - **Persistence or synchronization of any kind.** Each history is an
//   in-memory array handed in and read, exactly like
//   `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`'s
//   own `history` argument.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceHistory = [], targetHistory = []) {
    const source = (Array.isArray(sourceHistory) ? sourceHistory : []).filter(isGenuineDecision);
    const target = (Array.isArray(targetHistory) ? targetHistory : []).filter(isGenuineDecision);

    const sourceOnly = extractUnmatched(source, target);
    const targetOnly = extractUnmatched(target, source);

    return Object.freeze({
        sourceCount: source.length,
        targetCount: target.length,
        sourceOnlyCount: sourceOnly.length,
        targetOnlyCount: targetOnly.length,
        sourceOnly: Object.freeze(sourceOnly),
        targetOnly: Object.freeze(targetOnly),
        sameHistory: sourceOnly.length === 0 && targetOnly.length === 0
    });
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference()
// — see this file's own header, "The identical split," above.
// `PublicationObservationArchive` does not yet hold a reconciliation
// decision history collection, so this always computes over two empty
// histories — a valid, `sameHistory: true` result, never a throw —
// regardless of what either archive actually contains.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference(sourceArchive, targetArchive) {
    return describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference([], []);
}

// The multiset (bag) subtraction `from - against`, preserving
// multiplicity — see this file's own header, "Multiset difference, never a
// set difference." Each record in `against` cancels out AT MOST ONE
// occurrence in `from`, matched by exact decision identity
// (`canonicalDecisionKey()`, below) — never by a narrower per-candidate key.
// Returns the unmatched records themselves — the original decision record
// objects, never a reconstructed copy — in `from`'s own original order.
function extractUnmatched(from, against) {
    const remaining = new Map();
    for (const record of against) {
        const key = canonicalDecisionKey(record);
        remaining.set(key, (remaining.get(key) || 0) + 1);
    }

    const unmatched = [];
    for (const record of from) {
        const key = canonicalDecisionKey(record);
        const count = remaining.get(key) || 0;
        if (count > 0) {
            remaining.set(key, count - 1);
        } else {
            unmatched.push(record);
        }
    }
    return unmatched;
}

// The one, uniform decision identity this file uses for comparison — exact
// structural equality of the record's complete content (`candidate` +
// `decision` + `decidedAt`). A genuine 0.8.145 decision record is already a
// plain object with no methods of its own, so its own `JSON.stringify()`
// output already IS its complete structural content — no `toJSON()` call
// needed, unlike 0.8.127's own `LeaderboardClaimRecord` instances.
function canonicalDecisionKey(record) {
    return JSON.stringify({ candidate: record.candidate, decision: record.decision, decidedAt: record.decidedAt });
}

// A genuine 0.8.145 decision record: `{ decided: true, candidate, decision,
// decidedAt }`, with `candidate` one of 0.8.144's own three shapes and
// `decision` one of 0.8.145's own two-value vocabulary. Anything else —
// including a genuine-looking `{ decided: false, ... }` outcome — is
// silently excluded, mirroring
// `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimelineView.js`'s
// own `isGenuineDecision()` exactly.
function isGenuineDecision(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.decided === true
        && entry.candidate !== null && typeof entry.candidate === 'object'
        && typeof entry.candidate.type === 'string'
        && (entry.decision === 'OBSERVE' || entry.decision === 'DEFER')
        && typeof entry.decidedAt === 'string'
    );
}
