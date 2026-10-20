// Plays core/app/MusicScore.js's phrases with the Web Audio API, into a gain the
// soundscape provider (audio/WebAudioSoundscapeProvider.js) connects under
// its master volume. Three soft voices, synthesized like every other sound
// in ForkBuild so nothing is downloaded: a music-box melody (a sine with a
// quiet octave, plucked), a warm pad (two detuned triangles through a
// low-pass, swelling in and out) and a round bass (a sine). Notes are
// scheduled a little ahead on the audio clock, a phrase at a time, so timing
// never depends on when a JavaScript timer happens to run.
import {
    BEATS_PER_PHRASE, MUSIC_MOOD, musicPhrase, secondsPerBeat
} from '../core/app/MusicScore.js';

// How far ahead of the audio clock notes are scheduled, and how often.
const LOOKAHEAD_SECONDS = 0.6;
const TICK_MS = 200;
// Each voice's loudness at velocity 1, balanced against the others by ear.
const VOICE_GAIN = Object.freeze({ melody: 0.11, pad: 0.035, bass: 0.09 });
// The music as a whole, so it sits a little below the ambience at the same
// volume (measured: about two thirds of a meadow's level).
const MUSIC_LEVEL = 0.65;
// How quickly the music fades out when it is turned off, and back in.
const FADE_SECONDS = 1.2;

function frequencyOf(midi) {
    return 440 * 2 ** ((midi - 69) / 12);
}

export class MusicPlayer {
    // context: an AudioContext; output: the node the music is heard through.
    constructor({
        context, output, seed = 0,
        setTimeoutFn = globalThis.setTimeout.bind(globalThis),
        clearTimeoutFn = globalThis.clearTimeout.bind(globalThis)
    }) {
        this._context = context;
        this._seed = Math.floor(Number(seed) || 0);
        this._setTimeout = setTimeoutFn;
        this._clearTimeout = clearTimeoutFn;
        this._gain = context.createGain();
        this._gain.gain.value = 0;
        this._gain.connect(output);
        this._mood = MUSIC_MOOD.DAY;
        this._enabled = false;
        this._timer = null;
        // The next phrase to schedule, and when (audio-clock seconds) it starts.
        this._phrase = 0;
        this._phraseStart = null;
        this._sounding = new Set();
    }

    get mood() {
        return this._mood;
    }

    get enabled() {
        return this._enabled;
    }

    // The mood takes over at the next phrase: a tune finishes its phrase first.
    setMood(mood) {
        if (mood) this._mood = mood;
    }

    // Starts or stops the music, fading. Scheduling only runs while on.
    setEnabled(enabled) {
        const next = Boolean(enabled);
        if (next === this._enabled) return;
        this._enabled = next;
        const now = this._context.currentTime;
        this._gain.gain.cancelScheduledValues(now);
        this._gain.gain.setTargetAtTime(next ? MUSIC_LEVEL : 0, now, FADE_SECONDS / 3);
        if (next) {
            this._phraseStart = null;
            this.tick();
        } else {
            this._stopTimer();
            this._phraseStart = null;
        }
    }

    // Schedules whatever falls within the lookahead, then comes back. Also
    // called by the provider when the audio clock resumes after a pause.
    tick() {
        this._stopTimer();
        if (!this._enabled) return;
        const now = this._context.currentTime;
        // After a pause (a hidden tab, a muted spell), start afresh rather
        // than play every missed note at once.
        if (this._phraseStart === null || this._phraseStart + this._phraseSeconds() < now - LOOKAHEAD_SECONDS) {
            this._phraseStart = now + 0.1;
        }
        while (this._phraseStart < now + LOOKAHEAD_SECONDS) {
            this._schedulePhrase(this._phrase, this._phraseStart);
            this._phraseStart += this._phraseSeconds();
            this._phrase += 1;
        }
        this._timer = this._setTimeout(() => {
            this._timer = null;
            this.tick();
        }, TICK_MS);
    }

    dispose() {
        this._enabled = false;
        this._stopTimer();
        for (const node of this._sounding) {
            try {
                node.stop();
            } catch {
                // Already stopped.
            }
        }
        this._sounding.clear();
        try {
            this._gain.disconnect();
        } catch {
            // Already disconnected.
        }
    }

    _stopTimer() {
        if (this._timer !== null) {
            this._clearTimeout(this._timer);
            this._timer = null;
        }
    }

    _phraseSeconds() {
        return BEATS_PER_PHRASE * secondsPerBeat(this._mood);
    }

    _schedulePhrase(index, start) {
        const beat = secondsPerBeat(this._mood);
        for (const note of musicPhrase(this._mood, index, this._seed)) {
            const at = start + note.beat * beat;
            const seconds = note.beats * beat;
            if (note.voice === 'melody') this._pluck(note.midi, at, seconds, note.velocity);
            else if (note.voice === 'pad') this._pad(note.midi, at, seconds, note.velocity);
            else this._bass(note.midi, at, seconds, note.velocity);
        }
    }

    // A music-box pluck: quick to sound, ringing away.
    _pluck(midi, at, seconds, velocity) {
        const context = this._context;
        const envelope = context.createGain();
        const peak = VOICE_GAIN.melody * velocity;
        const ring = Math.max(0.6, seconds * 2.2);
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(peak, at + 0.01);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + ring);
        envelope.connect(this._gain);
        const tone = this._oscillator('sine', frequencyOf(midi), at, at + ring, envelope);
        const shimmer = context.createGain();
        shimmer.gain.value = 0.18;
        shimmer.connect(envelope);
        this._oscillator('sine', frequencyOf(midi + 12), at, at + ring, shimmer);
        return tone;
    }

    // A pad that swells in over the bar and fades out after it.
    _pad(midi, at, seconds, velocity) {
        const context = this._context;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 900;
        filter.Q.value = 0.3;
        const envelope = context.createGain();
        const peak = VOICE_GAIN.pad * velocity;
        const release = 1.5;
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(peak, at + Math.min(1.2, seconds / 2));
        envelope.gain.setValueAtTime(peak, at + seconds);
        envelope.gain.linearRampToValueAtTime(0, at + seconds + release);
        filter.connect(envelope);
        envelope.connect(this._gain);
        for (const detune of [-6, 6]) {
            const oscillator = this._oscillator('triangle', frequencyOf(midi), at, at + seconds + release, filter);
            oscillator.detune.value = detune;
        }
    }

    // A round, soft bass note.
    _bass(midi, at, seconds, velocity) {
        const context = this._context;
        const envelope = context.createGain();
        const peak = VOICE_GAIN.bass * velocity;
        envelope.gain.setValueAtTime(0, at);
        envelope.gain.linearRampToValueAtTime(peak, at + 0.03);
        envelope.gain.exponentialRampToValueAtTime(0.0001, at + seconds + 0.4);
        envelope.connect(this._gain);
        this._oscillator('sine', frequencyOf(midi), at, at + seconds + 0.4, envelope);
    }

    _oscillator(type, frequency, from, to, destination) {
        const oscillator = this._context.createOscillator();
        oscillator.type = type;
        oscillator.frequency.value = frequency;
        oscillator.connect(destination);
        oscillator.start(from);
        oscillator.stop(to);
        this._sounding.add(oscillator);
        oscillator.onended = () => this._sounding.delete(oscillator);
        return oscillator;
    }
}
