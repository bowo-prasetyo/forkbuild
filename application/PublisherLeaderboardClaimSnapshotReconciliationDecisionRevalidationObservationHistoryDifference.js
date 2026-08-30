// 0.8.166 — Revalidation Observation History Difference Projection.
//
// 0.8.163 gave a replica an append-only, in-memory collection of its own
// explicit revalidation observations (0.8.162's own records), and three
// exact-field lookups over it, but deliberately excluded any notion of
// comparing that collection against a PEER's own — see 0.8.163's own
// header, "Deliberately excluded," bullet four ("Difference between two
// observation histories. That is 0.8.166's own, separately sized, later
// question."), a boundary 0.8.164's own deduplication projection and
// 0.8.165's own timeline projection each repeat unchanged. This file
// answers exactly that question, and nothing else — the observation-history
// analogue of
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js`
// (0.8.149), one subject over: where that file diffs a replica's own stored
// reconciliation DECISIONS, this file diffs a replica's own stored
// revalidation OBSERVATIONS (0.8.163's own, plain, ordered array of 0.8.162's
// own observation records):
//
//   Alice's observation history          Bob's observation history
//        │                                          │
//        └──── "these differ somehow" ───────────────┘
//                  — but WHICH RECORDS, exactly, does
//                    each side have that the other lacks?
//
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceHistory, targetHistory)
//     -> { sourceCount, targetCount, sourceOnlyCount, targetOnlyCount,
//          sourceOnly, targetOnly, sameHistory }
//
// KEPT AT THE OBSERVATION-RECORD LEVEL — NEVER CANDIDATES, DECISIONS, PLAN
// IDENTITIES, OR `candidateMatchesPlan` COMPARED INDEPENDENTLY. Those facts
// are already embedded inside each 0.8.162 observation record; this file
// never reaches past an observation's own boundary to compare one of its
// embedded fields against the corresponding field of an unrelated
// observation on the other side. Two observations are compared as whole
// records, never field-by-field across records.
//
// COMPLETE STRUCTURAL OBSERVATION IDENTITY GOVERNS THE COMPARISON — THE
// MOST IMPORTANT DESIGN POINT, AND THE IDENTICAL DISCIPLINE 0.8.164'S OWN
// `canonicalObservationKey()` ALREADY HOLDS ONE PROJECTION OVER. An
// observation record's identity for this file's own purposes is its
// COMPLETE STRUCTURAL CONTENT:
//
//   observationIdentity = structural identity of
//       (decision, planIdentity, candidatePresent, candidateType,
//        candidateMatchesPlan, observedAt)
//
// So these are all mutually distinct:
//
//   same decision + same plan + observedAt T1
//   same decision + same plan + observedAt T2
//
//   same decision + plan A
//   same decision + plan B
//
//   same candidate + OBSERVE
//   same candidate + DEFER
//
// OBSERVATION IDENTITY IS NOT CANDIDATE IDENTITY, DECISION IDENTITY, OR PLAN
// IDENTITY — THE THREE INDEPENDENT IDENTITY LAYERS 0.8.153-0.8.165 EACH
// ALREADY ESTABLISH, PRESERVED HERE UNCHANGED. This file never deduplicates
// or matches by `decision` alone (0.8.149's own decision identity), by
// `decision.candidate` alone (0.8.144's own candidate identity), or by
// `planIdentity.planFingerprint` alone (0.8.160's own plan identity) — only
// the full six-field record, exactly as 0.8.164's own deduplication
// projection already establishes one projection over, is ever compared.
// Concretely, the flagship scenario below (Section G) demonstrates the
// consequence directly: candidate C1 exists on both sides, but its two
// histories still genuinely differ, because the SPECIFIC observations
// naming C1 differ.
//
// MULTISET DIFFERENCE, NEVER A SET DIFFERENCE — THE IDENTICAL DISCIPLINE
// 0.8.149'S OWN `extractUnmatched()` ALREADY HOLDS FOR DECISION RECORDS,
// HELD HERE AGAIN OVER OBSERVATION RECORDS. `[O1, O1, O2]` compared against
// `[O1, O2]` reports exactly one `O1` as source-only — the second `O1` has
// no counterpart left once the first has been matched — never zero (a naive
// "is O1 present in target?" check) and never two (a comparison that never
// consumes a match). This matters concretely here because 0.8.163
// intentionally preserves duplicate observations as separate historical
// facts, and 0.8.164's own deduplication projection is merely a separate,
// independent VIEW over those duplicates (see 0.8.164's own header,
// "Deliberately excluded," bullet three: "Difference between two histories,
// or between two deduplication projections... is 0.8.167's own... question"
// — misnumbered there; this file operates on the raw history, not on any
// deduplicated view, per "Architecture," below). This file must not
// silently normalize the underlying history by collapsing repeats before
// comparing.
//
// EACH RESULT ELEMENT IS THE ORIGINAL OBSERVATION RECORD ITSELF, NEVER A
// RECONSTRUCTED COPY. This mirrors 0.8.149's own departure from a rebuilt
// projection for the identical reason: a 0.8.162 observation record is
// already the exact, plain, frozen unit a caller would hand to a future
// synchronization/export step without any further transformation.
//
// ONLY GENUINE 0.8.162 `{ observed: true, decision, planIdentity,
// candidatePresent, candidateType, candidateMatchesPlan, observedAt }`
// RECORDS ARE EVER COMPARED — THE IDENTICAL TOLERANCE 0.8.163'S OWN
// `appendXxx()`, 0.8.164'S OWN DEDUPLICATION PROJECTION, AND 0.8.165'S OWN
// TIMELINE PROJECTION EACH ALREADY HOLD. Anything else in either input
// array — `undefined`, `null`, a genuine-looking
// `{ observed: false, outcome: 'INVALID_OBSERVATION' }` outcome, or any
// other malformed value — is silently excluded from both sides before
// comparison, never thrown on and never fabricated into a phantom entry.
//
// NO ORDERING, NO GROUPING, NO STATISTICS. `sourceOnly`/`targetOnly` are
// reported in each side's own original history order — oldest recorded
// first — never sorted by `observedAt` (that is 0.8.165's own, separately
// sized, already-answered question, deliberately not repeated here),
// grouped by candidate, decision, or plan, or reduced to a count of
// distinct observations (0.8.164's own, separately sized, already-answered
// question).
//
// NO LABEL OF "CONFLICTING," NO INTERPRETATION OF THE DIFFERENCE — THE
// IDENTICAL RESTRAINT 0.8.149'S OWN HEADER ALREADY HOLDS, HELD HERE AGAIN
// OVER OBSERVATIONS. The result carries no `inconsistent`, `conflicting`,
// `superseded`, `preferred`, `authoritative`, or `resolved` field or verb
// anywhere. The flagship scenario's own C1 — present on both sides, with
// genuinely different observation histories — is stated plainly as one
// exclusive record on each side; this file draws no conclusion about which
// side's observation of C1 matters, whether the disagreement needs
// resolving, or what happens next. That is a later, separately sized
// question this milestone does not answer.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock.
// Never mutates either input history or any record either one holds.
// Calling either function twice with equivalent arguments returns a
// byte-identical result.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference()`
// — THE IDENTICAL SPLIT 0.8.149'S OWN DECISION HISTORY DIFFERENCE AND
// 0.8.165'S OWN TIMELINE PROJECTION ALREADY HOLD.
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference()`
// is the pure computation, over two plain, in-memory observation-history
// arrays (0.8.163's own shape).
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference()`
// below REMAINS A THIN RECONSTRUCTION/COMPOSITION BOUNDARY, DELIBERATELY
// UNFINISHED — exactly like 0.8.165's own `reconstructXxx()`, and for the
// identical reason: no durable
// `reconciliationDecisionRevalidationObservationRecords`-shaped collection
// exists on `PublicationObservationArchive` yet (see 0.8.163's own header,
// "Deliberately excluded," bullet five: "Persistence... is 0.8.167's own...
// question"). So `reconstructXxx()` here ignores whatever `sourceArchive`/
// `targetArchive` it is handed — genuine, malformed, or absent alike — and
// always returns `describeXxx([], [])`, the empty-vs-empty difference (which
// reports `sameHistory: true`, never a throw). This is not a bug or a
// placeholder oversight; it is the honest, currently-true answer ("neither
// replica's archive yet durably holds any observation history to diff") and
// it is written so 0.8.167 has exactly one seam to widen on each side — swap
// each hardcoded `[]` for a real per-archive reconstruction call, exactly as
// 0.8.150 did for 0.8.149 — without touching `describeXxx()` or any caller
// already using it directly.
//
// MALFORMED INPUT DEGRADES TO THE EMPTY-VS-EMPTY DIFFERENCE — NEVER THROWS.
// `null`, `undefined`, a non-array, or an array containing entries that are
// not genuine 0.8.162 records are all tolerated exactly as 0.8.163's own
// `appendXxx()`, 0.8.164's own deduplication projection, and 0.8.165's own
// timeline projection already tolerate their own history argument:
// non-genuine entries are silently excluded, and an entirely malformed/
// absent history is treated as `[]` on that side alone.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS AT ALL, THE IDENTICAL BOUNDARY
// 0.8.164'S OWN DEDUPLICATION PROJECTION AND 0.8.165'S OWN TIMELINE
// PROJECTION ALREADY HOLD. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`
// (0.8.162),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`
// (0.8.163),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView.js`
// (0.8.164),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimelineView.js`
// (0.8.165), any decision or decision-history module, any revalidation or
// plan-identity module, or any archive module — it trusts nothing about how
// an observation record was produced beyond its own documented shape, and
// never calls 0.8.165, 0.8.164, 0.8.163, 0.8.162, or anything earlier to
// re-derive or double-check anything. DELIBERATELY, THIS FILE DOES NOT
// DEPEND ON 0.8.164 OR 0.8.165: difference operates on the raw, append-only
// history exactly as 0.8.163 produces it, never on 0.8.164's own
// first-appearance-deduplicated view (which would silently destroy the
// multiplicity this file's own multiset semantics exist to preserve) and
// never on 0.8.165's own chronologically reordered view (which would
// silently import an ordering this file never asserts). Each of the three
// — deduplication, timeline, difference — remains an independent projection
// of the identical underlying history:
//
//                     Observation History
//                            │
//              ┌─────────────┼─────────────┐
//              ▼             ▼             ▼
//           0.8.164       0.8.165        0.8.166
//        Deduplication    Timeline       Difference
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any export, import, or application of the exclusive observations
//   found.** `sourceOnly`/`targetOnly` are read-only facts about the
//   difference; folding either side's exclusive observations into the
//   other history is a future milestone's own, separately sized, later
//   question, never built here.
// - **Any interpretation of a difference as a conflict, inconsistency, or
//   need for resolution.** See "No label of 'conflicting,'" above.
// - **Deduplication of any kind.** See "Multiset difference, never a set
//   difference," above — identical observations remain separate entries,
//   always.
// - **Comparing candidates, decisions, plan identities, or
//   `candidateMatchesPlan` independently of the observation record that
//   embeds them.** See "Kept at the observation-record level," above.
// - **Any reconciliation ACTION, applying anything, or execution of any
//   kind.** See 0.8.162's/0.8.163's/0.8.164's/0.8.165's own headers — this
//   file inherits that boundary for free by never introducing action
//   vocabulary of its own.
// - **Persistence or synchronization of any kind.** Each history is an
//   in-memory array handed in and read, exactly like 0.8.163's own
//   `history` argument; durable archive integration is 0.8.167's own,
//   separately sized, later question — see "The identical split," above,
//   for `reconstructXxx()`'s own thin, deliberately unfinished boundary in
//   the meantime.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceHistory = [], targetHistory = []) {
    const source = (Array.isArray(sourceHistory) ? sourceHistory : []).filter(isGenuineObservation);
    const target = (Array.isArray(targetHistory) ? targetHistory : []).filter(isGenuineObservation);

    const sourceOnly = extractUnmatched(source, target);
    const targetOnly = extractUnmatched(target, source);

    return Object.freeze({
        sourceCount: source.length,
        targetCount: target.length,
        sourceOnlyCount: sourceOnly.length,
        targetOnlyCount: targetOnly.length,
        sourceOnly: Object.freeze(sourceOnly),
        targetOnly: Object.freeze(targetOnly),
        sameHistory: sourceOnly.length === 0 && targetOnly.length === 0
    });
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference()
// — see this file's own header, "The identical split," above. Both
// `sourceArchive` and `targetArchive` are deliberately ignored: no durable
// observation-history collection exists on `PublicationObservationArchive`
// yet, so this always returns the empty-vs-empty difference
// (`sameHistory: true`), never a throw, regardless of what either argument
// is handed.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference(sourceArchive, targetArchive) {
    void sourceArchive;
    void targetArchive;
    return describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference([], []);
}

// The multiset (bag) subtraction `from - against`, preserving
// multiplicity — see this file's own header, "Multiset difference, never a
// set difference." Each record in `against` cancels out AT MOST ONE
// occurrence in `from`, matched by exact observation identity
// (`canonicalObservationKey()`, below) — never by a narrower per-candidate,
// per-decision, or per-plan key. Returns the unmatched records themselves —
// the original observation record objects, never a reconstructed copy — in
// `from`'s own original order.
function extractUnmatched(from, against) {
    const remaining = new Map();
    for (const record of against) {
        const key = canonicalObservationKey(record);
        remaining.set(key, (remaining.get(key) || 0) + 1);
    }

    const unmatched = [];
    for (const record of from) {
        const key = canonicalObservationKey(record);
        const count = remaining.get(key) || 0;
        if (count > 0) {
            remaining.set(key, count - 1);
        } else {
            unmatched.push(record);
        }
    }
    return unmatched;
}

// Complete structural observation identity — decision + planIdentity +
// candidatePresent + candidateType + candidateMatchesPlan + observedAt —
// duplicated from 0.8.164's own `canonicalObservationKey()` for the
// identical reason this whole family already duplicates it: this file must
// apply the exact same identity rule without importing a module that itself
// carries decision/plan/history vocabulary. Never decision identity,
// candidate identity, or plan identity alone — see this file's own header,
// "Observation identity is not candidate identity, decision identity, or
// plan identity."
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
// 0.8.164's/0.8.165's own private genuineness check for the identical
// reason those files each duplicate it: this file must apply the exact
// same rule without importing a module that itself carries decision/plan/
// archive vocabulary.
function isGenuineObservation(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.observed === true
        && typeof entry.observedAt === 'string'
    );
}
