import { appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry } from './PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory.js';

// 0.8.151 — Portable Reconciliation Decision History Exchange.
//
// 0.8.150 gave a replica a durable, archive-backed home for its own
// reconciliation decisions, but never let one replica hand its history to
// another — the identical gap 0.8.122 once left for a single signed claim,
// closed one layer up by 0.8.126's own `PublisherLeaderboardClaimHistoryExchange.js`.
// This file is that same missing step, one subject over — a whole
// `PublisherLeaderboardClaimSnapshotReconciliationDecisionHistory` (0.8.146's
// own plain, ordered array of 0.8.145's own decision records) instead of a
// signed claim history:
//
//   Alice's replica                                Carol's replica
//
//   history (0.8.146, UNCHANGED)
//      │  exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()
//      ▼
//   a JSON payload  ──────────────────────────────►  importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory()
//                                                            │
//                                                            ▼
//                                                     validated decision records,
//                                                     each structurally checked —
//                                                     NEVER re-evaluated
//                                                            │
//                                                            ▼
//                                     applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange()
//                                                            │
//                                                            ▼
//                                                     Carol's OWN history, now also
//                                                     holding every genuinely new
//                                                     decision record Alice's export
//                                                     named
//
// EXCHANGE TRANSPORTS HISTORICAL DECISIONS; IT DOES NOT MAKE NEW ONES — THE
// ONE RULE THIS FILE EXISTS TO ENFORCE. A 0.8.145 decision record already
// states a caller's own explicit, historical fact ("this candidate was
// given this disposition at this moment") — this file never re-derives that
// fact. It never reconstructs a `PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`
// plan, never calls `describePublisherLeaderboardClaimSnapshotReconciliationCandidate()`
// (0.8.144) to re-select a candidate, and never calls
// `describePublisherLeaderboardClaimSnapshotReconciliationDecision()` (0.8.145)
// to recompute a disposition. Grep this file and none of those three modules
// appear — every function here trusts a transported record's own
// `candidate`/`decision`/`decidedAt` fields exactly as structurally
// validated, never as re-derived.
//
// UNLIKE A SIGNED CLAIM, A DECISION CARRIES NO SIGNATURE — TRANSPORT NEVER
// PRETENDS OTHERWISE. `application/PublisherLeaderboardSnapshotClaimExchange.js`'s
// own import runs a structural signature check because a claim carries one;
// a 0.8.145 decision record carries none — it is an explicit, unsigned,
// local historical fact from the moment it was first recorded (0.8.145's own
// header, "the `OBSERVE`/`DEFER` disposition is already an explicit
// historical fact"). This file's own `importXxx()` therefore performs no
// verification step of any kind, requires no verifier argument, and its
// result carries no `signatureValid`, `verified`, `authorized`, or
// `approved` field anywhere. A structurally well-formed imported decision
// means exactly what it meant before transport — a caller once recorded
// this disposition against this candidate — never more.
//
// THE TRANSPORTED PAYLOAD CARRIES EXACTLY THREE FIELDS PER ENTRY —
// `candidate`, `decision`, `decidedAt` — NEVER `decided`, AND NEVER ANY
// INTERPRETED STATE. A stored 0.8.145 record is `{ decided: true,
// candidate, decision, decidedAt }`; `decided` is a trueness marker every
// STORED record already satisfies by construction (0.8.146's own
// `appendXxx()` refuses anything else), so it carries no information worth
// transporting — this file reconstructs it on import instead of shipping
// it over the wire, mirroring how `decided` never appears as a caller-
// supplied field anywhere in this family. The payload carries no
// `currentState`, `resolved`, `superseded`, `effective`, or `preferred`
// field — this milestone introduces no interpreted state of any kind, the
// identical restraint 0.8.146's/0.8.149's own headers already hold, held
// here again over a transported record instead of a stored one.
//
//   { protocolVersion: 1, decisions: [ { candidate, decision, decidedAt }, ... ] }
//
// DECISION IDENTITY GOVERNS DEDUPLICATION — REUSING 0.8.149's OWN RULE,
// NEVER INVENTING A SECOND ONE. A decision record's identity for this
// file's own purposes is its complete structural content, exactly as
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js`'s
// own `canonicalDecisionKey()` already established:
//
//   decisionIdentity = structural identity of (candidate, decision, decidedAt)
//
// So `OBSERVE(B<->S2, T1)` and `DEFER(B<->S2, T1)` are genuinely distinct
// decisions — both are retained. `OBSERVE(B<->S2, T1)` and
// `OBSERVE(B<->S2, T2)` are likewise genuinely distinct — both are
// retained. Only a decision that is EXACTLY identical in all three fields
// to one already on file is recognized as "the same decision received
// twice" and contributes no second copy on `applyXxx()` — the identical
// receipt-identity discipline `application/PublisherLeaderboardClaimHistoryExchange.js`'s
// own header already establishes one layer down, over transported claim
// receipts instead of transported decisions. This is a DELIBERATE, narrow
// departure from 0.8.146's own "never deduplicated" LOCAL append rule —
// that rule governs what a caller records directly; this file governs what
// EXCHANGE itself converges toward, so that re-running an exchange, or
// receiving the identical decision from two different senders, does not
// make "exchange" itself a source of runaway duplication. A caller who
// deliberately wants to record the identical decision twice, LOCALLY, on
// purpose, still can — by calling 0.8.146's own `appendXxx()` directly, as
// always; this file's own deduplication applies only to what arrives
// THROUGH exchange.
//
// EVERY ENTRY IS STRUCTURALLY VALIDATED, NEVER SEMANTICALLY, AND THE
// ARCHIVE IS NEVER CONSULTED. `importXxx()` checks that a candidate is
// genuinely shaped like one of 0.8.144's own three outcome shapes
// (`DIVERGENT_CORRESPONDENCE`/`CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT`/
// `SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM`, each with EXACTLY its own closed
// field list — "fields that don't exist are never invented," 0.8.144's own
// rule, held here again on the receiving side), that `decision` is exactly
// `'OBSERVE'` or `'DEFER'`, and that `decidedAt` is a genuine, parseable
// timestamp string. It never asks whether the candidate genuinely exists in
// any replica's own current plan, never touches
// `application/PublicationObservationArchive.js` or any other durable
// store, and never reads a claim history, a snapshot sequence, or a
// verifier of any kind. A structurally malformed entry is an explicit,
// per-entry outcome — reported by index and reason in `rejections` — never
// fatal to the rest of an otherwise genuine payload, mirroring
// `application/PublisherLeaderboardClaimHistoryExchange.js`'s own tolerance
// for one malformed claim receipt deep inside an otherwise genuine history.
// Only the top-level envelope itself (`protocolVersion`/`decisions` shape)
// is atomic — a malformed envelope rejects the WHOLE payload
// (`INVALID_HISTORY`), the identical "closed envelope, reject the whole
// thing" discipline every import boundary in this codebase already holds.
//
// APPLYING MERGES BY APPENDING, VIA THE EXISTING HISTORY MACHINERY ALONE —
// NEVER A COMPETING ARRAY-ASSEMBLY PATH. `applyXxx(history, payload)` folds
// every genuinely new decision from `payload` onto the end of `history`, in
// payload order, via `appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry()`
// (0.8.146, UNCHANGED) — never a hand-rolled `[...history, decision]` of its
// own. It never hands anything back to the sender; two replicas wanting to
// fully converge run the identical exchange in both directions, exactly as
// `application/PublisherLeaderboardClaimHistoryExchange.js`'s own header
// already documents one layer down.
//
// A VALID IMPORT DOES NOT MEAN THE DECISION IS CORRECT — ONLY THAT IT IS
// STRUCTURALLY GENUINE, EXACTLY AS TRUE BEFORE TRANSPORT AS AFTER.
// Receiving a decision through this file never upgrades its own epistemic
// status: an `OBSERVE`/`DEFER` disposition a caller recorded elsewhere
// remains exactly what 0.8.145's own header already says it is — "a caller
// explicitly recorded this disposition... never a statement that the
// disposition is correct." This file adds no verification, no
// authorization, no approval, and no re-evaluation step of any kind on top
// of that — see this file's own flow diagram, above: export, transport,
// import, apply, stored — nothing else.
//
// SYNCHRONOUS, DETERMINISTIC, NETWORK-INDEPENDENT. None of these functions
// reads a clock, touches storage, or performs any I/O. Calling any of them
// twice with byte-identical arguments returns a byte-identical result.
//
// ARCHITECTURAL BOUNDARY — EXACTLY ONE IMPORT, 0.8.146's OWN APPEND
// BOUNDARY, NOTHING ELSE. This file imports nothing from
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecision.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliation.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationPlanView.js`,
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js`,
// or `application/PublicationObservationArchive.js` — it trusts nothing
// about how a decision record was produced beyond its own documented shape,
// and never calls 0.8.144, 0.8.145, or 0.8.149 to re-derive, re-select, or
// double-check anything.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Synchronization orchestration** ("which decisions does replica B
//   lack, and can they be transported there automatically?"). That is
//   0.8.152's own, separately sized, later question, composed on top of
//   0.8.149's own difference projection and this file's own exchange —
//   never duplicated here.
// - **Any archive integration.** Neither function here reads or writes
//   `application/PublicationObservationArchive.js` — a caller who keeps its
//   decision history durably via 0.8.150 owns reading it out and writing
//   the merged result back in as its own, separate steps.
// - **Verification, authorization, or approval of any kind.** See "Unlike
//   a signed claim," above.
// - **Recomputing a plan, re-selecting a candidate, or recomputing a
//   decision.** See "Exchange transports historical decisions," above.
// - **Automatic, periodic, or background synchronization of any kind.**
//   Every step here runs only when a caller explicitly calls it.
export const PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeProtocolVersion = 1;

const HISTORY_PAYLOAD_FIELDS = Object.freeze(['protocolVersion', 'decisions']);
const DECISION_ENTRY_FIELDS = Object.freeze(['candidate', 'decision', 'decidedAt']);
const DIVERGENT_CORRESPONDENCE_CANDIDATE_FIELDS = Object.freeze([
    'selected', 'type', 'claimId', 'snapshotIndex',
    'evidenceFingerprintDiffers', 'policyVersionDiffers', 'snapshotFingerprintDiffers'
]);
const CLAIM_WITHOUT_CORRESPONDING_SNAPSHOT_CANDIDATE_FIELDS = Object.freeze(['selected', 'type', 'claimId']);
const SNAPSHOT_WITHOUT_CORRESPONDING_CLAIM_CANDIDATE_FIELDS = Object.freeze(['selected', 'type', 'snapshotIndex']);

// exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory() —
// the ONE, thin export entry point. `history` may be malformed/absent — a
// non-array degrades to `[]`, and any entry that is not a genuine 0.8.145
// `{ decided: true, ... }` record is silently excluded, the identical
// tolerance `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js`'s
// own `isGenuineDecision()` already holds. Returns a frozen
// `{ protocolVersion, decisions }`, where each entry is EXACTLY
// `{ candidate, decision, decidedAt }` — the record's own complete content,
// minus the redundant `decided` marker (see this file's own header) — in
// the exact order `history` already holds them.
export function exportPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(history) {
    const list = Array.isArray(history) ? history : [];
    const decisions = list
        .filter(isGenuineDecisionRecord)
        .map((entry) => Object.freeze({ candidate: entry.candidate, decision: entry.decision, decidedAt: entry.decidedAt }));
    return Object.freeze({
        protocolVersion: PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeProtocolVersion,
        decisions: Object.freeze(decisions)
    });
}

export const PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryImportOutcome = Object.freeze({
    IMPORTED: 'imported',
    INVALID_HISTORY: 'invalid-history'
});

// importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory() —
// the untrusted-input side. `payload` may be either the parsed JSON value
// itself or raw text, exactly like every other `importXxx()` entry point in
// this codebase. No verifier argument exists — see this file's own header,
// "Unlike a signed claim."
//
// Returns a frozen:
//
//   {
//       outcome,          // IMPORTED | INVALID_HISTORY
//       decisions,        // decision records[], or null
//       importedCount,    // decisions.length, or 0
//       rejectedCount,    // entries that failed to import, or 0
//       rejections,       // [{ index, reason }, ...]
//       reason            // set only when outcome is INVALID_HISTORY
//   }
//
//   IMPORTED         — the top-level envelope was genuine. `decisions`
//                       holds one genuine, freshly reconstructed
//                       `{ decided: true, candidate, decision, decidedAt }`
//                       record per entry that structurally validated, in
//                       the exact order `payload.decisions` named them. An
//                       empty `decisions` array is a genuine, well-formed
//                       IMPORTED result — importing an empty history is
//                       never an error.
//   INVALID_HISTORY  — the top-level envelope itself was malformed (not
//                       valid JSON, wrong/missing `protocolVersion`,
//                       `decisions` not an array). `decisions` is `null`.
//                       `reason` names which.
//
// Never throws for malformed input. Never touches any archive, store,
// plan, or network of any kind.
export function importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(payload) {
    const json = typeof payload === 'string' ? parseJSONOrNull(payload) : payload;
    if (!isValidHistoryPayloadShape(json)) {
        return Object.freeze({
            outcome: PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryImportOutcome.INVALID_HISTORY,
            decisions: null, importedCount: 0, rejectedCount: 0, rejections: Object.freeze([]),
            reason: 'malformed reconciliation decision history payload'
        });
    }

    const decisions = [];
    const rejections = [];
    json.decisions.forEach((entry, index) => {
        if (!isValidDecisionEntryShape(entry)) {
            rejections.push({ index, reason: 'malformed reconciliation decision history entry' });
            return;
        }
        decisions.push(Object.freeze({
            decided: true,
            candidate: Object.freeze({ ...entry.candidate }),
            decision: entry.decision,
            decidedAt: entry.decidedAt
        }));
    });

    return Object.freeze({
        outcome: PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryImportOutcome.IMPORTED,
        decisions: Object.freeze(decisions),
        importedCount: decisions.length,
        rejectedCount: rejections.length,
        rejections: Object.freeze(rejections.map((r) => Object.freeze(r))),
        reason: null
    });
}

export const PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeApplyOutcome = Object.freeze({
    APPLIED: 'applied',
    INVALID_HISTORY: 'invalid-history'
});

// applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange()
// — the ONE call a caller actually needs to catch a target `history` up
// with a portable payload: imports the payload (above), then folds every
// genuinely NEW decision (see this file's own header, "Decision Identity
// Governs Deduplication") onto the end of `history`, via
// `appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry()`
// (0.8.146, UNCHANGED) — never a competing array-assembly path of its own.
//
// Returns a frozen:
//
//   {
//       outcome,          // APPLIED | INVALID_HISTORY
//       history,          // the resulting decision history, or null
//       existingCount,    // history.length BEFORE this call
//       incomingCount,    // decisions importXxx() produced
//       newCount,         // of those, how many were genuinely new
//       duplicateCount,   // of those, how many were already on file (identical decision)
//       rejectedCount,    // entries importXxx() rejected
//       rejections        // [{ index, reason }, ...], carried through unchanged
//   }
//
//   APPLIED          — `history` is a NEW decision history holding every
//                       record the caller's own `history` already held,
//                       UNCHANGED, in the same order, plus every genuinely
//                       new decision `payload` named, appended in order.
//                       Applying the IDENTICAL payload to the IDENTICAL
//                       resulting history a second time is a genuine no-op:
//                       `newCount` is `0`, and `history` is the EXACT SAME
//                       instance passed in that second time.
//   INVALID_HISTORY  — `history` is `null`. The payload's own top-level
//                       envelope was malformed. The caller's own `history`
//                       argument is never touched.
//
// A malformed/absent target `history` is tolerated exactly like
// `appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry()`
// already tolerates it — degrading to `[]` rather than throwing.
export function applyPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchange(history, payload) {
    const existing = Array.isArray(history) ? history : [];
    const importResult = importPublisherLeaderboardClaimSnapshotReconciliationDecisionHistory(payload);
    if (importResult.outcome !== PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryImportOutcome.IMPORTED) {
        return Object.freeze({
            outcome: PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeApplyOutcome.INVALID_HISTORY,
            history: null, existingCount: existing.length, incomingCount: 0,
            newCount: 0, duplicateCount: 0, rejectedCount: importResult.rejectedCount,
            rejections: importResult.rejections
        });
    }

    const seenKeys = new Set(existing.map(canonicalDecisionKey));
    let merged = existing;
    let newCount = 0;
    let duplicateCount = 0;
    for (const decision of importResult.decisions) {
        const key = canonicalDecisionKey(decision);
        if (seenKeys.has(key)) {
            duplicateCount += 1;
            continue;
        }
        seenKeys.add(key);
        merged = appendPublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryEntry(merged, decision);
        newCount += 1;
    }

    return Object.freeze({
        outcome: PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeApplyOutcome.APPLIED,
        history: merged,
        existingCount: existing.length,
        incomingCount: importResult.importedCount,
        newCount, duplicateCount,
        rejectedCount: importResult.rejectedCount,
        rejections: importResult.rejections
    });
}

// The one, uniform decision identity this file uses for deduplication —
// see this file's own header, "Decision Identity Governs Deduplication."
// Reuses 0.8.149's own formula exactly (exact structural equality of
// `candidate` + `decision` + `decidedAt`), never a narrower key.
function canonicalDecisionKey(record) {
    return JSON.stringify({ candidate: record.candidate, decision: record.decision, decidedAt: record.decidedAt });
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
// `{ protocolVersion, decisions }`, with the one supported
// `protocolVersion` and `decisions` a genuine array (possibly empty) — the
// identical "closed field list, reject the whole payload" discipline every
// other import boundary in this codebase already holds. Individual entries
// are validated separately, per entry, and are never fatal to the whole
// envelope — see this file's own header.
function isValidHistoryPayloadShape(json) {
    if (!isPlainObject(json)) return false;
    if (!hasOnlyKeys(json, HISTORY_PAYLOAD_FIELDS)) return false;
    if (!hasAllKeys(json, HISTORY_PAYLOAD_FIELDS)) return false;
    if (json.protocolVersion !== PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryExchangeProtocolVersion) return false;
    if (!Array.isArray(json.decisions)) return false;
    return true;
}

// One entry is valid only when it is EXACTLY `{ candidate, decision,
// decidedAt }`, `candidate` is genuinely one of 0.8.144's own three
// outcome shapes, `decision` is exactly `'OBSERVE'` or `'DEFER'`
// (0.8.145's own, unchanged, two-value vocabulary), and `decidedAt` is a
// genuine, parseable timestamp string.
function isValidDecisionEntryShape(entry) {
    if (!isPlainObject(entry)) return false;
    if (!hasOnlyKeys(entry, DECISION_ENTRY_FIELDS)) return false;
    if (!hasAllKeys(entry, DECISION_ENTRY_FIELDS)) return false;
    if (!isValidCandidateShape(entry.candidate)) return false;
    if (entry.decision !== 'OBSERVE' && entry.decision !== 'DEFER') return false;
    if (!isValidDecidedAt(entry.decidedAt)) return false;
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

function isValidDecidedAt(value) {
    if (typeof value !== 'string' || value.length === 0) return false;
    return !Number.isNaN(Date.parse(value));
}

// A genuine 0.8.145 decision record: `{ decided: true, candidate, decision,
// decidedAt }`, mirroring
// `application/PublisherLeaderboardClaimSnapshotReconciliationDecisionHistoryDifference.js`'s
// own `isGenuineDecision()` exactly.
function isGenuineDecisionRecord(entry) {
    return (
        entry !== null && typeof entry === 'object'
        && entry.decided === true
        && entry.candidate !== null && typeof entry.candidate === 'object'
        && typeof entry.candidate.type === 'string'
        && (entry.decision === 'OBSERVE' || entry.decision === 'DEFER')
        && typeof entry.decidedAt === 'string'
    );
}
