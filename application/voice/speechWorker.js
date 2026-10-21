// Voice building's worker: speech recognition (application/voice/
// SpeechRuntime.js) away from the page, so the Editor and World View keep
// drawing while the model works out what was said. Started by
// application/voice/SpeechWorkerClient.js; scripts/build.mjs bundles it on its own.
import { SpeechRuntime } from './SpeechRuntime.js';
import { serveSpeech } from './serveSpeech.js';

serveSpeech(globalThis, (engineLoaderUrl) => new SpeechRuntime({ engineLoaderUrl }));
