import { getRendezvousPublicationSigningDescriptor } from '../core/RendezvousPublicationEnvelope.js';

// 0.2.66 — the ONE place a peer/RendezvousPublication.js gains a real
// Ed25519 signature before it ever reaches a peer/RendezvousTransport.js.
// Exactly the same shape as application/PresenceSigning.js's own
// signAvatarPresenceAdvertisement(): optional by construction (an
// identityProvider that cannot sign, or isn't currently authenticated,
// simply returns the publication UNCHANGED — signing a publication is
// never required for publish() to work, matching core/Signature.js's own
// RENDEZVOUS_PUBLICATION header), and never a mutation — see
// peer/RendezvousPublication.js#withSignature, the only method this ever
// calls.
//
// One check beyond PresenceSigning's own: this device can only ever sign
// a publication that claims to BE the identity currently authenticated —
// signCanonical() has no opinion about WHOSE publication it's being asked
// to sign, so this is the one place that refuses to let a device
// accidentally (or maliciously) co-sign someone ELSE'S identityHint. A
// mismatch degrades to unsigned, exactly like every other failure here,
// rather than throwing — publishing a rendezvous hint for someone else's
// identity was always allowed (see peer/RendezvousTransport.js's own
// header: nobody is ever authenticated to PUBLISH), this simply never
// dresses that up with a signature that would look like an endorsement.
export function signRendezvousPublication(publication, identityProvider) {
    if (!identityProvider
        || typeof identityProvider.signCanonical !== 'function'
        || typeof identityProvider.getSigningIdentity !== 'function') {
        return publication;
    }
    let localIdentity;
    try {
        localIdentity = identityProvider.getSigningIdentity();
    } catch {
        // No user logged in / no signing key available yet — degrade to
        // an unsigned publication rather than breaking publish() entirely.
        return publication;
    }
    if (localIdentity.id !== publication.identityHint) {
        return publication;
    }
    let signature;
    try {
        signature = identityProvider.signCanonical(getRendezvousPublicationSigningDescriptor(publication));
    } catch {
        return publication;
    }
    return publication.withSignature(signature.toJSON());
}
