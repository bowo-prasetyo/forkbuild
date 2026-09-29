// Plays World View's and the Editor's sound with the Web Audio API: the
// ambient layers, the local avatar's footsteps, jumps and landings
// (audio/AvatarSoundSynth.js), the engine of what it rides
// (audio/VehicleEngineVoice.js), animals and residents (audio/CreatureSoundSynth.js)
// and Editor edits (audio/EditorSoundSynth.js). Every sound is synthesized
// from noise and oscillators, so nothing is downloaded and there are no audio
// files to license. What to play comes from the services in application/;
// these files only decide how it sounds.
//
// The AudioContext is made on the first resume(), which the view calls from a
// user gesture: browsers refuse to start audio before one. While the page is
// hidden or sound is muted the context is suspended, so it costs no CPU.

import { AVATAR_SOUND_CUE } from '../core/AvatarSoundCues.js';
import { playFootstep, playJump, playLanding } from './AvatarSoundSynth.js';
import { VehicleEngineVoice, hasEngineVoice } from './VehicleEngineVoice.js';
import { CREATURE_SOUND_CUE } from '../core/CreatureSoundCues.js';
import {
    playAnimalCall, playAnimalStep, playCatchOrRelease, playResidentGreet, playResidentSpeech, playResidentStep
} from './CreatureSoundSynth.js';
import { playEditorSound, hasEditorSound } from './EditorSoundSynth.js';

const LAYERS = ['wind', 'birds', 'insects', 'water', 'stream'];
// The avatar's own sounds sit in front of the ambience.
const EFFECTS_GAIN = 0.7;
// A placed cue's nodes are let go once it has surely finished.
const PLACED_CUE_SECONDS = 4;

// Each layer's gain at level 1, balanced by ear so no single layer dominates.
const LAYER_PEAK = Object.freeze({ wind: 0.4, birds: 0.35, insects: 0.035, water: 0.35, stream: 0.2 });

// Time constant of a level change: walking into a forest fades birds in over
// a couple of seconds rather than switching them on.
const LEVEL_TIME_CONSTANT = 0.8;
const VOLUME_TIME_CONSTANT = 0.05;
const NOISE_SECONDS = 4;
const BIRD_AUDIBLE_LEVEL = 0.05;

function defaultContextFactory() {
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    return AudioContextClass ? new AudioContextClass() : null;
}

export class WebAudioSoundscapeProvider {
    constructor({
        contextFactory = defaultContextFactory,
        documentRef = globalThis.document ?? null,
        random = Math.random,
        ambience = true,
        setTimeoutFn = globalThis.setTimeout.bind(globalThis),
        clearTimeoutFn = globalThis.clearTimeout.bind(globalThis)
    } = {}) {
        this._contextFactory = contextFactory;
        this._document = documentRef;
        this._random = random;
        // Without ambience (the Editor) there are no layers or birds, only cues.
        this._ambience = Boolean(ambience);
        this._setTimeout = setTimeoutFn;
        this._clearTimeout = clearTimeoutFn;
        this._context = null;
        this._master = null;
        this._layerGains = {};
        this._effects = null;
        this._effectsNoise = null;
        this._engineVoice = null;
        this._engine = null;
        this._sources = [];
        this._levels = Object.fromEntries(LAYERS.map((layer) => [layer, 0]));
        this._volume = 0.5;
        this._muted = false;
        this._unlocked = false;
        this._disposed = false;
        this._birdTimer = null;
        this._onVisibilityChange = () => this._syncRunning();
        if (this._document && typeof this._document.addEventListener === 'function') {
            this._document.addEventListener('visibilitychange', this._onVisibilityChange);
        }
    }

    // The AudioContext, once made; null before the first resume() or where
    // Web Audio is missing.
    get context() {
        return this._context;
    }

    resume() {
        if (this._disposed) {
            return;
        }
        this._unlocked = true;
        if (!this._context) {
            this._build();
        }
        this._syncRunning();
    }

    setLayerLevels(levels) {
        for (const layer of LAYERS) {
            const value = Number(levels?.[layer]);
            this._levels[layer] = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
        }
        if (!this._context) {
            return;
        }
        const now = this._context.currentTime;
        for (const layer of LAYERS) {
            this._layerGains[layer].gain.setTargetAtTime(this._levels[layer] * LAYER_PEAK[layer], now, LEVEL_TIME_CONSTANT);
        }
    }

    // A footstep, jump or landing (core/AvatarSoundCues.js). Dropped unless
    // audio is playing: a suspended context would otherwise play every queued
    // cue at once when it resumes.
    playCue(cue) {
        if (!cue || !this._isPlaying()) {
            return;
        }
        const args = [this._context, this._effects, this._effectsNoise, cue.surface, cue.intensity, this._random];
        if (cue.kind === AVATAR_SOUND_CUE.FOOTSTEP) {
            playFootstep(...args);
        } else if (cue.kind === AVATAR_SOUND_CUE.JUMP) {
            playJump(...args);
        } else if (cue.kind === AVATAR_SOUND_CUE.LAND) {
            playLanding(...args);
        }
    }

    // An animal's or resident's sound (core/CreatureSoundCues.js), at the
    // loudness and left/right position the cue carries. Dropped, like every
    // cue, unless audio is playing.
    playCreatureCue(cue) {
        if (!cue || !this._isPlaying()) {
            return;
        }
        const context = this._context;
        const level = context.createGain();
        level.gain.value = Math.min(1, Math.max(0, Number(cue.gain) || 0));
        let output = level;
        if (typeof context.createStereoPanner === 'function') {
            const panner = context.createStereoPanner();
            panner.pan.value = Math.min(1, Math.max(-1, Number(cue.pan) || 0));
            level.connect(panner);
            output = panner;
        }
        output.connect(this._effects);
        const noise = this._effectsNoise;
        const random = this._random;
        switch (cue.kind) {
            case CREATURE_SOUND_CUE.ANIMAL_CALL:
                playAnimalCall(context, level, noise, cue.species, Boolean(cue.startled), random);
                break;
            case CREATURE_SOUND_CUE.ANIMAL_STEP:
                playAnimalStep(context, level, noise, cue.species, random);
                break;
            case CREATURE_SOUND_CUE.CATCH:
            case CREATURE_SOUND_CUE.RELEASE:
                playCatchOrRelease(context, level, noise, cue.kind === CREATURE_SOUND_CUE.CATCH, random);
                break;
            case CREATURE_SOUND_CUE.RESIDENT_GREET:
                playResidentGreet(context, level, cue.voice, random);
                break;
            case CREATURE_SOUND_CUE.RESIDENT_SPEECH:
                playResidentSpeech(context, level, cue.voice, cue.syllables, random);
                break;
            case CREATURE_SOUND_CUE.RESIDENT_STEP:
                playResidentStep(context, level, noise, random);
                break;
            default:
                break;
        }
        this._setTimeout(() => {
            level.disconnect();
            output.disconnect();
        }, PLACED_CUE_SECONDS * 1000);
    }

    // An Editor edit's sound (core/EditorSoundCues.js).
    playEditorCue(cue) {
        if (!hasEditorSound(cue) || !this._isPlaying()) {
            return;
        }
        playEditorSound(this._context, this._effects, this._effectsNoise, cue);
    }

    // `engine` is { vehicleType, load } while riding, null on foot.
    setEngine(engine) {
        this._engine = engine && hasEngineVoice(engine.vehicleType) ? engine : null;
        if (!this._context) {
            return;
        }
        if (this._engineVoice && (!this._engine || this._engineVoice.vehicleType !== this._engine.vehicleType)) {
            this._engineVoice.stop();
            this._engineVoice = null;
        }
        if (!this._engine) {
            return;
        }
        if (!this._engineVoice) {
            this._engineVoice = new VehicleEngineVoice(this._context, this._effects, this._effectsNoise, this._engine.vehicleType, this._random);
        }
        this._engineVoice.setLoad(this._engine.load);
    }

    setVolume(volume) {
        const value = Number(volume);
        if (!Number.isFinite(value)) {
            return;
        }
        this._volume = Math.min(1, Math.max(0, value));
        this._applyMaster();
    }

    setMuted(muted) {
        this._muted = Boolean(muted);
        this._applyMaster();
        this._syncRunning();
    }

    dispose() {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        if (this._document && typeof this._document.removeEventListener === 'function') {
            this._document.removeEventListener('visibilitychange', this._onVisibilityChange);
        }
        if (this._birdTimer !== null) {
            this._clearTimeout(this._birdTimer);
            this._birdTimer = null;
        }
        for (const source of this._sources) {
            try {
                source.stop();
            } catch {
                // Already stopped.
            }
        }
        this._sources = [];
        if (this._engineVoice) {
            this._engineVoice.stop();
            this._engineVoice = null;
        }
        if (this._context && typeof this._context.close === 'function' && this._context.state !== 'closed') {
            this._context.close().catch(() => {});
        }
    }

    _masterTarget() {
        return this._muted ? 0 : this._volume;
    }

    _applyMaster() {
        if (!this._master) {
            return;
        }
        this._master.gain.setTargetAtTime(this._masterTarget(), this._context.currentTime, VOLUME_TIME_CONSTANT);
    }

    _isPlaying() {
        return Boolean(this._context) && this._context.state === 'running' && this._shouldRun();
    }

    _shouldRun() {
        return this._unlocked && !this._muted && !this._disposed && !(this._document && this._document.hidden);
    }

    _syncRunning() {
        const context = this._context;
        if (!context || context.state === 'closed') {
            return;
        }
        if (this._shouldRun()) {
            if (context.state !== 'running' && typeof context.resume === 'function') {
                try {
                    context.resume().catch(() => {});
                } catch {
                    // A context that can't resume stays silent.
                }
            }
            if (this._ambience) {
                this._scheduleBird();
            }
        } else if (context.state === 'running' && typeof context.suspend === 'function') {
            context.suspend().catch(() => {});
        }
    }

    _build() {
        let context = null;
        try {
            context = this._contextFactory();
        } catch {
            context = null;
        }
        if (!context) {
            return;
        }
        this._context = context;
        this._master = context.createGain();
        this._master.gain.value = this._masterTarget();
        this._master.connect(context.destination);
        for (const layer of LAYERS) {
            const gain = context.createGain();
            gain.gain.value = this._levels[layer] * LAYER_PEAK[layer];
            gain.connect(this._master);
            this._layerGains[layer] = gain;
        }
        const white = this._noiseBuffer(false);
        if (this._ambience) {
            const brown = this._noiseBuffer(true);
            this._buildWind(brown);
            this._buildWater(brown);
            this._buildStream(white);
            this._buildInsects();
        }
        this._effects = context.createGain();
        this._effects.gain.value = EFFECTS_GAIN;
        this._effects.connect(this._master);
        this._effectsNoise = white;
        if (this._engine) {
            this.setEngine(this._engine);
        }
    }

    _noiseBuffer(brown) {
        const context = this._context;
        const length = Math.floor(context.sampleRate * NOISE_SECONDS);
        const buffer = context.createBuffer(1, length, context.sampleRate);
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < length; i++) {
            const white = this._random() * 2 - 1;
            if (brown) {
                // Integrated white noise: the deep rumble of wind and waves.
                last = (last + 0.02 * white) / 1.02;
                data[i] = last * 3.5;
            } else {
                data[i] = white;
            }
        }
        return buffer;
    }

    _loop(buffer, offsetSeconds = 0) {
        const source = this._context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        source.start(0, offsetSeconds % NOISE_SECONDS);
        this._sources.push(source);
        return source;
    }

    // A slow oscillator added onto `param`, swinging it by ±depth.
    _modulate(param, frequency, depth, type = 'sine') {
        const oscillator = this._context.createOscillator();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        const amount = this._context.createGain();
        amount.gain.value = depth;
        oscillator.connect(amount);
        amount.connect(param);
        oscillator.start();
        this._sources.push(oscillator);
    }

    _filter(type, frequency, q) {
        const filter = this._context.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = q;
        return filter;
    }

    // Low rumble whose loudness and brightness drift in slow gusts.
    _buildWind(brown) {
        const filter = this._filter('lowpass', 500, 0.7);
        this._modulate(filter.frequency, 0.07, 250);
        const gust = this._context.createGain();
        gust.gain.value = 0.65;
        this._modulate(gust.gain, 0.13, 0.3);
        this._loop(brown).connect(filter);
        filter.connect(gust);
        gust.connect(this._layerGains.wind);
    }

    // Soft waves lapping at a shore, a few seconds apart.
    _buildWater(brown) {
        const filter = this._filter('lowpass', 900, 0.5);
        const waves = this._context.createGain();
        waves.gain.value = 0.55;
        this._modulate(waves.gain, 0.18, 0.4);
        this._loop(brown, NOISE_SECONDS / 2).connect(filter);
        filter.connect(waves);
        waves.connect(this._layerGains.water);
    }

    // A brighter, busier hiss for running water.
    _buildStream(white) {
        const filter = this._filter('bandpass', 1800, 0.6);
        const babble = this._context.createGain();
        babble.gain.value = 0.8;
        this._modulate(babble.gain, 3.1, 0.15);
        this._modulate(filter.frequency, 0.4, 300);
        this._loop(white).connect(filter);
        filter.connect(babble);
        babble.connect(this._layerGains.stream);
    }

    // Crickets: a high tone chopped into a fast trill that comes and goes.
    _buildInsects() {
        const tone = this._context.createOscillator();
        tone.type = 'sine';
        tone.frequency.value = 4400;
        const trill = this._context.createGain();
        trill.gain.value = 0.5;
        this._modulate(trill.gain, 24, 0.5, 'square');
        const pulse = this._context.createGain();
        pulse.gain.value = 0.5;
        this._modulate(pulse.gain, 0.45, 0.5);
        tone.connect(trill);
        trill.connect(pulse);
        pulse.connect(this._layerGains.insects);
        tone.start();
        this._sources.push(tone);
    }

    // Birdsong is a series of separate calls rather than a loop, more often
    // the more birds there are, so it never repeats audibly.
    _scheduleBird() {
        if (this._birdTimer !== null || !this._context) {
            return;
        }
        const level = this._levels.birds;
        const delayMs = (4500 - 3600 * level) * (0.5 + this._random());
        this._birdTimer = this._setTimeout(() => {
            this._birdTimer = null;
            if (!this._shouldRun()) {
                return;
            }
            if (this._context.state === 'running' && this._levels.birds > BIRD_AUDIBLE_LEVEL) {
                this._playBirdCall();
            }
            this._scheduleBird();
        }, delayMs);
    }

    _playBirdCall() {
        const context = this._context;
        const notes = 2 + Math.floor(this._random() * 4);
        const base = 2200 + this._random() * 2000;
        const rising = this._random() < 0.5;
        const output = typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : context.createGain();
        if (output.pan) {
            output.pan.value = this._random() * 1.6 - 0.8;
        }
        output.connect(this._layerGains.birds);
        let start = context.currentTime + 0.02;
        for (let i = 0; i < notes; i++) {
            const length = 0.06 + this._random() * 0.08;
            const from = base * (1 + (this._random() - 0.5) * 0.15);
            const to = from * (rising ? 1.35 : 0.75);
            const oscillator = context.createOscillator();
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(from, start);
            oscillator.frequency.exponentialRampToValueAtTime(to, start + length);
            const envelope = context.createGain();
            envelope.gain.setValueAtTime(0, start);
            envelope.gain.linearRampToValueAtTime(1, start + 0.01);
            envelope.gain.exponentialRampToValueAtTime(0.001, start + length);
            oscillator.connect(envelope);
            envelope.connect(output);
            oscillator.start(start);
            oscillator.stop(start + length + 0.02);
            if (i === notes - 1) {
                // Frees the call's nodes once its last note ends.
                oscillator.onended = () => output.disconnect();
            }
            start += length + 0.03 + this._random() * 0.05;
        }
    }
}
