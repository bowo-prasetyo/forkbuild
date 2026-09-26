import {
    SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES,
    availableSnapshotDistributionStorageTypes,
    resolveSnapshotDistributionContentStore
} from '../application/snapshot/SnapshotDistributionContentBackendSelection.js';
import { assert } from './support/Assert.js';

// Which content backends Snapshot distribution offers, and which store a
// choice resolves to.

function registry(entries) {
    const map = new Map(Object.entries(entries));
    return { get: (key) => map.get(key) ?? null, has: (key) => map.has(key) };
}

function throwsMatching(fn, pattern) {
    try {
        fn();
    } catch (error) {
        return pattern.test(error.message);
    }
    return false;
}

// Only IPFS, Arweave and Steem are eligible, in that order, and only when
// registered.
{
    assert(JSON.stringify(SNAPSHOT_DISTRIBUTION_ELIGIBLE_STORAGE_TYPES) === JSON.stringify(['ipfs', 'ar', 'steem']), 'IPFS, Arweave and Steem are the eligible backends');
    const ipfs = { name: 'ipfs-store' };
    const ar = { name: 'ar-store' };
    const steem = { name: 'steem-store' };
    const all = registry({ steem, local: {}, ar, ipfs });
    assert(JSON.stringify(availableSnapshotDistributionStorageTypes(all)) === JSON.stringify(['ipfs', 'ar', 'steem']),
        'with all registered, all are offered in eligibility order, and a local store is never offered');
    assert(JSON.stringify(availableSnapshotDistributionStorageTypes(registry({ ar }))) === JSON.stringify(['ar']),
        'an unregistered backend is not offered');
    assert(availableSnapshotDistributionStorageTypes(null).length === 0 && availableSnapshotDistributionStorageTypes({}).length === 0,
        'no registry, or one without get()/has(), offers nothing rather than throwing');
    console.log('✓ offered backends are the registered eligible ones');
}

// A choice resolves to exactly its registered store, and every other case is
// refused with a message saying why.
{
    const ipfs = { name: 'ipfs-store' };
    const stores = registry({ ipfs, local: {} });
    assert(resolveSnapshotDistributionContentStore(stores, 'ipfs') === ipfs, 'an eligible, registered choice resolves to its store');
    assert(throwsMatching(() => resolveSnapshotDistributionContentStore(stores, 'local'), /not an eligible Snapshot Distribution content backend/),
        'an ineligible backend is refused even when registered');
    assert(throwsMatching(() => resolveSnapshotDistributionContentStore(stores, 'ar'), /no ContentStore is currently registered for "ar"/),
        'an eligible but unregistered backend is refused');
    assert(throwsMatching(() => resolveSnapshotDistributionContentStore(null, 'ipfs'), /keyed ContentStore registry/),
        'a missing registry is refused');
    console.log('✓ a backend choice resolves to its store or is refused with the reason');
}

console.log('\n✅ All SnapshotDistributionContentBackendSelection tests passed.');
