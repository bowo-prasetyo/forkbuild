// 0.7.3 — Peer Publication Exchange.
//
// The WIRE shape carried over peer/PeerMessageBus.js under this file's own
// DEFAULT_PROTOCOL — deliberately the same smallest-possible wrapper core/
// DeviceAuthorizationGossip.js and core/IdentityLifecycleGossip.js already
// established for gossiping a signed record between authenticated peers: a
// `kind` discriminator plus the record itself, completely unchanged from
// what it already was. There is no new signature type invented here and no
// new claim being made — an announced envelope is byte-for-byte the exact
// `DecentralizedPublication.toJSON()` shape application/PublicationExchange.js
// already knows how to import. See docs/Principles.md, "Propagation Carries
// A Record, It Does Not Mint A New Claim" (0.2.68).
//
// Only ONE message kind exists so far: ANNOUNCE — "here is a publication
// envelope I already hold." This milestone's own design conversation named
// two others, REQUEST ("send me what you have for this id/hash/kind") and
// RESPONSE (the reply to one), and deliberately declined to build either
// yet: announce/receive alone is already enough to prove a live transport
// under application/PublicationExchange.js works, and a pull-based protocol
// raises its own new questions (who may ask, how much, how often) this
// milestone has no reason to answer prematurely. Adding REQUEST/RESPONSE
// later means adding two new `kind` values here and two new handlers in
// application/PublicationPeerExchange.js — never touching ANNOUNCE's own
// shape, the same additive-only shape core/DeviceAuthorizationGossip.js's
// own GRANT/REVOCATION pair already set as precedent.
export const PublicationPeerMessageKind = Object.freeze({
    ANNOUNCE: 'ANNOUNCE'
});

// `envelope` is a plain `DecentralizedPublication.toJSON()` object — never
// validated or hydrated here. Structural/signature validity is entirely
// application/PublicationExchange.js#importPublication()'s job, one layer
// up; this module only ever describes the OUTER gossip wrapper.
export function toPublicationAnnounceMessage(envelope) {
    if (!envelope || typeof envelope !== 'object') {
        throw new Error('toPublicationAnnounceMessage: envelope is required');
    }
    return { kind: PublicationPeerMessageKind.ANNOUNCE, envelope };
}

// Structural validity of the WRAPPER only — exactly like core/
// DeviceAuthorizationGossip.js's own isValidDeviceAuthorizationGossipMessage()
// restraint: says nothing about whether `envelope` is a well-formed
// DecentralizedPublication, whether its signature verifies, or whether this
// replica already knows about it. Those are application/
// PublicationPeerExchange.js's own ingestion boundary questions, asked in
// order, one layer up.
export function isValidPublicationPeerMessage(value) {
    if (!value || typeof value !== 'object') {
        return false;
    }
    if (value.kind !== PublicationPeerMessageKind.ANNOUNCE) {
        return false;
    }
    return Boolean(value.envelope) && typeof value.envelope === 'object';
}
