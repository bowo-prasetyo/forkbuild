// 0.8.148 — Reconciliation Decision History Timeline Projection.
//
// 0.8.146 answered "what durable decision records exist, and how are they
// looked up by claim, by snapshot, or by disposition?" and 0.8.147 answered
// "what measurable counts exist across them?" — both deliberately excluded
// "a timeline, ordering-by-decidedAt, or any chronological re-derivation"
// (see 0.8.146's own header, "Deliberately excluded," bullet four, and
// 0.8.147's own, bullet two). This file is that projection, and nothing
// more — the decision-history analogue of
// `application/PublisherLeaderboardClaimHistoryTimelineView.js` (0.8.129),
// one subject over: where that file narrates a replica's own stored claim
// RECEIPTS in chronological order, this file narrates a replica's own
// stored reconciliation DECISIONS (0.8.146's own, plain, ordered array of
// 0.8.145's own decision records) in chronological order:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(history)
//     -> { entries: [{ candidateType, claimId?, snapshotIndex?,
//                       disposition, decidedAt }, ...],
//          entryCount }
//
// THE QUESTION IS "IN WHAT CHRONOLOGICAL ORDER DID THIS REPLICA RECORD
// RECONCILIATION DECISIONS?" — NEVER "WHICH DECISION IS CURRENT, CORRECT,
// RESOLVED, OR SUPERSEDED?" This is the one boundary this whole milestone
// exists to hold, held here again over decisions instead of claims — see
// `PublisherLeaderboardClaimHistoryTimelineView.js`'s own header,
// "Architectural boundary: a receipt log, never a verdict."
//
// THE TIMELINE ORDERS BY `decidedAt`, THE ONLY MEANINGFUL TEMPORAL FIELD A
// DECISION RECORD CARRIES. Unlike the claim timeline's own two clocks
// (`claimCreatedAt` vs. `receivedAt`), a 0.8.145 decision record carries
// exactly one — `decidedAt`, explicitly supplied by the caller who recorded
// the decision (see 0.8.145's own header, "`decidedAt` is an explicit,
// caller-supplied fact"). Entries are sorted by:
//
//   1. `decidedAt` ascending
//   2. original `history` array position, ascending, as the tie-break
//
// and by nothing else. Candidate type, claim id, snapshot index, and
// disposition are NEVER tie-breaks, and no comparison anywhere in this file
// is locale-dependent. Concretely, four decisions recorded as
//
//   D1 @ 10:00,  D2 @ 10:03,  D3 @ 10:03,  D4 @ 10:07
//
// (in that append order) produce the timeline D1, D2, D3, D4 — exactly that
// order, with D2 before D3 because D2 appeared first in `history`, the
// identical reasoning `PublisherLeaderboardClaimHistoryTimelineView.js`'s
// own header already gives for why history-array position, not any other
// field, is the tie-break: two decisions can legitimately share the
// identical `decidedAt`, and the order `history` itself already holds them
// in (oldest appended first, per
// `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`'s own
// append-only discipline) is the one order this file has that carries no
// invented meaning.
//
// MULTIPLICITY IS PRESERVED — THE SAME RESTRAINT EVERY FILE IN THIS FAMILY
// ALREADY HOLDS, HELD HERE AGAIN OVER CHRONOLOGY. Recording the
// byte-identical decision twice (OBSERVE on Candidate B<->S2 at the
// identical `decidedAt`, appended twice) produces TWO timeline entries,
// never collapsed into one — this file draws the identical distinction
// 0.8.146's own header already holds one relationship down ("decision
// history entry != reconciliation candidate") and 0.8.147's own statistics
// already surface as `decisionCount` vs. `distinctCandidateCount`.
// Concretely, given
//
//   OBSERVE B<->S2 @ t1
//   OBSERVE B<->S2 @ t1   (identical candidate, identical disposition, identical decidedAt)
//   DEFER   B<->S2 @ t2
//
// the timeline contains THREE entries, in that order — the same three
// 0.8.147's own `decisionCount: 3, distinctCandidateCount: 1` already
// counts, never collapsed to "one candidate, resolved."
//
// EACH ENTRY PRESERVES THE CANDIDATE'S OWN SHAPE — NO MANUFACTURED `null`
// FIELDS. A timeline entry is `{ candidateType, claimId, snapshotIndex,
// disposition, decidedAt }`, but `claimId`/`snapshotIndex` are each present
// ONLY when 0.8.144's own candidate shape for that `candidateType` actually
// carries the field — the identical "fields that don't exist are never
// invented" restraint 0.8.144's and 0.8.147's own headers already hold,
// held here again over a timeline entry instead of a candidate or a count
// key. Concretely:
//
//   DIVERGENT_CORRESPONDENCE             -> candidateType, claimId, snapshotIndex, disposition, decidedAt
//   CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT -> candidateType, claimId,               disposition, decidedAt
//   SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM -> candidateType,           snapshotIndex, disposition, decidedAt
//
// A claim-without-snapshot entry never carries a `snapshotIndex: undefined`
// or `snapshotIndex: null` placeholder, and a snapshot-without-claim entry
// never carries a fabricated `claimId`, purely to make every entry's own
// shape look uniform.
//
// EACH ENTRY IS A NEW, PLAIN, FROZEN OBJECT — NEVER THE ORIGINAL DECISION
// RECORD, AND `candidate`/`decision` ARE NEVER EMBEDDED WHOLESALE. This
// mirrors `PublisherLeaderboardClaimHistoryTimelineView.js`'s own
// departure from the archive-record shape: `disposition` names 0.8.145's
// own `decision` field under a name that does not collide with this
// file's own field for JavaScript's own `decision` object being narrated,
// and `candidateType` is named distinctly from `candidate.type` for the
// identical readability reason. `decidedAt` is carried through unchanged —
// it is already an ISO 8601 string on every genuine 0.8.145 record (see
// that file's own header), never re-serialized or re-parsed into anything
// else.
//
// THIS IS A NARRATION, NEVER A STATE MACHINE — NO "RESOLVED", "UNRESOLVED",
// "PENDING", "SUPERSEDED", "ACTIVE", "STALE", "CORRECT", "INCORRECT",
// "APPROVED", OR "REJECTED" VOCABULARY ANYWHERE. A later `DEFER` recorded
// against a candidate a caller previously `OBSERVE`d is stated plainly, in
// its own chronological place, as one more entry — this file draws no
// conclusion that the later entry supersedes, corrects, or resolves the
// earlier one. Whether a later decision changes what a caller should do
// about a candidate is a future semantic layer's own, separately sized,
// later question — this file only ever answers "in what order did these
// decisions get recorded."
//
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline()`
// — THE IDENTICAL SPLIT 0.8.147'S OWN STATISTICS PROJECTION ALREADY HOLDS.
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline()`
// is the pure computation, over one plain, in-memory decision-history array
// (0.8.146's own shape).
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline()`
// below is presently a thin placeholder that reads no decision history from
// `archive` at all — `PublicationObservationArchive` does not yet hold a
// reconciliation decision history collection (0.8.146's decision history
// has not yet been integrated into the archive, exactly as 0.8.147's own
// reconstruction function already holds this identical boundary), so this
// function always computes over an empty history, regardless of what
// `archive` itself contains. A future milestone that teaches
// `PublicationObservationArchive` to hold a reconciliation decision history
// can teach this one function to read it, without disturbing the pure
// computation above or any caller already using it directly.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock —
// `decidedAt` is read from each stored record, never generated. Never
// mutates the input history or any entry it holds. Returns frozen objects
// and a frozen array throughout. Calling either function twice with a
// byte-identical argument returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY TIMELINE — NEVER THROWS. `null`,
// `undefined`, a non-array, or an array containing entries that are not
// genuine `{ decided: true, candidate, decision, decidedAt }` records are
// all tolerated exactly as
// `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatisticsView.js`'s
// own `describeXxx()` already tolerates its own history argument:
// non-genuine entries are silently excluded, and an entirely
// malformed/absent history produces an empty, frozen `entries` array and
// `entryCount` 0. A genuine entry whose own `decidedAt` cannot be parsed
// into a valid timestamp is excluded the same way — 0.8.145 never produces
// such a record, but this file never trusts that invariant blindly.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS AT ALL, THE IDENTICAL BOUNDARY
// 0.8.147'S OWN STATISTICS PROJECTION ALREADY HOLDS. This file imports
// nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliation.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`,
// or any other module naming a plan, a candidate-selection boundary, a
// divergence, a correspondence, a verification, a claim, a snapshot, or
// archive reconstruction — it trusts nothing about how `history` was
// produced beyond its own documented shape, and never calls 0.8.144
// through 0.8.147 to re-derive or double-check anything.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any interpretation of order as supersession, resolution, or
//   correctness.** See "This is a narration, never a state machine,"
//   above.
// - **Deduplication of any kind.** See "Multiplicity is preserved," above
//   — identical decisions remain separate entries, always.
// - **Historical decision difference between two replicas' histories.**
//   That is 0.8.149's own, separately sized, later question.
// - **Any reconciliation ACTION, applying anything, or execution of any
//   kind.** See 0.8.145's/0.8.146's/0.8.147's own headers — this file
//   inherits that boundary for free by never introducing action vocabulary
//   of its own.
// - **Plan reconstruction, candidate selection, correspondence discovery,
//   divergence detection, or signature verification.** This file reads
//   only `history`'s own already-embedded `candidate`/`decision`/
//   `decidedAt` fields, never a freshly computed plan.
// - **Persistence or synchronization of any kind.** `history` is an
//   in-memory array handed in and handed back, exactly like
//   `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`'s
//   own `history` argument.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(history) {
    const list = Array.isArray(history) ? history : [];
    const indexed = [];
    for (let position = 0; position < list.length; position += 1) {
        const decision = list[position];
        if (!isGenuineDecision(decision)) continue;
        const decidedAtMs = Date.parse(decision.decidedAt);
        if (Number.isNaN(decidedAtMs)) continue;
        indexed.push({ decision, position, decidedAtMs });
    }

    indexed.sort((a, b) => {
        const decidedAtDelta = a.decidedAtMs - b.decidedAtMs;
        if (decidedAtDelta !== 0) return decidedAtDelta;
        return a.position - b.position;
    });

    const entries = indexed.map(({ decision }) => buildTimelineEntry(decision));

    return Object.freeze({
        entries: Object.freeze(entries),
        entryCount: entries.length
    });
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline()
// — see this file's own header, "The identical split," above.
// `PublicationObservationArchive` does not yet hold a reconciliation
// decision history collection, so this always computes over an empty
// history — a valid, empty timeline, never a throw — regardless of what
// `archive` itself contains.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline(archive) {
    return describePublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimeline([]);
}

// A genuine 0.8.145 decision record: `{ decided: true, candidate, decision,
// decidedAt }`, with `candidate` one of 0.8.144's own three shapes and
// `decision` one of 0.8.145's own two-value vocabulary. Anything else —
// including a genuine-looking `{ decided: false, ... }` outcome — is not
// timelined, mirroring
// `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatisticsView.js`'s
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

// One timeline entry, preserving the candidate's own shape — see this
// file's own header, "Each entry preserves the candidate's own shape,"
// above. `claimId`/`snapshotIndex` are inserted only when the underlying
// candidate actually carries that field.
function buildTimelineEntry(decision) {
    const { candidate } = decision;
    const entry = { candidateType: candidate.type };
    if (typeof candidate.claimId === 'string' && candidate.claimId.length > 0) {
        entry.claimId = candidate.claimId;
    }
    if (typeof candidate.snapshotIndex === 'number' && Number.isInteger(candidate.snapshotIndex)) {
        entry.snapshotIndex = candidate.snapshotIndex;
    }
    entry.disposition = decision.decision;
    entry.decidedAt = decision.decidedAt;
    return Object.freeze(entry);
}
