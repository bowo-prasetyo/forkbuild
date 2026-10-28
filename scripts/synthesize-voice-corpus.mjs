// Speaks voice building's phrases (scripts/voiceCommandPhrases.mjs) in every
// language the app speaks, with several synthetic voices, for
// scripts/evaluate-voice-commands.mjs to measure. A synthetic voice is
// cleaner than a person in a room, so its numbers are a floor to fall below,
// not a promise; recordings of people, laid out the same way, are what count.
//
//   node scripts/synthesize-voice-corpus.mjs --piper <piper> [--out voice-corpus] [--espeak]
//
// `--piper` is Piper's command (https://github.com/rhasspy/piper, `pip install
// piper-tts`; Japanese also needs `pip install pyopenjtalk-plus`). Its voices
// are downloaded from Hugging Face (rhasspy/piper-voices) into
// <out>/.piper-voices the first time. A language with one voice is also
// spoken slower and faster, as more speakers. `--espeak` adds espeak-ng's
// voice too, a robotic one, as a speaker of its own.
//
// Writes <out>/<language>/<speaker>/<phrase id>.wav. The folder is ignored by
// Git: it is made, not kept.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SAID, voicePhrases } from './voiceCommandPhrases.mjs';

const argument = (name, fallback = null) => {
    const at = process.argv.indexOf(name);
    return at >= 0 ? process.argv[at + 1] : fallback;
};
const piper = argument('--piper');
const out = resolve(argument('--out', 'voice-corpus'));
const withEspeak = process.argv.includes('--espeak');
if (!piper && !withEspeak) {
    console.error('Usage: node scripts/synthesize-voice-corpus.mjs --piper <piper> [--out voice-corpus] [--espeak]');
    process.exit(2);
}

// Piper's voices for each language, several where there are.
const PIPER_VOICES = Object.freeze({
    en: ['en_US-amy-medium', 'en_US-joe-medium', 'en_GB-alan-medium'],
    de: ['de_DE-thorsten-medium', 'de_DE-kerstin-low', 'de_DE-eva_k-x_low'],
    es: ['es_ES-davefx-medium', 'es_MX-ald-medium', 'es_ES-sharvard-medium'],
    fr: ['fr_FR-siwis-medium', 'fr_FR-tom-medium', 'fr_FR-upmc-medium'],
    id: ['id_ID-news_tts-medium'],
    ja: ['ja_JP-hi_fi_captain-medium'],
    ko: ['ko_KR-kss-medium'],
    'pt-BR': ['pt_BR-faber-medium', 'pt_BR-cadu-medium', 'pt_BR-jeff-medium']
});
// How fast a lone voice also speaks (Piper's length scale: above 1 is slower).
const ONE_VOICE_PACES = Object.freeze([1, 1.25, 0.85]);
const ESPEAK_VOICES = Object.freeze({ en: 'en-us', de: 'de', es: 'es', fr: 'fr-fr', id: 'id', ja: 'ja', ko: 'ko', 'pt-BR': 'pt-br' });

// Where a voice is in rhasspy/piper-voices: en_US-amy-medium is en/en_US/amy/medium.
function piperVoice(key) {
    const dir = join(out, '.piper-voices');
    const model = join(dir, `${key}.onnx`);
    if (existsSync(model) && existsSync(`${model}.json`)) return model;
    mkdirSync(dir, { recursive: true });
    const [code, name, quality] = key.split('-');
    const base = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${code.split('_')[0]}/${code}/${name}/${quality}/${key}`;
    for (const suffix of ['.onnx', '.onnx.json']) {
        console.log(`Downloading ${key}${suffix}`);
        execFileSync('curl', ['-sSfL', '-o', `${model}${suffix === '.onnx' ? '' : '.json'}`, `${base}${suffix}`]);
    }
    return model;
}

let made = 0;
for (const language of Object.keys(SAID)) {
    const phrases = voicePhrases().filter((phrase) => phrase.language === language);
    const speakers = [];
    if (piper) {
        const voices = PIPER_VOICES[language];
        for (const key of voices) {
            for (const pace of voices.length === 1 ? ONE_VOICE_PACES : [1]) {
                speakers.push({ name: `piper-${key}${pace === 1 ? '' : `-pace${pace}`}`, say: (text, file) => execFileSync(piper, ['-m', piperVoice(key), '-f', file, '--length-scale', String(pace)], { input: text, stdio: ['pipe', 'ignore', 'pipe'] }) });
            }
        }
    }
    if (withEspeak) {
        speakers.push({ name: 'espeak-ng', say: (text, file) => execFileSync('espeak-ng', ['-v', ESPEAK_VOICES[language], '-w', file, text]) });
    }
    for (const speaker of speakers) {
        const dir = join(out, language, speaker.name);
        mkdirSync(dir, { recursive: true });
        for (const phrase of phrases) {
            speaker.say(phrase.text, join(dir, `${phrase.id}.wav`));
            made += 1;
        }
        console.log(`${language}: ${speaker.name}, ${phrases.length} phrases`);
    }
}
writeFileSync(join(out, 'README.txt'), 'Made by scripts/synthesize-voice-corpus.mjs; measured by scripts/evaluate-voice-commands.mjs.\n');
console.log(`${made} recordings in ${out}`);
