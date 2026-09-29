import { WorldSoundscapeService } from '../application/world/WorldSoundscapeService.js';
import { SoundSettingsStore } from '../application/settings/SoundSettingsStore.js';
import { ambientMixAt } from '../core/AmbientSoundscape.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

class FakeProvider {
    constructor() {
        this.calls = [];
        this.levels = null;
        this.volume = null;
        this.muted = null;
        this.resumed = 0;
        this.disposed = false;
    }
    resume() { this.resumed++; this.calls.push('resume'); }
    setLayerLevels(levels) { this.levels = levels; this.calls.push('levels'); }
    setVolume(volume) { this.volume = volume; }
    setMuted(muted) { this.muted = muted; }
    dispose() { this.disposed = true; }
}

function build({ position = { x: 10, y: 0, z: -20 }, storage = new InMemoryStorageProvider() } = {}) {
    const provider = new FakeProvider();
    const listener = { position };
    const timers = [];
    const service = new WorldSoundscapeService({
        provider,
        settingsStore: new SoundSettingsStore({ storageProvider: storage }),
        listenerPosition: () => listener.position,
        seed: DEFAULT_WORLD_SEED,
        setIntervalFn: (fn, ms) => { timers.push({ fn, ms, cleared: false }); return timers.length - 1; },
        clearIntervalFn: (id) => { timers[id].cleared = true; }
    });
    return { service, provider, listener, timers, storage };
}

// start() applies the saved preference and plays the mix where the listener is.
{
    const storage = new InMemoryStorageProvider();
    storage.save('sound-settings', { muted: true, volume: 0.3 });
    const { service, provider, timers } = build({ storage });
    service.start();
    assert(provider.muted === true && provider.volume === 0.3, 'the saved preference reaches the provider');
    assert(JSON.stringify(provider.levels) === JSON.stringify(ambientMixAt(DEFAULT_WORLD_SEED, 10, -20)),
        'the first mix is the one at the listener');
    assert(timers.length === 1 && timers[0].ms === 250, 'the land is resampled four times a second');
    service.start();
    assert(timers.length === 1, 'starting twice does not add a second timer');
    assert(provider.resumed === 0, 'nothing resumes audio before a user gesture');
    console.log('✓ start() applies the preference and the local mix');
}

// Moving changes the mix; standing still does not resample.
{
    const { service, provider, listener, timers } = build();
    service.start();
    const count = provider.calls.filter((c) => c === 'levels').length;
    listener.position = { x: 10.2, y: 0, z: -20.1 };
    timers[0].fn();
    assert(provider.calls.filter((c) => c === 'levels').length === count, 'a tiny move is not resampled');
    listener.position = { x: 500, y: 0, z: 800 };
    timers[0].fn();
    assert(JSON.stringify(provider.levels) === JSON.stringify(ambientMixAt(DEFAULT_WORLD_SEED, 500, 800)),
        'a real move plays the new place');
    listener.position = null;
    timers[0].fn();
    assert(Object.values(provider.levels).every((v) => v === 0), 'no listener means silence');
    listener.position = { x: 500, y: 0, z: 800 };
    timers[0].fn();
    assert(Object.values(provider.levels).some((v) => v > 0), 'a listener that returns is heard again, even at the same spot');
    console.log('✓ the mix follows the listener');
}

// unlock(), mute and volume.
{
    const storage = new InMemoryStorageProvider();
    const { service, provider } = build({ storage });
    service.start();
    service.unlock();
    assert(provider.resumed === 1, 'unlock() resumes audio');

    const muted = service.toggleMuted();
    assert(muted.muted === true && provider.muted === true, 'toggleMuted() mutes');
    assert(new SoundSettingsStore({ storageProvider: storage }).get().muted === true, 'muting is remembered');
    const resumedBefore = provider.resumed;
    service.toggleMuted();
    assert(provider.muted === false && provider.resumed === resumedBefore + 1, 'unmuting (a click or key press) resumes audio');

    service.setVolume(0.9);
    assert(provider.volume === 0.9 && service.settings().volume === 0.9, 'setVolume() reaches the provider');
    service.setVolume('nope');
    assert(service.settings().volume === 0.9, 'an invalid volume is ignored');
    service.setVolume(3);
    assert(service.settings().volume === 1, 'volume is clamped');
    console.log('✓ unlock, mute and volume');
}

// dispose() stops sampling and releases audio, once.
{
    const { service, provider, timers } = build();
    service.start();
    service.dispose();
    service.dispose();
    assert(timers[0].cleared, 'the sampling timer is cleared');
    assert(provider.disposed, 'the provider is disposed');
    const count = provider.calls.length;
    service.sample();
    service.unlock();
    service.start();
    assert(provider.calls.length === count, 'a disposed service does nothing');
    console.log('✓ dispose() stops everything');
}

// Missing collaborators are refused.
{
    let threw = false;
    try {
        new WorldSoundscapeService({ provider: new FakeProvider(), settingsStore: null, listenerPosition: () => null });
    } catch {
        threw = true;
    }
    assert(threw, 'a settings store is required');
    console.log('✓ required collaborators are checked');
}
