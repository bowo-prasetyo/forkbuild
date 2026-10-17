// Rain made of drops (audio/WebAudioSoundscapeProvider.js plays it). Rain is
// not a hiss: it is thousands of separate impacts, each a click a millisecond
// or two long, most of them faint and a few loud, and some of the drops that
// land in water trap a bubble that rings for a moment with a rising "plink"
// (the bubble's Minnaert resonance; van den Doel, "Physically based models
// for liquid sounds", 2005). White noise through a filter has none of that
// grain: every sample is as loud as the next, which the ear hears as static.
//
// So the rain is built in two parts. A bed of countless small drops is
// rendered once into a stereo buffer (each ear its own drops, so the rain is
// all round you rather than inside your head) and looped. Over it, nearer,
// louder drops are played one at a time from a bank of rendered drops, at
// random moments, pitches and places, more of them the harder it rains, so
// what the ear picks out never repeats.

// The drops' own random sequence (mulberry32): the rain's textures are
// rendered from a fixed seed, so rendering them takes nothing from the random
// sequence every other sound is varied with.
export function dropRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// A drop on a hard or leafy surface: a short, broadband tick. Big drops
// (loud ones) land with a longer, duller tick than small ones, as they do.
function addTick(data, at, amplitude, random, sampleRate) {
    const size = 0.5 * random() + 0.5 * amplitude;
    const decay = (0.00015 + size * 0.0013) * sampleRate;
    const length = Math.ceil(decay * 4);
    // A one-pole lowpass per drop: the bigger, the duller.
    const smoothing = 0.88 - size * 0.7;
    const fall = Math.exp(-1 / decay);
    let envelope = amplitude;
    let value = 0;
    let index = at % data.length;
    for (let i = 0; i < length; i++) {
        value += smoothing * ((random() * 2 - 1) * envelope - value);
        envelope *= fall;
        data[index] += value;
        if (++index === data.length) index = 0;
    }
}

// A drop into water: the trapped bubble rings at `frequency`, its pitch rising
// as it nears the surface, dying away in a few milliseconds.
function addBubble(data, at, amplitude, frequency, random, sampleRate) {
    const damping = 0.043 * frequency + 0.0014 * frequency ** 1.5;
    const rise = 0.1 + random() * 0.25;
    const length = Math.ceil((5 / damping) * sampleRate);
    const fall = Math.exp(-damping / sampleRate);
    const step = (2 * Math.PI * frequency) / sampleRate;
    const glide = (step * rise * damping) / sampleRate;
    // A soft onset, so the plink doesn't click on top of its own tick.
    const onset = 0.0004 * sampleRate;
    let envelope = amplitude;
    let phase = 0;
    let index = at % data.length;
    for (let i = 0; i < length; i++) {
        phase += step + glide * i;
        data[index] += Math.min(1, i / onset) * envelope * Math.sin(phase);
        envelope *= fall;
        if (++index === data.length) index = 0;
    }
}

// Most drops are faint and a few loud, as in real rain; the higher
// `spread`, the fewer loud ones.
function dropAmplitude(random, spread) {
    return 0.04 + 0.96 * random() ** spread;
}

function normalizeRms(buffer, rms) {
    let sum = 0;
    let count = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        for (const value of buffer.getChannelData(channel)) {
            sum += value * value;
            count++;
        }
    }
    const scale = sum > 0 ? rms / Math.sqrt(sum / count) : 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < data.length; i++) data[i] *= scale;
    }
}

// A seamless stereo loop, `seconds` long, of `rate` drops a second in each
// ear; `bubbles` is the share of drops that ring. Drops near the loop's end
// wrap round to its start, so it loops without a seam. `spread` sets how few
// of them are loud (see dropAmplitude()). Its level is fixed (rms 0.25)
// whatever the rate, so the mix is balanced by gain alone.
export function renderDropBed(context, random, { seconds, rate, bubbles = 0, spread = 3 }) {
    const sampleRate = context.sampleRate;
    const length = Math.floor(sampleRate * seconds);
    const buffer = context.createBuffer(2, length, sampleRate);
    const drops = Math.round(rate * seconds);
    for (let channel = 0; channel < 2; channel++) {
        const data = buffer.getChannelData(channel);
        for (let i = 0; i < drops; i++) {
            const at = Math.floor(random() * length);
            const amplitude = dropAmplitude(random, spread);
            addTick(data, at, amplitude, random, sampleRate);
            if (random() < bubbles) {
                addBubble(data, at, amplitude * 0.6, 1400 + random() * 3200, random, sampleRate);
            }
        }
    }
    normalizeRms(buffer, 0.25);
    return buffer;
}

// Separate near drops, `count` of them side by side in one mono buffer, each
// in its own `slot` seconds; a third of them land in water and ring.
export const DROP_SLOT_SECONDS = 0.08;

export function renderDropBank(context, random, count) {
    const sampleRate = context.sampleRate;
    const slot = Math.floor(DROP_SLOT_SECONDS * sampleRate);
    const buffer = context.createBuffer(1, slot * count, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < count; i++) {
        // Written into a slot of its own so a long ring never runs into the
        // next drop.
        const drop = new Float32Array(slot);
        addTick(drop, 0, 1, random, sampleRate);
        if (random() < 1 / 3) {
            addBubble(drop, 0, 0.7, 1100 + random() * 2900, random, sampleRate);
        }
        // Fades the slot's last few milliseconds, so nothing is cut off.
        const fade = Math.floor(0.005 * sampleRate);
        for (let j = 0; j < fade; j++) drop[slot - 1 - j] *= j / fade;
        data.set(drop, i * slot);
    }
    normalizeRms(buffer, 0.25);
    return buffer;
}

// Plays drop `index` of `bank` at `when` into `output`, `loudness` loud, a
// little higher or lower than rendered so the bank never sounds like a set.
export function playDrop(context, output, bank, index, when, loudness, pitch) {
    const source = context.createBufferSource();
    source.buffer = bank;
    source.playbackRate.value = pitch;
    const gain = context.createGain();
    gain.gain.value = loudness;
    source.connect(gain);
    gain.connect(output);
    source.onended = () => gain.disconnect();
    source.start(when, index * DROP_SLOT_SECONDS, DROP_SLOT_SECONDS);
    return source;
}
