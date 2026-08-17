import { getAvatarPresenceSigningDescriptor } from '../core/AvatarPresenceAdvertisement.js';

// 0.2.38 — the ONE place a local advertisement gains a real Ed25519
// signature before it ever reaches a transport. Deliberately NOT
// inside core/AvatarPresenceAdvertisement.js itself (a private
// signing key must never be reachable from core/ — see
// identity/LocalIdentityProvider.js, the only thing that ever touches
// one) and NOT a mutation of the advertisement that already exists —
// a signed advertisement is a brand NEW plain object, exactly what
// toAvatarPresenceAdvertisement() already produced, plus one extra
// `signature` field layered on top.
//
// Optional by construction: an identityProvider that cannot sign
// (missing, or lacking signCanonical()/getSigningIdentity() —
// LocalIdentityProvider is the only one that currently has both)
// simply returns the advertisement UNCHANGED. This is what keeps
// presence signing "optional" at the wire level, per the design doc's
// own instruction not to make signatures mandatory — see
// core/PresenceTrustPolicy.js for how a RECEIVER decides whether to
// tolerate that.
export function signAvatarPresenceAdvertisement(advertisement, identityProvider) {
    if (!identityProvider
        || typeof identityProvider.signCanonical !== 'function'
        || typeof identityProvider.getSigningIdentity !== 'function') {
        return advertisement;
    }
    let signature;
    try {
        signature = identityProvider.signCanonical(getAvatarPresenceSigningDescriptor(advertisement));
    } catch {
        // No user logged in / no signing key available yet — degrade
        // to an unsigned advertisement rather than breaking presence
        // publishing entirely. Mirrors publisher/LocalPublisherProvider.js's
        // own `canSign` guard, just as a catch instead of a
        // precondition, since this helper is meant to be safe to call
        // unconditionally.
        return advertisement;
    }
    return { ...advertisement, signature: signature.toJSON() };
}
