import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { IpfsPublicationContentVerificationState } from '../application/IpfsPublicationContentVerificationState.js';
import { appendIpfsPublicationRecordHistoryEntry } from '../application/IpfsPublicationRecordHistory.js';
import { appendIpfsPublicationContentVerificationHistoryEntry } from '../application/IpfsPublicationContentVerificationHistory.js';
import {
    IpfsPublicationObservationTimelineEntryKind,
    describeIpfsPublicationObservationTimeline
} from '../application/IpfsPublicationObservationTimelineView.js';

// 0.8.73 — IPFS Publication Observation Timeline.
//
// The flagship this milestone exists to prove: this projection produces a
// TRUE CHRONOLOGICAL ordering over two independently kept, append-only
// histories — even when a later-published record's own verification was
// actually observed BEFORE an earlier-published record's own later
// verification — while never touching either source history's own
// insertion order.
//
//   Record A — publishedAt T1        Record B — publishedAt T3
//   Verification A — observedAt T4   Verification B — observedAt T5
//   Verification A — observedAt T2
//
//   append order kept by the histories themselves:
//     publicationRecordHistory              = [A, B]
//     verificationHistoriesByRecordIndex[0] = [obs(T4), obs(T2)]
//     verificationHistoriesByRecordIndex[1] = [obs(T5)]
//
//   timeline projection (chronological, T1..T5):
//     T1 Publication A, T2 Verification A, T3 Publication B,
//     T4 Verification A, T5 Verification B
//
// Section A: FLAGSHIP — the out-of-order timeline above
// Section B: source histories are never mutated, sorted, or reordered by
//            projecting a timeline over them
// Section C: identical timestamps break ties deterministically, by a fixed
//            insertion order — record 0's own publication and verifications
//            before record 1's, never by object-key iteration luck
// Section D: publication and verification entries stay distinguishable via
//            `kind`, and every entry carries the exact `recordIndex` its
//            own record holds — including two verification entries for two
//            different records that happen to share an identical
//            contentHash
// Section E: all metadata survives projection unchanged, including
//            UNAVAILABLE's own `reason`
// Section F: zero network operations — every function here is pure, with
//            no injected collaborator of any kind
// Section G: no `status`/`confidence`/`health`/`trusted`/`valid`/
//            `canonical` or similar aggregate field appears anywhere in
//            the projection's output
// Section H: malformed/missing input (non-array history, missing
//            per-record verification list, null entries) narrates as
//            empty or is skipped, never throwing
//
// See docs/Roadmap.md, "0.8.73 — IPFS Publication Observation Timeline."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    const forbidden = ['confidence', 'reliability', 'trusted', 'verified', 'canonical', 'preferred', 'valid', 'healthy', 'reliable', 'current', 'score', 'status', 'health'];
    for (const key of Object.keys(obj)) {
        assert(!forbidden.includes(key), `${path}.${key} must never exist — a timeline projects observations, it does not score them`);
    }
}

const CONTENT_A = 'ForkBuild observation timeline content A';
const HASH_A = computeContentHash(CONTENT_A);
const CONTENT_B = 'ForkBuild observation timeline content B';
const HASH_B = computeContentHash(CONTENT_B);

function verification({ state, locator, contentHash, reason = null, observedAt }) {
    return { state, contentHash, locator, reason, observedAt: new Date(observedAt) };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: out-of-order timestamps produce a true
    // chronological projection.
    // ---------------------------------------------------------------
    let publicationHistory = Object.freeze([]);
    let verificationHistoriesByIndex = {};
    {
        const recordA = new IpfsPublicationRecord({
            contentHash: HASH_A, locator: 'ipfs://bafyTIMELINE-A', publishedAt: new Date('2026-08-27T10:00:00Z'),
            publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });
        publicationHistory = appendIpfsPublicationRecordHistoryEntry(publicationHistory, recordA); // T1

        const recordB = new IpfsPublicationRecord({
            contentHash: HASH_B, locator: 'ipfs://bafyTIMELINE-B', publishedAt: new Date('2026-08-27T10:30:00Z'),
            publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        }); // T3
        publicationHistory = appendIpfsPublicationRecordHistoryEntry(publicationHistory, recordB);

        // Record A's own verification history is appended T4 THEN T2 — the
        // observation made earlier in wall-clock time (T2) is appended
        // SECOND, exactly as a real out-of-order UI event (a slow request
        // resolving after a faster later one) could produce.
        const obsA_T4 = verification({ state: IpfsPublicationContentVerificationState.HASH_MATCH, locator: recordA.locator, contentHash: HASH_A, observedAt: '2026-08-27T10:40:00Z' });
        const obsA_T2 = verification({ state: IpfsPublicationContentVerificationState.UNAVAILABLE, locator: recordA.locator, contentHash: HASH_A, reason: 'gateway timed out', observedAt: '2026-08-27T10:10:00Z' });
        verificationHistoriesByIndex[0] = appendIpfsPublicationContentVerificationHistoryEntry(verificationHistoriesByIndex[0], obsA_T4);
        verificationHistoriesByIndex[0] = appendIpfsPublicationContentVerificationHistoryEntry(verificationHistoriesByIndex[0], obsA_T2);
        assert(verificationHistoriesByIndex[0][0] === obsA_T4 && verificationHistoriesByIndex[0][1] === obsA_T2, '1. sanity: Record A\'s own history keeps its append order, T4 before T2');

        const obsB_T5 = verification({ state: IpfsPublicationContentVerificationState.HASH_MATCH, locator: recordB.locator, contentHash: HASH_B, observedAt: '2026-08-27T10:50:00Z' });
        verificationHistoriesByIndex[1] = appendIpfsPublicationContentVerificationHistoryEntry(verificationHistoriesByIndex[1], obsB_T5);

        const timeline = describeIpfsPublicationObservationTimeline(publicationHistory, verificationHistoriesByIndex);
        assert(timeline.count === 5, '2. the timeline holds all five entries — two publications, three verifications');

        const kinds = timeline.entries.map((e) => e.kind);
        const recordIndices = timeline.entries.map((e) => e.recordIndex);
        assert(
            kinds[0] === IpfsPublicationObservationTimelineEntryKind.PUBLICATION &&
            kinds[1] === IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION &&
            kinds[2] === IpfsPublicationObservationTimelineEntryKind.PUBLICATION &&
            kinds[3] === IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION &&
            kinds[4] === IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION,
            '3. the projection is TRUE chronological order T1..T5 — Publication A, Verification A (T2), Publication B, Verification A (T4), Verification B (T5) — not append order'
        );
        assert(recordIndices[0] === 0 && recordIndices[1] === 0 && recordIndices[2] === 1 && recordIndices[3] === 0 && recordIndices[4] === 1,
            '4. every entry names the exact recordIndex its own record holds, including the two interleaved Record A entries');
        assert(timeline.entries[1].state === IpfsPublicationContentVerificationState.UNAVAILABLE, '5. the T2 entry is the UNAVAILABLE observation, appearing chronologically before Publication B despite being appended to Record A\'s own history AFTER the T4 HASH_MATCH');
        assert(timeline.entries[3].state === IpfsPublicationContentVerificationState.HASH_MATCH, '6. the T4 entry appears after Publication B, exactly where T4 belongs chronologically');
        assert(timeline.entries[0].locator === recordA.locator && timeline.entries[2].locator === recordB.locator, '7. publication entries carry their own record\'s own locator');

        publicationHistory = publicationHistory;
        verificationHistoriesByIndex = verificationHistoriesByIndex;
    }
    console.log('✓ Section A (FLAGSHIP): out-of-order observedAt values across two records project into a true chronological timeline, T1..T5');

    // ---------------------------------------------------------------
    // Section B — source histories are never mutated, sorted, or
    // reordered by projecting a timeline over them.
    // ---------------------------------------------------------------
    {
        const publicationOrderBefore = publicationHistory.map((r) => r.locator);
        const verificationOrderBefore = verificationHistoriesByIndex[0].map((v) => v.observedAt.getTime());

        describeIpfsPublicationObservationTimeline(publicationHistory, verificationHistoriesByIndex);
        describeIpfsPublicationObservationTimeline(publicationHistory, verificationHistoriesByIndex);

        assert(publicationHistory.map((r) => r.locator).join(',') === publicationOrderBefore.join(','), '8. the publication record history keeps its own original insertion order after projecting a timeline');
        assert(verificationHistoriesByIndex[0].map((v) => v.observedAt.getTime()).join(',') === verificationOrderBefore.join(','), '9. Record A\'s own verification history keeps its own original append order (T4 before T2) after projecting a timeline');
        assert(Object.isFrozen(publicationHistory), '10. the publication history array is still frozen');
        assert(Object.isFrozen(verificationHistoriesByIndex[0]), '11. Record A\'s own verification history array is still frozen');
    }
    console.log('✓ Section B: the timeline is a view of history, not another history — neither source is ever sorted or mutated');

    // ---------------------------------------------------------------
    // Section C — identical timestamps break ties deterministically.
    // ---------------------------------------------------------------
    {
        const sameInstant = new Date('2026-01-01T00:00:00Z');
        const recordX = new IpfsPublicationRecord({ contentHash: HASH_A, locator: 'ipfs://bafyTIE-X', publishedAt: sameInstant });
        const recordY = new IpfsPublicationRecord({ contentHash: HASH_A, locator: 'ipfs://bafyTIE-Y', publishedAt: sameInstant });
        let history = Object.freeze([]);
        history = appendIpfsPublicationRecordHistoryEntry(history, recordX);
        history = appendIpfsPublicationRecordHistoryEntry(history, recordY);

        const obsX = verification({ state: IpfsPublicationContentVerificationState.HASH_MATCH, locator: recordX.locator, contentHash: HASH_A, observedAt: sameInstant.toISOString() });
        let historiesByIndex = {};
        historiesByIndex[0] = appendIpfsPublicationContentVerificationHistoryEntry(historiesByIndex[0], obsX);

        const timeline1 = describeIpfsPublicationObservationTimeline(history, historiesByIndex);
        const timeline2 = describeIpfsPublicationObservationTimeline(history, historiesByIndex);
        // All three entries are tied on the identical instant. The fixed,
        // deterministic pre-sort order groups every one of record 0's own
        // entries (its publication, then its own verifications, in their
        // own history order) before record 1's — never by whatever order
        // an engine happens to iterate `historiesByIndex`'s own keys in.
        assert(timeline1.entries[0].kind === IpfsPublicationObservationTimelineEntryKind.PUBLICATION && timeline1.entries[0].locator === recordX.locator, '12. record 0\'s own publication comes first among the tied entries');
        assert(timeline1.entries[1].kind === IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION && timeline1.entries[1].state === IpfsPublicationContentVerificationState.HASH_MATCH, '13. record 0\'s own verification, also tied, comes second — record 0\'s own entries precede record 1\'s in the fixed pre-sort order');
        assert(timeline1.entries[2].kind === IpfsPublicationObservationTimelineEntryKind.PUBLICATION && timeline1.entries[2].locator === recordY.locator, '14. record 1\'s own publication, tied with both of record 0\'s own entries, comes last');
        assert(JSON.stringify(timeline1) === JSON.stringify(timeline2), '15. repeated projection over a tied timeline is byte-identical every time');
    }
    console.log('✓ Section C: identical timestamps resolve to a fixed, deterministic order — never object-key iteration luck');

    // ---------------------------------------------------------------
    // Section D — publication/verification stay distinguishable, and
    // record indices survive projection even across a shared contentHash.
    // ---------------------------------------------------------------
    {
        const timeline = describeIpfsPublicationObservationTimeline(publicationHistory, verificationHistoriesByIndex);
        const verificationEntries = timeline.entries.filter((e) => e.kind === IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION);
        const publicationEntries = timeline.entries.filter((e) => e.kind === IpfsPublicationObservationTimelineEntryKind.PUBLICATION);
        assert(verificationEntries.length === 3 && publicationEntries.length === 2, '16. publication and verification entries are cleanly separable by kind');
        assert(verificationEntries.every((e) => typeof e.label === 'string' && e.label.includes(`#${e.recordIndex}`)), '17. every verification entry\'s own label names its own publication record\'s index');

        // Two different records sharing the identical contentHash — a
        // HASH_MATCH for one must never be mistakable for a HASH_MATCH on
        // the other; see docs/Roadmap.md, 0.8.73.
        let sharedHashHistory = Object.freeze([]);
        const recordShared1 = new IpfsPublicationRecord({ contentHash: HASH_A, locator: 'ipfs://bafySHARED-1', publishedAt: new Date('2026-02-01T00:00:00Z') });
        const recordShared2 = new IpfsPublicationRecord({ contentHash: HASH_A, locator: 'ipfs://bafySHARED-2', publishedAt: new Date('2026-02-01T01:00:00Z') });
        sharedHashHistory = appendIpfsPublicationRecordHistoryEntry(sharedHashHistory, recordShared1);
        sharedHashHistory = appendIpfsPublicationRecordHistoryEntry(sharedHashHistory, recordShared2);
        let sharedHistoriesByIndex = {};
        sharedHistoriesByIndex[0] = appendIpfsPublicationContentVerificationHistoryEntry(sharedHistoriesByIndex[0],
            verification({ state: IpfsPublicationContentVerificationState.HASH_MATCH, locator: recordShared1.locator, contentHash: HASH_A, observedAt: '2026-02-01T00:10:00Z' }));
        sharedHistoriesByIndex[1] = appendIpfsPublicationContentVerificationHistoryEntry(sharedHistoriesByIndex[1],
            verification({ state: IpfsPublicationContentVerificationState.HASH_MATCH, locator: recordShared2.locator, contentHash: HASH_A, observedAt: '2026-02-01T01:10:00Z' }));
        const sharedTimeline = describeIpfsPublicationObservationTimeline(sharedHashHistory, sharedHistoriesByIndex);
        const sharedVerifications = sharedTimeline.entries.filter((e) => e.kind === IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION);
        assert(sharedVerifications[0].recordIndex === 0 && sharedVerifications[1].recordIndex === 1, '18. a HASH_MATCH for record 0 and a HASH_MATCH for record 1 stay distinguishable by recordIndex despite an identical contentHash');
        assert(sharedVerifications[0].locator !== sharedVerifications[1].locator, '19. sanity: the two records genuinely name different locators despite the shared contentHash');
    }
    console.log('✓ Section D: publication and verification entries stay distinguishable, and record indices survive projection even across a shared contentHash');

    // ---------------------------------------------------------------
    // Section E — all metadata, including UNAVAILABLE's own reason,
    // survives projection unchanged.
    // ---------------------------------------------------------------
    {
        const timeline = describeIpfsPublicationObservationTimeline(publicationHistory, verificationHistoriesByIndex);
        const unavailableEntry = timeline.entries.find((e) => e.state === IpfsPublicationContentVerificationState.UNAVAILABLE);
        assert(unavailableEntry.reason === 'gateway timed out', '20. an UNAVAILABLE entry\'s own reason survives projection unchanged');
        const publicationEntry0 = timeline.entries.find((e) => e.kind === IpfsPublicationObservationTimelineEntryKind.PUBLICATION && e.recordIndex === 0);
        assert(publicationEntry0.contentHash === HASH_A, '21. a publication entry\'s own contentHash survives projection unchanged');
        assert(publicationEntry0.observedAt.getTime() === new Date('2026-08-27T10:00:00Z').getTime(), '22. a publication entry\'s own observedAt is exactly its record\'s own publishedAt');
    }
    console.log('✓ Section E: every field, including an UNAVAILABLE observation\'s own reason, survives projection unchanged');

    // ---------------------------------------------------------------
    // Section F — zero network operations; every function is pure.
    // ---------------------------------------------------------------
    {
        assert(describeIpfsPublicationObservationTimeline.length === 2, '23. the projection takes exactly two histories — no injected verifier, coordinator, content store, or network client of any kind');
        const first = JSON.stringify(describeIpfsPublicationObservationTimeline(publicationHistory, verificationHistoriesByIndex));
        const second = JSON.stringify(describeIpfsPublicationObservationTimeline(publicationHistory, verificationHistoriesByIndex));
        assert(first === second, '24. calling the projection twice on byte-identical input returns byte-identical output');
    }
    console.log('✓ Section F: zero network operations, and the projection is pure — no injected collaborator of any kind');

    // ---------------------------------------------------------------
    // Section G — no aggregate/scoring vocabulary anywhere.
    // ---------------------------------------------------------------
    {
        const timeline = describeIpfsPublicationObservationTimeline(publicationHistory, verificationHistoriesByIndex);
        assertNeverScored(timeline, 'timeline');
        for (const entry of timeline.entries) assertNeverScored(entry, 'timeline.entries[]');
    }
    console.log('✓ Section G: no status/confidence/health/trusted/valid/canonical or similar aggregate field appears anywhere in the projection');

    // ---------------------------------------------------------------
    // Section H — malformed/missing input degrades gracefully.
    // ---------------------------------------------------------------
    {
        const empty = describeIpfsPublicationObservationTimeline(null, null);
        assert(empty.count === 0 && empty.entries.length === 0, '25. a null publication history and null verification map project as an empty, non-throwing timeline');
        assert(Object.isFrozen(empty) && Object.isFrozen(empty.entries), '26. an empty projection result is frozen, including its own entries array');

        const noVerifications = describeIpfsPublicationObservationTimeline(publicationHistory, {});
        assert(noVerifications.count === 2, '27. an empty verification map still projects both publications');

        const withHoles = describeIpfsPublicationObservationTimeline([publicationHistory[0], null, undefined], { 0: [null, undefined] });
        assert(withHoles.count === 1, '28. null/undefined records and null/undefined observations are skipped rather than projected as placeholders');
    }
    console.log('✓ Section H: malformed or missing input narrates as an empty or partial timeline, never throwing');

    console.log('\nAll IpfsPublicationObservationTimelineView tests passed.');
}

run().catch((error) => {
    console.error('IpfsPublicationObservationTimelineView.test.js FAILED:', error);
    process.exitCode = 1;
});
