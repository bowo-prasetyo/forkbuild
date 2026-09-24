
import { BitcoinEsploraConfiguration, DEFAULT_BITCOIN_ESPLORA_API_URL } from '../core/BitcoinEsploraConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { BitcoinEsploraConfigurationStore } from '../storage/BitcoinEsploraConfigurationStore.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { readSource as source } from './support/SourceText.js';

// User-Configurable Bitcoin Esplora Endpoint Configuration Persistence.
// Mirrors tests/ArweaveGatewayConfigurationPersistence.test.js's own
// structure exactly, one field.
//
// Section A: round-trip — save() then get() preserves apiUrl
// Section B: replacement — a second save() replaces the first outright
// Section C: restart semantics — a fresh store instance over the same
//            underlying storage reconstructs the configuration
// Section D: absence — a never-written store returns null, never a
//            fabricated BitcoinEsploraConfiguration holding the default
// Section E: clear() — removes any persisted override, returning to "absent"
// Section F: malformed data — degrades to absence, never an invalid object
// Section G: storage failure — a genuinely throwing provider propagates
// Section H: effective-endpoint resolution — the exact "absent -> default,
//            present -> override" pattern ui/main.js applies
// Section I: architecture sweep — no provider imports, no registry, no UI

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

class ThrowingStorageProvider extends StorageProvider {
    save() { throw new Error('storage backend unavailable'); }
    load() { throw new Error('storage backend unavailable'); }
    remove() { throw new Error('storage backend unavailable'); }
    list() { return []; }
}

async function run() {
    // ===============================================================
    // Section A — round-trip.
    // ===============================================================
    {
        const store = new BitcoinEsploraConfigurationStore(new InMemoryStorageProvider());
        const original = new BitcoinEsploraConfiguration({ apiUrl: 'https://my-esplora-host.example/api' });
        store.save(original);

        const loaded = store.get();
        assert(loaded instanceof BitcoinEsploraConfiguration, 'A1. get() returns a real BitcoinEsploraConfiguration instance');
        assert(loaded !== original, 'A2. the reloaded instance is a NEW object, never the same reference');
        assert(loaded.apiUrl === 'https://my-esplora-host.example/api', 'A3. apiUrl survives the round trip');
        assert(loaded.equals(original), 'A4. the reloaded configuration is value-equal to the original');
        console.log('✓ Section A: save() then get() round-trips apiUrl through a real, independently constructed instance');
    }

    // ===============================================================
    // Section B — replacement.
    // ===============================================================
    {
        const store = new BitcoinEsploraConfigurationStore(new InMemoryStorageProvider());
        store.save(new BitcoinEsploraConfiguration({ apiUrl: 'https://first-host.example/api' }));
        assert(store.get().apiUrl === 'https://first-host.example/api', 'B1. the first save is visible before the second');

        store.save(new BitcoinEsploraConfiguration({ apiUrl: 'https://second-host.example/api' }));
        assert(store.get().apiUrl === 'https://second-host.example/api', 'B2. the second save REPLACES the first outright');
        console.log('✓ Section B: saving a new apiUrl replaces the previous one outright');
    }

    // ===============================================================
    // Section C — restart semantics.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const store1 = new BitcoinEsploraConfigurationStore(storage);
        store1.save(new BitcoinEsploraConfiguration({ apiUrl: 'https://my-esplora-host.example/api' }));

        const store2 = new BitcoinEsploraConfigurationStore(storage);
        assert(store2.get().apiUrl === 'https://my-esplora-host.example/api', 'C1. a fresh store instance over the same storage sees the previously saved configuration');

        store2.save(new BitcoinEsploraConfiguration({ apiUrl: 'https://another-host.example/api' }));
        const store3 = new BitcoinEsploraConfigurationStore(storage);
        assert(store3.get().apiUrl === 'https://another-host.example/api', 'C2. a write from the restarted instance is durable for a subsequent instance too');
        console.log('✓ Section C: a new store instance over the same storage reconstructs the previously saved configuration');
    }

    // ===============================================================
    // Section D — absence.
    // ===============================================================
    {
        const store = new BitcoinEsploraConfigurationStore(new InMemoryStorageProvider());
        const result = store.get();
        assert(result === null, 'D1. get() against a never-written store returns null');
        assert(result !== DEFAULT_BITCOIN_ESPLORA_API_URL, 'D2. null is genuinely null — never disguised as the default URL string');
        console.log('✓ Section D: "no configuration saved" is a real null, never a fabricated configuration holding the deployment default');
    }

    // ===============================================================
    // Section E — clear().
    // ===============================================================
    {
        const store = new BitcoinEsploraConfigurationStore(new InMemoryStorageProvider());
        store.save(new BitcoinEsploraConfiguration({ apiUrl: 'https://my-esplora-host.example/api' }));
        assert(store.get() !== null, 'E1. a configuration is on file before clear()');

        store.clear();
        assert(store.get() === null, 'E2. clear() removes the persisted override — get() returns null again');

        store.clear();
        assert(store.get() === null, 'E3. clearing an already-empty store is a no-op, not an error');
        console.log('✓ Section E: clear() is the one explicit way back to "no override, use the deployment default"');
    }

    // ===============================================================
    // Section F — malformed data.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        storage.save('bitcoin-esplora-configuration', { apiUrl: 'not-a-valid-url' });
        const store = new BitcoinEsploraConfigurationStore(storage);
        assert(store.get() === null, 'F1. an entry whose apiUrl fails shape validation degrades to null, never a thrown error');

        const storage2 = new InMemoryStorageProvider();
        storage2.save('bitcoin-esplora-configuration', { notApiUrl: 'https://blockstream.info/api' });
        assert(new BitcoinEsploraConfigurationStore(storage2).get() === null, 'F2. a wrong-shape object (missing apiUrl) degrades to null');

        const storage3 = new InMemoryStorageProvider();
        storage3.save('bitcoin-esplora-configuration', ['not', 'an', 'object']);
        assert(new BitcoinEsploraConfigurationStore(storage3).get() === null, 'F3. a non-object payload (an array) degrades to null');

        const storage4 = new InMemoryStorageProvider();
        storage4.save('bitcoin-esplora-configuration', 'https://blockstream.info/api');
        assert(new BitcoinEsploraConfigurationStore(storage4).get() === null, 'F4. a bare string payload (not even an object) degrades to null');

        const store5 = new BitcoinEsploraConfigurationStore(new InMemoryStorageProvider());
        assert(store5.get() === null, 'F5. a store with nothing ever saved returns null, not a thrown error');
        console.log('✓ Section F: malformed or absent persisted data degrades to "no configuration"');
    }

    // ===============================================================
    // Section G — storage failure.
    // ===============================================================
    {
        const store = new BitcoinEsploraConfigurationStore(new ThrowingStorageProvider());
        expectThrows(() => store.get(), 'G1. get() propagates a genuine storage failure rather than degrading to null');
        expectThrows(() => store.save(new BitcoinEsploraConfiguration({ apiUrl: 'https://blockstream.info/api' })), 'G2. save() propagates a genuine storage failure rather than silently no-oping');
        expectThrows(() => store.clear(), 'G3. clear() propagates a genuine storage failure rather than silently no-oping');
        console.log('✓ Section G: a StorageProvider that genuinely throws propagates that failure out of save()/get()/clear()');
    }

    // ===============================================================
    // Section H — effective-endpoint resolution.
    // ===============================================================
    {
        function resolveEffectiveApiUrl(store) {
            const configuration = store.get();
            return configuration ? configuration.apiUrl : DEFAULT_BITCOIN_ESPLORA_API_URL;
        }

        const storeWithNoOverride = new BitcoinEsploraConfigurationStore(new InMemoryStorageProvider());
        assert(resolveEffectiveApiUrl(storeWithNoOverride) === DEFAULT_BITCOIN_ESPLORA_API_URL, 'H1. with no saved configuration, the effective endpoint is the deployment default');

        const storeWithOverride = new BitcoinEsploraConfigurationStore(new InMemoryStorageProvider());
        storeWithOverride.save(new BitcoinEsploraConfiguration({ apiUrl: 'https://my-esplora-host.example/api' }));
        assert(resolveEffectiveApiUrl(storeWithOverride) === 'https://my-esplora-host.example/api', 'H2. with a saved configuration, the effective endpoint is the user\'s own override');

        storeWithOverride.clear();
        assert(resolveEffectiveApiUrl(storeWithOverride) === DEFAULT_BITCOIN_ESPLORA_API_URL, 'H3. after clear(), the effective endpoint falls back to the deployment default again');
        console.log('✓ Section H: "absent preference -> deployment default, present preference -> explicit override" resolves correctly');
    }

    // ===============================================================
    // Section I — architecture sweep.
    // ===============================================================
    {
        const storeSource = await source('storage/BitcoinEsploraConfigurationStore.js');
        const forbiddenImportPattern = /^import\b[^\n]*from\s*['"][^'"]*(nostr|arweave|ipfs|anchoring|content\/|discovery\/|base\/|ui\/)[^'"]*['"]/im;
        assert(!forbiddenImportPattern.test(storeSource), 'I1. imports no other endpoint/anchoring/content/discovery/ui module');
        const importLines = storeSource.split('\n').filter((line) => /^import\b/.test(line));
        assert(importLines.length === 3, 'I2. exactly three imports — its own StorageProvider/LocalStorageProvider pair, and this configuration/validator pair from one file');
        assert(!/registry/i.test(storeSource.replace(/\/\/.*$/gm, '')), 'I3. the word "registry" never appears in this file\'s own executable code');
        assert(typeof window === 'undefined' && typeof document === 'undefined', 'I4. this test runs under plain node, confirming the store never implicitly depends on a browser global');
        console.log('✓ Section I: architecture sweep confirms no cross-substrate import, no registry consultation, and no UI dependency');
    }

    console.log('\n✅ All User-Configurable Bitcoin Esplora Endpoint Configuration Persistence tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
