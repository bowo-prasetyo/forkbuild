import { createId } from './createId.js';
import { Position } from './Position.js';
import { SpatialBounds } from './SpatialBounds.js';
import { Signature, SignatureType } from './Signature.js';
import { computeContentHash } from '../serializer/contentHash.js';

// A publishable spatial record (0.2.10).
//
// As of 0.2.16 the record gains its trust layer:
//
//   ownerIdentity — the SigningIdentity that owns this placement
//   signature     — that identity's signature over the canonical
//                   signing envelope of THIS revision
//
// The invariant:
//
//   A placement revision is authoritative only when its content hash
//   AND its authorization signature are both valid.
//
// contentHash keeps its 0.2.10 definition EXACTLY (same fields, same
// order) — it answers "what is this object". The signature is an
// attestation layered on top — it answers "who authorized it" — and
// covers a canonical envelope that INCLUDES the contentHash, binding
// identity -> record -> content in one chain. Both fields are optional
// so pre-0.2.16 records remain valid ("unsigned legacy" policy).
export class PlacementRecord {
    constructor({
        placementId = createId(),
        publicationId,
        owner = null,
        position = new Position(),
        rotation = { x: 0, y: 0, z: 0 },
        scale = { x: 1, y: 1, z: 1 },
        bounds = null,
        revision = 1,
        contentHash = null,
        createdAt = new Date(),
        updatedAt = new Date(),
        ownerIdentity = null,
        signature = null
    } = {}) {
        if (!publicationId) {
            throw new Error('PlacementRecord requires a publicationId');
        }
        this._placementId = placementId;
        this._publicationId = publicationId;
        this._owner = owner;
        this._position = position instanceof Position
            ? position
            : new Position(position.x || 0, position.y || 0, position.z || 0);
        this._rotation = { ...rotation };
        this._scale = { ...scale };
        this._revision = revision;
        this._contentHash = contentHash;
        this._createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
        this._updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
        this._bounds = bounds instanceof SpatialBounds ? bounds : (bounds ? SpatialBounds.fromJSON(bounds) : null);
        this._ownerIdentity = ownerIdentity ? { ...ownerIdentity } : null;
        this._signature = signature instanceof Signature ? signature : Signature.fromJSON(signature);
    }

    get placementId() { return this._placementId; }
    get publicationId() { return this._publicationId; }
    get owner() { return this._owner; }
    get position() { return this._position; }
    get rotation() { return { ...this._rotation }; }
    get scale() { return { ...this._scale; }; }
    get bounds() { return this._bounds; }
    get revision() { return this._revision; }
    get contentHash() { return this._contentHash; }
    get createdAt() { return this._createdAt; }
    get updatedAt() { return this._updatedAt; }
    get ownerIdentity() { return this._ownerIdentity ? { ...this._ownerIdentity } : null; }
    get signature() { return this._signature; }

    // UNCHANGED since 0.2.10 — same fields, same order. This is what
    // keeps every already-stored record verifiable.
    computeContentHash() {
        const canonical = JSON.stringify({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            position: this._position.toJSON(),
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds ? this._bounds.toJSON() : null,
            revision: this._revision,
            createdAt: this._createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString()
        });
        return computeContentHash(canonical);
    }

    verifyIntegrity() {
        if (!this._contentHash) {
            return false;
        }
        return this.computeContentHash() === this._contentHash;
    }

    // New revision: contentHash and signature are CLEARED — a new
    // revision is a new immutable object that must be re-hashed and
    // re-signed. ownerIdentity carries over: ownership of a placement
    // persists across its revisions.
    withPosition(newPosition) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            position: newPosition,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision + 1,
            contentHash: null,
            createdAt: this._createdAt,
            updatedAt: new Date(),
            ownerIdentity: this._ownerIdentity,
            signature: null
        });
    }

    // Setting the owner claim invalidates any existing signature.
    withOwnerIdentity(ownerIdentity) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            position: this._position,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision,
            contentHash: this._contentHash,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            ownerIdentity,
            signature: null
        });
    }

    withSignature(signature) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            position: this._position,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision,
            contentHash: this._contentHash,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            ownerIdentity: this._ownerIdentity,
            signature
        });
    }

    // The canonical signing descriptor (0.2.16). The payload includes
    // the contentHash — so the signature binds identity -> revision ->
    // exact record content.
    getSigningDescriptor() {
        return {
            type: SignatureType.PLACEMENT_RECORD,
            id: this._placementId,
            revision: this._revision,
            payload: {
                placementId: this._placementId,
                publicationId: this._publicationId,
                owner: this._owner,
                ownerIdentity: this._ownerIdentity,
                position: this._position.toJSON(),
                rotation: { ...this._rotation },
                scale: { ...this._scale },
                bounds: this._bounds ? this._bounds.toJSON() : null,
                revision: this._revision,
                contentHash: this._contentHash,
                createdAt: this._createdAt.toISOString(),
                updatedAt: this._updatedAt.toISOString()
            }
        };
    }

    toJSON() {
        return {
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            position: this._position.toJSON(),
            rotation: { ...this._rotation },
            scale: { ...this._scale },
            bounds: this._bounds ? this._bounds.toJSON() : null,
            revision: this._revision,
            contentHash: this._contentHash,
            createdAt: this._createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString(),
            ownerIdentity: this._ownerIdentity ? { ...this._ownerIdentity } : null,
            signature: this._signature ? this._signature.toJSON() : null
        };
    }

    static fromJSON(json) {
        return new PlacementRecord({
            placementId: json.placementId,
            publicationId: json.publicationId,
            owner: json.owner,
            position: Position.fromJSON(json.position),
            rotation: json.rotation,
            scale: json.scale,
            bounds: json.bounds ? SpatialBounds.fromJSON(json.bounds) : null,
            revision: json.revision,
            contentHash: json.contentHash,
            createdAt: new Date(json.createdAt),
            updatedAt: new Date(json.updatedAt),
            ownerIdentity: json.ownerIdentity || null,
            signature: json.signature || null
        });
    }
}
