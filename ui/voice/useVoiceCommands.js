import { onBeforeUnmount, ref } from 'vue';
import { SPEECH_ENGINE_SHARE, TRANSCRIBE_TIMEOUT, speechSupported } from '../../application/voice/SpeechWorkerClient.js';
import { SPEECH_MODEL } from '../../application/voice/SpeechModelPins.js';
import { cleanTranscript, whisperLanguage, withoutSilenceWords } from '../../core/voice/Transcript.js';
import { prepareSpeech } from '../../core/voice/SpeechPreparation.js';
import { startRecording } from './recordVoice.js';
import { sharedSpeechRecognizer } from './speechRecognizer.js';
import { currentLocale } from '../i18n/i18n.js';

// Voice building, in the Editor and in World View: V (or the microphone
// button) starts listening and stops; what was said is heard on this device,
// in the speech worker both views share (ui/voice/speechRecognizer.js), and
// done by `act(transcript)`: in the Editor, the plain commands and actions
// the command palette offers; in World View, going places and the like
// (core/voice/WorldVoiceCommand.js). The first time, it explains what
// turning voice on downloads and asks; the choice is kept on this device,
// for both views, naming the model it was made for, so a new speech model
// (another download) is asked about again.
//
// `state.value.step`: 'off' | 'intro' | 'loading' | 'ready' | 'listening' |
// 'working' | 'result' | 'failed', with `progress` (0–100) while loading,
// `heard`/`outcome` after a command, and `reason` on failing ('microphone',
// 'unsupported', 'timeout' or the error's message).
const ENABLED_KEY = 'forkbuild.voice.enabled';

export function useVoiceCommands({ act, runtime = sharedSpeechRecognizer(), record = startRecording, supported = speechSupported(), language = () => currentLocale().code, storage = globalThis.localStorage }) {
    const state = ref({ step: 'off' });
    let recording = null;
    // Counts each command, so what is heard after voice was turned off, or
    // the view left, is let go rather than shown or done.
    let attempt = 0;

    function readEnabled() {
        try {
            return storage?.getItem(ENABLED_KEY) === SPEECH_MODEL;
        } catch {
            return false;
        }
    }
    function writeEnabled(on) {
        try {
            if (on) storage?.setItem(ENABLED_KEY, SPEECH_MODEL);
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
                // The engine is the first part of the download, the model the rest.
                const share = total > 0 ? Math.min(1, loaded / total) : 0;
                const engine = 100 * SPEECH_ENGINE_SHARE;
                show({ step: 'loading', progress: Math.round(phase === 'engine' ? share * engine : engine + share * (100 - engine)) });
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
        const mine = ++attempt;
        show({ step: 'working' });
        try {
            // Only what was said, at a level the model hears well; nothing
            // said, nothing asked (core/voice/SpeechPreparation.js), and what
            // the model makes up from silence is not taken for a command.
            const speech = prepareSpeech(await current.stop());
            const heard = speech.speech
                ? withoutSilenceWords(cleanTranscript(await runtime.transcribe(speech.samples, whisperLanguage(language()))))
                : '';
            if (mine !== attempt) return;
            show({ step: 'result', heard, outcome: heard ? act(heard) : { kind: 'nothing' } });
        } catch (error) {
            if (mine !== attempt) return;
            // A model that took too long was stopped (application/voice/
            // SpeechWorkerClient.js); the next press starts it again.
            show({ step: 'failed', reason: error?.message === TRANSCRIBE_TIMEOUT ? 'timeout' : (error?.message || String(error)) });
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
        attempt++;
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

    // Leaving the view lets go of the microphone; the model stays loaded.
    function release() {
        attempt++;
        recording?.cancel();
        recording = null;
    }
    onBeforeUnmount(release);

    return { voice: state, voiceSupported: supported, toggleVoice: toggle, turnOnVoice: turnOn, turnOffVoice: turnOff, removeVoiceModel: removeModel, closeVoice: close };
}
