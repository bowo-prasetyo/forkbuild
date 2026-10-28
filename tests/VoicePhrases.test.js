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
    // Misheard as the evaluation heard them: the part named didn't come through.
    const pt = await voiceReader('pt-BR');
    assert(pt.did('Apagas, avulis.', 'editor') === null, '7a. "Apague as árvores" misheard does nothing, rather than delete the selection');
    const ko = await voiceReader('ko');
    assert(ko.did('지분을 빨간색으로 칠해줘', 'editor') === null, '7b. nor paints it');
    assert((await voiceReader('en')).did('Paint this red.', 'editor') === 'paint selection roofRed', '7c. the selection, said, is painted');
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
    assert(interpretEditorCommand('paint it red', { vocabulary, actions }) === null,
        '12. spoken, a command that names nothing to paint does nothing, rather than paint the selection: the part it named may have been misheard');
    const deleting = [...actions, { id: 'selection.delete', label: 'Delete' }];
    const words = { ...vocabulary, intents: { ...vocabulary.intents, delete: ['delete'] } };
    assert(interpretEditorCommand('delete', { vocabulary: words, actions: deleting }).action.id === 'selection.delete', '13. Delete said alone is still the Delete action');
}
console.log('✓ the Editor\'s reading of a spoken command');

console.log('✅ All voice phrase tests passed.');
