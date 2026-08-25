import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalPlacementKnowledgeStore } from './LocalPlacementKnowledgeStore.js';

// 0.8.24 — Snapshot Placement Provenance & Observation Boundary.
//
// Wires the concrete local storage for application/
// LocalPlacementKnowledgeStore.js, so ui/ never imports that file
// directly — the same composition-root shape application/
// CreateAnchorKnowledgeStoreUseCase.js already established for anchors
// (0.8.17). A fresh LocalStorageProvider is fine here even though
// application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js
// separately constructs its own for the catalog/store pair — application/
// LocalStorageProvider.js is a stateless wrapper over
// `window.localStorage`, and this store's own key
// (`publication-snapshot-placement-catalog:knowledge`) never collides
// with the catalog's own key, so two independently constructed instances
// read and write the identical underlying data either way.
export class CreatePlacementKnowledgeStoreUseCase {
    execute() {
        const storageProvider = new LocalStorageProvider();
        const knowledgeStore = new LocalPlacementKnowledgeStore(storageProvider);
        return { knowledgeStore };
    }
}
