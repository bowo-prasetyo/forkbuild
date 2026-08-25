// 0.8.19 — Snapshot Placement Discovery & Peer Synchronization.
//
// The WIRE shape carried over peer/PeerMessageBus.js under this file's own
// DEFAULT_PROTOCOL — application/PublicationAnchorPeerProtocol.js's own
// ANNOUNCE/REQUEST/RESPONSE shape (0.8.4/0.8.5), applied to a
// PublicationSnapshotPlacement instead of a PublicationAnchor. 0.8.18's
// own "Deliberately excluded" list named this file directly: "no
// PublicationSnapshotPlacementPeerExchange transport does [exist yet]. A
// future milestone can build one the same way 0.8.4 built one for
// anchors, without changing anything shipped here." This is that
// milestone — and unlike anchors, which shipped push (0.8.4) and pull
// (0.8.5) as two separate milestones, this file ships all three kinds at
// once, because there is no reason for a placement-discovery replica to
// wait through an intermediate ANNOUNCE-only milestone the way the
// anchor precedent historically did.
//
//   ANNOUNCE  — "here is a placement claim I already hold"
//   REQUEST   — "give me placements you know about this publicationId"
//   RESPONSE  — "here are matching placement claims"
//
// REQUEST is deliberately scoped to `publicationId` ONLY — not
// `contentHash`, not `storage`, not a general filter object. This
// mirrors application/PublicationAnchorPeerProtocol.js's own identical
// restraint (0.8.5), which itself mirrors 0.7.4's own restraint one layer
// further down. Broader discovery (by contentHash, by storage backend, or
// a combined filter) is left for a future milestone to add on demand,
// never guessed at in advance.
//
// There is no NOT_FOUND kind, for the identical reason application/
// PublicationAnchorPeerProtocol.js's own header already gives: a peer
// that knows no matching placement simply never sends a RESPONSE. This
// module introduces no new wire state whose only purpose would be to
// describe absence.
//
// `placements` in a RESPONSE is capped at MAX_PLACEMENTS_PER_RESPONSE —
// the identical defensive posture application/
// PublicationAnchorPeerProtocol.js's own MAX_ANCHORS_PER_RESPONSE already
// applies, extended here to placement envelopes. This is not pagination
// — a caller that wants more than MAX_PLACEMENTS_PER_RESPONSE placements
// for one publication gets the first batch a responding peer chose to
// include, never a cursor to continue with.
//
// Structural validity ONLY, exactly like application/
// PublicationAnchorPeerProtocol.js's own isValidPublicationAnchorPeerMessage()
// already draws for ANNOUNCE: says nothing about whether a REQUEST's
// publicationId is one this replica is willing to answer, or whether a
// RESPONSE's placements actually resolve. Those are application/
// PublicationSnapshotPlacementExchange.js's own ingestion-boundary
// questions (structural validity + SIGNATURE only), and application/
// SnapshotPlacementResolver.js's own separate, on-demand question
// (whether the locator actually still serves those bytes) — never
// answered here.
export const PublicationSnapshotPlacementPeerMessageKind = Object.freeze({
    ANNOUNCE: 'ANNOUNCE',
    REQUEST: 'REQUEST',
    RESPONSE: 'RESPONSE'
});

export const MAX_PLACEMENTS_PER_RESPONSE = 64;

const MAX_PUBLICATION_ID_LENGTH = 512;

function isValidPublicationId(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_PUBLICATION_ID_LENGTH;
}

// `envelope` is a plain `PublicationSnapshotPlacement.toJSON()` object —
// never validated or hydrated here. Structural/signature validity is
// entirely application/PublicationSnapshotPlacementExchange.js#
// importPlacement()'s job, one layer up; this module only ever describes
// the OUTER gossip wrapper. No network metadata, and no resolution
// result of any kind, is ever added to `envelope` — the placement an
// announcing replica signed is byte-for-byte the placement a receiving
// replica verifies.
export function toPublicationSnapshotPlacementAnnounceMessage(envelope) {
    if (!envelope || typeof envelope !== 'object') {
        throw new Error('toPublicationSnapshotPlacementAnnounceMessage: envelope is required');
    }
    return { kind: PublicationSnapshotPlacementPeerMessageKind.ANNOUNCE, envelope };
}

// "Give me placements you know about this publicationId." Carries
// nothing else — no `receivedAt`, no requester identity, no cursor — the
// same bare-minimum ask application/PublicationAnchorPeerProtocol.js#
// toPublicationAnchorRequestMessage() already makes one domain over.
export function toPublicationSnapshotPlacementRequestMessage(publicationId) {
    if (!isValidPublicationId(publicationId)) {
        throw new Error('toPublicationSnapshotPlacementRequestMessage: a valid publicationId is required');
    }
    return { kind: PublicationSnapshotPlacementPeerMessageKind.REQUEST, publicationId };
}

// `placements` is an array of plain `PublicationSnapshotPlacement.toJSON()`
// envelopes — each one exactly what a genuine ANNOUNCE would have
// carried, never wrapped with `receivedAt`, a resolution outcome, or
// which peer this replica itself heard it from. Throws if `placements`
// would exceed MAX_PLACEMENTS_PER_RESPONSE — the SENDING side's own half
// of this milestone's bounded-response defense; application/
// PublicationSnapshotPlacementPeerExchange.js#_handleRequest() truncates
// rather than letting an oversized reply reach the wire at all.
export function toPublicationSnapshotPlacementResponseMessage(publicationId, placements) {
    if (!isValidPublicationId(publicationId)) {
        throw new Error('toPublicationSnapshotPlacementResponseMessage: a valid publicationId is required');
    }
    if (!Array.isArray(placements)) {
        throw new Error('toPublicationSnapshotPlacementResponseMessage: placements must be an array');
    }
    if (placements.length > MAX_PLACEMENTS_PER_RESPONSE) {
        throw new Error(`toPublicationSnapshotPlacementResponseMessage: placements exceeds MAX_PLACEMENTS_PER_RESPONSE (${MAX_PLACEMENTS_PER_RESPONSE})`);
    }
    if (placements.some((envelope) => !envelope || typeof envelope !== 'object')) {
        throw new Error('toPublicationSnapshotPlacementResponseMessage: every placement envelope must be an object');
    }
    return { kind: PublicationSnapshotPlacementPeerMessageKind.RESPONSE, publicationId, placements };
}

// Structural validity of the WRAPPER only — exactly like application/
// PublicationAnchorPeerProtocol.js#isValidPublicationAnchorPeerMessage()'s
// own restraint: says nothing about whether `envelope` (ANNOUNCE) or any
// entry of `placements` (RESPONSE) is a well-formed
// PublicationSnapshotPlacement, or whether it signature-verifies or
// resolves. Those are application/
// PublicationSnapshotPlacementExchange.js's own ingestion boundary
// questions, asked in order, one layer up. The RECEIVING side's own half
// of the bounded-response defense lives right here — a malicious or
// buggy peer that ignores toPublicationSnapshotPlacementResponseMessage()'s
// own ceiling and hand-crafts an oversized RESPONSE is rejected before it
// is ever acted on, never trusted merely because it arrived.
export function isValidPublicationSnapshotPlacementPeerMessage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    if (value.kind === PublicationSnapshotPlacementPeerMessageKind.ANNOUNCE) {
        return Boolean(value.envelope) && typeof value.envelope === 'object';
    }
    if (value.kind === PublicationSnapshotPlacementPeerMessageKind.REQUEST) {
        return isValidPublicationId(value.publicationId);
    }
    if (value.kind === PublicationSnapshotPlacementPeerMessageKind.RESPONSE) {
        return isValidPublicationId(value.publicationId)
            && Array.isArray(value.placements)
            && value.placements.length <= MAX_PLACEMENTS_PER_RESPONSE
            && value.placements.every((envelope) => Boolean(envelope) && typeof envelope === 'object');
    }
    return false;
}
