// @environment browser
import { IndexedDbStorageBackend } from '../storage/IndexedDbStorageBackend.js';
import { LocalStorageProvider, installLocalStorageBackend, flushLocalStorage } from '../storage/LocalStorageProvider.js';
import { isStorageEntryNotLoadedError } from '../storage/StorageEntryNotLoadedError.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LoadPublishedWorldSessionUseCase } from '../application/publication/LoadPublishedWorldSessionUseCase.js';
import { Document } from '../core/Document.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { assert } from './support/Assert.js';

// Published content and snapshots ('content:' and 'snapshot:' entries) stay
// on disk in IndexedDB: opening the database reads their names only, a
// written one leaves memory once stored, and reading one is asynchronous
// into a bounded cache. Real IndexedDB, in Chromium.

let databaseCount = 0;
const freshDatabaseName = () => `forkbuild-cold-${Date.now()}-${databaseCount++}`;
const open = (databaseName, options = {}) => IndexedDbStorageBackend.open({ databaseName, localStorage: null, ...options });
function throwsNotLoaded(fn) {
    try { fn(); } catch (error) { return isStorageEntryNotLoadedError(error); }
    return false;
}

// Opening reads cold entries' names, never their values.
{
    const databaseName = freshDatabaseName();
    const writer = await open(databaseName);
    const big = JSON.stringify({ bricks: 'x'.repeat(200000) });
    writer.setItem('content:abc', big);
    writer.setItem('snapshot:pub-1', big);
    writer.setItem('forkbuild-index', '[]');
    await writer.flush();
    writer.close();

    const backend = await open(databaseName);
    assert(!backend._entries.has('content:abc') && !backend._entries.has('snapshot:pub-1') && backend.warmLength === 0,
        'after opening, cold values are not in memory');
    assert(backend.getItem('forkbuild-index') === '[]', 'other entries are, as before');
    assert(backend.keys().includes('content:abc') && backend.keys().includes('snapshot:pub-1'), 'keys() lists cold entries');
    assert(backend.hasItem('content:abc') && !backend.hasItem('content:none'), 'hasItem() knows them without reading');
    assert(!backend.isLoaded('content:abc') && throwsNotLoaded(() => backend.getItem('content:abc')), 'a synchronous read of an unloaded cold entry throws StorageEntryNotLoadedError');
    assert(backend.getItem('content:none') === null && backend.isLoaded('content:none'), 'a missing one is simply null');

    const [first, second] = await Promise.all([backend.loadItem('content:abc'), backend.loadItem('content:abc')]);
    assert(first === big && second === big, 'loadItem() reads it (once, for concurrent calls)');
    assert(backend.isLoaded('content:abc') && backend.getItem('content:abc') === big && backend.warmLength === big.length, '...and keeps it in the warm cache');
    assert(await backend.loadItem('content:none') === null, 'loadItem() of a missing entry is null');
    backend.close();
    console.log('✓ cold entries stay on disk until read');
}

// A cold write stays readable until stored, then leaves memory; the warm
// cache holds at most its budget, most recently used first.
{
    const databaseName = freshDatabaseName();
    const backend = await open(databaseName, { warmCacheLength: 250 });
    const a = JSON.stringify('a'.repeat(100));
    const b = JSON.stringify('b'.repeat(100));
    const c = JSON.stringify('c'.repeat(100));
    backend.setItem('content:a', a);
    assert(backend.getItem('content:a') === a, 'a cold write is readable before it is stored');
    backend.setItem('content:b', b);
    await backend.flush();
    assert(!backend._entries.has('content:a') && backend.warmLength === a.length + b.length, 'once stored, cold values move to the warm cache');
    backend.getItem('content:a'); // a is now the most recently used
    backend.setItem('content:c', c);
    await backend.flush();
    assert(backend.warmLength <= 250 && backend.isLoaded('content:a') && backend.isLoaded('content:c') && !backend.isLoaded('content:b'),
        'over budget, the least recently used value (b) leaves memory');
    assert(await backend.loadItem('content:b') === b, '...and is read back from disk when needed');

    const huge = JSON.stringify('h'.repeat(1000));
    backend.setItem('content:huge', huge);
    await backend.flush();
    assert(backend.isLoaded('content:huge') && backend.warmLength === huge.length && !backend.isLoaded('content:c'),
        'a value larger than the whole cache stays alone, so a synchronous reader waiting for it can read it');

    backend.removeItem('content:a');
    assert(!backend.hasItem('content:a') && backend.getItem('content:a') === null, 'removing a cold entry forgets it');
    await backend.flush();
    backend.close();
    const reopened = await open(databaseName);
    assert(!reopened.hasItem('content:a') && reopened.hasItem('content:b'), '...on disk too');
    reopened.close();
    console.log('✓ cold writes leave memory once stored; the warm cache is bounded');
}

// Another tab's cold writes and removals reach this tab's index.
{
    const databaseName = freshDatabaseName();
    const tabA = await open(databaseName);
    const tabB = await open(databaseName);
    tabA.setItem('content:shared', '"from A"');
    await tabA.flush();
    for (let i = 0; i < 50 && !tabB.hasItem('content:shared'); i++) await new Promise((r) => setTimeout(r, 20));
    assert(tabB.hasItem('content:shared') && await tabB.loadItem('content:shared') === '"from A"', 'a cold entry another tab wrote is known and readable');
    tabA.removeItem('content:shared');
    await tabA.flush();
    for (let i = 0; i < 50 && tabB.hasItem('content:shared'); i++) await new Promise((r) => setTimeout(r, 20));
    assert(!tabB.hasItem('content:shared') && tabB.getItem('content:shared') === null, 'its removal reaches the other tab, warm copy included');
    tabA.close();
    tabB.close();
    console.log('✓ tabs share cold entries');
}

// Content moved in from localStorage is cold too.
{
    const items = new Map([['forkbuild:content:old', '"legacy"'], ['forkbuild:doc', '{"a":1}']]);
    const localStorage = { get length() { return items.size; }, key: (i) => [...items.keys()][i] ?? null, getItem: (k) => items.get(k) ?? null, removeItem: (k) => items.delete(k) };
    const backend = await IndexedDbStorageBackend.open({ databaseName: freshDatabaseName(), localStorage });
    assert(backend.hasItem('content:old') && !backend._entries.has('content:old') && backend.getItem('doc') === '{"a":1}', 'moved content is cold; other entries are resident');
    assert(await backend.loadItem('content:old') === '"legacy"', '...and readable');
    backend.close();
    console.log('✓ content moved from localStorage stays on disk');
}

// Through LocalStorageProvider, LocalContentStore and a published World.
{
    const backend = await open(freshDatabaseName());
    installLocalStorageBackend(backend);
    try {
        const provider = new LocalStorageProvider();
        const world = new World();
        const building = new Building();
        world.addBuilding(building);
        for (let i = 0; i < 2000; i++) building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(i % 50, 0.5, Math.floor(i / 50)) }));
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Wall' }) });
        const contentStore = new LocalContentStore(provider);
        const publication = new LocalPublisherProvider(provider, contentStore).publish(document, null);
        await flushLocalStorage();
        // Simulate a restart: drop everything cold from memory.
        backend._warm.clear();
        backend._warmLength = 0;

        assert(contentStore.has(publication.contentReference), 'the content store knows the content is there');
        let thrown = null;
        try { contentStore.getSync(publication.contentReference); } catch (error) { thrown = error; }
        assert(isStorageEntryNotLoadedError(thrown) && thrown.ready instanceof Promise, 'a synchronous read throws StorageEntryNotLoadedError with a `ready` promise');
        const text = await thrown.ready;
        assert(typeof text === 'string' && publication.contentReference.verify(text), '`ready` resolves to the verified content');
        assert(contentStore.getSync(publication.contentReference) === text, 'after which the synchronous read answers');
        backend._warm.clear();
        backend._warmLength = 0;
        assert(await contentStore.get(publication.contentReference) === text, 'get() reads it asynchronously');

        backend._warm.clear();
        backend._warmLength = 0;
        const load = new LoadPublishedWorldSessionUseCase(new LocalPublisherProvider(provider, contentStore), undefined, contentStore);
        let pending = null;
        try { load.execute(publication); } catch (error) { pending = error; }
        assert(isStorageEntryNotLoadedError(pending), 'loading the published World while its content is on disk says so, rather than failing');
        await pending.ready;
        assert(load.execute(publication).getDocument().world.getBuildings()[0].getBricks().length === 2000, 'once read, the World loads');
    } finally {
        installLocalStorageBackend(null);
        backend.close();
    }
    console.log('✓ published content is read from disk on demand');
}
