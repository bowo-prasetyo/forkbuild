// Sounds that aren't speech, for scripts/synthesize-voice-corpus.mjs to put
// beside each language's phrases: typing, a tune, knocking and the murmur of
// people talking far off. Each stands out from the quiet around it, so it
// reaches the speech model (core/voice/SpeechPreparation.js lets silence go),
// where a model told what words to expect (ui/voice/voicePrompt.js) might
// hear one of them. Made the same every time. Not part of the app.

export const NOISE_RATE = 16000;
const SECONDS = 2.5;

// A small seeded random number generator (mulberry32), so each sound is the
// same every run.
function random(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

const SOUNDS = {
    // Keys pressed: short clicks, irregularly.
    'noise-keys': (samples, next) => {
        let at = 0.2;
        while (at < SECONDS - 0.1) {
            const start = Math.floor(at * NOISE_RATE);
            for (let i = 0; i < 0.012 * NOISE_RATE; i += 1) samples[start + i] += (next() * 2 - 1) * 0.45 * Math.exp(-i / (0.002 * NOISE_RATE));
            at += 0.08 + next() * 0.18;
        }
    },
    // A few notes of a tune.
    'noise-music': (samples) => {
        const notes = [523.25, 659.25, 783.99, 659.25, 587.33, 698.46];
        notes.forEach((frequency, n) => {
            const start = Math.floor((0.15 + n * 0.36) * NOISE_RATE);
            for (let i = 0; i < 0.32 * NOISE_RATE; i += 1) {
                const t = i / NOISE_RATE;
                const envelope = Math.min(1, t / 0.02) * Math.exp(-t / 0.18);
                samples[start + i] += 0.25 * envelope * (Math.sin(2 * Math.PI * frequency * t) + 0.4 * Math.sin(4 * Math.PI * frequency * t) + 0.2 * Math.sin(6 * Math.PI * frequency * t));
            }
        });
    },
    // Three knocks on a door.
    'noise-knock': (samples, next) => {
        [0.4, 0.75, 1.1].forEach((at) => {
            const start = Math.floor(at * NOISE_RATE);
            for (let i = 0; i < 0.15 * NOISE_RATE; i += 1) {
                const t = i / NOISE_RATE;
                samples[start + i] += Math.exp(-t / 0.03) * (0.5 * Math.sin(2 * Math.PI * 140 * t) + 0.25 * (next() * 2 - 1));
            }
        });
    },
    // People talking far off: noise shaped like speech, rising and falling a
    // few times a second, with no words in it.
    'noise-babble': (samples, next) => {
        let low = 0;
        let band = 0;
        let syllable = 0;
        let level = 0;
        for (let i = Math.floor(0.2 * NOISE_RATE); i < (SECONDS - 0.2) * NOISE_RATE; i += 1) {
            if (i >= syllable) {
                syllable = i + Math.floor((0.12 + next() * 0.15) * NOISE_RATE);
                level = next() < 0.2 ? 0.05 : 0.5 + next() * 0.5;
            }
            const white = next() * 2 - 1;
            low += 0.08 * (white - low);
            band += 0.25 * (low - band);
            samples[i] += 1.6 * level * (low - band * 0.5);
        }
    }
};

export const NOISES = Object.freeze(Object.keys(SOUNDS));

// `id`'s sound as mono samples at NOISE_RATE.
export function noiseSamples(id, seed = 7) {
    const samples = new Float32Array(Math.round(SECONDS * NOISE_RATE));
    const next = random(seed + NOISES.indexOf(id));
    SOUNDS[id](samples, next);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.max(-1, Math.min(1, samples[i] + (next() * 2 - 1) * 0.002));
    return samples;
}

// `samples` as a 16-bit PCM WAV file.
export function wavBytes(samples, rate = NOISE_RATE) {
    const data = Buffer.alloc(samples.length * 2);
    samples.forEach((sample, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, sample)) * 32767), i * 2));
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(rate, 24);
    header.writeUInt32LE(rate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.writeUInt32LE(data.length, 40);
    return Buffer.concat([header, data]);
}
