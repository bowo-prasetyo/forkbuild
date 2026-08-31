// 0.8.184 — Reconciliation Candidate Evidence Filter Projection.
//
// 0.8.178/0.8.179 built the Leaderboard's own rows — one per candidate,
// `decisionEvidence`/`observationEvidence` each carrying `sharedCount`/
// `sourceOnlyCount`/`targetOnlyCount` — and 0.8.180/0.8.183 put every row,
// and a comparison-state banner, on screen. Nothing yet answers a reader's
// next, entirely natural question: "show me only the candidates with a
// PARTICULAR KIND of evidence" — the source-only decisions, the
// target-only observations, the ones with anything shared at all. This
// file is that answer, and nothing more:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, filter)
//     -> { isEmpty, rowCount, rows }
//
//   page   — 0.8.178's/0.8.179's own already-produced `{ isEmpty, rowCount,
//            rows }` (or anything shaped like it — see "Zero imports,"
//            below).
//   filter — either a plain replica-relation string
//            (`'ALL'`/`'SHARED'`/`'SOURCE_ONLY'`/`'TARGET_ONLY'`), or an
//            object `{ evidenceKind, replicaRelation }` narrowing which
//            evidence DIMENSION that relation is read from
//            (`evidenceKind`: `'ALL'`/`'DECISIONS'`/`'OBSERVATIONS'`).
//
//   0.8.179 Page
//         │
//         ▼
//   0.8.183 Comparison State        (a parallel, independent fact — 0.8.184
//         │                          never reads it, never touches it)
//         ▼
//   0.8.184 Evidence Filter   ★
//         │
//         ▼
//   Leaderboard UI
//
// A READ-ONLY PRESENTATION PROJECTION, NEVER A NEW DOMAIN ALGORITHM. Every
// row this file returns is one of 0.8.178's/0.8.179's own row objects,
// REFERENCED, never copied, recomputed, or reshaped — `describeXxx()`
// below decides only which of `page.rows`' own entries survive; it never
// manufactures, modifies, or re-derives a single count. The surviving rows
// are therefore not merely deep-equal to their originals — they are the
// IDENTICAL objects (`===`), which is the strongest form of "filtering
// must never manufacture or modify evidence counts" the milestone's own
// request asked for.
//
// `filter` NARROWS `page.rows` — IT NEVER MUTATES `page` ITSELF. Exactly
// the architectural rule this milestone's own request named explicitly:
// "do not mutate the page model." `page` (and every row, and every
// evidence object it holds) is read only; this file always returns a
// BRAND NEW `{ isEmpty, rowCount, rows }` object, so a caller holding onto
// the original, unfiltered `page` never sees it change underneath them —
// `ALL`, `SHARED`, `SOURCE_ONLY`, and `TARGET_ONLY` are four independent
// projections OFF the same unchanged page, never four states of one
// mutable page.
//
// TWO INDEPENDENT DIMENSIONS, NEVER COLLAPSED INTO ONE. `evidenceKind`
// answers "evidence of which KIND" (decisions, observations, or either);
// `replicaRelation` answers "evidence in what RELATION to the two
// replicas being compared" (shared, source-only, target-only, or any).
// The two compose freely — `{ evidenceKind: 'OBSERVATIONS', replicaRelation:
// 'TARGET_ONLY' }` asks for exactly the rows carrying at least one
// target-only OBSERVATION, ignoring decision evidence entirely for the
// purpose of this one query — but neither dimension is ever collapsed
// into, or inferred from, the other. This is 0.8.176's own flagship
// principle ("decision agreement and observation agreement are not the
// same thing"), held here again, two dimensions removed from where it was
// first drawn.
//
// `evidenceKind: 'ALL'` READS EITHER DIMENSION — "THIS CANDIDATE HAS SOME
// EVIDENCE IN THIS RELATION, SOMEWHERE." A row matches `replicaRelation:
// 'SHARED'` under the default `evidenceKind: 'ALL'` when EITHER its
// `decisionEvidence.sharedCount` OR its `observationEvidence.sharedCount`
// is greater than zero — never their SUM, and never a requirement that
// BOTH be nonzero. This is why the milestone's own flagship example shows
// `SHARED` selecting a candidate whose only shared evidence is an
// observation, and a second candidate whose only shared evidence is a
// decision — `evidenceKind: 'ALL'` is a logical OR across the two
// dimensions, not a merge of their counts into one number (0.8.176's own
// restraint, held again).
//
// `replicaRelation: 'ALL'` MEANS "DO NOT FILTER BY RELATION AT ALL" —
// EVERY GENUINE ROW SURVIVES, REGARDLESS OF `evidenceKind`. `ALL` is not
// a fourth relation to test a count against; it is the absence of a
// relation filter, exactly the way an unset dropdown means "show
// everything." Calling this file with no `filter` argument at all, or
// with a malformed one, degrades to `{ evidenceKind: 'ALL', replicaRelation:
// 'ALL' }` — the complete, unfiltered projection — never an empty result.
//
// ZERO IMPORTS — THE IDENTICAL ARCHITECTURAL DISCIPLINE 0.8.178 ITSELF
// ESTABLISHED. `describeXxx()` below performs a pure, structural,
// duck-typed read of whatever `page`-shaped value it is handed; there is
// nothing here for a caller to accidentally import that would open a path
// back into reconciliation logic. A caller that wants this filter applied
// to a real, archive-backed page calls 0.8.179's own `reconstructXxx()`
// first and hands ITS result to `describeXxx()` below.
//
// MALFORMED ROWS ARE SILENTLY EXCLUDED, EXACTLY AS 0.8.178 ALREADY
// EXCLUDES THEM ONE LAYER DOWN. A `page` that is `null`, `undefined`, or
// missing a genuine `rows` array degrades to `{ isEmpty: true, rowCount: 0,
// rows: [] }`. Within an otherwise-genuine `rows` array, an entry missing
// `candidate`, `decisionEvidence`, or `observationEvidence` is dropped —
// the identical `hasGenuineRow()` shape check 0.8.178 itself already
// performs, duplicated here for the identical reason 0.8.180's own
// `candidateIdentityKey()` duplicates 0.8.147's — this file imports
// nothing. A recognized-but-missing/non-finite individual count (on an
// otherwise genuine row) reads as `0` for the purpose of matching a
// filter, never as a thrown error or a false match.
//
// UNRECOGNIZED `evidenceKind`/`replicaRelation` VALUES DEGRADE TO `'ALL'`
// — NEVER THROW, NEVER SILENTLY MATCH NOTHING. A typo'd or unknown value
// on either dimension is treated as if that dimension were never
// constrained, the same "degrade toward showing more, never toward
// silently showing nothing" discipline a reader would expect from a
// filter control that failed to parse.
//
// NO RANKING, NO SCORE, NO REORDERING. Filtering removes rows; it never
// reorders the rows that survive. `rows` below is always a subsequence of
// `page.rows`, in `page.rows`' OWN relative order — there is no `sort()`
// anywhere in this file. No row is annotated with a "match reason," a
// count of how many filters it satisfied, or any other new field —
// surviving rows keep EXACTLY their original 0.8.178/0.8.179 shape.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO DOM. Reads no
// clock. Returns a frozen result and a frozen `rows` array; `page` (and
// every row/evidence object it holds) is never mutated. Calling this
// function twice with byte-identical arguments returns a byte-identical
// result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Ranking, sorting by evidence, scores, or severity.** See "No
//   ranking, no score, no reordering," above.
// - **A "needs attention"/conflict classification of any kind.** This file
//   states only which relation(s) a row's evidence stands in — it draws no
//   conclusion about whether that is good, bad, or in need of resolution.
// - **Automatic synchronization, or any interpretation of "the application
//   deciding what evidence matters."** Filtering exists precisely so a
//   reader chooses what to inspect; this file never chooses for them.
// - **A fifth relation or a fourth evidence kind.** The vocabulary stays
//   exactly `ALL`/`DECISIONS`/`OBSERVATIONS` and
//   `ALL`/`SHARED`/`SOURCE_ONLY`/`TARGET_ONLY` — the identical four/three
//   values 0.8.176 through 0.8.183 already established, never a new one
//   invented here.
// - **Mutating `page`, or persisting the selected filter anywhere.** See
//   "`filter` narrows `page.rows`," above — this file returns a new
//   projection every call; where a selected filter is remembered (if
//   anywhere) is the UI layer's own, entirely separate, page-local concern.
// - **Combining `decisionEvidence` and `observationEvidence` into one
//   number for matching, or requiring both dimensions to match at once.**
//   See "Two independent dimensions," above.
// - **Actual markup, DOM nodes, or any dropdown/control rendering
//   technology choice.** This file returns plain, frozen, page-SHAPED
//   data; turning a selected filter into an actual control a reader
//   operates is `ui/views/ReconciliationCandidateLeaderboardView.js`'s own
//   job, exactly as `ui/components/ReconciliationCandidateLeaderboardTable.js`
//   already renders 0.8.178's own rows without recomputing them.

export const ReconciliationCandidateLeaderboardEvidenceKind = Object.freeze({
    ALL: 'ALL',
    DECISIONS: 'DECISIONS',
    OBSERVATIONS: 'OBSERVATIONS'
});

export const ReconciliationCandidateLeaderboardReplicaRelation = Object.freeze({
    ALL: 'ALL',
    SHARED: 'SHARED',
    SOURCE_ONLY: 'SOURCE_ONLY',
    TARGET_ONLY: 'TARGET_ONLY'
});

function isGenuineEvidence(value) {
    return Boolean(value) && typeof value === 'object';
}

function hasGenuineRow(entry) {
    return Boolean(entry)
        && typeof entry === 'object'
        && Boolean(entry.candidate)
        && typeof entry.candidate === 'object'
        && isGenuineEvidence(entry.decisionEvidence)
        && isGenuineEvidence(entry.observationEvidence);
}

function safeCount(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

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

// A bare string is shorthand for `{ replicaRelation: filter }` — the
// simple, single-dimension vocabulary this milestone's own flagship
// scenario exercises. An object is read for its own `evidenceKind`/
// `replicaRelation` fields. Anything else — `null`, `undefined`, or a
// malformed value on either field — degrades to `{ evidenceKind: 'ALL',
// replicaRelation: 'ALL' }`, never a throw.
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

// Reads the one count `replicaRelation` names off one evidence object
// (`decisionEvidence` or `observationEvidence`). `replicaRelation` is
// always already-normalized by the time this is called, so `'ALL'` never
// reaches here — see `rowMatchesFilter()` below, which short-circuits
// `'ALL'` before any count is ever read.
function relationCountFor(evidence, replicaRelation) {
    if (!isGenuineEvidence(evidence)) return 0;
    if (replicaRelation === ReconciliationCandidateLeaderboardReplicaRelation.SHARED) return safeCount(evidence.sharedCount);
    if (replicaRelation === ReconciliationCandidateLeaderboardReplicaRelation.SOURCE_ONLY) return safeCount(evidence.sourceOnlyCount);
    return safeCount(evidence.targetOnlyCount);
}

// The one predicate this file exists to compute — see this file's own
// header, "Two independent dimensions" and "`evidenceKind: 'ALL'` reads
// either dimension," above.
function rowMatchesFilter(row, evidenceKind, replicaRelation) {
    if (replicaRelation === ReconciliationCandidateLeaderboardReplicaRelation.ALL) {
        return true;
    }
    if (evidenceKind === ReconciliationCandidateLeaderboardEvidenceKind.DECISIONS) {
        return relationCountFor(row.decisionEvidence, replicaRelation) > 0;
    }
    if (evidenceKind === ReconciliationCandidateLeaderboardEvidenceKind.OBSERVATIONS) {
        return relationCountFor(row.observationEvidence, replicaRelation) > 0;
    }
    return relationCountFor(row.decisionEvidence, replicaRelation) > 0
        || relationCountFor(row.observationEvidence, replicaRelation) > 0;
}

// describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter()
// — see this file's own header for the full contract. Receives an
// already-computed 0.8.178/0.8.179 page (or anything shaped like it) and a
// `filter`, and returns a NEW `{ isEmpty, rowCount, rows }` holding exactly
// the ORIGINAL row objects that match — never a copy, never a mutation of
// `page` itself.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardEvidenceFilter(page, filter) {
    const sourceRows = page && Array.isArray(page.rows) ? page.rows : [];
    const { evidenceKind, replicaRelation } = normalizeFilter(filter);

    const rows = sourceRows
        .filter(hasGenuineRow)
        .filter((row) => rowMatchesFilter(row, evidenceKind, replicaRelation));

    return Object.freeze({
        isEmpty: rows.length === 0,
        rowCount: rows.length,
        rows: Object.freeze(rows)
    });
}
