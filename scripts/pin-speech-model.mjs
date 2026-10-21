// Pins the speech model voice building downloads
// (application/voice/SpeechModelPins.js): asks Hugging Face which commit the
// model's main branch is at (or takes the one given), finds the SHA-256 of
// every file transformers.js reads for it at that commit, and writes the
// commit and the hashes into SpeechModelPins.js. A file kept in Git LFS (the
// model's weights) is known by its LFS object id, which is by definition the
// SHA-256 of its bytes, recorded in the commit itself; any other file is
// downloaded at the commit and hashed.
//
//   node scripts/pin-speech-model.mjs            pin main as it is now
//   node scripts/pin-speech-model.mjs <commit>   pin that commit
//   node scripts/pin-speech-model.mjs --check    exit 1 unless the pinned files
//                                                still have the pinned hashes
//
// It needs Hugging Face (huggingface.co); nothing else does. Run it with
// NODE_USE_ENV_PROXY=1 where Node must reach the web through a proxy. After pinning
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

// The commit's files, by path: { size, lfsSha256 } (lfsSha256 null for a file
// not kept in Git LFS).
async function filesAt(commit) {
    const response = await fetch(`${HOST}/api/models/${SPEECH_MODEL}/revision/${commit}?blobs=true`);
    if (!response.ok) throw new Error(`files at ${commit}: ${response.status}`);
    const { sha, siblings } = await response.json();
    if (sha !== commit) throw new Error(`asked for ${commit}, Hugging Face answered ${sha}`);
    return new Map((siblings || []).map((file) => [file.rfilename, { size: file.size, lfsSha256: file.lfs?.sha256 || null }]));
}

async function hashesAt(commit) {
    const listed = await filesAt(commit);
    const files = {};
    for (const path of MODEL_FILES) {
        const file = listed.get(path);
        if (!file) throw new Error(`${path} is not in ${SPEECH_MODEL}@${commit}`);
        const lfs = /^[0-9a-f]{64}$/.test(file.lfsSha256 || '');
        files[path] = lfs ? file.lfsSha256 : await sha256Of(`${HOST}/${SPEECH_MODEL}/resolve/${commit}/${path}`);
        console.log(`${path}  ${files[path]}  (${lfs ? 'its Git LFS object id' : 'downloaded and hashed'})`);
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
