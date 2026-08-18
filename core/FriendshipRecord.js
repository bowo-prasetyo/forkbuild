import * as Ed25519 from '../identity/Ed25519.js';
import { FriendshipState, deriveFriendshipState } from './FriendshipState.js';

// 0.2.57 — Decentralized Friend Relationships & Mutual Consent.
//
// A FriendshipRecord is this device's own durable half of one
// relationship with one other identity — the direct social-consent
// counterpart to core/PeerRelationship.js's purely unilateral "I know
// this identity" record (0.2.56). See docs/Principles.md, "Knowing Is
// Not Befriending" (0.2.56) and "Friendship Is Mutual Consent, Never A
// Unilateral Claim" (0.2.57): a PeerRelationship needs nothing from the
// other side to exist; a FriendshipRecord's `status` can only ever
// reach FRIEND once BOTH directions carry a signed action.
//
// `outgoingAction`/`incomingAction` are each either `null` or a plain,
// JSON-shaped `core/FriendshipAdvertisement.js` object (including its
// `signature`) — never a second, re-derived summary of one. Keeping the
// actual signed advertisement, not just a status flag, means this
// record IS its own evidence: `outgoingAction` is what THIS device can
// show as proof of what it did, and `incomingAction` is what the OTHER
// identity signed, already verified against their own key by
// application/FriendRelationshipUseCase.js BEFORE it is ever stored
// here (see that file's own header) — this class never re-verifies
// anything, the same "core/ trusts its caller's boundary check" posture
// core/PeerRelationship.js's own fromPeerIdentity() already documents.
//
// `status` is ALWAYS derived fresh via core/FriendshipState.js's
// deriveFriendshipState(), never stored as its own field — the same
// "computed, not stored" discipline core/PeerRelationshipStatus.js's
// own header already applies to KNOWN, extended here to a vocabulary
// that actually has more than one value to get out of sync.
//
// Immutable, like core/PeerRelationship.js and core/AvatarProfile.js —
// a relationship's recorded actions change rarely and deliberately (one
// more signed action arrives, in one direction), never in place.
export class FriendshipRecord {
    constructor({
        identityId,
        publicKey,
        algorithm = 'Ed25519',
        outgoingAction = null,
        incomingAction = null,
        createdAt = new Date(),
        updatedAt = new Date()
    } = {}) {
        if (!identityId || typeof identityId !== 'string') {
            throw new Error('FriendshipRecord: identityId is required');
        }
        if (!publicKey || typeof publicKey !== 'string') {
            throw new Error('FriendshipRecord: publicKey is required');
        }
        if (Ed25519.publicKeyToDidKey(Ed25519.hexToBytes(publicKey)) !== identityId) {
            throw new Error('FriendshipRecord: identityId does not match publicKey');
        }
        this._identityId = identityId;
        this._publicKey = publicKey;
        this._algorithm = algorithm;
        this._outgoingAction = outgoingAction || null;
        this._incomingAction = incomingAction || null;
        this._createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
        this._updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
    }

    get identityId() { return this._identityId; }
    get publicKey() { return this._publicKey; }
    get algorithm() { return this._algorithm; }
    get outgoingAction() { return this._outgoingAction; }
    get incomingAction() { return this._incomingAction; }
    get createdAt() { return this._createdAt; }
    get updatedAt() { return this._updatedAt; }

    get status() {
        return deriveFriendshipState({ outgoing: this._outgoingAction, incoming: this._incomingAction });
    }

    get isFriend() { return this.status === FriendshipState.FRIEND; }

    // Records a fresh action THIS device authored and signed (a
    // REQUEST it is sending, or an ACCEPT it is sending in answer to
    // an existing incomingAction). Never touches incomingAction.
    withOutgoingAction(advertisement, updatedAt = new Date()) {
        return new FriendshipRecord({ ...this._fields(), outgoingAction: advertisement, updatedAt });
    }

    // Records a fresh action the OTHER identity authored and signed,
    // ALREADY VERIFIED by the caller (see this class's own header).
    // Never touches outgoingAction.
    withIncomingAction(advertisement, updatedAt = new Date()) {
        return new FriendshipRecord({ ...this._fields(), incomingAction: advertisement, updatedAt });
    }

    _fields() {
        return {
            identityId: this._identityId,
            publicKey: this._publicKey,
            algorithm: this._algorithm,
            outgoingAction: this._outgoingAction,
            incomingAction: this._incomingAction,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt
        };
    }

    toJSON() {
        return {
            identityId: this._identityId,
            publicKey: this._publicKey,
            algorithm: this._algorithm,
            outgoingAction: this._outgoingAction,
            incomingAction: this._incomingAction,
            createdAt: this._createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString()
        };
    }

    static fromJSON(json) {
        if (!json || typeof json !== 'object') {
            return null;
        }
        return new FriendshipRecord(json);
    }

    // The one way a brand-new FriendshipRecord is meant to come into
    // existence — mirrors core/PeerRelationship.js#fromPeerIdentity()'s
    // own shape exactly: a plain SHAPE check only (identityId/publicKey
    // strings, verified self-consistent by the constructor above),
    // never itself the security boundary. The REAL guarantee — that
    // `peerIdentity` came from a completed peer/
    // PeerAuthenticationSession.js handshake — is enforced one layer
    // up, by application/FriendRelationshipUseCase.js, the only caller.
    static fromPeerIdentity(peerIdentity, { now = new Date() } = {}) {
        if (!peerIdentity || typeof peerIdentity.identityId !== 'string' || typeof peerIdentity.publicKey !== 'string') {
            throw new Error('FriendshipRecord.fromPeerIdentity: a verified PeerIdentity is required');
        }
        return new FriendshipRecord({
            identityId: peerIdentity.identityId,
            publicKey: peerIdentity.publicKey,
            algorithm: peerIdentity.algorithm,
            createdAt: now,
            updatedAt: now
        });
    }
}
