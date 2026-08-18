import { PresenceVisibility, isValidPresenceVisibility } from './PresenceVisibility.js';

// 0.2.54 — the PROFILE-SPECIFIC counterpart to core/PresenceVisibilityPolicy.js,
// deliberately a SEPARATE class, never the same instance or the same
// class reused for a second purpose. This is the direct answer to the
// design doc's own warning: "don't automatically make 'everyone allowed
// to see my presence' mean 'everyone allowed to see my profile' — those
// are different pieces of information." `Presence: PUBLIC, Profile: FRIENDS`
// (broadcast that I'm online, but only friends see what I look like) or
// the reverse (`Presence: FRIENDS, Profile: PUBLIC`) are both real,
// independently configurable facts, not one policy silently wearing two
// hats — see docs/Principles.md, "Profile Visibility Is Never Presence
// Visibility" (0.2.54).
//
// 0.2.58 — Friend-Aware Privacy & Social Visibility. 0.2.54 shipped this
// class deliberately minimal ("no FRIENDS/LOCAL/HIDDEN tier yet... there
// is still no live profile-sharing configuration surface anywhere in the
// running app for a richer policy to hang off of"). That surface now
// exists (application/AvatarProfileVisibilityUseCase.js,
// ui/views/AvatarSettingsView.js's own "Profile Visibility" section), so
// this class grows the EXACT same PUBLIC/FRIENDS/LOCAL/HIDDEN vocabulary
// core/PresenceVisibility.js already defined, reusing that same closed
// enum directly rather than inventing a second, parallel one — "who may
// see my presence" and "who may see my appearance" are different
// QUESTIONS, but they share the same four possible ANSWERS. Still its
// own class, still its own storage, still its own shouldAdvertise()/
// shouldAdvertiseToPeer() consulted independently of presence's own —
// nothing about the SEPARATION 0.2.54 established changes, only how much
// this class itself can now express.
//
// Consulted the exact same way `PresenceVisibilityPolicy#shouldAdvertiseToPeer()`
// is — once per AUTHENTICATED peer, inside `presence/
// PeerAvatarPresenceBroadcastProvider.js#advertise()` when that same
// class is reused (see `AvatarProfileSyncService.js`'s own precedent for
// reusing `PeerAvatarPresenceBroadcastProvider` directly for profile's
// channel rather than duplicating a presence-flavored-in-name-only
// sibling class) as the profile transport, via its injected
// `getVisibilityPolicy` — never inside `AvatarProfileSyncService` or
// `WorldNavigationSession`, and never by adding a recipient/visibility
// field to `core/AvatarProfileAdvertisement.js`'s own wire shape. The
// coarse, parameter-free `shouldAdvertise()` gate is consulted by
// `WorldNavigationSession._publishLocalAvatarProfile()` — its OWN gate
// as of 0.2.58, independent of `PresenceVisibilityPolicy`'s own (see
// docs/Principles.md, "Profile Gets Its Own Publication Gate,
// Superseding The Shared One," 0.2.58).
export class AvatarProfileVisibilityPolicy {
    constructor({ visibility = PresenceVisibility.PUBLIC, authorizedPeerIdentities = [] } = {}) {
        if (!isValidPresenceVisibility(visibility)) {
            throw new Error(`AvatarProfileVisibilityPolicy: unknown visibility "${visibility}"`);
        }
        this._visibility = visibility;
        this._authorizedPeerIdentities = AvatarProfileVisibilityPolicy._normalizeIdentities(authorizedPeerIdentities);
    }

    get visibility() { return this._visibility; }
    get authorizedPeerIdentities() { return [...this._authorizedPeerIdentities]; }

    // The coarse gate — "should a profile advertisement even be handed
    // to a transport at all" — consulted BEFORE any per-peer question,
    // exactly like PresenceVisibilityPolicy's own. See that class's own
    // shouldAdvertise() header for the full `context.hasFriend`
    // reasoning (0.2.58) — identical here: omitting context defaults to
    // `hasFriend: false`, the exact pre-0.2.58 behavior.
    shouldAdvertise({ hasFriend = false } = {}) {
        switch (this._visibility) {
            case PresenceVisibility.HIDDEN:
                return false;
            case PresenceVisibility.FRIENDS:
                return this._authorizedPeerIdentities.length > 0 || hasFriend === true;
            case PresenceVisibility.PUBLIC:
            case PresenceVisibility.LOCAL:
            default:
                return true;
        }
    }

    // peerIdentityId: the peer's PROVEN `peer/PeerIdentity.js#identityId`
    // (a did:key from a real handshake).
    //
    // `context.isFriend` — see core/PresenceVisibilityPolicy.js's own
    // `shouldAdvertiseToPeer()` header for the full reasoning (0.2.58):
    // a plain boolean fact the CALLER computes and hands in, never
    // looked up by this class itself. FRIENDS here means exactly what
    // it means for presence — real mutual `FriendshipState.FRIEND` OR
    // manual `authorizedPeerIdentities` membership, additively.
    //
    //   PUBLIC  — every eligible authenticated peer, no exceptions —
    //             0.2.54's own original default rule, unchanged.
    //   FRIENDS — `context.isFriend === true` OR listed in
    //             `authorizedPeerIdentities`.
    //   LOCAL   — never sent to a peer connection, mirroring presence's
    //             own LOCAL semantics exactly.
    //   HIDDEN  — never sent.
    shouldAdvertiseToPeer(peerIdentityId, { isFriend = false } = {}) {
        switch (this._visibility) {
            case PresenceVisibility.HIDDEN:
                return false;
            case PresenceVisibility.LOCAL:
                return false;
            case PresenceVisibility.FRIENDS:
                return typeof peerIdentityId === 'string'
                    && peerIdentityId.length > 0
                    && (isFriend === true || this._authorizedPeerIdentities.includes(peerIdentityId));
            case PresenceVisibility.PUBLIC:
            default:
                return true;
        }
    }

    withVisibility(visibility) {
        return new AvatarProfileVisibilityPolicy({ visibility, authorizedPeerIdentities: this._authorizedPeerIdentities });
    }

    withAuthorizedPeerIdentities(authorizedPeerIdentities) {
        return new AvatarProfileVisibilityPolicy({ visibility: this._visibility, authorizedPeerIdentities });
    }

    toJSON() {
        return {
            visibility: this._visibility,
            authorizedPeerIdentities: [...this._authorizedPeerIdentities]
        };
    }

    // 0.2.54's own original default: PUBLIC, nobody excluded — every
    // AUTHENTICATED peer is eligible. Unchanged by 0.2.58: a caller
    // that never touches profile visibility configuration keeps
    // exactly the permissive behavior it always had.
    static default() {
        return new AvatarProfileVisibilityPolicy();
    }

    static fromJSON(json) {
        if (!json) {
            return AvatarProfileVisibilityPolicy.default();
        }
        return new AvatarProfileVisibilityPolicy({
            visibility: json.visibility,
            authorizedPeerIdentities: json.authorizedPeerIdentities || []
        });
    }

    // Identical normalization to PresenceVisibilityPolicy's own — see
    // that class's own comment for why this stays a plain, simple
    // string allow-list rather than a validated schema.
    static _normalizeIdentities(identities) {
        if (!Array.isArray(identities)) {
            return [];
        }
        const seen = new Set();
        for (const raw of identities) {
            if (typeof raw !== 'string') continue;
            const trimmed = raw.trim();
            if (trimmed.length === 0) continue;
            seen.add(trimmed);
        }
        return Array.from(seen).sort();
    }
}
