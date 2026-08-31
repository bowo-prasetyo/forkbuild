import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference
} from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution } from './PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionView.js';

// 0.8.173 — Reconciliation Candidate Observation Evolution Difference
// Projection.
//
// 0.8.166 answered "which observation records exist on one replica's
// history but not the other's?" by a pure multiset difference over
// OBSERVATION identity. 0.8.172 answered "how did the recorded observations
// concerning each candidate evolve over time?" by grouping a single
// history's own observations by CANDIDATE identity. Neither one answers the
// question this milestone exists for — the observation-history analogue of
// `application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionDifferenceView.js`
// (0.8.155), one subject over, stated plainly in this milestone's own
// request:
//
//   Given two replicas' observation histories, what candidate-specific
//   observation events are exclusive to each replica?
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(sourceHistory, targetHistory)
//     -> { sourceObservationCount, targetObservationCount,
//          sharedObservationCount,
//          sourceOnlyObservationCount, targetOnlyObservationCount,
//          sourceOnly, targetOnly,
//          sourceOnlyCandidateEvolutions, targetOnlyCandidateEvolutions }
//
// THIS IS NOT A COMPARISON OF CANDIDATES — IT IS A COMPARISON OF THE
// OBSERVATIONS BELONGING TO THOSE CANDIDATES. A "does this replica have any
// observation naming candidate C1?" comparison would conflate a `present +
// match` observation of C1 on one side with an `absent + no-match`
// observation of C1 on the other into "same candidate, no difference" —
// exactly the loss of information this milestone's own request calls out
// by name. This file never diffs at the candidate level. It diffs at the
// OBSERVATION level, via 0.8.166's own complete six-field structural
// identity (`decision` + `planIdentity` + `candidatePresent` +
// `candidateType` + `candidateMatchesPlan` + `observedAt`), unchanged, and
// only THEN groups the resulting exclusive observations by the candidate
// they concern, via 0.8.172's own already-established grouping, unchanged.
//
// ARCHITECTURE — 0.8.166 RUNS FIRST, EXACTLY ONCE, OVER THE TWO WHOLE
// HISTORIES; 0.8.172 THEN RUNS EXACTLY TWICE, EACH TIME OVER ONE
// ALREADY-COMPUTED EXCLUSIVE-OBSERVATION ARRAY:
//
//   sourceHistory ──┐
//                   ├── 0.8.166 ──→ sourceOnly / targetOnly
//   targetHistory ──┘                    │
//                       ┌────────────────┴────────────────┐
//                       ▼                                  ▼
//                0.8.172(sourceOnly)                0.8.172(targetOnly)
//                       │                                  │
//                       ▼                                  ▼
//         sourceOnlyCandidateEvolutions        targetOnlyCandidateEvolutions
//
// THIS FILE DOES NOT "BLINDLY COMPOSE" 0.8.166 AND 0.8.172 — THE ONE DESIGN
// DECISION THIS MILESTONE'S OWN REQUEST NAMES EXPLICITLY. The unsound
// composition this file deliberately avoids would run 0.8.172 independently
// over the WHOLE source history and the WHOLE target history, producing two
// complete candidate-observation-evolution results, and then attempt to
// diff THOSE — which either loses observation-level granularity (comparing
// candidate groups as opaque units) or silently reintroduces a
// candidate-identity comparison through the back door. Instead, 0.8.166
// runs first, exactly once, over the two whole histories; 0.8.172 then runs
// exactly twice, each time over one already-computed EXCLUSIVE-OBSERVATION
// array (`difference.sourceOnly`/`difference.targetOnly`) — each of which
// is already a valid observation-history array of genuine 0.8.162 records,
// the exact shape 0.8.172's own `describeXxx()` already accepts. 0.8.172 is
// never asked to group anything but observations already known to be
// exclusive to one side. 0.8.166 remains responsible for observation
// identity and multiset difference; 0.8.172 remains responsible for
// candidate grouping and chronological ordering; this file merely preserves
// the composition between them — never a third observation-comparison
// algorithm.
//
// TWO LEVELS OF INFORMATION, NEITHER ONE COLLAPSED INTO THE OTHER — THE
// RECURRING ARCHITECTURAL DISTINCTION THIS MILESTONE'S OWN REQUEST NAMES
// EXPLICITLY:
//
//   observation-level
//          +
//   candidate-grouped
//
// `sourceOnly`/`targetOnly` are 0.8.166's own raw exclusive-observation
// arrays, carried through byte-for-byte, unchanged, exactly as 0.8.166
// produced them — no information is ever lost by grouping.
// `sourceOnlyCandidateEvolutions`/`targetOnlyCandidateEvolutions` are the
// SAME exclusive observations, viewed through 0.8.172's own candidate lens,
// exposing the fact this milestone's own flagship scenario exists to make
// observable: a candidate that exists on both replicas' full histories can
// still have observations that are exclusive to one side, WHILE
// SIMULTANEOUSLY sharing at least one observation with the other side.
// Concretely, for the flagship world (source: C1→O1, C1→O2, C2→O3; target:
// C1→O1, C1→O4, C2→O5), `sourceOnly` names exactly `[O2, O3]` and
// `sourceOnlyCandidateEvolutions` groups them as C1→`[O2]`, C2→`[O3]` —
// never merged with the target's own exclusive `[O4, O5]`, which appears
// only in `targetOnly`/`targetOnlyCandidateEvolutions`, even though C1
// appears in both groupings and the shared `O1` cancels out of both.
//
// NO COMPARISON, RANKING, OR RECONCILIATION BETWEEN `sourceOnly` AND
// `targetOnly` OF ANY KIND — THE IDENTICAL RESTRAINT 0.8.166'S OWN HEADER
// ALREADY HOLDS, HELD HERE AGAIN OVER THE CANDIDATE-GROUPED VIEW. This file
// never states that a source-only observation "conflicts with,"
// "supersedes," or "corrects" a target-only observation concerning the same
// candidate, never picks a preferred observation, and never infers that the
// replicas disagree — only that each side's own history contains
// observation records the other side's history does not. C1 having both a
// SHARED observation and observations exclusive to each side is reported
// plainly, as the distribution of historical observations — never labeled
// conflict, disagreement, or resolution.
//
// `sharedObservationCount` IS DERIVED, NEVER A THIRD COMPARISON. Because
// 0.8.166's own difference is a MULTISET subtraction, the number of
// observations matched away from `source` equals the number matched away
// from `target` — `sourceObservationCount - sourceOnlyObservationCount`
// and `targetObservationCount - targetOnlyObservationCount` are always
// equal, and that single shared value is reported once. This is arithmetic
// over 0.8.166's own already-computed counts, never a fresh comparison of
// `sourceOnly` against `targetOnly` or of `source` against `target`.
//
// MULTIPLICITY IS PRESERVED THROUGH BOTH STAGES — THE IDENTICAL DISCIPLINE
// 0.8.166'S OWN MULTISET DIFFERENCE AND 0.8.172'S OWN GROUPING EACH ALREADY
// HOLD, COMPOSED UNCHANGED. `source = [O1, O1, O2]` compared against
// `target = [O1]` produces `sourceOnly = [O1, O2]` (0.8.166's own multiset
// subtraction consumes exactly one `O1`, leaving the second `O1`
// unmatched), and 0.8.172 then groups both surviving entries under their
// own candidate — the duplicate does not disappear during candidate
// grouping, because 0.8.172 itself never deduplicates (see 0.8.172's own
// header, "Deduplication of observations within a candidate's own
// sequence").
//
// CANDIDATE IDENTITY BOUNDARY — ALL THREE SHAPES REMAIN CLOSED, REUSING
// 0.8.147'S/0.8.153'S/0.8.171'S/0.8.172'S OWN STRUCTURAL KEY UNCHANGED:
//
//   DIVERGENT_CORRESPONDENCE             -> type + claimId + snapshotIndex
//   CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT -> type + claimId
//   SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM -> type + snapshotIndex
//
// A claim-shaped candidate and a snapshot-shaped candidate sharing the
// identical numeric/index-like value (e.g. `claimId: 'Claim-1'` versus
// `snapshotIndex: 1`) never collapse into one group — this file inherits
// that boundary for free by never computing a grouping key of its own; the
// key is always 0.8.172's own.
//
// NO ORDERING OR GROUPING BEYOND WHAT 0.8.166 AND 0.8.172 ALREADY PROVIDE.
// `sourceOnly`/`targetOnly` remain in 0.8.166's own order (each side's own
// original history order). `sourceOnlyCandidateEvolutions`/
// `targetOnlyCandidateEvolutions` remain in 0.8.172's own order
// (first-appearance among the exclusive observations, with each
// candidate's own `observations` sorted by `observedAt` ascending,
// `observationIndex` as the tie-break) — this file performs no re-sorting,
// re-grouping, or re-counting of its own beyond forwarding each
// already-computed result and deriving `sharedObservationCount`.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates either input history or any record either one holds.
// Calling either function twice with equivalent arguments returns a
// byte-identical result.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY SINCE 0.8.147
// ALREADY HOLDS. `describeXxx()` is the pure computation, over two plain,
// in-memory observation-history arrays (0.8.163's own shape) — it calls
// 0.8.166's own `describeXxx()` exactly once, then 0.8.172's own
// `describeXxx()` exactly twice (over `sourceOnly`, then over `targetOnly`),
// touching no archive. `reconstructXxx()` below calls 0.8.166's own
// `reconstructXxx()` exactly once — the ONE seam that reads an archive
// (which itself delegates to 0.8.167's own reconstruction of each side's
// history) — obtaining 0.8.166's own difference result directly, then hands
// that result's own `sourceOnly`/`targetOnly` arrays to 0.8.172's own
// `describeXxx()`, exactly as `describeXxx()` above does. 0.8.166 is
// therefore called exactly once, and 0.8.172 exactly twice, for the entire
// comparison, whichever entry point a caller uses.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT — NEVER THROWS. Both
// `sourceHistory` and `targetHistory` tolerate `null`, `undefined`, a
// non-array, or an array containing non-genuine entries exactly as 0.8.166
// already tolerates them (0.8.166 itself performs the exclusion; this file
// never re-implements it). Two empty/malformed histories degrade to
// `sourceObservationCount: 0`, `targetObservationCount: 0`,
// `sharedObservationCount: 0`, empty `sourceOnly`/`targetOnly` arrays, and
// empty `sourceOnlyCandidateEvolutions`/`targetOnlyCandidateEvolutions`
// arrays.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS FROM THE RECONCILIATION FAMILY BEYOND
// 0.8.166 AND 0.8.172 THEMSELVES. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`
// (0.8.162),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`
// (0.8.163),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView.js`
// (0.8.164),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimelineView.js`
// (0.8.165),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondenceView.js`
// (0.8.171), any decision or decision-history module, or
// `PublicationObservationArchive.js` itself — it trusts nothing about how
// either `history` argument was produced beyond 0.8.166's and 0.8.172's own
// already-documented result shapes, and never calls 0.8.171 through 0.8.144
// itself to re-derive or double-check anything. This file never verifies a
// signature, reconstructs a snapshot, reconstructs a reconciliation plan,
// determines whether an observation was correct, compares current state,
// infers a conflict, chooses one replica's observation, or synchronizes or
// modifies either archive — see 0.8.166's own header, "No label of
// 'conflicting,'" and 0.8.172's own header, "This is a narration, never a
// state machine," both held here again unchanged.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any interpretation of a source-only/target-only observation as a
//   conflict, inconsistency, correction, or need for resolution.** See "No
//   comparison, ranking, or reconciliation," above.
// - **Any export, import, application, or synchronization of the exclusive
//   observations found.** `sourceOnly`/`targetOnly` (and their candidate
//   groupings) are read-only facts about the difference; folding either
//   side's exclusive observations into the other history remains a future
//   milestone's own, separately sized, later question, never built here.
// - **Deduplication of any kind.** 0.8.166's own multiset discipline is
//   inherited unchanged: `[O1, O1, O2]` compared against `[O1, O2]` reports
//   exactly one exclusive `O1`, never zero and never two, and no result
//   field here collapses two independently recorded, byte-identical
//   observations into one.
// - **Comparing, merging, or cross-referencing `sourceOnlyCandidateEvolutions`
//   against `targetOnlyCandidateEvolutions`.** Each is an independent
//   candidate-grouped view of one side's own exclusive observations; this
//   file never states that a candidate group on one side "relates to,"
//   "differs from," or "should be reconciled with" the same candidate's
//   group on the other side, beyond both simply being able to name the
//   identical candidate.
// - **For each candidate, how many observations are shared, source-only,
//   and target-only.** That per-candidate agreement breakdown is 0.8.174's
//   own, separately sized, later question (Reconciliation Candidate
//   Observation Agreement Projection) — this milestone reports only the
//   whole-history `sharedObservationCount`, never a per-candidate one.
// - **Plan reconstruction, candidate selection, correspondence discovery,
//   divergence detection, or signature verification.** This file reads only
//   0.8.166's own and 0.8.172's own already-computed results, never a
//   freshly computed plan or a freshly rediscovered candidate.
// - **Persistence or synchronization of any kind.** Each history is an
//   in-memory array handed in and read, exactly like every other projection
//   in this family; `reconstructXxx()` only reads.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(sourceHistory = [], targetHistory = []) {
    const difference = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceHistory, targetHistory);
    return buildEvolutionDifference(difference);
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference()
// — see this file's own header, "The identical split," above. Calls
// 0.8.166's own `reconstructXxx()` exactly once, obtaining that
// milestone's own difference result directly from both archives without
// this file touching either archive itself a second time. An invalid/
// missing archive on either side degrades to `PublicationObservationArchive.empty()`
// on that side, by way of the reconstruction seam 0.8.166 itself calls —
// never a throw.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifference(sourceArchive, targetArchive) {
    const difference = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceArchive, targetArchive);
    return buildEvolutionDifference(difference);
}

// The one composition both entry points share — see this file's own
// header, "This file does not blindly compose 0.8.166 and 0.8.172," above.
// Groups each side's own already-computed exclusive-observation array by
// candidate, via 0.8.172's own `describeXxx()`, called once per side, and
// derives `sharedObservationCount` from 0.8.166's own already-computed
// counts.
function buildEvolutionDifference(difference) {
    const sourceOnlyEvolution = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(difference.sourceOnly);
    const targetOnlyEvolution = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(difference.targetOnly);

    return Object.freeze({
        sourceObservationCount: difference.sourceCount,
        targetObservationCount: difference.targetCount,
        sharedObservationCount: difference.sourceCount - difference.sourceOnlyCount,
        sourceOnlyObservationCount: difference.sourceOnlyCount,
        targetOnlyObservationCount: difference.targetOnlyCount,
        sourceOnly: difference.sourceOnly,
        targetOnly: difference.targetOnly,
        sourceOnlyCandidateEvolutions: sourceOnlyEvolution.candidateEvolutions,
        targetOnlyCandidateEvolutions: targetOnlyEvolution.candidateEvolutions
    });
}
