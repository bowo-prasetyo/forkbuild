import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from './SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from './PublishDocumentUseCase.js';
import { CreateCommandRegistryUseCase } from './CreateCommandRegistryUseCase.js';
import { ReplayDocumentUseCase } from './ReplayDocumentUseCase.js';
import { RestoreHistoryStateUseCase } from './RestoreHistoryStateUseCase.js';
import { DocumentCloneService } from './DocumentCloneService.js';
import { CopySelectionUseCase } from './CopySelectionUseCase.js';
import { PasteClipboardUseCase } from './PasteClipboardUseCase.js';
import { WorldNavigationSession } from './WorldNavigationSession.js';

// Builds the world exploration backend and returns a session factory, so
// ui/ never imports storage/, publisher/, or discovery/ directly.
//
// 0.2.5 Update: Wires the LocalSpatialIndexProvider and injects it into
// the LocalWorldLayoutProvider. The spatial index is now the single
// source of truth for where published worlds exist in shared space.
// We also expose the spatialIndexProvider on the return object so the
// UI layer can access spatial discovery/placement use cases without
// bypassing the application layer.
export class CreateWorldViewUseCase {
    execute(identityProvider = null) {
        const storageProvider = new LocalStorageProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        
        // 0.2.5: Wire the spatial index
        const spatialIndexProvider = new LocalSpatialIndexProvider(storageProvider);
        const worldLayoutProvider = new LocalWorldLayoutProvider(
            spatialIndexProvider, 
            discoveryProvider
        );
        
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(
            storageProvider
        );
        const saveDocumentUseCase = new SaveDocumentUseCase(storageProvider);
        const publishDocumentUseCase = new PublishDocumentUseCase(
            new LocalPublisherProvider(storageProvider),
            identityProvider
        );
        const replayDocumentUseCase = new ReplayDocumentUseCase(
            new CreateCommandRegistryUseCase().execute()
        );
        const restoreHistoryStateUseCase = new RestoreHistoryStateUseCase(
            replayDocumentUseCase
        );
        const documentCloneService = new DocumentCloneService();
        
        return {
            createSession(registry) {
                return new WorldNavigationSession({
                    registry,
                    loadPublicationDocumentUseCase,
                    worldLayoutProvider,
                    saveDocumentUseCase,
                    publishDocumentUseCase,
                    replayDocumentUseCase,
                    restoreHistoryStateUseCase,
                    identityProvider,
                    documentCloneService,
                    copySelectionUseCase: new CopySelectionUseCase(registry),
                    pasteClipboardUseCase: new PasteClipboardUseCase()
                });
            },
            // Expose the spatial index so the application layer can
            // construct spatial use cases (like PlacePublicationUseCase)
            // for the UI to consume.
            spatialIndexProvider
        };
    }
}
