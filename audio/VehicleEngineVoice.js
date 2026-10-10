// The sound of the vehicle the local avatar rides, held for as long as it
// rides: a bicycle's tyre hiss, a penny-farthing's (MOTORCYCLE) slower tick
// and rim hiss, a hay wagon's (CAR) wooden wheels rumbling and knocking, and a
// hot-air balloon's (DRONE) burner roar. The wheeled ones are silent standing
// still. `setLoad(load)` (0 to 1: speed over top speed) raises pitch,
// brightness and loudness; `stop()` fades it out and frees it.

const RAMP_TIME_CONSTANT = 0.15;
const FADE_SECONDS = 0.4;
// Engines sit at half the level the profiles below were first tuned to, so a
// ride stays in the background of the soundscape.
const ENGINE_GAIN = 0.5;

// Oscillator partials (frequency at load 0 and at load 1, gain), noise
// (filter frequency at load 0 and 1, gain), overall gain at load 0 and 1.
const ENGINE_PROFILE = Object.freeze({
    bicycle: {
        partials: [],
        noise: { type: 'bandpass', from: 1800, to: 4200, q: 0.8, gain: 1 },
        tick: { from: 2, to: 9 },
        gain: [0, 0.18]
    },
    motorcycle: {
        partials: [],
        noise: { type: 'bandpass', from: 1200, to: 3200, q: 0.9, gain: 1 },
        tick: { from: 1, to: 5 },
        gain: [0, 0.16]
    },
    car: {
        partials: [],
        noise: { type: 'lowpass', from: 260, to: 900, q: 0.8, gain: 1 },
        tick: { from: 1.5, to: 6 },
        gain: [0, 0.45]
    },
    drone: {
        partials: [{ type: 'triangle', from: 50, to: 64, gain: 0.25 }],
        noise: { type: 'bandpass', from: 500, to: 1100, q: 0.5, gain: 0.8 },
        filter: { from: 900, to: 2000 },
        gain: [0.14, 0.24]
    }
});

const lerp = (a, b, t) => a + (b - a) * t;

export function hasEngineVoice(vehicleType) {
    return Object.hasOwn(ENGINE_PROFILE, vehicleType);
}

export class VehicleEngineVoice {
    constructor(context, destination, noise, vehicleType, random = Math.random) {
        this._context = context;
        this._profile = ENGINE_PROFILE[vehicleType];
        this.vehicleType = vehicleType;
        this._sources = [];
        this._partials = [];
        this._output = context.createGain();
        this._output.gain.value = 0;
        this._output.connect(destination);

        const profile = this._profile;
        this._tone = context.createBiquadFilter();
        this._tone.type = 'lowpass';
        this._tone.frequency.value = profile.filter ? profile.filter.from : 20000;
        this._tone.connect(this._output);
        for (const partial of profile.partials) {
            const oscillator = context.createOscillator();
            oscillator.type = partial.type;
            oscillator.frequency.value = partial.from;
            const gain = context.createGain();
            gain.gain.value = partial.gain;
            oscillator.connect(gain);
            gain.connect(this._tone);
            oscillator.start();
            this._sources.push(oscillator);
            this._partials.push({ oscillator, partial });
        }

        const noiseSource = context.createBufferSource();
        noiseSource.buffer = noise;
        noiseSource.loop = true;
        this._noiseFilter = context.createBiquadFilter();
        this._noiseFilter.type = profile.noise.type;
        this._noiseFilter.frequency.value = profile.noise.from;
        this._noiseFilter.Q.value = profile.noise.q;
        const noiseGain = context.createGain();
        noiseGain.gain.value = profile.noise.gain;
        noiseSource.connect(this._noiseFilter);
        this._noiseFilter.connect(noiseGain);
        if (profile.tick) {
            // A freewheel's clicking: the hiss chopped by a square wave whose rate
            // follows the wheel.
            const chopper = context.createGain();
            chopper.gain.value = 0.6;
            this._tick = context.createOscillator();
            this._tick.type = 'square';
            this._tick.frequency.value = profile.tick.from;
            const depth = context.createGain();
            depth.gain.value = 0.4;
            this._tick.connect(depth);
            depth.connect(chopper.gain);
            this._tick.start();
            this._sources.push(this._tick);
            noiseGain.connect(chopper);
            chopper.connect(this._output);
        } else {
            noiseGain.connect(this._tone);
        }
        noiseSource.start(0, random() * noise.duration);
        this._sources.push(noiseSource);
        this._load = 0;
        this.setLoad(0);
    }

    setLoad(load) {
        const t = Math.min(1, Math.max(0, Number(load) || 0));
        this._load = t;
        const now = this._context.currentTime;
        const profile = this._profile;
        for (const { oscillator, partial } of this._partials) {
            oscillator.frequency.setTargetAtTime(lerp(partial.from, partial.to, t), now, RAMP_TIME_CONSTANT);
        }
        if (profile.filter) {
            this._tone.frequency.setTargetAtTime(lerp(profile.filter.from, profile.filter.to, t), now, RAMP_TIME_CONSTANT);
        }
        this._noiseFilter.frequency.setTargetAtTime(lerp(profile.noise.from, profile.noise.to, t), now, RAMP_TIME_CONSTANT);
        if (this._tick) {
            this._tick.frequency.setTargetAtTime(lerp(profile.tick.from, profile.tick.to, t), now, RAMP_TIME_CONSTANT);
        }
        this._output.gain.setTargetAtTime(ENGINE_GAIN * lerp(profile.gain[0], profile.gain[1], t), now, RAMP_TIME_CONSTANT);
    }

    stop() {
        const now = this._context.currentTime;
        this._output.gain.cancelScheduledValues(now);
        this._output.gain.setTargetAtTime(0, now, FADE_SECONDS / 4);
        for (const source of this._sources) {
            try {
                source.stop(now + FADE_SECONDS);
            } catch {
                // Already stopped.
            }
        }
        const last = this._sources[this._sources.length - 1];
        const output = this._output;
        if (last) {
            last.onended = () => output.disconnect();
        }
    }
}
