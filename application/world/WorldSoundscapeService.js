// World View's sound: samples the land around the listener a few times a
// second and hands the resulting layer levels to a sound provider, which fades
// between them; and, every render frame, turns what the local avatar is doing
// into footsteps, jumps, landings and a vehicle engine. Owns the device's mute
// and volume preference.
//
// The provider is an adapter (audio/WebAudioSoundscapeProvider.js in the
// browser) with resume(), setLayerLevels(levels), playCue(cue),
// setEngine(engine), setVolume(volume), setMuted(muted) and dispose().
// Browsers keep audio silent until the user interacts with the page, so the
// view calls unlock() from its first key press or tap.
import { ambientMixAt, silentAmbientMix } from '../../core/AmbientSoundscape.js';
import { advanceAvatarSound, createAvatarSoundState } from '../../core/AvatarSoundCues.js';

const DEFAULT_SAMPLE_INTERVAL_MS = 250;
// Moving less than this since the last sample can't change what is heard.
const RESAMPLE_DISTANCE = 0.5;
// An engine's load changes smaller than this aren't worth a new ramp.
const ENGINE_LOAD_STEP = 0.02;

export class WorldSoundscapeService {
    constructor({
        provider,
        settingsStore,
        listenerPosition,
        seed,
        avatarObservation = null,
        onRenderFrame = null,
        sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
        setIntervalFn = globalThis.setInterval.bind(globalThis),
        clearIntervalFn = globalThis.clearInterval.bind(globalThis)
    }) {
        if (!provider || !settingsStore || typeof listenerPosition !== 'function') {
            throw new Error('WorldSoundscapeService requires a provider, a settingsStore and a listenerPosition function');
        }
        this._provider = provider;
        this._settingsStore = settingsStore;
        this._listenerPosition = listenerPosition;
        this._seed = seed;
        this._sampleIntervalMs = sampleIntervalMs;
        this._setInterval = setIntervalFn;
        this._clearInterval = clearIntervalFn;
        this._settings = settingsStore.get();
        this._interval = null;
        this._lastSampledAt = null;
        this._avatarObservation = typeof avatarObservation === 'function' ? avatarObservation : null;
        this._onRenderFrame = typeof onRenderFrame === 'function' ? onRenderFrame : null;
        this._avatarSoundState = createAvatarSoundState();
        this._engine = null;
        this._frameUnsubscribe = null;
        this._disposed = false;
    }

    start() {
        if (this._interval !== null || this._disposed) {
            return;
        }
        this._provider.setVolume(this._settings.volume);
        this._provider.setMuted(this._settings.muted);
        this.sample();
        this._interval = this._setInterval(() => this.sample(), this._sampleIntervalMs);
        if (this._avatarObservation && this._onRenderFrame) {
            this._frameUnsubscribe = this._onRenderFrame((deltaSeconds) => this.frame(deltaSeconds));
        }
    }

    // One render frame of the local avatar's own sounds.
    frame(deltaSeconds) {
        if (this._disposed || !this._avatarObservation) {
            return;
        }
        const { state, cues, engine } = advanceAvatarSound(
            this._avatarSoundState, this._avatarObservation(), deltaSeconds, this._seed
        );
        this._avatarSoundState = state;
        for (const cue of cues) {
            this._provider.playCue(cue);
        }
        this._updateEngine(engine);
    }

    _updateEngine(engine) {
        const current = this._engine;
        if (!engine && !current) {
            return;
        }
        if (engine && current && engine.vehicleType === current.vehicleType
            && Math.abs(engine.load - current.load) < ENGINE_LOAD_STEP) {
            return;
        }
        this._engine = engine;
        this._provider.setEngine(engine);
    }

    // Called from a user gesture: the only moment a browser lets audio start.
    unlock() {
        if (this._disposed) {
            return;
        }
        this._provider.resume();
    }

    sample() {
        if (this._disposed) {
            return;
        }
        const position = this._listenerPosition();
        if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z)) {
            this._lastSampledAt = null;
            this._provider.setLayerLevels(silentAmbientMix());
            return;
        }
        if (this._lastSampledAt
            && Math.hypot(position.x - this._lastSampledAt.x, position.z - this._lastSampledAt.z) < RESAMPLE_DISTANCE) {
            return;
        }
        this._lastSampledAt = { x: position.x, z: position.z };
        this._provider.setLayerLevels(ambientMixAt(this._seed, position.x, position.z));
    }

    settings() {
        return this._settings;
    }

    setMuted(muted) {
        this._settings = this._settingsStore.save({ ...this._settings, muted: Boolean(muted) });
        this._provider.setMuted(this._settings.muted);
        if (!this._settings.muted) {
            this._provider.resume();
        }
        return this._settings;
    }

    toggleMuted() {
        return this.setMuted(!this._settings.muted);
    }

    setVolume(volume) {
        const next = Number(volume);
        if (!Number.isFinite(next)) {
            return this._settings;
        }
        this._settings = this._settingsStore.save({ ...this._settings, volume: next });
        this._provider.setVolume(this._settings.volume);
        return this._settings;
    }

    dispose() {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        if (this._interval !== null) {
            this._clearInterval(this._interval);
            this._interval = null;
        }
        if (typeof this._frameUnsubscribe === 'function') {
            this._frameUnsubscribe();
            this._frameUnsubscribe = null;
        }
        this._provider.dispose();
    }
}
