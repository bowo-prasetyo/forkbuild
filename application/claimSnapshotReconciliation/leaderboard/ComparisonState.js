// 0.8.183 — Reconciliation Candidate Leaderboard Comparison State.
//
// 0.8.181 gave a person a real way to supply a peer archive, but left one
// ambiguity unresolved: `targetArchive` starts as `PublicationObservationArchive
// .empty()` and STAYS an honestly empty archive if the peer that gets
// supplied simply has nothing recorded yet. Read off the leaderboard's own
// counts alone, those two situations are IDENTICAL — every row lands
// entirely in `sourceOnlyCount` either way. But they are not the same
// situation for the person reading the page: one means "you haven't told
// me who to compare against," the other means "I compared against a real
// peer, and that peer's own archive happens to be empty." This file is the
// small, standalone fact that tells the two apart:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(hasPeerArchive, targetArchive)
//     -> "NO_PEER" | "PEER_EMPTY" | "PEER_PRESENT"
//
//   NO_PEER       — no peer archive has been explicitly supplied.
//   PEER_EMPTY    — a peer archive WAS explicitly supplied, and it
//                    genuinely holds no reconciliation-decision or
//                    revalidation-observation records of its own.
//   PEER_PRESENT  — a peer archive was explicitly supplied, and it holds
//                    at least one such record.
//
// THIS FILE NEVER REINTERPRETS THE EVIDENCE ITSELF. It computes no shared/
// source-only/target-only count of any kind — those remain exactly
// 0.8.176's/0.8.177's/0.8.178's/0.8.179's own counts, byte-for-byte
// unchanged by this file's existence. `comparisonState` is a SEPARATE,
// PARALLEL fact about how the comparison came to be, read once and handed
// to the page ALONGSIDE the existing evidence — never folded into it, never
// used to adjust a count, and never a fourth value ("CONFLICT," "STALE,"
// "RESOLVED") that would turn a fact about supply into a verdict about
// evidence.
//
// `hasPeerArchive` IS AN EXPLICIT, CALLER-SUPPLIED SIGNAL — NEVER INFERRED
// FROM THE ARCHIVE'S OWN SHAPE. A freshly-imported peer archive that
// genuinely has zero records is, structurally, indistinguishable from the
// default `PublicationObservationArchive.empty()` `targetArchive` starts
// as — the archive object itself carries no "I was explicitly supplied"
// flag, and this file invents none. The ONLY way to tell "no peer" apart
// from "an explicitly supplied, genuinely empty peer" is for the caller —
// `ui/views/ReconciliationCandidateLeaderboardView.js`'s own `hasPeerArchive`
// ref, unchanged since 0.8.181 — to say so explicitly. This file trusts
// that signal completely and adds no archive-shape heuristic of its own to
// second-guess it.
//
// "GENUINELY EMPTY" MEANS EXACTLY WHAT 0.8.176 ALREADY READS OFF AN
// ARCHIVE — NOTHING BROADER. `targetArchive.reconciliationDecisionRecordCount`
// and `targetArchive.revalidationObservationRecordCount` are the identical
// two collections 0.8.156's/0.8.174's own seams already read, by way of
// 0.8.176's/0.8.177's/0.8.178's/0.8.179's own `reconstructXxx()` chain, to
// compute every count this leaderboard displays. This file asks the
// identical question those seams already answer — "does this archive hold
// any of the two record kinds the leaderboard actually reads?" — never a
// broader notion of "empty" that also considers publications, associations,
// or leaderboard claims the leaderboard itself never looks at.
//
// MALFORMED/ABSENT `targetArchive` DEGRADES TO `PEER_EMPTY` (WHEN
// `hasPeerArchive` IS TRUE) — NEVER THROWS. Exactly 0.8.176's/0.8.177's/
// 0.8.178's/0.8.179's own archive tolerance, held here again: an
// archive-shaped value missing either count getter, or missing altogether,
// is read as holding zero records of that kind, never as an error. A falsy
// `hasPeerArchive` always yields `NO_PEER` regardless of what
// `targetArchive` is — even a non-empty one — because this file trusts the
// caller's own explicit signal over any inference from `targetArchive`'s
// own shape.
//
// A LEAF COMPUTATION — IMPORTS NOTHING. This file needs no candidate
// correspondence, no decision/observation history, no evidence agreement,
// no read model, and no `PublicationObservationArchive` class itself; it
// reads exactly two already-public count getters off whatever
// `targetArchive`-shaped value it is handed. It shares no seam with, and
// adds no seam to, 0.8.176 through 0.8.179 — those remain completely
// untouched by this milestone, exactly as the milestone's own proposal
// asked.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Returns a plain, frozen string constant. Calling this function twice with
// byte-identical arguments returns the identical string.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any change to a decision/observation/candidate count.** See "This
//   file never reinterprets the evidence itself," above.
// - **A fourth state, or any state implying correctness, staleness, or a
//   need for resolution ("CONFLICT," "STALE," "RESOLVED," "VALID").** The
//   three states above describe SUPPLY, never agreement or disagreement.
// - **Inferring `hasPeerArchive` from `targetArchive`'s own shape.** See
//   "`hasPeerArchive` is an explicit, caller-supplied signal," above — a
//   structurally-empty archive is ambiguous on its own, on purpose, and
//   this file never tries to resolve that ambiguity by guessing.
// - **Persisting the comparison state, or the peer archive itself, in any
//   way.** This remains 0.8.181's own page-local, never-saved concern.
// - **The Leaderboard UI itself.** This file returns a plain string; the
//   view/table decide what a reader actually sees for each one.
export const ReconciliationCandidateLeaderboardComparisonState = Object.freeze({
    NO_PEER: 'NO_PEER',
    PEER_EMPTY: 'PEER_EMPTY',
    PEER_PRESENT: 'PEER_PRESENT'
});

function safeRecordCount(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

// describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState()
// — see this file's own header. `hasPeerArchive` is trusted verbatim;
// `targetArchive` is read ONLY for its own `reconciliationDecisionRecordCount`/
// `revalidationObservationRecordCount` — the identical two counts 0.8.176's
// own seam already reads to compute the leaderboard's real evidence.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateLeaderboardComparisonState(hasPeerArchive, targetArchive) {
    if (!hasPeerArchive) {
        return ReconciliationCandidateLeaderboardComparisonState.NO_PEER;
    }

    const decisionCount = safeRecordCount(targetArchive && targetArchive.reconciliationDecisionRecordCount);
    const observationCount = safeRecordCount(targetArchive && targetArchive.revalidationObservationRecordCount);

    return (decisionCount === 0 && observationCount === 0)
        ? ReconciliationCandidateLeaderboardComparisonState.PEER_EMPTY
        : ReconciliationCandidateLeaderboardComparisonState.PEER_PRESENT;
}
