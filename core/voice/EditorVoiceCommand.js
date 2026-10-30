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
// Such a command is read as an action's name instead, or as nothing. And it
// says what to do: typed, "the windows red" is paint, since the palette shows
// what it will do before it does it, but spoken, nothing is shown first, and
// "I like the red roof" would paint it.
//
// Only SPOKEN_ACTIONS can be run by voice: those whose changes Undo takes
// back, and those that only change what is seen or open a panel. Publish,
// Export, Import and New Build are left out, as is Create Blueprint, which
// writes to the Build Library: something misheard, or made up from noise,
// must never send a build off the device, or do what Undo can't take back
// (docs/reviews/VoicePrompt-2026-10-30.md). A new action can be spoken only
// once it is added here.
//
// Pure: text and words in, `{ kind: 'plain', plan }`, `{ kind: 'action',
// action }` or null out.
import { interpretPlainCommand } from '../building/PlainCommand.js';
import { actionSaid } from './Transcript.js';

export const SPOKEN_ACTIONS = Object.freeze(new Set([
    // What Undo takes back.
    'selection.selectAll', 'selection.clear', 'selection.duplicate', 'selection.delete', 'selection.paint',
    'group.create', 'group.rename', 'group.duplicate', 'group.delete', 'group.addSelection', 'group.removeSelection',
    'clipboard.copy', 'clipboard.paste',
    'transform.nudgeRight', 'transform.nudgeLeft', 'transform.nudgeForward', 'transform.nudgeBack', 'transform.nudgeUp', 'transform.nudgeDown',
    'transform.rotateClockwise', 'transform.rotateCounterClockwise', 'transform.tilt', 'transform.tiltBack',
    'transform.alignLeft', 'transform.alignCenterX', 'transform.alignRight', 'transform.alignBottom', 'transform.alignCenterY', 'transform.alignTop',
    'transform.alignFront', 'transform.alignCenterZ', 'transform.alignBack', 'transform.distributeX', 'transform.distributeY', 'transform.distributeZ',
    'transform.numeric', 'transform.repeat',
    'history.undo', 'history.redo',
    // What only changes what is seen, or opens a panel.
    'selection.focus', 'camera.wholeBuild', 'ui.seeInside', 'ui.sound', 'ui.describeBuild', 'ui.commandPalette', 'ui.shortcuts', 'ui.firstBuildGuide',
    'tool.select', 'tool.place',
    // Keeps the build as it is now, here, and loses nothing.
    'file.save'
]));

export function interpretEditorCommand(transcript, { vocabulary = {}, actions = [], toText = String, aliases = {} } = {}) {
    const plan = interpretPlainCommand(transcript, vocabulary);
    if (plan && plan.intentSaid && (plan.target.kind !== 'selection' || plan.target.said)) return Object.freeze({ kind: 'plain', plan });
    const action = actionSaid(transcript, actions.filter(({ id }) => SPOKEN_ACTIONS.has(id)), { toText, aliases });
    return action ? Object.freeze({ kind: 'action', action }) : null;
}
