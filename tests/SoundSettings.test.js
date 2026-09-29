import { DEFAULT_SOUND_SETTINGS, DEFAULT_SOUND_VOLUME, normalizeSoundSettings } from '../core/SoundSettings.js';
import { SoundSettingsStore } from '../application/settings/SoundSettingsStore.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// Sound is on at half volume until the user says otherwise.
{
    assert(DEFAULT_SOUND_SETTINGS.muted === false, 'sound is on by default');
    assert(DEFAULT_SOUND_SETTINGS.volume === DEFAULT_SOUND_VOLUME, 'the default volume is the documented one');
    console.log('✓ defaults: on, at the default volume');
}

// Anything unreadable falls back to the default, and volume stays within 0..1.
{
    for (const bad of [null, undefined, 'loud', 42, [], { muted: 'yes', volume: 'x' }]) {
        const settings = normalizeSoundSettings(bad);
        assert(settings.muted === false && settings.volume === DEFAULT_SOUND_VOLUME, `${JSON.stringify(bad)} reads as the default`);
    }
    assert(normalizeSoundSettings({ volume: 7 }).volume === 1, 'a volume above 1 is clamped to 1');
    assert(normalizeSoundSettings({ volume: -1 }).volume === 0, 'a volume below 0 is clamped to 0');
    assert(normalizeSoundSettings({ muted: true, volume: 0.2 }).muted === true, 'muted is kept');
    assert(Object.isFrozen(normalizeSoundSettings({})), 'settings are immutable');
    console.log('✓ settings are read leniently and clamped');
}

// The store keeps the choice across visits and survives a damaged entry.
{
    const storage = new InMemoryStorageProvider();
    const store = new SoundSettingsStore({ storageProvider: storage });
    assert(store.get().muted === false, 'nothing stored reads as the default');
    const saved = store.save({ muted: true, volume: 0.8 });
    assert(saved.muted === true && saved.volume === 0.8, 'save() returns what was stored');
    const again = new SoundSettingsStore({ storageProvider: storage }).get();
    assert(again.muted === true && again.volume === 0.8, 'a new store reads the saved choice');

    storage.save('sound-settings', 'garbage');
    assert(store.get().volume === DEFAULT_SOUND_VOLUME, 'a damaged entry reads as the default');

    class ThrowingStorage extends StorageProvider {
        load() { throw new Error('not loaded'); }
    }
    assert(new SoundSettingsStore({ storageProvider: new ThrowingStorage() }).get().muted === false,
        'a storage error reads as the default');

    let threw = false;
    try {
        new SoundSettingsStore({ storageProvider: {} });
    } catch {
        threw = true;
    }
    assert(threw, 'a StorageProvider is required');
    console.log('✓ SoundSettingsStore keeps the choice and tolerates damage');
}

// 3D is on unless turned off, and an older saved choice reads as 3D.
{
    assert(DEFAULT_SOUND_SETTINGS.spatial === true, '3D is on by default');
    assert(normalizeSoundSettings({ muted: true, volume: 0.3 }).spatial === true, 'a choice saved before 3D existed reads as 3D');
    assert(normalizeSoundSettings({ spatial: false }).spatial === false, 'turning 3D off is kept');
    const storage = new InMemoryStorageProvider();
    const store = new SoundSettingsStore({ storageProvider: storage });
    store.save({ muted: false, volume: 0.4, spatial: false });
    assert(new SoundSettingsStore({ storageProvider: storage }).get().spatial === false, '3D off is remembered');
    console.log('✓ the 3D choice');
}
