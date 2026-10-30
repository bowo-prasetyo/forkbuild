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
// Measured by scripts/evaluate-voice-commands.mjs (`--prompt`); see
// docs/reviews/VoicePrompt-2026-10-30.md for whether the app uses it.
import { createStandardActions } from '../../application/editor/EditorActionRegistry.js';
import { splitWordList } from '../../core/library/LibrarySearch.js';
import { plainCommandVocabulary } from '../i18n/plainCommandWords.js';
import { worldVoiceVocabulary } from '../i18n/worldVoiceWords.js';
import { t } from '../i18n/i18n.js';

// `view` is 'editor' or 'world'; `places`, World View's Locations
// (`{ title }`); `actions`, the Editor's, when already made.
export function voicePrompt(view, { expanded = false, places = [], actions = null } = {}) {
    const first = (list) => (expanded ? list : list.slice(0, 1));
    const groups = view === 'world' ? worldGroups(first, places) : editorGroups(first, expanded, actions);
    const seen = new Set();
    const words = [];
    for (const group of groups) {
        for (const word of group) {
            const text = String(word || '').trim();
            const key = text.toLocaleLowerCase();
            if (!text || seen.has(key)) continue;
            seen.add(key);
            words.push(text);
        }
    }
    return words.join(', ');
}

function editorGroups(first, expanded, actions) {
    const vocabulary = plainCommandVocabulary();
    const editorActions = (actions || createStandardActions({ session: {}, feedback: { show() {} } })).filter(({ id }) => id !== 'ui.voice');
    const aliases = ['undo', 'redo'].flatMap((command) => first(splitWordList(t(`worldVoice.words.${command}`))));
    // A colour's list starts with the palette's own name ("Roof red"); its
    // everyday name ("red") is what is said.
    const colours = Object.values(vocabulary.colours).flatMap((names) => (expanded ? names : names.slice(names.length > 1 ? 1 : 0, names.length > 1 ? 2 : 1)));
    return [
        editorActions.map(({ label }) => t(label)),
        aliases,
        first(vocabulary.everything),
        first(vocabulary.selection),
        colours,
        Object.values(vocabulary.parts).flatMap(first),
        Object.values(vocabulary.intents).flatMap(first)
    ];
}

function worldGroups(first, places) {
    const vocabulary = worldVoiceVocabulary();
    const commands = Object.entries(vocabulary).filter(([key]) => key !== 'ignoredWords' && key !== 'goTo').flatMap(([, list]) => first(list));
    return [
        commands,
        first(vocabulary.goTo),
        places.map((place) => place?.title)
    ];
}
