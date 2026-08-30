import { reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js';

// 0.8.164 — Revalidation Observation History Deduplication Projection.
//
// 0.8.163 keeps an append-only history of 0.8.162's own observation
// records, deliberately never deduplicated (see its own header, "Appended
// to, never overwritten, never mutated, never reordered or deduplicated").
// This file is the first to answer the question 0.8.163 refuses to touch:
//
//   "What DISTINCT revalidation observations are represented by this
//   history?"
//
// A PROJECTION, NEVER A MUTATION OF THE UNDERLYING HISTORY. This file reads
// `observationHistory` and returns a new, independent result describing it
// — it never appends to, removes from, reorders, or otherwise changes the
// array handed in. Calling this function does not shrink the history; the
// history a caller already holds remains exactly as many entries as it
// always held, byte-identical, after this file has run:
//
//   history:    O1 O1 O2 O3 O3
//   projection:  O1    O2    O3
//   history (unchanged, still): O1 O1 O2 O3 O3
//
//   0.8.163  observation history (append-only, multiplicity preserved)
//        │
//        ▼
//   ★ 0.8.164  observation deduplication projection (distinct-observation
//              view over that same history)
//
// IDENTITY IS THE COMPLETE OBSERVATION CONTENT — NEVER DECISION ID OR PLAN
// FINGERPRINT ALONE. Two observations are the identical, duplicate
// observation here only when EVERY ONE of the following match exactly:
// `decision`, `planIdentity`, `candidatePresent`, `candidateType`,
// `candidateMatchesPlan`, `observedAt`. In particular:
//
//   D1 + PlanA + true  + T1
//   D1 + PlanB + false + T2
//
// remain two distinct observations (`planIdentity`, `candidateMatchesPlan`,
// and `observedAt` all differ), and:
//
//   D1 + PlanA + true + T1
//   D1 + PlanA + true + T2
//
// also remain two distinct observations — same decision, same plan, same
// disposition, but observed at two different moments. Two observations
// collapse into one only when a caller genuinely checked the identical
// decision against the identical plan and got the identical result at the
// identical `observedAt` — the exact repeat 0.8.163's own flagship test
// already demonstrates (`O1`/`O4`, byte-identical) is preserved twice in
// the history and collapses to one here.
//
// FIRST-APPEARANCE ORDERED — NEVER SORTED BY ANY FIELD. `observations`
// holds the FIRST occurrence of each distinct observation, in the exact
// order that distinct observation first appears in `observationHistory`.
// This file never sorts by `observedAt`, by plan fingerprint, by decision
// identity, by candidate type, or by frequency — timeline ordering is
// 0.8.165's own, separately sized, later question. A history of
// `[O1, O1, O2, O3, O3]` (0.8.163's own vocabulary above) always projects
// to `observations: [O1, O2, O3]`, in that exact order, regardless of how
// often each one repeats or where its repeats fall.
//
// RESULT SHAPE — `{ observationCount, distinctObservationCount,
// duplicateObservationCount, observations }`. `observationCount` is
// `observationHistory.length` itself (every genuine entry, unfiltered);
// `distinctObservationCount` is `observations.length`;
// `duplicateObservationCount` is `observationCount - distinctObservationCount`
// — an invariant this file guarantees always holds:
//
//   observationCount = distinctObservationCount + duplicateObservationCount
//
// `observations` holds the ORIGINAL entries from `observationHistory`,
// unchanged and unwrapped — never a rebuilt or re-serialized copy of any
// entry's own fields.
//
// NON-GENUINE ENTRIES ARE SIMPLY SKIPPED, NEVER A THROW. Exactly like
// 0.8.163's own `appendXxx()`, an entry that is not a genuine
// `{ observed: true, ... }` record contributes nothing to any of the four
// result fields — it is not counted, not deduplicated against, and never
// appears in `observations`. A malformed `observationHistory` argument
// itself (not an array) is treated as `[]`.
//
// EVERY RESULT IS COMPLETELY FROZEN. The top-level result and its own
// `observations` array are both frozen; the entries inside `observations`
// are already frozen by 0.8.162/0.8.163 and are embedded here exactly as
// received, never rebuilt or re-frozen.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED. Reads no clock, touches
// no network, no storage, no verifier, and never mutates
// `observationHistory` or any entry inside it. Calling this function twice
// with an equivalent `observationHistory` returns a byte-identical result.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication()`
// — THE IDENTICAL SPLIT `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatisticsView.js`'s
// OWN 0.8.147/0.8.150 PAIR ALREADY HOLDS, one subject over.
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication()`
// remains the pure computation, over one plain, in-memory observation-history
// array (0.8.163's own shape) — UNCHANGED by 0.8.167.
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication()`
// below reads that array from `PublicationObservationArchive`'s own
// `revalidationObservationRecords` collection (0.8.167), via `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js`'s
// own `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()`
// — the ONE seam that reads the archive.
//
// ARCHITECTURAL BOUNDARY — EXACTLY ONE IMPORT, THE 0.8.167 ARCHIVE
// RECONSTRUCTION SEAM. This file imports nothing from `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`
// (0.8.162), `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`
// (0.8.163), any decision or decision-history module, any revalidation or
// plan-identity module, or `PublicationObservationArchive.js` itself — it
// trusts nothing about how an observation record was produced beyond its
// own documented shape (`{ observed: true, decision, planIdentity,
// candidatePresent, candidateType, candidateMatchesPlan, observedAt }`),
// performs no candidate matching, plan reconstruction, or decision
// generation of its own, and never calls 0.8.163, 0.8.162, or anything
// earlier to re-derive or double-check anything.
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication()`
// itself still imports nothing and still trusts nothing about how its own
// `observationHistory` argument was produced; the one import above is used
// ONLY by `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication()`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Statistics beyond the three counts above** — per-plan counts,
//   per-candidate-type counts, or any other aggregate/breakdown. That
//   remains a separately sized, later question, if one is ever wanted.
// - **Timeline, chronological ordering, or any re-derivation by
//   `observedAt`.** `observations` is first-appearance ordered only; that
//   is 0.8.165's own, already-built question.
// - **Difference between two histories, or between two deduplication
//   projections.** That is 0.8.166's own, already-built question.
// - **Mutating `observationHistory`, deduplicating it in place, or
//   producing a "deduplicated history" that replaces the original.** The
//   underlying history retains multiplicity permanently — this file only
//   ever hands back a separate, additional view over it.
// - **Any notion of "latest," "current," "valid," "invalid" (beyond the
//   fact that a non-genuine entry is skipped), "correct," "stale,"
//   "resolved," "superseded," or "preferred."** This file introduces no
//   vocabulary beyond counting and first-appearance deduplication.
// - **Persisting this projection's own OUTPUT.** `reconstructXxx()` reads
//   the archive's own raw observation history and recomputes this
//   projection fresh every call — the deduplication RESULT itself is never
//   written back to `PublicationObservationArchive`, exactly as
//   `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryStatisticsView.js`'s
//   own statistics result never is.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(observationHistory) {
    const entries = Array.isArray(observationHistory) ? observationHistory : [];
    const genuine = entries.filter((entry) => entry && typeof entry === 'object' && entry.observed === true);

    const seenKeys = new Set();
    const observations = [];
    for (const entry of genuine) {
        const key = canonicalObservationKey(entry);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        observations.push(entry);
    }

    const observationCount = genuine.length;
    const distinctObservationCount = observations.length;
    const duplicateObservationCount = observationCount - distinctObservationCount;

    return Object.freeze({
        observationCount,
        distinctObservationCount,
        duplicateObservationCount,
        observations: Object.freeze(observations)
    });
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication()
// — see this file's own header, "The identical split," above. An
// invalid/missing `archive` degrades to `PublicationObservationArchive.empty()`
// by way of the reconstruction seam it calls, which in turn produces this
// projection's own all-zero, empty-`observations` result — never a throw.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(archive) {
    return describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplication(
        reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(archive)
    );
}

// Complete observation identity — decision + planIdentity + candidatePresent
// + candidateType + candidateMatchesPlan + observedAt — never decision ID or
// plan fingerprint alone. Two observations sharing everything else but
// differing in `observedAt` remain two distinct observations.
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
