import {
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetailView.js';
import {
    ReconciliationCandidateLeaderboardEvidenceKind,
    ReconciliationCandidateLeaderboardReplicaRelation
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js';
import {
    ReconciliationCandidateLeaderboardComparisonState,
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState.js';

// 0.8.186 — Reconciliation Candidate Leaderboard Evidence Export Projection.
//
// 0.8.184 decided which ROWS the leaderboard shows; 0.8.185 decided which
// RECORDS a surviving row's own Inspect Evidence panel shows. Both answer
// "what am I looking at" — neither one answers a reader's next, entirely
// natural question once they've found something worth keeping: "can I take
// exactly this out of the UI?" This file is that answer, and nothing more:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(filteredEvidenceDetail, filter, comparisonState)
//     -> { protocolVersion, comparisonState, filter: { evidenceKind, replicaRelation },
//          candidateCount, candidates }
//
//   filteredEvidenceDetail — 0.8.185's own already-produced `{ candidateCount,
//                             candidates }` result (or anything shaped like
//                             it) — the EXACT records currently on screen,
//                             already narrowed by whatever filter is active.
//   filter                 — the IDENTICAL vocabulary 0.8.184's/0.8.185's own
//                             `describeXxx()` accept, recorded here as the
//                             export's own metadata — never re-applied to
//                             narrow `filteredEvidenceDetail` a second time.
//   comparisonState         — 0.8.183's own already-computed `NO_PEER`/
//                             `PEER_EMPTY`/`PEER_PRESENT` fact.
//
//   0.8.176 Evidence Agreement
//         │
//         ▼
//   0.8.182 Evidence Detail ──► 0.8.185 Filtered Evidence Detail ──┐
//                                                                   │
//   0.8.181 Peer Archive ──► 0.8.183 Comparison State ─────────────┼──► 0.8.186 Evidence Export   ★ (THIS FILE)
//                                                                   │
//   0.8.184's own filter selection ───────────────────────────────┘
//                                                                   │
//                                                                   ▼
//                                                       a portable JSON document
//
// THIS FILE COMPUTES NOTHING — IT LABELS AND WRAPS THREE ALREADY-COMPUTED
// FACTS. It never re-reads an archive (there is no `PublicationObservationArchive`
// import anywhere in this file), never recomputes evidence agreement, never
// revalidates a decision, never reconstructs a plan, and never re-applies a
// filter to `filteredEvidenceDetail`'s own candidates — 0.8.184/0.8.185
// already decided which rows and which records survive; this file's own
// `describeXxx()` takes their combined answer as given and states only:
// "here is what was on screen, plus the two facts (which filter, which
// comparison state) a reader would need to make sense of it later, once
// it's no longer on screen." `candidates` below is `filteredEvidenceDetail`'s
// own `candidates` array, REFERENCED (`===`), never copied, reshaped,
// deduplicated, sorted, or ranked.
//
// EXPORT EXACTLY THE EVIDENCE CURRENTLY REPRESENTED BY THE FILTERED VIEW —
// NOTHING NEWLY COMPUTED. This is the one principle every other rule below
// exists to protect. A candidate entry that survived 0.8.185's own filter
// with an empty `decisionDetail` and a `targetOnly`-only `observationDetail`
// exports with EXACTLY that shape — no record any filter already excluded
// reappears here, and no record the filter kept is dropped, reordered, or
// rewritten.
//
// `protocolVersion` IS A FIXED CONSTANT, NEVER DERIVED FROM ANYTHING THIS
// FILE READS. It exists so a future reader of an exported document (a
// person, or a future version of this codebase) can tell which export
// shape they are holding; it says nothing about the evidence itself and
// never changes based on `filter`, `comparisonState`, or how many
// candidates survived.
//
// `comparisonState` IS FORWARDED VERBATIM, NEVER RE-DERIVED FROM THE
// EXPORTED EVIDENCE. This file receives 0.8.183's own already-computed
// fact directly and writes it into the document unchanged — it never looks
// at whether `candidates` is empty to guess whether a peer was supplied.
// This is precisely why 0.8.183 exists: an export produced under `NO_PEER`
// and an export produced under `PEER_EMPTY` can hold byte-identical
// `candidates` (both empty, or both all-Source-only) while still
// disagreeing, honestly, about how the comparison came to be — the export
// preserves that disagreement rather than collapsing it. An unrecognized or
// malformed `comparisonState` degrades to `NO_PEER` — the same "assume the
// less specific, less claimed state" discipline this file holds throughout
// — never a fabricated `PEER_PRESENT` a caller never actually established.
//
// `filter` IS RECORDED AS METADATA, NEVER RE-APPLIED. The `filter` argument
// names the filter a caller asserts was ALREADY used to produce
// `filteredEvidenceDetail` — this file trusts that assertion completely,
// exactly the way 0.8.183 trusts a caller's own `hasPeerArchive` signal. It
// normalizes `filter` into the same `{ evidenceKind, replicaRelation }`
// shape 0.8.184/0.8.185 already use (reusing their own frozen enums, never
// inventing a fifth relation or a fourth kind), purely so the exported
// document is self-describing — a reader opening the file later can see
// which filter produced it without also holding onto the UI state that
// produced it. It is never used to filter, narrow, or validate `candidates`
// a second time.
//
// A PURE, SELF-DESCRIBING, PORTABLE DOCUMENT — NO ENVELOPE BEYOND WHAT A
// READER NEEDS TO INTERPRET IT LATER. Deliberately excluded from that
// envelope: a timestamp for the act of exporting itself (see
// `application/PublicationObservationArchiveExport.js`'s own identical
// restraint, "no `exportedAt`" — exporting a copy of a fact is not a new
// observation of it), a signature or hash of any kind, and any field this
// file would have to invent rather than forward from an already-computed
// source.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO CLOCK.
// `describeXxx()` never transmits, uploads, downloads, or saves anything —
// it returns a plain, frozen, JSON-safe object; what a caller does with it
// (write it to a file, hand it to `JSON.stringify()`, discard it) is
// entirely outside this file's own reach. Calling `describeXxx()` twice
// with byte-identical arguments returns a byte-identical result — in
// particular, changing nothing but one observation's own `observedAt`
// changes the export, because `observedAt` is part of that observation's
// own already-established structural identity (0.8.162's own fact,
// forwarded unchanged through 0.8.182/0.8.185 into this file's own
// `candidates`), never a field this file strips or normalizes away.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY, VALID DOCUMENT — NEVER THROWS. A
// `filteredEvidenceDetail` that is `null`, `undefined`, or missing a
// genuine `candidates` array degrades to `candidateCount: 0` and an empty,
// frozen `candidates` array, mirroring 0.8.185's own tolerance one layer
// down. An absent or malformed `filter` degrades to `{ evidenceKind: 'ALL',
// replicaRelation: 'ALL' }`, the identical default 0.8.184/0.8.185 already
// use. An absent or unrecognized `comparisonState` degrades to `NO_PEER`.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS EXACTLY THREE MODULES: 0.8.185
// (whose `reconstructXxx()` alone `reconstructXxx()` below calls, to obtain
// the identical already-filtered detail the UI itself renders), 0.8.184
// (its frozen `evidenceKind`/`replicaRelation` enums, reused rather than
// redeclared), and 0.8.183 (its frozen `comparisonState` enum, plus its own
// `describeXxx()`, called exactly once by `reconstructXxx()` below). It
// never imports `PublicationObservationArchive` or any archive-reading
// module directly, never imports 0.8.182 or 0.8.176, never imports 0.8.185's
// own `describeXxx()` (only its `reconstructXxx()`, to compose — this
// file's OWN `describeXxx()` is never called by anything but this file's
// own `reconstructXxx()` and, ultimately, a caller who already has a
// `filteredEvidenceDetail` in hand), and never imports anything from `ui/`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Reading the archive.** This file never reads `sourceArchive`/
//   `targetArchive` itself — `reconstructXxx()` below hands both straight
//   through to 0.8.185's own `reconstructXxx()` and 0.8.183's own
//   `describeXxx()`, untouched.
// - **Recomputing evidence agreement, revalidating a decision, or
//   reconstructing a plan.** See "This file computes nothing," above.
// - **Deduplicating, sorting, or ranking any record or candidate.** Every
//   list here is `filteredEvidenceDetail`'s own list, in its own order,
//   referenced unchanged.
// - **Adding a timestamp, a signature, or any provenance of the export act
//   itself.** See "A pure, self-describing, portable document," above.
// - **Automatically transmitting, uploading, downloading, or saving
//   anything.** `describeXxx()` returns a plain object and nothing more; a
//   download mechanism (if ever built) is separate, later, UI-layer work.
// - **A score, rank, winner, `correct`/`incorrect`, `valid`, `stale`,
//   `preferred`, `status`, or `confidence` field or vocabulary of any
//   kind.** Inherited unchanged from every layer beneath this one.
// - **Any markup, DOM nodes, or control-rendering technology choice.** This
//   file returns plain, frozen, JSON-safe data — nothing in `ui/` is
//   touched or required to exist for this file to work.
export const RECONCILIATION_CANDIDATE_LEADERBOARD_EVIDENCE_EXPORT_PROTOCOL_VERSION = 1;

function isGenuineDetail(value) {
    return Boolean(value) && typeof value === 'object' && Array.isArray(value.candidates);
}

const EMPTY_CANDIDATES = Object.freeze([]);

// normalizeEvidenceKind()/normalizeReplicaRelation()/normalizeFilter() —
// duplicated from 0.8.184's own (non-exported) normalization, for the
// identical reason 0.8.185 itself already duplicates them: 0.8.184 exports
// its enums, never its internal normalization helpers. Degrade-to-`'ALL'`
// behavior is byte-identical to 0.8.184's/0.8.185's own.
function normalizeEvidenceKind(value) {
    return value === ReconciliationCandidateLeaderboardEvidenceKind.DECISIONS
        || value === ReconciliationCandidateLeaderboardEvidenceKind.OBSERVATIONS
        ? value
        : ReconciliationCandidateLeaderboardEvidenceKind.ALL;
}

function normalizeReplicaRelation(value) {
    return value === ReconciliationCandidateLeaderboardReplicaRelation.SHARED
        || value === ReconciliationCandidateLeaderboardReplicaRelation.SOURCE_ONLY
        || value === ReconciliationCandidateLeaderboardReplicaRelation.TARGET_ONLY
        ? value
        : ReconciliationCandidateLeaderboardReplicaRelation.ALL;
}

function normalizeFilter(filter) {
    if (typeof filter === 'string') {
        return Object.freeze({
            evidenceKind: ReconciliationCandidateLeaderboardEvidenceKind.ALL,
            replicaRelation: normalizeReplicaRelation(filter)
        });
    }
    if (filter && typeof filter === 'object') {
        return Object.freeze({
            evidenceKind: normalizeEvidenceKind(filter.evidenceKind),
            replicaRelation: normalizeReplicaRelation(filter.replicaRelation)
        });
    }
    return Object.freeze({
        evidenceKind: ReconciliationCandidateLeaderboardEvidenceKind.ALL,
        replicaRelation: ReconciliationCandidateLeaderboardReplicaRelation.ALL
    });
}

// An unrecognized/malformed comparisonState degrades to `NO_PEER` — the
// least-claimed of the three states, never a fabricated `PEER_PRESENT` or
// `PEER_EMPTY` this file never actually established. See this file's own
// header, "`comparisonState` is forwarded verbatim."
function normalizeComparisonState(comparisonState) {
    return comparisonState === ReconciliationCandidateLeaderboardComparisonState.PEER_EMPTY
        || comparisonState === ReconciliationCandidateLeaderboardComparisonState.PEER_PRESENT
        ? comparisonState
        : ReconciliationCandidateLeaderboardComparisonState.NO_PEER;
}

// describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport()
// — see this file's own header for the full contract. Wraps
// `filteredEvidenceDetail`'s own already-filtered `candidates` (referenced,
// unchanged) together with `filter` and `comparisonState`, both normalized
// and recorded as metadata, into one portable, frozen, JSON-safe document.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(filteredEvidenceDetail, filter, comparisonState) {
    const candidates = isGenuineDetail(filteredEvidenceDetail) ? filteredEvidenceDetail.candidates : EMPTY_CANDIDATES;

    return Object.freeze({
        protocolVersion: RECONCILIATION_CANDIDATE_LEADERBOARD_EVIDENCE_EXPORT_PROTOCOL_VERSION,
        comparisonState: normalizeComparisonState(comparisonState),
        filter: normalizeFilter(filter),
        candidateCount: candidates.length,
        candidates
    });
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport()
// — see this file's own header, "The identical split" every projection in
// this family already holds. Calls 0.8.185's own `reconstructXxx()` exactly
// once (obtaining the identical already-filtered detail the UI itself
// renders, without this file touching either archive itself) and 0.8.183's
// own `describeXxx()` exactly once (obtaining the identical comparison-state
// fact the UI itself already computes from `hasPeerArchive`/`targetArchive`),
// then hands both results, alongside `filter`, to `describeXxx()` above.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(sourceArchive, targetArchive, filter, hasPeerArchive) {
    const filteredEvidenceDetail = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(sourceArchive, targetArchive, filter);
    const comparisonState = describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(hasPeerArchive, targetArchive);
    return describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceExport(filteredEvidenceDetail, filter, comparisonState);
}
