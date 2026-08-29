import { PublisherIdentityRecord } from '../application/PublisherIdentityRecord.js';
import { PublisherPublicationAssociationRecord } from '../application/PublisherPublicationAssociationRecord.js';
import {
    appendPublisherPublicationAssociationRecordHistoryEntry,
    findPublisherPublicationAssociationRecordsByPublisher,
    findPublisherPublicationAssociationRecordsByPublication
} from '../application/PublisherPublicationAssociationRecordHistory.js';
import {
    describePublisherPublicationAssociationRecordHistoryEntry,
    describePublisherPublicationAssociationRecordHistory
} from '../application/PublisherPublicationAssociationRecordHistoryView.js';
import {
    describePublisherAssociatedPublications,
    reconstructPublisherAssociatedPublications,
    describeDistinctPublisherIdentifiers,
    reconstructDistinctPublisherIdentifiers
} from '../application/PublisherAssociationView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { PublicationObservationArchiveProvenanceOrigin } from '../application/PublicationObservationArchiveProvenance.js';
import { CreatePublisherPublicationAssociationRecordUseCase } from '../application/CreatePublisherPublicationAssociationRecordUseCase.js';
import { CreateBitcoinAnchorPublicationRecordUseCase } from '../application/CreateBitcoinAnchorPublicationRecordUseCase.js';
import { CreateBaseAnchorPublicationRecordUseCase } from '../application/CreateBaseAnchorPublicationRecordUseCase.js';
import { reconstructAchievementEvents } from '../application/AchievementEvent.js';
import { reconstructAchievementProfile } from '../application/AchievementProfileView.js';
import { BlockchainKind } from '../application/BlockchainKind.js';
import { BlockchainPublicationIdentity } from '../application/BlockchainPublicationIdentity.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';

// 0.8.108 — Explicit Publisher Identity Association.
//
// The missing bridge between "publication X earned achievement Y"
// (0.8.102-0.8.107) and any future "publisher P's own achievements, across
// every publication P explicitly claims": an explicit, durable
// `publisherIdentity -> publicationIdentity` relationship — never inferred
// from a shared `contentHash`, a shared wallet address, a shared name, or
// temporal proximity.
//
//   Section A: PublisherIdentityRecord — construction, validation,
//              immutability, exact case-sensitive sameAs(), toJSON()/fromJSON()
//   Section B: PublisherPublicationAssociationRecord — construction,
//              validation, immutability, rejects raw objects,
//              toJSON()/fromJSON()
//   Section C: PublisherPublicationAssociationRecordHistory — append-only,
//              never mutates, never deduplicates; explicit-identity lookup
//              by publisher and by publication
//   Section D: PublisherPublicationAssociationRecordHistoryView — plain
//              narration, oldest first, never scored
//   Section E: PublicationObservationArchive's own tenth collection —
//              append/persist/restore through real storage;
//              SCHEMA_VERSION 6 -> 7; a pre-0.8.108 payload degrades to
//              empty
//   Section F: CreatePublisherPublicationAssociationRecordUseCase — the
//              one construction boundary; throws for an invalid
//              association; never mutates the archive it was given
//   Section G: PublisherAssociationView — a publisher-scoped reduction,
//              and distinct-publisher-identifier listing
//   Section H: FLAGSHIP — Publisher P claims a Bitcoin publication (A) and
//              a Base publication (B); Publisher Q claims a different Base
//              publication (C); A and B share a contentHash, B and C share
//              a contentHash — P's profile names only A and B, Q's only C,
//              surviving a full persist/destroy/reload cycle
//   Section I: never correlated by contentHash, a shared wallet, or any
//              other resemblance — only an explicit association ever
//              creates a relationship
//   Section J: an association manufactures no achievement event, and
//              leaves every existing publication achievement profile
//              unchanged
//   Section K: no verdict vocabulary anywhere in this milestone's own new
//              surface

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

const FORBIDDEN_KEYS = [
    'status', 'confidence', 'health', 'trusted', 'valid', 'canonical', 'reliable',
    'risk', 'severity', 'cause', 'verdict', 'score', 'weight', 'strength', 'associationKind',
    'included', 'confirmed', 'safe', 'healthy', 'rank', 'points', 'level', 'tier',
    'owner', 'ownerProven', 'verified', 'official', 'authentic'
];
function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
        const lower = key.toLowerCase();
        assert(!FORBIDDEN_KEYS.includes(lower), `${path}.${key} must never exist — a publisher association establishes a relationship, it does not score or verify it`);
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

const CONTENT_HASH_SHARED_AB = 'a'.repeat(64);
const BITCOIN_TXID_A = '1'.repeat(64);
const BASE_TXID_B = '0x' + '2'.repeat(64);
const BASE_TXID_C = '0x' + '3'.repeat(64);
const NETWORK = 'mainnet';

async function run() {
    // ---------------------------------------------------------------
    // Section A — PublisherIdentityRecord: construction, validation,
    // immutability, exact case-sensitive sameAs(), toJSON()/fromJSON().
    // ---------------------------------------------------------------
    {
        const publisher = new PublisherIdentityRecord({ publisherId: 'Publisher A' });
        assert(publisher.publisherId === 'Publisher A', '1. publisherId is exposed unchanged');
        assert(Object.isFrozen(publisher), '2. a publisher identity record is frozen at construction');

        for (const bad of [undefined, null, '', '   ', 42, {}]) {
            let threw = false;
            try { new PublisherIdentityRecord({ publisherId: bad }); } catch (error) { threw = true; }
            assert(threw, `3. a non-string or empty publisherId (${JSON.stringify(bad)}) throws rather than constructing an empty identity`);
        }

        const same = new PublisherIdentityRecord({ publisherId: 'Publisher A' });
        assert(publisher.sameAs(same), '4. two instances sharing the exact same publisherId compare equal');
        assert(publisher !== same, '5. sanity check — they are still two distinct instances');

        const differentCase = new PublisherIdentityRecord({ publisherId: 'publisher a' });
        assert(publisher.sameAs(differentCase) === false, '6. sameAs() is case-sensitive — "Publisher A" and "publisher a" are different publishers, never normalized');

        const withWhitespace = new PublisherIdentityRecord({ publisherId: 'Publisher A ' });
        assert(publisher.sameAs(withWhitespace) === false, '7. sameAs() is exact — trailing whitespace makes it a different publisher, never trimmed for comparison');

        assert(publisher.sameAs({ publisherId: 'Publisher A' }) === false, '8. sameAs() rejects a bare object that merely looks like a PublisherIdentityRecord');
        assert(publisher.sameAs(null) === false, '9. sameAs(null) is false, never throws');

        const json = publisher.toJSON();
        assert(Object.keys(json).length === 1 && json.publisherId === 'Publisher A', '10. toJSON() serializes exactly one field, publisherId');
        const restored = PublisherIdentityRecord.fromJSON(json);
        assert(restored.sameAs(publisher), '11. fromJSON(toJSON()) round-trips to an equal identity');
        assert(PublisherIdentityRecord.fromJSON(null) === null, '12. fromJSON(null) returns null rather than throwing');

        assertNeverScored(json, 'publisher.toJSON()');
    }
    console.log('✓ Section A: PublisherIdentityRecord — a bare, explicit, case-sensitive label, never a cryptographic or normalized identity');

    // ---------------------------------------------------------------
    // Section B — PublisherPublicationAssociationRecord: construction,
    // validation, immutability, rejects raw objects, toJSON()/fromJSON().
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-25T00:00:00.000Z');
        const publisherIdentity = new PublisherIdentityRecord({ publisherId: 'Publisher A' });
        const publicationIdentity = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_SHARED_AB, chainReference: BITCOIN_TXID_A, createdAt });

        const record = new PublisherPublicationAssociationRecord({ publisherIdentity, publicationIdentity, createdAt });
        assert(record.publisherIdentity === publisherIdentity, '13. publisherIdentity is exposed as the exact instance given');
        assert(record.publicationIdentity === publicationIdentity, '14. publicationIdentity is exposed as the exact instance given');
        assert(record.createdAt.getTime() === createdAt.getTime(), '15. createdAt is exposed unchanged');
        assert(Object.isFrozen(record), '16. a record is frozen at construction');

        for (const missing of ['publisherIdentity', 'publicationIdentity']) {
            const fields = { publisherIdentity, publicationIdentity, createdAt };
            delete fields[missing];
            let threw = false;
            try { new PublisherPublicationAssociationRecord(fields); } catch (error) { threw = true; }
            assert(threw, `17. a missing ${missing} throws rather than constructing a partial association`);
        }

        let threwForRawPublisher = false;
        try {
            new PublisherPublicationAssociationRecord({
                publisherIdentity: { publisherId: 'Publisher A' },
                publicationIdentity,
                createdAt
            });
        } catch (error) { threwForRawPublisher = true; }
        assert(threwForRawPublisher, '18. a bare object assembled by hand is rejected — publisherIdentity must be a genuine PublisherIdentityRecord instance');

        let threwForRawPublication = false;
        try {
            new PublisherPublicationAssociationRecord({
                publisherIdentity,
                publicationIdentity: { blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_SHARED_AB, chainReference: BITCOIN_TXID_A, createdAt },
                createdAt
            });
        } catch (error) { threwForRawPublication = true; }
        assert(threwForRawPublication, '19. a bare object assembled by hand is rejected — publicationIdentity must be a genuine BlockchainPublicationIdentity instance');

        let threwForBadDate = false;
        try { new PublisherPublicationAssociationRecord({ publisherIdentity, publicationIdentity, createdAt: 'not-a-date' }); } catch (error) { threwForBadDate = true; }
        assert(threwForBadDate, '20. an invalid createdAt throws');

        const json = record.toJSON();
        assert(json.createdAt === createdAt.toISOString(), '21. toJSON() serializes createdAt as an ISO string');
        assert(json.publisherIdentity.publisherId === 'Publisher A', '22. toJSON() serializes publisherIdentity through its own toJSON()');
        assert(json.publicationIdentity.chainReference === BITCOIN_TXID_A, '23. toJSON() serializes publicationIdentity through its own toJSON()');

        const restored = PublisherPublicationAssociationRecord.fromJSON(json);
        assert(restored.publisherIdentity.sameAs(publisherIdentity), '24. fromJSON(toJSON()) round-trips publisherIdentity to an equal identity');
        assert(restored.publicationIdentity.sameAs(publicationIdentity), '25. fromJSON(toJSON()) round-trips publicationIdentity to an equal identity');
        assert(restored.createdAt.getTime() === record.createdAt.getTime(), '26. fromJSON(toJSON()) round-trips createdAt unchanged');
        assert(PublisherPublicationAssociationRecord.fromJSON(null) === null, '27. fromJSON(null) returns null rather than throwing');

        assertNeverScored(json, 'record.toJSON()');
    }
    console.log('✓ Section B: PublisherPublicationAssociationRecord — construction, validation, immutability, and JSON round trip');

    // ---------------------------------------------------------------
    // Section C — PublisherPublicationAssociationRecordHistory:
    // append-only, never mutates, never deduplicates; explicit-identity
    // lookup.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-25T00:00:00Z');
        const publisherP = new PublisherIdentityRecord({ publisherId: 'Publisher P' });
        const publisherQ = new PublisherIdentityRecord({ publisherId: 'Publisher Q' });
        const publicationA = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_SHARED_AB, chainReference: BITCOIN_TXID_A, createdAt });
        const publicationB = identity({ blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_SHARED_AB, chainReference: BASE_TXID_B, createdAt });

        const recordA = new PublisherPublicationAssociationRecord({ publisherIdentity: publisherP, publicationIdentity: publicationA, createdAt });
        const recordB = new PublisherPublicationAssociationRecord({ publisherIdentity: publisherP, publicationIdentity: publicationB, createdAt: new Date('2026-08-26T00:00:00Z') });

        const empty = [];
        const afterA = appendPublisherPublicationAssociationRecordHistoryEntry(empty, recordA);
        assert(empty.length === 0, '28. appending never mutates the array the caller passed in');
        assert(afterA.length === 1 && afterA[0] === recordA, '29. appending to an empty history returns a new one-entry history');
        assert(Object.isFrozen(afterA), '30. the returned history is frozen');

        const afterB = appendPublisherPublicationAssociationRecordHistoryEntry(afterA, recordB);
        assert(afterA.length === 1, '31. appending a second entry never mutates the previous history');
        assert(afterB.length === 2 && afterB[0] === recordA && afterB[1] === recordB, '32. both records are held, in append order');

        assert(appendPublisherPublicationAssociationRecordHistoryEntry(afterB, null).length === 2, '33. appending a null/falsy record is a no-op');
        assert(appendPublisherPublicationAssociationRecordHistoryEntry(undefined, recordA).length === 1, '34. a non-array history starts fresh rather than throwing');

        const byPublisherP = findPublisherPublicationAssociationRecordsByPublisher(afterB, publisherP);
        assert(byPublisherP.length === 2, '35. lookup by publisher finds every association that publisher made — never just one');
        assert(byPublisherP.includes(recordA) && byPublisherP.includes(recordB), '36. both of Publisher P\'s associations are found');

        const byPublisherQ = findPublisherPublicationAssociationRecordsByPublisher(afterB, publisherQ);
        assert(byPublisherQ.length === 0, '37. lookup for a publisher with no recorded associations returns empty, never a guess');

        const byPublicationA = findPublisherPublicationAssociationRecordsByPublication(afterB, publicationA);
        assert(byPublicationA.length === 1 && byPublicationA[0] === recordA, '38. lookup by publication finds the association naming it');

        assert(findPublisherPublicationAssociationRecordsByPublisher(afterB, null).length === 0, '39. lookup with a non-identity publisher returns empty rather than throwing');
        assert(findPublisherPublicationAssociationRecordsByPublication(afterB, null).length === 0, '40. lookup with a non-identity publication returns empty rather than throwing');

        // Re-associating the identical publisher/publication pair a second
        // time is never deduplicated.
        const duplicateRecord = new PublisherPublicationAssociationRecord({ publisherIdentity: publisherP, publicationIdentity: publicationA, createdAt: new Date('2026-08-27T00:00:00Z') });
        const afterDuplicate = appendPublisherPublicationAssociationRecordHistoryEntry(afterB, duplicateRecord);
        assert(afterDuplicate.length === 3, '41. re-associating the identical publisher/publication pair adds a THIRD, independent entry — never collapsed into one');
        assert(findPublisherPublicationAssociationRecordsByPublication(afterDuplicate, publicationA).length === 2, '42. both associations naming publication A are found, undeduplicated');
    }
    console.log('✓ Section C: PublisherPublicationAssociationRecordHistory — append-only, never mutates, never deduplicates, looked up by explicit identity alone');

    // ---------------------------------------------------------------
    // Section D — PublisherPublicationAssociationRecordHistoryView: plain
    // narration, oldest first, never scored.
    // ---------------------------------------------------------------
    {
        assert(describePublisherPublicationAssociationRecordHistoryEntry(null) === null, '43. describing a null record returns null');
        const createdAt = new Date('2026-08-25T00:00:00Z');
        const publisherIdentity = new PublisherIdentityRecord({ publisherId: 'Publisher A' });
        const publicationIdentity = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_SHARED_AB, chainReference: BITCOIN_TXID_A, createdAt });
        const record = new PublisherPublicationAssociationRecord({ publisherIdentity, publicationIdentity, createdAt });

        const described = describePublisherPublicationAssociationRecordHistoryEntry(record);
        assert(described.publisherIdentity === publisherIdentity, '44. publisherIdentity is carried through as the exact same instance');
        assert(described.publicationIdentity === publicationIdentity, '45. publicationIdentity is carried through as the exact same instance');
        assertNeverScored(described, 'described');

        const later = new PublisherPublicationAssociationRecord({ publisherIdentity, publicationIdentity, createdAt: new Date('2026-08-26T00:00:00Z') });
        const history = describePublisherPublicationAssociationRecordHistory([record, later]);
        assert(history.count === 2, '46. history narration counts every record');
        assert(history.records[0].createdAt.getTime() < history.records[1].createdAt.getTime(), '47. history narration preserves order, oldest first — never sorted or grouped');
        assertNeverScored(history, 'history');

        const emptyHistory = describePublisherPublicationAssociationRecordHistory(null);
        assert(emptyHistory.count === 0 && emptyHistory.records.length === 0, '48. a null/non-array history narrates as empty rather than throwing');
    }
    console.log('✓ Section D: PublisherPublicationAssociationRecordHistoryView — plain, oldest-first narration, never scored');

    // ---------------------------------------------------------------
    // Section E — PublicationObservationArchive's tenth collection:
    // append/persist/restore through real storage; SCHEMA_VERSION 6 -> 7; a
    // pre-0.8.108 payload degrades to empty.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-25T00:00:00Z');
        const publisherIdentity = new PublisherIdentityRecord({ publisherId: 'Publisher A' });
        const publicationIdentity = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_SHARED_AB, chainReference: BITCOIN_TXID_A, createdAt });
        const record = new PublisherPublicationAssociationRecord({ publisherIdentity, publicationIdentity, createdAt });

        assert(PublicationObservationArchive.SCHEMA_VERSION === 7, '49. SCHEMA_VERSION is now 7 (bumped from 6 by 0.8.108)');

        let archive = PublicationObservationArchive.empty();
        assert(archive.publisherPublicationAssociationRecords.length === 0, '50. a fresh archive holds no publisher association records');
        assert(archive.publisherPublicationAssociationRecordCount === 0, '51. publisherPublicationAssociationRecordCount starts at zero');

        const archiveWithRecord = archive.appendPublisherPublicationAssociationRecord(record);
        assert(archive.publisherPublicationAssociationRecords.length === 0, '52. appendPublisherPublicationAssociationRecord() never mutates the receiver');
        assert(archiveWithRecord.publisherPublicationAssociationRecords.length === 1, '53. the returned archive holds the new record');
        assert(archiveWithRecord.publisherPublicationAssociationRecordCount === 1, '54. publisherPublicationAssociationRecordCount reflects the new record');
        assert(archiveWithRecord.appendPublisherPublicationAssociationRecord(null) === archiveWithRecord, '55. appending a null record is a no-op that returns the same archive');

        // publicationCount/observationCount/bitcoinAnchorPublicationRecordCount/
        // baseAnchorPublicationRecordCount/publicationReferenceRecordCount
        // stay unchanged — an association is a relationship, never folded
        // into any of those five, already established counts.
        assert(archiveWithRecord.publicationCount === 0, '56. publicationCount is deliberately unaffected by a publisherPublicationAssociationRecord');
        assert(archiveWithRecord.observationCount === 0, '57. observationCount is deliberately unaffected by a publisherPublicationAssociationRecord');
        assert(archiveWithRecord.bitcoinAnchorPublicationRecordCount === 0, '58. bitcoinAnchorPublicationRecordCount is deliberately unaffected by a publisherPublicationAssociationRecord');
        assert(archiveWithRecord.baseAnchorPublicationRecordCount === 0, '59. baseAnchorPublicationRecordCount is deliberately unaffected by a publisherPublicationAssociationRecord');
        assert(archiveWithRecord.publicationReferenceRecordCount === 0, '60. publicationReferenceRecordCount is deliberately unaffected by a publisherPublicationAssociationRecord');

        // Real, JSON-round-tripping storage.
        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archiveWithRecord);
        const restored = persistence.load();
        assert(restored.publisherPublicationAssociationRecords.length === 1, '61. the persisted record survives a real save/load round trip');
        const restoredRecord = restored.publisherPublicationAssociationRecords[0];
        assert(restoredRecord instanceof PublisherPublicationAssociationRecord, '62. the restored entry is a genuine PublisherPublicationAssociationRecord instance');
        assert(restoredRecord.publisherIdentity.sameAs(publisherIdentity), '63. the restored publisher identity is equal to the original');
        assert(restoredRecord.publicationIdentity.sameAs(publicationIdentity), '64. the restored publication identity is equal to the original');
        assert(restoredRecord.createdAt.getTime() === record.createdAt.getTime(), '65. createdAt survives the round trip unchanged');

        // A payload persisted by 0.8.75–0.8.107 (schemaVersion 6, no
        // publisherPublicationAssociationRecords field at all) degrades to
        // an empty archive — the identical, already-established "wrong
        // schemaVersion" behavior, never a silent migration.
        const preMilestoneJson = { ...archiveWithRecord.toJSON(), schemaVersion: 6 };
        delete preMilestoneJson.publisherPublicationAssociationRecords;
        delete preMilestoneJson.publisherPublicationAssociationRecordProvenance;
        assert(PublicationObservationArchive.fromJSON(preMilestoneJson).publisherPublicationAssociationRecordCount === 0, '66. a schemaVersion-6 payload degrades to an empty archive, never a partial migration');
        assert(PublicationObservationArchive.isValidJSON(preMilestoneJson) === false, '67. isValidJSON() agrees — a schemaVersion-6 payload is not a valid current-schema archive');

        // A malformed association record (missing a required field, an
        // unexpected extra field, or a nested identity assembled by hand
        // with an empty publisherId) degrades the WHOLE archive to empty —
        // never a partially reconstructed one.
        const missingFieldJson = archiveWithRecord.toJSON();
        delete missingFieldJson.publisherPublicationAssociationRecords[0].createdAt;
        assert(PublicationObservationArchive.fromJSON(missingFieldJson).publisherPublicationAssociationRecordCount === 0, '68. an association record missing a required field degrades the whole archive to empty');

        const extraFieldJson = archiveWithRecord.toJSON();
        extraFieldJson.publisherPublicationAssociationRecords[0].weight = 1;
        assert(PublicationObservationArchive.fromJSON(extraFieldJson).publisherPublicationAssociationRecordCount === 0, '69. an association record with an unexpected extra field (e.g. a smuggled weight) degrades the whole archive to empty');

        const emptyPublisherIdJson = archiveWithRecord.toJSON();
        emptyPublisherIdJson.publisherPublicationAssociationRecords[0].publisherIdentity.publisherId = '';
        assert(PublicationObservationArchive.fromJSON(emptyPublisherIdJson).publisherPublicationAssociationRecordCount === 0, '70. an association record whose nested publisher identity carries an empty publisherId degrades the whole archive to empty');

        // Provenance: LOCAL by default, restamped uniformly by
        // withUniformProvenance(), exactly like every other collection.
        assert(archiveWithRecord.publisherPublicationAssociationRecordProvenance[0] === PublicationObservationArchiveProvenanceOrigin.LOCAL, '71. a locally appended association defaults to LOCAL provenance');
        const importedArchive = archiveWithRecord.withUniformProvenance(PublicationObservationArchiveProvenanceOrigin.IMPORTED);
        assert(importedArchive.publisherPublicationAssociationRecordProvenance[0] === PublicationObservationArchiveProvenanceOrigin.IMPORTED, '72. withUniformProvenance() restamps this tenth collection uniformly, exactly like every other one');
        assert(importedArchive.publisherPublicationAssociationRecords[0] === archiveWithRecord.publisherPublicationAssociationRecords[0], '73. withUniformProvenance() never touches the underlying fact, only its provenance tag');
    }
    console.log('✓ Section E: PublicationObservationArchive\'s tenth collection — append/persist/restore, SCHEMA_VERSION 6 -> 7, pre-0.8.108 payloads degrade honestly, and provenance restamps uniformly');

    // ---------------------------------------------------------------
    // Section F — CreatePublisherPublicationAssociationRecordUseCase: the
    // one construction boundary.
    // ---------------------------------------------------------------
    {
        const useCase = new CreatePublisherPublicationAssociationRecordUseCase();
        const createdAt = new Date('2026-08-28T12:00:00Z');
        const publicationIdentity = identity({ blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_SHARED_AB, chainReference: BASE_TXID_B, createdAt });

        const original = PublicationObservationArchive.empty();
        const result = useCase.execute(original, { publisherId: 'Publisher A', publicationIdentity, createdAt });

        assert(original.publisherPublicationAssociationRecords.length === 0, '74. execute() never mutates the archive it was given');
        assert(result.publisherPublicationAssociationRecords.length === 1, '75. execute() returns a new archive holding the newly constructed record');
        assert(result.publisherPublicationAssociationRecords[0].publisherIdentity.publisherId === 'Publisher A', '76. the constructed record carries exactly the publisherId passed in');
        assert(result.publisherPublicationAssociationRecords[0].publicationIdentity === publicationIdentity, '77. the constructed record carries exactly the publicationIdentity instance passed in');

        let threwForEmptyPublisherId = false;
        try { useCase.execute(original, { publisherId: '', publicationIdentity, createdAt }); } catch (error) { threwForEmptyPublisherId = true; }
        assert(threwForEmptyPublisherId, '78. execute() throws for an empty publisherId rather than silently degrading it');

        let threwForMissingPublication = false;
        try { useCase.execute(original, { publisherId: 'Publisher A', createdAt }); } catch (error) { threwForMissingPublication = true; }
        assert(threwForMissingPublication, '79. execute() throws when publicationIdentity is missing');

        const fromNonArchive = useCase.execute(null, { publisherId: 'Publisher A', publicationIdentity, createdAt });
        assert(fromNonArchive.publisherPublicationAssociationRecords.length === 1, '80. a non-archive input degrades to PublicationObservationArchive.empty() before appending, never throws');
    }
    console.log('✓ Section F: CreatePublisherPublicationAssociationRecordUseCase — the one construction boundary, never mutating, throwing only for an invalid association');

    // ---------------------------------------------------------------
    // Section G — PublisherAssociationView: a publisher-scoped reduction,
    // and distinct-publisher-identifier listing.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-25T00:00:00Z');
        const publisherP = new PublisherIdentityRecord({ publisherId: 'Publisher P' });
        const publisherQ = new PublisherIdentityRecord({ publisherId: 'Publisher Q' });
        const publicationA = identity({ blockchain: BlockchainKind.BITCOIN, contentHash: CONTENT_HASH_SHARED_AB, chainReference: BITCOIN_TXID_A, createdAt });
        const publicationB = identity({ blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_SHARED_AB, chainReference: BASE_TXID_B, createdAt });
        const publicationC = identity({ blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_SHARED_AB, chainReference: BASE_TXID_C, createdAt });

        const recordPA = new PublisherPublicationAssociationRecord({ publisherIdentity: publisherP, publicationIdentity: publicationA, createdAt });
        const recordPB = new PublisherPublicationAssociationRecord({ publisherIdentity: publisherP, publicationIdentity: publicationB, createdAt: new Date('2026-08-26T00:00:00Z') });
        const recordQC = new PublisherPublicationAssociationRecord({ publisherIdentity: publisherQ, publicationIdentity: publicationC, createdAt: new Date('2026-08-27T00:00:00Z') });

        const records = [recordPA, recordPB, recordQC];

        const profileP = describePublisherAssociatedPublications(publisherP, records);
        assert(profileP.publisherIdentity === publisherP, '81. the profile echoes back the exact publisherIdentity instance supplied');
        assert(profileP.associationCount === 2, '82. Publisher P\'s profile names exactly two associations');
        assert(profileP.associations.every((a) => a.publisherIdentity.sameAs(publisherP)), '83. every association in the profile actually names this publisher');
        assertNeverScored(profileP, 'profileP');

        const profileQ = describePublisherAssociatedPublications(publisherQ, records);
        assert(profileQ.associationCount === 1, '84. Publisher Q\'s profile names exactly one association');
        assert(profileQ.associations[0].publicationIdentity.sameAs(publicationC), '85. Publisher Q\'s one association names publication C');

        const publisherUntouched = new PublisherIdentityRecord({ publisherId: 'Publisher Z' });
        const emptyProfile = describePublisherAssociatedPublications(publisherUntouched, records);
        assert(emptyProfile.associationCount === 0 && emptyProfile.associations.length === 0, '86. a publisher this archive has never seen produces a valid, empty profile — never an error');

        assert(describePublisherAssociatedPublications(null, records).associationCount === 0, '87. a malformed publisherIdentity matches nothing, never throws');
        assert(describePublisherAssociatedPublications(publisherP, null).associationCount === 0, '88. malformed/absent records tolerate gracefully, never throw');

        const distinct = describeDistinctPublisherIdentifiers(records);
        assert(distinct.length === 2 && distinct[0] === 'Publisher P' && distinct[1] === 'Publisher Q', '89. distinct publisher identifiers are listed once each, in first-appearance order');

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendPublisherPublicationAssociationRecord(recordPA);
        archive = archive.appendPublisherPublicationAssociationRecord(recordPB);
        archive = archive.appendPublisherPublicationAssociationRecord(recordQC);
        const reconstructed = reconstructPublisherAssociatedPublications(archive, publisherP);
        assert(reconstructed.associationCount === 2, '90. reconstructPublisherAssociatedPublications() reads straight off the archive\'s own durable records');
        assert(reconstructDistinctPublisherIdentifiers(archive).length === 2, '91. reconstructDistinctPublisherIdentifiers() reads straight off the archive\'s own durable records');
        assert(reconstructPublisherAssociatedPublications(null, publisherP).associationCount === 0, '92. a non-archive input degrades to an empty profile, never throws');
        assert(reconstructDistinctPublisherIdentifiers(null).length === 0, '93. a non-archive input degrades to an empty identifier list, never throws');
    }
    console.log('✓ Section G: PublisherAssociationView — a publisher-scoped reduction and distinct-identifier listing, both empty-safe and never scored');

    // ---------------------------------------------------------------
    // Section H — FLAGSHIP: Publisher P claims a Bitcoin publication (A)
    // and a Base publication (B); Publisher Q claims a different Base
    // publication (C); A and B share a contentHash, B and C share a
    // contentHash — P's profile names only A and B, Q's only C, surviving
    // a full persist/destroy/reload cycle.
    // ---------------------------------------------------------------
    {
        const bitcoinUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        const SHARED_CONTENT_HASH = 'f'.repeat(64); // A, B, and C all publish this identical content

        let archive = PublicationObservationArchive.empty();
        archive = bitcoinUseCase.execute(archive, { anchorId: 'anchor-A', contentHash: SHARED_CONTENT_HASH, txid: BITCOIN_TXID_A, network: NETWORK, createdAt: new Date('2026-08-10T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: SHARED_CONTENT_HASH, txid: BASE_TXID_B, network: NETWORK, createdAt: new Date('2026-08-11T00:00:00Z') });
        archive = baseUseCase.execute(archive, { contentHash: SHARED_CONTENT_HASH, txid: BASE_TXID_C, network: NETWORK, createdAt: new Date('2026-08-12T00:00:00Z') });

        const identityA = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'anchor-A').toBlockchainPublicationIdentity();
        const identityB = archive.baseAnchorPublicationRecords.find((r) => r.txid === BASE_TXID_B).toBlockchainPublicationIdentity();
        const identityC = archive.baseAnchorPublicationRecords.find((r) => r.txid === BASE_TXID_C).toBlockchainPublicationIdentity();

        assert(identityA.contentHash === identityB.contentHash && identityB.contentHash === identityC.contentHash, '94. sanity check — A, B, and C genuinely share an identical contentHash');

        // Publisher P explicitly claims A (Bitcoin) and B (Base).
        archive = associationUseCase.execute(archive, { publisherId: 'Publisher P', publicationIdentity: identityA, createdAt: new Date('2026-08-13T00:00:00Z') });
        archive = associationUseCase.execute(archive, { publisherId: 'Publisher P', publicationIdentity: identityB, createdAt: new Date('2026-08-13T01:00:00Z') });
        // Publisher Q explicitly claims a DIFFERENT publication, C — despite
        // C sharing an identical contentHash with both of Publisher P's own
        // publications.
        archive = associationUseCase.execute(archive, { publisherId: 'Publisher Q', publicationIdentity: identityC, createdAt: new Date('2026-08-13T02:00:00Z') });

        assert(archive.publisherPublicationAssociationRecordCount === 3, '95. exactly three association records exist');

        const publisherP = new PublisherIdentityRecord({ publisherId: 'Publisher P' });
        const publisherQ = new PublisherIdentityRecord({ publisherId: 'Publisher Q' });

        const profileP = reconstructPublisherAssociatedPublications(archive, publisherP);
        assert(profileP.associationCount === 2, '96. Publisher P\'s profile names exactly two publications');
        assert(profileP.associations.some((a) => a.publicationIdentity.sameAs(identityA)), '97. Publisher P\'s profile contains publication A (Bitcoin)');
        assert(profileP.associations.some((a) => a.publicationIdentity.sameAs(identityB)), '98. Publisher P\'s profile contains publication B (Base)');
        assert(!profileP.associations.some((a) => a.publicationIdentity.sameAs(identityC)), '99. THE FLAGSHIP RULE: Publisher P\'s profile does NOT contain publication C, despite C sharing an identical contentHash with both of P\'s own publications');

        const profileQ = reconstructPublisherAssociatedPublications(archive, publisherQ);
        assert(profileQ.associationCount === 1, '100. Publisher Q\'s profile names exactly one publication');
        assert(profileQ.associations[0].publicationIdentity.sameAs(identityC), '101. Publisher Q\'s profile contains publication C');
        assert(!profileQ.associations.some((a) => a.publicationIdentity.sameAs(identityA) || a.publicationIdentity.sameAs(identityB)), '102. Publisher Q\'s profile does NOT contain A or B — a shared contentHash never merges two publishers');

        // A genuinely cross-chain association (Publisher P claiming both a
        // Bitcoin and a Base publication) works exactly as any other.
        assert(profileP.associations.some((a) => a.publicationIdentity.blockchain === BlockchainKind.BITCOIN)
            && profileP.associations.some((a) => a.publicationIdentity.blockchain === BlockchainKind.BASE),
            '103. Publisher P\'s own associations genuinely span two different blockchains');

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
        assert(!networkCallOccurred, '104. no network access occurs while reloading a publication archive');
        assert(restored instanceof PublicationObservationArchive, '105. load() returns a genuine PublicationObservationArchive');
        assert(restored.publisherPublicationAssociationRecordCount === 3, '106. all three association records survive a real save/load round trip');
        assert(JSON.stringify(restored.toJSON()) === JSON.stringify(preReloadJSON), '107. the restored archive is byte-identical to the one that was saved');

        const restoredProfileP = reconstructPublisherAssociatedPublications(restored, publisherP);
        assert(restoredProfileP.associationCount === 2, '108. Publisher P\'s profile still resolves correctly after reload');
        const restoredProfileQ = reconstructPublisherAssociatedPublications(restored, publisherQ);
        assert(restoredProfileQ.associationCount === 1, '109. Publisher Q\'s profile still resolves correctly after reload');

        // Repeated reconstruction is byte-identical.
        const secondReconstruction = reconstructPublisherAssociatedPublications(restored, publisherP);
        assert(JSON.stringify(secondReconstruction.associations.map((a) => a.toJSON ? a.toJSON() : a)) ===
            JSON.stringify(restoredProfileP.associations.map((a) => a.toJSON ? a.toJSON() : a)),
            '110. calling reconstructPublisherAssociatedPublications() twice on byte-identical input returns a byte-identical result');

        // Imported associations retain their provenance semantics —
        // exactly like every other collection this archive already holds.
        const importedRestored = restored.withUniformProvenance(PublicationObservationArchiveProvenanceOrigin.IMPORTED);
        assert(importedRestored.publisherPublicationAssociationRecordProvenance.every((tag) => tag === PublicationObservationArchiveProvenanceOrigin.IMPORTED), '111. every association record is restamped IMPORTED uniformly');
        const importedProfileP = reconstructPublisherAssociatedPublications(importedRestored, publisherP);
        assert(importedProfileP.associationCount === 2, '112. provenance restamping never changes which associations a publisher\'s profile names');

        assertNeverScored(restored.toJSON(), 'restored');
    }
    console.log('✓ Section H: FLAGSHIP — two publishers, three publications sharing one contentHash across two chains, correctly and exclusively attributed, surviving persistence and provenance restamping');

    // ---------------------------------------------------------------
    // Section I — never correlated by contentHash, a shared wallet, or any
    // other resemblance — only an explicit association ever creates a
    // relationship.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-15T00:00:00Z');
        const bitcoinUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const baseUseCase = new CreateBaseAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        const SHARED_CONTENT_HASH = 'e'.repeat(64);
        const SHARED_RAW_REFERENCE = 'f'.repeat(64);

        let archive = PublicationObservationArchive.empty();
        archive = bitcoinUseCase.execute(archive, { anchorId: 'anchor-shared', contentHash: SHARED_CONTENT_HASH, txid: SHARED_RAW_REFERENCE, network: NETWORK, createdAt });
        archive = baseUseCase.execute(archive, { contentHash: SHARED_CONTENT_HASH, txid: SHARED_RAW_REFERENCE, network: NETWORK, createdAt });

        const bitcoinSharedIdentity = archive.bitcoinAnchorPublicationRecords.find((r) => r.anchorId === 'anchor-shared').toBlockchainPublicationIdentity();
        const baseSharedIdentity = archive.baseAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

        assert(bitcoinSharedIdentity.contentHash === baseSharedIdentity.contentHash, '113. sanity check — Bitcoin and Base identities genuinely share an identical contentHash');
        assert(bitcoinSharedIdentity.chainReference === baseSharedIdentity.chainReference, '114. sanity check — they also genuinely share an identical raw chainReference string');
        assert(bitcoinSharedIdentity.sameAs(baseSharedIdentity) === false, '115. sanity check — the two identities never compare equal across chains (0.8.89\'s own rule)');

        // Associating Publisher A with the Bitcoin publication never
        // creates, implies, or is confused with an association to the Base
        // publication sharing its contentHash and raw chainReference.
        archive = associationUseCase.execute(archive, { publisherId: 'Publisher A', publicationIdentity: bitcoinSharedIdentity, createdAt });

        assert(archive.publisherPublicationAssociationRecordCount === 1, '116. exactly one association record exists — associating the Bitcoin publication creates no second, implied association to Base');
        const publisherA = new PublisherIdentityRecord({ publisherId: 'Publisher A' });
        const profileA = reconstructPublisherAssociatedPublications(archive, publisherA);
        assert(profileA.associationCount === 1 && profileA.associations[0].publicationIdentity.sameAs(bitcoinSharedIdentity), '117. Publisher A\'s profile names only the Bitcoin publication');
        assert(!profileA.associations.some((a) => a.publicationIdentity.sameAs(baseSharedIdentity)), '118. THE FLAGSHIP CROSS-CHAIN RULE: the Base publication sharing an identical contentHash AND raw chainReference is never found in Publisher A\'s profile — blockchain must also match');

        // Merely appearing in the same archive is never evidence of a
        // shared publisher — no association exists between any publisher
        // and the Base publication until one is explicitly recorded.
        assert(findPublisherPublicationAssociationRecordsByPublication(archive.publisherPublicationAssociationRecords, baseSharedIdentity).length === 0, '119. no publisher is associated with the Base publication until an explicit association names it');
    }
    console.log('✓ Section I: never correlated by contentHash, a shared wallet, or any other resemblance — only an explicit association ever creates a relationship');

    // ---------------------------------------------------------------
    // Section J — an association manufactures no achievement event, and
    // leaves every existing publication achievement profile unchanged.
    // ---------------------------------------------------------------
    {
        const bitcoinUseCase = new CreateBitcoinAnchorPublicationRecordUseCase();
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();

        let archive = PublicationObservationArchive.empty();
        archive = bitcoinUseCase.execute(archive, { anchorId: 'anchor-J', contentHash: 'd'.repeat(64), txid: '9'.repeat(64), network: NETWORK, createdAt: new Date('2026-08-16T00:00:00Z') });
        const publicationIdentity = archive.bitcoinAnchorPublicationRecords[0].toBlockchainPublicationIdentity();

        const beforeEvents = reconstructAchievementEvents(archive).events;
        const beforeProfile = reconstructAchievementProfile(archive, publicationIdentity);

        archive = associationUseCase.execute(archive, { publisherId: 'Publisher A', publicationIdentity, createdAt: new Date('2026-08-16T01:00:00Z') });

        const afterEvents = reconstructAchievementEvents(archive).events;
        const afterProfile = reconstructAchievementProfile(archive, publicationIdentity);

        assert(afterEvents.length === beforeEvents.length, '120. recording a publisher association creates NO new achievement event');
        assert(afterProfile.achievementCount === beforeProfile.achievementCount, '121. the publication\'s own achievement profile is byte-unchanged by a publisher association');
        assert(JSON.stringify(afterProfile.achievements.map((a) => a.toJSON ? a.toJSON() : a)) === JSON.stringify(beforeProfile.achievements.map((a) => a.toJSON ? a.toJSON() : a)), '122. every achievement this publication already earned survives an association unchanged');

        assert(archive.observationCount === 0, '123. recording an association manufactures NO observation of any kind');
        assert(archive.publicationReferenceRecordCount === 0, '124. recording an association manufactures NO publication reference record');
    }
    console.log('✓ Section J: recording a publisher association manufactures no achievement event and leaves every existing achievement profile unchanged');

    // ---------------------------------------------------------------
    // Section K — no verdict vocabulary anywhere in this milestone's own
    // new surface.
    // ---------------------------------------------------------------
    {
        const createdAt = new Date('2026-08-17T00:00:00Z');
        const publisherIdentity = new PublisherIdentityRecord({ publisherId: 'Publisher A' });
        const publicationIdentity = identity({ blockchain: BlockchainKind.BASE, contentHash: CONTENT_HASH_SHARED_AB, chainReference: BASE_TXID_B, createdAt });
        const associationUseCase = new CreatePublisherPublicationAssociationRecordUseCase();
        const archive = associationUseCase.execute(PublicationObservationArchive.empty(), { publisherId: 'Publisher A', publicationIdentity, createdAt });

        assertNeverScored(archive.toJSON(), 'archive.toJSON()');
        assertNeverScored(archive.publisherPublicationAssociationRecords.map((r) => r.toJSON()), 'publisherPublicationAssociationRecords');
        assertNeverScored(describePublisherPublicationAssociationRecordHistory(archive.publisherPublicationAssociationRecords), 'describePublisherPublicationAssociationRecordHistory()');
        assertNeverScored(reconstructPublisherAssociatedPublications(archive, publisherIdentity), 'reconstructPublisherAssociatedPublications()');
    }
    console.log('✓ Section K: no trust/confidence/verdict/weight/owner/verified vocabulary exists anywhere in this milestone\'s own new surface');

    console.log('\nAll PublisherPublicationAssociationRecord tests passed.');
}

run().catch((error) => {
    console.error('PublisherPublicationAssociationRecord.test.js FAILED:', error);
    process.exitCode = 1;
});
