import { createId } from '../core/createId.js';

// 0.2.51 — a portable SIGNALING payload, and nothing more. Answers "here is
// the WebRTC session description and candidates needed to open a direct
// channel to me" — never "this is who I am." Structurally the transport-
// layer sibling of peer/PeerInvitation.js: both are deliberately UNSIGNED,
// deliberately opaque one layer up (a PeerInvitation's `endpoint` can BE a
// serialized PeerConnectionOffer's JSON — peer/WebRtcPeerConnectionProvider.js
// treats it exactly the same opaque string peer/LocalPeerConnectionProvider.js
// already does, so discovery never needs to change shape or know a real
// transport is involved), and deliberately time-bounded so a captured offer
// cannot be replayed indefinitely into a stale RTCPeerConnection. See docs/
// Principles.md, "A Signaling Payload Is Not An Identity Proof."
//
// `connectionId` here is not a bookkeeping detail — it is the SAME value
// that becomes both ends' eventual peer/PeerConnection.js#connectionId
// (peer/WebRtcPeerConnection.js's answerer role adopts it verbatim from the
// offer it was built from), which in turn is the `sessionNonce` every
// peer/PeerAuthenticationSession.js message is bound to. Minting it here,
// once, on the offering side, is what lets both ends of a WebRTC connection
// agree on one connectionId without a third party ever assigning one.
export const PEER_CONNECTION_OFFER_FORMAT_VERSION = 1;

const DEFAULT_SIGNAL_TTL_MS = 5 * 60 * 1000; // 5 minutes — signaling is short-lived, unlike a PeerInvitation's own longer rendezvous window

export class PeerConnectionOffer {
    constructor({ formatVersion = PEER_CONNECTION_OFFER_FORMAT_VERSION, connectionId, sdp, iceCandidates = [], createdAt, expiresAt } = {}) {
        if (formatVersion !== PEER_CONNECTION_OFFER_FORMAT_VERSION) {
            throw new Error(`PeerConnectionOffer: unsupported formatVersion ${formatVersion}`);
        }
        if (!connectionId || typeof connectionId !== 'string') {
            throw new Error('PeerConnectionOffer: connectionId is required');
        }
        if (!sdp || typeof sdp !== 'string') {
            throw new Error('PeerConnectionOffer: sdp is required');
        }
        if (!Array.isArray(iceCandidates)) {
            throw new Error('PeerConnectionOffer: iceCandidates must be an array');
        }
        const createdAtDate = new Date(createdAt);
        const expiresAtDate = new Date(expiresAt);
        if (!createdAt || Number.isNaN(createdAtDate.getTime())) {
            throw new Error('PeerConnectionOffer: createdAt is required and must be a valid date');
        }
        if (!expiresAt || Number.isNaN(expiresAtDate.getTime())) {
            throw new Error('PeerConnectionOffer: expiresAt is required and must be a valid date');
        }
        if (expiresAtDate.getTime() <= createdAtDate.getTime()) {
            throw new Error('PeerConnectionOffer: expiresAt must be after createdAt');
        }

        this._formatVersion = formatVersion;
        this._connectionId = connectionId;
        this._sdp = sdp;
        this._iceCandidates = iceCandidates.slice();
        this._createdAt = createdAtDate;
        this._expiresAt = expiresAtDate;
    }

    get formatVersion() { return this._formatVersion; }
    get connectionId() { return this._connectionId; }
    get sdp() { return this._sdp; }
    get iceCandidates() { return this._iceCandidates.slice(); }
    get createdAt() { return this._createdAt; }
    get expiresAt() { return this._expiresAt; }

    isExpired(now = new Date()) {
        return now.getTime() >= this._expiresAt.getTime();
    }

    toJSON() {
        return {
            formatVersion: this._formatVersion,
            connectionId: this._connectionId,
            sdp: this._sdp,
            iceCandidates: this._iceCandidates,
            createdAt: this._createdAt.toISOString(),
            expiresAt: this._expiresAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            throw new Error('PeerConnectionOffer: cannot parse offer from a non-object value');
        }
        return new PeerConnectionOffer(json);
    }

    // The offering side's own "create." `connectionId` defaults to a fresh
    // id here rather than being left to the caller, because this IS the
    // moment a connectionId first comes into existence for a WebRTC
    // connection — see this file's own header.
    static create({ connectionId = createId(), sdp, iceCandidates = [], ttlMs = DEFAULT_SIGNAL_TTL_MS, now = new Date() } = {}) {
        const expiresAt = new Date(now.getTime() + ttlMs);
        return new PeerConnectionOffer({
            connectionId,
            sdp,
            iceCandidates,
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString()
        });
    }
}
