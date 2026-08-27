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
import { CreateSnapshotPlacementResolutionCoordinatorUseCase } from '../application/CreateSnapshotPlacementResolutionCoordinatorUseCase.js';
import { CreateIpfsSnapshotPlacementViewUseCase } from '../application/CreateIpfsSnapshotPlacementViewUseCase.js';
import { CreateLocalSnapshotPlacementViewUseCase } from '../application/CreateLocalSnapshotPlacementViewUseCase.js';
import { CreateSnapshotPlacementViewRegistryUseCase } from '../application/CreateSnapshotPlacementViewRegistryUseCase.js';
import { IpfsContentStore } from '../content/IpfsContentStore.js';
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
// and a real content/IpfsContentStore.js for `ipfs` placements. The
// latter talks to a Kubo node at its own default `http://127.0.0.1:5001`
// — almost certainly unreachable from inside a browser with no local
// IPFS daemon running, exactly the situation anchoring/
// BitcoinOpReturnProofVerifier.js's own real, live wiring above is
// already in for a person with no Bitcoin node of their own. Registering
// it anyway, rather than leaving `ipfs` unregistered, is the more honest
// choice: a placement that really did claim IPFS storage gets an honest
// CONTENT_UNAVAILABLE from a real, consulted store when nothing answers,
// never the different claim STORE_UNAVAILABLE would make ("this replica
// isn't even configured to try").
const {
    coordinator: publicationSnapshotPlacementResolutionCoordinator
} = new CreateSnapshotPlacementResolutionCoordinatorUseCase().execute({
    placementCatalog: publicationSnapshotPlacementCatalog,
    stores: [publicationContentStore, new IpfsContentStore()]
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
// `stores` registers the SAME two content/ContentStore.js instances
// (`publicationContentStore` for `local`, a real content/IpfsContentStore
// .js for `ipfs`) the RESOLUTION wiring above already registers — so a
// placement created here is, from the moment of its own creation,
// immediately resolvable through the identical stores, never a
// coincidence of two independently configured registries agreeing.
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
app.use(router);
app.mount('#app');
