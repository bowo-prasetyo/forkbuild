import { SignatureType } from './Signature.js';

// 0.2.49 — the WIRE shapes exchanged during a peer authentication
// handshake (peer/PeerAuthenticationSession.js), and the canonical
// signing envelope a PROOF message's signature covers. Plain,
// JSON-shaped objects on purpose, exactly like core/
// AvatarPresenceAdvertisement.js and friends: a message travels over a
// PeerConnectionProvider transport that may structured-clone it into a
// completely different JS realm, where a custom class's prototype
// means nothing anyway.
//
// Two message types, one handshake:
//
//   HELLO  — "I am identityId, here is my public key, and here is a
//             CHALLENGE I want you to sign back to prove you hold the
//             matching private key." Sent by BOTH sides independently
//             the moment a PeerAuthenticationSession starts — this is
//             not a request/response protocol with an initiator and a
//             responder, it is two symmetric one-way identity claims
//             that happen to travel over the same connection.
//   PROOF  — "Here is my signature over the challenge YOU sent me, plus
//             my own identity claim again so the signature is
//             self-contained." A PROOF answers exactly one HELLO; it
//             carries the challenge value it is answering rather than
//             leaving that implicit, so a receiver can check it against
//             the specific challenge THEY issued rather than trusting
//             the responder's say-so about which round this is.
//
// `sessionNonce` is deliberately not a challenge — it is the
// connection's own connectionId (peer/PeerConnection.js), carried in
// EVERY message and signed over in every PROOF. Binding every
// signature to the specific connection instance it was produced for is
// what makes "capture a real handshake and replay it into a brand-new
// connection" fail even though every individual field the replay
// carries (identityId, publicKey, challenge, signature) is completely
// genuine — see docs/Principles.md, "A Peer Authentication Signature Is
// Scoped To One Connection, Never To One Identity."
export const PEER_AUTHENTICATION_PROTOCOL = 'forkbuild-peer-auth/1';

export const PeerAuthenticationPurpose = Object.freeze({
    PEER_AUTHENTICATION: 'PEER_AUTHENTICATION'
});

export const PeerAuthenticationMessageType = Object.freeze({
    HELLO: 'HELLO',
    PROOF: 'PROOF'
});

export function toHelloMessage({ sessionNonce, identityId, publicKey, challenge }) {
    return {
        type: PeerAuthenticationMessageType.HELLO,
        sessionNonce,
        identityId,
        publicKey,
        challenge
    };
}

export function isValidHelloMessage(value) {
    return Boolean(value)
        && value.type === PeerAuthenticationMessageType.HELLO
        && typeof value.sessionNonce === 'string' && value.sessionNonce.length > 0
        && typeof value.identityId === 'string' && value.identityId.length > 0
        && typeof value.publicKey === 'string' && value.publicKey.length > 0
        && typeof value.challenge === 'string' && value.challenge.length > 0;
}

export function toProofMessage({ sessionNonce, identityId, publicKey, challenge, signature }) {
    return {
        type: PeerAuthenticationMessageType.PROOF,
        sessionNonce,
        identityId,
        publicKey,
        challenge,
        signature
    };
}

export function isValidProofMessage(value) {
    return Boolean(value)
        && value.type === PeerAuthenticationMessageType.PROOF
        && typeof value.sessionNonce === 'string' && value.sessionNonce.length > 0
        && typeof value.identityId === 'string' && value.identityId.length > 0
        && typeof value.publicKey === 'string' && value.publicKey.length > 0
        && typeof value.challenge === 'string' && value.challenge.length > 0
        && Boolean(value.signature) && typeof value.signature === 'object';
}

// The canonical signing envelope, in exactly the shape core/
// Signature.js's canonicalBytes()/canonicalEnvelope() expect (see
// identity/LocalIdentityProvider.js's signCanonical()). Covers
// EVERYTHING a PROOF message claims — protocol, purpose, sessionNonce,
// challenge, identityId, AND publicKey — deliberately never a narrower
// subset: signing only the challenge, for example, would let a captured
// signature be replayed with a swapped-in identityId/publicKey while
// still verifying, exactly the causal-history signing bug 0.2.18 fixed
// for revision history, recreated one level up if this shape ever
// shrank. `protocol`/`purpose` are the domain separation the design
// doc asked for beyond what `domain`/`type` already provide (see
// SignatureType.PEER_AUTHENTICATION's own header) — a receiver that
// somehow accepted a differently-shaped descriptor under the same
// SignatureType would still see the wrong protocol/purpose pair and
// fail the hash check. `id` is the identity this signature is ABOUT
// (the claimed identityId, matching every other SignatureType's own
// convention); `revision` is the challenge — the one field that must
// differ between any two honestly-produced PROOFs for the same
// identity, so no two ever hash to the same canonical bytes.
export function getPeerAuthenticationSigningDescriptor({ sessionNonce, identityId, publicKey, challenge }) {
    return {
        type: SignatureType.PEER_AUTHENTICATION,
        id: identityId,
        revision: challenge,
        payload: {
            protocol: PEER_AUTHENTICATION_PROTOCOL,
            purpose: PeerAuthenticationPurpose.PEER_AUTHENTICATION,
            sessionNonce,
            challenge,
            identityId,
            publicKey
        }
    };
}
