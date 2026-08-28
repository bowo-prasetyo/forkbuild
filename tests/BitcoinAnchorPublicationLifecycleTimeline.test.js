import { BitcoinAnchorPublicationRecord } from '../application/BitcoinAnchorPublicationRecord.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { BitcoinAnchorBroadcastState } from '../application/BitcoinAnchorBroadcastState.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { BitcoinAnchorContentProofState } from '../application/BitcoinAnchorContentProofState.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import {
    BitcoinAnchorPublicationLifecycleTimelineEntryKind,
    describeBitcoinAnchorPublicationLifecycleTimeline,
    reconstructBitcoinAnchorPublicationLifecycleTimeline
} from '../application/BitcoinAnchorPublicationLifecycleTimelineView.js';

// 0.8.81 — Bitcoin Anchor Publication Lifecycle Timeline.
//
// Section A: a fresh publication with no observations yet — the timeline
//            is exactly one entry, "Publication record created," never an
//            error and never a fabricated stage
// Section B: missing stages remain absent — a publication with a
//            confirmation but no broadcast contributes no broadcast entry
// Section C: a full, single-publication timeline in the correct
//            chronological order, with every entry stamped with its own
//            anchorId and its own 1-based index
// Section D: malformed/absent inputs never throw
// Section E: FLAGSHIP — two publications sharing one contentHash, with
//            deliberately interleaved, out-of-order observation
//            timestamps; each publication's own timeline is
//            chronologically correct, source histories are untouched, and
//            neither publication's entries ever leak into the other's
// Section F: reconstructBitcoinAnchorPublicationLifecycleTimeline() over a
//            real, persisted archive — reload equivalence, zero network
//            access, "no record, no timeline" for an anchor with Bitcoin
//            facts but no minted publication identity
// Section G: no verdict vocabulary anywhere, and repeated projection is
//            byte-identical

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'confirmed', 'safe', 'healthy',
    'completed', 'successful', 'final'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a lifecycle timeline presents recorded facts, it does not turn them into a verdict`);
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            if (Array.isArray(value)) value.forEach((item, i) => assertNeverScored(item, `${path}.${key}[${i}]`));
            else assertNeverScored(value, `${path}.${key}`);
        }
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function confirmed({ txid, blockHash, blockHeight, confirmationCount, observedAt }) {
    return Object.freeze({
        state: BitcoinAnchorConfirmationState.CONFIRMED,
        txid, blockHash, blockHeight, confirmationCount, reason: null, observedAt
    });
}

function contentProof({ contentHash, observedAt, state = BitcoinAnchorContentProofState.HASH_MATCH }) {
    return Object.freeze({ state, contentHash, reason: null, observedAt });
}

async function withoutNetworkAccess(fn) {
    let networkCallOccurred = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
    try {
        return { result: await fn(), networkCallOccurred };
    } finally {
        globalThis.fetch = originalFetch;
    }
}

const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);
const BLOCK_A = 'c'.repeat(64);
const BLOCK_B = 'd'.repeat(64);
const SHARED_CONTENT_HASH = 'e'.repeat(64);
const NETWORK = 'mainnet';

async function run() {
    // ---------------------------------------------------------------
    // Section A — a fresh publication with no observations yet.
    // ---------------------------------------------------------------
    {
        const record = new BitcoinAnchorPublicationRecord({
            anchorId: 'anchor-fresh', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK,
            createdAt: new Date('2026-05-01T00:00:00Z')
        });
        const timeline = describeBitcoinAnchorPublicationLifecycleTimeline(record);
        assert(timeline.anchorId === 'anchor-fresh', '1. the timeline names the publication\'s own anchorId');
        assert(timeline.count === 1, '2. a fresh publication\'s timeline holds exactly one entry — never zero, never a fabricated stage');
        assert(timeline.entries[0].kind === BitcoinAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION, '3. the one entry is the publication record itself');
        assert(timeline.entries[0].label === 'Publication record created', '4. the label is a plain factual sentence');
        assert(timeline.entries[0].anchorId === 'anchor-fresh', '5. the entry is stamped with the publication\'s own anchorId');
        assertNeverScored(timeline, 'freshTimeline');
    }
    console.log('✓ Section A: a fresh publication\'s timeline is exactly one entry, never an error and never a fabricated stage');

    // ---------------------------------------------------------------
    // Section B — missing stages remain absent.
    // ---------------------------------------------------------------
    {
        const record = new BitcoinAnchorPublicationRecord({
            anchorId: 'anchor-no-broadcast', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK,
            createdAt: new Date('2026-05-01T00:00:00Z')
        });
        const timeline = describeBitcoinAnchorPublicationLifecycleTimeline(
            record,
            [], // no broadcast observation at all
            [confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-05-01T01:00:00Z') })],
            []
        );
        assert(!timeline.entries.some((e) => e.kind === BitcoinAnchorPublicationLifecycleTimelineEntryKind.BROADCAST), '6. a publication with no broadcast observation contributes no broadcast entry — never "Broadcast missing" or "Broadcast failed"');
        assert(!timeline.entries.some((e) => e.kind === BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONTENT_PROOF), '7. a publication with no content-proof observation contributes no content-proof entry');
        assert(timeline.entries.some((e) => e.kind === BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONFIRMATION), '8. the one confirmation observation actually recorded is still present');
        for (const entry of timeline.entries) {
            assert(!/missing|failed/i.test(entry.label), `9. no entry label ever reads as a fabricated absence or failure, saw: "${entry.label}"`);
        }
    }
    console.log('✓ Section B: missing stages remain absent — never fabricated, never inferred');

    // ---------------------------------------------------------------
    // Section C — a full, single-publication timeline in the correct
    // chronological order.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-05-01T00:00:00Z');
        const record = new BitcoinAnchorPublicationRecord({ anchorId: 'anchor-full', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt });

        const broadcastObservations = [{ anchorId: 'anchor-full', txid: TXID_A, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-05-01T01:00:00Z') }];
        const confirmationObservations = [
            confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-05-01T01:10:00Z') }),
            confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-05-01T01:20:00Z') })
        ];
        const contentProofObservations = [contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-05-01T01:05:00Z') })];

        const timeline = describeBitcoinAnchorPublicationLifecycleTimeline(record, broadcastObservations, confirmationObservations, contentProofObservations);

        // Expected chronological order: publication (00:00), broadcast
        // (01:00), content-proof (01:05), confirmation #1 (01:10),
        // confirmation #2 (01:20), chain-placement comparison #1 (01:20,
        // the later of the two confirmations it compares), consistency
        // finding #1 (01:20, tied with confirmation #2 and chain-placement
        // — insertion order breaks the tie).
        const kinds = timeline.entries.map((e) => e.kind);
        assert(JSON.stringify(kinds) === JSON.stringify([
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.BROADCAST,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONTENT_PROOF,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONFIRMATION,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONFIRMATION,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.CHAIN_PLACEMENT,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONSISTENCY
        ]), `10. the full timeline presents every recorded fact in the correct chronological order, saw: ${JSON.stringify(kinds)}`);

        assert(timeline.entries.every((e) => e.anchorId === 'anchor-full'), '11. every entry, of every kind, is stamped with the same anchorId');

        const confirmationEntries = timeline.entries.filter((e) => e.kind === BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONFIRMATION);
        assert(confirmationEntries[0].index === 1 && confirmationEntries[1].index === 2, '12. confirmation entries preserve their own original 1-based observation index');
        assert(confirmationEntries[0].label === 'Confirmation observation #1' && confirmationEntries[1].label === 'Confirmation observation #2', '13. confirmation labels name their own index, never relying on timestamp identity alone');

        // Never mutated, never reordered — the caller's own arrays remain
        // exactly what they were.
        assert(confirmationObservations[0].confirmationCount === 1 && confirmationObservations[1].confirmationCount === 6, '14. the caller\'s own confirmationObservations array is never reordered or mutated');

        // Repeated projection is byte-identical.
        const timelineAgain = describeBitcoinAnchorPublicationLifecycleTimeline(record, broadcastObservations, confirmationObservations, contentProofObservations);
        assert(JSON.stringify(timeline) === JSON.stringify(timelineAgain), '15. calling the projection twice on byte-identical input returns a byte-identical result');

        assertNeverScored(timeline, 'fullTimeline');
    }
    console.log('✓ Section C: a full, single-publication timeline presents every recorded fact in correct chronological order, indexed and stamped');

    // ---------------------------------------------------------------
    // Section D — malformed/absent inputs never throw.
    // ---------------------------------------------------------------
    {
        assert(describeBitcoinAnchorPublicationLifecycleTimeline(null) === null, '16. a null publicationRecord returns null');
        assert(describeBitcoinAnchorPublicationLifecycleTimeline({}) === null, '17. a publicationRecord with no anchorId returns null');
        assert(describeBitcoinAnchorPublicationLifecycleTimeline({ anchorId: '' }) === null, '18. an empty-string anchorId returns null');

        const record = new BitcoinAnchorPublicationRecord({ anchorId: 'anchor-malformed', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-05-01T00:00:00Z') });
        const degraded = describeBitcoinAnchorPublicationLifecycleTimeline(record, 'not-an-array', null, undefined);
        assert(degraded.count === 1, '19. non-array observation collections degrade to empty rather than throwing');

        assert(reconstructBitcoinAnchorPublicationLifecycleTimeline(null, 'anchor-x') === null, '20. a null archive returns null rather than throwing');
        assert(reconstructBitcoinAnchorPublicationLifecycleTimeline({}, 'anchor-x') === null, '21. a plain object masquerading as an archive returns null');
        assert(reconstructBitcoinAnchorPublicationLifecycleTimeline(PublicationObservationArchive.empty(), null) === null, '22. a missing anchorId returns null');
        assert(reconstructBitcoinAnchorPublicationLifecycleTimeline(PublicationObservationArchive.empty(), 'never-published') === null, '23. an anchorId with no publication record returns null');
    }
    console.log('✓ Section D: malformed or absent inputs never throw');

    // ---------------------------------------------------------------
    // Section E — FLAGSHIP: two publications, one shared contentHash,
    // deliberately interleaved observation timestamps.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const anchorIdA = 'publication-A';
        const anchorIdB = 'publication-B';

        const T1 = new Date('2026-05-01T01:00:00Z'); // A broadcast
        const T2 = new Date('2026-05-01T01:05:00Z'); // B broadcast
        const T3 = new Date('2026-05-01T01:10:00Z'); // A proof
        const T4 = new Date('2026-05-01T01:15:00Z'); // A confirmation
        const T5 = new Date('2026-05-01T01:20:00Z'); // B confirmation
        const T6 = new Date('2026-05-01T01:25:00Z'); // B proof

        let archive = PublicationObservationArchive.empty();
        archive = useCase.execute(archive, { anchorId: anchorIdA, contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-05-01T00:00:00Z') });
        archive = useCase.execute(archive, { anchorId: anchorIdB, contentHash: SHARED_CONTENT_HASH, txid: TXID_B, network: NETWORK, createdAt: new Date('2026-05-01T00:00:30Z') });

        // Deliberately awkward, cross-interleaved append order.
        archive = archive.appendBitcoinConfirmationObservation(anchorIdA, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: T4 }));
        archive = archive.appendBitcoinBroadcastRecord({ anchorId: anchorIdB, txid: TXID_B, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: T2 });
        archive = archive.appendBitcoinContentProofObservation(anchorIdA, contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: T3 }));
        archive = archive.appendBitcoinConfirmationObservation(anchorIdB, confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 910000, confirmationCount: 1, observedAt: T5 }));
        archive = archive.appendBitcoinBroadcastRecord({ anchorId: anchorIdA, txid: TXID_A, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: T1 });
        archive = archive.appendBitcoinContentProofObservation(anchorIdB, contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: T6 }));

        const timelineA = reconstructBitcoinAnchorPublicationLifecycleTimeline(archive, anchorIdA);
        const timelineB = reconstructBitcoinAnchorPublicationLifecycleTimeline(archive, anchorIdB);

        const kindsA = timelineA.entries.map((e) => e.kind);
        const kindsB = timelineB.entries.map((e) => e.kind);
        assert(JSON.stringify(kindsA) === JSON.stringify([
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.BROADCAST,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONTENT_PROOF,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONFIRMATION,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.CHAIN_PLACEMENT,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONSISTENCY
        ]), `24. Publication A's timeline is chronologically correct despite an interleaved append order, saw: ${JSON.stringify(kindsA)}`);
        assert(JSON.stringify(kindsB) === JSON.stringify([
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.PUBLICATION,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.BROADCAST,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONFIRMATION,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.CHAIN_PLACEMENT,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONSISTENCY,
            BitcoinAnchorPublicationLifecycleTimelineEntryKind.CONTENT_PROOF
        ]), `25. Publication B's timeline is chronologically correct despite an interleaved append order, saw: ${JSON.stringify(kindsB)}`);

        // Identical contentHash never causes cross-contamination.
        assert(timelineA.entries.every((e) => e.anchorId === anchorIdA), '26. every one of Publication A\'s entries names anchorId A');
        assert(timelineB.entries.every((e) => e.anchorId === anchorIdB), '27. every one of Publication B\'s entries names anchorId B');
        assert(!timelineA.entries.some((e) => e.txid === TXID_B), '28. Publication B\'s txid never appears in Publication A\'s timeline');
        assert(!timelineB.entries.some((e) => e.txid === TXID_A), '29. Publication A\'s txid never appears in Publication B\'s timeline');

        // Source histories were never mutated or reordered by either
        // reconstruction call.
        assert(archive.bitcoinConfirmationObservationsByAnchorId[anchorIdA].length === 1 && archive.bitcoinConfirmationObservationsByAnchorId[anchorIdB].length === 1, '30. the archive\'s own confirmation histories are untouched');

        // Equal timestamps have deterministic ordering — re-running the
        // same reconstruction twice never reshuffles a tie.
        const timelineAAgain = reconstructBitcoinAnchorPublicationLifecycleTimeline(archive, anchorIdA);
        assert(JSON.stringify(timelineA) === JSON.stringify(timelineAAgain), '31. repeated projection over the same archive is byte-identical');

        assertNeverScored(timelineA, 'timelineA');
        assertNeverScored(timelineB, 'timelineB');
    }
    console.log('✓ Section E: FLAGSHIP — two publications sharing one contentHash, interleaved histories, chronologically correct and never cross-contaminated');

    // ---------------------------------------------------------------
    // Section F — reconstructBitcoinAnchorPublicationLifecycleTimeline()
    // over a real, persisted archive: reload equivalence, zero network
    // access, and "no record, no timeline."
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const anchorId = 'publication-reload';

        let archive = PublicationObservationArchive.empty();
        archive = useCase.execute(archive, { anchorId, contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-06-01T00:00:00Z') });
        archive = archive.appendBitcoinBroadcastRecord({ anchorId, txid: TXID_A, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-06-01T00:05:00Z') });
        archive = archive.appendBitcoinConfirmationObservation(anchorId, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-06-01T00:10:00Z') }));
        archive = archive.appendBitcoinContentProofObservation(anchorId, contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-06-01T00:15:00Z') }));

        // A SECOND anchor exists in the same archive with real Bitcoin
        // facts, but no minted publication identity — it must never gain a
        // timeline of its own.
        archive = archive.appendBitcoinBroadcastRecord({ anchorId: 'never-published', txid: TXID_B, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-06-01T00:05:00Z') });

        const preReload = reconstructBitcoinAnchorPublicationLifecycleTimeline(archive, anchorId);
        // publication + broadcast + confirmation + content-proof + the one
        // "not enough observations yet" chain-placement comparison and
        // consistency finding a single confirmation always produces
        // (0.8.76/0.8.77, unchanged).
        assert(preReload.count === 6, '32. the live, pre-reload timeline holds every recorded fact, including the derived chain-placement/consistency entries a single confirmation always produces');
        assert(reconstructBitcoinAnchorPublicationLifecycleTimeline(archive, 'never-published') === null, '33. an anchor with Bitcoin facts but no publication record has no lifecycle timeline');

        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archive);

        const { result: restored, networkCallOccurred } = await withoutNetworkAccess(() => persistence.load());
        assert(!networkCallOccurred, '34. restoring the archive performs zero network operations');

        const { result: postReload, networkCallOccurred: networkDuringReconstruction } = await withoutNetworkAccess(() => reconstructBitcoinAnchorPublicationLifecycleTimeline(restored, anchorId));
        assert(!networkDuringReconstruction, '35. reconstructing a timeline from a restored archive performs zero network operations');

        assert(JSON.stringify(preReload) === JSON.stringify(postReload), '36. the restored timeline is byte-identical to the live, pre-reload projection — destroying and restoring the archive cannot change the timeline');

        // A second save/reload cycle remains equivalent.
        persistence.save(restored);
        const reloadedAgain = persistence.load();
        const rereadTimeline = reconstructBitcoinAnchorPublicationLifecycleTimeline(reloadedAgain, anchorId);
        assert(JSON.stringify(rereadTimeline) === JSON.stringify(postReload), '37. a second save/load cycle is byte-identical to the first');

        assertNeverScored(postReload, 'postReload');
    }
    console.log('✓ Section F: reconstructBitcoinAnchorPublicationLifecycleTimeline() — reload equivalence, zero network access, "no record, no timeline"');

    console.log('\nAll BitcoinAnchorPublicationLifecycleTimeline tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorPublicationLifecycleTimeline.test.js FAILED:', error);
    process.exitCode = 1;
});
