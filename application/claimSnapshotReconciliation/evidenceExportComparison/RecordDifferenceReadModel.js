// 0.8.199 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Record Difference Read Model.
//
// 0.8.197 answers, for each explicitly paired decision or observation
// record, "which named fields differ?" — but its own result carries the
// full `source`/`target` identity objects on every entry, which is exactly
// the detail a compact UI summary does not want to re-render. This file is
// that hand-off, and nothing more — the identical role 0.8.190 already
// plays for 0.8.189, one layer up:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(differences)
//     -> { decisionDifferences:    [ { differenceCount, differingFields }, ... ],
//          observationDifferences: [ { differenceCount, differingFields }, ... ],
//          decisionCount, observationCount,
//          differingDecisionCount, differingObservationCount }
//
//   differences — 0.8.197's own already-computed result, taken directly:
//   `{ decisionDifferences: [ { source, target, differences }, ... ],
//      observationDifferences: [ { source, target, differences }, ... ] }`.
//
//   0.8.198 Explicit Record Pairs
//             │
//             ▼
//   0.8.197 Record Difference Projection
//             │
//             ▼
//   0.8.199 Record Difference Read Model   ★ (THIS FILE)
//
// THIS IS A READ MODEL, NOT A SECOND COMPARISON. Every fact this file
// reports is 0.8.197's own fact, read verbatim off its own already-computed
// result and reshaped into a smaller, UI-facing vocabulary. There is no
// `sameValue()` here, no field list, no structural-equality walk, and no
// re-reading of a pair's own `source`/`target` values — this file never
// looks at `source`/`target` at all, only at the `differences` array 0.8.197
// already computed for each pair. See `docs/Principles.md`, "The UI
// Displays Observations; It Does Not Turn Them Into A Verdict" (0.8.57) —
// held here again, one layer above 0.8.197's own comparison.
//
// THIS FILE ACCEPTS 0.8.197'S OWN RESULT DIRECTLY — NEVER A RAW PAIRING,
// AND NEVER TWO RECORDS. The dependency direction is deliberately explicit:
//
//   explicit pairs (0.8.198) -> field difference (0.8.197)
//     -> record difference read model (0.8.199, THIS FILE)
//
// `describeXxx()` below takes 0.8.197's own already-computed `differences`
// result as its one argument and performs a pure, structural transform of
// it. It never touches a pair's `source`/`target`, never reads
// `sourceOnly`/`targetOnly`, and never re-derives which fields differ —
// that entire boundary remains 0.8.197's own. This prevents 0.8.199 from
// quietly becoming a second difference engine, exactly the same discipline
// 0.8.190 already holds one layer below its own source, 0.8.189.
//
// A PAIR WITH ZERO DIFFERENCES IS STILL A PAIR — THE ONE INVARIANT THIS
// MILESTONE EXISTS TO PROTECT. `decisionDifferences`/`observationDifferences`
// below hold exactly one summary entry per entry 0.8.197 supplied, in the
// exact same order — an entry whose `differences` was `[]` summarizes to
// `{ differenceCount: 0, differingFields: [] }`, never dropped and never
// collapsed away. `decisionCount`/`observationCount` count every supplied
// entry regardless of whether it differs; `differingDecisionCount`/
// `differingObservationCount` separately count only the entries whose
// `differenceCount` is greater than zero. A reader can always recover "how
// many pairs were compared" and "how many of those pairs actually differ"
// as two distinct numbers — never one number standing in for both.
//
// DECISION DIFFERENCES AND OBSERVATION DIFFERENCES STAY TWO INDEPENDENT
// SECTIONS — 0.8.197'S OWN DISTINCTION, HELD HERE AGAIN ONE LAYER UP.
// `decisionDifferences`/`decisionCount`/`differingDecisionCount` and
// `observationDifferences`/`observationCount`/`differingObservationCount`
// are computed independently; this file never merges the two record kinds,
// never cross-checks one against the other, and never infers one count
// from the other. Two pairs differing in different fields — one decision
// pair by `candidateMatchesPlan`, one observation pair by `observedAt` —
// are reported as two independent summary entries, each naming only its
// own pair's differing fields.
//
// `differingFields` IS 0.8.197'S OWN `differences` ARRAY, RENAMED AND
// COPIED, NEVER RECOMPUTED. Field order is always 0.8.197's own fixed
// declaration order (never the order fields happen to differ in, and never
// re-sorted by this file); `differenceCount` is always exactly
// `differingFields.length` — this file performs no independent count of
// its own beyond reading the length of the array it just copied.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK, NO DOM.
// `describeXxx()` reads no clock, contacts no server, renders no markup,
// and mutates no argument (or anything the argument holds). Calling it
// twice with byte-identical arguments returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY, VALID READ MODEL — NEVER THROWS. A
// `differences` argument that is `null`, `undefined`, or missing a genuine
// `decisionDifferences`/`observationDifferences` array degrades that
// section to `[]` (and its counts to `0`); a malformed individual entry
// (not an object, or whose own `differences` is not an array) degrades to
// a summary of `{ differenceCount: 0, differingFields: [] }` rather than
// being repaired, dropped, or thrown on — every position in an input array
// still has exactly one corresponding position in the output array.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS NOTHING. `describeXxx()`
// below performs a pure, structural, duck-typed transform of whatever
// shape it is handed — the identical zero-imports discipline 0.8.190/
// 0.8.191/0.8.193/0.8.195/0.8.197/0.8.198 already hold. There is
// deliberately no `reconstructXxx()` in this file: there is no pairing, no
// comparison, and no export pair for this file itself to read — a caller
// who wants this read model built from two real exported documents calls
// 0.8.189's own `describeXxx()`, then 0.8.193's own, then optionally
// 0.8.195's own, then explicitly builds a pairing (0.8.198's own
// `describeXxx()`, or any caller-built equivalent), then 0.8.197's own
// `describeXxx()`, and hands that result here.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Another comparison of any kind.** No `sameValue()`, no structural
//   equality, no candidate matching, no timestamp comparison. See "This is
//   a read model, not a second comparison," above — every fact reported
//   here is already 0.8.197's own fact.
// - **Reading a pair's own `source`/`target`.** This file never looks at
//   either value on any entry — only at the `differences` array 0.8.197
//   already computed. A caller who needs the compared values already has
//   0.8.197's own result.
// - **Reading `sourceOnly`/`targetOnly`, or any automatic pairing of any
//   kind.** Inherited unchanged from 0.8.197/0.8.198 — this file's one
//   argument is already 0.8.197's own result over an explicit pairing.
// - **Dropping, collapsing, or omitting a pair whose `differenceCount` is
//   zero.** See "A pair with zero differences is still a pair," above —
//   the flagship invariant this milestone exists to hold.
// - **A `conflict`, `mismatchSeverity`, `winner`, `better`, `correct`,
//   `stale`, `invalid`, `resolution`, or `recommendation` field or
//   vocabulary of any kind.** Inherited unchanged from every layer beneath
//   this one.
// - **A new identity algorithm, or any field list of its own.** This file
//   never names which fields make up a decision or observation record —
//   it only counts and copies the field names 0.8.197 already identified
//   as differing.
// - **Any markup, DOM nodes, or control-rendering technology choice.**
//   This file returns plain, frozen, JSON-safe data; a presentation
//   projection or view (if ever built) is separate, later, UI-layer work.
// - **Persistence, or automatic/periodic/background computation of any
//   kind.** This function runs only when a caller explicitly calls it.

function isGenuineObject(value) {
    return Boolean(value) && typeof value === 'object';
}

// Summarizes one 0.8.197 difference entry into `{ differenceCount,
// differingFields }` — a copy, never a recomputation, of 0.8.197's own
// `differences` array. See this file's own header, "`differingFields` is
// 0.8.197's own `differences` array, renamed and copied." A malformed
// entry (not an object, or whose `differences` is not an array) degrades
// to a zero-difference summary, never throws.
function summaryOf(entry) {
    const genuine = isGenuineObject(entry);
    const differingFields = genuine && Array.isArray(entry.differences)
        ? Object.freeze(entry.differences.slice())
        : Object.freeze([]);
    return Object.freeze({ differenceCount: differingFields.length, differingFields });
}

// Maps a 0.8.197-supplied array of difference entries into the identical-
// length array of summaries, one entry in, one entry out, in the exact
// same position and order. See this file's own header, "A pair with zero
// differences is still a pair" — no entry is ever dropped.
function summariesOf(entries) {
    const entriesArray = Array.isArray(entries) ? entries : [];
    return Object.freeze(entriesArray.map(summaryOf));
}

// Counts only the summaries whose `differenceCount` is greater than zero —
// the separate "how many pairs actually differ" figure this file reports
// alongside the total pair count.
function differingCountOf(summaries) {
    return summaries.filter((summary) => summary.differenceCount > 0).length;
}

// describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel()
// — see this file's own header for the full contract. Never recomputes any
// of 0.8.197's own differences, never drops a zero-difference pair;
// malformed/absent input degrades to an empty read model, never throws.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifferenceReadModel(differences) {
    const genuine = isGenuineObject(differences);
    const decisionDifferences = summariesOf(genuine ? differences.decisionDifferences : undefined);
    const observationDifferences = summariesOf(genuine ? differences.observationDifferences : undefined);
    return Object.freeze({
        decisionDifferences,
        observationDifferences,
        decisionCount: decisionDifferences.length,
        observationCount: observationDifferences.length,
        differingDecisionCount: differingCountOf(decisionDifferences),
        differingObservationCount: differingCountOf(observationDifferences)
    });
}
