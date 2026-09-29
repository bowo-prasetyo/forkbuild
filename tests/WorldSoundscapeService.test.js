import { WorldSoundscapeService } from '../application/world/WorldSoundscapeService.js';
import { SoundSettingsStore } from '../application/settings/SoundSettingsStore.js';
import { ambientMixAt } from '../core/AmbientSoundscape.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { AvatarAnimationState } from '../core/AvatarAnimationState.js';
import { AvatarVerticalState } from '../core/AvatarVerticalState.js';
import { VehicleType } from '../core/VehicleType.js';
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
    setSpatial(spatial) { this.spatial = spatial; }
    setListener(pose) { this.listener = pose; }
    playCue(cue) { this.calls.push(`cue:${cue.kind}`); }
    playEditorCue(cue) { this.calls.push(`edit:${cue}`); }
    setEngine(engine) { this.calls.push(engine ? `engine:${engine.vehicleType}:${engine.load.toFixed(2)}` : 'engine:off'); }
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

// Every render frame turns the avatar's doings into cues and an engine.
{
    const provider = new FakeProvider();
    const frames = [];
    let unsubscribed = false;
    let avatar = { position: { x: 0, y: 0, z: 0 }, animation: AvatarAnimationState.WALKING, verticalState: AvatarVerticalState.SUPPORTED, vehicleType: null };
    const service = new WorldSoundscapeService({
        provider,
        settingsStore: new SoundSettingsStore({ storageProvider: new InMemoryStorageProvider() }),
        listenerPosition: () => avatar.position,
        seed: DEFAULT_WORLD_SEED,
        avatarObservation: () => avatar,
        onRenderFrame: (callback) => { frames.push(callback); return () => { unsubscribed = true; }; },
        setIntervalFn: () => 1,
        clearIntervalFn: () => {}
    });
    service.start();
    assert(frames.length === 1, 'the service listens to render frames');
    const tick = (dx) => {
        avatar = { ...avatar, position: { ...avatar.position, x: avatar.position.x + dx } };
        frames[0](1 / 60);
    };
    for (let i = 0; i < 60; i++) tick(3 / 60);
    const steps = provider.calls.filter((c) => c === 'cue:footstep').length;
    assert(steps >= 3 && steps <= 5, `a second of walking plays about 4 footsteps (${steps})`);
    assert(!provider.calls.some((c) => c.startsWith('engine')), 'no engine on foot');

    avatar = { ...avatar, vehicleType: VehicleType.CAR };
    for (let i = 0; i < 30; i++) tick(6 / 60);
    const engines = provider.calls.filter((c) => c.startsWith('engine:car'));
    assert(engines.length >= 1, 'riding starts the engine');
    assert(engines.length < 5, `a steady speed doesn't re-send the engine every frame (${engines.length})`);
    assert(engines[engines.length - 1] === 'engine:car:0.50', `half speed is half load (${engines[engines.length - 1]})`);

    avatar = { ...avatar, vehicleType: null };
    tick(0);
    assert(provider.calls[provider.calls.length - 1] === 'engine:off', 'getting off stops the engine');
    const count = provider.calls.length;
    tick(0);
    assert(provider.calls.length === count, 'on foot and still, nothing more is sent');

    service.dispose();
    assert(unsubscribed, 'dispose() stops listening to frames');
    service.frame(1 / 60);
    assert(provider.calls.length === count, 'a disposed service plays nothing');
    console.log('✓ avatar sounds every frame');
}

// Without an avatar observation there is no frame listener at all.
{
    let subscribed = false;
    const service = new WorldSoundscapeService({
        provider: new FakeProvider(),
        settingsStore: new SoundSettingsStore({ storageProvider: new InMemoryStorageProvider() }),
        listenerPosition: () => null,
        seed: DEFAULT_WORLD_SEED,
        onRenderFrame: () => { subscribed = true; return () => {}; },
        setIntervalFn: () => 1,
        clearIntervalFn: () => {}
    });
    service.start();
    assert(!subscribed, 'ambient-only needs no frames');
    service.dispose();
    console.log('✓ ambient-only without an avatar');
}

// World View's own edits are heard as in the Editor, until disposed.
{
    const provider = new FakeProvider();
    let listener = null;
    let unsubscribed = false;
    const service = new WorldSoundscapeService({
        provider,
        settingsStore: new SoundSettingsStore({ storageProvider: new InMemoryStorageProvider() }),
        listenerPosition: () => null,
        seed: DEFAULT_WORLD_SEED,
        onCommandActivity: (l) => { listener = l; return () => { unsubscribed = true; }; },
        setIntervalFn: () => 1,
        clearIntervalFn: () => {}
    });
    service.start();
    assert(typeof listener === 'function', 'the service listens to World edits');
    listener('executed', { type: 'create-world-landmark', children: [] });
    listener('executed', { type: 'create-world-resident', children: [] });
    listener('undone', { type: 'create-world-resident', children: [] });
    listener('executed', { type: 'unknown-thing', children: [] });
    const edits = provider.calls.filter((c) => c.startsWith('edit:'));
    assert(edits.join() === 'edit:mark,edit:place,edit:undo', `landmark, resident and undo are heard (${edits})`);
    service.dispose();
    assert(unsubscribed, 'dispose() stops listening to edits');
    console.log('✓ World View edits');
}

// The listener follows the camera every frame, and 3D can be turned off and on.
{
    const provider = new FakeProvider();
    const storage = new InMemoryStorageProvider();
    const frames = [];
    let pose = { position: { x: 1, y: 2, z: 3 }, forward: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 } };
    const service = new WorldSoundscapeService({
        provider,
        settingsStore: new SoundSettingsStore({ storageProvider: storage }),
        listenerPosition: () => null,
        seed: DEFAULT_WORLD_SEED,
        listenerPose: () => pose,
        onRenderFrame: (callback) => { frames.push(callback); return () => {}; },
        setIntervalFn: () => 1,
        clearIntervalFn: () => {}
    });
    service.start();
    assert(provider.spatial === true, '3D is on to start');
    frames[0](1 / 60);
    assert(provider.listener === pose, 'the listener is handed over each frame');
    pose = { ...pose, position: { x: 5, y: 2, z: 3 } };
    frames[0](1 / 60);
    assert(provider.listener.position.x === 5, 'and follows as it moves');
    const off = service.toggleSpatial();
    assert(off.spatial === false && provider.spatial === false, 'toggleSpatial() turns 3D off');
    assert(new SoundSettingsStore({ storageProvider: storage }).get().spatial === false, 'and it is remembered');
    service.toggleSpatial();
    assert(provider.spatial === true, 'and back on');
    service.dispose();
    console.log('✓ listener pose and the 3D toggle');
}
