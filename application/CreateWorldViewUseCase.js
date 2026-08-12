import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { LoadPublishedSnapshotUseCase } from './LoadPublishedSnapshotUseCase.js';
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
// 0.1.39 wired persistence & publication; 0.1.40 wired replay and the
// Operation Timeline; 0.1.41 wired restoration; 0.1.42 wires cloning,
// forking, and the clipboard: a DocumentCloneService plus
// CopySelectionUseCase / PasteClipboardUseCase, all constructed here and
// injected into the session. identityProvider flows to the session so
// forks/clones can attribute authorship to whoever is logged in.
export class CreateWorldViewUseCase {
    execute(identityProvider = null) {
    	const { spatialIndexProvider } = new CreateWorldLayoutUseCase().execute();
        const storageProvider = new LocalStorageProvider();
        const publisherProvider = new LocalPublisherProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const worldLayoutProvider = new LocalWorldLayoutProvider(discoveryProvider);
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(
            storageProvider
        );
        const loadPublishedSnapshotUseCase = new LoadPublishedSnapshotUseCase(
            publisherProvider
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
                    loadPublishedSnapshotUseCase,
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
            }
        };
    }
}
