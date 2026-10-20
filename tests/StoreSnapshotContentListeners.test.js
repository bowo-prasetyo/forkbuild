// application/snapshot/materialization/StoreSnapshotContentUseCase.js#onStored():
// a reader waiting for a build's bytes hears when they are stored, only after
// they verify, and never fails the store.
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { StoreSnapshotContentOutcome } from '../application/snapshot/materialization/StoreSnapshotContentOutcome.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

const contentStore = new LocalContentStore(new InMemoryStorageProvider());
const useCase = new StoreSnapshotContentUseCase(contentStore);
const heard = [];
const unsubscribe = useCase.onStored((event) => heard.push(event));
useCase.onStored(() => { throw new Error('a listener that fails'); });

const bytes = JSON.stringify({ a: 1 });
const contentHash = computeContentHash(bytes);

const stored = await useCase.execute({ contentHash, bytes });
assert(stored.outcome === StoreSnapshotContentOutcome.STORED, '1. a failing listener never fails the store');
assert(heard.length === 1 && heard[0].contentHash === contentHash && heard[0].outcome === StoreSnapshotContentOutcome.STORED, '2. a listener hears the stored hash');

await useCase.execute({ contentHash, bytes });
assert(heard.length === 2 && heard[1].outcome === StoreSnapshotContentOutcome.ALREADY_AVAILABLE, '3. and bytes it already had, verified again');

const mismatch = await useCase.execute({ contentHash, bytes: JSON.stringify({ a: 2 }) });
assert(mismatch.outcome === StoreSnapshotContentOutcome.HASH_MISMATCH && heard.length === 2, '4. bytes that don\'t match their hash are never heard of');

unsubscribe();
await useCase.execute({ contentHash, bytes });
assert(heard.length === 2, '5. an unsubscribed listener hears nothing more');

console.log('✅ All store snapshot content listener tests passed.');
