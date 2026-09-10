import { readFile } from 'node:fs/promises';

import { NostrRelayConfiguration, DEFAULT_NOSTR_RELAY_URL } from '../core/NostrRelayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';

// 0.9.369 — Nostr Relay Configuration Persistence.
// See docs/Roadmap.md, "0.9.369 — Nostr Relay Configuration Boundary," and
// storage/NostrRelayConfigurationStore.js (this same milestone), the
// boundary this file gives a durable home — the direct structural mirror
// of tests/ArweaveGatewayConfigurationPersistence.test.js, one relay URL
// instead of one gateway URL.
//
// Section A: round-trip — save() then get() preserves relayUrl
// Section B: replacement — a second save() replaces the first outright
// Section C: restart semantics — a fresh store instance over the same
//            underlying storage reconstructs the configuration
// Section D: absence — a never-written store returns null, never a
//            fabricated NostrRelayConfiguration holding the default
// Section E: clear() — removes any persisted override, returning to
//            "absent"
// Section F: malformed data — degrades to absence, never an invalid object
// Section G: storage failure — a genuinely throwing provider propagates
// Section H: effective-relay resolution — the exact "absent -> default,
//            present -> override" pattern a caller (ui/main.js) applies
// Section I: architecture sweep — a dedicated storage key distinct from
//            ArweaveGatewayConfigurationStore's own, no provider imports,
//            no registry, no UI

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
    // Section A — round-trip: save() then get() preserves relayUrl.
    // ===============================================================
    {
        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        const original = new NostrRelayConfiguration({ relayUrl: 'wss://my-relay.example' });
        store.save(original);

        const loaded = store.get();
        assert(loaded instanceof NostrRelayConfiguration, 'A1. get() returns a real NostrRelayConfiguration instance');
        assert(loaded !== original, 'A2. the reloaded instance is a NEW object, never the same reference');
        assert(loaded.relayUrl === 'wss://my-relay.example', 'A3. relayUrl survives the round trip');
        assert(loaded.equals(original), 'A4. the reloaded configuration is value-equal to the original');
        console.log('✓ Section A: save() then get() round-trips relayUrl through a real, independently constructed NostrRelayConfiguration instance');
    }

    // ===============================================================
    // Section B — replacement: a second save() replaces the first
    // outright, never accumulates a second entry.
    // ===============================================================
    {
        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        store.save(new NostrRelayConfiguration({ relayUrl: 'wss://first-relay.example' }));
        assert(store.get().relayUrl === 'wss://first-relay.example', 'B1. the first save is visible before the second');

        store.save(new NostrRelayConfiguration({ relayUrl: 'wss://second-relay.example' }));
        assert(store.get().relayUrl === 'wss://second-relay.example', 'B2. the second save REPLACES the first outright');
        console.log('✓ Section B: saving a new relayUrl replaces the previous one outright — one current configuration, never a log');
    }

    // ===============================================================
    // Section C — restart semantics: a fresh store instance over the
    // same underlying storage reconstructs the configuration.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const store1 = new NostrRelayConfigurationStore(storage);
        store1.save(new NostrRelayConfiguration({ relayUrl: 'wss://my-relay.example' }));

        const store2 = new NostrRelayConfigurationStore(storage);
        assert(store2.get().relayUrl === 'wss://my-relay.example', 'C1. a fresh store instance over the same storage sees the previously saved configuration');

        store2.save(new NostrRelayConfiguration({ relayUrl: 'wss://another-relay.example' }));
        const store3 = new NostrRelayConfigurationStore(storage);
        assert(store3.get().relayUrl === 'wss://another-relay.example', 'C2. a write from the restarted instance is durable for a subsequent instance too');
        console.log('✓ Section C: a new store instance over the same storage namespace reconstructs the previously saved configuration, exactly like an application restart');
    }

    // ===============================================================
    // Section D — absence: a never-written store returns null, never a
    // fabricated configuration holding the deployment default.
    // ===============================================================
    {
        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        const result = store.get();
        assert(result === null, 'D1. get() against a never-written store returns null');
        assert(result !== DEFAULT_NOSTR_RELAY_URL, 'D2. null is genuinely null — never disguised as the default URL string');
        console.log('✓ Section D: "no configuration saved" is a real null, never a fabricated NostrRelayConfiguration holding the deployment default');
    }

    // ===============================================================
    // Section E — clear(): removes any persisted override, returning to
    // "absent."
    // ===============================================================
    {
        const store = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        store.save(new NostrRelayConfiguration({ relayUrl: 'wss://my-relay.example' }));
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
        storage.save('nostr-relay-configuration', { relayUrl: 'not-a-valid-url' });
        const store = new NostrRelayConfigurationStore(storage);
        assert(store.get() === null, 'F1. an entry whose relayUrl fails shape validation degrades to null, never a thrown error');

        const storage1b = new InMemoryStorageProvider();
        storage1b.save('nostr-relay-configuration', { relayUrl: 'https://relay.damus.io' });
        assert(new NostrRelayConfigurationStore(storage1b).get() === null, 'F1b. an entry whose relayUrl is an http(s) URL (wrong scheme family) degrades to null');

        const storage2 = new InMemoryStorageProvider();
        storage2.save('nostr-relay-configuration', { notRelayUrl: 'wss://relay.damus.io' });
        assert(new NostrRelayConfigurationStore(storage2).get() === null, 'F2. a wrong-shape object (missing relayUrl) degrades to null');

        const storage3 = new InMemoryStorageProvider();
        storage3.save('nostr-relay-configuration', ['not', 'an', 'object']);
        assert(new NostrRelayConfigurationStore(storage3).get() === null, 'F3. a non-object payload (an array) degrades to null, never a thrown error');

        const storage4 = new InMemoryStorageProvider();
        storage4.save('nostr-relay-configuration', 'wss://relay.damus.io');
        assert(new NostrRelayConfigurationStore(storage4).get() === null, 'F4. a bare string payload (not even an object) degrades to null');

        const store5 = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        assert(store5.get() === null, 'F5. a store with nothing ever saved returns null, not a thrown error');
        console.log('✓ Section F: malformed or absent persisted data degrades to "no configuration" — get() never hands back an invalid NostrRelayConfiguration and never throws over bad bytes');
    }

    // ===============================================================
    // Section G — storage failure: a provider that genuinely throws
    // propagates out of this class, never mistaken for "no configuration."
    // ===============================================================
    {
        const store = new NostrRelayConfigurationStore(new ThrowingStorageProvider());
        expectThrows(() => store.get(), 'G1. get() propagates a genuine storage failure rather than degrading to null');
        expectThrows(() => store.save(new NostrRelayConfiguration({ relayUrl: 'wss://relay.damus.io' })), 'G2. save() propagates a genuine storage failure rather than silently no-oping');
        expectThrows(() => store.clear(), 'G3. clear() propagates a genuine storage failure rather than silently no-oping');
        console.log('✓ Section G: a StorageProvider that genuinely throws propagates that failure out of save()/get()/clear() unmodified — a real backend failure is never mistaken for "nothing configured yet"');
    }

    // ===============================================================
    // Section H — effective-relay resolution: the exact "absent -> default,
    // present -> override" pattern a caller (ui/main.js) applies, exercised
    // here directly against the store/constant this milestone ships, never
    // against a guess at what the composition root does.
    // ===============================================================
    {
        function resolveEffectiveRelayUrl(store) {
            const configuration = store.get();
            return configuration ? configuration.relayUrl : DEFAULT_NOSTR_RELAY_URL;
        }

        const storeWithNoOverride = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        assert(resolveEffectiveRelayUrl(storeWithNoOverride) === DEFAULT_NOSTR_RELAY_URL, 'H1. with no saved configuration, the effective relay is the deployment default');

        const storeWithOverride = new NostrRelayConfigurationStore(new InMemoryStorageProvider());
        storeWithOverride.save(new NostrRelayConfiguration({ relayUrl: 'wss://my-nostr-relay.example' }));
        assert(resolveEffectiveRelayUrl(storeWithOverride) === 'wss://my-nostr-relay.example', 'H2. with a saved configuration, the effective relay is the user\'s own override — an explicit replacement, never merged with the default');

        storeWithOverride.clear();
        assert(resolveEffectiveRelayUrl(storeWithOverride) === DEFAULT_NOSTR_RELAY_URL, 'H3. after clear(), the effective relay falls back to the deployment default again');
        console.log('✓ Section H: "absent preference -> deployment default, present preference -> explicit override, never a merge" resolves correctly through this store\'s own public surface');
    }

    // ===============================================================
    // Section I — architecture sweep: a dedicated storage key distinct
    // from ArweaveGatewayConfigurationStore's own, no provider imports, no
    // registry consultation, no UI dependency — run against the real
    // source file, never a guess from this file's own prose.
    // ===============================================================
    {
        const storeSource = await source('storage/NostrRelayConfigurationStore.js');
        const storeExecutable = storeSource.replace(/\/\/.*$/gm, '');
        assert(storeSource.includes("'nostr-relay-configuration'"), 'I1. the store owns its own storage key literal');
        assert(!storeExecutable.includes('arweave-gateway-configuration'), 'I2. the store\'s own executable code never references ArweaveGatewayConfigurationStore\'s own storage key (this file\'s own header prose may name it for documentation, but no import or logic does)');
        assert(!/ArweaveGatewayConfiguration/.test(storeExecutable), 'I3. the store\'s own executable code never imports or references ArweaveGatewayConfiguration/ArweaveGatewayConfigurationStore of any kind — two deliberately unconnected configuration systems');

        const importLines = storeSource.split('\n').filter((line) => /^import\b/.test(line));
        const forbiddenImportPattern = /^import\b[^\n]*from\s*['"][^'"]*(arweave|ipfs|bitcoin|anchoring|content\/|discovery\/|base\/|ui\/)[^'"]*['"]/im;
        assert(!importLines.some((line) => forbiddenImportPattern.test(line)), 'I4. storage/NostrRelayConfigurationStore.js imports no provider implementation, no content/anchoring/discovery module, and no ui/ module');
        assert(importLines.length === 3, 'I5. exactly three imports — its own StorageProvider/LocalStorageProvider pair, and this milestone\'s NostrRelayConfiguration/isValidNostrRelayUrl pair from one file — no other collaborator of any kind');
        assert(!/registry/i.test(storeExecutable), 'I6. the word "registry" never appears in this file\'s own executable code');
        assert(typeof window === 'undefined' && typeof document === 'undefined', 'I7. this test runs under plain node, with no browser globals present, confirming the store never implicitly depends on one');
        console.log('✓ Section I: architecture sweep of the real source file confirms a dedicated storage key, no provider import, no registry consultation, no UI dependency, and no reference to ArweaveGatewayConfigurationStore');
    }

    console.log('\n✅ All Nostr Relay Configuration Persistence tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
