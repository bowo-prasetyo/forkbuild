import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetailView.js';
import {
    ReconciliationCandidateLeaderboardEvidenceKind,
    ReconciliationCandidateLeaderboardReplicaRelation
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter.js';

// 0.8.185 — Reconciliation Candidate Filtered Evidence Detail Projection.
//
// 0.8.182 built the Inspect Evidence detail — the actual decision/
// observation records behind a row's own six counts. 0.8.184 built a
// filter that decides which ROWS are visible on the leaderboard, using
// the vocabulary `evidenceKind` (`ALL`/`DECISIONS`/`OBSERVATIONS`) x
// `replicaRelation` (`ALL`/`SHARED`/`SOURCE_ONLY`/`TARGET_ONLY`). Neither
// one, on its own, answers a reader's next natural question once both
// exist: "I filtered the leaderboard down to Observations + Target-only —
// when I inspect a surviving candidate, can the panel show me exactly the
// observation records that made it survive, instead of everything that
// candidate has ever recorded?" This file is that answer, and nothing
// more:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(evidenceDetail, filter)
//     -> { candidateCount,
//          candidates: [{ candidate,
//                          decisionDetail: { sharedCount, sourceOnlyCount, targetOnlyCount,
//                                             shared, sourceOnly, targetOnly },
//                          observationDetail: { sharedCount, sourceOnlyCount, targetOnlyCount,
//                                                shared, sourceOnly, targetOnly } }] }
//
//   evidenceDetail — 0.8.182's own already-produced `{ candidateCount,
//                     candidates }` result (or anything shaped like it).
//   filter         — the IDENTICAL vocabulary 0.8.184's own
//                     `describeXxx()` accepts: a bare replica-relation
//                     string, or `{ evidenceKind, replicaRelation }`.
//
//   0.8.176 Candidate Evidence Agreement
//             │
//             ├──────────────────────────► 0.8.182 Evidence Detail
//             │                                      │
//             │                                      ▼
//             │                             complete per-candidate detail
//             │
//             └──► 0.8.177 → 0.8.178 → 0.8.179 Page ──► 0.8.184 Row Filter
//
//                        0.8.182 detail  +  0.8.184 filter vocabulary
//                                      │
//                                      ▼
//                     0.8.185 Filtered Evidence Detail   ★ (THIS FILE)
//                                      │
//                                      ▼
//                            UI inspection panel
//
// THIS FILE RECOMPUTES NOTHING — IT IS A PURE PROJECTION OVER 0.8.182'S
// OWN ALREADY-COMPUTED RESULT. `describeXxx()` below never re-reads an
// archive, never re-groups a record by candidate, never re-derives
// shared/exclusive status, and never compares two records against each
// other. It takes 0.8.182's own per-candidate `decisionDetail`/
// `observationDetail` entries and decides, per entry, which of the three
// already-computed lists (`shared`/`sourceOnly`/`targetOnly`) SURVIVE the
// supplied filter — exactly the same "decide which of the already-
// produced entries survive" discipline 0.8.184 itself holds one layer
// over, for rows instead of record lists.
//
// THE RESULT SHAPE IS 0.8.182'S OWN SHAPE, UNCHANGED — NO NEW DEEP
// VOCABULARY. A filtered candidate entry is still `{ candidate,
// decisionDetail, observationDetail }`, and each of those is still
// `{ sharedCount, sourceOnlyCount, targetOnlyCount, shared, sourceOnly,
// targetOnly }` — the identical fields `ui/components/
// ReconciliationCandidateEvidenceDetailPanel.js` already knows how to
// render. A list this file excludes becomes an EMPTY, frozen array (with
// its own count at `0`, keeping every count-agrees-with-its-list's-own-
// length invariant 0.8.182 already holds) — never a differently-shaped
// "matched"/"excluded" wrapper, and never a dropped field. This is why
// the existing detail panel needs no change at all to render a filtered
// result: it is handed a filtered candidate entry exactly the way it is
// already handed an unfiltered one.
//
// THE SAME TWO-DIMENSIONAL SEMANTICS 0.8.184 ALREADY ESTABLISHED FOR ROW
// VISIBILITY, HELD HERE AGAIN FOR RECORD-LIST VISIBILITY:
//
// - `replicaRelation: 'ALL'` MEANS "DO NOT FILTER AT ALL" — the identical
//   candidate entry (`decisionDetail`/`observationDetail`, BOTH complete,
//   as 0.8.182 already produced them) survives untouched, regardless of
//   `evidenceKind`. This mirrors 0.8.184's own `rowMatchesFilter()`
//   short-circuit ("`replicaRelation === ALL` returns true before
//   `evidenceKind` is ever read") exactly: a reader who has only chosen
//   an Evidence type, and left Replica relation on All, sees every record
//   a row already carries — 0.8.184 itself does not filter that row OUT
//   of the leaderboard on `evidenceKind` alone either, so this file does
//   not filter a record list out of the detail panel on `evidenceKind`
//   alone.
// - Otherwise, `evidenceKind` picks WHICH of `decisionDetail`/
//   `observationDetail` may keep any records at all (`DECISIONS` empties
//   `observationDetail` entirely; `OBSERVATIONS` empties `decisionDetail`
//   entirely; `ALL` leaves both eligible), and `replicaRelation` — one of
//   `SHARED`/`SOURCE_ONLY`/`TARGET_ONLY` — picks WHICH SINGLE list survives
//   within each eligible detail object; the other two lists on that object
//   become empty. `evidenceKind: 'ALL'` therefore surfaces BOTH branches —
//   `decisionDetail.targetOnly` AND `observationDetail.targetOnly` — never
//   one chosen arbitrarily over the other, and never summed into one list.
//   This is 0.8.176's own flagship principle ("decision evidence and
//   observation evidence are not the same thing"), held here again, at
//   the record-list layer this time.
//
// `ALL`/`ALL` IS AN IDENTITY PROJECTION, AND PRESERVES REFERENCES. When
// `replicaRelation` is `'ALL'`, this file returns 0.8.182's own candidate
// entry OBJECT, referenced (`===`), never rebuilt — the strongest form of
// "the original 0.8.182 detail remains unchanged" the milestone's own
// request asked for, and the identical "surviving values are the ORIGINAL
// objects, not copies" discipline 0.8.184 itself holds for rows. When a
// relation filter narrows a detail object down to one surviving list, the
// SURVIVING list itself is still 0.8.182's own original array, referenced
// unchanged — only the detail object wrapping it (and the top-level
// candidate entry, since at least one of its two detail objects changed)
// is newly built to attach the narrowed set of lists.
//
// FILTERING NEVER TOUCHES A RECORD, A COUNT, OR RECORD ORDER. No record
// is copied, reshaped, or reordered; the count on a surviving list is
// always 0.8.182's own original count for that exact list; the count on
// an excluded list is `0`, matching its own (empty) list length — never a
// stale, nonzero count paired with an empty array.
//
// A CANDIDATE ROW NEVER DISAPPEARS FROM THIS RESULT, EVEN WHEN BOTH ITS
// DETAIL OBJECTS END UP FULLY EMPTY. Whether a candidate's ROW is visible
// at all is 0.8.184's own, entirely separate, question, answered by
// filtering `page.rows` — a question this file never asks or answers.
// This file only ever narrows WHICH RECORDS an already-decided-visible
// candidate's own detail panel may show; `candidateCount`/`candidates`
// below always mirror `evidenceDetail`'s own candidate set, one entry in,
// one entry out, in the SAME order — there is no `filter()` on the
// candidates array anywhere in this file, only on each entry's own
// record lists.
//
// `describeXxx()`/`reconstructXxx()` — THE IDENTICAL SPLIT EVERY
// PROJECTION IN THIS FAMILY ALREADY HOLDS. `describeXxx()` takes 0.8.182's
// own already-computed `evidenceDetail` directly. `reconstructXxx()`
// below takes `sourceArchive`/`targetArchive`/`filter` and calls 0.8.182's
// own `reconstructXxx()` exactly once — never 0.8.176 directly, and never
// a second, independent read of either archive — obtaining the identical
// already-computed detail both this file and the unfiltered panel are
// built from, then hands it, unchanged, to `describeXxx()` above.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Returns frozen objects and frozen arrays throughout; `evidenceDetail`
// (and everything it holds) is never mutated. Calling either function
// twice with byte-identical arguments returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT OR TO THE IDENTITY FILTER —
// NEVER THROWS. An `evidenceDetail` that is `null`, `undefined`, or
// missing a genuine `candidates` array degrades to `candidateCount: 0`
// and an empty, frozen `candidates` array, mirroring 0.8.182's own
// tolerance for a malformed `evidenceAgreement`. A malformed candidate
// entry (missing `decisionDetail`/`observationDetail`) is treated as
// carrying empty detail on the missing side, never dropped and never
// thrown on — `candidateCount` always matches `evidenceDetail`'s own
// candidate count. An absent, malformed, or unrecognized `filter` (on
// either dimension) degrades to `{ evidenceKind: 'ALL', replicaRelation:
// 'ALL' }` — the complete, unfiltered projection — the identical
// "degrade toward showing more, never toward silently showing nothing"
// discipline 0.8.184 itself holds.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS EXACTLY TWO MODULES: 0.8.182
// (the detail this file projects) and 0.8.184 (the frozen `evidenceKind`/
// `replicaRelation` enums, reused rather than redeclared — this file
// never invents a fifth relation or a fourth evidence kind). It never
// imports 0.8.184's own `describeXxx()` (that function filters `page.rows`
// — a different domain object this file never touches), never imports
// 0.8.176 directly, never imports either archive-reading seam directly,
// and never imports anything from `ui/`. `reconstructXxx()`'s own archive
// tolerance is entirely inherited from 0.8.182's own `reconstructXxx()`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Recomputing agreement, candidate matching, or evidence counts.**
//   See "This file recomputes nothing," above — the whole point of this
//   milestone.
// - **A score, rank, ordering, or any comparison between two candidates'
//   own evidence.** Inherited unchanged from every layer beneath this
//   one.
// - **A `winner`, `correct`/`incorrect`, `valid`, `stale`, `preferred`,
//   `status`, or `confidence` field or vocabulary of any kind.** Inherited
//   unchanged, the same.
// - **Deduplication, merging, or collapsing of any two records that "look
//   similar."** See 0.8.182's own identical restraint, held here again.
// - **Reordering candidates, or filtering a candidate OUT of this
//   result.** See "A candidate row never disappears," above — that
//   remains 0.8.184's own, entirely separate, row-visibility question.
// - **Persisting the selected filter anywhere.** Where a selected filter
//   is remembered (if anywhere) is the UI layer's own, entirely separate,
//   page-local concern — the identical split 0.8.184 itself already
//   holds.
// - **Any markup, DOM nodes, or control-rendering technology choice.**
//   This file returns plain, frozen, data shaped exactly like 0.8.182's
//   own result; the existing `ReconciliationCandidateEvidenceDetailPanel.js`
//   renders it without any change of its own.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(evidenceDetail, filter) {
    const sourceEntries = evidenceDetail && Array.isArray(evidenceDetail.candidates)
        ? evidenceDetail.candidates
        : [];
    const { evidenceKind, replicaRelation } = normalizeFilter(filter);

    const candidates = sourceEntries.map((entry) => filterCandidateEntry(entry, evidenceKind, replicaRelation));

    return Object.freeze({
        candidateCount: candidates.length,
        candidates: Object.freeze(candidates)
    });
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail()
// — see this file's own header, "The identical split," above. Calls
// 0.8.182's own `reconstructXxx()` exactly once — never 0.8.176 directly —
// obtaining its already-computed detail directly from `sourceArchive`/
// `targetArchive` without this file touching either archive itself, then
// hands that result, unchanged, to `describeXxx()` above alongside
// `filter`.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(sourceArchive, targetArchive, filter) {
    const evidenceDetail = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateEvidenceDetail(sourceArchive, targetArchive);
    return describePublisherLeaderboardClaimSnapshotReconciliationCandidateFilteredEvidenceDetail(evidenceDetail, filter);
}

const EMPTY_RECORD_LIST = Object.freeze([]);

function isGenuineDetailObject(value) {
    return Boolean(value) && typeof value === 'object';
}

// A malformed/absent detail object (missing `decisionDetail` or
// `observationDetail` on an otherwise genuine candidate entry) reads as
// entirely empty, never as a thrown error — the identical
// "recognized-but-missing degrades to the empty case" discipline 0.8.184
// itself holds for a missing individual count.
function emptyDetailObject() {
    return Object.freeze({
        sharedCount: 0,
        sourceOnlyCount: 0,
        targetOnlyCount: 0,
        shared: EMPTY_RECORD_LIST,
        sourceOnly: EMPTY_RECORD_LIST,
        targetOnly: EMPTY_RECORD_LIST
    });
}

// Narrows one detail object (`decisionDetail` or `observationDetail`) down
// to the single list `replicaRelation` names, emptying the other two —
// `replicaRelation` is always already-normalized and never `'ALL'` by the
// time this is called (see `filterCandidateEntry()` below, which handles
// `'ALL'` before this function is ever reached).
function narrowDetailObjectToRelation(detailObject, replicaRelation) {
    if (!isGenuineDetailObject(detailObject)) return emptyDetailObject();

    const keepShared = replicaRelation === ReconciliationCandidateLeaderboardReplicaRelation.SHARED;
    const keepSourceOnly = replicaRelation === ReconciliationCandidateLeaderboardReplicaRelation.SOURCE_ONLY;
    const keepTargetOnly = replicaRelation === ReconciliationCandidateLeaderboardReplicaRelation.TARGET_ONLY;

    const shared = keepShared && Array.isArray(detailObject.shared) ? detailObject.shared : EMPTY_RECORD_LIST;
    const sourceOnly = keepSourceOnly && Array.isArray(detailObject.sourceOnly) ? detailObject.sourceOnly : EMPTY_RECORD_LIST;
    const targetOnly = keepTargetOnly && Array.isArray(detailObject.targetOnly) ? detailObject.targetOnly : EMPTY_RECORD_LIST;

    return Object.freeze({
        sharedCount: shared.length,
        sourceOnlyCount: sourceOnly.length,
        targetOnlyCount: targetOnly.length,
        shared, sourceOnly, targetOnly
    });
}

// The one predicate this file exists to compute — see this file's own
// header, "The same two-dimensional semantics," above.
function filterCandidateEntry(entry, evidenceKind, replicaRelation) {
    const candidate = entry && typeof entry === 'object' ? entry.candidate : null;
    const sourceDecisionDetail = entry && typeof entry === 'object' ? entry.decisionDetail : null;
    const sourceObservationDetail = entry && typeof entry === 'object' ? entry.observationDetail : null;

    // `replicaRelation: 'ALL'` means "do not filter at all" — the
    // identical short-circuit 0.8.184's own `rowMatchesFilter()` applies
    // before `evidenceKind` is ever read. The original entry survives
    // completely unchanged, by reference.
    if (replicaRelation === ReconciliationCandidateLeaderboardReplicaRelation.ALL) {
        return entry;
    }

    const decisionEligible = evidenceKind !== ReconciliationCandidateLeaderboardEvidenceKind.OBSERVATIONS;
    const observationEligible = evidenceKind !== ReconciliationCandidateLeaderboardEvidenceKind.DECISIONS;

    const decisionDetail = decisionEligible
        ? narrowDetailObjectToRelation(sourceDecisionDetail, replicaRelation)
        : emptyDetailObject();
    const observationDetail = observationEligible
        ? narrowDetailObjectToRelation(sourceObservationDetail, replicaRelation)
        : emptyDetailObject();

    return Object.freeze({ candidate, decisionDetail, observationDetail });
}

// normalizeFilter()/normalizeEvidenceKind()/normalizeReplicaRelation() —
// duplicated from 0.8.184's own (non-exported) normalization, for the
// identical reason `ui/components/ReconciliationCandidateLeaderboardTable.js`
// already duplicates `candidateIdentityKey()` rather than reaching past
// its own architectural boundary: 0.8.184 exports its enums and its
// `describeXxx()`, never its internal normalization helpers. The
// degrade-to-`'ALL'` behavior is byte-identical to 0.8.184's own.
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
        return {
            evidenceKind: ReconciliationCandidateLeaderboardEvidenceKind.ALL,
            replicaRelation: normalizeReplicaRelation(filter)
        };
    }
    if (filter && typeof filter === 'object') {
        return {
            evidenceKind: normalizeEvidenceKind(filter.evidenceKind),
            replicaRelation: normalizeReplicaRelation(filter.replicaRelation)
        };
    }
    return {
        evidenceKind: ReconciliationCandidateLeaderboardEvidenceKind.ALL,
        replicaRelation: ReconciliationCandidateLeaderboardReplicaRelation.ALL
    };
}
