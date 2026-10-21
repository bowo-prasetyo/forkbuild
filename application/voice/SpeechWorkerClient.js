// The page's side of voice building's speech recognition: the same
// downloaded(), load(), transcribe() and remove() as SpeechRuntime, each
// answered by the speech worker (application/voice/speechWorker.js,
// application/voice/serveSpeech.js), which is started the first time one is
// called. Recognition takes a second or two of hard work; in the worker, the
// 3D view keeps drawing and the page keeps answering meanwhile.
//
// If the worker stops (it couldn't start, or the browser ended it), what was
// asked fails with the reason and the next request starts a new one.

// About how much turning voice on downloads: the engine and the model.
export const SPEECH_DOWNLOAD_BYTES = 70 * 1000 * 1000;

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
    constructor({ createWorker, engineLoaderUrl }) {
        this._createWorker = createWorker;
        this._engineLoaderUrl = engineLoaderUrl;
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
        return this._ask({ type: 'transcribe', samples, language }, null, [samples.buffer]);
    }

    remove() {
        return this._ask({ type: 'remove' });
    }

    _ask(request, onProgress = null, transfer = []) {
        let worker;
        try {
            worker = this._started();
        } catch (error) {
            return Promise.reject(error);
        }
        const id = this._nextId++;
        return new Promise((resolve, reject) => {
            this._pending.set(id, { resolve, reject, onProgress });
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
        if (error) pending.reject(new Error(error));
        else pending.resolve(value);
    }

    _stopped(worker, reason) {
        if (this._worker !== worker) return;
        this._worker = null;
        worker.terminate?.();
        const pending = [...this._pending.values()];
        this._pending.clear();
        for (const { reject } of pending) reject(new Error(reason));
    }
}
