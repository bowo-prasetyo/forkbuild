import { PeerLifecycleState } from '../../peer/PeerLifecycleState.js';
import { resolveDirectSocialIdentity } from '../identity/SocialIdentityResolver.js';

// 0.2.86 — Multi-Device Voice Ringing.
//
// "Given a live ConnectedPeerRegistry and a way to resolve a connection's
// social identity, which currently-live connections speak for
// `identityId`?" — this is application/presence/PeerPresenceUseCase.js#_liveConnectedPeers()'s
// own query (0.2.85), extracted verbatim into its own small, pure,
// dependency-free function so a SECOND caller (application/chat/VoiceUseCase.js,
// this milestone) can reuse it without either duplicating the filter logic
// itself or taking a dependency on PeerPresenceUseCase — a class carrying
// a pile of chat/conversation/read-tracking concerns voice has no business
// depending on. See docs/Roadmap.md, 0.2.86, "How does a caller currently
// discover the concrete authenticated connections belonging to a social
// identity?"
//
// A `.filter()`, never a `.find()`, on purpose — Alice's Phone and Laptop
// can both be live at once, and every caller of this function (identity
// presence, identity-targeted call fan-out) genuinely needs the FULL set,
// not merely the first match. `resolveSocialIdentity` is called fresh on
// every invocation and never cached here — this function holds no state
// of its own at all.
export function findLiveConnectedPeers(connectedPeerRegistry, resolveSocialIdentity, identityId) {
    return findLiveConnectedDevices(connectedPeerRegistry, resolveSocialIdentity, identityId).map(({ peer }) => peer);
}

// The same query, keeping each match's resolved social identity
// alongside it — `{ peer, resolved }` — so a caller that also needs
// `resolved.deviceIdentityId` (application/presence/PeerPresenceUseCase.js#getSummary())
// never has to resolve the same connection a second time.
export function findLiveConnectedDevices(connectedPeerRegistry, resolveSocialIdentity, identityId) {
    const matches = [];
    for (const peer of connectedPeerRegistry.list()) {
        if (!peer.remoteIdentity || peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            continue;
        }
        const resolved = resolveSocialIdentity(peer) || resolveDirectSocialIdentity(peer);
        if (resolved.identityId === identityId) {
            matches.push({ peer, resolved });
        }
    }
    return matches;
}
