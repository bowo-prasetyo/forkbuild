import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { actionNamed, actionSaid, nearestBySound, soundsExactly, cleanTranscript, heardNothing, repeatsItself, whisperLanguage, WHISPER_LANGUAGES } from '../core/voice/Transcript.js';
import { MAX_PROMPT_TOKENS, MAX_SPOKEN_TOKENS, SPEECH_ENGINE, SPEECH_MODEL, SpeechRuntime } from '../application/voice/SpeechRuntime.js';
import { SPEECH_DOWNLOAD_BYTES, SPEECH_ENGINE_LOADER, SPEECH_ENGINE_SHARE, SpeechWorkerClient, TRANSCRIBE_TIMEOUT, TRANSCRIBE_TIMEOUT_MS, speechSupported } from '../application/voice/SpeechWorkerClient.js';
import { SPEECH_MODEL_BYTES, SPEECH_MODEL_FILES, SPEECH_MODEL_REVISION } from '../application/voice/SpeechModelPins.js';
import { serveSpeech } from '../application/voice/serveSpeech.js';
import { interpretWorldCommand } from '../core/voice/WorldVoiceCommand.js';
import { worldVoiceVocabulary } from '../ui/i18n/worldVoiceWords.js';
import { setAppLocale } from '../ui/i18n/i18n.js';
import { SOURCE_LOCALE } from '../ui/i18n/locales.js';
import { useViewportInput } from '../ui/views/worldView/useViewportInput.js';
import { createStandardActions, EditorActionRegistry } from '../application/editor/EditorActionRegistry.js';
import { splitWordList } from '../core/library/LibrarySearch.js';
import { t } from '../ui/i18n/i18n.js';
import { LOCALES } from '../ui/i18n/locales.js';
import { assert } from './support/Assert.js';

// Voice building: what the speech model heard, made ready to act on
// (core/voice/Transcript.js), and the speech runtime that runs the model on
// the device (application/voice/SpeechRuntime.js), in a worker
// (application/voice/serveSpeech.js, SpeechWorkerClient.js), here with
// stand-ins for the worker, the network, the browser's cache and the model,
// which these tests can't download. And what a command spoken in World View
// asks for (core/voice/WorldVoiceCommand.js).

// Transcripts.
{
    assert(cleanTranscript(' Paint the roof red. ') === 'Paint the roof red', 'the model\'s punctuation goes');
    assert(cleanTranscript('[BLANK_AUDIO]') === '' && cleanTranscript('(music) ♪♪') === '', 'noise it marks is nothing said');
    assert(cleanTranscript('「屋根を赤く塗って。」') === '屋根を赤く塗って' && cleanTranscript('¿Cómo deshago algo?') === 'Cómo deshago algo', 'in any script');
    assert(LOCALES.filter((locale) => !locale.pseudo).every(({ code }) => WHISPER_LANGUAGES[code]) && whisperLanguage('pt-BR') === 'portuguese' && whisperLanguage('xx') === 'english', 'every language of the app is one the model is told to hear');
    const actions = [{ id: 'history.undo', label: 'Undo' }, { id: 'transform.rotateClockwise', label: 'Rotate Clockwise' }, { id: 'a', label: 'Same' }, { id: 'b', label: 'Same' }];
    assert(actionNamed('undo', actions)?.id === 'history.undo' && actionNamed('Rotate clockwise!', actions)?.id === 'transform.rotateClockwise', 'an action said by its name, in any case');
    assert(actionNamed('undo the roof', actions) === null && actionNamed('same', actions) === null && actionNamed('', actions) === null, 'only an exact name, and only one');
    // What the model makes up: Whisper's own test, and a loop.
    assert(heardNothing({ noSpeech: 0.71, logprob: -1.48 }) && !heardNothing({ noSpeech: 0.73, logprob: -0.47 }) && !heardNothing({ noSpeech: 0.02, logprob: -1.21 }) && !heardNothing({}),
        'nothing was heard only when the model thought so and wasn\'t sure of what it wrote');
    for (const loop of ['Sound off, sound off, sound off, sound off,', 'white, white, white', '黄色の アーチャー 黄色の アーチャー 黄色の アーチャー', '元に戻す元に戻す元に戻す']) {
        assert(repeatsItself(loop), `"${loop}" goes round in a loop`);
    }
    for (const said of ['Paint the roof red.', 'undo undo', 'Take me to the old mill', '屋根を赤く塗って', '지붕을 빨간색으로 칠해 줘']) {
        assert(!repeatsItself(said), `"${said}" is said once`);
    }
    console.log('✓ transcripts');
}

// The pinned engine is the file vendor/ was checked against.
{
    assert(SPEECH_MODEL === 'onnx-community/whisper-base', 'the model is Whisper base');
    assert(SPEECH_DOWNLOAD_BYTES === SPEECH_ENGINE.bytes + SPEECH_MODEL_BYTES && SPEECH_DOWNLOAD_BYTES > 80e6 && SPEECH_DOWNLOAD_BYTES < 130e6,
        `what turning voice on downloads is the engine and the pinned model's files (${SPEECH_DOWNLOAD_BYTES})`);
    assert(Math.abs(SPEECH_ENGINE_SHARE - SPEECH_ENGINE.bytes / SPEECH_DOWNLOAD_BYTES) < 1e-9 && SPEECH_ENGINE_SHARE > 0.1 && SPEECH_ENGINE_SHARE < 0.5,
        'the engine\'s share of the download is its part of the progress');
    assert(SPEECH_ENGINE.url.startsWith('https://cdn.jsdelivr.net/npm/onnxruntime-web@') && SPEECH_ENGINE.url.includes(readFileSync(new URL('../vendor/onnxruntime-web/VERSION', import.meta.url), 'utf8').trim()),
        'the engine is the version whose loader vendor/onnxruntime-web holds');
    assert(/^[0-9a-f]{64}$/.test(SPEECH_ENGINE.sha256), 'and is pinned by its SHA-256');
    console.log('✓ the pinned engine');
}

// The runtime: the engine fetched once, checked, kept; the model loaded as configured.
function fakeCaches() {
    const stores = new Map();
    return {
        stores,
        async open(name) {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            return {
                match: async (url) => (store.has(url) ? new Response(store.get(url)) : undefined),
                put: async (url, response) => { store.set(url, await response.arrayBuffer()); },
                delete: async (url) => store.delete(url?.url ?? url),
                keys: async () => [...store.keys()].map((url) => ({ url }))
            };
        },
        async delete(name) { return stores.delete(name); }
    };
}

{
    const bytes = new TextEncoder().encode('pretend WebAssembly');
    const engine = { url: 'https://cdn.example/engine.wasm', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length };
    let fetches = 0;
    let calls = [];
    let heardWith = null;
    const env = { backends: { onnx: { wasm: {} } } };
    const library = {
        env,
        pipeline: async (task, model, options) => {
            calls.push({ task, model, options });
            options.progress_callback({ status: 'progress', file: 'encoder.onnx', loaded: 5, total: 10 });
            return async (samples, settings) => {
                heardWith = settings;
                return { text: ` heard ${samples.length} as ${settings.language}/${settings.task}. ` };
            };
        }
    };
    const caches = fakeCaches();
    const progress = [];
    const runtime = new SpeechRuntime({
        engine,
        caches,
        subtle: webcrypto.subtle,
        fetch: async (url) => { fetches += 1; return new Response(bytes); },
        importLibrary: async () => library,
        engineLoaderUrl: `https://forkbuild.example/${SPEECH_ENGINE_LOADER}`,
        modelBytes: 20
    });
    assert(!(await runtime.downloaded()), 'nothing is downloaded before voice is turned on');
    await runtime.load((event) => progress.push(event));
    assert(fetches === 1 && await runtime.downloaded(), 'the engine is fetched once and kept');
    // A runtime not loaded yet (another visit) knows whether turning voice on
    // would download: the engine and every pinned file of the model kept.
    const fresh = new SpeechRuntime({ engine, caches, subtle: webcrypto.subtle, importLibrary: async () => library, engineLoaderUrl: 'x' });
    assert(!(await fresh.downloaded()), 'with the engine kept but not the model, voice would download again, and says so');
    const kept = await caches.open('transformers-cache');
    for (const path of Object.keys(SPEECH_MODEL_FILES)) await kept.put(`https://huggingface.co/${SPEECH_MODEL}/resolve/${SPEECH_MODEL_REVISION}/${path}`, new Response('x'));
    assert(await fresh.downloaded(), 'with the engine and every pinned file kept, nothing would be downloaded');
    assert(new Uint8Array(env.backends.onnx.wasm.wasmBinary).length === bytes.length, 'the engine is given to the runtime as bytes');
    assert(env.useWasmCache === false && env.backends.onnx.wasm.wasmPaths.mjs.endsWith('/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs') && env.backends.onnx.wasm.numThreads === 1 && env.allowLocalModels === false,
        'its loader is this site\'s, never a blob: URL, on one thread');
    assert(calls.length === 1 && calls[0].task === 'automatic-speech-recognition' && calls[0].model === SPEECH_MODEL && calls[0].options.device === 'wasm' && calls[0].options.dtype === 'q8', 'Whisper is loaded on WebAssembly, quantized');
    assert(progress.some((event) => event.phase === 'engine') && progress.some((event) => event.phase === 'model' && event.loaded === 5 && event.total === 20),
        'progress is reported for the engine, and for the model over its whole pinned size, so it never jumps back');
    assert(await runtime.transcribe(new Float32Array(3), 'english') === ' heard 3 as english/transcribe. ', 'it transcribes in the language it is told');
    assert(heardWith.max_new_tokens === MAX_SPOKEN_TOKENS && MAX_SPOKEN_TOKENS <= 64, 'and writes a command\'s few words at most, never Whisper\'s 448 tokens');

    // With a prompt, the model is asked directly: <|startofprev|>, the
    // prompt's tokens (its end, when too long), then the tokens the pipeline
    // starts with; only what follows is what was heard.
    let given = null;
    let startedWith = null;
    const recognize = async () => ({ text: 'from the pipeline' });
    recognize.processor = async (samples) => ({ input_features: samples.length });
    recognize.tokenizer = {
        encode: (text) => [...text.trim()].map((letter) => letter.charCodeAt(0)),
        convert_tokens_to_ids: (token) => (token === '<|startofprev|>' ? 1 : -1),
        decode: (ids) => ids.map((id) => String.fromCharCode(id)).join('')
    };
    recognize.model = {
        generation_config: { is_multilingual: true },
        _retrieve_init_tokens: (config) => { startedWith = config; return [2, 3, 4]; },
        generate: async ({ decoder_input_ids: [prefix], max_new_tokens: most }) => {
            given = { prefix, most };
            return [{ tolist: () => [...prefix, ...[...'roof red'].map((letter) => letter.charCodeAt(0))] }];
        }
    };
    const prompted = new SpeechRuntime({ engine, caches, subtle: webcrypto.subtle, fetch: async () => new Response(bytes), importLibrary: async () => ({ env: { backends: { onnx: { wasm: {} } } }, pipeline: async () => recognize }), engineLoaderUrl: 'x' });
    assert(await prompted.transcribe(new Float32Array(2), 'english', { prompt: ' roof, red ' }) === 'roof red', 'with a prompt, what was heard comes back without it');
    assert(given.prefix.join() === [1, ...[...'roof, red'].map((letter) => letter.charCodeAt(0)), 2, 3, 4].join() && given.most === MAX_SPOKEN_TOKENS,
        'the model is given the prompt as what came before, then its usual start, and writes a command\'s few words at most');
    assert(startedWith.language === 'english' && startedWith.task === 'transcribe' && startedWith.return_timestamps === false, 'in the language it is told');
    await prompted.transcribe(new Float32Array(2), 'english', { prompt: 'x'.repeat(MAX_PROMPT_TOKENS) + 'END' });
    assert(given.prefix.length === 1 + MAX_PROMPT_TOKENS + 3 && String.fromCharCode(...given.prefix.slice(-6, -3)) === 'END', 'a prompt too long keeps its end, the words given last');
    assert(await prompted.transcribe(new Float32Array(2), 'english', { prompt: '  ' }) === 'from the pipeline', 'with no prompt, the pipeline hears it as before');

    // hear(): what was said, with how sure the model was. Four tokens; every
    // place gives <|nospeech|> (3) half the probability, the others a sixth.
    const asked = [];
    let encodings = 0;
    const sure = async () => ({ text: 'unused' });
    sure.processor = async () => ({ input_features: 'features' });
    sure.tokenizer = {
        encode: (text) => [...text.trim()].map(() => 0),
        convert_tokens_to_ids: (token) => ({ '<|startofprev|>': 1, '<|nospeech|>': 3 })[token],
        decode: (ids) => ids.map((id) => 'abcd'[id]).join('')
    };
    sure.model = {
        generation_config: {},
        _retrieve_init_tokens: () => [2],
        _prepare_encoder_decoder_kwargs_for_generation: async () => { encodings += 1; return { encoder_outputs: 'encoded' }; },
        generate: async ({ decoder_input_ids: [prefix], encoder_outputs: encoded }) => {
            asked.push({ generate: prefix, encoded });
            return [{ tolist: () => [...prefix, 0, 0] }];
        },
        call: null
    };
    const callable = Object.assign(async ({ decoder_input_ids: ids, encoder_outputs: encoded }) => {
        const places = ids.dims[1];
        asked.push({ forward: [...ids.data].map(Number), encoded });
        return { logits: { dims: [1, places, 4], data: Float32Array.from({ length: places * 4 }, (_, i) => (i % 4 === 3 ? Math.log(3) : 0)) } };
    }, sure.model);
    sure.model = callable;
    class FakeTensor { constructor(type, data, dims) { Object.assign(this, { type, data, dims }); } }
    const measuring = new SpeechRuntime({ engine, caches, subtle: webcrypto.subtle, fetch: async () => new Response(bytes), importLibrary: async () => ({ Tensor: FakeTensor, env: { backends: { onnx: { wasm: {} } } }, pipeline: async () => sure }), engineLoaderUrl: 'x' });
    const heard = await measuring.hear(new Float32Array(2), 'english', { prompt: 'xy' });
    assert(heard.text === 'aa' && Math.abs(heard.noSpeech - 0.5) < 1e-6 && Math.abs(heard.logprob - Math.log(1 / 6)) < 1e-6, `hear() says what was written, with how sure the model was (${JSON.stringify(heard)})`);
    assert(asked[0].forward.join() === '2' && asked[1].generate.join() === '1,0,0,2' && asked[2].forward.join() === '1,0,0,2,0,0',
        'whether anything was said is asked without the prompt; what was said, with it; how sure, of all it wrote');
    assert(encodings === 1 && asked.every((step) => step.encoded === 'encoded'), 'the sound is encoded once, for all three');

    const again = new SpeechRuntime({ engine, caches, subtle: webcrypto.subtle, fetch: async () => { fetches += 1; return new Response(bytes); }, importLibrary: async () => library, engineLoaderUrl: 'x' });
    await again.load();
    assert(fetches === 1, 'a kept engine is not fetched again');

    await runtime.remove();
    assert(!caches.stores.has('forkbuild-voice-engine') && !(await runtime.downloaded()), 'remove() deletes the engine and the model');

    const tampered = new SpeechRuntime({ engine, caches: fakeCaches(), subtle: webcrypto.subtle, fetch: async () => new Response(new TextEncoder().encode('something else')), importLibrary: async () => library, engineLoaderUrl: 'x' });
    let refused = null;
    try {
        await tampered.load();
    } catch (error) {
        refused = error;
    }
    assert(refused && /SHA-256/.test(refused.message), 'an engine that isn\'t the pinned one is refused, and never run');

    // Removed while it loads: the model the load was making is let go.
    let finishPipeline = null;
    const slowLibrary = { env: { backends: { onnx: { wasm: {} } } }, pipeline: () => new Promise((done) => { finishPipeline = () => done(async () => ({ text: 'late' })); }) };
    const racing = new SpeechRuntime({ engine, caches: fakeCaches(), subtle: webcrypto.subtle, fetch: async () => new Response(bytes), importLibrary: async () => slowLibrary, engineLoaderUrl: 'x' });
    const loading = racing.load().then(() => 'loaded', (error) => error.message);
    for (let i = 0; i < 100 && !finishPipeline; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    await racing.remove();
    finishPipeline();
    assert(/removed/.test(await loading) && !(await racing.downloaded()), 'removed while loading, the model is let go rather than kept');
    console.log('✓ the speech runtime');
}

// V speaks a command, where the Editor can listen.
{
    const feedback = { show() {} };
    let toggled = 0;
    const voice = createStandardActions({ session: {}, feedback, ui: { toggleVoice: () => { toggled += 1; } } }).find((action) => action.id === 'ui.voice');
    assert(voice && voice.shortcut === 'V' && voice.keys[0].key === 'v' && voice.enabled({}), 'Speak a Command is on V');
    voice.execute({ context: {} });
    assert(toggled === 1, 'and starts or stops listening');
    assert(createStandardActions({ session: {}, feedback, ui: {} }).find((action) => action.id === 'ui.voice').enabled({}) === false, 'unavailable where nothing listens');
    console.log('✓ Speak a Command on V');
}

// The speech worker: the page's requests answered by one runtime, away from the page.
function workerPair(runtimeFor) {
    const listeners = { page: new Map(), worker: new Map() };
    const on = (side) => (type, listener) => {
        if (!listeners[side].has(type)) listeners[side].set(type, []);
        listeners[side].get(type).push(listener);
    };
    const deliver = (side, type, event) => setTimeout(() => (listeners[side].get(type) || []).forEach((listener) => listener(event)), 0);
    const pair = { started: 0, terminated: 0, transferred: [] };
    serveSpeech({ addEventListener: on('worker'), postMessage: (data) => deliver('page', 'message', { data: structuredClone(data) }) }, runtimeFor);
    pair.createWorker = () => {
        pair.started += 1;
        return {
            addEventListener: on('page'),
            postMessage: (data, transfer) => { pair.transferred.push(...transfer); deliver('worker', 'message', { data: structuredClone(data) }); },
            terminate: () => { pair.terminated += 1; }
        };
    };
    pair.fail = (message) => deliver('page', 'error', { message, preventDefault() {} });
    return pair;
}

{
    const loaders = [];
    const calls = [];
    const runtime = {
        load: async (report) => { calls.push('load'); report({ phase: 'engine', loaded: 1, total: 4 }); report({ phase: 'model', loaded: 2, total: 4 }); },
        transcribe: async (samples, language) => { calls.push('transcribe'); return `${samples.length} samples in ${language}`; },
        downloaded: async () => true,
        remove: async () => { calls.push('remove'); }
    };
    const pair = workerPair((loaderUrl) => { loaders.push(loaderUrl); return runtime; });
    const client = new SpeechWorkerClient({ createWorker: pair.createWorker, engineLoaderUrl: 'https://forkbuild.example/loader.mjs' });
    assert(pair.started === 0, 'the worker starts only when voice is used');
    const progress = [];
    assert(await client.load((event) => progress.push(event)) === client, 'load() resolves once the worker has loaded the model');
    assert(progress.length === 2 && progress[1].phase === 'model' && progress[1].loaded === 2, 'with the download\'s progress, from the worker');
    const samples = new Float32Array(160);
    assert(await client.transcribe(samples, 'german') === '160 samples in german', 'what was said is worked out in the worker');
    assert(pair.transferred.length === 1 && pair.transferred[0] === samples.buffer, 'the sound is handed over, not copied');
    assert(await client.downloaded() === true, 'it can say whether the model is kept');
    await client.remove();
    assert(pair.started === 1 && loaders.length === 1 && loaders[0] === 'https://forkbuild.example/loader.mjs' && calls.join() === 'load,transcribe,remove',
        'one worker and one runtime answer everything, given this site\'s engine loader');

    const failing = workerPair(() => ({ load: async () => { throw new Error('no network'); } }));
    const unlucky = new SpeechWorkerClient({ createWorker: failing.createWorker, engineLoaderUrl: 'x' });
    let reason = null;
    await unlucky.load().catch((error) => { reason = error.message; });
    assert(reason === 'no network', `a failure in the worker reaches the page (got ${reason})`);

    const crashing = workerPair(() => ({ load: () => new Promise(() => {}) }));
    const stranded = new SpeechWorkerClient({ createWorker: crashing.createWorker, engineLoaderUrl: 'x' });
    const pending = stranded.load().catch((error) => error.message);
    await new Promise((resolve) => setTimeout(resolve, 5));
    crashing.fail('out of memory');
    assert(await pending === 'out of memory' && crashing.terminated === 1, 'a worker that stops fails what was asked of it');
    stranded.load().catch(() => {});
    assert(crashing.started === 2, 'and the next request starts a new one');

    const hearing = [];
    const prompted = workerPair(() => ({ load: async () => {}, hear: async (samples, language, options) => { hearing.push({ language, ...options }); return { text: 'ok', noSpeech: 0, logprob: 0 }; } }));
    const hearer = new SpeechWorkerClient({ createWorker: prompted.createWorker, engineLoaderUrl: 'x' });
    await hearer.hear(new Float32Array(4), 'german', { prompt: 'Dach, rot' });
    await hearer.hear(new Float32Array(4), 'english');
    assert(hearing[0].language === 'german' && hearing[0].prompt === 'Dach, rot' && hearing[1].prompt === '',
        'the prompt reaches the model in the worker, and no prompt is none');

    const stuck = workerPair(() => ({ load: async () => {}, transcribe: () => new Promise(() => {}) }));
    const waiting = new SpeechWorkerClient({ createWorker: stuck.createWorker, engineLoaderUrl: 'x', transcribeTimeoutMs: 20 });
    await waiting.load();
    const given = await waiting.transcribe(new Float32Array(16), 'english').catch((error) => error.message);
    assert(given === TRANSCRIBE_TIMEOUT && stuck.terminated === 1, `a transcription that takes too long fails, and its stuck worker is ended (got ${given})`);
    await waiting.load();
    assert(stuck.started === 2, 'the next request starts a new worker');
    assert(TRANSCRIBE_TIMEOUT_MS >= 10 * 1000, 'a slow phone has time enough');

    const browser = { WebAssembly: {}, Worker: function Worker() {}, caches: {}, crypto: { subtle: {} }, navigator: { mediaDevices: { getUserMedia() {} } }, MediaRecorder: function MediaRecorder() {} };
    assert(speechSupported(browser) && !speechSupported({ ...browser, Worker: undefined }) && !speechSupported({ ...browser, MediaRecorder: undefined }), 'voice needs workers, WebAssembly and a microphone');
    console.log('✓ the speech worker');
}

// What a command spoken in World View asks for.
{
    await setAppLocale(SOURCE_LOCALE);
    const places = [{ id: 'origin', title: 'Origin' }, { id: 'mill', title: 'Old Mill' }, { id: 'pond', title: 'Mill Pond' }, { id: 'tower', title: 'Clock Tower' }];
    const read = (text) => {
        const command = interpretWorldCommand(text, worldVoiceVocabulary(), places);
        return command ? (command.kind === 'goTo' ? `goTo:${command.place?.id ?? 'none'}` : command.kind) : null;
    };
    const expected = {
        'take me to the old mill': 'goTo:mill',
        'go to the mill pond': 'goTo:pond',
        'fly to the clock tower': 'goTo:tower',
        'Clock tower': 'goTo:tower',
        'go to the castle': 'goTo:none',
        'go home': 'home',
        'take me home': 'home',
        'go to home': 'home',
        'first person': 'firstPerson',
        'third person view': 'thirdPerson',
        "bird's eye view": 'birdEye',
        'free camera': 'free',
        'mute': 'soundOff',
        'turn off the sound': 'soundOff',
        'turn the sound on': 'soundOn',
        'unmute': 'soundOn',
        'undo': 'undo',
        'redo that': 'redo',
        'talk to her': 'talk',
        'what is a license': null,
        '': null
    };
    for (const [text, command] of Object.entries(expected)) {
        assert(read(text) === command, `"${text}" is ${command} (got ${read(text)})`);
    }
    // A name heard a little wrong is still found, but only when one place is
    // clearly nearest.
    const near = [
        { id: 'mill', title: 'Old Mill' }, { id: 'bridge', title: 'Stone Bridge' }, { id: 'light', title: 'Lighthouse' },
        { id: 'lake', title: 'Lake' }, { id: 'market', title: 'Market Square' }, { id: 'homes', title: 'Homes' },
        { id: 'chapel', title: 'Chapel' }, { id: 'castle', title: 'Castle' }, { id: 'garden', title: 'Rose Garden' }, { id: 'garden2', title: 'Herb Garden' }
    ];
    const heard = (text, list = near) => {
        const command = interpretWorldCommand(text, worldVoiceVocabulary(), list);
        return command ? (command.kind === 'goTo' ? `goTo:${command.place?.id ?? 'none'}` : command.kind) : null;
    };
    const nearMisses = {
        'go to the brige': 'goTo:bridge',              // a letter dropped
        'take me to the stone bridgr': 'goTo:bridge', // changed
        'go to the light house': 'goTo:light',        // two words heard for one
        'go to the lighhtouse': 'goTo:light',         // two edits in a long word
        'show me the markte square': 'goTo:market',   // two letters swapped
        'take me to the chapell': 'goTo:chapel',      // a letter added
        'take me to the lak': 'goTo:lake',
        'take me to the mil': 'goTo:mill',            // the old mill, misheard
        'go to the inn': 'goTo:none',                 // a heard word too short to match anything
        'go to the gardem': 'goTo:none',              // two gardens equally near: no guess
        'go to the rose gardem': 'goTo:garden',       // "rose" settles it
        'go to the cattle': 'goTo:castle',
        'go to the bottle': 'goTo:none',              // starts with another letter
        'go to the tavern': 'goTo:none',              // nothing near
        'go to home': 'home',                         // "Homes" is near, but home was asked for
        'stone bridgr': null                          // a near miss alone, without "go to", is nothing
    };
    for (const [text, command] of Object.entries(nearMisses)) {
        assert(heard(text) === command, `near miss: "${text}" is ${command} (got ${heard(text)})`);
    }
    assert(heard('go to the brige', [{ id: 'b1', title: 'Bridge' }, { id: 'b2', title: 'Fridge' }]) === 'goTo:b1',
        'near miss: the same letter first ("Bridge", not "Fridge")');
    assert(heard('show me the brige', [{ id: 'shop', title: 'Shop' }, { id: 'bridge', title: 'Stone Bridge' }]) === 'goTo:bridge',
        'near miss: the words of "go to" are never matched ("show" is one edit from "Shop")');
    assert(heard('go to the brige', [{ id: 'b1', title: 'North Bridge' }, { id: 'b2', title: 'South Bridge' }]) === 'goTo:none',
        'near miss: two places equally near is no place');

    const cases = {
        de: [['bring mich zur alten Mühle', 'goTo:mill'], ['nach Hause', 'home'], ['Ton aus', 'soundOff'], ['Ton an', 'soundOn'], ['Vogelperspektive', 'birdEye'], ['rückgängig', 'undo']],
        es: [['llévame al molino viejo', 'goTo:mill'], ['a casa', 'home'], ['silencio', 'soundOff'], ['activa el sonido', 'soundOn'], ['primera persona', 'firstPerson'], ['deshacer', 'undo']],
        fr: [['emmène-moi au vieux moulin', 'goTo:mill'], ['à la maison', 'home'], ['coupe le son', 'soundOff'], ['remets le son', 'soundOn'], ['troisième personne', 'thirdPerson'], ['annuler', 'undo']],
        id: [['bawa aku ke kincir tua', 'goTo:mill'], ['pulang', 'home'], ['matikan suara', 'soundOff'], ['nyalakan suara', 'soundOn'], ['orang pertama', 'firstPerson'], ['urungkan', 'undo']],
        ja: [['古い水車小屋に連れて行って', 'goTo:mill'], ['ホームに戻って', 'home'], ['ミュート', 'soundOff'], ['ミュート解除', 'soundOn'], ['一人称', 'firstPerson'], ['1人称にして', 'firstPerson'], ['３人称', 'thirdPerson'], ['元に戻して', 'undo']],
        ko: [['오래된 물레방아로 데려가 줘', 'goTo:mill'], ['홈으로', 'home'], ['음소거', 'soundOff'], ['음소거 해제', 'soundOn'], ['1인칭', 'firstPerson'], ['실행 취소', 'undo']],
        'pt-BR': [['me leve ao moinho velho', 'goTo:mill'], ['para casa', 'home'], ['sem som', 'soundOff'], ['liga o som', 'soundOn'], ['terceira pessoa', 'thirdPerson'], ['desfazer', 'undo']]
    };
    const translated = { de: 'Alte Mühle', es: 'Molino viejo', fr: 'Vieux moulin', id: 'Kincir tua', ja: '古い水車小屋', ko: '오래된 물레방아', 'pt-BR': 'Moinho velho' };
    for (const [code, list] of Object.entries(cases)) {
        await setAppLocale(code);
        const local = [{ id: 'origin', title: 'Origin' }, { id: 'mill', title: translated[code] }];
        for (const [text, command] of list) {
            const got = interpretWorldCommand(text, worldVoiceVocabulary(), local);
            const name = got ? (got.kind === 'goTo' ? `goTo:${got.place?.id ?? 'none'}` : got.kind) : null;
            assert(name === command, `${code}: "${text}" is ${command} (got ${name})`);
        }
    }
    await setAppLocale(SOURCE_LOCALE);
    console.log('✓ commands spoken in World View');
}

// A command heard as words that only sound like it (core/voice/Transcript.js
// #nearestBySound()): in World View and in the Editor alike.
{
    await setAppLocale(SOURCE_LOCALE);
    const candidates = [
        { value: 'undo', phrases: ['undo', 'undo that'] },
        { value: 'redo', phrases: ['redo', 'redo that'] },
        { value: 'chat', phrases: ['chat'] },
        { value: 'delete', phrases: ['delete'] },
        { value: 'find', phrases: ['find'] }
    ];
    const sound = {
        'and do that': 'undo',  // the word break in the wrong place, one vowel off
        'and do': 'undo',
        'Undo.': 'undo',
        'and': null,            // as near "undo" as "find": no guess
        'read that': null,      // two edits from "redo that": too far for a short command
        'elite': null,          // one edit from "delete", and one is more than a short command allows
        'cat': null,            // ...nor is "cat" "chat"
        'what is a license': null,
        '': null,
        '元に戻して': null       // Japanese, Chinese and Korean: whole or not at all
    };
    for (const [heard, value] of Object.entries(sound)) {
        assert(nearestBySound(heard, candidates) === value, `by sound: "${heard}" is ${value} (got ${nearestBySound(heard, candidates)})`);
    }
    assert(nearestBySound('rido', [{ value: 'redo', phrases: ['redo'] }, { value: 'rodo', phrases: ['rodo'] }]) === null,
        'by sound: two commands about as near is no command');
    assert(soundsExactly('un mute', [{ value: 'on', phrases: ['unmute'] }, { value: 'off', phrases: ['mute'] }]) === 'on'
        && soundsExactly('mute', [{ value: 'on', phrases: ['unmute'] }, { value: 'off', phrases: ['mute'] }]) === 'off'
        && soundsExactly('mute it', [{ value: 'off', phrases: ['mute'] }]) === null,
        'sounds exactly: all of what was said, spaces aside, is the phrase, or nothing');

    const read = (text, list = []) => {
        const command = interpretWorldCommand(text, worldVoiceVocabulary(), list);
        return command ? (command.kind === 'goTo' ? `goTo:${command.place?.id ?? 'none'}` : command.kind) : null;
    };
    const world = {
        'and do that': 'undo',
        'and do': 'undo',
        'un mute': 'soundOn',     // all of it is "unmute": never the "mute" inside it
        'un-mute': 'soundOn',
        'bird eye view': 'birdEye',
        'free camra': 'free',
        'third persons': 'thirdPerson',
        'and': null,
        'what is a license': null,
        'go to the castle': 'goTo:none' // "go to" said: a place, never a command by sound
    };
    for (const [heard, command] of Object.entries(world)) {
        assert(read(heard) === command, `World View by sound: "${heard}" is ${command} (got ${read(heard)})`);
    }
    await setAppLocale('es');
    assert(read('des hacer') === 'undo', 'World View by sound: "des hacer" is deshacer, undo, in Spanish');
    await setAppLocale('pt-BR');
    assert(read('e fazer') === null && read('desfazer') === 'undo' && read('refazer') === 'redo',
        'World View by sound: "e fazer", the start lost, is a sound from refazer and two from desfazer: neither, never a guess');
    await setAppLocale(SOURCE_LOCALE);

    // The Editor: an action by its name, by World View's phrasings for undo
    // and redo, or by what it sounds like, among every action it has.
    const actions = new EditorActionRegistry(createStandardActions({ session: {}, feedback: {}, ui: {} })).getAll().filter(({ id }) => id !== 'ui.voice');
    const aliases = { 'history.undo': splitWordList(t('worldVoice.words.undo')), 'history.redo': splitWordList(t('worldVoice.words.redo')) };
    const editor = (text) => actionSaid(text, actions, { toText: t, aliases })?.id ?? null;
    const said = {
        'Undo': 'history.undo',
        'undo that': 'history.undo',      // World View's phrasings, said exactly
        'take that back': 'history.undo',
        'redo that': 'history.redo',
        'and do that': 'history.undo',    // by sound
        'and do': 'history.undo',
        'select hall': 'selection.selectAll',
        'tilt': 'transform.tilt',
        'and': null,
        'elite': null,                    // never Delete by a near miss
        'dilate': null,
        'delete it': null,
        'coffee': null,
        'till': null,
        'how do I tilt a brick': null,    // a question is left for the guide
        'paint the roof red': null
    };
    for (const [heard, id] of Object.entries(said)) {
        assert(editor(heard) === id, `Editor: "${heard}" is ${id} (got ${editor(heard)})`);
    }
    assert(actionSaid('undo', actions, { toText: t }) && actionSaid('undo that', actions, { toText: t }) === null,
        'Editor: without phrasings, only the name itself is said exactly');
    console.log('✓ commands heard by sound');
}

// V listens in World View too.
{
    let toggled = 0;
    let prevented = 0;
    const input = useViewportInput({ goHome() {}, onAvatarKeyDown: () => false, onSoundKeyDown: () => false, redoAction() {}, undoAction() {}, toggleVoice: () => { toggled += 1; } });
    const key = (fields) => ({ key: 'v', target: {}, preventDefault: () => { prevented += 1; }, ...fields });
    input.onKeyDown(key({}));
    input.onKeyDown(key({ repeat: true }));
    input.onKeyDown(key({ ctrlKey: true }));
    input.onKeyDown(key({ target: { tagName: 'INPUT' } }));
    assert(toggled === 1 && prevented === 2, `V starts or stops listening, once per press, never while typing or with Ctrl (toggled ${toggled})`);
    console.log('✓ V in World View');
}

// The voice states, in the Editor and World View (ui/voice/useVoiceCommands.js).
{
    const { useVoiceCommands } = await import('../ui/voice/useVoiceCommands.js');
    const stored = new Map();
    const storage = { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) };
    const acted = [];
    let removed = 0;
    const languages = [];
    const runtime = { load: async (report) => { report({ phase: 'engine', loaded: 1, total: 2 }); }, transcribe: async (samples, language) => { languages.push(language); return ' Paint the roof red. [BLANK_AUDIO]'; }, remove: async () => { removed += 1; } };
    // A second of sound with something said in the middle of it.
    const spoken = () => Float32Array.from({ length: 16000 }, (_, i) => (i > 5000 && i < 11000 ? 0.2 * Math.sin(i / 8) : 0));
    const transcribed = [];
    runtime.transcribe = async (samples, language) => { languages.push(language); transcribed.push(samples.length); return ' Paint the roof red. [BLANK_AUDIO]'; };
    const record = async () => ({ stop: async () => spoken(), cancel: async () => {} });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    const voice = useVoiceCommands({ act: (text) => { acted.push(text); return { kind: 'done', label: 'Paint 4 roof pieces Roof red' }; }, runtime, record, supported: true, language: () => 'en', storage });
    voice.toggleVoice();
    assert(voice.voice.value.step === 'intro', 'the first press explains the download and asks');
    voice.closeVoice();
    assert(voice.voice.value.step === 'off' && !stored.size, 'Not now downloads nothing and remembers nothing');
    voice.turnOnVoice();
    await settle();
    assert(stored.get('forkbuild.voice.enabled') === SPEECH_MODEL && voice.voice.value.step === 'listening', 'turned on, for this speech model, it loads and listens');
    voice.toggleVoice();
    await settle();
    await settle();
    assert(voice.voice.value.step === 'result' && voice.voice.value.heard === 'Paint the roof red', `pressing again stops, and what was said is heard, without the noise the model marks (got "${voice.voice.value.heard}")`);
    assert(acted.length === 1 && acted[0] === 'Paint the roof red' && voice.voice.value.outcome.kind === 'done' && languages[0] === 'english', 'and done, heard in the app\'s language');
    assert(transcribed[0] < 16000 && transcribed[0] >= 6000, 'only what was said goes to the model, the silence round it cut off');

    // Nothing said: the model is not asked, and nothing is done.
    const quiet = useVoiceCommands({ act: (text) => { acted.push(text); return { kind: 'done' }; }, runtime, record: async () => ({ stop: async () => new Float32Array(16000), cancel: async () => {} }), supported: true, language: () => 'en', storage: { getItem: () => SPEECH_MODEL, setItem() {}, removeItem() {} } });
    const asked = transcribed.length;
    quiet.toggleVoice();
    await settle();
    quiet.toggleVoice();
    await settle();
    await settle();
    assert(quiet.voice.value.step === 'result' && quiet.voice.value.heard === '' && quiet.voice.value.outcome.kind === 'nothing' && transcribed.length === asked,
        'silence is not sent to the model, and nothing is done');

    // What the model makes up from noise is not a command.
    const madeUp = useVoiceCommands({ act: (text) => { acted.push(text); return { kind: 'done' }; }, runtime: { ...runtime, transcribe: async () => ' ご視聴ありがとうございました。' }, record, supported: true, language: () => 'ja', storage: { getItem: () => SPEECH_MODEL, setItem() {}, removeItem() {} } });
    const actedBefore = acted.length;
    madeUp.toggleVoice();
    await settle();
    madeUp.toggleVoice();
    await settle();
    await settle();
    assert(madeUp.voice.value.heard === '' && madeUp.voice.value.outcome.kind === 'nothing' && acted.length === actedBefore,
        'a sign-off the model made up from noise is taken as nothing said');

    // Heard with how sure the model was (SpeechRuntime#hear()): what it made
    // up from a sound with no words in it, or a loop, is nothing said.
    const heardAs = async (result) => {
        const guarded = useVoiceCommands({ act: (text) => { acted.push(text); return { kind: 'done' }; }, runtime: { ...runtime, hear: async () => result }, record, supported: true, language: () => 'en', storage: { getItem: () => SPEECH_MODEL, setItem() {}, removeItem() {} } });
        guarded.toggleVoice();
        await settle();
        guarded.toggleVoice();
        await settle();
        await settle();
        return guarded.voice.value;
    };
    const before = acted.length;
    const noWords = await heardAs({ text: ' The Old Mill,', noSpeech: 0.71, logprob: -1.48 });
    const loop = await heardAs({ text: ' Sound off, sound off, sound off, sound off,', noSpeech: 0.2, logprob: -0.4 });
    assert(noWords.outcome.kind === 'nothing' && loop.outcome.kind === 'nothing' && acted.length === before,
        'what the model made up from a sound with no words, or a loop, does nothing');
    const prompts = [];
    const prompting = useVoiceCommands({ act: () => ({ kind: 'done' }), prompt: (language) => `words for ${language}`, runtime: { ...runtime, hear: async (samples, language, options) => { prompts.push(options?.prompt); return { text: 'Dach rot', noSpeech: 0.02, logprob: -0.2 }; } }, record, supported: true, language: () => 'de', storage: { getItem: () => SPEECH_MODEL, setItem() {}, removeItem() {} } });
    prompting.toggleVoice();
    await settle();
    prompting.toggleVoice();
    await settle();
    await settle();
    assert(prompts.length === 1 && prompts[0] === 'words for de', `the model is given the view's prompt in the app's language (${JSON.stringify(prompts)})`);
    const said = await heardAs({ text: ' Paint the roof red.', noSpeech: 0.02, logprob: -0.2 });
    assert(said.heard && acted.length === before + 1, `what it was sure was said is done (${JSON.stringify(said.heard)}, ${JSON.stringify(acted.at(-1))})`);
    voice.toggleVoice();
    await settle();
    assert(voice.voice.value.step === 'listening', 'once on, a press listens straight away');
    await voice.removeVoiceModel();
    assert(removed === 1 && !stored.size && voice.voice.value.step === 'removed', 'removing the model turns voice off and deletes it');

    const blocked = useVoiceCommands({ act: () => ({ kind: 'unknown' }), runtime, record: async () => { const error = new Error('denied'); error.name = 'NotAllowedError'; throw error; }, supported: true, language: () => 'en', storage: { getItem: () => SPEECH_MODEL, setItem() {}, removeItem() {} } });
    blocked.toggleVoice();
    await settle();
    assert(blocked.voice.value.step === 'failed' && blocked.voice.value.reason === 'microphone', 'a refused microphone says how to allow it');
    const unsupported = useVoiceCommands({ act: () => ({}), runtime, record, supported: false, storage });
    unsupported.toggleVoice();
    assert(unsupported.voice.value.reason === 'unsupported', 'a browser that can\'t says so');

    const on = () => ({ getItem: () => SPEECH_MODEL, setItem() {}, removeItem() {} });

    // Turned on for an earlier speech model ('yes' was kept for Whisper
    // tiny): a new model is another download, so it asks again.
    const earlier = useVoiceCommands({ act: () => ({ kind: 'done' }), runtime, record, supported: true, language: () => 'en', storage: { getItem: () => 'yes', setItem() {}, removeItem() {} } });
    earlier.toggleVoice();
    assert(earlier.voice.value.step === 'intro', 'voice turned on for an earlier speech model asks again before downloading this one');

    // Turned on, but the browser has thrown the model away since.
    const evicted = useVoiceCommands({ act: () => ({ kind: 'done' }), runtime: { ...runtime, downloaded: async () => false }, record, supported: true, language: () => 'en', storage: on() });
    evicted.toggleVoice();
    await settle();
    assert(evicted.voice.value.step === 'intro', 'when the browser has thrown the speech model away, a press asks again before downloading it');
    evicted.turnOnVoice();
    await settle();
    assert(evicted.voice.value.step === 'listening', 'and once asked, it downloads and listens');

    // Progress never goes back, whatever order the files report in.
    const shown = [];
    let jumpy = null;
    const reports = [{ phase: 'engine', loaded: 2, total: 2 }, { phase: 'model', loaded: 6, total: 10 }, { phase: 'model', loaded: 6, total: 20 }];
    jumpy = useVoiceCommands({
        act: () => ({ kind: 'done' }), record, supported: true, language: () => 'en', storage: on(),
        runtime: { ...runtime, load: async (report) => { for (const each of reports) { report(each); shown.push(jumpy.voice.value.progress); } } }
    });
    jumpy.toggleVoice();
    await settle();
    assert(shown.every((value, i) => i === 0 || value >= shown[i - 1]) && shown.length >= 3, `the download's progress never goes back (${shown.join(', ')})`);
    const slow = useVoiceCommands({ act: () => ({ kind: 'done' }), runtime: { ...runtime, transcribe: async () => { throw new Error(TRANSCRIBE_TIMEOUT); } }, record, supported: true, language: () => 'en', storage: on() });
    slow.toggleVoice();
    await settle();
    slow.toggleVoice();
    await settle();
    await settle();
    assert(slow.voice.value.step === 'failed' && slow.voice.value.reason === 'timeout', 'a model that took too long says so');
    slow.toggleVoice();
    await settle();
    assert(slow.voice.value.step === 'listening', 'and the next press listens again');

    let answer = null;
    const lateActs = [];
    const late = useVoiceCommands({ act: (text) => { lateActs.push(text); return { kind: 'done' }; }, runtime: { ...runtime, transcribe: () => new Promise((resolve) => { answer = resolve; }) }, record, supported: true, language: () => 'en', storage: on() });
    late.toggleVoice();
    await settle();
    late.toggleVoice();
    await settle();
    assert(late.voice.value.step === 'working' && answer, 'stopped, it works out what was said');
    await late.turnOffVoice();
    answer(' Delete the trees.');
    await settle();
    assert(late.voice.value.step === 'off' && lateActs.length === 0, 'turned off meanwhile, what it heard afterwards is neither shown nor done');
    console.log('✓ the voice states');
}
