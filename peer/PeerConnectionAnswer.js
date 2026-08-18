// 0.2.51 — the RESPONSE half of peer/PeerConnectionOffer.js's signaling
// handoff. Answers "here is the session description and candidates needed
// to complete the connection YOU offered" — carries the offer's own
// `connectionId` back verbatim rather than minting a new one, the same way
// a PROOF message (core/PeerAuthenticationEnvelope.js) carries back the
// challenge it is answering rather than leaving that implicit: a receiver
// can then check this answer is actually completing the specific offer it
// made, not merely trusting the responder's say-so about which round this
// is. Deliberately unsigned, deliberately opaque, deliberately time-bounded
// — see peer/PeerConnectionOffer.js's own header and docs/Principles.md, "A
// Signaling Payload Is Not An Identity Proof."
export const PEER_CONNECTION_ANSWER_FORMAT_VERSION = 1;

const DEFAULT_SIGNAL_TTL_MS = 5 * 60 * 1000;

export class PeerConnectionAnswer {
    constructor({ formatVersion = PEER_CONNECTION_ANSWER_FORMAT_VERSION, connectionId, sdp, iceCandidates = [], createdAt, expiresAt } = {}) {
        if (formatVersion !== PEER_CONNECTION_ANSWER_FORMAT_VERSION) {
            throw new Error(`PeerConnectionAnswer: unsupported formatVersion ${formatVersion}`);
        }
        if (!connectionId || typeof connectionId !== 'string') {
            throw new Error('PeerConnectionAnswer: connectionId is required');
        }
        if (!sdp || typeof sdp !== 'string') {
            throw new Error('PeerConnectionAnswer: sdp is required');
        }
        if (!Array.isArray(iceCandidates)) {
            throw new Error('PeerConnectionAnswer: iceCandidates must be an array');
        }
        const createdAtDate = new Date(createdAt);
        const expiresAtDate = new Date(expiresAt);
        if (!createdAt || Number.isNaN(createdAtDate.getTime())) {
            throw new Error('PeerConnectionAnswer: createdAt is required and must be a valid date');
        }
        if (!expiresAt || Number.isNaN(expiresAtDate.getTime())) {
            throw new Error('PeerConnectionAnswer: expiresAt is required and must be a valid date');
        }
        if (expiresAtDate.getTime() <= createdAtDate.getTime()) {
            throw new Error('PeerConnectionAnswer: expiresAt must be after createdAt');
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
            throw new Error('PeerConnectionAnswer: cannot parse answer from a non-object value');
        }
        return new PeerConnectionAnswer(json);
    }

    // The answering side's own "create" — `connectionId` MUST be supplied
    // (the offer's own), never generated fresh here; see this file's own
    // header for why.
    static create({ connectionId, sdp, iceCandidates = [], ttlMs = DEFAULT_SIGNAL_TTL_MS, now = new Date() } = {}) {
        const expiresAt = new Date(now.getTime() + ttlMs);
        return new PeerConnectionAnswer({
            connectionId,
            sdp,
            iceCandidates,
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString()
        });
    }
}
