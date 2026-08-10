import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from './SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from './PublishDocumentUseCase.js';
import { CreateCommandRegistryUseCase } from './CreateCommandRegistryUseCase.js';
import { ReplayDocumentUseCase } from './ReplayDocumentUseCase.js';
import { WorldNavigationSession } from './WorldNavigationSession.js';

// Builds the world exploration backend and returns a session factory, so
// ui/ never imports storage/, publisher/, or discovery/ directly.
//
// As of 0.1.39 this wires the persistence and publication pipelines
// (0.1.20A / 0.1.22) into World View. As of 0.1.40 it also wires replay:
// a CommandRegistry (all built-in command types) feeds a
// ReplayDocumentUseCase that the session uses for the Operation Timeline
// preview. ui/ still never imports any of it directly.
//
// identityProvider is optional: anonymous publishing works (author null),
// exactly as in the Editor.
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
        return {
            createSession(registry) {
                return new WorldNavigationSession({
                    registry,
                    loadPublicationDocumentUseCase,
                    worldLayoutProvider,
                    saveDocumentUseCase,
                    publishDocumentUseCase,
                    replayDocumentUseCase
                });
            }
        };
    }
}
