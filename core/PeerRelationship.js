import * as Ed25519 from '../identity/Ed25519.js';
import { PeerRelationshipStatus, isValidPeerRelationshipStatus } from './PeerRelationshipStatus.js';

// 0.2.56 — Persistent Peer Relationships.
//
// A PeerRelationship is the durable half of the split this milestone
// draws between three previously-conflated ideas:
//
//   peer/PeerIdentity.js        "Which key does the other end of THIS
//                                connection currently, provably,
//                                control?" — always scoped to one live
//                                connection, gone the moment it closes
//                                (see that file's own header).
//   PeerRelationship (THIS)     "Have I, on some past occasion, proven
//                                that identity and chosen to remember
//                                it?" — survives every disconnect, a
//                                page reload, and the app restarting.
//   ConnectedPeerRegistry       "Is that identity connected RIGHT NOW?"
//                                — answered fresh, every time, entirely
//                                independent of whether this class has
//                                a record for it at all.
//
// A PeerRelationship therefore carries an identity, never a
// connection. See docs/Principles.md, "A Peer Relationship Remembers
// An Identity, Never An Endpoint" (0.2.56): there is deliberately no
// endpoint, connectionId, session nonce, or transport detail anywhere
// on this class — every one of those is exactly as ephemeral as the
// peer/PeerConnection.js they came from, and persisting any of them
// here would tempt a caller into skipping a fresh handshake on
// reconnect, which application/PeerRelationshipUseCase.js's own
// header explains this milestone never allows.
//
// `identityId`/`publicKey` reuse the EXACT self-consistency guarantee
// peer/PeerIdentity.js already established (the did:key IS derived
// from the public key, so the two can never be forged independently
// of each other) — a PeerRelationship is only ever constructed FROM a
// verified PeerIdentity (see PeerRelationship.fromPeerIdentity below
// and application/PeerRelationshipUseCase.js#rememberPeer), never from
// a bare identityId string or an invitation's unauthenticated
// identityHint.
//
// Immutable, like core/AvatarProfile.js and core/PresenceVisibilityPolicy.js
// — a relationship changes rarely and deliberately (an alias edit, a
// fresh authentication), never in place.
export class PeerRelationship {
    constructor({
        identityId,
        publicKey,
        algorithm = 'Ed25519',
        alias = null,
        status = PeerRelationshipStatus.KNOWN,
        createdAt = new Date(),
        lastAuthenticatedAt = new Date()
    } = {}) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('PeerRelationship: identityId is required');
        }
        if (!publicKey || typeof publicKey !== 'string') {
            throw new Error('PeerRelationship: publicKey is required');
        }
        if (Ed25519.publicKeyToDidKey(Ed25519.hexToBytes(publicKey)) !== identityId) {
            throw new Error('PeerRelationship: identityId does not match publicKey');
        }
        if (!isValidPeerRelationshipStatus(status)) {
            throw new Error(`PeerRelationship: unknown status "${status}"`);
        }
        this._identityId = identityId;
        this._publicKey = publicKey;
        this._algorithm = algorithm;
        this._alias = normalizeAlias(alias);
        this._status = status;
        this._createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
        this._lastAuthenticatedAt = lastAuthenticatedAt instanceof Date ? lastAuthenticatedAt : new Date(lastAuthenticatedAt);
    }

    get identityId() { return this._identityId; }
    get publicKey() { return this._publicKey; }
    get algorithm() { return this._algorithm; }
    get alias() { return this._alias; }
    get status() { return this._status; }
    get createdAt() { return this._createdAt; }
    get lastAuthenticatedAt() { return this._lastAuthenticatedAt; }

    withAlias(alias) {
        return new PeerRelationship({ ...this._fields(), alias });
    }

    // Called on every occasion this identity is proven again over a
    // brand-new connection — see application/
    // PeerRelationshipUseCase.js#noteAuthenticated. Bumps ONLY the
    // timestamp; a fresh authentication is a fact about WHEN, never a
    // reason to change WHO this relationship is with or what it's
    // called.
    withLastAuthenticatedAt(lastAuthenticatedAt = new Date()) {
        return new PeerRelationship({ ...this._fields(), lastAuthenticatedAt });
    }

    _fields() {
        return {
            identityId: this._identityId,
            publicKey: this._publicKey,
            algorithm: this._algorithm,
            alias: this._alias,
            status: this._status,
            createdAt: this._createdAt,
            lastAuthenticatedAt: this._lastAuthenticatedAt
        };
    }

    toJSON() {
        return {
            identityId: this._identityId,
            publicKey: this._publicKey,
            algorithm: this._algorithm,
            alias: this._alias,
            status: this._status,
            createdAt: this._createdAt.toISOString(),
            lastAuthenticatedAt: this._lastAuthenticatedAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        return new PeerRelationship(json);
    }

    // The one and only way a PeerRelationship is meant to come into
    // existence outside of fromJSON() — see this class's own header
    // and application/PeerRelationshipUseCase.js#rememberPeer, which is
    // the sole caller. This is a plain SHAPE check only (identityId/
    // publicKey strings, verified self-consistent by the constructor
    // above) — core/ never imports peer/PeerIdentity.js, the same
    // layering every other core/*.js file already keeps. The REAL
    // guarantee — that `peerIdentity` came from a completed peer/
    // PeerAuthenticationSession.js handshake, never from an
    // invitation's identityHint or any other unauthenticated claim —
    // is enforced one layer up, by rememberPeer()'s own `instanceof
    // PeerIdentity` check, which is why rememberPeer(), not this
    // method, is the boundary application/PeerRelationshipUseCase.js's
    // own header calls out.
    static fromPeerIdentity(peerIdentity, { alias = null, now = new Date() } = {}) {
        if (!peerIdentity || typeof peerIdentity.identityId !== 'string' || typeof peerIdentity.publicKey !== 'string') {
            throw new Error('PeerRelationship.fromPeerIdentity: a verified PeerIdentity is required');
        }
        return new PeerRelationship({
            identityId: peerIdentity.identityId,
            publicKey: peerIdentity.publicKey,
            algorithm: peerIdentity.algorithm,
            alias,
            createdAt: now,
            lastAuthenticatedAt: now
        });
    }
}

function normalizeAlias(alias) {
    return alias && typeof alias === 'string' && alias.trim() ? alias.trim() : null;
}
