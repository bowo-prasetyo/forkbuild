import { getAvatarProfileSigningDescriptor } from '../core/AvatarProfileAdvertisement.js';

// 0.2.41 — the ONE place a local profile advertisement gains a real
// Ed25519 signature before it ever reaches a transport, exactly
// mirroring application/PresenceSigning.js one layer up. Deliberately
// NOT inside core/AvatarProfileAdvertisement.js itself (a private
// signing key must never be reachable from core/) and NOT a mutation
// of the advertisement that already exists — a signed advertisement is
// a brand NEW plain object.
//
// Optional by construction: an identityProvider that cannot sign
// simply returns the advertisement UNCHANGED — this is what keeps
// profile signing "optional" at the wire level, the same posture
// presence signing already established.
export function signAvatarProfileAdvertisement(advertisement, identityProvider) {
    if (!identityProvider
        || typeof identityProvider.signCanonical !== 'function'
        || typeof identityProvider.getSigningIdentity !== 'function') {
        return advertisement;
    }
    let signature;
    try {
        signature = identityProvider.signCanonical(getAvatarProfileSigningDescriptor(advertisement));
    } catch {
        // No user logged in / no signing key available yet — degrade
        // to an unsigned advertisement rather than breaking profile
        // publishing entirely.
        return advertisement;
    }
    return { ...advertisement, signature: signature.toJSON() };
}
