import { createId } from '../core/createId.js';

// 0.2.50 — a portable RENDEZVOUS HINT, nothing more. Answers "where might
// Bob be reachable, and roughly how long is this worth trying" — never "this
// is Bob." See docs/Principles.md, "An Invitation Is A Rendezvous Hint, Never
// A Credential": an attacker who copies an invitation verbatim gains only a
// candidate address to attempt a connection to. They do not gain Bob's
// identity, because nothing about a PeerInvitation is ever checked by
// peer/PeerAuthenticationSession.js's handshake — that handshake proves
// possession of a private key, over a live connection, completely
// independent of how the two ends found each other's address.
//
// Deliberately NOT signed. Signing would suggest the payload is trustworthy
// evidence of something — exactly the impression this milestone's design
// explicitly rejects. `endpoint` is opaque here on purpose, the same
// "nothing above this interface needs to know which transport this is"
// posture peer/PeerConnectionProvider.js already documents for
// `remoteAddress` — today it is a LocalPeerConnectionProvider address,
// tomorrow it could be a signaling-server-issued id, and a PeerInvitation
// never needs to change shape either way. `identityHint`, when present, is
// exactly that — a HINT the issuer typed in, never authoritative; see
// peer/PeerDiscoveryRecord.js for why it travels no further trusted than
// this.
export const PEER_INVITATION_FORMAT_VERSION = 1;

const DEFAULT_INVITATION_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class PeerInvitation {
    constructor({ formatVersion = PEER_INVITATION_FORMAT_VERSION, invitationId, endpoint, identityHint = null, createdAt, expiresAt } = {}) {
        if (formatVersion !== PEER_INVITATION_FORMAT_VERSION) {
            throw new Error(`PeerInvitation: unsupported formatVersion ${formatVersion}`);
        }
        if (!invitationId || typeof invitationId !== 'string') {
            throw new Error('PeerInvitation: invitationId is required');
        }
        if (!endpoint || typeof endpoint !== 'string') {
            throw new Error('PeerInvitation: endpoint is required');
        }
        if (identityHint !== null && (typeof identityHint !== 'string' || !identityHint)) {
            throw new Error('PeerInvitation: identityHint, if present, must be a non-empty string');
        }
        const createdAtDate = new Date(createdAt);
        const expiresAtDate = new Date(expiresAt);
        if (!createdAt || Number.isNaN(createdAtDate.getTime())) {
            throw new Error('PeerInvitation: createdAt is required and must be a valid date');
        }
        if (!expiresAt || Number.isNaN(expiresAtDate.getTime())) {
            throw new Error('PeerInvitation: expiresAt is required and must be a valid date');
        }
        if (expiresAtDate.getTime() <= createdAtDate.getTime()) {
            throw new Error('PeerInvitation: expiresAt must be after createdAt');
        }

        this._formatVersion = formatVersion;
        this._invitationId = invitationId;
        this._endpoint = endpoint;
        this._identityHint = identityHint;
        this._createdAt = createdAtDate;
        this._expiresAt = expiresAtDate;
    }

    get formatVersion() { return this._formatVersion; }
    get invitationId() { return this._invitationId; }
    get endpoint() { return this._endpoint; }
    get identityHint() { return this._identityHint; }
    get createdAt() { return this._createdAt; }
    get expiresAt() { return this._expiresAt; }

    isExpired(now = new Date()) {
        return now.getTime() >= this._expiresAt.getTime();
    }

    toJSON() {
        return {
            formatVersion: this._formatVersion,
            invitationId: this._invitationId,
            endpoint: this._endpoint,
            identityHint: this._identityHint,
            createdAt: this._createdAt.toISOString(),
            expiresAt: this._expiresAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            throw new Error('PeerInvitation: cannot parse invitation from a non-object value');
        }
        return new PeerInvitation(json);
    }

    // Alice's side of "create invitation." `identityHint` is whatever the
    // caller supplies — application/DiscoverPeersUseCase.js supplies the
    // issuer's OWN identityId when one is currently authenticated, but this
    // constructor has no opinion about that; it is pure data assembly.
    static create({ endpoint, identityHint = null, ttlMs = DEFAULT_INVITATION_TTL_MS, now = new Date() } = {}) {
        const expiresAt = new Date(now.getTime() + ttlMs);
        return new PeerInvitation({
            invitationId: createId(),
            endpoint,
            identityHint,
            createdAt: now.toISOString(),
            expiresAt: expiresAt.toISOString()
        });
    }
}
