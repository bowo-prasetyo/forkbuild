import { reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js';

// 0.8.165 — Revalidation Observation History Timeline Projection.
//
// 0.8.163 keeps an append-only history of 0.8.162's own observation
// records, in insertion order only, deliberately never chronologically
// reordered (see its own header, "Deliberately excluded," bullet three:
// "A timeline, ordering-by-`observedAt`, or any chronological
// re-derivation... is a later projection's own question (0.8.165)"). This
// file is that projection, and nothing more — the observation-history
// analogue of
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryTimelineView.js`
// (0.8.148), one subject over: where that file narrates a replica's own
// stored reconciliation DECISIONS in chronological order, this file
// narrates a replica's own stored revalidation OBSERVATIONS (0.8.163's own,
// plain, ordered array of 0.8.162's own observation records) in
// chronological order:
//
//   0.8.148 decision history timeline    0.8.165 observation history timeline
//
//   describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(history)
//     -> { observationCount,
//          timeline: [{ observationIndex, observedAt, decision, planIdentity,
//                        candidatePresent, candidateType, candidateMatchesPlan }, ...] }
//
// THE QUESTION IS "IN WHAT CHRONOLOGICAL ORDER WERE THESE REVALIDATION
// OBSERVATIONS RECORDED?" — NEVER "WHICH OBSERVATION IS CURRENT, CORRECT,
// OR SUPERSEDED?" This is the identical boundary 0.8.148's own header
// already holds one relationship over, held here again over observations
// instead of decisions — see that file's own header, "The question is,"
// and "This is a narration, never a state machine."
//
// THE TIMELINE ORDERS BY `observedAt`, THE ONLY MEANINGFUL TEMPORAL FIELD
// AN OBSERVATION RECORD CARRIES. A 0.8.162 observation record carries
// exactly one clock-shaped fact — `observedAt`, explicitly supplied by the
// caller who made the observation (see 0.8.162's own header, "`observedAt`
// is an explicit, caller-supplied fact"). Entries are ordered by:
//
//   1. `observedAt` ascending
//   2. original `history` array position, ascending, as the tie-break
//
// and by nothing else. `decision`, `planIdentity`, `candidateType`, and
// `candidateMatchesPlan` are NEVER tie-breaks, and no comparison anywhere in
// this file is locale-dependent. Concretely, four observations recorded (in
// that append order) as
//
//   D1 @ T3,  D2 @ T1,  D3 @ T3,  D4 @ T2
//
// produce the timeline D2, D4, D1, D3 — exactly this milestone's own worked
// example — with D1 before D3 because D1 appeared first in `history`, the
// identical reasoning 0.8.148's own header already gives for why
// history-array position, not any other field, is the tie-break: two
// observations can legitimately share the identical `observedAt`, and the
// order `history` itself already holds them in (oldest appended first, per
// 0.8.163's own append-only discipline) is the one order this file has that
// carries no invented meaning.
//
// MULTIPLICITY IS PRESERVED — THE SAME RESTRAINT EVERY FILE IN THIS FAMILY
// ALREADY HOLDS, HELD HERE AGAIN OVER CHRONOLOGY. Recording the
// byte-identical observation twice (the same decision, checked against the
// same plan, at the same `observedAt`, appended twice) produces TWO
// timeline entries, never collapsed into one — this file draws the
// identical distinction 0.8.163's own header already holds ("Appended to,
// never overwritten, never mutated, never reordered or deduplicated") and
// 0.8.164's own deduplication projection already keeps entirely separate
// from this one (see this file's own header, "Architecture," below, and
// 0.8.164's own header, "Deliberately excluded," bullet two: "Timeline,
// chronological ordering... is 0.8.166's own... question" — misnumbered
// there for 0.8.165, corrected here). Different `observedAt` values, even
// with every other field identical, remain two separate historical events,
// never merged. Two observations sharing everything, including
// `observedAt`, remain two separate entries — chronology here answers only
// "in what order," never "how many distinct."
//
// EACH ENTRY PRESERVES THE OBSERVATION'S OWN SEMANTIC FIELDS — NO NEW
// INTERPRETATION, NO MANUFACTURED `observed` FIELD. A timeline entry is
// `{ observationIndex, observedAt, decision, planIdentity, candidatePresent,
// candidateType, candidateMatchesPlan }` — 0.8.162's own record fields,
// carried through unchanged, plus `observationIndex` (this entry's own
// position within `timeline`, 0-based, distinct from — and never confused
// with — `history`'s own original array position). This file never adds an
// `observed: true` field to an entry: every genuine entry in a timeline
// produced by this file is, by construction, a genuine observation, so
// restating that fact on every entry would only ever be true and would add
// nothing an entry's own presence in the timeline doesn't already say.
//
// CANDIDATE IDENTITY REMAINS UNTOUCHED — NO REGROUPING BY CANDIDATE. This
// file never groups, merges, or deduplicates entries by
// `decision.candidate`, `candidateType`, or any candidate-shaped field; a
// later projection over candidate identity, if one is ever wanted, is
// separate, later work this file does not anticipate or build toward.
//
// PLAN IDENTITY REMAINS OBSERVATIONAL — NO ASSERTION OF NEWNESS,
// AUTHORITY, OR PREFERENCE. Two observations carrying two different
// `planIdentity.planFingerprint` values simply appear, each in its own
// chronological place, as two separately recorded facts. This file never
// states or implies that either plan is newer, better, more authoritative,
// more current, or more trustworthy than the other — see "No
// state-machine vocabulary," below.
//
// NO STATE-MACHINE VOCABULARY — NEVER "CURRENT," "LATEST," "STALE,"
// "SUPERSEDED," "RESOLVED," "PENDING," "REVERTED," "CORRECTED," OR
// "VALID"/"INVALID" (beyond 0.8.162's own reserved `INVALID_OBSERVATION`
// input-validation literal, never repeated here since malformed entries are
// silently excluded rather than reported). This file answers only WHEN an
// observation was recorded and WHAT it contained — never what should be
// concluded from its place in the sequence.
//
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline()`/
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline()`
// — THE IDENTICAL SPLIT 0.8.148'S OWN TIMELINE PROJECTION ALREADY HOLDS.
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline()`
// is the pure computation, over one plain, in-memory observation-history
// array (0.8.163's own shape).
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline()`
// below now READS `history` FROM `PublicationObservationArchive`'S OWN
// `revalidationObservationRecords` COLLECTION (0.8.167), via `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js`'s
// own `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()`
// — the ONE seam that reads the archive, exactly the promise this file's
// own header already made about a future integration ("it is written so
// 0.8.167 has exactly one seam to widen"), now kept the identical way
// 0.8.150 already kept it for 0.8.148's own `reconstructXxx()`.
// `describeXxx()` itself, and every caller already using it directly, are
// UNCHANGED by this widening.
//
// SYNCHRONOUS, PURE, NO MUTATION, NO STORAGE, NO NETWORK. Reads no clock —
// `observedAt` is read from each stored record, never generated. Never
// mutates the input history or any entry it holds. Returns frozen objects
// and a frozen array throughout. Calling either function twice with a
// byte-identical argument returns a byte-identical result.
//
// MALFORMED INPUT DEGRADES TO AN EMPTY TIMELINE — NEVER THROWS. `null`,
// `undefined`, a non-array, or an array containing entries that are not
// genuine `{ observed: true, decision, planIdentity, candidatePresent,
// candidateType, candidateMatchesPlan, observedAt }` records are all
// tolerated exactly as 0.8.163's own `appendXxx()` and 0.8.164's own
// `describeXxx()` already tolerate their own history argument: non-genuine
// entries are silently excluded, and an entirely malformed/absent history
// produces an empty, frozen `timeline` array and `observationCount` 0. A
// genuine entry whose own `observedAt` cannot be parsed into a valid
// timestamp is excluded the same way — 0.8.162 never produces such a
// record, but this file never trusts that invariant blindly.
//
// ARCHITECTURAL BOUNDARY — EXACTLY ONE IMPORT, THE 0.8.167 ARCHIVE
// RECONSTRUCTION SEAM, THE IDENTICAL BOUNDARY 0.8.164'S OWN DEDUPLICATION
// PROJECTION NOW ALSO HOLDS. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`
// (0.8.162),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js`
// (0.8.163),
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView.js`
// (0.8.164), any decision or decision-history module, or
// `PublicationObservationArchive.js` itself — it trusts nothing about how
// an observation record was produced beyond its own documented shape, and
// never calls 0.8.164, 0.8.163, 0.8.162, or anything earlier to re-derive
// or double-check anything. DELIBERATELY, THIS FILE DOES NOT DEPEND ON
// 0.8.164: deduplication and chronology are independent projections of the
// identical history, and making the timeline consume the deduplicated
// output would silently destroy the very multiplicity "Multiplicity is
// preserved," above, exists to keep. `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline()`
// itself still imports nothing and still trusts nothing about how its own
// `history` argument was produced; the one import above is used ONLY by
// `reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline()`.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Any interpretation of order as supersession, resolution, or
//   correctness.** See "No state-machine vocabulary," above.
// - **Deduplication of any kind.** See "Multiplicity is preserved," above
//   — identical observations remain separate entries, always. That is
//   0.8.164's own, already-built, separately sized question, and this file
//   never consumes its output.
// - **Regrouping by candidate identity, decision identity, or plan
//   fingerprint.** See "Candidate identity remains untouched," above — a
//   later projection, if one is ever wanted, is separate work this file
//   does not anticipate.
// - **Difference between two observation histories.** That is 0.8.166's
//   own, already-built question.
// - **Persisting this projection's own OUTPUT.** `reconstructXxx()` reads
//   the archive's own raw observation history and recomputes this timeline
//   fresh every call — the timeline RESULT itself is never written back to
//   `PublicationObservationArchive`, exactly as 0.8.148's own timeline
//   result never is.
// - **Any reconciliation ACTION, applying anything, or execution of any
//   kind.** See 0.8.162's/0.8.163's own headers — this file inherits that
//   boundary for free by never introducing action vocabulary of its own.
// - **Automatic, periodic, or background computation of any kind.** These
//   functions run only when a caller explicitly calls them.
export function describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(history) {
    const list = Array.isArray(history) ? history : [];
    const indexed = [];
    for (let position = 0; position < list.length; position += 1) {
        const observation = list[position];
        if (!isGenuineObservation(observation)) continue;
        const observedAtMs = Date.parse(observation.observedAt);
        if (Number.isNaN(observedAtMs)) continue;
        indexed.push({ observation, position, observedAtMs });
    }

    indexed.sort((a, b) => {
        const observedAtDelta = a.observedAtMs - b.observedAtMs;
        if (observedAtDelta !== 0) return observedAtDelta;
        return a.position - b.position;
    });

    const timeline = indexed.map(({ observation }, observationIndex) => buildTimelineEntry(observation, observationIndex));

    return Object.freeze({
        observationCount: timeline.length,
        timeline: Object.freeze(timeline)
    });
}

// reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline()
// — see this file's own header, "The identical split," above. An
// invalid/missing `archive` degrades to `PublicationObservationArchive.empty()`
// by way of the reconstruction seam it calls, which in turn produces the
// empty history's empty timeline — never a throw.
export function reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(archive) {
    return describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimeline(
        reconstructPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(archive)
    );
}

// A genuine 0.8.162 observation record — duplicated from 0.8.163's/0.8.164's
// own private genuineness check for the identical reason those files each
// duplicate it: this file must apply the exact same rule without importing
// a module that itself carries decision/plan/archive vocabulary.
function isGenuineObservation(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.observed === true
        && typeof entry.observedAt === 'string'
    );
}

// One timeline entry, preserving the observation's own semantic fields
// unchanged — see this file's own header, "Each entry preserves the
// observation's own semantic fields," above. `observationIndex` is this
// entry's own 0-based position within the timeline being built, distinct
// from `history`'s own original array position.
function buildTimelineEntry(observation, observationIndex) {
    return Object.freeze({
        observationIndex,
        observedAt: observation.observedAt,
        decision: observation.decision,
        planIdentity: observation.planIdentity,
        candidatePresent: observation.candidatePresent,
        candidateType: observation.candidateType,
        candidateMatchesPlan: observation.candidateMatchesPlan
    });
}
