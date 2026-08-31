import {
    RECONCILIATION_CANDIDATE_LEADERBOARD_EVIDENCE_EXPORT_PROTOCOL_VERSION
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport.js';
import {
    ReconciliationCandidateLeaderboardEvidenceKind,
    ReconciliationCandidateLeaderboardReplicaRelation
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js';
import {
    ReconciliationCandidateLeaderboardComparisonState
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState.js';

// 0.8.188 — Reconciliation Candidate Leaderboard Evidence Export Import.
//
// 0.8.186 turned an on-screen, already-filtered evidence view into a
// portable JSON document; 0.8.187 gave a person a button to download it.
// Neither one gave a reader a way to bring such a document BACK — to take
// a file someone emailed them, or a report from a week ago, and look at it
// again without re-supplying the two archives that produced it. This file
// is that way back in, and nothing more:
//
//   importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(payload)
//     -> { outcome: 'imported' | 'invalid-document', document: <frozen document> | null }
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport(document)
//     -> { comparisonState, filter, candidateCount, decisionRecordCount, observationRecordCount }
//
//   0.8.186 Evidence Export ──► a portable JSON document ──► JSON.stringify()
//                                                                    │
//                                                          (saved, emailed,
//                                                           set aside)
//                                                                    │
//                                                              JSON.parse()
//                                                                    │
//                                                                    ▼
//                                        0.8.188 importXxx()   ★ (THIS FILE)
//                                                                    │
//                                                                    ▼
//                                        0.8.188 describeXxx()   ★ (THIS FILE)
//                                                                    │
//                                                                    ▼
//                                                  a read-only summary a
//                                                  reader can look at
//
// THIS FILE NEVER RECONSTRUCTS OR REGENERATES EVIDENCE — IT VALIDATES A
// DOCUMENT'S SHAPE AND REPORTS WHAT IT ALREADY SAYS. `importXxx()` never
// reads `PublicationObservationArchive`, never calls 0.8.176, 0.8.177,
// 0.8.182, 0.8.184, or 0.8.185, never revalidates a decision, never
// reconstructs a plan, never recomputes a fingerprint, and never compares
// two replicas' own archives. An imported document is EVIDENCE THAT WAS
// EXPORTED — a fact about what 0.8.186 already produced — never a new
// archive, and never a claim this file re-derives or re-checks against
// anything. There is deliberately no `reconstructXxx()` in this file: there
// is no archive pair to reconstruct FROM.
//
// `importXxx()` VALIDATES THE PORTABLE DOCUMENT'S STRUCTURAL CONTRACT ONLY
// — `protocolVersion`, `comparisonState`, `filter`, `candidateCount`, and
// `candidates` (each entry: `candidate`, `decisionDetail`,
// `observationDetail`, each detail carrying `sharedCount`/`sourceOnlyCount`/
// `targetOnlyCount` matching the length of its own `shared`/`sourceOnly`/
// `targetOnly` arrays). This is a STRUCTURAL check, not a semantic one: a
// `candidate` object's own internal shape is trusted, not deeply
// re-validated against 0.8.144's own three-value vocabulary, and a record
// inside `shared`/`sourceOnly`/`targetOnly` is trusted, not re-validated
// against 0.8.156's/0.8.174's own decision/observation record contracts —
// this file only ever confirms the ENVELOPE 0.8.186 promised is intact,
// exactly the restraint `PublicationObservationArchive.js`'s own
// `isValidJSON()` holds one layer further down for a full archive's own
// deeply-nested record shapes, held here at a shallower, document-wide
// level appropriate to evidence that was ALREADY validated once, by
// whichever replica originally produced it.
//
// A WRONG `protocolVersion` OR ANY OTHER STRUCTURAL DEFECT REJECTS THE
// WHOLE DOCUMENT — NEVER A PARTIAL IMPORT. `importXxx()` mirrors
// `application/PublicationObservationArchiveExport.js`'s own
// `importPublicationObservationArchive()` exactly: `payload` may be a raw
// string (parsed here) or an already-parsed value; a payload that is not
// valid JSON, is not a plain object, carries an unrecognized
// `protocolVersion`, an unrecognized `comparisonState`, a malformed
// `filter`, or any candidate entry whose `decisionDetail`/
// `observationDetail` counts disagree with their own list lengths yields
// `{ outcome: 'invalid-document', document: null }` — never a document with
// some candidates silently dropped, and never a thrown error. A caller
// (the UI layer, in particular) is expected to leave whatever document it
// already held completely untouched on this outcome — exactly
// `usePeerArchive()`'s own existing "an invalid paste never resets an
// already-supplied genuine value" discipline in
// `ui/views/ReconciliationCandidateLeaderboardView.js`.
//
// `describeXxx()` NEVER RE-VALIDATES — IT TAKES `importXxx()`'S OWN ALREADY-
// VALIDATED `document` DIRECTLY. It performs exactly one further step: a
// structural tally of `decisionRecordCount`/`observationRecordCount`, each
// the sum, across every candidate, of that candidate's own already-computed
// `sharedCount + sourceOnlyCount + targetOnlyCount` — reading fields the
// document already carries, never opening a record, never inspecting a
// record's own fields, never comparing two candidates against each other.
// `comparisonState`, `filter`, and `candidateCount` are forwarded verbatim,
// unchanged, exactly the way 0.8.186 itself forwards `comparisonState`
// verbatim from 0.8.183. A `document` that is not shaped like an already-
// imported result (missing a genuine `candidates` array) degrades to an
// empty, `NO_PEER`, `ALL`/`ALL` summary — the identical "degrade toward an
// honest, empty answer, never throw" discipline every projection in this
// family already holds — never to a fabricated `PEER_PRESENT` or a
// nonzero count this file never actually found.
//
// A CANDIDATE'S OWN RECORD LISTS SURVIVE THE ROUND TRIP UNCHANGED. Every
// record in `shared`/`sourceOnly`/`targetOnly` is copied into a fresh,
// frozen array in the SAME order it appeared in `payload`, with every one
// of ITS OWN fields (including `observedAt`) untouched — `JSON.parse()`
// already reconstructs plain, structurally identical objects from
// `JSON.stringify()`'s own output; this file adds no re-shaping of its
// own on top of that. `NO_PEER` and `PEER_EMPTY` remain distinct through
// the round trip for the identical reason they remain distinct through
// export (0.8.186's own Section H): `comparisonState` is a validated
// ENUM VALUE, read and forwarded verbatim, never re-derived from whether
// `candidates` happens to be empty.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK. Neither
// function here reads a clock, writes to storage, or contacts a server.
// `importXxx()` returns a freshly built, deeply frozen document; nothing it
// is handed (an already-parsed `payload` object, in particular) is ever
// mutated. Calling either function twice with byte-identical arguments
// returns byte-identical output.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS EXACTLY THREE MODULES: 0.8.186
// (its own frozen protocol-version constant, reused rather than
// hardcoded), 0.8.184 (its frozen `evidenceKind`/`replicaRelation` enums,
// reused rather than redeclared), and 0.8.183 (its frozen `comparisonState`
// enum). It never imports `PublicationObservationArchive` or any
// archive-reading module, never imports 0.8.176/0.8.177/0.8.182, never
// imports 0.8.184's/0.8.185's own `describeXxx()`/`reconstructXxx()`, never
// imports 0.8.186's own `describeXxx()`/`reconstructXxx()` (only its
// frozen constant), and never imports anything from `ui/`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Reading either archive, or calling 0.8.176/0.8.177/0.8.182.** See
//   "This file never reconstructs or regenerates evidence," above.
// - **Revalidating a decision, reconstructing a plan, or recomputing a
//   fingerprint.** The same restraint, held again.
// - **Comparing two replicas, synchronizing anything, or merging an
//   imported document into the live leaderboard.** An imported document
//   remains its own, separate, read-only object; `sourceArchive`/
//   `targetArchive` (and anything computed from them) are untouched by
//   anything in this file.
// - **Inferring correctness, ranking candidates, or a `score`, `winner`,
//   `correct`/`incorrect`, `valid`, `stale`, `preferred`, `status`, or
//   `confidence` field or vocabulary of any kind.** Inherited unchanged
//   from every layer beneath this one.
// - **Deep semantic validation of a candidate's or a record's own internal
//   fields.** See "A STRUCTURAL check, not a semantic one," above — that
//   trust was already established once, by whichever replica originally
//   produced the export.
// - **Any markup, DOM nodes, or control-rendering technology choice.**
//   This file returns plain, frozen, JSON-safe data; a textarea and an
//   "Import Evidence" button (if ever built) are separate, later,
//   UI-layer work.
export const ReconciliationCandidateLeaderboardEvidenceImportOutcome = Object.freeze({
    IMPORTED: 'imported',
    INVALID_DOCUMENT: 'invalid-document'
});

const DOCUMENT_FIELDS = ['protocolVersion', 'comparisonState', 'filter', 'candidateCount', 'candidates'];
const FILTER_FIELDS = ['evidenceKind', 'replicaRelation'];
const CANDIDATE_ENTRY_FIELDS = ['candidate', 'decisionDetail', 'observationDetail'];
const DETAIL_FIELDS = ['sharedCount', 'sourceOnlyCount', 'targetOnlyCount', 'shared', 'sourceOnly', 'targetOnly'];

const VALID_COMPARISON_STATES = [
    ReconciliationCandidateLeaderboardComparisonState.NO_PEER,
    ReconciliationCandidateLeaderboardComparisonState.PEER_EMPTY,
    ReconciliationCandidateLeaderboardComparisonState.PEER_PRESENT
];

const VALID_EVIDENCE_KINDS = [
    ReconciliationCandidateLeaderboardEvidenceKind.ALL,
    ReconciliationCandidateLeaderboardEvidenceKind.DECISIONS,
    ReconciliationCandidateLeaderboardEvidenceKind.OBSERVATIONS
];

const VALID_REPLICA_RELATIONS = [
    ReconciliationCandidateLeaderboardReplicaRelation.ALL,
    ReconciliationCandidateLeaderboardReplicaRelation.SHARED,
    ReconciliationCandidateLeaderboardReplicaRelation.SOURCE_ONLY,
    ReconciliationCandidateLeaderboardReplicaRelation.TARGET_ONLY
];

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
    const actual = Object.keys(value);
    return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

function parseJSONOrNull(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function validateFilter(filter) {
    if (!isPlainObject(filter) || !hasExactKeys(filter, FILTER_FIELDS)) return null;
    if (!VALID_EVIDENCE_KINDS.includes(filter.evidenceKind)) return null;
    if (!VALID_REPLICA_RELATIONS.includes(filter.replicaRelation)) return null;
    return Object.freeze({ evidenceKind: filter.evidenceKind, replicaRelation: filter.replicaRelation });
}

// A record-list detail object (`decisionDetail`/`observationDetail`) is
// structurally valid only when its own counts agree with its own list
// lengths — the identical count-agrees-with-its-list's-own-length
// invariant every layer beneath this one already holds. Records inside
// `shared`/`sourceOnly`/`targetOnly` are copied, in order, into fresh
// frozen arrays; their OWN internal fields (including `observedAt`) are
// never inspected or reshaped.
function validateDetailObject(detail) {
    if (!isPlainObject(detail) || !hasExactKeys(detail, DETAIL_FIELDS)) return null;
    if (!Array.isArray(detail.shared) || !Array.isArray(detail.sourceOnly) || !Array.isArray(detail.targetOnly)) return null;
    if (!Number.isInteger(detail.sharedCount) || detail.sharedCount !== detail.shared.length) return null;
    if (!Number.isInteger(detail.sourceOnlyCount) || detail.sourceOnlyCount !== detail.sourceOnly.length) return null;
    if (!Number.isInteger(detail.targetOnlyCount) || detail.targetOnlyCount !== detail.targetOnly.length) return null;

    return Object.freeze({
        sharedCount: detail.sharedCount,
        sourceOnlyCount: detail.sourceOnlyCount,
        targetOnlyCount: detail.targetOnlyCount,
        shared: Object.freeze(detail.shared.slice()),
        sourceOnly: Object.freeze(detail.sourceOnly.slice()),
        targetOnly: Object.freeze(detail.targetOnly.slice())
    });
}

// `entry.candidate` is trusted structurally (a genuine plain object) and
// never deeply re-validated against 0.8.144's own three-value vocabulary —
// see this file's own header, "A STRUCTURAL check, not a semantic one."
function validateCandidateEntry(entry) {
    if (!isPlainObject(entry) || !hasExactKeys(entry, CANDIDATE_ENTRY_FIELDS)) return null;
    if (!isPlainObject(entry.candidate)) return null;

    const decisionDetail = validateDetailObject(entry.decisionDetail);
    if (!decisionDetail) return null;
    const observationDetail = validateDetailObject(entry.observationDetail);
    if (!observationDetail) return null;

    return Object.freeze({ candidate: Object.freeze({ ...entry.candidate }), decisionDetail, observationDetail });
}

function validateDocument(json) {
    if (!isPlainObject(json) || !hasExactKeys(json, DOCUMENT_FIELDS)) return null;
    if (json.protocolVersion !== RECONCILIATION_CANDIDATE_LEADERBOARD_EVIDENCE_EXPORT_PROTOCOL_VERSION) return null;
    if (!VALID_COMPARISON_STATES.includes(json.comparisonState)) return null;

    const filter = validateFilter(json.filter);
    if (!filter) return null;

    if (!Array.isArray(json.candidates) || !Number.isInteger(json.candidateCount) || json.candidateCount !== json.candidates.length) return null;

    const candidates = [];
    for (const rawEntry of json.candidates) {
        const entry = validateCandidateEntry(rawEntry);
        if (!entry) return null;
        candidates.push(entry);
    }

    return Object.freeze({
        protocolVersion: json.protocolVersion,
        comparisonState: json.comparisonState,
        filter,
        candidateCount: json.candidateCount,
        candidates: Object.freeze(candidates)
    });
}

// importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport()
// — see this file's own header for the full contract. `payload` may be a
// raw string (parsed here, exactly like 0.8.83's own
// `importPublicationObservationArchive()`) or an already-parsed value.
// Never throws.
export function importPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(payload) {
    const json = typeof payload === 'string' ? parseJSONOrNull(payload) : payload;
    const document = validateDocument(json);
    if (!document) {
        return Object.freeze({ outcome: ReconciliationCandidateLeaderboardEvidenceImportOutcome.INVALID_DOCUMENT, document: null });
    }
    return Object.freeze({ outcome: ReconciliationCandidateLeaderboardEvidenceImportOutcome.IMPORTED, document });
}

const EMPTY_IMPORT_SUMMARY = Object.freeze({
    comparisonState: ReconciliationCandidateLeaderboardComparisonState.NO_PEER,
    filter: Object.freeze({ evidenceKind: ReconciliationCandidateLeaderboardEvidenceKind.ALL, replicaRelation: ReconciliationCandidateLeaderboardReplicaRelation.ALL }),
    candidateCount: 0,
    decisionRecordCount: 0,
    observationRecordCount: 0
});

function isGenuineImportedDocument(document) {
    return Boolean(document) && typeof document === 'object' && Array.isArray(document.candidates);
}

// describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport()
// — see this file's own header, "`describeXxx()` never re-validates."
// `document` must already be `importXxx()`'s own validated result (or
// anything shaped like it); this function performs no JSON parsing and no
// structural validation of its own. Malformed/absent input degrades to an
// empty, `NO_PEER`, `ALL`/`ALL` summary rather than throwing.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceImport(document) {
    if (!isGenuineImportedDocument(document)) return EMPTY_IMPORT_SUMMARY;

    let decisionRecordCount = 0;
    let observationRecordCount = 0;
    for (const entry of document.candidates) {
        decisionRecordCount += entry.decisionDetail.sharedCount + entry.decisionDetail.sourceOnlyCount + entry.decisionDetail.targetOnlyCount;
        observationRecordCount += entry.observationDetail.sharedCount + entry.observationDetail.sourceOnlyCount + entry.observationDetail.targetOnlyCount;
    }

    return Object.freeze({
        comparisonState: document.comparisonState,
        filter: document.filter,
        candidateCount: document.candidateCount,
        decisionRecordCount,
        observationRecordCount
    });
}
