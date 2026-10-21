// Voice building's speech recognition: Whisper (a small speech model) run in
// the browser by transformers.js and the ONNX runtime, so what a player says
// never leaves the device. It runs in a worker (application/voice/
// speechWorker.js), so the 3D view never pauses while it works; the page
// talks to it through application/voice/SpeechWorkerClient.js. Nothing is
// loaded until voice is turned on; then:
//
// - the ONNX runtime's WebAssembly engine is downloaded once from jsDelivr,
//   at one exact version, and refused unless its SHA-256 is the one below;
// - the speech model (onnx-community/whisper-tiny) is downloaded once from
//   Hugging Face, at the commit application/voice/SpeechModelPins.js names, and
//   every file of it is refused unless its SHA-256 is the pinned one, whether
//   downloaded or found in this browser's cache (application/voice/
//   PinnedModelFiles.js);
// - both are kept in this browser's Cache Storage, so voice works offline
//   afterwards, and remove() deletes them.
//
// transformers.js (vendor/transformers/) and the engine's small loader
// (vendor/onnxruntime-web/) are served by this site, so no script ever comes
// from elsewhere; the engine is given to the runtime as bytes, never by URL
// (docs/Privacy.md, "Voice building").
import { SPEECH_MODEL_REVISION, SPEECH_MODEL_FILES } from './SpeechModelPins.js';
import { PinnedModelFiles } from './PinnedModelFiles.js';

export const SPEECH_MODEL = 'onnx-community/whisper-tiny';

export const SPEECH_ENGINE = Object.freeze({
    url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/ort-wasm-simd-threaded.asyncify.wasm',
    sha256: '49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082',
    bytes: 26861777
});

const ENGINE_CACHE = 'forkbuild-voice-engine';
// Where transformers.js keeps the model files (its env.cacheKey).
const MODEL_CACHE = 'transformers-cache';

function hex(buffer) {
    return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// `engineLoaderUrl` is the address of this site's copy of the engine's loader
// (SPEECH_ENGINE_LOADER in application/voice/SpeechWorkerClient.js): a worker
// has no page to resolve it against, so the page hands it over.
export class SpeechRuntime {
    constructor({
        importLibrary = () => import('../../vendor/transformers/transformers.min.js'),
        fetch: fetchResource = (...args) => globalThis.fetch(...args),
        caches: cacheStorage = globalThis.caches,
        subtle = globalThis.crypto?.subtle,
        engine = SPEECH_ENGINE,
        modelRevision = SPEECH_MODEL_REVISION,
        modelFiles = SPEECH_MODEL_FILES,
        engineLoaderUrl
    } = {}) {
        this._modelRevision = modelRevision;
        this._modelFiles = modelFiles;
        this._importLibrary = importLibrary;
        this._fetch = fetchResource;
        this._caches = cacheStorage;
        this._subtle = subtle;
        this._engineSource = engine;
        this._engineLoaderUrl = engineLoaderUrl;
        this._loading = null;
        this._recognize = null;
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
        wasm.wasmPaths = { mjs: this._engineLoaderUrl };
        wasm.wasmBinary = engine;
        wasm.numThreads = 1;
        wasm.proxy = false;
        const files = new Map();
        const report = (file, loaded, total) => {
            files.set(file, { loaded: loaded || 0, total: total || 0 });
            let sumLoaded = 0;
            let sumTotal = 0;
            for (const each of files.values()) {
                sumLoaded += each.loaded;
                sumTotal += each.total;
            }
            onProgress({ phase: 'model', loaded: sumLoaded, total: sumTotal });
        };
        const pinned = this._modelRevision !== null && this._modelRevision !== undefined;
        if (pinned) {
            // Every file of the model held to its pin, downloaded or cached.
            const pinnedFiles = new PinnedModelFiles({
                model: SPEECH_MODEL,
                revision: this._modelRevision,
                files: this._modelFiles,
                host: env.remoteHost || 'https://huggingface.co/',
                fetch: this._fetch,
                caches: this._caches,
                cacheName: MODEL_CACHE,
                subtle: this._subtle,
                onProgress: report
            });
            env.fetch = (url, init) => pinnedFiles.fetch(url, init);
            env.useCustomCache = true;
            env.customCache = pinnedFiles.cache;
        }
        this._recognize = await pipeline('automatic-speech-recognition', SPEECH_MODEL, {
            device: 'wasm',
            dtype: 'q8',
            ...(pinned ? { revision: this._modelRevision } : {}),
            progress_callback: (event) => {
                if (event?.status !== 'progress' || !event.file) return;
                report(event.file, event.loaded, event.total);
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
