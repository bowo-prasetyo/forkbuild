import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord } from '../application/IpfsPublicationRecord.js';
import { IpfsPublicationContentVerificationState } from '../application/IpfsPublicationContentVerificationState.js';
import { appendIpfsPublicationRecordHistoryEntry } from '../application/IpfsPublicationRecordHistory.js';
import { appendIpfsPublicationContentVerificationHistoryEntry } from '../application/IpfsPublicationContentVerificationHistory.js';
import { appendBitcoinAnchorConfirmationObservationHistoryEntry } from '../application/BitcoinAnchorConfirmationObservationHistory.js';
import { BitcoinAnchorBroadcastState } from '../application/BitcoinAnchorBroadcastState.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { BitcoinAnchorContentProofState } from '../application/BitcoinAnchorContentProofState.js';
import {
    PublicationObservationTimelineDomain,
    PublicationObservationTimelineEntryKind,
    describePublicationObservationTimeline
} from '../application/PublicationObservationTimelineView.js';

// 0.8.74 — Cross-Domain Publication Observation Timeline.
//
// The flagship this milestone exists to prove: TWO DIFFERENT PUBLICATIONS
// that happen to share an IDENTICAL content hash stay provably distinct on
// one merged, chronological, cross-domain timeline — content identity is
// never allowed to stand in for publication identity, even though nothing
// about the two publications' own facts would otherwise look different.
//
//   Publication A (recordIndex 0)      Publication B (recordIndex 1)
//     IPFS  -> CID-A                     IPFS  -> CID-B
//     Bitcoin -> TX-A (anchor "a")       Bitcoin -> TX-B (anchor "b")
//     contentHash(A) === contentHash(B)
//
//   Deliberately interleaved, out-of-domain-order:
//     T1  IPFS      Publication A
//     T2  Bitcoin   Broadcast A
//     T3  IPFS      Publication B
//     T4  Bitcoin   Broadcast B
//     T5  IPFS      Verification A -> HASH_MATCH
//     T6  Bitcoin   Confirmation B -> CONFIRMED
//     T7  Bitcoin   Content proof A -> HASH_MISMATCH
//
// Section A: FLAGSHIP — the interleaved, cross-domain, two-publication
//            scenario above
// Section B: source inputs are never mutated, sorted, or reordered by
//            projecting a timeline over them
// Section C: identical timestamps break ties deterministically, by a fixed
//            insertion order (every IPFS entry, then every Bitcoin anchor's
//            own entries in anchor order)
// Section D: every entry retains its own `domain` — an IPFS entry's own
//            kind is never presentable as a Bitcoin kind, and vice versa
// Section E: `recordIndex` is never inferred from a shared `contentHash` —
//            a caller that supplies no association gets `recordIndex: null`
//            back, never a guessed one
// Section F: `broadcastedAt` is the one caller-supplied timestamp with no
//            underlying domain field of its own; an anchor without one
//            contributes no broadcast entry
// Section G: zero network operations; every function here is pure
// Section H: no `status`/`confidence`/`health`/`trusted`/`valid`/
//            `canonical` or similar aggregate field appears anywhere in the
//            projection, on either domain's own entries
// Section I: malformed/missing input degrades to an empty or partial
//            timeline, never throwing
//
// See docs/Roadmap.md, "0.8.74 — Cross-Domain Publication Observation
// Timeline."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    const forbidden = ['confidence', 'reliability', 'trusted', 'verified', 'canonical', 'preferred', 'valid', 'healthy', 'reliable', 'current', 'score', 'status', 'health'];
    for (const key of Object.keys(obj)) {
        assert(!forbidden.includes(key), `${path}.${key} must never exist — a cross-domain timeline projects observations, it does not score them`);
    }
}

const SHARED_CONTENT = 'ForkBuild cross-domain timeline content, shared by two publications';
const SHARED_HASH = computeContentHash(SHARED_CONTENT);

function confirmationObservation({ txid, state, blockHash = null, blockHeight = null, confirmationCount = null, reason = null, observedAt }) {
    return { txid, state, blockHash, blockHeight, confirmationCount, reason, observedAt: new Date(observedAt) };
}

function contentProofObservation({ state, contentHash, reason = null, observedAt }) {
    return { state, contentHash, reason, observedAt: new Date(observedAt) };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: two publications, identical content hash,
    // interleaved cross-domain observations.
    // ---------------------------------------------------------------
    let ipfsRecords = Object.freeze([]);
    let verificationHistoriesByRecordIndex = {};
    let anchors;
    let confirmationHistoriesByAnchorId = {};
    let proofObservationsByAnchorId = {};

    {
        const recordA = new IpfsPublicationRecord({ contentHash: SHARED_HASH, locator: 'ipfs://bafyCROSS-A', publishedAt: new Date('2026-08-27T10:02:00Z') }); // T1
        ipfsRecords = appendIpfsPublicationRecordHistoryEntry(ipfsRecords, recordA);
        const recordB = new IpfsPublicationRecord({ contentHash: SHARED_HASH, locator: 'ipfs://bafyCROSS-B', publishedAt: new Date('2026-08-27T10:08:00Z') }); // T3
        ipfsRecords = appendIpfsPublicationRecordHistoryEntry(ipfsRecords, recordB);

        const verificationA = { state: IpfsPublicationContentVerificationState.HASH_MATCH, contentHash: SHARED_HASH, locator: recordA.locator, reason: null, observedAt: new Date('2026-08-27T10:15:00Z') }; // T5
        verificationHistoriesByRecordIndex[0] = appendIpfsPublicationContentVerificationHistoryEntry(verificationHistoriesByRecordIndex[0], verificationA);

        anchors = [
            {
                recordIndex: 0,
                anchorId: 'anchor-a',
                txid: 'TX-A',
                broadcastedAt: new Date('2026-08-27T10:04:00Z'), // T2
                broadcast: { state: BitcoinAnchorBroadcastState.BROADCASTED, broadcasted: true, txid: 'TX-A', reason: null }
            },
            {
                recordIndex: 1,
                anchorId: 'anchor-b',
                txid: 'TX-B',
                broadcastedAt: new Date('2026-08-27T10:10:00Z'), // T4
                broadcast: { state: BitcoinAnchorBroadcastState.BROADCASTED, broadcasted: true, txid: 'TX-B', reason: null }
            }
        ];

        confirmationHistoriesByAnchorId['anchor-b'] = appendBitcoinAnchorConfirmationObservationHistoryEntry([],
            confirmationObservation({ txid: 'TX-B', state: BitcoinAnchorConfirmationState.CONFIRMED, blockHash: 'block-b', blockHeight: 123456, confirmationCount: 1, observedAt: '2026-08-27T10:22:00Z' })); // T6

        proofObservationsByAnchorId['anchor-a'] = [
            contentProofObservation({ state: BitcoinAnchorContentProofState.HASH_MISMATCH, contentHash: SHARED_HASH, reason: 'OP_RETURN hash does not match', observedAt: '2026-08-27T10:30:00Z' }) // T7
        ];

        const timeline = describePublicationObservationTimeline({
            ipfs: { publicationRecords: ipfsRecords, verificationHistoriesByRecordIndex },
            bitcoin: { anchors, confirmationHistoriesByAnchorId, proofObservationsByAnchorId }
        });

        assert(timeline.count === 7, '1. the timeline holds all seven cross-domain entries');

        const kinds = timeline.entries.map((e) => e.kind);
        const domains = timeline.entries.map((e) => e.domain);
        assert(
            domains[0] === PublicationObservationTimelineDomain.IPFS &&
            domains[1] === PublicationObservationTimelineDomain.BITCOIN &&
            domains[2] === PublicationObservationTimelineDomain.IPFS &&
            domains[3] === PublicationObservationTimelineDomain.BITCOIN &&
            domains[4] === PublicationObservationTimelineDomain.IPFS &&
            domains[5] === PublicationObservationTimelineDomain.BITCOIN &&
            domains[6] === PublicationObservationTimelineDomain.BITCOIN,
            '2. the projection is TRUE chronological order across both domains, T1..T7'
        );
        assert(
            kinds[0] === PublicationObservationTimelineEntryKind.IPFS_PUBLICATION &&
            kinds[1] === PublicationObservationTimelineEntryKind.BITCOIN_BROADCAST &&
            kinds[2] === PublicationObservationTimelineEntryKind.IPFS_PUBLICATION &&
            kinds[3] === PublicationObservationTimelineEntryKind.BITCOIN_BROADCAST &&
            kinds[4] === PublicationObservationTimelineEntryKind.IPFS_CONTENT_VERIFICATION &&
            kinds[5] === PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION &&
            kinds[6] === PublicationObservationTimelineEntryKind.BITCOIN_CONTENT_PROOF,
            '3. every entry\'s own kind matches T1..T7 exactly: PubA, BroadcastA, PubB, BroadcastB, VerificationA, ConfirmationB, ProofA'
        );

        // The invariant: recordIndex 0 (Publication A) and recordIndex 1
        // (Publication B) stay completely distinguishable throughout, even
        // though contentHash(A) === contentHash(B) everywhere.
        const recordIndices = timeline.entries.map((e) => e.recordIndex);
        assert(recordIndices.join(',') === '0,0,1,1,0,1,0', '4. every entry\'s own recordIndex is exactly which publication it belongs to — A, A, B, B, A, B, A');

        assert(timeline.entries[0].locator === recordA.locator, '5. T1 is Publication A\'s own IPFS entry, naming CID-A');
        assert(timeline.entries[1].txid === 'TX-A' && timeline.entries[1].anchorId === 'anchor-a', '6. T2 is Publication A\'s own Bitcoin broadcast, naming TX-A');
        assert(timeline.entries[2].locator === recordB.locator, '7. T3 is Publication B\'s own IPFS entry, naming CID-B');
        assert(timeline.entries[3].txid === 'TX-B' && timeline.entries[3].anchorId === 'anchor-b', '8. T4 is Publication B\'s own Bitcoin broadcast, naming TX-B');
        assert(timeline.entries[4].state === IpfsPublicationContentVerificationState.HASH_MATCH, '9. T5 is Publication A\'s own IPFS verification, HASH_MATCH');
        assert(timeline.entries[5].state === BitcoinAnchorConfirmationState.CONFIRMED && timeline.entries[5].blockHeight === 123456, '10. T6 is Publication B\'s own Bitcoin confirmation, CONFIRMED at block 123456');
        assert(timeline.entries[6].state === BitcoinAnchorContentProofState.HASH_MISMATCH, '11. T7 is Publication A\'s own Bitcoin content proof, HASH_MISMATCH — never confused with Publication B\'s own CONFIRMED at T6, despite the identical contentHash');

        // Both publications' own facts, read together, stay honestly
        // contradictory-looking (A: verified match on IPFS, but a mismatch
        // on Bitcoin) — this file never resolves, hides, or scores that.
        const publicationAEntries = timeline.entries.filter((e) => e.recordIndex === 0);
        assert(publicationAEntries.length === 4, '12. Publication A\'s own four entries (IPFS pub, Bitcoin broadcast, IPFS verification, Bitcoin proof) are cleanly selectable by recordIndex alone');
    }
    console.log('✓ Section A (FLAGSHIP): two publications sharing an identical content hash stay provably distinct across an interleaved, cross-domain timeline');

    // ---------------------------------------------------------------
    // Section B — source inputs are never mutated, sorted, or reordered.
    // ---------------------------------------------------------------
    {
        const ipfsOrderBefore = ipfsRecords.map((r) => r.locator);
        const anchorOrderBefore = anchors.map((a) => a.anchorId);
        const confirmationOrderBefore = confirmationHistoriesByAnchorId['anchor-b'].map((o) => o.observedAt.getTime());

        describePublicationObservationTimeline({
            ipfs: { publicationRecords: ipfsRecords, verificationHistoriesByRecordIndex },
            bitcoin: { anchors, confirmationHistoriesByAnchorId, proofObservationsByAnchorId }
        });

        assert(ipfsRecords.map((r) => r.locator).join(',') === ipfsOrderBefore.join(','), '13. the IPFS publication record history keeps its own original insertion order');
        assert(anchors.map((a) => a.anchorId).join(',') === anchorOrderBefore.join(','), '14. the caller\'s own anchors array keeps its own original order');
        assert(confirmationHistoriesByAnchorId['anchor-b'].map((o) => o.observedAt.getTime()).join(',') === confirmationOrderBefore.join(','), '15. anchor-b\'s own confirmation history keeps its own original append order');
        assert(Object.isFrozen(ipfsRecords), '16. the IPFS publication history array is still frozen');
    }
    console.log('✓ Section B: neither domain\'s own source history is ever mutated, sorted, or reordered by projecting a cross-domain timeline over them');

    // ---------------------------------------------------------------
    // Section C — identical timestamps resolve to a fixed, deterministic
    // order: every IPFS entry, then every Bitcoin anchor's own entries, in
    // anchor order.
    // ---------------------------------------------------------------
    {
        const sameInstant = new Date('2026-01-01T00:00:00Z');
        const recordX = new IpfsPublicationRecord({ contentHash: SHARED_HASH, locator: 'ipfs://bafyTIE-X', publishedAt: sameInstant });
        let tiedRecords = Object.freeze([]);
        tiedRecords = appendIpfsPublicationRecordHistoryEntry(tiedRecords, recordX);

        const tiedAnchors = [{
            recordIndex: 0,
            anchorId: 'anchor-tied',
            txid: 'TX-TIE',
            broadcastedAt: sameInstant,
            broadcast: { state: BitcoinAnchorBroadcastState.BROADCASTED, broadcasted: true, txid: 'TX-TIE', reason: null }
        }];

        const timeline1 = describePublicationObservationTimeline({
            ipfs: { publicationRecords: tiedRecords, verificationHistoriesByRecordIndex: {} },
            bitcoin: { anchors: tiedAnchors, confirmationHistoriesByAnchorId: {}, proofObservationsByAnchorId: {} }
        });
        const timeline2 = describePublicationObservationTimeline({
            ipfs: { publicationRecords: tiedRecords, verificationHistoriesByRecordIndex: {} },
            bitcoin: { anchors: tiedAnchors, confirmationHistoriesByAnchorId: {}, proofObservationsByAnchorId: {} }
        });

        assert(timeline1.entries[0].domain === PublicationObservationTimelineDomain.IPFS, '17. among tied entries, the IPFS entry comes first — the fixed pre-sort order, never object-key iteration luck');
        assert(timeline1.entries[1].domain === PublicationObservationTimelineDomain.BITCOIN && timeline1.entries[1].kind === PublicationObservationTimelineEntryKind.BITCOIN_BROADCAST, '18. the tied Bitcoin broadcast entry comes second');
        assert(JSON.stringify(timeline1) === JSON.stringify(timeline2), '19. repeated projection over a tied timeline is byte-identical every time');
    }
    console.log('✓ Section C: identical timestamps resolve to a fixed, deterministic order — every IPFS entry, then every Bitcoin anchor\'s own entries, in anchor order');

    // ---------------------------------------------------------------
    // Section D — every entry retains its own domain.
    // ---------------------------------------------------------------
    {
        const timeline = describePublicationObservationTimeline({
            ipfs: { publicationRecords: ipfsRecords, verificationHistoriesByRecordIndex },
            bitcoin: { anchors, confirmationHistoriesByAnchorId, proofObservationsByAnchorId }
        });
        const ipfsKinds = [PublicationObservationTimelineEntryKind.IPFS_PUBLICATION, PublicationObservationTimelineEntryKind.IPFS_CONTENT_VERIFICATION];
        const bitcoinKinds = [PublicationObservationTimelineEntryKind.BITCOIN_BROADCAST, PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION, PublicationObservationTimelineEntryKind.BITCOIN_CONTENT_PROOF];
        for (const entry of timeline.entries) {
            if (entry.domain === PublicationObservationTimelineDomain.IPFS) {
                assert(ipfsKinds.includes(entry.kind), `20. an IPFS-domain entry's own kind (${entry.kind}) is always one of IPFS's own two kinds, never a Bitcoin kind`);
            } else if (entry.domain === PublicationObservationTimelineDomain.BITCOIN) {
                assert(bitcoinKinds.includes(entry.kind), `21. a Bitcoin-domain entry's own kind (${entry.kind}) is always one of Bitcoin's own three kinds, never an IPFS kind`);
            } else {
                assert(false, `22. every entry names one of exactly two domains — got "${entry.domain}"`);
            }
        }
    }
    console.log('✓ Section D: no domain is ever converted into the other — every entry\'s own kind stays within its own domain\'s vocabulary');

    // ---------------------------------------------------------------
    // Section E — recordIndex is never inferred from a shared contentHash.
    // ---------------------------------------------------------------
    {
        const recordC = new IpfsPublicationRecord({ contentHash: SHARED_HASH, locator: 'ipfs://bafyUNLINKED-C', publishedAt: new Date('2026-03-01T00:00:00Z') });
        let unlinkedRecords = Object.freeze([]);
        unlinkedRecords = appendIpfsPublicationRecordHistoryEntry(unlinkedRecords, recordC);

        const unlinkedAnchor = {
            recordIndex: null, // the caller has no real association to report
            anchorId: 'anchor-unlinked',
            txid: 'TX-UNLINKED',
            broadcastedAt: new Date('2026-03-01T00:05:00Z'),
            broadcast: { state: BitcoinAnchorBroadcastState.BROADCASTED, broadcasted: true, txid: 'TX-UNLINKED', reason: null }
        };

        const timeline = describePublicationObservationTimeline({
            ipfs: { publicationRecords: unlinkedRecords, verificationHistoriesByRecordIndex: {} },
            bitcoin: { anchors: [unlinkedAnchor], confirmationHistoriesByAnchorId: {}, proofObservationsByAnchorId: {} }
        });

        const bitcoinEntry = timeline.entries.find((e) => e.domain === PublicationObservationTimelineDomain.BITCOIN);
        assert(bitcoinEntry.recordIndex === null, '23. an anchor with no caller-supplied recordIndex projects as recordIndex: null — never guessed from the identical contentHash the IPFS record above also carries');
        assert(bitcoinEntry.label === 'Bitcoin broadcast', '24. an unlinked entry\'s own label carries no "Publication #" suffix at all, rather than a fabricated one');

        // A non-integer recordIndex (a caller-contract mistake) is treated
        // exactly like "no association supplied" — never coerced or guessed.
        const malformedAnchor = { ...unlinkedAnchor, anchorId: 'anchor-malformed', recordIndex: 'not-a-number' };
        const malformedTimeline = describePublicationObservationTimeline({
            ipfs: { publicationRecords: [], verificationHistoriesByRecordIndex: {} },
            bitcoin: { anchors: [malformedAnchor], confirmationHistoriesByAnchorId: {}, proofObservationsByAnchorId: {} }
        });
        assert(malformedTimeline.entries[0].recordIndex === null, '25. a non-integer recordIndex projects as null rather than being coerced into a number');
    }
    console.log('✓ Section E: recordIndex is only ever what the caller explicitly supplies — never inferred from a shared contentHash, and never guessed for malformed input');

    // ---------------------------------------------------------------
    // Section F — broadcastedAt has no underlying domain field; an anchor
    // without one contributes no broadcast entry.
    // ---------------------------------------------------------------
    {
        const anchorWithoutBroadcastTimestamp = {
            recordIndex: 0,
            anchorId: 'anchor-no-broadcast',
            txid: 'TX-NO-BROADCAST',
            broadcastedAt: null,
            broadcast: { state: BitcoinAnchorBroadcastState.BROADCASTED, broadcasted: true, txid: 'TX-NO-BROADCAST', reason: null }
        };
        const timeline = describePublicationObservationTimeline({
            ipfs: { publicationRecords: [], verificationHistoriesByRecordIndex: {} },
            bitcoin: {
                anchors: [anchorWithoutBroadcastTimestamp],
                confirmationHistoriesByAnchorId: {
                    'anchor-no-broadcast': appendBitcoinAnchorConfirmationObservationHistoryEntry([],
                        confirmationObservation({ txid: 'TX-NO-BROADCAST', state: BitcoinAnchorConfirmationState.NOT_CONFIRMED, observedAt: '2026-04-01T00:00:00Z' }))
                },
                proofObservationsByAnchorId: {}
            }
        });
        assert(timeline.count === 1, '26. an anchor with no broadcastedAt contributes no broadcast entry — only its own confirmation entry appears');
        assert(timeline.entries[0].kind === PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION, '27. the one entry that does appear is the confirmation, never a fabricated broadcast');
    }
    console.log('✓ Section F: an anchor with no caller-supplied broadcastedAt contributes no broadcast entry — never a fabricated one');

    // ---------------------------------------------------------------
    // Section G — zero network operations; every function is pure.
    // ---------------------------------------------------------------
    {
        assert(describePublicationObservationTimeline.length === 0, '28. the projection takes exactly one (defaulted) options object — no injected verifier, coordinator, content store, or network client of any kind');
        const input = {
            ipfs: { publicationRecords: ipfsRecords, verificationHistoriesByRecordIndex },
            bitcoin: { anchors, confirmationHistoriesByAnchorId, proofObservationsByAnchorId }
        };
        const first = JSON.stringify(describePublicationObservationTimeline(input));
        const second = JSON.stringify(describePublicationObservationTimeline(input));
        assert(first === second, '29. calling the projection twice on byte-identical input returns byte-identical output');
    }
    console.log('✓ Section G: zero network operations, and the projection is pure — no injected collaborator of any kind');

    // ---------------------------------------------------------------
    // Section H — no aggregate/scoring vocabulary anywhere, on either
    // domain's own entries.
    // ---------------------------------------------------------------
    {
        const timeline = describePublicationObservationTimeline({
            ipfs: { publicationRecords: ipfsRecords, verificationHistoriesByRecordIndex },
            bitcoin: { anchors, confirmationHistoriesByAnchorId, proofObservationsByAnchorId }
        });
        assertNeverScored(timeline, 'timeline');
        for (const entry of timeline.entries) assertNeverScored(entry, 'timeline.entries[]');
        // The one rule this milestone exists to hold, restated directly:
        // no combined field naming both domains at once.
        for (const entry of timeline.entries) {
            assert(!('confirmed' in entry) || entry.domain === PublicationObservationTimelineDomain.BITCOIN, '30. no IPFS entry ever carries a Bitcoin-only field');
            assert(!('locator' in entry) || entry.domain === PublicationObservationTimelineDomain.IPFS, '31. no Bitcoin entry ever carries an IPFS-only locator field');
        }
    }
    console.log('✓ Section H: no status/confidence/health/trusted/valid/canonical or combined field appears anywhere in the projection, on either domain\'s own entries');

    // ---------------------------------------------------------------
    // Section I — malformed/missing input degrades gracefully.
    // ---------------------------------------------------------------
    {
        const empty = describePublicationObservationTimeline();
        assert(empty.count === 0 && empty.entries.length === 0, '32. no arguments at all projects as an empty, non-throwing timeline');
        assert(Object.isFrozen(empty) && Object.isFrozen(empty.entries), '33. an empty projection result is frozen, including its own entries array');

        const nullDomains = describePublicationObservationTimeline({ ipfs: null, bitcoin: null });
        assert(nullDomains.count === 0, '34. null ipfs/bitcoin inputs project as an empty timeline rather than throwing');

        const ipfsOnly = describePublicationObservationTimeline({ ipfs: { publicationRecords: ipfsRecords, verificationHistoriesByRecordIndex } });
        assert(ipfsOnly.count === 3, '35. an entirely missing bitcoin section still projects the IPFS side alone');

        const withHoles = describePublicationObservationTimeline({
            ipfs: { publicationRecords: [], verificationHistoriesByRecordIndex: {} },
            bitcoin: { anchors: [null, undefined], confirmationHistoriesByAnchorId: {}, proofObservationsByAnchorId: {} }
        });
        assert(withHoles.count === 0, '36. null/undefined anchors are skipped rather than projected as placeholders');
    }
    console.log('✓ Section I: malformed or missing input narrates as an empty or partial timeline, never throwing');

    console.log('\nAll PublicationObservationTimelineView tests passed.');
}

run().catch((error) => {
    console.error('PublicationObservationTimelineView.test.js FAILED:', error);
    process.exitCode = 1;
});
