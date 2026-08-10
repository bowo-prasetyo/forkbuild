import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from './SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from './PublishDocumentUseCase.js';
import { WorldNavigationSession } from './WorldNavigationSession.js';

// Builds the world exploration backend and returns a session factory, so
// ui/ never imports storage/, publisher/, or discovery/ directly.
//
// As of 0.1.39 this also wires the persistence and publication pipelines
// (0.1.20A / 0.1.22) into World View: SaveDocumentUseCase and
// PublishDocumentUseCase share the SAME LocalStorageProvider instance the
// loader and layout provider use — one storage graph, no duplicates.
// LocalPublisherProvider is constructed directly (rather than going
// through CreatePublisherUseCase) precisely so it can receive that shared
// provider.
//
// identityProvider is optional: anonymous publishing works (author null),
// exactly as in the Editor. ui/ passes the shared IdentityUseCase's
// provider via inject, so World View publishes under whoever is logged in.
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
        return {
            createSession(registry) {
                return new WorldNavigationSession({
                    registry,
                    loadPublicationDocumentUseCase,
                    worldLayoutProvider,
                    saveDocumentUseCase,
                    publishDocumentUseCase
                });
            }
        };
    }
}
