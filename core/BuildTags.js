import { descriptionPlainText } from './DescriptionMarkup.js';

// A build's own tags (DocumentMetadata.tags): words that say what it is,
// such as "japanese" or "temple", which a Blurt post lists after
// ForkBuild's own tags. Each is lowercase a–z, 0–9 and inner hyphens, as
// Blurt and Steem tags must be, 2 to 24 characters, starting with a letter;
// none may start with "forkbuild", whose tags are the app's own.

export const BUILD_TAG_MAX_COUNT = 5;
export const BUILD_TAG_MAX_LENGTH = 24;
const BUILD_TAG_PATTERN = /^[a-z][a-z0-9-]*[a-z0-9]$/;

// Words too common to say what a build is, in the app's languages that
// write with Latin letters, accents removed.
const STOP_WORDS = new Set(`
a an the and or but nor of to in on at by for from with without into onto over under above below between
through during before after near about around against among as than then so too very just only also even
is are was were be been being am has have had having do does did done can could will would shall should may
might must not no yes this that these those it its it's i me my we our you your he him his she her they them
their there here what which who whom whose when where why how all any both each few more most other some
such own same up down out off again once one two three four five six seven eight nine ten first second
new old big small little made make makes making built build builds building untitled
der die das den dem des ein eine einer eines einem einen und oder aber mit ohne von zu im in am an auf aus bei
nach seit vom zum zur fur uber unter ist sind war waren wird werden hat haben nicht kein keine es sie er wir ihr
el la los las un una unos unas y o pero con sin de del al en por para es son fue fueron esta este estos estas
ese esa eso muy mas su sus se lo le les que como
le les une des et ou mais avec sans du au aux dans sur sous par pour est sont etait ce cet cette ces tres plus
son sa ses leur leurs qui quoi comme
dan atau tetapi dengan tanpa dari ke di pada untuk oleh adalah ini itu yang sangat lebih juga akan sudah
o os as um uma uns umas e ou mas com sem do da dos das no na nos nas por para sao foi muito mais seu sua seus suas
`.trim().split(/\s+/));

// `value` as a build tag, or null when it can't be one.
export function normalizeBuildTag(value) {
    if (typeof value !== 'string') return null;
    const tag = value.normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/^#+/, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (tag.length < 2 || tag.length > BUILD_TAG_MAX_LENGTH || !BUILD_TAG_PATTERN.test(tag)) return null;
    if (tag.startsWith('forkbuild')) return null;
    return tag;
}

// Tags from a list or from text separated by commas or spaces: each made a
// build tag, invalid ones dropped, each kept once, at most BUILD_TAG_MAX_COUNT.
export function normalizeBuildTags(values) {
    const list = Array.isArray(values) ? values : (typeof values === 'string' ? values.split(/[\s,]+/) : []);
    const tags = [];
    for (const value of list) {
        const tag = normalizeBuildTag(value);
        if (tag && !tags.includes(tag)) tags.push(tag);
        if (tags.length === BUILD_TAG_MAX_COUNT) break;
    }
    return tags;
}

// Up to `count` tags suggested from a build's title and description: the
// title's words first, in order, then the description's most frequent,
// leaving out common words, numbers and anything that can't be a tag.
// Words in scripts other than Latin letters give no suggestion.
export function suggestBuildTags({ title = '', description = '' } = {}, count = BUILD_TAG_MAX_COUNT) {
    const words = (text) => (typeof text === 'string' ? text : '')
        .normalize('NFKD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((word) => word.length >= 3 && !STOP_WORDS.has(word) && normalizeBuildTag(word) === word);
    const suggestions = [];
    const add = (word) => {
        if (suggestions.length < count && !suggestions.includes(word)) suggestions.push(word);
    };
    words(title).forEach(add);
    const frequency = new Map();
    for (const word of words(descriptionPlainText(description))) frequency.set(word, (frequency.get(word) ?? 0) + 1);
    // Most frequent first; among equals, the one that came first.
    [...frequency.entries()].sort((a, b) => b[1] - a[1]).forEach(([word]) => add(word));
    return suggestions;
}
