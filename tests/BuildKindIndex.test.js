// application/publication/BuildKindIndex.js: what each published build is
// made of, in counts, kept on this device so the look-alike finder can rank
// builds before reading them.
import { BuildKindIndex } from '../application/publication/BuildKindIndex.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

const shape = (size, kinds) => ({ size, kinds, points: ['not kept'] });

{
    const storage = new InMemoryStorageProvider();
    const writes = [];
    const index = new BuildKindIndex({ storageProvider: storage, schedule: (write) => writes.push(write) });
    assert(index.get('h1', 'lib') === null, '1. a build not counted has no counts');
    index.put('h1', 'lib', shape(30, { 'core:cube': 20, 'core:door': 10 }));
    index.put('h2', 'lib', shape(25, { 'core:cube': 25 }));
    assert(index.get('h1', 'lib').size === 30 && index.get('h1', 'lib').kinds['core:door'] === 10 && !('points' in index.get('h1', 'lib')),
        '2. a build\'s counts are kept, and nothing else');
    assert(writes.length === 1 && storage.load('build-kind-index:v1') === null, '3. writes are gathered and made once the current task ends');
    writes.shift()();
    const stored = storage.load('build-kind-index:v1');
    assert(stored.kinds.length === 2 && stored.entries.length === 2, '4. each kind\'s id is written once');
    const later = new BuildKindIndex({ storageProvider: storage });
    assert(later.get('h2', 'lib').kinds['core:cube'] === 25, '5. the counts are there on the next visit');
    assert(new BuildKindIndex({ storageProvider: storage }).get('h1', 'other library') === null, '6. counts made with other ready-made structures aren\'t used');
}
console.log('✓ counts kept, compactly, for the next visit');

{
    const index = new BuildKindIndex({ maxEntries: 2, schedule: () => {} });
    index.put('a', 'lib', shape(20, { x: 20 }));
    index.put('b', 'lib', shape(20, { x: 20 }));
    index.get('a', 'lib');
    index.put('c', 'lib', shape(20, { x: 20 }));
    assert(index.get('a', 'lib') && index.get('c', 'lib') && index.get('b', 'lib') === null, '7. the build used longest ago is let go first');
    index.put('d', 'new library', shape(20, { x: 20 }));
    assert(index.get('a', 'new library') === null && index.get('d', 'new library'), '8. other ready-made structures start afresh');
}
console.log('✓ bounded, the build used longest ago let go first');

{
    const broken = { load: () => { throw new Error('blocked'); }, save: () => { throw new Error('full'); } };
    const index = new BuildKindIndex({ storageProvider: broken, schedule: (write) => write() });
    index.put('h', 'lib', shape(20, { x: 20 }));
    assert(index.get('h', 'lib').size === 20, '9. a blocked or full storage only loses the counts for later visits, without throwing');
    const garbled = new InMemoryStorageProvider();
    garbled.save('build-kind-index:v1', { readyMade: 'lib', kinds: ['x'], entries: [['ok', 20, [0, 20]], [1, 'bad'], ['odd', 20, [5, 3]]] });
    const read = new BuildKindIndex({ storageProvider: garbled });
    assert(read.get('ok', 'lib').kinds.x === 20 && Object.keys(read.get('odd', 'lib').kinds).length === 0, '10. what isn\'t counts is left out');
    assert(new BuildKindIndex().get('h', 'lib') === null, '11. with no storage, counts are kept for the visit only');
}
console.log('✓ never throws');

console.log('✅ All build kind index tests passed.');
