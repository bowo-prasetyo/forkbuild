// A command spoken in the Editor (ui/voice/useVoiceCommands.js), read as the
// command palette reads what is typed: first as a plain command ("paint the
// roof red", core/building/PlainCommand.js), then as one of the Editor's
// actions by its name, by World View's phrasings of undo and redo, or by what
// it sounds like ("and do that" is Undo, core/voice/Transcript.js#actionSaid()).
// The Editor does what this says (ui/views/EditorView.js), and
// scripts/evaluate-voice-commands.mjs measures it, so both read the same way.
//
// `vocabulary` is the plain command's words, `aliases` more phrasings by
// action id and `toText` what turns an action's `label` into words
// (ui/voice/editorVoiceWords.js); `actions` the Editor's
// (application/editor/EditorActionRegistry.js), but for Voice itself, which
// a spoken command never turns off.
//
// Spoken, a plain command acts on the selection only when it says so ("paint
// this red"): when the part named was misheard ("paint the roof red" heard as
// "paint the rough red"), the palette's fallback to the selection would do it
// to something else (scripts/evaluate-voice-commands.mjs found it doing so).
// Such a command is read as an action's name instead, or as nothing.
//
// Pure: text and words in, `{ kind: 'plain', plan }`, `{ kind: 'action',
// action }` or null out.
import { interpretPlainCommand } from '../building/PlainCommand.js';
import { actionSaid } from './Transcript.js';

export function interpretEditorCommand(transcript, { vocabulary = {}, actions = [], toText = String, aliases = {} } = {}) {
    const plan = interpretPlainCommand(transcript, vocabulary);
    if (plan && (plan.target.kind !== 'selection' || plan.target.said)) return Object.freeze({ kind: 'plain', plan });
    const action = actionSaid(transcript, actions.filter(({ id }) => id !== 'ui.voice'), { toText, aliases });
    return action ? Object.freeze({ kind: 'action', action }) : null;
}
