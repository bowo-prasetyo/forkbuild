import { SetArweaveGatewayConfigurationUseCase } from '../../application/settings/SetArweaveGatewayConfigurationUseCase.js';
import { bootstrapWorldDiscoveryRuntime } from '../../application/discovery/WorldDiscoveryRuntimeBootstrap.js';
import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { DEFAULT_ARWEAVE_GATEWAY_URL } from '../../core/ArweaveGatewayConfiguration.js';
import { ArweaveGatewayConfigurationStore } from '../../storage/ArweaveGatewayConfigurationStore.js';
import { SetIpfsGatewayConfigurationUseCase } from '../../application/settings/SetIpfsGatewayConfigurationUseCase.js';
import { SetIpfsNodeConfigurationUseCase } from '../../application/settings/SetIpfsNodeConfigurationUseCase.js';
import { DEFAULT_NOSTR_RELAY_URL } from '../../core/NostrRelayConfiguration.js';
import { NostrRelayConfigurationStore } from '../../storage/NostrRelayConfigurationStore.js';
import { SetNostrRelayConfigurationUseCase } from '../../application/settings/SetNostrRelayConfigurationUseCase.js';
import { LocalWorldEncounterMaterialSource } from '../../application/worldEncounter/LocalWorldEncounterMaterialSource.js';
import { PeerWorldEncounterMaterialSource } from '../../application/worldEncounter/PeerWorldEncounterMaterialSource.js';
import { composeWorldEncounterMaterialVerifier } from '../../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../../application/publication/distribution/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionLifecyclePersistence } from '../../application/publication/distribution/PublicationDistributionLifecyclePersistence.js';
import { PublicationDistributionLifecyclePersistenceBridge } from '../../application/publication/distribution/PublicationDistributionLifecyclePersistenceBridge.js';
import { PublicationDistributionLifecycleRestorer } from '../../application/publication/distribution/PublicationDistributionLifecycleRestorer.js';
import { hydratePublicationDistributionLifecycles } from '../../application/publication/distribution/PublicationDistributionLifecycleHydration.js';
import { createNostrRelayQueryClient } from '../../nostr/NostrRelayQueryClient.js';
import { LocalDiscoveryProvider } from '../../discovery/LocalDiscoveryProvider.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryServices, composeDecentralizedWorldEncounterMaterialDiscoveryRuntime } from '../../application/worldEncounter/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeDiscoverWorldEncounterPublicationCommand } from '../../application/worldEncounter/DiscoverWorldEncounterPublicationCommandComposition.js';
import { composeWorldEncounterLeadAssociationsQuery } from '../../application/worldEncounter/WorldEncounterLeadAssociationsQueryComposition.js';

// Composition root: the World discovery registry, World Encounter material
// sources and verification, the Arweave gateway, IPFS and Nostr relay
// settings, decentralized encounter discovery, and the restored publication
// distribution lifecycles.
export function composeWorldDiscovery({
    peerSessionManager, peerMessageBus, publicationCatalog, ipfsGatewayConfigurationStore,
    ipfsNodeConfigurationStore
}) {
    // The one World discovery registry. A peer's World contribution registers when
    // it sends and unregisters automatically when the peer disconnects.
    const worldDiscoveryRuntime = bootstrapWorldDiscoveryRuntime({
        connectedPeerRegistry: peerSessionManager.registry,
        peerMessageBus
    });

    // Material sources for World Encounters: local publications, peers, and (below)
    // decentralized retrieval. An unanswered peer request resolves to null
    // (UNAVAILABLE).
    const worldEncounterMaterialPeerSource = new PeerWorldEncounterMaterialSource(peerMessageBus, peerSessionManager.registry);
    const { verifier: worldEncounterMaterialVerifier } = composeWorldEncounterMaterialVerifier();

    // A saved gateway list overrides DEFAULT_ARWEAVE_GATEWAY_URL; the default is
    // never saved as if it were a preference. It applies only to reading published
    // content, never to where this replica writes. nostrRelayQueryClient may be
    // undefined where no WebSocket exists; discovery then degrades to no Nostr.
    const arweaveGatewayConfigurationStore = new ArweaveGatewayConfigurationStore(new LocalStorageProvider());
    const resolvedArweaveGatewayUrl = (arweaveGatewayConfigurationStore.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
    // Every configured gateway in priority order, used only by the two retrieval
    // sites (World Encounter material and Snapshot retrieval). Arweave Anchor's
    // publish/verify pair keeps using the single first gateway.
    const resolvedArweaveGatewayUrls = (arweaveGatewayConfigurationStore.get() || { gatewayUrls: [DEFAULT_ARWEAVE_GATEWAY_URL] }).gatewayUrls;
    const setArweaveGatewayConfigurationUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore });

    const setIpfsGatewayConfigurationUseCase = new SetIpfsGatewayConfigurationUseCase({ ipfsGatewayConfigurationStore });

    const setIpfsNodeConfigurationUseCase = new SetIpfsNodeConfigurationUseCase({ ipfsNodeConfigurationStore });

    // The one Nostr relay set for the whole app: discovery, Place Naming, Snapshot
    // and Publication announcement, and Commentary all use it. A saved list
    // overrides DEFAULT_NOSTR_RELAY_URL. Publishing fans out to every relay; it
    // never fails over in order.
    const nostrRelayConfigurationStore = new NostrRelayConfigurationStore(new LocalStorageProvider());
    const resolvedNostrRelayUrls = (nostrRelayConfigurationStore.get() || { relayUrls: [DEFAULT_NOSTR_RELAY_URL] }).relayUrls;
    const resolvedNostrRelayUrl = resolvedNostrRelayUrls[0];
    const setNostrRelayConfigurationUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore });





    const nostrRelayQueryClient = createNostrRelayQueryClient({});
    const decentralizedWorldDiscoveryServices = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
        nostrQueryImpl: nostrRelayQueryClient,
        nostrRelayUrls: resolvedNostrRelayUrls
    });
    const decentralizedWorldEncounterMaterialDiscoveryRuntime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
        discoveryServices: decentralizedWorldDiscoveryServices,
        local: new LocalWorldEncounterMaterialSource(new LocalStorageProvider()),
        peer: worldEncounterMaterialPeerSource,
        verifier: worldEncounterMaterialVerifier,
        arweaveResolverOptions: { gatewayUrls: resolvedArweaveGatewayUrls }
    });
    const worldDiscoveryLeadRegistry = decentralizedWorldEncounterMaterialDiscoveryRuntime.registry;
    const worldEncounterMaterialSources = decentralizedWorldEncounterMaterialDiscoveryRuntime.materialSources;

    // Reads the same 'forkbuild-publications' key as LocalWorldEncounterMaterialSource,
    // listed fresh on every call so evidence reflects current local publications.
    const worldEncounterPublicationEvidenceProvider = new LocalDiscoveryProvider(new LocalStorageProvider());
    const discoverWorldEncounterPublicationCommand = composeDiscoverWorldEncounterPublicationCommand({
        runtime: decentralizedWorldEncounterMaterialDiscoveryRuntime,
        discoveryProvider: worldEncounterPublicationEvidenceProvider
    });
    // Uses the same runtime and publication source as the discovery command above,
    // so the Location panel and discovery always agree.
    const worldEncounterLeadAssociationsQuery = composeWorldEncounterLeadAssociationsQuery({
        runtime: decentralizedWorldEncounterMaterialDiscoveryRuntime,
        discoveryProvider: worldEncounterPublicationEvidenceProvider
    });

    // Shared with createPublicationDistributionRuntimeProvider() below. Passed to
    // the canvas as the Discovery-tag field's initial value, never baked into the
    // command, so the field stays editable per call.
    const PUBLICATION_DISCOVERY_TAG = 'forkbuild-publication';

    // The one distribution lifecycle store: restored from what this replica
    // persisted for its cataloged publications, then bridged so later changes are
    // persisted too.
    const publicationDistributionLifecycleStore = new PublicationDistributionLifecycleMemoryStore();
    const publicationDistributionLifecyclePersistence = new PublicationDistributionLifecyclePersistence(new LocalStorageProvider());
    const publicationDistributionLifecycleRestorer = new PublicationDistributionLifecycleRestorer(
        publicationDistributionLifecyclePersistence,
        publicationDistributionLifecycleStore
    );
    const publicationDistributionLifecyclePersistenceBridge = new PublicationDistributionLifecyclePersistenceBridge(
        publicationDistributionLifecycleStore,
        publicationDistributionLifecyclePersistence
    );
    const restoredPublicationDistributionLifecycles = hydratePublicationDistributionLifecycles(
        publicationDistributionLifecycleRestorer,
        publicationCatalog.list().map((publication) => publication.id)
    );
    for (const { publicationId } of restoredPublicationDistributionLifecycles) {
        publicationDistributionLifecyclePersistenceBridge.observe(publicationId);
    }

    return {
        worldDiscoveryRuntime, worldEncounterMaterialVerifier, arweaveGatewayConfigurationStore,
        resolvedArweaveGatewayUrl, setArweaveGatewayConfigurationUseCase, setIpfsGatewayConfigurationUseCase,
        setIpfsNodeConfigurationUseCase, nostrRelayConfigurationStore, resolvedNostrRelayUrls,
        setNostrRelayConfigurationUseCase, nostrRelayQueryClient, worldDiscoveryLeadRegistry,
        worldEncounterMaterialSources, discoverWorldEncounterPublicationCommand,
        worldEncounterLeadAssociationsQuery, PUBLICATION_DISCOVERY_TAG, publicationDistributionLifecycleStore
    };
}
