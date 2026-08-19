import * as Ed25519 from '../identity/Ed25519.js';

// 0.2.60 — Friendship Revocation, Blocking & Privacy Withdrawal.
//
// A PeerBlockRecord is this device's own, entirely LOCAL refusal to
// keep exchanging avatar-social traffic (or friendship-protocol
// messages) with one identity. See core/FriendshipAction.js's own
// header on why BLOCK is deliberately NOT a `core/FriendshipAdvertisement.js`
// action: a friendship action is signed evidence exchanged because
// mutual consent needs proving to somebody else; a block proves
// nothing to anyone and is never sent anywhere. This class carries no
// `signature` field at all, on purpose — there is no wire shape here
// to sign, because there is no wire.
//
// Deliberately mirrors core/PeerRelationship.js's own shape almost
// exactly (identityId/publicKey/algorithm/createdAt, the same
// self-consistency guarantee, the same immutability) because the two
// classes answer structurally IDENTICAL questions — "does this local
// owner have a durable, unilateral opinion about this identity?" — one
// for remembering, one for refusing. See docs/Principles.md,
// "Friendship Is Mutual Relationship State; Blocking Is A Unilateral
// Local Decision" (0.2.60): blocking and friendship are independent
// axes, not two values of one enum — `application/FriendRelationshipUseCase.js`
// and `application/PeerBlockUseCase.js` are two entirely separate
// stores, so `FRIEND + BLOCKED` is a perfectly ordinary, simultaneously
// true combination ("we were friends, but I no longer want to hear
// from this identity"), never a contradiction either store has to
// reconcile.
//
// A PeerBlockRecord's `identityId`/`publicKey` never need a FRESH,
// live-handshake proof the way `application/PeerRelationshipUseCase.js#rememberPeer()`
// requires of a `peer/PeerIdentity.js` — see `fromIdentity()` below.
// Blocking is available from any identity this device has EVER
// authenticated a key for (a currently-connected peer, a Known Peer, a
// Friend), whether or not that identity is online right now — "Alice
// can block a friend who is offline" is a real, expected case (see
// docs/Principles.md), unlike remembering, which only ever happens at
// the moment of a live authentication.
export class PeerBlockRecord {
    constructor({
        identityId,
        publicKey,
        algorithm = 'Ed25519',
        createdAt = new Date()
    } = {}) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('PeerBlockRecord: identityId is required');
        }
        if (!publicKey || typeof publicKey !== 'string') {
            throw new Error('PeerBlockRecord: publicKey is required');
        }
        if (Ed25519.publicKeyToDidKey(Ed25519.hexToBytes(publicKey)) !== identityId) {
            throw new Error('PeerBlockRecord: identityId does not match publicKey');
        }
        this._identityId = identityId;
        this._publicKey = publicKey;
        this._algorithm = algorithm;
        this._createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
    }

    get identityId() { return this._identityId; }
    get publicKey() { return this._publicKey; }
    get algorithm() { return this._algorithm; }
    get createdAt() { return this._createdAt; }

    toJSON() {
        return {
            identityId: this._identityId,
            publicKey: this._publicKey,
            algorithm: this._algorithm,
            createdAt: this._createdAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        return new PeerBlockRecord(json);
    }

    // The one way a brand-new PeerBlockRecord is meant to come into
    // existence outside of fromJSON() — see application/PeerBlockUseCase.js#block(),
    // the sole caller. Deliberately a plain, DUCK-TYPED shape check
    // only (identityId/publicKey strings, verified self-consistent by
    // the constructor above) — never an `instanceof PeerIdentity`
    // requirement the way `application/PeerRelationshipUseCase.js#rememberPeer()`
    // insists on. `identity` here is commonly a live, just-authenticated
    // `peer/PeerIdentity.js`, but is JUST AS OFTEN an already-persisted
    // `core/PeerRelationship.js`/`core/FriendshipRecord.js`'s own
    // identityId/publicKey/algorithm — both are equally valid sources
    // because, by the time either exists, its publicKey has ALREADY
    // been proven against that identityId by a real handshake at some
    // point in the past (see those two classes' own headers); blocking
    // an already-known identity is reusing evidence this device already
    // holds, never accepting a fresh, unauthenticated claim.
    static fromIdentity(identity, { now = new Date() } = {}) {
        if (!identity || typeof identity.identityId !== 'string' || typeof identity.publicKey !== 'string') {
            throw new Error('PeerBlockRecord.fromIdentity: an identity with identityId/publicKey is required');
        }
        return new PeerBlockRecord({
            identityId: identity.identityId,
            publicKey: identity.publicKey,
            algorithm: identity.algorithm,
            createdAt: now
        });
    }
}
