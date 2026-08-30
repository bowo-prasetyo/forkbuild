import { reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js';

// 0.8.153 — Historical Reconciliation Decision-to-Candidate Correspondence
// Projection.
//
// 0.8.146 through 0.8.152 all answer questions ABOUT a decision history —
// counts (0.8.147), chronology (0.8.148), difference between two histories
// (0.8.149), durability (0.8.150), portability (0.8.151), synchronization
// (0.8.152) — but none of them states, plainly and by itself, the one fact
// every downstream reader of a decision history actually reaches for first:
// WHICH CANDIDATE DOES EACH HISTORICAL DECISION REFER TO? This file is that
// projection, and nothing more — the decision-history analogue of
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimelineView.js`
// (0.8.148), one relationship over: where that file narrates WHEN a
// replica's own stored decisions were recorded, this file narrates WHAT
// EACH ONE WAS ABOUT:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(history)
//     -> { decisionCount, candidateCount,
//          correspondences: [{ decisionIndex, candidate, decision, decidedAt }, ...] }
//
// THE QUESTION IS DELIBERATELY NARROWER THAN "WAS THE DECISION CORRECT?" OR
// "WHAT SHOULD HAPPEN NOW?" It is narrower even than 0.8.148's own
// chronology question. This file draws exactly one relationship — decision
// record to embedded candidate — and states it plainly, in `history`'s own
// existing order, with no ordering, counting, or interpretation beyond that.
//
// THIS MILESTONE MUST NOT CALL 0.8.144 TO REDISCOVER THE CANDIDATE — THE
// ONE ARCHITECTURAL BOUNDARY THIS FILE EXISTS TO HOLD. A 0.8.145 decision
// record already embeds, by value, the exact candidate a caller explicitly
// selected at the moment the decision was recorded (see that file's own
// header, "The decision record does not recompute anything"). This file
// reads that embedded `candidate` directly and never rebuilds a plan,
// rediscovers correspondence, or re-verifies a signature to "check" it:
//
//   decision history -> embedded candidate -> correspondence projection
//
// never:
//
//   decision history -> rebuild current plan -> rediscover candidate -> compare against decision
//
// The underlying claims, snapshots, or archive may have changed in every
// way since a decision was recorded — a claim may since have been
// retracted, a snapshot may since have been superseded, the plan itself may
// no longer even produce this candidate at all. NONE of that has any
// bearing here. A historical decision remains a historical record; this
// file narrates exactly what it already says, never what would be true if
// recomputed today.
//
// CANDIDATE TYPES REMAIN CLOSED — THE IDENTICAL THREE-VALUE VOCABULARY
// 0.8.144 ESTABLISHED, UNCHANGED. `DIVERGENT_CORRESPONDENCE`,
// `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT`, `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM`
// are embedded in each correspondence entry's own `candidate` exactly as
// 0.8.145 recorded them — this file introduces no fourth "UNKNOWN" or
// "UNRESOLVED" category, and no candidate-shape normalization of any kind.
//
// DECISION IDENTITY vs. CANDIDATE IDENTITY — THE DISTINCTION 0.8.147 AND
// 0.8.149 ALREADY MADE OBSERVABLE, HELD HERE AGAIN OVER CORRESPONDENCE:
//
//   Decision identity:  candidate + decision + decidedAt
//   Candidate identity: candidate itself
//
// Two history entries recording the identical candidate under different
// dispositions, or under the identical disposition at different times, are
// two SEPARATE decision identities that both correspond to the SAME
// candidate. This file's own `candidateCount` counts distinct candidate
// identities (0.8.147's own structural key: `type` plus whichever of
// `claimId`/`snapshotIndex` that type actually carries); `decisionCount`
// counts stored history entries, exactly as `history.length` itself would.
// A history containing D1=C1+OBSERVE+T1, D2=C1+DEFER+T2, D3=C2+OBSERVE+T3,
// D4=C1+OBSERVE+T1 (an exact duplicate of D1) therefore reports
// `decisionCount: 4` and `candidateCount: 2` (C1, C2) — D1 and D4 remain
// two distinct history entries even though they are byte-identical, and D1
// and D2 correspond to the same candidate despite differing dispositions.
//
// `correspondences` PRESERVES HISTORY'S OWN ORDER, NEVER RE-SORTED. Unlike
// 0.8.148's own timeline (which re-orders by `decidedAt`), this file states
// no chronological claim of its own — entry `i` of `correspondences`
// corresponds to entry `i` of `history` (after excluding non-genuine
// entries, exactly as every other projection in this family already does;
// see "Malformed input," below), in the exact order `history` already
// holds them. `decisionIndex` names that position explicitly, so a caller
// can always relate a correspondence entry back to its own position in the
// supplied history.
//
// EACH ENTRY EMBEDS THE DECISION'S OWN `candidate`/`decision`/`decidedAt`
// BY VALUE, UNCHANGED — NO RECOMPUTATION, NO RESHAPING. Unlike 0.8.148's
// own timeline entries (which flatten `candidate.claimId`/`snapshotIndex`
// onto the entry itself under a renamed `candidateType`/`disposition`),
// this file's own correspondence entries carry `candidate` as a whole,
// exactly as 0.8.145 recorded it — the milestone's own request states the
// candidate is "already embedded inside the decision record," and this
// file's entire purpose is to expose that embedding, not to re-narrate it
// under a different shape. `decision` and `decidedAt` are likewise carried
// through unchanged.
//
// NO MUTATION OF ANY SUPPLIED OBJECT. `history`, each decision record
// within it, and each decision's own `candidate` are read only — this file
// never mutates any of them, and each entry it returns is a new, frozen
// object referencing (never copying by mutation) the original `candidate`
// value.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY SINCE 0.8.147
// ALREADY HOLDS. `describeXxx()` is the pure computation, over one plain,
// in-memory decision-history array (0.8.146's own shape).
// `reconstructXxx()` below reads that array from
// `PublicationObservationArchive`'s own `reconciliationDecisionRecords`
// collection (0.8.150), via `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js`'s
// own `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`
// — the ONE seam that reads the archive; this is exactly the archive read
// this file's own header, "This milestone must not call 0.8.144," permits:
// reading STORED decisions, never rediscovering a candidate against
// CURRENT state.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Returns frozen objects and frozen arrays throughout. Calling either
// function twice with a byte-identical argument returns a byte-identical
// result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT — NEVER THROWS. `null`,
// `undefined`, a non-array, or an array containing entries that are not
// genuine `{ decided: true, candidate, decision, decidedAt }` records are
// all tolerated exactly as every other projection in this family already
// tolerates its own history argument: non-genuine entries are silently
// excluded (and never assigned a `decisionIndex` of their own — indices
// are assigned only to genuine entries, after exclusion, in `history`'s own
// order), and an entirely malformed/absent history produces
// `decisionCount: 0`, `candidateCount: 0`, and an empty, frozen
// `correspondences` array.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS FROM THE RECONCILIATION FAMILY BEYOND
// THE ONE ARCHIVE RECONSTRUCTION SEAM. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliation.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`,
// or any other module naming a plan, a candidate-selection boundary, a
// divergence, a correspondence discovery, a verification, a claim, or a
// snapshot — it trusts nothing about how `history` was produced beyond its
// own documented shape, and never calls 0.8.144 through 0.8.152 to
// re-derive or double-check anything. The single import below —
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryView.js`'s
// own `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()`
// — is used ONLY by `reconstructXxx()` to obtain `history` from an archive;
// `describeXxx()` itself still imports nothing and still trusts nothing
// about how its own `history` argument was produced.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Rediscovering, refreshing, or verifying a candidate against a
//   current plan, claim history, snapshot, or archive state.** See "This
//   milestone must not call 0.8.144," above — the whole point of this file.
// - **A fourth "UNKNOWN"/"UNRESOLVED" candidate category.** See
//   "Candidate types remain closed," above.
// - **Any state-machine vocabulary — "resolved," "current," "correct,"
//   "stale," "superseded," or any interpretation of what a decision
//   implies about a candidate's present validity.** This file states only
//   what each decision already says about which candidate it names.
// - **Decision evolution by candidate, or narrating decisions grouped by
//   the candidate they share over time.** That is 0.8.154's own,
//   separately sized, later question — see this milestone's own request.
// - **Candidate-type counts or other statistics beyond `decisionCount`/
//   `candidateCount`.** That style of aggregate stays where 0.8.147 already
//   put it; this file does not duplicate it.
// - **Any reconciliation ACTION, applying anything, or execution of any
//   kind.** See 0.8.145's/0.8.146's own headers — this file inherits that
//   boundary for free by never introducing action vocabulary of its own.
// - **Persistence or synchronization of any kind.** `history` is an
//   in-memory array handed in and handed back, exactly like every other
//   projection in this family.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(history) {
    const list = Array.isArray(history) ? history : [];

    const correspondences = [];
    const candidateKeys = new Set();
    let decisionIndex = 0;
    for (const entry of list) {
        if (!isGenuineDecision(entry)) continue;
        correspondences.push(Object.freeze({
            decisionIndex,
            candidate: entry.candidate,
            decision: entry.decision,
            decidedAt: entry.decidedAt
        }));
        candidateKeys.add(candidateIdentityKey(entry.candidate));
        decisionIndex += 1;
    }

    return Object.freeze({
        decisionCount: correspondences.length,
        candidateCount: candidateKeys.size,
        correspondences: Object.freeze(correspondences)
    });
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence()
// — see this file's own header, "The identical split," above. An
// invalid/missing `archive` degrades to `PublicationObservationArchive.empty()`
// by way of the reconstruction seam it calls, which in turn produces the
// empty history's empty correspondence result — never a throw.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(archive) {
    return describePublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondence(
        reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(archive)
    );
}

// A genuine 0.8.145 decision record: `{ decided: true, candidate, decision,
// decidedAt }`, with `candidate` one of 0.8.144's own three shapes and
// `decision` one of 0.8.145's own two-value vocabulary. Anything else —
// including a genuine-looking `{ decided: false, ... }` outcome — is
// excluded, mirroring every other projection in this family exactly.
function isGenuineDecision(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.decided === true
        && entry.candidate !== null && typeof entry.candidate === 'object'
        && typeof entry.candidate.type === 'string'
        && (entry.decision === 'OBSERVE' || entry.decision === 'DEFER')
        && typeof entry.decidedAt === 'string'
    );
}

// The complete structural candidate identity key — 0.8.147's own key,
// reused unchanged. `type` is always part of the key; `claimId`/
// `snapshotIndex` are included only when 0.8.144's own shape for that
// `type` actually carries them.
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
