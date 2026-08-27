import { IpfsPublicationMethod } from './IpfsPublicationRecord.js';

const PUBLICATION_METHOD_LABELS = {
    [IpfsPublicationMethod.KUBO]: 'Local IPFS node (Kubo)',
    [IpfsPublicationMethod.REMOTE_PINNING]: 'Remote pinning provider'
};

// 0.8.71 — IPFS Publication Record History & Inspection.
//
// application/IpfsPublicationRecordHistory.js turns repeated publish
// attempts into an accumulated SEQUENCE of application/
// IpfsPublicationRecord.js instances. This file turns that sequence into
// the plain, chronological narration a "Publication History" disclosure
// shows — mirroring application/BitcoinAnchorConfirmationObservationHistoryView.js
// (0.8.56)'s own identical shape, one domain over:
//
//   describeIpfsPublicationMethodLabel(method)
//     KUBO            → "Local IPFS node (Kubo)"
//     REMOTE_PINNING  → "Remote pinning provider"
//     null/unknown    → null
//
//   describeIpfsPublicationRecordHistoryEntry(record)
//     → { contentHash, locator, publishedAt, publicationMethod,
//          publicationMethodLabel }
//
//   describeIpfsPublicationRecordHistory(history)
//     → { count, records: [...] }, in the SAME order `history` itself
//       holds them — oldest first, exactly the order application/
//       IpfsPublicationRecordHistory.js#appendIpfsPublicationRecordHistoryEntry()
//       already appends in. Never sorted, grouped, or reordered.
//
// THE ONE RULE THIS FILE EXISTS TO ENFORCE, restated one domain over from
// application/BitcoinAnchorConfirmationObservationHistoryView.js's own: the
// vocabulary stays factual. A record names WHAT was published, WHERE, and
// WHEN — never whether it is "verified," "trustworthy," "current,"
// "healthy," "canonical," "valid," "preferred," or "reliable." Publication
// history alone cannot establish any of those things — that question
// belongs entirely to application/IpfsPublicationContentVerifier.js's own,
// separately kept observations (see docs/Principles.md, "A Publication
// Record Is A Historical Fact; Whether It Still Resolves Is A Separate,
// Later Question (0.8.71)").
//
// Every field this function returns is carried through UNCHANGED from the
// record itself — `contentHash`, `locator`, `publishedAt`, and
// `publicationMethod` are never recomputed, re-derived, or filled in;
// only `publicationMethodLabel` is new, and it adds a sentence for an
// existing `publicationMethod`, never a new fact.
export function describeIpfsPublicationMethodLabel(method) {
    return PUBLICATION_METHOD_LABELS[method] || null;
}

export function describeIpfsPublicationRecordHistoryEntry(record) {
    if (!record) return null;
    return Object.freeze({
        contentHash: record.contentHash,
        locator: record.locator,
        publishedAt: record.publishedAt,
        publicationMethod: record.publicationMethod,
        publicationMethodLabel: describeIpfsPublicationMethodLabel(record.publicationMethod)
    });
}

export function describeIpfsPublicationRecordHistory(history) {
    const records = (Array.isArray(history) ? history : [])
        .map((record) => describeIpfsPublicationRecordHistoryEntry(record))
        .filter((entry) => entry !== null);
    return Object.freeze({ count: records.length, records: Object.freeze(records) });
}
