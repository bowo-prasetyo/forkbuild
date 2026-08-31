import {
    reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel.js';
import {
    describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView
} from './PublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView.js';

// 0.8.179 — Archive-Backed Reconciliation Candidate Leaderboard Page.
//
// 0.8.178 shaped an already-computed 0.8.177 read model into exactly what a
// page renders — `{ isEmpty, rowCount, rows }` — but deliberately kept no
// seam of its own onto an archive: "wiring a real, archive-backed page
// together is explicitly 0.8.179's job," its own header said. This file is
// that wiring, and nothing more:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(readModel)
//     -> { isEmpty, rowCount, rows }   -- 0.8.178's own result, unchanged
//
//   reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, targetArchive)
//     -> { isEmpty, rowCount, rows }   -- the archive boundary
//
//   sourceArchive ──┐
//                   ├─► 0.8.176 (via 0.8.177's own seam) ─► 0.8.177 ─► 0.8.178 ─► page
//   targetArchive ──┘
//
// THIS FILE COMPUTES NOTHING — IT WIRES TWO ALREADY-PROVEN SEAMS TOGETHER,
// EACH CALLED EXACTLY ONCE. `reconstructXxx()` below calls 0.8.177's own
// `reconstructXxx()` exactly once — the one seam that reads both archives'
// own `reconciliationDecisionRecords` and `revalidationObservationRecords`
// collections, by way of 0.8.156's and 0.8.174's own seams, composed by
// 0.8.176, composed by 0.8.177 — obtaining the already-computed read model
// directly, then hands that read model, unchanged, to `describeXxx()`
// below. `describeXxx()` calls 0.8.178's own `describeXxx()` exactly once
// and returns ITS result verbatim. There is no third comparison algorithm,
// no second page-shaping pass, and no field this file adds, renames, or
// removes anywhere in the chain.
//
// NO NEW WRAPPER VOCABULARY. The page object this file returns is exactly
// 0.8.178's own `{ isEmpty, rowCount, rows }` — the identical field names,
// the identical row shape (`candidate`, `decisionEvidence`,
// `observationEvidence`), unchanged. A caller reading this file's own
// result never needs to learn a fourth vocabulary on top of 0.8.176's
// (`candidateAgreements`), 0.8.177's (`candidates`), and 0.8.178's
// (`rows`) own — this milestone introduces no fifth.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY ALREADY HOLDS,
// HELD HERE ONE FINAL TIME AT THE ARCHIVE BOUNDARY. `describeXxx()` takes
// an already-computed 0.8.177 read model directly (or anything shaped like
// one — it never touches an archive) and is a pure, one-call delegation to
// 0.8.178's own `describeXxx()`. `reconstructXxx()` takes `sourceArchive`/
// `targetArchive`, obtains a read model via 0.8.177's own `reconstructXxx()`,
// and hands it to `describeXxx()` above — the ONE new thing this milestone
// adds is composing those two already-existing seams into one call a page
// component can make.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK, NO DOM. Reads no
// clock. Returns frozen objects and frozen arrays throughout — 0.8.178's
// own frozen result, forwarded unchanged. Neither `sourceArchive` nor
// `targetArchive` is ever mutated; `reconstructXxx()` only reads, exactly
// as every `reconstructXxx()` beneath it only reads. Calling either
// function twice with byte-identical arguments returns a byte-identical
// result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY PAGE — NEVER THROWS. `describeXxx()`
// inherits 0.8.178's own tolerance entirely: a `readModel` that is `null`,
// `undefined`, or malformed in any way 0.8.178 already tolerates degrades
// to `{ isEmpty: true, rowCount: 0, rows: [] }`. `reconstructXxx()`
// inherits 0.8.177's own archive tolerance entirely: an invalid/missing
// archive on either side degrades to `PublicationObservationArchive.empty()`'s
// own empty evidence on that side, by way of 0.8.177's own seam, never a
// throw.
//
// ARCHITECTURAL BOUNDARY — THIS FILE IMPORTS EXACTLY TWO MODULES, 0.8.177
// AND 0.8.178, AND NOTHING ELSE — THE ONLY TWO COMPOSITION LAYERS
// NECESSARY TO CONSTRUCT THE PAGE. It never imports 0.8.176 directly
// (0.8.177's own `reconstructXxx()` already composes it), and never
// imports any module beneath that: no 0.8.144 (candidate selection), no
// 0.8.157 (candidate revalidation), no 0.8.162 (observation creation), no
// 0.8.163 (observation history), no 0.8.166 (observation difference), no
// 0.8.167 (archive internals), no 0.8.168 (exchange), no 0.8.169
// (synchronization), no 0.8.171 (correspondence), no 0.8.172 (evolution),
// no 0.8.173 (evolution difference), no 0.8.174 (evolution agreement), no
// 0.8.175 (evidence summary), and no `PublicationObservationArchive.js`
// itself. This file knows how to ASSEMBLE existing products — it has no
// idea, and needs none, how any of them is calculated.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any new domain computation of any kind.** See "This file computes
//   nothing," above — this milestone is composition only.
// - **A score, rank, ordering by evidence weight, or any comparison
//   between two candidates' own evidence.** Inherited unchanged from
//   0.8.176's/0.8.177's/0.8.178's own boundary.
// - **A `winner`, `correct`/`incorrect`, `valid`, `preferred`, `status`,
//   or `confidence` field of any kind.** Inherited unchanged, the same.
// - **Any interpretation of agreement or difference as a conflict,
//   inconsistency, correction, or need for resolution.** Inherited
//   unchanged from every layer beneath this one.
// - **A new wrapper vocabulary, a new top-level field, or a new row
//   field.** See "No new wrapper vocabulary," above.
// - **Filtering, candidate detail panels, pagination, refresh behavior,
//   sorting, or a formal ranking/scoring model.** Real, separately sized,
//   later work — only worth naming after the actual page this milestone
//   produces has been seen.
// - **Actual markup, DOM nodes, styling, or any rendering technology
//   choice.** This file returns plain, frozen, page-SHAPED data, exactly
//   as 0.8.178 already does; turning that data into pixels a reader
//   actually sees remains separate work.
// - **Persistence or synchronization of any kind.** Both archives are
//   handed in and read; `reconstructXxx()` only reads.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(readModel) {
    return describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardView(readModel);
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage()
// — see this file's own header, "The identical split," above. Calls
// 0.8.177's own `reconstructXxx()` exactly once, obtaining its
// already-computed read model directly from `sourceArchive`/`targetArchive`
// without this file touching either archive itself, then hands that read
// model, unchanged, to `describeXxx()` above.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(sourceArchive, targetArchive) {
    const readModel = reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardReadModel(sourceArchive, targetArchive);
    return describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardPage(readModel);
}
