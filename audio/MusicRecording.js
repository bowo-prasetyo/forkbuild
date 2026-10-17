// The music for a time-lapse or turntable video (core/BuildVideo.js): the same
// synthesized music World View and the Editor play (audio/MusicPlayer.js,
// core/MusicScore.js), in its own AudioContext, played into a stream a
// recorder takes (renderer/BuildVideoRecorder.js) rather than to the
// speakers, so making a video is silent. Nothing is downloaded.

// The music's loudness in the video: World View's music at its default
// volume, as a walk-through records it.
const RECORDING_LEVEL = 0.5;

// Gets music in `mood` (core/MusicScore.js's MUSIC_MOOD) ready to record and
// returns `{ stream, play(), fadeOut(), pause(), resume(), stop() }`: `stream`
// has one audio track; play() starts the music from the top of a phrase, as
// recording starts; fadeOut() fades it away over about a second; pause() and
// resume() hold it while recording is paused; stop() ends it. Null where this
// browser can't record sound. Call it from a user gesture: browsers start
// audio only after one.
export async function createMusicRecording({ mood, seed = Date.now(), createContext = () => new AudioContext() } = {}) {
    let context;
    try {
        context = createContext();
    } catch {
        return null;
    }
    if (!context || typeof context.createMediaStreamDestination !== 'function') {
        context?.close?.().catch(() => {});
        return null;
    }
    const { MusicPlayer } = await import('./MusicPlayer.js');
    const level = context.createGain();
    level.gain.value = RECORDING_LEVEL;
    const destination = context.createMediaStreamDestination();
    level.connect(destination);
    const player = new MusicPlayer({ context, output: level, seed });
    player.setMood(mood);
    // Not waited for: a browser that won't start audio yet may never settle
    // it, and a context that can't start records silence.
    context.resume?.().catch(() => {});
    let stopped = false;
    return Object.freeze({
        stream: destination.stream,
        play() {
            if (!stopped) player.setEnabled(true);
        },
        fadeOut() {
            if (!stopped) player.setEnabled(false);
        },
        pause() {
            if (!stopped) context.suspend().catch(() => {});
        },
        resume() {
            if (!stopped) context.resume().catch(() => {});
        },
        stop() {
            if (stopped) return;
            stopped = true;
            player.dispose();
            destination.stream.getTracks().forEach((track) => track.stop());
            context.close().catch(() => {});
        }
    });
}
