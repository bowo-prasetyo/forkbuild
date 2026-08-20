import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { resolveDirectSocialIdentity } from './SocialIdentityResolver.js';

// 0.2.86 — Multi-Device Voice Ringing.
//
// "Given a live ConnectedPeerRegistry and a way to resolve a connection's
// social identity, which currently-live connections speak for
// `identityId`?" — this is application/PeerPresenceUseCase.js#_liveConnectedPeers()'s
// own query (0.2.85), extracted verbatim into its own small, pure,
// dependency-free function so a SECOND caller (application/VoiceUseCase.js,
// this milestone) can reuse it without either duplicating the filter logic
// itself or taking a dependency on PeerPresenceUseCase — a class carrying
// a pile of chat/conversation/read-tracking concerns voice has no business
// depending on. See docs/Roadmap.md, 0.2.86, "How does a caller currently
// discover the concrete authenticated connections belonging to a social
// identity?" and docs/Principles.md, "A Query Two Use Cases Both Need Is A
// Shared Function, Never A New Dependency Between Them."
//
// A `.filter()`, never a `.find()`, on purpose — Alice's Phone and Laptop
// can both be live at once, and every caller of this function (identity
// presence, identity-targeted call fan-out) genuinely needs the FULL set,
// not merely the first match. `resolveSocialIdentity` is called fresh on
// every invocation and never cached here — this function holds no state
// of its own at all.
export function findLiveConnectedPeers(connectedPeerRegistry, resolveSocialIdentity, identityId) {
    return connectedPeerRegistry.list().filter((peer) => {
        if (!peer.remoteIdentity || peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            return false;
        }
        const resolved = resolveSocialIdentity(peer) || resolveDirectSocialIdentity(peer);
        return resolved.identityId === identityId;
    });
}
