// application/publication/PublicationFirstSeenLog.js: when this device first
// saw each Publication, kept on the device, the earliest time winning.
import { PublicationFirstSeenLog } from '../application/publication/PublicationFirstSeenLog.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

const KEY = 'publication-first-seen:entries';

{
    const storage = new InMemoryStorageProvider();
    const writes = [];
    let now = 1000;
    const log = new PublicationFirstSeenLog({ storageProvider: storage, now: () => now, schedule: (write) => writes.push(write) });
    assert(log.get('p1') === null, '1. a Publication never seen has no time');
    log.record('p1');
    assert(log.get('p1') === 1000, '2. recorded now, when no time is given');
    now = 5000;
    log.record('p1');
    assert(log.get('p1') === 1000, '3. seen again later, the first time stays');
    log.record('p1', new Date(500));
    log.record('p2', '1970-01-01T00:00:02.000Z');
    assert(log.get('p1') === 500 && log.get('p2') === 2000, '4. an earlier time, as a Date or ISO text, wins (an admission kept before the log existed)');
    log.record('', 1);
    log.record('p3', 'not a date');
    assert(log.get('p3') === null, '5. no id, or no time, records nothing');

    assert(writes.length === 1 && storage.load(KEY) === null, '6. writes are gathered, not made one a record');
    writes[0]();
    assert(JSON.stringify(storage.load(KEY)) === '[{"publicationId":"p1","seen":500},{"publicationId":"p2","seen":2000}]', '7. and made once the task ends');
    log.record('p1', 600);
    assert(writes.length === 1, '8. a later time writes nothing');

    const again = new PublicationFirstSeenLog({ storageProvider: storage });
    assert(again.get('p1') === 500 && again.get('p2') === 2000, '9. the times outlive the visit');
}
console.log('✓ the earliest time, kept');

{
    const storage = new InMemoryStorageProvider();
    const log = new PublicationFirstSeenLog({ storageProvider: storage, schedule: () => {}, maxEntries: 2 });
    log.record('old', 1);
    log.record('older', 0);
    log.record('new', 9);
    log.flush();
    assert(log.get('new') === null && log.get('old') === 1 && log.get('older') === 0 && storage.load(KEY).length === 2,
        '10. past the most it keeps, the latest seen go first: without a time a build counts as seen late, as it was');

    storage.save(KEY, [{ publicationId: 'ok', seen: 3 }, { publicationId: 5 }, null, { publicationId: 'bad', seen: 'x' }]);
    assert(new PublicationFirstSeenLog({ storageProvider: storage }).get('ok') === 3, '11. what is read back is checked');

    const broken = { load: () => { throw new Error('blocked'); }, save: () => { throw new Error('full'); } };
    const unsure = new PublicationFirstSeenLog({ storageProvider: broken, schedule: (write) => write() });
    unsure.record('p', 7);
    assert(unsure.get('p') === 7, '12. a blocked or full storage only loses the times, this visit keeps them');
    let refused = null;
    try {
        new PublicationFirstSeenLog({});
    } catch (error) {
        refused = error;
    }
    assert(refused, '13. a storage is required');
}
console.log('✓ the most it keeps, and a storage that fails');

console.log('✅ All publication first-seen log tests passed.');
