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
// allow-list of strings — not a friend-request system, not mutual, not
// discovered. See docs/Principles.md and docs/Protocol.md for the
// honest limitation this originally implied: `presence/
// LocalAvatarPresenceBroadcastProvider.js`, still today's DEFAULT
// transport, is a same-origin BROADCAST with no per-recipient
// addressing, so FRIENDS over it still only controls WHETHER this
// replica advertises at all (empty list = nothing to show anyone =
// behaves like HIDDEN), never WHO physically receives the bytes.
//
// 0.2.53 correction to this class's own original prediction: this
// list was expected to become a real per-recipient guarantee
// automatically, with no change here, "the moment a point-to-point
// transport exists to actually address advertise() calls at specific
// peers" (presence/PeerAvatarPresenceBroadcastProvider.js, 0.2.53).
// That transport now exists — but what it can actually PROVE about a
// peer is a `peer/PeerIdentity.js#identityId` (a did:key, from a real
// 0.2.49 signed handshake), never an `AvatarProfile#ownerIdentity`
// username — see docs/Principles.md, "A Peer Connection Authenticates
// A Key, Not An Account" (0.2.49), which this class simply never had a
// reason to reconcile against until now. So shouldAdvertiseToPeer()
// below compares an entry against a peer's PROVEN identityId, not
// against an ownerIdentity/username — an entry here must be the
// did:key you want to authorize (found on `peer/PeerIdentity.js#identityId`
// once connected to someone, e.g. via a "Connected Peers" surface),
// not their display name. Nothing about the STORED shape changed — it
// is, and remains, a plain array of strings — only which string a
// person needs to type in to make FRIENDS mean something over a real
// peer connection.
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

    // 0.2.53 — the PEER-SCOPED counterpart to shouldAdvertise() above,
    // consulted by presence/PeerAvatarPresenceBroadcastProvider.js
    // ONCE PER AUTHENTICATED PEER CONNECTION, never by the presence
    // core itself (see docs/Principles.md, "Peer Selection Is A
    // Transport Concern, Never A Presence-Core Concern") — this is
    // deliberately the ONLY new method this milestone adds here,
    // because it is the ONLY new question a real point-to-point
    // transport raises: not "should I advertise at all" (still
    // shouldAdvertise(), still consulted first, still exactly what it
    // was in 0.2.40) but "should THIS SPECIFIC peer receive it."
    //
    //   PUBLIC  — every eligible authenticated peer, no exceptions.
    //             "Eligible" is the transport's own job (an
    //             AUTHENTICATED peer only) — this method never
    //             re-derives that.
    //   FRIENDS — only a peer whose PROVEN identityId (peer/
    //             PeerIdentity.js#identityId, from a real 0.2.49
    //             handshake — never an unauthenticated hint) appears
    //             in authorizedPeerIdentities. Finally a REAL
    //             per-recipient decision, not merely "is the list
    //             non-empty" — see core/PresenceVisibility.js's own
    //             header, which named this exact limitation in 0.2.40
    //             and always expected it to resolve exactly like this
    //             once a point-to-point transport existed.
    //   LOCAL   — never sent to a peer connection, regardless of who
    //             the peer is. A real, authenticated peer connection
    //             — even a same-machine `LocalPeerConnectionProvider`
    //             one — is the actual network transport this codebase
    //             now has; LOCAL's own documented meaning ("confined
    //             to the local, same-origin transport scope") finally
    //             has something to assert now that a second, genuinely
    //             non-local-scoped transport exists. Deliberately NOT
    //             a new tier and NOT a new configurable scope — see
    //             docs/Roadmap.md, 0.2.53: "don't invent additional
    //             semantics yet."
    //   HIDDEN  — never sent, exactly like shouldAdvertise().
    //
    // Pure and side-effect-free, exactly like shouldAdvertise() — this
    // answers a VISIBILITY question only. Whether a peer's claim, once
    // it arrives, is actually TRUSTED is a completely separate
    // question application/PresenceTrustBoundary.js alone answers on
    // the receiving side — see docs/Principles.md, "Visibility Happens
    // Before Broadcasting, Never After" (0.2.40): visibility is the
    // SENDER asking "should I even send this," trust is the RECEIVER
    // asking "should I believe what arrived," and a PUBLIC or
    // FRIENDS-authorized send here can still turn out to be malicious
    // or malformed once it reaches the other side's trust boundary.
    shouldAdvertiseToPeer(peerIdentityId) {
        switch (this._visibility) {
            case PresenceVisibility.HIDDEN:
                return false;
            case PresenceVisibility.LOCAL:
                return false;
            case PresenceVisibility.FRIENDS:
                return typeof peerIdentityId === 'string'
                    && peerIdentityId.length > 0
                    && this._authorizedPeerIdentities.includes(peerIdentityId);
            case PresenceVisibility.PUBLIC:
            default:
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
