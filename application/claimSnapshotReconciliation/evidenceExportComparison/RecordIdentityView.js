// 0.8.195 — Reconciliation Candidate Leaderboard Evidence Export Comparison
// Record Identity View.
//
// 0.8.193 answers "which exact decision/observation records are shared,
// source-only, or target-only?" by forwarding 0.8.189's own already-
// partitioned record arrays unchanged. Every record in those arrays already
// carries its own complete identity — the exact fields 0.8.189's own
// `recordKey()` already treats as one indivisible `JSON.stringify()` key
// (see 0.8.189's own header, "Evidence identity is the existing structural
// identity the exported records already carry") — but a reader staring at
// an opaque `{ candidate: {...}, decision: {...}, decided: true, decidedAt:
// '...' }` still has no explicit answer to "why are these two records
// separate records?" without informally re-deriving it themselves. This
// file is that answer, and nothing more:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity(detail)
//     -> { decisionEvidence:    { shared, sourceOnly, targetOnly },
//          observationEvidence: { shared, sourceOnly, targetOnly } }
//
//   detail — 0.8.193's own already-computed result, taken directly:
//   `{ metadata, candidates, decisionEvidence, observationEvidence }`, the
//   latter two each shaped `{ shared, sourceOnly, targetOnly }` arrays of
//   0.8.189's own raw decision/observation records.
//
//   0.8.189 Detailed Export Comparison
//             │
//             ▼
//   0.8.193 Comparison Detail Projection
//             │
//             ▼
//   0.8.195 Record Identity Projection   ★ (THIS FILE)
//
// NO NEW IDENTITY ALGORITHM — THE ONE RULE EVERYTHING ELSE HERE EXISTS TO
// PROTECT. 0.8.189 already decided what makes two records the same or
// different (whole-record structural equality — see 0.8.189's own
// `recordKey()`); this file never re-derives that decision, never
// re-partitions `shared`/`sourceOnly`/`targetOnly`, and never computes a
// diff, a similarity score, or a "which field differs" comparison between
// any two records. It performs exactly one transform, on exactly one
// record at a time, in isolation: naming that record's own already-
// existing fields explicitly, so a human reading two records side by side
// can see which field differs without recomputing anything. There is no
// `JSON.stringify()` — or any other cross-record comparison — anywhere in
// this file; 0.8.189's own comparison is never duplicated here.
//
// A DECISION RECORD'S IDENTITY IS ITS OWN FOUR FIELDS, NAMED EXPLICITLY —
// THE EXACT SHAPE 0.8.145'S OWN DECISION RECORDS ALREADY CARRY (see
// 0.8.182's own header: "0.8.145 decision records (`{ decided, candidate,
// decision, decidedAt }`)"). `decided`/`candidate`/`decision`/`decidedAt`
// are read directly off the supplied record; nothing is added, renamed, or
// dropped.
//
// AN OBSERVATION RECORD'S IDENTITY IS ITS OWN SEVEN FIELDS, NAMED
// EXPLICITLY — THE EXACT SHAPE 0.8.182'S OWN `withSurfacedCandidate()`
// ALREADY PRODUCES AND 0.8.189/0.8.193 ALREADY FORWARD UNCHANGED:
// `candidate`/`decision`/`planIdentity`/`candidatePresent`/`candidateType`/
// `candidateMatchesPlan`/`observedAt`. `decision` here is the FULL embedded
// decision record (`{ decided, candidate, decision, decidedAt }`), never
// flattened to a disposition string — the identical nesting 0.8.182's own
// header already insists on ("never just the disposition string").
//
// DECISION EVIDENCE AND OBSERVATION EVIDENCE STAY TWO SEPARATE SECTIONS,
// EACH STILL FLAT ACROSS EVERY CANDIDATE — 0.8.189'S OWN FLAGSHIP
// DISTINCTION, HELD HERE AGAIN, NOW OVER NAMED FIELDS RATHER THAN OPAQUE
// RECORDS. Every array below is 0.8.193's own array, mapped one entry to
// one entry, in 0.8.193's own order — the identical order 0.8.189 itself
// already established. This file adds no record, drops no record,
// deduplicates nothing, reorders nothing, and never regroups either
// section by candidate.
//
// `candidateMatchesPlan`, `candidatePresent`, AND `candidateType` ARE
// DISPLAYED AS FACTS, NEVER INTERPRETED — inherited unchanged from
// 0.8.162's/0.8.182's own "forbidden vocabulary." `candidateMatchesPlan:
// false` is reported as exactly that field, at exactly that value — never
// renamed to `stale`, `invalid`, `conflicting`, or `needs attention`. Two
// observations differing only in `candidateMatchesPlan`, or only in
// `observedAt`, remain two separate entries in their own arrays — see
// 0.8.189's own multiset partitioning, held here again, now visible field
// by field rather than only as opaque separate array entries.
//
// NO CANDIDATE-PRESENCE SECTION ON THIS FILE'S OWN RESULT. 0.8.193's own
// `candidates` section (`{ shared, sourceOnly, targetOnly }` of candidate
// objects) is not projected here: a candidate object already IS its own
// complete identity with no further internal structure this file could
// usefully name apart from what a reader already sees printing it
// directly, unlike a decision or observation record, whose identity is a
// bundle of several differently-named fields. A caller wanting candidate
// presence already has 0.8.193's own `candidates` section unchanged.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK, NO DOM.
// `describeXxx()` reads no clock, contacts no server, renders no markup,
// and mutates no argument (or anything the argument holds). Calling it
// twice with byte-identical arguments returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY, VALID PROJECTION — NEVER THROWS. A
// `detail` that is `null`, `undefined`, or missing a genuine
// `decisionEvidence`/`observationEvidence` section degrades that section to
// `{ shared: [], sourceOnly: [], targetOnly: [] }`; a malformed individual
// record within an otherwise genuine array degrades to an identity object
// whose fields are all `undefined` rather than throwing or being skipped —
// every position in an input array still has exactly one corresponding
// position in the output array.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS NOTHING. `describeXxx()`
// below performs a pure, structural, duck-typed transform of whatever
// shape it is handed — the identical zero-imports discipline 0.8.191/
// 0.8.193 already hold. There is deliberately no `reconstructXxx()` in
// this file: there is no comparison, no export pair, and no archive pair
// for this file itself to read — a caller who wants this projection built
// from two real exported documents calls 0.8.189's own `describeXxx()`,
// then 0.8.193's own `describeXxx()`, and hands 0.8.193's result here.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A new identity algorithm, a diff, a similarity score, or any
//   field-by-field comparison between two records.** See "No new identity
//   algorithm," above — this file names one record's own fields; it never
//   compares two records against each other.
// - **A `candidates` (candidate-presence) section.** See "No
//   candidate-presence section," above.
// - **Regrouping evidence by candidate.** Inherited unchanged from
//   0.8.189/0.8.193.
// - **A rank, score, winner, correct/incorrect, valid, stale, preferred,
//   status, or confidence field or vocabulary of any kind.** Inherited
//   unchanged from every layer beneath this one.
// - **Deduplication, merging, or collapsing of any two records that "look
//   similar."** Inherited unchanged from 0.8.189/0.8.193.
// - **Any markup, DOM nodes, or control-rendering technology choice.**
//   This file returns plain, frozen, JSON-safe data; a UI that renders
//   these named fields side by side (if ever built) is separate, later,
//   UI-layer work — deliberately deferred by the milestone that requested
//   this file.
// - **Reading 0.8.189's own result, either exported document, either
//   archive, or 0.8.188's own `importXxx()`.** This file's one argument is
//   always 0.8.193's own already-computed result — see "Architectural
//   boundary," above.
// - **Persistence, or automatic/periodic/background computation of any
//   kind.** This function runs only when a caller explicitly calls it.

function isGenuineSection(value) {
    return Boolean(value) && typeof value === 'object';
}

function isGenuineRecord(value) {
    return Boolean(value) && typeof value === 'object';
}

// The complete identity of a 0.8.145 decision record, named field by
// field — see this file's own header, "A decision record's identity is
// its own four fields."
function decisionIdentityOf(record) {
    const genuine = isGenuineRecord(record);
    return Object.freeze({
        decided: genuine ? record.decided : undefined,
        candidate: genuine ? record.candidate : undefined,
        decision: genuine ? record.decision : undefined,
        decidedAt: genuine ? record.decidedAt : undefined
    });
}

// The complete identity of a 0.8.182-surfaced observation record, named
// field by field — see this file's own header, "An observation record's
// identity is its own seven fields."
function observationIdentityOf(record) {
    const genuine = isGenuineRecord(record);
    return Object.freeze({
        candidate: genuine ? record.candidate : undefined,
        decision: genuine ? record.decision : undefined,
        planIdentity: genuine ? record.planIdentity : undefined,
        candidatePresent: genuine ? record.candidatePresent : undefined,
        candidateType: genuine ? record.candidateType : undefined,
        candidateMatchesPlan: genuine ? record.candidateMatchesPlan : undefined,
        observedAt: genuine ? record.observedAt : undefined
    });
}

const EMPTY_IDENTITY_SECTION = Object.freeze({
    shared: Object.freeze([]),
    sourceOnly: Object.freeze([]),
    targetOnly: Object.freeze([])
});

// Maps one 0.8.193 section (`{ shared, sourceOnly, targetOnly }` of raw
// records) into the identical shape holding named-field identity objects
// instead — one record in, one identity object out, in the exact same
// position and the exact same order. See this file's own header, "Malformed
// input degrades," for the empty-section and malformed-record defaults.
function identitySectionOf(detail, key, identityOf) {
    const section = isGenuineSection(detail) ? detail[key] : undefined;
    if (!isGenuineSection(section)) return EMPTY_IDENTITY_SECTION;
    const shared = Array.isArray(section.shared) ? section.shared : [];
    const sourceOnly = Array.isArray(section.sourceOnly) ? section.sourceOnly : [];
    const targetOnly = Array.isArray(section.targetOnly) ? section.targetOnly : [];
    return Object.freeze({
        shared: Object.freeze(shared.map(identityOf)),
        sourceOnly: Object.freeze(sourceOnly.map(identityOf)),
        targetOnly: Object.freeze(targetOnly.map(identityOf))
    });
}

// describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity()
// — see this file's own header for the full contract. Never re-computes or
// re-partitions any of 0.8.189's own arrays; malformed/absent input
// degrades to an empty identity projection on every section, never throws.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExportComparisonRecordIdentity(detail) {
    return Object.freeze({
        decisionEvidence: identitySectionOf(detail, 'decisionEvidence', decisionIdentityOf),
        observationEvidence: identitySectionOf(detail, 'observationEvidence', observationIdentityOf)
    });
}
