// 0.8.197 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Record Difference View.
//
// 0.8.195 named a decision/observation record's own identity fields
// explicitly (4 fields for a decision, 7 for an observation), so a reader
// staring at two similar-looking records side by side no longer has to
// informally re-derive which fields exist. But "the fields are all named"
// is not the same as "the differing field is pointed out" — a reader
// comparing two seven-field observation identity objects by eye still has
// to manually walk all seven to find the one that differs. This file is
// that answer, and nothing more:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference(pairs)
//     -> { decisionDifferences:    [ { source, target, differences }, ... ],
//          observationDifferences: [ { source, target, differences }, ... ] }
//
//   pairs — an EXPLICITLY SUPPLIED pairing, never derived by this file:
//   `{ decisionPairs: [ { source, target }, ... ],
//      observationPairs: [ { source, target }, ... ] }`. Each `source`/
//   `target` is one decision or observation record (0.8.195's own named-
//   field identity object, or any raw record carrying the same field
//   names — see "No new identity algorithm," below, for why either works).
//
//   0.8.189 Detailed Export Comparison
//             │
//             ▼
//   0.8.193 Comparison Detail Projection
//             │
//             ▼
//   0.8.195 Record Identity Projection
//             │
//             ▼ (caller explicitly pairs two records)
//   0.8.197 Record Difference Projection   ★ (THIS FILE)
//
// NO AUTOMATIC PAIRING — THE ONE RULE EVERYTHING ELSE HERE EXISTS TO
// PROTECT. This file never looks at `sourceOnly`/`targetOnly` and guesses
// which source-only record "must be" the same evidence as which
// target-only record. Inventing that pairing would create a new semantic
// claim this codebase has never made — "these two records are versions of
// the same underlying evidence" — directly contradicting 0.8.189's own
// deliberately conservative structural-identity stance (see 0.8.189's own
// header, "Evidence identity is the existing structural identity the
// exported records already carry"). Every pair this file ever compares is
// a pair the CALLER explicitly supplied; there is no code path in this
// file that reads a `sourceOnly` or `targetOnly` array, and no code path
// that matches two records by candidate, by index, or by any computed
// similarity.
//
// NO NEW IDENTITY ALGORITHM — THE SAME RULE 0.8.195 ALREADY HOLDS, ONE
// LAYER UP. This file does not invent which fields make up a decision or
// observation record's identity; it reuses 0.8.195's own two field lists
// verbatim (`decided`/`candidate`/`decision`/`decidedAt` for a decision;
// `candidate`/`decision`/`planIdentity`/`candidatePresent`/`candidateType`/
// `candidateMatchesPlan`/`observedAt` for an observation). Those two lists
// are duplicated here as plain data, not imported, for the identical
// reason 0.8.193 already duplicates 0.8.189's own defaults one layer
// below: this file must read the same named fields without importing a
// module that itself carries comparison vocabulary (see "Architectural
// boundary," below). Because this file re-projects `source`/`target` onto
// exactly those named fields before comparing, a caller may hand it either
// 0.8.195's own identity object or a raw 0.8.193/0.8.189 record — both
// carry the identical field names, so both produce an identical result.
//
// NO RE-PARTITIONING, NO RE-DERIVED SHARED/SOURCE-ONLY/TARGET-ONLY. This
// file never decides whether a record is shared, source-only, or
// target-only — that fact belongs to 0.8.189 alone, and is never read,
// consulted, or re-derived here. This file answers a strictly narrower
// question than 0.8.189's own comparison: given two records a caller has
// ALREADY decided to compare, which named fields differ between them?
//
// EACH DIFFERENCE ENTRY IS `{ source, target, differences }` — DELIBERATELY
// FACTUAL, NEVER A VERDICT. `differences` is the subset of the record
// kind's own field list (in that list's own fixed order) whose value
// differs between `source` and `target` — an array of field NAMES, e.g.
// `["candidateMatchesPlan"]`, `["observedAt"]`, or `[]` when every named
// field agrees. There is no `conflict`, `mismatchSeverity`, `winner`,
// `better`, `correct`, `stale`, `invalid`, `resolution`, or
// `recommendation` field anywhere in this file or its result — the output
// answers "what differs," never "what should happen." `source` and
// `target` on each entry are this file's own named-field projections
// (identical in shape to 0.8.195's own decision/observation identity
// objects) so a reader can see the compared values directly, without
// re-reading the original pair supplied.
//
// FIELD VALUES ARE COMPARED STRUCTURALLY, NEVER BY REFERENCE. A `candidate`,
// `decision`, or `planIdentity` field holds an object; two such objects
// that are `deepEqual` but not the same reference (e.g. re-parsed from two
// separate exported documents) must never be reported as a spurious
// difference. This file's own `sameValue()` walks plain objects and arrays
// recursively; it is the one place in this whole family of files where a
// structural, cross-record comparison belongs, because comparing two
// records is this file's entire, single purpose — unlike 0.8.193/0.8.195,
// which forward or name records without ever comparing one to another.
//
// FIELD ORDER, AND ENTRY ORDER, ARE DETERMINISTIC. `differences` always
// lists a record kind's own fields in that kind's own fixed declaration
// order, never the order fields happen to differ in. `decisionDifferences`/
// `observationDifferences` each hold one entry per input pair, in the
// exact order `decisionPairs`/`observationPairs` were supplied — this file
// appends no entry, drops no entry, deduplicates nothing, and reorders
// nothing.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK, NO DOM.
// `describeXxx()` reads no clock, contacts no server, renders no markup,
// and mutates no argument (or anything the argument holds). Calling it
// twice with byte-identical arguments returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY, VALID PROJECTION — NEVER THROWS. A
// `pairs` argument that is `null`, `undefined`, or missing a genuine
// `decisionPairs`/`observationPairs` array degrades that list to `[]`; a
// malformed individual pair (not an object, or missing `source`/`target`)
// degrades to an entry whose `source`/`target` fields are all `undefined`
// and whose `differences` is `[]` (two absent records are never reported
// as differing on every field) — every position in an input pair array
// still has exactly one corresponding position in the output array.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS NOTHING. `describeXxx()`
// below performs a pure, structural, duck-typed transform of whatever
// shape it is handed — the identical zero-imports discipline 0.8.191/
// 0.8.193/0.8.195 already hold. There is deliberately no `reconstructXxx()`
// in this file: there is no comparison, no export pair, and no archive
// pair for this file itself to read — a caller who wants this projection
// built from two real exported documents calls 0.8.189's own
// `describeXxx()`, then 0.8.193's own `describeXxx()`, then optionally
// 0.8.195's own `describeXxx()`, EXPLICITLY decides which records to pair,
// and hands that pairing here.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Automatically pairing a source-only record with a target-only
//   record.** See "No automatic pairing," above — the flagship
//   architectural constraint this milestone exists to hold.
// - **Re-deriving shared/source-only/target-only membership.** See
//   "No re-partitioning," above — that fact stays 0.8.189's alone.
// - **A `conflict`, `mismatchSeverity`, `winner`, `better`, `correct`,
//   `stale`, `invalid`, `resolution`, or `recommendation` field or
//   vocabulary of any kind.** See "Each difference entry," above.
// - **A rank, score, confidence, or synchronization/transport vocabulary
//   of any kind.** Inherited unchanged from every layer beneath this one.
// - **Deduplication, merging, or collapsing of any two records that "look
//   similar."** Inherited unchanged from 0.8.189/0.8.193/0.8.195.
// - **Any markup, DOM nodes, or control-rendering technology choice.**
//   This file returns plain, frozen, JSON-safe data; an "Inspect
//   differences" UI (if ever built) is separate, later, UI-layer work —
//   deliberately deferred by the milestone that requested this file.
// - **Reading 0.8.189's own result, 0.8.193's own result, either exported
//   document, either archive, or 0.8.188's own `importXxx()` directly.**
//   This file's one argument is always a caller-supplied, explicit pairing
//   of already-identified records — see "Architectural boundary," above.
// - **Persistence, or automatic/periodic/background computation of any
//   kind.** This function runs only when a caller explicitly calls it.

function isGenuineObject(value) {
    return Boolean(value) && typeof value === 'object';
}

// The complete named-field identity of a 0.8.145 decision record — the
// identical four fields 0.8.195's own `decisionIdentityOf()` already
// names, duplicated here as plain data (see this file's own header, "No
// new identity algorithm").
const DECISION_FIELDS = Object.freeze(['decided', 'candidate', 'decision', 'decidedAt']);

// The complete named-field identity of a 0.8.182-surfaced observation
// record — the identical seven fields 0.8.195's own
// `observationIdentityOf()` already names, duplicated here as plain data.
const OBSERVATION_FIELDS = Object.freeze(['candidate', 'decision', 'planIdentity', 'candidatePresent', 'candidateType', 'candidateMatchesPlan', 'observedAt']);

// Structural equality, recursing through plain objects and arrays — the
// one cross-value comparison this whole file family exists to perform.
// See this file's own header, "Field values are compared structurally."
function sameValue(a, b) {
    if (a === b) return true;
    if (!isGenuineObject(a) || !isGenuineObject(b)) return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    if (Array.isArray(a)) {
        if (a.length !== b.length) return false;
        for (let index = 0; index < a.length; index += 1) {
            if (!sameValue(a[index], b[index])) return false;
        }
        return true;
    }
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && sameValue(a[key], b[key]));
}

// Projects one record onto exactly the named fields for its kind — the
// identical shape 0.8.195's own `decisionIdentityOf()`/
// `observationIdentityOf()` already produce. A malformed/absent record
// degrades to an object whose fields are all `undefined`, never throws.
function namedFieldsOf(record, fields) {
    const genuine = isGenuineObject(record);
    const projected = {};
    for (const field of fields) {
        projected[field] = genuine ? record[field] : undefined;
    }
    return Object.freeze(projected);
}

// Compares one explicitly supplied pair over one record kind's own field
// list, in that list's own fixed order. See this file's own header,
// "Malformed input degrades," for the empty-pair default.
function differenceOf(pair, fields) {
    const genuine = isGenuineObject(pair);
    const source = namedFieldsOf(genuine ? pair.source : undefined, fields);
    const target = namedFieldsOf(genuine ? pair.target : undefined, fields);
    const differences = fields.filter((field) => !sameValue(source[field], target[field]));
    return Object.freeze({ source, target, differences: Object.freeze(differences) });
}

// Maps a caller-supplied array of explicit pairs into the identical-length
// array of difference entries, one pair in, one entry out, in the exact
// same position and order.
function differencesOf(pairs, fields) {
    const pairsArray = Array.isArray(pairs) ? pairs : [];
    return Object.freeze(pairsArray.map((pair) => differenceOf(pair, fields)));
}

// describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference()
// — see this file's own header for the full contract. Never re-partitions
// shared/source-only/target-only, never invents a pairing between two
// records; malformed/absent input degrades to an empty difference
// projection, never throws.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordDifference(pairs) {
    const genuine = isGenuineObject(pairs);
    return Object.freeze({
        decisionDifferences: differencesOf(genuine ? pairs.decisionPairs : undefined, DECISION_FIELDS),
        observationDifferences: differencesOf(genuine ? pairs.observationPairs : undefined, OBSERVATION_FIELDS)
    });
}
