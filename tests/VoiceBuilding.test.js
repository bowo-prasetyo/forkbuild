import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { actionNamed, cleanTranscript, whisperLanguage, WHISPER_LANGUAGES } from '../core/voice/Transcript.js';
import { SPEECH_ENGINE, SPEECH_MODEL, SpeechRuntime } from '../application/voice/SpeechRuntime.js';
import { SPEECH_ENGINE_LOADER, SpeechWorkerClient, speechSupported } from '../application/voice/SpeechWorkerClient.js';
import { serveSpeech } from '../application/voice/serveSpeech.js';
import { interpretWorldCommand } from '../core/voice/WorldVoiceCommand.js';
import { worldVoiceVocabulary } from '../ui/i18n/worldVoiceWords.js';
import { setAppLocale } from '../ui/i18n/i18n.js';
import { SOURCE_LOCALE } from '../ui/i18n/locales.js';
import { useViewportInput } from '../ui/views/worldView/useViewportInput.js';
import { createStandardActions } from '../application/editor/EditorActionRegistry.js';
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
        engineLoaderUrl: `https://forkbuild.example/${SPEECH_ENGINE_LOADER}`
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
    const cases = {
        de: [['bring mich zur alten Mühle', 'goTo:mill'], ['nach Hause', 'home'], ['Ton aus', 'soundOff'], ['Ton an', 'soundOn'], ['Vogelperspektive', 'birdEye'], ['rückgängig', 'undo']],
        es: [['llévame al molino viejo', 'goTo:mill'], ['a casa', 'home'], ['silencio', 'soundOff'], ['activa el sonido', 'soundOn'], ['primera persona', 'firstPerson'], ['deshacer', 'undo']],
        fr: [['emmène-moi au vieux moulin', 'goTo:mill'], ['à la maison', 'home'], ['coupe le son', 'soundOff'], ['remets le son', 'soundOn'], ['troisième personne', 'thirdPerson'], ['annuler', 'undo']],
        id: [['bawa aku ke kincir tua', 'goTo:mill'], ['pulang', 'home'], ['matikan suara', 'soundOff'], ['nyalakan suara', 'soundOn'], ['orang pertama', 'firstPerson'], ['urungkan', 'undo']],
        ja: [['古い水車小屋に連れて行って', 'goTo:mill'], ['ホームに戻って', 'home'], ['ミュート', 'soundOff'], ['ミュート解除', 'soundOn'], ['一人称', 'firstPerson'], ['元に戻して', 'undo']],
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
    console.log('✓ the voice states');
}
