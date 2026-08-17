// 0.2.37 — base class every presence-broadcast adapter extends.
// Answers "how do I tell OTHER replicas what my local avatar is doing
// right now, and how do I hear what theirs are doing?" — deliberately
// the narrowest possible interface: advertise a presence, and
// subscribe to receive one. Mirrors discovery/DiscoveryProvider.js's
// shape exactly (a base class of throwing stubs, one concrete Local*
// implementation today, room for a real P2P/WebRTC/relay
// implementation later without anything above this interface
// changing).
//
// Deliberately NOT modeled after StorageProvider — presence is never
// persisted (see core/AvatarPresence.js's own header), so there is no
// save()/load() here, only a live publish/subscribe pair.
export class AvatarPresenceBroadcastProvider {
    // advertisement: the plain, JSON-shaped object
    // core/AvatarPresenceAdvertisement.js's toAvatarPresenceAdvertisement()
    // produces. Fire-and-forget — a broadcast provider never
    // acknowledges, retries, or guarantees delivery; a receiver's own
    // sequence-based ingestion (core/PresenceIngestion.js) is what
    // stays correct regardless of whether any given advertisement
    // arrives at all.
    advertise(advertisement) {
        throw new Error('AvatarPresenceBroadcastProvider.advertise() must be implemented by a subclass');
    }

    // Returns an unsubscribe function, the same shape every EventBus
    // subscription in this codebase already returns.
    onAdvertisement(callback) {
        throw new Error('AvatarPresenceBroadcastProvider.onAdvertisement() must be implemented by a subclass');
    }

    dispose() {
        throw new Error('AvatarPresenceBroadcastProvider.dispose() must be implemented by a subclass');
    }
}
