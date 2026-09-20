import { createApp } from 'vue';
import App from './App.js';
import { router } from './router/index.js';
import { CreateIdentityProviderUseCase } from '../application/CreateIdentityProviderUseCase.js';
import { IdentityUseCase } from '../application/IdentityUseCase.js';
import { CreatePublicationCommentaryUseCase } from '../application/CreatePublicationCommentaryUseCase.js';
import { CreatePublicationCommentaryDistributionPeerExchangeUseCase } from '../application/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js';
import { PublicationCommentaryRemoteNotificationBridge } from '../application/PublicationCommentaryRemoteNotificationBridge.js';
import { NostrMultiRelayPublicationCommentaryDistribution } from '../application/NostrMultiRelayPublicationCommentaryDistribution.js';
import { DiscoverPublicationCommentaryFromNostrUseCase } from '../application/DiscoverPublicationCommentaryFromNostrUseCase.js';
import { PublicationCommentaryArweaveDistribution } from '../application/PublicationCommentaryArweaveDistribution.js';
import { DiscoverPublicationCommentaryFromArweaveUseCase } from '../application/DiscoverPublicationCommentaryFromArweaveUseCase.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { PeerSessionManager } from '../application/PeerSessionManager.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { WebSocketRendezvousTransport } from '../peer/WebSocketRendezvousTransport.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { DiscoveryBootstrap } from '../peer/DiscoveryBootstrap.js';
import { DEFAULT_ICE_SERVERS, fetchIceServers } from '../peer/IceServerConfig.js';
import { IceServerConfigurationStore } from '../storage/IceServerConfigurationStore.js';
import { SetIceServerConfigurationUseCase } from '../application/SetIceServerConfigurationUseCase.js';
import { TurnServerConfigurationStore } from '../storage/TurnServerConfigurationStore.js';
import { resolveTurnServerConfiguration } from '../application/TurnServerConfigurationProvider.js';
import { SetTurnServerConfigurationUseCase } from '../application/SetTurnServerConfigurationUseCase.js';
import { DEFAULT_RENDEZVOUS_URLS } from '../peer/RendezvousConfig.js';
import { RendezvousConfigurationStore } from '../storage/RendezvousConfigurationStore.js';
import { SetRendezvousConfigurationUseCase } from '../application/SetRendezvousConfigurationUseCase.js';
import { CreatePeerRelationshipUseCase } from '../application/CreatePeerRelationshipUseCase.js';
import { PeerReconnectionUseCase } from '../application/PeerReconnectionUseCase.js';
import { FindPeerUseCase } from '../application/FindPeerUseCase.js';
import { AutoConnectKnownPeersUseCase } from '../application/AutoConnectKnownPeersUseCase.js';
import { CreateFriendRelationshipUseCase } from '../application/CreateFriendRelationshipUseCase.js';
import { CreateIdentityLifecyclePropagationUseCase } from '../application/CreateIdentityLifecyclePropagationUseCase.js';
import { CreateDeviceAuthorizationUseCase } from '../application/CreateDeviceAuthorizationUseCase.js';
import { CreatePeerBlockUseCase } from '../application/CreatePeerBlockUseCase.js';
import { ChatUseCase } from '../application/ChatUseCase.js';
import { CreateChatOutboxUseCase } from '../application/CreateChatOutboxUseCase.js';
import { CreateConversationStoreUseCase } from '../application/CreateConversationStoreUseCase.js';
import { CreateConversationReadTrackerUseCase } from '../application/CreateConversationReadTrackerUseCase.js';
import { CreateConversationReadOutboxUseCase } from '../application/CreateConversationReadOutboxUseCase.js';
import { CreateRemoteReadReceiptStoreUseCase } from '../application/CreateRemoteReadReceiptStoreUseCase.js';
import { PeerPresenceUseCase } from '../application/PeerPresenceUseCase.js';
import { VoiceUseCase } from '../application/VoiceUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { CreateSiblingReadStateStoreUseCase } from '../application/CreateSiblingReadStateStoreUseCase.js';
import { DeviceConversationSyncUseCase } from '../application/DeviceConversationSyncUseCase.js';
import { CreatePublicationResolverUseCase } from '../application/CreatePublicationResolverUseCase.js';
import { CreatePublicationPeerExchangeUseCase } from '../application/CreatePublicationPeerExchangeUseCase.js';
import { CreatePeerContentExchangeUseCase } from '../application/CreatePeerContentExchangeUseCase.js';
import { CreatePublicationResolutionCoordinatorUseCase } from '../application/CreatePublicationResolutionCoordinatorUseCase.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/CreatePublicationDisplayKindRegistryUseCase.js';
import { ReconstructPublicationDiscoveryUseCase } from '../application/ReconstructPublicationDiscoveryUseCase.js';
import { CreateWorldEncounterPublicationAdmissionLogUseCase } from '../application/CreateWorldEncounterPublicationAdmissionLogUseCase.js';
import { ReconstructWorldEncounterPublicationDiscoveryUseCase } from '../application/ReconstructWorldEncounterPublicationDiscoveryUseCase.js';
import { CreatePublicationAnchorPeerExchangeUseCase } from '../application/CreatePublicationAnchorPeerExchangeUseCase.js';
import { CreatePublicationAnchorDiscoveryCoordinatorUseCase } from '../application/CreatePublicationAnchorDiscoveryCoordinatorUseCase.js';
import { CreatePublicationSnapshotPlacementPeerExchangeUseCase } from '../application/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js';
import { CreatePublicationSnapshotPlacementDiscoveryCoordinatorUseCase } from '../application/CreatePublicationSnapshotPlacementDiscoveryCoordinatorUseCase.js';
import { CreatePublicationEvidenceDiscoveryCoordinatorUseCase } from '../application/CreatePublicationEvidenceDiscoveryCoordinatorUseCase.js';
import { CreatePublicationKnowledgeSynchronizationCoordinatorUseCase } from '../application/CreatePublicationKnowledgeSynchronizationCoordinatorUseCase.js';
import { CreateExternalAnchorVerifierUseCase } from '../application/CreateExternalAnchorVerifierUseCase.js';
import { CreateBitcoinAnchorProofVerifierUseCase } from '../application/CreateBitcoinAnchorProofVerifierUseCase.js';
import { CreatePublicationEvidenceCoordinatorUseCase } from '../application/CreatePublicationEvidenceCoordinatorUseCase.js';
import { CreateBitcoinAnchorPublisherUseCase } from '../application/CreateBitcoinAnchorPublisherUseCase.js';
import { CreateExternalPublicationAnchorOrchestratorUseCase } from '../application/CreateExternalPublicationAnchorOrchestratorUseCase.js';
import { CreatePublicationAnchorCreationCoordinatorUseCase } from '../application/CreatePublicationAnchorCreationCoordinatorUseCase.js';
import { CreateBitcoinAnchorEvidenceViewUseCase } from '../application/CreateBitcoinAnchorEvidenceViewUseCase.js';
import { CreateExternalAnchorEvidenceViewRegistryUseCase } from '../application/CreateExternalAnchorEvidenceViewRegistryUseCase.js';
import { CreateArweaveAnchorPublisherUseCase } from '../application/CreateArweaveAnchorPublisherUseCase.js';
import { CreateArweaveAnchorProofVerifierUseCase } from '../application/CreateArweaveAnchorProofVerifierUseCase.js';
import { CreateArweaveAnchorEvidenceViewUseCase } from '../application/CreateArweaveAnchorEvidenceViewUseCase.js';
import { CreateBaseAnchorEvidenceViewUseCase } from '../application/CreateBaseAnchorEvidenceViewUseCase.js';
import { CreateBitcoinEsploraTransactionConfirmationObserverUseCase } from '../application/CreateBitcoinEsploraTransactionConfirmationObserverUseCase.js';
import { CreateBitcoinAnchorConfirmationObserverUseCase } from '../application/CreateBitcoinAnchorConfirmationObserverUseCase.js';
import { CreateBitcoinAnchorProofReconciliationViewUseCase } from '../application/CreateBitcoinAnchorProofReconciliationViewUseCase.js';
import { CreateBitcoinInjectedProviderWalletAdapterUseCase } from '../application/CreateBitcoinInjectedProviderWalletAdapterUseCase.js';
import { CreateBitcoinWalletConnectionUseCase } from '../application/CreateBitcoinWalletConnectionUseCase.js';
import { CreateBitcoinEsploraWalletFundingSourceUseCase } from '../application/CreateBitcoinEsploraWalletFundingSourceUseCase.js';
import { CreateBitcoinWalletFundingObserverUseCase } from '../application/CreateBitcoinWalletFundingObserverUseCase.js';
import { CreateBitcoinAnchorTransactionBuilderUseCase } from '../application/CreateBitcoinAnchorTransactionBuilderUseCase.js';
import { CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase } from '../application/CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase.js';
import { CreateBitcoinAnchorPsbtBuilderUseCase } from '../application/CreateBitcoinAnchorPsbtBuilderUseCase.js';
import { CreateBitcoinAnchorTransactionReviewCoordinatorUseCase } from '../application/CreateBitcoinAnchorTransactionReviewCoordinatorUseCase.js';
import { CreateBitcoinAnchorReviewedSigningCoordinatorUseCase } from '../application/CreateBitcoinAnchorReviewedSigningCoordinatorUseCase.js';
import { CreateBitcoinAnchorSignedPsbtFinalizerUseCase } from '../application/CreateBitcoinAnchorSignedPsbtFinalizerUseCase.js';
import { CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase } from '../application/CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase.js';
import { CreateBitcoinEsploraTransactionBroadcasterUseCase } from '../application/CreateBitcoinEsploraTransactionBroadcasterUseCase.js';
import { CreateBitcoinAnchorTransactionBroadcasterUseCase } from '../application/CreateBitcoinAnchorTransactionBroadcasterUseCase.js';
import { CreateBaseInjectedProviderWalletAdapterUseCase } from '../application/CreateBaseInjectedProviderWalletAdapterUseCase.js';
import { CreateBaseWalletConnectionUseCase } from '../application/CreateBaseWalletConnectionUseCase.js';
import { CreateBaseJsonRpcClientUseCase } from '../application/CreateBaseJsonRpcClientUseCase.js';
import { CreateBaseAnchorProofVerifierUseCase } from '../application/CreateBaseAnchorProofVerifierUseCase.js';
import { CreateBaseNetworkObserverUseCase } from '../application/CreateBaseNetworkObserverUseCase.js';
import { CreateBasePublicationTransactionPlannerUseCase } from '../application/CreateBasePublicationTransactionPlannerUseCase.js';
import { CreateBasePublicationTransactionPlanCoordinatorUseCase } from '../application/CreateBasePublicationTransactionPlanCoordinatorUseCase.js';
import { CreateBaseInjectedProviderWalletTransactionSignerUseCase } from '../application/CreateBaseInjectedProviderWalletTransactionSignerUseCase.js';
import { CreateBaseReviewedSigningCoordinatorUseCase } from '../application/CreateBaseReviewedSigningCoordinatorUseCase.js';
import { CreateBaseSignedTransactionFinalizerUseCase } from '../application/CreateBaseSignedTransactionFinalizerUseCase.js';
import { CreateBaseSignedTransactionFinalizationCoordinatorUseCase } from '../application/CreateBaseSignedTransactionFinalizationCoordinatorUseCase.js';
import { CreateBaseTransactionBroadcasterUseCase } from '../application/CreateBaseTransactionBroadcasterUseCase.js';
import { CreateBaseAnchorPublisherUseCase } from '../application/CreateBaseAnchorPublisherUseCase.js';
import { CreateBaseTransactionBroadcastCoordinatorUseCase } from '../application/CreateBaseTransactionBroadcastCoordinatorUseCase.js';
import { CreateBaseTransactionInclusionObserverUseCase } from '../application/CreateBaseTransactionInclusionObserverUseCase.js';
import { CreateBaseTransactionInclusionObservationCoordinatorUseCase } from '../application/CreateBaseTransactionInclusionObservationCoordinatorUseCase.js';
import { CreateBitcoinAnchorBroadcastCoordinatorUseCase } from '../application/CreateBitcoinAnchorBroadcastCoordinatorUseCase.js';
import { CreateBitcoinAnchorPublicationCoordinatorUseCase } from '../application/CreateBitcoinAnchorPublicationCoordinatorUseCase.js';
import { CreateBitcoinAnchorConfirmationCoordinatorUseCase } from '../application/CreateBitcoinAnchorConfirmationCoordinatorUseCase.js';
import { CreateIpfsRemotePublicationCoordinatorUseCase } from '../application/CreateIpfsRemotePublicationCoordinatorUseCase.js';
import { CreateIpfsPublicationContentVerifierUseCase } from '../application/CreateIpfsPublicationContentVerifierUseCase.js';
import { CreateIpfsPublicationContentVerificationCoordinatorUseCase } from '../application/CreateIpfsPublicationContentVerificationCoordinatorUseCase.js';
import { LocalStoragePublicationObservationArchive } from '../storage/LocalStoragePublicationObservationArchive.js';
import { CreateSnapshotPlacementResolutionCoordinatorUseCase } from '../application/CreateSnapshotPlacementResolutionCoordinatorUseCase.js';
import { CreateIpfsSnapshotPlacementViewUseCase } from '../application/CreateIpfsSnapshotPlacementViewUseCase.js';
import { CreateLocalSnapshotPlacementViewUseCase } from '../application/CreateLocalSnapshotPlacementViewUseCase.js';
import { CreateSnapshotPlacementViewRegistryUseCase } from '../application/CreateSnapshotPlacementViewRegistryUseCase.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
import { IpfsGatewayContentStore } from '../content/IpfsGatewayContentStore.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { CreateSnapshotPlacementCreationCoordinatorUseCase } from '../application/CreateSnapshotPlacementCreationCoordinatorUseCase.js';
import { CreatePreferredSnapshotPlacementCreationCoordinatorUseCase } from '../application/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js';
import { SetRoleProviderPreferenceUseCase } from '../application/SetRoleProviderPreferenceUseCase.js';
import { SetArweaveGatewayConfigurationUseCase } from '../application/SetArweaveGatewayConfigurationUseCase.js';
import { PublicationCatalogDiscoveryProvider } from '../discovery/PublicationCatalogDiscoveryProvider.js';
import { PublicationCatalogContentResolver } from '../discovery/PublicationCatalogContentResolver.js';
import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { ImportPublicationSnapshotTransferPackageUseCase } from '../application/ImportPublicationSnapshotTransferPackageUseCase.js';
import { BuildPublicationSnapshotTransferPackageUseCase } from '../application/BuildPublicationSnapshotTransferPackageUseCase.js';
import { SnapshotContentMaterializationCoordinator } from '../application/SnapshotContentMaterializationCoordinator.js';
import { MaterializeSnapshotFromPlacementUseCase } from '../application/MaterializeSnapshotFromPlacementUseCase.js';
import { SnapshotPlacementMaterializationCoordinator } from '../application/SnapshotPlacementMaterializationCoordinator.js';
import { CreatePublicationSnapshotContentPeerExchangeUseCase } from '../application/CreatePublicationSnapshotContentPeerExchangeUseCase.js';
import { MaterializeSnapshotFromPeerUseCase } from '../application/MaterializeSnapshotFromPeerUseCase.js';
import { SnapshotPeerMaterializationCoordinator } from '../application/SnapshotPeerMaterializationCoordinator.js';
import { CreatePublicationSnapshotPossessionPeerExchangeUseCase } from '../application/CreatePublicationSnapshotPossessionPeerExchangeUseCase.js';
import { ObservePeerSnapshotPossessionUseCase } from '../application/ObservePeerSnapshotPossessionUseCase.js';
import { SnapshotPeerPossessionCoordinator } from '../application/SnapshotPeerPossessionCoordinator.js';
import { SnapshotMaterializationSelectionCoordinator } from '../application/SnapshotMaterializationSelectionCoordinator.js';
import { bootstrapWorldDiscoveryRuntime } from '../application/WorldDiscoveryRuntimeBootstrap.js';
import { LocalStorageProvider } from '../storage/LocalStorageProvider.js';
import { DEFAULT_ARWEAVE_GATEWAY_URL } from '../core/ArweaveGatewayConfiguration.js';
import { ArweaveGatewayConfigurationStore } from '../storage/ArweaveGatewayConfigurationStore.js';
import { DEFAULT_IPFS_GATEWAY_URL } from '../core/IpfsGatewayConfiguration.js';
import { IpfsGatewayConfigurationStore } from '../storage/IpfsGatewayConfigurationStore.js';
import { SetIpfsGatewayConfigurationUseCase } from '../application/SetIpfsGatewayConfigurationUseCase.js';
import { DEFAULT_NOSTR_RELAY_URL } from '../core/NostrRelayConfiguration.js';
import { NostrRelayConfigurationStore } from '../storage/NostrRelayConfigurationStore.js';
import { SetNostrRelayConfigurationUseCase } from '../application/SetNostrRelayConfigurationUseCase.js';
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { PeerWorldEncounterMaterialSource } from '../application/PeerWorldEncounterMaterialSource.js';
import { composeWorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionLifecyclePersistence } from '../application/PublicationDistributionLifecyclePersistence.js';
import { PublicationDistributionLifecyclePersistenceBridge } from '../application/PublicationDistributionLifecyclePersistenceBridge.js';
import { PublicationDistributionLifecycleRestorer } from '../application/PublicationDistributionLifecycleRestorer.js';
import { hydratePublicationDistributionLifecycles } from '../application/PublicationDistributionLifecycleHydration.js';
import { composePublicationDistributionCommand, composeMultiRelayNostrPublicationDistributionCommand } from '../application/PublicationDistributionCommandComposition.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../application/PublicationDistributionRuntimeConfiguration.js';
import { createPublicationDistributionRuntimeProvider } from '../application/PublicationDistributionRuntimeProvider.js';
import { createNostrPublicationDistributionRuntimeAdapter } from '../application/NostrPublicationDistributionRuntimeAdapter.js';
import { createArweavePublicationDistributionRuntimeAdapter } from '../application/ArweavePublicationDistributionRuntimeAdapter.js';
import { createArweaveTaggedTransactionUpload } from '../application/ArweaveTaggedTransactionUpload.js';
import { createArweaveInjectedProviderSigner } from '../arweave/ArweaveInjectedProviderSigner.js';
import { createNostrInjectedProviderPublisher } from '../nostr/NostrInjectedProviderPublisher.js';
import { createNostrRelayQueryClient } from '../nostr/NostrRelayQueryClient.js';
import { composeSnapshotDistributionRuntime } from '../application/SnapshotDistributionRuntimeComposition.js';
import { executeSnapshotDistributionCommand } from '../application/SnapshotDistributionCommand.js';
import { availableSnapshotDistributionStorageTypes, resolveSnapshotDistributionContentStore } from '../application/SnapshotDistributionContentBackendSelection.js';
import { composePlaceNamingPublicationRuntime } from '../application/PlaceNamingPublicationRuntimeComposition.js';
import { composeDiscoverSnapshotRuntime } from '../application/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCommand } from '../application/DiscoverSnapshotCommand.js';
import { executeDiscoverSnapshotCandidatesCommand, executeDiscoverSnapshotCandidatesCommandWithOutcome } from '../application/DiscoverSnapshotCandidatesCommand.js';
import { WorldSnapshotDiscoveryMonitor } from '../application/WorldSnapshotDiscoveryMonitor.js';
import { composeSnapshotCandidateDiscoveryRuntime } from '../application/SnapshotCandidateDiscoveryRuntimeComposition.js';
import { ArweaveSnapshotDiscoveryQueryService } from '../application/ArweaveSnapshotDiscoveryQueryService.js';
import { NostrPlaceNamingDiscoverySource } from '../application/NostrPlaceNamingDiscoverySource.js';
import { NostrMultiRelayPlaceNamingDiscoverySource } from '../application/NostrMultiRelayPlaceNamingDiscoverySource.js';
import { composePlaceNamingDiscoveryRuntime } from '../application/PlaceNamingDiscoveryRuntimeComposition.js';
import { executeResolveSelectedSnapshotCommand } from '../application/ResolveSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../application/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { executeMaterializeSelectedSnapshotCommand } from '../application/MaterializeSelectedSnapshotCommand.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import {
    composeDecentralizedWorldEncounterMaterialDiscoveryServices,
    composeDecentralizedWorldEncounterMaterialDiscoveryRuntime
} from '../application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeDiscoverWorldEncounterPublicationCommand } from '../application/DiscoverWorldEncounterPublicationCommandComposition.js';

const identityProvider = new CreateIdentityProviderUseCase().execute();
const identityUseCase = new IdentityUseCase(identityProvider);
// 0.9.289 — Other-Publication Commentary Entry Point. One app-wide
// composition of the SAME Publication Commentary application layer
// application/CreateWorldViewUseCase.js already wires for World View
// alone (see application/CreatePublicationCommentaryUseCase.js's own
// header) — so a Discovery-facing Publication surface with no
// WorldNavigationSession of its own (ui/components/PublicationCard.js,
// below) can still reach the identical read/write commentary path.
// Shares the SAME identityProvider every other app-wide use case here
// already does.
//
// 0.9.620 — Wire Publication Commentary Peer Distribution. The RHS below
// is UNCHANGED from 0.9.289 — still `new CreatePublicationCommentaryUseCase().execute(identityProvider)`,
// still returning only its own two commands, never a third
// announce/peerExchange capability (see that file's own header, also
// unmodified by this milestone). Only the LOCAL binding name on the
// left changes, from `addPublicationCommentaryCommand` to
// `createPublicationCommentaryCommand` — freeing that name for the
// distribution-wrapped command defined further below, once
// `publicationCommentaryDistributionPeerExchange` exists (it needs the
// app-wide `peerMessageBus`/`peerSessionManager.registry` pair, both
// constructed later in this file). `getPublicationCommentariesCommand`
// is untouched: reading Commentary back is a purely local concern this
// milestone does not change.
const { getPublicationCommentariesCommand, addPublicationCommentaryCommand: createPublicationCommentaryCommand } =
    new CreatePublicationCommentaryUseCase().execute(identityProvider);
// 0.2.66 — real ICE (STUN/TURN) configuration and a real, networked
// rendezvous bootstrap, both wired the same way: a plain, inspectable
// config module (peer/IceServerConfig.js, peer/RendezvousConfig.js) this
// file reads, never a value baked directly into either provider. See
// peer/RendezvousConfig.js's own header on why DEFAULT_RENDEZVOUS_URLS is
// empty out of the box — a fresh checkout behaves exactly as every prior
// milestone already did (out-of-band invitations only) until an operator
// configures a real rendezvous URL there, at which point
// discoveryBootstrap starts actually asking it on every discover() and
// publishSelf(), with zero changes anywhere else in this file.
// 0.9.386 — User-Configurable STUN Server Configuration.
//
// `core/IceServerConfiguration.js` / `storage/IceServerConfigurationStore.js`
// (both this same milestone) give a user's own STUN server list a real,
// validated, durable home — the direct structural mirror of
// `arweaveGatewayConfigurationStore`/`nostrRelayConfigurationStore` below,
// applied here instead of further down the file because THIS store's
// result is needed immediately, to construct `peerConnectionProvider`
// itself. `iceServerConfigurationStore.get()` returns `null` when the user
// has never saved an override — the identical "absence stays meaningful"
// rule those two sibling stores already hold — so `resolvedStunServers`
// falls back to `DEFAULT_ICE_SERVERS` only then, never persisting that
// fallback as if it were a saved preference. (0.9.455 renamed this binding
// from `resolvedIceServers` to `resolvedStunServers` — see that milestone's
// own comment immediately below — because `resolvedIceServers` now names
// the STUN+TURN composite actually handed to WebRtcPeerConnectionProvider.)
const iceServerConfigurationStore = new IceServerConfigurationStore(new LocalStorageProvider());
const resolvedStunServers = (iceServerConfigurationStore.get() || { servers: DEFAULT_ICE_SERVERS }).servers;
// 0.9.455 — TURN Configuration into WebRTC ICE.
//
// `resolveTurnServerConfiguration()` (application/TurnServerConfigurationProvider.js,
// 0.9.454) resolves the user's own TurnServerConfigurationStore to either a
// TurnServerConfiguration instance or `null` — "no TURN server," never a
// fabricated one (see that file's own header). ForkBuild supplies TURN
// configuration to the browser's ICE machinery; it never implements TURN
// selection, retry, or failover itself — so when a TURN server IS
// configured, its own `.toIceServerEntry()` (a single RTCIceServer-shaped
// object, one or more `urls` handed to the browser as alternatives, never
// tried one at a time by this codebase) is appended ALONGSIDE
// `resolvedStunServers`, never replacing it; when none is configured, this
// resolves to `resolvedStunServers` alone — the exact, unmodified STUN-only
// behavior every prior milestone already held.
// `resolvedTurnServerConfiguration` and the object `.toIceServerEntry()`
// returns (which carries the real credential — see core/
// TurnServerConfiguration.js's own header, "the credential is sensitive
// configuration") are read ONCE, right here, folded straight into
// `resolvedIceServers` below, and never separately stored, logged, or
// exposed to any other part of this file.
const turnServerConfigurationStore = new TurnServerConfigurationStore(new LocalStorageProvider());
const resolvedTurnServerConfiguration = resolveTurnServerConfiguration({ turnServerConfigurationStore });
// 0.9.456 — TURN Server Settings UI. The WRITE half of the settings entry
// point, wired against this SAME store instance (never a second,
// disconnected TurnServerConfigurationStore) — see application/
// SetTurnServerConfigurationUseCase.js's own header. Both this use case and
// the store itself are provided app-wide below so ui/views/
// TurnServerSettingsView.js is the one thing that ever injects either.
const setTurnServerConfigurationUseCase = new SetTurnServerConfigurationUseCase({ turnServerConfigurationStore });
const resolvedIceServers = resolvedTurnServerConfiguration
    ? [...resolvedStunServers, resolvedTurnServerConfiguration.toIceServerEntry()]
    : resolvedStunServers;
const peerConnectionProvider = new WebRtcPeerConnectionProvider({ iceServers: resolvedIceServers });
// 0.3.7 — enriches `peerConnectionProvider`'s iceServers in the
// BACKGROUND with this deployment's live Metered TURN credentials
// (peer/IceServerConfig.js#fetchIceServers) — deliberately NEVER
// awaited here: app startup must never depend on a third-party HTTP
// endpoint responding at all, let alone quickly (the exact "never
// block on a network call this codebase doesn't control" discipline
// peer/WebRtcPeerConnection.js's own 0.3.6 ICE-gathering timeout
// applies one layer down). Every connection created before this
// resolves simply uses `resolvedIceServers`, exactly like today;
// fetchIceServers() itself never throws and never hangs past its own
// bounded timeout, so this is a pure best-effort upgrade, not a
// dependency anything else here waits on.
//
// 0.9.386 — `fallback: resolvedIceServers`, no longer the hard-coded
// `DEFAULT_ICE_SERVERS`. `fetchIceServers()` itself, its TURN credentials,
// and its own merge/dedupe logic are completely UNMODIFIED by this
// milestone (see core/IceServerConfiguration.js's own header, "STUN
// only — never TURN") — the only change is which STUN baseline that TURN
// fetch is merged with: a user's own configured STUN list when one is on
// file, the same deployment default otherwise. A failed or slow TURN
// fetch still degrades to exactly `resolvedIceServers`, never throwing and
// never blocking startup, exactly as before.
//
// 0.9.455 — `resolvedIceServers` may now ALSO already include a user's own
// configured TURN entry (see the comment immediately above its own
// declaration). This call needed no change to keep that entry intact
// either way: on a failed/slow Metered fetch, `fallback` (== `resolvedIceServers`)
// is returned as-is, TURN entry included; on a successful fetch,
// `dedupeIceServers([...fetched, ...fallback])` still carries the user's
// TURN entry through from `fallback`, alongside whatever Metered returned.
fetchIceServers({ fallback: resolvedIceServers }).then((iceServers) => peerConnectionProvider.setIceServers(iceServers));
// 0.9.386 — STUN Settings UI. The WRITE half of the settings entry point,
// wired against this SAME store instance (never a second, disconnected
// IceServerConfigurationStore) — see application/
// SetIceServerConfigurationUseCase.js's own header. Both this use case and
// the store itself are provided app-wide below so ui/views/
// StunSettingsView.js is the one thing that ever injects either.
const setIceServerConfigurationUseCase = new SetIceServerConfigurationUseCase({ iceServerConfigurationStore });
// 0.9.388 — User-Configurable Rendezvous Server Configuration.
//
// `core/RendezvousConfiguration.js` / `storage/RendezvousConfigurationStore.js`
// (both this same milestone) give a user's own rendezvous server list a
// real, validated, durable home — the direct structural mirror of
// `iceServerConfigurationStore` above, applied here to the rendezvous
// bootstrap instead of the peer connection provider.
// `rendezvousConfigurationStore.get()` returns `null` when the user has
// never saved an override — the identical "absence stays meaningful" rule
// `iceServerConfigurationStore` already holds — so `resolvedRendezvousUrls`
// falls back to `DEFAULT_RENDEZVOUS_URLS` only then, never persisting that
// fallback as if it were a saved preference.
const rendezvousConfigurationStore = new RendezvousConfigurationStore(new LocalStorageProvider());
const resolvedRendezvousUrls = (rendezvousConfigurationStore.get() || { urls: DEFAULT_RENDEZVOUS_URLS }).urls;
// 0.9.388 — Rendezvous Settings UI. The WRITE half of the settings entry
// point, wired against this SAME store instance (never a second,
// disconnected RendezvousConfigurationStore) — see application/
// SetRendezvousConfigurationUseCase.js's own header. Both this use case
// and the store itself are provided app-wide below so ui/views/
// RendezvousSettingsView.js is the one thing that ever injects either.
const setRendezvousConfigurationUseCase = new SetRendezvousConfigurationUseCase({ rendezvousConfigurationStore });
const discoveryBootstrap = new DiscoveryBootstrap({
    // 0.9.388 — `resolvedRendezvousUrls`, no longer the hard-coded
    // `DEFAULT_RENDEZVOUS_URLS` literal. `RendezvousDiscoveryProvider` and
    // `WebSocketRendezvousTransport` themselves are completely UNMODIFIED
    // by this milestone — the only change is which URL list this mapping
    // is built from: a user's own configured rendezvous list when one is
    // on file, the same deployment default otherwise.
    bootstrapProviders: resolvedRendezvousUrls.map((url) => new RendezvousDiscoveryProvider({
        transport: new WebSocketRendezvousTransport({ url }),
        identityProvider
    }))
});
// 0.2.55 — one app-wide PeerSessionManager, provided the same way
// previewService/identityUseCase already are, so its registry of live
// peers survives navigating away from /peers and back. Shares the SAME
// identityProvider the rest of the app authenticates through — a peer
// connection this device authenticates always proves possession of
// whichever identity is currently signed in here, never a second,
// separate one.
const peerSessionManager = new PeerSessionManager({ identityProvider, peerConnectionProvider, discoveryProvider: discoveryBootstrap });
// 0.2.56 — one app-wide PeerRelationshipUseCase, same reasoning: a
// remembered peer must survive navigating away from /peers, and must
// survive a reload, which peerSessionManager's own registry never does
// on purpose (see application/ConnectedPeerRegistry.js's own header).
const peerRelationshipUseCase = new CreatePeerRelationshipUseCase().execute(identityProvider);
// 0.2.62 — one app-wide PeerReconnectionUseCase, composing the two
// collaborators above rather than owning any storage of its own: a
// "Reconnect" gesture on a Known Peer only ever needs the already-wired
// peerSessionManager (to open the fresh connection) and
// peerRelationshipUseCase (to know which identity to expect) — see
// application/PeerReconnectionUseCase.js's own header.
const peerReconnectionUseCase = new PeerReconnectionUseCase({ peerSessionManager, peerRelationshipUseCase });
// 0.2.64 — one app-wide FindPeerUseCase, composing the SAME
// peerSessionManager rather than owning any discovery state of its own:
// "Find a Peer" only ever needs peerSessionManager's own candidate pool
// (search) and its connect pipeline (connect, with the searched-for
// identityId threaded through as expectedIdentityId) — see
// application/FindPeerUseCase.js's own header.
const findPeerUseCase = new FindPeerUseCase({ peerSessionManager });
// 0.9.345 — one app-wide AutoConnectKnownPeersUseCase, composing the SAME
// findPeerUseCase/peerRelationshipUseCase/peerSessionManager.registry
// already wired above rather than owning any discovery, storage, or
// transport of its own — see application/AutoConnectKnownPeersUseCase.js's
// own header. It needs no binding here to keep running, the same way
// application/PublicationPeerConnectionSync.js never needs one either: its
// own constructor already attempts every currently eligible Known Peer
// once, then again on every future application/
// PeerRelationshipUseCase.js#onRelationshipsChanged() — never a background
// polling interval.
new AutoConnectKnownPeersUseCase({ findPeerUseCase, peerRelationshipUseCase, connectedPeerRegistry: peerSessionManager.registry });
// 0.2.57 — one app-wide peer/PeerMessageBus.js, the shared transport
// application/FriendRelationshipUseCase.js's own header documents as a
// collaborator it never owns. This is the FIRST live consumer of
// PeerMessageBus in the running app (0.2.52 through 0.2.55 built and
// tested it, but the live World View still runs presence/profile/
// interaction over the BroadcastChannel transport — see
// application/CreateWorldViewUseCase.js) — friend requests travel over
// the exact same real WebRTC connections this /peers page already
// authenticates.
const peerMessageBus = new PeerMessageBus();
// 0.2.60 — one app-wide PeerBlockUseCase, same persistence reasoning as
// peerRelationshipUseCase above: a block must survive navigating away
// from /peers and survive a reload. Built BEFORE friendRelationshipUseCase
// so its isBlocked predicate can be wired straight into the friendship
// protocol's own ingestion/send gating (see application/
// CreateFriendRelationshipUseCase.js) — never a store friendship reads
// directly.
const peerBlockUseCase = new CreatePeerBlockUseCase().execute(identityProvider);
// 0.2.79 — one app-wide DeviceAuthorizationPropagationUseCase, the same
// shared peerMessageBus/registry every other protocol here rides. Its
// `resolveConnectionIdentity()` is what teaches friendship/chat/voice to
// recognize an authorized DEVICE connection as speaking for its PARENT
// identity — see application/FriendRelationshipUseCase.js's/
// application/ChatUseCase.js's/application/VoiceUseCase.js's own 0.2.79
// headers. Declared as a forward reference (`let`, assigned below,
// AFTER friendRelationshipUseCase) so its own `knowsIdentity` gate can
// consult friendRelationshipUseCase (the same richer gate application/
// CreateIdentityLifecyclePropagationUseCase.js's own knowsIdentity
// already uses) WITHOUT a construction-order cycle: `resolveSocialIdentity`
// below is only ever CALLED later, at runtime, by which point this
// variable is already assigned — never during friendRelationshipUseCase's
// own construction.
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
// 0.2.68 — one app-wide IdentityLifecyclePropagationUseCase, riding the
// SAME peerMessageBus/registry every other peer/PeerMessageBus.js
// protocol here does. `knowsIdentity` is derived from the SAME
// peerRelationshipUseCase/friendRelationshipUseCase already wired above
// — see application/CreateIdentityLifecyclePropagationUseCase.js's own
// header on why: propagation only ever grows a durable local record for
// an identity this device already remembers as a Known Peer or Friend,
// never an open, unbounded revocation directory.
const identityLifecyclePropagationUseCase = new CreateIdentityLifecyclePropagationUseCase().execute(identityProvider, {
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry,
    peerRelationshipUseCase,
    friendRelationshipUseCase
});
// 0.2.61 — one app-wide ChatUseCase. Rides the SAME peerMessageBus/
// registry friendRelationshipUseCase already does, and consults the
// SAME friendRelationshipUseCase/peerBlockUseCase as its authorization
// inputs — see application/ChatUseCase.js's own header on why
// friendship authorizes chat without chat ever becoming part of the
// friendship protocol itself.
// 0.2.63 — chat gained one genuinely durable piece of state, the local
// outbox a queued-while-offline message waits in until its recipient
// reconnects (see application/ChatOutbox.js's own header) — so this is
// now the one Create*UseCase wrapper this file needs for chat, the same
// shape CreatePeerRelationshipUseCase/CreatePeerBlockUseCase already
// use to keep ui/ from importing storage/ directly.
// 0.2.69 — chat also gained a durable, purely local conversation
// history (application/ConversationStore.js) — a genuinely separate
// store from the outbox above, wired the exact same way, so a reload
// continues Alice and Bob's conversation rather than starting a blank
// one — see application/ChatUseCase.js's own header.
const chatOutbox = new CreateChatOutboxUseCase().execute(identityProvider);
const conversationStore = new CreateConversationStoreUseCase().execute(identityProvider);
// 0.2.71 — chat gained explicit, network read acknowledgement: a
// coalescing outbox for a read acknowledgement not yet delivered
// (application/ConversationReadOutbox.js) and a durable record of what
// each peer has told this device about their own read state
// (application/RemoteReadReceiptStore.js) — two SEPARATE stores from
// each other and from conversationReadTracker below, wired the same
// "own Create*UseCase, ui/ never imports storage/ directly" way — see
// application/ChatUseCase.js's own header on why a read ACKNOWLEDGEMENT
// is never simply a transmission of the read TRACKER's local marker.
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
    // 0.2.79 — SAME resolver friendRelationshipUseCase already consults,
    // so a conversation with Alice stays one conversation regardless of
    // which of her authorized devices actually sent each message — see
    // application/ChatUseCase.js's own header.
    resolveSocialIdentity
});
// 0.2.70 — one app-wide ConversationReadTracker (a THIRD durable store,
// alongside chatOutbox/conversationStore above, answering "what has
// this device's owner actually seen" — see application/
// ConversationReadTracker.js's own header) and one app-wide
// PeerPresenceUseCase, composing it with the SAME
// peerRelationshipUseCase/friendRelationshipUseCase/conversationStore/
// chatOutbox already wired above rather than owning any new source of
// truth itself — see application/PeerPresenceUseCase.js's own header on
// why it is a computed reconciliation, never a fourth store.
// 0.2.85 — the SAME resolveSocialIdentity resolver friendRelationshipUseCase/
// chatUseCase/voiceUseCase already consult, so "Alice is online" sees a
// live connection from any of her authorized devices, never just one
// whose raw key happens to equal her own — see application/
// PeerPresenceUseCase.js's own header.
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

// 0.2.83 — one app-wide DeviceConversationSyncUseCase, closing the gap
// 0.2.78/0.2.82 both named and deliberately left open: Alice's own
// several devices each still hold their own independent, local
// conversationStore/conversationReadTracker — this is the ONE new
// protocol that lets them converge, riding the SAME peerMessageBus/
// registry every other protocol here does, and consulting the SAME
// deviceAuthorizationUseCase#resolveConnectionIdentity()/
// resolveOwnSocialIdentity() that already teach friendship/chat/voice to
// recognize an authorized device — see application/
// DeviceConversationSyncUseCase.js's own header. A SEPARATE durable store
// from conversationReadTracker (application/SiblingReadStateStore.js,
// wired the same "own Create*UseCase, ui/ never imports storage/
// directly" way every other durable per-owner store here already uses):
// this device's own local read marker and what a SIBLING has reported
// about ITSELF are never the same fact.
const siblingReadStateStore = new CreateSiblingReadStateStoreUseCase().execute(identityProvider);
const deviceConversationSyncUseCase = new DeviceConversationSyncUseCase({
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry,
    deviceAuthorization: deviceAuthorizationUseCase,
    chatUseCase,
    conversationReadTracker,
    siblingReadStateStore
});

// 0.2.73 — one app-wide VoiceUseCase. Rides the SAME peerMessageBus/
// registry every other peer/PeerMessageBus.js protocol here does, and
// consults the SAME friendRelationshipUseCase/peerBlockUseCase chatUseCase
// already uses as its authorization inputs — see application/
// VoiceUseCase.js's own header on why voice reuses chat's own
// eligibility question rather than inventing a voice-specific trust
// system. Deliberately no Create*UseCase wrapper: unlike chat, voice has
// no durable storage at all (see that file's own header, "Voice Is
// Ephemeral") — application/LocalAudioTrackProvider.js's own default
// (real navigator.mediaDevices.getUserMedia) is all it needs.
const voiceUseCase = new VoiceUseCase(identityProvider, {
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry,
    friendRelationshipUseCase,
    peerBlockUseCase,
    // 0.2.79 — SAME resolver chatUseCase/friendRelationshipUseCase already
    // consult, so Bob's authorization check sees "Alice Identity -> FRIEND
    // -> voice permitted," never one answer per device — see
    // application/VoiceUseCase.js's own header.
    resolveSocialIdentity
});

// 0.7.5 — Decentralized Publication UX & Resolution. The first time any
// of application/PublicationResolver.js (0.7.0), application/
// LocalPublicationCatalog.js/application/PublicationExchange.js (0.7.2),
// application/PublicationPeerExchange.js (0.7.3), or application/
// PeerContentExchange.js (0.7.4) is actually constructed in the running
// app — every one of those milestones' own "Deliberately excluded"
// lists named this exact gap ("no UI surface... deliberately NOT wired
// into ui/main.js") and left it for this milestone by name. Rides the
// SAME peerMessageBus/peerSessionManager.registry every other peer/
// PeerMessageBus.js protocol in this file already does, so a
// publication announcement and a content request multiplex over the
// identical authenticated connection friendship/chat/voice/lifecycle
// propagation already share.
//
// application/CreatePublicationPeerExchangeUseCase.js's own catalog is
// the ONE LocalPublicationCatalog instance this replica uses anywhere —
// every other collaborator below is threaded through with THAT catalog,
// never a second instance, so "what has this replica cataloged" reads
// identically everywhere in the app.
const { publicationResolver, contentStore: publicationContentStore } = new CreatePublicationResolverUseCase().execute();
// 0.9.342 — Automatic Peer Publication Connection Sync. The use case
// below also constructs a PublicationPeerConnectionSync internally,
// wired to this SAME catalog/peerExchange/registry triple; it needs no
// binding here to keep running (see its own header) so it is not
// destructured — a peer reaching AUTHENTICATED now automatically
// receives this replica's currently cataloged Publications, with no
// separate call from this file.
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
// application/PublicationResolutionCoordinator.js — the sequencing layer
// this milestone adds on top of the four classes above: resolve
// locally, and only ask caller-CHOSEN candidates for missing bytes when
// the caller explicitly supplies them (see that class's own header on
// why it never picks a peer, or retrieves anything, by itself). As of
// 0.7.6 this same instance also accepts an ORDERED `peers` array — see
// application/PeerContentRetrievalCoordinator.js, built internally
// around the identical `publicationPeerContentExchange` below; no
// separate wiring is needed here for that.
const { coordinator: publicationResolutionCoordinator } = new CreatePublicationResolutionCoordinatorUseCase().execute({
    publicationResolver,
    peerContentExchange: publicationPeerContentExchange
});
// The small, explicit, display-only kindPlugin registry ui/views/
// DecentralizedPublicationsView.js reads from — see application/
// CreatePublicationDisplayKindRegistryUseCase.js's own header on why
// this is deliberately a SEPARATE composition from
// blueprintAttributionUseCase/(a future) worldPlaceNamingUseCase: merely
// checking what a cataloged publication resolves to must never import
// it into either of those durable stores as a side effect.
const { kindPlugins: publicationDisplayKindPlugins } = new CreatePublicationDisplayKindRegistryUseCase().execute();

// 0.9.337 — Wire Resolved Decentralized Publications into Repository
// Discovery. The ONE `DecentralizedPublicationDiscoveryProvider`
// (0.9.335) instance this replica ever constructs, built here — right
// alongside `publicationCatalog`/`publicationResolutionCoordinator`
// above — for the exact reason 0.9.336's own Section H lifetime audit
// established: an in-memory accumulator built any other way (e.g. fresh
// per view, the way `CreateDiscoveryUseCase` below builds
// LocalDiscoveryProvider) would silently lose every previously admitted
// candidate the moment a person navigated away and back. Provided
// app-wide via `app.provide()` below — the SAME single instance
// `ui/views/DecentralizedPublicationsView.js` admits a resolved
// Publication into (see that file's own `admitToRepositoryDiscovery()`)
// is the SAME single instance available to Repository's own discovery
// composition. This class itself is completely unmodified: it performs
// no decentralized discovery or resolution of its own (see its own
// header) — this is only its first real production caller.
const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();

// 0.9.608 — Reconstruct Publication Discovery at Application Composition.
// 0.9.606's own Section F found that this provider's own in-memory
// accumulator loses every Repository-admitted Publication across a real
// session boundary, while its PlacementRecord (LocalPlacementRegistry is
// storage-backed) survives. 0.9.607 proved the fix live: every fact
// needed to reconstruct a Publication already survives, durably, in
// `publicationCatalog` (application/LocalPublicationCatalog.js) and its
// own ContentStore — the gap is a missing INDEX, not a missing FACT.
// Populates the SAME single provider instance constructed immediately
// above, before app.provide() hands it out below, by reusing the SAME
// `publicationCatalog`/`publicationResolutionCoordinator`/
// `publicationDisplayKindPlugins` this replica already composed above —
// never a second catalog, resolver, or coordinator. See
// application/ReconstructPublicationDiscoveryUseCase.js's own header for
// why this never triggers network retrieval, even though
// `publicationResolutionCoordinator` was itself built with a live
// peerContentExchange.
await new ReconstructPublicationDiscoveryUseCase(
    publicationCatalog, publicationResolutionCoordinator, publicationDisplayKindPlugins, decentralizedPublicationDiscoveryProvider
).execute();

// 0.9.651 — Persist World-Encounter Publication Admissions.
//
// 0.9.650's own Major User Journey Product Reassessment found the SAME
// continuity gap the reconstruction immediately above already closes for
// `publicationCatalog`, on a SECOND admission path:
// ui/components/WorldEncounterCanvas.js's own admitToRepositoryDiscovery()
// (0.9.474/0.9.523/0.9.595) admits a resolved, AVAILABLE+VERIFIED World
// Encounter Publication into `decentralizedPublicationDiscoveryProvider`
// (constructed above) and nowhere durable — a restart loses it even though
// a PlacementRecord for the same Publication survives.
//
// `publicationCatalog` itself cannot be reused for this: it stores signed
// core/DecentralizedPublication.js locator envelopes, a shape World
// Encounter admission never produces — see application/
// LocalWorldEncounterPublicationAdmissionLog.js's own header, and
// tests/DistributionResultPublicationCenterDeepLinkAudit.test.js's own
// Section B6, for the live proof that bridging the two would corrupt
// `publicationCatalog` for every other consumer. `worldEncounterPublicationAdmissionLog`
// is therefore a separate, purpose-built durable log, reconstructed here
// into the SAME `decentralizedPublicationDiscoveryProvider` instance the
// line above already populates — never a second discovery provider, never
// a second in-memory index. See application/
// ReconstructWorldEncounterPublicationDiscoveryUseCase.js's own header for
// why this performs no resolution and no network access of any kind.
const { admissionLog: worldEncounterPublicationAdmissionLog } = new CreateWorldEncounterPublicationAdmissionLogUseCase().execute();
new ReconstructWorldEncounterPublicationDiscoveryUseCase(
    worldEncounterPublicationAdmissionLog, decentralizedPublicationDiscoveryProvider
).execute();

// 0.9.620 — Wire Publication Commentary Peer Distribution.
//
// application/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js's
// own composition-root shape (mirroring application/
// CreatePublicationAnchorPeerExchangeUseCase.js one domain over), riding
// the SAME app-wide `peerMessageBus`/`peerSessionManager.registry` every
// other peer/PeerMessageBus.js protocol in this file already does. Shares
// the SAME app-wide `identityProvider` every other use case here already
// does — `PublicationCommentaryDistributionExchange`'s own constructor
// (0.9.618, unmodified) is what enforces "only the commentary's own
// author may sign it for distribution," so this composition introduces
// no separate signing identity of its own.
//
// `publicationCommentaryDistributionStore` reads/writes the SAME
// underlying `window.localStorage` keys `createPublicationCommentaryCommand`'s
// own internal PublicationCommentaryStore instance already does — the
// identical "a second composition, never a second source of truth"
// discipline application/CreatePublicationCommentaryUseCase.js's own
// 0.9.289 header already documents for its two independently-constructed
// PublicationCommentaryStore instances. storage/PublicationCommentaryStore.js
// itself keeps no in-memory cache (every read re-loads through its own
// injected StorageProvider — see that file's own header), so a Commentary
// saved through `createPublicationCommentaryCommand` below is immediately
// visible to `publicationCommentaryDistributionPeerExchange`'s own
// `announce()` the moment it is called.
const {
    exchange: publicationCommentaryDistributionExchange,
    peerExchange: publicationCommentaryDistributionPeerExchange
} = new CreatePublicationCommentaryDistributionPeerExchangeUseCase().execute({
    identityProvider,
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry
});

// 0.9.628 — Publication Commentary Nostr Asynchronous Distribution.
//
// Assigned once, below, after this file's own existing Nostr host
// capability (`nostrHostPublisher`) and relay query client
// (`nostrRelayQueryClient`) are constructed — both are declared much
// later in this file, so this binding starts `null` and is filled in by
// the time any real Commentary is ever submitted (see this file's own
// later 0.9.628 section). `addPublicationCommentaryCommand`, below,
// closes over this SAME mutable binding rather than importing/
// constructing anything Nostr-shaped itself, so this stays the one place
// that ever wires the two together.
let publicationCommentaryNostrDistribution = null;
// 0.9.631 — Publication Commentary Arweave Asynchronous Distribution.
// Same "starts null, filled in once its own host capabilities exist below"
// shape `publicationCommentaryNostrDistribution` immediately above already
// holds — see this file's own later 0.9.631 section.
let publicationCommentaryArweaveDistribution = null;

// Composes `createPublicationCommentaryCommand` (0.9.289, unmodified) with
// two independent, best-effort distribution side effects — WebRTC ANNOUNCE
// (0.9.620), always attempted, and EXACTLY ONE asynchronous substrate
// publish (Nostr, as of 0.9.628; Arweave, as of 0.9.631) — after local
// creation succeeds, never before it and never in place of it. Mirrors this
// milestone's own central invariant (see docs/Roadmap.md's 0.9.620 entry):
// local Commentary creation is the primary operation, and EITHER
// distribution attempt's own failure — no connected peers, no configured
// relay/gateway capability, a signing error, anything either call can throw
// or reject with — is deliberately swallowed here, never allowed to undo or
// mask an already-successful local persist, and never surfaced to the
// caller as a Commentary-creation failure.
//
// SELECTION, NEVER FAN-OUT — 0.9.631's OWN ADDITION, EXTENDING `application/
// PublicationDistributionRuntimeComposition.js`'s OWN INVARIANT OF THE SAME
// NAME TO COMMENTARY. `input.discoveryProvider` chooses AT MOST ONE
// asynchronous substrate to publish to — `'nostr'` (the default, preserving
// every existing caller's behavior unchanged since 0.9.628) or `'arweave'`
// — never both from a single call, exactly as `composePublicationDistributionRuntime()`
// already selects exactly one discovery-substrate collaborator for
// Publication distribution. WebRTC remains a wholly separate, always-on
// LIVE-dissemination mechanism (0.9.620), untouched by this selection —
// see docs/Roadmap.md's own 0.9.626 entry, "substrate selection ≠ transport
// fan-out." A caller wanting Commentary on both Nostr and Arweave calls this
// command twice, is not something this milestone builds a shortcut for.
function addPublicationCommentaryCommand(input) {
    const result = createPublicationCommentaryCommand(input);
    try {
        publicationCommentaryDistributionPeerExchange.announce(result.commentary);
    } catch {
        // Best-effort distribution only. Local persistence already
        // succeeded above (or this line would never have been reached —
        // createPublicationCommentaryCommand throws, unmodified, before
        // announcing anything), so nothing here ever needs to be undone.
    }
    const discoveryProvider = (input && input.discoveryProvider) || 'nostr';
    const asynchronousDistribution = discoveryProvider === 'arweave'
        ? publicationCommentaryArweaveDistribution
        : publicationCommentaryNostrDistribution;
    if (asynchronousDistribution) {
        try {
            const envelopeJson = publicationCommentaryDistributionExchange.exportCommentary(result.commentary);
            // Deliberately not awaited — see this function's own header,
            // "genuinely parallel and independent." A rejection (no relay/
            // gateway reachable, no signing capability configured, a
            // timeout) is swallowed here exactly like the WebRTC announce()
            // failure immediately above; nothing downstream of local
            // persistence is ever undone by it.
            asynchronousDistribution.publish(envelopeJson).catch(() => {});
        } catch {
            // Same restraint as the WebRTC try/catch above, for a
            // synchronous failure (e.g. exportCommentary() itself throws).
        }
    }
    return result;
}

// 0.9.623 — Wire Remote Commentary Arrival into Local Notifications.
//
// 0.9.622's own Section E flagship finding: `publicationCommentaryDistributionPeerExchange`
// above already fires `onCommentaryReceived()` for every verified remote
// arrival, but nothing here ever subscribed to it, so a remote Commentary
// never produced the SAME `publication.commented` NotificationEvent local
// creation already does (via `createPublicationCommentaryCommand` above,
// through `PublicationCommentaryNotificationProducer`, 0.9.275). This is
// that missing subscription, and only that — see application/
// PublicationCommentaryRemoteNotificationBridge.js's own header for the
// full contract (gated on `isNew`, gated on this replica's own identity
// actually being the resolved Publication's publisher, and reusing the
// IDENTICAL `publication.commented` event-type constant, never a second
// notification vocabulary).
//
// `publicationCommentaryRemoteDiscoveryProvider`/`publicationCommentaryRemoteNotificationEventStore`
// are fresh instances reading/writing the SAME `forkbuild-publications`/
// `notification-events:entries` `window.localStorage` keys every other
// composition in this file already reads/writes — the identical "a second
// composition, never a second source of truth" discipline application/
// CreatePublicationCommentaryUseCase.js's own 0.9.289 header already
// documents. `identityProvider` is the SAME app-wide instance every other
// use case here already rides — never a second identity mechanism.
const publicationCommentaryRemoteNotificationBridge = new PublicationCommentaryRemoteNotificationBridge(
    new LocalDiscoveryProvider(new LocalStorageProvider()),
    identityProvider,
    (notificationEvent) => new NotificationEventStore(new LocalStorageProvider()).save(notificationEvent)
);
// Best-effort only, mirroring `addPublicationCommentaryCommand`'s own
// try/catch around `announce()` immediately above: `onCommentaryReceived()`
// fires synchronously from inside PeerMessageBus's own message dispatch
// (application/PublicationCommentaryDistributionPeerExchange.js's own
// EventBus does not isolate subscribers), and a notification failure here
// must never be allowed to propagate back into, or disrupt, message
// handling for an already-verified, already-stored remote Commentary.
publicationCommentaryDistributionPeerExchange.onCommentaryReceived((result) => {
    try {
        publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result);
    } catch {
        // Best-effort only — see this section's own header, above.
    }
});

// 0.8.3 — Publication Center: External Evidence UX. The first UI wiring
// for the anchor catalog/verifier pipeline 0.8.0-0.8.2 built with no UI
// consumer at all (see each of those milestones' own "Deliberately
// excluded" lists). `publicationAnchorCatalog` is the one
// LocalPublicationAnchorCatalog instance this replica uses anywhere,
// exactly the same "one instance, threaded everywhere" discipline
// `publicationCatalog` above already holds for
// DecentralizedPublication. `bitcoinProofVerifier` talks to a public
// block explorer (see anchoring/BitcoinOpReturnProofVerifier.js's own
// header) but is only ever CONSULTED when a person explicitly clicks
// "Verify" in the Publication Center — see application/
// PublicationEvidenceCoordinator.js's own header on why discovery and
// verification stay two separate calls.
//
// 0.8.4 — External Anchor Publication Over Peers. `publicationAnchorCatalog`
// now comes from application/CreatePublicationAnchorPeerExchangeUseCase.js
// instead of application/CreatePublicationAnchorCatalogUseCase.js — the
// SAME kind of LocalPublicationAnchorCatalog instance, now also fed live
// by `publicationAnchorPeerExchange` riding the SAME peerMessageBus/
// peerSessionManager.registry every other peer/PeerMessageBus.js protocol
// in this file already does. An anchor a peer announces is cataloged the
// moment it arrives — application/PublicationAnchorPeerExchange.js never
// once calls `externalAnchorVerifier` below; verification stays exactly
// where 0.8.3 already put it, an explicit "Verify Evidence" click in the
// Publication Center, unchanged by this milestone.
// 0.8.17 — Evidence Provenance & Observation Boundary. `anchorKnowledgeStore`
// is the one LocalAnchorKnowledgeStore instance this replica uses
// anywhere — returned here already wired into `publicationAnchorPeerExchange`
// (PEER acquisition) and threaded below into
// CreateExternalPublicationAnchorOrchestratorUseCase.js (LOCAL
// acquisition), the same "one instance, threaded everywhere" discipline
// `publicationAnchorCatalog` itself already holds.
const { catalog: publicationAnchorCatalog, peerExchange: publicationAnchorPeerExchange, knowledgeStore: anchorKnowledgeStore } = new CreatePublicationAnchorPeerExchangeUseCase().execute({
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry
});

// 0.8.5 — Historical Anchor Discovery & Synchronization.
// `publicationAnchorDiscoveryCoordinator` wraps the SAME
// `publicationAnchorPeerExchange` instance above — never a second one —
// so a caller's discoverFromPeers() call sees exactly the anchors that
// replica's own live wire traffic sees, unchanged. Provided here for a
// future UI to call (e.g. a Publication Center "Discover More Evidence"
// action); this milestone adds no such button itself, the identical
// restraint 0.8.4 already held for `publicationAnchorPeerExchange` before
// any UI consumed it.
const { discoveryCoordinator: publicationAnchorDiscoveryCoordinator } = new CreatePublicationAnchorDiscoveryCoordinatorUseCase().execute({
    peerExchange: publicationAnchorPeerExchange
});

// 0.8.19 — Snapshot Placement Discovery & Peer Synchronization. The first
// wiring for the placement catalog/exchange pipeline 0.8.18 built with no
// peer transport at all (see that milestone's own "Deliberately
// excluded" list) — the exact same "foundation ships unwired, transport
// wires it into ui/main.js" shape 0.8.0/0.8.4 already established for
// anchors. `publicationSnapshotPlacementCatalog` is the one
// LocalPublicationSnapshotPlacementCatalog instance this replica uses
// anywhere, riding the SAME peerMessageBus/peerSessionManager.registry
// every other peer/PeerMessageBus.js protocol in this file already does.
// A placement a peer announces or synchronizes is cataloged the moment it
// arrives — application/PublicationSnapshotPlacementPeerExchange.js never
// once calls application/SnapshotPlacementResolver.js; resolution stays
// an explicit, separate, on-demand call, unwired here, exactly as
// docs/Roadmap.md's own 0.8.18 entry already established for creation.
// `publicationSnapshotPlacementDiscoveryCoordinator` wraps the SAME
// `publicationSnapshotPlacementPeerExchange` instance — never a second
// one — provided here for a future UI to call; this milestone adds no
// such button itself, the identical restraint 0.8.4/0.8.5 already held
// for the anchor-side pair above before any UI consumed either.
//
// 0.8.21 — Persistent Snapshot Placement Catalog & Restart Recovery. The
// use case below now also runs application/
// RestorePublicationSnapshotPlacementCatalogUseCase.js once, synchronously,
// before returning `catalog` — the identical silent, unconsumed
// `restoreResult` this file already discards for
// `publicationAnchorCatalog` above (see application/
// CreatePublicationAnchorPeerExchangeUseCase.js, 0.8.15). Nothing here
// needs to read it; a record left over from a prior process that no
// longer validates or verifies is pruned before this replica's UI can
// ever see it through `publicationSnapshotPlacementCatalog`.
//
// 0.8.24 — Snapshot Placement Provenance & Observation Boundary.
// `placementKnowledgeStore` is the one LocalPlacementKnowledgeStore
// instance this replica uses anywhere — returned here already wired into
// `publicationSnapshotPlacementPeerExchange` (PEER acquisition), the
// identical "one instance, threaded everywhere" discipline
// `anchorKnowledgeStore` above already holds one axis over.
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

// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX. The
// first real wiring of application/SnapshotPlacementResolver.js (0.8.18)
// into this running app — 0.8.18's and 0.8.19's own "Deliberately
// excluded" lists both left resolution completely unwired, the identical
// gap 0.8.3 closed for anchor VERIFICATION five milestones after 0.8.0
// built it. See application/CreateSnapshotPlacementResolutionCoordinatorUseCase.js's
// own header for why this reaches for a NEW, narrowly-scoped composition
// root rather than application/CreateSnapshotPlacementOrchestratorUseCase.js
// (0.8.18) — that one also wires the creation pipeline, which stays
// unwired here on purpose.
//
// `stores` registers the SAME `publicationContentStore` (a
// content/LocalContentStore.js, already this replica's one 'local'
// content backend — see the 0.7.0 wiring above) for `local` placements,
// and, for `ipfs` placements, a real content/IpfsGatewayContentStore.js
// (0.8.66) rather than content/IpfsContentStore.js.
//
// This coordinator is RESOLUTION ONLY — application/
// SnapshotPlacementResolutionCoordinator.js's own resolve() only ever
// calls a registered store's get(), never put() — so it is exactly the
// "ordinary resolution" case docs/Roadmap.md left open at 0.8.65's own
// close: an ordinary person with no IPFS daemon installed or running
// should still be able to resolve an `ipfs://` placement. Kubo's own
// default `http://127.0.0.1:5001` is almost certainly unreachable from
// inside a browser with no local daemon running; a public HTTPS gateway
// is reachable from anywhere. Registering it here, rather than leaving
// `ipfs` unregistered, is the same honest choice this comment already
// described one milestone ago: a placement that really did claim IPFS
// storage gets a real, consulted store, so a resolution failure is an
// honest CONTENT_UNAVAILABLE, never the different claim
// STORE_UNAVAILABLE would make ("this replica isn't even configured to
// try").
//
// content/IpfsContentStore.js is NOT registered here — this is a
// SEPARATE `SnapshotPlacementStoreRegistry` instance from the one the
// CREATION wiring below builds (each call to a `Create*OrchestratorUseCase
// .execute()`/`Create*ResolutionCoordinatorUseCase.execute()` constructs
// its own registry — see both use cases' own headers), so choosing the
// gateway here never silently overwrites or hides Kubo; it stays
// registered, unchanged, wherever PUBLISHING actually needs put() — see
// the 0.8.18 comment below.
// 0.9.505 — Register Arweave as Snapshot Content Store. `storeRegistry` is
// now also captured here (previously discarded) so the Arweave wiring
// below (once `arweaveHostSigner`/`resolvedArweaveGatewayUrl` are
// resolved) can register the SAME ArweaveContentStore instance into THIS
// resolution registry too, alongside the CREATION registry — see that
// wiring's own comment for why one shared instance is registered into
// both rather than two independently constructed ones.
// 0.9.665 — User-Configurable IPFS Gateway Configuration Boundary.
// Resolved here, ahead of both real IpfsGatewayContentStore construction
// sites below (this one and the "Observe Content" verifier further down),
// mirroring the Arweave Gateway resolution below but computed earlier
// since these two consumers are wired before `app` exists — the use case
// and app.provide() calls for the settings page itself are added
// alongside the Arweave Gateway wiring further down, reusing this SAME
// store instance. See core/IpfsGatewayConfiguration.js's own header for
// why this reopens a candidate 0.9.373/0.9.385/0.9.657 each deferred.
const ipfsGatewayConfigurationStore = new IpfsGatewayConfigurationStore(new LocalStorageProvider());
const resolvedIpfsGatewayUrl = (ipfsGatewayConfigurationStore.get() || { gatewayUrl: DEFAULT_IPFS_GATEWAY_URL }).gatewayUrl;
const {
    coordinator: publicationSnapshotPlacementResolutionCoordinator,
    storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry
} = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
    placementCatalog: publicationSnapshotPlacementCatalog,
    stores: [publicationContentStore, new IpfsGatewayContentStore({ gatewayUrl: resolvedIpfsGatewayUrl })]
});

// The presentation-side counterpart of the resolution wiring above: a
// SECOND, independent `storage -> plugin` registry, this one answering
// "how should this placement's own locator read on a screen, and where
// does 'view externally' go?" Mirrors application/
// CreateExternalAnchorEvidenceViewRegistryUseCase.js's own shape exactly,
// one axis over.
const { localSnapshotPlacementView } = new CreateLocalSnapshotPlacementViewUseCase().execute();
const { ipfsSnapshotPlacementView } = new CreateIpfsSnapshotPlacementViewUseCase().execute();
const { placementViewRegistry: snapshotPlacementViewRegistry } = new CreateSnapshotPlacementViewRegistryUseCase().execute({
    placementViews: [localSnapshotPlacementView, ipfsSnapshotPlacementView]
});

// 0.8.25 — Explicit Snapshot Placement Creation UX. The first UI wiring
// for the CREATION-side pipeline 0.8.18 built with no UI consumer at all
// (see that milestone's own "Deliberately excluded" list, and
// application/CreateSnapshotPlacementOrchestratorUseCase.js's own comment
// above on why the RESOLUTION wiring reaches for its own composition
// root instead) — the exact same "read-side got wired first, write-side
// stays unwired until its own milestone" shape 0.8.11 already closed for
// anchor evidence.
//
// `publicationCatalogDiscoveryProvider`/`publicationCatalogContentResolver`
// bridge application/CreateExternalSnapshotPlacementUseCase.js's own
// 0.8.18 collaborator shapes (discovery/DiscoveryProvider.js#findById(),
// discovery/ContentResolver.js#resolve()/verify()) onto the SAME
// `publicationCatalog`/`publicationContentStore` this replica's real
// Publication Center already reads and writes everywhere else — never a
// second, disconnected publication index. See discovery/
// PublicationCatalogDiscoveryProvider.js's and discovery/
// PublicationCatalogContentResolver.js's own headers for why that bridge
// is necessary at all.
//
// `stores` registers `publicationContentStore` for `local`, exactly as
// the RESOLUTION wiring above also does, and a real content/
// IpfsContentStore.js — Kubo, NOT content/IpfsGatewayContentStore.js —
// for `ipfs`. 0.8.66 deliberately keeps that difference: this registry
// backs application/CreateExternalSnapshotPlacementUseCase.js, which
// PLACES new content by calling a store's put(), and content/
// IpfsGatewayContentStore.js's own put() is unimplemented on purpose (a
// read-only HTTPS gateway cannot accept content for publishing — see
// that class's own header). Creating a NEW `ipfs`-storage placement is
// therefore still "local capability," requiring a real Kubo node, the
// same way it always has; only ORDINARY RESOLUTION of an already-placed
// `ipfs://` locator (the coordinator above) is answered through the
// gateway, with no daemon required. Two independent registries, two
// independently made choices — never one silently overwriting the other.
// `knowledgeStore` threads the SAME `placementKnowledgeStore` instance
// `publicationSnapshotPlacementPeerExchange` above already writes into,
// so a locally created placement records its own LOCAL acquisition entry
// right alongside PACKAGE/PEER entries for placements this replica
// learned about some other way — see application/
// CreateSnapshotPlacementOrchestratorUseCase.js's own 0.8.24 comment.
//
// 0.9.483 — Activate Production Snapshot Placement Peer Announcement.
// `peerExchange` threads the SAME `publicationSnapshotPlacementPeerExchange`
// instance built above — never a second one — so a placement created
// right here, through this replica's one production creation pipeline,
// is also announce()d to every currently connected peer, closing the gap
// 0.9.482's own audit found: this exchange's announce() was already fully
// implemented and already reachable from THIS replica's live peer
// connection, but nothing in production ever called it. See application/
// CreatePublicationSnapshotPlacementUseCase.js's own 0.9.483 comment for
// the failure-isolation discipline this addition holds to — an
// unreachable or disconnected peer network never prevents, undoes, or
// even delays a placement this replica already verified and cataloged.
//
// Only `createExternalSnapshotPlacementUseCase` and `storeRegistry` are
// actually consumed below — `snapshotPlacementResolver`/`verifier`/
// `createPublicationSnapshotPlacementUseCase` are silently discarded, the
// identical "unconsumed collaborator from a composition root built for a
// wider purpose" posture this file already holds for `restoreResult`
// elsewhere (see application/CreatePublicationAnchorPeerExchangeUseCase.js,
// 0.8.15) — resolution stays wired exactly once, through
// `publicationSnapshotPlacementResolutionCoordinator` above, never
// duplicated by a second resolver this page never uses.
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
    stores: [publicationContentStore, new IpfsContentStore()],
    knowledgeStore: placementKnowledgeStore,
    peerExchange: publicationSnapshotPlacementPeerExchange
});
const { coordinator: snapshotPlacementCreationCoordinator } = new CreateSnapshotPlacementCreationCoordinatorUseCase().execute({
    createExternalSnapshotPlacementUseCase,
    storeRegistry: snapshotPlacementStoreRegistry
});

// 0.9.299 — Content Creation Provider Preference Integration. Wraps the
// SAME `snapshotPlacementCreationCoordinator`/`snapshotPlacementStoreRegistry`
// just built above with a stored CONTENT role provider preference
// (storage/RoleProviderPreferenceStore.js, 0.9.294) — see application/
// CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js's own
// header for why Discovery/Proof stay structurally inert here.
// `createPlacement(entry, storage)` in ui/views/DecentralizedPublicationsView
// .js still always names an explicit storage, completely unchanged — that
// click handler still only ever calls `snapshotPlacementCreationCoordinator`
// above. 0.9.301 added the ONE caller of THIS coordinator instead: that
// same view's separate "Use Preferred Provider" action.
const {
    coordinator: preferredSnapshotPlacementCreationCoordinator,
    preferenceStore: roleProviderPreferenceStore
} = new CreatePreferredSnapshotPlacementCreationCoordinatorUseCase().execute({
    snapshotPlacementCreationCoordinator,
    contentRegistry: snapshotPlacementStoreRegistry
});

// 0.9.302 — Content Provider Preference Settings Entry Point. The WRITE
// half of the preference chain the wiring above already reads from —
// wired against the EXACT SAME `roleProviderPreferenceStore` instance
// `preferredSnapshotPlacementCreationCoordinator` above resolves through
// (never a second, disconnected RoleProviderPreferenceStore), so a
// preference saved by ui/views/ContentProviderSettingsView.js is
// immediately what "Use Preferred Provider" above reads back. See
// application/SetRoleProviderPreferenceUseCase.js's own header.
const setRoleProviderPreferenceUseCase = new SetRoleProviderPreferenceUseCase({
    preferenceStore: roleProviderPreferenceStore
});

// 0.8.33 — Local Snapshot Content Availability & Integrity UX. Reads
// through the SAME `publicationContentStore` (this replica's own 'local'
// content/ContentStore.js) every other local content read in this file
// already goes through — deliberately never the `stores`/registry list
// above, which also knows how to reach `ipfs`: checking whether THIS
// replica already possesses bytes is a different question from resolving
// a placement's claimed locator, and stays answerable with no store
// registry, no placement, and no network object at all. See application/
// CheckLocalSnapshotContentAvailabilityUseCase.js's own header.
const localSnapshotContentAvailabilityUseCase = new CheckLocalSnapshotContentAvailabilityUseCase(publicationContentStore);

// 0.8.36 — Unified Explicit Snapshot Materialization Sources. ONE shared
// hash-verify-then-store boundary, over the SAME `publicationContentStore`
// every other local read/write in this file already goes through — never
// a second, disconnected store. Both the offline-package path (0.8.32,
// immediately below) and the placement-backed path (0.8.35, immediately
// after it) are wired against this SAME instance, so neither one can
// silently drift into its own storage or integrity rules. See application/
// StoreSnapshotContentUseCase.js's own header.
const storeSnapshotContentUseCase = new StoreSnapshotContentUseCase(publicationContentStore);

// 0.8.34 — Explicit Snapshot Materialization UX. The offline import side
// application/ImportPublicationSnapshotTransferPackageUseCase.js (0.8.32)
// already implemented with no UI consumer at all — wired here through the
// SAME `storeSnapshotContentUseCase`/`publicationCatalog` every other local
// read/write in this file already goes through, never a second, disconnected
// store or catalog. application/SnapshotContentMaterializationCoordinator.js
// forwards straight to it; see that class's own header on why it adds no
// source-discovery of its own for this first version.
const importPublicationSnapshotTransferPackageUseCase = new ImportPublicationSnapshotTransferPackageUseCase(storeSnapshotContentUseCase, publicationCatalog);

// 0.9.215 — Snapshot Export Capability Integration. The export-side
// counterpart of the import wiring immediately above, over the SAME
// `publicationCatalog`/`publicationContentStore` every other local
// read/write in this file already goes through — never a second,
// disconnected catalog or store. application/
// BuildPublicationSnapshotTransferPackageUseCase.js (0.8.32) has been
// fully implemented since the same milestone that built import; only its
// composition here, and `snapshotContentMaterializationCoordinator`'s own
// new `export()` method below, were ever missing. See that use case's own
// header for why it performs no hash verification (that stays the
// importing side's job) and application/
// SnapshotContentMaterializationCoordinator.js's own header for why
// `export()` adds no new orchestration of its own.
const buildPublicationSnapshotTransferPackageUseCase = new BuildPublicationSnapshotTransferPackageUseCase({
    publicationCatalog,
    contentStore: publicationContentStore
});
const snapshotContentMaterializationCoordinator = new SnapshotContentMaterializationCoordinator(
    importPublicationSnapshotTransferPackageUseCase, buildPublicationSnapshotTransferPackageUseCase
);

// 0.9.215 — a thin `(publicationId) -> Promise<PublicationSnapshotTransferPackage>`
// capability, injected the identical way `discoverSnapshotCommand`/
// `materializeSelectedSnapshotCommand` already are, so `ui/views/
// WorldView.js`'s own `exportOwnSnapshot()` wrapper can call it without
// this file's UI layer ever importing
// SnapshotContentMaterializationCoordinator.js, BuildPublicationSnapshotTransferPackageUseCase.js,
// or publicationContentStore directly.
const exportSnapshotCommand = (publicationId) => snapshotContentMaterializationCoordinator.export(publicationId);

// 0.8.35 — Explicit Placement-Backed Snapshot Materialization. The
// placement-backed sibling of the wiring immediately above — it reuses
// the SAME `publicationSnapshotPlacementResolutionCoordinator` (0.8.20)
// "Resolve Snapshot" already calls, so a placement that resolves for one
// action resolves identically for the other, and the SAME
// `storeSnapshotContentUseCase`/`publicationCatalog` every other local
// read/write in this file already goes through — never a second,
// disconnected store, catalog, or resolver. application/
// SnapshotPlacementMaterializationCoordinator.js forwards straight to
// application/MaterializeSnapshotFromPlacementUseCase.js; see that
// coordinator's own header on why it adds no placement ranking or
// automatic fallback.
const materializeSnapshotFromPlacementUseCase = new MaterializeSnapshotFromPlacementUseCase(
    publicationSnapshotPlacementResolutionCoordinator, storeSnapshotContentUseCase, publicationCatalog
);
const snapshotPlacementMaterializationCoordinator = new SnapshotPlacementMaterializationCoordinator(materializeSnapshotFromPlacementUseCase);

// 0.8.37 — Explicit Peer Snapshot Content Transfer. The THIRD explicit
// caller of the SAME `storeSnapshotContentUseCase`/`publicationCatalog`
// every other local read/write in this file already goes through — never
// a second, disconnected store or catalog. `publicationSnapshotContentPeerExchange`
// rides the SAME `peerMessageBus`/`peerSessionManager.registry` every
// other peer/PeerMessageBus.js protocol in this file already does, under
// its own 'forkbuild:snapshot-content-transfer' namespace — entirely
// independent of `publicationPeerContentExchange` (0.7.4) immediately
// above, which stays wired exactly as before, unchanged. application/
// SnapshotPeerMaterializationCoordinator.js forwards straight to
// application/MaterializeSnapshotFromPeerUseCase.js; see that use case's
// own header on why it adds no peer ranking, fallback, or automatic
// retrieval.
const { peerExchange: publicationSnapshotContentPeerExchange } = new CreatePublicationSnapshotContentPeerExchangeUseCase().execute({
    contentStore: publicationContentStore,
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry
});
const materializeSnapshotFromPeerUseCase = new MaterializeSnapshotFromPeerUseCase(
    publicationSnapshotContentPeerExchange, storeSnapshotContentUseCase, publicationCatalog
);
const snapshotPeerMaterializationCoordinator = new SnapshotPeerMaterializationCoordinator(materializeSnapshotFromPeerUseCase);

// 0.8.40 — Snapshot Possession Observation Exchange. The question-only
// sibling of the wiring immediately above: "does the selected peer
// currently possess bytes for this hash?" rather than "give me the
// bytes." Reuses the SAME `localSnapshotContentAvailabilityUseCase`
// (0.8.33) every "Check Local Snapshot" click already goes through — the
// RESPONDING side of `publicationSnapshotPossessionPeerExchange` answers a
// peer's REQUEST with literally that same local check, never a second
// definition of possession — and rides the SAME `peerMessageBus`/
// `peerSessionManager.registry` every other peer/PeerMessageBus.js
// protocol in this file already does, under its own
// 'forkbuild:snapshot-possession' namespace, entirely independent of
// `publicationSnapshotContentPeerExchange` (0.8.37) immediately above.
// application/SnapshotPeerPossessionCoordinator.js forwards straight to
// application/ObservePeerSnapshotPossessionUseCase.js; see that use case's
// own header on why it never stores a byte, creates a placement, or asks
// more than the one peer a person explicitly selected.
const { peerExchange: publicationSnapshotPossessionPeerExchange } = new CreatePublicationSnapshotPossessionPeerExchangeUseCase().execute({
    checkLocalSnapshotContentAvailabilityUseCase: localSnapshotContentAvailabilityUseCase,
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry
});
const observePeerSnapshotPossessionUseCase = new ObservePeerSnapshotPossessionUseCase(publicationSnapshotPossessionPeerExchange);
const snapshotPeerPossessionCoordinator = new SnapshotPeerPossessionCoordinator(observePeerSnapshotPossessionUseCase);

// 0.8.42 — Explicit Snapshot Source Selection & Materialization UX. The
// missing dispatcher in front of the three coordinators immediately
// above: given one application/SnapshotMaterializationSourceSelection.js
// record, application/SnapshotMaterializationSelectionCoordinator.js calls
// the ONE of `snapshotContentMaterializationCoordinator`/
// `snapshotPlacementMaterializationCoordinator`/
// `snapshotPeerMaterializationCoordinator` its own `kind` names, unchanged
// — the SAME three instances every other explicit materialization action
// on this page already uses, never a second, disconnected set. See that
// class's own header on why it adds no source discovery, ranking, or
// fallback of its own.
const snapshotMaterializationSelectionCoordinator = new SnapshotMaterializationSelectionCoordinator({
    packageCoordinator: snapshotContentMaterializationCoordinator,
    placementCoordinator: snapshotPlacementMaterializationCoordinator,
    peerCoordinator: snapshotPeerMaterializationCoordinator
});

// 0.8.16 — Evidence Synchronization UX & Explicit Historical Discovery.
// The thin, application-facing layer ABOVE `publicationAnchorDiscoveryCoordinator`
// this milestone's own design calls for — it wraps the SAME coordinator
// (never a second one) alongside `peerSessionManager.registry`, the
// identical `ConnectedPeerRegistry` instance `publicationAnchorPeerExchange`
// above already attaches every connection to, so "authenticated peers, in
// registry order" means the same thing here it already means for
// `announce()`. Provided here for ui/views/DecentralizedPublicationsView.js's
// own explicit "Discover from Peers" action — see application/
// PublicationEvidenceDiscoveryCoordinator.js's own header.
const { coordinator: publicationEvidenceDiscoveryCoordinator } = new CreatePublicationEvidenceDiscoveryCoordinatorUseCase().execute({
    anchorDiscoveryCoordinator: publicationAnchorDiscoveryCoordinator,
    connectedPeerRegistry: peerSessionManager.registry
});

// 0.8.30 — Explicit Replica Knowledge Synchronization. The unified
// sibling of `publicationEvidenceDiscoveryCoordinator` immediately
// above: wraps the SAME `publicationAnchorDiscoveryCoordinator` AND
// `publicationSnapshotPlacementDiscoveryCoordinator` (0.8.19, provided
// above but never before consumed by any UI — see that coordinator's own
// wiring comment) over the SAME `peerSessionManager.registry`, so one
// explicit "Synchronize with Peers" click asks every authenticated peer
// about anchors and placements together, in one call, against one peer
// list. Provided here for ui/views/DecentralizedPublicationsView.js's
// own explicit "Synchronize with Peers" action — see application/
// PublicationKnowledgeSynchronizationCoordinator.js's own header.
const { coordinator: publicationKnowledgeSynchronizationCoordinator } = new CreatePublicationKnowledgeSynchronizationCoordinatorUseCase().execute({
    anchorDiscoveryCoordinator: publicationAnchorDiscoveryCoordinator,
    placementDiscoveryCoordinator: publicationSnapshotPlacementDiscoveryCoordinator,
    connectedPeerRegistry: peerSessionManager.registry
});
const { bitcoinProofVerifier } = new CreateBitcoinAnchorProofVerifierUseCase().execute();
// 0.9.425 — `proofVerifierRegistry` is captured here (as
// `externalAnchorProofVerifierRegistry`) alongside `externalAnchorVerifier`
// itself, purely so this file's own later Arweave wiring can `.register()`
// a second proofVerifier into the SAME registry instance — nothing about
// `externalAnchorVerifier`'s own construction or Bitcoin's own wiring
// changes.
const { externalAnchorVerifier, proofVerifierRegistry: externalAnchorProofVerifierRegistry } = new CreateExternalAnchorVerifierUseCase().execute({
    proofVerifiers: [bitcoinProofVerifier]
});
const { coordinator: publicationEvidenceCoordinator } = new CreatePublicationEvidenceCoordinatorUseCase().execute({
    anchorCatalog: publicationAnchorCatalog,
    externalAnchorVerifier
});

// 0.8.11 — Explicit External Anchoring UX. The first UI wiring for the
// CREATION-side pipeline 0.8.8-0.8.10 built with no UI consumer at all
// (see each of those milestones' own "Deliberately excluded" lists) —
// the exact same "read-side got wired in 0.8.3, write-side stays unwired
// until its own milestone" shape this file's own 0.8.3 comment above
// already states, now finally closed for creation too.
//
// `bitcoinBroadcaster` is deliberately NOT a real Bitcoin broadcaster.
// anchoring/BitcoinAnchorPublisher.js's own header (0.8.9) and
// docs/Roadmap.md's own "Deliberately excluded" list for 0.8.9 both name
// wallet/transaction-signing capability as a future, separately sized
// concern this codebase has never built — no private keys, no UTXO
// management, no real network broadcast live anywhere in this
// application. Rather than hide "Create Bitcoin Anchor" from the running
// app entirely until that future milestone lands, this replica wires a
// REAL BitcoinAnchorPublisher against a broadcaster that always, and
// honestly, reports PUBLISH_UNAVAILABLE with the actual reason —
// satisfying anchoring/BitcoinAnchorPublisher.js's own `broadcaster`
// contract exactly, never fabricating a `broadcast: true` result. This
// lets a person exercise the full explicit "Create -> observe the
// result" flow for real, today, and see the exact honest outcome
// application/ExternalAnchorCreationOutcome.js already names for
// this situation — never a crash, never a silent no-op button. The
// moment a real wallet-backed broadcaster exists, it plugs in here with
// zero changes to anything else in this file, ui/views/
// DecentralizedPublicationsView.js, or any application/ class — exactly
// the "future milestone can wire this without either changing" promise
// docs/Roadmap.md's own 0.8.10 entry already made for this composition
// root.
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
// `createPublicationAnchorUseCase` (0.8.10's own generic, signer/
// broadcaster-free anchor-catalog use case) is ALSO captured here, in
// addition to the two bindings every earlier milestone already used — the
// SAME instance `createExternalPublicationAnchorUseCase` composes
// internally, never a second, disconnected one. 0.9.472 hands it straight
// to `CreateBaseAnchorPublisherUseCase` below, exactly as `anchoring/
// BaseAnchorPublisher.js`'s own header requires ("createPublicationAnchorUseCase
// ... needs a real publication catalog, identity provider, verifier, and
// anchor catalog") — reusing this one construction rather than building a
// second CreatePublicationAnchorUseCase against the same catalogs.
const { createExternalPublicationAnchorUseCase, publisherRegistry: externalAnchorPublisherRegistry, createPublicationAnchorUseCase } =
    new CreateExternalPublicationAnchorOrchestratorUseCase().execute({
        publicationCatalog,
        anchorCatalog: publicationAnchorCatalog,
        identityProvider,
        publishers: [bitcoinAnchorPublisher],
        // 0.8.17 — Evidence Provenance & Observation Boundary.
        knowledgeStore: anchorKnowledgeStore
    });
const { coordinator: publicationAnchorCreationCoordinator } = new CreatePublicationAnchorCreationCoordinatorUseCase().execute({
    createExternalPublicationAnchorUseCase,
    publisherRegistry: externalAnchorPublisherRegistry
});

// 0.8.14 — External Evidence Inspection & Locator UX. The presentation-
// side counterpart of `externalAnchorPublisherRegistry`/
// `proofVerifierRegistry` above: a THIRD, independent `anchorType ->
// plugin` registry, this one answering "how should this anchor's own
// proof read on a screen, and where does 'view external evidence' go?"
// `bitcoinAnchorEvidenceView` never talks to a block explorer or wallet
// — see anchoring/BitcoinAnchorEvidenceView.js's own header — so, unlike
// `bitcoinProofVerifier`/`bitcoinAnchorPublisher` above, it needs no
// fake/no-op collaborator standing in for a capability this replica
// doesn't have yet.
const { bitcoinAnchorEvidenceView } = new CreateBitcoinAnchorEvidenceViewUseCase().execute();
const { evidenceViewRegistry: externalAnchorEvidenceViewRegistry } = new CreateExternalAnchorEvidenceViewRegistryUseCase().execute({
    evidenceViews: [bitcoinAnchorEvidenceView]
});

// 0.8.57 — Bitcoin Anchor Proof & Confirmation Inspection UI. The first UI
// wiring for 0.8.54's confirmation observer and 0.8.55's reconciliation
// view, both built with no UI consumer at all (see each of those
// milestones' own "Deliberately excluded" lists, and 0.8.56's own —
// "Wiring anchoring/BitcoinAnchorConfirmationObserver.js and anchoring/
// BitcoinEsploraTransactionConfirmationObserver.js into ui/main.js for the
// first time... stays real, separately sized future work"). Unlike
// `bitcoinBroadcaster` above, `bitcoinEsploraTransactionConfirmationObserver`
// needs no fake standing in for a missing capability — reading public
// confirmation status requires no wallet and no private key, exactly like
// `bitcoinProofVerifier` above, which this reconciliation view reuses
// UNCHANGED rather than constructing a second, disconnected instance.
const { bitcoinEsploraTransactionConfirmationObserver } = new CreateBitcoinEsploraTransactionConfirmationObserverUseCase().execute();
const { bitcoinAnchorConfirmationObserver } = new CreateBitcoinAnchorConfirmationObserverUseCase().execute({
    confirmationSource: bitcoinEsploraTransactionConfirmationObserver
});
const { bitcoinAnchorProofReconciliationView } = new CreateBitcoinAnchorProofReconciliationViewUseCase().execute({
    bitcoinAnchorConfirmationObserver, bitcoinProofVerifier
});

// 0.8.58 — Explicit Bitcoin Wallet Connection & Signing UX. The first UI
// wiring for anchoring/BitcoinAnchorWalletSigner.js (0.8.50) and every
// stage built on top of it through 0.8.53 — none of them has ever been
// reachable from this running app before now, exactly as this milestone's
// own header names: reading confirmation/content-proof status (0.8.54-
// 0.8.57, wired immediately above) needs no wallet at all, but actually
// obtaining a `wallet` capable of `signPsbt()` does. `injectedProvider` is
// `window.unisat` when a compatible extension happens to be installed in
// this browser, and `null` otherwise — a first-class, expected outcome
// anchoring/BitcoinInjectedProviderWalletAdapter.js's own header already
// names, never a condition this file works around. `bitcoinWalletConnection`
// is provided as ONE shared instance across the whole app, exactly like
// `bitcoinAnchorProofReconciliationView` immediately above — connecting
// once is reflected everywhere this page shows wallet status, and nothing
// here persists it across a reload; see anchoring/BitcoinWalletConnection.js's
// own header, "A CAPABILITY, NEVER A SECRET."
const { bitcoinInjectedProviderWalletAdapter } = new CreateBitcoinInjectedProviderWalletAdapterUseCase().execute({
    injectedProvider: (typeof window !== 'undefined' && window.unisat) ? window.unisat : null
});
const { bitcoinWalletConnection } = new CreateBitcoinWalletConnectionUseCase().execute({
    provider: bitcoinInjectedProviderWalletAdapter
});

// 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation. Closes
// the gap anchoring/BitcoinAnchorTransactionBuilder.js's own header (0.8.47)
// named directly: "Fetching real UTXOs for a real address is a future
// concern." `bitcoinEsploraWalletFundingSource` needs no wallet and no
// private key — reading which outputs an address can currently spend is
// public information, exactly like `bitcoinEsploraTransactionConfirmationObserver`
// immediately above, which is why this replica reuses the SAME default
// Esplora-compatible host rather than configuring a second one. See
// anchoring/BitcoinWalletFundingObserver.js's own header on why this class
// only ever OBSERVES an account's own spendable outputs — it never selects,
// signs, or spends anything itself.
const { bitcoinEsploraWalletFundingSource } = new CreateBitcoinEsploraWalletFundingSourceUseCase().execute();
const { bitcoinWalletFundingObserver } = new CreateBitcoinWalletFundingObserverUseCase().execute({
    fundingSource: bitcoinEsploraWalletFundingSource
});

// 0.8.90 — Explicit Base Network & Account Observation. The first UI
// wiring for a real, concrete Base capability — everything before this
// milestone only ever RESERVED `BlockchainKind.BASE` (0.8.89). Mirrors
// `bitcoinInjectedProviderWalletAdapter`/`bitcoinWalletConnection`
// immediately above exactly, one chain over: `injectedProvider` is
// `window.ethereum` when a compatible extension happens to be installed in
// this browser, and `null` otherwise — a first-class, expected outcome
// base/BaseInjectedProviderWalletAdapter.js's own header already names.
// `baseWalletConnection` is provided as ONE shared instance across the
// whole app, exactly like `bitcoinWalletConnection`; it exposes an account
// address and NOTHING resembling a signing capability — see base/
// BaseWalletConnection.js's own header. `baseJsonRpcClient` needs no
// wallet and no private key at all — reading a chain id or a native
// balance is public information, read fresh only on an explicit "Observe
// Base Account" click; see base/BaseNetworkObserver.js's own header on why
// this is the ONE place this app ever asks a Base RPC endpoint anything.
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

// 0.8.91 — Explicit Base Publication Transaction Construction. Closes the
// gap 0.8.90's own "What's left, and deliberately unbuilt" named
// directly: an explicit "Create Base Transaction Plan" action. Reuses the
// SAME `baseJsonRpcClient` instance `baseNetworkObserver` immediately
// above already reads through — one shared RPC client, never a second,
// disconnected one — because `base/BasePublicationTransactionPlanner.js`
// needs nothing from a Base RPC endpoint that `base/
// BaseJsonRpcClient.js` doesn't already, honestly, wrap (see that file's
// own header, "SIX METHODS ARE WRAPPED, AND NO OTHERS").
// `basePublicationTransactionPlanCoordinator` is a deliberately thin
// wiring on top of the planner, mirroring exactly how
// `bitcoinAnchorTransactionConstructionCoordinator` below wires the 0.8.47
// Bitcoin builder one chain over — see application/
// BasePublicationTransactionPlanCoordinator.js's own header on why it
// takes no publicationCatalog and never re-observes an account itself.
const { basePublicationTransactionPlanner } = new CreateBasePublicationTransactionPlannerUseCase().execute({
    rpcSource: baseJsonRpcClient
});
const { coordinator: basePublicationTransactionPlanCoordinator } = new CreateBasePublicationTransactionPlanCoordinatorUseCase().execute({
    basePublicationTransactionPlanner
});

// 0.8.93 — Explicit Base Reviewed Transaction Signing. Closes the gap
// 0.8.92's own "What's left, and deliberately unbuilt" named directly: an
// explicit "Sign Reviewed Transaction" action. `baseInjectedProviderWalletTransactionSigner`
// reads the SAME `window.ethereum` (or `null`) `baseInjectedProviderWalletAdapter`
// above already does — one shared browser capability, read twice for two
// deliberately separate purposes (connecting an account vs. signing a
// transaction), never widened into one object doing both. See
// `application/CreateBaseInjectedProviderWalletTransactionSignerUseCase.js`'s
// own header. `baseReviewedSigningCoordinator` takes no collaborator up
// front — see `application/BaseReviewedSigningCoordinator.js`'s own header
// on why it constructs a fresh signer on every explicit sign() call
// instead.
const { baseInjectedProviderWalletTransactionSigner } = new CreateBaseInjectedProviderWalletTransactionSignerUseCase().execute({
    injectedProvider: (typeof window !== 'undefined' && window.ethereum) ? window.ethereum : null
});
const { coordinator: baseReviewedSigningCoordinator } = new CreateBaseReviewedSigningCoordinatorUseCase().execute();

// 0.8.94 — Explicit Base Signed Transaction Verification & Finalization.
// Closes the gap 0.8.93's own header named directly: "Genuinely
// confirming a wallet's claimed signature belongs to the exact
// transaction this milestone asked to have signed is this codebase's own
// deliberately separate next milestone." `baseSignedTransactionFinalizer`
// is a pure, offline cryptographic check — RLP decode, Keccak-256, and
// secp256k1 sender recovery, all from first principles (see `base/
// BaseSignedTransactionCodec.js`'s own header) — and
// `baseSignedTransactionFinalizationCoordinator` is a deliberately thin
// wiring on top of it, mirroring exactly how
// `bitcoinAnchorSignedPsbtFinalizationCoordinator` below wires the 0.8.51
// finalizer one chain over.
const { baseSignedTransactionFinalizer } = new CreateBaseSignedTransactionFinalizerUseCase().execute();
const { coordinator: baseSignedTransactionFinalizationCoordinator } = new CreateBaseSignedTransactionFinalizationCoordinatorUseCase().execute({
    baseSignedTransactionFinalizer
});

// 0.8.95 — Explicit Base Transaction Broadcast. Closes the gap 0.8.94's
// own header named directly: "It does NOT mean broadcast, accepted by
// Base, included in a block, confirmed, published, or immutable... those
// remain entirely separate, later facts (0.8.95 and 0.8.96)."
// `baseTransactionBroadcaster` reuses the SAME `baseJsonRpcClient`
// instance `baseNetworkObserver`/`basePublicationTransactionPlanner`
// above already read through — one shared RPC client, never a second,
// disconnected one — because broadcasting needs nothing from a Base RPC
// endpoint beyond the ONE write `base/BaseJsonRpcClient.js`'s own header
// now documents wrapping, `eth_sendRawTransaction`.
// `baseTransactionBroadcastCoordinator` is a deliberately thin wiring on
// top of it, mirroring exactly how `bitcoinAnchorBroadcastCoordinator`
// below wires the 0.8.52 broadcaster one chain over.
const { baseTransactionBroadcaster } = new CreateBaseTransactionBroadcasterUseCase().execute({
    rpcSource: baseJsonRpcClient
});
const { coordinator: baseTransactionBroadcastCoordinator } = new CreateBaseTransactionBroadcastCoordinatorUseCase().execute({
    baseTransactionBroadcaster
});

// 0.9.472 — Expose Review-Preserving Base Anchor Action.
//
// tests/BaseReviewPreservingAnchorPublishingIntegrationBoundaryAudit.test.js
// (0.9.471) found anchoring/BaseAnchorPublisher.js (0.9.470) real,
// review-preserving, and proof-round-trip-complete against entirely real
// collaborators, but constructed NOWHERE in this file — this is that one
// missing composition, and nothing else. `baseAnchorPublisher` is built
// from the SAME `baseTransactionBroadcaster` immediately above and the SAME
// `createPublicationAnchorUseCase` the Bitcoin/Arweave orchestrator above
// already constructed — never a second, disconnected broadcaster or anchor
// use case. Its other three collaborators (`baseReviewedSigningCoordinator`,
// `baseSignedTransactionFinalizer`, `createBaseAnchorPublicationRecordUseCase`)
// are left at `CreateBaseAnchorPublisherUseCase`'s own stateless defaults —
// see that file's own header on why a caller-supplied one would only ever
// be a test double, never a behavior change. Deliberately NOT registered
// into `externalAnchorPublisherRegistry` below — see anchoring/
// BaseAnchorPublisher.js's own header, "NOT REGISTERED IN application/
// ExternalAnchorPublisherRegistry.js," a decision this milestone does not
// revisit.
const { baseAnchorPublisher } = new CreateBaseAnchorPublisherUseCase().execute({
    baseTransactionBroadcaster,
    createPublicationAnchorUseCase
});

// 0.8.96 — Explicit Base Transaction Inclusion & Confirmation Observation.
// Closes the gap 0.8.95's own header named directly: "Whether a broadcasted
// transaction later gets mined into a block is a separate, later question,
// asked by a separate, later explicit confirmation-observation action."
// `baseTransactionInclusionObserver` reuses the SAME `baseJsonRpcClient`
// instance every other Base capability above already reads through — one
// shared RPC client, never a second, disconnected one — because observing
// inclusion needs nothing from a Base RPC endpoint beyond the two reads
// `base/BaseJsonRpcClient.js`'s own header now documents wrapping,
// `eth_getTransactionReceipt`/`eth_blockNumber`.
// `baseTransactionInclusionObservationCoordinator` is a deliberately thin
// wiring on top of it, mirroring exactly how
// `bitcoinAnchorConfirmationCoordinator` below wires the 0.8.54 confirmation
// observer one chain over.
const { baseTransactionInclusionObserver } = new CreateBaseTransactionInclusionObserverUseCase().execute({
    rpcSource: baseJsonRpcClient
});
const { coordinator: baseTransactionInclusionObservationCoordinator } = new CreateBaseTransactionInclusionObservationCoordinatorUseCase().execute({
    baseTransactionInclusionObserver
});

// 0.8.61 — Explicit Bitcoin Anchor Transaction Construction UI. Closes the
// gap 0.8.60's own "Deliberately excluded" list named directly: "wiring a
// 'Create Transaction Plan' action into this page." `bitcoinAnchorTransactionBuilder`
// is the SAME class every milestone since 0.8.47 has already built plans
// through — unchanged fee/dust policy, no new Bitcoin primitive — and
// `bitcoinAnchorTransactionConstructionCoordinator` is a deliberately thin
// wiring on top of it: it turns an already-OBSERVED funding fact into an
// already-built plan, and does nothing else. See application/
// BitcoinAnchorTransactionConstructionCoordinator.js's own header on why it
// takes no publicationCatalog and never re-observes funding itself.
const { bitcoinAnchorTransactionBuilder } = new CreateBitcoinAnchorTransactionBuilderUseCase().execute({ network: 'mainnet' });
const { coordinator: bitcoinAnchorTransactionConstructionCoordinator } = new CreateBitcoinAnchorTransactionConstructionCoordinatorUseCase().execute({
    bitcoinAnchorTransactionBuilder
});

// 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI. Closes the gap
// 0.8.61's own "Deliberately excluded" list named directly: "Address
// decoding, and the PSBT/signing wiring it would unlock... 0.8.62's own
// concern." `bitcoinAnchorPsbtBuilder` is the SAME, unchanged 0.8.48 class
// every PSBT-shaped description in this codebase has always been built
// through; `bitcoinAnchorTransactionReviewCoordinator` is the new, thin
// bridge that finally connects a 0.8.61 plan-level construction to it,
// deriving the one fact neither ever had a real source for — an account's
// own scriptPubKey — via the new anchoring/BitcoinSegwitAddressScriptPubKey.js.
// `bitcoinAnchorReviewedSigningCoordinator` needs no collaborator supplied
// here at all: it constructs a fresh anchoring/BitcoinAnchorReviewedPsbtSigner.js
// (0.8.59, unchanged) for whichever wallet it is handed at the moment of
// each explicit "Sign Reviewed Transaction" click — see that coordinator's
// own header on why it never holds a wallet reference longer than one call.
const { bitcoinAnchorPsbtBuilder } = new CreateBitcoinAnchorPsbtBuilderUseCase().execute();
const { coordinator: bitcoinAnchorTransactionReviewCoordinator } = new CreateBitcoinAnchorTransactionReviewCoordinatorUseCase().execute({
    bitcoinAnchorPsbtBuilder
});
const { coordinator: bitcoinAnchorReviewedSigningCoordinator } = new CreateBitcoinAnchorReviewedSigningCoordinatorUseCase().execute();

// 0.8.63 — Explicit Signed PSBT Verification & Transaction Finalization UI.
// Closes the gap 0.8.62's own "Deliberately excluded" list named directly:
// "Finalization... is its own, separately sized future milestone."
// `bitcoinAnchorSignedPsbtFinalizer` is the SAME, unchanged 0.8.51 class
// that has cryptographically verified and finalized a signed PSBT since
// that milestone — this is its first real wiring into this running app.
// `bitcoinAnchorSignedPsbtFinalizationCoordinator` is a deliberately thin
// wiring on top of it, mirroring exactly how `bitcoinAnchorReviewedSigningCoordinator`
// immediately above wires the 0.8.59 signer one stage earlier.
const { bitcoinAnchorSignedPsbtFinalizer } = new CreateBitcoinAnchorSignedPsbtFinalizerUseCase().execute();
const { coordinator: bitcoinAnchorSignedPsbtFinalizationCoordinator } = new CreateBitcoinAnchorSignedPsbtFinalizationCoordinatorUseCase().execute({
    bitcoinAnchorSignedPsbtFinalizer
});

// 0.8.64 — Explicit Bitcoin Anchor Broadcast UI. Closes the gap 0.8.63's
// own "Deliberately excluded" list named directly: "An explicit 'Broadcast
// Transaction' action is its own, separately sized future milestone
// (0.8.64)." Unlike `bitcoinBroadcaster` above — deliberately fake because
// the one-shot "Create Anchor" pipeline it serves has no wallet-signing
// capability wired into it at all — this pipeline now has one, real,
// end to end: an OBSERVED funding fact (0.8.60), a CONSTRUCTED plan
// (0.8.61), a wallet's own SIGNED PSBT (0.8.62), and an independently,
// cryptographically FINALIZED transaction (0.8.63). Broadcasting those
// real, already-verified bytes needs no private key and no signing
// capability of its own — reading and writing through the same public
// Esplora-compatible host is exactly as safe as the READING this replica
// already does for `bitcoinEsploraTransactionConfirmationObserver` above,
// which is why `bitcoinEsploraTransactionBroadcaster` reuses that same
// default host rather than configuring a second one.
// `bitcoinAnchorTransactionBroadcaster` is the SAME, unchanged 0.8.52 class
// that has held "broadcasting submits; it does not decide" since that
// milestone; `bitcoinAnchorBroadcastCoordinator` is a deliberately thin
// wiring on top of it, mirroring exactly how `bitcoinAnchorSignedPsbtFinalizationCoordinator`
// immediately above wires the 0.8.51 finalizer one stage earlier.
const { bitcoinEsploraTransactionBroadcaster } = new CreateBitcoinEsploraTransactionBroadcasterUseCase().execute();
const { bitcoinAnchorTransactionBroadcaster } = new CreateBitcoinAnchorTransactionBroadcasterUseCase().execute({
    broadcaster: bitcoinEsploraTransactionBroadcaster
});
const { coordinator: bitcoinAnchorBroadcastCoordinator } = new CreateBitcoinAnchorBroadcastCoordinatorUseCase().execute({
    bitcoinAnchorTransactionBroadcaster
});

// 0.9.512 — Bitcoin Granular Pipeline Anchor Publication Integration.
//
// tests/ProofAnchoringCrossSubstrateCapabilityParityAudit.test.js (0.9.511)
// found application/BitcoinAnchorPublicationCoordinator.js (0.8.53) real,
// tested, and unreachable from this file — the ONE missing composition,
// mirroring exactly how 0.9.472 found anchoring/BaseAnchorPublisher.js
// (0.9.470) in the identical state one substrate over. `bitcoinAnchorPublicationCoordinator`
// is built from the SAME `publicationCatalog` and `createPublicationAnchorUseCase`
// every other Bitcoin/Base/Arweave anchor-creation path above already
// shares, plus `publicationAnchorCatalog` (also already shared) for its
// own optional duplicate-anchor guard — never a second, disconnected
// catalog or anchor use case. Its six from-scratch, one-shot-pipeline
// collaborators (`bitcoinAnchorTransactionBuilder` and the five others
// `publishAnchor()` alone still needs) are deliberately left unsupplied —
// see application/BitcoinAnchorPublicationCoordinator.js's own
// constructor header on why the real, production Bitcoin anchor UI below
// only ever calls this instance's OTHER method, `publishBroadcastedAnchor()`,
// which needs none of them: the granular Bitcoin pipeline wired in 0.8.61
// through 0.8.64 above — construction, review, reviewed signing,
// finalization, broadcast — remains this app's sole real Bitcoin write
// path; this coordinator only ever mints the durable anchor record the
// moment that pipeline's own broadcast succeeds.
const { coordinator: bitcoinAnchorPublicationCoordinator } = new CreateBitcoinAnchorPublicationCoordinatorUseCase().execute({
    publicationCatalog,
    createPublicationAnchorUseCase,
    publicationAnchorCatalog
});

// 0.8.65 — Explicit Bitcoin Anchor Confirmation UI. Closes the gap 0.8.64's
// own header named directly: "Whether a broadcasted transaction later gets
// mined into a block is a separate, later question, asked by a separate,
// later explicit 'Observe Confirmation' action." Reuses the SAME
// `bitcoinAnchorConfirmationObserver` instance application/
// BitcoinAnchorProofReconciliationView.js (0.8.55, wired above at 0.8.57)
// already reads through — one shared observer, never a second,
// disconnected instance — `bitcoinAnchorConfirmationCoordinator` is a
// deliberately thin wiring on top of it, mirroring exactly how
// `bitcoinAnchorBroadcastCoordinator` immediately above wires the 0.8.52
// broadcaster one stage earlier. Unlike that reconciliation view, this
// coordinator requires its caller to prove a `txid` genuinely came from a
// real BROADCASTED outcome (`broadcasted: true`) before it will ever ask —
// see application/BitcoinAnchorConfirmationCoordinator.js's own header.
const { coordinator: bitcoinAnchorConfirmationCoordinator } = new CreateBitcoinAnchorConfirmationCoordinatorUseCase().execute({
    bitcoinAnchorConfirmationObserver
});

// 0.8.68 — Explicit Remote IPFS Publishing Configuration & UX. The first
// UI wiring for content/IpfsRemotePinningContentStore.js (0.8.67) — never
// reachable from this running app before now, exactly as that
// milestone's own "Deliberately excluded" list named directly: "no
// credential-entry form... left deliberately unwired until its own UI
// milestone gives a person a safe, explicit way to supply a credential."
// `ipfsRemotePublicationCoordinator` needs no collaborator here at all —
// unlike `bitcoinAnchorBroadcastCoordinator` above, it holds no injected
// content/PinningProvider.js of its own; it constructs one FRESH, from
// whichever application/IpfsRemotePublishingConfiguration.js a person
// supplies, at the moment of each explicit "Publish to Remote IPFS"
// click (see that coordinator's own header, "A FRESH PROVIDER AND STORE
// FOR EVERY CALL"). Sharing ONE instance app-wide is therefore exactly as
// safe as sharing `bitcoinAnchorBroadcastCoordinator` is — this instance
// itself never holds a credential, a configuration, or any other secret
// between calls.
const { coordinator: ipfsRemotePublicationCoordinator } = new CreateIpfsRemotePublicationCoordinatorUseCase().execute();

// 0.8.70 — IPFS Publication & Content Verification UI. The first UI
// wiring for application/IpfsPublicationContentVerifier.js (0.8.69) —
// never reachable from this running app before now, exactly as that
// milestone's own "Deliberately excluded" list named directly: "no
// 'Observe Content' button... left deliberately unwired until its own
// inspection-UI milestone gives a person a place to see it." The
// contentStore is a fresh content/IpfsGatewayContentStore.js — the SAME
// class already used, immediately above, to resolve `ipfs://` snapshot
// placements through a public gateway with no local Kubo daemon
// required — never a second, disconnected reader. Sharing ONE
// ipfsPublicationContentVerificationCoordinator instance app-wide is
// exactly as safe as sharing ipfsRemotePublicationCoordinator is — it
// holds no credential and no publication-specific state between calls.
const { ipfsPublicationContentVerifier } = new CreateIpfsPublicationContentVerifierUseCase().execute({
    contentStore: new IpfsGatewayContentStore({ gatewayUrl: resolvedIpfsGatewayUrl })
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
// 0.2.59 — Peer-Based Avatar Social Transport. The SAME app-wide bus
// friendRelationshipUseCase already rides, now also provided directly
// so World View can attach presence/profile/interaction to it — see
// application/CreateWorldViewUseCase.js.
app.provide('peerMessageBus', peerMessageBus);
// 0.7.5 — Decentralized Publication UX & Resolution.
app.provide('publicationResolver', publicationResolver);
app.provide('publicationCatalog', publicationCatalog);
app.provide('publicationPeerExchange', publicationPeerExchange);
app.provide('publicationPeerContentExchange', publicationPeerContentExchange);
app.provide('publicationResolutionCoordinator', publicationResolutionCoordinator);
app.provide('publicationDisplayKindPlugins', publicationDisplayKindPlugins);
// 0.9.337 — Wire Resolved Decentralized Publications into Repository
// Discovery. The SAME single instance constructed above — never a
// second, isolated one — shared with both the decentralized resolution
// UI (admission) and Repository's own discovery composition (search).
app.provide('decentralizedPublicationDiscoveryProvider', decentralizedPublicationDiscoveryProvider);
// 0.9.651 — Persist World-Encounter Publication Admissions. The SAME
// single durable log instance constructed and already reconstructed into
// `decentralizedPublicationDiscoveryProvider` above — see
// ui/views/WorldView.js's own `worldEncounterPublicationAdmissionLog`
// injection.
app.provide('worldEncounterPublicationAdmissionLog', worldEncounterPublicationAdmissionLog);
// 0.9.289 — Other-Publication Commentary Entry Point. See this file's own
// comment where these commands are built, above.
app.provide('getPublicationCommentariesCommand', getPublicationCommentariesCommand);
app.provide('addPublicationCommentaryCommand', addPublicationCommentaryCommand);
// 0.8.3 — Publication Center: External Evidence UX.
app.provide('publicationAnchorCatalog', publicationAnchorCatalog);
app.provide('publicationEvidenceCoordinator', publicationEvidenceCoordinator);
// 0.8.11 — Explicit External Anchoring UX.
app.provide('publicationAnchorCreationCoordinator', publicationAnchorCreationCoordinator);
// 0.8.4 — External Anchor Publication Over Peers.
app.provide('publicationAnchorPeerExchange', publicationAnchorPeerExchange);
// 0.8.5 — Historical Anchor Discovery & Synchronization.
app.provide('publicationAnchorDiscoveryCoordinator', publicationAnchorDiscoveryCoordinator);
// 0.8.16 — Evidence Synchronization UX & Explicit Historical Discovery.
app.provide('publicationEvidenceDiscoveryCoordinator', publicationEvidenceDiscoveryCoordinator);
// 0.8.30 — Explicit Replica Knowledge Synchronization.
app.provide('publicationKnowledgeSynchronizationCoordinator', publicationKnowledgeSynchronizationCoordinator);
// 0.8.17 — Evidence Provenance & Observation Boundary.
app.provide('anchorKnowledgeStore', anchorKnowledgeStore);
// 0.8.14 — External Evidence Inspection & Locator UX.
app.provide('externalAnchorEvidenceViewRegistry', externalAnchorEvidenceViewRegistry);
// 0.8.57 — Bitcoin Anchor Proof & Confirmation Inspection UI.
app.provide('bitcoinAnchorProofReconciliationView', bitcoinAnchorProofReconciliationView);
app.provide('bitcoinWalletConnection', bitcoinWalletConnection);
// 0.8.60 — Explicit Bitcoin Anchor Funding & Address Preparation.
app.provide('bitcoinWalletFundingObserver', bitcoinWalletFundingObserver);
// 0.8.90 — Explicit Base Network & Account Observation.
app.provide('baseWalletConnection', baseWalletConnection);
app.provide('baseNetworkObserver', baseNetworkObserver);
// 0.8.91 — Explicit Base Publication Transaction Construction.
app.provide('basePublicationTransactionPlanCoordinator', basePublicationTransactionPlanCoordinator);
// 0.8.93 — Explicit Base Reviewed Transaction Signing.
app.provide('baseInjectedProviderWalletTransactionSigner', baseInjectedProviderWalletTransactionSigner);
app.provide('baseReviewedSigningCoordinator', baseReviewedSigningCoordinator);
// 0.8.94 — Explicit Base Signed Transaction Verification & Finalization.
app.provide('baseSignedTransactionFinalizationCoordinator', baseSignedTransactionFinalizationCoordinator);
// 0.8.95 — Explicit Base Transaction Broadcast.
app.provide('baseTransactionBroadcastCoordinator', baseTransactionBroadcastCoordinator);
// 0.8.96 — Explicit Base Transaction Inclusion & Confirmation Observation.
app.provide('baseTransactionInclusionObservationCoordinator', baseTransactionInclusionObservationCoordinator);
// 0.9.472 — Expose Review-Preserving Base Anchor Action.
app.provide('baseAnchorPublisher', baseAnchorPublisher);
// 0.8.61 — Explicit Bitcoin Anchor Transaction Construction UI.
app.provide('bitcoinAnchorTransactionConstructionCoordinator', bitcoinAnchorTransactionConstructionCoordinator);
// 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI.
app.provide('bitcoinAnchorTransactionReviewCoordinator', bitcoinAnchorTransactionReviewCoordinator);
app.provide('bitcoinAnchorReviewedSigningCoordinator', bitcoinAnchorReviewedSigningCoordinator);
// 0.8.63 — Explicit Signed PSBT Verification & Transaction Finalization UI.
app.provide('bitcoinAnchorSignedPsbtFinalizationCoordinator', bitcoinAnchorSignedPsbtFinalizationCoordinator);
// 0.8.64 — Explicit Bitcoin Anchor Broadcast UI.
app.provide('bitcoinAnchorBroadcastCoordinator', bitcoinAnchorBroadcastCoordinator);
// 0.9.512 — Bitcoin Granular Pipeline Anchor Publication Integration.
app.provide('bitcoinAnchorPublicationCoordinator', bitcoinAnchorPublicationCoordinator);
// 0.8.65 — Explicit Bitcoin Anchor Confirmation UI.
app.provide('bitcoinAnchorConfirmationCoordinator', bitcoinAnchorConfirmationCoordinator);
// 0.8.68 — Explicit Remote IPFS Publishing Configuration & UX.
// `publicationCatalogContentResolver` is the SAME resolver instance
// application/CreateExternalSnapshotPlacementUseCase.js already reads a
// publication's own locally stored bytes through above — never a second,
// disconnected reader — provided directly (not wrapped in a coordinator)
// exactly as `bitcoinWalletConnection` above is: a plain, already-tested
// domain collaborator with a narrow `resolve()`/`verify()` contract this
// milestone's own UI calls directly, the identical restraint content/
// IpfsRemotePinningContentStore.js's own header already holds toward
// computing a hash "the same way every other content/ContentStore.js
// implementation already does" rather than inventing a new one.
app.provide('publicationCatalogContentResolver', publicationCatalogContentResolver);
// Bug fix — `publicationCatalogContentResolver` above resolves by id
// against `publicationCatalog` (application/LocalPublicationCatalog.js),
// which only ever holds peer-announced DecentralizedPublication envelopes
// — never a World `publisher/Publication.js` instance created by
// PublishDocumentUseCase/LocalPublisherProvider (Editor or World View
// alike). `ui/views/WorldView.js`'s own `distributeWorldEncounterSnapshot()`
// was reading a Publication's local material back through that resolver
// by id, so it always found nothing for a genuine World Publication —
// its own contentReference was never even consulted. Providing the SAME
// `publicationContentStore` the publish path itself already wrote bytes
// into lets that function resolve local material the correct way: given
// the Publication object it already holds, `publicationContentStore.get(
// publication.contentReference)` — no id-based catalog lookup needed.
app.provide('publicationContentStore', publicationContentStore);
app.provide('ipfsRemotePublicationCoordinator', ipfsRemotePublicationCoordinator);
// 0.8.70 — IPFS Publication & Content Verification UI.
app.provide('ipfsPublicationContentVerificationCoordinator', ipfsPublicationContentVerificationCoordinator);
// 0.8.75 — Durable Publication Observation Records. ui/views/
// DecentralizedPublicationsView.js's own inject() already falls back to a
// real, browser-backed instance on its own if this is never provided —
// this app.provide() call exists only so every part of the running app
// shares the ONE instance, exactly like every other coordinator above,
// rather than each caller reading and writing localStorage through a
// separate object of its own.
app.provide('publicationObservationArchiveStorage', new LocalStoragePublicationObservationArchive());
// 0.8.19 — Snapshot Placement Discovery & Peer Synchronization.
app.provide('publicationSnapshotPlacementCatalog', publicationSnapshotPlacementCatalog);
app.provide('publicationSnapshotPlacementPeerExchange', publicationSnapshotPlacementPeerExchange);
app.provide('publicationSnapshotPlacementDiscoveryCoordinator', publicationSnapshotPlacementDiscoveryCoordinator);
// 0.8.20 — Snapshot Placement Inspection & Explicit Resolution UX.
app.provide('publicationSnapshotPlacementResolutionCoordinator', publicationSnapshotPlacementResolutionCoordinator);
app.provide('snapshotPlacementViewRegistry', snapshotPlacementViewRegistry);
// 0.8.24 — Snapshot Placement Provenance & Observation Boundary.
app.provide('placementKnowledgeStore', placementKnowledgeStore);
// 0.8.25 — Explicit Snapshot Placement Creation UX.
app.provide('snapshotPlacementCreationCoordinator', snapshotPlacementCreationCoordinator);
// 0.9.299 — Content Creation Provider Preference Integration. Provided
// under its own name, alongside the coordinator it wraps. 0.9.301 —
// Preferred Content Provider Placement Trigger — is the first, and still
// only, thing that injects this key: ui/views/DecentralizedPublicationsView
// .js's own "Use Preferred Provider" action.
app.provide('preferredSnapshotPlacementCreationCoordinator', preferredSnapshotPlacementCreationCoordinator);
// 0.9.302 — Content Provider Preference Settings Entry Point.
// ui/views/ContentProviderSettingsView.js is the one thing that injects
// either of these two keys.
app.provide('roleProviderPreferenceStore', roleProviderPreferenceStore);
app.provide('setRoleProviderPreferenceUseCase', setRoleProviderPreferenceUseCase);
// 0.8.33 — Local Snapshot Content Availability & Integrity UX.
app.provide('localSnapshotContentAvailabilityUseCase', localSnapshotContentAvailabilityUseCase);
app.provide('snapshotContentMaterializationCoordinator', snapshotContentMaterializationCoordinator);
// 0.9.215 — Snapshot Export Capability Integration. Injected under its
// own name, exactly like `discoverSnapshotCommand`/
// `materializeSelectedSnapshotCommand` above, rather than requiring
// `ui/views/WorldView.js` to inject the whole coordinator and call
// `.export()` itself.
app.provide('exportSnapshotCommand', exportSnapshotCommand);
// 0.8.35 — Explicit Placement-Backed Snapshot Materialization.
app.provide('snapshotPlacementMaterializationCoordinator', snapshotPlacementMaterializationCoordinator);
// 0.8.37 — Explicit Peer Snapshot Content Transfer.
app.provide('snapshotPeerMaterializationCoordinator', snapshotPeerMaterializationCoordinator);
// 0.8.40 — Snapshot Possession Observation Exchange. 0.8.41 — Peer
// Snapshot Possession Comparison & Observation History adds
// `observePeers()` directly onto this SAME coordinator instance (see
// application/SnapshotPeerPossessionCoordinator.js) — no second
// coordinator, no second exchange, and no second wiring block here.
app.provide('snapshotPeerPossessionCoordinator', snapshotPeerPossessionCoordinator);
// 0.8.42 — Explicit Snapshot Source Selection & Materialization UX.
app.provide('snapshotMaterializationSelectionCoordinator', snapshotMaterializationSelectionCoordinator);

// 0.9.14 — World Discovery Runtime Bootstrap. Constructs the ONE
// WorldDiscoverySourceRegistry this replica uses for World discovery
// (0.9.9), registers this replica's own local source (currently empty —
// see application/WorldDiscoveryRuntimeBootstrap.js's own header on why
// reading real local publications/placements/anchors/snapshotPlacements/
// avatarProfiles/avatarPresences into that shape is separate, unscheduled
// work), and rides the SAME `peerMessageBus`/`peerSessionManager.registry`
// every other peer/PeerMessageBus.js protocol in this file already does
// so a peer's own World contribution registers when it sends under
// WORLD_DISCOVERY_PEER_PROTOCOL and unregisters automatically when that
// peer disconnects. Provided here as `worldDiscoverySourceRegistry` for a
// future World View page to `inject()` and hand straight to
// ui/components/WorldEncounterCanvas.js's own `registry` prop — mounting
// that surface into a route is separate, later, unscheduled work, the
// same restraint 0.9.3 already held before any UI consumed it.
const worldDiscoveryRuntime = bootstrapWorldDiscoveryRuntime({
    connectedPeerRegistry: peerSessionManager.registry,
    peerMessageBus
});
app.provide('worldDiscoverySourceRegistry', worldDiscoveryRuntime.registry);

// 0.9.99 — Decentralized Material Verification World View Integration.
// `ui/components/WorldEncounterCanvas.js` has carried its own `materialSources`/
// `materialVerifier` props, and rendered their result, since 0.9.39/0.9.42 —
// but every mount of it in this running app (this file's own
// `worldDiscoverySourceRegistry` wiring above, `ui/views/WorldView.js`,
// `ui/views/LiveWorldView.js`) has always left both `null`, so the panel it
// already renders has never had anything real to show. This is the first
// time either composition root is actually called: `LocalWorldEncounterMaterialSource`
// (0.9.22, unmodified) reads this replica's own local publications, using
// the SAME `LocalStorageProvider` idiom `CreateDiscoveryUseCase`/
// `CreatePublisherUseCase` already construct fresh instances of elsewhere in
// this file (a stateless `window.localStorage` wrapper — never a second,
// disconnected store); `composeWorldEncounterMaterialVerifier()` (0.9.43,
// unmodified) builds the identity+signature verifier composition this
// codebase already ships, never a new verification algorithm. Provided the
// same way `worldDiscoverySourceRegistry` is, immediately above, for
// `ui/views/WorldView.js` to `inject()` and hand straight through to
// `WorldEncounterCanvas`'s own existing props.
//
// AMENDED BY 0.9.475 — Wire Peer World Encounter Material Source into
// Production Composition Root. The paragraph above originally read "PEER
// MATERIAL SOURCES STAY DELIBERATELY UNWIRED HERE," current as of 0.9.99:
// `PeerWorldEncounterMaterialSource` (0.9.23) already implemented the
// contract, `loadWorldEncounterMaterial()` (0.9.21) already routed
// `peer:<identityId>`-origin selections to `materialSources.peer`, and
// `composeWorldEncounterMaterialSources()` (0.9.36) already accepted a
// `peer` argument and forwarded it verbatim — but no composition root in
// this running app ever constructed one and passed it through, so a
// peer-origin selection resolved to `UNAVAILABLE`/`UNVERIFIABLE` purely
// for want of one constructor call, never for any missing capability.
// `worldEncounterMaterialPeerSource`, immediately below, is that one call:
// `new PeerWorldEncounterMaterialSource(peerMessageBus, peerSessionManager.registry)`
// — the SAME shared `peerMessageBus`/`peerSessionManager.registry` pair
// every other peer/PeerMessageBus.js protocol in this file already rides
// (see, e.g., `worldDiscoveryRuntime`'s own identical pair, immediately
// above), never a second, disconnected transport or registry. No new
// peer subsystem, no new fallback logic: an unanswered or malformed
// request still resolves to the source's own established `null`
// (UNAVAILABLE), exactly as `application/PeerWorldEncounterMaterialSource.js`'s
// own header already specifies.
const worldEncounterMaterialPeerSource = new PeerWorldEncounterMaterialSource(peerMessageBus, peerSessionManager.registry);
const { verifier: worldEncounterMaterialVerifier } = composeWorldEncounterMaterialVerifier();

// 0.9.110 — Decentralized Material Retrieval Runtime Composition.
// 0.9.99's own header left the Arweave-backed `.decentralized` slot and a
// live `DecentralizedWorldDiscoveryLeadRegistry` explicitly unwired,
// naming the gap 0.9.102's own audit later confirmed: real, tested
// Nostr/Arweave discovery and retrieval code sat in this codebase,
// reachable only from its own test suites. `composeDecentralizedWorldEncounterMaterialDiscoveryServices()`
// and `composeDecentralizedWorldEncounterMaterialDiscoveryRuntime()`
// (both new, `application/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js`)
// are the missing composition root — they build no algorithm of their own;
// they wire the already-existing 0.9.24-through-0.9.43 chain together and
// hand back one application-facing capability.
//
// UPDATED 0.9.147 — this comment originally read "NO HOST NOSTR
// RELAY-QUERY CAPABILITY EXISTS ANYWHERE IN THIS CODEBASE YET." That gap —
// named here at 0.9.110 and again, identically, at 0.9.142 for Snapshot
// Discovery — is what `nostr/NostrRelayQueryClient.js` (0.9.147) closes:
// a real NIP-01 subscribe/collect/EOSE transport, injectable exactly like
// this file's own `nostrHostPublisher`/`arweaveHostSigner` below. `nostrRelayQueryClient`
// is constructed ONCE, immediately below, and handed to `nostrQueryImpl`
// here AND to `nostrSnapshotDiscoveryQueryServiceOptions.queryImpl` at
// 0.9.142's own wiring, later in this file — the SAME shared transport
// instance unlocking both previously-dormant discovery seams, exactly the
// "one implementation, two dormant seams" case docs/Roadmap.md's own
// 0.9.146 reassessment named. `worldDiscoveryLeadRegistry` is provided
// app-wide the same way `worldEncounterMaterialSources`/
// `worldEncounterMaterialVerifier` already are, so `WorldEncounterCanvas`'s
// own existing (0.9.40) `worldDiscoveryLeadRegistry` prop — wired to `null`
// everywhere in this running app until 0.9.110 — has a real registry to
// observe, now genuinely reachable through Nostr as well as Arweave.
// `worldEncounterMaterialSources` gains its `.decentralized` slot (0.9.36's
// own unmodified Arweave-backed source) alongside the pre-existing `.local`
// one; peer is wired too, as of 0.9.475 — see the comment immediately
// above, where `worldEncounterMaterialPeerSource` is constructed, and the
// `peer:` argument passed to `composeDecentralizedWorldEncounterMaterialDiscoveryRuntime()`
// below.
//
// `nostrRelayQueryClient` MAY STILL RESOLVE `undefined` — a bare
// environment with no `WebSocket` global and no `webSocketImpl` supplied
// (see `nostr/NostrRelayQueryClient.js`'s own header) — in which case
// `composeDecentralizedWorldEncounterMaterialDiscoveryServices()` degrades
// exactly as it always has: `nostr: null`, never a throw. In any real
// browser this resolves a real, usable transport.
// 0.9.364 — User-Configurable Arweave Gateway Retrieval Integration.
//
// 0.9.363's own audit named this exact gap: every Arweave-facing retrieval
// adapter below already accepts its own `gatewayUrl` through ordinary
// constructor injection, but this file supplied none anywhere, so a user
// whose default `https://arweave.net` was unreachable had no way to keep
// using ForkBuild against their own gateway. `core/
// ArweaveGatewayConfiguration.js` and `storage/
// ArweaveGatewayConfigurationStore.js` (both new, this same milestone) are
// the read-path counterpart to `application/
// PublicationDistributionRuntimeConfiguration.js`'s own `{ gatewayUrl }`
// shape on the distribution WRITE path, above — see 0.9.363's own "What
// comes after."
//
// ABSENCE STAYS MEANINGFUL. `arweaveGatewayConfigurationStore.get()`
// returns `null` when the user has never configured an override, and
// `DEFAULT_ARWEAVE_GATEWAY_URL` (core/ArweaveGatewayConfiguration.js's own
// export — the same host every Arweave-facing adapter in this codebase
// already hardcodes as its own default) is consulted only then. A saved
// preference is never confused with "the default itself got persisted" —
// see that file's own header for why.
//
// APPLIED ONLY TO RETRIEVAL, NEVER TO DISTRIBUTION. `resolvedArweaveGatewayUrls`
// (0.9.440 — the ordered list; see this file's own 0.9.440 comment, below)
// is threaded into `arweaveResolverOptions` (World Encounter material
// retrieval, immediately below) — never into `arweaveUploaderOptions`
// (Signed Claim distribution, above) or `composeSnapshotDistributionRuntime()`'s
// own `arweaveContentStoreOptions` (Snapshot's own `put()`, later in this
// file). A user-configured gateway is an explicit replacement for READING
// already-published content; it says nothing about where THIS replica's
// own new content gets written, exactly the distinction 0.9.363's own
// audit drew between the write-path seam and the read-path gap it left
// named but unbuilt.
//
// 0.9.508 — NO LONGER THREADED INTO `composeDiscoverSnapshotRuntime()`'s
// own `arweaveContentStoreOptions`. Snapshot RETRIEVAL's ContentStore is
// now resolved from `publicationSnapshotPlacementResolutionStoreRegistry`
// (keyed by each discovered candidate's own `storage`), never from a
// second, independently-constructed ArweaveContentStore — see that
// composition call's own 0.9.508 comment, later in this file.
const arweaveGatewayConfigurationStore = new ArweaveGatewayConfigurationStore(new LocalStorageProvider());
const resolvedArweaveGatewayUrl = (arweaveGatewayConfigurationStore.get() || { gatewayUrl: DEFAULT_ARWEAVE_GATEWAY_URL }).gatewayUrl;
// 0.9.440 — Arweave Gateway Read Failover. The full ORDERED list behind
// `resolvedArweaveGatewayUrl` above — `resolvedArweaveGatewayUrl` itself
// stays exactly what it always was (the FIRST configured gateway, still
// the one value Arweave Anchor's publish/verify pair below reads; see
// 0.9.439's own Section F3 for why that pair deliberately keeps reusing a
// single value rather than a list). `resolvedArweaveGatewayUrls` is the
// new, separate thing: every configured gateway, in priority order, fed
// only into the two RETRIEVAL composition sites below — World Encounter
// material resolution and Snapshot retrieval — never into Anchor, never
// into Snapshot/Publication distribution (write), exactly the same
// read-only boundary `resolvedArweaveGatewayUrl` itself already holds.
const resolvedArweaveGatewayUrls = (arweaveGatewayConfigurationStore.get() || { gatewayUrls: [DEFAULT_ARWEAVE_GATEWAY_URL] }).gatewayUrls;
// 0.9.366 — Arweave Gateway Settings UI. The WRITE half of the settings
// entry point, wired against this SAME store instance (never a second,
// disconnected ArweaveGatewayConfigurationStore) — see application/
// SetArweaveGatewayConfigurationUseCase.js's own header. Both this use
// case and the store itself are provided app-wide below so ui/views/
// ArweaveGatewaySettingsView.js is the one thing that ever injects either.
const setArweaveGatewayConfigurationUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore });
app.provide('arweaveGatewayConfigurationStore', arweaveGatewayConfigurationStore);
app.provide('setArweaveGatewayConfigurationUseCase', setArweaveGatewayConfigurationUseCase);

// 0.9.665 — IPFS Gateway Settings UI. The WRITE half of the settings entry
// point, wired against the SAME ipfsGatewayConfigurationStore instance
// resolved earlier in this file (never a second, disconnected store) — see
// application/SetIpfsGatewayConfigurationUseCase.js's own header.
const setIpfsGatewayConfigurationUseCase = new SetIpfsGatewayConfigurationUseCase({ ipfsGatewayConfigurationStore });
app.provide('ipfsGatewayConfigurationStore', ipfsGatewayConfigurationStore);
app.provide('setIpfsGatewayConfigurationUseCase', setIpfsGatewayConfigurationUseCase);

// 0.9.369 — Nostr Relay Configuration Boundary.
//
// 0.9.368's own audit named this exact gap: all three read-path Nostr
// discovery classes below (application/NostrDiscoveryQueryService.js,
// application/NostrSnapshotDiscoveryQueryService.js, application/
// NostrPlaceNamingDiscoverySource.js, via `nostrRelayQueryClient`) already
// accept their own `relayUrl` through ordinary constructor injection, but
// this file supplied none anywhere, so every Wanderer silently inherited
// `wss://relay.damus.io` with no way back if it ever became unreachable.
// `core/NostrRelayConfiguration.js` and `storage/
// NostrRelayConfigurationStore.js` (both new, this same milestone) are the
// direct structural mirror of `core/ArweaveGatewayConfiguration.js` /
// `storage/ArweaveGatewayConfigurationStore.js` (0.9.364), applied to a
// relay URL — a SEPARATE store, under its own storage key, never sharing
// `arweaveGatewayConfigurationStore` above.
//
// ABSENCE STAYS MEANINGFUL, EXACTLY AS FOR THE ARWEAVE GATEWAY ABOVE.
// `nostrRelayConfigurationStore.get()` returns `null` when the user has
// never configured an override, and `DEFAULT_NOSTR_RELAY_URL` (core/
// NostrRelayConfiguration.js's own export — the same relay every one of the
// three read-path classes already hardcodes as its own default) is
// consulted only then.
//
// APPLIED TO SNAPSHOT DISCOVERY AND PLACE NAMING DISCOVERY, AND NOW ALSO TO
// SNAPSHOT ANNOUNCEMENT PUBLISHING — NEVER TO PUBLICATION PUBLISHING.
// `resolvedNostrRelayUrls` below is threaded into
// `composeDiscoverSnapshotRuntime()`'s own
// `nostrSnapshotDiscoveryQueryServiceOptions.relayUrls`, into
// `NostrPlaceNamingDiscoverySource`'s own relay set (both later in this
// file), and — RELAY RESILIENCE FOR SNAPSHOT DISTRIBUTION — into
// `composeSnapshotDistributionRuntime()`'s own
// `nostrSnapshotDiscoveryPublisherOptions.relayUrls` (also later in this
// file), so Snapshot announcement is no longer hardcoded to one relay: a
// single relay override still resolves to a one-element set, byte-identical
// to the pre-existing behavior; a multi-relay override fans the
// announcement out to every configured relay (see core/
// NostrRelayConfiguration.js's own header, "fan-out, never ordered
// failover").
//
// UNIFIED — `resolvedNostrRelayUrls` IS NOW THE ONE NOSTR RELAY SET FOR THE
// WHOLE APPLICATION. A separate `resolvedNostrPublicationRelayUrls`
// (0.9.447), resolved from its own independent
// `NostrPublicationRelaySetConfigurationStore`, used to feed Publication
// distribution/discovery only. That store, its use case, its provider, and
// its own settings page have all been removed — see core/
// NostrRelayConfiguration.js's own "unified" header for the full
// rationale. Every consumer that used to read
// `resolvedNostrPublicationRelayUrls` now reads THIS array instead: World
// Encounter (Publication) discovery (below), Publication distribution's
// own multi-relay command (further below), Snapshot discovery/
// announcement, Place Naming discovery, and Publication Commentary
// (below) all fan out across the SAME configured set.
//
// 0.9.371 — Nostr Relay Settings UI. The WRITE half of the settings entry
// point, wired against this SAME store instance (never a second,
// disconnected NostrRelayConfigurationStore) — see application/
// SetNostrRelayConfigurationUseCase.js's own header. Both this use case and
// the store itself are provided app-wide below so ui/views/
// NostrRelaySettingsView.js is the one thing that ever injects either — the
// identical "no settings UI yet" gap 0.9.369's own comment named here is now
// closed, mirroring `arweaveGatewayConfigurationStore`'s own 0.9.366
// write-side use case and `app.provide()` calls exactly.
const nostrRelayConfigurationStore = new NostrRelayConfigurationStore(new LocalStorageProvider());
const resolvedNostrRelayUrls = (nostrRelayConfigurationStore.get() || { relayUrls: [DEFAULT_NOSTR_RELAY_URL] }).relayUrls;
const resolvedNostrRelayUrl = resolvedNostrRelayUrls[0];
const setNostrRelayConfigurationUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore });
app.provide('nostrRelayConfigurationStore', nostrRelayConfigurationStore);
app.provide('setNostrRelayConfigurationUseCase', setNostrRelayConfigurationUseCase);

// 0.9.386 — STUN Settings UI. `iceServerConfigurationStore` and
// `setIceServerConfigurationUseCase` were already constructed earlier in
// this file (needed immediately, to build `peerConnectionProvider` itself)
// — provided app-wide here, alongside the other settings stores/use cases,
// so ui/views/StunSettingsView.js is the one thing that ever injects
// either, the identical shape `arweaveGatewayConfigurationStore`/
// `nostrRelayConfigurationStore` already hold above.
app.provide('iceServerConfigurationStore', iceServerConfigurationStore);
app.provide('setIceServerConfigurationUseCase', setIceServerConfigurationUseCase);

// 0.9.456 — TURN Server Settings UI. `turnServerConfigurationStore` and
// `setTurnServerConfigurationUseCase` were already constructed earlier in
// this file (needed immediately, to build `resolvedIceServers` itself) —
// provided app-wide here, alongside the other settings stores/use cases, so
// ui/views/TurnServerSettingsView.js is the one thing that ever injects
// either, the identical shape `iceServerConfigurationStore`/
// `nostrRelayConfigurationStore` already hold above.
app.provide('turnServerConfigurationStore', turnServerConfigurationStore);
app.provide('setTurnServerConfigurationUseCase', setTurnServerConfigurationUseCase);

// 0.9.388 — Rendezvous Settings UI. `rendezvousConfigurationStore` and
// `setRendezvousConfigurationUseCase` were already constructed earlier in
// this file (needed immediately, to build `discoveryBootstrap` itself) —
// provided app-wide here, alongside the other settings stores/use cases,
// so ui/views/RendezvousSettingsView.js is the one thing that ever injects
// either, the identical shape `iceServerConfigurationStore`/
// `nostrRelayConfigurationStore` already hold above.
app.provide('rendezvousConfigurationStore', rendezvousConfigurationStore);
app.provide('setRendezvousConfigurationUseCase', setRendezvousConfigurationUseCase);

const nostrRelayQueryClient = createNostrRelayQueryClient({});
// 0.9.451 — Nostr Publication Relay Set Discovery Alignment. Publication
// discovery consumes `resolvedNostrRelayUrls` — see
// `application/NostrPublicationRelaySetDiscoveryQueryService.js`'s own
// header for why a publication distributed to a configured relay set must
// be discoverable through that same set, and `application/
// DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js`'s own
// 0.9.451 amendment for how `nostrRelayUrls` (plural) reaches this one
// call site.
//
// UNIFIED — this used to read the separately-configured
// `resolvedNostrPublicationRelayUrls`; Snapshot discovery and Place Naming
// discovery, below, used to read the general `resolvedNostrRelayUrls`
// instead. Both now read the SAME array — see core/
// NostrRelayConfiguration.js's own "unified" header.
const decentralizedWorldDiscoveryServices = composeDecentralizedWorldEncounterMaterialDiscoveryServices({
    nostrQueryImpl: nostrRelayQueryClient,
    nostrRelayUrls: resolvedNostrRelayUrls
});
const decentralizedWorldEncounterMaterialDiscoveryRuntime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
    discoveryServices: decentralizedWorldDiscoveryServices,
    local: new LocalWorldEncounterMaterialSource(new LocalStorageProvider()),
    // 0.9.475 — the one argument this file previously left unfilled; see
    // `worldEncounterMaterialPeerSource`'s own construction, above.
    peer: worldEncounterMaterialPeerSource,
    verifier: worldEncounterMaterialVerifier,
    arweaveResolverOptions: { gatewayUrls: resolvedArweaveGatewayUrls }
});
const worldDiscoveryLeadRegistry = decentralizedWorldEncounterMaterialDiscoveryRuntime.registry;
const worldEncounterMaterialSources = decentralizedWorldEncounterMaterialDiscoveryRuntime.materialSources;
app.provide('worldEncounterMaterialSources', worldEncounterMaterialSources);
app.provide('worldEncounterMaterialVerifier', worldEncounterMaterialVerifier);
app.provide('worldDiscoveryLeadRegistry', worldDiscoveryLeadRegistry);

// 0.9.111 — World View Decentralized Publication Retrieval. The one
// application-facing capability this composition exists to produce,
// provided app-wide exactly like `publicationDistributionCommand` below
// it: a thin, pre-bound closure `ui/views/WorldView.js` calls with only
// `{ objectId, discoveryTag }` — see `application/DiscoverWorldEncounterPublicationCommandComposition.js`'s
// own header for the full `{ discovery, resolution, inspection }` shape it
// returns. `discoveryProvider` is a fresh `LocalDiscoveryProvider`, reading
// the SAME `forkbuild-publications` storage key `LocalWorldEncounterMaterialSource`
// itself already reads — its own `.list()` is called fresh on every
// discovery call (never cached here), so association evidence always
// reflects this replica's CURRENT local publications.
const discoverWorldEncounterPublicationCommand = composeDiscoverWorldEncounterPublicationCommand({
    runtime: decentralizedWorldEncounterMaterialDiscoveryRuntime,
    discoveryProvider: new LocalDiscoveryProvider(new LocalStorageProvider())
});
app.provide('discoverWorldEncounterPublicationCommand', discoverWorldEncounterPublicationCommand);

// 0.9.357 — Wire Canonical Publication Discovery Tag into World View.
// `PUBLICATION_DISCOVERY_TAG` is the SAME literal already supplied to
// `createPublicationDistributionRuntimeProvider()` below, hoisted to one
// named constant used at both sites rather than typed twice — see
// `tests/PublicationDiscoveryTagUXConsistencyAudit.test.js` (0.9.356)
// Section H, "no second source of truth." Provided app-wide, alongside
// `discoverWorldEncounterPublicationCommand` above, so `ui/views/WorldView.js`
// can hand it to `WorldEncounterCanvas.js` as its own Discovery-tag input's
// initial value — never baked into the command itself, which would remove
// the field's own per-call editability (0.9.356 Section E/F).
const PUBLICATION_DISCOVERY_TAG = 'forkbuild-publication';
app.provide('publicationDiscoveryTag', PUBLICATION_DISCOVERY_TAG);

// 0.9.100 — Publication Distribution World View Integration.
// `application/PublicationDistributionLifecycle.js` (0.9.50) through
// `...LifecycleHydration.js` (0.9.57) already built a complete lifecycle
// line — description, transition, an in-memory observation store,
// snapshot persistence, a persistence bridge, restoration, and startup
// hydration — entirely independent of any UI. This is the first time any
// of it is actually composed: ONE app-wide `PublicationDistributionLifecycleMemoryStore`
// (0.9.52/0.9.53, unmodified) is restored from whatever this replica
// already persisted for its own known publications (via
// `PublicationDistributionLifecycleRestorer`/`hydratePublicationDistributionLifecycles`,
// 0.9.56/0.9.57, unmodified, fed `publicationCatalog.list()`'s own ids —
// the SAME catalog every other local composition in this file already
// reads), then bridged so that any FUTURE change to it is persisted the
// same way (`PublicationDistributionLifecyclePersistenceBridge`, 0.9.55,
// unmodified), using the SAME `LocalStorageProvider` idiom the material-
// verification wiring immediately above already uses. Provided the same
// way `worldEncounterMaterialSources`/`worldEncounterMaterialVerifier` are,
// for `ui/views/WorldView.js` to `inject()` and hand straight through to
// `WorldEncounterCanvas`'s own new `distributionLifecycleStore` prop.
//
// NEITHER AN ARWEAVE UPLOADER NOR A NOSTR PUBLISHER IS EVER CONSTRUCTED
// HERE. `PublicationDistributionRuntimeComposition.js`, `...Executor.js`,
// `...Orchestrator.js`, `ArweavePublicationMaterialUploader.js`, and
// `NostrPublicationDiscoveryPublisher.js` are all unimported — actually
// EXECUTING a distribution needs real signer/relay configuration this
// file has nowhere else established, the same "a materially larger,
// network-facing composition decision" restraint the material-verification
// wiring immediately above already holds for peer/decentralized material
// sources. This milestone wires observation of whatever lifecycle already
// exists; it introduces no way to produce a new one.
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

// 0.9.103 — Publication Distribution Command Boundary.
// The 0.9.100 wiring immediately above provides OBSERVATION of whatever
// distribution lifecycle already exists; nothing before this point in the
// file ever produces a new one. `executePublicationDistributionCommand()`
// (0.9.103, unmodified) is that missing production seam —
// `orchestratePublicationDistribution()` (0.9.58) plus routing its result
// into this SAME `publicationDistributionLifecycleStore` instance, so a
// distribution any future caller commands through it is observable through
// the exact store `WorldEncounterCanvas` already watches. Provided the same
// way `publicationDistributionLifecycleStore` itself is, immediately above,
// for a future World View action to `inject()` — this file wires no such
// action yet; see this milestone's own header, "Deliberately excluded...
// a UI trigger of any kind."
//
// NEITHER AN ARWEAVE UPLOADER NOR A NOSTR PUBLISHER IS CONSTRUCTED HERE,
// EITHER — the identical restraint the 0.9.100 wiring immediately above
// already holds, unrevisited by 0.9.103. `publicationDistributionLifecycleStore`
// was the one collaborator bound here, via a thin closure, purely so a
// future caller never has to thread the app's own store instance through
// by hand.
//
// 0.9.105 — Publication Distribution Configuration Boundary. The gap
// 0.9.103's own header named on its own way out: `arweaveUploaderOptions`/
// `nostrPublisherOptions` were per-call arguments nobody in this file ever
// supplied, so a real World View click (0.9.104) reached this command only
// to hit 0.9.45's/0.9.46's own synchronous "a signer/publishImpl is
// required" throw. `resolveArweaveUploaderOptions()`/`resolveNostrPublisherOptions()`
// (`application/PublicationDistributionConfigurationProvider.js`) are the
// one place that decision now gets made, and
// `composePublicationDistributionCommand()` (`application/PublicationDistributionCommandComposition.js`)
// is the seam that pre-binds their result into this command exactly the
// way `publicationDistributionLifecycleStore` alone already was.
//
// 0.9.106 — Publication Distribution Runtime Configuration. 0.9.105's own
// "Recommendation" already named this file as the one place a future
// runtime capability (a browser wallet extension, an application-provided
// signer, an externally injected adapter, a development/test signer, or
// any other host-provided source) would eventually get supplied from —
// but this file still called `resolveArweaveUploaderOptions()`/
// `resolveNostrPublisherOptions()` as two separate, hand-written `{}`
// literals, giving such a source no single place to plug into.
// `publicationDistributionRuntimeConfiguration` below is that one place:
// a plain object describing whatever this environment/replica currently
// exposes for each substrate, resolved through
// `resolvePublicationDistributionRuntimeConfiguration()`
// (`application/PublicationDistributionRuntimeConfiguration.js`, NEW),
// which does nothing but forward `arweave`/`nostr` verbatim into the same
// two 0.9.105 resolvers this file already called directly.
//
// 0.9.107 — Publication Distribution Runtime Provider. 0.9.106 gave this
// file exactly one seam a runtime capability could enter through, but the
// object fed to it was still a hand-written `{}` literal — nothing in this
// codebase actually PRODUCED an `{ arweave, nostr }` shape from a host's
// own flat capability vocabulary (`signer`, `publishImpl`, and the rest).
// `createPublicationDistributionRuntimeProvider()`
// (`application/PublicationDistributionRuntimeProvider.js`, NEW) is that
// producer: a real, injectable factory this file calls with whatever this
// environment/replica currently exposes, returning an object whose
// `resolveRuntimeCapabilities()` regroups it into the exact shape
// `resolvePublicationDistributionRuntimeConfiguration()` already accepts.
//
// THE HOST CAPABILITIES SUPPLIED ARE STILL NONE, SO BOTH RESOLVERS STILL
// RESOLVE `undefined` — THIS MILESTONE CHANGES NO OBSERVABLE BEHAVIOR IN
// THE RUNNING APP. No concrete Arweave signer or Nostr `publishImpl`
// implementation exists anywhere in this codebase yet (see
// `application/ArweavePublicationMaterialUploader.js`'s and
// `application/NostrPublicationDiscoveryPublisher.js`'s own headers, both
// still naming a concrete implementation as later, unscheduled work) — so
// a real World View click still reaches exactly today's existing
// synchronous throw, honestly. This milestone's entire value is that a
// real, independently testable factory function (see
// `tests/PublicationDistributionRuntimeProvider.test.js`) is now the thing
// this file calls, rather than a plain object literal it shapes by hand;
// supplying a real signer or `publishImpl` later — most naturally a
// browser wallet-extension adapter, mirroring
// `base/BaseInjectedProviderWalletAdapter.js`'s own already-established
// pattern one substrate over — touches only the one object passed to
// `createPublicationDistributionRuntimeProvider()` immediately below,
// never `WorldView.js`, never `WorldEncounterCanvas.js`, never the
// command, orchestrator, or executor, and not even
// `resolvePublicationDistributionRuntimeConfiguration()` itself.
//
// 0.9.108 — Nostr Publication Discovery Runtime Adapter. 0.9.107 gave this
// file a real factory to call, but the object fed to it below was still a
// bare `{}` — nothing in this codebase actually PRODUCES a `publishImpl`
// from a real host Nostr capability. `createNostrPublicationDistributionRuntimeAdapter()`
// (`application/NostrPublicationDistributionRuntimeAdapter.js`, NEW) is
// that bridge: it renames whatever a host's own `publish` capability is
// called onto the `publishImpl` field the runtime provider already accepts,
// and forwards `relayUrl` alongside it. Arweave's own signing-authority
// capability remains exactly as unaddressed as 0.9.107 left it — no
// adapter of any kind exists for it yet (a separate, later, unscheduled
// milestone).
//
// NO HOST NOSTR CAPABILITY EXISTS ANYWHERE IN THIS CODEBASE YET, SO THIS
// MILESTONE CHANGES NO OBSERVABLE BEHAVIOR EITHER. `createNostrPublicationDistributionRuntimeAdapter({})`
// resolves `{ publishImpl: undefined, relayUrl: undefined }` — spread into
// `createPublicationDistributionRuntimeProvider({ ... })` below, this is
// functionally identical to yesterday's bare `{}`. Both resolvers still
// resolve `undefined`, and a real World View click still reaches exactly
// today's existing synchronous throw. This milestone's entire value is
// that a real, independently tested Nostr-specific bridge now sits between
// a host capability and this file, so wiring a real one later touches only
// the one object passed to `createNostrPublicationDistributionRuntimeAdapter()`,
// never this file's own call to `createPublicationDistributionRuntimeProvider()`,
// and never anything below it.
//
// 0.9.109 — Arweave Publication Distribution Runtime Adapter. The symmetric
// counterpart to 0.9.108, closing the one gap that file's own header
// explicitly left open: nothing in this codebase actually PRODUCES a
// `signer` from a real host Arweave signing capability.
// `createArweavePublicationDistributionRuntimeAdapter()`
// (`application/ArweavePublicationDistributionRuntimeAdapter.js`, NEW) is
// that bridge — but unlike Nostr's own adapter, there is no renaming to
// perform: the runtime provider already accepts a field named exactly
// `signer`, the same name a host signing capability is expected to already
// carry, so `signer`/`gatewayUrl`/`fetchImpl` pass through this adapter
// completely unchanged. The seam exists so a future host signer source (a
// wallet extension, an application-provided signer, a development/test
// fixture) plugs into ONE function this file already calls, rather than
// into a `{}` literal shaped by hand inline — the identical value 0.9.107's
// own header already gave for itself.
//
// NO HOST ARWEAVE SIGNING CAPABILITY EXISTS ANYWHERE IN THIS CODEBASE YET
// EITHER, SO THIS MILESTONE ALSO CHANGES NO OBSERVABLE BEHAVIOR.
// `createArweavePublicationDistributionRuntimeAdapter({})` resolves
// `{ signer: undefined, gatewayUrl: undefined, fetchImpl: undefined }` —
// spread into `createPublicationDistributionRuntimeProvider({ ... })`
// below, functionally identical to before this adapter existed. This
// milestone's entire value is that a real, independently tested
// Arweave-specific bridge now sits between a host signing capability and
// this file, so wiring a real one later touches only the one object passed
// to `createArweavePublicationDistributionRuntimeAdapter()`, never this
// file's own call to `createPublicationDistributionRuntimeProvider()`, and
// never anything below it. See that file's own header for why it is
// particularly strict about accepting an already-usable `signer` — never a
// `privateKey`/`mnemonic`/`seed`/`walletPassword` this file would have to
// turn into one.
// 0.9.121 — Publication Distribution Host Capability Integration. 0.9.107
// through 0.9.109 built the seam a host signer/publish capability plugs
// into; nothing before this milestone ever produced one. `window.arweaveWallet`
// (ArConnect/Wander) and `window.nostr` (any NIP-07 extension) are the real
// host capabilities this composition root resolves them from — see
// `arweave/ArweaveInjectedProviderSigner.js` and
// `nostr/NostrInjectedProviderPublisher.js` for the actual signing/
// publishing logic, entirely absent from this file. Neither is present in
// every browser; `createArweaveInjectedProviderSigner()`/
// `createNostrInjectedProviderPublisher()` already degrade to `undefined`
// when the corresponding extension is not installed, which the two runtime
// adapters below already treat exactly as they treat any other absent
// capability — a graceful "not currently configured," never a throw here.
// `discoveryTag` is ForkBuild's own distribution campaign marker, not a
// host concern — see `application/NostrPublicationDistributionRuntimeAdapter.js`'s
// own header, "`publish` and `relayUrl` are what a host provides;
// `discoveryTag`... are ForkBuild's own campaign configuration" — supplied
// here, once, for the same reason this file is the one place 0.9.108's own
// header already named for it.
//
// BUG FIX — `arweaveHostSigner`/`nostrHostPublisher` (below) NO LONGER
// RESOLVE `window.arweaveWallet`/`window.nostr` ONCE, EAGERLY, AT THIS
// MODULE'S OWN EVALUATION INSTANT. A real extension's own content script
// is not guaranteed to have finished injecting by the moment this file's
// top-level code runs — a person can have a fully working Arweave/Nostr
// extension installed and this file still captures `undefined` a moment
// too early, permanently, for the rest of that page load, with no later,
// successful injection ever seen again (reported and reproduced live:
// Wander and nos2x both installed and confirmed present in devtools,
// "Distribute Snapshot" still failing with "a discoveryPublisher with a
// publish() method is required" on that same load). Both are now a small,
// always-present, LAZY delegate: each actual `sign()`/`publish()` call
// re-resolves the injected provider fresh, at that exact moment, rather
// than trusting a snapshot taken at boot. Every downstream duck-typed
// presence check in this file (`canAttemptArweavePlacement()` and
// siblings, one per composition below) only ever asks "is there a
// function here at all" — never whether it can presently succeed — so
// both delegates are always truthy; "no extension is currently available"
// now surfaces honestly at the moment an actual sign/publish is attempted,
// mirroring `arweave/ArweaveInjectedProviderSigner.js`'s and `nostr/
// NostrInjectedProviderPublisher.js`'s own "no explicit connect step —
// connection is lazy" restraint, extended one step earlier, to WALLET
// PRESENCE DETECTION itself.
function resolveArweaveHostSigner() {
    return createArweaveInjectedProviderSigner({
        injectedProvider: typeof window !== 'undefined' ? window.arweaveWallet : undefined
    });
}
// AMENDED BY 0.9.631 — `sign()` NOW FORWARDS AN OPTIONAL `tags` ARGUMENT.
// `arweave/ArweaveInjectedProviderSigner.js`'s own `sign(material, tags = [])`
// has accepted a tags parameter since 0.9.490 — this delegate's own
// signature was never updated to match, so every existing
// `uploadTaggedTransaction(material, tag)` call already routed through this
// wrapper (`arweaveAnnouncementUploadTaggedTransaction`, 0.9.492, and now
// `publicationCommentaryArweaveDistribution`, this same milestone) silently
// dropped its own tag before it ever reached the real host wallet. Fully
// backward compatible: a caller that still calls `sign(material)` alone
// gets the identical `tags = []` default the underlying signer itself
// already defaults to.
const arweaveHostSigner = {
    sign(material, tags = []) {
        const signer = resolveArweaveHostSigner();
        return signer
            ? signer.sign(material, tags)
            : Promise.reject(new Error('This device has no Arweave wallet/signing capability configured yet.'));
    }
};

// 0.9.505 — Register Arweave as Snapshot Content Store.
//
// tests/SnapshotContentStorageChoiceCapabilityBoundaryAudit.js's own 0.9.504
// audit found this to be a pure composition-root gap: content/
// ArweaveContentStore.js (0.9.132) already satisfies content/ContentStore.js's
// contract exactly like content/IpfsContentStore.js does, and application/
// SnapshotPlacementStoreRegistry.js already accepts it with zero registry
// code change (that audit's own Section F). This is that one missing
// composition — constructing the real store and registering it under its
// own `storage` key (`'ar'` — content/ArweaveContentStore.js's own label,
// unchanged) into the two registries Snapshot Placement already uses for
// CREATION (`snapshotPlacementStoreRegistry`, above) and RESOLUTION
// (`publicationSnapshotPlacementResolutionStoreRegistry`, above) — the
// identical two-registry shape 'local'/`publicationContentStore` already
// shares across both. Registering into both, from ONE shared instance,
// rather than only the creation side, is what makes an Arweave placement
// genuinely round-trip through the existing placement mechanism (create,
// then later resolve) instead of being creatable but permanently
// STORE_UNAVAILABLE on read-back.
//
// `arweaveHostSigner`/`resolvedArweaveGatewayUrl` ARE THE SAME INSTANCES
// the Arweave anchor wiring immediately below already resolves — never a
// second read of either. `arweaveHostSigner` is always a real, lazily-
// resolving object (see its own comment above), so this construction never
// throws for "no wallet installed" — an absent wallet only ever surfaces
// later, honestly, the first time a person actually attempts an Arweave
// placement, exactly as `arweaveAnchorPublisher`'s own identical
// construction below already handles the same absence.
//
// THIS NEVER TOUCHES SNAPSHOT DISTRIBUTION. `snapshotDistributionCommand`'s
// own `composeSnapshotDistributionRuntime()` call (below) constructs its
// own, independent ArweaveContentStore — see that 0.9.504 audit's own
// Section G/H/J for why the two remain deliberately unconnected composition
// sites, and why closing that gap is separate, later, unscheduled work.
const arweaveSnapshotPlacementContentStore = new ArweaveContentStore({
    signer: arweaveHostSigner,
    gatewayUrl: resolvedArweaveGatewayUrl
});
snapshotPlacementStoreRegistry.register(arweaveSnapshotPlacementContentStore);
publicationSnapshotPlacementResolutionStoreRegistry.register(arweaveSnapshotPlacementContentStore);

// 0.9.425 — Arweave Proof/Anchoring Provider Implementation.
//
// 0.9.424's own audit found PROOF_AND_ANCHORING's Arweave gap to be a
// pure PROVIDER_GAP: application/ExternalAnchorPublisherRegistry.js,
// application/ExternalProofVerifierRegistry.js, and application/
// ExternalAnchorEvidenceViewRegistry.js already accept an "arweave" key
// with zero registry change, and application/
// PublicationAnchorCreationCoordinator.js#availableAnchorTypes() (already
// rendered by ui/views/DecentralizedPublicationsView.js's own v-for)
// already reports whatever those registries hold. This is that missing
// provider — registered into the exact same registry INSTANCES Bitcoin's
// own anchor wiring (above, 0.8.9-0.8.14) already constructed, never a
// second registry or a new UI mechanism.
//
// `arweaveHostSigner` IS THE SAME INSTANCE the Publication/Snapshot
// distribution wiring immediately below already resolves from
// `window.arweaveWallet` — never a second read of that host capability.
// `resolvedArweaveGatewayUrl` (resolved once, above, from this device's
// own ArweaveGatewayConfigurationStore) is reused identically for both
// the publish (write) and verify (read) side, exactly as Bitcoin's own
// `network: 'mainnet'` is reused across its publisher and verifier.
//
// NO SEPARATE FALLBACK SIGNER NEEDED HERE. `arweaveHostSigner` MIRRORS
// `bitcoinBroadcaster`'S OWN HONEST-UNAVAILABLE PATTERN (0.8.11, above)
// ON ITS OWN, DIRECTLY — no wrapping needed at this call site. Before the
// lazy-resolution bug fix above, `arweaveHostSigner` could be `undefined`
// outright when no wallet extension was installed, so this wiring needed
// its own dedicated `arweaveAnchorFallbackSigner` to get the same honest
// rejection. `arweaveHostSigner` is now always a real object whose own
// `sign()` already rejects with the identical "This device has no Arweave
// wallet/signing capability configured yet." message when no extension is
// currently available — a second, duplicate fallback here would just be
// dead code. "Create Arweave Anchor" still always appears once a person
// opens the Publication Center, exactly like "Create Bitcoin Anchor"
// already does, and still reports PUBLISH_UNAVAILABLE with a truthful
// reason until a real wallet extension is connected — never a crash,
// never a silently absent option.
const { arweaveAnchorPublisher } = new CreateArweaveAnchorPublisherUseCase().execute({
    signer: arweaveHostSigner,
    gatewayUrl: resolvedArweaveGatewayUrl
});
externalAnchorPublisherRegistry.register(arweaveAnchorPublisher);

const { arweaveProofVerifier } = new CreateArweaveAnchorProofVerifierUseCase().execute({
    gatewayUrl: resolvedArweaveGatewayUrl
});
externalAnchorProofVerifierRegistry.register(arweaveProofVerifier);

// 0.9.465 — Wire Base Proof Verification into the Production Composition
// Root. tests/BaseProofVerificationIntegrationBoundaryAudit.test.js
// (0.9.464) found anchoring/BaseProofVerifier.js and application/
// CreateBaseAnchorProofVerifierUseCase.js (0.9.463) mechanically sound but
// absent from this file — `CreateBaseAnchorProofVerifierUseCase` was never
// imported, constructed, or registered here, unlike its Bitcoin/Arweave
// siblings immediately above. This is that one missing registration, and
// nothing else: mirrors `bitcoinProofVerifier`'s own bare
// `new Create...UseCase().execute()` call (no args) rather than
// `arweaveProofVerifier`'s configured one, because — exactly like Bitcoin's
// own proof verifier — there is no separately-resolved Base RPC config
// value anywhere in this file to thread through; omitting `rpcUrl`/
// `fetchImpl` gets the identical default production endpoint `baseJsonRpcClient`
// above already resolves to. `baseProofVerifier` is a SEPARATE
// BaseJsonRpcClient instance from `baseJsonRpcClient` above — never wired
// to share one — the same "own dedicated client" split this file's
// existing `bitcoinProofVerifier` already holds apart from
// `bitcoinEsploraTransactionConfirmationObserver`'s own client.
const { baseProofVerifier } = new CreateBaseAnchorProofVerifierUseCase().execute();
externalAnchorProofVerifierRegistry.register(baseProofVerifier);

const { arweaveAnchorEvidenceView } = new CreateArweaveAnchorEvidenceViewUseCase().execute();
externalAnchorEvidenceViewRegistry.register(arweaveAnchorEvidenceView);

// 0.9.511 — Base Anchor Evidence View. The presentation-side counterpart
// of `baseProofVerifier` above, one axis over — mirrors
// `arweaveAnchorEvidenceView`'s own registration immediately above
// exactly. `baseAnchorEvidenceView` never talks to a Base RPC endpoint
// or wallet — see anchoring/BaseAnchorEvidenceView.js's own header — so
// it needs no fake/no-op collaborator standing in for a capability this
// replica doesn't have yet.
const { baseAnchorEvidenceView } = new CreateBaseAnchorEvidenceViewUseCase().execute();
externalAnchorEvidenceViewRegistry.register(baseAnchorEvidenceView);

// See the "BUG FIX" comment above `arweaveHostSigner`, above — the
// identical lazy-resolution fix, one substrate over. `nostrHostPublisher`
// is a plain function (never an object), matching exactly what
// `createNostrInjectedProviderPublisher()` itself already returns, so
// every downstream `typeof publishImpl === 'function'` presence check
// keeps working unmodified.
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

// 0.9.628 — Publication Commentary Nostr Asynchronous Distribution.
//
// `nostrHostPublisher`/`nostrRelayQueryClient`/`resolvedNostrRelayUrls` all
// already exist above (this file's own existing Nostr wiring, unmodified)
// — this is a fourth, independent consumer of the same three values,
// exactly like `nostrPublicationRuntimeCapabilities` immediately above it
// and `nostrSnapshotDiscoveryPublisherOptions` further below: no second
// relay-configuration mechanism, no second host-capability resolution.
// `NostrMultiRelayPublicationCommentaryDistribution` (application/, fanning
// out across `resolvedNostrRelayUrls` — see core/NostrRelayConfiguration.js's
// own "unified" header) wraps `PublicationCommentaryNostrDistribution`
// (application/, 0.9.628's own small, permanent adapter, unmodified) — the
// identical composition that test file's own
// `ComposedNostrTransportCommentarySubstrate` already proved conforms to
// core/PublicationCommentaryAsynchronousDeliveryContract.js's own
// publish()/retrieve() contract, given a real home. `discoveryTag`
// defaults to `'forkbuild-commentary'` (see that class's own header) — a
// separate campaign from `PUBLICATION_DISCOVERY_TAG`/`'forkbuild-snapshot'`,
// never reusing either.
//
// Assigning the outer `publicationCommentaryNostrDistribution` binding
// (declared `null` earlier in this file, where `addPublicationCommentaryCommand`
// closes over it) is what actually turns on the best-effort Nostr publish
// inside that function — before this line runs, every Commentary
// submission's own Nostr publish attempt above is a silent no-op (the
// `if (publicationCommentaryNostrDistribution)` guard), never a throw.
//
// UNIFIED — Commentary used to target a single relay
// (`relayUrl: resolvedNostrRelayUrl`), the one asynchronous Nostr substrate
// that had never gained relay multiplicity. It now fans out across the
// SAME unified relay set every other Nostr consumer uses — see core/
// NostrRelayConfiguration.js's own "unified" header and application/
// NostrMultiRelayPublicationCommentaryDistribution.js's own header for the
// fan-out contract (publish/retrieve resolve on the first relay to
// succeed; discover concatenates every relay's own results).
publicationCommentaryNostrDistribution = new NostrMultiRelayPublicationCommentaryDistribution({
    publishImpl: nostrHostPublisher,
    queryImpl: nostrRelayQueryClient,
    relayUrls: resolvedNostrRelayUrls
});

// The explicit, separately-invoked acquisition boundary this milestone's
// own requesting brief called for — never wired into
// `getPublicationCommentariesCommand` (see application/
// DiscoverPublicationCommentaryFromNostrUseCase.js's own header on why).
// Reuses the SAME `publicationCommentaryDistributionExchange` instance
// `addPublicationCommentaryCommand` and the WebRTC peer exchange already
// share — no second store, no second exchange, no second verifier.
const discoverPublicationCommentaryFromNostrUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(
    publicationCommentaryNostrDistribution,
    publicationCommentaryDistributionExchange
);
// A newly-admitted remote Commentary is fed into the SAME
// `publicationCommentaryRemoteNotificationBridge` instance the WebRTC
// path already uses (constructed earlier in this file, 0.9.623) — never a
// second, transport-specific notification mechanism. Best-effort,
// mirroring that same bridge's own existing WebRTC subscription: a
// notification failure for one admitted Commentary must never stop the
// remaining ones in the same batch from being processed.
function discoverPublicationCommentaryFromNostrCommand(publicationId) {
    return discoverPublicationCommentaryFromNostrUseCase.execute({ publicationId }).then((results) => {
        for (const result of results) {
            try {
                publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result);
            } catch {
                // Best-effort only — see this section's own header, above.
            }
        }
        return results;
    });
}
app.provide('discoverPublicationCommentaryFromNostrCommand', discoverPublicationCommentaryFromNostrCommand);

// 0.9.631 — Publication Commentary Arweave Asynchronous Distribution.
//
// `arweaveHostSigner`/`resolvedArweaveGatewayUrl` both already exist above
// (this file's own existing Arweave wiring, unmodified) — this is another
// independent consumer of the same two values, exactly like
// `arweaveSnapshotDiscoveryQueryService`'s own reuse of
// `resolvedArweaveGatewayUrl` elsewhere in this file: no second gateway
// resolution, no second signer-resolution mechanism. `graphqlUrl`/`tagName`
// are left at their own defaults on `PublicationCommentaryArweaveDistribution`
// — this substrate's own, separate campaign namespace (see that class's own
// header) — the identical "left at its own defaults" restraint
// `arweaveSnapshotDiscoveryQueryService`'s own construction site already
// holds. `discoveryTag` defaults to `'forkbuild-commentary'`, matching
// `PublicationCommentaryNostrDistribution`'s own default VALUE while
// remaining a separate campaign at the transport level (see that class's
// own header).
//
// Assigning the outer `publicationCommentaryArweaveDistribution` binding
// (declared `null` earlier in this file, where `addPublicationCommentaryCommand`
// closes over it) is what actually turns on the best-effort Arweave publish
// path inside that function whenever a caller selects
// `discoveryProvider: 'arweave'` — before this line runs, that selection
// resolves to a silent no-op (the `if (asynchronousDistribution)` guard),
// never a throw, the identical restraint the Nostr binding already held
// before its own 0.9.628 assignment above.
publicationCommentaryArweaveDistribution = new PublicationCommentaryArweaveDistribution({
    signer: arweaveHostSigner,
    gatewayUrl: resolvedArweaveGatewayUrl
});

// The explicit, separately-invoked acquisition boundary this milestone's
// own requesting brief called for — never wired into
// `getPublicationCommentariesCommand`, mirroring
// `discoverPublicationCommentaryFromNostrUseCase`/
// `discoverPublicationCommentaryFromNostrCommand` immediately above,
// substrate for substrate. Reuses the SAME `publicationCommentaryDistributionExchange`
// instance `addPublicationCommentaryCommand`, the WebRTC peer exchange, and
// the Nostr discovery use case above already share — no second store, no
// second exchange, no second verifier.
const discoverPublicationCommentaryFromArweaveUseCase = new DiscoverPublicationCommentaryFromArweaveUseCase(
    publicationCommentaryArweaveDistribution,
    publicationCommentaryDistributionExchange
);
// A newly-admitted remote Commentary is fed into the SAME
// `publicationCommentaryRemoteNotificationBridge` instance WebRTC and Nostr
// already use — never a third, transport-specific notification mechanism.
// Best-effort, mirroring `discoverPublicationCommentaryFromNostrCommand`'s
// own restraint immediately above: a notification failure for one admitted
// Commentary must never stop the remaining ones in the same batch from
// being processed.
function discoverPublicationCommentaryFromArweaveCommand(publicationId) {
    return discoverPublicationCommentaryFromArweaveUseCase.execute({ publicationId }).then((results) => {
        for (const result of results) {
            try {
                publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result);
            } catch {
                // Best-effort only — see this section's own header, above.
            }
        }
        return results;
    });
}
app.provide('discoverPublicationCommentaryFromArweaveCommand', discoverPublicationCommentaryFromArweaveCommand);

const arweavePublicationRuntimeCapabilities = createArweavePublicationDistributionRuntimeAdapter({ signer: arweaveHostSigner });
// 0.9.492 — Wire Arweave Tagged Transaction Upload into Production
// Composition. 0.9.491's own audit (Gap 1) found this exact construction
// missing: `application/ArweaveTaggedTransactionUpload.js` (0.9.490)
// shipped a real `uploadTaggedTransaction`, but no production composition
// ever called `createArweaveTaggedTransactionUpload()`, so selecting
// "Arweave" for announcement always threw. `arweaveHostSigner` (the same
// lazy, injected host signer `arweavePublicationRuntimeCapabilities`/
// `arweaveAnchorPublisher` already share above) and `resolvedArweaveGatewayUrl`
// (this device's own configured gateway, resolved once at the top of this
// file) are reused unchanged — no second signer, no second gateway, no new
// configuration.
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
// 0.9.430 — Announcement/Discovery Provider Selection Reachability.
// `createPublicationDistributionRuntimeProvider()`'s own `arweaveAnnouncement`
// section (see that file's own header, "AMENDED BY 0.9.430") is what
// produces `arweaveAnnouncementPublisherOptions` below — this file still
// never imports `application/PublicationDistributionConfigurationProvider.js`
// directly, exactly the same restraint it already holds for
// `arweaveUploaderOptions`/`nostrPublisherOptions`.
//
// AMENDED BY 0.9.492 — `uploadTaggedTransaction` (constructed immediately
// above) is now forwarded into `createPublicationDistributionRuntimeProvider()`,
// so this section resolves a real, usable `arweaveAnnouncementPublisherOptions`
// whenever a wallet is connected, rather than always `undefined`. Whether
// it is actually usable right now (a wallet is connected) remains entirely
// `resolveArweaveAnnouncementPublisherOptions()`'s own decision, unchanged.
const { arweaveUploaderOptions, nostrPublisherOptions, arweaveAnnouncementPublisherOptions } = resolvePublicationDistributionRuntimeConfiguration(publicationDistributionRuntimeProvider.resolveRuntimeCapabilities());
const publicationDistributionCommand = composePublicationDistributionCommand({
    lifecycleStore: publicationDistributionLifecycleStore,
    arweaveUploaderOptions,
    nostrPublisherOptions,
    arweaveAnnouncementPublisherOptions
});
app.provide('publicationDistributionCommand', publicationDistributionCommand);

// 0.9.447 — Nostr Publication Relay Set Configuration. The one composition
// change 0.9.446's own Section F5 named precisely: this same composition
// root, immediately below its own existing single-relay
// `publicationDistributionCommand` above, now ALSO composes
// `executeMultiRelayNostrPublicationDistributionCommand()` (0.9.444) via
// `composeMultiRelayNostrPublicationDistributionCommand()` (this same
// milestone) — pre-binding `resolvedNostrRelayUrls` alongside the identical
// `arweaveUploaderOptions`/`nostrPublisherOptions`/`lifecycleStore`
// collaborators the single-relay command already uses. This changes
// nothing about `publicationDistributionCommand` itself, and nothing about
// any existing caller's behavior — it only makes the already-implemented
// multi-relay fan-out capability reachable, configured, from this
// composition root, for a future caller to invoke.
//
// AMENDED BY 0.9.450 — Nostr Multi-Relay Publication Distribution Wiring.
// That "future caller" is now `ui/views/WorldView.js`/`ui/views/EditorView.js`/
// `ui/views/DecentralizedPublicationsView.js`'s own Nostr distribution
// paths — see each file's own 0.9.450 amendment. This composition itself
// is entirely unchanged: those three views inject the exact instance
// provided immediately below, never constructing their own.
//
// UNIFIED — this used to pre-bind the separately-configured
// `resolvedNostrPublicationRelayUrls`; it now pre-binds the SAME
// `resolvedNostrRelayUrls` Snapshot/Place-Naming discovery and Snapshot
// announcement already use — see core/NostrRelayConfiguration.js's own
// "unified" header.
const multiRelayNostrPublicationDistributionCommand = composeMultiRelayNostrPublicationDistributionCommand({
    lifecycleStore: publicationDistributionLifecycleStore,
    arweaveUploaderOptions,
    nostrRelayUrls: resolvedNostrRelayUrls,
    nostrPublisherOptions
});
app.provide('multiRelayNostrPublicationDistributionCommand', multiRelayNostrPublicationDistributionCommand);

// 0.9.138 — World View Snapshot Distribution Action.
//
// 0.9.137's own `composeSnapshotDistributionRuntime()` turns a host
// signing/publishing capability into a `{ contentStore, discoveryPublisher }`
// pair; 0.9.136's own `executeSnapshotDistributionCommand()` sequences that
// pair against a caller-supplied `bytes`. Nothing before this milestone ever
// called either — this is that one composition, mirroring the immediately
// preceding `publicationDistributionCommand` wiring one family over, and
// nothing more.
//
// `arweaveHostSigner`/`nostrHostPublisher` ARE THE SAME INSTANCES the
// Publication Distribution wiring above already resolved from
// `window.arweaveWallet`/`window.nostr` — never a second read of either
// host capability. Both adapters are stateless wrappers around whatever
// extension is installed (see `arweave/ArweaveInjectedProviderSigner.js`/
// `nostr/NostrInjectedProviderPublisher.js`'s own headers), so sharing them
// across the two independent distribution families is exactly the "host
// capability, not a family-specific one" boundary 0.9.121 already drew —
// Signed Claim distribution and Snapshot distribution remain two
// unconnected pipelines regardless (see `application/
// SnapshotDistributionCommand.js`'s and `application/
// SnapshotDistributionRuntimeComposition.js`'s own "no coupling to Signed
// Claim distribution" restraints, both unmodified by this reuse).
//
// `discoveryTag: 'forkbuild-snapshot'` IS A DIFFERENT CAMPAIGN MARKER THAN
// `'forkbuild-publication'`, ABOVE — the two families announce onto the
// same Nostr relay set without becoming the same discovery stream.
//
// `relayUrls: resolvedNostrRelayUrls` — RELAY RESILIENCE FOR SNAPSHOT
// ANNOUNCEMENT. Before this, `nostrSnapshotDiscoveryPublisherOptions` never
// carried a relay of any kind, so every announcement silently used
// `NostrSnapshotDiscoveryPublisher`'s own hardcoded
// `DEFAULT_RELAY_URL` ('wss://relay.damus.io') regardless of a Wanderer's
// own "Nostr Relay" Settings override — a real gap that Settings page's own
// text used to name explicitly ("does not change where announcements are
// published"). `composeSnapshotDistributionRuntime()`'s own
// `buildNostrSnapshotDiscoveryPublisher()` now resolves this options bag's
// `relayUrls` into either the unchanged single-relay
// `NostrSnapshotDiscoveryPublisher` (one configured relay) or a
// `NostrMultiRelaySnapshotDiscoveryPublisher` (more than one) that fans the
// announcement out to every configured relay — resilient against any one
// relay being unreachable, exactly the behavior a Wanderer configuring more
// than one relay under "Nostr Relay" now actually gets.
//
// `snapshotDiscoveryPublisher` MAY BE `null` — composeSnapshotDistributionRuntime()'s
// own graceful degradation, unchanged — in which case `snapshotDistributionCommand(bytes)`
// throws synchronously, exactly as calling `executeSnapshotDistributionCommand()`
// directly with no usable discoveryPublisher already would. `ui/views/
// WorldView.js`'s own `distributeWorldEncounterSnapshot()` wraps every call
// to this function in a `Promise.resolve().then(...)`, catching that
// synchronous throw the same way it already catches a genuine rejection.
//
// 0.9.506 — Make Snapshot Distribution Content Backend Selectable. This
// call site no longer asks composeSnapshotDistributionRuntime() to build
// its own `contentStore` half at all (no `arweaveContentStoreOptions`
// passed in) — Content is now resolved from `snapshotPlacementStoreRegistry`,
// the SAME registry Snapshot Placement's own creation coordinator already
// built and already registers 'local'/'ipfs'/'ar' into (see that wiring,
// and the 0.9.505 Arweave registration, above). That removes the second,
// independent ArweaveContentStore instance this call site used to
// construct for itself — there is now exactly one ArweaveContentStore
// instance in this file, shared by Placement and Distribution alike.
// `resolveSnapshotDistributionContentStore()` (application/
// SnapshotDistributionContentBackendSelection.js) restricts an actual
// lookup to the closed 'ipfs'/'ar' allowlist that file's own header names
// — 'local' stays a legitimate Placement backend but is never offered as a
// Distribution target — and throws synchronously for anything else,
// exactly the "collaborator contract violations are caught at the start"
// discipline `executeSnapshotDistributionCommand()`'s own header already
// holds one layer up. `storage` defaults to `'ar'` so every existing
// caller that has not been updated to pass one explicitly (`ui/views/
// WorldView.js`'s own `distributeWorldEncounterSnapshot()`, and everything
// downstream of it) keeps its exact pre-0.9.506 behavior, unchanged.
//
// 0.9.566 — this wrapper now also accepts, and forwards unmodified, the
// identical optional `publicationId`/`claimedPosition` pair
// `executeSnapshotDistributionCommand()` itself has accepted since 0.9.566
// (and `discoveryPublisher.publish()` has accepted since 0.9.171) — this
// call site computes neither field itself; see `ui/views/WorldView.js`'s
// own `distributeWorldEncounterSnapshot()` for where they come from.
const { discoveryPublisher: snapshotDiscoveryPublisher } = composeSnapshotDistributionRuntime({
    nostrSnapshotDiscoveryPublisherOptions: { publishImpl: nostrHostPublisher, discoveryTag: 'forkbuild-snapshot', relayUrls: resolvedNostrRelayUrls }
});
const snapshotDistributionCommand = (bytes, storage = 'ar', publicationId, claimedPosition) => executeSnapshotDistributionCommand({
    bytes,
    contentStore: resolveSnapshotDistributionContentStore(snapshotPlacementStoreRegistry, storage),
    discoveryPublisher: snapshotDiscoveryPublisher,
    publicationId,
    claimedPosition
});
app.provide('snapshotDistributionCommand', snapshotDistributionCommand);
// 0.9.663 — Connect Remote IPFS to Nostr Snapshot Distribution. Exposes the
// SAME `snapshotDiscoveryPublisher` instance directly — never a second
// `NostrSnapshotDiscoveryPublisher` construction — so `ui/views/
// DecentralizedPublicationsView.js#publishToRemoteIpfs()` can announce a
// Remote IPFS-produced CID via Nostr once that CID already exists, without
// going through `executeSnapshotDistributionCommand()`'s own
// `contentStore.put(bytes)` step (which would re-upload the bytes through a
// second HTTP pin rather than reuse the CID `IpfsRemotePublicationCoordinator`
// already obtained). May be `null` — the identical graceful degradation
// `snapshotDiscoveryPublisher` itself already holds.
app.provide('snapshotDiscoveryPublisher', snapshotDiscoveryPublisher);
// 0.9.506 — the eligible-and-currently-registered Content backend list a
// caller (ui/views/DecentralizedPublicationsView.js) can offer as an
// explicit Snapshot Distribution picker, without ever hardcoding or
// re-deriving that list itself.
const snapshotDistributionAvailableStorageTypes = () => availableSnapshotDistributionStorageTypes(snapshotPlacementStoreRegistry);
app.provide('snapshotDistributionAvailableStorageTypes', snapshotDistributionAvailableStorageTypes);

// 0.9.320 — Explicit Place Naming Publication Action.
//
// `application/NostrPlaceNamingDiscoveryPublisher.js` (0.9.316) has existed,
// fully built and tested, since before this milestone — 0.9.318/0.9.319
// each confirmed it stayed composition-root-unreachable. This is that one
// composition, mirroring the immediately preceding `snapshotDistributionCommand`
// wiring, and nothing more.
//
// `nostrHostPublisher` IS THE SAME INSTANCE the Publication/Snapshot
// distribution wiring above already resolved from `window.nostr` — never a
// second read of that host capability. `application/
// PlaceNamingPublicationRuntimeComposition.js`'s own graceful degradation
// means `placeNamingDiscoveryPublisher` may be `null` when no compatible
// extension is installed, in which case `publishPlaceNamingClaimToNostrCommand(claim)`
// rejects with a plain, readable error rather than ever fabricating a
// publication result — `ui/views/WorldView.js`'s own
// `publishNamingClaimToNostr()` surfaces that rejection exactly like any
// other.
//
// NEVER A SECOND CAMPAIGN TAG. Unlike `snapshotDistributionCommand`'s own
// `discoveryTag: 'forkbuild-snapshot'`, this file supplies no `discoveryTag`
// at all — `NostrPlaceNamingDiscoveryPublisher#publish(claim)` derives one
// itself, from the claim's own `worldId`/`regionId`, the one deliberate
// departure from the Snapshot family's own shape that file's own header
// already documents.
const { discoveryPublisher: placeNamingDiscoveryPublisher } = composePlaceNamingPublicationRuntime({
    nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: nostrHostPublisher }
});
const publishPlaceNamingClaimToNostrCommand = (claim) => Promise.resolve().then(() => {
    if (!placeNamingDiscoveryPublisher) {
        throw new Error('Nostr publishing is not available — no compatible browser extension was found');
    }
    return placeNamingDiscoveryPublisher.publish(claim);
});
app.provide('publishPlaceNamingClaimToNostrCommand', publishPlaceNamingClaimToNostrCommand);

// 0.9.142 — World View Snapshot Discovery Command.
//
// application/DecentralizedSnapshotResolver.js (0.9.134) has answered
// "can a Snapshot for this contentHash be discovered, retrieved, and
// verified" since before Snapshot DISTRIBUTION was ever wired into this
// file — nothing before this milestone ever called it outside its own
// test suite. `composeDiscoverSnapshotRuntime()` (this milestone's own
// application/DiscoverSnapshotRuntimeComposition.js) turns a host Nostr
// query/Arweave capability into a `{ resolver, contentStore }` pair;
// `executeDiscoverSnapshotCommand()` (application/DiscoverSnapshotCommand.js)
// sequences that pair against a caller-supplied `contentHash`. This is
// that one composition, mirroring the immediately preceding
// `snapshotDistributionCommand` wiring, and nothing more.
//
// `arweaveHostSigner` IS THE SAME INSTANCE the Snapshot Distribution
// wiring immediately above (and the Publication Distribution wiring
// before it) already resolved from `window.arweaveWallet` — never a
// second read of that host capability.
//
// UPDATED 0.9.147 — `nostrSnapshotDiscoveryQueryServiceOptions.queryImpl`
// WAS OMITTED HERE, naming the identical, already-documented gap this
// file's own 0.9.110 comment named for `nostrQueryImpl`. `nostrRelayQueryClient`
// — the SAME instance 0.9.110's own wiring above already constructed and
// passed to `nostrQueryImpl` — is handed through here too. Querying a
// Nostr relay (send REQ, collect EVENT, stop at EOSE) is a fundamentally
// different capability from PUBLISHING one (window.nostr's own NIP-07
// `signEvent`, already wrapped by `createNostrInjectedProviderPublisher()`
// above), which is exactly why `nostr/NostrRelayQueryClient.js` (0.9.147)
// is a separate, transport-only producer — it needs no injected
// extension, no wallet permission, and no user identity, only a
// `WebSocket`. `composeDiscoverSnapshotRuntime()` still gracefully
// resolves `resolver: null` on any environment where
// `nostrRelayQueryClient` itself resolved `undefined` (see that file's own
// header, "graceful degradation") — this milestone closes the capability
// gap, not the composition root's own honest handling of an absent one.
// `discoverSnapshotCommand(contentHash)` still throws synchronously in
// that residual case; `ui/components/OwnPublicationPanel.js`'s own
// `discoverOwnSnapshot()` already wraps every call in a
// `Promise.resolve().then(...)`, catching that synchronous throw the same
// way it already catches a genuine rejection.
// 0.9.369 — `relayUrl: resolvedNostrRelayUrl` (resolved once, above) is
// this file's own SECOND Nostr read-path call site, after `nostrRelayUrl`
// above.
//
// 0.9.508 — Snapshot Resolution Content Backend Registry Integration.
//
// `composeDiscoverSnapshotRuntime()` no longer receives an
// `arweaveContentStoreOptions` of its own — tests/
// SnapshotContentBackendSelectionEndToEndIntegrationAudit.test.js's own
// Section H found that `discoverSnapshotCommand`/`resolveSelectedSnapshotCommand`
// (immediately below) resolved every discovered candidate through the
// fixed, single ArweaveContentStore this call used to build, regardless
// of that candidate's own declared `storage` — an IPFS-distributed
// Snapshot's own candidate was permanently CONTENT_UNAVAILABLE through
// either production entry point, even though it resolves correctly
// against `publicationSnapshotPlacementResolutionStoreRegistry` directly
// (that same audit's own Section G). `resolver` is unaffected — it
// depends only on `queryService` (application/
// DiscoverSnapshotRuntimeComposition.js's own header, "resolver depends
// only on a usable queryImpl") — so dropping `arweaveContentStoreOptions`
// here removes a now-entirely-unused second ArweaveContentStore
// construction, never the resolver's own capability.
const { resolver: snapshotResolver, queryService: snapshotDiscoveryQueryService } = composeDiscoverSnapshotRuntime({
    nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: nostrRelayQueryClient, relayUrls: resolvedNostrRelayUrls }
});
// `storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry` —
// the SAME resolution-side registry Snapshot Placement's own resolution
// coordinator already reads (above), already carrying 'local'/'ipfs'
// (IpfsGatewayContentStore)/'ar' (the shared `arweaveSnapshotPlacementContentStore`,
// registered above) — replaces the fixed, Arweave-only `contentStore` this
// call used to pass. `DecentralizedSnapshotResolver#resolve()` (unmodified)
// looks up the ContentStore by the SELECTED candidate's own `storage`
// field (`storeRegistry.get(candidate.storage)`) — never by ranking,
// trying multiple backends, or falling back from one to another. No
// `contentStore` is passed alongside it, so there is nothing for the
// registry lookup to be silently overridden by.
const discoverSnapshotCommand = (contentHash) => executeDiscoverSnapshotCommand({
    discoveryTag: 'forkbuild-snapshot',
    contentHash,
    resolver: snapshotResolver,
    storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry
});
app.provide('discoverSnapshotCommand', discoverSnapshotCommand);

// 0.9.485 — Walking-Triggered Snapshot Candidate Query Service.
//
// Composes the Local+Nostr+Arweave candidate query service
// (application/SnapshotCandidateDiscoveryQueryService.js, application/
// LocalSnapshotCandidateDiscoveryQueryService.js, and this composition's
// own application/SnapshotCandidateDiscoveryRuntimeComposition.js) from
// collaborators this file already built: `snapshotDiscoveryQueryService`
// (the SAME NostrSnapshotDiscoveryQueryService instance
// `composeDiscoverSnapshotRuntime()` immediately above already built —
// never a second Nostr construction), `arweaveSnapshotDiscoveryQueryService`
// (0.9.500, immediately below — this replica's only instance), and
// `publicationSnapshotPlacementCatalog` (the SAME single
// LocalPublicationSnapshotPlacementCatalog instance this replica uses
// anywhere — never a second catalog; see that constant's own 0.8.19
// header, above).
//
// 0.9.500 — Compose Arweave into Snapshot Candidate Discovery.
// `arweaveSnapshotDiscoveryQueryService` is this file's own ONE
// construction site for `application/ArweaveSnapshotDiscoveryQueryService.js`
// (0.9.499, UNMODIFIED) — a read-only query surface needing no signer and
// no wallet, so, unlike Nostr, it is built directly here rather than
// inside a separate composition. `gatewayUrl: resolvedArweaveGatewayUrl`
// reuses the SAME resolved value (above) the Snapshot RETRIEVAL path
// (`composeDiscoverSnapshotRuntime()`'s own `arweaveContentStoreOptions`,
// immediately above) already reads — never a second, independent gateway
// resolution. `tagName` and `graphqlUrl` are left at their own defaults,
// which already match `application/ArweaveSnapshotDiscoveryPublisher.js`'s
// own defaults (see that pair's own headers).
const arweaveSnapshotDiscoveryQueryService = new ArweaveSnapshotDiscoveryQueryService({ gatewayUrl: resolvedArweaveGatewayUrl });
// Composed here, BEFORE `discoverSnapshotCandidatesCommand` immediately
// below, so that command's own single collaborator can be this composite
// service rather than the Nostr-only one it used before 0.9.486 — see
// that milestone's own header on `discoverSnapshotCandidatesCommand`.
const { queryService: snapshotCandidateDiscoveryQueryService } = composeSnapshotCandidateDiscoveryRuntime({
    nostrSnapshotDiscoveryQueryService: snapshotDiscoveryQueryService,
    arweaveSnapshotDiscoveryQueryService,
    placementCatalog: publicationSnapshotPlacementCatalog
});
app.provide('snapshotCandidateDiscoveryQueryService', snapshotCandidateDiscoveryQueryService);

// 0.9.151 — World View Snapshot Candidate Browser.
// 0.9.486 — Wire Snapshot Candidate Discovery Query Service into
// Walking-Triggered Discovery.
//
// `application/DiscoverSnapshotCandidatesCommand.js` (0.9.150, UNMODIFIED —
// this milestone redesigns no command) answers a different question than
// `discoverSnapshotCommand` above — "what has been announced under this
// discoveryTag, at all?" rather than "can THIS ONE contentHash be
// resolved?" — and needs a query service exposing `search(discoveryTag)`,
// never the `resolver` that wraps one. Before 0.9.486, that collaborator
// was `snapshotDiscoveryQueryService` (Nostr alone); this milestone's only
// change is swapping it for `snapshotCandidateDiscoveryQueryService`
// (immediately above — the SAME Local+Nostr composite instance
// `app.provide('snapshotCandidateDiscoveryQueryService', ...)` already
// exposed since 0.9.485, never a second composition call), so that Local
// catalog entries — including whatever Peer's own passive ANNOUNCE path
// (application/PublicationSnapshotPlacementPeerExchange.js, production
// since 0.9.483) has already added to that catalog — and Nostr
// announcements both reach every caller of this command, walking-triggered
// discovery included, through the ONE composite. `discoveryTag:
// 'forkbuild-snapshot'` is the SAME campaign marker `discoverSnapshotCommand`
// already uses, above — the candidate browser and contentHash-targeted
// resolution stay two views over one campaign, never two campaigns.
const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
    discoveryTag: 'forkbuild-snapshot',
    discoveryQueryService: snapshotCandidateDiscoveryQueryService
});
app.provide('discoverSnapshotCandidatesCommand', discoverSnapshotCandidatesCommand);

// 0.9.589 — Distinguish Snapshot Discovery Absence from Discovery
// Failure.
//
// A SIBLING PROVIDE, NEVER A REPLACEMENT of `discoverSnapshotCandidatesCommand`
// immediately above — that command stays wired exactly as it was, still
// the one `application/WorldSnapshotDiscoveryMonitor.js`'s own
// walking-triggered background discovery calls (see that file's own
// header; this milestone does not touch it). This second command reuses
// the SAME `snapshotCandidateDiscoveryQueryService`/`discoveryTag` —
// never a second composition, never a second network round trip beyond
// whichever of the two a caller actually invokes — and calls that
// service's own `searchWithOutcome()` (application/
// SnapshotCandidateDiscoveryQueryService.js, 0.9.589) instead of
// `search()`, so `ui/components/OwnPublicationPanel.js`'s own explicit
// "Discover Snapshots" button can tell a genuinely empty result apart
// from one where discovery could not be completed. See application/
// SnapshotCandidateDiscoveryOutcome.js's own header for the vocabulary.
const discoverSnapshotCandidatesWithOutcomeCommand = () => executeDiscoverSnapshotCandidatesCommandWithOutcome({
    discoveryTag: 'forkbuild-snapshot',
    discoveryQueryService: snapshotCandidateDiscoveryQueryService
});
app.provide('discoverSnapshotCandidatesWithOutcomeCommand', discoverSnapshotCandidatesWithOutcomeCommand);

// 0.9.186 — World Snapshot Background Discovery.
//
// `WorldSnapshotDiscoveryMonitor` (application/WorldSnapshotDiscoveryMonitor.js,
// UNCHANGED by 0.9.486 — see that milestone's own brief, "the monitor and
// command should not be redesigned") wraps the SAME
// `discoverSnapshotCandidatesCommand` immediately above — never a second
// query service, never a second campaign discoveryTag — so
// `ui/views/WorldView.js` can call `.observe(spatialContext)` from its own
// existing refreshSpatialUI() tick instead of requiring a person to click
// "Discover Snapshots" themselves. This monitor owns WHEN to ask (movement
// threshold, request-id staleness protection); it has no idea, and never
// needs to know, that `discoverSnapshotCandidatesCommand` now answers
// through Local+Nostr rather than Nostr alone — that swap happened
// entirely inside the command's own one collaborator, above. See that
// file's own header for why this is an additional trigger, never a
// replacement: the explicit command above stays wired to
// OwnPublicationPanel exactly as it already was.
const worldSnapshotDiscoveryMonitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });
app.provide('worldSnapshotDiscoveryMonitor', worldSnapshotDiscoveryMonitor);

// 0.9.257 — World View Place Naming Presentation.
//
// Composes the discovery query service Place Naming claims are searched
// through — the transport-level half only. `NostrPlaceNamingDiscoverySource`
// reuses the SAME `nostrRelayQueryClient` instance already constructed above
// for Snapshot discovery — never a second relay client. Mirrors
// `composeDiscoverSnapshotRuntime()`'s own graceful degradation one section
// above: `nostrRelayQueryClient` MAY STILL RESOLVE `undefined` (see that
// constant's own comment), in which case `sources` is an honest empty
// roster rather than a synchronous construction throw —
// `composePlaceNamingDiscoveryRuntime()`'s own header already documents an
// empty `sources` array as a real, fully-usable `queryService`, never a
// `null` degradation a caller would need to branch around.
//
// `ui/views/WorldView.js` — the only place `application/
// WorldNavigationSession.js` actually lives — composes the REST of the
// pipeline itself (which regions to query, and how to resolve a discovered
// claim's own region back into a position), since only that session ever
// holds the current World layout. This file hands it nothing more than the
// query service a discovery command can be built against, exactly the same
// restraint already drawn between `discoverSnapshotCandidatesCommand` above
// and the view that actually calls it.
// 0.9.369 — `relayUrls: resolvedNostrRelayUrls` (resolved once, above) is
// this file's own THIRD, and last, Nostr read-path call site. A single
// configured relay still constructs the unchanged, plain
// `NostrPlaceNamingDiscoverySource`; more than one fans the query out to
// every configured relay via `NostrMultiRelayPlaceNamingDiscoverySource` —
// see that file's own header, "at least one relay succeeds is the whole
// policy."
const placeNamingDiscoverySources = nostrRelayQueryClient
    ? [resolvedNostrRelayUrls.length > 1
        ? new NostrMultiRelayPlaceNamingDiscoverySource({ queryImpl: nostrRelayQueryClient, relayUrls: resolvedNostrRelayUrls })
        : new NostrPlaceNamingDiscoverySource({ queryImpl: nostrRelayQueryClient, relayUrl: resolvedNostrRelayUrls[0] })]
    : [];
const { queryService: placeNamingDiscoveryQueryService } = composePlaceNamingDiscoveryRuntime({ sources: placeNamingDiscoverySources });
app.provide('placeNamingDiscoveryQueryService', placeNamingDiscoveryQueryService);

// 0.9.152 — Selected Snapshot Candidate Resolution.
//
// `application/ResolveSelectedSnapshotCommand.js` (0.9.152) answers a
// different question than `discoverSnapshotCommand` above — "resolve
// EXACTLY this candidate the user selected" rather than "discover, then
// resolve whichever candidate matches first." It needs
// `resolver.resolveCandidate()`, never `resolver.resolve()` — `snapshotResolver`
// is the SAME `DecentralizedSnapshotResolver` instance `discoverSnapshotCommand`
// already wraps (0.9.152 added `resolveCandidate()` to that same class;
// see that file's own header, "one actual candidate -> retrieval ->
// verification path, never two") — never a second resolver construction.
//
// 0.9.508 — `storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry`
// is the SAME resolution registry `discoverSnapshotCommand` now uses,
// immediately above — replacing the fixed, Arweave-only
// `snapshotRetrievalContentStore` this call used to pass (see that
// wiring's own 0.9.508 comment for the full gap this closes). The
// SELECTED candidate's own `storage` field is what the registry is keyed
// by — `AutomaticSnapshotEncounterCascade`'s own injected
// `resolveSelectedSnapshotCommand` (application/
// AutomaticSnapshotEncounterCascade.js, unmodified) inherits this fix
// automatically, since it never constructs its own resolution path.
const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({
    candidate,
    resolver: snapshotResolver,
    storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry
});
app.provide('resolveSelectedSnapshotCommand', resolveSelectedSnapshotCommand);

// 0.9.158 — Selected Snapshot Materialization.
//
// `application/MaterializeSnapshotFromSelectedCandidateUseCase.js` (0.9.158)
// turns an ALREADY-RESOLVED `resolveSelectedSnapshotCommand()` result into
// local possession, through the SAME `storeSnapshotContentUseCase` every
// other explicit materialization action on this page already shares
// (0.8.36's own "unified explicit snapshot materialization sources") —
// never a second, disconnected store. `application/
// MaterializeSelectedSnapshotCommand.js` is the thin application-command
// boundary over it, mirroring `resolveSelectedSnapshotCommand` immediately
// above exactly.
const materializeSnapshotFromSelectedCandidateUseCase = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);
const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({
    resolution,
    materializer: materializeSnapshotFromSelectedCandidateUseCase
});
app.provide('materializeSelectedSnapshotCommand', materializeSelectedSnapshotCommand);

app.use(router);
app.mount('#app');
