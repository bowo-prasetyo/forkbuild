// 0.2.54 — the PROFILE-SPECIFIC counterpart to core/PresenceVisibilityPolicy.js,
// deliberately a SEPARATE class, never the same instance or the same
// class reused for a second purpose. This is the direct answer to the
// design doc's own warning: "don't automatically make 'everyone allowed
// to see my presence' mean 'everyone allowed to see my profile' — those
// are different pieces of information." A future user reasonably wants
// `Presence: PUBLIC, Profile: FRIENDS` (broadcast that I'm online, but
// only friends see what I look like) or the reverse
// (`Presence: FRIENDS, Profile: PUBLIC`) to be two independently
// configurable facts, not one policy silently wearing two hats.
//
// Consulted the exact same way `PresenceVisibilityPolicy#shouldAdvertiseToPeer()`
// is — once per AUTHENTICATED peer, inside `presence/
// PeerAvatarPresenceBroadcastProvider.js#advertise()` when that same
// class is reused (see `CreateWorldViewUseCase.js`'s own precedent for
// reusing `LocalAvatarPresenceBroadcastProvider` directly for profile's
// channel rather than duplicating a presence-flavored-in-name-only
// sibling class) as the profile transport, via its injected
// `getVisibilityPolicy` — never inside `AvatarProfileSyncService` or
// `WorldNavigationSession`, and never by adding a recipient/visibility
// field to `core/AvatarProfileAdvertisement.js`'s own wire shape.
//
// Deliberately MINIMAL for 0.2.54, exactly the "explicitly documented
// temporary policy" the design doc asks for rather than pretending
// presence policy controls profile privacy: eligibility here means
// nothing more than "the transport already proved this peer is
// AUTHENTICATED" (that check happens in the transport, before this is
// ever consulted — see docs/Principles.md, "Peer Selection Is A
// Transport Concern, Never A Presence-Core Concern," which applies
// identically to profile). There is no FRIENDS/LOCAL/HIDDEN tier, no
// `authorizedPeerIdentities` list, and no persistence here yet — the
// same posture `application/AvatarProfileTrustBoundary.js` already
// took on the TRUST side in 0.2.41 ("No PresenceTrustPolicy-equivalent
// knob exists for profiles"), now taken on the VISIBILITY side: there
// is still no live profile-sharing configuration surface anywhere in
// the running app for a richer policy to hang off of. A future
// milestone can extend this class the same additive way 0.2.40 first
// gave presence its own visibility tiers, without anything above this
// interface (the `getVisibilityPolicy` injection point) needing to
// change.
export class AvatarProfileVisibilityPolicy {
    // peerIdentityId: the peer's PROVEN `peer/PeerIdentity.js#identityId`
    // (a did:key from a real handshake), passed for forward-compatibility
    // with a future per-peer tier — unused by 0.2.54's own default rule.
    shouldAdvertiseToPeer(peerIdentityId) {
        return true;
    }

    static default() {
        return new AvatarProfileVisibilityPolicy();
    }
}
