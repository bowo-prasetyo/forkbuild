
import { IpfsGatewayConfiguration, DEFAULT_IPFS_GATEWAY_URL } from '../core/IpfsGatewayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { IpfsGatewayConfigurationStore } from '../storage/IpfsGatewayConfigurationStore.js';
import { mainFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { readSource as source } from './support/SourceText.js';

// 0.9.665 — User-Configurable IPFS Gateway Configuration Persistence.
// Mirrors tests/ArweaveGatewayConfigurationPersistence.test.js's own
// structure exactly, one field instead of a per-role map, no gatewayUrls
// list (see core/IpfsGatewayConfiguration.js's own header).

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
    // Section A — round-trip: save() then get() preserves gatewayUrl.
    // ===============================================================
    {
        const store = new IpfsGatewayConfigurationStore(new InMemoryStorageProvider());
        const original = new IpfsGatewayConfiguration({ gatewayUrl: 'https://gateway.pinata.cloud' });
        store.save(original);

        const loaded = store.get();
        assert(loaded instanceof IpfsGatewayConfiguration, 'A1. get() returns a real IpfsGatewayConfiguration instance');
        assert(loaded !== original, 'A2. the reloaded instance is a NEW object, never the same reference');
        assert(loaded.gatewayUrl === 'https://gateway.pinata.cloud', 'A3. gatewayUrl survives the round trip');
        assert(loaded.equals(original), 'A4. the reloaded configuration is value-equal to the original');
        console.log('✓ Section A: save() then get() round-trips gatewayUrl through a real, independently constructed IpfsGatewayConfiguration instance');
    }

    // ===============================================================
    // Section B — replacement: a second save() replaces the first
    // outright, never accumulates a second entry.
    // ===============================================================
    {
        const store = new IpfsGatewayConfigurationStore(new InMemoryStorageProvider());
        store.save(new IpfsGatewayConfiguration({ gatewayUrl: 'https://first-gateway.example' }));
        assert(store.get().gatewayUrl === 'https://first-gateway.example', 'B1. the first save is visible before the second');

        store.save(new IpfsGatewayConfiguration({ gatewayUrl: 'https://second-gateway.example' }));
        assert(store.get().gatewayUrl === 'https://second-gateway.example', 'B2. the second save REPLACES the first outright');
        console.log('✓ Section B: saving a new gatewayUrl replaces the previous one outright — one current configuration, never a log');
    }

    // ===============================================================
    // Section C — restart semantics: a fresh store instance over the
    // same underlying storage reconstructs the configuration.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const store1 = new IpfsGatewayConfigurationStore(storage);
        store1.save(new IpfsGatewayConfiguration({ gatewayUrl: 'https://gateway.pinata.cloud' }));

        const store2 = new IpfsGatewayConfigurationStore(storage);
        assert(store2.get().gatewayUrl === 'https://gateway.pinata.cloud', 'C1. a fresh store instance over the same storage sees the previously saved configuration');

        store2.save(new IpfsGatewayConfiguration({ gatewayUrl: 'https://another-gateway.example' }));
        const store3 = new IpfsGatewayConfigurationStore(storage);
        assert(store3.get().gatewayUrl === 'https://another-gateway.example', 'C2. a write from the restarted instance is durable for a subsequent instance too');
        console.log('✓ Section C: a new store instance over the same storage namespace reconstructs the previously saved configuration, exactly like an application restart');
    }

    // ===============================================================
    // Section D — absence: a never-written store returns null, never a
    // fabricated configuration holding the deployment default.
    // ===============================================================
    {
        const store = new IpfsGatewayConfigurationStore(new InMemoryStorageProvider());
        const result = store.get();
        assert(result === null, 'D1. get() against a never-written store returns null');
        assert(result !== DEFAULT_IPFS_GATEWAY_URL, 'D2. null is genuinely null — never disguised as the default URL string');
        console.log('✓ Section D: "no configuration saved" is a real null, never a fabricated IpfsGatewayConfiguration holding the deployment default');
    }

    // ===============================================================
    // Section E — clear(): removes any persisted override, returning to
    // "absent."
    // ===============================================================
    {
        const store = new IpfsGatewayConfigurationStore(new InMemoryStorageProvider());
        store.save(new IpfsGatewayConfiguration({ gatewayUrl: 'https://gateway.pinata.cloud' }));
        assert(store.get() !== null, 'E1. a configuration is on file before clear()');

        store.clear();
        assert(store.get() === null, 'E2. clear() removes the persisted override — get() returns null again');

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
        storage.save('ipfs-gateway-configuration', { gatewayUrl: 'not-a-valid-url' });
        const store = new IpfsGatewayConfigurationStore(storage);
        assert(store.get() === null, 'F1. an entry whose gatewayUrl fails shape validation degrades to null, never a thrown error');

        const storage2 = new InMemoryStorageProvider();
        storage2.save('ipfs-gateway-configuration', { notGatewayUrl: 'https://ipfs.io' });
        assert(new IpfsGatewayConfigurationStore(storage2).get() === null, 'F2. a wrong-shape object (missing gatewayUrl) degrades to null');

        const storage3 = new InMemoryStorageProvider();
        storage3.save('ipfs-gateway-configuration', ['not', 'an', 'object']);
        assert(new IpfsGatewayConfigurationStore(storage3).get() === null, 'F3. a non-object payload (an array) degrades to null, never a thrown error');

        const storage4 = new InMemoryStorageProvider();
        storage4.save('ipfs-gateway-configuration', 'https://ipfs.io');
        assert(new IpfsGatewayConfigurationStore(storage4).get() === null, 'F4. a bare string payload (not even an object) degrades to null');

        const store5 = new IpfsGatewayConfigurationStore(new InMemoryStorageProvider());
        assert(store5.get() === null, 'F5. a store with nothing ever saved returns null, not a thrown error');
        console.log('✓ Section F: malformed or absent persisted data degrades to "no configuration" — get() never hands back an invalid IpfsGatewayConfiguration and never throws over bad bytes');
    }

    // ===============================================================
    // Section G — storage failure: a provider that genuinely throws
    // propagates out of this class, never mistaken for "no configuration."
    // ===============================================================
    {
        const store = new IpfsGatewayConfigurationStore(new ThrowingStorageProvider());
        expectThrows(() => store.get(), 'G1. get() propagates a genuine storage failure rather than degrading to null');
        expectThrows(() => store.save(new IpfsGatewayConfiguration({ gatewayUrl: 'https://ipfs.io' })), 'G2. save() propagates a genuine storage failure rather than silently no-oping');
        expectThrows(() => store.clear(), 'G3. clear() propagates a genuine storage failure rather than silently no-oping');
        console.log('✓ Section G: a StorageProvider that genuinely throws propagates that failure out of save()/get()/clear() unmodified');
    }

    // ===============================================================
    // Section H — effective-gateway resolution: the exact "absent ->
    // default, present -> override" pattern ui/main.js applies, exercised
    // directly against the real store/constant this milestone ships.
    // ===============================================================
    {
        function resolveEffectiveGatewayUrl(store) {
            const configuration = store.get();
            return configuration ? configuration.gatewayUrl : DEFAULT_IPFS_GATEWAY_URL;
        }

        const storeWithNoOverride = new IpfsGatewayConfigurationStore(new InMemoryStorageProvider());
        assert(resolveEffectiveGatewayUrl(storeWithNoOverride) === DEFAULT_IPFS_GATEWAY_URL, 'H1. with no saved configuration, the effective gateway is the deployment default');

        const storeWithOverride = new IpfsGatewayConfigurationStore(new InMemoryStorageProvider());
        storeWithOverride.save(new IpfsGatewayConfiguration({ gatewayUrl: 'https://gateway.pinata.cloud' }));
        assert(resolveEffectiveGatewayUrl(storeWithOverride) === 'https://gateway.pinata.cloud', 'H2. with a saved configuration, the effective gateway is the user\'s own override');

        storeWithOverride.clear();
        assert(resolveEffectiveGatewayUrl(storeWithOverride) === DEFAULT_IPFS_GATEWAY_URL, 'H3. after clear(), the effective gateway falls back to the deployment default again');
        console.log('✓ Section H: "absent preference -> deployment default, present preference -> explicit override" resolves correctly through this store\'s own public surface');
    }

    // ===============================================================
    // Section I — this same resolution, confirmed against the REAL
    // ui/main.js composition-root wiring, not merely a re-implementation
    // of the pattern in this test file.
    //
    // 0.9.666 — IPFS Gateway Read Failover extends this sweep: both real
    // construction sites now resolve the FULL ordered gatewayUrls list and
    // route it through composeIpfsGatewayContentStore(), the same
    // "byte-for-byte unchanged for a single gateway, failover-capable for
    // 2+" shape Arweave Gateway's own 0.9.440 consumers already hold.
    // ===============================================================
    {
        const mainSource = (await Promise.all(mainFiles().map((file) => source(file)))).join('\n');
        assert(mainSource.includes('const ipfsGatewayConfigurationStore = new IpfsGatewayConfigurationStore(new LocalStorageProvider());'),
            'I1. ui/main.js constructs exactly one IpfsGatewayConfigurationStore, over LocalStorageProvider, the same composition-root shape Arweave/Nostr already hold');
        assert(mainSource.includes("const resolvedIpfsGatewayUrl = (ipfsGatewayConfigurationStore.get() || { gatewayUrl: DEFAULT_IPFS_GATEWAY_URL }).gatewayUrl;"),
            'I2. ui/main.js still resolves the single effective gateway with the identical "absent -> default, present -> override" pattern Section H proved directly against the store');
        assert(mainSource.includes("const resolvedIpfsGatewayUrls = (ipfsGatewayConfigurationStore.get() || { gatewayUrls: [DEFAULT_IPFS_GATEWAY_URL] }).gatewayUrls;"),
            'I2b. ui/main.js also resolves the FULL ordered gatewayUrls list, over the SAME store instance, mirroring resolvedArweaveGatewayUrls\' own 0.9.440 shape');
        const gatewayConstructionsWithOption = (mainSource.match(/composeIpfsGatewayContentStore\(resolvedIpfsGatewayUrls\)/g) || []).length;
        assert(gatewayConstructionsWithOption === 2, `I3. both real IPFS gateway content store construction sites now go through composeIpfsGatewayContentStore(resolvedIpfsGatewayUrls) — found ${gatewayConstructionsWithOption}`);
        assert(!/new IpfsGatewayContentStore\(\)/.test(mainSource), 'I4. no construction site passes zero arguments any more — the seam Section A/D of the earlier product-gap audits found unreached is now genuinely wired');
        assert(/function composeIpfsGatewayContentStore\(gatewayUrls\)\s*\{[\s\S]*?IpfsGatewayFailoverContentStore[\s\S]*?IpfsGatewayContentStore[\s\S]*?\}/.test(mainSource),
            'I5. composeIpfsGatewayContentStore() itself picks the plain IpfsGatewayContentStore for a single configured gateway and IpfsGatewayFailoverContentStore only for 2+, mirroring resolvedArweaveGatewayUrls\' own consumers');
        console.log('✓ Section I: the effective-gateway resolution this milestone ships is confirmed live inside the real ui/main.js composition root, feeding both real construction sites through the failover-aware composition helper, not merely proven in isolation');
    }

    // ===============================================================
    // Section K — 0.9.666: gatewayUrls list persistence round-trips, and
    // a legacy single-gatewayUrl payload still reads back as a genuine
    // one-element ordered list.
    // ===============================================================
    {
        const store = new IpfsGatewayConfigurationStore(new InMemoryStorageProvider());
        const original = new IpfsGatewayConfiguration({ gatewayUrls: ['https://a.example', 'https://b.example', 'https://c.example'] });
        store.save(original);

        const loaded = store.get();
        assert(loaded instanceof IpfsGatewayConfiguration, 'K1. get() returns a real IpfsGatewayConfiguration instance for a saved list');
        assert(JSON.stringify(loaded.gatewayUrls) === JSON.stringify(['https://a.example', 'https://b.example', 'https://c.example']), 'K2. the full ordered list survives the round trip');
        assert(loaded.equals(original), 'K3. the reloaded configuration is value-equal to the original');

        // A payload saved by an earlier build of this codebase —
        // { gatewayUrl: '...' }, no gatewayUrls key at all — still reads
        // back exactly as it always did: a genuine one-element list.
        const legacyBacking = new InMemoryStorageProvider();
        legacyBacking.save('ipfs-gateway-configuration', { gatewayUrl: 'https://legacy.example' });
        const legacyStore = new IpfsGatewayConfigurationStore(legacyBacking);
        const legacyLoaded = legacyStore.get();
        assert(legacyLoaded instanceof IpfsGatewayConfiguration, 'K4. a legacy single-gatewayUrl payload still round-trips into a real IpfsGatewayConfiguration');
        assert(JSON.stringify(legacyLoaded.gatewayUrls) === JSON.stringify(['https://legacy.example']), 'K5. …as a genuine one-element gatewayUrls list, byte-identical in effect to what it always meant');

        console.log('✓ Section K: gatewayUrls list persistence round-trips through a real IpfsGatewayConfiguration, and a legacy single-gatewayUrl payload upgrades losslessly into a one-element ordered list');
    }

    // ===============================================================
    // Section J — architecture sweep: no provider imports, no registry
    // consultation, no UI dependency, run against the real source file.
    // ===============================================================
    {
        const storeSource = await source('storage/IpfsGatewayConfigurationStore.js');
        const forbiddenImportPattern = /^import\b[^\n]*from\s*['"][^'"]*(nostr|arweave|bitcoin|anchoring|content\/|discovery\/|base\/|ui\/)[^'"]*['"]/im;
        assert(!forbiddenImportPattern.test(storeSource), 'J1. storage/IpfsGatewayConfigurationStore.js imports no provider implementation, no content/anchoring/discovery module, and no ui/ module');
        const importLines = storeSource.split('\n').filter((line) => /^import\b/.test(line));
        assert(importLines.length === 3, 'J2. exactly three imports — its own StorageProvider/LocalStorageProvider pair, and this milestone\'s IpfsGatewayConfiguration/isValidIpfsGatewayUrl pair from one file');
        assert(!/registry/i.test(storeSource.replace(/\/\/.*$/gm, '')), 'J3. the word "registry" never appears in this file\'s own executable code');
        assert(typeof window === 'undefined' && typeof document === 'undefined', 'J4. this test runs under plain node, with no browser globals present');
        console.log('✓ Section J: architecture sweep of the real source file confirms no provider import, no registry consultation, and no UI dependency');
    }

    console.log('\n✅ All User-Configurable IPFS Gateway Configuration Persistence tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
