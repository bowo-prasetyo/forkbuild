import { IpfsNodeConfiguration } from '../core/IpfsNodeConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { IpfsNodeConfigurationStore } from '../storage/IpfsNodeConfigurationStore.js';

// User-Configurable IPFS Node API URL Persistence.
// Mirrors tests/IpfsGatewayConfigurationPersistence.test.js's own structure
// exactly, one field, no gatewayUrls-style list.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

class ThrowingStorageProvider extends StorageProvider {
    save() { throw new Error('storage backend unavailable'); }
    load() { throw new Error('storage backend unavailable'); }
    remove() { throw new Error('storage backend unavailable'); }
    list() { return []; }
}

async function run() {
    // ===============================================================
    // Section A — round-trip: save() then get() preserves apiUrl.
    // ===============================================================
    {
        const store = new IpfsNodeConfigurationStore(new InMemoryStorageProvider());
        const original = new IpfsNodeConfiguration({ apiUrl: 'https://remote-node.example:5001' });
        store.save(original);

        const loaded = store.get();
        assert(loaded instanceof IpfsNodeConfiguration, 'A1. get() returns a real IpfsNodeConfiguration instance');
        assert(loaded !== original, 'A2. the reloaded instance is a NEW object, never the same reference');
        assert(loaded.apiUrl === 'https://remote-node.example:5001', 'A3. apiUrl survives the round trip');
        assert(loaded.equals(original), 'A4. the reloaded configuration is value-equal to the original');
        console.log('✓ Section A: save() then get() round-trips apiUrl through a real, independently constructed IpfsNodeConfiguration instance');
    }

    // ===============================================================
    // Section B — absence: get() returns null when nothing is on file.
    // ===============================================================
    {
        const store = new IpfsNodeConfigurationStore(new InMemoryStorageProvider());
        assert(store.get() === null, 'B1. get() returns null when nothing has been saved — never a default-injected instance');
        console.log('✓ Section B: get() returns null, never a default, when nothing is on file');
    }

    // ===============================================================
    // Section C — replacement: a second save() replaces the first.
    // ===============================================================
    {
        const store = new IpfsNodeConfigurationStore(new InMemoryStorageProvider());
        store.save(new IpfsNodeConfiguration({ apiUrl: 'http://127.0.0.1:5001' }));
        store.save(new IpfsNodeConfiguration({ apiUrl: 'https://remote-node.example:5001' }));

        const loaded = store.get();
        assert(loaded.apiUrl === 'https://remote-node.example:5001', 'C1. the second save() replaces the first, never accumulating');
        console.log('✓ Section C: a second save() replaces the first entry');
    }

    // ===============================================================
    // Section D — clear(): the one way back to "no override."
    // ===============================================================
    {
        const store = new IpfsNodeConfigurationStore(new InMemoryStorageProvider());
        store.save(new IpfsNodeConfiguration({ apiUrl: 'https://remote-node.example:5001' }));
        assert(store.get() !== null, 'D1. sanity: a configuration is on file before clear()');
        store.clear();
        assert(store.get() === null, 'D2. clear() removes the persisted configuration entirely');
        console.log('✓ Section D: clear() removes the persisted override, restoring "absent"');
    }

    // ===============================================================
    // Section E — malformed data degrades to "absent," never throws.
    // ===============================================================
    {
        const provider = new InMemoryStorageProvider();
        const store = new IpfsNodeConfigurationStore(provider);

        provider.save('ipfs-node-configuration', { apiUrl: 'not a url' });
        assert(store.get() === null, 'E1. an invalid apiUrl degrades to null');

        provider.save('ipfs-node-configuration', 'a plain string, not an object');
        assert(store.get() === null, 'E2. a non-object payload degrades to null');

        provider.save('ipfs-node-configuration', ['array', 'not', 'object']);
        assert(store.get() === null, 'E3. an array payload degrades to null');

        provider.save('ipfs-node-configuration', null);
        assert(store.get() === null, 'E4. a null payload degrades to null');
        console.log('✓ Section E: malformed persisted data degrades silently to "absent," never throws');
    }

    // ===============================================================
    // Section F — a genuine storage failure propagates, never degrades.
    // ===============================================================
    {
        const store = new IpfsNodeConfigurationStore(new ThrowingStorageProvider());
        expectThrows(() => store.get(), 'F1. a throwing provider\'s load() propagates out of get()');
        expectThrows(() => store.save(new IpfsNodeConfiguration({ apiUrl: 'http://127.0.0.1:5001' })), 'F2. a throwing provider\'s save() propagates out of save()');
        expectThrows(() => store.clear(), 'F3. a throwing provider\'s remove() propagates out of clear()');
        console.log('✓ Section F: a genuine storage backend failure propagates unmodified, never degrades like malformed data does');
    }

    // ===============================================================
    // Section G — constructor/save() input validation.
    // ===============================================================
    {
        expectThrows(() => new IpfsNodeConfigurationStore({ save() {}, load() {}, remove() {}, list() {} }), 'G1. a non-StorageProvider instance is refused at construction');
        const store = new IpfsNodeConfigurationStore(new InMemoryStorageProvider());
        expectThrows(() => store.save({ apiUrl: 'http://127.0.0.1:5001' }), 'G2. save() refuses a plain object, requiring a real IpfsNodeConfiguration instance');
        expectThrows(() => store.save(null), 'G3. save() refuses null');
        console.log('✓ Section G: construction and save() both refuse the wrong input shape');
    }

    console.log('\n✅ All User-Configurable IPFS Node API URL Persistence tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
