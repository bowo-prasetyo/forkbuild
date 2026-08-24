// 0.8.4 — External Anchor Publication Over Peers.
//
// The WIRE shape carried over peer/PeerMessageBus.js under this file's own
// DEFAULT_PROTOCOL — the identical smallest-possible wrapper application/
// PublicationPeerProtocol.js already established one domain over: a `kind`
// discriminator plus the record itself, unchanged. There is no new
// signature type invented here and no new claim being made — an announced
// envelope is byte-for-byte the exact `PublicationAnchor.toJSON()` shape
// application/PublicationAnchorExchange.js already knows how to import.
// See docs/Principles.md, "Propagation Carries A Record, It Does Not Mint
// A New Claim" (0.2.68), extended here from a publication envelope to an
// anchor.
//
// Only ONE message kind exists so far: ANNOUNCE — "here is an anchor claim
// I already hold." Exactly application/PublicationPeerProtocol.js's own
// restraint, for the identical reason: announce/receive alone is already
// enough to prove anchors can propagate over a live authenticated peer;
// REQUEST/RESPONSE (historical anchor discovery for a newly joined
// replica) is deliberately left for its own future milestone — see
// docs/Roadmap.md, 0.8.4, "Deliberately excluded."
export const PublicationAnchorPeerMessageKind = Object.freeze({
    ANNOUNCE: 'ANNOUNCE'
});

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

// Structural validity of the WRAPPER only — exactly like application/
// PublicationPeerProtocol.js#isValidPublicationPeerMessage()'s own
// restraint: says nothing about whether `envelope` is a well-formed
// PublicationAnchor, whether its signature verifies, or whether this
// replica already knows about it. Those are application/
// PublicationAnchorPeerExchange.js's own ingestion boundary questions,
// asked in order, one layer up.
export function isValidPublicationAnchorPeerMessage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    if (value.kind !== PublicationAnchorPeerMessageKind.ANNOUNCE) {
        return false;
    }
    return Boolean(value.envelope) && typeof value.envelope === 'object';
}
