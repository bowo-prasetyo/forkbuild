// Short sounds for Editor edits (core/EditorSoundCues.js): a brick snapping
// into place, a pop as one is removed, a tick for a move, a double tick for
// a turn, a quick run of blips for a paste, a bright ping for a new color, a
// two-note link for grouping, a bell for a named place, a falling blip for
// undo and a rising one for redo, and a small chord when a document saves.
// Each call builds short-lived nodes that disconnect themselves.

function blip(context, destination, { type = 'sine', from, to = from, seconds, gain, attack = 0.003 }, start) {
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
    oscillator.onended = () => {
        oscillator.disconnect();
        amp.disconnect();
    };
}

function click(context, destination, noise, frequency, seconds, gain, start) {
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 1.5;
    const amp = context.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(destination);
    source.start(start);
    source.stop(start + seconds + 0.02);
    source.onended = () => {
        source.disconnect();
        filter.disconnect();
        amp.disconnect();
    };
}

const CUE_SOUND = Object.freeze({
    place: (c, d, n, t) => {
        click(c, d, n, 2800, 0.03, 0.5, t);
        blip(c, d, { from: 220, to: 140, seconds: 0.09, gain: 0.5 }, t);
    },
    remove: (c, d, n, t) => {
        blip(c, d, { type: 'triangle', from: 700, to: 250, seconds: 0.12, gain: 0.4 }, t);
        click(c, d, n, 1500, 0.05, 0.25, t);
    },
    move: (c, d, n, t) => click(c, d, n, 2200, 0.035, 0.35, t),
    rotate: (c, d, n, t) => {
        click(c, d, n, 2400, 0.03, 0.3, t);
        click(c, d, n, 1900, 0.03, 0.3, t + 0.06);
    },
    paste: (c, d, n, t) => [0, 0.05, 0.1].forEach((offset, i) => {
        blip(c, d, { from: 500 + i * 150, seconds: 0.07, gain: 0.3 }, t + offset);
    }),
    color: (c, d, n, t) => blip(c, d, { type: 'triangle', from: 1320, seconds: 0.25, gain: 0.3 }, t),
    group: (c, d, n, t) => {
        blip(c, d, { type: 'triangle', from: 660, seconds: 0.12, gain: 0.3 }, t);
        blip(c, d, { type: 'triangle', from: 880, seconds: 0.16, gain: 0.3 }, t + 0.08);
    },
    mark: (c, d, n, t) => {
        blip(c, d, { from: 988, seconds: 0.6, gain: 0.25, attack: 0.005 }, t);
        blip(c, d, { from: 1976, seconds: 0.35, gain: 0.08, attack: 0.005 }, t);
    },
    undo: (c, d, n, t) => blip(c, d, { type: 'triangle', from: 660, to: 330, seconds: 0.14, gain: 0.35 }, t),
    redo: (c, d, n, t) => blip(c, d, { type: 'triangle', from: 330, to: 660, seconds: 0.14, gain: 0.35 }, t),
    save: (c, d, n, t) => [523, 659, 784].forEach((frequency) => {
        blip(c, d, { type: 'triangle', from: frequency, seconds: 0.45, gain: 0.18, attack: 0.01 }, t);
    })
});

export function hasEditorSound(cue) {
    return Object.hasOwn(CUE_SOUND, cue);
}

export function playEditorSound(context, destination, noise, cue) {
    const play = CUE_SOUND[cue];
    if (play) {
        play(context, destination, noise, context.currentTime + 0.005);
    }
}
