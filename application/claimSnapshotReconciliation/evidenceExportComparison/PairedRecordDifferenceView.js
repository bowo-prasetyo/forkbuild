// 0.8.200 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Paired Record Difference View.
//
// 0.8.199 compacted 0.8.197's own detailed difference projection into a read
// model — one `{ differenceCount, differingFields }` summary per explicitly
// paired record, plus four counts. Nothing yet shapes that read model into
// what an actual "Inspect differences" panel would put on screen. This file
// is that hand-off, and nothing more — the identical role 0.8.191 already
// plays for 0.8.190, one layer up in the sibling (single-export) chain:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView(readModel)
//     -> { isEmpty,
//          decisionDifferences:    [ { differenceCount, differingFields }, ... ],
//          observationDifferences: [ { differenceCount, differingFields }, ... ],
//          decisionCount, observationCount,
//          differingDecisionCount, differingObservationCount }
//
//   readModel — 0.8.199's own already-computed result, taken directly:
//   `{ decisionDifferences, observationDifferences, decisionCount,
//      observationCount, differingDecisionCount, differingObservationCount }`.
//
//   0.8.198 Explicit Record Pairs
//             │
//             ▼
//   0.8.197 Record Difference Projection
//             │
//             ▼
//   0.8.199 Record Difference Read Model
//             │
//             ▼
//   0.8.200 Paired Record Difference View   ★ (THIS FILE)
//             │
//             ▼
//          Browser
//
// A PRESENTATION PROJECTION, NOT ANOTHER READ MODEL. Every fact this file
// reports is 0.8.199's own fact, read verbatim off its own already-computed
// result. No count is added, dropped, combined, or recomputed; no entry's
// `differenceCount`/`differingFields` is re-derived from the other; no
// `decisionCount`/`observationCount`/`differingDecisionCount`/
// `differingObservationCount` is re-derived from an array's own length.
// This file's only genuine work is deriving one structural flag (`isEmpty`).
//
// ZERO IMPORTS — THE ARCHITECTURAL POINT OF THIS FILE, THE IDENTICAL CHOICE
// 0.8.191 ALREADY MAKES ONE LAYER BELOW ITS OWN SOURCE, 0.8.190.
// `describeXxx()` below performs a pure, structural, duck-typed transform of
// whatever shape it is handed — it never imports 0.8.199's own module to
// validate that shape. There is therefore nothing here for a caller to
// accidentally import that would open a path back into difference
// computation, pairing, record identity, comparison detail, or any archive
// module. A caller that wants this view built from two real exported
// documents calls 0.8.189's own `describeXxx()`, then optionally 0.8.193's/
// 0.8.195's own, explicitly builds a pairing (0.8.198), then 0.8.197's own
// `describeXxx()`, then 0.8.199's own `describeXxx()`, and hands 0.8.199's
// result here. There is deliberately no `reconstructXxx()` in this file:
// there is no document pair, no explicit pairing, and no archive pair for
// this file itself to read.
//
// `differenceCount`/`differingFields` ARE FORWARDED VERBATIM, NEVER
// RECOMPUTED FROM ONE ANOTHER. Each entry in `decisionDifferences`/
// `observationDifferences` below is a fresh, frozen copy of 0.8.199's own
// entry — the same `differenceCount` number and the same `differingFields`
// array, in the same order, copied rather than referenced. This file never
// checks that `differenceCount === differingFields.length`, and never
// substitutes one for the other when they disagree — that consistency is
// entirely 0.8.199's own responsibility, one layer down. A projection
// consumes the contract of its upstream projection; it does not secretly
// become a validation/recalculation layer.
//
// `decisionCount`/`observationCount`/`differingDecisionCount`/
// `differingObservationCount` ARE FORWARDED VERBATIM, NEVER RE-DERIVED FROM
// AN ARRAY'S OWN LENGTH. These four numbers are read directly off
// `readModel` and copied unchanged — even when a malformed or unusual
// `readModel` supplies a count that disagrees with its own array's length.
// This file has no opinion on whether those numbers are internally
// consistent; it only forwards what 0.8.199 already decided.
//
// `isEmpty` IS A STRUCTURAL FLAG OVER PAIR EXISTENCE, NEVER OVER WHETHER A
// PAIR DIFFERS — THE ONE GENUINELY PRESENTATION-ORIENTED DERIVATION IN THIS
// FILE. `isEmpty` is `true` exactly when `decisionCount === 0 AND
// observationCount === 0` — no pair was ever explicitly supplied, on
// either side. It is deliberately NOT `differingDecisionCount === 0 AND
// differingObservationCount === 0`: one explicitly paired, completely
// identical record is a real pair a human chose to compare, and must still
// render as a real (non-empty) comparison, distinct from "no pair was ever
// selected." This is the same "a pair with zero differences is still a
// pair" invariant 0.8.199 already holds, held here again one layer up.
//
// NO NEW SUMMARY VOCABULARY. This file adds exactly one field, `isEmpty`,
// to 0.8.199's own six fields — never `same`, `hasDifferences`, `status`,
// `matchingPairCount`, or `mismatchingPairCount`. Those would each quietly
// introduce interpretation ("this pair is fine," "this pair needs
// attention") on top of the plain structural facts 0.8.197/0.8.199 already
// established: pair count, difference count, differing pair count,
// differing fields. See docs/Principles.md, "The UI Displays Observations;
// It Does Not Turn Them Into A Verdict" (0.8.57) — held here again, one
// layer above 0.8.199's own read model.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK, NO DOM.
// `describeXxx()` reads no clock, contacts no server, renders no markup, and
// mutates no argument. Calling it twice with byte-identical arguments
// returns a byte-identical result. Every object returned is newly frozen;
// nothing from `readModel` is referenced by mutable path.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY, VALID VIEW — NEVER THROWS. A
// `readModel` that is `null`, `undefined`, or missing a genuine
// `decisionDifferences`/`observationDifferences` array degrades that
// section to `[]`; a missing/non-finite `decisionCount`/`observationCount`/
// `differingDecisionCount`/`differingObservationCount` degrades to `0`; a
// malformed individual entry (not an object, or whose `differenceCount`/
// `differingFields` are missing or malformed) degrades to
// `{ differenceCount: 0, differingFields: [] }` — the identical degrade-to-
// least-claimed behavior 0.8.190/0.8.191/0.8.199 already use. A `readModel`
// this degraded is always `isEmpty: true`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **`same`, `hasDifferences`, `status`, `matchingPairCount`,
//   `mismatchingPairCount`, or any other interpretive summary field.** See
//   "No new summary vocabulary," above.
// - **A `conflict`, `mismatchSeverity`, `winner`, `better`, `correct`,
//   `stale`, `invalid`, `resolution`, or `recommendation` field or
//   vocabulary of any kind.** Inherited unchanged from every layer beneath
//   this one.
// - **Reading a pair's own `source`/`target`.** 0.8.199's own result never
//   carries them; this file forwards nothing 0.8.199 itself does not
//   already carry.
// - **Recomputing `differenceCount` from `differingFields.length`, or any
//   of the four top-level counts from an array's own length.** See
//   "`differenceCount`/`differingFields` are forwarded verbatim" and
//   "the four counts are forwarded verbatim," above.
// - **Reading 0.8.189's, 0.8.193's, 0.8.195's, 0.8.197's, or 0.8.198's own
//   result, either exported document, either archive, or any explicit
//   pairing directly.** This file's one argument is always 0.8.199's own
//   already-computed result — see "Zero imports," above.
// - **Any markup, DOM nodes, or control-rendering technology choice.** This
//   file returns plain, frozen, JSON-safe data; an "Inspect differences"
//   panel/page (if ever built) is separate, later, UI-layer work.
// - **Persistence, synchronization, or automatic/periodic/background
//   computation of any kind.** This function runs only when a caller
//   explicitly calls it.

function isGenuineObject(value) {
    return Boolean(value) && typeof value === 'object';
}

// Forwards one 0.8.199 summary entry verbatim — a fresh, frozen copy of its
// own `differenceCount`/`differingFields`, never recomputed from one
// another. A malformed entry degrades to a zero-difference summary, never
// throws. See this file's own header, "`differenceCount`/`differingFields`
// are forwarded verbatim."
function forwardedSummaryOf(entry) {
    const genuine = isGenuineObject(entry);
    const differingFields = genuine && Array.isArray(entry.differingFields)
        ? Object.freeze(entry.differingFields.slice())
        : Object.freeze([]);
    const differenceCount = genuine && Number.isFinite(entry.differenceCount)
        ? entry.differenceCount
        : 0;
    return Object.freeze({ differenceCount, differingFields });
}

// Maps a 0.8.199-supplied array of summary entries into the identical-
// length array of forwarded copies, one entry in, one entry out, in the
// exact same position and order. No entry is ever dropped.
function forwardedSummariesOf(entries) {
    const entriesArray = Array.isArray(entries) ? entries : [];
    return Object.freeze(entriesArray.map(forwardedSummaryOf));
}

// Forwards one top-level count verbatim, defaulting only when absent or
// non-numeric — never re-derived from an array's own length. See this
// file's own header, "the four counts are forwarded verbatim."
function forwardedCountOf(readModel, key) {
    const value = isGenuineObject(readModel) ? readModel[key] : undefined;
    return Number.isFinite(value) ? value : 0;
}

// describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView()
// — see this file's own header for the full contract. Never recomputes any
// of 0.8.199's own facts; malformed/absent input degrades to an empty,
// `isEmpty: true` view, never throws.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonPairedRecordDifferenceView(readModel) {
    const decisionDifferences = forwardedSummariesOf(isGenuineObject(readModel) ? readModel.decisionDifferences : undefined);
    const observationDifferences = forwardedSummariesOf(isGenuineObject(readModel) ? readModel.observationDifferences : undefined);

    const decisionCount = forwardedCountOf(readModel, 'decisionCount');
    const observationCount = forwardedCountOf(readModel, 'observationCount');
    const differingDecisionCount = forwardedCountOf(readModel, 'differingDecisionCount');
    const differingObservationCount = forwardedCountOf(readModel, 'differingObservationCount');

    return Object.freeze({
        isEmpty: decisionCount === 0 && observationCount === 0,
        decisionDifferences,
        observationDifferences,
        decisionCount,
        observationCount,
        differingDecisionCount,
        differingObservationCount
    });
}
