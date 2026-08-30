// 0.8.163 — Historical Decision Revalidation Observation History.
//
// 0.8.162 recorded a single, explicit revalidation OBSERVATION — one call,
// one frozen record — and stopped there on purpose (see its own header,
// "A history of observations, or any projection over many observations at
// once... is separate, later work (0.8.163, per this milestone's own
// request), never built here"). This file is the first to keep more than
// one: an append-only collection of 0.8.162's own observation records,
// mirroring `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js`
// (0.8.146) exactly, one subject over — where that file holds a history of
// DECISIONS, this file holds a history of OBSERVATIONS about decisions:
//
//   0.8.145 decision record        0.8.146 decision history
//   0.8.162 observation record   ★ 0.8.163 observation history
//
//   []
//     │  appendXxxHistoryEntry(history, O1)
//     ▼
//   [O1]
//     │  appendXxxHistoryEntry(history, O2)
//     ▼
//   [O1, O2]
//
// APPENDED TO, NEVER OVERWRITTEN, NEVER MUTATED, NEVER REORDERED OR
// DEDUPLICATED — THE IDENTICAL DISCIPLINE 0.8.146'S OWN HEADER ALREADY
// HOLDS ONE RELATIONSHIP OVER. Recording the byte-identical observation
// twice — the same decision, checked against the same plan, at the same
// `observedAt`, called twice — is TWO independent history entries here,
// never collapsed into "one observation, made twice." Multiplicity is
// meaningful at this layer, exactly as it already is at 0.8.146's own: an
// `O1`/`O1`/`O1` sequence of three explicit calls produces a three-entry
// history. Deduplicating is real, separately sized, later work — this file
// never attempts it.
//
// ONLY A GENUINE 0.8.162 `{ observed: true, ... }` RESULT IS EVER APPENDED
// — AN INVALID OBSERVATION WAS ALREADY "NO OBSERVATION RECORD OF ANY KIND"
// AT 0.8.162'S OWN BOUNDARY, AND THIS FILE HOLDS THAT LINE RATHER THAN
// RE-OPENING IT. Appending `undefined`, `null`, or any object whose own
// `observed` is not strictly `true` (including a genuine-looking
// `{ observed: false, outcome: 'INVALID_OBSERVATION' }`) is a no-op that
// still returns a frozen copy of `history`, unchanged — never a thrown
// error, and never a fabricated entry recording an observation that never
// happened. This file re-validates nothing deeper than that one flag,
// exactly as 0.8.146 trusts 0.8.145's own `decided` flag and nothing
// deeper.
//
// THREE INDEPENDENT IDENTITIES, NEVER COLLAPSED — DECISION IDENTITY,
// CANDIDATE IDENTITY, PLAN IDENTITY. An observation's `decision` field
// (0.8.145's own record, embedded unchanged by 0.8.161/0.8.162) carries a
// candidate; its `planIdentity` field (0.8.160's own fingerprint, embedded
// unchanged) names a plan; the two vary independently of one another, and
// of the decision's own disposition/`decidedAt`. So `D1+C1+PlanA`,
// `D1+C1+PlanB`, and `D2+C1+PlanA` are three mutually distinct historical
// observations, never merged into "observations about D1" or
// "observations about C1" — each lookup below answers exactly the one
// question its own name states, no more.
//
// LOOKUP IS BY EXACT STRUCTURAL FIELD MATCH, NEVER BY RESEMBLANCE, AND
// NEVER A TRUST OR INTERPRETATION DECISION.
// - `findXxxByPlanFingerprint()` returns every entry whose own
//   `planIdentity.planFingerprint` is exactly this fingerprint — regardless
//   of candidate presence, decision disposition, or `observedAt`.
// - `findXxxByDecisionId()` returns every entry whose own `decision`
//   carries the identical DECISION IDENTITY as the supplied `decisionId`
//   — `decisionIdentity = structural identity of (candidate, decision,
//   decidedAt)`, the exact vocabulary already established by
//   `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js`
//   (0.8.149) and reused here unchanged, via the identical canonical-key
//   technique (duplicated, not imported — see "Architectural boundary,"
//   below). `decisionId` is a decision-shaped object — typically the exact
//   0.8.145 record an observation's own `decision` field already embeds —
//   compared by content, never by object identity or array position. This
//   never matches by candidate alone: two decisions sharing the identical
//   candidate but differing in `decision` or `decidedAt` remain two
//   separate decision identities, and a search for one never returns the
//   other's observations.
// - `findXxxByCandidateType()` returns every entry whose own
//   `candidateType` is exactly this string — one of 0.8.144's own three,
//   closed candidate types (`DIVERGENT_CORRESPONDENCE`,
//   `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT`,
//   `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM`); any other string simply
//   matches nothing, since no genuine entry could ever carry it. This file
//   introduces no `UNKNOWN` or synthetic fourth category.
//
// EVERY LOOKUP RETURNS RESULTS IN THE EXACT ORDER `history` ALREADY HOLDS
// THEM — oldest recorded first, never sorted, grouped, or ranked by any
// field, mirroring 0.8.146's own identical restraint.
//
// NO "RESOLVED"/"STALE"/"CURRENT", NO STATISTICS, NO TIMELINE, NO
// DIFFERENCE, NO SYNCHRONIZATION, NO ARCHIVE INTEGRATION — THIS MILESTONE
// INTRODUCES NO INTERPRETED STATE AND NO AGGREGATE OF ANY KIND. The
// history states only what was explicitly observed and in what order it
// was recorded. "How many observations were made against plan X" (a
// question this file could technically answer via
// `findXxxByPlanFingerprint(history, x).length`, but does not, because the
// moment that becomes a named field or function here, it starts asserting
// an opinion about counting or aggregation this milestone does not hold)
// is 0.8.164's own, separately sized, later question — see "Deliberately
// excluded," below.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED. Reads no clock, touches
// no network, no storage, no verifier, and mutates neither `history` nor
// the observation record handed to `appendXxx()`. Calling any function
// here twice with equivalent arguments returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS AT ALL. This file imports nothing
// from `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`
// (0.8.162), any decision or decision-history module, any revalidation or
// plan-identity module, or any archive module — it trusts nothing about
// how an observation record was produced beyond its own documented shape
// (`{ observed: true, decision, planIdentity, candidatePresent,
// candidateType, candidateMatchesPlan, observedAt }`), and never calls
// 0.8.161, 0.8.160, 0.8.158, 0.8.157, or 0.8.145 to re-derive or
// double-check anything.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Deduplication of any kind.** See "Appended to, never overwritten,"
//   above — identical observations remain separate entries, always.
// - **Observation counts, distinct-plan counts, per-candidate-type counts,
//   or any other aggregate/statistics projection.** That is 0.8.164's own,
//   separately sized, later question.
// - **A timeline, ordering-by-`observedAt`, or any chronological
//   re-derivation.** Entries are returned in `history`'s own insertion
//   order only; re-ordering by `observedAt` is a later projection's own
//   question (0.8.165).
// - **Difference between two observation histories.** That is 0.8.166's
//   own, separately sized, later question.
// - **Persistence, synchronization, or `PublicationObservationArchive`
//   integration of any kind.** `history` is an in-memory array handed in
//   and handed back, exactly like 0.8.146's own `history` argument;
//   integrating it into the archive is 0.8.167's own, separately sized,
//   later question.
// - **Interpreting `candidateMatchesPlan`, reconstructing a plan, or
//   generating a new decision.** This file introduces no vocabulary of its
//   own beyond append and exact-field lookup.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(history, observation) {
    const existing = Array.isArray(history) ? history : [];
    if (!observation || typeof observation !== 'object' || observation.observed !== true) {
        return Object.freeze(existing.slice());
    }
    return Object.freeze([...existing, observation]);
}

// Every entry in `history` whose own `planIdentity.planFingerprint` is
// exactly this `planFingerprint` — regardless of candidate presence,
// decision disposition, or `observedAt`.
export function findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByPlanFingerprint(history, planFingerprint) {
    const list = Array.isArray(history) ? history : [];
    if (!planFingerprint || typeof planFingerprint !== 'string') return Object.freeze([]);
    return Object.freeze(list.filter((entry) => (
        entry && entry.observed === true && entry.planIdentity && entry.planIdentity.planFingerprint === planFingerprint
    )));
}

// Every entry in `history` whose own `decision` carries the identical
// decision identity — structural identity of (candidate, decision,
// decidedAt) — as the supplied `decisionId`. Never matches by candidate
// alone: a decision sharing the identical candidate but a different
// disposition or `decidedAt` is a different decision identity.
export function findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByDecisionId(history, decisionId) {
    const list = Array.isArray(history) ? history : [];
    if (decisionId === null || typeof decisionId !== 'object' || Array.isArray(decisionId)) return Object.freeze([]);
    const key = canonicalDecisionKey(decisionId);
    return Object.freeze(list.filter((entry) => (
        entry && entry.observed === true && entry.decision && canonicalDecisionKey(entry.decision) === key
    )));
}

// Every entry in `history` whose own `candidateType` is exactly this
// string — one of 0.8.144's own three, closed candidate types. Any other
// string simply matches nothing, since no genuine entry could ever carry
// it; this file introduces no `UNKNOWN` or synthetic fourth category.
export function findPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationsByCandidateType(history, candidateType) {
    const list = Array.isArray(history) ? history : [];
    if (!candidateType || typeof candidateType !== 'string') return Object.freeze([]);
    return Object.freeze(list.filter((entry) => (
        entry && entry.observed === true && entry.candidateType === candidateType
    )));
}

// Decision identity, duplicated from 0.8.149's own `canonicalDecisionKey()`
// for the identical reason this whole family already duplicates it: a
// decision record's identity for lookup purposes is its complete
// structural content — candidate + decision + decidedAt — never `decided`
// itself (always `true` on any genuine record) and never anything this
// file infers about the record beyond those three fields.
function canonicalDecisionKey(record) {
    return JSON.stringify({ candidate: record.candidate, decision: record.decision, decidedAt: record.decidedAt });
}
