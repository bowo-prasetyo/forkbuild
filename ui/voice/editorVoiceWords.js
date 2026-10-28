// The words a command spoken in the Editor is read with
// (core/voice/EditorVoiceCommand.js), in the chosen language: the plain
// command's, and World View's phrasings of undo and redo, so "undo that" and
// "take that back" are heard in either view.
import { splitWordList } from '../../core/library/LibrarySearch.js';
import { plainCommandVocabulary } from '../i18n/plainCommandWords.js';
import { t } from '../i18n/i18n.js';

// `vocabulary`: the plain command's words when already read.
export function editorVoiceWords({ vocabulary = plainCommandVocabulary() } = {}) {
    return {
        vocabulary,
        aliases: {
            'history.undo': splitWordList(t('worldVoice.words.undo')),
            'history.redo': splitWordList(t('worldVoice.words.redo'))
        },
        toText: t
    };
}
