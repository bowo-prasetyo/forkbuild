// The titles the app gives a document it makes (application/document/DocumentTitles.js):
// saved in the language of whoever made it, English until the UI sets them.
import { setDocumentTitles, untitledWorldTitle, forkTitle, copyTitle } from '../application/document/DocumentTitles.js';
import { CreateDocumentManagerUseCase } from '../application/document/CreateDocumentManagerUseCase.js';
import { DocumentCloneService } from '../application/document/DocumentCloneService.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { Translator } from '../ui/i18n/Translator.js';
import en from '../ui/i18n/messages/en.js';
import { assert } from './support/Assert.js';

// A. Until the UI sets them, the English the app has always used, and the
//    same English as the messages a translation starts from.
setDocumentTitles();
assert(untitledWorldTitle() === 'Untitled ForkBuild World' && untitledWorldTitle() === en['document.untitledWorld'],
    '1. A new World is "Untitled ForkBuild World", as in the English messages');
assert(forkTitle('Hill Fort') === 'Fork of Hill Fort' && forkTitle('Hill Fort') === en['document.forkOf'].replace('{title}', 'Hill Fort'),
    '2. A fork is "Fork of …", as in the English messages');
assert(copyTitle('Hill Fort') === 'Copy of Hill Fort' && copyTitle('Hill Fort') === en['document.copyOf'].replace('{title}', 'Hill Fort'),
    '3. A copy is "Copy of …", as in the English messages');
assert(forkTitle('') === 'Fork of Untitled ForkBuild World', '4. A fork of an untitled World names it as untitled');

// B. Set from the chosen language, as ui/main.js does.
const german = new Translator({
    locale: 'de',
    fallbackMessages: en,
    messages: {
        'document.untitledWorld': 'Unbenannte ForkBuild-Welt',
        'document.forkOf': 'Abzweigung von {title}',
        'document.copyOf': 'Kopie von {title}'
    }
});
setDocumentTitles({
    untitledWorld: () => german.translate('document.untitledWorld'),
    forkOf: (title) => german.translate('document.forkOf', { title }),
    copyOf: (title) => german.translate('document.copyOf', { title })
});
const manager = new CreateDocumentManagerUseCase().execute();
new CreateDocumentManagerUseCase().attachWorld(manager, new World({ id: 'w-new' }));
assert(manager.document.metadata.title === 'Unbenannte ForkBuild-Welt', '5. A new World gets its title in the chosen language');
const saved = DocumentMetadata.fromJSON(JSON.parse(JSON.stringify(manager.document.metadata.toJSON())));
assert(saved.title === 'Unbenannte ForkBuild-Welt', '6. ...and it is saved like any title');

const source = new Document({ world: new World({ id: 'w-source' }), metadata: new DocumentMetadata({ title: 'Hill Fort' }) });
const copy = new DocumentCloneService().execute(source);
assert(copy.metadata.title === 'Kopie von Hill Fort', '7. A copy is titled in the chosen language, keeping the source\'s own title');
assert(forkTitle('Hill Fort') === 'Abzweigung von Hill Fort', '8. So is a fork');

// C. Leaving one out keeps its English; no argument restores all.
setDocumentTitles({ untitledWorld: () => 'X' });
assert(untitledWorldTitle() === 'X' && forkTitle('A') === 'Fork of A', '9. A title left out stays English');
setDocumentTitles();
assert(untitledWorldTitle() === 'Untitled ForkBuild World', '10. With no argument, English again');

console.log('✅ All Document Titles tests passed.');
