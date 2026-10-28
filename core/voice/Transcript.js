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

// The languages the speech model has been measured to hear well
// (scripts/evaluate-voice-commands.mjs, 576 synthetic recordings, Whisper
// base: English 93% of commands right, 94 to 100% with natural-sounding
// voices; every other language 31 to 53%, mostly by doing nothing). In the
// others, voice still works, and says first that it hears English best
// (ui/components/VoicePanel.js). Add a language here when recordings of
// people show it heard as well.
export const VOICE_HEARS_WELL = Object.freeze(['en']);

export function voiceHearsWell(code) {
    return VOICE_HEARS_WELL.includes(code);
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

// A small speech model often writes a command as words that sound like it
// but aren't it: "undo that" as "and do that", "unmute" as "on mute". When
// nothing was matched exactly, nearestBySound() finds the command whose
// phrase sounds most like what was heard:
//
// - Both are compared as sounds rather than spellings: lowercased, accents
//   off, without spaces or punctuation, and with a letter written twice in a
//   row as one ("and do" is "ando", as "undo" is "undo").
// - Edits are counted between them, one for a letter added, dropped or
//   changed, but half for one vowel heard as another ("ando" to "undo" is
//   half an edit; "redo" is two away).
// - A phrase may be at most SOUND_EDITS_ALLOWED away, or SOUND_SHARE_ALLOWED
//   of its length for a longer one: a vowel misheard in a short command, an
//   edit or so in a long one. "elite" is never "delete", nor "cat" "chat".
// - It must also be at least SOUND_MARGIN nearer than any phrase of another
//   command, so a near miss between two commands is no command, never a
//   guess.
//
// Only where words are spaced: Japanese, Chinese and Korean are matched
// whole or not at all.
const SOUND_EDITS_ALLOWED = 0.5;
const SOUND_SHARE_ALLOWED = 0.15;
const SOUND_MARGIN = 1;
const VOWEL_SWAP = 0.5;
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);
const SPACELESS = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

// `text` as the sounds it is compared by, as an array of letters.
function soundOf(text) {
    return Array.from(fold(String(text || '')).replace(/[^\p{L}\p{N}]+/gu, '').replace(/(.)\1+/gu, '$1'));
}

// The weighted edits between two arrays of letters.
function soundEdits(a, b) {
    let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const current = [i];
        for (let j = 1; j <= b.length; j++) {
            const swap = a[i - 1] === b[j - 1] ? 0 : (VOWELS.has(a[i - 1]) && VOWELS.has(b[j - 1]) ? VOWEL_SWAP : 1);
            current.push(Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + swap));
        }
        previous = current;
    }
    return previous[b.length];
}

// Of `candidates` (`{ value, phrases: [text] }` each, a value being one
// command), the value whose phrases sound most like `transcript`, or null
// when none is near enough or another is about as near.
export function nearestBySound(transcript, candidates) {
    if (SPACELESS.test(String(transcript || ''))) return null;
    const heard = soundOf(transcript);
    if (heard.length === 0) return null;
    // Per value: its nearest phrase, and that phrase's nearness if allowed.
    const ranked = [];
    for (const { value, phrases } of candidates || []) {
        let nearest = Infinity;
        let allowed = Infinity;
        for (const phrase of phrases || []) {
            if (typeof phrase !== 'string' || SPACELESS.test(phrase)) continue;
            const sound = soundOf(phrase);
            if (sound.length === 0) continue;
            const edits = soundEdits(heard, sound);
            nearest = Math.min(nearest, edits);
            if (edits <= Math.max(SOUND_EDITS_ALLOWED, SOUND_SHARE_ALLOWED * sound.length)) allowed = Math.min(allowed, edits);
        }
        if (Number.isFinite(nearest)) ranked.push({ value, nearest, allowed });
    }
    let best = null;
    for (const entry of ranked) {
        if (Number.isFinite(entry.allowed) && (!best || entry.allowed < best.allowed)) best = entry;
    }
    if (!best) return null;
    const clear = ranked.every((entry) => entry.value === best.value || entry.nearest >= best.allowed + SOUND_MARGIN);
    return clear ? best.value : null;
}

// The one value whose phrase `transcript` is, sound for sound, spaces and
// punctuation aside ("un mute" is "unmute"), or null for none or several.
export function soundsExactly(transcript, candidates) {
    if (SPACELESS.test(String(transcript || ''))) return null;
    const heard = soundOf(transcript).join('');
    if (!heard) return null;
    const values = new Set();
    for (const { value, phrases } of candidates || []) {
        if ((phrases || []).some((phrase) => typeof phrase === 'string' && !SPACELESS.test(phrase) && soundOf(phrase).join('') === heard)) {
            values.add(value);
        }
    }
    return values.size === 1 ? [...values][0] : null;
}

// The one action `transcript` asks for: by its name (actionNamed()), or by
// one of its other phrasings, `aliases[action.id]` ("undo that", "take that
// back" for Undo), said exactly; failing both, the one whose name or
// phrasings it sounds most like (nearestBySound()). Null for none, or when
// two are about as near.
export function actionSaid(transcript, actions, { toText = String, aliases = {} } = {}) {
    const named = actionNamed(transcript, actions, toText);
    if (named) return named;
    const said = words(transcript);
    if (!said) return null;
    const phrasingsOf = (action) => (Object.hasOwn(aliases, action.id) ? aliases[action.id] : []) || [];
    const byPhrasing = (actions || []).filter((action) => phrasingsOf(action).some((phrase) => words(phrase) === said));
    if (byPhrasing.length === 1) return byPhrasing[0];
    return nearestBySound(transcript, (actions || []).map((action) => ({
        value: action,
        phrases: [toText(action.label), ...phrasingsOf(action)]
    })));
}
