// One-off vehicle sounds, synthesized: getting on (a bicycle's bell, a
// motorcycle's kick-start, a car's door and ignition, a drone's rotors
// spinning up), getting off (a kickstand, an engine cutting out, a door, the
// rotors winding down) and braking (brake pads squealing on a bicycle, tyres
// skidding on a motorcycle or car, a drone's rotors dipping), louder the
// faster it was going. Each call builds short-lived nodes that disconnect
// themselves.
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

// A door shutting: a low thud with a latch click.
function door(context, destination, buffer, start, random) {
    tone(context, destination, { from: 90, to: 55, seconds: 0.18, gain: 0.7, attack: 0.003 }, start);
    noise(context, destination, buffer, { type: 'bandpass', from: 3000, q: 2, seconds: 0.04, gain: 0.3 }, start + 0.02, random);
}

export function playMount(context, destination, buffer, vehicleType, random = Math.random) {
    const start = context.currentTime + 0.01;
    switch (vehicleType) {
        case VehicleType.BICYCLE:
            bell(context, destination, start);
            break;
        case VehicleType.MOTORCYCLE:
            // Two kicks of the starter, then the engine catching with a rev.
            for (let i = 0; i < 2; i++) {
                tone(context, destination, { type: 'sawtooth', from: 30, to: 45, seconds: 0.15, gain: 0.35 }, start + i * 0.22);
            }
            tone(context, destination, { type: 'sawtooth', from: 55, to: 140, seconds: 0.45, gain: 0.4, attack: 0.03 }, start + 0.45);
            break;
        case VehicleType.CAR:
            door(context, destination, buffer, start, random);
            tone(context, destination, { type: 'sawtooth', from: 28, to: 70, seconds: 0.6, gain: 0.35, attack: 0.08 }, start + 0.35);
            break;
        case VehicleType.DRONE:
            tone(context, destination, { type: 'sawtooth', from: 60, to: 240, seconds: 0.7, gain: 0.2, attack: 0.2 }, start);
            tone(context, destination, { type: 'sawtooth', from: 62, to: 244, seconds: 0.7, gain: 0.2, attack: 0.2 }, start);
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
            tone(context, destination, { type: 'sawtooth', from: 110, to: 35, seconds: 0.5, gain: 0.3 }, start);
            break;
        case VehicleType.CAR:
            tone(context, destination, { type: 'sawtooth', from: 60, to: 25, seconds: 0.35, gain: 0.25 }, start);
            door(context, destination, buffer, start + 0.4, random);
            break;
        case VehicleType.DRONE:
            tone(context, destination, { type: 'sawtooth', from: 240, to: 50, seconds: 0.8, gain: 0.18 }, start);
            tone(context, destination, { type: 'sawtooth', from: 244, to: 52, seconds: 0.8, gain: 0.18 }, start);
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
        case VehicleType.CAR:
            // Tyres skidding: a harsh, falling band of noise over a scraping tone.
            noise(context, destination, buffer, { type: 'bandpass', from: 1800, to: 1100, q: 6, seconds, gain: 0.5 * level }, start, random);
            tone(context, destination, { type: 'sawtooth', from: 900, to: 700, seconds, gain: 0.08 * level, attack: 0.02 }, start);
            break;
        case VehicleType.DRONE:
            tone(context, destination, { type: 'sawtooth', from: 300, to: 180, seconds, gain: 0.15 * level, attack: 0.02 }, start);
            break;
        default:
            break;
    }
}
