import { SignatureType } from './Signature.js';

// 0.2.66 — the canonical signing envelope an OPTIONAL peer/
// RendezvousPublication.js signature covers. Exactly the same shape
// discipline as core/AvatarPresenceAdvertisement.js's own
// getAvatarPresenceSigningDescriptor() and core/PeerAuthenticationEnvelope.js's
// getPeerAuthenticationSigningDescriptor(): a plain, JSON-shaped
// descriptor, never a mutation of the object it describes, reconstructed
// identically by signer and verifier alike.
//
// `id` is `identityHint` — the identity this signature is ABOUT, i.e. who
// is claiming to be reachable, matching every other SignatureType's own
// "id = the thing this signature is about" convention. `revision` is
// `publicationId` — a fresh, unique value every single publish() (see
// peer/RendezvousPublication.js's own header on why a publication is
// never longer-lived or more permanent than one PUBLISH), which is what
// makes two honestly-produced publications for the SAME identity, even
// with an identical endpoint, still never hash to the same canonical
// bytes — there is no reuse/replay concern here the way
// peer/PeerAuthenticationEnvelope.js's own `challenge` field exists to
// prevent, but the same discipline (a signature scoped to ONE specific
// instance, never a generic "I am this identity" blank check) still
// applies.
//
// `payload` covers the entire publication: `invitation` (the wrapped
// peer/PeerInvitation.js, unsigned in its own right — see that file's own
// header on why signing IT would be the wrong layer), `publishedAt`, and
// `expiresAt`. Signing the expiry means a signed publication cannot be
// re-published with a LONGER ttl than the signer actually granted without
// invalidating the signature — the same "never outlives what was
// actually authorized" property peer/RendezvousPublication.js's own
// constructor already enforces structurally, now also covered
// cryptographically.
export function getRendezvousPublicationSigningDescriptor(publication) {
    return {
        type: SignatureType.RENDEZVOUS_PUBLICATION,
        id: publication.identityHint,
        revision: publication.publicationId,
        payload: {
            publicationId: publication.publicationId,
            identityHint: publication.identityHint,
            invitation: publication.invitation.toJSON(),
            publishedAt: publication.publishedAt.toISOString(),
            expiresAt: publication.expiresAt.toISOString()
        }
    };
}
