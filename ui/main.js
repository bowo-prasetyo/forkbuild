import { createApp } from 'vue';
import App from './App.js';
import { router } from './router/index.js';
import { CreatePublicationCommentaryDistributionPeerExchangeUseCase } from '../application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js';
import { PublicationCommentaryRemoteNotificationBridge } from '../application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js';
import { NostrMultiRelayPublicationCommentaryDistribution } from '../application/nostr/NostrMultiRelayPublicationCommentaryDistribution.js';
import { DiscoverPublicationCommentaryFromNostrUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js';
import { PublicationCommentaryArweaveDistribution } from '../application/publication/commentary/PublicationCommentaryArweaveDistribution.js';
import { DiscoverPublicationCommentaryFromArweaveUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { CreatePublicationResolverUseCase } from '../application/publication/CreatePublicationResolverUseCase.js';
import { CreatePublicationPeerExchangeUseCase } from '../application/publication/CreatePublicationPeerExchangeUseCase.js';
import { CreatePeerContentExchangeUseCase } from '../application/peer/CreatePeerContentExchangeUseCase.js';
import { CreatePublicationResolutionCoordinatorUseCase } from '../application/publication/CreatePublicationResolutionCoordinatorUseCase.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/publication/CreatePublicationDisplayKindRegistryUseCase.js';
import { ReconstructPublicationDiscoveryUseCase } from '../application/publication/ReconstructPublicationDiscoveryUseCase.js';
import { CreateWorldEncounterPublicationAdmissionLogUseCase } from '../application/worldEncounter/CreateWorldEncounterPublicationAdmissionLogUseCase.js';
import { ReconstructWorldEncounterPublicationDiscoveryUseCase } from '../application/worldEncounter/ReconstructWorldEncounterPublicationDiscoveryUseCase.js';
import { CreatePublicationAnchorPeerExchangeUseCase } from '../application/anchoring/CreatePublicationAnchorPeerExchangeUseCase.js';
import { CreatePublicationAnchorDiscoveryCoordinatorUseCase } from '../application/anchoring/CreatePublicationAnchorDiscoveryCoordinatorUseCase.js';
import { CreatePublicationSnapshotPlacementPeerExchangeUseCase } from '../application/snapshot/placement/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js';
import { CreatePublicationSnapshotPlacementDiscoveryCoordinatorUseCase } from '../application/snapshot/placement/CreatePublicationSnapshotPlacementDiscoveryCoordinatorUseCase.js';
import { CreateIpfsRemotePublicationCoordinatorUseCase } from '../application/ipfs/CreateIpfsRemotePublicationCoordinatorUseCase.js';
import { CreateIpfsPublicationContentVerifierUseCase } from '../application/ipfs/CreateIpfsPublicationContentVerifierUseCase.js';
import { CreateIpfsPublicationContentVerificationCoordinatorUseCase } from '../application/ipfs/CreateIpfsPublicationContentVerificationCoordinatorUseCase.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { composeRefreshPublicationCommentaryCommand } from '../application/publication/commentary/RefreshPublicationCommentaryCommandComposition.js';
// The composition root's larger subsystems are built in ./main/, in the order
// they are called below.
import { composeIdentityAndPeers } from './main/composeIdentityAndPeers.js';
import { composeContentAndSnapshots } from './main/composeContentAndSnapshots.js';
import { composeAnchoring } from './main/composeAnchoring.js';
import { composeWorldDiscovery } from './main/composeWorldDiscovery.js';
import { composeInjectedWalletServices } from './main/composeInjectedWalletServices.js';
import { composePublicationDistribution } from './main/composePublicationDistribution.js';
import { composeSnapshotDiscovery } from './main/composeSnapshotDiscovery.js';

const {
    identityProvider, identityUseCase, createPublicationCommentaryCommand, getPublicationCommentariesCommand,
    iceServerConfigurationStore, turnServerConfigurationStore, setTurnServerConfigurationUseCase,
    setIceServerConfigurationUseCase, rendezvousConfigurationStore, setRendezvousConfigurationUseCase,
    bitcoinEsploraConfigurationStore, resolvedBitcoinEsploraApiUrl, setBitcoinEsploraConfigurationUseCase,
    peerSessionManager, peerRelationshipUseCase, peerReconnectionUseCase, findPeerUseCase, peerMessageBus,
    peerBlockUseCase, deviceAuthorizationUseCase, friendRelationshipUseCase,
    identityLifecyclePropagationUseCase, chatUseCase, peerPresenceUseCase, deviceConversationSyncUseCase,
    voiceUseCase
} = composeIdentityAndPeers();

// The one LocalPublicationCatalog instance; every collaborator below shares it.
const { publicationResolver, contentStore: publicationContentStore } = new CreatePublicationResolverUseCase().execute();
// Also starts PublicationPeerConnectionSync (no binding needed): an
// authenticated peer automatically receives this replica's cataloged
// Publications.
const { catalog: publicationCatalog, peerExchange: publicationPeerExchange } = new CreatePublicationPeerExchangeUseCase().execute({
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry
});
const { peerContentExchange: publicationPeerContentExchange } = new CreatePeerContentExchangeUseCase().execute({
    contentStore: publicationContentStore,
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry,
    publicationCatalog
});
const { coordinator: publicationResolutionCoordinator } = new CreatePublicationResolutionCoordinatorUseCase().execute({
    publicationResolver,
    peerContentExchange: publicationPeerContentExchange
});
// Kept separate from the durable stores: checking what a publication resolves
// to must never import it into them.
const { kindPlugins: publicationDisplayKindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();

// One app-wide instance: a per-view accumulator would lose admitted candidates
// whenever a person navigated away.
const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();

// Rebuilds the in-memory discovery index from the durable catalog before the
// provider is handed out. Performs no network retrieval.
await new ReconstructPublicationDiscoveryUseCase(
    publicationCatalog, publicationResolutionCoordinator, publicationDisplayKindPlugins, decentralizedPublicationDiscoveryProvider
).execute();

// World Encounter admissions keep their own durable log (the catalog stores a
// different envelope shape) and are rebuilt into the same discovery provider.
const { admissionLog: worldEncounterPublicationAdmissionLog } = new CreateWorldEncounterPublicationAdmissionLogUseCase().execute();
new ReconstructWorldEncounterPublicationDiscoveryUseCase(
    worldEncounterPublicationAdmissionLog, decentralizedPublicationDiscoveryProvider
).execute();

// Shares the commentary store's localStorage keys with
// createPublicationCommentaryCommand. The store keeps no cache, so a saved
// comment is immediately visible to announce().
const {
    exchange: publicationCommentaryDistributionExchange,
    peerExchange: publicationCommentaryDistributionPeerExchange
} = new CreatePublicationCommentaryDistributionPeerExchangeUseCase().execute({
    identityProvider,
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry
});

// Assigned later, once the Nostr host capabilities exist.
// addPublicationCommentaryCommand reads it only when called.
let publicationCommentaryNostrDistribution = null;
// Same, for Arweave.
let publicationCommentaryArweaveDistribution = null;

// Creates the comment locally first, then distributes it: a WebRTC announce,
// plus at most one asynchronous substrate (Nostr or Arweave, from
// input.discoveryProvider or the saved preference), never both. Distribution
// failures are swallowed; they never undo or fail the local create.
function addPublicationCommentaryCommand(input) {
    const result = createPublicationCommentaryCommand(input);
    try {
        publicationCommentaryDistributionPeerExchange.announce(result.commentary);
    } catch {
    }
    // Declared later in this file; read only when called.
    const discoveryProvider = (input && input.discoveryProvider) || resolvedAnnouncementDiscoveryProvider;
    const asynchronousDistribution = discoveryProvider === 'arweave'
        ? publicationCommentaryArweaveDistribution
        : publicationCommentaryNostrDistribution;
    if (asynchronousDistribution) {
        try {
            const envelopeJson = publicationCommentaryDistributionExchange.exportCommentary(result.commentary);
            // Not awaited; a rejection is swallowed like the announce failure above.
            asynchronousDistribution.publish(envelopeJson).catch(() => {});
        } catch {
        }
    }
    return result;
}

// Turns verified remote comment arrivals into the same publication.commented
// notification that local creation produces.
const publicationCommentaryRemoteNotificationBridge = new PublicationCommentaryRemoteNotificationBridge(
    new LocalDiscoveryProvider(new LocalStorageProvider()),
    identityProvider,
    (notificationEvent) => new NotificationEventStore(new LocalStorageProvider()).save(notificationEvent)
);
// onCommentaryReceived fires inside PeerMessageBus dispatch without subscriber
// isolation, so a notification failure must not propagate.
publicationCommentaryDistributionPeerExchange.onCommentaryReceived((result) => {
    try {
        publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result);
    } catch {
    }
});

// The one anchor catalog and knowledge store. Anchors from peers are cataloged
// on arrival; verification only runs on an explicit Verify click.
const { catalog: publicationAnchorCatalog, peerExchange: publicationAnchorPeerExchange, knowledgeStore: anchorKnowledgeStore } = new CreatePublicationAnchorPeerExchangeUseCase().execute({
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry
});

const { discoveryCoordinator: publicationAnchorDiscoveryCoordinator } = new CreatePublicationAnchorDiscoveryCoordinatorUseCase().execute({
    peerExchange: publicationAnchorPeerExchange
});

// The one placement catalog. Persisted records that no longer validate are
// pruned at construction. Resolution stays a separate, on-demand call.
const {
    catalog: publicationSnapshotPlacementCatalog,
    peerExchange: publicationSnapshotPlacementPeerExchange,
    knowledgeStore: placementKnowledgeStore
} = new CreatePublicationSnapshotPlacementPeerExchangeUseCase().execute({
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry
});
const { discoveryCoordinator: publicationSnapshotPlacementDiscoveryCoordinator } = new CreatePublicationSnapshotPlacementDiscoveryCoordinatorUseCase().execute({
    peerExchange: publicationSnapshotPlacementPeerExchange
});

const {
    ipfsGatewayConfigurationStore, ipfsNodeConfigurationStore, resolvedIpfsNodeApiUrl, resolvedIpfsGatewayUrls,
    composeIpfsGatewayContentStore, publicationSnapshotPlacementResolutionCoordinator,
    publicationSnapshotPlacementResolutionStoreRegistry, snapshotPlacementViewRegistry,
    publicationCatalogContentResolver, snapshotPlacementStoreRegistry, snapshotPlacementCreationCoordinator,
    roleProviderPreferenceStore, preferredSnapshotPlacementCreationCoordinator,
    setRoleProviderPreferenceUseCase, resolvedAnnouncementDiscoveryProvider,
    localSnapshotContentAvailabilityUseCase, storeSnapshotContentUseCase,
    snapshotContentMaterializationCoordinator, exportSnapshotCommand,
    snapshotPlacementMaterializationCoordinator, snapshotPeerMaterializationCoordinator,
    snapshotPeerPossessionCoordinator, snapshotMaterializationSelectionCoordinator,
    publicationEvidenceDiscoveryCoordinator, publicationKnowledgeSynchronizationCoordinator
} = composeContentAndSnapshots({
    identityProvider, peerSessionManager, peerMessageBus, publicationContentStore, publicationCatalog,
    publicationAnchorDiscoveryCoordinator, publicationSnapshotPlacementCatalog, placementKnowledgeStore,
    publicationSnapshotPlacementPeerExchange, publicationSnapshotPlacementDiscoveryCoordinator
});
const {
    externalAnchorProofVerifierRegistry, publicationEvidenceCoordinator, externalAnchorPublisherRegistry,
    publicationAnchorCreationCoordinator, preferredPublicationAnchorCreationCoordinator,
    externalAnchorEvidenceViewRegistry, bitcoinAnchorProofReconciliationView, bitcoinWalletConnection,
    bitcoinWalletFundingObserver, baseWalletConnection, baseNetworkObserver,
    basePublicationTransactionPlanCoordinator, baseInjectedProviderWalletTransactionSigner,
    baseReviewedSigningCoordinator, baseSignedTransactionFinalizationCoordinator,
    baseTransactionBroadcastCoordinator, baseAnchorPublisher, baseTransactionInclusionObservationCoordinator,
    bitcoinAnchorTransactionConstructionCoordinator, bitcoinAnchorTransactionReviewCoordinator,
    bitcoinAnchorReviewedSigningCoordinator, bitcoinAnchorSignedPsbtFinalizationCoordinator,
    bitcoinAnchorBroadcastCoordinator, bitcoinAnchorPublicationCoordinator,
    bitcoinAnchorConfirmationCoordinator
} = composeAnchoring({
    identityProvider, resolvedBitcoinEsploraApiUrl, publicationCatalog, publicationAnchorCatalog,
    anchorKnowledgeStore, roleProviderPreferenceStore
});

// Holds no credential between calls: it builds a fresh pinning provider from
// the configuration supplied on each explicit publish.
const { coordinator: ipfsRemotePublicationCoordinator } = new CreateIpfsRemotePublicationCoordinatorUseCase().execute();

const { ipfsPublicationContentVerifier } = new CreateIpfsPublicationContentVerifierUseCase().execute({
    contentStore: composeIpfsGatewayContentStore(resolvedIpfsGatewayUrls)
});
const { coordinator: ipfsPublicationContentVerificationCoordinator } =
    new CreateIpfsPublicationContentVerificationCoordinatorUseCase().execute({ ipfsPublicationContentVerifier });

const app = createApp(App);
app.provide('identityUseCase', identityUseCase);
app.provide('peerSessionManager', peerSessionManager);
app.provide('peerRelationshipUseCase', peerRelationshipUseCase);
app.provide('peerReconnectionUseCase', peerReconnectionUseCase);
app.provide('findPeerUseCase', findPeerUseCase);
app.provide('friendRelationshipUseCase', friendRelationshipUseCase);
app.provide('identityLifecyclePropagationUseCase', identityLifecyclePropagationUseCase);
app.provide('deviceAuthorizationUseCase', deviceAuthorizationUseCase);
app.provide('peerBlockUseCase', peerBlockUseCase);
app.provide('chatUseCase', chatUseCase);
app.provide('peerPresenceUseCase', peerPresenceUseCase);
app.provide('deviceConversationSyncUseCase', deviceConversationSyncUseCase);
app.provide('voiceUseCase', voiceUseCase);
app.provide('peerMessageBus', peerMessageBus);
app.provide('publicationResolver', publicationResolver);
app.provide('publicationCatalog', publicationCatalog);
app.provide('publicationPeerExchange', publicationPeerExchange);
app.provide('publicationPeerContentExchange', publicationPeerContentExchange);
app.provide('publicationResolutionCoordinator', publicationResolutionCoordinator);
app.provide('publicationDisplayKindPlugins', publicationDisplayKindPlugins);
app.provide('decentralizedPublicationDiscoveryProvider', decentralizedPublicationDiscoveryProvider);
app.provide('worldEncounterPublicationAdmissionLog', worldEncounterPublicationAdmissionLog);
app.provide('getPublicationCommentariesCommand', getPublicationCommentariesCommand);
app.provide('addPublicationCommentaryCommand', addPublicationCommentaryCommand);
app.provide('publicationAnchorCatalog', publicationAnchorCatalog);
app.provide('publicationEvidenceCoordinator', publicationEvidenceCoordinator);
app.provide('publicationAnchorCreationCoordinator', publicationAnchorCreationCoordinator);
app.provide('preferredPublicationAnchorCreationCoordinator', preferredPublicationAnchorCreationCoordinator);
app.provide('publicationAnchorPeerExchange', publicationAnchorPeerExchange);
app.provide('publicationAnchorDiscoveryCoordinator', publicationAnchorDiscoveryCoordinator);
app.provide('publicationEvidenceDiscoveryCoordinator', publicationEvidenceDiscoveryCoordinator);
app.provide('publicationKnowledgeSynchronizationCoordinator', publicationKnowledgeSynchronizationCoordinator);
app.provide('anchorKnowledgeStore', anchorKnowledgeStore);
app.provide('externalAnchorEvidenceViewRegistry', externalAnchorEvidenceViewRegistry);
app.provide('bitcoinAnchorProofReconciliationView', bitcoinAnchorProofReconciliationView);
app.provide('bitcoinWalletConnection', bitcoinWalletConnection);
app.provide('bitcoinWalletFundingObserver', bitcoinWalletFundingObserver);
app.provide('baseWalletConnection', baseWalletConnection);
app.provide('baseNetworkObserver', baseNetworkObserver);
app.provide('basePublicationTransactionPlanCoordinator', basePublicationTransactionPlanCoordinator);
app.provide('baseInjectedProviderWalletTransactionSigner', baseInjectedProviderWalletTransactionSigner);
app.provide('baseReviewedSigningCoordinator', baseReviewedSigningCoordinator);
app.provide('baseSignedTransactionFinalizationCoordinator', baseSignedTransactionFinalizationCoordinator);
app.provide('baseTransactionBroadcastCoordinator', baseTransactionBroadcastCoordinator);
app.provide('baseTransactionInclusionObservationCoordinator', baseTransactionInclusionObservationCoordinator);
app.provide('baseAnchorPublisher', baseAnchorPublisher);
app.provide('bitcoinAnchorTransactionConstructionCoordinator', bitcoinAnchorTransactionConstructionCoordinator);
app.provide('bitcoinAnchorTransactionReviewCoordinator', bitcoinAnchorTransactionReviewCoordinator);
app.provide('bitcoinAnchorReviewedSigningCoordinator', bitcoinAnchorReviewedSigningCoordinator);
app.provide('bitcoinAnchorSignedPsbtFinalizationCoordinator', bitcoinAnchorSignedPsbtFinalizationCoordinator);
app.provide('bitcoinAnchorBroadcastCoordinator', bitcoinAnchorBroadcastCoordinator);
app.provide('bitcoinAnchorPublicationCoordinator', bitcoinAnchorPublicationCoordinator);
app.provide('bitcoinAnchorConfirmationCoordinator', bitcoinAnchorConfirmationCoordinator);
app.provide('publicationCatalogContentResolver', publicationCatalogContentResolver);
// World Publications' bytes live in publicationContentStore, not in
// publicationCatalog (which only holds peer-announced envelopes), so readers
// look them up by contentReference here.
app.provide('publicationContentStore', publicationContentStore);
app.provide('ipfsRemotePublicationCoordinator', ipfsRemotePublicationCoordinator);
app.provide('ipfsPublicationContentVerificationCoordinator', ipfsPublicationContentVerificationCoordinator);
// The view falls back to its own instance if this is missing; providing one
// keeps a single shared instance app-wide.
app.provide('publicationObservationArchiveStorage', new LocalStoragePublicationObservationArchive());
app.provide('publicationSnapshotPlacementCatalog', publicationSnapshotPlacementCatalog);
app.provide('publicationSnapshotPlacementPeerExchange', publicationSnapshotPlacementPeerExchange);
app.provide('publicationSnapshotPlacementDiscoveryCoordinator', publicationSnapshotPlacementDiscoveryCoordinator);
app.provide('publicationSnapshotPlacementResolutionCoordinator', publicationSnapshotPlacementResolutionCoordinator);
app.provide('snapshotPlacementViewRegistry', snapshotPlacementViewRegistry);
app.provide('placementKnowledgeStore', placementKnowledgeStore);
app.provide('snapshotPlacementCreationCoordinator', snapshotPlacementCreationCoordinator);
app.provide('preferredSnapshotPlacementCreationCoordinator', preferredSnapshotPlacementCreationCoordinator);
app.provide('roleProviderPreferenceStore', roleProviderPreferenceStore);
app.provide('setRoleProviderPreferenceUseCase', setRoleProviderPreferenceUseCase);
// Only a seed for each Announcement/Discovery picker's own selection, never
// read again after the picker mounts.
app.provide('defaultAnnouncementDiscoveryProvider', resolvedAnnouncementDiscoveryProvider);
app.provide('localSnapshotContentAvailabilityUseCase', localSnapshotContentAvailabilityUseCase);
app.provide('snapshotContentMaterializationCoordinator', snapshotContentMaterializationCoordinator);
app.provide('exportSnapshotCommand', exportSnapshotCommand);
app.provide('snapshotPlacementMaterializationCoordinator', snapshotPlacementMaterializationCoordinator);
app.provide('snapshotPeerMaterializationCoordinator', snapshotPeerMaterializationCoordinator);
app.provide('snapshotPeerPossessionCoordinator', snapshotPeerPossessionCoordinator);
app.provide('snapshotMaterializationSelectionCoordinator', snapshotMaterializationSelectionCoordinator);

const {
    worldDiscoveryRuntime, worldEncounterMaterialVerifier, arweaveGatewayConfigurationStore,
    resolvedArweaveGatewayUrl, setArweaveGatewayConfigurationUseCase, setIpfsGatewayConfigurationUseCase,
    setIpfsNodeConfigurationUseCase, nostrRelayConfigurationStore, resolvedNostrRelayUrls,
    setNostrRelayConfigurationUseCase, nostrRelayQueryClient, worldDiscoveryLeadRegistry,
    worldEncounterMaterialSources, discoverWorldEncounterPublicationCommand,
    worldEncounterLeadAssociationsQuery, PUBLICATION_DISCOVERY_TAG, publicationDistributionLifecycleStore
} = composeWorldDiscovery({
    peerSessionManager, peerMessageBus, publicationCatalog, ipfsGatewayConfigurationStore,
    ipfsNodeConfigurationStore
});
app.provide('worldDiscoverySourceRegistry', worldDiscoveryRuntime.registry);
app.provide('arweaveGatewayConfigurationStore', arweaveGatewayConfigurationStore);
app.provide('setArweaveGatewayConfigurationUseCase', setArweaveGatewayConfigurationUseCase);
app.provide('ipfsGatewayConfigurationStore', ipfsGatewayConfigurationStore);
app.provide('setIpfsGatewayConfigurationUseCase', setIpfsGatewayConfigurationUseCase);
app.provide('ipfsNodeConfigurationStore', ipfsNodeConfigurationStore);
app.provide('setIpfsNodeConfigurationUseCase', setIpfsNodeConfigurationUseCase);
app.provide('nostrRelayConfigurationStore', nostrRelayConfigurationStore);
app.provide('setNostrRelayConfigurationUseCase', setNostrRelayConfigurationUseCase);
app.provide('iceServerConfigurationStore', iceServerConfigurationStore);
app.provide('setIceServerConfigurationUseCase', setIceServerConfigurationUseCase);
app.provide('turnServerConfigurationStore', turnServerConfigurationStore);
app.provide('setTurnServerConfigurationUseCase', setTurnServerConfigurationUseCase);
app.provide('rendezvousConfigurationStore', rendezvousConfigurationStore);
app.provide('setRendezvousConfigurationUseCase', setRendezvousConfigurationUseCase);
app.provide('bitcoinEsploraConfigurationStore', bitcoinEsploraConfigurationStore);
app.provide('setBitcoinEsploraConfigurationUseCase', setBitcoinEsploraConfigurationUseCase);
app.provide('worldEncounterMaterialSources', worldEncounterMaterialSources);
app.provide('worldEncounterMaterialVerifier', worldEncounterMaterialVerifier);
app.provide('worldDiscoveryLeadRegistry', worldDiscoveryLeadRegistry);
app.provide('discoverWorldEncounterPublicationCommand', discoverWorldEncounterPublicationCommand);
app.provide('worldEncounterLeadAssociationsQuery', worldEncounterLeadAssociationsQuery);
app.provide('publicationDiscoveryTag', PUBLICATION_DISCOVERY_TAG);
app.provide('publicationDistributionLifecycleStore', publicationDistributionLifecycleStore);

const {
    arweaveHostSigner, nostrHostPublisher, nostrPublicationRuntimeCapabilities
} = composeInjectedWalletServices({
    publicationSnapshotPlacementResolutionStoreRegistry, snapshotPlacementStoreRegistry,
    externalAnchorProofVerifierRegistry, externalAnchorPublisherRegistry, externalAnchorEvidenceViewRegistry,
    resolvedArweaveGatewayUrl
});

// Assigning this turns on the Nostr publish inside
// addPublicationCommentaryCommand; until then it is a silent no-op. Fans out
// across the unified relay set under its own 'forkbuild-commentary' tag.
publicationCommentaryNostrDistribution = new NostrMultiRelayPublicationCommentaryDistribution({
    publishImpl: nostrHostPublisher,
    queryImpl: nostrRelayQueryClient,
    relayUrls: resolvedNostrRelayUrls
});

// Separate, explicit acquisition, never part of
// getPublicationCommentariesCommand.
const discoverPublicationCommentaryFromNostrUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(
    publicationCommentaryNostrDistribution,
    publicationCommentaryDistributionExchange
);
// Feeds admitted comments into the same notification bridge WebRTC uses. One
// failed notification must not stop the rest of the batch.
function discoverPublicationCommentaryFromNostrCommand(publicationId) {
    return discoverPublicationCommentaryFromNostrUseCase.execute({ publicationId }).then((results) => {
        for (const result of results) {
            try {
                publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result);
            } catch {
            }
        }
        return results;
    });
}
app.provide('discoverPublicationCommentaryFromNostrCommand', discoverPublicationCommentaryFromNostrCommand);

// Assigning this enables the Arweave publish path of
// addPublicationCommentaryCommand when a caller selects 'arweave'.
publicationCommentaryArweaveDistribution = new PublicationCommentaryArweaveDistribution({
    signer: arweaveHostSigner,
    gatewayUrl: resolvedArweaveGatewayUrl
});

const discoverPublicationCommentaryFromArweaveUseCase = new DiscoverPublicationCommentaryFromArweaveUseCase(
    publicationCommentaryArweaveDistribution,
    publicationCommentaryDistributionExchange
);
// Same notification bridge and best-effort handling as the Nostr command.
function discoverPublicationCommentaryFromArweaveCommand(publicationId) {
    return discoverPublicationCommentaryFromArweaveUseCase.execute({ publicationId }).then((results) => {
        for (const result of results) {
            try {
                publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result);
            } catch {
            }
        }
        return results;
    });
}
app.provide('discoverPublicationCommentaryFromArweaveCommand', discoverPublicationCommentaryFromArweaveCommand);

const refreshPublicationCommentaryCommand = composeRefreshPublicationCommentaryCommand({
    sources: [
        { name: 'Nostr', discover: discoverPublicationCommentaryFromNostrCommand },
        { name: 'Arweave', discover: discoverPublicationCommentaryFromArweaveCommand }
    ]
});
app.provide('refreshPublicationCommentaryCommand', refreshPublicationCommentaryCommand);

const {
    arweaveAnnouncementUploadTaggedTransaction, publicationDistributionCommand,
    multiRelayNostrPublicationDistributionCommand, resolveSnapshotDiscoveryPublisher,
    snapshotDistributionCommand, snapshotDiscoveryPublisher, snapshotDistributionAvailableStorageTypes
} = composePublicationDistribution({
    resolvedIpfsNodeApiUrl, snapshotPlacementStoreRegistry, resolvedAnnouncementDiscoveryProvider,
    resolvedArweaveGatewayUrl, resolvedNostrRelayUrls, PUBLICATION_DISCOVERY_TAG,
    publicationDistributionLifecycleStore, arweaveHostSigner, nostrHostPublisher,
    nostrPublicationRuntimeCapabilities
});
app.provide('publicationDistributionCommand', publicationDistributionCommand);
app.provide('multiRelayNostrPublicationDistributionCommand', multiRelayNostrPublicationDistributionCommand);
app.provide('resolveSnapshotDiscoveryPublisher', resolveSnapshotDiscoveryPublisher);
app.provide('snapshotDistributionCommand', snapshotDistributionCommand);
app.provide('snapshotDiscoveryPublisher', snapshotDiscoveryPublisher);
app.provide('snapshotDistributionAvailableStorageTypes', snapshotDistributionAvailableStorageTypes);

const {
    resolvedContentDistributionProvider, publishPlaceNamingClaimToNostrCommand, discoverSnapshotCommand,
    snapshotCandidateDiscoveryQueryService, discoverSnapshotCandidatesCommand,
    discoverSnapshotCandidatesWithOutcomeCommand, worldSnapshotDiscoveryMonitor,
    placeNamingDiscoveryQueryService, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand
} = composeSnapshotDiscovery({
    publicationSnapshotPlacementCatalog, publicationSnapshotPlacementResolutionStoreRegistry,
    roleProviderPreferenceStore, resolvedAnnouncementDiscoveryProvider, storeSnapshotContentUseCase,
    resolvedArweaveGatewayUrl, resolvedNostrRelayUrls, nostrRelayQueryClient, nostrHostPublisher,
    arweaveAnnouncementUploadTaggedTransaction, snapshotDistributionAvailableStorageTypes
});
app.provide('defaultContentDistributionProvider', resolvedContentDistributionProvider);
app.provide('publishPlaceNamingClaimToNostrCommand', publishPlaceNamingClaimToNostrCommand);
app.provide('discoverSnapshotCommand', discoverSnapshotCommand);
app.provide('snapshotCandidateDiscoveryQueryService', snapshotCandidateDiscoveryQueryService);
app.provide('discoverSnapshotCandidatesCommand', discoverSnapshotCandidatesCommand);
app.provide('discoverSnapshotCandidatesWithOutcomeCommand', discoverSnapshotCandidatesWithOutcomeCommand);
app.provide('worldSnapshotDiscoveryMonitor', worldSnapshotDiscoveryMonitor);
app.provide('placeNamingDiscoveryQueryService', placeNamingDiscoveryQueryService);
app.provide('resolveSelectedSnapshotCommand', resolveSelectedSnapshotCommand);
app.provide('materializeSelectedSnapshotCommand', materializeSelectedSnapshotCommand);

app.use(router);
app.mount('#app');
