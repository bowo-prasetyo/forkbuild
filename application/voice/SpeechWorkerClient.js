// The page's side of voice building's speech recognition: the same
// downloaded(), load(), transcribe(), hear() and remove() as SpeechRuntime, each
// answered by the speech worker (application/voice/speechWorker.js,
// application/voice/serveSpeech.js), which is started the first time one is
// called. Recognition takes a second or two of hard work; in the worker, the
// 3D view keeps drawing and the page keeps answering meanwhile.
//
// If the worker stops (it couldn't start, or the browser ended it), what was
// asked fails with the reason and the next request starts a new one. So does
// a transcription that takes longer than TRANSCRIBE_TIMEOUT_MS: a stuck
// model can't be interrupted, so its worker is ended, the request fails with
// TRANSCRIBE_TIMEOUT, and the next load() reads the model from this browser's
// cache in a new one.

import { SPEECH_ENGINE } from './SpeechRuntime.js';
import { SPEECH_MODEL_BYTES } from './SpeechModelPins.js';

// How much turning voice on downloads: the engine and the model; and the
// engine's share of it, which downloads first.
export const SPEECH_DOWNLOAD_BYTES = SPEECH_ENGINE.bytes + SPEECH_MODEL_BYTES;
export const SPEECH_ENGINE_SHARE = SPEECH_ENGINE.bytes / SPEECH_DOWNLOAD_BYTES;

// How long working out what was said may take, from a few seconds of sound,
// before it is given up; and the reason it then fails with.
// Whisper base takes about 4 s for a command on a laptop, 7 s at most
// (scripts/evaluate-voice-commands.mjs); this leaves a phone six times
// slower room before a stuck model is given up.
export const TRANSCRIBE_TIMEOUT_MS = 45 * 1000;
export const TRANSCRIBE_TIMEOUT = 'timeout';

// This site's copy of the speech engine's loader (scripts/vendor.mjs).
export const SPEECH_ENGINE_LOADER = 'vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs';

// Whether this browser can record and run the speech model at all.
export function speechSupported(scope = globalThis) {
    return typeof scope.WebAssembly === 'object' && typeof scope.Worker === 'function' && !!scope.caches && !!scope.crypto?.subtle
        && !!scope.navigator?.mediaDevices?.getUserMedia && typeof scope.MediaRecorder === 'function';
}

export class SpeechWorkerClient {
    // `createWorker()` starts the worker; `engineLoaderUrl` is
    // SPEECH_ENGINE_LOADER's full address.
    constructor({ createWorker, engineLoaderUrl, transcribeTimeoutMs = TRANSCRIBE_TIMEOUT_MS }) {
        this._createWorker = createWorker;
        this._engineLoaderUrl = engineLoaderUrl;
        this._transcribeTimeoutMs = transcribeTimeoutMs;
        this._worker = null;
        this._pending = new Map();
        this._nextId = 1;
    }

    downloaded() {
        return this._ask({ type: 'downloaded' }).catch(() => false);
    }

    // `onProgress({ phase, loaded, total })`, as SpeechRuntime#load().
    async load(onProgress = () => {}) {
        await this._ask({ type: 'load' }, onProgress);
        return this;
    }

    // `samples` (mono, 16 kHz, Float32Array) is handed to the worker, not copied.
    transcribe(samples, language) {
        return this._ask({ type: 'transcribe', samples, language }, null, [samples.buffer], this._transcribeTimeoutMs);
    }

    // What was said, with how sure the model was (SpeechRuntime#hear()),
    // given `prompt` as what came before.
    hear(samples, language, { prompt = '' } = {}) {
        return this._ask({ type: 'hear', samples, language, prompt }, null, [samples.buffer], this._transcribeTimeoutMs);
    }

    remove() {
        return this._ask({ type: 'remove' });
    }

    _ask(request, onProgress = null, transfer = [], timeoutMs = null) {
        let worker;
        try {
            worker = this._started();
        } catch (error) {
            return Promise.reject(error);
        }
        const id = this._nextId++;
        return new Promise((resolve, reject) => {
            const timer = timeoutMs === null ? null : setTimeout(() => this._stopped(worker, TRANSCRIBE_TIMEOUT), timeoutMs);
            this._pending.set(id, { resolve, reject, onProgress, timer });
            worker.postMessage({ ...request, id, engineLoaderUrl: this._engineLoaderUrl }, transfer);
        });
    }

    _started() {
        if (this._worker) return this._worker;
        const worker = this._createWorker();
        worker.addEventListener('message', ({ data }) => this._answered(data || {}));
        worker.addEventListener('error', (event) => {
            event.preventDefault?.();
            this._stopped(worker, event.message || 'the speech worker stopped');
        });
        worker.addEventListener('messageerror', () => this._stopped(worker, 'the speech worker sent something unreadable'));
        this._worker = worker;
        return worker;
    }

    _answered({ id, progress, done, value, error }) {
        const pending = this._pending.get(id);
        if (!pending) return;
        if (!done) {
            if (progress) pending.onProgress?.(progress);
            return;
        }
        this._pending.delete(id);
        clearTimeout(pending.timer);
        if (error) pending.reject(new Error(error));
        else pending.resolve(value);
    }

    _stopped(worker, reason) {
        if (this._worker !== worker) return;
        this._worker = null;
        worker.terminate?.();
        const pending = [...this._pending.values()];
        this._pending.clear();
        for (const { reject, timer } of pending) {
            clearTimeout(timer);
            reject(new Error(reason));
        }
    }
}
