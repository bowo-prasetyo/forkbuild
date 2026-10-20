// application/publication/LookAlikeWaitingStore.js: the builds waiting for
// their bytes, kept across visits as ids and hashes only; a broken storage
// never throws.
import { LookAlikeWaitingStore } from '../application/publication/LookAlikeWaitingStore.js';
import { backupEntryGroupOf, BackupEntryGroup } from '../application/backup/BackupEntryGroups.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

const storage = new InMemoryStorageProvider();
const store = new LookAlikeWaitingStore({ storageProvider: storage });
assert(store.load().length === 0, '1. nothing waits at first');
store.save([{ publicationId: 'p1', contentHash: 'sha256:1', since: 10, publication: { title: 'not kept' } }]);
const loaded = store.load();
assert(loaded.length === 1 && loaded[0].publicationId === 'p1' && loaded[0].contentHash === 'sha256:1' && loaded[0].since === 10, '2. what is saved loads back');
assert(!('publication' in storage.load('look-alike-waiting:entries')[0]), '3. ids, hashes and times only');

storage.save('look-alike-waiting:entries', [null, { publicationId: '', contentHash: 'x', since: 1 }, { publicationId: 'p', contentHash: 'h', since: 'soon' }, { publicationId: 'ok', contentHash: 'h', since: 2 }]);
assert(store.load().map((entry) => entry.publicationId).join() === 'ok', '4. malformed entries are skipped');
storage.save('look-alike-waiting:entries', 'not a list');
assert(store.load().length === 0, '5. a stored value that isn\'t a list reads as nothing');

const broken = new LookAlikeWaitingStore({ storageProvider: { load: () => { throw new Error('blocked'); }, save: () => { throw new Error('full'); } } });
assert(broken.load().length === 0, '6. a blocked storage reads as nothing');
broken.save([{ publicationId: 'p', contentHash: 'h', since: 1 }]);

assert(backupEntryGroupOf('look-alike-waiting:entries') === BackupEntryGroup.DOWNLOADED, '7. a backup counts it with downloaded data');

console.log('✅ All look-alike waiting store tests passed.');
