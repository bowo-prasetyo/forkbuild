import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';
import { appendLeaderboardClaimHistoryEntry } from './LeaderboardClaimHistory.js';
import {
    PublisherLeaderboardSnapshotClaimImportOutcome,
    importPublisherLeaderboardSnapshotClaim
} from './PublisherLeaderboardSnapshotClaimExchange.js';

// 0.8.126 — Portable Claim History Exchange.
//
// 0.8.122 proved a single signed claim can travel between two replicas as
// a small, closed JSON payload. 0.8.123 gave a replica a durable, ordered
// place to keep every claim it has ever received — a `LeaderboardClaimRecord`
// per receipt, appended, never deduplicated. Neither one ever let a
// replica hand its ENTIRE stored history to another replica in one call —
// 0.8.122 moves exactly one claim; 0.8.123 never moves anything at all.
// This file is that missing step, one layer up from 0.8.122, over a whole
// `LeaderboardClaimHistory` (0.8.123's own plain, ordered array of
// records) instead of one claim:
//
//   Alice's replica                                Carol's replica
//
//   history (LeaderboardClaimHistory, 0.8.123, UNCHANGED)
//      │  exportPublisherLeaderboardClaimHistory()
//      ▼
//   a JSON payload  ──────────────────────────────►  importPublisherLeaderboardClaimHistory()
//                                                            │
//                                                            ▼
//                                                     validated LeaderboardClaimRecord[],
//                                                     each claim structurally verified
//                                                     (0.8.122, UNCHANGED)
//                                                            │
//                                                            ▼
//                                       applyPublisherLeaderboardClaimHistoryExchange()
//                                                            │
//                                                            ▼
//                                                     Carol's OWN history, now also
//                                                     holding every record Alice's
//                                                     export named that Carol did not
//                                                     already have — exact duplicates
//                                                     skipped, everything else appended
//
// THIS TRANSPORTS RECEIPTS, NEVER CONCLUSIONS — THE ONE RULE THIS FILE
// EXISTS TO ENFORCE. A `LeaderboardClaimRecord` (0.8.123) is exactly a
// signed claim plus two receipt facts (`receivedAt`, `origin`) — nothing
// evaluative is ever attached to it, and this file adds nothing evaluative
// either. The portable payload below is exactly that shape, repeated:
//
//   { protocolVersion: 1, claims: [ { claim, receivedAt, origin }, ... ] }
//
// where each entry is exactly `LeaderboardClaimRecord#toJSON()`'s own
// wire shape (see `application/LeaderboardClaimRecord.js`) — never a new
// shape invented here. It carries NO verification result
// (`signatureValid`/`evidenceFingerprintMatches`/`policyVersionMatches`/
// `snapshotFingerprintMatches`/`matches` — 0.8.121/0.8.124/0.8.125's own
// vocabulary, absent from this file entirely), no local snapshot, no
// evidence-fingerprint the receiver derived on its own, no leaderboard, no
// statistics, no achievements, and no trust judgment of any kind. A
// receiver who wants any of those recomputes them independently, against
// its OWN current evidence, as its own, separate, explicit next step —
// exactly the discipline 0.8.122's own header already holds for a single
// claim, held here again over a whole history.
//
// EVERY CLAIM IS STRUCTURALLY VERIFIED ON IMPORT — NEVER SEMANTICALLY, AND
// NEVER TWICE BY A COMPETING PATH. `importPublisherLeaderboardClaimHistory()`
// runs each entry's own `claim` through `importPublisherLeaderboardSnapshotClaim()`
// (0.8.122, UNCHANGED) — the identical structural check ("did
// `signerIdentityId` really sign exactly this fingerprint triple?") 0.8.122
// already performs for one claim, reused here per entry rather than
// reimplemented. This file invents no second signature-checking path, and
// never asks whether any claim's fingerprints agree with THIS replica's
// own reconstructed snapshot — that remains 0.8.121's/0.8.124's/0.8.125's
// own, entirely separate, later question, run by a caller against the
// history `applyPublisherLeaderboardClaimHistoryExchange()` returns.
//
// `RECEIVEDAT`/`ORIGIN` TRAVEL AS DATA, UNCHANGED — A DELIBERATE
// DEPARTURE FROM `application/AchievementEvidenceMerge.js`'S OWN
// "ALWAYS RE-STAMP `IMPORTED`" RULE, NOT AN OVERSIGHT. Achievement
// evidence provenance lives OUTSIDE the record itself (a parallel array on
// `PublicationObservationArchive`), so 0.8.115 correctly treats it as
// something that describes THIS archive's own ingestion and re-stamps it
// on every merge. A `LeaderboardClaimRecord`'s `receivedAt`/`origin` are
// different in kind: they are fields OF the record itself, already part
// of what 0.8.123's own `toJSON()`/`fromJSON()` round-trips verbatim (see
// that file's own header, "the identical `LOCAL`/`IMPORTED`... describes
// how it entered THIS REPLICA'S OWN history" — but ALSO its own
// constructor accepts them as ordinary, given fields, and `fromJSON()`
// already reconstructs them exactly as given, with no re-stamping of any
// kind). This file follows that existing, established round-trip contract
// rather than inventing a new one: a record that already has a
// `receivedAt`/`origin` when it enters this file keeps them, exactly as
// `LeaderboardClaimRecord.fromJSON()` already would. Concretely, this is
// also what makes exchange-level idempotency possible at all (see "Receipt
// Identity," below) — regenerating `receivedAt` to "now" on every import
// would make the identical export produce a genuinely different record
// every time it was applied, defeating idempotency entirely.
//
// RECEIPT IDENTITY, NOT CLAIM IDENTITY, GOVERNS DEDUPLICATION — THE KEY
// DESIGN QUESTION THIS MILESTONE EXISTS TO ANSWER EXPLICITLY. 0.8.123's
// own rule is preserved, UNCHANGED: the same claim received twice is TWO
// historical entries, never collapsed into one, and this file's own
// `applyPublisherLeaderboardClaimHistoryExchange()` never deduplicates by
// `claim.id`, `signerIdentityId`, or `snapshotFingerprint` alone. But
// applying the IDENTICAL exported history payload to the IDENTICAL target
// history a second time must not endlessly re-append the same receipts —
// that would make "exchange" itself, not the underlying claims, the
// source of runaway duplication. This file resolves the tension with one
// explicit rule, applied uniformly:
//
//   receiptIdentity = structural identity of (claim, receivedAt, origin)
//
// — the complete `LeaderboardClaimRecord#toJSON()` output, compared as a
// canonical string, mirroring `application/AchievementEvidenceMerge.js`'s
// own `canonicalRecordKey()` (exact structural equality of a record's own
// serialized form, never a narrower key). Concretely:
//
//   same claim + same receivedAt + same origin  → the SAME receipt; a
//                                                   second application
//                                                   appends nothing
//   same claim + different receivedAt            → a DISTINCT receipt;
//                                                    both are kept
//   same claim + different origin                 → a DISTINCT receipt;
//                                                    both are kept
//   different claim (even by one signed field)    → always a DISTINCT
//                                                     receipt
//
// This is a genuinely different identity rule from 0.8.115's own evidence
// merge (which compares whole records because provenance is NOT part of a
// bitcoin/base/reference/association record's own fields) — here, exact
// structural equality of the whole record happens to fall out of the
// SAME "every field is part of identity" reasoning 0.8.115 already
// established, simply applied to a record shape that already includes its
// own receipt metadata as ordinary fields.
//
// APPLYING TRANSPORTS RECEIPTS ONLY IN ONE DIRECTION, AND MERGES BY
// APPENDING — NEVER REPLACING, REORDERING, OR SORTING. `applyPublisherLeaderboardClaimHistoryExchange(history,
// payload, verifier)` folds every genuinely new receipt from `payload`
// onto the END of `history`, in the exact order `payload.claims` names
// them — mirroring `application/LeaderboardClaimHistory.js#appendLeaderboardClaimHistoryEntry()`'s
// own append-only discipline, reused here rather than reinvented (this
// file calls that function once per newly-incorporated record, never
// constructs a competing array-assembly path of its own). It never hands
// anything back to the sender — a caller wanting two replicas to fully
// converge runs the identical exchange in both directions, exactly as
// `application/AchievementEvidenceExchange.js`'s own header already
// documents for evidence one layer down.
//
// A STRUCTURALLY INVALID OR UNVERIFIABLE ENTRY IS SKIPPED, NEVER FATAL TO
// THE WHOLE HISTORY — A DELIBERATE DEPARTURE FROM THIS CODEBASE'S USUAL
// "REJECT THE WHOLE PAYLOAD" DISCIPLINE FOR A CLOSED, SINGLE-VALUE
// PAYLOAD, MADE DELIBERATELY HERE FOR A PAYLOAD THAT IS A COLLECTION.
// `importPublisherLeaderboardClaimHistory()` still rejects the WHOLE
// payload outright (`INVALID_HISTORY`) when its own TOP-LEVEL envelope is
// malformed (wrong/missing `protocolVersion`, `claims` not an array) —
// the same "closed envelope, reject the whole thing" discipline 0.8.122's
// own `isValidClaimPayloadShape()` already holds for a single claim. But
// once the envelope itself is genuine, one malformed or forged entry deep
// inside a long, otherwise-genuine history must not discard every other
// entry alongside it — mirroring `application/
// PublisherLeaderboardClaimHistoryView.js#describePublisherLeaderboardClaimHistory()`'s
// own tolerance for one malformed record inside an otherwise genuine
// array. Every rejected entry is reported, by index and reason, in
// `rejections` — never silently dropped without a trace.
//
// NO ARCHIVE, NO VERIFICATION, NO PERSISTENCE — DELIBERATELY OUT OF SCOPE,
// NOT MERELY OMITTED. Grep this file and `PublicationObservationArchive.js`,
// `PublisherLeaderboardClaimVerificationView.js`, and
// `PublisherLeaderboardClaimVerificationHistoryView.js` do not appear —
// this file never asks whether any transported claim's fingerprints agree
// with any replica's own evidence, and never touches the durable evidence
// archive in any way (the identical restraint 0.8.123's own header already
// holds, continued here rather than revisited). Nothing here calls
// `.save()` on anything or persists across process boundaries; a caller
// owns keeping the `history` this file returns wherever it already keeps
// `LeaderboardClaimHistory` today.
//
// SYNCHRONOUS, DETERMINISTIC, NETWORK-INDEPENDENT. None of these functions
// reads a clock, touches storage, or performs any I/O. Calling any of them
// twice with byte-identical arguments returns a byte-identical result.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE. No claim-history
// DIFFERENCE ("which receipts does replica A have that replica B does
// not?") — real, separately sized, later work ("0.8.127 — Claim History
// Difference Projection"). No claim identity/multiplicity projection
// distinguishing distinct signed claims from duplicate receipts from
// distinct signers ("0.8.128"). No historical claim timeline ("0.8.129").
// No integration with `PublicationObservationArchive` ("0.8.130") —
// continuing the exact discipline 0.8.123 already established. No
// automatic, periodic, or background synchronization of any kind — every
// step here runs only when a caller explicitly calls it.
export const PublisherLeaderboardClaimHistoryExchangeProtocolVersion = 1;

const HISTORY_PAYLOAD_FIELDS = Object.freeze(['protocolVersion', 'claims']);
const CLAIM_ENTRY_FIELDS = Object.freeze(['claim', 'receivedAt', 'origin']);

// exportPublisherLeaderboardClaimHistory() — the ONE, thin export entry
// point. There is no separate `describeXxx()`/`reconstructXxx()` split
// here, unlike 0.8.124/0.8.125's own archive-reading pairs: `history` is
// already the plain, in-memory collection (0.8.123's own
// `LeaderboardClaimHistory` — an ordinary array of `LeaderboardClaimRecord`),
// never something wrapped inside a `PublicationObservationArchive` that
// would need its own reconstruction step — the identical reasoning
// `application/PublisherLeaderboardSnapshotClaimExchange.js#exportPublisherLeaderboardSnapshotClaim()`
// and `application/PublisherLeaderboardClaimHistoryView.js#describePublisherLeaderboardClaimHistory()`
// already hold for their own single-layer shapes.
//
// `history` may be malformed/absent — a non-array degrades to `[]`, and
// any entry that is not a genuine `LeaderboardClaimRecord` is silently
// excluded, the identical tolerance `describePublisherLeaderboardClaimHistory()`
// already holds. Returns a frozen `{ protocolVersion, claims }`, where
// `claims` is every remaining record's own `toJSON()`, in the exact order
// `history` already holds them.
export function exportPublisherLeaderboardClaimHistory(history) {
    const list = Array.isArray(history) ? history : [];
    const claims = list
        .filter((record) => record instanceof LeaderboardClaimRecord)
        .map((record) => record.toJSON());
    return Object.freeze({
        protocolVersion: PublisherLeaderboardClaimHistoryExchangeProtocolVersion,
        claims: Object.freeze(claims)
    });
}

export const PublisherLeaderboardClaimHistoryImportOutcome = Object.freeze({
    IMPORTED: 'imported',
    INVALID_HISTORY: 'invalid-history'
});

// importPublisherLeaderboardClaimHistory() — the untrusted-input side,
// validating and structurally verifying an entire portable history in one
// call, without touching any target `history` of the caller's own (see
// `applyPublisherLeaderboardClaimHistoryExchange()`, below, for the
// caller that does). `payload` may be either the parsed JSON value itself
// or raw text, exactly like `importPublisherLeaderboardSnapshotClaim()`'s
// own `payload` argument. `verifier` is REQUIRED (an
// `identity/LocalAuthorizationVerifier.js`-shaped object) and its absence
// throws — a programmer error, never tolerated as "no claim was signed,"
// the identical distinction 0.8.122's own import already draws.
//
// Returns a frozen:
//
//   {
//       outcome,                 // IMPORTED | INVALID_HISTORY
//       records,                 // LeaderboardClaimRecord[], or null
//       importedCount,           // records.length, or 0
//       rejectedCount,           // entries that failed to import, or 0
//       rejections,              // [{ index, reason }, ...]
//       reason                   // set only when outcome is INVALID_HISTORY
//   }
//
//   IMPORTED         — the top-level envelope was genuine. `records` holds
//                       one genuine `LeaderboardClaimRecord` per entry that
//                       both structurally verified (0.8.122, UNCHANGED)
//                       and constructed successfully, in the exact order
//                       `payload.claims` named them. An empty `claims`
//                       array is a genuine, well-formed IMPORTED result
//                       with `records: []` — importing an empty history is
//                       never an error.
//   INVALID_HISTORY  — the top-level envelope itself was malformed (not
//                       valid JSON, wrong/missing `protocolVersion`,
//                       `claims` not an array). `records` is `null`.
//                       `reason` names which.
//
// Never throws for malformed or unverifiable input. Never touches any
// archive, store, target history, or network of any kind.
export function importPublisherLeaderboardClaimHistory(payload, verifier) {
    if (!verifier || typeof verifier.verifyPublisherLeaderboardSnapshotClaim !== 'function') {
        throw new Error('importPublisherLeaderboardClaimHistory: an authorization verifier capable of verifyPublisherLeaderboardSnapshotClaim is required');
    }

    const json = typeof payload === 'string' ? parseJSONOrNull(payload) : payload;
    if (!isValidHistoryPayloadShape(json)) {
        return Object.freeze({
            outcome: PublisherLeaderboardClaimHistoryImportOutcome.INVALID_HISTORY,
            records: null, importedCount: 0, rejectedCount: 0, rejections: Object.freeze([]),
            reason: 'malformed leaderboard claim history payload'
        });
    }

    const records = [];
    const rejections = [];
    json.claims.forEach((entry, index) => {
        if (!isValidClaimEntryShape(entry)) {
            rejections.push({ index, reason: 'malformed leaderboard claim history entry' });
            return;
        }

        const claimImport = importPublisherLeaderboardSnapshotClaim(entry.claim, verifier);
        if (claimImport.outcome !== PublisherLeaderboardSnapshotClaimImportOutcome.IMPORTED) {
            rejections.push({ index, reason: `${claimImport.outcome}: ${claimImport.reason}` });
            return;
        }

        try {
            records.push(new LeaderboardClaimRecord({ claim: claimImport.claim, receivedAt: entry.receivedAt, origin: entry.origin }));
        } catch (error) {
            rejections.push({ index, reason: error.message });
        }
    });

    return Object.freeze({
        outcome: PublisherLeaderboardClaimHistoryImportOutcome.IMPORTED,
        records: Object.freeze(records),
        importedCount: records.length,
        rejectedCount: rejections.length,
        rejections: Object.freeze(rejections.map((r) => Object.freeze(r))),
        reason: null
    });
}

export const PublisherLeaderboardClaimHistoryExchangeApplyOutcome = Object.freeze({
    APPLIED: 'applied',
    INVALID_HISTORY: 'invalid-history'
});

// applyPublisherLeaderboardClaimHistoryExchange() — the ONE call a caller
// actually needs to catch a target `history` up with a portable payload:
// imports the payload (above), then folds every genuinely NEW receipt
// (see this file's own header, "Receipt Identity") onto the end of
// `history`, via `appendLeaderboardClaimHistoryEntry()` (0.8.123,
// UNCHANGED) — never a competing array-assembly path of its own.
//
// Returns a frozen:
//
//   {
//       outcome,          // APPLIED | INVALID_HISTORY
//       history,           // the resulting LeaderboardClaimHistory, or null
//       existingCount,     // history.length BEFORE this call
//       incomingCount,     // records importPublisherLeaderboardClaimHistory() produced
//       newCount,          // of those, how many were genuinely new receipts
//       duplicateCount,    // of those, how many were already on file (identical receipt)
//       rejectedCount,     // entries importPublisherLeaderboardClaimHistory() rejected
//       rejections         // [{ index, reason }, ...], carried through unchanged
//   }
//
//   APPLIED          — `history` is a NEW `LeaderboardClaimHistory` holding
//                       every record the caller's own `history` already
//                       held, UNCHANGED, in the same order, plus every
//                       genuinely new receipt `payload` named, appended in
//                       order. Applying the IDENTICAL payload to the
//                       IDENTICAL resulting history a second time is a
//                       genuine no-op: `newCount` is `0`, and `history` is
//                       the EXACT SAME instance passed in that second time
//                       — never merely an equal one.
//   INVALID_HISTORY  — `history` is `null`. The payload's own top-level
//                       envelope was malformed — see
//                       `importPublisherLeaderboardClaimHistory()`'s own
//                       header. The caller's own `history` argument is
//                       never touched.
//
// A malformed/absent target `history` is tolerated exactly like
// `appendLeaderboardClaimHistoryEntry()` already tolerates it — degrading
// to `[]` rather than throwing. `verifier` is required, and its absence
// throws — the identical, unchanged contract
// `importPublisherLeaderboardClaimHistory()` already holds.
export function applyPublisherLeaderboardClaimHistoryExchange(history, payload, verifier) {
    const existing = Array.isArray(history) ? history : [];
    const importResult = importPublisherLeaderboardClaimHistory(payload, verifier);
    if (importResult.outcome !== PublisherLeaderboardClaimHistoryImportOutcome.IMPORTED) {
        return Object.freeze({
            outcome: PublisherLeaderboardClaimHistoryExchangeApplyOutcome.INVALID_HISTORY,
            history: null, existingCount: existing.length, incomingCount: 0,
            newCount: 0, duplicateCount: 0, rejectedCount: importResult.rejectedCount,
            rejections: importResult.rejections
        });
    }

    const seenKeys = new Set(existing.map(canonicalReceiptKey));
    let merged = existing;
    let newCount = 0;
    let duplicateCount = 0;
    for (const record of importResult.records) {
        const key = canonicalReceiptKey(record);
        if (seenKeys.has(key)) {
            duplicateCount += 1;
            continue;
        }
        seenKeys.add(key);
        merged = appendLeaderboardClaimHistoryEntry(merged, record);
        newCount += 1;
    }

    return Object.freeze({
        outcome: PublisherLeaderboardClaimHistoryExchangeApplyOutcome.APPLIED,
        history: merged,
        existingCount: existing.length,
        incomingCount: importResult.importedCount,
        newCount, duplicateCount,
        rejectedCount: importResult.rejectedCount,
        rejections: importResult.rejections
    });
}

// The one, uniform receipt identity this file uses for deduplication — see
// this file's own header, "Receipt Identity, Not Claim Identity, Governs
// Deduplication." Exact structural equality of a record's own complete
// `toJSON()` output, mirroring `application/AchievementEvidenceMerge.js`'s
// own `canonicalRecordKey()`.
function canonicalReceiptKey(record) {
    return JSON.stringify(record.toJSON());
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

// The top-level envelope is valid only when it is EXACTLY `{ protocolVersion,
// claims }`, with the one supported `protocolVersion` and `claims` a genuine
// array (possibly empty) — the identical "closed field list, reject the
// whole payload the moment any part fails" discipline 0.8.122's own
// `isValidClaimPayloadShape()` already holds, reused here for the envelope
// alone. Individual entries are validated separately, per entry, and are
// never fatal to the whole envelope — see this file's own header.
function isValidHistoryPayloadShape(json) {
    if (!isPlainObject(json)) return false;
    if (!hasOnlyKeys(json, HISTORY_PAYLOAD_FIELDS)) return false;
    if (!HISTORY_PAYLOAD_FIELDS.every((key) => key in json)) return false;
    if (json.protocolVersion !== PublisherLeaderboardClaimHistoryExchangeProtocolVersion) return false;
    if (!Array.isArray(json.claims)) return false;
    return true;
}

// One entry is valid only when it is EXACTLY `{ claim, receivedAt, origin }`
// — the identical shape `LeaderboardClaimRecord#toJSON()` already produces.
// `claim`'s own shape is validated separately by
// `importPublisherLeaderboardSnapshotClaim()`; `receivedAt`/`origin` are
// validated by `LeaderboardClaimRecord`'s own constructor, immediately
// after.
function isValidClaimEntryShape(entry) {
    if (!isPlainObject(entry)) return false;
    if (!hasOnlyKeys(entry, CLAIM_ENTRY_FIELDS)) return false;
    return CLAIM_ENTRY_FIELDS.every((key) => key in entry);
}
