// The words a command spoken in World View is read with
// (core/voice/WorldVoiceCommand.js), in the chosen language.
import { WORLD_VOICE_COMMANDS } from '../../core/voice/WorldVoiceCommand.js';
import { splitWordList } from '../../core/library/LibrarySearch.js';
import { librarySearchIgnoredWords } from './libraryText.js';
import { t } from './i18n.js';

export function worldVoiceVocabulary() {
    return {
        goTo: splitWordList(t('worldVoice.words.goTo')),
        ...Object.fromEntries(WORLD_VOICE_COMMANDS.map((command) => [command, splitWordList(t(`worldVoice.words.${command}`))])),
        ignoredWords: librarySearchIgnoredWords()
    };
}
