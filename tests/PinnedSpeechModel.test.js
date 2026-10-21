import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { PinnedModelFiles } from '../application/voice/PinnedModelFiles.js';
import { SpeechRuntime, SPEECH_MODEL } from '../application/voice/SpeechRuntime.js';
import { SPEECH_MODEL_REVISION, SPEECH_MODEL_FILES } from '../application/voice/SpeechModelPins.js';
import { pinnedSource, MODEL_FILES } from '../scripts/pin-speech-model.mjs';
import { assert } from './support/Assert.js';

// The speech model held to its pins (application/voice/PinnedModelFiles.js,
// application/voice/SpeechModelPins.js, scripts/pin-speech-model.mjs).
//
//   Section A: a pinned file is handed on only with its pinned bytes, from
//              Hugging Face or from the cache; nothing unpinned is read
//   Section B: SpeechRuntime gives transformers.js the pinned commit and the
//              checking fetch and cache, and leaves an unpinned model as before
//   Section C: the pins file, as the script writes it

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const REVISION = '0123456789abcdef0123456789abcdef01234567';
const HOST = 'https://huggingface.co/';
const urlOf = (path, revision = REVISION) => `${HOST}${SPEECH_MODEL}/resolve/${revision}/${path}`;

function fakeCaches() {
    const stores = new Map();
    return {
        stores,
        async open(name) {
            if (!stores.has(name)) stores.set(name, new Map());
            const store = stores.get(name);
            const key = (request) => String(request && request.url ? request.url : request);
            return {
                async match(request) {
                    const bytes = store.get(key(request));
                    return bytes ? new Response(bytes) : undefined;
                },
                async put(request, response) {
                    store.set(key(request), new Uint8Array(await response.arrayBuffer()));
                },
                async delete(request) {
                    return store.delete(key(request));
                }
            };
        },
        async delete(name) {
            return stores.delete(name);
        }
    };
}

async function threw(promise) {
    try {
        await promise;
        return null;
    } catch (error) {
        return error;
    }
}

const config = new TextEncoder().encode('{"model_type":"whisper"}');
const encoder = new TextEncoder().encode('pretend encoder weights '.repeat(200));
const files = { 'config.json': sha(config), 'onnx/encoder_model_quantized.onnx': sha(encoder) };
const served = { 'config.json': config, 'onnx/encoder_model_quantized.onnx': encoder };

// -------------------------------------------------------------
// Section A — PinnedModelFiles
// -------------------------------------------------------------
{
    const fetched = [];
    const progress = [];
    let serve = served;
    const network = async (url) => {
        fetched.push(String(url));
        const path = String(url).split(`/resolve/${REVISION}/`)[1];
        const bytes = serve[path];
        if (!bytes) return new Response(null, { status: 404 });
        // Streamed in two halves, as a download is.
        const half = Math.floor(bytes.length / 2);
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(bytes.slice(0, half));
                controller.enqueue(bytes.slice(half));
                controller.close();
            }
        });
        return new Response(body, { headers: { 'Content-Length': String(bytes.length) } });
    };
    const caches = fakeCaches();
    const pinned = new PinnedModelFiles({
        model: SPEECH_MODEL, revision: REVISION, files, host: HOST,
        fetch: network, caches, cacheName: 'transformers-cache', subtle: webcrypto.subtle,
        onProgress: (path, loaded, total) => progress.push({ path, loaded, total })
    });

    assert(pinned.pinOf(urlOf('config.json')).sha256 === files['config.json'], '1. A pinned file is known by its address');
    assert(pinned.pinOf(urlOf('processor_config.json')).path === null, '2. An unpinned file under the model is known as unpinned');
    assert(pinned.pinOf(urlOf('config.json', 'main')).path === null, '3. ...and so is a pinned path at another revision');
    assert(pinned.pinOf('https://cdn.example/engine.wasm') === null, '4. Anything else is not the model\'s');

    const response = await pinned.fetch(urlOf('onnx/encoder_model_quantized.onnx'));
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert(response.ok && sha(bytes) === files['onnx/encoder_model_quantized.onnx'], '5. A pinned file with its pinned bytes is handed on');
    assert(progress.length === 2 && progress[1].loaded === encoder.length && progress[1].total === encoder.length && progress[0].loaded < progress[1].loaded,
        '6. ...with its download\'s progress reported as it comes');

    const before = fetched.length;
    const missing = await pinned.fetch(urlOf('processor_config.json'));
    assert(missing.status === 404 && fetched.length === before, '7. An unpinned file is answered as missing, and never fetched');
    const otherRevision = await pinned.fetch(urlOf('config.json', 'main'));
    assert(otherRevision.status === 404 && fetched.length === before, '8. ...as is the right file at the wrong revision');

    serve = { ...served, 'config.json': new TextEncoder().encode('{"model_type":"something else"}') };
    const refused = await threw(pinned.fetch(urlOf('config.json')));
    assert(refused && /config\.json/.test(refused.message) && /SHA-256/.test(refused.message), '9. A changed file is refused, and never run');
    serve = served;

    // The cache: a good copy is used, a bad one thrown away.
    const cache = pinned.cache;
    await cache.put(urlOf('config.json'), new Response(config));
    const kept = await cache.match(urlOf('config.json'));
    assert(kept && sha(new Uint8Array(await kept.arrayBuffer())) === files['config.json'], '10. A cached copy with the pinned bytes is used');
    const store = (await caches.open('transformers-cache'));
    await store.put(urlOf('config.json'), new Response(new TextEncoder().encode('tampered')));
    assert(await cache.match(urlOf('config.json')) === undefined, '11. A cached copy that is not is never used');
    assert(await store.match(urlOf('config.json')) === undefined, '12. ...and is thrown away, so the file is downloaded afresh');
    await cache.put(urlOf('processor_config.json'), new Response(config));
    assert(await store.match(urlOf('processor_config.json')) === undefined, '13. Nothing unpinned is kept');
}

// -------------------------------------------------------------
// Section B — SpeechRuntime
// -------------------------------------------------------------
{
    const engineBytes = new TextEncoder().encode('pretend WebAssembly');
    const engine = { url: 'https://cdn.example/engine.wasm', sha256: sha(engineBytes), bytes: engineBytes.length };
    const loadWith = async (options) => {
        const env = { backends: { onnx: { wasm: {} } }, remoteHost: HOST };
        const calls = [];
        const library = {
            env,
            pipeline: async (task, model, settings) => {
                calls.push(settings);
                return async () => ({ text: 'ok' });
            }
        };
        const runtime = new SpeechRuntime({
            engine, caches: fakeCaches(), subtle: webcrypto.subtle,
            fetch: async (url) => (String(url) === engine.url ? new Response(engineBytes) : new Response(served[String(url).split(`/resolve/${REVISION}/`)[1]] || null)),
            importLibrary: async () => library, engineLoaderUrl: 'x', ...options
        });
        await runtime.load();
        return { env, settings: calls[0] };
    };

    const pinnedLoad = await loadWith({ modelRevision: REVISION, modelFiles: files });
    assert(pinnedLoad.settings.revision === REVISION, '14. A pinned model is loaded at its pinned commit');
    assert(pinnedLoad.env.useCustomCache === true && typeof pinnedLoad.env.customCache.match === 'function', '15. ...through the checking cache');
    const through = await pinnedLoad.env.fetch(urlOf('config.json'));
    assert(sha(new Uint8Array(await through.arrayBuffer())) === files['config.json'], '16. ...and the checking fetch');
    assert((await pinnedLoad.env.fetch(urlOf('onnx/decoder_model_merged_quantized.onnx'))).status === 404, '17. ...which reads nothing unpinned');

    const unpinned = await loadWith({ modelRevision: null, modelFiles: {} });
    assert(!('revision' in unpinned.settings) && unpinned.env.useCustomCache !== true && unpinned.env.fetch === undefined,
        '18. Without pins the model loads as before');
}

// -------------------------------------------------------------
// Section C — the pins file
// -------------------------------------------------------------
{
    const source = readFileSync(new URL('../application/voice/SpeechModelPins.js', import.meta.url), 'utf8');
    const written = pinnedSource(source, REVISION, { 'config.json': files['config.json'] });
    assert(written.includes(`export const SPEECH_MODEL_REVISION = '${REVISION}';`), '19. The script writes the commit');
    assert(written.includes(`'config.json': '${files['config.json']}'`) && (written.match(/Object\.freeze\(\{/g) || []).length === 1,
        '20. ...and each file\'s hash, in the one frozen list');
    assert(pinnedSource(written, REVISION, { 'config.json': files['config.json'] }) === written, '21. Writing the same pins again changes nothing');
    assert(MODEL_FILES.includes('onnx/encoder_model_quantized.onnx') && MODEL_FILES.includes('onnx/decoder_model_merged_quantized.onnx') && MODEL_FILES.includes('tokenizer.json'),
        '22. The script pins the model\'s q8 weights and its tokenizer');
    // Once pinned, every file the script lists has a hash, and nothing else does.
    if (SPEECH_MODEL_REVISION !== null) {
        assert(/^[0-9a-f]{40}$/.test(SPEECH_MODEL_REVISION), '23. The pinned revision is a full commit');
        assert(MODEL_FILES.every((path) => /^[0-9a-f]{64}$/.test(SPEECH_MODEL_FILES[path] || '')) && Object.keys(SPEECH_MODEL_FILES).length === MODEL_FILES.length,
            '24. Every file the model needs is pinned, with a full SHA-256');
    }
}

console.log('✅ Pinned speech model tests passed.');
