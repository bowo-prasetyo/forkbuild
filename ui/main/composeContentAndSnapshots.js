import { CreatePublicationEvidenceDiscoveryCoordinatorUseCase } from '../../application/publication/evidence/CreatePublicationEvidenceDiscoveryCoordinatorUseCase.js';
import { CreatePublicationKnowledgeSynchronizationCoordinatorUseCase } from '../../application/publication/evidence/CreatePublicationKnowledgeSynchronizationCoordinatorUseCase.js';
import { CreateSnapshotPlacementResolutionCoordinatorUseCase } from '../../application/snapshot/placement/CreateSnapshotPlacementResolutionCoordinatorUseCase.js';
import { CreateIpfsSnapshotPlacementViewUseCase } from '../../application/ipfs/CreateIpfsSnapshotPlacementViewUseCase.js';
import { CreateLocalSnapshotPlacementViewUseCase } from '../../application/snapshot/placement/CreateLocalSnapshotPlacementViewUseCase.js';
import { CreateSnapshotPlacementViewRegistryUseCase } from '../../application/snapshot/placement/CreateSnapshotPlacementViewRegistryUseCase.js';
import { IpfsContentStore } from '../../content/IpfsContentStore.js';
import { IpfsGatewayContentStore } from '../../content/IpfsGatewayContentStore.js';
import { IpfsGatewayFailoverContentStore } from '../../content/IpfsGatewayFailoverContentStore.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../../application/snapshot/placement/CreateSnapshotPlacementOrchestratorUseCase.js';
import { CreateSnapshotPlacementCreationCoordinatorUseCase } from '../../application/snapshot/placement/CreateSnapshotPlacementCreationCoordinatorUseCase.js';
import { CreatePreferredSnapshotPlacementCreationCoordinatorUseCase } from '../../application/snapshot/placement/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js';
import { SetRoleProviderPreferenceUseCase } from '../../application/settings/SetRoleProviderPreferenceUseCase.js';
import { RoleProviderRole } from '../../core/RoleProviderRole.js';
import { PublicationCatalogDiscoveryProvider } from '../../discovery/PublicationCatalogDiscoveryProvider.js';
import { PublicationCatalogContentResolver } from '../../discovery/PublicationCatalogContentResolver.js';
import { CheckLocalSnapshotContentAvailabilityUseCase } from '../../application/snapshot/materialization/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { StoreSnapshotContentUseCase } from '../../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { ImportPublicationSnapshotTransferPackageUseCase } from '../../application/snapshot/ImportPublicationSnapshotTransferPackageUseCase.js';
import { BuildPublicationSnapshotTransferPackageUseCase } from '../../application/snapshot/BuildPublicationSnapshotTransferPackageUseCase.js';
import { SnapshotContentMaterializationCoordinator } from '../../application/snapshot/materialization/SnapshotContentMaterializationCoordinator.js';
import { MaterializeSnapshotFromPlacementUseCase } from '../../application/snapshot/materialization/MaterializeSnapshotFromPlacementUseCase.js';
import { SnapshotPlacementMaterializationCoordinator } from '../../application/snapshot/placement/SnapshotPlacementMaterializationCoordinator.js';
import { CreatePublicationSnapshotContentPeerExchangeUseCase } from '../../application/snapshot/materialization/CreatePublicationSnapshotContentPeerExchangeUseCase.js';
import { MaterializeSnapshotFromPeerUseCase } from '../../application/snapshot/materialization/MaterializeSnapshotFromPeerUseCase.js';
import { SnapshotPeerMaterializationCoordinator } from '../../application/snapshot/materialization/SnapshotPeerMaterializationCoordinator.js';
import { CreatePublicationSnapshotPossessionPeerExchangeUseCase } from '../../application/snapshot/possession/CreatePublicationSnapshotPossessionPeerExchangeUseCase.js';
import { ObservePeerSnapshotPossessionUseCase } from '../../application/snapshot/possession/ObservePeerSnapshotPossessionUseCase.js';
import { SnapshotPeerPossessionCoordinator } from '../../application/snapshot/possession/SnapshotPeerPossessionCoordinator.js';
import { SnapshotMaterializationSelectionCoordinator } from '../../application/snapshot/materialization/SnapshotMaterializationSelectionCoordinator.js';
import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { DEFAULT_IPFS_GATEWAY_URL } from '../../core/IpfsGatewayConfiguration.js';
import { IpfsGatewayConfigurationStore } from '../../storage/IpfsGatewayConfigurationStore.js';
import { DEFAULT_IPFS_NODE_API_URL } from '../../core/IpfsNodeConfiguration.js';
import { IpfsNodeConfigurationStore } from '../../storage/IpfsNodeConfigurationStore.js';

// Composition root: IPFS gateway and node settings, the Snapshot placement
// views and store registries, the role provider preferences, and Snapshot
// content availability, transfer and materialization.
export function composeContentAndSnapshots({
    identityProvider, peerSessionManager, peerMessageBus, publicationContentStore, publicationCatalog,
    publicationAnchorDiscoveryCoordinator, publicationSnapshotPlacementCatalog, placementKnowledgeStore,
    publicationSnapshotPlacementPeerExchange, publicationSnapshotPlacementDiscoveryCoordinator
}) {
    // Resolution-only registry: ipfs placements resolve through public HTTPS
    // gateways, so no local daemon is needed. Kubo stays in the separate creation
    // registry below, because a gateway cannot put(). With two or more gateways
    // configured, reads fail over in order.
    const ipfsGatewayConfigurationStore = new IpfsGatewayConfigurationStore(new LocalStorageProvider());
    const resolvedIpfsGatewayUrl = (ipfsGatewayConfigurationStore.get() || { gatewayUrl: DEFAULT_IPFS_GATEWAY_URL }).gatewayUrl;
    // The node API URL governs writing to IPFS; the gateway setting above governs
    // reading. They are separate settings.
    const ipfsNodeConfigurationStore = new IpfsNodeConfigurationStore(new LocalStorageProvider());
    const resolvedIpfsNodeApiUrl = (ipfsNodeConfigurationStore.get() || { apiUrl: DEFAULT_IPFS_NODE_API_URL }).apiUrl;
    const resolvedIpfsGatewayUrls = (ipfsGatewayConfigurationStore.get() || { gatewayUrls: [DEFAULT_IPFS_GATEWAY_URL] }).gatewayUrls;
    function composeIpfsGatewayContentStore(gatewayUrls) {
        return gatewayUrls.length > 1
            ? new IpfsGatewayFailoverContentStore({ gatewayUrls })
            : new IpfsGatewayContentStore({ gatewayUrl: gatewayUrls[0] });
    }
    const {
        coordinator: publicationSnapshotPlacementResolutionCoordinator,
        storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry
    } = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
        placementCatalog: publicationSnapshotPlacementCatalog,
        stores: [publicationContentStore, composeIpfsGatewayContentStore(resolvedIpfsGatewayUrls)]
    });

    const { localSnapshotPlacementView } = new CreateLocalSnapshotPlacementViewUseCase().execute();
    const { ipfsSnapshotPlacementView } = new CreateIpfsSnapshotPlacementViewUseCase().execute();
    const { placementViewRegistry: snapshotPlacementViewRegistry } = new CreateSnapshotPlacementViewRegistryUseCase().execute({
        placementViews: [localSnapshotPlacementView, ipfsSnapshotPlacementView]
    });

    // Creation registry: ipfs uses Kubo, because creating needs put(). New
    // placements are also announced to connected peers; a peer failure never
    // undoes an already verified placement.
    const publicationCatalogDiscoveryProvider = new PublicationCatalogDiscoveryProvider(publicationCatalog);
    const publicationCatalogContentResolver = new PublicationCatalogContentResolver(publicationCatalog, publicationContentStore);
    const {
        createExternalSnapshotPlacementUseCase,
        storeRegistry: snapshotPlacementStoreRegistry
    } = new CreateSnapshotPlacementOrchestratorUseCase().execute({
        discoveryProvider: publicationCatalogDiscoveryProvider,
        contentResolver: publicationCatalogContentResolver,
        placementCatalog: publicationSnapshotPlacementCatalog,
        identityProvider,
        stores: [publicationContentStore, new IpfsContentStore({ apiUrl: resolvedIpfsNodeApiUrl })],
        knowledgeStore: placementKnowledgeStore,
        peerExchange: publicationSnapshotPlacementPeerExchange
    });
    const { coordinator: snapshotPlacementCreationCoordinator } = new CreateSnapshotPlacementCreationCoordinatorUseCase().execute({
        createExternalSnapshotPlacementUseCase,
        storeRegistry: snapshotPlacementStoreRegistry
    });

    // Adds the saved Content provider preference ("Use Preferred Provider").
    const {
        coordinator: preferredSnapshotPlacementCreationCoordinator,
        preferenceStore: roleProviderPreferenceStore
    } = new CreatePreferredSnapshotPlacementCreationCoordinatorUseCase().execute({
        snapshotPlacementCreationCoordinator,
        contentRegistry: snapshotPlacementStoreRegistry
    });

    const setRoleProviderPreferenceUseCase = new SetRoleProviderPreferenceUseCase({
        preferenceStore: roleProviderPreferenceStore
    });

    // The default announcement/discovery substrate, read once at boot. Unset or
    // unknown values fall back to 'nostr'.
    const announcementDiscoveryProviderPreference = roleProviderPreferenceStore.get(RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY);
    const resolvedAnnouncementDiscoveryProvider = (announcementDiscoveryProviderPreference
        && (announcementDiscoveryProviderPreference.providerKey === 'nostr' || announcementDiscoveryProviderPreference.providerKey === 'arweave'))
        ? announcementDiscoveryProviderPreference.providerKey
        : 'nostr';

    // Checks local possession only: no registry, placement or network.
    const localSnapshotContentAvailabilityUseCase = new CheckLocalSnapshotContentAvailabilityUseCase(publicationContentStore);

    // The one hash-verify-then-store boundary every materialization path shares.
    const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(publicationContentStore);

    const importPublicationSnapshotTransferPackageUseCase = new ImportPublicationSnapshotTransferPackageUseCase(storeSnapshotContentUseCase, publicationCatalog);

    const buildPublicationSnapshotTransferPackageUseCase = new BuildPublicationSnapshotTransferPackageUseCase({
        publicationCatalog,
        contentStore: publicationContentStore
    });
    const snapshotContentMaterializationCoordinator = new SnapshotContentMaterializationCoordinator(
        importPublicationSnapshotTransferPackageUseCase, buildPublicationSnapshotTransferPackageUseCase
    );

    // Injected as a function so the UI never imports the coordinator or content
    // store.
    const exportSnapshotCommand = (publicationId) => snapshotContentMaterializationCoordinator.export(publicationId);

    const materializeSnapshotFromPlacementUseCase = new MaterializeSnapshotFromPlacementUseCase(
        publicationSnapshotPlacementResolutionCoordinator, storeSnapshotContentUseCase, publicationCatalog
    );
    const snapshotPlacementMaterializationCoordinator = new SnapshotPlacementMaterializationCoordinator(materializeSnapshotFromPlacementUseCase);

    // Rides its own 'forkbuild:snapshot-content-transfer' namespace, independent of
    // publicationPeerContentExchange.
    const { peerExchange: publicationSnapshotContentPeerExchange } = new CreatePublicationSnapshotContentPeerExchangeUseCase().execute({
        contentStore: publicationContentStore,
        peerMessageBus,
        connectedPeerRegistry: peerSessionManager.registry
    });
    const materializeSnapshotFromPeerUseCase = new MaterializeSnapshotFromPeerUseCase(
        publicationSnapshotContentPeerExchange, storeSnapshotContentUseCase, publicationCatalog
    );
    const snapshotPeerMaterializationCoordinator = new SnapshotPeerMaterializationCoordinator(materializeSnapshotFromPeerUseCase);

    // Answers a peer's possession question with the same local check "Check Local
    // Snapshot" uses, never a second definition of possession.
    const { peerExchange: publicationSnapshotPossessionPeerExchange } = new CreatePublicationSnapshotPossessionPeerExchangeUseCase().execute({
        checkLocalSnapshotContentAvailabilityUseCase: localSnapshotContentAvailabilityUseCase,
        peerMessageBus,
        connectedPeerRegistry: peerSessionManager.registry
    });
    const observePeerSnapshotPossessionUseCase = new ObservePeerSnapshotPossessionUseCase(publicationSnapshotPossessionPeerExchange);
    const snapshotPeerPossessionCoordinator = new SnapshotPeerPossessionCoordinator(observePeerSnapshotPossessionUseCase);

    const snapshotMaterializationSelectionCoordinator = new SnapshotMaterializationSelectionCoordinator({
        packageCoordinator: snapshotContentMaterializationCoordinator,
        placementCoordinator: snapshotPlacementMaterializationCoordinator,
        peerCoordinator: snapshotPeerMaterializationCoordinator
    });

    const { coordinator: publicationEvidenceDiscoveryCoordinator } = new CreatePublicationEvidenceDiscoveryCoordinatorUseCase().execute({
        anchorDiscoveryCoordinator: publicationAnchorDiscoveryCoordinator,
        connectedPeerRegistry: peerSessionManager.registry
    });

    const { coordinator: publicationKnowledgeSynchronizationCoordinator } = new CreatePublicationKnowledgeSynchronizationCoordinatorUseCase().execute({
        anchorDiscoveryCoordinator: publicationAnchorDiscoveryCoordinator,
        placementDiscoveryCoordinator: publicationSnapshotPlacementDiscoveryCoordinator,
        connectedPeerRegistry: peerSessionManager.registry
    });

    return {
        ipfsGatewayConfigurationStore, ipfsNodeConfigurationStore, resolvedIpfsNodeApiUrl,
        resolvedIpfsGatewayUrls, composeIpfsGatewayContentStore,
        publicationSnapshotPlacementResolutionCoordinator, publicationSnapshotPlacementResolutionStoreRegistry,
        snapshotPlacementViewRegistry, publicationCatalogContentResolver, snapshotPlacementStoreRegistry,
        snapshotPlacementCreationCoordinator, roleProviderPreferenceStore,
        preferredSnapshotPlacementCreationCoordinator, setRoleProviderPreferenceUseCase,
        resolvedAnnouncementDiscoveryProvider, localSnapshotContentAvailabilityUseCase,
        storeSnapshotContentUseCase, snapshotContentMaterializationCoordinator, exportSnapshotCommand,
        snapshotPlacementMaterializationCoordinator, snapshotPeerMaterializationCoordinator,
        snapshotPeerPossessionCoordinator, snapshotMaterializationSelectionCoordinator,
        publicationEvidenceDiscoveryCoordinator, publicationKnowledgeSynchronizationCoordinator
    };
}
