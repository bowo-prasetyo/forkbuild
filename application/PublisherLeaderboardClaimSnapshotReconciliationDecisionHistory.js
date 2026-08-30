// 0.8.146 — Reconciliation Decision History.
//
// 0.8.145 answered "given a genuinely-selected candidate and an explicit
// disposition, does a durable decision RECORD result?" and stopped at
// exactly one record, handed back to the caller, who decides whether and
// how to keep it — see that file's own header, "Deliberately excluded,"
// bullet three. This file is the first to keep more than one: an
// append-only collection of 0.8.145's own decision records, mirroring
// `application/LeaderboardClaimHistory.js` (0.8.123) exactly, one
// relationship over:
//
//   []
//     │  appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, decisionA)
//     ▼
//   [decisionA]
//     │  appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, decisionB)
//     ▼
//   [decisionA, decisionB]
//
// APPENDED TO, NEVER OVERWRITTEN, NEVER MUTATED, NEVER REORDERED OR
// DEDUPLICATED — MULTIPLICITY IS PRESERVED, EXACTLY AS `LeaderboardClaimHistory.js`'s
// OWN HEADER ALREADY ESTABLISHES ONE RELATIONSHIP OVER. Recording the
// byte-identical decision twice — OBSERVE on Claim B against Snapshot S2 at
// the identical `decidedAt`, called twice, whether by the same caller or by
// two independent callers who each reached the identical conclusion — is
// TWO independent history entries here, never collapsed into "one
// decision, made twice." This file draws the identical distinction this
// whole family already holds one relationship down: `receipt identity !=
// claim identity` (`LeaderboardClaimHistory.js`'s own header) becomes
// `decision history entry != reconciliation candidate` here. Deduplicating
// is real, separately sized, later work — this file never attempts it.
//
// ONLY A GENUINE 0.8.145 `{ decided: true, ... }` RESULT IS EVER APPENDED —
// AN INVALID SELECTION OR DECISION WAS ALREADY "NO DECISION RECORD OF ANY
// KIND" AT 0.8.145's OWN BOUNDARY, AND THIS FILE HOLDS THAT LINE RATHER
// THAN RE-OPENING IT. Appending `undefined`, `null`, or any object whose
// own `decided` is not strictly `true` (including a genuine-looking
// `{ decided: false, outcome: 'INVALID_SELECTION' }`) is a no-op that still
// returns a frozen copy of `history`, unchanged — never a thrown error,
// and never a fabricated entry recording a decision that never happened.
//
// LOOKUP IS BY EXPLICIT FIELD, NEVER BY RESEMBLANCE — AND NEVER A TRUST OR
// RESOLUTION DECISION. The three `findXxx()` functions below each answer a
// narrow, factual question over the history exactly as recorded — never
// "has this candidate been resolved," "is this decision still pending," or
// any other interpreted state. See "Deliberately excluded," below.
//
// - `findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByClaimId()`
//   returns every entry whose own `candidate.claimId` is exactly this
//   `claimId` — this matches a `DIVERGENT_CORRESPONDENCE` or
//   `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT` candidate (both carry a
//   `claimId`, 0.8.144's own shape) and never a
//   `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM` candidate (which carries no
//   `claimId` field at all, see 0.8.144's own header, "Fields that don't
//   exist are never invented").
// - `findPublisherLeaderboardClaimSnapshotReconciliationDecisionsBySnapshotIndex()`
//   returns every entry whose own `candidate.snapshotIndex` is exactly this
//   `snapshotIndex` — this matches a `DIVERGENT_CORRESPONDENCE` or
//   `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM` candidate, and never a
//   `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT` candidate, for the identical
//   reason.
// - `findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByDisposition()`
//   returns every entry whose own `decision` is exactly this disposition
//   string (`'OBSERVE'` or `'DEFER'` — 0.8.145's own, unchanged, two-value
//   vocabulary; any other string simply matches nothing, since no genuine
//   entry could ever carry it).
//
// EVERY LOOKUP RETURNS RESULTS IN THE EXACT ORDER `history` ALREADY HOLDS
// THEM — oldest recorded first, never sorted, grouped, or ranked by any
// field. If two entries tie on the field being searched, their relative
// order in the returned list is the same relative order they hold in
// `history` itself.
//
// A CLAIM THAT DIVERGES AGAINST TWO SUPPLIED SNAPSHOTS PRODUCES TWO
// SEPARATE HISTORY ENTRIES ON DIFFERENT SEARCHES — NEVER ONE MERGED
// ANSWER. 0.8.145's own FLAGSHIP (Claim B decided DEFER against Snapshot
// S2, decided OBSERVE against Snapshot S3) means
// `findByClaimId(history, B)` returns both entries side by side, each with
// its own `candidate.snapshotIndex` and its own `decision` — this file
// never collapses them into "what was decided about B," because no single
// answer to that question exists; the two decisions concern two distinct
// candidates that both happen to name the same claim.
//
// NO "RESOLVED", "PENDING", "STALE", "APPROVED", OR "REJECTED" — THIS
// MILESTONE INTRODUCES NO INTERPRETED STATE OF ANY KIND. The history
// itself states only what was recorded and when, in the exact order it
// was recorded — never whether a candidate "has been decided on" (a
// question this file could technically answer via `findByClaimId().length
// > 0`, but does not, because the moment that becomes a named function or
// a field on this file's own result, it starts asserting an opinion about
// completeness or currency this milestone does not hold). Answering "has
// this candidate ever received a decision," a decision count, a distinct-
// candidate count, or any other aggregate is a later projection's own,
// separately sized question — see "Deliberately excluded," below.
//
// PROVENANCE: NONE. This milestone does not introduce an `origin` field or
// any other provenance vocabulary — 0.8.145's own decision record carries
// none, and this file embeds that record by value, unchanged. A future
// milestone that needs provenance can add an explicit `origin` field
// reusing this codebase's own existing vocabulary (see
// `application/LeaderboardClaimRecord.js`'s own
// `PublicationObservationArchiveProvenanceOrigin`) if and when a genuine
// need for it exists — this file does not anticipate that need.
//
// SYNCHRONOUS, PURE, DETERMINISTIC, SELF-CONTAINED. Reads no clock, touches
// no network, no storage, no verifier, and mutates neither `history` nor
// the decision record handed to `appendXxx()`. Calling any function here
// twice with equivalent arguments returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — NO IMPORTS AT ALL. This file imports nothing
// from `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`
// or any other module in this family — it trusts nothing about how a
// decision record was produced beyond its own documented shape (`{
// decided: true, candidate, decision, decidedAt }`), and never calls
// 0.8.145, 0.8.144, or 0.8.143 to re-derive or double-check anything.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Deduplication of any kind.** See "Appended to, never overwritten,"
//   above — identical decisions remain separate entries, always.
// - **"Resolved"/"pending"/"stale"/"approved"/"rejected", or any other
//   interpreted state.** See "No 'resolved,' 'pending,' 'stale,'" above.
// - **Decision counts, distinct-candidate counts, per-disposition counts,
//   or any other aggregate/statistics projection.** That is 0.8.147's own,
//   separately sized, later question.
// - **A timeline, ordering-by-decidedAt, or any chronological
//   re-derivation.** Entries are returned in `history`'s own insertion
//   order only; re-ordering by `decidedAt` is a later projection's own
//   question (0.8.148).
// - **Any reconciliation ACTION, applying anything, or execution of any
//   kind.** See 0.8.145's own header — this file inherits that boundary
//   for free by never introducing action vocabulary of its own.
// - **Mutating `claimHistory`, a snapshot, the reconciliation plan, or the
//   archive.** No argument to any function here is anything from those
//   families, and this file never reaches for one.
// - **Persistence or synchronization of any kind.** `history` is an
//   in-memory array handed in and handed back, exactly like
//   `LeaderboardClaimHistory.js`'s own `history` argument.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(history, decision) {
    const existing = Array.isArray(history) ? history : [];
    if (!decision || typeof decision !== 'object' || decision.decided !== true) {
        return Object.freeze(existing.slice());
    }
    return Object.freeze([...existing, decision]);
}

// Every entry in `history` whose own `candidate.claimId` is exactly this
// `claimId` — matches a `DIVERGENT_CORRESPONDENCE` or
// `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT` entry, never a
// `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM` entry (no `claimId` field exists
// on that shape at all).
export function findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByClaimId(history, claimId) {
    const list = Array.isArray(history) ? history : [];
    if (!claimId || typeof claimId !== 'string') return Object.freeze([]);
    return Object.freeze(list.filter((entry) => (
        entry && entry.decided === true && entry.candidate && entry.candidate.claimId === claimId
    )));
}

// Every entry in `history` whose own `candidate.snapshotIndex` is exactly
// this `snapshotIndex` — matches a `DIVERGENT_CORRESPONDENCE` or
// `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM` entry, never a
// `CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT` entry (no `snapshotIndex` field
// exists on that shape at all).
export function findPublisherLeaderboardClaimSnapshotReconciliationDecisionsBySnapshotIndex(history, snapshotIndex) {
    const list = Array.isArray(history) ? history : [];
    if (typeof snapshotIndex !== 'number' || !Number.isInteger(snapshotIndex)) return Object.freeze([]);
    return Object.freeze(list.filter((entry) => (
        entry && entry.decided === true && entry.candidate && entry.candidate.snapshotIndex === snapshotIndex
    )));
}

// Every entry in `history` whose own `decision` is exactly this
// disposition string — 0.8.145's own, unchanged, two-value vocabulary
// (`'OBSERVE'`/`'DEFER'`). Any other string simply matches nothing, since
// no genuine entry could ever carry it.
export function findPublisherLeaderboardClaimSnapshotReconciliationDecisionsByDisposition(history, disposition) {
    const list = Array.isArray(history) ? history : [];
    if (!disposition || typeof disposition !== 'string') return Object.freeze([]);
    return Object.freeze(list.filter((entry) => (
        entry && entry.decided === true && entry.decision === disposition
    )));
}
