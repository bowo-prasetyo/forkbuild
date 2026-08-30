import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory.js';

// 0.8.168 — Portable Revalidation Observation History Exchange.
//
// 0.8.167 gave a replica a durable, archive-backed home for its own
// revalidation observations, but never let one replica hand its history to
// another — the identical gap 0.8.150 once left for reconciliation
// decisions, closed one milestone later by 0.8.151's own `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange.js`.
// This file is that same missing step, one subject over — a whole
// `PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory`
// (0.8.163's own plain, ordered array of 0.8.162's own observation records)
// instead of a decision history:
//
//   Alice's replica                                Carol's replica
//
//   history (0.8.163, UNCHANGED)
//      │  exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()
//      ▼
//   a JSON payload  ──────────────────────────────►  importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()
//                                                            │
//                                                            ▼
//                                                     validated observation records,
//                                                     each structurally checked —
//                                                     NEVER re-evaluated
//                                                            │
//                                                            ▼
//                                     applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange()
//                                                            │
//                                                            ▼
//                                                     Carol's OWN history, now also
//                                                     holding every genuinely new
//                                                     observation record Alice's export
//                                                     named
//
// EXCHANGE TRANSPORTS HISTORICAL OBSERVATIONS; IT DOES NOT MAKE NEW ONES —
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, THE IDENTICAL RULE 0.8.151'S OWN
// HEADER ALREADY HOLDS ONE LAYER DOWN. A 0.8.162 observation record already
// states a caller's own explicit, historical fact ("this historical
// decision's own candidate was checked against this exact plan, at this
// moment, with this result") — this file never re-derives that fact. It
// never reconstructs a plan, never calls
// `describePublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation()`
// (0.8.162) to recompute an observation, never calls `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionCandidateRevalidationView.js`
// (0.8.157), `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryRevalidationView.js`
// (0.8.158), or `application/PublisherLeaderboardClaimSnapshotReconciliationPlanIdentity.js`
// (0.8.160) to recompute a plan fingerprint or a revalidation fact. Grep
// this file and none of those modules appear — every function here trusts a
// transported record's own `decision`/`planIdentity`/`candidatePresent`/
// `candidateType`/`candidateMatchesPlan`/`observedAt` fields exactly as
// structurally validated, never as re-derived.
//
// NO VERIFIER, THE IDENTICAL RESTRAINT 0.8.151'S OWN HEADER ALREADY HOLDS.
// An observation record carries no signature — it is an explicit, unsigned,
// local historical fact from the moment it was first recorded (0.8.162's
// own header, "a record of what was explicitly observed, never a new
// decision"). This file's own `importXxx()` therefore performs no
// verification step of any kind, requires no verifier argument, and its
// result carries no `signatureValid`, `verified`, `authorized`, or
// `approved` field anywhere. A structurally well-formed imported
// observation means exactly what it meant before transport — a caller once
// explicitly checked this decision against this plan, at this moment, with
// this result — never more.
//
// THE TRANSPORTED PAYLOAD CARRIES EXACTLY SIX FIELDS PER ENTRY —
// `decision`, `planIdentity`, `candidatePresent`, `candidateType`,
// `candidateMatchesPlan`, `observedAt` — NEVER `observed`, AND NEVER ANY
// INTERPRETED STATE. A stored 0.8.162 record is `{ observed: true,
// decision, planIdentity, candidatePresent, candidateType,
// candidateMatchesPlan, observedAt }`; `observed` is a trueness marker
// every STORED record already satisfies by construction (0.8.163's own
// `appendXxx()` refuses anything else), so it carries no information worth
// transporting — this file reconstructs it on import instead of shipping
// it over the wire, mirroring exactly how 0.8.151's own payload omits
// `decided`. The `decision` field itself is embedded WHOLE, `decided: true`
// included — it is not this entry's own top-level marker, it is one nested
// fact this observation carries about a decision, and 0.8.150's own
// archive-storage shape for a decision record already keeps `decided`
// alongside it; this file introduces no second, narrower reduction rule for
// a field nested one level in. The payload carries no `currentState`,
// `resolved`, `superseded`, `stale`, or `preferred` field — this milestone
// introduces no interpreted state of any kind, the identical restraint
// 0.8.163's/0.8.166's own headers already hold, held here again over a
// transported record instead of a stored one.
//
//   { protocolVersion: 1, observations: [ { decision, planIdentity,
//     candidatePresent, candidateType, candidateMatchesPlan, observedAt },
//     ... ] }
//
// OBSERVATION IDENTITY GOVERNS DEDUPLICATION — REUSING 0.8.166'S OWN RULE,
// NEVER INVENTING A SECOND ONE. An observation record's identity for this
// file's own purposes is its complete structural content, exactly as
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js`'s
// own `canonicalObservationKey()` already established:
//
//   observationIdentity = structural identity of
//       (decision, planIdentity, candidatePresent, candidateType,
//        candidateMatchesPlan, observedAt)
//
// So `D1+PlanA+true+T1` and `D1+PlanB+false+T2` remain genuinely distinct
// observations — both are retained. `D1+PlanA+true+T1` and
// `D1+PlanA+false+T1` (differing only in `candidateMatchesPlan`) likewise
// remain genuinely distinct — both are retained. Only an observation that
// is EXACTLY identical in all six fields to one already on file is
// recognized as "the same observation received twice" and contributes no
// second copy on `applyXxx()` — the identical receipt-identity discipline
// 0.8.151's own header already establishes one layer down, over transported
// decisions instead of transported observations. This is a DELIBERATE,
// narrow departure from 0.8.163's own "never deduplicated" LOCAL append
// rule — that rule governs what a caller records directly; this file
// governs what EXCHANGE itself converges toward, so that re-running an
// exchange, or receiving the identical observation from two different
// senders, does not make "exchange" itself a source of runaway
// duplication. A caller who deliberately wants to record the identical
// observation twice, LOCALLY, on purpose, still can — by calling 0.8.163's
// own `appendXxx()` directly, as always; this file's own deduplication
// applies only to what arrives THROUGH exchange. This is also EXACTLY
// 0.8.164's own deduplication identity, restated: exchange converges toward
// what 0.8.164 would already report as "distinct," never a narrower or
// wider notion of "the same observation."
//
// EVERY ENTRY IS STRUCTURALLY VALIDATED, NEVER SEMANTICALLY, AND NEITHER
// THE ARCHIVE NOR ANY REVALIDATION MODULE IS EVER CONSULTED. `importXxx()`
// checks that `decision` is genuinely shaped like a 0.8.145 decision record
// (`decided === true`, `candidate` one of 0.8.144's own three closed
// outcome shapes, `decision` exactly `'OBSERVE'`/`'DEFER'`, `decidedAt` a
// genuine timestamp — 0.8.151's own candidate-shape check, duplicated here
// for the identical reason 0.8.151 itself duplicates it rather than
// importing 0.8.144), that `planIdentity` is genuinely shaped like a
// 0.8.160 plan identity (`algorithm: 'SHA-256'`, a 64-character lowercase
// hex `planFingerprint`, a non-negative integer `candidateCount`), that
// `candidatePresent`/`candidateMatchesPlan` are genuine booleans, that
// `candidateType` is one of 0.8.144's own three closed candidate types, and
// that `observedAt` is a genuine, parseable timestamp string. It never asks
// whether the candidate genuinely exists in any replica's own current plan,
// never recomputes a plan fingerprint, never touches `application/
// PublicationObservationArchive.js` or any other durable store, and never
// reads a claim history, a snapshot sequence, a decision history, a plan,
// or a verifier of any kind. A structurally malformed entry is an explicit,
// per-entry outcome — reported by index and reason in `rejections` — never
// fatal to the rest of an otherwise genuine payload, mirroring 0.8.151's
// own tolerance for one malformed decision entry deep inside an otherwise
// genuine history. Only the top-level envelope itself
// (`protocolVersion`/`observations` shape) is atomic — a malformed envelope
// rejects the WHOLE payload (`INVALID_HISTORY`), the identical "closed
// envelope, reject the whole thing" discipline every import boundary in
// this codebase already holds.
//
// APPLYING MERGES BY APPENDING, VIA THE EXISTING HISTORY MACHINERY ALONE —
// NEVER A COMPETING ARRAY-ASSEMBLY PATH. `applyXxx(history, payload)` folds
// every genuinely new observation from `payload` onto the end of `history`,
// in payload order, via `appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry()`
// (0.8.163, UNCHANGED) — never a hand-rolled `[...history, observation]` of
// its own. It never hands anything back to the sender; two replicas
// wanting to fully converge run the identical exchange in both directions,
// exactly as 0.8.151's own header already documents one layer down.
//
// A VALID IMPORT DOES NOT MEAN THE OBSERVATION IS CORRECT — ONLY THAT IT IS
// STRUCTURALLY GENUINE, EXACTLY AS TRUE BEFORE TRANSPORT AS AFTER.
// Receiving an observation through this file never upgrades its own
// epistemic status: a `candidateMatchesPlan` fact a caller recorded
// elsewhere remains exactly what 0.8.162's own header already says it is —
// "a caller explicitly asked, at `observedAt`, whether this decision's own
// candidate occurs in this exact plan... never 'the decision was right,'
// never 'the plan is current.'" This file adds no verification, no
// authorization, no approval, and no re-evaluation step of any kind on top
// of that — see this file's own flow diagram, above: export, transport,
// import, apply, stored — nothing else.
//
// SYNCHRONOUS, DETERMINISTIC, NETWORK-INDEPENDENT. None of these functions
// reads a clock, touches storage, or performs any I/O. Calling any of them
// twice with byte-identical arguments returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — EXACTLY ONE IMPORT, 0.8.163's OWN APPEND
// BOUNDARY, NOTHING ELSE. This file imports nothing from `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservation.js`
// (0.8.162), `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationDeduplicationView.js`
// (0.8.164), `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryTimelineView.js`
// (0.8.165), `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryDifference.js`
// (0.8.166), `application/
// PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryView.js`
// (0.8.167's own archive reconstruction seam), or `application/
// PublicationObservationArchive.js` itself — it trusts nothing about how an
// observation record was produced beyond its own documented shape, and
// never calls 0.8.157 through 0.8.166 to re-derive, re-select, or
// double-check anything.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Synchronization orchestration** ("which observations does replica B
//   lack, and can they be transported there automatically?"). That is
//   0.8.169's own, separately sized, later question, composed on top of
//   0.8.166's own difference projection and this file's own exchange —
//   never duplicated here.
// - **Any archive integration.** Neither function here reads or writes
//   `application/PublicationObservationArchive.js` — a caller who keeps its
//   observation history durably via 0.8.167 owns reading it out and writing
//   the merged result back in as its own, separate steps.
// - **Verification, authorization, or approval of any kind.** See "No
//   verifier," above.
// - **Recomputing a plan, revalidating a decision, or recomputing a plan
//   fingerprint.** See "Exchange transports historical observations,"
//   above.
// - **Automatic, periodic, or background synchronization of any kind.**
//   Every step here runs only when a caller explicitly calls it.
export const PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeProtocolVersion = 1;

const HISTORY_PAYLOAD_FIELDS = Object.freeze(['protocolVersion', 'observations']);
const OBSERVATION_ENTRY_FIELDS = Object.freeze(['decision', 'planIdentity', 'candidatePresent', 'candidateType', 'candidateMatchesPlan', 'observedAt']);
const DECISION_FIELDS = Object.freeze(['decided', 'candidate', 'decision', 'decidedAt']);
const PLAN_IDENTITY_FIELDS = Object.freeze(['algorithm', 'planFingerprint', 'candidateCount']);
const CANDIDATE_TYPES = Object.freeze(['DIVERGENT_CORRESPONDENCE', 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT', 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM']);
const DIVERGENT_CORRESPONDENCE_CANDIDATE_FIELDS = Object.freeze([
    'selected', 'type', 'claimId', 'snapshotIndex',
    'evidenceFingerprintDiffers', 'policyVersionDiffers', 'snapshotFingerprintDiffers'
]);
const CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT_CANDIDATE_FIELDS = Object.freeze(['selected', 'type', 'claimId']);
const SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM_CANDIDATE_FIELDS = Object.freeze(['selected', 'type', 'snapshotIndex']);

// exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()
// — the ONE, thin export entry point. `history` may be malformed/absent —
// a non-array degrades to `[]`, and any entry that is not a genuine 0.8.162
// `{ observed: true, ... }` record is silently excluded, the identical
// tolerance 0.8.163's own `appendXxx()` already holds. Returns a frozen
// `{ protocolVersion, observations }`, where each entry is EXACTLY
// `{ decision, planIdentity, candidatePresent, candidateType,
// candidateMatchesPlan, observedAt }` — the record's own complete content,
// minus the redundant `observed` marker (see this file's own header) — in
// the exact order `history` already holds them.
export function exportPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(history) {
    const list = Array.isArray(history) ? history : [];
    const observations = list
        .filter(isGenuineObservationRecord)
        .map((entry) => Object.freeze({
            decision: entry.decision,
            planIdentity: entry.planIdentity,
            candidatePresent: entry.candidatePresent,
            candidateType: entry.candidateType,
            candidateMatchesPlan: entry.candidateMatchesPlan,
            observedAt: entry.observedAt
        }));
    return Object.freeze({
        protocolVersion: PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeProtocolVersion,
        observations: Object.freeze(observations)
    });
}

export const PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryImportOutcome = Object.freeze({
    IMPORTED: 'imported',
    INVALID_HISTORY: 'invalid-history'
});

// importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory()
// — the untrusted-input side. `payload` may be either the parsed JSON
// value itself or raw text, exactly like every other `importXxx()` entry
// point in this codebase. No verifier argument exists — see this file's
// own header, "No verifier."
//
// Returns a frozen:
//
//   {
//       outcome,          // IMPORTED | INVALID_HISTORY
//       observations,     // observation records[], or null
//       importedCount,    // observations.length, or 0
//       rejectedCount,    // entries that failed to import, or 0
//       rejections,       // [{ index, reason }, ...]
//       reason            // set only when outcome is INVALID_HISTORY
//   }
//
//   IMPORTED         — the top-level envelope was genuine. `observations`
//                       holds one genuine, freshly reconstructed
//                       `{ observed: true, decision, planIdentity,
//                       candidatePresent, candidateType,
//                       candidateMatchesPlan, observedAt }` record per
//                       entry that structurally validated, in the exact
//                       order `payload.observations` named them. An empty
//                       `observations` array is a genuine, well-formed
//                       IMPORTED result — importing an empty history is
//                       never an error.
//   INVALID_HISTORY  — the top-level envelope itself was malformed (not
//                       valid JSON, wrong/missing `protocolVersion`,
//                       `observations` not an array). `observations` is
//                       `null`. `reason` names which.
//
// Never throws for malformed input. Never touches any archive, store,
// plan, or network of any kind.
export function importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(payload) {
    const json = typeof payload === 'string' ? parseJSONOrNull(payload) : payload;
    if (!isValidHistoryPayloadShape(json)) {
        return Object.freeze({
            outcome: PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryImportOutcome.INVALID_HISTORY,
            observations: null, importedCount: 0, rejectedCount: 0, rejections: Object.freeze([]),
            reason: 'malformed revalidation observation history payload'
        });
    }

    const observations = [];
    const rejections = [];
    json.observations.forEach((entry, index) => {
        if (!isValidObservationEntryShape(entry)) {
            rejections.push({ index, reason: 'malformed revalidation observation history entry' });
            return;
        }
        observations.push(Object.freeze({
            observed: true,
            decision: Object.freeze({ decided: true, candidate: Object.freeze({ ...entry.decision.candidate }), decision: entry.decision.decision, decidedAt: entry.decision.decidedAt }),
            planIdentity: Object.freeze({ ...entry.planIdentity }),
            candidatePresent: entry.candidatePresent,
            candidateType: entry.candidateType,
            candidateMatchesPlan: entry.candidateMatchesPlan,
            observedAt: entry.observedAt
        }));
    });

    return Object.freeze({
        outcome: PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryImportOutcome.IMPORTED,
        observations: Object.freeze(observations),
        importedCount: observations.length,
        rejectedCount: rejections.length,
        rejections: Object.freeze(rejections.map((r) => Object.freeze(r))),
        reason: null
    });
}

export const PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome = Object.freeze({
    APPLIED: 'applied',
    INVALID_HISTORY: 'invalid-history'
});

// applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange()
// — the ONE call a caller actually needs to catch a target `history` up
// with a portable payload: imports the payload (above), then folds every
// genuinely NEW observation (see this file's own header, "Observation
// Identity Governs Deduplication") onto the end of `history`, via
// `appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry()`
// (0.8.163, UNCHANGED) — never a competing array-assembly path of its own.
//
// Returns a frozen:
//
//   {
//       outcome,          // APPLIED | INVALID_HISTORY
//       history,          // the resulting observation history, or null
//       existingCount,    // history.length BEFORE this call
//       incomingCount,    // observations importXxx() produced
//       newCount,         // of those, how many were genuinely new
//       duplicateCount,   // of those, how many were already on file (identical observation)
//       rejectedCount,    // entries importXxx() rejected
//       rejections        // [{ index, reason }, ...], carried through unchanged
//   }
//
//   APPLIED          — `history` is a NEW observation history holding every
//                       record the caller's own `history` already held,
//                       UNCHANGED, in the same order, plus every genuinely
//                       new observation `payload` named, appended in
//                       order. Applying the IDENTICAL payload to the
//                       IDENTICAL resulting history a second time is a
//                       genuine no-op: `newCount` is `0`, and `history` is
//                       the EXACT SAME instance passed in that second time.
//   INVALID_HISTORY  — `history` is `null`. The payload's own top-level
//                       envelope was malformed. The caller's own `history`
//                       argument is never touched.
//
// A malformed/absent target `history` is tolerated exactly like
// `appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry()`
// already tolerates it — degrading to `[]` rather than throwing.
export function applyPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchange(history, payload) {
    const existing = Array.isArray(history) ? history : [];
    const importResult = importPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistory(payload);
    if (importResult.outcome !== PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryImportOutcome.IMPORTED) {
        return Object.freeze({
            outcome: PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome.INVALID_HISTORY,
            history: null, existingCount: existing.length, incomingCount: 0,
            newCount: 0, duplicateCount: 0, rejectedCount: importResult.rejectedCount,
            rejections: importResult.rejections
        });
    }

    const seenKeys = new Set(existing.map(canonicalObservationKey));
    let merged = existing;
    let newCount = 0;
    let duplicateCount = 0;
    for (const observation of importResult.observations) {
        const key = canonicalObservationKey(observation);
        if (seenKeys.has(key)) {
            duplicateCount += 1;
            continue;
        }
        seenKeys.add(key);
        merged = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryEntry(merged, observation);
        newCount += 1;
    }

    return Object.freeze({
        outcome: PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeApplyOutcome.APPLIED,
        history: merged,
        existingCount: existing.length,
        incomingCount: importResult.importedCount,
        newCount, duplicateCount,
        rejectedCount: importResult.rejectedCount,
        rejections: importResult.rejections
    });
}

// The one, uniform observation identity this file uses for deduplication —
// see this file's own header, "Observation Identity Governs Deduplication."
// Reuses 0.8.166's own formula exactly (exact structural equality of
// `decision` + `planIdentity` + `candidatePresent` + `candidateType` +
// `candidateMatchesPlan` + `observedAt`), never a narrower or wider key —
// duplicated here, not imported, for the identical reason this whole
// family already duplicates it: this file must apply the exact same
// identity rule without importing a module that itself carries decision/
// plan/history vocabulary.
function canonicalObservationKey(record) {
    return JSON.stringify({
        decision: record.decision,
        planIdentity: record.planIdentity,
        candidatePresent: record.candidatePresent,
        candidateType: record.candidateType,
        candidateMatchesPlan: record.candidateMatchesPlan,
        observedAt: record.observedAt
    });
}

function parseJSONOrNull(text) {
    try {
        return JSON.parse(text);
    } catch (error) {
        return null;
    }
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasOnlyKeys(value, allowedKeys) {
    return Object.keys(value).every((key) => allowedKeys.includes(key));
}

function hasAllKeys(value, requiredKeys) {
    return requiredKeys.every((key) => key in value);
}

// The top-level envelope is valid only when it is EXACTLY
// `{ protocolVersion, observations }`, with the one supported
// `protocolVersion` and `observations` a genuine array (possibly empty) —
// the identical "closed field list, reject the whole payload" discipline
// every other import boundary in this codebase already holds. Individual
// entries are validated separately, per entry, and are never fatal to the
// whole envelope — see this file's own header.
function isValidHistoryPayloadShape(json) {
    if (!isPlainObject(json)) return false;
    if (!hasOnlyKeys(json, HISTORY_PAYLOAD_FIELDS)) return false;
    if (!hasAllKeys(json, HISTORY_PAYLOAD_FIELDS)) return false;
    if (json.protocolVersion !== PublisherLeaderboardClaimSnapshotReconciliationDecisionRevalidationObservationHistoryExchangeProtocolVersion) return false;
    if (!Array.isArray(json.observations)) return false;
    return true;
}

// One entry is valid only when it is EXACTLY `{ decision, planIdentity,
// candidatePresent, candidateType, candidateMatchesPlan, observedAt }`,
// `decision` is a genuine 0.8.145 decision record shape, `planIdentity` is
// a genuine 0.8.160 plan identity shape, `candidatePresent`/
// `candidateMatchesPlan` are genuine booleans, `candidateType` is one of
// 0.8.144's own three closed candidate types, and `observedAt` is a
// genuine, parseable timestamp string.
function isValidObservationEntryShape(entry) {
    if (!isPlainObject(entry)) return false;
    if (!hasOnlyKeys(entry, OBSERVATION_ENTRY_FIELDS)) return false;
    if (!hasAllKeys(entry, OBSERVATION_ENTRY_FIELDS)) return false;
    if (!isValidDecisionShape(entry.decision)) return false;
    if (!isValidPlanIdentityShape(entry.planIdentity)) return false;
    if (typeof entry.candidatePresent !== 'boolean') return false;
    if (!CANDIDATE_TYPES.includes(entry.candidateType)) return false;
    if (typeof entry.candidateMatchesPlan !== 'boolean') return false;
    if (!isValidTimestamp(entry.observedAt)) return false;
    return true;
}

// A genuine 0.8.145 decision record shape — `decided` strictly `true`,
// `candidate` one of 0.8.144's own three closed outcome shapes, `decision`
// exactly `'OBSERVE'`/`'DEFER'`, `decidedAt` a genuine, parseable
// timestamp — 0.8.151's own candidate-shape check, duplicated here for the
// identical reason 0.8.151 itself duplicates it rather than importing
// 0.8.144/0.8.145.
function isValidDecisionShape(decision) {
    if (!isPlainObject(decision)) return false;
    if (!hasOnlyKeys(decision, DECISION_FIELDS)) return false;
    if (!hasAllKeys(decision, DECISION_FIELDS)) return false;
    if (decision.decided !== true) return false;
    if (!isValidCandidateShape(decision.candidate)) return false;
    if (decision.decision !== 'OBSERVE' && decision.decision !== 'DEFER') return false;
    if (!isValidTimestamp(decision.decidedAt)) return false;
    return true;
}

// A genuine candidate is one of 0.8.144's own three, closed outcome
// shapes — "fields that don't exist are never invented," 0.8.144's own
// rule, checked here again on the receiving side of transport.
function isValidCandidateShape(candidate) {
    if (!isPlainObject(candidate)) return false;
    if (candidate.selected !== true) return false;

    if (candidate.type === 'DIVERGENT_CORRESPONDENCE') {
        if (!hasOnlyKeys(candidate, DIVERGENT_CORRESPONDENCE_CANDIDATE_FIELDS)) return false;
        if (!hasAllKeys(candidate, DIVERGENT_CORRESPONDENCE_CANDIDATE_FIELDS)) return false;
        if (typeof candidate.claimId !== 'string') return false;
        if (!Number.isInteger(candidate.snapshotIndex)) return false;
        if (typeof candidate.evidenceFingerprintDiffers !== 'boolean') return false;
        if (typeof candidate.policyVersionDiffers !== 'boolean') return false;
        if (typeof candidate.snapshotFingerprintDiffers !== 'boolean') return false;
        return true;
    }

    if (candidate.type === 'CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT') {
        if (!hasOnlyKeys(candidate, CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT_CANDIDATE_FIELDS)) return false;
        if (!hasAllKeys(candidate, CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT_CANDIDATE_FIELDS)) return false;
        if (typeof candidate.claimId !== 'string') return false;
        return true;
    }

    if (candidate.type === 'SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM') {
        if (!hasOnlyKeys(candidate, SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM_CANDIDATE_FIELDS)) return false;
        if (!hasAllKeys(candidate, SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM_CANDIDATE_FIELDS)) return false;
        if (!Number.isInteger(candidate.snapshotIndex)) return false;
        return true;
    }

    return false;
}

// A genuine 0.8.160 plan identity shape — exactly `algorithm`/
// `planFingerprint`/`candidateCount`, the one supported algorithm, a
// 64-character lowercase hex `planFingerprint`, and a non-negative integer
// `candidateCount`. Checks SHAPE only, exactly like `application/
// PublicationObservationArchive.js`'s own `validateRevalidationPlanIdentity()`
// (0.8.167) — never a recomputed fingerprint, and never compared against
// anything.
function isValidPlanIdentityShape(planIdentity) {
    if (!isPlainObject(planIdentity)) return false;
    if (!hasOnlyKeys(planIdentity, PLAN_IDENTITY_FIELDS)) return false;
    if (!hasAllKeys(planIdentity, PLAN_IDENTITY_FIELDS)) return false;
    if (planIdentity.algorithm !== 'SHA-256') return false;
    if (typeof planIdentity.planFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(planIdentity.planFingerprint)) return false;
    if (!Number.isInteger(planIdentity.candidateCount) || planIdentity.candidateCount < 0) return false;
    return true;
}

function isValidTimestamp(value) {
    if (typeof value !== 'string' || value.length === 0) return false;
    return !Number.isNaN(Date.parse(value));
}

// A genuine 0.8.162 observation record: `{ observed: true, decision,
// planIdentity, candidatePresent, candidateType, candidateMatchesPlan,
// observedAt }`, mirroring 0.8.164's/0.8.165's/0.8.166's own
// `isGenuineObservation()` exactly.
function isGenuineObservationRecord(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.observed === true
        && typeof entry.observedAt === 'string'
    );
}
