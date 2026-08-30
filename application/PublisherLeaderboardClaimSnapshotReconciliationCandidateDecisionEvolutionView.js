import {
    describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence,
    reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence
} from './PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondenceView.js';

// 0.8.154 — Reconciliation Candidate Decision Evolution Projection.
//
// 0.8.153 answered "which candidate does each historical decision refer
// to?" by drawing exactly one relationship — decision-history entry to
// embedded candidate — in `history`'s own existing order, never re-sorted
// and never grouped. This file is the reverse direction of that same
// relationship, and nothing more — the decision-history analogue of
// `application/PublisherLeaderboardClaimEvolutionView.js` (0.8.133), one
// subject over: where that file narrates HOW ONE SIGNER'S OWN SEQUENCE OF
// CLAIMS looks, this file narrates HOW ONE CANDIDATE'S OWN SEQUENCE OF
// RECORDED DECISIONS looks:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(history)
//     -> { decisionCount, distinctCandidateCount,
//          candidateEvolutions: [{ candidate, decisionCount,
//                                   decisions: [{ decision, decidedAt }] }] }
//
// THE QUESTION IS "HOW DID THE RECORDED DECISIONS CONCERNING ONE CANDIDATE
// EVOLVE OVER TIME?" — NEVER "DID A LATER DECISION SUPERSEDE, CORRECT,
// REVERSE, IMPROVE, OR INVALIDATE AN EARLIER ONE?" This is the one
// boundary this whole milestone exists to hold, held here again over a
// candidate's own decision sequence exactly as 0.8.133's own header holds
// it over a signer's own claim sequence, and exactly as 0.8.148's own
// timeline holds it over the whole history at once ("this is a narration,
// never a state machine"). A sequence such as OBSERVE -> DEFER -> OBSERVE
// is stated plainly, in chronological order, as three independently
// recorded historical dispositions concerning the same candidate — nothing
// more. See `docs/Principles.md`, "A Candidate's Decision History Is A
// Narration, Not A State Machine," held here for the first time over a
// per-candidate sequence.
//
// 0.8.154 NARRATES 0.8.153'S CORRESPONDENCE; IT DOES NOT REDISCOVER
// CANDIDATE IDENTITY — THE ONE ARCHITECTURAL BOUNDARY THIS FILE EXISTS TO
// HOLD, ANALOGOUS TO 0.8.153'S OWN "THIS MILESTONE MUST NOT CALL 0.8.144."
// This file computes nothing about which candidate a decision concerns —
// that relationship is 0.8.153's own, already-computed, already-correct
// answer. `describeXxx()` below calls 0.8.153's own
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence()`
// exactly once, over the whole supplied history at once, and then performs
// only a grouping/ordering pass over that result's own `correspondences`
// array:
//
//   Decision History
//          |
//          v
//        0.8.153 (called exactly once)
//          |
//          v
//   Decision -> Candidate Correspondences
//          |
//          v
//   0.8.154 groups by candidate, orders within each group
//          |
//          v
//   Candidate Decision Evolutions
//
// never:
//
//   Decision History -> 0.8.154 re-derives candidate identity itself
//
// This file therefore imports nothing from 0.8.144 (candidate selection),
// 0.8.145 (decision recording), 0.8.146 (decision-history storage), or any
// plan/discovery module — its own candidate-grouping key is 0.8.153's own
// already-embedded `candidate` field, read verbatim off each correspondence
// entry, never recomputed.
//
// CANDIDATE IDENTITY, NEVER DECISION IDENTITY, GOVERNS EACH GROUP — REUSING
// 0.8.147'S AND 0.8.153'S OWN STRUCTURAL KEY UNCHANGED:
//
//   DIVERGENT_CORRESPONDENCE             -> type + claimId + snapshotIndex
//   CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT -> type + claimId
//   SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM -> type + snapshotIndex
//
// `decisionCount` at the top level counts stored history entries, exactly
// as `history.length`/0.8.153's own `decisionCount` already do —
// including every repeated recording of the identical candidate under the
// identical (or a different) disposition. `distinctCandidateCount` counts
// CANDIDATES, the structural identity key above, each counted once no
// matter how many decisions were ever recorded against it. A history
// containing D1=C1+OBSERVE+T1, D2=C1+DEFER+T2, D3=C1+OBSERVE+T3,
// D4=C1+OBSERVE+T1 (an exact duplicate of D1) therefore reports
// `decisionCount: 4` and `distinctCandidateCount: 1` — D1 and D4 remain
// two distinct history entries even though they are byte-identical, and
// all four decisions correspond to the same candidate C1, which appears
// in `candidateEvolutions` exactly once, carrying all four decisions.
//
// WITHIN ONE CANDIDATE'S OWN `decisions` LIST, ENTRIES ARE ORDERED BY
// `decidedAt` ASCENDING, WITH ORIGINAL HISTORY POSITION (0.8.153'S OWN
// `decisionIndex`) AS THE TIE-BREAK — THE IDENTICAL TWO-KEY SORT 0.8.148'S
// OWN TIMELINE ALREADY USES, HELD HERE AGAIN PER CANDIDATE INSTEAD OF
// ACROSS THE WHOLE HISTORY AT ONCE. Two decisions against the identical
// candidate can genuinely share one `decidedAt`; `decisionIndex` — the
// order 0.8.153's own correspondence, and `history` itself, already holds
// them in — is the one tie-break that carries no invented meaning. This
// makes each candidate's own `decisions` list genuinely an EVOLUTION
// NARRATION — the sequence of dispositions in the order they were actually
// decided — rather than merely a grouping projection that happens to
// preserve history's own incidental append order.
//
// `candidateEvolutions` ITSELF RETAINS FIRST-APPEARANCE ORDER — NEVER
// RE-SORTED BY `decidedAt`, BY CANDIDATE TYPE, OR BY DECISION COUNT. Groups
// are ordered by each candidate's own first appearance while scanning
// 0.8.153's own `correspondences` in ITS existing order (which is
// `history`'s own existing order, unchanged) — the identical
// "first-appearance, never sorted" discipline 0.8.133's own
// `signerEvolutions` and 0.8.147's own `dispositionCounts`/
// `candidateTypeCounts` already hold. Only the DECISIONS WITHIN each group
// are re-ordered by `decidedAt`; the GROUPS THEMSELVES are never
// chronologically re-derived.
//
// "EVOLUTION" NAMES THE MILESTONE; IT NEVER NAMES A FIELD OR APPEARS IN
// THIS FILE'S OWN DATA MODEL BEYOND THE EXPORTED FUNCTION NAMES AND THIS
// FILE'S OWN NAME — THE IDENTICAL RESTRAINT 0.8.133'S OWN HEADER HOLDS.
// `candidateEvolutions` is a factual, structural name for "one candidate's
// own list of decisions," never `candidateProgress`,
// `candidateResolutions`, or `candidateOutcomes`.
//
// NO INTERPRETATION OF `OBSERVE`/`DEFER`, AND NO STATE-MACHINE VOCABULARY
// OF ANY KIND — THE ONE SEMANTIC LINE THIS WHOLE MILESTONE EXISTS TO HOLD,
// REUSING 0.8.148'S OWN HEADER, "THIS IS A NARRATION, NEVER A STATE
// MACHINE," ONE MORE TIME OVER A PER-CANDIDATE SEQUENCE. This file carries
// no `changed`, `reversed`, `superseded`, `resolved`, `pending`, `final`,
// `current`, `latest`, `preferred`, `conflicting`, or `corrected` field or
// vocabulary anywhere in its result or its own source. A candidate whose
// own decisions read OBSERVE -> DEFER -> OBSERVE is reported exactly that
// way — three recorded dispositions, in chronological order, with no
// conclusion drawn about whether the sequence represents indecision,
// correction, or anything else.
//
// EACH CANDIDATE'S OWN SHAPE IS PRESERVED EXACTLY, BY VALUE, UNCHANGED —
// NO MANUFACTURED FIELDS. `candidate` is embedded on each
// `candidateEvolutions` entry exactly as 0.8.153's own correspondence
// carries it (which is exactly as 0.8.145 recorded it, which is exactly
// one of 0.8.144's own three shapes) — a
// `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT` candidate never acquires a
// `snapshotIndex: null` placeholder, and a
// `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM` candidate never acquires a
// fabricated `claimId`, purely to make every entry's own shape look
// uniform.
//
// EACH `decisions` ENTRY IS `{ decision, decidedAt }` — CANDIDATE IDENTITY
// AND DECISION IDENTITY REMAIN SEPARATE, THE ONE ARCHITECTURAL RULE THIS
// MILESTONE'S OWN REQUEST NAMES EXPLICITLY. The candidate itself is stated
// once, on the group; it is never repeated on every decision within that
// group. `decision`/`decidedAt` are carried through unchanged from 0.8.153's
// own correspondence entry (`'OBSERVE'`/`'DEFER'`, and the exact ISO 8601
// string 0.8.145 recorded).
//
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY SINCE 0.8.147
// ALREADY HOLDS. `describeXxx()` is the pure computation, over one plain,
// in-memory decision-history array (0.8.146's own shape) — it calls
// 0.8.153's own `describeXxx()` directly, never `reconstructXxx()`, so it
// never touches an archive. `reconstructXxx()` below calls 0.8.153's own
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence()`
// — the ONE seam that reads the archive (which itself delegates to
// 0.8.150's own `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`)
// — obtaining 0.8.153's own correspondence result directly, then hands
// that result's own `correspondences` array to the identical
// grouping/ordering pass `describeXxx()` uses. 0.8.153 is therefore called
// EXACTLY ONCE for the entire history, whichever entry point a caller
// uses.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates the input history, any decision record within it, or any
// candidate it holds. Returns frozen objects and frozen arrays throughout.
// Calling either function twice with a byte-identical argument returns a
// byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT — NEVER THROWS. `null`,
// `undefined`, a non-array, or an array containing entries that are not
// genuine `{ decided: true, candidate, decision, decidedAt }` records are
// all tolerated exactly as 0.8.153's own `describeXxx()` already tolerates
// its own history argument (0.8.153 itself performs the exclusion; this
// file never re-implements it): an entirely malformed/absent history
// produces `decisionCount: 0`, `distinctCandidateCount: 0`, and an empty,
// frozen `candidateEvolutions` array.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS FROM THE RECONCILIATION FAMILY BEYOND
// 0.8.153 ITSELF. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliation.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js`,
// or any other module naming a plan, a candidate-selection boundary, a
// divergence, a verification, a claim, or a snapshot — it trusts nothing
// about how `history` was produced beyond 0.8.153's own documented result
// shape. The two imports below are both from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondenceView.js`
// (0.8.153) — `describeXxx()` used by this file's own `describeXxx()`, and
// `reconstructXxx()` used by this file's own `reconstructXxx()` — and
// nothing else.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any interpretation of a candidate's own decision sequence as
//   supersession, resolution, correction, reversal, improvement, or
//   invalidation.** See "No interpretation of `OBSERVE`/`DEFER`," above.
// - **Deduplication of decisions within a candidate's own sequence.** An
//   identical decision recorded twice against the same candidate remains
//   two entries in that candidate's own `decisions` list, always — the
//   identical restraint 0.8.148's own timeline holds over the whole
//   history at once, held here again per candidate.
// - **Re-deriving candidate identity from a plan, claim history, snapshot
//   list, or archive state.** See "0.8.154 narrates 0.8.153's
//   correspondence," above — the whole point of this file.
// - **Comparison between two candidates' own decision sequences, or
//   between two replicas' own candidate-decision evolutions.** That is a
//   later, separately sized question, exactly as 0.8.133's own header
//   excludes cross-signer comparison and difference between two claims.
// - **Any reconciliation ACTION, applying anything, or execution of any
//   kind.** See 0.8.145's/0.8.146's own headers — this file inherits that
//   boundary for free by never introducing action vocabulary of its own.
// - **Persistence or synchronization of any kind.** `history` is an
//   in-memory array handed in and handed back, exactly like every other
//   projection in this family.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(history) {
    const correspondence = describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(history);
    return buildEvolution(correspondence);
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution()
// — see this file's own header, "The identical split," above. Calls
// 0.8.153's own `reconstructXxx()` exactly once, obtaining that
// milestone's own correspondence result directly from `archive` without
// this file touching the archive itself a second time. An invalid/missing
// `archive` degrades to `PublicationObservationArchive.empty()` by way of
// the reconstruction seam 0.8.153 itself calls, which in turn produces the
// empty history's empty evolution result — never a throw.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionEvolution(archive) {
    const correspondence = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(archive);
    return buildEvolution(correspondence);
}

// The one grouping/ordering pass both entry points share, operating
// entirely over 0.8.153's own `correspondences` array — never re-reading
// `history` or `archive` itself. Groups by candidate identity (first
// appearance order), then sorts each group's own decisions by `decidedAt`
// ascending with `decisionIndex` (0.8.153's own history-position field) as
// the tie-break.
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
            const decidedAtDelta = Date.parse(a.decidedAt) - Date.parse(b.decidedAt);
            if (decidedAtDelta !== 0) return decidedAtDelta;
            return a.decisionIndex - b.decisionIndex;
        });

        const decisions = sortedEntries.map((entry) => Object.freeze({
            decision: entry.decision,
            decidedAt: entry.decidedAt
        }));

        return Object.freeze({
            candidate: group.candidate,
            decisionCount: decisions.length,
            decisions: Object.freeze(decisions)
        });
    });

    return Object.freeze({
        decisionCount: correspondence.decisionCount,
        distinctCandidateCount: candidateEvolutions.length,
        candidateEvolutions: Object.freeze(candidateEvolutions)
    });
}

// The complete structural candidate identity key — 0.8.147's and 0.8.153's
// own key, reused unchanged. `type` is always part of the key;
// `claimId`/`snapshotIndex` are included only when 0.8.144's own shape for
// that `type` actually carries them.
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
