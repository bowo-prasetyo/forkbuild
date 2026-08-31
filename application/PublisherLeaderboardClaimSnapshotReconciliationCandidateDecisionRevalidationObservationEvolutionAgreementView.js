import { describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js';
import { describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution } from './PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionView.js';
import { reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js';

// 0.8.174 — Reconciliation Candidate Observation Evolution Agreement
// Projection.
//
// 0.8.166 answered "which observation records exist on one replica's
// history but not the other's?" 0.8.173 grouped those SAME exclusive
// records by the candidate they concern. Neither one states the
// complementary fact this milestone exists to make observable: given two
// replicas' observation histories, which observation-history facts are
// SHARED by both replicas, and — separately — which candidates are
// represented on both, or only one, of them? This is the observation-level
// counterpart of 0.8.156's own candidate-decision agreement projection, one
// subject over, and the agreement-side complement of 0.8.173's own
// exclusive-side difference projection:
//
//   describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(sourceHistory, targetHistory)
//     -> { sourceObservationCount, targetObservationCount,
//          sharedObservationCount, sourceOnlyObservationCount, targetOnlyObservationCount,
//          sharedObservations, sourceOnly, targetOnly,
//          distinctCandidateCount, sharedCandidateCount,
//          sourceOnlyCandidateCount, targetOnlyCandidateCount,
//          candidateAgreements: [{ candidate, sharedObservationCount,
//                                   sourceOnlyObservationCount, targetOnlyObservationCount }],
//          sameHistory }
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
// never a reconstructed merge of the two).
//
// CANDIDATE PRESENCE IS COMPUTED INDEPENDENTLY OF OBSERVATION-LEVEL
// AGREEMENT — THE FLAGSHIP ARCHITECTURAL PRINCIPLE THIS MILESTONE EXISTS TO
// HOLD, HELD HERE AGAIN EXACTLY AS 0.8.156'S OWN HEADER ALREADY HOLDS IT ONE
// SUBJECT OVER. A candidate is represented on a replica if that replica's
// own FULL history (0.8.172's own `describeXxx()`, run once over the whole
// `sourceHistory` and once over the whole `targetHistory`, never over
// `sourceOnly`/`targetOnly`/`sharedObservations` alone) names it in ANY
// observation, regardless of which observations about it happen to be
// shared or exclusive. `sharedCandidateCount`/`sourceOnlyCandidateCount`/
// `targetOnlyCandidateCount`/`distinctCandidateCount` are computed purely
// from these two full candidate sets — never from `sharedObservations`/
// `sourceOnly`/`targetOnly` alone. A candidate is never recomputed by
// re-deriving observation identity, plan identity, or correspondence —
// candidate agreement is derived from shared observation facts, never
// independently recomputed.
//
// FLAGSHIP SCENARIO — Alice (source): `C1→O1, C1→O2, C2→O3`; Bob (target):
// `C1→O1, C1→O4, C2→O3, C3→O5` (O1 and O3 are the SAME structural
// observation on both sides). `sharedObservations = [O1, O3]`;
// `sourceOnly = [O2]`; `targetOnly = [O4, O5]`. At the candidate level: C1 is
// a SHARED candidate carrying one shared observation (O1) AND one exclusive
// observation on EACH side (O2 source-only, O4 target-only), simultaneously —
// never described as conflicting, never collapsed into "source-only" or
// "target-only" merely because it also carries exclusive observations. C2 is
// ALSO a shared candidate, but with ZERO exclusive observations on either
// side — every one of its recorded observations (O3) is shared. C3 is a
// target-only candidate, exclusive at both the candidate level and the
// observation level. A candidate can therefore simultaneously have shared
// and exclusive historical observations, and this file never turns that
// fact into "conflict," "resolved," "latest," or "winner" — it states three
// plain, independent counts per candidate and nothing more.
//
// `candidateAgreements` NAMES EVERY CANDIDATE REPRESENTED ON EITHER SIDE
// EXACTLY ONCE, CARRYING THREE INDEPENDENT COUNTS. For each candidate:
// `sharedObservationCount` (from `sharedObservations`, grouped by candidate
// via 0.8.172), `sourceOnlyObservationCount` (from `sourceOnly`), and
// `targetOnlyObservationCount` (from `targetOnly`) — each computed by
// running 0.8.172's own `describeXxx()` over that one already-computed
// observation array and reading its own per-candidate `observationCount`,
// never recomputed by this file's own grouping logic. A candidate absent
// from one of the three arrays simply reads `0` for that count, never
// `null` or an absent field. Entries are ordered by first appearance
// scanning the source's own full candidate list (0.8.172's own
// first-appearance order over `sourceHistory`), followed by any candidates
// found only on the target's own full candidate list, in the target's own
// first-appearance order — this file performs no further re-sorting of its
// own; chronological ordering within any one candidate's own observations
// remains entirely 0.8.172's own responsibility, exercised nowhere by this
// file beyond reading each evolution's own per-candidate `observationCount`.
//
// NO COMPARISON, RANKING, OR RECONCILIATION OF ANY KIND — THE IDENTICAL
// RESTRAINT 0.8.149'S, 0.8.156'S, 0.8.166'S, 0.8.170'S, AND 0.8.173'S OWN
// HEADERS ALREADY HOLD, HELD HERE AGAIN OVER THE CANDIDATE-GROUPED
// OBSERVATION AGREEMENT VIEW. A candidate carrying both a
// `sourceOnlyObservationCount` and a `targetOnlyObservationCount` is never
// described as "conflicting," and neither exclusive observation is ever
// said to supersede, correct, or invalidate the other, or the shared one.
// This file states three plain counts per candidate — nothing more. No
// `conflict`, `correct`, `stale`, `authoritative`, `resolved`, or
// `preferred` terminology appears anywhere in this file or its result.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates either input history or any record either one holds.
// Calling either function twice with equivalent arguments returns a
// byte-identical result.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement()`
// — THE IDENTICAL SPLIT EVERY PROJECTION IN THIS FAMILY SINCE 0.8.147
// ALREADY HOLDS. `describeXxx()` is the pure computation, over two plain,
// in-memory observation-history arrays (0.8.163's own shape) — it calls
// 0.8.166's own `describeXxx()` exactly once and 0.8.172's own
// `describeXxx()` exactly five times (over `sourceHistory`, `targetHistory`,
// `sharedObservations`, `sourceOnly`, and `targetOnly`), touching no
// archive. `reconstructXxx()` below reads each side's own raw observation
// history directly via 0.8.167's own
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()`
// — the identical ONE archive-reading seam 0.8.166's own `reconstructXxx()`
// itself already uses — and then calls `describeXxx()` above; this file
// never touches `PublicationObservationArchive` itself, and never calls
// 0.8.166's own `reconstructXxx()` (which would read the identical archives
// a second time for no benefit, since this file already needs each side's
// raw history for the candidate-presence computation above, not merely
// 0.8.166's own difference result).
//
// MALFORMED INPUT DEGRADES TO AN EMPTY, CONVERGED RESULT — NEVER THROWS.
// Both `sourceHistory` and `targetHistory` tolerate `null`, `undefined`, a
// non-array, or an array containing non-genuine entries exactly as 0.8.166
// and 0.8.172 already tolerate them. Two empty/malformed histories degrade
// to every count reading `0` and `sameHistory: true`.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS FROM THE RECONCILIATION FAMILY BEYOND
// 0.8.166, 0.8.167'S OWN ARCHIVE-READING SEAM, AND 0.8.172. This file
// imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`
// (0.8.162),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`
// (0.8.163),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView.js`
// (0.8.164),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimelineView.js`
// (0.8.165),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationCandidateCorrespondenceView.js`
// (0.8.171),
// `application/PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionDifferenceView.js`
// (0.8.173), `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.js`
// (0.8.157), `application/PublisherLeaderboardClaimSnapshotReconciliation.js`
// (0.8.144's own candidate-selection boundary), any decision or
// decision-history module, or `PublicationObservationArchive.js` itself —
// it trusts nothing about how either history was produced beyond 0.8.166's,
// 0.8.167's, and 0.8.172's own already-documented shapes. This file
// deliberately does NOT reuse 0.8.173 — 0.8.173 exposes only already-
// exclusive observations grouped by candidate, never the raw,
// genuine-filtered `sourceHistory`/`targetHistory` this file's own
// candidate-presence computation requires; depending on it would buy
// nothing while adding an extra layer of indirection.
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
//   already established — two independently recorded, byte-identical
//   observations on each side count as one shared observation, never zero
//   or two, and a local duplicate within one side's own exclusive history is
//   never collapsed.
// - **Comparing, merging, or cross-referencing a candidate's own
//   `sourceOnlyObservationCount` against its own `targetOnlyObservationCount`.**
//   Both are reported side by side, as independent facts about the same
//   candidate, never combined into a single "disagreement score" or similar
//   derived value.
// - **Re-deriving candidate identity from a plan, claim history, snapshot
//   list, or archive state, or revalidating a candidate against a plan.**
//   This file reads only 0.8.166's, 0.8.167's, and 0.8.172's own
//   already-computed results.
// - **Plan reconstruction, candidate selection, correspondence discovery,
//   divergence detection, or signature verification.**
// - **Persistence or synchronization of any kind.** Each history is an
//   in-memory array handed in and read; `reconstructXxx()` only reads.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
//
// ```
// Decision side                              Observation side
// ─────────────                              ────────────────
// 0.8.156 Candidate Decision Agreement       0.8.174 Candidate Observation Evolution Agreement   ★
// ```
//
// `docs/Roadmap.md` updated;
// `PublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreementView.test.js`
// registered in `tests.html`.
export function describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(sourceHistory = [], targetHistory = []) {
    const difference = describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceHistory, targetHistory);
    return buildAgreement(sourceHistory, targetHistory, difference);
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement()
// — see this file's own header, "The identical split," above. Reads each
// side's own raw observation history directly via 0.8.167's own
// reconstruction seam, then hands both to `describeXxx()` above — never
// calling 0.8.166's own `reconstructXxx()`, which would read the identical
// archives again for no benefit. An invalid/missing archive on either side
// degrades to `PublicationObservationArchive.empty()`'s own empty history on
// that side, by way of the reconstruction seam itself — never a throw.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(sourceArchive, targetArchive) {
    const sourceHistory = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(sourceArchive);
    const targetHistory = reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(targetArchive);
    return describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolutionAgreement(sourceHistory, targetHistory);
}

// The one composition both entry points share — see this file's own
// header, "0.8.166 cannot by itself produce the shared set," and "candidate
// presence is computed independently of observation-level agreement,"
// above.
function buildAgreement(sourceHistory, targetHistory, difference) {
    const source = (Array.isArray(sourceHistory) ? sourceHistory : []).filter(isGenuineObservation);
    const sharedObservations = Object.freeze(extractShared(source, difference.sourceOnly));

    const sharedByCandidate = observationCountByCandidate(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(sharedObservations));
    const sourceOnlyByCandidate = observationCountByCandidate(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(difference.sourceOnly));
    const targetOnlyByCandidate = observationCountByCandidate(describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(difference.targetOnly));

    const sourceEvolution = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(sourceHistory);
    const targetEvolution = describePublisherLeaderboardClaimSnapshotReconciliationCandidateDecisionRevalidationObservationEvolution(targetHistory);
    const sourceCandidateKeys = new Set(sourceEvolution.candidateEvolutions.map((entry) => candidateKey(entry.candidate)));
    const targetCandidateKeys = new Set(targetEvolution.candidateEvolutions.map((entry) => candidateKey(entry.candidate)));

    let sharedCandidateCount = 0;
    let sourceOnlyCandidateCount = 0;
    for (const key of sourceCandidateKeys) {
        if (targetCandidateKeys.has(key)) sharedCandidateCount += 1;
        else sourceOnlyCandidateCount += 1;
    }
    let targetOnlyCandidateCount = 0;
    for (const key of targetCandidateKeys) {
        if (!sourceCandidateKeys.has(key)) targetOnlyCandidateCount += 1;
    }

    const candidateAgreements = [];
    const seenCandidateKeys = new Set();
    const appendCandidateAgreement = (candidate) => {
        const key = candidateKey(candidate);
        if (seenCandidateKeys.has(key)) return;
        seenCandidateKeys.add(key);
        candidateAgreements.push(Object.freeze({
            candidate,
            sharedObservationCount: sharedByCandidate.get(key) || 0,
            sourceOnlyObservationCount: sourceOnlyByCandidate.get(key) || 0,
            targetOnlyObservationCount: targetOnlyByCandidate.get(key) || 0
        }));
    };
    for (const entry of sourceEvolution.candidateEvolutions) appendCandidateAgreement(entry.candidate);
    for (const entry of targetEvolution.candidateEvolutions) appendCandidateAgreement(entry.candidate);

    return Object.freeze({
        sourceObservationCount: difference.sourceCount,
        targetObservationCount: difference.targetCount,
        sharedObservationCount: sharedObservations.length,
        sourceOnlyObservationCount: difference.sourceOnlyCount,
        targetOnlyObservationCount: difference.targetOnlyCount,
        sharedObservations,
        sourceOnly: difference.sourceOnly,
        targetOnly: difference.targetOnly,
        distinctCandidateCount: sharedCandidateCount + sourceOnlyCandidateCount + targetOnlyCandidateCount,
        sharedCandidateCount,
        sourceOnlyCandidateCount,
        targetOnlyCandidateCount,
        candidateAgreements: Object.freeze(candidateAgreements),
        sameHistory: difference.sameHistory
    });
}

// Reads one already-computed 0.8.172 evolution result into a
// `candidateKey -> observationCount` lookup, used to answer "how many of
// THIS observation array concern candidate C?" without this file
// re-grouping anything itself.
function observationCountByCandidate(evolution) {
    const map = new Map();
    for (const entry of evolution.candidateEvolutions) {
        map.set(candidateKey(entry.candidate), entry.observationCount);
    }
    return map;
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

// The complete structural identity key for a candidate object — `type` plus
// whichever of `claimId`/`snapshotIndex` 0.8.144's own shape for that type
// actually carries. `JSON.stringify()` of the whole candidate object already
// captures this faithfully (mirroring 0.8.156's own `candidateKey()`
// reasoning: a genuine candidate is already a plain object with no methods
// of its own, so its complete structural content already IS its own key) —
// no separate type-prefixed key construction is needed.
function candidateKey(candidate) {
    return JSON.stringify(candidate);
}

// Complete structural observation identity — decision + planIdentity +
// candidatePresent + candidateType + candidateMatchesPlan + observedAt —
// duplicated from 0.8.166's own `canonicalObservationKey()` for the
// identical reason this whole family already duplicates it: this file must
// apply the exact same identity rule without importing a module that itself
// carries decision/plan/history vocabulary beyond 0.8.166's own difference
// entry point. Never a narrower or wider key.
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

// A genuine 0.8.162 observation record — duplicated from 0.8.163's/
// 0.8.164's/0.8.165's/0.8.166's/0.8.170's own private genuineness check for
// the identical reason those files each duplicate it: this file must apply
// the exact same rule without importing a module that itself carries
// decision/plan/archive vocabulary beyond 0.8.166's own difference entry
// point.
function isGenuineObservation(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.observed === true
        && typeof entry.observedAt === 'string'
    );
}
