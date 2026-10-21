// The words a plain command in the Editor's command palette is read with
// (core/building/PlainCommand.js), in the chosen language: what to do, the
// parts of a build, "everything" and "what's selected", and the village
// palette's colours by their own names and everyday ones ("red").
import { BUILD_PARTS } from '../../core/catalog/BuildDescription.js';
import { PLAIN_COMMAND_INTENTS } from '../../core/building/PlainCommand.js';
import { VILLAGE_PALETTE } from '../../core/building/VillagePalette.js';
import { splitWordList } from '../../core/library/LibrarySearch.js';
import { librarySearchIgnoredWords } from './libraryText.js';
import { t } from './i18n.js';

const words = (key) => splitWordList(t(key));

export function plainCommandVocabulary() {
    return {
        intents: Object.fromEntries(PLAIN_COMMAND_INTENTS.map((intent) => [intent, words(`plainCommand.words.${intent}`)])),
        everything: words('plainCommand.words.everything'),
        selection: words('plainCommand.words.selection'),
        parts: Object.fromEntries(BUILD_PARTS.map((part) => [part, words(`plainCommand.part.${part}`)])),
        colours: Object.fromEntries(VILLAGE_PALETTE.map(({ id }) => [id, [t(`villagePalette.${id}`), ...words(`plainCommand.colour.${id}`)]])),
        ignoredWords: librarySearchIgnoredWords()
    };
}
