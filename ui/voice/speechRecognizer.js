import { SPEECH_ENGINE_LOADER, SpeechWorkerClient } from '../../application/voice/SpeechWorkerClient.js';

// The one speech recognizer the Editor and World View share, so the speech
// model is loaded once a visit, in one worker, however often a player moves
// between them. The worker's script is the repository's own file, or, in
// the published site, the bundle's, which scripts/build.mjs names in a
// <meta name="forkbuild-speech-worker"> tag.
const WORKER_META = 'forkbuild-speech-worker';
const WORKER_SCRIPT = 'application/voice/speechWorker.js';

let shared = null;

export function speechWorkerUrl(doc = globalThis.document) {
    const named = doc.querySelector(`meta[name="${WORKER_META}"]`)?.getAttribute('content');
    return new URL(named || WORKER_SCRIPT, doc.baseURI).href;
}

export function sharedSpeechRecognizer(doc = globalThis.document) {
    shared ??= new SpeechWorkerClient({
        createWorker: () => new Worker(speechWorkerUrl(doc), { type: 'module', name: 'forkbuild-speech' }),
        engineLoaderUrl: new URL(SPEECH_ENGINE_LOADER, doc.baseURI).href
    });
    return shared;
}
