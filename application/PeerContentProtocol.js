// 0.7.4 — Peer Content Retrieval.
//
// The WIRE shape carried over peer/PeerMessageBus.js under this file's own
// DEFAULT_PROTOCOL — the pull-based counterpart application/
// PublicationPeerProtocol.js's own header named and deliberately declined
// to build: "Adding REQUEST/RESPONSE later means adding two new `kind`
// values here and two new handlers in application/
// PublicationPeerExchange.js — never touching ANNOUNCE's own shape." That
// prediction holds: this module is new, ANNOUNCE is untouched, and the two
// kinds below live in their own namespace ('forkbuild:content') rather than
// being folded into PublicationPeerMessageKind.
//
// Only two kinds exist, on purpose — see this milestone's own docs/
// Roadmap.md entry, "Keep The Protocol Tiny":
//
//   REQUEST  — "send me the bytes for this content hash."
//   RESPONSE — "here are bytes I believe hash to that value."
//
// There is no NOT_FOUND kind. A peer that cannot or will not help a
// REQUEST simply never sends a RESPONSE — the identical silent-drop
// restraint every exchange class in this codebase already applies to a
// message it chooses not to act on, rather than inventing a new wire
// state whose only purpose would be to describe absence.
//
// `hash` is a bare content hash string — never a URI, never a storage
// backend hint. See docs/Principles.md, "A Content Reference Names Bytes,
// Never A Location" (0.7.0/0.7.1): the peer on either end of this
// protocol needs to know WHAT is being asked for, never WHERE it might
// also be found. `isValidContentHash()` below is deliberately
// algorithm-agnostic (core/ContentReference.js already supports more than
// one `algorithm`) — it only rejects the empty string, a non-string, and
// anything absurdly long, the same "reject something absurd before it
// reaches a handler" transport hygiene peer/PeerMessage.js's own
// MAX_PEER_MESSAGE_BYTES already applies one layer down.
//
// `bytes` in a RESPONSE is capped at MAX_CONTENT_BYTES — well under peer/
// PeerMessage.js's own 64KB MAX_PEER_MESSAGE_BYTES envelope ceiling, to
// leave headroom for the envelope wrapper (messageId/protocol/version)
// and this module's own `kind`/`hash` fields without ever tripping that
// OUTER limit first and surfacing as an opaque PeerMessageBus throw
// instead of a meaningful rejection at this layer. This is the "maximum
// content-transfer size" this milestone's own design conversation
// insisted on: a REQUEST for one Publication's content bytes must never
// become a vector for a peer to push something unbounded at another.
//
// Structural validity ONLY, exactly like application/
// PublicationPeerProtocol.js's own isValidPublicationPeerMessage()
// restraint: says nothing about whether a REQUEST's hash is one this
// replica is willing to serve, or whether a RESPONSE's bytes actually
// hash to what it claims. Both of those are application/
// PeerContentExchange.js's own ingestion-boundary questions, asked one
// layer up — this module only ever describes the wrapper.
export const PeerContentMessageKind = Object.freeze({
    REQUEST: 'REQUEST',
    RESPONSE: 'RESPONSE'
});

export const MAX_CONTENT_BYTES = 48 * 1024;

const MAX_HASH_LENGTH = 128;
const HASH_PATTERN = /^[0-9a-f]+$/i;

export function isValidContentHash(hash) {
    return typeof hash === 'string' && hash.length > 0 && hash.length <= MAX_HASH_LENGTH && HASH_PATTERN.test(hash);
}

export function toContentRequestMessage(hash) {
    if (!isValidContentHash(hash)) {
        throw new Error('toContentRequestMessage: a valid content hash is required');
    }
    return { kind: PeerContentMessageKind.REQUEST, hash };
}

// `bytes` is required and non-empty — a RESPONSE always carries real
// content; see this file's own header on why "not found" is never a
// message this protocol sends. Throws if `bytes` would exceed
// MAX_CONTENT_BYTES, the SENDING side's own half of this milestone's
// oversized-content defense; application/PeerContentExchange.js#
// _handleRequest() catches this and simply does not reply, rather than
// letting an oversized reply reach the wire at all.
export function toContentResponseMessage(hash, bytes) {
    if (!isValidContentHash(hash)) {
        throw new Error('toContentResponseMessage: a valid content hash is required');
    }
    if (typeof bytes !== 'string' || bytes.length === 0) {
        throw new Error('toContentResponseMessage: non-empty bytes are required');
    }
    if (bytes.length > MAX_CONTENT_BYTES) {
        throw new Error(`toContentResponseMessage: content exceeds MAX_CONTENT_BYTES (${MAX_CONTENT_BYTES})`);
    }
    return { kind: PeerContentMessageKind.RESPONSE, hash, bytes };
}

// The RECEIVING side's own half of the oversized-content defense — a
// malicious or buggy peer that ignores toContentResponseMessage()'s own
// ceiling and hand-crafts an oversized RESPONSE is rejected right here,
// never trusted merely because it arrived. Never throws; a value this
// codebase's other *PeerProtocol.js modules already treat as "not even
// worth a specific reason" (see application/
// PublicationPeerProtocol.js#isValidPublicationPeerMessage()) is simply
// not valid.
export function isValidPeerContentMessage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    if (value.kind === PeerContentMessageKind.REQUEST) {
        return isValidContentHash(value.hash);
    }
    if (value.kind === PeerContentMessageKind.RESPONSE) {
        return isValidContentHash(value.hash)
            && typeof value.bytes === 'string'
            && value.bytes.length > 0
            && value.bytes.length <= MAX_CONTENT_BYTES;
    }
    return false;
}
