import { readFile } from 'node:fs/promises';
import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { RoleAwareProviderResolver } from '../application/settings/RoleAwareProviderResolver.js';
import { ResolvePreferredRoleProviderUseCase } from '../application/settings/ResolvePreferredRoleProviderUseCase.js';
import {
    PreferredSnapshotPlacementCreationCoordinator,
    NON_PREFERABLE_CONTENT_STORAGE_TYPES
} from '../application/snapshot/placement/PreferredSnapshotPlacementCreationCoordinator.js';

// Content Provider settings no longer offer "Local".
//
// Every Publication is already stored on this device before any placement
// is made, so "Local" is never a meaningful CONTENT preference. This suite
// proves:
//   A. preferableStorageTypes() drops 'local' while availableStorageTypes()
//      (explicit placement, resolution) still reports it.
//   B. a legacy saved CONTENT -> local preference is treated exactly like
//      NO_PREFERENCE by "Use Preferred Provider" — never acted on.
//   C. an explicit 'local' placement and a real preference (ipfs) are
//      unaffected.
//   D. ui/views/ContentProviderSettingsView.js lists preferableStorageTypes()
//      and shows a saved 'local' as nothing selected.

let assertionCount = 0;
function assert(condition, message) {
    assertionCount += 1;
    if (!condition) throw new Error(`ASSERT FAILED: ${assertionCount}. ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeCoordinator(storageTypes = ['local', 'ipfs', 'ar']) {
    const calls = [];
    const inner = {
        availableStorageTypes: () => storageTypes.slice(),
        async create(publicationId, storage) {
            calls.push({ publicationId, storage });
            if (!storage) throw new Error('CreateExternalSnapshotPlacementUseCase: storage is required');
            return { outcome: 'created', placement: { storage }, reason: null };
        }
    };
    const store = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
    const registry = { get: (key) => (storageTypes.includes(key) ? { storage: key } : null) };
    const resolver = new RoleAwareProviderResolver({
        preferenceStore: store,
        discoveryRegistry: { get: () => null },
        contentRegistry: registry,
        proofRegistry: { get: () => null }
    });
    const resolveUseCase = new ResolvePreferredRoleProviderUseCase({ preferenceStore: store, resolver });
    const coordinator = new PreferredSnapshotPlacementCreationCoordinator(inner, resolveUseCase);
    return { coordinator, store, calls };
}

async function run() {
    // Section A
    {
        const { coordinator } = makeCoordinator();
        assert(NON_PREFERABLE_CONTENT_STORAGE_TYPES.includes('local'), "'local' is declared non-preferable");
        assert(coordinator.availableStorageTypes().includes('local'), "availableStorageTypes() still reports 'local'");
        assert(JSON.stringify(coordinator.preferableStorageTypes()) === JSON.stringify(['ipfs', 'ar']),
            "preferableStorageTypes() drops 'local' and keeps registry order");
    }
    console.log("✓ Section A: preferableStorageTypes() excludes 'local'");

    // Section B
    {
        const { coordinator, store, calls } = makeCoordinator();
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'local' }));
        let error = null;
        try { await coordinator.create('pub-1'); } catch (e) { error = e; }
        assert(error && /storage is required/.test(error.message),
            'a legacy CONTENT -> local preference refuses exactly like NO_PREFERENCE');
        assert(calls.length === 1 && calls[0].storage === null,
            "the wrapped coordinator is called with no storage, never 'local'");
    }
    console.log('✓ Section B: a legacy saved Local preference is treated as no preference');

    // Section C
    {
        const { coordinator, store } = makeCoordinator();
        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'local' }));
        const explicit = await coordinator.create('pub-2', 'local');
        assert(explicit.placement.storage === 'local', "an explicit 'local' placement is still honoured");

        store.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'ipfs' }));
        const preferred = await coordinator.create('pub-3');
        assert(preferred.placement.storage === 'ipfs', 'a real ipfs preference still resolves and places onto ipfs');
    }
    console.log('✓ Section C: explicit Local placement and real preferences are unaffected');

    // Section D
    {
        const source = await readFile(new URL('../ui/views/ContentProviderSettingsView.js', import.meta.url), 'utf8');
        assert(/preferredPlacementCreationCoordinator\.preferableStorageTypes\(\)/.test(source),
            'the settings view lists preferableStorageTypes()');
        assert(!/availableStorageTypes\(\)\s*:\s*\[\]/.test(source),
            'the settings view no longer builds its option list from availableStorageTypes()');
        assert(/isSelectable: \(key\) => !isUnofferedProviderKey\(key\)/.test(source),
            "a saved 'local' preference is displayed as nothing selected");
        assert(/previously saved "Local" preference no longer applies/.test(source),
            'the view explains why a legacy Local preference is no longer selected');
        assert(!/from '\.\.\/\.\.\/application\/snapshot\/placement\/PreferredSnapshotPlacementCreationCoordinator\.js'/.test(source),
            'the view never imports the coordinator module directly — it only uses the injected instance');
    }
    console.log('✓ Section D: the settings view never offers Local');

    console.log(`\n✅ All Content Provider Preference Excludes Local tests passed (${assertionCount} assertions).`);
}

run().catch((error) => {
    console.error('ContentProviderPreferenceExcludesLocal.test.js FAILED:', error);
    process.exit(1);
});
