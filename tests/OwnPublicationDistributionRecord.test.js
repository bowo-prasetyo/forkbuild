import { OwnPublicationDistributionRecord, substrateOfOrigin } from '../application/publication/OwnPublicationDistributionRecord.js';
import { OwnSnapshotDistributionLog } from '../application/snapshot/OwnSnapshotDistributionLog.js';
import { PublicationDistributionLifecyclePersistence } from '../application/publication/distribution/PublicationDistributionLifecyclePersistence.js';
import { backupEntryGroupOf } from '../application/backup/BackupEntryGroups.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The Repository says where this device recorded distributing your own
// publications ("Stored on IPFS · Announced on Nostr"), and only that.

function setUp({ placements = [] } = {}) {
    const storage = new InMemoryStorageProvider();
    storage.save('forkbuild-publications', [
        { id: 'claim', contentHash: 'hash-claim' },
        { id: 'snapshot', contentHash: 'hash-snapshot' },
        { id: 'placed', contentHash: 'hash-placed' },
        { id: 'nothing', contentHash: 'hash-nothing' }
    ]);
    const lifecycles = new PublicationDistributionLifecyclePersistence(storage);
    lifecycles.save('claim', {
        material: { state: 'PRESENT', uri: 'ar://claim-tx', storage: 'ar' },
        discovery: { state: 'PRESENT', origin: 'wss://relay.example', discoveryTag: 'forkbuild-publication', id: 'nostr-event-1' }
    });
    const log = new OwnSnapshotDistributionLog(storage, { now: () => new Date('2026-09-28T12:00:00Z') });
    const placementCatalog = { findByContentHash: (hash) => placements.filter((p) => p.contentHash === hash) };
    const record = new OwnPublicationDistributionRecord({ storageProvider: storage, placementCatalog, snapshotDistributionLog: log });
    return { storage, log, record };
}

// --- where an announcement went ------------------------------------------------
assert(substrateOfOrigin('wss://relay.damus.io') === 'nostr', 'a wss relay is Nostr');
assert(substrateOfOrigin('https://steemit.com/forkbuild/@forkbuild/thread') === 'steem', 'a steemit.com thread is Steem');
assert(substrateOfOrigin('https://arweave.net') === 'arweave' && substrateOfOrigin('https://my-gateway.example') === 'arweave',
    'an http gateway is Arweave');
assert(substrateOfOrigin('not a url') === null && substrateOfOrigin(null) === null, 'anything else is unknown');
console.log('✓ an announcement\'s origin names its substrate');

// --- the snapshot log -------------------------------------------------------------
{
    const { log } = setUp();
    log.record({
        result: { contentReference: { hash: 'hash-snapshot', storage: 'ipfs', uri: 'ipfs://bafy1' }, announcement: { published: true, relayUrl: 'wss://r', id: 'ev-1' } },
        substrate: 'nostr', publicationId: 'snapshot'
    });
    log.record({
        result: { contentReference: { hash: 'hash-snapshot', storage: 'ipfs', uri: 'ipfs://bafy2' }, announcement: { published: true, id: 'ev-2' } },
        substrate: 'nostr', publicationId: 'snapshot'
    });
    log.record({ result: { contentReference: { hash: 'hash-local', storage: 'local', uri: null }, announcement: null }, substrate: 'nostr' });
    log.record({ result: { contentReference: { hash: 'hash-quiet', storage: 'ar', uri: 'ar://tx' }, announcement: null }, substrate: 'nostr' });
    const entries = log.findByContentHash('hash-snapshot');
    assert(entries.length === 1 && entries[0].uri === 'ipfs://bafy2' && entries[0].announcementId === 'ev-2', 'a repeat replaces the earlier entry');
    assert(log.findByContentHash('hash-local').length === 0, 'a copy on this device is not a distribution');
    const quiet = log.findByContentHash('hash-quiet')[0];
    assert(quiet.substrate === null && quiet.announcementId === null, 'an upload without an announcement names no substrate');
    assert(backupEntryGroupOf('own-snapshot-distributions') === 'publications', 'the log is backed up with your publications');
}
console.log('✓ the snapshot distribution log keeps one entry per storage and substrate');

// --- describing a publication -------------------------------------------------------
{
    const { log, record } = setUp({ placements: [{ contentHash: 'hash-placed', storage: 'ipfs', locator: 'ipfs://bafy-placed' }, { contentHash: 'hash-placed', storage: 'local', locator: null }] });
    log.record({
        result: { contentReference: { hash: 'hash-snapshot', storage: 'ipfs', uri: 'ipfs://bafy' }, announcement: { published: true, id: 'steem-post' } },
        substrate: 'steem', publicationId: 'snapshot'
    });
    log.record({
        result: { contentReference: { hash: 'hash-snapshot', storage: 'ar', uri: 'ar://snap' }, announcement: { published: true, id: 'ev' } },
        substrate: 'nostr', publicationId: 'snapshot'
    });

    const claim = record.describe({ id: 'claim', contentHash: 'hash-claim' });
    assert(claim.stored.map((e) => e.kind).join() === 'arweave' && claim.stored[0].locator === 'ar://claim-tx', 'an uploaded Signed Claim is stored on Arweave');
    assert(claim.announced.map((e) => e.kind).join() === 'nostr' && claim.announced[0].id === 'nostr-event-1', 'and announced on Nostr');

    const snapshot = record.describe({ id: 'snapshot', contentHash: 'hash-snapshot' });
    assert(snapshot.stored.map((e) => e.kind).join() === 'ipfs,arweave', `snapshot distributions are listed in a fixed order (${snapshot.stored.map((e) => e.kind)})`);
    assert(snapshot.announced.map((e) => e.kind).join() === 'steem,nostr', 'with every substrate that announced them');

    const placed = record.describe({ id: 'placed', contentHash: 'hash-placed' });
    assert(placed.stored.length === 1 && placed.stored[0].kind === 'ipfs' && placed.announced.length === 0, 'a signed IPFS placement counts; a local one does not');

    const nothing = record.describe({ id: 'nothing', contentHash: 'hash-nothing' });
    assert(nothing && nothing.stored.length === 0 && nothing.announced.length === 0, 'no record: empty lists, never a claim that no copy exists');

    assert(record.describe({ id: 'theirs', contentHash: 'hash-theirs' }) === null, 'someone else\'s publication gets no note');
    assert(record.describe({ id: 'claim', contentHash: 'other-hash' }) === null, 'a publication is yours only with the same content hash');
    assert(record.describe(null) === null, 'nothing gets no note');
}
console.log('✓ your publications list only the storage and announcements this device recorded');

// --- every Distribute Snapshot is logged ---------------------------------------------
{
    const { composePublicationDistribution } = await import('../ui/main/composePublicationDistribution.js');
    const storage = new InMemoryStorageProvider();
    const log = new OwnSnapshotDistributionLog(storage);
    const ipfsStore = {
        storage: 'ipfs',
        put: async () => ({ hash: 'hash-built', storage: 'ipfs', uri: 'ipfs://bafy-built' })
    };
    const registry = { get: (key) => (key === 'ipfs' ? ipfsStore : null), has: (key) => key === 'ipfs' };
    const steemRuntime = {
        snapshotDiscoveryPublisher: { discoveryTag: 'forkbuild-snapshot', publish: async () => ({ published: true, relayUrl: 'https://steemit.com/x', id: 'steem-announcement' }) },
        publicationDiscoveryPublisher: null,
        contentStore: null
    };
    const { snapshotDistributionCommand } = composePublicationDistribution({
        resolvedIpfsNodeApiUrl: null, snapshotPlacementStoreRegistry: registry, resolvedAnnouncementDiscoveryProvider: 'nostr',
        resolvedArweaveGatewayUrl: 'https://arweave.net', resolvedNostrRelayUrls: ['wss://relay.example'], PUBLICATION_DISCOVERY_TAG: 'forkbuild-publication',
        publicationDistributionLifecycleStore: null, arweaveHostSigner: { sign: async () => ({}) }, nostrHostPublisher: async () => ({}),
        nostrPublicationRuntimeCapabilities: {}, steemRuntime, snapshotDistributionLog: log
    });
    const result = await snapshotDistributionCommand('{"world":1}', 'ipfs', 'pub-built', null, 'steem');
    assert(result.contentReference.uri === 'ipfs://bafy-built', 'the command still returns its result');
    const [entry] = log.findByContentHash('hash-built');
    assert(entry && entry.storage === 'ipfs' && entry.substrate === 'steem' && entry.announcementId === 'steem-announcement' && entry.publicationId === 'pub-built',
        'and the distribution is logged with its storage and substrate');
}
console.log('✓ every completed Distribute Snapshot is logged');
