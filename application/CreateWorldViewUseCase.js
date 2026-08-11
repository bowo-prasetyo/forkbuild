import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from './SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from './PublishDocumentUseCase.js';
import { CreateCommandRegistryUseCase } from './CreateCommandRegistryUseCase.js';
import { ReplayDocumentUseCase } from './ReplayDocumentUseCase.js';
import { RestoreHistoryStateUseCase } from './RestoreHistoryStateUseCase.js';
import { WorldNavigationSession } from './WorldNavigationSession.js';

// Builds the world exploration backend and returns a session factory, so
// ui/ never imports storage/, publisher/, or discovery/ directly.
//
// 0.1.39 wired persistence & publication; 0.1.40 wired replay and the
// Operation Timeline; 0.1.41 adds restoration: a RestoreHistoryStateUseCase
// built on the same ReplayDocumentUseCase the timeline preview uses — one
// reconstruction path for both, differing only in where the result lands
// (preview world vs live document). ui/ still never imports any of it.
export class CreateWorldViewUseCase {
    execute(identityProvider = null) {
        const storageProvider = new LocalStorageProvider();
        const discoveryProvider = new LocalDiscoveryProvider(storageProvider);
        const worldLayoutProvider = new LocalWorldLayoutProvider(discoveryProvider);
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
        return {
            createSession(registry) {
                return new WorldNavigationSession({
                    registry,
                    loadPublicationDocumentUseCase,
                    worldLayoutProvider,
                    saveDocumentUseCase,
                    publishDocumentUseCase,
                    replayDocumentUseCase,
                    restoreHistoryStateUseCase
                });
            }
        };
    }
}
