// The sounds of animals and residents, synthesized: a deer's snort, a
// rabbit's foot thump, soft hoof and hop steps, a rustle and a rising or
// falling pluck as an animal is caught or released; a resident's "hm-hm"
// hello, its murmured speech (vowel-like formants on a voice pitch that is
// its own) and its steps. Each call builds short-lived nodes into
// `destination`, which the caller has already placed (gain and pan).

import { ANIMAL_SPECIES } from '../core/WildlifeField.js';

function releaseAfter(last, nodes) {
    last.onended = () => {
        for (const node of nodes) {
            node.disconnect();
        }
    };
}

function envelope(context, gain, start, attack, seconds) {
    const node = context.createGain();
    node.gain.setValueAtTime(0, start);
    node.gain.linearRampToValueAtTime(gain, start + attack);
    node.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    return node;
}

function noiseBurst(context, destination, noise, { type, frequency, q = 0.8, seconds, gain, sweepTo = null }, start, random) {
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(frequency, start);
    if (sweepTo) {
        filter.frequency.exponentialRampToValueAtTime(sweepTo, start + seconds);
    }
    filter.Q.value = q;
    const amp = envelope(context, gain, start, 0.008, seconds);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(destination);
    source.start(start, random() * Math.max(0, noise.duration - seconds - 0.05));
    source.stop(start + seconds + 0.02);
    releaseAfter(source, [source, filter, amp]);
}

function tone(context, destination, { type = 'sine', from, to = from, seconds, gain, attack = 0.01 }, start) {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    if (to !== from) {
        oscillator.frequency.exponentialRampToValueAtTime(to, start + seconds);
    }
    const amp = envelope(context, gain, start, attack, seconds);
    oscillator.connect(amp);
    amp.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
    releaseAfter(oscillator, [oscillator, amp]);
}

// A deer's alarm snort (a sharp breathy burst) or, startled close by, a short
// bark; a rabbit drums a hind foot twice.
export function playAnimalCall(context, destination, noise, species, startled, random = Math.random) {
    const start = context.currentTime + 0.01;
    if (species === ANIMAL_SPECIES.RABBIT) {
        for (let i = 0; i < 2; i++) {
            const at = start + i * (0.13 + random() * 0.04);
            tone(context, destination, { from: 85, to: 45, seconds: 0.09, gain: 0.8, attack: 0.003 }, at);
            noiseBurst(context, destination, noise, { type: 'lowpass', frequency: 400, seconds: 0.05, gain: 0.3 }, at, random);
        }
        return;
    }
    noiseBurst(context, destination, noise,
        { type: 'bandpass', frequency: 1300 + random() * 300, q: 1.2, seconds: 0.35, gain: 0.7, sweepTo: 700 }, start, random);
    if (startled) {
        tone(context, destination, { type: 'sawtooth', from: 420, to: 260, seconds: 0.22, gain: 0.18 }, start + 0.3);
    }
}

// One soft hoof or hop, barely there.
export function playAnimalStep(context, destination, noise, species, random = Math.random) {
    const start = context.currentTime + 0.005;
    const rabbit = species === ANIMAL_SPECIES.RABBIT;
    noiseBurst(context, destination, noise, {
        type: 'bandpass', frequency: rabbit ? 700 : 1100, q: 0.9, seconds: rabbit ? 0.05 : 0.07, gain: rabbit ? 0.25 : 0.35
    }, start, random);
}

// Scooping one up: a rustle and a rising three-note pluck; letting it go: the
// same falling.
export function playCatchOrRelease(context, destination, noise, caught, random = Math.random) {
    const start = context.currentTime + 0.01;
    noiseBurst(context, destination, noise, { type: 'highpass', frequency: 2000, seconds: 0.25, gain: 0.25 }, start, random);
    const notes = caught ? [523, 659, 784] : [784, 659, 523];
    notes.forEach((frequency, i) => {
        tone(context, destination, { type: 'triangle', from: frequency, seconds: 0.18, gain: 0.3, attack: 0.004 }, start + 0.05 + i * 0.07);
    });
}

// A resident's voice: a pitch between 110 and 230 Hz fixed by its id.
function voicePitch(voice) {
    return 110 + 120 * Math.min(1, Math.max(0, voice));
}

// One vowel-like syllable: a buzzy voice through two formant filters.
function syllable(context, destination, pitch, start, seconds, gain, random) {
    const VOWELS = [[730, 1090], [530, 1840], [270, 2290], [570, 840], [300, 870]];
    const [f1, f2] = VOWELS[Math.floor(random() * VOWELS.length)];
    const oscillator = context.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(pitch * (0.92 + random() * 0.16), start);
    oscillator.frequency.linearRampToValueAtTime(pitch * (0.9 + random() * 0.15), start + seconds);
    const amp = envelope(context, gain, start, 0.02, seconds);
    const formants = [f1, f2].map((frequency, i) => {
        const filter = context.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = frequency;
        filter.Q.value = 6;
        const level = context.createGain();
        level.gain.value = i === 0 ? 1 : 0.5;
        oscillator.connect(filter);
        filter.connect(level);
        level.connect(amp);
        return [filter, level];
    }).flat();
    amp.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
    releaseAfter(oscillator, [oscillator, amp, ...formants]);
}

// "Hm-hm": a friendly two-note hum, up then down.
export function playResidentGreet(context, destination, voice, random = Math.random) {
    const pitch = voicePitch(voice);
    const start = context.currentTime + 0.01;
    tone(context, destination, { type: 'triangle', from: pitch * 1.12, seconds: 0.16, gain: 0.35, attack: 0.03 }, start);
    tone(context, destination, { type: 'triangle', from: pitch * 1.3, to: pitch, seconds: 0.26, gain: 0.35, attack: 0.03 }, start + 0.2);
    syllable(context, destination, pitch, start, 0.14, 0.25, random);
}

// Murmured talk: `syllables` vowel sounds in the resident's voice, grouped
// into words by short gaps, the last one falling like the end of a sentence.
export function playResidentSpeech(context, destination, voice, syllables, random = Math.random) {
    const pitch = voicePitch(voice);
    let at = context.currentTime + 0.02;
    for (let i = 0; i < syllables; i++) {
        const last = i === syllables - 1;
        const seconds = 0.09 + random() * 0.08 + (last ? 0.08 : 0);
        syllable(context, destination, last ? pitch * 0.85 : pitch, at, seconds, 0.4, random);
        at += seconds + (random() < 0.3 ? 0.12 : 0.03);
    }
}

export function playResidentStep(context, destination, noise, random = Math.random) {
    noiseBurst(context, destination, noise, { type: 'bandpass', frequency: 1000, q: 0.8, seconds: 0.07, gain: 0.3 },
        context.currentTime + 0.005, random);
}
