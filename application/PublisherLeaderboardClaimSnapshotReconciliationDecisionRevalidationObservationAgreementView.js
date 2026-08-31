import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js';
import { reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js';

// 0.8.170 — Revalidation Observation Agreement Projection.
//
// 0.8.166 answered "which observation records exist on one replica's history
// but not the other's?" Neither it, nor 0.8.167/0.8.168/0.8.169 built on top
// of it, ever states the complementary fact this milestone exists to make
// observable: given two replicas' observation histories, which COMPLETE
// observation records are SHARED by both replicas, and — separately, at a
// coarser grain — which plan identities are represented on both, or only
// one, of them? This is the observation-level counterpart of 0.8.156's own
// candidate-level agreement projection, one subject over (observations
// instead of decisions, plan identities instead of candidates), with the
// identical composition: reuse 0.8.166's own difference, never a second
// comparison engine.
//
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(sourceHistory, targetHistory)
//     -> { sourceObservationCount, targetObservationCount,
//          sharedObservationCount, sourceOnlyObservationCount, targetOnlyObservationCount,
//          sharedObservations, sourceOnly, targetOnly,
//          distinctPlanCount, sharedPlanCount,
//          sourceOnlyPlanCount, targetOnlyPlanCount,
//          planAgreements: [{ planIdentity, sharedObservationCount,
//                              sourceOnlyObservationCount, targetOnlyObservationCount }],
//          sameHistory }
//
// THIS FILE ANSWERS ONLY "WHICH RECORDS/PLANS ARE SHARED OR EXCLUSIVE?" —
// NEVER WHETHER ANY OBSERVATION IS CORRECT, OR WHETHER THE REPLICAS SHOULD
// CONVERGE. See "No comparison, ranking, or reconciliation," below.
//
// 0.8.166 CANNOT BY ITSELF PRODUCE THE SHARED SET — THE ONE GAP THIS
// MILESTONE FILLS, WITHOUT REBUILDING A SECOND, INDEPENDENT OBSERVATION-
// COMPARISON ENGINE. 0.8.166's own `describeXxx()` computes a multiset
// difference — `sourceOnly`/`targetOnly` — but deliberately exposes no
// intersection of its own (see that file's own header: "no ordering, no
// grouping, no statistics"). Rather than duplicate 0.8.166's whole
// comparison, this file calls 0.8.166's own `describeXxx()` exactly once to
// obtain `sourceOnly` (0.8.166's own array, unchanged), then derives the
// shared multiset by subtracting `sourceOnly` from the source's own
// genuine-filtered history — a multiset subtraction using the IDENTICAL
// six-field observation identity 0.8.166 already established (`decision` +
// `planIdentity` + `candidatePresent` + `candidateType` +
// `candidateMatchesPlan` + `observedAt`, compared by exact structural
// content). Since `source = shared ⊎ sourceOnly` by construction (0.8.166's
// own `extractUnmatched()` already guarantees this), `source - sourceOnly`
// recovers exactly the matched multiset — no re-comparison against
// `targetHistory` is ever needed to compute it:
//
//   Source history ──┐
//                    ├─→ 0.8.166 observation-level difference ─→ sourceOnly, targetOnly
//   Target history ──┘
//                    │
//                    ▼
//   sharedObservations = (genuine-filtered source) MINUS sourceOnly
//                        (multiset subtraction, six-field observation identity)
//
// `sharedObservations` therefore carries the SOURCE's OWN COPY of each
// matched record — an arbitrary but deterministic and documented choice
// (source and target each independently computed a structurally identical
// record; this file always reports source's own object, never target's, and
// never a reconstructed merge of the two). EVERY OBSERVATION ARRAY IN THE
// RESULT — `sharedObservations`, `sourceOnly`, `targetOnly` — HOLDS THE
// COMPLETE, UNCHANGED 0.8.166 OBSERVATION RECORDS THEMSELVES, never a
// reduced or re-narrated shape.
//
// USE 0.8.166'S EXACT SIX-FIELD OBSERVATION IDENTITY — NEVER A SECOND
// IDENTITY ALGORITHM OF THIS FILE'S OWN INVENTION. An observation's identity
// for `sharedObservations`/`sourceOnly`/`targetOnly` purposes is exactly:
//
//   observationIdentity = structural identity of
//       (decision, planIdentity, candidatePresent, candidateType,
//        candidateMatchesPlan, observedAt)
//
// So two observations differing in ONLY `candidateMatchesPlan` — everything
// else (decision, planIdentity, candidate, observedAt) identical — remain
// genuinely distinct observations, never merged into one shared record. The
// identical rule holds for a difference in `observedAt` alone. This file
// introduces no fifth or narrower field-subset key; see 0.8.166's own header
// for why ("Complete structural observation identity governs the
// comparison").
//
// PLAN PRESENCE IS COMPUTED INDEPENDENTLY OF OBSERVATION-LEVEL AGREEMENT —
// THE FLAGSHIP ARCHITECTURAL PRINCIPLE THIS MILESTONE EXISTS TO HOLD. A plan
// identity is represented on a replica if that replica's own FULL history
// (the complete, genuine-filtered `sourceHistory` or `targetHistory`, never
// `sourceOnly`/`targetOnly`/`sharedObservations` alone) names it in the
// `planIdentity` field of ANY observation, regardless of which observations
// about it happen to be shared or exclusive:
//
//   source plans = distinct planIdentity values in source history
//   target plans = distinct planIdentity values in target history
//
// `sharedPlanCount`/`sourceOnlyPlanCount`/`targetOnlyPlanCount`/
// `distinctPlanCount` are computed purely from these two full plan-identity
// sets. Concretely, the flagship scenario below demonstrates the
// consequence directly: Plan P1 receives DIFFERENT observations on Alice
// (`O1` present, `O2` absent) and Bob (`O1` present, `O3` present) — none of
// Alice's own P1 observations is byte-identical to any of Bob's OTHER than
// `O1` itself — yet P1 is still counted once as a SHARED PLAN, because both
// replicas' own full histories name it. A shared plan therefore DOES NOT
// IMPLY shared observations. The converse direction, however, is forced by
// construction: because `planIdentity` is itself one of the six fields
// composing observation identity, any observation appearing in
// `sharedObservations` necessarily names a plan identity present in BOTH
// replicas' own full history — same observation implies same plan, always.
//
// `planAgreements` NAMES EVERY PLAN IDENTITY REPRESENTED ON EITHER SIDE
// EXACTLY ONCE, CARRYING THREE INDEPENDENT COUNTS. For each plan identity:
// `sharedObservationCount` (from `sharedObservations`), `sourceOnlyObservationCount`
// (from `sourceOnly`), and `targetOnlyObservationCount` (from `targetOnly`) —
// each a plain count of how many entries in that already-computed
// observation array name this exact plan identity, never recomputed via any
// second comparison. A plan identity absent from one of the three arrays
// simply reads `0` for that count, never `null` or an absent field. Entries
// are ordered by first appearance scanning the source's own full,
// genuine-filtered history, followed by any plan identities found only on
// the target's own full, genuine-filtered history, in the target's own
// first-appearance order — this file performs no further re-sorting of its
// own.
//
// NO COMPARISON, RANKING, OR RECONCILIATION OF ANY KIND — THE IDENTICAL
// RESTRAINT 0.8.149'S, 0.8.156'S, AND 0.8.166'S OWN HEADERS ALREADY HOLD,
// HELD HERE AGAIN OVER THE OBSERVATION-LEVEL AGREEMENT VIEW. A plan identity
// carrying both a `sourceOnlyObservationCount` and a
// `targetOnlyObservationCount` is never described as "conflicting," and
// neither exclusive observation is ever said to supersede, correct, or
// invalidate the other, or the shared one. This file states plain counts and
// plain record arrays — nothing more. No `conflict`, `correct`, `stale`,
// `authoritative`, `resolved`, or `preferred` terminology appears anywhere
// in this file or its result.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates either input history or any record either one holds.
// Calling either function twice with equivalent arguments returns a
// byte-identical result.
//
// EXACTLY TWO FUNCTIONS — NO EXPORT/IMPORT/APPLY WRAPPERS. Unlike 0.8.168/
// 0.8.169, agreement is a read-only PROJECTION over two already-held
// histories, never an exchange operation of its own — there is no portable
// payload to transport here, and no reason to add one. See "Deliberately
// excluded," below.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY ALREADY HOLDS.
// `describeXxx()` is the pure computation, over two plain, in-memory
// observation-history arrays (0.8.163's own shape) — it calls 0.8.166's own
// `describeXxx()` exactly once, touching no archive. `reconstructXxx()`
// below reads each side's own raw observation history directly via 0.8.167's
// own `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()`
// — the identical ONE archive-reading seam 0.8.166's own `reconstructXxx()`
// itself already uses — and then calls `describeXxx()` above; this file
// never touches `PublicationObservationArchive` itself, and never calls
// 0.8.166's own `reconstructXxx()` (which would read the identical archives
// a second time for no benefit, since this file already needs each side's
// raw history for the plan-presence computation above, not merely 0.8.166's
// own difference result). It does not independently inspect archive
// internals of any kind.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY, CONVERGED RESULT — NEVER THROWS.
// Both `sourceHistory` and `targetHistory` tolerate `null`, `undefined`, a
// non-array, or an array containing non-genuine entries exactly as 0.8.166
// already tolerates them. Two empty/malformed histories degrade to every
// count reading `0` and `sameHistory: true`.
//
// ARCHITECTURAL BOUNDARY — EXACTLY TWO IMPORTS: 0.8.166'S OWN DIFFERENCE
// PROJECTION, AND 0.8.167'S OWN ARCHIVE RECONSTRUCTION SEAM. This file
// imports nothing from `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`
// (0.8.162), `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`
// (0.8.163), `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView.js`
// (0.8.164), `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimelineView.js`
// (0.8.165), `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange.js`
// (0.8.168), `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistorySynchronization.js`
// (0.8.169), `PublicationObservationArchive.js` itself, or any decision or
// plan module — it trusts nothing about how an observation record was
// produced beyond 0.8.166's and 0.8.167's own already-documented shapes.
// `describeXxx()` itself still imports nothing beyond 0.8.166's own
// `describeXxx()`, and trusts nothing about how its own `sourceHistory`/
// `targetHistory` arguments were produced; the reconstruction seam is used
// ONLY by `reconstructXxx()`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any interpretation of agreement or difference as a conflict,
//   inconsistency, correction, or need for resolution.** See "No
//   comparison, ranking, or reconciliation," above.
// - **Any export, import, application, or synchronization of the shared or
//   exclusive observations found.** Every array/count here is a read-only
//   fact about the comparison; folding anything into either history remains
//   0.8.168's/0.8.169's own, already-answered, separately sized question.
// - **Deduplication of any kind.** `sharedObservations`/`sourceOnly`/
//   `targetOnly` all preserve multiset multiplicity exactly as 0.8.166
//   already established.
// - **Comparing, merging, or cross-referencing a plan identity's own
//   `sourceOnlyObservationCount` against its own `targetOnlyObservationCount`.**
//   Both are reported side by side, as independent facts about the same
//   plan, never combined into a single derived "disagreement score."
// - **Grouping by candidate, decision, or observedAt.** This file groups
//   only by the two grains its own name promises — the complete observation
//   record, and the plan identity it names. Candidate-level grouping is
//   0.8.171's own, separately sized, later question.
// - **Plan reconstruction, candidate selection, correspondence discovery,
//   divergence detection, or signature verification.** This file reads only
//   0.8.166's and 0.8.167's own already-computed results.
// - **Persistence or synchronization of any kind.** Each history is an
//   in-memory array handed in and read; `reconstructXxx()` only reads.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(sourceHistory = [], targetHistory = []) {
    const difference = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceHistory, targetHistory);
    return buildAgreement(sourceHistory, targetHistory, difference);
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement()
// — see this file's own header, "The identical split," above. Reads each
// side's own raw observation history directly via 0.8.167's own
// reconstruction seam, then hands both to `describeXxx()` above — never
// calling 0.8.166's own `reconstructXxx()`, which would read the identical
// archives again for no benefit. An invalid/missing archive on either side
// degrades to `PublicationObservationArchive.empty()`'s own empty history on
// that side, by way of the reconstruction seam itself — never a throw.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(sourceArchive, targetArchive) {
    const sourceHistory = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(sourceArchive);
    const targetHistory = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(targetArchive);
    return describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationAgreement(sourceHistory, targetHistory);
}

// The one composition both entry points share — see this file's own header,
// "0.8.166 cannot by itself produce the shared set," and "plan presence is
// computed independently of observation-level agreement," above.
function buildAgreement(sourceHistory, targetHistory, difference) {
    const source = (Array.isArray(sourceHistory) ? sourceHistory : []).filter(isGenuineObservation);
    const target = (Array.isArray(targetHistory) ? targetHistory : []).filter(isGenuineObservation);
    const sharedObservations = Object.freeze(extractShared(source, difference.sourceOnly));

    const sharedByPlan = observationCountByPlan(sharedObservations);
    const sourceOnlyByPlan = observationCountByPlan(difference.sourceOnly);
    const targetOnlyByPlan = observationCountByPlan(difference.targetOnly);

    const sourcePlanKeys = distinctPlanKeys(source);
    const targetPlanKeys = distinctPlanKeys(target);

    let sharedPlanCount = 0;
    let sourceOnlyPlanCount = 0;
    for (const key of sourcePlanKeys) {
        if (targetPlanKeys.has(key)) sharedPlanCount += 1;
        else sourceOnlyPlanCount += 1;
    }
    let targetOnlyPlanCount = 0;
    for (const key of targetPlanKeys) {
        if (!sourcePlanKeys.has(key)) targetOnlyPlanCount += 1;
    }

    const planAgreements = [];
    const seenPlanKeys = new Set();
    const appendPlanAgreement = (planIdentity) => {
        const key = canonicalPlanIdentityKey(planIdentity);
        if (seenPlanKeys.has(key)) return;
        seenPlanKeys.add(key);
        planAgreements.push(Object.freeze({
            planIdentity,
            sharedObservationCount: sharedByPlan.get(key) || 0,
            sourceOnlyObservationCount: sourceOnlyByPlan.get(key) || 0,
            targetOnlyObservationCount: targetOnlyByPlan.get(key) || 0
        }));
    };
    for (const record of source) appendPlanAgreement(record.planIdentity);
    for (const record of target) appendPlanAgreement(record.planIdentity);

    return Object.freeze({
        sourceObservationCount: difference.sourceCount,
        targetObservationCount: difference.targetCount,
        sharedObservationCount: sharedObservations.length,
        sourceOnlyObservationCount: difference.sourceOnlyCount,
        targetOnlyObservationCount: difference.targetOnlyCount,
        sharedObservations,
        sourceOnly: difference.sourceOnly,
        targetOnly: difference.targetOnly,
        distinctPlanCount: sharedPlanCount + sourceOnlyPlanCount + targetOnlyPlanCount,
        sharedPlanCount,
        sourceOnlyPlanCount,
        targetOnlyPlanCount,
        planAgreements: Object.freeze(planAgreements),
        sameHistory: difference.sameHistory
    });
}

// Reads one already-computed observation array into a
// `planIdentityKey -> observationCount` lookup, used to answer "how many of
// THIS observation array name plan P?" without this file re-grouping
// anything by any second algorithm.
function observationCountByPlan(records) {
    const map = new Map();
    for (const record of records) {
        const key = canonicalPlanIdentityKey(record.planIdentity);
        map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
}

// The set of distinct plan-identity keys named anywhere in a FULL,
// genuine-filtered observation array — see this file's own header, "plan
// presence is computed independently of observation-level agreement." Never
// computed over `sourceOnly`/`targetOnly`/`sharedObservations` alone.
function distinctPlanKeys(records) {
    const keys = new Set();
    for (const record of records) keys.add(canonicalPlanIdentityKey(record.planIdentity));
    return keys;
}

// The multiset subtraction `from - remove`, preserving multiplicity —
// mirroring 0.8.156's own `extractShared()` exactly, inverted from 0.8.166's
// own `extractUnmatched()`: instead of returning the elements of `from` that
// have NO counterpart in `remove`, this returns the elements of `from` that
// DO. Since 0.8.166 already guarantees `from = result ⊎ remove` when
// `remove` is `from`'s own `sourceOnly`, this recovers exactly the matched
// (shared) multiset without ever re-reading `targetHistory`.
function extractShared(from, remove) {
    const remaining = new Map();
    for (const record of remove) {
        const key = canonicalObservationKey(record);
        remaining.set(key, (remaining.get(key) || 0) + 1);
    }

    const shared = [];
    for (const record of from) {
        const key = canonicalObservationKey(record);
        const count = remaining.get(key) || 0;
        if (count > 0) {
            remaining.set(key, count - 1);
        } else {
            shared.push(record);
        }
    }
    return shared;
}

// Complete structural observation identity — decision + planIdentity +
// candidatePresent + candidateType + candidateMatchesPlan + observedAt —
// duplicated from 0.8.166's own `canonicalObservationKey()` for the
// identical reason this whole family already duplicates it: this file must
// apply the exact same identity rule without importing a module that itself
// carries decision/plan/history vocabulary beyond 0.8.166's own difference
// entry point. Never a narrower or wider key — see this file's own header,
// "Use 0.8.166's exact six-field observation identity."
function canonicalObservationKey(entry) {
    return JSON.stringify({
        decision: entry.decision,
        planIdentity: entry.planIdentity,
        candidatePresent: entry.candidatePresent,
        candidateType: entry.candidateType,
        candidateMatchesPlan: entry.candidateMatchesPlan,
        observedAt: entry.observedAt
    });
}

// The complete structural identity key for a plan identity object —
// `algorithm` + `planFingerprint` + `candidateCount`, 0.8.160's own three
// fields. `JSON.stringify()` of the whole object already captures this
// faithfully (mirroring 0.8.156's own `candidateKey()` reasoning: a genuine
// plan identity is already a plain object with no methods of its own, so its
// complete structural content already IS its own key) — no separate
// type-prefixed key construction is needed. Computed from each
// observation's own embedded `planIdentity` field — never from a
// reconstructed plan, and never compared against `candidateCount`,
// `algorithm`, or `planFingerprint` independently.
function canonicalPlanIdentityKey(planIdentity) {
    return JSON.stringify(planIdentity);
}

// A genuine 0.8.162 observation record — duplicated from 0.8.163's/
// 0.8.164's/0.8.165's/0.8.166's own private genuineness check for the
// identical reason those files each duplicate it: this file must apply the
// exact same rule without importing a module that itself carries decision/
// plan/archive vocabulary beyond 0.8.166's own difference entry point.
function isGenuineObservation(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.observed === true
        && typeof entry.observedAt === 'string'
    );
}
