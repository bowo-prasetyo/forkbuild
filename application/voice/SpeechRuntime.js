// Voice building's speech recognition: Whisper (a small speech model) run in
// the browser by transformers.js and the ONNX runtime, so what a player says
// never leaves the device. Nothing is loaded until voice is turned on; then:
//
// - the ONNX runtime's WebAssembly engine is downloaded once from jsDelivr,
//   at one exact version, and refused unless its SHA-256 is the one below;
// - the speech model (onnx-community/whisper-tiny) is downloaded once from
//   Hugging Face;
// - both are kept in this browser's Cache Storage, so voice works offline
//   afterwards, and remove() deletes them.
//
// transformers.js (vendor/transformers/) and the engine's small loader
// (vendor/onnxruntime-web/) are served by this site, so no script ever comes
// from elsewhere; the engine is given to the runtime as bytes, never by URL
// (docs/Privacy.md, "Voice building").
export const SPEECH_MODEL = 'onnx-community/whisper-tiny';

export const SPEECH_ENGINE = Object.freeze({
    url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/ort-wasm-simd-threaded.asyncify.wasm',
    sha256: '49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082',
    bytes: 26861777
});

// About how much turning voice on downloads: the engine and the model.
export const SPEECH_DOWNLOAD_BYTES = 70 * 1000 * 1000;

const ENGINE_CACHE = 'forkbuild-voice-engine';
// Where transformers.js keeps the model files (its env.cacheKey).
const MODEL_CACHE = 'transformers-cache';

function hex(buffer) {
    return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class SpeechRuntime {
    constructor({
        importLibrary = () => import('../../vendor/transformers/transformers.min.js'),
        fetch: fetchResource = (...args) => globalThis.fetch(...args),
        caches: cacheStorage = globalThis.caches,
        subtle = globalThis.crypto?.subtle,
        engine = SPEECH_ENGINE,
        engineLoaderUrl = () => new URL('vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs', globalThis.document?.baseURI).href
    } = {}) {
        this._importLibrary = importLibrary;
        this._fetch = fetchResource;
        this._caches = cacheStorage;
        this._subtle = subtle;
        this._engineSource = engine;
        this._engineLoaderUrl = engineLoaderUrl;
        this._loading = null;
        this._recognize = null;
    }

    // Whether this browser can run it at all.
    static supported(scope = globalThis) {
        return typeof scope.WebAssembly === 'object' && !!scope.caches && !!scope.crypto?.subtle
            && !!scope.navigator?.mediaDevices?.getUserMedia && typeof scope.MediaRecorder === 'function';
    }

    // Whether the engine is already kept here, so turning voice on again
    // downloads nothing (the model is checked by transformers.js itself).
    async downloaded() {
        try {
            const cache = await this._caches.open(ENGINE_CACHE);
            return !!(await cache.match(this._engineSource.url));
        } catch {
            return false;
        }
    }

    // Loads everything once. `onProgress({ phase, loaded, total })`, phase
    // 'engine' then 'model', while downloading.
    load(onProgress = () => {}) {
        if (!this._loading) {
            this._loading = this._load(onProgress);
            this._loading.catch(() => { this._loading = null; });
        }
        return this._loading;
    }

    async _load(onProgress) {
        const engine = await this._engine(onProgress);
        const library = await this._importLibrary();
        const { env, pipeline } = library;
        env.allowLocalModels = false;
        env.useBrowserCache = true;
        // transformers.js would fetch the engine's loader into a blob: URL,
        // which this site's Content Security Policy forbids; ours is given.
        env.useWasmCache = false;
        const wasm = env.backends.onnx.wasm;
        wasm.wasmPaths = { mjs: this._engineLoaderUrl() };
        wasm.wasmBinary = engine;
        wasm.numThreads = 1;
        wasm.proxy = false;
        const files = new Map();
        this._recognize = await pipeline('automatic-speech-recognition', SPEECH_MODEL, {
            device: 'wasm',
            dtype: 'q8',
            progress_callback: (event) => {
                if (event?.status !== 'progress' || !event.file) return;
                files.set(event.file, { loaded: event.loaded || 0, total: event.total || 0 });
                let loaded = 0;
                let total = 0;
                for (const file of files.values()) {
                    loaded += file.loaded;
                    total += file.total;
                }
                onProgress({ phase: 'model', loaded, total });
            }
        });
        return this;
    }

    // The engine's bytes: kept, or downloaded and checked against its hash.
    async _engine(onProgress) {
        const { url, bytes: size } = this._engineSource;
        const cache = await this._caches.open(ENGINE_CACHE);
        const kept = await cache.match(url);
        if (kept) {
            const bytes = await kept.arrayBuffer();
            if (await this._verified(bytes)) return bytes;
            await cache.delete(url);
        }
        const response = await this._fetch(url, { credentials: 'omit' });
        if (!response.ok) throw new Error(`speech engine: ${response.status}`);
        const bytes = await this._readWithProgress(response, (loaded) => onProgress({ phase: 'engine', loaded, total: size }));
        if (!(await this._verified(bytes))) throw new Error('speech engine: its SHA-256 is not the pinned one');
        await cache.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/wasm' } }));
        return bytes;
    }

    async _verified(bytes) {
        return hex(await this._subtle.digest('SHA-256', bytes)) === this._engineSource.sha256;
    }

    async _readWithProgress(response, report) {
        if (!response.body?.getReader) return response.arrayBuffer();
        const reader = response.body.getReader();
        const chunks = [];
        let loaded = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
            loaded += value.length;
            report(loaded);
        }
        const bytes = new Uint8Array(loaded);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.length;
        }
        return bytes.buffer;
    }

    // What was said in `samples` (mono, 16 kHz, Float32Array), heard as
    // `language` (a Whisper language name, core/voice/Transcript.js).
    async transcribe(samples, language) {
        await this.load();
        const result = await this._recognize(samples, { language, task: 'transcribe' });
        return typeof result?.text === 'string' ? result.text : '';
    }

    // Deletes the engine and the model from this browser.
    async remove() {
        this._loading = null;
        this._recognize = null;
        await Promise.all([ENGINE_CACHE, MODEL_CACHE].map((name) => Promise.resolve(this._caches.delete(name)).catch(() => false)));
    }
}
