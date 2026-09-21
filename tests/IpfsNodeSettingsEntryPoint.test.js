import { readFile } from 'node:fs/promises';

import { IpfsNodeConfiguration, isValidIpfsNodeApiUrl } from '../core/IpfsNodeConfiguration.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { IpfsNodeConfigurationStore } from '../storage/IpfsNodeConfigurationStore.js';
import { SetIpfsNodeConfigurationUseCase } from '../application/SetIpfsNodeConfigurationUseCase.js';

// User-Configurable IPFS Node API URL Settings UI.
//
// Mirrors tests/IpfsGatewaySettingsEntryPoint.test.js's own structure, one
// axis over: this setting configures the WRITE path (content/
// IpfsContentStore.js's own `apiUrl`, the real Kubo node new Content gets
// PLACED onto), never the READ-path gateway list that suite's own subject
// governs instead. There is no new route/nav-link here — unlike the
// gateway setting, this field lives directly on the existing Content
// Provider settings page (ui/views/ContentProviderSettingsView.js), reached
// exactly the same way the provider-preference radio buttons already are.
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
        assert(mainSource.includes("import { IpfsNodeConfigurationStore } from '../storage/IpfsNodeConfigurationStore.js';"),
            '1. ui/main.js imports the new store');
        assert(mainSource.includes("import { SetIpfsNodeConfigurationUseCase } from '../application/SetIpfsNodeConfigurationUseCase.js';"),
            '2. ui/main.js imports the new write use case');
        const storeConstructions = (mainSource.match(/new IpfsNodeConfigurationStore\(/g) || []).length;
        assert(storeConstructions === 1, `3. ui/main.js constructs exactly one IpfsNodeConfigurationStore instance — found ${storeConstructions}`);
        assert(/new SetIpfsNodeConfigurationUseCase\(\{\s*ipfsNodeConfigurationStore\s*\}\)/.test(mainSource),
            '4. ui/main.js wires SetIpfsNodeConfigurationUseCase against the SAME shared ipfsNodeConfigurationStore, never a second disconnected store');
        assert(/app\.provide\('ipfsNodeConfigurationStore',\s*ipfsNodeConfigurationStore\)/.test(mainSource),
            '5. the shared store is actually provided to the Vue app, not just constructed and discarded');
        assert(/app\.provide\('setIpfsNodeConfigurationUseCase',\s*setIpfsNodeConfigurationUseCase\)/.test(mainSource),
            '6. the write use case is actually provided to the Vue app');

        assert(/const resolvedIpfsNodeApiUrl = \(ipfsNodeConfigurationStore\.get\(\) \|\| \{ apiUrl: DEFAULT_IPFS_NODE_API_URL \}\)\.apiUrl;/.test(mainSource),
            '7. the resolved apiUrl falls back to DEFAULT_IPFS_NODE_API_URL only when nothing is on file, never treats absence as a saved default');
        assert(mainSource.includes('new IpfsContentStore({ apiUrl: resolvedIpfsNodeApiUrl })'),
            '8. the real Kubo write-path construction site actually consumes the resolved apiUrl, not a hardcoded default');

        const viewSource = await source('ui/views/ContentProviderSettingsView.js');
        const viewExecutable = viewSource.replace(/\/\/.*$/gm, '');
        assert(/inject\('ipfsNodeConfigurationStore',\s*null\)/.test(viewExecutable),
            '9. the view reads the configuration through the injected store, never a store it constructs itself');
        assert(/inject\('setIpfsNodeConfigurationUseCase',\s*null\)/.test(viewExecutable),
            '10. the view writes the configuration through the injected use case, never IpfsNodeConfigurationStore.save() directly');
        assert(!/new IpfsNodeConfiguration\(/.test(viewExecutable),
            '11. the view never constructs an IpfsNodeConfiguration itself — validation and construction stay inside the use case');
        assert(viewExecutable.includes("import { DEFAULT_IPFS_NODE_API_URL } from '../../core/IpfsNodeConfiguration.js';"),
            '12. the ONE thing the view imports from core/IpfsNodeConfiguration.js is the plain default constant, for display only');
        console.log('✓ Section 0: the settings entry point is really wired — shared store, shared use case, the real write-path construction site consuming it, and a view that only ever goes through the injected collaborators');
    }

    // ===============================================================
    // Section A — save: a valid custom node URL actually persists through
    // the new write seam.
    // ===============================================================
    {
        const store = new IpfsNodeConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetIpfsNodeConfigurationUseCase({ ipfsNodeConfigurationStore: store });

        const saved = setUseCase.execute({ apiUrl: 'https://remote-node.example:5001' });
        assert(saved instanceof IpfsNodeConfiguration && saved.apiUrl === 'https://remote-node.example:5001',
            '13. execute() returns the persisted IpfsNodeConfiguration');
        assert(store.get().apiUrl === 'https://remote-node.example:5001',
            '14. saving a valid custom node URL through the settings entry point actually persists it');
    }
    console.log('✓ Section A: a valid custom node URL actually saves through SetIpfsNodeConfigurationUseCase');

    // ===============================================================
    // Section B — invalid input: rejected without mutating whatever was
    // previously on file.
    // ===============================================================
    {
        const store = new IpfsNodeConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetIpfsNodeConfigurationUseCase({ ipfsNodeConfigurationStore: store });

        expectThrows(() => setUseCase.execute({ apiUrl: 'not-a-url' }), '15. a malformed URL is refused');
        assert(store.get() === null, '16. the rejected save left the store genuinely empty');

        setUseCase.execute({ apiUrl: 'https://original-node.example:5001' });
        expectThrows(() => setUseCase.execute({ apiUrl: 'ftp://not-http.example' }), '17. a non-http(s) scheme is refused');
        expectThrows(() => setUseCase.execute({ apiUrl: '' }), '18. an empty string is refused');
        expectThrows(() => setUseCase.execute({}), '19. a missing apiUrl is refused');
        assert(store.get().apiUrl === 'https://original-node.example:5001',
            '20. every rejected save left the PREVIOUSLY saved configuration completely untouched');
    }
    console.log('✓ Section B: invalid input is rejected without ever mutating the existing configuration — valid or absent');

    // ===============================================================
    // Section C — replacement: node-A -> node-B replaces, never accumulates
    // a second entry.
    // ===============================================================
    {
        const backing = new InMemoryStorageProvider();
        const store = new IpfsNodeConfigurationStore(backing);
        const setUseCase = new SetIpfsNodeConfigurationUseCase({ ipfsNodeConfigurationStore: store });

        setUseCase.execute({ apiUrl: 'https://node-a.example:5001' });
        setUseCase.execute({ apiUrl: 'https://node-b.example:5001' });
        assert(store.get().apiUrl === 'https://node-b.example:5001', '21. node-B replaces node-A outright');
        assert(backing.list().filter((key) => key === 'ipfs-node-configuration').length === 1,
            '22. exactly one storage entry exists after replacement, never two');
    }
    console.log('✓ Section C: replacing a saved node URL never accumulates a second entry');

    // ===============================================================
    // Section D — clear: "Use Deployment Default" restores genuine
    // absence, never a saved copy of the default.
    // ===============================================================
    {
        const store = new IpfsNodeConfigurationStore(new InMemoryStorageProvider());
        const setUseCase = new SetIpfsNodeConfigurationUseCase({ ipfsNodeConfigurationStore: store });
        setUseCase.execute({ apiUrl: 'https://remote-node.example:5001' });
        assert(store.get() !== null, '23. sanity — a configuration is on file before clear()');
        store.clear();
        assert(store.get() === null, '24. clear() restores genuine absence, never a saved copy of the deployment default');
    }
    console.log('✓ Section D: clear() restores genuine absence');

    // ===============================================================
    // Section E — isolation: this is the WRITE path, structurally
    // separate from the READ-path gateway setting and from IPFS remote
    // publishing (which stays deliberately ephemeral/unpersisted).
    // ===============================================================
    {
        const nodeConfigExecutable = (await source('core/IpfsNodeConfiguration.js')).replace(/\/\/.*$/gm, '');
        assert(!/IpfsGatewayConfiguration/.test(nodeConfigExecutable),
            '25. core/IpfsNodeConfiguration.js never imports or references the separate, read-path gateway configuration class in executable code');

        const remotePublishingExecutable = (await source('application/IpfsRemotePublishingConfiguration.js')).replace(/\/\/.*$/gm, '');
        assert(!/IpfsNodeConfiguration|IpfsNodeConfigurationStore/.test(remotePublishingExecutable),
            '26. the ephemeral remote-publishing configuration is completely unaffected — it still never persists anything');

        const kuboExecutable = (await source('content/IpfsContentStore.js')).replace(/\/\/.*$/gm, '');
        assert(!/IpfsNodeConfiguration|IpfsNodeConfigurationStore/.test(kuboExecutable),
            '27. content/IpfsContentStore.js itself stays unaware of persistence — it only ever accepts a plain apiUrl constructor option, unchanged');
        console.log('✓ Section E: the new write-path setting stays structurally isolated from the read-path gateway setting, from ephemeral remote-publishing configuration, and from IpfsContentStore itself');
    }

    // ===============================================================
    // Section F — architecture sweep of the new use case file.
    // ===============================================================
    {
        const useCaseSource = await source('application/SetIpfsNodeConfigurationUseCase.js');
        const executable = useCaseSource.replace(/\/\/.*$/gm, '');
        assert(!/\bfetch\s*\(/.test(executable), '28. no network call of any kind');
        assert(!/localStorage/.test(executable), '29. no direct localStorage access — persistence stays behind the injected store');
        assert(!/IpfsContentStore/.test(executable), '30. no write-adapter dependency of any kind — this class only ever builds and persists the value object');
        assert(!/from\s*['"][^'"]*ui\//.test(executable), '31. no import from ui/ — this stays a pure application-layer class');
        const importLines = executable.split('\n').filter((line) => /^import\b/.test(line));
        assert(importLines.length === 2, `32. exactly two imports — the configuration value object and its store — found ${importLines.length}`);

        assert(isValidIpfsNodeApiUrl('https://sanity-check.example'), '33. sanity — the shared validation helper this use case relies on still behaves as documented');
        console.log('✓ Section F: architecture sweep confirms the new use case has no network dependency, no direct storage access, no write-adapter dependency, and no ui/ dependency');
    }

    console.log('\n✅ All User-Configurable IPFS Node API URL Settings UI tests passed.');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
