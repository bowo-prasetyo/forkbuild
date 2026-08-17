// 0.2.38 — the ONE meaningful policy knob for presence trust: is an
// UNSIGNED claim tolerated at all? Everything else
// `application/PresenceTrustBoundary.js` enforces — rejecting a
// wrong-authority claim, a replayed claim, an equal-sequence-but-
// different-content claim — is never a matter of policy; see
// docs/Principles.md, "Presence Trust Has One Real Policy Axis."
//
// Mirrors `identity/TrustPolicy.js`'s permissive/hardened shape
// (0.2.19) deliberately, but stays its own, narrower class:
// TrustPolicy's other options (`requireSignedRoot`,
// `requireAuthorizedPlacements`, `pinnedAuthorityIdentity`, ...)
// describe a completely different domain — spatial index authorities —
// that has nothing to say about a live avatar's own presence stream.
export class PresenceTrustPolicy {
    constructor({ requireSignedPresence = false } = {}) {
        this._requireSignedPresence = requireSignedPresence;
    }

    get requireSignedPresence() { return this._requireSignedPresence; }

    toJSON() {
        return { requireSignedPresence: this._requireSignedPresence };
    }

    // The default: exactly 0.2.37's own behavior. Any structurally
    // valid presence claim is tolerated whether or not it is signed —
    // every existing local/BroadcastChannel deployment keeps working
    // completely unchanged. Identity binding, replay protection, and
    // equivocation detection all still apply regardless — this only
    // controls whether the absence of a signature, by itself, is
    // disqualifying.
    static permissive() {
        return new PresenceTrustPolicy({ requireSignedPresence: false });
    }

    // The target configuration for an operator who wants to stop
    // accepting anonymous presence claims entirely — every advertisement
    // must carry a valid signature or it is rejected outright, the
    // same way `identity/TrustPolicy.hardened()` stops tolerating
    // unsigned roots/placements.
    static hardened() {
        return new PresenceTrustPolicy({ requireSignedPresence: true });
    }
}
