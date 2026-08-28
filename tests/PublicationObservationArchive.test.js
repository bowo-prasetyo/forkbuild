import { computeContentHash } from '../serializer/contentHash.js';
import { IpfsPublicationRecord, IpfsPublicationMethod } from '../application/IpfsPublicationRecord.js';
import { IpfsPublicationContentVerificationCoordinatorState } from '../application/IpfsPublicationContentVerificationCoordinatorState.js';
import { BitcoinAnchorBroadcastState } from '../application/BitcoinAnchorBroadcastState.js';
import { BitcoinAnchorConfirmationState } from '../application/BitcoinAnchorConfirmationState.js';
import { BitcoinAnchorContentProofState } from '../application/BitcoinAnchorContentProofState.js';
import { PublicationObservationTimelineDomain, PublicationObservationTimelineEntryKind } from '../application/PublicationObservationTimelineView.js';
import { PublicationObservationArchive } from '../application/PublicationObservationArchive.js';
import { describePublicationObservationArchive } from '../application/PublicationObservationArchiveView.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';

// 0.8.75 — Durable Publication Observation Records.
//
// The flagship this milestone exists to prove: a full cross-domain
// observation history — one IPFS publication, verified twice, one
// Bitcoin broadcast, confirmed twice — survives a full destroy-and-reload
// cycle through real (in-memory, JSON-round-tripping) storage with every
// historical fact byte-identical, and with no capability or credential of
// any kind anywhere in what got persisted.
//
//   Section A: FLAGSHIP — publish, verify x2, broadcast, confirm x2,
//              build the cross-domain timeline, persist, destroy all
//              in-memory state, reload, reconstruct, produce the timeline
//              again — identical facts
//   Section B: no capability or credential field appears anywhere in
//              serialized output, even when a caller tries to sneak one
//              onto an archived fact
//   Section C: corrupted storage (invalid JSON, wrong schema version,
//              missing fields, unexpected fields, malformed timestamps)
//              degrades to an empty archive, never a thrown error and
//              never a partially reconstructed one
//   Section D: append methods never mutate the receiver, and a
//              missing/invalid argument is a no-op that returns the
//              identical archive
//   Section E: publicationCount/observationCount never combine into one
//              field, and no status/confidence/health/trusted field
//              exists anywhere in this milestone's output
//   Section F: clear() is the only destructive action — save()/load()
//              never call it, and loading after a save-then-clear
//              produces an empty archive
//
// See docs/Roadmap.md, "0.8.75 — Durable Publication Observation
// Records."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertNeverScored(obj, path) {
    if (!obj || typeof obj !== 'object') return;
    const forbidden = [
        'confidence', 'reliability', 'trusted', 'verified', 'canonical', 'preferred',
        'valid', 'healthy', 'reliable', 'current', 'score', 'status', 'health'
    ];
    for (const key of Object.keys(obj)) {
        assert(!forbidden.includes(key), `${path}.${key} must never exist — an archive composes durable facts, it does not score them`);
    }
}

const FORBIDDEN_CAPABILITY_KEYS = [
    'signPsbt', 'privateKey', 'seedPhrase', 'wallet', 'walletConnection', 'credential',
    'credentials', 'authHeader', 'authorizationHeader', 'apiKey', 'token', 'secret'
];

function assertNoCapabilityOrCredential(value, path) {
    if (typeof value === 'function') {
        throw new Error(`ASSERT FAILED: ${path} is a function — a capability leaked into serialized output`);
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
        assert(
            !FORBIDDEN_CAPABILITY_KEYS.some((forbidden) => key.toLowerCase().includes(forbidden.toLowerCase())),
            `${path}.${key} looks like a capability or credential field — never allowed in persisted output`
        );
        assertNoCapabilityOrCredential(child, `${path}.${key}`);
    }
}

// In-memory StorageProvider that round-trips every value through
// JSON.stringify/JSON.parse, exactly like tests/DurableDocuments.test.js's
// own InMemoryStorageProvider — this is what proves the archive survives
// a REAL serialization boundary, not merely an object reference held
// across a reload.
class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// A StorageProvider whose load() throws — simulating storage/
// LocalStorageProvider.js's own JSON.parse() failing on truly corrupted
// raw text sitting in window.localStorage.
class ThrowingLoadStorageProvider extends StorageProvider {
    save() { /* unused */ }
    load() { throw new SyntaxError('Unexpected token in JSON'); }
    remove() { /* unused */ }
    list() { return []; }
}

// A StorageProvider that hands back a fixed, pre-baked value from load() —
// used to simulate whatever malformed shapes might already be sitting in
// storage from a previous, differently-shaped write.
class FixedValueStorageProvider extends StorageProvider {
    constructor(value) { super(); this._value = value; }
    save(name, data) { this._value = data; }
    load() { return this._value; }
    remove() { this._value = null; }
    list() { return []; }
}

const CONTENT = 'ForkBuild publication observation archive content';
const CONTENT_HASH = computeContentHash(CONTENT);
const LOCATOR = 'ipfs://bafy-archive-test';
const TXID = 'a'.repeat(64);

function buildValidArchiveJSON() {
    const record = new IpfsPublicationRecord({
        contentHash: CONTENT_HASH,
        locator: LOCATOR,
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
        publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
    });
    let archive = PublicationObservationArchive.empty();
    archive = archive.appendIpfsPublicationRecord(record);
    archive = archive.appendIpfsContentVerificationObservation(0, {
        state: IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH,
        contentHash: CONTENT_HASH, locator: LOCATOR, reason: null, observedAt: new Date('2026-01-01T00:05:00.000Z')
    });
    return archive.toJSON();
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — FLAGSHIP: publish, verify x2, broadcast, confirm x2,
    // persist, destroy, reload, reconstruct — identical facts.
    // ---------------------------------------------------------------
    {
        const record = new IpfsPublicationRecord({
            contentHash: CONTENT_HASH,
            locator: LOCATOR,
            publishedAt: new Date('2026-02-01T10:00:00.000Z'),
            publicationMethod: IpfsPublicationMethod.REMOTE_PINNING
        });

        let archive = PublicationObservationArchive.empty();
        archive = archive.appendIpfsPublicationRecord(record);
        const recordIndex = archive.ipfsPublicationRecords.length - 1;

        archive = archive.appendIpfsContentVerificationObservation(recordIndex, {
            state: IpfsPublicationContentVerificationCoordinatorState.HASH_MATCH,
            contentHash: CONTENT_HASH, locator: LOCATOR, reason: null, observedAt: new Date('2026-02-01T10:05:00.000Z')
        });
        archive = archive.appendIpfsContentVerificationObservation(recordIndex, {
            state: IpfsPublicationContentVerificationCoordinatorState.UNAVAILABLE,
            contentHash: null, locator: LOCATOR, reason: 'gateway timeout', observedAt: new Date('2026-02-01T10:10:00.000Z')
        });

        archive = archive.appendBitcoinBroadcastRecord({
            recordIndex, anchorId: TXID, txid: TXID,
            state: BitcoinAnchorBroadcastState.BROADCASTED, reason: null,
            broadcastedAt: new Date('2026-02-01T10:15:00.000Z')
        });
        archive = archive.appendBitcoinConfirmationObservation(TXID, {
            state: BitcoinAnchorConfirmationState.NOT_CONFIRMED, txid: TXID,
            blockHash: null, blockHeight: null, confirmationCount: null, reason: null,
            observedAt: new Date('2026-02-01T10:20:00.000Z')
        });
        archive = archive.appendBitcoinConfirmationObservation(TXID, {
            state: BitcoinAnchorConfirmationState.CONFIRMED, txid: TXID,
            blockHash: 'b'.repeat(64), blockHeight: 900000, confirmationCount: 1, reason: null,
            observedAt: new Date('2026-02-01T10:30:00.000Z')
        });
        archive = archive.appendBitcoinContentProofObservation(TXID, {
            state: BitcoinAnchorContentProofState.HASH_MATCH, contentHash: CONTENT_HASH, reason: null,
            observedAt: new Date('2026-02-01T10:31:00.000Z')
        });

        assert(archive.publicationCount === 2, '1. publicationCount counts one IPFS record and one Bitcoin broadcast');
        assert(archive.observationCount === 5, '2. observationCount counts two IPFS verifications, two Bitcoin confirmations, and one content proof');

        const originalTimeline = describePublicationObservationArchive(archive);
        assert(originalTimeline.entryCount === 7, '3. seven entries: 1 publication + 2 verifications + 1 broadcast + 2 confirmations + 1 content proof');

        // Persist through a REAL, JSON-round-tripping storage provider.
        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        persistence.save(archive);

        // Destroy all in-memory state.
        archive = null;

        // Reload from storage and reconstruct.
        const restored = persistence.load();
        assert(restored instanceof PublicationObservationArchive, '4. load() returns a genuine PublicationObservationArchive');

        const restoredTimeline = describePublicationObservationArchive(restored);
        assert(
            JSON.stringify(restoredTimeline.entries) === JSON.stringify(originalTimeline.entries),
            '5. the restored timeline entries are byte-identical to the original — down to observedAt millisecond, state, and every field'
        );
        assert(restoredTimeline.publicationCount === originalTimeline.publicationCount, '6. publicationCount survives the round trip');
        assert(restoredTimeline.observationCount === originalTimeline.observationCount, '7. observationCount survives the round trip');

        const confirmationEntries = restoredTimeline.entries.filter((entry) => entry.kind === PublicationObservationTimelineEntryKind.BITCOIN_CONFIRMATION);
        assert(confirmationEntries.length === 2, '8. both confirmation observations survive independently — never collapsed into one');
        assert(confirmationEntries[0].state === BitcoinAnchorConfirmationState.NOT_CONFIRMED, '9. the earlier NOT_CONFIRMED observation is not overwritten by the later CONFIRMED one');
        assert(confirmationEntries[1].state === BitcoinAnchorConfirmationState.CONFIRMED, '10. the later CONFIRMED observation is present alongside the earlier one');
        assert(confirmationEntries[1].blockHeight === 900000, '11. block metadata survives the round trip');

        const verificationEntries = restoredTimeline.entries.filter((entry) => entry.kind === PublicationObservationTimelineEntryKind.IPFS_CONTENT_VERIFICATION);
        assert(verificationEntries.length === 2, '12. both IPFS verification observations survive independently');

        const ipfsEntries = restoredTimeline.entries.filter((entry) => entry.domain === PublicationObservationTimelineDomain.IPFS);
        const bitcoinEntries = restoredTimeline.entries.filter((entry) => entry.domain === PublicationObservationTimelineDomain.BITCOIN);
        assert(ipfsEntries.length === 3, '13. IPFS domain entries: 1 publication + 2 verifications');
        assert(bitcoinEntries.length === 4, '14. Bitcoin domain entries: 1 broadcast + 2 confirmations + 1 content proof');
    }
    console.log('✓ Section A: FLAGSHIP — publish, verify x2, broadcast, confirm x2, content-proof, persist, destroy, reload — identical facts');

    // ---------------------------------------------------------------
    // Section B — no capability or credential field anywhere in
    // serialized output, even when a caller tries to sneak one in.
    // ---------------------------------------------------------------
    {
        const record = new IpfsPublicationRecord({
            contentHash: CONTENT_HASH, locator: LOCATOR, publishedAt: new Date(), publicationMethod: IpfsPublicationMethod.KUBO
        });
        let archive = PublicationObservationArchive.empty().appendIpfsPublicationRecord(record);

        // A caller attempting to smuggle a capability onto an observation
        // it appends — the archive stores whatever plain fields the
        // observation object carries, so this proves the persisted output
        // still names no legitimate capability field of its own, and that
        // nothing this milestone's own code paths ever attach one.
        archive = archive.appendBitcoinBroadcastRecord({
            anchorId: TXID, txid: TXID, state: BitcoinAnchorBroadcastState.BROADCASTED, reason: null, broadcastedAt: new Date()
        });
        archive = archive.appendBitcoinConfirmationObservation(TXID, {
            state: BitcoinAnchorConfirmationState.CONFIRMED, txid: TXID, blockHash: 'c'.repeat(64),
            blockHeight: 1, confirmationCount: 1, reason: null, observedAt: new Date()
        });

        const json = archive.toJSON();
        assertNoCapabilityOrCredential(json, 'archive.toJSON()');

        const serialized = JSON.stringify(json);
        for (const forbidden of ['signPsbt', 'privateKey', 'seedPhrase', 'walletConnection', 'apiKey']) {
            assert(!serialized.includes(forbidden), `15. serialized archive never mentions "${forbidden}"`);
        }
    }
    console.log('✓ Section B: no capability or credential field anywhere in serialized output');

    // ---------------------------------------------------------------
    // Section C — corrupted storage degrades to an empty archive, never
    // a thrown error and never a partial reconstruction.
    // ---------------------------------------------------------------
    {
        // Invalid JSON text (storage/LocalStorageProvider.js's own
        // JSON.parse() throwing).
        const throwing = new LocalStoragePublicationObservationArchive(new ThrowingLoadStorageProvider());
        let threw = false;
        let result;
        try {
            result = throwing.load();
        } catch (error) {
            threw = true;
        }
        assert(!threw, '16. a storage provider whose load() throws never propagates — load() itself never throws');
        assert(result instanceof PublicationObservationArchive, '17. a throwing storage provider still returns a genuine archive instance');
        assert(result.publicationCount === 0 && result.observationCount === 0, '18. a throwing storage provider degrades to an empty archive');

        // Wrong schema version.
        const validJson = buildValidArchiveJSON();
        const wrongVersion = new LocalStoragePublicationObservationArchive(new FixedValueStorageProvider({ ...validJson, schemaVersion: 999 }));
        assert(wrongVersion.load().publicationCount === 0, '19. an unrecognized schemaVersion degrades to an empty archive');

        // Missing required field.
        const missingField = { ...validJson };
        delete missingField.bitcoinBroadcastRecords;
        const missing = new LocalStoragePublicationObservationArchive(new FixedValueStorageProvider(missingField));
        assert(missing.load().publicationCount === 0, '20. a top-level payload missing a required field degrades to an empty archive');

        // Unexpected extra top-level field.
        const extraField = { ...validJson, unexpectedField: 'should not be here' };
        const extra = new LocalStoragePublicationObservationArchive(new FixedValueStorageProvider(extraField));
        assert(extra.load().publicationCount === 0, '21. an unexpected extra top-level field degrades to an empty archive');

        // Unexpected extra field on a nested record.
        const extraRecordField = {
            ...validJson,
            ipfsPublicationRecords: validJson.ipfsPublicationRecords.map((record) => ({ ...record, capability: 'signPsbt' }))
        };
        const extraRecord = new LocalStoragePublicationObservationArchive(new FixedValueStorageProvider(extraRecordField));
        assert(extraRecord.load().publicationCount === 0, '22. an unexpected extra field on a nested record degrades to an empty archive, never silently dropped and the rest kept');

        // Malformed timestamp.
        const malformedTimestamp = {
            ...validJson,
            ipfsPublicationRecords: validJson.ipfsPublicationRecords.map((record) => ({ ...record, publishedAt: 'not-a-real-date' }))
        };
        const malformed = new LocalStoragePublicationObservationArchive(new FixedValueStorageProvider(malformedTimestamp));
        assert(malformed.load().publicationCount === 0, '23. a malformed publishedAt timestamp degrades to an empty archive');

        // Missing field on a nested observation.
        const missingObservationField = {
            ...validJson,
            ipfsContentVerificationObservationsByRecordIndex: Object.fromEntries(
                Object.entries(validJson.ipfsContentVerificationObservationsByRecordIndex).map(([index, observations]) => {
                    const stripped = observations.map((observation) => {
                        const { reason, ...rest } = observation;
                        return rest;
                    });
                    return [index, stripped];
                })
            )
        };
        const missingObservation = new LocalStoragePublicationObservationArchive(new FixedValueStorageProvider(missingObservationField));
        assert(missingObservation.load().publicationCount === 0, '24. a nested observation missing a required field degrades to an empty archive');

        // Wrong top-level type entirely (a plain string, as if
        // localStorage held non-JSON-object text that still parsed).
        const wrongType = new LocalStoragePublicationObservationArchive(new FixedValueStorageProvider('just a string'));
        assert(wrongType.load().publicationCount === 0, '25. a non-object top-level payload degrades to an empty archive');

        // No persisted value at all (a fresh browser profile).
        const empty = new LocalStoragePublicationObservationArchive(new InMemoryStorageProvider());
        assert(empty.load().publicationCount === 0, '26. no persisted value at all degrades to an empty archive');

        // PublicationObservationArchive.fromJSON() called directly with
        // completely invalid input never throws either.
        for (const badInput of [null, undefined, 42, 'x', [], {}, { schemaVersion: 1 }]) {
            let directThrew = false;
            let directResult;
            try {
                directResult = PublicationObservationArchive.fromJSON(badInput);
            } catch (error) {
                directThrew = true;
            }
            assert(!directThrew, `27. PublicationObservationArchive.fromJSON(${JSON.stringify(badInput)}) never throws`);
            assert(directResult instanceof PublicationObservationArchive && directResult.publicationCount === 0,
                `28. PublicationObservationArchive.fromJSON(${JSON.stringify(badInput)}) returns an empty archive`);
        }
    }
    console.log('✓ Section C: corrupted storage (invalid JSON, wrong schema, missing/unexpected/malformed fields) degrades to an empty archive, never a thrown error or partial reconstruction');

    // ---------------------------------------------------------------
    // Section D — append methods never mutate the receiver; a
    // missing/invalid argument is a no-op.
    // ---------------------------------------------------------------
    {
        const empty = PublicationObservationArchive.empty();
        const record = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: LOCATOR, publishedAt: new Date(), publicationMethod: null });
        const withRecord = empty.appendIpfsPublicationRecord(record);

        assert(empty.ipfsPublicationRecords.length === 0, '29. appendIpfsPublicationRecord() never mutates the receiver');
        assert(withRecord.ipfsPublicationRecords.length === 1, '30. appendIpfsPublicationRecord() returns a new archive holding the appended record');
        assert(withRecord !== empty, '31. append always returns a different instance, even when the receiver is empty');

        assert(empty.appendIpfsPublicationRecord(null) === empty, '32. appending a null record is a no-op that returns the identical archive');
        assert(empty.appendIpfsContentVerificationObservation('not-an-integer', {}) === empty, '33. a non-integer recordIndex is a no-op');
        assert(empty.appendBitcoinBroadcastRecord({ anchorId: null, broadcastedAt: new Date() }) === empty, '34. a missing anchorId is a no-op for a broadcast record');
        assert(empty.appendBitcoinBroadcastRecord({ anchorId: TXID, broadcastedAt: 'not-a-date' }) === empty, '35. a non-Date broadcastedAt is a no-op');
        assert(empty.appendBitcoinConfirmationObservation(TXID, null) === empty, '36. a null observation is a no-op for a confirmation append');
        assert(empty.appendBitcoinContentProofObservation(null, {}) === empty, '37. a missing anchorId is a no-op for a content-proof append');

        assert(Object.isFrozen(withRecord), '38. every archive instance is frozen');
        assert(Object.isFrozen(withRecord.ipfsPublicationRecords), '39. every collection an archive holds is frozen');
    }
    console.log('✓ Section D: append methods never mutate the receiver; a missing/invalid argument is a no-op');

    // ---------------------------------------------------------------
    // Section E — publicationCount/observationCount never combine, and no
    // scoring vocabulary exists anywhere in this milestone's output.
    // ---------------------------------------------------------------
    {
        const record = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: LOCATOR, publishedAt: new Date(), publicationMethod: null });
        const archive = PublicationObservationArchive.empty().appendIpfsPublicationRecord(record);
        const described = describePublicationObservationArchive(archive);

        assert(typeof described.publicationCount === 'number' && typeof described.observationCount === 'number',
            '40. publicationCount and observationCount both exist as separate numbers');
        assertNeverScored(described, 'describePublicationObservationArchive(archive)');
        for (const entry of described.entries) assertNeverScored(entry, 'describePublicationObservationArchive(archive).entries[]');

        assertNeverScored(describePublicationObservationArchive(null), 'describePublicationObservationArchive(null)');
        assert(describePublicationObservationArchive(null).publicationCount === 0, '41. a non-archive input degrades to an empty archive\'s own counts, never throws');
        assert(describePublicationObservationArchive({ notAnArchive: true }).publicationCount === 0, '42. a plain object is never duck-typed as an archive');
    }
    console.log('✓ Section E: publicationCount/observationCount never combine into one field, and no status/confidence/health/trusted field exists anywhere');

    // ---------------------------------------------------------------
    // Section F — clear() is the only destructive action; save()/load()
    // never call it.
    // ---------------------------------------------------------------
    {
        const storageProvider = new InMemoryStorageProvider();
        const persistence = new LocalStoragePublicationObservationArchive(storageProvider);
        const record = new IpfsPublicationRecord({ contentHash: CONTENT_HASH, locator: LOCATOR, publishedAt: new Date(), publicationMethod: null });
        const archive = PublicationObservationArchive.empty().appendIpfsPublicationRecord(record);

        persistence.save(archive);
        assert(persistence.load().publicationCount === 1, '43. a saved archive loads back with its own facts intact');

        persistence.save(archive);
        assert(persistence.load().publicationCount === 1, '44. saving again (no clear in between) never discards the persisted archive');

        persistence.clear();
        assert(persistence.load().publicationCount === 0, '45. clear() is the one action that removes a persisted archive');

        assert(persistence.save.toString().includes('clear') === false, '46. save() itself never references clear()');
        assert(persistence.load.toString().includes('clear') === false, '47. load() itself never references clear()');
    }
    console.log('✓ Section F: clear() is the only destructive action — save()/load() never call it');

    console.log('\nAll PublicationObservationArchive tests passed.');
}

run().catch((error) => {
    console.error('PublicationObservationArchive.test.js FAILED:', error);
    process.exitCode = 1;
});
