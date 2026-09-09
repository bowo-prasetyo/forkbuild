import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
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
//
// 0.9.339 — Merge Decentralized Publication Discovery into Repository
// Discovery. `execute()` now takes an OPTIONAL `decentralizedDiscoveryProvider`
// — the one application-lifetime discovery/DecentralizedPublicationDiscoveryProvider.js
// instance ui/main.js already builds and shares via provide/inject
// (0.9.337). This is the smallest dependency-injection change the
// 0.9.338 audit's own verdict called for: this class still constructs
// its own LocalDiscoveryProvider exactly as before, and callers that
// pass nothing (or that a future caller forgets to update) get back
// that same plain LocalDiscoveryProvider, unchanged — see Section G of
// tests/DecentralizedPublicationRepositoryMerge.test.js, "failure
// isolation." Only when a caller supplies the shared provider does this
// class combine it with LocalDiscoveryProvider, through
// discovery/CompositeDiscoveryProvider.js's own small, generic merge —
// never a new "Federated" domain concept, per that class's own header.
export class CreateDiscoveryUseCase {
    execute({ decentralizedDiscoveryProvider = null } = {}) {
        const storageProvider = new LocalStorageProvider();
        const localDiscoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const discoveryProvider = decentralizedDiscoveryProvider
            ? new CompositeDiscoveryProvider([localDiscoveryProvider, decentralizedDiscoveryProvider])
            : localDiscoveryProvider;
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
