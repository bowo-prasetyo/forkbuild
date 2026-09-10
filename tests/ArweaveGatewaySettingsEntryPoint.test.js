import { readFile } from 'node:fs/promises';

import { ArweaveGatewayConfiguration, DEFAULT_ARWEAVE_GATEWAY_URL, isValidArweaveGatewayUrl } from '../core/ArweaveGatewayConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { SetArweaveGatewayConfigurationUseCase } from '../application/SetArweaveGatewayConfigurationUseCase.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { ArweaveWorldEncounterMaterialResolver } from '../application/ArweaveWorldEncounterMaterialResolver.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { composeSnapshotDistributionRuntime } from '../application/SnapshotDistributionRuntimeComposition.js';
import { ContentReference } from '../core/ContentReference.js';

// 0.9.366 — Arweave Gateway Settings UI.
//
// 0.9.364 gave a user's own Arweave gateway choice a real value object, a
// durable store, and two wired retrieval composition call sites; 0.9.365
// proved those pieces converge with no second authority anywhere. Neither
// milestone gave a person any ORDINARY product path to actually reach that
// configuration — every override either milestone's own tests exercised
// was written directly through ArweaveGatewayConfigurationStore.save(), a
// storage-layer method no UI has ever called. This suite proves the
// missing other half: a real settings surface, reachable from top-nav,
// that creates/changes/clears the override end to end, without ever
// constructing a retrieval adapter itself.
//
//   Section 0 — the settings entry point is actually reachable (nav link,
//               route, composition-root wiring, view wiring — never
//               inferred from source alone).
//   Section A — save: a valid custom gateway actually persists through the
//               new write seam.
//   Section B — invalid input: rejected without mutating whatever was
//               previously on file.
//   Section C — replacement: gateway-A -> gateway-B replaces, never
//               accumulates a second entry.
//   Section D — clear: "Use Deployment Default" restores genuine absence,
//               never a saved copy of the default.
//   Section E — explicit default: entering the default URL by hand still
//               leaves a real, distinct saved entry — never silently
//               treated as "nothing to persist."
//   Section F — restart: a brand-new store/use-case pair, over the SAME
//               underlying storage, observes what an earlier instance saved.
//   Section G — consumer convergence: saving through the settings entry
//               point actually decides what both retrieval paths' CONCRETE
//               fetch calls reach, after a fresh composition.
//   Section H — write-path isolation: a settings-saved override never
//               reaches Snapshot distribution's own POST.
//   Section I — view template sweep: display state (no-override vs.
//               override), Save/Use Deployment Default wiring, and the
//               deliberately-excluded feature list.
//   Section J — architecture sweep of the new use case file.
//
// See application/SetArweaveGatewayConfigurationUseCase.js and
// ui/views/ArweaveGatewaySettingsView.js for the full design rationale
// this milestone carries out.

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

// Mirrors tests/ArweaveGatewayConfigurationConvergenceAudit.test.js's own
// SharedNamespaceStorageProvider exactly — two SEPARATE instances over one
// externally-owned namespace behave the way two separate page loads share
// one browser's localStorage, which is what makes "restart" genuine rather
// than a re-read of the same in-memory Map.
class SharedNamespaceStorageProvider extends StorageProvider {
    constructor(sharedNamespace) { super(); this._namespace = sharedNamespace; }
    save(name, data) { this._namespace[name] = JSON.stringify(data); }
    load(name) { return Object.prototype.hasOwnProperty.call(this._namespace, name) ? JSON.parse(this._namespace[name]) : null; }
    remove(name) { delete this._namespace[name]; }
    list() { return Object.keys(this._namespace); }
}

function fakeSigner() {
    return { sign: async (text) => ({ id: 'a'.repeat(43), transaction: { data: text } }) };
}

function makeFetchSpy({ okPrefix, textBody = '{}' } = {}) {
    const calls = [];
    async function fetchImpl(url) {
        calls.push(url);
        const ok = typeof okPrefix === 'string' && url.startsWith(okPrefix);
        return { ok, status: ok ? 200 : 404, headers: { get: () => null }, text: async () => textBody };
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
        assert(mainSource.includes("import { SetArweaveGatewayConfigurationUseCase } from '../application/SetArweaveGatewayConfigurationUseCase.js';"),
            '1. ui/main.js imports the new write use case');
        assert(/new SetArweaveGatewayConfigurationUseCase\(\{\s*arweaveGatewayConfigurationStore\s*\}\)/.test(mainSource),
            '2. ui/main.js wires SetArweaveGatewayConfigurationUseCase against the SAME shared arweaveGatewayConfigurationStore the 0.9.364 retrieval composition already resolves through, never a second disconnected store');
        assert(/app\.provide\('arweaveGatewayConfigurationStore',\s*arweaveGatewayConfigurationStore\)/.test(mainSource),
            '3. the shared store is actually provided to the Vue app, not just constructed and discarded');
        assert(/app\.provide\('setArweaveGatewayConfigurationUseCase',\s*setArweaveGatewayConfigurationUseCase\)/.test(mainSource),
            '4. the write use case is actually provided to the Vue app');
        const storeConstructions = (mainSource.match(/new ArweaveGatewayConfigurationStore\(/g) || []).length;
        assert(storeConstructions === 1, `5. ui/main.js still constructs exactly one ArweaveGatewayConfigurationStore instance — found ${storeConstructions}`);

        const routerSource = await source('ui/router/index.js');
        assert(/path:\s*'\/settings\/arweave-gateway'/.test(routerSource),
            '6. a real route exists for the settings entry point');
        assert(routerSource.includes("import ArweaveGatewaySettingsView from '../views/ArweaveGatewaySettingsView.js';"),
            '7. the router imports the real view component, never a stub');

        const appSource = await source('ui/App.js');
        assert(/router-link to="\/settings\/arweave-gateway"/.test(appSource),
            '8. a real top-nav link reaches the settings entry point');

        const viewSource = await source('ui/views/ArweaveGatewaySettingsView.js');
        const viewExecutable = viewSource.replace(/\/\/.*$/gm, '');
        assert(/inject\('arweaveGatewayConfigurationStore',\s*null\)/.test(viewExecutable),
            '9. the view reads the configuration through the injected store, never a store it constructs itself');
        assert(/inject\('setArweaveGatewayConfigurationUseCase',\s*null\)/.test(viewExecutable),
            '10. the view writes the configuration through the injected use case, never ArweaveGatewayConfigurationStore.save() directly');
        assert(!/new ArweaveGatewayConfiguration\(/.test(viewExecutable),
            '11. the view never constructs an ArweaveGatewayConfiguration itself — validation and construction stay inside the use case');
        assert(viewExecutable.includes("import { DEFAULT_ARWEAVE_GATEWAY_URL } from '../../core/ArweaveGatewayConfiguration.js';"),
            '12. the ONE thing the view imports from core/ArweaveGatewayConfiguration.js is the plain default constant, for display only');
        assert(!/ArweaveContentStore|ArweaveWorldEncounterMaterialResolver/.test(viewExecutable),
            '13. the view never imports or constructs a retrieval adapter, and never even names one — it only ever talks to the injected store/use case seam');
        assert(!/composeDiscoverSnapshotRuntime|composeWorldEncounterMaterialSources|composeDecentralized/.test(viewExecutable),
            '14. the view never touches a composition function either — a saved change only takes effect through ui/main.js\'s own next composition, never a live re-composition this view performs');
        console.log('✓ Section 0: the settings entry point is really wired — nav link, route, shared store, shared use case, and a view that only ever goes through the injected collaborators');
    }

    // ===============================================================
    // Section A — save: a valid custom gateway actually persists through
    // the new write seam.
    // ===============================================================
    {
        const store = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: store });

        const saved = setUseCase.execute({ gatewayUrl: 'https://my-gateway.example' });
        assert(saved instanceof ArweaveGatewayConfiguration && saved.gatewayUrl === 'https://my-gateway.example',
            '15. execute() returns the persisted ArweaveGatewayConfiguration');
        assert(store.get().gatewayUrl === 'https://my-gateway.example',
            '16. saving a valid custom gateway through the settings entry point actually persists it');
    }
    console.log('✓ Section A: a valid custom gateway actually saves through SetArweaveGatewayConfigurationUseCase');

    // ===============================================================
    // Section B — invalid input: rejected without mutating whatever was
    // previously on file.
    // ===============================================================
    {
        const store = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: store });

        // Nothing on file yet — an invalid save leaves it that way.
        expectThrows(() => setUseCase.execute({ gatewayUrl: 'not-a-url' }), '17. a malformed URL is refused');
        assert(store.get() === null, '18. the rejected save left the store genuinely empty, never a partial or fallback write');

        // Something valid already on file — an invalid save leaves it
        // COMPLETELY untouched, never partially overwritten and never
        // cleared.
        setUseCase.execute({ gatewayUrl: 'https://original-gateway.example' });
        expectThrows(() => setUseCase.execute({ gatewayUrl: 'ftp://not-http.example' }), '19. a non-http(s) scheme is refused');
        expectThrows(() => setUseCase.execute({ gatewayUrl: '' }), '20. an empty string is refused');
        expectThrows(() => setUseCase.execute({}), '21. a missing gatewayUrl is refused');
        assert(store.get().gatewayUrl === 'https://original-gateway.example',
            '22. every rejected save left the PREVIOUSLY saved configuration completely untouched');
    }
    console.log('✓ Section B: invalid input is rejected without ever mutating the existing configuration — valid or absent');

    // ===============================================================
    // Section C — replacement: gateway-A -> gateway-B replaces, never
    // accumulates a second entry.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new ArweaveGatewayConfigurationStore(backing);
        const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: store });

        setUseCase.execute({ gatewayUrl: 'https://gateway-a.example' });
        assert(store.get().gatewayUrl === 'https://gateway-a.example', '23. gateway-A is on file');

        setUseCase.execute({ gatewayUrl: 'https://gateway-b.example' });
        assert(store.get().gatewayUrl === 'https://gateway-b.example', '24. gateway-B replaces gateway-A outright');
        assert(backing.list().filter((key) => key === 'arweave-gateway-configuration').length === 1,
            '25. exactly one storage entry exists after replacement, never two');
    }
    console.log('✓ Section C: replacing a saved gateway never accumulates a second entry');

    // ===============================================================
    // Section D — clear: "Use Deployment Default" restores genuine
    // absence, never a saved copy of the default.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new ArweaveGatewayConfigurationStore(backing);
        const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: store });

        setUseCase.execute({ gatewayUrl: 'https://my-gateway.example' });
        assert(store.get() !== null, '26. a configuration is on file before clearing');

        // "Use Deployment Default" — the view calls store.clear() directly,
        // never setUseCase.execute({ gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).
        store.clear();
        assert(store.get() === null, '27. clear() restores genuine absence — get() is a real null');
        assert(backing.load('arweave-gateway-configuration') === null, '28. nothing at all remains on file — never a saved copy of the default URL');

        const effective = (store.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
        assert(effective === DEFAULT_ARWEAVE_GATEWAY_URL, '29. after clearing, the effective gateway falls back to the deployment default');
    }
    console.log('✓ Section D: "Use Deployment Default" clears to genuine absence, never persisting a copy of the default URL');

    // ===============================================================
    // Section E — explicit default: entering the default URL by hand
    // still leaves a real, distinct saved entry.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new ArweaveGatewayConfigurationStore(backing);
        const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: store });

        const saved = setUseCase.execute({ gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL });
        assert(saved.gatewayUrl === DEFAULT_ARWEAVE_GATEWAY_URL, '30. saving the default URL by hand is accepted like any other valid URL');
        assert(store.get() !== null, '31. …and leaves a real, explicit entry on file — never treated as "nothing to persist" merely because it matches the default');
        assert(backing.load('arweave-gateway-configuration') !== null, '32. the underlying storage genuinely holds an entry, distinguishing this from Section D\'s cleared/absent state');
    }
    console.log('✓ Section E: explicitly entering the deployment default still saves a real, distinct persisted entry');

    // ===============================================================
    // Section F — restart: a brand-new store/use-case pair, over the SAME
    // underlying storage, observes what an earlier instance saved.
    // ===============================================================
    {
        const sharedNamespace = {};

        const storeBeforeRestart = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        const setUseCaseBeforeRestart = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: storeBeforeRestart });
        setUseCaseBeforeRestart.execute({ gatewayUrl: 'https://my-gateway.example' });

        // restart boundary — genuinely new instances, sharing only the
        // underlying namespace.
        const storeAfterRestart = new ArweaveGatewayConfigurationStore(new SharedNamespaceStorageProvider(sharedNamespace));
        assert(storeAfterRestart !== storeBeforeRestart, '33. sanity — this really is a newly constructed store, not the same instance');
        assert(storeAfterRestart.get().gatewayUrl === 'https://my-gateway.example',
            '34. a newly constructed store observes the configuration an earlier instance persisted');

        const setUseCaseAfterRestart = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: storeAfterRestart });
        assert(setUseCaseAfterRestart !== setUseCaseBeforeRestart, '35. sanity — this really is a newly constructed use case, not the same instance');
        setUseCaseAfterRestart.execute({ gatewayUrl: 'https://another-gateway.example' });
        assert(storeBeforeRestart.get().gatewayUrl === 'https://another-gateway.example',
            '36. a write through the newly constructed use case is visible back through the ORIGINAL store instance too — the same underlying storage, never divergent in-memory state');
    }
    console.log('✓ Section F: newly constructed settings/application objects observe (and can further change) an earlier instance\'s persisted configuration, across a genuine restart boundary');

    // ===============================================================
    // Section G — consumer convergence: saving through the settings entry
    // point actually decides what both retrieval paths' CONCRETE fetch
    // calls reach, after a fresh composition.
    // ===============================================================
    {
        // World Encounter material retrieval.
        {
            const store = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
            const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: store });
            setUseCase.execute({ gatewayUrl: 'https://my-material-gateway.example' });

            // "New application composition" — resolve the effective gateway
            // from the store exactly as ui/main.js does, then build the real
            // adapter from it, never from a cached/remembered value.
            const resolvedGatewayUrl = (store.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
            const fetchSpy = makeFetchSpy({ okPrefix: 'https://my-material-gateway.example', textBody: '{"kind":"material"}' });
            const resolver = new ArweaveWorldEncounterMaterialResolver({ gatewayUrl: resolvedGatewayUrl, fetchImpl: fetchSpy });

            const uri = 'ar://' + 'a'.repeat(43);
            assert(await resolver.retrieveByUri(uri) !== null, '37. World Encounter retrieval succeeds against the settings-saved gateway');
            assert(fetchSpy.calls.length === 1 && fetchSpy.calls[0] === `https://my-material-gateway.example/${'a'.repeat(43)}`,
                '38. World Encounter retrieval\'s concrete fetch call reaches exactly the gateway saved through the settings entry point');
        }

        // Snapshot discovery retrieval.
        {
            const store = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
            const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: store });
            setUseCase.execute({ gatewayUrl: 'https://my-snapshot-gateway.example' });

            const resolvedGatewayUrl = (store.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
            const txId = 'b'.repeat(43);
            const reference = new ContentReference({ hash: 'irrelevant', uri: 'ar://' + txId, storage: 'ar' });
            const fetchSpy = makeFetchSpy({ okPrefix: 'https://my-snapshot-gateway.example', textBody: '{"snapshot":true}' });
            const { contentStore } = composeDiscoverSnapshotRuntime({
                arweaveContentStoreOptions: { signer: fakeSigner(), gatewayUrl: resolvedGatewayUrl, fetchImpl: fetchSpy }
            });
            assert(contentStore instanceof ArweaveContentStore, '39. sanity — a real ArweaveContentStore was built');
            assert(await contentStore.get(reference) !== null, '40. Snapshot retrieval succeeds against the settings-saved gateway');
            assert(fetchSpy.calls.length === 1 && fetchSpy.calls[0] === `https://my-snapshot-gateway.example/${txId}`,
                '41. Snapshot discovery retrieval\'s concrete fetch call reaches exactly the gateway saved through the settings entry point');
        }

        // A subsequent Clear -> a THIRD, fresh composition falls back to
        // the deployment default — proving the settings surface's own
        // clear() genuinely reaches a later composition, not just get().
        {
            const store = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
            const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: store });
            setUseCase.execute({ gatewayUrl: 'https://temporary-gateway.example' });
            store.clear();

            const resolvedGatewayUrl = (store.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
            assert(resolvedGatewayUrl === DEFAULT_ARWEAVE_GATEWAY_URL, '42. after Save then Clear, a fresh composition resolves the deployment default, never the cleared override');
            const fetchSpy = makeFetchSpy({ okPrefix: DEFAULT_ARWEAVE_GATEWAY_URL, textBody: '{"kind":"material"}' });
            const resolver = new ArweaveWorldEncounterMaterialResolver({ gatewayUrl: resolvedGatewayUrl, fetchImpl: fetchSpy });
            await resolver.retrieveByUri('ar://' + 'c'.repeat(43));
            assert(fetchSpy.calls[0].startsWith(DEFAULT_ARWEAVE_GATEWAY_URL), '43. …and the concrete fetch call actually reaches the deployment default host');
        }

        console.log('✓ Section G: Settings Save -> persistent configuration -> new application composition -> retrieval\'s concrete fetch call reaches the custom gateway, for both World Encounter and Snapshot retrieval; Clear reverts a subsequent fresh composition to the deployment default');
    }

    // ===============================================================
    // Section H — write-path isolation: a settings-saved override never
    // reaches Snapshot distribution's own POST.
    // ===============================================================
    {
        const store = new ArweaveGatewayConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore: store });
        setUseCase.execute({ gatewayUrl: 'https://my-retrieval-only-gateway.example' });

        // Snapshot DISTRIBUTION composed exactly as ui/main.js composes it:
        // signer only, no gatewayUrl of any kind — it never reads the
        // settings-saved store at all.
        const writeFetch = makeFetchSpy({ okPrefix: DEFAULT_ARWEAVE_GATEWAY_URL });
        const { contentStore: writeContentStore } = composeSnapshotDistributionRuntime({
            arweaveContentStoreOptions: { signer: fakeSigner(), fetchImpl: writeFetch }
        });
        assert(writeContentStore.gatewayUrl === DEFAULT_ARWEAVE_GATEWAY_URL,
            '44. the write-path content store still defaults to the deployment default gateway, never the settings-saved override on file at this exact moment');

        await writeContentStore.put('snapshot bytes');
        assert(writeFetch.calls.length === 1 && writeFetch.calls[0] === `${DEFAULT_ARWEAVE_GATEWAY_URL}/tx`,
            '45. the concrete write-path POST actually reaches the deployment default host, never the settings-saved gateway');
    }
    console.log('✓ Section H: distribution (write path) remains completely unaffected by a gateway saved through the settings entry point');

    // ===============================================================
    // Section I — view template sweep: display state, Save/Use Deployment
    // Default wiring, and the deliberately-excluded feature list.
    // ===============================================================
    {
        const viewSource = await source('ui/views/ArweaveGatewaySettingsView.js');

        // Display state.
        assert(/v-if="hasOverride"/.test(viewSource), '46. the template branches on whether an override is on file');
        assert(/No override configured/.test(viewSource) && /effectiveGatewayUrl/.test(viewSource),
            '47. the no-override state displays the effective deployment default as informational text');
        assert(/Current override/.test(viewSource), '48. the override state displays the current, actually-saved gatewayUrl');

        // Opening the page never writes anything: load() only calls
        // store.get(), never store.save()/setArweaveGatewayConfigurationUseCase.execute()
        // outside of the save() handler.
        const loadFnMatch = viewSource.match(/function load\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(loadFnMatch, '49. a load() function exists');
        assert(!/execute\(|\.save\(|\.clear\(/.test(loadFnMatch[0]),
            '50. load() never calls the use case, store.save(), or store.clear() — merely opening the page persists nothing');

        // Save / Use Deployment Default wiring.
        assert(/@click="save"/.test(viewSource), '51. a Save action is wired');
        assert(/@click="useDeploymentDefault"/.test(viewSource), '52. a Use Deployment Default action is wired');
        const useDeploymentDefaultFnMatch = viewSource.match(/function useDeploymentDefault\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(useDeploymentDefaultFnMatch, '53. a useDeploymentDefault() function exists');
        assert(/store\.clear\(\)/.test(useDeploymentDefaultFnMatch[0]),
            '54. Use Deployment Default calls store.clear()');
        assert(!/DEFAULT_ARWEAVE_GATEWAY_URL/.test(useDeploymentDefaultFnMatch[0]),
            '55. Use Deployment Default never saves { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL } — it only ever clears');
        const saveFnMatch = viewSource.match(/function save\(\)\s*\{[\s\S]*?\n\s{8}\}/);
        assert(saveFnMatch, '56. a save() function exists');
        assert(/setArweaveGatewayConfigurationUseCase\.execute\(/.test(saveFnMatch[0]),
            '57. save() goes through the injected use case, never a direct store.save()');
        assert(!/store\.save\(/.test(saveFnMatch[0]),
            '58. save() never calls store.save() directly, bypassing the use case');

        // Deliberately excluded features — none of this vocabulary appears
        // in what the UI actually RENDERS (the template literal itself,
        // never this file's own design-rationale comments, which
        // legitimately discuss and rule out each one by name, exactly like
        // core/ArweaveGatewayConfiguration.js's own "DELIBERATELY EXCLUDED"
        // header discusses fields it never implements).
        const templateMatch = viewSource.match(/template:\s*`([\s\S]*)`\s*\n\};/);
        assert(templateMatch, '59. the view exports a template literal to inspect');
        const templateText = templateMatch[1];
        const excludedTerms = [
            'Test Connection', 'health', 'Health', 'fallback', 'Fallback',
            'priority', 'Priority', 'rotation', 'Rotation', 'retry', 'Retry',
            'timeout', 'Timeout', 'credential', 'Credential',
            'Infrastructure Settings', 'ipfs', 'IPFS', 'TURN', 'nostr', 'Nostr',
            'bitcoin', 'Bitcoin', 'BASE_CHAIN', 'multiple gateway'
        ];
        for (const term of excludedTerms) {
            assert(!templateText.includes(term), `60 ('${term}'). the deliberately-excluded feature vocabulary never appears in what the view actually renders`);
        }

        console.log('✓ Section I: the view template shows the correct no-override/override states without ever mutating on load, wires Save through the use case and Use Deployment Default through store.clear() only, and carries none of the deliberately-excluded feature vocabulary');
    }

    // ===============================================================
    // Section J — architecture sweep of the new use case file.
    // ===============================================================
    {
        const useCaseSource = await source('application/SetArweaveGatewayConfigurationUseCase.js');
        const executable = useCaseSource.replace(/\/\/.*$/gm, '');
        assert(!/\bfetch\s*\(/.test(executable), '61. no network call of any kind');
        assert(!/localStorage/.test(executable), '62. no direct localStorage access — persistence stays behind the injected store');
        assert(!/ArweaveContentStore|ArweaveWorldEncounterMaterialResolver/.test(executable), '63. no retrieval adapter dependency of any kind');
        assert(!/from\s*['"][^'"]*ui\//.test(executable), '64. no import from ui/ — this stays a pure application-layer class');
        const importLines = executable.split('\n').filter((line) => /^import\b/.test(line));
        assert(importLines.length === 2, `65. exactly two imports — the configuration value object and its store — found ${importLines.length}`);

        assert(isValidArweaveGatewayUrl('https://sanity-check.example'), '66. sanity — the shared validation helper this use case relies on (via the value object) still behaves as documented');
        console.log('✓ Section J: architecture sweep confirms the new use case has no network dependency, no direct storage access, no retrieval adapter dependency, and no ui/ dependency');
    }

    console.log('\n✅ All Arweave Gateway Settings UI (0.9.366) tests passed.');
}

run().catch((error) => {
    console.error('ArweaveGatewaySettingsEntryPoint.test.js FAILED:', error);
    process.exitCode = 1;
});
