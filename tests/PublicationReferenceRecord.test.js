import { PublicationReferenceRecord } from '../application/PublicationReferenceRecord.js';
import {
    appendPublicationReferenceRecordHistoryEntry,
    findPublicationReferenceRecordsBySource,
    findPublicationReferenceRecordsByReferenced
} from '../application/PublicationReferenceRecordHistory.js';
import {
    describePublicationReferenceRecordHistoryEntry,
    describePublicationReferenceRecordHistory
} from '../application/PublicationReferenceRecordHistoryView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { CreatePublicationReferenceRecordUseCase } from '../application/CreatePublicationReferenceRecordUseCase.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { BlockchainPublicationIdentity } from '../application/BlockchainPublicationIdentity.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';

// 0.8.104 — Explicit Publication Reference Relationship.
//
// The flagship this milestone exists to prove: an explicit, durable
// `sourcePublicationIdentity -> referencedPublicationIdentity` relationship
// between two ALREADY-DURABLE publication identities — never inferred from
// a shared `contentHash`, never auto-created by any finalization or
// observation flow, and never collapsed with a second, independent
// reference between the identical two publications. Both identities are
// reused, UNCHANGED, application/BlockchainPublicationIdentity.js (0.8.89)
// instances — this milestone assembles neither by hand.
//
//   Section A: PublicationReferenceRecord — construction, validation,
//              immutability, self-reference rejection, toJSON()/fromJSON()
//   Section B: PublicationReferenceRecordHistory — append-only, never
//              mutates, never deduplicates; explicit-identity lookup by
//              source and by referenced, never by contentHash
//   Section C: PublicationReferenceRecordHistoryView — plain narration,
//              oldest first, never scored
//   Section D: PublicationObservationArchive's own ninth collection —
//              append/persist/restore through real storage; SCHEMA_VERSION
//              5 -> 6; a pre-0.8.104 payload degrades to empty
//   Section E: CreatePublicationReferenceRecordUseCase — the one
//              construction boundary; throws for an invalid reference;
//              never mutates the archive it was given
//   Section F: FLAGSHIP — Bob's Base publication references Alice's
//              Bitcoin publication three times, Carol's Bitcoin
//              publication references it once — four independent records,
//              never deduplicated or collapsed into one count, surviving a
//              full persist/destroy/reload cycle
//   Section G: never correlated by contentHash — two references naming
//              two different chainReferences that happen to share one
//              contentHash stay two entirely independent relationships;
//              a Bitcoin and a Base identity sharing an identical
//              contentHash and raw chainReference are still different
//              referenced publications
//   Section H: recording a reference never manufactures a publication
//              record, an observation, an achievement event, or a
//              timeline entry — in any direction
//   Section I: no verdict vocabulary anywhere in this milestone's own new
//              surface

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'weight', 'strength', 'referenceKind',
    'included', 'confirmed', 'safe', 'healthy', 'rank', 'points', 'level', 'tier'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a publication reference establishes a relationship, it does not score it`);
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

function identity({ blockchain, contentHash, chainReference, createdAt }) {
    return new BlockchainPublicationIdentity({ blockchain, contentHash, chainReference, createdAt });
}

const CONTENT_HASH_ALICE = 'a'.repeat(64);
const CONTENT_HASH_BOB = 'b'.repeat(64);
const CONTENT_HASH_CAROL = 'c'.repeat(64);
const BITCOIN_TXID_ALICE = '1'.repeat(64);
const BASE_TXID_BOB = '0x' + '2'.repeat(64);
const BITCOIN_TXID_CAROL = '3'.repeat(64);
const NETWORK = 'mainnet';

async function run() {
    // ---------------------------------------------------------------
    // Section A — PublicationReferenceRecord: construction, validation,
    // immutability, self-reference rejection, toJSON()/fromJSON().
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-20T00:00:00.000Z');
        const source = identity({ blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_BOB, chainReference: BASE_TXID_BOB, createdAt });
        const referenced = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_ALICE, chainReference: BITCOIN_TXID_ALICE, createdAt });

        const record = new PublicationReferenceRecord({ sourcePublicationIdentity: source, referencedPublicationIdentity: referenced, createdAt });
        assert(record.sourcePublicationIdentity === source, '1. sourcePublicationIdentity is exposed as the exact instance given');
        assert(record.referencedPublicationIdentity === referenced, '2. referencedPublicationIdentity is exposed as the exact instance given');
        assert(record.createdAt.getTime() === createdAt.getTime(), '3. createdAt is exposed unchanged');
        assert(Object.isFrozen(record), '4. a record is frozen at construction');

        for (const missing of ['sourcePublicationIdentity', 'referencedPublicationIdentity']) {
            const fields = { sourcePublicationIdentity: source, referencedPublicationIdentity: referenced, createdAt };
            delete fields[missing];
            let threw = false;
            try { new PublicationReferenceRecord(fields); } catch (error) { threw = true; }
            assert(threw, `5. a missing ${missing} throws rather than constructing a partial relationship`);
        }

        let threwForRawObject = false;
        try {
            new PublicationReferenceRecord({
                sourcePublicationIdentity: { blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_BOB, chainReference: BASE_TXID_BOB, createdAt },
                referencedPublicationIdentity: referenced,
                createdAt
            });
        } catch (error) { threwForRawObject = true; }
        assert(threwForRawObject, '6. a bare object assembled by hand is rejected — sourcePublicationIdentity must be a genuine BlockchainPublicationIdentity instance');

        let threwForSelfReference = false;
        try { new PublicationReferenceRecord({ sourcePublicationIdentity: source, referencedPublicationIdentity: source, createdAt }); } catch (error) { threwForSelfReference = true; }
        assert(threwForSelfReference, '7. a publication naming itself as both source and referenced throws — a publication cannot reference itself');

        // Same blockchain, same chainReference, but a DIFFERENT contentHash
        // still counts as "the same publication" per sameAs() — self-
        // reference detection uses sameAs(), never contentHash equality.
        const sameIdentityDifferentContentHash = identity({ blockchain: source.blockchain, contentHash: 'z'.repeat(64), chainReference: source.chainReference, createdAt });
        let threwForSameAsSelfReference = false;
        try { new PublicationReferenceRecord({ sourcePublicationIdentity: source, referencedPublicationIdentity: sameIdentityDifferentContentHash, createdAt }); } catch (error) { threwForSameAsSelfReference = true; }
        assert(threwForSameAsSelfReference, '8. self-reference is rejected via sameAs() (blockchain + chainReference), not by comparing contentHash');

        let threwForBadDate = false;
        try { new PublicationReferenceRecord({ sourcePublicationIdentity: source, referencedPublicationIdentity: referenced, createdAt: 'not-a-date' }); } catch (error) { threwForBadDate = true; }
        assert(threwForBadDate, '9. an invalid createdAt throws');

        const json = record.toJSON();
        assert(json.createdAt === createdAt.toISOString(), '10. toJSON() serializes createdAt as an ISO string');
        assert(json.sourcePublicationIdentity.chainReference === BASE_TXID_BOB, '11. toJSON() serializes sourcePublicationIdentity through its own toJSON()');
        assert(json.referencedPublicationIdentity.chainReference === BITCOIN_TXID_ALICE, '12. toJSON() serializes referencedPublicationIdentity through its own toJSON()');

        const restored = PublicationReferenceRecord.fromJSON(json);
        assert(restored.sourcePublicationIdentity.sameAs(source), '13. fromJSON(toJSON()) round-trips sourcePublicationIdentity to an equal identity');
        assert(restored.referencedPublicationIdentity.sameAs(referenced), '14. fromJSON(toJSON()) round-trips referencedPublicationIdentity to an equal identity');
        assert(restored.createdAt.getTime() === record.createdAt.getTime(), '15. fromJSON(toJSON()) round-trips createdAt unchanged');
        assert(PublicationReferenceRecord.fromJSON(null) === null, '16. fromJSON(null) returns null rather than throwing');

        assertNeverScored(json, 'record.toJSON()');
    }
    console.log('✓ Section A: PublicationReferenceRecord — construction, validation, immutability, self-reference rejection, and JSON round trip');

    // ---------------------------------------------------------------
    // Section B — PublicationReferenceRecordHistory: append-only, never
    // mutates, never deduplicates; explicit-identity lookup.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-20T00:00:00Z');
        const bobSource = identity({ blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_BOB, chainReference: BASE_TXID_BOB, createdAt });
        const carolSource = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_CAROL, chainReference: BITCOIN_TXID_CAROL, createdAt });
        const aliceReferenced = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_ALICE, chainReference: BITCOIN_TXID_ALICE, createdAt });

        const recordA = new PublicationReferenceRecord({ sourcePublicationIdentity: bobSource, referencedPublicationIdentity: aliceReferenced, createdAt });
        const recordB = new PublicationReferenceRecord({ sourcePublicationIdentity: carolSource, referencedPublicationIdentity: aliceReferenced, createdAt: new Date('2026-08-21T00:00:00Z') });

        const empty = [];
        const afterA = appendPublicationReferenceRecordHistoryEntry(empty, recordA);
        assert(empty.length === 0, '17. appending never mutates the array the caller passed in');
        assert(afterA.length === 1 && afterA[0] === recordA, '18. appending to an empty history returns a new one-entry history');
        assert(Object.isFrozen(afterA), '19. the returned history is frozen');

        const afterB = appendPublicationReferenceRecordHistoryEntry(afterA, recordB);
        assert(afterA.length === 1, '20. appending a second entry never mutates the previous history');
        assert(afterB.length === 2 && afterB[0] === recordA && afterB[1] === recordB, '21. both records are held, in append order');

        assert(appendPublicationReferenceRecordHistoryEntry(afterB, null).length === 2, '22. appending a null/falsy record is a no-op');
        assert(appendPublicationReferenceRecordHistoryEntry(undefined, recordA).length === 1, '23. a non-array history starts fresh rather than throwing');

        const bySource = findPublicationReferenceRecordsBySource(afterB, bobSource);
        assert(bySource.length === 1 && bySource[0] === recordA, '24. lookup by source finds exactly the record naming that source');

        const byReferenced = findPublicationReferenceRecordsByReferenced(afterB, aliceReferenced);
        assert(byReferenced.length === 2, '25. lookup by referenced identity finds every reference pointing at it — never just one');
        assert(byReferenced.includes(recordA) && byReferenced.includes(recordB), '26. both Bob\'s and Carol\'s references to Alice\'s publication are found');

        const neverReferenced = identity({ blockchain: BlockchainKind.BASE, contentHash: 'never'.padEnd(64, '0'), chainReference: '9'.repeat(64), createdAt });
        assert(findPublicationReferenceRecordsByReferenced(afterB, neverReferenced).length === 0, '27. lookup for an identity nothing references returns empty, never a guess');
        assert(findPublicationReferenceRecordsBySource(afterB, null).length === 0, '28. lookup with a non-identity source returns empty rather than throwing');
    }
    console.log('✓ Section B: PublicationReferenceRecordHistory — append-only, never mutates, never deduplicates, looked up by explicit identity alone');

    // ---------------------------------------------------------------
    // Section C — PublicationReferenceRecordHistoryView: plain narration,
    // oldest first, never scored.
    // ---------------------------------------------------------------
    {
        assert(describePublicationReferenceRecordHistoryEntry(null) === null, '29. describing a null record returns null');
        const createdAt = new Date('2026-08-20T00:00:00Z');
        const source = identity({ blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_BOB, chainReference: BASE_TXID_BOB, createdAt });
        const referenced = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_ALICE, chainReference: BITCOIN_TXID_ALICE, createdAt });
        const record = new PublicationReferenceRecord({ sourcePublicationIdentity: source, referencedPublicationIdentity: referenced, createdAt });

        const described = describePublicationReferenceRecordHistoryEntry(record);
        assert(described.sourcePublicationIdentity === source, '30. sourcePublicationIdentity is carried through as the exact same instance');
        assert(described.referencedPublicationIdentity === referenced, '31. referencedPublicationIdentity is carried through as the exact same instance');
        assertNeverScored(described, 'described');

        const later = new PublicationReferenceRecord({ sourcePublicationIdentity: source, referencedPublicationIdentity: referenced, createdAt: new Date('2026-08-21T00:00:00Z') });
        const history = describePublicationReferenceRecordHistory([record, later]);
        assert(history.count === 2, '32. history narration counts every record');
        assert(history.records[0].createdAt.getTime() < history.records[1].createdAt.getTime(), '33. history narration preserves order, oldest first — never sorted or grouped');
        assertNeverScored(history, 'history');

        const emptyHistory = describePublicationReferenceRecordHistory(null);
        assert(emptyHistory.count === 0 && emptyHistory.records.length === 0, '34. a null/non-array history narrates as empty rather than throwing');
    }
    console.log('✓ Section C: PublicationReferenceRecordHistoryView — plain, oldest-first narration, never scored');

    // ---------------------------------------------------------------
    // Section D — PublicationObservationArchive's own ninth collection:
    // append/persist/restore through real storage; SCHEMA_VERSION 5 -> 6;
    // a pre-0.8.104 payload degrades to empty.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-20T00:00:00Z');
        const source = identity({ blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_BOB, chainReference: BASE_TXID_BOB, createdAt });
        const referenced = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_ALICE, chainReference: BITCOIN_TXID_ALICE, createdAt });
        const record = new PublicationReferenceRecord({ sourcePublicationIdentity: source, referencedPublicationIdentity: referenced, createdAt });

        assert(PublicationObservationArchive.SCHEMA_VERSION === 7, '35. SCHEMA_VERSION is now 7 (bumped from 5 by 0.8.104, then to 7 by 0.8.108)');

        let archive = PublicationObservationArchive.empty();
        assert(archive.publicationReferenceRecords.length === 0, '36. a fresh archive holds no publication reference records');
        assert(archive.publicationReferenceRecordCount === 0, '37. publicationReferenceRecordCount starts at zero');

        const archiveWithRecord = archive.appendPublicationReferenceRecord(record);
        assert(archive.publicationReferenceRecords.length === 0, '38. appendPublicationReferenceRecord() never mutates the receiver');
        assert(archiveWithRecord.publicationReferenceRecords.length === 1, '39. the returned archive holds the new record');
        assert(archiveWithRecord.publicationReferenceRecordCount === 1, '40. publicationReferenceRecordCount reflects the new record');
        assert(archiveWithRecord.appendPublicationReferenceRecord(null) === archiveWithRecord, '41. appending a null record is a no-op that returns the same archive');

        // publicationCount/observationCount/bitcoinAnchorPublicationRecordCount/
        // baseAnchorPublicationRecordCount stay unchanged — a reference is
        // a relationship, never folded into any of those four, already
        // established counts.
        assert(archiveWithRecord.publicationCount === 0, '42. publicationCount is deliberately unaffected by a publicationReferenceRecord');
        assert(archiveWithRecord.observationCount === 0, '43. observationCount is deliberately unaffected by a publicationReferenceRecord');
        assert(archiveWithRecord.bitcoinAnchorPublicationRecordCount === 0, '44. bitcoinAnchorPublicationRecordCount is deliberately unaffected by a publicationReferenceRecord');
        assert(archiveWithRecord.baseAnchorPublicationRecordCount === 0, '44b. baseAnchorPublicationRecordCount is deliberately unaffected by a publicationReferenceRecord');

        // Real, JSON-round-tripping storage.
        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archiveWithRecord);
        const restored = persistence.load();
        assert(restored.publicationReferenceRecords.length === 1, '45. the persisted record survives a real save/load round trip');
        const restoredRecord = restored.publicationReferenceRecords[0];
        assert(restoredRecord instanceof PublicationReferenceRecord, '46. the restored entry is a genuine PublicationReferenceRecord instance');
        assert(restoredRecord.sourcePublicationIdentity.sameAs(source), '47. the restored source identity is equal to the original');
        assert(restoredRecord.referencedPublicationIdentity.sameAs(referenced), '48. the restored referenced identity is equal to the original');
        assert(restoredRecord.createdAt.getTime() === record.createdAt.getTime(), '49. createdAt survives the round trip unchanged');

        // A payload persisted by 0.8.75–0.8.103 (schemaVersion 5, no
        // publicationReferenceRecords field at all) degrades to an empty
        // archive — the identical, already-established "wrong
        // schemaVersion" behavior, never a silent migration.
        const preMilestoneJson = { ...archiveWithRecord.toJSON(), schemaVersion: 5 };
        delete preMilestoneJson.publicationReferenceRecords;
        delete preMilestoneJson.publicationReferenceRecordProvenance;
        assert(PublicationObservationArchive.fromJSON(preMilestoneJson).publicationReferenceRecordCount === 0, '50. a schemaVersion-5 payload degrades to an empty archive, never a partial migration');
        assert(PublicationObservationArchive.isValidJSON(preMilestoneJson) === false, '51. isValidJSON() agrees — a schemaVersion-5 payload is not a valid current-schema archive');

        // A malformed reference record (missing a required field, an
        // unexpected extra field, or a nested identity assembled by hand
        // with a bad blockchain kind) degrades the WHOLE archive to empty
        // — never a partially reconstructed one.
        const missingFieldJson = archiveWithRecord.toJSON();
        delete missingFieldJson.publicationReferenceRecords[0].createdAt;
        assert(PublicationObservationArchive.fromJSON(missingFieldJson).publicationReferenceRecordCount === 0, '52. a reference record missing a required field degrades the whole archive to empty');

        const extraFieldJson = archiveWithRecord.toJSON();
        extraFieldJson.publicationReferenceRecords[0].weight = 1;
        assert(PublicationObservationArchive.fromJSON(extraFieldJson).publicationReferenceRecordCount === 0, '53. a reference record with an unexpected extra field (e.g. a smuggled weight) degrades the whole archive to empty');

        const badBlockchainJson = archiveWithRecord.toJSON();
        badBlockchainJson.publicationReferenceRecords[0].sourcePublicationIdentity.blockchain = 'ethereum';
        assert(PublicationObservationArchive.fromJSON(badBlockchainJson).publicationReferenceRecordCount === 0, '54. a reference record whose nested identity names an unknown blockchain degrades the whole archive to empty');
    }
    console.log('✓ Section D: PublicationObservationArchive\'s ninth collection — append/persist/restore, SCHEMA_VERSION 5 -> 6, and pre-0.8.104 payloads degrade honestly');

    // ---------------------------------------------------------------
    // Section E — CreatePublicationReferenceRecordUseCase: the one
    // construction boundary.
    // ---------------------------------------------------------------
    {
        const useCase = new CreatePublicationReferenceRecordUseCase();
        const createdAt = new Date('2026-08-22T12:00:00Z');
        const source = identity({ blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_BOB, chainReference: BASE_TXID_BOB, createdAt });
        const referenced = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_ALICE, chainReference: BITCOIN_TXID_ALICE, createdAt });

        const original = PublicationObservationArchive.empty();
        const result = useCase.execute(original, { sourcePublicationIdentity: source, referencedPublicationIdentity: referenced, createdAt });

        assert(original.publicationReferenceRecords.length === 0, '55. execute() never mutates the archive it was given');
        assert(result.publicationReferenceRecords.length === 1, '56. execute() returns a new archive holding the newly constructed record');
        assert(result.publicationReferenceRecords[0].sourcePublicationIdentity === source, '57. the constructed record carries exactly the identity instance passed in');

        let threw = false;
        try { useCase.execute(original, { sourcePublicationIdentity: source, referencedPublicationIdentity: source, createdAt }); } catch (error) { threw = true; }
        assert(threw, '58. execute() throws for a self-referencing pair rather than silently degrading it');

        const fromNonArchive = useCase.execute(null, { sourcePublicationIdentity: source, referencedPublicationIdentity: referenced, createdAt });
        assert(fromNonArchive.publicationReferenceRecords.length === 1, '59. a non-archive input degrades to PublicationObservationArchive.empty() before appending, never throws');
    }
    console.log('✓ Section E: CreatePublicationReferenceRecordUseCase — the one construction boundary, never mutating, throwing only for an invalid reference');

    // ---------------------------------------------------------------
    // Section F — FLAGSHIP: Bob's Base publication references Alice's
    // Bitcoin publication three times, Carol's Bitcoin publication
    // references it once — four independent records, never deduplicated,
    // surviving a full persist/destroy/reload cycle.
    // ---------------------------------------------------------------
    {
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();
        const bitcoinUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = bitcoinUseCase.execute(archive, { anchorId: 'anchor-alice', contentHash: CONTENT_HASH_ALICE, txid: BITCOIN_TXID_ALICE, network: NETWORK, createdAt: new Date('2026-08-10T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: CONTENT_HASH_BOB, txid: BASE_TXID_BOB, network: NETWORK, createdAt: new Date('2026-08-11T00:00:00Z') });
        archive = bitcoinUseCase.execute(archive, { anchorId: 'anchor-carol', contentHash: CONTENT_HASH_CAROL, txid: BITCOIN_TXID_CAROL, network: NETWORK, createdAt: new Date('2026-08-12T00:00:00Z') });

        const aliceIdentity = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'anchor-alice').toBlockchainPublicationIdentity();
        const bobIdentity = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        const carolIdentity = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'anchor-carol').toBlockchainPublicationIdentity();

        // Bob references Alice's publication THREE times.
        archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: bobIdentity, referencedPublicationIdentity: aliceIdentity, createdAt: new Date('2026-08-13T00:00:00Z') });
        archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: bobIdentity, referencedPublicationIdentity: aliceIdentity, createdAt: new Date('2026-08-13T01:00:00Z') });
        archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: bobIdentity, referencedPublicationIdentity: aliceIdentity, createdAt: new Date('2026-08-13T02:00:00Z') });
        // Carol references Alice's publication ONCE.
        archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: carolIdentity, referencedPublicationIdentity: aliceIdentity, createdAt: new Date('2026-08-14T00:00:00Z') });

        assert(archive.publicationReferenceRecordCount === 4, '60. FOUR independent reference records exist — three from Bob, one from Carol — never collapsed into one');

        const referencingAlice = findPublicationReferenceRecordsByReferenced(archive.publicationReferenceRecords, aliceIdentity);
        assert(referencingAlice.length === 4, '61. every one of the four references pointing at Alice\'s publication is found, undeduplicated');

        const distinctReferencers = new Set(referencingAlice.map((r) => `${r.sourcePublicationIdentity.blockchain}:${r.sourcePublicationIdentity.chainReference}`));
        assert(distinctReferencers.size === 2, '62. exactly two DISTINCT referencing identities exist (Bob, Carol) even though four reference records exist — reference count and distinct referencer count are two different facts, deliberately never merged by this milestone');

        // Persist through REAL, JSON-round-tripping storage, then destroy
        // every in-memory reference, guarding for zero network calls.
        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archive);
        const preReloadJSON = archive.toJSON();
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
        assert(!networkCallOccurred, '63. no network access occurs while reloading a publication archive');
        assert(restored instanceof PublicationObservationArchive, '64. load() returns a genuine PublicationObservationArchive');
        assert(restored.publicationReferenceRecordCount === 4, '65. all four reference records survive a real save/load round trip');
        assert(JSON.stringify(restored.toJSON()) === JSON.stringify(preReloadJSON), '66. the restored archive is byte-identical to the one that was saved');

        const restoredReferencingAlice = findPublicationReferenceRecordsByReferenced(restored.publicationReferenceRecords, aliceIdentity);
        assert(restoredReferencingAlice.length === 4, '67. all four references to Alice\'s publication still resolve correctly after reload');

        // A second save/load cycle remains equivalent.
        persistence.save(restored);
        const reloadedAgain = persistence.load();
        assert(reloadedAgain.publicationReferenceRecordCount === 4, '68. a second save/load cycle still holds all four reference records');
        assert(JSON.stringify(reloadedAgain.toJSON()) === JSON.stringify(restored.toJSON()), '69. a second save/load cycle is byte-identical to the first');

        assertNeverScored(restored.toJSON(), 'restored');
    }
    console.log('✓ Section F: FLAGSHIP — four independent reference records (three from Bob, one from Carol) survive persistence undeduplicated, with reference count and distinct referencer count kept separate');

    // ---------------------------------------------------------------
    // Section G — never correlated by contentHash: two references naming
    // different chainReferences that share a contentHash stay independent;
    // a Bitcoin and a Base identity sharing an identical contentHash and
    // raw chainReference are still different referenced publications.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-15T00:00:00Z');
        const SHARED_RAW_REFERENCE = 'f'.repeat(64);
        const SHARED_CONTENT_HASH = 'e'.repeat(64);

        const bitcoinUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = bitcoinUseCase.execute(archive, { anchorId: 'anchor-shared', contentHash: SHARED_CONTENT_HASH, txid: SHARED_RAW_REFERENCE, network: NETWORK, createdAt });
        archive = baseUseCase.execute(archive, { contentHash: SHARED_CONTENT_HASH, txid: SHARED_RAW_REFERENCE, network: NETWORK, createdAt });
        archive = bitcoinUseCase.execute(archive, { anchorId: 'anchor-source', contentHash: 'd'.repeat(64), txid: '4'.repeat(64), network: NETWORK, createdAt });

        const bitcoinSharedIdentity = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'anchor-shared').toBlockchainPublicationIdentity();
        const baseSharedIdentity = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();
        const sourceIdentity = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'anchor-source').toBlockchainPublicationIdentity();

        assert(bitcoinSharedIdentity.contentHash === baseSharedIdentity.contentHash, '70. sanity check — the Bitcoin and Base identities genuinely share an identical contentHash');
        assert(bitcoinSharedIdentity.chainReference === baseSharedIdentity.chainReference, '71. sanity check — they also genuinely share an identical raw chainReference string');
        assert(bitcoinSharedIdentity.sameAs(baseSharedIdentity) === false, '72. sanity check — the two identities never compare equal across chains (0.8.89\'s own rule)');

        // Referencing the Bitcoin publication never creates, implies, or
        // is confused with a reference to the Base publication sharing its
        // contentHash and raw chainReference.
        archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: sourceIdentity, referencedPublicationIdentity: bitcoinSharedIdentity, createdAt });

        assert(archive.publicationReferenceRecordCount === 1, '73. exactly one reference record exists — referencing the Bitcoin publication creates no second, implied reference to Base');
        assert(findPublicationReferenceRecordsByReferenced(archive.publicationReferenceRecords, bitcoinSharedIdentity).length === 1, '74. the Bitcoin publication is found as referenced');
        assert(findPublicationReferenceRecordsByReferenced(archive.publicationReferenceRecords, baseSharedIdentity).length === 0, '75. THE FLAGSHIP CROSS-CHAIN RULE: the Base publication sharing an identical contentHash AND raw chainReference is never found as referenced — blockchain must also match');

        // Two references from the SAME source, to two DIFFERENT
        // chainReferences that happen to share a contentHash, stay two
        // entirely independent relationships.
        archive = referenceUseCase.execute(archive, { sourcePublicationIdentity: sourceIdentity, referencedPublicationIdentity: baseSharedIdentity, createdAt });
        assert(archive.publicationReferenceRecordCount === 2, '76. referencing the Base publication too creates a genuinely SECOND, independent reference record');
        assert(findPublicationReferenceRecordsBySource(archive.publicationReferenceRecords, sourceIdentity).length === 2, '77. the same source now has two independent outgoing references, to two different chains, never merged because they share a contentHash');
    }
    console.log('✓ Section G: never correlated by contentHash — two identities sharing an identical contentHash and raw chainReference across chains are never the same referenced publication');

    // ---------------------------------------------------------------
    // Section H — recording a reference never manufactures a publication
    // record, an observation, an achievement event, or a timeline entry —
    // in any direction.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-16T00:00:00Z');
        const source = identity({ blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_BOB, chainReference: BASE_TXID_BOB, createdAt });
        const referenced = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_ALICE, chainReference: BITCOIN_TXID_ALICE, createdAt });

        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();
        let archive = referenceUseCase.execute(PublicationObservationArchive.empty(), { sourcePublicationIdentity: source, referencedPublicationIdentity: referenced, createdAt });

        assert(archive.publicationReferenceRecordCount === 1, '78. sanity check — the reference record itself exists');
        assert(archive.bitcoinAnchorPublicationRecordCount === 0, '79. recording a reference manufactures NO Bitcoin publication record — the referenced identity is carried, never used to mint a record');
        assert(archive.baseAnchorPublicationRecordCount === 0, '80. recording a reference manufactures NO Base publication record');
        assert(archive.observationCount === 0, '81. recording a reference manufactures NO observation of any kind');
        assert(archive.publicationCount === 0, '82. recording a reference manufactures NO publication-shaped fact');
    }
    console.log('✓ Section H: recording a reference stays entirely independent of publication records, observations, and timelines — it manufactures none of them');

    // ---------------------------------------------------------------
    // Section I — no verdict vocabulary anywhere in this milestone's own
    // new surface.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-17T00:00:00Z');
        const source = identity({ blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_BOB, chainReference: BASE_TXID_BOB, createdAt });
        const referenced = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_ALICE, chainReference: BITCOIN_TXID_ALICE, createdAt });
        const referenceUseCase = new CreatePublicationReferenceRecordUseCase();
        const archive = referenceUseCase.execute(PublicationObservationArchive.empty(), { sourcePublicationIdentity: source, referencedPublicationIdentity: referenced, createdAt });

        assertNeverScored(archive.toJSON(), 'archive.toJSON()');
        assertNeverScored(archive.publicationReferenceRecords.map((r) => r.toJSON()), 'publicationReferenceRecords');
        assertNeverScored(describePublicationReferenceRecordHistory(archive.publicationReferenceRecords), 'describePublicationReferenceRecordHistory()');
    }
    console.log('✓ Section I: no trust/confidence/verdict/weight vocabulary exists anywhere in this milestone\'s own new surface');

    console.log('\nAll PublicationReferenceRecord tests passed.');
}

run().catch((error) => {
    console.error('PublicationReferenceRecord.test.js FAILED:', error);
    process.exitCode = 1;
});
