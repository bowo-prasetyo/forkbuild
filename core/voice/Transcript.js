// What a spoken command said, made ready to act on: the speech model's text
// (application/voice/SpeechRuntime.js) without the noise it marks
// ("[BLANK_AUDIO]", "(music)") or the punctuation it adds, and, when it names
// one of the Editor's actions exactly ("undo", "rotate clockwise"), that
// action. Anything else is read as a plain command (core/building/PlainCommand.js).
//
// Pure: text in, text or an action out.
import { fold } from '../library/LibrarySearch.js';

// The language the speech model is told to hear, by the app's locale.
export const WHISPER_LANGUAGES = Object.freeze({
    en: 'english',
    de: 'german',
    es: 'spanish',
    fr: 'french',
    id: 'indonesian',
    ja: 'japanese',
    ko: 'korean',
    'pt-BR': 'portuguese'
});

export function whisperLanguage(code) {
    return WHISPER_LANGUAGES[code] || WHISPER_LANGUAGES.en;
}

const EDGES = /^[\s"'“”‘’«»「」『』.,!?¡¿;:…。、，！？・-]+|[\s"'“”‘’«»「」『』.,!?¡¿;:…。、，！？・-]+$/gu;

// The words said, or '' when the model heard only noise.
export function cleanTranscript(text) {
    return String(text || '')
        .replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*|♪+/g, ' ')
        .replace(/\s+/g, ' ')
        .replace(EDGES, '')
        .trim();
}

function words(text) {
    return fold(String(text || '')).replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

// The one action whose name (`toText(action.label)`) is exactly what was
// said, ignoring case, accents and punctuation; null for none or several.
export function actionNamed(transcript, actions, toText = String) {
    const said = words(transcript);
    if (!said) return null;
    const named = (actions || []).filter((action) => words(toText(action.label)) === said);
    return named.length === 1 ? named[0] : null;
}
