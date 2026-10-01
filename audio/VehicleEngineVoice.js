// The sound of the vehicle the local avatar rides, held for as long as it
// rides: a bicycle's tyre hiss, a motorcycle's buzzing two-stroke, a car's low
// rumble and a drone's whine. `setLoad(load)` (0 to 1: speed over top speed)
// raises pitch, brightness and loudness; `stop()` fades it out and frees it.

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
        partials: [{ type: 'sawtooth', from: 48, to: 150, gain: 0.6 }, { type: 'square', from: 96.5, to: 301, gain: 0.25 }],
        noise: { type: 'lowpass', from: 400, to: 1200, q: 0.7, gain: 0.35 },
        filter: { from: 700, to: 2600 },
        gain: [0.12, 0.32]
    },
    car: {
        partials: [{ type: 'sawtooth', from: 34, to: 95, gain: 0.7 }, { type: 'sawtooth', from: 68.3, to: 191, gain: 0.3 }],
        noise: { type: 'lowpass', from: 200, to: 700, q: 0.7, gain: 0.6 },
        filter: { from: 380, to: 1300 },
        gain: [0.14, 0.34]
    },
    drone: {
        partials: [
            { type: 'sawtooth', from: 190, to: 300, gain: 0.35 },
            { type: 'sawtooth', from: 193, to: 305, gain: 0.35 },
            { type: 'square', from: 381, to: 612, gain: 0.12 }
        ],
        noise: { type: 'bandpass', from: 1500, to: 3000, q: 0.9, gain: 0.3 },
        filter: { from: 1500, to: 3200 },
        gain: [0.1, 0.18]
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
