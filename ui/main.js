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
import { DEFAULT_ICE_SERVERS } from '../peer/IceServerConfig.js';
import { DEFAULT_RENDEZVOUS_URLS } from '../peer/RendezvousConfig.js';
import { CreatePeerRelationshipUseCase } from '../application/CreatePeerRelationshipUseCase.js';
import { PeerReconnectionUseCase } from '../application/PeerReconnectionUseCase.js';
import { FindPeerUseCase } from '../application/FindPeerUseCase.js';
import { CreateFriendRelationshipUseCase } from '../application/CreateFriendRelationshipUseCase.js';
import { CreatePeerBlockUseCase } from '../application/CreatePeerBlockUseCase.js';
import { ChatUseCase } from '../application/ChatUseCase.js';
import { CreateChatOutboxUseCase } from '../application/CreateChatOutboxUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

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
const friendRelationshipUseCase = new CreateFriendRelationshipUseCase().execute(identityProvider, {
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry,
    peerBlockUseCase
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
// use to keep ui/ from importing storage/ directly. The live transcript
// itself (application/LiveConversation.js) is still never persisted —
// only the outbox is.
const chatOutbox = new CreateChatOutboxUseCase().execute(identityProvider);
const chatUseCase = new ChatUseCase(identityProvider, {
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry,
    friendRelationshipUseCase,
    peerBlockUseCase,
    chatOutbox
});

const app = createApp(App);
app.provide('identityUseCase', identityUseCase);
app.provide('peerSessionManager', peerSessionManager);
app.provide('peerRelationshipUseCase', peerRelationshipUseCase);
app.provide('peerReconnectionUseCase', peerReconnectionUseCase);
app.provide('findPeerUseCase', findPeerUseCase);
app.provide('friendRelationshipUseCase', friendRelationshipUseCase);
app.provide('peerBlockUseCase', peerBlockUseCase);
app.provide('chatUseCase', chatUseCase);
// 0.2.59 — Peer-Based Avatar Social Transport. The SAME app-wide bus
// friendRelationshipUseCase already rides, now also provided directly
// so World View can attach presence/profile/interaction to it — see
// application/CreateWorldViewUseCase.js.
app.provide('peerMessageBus', peerMessageBus);
app.use(router);
app.mount('#app');
