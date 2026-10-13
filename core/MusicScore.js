// What ForkBuild's music plays: a gentle, generated tune under the Editor and
// World View, so a quiet afternoon of building has a mood (docs/Pillars.md,
// "Look"). Pure and deterministic: a mood and a phrase number always give
// the same notes, so nothing is downloaded, stored or sent, and the tune
// never repeats exactly because each phrase is drawn afresh from its seed.
//
// A phrase is four bars of four beats over one chord per bar: a soft pad
// holding the chord, a bass note on the bar, and a melody of chord tones and
// passing notes from the mood's scale, with rests. Pieces of six phrases are
// followed by two phrases of silence, so the music comes and goes rather
// than droning (the world's own sounds fill the gaps).
export const MUSIC_MOOD = Object.freeze({
    // The Editor: bright, a little lively.
    EDITOR: 'editor',
    // World View by day: warm and unhurried.
    DAY: 'day',
    // World View after dark: slow, low and sparse.
    NIGHT: 'night'
});

export const BEATS_PER_BAR = 4;
export const BARS_PER_PHRASE = 4;
export const BEATS_PER_PHRASE = BEATS_PER_BAR * BARS_PER_PHRASE;
// Phrases played, then phrases of silence, in every piece.
export const PHRASES_PLAYED = 6;
export const PHRASES_PER_PIECE = 8;

// Scale degrees as semitones above the tonic.
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];

// Each mood's key (MIDI note of its tonic, near middle C), scale, tempo, the
// chords of its progression (as scale degrees, 0-based), how many of the
// melody's eighth notes sound, and how loud each voice is (0..1).
const MOODS = Object.freeze({
    [MUSIC_MOOD.EDITOR]: Object.freeze({
        tonic: 60, scale: MAJOR, tempo: 88,
        progressions: [[0, 4, 5, 3], [0, 3, 4, 0], [5, 3, 0, 4]],
        density: 0.55, melody: 0.8, pad: 0.5, bass: 0.6
    }),
    [MUSIC_MOOD.DAY]: Object.freeze({
        tonic: 65, scale: MAJOR, tempo: 72,
        progressions: [[0, 3, 0, 4], [0, 5, 3, 4], [3, 0, 4, 0]],
        density: 0.42, melody: 0.7, pad: 0.6, bass: 0.55
    }),
    [MUSIC_MOOD.NIGHT]: Object.freeze({
        tonic: 57, scale: MINOR, tempo: 56,
        progressions: [[0, 5, 3, 4], [0, 3, 0, 6], [5, 3, 0, 0]],
        density: 0.28, melody: 0.55, pad: 0.7, bass: 0.45
    })
});

export const MUSIC_MOODS = Object.freeze(Object.values(MUSIC_MOOD));

// The mood for a view: the Editor's own, or World View's by day or by night
// (`nightLevel`, 0 to 1, from core/DayCycle.js).
export function musicMoodFor({ view, nightLevel = 0 } = {}) {
    if (view === 'editor') return MUSIC_MOOD.EDITOR;
    return Number(nightLevel) > 0.5 ? MUSIC_MOOD.NIGHT : MUSIC_MOOD.DAY;
}

// Seconds a beat lasts in `mood`.
export function secondsPerBeat(mood) {
    return 60 / moodOf(mood).tempo;
}

// Whether phrase `index` of a piece is one of its quiet ones.
export function isRestPhrase(index) {
    const place = ((index % PHRASES_PER_PIECE) + PHRASES_PER_PIECE) % PHRASES_PER_PIECE;
    return place >= PHRASES_PLAYED;
}

// The notes of phrase `index` in `mood`, from `seed` (any integer; a visit's
// own, so two visits don't play the same tune): a frozen list of
// { beat, beats, midi, velocity, voice } with `beat` from the phrase's start,
// `voice` one of 'melody', 'pad' or 'bass', sorted by beat. Empty for a rest.
export function musicPhrase(mood, index, seed = 0) {
    if (isRestPhrase(index)) return Object.freeze([]);
    const style = moodOf(mood);
    const random = seededRandom(hashOf(seed, index, MUSIC_MOODS.indexOf(mood)));
    const progression = style.progressions[Math.floor(random() * style.progressions.length)];
    const notes = [];
    let previous = null;
    progression.forEach((degree, bar) => {
        const start = bar * BEATS_PER_BAR;
        const chord = [degree, degree + 2, degree + 4].map((step) => noteOf(style, step));
        // The pad holds the chord's three notes for the bar.
        for (const midi of chord) {
            notes.push({ beat: start, beats: BEATS_PER_BAR, midi, velocity: style.pad * 0.6, voice: 'pad' });
        }
        // The bass: the chord's root an octave down, on the bar and, now and
        // then, again on its third beat.
        notes.push({ beat: start, beats: 2, midi: chord[0] - 12, velocity: style.bass, voice: 'bass' });
        if (random() < 0.4) notes.push({ beat: start + 2, beats: 2, midi: chord[0] - 12, velocity: style.bass * 0.8, voice: 'bass' });
        // The melody, in eighth notes, an octave above the chord: mostly chord
        // tones, stepping between them, held longer on the bar's last beat.
        for (let eighth = 0; eighth < BEATS_PER_BAR * 2; eighth++) {
            const lastOfBar = eighth === BEATS_PER_BAR * 2 - 2;
            const strong = eighth % 2 === 0;
            if (random() > style.density * (strong ? 1.3 : 0.7)) continue;
            const midi = withinReach(style, melodyNote(style, chord, previous, random) + 12);
            const beats = lastOfBar ? 1 : 0.5;
            notes.push({ beat: start + eighth / 2, beats, midi, velocity: style.melody * (strong ? 1 : 0.8), voice: 'melody' });
            previous = midi - 12;
            if (lastOfBar) break;
        }
    });
    notes.sort((a, b) => a.beat - b.beat);
    return Object.freeze(notes.map((note) => Object.freeze(note)));
}

function moodOf(mood) {
    return MOODS[mood] || MOODS[MUSIC_MOOD.DAY];
}

// The MIDI note of scale step `step` (0 is the tonic; 7 an octave up).
function noteOf(style, step) {
    const length = style.scale.length;
    const octave = Math.floor(step / length);
    const degree = ((step % length) + length) % length;
    return style.tonic + octave * 12 + style.scale[degree];
}

// The melody stays between a fifth and two octaves above the key's tonic,
// folded by octaves: high enough to sing over the pad, never shrill.
function withinReach(style, midi) {
    let note = midi;
    while (note > style.tonic + 24) note -= 12;
    while (note < style.tonic + 7) note += 12;
    return note;
}

// A chord tone, or a step of the scale from the last note, never a leap of
// more than a fifth.
function melodyNote(style, chord, previous, random) {
    if (previous === null || random() < 0.55) {
        const tone = chord[Math.floor(random() * chord.length)];
        return previous === null || Math.abs(tone - previous) <= 7 ? tone : chord[0];
    }
    const steps = [];
    for (let step = -3; step <= 10; step++) {
        const midi = noteOf(style, step);
        if (Math.abs(midi - previous) > 0 && Math.abs(midi - previous) <= 4) steps.push(midi);
    }
    return steps.length ? steps[Math.floor(random() * steps.length)] : chord[0];
}

function hashOf(...values) {
    let hash = 2166136261;
    for (const value of values) {
        const n = Math.floor(Number(value) || 0);
        hash = Math.imul(hash ^ (n & 0xffff), 16777619);
        hash = Math.imul(hash ^ (n >>> 16), 16777619);
    }
    return hash >>> 0;
}

// mulberry32: small, fast and the same everywhere.
function seededRandom(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
