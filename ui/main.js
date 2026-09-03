import { createApp } from 'vue';
import App from './App.js';
import { router } from './router/index.js';
import { CreateIdentityProviderUseCase } from '../application/CreateIdentityProviderUseCase.js';
import { IdentityUseCase } from '../application/IdentityUseCase.js';
import { PeerSessionManager } from '../application/PeerSessionManager.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { WebSocketRendezvousTransport } from '../peer/WebSocketRendezvousTransport.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { DiscoveryBootstrap } from '../peer/DiscoveryBootstrap.js';
import { DEFAULT_ICE_SERVERS, fetchIceServers } from '../peer/IceServerConfig.js';
import { DEFAULT_RENDEZVOUS_URLS } from '../peer/RendezvousConfig.js';
import { CreatePeerRelationshipUseCase } from '../application/CreatePeerRelationshipUseCase.js';
import { PeerReconnectionUseCase } from '../application/PeerReconnectionUseCase.js';
import { FindPeerUseCase } from '../application/FindPeerUseCase.js';
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
import { CreateBaseNetworkObserverUseCase } from '../application/CreateBaseNetworkObserverUseCase.js';
import { CreateBasePublicationTransactionPlannerUseCase } from '../application/CreateBasePublicationTransactionPlannerUseCase.js';
import { CreateBasePublicationTransactionPlanCoordinatorUseCase } from '../application/CreateBasePublicationTransactionPlanCoordinatorUseCase.js';
import { CreateBaseInjectedProviderWalletTransactionSignerUseCase } from '../application/CreateBaseInjectedProviderWalletTransactionSignerUseCase.js';
import { CreateBaseReviewedSigningCoordinatorUseCase } from '../application/CreateBaseReviewedSigningCoordinatorUseCase.js';
import { CreateBaseSignedTransactionFinalizerUseCase } from '../application/CreateBaseSignedTransactionFinalizerUseCase.js';
import { CreateBaseSignedTransactionFinalizationCoordinatorUseCase } from '../application/CreateBaseSignedTransactionFinalizationCoordinatorUseCase.js';
import { CreateBaseTransactionBroadcasterUseCase } from '../application/CreateBaseTransactionBroadcasterUseCase.js';
import { CreateBaseTransactionBroadcastCoordinatorUseCase } from '../application/CreateBaseTransactionBroadcastCoordinatorUseCase.js';
import { CreateBaseTransactionInclusionObserverUseCase } from '../application/CreateBaseTransactionInclusionObserverUseCase.js';
import { CreateBaseTransactionInclusionObservationCoordinatorUseCase } from '../application/CreateBaseTransactionInclusionObservationCoordinatorUseCase.js';
import { CreateBitcoinAnchorBroadcastCoordinatorUseCase } from '../application/CreateBitcoinAnchorBroadcastCoordinatorUseCase.js';
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
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/CreateSnapshotPlacementOrchestratorUseCase.js';
import { CreateSnapshotPlacementCreationCoordinatorUseCase } from '../application/CreateSnapshotPlacementCreationCoordinatorUseCase.js';
import { PublicationCatalogDiscoveryProvider } from '../discovery/PublicationCatalogDiscoveryProvider.js';
import { PublicationCatalogContentResolver } from '../discovery/PublicationCatalogContentResolver.js';
import { CheckLocalSnapshotContentAvailabilityUseCase } from '../application/CheckLocalSnapshotContentAvailabilityUseCase.js';
import { StoreSnapshotContentUseCase } from '../application/StoreSnapshotContentUseCase.js';
import { ImportPublicationSnapshotTransferPackageUseCase } from '../application/ImportPublicationSnapshotTransferPackageUseCase.js';
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
import { LocalWorldEncounterMaterialSource } from '../application/LocalWorldEncounterMaterialSource.js';
import { composeWorldEncounterMaterialVerifier } from '../application/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../application/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionLifecyclePersistence } from '../application/PublicationDistributionLifecyclePersistence.js';
import { PublicationDistributionLifecyclePersistenceBridge } from '../application/PublicationDistributionLifecyclePersistenceBridge.js';
import { PublicationDistributionLifecycleRestorer } from '../application/PublicationDistributionLifecycleRestorer.js';
import { hydratePublicationDistributionLifecycles } from '../application/PublicationDistributionLifecycleHydration.js';

const identityProvider = new CreateIdentityProviderUseCase().execute();
const identityUseCase = new IdentityUseCase(identityProvider);
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
const peerConnectionProvider = new WebRtcPeerConnectionProvider({ iceServers: DEFAULT_ICE_SERVERS });
// 0.3.7 — enriches `peerConnectionProvider`'s iceServers in the
// BACKGROUND with this deployment's live Metered TURN credentials
// (peer/IceServerConfig.js#fetchIceServers) — deliberately NEVER
// awaited here: app startup must never depend on a third-party HTTP
// endpoint responding at all, let alone quickly (the exact "never
// block on a network call this codebase doesn't control" discipline
// peer/WebRtcPeerConnection.js's own 0.3.6 ICE-gathering timeout
// applies one layer down). Every connection created before this
// resolves simply uses DEFAULT_ICE_SERVERS, exactly like today;
// fetchIceServers() itself never throws and never hangs past its own
// bounded timeout, so this is a pure best-effort upgrade, not a
// dependency anything else here waits on.
fetchIceServers().then((iceServers) => peerConnectionProvider.setIceServers(iceServers));
const discoveryBootstrap = new DiscoveryBootstrap({
    bootstrapProviders: DEFAULT_RENDEZVOUS_URLS.map((url) => new RendezvousDiscoveryProvider({
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
const {
    coordinator: publicationSnapshotPlacementResolutionCoordinator
} = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
    placementCatalog: publicationSnapshotPlacementCatalog,
    stores: [publicationContentStore, new IpfsGatewayContentStore()]
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
    knowledgeStore: placementKnowledgeStore
});
const { coordinator: snapshotPlacementCreationCoordinator } = new CreateSnapshotPlacementCreationCoordinatorUseCase().execute({
    createExternalSnapshotPlacementUseCase,
    storeRegistry: snapshotPlacementStoreRegistry
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
const snapshotContentMaterializationCoordinator = new SnapshotContentMaterializationCoordinator(importPublicationSnapshotTransferPackageUseCase);

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
const { externalAnchorVerifier } = new CreateExternalAnchorVerifierUseCase().execute({
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
const { createExternalPublicationAnchorUseCase, publisherRegistry: externalAnchorPublisherRegistry } =
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
    contentStore: new IpfsGatewayContentStore()
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
// 0.8.61 — Explicit Bitcoin Anchor Transaction Construction UI.
app.provide('bitcoinAnchorTransactionConstructionCoordinator', bitcoinAnchorTransactionConstructionCoordinator);
// 0.8.62 — Explicit Reviewed Bitcoin Anchor Signing UI.
app.provide('bitcoinAnchorTransactionReviewCoordinator', bitcoinAnchorTransactionReviewCoordinator);
app.provide('bitcoinAnchorReviewedSigningCoordinator', bitcoinAnchorReviewedSigningCoordinator);
// 0.8.63 — Explicit Signed PSBT Verification & Transaction Finalization UI.
app.provide('bitcoinAnchorSignedPsbtFinalizationCoordinator', bitcoinAnchorSignedPsbtFinalizationCoordinator);
// 0.8.64 — Explicit Bitcoin Anchor Broadcast UI.
app.provide('bitcoinAnchorBroadcastCoordinator', bitcoinAnchorBroadcastCoordinator);
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
// 0.8.33 — Local Snapshot Content Availability & Integrity UX.
app.provide('localSnapshotContentAvailabilityUseCase', localSnapshotContentAvailabilityUseCase);
app.provide('snapshotContentMaterializationCoordinator', snapshotContentMaterializationCoordinator);
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
// PEER AND DECENTRALIZED (ARWEAVE/NOSTR) MATERIAL SOURCES, AND DECENTRALIZED
// LEAD RESOLUTION, STAY DELIBERATELY UNWIRED HERE — the same "local first,
// everything else a separate, later milestone" restraint 0.9.22 itself
// already held before 0.9.23/0.9.33 through 0.9.36 built the rest. Wiring
// `PeerWorldEncounterMaterialSource`, the Arweave-backed `.decentralized`
// slot, and a live `DecentralizedWorldDiscoveryLeadRegistry` fed by real
// Nostr queries is a materially larger, network-facing composition decision
// (relay/gateway configuration, the same kind of choice `peer/RendezvousConfig.js`
// already isolates) — left for its own future, unscheduled wiring milestone
// rather than folded into this one. A `local`-origin selection (anything
// this replica published itself) already exercises the full loading →
// identity-verification → signature-verification chain end to end; a
// peer/decentralized-origin selection still resolves to `UNAVAILABLE`/
// `UNVERIFIABLE`, exactly as it always has.
const worldEncounterMaterialSources = Object.freeze({
    local: new LocalWorldEncounterMaterialSource(new LocalStorageProvider())
});
const { verifier: worldEncounterMaterialVerifier } = composeWorldEncounterMaterialVerifier();
app.provide('worldEncounterMaterialSources', worldEncounterMaterialSources);
app.provide('worldEncounterMaterialVerifier', worldEncounterMaterialVerifier);

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

app.use(router);
app.mount('#app');
