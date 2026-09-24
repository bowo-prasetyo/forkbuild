import { createApp } from 'vue';
import App from './App.js';
import { router } from './router/index.js';
import { CreateIdentityProviderUseCase } from '../application/identity/CreateIdentityProviderUseCase.js';
import { IdentityUseCase } from '../application/identity/IdentityUseCase.js';
import { CreatePublicationCommentaryUseCase } from '../application/publication/commentary/CreatePublicationCommentaryUseCase.js';
import { CreatePublicationCommentaryDistributionPeerExchangeUseCase } from '../application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js';
import { PublicationCommentaryRemoteNotificationBridge } from '../application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js';
import { NostrMultiRelayPublicationCommentaryDistribution } from '../application/nostr/NostrMultiRelayPublicationCommentaryDistribution.js';
import { DiscoverPublicationCommentaryFromNostrUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js';
import { PublicationCommentaryArweaveDistribution } from '../application/publication/commentary/PublicationCommentaryArweaveDistribution.js';
import { DiscoverPublicationCommentaryFromArweaveUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { PeerSessionManager } from '../application/peer/PeerSessionManager.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { WebSocketRendezvousTransport } from '../peer/WebSocketRendezvousTransport.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { DiscoveryBootstrap } from '../peer/DiscoveryBootstrap.js';
import { DEFAULT_ICE_SERVERS, fetchIceServers } from '../peer/IceServerConfig.js';
import { IceServerConfigurationStore } from '../storage/IceServerConfigurationStore.js';
import { SetIceServerConfigurationUseCase } from '../application/settings/SetIceServerConfigurationUseCase.js';
import { TurnServerConfigurationStore } from '../storage/TurnServerConfigurationStore.js';
import { resolveTurnServerConfiguration } from '../application/settings/TurnServerConfigurationProvider.js';
import { SetTurnServerConfigurationUseCase } from '../application/settings/SetTurnServerConfigurationUseCase.js';
import { DEFAULT_RENDEZVOUS_URLS } from '../peer/RendezvousConfig.js';
import { RendezvousConfigurationStore } from '../storage/RendezvousConfigurationStore.js';
import { SetRendezvousConfigurationUseCase } from '../application/settings/SetRendezvousConfigurationUseCase.js';
import { CreatePeerRelationshipUseCase } from '../application/peer/CreatePeerRelationshipUseCase.js';
import { PeerReconnectionUseCase } from '../application/peer/PeerReconnectionUseCase.js';
import { FindPeerUseCase } from '../application/peer/FindPeerUseCase.js';
import { AutoConnectKnownPeersUseCase } from '../application/peer/AutoConnectKnownPeersUseCase.js';
import { CreateFriendRelationshipUseCase } from '../application/identity/CreateFriendRelationshipUseCase.js';
import { CreateIdentityLifecyclePropagationUseCase } from '../application/identity/CreateIdentityLifecyclePropagationUseCase.js';
import { CreateDeviceAuthorizationUseCase } from '../application/identity/CreateDeviceAuthorizationUseCase.js';
import { CreatePeerBlockUseCase } from '../application/peer/CreatePeerBlockUseCase.js';
import { ChatUseCase } from '../application/chat/ChatUseCase.js';
import { CreateChatOutboxUseCase } from '../application/chat/CreateChatOutboxUseCase.js';
import { CreateConversationStoreUseCase } from '../application/chat/CreateConversationStoreUseCase.js';
import { CreateConversationReadTrackerUseCase } from '../application/chat/CreateConversationReadTrackerUseCase.js';
import { CreateConversationReadOutboxUseCase } from '../application/chat/CreateConversationReadOutboxUseCase.js';
import { CreateRemoteReadReceiptStoreUseCase } from '../application/chat/CreateRemoteReadReceiptStoreUseCase.js';
import { PeerPresenceUseCase } from '../application/presence/PeerPresenceUseCase.js';
import { VoiceUseCase } from '../application/chat/VoiceUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { CreateSiblingReadStateStoreUseCase } from '../application/chat/CreateSiblingReadStateStoreUseCase.js';
import { DeviceConversationSyncUseCase } from '../application/chat/DeviceConversationSyncUseCase.js';
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
import { CreatePublicationEvidenceDiscoveryCoordinatorUseCase } from '../application/publication/evidence/CreatePublicationEvidenceDiscoveryCoordinatorUseCase.js';
import { CreatePublicationKnowledgeSynchronizationCoordinatorUseCase } from '../application/publication/evidence/CreatePublicationKnowledgeSynchronizationCoordinatorUseCase.js';
import { CreateExternalAnchorVerifierUseCase } from '../application/anchoring/CreateExternalAnchorVerifierUseCase.js';
import { CreateBitcoinAnchorProofVerifierUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorProofVerifierUseCase.js';
import { CreatePublicationEvidenceCoordinatorUseCase } from '../application/publication/evidence/CreatePublicationEvidenceCoordinatorUseCase.js';
import { CreateBitcoinAnchorPublisherUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorPublisherUseCase.js';
import { CreateExternalPublicationAnchorOrchestratorUseCase } from '../application/anchoring/CreateExternalPublicationAnchorOrchestratorUseCase.js';
import { CreatePublicationAnchorCreationCoordinatorUseCase } from '../application/anchoring/CreatePublicationAnchorCreationCoordinatorUseCase.js';
import { CreateBitcoinAnchorEvidenceViewUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorEvidenceViewUseCase.js';
import { CreateExternalAnchorEvidenceViewRegistryUseCase } from '../application/anchoring/CreateExternalAnchorEvidenceViewRegistryUseCase.js';
import { CreateArweaveAnchorPublisherUseCase } from '../application/anchoring/CreateArweaveAnchorPublisherUseCase.js';
import { CreateArweaveAnchorProofVerifierUseCase } from '../application/anchoring/CreateArweaveAnchorProofVerifierUseCase.js';
import { CreateArweaveAnchorEvidenceViewUseCase } from '../application/anchoring/CreateArweaveAnchorEvidenceViewUseCase.js';
import { CreateBaseAnchorEvidenceViewUseCase } from '../application/anchoring/base/CreateBaseAnchorEvidenceViewUseCase.js';
import { CreateBitcoinEsploraTransactionConfirmationObserverUseCase } from '../application/anchoring/bitcoin/CreateBitcoinEsploraTransactionConfirmationObserverUseCase.js';
import { CreateBitcoinAnchorConfirmationObserverUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorConfirmationObserverUseCase.js';
import { CreateBitcoinAnchorProofReconciliationViewUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorProofReconciliationViewUseCase.js';
import { CreateBitcoinInjectedProviderWalletAdapterUseCase } from '../application/anchoring/bitcoin/CreateBitcoinInjectedProviderWalletAdapterUseCase.js';
import { CreateBitcoinWalletConnectionUseCase } from '../application/anchoring/bitcoin/CreateBitcoinWalletConnectionUseCase.js';
import { CreateBitcoinEsploraWalletFundingSourceUseCase } from '../application/anchoring/bitcoin/CreateBitcoinEsploraWalletFundingSourceUseCase.js';
import { CreateBitcoinWalletFundingObserverUseCase } from '../application/anchoring/bitcoin/CreateBitcoinWalletFundingObserverUseCase.js';
import { CreateBitcoinAnchorTransactionBuilderUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorTransactionBuilderUseCase.js';
import { CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase.js';
import { CreateBitcoinAnchorPsbtBuilderUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorPsbtBuilderUseCase.js';
import { CreateBitcoinAnchorTransactionReviewCoordinatorUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorTransactionReviewCoordinatorUseCase.js';
import { CreateBitcoinAnchorReviewedSigningCoordinatorUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorReviewedSigningCoordinatorUseCase.js';
import { CreateBitcoinAnchorSignedPsbtFinalizerUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorSignedPsbtFinalizerUseCase.js';
import { CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase.js';
import { CreateBitcoinEsploraTransactionBroadcasterUseCase } from '../application/anchoring/bitcoin/CreateBitcoinEsploraTransactionBroadcasterUseCase.js';
import { CreateBitcoinAnchorTransactionBroadcasterUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorTransactionBroadcasterUseCase.js';
import { CreateBaseInjectedProviderWalletAdapterUseCase } from '../application/anchoring/base/CreateBaseInjectedProviderWalletAdapterUseCase.js';
import { CreateBaseWalletConnectionUseCase } from '../application/anchoring/base/CreateBaseWalletConnectionUseCase.js';
import { CreateBaseJsonRpcClientUseCase } from '../application/anchoring/base/CreateBaseJsonRpcClientUseCase.js';
import { CreateBaseAnchorProofVerifierUseCase } from '../application/anchoring/base/CreateBaseAnchorProofVerifierUseCase.js';
import { CreateBaseNetworkObserverUseCase } from '../application/anchoring/base/CreateBaseNetworkObserverUseCase.js';
import { CreateBasePublicationTransactionPlannerUseCase } from '../application/anchoring/base/CreateBasePublicationTransactionPlannerUseCase.js';
import { CreateBasePublicationTransactionPlanCoordinatorUseCase } from '../application/anchoring/base/CreateBasePublicationTransactionPlanCoordinatorUseCase.js';
import { CreateBaseInjectedProviderWalletTransactionSignerUseCase } from '../application/anchoring/base/CreateBaseInjectedProviderWalletTransactionSignerUseCase.js';
import { CreateBaseReviewedSigningCoordinatorUseCase } from '../application/anchoring/base/CreateBaseReviewedSigningCoordinatorUseCase.js';
import { CreateBaseSignedTransactionFinalizerUseCase } from '../application/anchoring/base/CreateBaseSignedTransactionFinalizerUseCase.js';
import { CreateBaseSignedTransactionFinalizationCoordinatorUseCase } from '../application/anchoring/base/CreateBaseSignedTransactionFinalizationCoordinatorUseCase.js';
import { CreateBaseTransactionBroadcasterUseCase } from '../application/anchoring/base/CreateBaseTransactionBroadcasterUseCase.js';
import { CreateBaseAnchorPublisherUseCase } from '../application/anchoring/base/CreateBaseAnchorPublisherUseCase.js';
import { CreateBaseTransactionBroadcastCoordinatorUseCase } from '../application/anchoring/base/CreateBaseTransactionBroadcastCoordinatorUseCase.js';
import { CreateBaseTransactionInclusionObserverUseCase } from '../application/anchoring/base/CreateBaseTransactionInclusionObserverUseCase.js';
import { CreateBaseTransactionInclusionObservationCoordinatorUseCase } from '../application/anchoring/base/CreateBaseTransactionInclusionObservationCoordinatorUseCase.js';
import { CreateBitcoinAnchorBroadcastCoordinatorUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorBroadcastCoordinatorUseCase.js';
import { CreateBitcoinAnchorPublicationCoordinatorUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorPublicationCoordinatorUseCase.js';
import { CreateBitcoinAnchorConfirmationCoordinatorUseCase } from '../application/anchoring/bitcoin/CreateBitcoinAnchorConfirmationCoordinatorUseCase.js';
import { CreateIpfsRemotePublicationCoordinatorUseCase } from '../application/ipfs/CreateIpfsRemotePublicationCoordinatorUseCase.js';
import { CreateIpfsPublicationContentVerifierUseCase } from '../application/ipfs/CreateIpfsPublicationContentVerifierUseCase.js';
import { CreateIpfsPublicationContentVerificationCoordinatorUseCase } from '../application/ipfs/CreateIpfsPublicationContentVerificationCoordinatorUseCase.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import { CreateSnapshotPlacementResolutionCoordinatorUseCase } from '../application/snapshot/placement/CreateSnapshotPlacementResolutionCoordinatorUseCase.js';
import { CreateIpfsSnapshotPlacementViewUseCase } from '../application/ipfs/CreateIpfsSnapshotPlacementViewUseCase.js';
import { CreateLocalSnapshotPlacementViewUseCase } from '../application/snapshot/placement/CreateLocalSnapshotPlacementViewUseCase.js';
import { CreateSnapshotPlacementViewRegistryUseCase } from '../application/snapshot/placement/CreateSnapshotPlacementViewRegistryUseCase.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';
import { IpfsGatewayFailoverContentStore } from '../content/IpfsGatewayFailoverContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/snapshot/placement/CreateSnapshotPlacementOrchestratorUseCase.js';
import { CreateSnapshotPlacementCreationCoordinatorUseCase } from '../application/snapshot/placement/CreateSnapshotPlacementCreationCoordinatorUseCase.js';
import { CreatePreferredSnapshotPlacementCreationCoordinatorUseCase } from '../application/snapshot/placement/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js';
import { CreatePreferredPublicationAnchorCreationCoordinatorUseCase } from '../application/anchoring/CreatePreferredPublicationAnchorCreationCoordinatorUseCase.js';
import { SetRoleProviderPreferenceUseCase } from '../application/settings/SetRoleProviderPreferenceUseCase.js';
import { resolveSavedProviderDefault } from '../application/settings/SavedProviderDefaultChoice.js';
import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { SetArweaveGatewayConfigurationUseCase } from '../application/settings/SetArweaveGatewayConfigurationUseCase.js';
import { PublicationCatalogDiscoveryProvider } from '../discovery/PublicationCatalogDiscoveryProvider.js';
import { PublicationCatalogContentResolver } from '../discovery/PublicationCatalogContentResolver.js';
import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/snapshot/materialization/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { ImportPublicationSnapshotTransferPackageUseCase } from '../application/snapshot/ImportPublicationSnapshotTransferPackageUseCase.js';
import { BuildPublicationSnapshotTransferPackageUseCase } from '../application/snapshot/BuildPublicationSnapshotTransferPackageUseCase.js';
import { SnapshotContentMaterializationCoordinator } from '../application/snapshot/materialization/SnapshotContentMaterializationCoordinator.js';
import { MaterializeSnapshotFromPlacementUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromPlacementUseCase.js';
import { SnapshotPlacementMaterializationCoordinator } from '../application/snapshot/placement/SnapshotPlacementMaterializationCoordinator.js';
import { CreatePublicationSnapshotContentPeerExchangeUseCase } from '../application/snapshot/materialization/CreatePublicationSnapshotContentPeerExchangeUseCase.js';
import { MaterializeSnapshotFromPeerUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromPeerUseCase.js';
import { SnapshotPeerMaterializationCoordinator } from '../application/snapshot/materialization/SnapshotPeerMaterializationCoordinator.js';
import { CreatePublicationSnapshotPossessionPeerExchangeUseCase } from '../application/snapshot/possession/CreatePublicationSnapshotPossessionPeerExchangeUseCase.js';
import { ObservePeerSnapshotPossessionUseCase } from '../application/snapshot/possession/ObservePeerSnapshotPossessionUseCase.js';
import { SnapshotPeerPossessionCoordinator } from '../application/snapshot/possession/SnapshotPeerPossessionCoordinator.js';
import { SnapshotMaterializationSelectionCoordinator } from '../application/snapshot/materialization/SnapshotMaterializationSelectionCoordinator.js';
import { bootstrapWorldDiscoveryRuntime } from '../application/discovery/WorldDiscoveryRuntimeBootstrap.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { DEFAULT_ARWEAVE_GATEWAY_URL } from '../core/ArweaveGatewayConfiguration.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { DEFAULT_IPFS_GATEWAY_URL } from '../core/IpfsGatewayConfiguration.js';
import { IpfsGatewayConfigurationStore } from '../storage/IpfsGatewayConfigurationStore.js';
import { SetIpfsGatewayConfigurationUseCase } from '../application/settings/SetIpfsGatewayConfigurationUseCase.js';
import { DEFAULT_BITCOIN_ESPLORA_API_URL } from '../core/BitcoinEsploraConfiguration.js';
import { BitcoinEsploraConfigurationStore } from '../storage/BitcoinEsploraConfigurationStore.js';
import { SetBitcoinEsploraConfigurationUseCase } from '../application/settings/SetBitcoinEsploraConfigurationUseCase.js';
import { DEFAULT_IPFS_NODE_API_URL } from '../core/IpfsNodeConfiguration.js';
import { IpfsNodeConfigurationStore } from '../storage/IpfsNodeConfigurationStore.js';
import { SetIpfsNodeConfigurationUseCase } from '../application/settings/SetIpfsNodeConfigurationUseCase.js';
import { DEFAULT_NOSTR_RELAY_URL } from '../core/NostrRelayConfiguration.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { SetNostrRelayConfigurationUseCase } from '../application/settings/SetNostrRelayConfigurationUseCase.js';
import { LocalWorldEncounterMaterialSource } from '../application/worldEncounter/LocalWorldEncounterMaterialSource.js';
import { PeerWorldEncounterMaterialSource } from '../application/worldEncounter/PeerWorldEncounterMaterialSource.js';
import { composeWorldEncounterMaterialVerifier } from '../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/publication/distribution/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionLifecyclePersistence } from '../application/publication/distribution/PublicationDistributionLifecyclePersistence.js';
import { PublicationDistributionLifecyclePersistenceBridge } from '../application/publication/distribution/PublicationDistributionLifecyclePersistenceBridge.js';
import { PublicationDistributionLifecycleRestorer } from '../application/publication/distribution/PublicationDistributionLifecycleRestorer.js';
import { hydratePublicationDistributionLifecycles } from '../application/publication/distribution/PublicationDistributionLifecycleHydration.js';
import { composePublicationDistributionCommand, composeMultiRelayNostrPublicationDistributionCommand } from '../application/publication/distribution/PublicationDistributionCommandComposition.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/publication/distribution/PublicationDistributionRuntimeConfiguration.js';
import { createPublicationDistributionRuntimeProvider } from '../application/publication/distribution/PublicationDistributionRuntimeProvider.js';
import { createNostrPublicationDistributionRuntimeAdapter } from '../application/nostr/NostrPublicationDistributionRuntimeAdapter.js';
import { createArweavePublicationDistributionRuntimeAdapter } from '../application/arweave/ArweavePublicationDistributionRuntimeAdapter.js';
import { createArweaveTaggedTransactionUpload } from '../application/arweave/ArweaveTaggedTransactionUpload.js';
import { createArweaveInjectedProviderSigner } from '../arweave/ArweaveInjectedProviderSigner.js';
import { createNostrInjectedProviderPublisher } from '../nostr/NostrInjectedProviderPublisher.js';
import { createNostrRelayQueryClient } from '../nostr/NostrRelayQueryClient.js';
import { composeSnapshotDistributionRuntime } from '../application/snapshot/SnapshotDistributionRuntimeComposition.js';
import { executeSnapshotDistributionCommand } from '../application/snapshot/SnapshotDistributionCommand.js';
import { availableSnapshotDistributionStorageTypes, resolveSnapshotDistributionContentStore } from '../application/snapshot/SnapshotDistributionContentBackendSelection.js';
import { composePlaceNamingPublicationRuntime } from '../application/placeNaming/PlaceNamingPublicationRuntimeComposition.js';
import { composeDiscoverSnapshotRuntime } from '../application/snapshot/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCommand } from '../application/snapshot/DiscoverSnapshotCommand.js';
import { executeDiscoverSnapshotCandidatesCommand, executeDiscoverSnapshotCandidatesCommandWithOutcome } from '../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/snapshot/WorldSnapshotDiscoveryMonitor.js';
import { composeSnapshotCandidateDiscoveryRuntime } from '../application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js';
import { ArweaveSnapshotDiscoveryQueryService } from '../application/arweave/ArweaveSnapshotDiscoveryQueryService.js';
import { NostrPlaceNamingDiscoverySource } from '../application/placeNaming/NostrPlaceNamingDiscoverySource.js';
import { NostrMultiRelayPlaceNamingDiscoverySource } from '../application/placeNaming/NostrMultiRelayPlaceNamingDiscoverySource.js';
import { composePlaceNamingDiscoveryRuntime } from '../application/placeNaming/PlaceNamingDiscoveryRuntimeComposition.js';
import { executeResolveSelectedSnapshotCommand } from '../application/snapshot/ResolveSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/snapshot/materialization/MaterializeSelectedSnapshotCommand.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import {
    composeDecentralizedWorldEncounterMaterialDiscoveryServices,
    composeDecentralizedWorldEncounterMaterialDiscoveryRuntime
} from '../application/worldEncounter/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeDiscoverWorldEncounterPublicationCommand } from '../application/worldEncounter/DiscoverWorldEncounterPublicationCommandComposition.js';
import { composeWorldEncounterLeadAssociationsQuery } from '../application/worldEncounter/WorldEncounterLeadAssociationsQueryComposition.js';
import { composeRefreshPublicationCommentaryCommand } from '../application/publication/commentary/RefreshPublicationCommentaryCommandComposition.js';

const identityProvider = new CreateIdentityProviderUseCase().execute();
const identityUseCase = new IdentityUseCase(identityProvider);
// Bound as createPublicationCommentaryCommand: addPublicationCommentaryCommand,
// below, wraps it with distribution.
const { getPublicationCommentariesCommand, addPublicationCommentaryCommand: createPublicationCommentaryCommand } =
    new CreatePublicationCommentaryUseCase().execute(identityProvider);
// A saved STUN list overrides DEFAULT_ICE_SERVERS; the default is never saved
// as if it were a preference. Resolved early because peerConnectionProvider
// needs it at construction.
const iceServerConfigurationStore = new IceServerConfigurationStore(new LocalStorageProvider());
const resolvedStunServers = (iceServerConfigurationStore.get() || { servers: DEFAULT_ICE_SERVERS }).servers;
// A configured TURN server is added alongside STUN, never replacing it, and the
// browser's ICE picks among them. Its credential is read only here, folded into
// resolvedIceServers, and never stored or logged anywhere else.
const turnServerConfigurationStore = new TurnServerConfigurationStore(new LocalStorageProvider());
const resolvedTurnServerConfiguration = resolveTurnServerConfiguration({ turnServerConfigurationStore });
const setTurnServerConfigurationUseCase = new SetTurnServerConfigurationUseCase({ turnServerConfigurationStore });
const resolvedIceServers = resolvedTurnServerConfiguration
    ? [...resolvedStunServers, resolvedTurnServerConfiguration.toIceServerEntry()]
    : resolvedStunServers;
const peerConnectionProvider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers });
// Upgrades the ICE servers in the background with live TURN credentials. Never
// awaited: startup must not depend on a third-party endpoint. On failure the
// fallback, including any user TURN entry, stays in effect.
fetchIceServers({ fallback: resolvedIceServers }).then((iceServers) => peerConnectionProvider.setIceServers(iceServers));
const setIceServerConfigurationUseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore });
// A saved rendezvous list overrides DEFAULT_RENDEZVOUS_URLS, which is empty by
// default (out-of-band invitations only).
const rendezvousConfigurationStore = new RendezvousConfigurationStore(new LocalStorageProvider());
const resolvedRendezvousUrls = (rendezvousConfigurationStore.get() || { urls: DEFAULT_RENDEZVOUS_URLS }).urls;
const setRendezvousConfigurationUseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore });
// Resolved early: the Bitcoin Esplora consumers below need it.
const bitcoinEsploraConfigurationStore = new BitcoinEsploraConfigurationStore(new LocalStorageProvider());
const resolvedBitcoinEsploraApiUrl = (bitcoinEsploraConfigurationStore.get() || { apiUrl: DEFAULT_BITCOIN_ESPLORA_API_URL }).apiUrl;
const setBitcoinEsploraConfigurationUseCase = new SetBitcoinEsploraConfigurationUseCase({ bitcoinEsploraConfigurationStore });
const discoveryBootstrap = new DiscoveryBootstrap({
    bootstrapProviders: resolvedRendezvousUrls.map((url) => new RendezvousDiscoveryProvider({
        transport: new WebSocketRendezvousTransport({ url }),
        identityProvider
    }))
});
// App-wide, so live peers survive navigating away from /peers.
const peerSessionManager = new PeerSessionManager({ identityProvider, peerConnectionProvider, discoveryProvider: discoveryBootstrap });
const peerRelationshipUseCase = new CreatePeerRelationshipUseCase().execute(identityProvider);
const peerReconnectionUseCase = new PeerReconnectionUseCase({ peerSessionManager, peerRelationshipUseCase });
const findPeerUseCase = new FindPeerUseCase({ peerSessionManager });
// Needs no binding: it tries every eligible Known Peer on construction and on
// each relationship change, never by polling.
new AutoConnectKnownPeersUseCase({ findPeerUseCase, peerRelationshipUseCase, connectedPeerRegistry: peerSessionManager.registry });
const peerMessageBus = new PeerMessageBus();
// Built before friendRelationshipUseCase so its isBlocked predicate can gate
// the friendship protocol.
const peerBlockUseCase = new CreatePeerBlockUseCase().execute(identityProvider);
// Forward reference: its knowsIdentity gate consults friendRelationshipUseCase,
// which is built below. resolveSocialIdentity is only called at runtime, after
// assignment. It lets friendship, chat, voice and presence treat an authorized
// device as its parent identity.
let deviceAuthorizationUseCase;
const resolveSocialIdentity = (connectedPeer) => deviceAuthorizationUseCase.resolveConnectionIdentity(connectedPeer);
const friendRelationshipUseCase = new CreateFriendRelationshipUseCase().execute(identityProvider, {
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry,
    peerBlockUseCase,
    resolveSocialIdentity
});
deviceAuthorizationUseCase = new CreateDeviceAuthorizationUseCase().execute(identityProvider, {
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry,
    peerRelationshipUseCase,
    friendRelationshipUseCase
});
// knowsIdentity limits propagation to identities remembered as Known Peers or
// Friends, never an open revocation directory.
const identityLifecyclePropagationUseCase = new CreateIdentityLifecyclePropagationUseCase().execute(identityProvider, {
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry,
    peerRelationshipUseCase,
    friendRelationshipUseCase
});
const chatOutbox = new CreateChatOutboxUseCase().execute(identityProvider);
const conversationStore = new CreateConversationStoreUseCase().execute(identityProvider);
const conversationReadOutbox = new CreateConversationReadOutboxUseCase().execute(identityProvider);
const remoteReadReceiptStore = new CreateRemoteReadReceiptStoreUseCase().execute(identityProvider);
const chatUseCase = new ChatUseCase(identityProvider, {
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry,
    friendRelationshipUseCase,
    peerBlockUseCase,
    chatOutbox,
    conversationStore,
    conversationReadOutbox,
    remoteReadReceiptStore,
    // One conversation per person, whichever authorized device sent each message.
    resolveSocialIdentity
});
const conversationReadTracker = new CreateConversationReadTrackerUseCase().execute(identityProvider);
const peerPresenceUseCase = new PeerPresenceUseCase({
    connectedPeerRegistry: peerSessionManager.registry,
    peerRelationshipUseCase,
    friendRelationshipUseCase,
    conversationStore,
    chatOutbox,
    conversationReadTracker,
    resolveSocialIdentity
});

// What a sibling device reports about its own reads is a different fact from
// this device's read marker, so it has its own store.
const siblingReadStateStore = new CreateSiblingReadStateStoreUseCase().execute(identityProvider);
const deviceConversationSyncUseCase = new DeviceConversationSyncUseCase({
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry,
    deviceAuthorization: deviceAuthorizationUseCase,
    chatUseCase,
    conversationReadTracker,
    siblingReadStateStore
});

// No Create*UseCase wrapper: voice has no durable storage.
const voiceUseCase = new VoiceUseCase(identityProvider, {
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry,
    friendRelationshipUseCase,
    peerBlockUseCase,
    resolveSocialIdentity
});

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
const { bitcoinProofVerifier } = new CreateBitcoinAnchorProofVerifierUseCase().execute({ apiUrl: resolvedBitcoinEsploraApiUrl });
// Captured so the Arweave wiring below can register a second proof verifier
// into the same registry.
const { externalAnchorVerifier, proofVerifierRegistry: externalAnchorProofVerifierRegistry } = new CreateExternalAnchorVerifierUseCase().execute({
    proofVerifiers: [bitcoinProofVerifier]
});
const { coordinator: publicationEvidenceCoordinator } = new CreatePublicationEvidenceCoordinatorUseCase().execute({
    anchorCatalog: publicationAnchorCatalog,
    externalAnchorVerifier
});

// Deliberately not a real broadcaster: this one-shot pipeline has no wallet
// signing, so it honestly reports PUBLISH_UNAVAILABLE instead of fabricating a
// broadcast. The real Bitcoin write path is the granular pipeline below.
const bitcoinBroadcaster = {
    async broadcast() {
        return {
            broadcast: false,
            unavailable: true,
            reason: 'This device has no Bitcoin wallet/broadcast capability configured yet.'
        };
    }
};
const { bitcoinAnchorPublisher } = new CreateBitcoinAnchorPublisherUseCase().execute({
    network: 'mainnet',
    broadcaster: bitcoinBroadcaster
});
// Also captured so CreateBaseAnchorPublisherUseCase below reuses this instance
// rather than building a second one against the same catalogs.
const { createExternalPublicationAnchorUseCase, publisherRegistry: externalAnchorPublisherRegistry, createPublicationAnchorUseCase } =
    new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
        publicationCatalog,
        anchorCatalog: publicationAnchorCatalog,
        identityProvider,
        publishers: [bitcoinAnchorPublisher],
        knowledgeStore: anchorKnowledgeStore
    });
const { coordinator: publicationAnchorCreationCoordinator } = new CreatePublicationAnchorCreationCoordinatorUseCase().execute({
    createExternalPublicationAnchorUseCase,
    publisherRegistry: externalAnchorPublisherRegistry
});

// Adds the saved Proof & Anchoring provider preference ("Use Preferred
// Provider"), stored in the same roleProviderPreferenceStore as the other roles.
const { coordinator: preferredPublicationAnchorCreationCoordinator } = new CreatePreferredPublicationAnchorCreationCoordinatorUseCase().execute({
    publicationAnchorCreationCoordinator,
    proofRegistry: externalAnchorPublisherRegistry,
    preferenceStore: roleProviderPreferenceStore
});

const { bitcoinAnchorEvidenceView } = new CreateBitcoinAnchorEvidenceViewUseCase().execute();
const { evidenceViewRegistry: externalAnchorEvidenceViewRegistry } = new CreateExternalAnchorEvidenceViewRegistryUseCase().execute({
    evidenceViews: [bitcoinAnchorEvidenceView]
});

const { bitcoinEsploraTransactionConfirmationObserver } = new CreateBitcoinEsploraTransactionConfirmationObserverUseCase().execute({ apiUrl: resolvedBitcoinEsploraApiUrl });
const { bitcoinAnchorConfirmationObserver } = new CreateBitcoinAnchorConfirmationObserverUseCase().execute({
    confirmationSource: bitcoinEsploraTransactionConfirmationObserver
});
const { bitcoinAnchorProofReconciliationView } = new CreateBitcoinAnchorProofReconciliationViewUseCase().execute({
    bitcoinAnchorConfirmationObserver, bitcoinProofVerifier
});

// The injected provider is window.unisat when such an extension is installed,
// otherwise null (an expected outcome). One shared connection app-wide, never
// persisted across a reload.
const { bitcoinInjectedProviderWalletAdapter } = new CreateBitcoinInjectedProviderWalletAdapterUseCase().execute({
    injectedProvider: (typeof window !== 'undefined' && window.unisat) ? window.unisat : null
});
const { bitcoinWalletConnection } = new CreateBitcoinWalletConnectionUseCase().execute({
    provider: bitcoinInjectedProviderWalletAdapter
});

const { bitcoinEsploraWalletFundingSource } = new CreateBitcoinEsploraWalletFundingSourceUseCase().execute({ apiUrl: resolvedBitcoinEsploraApiUrl });
const { bitcoinWalletFundingObserver } = new CreateBitcoinWalletFundingObserverUseCase().execute({
    fundingSource: bitcoinEsploraWalletFundingSource
});

// Same shape for Base: window.ethereum or null. The Base connection exposes an
// account address only, never a signing capability.
const { baseInjectedProviderWalletAdapter } = new CreateBaseInjectedProviderWalletAdapterUseCase().execute({
    injectedProvider: (typeof window !== 'undefined' && window.ethereum) ? window.ethereum : null
});
const { baseWalletConnection } = new CreateBaseWalletConnectionUseCase().execute({
    provider: baseInjectedProviderWalletAdapter
});
const { baseJsonRpcClient } = new CreateBaseJsonRpcClientUseCase().execute();
const { baseNetworkObserver } = new CreateBaseNetworkObserverUseCase().execute({
    rpcSource: baseJsonRpcClient
});

const { basePublicationTransactionPlanner } = new CreateBasePublicationTransactionPlannerUseCase().execute({
    rpcSource: baseJsonRpcClient
});
const { coordinator: basePublicationTransactionPlanCoordinator } = new CreateBasePublicationTransactionPlanCoordinatorUseCase().execute({
    basePublicationTransactionPlanner
});

// Reads window.ethereum separately from the adapter above: connecting and
// signing stay two separate objects.
const { baseInjectedProviderWalletTransactionSigner } = new CreateBaseInjectedProviderWalletTransactionSignerUseCase().execute({
    injectedProvider: (typeof window !== 'undefined' && window.ethereum) ? window.ethereum : null
});
const { coordinator: baseReviewedSigningCoordinator } = new CreateBaseReviewedSigningCoordinatorUseCase().execute();

const { baseSignedTransactionFinalizer } = new CreateBaseSignedTransactionFinalizerUseCase().execute();
const { coordinator: baseSignedTransactionFinalizationCoordinator } = new CreateBaseSignedTransactionFinalizationCoordinatorUseCase().execute({
    baseSignedTransactionFinalizer
});

const { baseTransactionBroadcaster } = new CreateBaseTransactionBroadcasterUseCase().execute({
    rpcSource: baseJsonRpcClient
});
const { coordinator: baseTransactionBroadcastCoordinator } = new CreateBaseTransactionBroadcastCoordinatorUseCase().execute({
    baseTransactionBroadcaster
});

// Deliberately not registered into externalAnchorPublisherRegistry (see
// anchoring/BaseAnchorPublisher.js).
const { baseAnchorPublisher } = new CreateBaseAnchorPublisherUseCase().execute({
    baseTransactionBroadcaster,
    createPublicationAnchorUseCase
});

const { baseTransactionInclusionObserver } = new CreateBaseTransactionInclusionObserverUseCase().execute({
    rpcSource: baseJsonRpcClient
});
const { coordinator: baseTransactionInclusionObservationCoordinator } = new CreateBaseTransactionInclusionObservationCoordinatorUseCase().execute({
    baseTransactionInclusionObserver
});

const { bitcoinAnchorTransactionBuilder } = new CreateBitcoinAnchorTransactionBuilderUseCase().execute({ network: 'mainnet' });
const { coordinator: bitcoinAnchorTransactionConstructionCoordinator } = new CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase().execute({
    bitcoinAnchorTransactionBuilder
});

const { bitcoinAnchorPsbtBuilder } = new CreateBitcoinAnchorPsbtBuilderUseCase().execute();
const { coordinator: bitcoinAnchorTransactionReviewCoordinator } = new CreateBitcoinAnchorTransactionReviewCoordinatorUseCase().execute({
    bitcoinAnchorPsbtBuilder
});
const { coordinator: bitcoinAnchorReviewedSigningCoordinator } = new CreateBitcoinAnchorReviewedSigningCoordinatorUseCase().execute();

const { bitcoinAnchorSignedPsbtFinalizer } = new CreateBitcoinAnchorSignedPsbtFinalizerUseCase().execute();
const { coordinator: bitcoinAnchorSignedPsbtFinalizationCoordinator } = new CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase().execute({
    bitcoinAnchorSignedPsbtFinalizer
});

const { bitcoinEsploraTransactionBroadcaster } = new CreateBitcoinEsploraTransactionBroadcasterUseCase().execute({ apiUrl: resolvedBitcoinEsploraApiUrl });
const { bitcoinAnchorTransactionBroadcaster } = new CreateBitcoinAnchorTransactionBroadcasterUseCase().execute({
    broadcaster: bitcoinEsploraTransactionBroadcaster
});
const { coordinator: bitcoinAnchorBroadcastCoordinator } = new CreateBitcoinAnchorBroadcastCoordinatorUseCase().execute({
    bitcoinAnchorTransactionBroadcaster
});

// The production UI only calls publishBroadcastedAnchor(), which records the
// anchor once the granular pipeline above broadcasts; so the one-shot
// collaborators are deliberately left unsupplied.
const { coordinator: bitcoinAnchorPublicationCoordinator } = new CreateBitcoinAnchorPublicationCoordinatorUseCase().execute({
    publicationCatalog,
    createPublicationAnchorUseCase,
    publicationAnchorCatalog
});

const { coordinator: bitcoinAnchorConfirmationCoordinator } = new CreateBitcoinAnchorConfirmationCoordinatorUseCase().execute({
    bitcoinAnchorConfirmationObserver
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

// The one World discovery registry. A peer's World contribution registers when
// it sends and unregisters automatically when the peer disconnects.
const worldDiscoveryRuntime = bootstrapWorldDiscoveryRuntime({
    connectedPeerRegistry: peerSessionManager.registry,
    peerMessageBus
});
app.provide('worldDiscoverySourceRegistry', worldDiscoveryRuntime.registry);

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
app.provide('arweaveGatewayConfigurationStore', arweaveGatewayConfigurationStore);
app.provide('setArweaveGatewayConfigurationUseCase', setArweaveGatewayConfigurationUseCase);

const setIpfsGatewayConfigurationUseCase = new SetIpfsGatewayConfigurationUseCase({ ipfsGatewayConfigurationStore });
app.provide('ipfsGatewayConfigurationStore', ipfsGatewayConfigurationStore);
app.provide('setIpfsGatewayConfigurationUseCase', setIpfsGatewayConfigurationUseCase);

const setIpfsNodeConfigurationUseCase = new SetIpfsNodeConfigurationUseCase({ ipfsNodeConfigurationStore });
app.provide('ipfsNodeConfigurationStore', ipfsNodeConfigurationStore);
app.provide('setIpfsNodeConfigurationUseCase', setIpfsNodeConfigurationUseCase);

// The one Nostr relay set for the whole app: discovery, Place Naming, Snapshot
// and Publication announcement, and Commentary all use it. A saved list
// overrides DEFAULT_NOSTR_RELAY_URL. Publishing fans out to every relay; it
// never fails over in order.
const nostrRelayConfigurationStore = new NostrRelayConfigurationStore(new LocalStorageProvider());
const resolvedNostrRelayUrls = (nostrRelayConfigurationStore.get() || { relayUrls: [DEFAULT_NOSTR_RELAY_URL] }).relayUrls;
const resolvedNostrRelayUrl = resolvedNostrRelayUrls[0];
const setNostrRelayConfigurationUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore });
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
app.provide('worldEncounterMaterialSources', worldEncounterMaterialSources);
app.provide('worldEncounterMaterialVerifier', worldEncounterMaterialVerifier);
app.provide('worldDiscoveryLeadRegistry', worldDiscoveryLeadRegistry);

// Reads the same 'forkbuild-publications' key as LocalWorldEncounterMaterialSource,
// listed fresh on every call so evidence reflects current local publications.
const worldEncounterPublicationEvidenceProvider = new LocalDiscoveryProvider(new LocalStorageProvider());
const discoverWorldEncounterPublicationCommand = composeDiscoverWorldEncounterPublicationCommand({
    runtime: decentralizedWorldEncounterMaterialDiscoveryRuntime,
    discoveryProvider: worldEncounterPublicationEvidenceProvider
});
app.provide('discoverWorldEncounterPublicationCommand', discoverWorldEncounterPublicationCommand);
// Uses the same runtime and publication source as the discovery command above,
// so the Location panel and discovery always agree.
const worldEncounterLeadAssociationsQuery = composeWorldEncounterLeadAssociationsQuery({
    runtime: decentralizedWorldEncounterMaterialDiscoveryRuntime,
    discoveryProvider: worldEncounterPublicationEvidenceProvider
});
app.provide('worldEncounterLeadAssociationsQuery', worldEncounterLeadAssociationsQuery);

// Shared with createPublicationDistributionRuntimeProvider() below. Passed to
// the canvas as the Discovery-tag field's initial value, never baked into the
// command, so the field stays editable per call.
const PUBLICATION_DISCOVERY_TAG = 'forkbuild-publication';
app.provide('publicationDiscoveryTag', PUBLICATION_DISCOVERY_TAG);

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
app.provide('publicationDistributionLifecycleStore', publicationDistributionLifecycleStore);

// arweaveHostSigner and nostrHostPublisher resolve window.arweaveWallet and
// window.nostr lazily, on each sign()/publish(), never once at boot: an
// extension's content script may inject after this module runs. They are
// therefore always present; a missing extension surfaces as an honest error
// when a sign or publish is attempted.
function resolveArweaveHostSigner() {
    return createArweaveInjectedProviderSigner({
        injectedProvider: typeof window !== 'undefined' ? window.arweaveWallet : undefined
    });
}
// Forwards the optional `tags` argument (defaults to []).
const arweaveHostSigner = {
    sign(material, tags = []) {
        const signer = resolveArweaveHostSigner();
        return signer
            ? signer.sign(material, tags)
            : Promise.reject(new Error('This device has no Arweave wallet/signing capability configured yet.'));
    }
};

// One Arweave content store registered into both the creation and resolution
// registries, so an Arweave placement can be created and later resolved.
const arweaveSnapshotPlacementContentStore = new ArweaveContentStore({
    signer: arweaveHostSigner,
    gatewayUrl: resolvedArweaveGatewayUrl
});
snapshotPlacementStoreRegistry.register(arweaveSnapshotPlacementContentStore);
publicationSnapshotPlacementResolutionStoreRegistry.register(arweaveSnapshotPlacementContentStore);

// Registered into the same registries as Bitcoin. With no wallet installed,
// the lazy signer rejects honestly, so "Create Arweave Anchor" reports
// PUBLISH_UNAVAILABLE rather than disappearing.
const { arweaveAnchorPublisher } = new CreateArweaveAnchorPublisherUseCase().execute({
    signer: arweaveHostSigner,
    gatewayUrl: resolvedArweaveGatewayUrl
});
externalAnchorPublisherRegistry.register(arweaveAnchorPublisher);

const { arweaveProofVerifier } = new CreateArweaveAnchorProofVerifierUseCase().execute({
    gatewayUrl: resolvedArweaveGatewayUrl
});
externalAnchorProofVerifierRegistry.register(arweaveProofVerifier);

// Uses its own BaseJsonRpcClient (the default endpoint), kept separate from
// baseJsonRpcClient above, as Bitcoin's verifier is.
const { baseProofVerifier } = new CreateBaseAnchorProofVerifierUseCase().execute();
externalAnchorProofVerifierRegistry.register(baseProofVerifier);

const { arweaveAnchorEvidenceView } = new CreateArweaveAnchorEvidenceViewUseCase().execute();
externalAnchorEvidenceViewRegistry.register(arweaveAnchorEvidenceView);

const { baseAnchorEvidenceView } = new CreateBaseAnchorEvidenceViewUseCase().execute();
externalAnchorEvidenceViewRegistry.register(baseAnchorEvidenceView);

// Same lazy resolution as arweaveHostSigner. A plain function, matching what
// createNostrInjectedProviderPublisher() returns, so `typeof publishImpl ===
// 'function'` checks still work.
function resolveNostrHostPublisher() {
    return createNostrInjectedProviderPublisher({
        injectedProvider: typeof window !== 'undefined' ? window.nostr : undefined
    });
}
const nostrHostPublisher = async function nostrHostPublish(relayUrl, eventTemplate) {
    const publishImpl = resolveNostrHostPublisher();
    if (!publishImpl) {
        throw new Error('This device has no Nostr (NIP-07) publishing capability configured yet.');
    }
    return publishImpl(relayUrl, eventTemplate);
};
const nostrPublicationRuntimeCapabilities = createNostrPublicationDistributionRuntimeAdapter({ publish: nostrHostPublisher });

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

const arweavePublicationRuntimeCapabilities = createArweavePublicationDistributionRuntimeAdapter({ signer: arweaveHostSigner });
const arweaveAnnouncementUploadTaggedTransaction = createArweaveTaggedTransactionUpload({
    signer: arweaveHostSigner,
    gatewayUrl: resolvedArweaveGatewayUrl
});
const publicationDistributionRuntimeProvider = createPublicationDistributionRuntimeProvider({
    ...arweavePublicationRuntimeCapabilities,
    ...nostrPublicationRuntimeCapabilities,
    uploadTaggedTransaction: arweaveAnnouncementUploadTaggedTransaction,
    discoveryTag: PUBLICATION_DISCOVERY_TAG
});
const { arweaveUploaderOptions, nostrPublisherOptions, arweaveAnnouncementPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(publicationDistributionRuntimeProvider.resolveRuntimeCapabilities());
// Material storage and remote pinning options stay a per-request choice, so
// they are not resolved here.
const ipfsNodeOptions = { apiUrl: resolvedIpfsNodeApiUrl };
const publicationDistributionCommand = composePublicationDistributionCommand({
    lifecycleStore: publicationDistributionLifecycleStore,
    arweaveUploaderOptions,
    ipfsNodeOptions,
    nostrPublisherOptions,
    arweaveAnnouncementPublisherOptions
});
app.provide('publicationDistributionCommand', publicationDistributionCommand);

const multiRelayNostrPublicationDistributionCommand = composeMultiRelayNostrPublicationDistributionCommand({
    lifecycleStore: publicationDistributionLifecycleStore,
    arweaveUploaderOptions,
    ipfsNodeOptions,
    nostrRelayUrls: resolvedNostrRelayUrls,
    nostrPublisherOptions
});
app.provide('multiRelayNostrPublicationDistributionCommand', multiRelayNostrPublicationDistributionCommand);

// Snapshots use their own 'forkbuild-snapshot' tag, a separate discovery
// stream from publications on the same relays. Composed once per substrate so
// each call can pick Nostr or Arweave. Content comes from
// snapshotPlacementStoreRegistry: one shared Arweave store, and only
// 'ipfs'/'ar' are distribution targets. A null publisher makes the command
// throw synchronously; callers wrap it in a promise.
const { discoveryPublisher: nostrSnapshotDiscoveryPublisher } = composeSnapshotDistributionRuntime({
    discoveryProvider: 'nostr',
    nostrSnapshotDiscoveryPublisherOptions: { publishImpl: nostrHostPublisher, discoveryTag: 'forkbuild-snapshot', relayUrls: resolvedNostrRelayUrls }
});
const { discoveryPublisher: arweaveSnapshotDiscoveryPublisher } = composeSnapshotDistributionRuntime({
    discoveryProvider: 'arweave',
    arweaveSnapshotDiscoveryPublisherOptions: { discoveryTag: 'forkbuild-snapshot', gatewayUrl: resolvedArweaveGatewayUrl, uploadTaggedTransaction: arweaveAnnouncementUploadTaggedTransaction }
});
// Picks one of the two instances above, defaulting to the saved preference.
const resolveSnapshotDiscoveryPublisher = (discoveryProvider = resolvedAnnouncementDiscoveryProvider) =>
    (discoveryProvider === 'arweave' ? arweaveSnapshotDiscoveryPublisher : nostrSnapshotDiscoveryPublisher);
app.provide('resolveSnapshotDiscoveryPublisher', resolveSnapshotDiscoveryPublisher);
const snapshotDistributionCommand = (bytes, storage = 'ar', publicationId, claimedPosition, discoveryProvider) => executeSnapshotDistributionCommand({
    bytes,
    contentStore: resolveSnapshotDistributionContentStore(snapshotPlacementStoreRegistry, storage),
    discoveryPublisher: resolveSnapshotDiscoveryPublisher(discoveryProvider),
    publicationId,
    claimedPosition
});
app.provide('snapshotDistributionCommand', snapshotDistributionCommand);
// Lets a Remote IPFS CID be announced without re-uploading the bytes through
// contentStore.put(). May be null.
const snapshotDiscoveryPublisher = resolveSnapshotDiscoveryPublisher();
app.provide('snapshotDiscoveryPublisher', snapshotDiscoveryPublisher);
const snapshotDistributionAvailableStorageTypes = () => availableSnapshotDistributionStorageTypes(snapshotPlacementStoreRegistry);
app.provide('snapshotDistributionAvailableStorageTypes', snapshotDistributionAvailableStorageTypes);

// Seeds the Content/Snapshot pickers from the saved CONTENT preference, never
// overriding a pick. 'remote-pinning' is added to the eligible list because that
// store reports its storage as 'ipfs' and so never has its own registry key;
// without it a saved 'remote-pinning' preference would be silently ignored.
const contentDistributionProviderPreference = roleProviderPreferenceStore.get(RoleProviderRole.CONTENT);
const resolvedContentDistributionProvider = resolveSavedProviderDefault(
    contentDistributionProviderPreference ? contentDistributionProviderPreference.providerKey : null,
    [...snapshotDistributionAvailableStorageTypes(), 'remote-pinning'],
    null
);
app.provide('defaultContentDistributionProvider', resolvedContentDistributionProvider);

// Supplies no discoveryTag: the publisher derives it from the claim's
// worldId/regionId. A null publisher makes the command reject with a readable
// error.
const { discoveryPublisher: placeNamingDiscoveryPublisher } = composePlaceNamingPublicationRuntime({
    discoveryProvider: resolvedAnnouncementDiscoveryProvider,
    nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: nostrHostPublisher },
    arweavePlaceNamingDiscoveryPublisherOptions: { gatewayUrl: resolvedArweaveGatewayUrl, uploadTaggedTransaction: arweaveAnnouncementUploadTaggedTransaction }
});
const publishPlaceNamingClaimToNostrCommand = (claim) => Promise.resolve().then(() => {
    if (!placeNamingDiscoveryPublisher) {
        throw new Error('Nostr publishing is not available — no compatible browser extension was found');
    }
    return placeNamingDiscoveryPublisher.publish(claim);
});
app.provide('publishPlaceNamingClaimToNostrCommand', publishPlaceNamingClaimToNostrCommand);

// nostrRelayQueryClient only queries relays (REQ/EVENT/EOSE) and needs no
// extension; publishing is the separate NIP-07 path. Where it is undefined the
// resolver is null and the command throws synchronously; callers wrap it.
const { resolver: snapshotResolver, queryService: snapshotDiscoveryQueryService } = composeDiscoverSnapshotRuntime({
    nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: nostrRelayQueryClient, relayUrls: resolvedNostrRelayUrls }
});
// The resolution registry is keyed by the selected candidate's own `storage`:
// no ranking, no trying several backends, no fallback.
const discoverSnapshotCommand = (contentHash) => executeDiscoverSnapshotCommand({
    discoveryTag: 'forkbuild-snapshot',
    contentHash,
    resolver: snapshotResolver,
    storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry
});
app.provide('discoverSnapshotCommand', discoverSnapshotCommand);

// Reads Arweave directly: a read-only query needs no signer or wallet.
const arweaveSnapshotDiscoveryQueryService = new ArweaveSnapshotDiscoveryQueryService({ gatewayUrl: resolvedArweaveGatewayUrl });
const { queryService: snapshotCandidateDiscoveryQueryService } = composeSnapshotCandidateDiscoveryRuntime({
    nostrSnapshotDiscoveryQueryService: snapshotDiscoveryQueryService,
    arweaveSnapshotDiscoveryQueryService,
    placementCatalog: publicationSnapshotPlacementCatalog
});
app.provide('snapshotCandidateDiscoveryQueryService', snapshotCandidateDiscoveryQueryService);

// Answers "what was announced under this tag", as opposed to resolving one
// contentHash. Local catalog entries (including peer announcements) and
// Nostr/Arweave all reach callers through the one composite service.
const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
    discoveryTag: 'forkbuild-snapshot',
    discoveryQueryService: snapshotCandidateDiscoveryQueryService
});
app.provide('discoverSnapshotCandidatesCommand', discoverSnapshotCandidatesCommand);

// Same service, but searchWithOutcome() lets the explicit button tell an empty
// result from a failed search. The background monitor keeps the plain command.
const discoverSnapshotCandidatesWithOutcomeCommand = () => executeDiscoverSnapshotCandidatesCommandWithOutcome({
    discoveryTag: 'forkbuild-snapshot',
    discoveryQueryService: snapshotCandidateDiscoveryQueryService
});
app.provide('discoverSnapshotCandidatesWithOutcomeCommand', discoverSnapshotCandidatesWithOutcomeCommand);

// Decides when to ask (movement threshold, stale-request protection); WorldView
// calls observe() from its refresh tick. The explicit button remains as well.
const worldSnapshotDiscoveryMonitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });
app.provide('worldSnapshotDiscoveryMonitor', worldSnapshotDiscoveryMonitor);

// Only the transport half: WorldView composes the rest, since only its session
// knows the World layout. With no relay client, `sources` is an empty but
// usable roster rather than a throw.
const placeNamingDiscoverySources = nostrRelayQueryClient
    ? [resolvedNostrRelayUrls.length > 1
        ? new NostrMultiRelayPlaceNamingDiscoverySource({ queryImpl: nostrRelayQueryClient, relayUrls: resolvedNostrRelayUrls })
        : new NostrPlaceNamingDiscoverySource({ queryImpl: nostrRelayQueryClient, relayUrl: resolvedNostrRelayUrls[0] })]
    : [];
const { queryService: placeNamingDiscoveryQueryService } = composePlaceNamingDiscoveryRuntime({ sources: placeNamingDiscoverySources });
app.provide('placeNamingDiscoveryQueryService', placeNamingDiscoveryQueryService);

// Resolves exactly the selected candidate via resolveCandidate(), through the
// same resolution registry.
const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({
    candidate,
    resolver: snapshotResolver,
    storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry
});
app.provide('resolveSelectedSnapshotCommand', resolveSelectedSnapshotCommand);

const materializeSnapshotFromSelectedCandidateUseCase = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);
const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({
    resolution,
    materializer: materializeSnapshotFromSelectedCandidateUseCase
});
app.provide('materializeSelectedSnapshotCommand', materializeSelectedSnapshotCommand);

app.use(router);
app.mount('#app');
