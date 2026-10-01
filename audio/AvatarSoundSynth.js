// One-off sounds of the local avatar, synthesized from a shared white-noise
// buffer: a footstep on each kind of surface, a jump's whoosh and a landing's
// thud. Each call builds a few short-lived nodes that disconnect themselves
// when they finish.

// Per surface: the filter that shapes a burst of noise, how long the burst
// rings, how loud it is, and any extras (a second crunch for leaves, a low
// knock for brick, a splash sweep for water).
const SURFACE_VOICE = Object.freeze({
    grass: { type: 'bandpass', frequency: 1100, q: 0.8, seconds: 0.09, gain: 0.5 },
    leaves: { type: 'highpass', frequency: 1800, q: 0.7, seconds: 0.11, gain: 0.45, crunch: true },
    sand: { type: 'lowpass', frequency: 800, q: 0.7, seconds: 0.14, gain: 0.55 },
    stone: { type: 'bandpass', frequency: 2400, q: 1.6, seconds: 0.05, gain: 0.7 },
    water: { type: 'lowpass', frequency: 1400, q: 0.9, seconds: 0.22, gain: 0.6, splash: true },
    structure: { type: 'bandpass', frequency: 520, q: 1.1, seconds: 0.07, gain: 0.7, knock: 130 }
});

// Footsteps sit at half the level the surface voices above were first tuned
// to, so walking stays in the background of the soundscape.
const FOOTSTEP_GAIN = 0.5;

// Short-lived nodes are released once `last` has finished.
function releaseAfter(last, nodes) {
    last.onended = () => {
        for (const node of nodes) {
            node.disconnect();
        }
    };
}

function noiseBurst(context, destination, noise, { type, frequency, q, seconds, gain }, start, random) {
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency * (0.9 + random() * 0.2);
    filter.Q.value = q;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination);
    source.start(start, random() * Math.max(0, noise.duration - seconds - 0.05));
    source.stop(start + seconds + 0.02);
    releaseAfter(source, [source, filter, envelope]);
    return filter;
}

function toneDrop(context, destination, from, to, seconds, gain, start) {
    const oscillator = context.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + seconds);
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0, start);
    envelope.gain.linearRampToValueAtTime(gain, start + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
    releaseAfter(oscillator, [oscillator, envelope]);
}

export function playFootstep(context, destination, noise, surface, intensity, random = Math.random) {
    const voice = SURFACE_VOICE[surface] || SURFACE_VOICE.grass;
    const level = FOOTSTEP_GAIN * Math.min(1, Math.max(0, intensity)) * (0.85 + random() * 0.3);
    const start = context.currentTime + 0.005;
    noiseBurst(context, destination, noise, { ...voice, gain: voice.gain * level }, start, random);
    if (voice.crunch) {
        noiseBurst(context, destination, noise, { ...voice, gain: voice.gain * level * 0.7 }, start + 0.03 + random() * 0.03, random);
    }
    if (voice.knock) {
        toneDrop(context, destination, voice.knock, voice.knock * 0.6, 0.09, 0.5 * level, start);
    }
    if (voice.splash) {
        const filter = noiseBurst(context, destination, noise,
            { type: 'bandpass', frequency: 900, q: 1.2, seconds: 0.25, gain: 0.35 * level }, start + 0.02, random);
        filter.frequency.exponentialRampToValueAtTime(2600, start + 0.25);
    }
}

// Pushing off: the step itself, then a rising rush of air.
export function playJump(context, destination, noise, surface, intensity, random = Math.random) {
    playFootstep(context, destination, noise, surface, intensity, random);
    const start = context.currentTime + 0.02;
    const filter = noiseBurst(context, destination, noise,
        { type: 'bandpass', frequency: 500, q: 1.5, seconds: 0.22, gain: 0.25 * intensity }, start, random);
    filter.frequency.exponentialRampToValueAtTime(1800, start + 0.22);
}

// Touching down: the step on that surface and a thud, heavier after a longer
// fall.
export function playLanding(context, destination, noise, surface, intensity, random = Math.random) {
    const level = Math.min(1, Math.max(0, intensity));
    playFootstep(context, destination, noise, surface, Math.max(0.7, level), random);
    toneDrop(context, destination, 95, 45, 0.12 + 0.12 * level, 0.35 + 0.45 * level, context.currentTime + 0.005);
}
