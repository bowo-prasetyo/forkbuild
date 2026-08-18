// 0.2.45 — the ONE meaningful policy knob for interaction trust,
// mirroring core/PresenceTrustPolicy.js exactly one layer over: is an
// UNSIGNED interaction claim tolerated at all? Everything else
// application/AvatarInteractionTrustBoundary.js enforces — a
// wrong-authority claim, a replayed/stale claim — is never a matter of
// policy, the same "Presence Trust Has One Real Policy Axis" reasoning
// applied here.
//
// Its own, separate class from PresenceTrustPolicy — not because the
// shape differs (it doesn't), but because a receiver may reasonably
// want a DIFFERENT answer for the two: tolerating unsigned movement
// while requiring signed social gestures (or vice versa) is a
// legitimate, independent choice, and sharing one policy object would
// silently couple two decisions that have nothing to do with each
// other.
export class AvatarInteractionTrustPolicy {
    constructor({ requireSignedInteraction = false } = {}) {
        this._requireSignedInteraction = requireSignedInteraction;
    }

    get requireSignedInteraction() { return this._requireSignedInteraction; }

    toJSON() {
        return { requireSignedInteraction: this._requireSignedInteraction };
    }

    // The default: any structurally valid interaction claim is
    // tolerated whether or not it is signed. Identity binding and
    // replay/staleness protection all still apply regardless — this
    // only controls whether the absence of a signature, by itself, is
    // disqualifying.
    static permissive() {
        return new AvatarInteractionTrustPolicy({ requireSignedInteraction: false });
    }

    // The target configuration for a receiver that wants to stop
    // accepting anonymous social gestures entirely.
    static hardened() {
        return new AvatarInteractionTrustPolicy({ requireSignedInteraction: true });
    }
}
