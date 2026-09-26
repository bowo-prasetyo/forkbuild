import { register } from 'node:module';

import { SteemReadingConfigurationStore } from '../storage/SteemReadingConfigurationStore.js';
import { SetSteemReadingConfigurationUseCase } from '../application/settings/SetSteemReadingConfigurationUseCase.js';
import { DEFAULT_STEEM_API_NODES } from '../core/SteemReadingConfiguration.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// The Steem settings page's reading section: it starts from what is in
// effect, never saves the defaults unchanged, and Reset to Defaults clears
// what was saved.

async function run() {
    register(new URL('./support/VueShimLoader.mjs', import.meta.url));
    const { mountComponent } = await import('./support/MinimalVueCompositionApiShim.js');
    const Component = (await import('../ui/views/SteemReadingSettingsView.js')).default;

    const store = new SteemReadingConfigurationStore(new InMemoryStorageProvider());
    const useCase = new SetSteemReadingConfigurationUseCase({ steemReadingConfigurationStore: store });
    const mount = () => mountComponent(Component, { steemReadingConfigurationStore: store, setSteemReadingConfigurationUseCase: useCase });

    let view = mount();
    assert(view.apiNodesInput.value === DEFAULT_STEEM_API_NODES.join('\n'), '1. with nothing saved, the API nodes field starts from the defaults');
    assert(view.unchanged.value === true, '2. the untouched page counts as unchanged, so Save is disabled');
    view.save();
    assert(store.get() === null && view.saveStatus.value === 'idle', '3. pressing Save on the untouched page saves nothing');

    view.apiNodesInput.value = `${DEFAULT_STEEM_API_NODES.join('\n')}\nhttps://steem-node.example`;
    assert(view.unchanged.value === false, '4. adding a node makes the page changed');
    view.save();
    assert(view.saveStatus.value === 'saved' && store.get().apiNodes.at(-1) === 'https://steem-node.example', '5. the changed list saves');

    view = mount();
    assert(view.hasOverride.value === true && view.unchanged.value === true, '6. a fresh mount shows the saved list, unchanged');

    view.resetToDefaults();
    assert(store.get() === null, '7. Reset to Defaults clears what was saved');
    assert(view.apiNodesInput.value === DEFAULT_STEEM_API_NODES.join('\n') && view.clearStatus.value === 'cleared', '8. ...and the page shows the defaults again');

    console.log('✓ Steem settings: starts from the defaults, never saves them unchanged, and resets');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
