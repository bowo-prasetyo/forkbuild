// One-off vehicle sounds, synthesized, for the village's vehicles
// (renderer/VehicleRenderer.js: MOTORCYCLE is a penny-farthing, CAR a hay
// wagon, DRONE a hot-air balloon): getting on (a bicycle's bell, a
// penny-farthing's creak and ding, a wagon's creaking boards and rustling
// hay, a balloon's burner roaring up), getting off (a kickstand, a creak and
// a step down, a thump into the hay, the burner dying away) and braking
// (brake pads squealing on a bicycle, a spoon brake scraping a tyre, wooden
// wheels grinding, a vent puffing on the balloon), louder the faster it was
// going. Each call builds short-lived nodes that disconnect themselves.
import { VehicleType } from '../core/VehicleType.js';

function releaseAfter(last, nodes) {
    last.onended = () => {
        for (const node of nodes) {
            node.disconnect();
        }
    };
}

function tone(context, destination, { type = 'sine', from, to = from, seconds, gain, attack = 0.005 }, start) {
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(from, start);
    if (to !== from) {
        oscillator.frequency.exponentialRampToValueAtTime(to, start + seconds);
    }
    const amp = context.createGain();
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + attack);
    amp.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    oscillator.connect(amp);
    amp.connect(destination);
    oscillator.start(start);
    oscillator.stop(start + seconds + 0.02);
    releaseAfter(oscillator, [oscillator, amp]);
}

function noise(context, destination, buffer, { type, from, to = from, q = 1, seconds, gain }, start, random) {
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, start);
    if (to !== from) {
        filter.frequency.exponentialRampToValueAtTime(to, start + seconds);
    }
    filter.Q.value = q;
    const amp = context.createGain();
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(destination);
    source.start(start, random() * Math.max(0, buffer.duration - seconds - 0.05));
    source.stop(start + seconds + 0.02);
    releaseAfter(source, [source, filter, amp]);
}

// A bell: a bright strike with an inharmonic overtone, rung twice.
function bell(context, destination, start) {
    for (const at of [start, start + 0.16]) {
        tone(context, destination, { from: 2100, seconds: 0.5, gain: 0.25, attack: 0.002 }, at);
        tone(context, destination, { from: 5300, seconds: 0.25, gain: 0.08, attack: 0.002 }, at);
    }
}

// Wooden boards creaking under weight: a slow, wavering low tone.
function creak(context, destination, start, { from = 190, to = 260, seconds = 0.35, gain = 0.3 } = {}) {
    tone(context, destination, { type: 'triangle', from, to, seconds, gain, attack: 0.04 }, start);
    tone(context, destination, { type: 'triangle', from: from * 1.5, to: to * 1.48, seconds: seconds * 0.8, gain: gain * 0.35, attack: 0.04 }, start + 0.03);
}

// Hay rustling: a short burst of bright, airy noise.
function rustle(context, destination, buffer, start, random, gain = 0.35) {
    noise(context, destination, buffer, { type: 'highpass', from: 3500, seconds: 0.3, gain }, start, random);
}

// A step down onto the ground: a soft, low thud.
function thump(context, destination, start, gain = 0.6) {
    tone(context, destination, { from: 90, to: 55, seconds: 0.18, gain, attack: 0.003 }, start);
}

// A balloon's burner: a roar of breathy noise swelling or dying away.
function burner(context, destination, buffer, start, random, { from, to, seconds, gain }) {
    noise(context, destination, buffer, { type: 'bandpass', from, to, q: 0.6, seconds, gain }, start, random);
    tone(context, destination, { type: 'triangle', from: 55, to: 62, seconds, gain: gain * 0.3, attack: 0.1 }, start);
}

export function playMount(context, destination, buffer, vehicleType, random = Math.random) {
    const start = context.currentTime + 0.01;
    switch (vehicleType) {
        case VehicleType.BICYCLE:
            bell(context, destination, start);
            break;
        case VehicleType.MOTORCYCLE:
            // The penny-farthing: its frame creaking as you climb up, then one
            // low ding of its bell.
            creak(context, destination, start, { from: 320, to: 420, seconds: 0.3, gain: 0.22 });
            tone(context, destination, { from: 1500, seconds: 0.5, gain: 0.22, attack: 0.002 }, start + 0.32);
            tone(context, destination, { from: 3700, seconds: 0.25, gain: 0.06, attack: 0.002 }, start + 0.32);
            break;
        case VehicleType.CAR:
            // The hay wagon: boards creaking, then the hay settling.
            creak(context, destination, start);
            rustle(context, destination, buffer, start + 0.25, random);
            break;
        case VehicleType.DRONE:
            // The balloon: the burner roaring up.
            burner(context, destination, buffer, start, random, { from: 500, to: 1300, seconds: 0.8, gain: 0.5 });
            break;
        default:
            break;
    }
}

export function playDismount(context, destination, buffer, vehicleType, random = Math.random) {
    const start = context.currentTime + 0.01;
    switch (vehicleType) {
        case VehicleType.BICYCLE:
            // The kickstand snapping down.
            noise(context, destination, buffer, { type: 'bandpass', from: 2600, q: 3, seconds: 0.05, gain: 0.45 }, start, random);
            tone(context, destination, { type: 'triangle', from: 1400, seconds: 0.12, gain: 0.12, attack: 0.002 }, start);
            break;
        case VehicleType.MOTORCYCLE:
            // A creak as you climb down, then your feet on the ground.
            creak(context, destination, start, { from: 420, to: 300, seconds: 0.28, gain: 0.2 });
            thump(context, destination, start + 0.3, 0.45);
            break;
        case VehicleType.CAR:
            // A rustle as you leave the hay, then a step down.
            rustle(context, destination, buffer, start, random, 0.3);
            thump(context, destination, start + 0.25);
            break;
        case VehicleType.DRONE:
            // The burner dying away.
            burner(context, destination, buffer, start, random, { from: 1200, to: 400, seconds: 0.7, gain: 0.4 });
            break;
        default:
            break;
    }
}

export function playBrake(context, destination, buffer, vehicleType, intensity, random = Math.random) {
    const level = Math.min(1, Math.max(0.2, Number(intensity) || 0));
    const start = context.currentTime + 0.01;
    const seconds = 0.25 + 0.45 * level;
    switch (vehicleType) {
        case VehicleType.BICYCLE:
            // Rubber pads on a rim: a thin squeal wavering as it slows.
            tone(context, destination, { type: 'triangle', from: 2600, to: 2200, seconds, gain: 0.18 * level, attack: 0.02 }, start);
            noise(context, destination, buffer, { type: 'bandpass', from: 3500, q: 4, seconds, gain: 0.15 * level }, start, random);
            break;
        case VehicleType.MOTORCYCLE:
            // A spoon brake pressed on the big tyre: a dry, falling scrape.
            noise(context, destination, buffer, { type: 'bandpass', from: 2400, to: 1500, q: 3, seconds, gain: 0.35 * level }, start, random);
            tone(context, destination, { type: 'triangle', from: 1100, to: 900, seconds, gain: 0.06 * level, attack: 0.02 }, start);
            break;
        case VehicleType.CAR:
            // Wooden wheels grinding to a stop, the boards creaking.
            noise(context, destination, buffer, { type: 'bandpass', from: 700, to: 380, q: 2, seconds, gain: 0.55 * level }, start, random);
            creak(context, destination, start, { from: 220, to: 170, seconds, gain: 0.2 * level });
            break;
        case VehicleType.DRONE:
            // A puff from the vent as the balloon checks its way.
            noise(context, destination, buffer, { type: 'bandpass', from: 1600, to: 800, q: 0.8, seconds, gain: 0.35 * level }, start, random);
            break;
        default:
            break;
    }
}
