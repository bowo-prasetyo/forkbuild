import { readFile } from 'node:fs/promises';

import { ArweaveGatewayConfiguration, DEFAULT_ARWEAVE_GATEWAY_URL } from '../core/ArweaveGatewayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';

// 0.9.364 — User-Configurable Arweave Gateway Configuration Persistence.
// See docs/Roadmap.md, "0.9.364 — User-Configurable Arweave Gateway," and
// storage/ArweaveGatewayConfigurationStore.js (this same milestone), the
// boundary this file gives a durable home — mirroring tests/
// DecentralizedRoleProviderPreferencePersistence.test.js's own structure
// for storage/RoleProviderPreferenceStore.js, one field instead of a
// per-role map.
//
// Section A: round-trip — save() then get() preserves gatewayUrl
// Section B: replacement — a second save() replaces the first outright
// Section C: restart semantics — a fresh store instance over the same
//            underlying storage reconstructs the configuration
// Section D: absence — a never-written store returns null, never a
//            fabricated ArweaveGatewayConfiguration holding the default
// Section E: clear() — removes any persisted override, returning to
//            "absent"
// Section F: malformed data — degrades to absence, never an invalid object
// Section G: storage failure — a genuinely throwing provider propagates
// Section H: effective-gateway resolution — the exact "absent -> default,
//            present -> override" pattern a caller (ui/main.js) applies
// Section I: architecture sweep — no provider imports, no registry, no UI

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

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    // ===============================================================
    // Section A — round-trip: save() then get() preserves gatewayUrl.
    // ===============================================================
    {
        const store = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        const original = new ArweaveGatewayConfiguration({ gatewayUrl: 'https://my-gateway.example' });
        store.save(original);

        const loaded = store.get();
        assert(loaded instanceof ArweaveGatewayConfiguration, 'A1. get() returns a real ArweaveGatewayConfiguration instance');
        assert(loaded !== original, 'A2. the reloaded instance is a NEW object, never the same reference');
        assert(loaded.gatewayUrl === 'https://my-gateway.example', 'A3. gatewayUrl survives the round trip');
        assert(loaded.equals(original), 'A4. the reloaded configuration is value-equal to the original');
        console.log('✓ Section A: save() then get() round-trips gatewayUrl through a real, independently constructed ArweaveGatewayConfiguration instance');
    }

    // ===============================================================
    // Section B — replacement: a second save() replaces the first
    // outright, never accumulates a second entry.
    // ===============================================================
    {
        const store = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        store.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://first-gateway.example' }));
        assert(store.get().gatewayUrl === 'https://first-gateway.example', 'B1. the first save is visible before the second');

        store.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://second-gateway.example' }));
        assert(store.get().gatewayUrl === 'https://second-gateway.example', 'B2. the second save REPLACES the first outright');
        console.log('✓ Section B: saving a new gatewayUrl replaces the previous one outright — one current configuration, never a log');
    }

    // ===============================================================
    // Section C — restart semantics: a fresh store instance over the
    // same underlying storage reconstructs the configuration.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const store1 = new ArweaveGatewayConfigurationStore(storage);
        store1.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://my-gateway.example' }));

        const store2 = new ArweaveGatewayConfigurationStore(storage);
        assert(store2.get().gatewayUrl === 'https://my-gateway.example', 'C1. a fresh store instance over the same storage sees the previously saved configuration');

        store2.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://another-gateway.example' }));
        const store3 = new ArweaveGatewayConfigurationStore(storage);
        assert(store3.get().gatewayUrl === 'https://another-gateway.example', 'C2. a write from the restarted instance is durable for a subsequent instance too');
        console.log('✓ Section C: a new store instance over the same storage namespace reconstructs the previously saved configuration, exactly like an application restart');
    }

    // ===============================================================
    // Section D — absence: a never-written store returns null, never a
    // fabricated configuration holding the deployment default.
    // ===============================================================
    {
        const store = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        const result = store.get();
        assert(result === null, 'D1. get() against a never-written store returns null');
        assert(result !== DEFAULT_ARWEAVE_GATEWAY_URL, 'D2. null is genuinely null — never disguised as the default URL string');
        console.log('✓ Section D: "no configuration saved" is a real null, never a fabricated ArweaveGatewayConfiguration holding the deployment default');
    }

    // ===============================================================
    // Section E — clear(): removes any persisted override, returning to
    // "absent."
    // ===============================================================
    {
        const store = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        store.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://my-gateway.example' }));
        assert(store.get() !== null, 'E1. a configuration is on file before clear()');

        store.clear();
        assert(store.get() === null, 'E2. clear() removes the persisted override — get() returns null again');

        // clear() on an already-empty store is a harmless no-op, never a throw.
        store.clear();
        assert(store.get() === null, 'E3. clearing an already-empty store is a no-op, not an error');
        console.log('✓ Section E: clear() is the one explicit way back to "no override, use the deployment default"');
    }

    // ===============================================================
    // Section F — malformed data: degrades to absence, never an invalid
    // domain object and never a thrown error.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        storage.save('arweave-gateway-configuration', { gatewayUrl: 'not-a-valid-url' });
        const store = new ArweaveGatewayConfigurationStore(storage);
        assert(store.get() === null, 'F1. an entry whose gatewayUrl fails shape validation degrades to null, never a thrown error');

        const storage2 = new InMemoryStorageProvider();
        storage2.save('arweave-gateway-configuration', { notGatewayUrl: 'https://arweave.net' });
        assert(new ArweaveGatewayConfigurationStore(storage2).get() === null, 'F2. a wrong-shape object (missing gatewayUrl) degrades to null');

        const storage3 = new InMemoryStorageProvider();
        storage3.save('arweave-gateway-configuration', ['not', 'an', 'object']);
        assert(new ArweaveGatewayConfigurationStore(storage3).get() === null, 'F3. a non-object payload (an array) degrades to null, never a thrown error');

        const storage4 = new InMemoryStorageProvider();
        storage4.save('arweave-gateway-configuration', 'https://arweave.net');
        assert(new ArweaveGatewayConfigurationStore(storage4).get() === null, 'F4. a bare string payload (not even an object) degrades to null');

        const store5 = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        assert(store5.get() === null, 'F5. a store with nothing ever saved returns null, not a thrown error');
        console.log('✓ Section F: malformed or absent persisted data degrades to "no configuration" — get() never hands back an invalid ArweaveGatewayConfiguration and never throws over bad bytes');
    }

    // ===============================================================
    // Section G — storage failure: a provider that genuinely throws
    // propagates out of this class, never mistaken for "no configuration."
    // ===============================================================
    {
        const store = new ArweaveGatewayConfigurationStore(new ThrowingStorageProvider());
        expectThrows(() => store.get(), 'G1. get() propagates a genuine storage failure rather than degrading to null');
        expectThrows(() => store.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://arweave.net' })), 'G2. save() propagates a genuine storage failure rather than silently no-oping');
        expectThrows(() => store.clear(), 'G3. clear() propagates a genuine storage failure rather than silently no-oping');
        console.log('✓ Section G: a StorageProvider that genuinely throws propagates that failure out of save()/get()/clear() unmodified — a real backend failure is never mistaken for "nothing configured yet"');
    }

    // ===============================================================
    // Section H — effective-gateway resolution: the exact "absent ->
    // default, present -> override" pattern a caller (ui/main.js) applies,
    // exercised here directly against the store/constant this milestone
    // ships, never against a guess at what the composition root does.
    // ===============================================================
    {
        function resolveEffectiveGatewayUrl(store) {
            const configuration = store.get();
            return configuration ? configuration.gatewayUrl : DEFAULT_ARWEAVE_GATEWAY_URL;
        }

        const storeWithNoOverride = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        assert(resolveEffectiveGatewayUrl(storeWithNoOverride) === DEFAULT_ARWEAVE_GATEWAY_URL, 'H1. with no saved configuration, the effective gateway is the deployment default');

        const storeWithOverride = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        storeWithOverride.save(new ArweaveGatewayConfiguration({ gatewayUrl: 'https://my-arweave-gateway.example' }));
        assert(resolveEffectiveGatewayUrl(storeWithOverride) === 'https://my-arweave-gateway.example', 'H2. with a saved configuration, the effective gateway is the user\'s own override — an explicit replacement, never merged with the default');

        storeWithOverride.clear();
        assert(resolveEffectiveGatewayUrl(storeWithOverride) === DEFAULT_ARWEAVE_GATEWAY_URL, 'H3. after clear(), the effective gateway falls back to the deployment default again');
        console.log('✓ Section H: "absent preference -> deployment default, present preference -> explicit override, never a merge" resolves correctly through this store\'s own public surface');
    }

    // ===============================================================
    // Section I — architecture sweep: no provider imports, no registry
    // consultation, no UI dependency, run against the real source file,
    // never a guess from this file's own prose.
    // ===============================================================
    {
        const storeSource = await source('storage/ArweaveGatewayConfigurationStore.js');
        const forbiddenImportPattern = /^import\b[^\n]*from\s*['"][^'"]*(nostr|arweave\/|ipfs|bitcoin|anchoring|content\/|discovery\/|base\/|ui\/)[^'"]*['"]/im;
        assert(!forbiddenImportPattern.test(storeSource), 'I1. storage/ArweaveGatewayConfigurationStore.js imports no provider implementation, no content/anchoring/discovery module, and no ui/ module');
        const importLines = storeSource.split('\n').filter((line) => /^import\b/.test(line));
        assert(importLines.length === 3, 'I2. exactly three imports — its own StorageProvider/LocalStorageProvider pair, and this milestone\'s ArweaveGatewayConfiguration/isValidArweaveGatewayUrl pair from one file — no other collaborator of any kind');
        assert(!/registry/i.test(storeSource.replace(/\/\/.*$/gm, '')), 'I3. the word "registry" never appears in this file\'s own executable code');
        assert(typeof window === 'undefined' && typeof document === 'undefined', 'I4. this test runs under plain node, with no browser globals present, confirming the store never implicitly depends on one');
        console.log('✓ Section I: architecture sweep of the real source file confirms no provider import, no registry consultation, and no UI dependency');
    }

    console.log('\n✅ All User-Configurable Arweave Gateway Configuration Persistence tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
