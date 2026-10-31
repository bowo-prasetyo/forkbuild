// A request typed in the Editor's command palette in a player's own words,
// read as one of a few things the Editor can do: "select all the windows",
// "paint the roof red", "delete the trees". It names what to do (select,
// paint or delete), what to do it to (one part of a build, as
// core/catalog/BuildDescription.js names parts; everything; or what is
// selected) and, to paint, a village palette colour.
//
// Words are matched as the Build Library's search matches them
// (core/library/LibrarySearch.js#wordsFound()): whole words, or with a short
// ending, ignoring accents, and anywhere in the text for Japanese, Chinese
// and Korean. The words come from the chosen language's messages
// (ui/i18n/plainCommandWords.js), so this reads any of them.
//
// Pure: text and words in, a plan or null out. Nothing here touches a build.
import { fold, wordsFound, wordsOf } from '../library/LibrarySearch.js';
import { BUILD_PARTS } from '../catalog/BuildDescription.js';
import { VILLAGE_PALETTE } from './VillagePalette.js';

export const PLAIN_COMMAND_INTENTS = Object.freeze(['paint', 'delete', 'select']);

// Colours whose names are also everyday words for bricks and stone come last
// when two colours match as well, so "paint all the bricks red" is red.
const LAST_COLOURS = new Set(['brick', 'stone']);
const COLOUR_ORDER = [
    ...VILLAGE_PALETTE.filter(({ id }) => !LAST_COLOURS.has(id)),
    ...VILLAGE_PALETTE.filter(({ id }) => LAST_COLOURS.has(id))
].map(({ id }) => id);

const WITHOUT_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

// How well `query` holds one of `phrases`: only a phrase found whole counts,
// and a longer one counts more, so "dark grey" is dark grey rather than grey
// and 黄緑 is light green rather than green. 0 when none is there.
function phraseScore(query, phrases, ignoredWords) {
    let best = 0;
    for (const phrase of phrases || []) {
        const whole = wordsFound(phrase, [phrase], ignoredWords);
        if (whole === 0 || wordsFound(query, [phrase], ignoredWords) < whole) continue;
        best = Math.max(best, WITHOUT_SPACES.test(phrase) ? [...phrase.trim()].length : whole);
    }
    return best;
}

// The key of `options` (each a list of words) that `query` holds best, the
// first in `order` on a tie; null when it holds none.
function bestMatch(query, options, order, ignoredWords) {
    let best = null;
    let most = 0;
    for (const key of order) {
        const score = phraseScore(query, options?.[key], ignoredWords);
        if (score > most) {
            most = score;
            best = key;
        }
    }
    return best;
}

// What `query` asks for, given `vocabulary`:
//   { intents: { paint, delete, select }, everything, selection,
//     parts: { window, door, … }, colours: { roofRed, leaf, … }, ignoredWords }
// each a list of words. `{ intent, target, colour }`: `target` is
// `{ kind: 'part', part }`, `{ kind: 'everything' }` or
// `{ kind: 'selection', said }`, `said` false when no word for the selection
// was used and it is only what paint and delete fall back on; `colour` a
// palette id, for paint only; `intentSaid` false when no word for what to do
// was used and paint was read from a colour and what to paint ("the windows
// red"); `unread` how many of its words are none of these, nor ignored,
// nor short ("select all the ginelas": one). Null when it isn't one of these requests.
export function interpretPlainCommand(query, vocabulary = {}) {
    if (typeof query !== 'string' || !query.trim()) return null;
    const ignoredWords = vocabulary.ignoredWords || [];
    const colour = bestMatch(query, vocabulary.colours, COLOUR_ORDER, ignoredWords);
    let intent = bestMatch(query, vocabulary.intents, PLAIN_COMMAND_INTENTS, ignoredWords);
    const intentSaid = Boolean(intent);
    const part = bestMatch(query, vocabulary.parts, BUILD_PARTS, ignoredWords);
    const everything = phraseScore(query, vocabulary.everything, ignoredWords) > 0;
    const selection = phraseScore(query, vocabulary.selection, ignoredWords) > 0;

    // "the windows red": a colour and something to paint is a request to paint.
    if (!intent && colour && (part || everything || selection)) intent = 'paint';
    if (!intent) return null;
    if (intent === 'paint' && !colour) return null;

    let target = null;
    if (part) target = Object.freeze({ kind: 'part', part });
    else if (everything) target = Object.freeze({ kind: 'everything' });
    else if (selection || intent !== 'select') target = Object.freeze({ kind: 'selection', said: selection });
    if (!target) return null;

    const read = [
        vocabulary.intents?.[intent], vocabulary.colours?.[colour], vocabulary.parts?.[part],
        everything ? vocabulary.everything : null, selection ? vocabulary.selection : null
    ].filter(Boolean).flat();
    return Object.freeze({ intent, target, colour: intent === 'paint' ? colour : null, intentSaid, unread: unreadWords(query, read, ignoredWords) });
}

// The fewest letters of a word that may be a part's name misheard; shorter
// ones are words that hold a sentence together ("en", "줘"), two in the
// scripts written in syllables.
const UNREAD_LETTERS = 3;
const UNREAD_SYLLABLES = 2;

// The words of `query` that are neither ignored, nor a word of `phrases`,
// nor too short to be a name.
function unreadWords(query, phrases, ignoredWords) {
    const ignored = new Set(ignoredWords.map(fold));
    return wordsOf(query).filter((word) => [...word].length >= (WITHOUT_SPACES.test(word) ? UNREAD_SYLLABLES : UNREAD_LETTERS)
        && !ignored.has(word) && wordsFound(word, phrases, ignoredWords) === 0).length;
}
