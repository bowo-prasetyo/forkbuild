import { createId } from '../core/createId.js';

// 0.2.52 — the wire shape carried over an AUTHENTICATED peer connection,
// once peer/PeerAuthenticationSession.js's own handshake has already
// finished. Deliberately boring, exactly the same "plain, JSON-shaped
// object, no class identity, no application semantics" discipline
// core/PeerAuthenticationEnvelope.js and core/AvatarPresenceAdvertisement.js
// already established for their own wire shapes — this one travels over
// the SAME peer/PeerConnection.js#send()/onMessage() a HELLO/PROOF
// already does, so it has to survive the identical structured-clone-into-
// a-different-JS-realm trip.
//
//   { messageId, protocol, version, payload }
//
// `protocol` is a namespaced application identifier ("avatar-presence",
// "avatar-profile", "test.alpha", ...) — peer/PeerMessageBus.js routes on
// THIS field alone and never inspects `payload`. `version` is that
// protocol's own wire version, carried but never interpreted at this
// layer — a protocol is free to mean whatever it wants by bumping it;
// peer/PeerMessageBus.js has no opinion. `messageId` exists purely for
// THIS layer's own duplicate-suppression hygiene (peer/PeerMessageBus.js's
// bounded window) — it is NOT a sequence number and NOT a causal-ordering
// primitive, and no protocol above this layer should treat it as either.
// See docs/Principles.md, "A Peer Message Envelope Carries Routing
// Information, Never Meaning" (0.2.52).
//
// Deliberately absent, on purpose, per the design doc this milestone
// implements: avatar state, a username, an authorization decision, trust
// state, or a signature. Those all belong to whatever protocol produced
// `payload` — see docs/Principles.md, "A Peer Connection Transports
// Messages; It Does Not Interpret Them" (0.2.52). In particular, this
// milestone deliberately does NOT add a second, generic message
// signature here: the connection is already authenticated (peer/
// PeerAuthenticationSession.js proved who controls it), and an
// individual protocol that additionally needs cryptographic proof over
// its OWN payload — the way core/AvatarPresenceAdvertisement.js and
// friends already do — signs at ITS layer, not this one.
export const PEER_MESSAGE_ENVELOPE_VERSION_DEFAULT = 1;

// A generous, deliberately arbitrary ceiling. This is transport hygiene —
// reject something absurd before it ever reaches a protocol handler —
// never a real per-protocol payload budget. A protocol that genuinely
// needs to move more chunks at its OWN layer; peer/PeerMessageBus.js has
// no concept of a multi-part message.
export const MAX_PEER_MESSAGE_BYTES = 64 * 1024;

export function createPeerMessage(protocol, payload, { version = PEER_MESSAGE_ENVELOPE_VERSION_DEFAULT } = {}) {
    if (!protocol || typeof protocol !== 'string') {
        throw new Error('createPeerMessage: protocol is required');
    }
    if (!Number.isInteger(version) || version < 1) {
        throw new Error('createPeerMessage: version must be a positive integer');
    }
    if (payload === undefined) {
        throw new Error('createPeerMessage: payload is required');
    }
    return {
        messageId: createId(),
        protocol,
        version,
        payload
    };
}

// Structural validity ONLY — never anything about `payload`'s own shape,
// which belongs entirely to whatever protocol handler consumes it (see
// this file's own header). A HELLO/PROOF message from peer/
// PeerAuthenticationSession.js's own handshake — which shares this same
// connection's onMessage() stream — always fails this check (it carries
// `type`, never `protocol`/`messageId`/`version`+`payload` together), so
// peer/PeerMessageBus.js needs no special-case filter to ignore it.
export function isValidPeerMessageEnvelope(value) {
    return Boolean(value)
        && typeof value === 'object'
        && typeof value.messageId === 'string' && value.messageId.length > 0
        && typeof value.protocol === 'string' && value.protocol.length > 0
        && Number.isInteger(value.version) && value.version >= 1
        && Object.prototype.hasOwnProperty.call(value, 'payload');
}

// Best-effort size, in UTF-16 code units rather than true UTF-8 bytes —
// a coarse "reject something absurd" measure, not a precise accounting
// boundary. A value that cannot be JSON-serialized at all (a function, a
// circular structure) is treated as infinitely oversized rather than
// thrown from here — the caller decides what "reject" means.
export function peerMessageByteSize(envelope) {
    try {
        return JSON.stringify(envelope).length;
    } catch {
        return Infinity;
    }
}

export function exceedsMaxPeerMessageSize(envelope) {
    return peerMessageByteSize(envelope) > MAX_PEER_MESSAGE_BYTES;
}
