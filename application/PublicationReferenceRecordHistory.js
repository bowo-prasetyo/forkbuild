// 0.8.104 — Explicit Publication Reference Relationship.
//
// The append-only counterpart of application/PublicationReferenceRecord.js
// — mirroring application/BaseAnchorPublicationRecordHistory.js (0.8.99)
// exactly, one relationship over:
//
//   []
//     │  appendPublicationReferenceRecordHistoryEntry(history, referenceA)
//     ▼
//   [referenceA]
//     │  appendPublicationReferenceRecordHistoryEntry(history, referenceB)
//     ▼
//   [referenceA, referenceB]
//
// APPENDED TO, NEVER OVERWRITTEN, NEVER MUTATED, NEVER REORDERED OR
// DEDUPLICATED. Bob referencing Alice's publication A three times, plus
// Carol referencing it once, is FOUR independent entries here — never
// collapsed into "Alice's publication A has one referencer" or "four
// references." REFERENCE COUNT and DISTINCT REFERENCING PUBLISHER COUNT
// are two different facts this file deliberately keeps unmerged; see this
// class's own header, "One Further Rule," for why. Counting distinct
// referencing identities is real, separately sized future work — this file
// adds no such count of its own.
//
// LOOKUP IS BY EXPLICIT IDENTITY ALONE — NEVER BY `contentHash`.
// `findPublicationReferenceRecordsBySource()`/
// `findPublicationReferenceRecordsByReferenced()` below are the only two
// lookups this file offers, each matching through
// `BlockchainPublicationIdentity#sameAs()` (0.8.89) — the identical
// explicit-identity discipline application/
// BitcoinAnchorPublicationRecordHistory.js's own `anchorId`-only lookup
// already holds, one layer up: identity, never resemblance.
export function appendPublicationReferenceRecordHistoryEntry(history, record) {
    const existing = Array.isArray(history) ? history : [];
    if (!record) return Object.freeze(existing.slice());
    return Object.freeze([...existing, record]);
}

// Every record in `history` whose own `sourcePublicationIdentity` names the
// SAME publication as `sourceIdentity` — i.e. every reference THAT
// publication makes outward, to anything. In the exact order `history`
// already holds them; never sorted, grouped, or deduplicated.
export function findPublicationReferenceRecordsBySource(history, sourceIdentity) {
    const list = Array.isArray(history) ? history : [];
    if (!sourceIdentity || typeof sourceIdentity.sameAs !== 'function') return Object.freeze([]);
    return Object.freeze(list.filter((record) => record && record.sourcePublicationIdentity.sameAs(sourceIdentity)));
}

// Every record in `history` whose own `referencedPublicationIdentity`
// names the SAME publication as `referencedIdentity` — i.e. every reference
// pointing INTO that publication, from anywhere. This is the raw material
// a future "referenced by another publication" achievement (see docs/
// Roadmap.md, 0.8.104, "What's left") would read; this file computes no
// such achievement, count, or distinct-publisher reduction of its own.
export function findPublicationReferenceRecordsByReferenced(history, referencedIdentity) {
    const list = Array.isArray(history) ? history : [];
    if (!referencedIdentity || typeof referencedIdentity.sameAs !== 'function') return Object.freeze([]);
    return Object.freeze(list.filter((record) => record && record.referencedPublicationIdentity.sameAs(referencedIdentity)));
}
