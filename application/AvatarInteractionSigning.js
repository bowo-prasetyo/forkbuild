import { getAvatarInteractionSigningDescriptor } from '../core/AvatarInteractionAdvertisement.js';

// 0.2.45 — the ONE place a local interaction advertisement gains a real
// Ed25519 signature before it ever reaches a transport, exactly
// mirroring application/PresenceSigning.js and
// application/AvatarProfileSigning.js one layer over. Deliberately NOT
// inside core/AvatarInteractionAdvertisement.js itself (a private
// signing key must never be reachable from core/) and NOT a mutation
// of the advertisement that already exists — a signed advertisement is
// a brand NEW plain object.
//
// Optional by construction: an identityProvider that cannot sign
// simply returns the advertisement UNCHANGED — the same posture
// presence/profile signing already established, so a gesture still
// publishes (unsigned) rather than silently failing when nobody is
// logged in able to sign.
export function signAvatarInteractionAdvertisement(advertisement, identityProvider) {
    if (!identityProvider
        || typeof identityProvider.signCanonical !== 'function'
        || typeof identityProvider.getSigningIdentity !== 'function') {
        return advertisement;
    }
    let signature;
    try {
        signature = identityProvider.signCanonical(getAvatarInteractionSigningDescriptor(advertisement));
    } catch {
        // No user logged in / no signing key available yet — degrade
        // to an unsigned advertisement rather than breaking gesture
        // publishing entirely.
        return advertisement;
    }
    return { ...advertisement, signature: signature.toJSON() };
}
