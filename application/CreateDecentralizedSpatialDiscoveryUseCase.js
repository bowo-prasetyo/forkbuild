import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalSpatialIndexStore } from '../spatial/LocalSpatialIndexStore.js';
import { SpatialIndexBuilder } from '../spatial/SpatialIndexBuilder.js';
import { DecentralizedSpatialDiscoveryProvider } from '../spatial/DecentralizedSpatialDiscoveryProvider.js';
import { LocalPlacementRegistry } from '../placement/LocalPlacementRegistry.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalContentResolver } from '../discovery/LocalContentResolver.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { DiscoverWorldAreaUseCase } from './DiscoverWorldAreaUseCase.js';
import { ResolvePublicationUseCase } from './ResolvePublicationUseCase.js';
import { PlacePublicationUseCase } from './PlacePublicationUseCase.js';
import { MoveWorldPlacementUseCase } from './MoveWorldPlacementUseCase.js';
import { RemoveWorldPlacementUseCase } from './RemoveWorldPlacementUseCase.js';
import { RebuildSpatialIndexUseCase } from './RebuildSpatialIndexUseCase.js';
import { VerifyPlacementUseCase } from './VerifyPlacementUseCase.js';
import { VerifyPublicationUseCase } from './VerifyPublicationUseCase.js';
import { LoadPublicationDocumentUseCase } from './LoadPublicationDocumentUseCase.js';
import { CreateBrickRegistryUseCase } from './CreateBrickRegistryUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// Wires the DECENTRALIZED spatial discovery stack (0.2.15) with the
// 0.2.16 trust layer:
//
//   - the index builder signs roots with the wired IdentityProvider
//   - the discovery provider verifies root + placement signatures
//     through the LocalAuthorizationVerifier
//   - place/move sign every placement revision they create
//
// Pass options.indexAuthorityIdentity to pin which authority's index
// roots are accepted (multi-node hardening arrives in 0.2.17/0.2.18).
export class CreateDecentralizedSpatialDiscoveryUseCase {
    execute(discoveryProvider = null, identityProvider = null, options = {}) {
        const storageProvider = new LocalStorageProvider();
        const spatialIndexProvider = new LocalSpatialIndexProvider(storageProvider);
        const placementRegistry = new LocalPlacementRegistry(
            storageProvider,
            spatialIndexProvider
        );
        const publisherProvider = new LocalPublisherProvider(storageProvider);
        const localDiscoveryProvider = discoveryProvider
            || new LocalDiscoveryProvider(storageProvider);
        const documentSerializer = new DocumentSerializer();
        const contentResolver = new LocalContentResolver(publisherProvider);

        const spatialIndexStore = new LocalSpatialIndexStore(storageProvider);
        const spatialIndexBuilder = new SpatialIndexBuilder(spatialIndexStore, {
            cellSize: options.cellSize,
            identityProvider
        });
        const authorizationVerifier = new LocalAuthorizationVerifier({
            indexAuthorityIdentity: options.indexAuthorityIdentity || null
        });
        const spatialDiscoveryProvider = new DecentralizedSpatialDiscoveryProvider({
            spatialIndexStore,
            placementRegistry,
            authorizationVerifier
        });

        return {
            spatialDiscoveryProvider,
            contentResolver,
            placementRegistry,
            spatialIndexProvider,
            spatialIndexStore,
            spatialIndexBuilder,
            authorizationVerifier,
            discoverWorldAreaUseCase: new DiscoverWorldAreaUseCase(
                spatialDiscoveryProvider
            ),
            resolvePublicationUseCase: new ResolvePublicationUseCase(
                contentResolver,
                localDiscoveryProvider,
                documentSerializer
            ),
            verifyPlacementUseCase: new VerifyPlacementUseCase(authorizationVerifier),
            verifyPublicationUseCase: new VerifyPublicationUseCase(authorizationVerifier),
            placePublicationUseCase: new PlacePublicationUseCase(
                spatialIndexProvider,
                localDiscoveryProvider,
                new LoadPublicationDocumentUseCase(storageProvider),
                new CreateBrickRegistryUseCase().execute(),
                placementRegistry,
				identityProvider,
				spatialIndexBuilder // FIX: Pass the builder
            ),
            moveWorldPlacementUseCase: new MoveWorldPlacementUseCase(
                spatialIndexProvider,
                placementRegistry,
                spatialIndexBuilder,
                identityProvider
            ),
            removeWorldPlacementUseCase: new RemoveWorldPlacementUseCase(
                spatialIndexProvider,
                placementRegistry
            ),
            rebuildSpatialIndexUseCase: new RebuildSpatialIndexUseCase(
                spatialIndexBuilder,
                placementRegistry
            )
        };
    }
}
