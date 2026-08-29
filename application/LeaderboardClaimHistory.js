import { LeaderboardClaimRecord } from './LeaderboardClaimRecord.js';

// 0.8.123 — Signed Leaderboard Claim Archive: the append-only history.
//
// The durable counterpart of `application/LeaderboardClaimRecord.js` —
// mirroring `application/PublicationReferenceRecordHistory.js` (0.8.104)
// exactly, one relationship over:
//
//   []
//     │  appendLeaderboardClaimHistoryEntry(history, recordA)
//     ▼
//   [recordA]
//     │  appendLeaderboardClaimHistoryEntry(history, recordB)
//     ▼
//   [recordA, recordB]
//
// APPENDED TO, NEVER OVERWRITTEN, NEVER MUTATED, NEVER REORDERED OR
// DEDUPLICATED. Alice's claim received twice — once directly, once relayed
// through Bob — is TWO independent entries here, never collapsed into "one
// claim, seen twice." Three different signers each claiming the identical
// snapshot is three independent entries, never a count, an average, or an
// endorsement. Multiplicity is the fact this file exists to preserve —
// see `application/LeaderboardClaimRecord.js`'s own header, "A Receipt,
// Never A Verdict," for why this file adds no reduction on top of it.
//
// LOOKUP IS BY EXPLICIT FIELD, NEVER BY RESEMBLANCE — AND NEVER A TRUST
// DECISION. The three `findXxx()` functions below each answer a narrow,
// factual question ("which records on file name this exact signer /
// snapshot / evidence set") — never "which of these claims should I
// believe." They are LOOKUPS, exactly like `application/
// PublicationReferenceRecordHistory.js`'s own `findPublicationReferenceRecordsBySource()`/
// `findPublicationReferenceRecordsByReferenced()` are lookups and not
// endorsements one relationship down. A caller wanting to know whether a
// found record's claim still agrees with THIS replica's own evidence
// still has to run it through `application/
// PublisherLeaderboardSnapshotClaimVerification.js` (0.8.121, UNCHANGED)
// itself — this file never does that on a caller's behalf.
//
// EVERY LOOKUP RETURNS RESULTS IN THE EXACT ORDER `history` ALREADY HOLDS
// THEM — oldest received first, never sorted, grouped, or ranked by any
// field. If two records tie on the field being searched, their relative
// order in the returned list is the same relative order they hold in
// `history` itself.
//
// NO DEDUPLICATION HERE — IF YOU WANT IT, IT IS A SEPARATE, LATER
// PROJECTION. Receiving the byte-identical claim a second time (say, via
// `application/ReceivePublisherLeaderboardSnapshotClaimUseCase.js`)
// appends a second, independent `LeaderboardClaimRecord` — this file
// never inspects `record.claim.id` to decide whether to skip an append.
// A future "distinct claims on file" or "claims received more than once"
// projection is real, separately sized, later work, exactly the same
// restraint `application/PublicationReferenceRecordHistory.js`'s own
// header already draws for reference counts vs. distinct referencer
// counts.
export function appendLeaderboardClaimHistoryEntry(history, record) {
    const existing = Array.isArray(history) ? history : [];
    if (!record) return Object.freeze(existing.slice());
    return Object.freeze([...existing, record]);
}

// Every record in `history` whose own claim was signed by exactly this
// `signerIdentityId` — a did:key, compared as plain string identity,
// never fuzzily matched.
export function findLeaderboardClaimRecordsBySignerIdentityId(history, signerIdentityId) {
    const list = Array.isArray(history) ? history : [];
    if (!signerIdentityId || typeof signerIdentityId !== 'string') return Object.freeze([]);
    return Object.freeze(list.filter((record) => record instanceof LeaderboardClaimRecord && record.claim.signerIdentityId === signerIdentityId));
}

// Every record in `history` whose own claim names exactly this
// `snapshotFingerprint` — the cryptographic claim digest 0.8.121 defined
// (see `core/PublisherLeaderboardSnapshotClaim.js`'s own header, "Two
// Kinds Of 'Snapshot Identity'"), never the semantic
// (evidenceFingerprint, policyVersion) pair.
export function findLeaderboardClaimRecordsBySnapshotFingerprint(history, snapshotFingerprint) {
    const list = Array.isArray(history) ? history : [];
    if (!snapshotFingerprint || typeof snapshotFingerprint !== 'string') return Object.freeze([]);
    return Object.freeze(list.filter((record) => record instanceof LeaderboardClaimRecord && record.claim.snapshotFingerprint === snapshotFingerprint));
}

// Every record in `history` whose own claim names exactly this
// `evidenceFingerprint` — 0.8.116's own whole-evidence-set fingerprint.
// Several signers can, and often will, independently sign claims sharing
// the identical evidenceFingerprint (they agree on the underlying facts)
// while disagreeing on `policyVersion` or `snapshotFingerprint` — this
// lookup surfaces all of them, side by side, exactly as received.
export function findLeaderboardClaimRecordsByEvidenceFingerprint(history, evidenceFingerprint) {
    const list = Array.isArray(history) ? history : [];
    if (!evidenceFingerprint || typeof evidenceFingerprint !== 'string') return Object.freeze([]);
    return Object.freeze(list.filter((record) => record instanceof LeaderboardClaimRecord && record.claim.evidenceFingerprint === evidenceFingerprint));
}
