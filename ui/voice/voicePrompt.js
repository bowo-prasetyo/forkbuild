// What voice building could tell the speech model it is likely to hear
// (application/voice/SpeechRuntime.js#transcribe()'s `prompt`), made from the
// words the app reads a command with, in the chosen language: the Editor's
// plain commands (ui/i18n/plainCommandWords.js: what to do, the Build
// Library's parts, the village palette's colours) and action names
// (application/editor/EditorActionRegistry.js), and World View's commands
// (ui/i18n/worldVoiceWords.js) and the World's own Locations. A new part,
// colour or action is in it as soon as the app can read it, and nothing is
// in it that the app can't act on.
//
// `expanded` adds every other phrasing the app reads (the word lists'
// alternatives and everyday names) to each concept's first name. The most
// telling words come last, the parts and colours, or the places: Whisper
// heeds what was said just before most, and SpeechRuntime keeps the end of
// a prompt too long for it.
//
// `apart` leaves out the words near a command (`NEAR`): two words for
// different things that are spelled nearly alike, both left out, since the
// prompt pulls one toward the other ("Desfazer", undo, heard as "e fazer",
// redo), and the words for everything ("all", Select All), since a garbled
// part beside one becomes "select all".
//
// Measured by scripts/evaluate-voice-commands.mjs (`--prompt`); see
// docs/reviews/VoicePrompt-2026-10-30.md. The app gives the model `apart` in
// PROMPTED_LANGUAGES (appVoicePrompt()), and no prompt in the others.
import { createStandardActions } from '../../application/editor/EditorActionRegistry.js';
import { SPOKEN_ACTIONS } from '../../core/voice/EditorVoiceCommand.js';
import { splitWordList } from '../../core/library/LibrarySearch.js';
import { plainCommandVocabulary } from '../i18n/plainCommandWords.js';
import { worldVoiceVocabulary } from '../i18n/worldVoiceWords.js';
import { t } from '../i18n/i18n.js';

// Two words are near when changing at most this share of the longer one's
// letters makes one the other.
export const NEAR = 1 / 3;

// The languages the app gives the model a prompt in: those where `apart`,
// with the guards, heard more commands right on both the first and the
// fresh recordings, and did nothing more that must be undone. English and
// Spanish fixed about as many as they broke, for a second or two more each
// time, so they have none (docs/reviews/VoicePrompt-2026-10-30.md, *Turned
// on*).
export const PROMPTED_LANGUAGES = Object.freeze(new Set(['de', 'fr', 'id', 'ja', 'ko', 'pt-BR']));

// The prompt the app gives the model for `view` in `language` (an app
// locale code): `apart` in PROMPTED_LANGUAGES, otherwise none ('').
export function appVoicePrompt(view, language, { places = [], actions = null } = {}) {
    return PROMPTED_LANGUAGES.has(language) ? voicePrompt(view, { apart: true, places, actions }) : '';
}

// `view` is 'editor' or 'world'; `places`, World View's Locations
// (`{ title }`); `actions`, the Editor's, when already made.
export function voicePrompt(view, { expanded = false, apart = false, places = [], actions = null } = {}) {
    const first = (list) => (expanded ? list : list.slice(0, 1));
    const groups = view === 'world' ? worldGroups(first, places) : editorGroups(first, expanded, actions);
    const seen = new Set();
    const words = [];
    for (const group of groups) {
        for (const { word, concept } of group) {
            const text = String(word || '').trim();
            const key = text.toLocaleLowerCase();
            if (!text || seen.has(key)) continue;
            seen.add(key);
            words.push({ text, concept });
        }
    }
    return (apart ? withoutNearWords(words) : words).map(({ text }) => text).join(', ');
}

function withoutNearWords(words) {
    const letters = words.map(({ text }) => spelled(text));
    return words.filter(({ concept }, at) => concept !== EVERYTHING
        && !words.some((other, at2) => other.concept !== concept && near(letters[at], letters[at2])));
}

function near(a, b) {
    return editDistance(a, b) <= NEAR * Math.max(a.length, b.length);
}

// Letters only, without case or accents: "Désactiver" and "desactiver" are
// spelled alike.
function spelled(text) {
    return [...text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, '')];
}

function editDistance(a, b) {
    let row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i += 1) {
        const next = [i];
        for (let j = 1; j <= b.length; j += 1) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        row = next;
    }
    return row[b.length];
}

const EVERYTHING = 'everything';
const as = (concept) => (word) => ({ word, concept });

function editorGroups(first, expanded, actions) {
    const vocabulary = plainCommandVocabulary();
    const editorActions = (actions || createStandardActions({ session: {}, feedback: { show() {} } })).filter(({ id }) => SPOKEN_ACTIONS.has(id));
    const aliases = ['undo', 'redo'].flatMap((command) => first(splitWordList(t(`worldVoice.words.${command}`))).map(as(`history.${command}`)));
    // A colour's list starts with the palette's own name ("Roof red"); its
    // everyday name ("red") is what is said.
    const colours = Object.entries(vocabulary.colours).flatMap(([colour, names]) => (expanded ? names : names.slice(names.length > 1 ? 1 : 0, names.length > 1 ? 2 : 1)).map(as(`colour.${colour}`)));
    return [
        editorActions.map(({ id, label }) => ({ word: t(label), concept: id === 'selection.selectAll' ? EVERYTHING : id })),
        aliases,
        first(vocabulary.everything).map(as(EVERYTHING)),
        first(vocabulary.selection).map(as('selection')),
        colours,
        Object.entries(vocabulary.parts).flatMap(([part, names]) => first(names).map(as(`part.${part}`))),
        Object.entries(vocabulary.intents).flatMap(([intent, names]) => first(names).map(as(`intent.${intent}`)))
    ];
}

function worldGroups(first, places) {
    const vocabulary = worldVoiceVocabulary();
    const commands = Object.entries(vocabulary).filter(([key]) => key !== 'ignoredWords' && key !== 'goTo').flatMap(([key, list]) => first(list).map(as(key)));
    return [
        commands,
        first(vocabulary.goTo).map(as('goTo')),
        places.map((place, at) => ({ word: place?.title, concept: `place.${at}` }))
    ];
}
