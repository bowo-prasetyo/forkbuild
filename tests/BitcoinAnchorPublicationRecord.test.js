import { BitcoinAnchorPublicationRecord } from '../application/BitcoinAnchorPublicationRecord.js';
import {
    appendBitcoinAnchorPublicationRecordHistoryEntry,
    findBitcoinAnchorPublicationRecordsByAnchorId,
    findBitcoinAnchorPublicationRecordByAnchorId
} from '../application/BitcoinAnchorPublicationRecordHistory.js';
import {
    describeBitcoinAnchorPublicationRecordHistoryEntry,
    describeBitcoinAnchorPublicationRecordHistory
} from '../application/BitcoinAnchorPublicationRecordHistoryView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { inspectBitcoinAnchorPublication } from '../application/BitcoinAnchorPublicationInspectionView.js';
import { BitcoinAnchorBroadcastState } from '../application/BitcoinAnchorBroadcastState.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { BitcoinAnchorContentProofState } from '../application/BitcoinAnchorContentProofState.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';

// 0.8.80 — Explicit Bitcoin Anchor Publication Lifecycle Record.
//
// The flagship this milestone exists to prove: two Bitcoin anchor
// publication attempts that share the exact same contentHash — anchorId A
// with txid TX-A, anchorId B with txid TX-B, each with its own,
// completely independent observation history — survive a full
// persist/destroy/reload cycle as two, entirely distinct publication
// identities. Identical contentHash never merges them; different txid
// never causes accidental reassignment; each reconstructed evidence
// bundle contains only its own observations; and no verdict field ever
// appears anywhere in any of it.
//
//   Section A: BitcoinAnchorPublicationRecord — construction, validation,
//              immutability, toJSON()/fromJSON() round trip
//   Section B: BitcoinAnchorPublicationRecordHistory — append-only, never
//              mutates, never deduplicates; anchorId-only lookup
//   Section C: BitcoinAnchorPublicationRecordHistoryView — plain
//              narration, oldest first, never scored
//   Section D: PublicationObservationArchive's own sixth collection —
//              append/persist/restore through real storage; a
//              pre-0.8.80 (schemaVersion 1) payload degrades to empty
//   Section E: CreateBitcoinAnchorPublicationRecordUseCase — the one
//              construction boundary; throws for an invalid identity;
//              never mutates the archive it was given
//   Section F: FLAGSHIP — two publications, one shared contentHash,
//              independent observation histories, full persist/destroy/
//              reload/re-reload cycle, inspected independently
//   Section G: BitcoinAnchorPublicationInspectionView — malformed/absent
//              inputs never throw; no record means no inspection

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'confirmed', 'safe', 'healthy'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a publication record establishes identity, it does not score it`);
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

const TXID_A = 'a'.repeat(64);
const TXID_B = 'b'.repeat(64);
const BLOCK_A = 'c'.repeat(64);
const BLOCK_B = 'd'.repeat(64);
const SHARED_CONTENT_HASH = 'e'.repeat(64);
const NETWORK = 'mainnet';

async function run() {
    // ---------------------------------------------------------------
    // Section A — BitcoinAnchorPublicationRecord: construction,
    // validation, immutability, toJSON()/fromJSON().
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-03-01T00:00:00.000Z');
        const record = new BitcoinAnchorPublicationRecord({
            anchorId: 'anchor-A', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt
        });
        assert(record.anchorId === 'anchor-A', '1. anchorId is exposed unchanged');
        assert(record.contentHash === SHARED_CONTENT_HASH, '2. contentHash is exposed unchanged');
        assert(record.txid === TXID_A, '3. txid is exposed unchanged');
        assert(record.network === NETWORK, '4. network is exposed unchanged');
        assert(record.createdAt.getTime() === createdAt.getTime(), '5. createdAt is exposed unchanged');
        assert(Object.isFrozen(record), '6. a record is frozen at construction');

        for (const missing of ['anchorId', 'contentHash', 'txid', 'network']) {
            const fields = { anchorId: 'x', contentHash: 'y', txid: 'z', network: NETWORK, createdAt };
            delete fields[missing];
            let threw = false;
            try { new BitcoinAnchorPublicationRecord(fields); } catch (error) { threw = true; }
            assert(threw, `7. a missing ${missing} throws rather than constructing a partial identity`);
        }
        let threwForBadDate = false;
        try { new BitcoinAnchorPublicationRecord({ anchorId: 'x', contentHash: 'y', txid: 'z', network: NETWORK, createdAt: 'not-a-date' }); } catch (error) { threwForBadDate = true; }
        assert(threwForBadDate, '8. an invalid createdAt throws');

        const json = record.toJSON();
        assert(json.createdAt === createdAt.toISOString(), '9. toJSON() serializes createdAt as an ISO string');
        const restored = BitcoinAnchorPublicationRecord.fromJSON(json);
        assert(restored.anchorId === record.anchorId && restored.contentHash === record.contentHash
            && restored.txid === record.txid && restored.network === record.network
            && restored.createdAt.getTime() === record.createdAt.getTime(),
            '10. fromJSON(toJSON()) round-trips to an identical record');
        assert(BitcoinAnchorPublicationRecord.fromJSON(null) === null, '11. fromJSON(null) returns null rather than throwing');

        assertNeverScored(json, 'record.toJSON()');
    }
    console.log('✓ Section A: BitcoinAnchorPublicationRecord — construction, validation, immutability, and JSON round trip');

    // ---------------------------------------------------------------
    // Section B — BitcoinAnchorPublicationRecordHistory: append-only,
    // never mutates, never deduplicates; anchorId-only lookup.
    // ---------------------------------------------------------------
    {
        const recordA = new BitcoinAnchorPublicationRecord({ anchorId: 'anchor-A', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-03-01T00:00:00Z') });
        const recordB = new BitcoinAnchorPublicationRecord({ anchorId: 'anchor-B', contentHash: SHARED_CONTENT_HASH, txid: TXID_B, network: NETWORK, createdAt: new Date('2026-03-02T00:00:00Z') });

        const empty = [];
        const afterA = appendBitcoinAnchorPublicationRecordHistoryEntry(empty, recordA);
        assert(empty.length === 0, '12. appending never mutates the array the caller passed in');
        assert(afterA.length === 1 && afterA[0] === recordA, '13. appending to an empty history returns a new one-entry history');
        assert(Object.isFrozen(afterA), '14. the returned history is frozen');

        const afterB = appendBitcoinAnchorPublicationRecordHistoryEntry(afterA, recordB);
        assert(afterA.length === 1, '15. appending a second entry never mutates the previous history');
        assert(afterB.length === 2 && afterB[0] === recordA && afterB[1] === recordB, '16. both records are held, in append order');

        assert(appendBitcoinAnchorPublicationRecordHistoryEntry(afterB, null).length === 2, '17. appending a null/falsy record is a no-op');
        assert(appendBitcoinAnchorPublicationRecordHistoryEntry(undefined, recordA).length === 1, '18. a non-array history starts fresh rather than throwing');

        assert(findBitcoinAnchorPublicationRecordByAnchorId(afterB, 'anchor-A') === recordA, '19. lookup by anchorId finds the correct record');
        assert(findBitcoinAnchorPublicationRecordByAnchorId(afterB, 'anchor-B') === recordB, '20. lookup by anchorId never confuses two records sharing the same contentHash');
        assert(findBitcoinAnchorPublicationRecordByAnchorId(afterB, 'never-seen') === null, '21. lookup for an unknown anchorId returns null');
        assert(findBitcoinAnchorPublicationRecordByAnchorId(afterB, null) === null, '22. lookup with a non-string anchorId returns null rather than throwing');

        assert(findBitcoinAnchorPublicationRecordsByAnchorId(afterB, 'anchor-A').length === 1, '23. findBy...RecordsByAnchorId returns every match, as an array');
        assert(findBitcoinAnchorPublicationRecordsByAnchorId(afterB, 'anchor-A')[0] === recordA, '24. the single match is the correct record');

        // Appending a SECOND record for the SAME anchorId (an unusual but
        // never-forbidden case) never overwrites or discards the first.
        const recordA2 = new BitcoinAnchorPublicationRecord({ anchorId: 'anchor-A', contentHash: 'different-hash', txid: 'f'.repeat(64), network: NETWORK, createdAt: new Date('2026-03-03T00:00:00Z') });
        const afterA2 = appendBitcoinAnchorPublicationRecordHistoryEntry(afterB, recordA2);
        assert(findBitcoinAnchorPublicationRecordsByAnchorId(afterA2, 'anchor-A').length === 2, '25. a second record under the same anchorId is appended, never merged or deduplicated');
        assert(findBitcoinAnchorPublicationRecordByAnchorId(afterA2, 'anchor-A') === recordA, '26. the single-record lookup reports the earliest one, never silently swapped for a later one');
    }
    console.log('✓ Section B: BitcoinAnchorPublicationRecordHistory — append-only, never mutates, never deduplicates');

    // ---------------------------------------------------------------
    // Section C — BitcoinAnchorPublicationRecordHistoryView: plain
    // narration, oldest first, never scored.
    // ---------------------------------------------------------------
    {
        assert(describeBitcoinAnchorPublicationRecordHistoryEntry(null) === null, '27. describing a null record returns null');
        const record = new BitcoinAnchorPublicationRecord({ anchorId: 'anchor-A', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-03-01T00:00:00Z') });
        const described = describeBitcoinAnchorPublicationRecordHistoryEntry(record);
        assert(described.anchorId === 'anchor-A' && described.contentHash === SHARED_CONTENT_HASH && described.txid === TXID_A && described.network === NETWORK, '28. every field is carried through unchanged');
        assertNeverScored(described, 'described');

        const history = describeBitcoinAnchorPublicationRecordHistory([
            record,
            new BitcoinAnchorPublicationRecord({ anchorId: 'anchor-B', contentHash: SHARED_CONTENT_HASH, txid: TXID_B, network: NETWORK, createdAt: new Date('2026-03-02T00:00:00Z') })
        ]);
        assert(history.count === 2, '29. history narration counts every record');
        assert(history.records[0].anchorId === 'anchor-A' && history.records[1].anchorId === 'anchor-B', '30. history narration preserves order, oldest first — never sorted or grouped');
        assertNeverScored(history, 'history');

        const emptyHistory = describeBitcoinAnchorPublicationRecordHistory(null);
        assert(emptyHistory.count === 0 && emptyHistory.records.length === 0, '31. a null/non-array history narrates as empty rather than throwing');
    }
    console.log('✓ Section C: BitcoinAnchorPublicationRecordHistoryView — plain, oldest-first narration, never scored');

    // ---------------------------------------------------------------
    // Section D — PublicationObservationArchive's own sixth collection:
    // append/persist/restore through real storage; a pre-0.8.80
    // (schemaVersion 1) payload degrades to empty.
    // ---------------------------------------------------------------
    {
        const record = new BitcoinAnchorPublicationRecord({ anchorId: 'anchor-A', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-03-01T00:00:00Z') });

        let archive = PublicationObservationArchive.empty();
        assert(archive.bitcoinAnchorPublicationRecords.length === 0, '32. a fresh archive holds no publication records');
        assert(archive.bitcoinAnchorPublicationRecordCount === 0, '33. bitcoinAnchorPublicationRecordCount starts at zero');

        const archiveWithRecord = archive.appendBitcoinAnchorPublicationRecord(record);
        assert(archive.bitcoinAnchorPublicationRecords.length === 0, '34. appendBitcoinAnchorPublicationRecord() never mutates the receiver');
        assert(archiveWithRecord.bitcoinAnchorPublicationRecords.length === 1, '35. the returned archive holds the new record');
        assert(archiveWithRecord.bitcoinAnchorPublicationRecordCount === 1, '36. bitcoinAnchorPublicationRecordCount reflects the new record');
        assert(archiveWithRecord.appendBitcoinAnchorPublicationRecord(null) === archiveWithRecord, '37. appending a null record is a no-op that returns the same archive');

        // publicationCount/observationCount stay unchanged by this
        // milestone — a publication record is identity, never folded into
        // either of those two, already-established counts.
        assert(archiveWithRecord.publicationCount === 0, '38. publicationCount is deliberately unaffected by a bitcoinAnchorPublicationRecord');
        assert(archiveWithRecord.observationCount === 0, '39. observationCount is deliberately unaffected by a bitcoinAnchorPublicationRecord');

        // Real, JSON-round-tripping storage.
        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archiveWithRecord);
        const restored = persistence.load();
        assert(restored.bitcoinAnchorPublicationRecords.length === 1, '40. the persisted record survives a real save/load round trip');
        const restoredRecord = restored.bitcoinAnchorPublicationRecords[0];
        assert(restoredRecord instanceof BitcoinAnchorPublicationRecord, '41. the restored entry is a genuine BitcoinAnchorPublicationRecord instance');
        assert(restoredRecord.anchorId === record.anchorId && restoredRecord.contentHash === record.contentHash
            && restoredRecord.txid === record.txid && restoredRecord.network === record.network
            && restoredRecord.createdAt.getTime() === record.createdAt.getTime(),
            '42. every field survives the round trip unchanged');

        // A payload persisted by 0.8.75–0.8.79 (schemaVersion 1, no
        // bitcoinAnchorPublicationRecords field at all) degrades to an
        // empty archive — the identical, already-established "wrong
        // schemaVersion" behavior, never a silent migration.
        const preMilestoneJson = { ...archiveWithRecord.toJSON(), schemaVersion: 1 };
        delete preMilestoneJson.bitcoinAnchorPublicationRecords;
        assert(PublicationObservationArchive.fromJSON(preMilestoneJson).bitcoinAnchorPublicationRecordCount === 0, '43. a schemaVersion-1 payload degrades to an empty archive, never a partial migration');

        // A malformed publication record (missing a required field, or an
        // unexpected extra field) degrades the WHOLE archive to empty —
        // never a partially reconstructed one, mirroring every other
        // collection's own identical restraint.
        const missingFieldJson = archiveWithRecord.toJSON();
        delete missingFieldJson.bitcoinAnchorPublicationRecords[0].network;
        assert(PublicationObservationArchive.fromJSON(missingFieldJson).bitcoinAnchorPublicationRecordCount === 0, '44. a publication record missing a required field degrades the whole archive to empty');

        const extraFieldJson = archiveWithRecord.toJSON();
        extraFieldJson.bitcoinAnchorPublicationRecords[0].status = 'confirmed';
        assert(PublicationObservationArchive.fromJSON(extraFieldJson).bitcoinAnchorPublicationRecordCount === 0, '45. a publication record with an unexpected extra field (e.g. a smuggled verdict) degrades the whole archive to empty');
    }
    console.log('✓ Section D: PublicationObservationArchive\'s sixth collection — append/persist/restore, and pre-0.8.80 payloads degrade honestly');

    // ---------------------------------------------------------------
    // Section E — CreateBitcoinAnchorPublicationRecordUseCase: the one
    // construction boundary.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const original = PublicationObservationArchive.empty();
        const createdAt = new Date('2026-03-05T12:00:00Z');
        const result = useCase.execute(original, { anchorId: 'anchor-A', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt });

        assert(original.bitcoinAnchorPublicationRecords.length === 0, '46. execute() never mutates the archive it was given');
        assert(result.bitcoinAnchorPublicationRecords.length === 1, '47. execute() returns a new archive holding the newly constructed record');
        assert(result.bitcoinAnchorPublicationRecords[0].anchorId === 'anchor-A' && result.bitcoinAnchorPublicationRecords[0].txid === TXID_A, '48. the constructed record carries exactly the fields passed in');

        let threw = false;
        try { useCase.execute(original, { anchorId: 'anchor-A', contentHash: null, txid: TXID_A, network: NETWORK }); } catch (error) { threw = true; }
        assert(threw, '49. execute() throws for an invalid identity rather than silently degrading it');

        const fromNonArchive = useCase.execute(null, { anchorId: 'anchor-Z', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt });
        assert(fromNonArchive.bitcoinAnchorPublicationRecords.length === 1, '50. a non-archive input degrades to PublicationObservationArchive.empty() before appending, never throws');
    }
    console.log('✓ Section E: CreateBitcoinAnchorPublicationRecordUseCase — the one construction boundary, never mutating, throwing only for an invalid identity');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP: two publications, one shared contentHash,
    // independent observation histories, full persist/destroy/reload/
    // re-reload cycle, inspected independently.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const anchorIdA = 'publication-A';
        const anchorIdB = 'publication-B';

        let archive = PublicationObservationArchive.empty();

        // Publication A — created at finalization, then broadcast and
        // confirmed once.
        archive = useCase.execute(archive, { anchorId: anchorIdA, contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-04-01T08:00:00Z') });
        archive = archive.appendBitcoinBroadcastRecord({ anchorId: anchorIdA, txid: TXID_A, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-04-01T08:05:00Z') });
        archive = archive.appendBitcoinConfirmationObservation(anchorIdA, confirmed({ txid: TXID_A, blockHash: BLOCK_A, blockHeight: 900000, confirmationCount: 1, observedAt: new Date('2026-04-01T08:10:00Z') }));
        archive = archive.appendBitcoinContentProofObservation(anchorIdA, contentProof({ contentHash: SHARED_CONTENT_HASH, observedAt: new Date('2026-04-01T08:15:00Z') }));

        // Publication B — SAME contentHash, DIFFERENT anchorId/txid,
        // created later, broadcast, and confirmed THREE times (a
        // completely different-shaped observation history).
        archive = useCase.execute(archive, { anchorId: anchorIdB, contentHash: SHARED_CONTENT_HASH, txid: TXID_B, network: NETWORK, createdAt: new Date('2026-04-02T09:00:00Z') });
        archive = archive.appendBitcoinBroadcastRecord({ anchorId: anchorIdB, txid: TXID_B, state: BitcoinAnchorBroadcastState.BROADCASTED, broadcastedAt: new Date('2026-04-02T09:05:00Z') });
        archive = archive.appendBitcoinConfirmationObservation(anchorIdB, confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 910000, confirmationCount: 1, observedAt: new Date('2026-04-02T09:10:00Z') }));
        archive = archive.appendBitcoinConfirmationObservation(anchorIdB, confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 910000, confirmationCount: 2, observedAt: new Date('2026-04-02T09:20:00Z') }));
        archive = archive.appendBitcoinConfirmationObservation(anchorIdB, confirmed({ txid: TXID_B, blockHash: BLOCK_B, blockHeight: 910000, confirmationCount: 3, observedAt: new Date('2026-04-02T09:30:00Z') }));

        assert(archive.bitcoinAnchorPublicationRecordCount === 2, '51. both publication records exist in the live archive');

        const preReloadA = inspectBitcoinAnchorPublication(archive, anchorIdA);
        const preReloadB = inspectBitcoinAnchorPublication(archive, anchorIdB);

        // 1 & 2. Both publication records survive, and their identities
        // remain distinct.
        assert(preReloadA.record.anchorId === anchorIdA && preReloadB.record.anchorId === anchorIdB, '52. each inspection names its own, distinct anchorId');
        assert(preReloadA.record.txid === TXID_A && preReloadB.record.txid === TXID_B, '53. each record keeps its own, distinct txid');

        // 3. Identical contentHash never merges them.
        assert(preReloadA.record.contentHash === SHARED_CONTENT_HASH && preReloadB.record.contentHash === SHARED_CONTENT_HASH, '54. both records genuinely share the identical contentHash');
        assert(preReloadA.record.anchorId !== preReloadB.record.anchorId, '55. an identical contentHash never collapses the two into one identity');

        // Persist through REAL, JSON-round-tripping storage, then destroy
        // every in-memory reference, guarding for zero network calls.
        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archive);
        archive = null;

        let networkCallOccurred = false;
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (...args) => { networkCallOccurred = true; return originalFetch ? originalFetch(...args) : Promise.reject(new Error('no fetch in this environment')); };
        let restored;
        try {
            restored = persistence.load();
        } finally {
            globalThis.fetch = originalFetch;
        }
        assert(!networkCallOccurred, '56. no network access occurs while reloading a publication archive');
        assert(restored instanceof PublicationObservationArchive, '57. load() returns a genuine PublicationObservationArchive');
        assert(restored.bitcoinAnchorPublicationRecordCount === 2, '58. both publication records survive a real save/load round trip');

        const postReloadA = inspectBitcoinAnchorPublication(restored, anchorIdA);
        const postReloadB = inspectBitcoinAnchorPublication(restored, anchorIdB);

        assert(JSON.stringify(preReloadA) === JSON.stringify(postReloadA), '59. Publication A\'s inspection is byte-identical before and after reload');
        assert(JSON.stringify(preReloadB) === JSON.stringify(postReloadB), '60. Publication B\'s inspection is byte-identical before and after reload');

        // 4. Different txid never causes accidental reassignment.
        assert(postReloadA.record.txid === TXID_A && postReloadB.record.txid === TXID_B, '61. each restored record still names its own distinct txid — no cross-assignment');

        // 5. Each reconstructed evidence bundle contains only its own
        // observations.
        assert(postReloadA.evidence.confirmationObservations.count === 1, '62. Publication A\'s restored evidence holds exactly its own single confirmation');
        assert(postReloadB.evidence.confirmationObservations.count === 3, '63. Publication B\'s restored evidence holds exactly its own, differently-sized confirmation history');
        assert(postReloadA.evidence.confirmationObservations.observations.every((o) => o.txid === TXID_A), '64. every one of Publication A\'s confirmations names TXID_A');
        assert(postReloadB.evidence.confirmationObservations.observations.every((o) => o.txid === TXID_B), '65. every one of Publication B\'s confirmations names TXID_B');
        assert(!postReloadA.evidence.broadcastObservations.observations.some((o) => o.txid === TXID_B), '66. Publication B\'s broadcast never leaks into Publication A\'s evidence');
        assert(!postReloadB.evidence.broadcastObservations.observations.some((o) => o.txid === TXID_A), '67. Publication A\'s broadcast never leaks into Publication B\'s evidence');

        // 6. Derived 0.8.76/0.8.77 findings (chain-placement comparisons,
        // consistency findings) are unchanged by this milestone — they are
        // still derived fresh, scoped correctly per anchor. A single
        // confirmation still produces one "no prior observation to
        // compare to" entry (application/BitcoinAnchorChainPlacementObserver.js's
        // own, unchanged 0.8.76 behavior); two or more produce one
        // comparison per adjacent pair.
        assert(postReloadA.evidence.chainPlacementObservations.count === 1, '68. Publication A, with only one confirmation, reports the single unchanged "no prior observation" entry, never a second one borrowed from Publication B');
        assert(postReloadB.evidence.chainPlacementObservations.count === 2, '69. Publication B\'s three confirmations produce exactly two chain-placement comparisons');
        assert(postReloadB.evidence.consistencyFindings.count === 2, '70. Publication B\'s consistency findings are scoped to its own confirmation history length');

        // 8. Repeated persistence/reload cycles remain equivalent.
        persistence.save(restored);
        const reloadedAgain = persistence.load();
        const rereadA = inspectBitcoinAnchorPublication(reloadedAgain, anchorIdA);
        const rereadB = inspectBitcoinAnchorPublication(reloadedAgain, anchorIdB);
        assert(JSON.stringify(rereadA) === JSON.stringify(postReloadA), '71. a second save/load cycle is byte-identical to the first for Publication A');
        assert(JSON.stringify(rereadB) === JSON.stringify(postReloadB), '72. a second save/load cycle is byte-identical to the first for Publication B');

        // 9. No verdict field appears anywhere.
        assertNeverScored(postReloadA, 'postReloadA');
        assertNeverScored(postReloadB, 'postReloadB');
    }
    console.log('✓ Section F: FLAGSHIP — two publications sharing one contentHash survive persistence as independent identities, with independently scoped evidence and zero network access');

    // ---------------------------------------------------------------
    // Section G — BitcoinAnchorPublicationInspectionView: malformed/
    // absent inputs never throw; no record means no inspection.
    // ---------------------------------------------------------------
    {
        assert(inspectBitcoinAnchorPublication(PublicationObservationArchive.empty(), 'never-published') === null, '73. inspecting an anchorId with no publication record returns null');
        assert(inspectBitcoinAnchorPublication(null, 'anchor-x') === null, '74. a null archive returns null rather than throwing');
        assert(inspectBitcoinAnchorPublication({}, 'anchor-x') === null, '75. a plain object masquerading as an archive returns null rather than throwing');
        assert(inspectBitcoinAnchorPublication(PublicationObservationArchive.empty(), null) === null, '76. a missing anchorId returns null');
        assert(inspectBitcoinAnchorPublication(PublicationObservationArchive.empty(), '') === null, '77. an empty-string anchorId returns null');
        assert(inspectBitcoinAnchorPublication(PublicationObservationArchive.empty(), 42) === null, '78. a non-string anchorId returns null');

        // An anchor with a publication record but NO observations yet
        // still inspects honestly — an evidence bundle full of zeros,
        // never an error.
        const useCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const archive = useCase.execute(PublicationObservationArchive.empty(), { anchorId: 'anchor-fresh', contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-04-10T00:00:00Z') });
        const inspected = inspectBitcoinAnchorPublication(archive, 'anchor-fresh');
        assert(inspected.record.anchorId === 'anchor-fresh', '79. a publication with no observations yet still inspects successfully');
        assert(inspected.evidence.broadcastObservations.count === 0 && inspected.evidence.confirmationObservations.count === 0 && inspected.evidence.contentProofObservations.count === 0, '80. a freshly created publication honestly reports zero observations, never an error');
    }
    console.log('✓ Section G: BitcoinAnchorPublicationInspectionView — malformed/absent inputs never throw, and no record means no inspection');

    console.log('\nAll BitcoinAnchorPublicationRecord tests passed.');
}

run().catch((error) => {
    console.error('BitcoinAnchorPublicationRecord.test.js FAILED:', error);
    process.exitCode = 1;
});
