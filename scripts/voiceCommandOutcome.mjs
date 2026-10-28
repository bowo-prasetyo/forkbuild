// What a transcript would make voice building do, read exactly as the app reads
// it (core/voice/EditorVoiceCommand.js in the Editor, core/voice/WorldVoiceCommand.js
// in World View, after core/voice/Transcript.js's cleaning), in the words of
// `language`, for scripts/evaluate-voice-commands.mjs and tests/VoicePhrases.test.js.
// Not part of the app.
import { createStandardActions } from '../application/editor/EditorActionRegistry.js';
import { interpretEditorCommand } from '../core/voice/EditorVoiceCommand.js';
import { cleanTranscript, withoutSilenceWords } from '../core/voice/Transcript.js';
import { interpretWorldCommand } from '../core/voice/WorldVoiceCommand.js';
import { setAppLocale } from '../ui/i18n/i18n.js';
import { worldVoiceVocabulary } from '../ui/i18n/worldVoiceWords.js';
import { editorVoiceWords } from '../ui/voice/editorVoiceWords.js';
import { PLACES } from './voiceCommandPhrases.mjs';

// The Editor's actions, made to be read and never run.
const ACTIONS = createStandardActions({ session: {}, feedback: { show() {} } });

// A reader for `language`: `did(transcript, view)` says what the app would do,
// in the words of voiceCommandPhrases.mjs's `expect` ('paint roof roofRed',
// 'action history.undo', 'goTo mill', 'home', …), or null for nothing.
export async function voiceReader(language) {
    await setAppLocale(language);
    const editor = editorVoiceWords();
    const world = worldVoiceVocabulary();
    const places = Object.entries(PLACES[language]).map(([key, title]) => ({ id: key, title }));
    return {
        did(transcript, view) {
            const heard = withoutSilenceWords(cleanTranscript(transcript));
            if (!heard) return null;
            if (view === 'world') {
                const command = interpretWorldCommand(heard, world, places);
                if (!command) return null;
                if (command.kind === 'goTo') return command.place ? `goTo ${command.place.id}` : null;
                return command.kind;
            }
            const command = interpretEditorCommand(heard, { ...editor, actions: ACTIONS });
            if (!command) return null;
            if (command.kind === 'action') return `action ${command.action.id}`;
            const { intent, target, colour } = command.plan;
            return [intent, target.kind === 'part' ? target.part : target.kind, colour].filter(Boolean).join(' ');
        }
    };
}

// 'right' (did what was meant), 'nothing' (did nothing; for a phrase that
// isn't a command, that is right) or 'wrong' (did something else).
export function verdict(expect, did) {
    if (expect === 'none') return did === null ? 'right' : 'wrong';
    if (did === null) return 'nothing';
    return did === expect ? 'right' : 'wrong';
}
