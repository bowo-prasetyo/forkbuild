import { PresenceVisibility, isValidPresenceVisibility } from './PresenceVisibility.js';

// 0.2.40 — the persistent-configuration half of a THIRD split, drawn
// alongside the one core/AvatarProfile.js already established:
//
//   AvatarProfile             = what I look like        (persistent)
//   AvatarPresence             = where I am               (ephemeral)
//   PresenceVisibilityPolicy  = who may receive my presence (persistent)
//
// Deliberately NOT a field on AvatarPresence (ephemeral, published
// many times a second) or on AvatarProfile (appearance/identity,
// unrelated) or on WorldPlacement (avatars and documents remain
// fundamentally different entities — see docs/Principles.md, "Avatars
// Are Never Document Selection," 0.2.39). A visibility PREFERENCE is
// exactly as stable as a display name or a chosen template — set
// rarely, deliberately, and read on every publish — so it gets its
// own persisted entity, the same "stable per-owner configuration"
// shape AvatarProfile already uses, rather than being smuggled into
// either of the other two.
//
// `authorizedPeerIdentities` is deliberately a PLAIN, manually-entered
// allow-list of ownerIdentity strings — not a friend-request system,
// not mutual, not discovered. See docs/Principles.md and
// docs/Protocol.md for the honest limitation this implies: today's
// only transport (`presence/LocalAvatarPresenceBroadcastProvider.js`)
// is a same-origin BROADCAST with no per-recipient addressing, so
// FRIENDS cannot yet provide real confidentiality — configuring it
// controls WHETHER this replica advertises at all (empty list =
// nothing to show anyone = behaves like HIDDEN), not WHO physically
// receives the bytes. That becomes a stronger guarantee automatically,
// with no change to this class, the moment a point-to-point transport
// exists to actually address `advertise()` calls at specific peers.
export class PresenceVisibilityPolicy {
    constructor({ visibility = PresenceVisibility.PUBLIC, authorizedPeerIdentities = [] } = {}) {
        if (!isValidPresenceVisibility(visibility)) {
            throw new Error(`PresenceVisibilityPolicy: unknown visibility "${visibility}"`);
        }
        this._visibility = visibility;
        this._authorizedPeerIdentities = PresenceVisibilityPolicy._normalizeIdentities(authorizedPeerIdentities);
    }

    get visibility() { return this._visibility; }
    get authorizedPeerIdentities() { return [...this._authorizedPeerIdentities]; }

    // The ONE decision this class exists to make, consulted at the
    // SENDER before PresenceSyncService.publish() is ever called — see
    // docs/Principles.md, "Visibility Happens Before Broadcasting,
    // Never After." Pure and parameter-free: everything it needs is
    // already `this`.
    shouldAdvertise() {
        switch (this._visibility) {
            case PresenceVisibility.HIDDEN:
                return false;
            case PresenceVisibility.FRIENDS:
                return this._authorizedPeerIdentities.length > 0;
            case PresenceVisibility.PUBLIC:
            case PresenceVisibility.LOCAL:
            default:
                // PUBLIC and LOCAL are OBSERVATIONALLY IDENTICAL today
                // — the only transport that exists is already
                // same-origin/local-scoped. The distinction is
                // deliberately modeled ahead of the mechanism: LOCAL
                // means "never advertise beyond this scope even if a
                // wider-reach transport becomes available later,"
                // which has nothing to assert yet because no such
                // transport exists — see docs/Protocol.md.
                return true;
        }
    }

    withVisibility(visibility) {
        return new PresenceVisibilityPolicy({ visibility, authorizedPeerIdentities: this._authorizedPeerIdentities });
    }

    withAuthorizedPeerIdentities(authorizedPeerIdentities) {
        return new PresenceVisibilityPolicy({ visibility: this._visibility, authorizedPeerIdentities });
    }

    toJSON() {
        return {
            visibility: this._visibility,
            authorizedPeerIdentities: [...this._authorizedPeerIdentities]
        };
    }

    static default() {
        return new PresenceVisibilityPolicy();
    }

    static fromJSON(json) {
        if (!json) {
            return PresenceVisibilityPolicy.default();
        }
        return new PresenceVisibilityPolicy({
            visibility: json.visibility,
            authorizedPeerIdentities: json.authorizedPeerIdentities || []
        });
    }

    // Trimmed, deduped, blank-filtered, deterministically sorted — the
    // same "never persist garbage a human didn't actually intend"
    // discipline core/AvatarAppearanceValidator.js applies to
    // appearance fields, kept intentionally simple here because this
    // is a plain string allow-list, not a validated schema.
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
