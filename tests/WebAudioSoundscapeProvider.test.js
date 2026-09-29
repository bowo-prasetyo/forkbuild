// @environment browser — renders the synthesized soundscape with a real OfflineAudioContext.
import { WebAudioSoundscapeProvider } from '../audio/WebAudioSoundscapeProvider.js';
import { useWorldSoundscape } from '../ui/views/worldView/useWorldSoundscape.js';
import { assert } from './support/Assert.js';

const SAMPLE_RATE = 22050;
const SECONDS = 3;

function silence() {
    return { wind: 0, birds: 0, insects: 0, water: 0, stream: 0 };
}

// Renders SECONDS of the provider's output after `configure` and returns the
// RMS level of the last second, once the level fades have settled.
async function render(configure) {
    const context = new OfflineAudioContext(2, SAMPLE_RATE * SECONDS, SAMPLE_RATE);
    const provider = new WebAudioSoundscapeProvider({ contextFactory: () => context, documentRef: null });
    configure(provider);
    provider.resume();
    const buffer = await context.startRendering();
    provider.dispose();
    const data = buffer.getChannelData(0).subarray(SAMPLE_RATE * (SECONDS - 1));
    let sum = 0;
    for (const value of data) sum += value * value;
    return Math.sqrt(sum / data.length);
}

async function runTests() {
    // Every continuous layer makes sound on its own, and silence is silent.
    for (const layer of ['wind', 'water', 'stream', 'insects']) {
        const rms = await render((provider) => provider.setLayerLevels({ ...silence(), [layer]: 1 }));
        assert(rms > 0.001, `${layer} is audible (rms ${rms})`);
    }
    const quiet = await render((provider) => provider.setLayerLevels(silence()));
    assert(quiet === 0, `all layers at 0 is silent (rms ${quiet})`);
    console.log('✓ each layer is audible, and silence is silent');

    // Mute and volume act on everything.
    const full = await render((provider) => { provider.setVolume(1); provider.setLayerLevels({ ...silence(), wind: 1 }); });
    const half = await render((provider) => { provider.setVolume(0.25); provider.setLayerLevels({ ...silence(), wind: 1 }); });
    assert(half < full * 0.5, `a lower volume is quieter (${half} vs ${full})`);
    const muted = await render((provider) => { provider.setMuted(true); provider.setLayerLevels({ ...silence(), wind: 1 }); });
    assert(muted === 0, `muted is silent (rms ${muted})`);
    console.log('✓ volume and mute');

    // Levels set after the context exists fade in.
    {
        const context = new OfflineAudioContext(1, SAMPLE_RATE * SECONDS, SAMPLE_RATE);
        const provider = new WebAudioSoundscapeProvider({ contextFactory: () => context, documentRef: null });
        provider.resume();
        provider.setLayerLevels({ ...silence(), water: 1 });
        const buffer = await context.startRendering();
        provider.dispose();
        const data = buffer.getChannelData(0);
        const rmsOf = (from, to) => Math.sqrt(data.subarray(from, to).reduce((s, v) => s + v * v, 0) / (to - from));
        const start = rmsOf(0, SAMPLE_RATE / 10);
        const end = rmsOf(SAMPLE_RATE * 2, SAMPLE_RATE * 3);
        assert(start < end * 0.5, `a new level fades in rather than jumping (${start} then ${end})`);
        console.log('✓ level changes fade in');
    }

    // The context is suspended while muted or hidden, and resumes after.
    {
        const listeners = {};
        const doc = { hidden: false, addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type) => { delete listeners[type]; } };
        const calls = [];
        const fakeContext = new OfflineAudioContext(1, SAMPLE_RATE, SAMPLE_RATE);
        let state = 'suspended';
        const context = new Proxy(fakeContext, {
            get(target, prop) {
                if (prop === 'state') return state;
                if (prop === 'resume') return () => { calls.push('resume'); state = 'running'; return Promise.resolve(); };
                if (prop === 'suspend') return () => { calls.push('suspend'); state = 'suspended'; return Promise.resolve(); };
                if (prop === 'close') return () => { calls.push('close'); state = 'closed'; return Promise.resolve(); };
                const value = Reflect.get(target, prop, target);
                return typeof value === 'function' ? value.bind(target) : value;
            }
        });
        let made = 0;
        const provider = new WebAudioSoundscapeProvider({
            contextFactory: () => { made++; return context; },
            documentRef: doc,
            setTimeoutFn: () => 1,
            clearTimeoutFn: () => {}
        });
        provider.setMuted(false);
        assert(made === 0, 'no AudioContext is made before resume()');
        provider.resume();
        assert(made === 1 && state === 'running', 'resume() makes and starts the context');
        provider.setMuted(true);
        assert(state === 'suspended', 'muting suspends the context');
        provider.setMuted(false);
        assert(state === 'running', 'unmuting resumes it');
        doc.hidden = true;
        listeners.visibilitychange();
        assert(state === 'suspended', 'a hidden page suspends the context');
        doc.hidden = false;
        listeners.visibilitychange();
        assert(state === 'running', 'a visible page resumes it');
        provider.resume();
        assert(made === 1, 'the context is made once');
        provider.dispose();
        assert(state === 'closed' && !listeners.visibilitychange, 'dispose() closes the context and stops listening');
        console.log('✓ suspended while muted or hidden');
    }

    // Birds are separate calls, timed more often the more birds there are.
    {
        const offline = new OfflineAudioContext(1, SAMPLE_RATE * 2, SAMPLE_RATE);
        // Reports itself running, as a live context would after a gesture.
        const context = new Proxy(offline, {
            get(target, prop) {
                if (prop === 'state') return 'running';
                if (prop === 'resume' || prop === 'suspend') return () => Promise.resolve();
                const value = Reflect.get(target, prop, target);
                return typeof value === 'function' ? value.bind(target) : value;
            }
        });
        const timers = [];
        const provider = new WebAudioSoundscapeProvider({
            contextFactory: () => context,
            documentRef: null,
            setTimeoutFn: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
            clearTimeoutFn: () => {}
        });
        provider.setLayerLevels({ ...silence(), birds: 1 });
        provider.resume();
        assert(timers.length === 1, 'a bird call is scheduled once sound runs');
        const busyDelay = timers[0].ms;
        timers[0].fn();
        assert(timers.length === 2, 'each call schedules the next');
        const buffer = await offline.startRendering();
        const data = buffer.getChannelData(0);
        const rms = Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length);
        assert(rms > 0.001, `a bird call is audible (rms ${rms})`);
        provider.dispose();

        const sparse = [];
        const quietProvider = new WebAudioSoundscapeProvider({
            contextFactory: () => context,
            documentRef: null,
            random: () => 0.5,
            setTimeoutFn: (fn, ms) => { sparse.push(ms); return 1; },
            clearTimeoutFn: () => {}
        });
        quietProvider.setLayerLevels({ ...silence(), birds: 0.1 });
        quietProvider.resume();
        const busy = [];
        const busyProvider = new WebAudioSoundscapeProvider({
            contextFactory: () => context,
            documentRef: null,
            random: () => 0.5,
            setTimeoutFn: (fn, ms) => { busy.push(ms); return 1; },
            clearTimeoutFn: () => {}
        });
        busyProvider.setLayerLevels({ ...silence(), birds: 1 });
        busyProvider.resume();
        assert(busy[0] < sparse[0], `more birds call more often (${busy[0]} ms vs ${sparse[0]} ms)`);
        assert(busyDelay > 0, 'calls are spaced out');
        console.log('✓ bird calls are audible and denser where there are more birds');
    }

    // Without Web Audio the provider stays silent instead of throwing.
    {
        const provider = new WebAudioSoundscapeProvider({ contextFactory: () => null, documentRef: null });
        provider.resume();
        provider.setLayerLevels({ ...silence(), wind: 1 });
        provider.setMuted(true);
        provider.setVolume(0.3);
        provider.dispose();
        assert(provider.context === null, 'no context without Web Audio');
        console.log('✓ missing Web Audio is harmless');
    }

    // World View's M key and gesture unlock.
    {
        const events = [];
        const fake = {
            _settings: { muted: false, volume: 0.5 },
            settings() { return this._settings; },
            start() { events.push('start'); },
            unlock() { events.push('unlock'); },
            toggleMuted() { this._settings = { ...this._settings, muted: !this._settings.muted }; return this._settings; },
            setVolume(volume) { this._settings = { ...this._settings, volume }; return this._settings; },
            dispose() { events.push('dispose'); }
        };
        const session = { getAvatarPosition: () => null, getCameraPosition: () => ({ x: 1, y: 2, z: 3 }), getWorldSeed: () => 7 };
        let factoryArgs = null;
        const sound = useWorldSoundscape({ createWorldSoundscape: (args) => { factoryArgs = args; return fake; }, session });
        assert(sound.soundAvailable.value === false, 'nothing until started');
        sound.startSound();
        assert(sound.soundAvailable.value === true && events.includes('start'), 'startSound() starts the soundscape');
        assert(factoryArgs.seed === 7 && factoryArgs.listenerPosition().x === 1, 'a spectator hears at the camera');

        window.dispatchEvent(new PointerEvent('pointerdown'));
        assert(events.includes('unlock'), 'a tap unlocks audio');

        const press = (init) => {
            const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
            return { handled: sound.onSoundKeyDown(event), event };
        };
        let { handled, event } = press({ key: 'm' });
        assert(handled && event.defaultPrevented && sound.soundMuted.value === true, 'M mutes');
        ({ handled } = press({ key: 'M' }));
        assert(handled && sound.soundMuted.value === false, 'Shift+M unmutes too');
        ({ handled } = press({ key: 'm', repeat: true }));
        assert(handled && sound.soundMuted.value === false, 'a held key does not flicker');
        ({ handled } = press({ key: 'm', ctrlKey: true }));
        assert(!handled, 'Ctrl+M is left alone');
        ({ handled } = press({ key: 'w' }));
        assert(!handled, 'other keys pass through');

        sound.setSoundVolume(0.8);
        assert(sound.soundVolume.value === 0.8, 'the slider sets the volume');

        sound.stopSound();
        assert(events.includes('dispose') && sound.soundAvailable.value === false, 'stopSound() disposes');
        const unlocks = events.filter((e) => e === 'unlock').length;
        window.dispatchEvent(new PointerEvent('pointerdown'));
        assert(events.filter((e) => e === 'unlock').length === unlocks, 'no unlock after stopping');
        assert(!press({ key: 'm' }).handled, 'M does nothing once stopped');

        const without = useWorldSoundscape({ createWorldSoundscape: null, session });
        without.startSound();
        assert(without.soundAvailable.value === false, 'no factory, no sound control');
        console.log('✓ World View: M toggles sound, a gesture unlocks it');
    }
}

await runTests();
