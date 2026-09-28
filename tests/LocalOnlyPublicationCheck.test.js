import { LocalOnlyPublicationCheck } from '../application/publication/LocalOnlyPublicationCheck.js';
import { PublicationDistributionLifecyclePersistence } from '../application/publication/distribution/PublicationDistributionLifecyclePersistence.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The Repository marks your own publications that exist only in this
// browser: never uploaded from here to IPFS or Arweave.

function setUp(placements = []) {
    const storage = new InMemoryStorageProvider();
    storage.save('forkbuild-publications', [
        { id: 'mine', contentHash: 'hash-mine' },
        { id: 'claim-uploaded', contentHash: 'hash-claim' },
        { id: 'snapshot-placed', contentHash: 'hash-placed' },
        { id: 'locally-placed', contentHash: 'hash-local' }
    ]);
    new PublicationDistributionLifecyclePersistence(storage).save('claim-uploaded', {
        material: { state: 'PRESENT', uri: 'ar://tx', storage: 'arweave' },
        discovery: { state: 'ABSENT' }
    });
    const placementCatalog = { findByContentHash: (hash) => placements.filter((p) => p.contentHash === hash) };
    return new LocalOnlyPublicationCheck({ storageProvider: storage, placementCatalog });
}

const check = setUp([
    { contentHash: 'hash-placed', storage: 'ipfs' },
    { contentHash: 'hash-local', storage: 'local' }
]);
assert(check.isOnlyOnThisDevice({ id: 'mine', contentHash: 'hash-mine' }), 'a publication never uploaded is only on this device');
assert(!check.isOnlyOnThisDevice({ id: 'claim-uploaded', contentHash: 'hash-claim' }), 'an uploaded Signed Claim is a copy elsewhere');
assert(!check.isOnlyOnThisDevice({ id: 'snapshot-placed', contentHash: 'hash-placed' }), 'an IPFS or Arweave snapshot placement is a copy elsewhere');
assert(check.isOnlyOnThisDevice({ id: 'locally-placed', contentHash: 'hash-local' }), 'a placement on this device is not');
assert(!check.isOnlyOnThisDevice({ id: 'theirs', contentHash: 'hash-theirs' }), 'someone else\'s publication is never marked');
assert(!check.isOnlyOnThisDevice({ id: 'mine', contentHash: 'different-hash' }), 'a publication is yours only with the same content hash');
assert(!check.isOnlyOnThisDevice(null), 'nothing is not marked');
assert(new LocalOnlyPublicationCheck({ storageProvider: new InMemoryStorageProvider() }).isOnlyOnThisDevice({ id: 'mine', contentHash: 'hash-mine' }) === false,
    'a device with no publications marks nothing');
console.log('✓ only your own publications never uploaded from here are marked');
