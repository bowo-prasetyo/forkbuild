// Recorded sound made ready for the speech model (application/voice/
// SpeechRuntime.js): the silence before and after what was said cut off, and
// a quiet voice brought up to a level the model hears well. When nothing
// was said at all, the model is not asked: given silence, a small speech
// model tends to make words up (core/voice/Transcript.js#withoutSilenceWords()
// says which), most of all in the languages it was least trained on.
//
// Pure: samples in (mono, any rate), samples out.

// How long one measured stretch of sound is.
const FRAME_SECONDS = 0.02;

// How much sound is kept either side of what was said, so a word's first
// and last sounds are never clipped.
const PADDING_SECONDS = 0.25;

// Quieter than this (RMS, full scale 1) is never speech, however quiet the
// room: about -46 dBFS.
const MIN_SPEECH_LEVEL = 0.005;

// Speech is this many times louder than the room's own background, measured
// as the quietest tenth of the recording; but never needs to be louder than
// MAX_SPEECH_THRESHOLD (about -34 dBFS, well under a speaking voice), or a
// recording that is talk from start to end would count its own words as the
// background.
const ABOVE_BACKGROUND = 3;
const MAX_SPEECH_THRESHOLD = 0.02;

// Less speech than this is a click or a breath, not a word.
const MIN_SPEECH_SECONDS = 0.15;

// A quiet voice is brought up until its loudest sample reaches this, but
// never by more than MAX_GAIN, so the room's hiss is not made into a roar.
const TARGET_PEAK = 0.9;
const MAX_GAIN = 8;

function rmsOf(samples, start, end) {
    let sum = 0;
    for (let i = start; i < end; i++) sum += samples[i] * samples[i];
    return Math.sqrt(sum / Math.max(1, end - start));
}

// `samples` (a Float32Array at `sampleRate`) ready for the model:
// { speech, samples }. `speech` is false when nothing was said (then
// `samples` is empty); otherwise `samples` is what was said, padded, at a
// level the model hears well.
export function prepareSpeech(samples, { sampleRate = 16000 } = {}) {
    if (!samples || samples.length === 0) return { speech: false, samples: new Float32Array(0) };
    const frame = Math.max(1, Math.round(FRAME_SECONDS * sampleRate));
    const frames = Math.ceil(samples.length / frame);
    const levels = new Float64Array(frames);
    for (let f = 0; f < frames; f++) {
        levels[f] = rmsOf(samples, f * frame, Math.min(samples.length, (f + 1) * frame));
    }
    const sorted = Array.from(levels).sort((a, b) => a - b);
    const background = sorted[Math.floor((sorted.length - 1) * 0.1)];
    const threshold = Math.max(MIN_SPEECH_LEVEL, Math.min(MAX_SPEECH_THRESHOLD, background * ABOVE_BACKGROUND));

    let first = -1;
    let last = -1;
    let loud = 0;
    for (let f = 0; f < frames; f++) {
        if (levels[f] >= threshold) {
            if (first === -1) first = f;
            last = f;
            loud++;
        }
    }
    if (first === -1 || loud * FRAME_SECONDS < MIN_SPEECH_SECONDS) {
        return { speech: false, samples: new Float32Array(0) };
    }

    const padding = Math.round(PADDING_SECONDS * sampleRate);
    const start = Math.max(0, first * frame - padding);
    const end = Math.min(samples.length, (last + 1) * frame + padding);
    const kept = samples.slice(start, end);
    let peak = 0;
    for (const sample of kept) peak = Math.max(peak, Math.abs(sample));
    const gain = peak > 0 ? Math.min(MAX_GAIN, TARGET_PEAK / peak) : 1;
    if (gain > 1) {
        for (let i = 0; i < kept.length; i++) kept[i] *= gain;
    }
    return { speech: true, samples: kept };
}
