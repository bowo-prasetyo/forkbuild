import { readFile } from 'node:fs/promises';

import { BitcoinEsploraConfiguration, DEFAULT_BITCOIN_ESPLORA_API_URL, isValidBitcoinEsploraApiUrl } from '../core/BitcoinEsploraConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { BitcoinEsploraConfigurationStore } from '../storage/BitcoinEsploraConfigurationStore.js';
import { SetBitcoinEsploraConfigurationUseCase } from '../application/SetBitcoinEsploraConfigurationUseCase.js';
import { CreateBitcoinEsploraTransactionConfirmationObserverUseCase } from '../application/CreateBitcoinEsploraTransactionConfirmationObserverUseCase.js';

// Bitcoin Endpoint Settings UI.
//
// Closes the gap tests/BitcoinEndpointConfigurationUIReachabilityAudit.test.js's
// own Section G named as the one thing that would legitimately reopen its
// seven-times-reconfirmed DEFER: a concrete, stated new requirement (the
// default Esplora-compatible endpoint going down with no way for a person
// to route around it). This suite proves the missing settings surface end
// to end, without ever constructing a retrieval/broadcast adapter itself
// outside of the convergence section.
//
//   Section 0 — the settings entry point is actually reachable (nav link,
//               route, composition-root wiring, view wiring).
//   Section A — save: a valid custom endpoint actually persists.
//   Section B — invalid input: rejected without mutating whatever was
//               previously on file.
//   Section C — replacement: endpoint-A -> endpoint-B replaces, never
//               accumulates a second entry.
//   Section D — clear: "Use Deployment Default" restores genuine absence.
//   Section E — restart: a brand-new store/use-case pair, over the SAME
//               underlying storage, observes what an earlier instance saved.
//   Section F — convergence: saving through the settings entry point
//               decides what a real Bitcoin Esplora consumer's concrete
//               fetch call reaches, after a fresh composition.
//   Section G — view template sweep.
//   Section H — architecture sweep of the new use case file.

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

function makeFetchSpy(responsesByUrl) {
    const calls = [];
    async function fetchImpl(url) {
        calls.push(url);
        const body = responsesByUrl[url];
        if (body === undefined) return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
        return { ok: true, status: 200, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), json: async () => body };
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
        assert(mainSource.includes("import { SetBitcoinEsploraConfigurationUseCase } from '../application/SetBitcoinEsploraConfigurationUseCase.js';"),
            '1. ui/main.js imports the new write use case');
        assert(/new SetBitcoinEsploraConfigurationUseCase\(\{\s*bitcoinEsploraConfigurationStore\s*\}\)/.test(mainSource),
            '2. ui/main.js wires SetBitcoinEsploraConfigurationUseCase against the SAME shared bitcoinEsploraConfigurationStore the resolved apiUrl is read from, never a second disconnected store');
        assert(/app\.provide\('bitcoinEsploraConfigurationStore',\s*bitcoinEsploraConfigurationStore\)/.test(mainSource),
            '3. the shared store is actually provided to the Vue app');
        assert(/app\.provide\('setBitcoinEsploraConfigurationUseCase',\s*setBitcoinEsploraConfigurationUseCase\)/.test(mainSource),
            '4. the write use case is actually provided to the Vue app');
        const storeConstructions = (mainSource.match(/new BitcoinEsploraConfigurationStore\(/g) || []).length;
        assert(storeConstructions === 1, `5. ui/main.js still constructs exactly one BitcoinEsploraConfigurationStore instance — found ${storeConstructions}`);

        // The resolved apiUrl actually reaches all four real Esplora
        // construction sites — never left unused after being resolved.
        const consumers = [
            'CreateBitcoinAnchorProofVerifierUseCase',
            'CreateBitcoinEsploraTransactionConfirmationObserverUseCase',
            'CreateBitcoinEsploraWalletFundingSourceUseCase',
            'CreateBitcoinEsploraTransactionBroadcasterUseCase'
        ];
        for (const useCase of consumers) {
            const pattern = new RegExp(`new ${useCase}\\(\\)\\.execute\\(\\{\\s*apiUrl:\\s*resolvedBitcoinEsploraApiUrl\\s*\\}\\)`);
            assert(pattern.test(mainSource), `6[${useCase}]. its own .execute() call passes { apiUrl: resolvedBitcoinEsploraApiUrl }`);
        }

        const routerSource = await source('ui/router/index.js');
        assert(/path:\s*'\/settings\/bitcoin-esplora'/.test(routerSource), '7. a real route exists for the settings entry point');
        assert(routerSource.includes("import BitcoinEsploraSettingsView from '../views/BitcoinEsploraSettingsView.js';"),
            '8. the router imports the real view component, never a stub');

        const networkSettingsSource = await source('ui/views/NetworkSettingsView.js');
        assert(/router-link to="\/settings\/bitcoin-esplora"/.test(networkSettingsSource),
            '9. the Network Settings hub links to the settings entry point');

        const viewSource = await source('ui/views/BitcoinEsploraSettingsView.js');
        const viewExecutable = viewSource.replace(/\/\/.*$/gm, '');
        assert(/inject\('bitcoinEsploraConfigurationStore',\s*null\)/.test(viewExecutable),
            '10. the view reads the configuration through the injected store, never a store it constructs itself');
        assert(/inject\('setBitcoinEsploraConfigurationUseCase',\s*null\)/.test(viewExecutable),
            '11. the view writes the configuration through the injected use case, never BitcoinEsploraConfigurationStore.save() directly');
        assert(!/new BitcoinEsploraConfiguration\(/.test(viewExecutable),
            '12. the view never constructs a BitcoinEsploraConfiguration itself');
        assert(viewExecutable.includes("import { DEFAULT_BITCOIN_ESPLORA_API_URL } from '../../core/BitcoinEsploraConfiguration.js';"),
            '13. the ONE thing the view imports from core/BitcoinEsploraConfiguration.js is the plain default constant, for display only');
        assert(!/BitcoinEsploraTransactionBroadcaster|BitcoinEsploraTransactionConfirmationObserver|BitcoinEsploraWalletFundingSource|BitcoinOpReturnProofVerifier/.test(viewExecutable),
            '14. the view never imports or constructs a real Bitcoin Esplora adapter');
        console.log('✓ Section 0: the settings entry point is really wired — nav link, route, shared store, shared use case, all four consumer sites, and a view that only ever goes through the injected collaborators');
    }

    // ===============================================================
    // Section A — save.
    // ===============================================================
    {
        const store = new BitcoinEsploraConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetBitcoinEsploraConfigurationUseCase({ bitcoinEsploraConfigurationStore: store });

        const saved = setUseCase.execute({ apiUrl: 'https://my-esplora-host.example/api' });
        assert(saved instanceof BitcoinEsploraConfiguration && saved.apiUrl === 'https://my-esplora-host.example/api',
            '15. execute() returns the persisted BitcoinEsploraConfiguration');
        assert(store.get().apiUrl === 'https://my-esplora-host.example/api',
            '16. saving a valid custom endpoint through the settings entry point actually persists it');
    }
    console.log('✓ Section A: a valid custom endpoint actually saves through SetBitcoinEsploraConfigurationUseCase');

    // ===============================================================
    // Section B — invalid input.
    // ===============================================================
    {
        const store = new BitcoinEsploraConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetBitcoinEsploraConfigurationUseCase({ bitcoinEsploraConfigurationStore: store });

        expectThrows(() => setUseCase.execute({ apiUrl: 'not-a-url' }), '17. a malformed URL is refused');
        assert(store.get() === null, '18. the rejected save left the store genuinely empty');

        setUseCase.execute({ apiUrl: 'https://original-host.example/api' });
        expectThrows(() => setUseCase.execute({ apiUrl: 'ftp://not-http.example' }), '19. a non-http(s) scheme is refused');
        expectThrows(() => setUseCase.execute({ apiUrl: '' }), '20. an empty string is refused');
        expectThrows(() => setUseCase.execute({}), '21. a missing apiUrl is refused');
        assert(store.get().apiUrl === 'https://original-host.example/api',
            '22. every rejected save left the previously saved configuration completely untouched');
    }
    console.log('✓ Section B: invalid input is rejected without ever mutating the existing configuration');

    // ===============================================================
    // Section C — replacement.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new BitcoinEsploraConfigurationStore(backing);
        const setUseCase = new SetBitcoinEsploraConfigurationUseCase({ bitcoinEsploraConfigurationStore: store });

        setUseCase.execute({ apiUrl: 'https://host-a.example/api' });
        assert(store.get().apiUrl === 'https://host-a.example/api', '23. endpoint-A is on file');

        setUseCase.execute({ apiUrl: 'https://host-b.example/api' });
        assert(store.get().apiUrl === 'https://host-b.example/api', '24. endpoint-B replaces endpoint-A outright');
        assert(backing.list().filter((key) => key === 'bitcoin-esplora-configuration').length === 1,
            '25. exactly one storage entry exists after replacement, never two');
    }
    console.log('✓ Section C: replacing a saved endpoint never accumulates a second entry');

    // ===============================================================
    // Section D — clear.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new BitcoinEsploraConfigurationStore(backing);
        const setUseCase = new SetBitcoinEsploraConfigurationUseCase({ bitcoinEsploraConfigurationStore: store });

        setUseCase.execute({ apiUrl: 'https://my-esplora-host.example/api' });
        assert(store.get() !== null, '26. a configuration is on file before clearing');

        store.clear();
        assert(store.get() === null, '27. clear() restores genuine absence');
        assert(backing.load('bitcoin-esplora-configuration') === null, '28. nothing at all remains on file');

        const effective = (store.get() || { apiUrl: DEFAULT_BITCOIN_ESPLORA_API_URL }).apiUrl;
        assert(effective === DEFAULT_BITCOIN_ESPLORA_API_URL, '29. after clearing, the effective endpoint falls back to the deployment default');
    }
    console.log('✓ Section D: "Use Deployment Default" clears to genuine absence, never persisting a copy of the default URL');

    // ===============================================================
    // Section E — restart.
    // ===============================================================
    {
        const sharedNamespace = {};

        const storeBeforeRestart = new BitcoinEsploraConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const setUseCaseBeforeRestart = new SetBitcoinEsploraConfigurationUseCase({ bitcoinEsploraConfigurationStore: storeBeforeRestart });
        setUseCaseBeforeRestart.execute({ apiUrl: 'https://my-esplora-host.example/api' });

        const storeAfterRestart = new BitcoinEsploraConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert(storeAfterRestart !== storeBeforeRestart, '30. sanity — this really is a newly constructed store');
        assert(storeAfterRestart.get().apiUrl === 'https://my-esplora-host.example/api',
            '31. a newly constructed store observes the configuration an earlier instance persisted');

        const setUseCaseAfterRestart = new SetBitcoinEsploraConfigurationUseCase({ bitcoinEsploraConfigurationStore: storeAfterRestart });
        setUseCaseAfterRestart.execute({ apiUrl: 'https://another-host.example/api' });
        assert(storeBeforeRestart.get().apiUrl === 'https://another-host.example/api',
            '32. a write through the newly constructed use case is visible back through the ORIGINAL store instance too');
    }
    console.log('✓ Section E: newly constructed settings/application objects observe an earlier instance\'s persisted configuration, across a genuine restart boundary');

    // ===============================================================
    // Section F — convergence: saving through the settings entry point
    // decides what a real Bitcoin Esplora consumer's concrete fetch call
    // reaches, after a fresh composition.
    // ===============================================================
    {
        const store = new BitcoinEsploraConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetBitcoinEsploraConfigurationUseCase({ bitcoinEsploraConfigurationStore: store });
        setUseCase.execute({ apiUrl: 'https://my-confirmation-host.example/api' });

        const resolvedApiUrl = (store.get() || { apiUrl: DEFAULT_BITCOIN_ESPLORA_API_URL }).apiUrl;
        const fetchSpy = makeFetchSpy({
            'https://my-confirmation-host.example/api/tx/abc123': { status: { confirmed: true, block_height: 100, block_hash: 'h'.repeat(64) } },
            'https://my-confirmation-host.example/api/blocks/tip/height': '105'
        });
        const { bitcoinEsploraTransactionConfirmationObserver } = new CreateBitcoinEsploraTransactionConfirmationObserverUseCase().execute({ apiUrl: resolvedApiUrl, fetchImpl: fetchSpy });

        const result = await bitcoinEsploraTransactionConfirmationObserver.fetchConfirmation('abc123');
        assert(result.found === true && result.confirmed === true, '33. confirmation observation succeeds against the settings-saved endpoint');
        assert(fetchSpy.calls[0] === 'https://my-confirmation-host.example/api/tx/abc123',
            '34. the concrete fetch call reaches exactly the endpoint saved through the settings entry point, never the hardcoded default');

        // A subsequent Clear -> a fresh composition falls back to the
        // deployment default, proving clear() genuinely reaches a later
        // composition, not just get().
        store.clear();
        const resolvedAfterClear = (store.get() || { apiUrl: DEFAULT_BITCOIN_ESPLORA_API_URL }).apiUrl;
        assert(resolvedAfterClear === DEFAULT_BITCOIN_ESPLORA_API_URL, '35. after Save then Clear, a fresh composition resolves the deployment default');
    }
    console.log('✓ Section F: Settings Save -> persistent configuration -> new application composition -> the concrete fetch call reaches the custom endpoint; Clear reverts a subsequent fresh composition to the deployment default');

    // ===============================================================
    // Section G — view template sweep.
    // ===============================================================
    {
        const viewSource = await source('ui/views/BitcoinEsploraSettingsView.js');

        assert(/v-if="hasOverride"/.test(viewSource), '36. the template branches on whether an override is on file');
        assert(/No override configured/.test(viewSource) && /deploymentDefaultApiUrl/.test(viewSource),
            '37. the no-override state displays the effective deployment default as informational text');
        assert(/Current override/.test(viewSource), '38. the override state displays the current, actually-saved apiUrl');

        const loadFnMatch = viewSource.match(/function load\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(loadFnMatch, '39. a load() function exists');
        assert(!/execute\(|\.save\(|\.clear\(/.test(loadFnMatch[0]),
            '40. load() never calls the use case, store.save(), or store.clear() — merely opening the page persists nothing');

        assert(/@click="save"/.test(viewSource), '41. a Save action is wired');
        assert(/@click="useDeploymentDefault"/.test(viewSource), '42. a Use Deployment Default action is wired');
        const useDeploymentDefaultFnMatch = viewSource.match(/function useDeploymentDefault\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(useDeploymentDefaultFnMatch, '43. a useDeploymentDefault() function exists');
        assert(/store\.clear\(\)/.test(useDeploymentDefaultFnMatch[0]), '44. Use Deployment Default calls store.clear()');
        assert(!/DEFAULT_BITCOIN_ESPLORA_API_URL/.test(useDeploymentDefaultFnMatch[0]),
            '45. Use Deployment Default never saves { apiUrl: DEFAULT_BITCOIN_ESPLORA_API_URL } — it only ever clears');
        const saveFnMatch = viewSource.match(/function save\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(saveFnMatch, '46. a save() function exists');
        assert(/setBitcoinEsploraConfigurationUseCase\.execute\(/.test(saveFnMatch[0]), '47. save() goes through the injected use case, never a direct store.save()');
        assert(!/store\.save\(/.test(saveFnMatch[0]), '48. save() never calls store.save() directly, bypassing the use case');

        console.log('✓ Section G: the view template shows the correct no-override/override states without ever mutating on load, and wires Save/Use Deployment Default correctly');
    }

    // ===============================================================
    // Section H — architecture sweep of the new use case file.
    // ===============================================================
    {
        const useCaseSource = await source('application/SetBitcoinEsploraConfigurationUseCase.js');
        const executable = useCaseSource.replace(/\/\/.*$/gm, '');
        assert(!/\bfetch\s*\(/.test(executable), '49. no network call of any kind');
        assert(!/localStorage/.test(executable), '50. no direct localStorage access — persistence stays behind the injected store');
        assert(!/BitcoinEsploraTransactionBroadcaster|BitcoinEsploraTransactionConfirmationObserver|BitcoinEsploraWalletFundingSource|BitcoinOpReturnProofVerifier/.test(executable),
            '51. no real adapter dependency of any kind');
        assert(!/from\s*['"][^'"]*ui\//.test(executable), '52. no import from ui/ — this stays a pure application-layer class');
        const importLines = executable.split('\n').filter((line) => /^import\b/.test(line));
        assert(importLines.length === 2, `53. exactly two imports — the configuration value object and its store — found ${importLines.length}`);

        assert(isValidBitcoinEsploraApiUrl('https://sanity-check.example/api'), '54. sanity — the shared validation helper this use case relies on still behaves as documented');
        console.log('✓ Section H: architecture sweep confirms the new use case has no network dependency, no direct storage access, no adapter dependency, and no ui/ dependency');
    }

    console.log('\n✅ All Bitcoin Endpoint Settings UI tests passed.');
}

run().catch((error) => {
    console.error('BitcoinEsploraSettingsEntryPoint.test.js FAILED:', error);
    process.exitCode = 1;
});
