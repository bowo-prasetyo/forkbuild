// Pins the speech model voice building downloads
// (application/voice/SpeechModelPins.js): asks Hugging Face which commit the
// model's main branch is at (or takes the one given), downloads every file
// transformers.js reads for it at that commit, hashes each, and writes the
// commit and the hashes into SpeechModelPins.js.
//
//   node scripts/pin-speech-model.mjs            pin main as it is now
//   node scripts/pin-speech-model.mjs <commit>   pin that commit
//   node scripts/pin-speech-model.mjs --check    exit 1 unless the pinned files
//                                                still have the pinned hashes
//
// It needs Hugging Face (huggingface.co); nothing else does. After pinning
// a new commit, turn voice on in the app and say a command, to see that the
// model still works.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEECH_MODEL } from '../application/voice/SpeechRuntime.js';
import { SPEECH_MODEL_REVISION, SPEECH_MODEL_FILES } from '../application/voice/SpeechModelPins.js';

const HOST = 'https://huggingface.co';
const PINS = join(dirname(fileURLToPath(import.meta.url)), '..', 'application', 'voice', 'SpeechModelPins.js');

// What transformers.js 4 reads for Whisper speech recognition at dtype q8
// (its '_quantized' files). processor_config.json is optional and Whisper's
// repository has none; it is answered as missing.
export const MODEL_FILES = Object.freeze([
    'config.json',
    'generation_config.json',
    'preprocessor_config.json',
    'tokenizer.json',
    'tokenizer_config.json',
    'onnx/encoder_model_quantized.onnx',
    'onnx/decoder_model_merged_quantized.onnx'
]);

async function sha256Of(url) {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    return createHash('sha256').update(Buffer.from(await response.arrayBuffer())).digest('hex');
}

async function latestCommit() {
    const response = await fetch(`${HOST}/api/models/${SPEECH_MODEL}/revision/main`);
    if (!response.ok) throw new Error(`model info: ${response.status}`);
    const { sha } = await response.json();
    if (!/^[0-9a-f]{40}$/.test(sha || '')) throw new Error(`model info: no commit (${sha})`);
    return sha;
}

async function hashesAt(commit) {
    const files = {};
    for (const path of MODEL_FILES) {
        files[path] = await sha256Of(`${HOST}/${SPEECH_MODEL}/resolve/${commit}/${path}`);
        console.log(`${path}  ${files[path]}`);
    }
    return files;
}

// SpeechModelPins.js's `source` with `commit` and `files` ({ path: sha256 })
// written in.
export function pinnedSource(source, commit, files) {
    const entries = Object.entries(files).map(([path, sha]) => `    '${path}': '${sha}'`).join(',\n');
    return source
        .replace(/export const SPEECH_MODEL_REVISION = [^;]*;/, `export const SPEECH_MODEL_REVISION = '${commit}';`)
        .replace(/export const SPEECH_MODEL_FILES = Object\.freeze\(\{[\s\S]*?\}\);/, `export const SPEECH_MODEL_FILES = Object.freeze({\n${entries}\n});`);
}

async function main(argument) {
    if (argument === '--check') {
        if (!SPEECH_MODEL_REVISION) {
            console.error('The speech model is not pinned yet: run node scripts/pin-speech-model.mjs');
            process.exit(1);
        }
        const files = await hashesAt(SPEECH_MODEL_REVISION);
        const wrong = MODEL_FILES.filter((path) => files[path] !== SPEECH_MODEL_FILES[path]);
        if (wrong.length > 0) {
            console.error(`Not the pinned bytes: ${wrong.join(', ')}`);
            process.exit(1);
        }
        console.log(`✓ ${SPEECH_MODEL}@${SPEECH_MODEL_REVISION}: every file is the pinned one`);
        return;
    }
    const commit = argument || await latestCommit();
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error(`not a commit: ${commit}`);
    const files = await hashesAt(commit);
    writeFileSync(PINS, pinnedSource(readFileSync(PINS, 'utf8'), commit, files));
    console.log(`Pinned ${SPEECH_MODEL}@${commit} in application/voice/SpeechModelPins.js`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    await main(process.argv[2]);
}
