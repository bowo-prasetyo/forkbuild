import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { actionNamed, cleanTranscript, whisperLanguage, WHISPER_LANGUAGES } from '../core/voice/Transcript.js';
import { SPEECH_ENGINE, SPEECH_MODEL, SpeechRuntime } from '../application/voice/SpeechRuntime.js';
import { createStandardActions } from '../application/editor/EditorActionRegistry.js';
import { LOCALES } from '../ui/i18n/locales.js';
import { assert } from './support/Assert.js';

// Voice building: what the speech model heard, made ready to act on
// (core/voice/Transcript.js), and the speech runtime that runs the model on
// the device (application/voice/SpeechRuntime.js), here with stand-ins for
// the network, the browser's cache and the model, which these tests can't
// download.

// Transcripts.
{
    assert(cleanTranscript(' Paint the roof red. ') === 'Paint the roof red', 'the model\'s punctuation goes');
    assert(cleanTranscript('[BLANK_AUDIO]') === '' && cleanTranscript('(music) ♪♪') === '', 'noise it marks is nothing said');
    assert(cleanTranscript('「屋根を赤く塗って。」') === '屋根を赤く塗って' && cleanTranscript('¿Cómo deshago algo?') === 'Cómo deshago algo', 'in any script');
    assert(LOCALES.filter((locale) => !locale.pseudo).every(({ code }) => WHISPER_LANGUAGES[code]) && whisperLanguage('pt-BR') === 'portuguese' && whisperLanguage('xx') === 'english', 'every language of the app is one the model is told to hear');
    const actions = [{ id: 'history.undo', label: 'Undo' }, { id: 'transform.rotateClockwise', label: 'Rotate Clockwise' }, { id: 'a', label: 'Same' }, { id: 'b', label: 'Same' }];
    assert(actionNamed('undo', actions)?.id === 'history.undo' && actionNamed('Rotate clockwise!', actions)?.id === 'transform.rotateClockwise', 'an action said by its name, in any case');
    assert(actionNamed('undo the roof', actions) === null && actionNamed('same', actions) === null && actionNamed('', actions) === null, 'only an exact name, and only one');
    console.log('✓ transcripts');
}

// The pinned engine is the file vendor/ was checked against.
{
    assert(SPEECH_MODEL === 'onnx-community/whisper-tiny', 'the model is Whisper tiny');
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
                delete: async (url) => store.delete(url)
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
    const env = { backends: { onnx: { wasm: {} } } };
    const library = {
        env,
        pipeline: async (task, model, options) => {
            calls.push({ task, model, options });
            options.progress_callback({ status: 'progress', file: 'encoder.onnx', loaded: 5, total: 10 });
            return async (samples, settings) => ({ text: ` heard ${samples.length} as ${settings.language}/${settings.task}. ` });
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
        engineLoaderUrl: () => 'https://forkbuild.example/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs'
    });
    assert(!(await runtime.downloaded()), 'nothing is downloaded before voice is turned on');
    await runtime.load((event) => progress.push(event));
    assert(fetches === 1 && await runtime.downloaded(), 'the engine is fetched once and kept');
    assert(new Uint8Array(env.backends.onnx.wasm.wasmBinary).length === bytes.length, 'the engine is given to the runtime as bytes');
    assert(env.useWasmCache === false && env.backends.onnx.wasm.wasmPaths.mjs.endsWith('/vendor/onnxruntime-web/ort-wasm-simd-threaded.asyncify.mjs') && env.backends.onnx.wasm.numThreads === 1 && env.allowLocalModels === false,
        'its loader is this site\'s, never a blob: URL, on one thread');
    assert(calls.length === 1 && calls[0].task === 'automatic-speech-recognition' && calls[0].model === SPEECH_MODEL && calls[0].options.device === 'wasm' && calls[0].options.dtype === 'q8', 'Whisper is loaded on WebAssembly, quantized');
    assert(progress.some((event) => event.phase === 'engine') && progress.some((event) => event.phase === 'model' && event.loaded === 5 && event.total === 10), 'progress is reported for the engine and the model');
    assert(await runtime.transcribe(new Float32Array(3), 'english') === ' heard 3 as english/transcribe. ', 'it transcribes in the language it is told');

    const again = new SpeechRuntime({ engine, caches, subtle: webcrypto.subtle, fetch: async () => { fetches += 1; return new Response(bytes); }, importLibrary: async () => library, engineLoaderUrl: () => 'x' });
    await again.load();
    assert(fetches === 1, 'a kept engine is not fetched again');

    await runtime.remove();
    assert(!caches.stores.has('forkbuild-voice-engine') && !(await runtime.downloaded()), 'remove() deletes the engine and the model');

    const tampered = new SpeechRuntime({ engine, caches: fakeCaches(), subtle: webcrypto.subtle, fetch: async () => new Response(new TextEncoder().encode('something else')), importLibrary: async () => library, engineLoaderUrl: () => 'x' });
    let refused = null;
    try {
        await tampered.load();
    } catch (error) {
        refused = error;
    }
    assert(refused && /SHA-256/.test(refused.message), 'an engine that isn\'t the pinned one is refused, and never run');
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

// The Editor's voice states (ui/views/editorView/useVoiceCommands.js).
{
    const { useVoiceCommands } = await import('../ui/views/editorView/useVoiceCommands.js');
    const stored = new Map();
    const storage = { getItem: (key) => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value), removeItem: (key) => stored.delete(key) };
    const acted = [];
    let removed = 0;
    const languages = [];
    const runtime = { load: async (report) => { report({ phase: 'engine', loaded: 1, total: 2 }); }, transcribe: async (samples, language) => { languages.push(language); return ' Paint the roof red. [BLANK_AUDIO]'; }, remove: async () => { removed += 1; } };
    const record = async () => ({ stop: async () => new Float32Array(16000), cancel: async () => {} });
    const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
    const voice = useVoiceCommands({ act: (text) => { acted.push(text); return { kind: 'done', label: 'Paint 4 roof pieces Roof red' }; }, runtime, record, supported: true, language: () => 'en', storage });
    voice.toggleVoice();
    assert(voice.voice.value.step === 'intro', 'the first press explains the download and asks');
    voice.closeVoice();
    assert(voice.voice.value.step === 'off' && !stored.size, 'Not now downloads nothing and remembers nothing');
    voice.turnOnVoice();
    await settle();
    assert(stored.get('forkbuild.voice.enabled') === 'yes' && voice.voice.value.step === 'listening', 'turned on, it loads and listens');
    voice.toggleVoice();
    await settle();
    await settle();
    assert(voice.voice.value.step === 'result' && voice.voice.value.heard === 'Paint the roof red', `pressing again stops, and what was said is heard, without the noise the model marks (got "${voice.voice.value.heard}")`);
    assert(acted.length === 1 && acted[0] === 'Paint the roof red' && voice.voice.value.outcome.kind === 'done' && languages[0] === 'english', 'and done, heard in the app\'s language');
    voice.toggleVoice();
    await settle();
    assert(voice.voice.value.step === 'listening', 'once on, a press listens straight away');
    await voice.removeVoiceModel();
    assert(removed === 1 && !stored.size && voice.voice.value.step === 'removed', 'removing the model turns voice off and deletes it');

    const blocked = useVoiceCommands({ act: () => ({ kind: 'unknown' }), runtime, record: async () => { const error = new Error('denied'); error.name = 'NotAllowedError'; throw error; }, supported: true, language: () => 'en', storage: { getItem: () => 'yes', setItem() {}, removeItem() {} } });
    blocked.toggleVoice();
    await settle();
    assert(blocked.voice.value.step === 'failed' && blocked.voice.value.reason === 'microphone', 'a refused microphone says how to allow it');
    const unsupported = useVoiceCommands({ act: () => ({}), runtime, record, supported: false, storage });
    unsupported.toggleVoice();
    assert(unsupported.voice.value.reason === 'unsupported', 'a browser that can\'t says so');
    console.log('✓ the Editor\'s voice states');
}
