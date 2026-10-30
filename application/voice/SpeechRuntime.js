// Voice building's speech recognition: Whisper (a small speech model) run in
// the browser by transformers.js and the ONNX runtime, so what a player says
// never leaves the device. It runs in a worker (application/voice/
// speechWorker.js), so the 3D view never pauses while it works; the page
// talks to it through application/voice/SpeechWorkerClient.js. Nothing is
// loaded until voice is turned on; then:
//
// - the ONNX runtime's WebAssembly engine is downloaded once from jsDelivr,
//   at one exact version, and refused unless its SHA-256 is the one below;
// - the speech model (SPEECH_MODEL, Whisper base) is downloaded once from
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
import { SPEECH_MODEL, SPEECH_MODEL_BYTES, SPEECH_MODEL_REVISION, SPEECH_MODEL_FILES } from './SpeechModelPins.js';
import { PinnedModelFiles } from './PinnedModelFiles.js';

export { SPEECH_MODEL };

export const SPEECH_ENGINE = Object.freeze({
    url: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/ort-wasm-simd-threaded.asyncify.wasm',
    sha256: '49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082',
    bytes: 26861777
});

// The most tokens the model may write for one command. A command is a few
// words (Japanese and Korean take more tokens a word); without a limit,
// Whisper may write up to 448, repeating itself over noise, which takes
// many seconds on one thread.
export const MAX_SPOKEN_TOKENS = 48;

// The most tokens of a prompt (transcribe()'s `prompt`) the model is given:
// Whisper keeps at most half its 448-token context for what came before, and
// the last of a longer prompt is kept.
export const MAX_PROMPT_TOKENS = 200;

const ENGINE_CACHE = 'forkbuild-voice-engine';
// Where the model's files come from (transformers.js's env.remoteHost).
const MODEL_HOST = 'https://huggingface.co/';
// Where transformers.js keeps the model files (its env.cacheKey).
const MODEL_CACHE = 'transformers-cache';

function hex(buffer) {
    return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// `engineLoaderUrl` is the address of this site's copy of the engine's loader
// (SPEECH_ENGINE_LOADER in application/voice/SpeechWorkerClient.js): a worker
// has no page to resolve it against, so the page hands it over. `model` is
// another speech model to load, unpinned, for scripts/evaluate-voice-commands.mjs
// to measure; the app always loads SPEECH_MODEL, pinned.
export class SpeechRuntime {
    constructor({
        importLibrary = () => import('../../vendor/transformers/transformers.min.js'),
        fetch: fetchResource = (...args) => globalThis.fetch(...args),
        caches: cacheStorage = globalThis.caches,
        subtle = globalThis.crypto?.subtle,
        engine = SPEECH_ENGINE,
        modelRevision = SPEECH_MODEL_REVISION,
        modelFiles = SPEECH_MODEL_FILES,
        modelBytes = SPEECH_MODEL_BYTES,
        engineLoaderUrl,
        model = SPEECH_MODEL
    } = {}) {
        this._model = model;
        // Only SPEECH_MODEL has a pin, and a known size.
        this._modelRevision = model === SPEECH_MODEL ? modelRevision : null;
        this._modelBytes = model === SPEECH_MODEL ? modelBytes : 0;
        this._modelFiles = modelFiles;
        this._importLibrary = importLibrary;
        this._fetch = fetchResource;
        this._caches = cacheStorage;
        this._subtle = subtle;
        this._engineSource = engine;
        this._engineLoaderUrl = engineLoaderUrl;
        this._loading = null;
        this._recognize = null;
        // Counts remove()s, so a load still running when voice is removed
        // lets its model go rather than keep it.
        this._generation = 0;
    }

    // Whether voice can hear without downloading anything: the model is
    // loaded, or the engine and every pinned file of the model are kept in
    // this browser. A browser short of space may have thrown them away while
    // remembering that voice was turned on, so useVoiceCommands asks again
    // when this is false, rather than start the download unasked.
    async downloaded() {
        if (this._recognize) return true;
        try {
            const engineCache = await this._caches.open(ENGINE_CACHE);
            if (!(await engineCache.match(this._engineSource.url))) return false;
            if (!this._modelRevision) return true;
            const modelCache = await this._caches.open(MODEL_CACHE);
            for (const path of Object.keys(this._modelFiles)) {
                if (!(await modelCache.match(`${MODEL_HOST}${this._model}/resolve/${this._modelRevision}/${path}`))) return false;
            }
            return true;
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
        const generation = this._generation;
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
        // The model's progress over its whole pinned size, so the bar never
        // jumps back when another file starts (an unpinned model has only
        // the files heard of so far to go by).
        const files = new Map();
        const report = (file, loaded, total) => {
            files.set(file, { loaded: loaded || 0, total: total || 0 });
            let sumLoaded = 0;
            let sumTotal = 0;
            for (const each of files.values()) {
                sumLoaded += each.loaded;
                sumTotal += each.total;
            }
            const whole = this._modelBytes || sumTotal;
            onProgress({ phase: 'model', loaded: Math.min(sumLoaded, whole), total: whole });
        };
        const pinned = this._modelRevision !== null && this._modelRevision !== undefined;
        if (pinned) {
            // Every file of the model held to its pin, downloaded or cached.
            const pinnedFiles = new PinnedModelFiles({
                model: this._model,
                revision: this._modelRevision,
                files: this._modelFiles,
                host: env.remoteHost || MODEL_HOST,
                fetch: this._fetch,
                caches: this._caches,
                cacheName: MODEL_CACHE,
                subtle: this._subtle,
                onProgress: report
            });
            await pinnedFiles.forgetOthers();
            env.fetch = (url, init) => pinnedFiles.fetch(url, init);
            env.useCustomCache = true;
            env.customCache = pinnedFiles.cache;
        }
        const recognize = await pipeline('automatic-speech-recognition', this._model, {
            device: 'wasm',
            dtype: 'q8',
            ...(pinned ? { revision: this._modelRevision } : {}),
            progress_callback: (event) => {
                if (event?.status !== 'progress' || !event.file) return;
                report(event.file, event.loaded, event.total);
            }
        });
        if (generation !== this._generation) throw new Error('speech model: removed while loading');
        this._Tensor = library.Tensor;
        this._recognize = recognize;
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
    // `language` (a Whisper language name, core/voice/Transcript.js). With a
    // `prompt`, the model is given it as what was said before (Whisper's
    // <|startofprev|>), which leans it toward those words; what it hears is
    // returned without the prompt.
    async transcribe(samples, language, { prompt = '' } = {}) {
        await this.load();
        const options = { language, task: 'transcribe', max_new_tokens: MAX_SPOKEN_TOKENS };
        if (typeof prompt === 'string' && prompt.trim()) return this._transcribeAfter(prompt.trim(), samples, options);
        const result = await this._recognize(samples, options);
        return typeof result?.text === 'string' ? result.text : '';
    }

    // transformers.js 4.3's speech pipeline has no prompt for Whisper, so the
    // model is asked directly: <|startofprev|>, the prompt, then the tokens
    // the pipeline would start with (the model's _retrieve_init_tokens()).
    async _transcribeAfter(prompt, samples, options) {
        return (await this._heard(prompt, samples, options, { measure: false })).text;
    }

    // What was said in `samples`, as transcribe() hears it, with how sure the
    // model was: `{ text, noSpeech, logprob }`. `noSpeech` is the model's own
    // probability that nothing was said (Whisper's <|nospeech|> where it
    // starts writing), asked without the prompt: a prompt makes the model
    // surer there are words, and whether there are is a question about the
    // sound alone. `logprob` is the mean log-probability of what it wrote.
    // core/voice/Transcript.js#heardNothing() reads them as Whisper's own
    // transcription does. Asked of the model directly, with or without a
    // prompt, so the two are measured alike; the sound is encoded once.
    async hear(samples, language, { prompt = '' } = {}) {
        await this.load();
        const options = { language, task: 'transcribe', max_new_tokens: MAX_SPOKEN_TOKENS };
        return this._heard(typeof prompt === 'string' ? prompt.trim() : '', samples, options, { measure: true });
    }

    async _heard(prompt, samples, options, { measure }) {
        const { model, processor, tokenizer } = this._recognize;
        const { input_features: inputs } = await processor(samples);
        const before = prompt ? [tokenizer.convert_tokens_to_ids('<|startofprev|>'), ...tokenizer.encode(` ${prompt}`, { add_special_tokens: false }).slice(-MAX_PROMPT_TOKENS)] : [];
        const start = model._retrieve_init_tokens({ ...model.generation_config, ...options, return_timestamps: false }).map(Number);
        const prefix = [...before.map(Number), ...start];
        if (!measure) {
            const output = await model.generate({ inputs, decoder_input_ids: [prefix], ...options });
            const tokens = (output?.sequences ?? output)[0].tolist().map(Number);
            return { text: tokenizer.decode(tokens.slice(prefix.length), { skip_special_tokens: true }) };
        }
        const ids = (list) => new this._Tensor('int64', BigInt64Array.from(list.map((id) => BigInt(id))), [1, list.length]);
        // The sound encoded once, as generate() would (transformers.js's
        // _prepare_encoder_decoder_kwargs_for_generation()), for all three
        // steps below.
        const { encoder_outputs: encoded } = await model._prepare_encoder_decoder_kwargs_for_generation({
            inputs_tensor: inputs, model_inputs: { input_features: inputs }, model_input_name: 'input_features', generation_config: model.generation_config
        });
        // Is anything said, asked of the sound alone: the model's first step
        // with no prompt.
        const first = await model({ encoder_outputs: encoded, decoder_input_ids: ids(start.slice(0, 1)) });
        const noSpeechId = Number(tokenizer.convert_tokens_to_ids('<|nospeech|>') ?? tokenizer.convert_tokens_to_ids('<|nocaptions|>'));
        const noSpeech = noSpeechId >= 0 ? Math.exp(logSoftmaxAt(first.logits, 0, noSpeechId)) : 0;
        const output = await model.generate({ inputs, encoder_outputs: encoded, decoder_input_ids: [prefix], ...options });
        const tokens = (output?.sequences ?? output)[0].tolist().map(Number);
        const text = tokenizer.decode(tokens.slice(prefix.length), { skip_special_tokens: true });
        // The model once more over all it was given and wrote: how probable
        // each token it wrote was, given what came before.
        const { logits } = await model({ encoder_outputs: encoded, decoder_input_ids: ids(tokens) });
        let sum = 0;
        for (let at = prefix.length; at < tokens.length; at += 1) sum += logSoftmaxAt(logits, at - 1, tokens[at]);
        const written = tokens.length - prefix.length;
        return { text, noSpeech, logprob: written > 0 ? sum / written : 0 };
    }

    // Deletes the engine and the model from this browser.
    async remove() {
        this._generation += 1;
        this._loading = null;
        this._recognize = null;
        await Promise.all([ENGINE_CACHE, MODEL_CACHE].map((name) => Promise.resolve(this._caches.delete(name)).catch(() => false)));
    }
}

// The log-probability of token `id` at place `at` of `logits` ([1, places, vocabulary]).
function logSoftmaxAt(logits, at, id) {
    const size = logits.dims[2];
    const values = logits.data.subarray(at * size, (at + 1) * size);
    let most = -Infinity;
    for (const value of values) most = Math.max(most, value);
    let sum = 0;
    for (const value of values) sum += Math.exp(value - most);
    return values[id] - most - Math.log(sum);
}
