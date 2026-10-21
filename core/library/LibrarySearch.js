// What the Build Library's search box finds. Two rules, the second only
// when the first finds nothing:
//
// 1. The text typed, as it is, inside an item's text (its name, category,
//    tags, description and player words): "wal" finds every wall, as it
//    always has.
// 2. Otherwise, the item's own words inside what was typed: "something to
//    cross the river" finds the Bridge, whose words include "cross" and
//    "river". The items whose words turn up most often are shown, so a
//    sentence with one stray word still finds what the rest of it means.
//
// An item's words are the words of its name, its tags and its player words
// (ui/i18n/libraryText.js reads those from the chosen language's
// messages). Its description is left out of rule 2: a whole sentence of it
// would find something for almost anything typed.
//
// Rule 2 matches a word to a whole word typed, or to one with up to two more
// letters ("rivers", "Brücken"), ignoring accents ("riviere"). Japanese,
// Chinese and Korean are written without spaces between words, or with
// particles joined on, so a word in those scripts matches anywhere in what
// was typed. Words shorter than three letters in other scripts, and the
// language's ignored words ("and", "with"), never count: they are in too
// many names.
//
// Pure: no messages, no browser; the caller hands in each item's text and
// words.

const CLOSE_ENDING = 2;
const SHORTEST_WORD = 3;
const WITHOUT_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function normalizeQuery(query) {
    return (query || '').trim().toLowerCase();
}

// Lowercased, accents taken off Latin letters (é → e), other scripts as
// they are.
export function fold(text) {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');
}

export function wordsOf(text) {
    return fold(text).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
}

// A list of player words as a message gives them: "river, cross, stream".
export function splitWordList(text) {
    return typeof text === 'string'
        ? text.split(/[,،、，]/).map((word) => word.trim()).filter(Boolean)
        : [];
}

function sameWord(typed, word) {
    return typed.startsWith(word) && typed.length - word.length <= CLOSE_ENDING;
}

// Whether `phrase` (one or more words) turns up in the typed words, in
// order, or anywhere in the typed text for a script written without spaces.
function phraseIn(phrase, typedWords, typedText) {
    if (WITHOUT_SPACES.test(phrase)) {
        return typedText.includes(fold(phrase));
    }
    const words = wordsOf(phrase);
    if (words.length === 0) {
        return false;
    }
    for (let start = 0; start + words.length <= typedWords.length; start++) {
        if (words.every((word, i) => sameWord(typedWords[start + i], word))) {
            return true;
        }
    }
    return false;
}

function counts(phrase, ignored) {
    const folded = fold(phrase);
    if (ignored.has(folded)) {
        return false;
    }
    return WITHOUT_SPACES.test(folded) || folded.length >= SHORTEST_WORD;
}

// How many of `words` turn up in `query`. Each of `words` is a phrase: a
// name or tag ("Pine Tree", which also counts its words "pine" and "tree"
// one by one) or a player word ("way in").
export function wordsFound(query, words, ignoredWords = []) {
    const typedText = fold(normalizeQuery(query));
    const typedWords = wordsOf(typedText);
    const ignored = new Set(ignoredWords.map(fold));
    const phrases = new Set();
    for (const phrase of words) {
        if (typeof phrase !== 'string' || !phrase.trim()) {
            continue;
        }
        phrases.add(fold(phrase.trim()));
        if (!WITHOUT_SPACES.test(phrase)) {
            for (const word of wordsOf(phrase)) {
                phrases.add(word);
            }
        }
    }
    let found = 0;
    for (const phrase of phrases) {
        if (counts(phrase, ignored) && phraseIn(phrase, typedWords, typedText)) {
            found++;
        }
    }
    return found;
}

// Rule 1 on its own: whether an already-normalized `query` is inside any of
// `fields`.
export function textMatches(query, fields) {
    return !query || fields.join(' ').toLowerCase().includes(query);
}

// The items `query` finds, in their own order, or all of them for an empty
// query. `text(item)` gives the strings rule 1 looks in; `words(item)` the
// phrases rule 2 counts.
export function searchLibrary(query, items, { text, words, ignoredWords = [] }) {
    const typed = normalizeQuery(query);
    if (!typed) {
        return [...items];
    }
    const byText = items.filter((item) => textMatches(typed, text(item)));
    if (byText.length > 0) {
        return byText;
    }
    let most = 0;
    const scored = items.map((item) => {
        const found = wordsFound(typed, words(item), ignoredWords);
        most = Math.max(most, found);
        return { item, found };
    });
    return most === 0 ? [] : scored.filter(({ found }) => found === most).map(({ item }) => item);
}
