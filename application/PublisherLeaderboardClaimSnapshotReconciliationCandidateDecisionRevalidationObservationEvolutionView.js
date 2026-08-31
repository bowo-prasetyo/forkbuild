import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence
} from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondenceView.js';

// 0.8.172 — Reconciliation Candidate Observation Evolution Projection.
//
// 0.8.171 answered "which candidate does each historical observation refer
// to?" by drawing exactly one relationship — observation-history entry to
// embedded candidate — in `history`'s own existing order, never re-sorted
// and never grouped. This file is the reverse direction of that same
// relationship, and nothing more — the observation-history analogue of
// `application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolutionView.js`
// (0.8.154), one subject over: where that file narrates HOW ONE
// CANDIDATE'S OWN SEQUENCE OF RECORDED DECISIONS looks, this file narrates
// HOW ONE CANDIDATE'S OWN SEQUENCE OF RECORDED OBSERVATIONS looks:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(history)
//     -> { observationCount, distinctCandidateCount,
//          candidateEvolutions: [{ candidate, observationCount,
//                                   observations: [{ decision, planIdentity,
//                                                     candidatePresent, candidateType,
//                                                     candidateMatchesPlan, observedAt }] }] }
//
// THE QUESTION IS "HOW DID THE RECORDED OBSERVATIONS CONCERNING ONE
// CANDIDATE EVOLVE OVER TIME?" — NEVER "DID A LATER OBSERVATION SUPERSEDE,
// CORRECT, CONFIRM, OR INVALIDATE AN EARLIER ONE?" This is the one
// boundary this whole milestone exists to hold, held here again over a
// candidate's own observation sequence exactly as 0.8.154's own header
// holds it over a candidate's own decision sequence, and exactly as
// 0.8.165's own timeline holds it over the whole observation history at
// once. A sequence such as PRESENT+MATCH -> ABSENT+NO-MATCH -> PRESENT+MATCH
// is stated plainly, in chronological order, as three independently
// recorded historical observations concerning the same candidate — nothing
// more. See `docs/Principles.md`, "A Candidate's Decision History Is A
// Narration, Not A State Machine" (0.8.154), held here again over a
// per-candidate OBSERVATION sequence.
//
// 0.8.172 NARRATES 0.8.171'S CORRESPONDENCE; IT DOES NOT REDISCOVER
// CANDIDATE IDENTITY — THE ONE ARCHITECTURAL BOUNDARY THIS FILE EXISTS TO
// HOLD, ANALOGOUS TO 0.8.171'S OWN "THIS MILESTONE MUST NOT CALL 0.8.144 OR
// 0.8.157." This file computes nothing about which candidate an
// observation concerns — that relationship is 0.8.171's own, already
// computed, already correct answer. `describeXxx()` below calls 0.8.171's
// own
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence()`
// exactly once, over the whole supplied history at once, and then performs
// only a grouping/ordering pass over that result's own `correspondences`
// array:
//
//   Observation History
//          |
//          v
//        0.8.171 (called exactly once)
//          |
//          v
//   Observation -> Candidate Correspondences
//          |
//          v
//   0.8.172 groups by candidate, orders within each group
//          |
//          v
//   Candidate Observation Evolutions
//
// never:
//
//   Observation History -> 0.8.172 re-derives candidate identity itself
//
// This file therefore imports nothing from 0.8.144 (candidate selection),
// 0.8.157 (candidate revalidation), 0.8.162 (observation recording), 0.8.163
// (observation-history storage), or any decision/plan/discovery module —
// its own candidate-grouping key is 0.8.171's own already-embedded
// `candidate` field, read verbatim off each correspondence entry, never
// recomputed.
//
// CANDIDATE IDENTITY, NEVER PLAN IDENTITY OR OBSERVATION IDENTITY, GOVERNS
// EACH GROUP — REUSING 0.8.147'S/0.8.153'S/0.8.171'S OWN STRUCTURAL KEY
// UNCHANGED:
//
//   DIVERGENT_CORRESPONDENCE             -> type + claimId + snapshotIndex
//   CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT -> type + claimId
//   SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM -> type + snapshotIndex
//
// `observationCount` at the top level counts stored history entries,
// exactly as `history.length`/0.8.171's own `observationCount` already do
// — including every repeated observation of the identical candidate under
// the identical (or a different) plan, presence, or match outcome.
// `distinctCandidateCount` counts CANDIDATES, the structural identity key
// above, each counted once no matter how many observations were ever
// recorded against it. A history containing O1=C1+present+T1,
// O2=C1+absent+T2, O3=C2+present+T3, O4=C1+present+T1 (an exact duplicate
// of O1's own decision/plan/presence/match/observedAt) therefore reports
// `observationCount: 4` and `distinctCandidateCount: 2` — O1 and O4 remain
// two distinct history entries even if byte-identical, and all four
// observations correspond to only two candidates, C1 appearing once in
// `candidateEvolutions`, carrying three of the four observations.
//
// WITHIN ONE CANDIDATE'S OWN `observations` LIST, ENTRIES ARE ORDERED BY
// `observedAt` ASCENDING, WITH ORIGINAL HISTORY POSITION (0.8.171'S OWN
// `observationIndex`) AS THE TIE-BREAK — THE IDENTICAL TWO-KEY SORT
// 0.8.154'S OWN EVOLUTION, AND 0.8.165'S OWN TIMELINE, ALREADY USE, HELD
// HERE AGAIN PER CANDIDATE INSTEAD OF ACROSS THE WHOLE HISTORY AT ONCE. Two
// observations against the identical candidate can genuinely share one
// `observedAt`; `observationIndex` — the order 0.8.171's own
// correspondence, and `history` itself, already holds them in — is the one
// tie-break that carries no invented meaning. This makes each candidate's
// own `observations` list genuinely an EVOLUTION NARRATION — the sequence
// of recorded observations in the order they were actually made — rather
// than merely a grouping projection that happens to preserve history's own
// incidental append order.
//
// `candidateEvolutions` ITSELF RETAINS FIRST-APPEARANCE ORDER — NEVER
// RE-SORTED BY `observedAt`, BY CANDIDATE TYPE, OR BY OBSERVATION COUNT.
// Groups are ordered by each candidate's own first appearance while
// scanning 0.8.171's own `correspondences` in ITS existing order (which is
// `history`'s own existing order, unchanged) — the identical
// "first-appearance, never sorted" discipline 0.8.133's own
// `signerEvolutions` and 0.8.154's own `candidateEvolutions` already hold.
// Only the OBSERVATIONS WITHIN each group are re-ordered by `observedAt`;
// the GROUPS THEMSELVES are never chronologically re-derived.
//
// "EVOLUTION" NAMES THE MILESTONE; IT NEVER NAMES A FIELD OR APPEARS IN
// THIS FILE'S OWN DATA MODEL BEYOND THE EXPORTED FUNCTION NAMES AND THIS
// FILE'S OWN NAME — THE IDENTICAL RESTRAINT 0.8.133'S AND 0.8.154'S OWN
// HEADERS HOLD. `candidateEvolutions` is a factual, structural name for
// "one candidate's own list of observations," never `candidateProgress`,
// `candidateResolutions`, `candidateConvergence`, or `candidateOutcomes`.
//
// NO INTERPRETATION OF `candidatePresent`/`candidateMatchesPlan`, AND NO
// STATE-MACHINE VOCABULARY OF ANY KIND — THE ONE SEMANTIC LINE THIS WHOLE
// MILESTONE EXISTS TO HOLD, REUSING 0.8.148'S AND 0.8.154'S OWN HEADER,
// "THIS IS A NARRATION, NEVER A STATE MACHINE," ONE MORE TIME OVER A
// PER-CANDIDATE OBSERVATION SEQUENCE. This file carries no `changed`,
// `reversed`, `superseded`, `resolved`, `pending`, `final`, `current`,
// `latest`, `preferred`, `conflicting`, `corrected`, `converged`, or
// `drifted` field or vocabulary anywhere in its result or its own source. A
// candidate whose own observations read present+match -> absent+no-match
// -> present+match is reported exactly that way — three recorded
// observations, in chronological order, with no conclusion drawn about
// whether the sequence represents convergence, drift, correction, or
// anything else.
//
// EACH CANDIDATE'S OWN SHAPE IS PRESERVED EXACTLY, BY VALUE, UNCHANGED —
// NO MANUFACTURED FIELDS. `candidate` is embedded on each
// `candidateEvolutions` entry exactly as 0.8.171's own correspondence
// carries it (which is exactly as 0.8.162 recorded it, off
// `observation.decision.candidate`, which is exactly one of 0.8.144's own
// three shapes) — a `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT` candidate never
// acquires a `snapshotIndex: null` placeholder, and a
// `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM` candidate never acquires a
// fabricated `claimId`, purely to make every entry's own shape look
// uniform.
//
// EACH `observations` ENTRY IS `{ decision, planIdentity, candidatePresent,
// candidateType, candidateMatchesPlan, observedAt }` — CANDIDATE IDENTITY
// REMAINS SEPARATE FROM EVERY OTHER PER-OBSERVATION FACT, THE IDENTICAL
// RULE 0.8.154'S OWN HEADER NAMES EXPLICITLY FOR DECISIONS, HELD HERE AGAIN
// FOR OBSERVATIONS. The candidate itself is stated once, on the group; it
// is never repeated on every observation within that group. `decision`,
// `planIdentity`, `candidatePresent`, `candidateType`,
// `candidateMatchesPlan`, and `observedAt` are carried through unchanged
// from 0.8.171's own correspondence entry — never `observationIndex`
// itself, which is consumed only as the internal sort tie-break above and
// never surfaced on an `observations` entry (a caller who needs it can
// still find it in 0.8.171's own correspondence result directly).
//
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY SINCE 0.8.147
// ALREADY HOLDS. `describeXxx()` is the pure computation, over one plain,
// in-memory observation-history array (0.8.163's own shape) — it calls
// 0.8.171's own `describeXxx()` directly, never `reconstructXxx()`, so it
// never touches an archive. `reconstructXxx()` below calls 0.8.171's own
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence()`
// — the ONE seam that reads the archive (which itself delegates to
// 0.8.167's own
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()`)
// — obtaining 0.8.171's own correspondence result directly, then hands
// that result's own `correspondences` array to the identical
// grouping/ordering pass `describeXxx()` uses. 0.8.171 is therefore called
// EXACTLY ONCE for the entire history, whichever entry point a caller
// uses.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates the input history, any observation record within it, or
// any candidate it holds. Returns frozen objects and frozen arrays
// throughout. Calling either function twice with a byte-identical argument
// returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT — NEVER THROWS. `null`,
// `undefined`, a non-array, or an array containing entries that are not
// genuine 0.8.162 `{ observed: true, ... }` records are all tolerated
// exactly as 0.8.171's own `describeXxx()` already tolerates its own
// history argument (0.8.171 itself performs the exclusion; this file never
// re-implements it): an entirely malformed/absent history produces
// `observationCount: 0`, `distinctCandidateCount: 0`, and an empty, frozen
// `candidateEvolutions` array.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS FROM THE RECONCILIATION FAMILY BEYOND
// 0.8.171 ITSELF. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`
// (0.8.162),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`
// (0.8.163),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.js`
// (0.8.157), `application/PublisherLeaderboardClaimSnapshotReconciliation.js`
// (0.8.144's own candidate-selection boundary), any decision-history
// module, any correspondence/verification/signature module, or any other
// module in this family beyond 0.8.171 itself — it trusts nothing about
// how `history` was produced beyond 0.8.171's own documented result shape.
// The two imports below are both from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondenceView.js`
// (0.8.171) — `describeXxx()` used by this file's own `describeXxx()`, and
// `reconstructXxx()` used by this file's own `reconstructXxx()` — and
// nothing else.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any interpretation of a candidate's own observation sequence as
//   convergence, drift, resolution, correction, confirmation, or
//   invalidation.** See "No interpretation of `candidatePresent`/
//   `candidateMatchesPlan`," above.
// - **Deduplication of observations within a candidate's own sequence.**
//   An identical observation recorded twice against the same candidate
//   remains two entries in that candidate's own `observations` list,
//   always — the identical restraint 0.8.165's own timeline holds over the
//   whole history at once, held here again per candidate.
// - **Re-deriving candidate identity from a plan, claim history, snapshot
//   list, or archive state.** See "0.8.172 narrates 0.8.171's
//   correspondence," above — the whole point of this file.
// - **Comparison between two candidates' own observation sequences, or
//   between two replicas' own candidate-observation evolutions.** That is
//   a later, separately sized question, exactly as 0.8.154's own header
//   excludes cross-candidate/cross-replica comparison for decisions —
//   0.8.173's own, separately sized, later question (candidate observation
//   evolution difference).
// - **Whether a candidate is currently present, whether an observation is
//   correct, or whether it agrees with another replica's.** Those are
//   0.8.161's, 0.8.162's, and 0.8.170's own questions, respectively,
//   each already answered elsewhere.
// - **Any reconciliation ACTION, applying anything, or execution of any
//   kind.** This file inherits that boundary for free by never introducing
//   action vocabulary of its own.
// - **Persistence or synchronization of any kind.** `history` is an
//   in-memory array handed in and handed back, exactly like every other
//   projection in this family.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(history) {
    const correspondence = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(history);
    return buildEvolution(correspondence);
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution()
// — see this file's own header, "The identical split," above. Calls
// 0.8.171's own `reconstructXxx()` exactly once, obtaining that
// milestone's own correspondence result directly from `archive` without
// this file touching the archive itself a second time. An invalid/missing
// `archive` degrades to `PublicationObservationArchive.empty()` by way of
// the reconstruction seam 0.8.171 itself calls, which in turn produces the
// empty history's empty evolution result — never a throw.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(archive) {
    const correspondence = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(archive);
    return buildEvolution(correspondence);
}

// The one grouping/ordering pass both entry points share, operating
// entirely over 0.8.171's own `correspondences` array — never re-reading
// `history` or `archive` itself. Groups by candidate identity (first
// appearance order), then sorts each group's own observations by
// `observedAt` ascending with `observationIndex` (0.8.171's own
// history-position field) as the tie-break.
function buildEvolution(correspondence) {
    const candidateOrder = [];
    const entriesByCandidateKey = new Map();

    for (const entry of correspondence.correspondences) {
        const key = candidateIdentityKey(entry.candidate);
        let group = entriesByCandidateKey.get(key);
        if (!group) {
            group = { candidate: entry.candidate, entries: [] };
            entriesByCandidateKey.set(key, group);
            candidateOrder.push(key);
        }
        group.entries.push(entry);
    }

    const candidateEvolutions = candidateOrder.map((key) => {
        const group = entriesByCandidateKey.get(key);
        const sortedEntries = group.entries.slice().sort((a, b) => {
            const observedAtDelta = Date.parse(a.observedAt) - Date.parse(b.observedAt);
            if (observedAtDelta !== 0) return observedAtDelta;
            return a.observationIndex - b.observationIndex;
        });

        const observations = sortedEntries.map((entry) => Object.freeze({
            decision: entry.decision,
            planIdentity: entry.planIdentity,
            candidatePresent: entry.candidatePresent,
            candidateType: entry.candidateType,
            candidateMatchesPlan: entry.candidateMatchesPlan,
            observedAt: entry.observedAt
        }));

        return Object.freeze({
            candidate: group.candidate,
            observationCount: observations.length,
            observations: Object.freeze(observations)
        });
    });

    return Object.freeze({
        observationCount: correspondence.observationCount,
        distinctCandidateCount: candidateEvolutions.length,
        candidateEvolutions: Object.freeze(candidateEvolutions)
    });
}

// The complete structural candidate identity key — 0.8.147's, 0.8.153's,
// and 0.8.171's own key, reused unchanged. `type` is always part of the
// key; `claimId`/`snapshotIndex` are included only when 0.8.144's own
// shape for that `type` actually carries them.
function candidateIdentityKey(candidate) {
    if (candidate.type === 'DIVERGENT_CORRESPONDENCE') {
        return `DIVERGENT_CORRESPONDENCE:${candidate.claimId}:${candidate.snapshotIndex}`;
    }
    if (candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT') {
        return `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT:${candidate.claimId}`;
    }
    if (candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM') {
        return `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM:${candidate.snapshotIndex}`;
    }
    return `UNKNOWN:${JSON.stringify(candidate)}`;
}
