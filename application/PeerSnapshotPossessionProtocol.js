// 0.8.40 — Snapshot Possession Observation Exchange.
//
// The WIRE shape carried over peer/PeerMessageBus.js under application/
// PublicationSnapshotPossessionPeerExchange.js's own DEFAULT_PROTOCOL — the
// REQUEST/RESPONSE half of application/PeerSnapshotContentProtocol.js's own
// shape (0.8.37), asked one question over entirely: never "give me the
// bytes," only "do you currently have bytes matching this hash?"
//
//   REQUEST   — "do you currently possess bytes for this publicationId and
//                contentHash?"
//   RESPONSE  — "yes" (AVAILABLE) or "no" (NOT_AVAILABLE) — ALWAYS one or
//                the other, never silence.
//
// THE ONE STRUCTURAL DIFFERENCE FROM EVERY SIBLING *PeerProtocol.js MODULE
// IN THIS CODEBASE, stated once here because it shapes this entire
// protocol: there is no "a peer that doesn't have it just stays silent"
// convention here. application/PeerSnapshotContentProtocol.js's own header
// explains why THAT protocol has no NOT_FOUND kind — sending bytes it does
// not have is not something a RESPONSE can do halfway, so absence and
// silence collapse into the same observable outcome there. Possession is
// different: answering "no" costs nothing, is exactly as informative as
// answering "yes," and — critically — is what lets a genuine non-response
// (peer unreachable, or a REQUEST/RESPONSE lost in transit) stay
// DISTINGUISHABLE from an honest "not available" answer. See application/
// PublicationSnapshotPossessionPeerExchange.js's own header on why its own
// `_handleRequest()` always sends a RESPONSE, never sends nothing.
//
// `possession` on a RESPONSE is deliberately only ever `AVAILABLE` or
// `NOT_AVAILABLE` — never a third wire value exposing application/
// LocalSnapshotContentAvailabilityOutcome.js's own `CONTENT_HASH_MISMATCH`.
// A peer's own local storage-integrity diagnosis (bytes present under this
// hash but no longer verifying against it) is that peer's own business; the
// network question this protocol answers stays exactly "do you have bytes
// matching this hash," collapsing CONTENT_HASH_MISMATCH into NOT_AVAILABLE
// exactly like "no" — see application/
// PublicationSnapshotPossessionPeerExchange.js#_handleRequest() for where
// that collapse actually happens (never in this file, which only ever
// describes the wire shape, not how a `possession` value gets decided).
//
// `publicationId` travels alongside `contentHash` in both directions, for
// CORRELATION and display only, mirroring application/
// PeerSnapshotContentProtocol.js's own identical restraint one milestone
// over — never an authorization input, and never consulted against a
// catalog on the responding side.
//
// Structural validity ONLY. Says nothing about whether a `possession` value
// is honest, whether the responding replica actually re-checked its own
// storage, or what a requester should conclude from it — those are
// application/PublicationSnapshotPossessionPeerExchange.js's own boundary
// (deciding what to answer) and application/
// ObservePeerSnapshotPossessionUseCase.js's own boundary (deciding what an
// answer, or its absence, means), never this file's.
export const PeerSnapshotPossessionMessageKind = Object.freeze({
    REQUEST: 'REQUEST',
    RESPONSE: 'RESPONSE'
});

// The only two values a RESPONSE's `possession` field may ever carry — see
// this file's own header on why a third, CONTENT_HASH_MISMATCH-shaped wire
// value deliberately does not exist. Distinct from application/
// SnapshotPeerPossessionState.js's own three-value REQUESTER-side
// observation enum, which adds UNAVAILABLE for "nothing came back before
// the timeout" — a state that, by construction, never crosses the wire,
// because nothing ever arrives to carry it.
export const PeerSnapshotPossessionWireState = Object.freeze({
    AVAILABLE: 'available',
    NOT_AVAILABLE: 'not-available'
});

const MAX_PUBLICATION_ID_LENGTH = 512;
const MAX_HASH_LENGTH = 128;
const HASH_PATTERN = /^[0-9a-f]+$/i;

function isValidPublicationId(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_PUBLICATION_ID_LENGTH;
}

export function isValidContentHash(hash) {
    return typeof hash === 'string' && hash.length > 0 && hash.length <= MAX_HASH_LENGTH && HASH_PATTERN.test(hash);
}

export function toSnapshotPossessionRequestMessage(publicationId, contentHash) {
    if (!isValidPublicationId(publicationId)) {
        throw new Error('toSnapshotPossessionRequestMessage: a valid publicationId is required');
    }
    if (!isValidContentHash(contentHash)) {
        throw new Error('toSnapshotPossessionRequestMessage: a valid contentHash is required');
    }
    return { kind: PeerSnapshotPossessionMessageKind.REQUEST, publicationId, contentHash };
}

export function toSnapshotPossessionResponseMessage(publicationId, contentHash, possession) {
    if (!isValidPublicationId(publicationId)) {
        throw new Error('toSnapshotPossessionResponseMessage: a valid publicationId is required');
    }
    if (!isValidContentHash(contentHash)) {
        throw new Error('toSnapshotPossessionResponseMessage: a valid contentHash is required');
    }
    if (possession !== PeerSnapshotPossessionWireState.AVAILABLE && possession !== PeerSnapshotPossessionWireState.NOT_AVAILABLE) {
        throw new Error('toSnapshotPossessionResponseMessage: possession must be AVAILABLE or NOT_AVAILABLE');
    }
    return { kind: PeerSnapshotPossessionMessageKind.RESPONSE, publicationId, contentHash, possession };
}

export function isValidPeerSnapshotPossessionMessage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    if (value.kind === PeerSnapshotPossessionMessageKind.REQUEST) {
        return isValidPublicationId(value.publicationId) && isValidContentHash(value.contentHash);
    }
    if (value.kind === PeerSnapshotPossessionMessageKind.RESPONSE) {
        return isValidPublicationId(value.publicationId)
            && isValidContentHash(value.contentHash)
            && (value.possession === PeerSnapshotPossessionWireState.AVAILABLE || value.possession === PeerSnapshotPossessionWireState.NOT_AVAILABLE);
    }
    return false;
}
