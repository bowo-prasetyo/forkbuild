import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { ListPublicationsUseCase } from './ListPublicationsUseCase.js';
import { FindPublicationUseCase } from './FindPublicationUseCase.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { SearchPublicationsUseCase } from './SearchPublicationsUseCase.js';

// Builds the concrete discovery backend and the use cases that depend on
// it, so ui/ never imports discovery/ directly. Same shape as
// CreatePersistenceUseCase and CreatePublisherUseCase.
//
// 0.2.31: gains loadPublicationDocumentUseCase (needed for
// SearchPublicationsUseCase's opt-in description search — see its own
// comment) and searchPublicationsUseCase itself, the Repository/Author
// catalog's paginated, sorted, deterministic query — see
// docs/Principles.md, "Repository Search Is Not World Search."
export class CreateDiscoveryUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storageProvider);
        return {
            discoveryProvider,
            listPublicationsUseCase: new ListPublicationsUseCase(discoveryProvider),
            findPublicationUseCase: new FindPublicationUseCase(discoveryProvider),
            loadPublicationDocumentUseCase,
            searchPublicationsUseCase: new SearchPublicationsUseCase(discoveryProvider, loadPublicationDocumentUseCase)
        };
    }
}
