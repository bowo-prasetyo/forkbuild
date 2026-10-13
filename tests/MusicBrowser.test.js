// @environment browser — renders the music with a real OfflineAudioContext.
import { MusicPlayer } from '../audio/MusicPlayer.js';
import { WebAudioSoundscapeProvider } from '../audio/WebAudioSoundscapeProvider.js';
import { MUSIC_MOOD } from '../core/MusicScore.js';
import { assert } from './support/Assert.js';

// The music (audio/MusicPlayer.js) is heard, soft and never clipping, in
// every mood; it plays nothing while off; and the soundscape provider only
// plays it while music is chosen, sound is on and the page is shown.

const SAMPLE_RATE = 22050;

function rmsOf(data) {
    let sum = 0;
    for (const value of data) sum += value * value;
    return Math.sqrt(sum / data.length);
}

function peakOf(data) {
    let peak = 0;
    for (const value of data) peak = Math.max(peak, Math.abs(value));
    return peak;
}

// Renders the first `seconds` of a player in `mood`. A phrase is longer
// than the render, so starting schedules all of it.
async function renderMusic(mood, { enabled = true, seconds = 8 } = {}) {
    const context = new OfflineAudioContext(1, SAMPLE_RATE * seconds, SAMPLE_RATE);
    const timers = [];
    const player = new MusicPlayer({
        context, output: context.destination, seed: 7,
        setTimeoutFn: (fn) => { timers.push(fn); return timers.length; }, clearTimeoutFn: () => {}
    });
    player.setMood(mood);
    player.setEnabled(enabled);
    assert(timers.length === (enabled ? 1 : 0), 'it comes back to schedule more only while on');
    const buffer = await context.startRendering();
    player.dispose();
    return buffer.getChannelData(0);
}

{
    for (const mood of [MUSIC_MOOD.EDITOR, MUSIC_MOOD.DAY, MUSIC_MOOD.NIGHT]) {
        const data = await renderMusic(mood);
        const level = rmsOf(data.subarray(SAMPLE_RATE * 2));
        const peak = peakOf(data);
        assert(level > 0.005, `${mood}: the music is heard (${level.toFixed(4)})`);
        assert(peak < 0.6, `${mood}: soft, never clipping (${peak.toFixed(3)})`);
    }
    const off = await renderMusic(MUSIC_MOOD.DAY, { enabled: false });
    assert(peakOf(off) === 0, 'off, it plays nothing');
    console.log('✓ the music is heard in every mood, softly, and is silent while off');
}

// The provider plays music only while it is chosen, sound is on and the page shown.
{
    const offline = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE);
    const context = new Proxy(offline, {
        get(target, prop) {
            if (prop === 'state') return 'running';
            if (prop === 'resume' || prop === 'suspend' || prop === 'close') return () => Promise.resolve();
            const value = Reflect.get(target, prop, target);
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
    const documentRef = { hidden: false, listeners: [], addEventListener(type, fn) { this.listeners.push(fn); }, removeEventListener() {} };
    const provider = new WebAudioSoundscapeProvider({
        contextFactory: () => context, documentRef, ambience: false, setTimeoutFn: () => 1, clearTimeoutFn: () => {}
    });
    provider.setMusic(true);
    assert(!provider.musicPlaying, 'no music before a gesture');
    provider.resume();
    assert(provider.musicPlaying, 'music starts with the first gesture');
    provider.setMusicMood(MUSIC_MOOD.NIGHT);
    provider.setMuted(true);
    assert(!provider.musicPlaying, 'muting stops it');
    provider.setMuted(false);
    assert(provider.musicPlaying, 'unmuting brings it back');
    documentRef.hidden = true;
    documentRef.listeners.forEach((fn) => fn());
    assert(!provider.musicPlaying, 'a hidden page stops it');
    documentRef.hidden = false;
    documentRef.listeners.forEach((fn) => fn());
    provider.setMusic(false);
    assert(!provider.musicPlaying, 'turning music off stops it');
    provider.dispose();
    assert(!provider.musicPlaying, 'disposing stops it');
    console.log('✓ the provider plays music only while chosen, unmuted and shown');
}
