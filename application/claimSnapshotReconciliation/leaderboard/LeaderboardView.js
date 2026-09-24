// 0.8.178 — Reconciliation Candidate Leaderboard Page View.
//
// 0.8.177 handed the domain boundary a stable read model — one row per
// candidate, `decisionEvidence`/`observationEvidence` counts, nothing else.
// Nothing yet shapes that into what an actual page renders. This file is
// that hand-off, and nothing more:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(readModel)
//     -> { isEmpty, rowCount, rows: [{ candidate,
//                                       decisionEvidence: { sharedCount, sourceOnlyCount, targetOnlyCount },
//                                       observationEvidence: { sharedCount, sourceOnlyCount, targetOnlyCount } }] }
//
//   0.8.176 Evidence Agreement
//             │
//             ▼
//   0.8.177 Leaderboard Read Model
//             │
//             ▼
//   0.8.178 Leaderboard Page View   (THIS MILESTONE)
//             │
//             ▼
//          Browser
//
// THIS FILE IS DELIBERATELY DUMB — A VISUALIZATION OF EVIDENCE, NEVER AN
// AUTHORITY THAT INTERPRETS IT. Every fact a row here carries is 0.8.177's
// own fact, read verbatim off its own already-computed `candidates` array.
// No count is added, dropped, combined, recomputed, or turned into a score.
// No row is reordered by candidate type, evidence count, or any notion of
// "how well the two replicas agree" — `rows` below is 0.8.177's own
// `candidates` array, filtered for shape only (see "Malformed rows," below)
// and mapped one entry to one row, IN 0.8.177'S OWN ORDER, UNCHANGED. There
// is no `sort()` anywhere in this file. No row carries a `score`, `rank`,
// `winner`, a `correct`/`valid`/`preferred` flag, a `status`, or a
// `confidence` — deciding which candidate is "better" is explicitly not
// this milestone's job, its own name notwithstanding.
//
// ZERO IMPORTS — THE ARCHITECTURAL POINT OF THIS FILE. Every other
// projection in this family imports at least the one prior module it
// composes. This one does not, ON PURPOSE: `describeXxx()` below performs a
// pure, structural, duck-typed transform of whatever shape it is handed,
// exactly the way 0.8.177's own `describeXxx()` duck-typed
// `evidenceAgreement.candidates` without importing 0.8.176's module to do
// it. There is therefore nothing here for a caller to accidentally import
// that would open a path back into reconciliation logic: no candidate
// selection, no candidate revalidation, no decision history, no
// observation history, no difference/agreement projection, no archive
// module, no synchronization, no plan reconstruction. A caller that wants
// this view built from real archives calls 0.8.177's own
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel()`
// first and hands ITS result to `describeXxx()` below — this file has no
// `reconstructXxx()` of its own, and deliberately never will; wiring a real
// archive-backed page together is explicitly 0.8.179's job, not this one's.
//
// `rows`, NOT `candidates` — PAGE VOCABULARY, DELIBERATELY DISTINCT FROM
// DOMAIN VOCABULARY. 0.8.177's own top level answers "how many candidates,
// and what are they" via `candidateCount`/`candidates`. This file's own top
// level answers a narrower, page-shaped question — "how many rows does the
// table have, and what do they look like" — via `rowCount`/`rows`, so a
// reader of this file's own result is never left wondering whether a
// `candidates` field belongs to 0.8.177's own domain read model or to a
// page's own presentation shape. Every row's own three fields —
// `candidate`, `decisionEvidence`, `observationEvidence` — keep their exact
// 0.8.177 names and shapes unchanged; only the top level is renamed.
//
// `isEmpty` IS A STRUCTURAL FLAG, NEVER A MESSAGE. `isEmpty` is exactly
// `rowCount === 0`, nothing more — a plain, derived convenience so a
// template can decide whether to render an empty-state block without
// re-deriving it from `rows.length` itself. This file does not invent
// empty-state copy, an icon, or any other presentational content; what a
// reader actually SEES when `isEmpty` is true is real, separately sized,
// later work — see "Deliberately excluded," below.
//
// MALFORMED ROWS ARE SILENTLY EXCLUDED — NEVER THROWN ON, NEVER REPAIRED,
// NEVER RENUMBERED. A `readModel` that is `null`, `undefined`, or missing a
// genuine `candidates` array degrades to `{ isEmpty: true, rowCount: 0,
// rows: [] }`. Within an otherwise-genuine `candidates` array, an entry
// that is not an object, or is missing a `candidate`, `decisionEvidence`,
// or `observationEvidence` field, is dropped rather than surfaced as a
// half-populated row — this file performs its own defensive check here
// because, exactly like 0.8.177's own tolerance of a malformed
// `evidenceAgreement`, its one argument may not have come from a seam that
// already guarantees a well-formed shape (a caller may hand `describeXxx()`
// anything, including something that never passed through 0.8.177 at all).
// The surviving rows keep 0.8.177's own relative order among themselves —
// filtering never reorders. Within a genuine row, an individual count that
// is missing or not a finite number degrades to `0` rather than `NaN` or
// `undefined`, mirroring `PublisherLeaderboardView.js`'s own `safeCount()`
// (0.8.113, UNCHANGED) — this is defensive coercion of a field 0.8.177
// already names, never a new count of this file's own invention.
//
// CANDIDATE IDENTITY IS REFERENCED, NEVER COPIED OR INTERPRETED. `candidate`
// on every row is the ORIGINAL object 0.8.177's own row already carried,
// referenced unchanged — this file does not decode 0.8.144's three-value
// candidate type into a human-readable label, a display string, or any
// other derived form. Turning `DIVERGENT_CORRESPONDENCE` /
// `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT` /
// `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM` into words a reader sees on a page
// is presentation work with its own design questions (which words? which
// language?) that this milestone deliberately declines to answer.
//
// `decisionEvidence` AND `observationEvidence` STAY SEPARATE ON EVERY ROW,
// NEVER MERGED — 0.8.176's own flagship principle, held here again two
// layers up. Neither this file nor any row it produces sums, averages, or
// otherwise combines a candidate's decision-evidence counts with its
// observation-evidence counts into one figure.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO DOM. Reads no
// clock, touches no archive, renders no markup. Returns frozen objects and
// frozen arrays throughout; the supplied `readModel` (and every value it
// holds) is never mutated. Calling `describeXxx()` twice with a
// byte-identical argument returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **A score, rank, ordering by evidence weight, or any comparison between
//   two candidates' own evidence.** See "This file is deliberately dumb,"
//   above.
// - **A `winner`, `correct`/`incorrect`, `valid`, `stale`, `conflict`,
//   `preferred`, `status`, or `confidence` field, or vocabulary, of any
//   kind.** See the same, above.
// - **Any interpretation of agreement or difference as a conflict,
//   inconsistency, correction, or need for resolution.** Inherited
//   unchanged from 0.8.176's/0.8.177's own boundary.
// - **A fourth candidate category, or any decoding of the existing three
//   into a human-readable label.** See "Candidate identity is referenced,"
//   above.
// - **Actual markup, DOM nodes, styling, or any rendering technology
//   choice.** This file returns plain, frozen, page-SHAPED data; turning
//   that data into pixels a reader actually sees — and wiring it to a real,
//   archive-backed page — is explicitly 0.8.179's job.
// - **A `reconstructXxx()` entry point, or any archive access.** See "Zero
//   imports," above — this file has exactly one input, an already-computed
//   0.8.177 read model, and no seam of its own for reaching an archive.
// - **Persistence or synchronization of any kind.**
// - **Automatic, periodic, or background computation of any kind.** This
//   function runs only when a caller explicitly calls it.

function isGenuineEvidence(value) {
    return Boolean(value) && typeof value === 'object';
}

function safeCount(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function hasGenuineRow(entry) {
    return Boolean(entry)
        && typeof entry === 'object'
        && Boolean(entry.candidate)
        && typeof entry.candidate === 'object'
        && isGenuineEvidence(entry.decisionEvidence)
        && isGenuineEvidence(entry.observationEvidence);
}

function evidenceColumns(evidence) {
    return Object.freeze({
        sharedCount: safeCount(evidence.sharedCount),
        sourceOnlyCount: safeCount(evidence.sourceOnlyCount),
        targetOnlyCount: safeCount(evidence.targetOnlyCount)
    });
}

// The pure computation — see this file's own header for the full
// contract. Receives 0.8.177's own already-computed read model (or
// anything shaped like it) and returns `{ isEmpty, rowCount, rows }`.
// Never sorts, never scores, never throws.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(readModel) {
    const sourceRows = readModel && Array.isArray(readModel.candidates)
        ? readModel.candidates
        : [];

    const rows = sourceRows
        .filter(hasGenuineRow)
        .map((entry) => Object.freeze({
            candidate: entry.candidate,
            decisionEvidence: evidenceColumns(entry.decisionEvidence),
            observationEvidence: evidenceColumns(entry.observationEvidence)
        }));

    return Object.freeze({
        isEmpty: rows.length === 0,
        rowCount: rows.length,
        rows: Object.freeze(rows)
    });
}
