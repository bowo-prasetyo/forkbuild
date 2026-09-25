// @environment browser
import { IndexedDbStorageBackend } from '../storage/IndexedDbStorageBackend.js';
import { LocalStorageProvider, installLocalStorageBackend, flushLocalStorage } from '../storage/LocalStorageProvider.js';
import { openBrowserStorage } from '../storage/openBrowserStorage.js';
import { assert } from './support/Assert.js';

// IndexedDbStorageBackend against the browser's real IndexedDB: data
// survives reopening, localStorage data is moved in, a value too large for
// localStorage fits, and two open copies (two tabs) stay in step. The
// batching and failure logic is covered in Node by
// tests/IndexedDbStorageBackend.test.js.

let databaseCount = 0;
const freshDatabaseName = () => `forkbuild-test-${Date.now()}-${databaseCount++}`;
const waitFor = async (condition, what) => {
    for (let i = 0; i < 100; i++) {
        if (condition()) return;
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    throw new Error(`timed out waiting for ${what}`);
};

// A localStorage stand-in, so the page's real one is never touched.
function memoryLocalStorage(initial) {
    const items = new Map(Object.entries(initial));
    return {
        items,
        get length() { return items.size; },
        key: (i) => [...items.keys()][i] ?? null,
        getItem: (k) => (items.has(k) ? items.get(k) : null),
        setItem: (k, v) => items.set(k, String(v)),
        removeItem: (k) => items.delete(k)
    };
}

// Writes survive closing and reopening the database.
{
    const databaseName = freshDatabaseName();
    const first = await IndexedDbStorageBackend.open({ databaseName, localStorage: null });
    assert(first.keys().length === 0, 'a new database is empty');
    first.setItem('doc', '{"bricks":[1,2]}');
    first.setItem('temp', '1');
    first.removeItem('temp');
    await first.flush();
    first.close();
    const second = await IndexedDbStorageBackend.open({ databaseName, localStorage: null });
    assert(second.getItem('doc') === '{"bricks":[1,2]}' && second.keys().join() === 'doc', 'reopening reads back what was stored');
    second.close();
    console.log('✓ data survives reopening IndexedDB');
}

// localStorage data is moved into IndexedDB and removed from localStorage;
// other scripts' keys are left alone.
{
    const databaseName = freshDatabaseName();
    const seeded = await IndexedDbStorageBackend.open({ databaseName, localStorage: null });
    seeded.setItem('doc', '"stale"');
    await seeded.flush();
    seeded.close();
    const localStorage = memoryLocalStorage({
        'forkbuild:doc': '"newer"',
        'forkbuild:forkbuild-index': '[{"id":"doc"}]',
        'another-app': 'keep me'
    });
    const backend = await IndexedDbStorageBackend.open({ databaseName, localStorage });
    assert(backend.getItem('doc') === '"newer"', 'a localStorage value replaces IndexedDB\'s under the same name');
    assert(backend.getItem('forkbuild-index') === '[{"id":"doc"}]', 'every forkbuild: entry is moved, without its prefix');
    assert(localStorage.items.size === 1 && localStorage.items.get('another-app') === 'keep me', 'moved entries leave localStorage; other keys stay');
    backend.close();
    const reopened = await IndexedDbStorageBackend.open({ databaseName, localStorage });
    assert(reopened.getItem('doc') === '"newer"', 'the moved data is stored, not only in memory');
    reopened.close();
    console.log('✓ localStorage data is moved into IndexedDB');
}

// A document larger than localStorage's quota (~5 MB) is stored.
{
    const databaseName = freshDatabaseName();
    const backend = await IndexedDbStorageBackend.open({ databaseName, localStorage: null });
    const big = JSON.stringify({ bricks: 'x'.repeat(12 * 1024 * 1024) });
    backend.setItem('big', big);
    await backend.flush();
    backend.close();
    const reopened = await IndexedDbStorageBackend.open({ databaseName, localStorage: null });
    assert(reopened.getItem('big') === big, 'a 12 MB entry is stored and read back');
    reopened.close();
    console.log('✓ entries larger than localStorage allows are stored');
}

// Two open copies of the same database (two tabs) see each other's writes.
{
    const databaseName = freshDatabaseName();
    const tabA = await IndexedDbStorageBackend.open({ databaseName, localStorage: null });
    const tabB = await IndexedDbStorageBackend.open({ databaseName, localStorage: null });
    tabA.setItem('friends', '["x"]');
    await tabA.flush();
    await waitFor(() => tabB.getItem('friends') === '["x"]', 'tab B to see tab A\'s write');
    tabB.removeItem('friends');
    await tabB.flush();
    await waitFor(() => tabA.getItem('friends') === null, 'tab A to see tab B\'s removal');
    tabA.close();
    tabB.close();
    console.log('✓ two tabs stay in step');
}

// openBrowserStorage() installs the backend under LocalStorageProvider.
{
    const backend = await openBrowserStorage({ databaseName: freshDatabaseName(), localStorage: null });
    try {
        assert(backend instanceof IndexedDbStorageBackend, 'IndexedDB opens in a real browser');
        const provider = new LocalStorageProvider();
        provider.save('doc', { title: 'Tower' });
        assert(provider.load('doc').title === 'Tower', 'LocalStorageProvider reads and writes through it');
        await flushLocalStorage();
    } finally {
        installLocalStorageBackend(null);
        backend && backend.close();
    }
    console.log('✓ openBrowserStorage() puts LocalStorageProvider on IndexedDB');
}
