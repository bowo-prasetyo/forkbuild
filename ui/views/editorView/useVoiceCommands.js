import { onBeforeUnmount, ref } from 'vue';
import { SpeechRuntime } from '../../../application/voice/SpeechRuntime.js';
import { cleanTranscript, whisperLanguage } from '../../../core/voice/Transcript.js';
import { startRecording } from '../../voice/recordVoice.js';
import { currentLocale } from '../../i18n/i18n.js';

// Voice building in the Editor: V (or the microphone button) starts
// listening and stops; what was said is heard on this device
// (application/voice/SpeechRuntime.js) and done by `act(transcript)`, the
// same plain commands and actions the command palette offers. The first time,
// it explains what turning voice on downloads and asks; the choice is kept
// on this device.
//
// `state.value.step`: 'off' | 'intro' | 'loading' | 'ready' | 'listening' |
// 'working' | 'result' | 'failed', with `progress` (0–100) while loading
// and `heard`/`outcome` after a command.
const ENABLED_KEY = 'forkbuild.voice.enabled';


export function useVoiceCommands({ act, runtime = new SpeechRuntime(), record = startRecording, supported = SpeechRuntime.supported(), language = () => currentLocale().code, storage = globalThis.localStorage }) {
    const state = ref({ step: 'off' });
    let recording = null;

    function readEnabled() {
        try {
            return storage?.getItem(ENABLED_KEY) === 'yes';
        } catch {
            return false;
        }
    }
    function writeEnabled(on) {
        try {
            if (on) storage?.setItem(ENABLED_KEY, 'yes');
            else storage?.removeItem(ENABLED_KEY);
        } catch {
            // Kept for this visit only.
        }
    }

    function show(next) {
        state.value = Object.freeze(next);
    }

    async function load() {
        show({ step: 'loading', progress: 0 });
        try {
            await runtime.load(({ phase, loaded, total }) => {
                // The engine is the first ~40% of the download, the model the rest.
                const share = total > 0 ? Math.min(1, loaded / total) : 0;
                show({ step: 'loading', progress: Math.round(phase === 'engine' ? share * 40 : 40 + share * 60) });
            });
            return true;
        } catch (error) {
            show({ step: 'failed', reason: error?.message || String(error) });
            return false;
        }
    }

    async function listen() {
        if (!(await load())) return;
        try {
            recording = await record({ onAutoStop: () => { finish(); } });
        } catch (error) {
            show({ step: 'failed', reason: error?.name === 'NotAllowedError' ? 'microphone' : (error?.message || String(error)) });
            return;
        }
        show({ step: 'listening' });
    }

    async function finish() {
        const current = recording;
        recording = null;
        if (!current) return;
        show({ step: 'working' });
        try {
            const samples = await current.stop();
            const heard = samples.length > 0
                ? cleanTranscript(await runtime.transcribe(samples, whisperLanguage(language())))
                : '';
            show({ step: 'result', heard, outcome: heard ? act(heard) : { kind: 'nothing' } });
        } catch (error) {
            show({ step: 'failed', reason: error?.message || String(error) });
        }
    }

    // V and the microphone button: ask first, then listen, then stop.
    function toggle() {
        const { step } = state.value;
        if (!supported) {
            show({ step: 'failed', reason: 'unsupported' });
        } else if (step === 'listening') {
            finish();
        } else if (step === 'loading' || step === 'working') {
            // Busy; the press is ignored.
        } else if (!readEnabled()) {
            show({ step: 'intro' });
        } else {
            listen();
        }
    }

    function turnOn() {
        writeEnabled(true);
        listen();
    }

    async function turnOff() {
        writeEnabled(false);
        await recording?.cancel();
        recording = null;
        show({ step: 'off' });
    }

    async function removeModel() {
        await turnOff();
        await runtime.remove();
        show({ step: 'removed' });
    }

    function close() {
        if (state.value.step === 'listening') return;
        show({ step: 'off' });
    }

    // Leaving the Editor lets go of the microphone.
    function release() {
        recording?.cancel();
        recording = null;
    }
    onBeforeUnmount(release);

    return { voice: state, voiceSupported: supported, toggleVoice: toggle, turnOnVoice: turnOn, turnOffVoice: turnOff, removeVoiceModel: removeModel, closeVoice: close };
}
