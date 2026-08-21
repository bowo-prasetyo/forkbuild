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
app.use(router);
app.mount('#app');
