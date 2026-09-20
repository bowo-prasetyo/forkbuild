import { readFile } from 'node:fs/promises';

import { IpfsGatewayConfiguration, DEFAULT_IPFS_GATEWAY_URL, isValidIpfsGatewayUrl } from '../core/IpfsGatewayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { IpfsGatewayConfigurationStore } from '../storage/IpfsGatewayConfigurationStore.js';
import { SetIpfsGatewayConfigurationUseCase } from '../application/SetIpfsGatewayConfigurationUseCase.js';
import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';

// 0.9.665 — IPFS Gateway Settings UI.
//
// Mirrors tests/ArweaveGatewaySettingsEntryPoint.test.js's own structure —
// proving the missing other half of core/IpfsGatewayConfiguration.js +
// storage/IpfsGatewayConfigurationStore.js: a real settings surface,
// reachable from top-nav, that creates/changes/clears the override end to
// end, and a real composition-root wiring that actually feeds it into both
// IpfsGatewayContentStore construction sites. Sections G/H are scaled to
// what IPFS actually has (no Arweave-shaped composeDiscoverSnapshotRuntime()/
// composeSnapshotDistributionRuntime() equivalent) — the real
// IpfsGatewayContentStore itself, and the real write-path stores
// (content/IpfsContentStore.js, content/IpfsRemotePinningContentStore.js).
//
// This suite also reverses 0.9.373/0.9.385/0.9.657's own recorded DEFER
// verdicts for this exact candidate — see core/IpfsGatewayConfiguration.js's
// own header for the new evidence (ipfs.io's public gateway now blocks
// ordinary programmatic requests behind a bot-detection check) that
// reopened the question, and docs/Roadmap.md, "0.9.665," for the full
// reversal record.

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

class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace) { super(); this._namespace = sharedNamespace; }
    save(name, data) { this._namespace[name] = JSON.stringify(data); }
    load(name) { return Object.prototype.hasOwnProperty.call(this._namespace, name) ? JSON.parse(this._namespace[name]) : null; }
    remove(name) { delete this._namespace[name]; }
    list() { return Object.keys(this._namespace); }
}

function makeFetchSpy({ okPrefix, textBody = 'content bytes' } = {}) {
    const calls = [];
    async function fetchImpl(url) {
        calls.push(url);
        const ok = typeof okPrefix === 'string' && url.startsWith(okPrefix);
        return { ok, status: ok ? 200 : 404, text: async () => textBody };
    }
    fetchImpl.calls = calls;
    return fetchImpl;
}

const SOURCE_ROOT = new URL('../', import.meta.url);
async function source(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

async function run() {
    // ===============================================================
    // Section 0 — settings entry point reachability.
    // ===============================================================
    {
        const mainSource = await source('ui/main.js');
        assert(mainSource.includes("import { SetIpfsGatewayConfigurationUseCase } from '../application/SetIpfsGatewayConfigurationUseCase.js';"),
            '1. ui/main.js imports the new write use case');
        assert(/new SetIpfsGatewayConfigurationUseCase\(\{\s*ipfsGatewayConfigurationStore\s*\}\)/.test(mainSource),
            '2. ui/main.js wires SetIpfsGatewayConfigurationUseCase against the SAME shared ipfsGatewayConfigurationStore both real retrieval call sites already resolve through, never a second disconnected store');
        assert(/app\.provide\('ipfsGatewayConfigurationStore',\s*ipfsGatewayConfigurationStore\)/.test(mainSource),
            '3. the shared store is actually provided to the Vue app, not just constructed and discarded');
        assert(/app\.provide\('setIpfsGatewayConfigurationUseCase',\s*setIpfsGatewayConfigurationUseCase\)/.test(mainSource),
            '4. the write use case is actually provided to the Vue app');
        const storeConstructions = (mainSource.match(/new IpfsGatewayConfigurationStore\(/g) || []).length;
        assert(storeConstructions === 1, `5. ui/main.js constructs exactly one IpfsGatewayConfigurationStore instance — found ${storeConstructions}`);

        const routerSource = await source('ui/router/index.js');
        assert(/path:\s*'\/settings\/ipfs-gateway'/.test(routerSource), '6. a real route exists for the settings entry point');
        assert(routerSource.includes("import IpfsGatewaySettingsView from '../views/IpfsGatewaySettingsView.js';"),
            '7. the router imports the real view component, never a stub');

        const networkSettingsSource = await source('ui/views/NetworkSettingsView.js');
        assert(/router-link to="\/settings\/ipfs-gateway"/.test(networkSettingsSource),
            '8. the Network Settings hub links to the settings entry point — reachable one hop further, not a URL-only capability');

        const viewSource = await source('ui/views/IpfsGatewaySettingsView.js');
        const viewExecutable = viewSource.replace(/\/\/.*$/gm, '');
        assert(/inject\('ipfsGatewayConfigurationStore',\s*null\)/.test(viewExecutable),
            '9. the view reads the configuration through the injected store, never a store it constructs itself');
        assert(/inject\('setIpfsGatewayConfigurationUseCase',\s*null\)/.test(viewExecutable),
            '10. the view writes the configuration through the injected use case, never IpfsGatewayConfigurationStore.save() directly');
        assert(!/new IpfsGatewayConfiguration\(/.test(viewExecutable),
            '11. the view never constructs an IpfsGatewayConfiguration itself — validation and construction stay inside the use case');
        assert(viewExecutable.includes("import { DEFAULT_IPFS_GATEWAY_URL } from '../../core/IpfsGatewayConfiguration.js';"),
            '12. the ONE thing the view imports from core/IpfsGatewayConfiguration.js is the plain default constant, for display only');
        assert(!/new IpfsGatewayContentStore/.test(viewExecutable),
            '13. the view never constructs a retrieval adapter itself — it only ever talks to the injected store/use case seam');
        console.log('✓ Section 0: the settings entry point is really wired — nav link, route, shared store, shared use case, and a view that only ever goes through the injected collaborators');
    }

    // ===============================================================
    // Section A — save: a valid custom gateway actually persists through
    // the new write seam.
    // ===============================================================
    {
        const store = new IpfsGatewayConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetIpfsGatewayConfigurationUseCase({ ipfsGatewayConfigurationStore: store });

        const saved = setUseCase.execute({ gatewayUrl: 'https://gateway.pinata.cloud' });
        assert(saved instanceof IpfsGatewayConfiguration && saved.gatewayUrl === 'https://gateway.pinata.cloud',
            '14. execute() returns the persisted IpfsGatewayConfiguration');
        assert(store.get().gatewayUrl === 'https://gateway.pinata.cloud',
            '15. saving a valid custom gateway through the settings entry point actually persists it');
    }
    console.log('✓ Section A: a valid custom gateway actually saves through SetIpfsGatewayConfigurationUseCase');

    // ===============================================================
    // Section B — invalid input: rejected without mutating whatever was
    // previously on file.
    // ===============================================================
    {
        const store = new IpfsGatewayConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetIpfsGatewayConfigurationUseCase({ ipfsGatewayConfigurationStore: store });

        expectThrows(() => setUseCase.execute({ gatewayUrl: 'not-a-url' }), '16. a malformed URL is refused');
        assert(store.get() === null, '17. the rejected save left the store genuinely empty');

        setUseCase.execute({ gatewayUrl: 'https://original-gateway.example' });
        expectThrows(() => setUseCase.execute({ gatewayUrl: 'ftp://not-http.example' }), '18. a non-http(s) scheme is refused');
        expectThrows(() => setUseCase.execute({ gatewayUrl: '' }), '19. an empty string is refused');
        expectThrows(() => setUseCase.execute({}), '20. a missing gatewayUrl is refused');
        assert(store.get().gatewayUrl === 'https://original-gateway.example',
            '21. every rejected save left the PREVIOUSLY saved configuration completely untouched');
    }
    console.log('✓ Section B: invalid input is rejected without ever mutating the existing configuration — valid or absent');

    // ===============================================================
    // Section C — replacement: gateway-A -> gateway-B replaces, never
    // accumulates a second entry.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new IpfsGatewayConfigurationStore(backing);
        const setUseCase = new SetIpfsGatewayConfigurationUseCase({ ipfsGatewayConfigurationStore: store });

        setUseCase.execute({ gatewayUrl: 'https://gateway-a.example' });
        setUseCase.execute({ gatewayUrl: 'https://gateway-b.example' });
        assert(store.get().gatewayUrl === 'https://gateway-b.example', '22. gateway-B replaces gateway-A outright');
        assert(backing.list().filter((key) => key === 'ipfs-gateway-configuration').length === 1,
            '23. exactly one storage entry exists after replacement, never two');
    }
    console.log('✓ Section C: replacing a saved gateway never accumulates a second entry');

    // ===============================================================
    // Section D — clear: "Use Deployment Default" restores genuine
    // absence, never a saved copy of the default.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new IpfsGatewayConfigurationStore(backing);
        const setUseCase = new SetIpfsGatewayConfigurationUseCase({ ipfsGatewayConfigurationStore: store });

        setUseCase.execute({ gatewayUrl: 'https://gateway.pinata.cloud' });
        store.clear();
        assert(store.get() === null, '24. clear() restores genuine absence — get() is a real null');
        assert(backing.load('ipfs-gateway-configuration') === null, '25. nothing at all remains on file — never a saved copy of the default URL');

        const effective = (store.get() || { gatewayUrl: DEFAULT_IPFS_GATEWAY_URL }).gatewayUrl;
        assert(effective === DEFAULT_IPFS_GATEWAY_URL, '26. after clearing, the effective gateway falls back to the deployment default');
    }
    console.log('✓ Section D: "Use Deployment Default" clears to genuine absence, never persisting a copy of the default URL');

    // ===============================================================
    // Section E — explicit default: entering the default URL by hand
    // still leaves a real, distinct saved entry.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new IpfsGatewayConfigurationStore(backing);
        const setUseCase = new SetIpfsGatewayConfigurationUseCase({ ipfsGatewayConfigurationStore: store });

        const saved = setUseCase.execute({ gatewayUrl: DEFAULT_IPFS_GATEWAY_URL });
        assert(saved.gatewayUrl === DEFAULT_IPFS_GATEWAY_URL, '27. saving the default URL by hand is accepted like any other valid URL');
        assert(backing.load('ipfs-gateway-configuration') !== null, '28. the underlying storage genuinely holds an entry, distinguishing this from Section D\'s cleared/absent state');
    }
    console.log('✓ Section E: explicitly entering the deployment default still saves a real, distinct persisted entry');

    // ===============================================================
    // Section F — restart: a brand-new store/use-case pair, over the SAME
    // underlying storage, observes what an earlier instance saved.
    // ===============================================================
    {
        const sharedNamespace = {};
        const storeBeforeRestart = new IpfsGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        new SetIpfsGatewayConfigurationUseCase({ ipfsGatewayConfigurationStore: storeBeforeRestart }).execute({ gatewayUrl: 'https://gateway.pinata.cloud' });

        const storeAfterRestart = new IpfsGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert(storeAfterRestart !== storeBeforeRestart, '29. sanity — this really is a newly constructed store');
        assert(storeAfterRestart.get().gatewayUrl === 'https://gateway.pinata.cloud',
            '30. a newly constructed store observes the configuration an earlier instance persisted, exactly like an application restart');
    }
    console.log('✓ Section F: newly constructed settings/application objects observe an earlier instance\'s persisted configuration, across a genuine restart boundary');

    // ===============================================================
    // Section G — consumer convergence: saving through the settings entry
    // point actually decides what the real IpfsGatewayContentStore's
    // CONCRETE fetch call reaches, after a fresh composition — the exact
    // "Pinata's gateway works, ipfs.io doesn't" recovery journey this
    // milestone exists to close.
    // ===============================================================
    {
        const store = new IpfsGatewayConfigurationStore(new InMemoryStorageProvider());
        new SetIpfsGatewayConfigurationUseCase({ ipfsGatewayConfigurationStore: store }).execute({ gatewayUrl: 'https://gateway.pinata.cloud' });

        // "New application composition" — resolve exactly as ui/main.js does.
        const resolvedGatewayUrl = (store.get() || { gatewayUrl: DEFAULT_IPFS_GATEWAY_URL }).gatewayUrl;
        assert(resolvedGatewayUrl === 'https://gateway.pinata.cloud', '31. sanity — the resolved URL is the settings-saved override');

        const fetchSpy = makeFetchSpy({ okPrefix: 'https://gateway.pinata.cloud', textBody: 'the pinned bytes' });
        const gateway = new IpfsGatewayContentStore({ gatewayUrl: resolvedGatewayUrl, fetchImpl: fetchSpy });
        const bytes = await gateway.get({ uri: 'ipfs://QmExampleCid' });
        assert(bytes === 'the pinned bytes', '32. retrieval succeeds against the settings-saved gateway');
        assert(fetchSpy.calls.length === 1 && fetchSpy.calls[0] === 'https://gateway.pinata.cloud/ipfs/QmExampleCid',
            '33. the concrete fetch call reaches exactly the gateway saved through the settings entry point, never the hardcoded default');

        // A subsequent Clear -> a fresh composition falls back to the
        // deployment default, proving clear() genuinely reaches a later
        // composition, not just get().
        store.clear();
        const resolvedAfterClear = (store.get() || { gatewayUrl: DEFAULT_IPFS_GATEWAY_URL }).gatewayUrl;
        assert(resolvedAfterClear === DEFAULT_IPFS_GATEWAY_URL, '34. after Save then Clear, a fresh composition resolves the deployment default, never the cleared override');
        const fetchSpyAfterClear = makeFetchSpy({ okPrefix: DEFAULT_IPFS_GATEWAY_URL, textBody: 'default gateway bytes' });
        const gatewayAfterClear = new IpfsGatewayContentStore({ gatewayUrl: resolvedAfterClear, fetchImpl: fetchSpyAfterClear });
        await gatewayAfterClear.get({ uri: 'ipfs://QmExampleCid' });
        assert(fetchSpyAfterClear.calls[0].startsWith(DEFAULT_IPFS_GATEWAY_URL), '35. …and the concrete fetch call actually reaches the deployment default host');

        console.log('✓ Section G: Settings Save -> persistent configuration -> new application composition -> retrieval\'s concrete fetch call reaches the custom gateway; Clear reverts a subsequent fresh composition to the deployment default');
    }

    // ===============================================================
    // Section H — write-path isolation: a settings-saved override never
    // reaches either IPFS write path — local Kubo (content/
    // IpfsContentStore.js) or remote pinning (content/
    // IpfsRemotePinningContentStore.js) — mirroring the earlier product-
    // gap audit's own Section F/G finding, reconfirmed still true after
    // this milestone's own change.
    // ===============================================================
    {
        const kuboSource = await source('content/IpfsContentStore.js');
        assert(!/IpfsGatewayConfiguration|IpfsGatewayConfigurationStore/.test(kuboSource),
            '36. content/IpfsContentStore.js (local Kubo, the write/creation path) never references the new gateway configuration classes at all');

        const pinningSource = await source('content/IpfsRemotePinningContentStore.js');
        assert(!/IpfsGatewayConfiguration|IpfsGatewayConfigurationStore/.test(pinningSource),
            '37. content/IpfsRemotePinningContentStore.js (remote pinning, the OTHER write path) never references the new gateway configuration classes either');

        const mainSource = await source('ui/main.js');
        assert(mainSource.includes('stores: [publicationContentStore, new IpfsContentStore()]'),
            '38. the CREATION registry still constructs local Kubo with zero arguments, completely unaffected by this milestone\'s read-path gateway override');
        console.log('✓ Section H: both IPFS write paths remain completely unaffected by a gateway saved through the settings entry point — read-path configuration stays structurally isolated from write-path configuration, exactly as before this milestone');
    }

    // ===============================================================
    // Section I — view template sweep: display state, Save/Use Deployment
    // Default wiring, and the deliberately-excluded feature list.
    // ===============================================================
    {
        const viewSource = await source('ui/views/IpfsGatewaySettingsView.js');

        assert(/v-if="hasOverride"/.test(viewSource), '39. the template branches on whether an override is on file');
        assert(/No override configured/.test(viewSource) && /effectiveGatewayUrl/.test(viewSource),
            '40. the no-override state displays the effective deployment default as informational text');
        assert(/Current override/.test(viewSource), '41. the override state displays the current, actually-saved gatewayUrl');

        const loadFnMatch = viewSource.match(/function load\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(loadFnMatch, '42. a load() function exists');
        assert(!/execute\(|\.save\(|\.clear\(/.test(loadFnMatch[0]),
            '43. load() never calls the use case, store.save(), or store.clear() — merely opening the page persists nothing');

        assert(/@click="save"/.test(viewSource), '44. a Save action is wired');
        assert(/@click="useDeploymentDefault"/.test(viewSource), '45. a Use Deployment Default action is wired');
        const useDeploymentDefaultFnMatch = viewSource.match(/function useDeploymentDefault\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(useDeploymentDefaultFnMatch, '46. a useDeploymentDefault() function exists');
        assert(/store\.clear\(\)/.test(useDeploymentDefaultFnMatch[0]), '47. Use Deployment Default calls store.clear()');
        assert(!/DEFAULT_IPFS_GATEWAY_URL/.test(useDeploymentDefaultFnMatch[0]),
            '48. Use Deployment Default never saves { gatewayUrl: DEFAULT_IPFS_GATEWAY_URL } — it only ever clears');
        const saveFnMatch = viewSource.match(/function save\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(saveFnMatch, '49. a save() function exists');
        assert(/setIpfsGatewayConfigurationUseCase\.execute\(/.test(saveFnMatch[0]), '50. save() goes through the injected use case, never a direct store.save()');
        assert(!/store\.save\(/.test(saveFnMatch[0]), '51. save() never calls store.save() directly, bypassing the use case');

        console.log('✓ Section I: the view template shows the correct no-override/override states without ever mutating on load, and wires Save through the use case and Use Deployment Default through store.clear() only');
    }

    // ===============================================================
    // Section J — architecture sweep of the new use case file.
    // ===============================================================
    {
        const useCaseSource = await source('application/SetIpfsGatewayConfigurationUseCase.js');
        const executable = useCaseSource.replace(/\/\/.*$/gm, '');
        assert(!/\bfetch\s*\(/.test(executable), '52. no network call of any kind');
        assert(!/localStorage/.test(executable), '53. no direct localStorage access — persistence stays behind the injected store');
        assert(!/IpfsGatewayContentStore/.test(executable), '54. no retrieval adapter dependency of any kind');
        assert(!/from\s*['"][^'"]*ui\//.test(executable), '55. no import from ui/ — this stays a pure application-layer class');
        const importLines = executable.split('\n').filter((line) => /^import\b/.test(line));
        assert(importLines.length === 2, `56. exactly two imports — the configuration value object and its store — found ${importLines.length}`);

        assert(isValidIpfsGatewayUrl('https://sanity-check.example'), '57. sanity — the shared validation helper this use case relies on still behaves as documented');
        console.log('✓ Section J: architecture sweep confirms the new use case has no network dependency, no direct storage access, no retrieval adapter dependency, and no ui/ dependency');
    }

    console.log('\n✅ All IPFS Gateway Settings UI (0.9.665) tests passed.');
}

run().catch((error) => {
    console.error('IpfsGatewaySettingsEntryPoint.test.js FAILED:', error);
    process.exitCode = 1;
});
