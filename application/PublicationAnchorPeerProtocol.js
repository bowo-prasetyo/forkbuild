// 0.8.4 — External Anchor Publication Over Peers.
// 0.8.5 — Historical Anchor Discovery & Synchronization.
//
// The WIRE shape carried over peer/PeerMessageBus.js under this file's own
// DEFAULT_PROTOCOL — the identical smallest-possible wrapper application/
// PublicationPeerProtocol.js already established one domain over: a `kind`
// discriminator plus the record itself, unchanged. There is no new
// signature type invented here and no new claim being made — an announced
// or synchronized envelope is byte-for-byte the exact
// `PublicationAnchor.toJSON()` shape application/PublicationAnchorExchange
// .js already knows how to import. See docs/Principles.md, "Propagation
// Carries A Record, It Does Not Mint A New Claim" (0.2.68), extended here
// from a publication envelope to an anchor.
//
// 0.8.4 shipped exactly ONE message kind, ANNOUNCE, and its own header
// named the obvious next step and declined to build it: "REQUEST/RESPONSE
// (historical anchor discovery for a newly joined replica) is deliberately
// left for its own future milestone." This file is that milestone,
// extending the SAME protocol namespace ('forkbuild:anchor') the identical
// way application/PeerContentProtocol.js's own header once predicted for a
// sibling protocol: "adding REQUEST/RESPONSE later means adding two new
// `kind` values here... never touching ANNOUNCE's own shape." ANNOUNCE
// below is untouched, byte for byte.
//
//   ANNOUNCE  — "here is an anchor claim I already hold" (0.8.4, unchanged)
//   REQUEST   — "give me anchors you know about this publicationId"
//   RESPONSE  — "here are matching anchor claims"
//
// REQUEST is deliberately scoped to `publicationId` ONLY — not
// `contentHash`, not `anchorType`, not a general filter object. This
// mirrors 0.7.4's own restraint (application/PeerContentProtocol.js
// requests by a single content hash, nothing broader) and matches exactly
// what the Publication Center's evidence workflow (0.8.3) actually needs:
// "what evidence do you know about THIS publication?" Broader discovery
// (by contentHash, by anchorType, or a combined filter) is left for a
// future milestone to add on demand, never guessed at in advance — see
// docs/Roadmap.md, 0.8.5, "Deliberately excluded."
//
// There is no NOT_FOUND kind, for the identical reason application/
// PeerContentProtocol.js's own header already gives: a peer that knows no
// matching anchor simply never sends a RESPONSE. This module introduces no
// new wire state whose only purpose would be to describe absence.
//
// `anchors` in a RESPONSE is capped at MAX_ANCHORS_PER_RESPONSE — the
// identical defensive posture application/PeerContentProtocol.js's own
// MAX_CONTENT_BYTES already applies to content bytes, extended here to a
// COUNT rather than a byte size, because an anchor envelope's own byte
// size is already small and bounded (see core/PublicationAnchor.js) while
// its COUNT per publication is the actual unbounded axis a peer with
// hundreds or thousands of cataloged anchors for one publication could
// otherwise use to build an outsized reply. This is not pagination — a
// caller that wants more than MAX_ANCHORS_PER_RESPONSE anchors for one
// publication gets the first batch a responding peer chose to include,
// never a cursor to continue with; see this milestone's own "Deliberately
// excluded" list in docs/Roadmap.md for why a cursor-based protocol stays
// future scope.
//
// Structural validity ONLY, exactly like this file's own
// isValidPublicationAnchorPeerMessage() already drew for ANNOUNCE: says
// nothing about whether a REQUEST's publicationId is one this replica is
// willing to answer, or whether a RESPONSE's anchors actually verify.
// Those are application/PublicationAnchorPeerExchange.js's own
// ingestion-boundary questions, asked one layer up — this module only
// ever describes the wrapper.
export const PublicationAnchorPeerMessageKind = Object.freeze({
    ANNOUNCE: 'ANNOUNCE',
    REQUEST: 'REQUEST',
    RESPONSE: 'RESPONSE'
});

export const MAX_ANCHORS_PER_RESPONSE = 64;

const MAX_PUBLICATION_ID_LENGTH = 512;

function isValidPublicationId(value) {
    return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_PUBLICATION_ID_LENGTH;
}

// `envelope` is a plain `PublicationAnchor.toJSON()` object — never
// validated or hydrated here. Structural/signature validity is entirely
// application/PublicationAnchorExchange.js#importAnchor()'s job, one layer
// up; this module only ever describes the OUTER gossip wrapper. No network
// metadata is ever added to `envelope` — the anchor an announcing replica
// signed is byte-for-byte the anchor a receiving replica verifies.
export function toPublicationAnchorAnnounceMessage(envelope) {
    if (!envelope || typeof envelope !== 'object') {
        throw new Error('toPublicationAnchorAnnounceMessage: envelope is required');
    }
    return { kind: PublicationAnchorPeerMessageKind.ANNOUNCE, envelope };
}

// "Give me anchors you know about this publicationId." Carries nothing
// else — no `receivedAt`, no requester identity, no cursor — the same
// bare-minimum ask application/PeerContentProtocol.js#
// toContentRequestMessage() already makes for a single content hash.
export function toPublicationAnchorRequestMessage(publicationId) {
    if (!isValidPublicationId(publicationId)) {
        throw new Error('toPublicationAnchorRequestMessage: a valid publicationId is required');
    }
    return { kind: PublicationAnchorPeerMessageKind.REQUEST, publicationId };
}

// `anchors` is an array of plain `PublicationAnchor.toJSON()` envelopes —
// each one exactly what a genuine ANNOUNCE would have carried, never
// wrapped with `receivedAt`, a verification outcome, or which peer this
// replica itself heard it from. See this file's own header on why that
// restraint matters here specifically: a RESPONSE is the one place a
// single message could otherwise smuggle a batch of local metadata across
// the wire, and it does not. Throws if `anchors` would exceed
// MAX_ANCHORS_PER_RESPONSE — the SENDING side's own half of this
// milestone's bounded-response defense; application/
// PublicationAnchorPeerExchange.js#_handleRequest() truncates rather than
// letting an oversized reply reach the wire at all.
export function toPublicationAnchorResponseMessage(publicationId, anchors) {
    if (!isValidPublicationId(publicationId)) {
        throw new Error('toPublicationAnchorResponseMessage: a valid publicationId is required');
    }
    if (!Array.isArray(anchors)) {
        throw new Error('toPublicationAnchorResponseMessage: anchors must be an array');
    }
    if (anchors.length > MAX_ANCHORS_PER_RESPONSE) {
        throw new Error(`toPublicationAnchorResponseMessage: anchors exceeds MAX_ANCHORS_PER_RESPONSE (${MAX_ANCHORS_PER_RESPONSE})`);
    }
    if (anchors.some((envelope) => !envelope || typeof envelope !== 'object')) {
        throw new Error('toPublicationAnchorResponseMessage: every anchor envelope must be an object');
    }
    return { kind: PublicationAnchorPeerMessageKind.RESPONSE, publicationId, anchors };
}

// Structural validity of the WRAPPER only — exactly like application/
// PublicationPeerProtocol.js#isValidPublicationPeerMessage()'s own
// restraint: says nothing about whether `envelope` (ANNOUNCE) or any
// entry of `anchors` (RESPONSE) is a well-formed PublicationAnchor, or
// whether it signature-verifies. Those are application/
// PublicationAnchorPeerExchange.js's own ingestion boundary questions,
// asked in order, one layer up. The RECEIVING side's own half of the
// bounded-response defense lives right here — a malicious or buggy peer
// that ignores toPublicationAnchorResponseMessage()'s own ceiling and
// hand-crafts an oversized RESPONSE is rejected before it is ever acted
// on, never trusted merely because it arrived.
export function isValidPublicationAnchorPeerMessage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    if (value.kind === PublicationAnchorPeerMessageKind.ANNOUNCE) {
        return Boolean(value.envelope) && typeof value.envelope === 'object';
    }
    if (value.kind === PublicationAnchorPeerMessageKind.REQUEST) {
        return isValidPublicationId(value.publicationId);
    }
    if (value.kind === PublicationAnchorPeerMessageKind.RESPONSE) {
        return isValidPublicationId(value.publicationId)
            && Array.isArray(value.anchors)
            && value.anchors.length <= MAX_ANCHORS_PER_RESPONSE
            && value.anchors.every((envelope) => Boolean(envelope) && typeof envelope === 'object');
    }
    return false;
}
