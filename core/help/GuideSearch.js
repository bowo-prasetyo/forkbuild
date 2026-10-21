// Help from the user guide (docs/user/): a question typed in a player's own
// words ("how do I tilt a brick?") answered with the guide's sections that
// best match it, each with the paragraph that says most about it.
//
// guideSections() turns a chapter's Markdown into sections, one per heading,
// as plain text, each with the anchor GitHub gives that heading (so a section
// can link to its place in the guide). searchGuide() ranks them:
//
// - A question's words are matched as the Build Library's search matches
//   them (core/library/LibrarySearch.js): ignoring case and accents, and
//   with a short ending either way ("tilt" finds "tilting", "bricks" finds
//   "brick"), and, in longer words, with one letter different ("colour",
//   "color"). Japanese, Chinese and Korean are matched by each pair of
//   letters in the question, since they don't put spaces between words.
// - A word counts for more the fewer sections have it, so "how", "do" and
//   "brick" say little and "tilt" says a lot: no list of question words is
//   needed in any language; a word more than a sixth of the sections have is
//   left out, unless every word is that common, when the rarest is kept. A word in a section's heading counts double.
//
// Pure: Markdown and text in, plain objects out.
import { fold, wordsOf } from '../library/LibrarySearch.js';

const WITHOUT_SPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const WITHOUT_SPACES_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;
const SHORTEST_WORD = 3;
const CLOSE_ENDING = 3;
const HEADING_WEIGHT = 2;
const FUZZY_LENGTH = 5;
const COMMON_SHARE = 1 / 6;
const SNIPPET_LENGTH = 320;
export const GUIDE_RESULTS = 5;

// Text with its HTML tags left out, as GitHub shows it: a '<' never
// survives, even in a malformed tag (as scripts/check-doc-translations.mjs
// reads headings).
function withoutTags(text) {
    let result = '';
    let inTag = false;
    for (const character of text) {
        if (character === '<') inTag = true;
        else if (character === '>' && inTag) inTag = false;
        else if (!inTag) result += character;
    }
    return result;
}

// Markdown without the parts from `open` to `close` (comments, the language
// links), each left out whole; an unclosed one leaves out the rest.
function without(text, open, close) {
    let result = '';
    let from = 0;
    for (let start = text.indexOf(open); start !== -1; start = text.indexOf(open, from)) {
        result += text.slice(from, start);
        const end = text.indexOf(close, start + open.length);
        if (end === -1) return result;
        from = end + close.length;
    }
    return result + text.slice(from);
}

// The anchor GitHub gives a heading (as scripts/check-doc-translations.mjs
// works them out for its link check).
export function headingSlug(heading) {
    const text = withoutTags(heading.replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1'))
        .replace(/[`*]/g, '')
        .replace(/(^|\s)_+|_+(\s|$)/g, '$1$2');
    return text.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '').replace(/ /g, '-');
}

// Markdown as the words a reader sees: no links' addresses, pictures, code
// marks, emphasis, tags, table rules or list marks.
export function plainText(markdown) {
    return withoutTags(markdown)
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/`([^`]*)`/g, '$1')
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/(^|[^\w*])\*([^*\n]+)\*(?!\w)/g, '$1$2')
        .replace(/(^|\W)_([^_\n]+)_(?!\w)/g, '$1$2')
        .replace(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/gm, '')
        .replace(/^\s*\|\s?|\s?\|\s*$/gm, '')
        .replace(/\s\|\s/g, ' — ')
        .replace(/^\s*>\s?/gm, '')
        .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, '')
        .replace(/\\([\\`*_#|>-])/g, '$1');
}

const ITEM = /^\s*(?:\||[-*+]\s|\d+\.\s)/;
const LIST_ITEM = /^\s*(?:[-*+]|\d+\.)\s/;

// A paragraph of Markdown as plain text: one line, or, for a list or a
// table, one line an item or row ("• Undo", "T — Tilt"), a list item's own
// following lines joined to it.
function blockText(block) {
    const lines = block.split('\n').filter((line) => line.trim());
    if (!lines.some((line) => ITEM.test(line))) return plainText(lines.join(' ')).replace(/\s+/g, ' ').trim();
    const items = [];
    for (const line of lines) {
        if (ITEM.test(line) || items.length === 0) items.push(line);
        else items[items.length - 1] += ` ${line.trim()}`;
    }
    return items
        .map((item) => {
            const text = plainText(item).replace(/\s+/g, ' ').trim();
            return text && LIST_ITEM.test(item) ? `• ${text}` : text;
        })
        .filter(Boolean)
        .join('\n');
}

// A chapter's sections: `[{ file, chapter, heading, anchor, paragraphs }]`,
// `chapter` being its first heading's text, `paragraphs` the section's text
// up to the next heading, as plain text, a list or table one line an item. Comments and code blocks are left
// out; anchors repeat with -1, -2 … as GitHub's do.
export function guideSections(markdown, file) {
    const source = without(without(String(markdown || ''), '<!-- languages -->', '<!-- /languages -->'), '<!--', '-->')
        .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '');
    const sections = [];
    const anchors = new Map();
    let chapter = null;
    let current = null;
    const close = () => {
        if (!current) return;
        const paragraphs = current.body.join('\n')
            .split(/\n\s*\n/)
            .map(blockText)
            .filter(Boolean);
        sections.push(Object.freeze({ file, chapter, heading: current.heading, anchor: current.anchor, paragraphs: Object.freeze(paragraphs) }));
    };
    for (const line of source.split('\n')) {
        const match = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/.exec(line);
        if (!match) {
            current?.body.push(line);
            continue;
        }
        close();
        const heading = plainText(match[2]).trim();
        const slug = headingSlug(match[2]);
        const seen = anchors.get(slug) || 0;
        anchors.set(slug, seen + 1);
        if (chapter === null) chapter = heading;
        current = { heading, anchor: seen === 0 ? slug : `${slug}-${seen}`, body: [] };
    }
    close();
    return sections;
}

// The relative links to chapters in a guide's contents page (its README).
export function guideChapterFiles(markdown) {
    const files = [];
    for (const match of String(markdown || '').matchAll(/\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/g)) {
        const file = match[1];
        if (!/^[A-Za-z0-9_-]+\.md$/.test(file) || file === 'README.md' || files.includes(file)) continue;
        files.push(file);
    }
    return files;
}

// What a question is searched by: its words of three letters or more, and
// each pair of letters of the parts written without spaces, but none of
// `ignoredWords` (the language's question words: "how", "what", どう).
export function questionTerms(question, ignoredWords = []) {
    const ignored = new Set(ignoredWords.map(fold));
    const folded = fold(String(question || ''));
    const terms = new Set();
    for (const word of wordsOf(folded.replace(WITHOUT_SPACES_RUN, ' '))) {
        if (word.length >= SHORTEST_WORD && !ignored.has(word)) terms.add(word);
    }
    for (const run of folded.match(WITHOUT_SPACES_RUN) || []) {
        const letters = [...run];
        if (letters.length === 1 && !ignored.has(run)) terms.add(run);
        for (let i = 0; i + 1 < letters.length; i += 1) {
            const pair = letters[i] + letters[i + 1];
            if (!ignored.has(pair)) terms.add(pair);
        }
    }
    return [...terms];
}

// Two words close enough to be the same: one is the other with a short
// ending ("tilt", "tilting"); or, both five letters or more, they begin with
// the same five ("delete", "deleting") or one letter differs, is added or
// dropped ("colour", "color"; a typo).
function closeWords(a, b) {
    if ((a.startsWith(b) || b.startsWith(a)) && Math.abs(a.length - b.length) <= CLOSE_ENDING) return true;
    if (Math.min(a.length, b.length) < FUZZY_LENGTH) return false;
    return a.slice(0, FUZZY_LENGTH) === b.slice(0, FUZZY_LENGTH) || oneEditApart(a, b);
}

function oneEditApart(a, b) {
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
    if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
    return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

function wordCounts(text) {
    const counts = new Map();
    for (const word of wordsOf(text)) counts.set(word, (counts.get(word) || 0) + 1);
    return counts;
}

// A section made ready to search, once: its words, how often each comes,
// and its text.
function prepared(section) {
    const heading = fold(section.heading);
    const body = fold(section.paragraphs.join(' '));
    return { section, headingText: heading, bodyText: body, headingWords: wordCounts(heading), bodyWords: wordCounts(body) };
}

// An index over `sections` for searchGuide(), built once per guide: each
// section prepared, and every word any of them has.
export function guideIndex(sections) {
    const entries = (sections || []).map(prepared);
    const vocabulary = new Set();
    for (const entry of entries) {
        for (const word of entry.headingWords.keys()) vocabulary.add(word);
        for (const word of entry.bodyWords.keys()) vocabulary.add(word);
    }
    return Object.freeze({ entries, vocabulary });
}

// How a term is looked for: the guide's words close to it, or, written
// without spaces, the term itself anywhere in the text.
function matcher(term, vocabulary) {
    if (WITHOUT_SPACES.test(term)) {
        return { count: (text) => text.split(term).length - 1, inWords: null };
    }
    const words = [...vocabulary].filter((word) => word.length >= SHORTEST_WORD && closeWords(word, term));
    return {
        inWords: words,
        count: (text, counts) => words.reduce((sum, word) => sum + (counts.get(word) || 0), 0)
    };
}

function occurrences(match, text, counts) {
    return match.inWords ? match.count(text, counts) : match.count(text);
}

// The paragraph of `section` holding most of the terms (`matches`), cut to
// a snippet.
function snippet(section, matches) {
    let best = section.paragraphs[0] || '';
    let most = -1;
    for (const paragraph of section.paragraphs) {
        const text = fold(paragraph);
        const counts = wordCounts(text);
        const found = matches.filter((match) => occurrences(match, text, counts) > 0).length;
        if (found > most) {
            most = found;
            best = paragraph;
        }
    }
    if (best.length <= SNIPPET_LENGTH) return best;
    const cut = best.slice(0, SNIPPET_LENGTH);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('。'));
    return end > SNIPPET_LENGTH / 2 ? cut.slice(0, end + 1) : `${cut.replace(/\s+\S*$/, '')} …`;
}

// The sections of `index` (guideIndex()) that best answer `question`, best
// first: `[{ section, score, snippet }]`, at most `limit`. None for a
// question with no word any section has.
//
// A term weighs the square of how rare it is among the sections (an inverse
// document frequency), so one rare word outweighs several common ones; in a
// heading it counts double, and in the text a little more the more often it
// comes.
export function searchGuide(question, index, { ignoredWords = [], limit = GUIDE_RESULTS } = {}) {
    const terms = questionTerms(question, ignoredWords);
    const entries = index?.entries || [];
    if (terms.length === 0 || entries.length === 0) return [];
    const all = terms.map((term) => matcher(term, index.vocabulary)).map((match) => ({
        match,
        having: entries.filter((entry) => occurrences(match, entry.headingText, entry.headingWords) + occurrences(match, entry.bodyText, entry.bodyWords) > 0).length
    })).filter(({ having }) => having > 0);
    // Words in more than a sixth of the guide ("how", "build") are left out;
    // when every word is that common, the rarest of them is used alone.
    const telling = all.filter(({ having }) => having <= entries.length * COMMON_SHARE);
    const rarest = all.length > 0 ? [all.reduce((best, term) => (term.having < best.having ? term : best))] : [];
    const used = telling.length > 0 ? telling : rarest;
    const matches = used.map(({ match }) => match);
    const weights = used.map(({ having }) => Math.log(1 + entries.length / having) ** 2);
    const scored = [];
    for (const entry of entries) {
        let score = 0;
        matches.forEach((match, i) => {
            const inHeading = occurrences(match, entry.headingText, entry.headingWords);
            const inBody = occurrences(match, entry.bodyText, entry.bodyWords);
            if (inHeading > 0) score += HEADING_WEIGHT * weights[i];
            if (inBody > 0) score += weights[i] * Math.sqrt(Math.min(inBody, 4));
        });
        if (score > 0 && entry.section.paragraphs.length > 0) scored.push({ entry, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(({ entry, score }) => Object.freeze({
        section: entry.section,
        score: Math.round(score * 100) / 100,
        snippet: snippet(entry.section, matches)
    }));
}
