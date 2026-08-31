import { reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js';

// 0.8.171 — Revalidation Observation Candidate Correspondence Projection.
//
// 0.8.169 and 0.8.170 both answer questions ABOUT an observation history —
// which observations are missing from a peer (0.8.169's own synchronization,
// composed over 0.8.166), and which complete observation records/plan
// identities are shared versus exclusive (0.8.170) — but neither states,
// plainly and by itself, the one fact every downstream reader of an
// observation history actually reaches for first: WHICH CANDIDATE DOES EACH
// HISTORICAL OBSERVATION REFER TO? This file is that projection, and
// nothing more — the observation-history analogue of
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateCorrespondenceView.js`
// (0.8.153), one subject over: where that file draws exactly one
// relationship — decision record to embedded candidate — this file draws
// the identical relationship one layer up — observation record to embedded
// candidate:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(history)
//     -> { observationCount, candidateCount,
//          correspondences: [{ observationIndex, candidate, decision,
//                               planIdentity, candidatePresent,
//                               candidateType, candidateMatchesPlan,
//                               observedAt }, ...] }
//
// THE QUESTION IS DELIBERATELY NARROWER THAN "IS THE CANDIDATE CURRENTLY
// PRESENT?", "IS THE OBSERVATION CORRECT?", OR "DOES THIS OBSERVATION AGREE
// WITH ANOTHER REPLICA'S?" Those are 0.8.161's, 0.8.162's, and 0.8.170's own
// questions, respectively, each already answered elsewhere. This file draws
// exactly one relationship — observation record to the candidate its own
// embedded decision names — and states it plainly, in `history`'s own
// existing order, with no ordering, counting, or interpretation beyond that.
//
// THIS MILESTONE MUST NOT CALL 0.8.144 OR 0.8.157 TO REDISCOVER THE
// CANDIDATE — THE ONE ARCHITECTURAL BOUNDARY THIS FILE EXISTS TO HOLD,
// IDENTICAL TO 0.8.153'S OWN. A 0.8.162 observation record already embeds,
// by value, the exact 0.8.145 decision record a caller explicitly supplied
// at the moment the observation was made (see that file's own header, "A
// thin composition over 0.8.161, called exactly once"), and that decision
// record in turn already embeds, by value, the exact candidate a caller
// explicitly selected when the DECISION itself was recorded. This file
// reads that doubly-embedded `candidate` directly, off
// `observation.decision.candidate`, and never rebuilds a plan, rediscovers
// correspondence, or re-verifies presence to "check" it:
//
//   observation history -> embedded decision -> embedded candidate -> correspondence projection
//
// never:
//
//   observation history -> rebuild current plan -> rediscover candidate -> compare against observation
//
// The underlying claims, snapshots, plans, or archive may have changed in
// every way since an observation was recorded. NONE of that has any bearing
// here. A historical observation remains a historical record; this file
// narrates exactly what it already says, never what would be true if
// recomputed today.
//
// CANDIDATE TYPES REMAIN CLOSED — THE IDENTICAL THREE-VALUE VOCABULARY
// 0.8.144 AND 0.8.153 ESTABLISHED, UNCHANGED. `DIVERGENT_CORRESPONDENCE`,
// `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT`, `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM`
// are embedded in each correspondence entry's own `candidate`/`candidateType`
// exactly as 0.8.145/0.8.162 recorded them — this file introduces no fourth
// "UNKNOWN" or "UNRESOLVED" category, and no candidate-shape normalization
// of any kind.
//
// CANDIDATE IDENTITY ≠ PLAN IDENTITY ≠ OBSERVATION IDENTITY — THE CENTRAL
// ARCHITECTURAL TEST THIS MILESTONE EXISTS TO MAKE OBSERVABLE. An
// observation's `candidate` (0.8.144's own structural identity: `type` plus
// whichever of `claimId`/`snapshotIndex` that type carries) is the SAME
// candidate regardless of which plan it was revalidated against or what
// that revalidation found:
//
//   O1: candidate = C1, plan = P1, candidateMatchesPlan = true
//   O2: candidate = C1, plan = P2, candidateMatchesPlan = false
//
// Both O1 and O2 correspond to the identical candidate C1 — `candidateCount`
// counts C1 exactly once — while `planIdentity`, `candidateMatchesPlan`, and
// every other per-observation fact remain distinct per entry. Two
// observations of the identical candidate and decision against two
// DIFFERENT plans (`D1+C1+P1+present+T1`, `D1+C1+P2+absent+T2`) remain two
// separate correspondence entries, never merged; two observations sharing
// candidate, plan, AND decision but differing only in `observedAt` likewise
// remain two separate entries. This file collapses none of it — see
// `observationCount` versus `candidateCount`, immediately below.
//
// `observationCount` VERSUS `candidateCount` — THE IDENTICAL DISTINCTION
// 0.8.147/0.8.153 ALREADY MADE OBSERVABLE OVER DECISIONS, HELD HERE AGAIN
// OVER OBSERVATIONS. `observationCount` counts stored history entries,
// exactly as `history.length` itself would (after excluding non-genuine
// entries — see "Malformed input," below); `candidateCount` counts distinct
// candidate identities. A history containing O1=C1, O2=C1, O3=C2, O4=C1
// therefore reports `observationCount: 4` and `candidateCount: 2` (C1, C2)
// — all four correspondence entries remain present, in order.
//
// `correspondences` PRESERVES HISTORY'S OWN ORDER, NEVER RE-SORTED —
// 0.8.153's own restraint, reused unchanged. Entry `i` of `correspondences`
// corresponds to entry `i` of `history` (after excluding non-genuine
// entries, in the exact order `history` already holds them).
// `observationIndex` names that position explicitly, so a caller can always
// relate a correspondence entry back to its own position in the supplied
// history.
//
// EACH ENTRY EMBEDS THE OBSERVATION'S OWN FIELDS BY VALUE, UNCHANGED — NO
// RECOMPUTATION, NO RESHAPING. `decision`, `planIdentity`, `candidatePresent`,
// `candidateType`, `candidateMatchesPlan`, and `observedAt` are carried
// through exactly as 0.8.162 recorded them; `candidate` is the one new
// field this projection adds, read directly off
// `observation.decision.candidate` and embedded whole, exactly as 0.8.145
// recorded it — never re-derived, never reshaped.
//
// NO MUTATION OF ANY SUPPLIED OBJECT. `history` and each observation record
// within it are read only — this file never mutates any of them, and every
// object it returns is newly frozen, referencing (never copying by
// mutation) the original embedded values.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY ALREADY HOLDS.
// `describeXxx()` is the pure computation, over one plain, in-memory
// observation-history array (0.8.163's own shape) — it needs, and imports,
// nothing else, because the candidate is already embedded in each
// observation. `reconstructXxx()` below reads that array from
// `PublicationObservationArchive`'s own `revalidationObservationRecords`
// collection, via `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js`'s
// own `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()`
// (0.8.167) — the ONE seam that reads the archive.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Returns frozen objects and frozen arrays throughout. Calling either
// function twice with a byte-identical argument returns a byte-identical
// result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY RESULT — NEVER THROWS. `null`,
// `undefined`, a non-array, or an array containing entries that are not
// genuine 0.8.162 `{ observed: true, ... }` records are all tolerated,
// exactly as every other projection in this observation family already
// tolerates its own history argument — this file duplicates the identical
// minimal genuineness marker (`entry.observed === true` plus
// `typeof entry.observedAt === 'string'`) that 0.8.164/0.8.165/0.8.166/
// 0.8.170 already establish, never a deeper re-validation of `decision`,
// `planIdentity`, or any other field. Non-genuine entries are silently
// excluded (and never assigned an `observationIndex` of their own — indices
// are assigned only to genuine entries, after exclusion, in `history`'s own
// order), and an entirely malformed/absent history produces
// `observationCount: 0`, `candidateCount: 0`, and an empty, frozen
// `correspondences` array.
//
// ARCHITECTURAL BOUNDARY — `describeXxx()` IMPORTS NOTHING; `reconstructXxx()`
// IMPORTS EXACTLY ONE MODULE, 0.8.167'S OWN OBSERVATION-HISTORY
// RECONSTRUCTION SEAM. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`
// (0.8.162), `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`
// (0.8.163), `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.js`
// (0.8.157), `application/PublisherLeaderboardClaimSnapshotReconciliation.js`
// (0.8.144's own candidate-selection boundary), any decision-history
// module, any correspondence/verification/signature module, or any other
// module in this family beyond the one seam named above — it trusts
// nothing about how `history` was produced beyond its own documented shape,
// and never calls 0.8.144 or 0.8.157 to re-derive or double-check anything.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Rediscovering, refreshing, or verifying a candidate against a
//   current plan, claim history, snapshot, or archive state.** See "This
//   milestone must not call 0.8.144 or 0.8.157," above — the whole point of
//   this file.
// - **Whether the candidate is currently present, whether the observation
//   is correct, or whether it agrees with another replica's observation.**
//   Those are 0.8.161's, 0.8.162's, and 0.8.170's own questions,
//   respectively, each already answered elsewhere; this file only states
//   which candidate an observation names.
// - **A fourth "UNKNOWN"/"UNRESOLVED" candidate category.** See "Candidate
//   types remain closed," above.
// - **Any state-machine vocabulary — "resolved," "current," "correct,"
//   "stale," "superseded," or any interpretation of what an observation
//   implies about a candidate's present validity.** This file states only
//   what each observation already says about which candidate it names.
// - **Observation evolution by candidate, or narrating observations grouped
//   by the candidate they share over time.** That is 0.8.172's own,
//   separately sized, later question — see this milestone's own request.
// - **Candidate-type counts or other statistics beyond `observationCount`/
//   `candidateCount`.** That style of aggregate stays where it already
//   belongs; this file does not duplicate it.
// - **Any reconciliation ACTION, applying anything, or execution of any
//   kind.** This file inherits that boundary for free by never introducing
//   action vocabulary of its own.
// - **Persistence or synchronization of any kind.** `history` is an
//   in-memory array handed in and handed back, exactly like every other
//   projection in this family.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(history) {
    const list = Array.isArray(history) ? history : [];

    const correspondences = [];
    const candidateKeys = new Set();
    let observationIndex = 0;
    for (const entry of list) {
        if (!isGenuineObservation(entry)) continue;
        const candidate = entry.decision.candidate;
        correspondences.push(Object.freeze({
            observationIndex,
            candidate,
            decision: entry.decision,
            planIdentity: entry.planIdentity,
            candidatePresent: entry.candidatePresent,
            candidateType: entry.candidateType,
            candidateMatchesPlan: entry.candidateMatchesPlan,
            observedAt: entry.observedAt
        }));
        candidateKeys.add(candidateIdentityKey(candidate));
        observationIndex += 1;
    }

    return Object.freeze({
        observationCount: correspondences.length,
        candidateCount: candidateKeys.size,
        correspondences: Object.freeze(correspondences)
    });
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence()
// — see this file's own header, "The identical split," above. An
// invalid/missing `archive` degrades to `PublicationObservationArchive.empty()`
// by way of the reconstruction seam it calls, which in turn produces the
// empty history's empty correspondence result — never a throw.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(archive) {
    return describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondence(
        reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(archive)
    );
}

// A genuine 0.8.162 observation record — duplicated from 0.8.164's/
// 0.8.165's/0.8.166's/0.8.170's own private genuineness check for the
// identical reason those files each duplicate it: this file must apply the
// exact same minimal marker without importing a module that itself carries
// decision/plan/archive vocabulary. `entry.decision.candidate` is read
// directly below, trusting the `observed: true` marker exactly as the rest
// of this family trusts it, and nothing deeper.
function isGenuineObservation(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.observed === true
        && typeof entry.observedAt === 'string'
    );
}

// The complete structural candidate identity key — 0.8.147's/0.8.153's own
// key, reused unchanged. `type` is always part of the key; `claimId`/
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
