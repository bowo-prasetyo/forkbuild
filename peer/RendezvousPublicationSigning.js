import {
    getRendezvousAnswerFetchSigningDescriptor,
    getRendezvousAnswerSigningDescriptor,
    getRendezvousPublicationSigningDescriptor,
    getRendezvousRemovalSigningDescriptor
} from '../core/RendezvousPublicationEnvelope.js';

// The reference rendezvous server (server/rendezvous-worker/) now refuses
// unsigned publications and removals, so on a real network an unsigned
// publication fails with a message asking the user to unlock their
// identity. peer/LocalRendezvousNetwork.js still accepts them.

// 0.2.66 — the ONE place a peer/RendezvousPublication.js gains a real
// Ed25519 signature before it ever reaches a peer/RendezvousTransport.js.
// Exactly the same shape as application/presence/PresenceSigning.js's own
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

// The proof a rendezvous REMOVE carries: `{ identityId, signature }`, the
// signed-in identity's signature over withdrawing `publicationId`, or null
// when this device cannot sign for `identityId` (not signed in, locked, or
// a different identity). Without it a server refuses the REMOVE and the
// publication simply expires.
export function signRendezvousRemoval(publicationId, identityId, identityProvider) {
    if (!identityProvider
        || typeof identityProvider.signCanonical !== 'function'
        || typeof identityProvider.getSigningIdentity !== 'function') {
        return null;
    }
    try {
        if (identityProvider.getSigningIdentity().id !== identityId) {
            return null;
        }
        const signature = identityProvider.signCanonical(getRendezvousRemovalSigningDescriptor({ identityId, publicationId }));
        return { identityId, signature: signature.toJSON() };
    } catch {
        return null;
    }
}

// The signed-in identity's id, or null when it cannot sign right now (no
// provider, signed out, or locked).
export function signingIdentityId(identityProvider) {
    if (!identityProvider
        || typeof identityProvider.signCanonical !== 'function'
        || typeof identityProvider.getSigningIdentity !== 'function') {
        return null;
    }
    try {
        return identityProvider.getSigningIdentity().id;
    } catch {
        return null;
    }
}

// Signs the WebRTC answer this device leaves in the rendezvous mailbox for
// `identityId`'s publication `publicationId`. Returns
// { answererId, signature } or null when this device cannot sign.
export function signRendezvousAnswer({ identityId, publicationId, answer }, identityProvider) {
    const answererId = signingIdentityId(identityProvider);
    if (!answererId) {
        return null;
    }
    try {
        const signature = identityProvider.signCanonical(getRendezvousAnswerSigningDescriptor({ answererId, identityId, publicationId, answer }));
        return { answererId, signature: signature.toJSON() };
    } catch {
        return null;
    }
}

// Signs this device's request to collect the answer to its own publication.
// Returns { identityId, signature } or null, like signRendezvousRemoval().
export function signRendezvousAnswerFetch(publicationId, identityId, identityProvider) {
    if (signingIdentityId(identityProvider) !== identityId) {
        return null;
    }
    try {
        const signature = identityProvider.signCanonical(getRendezvousAnswerFetchSigningDescriptor({ identityId, publicationId }));
        return { identityId, signature: signature.toJSON() };
    } catch {
        return null;
    }
}
