// World View's sound: samples the land around the listener a few times a
// second and hands the resulting layer levels to a sound provider, which fades
// between them; every render frame, turns what the local avatar is doing into
// footsteps, jumps, landings and a vehicle engine; and ten times a second,
// turns the animals, residents and other players around it into calls, steps,
// speech and the engines of what the players ride.
// Owns the device's mute and volume preference.
//
// The provider is an adapter (audio/WebAudioSoundscapeProvider.js in the
// browser) with resume(), setLayerLevels(levels), playCue(cue),
// playCreatureCue(cue), playEditorCue(cue), setEngine(engine),
// setRemoteEngines(engines),
// setListener(pose), setSpatial(spatial), setVolume(volume), setMuted(muted),
// setMusic(enabled), setMusicMood(mood) and dispose(). The music's mood
// follows the day: warm by day, slow and low after dark (core/MusicScore.js).
// Browsers keep audio silent until the user interacts with the page, so the
// view calls unlock() from its first key press or tap.
import { ambientMixAt, ambientMixAtNight, ambientMixInRain, silentAmbientMix } from '../../core/AmbientSoundscape.js';
import { advanceAvatarSound, createAvatarSoundState } from '../../core/AvatarSoundCues.js';
import { advanceCreatureSound, createCreatureSoundState } from '../../core/CreatureSoundCues.js';
import { SoundPreference } from '../settings/SoundPreference.js';
import { editorSoundCueFor } from '../../core/EditorSoundCues.js';
import { musicMoodFor } from '../../core/MusicScore.js';

const DEFAULT_SAMPLE_INTERVAL_MS = 250;
// Moving less than this since the last sample can't change what is heard.
const RESAMPLE_DISTANCE = 0.5;
// Nor can night deepening or lifting, or rain growing or easing, by less
// than this.
const RESAMPLE_NIGHT_STEP = 0.05;
const RESAMPLE_RAIN_STEP = 0.05;
// An engine's load changes smaller than this aren't worth a new ramp.
const ENGINE_LOAD_STEP = 0.02;
// Animals and residents are looked at this often: often enough to catch a
// hop, rarely enough to cost nothing.
const CREATURE_SAMPLE_SECONDS = 0.1;

export class WorldSoundscapeService {
    constructor({
        provider,
        settingsStore,
        listenerPosition,
        seed,
        avatarObservation = null,
        creatureObservation = null,
        listenerPose = null,
        onRenderFrame = null,
        onCommandActivity = null,
        nightLevel = null,
        rainLevel = null,
        sheltered = null,
        sampleIntervalMs = DEFAULT_SAMPLE_INTERVAL_MS,
        setIntervalFn = globalThis.setInterval.bind(globalThis),
        clearIntervalFn = globalThis.clearInterval.bind(globalThis)
    }) {
        if (!provider || !settingsStore || typeof listenerPosition !== 'function') {
            throw new Error('WorldSoundscapeService requires a provider, a settingsStore and a listenerPosition function');
        }
        this._provider = provider;
        this._listenerPosition = listenerPosition;
        this._seed = seed;
        this._sampleIntervalMs = sampleIntervalMs;
        this._setInterval = setIntervalFn;
        this._clearInterval = clearIntervalFn;
        this._preference = new SoundPreference({ provider, settingsStore });
        this._interval = null;
        this._lastSampledAt = null;
        // How deep into the night it is, 0 to 1 (core/DayCycle.js); absent, always day.
        this._nightLevel = typeof nightLevel === 'function' ? nightLevel : () => 0;
        this._lastSampledNight = 0;
        // How hard it rains, 0 to 1 (core/Weather.js); absent, never.
        this._rainLevel = typeof rainLevel === 'function' ? rainLevel : () => 0;
        this._lastSampledRain = 0;
        // Whether the listener is under a roof, where rain drums on it; absent, never.
        this._sheltered = typeof sheltered === 'function' ? sheltered : () => false;
        this._lastSampledSheltered = false;
        this._avatarObservation = typeof avatarObservation === 'function' ? avatarObservation : null;
        this._onRenderFrame = typeof onRenderFrame === 'function' ? onRenderFrame : null;
        this._avatarSoundState = createAvatarSoundState();
        this._creatureObservation = typeof creatureObservation === 'function' ? creatureObservation : null;
        this._creatureSoundState = createCreatureSoundState();
        this._creatureSeconds = CREATURE_SAMPLE_SECONDS;
        this._listenerPose = typeof listenerPose === 'function' ? listenerPose : null;
        this._engine = null;
        this._frameUnsubscribe = null;
        this._onCommandActivity = typeof onCommandActivity === 'function' ? onCommandActivity : null;
        this._activityUnsubscribe = null;
        this._disposed = false;
    }

    start() {
        if (this._interval !== null || this._disposed) {
            return;
        }
        this._preference.apply();
        this.sample();
        this._interval = this._setInterval(() => this.sample(), this._sampleIntervalMs);
        if ((this._avatarObservation || this._creatureObservation || this._listenerPose) && this._onRenderFrame) {
            this._frameUnsubscribe = this._onRenderFrame((deltaSeconds) => this.frame(deltaSeconds));
        }
        // World View's own edits (places, residents, decorations) sound as they
        // do in the Editor.
        if (this._onCommandActivity) {
            this._activityUnsubscribe = this._onCommandActivity((activity, command) => {
                const cue = editorSoundCueFor(activity, command);
                if (cue) {
                    this._provider.playEditorCue(cue);
                }
            });
        }
    }

    // One render frame of the local avatar's own sounds.
    frame(deltaSeconds) {
        if (this._disposed) {
            return;
        }
        // Where 3D sound is heard from follows the avatar and camera every frame.
        if (this._listenerPose) {
            const pose = this._listenerPose();
            if (pose) {
                this._provider.setListener(pose);
            }
        }
        if (this._avatarObservation) {
            const { state, cues, engine } = advanceAvatarSound(
                this._avatarSoundState, this._avatarObservation(), deltaSeconds, this._seed
            );
            this._avatarSoundState = state;
            for (const cue of cues) {
                this._provider.playCue(cue);
            }
            this._updateEngine(engine);
        }
        if (this._creatureObservation) {
            this._creatureSeconds += Number.isFinite(deltaSeconds) && deltaSeconds > 0 ? deltaSeconds : 0;
            if (this._creatureSeconds >= CREATURE_SAMPLE_SECONDS) {
                const elapsed = this._creatureSeconds;
                this._creatureSeconds = 0;
                this.sampleCreatures(elapsed);
            }
        }
    }

    // One look at the animals and residents around the listener.
    // `deltaSeconds` is the time since the last look.
    sampleCreatures(deltaSeconds = CREATURE_SAMPLE_SECONDS) {
        if (this._disposed || !this._creatureObservation) {
            return;
        }
        const { state, cues, engines } = advanceCreatureSound(this._creatureSoundState, this._creatureObservation(), {
            seed: this._seed, deltaSeconds
        });
        this._creatureSoundState = state;
        for (const cue of cues) {
            this._provider.playCreatureCue(cue);
        }
        this._provider.setRemoteEngines(engines);
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
        const night = this._nightLevel();
        const rain = this._rainLevel();
        const underRoof = Boolean(this._sheltered());
        this._provider.setMusicMood?.(musicMoodFor({ view: 'world', nightLevel: night }));
        if (this._lastSampledAt
            && Math.hypot(position.x - this._lastSampledAt.x, position.z - this._lastSampledAt.z) < RESAMPLE_DISTANCE
            && Math.abs(night - this._lastSampledNight) < RESAMPLE_NIGHT_STEP
            && Math.abs(rain - this._lastSampledRain) < RESAMPLE_RAIN_STEP
            && (rain === 0) === (this._lastSampledRain === 0)
            && underRoof === this._lastSampledSheltered) {
            return;
        }
        this._lastSampledAt = { x: position.x, z: position.z };
        this._lastSampledNight = night;
        this._lastSampledRain = rain;
        this._lastSampledSheltered = underRoof;
        this._provider.setLayerLevels(ambientMixInRain(ambientMixAtNight(ambientMixAt(this._seed, position.x, position.z), night), rain, underRoof));
    }

    settings() {
        return this._preference.settings();
    }

    setMuted(muted) {
        return this._preference.setMuted(muted);
    }

    toggleMuted() {
        return this._preference.toggleMuted();
    }

    setVolume(volume) {
        return this._preference.setVolume(volume);
    }

    toggleSpatial() {
        return this._preference.toggleSpatial();
    }

    toggleMusic() {
        return this._preference.toggleMusic();
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
        if (typeof this._activityUnsubscribe === 'function') {
            this._activityUnsubscribe();
            this._activityUnsubscribe = null;
        }
        this._provider.dispose();
    }
}
