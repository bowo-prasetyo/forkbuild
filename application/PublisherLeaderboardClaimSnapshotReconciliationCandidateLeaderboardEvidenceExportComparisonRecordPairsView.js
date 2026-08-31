// 0.8.198 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Record Pairs View.
//
// 0.8.197 answers "which named fields differ between two paired records?" —
// but it takes the pairing itself as a given, caller-supplied argument, and
// has never had a file of its own that states what an explicit pair even
// IS. This file is that seam, and nothing more: a small, purely structural
// layer that represents "the caller has explicitly chosen to compare THESE
// two records," without deciding whether they should be paired, and without
// computing any difference between them.
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs(pairs)
//     -> { decisionPairs:    [ { source, target }, ... ],
//          observationPairs: [ { source, target }, ... ] }
//
//   pairs — an EXPLICITLY SUPPLIED, caller-built pairing, never derived by
//   this file: `{ decisionPairs: [ { source, target }, ... ],
//   observationPairs: [ { source, target }, ... ] }`. Each `source`/`target`
//   is any decision or observation record the caller already holds —
//   0.8.195's own named-field identity object, a raw 0.8.193/0.8.189
//   record, or anything else; this file never inspects what shape it is.
//
//   0.8.189 Detailed Export Comparison
//             │
//             ├── 0.8.193 Comparison Detail Projection
//             │             │
//             │             ▼
//             │      0.8.195 Record Identity Projection
//             │
//             └── 0.8.197 Record Difference Projection
//                          ▲
//                          │
//                 0.8.198 Record Pairs Projection   ★ (THIS FILE)
//
// NO AUTOMATIC PAIRING — THE ONE RULE EVERYTHING ELSE HERE EXISTS TO
// PROTECT, INHERITED UNCHANGED FROM 0.8.197. This file never searches for a
// "matching" record and never manufactures a pair; it has no `sourceOnly`
// or `targetOnly` array to read in the first place, because its own one
// argument already IS the pairing. There is no `.find(...)`, no candidate-
// identity lookup, no timestamp comparison, and no other heuristic anywhere
// in this file. Every pair this file ever holds is a pair the CALLER
// explicitly supplied, at the exact array position the caller supplied it.
//
// NO DIFFERENCE COMPUTATION — THIS FILE DOES STRICTLY LESS THAN 0.8.197,
// ON PURPOSE. `describeXxx()` below reads two fields off each supplied
// pair and nothing else: no `sameValue()`, no field list, no `differences`
// array, and no walk of either record's own fields. This file establishes
// only "these two records were explicitly supplied as a pair" — 0.8.197,
// given this file's own result as its `pairs` argument, is what answers
// "which fields differ between that pair." The seam is deliberately this
// narrow:
//
//   explicit pairing (0.8.198)  ──▶  field difference (0.8.197)
//
// rather than
//
//   records ──▶ automatic/guessed pairing ──▶ difference ──▶ implicit verdict
//
// RECORD IDENTITY IS PRESERVED — THE SUPPLIED `source`/`target` ARE THE
// ORIGINAL REFERENCES, NEVER CLONED, NORMALIZED, OR REWRITTEN. Unlike
// 0.8.195's own `decisionIdentityOf()`/`observationIdentityOf()` (which
// project a record onto a NEW object of exactly its own named fields),
// this file never reads into `source`/`target` at all — it carries the two
// values straight through, so `pair.source === suppliedSource` and
// `pair.target === suppliedTarget` hold for every pair this file returns.
// `Object.freeze()` below freezes only the small `{ source, target }`
// wrapper this file itself allocates; it never freezes, and never even
// touches, whatever `source`/`target` themselves point at.
//
// DECISION PAIRS AND OBSERVATION PAIRS STAY TWO SEPARATE SECTIONS —
// INHERITED UNCHANGED FROM EVERY LAYER BENEATH THIS ONE. `decisionPairs`
// and `observationPairs` are read and returned independently; this file
// never merges them, never infers a pair's kind from what `source`/`target`
// happen to look like, and never regroups either section by candidate.
//
// MULTIPLICITY REMAINS MEANINGFUL — NO DEDUPLICATION OF ANY KIND. If the
// caller explicitly supplies the same `{ source, target }` pair twice (even
// the identical two references, at the identical array positions), both
// pairs remain present, in the exact order supplied. This file never
// compares one pair against another, so it has no way to notice — and no
// business trying to notice — that two supplied pairs "look the same."
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK, NO DOM.
// `describeXxx()` reads no clock, contacts no server, renders no markup,
// and mutates no argument (or anything the argument holds). Calling it
// twice with byte-identical arguments returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO A STRUCTURALLY VALID PROJECTION — NEVER
// THROWS. A `pairs` argument that is `null`, `undefined`, or missing a
// genuine `decisionPairs`/`observationPairs` array degrades that list to
// `[]`; a malformed individual entry (not an object, or missing `source`/
// `target`) degrades to a structurally valid pair whose `source`/`target`
// are both `undefined` — never repaired by substituting some other record,
// and never dropped: every position in an input pair array still has
// exactly one corresponding position in the output array.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS NOTHING. `describeXxx()` below
// performs a pure, structural, duck-typed transform of whatever shape it is
// handed — the identical zero-imports discipline 0.8.191/0.8.193/0.8.195/
// 0.8.197 already hold. There is deliberately no `reconstructXxx()` in this
// file: there is no comparison, no export pair, and no archive pair for
// this file itself to read — and no dependency on 0.8.189, 0.8.195, or
// 0.8.197 is necessary, because this file's one argument is already
// whatever pairing the caller decided to build, from whatever records the
// caller already holds.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Automatically pairing a source-only record with a target-only
//   record, or any candidate-identity/timestamp/plan-identity heuristic
//   for manufacturing a pair.** See "No automatic pairing," above — the
//   flagship architectural constraint this milestone exists to hold.
// - **Computing any difference, similarity, or comparison between a
//   pair's `source` and `target`.** See "No difference computation,"
//   above — that is 0.8.197's own, separate job, given this file's result
//   as its own `pairs` argument.
// - **Cloning, normalizing, or otherwise rewriting a supplied `source`/
//   `target`.** See "Record identity is preserved," above.
// - **Deduplicating, merging, or collapsing two supplied pairs that "look
//   the same."** See "Multiplicity remains meaningful," above.
// - **Repairing a malformed pair by substituting or searching for another
//   record.** See "Malformed input degrades," above — a malformed pair
//   degrades to `undefined` sides; it is never patched with a guess.
// - **A `conflict`, `mismatchSeverity`, `winner`, `better`, `correct`,
//   `stale`, `invalid`, `resolution`, or `recommendation` field or
//   vocabulary of any kind.** Inherited unchanged from every layer beneath
//   this one.
// - **Any markup, DOM nodes, or control-rendering technology choice.**
//   This file returns plain, frozen, JSON-safe data; a UI where a human
//   explicitly selects two records to pair (if ever built) is separate,
//   later, UI-layer work — deliberately deferred by the milestone that
//   requested this file.
// - **Persistence, or automatic/periodic/background computation of any
//   kind.** This function runs only when a caller explicitly calls it.

function isGenuineObject(value) {
    return Boolean(value) && typeof value === 'object';
}

// Carries one caller-supplied pair straight through into this file's own
// `{ source, target }` wrapper — never reading, projecting, or comparing
// either side. See this file's own header, "Record identity is preserved."
// A malformed entry (not an object) degrades to an all-undefined pair
// rather than being repaired or dropped.
function pairOf(entry) {
    const genuine = isGenuineObject(entry);
    return Object.freeze({
        source: genuine ? entry.source : undefined,
        target: genuine ? entry.target : undefined
    });
}

// Maps a caller-supplied array of explicit pairs into the identical-length
// array of pair wrappers, one entry in, one entry out, in the exact same
// position and order. See this file's own header, "Multiplicity remains
// meaningful" — no entry is ever deduplicated, merged, or dropped.
function pairsOf(entries) {
    const entriesArray = Array.isArray(entries) ? entries : [];
    return Object.freeze(entriesArray.map(pairOf));
}

// describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs()
// — see this file's own header for the full contract. Never searches for or
// invents a pairing; malformed/absent input degrades to an empty pairs
// projection, never throws.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordPairs(pairs) {
    const genuine = isGenuineObject(pairs);
    return Object.freeze({
        decisionPairs: pairsOf(genuine ? pairs.decisionPairs : undefined),
        observationPairs: pairsOf(genuine ? pairs.observationPairs : undefined)
    });
}
