// Voice building's phrases (scripts/voiceCommandPhrases.mjs), typed rather than
// spoken: each, in each language the app speaks, does what it should, read
// exactly as the app reads it (scripts/voiceCommandOutcome.mjs,
// core/voice/EditorVoiceCommand.js, core/voice/WorldVoiceCommand.js). So when
// scripts/evaluate-voice-commands.mjs finds a spoken one done wrong, the speech
// model misheard it; and a change to the words heard can't quietly lose one.
import { SPOKEN_ACTIONS, interpretEditorCommand } from '../core/voice/EditorVoiceCommand.js';
import { MAX_OTHER_WORDS, interpretWorldCommand } from '../core/voice/WorldVoiceCommand.js';
import { createStandardActions } from '../application/editor/EditorActionRegistry.js';
import { repeatsItself } from '../core/voice/Transcript.js';
import { COMMANDS, FRESH_SAID, SAID, voicePhrases } from '../scripts/voiceCommandPhrases.mjs';
import { verdict, voiceReader } from '../scripts/voiceCommandOutcome.mjs';
import { assert } from './support/Assert.js';

{
    assert(Object.keys(SAID).join() === 'en,de,es,fr,id,ja,ko,pt-BR', '1. every language the app speaks');
    assert(Object.values(SAID).every((texts) => texts.length === COMMANDS.length), '2. each says every command');
    assert(Object.keys(FRESH_SAID).join() === Object.keys(SAID).join() && Object.values(FRESH_SAID).every((texts) => texts.length === COMMANDS.length),
        '2a. the fresh phrasing too, in every language');
    assert(Object.keys(SAID).every((language) => FRESH_SAID[language].filter((text, i) => text !== SAID[language][i]).length >= 20),
        '2b. most of it said another way');
    for (const language of Object.keys(SAID)) {
        const reader = await voiceReader(language);
        for (const phrase of [...voicePhrases(), ...voicePhrases('fresh')].filter((p) => p.language === language)) {
            const did = reader.did(phrase.text, phrase.view);
            assert(verdict(phrase.expect, did) === 'right', `3. ${language} "${phrase.text}" should do ${phrase.expect}, and did ${did}`);
        }
    }
}
assert(voicePhrases().every((phrase) => !repeatsItself(phrase.text)), '3a. no phrase is taken for the model going round in a loop');
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
    const parts = { ...vocabulary, parts: { roof: ['roof'] } };
    assert(interpretEditorCommand('the roof red', { vocabulary: parts, actions }) === null && interpretEditorCommand('paint the roof red', { vocabulary: parts, actions }).kind === 'plain',
        '14. spoken, a colour and a part are painted only when told to: "I like the red roof" paints nothing');
    const all = { ...parts, intents: { ...parts.intents, select: ['select'] }, everything: ['all', 'everything'], ignoredWords: ['the'] };
    assert(interpretEditorCommand('select all the ginelas', { vocabulary: all, actions }) === null,
        '14a. spoken, nothing is done to everything when a word it can\'t read comes with it: the part may have been misheard');
    assert(interpretEditorCommand('paint everything red', { vocabulary: all, actions }).plan.target.kind === 'everything'
        && interpretEditorCommand('paint all in red', { vocabulary: all, actions }).plan.target.kind === 'everything'
        && interpretEditorCommand('select all the roofs', { vocabulary: all, actions }).plan.target.kind === 'part',
        '14b. said whole, or with a short word that holds the sentence together, everything is everything');
    const ja = { intents: { delete: ['削除', '消'] }, everything: ['全部'], parts: { tree: ['木'] }, ignoredWords: ['を'] };
    assert(['キュを全部消して', '気を全部消して', 'キューを全部消して'].every((said) => interpretEditorCommand(said, { vocabulary: ja, actions: deleting }) === null),
        '14c. in Japanese, written without spaces, kanji or katakana it can\'t read is a word it can\'t read: "木を全部消して" heard as "気を全部消して" deletes nothing');
    assert(interpretEditorCommand('全部消して', { vocabulary: ja, actions: deleting }).plan.target.kind === 'everything'
        && interpretEditorCommand('全部を消してください', { vocabulary: ja, actions: deleting }).plan.target.kind === 'everything'
        && interpretEditorCommand('木を全部消して', { vocabulary: ja, actions: deleting }).plan.target.kind === 'part',
        '14d. what is left in hiragana holds the sentence together: "全部消して" is still everything');
}
console.log('✓ the Editor\'s reading of a spoken command');

{
    // Only actions Undo takes back, or that only change what is seen, can be
    // spoken; nothing that sends a build off the device or can't be undone.
    const actions = createStandardActions({ session: {}, feedback: { show() {} } });
    const ids = new Set(actions.map(({ id }) => id));
    assert([...SPOKEN_ACTIONS].every((id) => ids.has(id)), '15. every action voice may run is one of the Editor\'s');
    for (const id of ['file.publish', 'file.export', 'file.exportModel', 'file.import', 'file.new', 'structure.createFromSelection', 'ui.voice']) {
        assert(!SPOKEN_ACTIONS.has(id), `16. ${id} can't be spoken`);
    }
    const said = (text) => interpretEditorCommand(text, { actions: actions.map((action) => ({ ...action, label: action.id.split('.')[1] })) });
    assert(said('publish') === null && said('export') === null && said('new') === null, '17. "publish", "export", "new build" said do nothing');
    assert(said('save')?.action.id === 'file.save' && said('undo')?.action.id === 'history.undo', '18. "save" and "undo" still do');
}
console.log('✓ what voice may run');

{
    // core/voice/WorldVoiceCommand.js: a command is said on its own.
    const vocabulary = { home: ['home', 'go home'], talk: ['talk'], goTo: ['go to'], ignoredWords: ['is', 'to', 'the', 'my'] };
    const kind = (text) => interpretWorldCommand(text, vocabulary)?.kind ?? null;
    assert(kind('home') === 'home' && kind('go home') === 'home' && kind('go to home') === 'home' && kind('home please') === 'home', '19. a command, alone or with a word more');
    assert(MAX_OTHER_WORDS === 1 && kind('who wants to talk') === null && kind('my home is far away') === null, '20. inside a sentence that says more, it is no command');
    assert(kind('talk') === 'talk' && kind('talk to her') === 'talk' && kind('we talk') === null,
        '21. talk, which can\'t be taken back, with nothing before it: "wir reden" is a sentence about talking');
    const id = { home: ['rumah', 'pulang'], goTo: ['bawa aku ke'], ignoredWords: ['ke'] };
    const idKind = (text) => interpretWorldCommand(text, id)?.kind ?? null;
    assert(idKind('aku rindu rumah') === null && idKind('bawa aku ke rumah') === 'home' && idKind('pulang') === 'home',
        '22. going to\'s words are the command\'s only when going to was said: "Aku rindu rumah" (I miss home) goes nowhere, "bawa aku ke rumah" goes home');
}
console.log('✓ World View\'s commands are said on their own');

console.log('✅ All voice phrase tests passed.');
