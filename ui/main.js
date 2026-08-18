import { createApp } from 'vue';
import App from './App.js';
import { router } from './router/index.js';
import { CreateIdentityProviderUseCase } from '../application/CreateIdentityProviderUseCase.js';
import { IdentityUseCase } from '../application/IdentityUseCase.js';
import { PeerSessionManager } from '../application/PeerSessionManager.js';
import { CreatePeerRelationshipUseCase } from '../application/CreatePeerRelationshipUseCase.js';
import { CreateFriendRelationshipUseCase } from '../application/CreateFriendRelationshipUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

const identityProvider = new CreateIdentityProviderUseCase().execute();
const identityUseCase = new IdentityUseCase(identityProvider);
// 0.2.55 — one app-wide PeerSessionManager, provided the same way
// previewService/identityUseCase already are, so its registry of live
// peers survives navigating away from /peers and back. Shares the SAME
// identityProvider the rest of the app authenticates through — a peer
// connection this device authenticates always proves possession of
// whichever identity is currently signed in here, never a second,
// separate one.
const peerSessionManager = new PeerSessionManager({ identityProvider });
// 0.2.56 — one app-wide PeerRelationshipUseCase, same reasoning: a
// remembered peer must survive navigating away from /peers, and must
// survive a reload, which peerSessionManager's own registry never does
// on purpose (see application/ConnectedPeerRegistry.js's own header).
const peerRelationshipUseCase = new CreatePeerRelationshipUseCase().execute(identityProvider);
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
const friendRelationshipUseCase = new CreateFriendRelationshipUseCase().execute(identityProvider, {
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry
});

const app = createApp(App);
app.provide('identityUseCase', identityUseCase);
app.provide('peerSessionManager', peerSessionManager);
app.provide('peerRelationshipUseCase', peerRelationshipUseCase);
app.provide('friendRelationshipUseCase', friendRelationshipUseCase);
app.use(router);
app.mount('#app');
