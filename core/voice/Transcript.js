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

// What a small speech model is known to make up from silence or noise:
// the sign-offs and caption credits it heard most in training, in every
// language the app speaks. Said on their own, they are not a command.
export const SILENCE_WORDS = Object.freeze([
    'thank you for watching', 'thanks for watching', 'thank you very much', 'thank you', 'please subscribe', 'bye', 'you',
    'vielen dank fürs zuschauen', 'untertitel im auftrag des zdf', 'untertitel der amara org community', 'danke',
    'gracias por ver el video', 'gracias por ver', 'subtítulos realizados por la comunidad de amara org', 'gracias',
    "merci d'avoir regardé", "sous titres réalisés par la communauté d'amara org", 'merci',
    'terima kasih telah menonton', 'terima kasih sudah menonton', 'jangan lupa subscribe', 'terima kasih',
    'ご視聴ありがとうございました', 'チャンネル登録よろしくお願いします', 'チャンネル登録お願いします', 'ありがとうございました',
    '시청해주셔서 감사합니다', '시청해 주셔서 감사합니다', '구독과 좋아요 부탁드립니다', '감사합니다',
    'obrigado por assistir', 'obrigada por assistir', 'legendas pela comunidade amara org', 'obrigado', 'obrigada'
]);

// Longest first, so a whole sign-off goes before any shorter one inside it.
const SILENCE_PHRASES = [...new Set(SILENCE_WORDS.map(words))].sort((a, b) => b.length - a.length);

// Whether `text` is nothing but what the model makes up from silence
// (SILENCE_WORDS), however it is cased or punctuated.
export function isOnlySilenceWords(text) {
    let left = ` ${words(text)} `;
    if (!left.trim()) return false;
    for (const phrase of SILENCE_PHRASES) {
        // Whole words only where words are spaced; anywhere in Japanese and Korean.
        left = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(phrase)
            ? left.split(phrase).join(' ')
            : left.split(` ${phrase} `).join('  ');
    }
    return left.trim() === '';
}

// `text` (already cleanTranscript()'d), or '' when it is only words the model
// makes up from silence.
export function withoutSilenceWords(text) {
    return isOnlySilenceWords(text) ? '' : text;
}

// The one action whose name (`toText(action.label)`) is exactly what was
// said, ignoring case, accents and punctuation; null for none or several.
export function actionNamed(transcript, actions, toText = String) {
    const said = words(transcript);
    if (!said) return null;
    const named = (actions || []).filter((action) => words(toText(action.label)) === said);
    return named.length === 1 ? named[0] : null;
}
