import { DEFAULT_LOOK_SETTINGS, LOOK, normalizeLookSettings } from '../core/app/LookSettings.js';
import { LookSettingsStore } from '../application/settings/LookSettingsStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// The choice of look (core/app/LookSettings.js): like this device until chosen,
// read leniently, and kept on this device only.
{
    assert(DEFAULT_LOOK_SETTINGS.look === LOOK.AUTO, 'the look follows the device by default');
    for (const bad of [null, 'dark', 42, { look: 'purple' }, { look: 7 }]) {
        assert(normalizeLookSettings(bad).look === LOOK.AUTO, `${JSON.stringify(bad)} follows the device`);
    }
    assert(normalizeLookSettings({ look: 'dark' }).look === LOOK.DARK && normalizeLookSettings({ look: 'light' }).look === LOOK.LIGHT, 'a choice is kept');
    assert(Object.isFrozen(normalizeLookSettings({})), 'settings are immutable');

    const storage = new InMemoryStorageProvider();
    const store = new LookSettingsStore({ storageProvider: storage });
    assert(store.get().look === LOOK.AUTO, 'nothing stored follows the device');
    store.save({ look: LOOK.DARK, extra: 'dropped' });
    assert(new LookSettingsStore({ storageProvider: storage }).get().look === LOOK.DARK, 'Dark is remembered');
    assert(JSON.stringify(storage.load('look-settings')) === '{"look":"dark"}', 'and only the choice is stored');
    class ThrowingStorage extends StorageProvider {
        load() { throw new Error('not loaded'); }
    }
    assert(new LookSettingsStore({ storageProvider: new ThrowingStorage() }).get().look === LOOK.AUTO, 'a storage error follows the device');
    console.log('✓ the look follows the device until chosen, and the choice is kept on this device');
}
