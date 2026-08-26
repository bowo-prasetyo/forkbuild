// 0.8.37 — Explicit Peer Snapshot Content Transfer.
//
// The WIRE shape carried over peer/PeerMessageBus.js under application/
// PublicationSnapshotContentPeerExchange.js's own DEFAULT_PROTOCOL —
// application/PeerContentProtocol.js's own REQUEST/RESPONSE shape (0.7.4),
// narrowed and re-scoped for a DIFFERENT caller. 0.7.4's own protocol
// exists to let application/PublicationResolutionCoordinator.js (0.7.5/
// 0.7.6) automatically ask EVERY connected peer, in order, whenever a
// publication's content is not locally available — an implicit,
// resolution-driven pull, authorized by whether this replica's own
// application/LocalPublicationCatalog.js already knows a locator for the
// requested hash. This module exists for the opposite shape entirely: one
// person, looking at one publication's "Local Snapshot" summary, clicking
// "Get Snapshot from Peer" and choosing exactly one already-authenticated
// peer to ask — never a coordinator trying several on their behalf. See
// application/PublicationSnapshotContentPeerExchange.js's own header for
// why that difference means this module carries `publicationId` at all
// (0.7.4's own REQUEST never did) and why its own exchange class never
// consults a catalog before answering.
//
// Only two kinds exist, on purpose, exactly mirroring application/
// PeerContentProtocol.js's own restraint:
//
//   REQUEST  — "send me the bytes for this content hash, for this
//               publication."
//   RESPONSE — "here are bytes I believe hash to that value."
//
// There is no NOT_FOUND kind, for the identical reason every sibling
// *PeerProtocol.js module in this codebase already gives: a peer that
// does not currently hold the requested bytes simply never sends a
// RESPONSE. This module introduces no new wire state whose only purpose
// would be to describe absence — see application/
// PublicationSnapshotContentPeerExchange.js's own header on why "Carol
// doesn't have it" and "Carol never answered" are therefore, honestly,
// the SAME observable outcome from the requester's side, never two
// invented states pretending to distinguish something this wire protocol
// cannot actually tell them apart.
//
// `publicationId` travels alongside `contentHash` in BOTH directions —
// the one deliberate shape difference from application/
// PeerContentProtocol.js's own bare-hash REQUEST. It is carried for
// CORRELATION and display only (so a person watching "Get Snapshot from
// Peer" on one specific publication's card can tell a RESPONSE apart from
// one meant for another card open at the same time); it is never an
// authorization input on either side. See application/
// PublicationSnapshotContentPeerExchange.js's own header: the responding
// side answers strictly by asking its own local content/ContentStore.js
// whether `contentHash`'s bytes are present, never by consulting
// `publicationId` against a catalog of any kind.
//
// `contentHash` validation and `MAX_SNAPSHOT_CONTENT_BYTES` mirror
// application/PeerContentProtocol.js's own `isValidContentHash()` and
// `MAX_CONTENT_BYTES` exactly, restated here rather than imported — the
// identical "each protocol module is self-contained" discipline
// application/PublicationSnapshotPlacementPeerProtocol.js's own header
// already holds one domain over, rather than reaching into a sibling
// protocol module's internals.
//
// Structural validity ONLY, exactly like every sibling *PeerProtocol.js
// module: says nothing about whether a REQUEST's hash is one a responder
// is willing (or able) to serve, or whether a RESPONSE's `content`
// actually hashes to what it claims. Both of those are application/
// PublicationSnapshotContentPeerExchange.js's own ingestion-boundary
// questions — and, for the ONE question that actually matters (does
// `content` verify?), application/StoreSnapshotContentUseCase.js's own
// question, asked one layer up, never here.
export const PeerSnapshotContentMessageKind = Object.freeze({
    REQUEST: 'REQUEST',
    RESPONSE: 'RESPONSE'
});

// Identical ceiling to application/PeerContentProtocol.js's own
// MAX_CONTENT_BYTES, for the identical reason: well under peer/
// PeerMessage.js's own 64KB MAX_PEER_MESSAGE_BYTES envelope ceiling, to
// leave headroom for the envelope wrapper and this module's own
// `kind`/`publicationId`/`contentHash` fields without ever tripping that
// OUTER limit first.
export const MAX_SNAPSHOT_CONTENT_BYTES = 48 * 1024;

const MAX_PUBLICATION_ID_LENGTH = 512;
const MAX_HASH_LENGTH = 128;
const HASH_PATTERN = /^[0-9a-f]+$/i;

function isValidPublicationId(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_PUBLICATION_ID_LENGTH;
}

export function isValidContentHash(hash) {
    return typeof hash === 'string' && hash.length > 0 && hash.length <= MAX_HASH_LENGTH && HASH_PATTERN.test(hash);
}

export function toSnapshotContentRequestMessage(publicationId, contentHash) {
    if (!isValidPublicationId(publicationId)) {
        throw new Error('toSnapshotContentRequestMessage: a valid publicationId is required');
    }
    if (!isValidContentHash(contentHash)) {
        throw new Error('toSnapshotContentRequestMessage: a valid contentHash is required');
    }
    return { kind: PeerSnapshotContentMessageKind.REQUEST, publicationId, contentHash };
}

// `content` is required and non-empty — a RESPONSE always carries real
// bytes; see this file's own header on why "not found" is never a message
// this protocol sends. Throws if `content` would exceed
// MAX_SNAPSHOT_CONTENT_BYTES, the SENDING side's own half of the
// oversized-content defense; application/
// PublicationSnapshotContentPeerExchange.js#_handleRequest() catches this
// and simply does not reply, rather than letting an oversized reply reach
// the wire at all.
export function toSnapshotContentResponseMessage(publicationId, contentHash, content) {
    if (!isValidPublicationId(publicationId)) {
        throw new Error('toSnapshotContentResponseMessage: a valid publicationId is required');
    }
    if (!isValidContentHash(contentHash)) {
        throw new Error('toSnapshotContentResponseMessage: a valid contentHash is required');
    }
    if (typeof content !== 'string' || content.length === 0) {
        throw new Error('toSnapshotContentResponseMessage: non-empty content is required');
    }
    if (content.length > MAX_SNAPSHOT_CONTENT_BYTES) {
        throw new Error(`toSnapshotContentResponseMessage: content exceeds MAX_SNAPSHOT_CONTENT_BYTES (${MAX_SNAPSHOT_CONTENT_BYTES})`);
    }
    return { kind: PeerSnapshotContentMessageKind.RESPONSE, publicationId, contentHash, content };
}

// The RECEIVING side's own half of the oversized-content defense — a
// malicious or buggy peer that ignores toSnapshotContentResponseMessage()'s
// own ceiling and hand-crafts an oversized RESPONSE is rejected right
// here, never trusted merely because it arrived.
export function isValidPeerSnapshotContentMessage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    if (value.kind === PeerSnapshotContentMessageKind.REQUEST) {
        return isValidPublicationId(value.publicationId) && isValidContentHash(value.contentHash);
    }
    if (value.kind === PeerSnapshotContentMessageKind.RESPONSE) {
        return isValidPublicationId(value.publicationId)
            && isValidContentHash(value.contentHash)
            && typeof value.content === 'string'
            && value.content.length > 0
            && value.content.length <= MAX_SNAPSHOT_CONTENT_BYTES;
    }
    return false;
}
