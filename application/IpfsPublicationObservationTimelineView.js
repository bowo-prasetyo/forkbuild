import { describeIpfsPublicationContentVerification } from './IpfsPublicationContentVerificationView.js';

// 0.8.73 — IPFS Publication Observation Timeline.
//
// application/IpfsPublicationRecordHistory.js (0.8.71) and application/
// IpfsPublicationContentVerificationHistory.js (0.8.72) each already hold
// their own append-only sequence — one of PUBLICATIONS, one of repeated
// content-retrieval OBSERVATIONS made against a specific publication
// record. 0.8.72's own "Deliberately excluded" list named exactly this
// gap: a person currently has to read the Publication History disclosure
// and then, separately, expand each record's own Verification History to
// reconstruct what happened when. This file closes that gap with a THIRD,
// purely derived thing — a single chronological PROJECTION over both
// existing histories, read together:
//
//   Record History:        [ Record A (T1) ,           Record B (T3) ]
//   Verifications by index: { 0: [obs(T4), obs(T2)],    1: [obs(T5)] }
//                                    │
//                                    ▼ describeIpfsPublicationObservationTimeline()
//   Timeline:  T1 Publication A, T2 Verification A, T3 Publication B,
//              T4 Verification A, T5 Verification B
//
// THIS FILE NEVER SORTS, MUTATES, OR REORDERS EITHER SOURCE HISTORY. Both
// `publicationRecordHistory` and `verificationHistoriesByRecordIndex` are
// only ever read — `Array#forEach`, never `Array#sort` — and every value
// returned to a caller is a brand-new array built by this function, never
// the same array reference handed in. The source histories keep their own
// insertion order, exactly as application/IpfsPublicationRecordHistory
// .js#appendIpfsPublicationRecordHistoryEntry() and application/
// IpfsPublicationContentVerificationHistory
// .js#appendIpfsPublicationContentVerificationHistoryEntry() already left
// them — append order for a history, chronological order for THIS
// timeline are two different, independently maintained orderings over the
// same underlying facts:
//
//   history → unchanged
//                │
//                ▼
//          timeline projection (a new, sorted array)
//                │
//                ▼
//          chronological display
//
// A tie in `observedAt`/`publishedAt` (down to the same millisecond) is
// broken deterministically — never by insertion-order luck of whatever
// object-key iteration order a caller's `verificationHistoriesByRecordIndex`
// happens to have. Every entry is built into one flat array in a fixed,
// reproducible order first — record 0's own publication, then every one of
// record 0's own verifications in their own history order, then record 1's
// own publication, then its own verifications, and so on — and only THAT
// fixed-order array is ever sorted, with a stable sort that keeps that same
// relative order for anything tied on timestamp. Calling this function
// twice on byte-identical input always returns a byte-identical result.
//
// EACH VERIFICATION ENTRY NAMES ITS OWN PUBLICATION RECORD. `recordIndex`
// on every entry — publication or verification — is the exact index that
// entry's own record holds in `publicationRecordHistory`, unchanged from
// how application/IpfsPublicationRecordHistoryView.js and application/
// IpfsPublicationContentVerificationHistoryView.js already key their own
// per-record sections. A HASH_MATCH entry naming `recordIndex: 0` is never
// ambiguous with a HASH_MATCH entry naming `recordIndex: 1`, even when both
// records share an identical `contentHash` — see docs/Roadmap.md, 0.8.73,
// "the important part is this should be presentation-only."
//
// NO AGGREGATE FIELD OF ANY KIND. This projection never computes a
// `status`, `confidence`, `health`, `trusted`, `valid`, `canonical`, or
// "latest overall state" for a record, a publication, or the timeline as a
// whole — it only ever re-orders facts application/
// IpfsPublicationContentVerificationView.js's own describeIpfsPublicationContentVerification()
// (0.8.70) and the raw `IpfsPublicationRecord` fields already state,
// unchanged. See docs/Principles.md, "The UI Displays Observations; It
// Does Not Turn Them Into A Verdict (0.8.57)," held here once more for a
// projection spanning two histories rather than one.
//
// Pure and stateless: no constructor, no network access, no history of its
// own — this file performs ZERO network operations, and has nothing to
// refresh. Opening a timeline built from this projection reads only
// whatever the caller's own already-in-memory histories currently hold;
// new facts only ever enter through the existing, explicit "Publish"/
// "Verify Again" actions those histories are already appended through.
export const IpfsPublicationObservationTimelineEntryKind = Object.freeze({
    PUBLICATION: 'publication',
    CONTENT_VERIFICATION: 'content-verification'
});

function publicationEntry(record, recordIndex) {
    return Object.freeze({
        observedAt: record.publishedAt,
        kind: IpfsPublicationObservationTimelineEntryKind.PUBLICATION,
        recordIndex,
        label: `Publication #${recordIndex}`,
        locator: record.locator,
        contentHash: record.contentHash
    });
}

function contentVerificationEntry(observation, recordIndex) {
    const described = describeIpfsPublicationContentVerification(observation);
    return Object.freeze({
        observedAt: described.observedAt,
        kind: IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION,
        recordIndex,
        label: `Content retrieval — Publication #${recordIndex}`,
        state: described.state,
        stateLabel: described.stateLabel,
        locator: described.locator,
        contentHash: described.contentHash,
        reason: described.reason
    });
}

function observedAtMillis(entry) {
    return entry.observedAt instanceof Date ? entry.observedAt.getTime() : 0;
}

export function describeIpfsPublicationObservationTimeline(publicationRecordHistory, verificationHistoriesByRecordIndex) {
    const records = Array.isArray(publicationRecordHistory) ? publicationRecordHistory : [];
    const historiesByIndex = (verificationHistoriesByRecordIndex && typeof verificationHistoriesByRecordIndex === 'object')
        ? verificationHistoriesByRecordIndex
        : {};

    const insertionOrder = [];
    records.forEach((record, recordIndex) => {
        if (!record) return;
        insertionOrder.push(publicationEntry(record, recordIndex));

        const verificationHistory = Array.isArray(historiesByIndex[recordIndex]) ? historiesByIndex[recordIndex] : [];
        verificationHistory.forEach((observation) => {
            if (!observation) return;
            insertionOrder.push(contentVerificationEntry(observation, recordIndex));
        });
    });

    const entries = insertionOrder
        .map((entry, sourceIndex) => ({ entry, sourceIndex }))
        .sort((a, b) => {
            const delta = observedAtMillis(a.entry) - observedAtMillis(b.entry);
            return delta !== 0 ? delta : a.sourceIndex - b.sourceIndex;
        })
        .map(({ entry }) => entry);

    return Object.freeze({ count: entries.length, entries: Object.freeze(entries) });
}
