import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from './SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from './PublishDocumentUseCase.js';
import { ForkPublishedWorldUseCase } from './ForkPublishedWorldUseCase.js';
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
// 0.2.8: Wires ForkPublishedWorldUseCase so the World View can fork a
// published snapshot into a new editable Document without ever mutating
// the source Publication, its snapshot, or its WorldPlacement.
export class CreateWorldViewUseCase {
    execute(identityProvider = null) {
        const storageProvider = new LocalStorageProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storageProvider);
        const worldLayoutProvider = new LocalWorldLayoutProvider(
            spatialIndexProvider,
            discoveryProvider
        );
        const publisherProvider = new LocalPublisherProvider(storageProvider);
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(
            storageProvider
        );
        const saveDocumentUseCase = new SaveDocumentUseCase(storageProvider);
        const publishDocumentUseCase = new PublishDocumentUseCase(
            publisherProvider,
            identityProvider
        );
        const forkPublishedWorldUseCase = new ForkPublishedWorldUseCase(
            publisherProvider,
            undefined,
            new DocumentCloneService()
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
                    forkPublishedWorldUseCase,
                    replayDocumentUseCase,
                    restoreHistoryStateUseCase,
                    identityProvider,
                    documentCloneService,
                    copySelectionUseCase: new CopySelectionUseCase(registry),
                    pasteClipboardUseCase: new PasteClipboardUseCase()
                });
            },
            spatialIndexProvider,
            forkPublishedWorldUseCase
        };
    }
}
