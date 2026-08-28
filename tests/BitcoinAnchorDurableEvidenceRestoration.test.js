import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { BitcoinAnchorBroadcastState } from '../application/BitcoinAnchorBroadcastState.js';
import { BitcoinAnchorContentProofState } from '../application/BitcoinAnchorContentProofState.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { reconstructBitcoinAnchorDurableEvidence } from '../application/BitcoinAnchorDurableEvidenceView.js';
import { describeBitcoinAnchorObservationArchive } from '../application/BitcoinAnchorObservationArchiveView.js';
import { composeBitcoinAnchorObservationEvidence } from '../application/BitcoinAnchorObservationEvidence.js';
import { describeBitcoinAnchorObservationEvidence } from '../application/BitcoinAnchorObservationEvidenceView.js';
import { observeBitcoinAnchorChainPlacementChanges } from '../application/BitcoinAnchorChainPlacementObserver.js';
import { analyzeBitcoinAnchorObservationConsistency } from '../application/BitcoinAnchorObservationConsistencyAnalyzer.js';

// 0.8.79 — Durable Bitcoin Anchor Evidence Restoration & Historical
// Inspection.
//
// Section A: reconstructBitcoinAnchorDurableEvidence() over a live archive
//            matches composeBitcoinAnchorObservationEvidence() +
//            describeBitcoinAnchorObservationEvidence() called directly —
//            no new analysis, only a reshuffling of already-durable facts
// Section B: FLAGSHIP — reload equivalence: two anchors sharing a
//            contentHash, different anchorId/txid, serialized and restored
//            into a fresh archive instance; reconstructed evidence is
//            byte-identical to the pre-reload projection, no network
//            operation occurs during restoration, and neither anchor's
//            facts ever leak into the other's
// Section C: describeBitcoinAnchorObservationArchive() lists every archived
//            anchor with plain, factual counts — never a health/status/
//            confidence field, and counts match the reconstructed evidence
// Section D: malformed/absent inputs never throw — missing anchorId,
//            non-archive input, an anchor never archived at all

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
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

const FORBIDDEN_KEYS = ['status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable', 'risk', 'severity', 'cause', 'verdict', 'score'];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — historical evidence composes facts, it does not score them`);
        if (value && typeof value === 'object' && !(value instanceof Date)) {
            if (Array.isArray(value)) value.forEach((item, i) => assertNeverScored(item, `${path}.${key}[${i}]`));
            else assertNeverScored(value, `${path}.${key}`);
        }
    }
}

const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);
const BLOCK_A = 'c'.repeat(64);
const BLOCK_B = 'd'.repeat(64);
const SHARED_CONTENT_HASH = 'e'.repeat(64);

async function run() {
    // ---------------------------------------------------------------
    // Section A — reconstructBitcoinAnchorDurableEvidence() matches direct
    // composition, using no new analysis logic of its own.
    // ---------------------------------------------------------------
    {
        const anchorId = 'anchor-direct';
        let archive = new PublicationObservationArchive({});
        archive = archive.appendBitcoinBroadcastRecord({ anchorId, txid: TXID_A, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-01-01T09:00:00Z') });
        archive = archive.appendBitcoinConfirmationObservation(anchorId, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T09:10:00Z') }));
        archive = archive.appendBitcoinConfirmationObservation(anchorId, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-01-01T09:20:00Z') }));
        archive = archive.appendBitcoinContentProofObservation(anchorId, contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-01-01T09:15:00Z') }));

        const reconstructed = reconstructBitcoinAnchorDurableEvidence(archive, anchorId);

        const history = archive.bitcoinConfirmationObservationsByAnchorId[anchorId];
        const directlyComposed = describeBitcoinAnchorObservationEvidence(composeBitcoinAnchorObservationEvidence({
            anchorId,
            broadcastObservations: archive.bitcoinBroadcastRecords.filter((r) => r.anchorId === anchorId),
            confirmationObservations: history,
            contentProofObservations: archive.bitcoinContentProofObservationsByAnchorId[anchorId],
            chainPlacementObservations: observeBitcoinAnchorChainPlacementChanges(history),
            consistencyFindings: analyzeBitcoinAnchorObservationConsistency(history)
        }));

        assert(JSON.stringify(reconstructed) === JSON.stringify(directlyComposed), '1. reconstructBitcoinAnchorDurableEvidence() matches manual composition byte-for-byte');
        assert(reconstructed.broadcastObservations.count === 1, '2. broadcast observations were pulled from the archive');
        assert(reconstructed.confirmationObservations.count === 2, '3. confirmation observations were pulled from the archive');
        assert(reconstructed.contentProofObservations.count === 1, '4. content-proof observations were pulled from the archive');
        assert(reconstructed.chainPlacementObservations.count === 1, '5. chain-placement comparisons were derived fresh, not read from any persisted field');
        assert(reconstructed.consistencyFindings.count === 1, '6. consistency findings were derived fresh, not read from any persisted field');
        assertNeverScored(reconstructed, 'reconstructed');
    }
    console.log('✓ Section A: reconstructBitcoinAnchorDurableEvidence() reproduces direct composition — no new analysis logic');

    // ---------------------------------------------------------------
    // Section B — FLAGSHIP: reload equivalence. Two anchors, identical
    // contentHash, different anchorId/txid. Serialize, restore into a
    // fresh archive instance, reconstruct — byte-identical to the
    // pre-reload projection, no leakage between anchors, no network call.
    // ---------------------------------------------------------------
    {
        const anchorIdA = 'anchor-A';
        const anchorIdB = 'anchor-B';

        let archive = new PublicationObservationArchive({});
        archive = archive.appendBitcoinBroadcastRecord({ anchorId: anchorIdA, txid: TXID_A, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-01-01T09:00:00Z') });
        archive = archive.appendBitcoinBroadcastRecord({ anchorId: anchorIdB, txid: TXID_B, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-01-02T09:00:00Z') });

        archive = archive.appendBitcoinConfirmationObservation(anchorIdA, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T09:10:00Z') }));
        archive = archive.appendBitcoinConfirmationObservation(anchorIdA, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 6, observedAt: new Date('2026-01-01T09:20:00Z') }));

        archive = archive.appendBitcoinConfirmationObservation(anchorIdB, confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 910000, confirmationCount: 1, observedAt: new Date('2026-01-02T09:10:00Z') }));
        archive = archive.appendBitcoinConfirmationObservation(anchorIdB, confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 910000, confirmationCount: 2, observedAt: new Date('2026-01-02T09:20:00Z') }));
        archive = archive.appendBitcoinConfirmationObservation(anchorIdB, confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 910000, confirmationCount: 3, observedAt: new Date('2026-01-02T09:30:00Z') }));

        // BOTH anchors claim the SAME content hash.
        archive = archive.appendBitcoinContentProofObservation(anchorIdA, contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-01-01T09:15:00Z') }));
        archive = archive.appendBitcoinContentProofObservation(anchorIdB, contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-01-02T09:15:00Z') }));
        archive = archive.appendBitcoinContentProofObservation(anchorIdB, contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-01-02T09:45:00Z'), state: BitcoinAnchorContentProofState.HASH_MISMATCH }));

        // The pre-reload projection — evidence reconstructed over the LIVE,
        // in-memory archive, before any serialization happens at all.
        const preReloadA = reconstructBitcoinAnchorDurableEvidence(archive, anchorIdA);
        const preReloadB = reconstructBitcoinAnchorDurableEvidence(archive, anchorIdB);

        // Serialize the archive (what storage/LocalStoragePublicationObservationArchive.js
        // itself calls save() with) and restore it into a FRESH archive
        // instance — no shared object identity with `archive` above.
        const persistedJson = JSON.parse(JSON.stringify(archive.toJSON()));
        let networkCallOccurred = false;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
        let restoredArchive;
        try {
            restoredArchive = PublicationObservationArchive.fromJSON(persistedJson);
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert(!networkCallOccurred, '7. restoring an archive from its own persisted JSON performs zero network operations');
        assert(restoredArchive !== archive, '8. the restored archive is a genuinely separate instance, not the same object reused');

        const postReloadA = reconstructBitcoinAnchorDurableEvidence(restoredArchive, anchorIdA);
        const postReloadB = reconstructBitcoinAnchorDurableEvidence(restoredArchive, anchorIdB);

        assert(JSON.stringify(preReloadA) === JSON.stringify(postReloadA), '9. Anchor A\'s reconstructed evidence is byte-identical before and after a simulated reload');
        assert(JSON.stringify(preReloadB) === JSON.stringify(postReloadB), '10. Anchor B\'s reconstructed evidence is byte-identical before and after a simulated reload');

        assert(postReloadA.anchorId === anchorIdA && postReloadB.anchorId === anchorIdB, '11. each restored evidence bundle still names its own distinct anchorId');
        assert(postReloadA.confirmationObservations.count === 2, '12. Anchor A\'s own confirmation history length survives restoration');
        assert(postReloadB.confirmationObservations.count === 3, '13. Anchor B\'s own, differently-sized confirmation history length survives restoration');
        assert(postReloadA.confirmationObservations.observations.every((o) => o.txid === TXID_A), '14. every one of Anchor A\'s restored confirmation observations names TXID_A');
        assert(postReloadB.confirmationObservations.observations.every((o) => o.txid === TXID_B), '15. every one of Anchor B\'s restored confirmation observations names TXID_B');

        assert(postReloadA.contentProofObservations.count === 1, '16. Anchor A\'s content-proof observations survive restoration with their own correct count');
        assert(postReloadB.contentProofObservations.count === 2, '17. Anchor B\'s content-proof observations survive restoration with their own correct, DIFFERENT count');

        // The single most important assertion this flagship test exists to
        // make: despite an identical contentHash on both sides, restoration
        // never merges or cross-contaminates the two anchors' own facts.
        assert(!postReloadA.broadcastObservations.observations.some((o) => o.txid === TXID_B), '18. Anchor B\'s broadcast never appears in Anchor A\'s restored evidence');
        assert(!postReloadB.broadcastObservations.observations.some((o) => o.txid === TXID_A), '19. Anchor A\'s broadcast never appears in Anchor B\'s restored evidence');
        assert(postReloadA.chainPlacementObservations.count === 1 && postReloadB.chainPlacementObservations.count === 2, '20. each anchor\'s own restored chain-placement comparisons are scoped to its own history length');
        assert(postReloadA.consistencyFindings.count === 1 && postReloadB.consistencyFindings.count === 2, '21. each anchor\'s own restored consistency findings are scoped to its own history length');

        // The persisted JSON itself never carries a derived section — only
        // the raw, durable facts application/PublicationObservationArchive.js
        // already knows how to hold.
        assert(!('chainPlacementObservations' in persistedJson), '22. the persisted archive JSON never stores chain-placement observations');
        assert(!('consistencyFindings' in persistedJson), '23. the persisted archive JSON never stores consistency findings');
        assert(!('evidence' in persistedJson) && !('bitcoinAnchorEvidence' in persistedJson), '24. the persisted archive JSON never stores a composed evidence object');
    }
    console.log('✓ Section B: FLAGSHIP — reload equivalence: restored evidence is byte-identical, no leakage between anchors sharing a contentHash, zero network calls');

    // ---------------------------------------------------------------
    // Section C — describeBitcoinAnchorObservationArchive() lists every
    // archived anchor with plain factual counts.
    // ---------------------------------------------------------------
    {
        const anchorIdA = 'anchor-list-A';
        const anchorIdB = 'anchor-list-B';

        let archive = new PublicationObservationArchive({});
        archive = archive.appendBitcoinBroadcastRecord({ anchorId: anchorIdA, txid: TXID_A, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-01-01T09:00:00Z') });
        archive = archive.appendBitcoinConfirmationObservation(anchorIdA, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-01-01T09:10:00Z') }));
        archive = archive.appendBitcoinConfirmationObservation(anchorIdA, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 2, observedAt: new Date('2026-01-01T09:20:00Z') }));
        archive = archive.appendBitcoinContentProofObservation(anchorIdA, contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-01-01T09:15:00Z') }));

        // Anchor B has ONLY a content-proof observation, never a broadcast
        // or confirmation — an honestly sparse row, never an error.
        archive = archive.appendBitcoinContentProofObservation(anchorIdB, contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-01-02T09:15:00Z') }));

        const listed = describeBitcoinAnchorObservationArchive(archive);
        assert(listed.anchorCount === 2, '25. two distinct anchors are listed');
        const rowA = listed.anchors.find((row) => row.anchorId === anchorIdA);
        const rowB = listed.anchors.find((row) => row.anchorId === anchorIdB);
        assert(rowA && rowB, '26. both anchors appear in the listing, by their own explicit anchorId');

        assert(rowA.broadcastObservationCount === 1, '27. Anchor A\'s broadcast count is correct');
        assert(rowA.confirmationObservationCount === 2, '28. Anchor A\'s confirmation count is correct');
        assert(rowA.contentProofObservationCount === 1, '29. Anchor A\'s content-proof count is correct');
        assert(rowA.chainPlacementComparisonCount === 1, '30. Anchor A\'s chain-placement comparison count is correct');
        assert(rowA.consistencyFindingCount === 1, '31. Anchor A\'s consistency finding count is correct');

        assert(rowB.broadcastObservationCount === 0, '32. Anchor B, never broadcast, honestly reports zero — not an error');
        assert(rowB.confirmationObservationCount === 0, '33. Anchor B, never confirmed, honestly reports zero');
        assert(rowB.contentProofObservationCount === 1, '34. Anchor B\'s own single content-proof observation is counted');
        assert(rowB.chainPlacementComparisonCount === 0 && rowB.consistencyFindingCount === 0, '35. with no confirmation history, Anchor B has no comparisons or findings to report');

        assertNeverScored(listed, 'listed');

        // The counts here must agree with the fully reconstructed evidence
        // for the same anchor — two different projections over the same
        // durable facts, never disagreeing with each other.
        const reconstructedA = reconstructBitcoinAnchorDurableEvidence(archive, anchorIdA);
        assert(rowA.broadcastObservationCount === reconstructedA.broadcastObservations.count, '36. the archive listing\'s broadcast count matches the reconstructed evidence\'s own count');
        assert(rowA.confirmationObservationCount === reconstructedA.confirmationObservations.count, '37. the archive listing\'s confirmation count matches the reconstructed evidence\'s own count');
        assert(rowA.contentProofObservationCount === reconstructedA.contentProofObservations.count, '38. the archive listing\'s content-proof count matches the reconstructed evidence\'s own count');
        assert(rowA.chainPlacementComparisonCount === reconstructedA.chainPlacementObservations.count, '39. the archive listing\'s chain-placement count matches the reconstructed evidence\'s own count');
        assert(rowA.consistencyFindingCount === reconstructedA.consistencyFindings.count, '40. the archive listing\'s consistency count matches the reconstructed evidence\'s own count');
    }
    console.log('✓ Section C: describeBitcoinAnchorObservationArchive() lists every archived anchor with plain, factual, mutually-consistent counts');

    // ---------------------------------------------------------------
    // Section D — malformed/absent inputs never throw.
    // ---------------------------------------------------------------
    {
        assert(reconstructBitcoinAnchorDurableEvidence(PublicationObservationArchive.empty(), 'never-archived') === null
            || reconstructBitcoinAnchorDurableEvidence(PublicationObservationArchive.empty(), 'never-archived').broadcastObservations.count === 0,
            '41. reconstructing evidence for an anchorId this archive never recorded anything for degrades to an honest empty bundle, never a thrown error');

        assert(reconstructBitcoinAnchorDurableEvidence(null, 'anchor-x') === null || reconstructBitcoinAnchorDurableEvidence(null, 'anchor-x').broadcastObservations.count === 0,
            '42. a null archive never throws');
        assert(reconstructBitcoinAnchorDurableEvidence({}, 'anchor-x') === null || reconstructBitcoinAnchorDurableEvidence({}, 'anchor-x').broadcastObservations.count === 0,
            '43. a plain object masquerading as an archive never throws, and degrades to empty');

        assert(reconstructBitcoinAnchorDurableEvidence(PublicationObservationArchive.empty(), null) === null, '44. a missing anchorId returns null, never throws');
        assert(reconstructBitcoinAnchorDurableEvidence(PublicationObservationArchive.empty(), '') === null, '45. an empty-string anchorId returns null, never throws');
        assert(reconstructBitcoinAnchorDurableEvidence(PublicationObservationArchive.empty(), 42) === null, '46. a non-string anchorId returns null, never throws');

        const emptyListing = describeBitcoinAnchorObservationArchive(null);
        assert(emptyListing.anchorCount === 0 && emptyListing.anchors.length === 0, '47. listing a null archive degrades to an empty listing, never throws');
        assert(describeBitcoinAnchorObservationArchive({}).anchorCount === 0, '48. listing a plain object masquerading as an archive degrades to an empty listing');
    }
    console.log('✓ Section D: malformed or absent inputs never throw — every degrade path is an honest empty result');

    console.log('\nAll BitcoinAnchorDurableEvidenceRestoration tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorDurableEvidenceRestoration.test.js FAILED:', error);
    process.exitCode = 1;
});
