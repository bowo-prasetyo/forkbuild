import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalAnchorKnowledgeStore } from './LocalAnchorKnowledgeStore.js';

// 0.8.17 — Evidence Provenance & Observation Boundary.
//
// Wires the concrete local storage for application/
// LocalAnchorKnowledgeStore.js, so ui/ never imports that file directly
// — the same composition-root shape application/
// CreatePublicationAnchorCatalogUseCase.js already established for
// application/LocalPublicationAnchorCatalog.js in 0.8.2. A fresh
// LocalStorageProvider is fine here even though application/
// CreatePublicationAnchorPeerExchangeUseCase.js separately constructs
// its own for the catalog/store pair — application/
// LocalStorageProvider.js is a stateless wrapper over
// `window.localStorage`, and this store's own key
// (`publication-anchor-catalog:knowledge`) never collides with the
// catalog's own key, so two independently constructed instances read
// and write the identical underlying data either way.
export class CreateAnchorKnowledgeStoreUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const knowledgeStore = new LocalAnchorKnowledgeStore(storageProvider);
        return { knowledgeStore };
    }
}
