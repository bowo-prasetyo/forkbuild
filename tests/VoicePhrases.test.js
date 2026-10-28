// Voice building's phrases (scripts/voiceCommandPhrases.mjs), typed rather than
// spoken: each, in each language the app speaks, does what it should, read
// exactly as the app reads it (scripts/voiceCommandOutcome.mjs,
// core/voice/EditorVoiceCommand.js, core/voice/WorldVoiceCommand.js). So when
// scripts/evaluate-voice-commands.mjs finds a spoken one done wrong, the speech
// model misheard it; and a change to the words heard can't quietly lose one.
import { interpretEditorCommand } from '../core/voice/EditorVoiceCommand.js';
import { COMMANDS, SAID, voicePhrases } from '../scripts/voiceCommandPhrases.mjs';
import { verdict, voiceReader } from '../scripts/voiceCommandOutcome.mjs';
import { assert } from './support/Assert.js';

{
    assert(Object.keys(SAID).join() === 'en,de,es,fr,id,ja,ko,pt-BR', '1. every language the app speaks');
    assert(Object.values(SAID).every((texts) => texts.length === COMMANDS.length), '2. each says every command');
    for (const language of Object.keys(SAID)) {
        const reader = await voiceReader(language);
        for (const phrase of voicePhrases().filter((p) => p.language === language)) {
            const did = reader.did(phrase.text, phrase.view);
            assert(verdict(phrase.expect, did) === 'right', `3. ${language} "${phrase.text}" should do ${phrase.expect}, and did ${did}`);
        }
    }
}
console.log('✓ every phrase, typed, does what it should in every language');

{
    assert(verdict('home', 'home') === 'right' && verdict('home', null) === 'nothing' && verdict('home', 'soundOff') === 'wrong', '4. right, nothing, or something else');
    assert(verdict('none', null) === 'right' && verdict('none', 'action history.undo') === 'wrong', '5. for words that aren\'t a command, doing nothing is right');
    const reader = await voiceReader('en');
    assert(reader.did(' Thank you for watching. ', 'editor') === null, '6. what the model makes up from silence does nothing');
    assert(reader.did('and do that', 'editor') === 'action history.undo', '7. a command heard as words that sound like it is still that command');
}
console.log('✓ verdicts');

{
    // core/voice/EditorVoiceCommand.js on its own.
    const actions = [{ id: 'history.undo', label: 'Undo' }, { id: 'ui.voice', label: 'Voice' }];
    const vocabulary = { intents: { paint: ['paint'] }, colours: { roofRed: ['red'] }, selection: ['this'] };
    assert(interpretEditorCommand('paint this red', { vocabulary, actions }).kind === 'plain', '8. a plain command first');
    assert(interpretEditorCommand('undo', { vocabulary, actions }).action.id === 'history.undo', '9. then an action by its name');
    assert(interpretEditorCommand('voice', { vocabulary, actions }) === null, '10. never Voice itself');
    assert(interpretEditorCommand('take that back', { vocabulary, actions, aliases: { 'history.undo': ['take that back'] } }).action.id === 'history.undo', '11. or by another phrasing');
}
console.log('✓ the Editor\'s reading of a spoken command');

console.log('✅ All voice phrase tests passed.');
