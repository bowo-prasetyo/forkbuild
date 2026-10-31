// Measures voice building end to end: recordings of voice building's phrases
// (scripts/voiceCommandPhrases.mjs) are heard as the app hears them, in
// Chromium (ui/voice/recordVoice.js#toSpeechSamples(),
// core/voice/SpeechPreparation.js, application/voice/SpeechRuntime.js with the
// pinned model), and read as the app reads them (scripts/voiceCommandOutcome.mjs).
// Each is right (did what was meant), nothing (did nothing) or wrong (did
// something else). Wrong is the number to watch: a command that does nothing
// can be said again, one that does the wrong thing has to be undone.
//
//   node scripts/evaluate-voice-commands.mjs [--audio voice-corpus] [--out report.md]
//        [--model onnx-community/whisper-base] [--language ja]
//        [--save-heard heard.json | --heard heard.json]
//        [--prompt none|vocabulary|expanded]
//
// Recordings are <audio>/<language>/<speaker>/<phrase id>.<wav|webm|ogg|mp3|m4a>,
// as scripts/synthesize-voice-corpus.mjs makes them, or as people record
// them (see docs/Translating.md, "Voice building"). `--model` measures another
// speech model, unpinned, beside the pinned one. The model and engine are
// downloaded the first time, as when voice is turned on; Chromium comes from
// `npx playwright-core install chromium` or CHROMIUM_PATH, and an HTTPS_PROXY
// in the environment is used. `--save-heard` keeps what was heard; `--heard`
// reads it back instead of hearing again, to measure a change to the words
// the app listens for in seconds rather than half an hour. `--prompt` gives
// the model the words the app can act on before each recording
// (ui/voice/voicePrompt.js): each concept's first name (`vocabulary`), or
// every phrasing the app reads (`expanded`).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { PLACES, SAID, voicePhrases } from './voiceCommandPhrases.mjs';
import { verdict, voiceReader } from './voiceCommandOutcome.mjs';
import { voicePrompt } from '../ui/voice/voicePrompt.js';
import { setAppLocale } from '../ui/i18n/i18n.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name, fallback = null) => {
    const at = process.argv.indexOf(name);
    return at >= 0 ? process.argv[at + 1] : fallback;
};
const audio = resolve(argument('--audio', 'voice-corpus'));
const outPath = argument('--out');
const model = argument('--model');
const onlyLanguage = argument('--language');
const savePath = argument('--save-heard');
const heardPath = argument('--heard');
const promptKind = argument('--prompt', 'none');
if (!['none', 'vocabulary', 'expanded'].includes(promptKind)) {
    console.error('--prompt is none, vocabulary or expanded');
    process.exit(2);
}
const AUDIO_TYPES = new Set(['.wav', '.webm', '.ogg', '.mp3', '.m4a']);
const MIME_TYPES = { '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.html': 'text/html', '.wav': 'audio/wav', '.webm': 'audio/webm', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4' };

// ---- The recordings -----------------------------------------------------------
const phrases = new Map(voicePhrases().map((phrase) => [`${phrase.language}/${phrase.id}`, phrase]));
const directories = (dir) => (existsSync(dir) ? readdirSync(dir).filter((name) => !name.startsWith('.') && statSync(join(dir, name)).isDirectory()) : []);
const clips = [];
for (const language of directories(audio).filter((name) => Object.hasOwn(SAID, name) && (!onlyLanguage || name === onlyLanguage))) {
    for (const speaker of directories(join(audio, language))) {
        for (const file of readdirSync(join(audio, language, speaker))) {
            const phrase = phrases.get(`${language}/${file.slice(0, -extname(file).length)}`);
            if (phrase && AUDIO_TYPES.has(extname(file))) clips.push({ ...phrase, speaker, path: `${language}/${speaker}/${file}` });
        }
    }
}
if (clips.length === 0 && !heardPath) {
    console.error(`No recordings in ${audio}: run scripts/synthesize-voice-corpus.mjs, or see this script's header.`);
    process.exit(2);
}

// ---- Heard in Chromium --------------------------------------------------------
const heard = heardPath
    ? JSON.parse(readFileSync(heardPath, 'utf8')).filter((clip) => !onlyLanguage || clip.language === onlyLanguage)
        .map((clip) => ({ ...phrases.get(`${clip.language}/${clip.id}`), ...clip }))
    : await hearAll();
if (savePath) writeFileSync(savePath, JSON.stringify(heard.map(({ language, id, speaker, transcript, ms, noSpeech, logprob }) => ({ language, id, speaker, transcript, ms, noSpeech, logprob }))));

// The prompt for each language and view, as the app would make it.
async function prompts() {
    const all = {};
    if (promptKind === 'none') return all;
    for (const language of new Set(clips.map((clip) => clip.language))) {
        await setAppLocale(language);
        const places = Object.values(PLACES[language]).map((title) => ({ title }));
        for (const view of ['editor', 'world']) all[`${language}/${view}`] = voicePrompt(view, { expanded: promptKind === 'expanded', places });
    }
    return all;
}

async function hearAll() {
    const promptFor = await prompts();
    const server = await new Promise((done) => {
        const server = createServer(async (request, response) => {
            const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
            if (path === '/__voice.html') {
                response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>voice</title>');
                return;
            }
            const [base, rest] = path.startsWith('/__audio/') ? [audio, path.slice('/__audio/'.length)] : [root, path];
            const file = normalize(join(base, rest));
            if (!file.startsWith(base)) {
                response.writeHead(403).end();
                return;
            }
            try {
                const body = await readFile(file);
                response.writeHead(200, { 'Content-Type': MIME_TYPES[extname(file)] || 'application/octet-stream' }).end(body);
            } catch {
                response.writeHead(404).end();
            }
        });
        server.listen(0, '127.0.0.1', () => done(server));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
    const browser = await chromium.launch({
        executablePath: process.env.CHROMIUM_PATH || undefined,
        ...(proxy ? { proxy: { server: proxy, bypass: '127.0.0.1,localhost' } } : {})
    });
    const heard = [];
    try {
        const page = await browser.newPage();
        await page.goto(`${baseUrl}/__voice.html`);
        const loadMs = await page.evaluate(async ({ model: other }) => {
            const [{ SpeechRuntime }, { SPEECH_ENGINE_LOADER }, recording, preparation, transcript] = await Promise.all([
                import('/application/voice/SpeechRuntime.js'), import('/application/voice/SpeechWorkerClient.js'),
                import('/ui/voice/recordVoice.js'), import('/core/voice/SpeechPreparation.js'), import('/core/voice/Transcript.js')
            ]);
            const started = performance.now();
            const runtime = new SpeechRuntime({ engineLoaderUrl: new URL(SPEECH_ENGINE_LOADER, location.href).href, ...(other ? { model: other } : {}) });
            await runtime.load();
            globalThis.hear = async (url, language, prompt) => {
                const samples = await recording.toSpeechSamples(await (await fetch(url)).arrayBuffer());
                const speech = preparation.prepareSpeech(samples);
                if (!speech.speech) return { transcript: '', ms: 0 };
                const at = performance.now();
                // With how sure the model was (SpeechRuntime#hear()), so the
                // app's guards against what it makes up can be measured.
                const { text, noSpeech, logprob } = await runtime.hear(speech.samples, transcript.whisperLanguage(language), { prompt });
                return { transcript: text, ms: Math.round(performance.now() - at), noSpeech, logprob };
            };
            return Math.round(performance.now() - started);
        }, { model });
        console.error(`Speech model ready in ${(loadMs / 1000).toFixed(1)} s; hearing ${clips.length} recordings`);
        for (const [i, clip] of clips.entries()) {
            const prompt = promptFor[`${clip.language}/${clip.view}`] || '';
            try {
                heard.push({ ...clip, ...(await page.evaluate(([url, language, said]) => globalThis.hear(url, language, said), [`/__audio/${clip.path}`, clip.language, prompt])) });
            } catch (error) {
                // A recording that can't be read is heard as nothing, and said.
                console.error(`${clip.path}: ${error.message.split('\n')[0]}`);
                heard.push({ ...clip, transcript: '', ms: 0 });
            }
            if ((i + 1) % 50 === 0) console.error(`${i + 1} of ${clips.length}`);
        }
    } finally {
        await browser.close();
        server.close();
}
return heard;
}

// ---- Read as the app reads them -----------------------------------------------
const results = [];
for (const language of [...new Set(heard.map((clip) => clip.language))]) {
    const reader = await voiceReader(language);
    for (const clip of heard.filter((each) => each.language === language)) {
        const did = reader.did(clip.transcript, clip.view);
        results.push({ ...clip, did, verdict: verdict(clip.expect, did) });
    }
}

// ---- Report ---------------------------------------------------------------------
const pct = (part, whole) => (whole ? `${Math.round((100 * part) / whole)}%` : '–');
const tally = (rows) => ({
    n: rows.length,
    right: rows.filter((row) => row.verdict === 'right').length,
    nothing: rows.filter((row) => row.verdict === 'nothing').length,
    wrong: rows.filter((row) => row.verdict === 'wrong').length,
    ms: rows.filter((row) => row.ms).map((row) => row.ms)
});
const median = (values) => (values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : 0);
const line = (label, rows) => {
    const t = tally(rows);
    return `| ${label} | ${t.n} | ${pct(t.right, t.n)} | ${pct(t.nothing, t.n)} | ${pct(t.wrong, t.n)} | ${(median(t.ms) / 1000).toFixed(1)} s |`;
};
const head = '| | Recordings | Right | Nothing | Wrong | Median time |\n|---|---|---|---|---|---|';
const languages = Object.keys(SAID).filter((language) => results.some((row) => row.language === language));
const report = [
    `# Voice building: ${model || 'the pinned model'}`,
    '',
    `${results.length} recordings in ${languages.length} languages. Right: did what was meant (for words that aren't a command, nothing). Nothing: did nothing. Wrong: did something else.`,
    '',
    '## By language',
    '',
    head,
    ...languages.map((language) => line(language, results.filter((row) => row.language === language))),
    line('All', results),
    '',
    '## By speaker',
    '',
    head,
    ...[...new Set(results.map((row) => `${row.language}/${row.speaker}`))].map((key) => line(key, results.filter((row) => `${row.language}/${row.speaker}` === key))),
    '',
    '## By phrase, every language',
    '',
    head,
    ...[...new Set(results.map((row) => row.id))].map((id) => line(id, results.filter((row) => row.id === id))),
    '',
    '## Wrong',
    '',
    '| Language | Speaker | Said | Heard | Should do | Did |',
    '|---|---|---|---|---|---|',
    ...results.filter((row) => row.verdict === 'wrong').map((row) => `| ${row.language} | ${row.speaker} | ${row.text} | ${row.transcript.trim()} | ${row.expect} | ${row.did} |`),
    '',
    '## Nothing',
    '',
    '| Language | Speaker | Said | Heard |',
    '|---|---|---|---|',
    ...results.filter((row) => row.verdict === 'nothing').map((row) => `| ${row.language} | ${row.speaker} | ${row.text} | ${row.transcript.trim()} |`),
    ''
].join('\n');
if (outPath) {
    writeFileSync(outPath, report);
    console.error(`Written to ${outPath}`);
} else {
    process.stdout.write(report);
}
