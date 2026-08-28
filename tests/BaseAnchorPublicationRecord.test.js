import { BaseAnchorPublicationRecord } from '../application/BaseAnchorPublicationRecord.js';
import {
    appendBaseAnchorPublicationRecordHistoryEntry,
    findBaseAnchorPublicationRecordsByTxid,
    findBaseAnchorPublicationRecordByTxid
} from '../application/BaseAnchorPublicationRecordHistory.js';
import {
    describeBaseAnchorPublicationRecordHistoryEntry,
    describeBaseAnchorPublicationRecordHistory
} from '../application/BaseAnchorPublicationRecordHistoryView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { BlockchainPublicationIdentity } from '../application/BlockchainPublicationIdentity.js';
import { BaseTransactionInclusionObservationState } from '../application/BaseTransactionInclusionObservationState.js';
import { describePublicationObservationArchive } from '../application/PublicationObservationArchiveView.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';

// 0.8.99 — Durable Base Publication Identity Record.
//
// The flagship this milestone exists to prove: a Base publication's own
// durable IDENTITY — mirroring application/BitcoinAnchorPublicationRecord.js's
// own 0.8.80 flagship, one chain over — survives a full persist/destroy/
// reload cycle as its own, independent record; two Base publications
// sharing the exact same contentHash never merge; a Base publication and a
// Bitcoin publication sharing the exact same contentHash never collapse
// into one cross-chain identity; and creating a publication record never
// manufactures a broadcast, an inclusion observation, a timeline entry, or
// any verdict of any kind — in either direction.
//
//   Section A: BaseAnchorPublicationRecord — construction, validation,
//              immutability, toJSON()/fromJSON() round trip,
//              toBlockchainPublicationIdentity()
//   Section B: BaseAnchorPublicationRecordHistory — append-only, never
//              mutates, never deduplicates; txid-only lookup (Base has no
//              separate anchorId)
//   Section C: BaseAnchorPublicationRecordHistoryView — plain narration,
//              oldest first, never scored
//   Section D: PublicationObservationArchive's own eighth collection —
//              append/persist/restore through real storage; a
//              pre-0.8.99 (schemaVersion 4) payload degrades to empty
//   Section E: CreateBaseAnchorPublicationRecordUseCase — the one
//              construction boundary; throws for an invalid identity;
//              never mutates the archive it was given
//   Section F: FLAGSHIP — two Base publications, one shared contentHash,
//              independent inclusion-observation histories, full
//              persist/destroy/reload cycle, isolated identities
//   Section G: cross-chain identity isolation — a Bitcoin publication and
//              a Base publication sharing the identical contentHash AND
//              the identical raw chainReference string never compare
//              equal through BlockchainPublicationIdentity#sameAs()
//   Section H: creating a publication record never manufactures an
//              observation, a timeline entry, or a verdict — and an
//              inclusion observation never manufactures a publication
//              record — in either direction
//   Section I: no verdict vocabulary anywhere in this milestone's own new
//              surface

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'included', 'confirmed', 'safe', 'healthy'
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

function included({ txid, blockNumber, confirmationCount, observedAt }) {
    return Object.freeze({
        state: BaseTransactionInclusionObservationState.INCLUDED,
        txid, blockHash: 'b'.repeat(64), blockNumber, transactionIndex: 0, confirmationCount,
        reason: null, observedAt
    });
}

const TXID_A = '0x' + 'a'.repeat(64);
const TXID_B = '0x' + 'b'.repeat(64);
const SHARED_CONTENT_HASH = 'e'.repeat(64);
const NETWORK = 'mainnet';

async function run() {
    // ---------------------------------------------------------------
    // Section A — BaseAnchorPublicationRecord: construction, validation,
    // immutability, toJSON()/fromJSON(), toBlockchainPublicationIdentity().
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-01T00:00:00.000Z');
        const record = new BaseAnchorPublicationRecord({
            contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt
        });
        assert(record.contentHash === SHARED_CONTENT_HASH, '1. contentHash is exposed unchanged');
        assert(record.txid === TXID_A, '2. txid is exposed unchanged');
        assert(record.network === NETWORK, '3. network is exposed unchanged');
        assert(record.createdAt.getTime() === createdAt.getTime(), '4. createdAt is exposed unchanged');
        assert(Object.isFrozen(record), '5. a record is frozen at construction');
        assert(record.blockchain === BlockchainKind.BASE, '6. blockchain is always BlockchainKind.BASE — computed, never stored');
        assert(!('anchorId' in record.toJSON()), '7. no anchorId field exists anywhere on this record — Base has none');

        for (const missing of ['contentHash', 'txid', 'network']) {
            const fields = { contentHash: 'y', txid: 'z', network: NETWORK, createdAt };
            delete fields[missing];
            let threw = false;
            try { new BaseAnchorPublicationRecord(fields); } catch (error) { threw = true; }
            assert(threw, `8. a missing ${missing} throws rather than constructing a partial identity`);
        }
        let threwForBadDate = false;
        try { new BaseAnchorPublicationRecord({ contentHash: 'y', txid: 'z', network: NETWORK, createdAt: 'not-a-date' }); } catch (error) { threwForBadDate = true; }
        assert(threwForBadDate, '9. an invalid createdAt throws');

        const json = record.toJSON();
        assert(json.createdAt === createdAt.toISOString(), '10. toJSON() serializes createdAt as an ISO string');
        const restored = BaseAnchorPublicationRecord.fromJSON(json);
        assert(restored.contentHash === record.contentHash && restored.txid === record.txid
            && restored.network === record.network && restored.createdAt.getTime() === record.createdAt.getTime(),
            '11. fromJSON(toJSON()) round-trips to an identical record');
        assert(BaseAnchorPublicationRecord.fromJSON(null) === null, '12. fromJSON(null) returns null rather than throwing');

        const identity = record.toBlockchainPublicationIdentity();
        assert(identity instanceof BlockchainPublicationIdentity, '13. toBlockchainPublicationIdentity() returns a genuine BlockchainPublicationIdentity');
        assert(identity.blockchain === BlockchainKind.BASE, '14. the projected identity names BlockchainKind.BASE');
        assert(identity.contentHash === record.contentHash, '15. the projected identity carries the same contentHash');
        assert(identity.chainReference === record.txid, '16. txid fills the projected identity\'s own chainReference slot');
        assert(identity.createdAt.getTime() === record.createdAt.getTime(), '17. the projected identity carries the same createdAt');

        assertNeverScored(json, 'record.toJSON()');
    }
    console.log('✓ Section A: BaseAnchorPublicationRecord — construction, validation, immutability, JSON round trip, and multi-blockchain projection');

    // ---------------------------------------------------------------
    // Section B — BaseAnchorPublicationRecordHistory: append-only, never
    // mutates, never deduplicates; txid-only lookup.
    // ---------------------------------------------------------------
    {
        const recordA = new BaseAnchorPublicationRecord({ contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-01T00:00:00Z') });
        const recordB = new BaseAnchorPublicationRecord({ contentHash: SHARED_CONTENT_HASH, txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-02T00:00:00Z') });

        const empty = [];
        const afterA = appendBaseAnchorPublicationRecordHistoryEntry(empty, recordA);
        assert(empty.length === 0, '18. appending never mutates the array the caller passed in');
        assert(afterA.length === 1 && afterA[0] === recordA, '19. appending to an empty history returns a new one-entry history');
        assert(Object.isFrozen(afterA), '20. the returned history is frozen');

        const afterB = appendBaseAnchorPublicationRecordHistoryEntry(afterA, recordB);
        assert(afterA.length === 1, '21. appending a second entry never mutates the previous history');
        assert(afterB.length === 2 && afterB[0] === recordA && afterB[1] === recordB, '22. both records are held, in append order');

        assert(appendBaseAnchorPublicationRecordHistoryEntry(afterB, null).length === 2, '23. appending a null/falsy record is a no-op');
        assert(appendBaseAnchorPublicationRecordHistoryEntry(undefined, recordA).length === 1, '24. a non-array history starts fresh rather than throwing');

        assert(findBaseAnchorPublicationRecordByTxid(afterB, TXID_A) === recordA, '25. lookup by txid finds the correct record');
        assert(findBaseAnchorPublicationRecordByTxid(afterB, TXID_B) === recordB, '26. lookup by txid never confuses two records sharing the same contentHash');
        assert(findBaseAnchorPublicationRecordByTxid(afterB, 'never-seen') === null, '27. lookup for an unknown txid returns null');
        assert(findBaseAnchorPublicationRecordByTxid(afterB, null) === null, '28. lookup with a non-string txid returns null rather than throwing');

        assert(findBaseAnchorPublicationRecordsByTxid(afterB, TXID_A).length === 1, '29. findBy...RecordsByTxid returns every match, as an array');
        assert(findBaseAnchorPublicationRecordsByTxid(afterB, TXID_A)[0] === recordA, '30. the single match is the correct record');
    }
    console.log('✓ Section B: BaseAnchorPublicationRecordHistory — append-only, never mutates, never deduplicates, looked up by txid alone');

    // ---------------------------------------------------------------
    // Section C — BaseAnchorPublicationRecordHistoryView: plain narration,
    // oldest first, never scored.
    // ---------------------------------------------------------------
    {
        assert(describeBaseAnchorPublicationRecordHistoryEntry(null) === null, '31. describing a null record returns null');
        const record = new BaseAnchorPublicationRecord({ contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-01T00:00:00Z') });
        const described = describeBaseAnchorPublicationRecordHistoryEntry(record);
        assert(described.contentHash === SHARED_CONTENT_HASH && described.txid === TXID_A && described.network === NETWORK, '32. every field is carried through unchanged');
        assertNeverScored(described, 'described');

        const history = describeBaseAnchorPublicationRecordHistory([
            record,
            new BaseAnchorPublicationRecord({ contentHash: SHARED_CONTENT_HASH, txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-02T00:00:00Z') })
        ]);
        assert(history.count === 2, '33. history narration counts every record');
        assert(history.records[0].txid === TXID_A && history.records[1].txid === TXID_B, '34. history narration preserves order, oldest first — never sorted or grouped');
        assertNeverScored(history, 'history');

        const emptyHistory = describeBaseAnchorPublicationRecordHistory(null);
        assert(emptyHistory.count === 0 && emptyHistory.records.length === 0, '35. a null/non-array history narrates as empty rather than throwing');
    }
    console.log('✓ Section C: BaseAnchorPublicationRecordHistoryView — plain, oldest-first narration, never scored');

    // ---------------------------------------------------------------
    // Section D — PublicationObservationArchive's own eighth collection:
    // append/persist/restore through real storage; a pre-0.8.99
    // (schemaVersion 4) payload degrades to empty.
    // ---------------------------------------------------------------
    {
        const record = new BaseAnchorPublicationRecord({ contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-01T00:00:00Z') });

        let archive = PublicationObservationArchive.empty();
        assert(archive.baseAnchorPublicationRecords.length === 0, '36. a fresh archive holds no Base publication records');
        assert(archive.baseAnchorPublicationRecordCount === 0, '37. baseAnchorPublicationRecordCount starts at zero');

        const archiveWithRecord = archive.appendBaseAnchorPublicationRecord(record);
        assert(archive.baseAnchorPublicationRecords.length === 0, '38. appendBaseAnchorPublicationRecord() never mutates the receiver');
        assert(archiveWithRecord.baseAnchorPublicationRecords.length === 1, '39. the returned archive holds the new record');
        assert(archiveWithRecord.baseAnchorPublicationRecordCount === 1, '40. baseAnchorPublicationRecordCount reflects the new record');
        assert(archiveWithRecord.appendBaseAnchorPublicationRecord(null) === archiveWithRecord, '41. appending a null record is a no-op that returns the same archive');

        // publicationCount/observationCount/bitcoinAnchorPublicationRecordCount
        // stay unchanged by this milestone — a Base publication record is
        // identity, never folded into any of those three, already
        // established counts.
        assert(archiveWithRecord.publicationCount === 0, '42. publicationCount is deliberately unaffected by a baseAnchorPublicationRecord');
        assert(archiveWithRecord.observationCount === 0, '43. observationCount is deliberately unaffected by a baseAnchorPublicationRecord');
        assert(archiveWithRecord.bitcoinAnchorPublicationRecordCount === 0, '44. bitcoinAnchorPublicationRecordCount is deliberately unaffected by a baseAnchorPublicationRecord');

        // Real, JSON-round-tripping storage.
        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archiveWithRecord);
        const restored = persistence.load();
        assert(restored.baseAnchorPublicationRecords.length === 1, '45. the persisted record survives a real save/load round trip');
        const restoredRecord = restored.baseAnchorPublicationRecords[0];
        assert(restoredRecord instanceof BaseAnchorPublicationRecord, '46. the restored entry is a genuine BaseAnchorPublicationRecord instance');
        assert(restoredRecord.contentHash === record.contentHash && restoredRecord.txid === record.txid
            && restoredRecord.network === record.network && restoredRecord.createdAt.getTime() === record.createdAt.getTime(),
            '47. every field survives the round trip unchanged');

        // A payload persisted by 0.8.75–0.8.98 (schemaVersion 4, no
        // baseAnchorPublicationRecords field at all) degrades to an empty
        // archive — the identical, already-established "wrong
        // schemaVersion" behavior, never a silent migration.
        const preMilestoneJson = { ...archiveWithRecord.toJSON(), schemaVersion: 4 };
        delete preMilestoneJson.baseAnchorPublicationRecords;
        delete preMilestoneJson.baseAnchorPublicationRecordProvenance;
        assert(PublicationObservationArchive.fromJSON(preMilestoneJson).baseAnchorPublicationRecordCount === 0, '48. a schemaVersion-4 payload degrades to an empty archive, never a partial migration');
        assert(PublicationObservationArchive.isValidJSON(preMilestoneJson) === false, '49. isValidJSON() agrees — a schemaVersion-4 payload is not a valid current-schema archive');

        // A malformed publication record (missing a required field, or an
        // unexpected extra field) degrades the WHOLE archive to empty —
        // never a partially reconstructed one, mirroring every other
        // collection's own identical restraint.
        const missingFieldJson = archiveWithRecord.toJSON();
        delete missingFieldJson.baseAnchorPublicationRecords[0].network;
        assert(PublicationObservationArchive.fromJSON(missingFieldJson).baseAnchorPublicationRecordCount === 0, '50. a publication record missing a required field degrades the whole archive to empty');

        const extraFieldJson = archiveWithRecord.toJSON();
        extraFieldJson.baseAnchorPublicationRecords[0].included = true;
        assert(PublicationObservationArchive.fromJSON(extraFieldJson).baseAnchorPublicationRecordCount === 0, '51. a publication record with an unexpected extra field (e.g. a smuggled verdict) degrades the whole archive to empty');
    }
    console.log('✓ Section D: PublicationObservationArchive\'s eighth collection — append/persist/restore, and pre-0.8.99 payloads degrade honestly');

    // ---------------------------------------------------------------
    // Section E — CreateBaseAnchorPublicationRecordUseCase: the one
    // construction boundary.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBaseAnchorPublicationRecordUseCase();
        const original = PublicationObservationArchive.empty();
        const createdAt = new Date('2026-08-05T12:00:00Z');
        const result = useCase.execute(original, { contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt });

        assert(original.baseAnchorPublicationRecords.length === 0, '52. execute() never mutates the archive it was given');
        assert(result.baseAnchorPublicationRecords.length === 1, '53. execute() returns a new archive holding the newly constructed record');
        assert(result.baseAnchorPublicationRecords[0].txid === TXID_A && result.baseAnchorPublicationRecords[0].contentHash === SHARED_CONTENT_HASH, '54. the constructed record carries exactly the fields passed in');

        let threw = false;
        try { useCase.execute(original, { contentHash: null, txid: TXID_A, network: NETWORK }); } catch (error) { threw = true; }
        assert(threw, '55. execute() throws for an invalid identity rather than silently degrading it');

        const fromNonArchive = useCase.execute(null, { contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt });
        assert(fromNonArchive.baseAnchorPublicationRecords.length === 1, '56. a non-archive input degrades to PublicationObservationArchive.empty() before appending, never throws');
    }
    console.log('✓ Section E: CreateBaseAnchorPublicationRecordUseCase — the one construction boundary, never mutating, throwing only for an invalid identity');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP: two Base publications, one shared contentHash,
    // independent inclusion-observation histories, full persist/destroy/
    // reload cycle, isolated identities.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBaseAnchorPublicationRecordUseCase();

        let archive = PublicationObservationArchive.empty();

        // Publication A — created at finalization, then observed included
        // once.
        archive = useCase.execute(archive, { contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-10T08:00:00Z') });
        archive = archive.appendBaseTransactionInclusionObservation(TXID_A, included({ txid: TXID_A, blockNumber: 1000, confirmationCount: 1, observedAt: new Date('2026-08-10T08:10:00Z') }));

        // Publication B — SAME contentHash, DIFFERENT txid, created later,
        // observed included TWICE (a completely different-shaped
        // observation history).
        archive = useCase.execute(archive, { contentHash: SHARED_CONTENT_HASH, txid: TXID_B, network: NETWORK, createdAt: new Date('2026-08-11T09:00:00Z') });
        archive = archive.appendBaseTransactionInclusionObservation(TXID_B, included({ txid: TXID_B, blockNumber: 1010, confirmationCount: 1, observedAt: new Date('2026-08-11T09:10:00Z') }));
        archive = archive.appendBaseTransactionInclusionObservation(TXID_B, included({ txid: TXID_B, blockNumber: 1010, confirmationCount: 2, observedAt: new Date('2026-08-11T09:20:00Z') }));

        assert(archive.baseAnchorPublicationRecordCount === 2, '57. both publication records exist in the live archive');

        const recordA = findBaseAnchorPublicationRecordByTxid(archive.baseAnchorPublicationRecords, TXID_A);
        const recordB = findBaseAnchorPublicationRecordByTxid(archive.baseAnchorPublicationRecords, TXID_B);

        // 1 & 2. Both publication records survive, and their identities
        // remain distinct.
        assert(recordA.txid === TXID_A && recordB.txid === TXID_B, '58. each record keeps its own, distinct txid');

        // 3. Identical contentHash never merges them.
        assert(recordA.contentHash === SHARED_CONTENT_HASH && recordB.contentHash === SHARED_CONTENT_HASH, '59. both records genuinely share the identical contentHash');
        assert(recordA.txid !== recordB.txid, '60. an identical contentHash never collapses the two into one identity');

        const preReloadHistoryA = archive.baseTransactionInclusionObservationsByTransactionHash[TXID_A] || [];
        const preReloadHistoryB = archive.baseTransactionInclusionObservationsByTransactionHash[TXID_B] || [];
        assert(preReloadHistoryA.length === 1 && preReloadHistoryB.length === 2, '61. each publication\'s own inclusion-observation history is independently sized before reload');

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
        assert(!networkCallOccurred, '62. no network access occurs while reloading a publication archive');
        assert(restored instanceof PublicationObservationArchive, '63. load() returns a genuine PublicationObservationArchive');
        assert(restored.baseAnchorPublicationRecordCount === 2, '64. both publication records survive a real save/load round trip');

        const postReloadRecordA = findBaseAnchorPublicationRecordByTxid(restored.baseAnchorPublicationRecords, TXID_A);
        const postReloadRecordB = findBaseAnchorPublicationRecordByTxid(restored.baseAnchorPublicationRecords, TXID_B);

        // 4. Different txid never causes accidental reassignment.
        assert(postReloadRecordA.txid === TXID_A && postReloadRecordB.txid === TXID_B, '65. each restored record still names its own distinct txid — no cross-assignment');
        assert(JSON.stringify(postReloadRecordA.toJSON()) === JSON.stringify(recordA.toJSON()), '66. Publication A\'s record is byte-identical before and after reload');
        assert(JSON.stringify(postReloadRecordB.toJSON()) === JSON.stringify(recordB.toJSON()), '67. Publication B\'s record is byte-identical before and after reload');

        // 5. Each restored observation history holds only its own
        // observations — no leakage.
        const postReloadHistoryA = restored.baseTransactionInclusionObservationsByTransactionHash[TXID_A] || [];
        const postReloadHistoryB = restored.baseTransactionInclusionObservationsByTransactionHash[TXID_B] || [];
        assert(postReloadHistoryA.length === 1, '68. Publication A\'s restored history holds exactly its own single inclusion observation');
        assert(postReloadHistoryB.length === 2, '69. Publication B\'s restored history holds exactly its own, differently-sized inclusion observation history');
        assert(postReloadHistoryA.every((o) => o.txid === TXID_A), '70. every one of Publication A\'s observations names TXID_A');
        assert(postReloadHistoryB.every((o) => o.txid === TXID_B), '71. every one of Publication B\'s observations names TXID_B');

        // 6. Repeated persistence/reload cycles remain equivalent.
        persistence.save(restored);
        const reloadedAgain = persistence.load();
        assert(reloadedAgain.baseAnchorPublicationRecordCount === 2, '72. a second save/load cycle still holds both publication records');
        assert(JSON.stringify(reloadedAgain.toJSON()) === JSON.stringify(restored.toJSON()), '73. a second save/load cycle is byte-identical to the first');

        // 7. No verdict field appears anywhere.
        assertNeverScored(restored.toJSON(), 'restored');
    }
    console.log('✓ Section F: FLAGSHIP — two Base publications sharing one contentHash survive persistence as independent identities, with independently scoped inclusion histories and zero network access');

    // ---------------------------------------------------------------
    // Section G — cross-chain identity isolation: a Bitcoin publication
    // and a Base publication sharing the identical contentHash AND the
    // identical raw chainReference string never compare equal.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-12T00:00:00Z');
        const SHARED_RAW_REFERENCE = 'f'.repeat(64);

        const bitcoinUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = bitcoinUseCase.execute(archive, { anchorId: 'anchor-shared', contentHash: SHARED_CONTENT_HASH, txid: SHARED_RAW_REFERENCE, network: 'mainnet', createdAt });
        archive = baseUseCase.execute(archive, { contentHash: SHARED_CONTENT_HASH, txid: SHARED_RAW_REFERENCE, network: 'mainnet', createdAt });

        assert(archive.bitcoinAnchorPublicationRecordCount === 1 && archive.baseAnchorPublicationRecordCount === 1, '74. both a Bitcoin and a Base publication record exist, independently');

        const bitcoinRecord = archive.bitcoinAnchorPublicationRecords[0];
        const baseRecord = archive.baseAnchorPublicationRecords[0];

        assert(bitcoinRecord.contentHash === baseRecord.contentHash, '75. sanity check — both records genuinely share the identical contentHash');
        assert(bitcoinRecord.txid === baseRecord.txid, '76. sanity check — both records genuinely share the identical raw chainReference string');

        const bitcoinIdentity = bitcoinRecord.toBlockchainPublicationIdentity();
        const baseIdentity = baseRecord.toBlockchainPublicationIdentity();

        assert(bitcoinIdentity.blockchain === BlockchainKind.BITCOIN, '77. the Bitcoin projection names BlockchainKind.BITCOIN');
        assert(baseIdentity.blockchain === BlockchainKind.BASE, '78. the Base projection names BlockchainKind.BASE');
        assert(bitcoinIdentity.chainReference === baseIdentity.chainReference, '79. sanity check — the two projected identities carry the identical raw chainReference string');

        assert(bitcoinIdentity.sameAs(baseIdentity) === false, '80. THE FLAGSHIP CROSS-CHAIN RULE: identical contentHash AND identical raw chainReference across two different chains never compares equal — blockchain must ALSO match');
        assert(baseIdentity.sameAs(bitcoinIdentity) === false, '81. the identical rule holds symmetrically in the other direction');
    }
    console.log('✓ Section G: cross-chain identity isolation — a Bitcoin and a Base publication sharing an identical contentHash and raw chainReference never compare equal');

    // ---------------------------------------------------------------
    // Section H — creating a publication record never manufactures an
    // observation, a timeline entry, or a verdict — and an inclusion
    // observation never manufactures a publication record — in either
    // direction.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBaseAnchorPublicationRecordUseCase();

        // Minting a publication record alone never creates a broadcast, an
        // inclusion observation, a timeline entry, or any verdict.
        let archive = useCase.execute(PublicationObservationArchive.empty(), { contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-13T00:00:00Z') });
        assert(archive.baseAnchorPublicationRecordCount === 1, '82. sanity check — the publication record itself exists');
        assert(Object.keys(archive.baseTransactionInclusionObservationsByTransactionHash).length === 0, '83. minting a publication record manufactures NO inclusion observation');
        assert(archive.observationCount === 0, '84. minting a publication record manufactures NO observation of any kind');

        const summary = describePublicationObservationArchive(archive);
        assert(summary.entryCount === 0 && summary.entries.length === 0, '85. minting a publication record manufactures NO timeline entry — the cross-domain timeline stays deliberately untouched by this milestone');

        // An inclusion observation, in the opposite direction, never
        // manufactures a publication record.
        let observedOnly = PublicationObservationArchive.empty();
        observedOnly = observedOnly.appendBaseTransactionInclusionObservation(TXID_B, included({ txid: TXID_B, blockNumber: 2000, confirmationCount: 1, observedAt: new Date('2026-08-13T00:05:00Z') }));
        assert(observedOnly.baseAnchorPublicationRecordCount === 0, '86. an inclusion observation manufactures NO publication record — observing a transaction is never the same as this replica having minted its own publication identity for it');
    }
    console.log('✓ Section H: minting a publication record and archiving an inclusion observation stay two, entirely independent actions — neither ever manufactures the other');

    // ---------------------------------------------------------------
    // Section I — no verdict vocabulary anywhere in this milestone's own
    // new surface.
    // ---------------------------------------------------------------
    {
        const useCase = new CreateBaseAnchorPublicationRecordUseCase();
        const archive = useCase.execute(PublicationObservationArchive.empty(), { contentHash: SHARED_CONTENT_HASH, txid: TXID_A, network: NETWORK, createdAt: new Date('2026-08-14T00:00:00Z') });
        assertNeverScored(archive.toJSON(), 'archive.toJSON()');
        assertNeverScored(archive.baseAnchorPublicationRecords.map((r) => r.toJSON()), 'baseAnchorPublicationRecords');
        assertNeverScored(archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity().toJSON(), 'toBlockchainPublicationIdentity()');
    }
    console.log('✓ Section I: no trust/confidence/verdict vocabulary exists anywhere in this milestone\'s own new surface');

    console.log('\nAll BaseAnchorPublicationRecord tests passed.');
}

run().catch((error) => {
    console.error('BaseAnchorPublicationRecord.test.js FAILED:', error);
    process.exitCode = 1;
});
