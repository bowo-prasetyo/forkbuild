import { createId } from './createId.js';
import { Position } from './Position.js';
import { SpatialBounds } from './SpatialBounds.js';
import { Signature, SignatureType } from './Signature.js';
import { computeContentHash } from '../serializer/contentHash.js';

// A publishable spatial record (0.2.10).
//
// As of 0.2.16 the record gains its trust layer:
//   ownerIdentity — the identity that owns this placement
//   signature     — that identity's signature over the canonical signing
//                   envelope of THIS revision
//
// contentHash keeps its 0.2.10 definition EXACTLY (same fields, same
// order) — it answers "what is this object". The signature is an
// attestation layered on top — it answers "who authorized it". Both new
// fields are optional so pre-0.2.16 records remain valid ("unsigned
// legacy" policy).
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
        this._bounds = bounds instanceof SpatialBounds
            ? bounds
            : (bounds ? SpatialBounds.fromJSON(bounds) : null);
        this._ownerIdentity = ownerIdentity;
        this._signature = signature
            ? (signature instanceof Signature ? signature : Signature.fromJSON(signature))
            : null;
    }

    get placementId() { return this._placementId; }
    get publicationId() { return this._publicationId; }
    get owner() { return this._owner; }
    get position() { return this._position; }
    get rotation() { return { ...this._rotation }; }
    get scale() { return { ...this._scale }; }
    get bounds() { return this._bounds; }
    get revision() { return this._revision; }
    get contentHash() { return this._contentHash; }
    get createdAt() { return this._createdAt; }
    get updatedAt() { return this._updatedAt; }
    get ownerIdentity() { return this._ownerIdentity; }
    get signature() { return this._signature; }

    // UNCHANGED since 0.2.10 — same fields, same order. Deliberately does
    // NOT include ownerIdentity/signature, so already-stored records keep
    // verifying.
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

    // New revision: contentHash and signature are CLEARED — a new revision
    // is a new immutable object that must be re-hashed and re-signed.
    // ownerIdentity carries over.
    withPosition(newPosition) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            ownerIdentity: this._ownerIdentity,
            position: newPosition,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision + 1,
            contentHash: null,
            createdAt: this._createdAt,
            updatedAt: new Date(),
            signature: null
        });
    }

    // Setting the owner claim invalidates any existing signature.
    withOwnerIdentity(ownerIdentity) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            ownerIdentity,
            position: this._position,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision,
            contentHash: this._contentHash,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            signature: null
        });
    }

    withSignature(signature) {
        return new PlacementRecord({
            placementId: this._placementId,
            publicationId: this._publicationId,
            owner: this._owner,
            ownerIdentity: this._ownerIdentity,
            position: this._position,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds,
            revision: this._revision,
            contentHash: this._contentHash,
            createdAt: this._createdAt,
            updatedAt: this._updatedAt,
            signature
        });
    }

    getSigningDescriptor() {
        return {
            type: SignatureType.PLACEMENT_RECORD,
            id: this._placementId,
            revision: this._revision,
            payload: {
                placementId: this._placementId,
                publicationId: this._publicationId,
                owner: this._owner,
                ownerIdentity: PlacementRecord._identityJSON(this._ownerIdentity),
                position: this._position.toJSON(),
                rotation: this._rotation,
                scale: this._scale,
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
            ownerIdentity: PlacementRecord._identityJSON(this._ownerIdentity),
            position: this._position.toJSON(),
            rotation: { ...this._rotation },
            scale: { ...this._scale },
            bounds: this._bounds ? this._bounds.toJSON() : null,
            revision: this._revision,
            contentHash: this._contentHash,
            createdAt: this._createdAt.toISOString(),
            updatedAt: this._updatedAt.toISOString(),
            signature: this._signature ? this._signature.toJSON() : null
        };
    }

    static fromJSON(json) {
        return new PlacementRecord({
            placementId: json.placementId,
            publicationId: json.publicationId,
            owner: json.owner,
            ownerIdentity: json.ownerIdentity || null,
            position: Position.fromJSON(json.position),
            rotation: json.rotation,
            scale: json.scale,
            bounds: json.bounds ? SpatialBounds.fromJSON(json.bounds) : null,
            revision: json.revision,
            contentHash: json.contentHash,
            createdAt: new Date(json.createdAt),
            updatedAt: new Date(json.updatedAt),
            signature: json.signature || null
        });
    }

    // ownerIdentity may be a live identity object or a plain serialized
    // object; normalize for JSON output without coupling core/ to the
    // identity layer.
    static _identityJSON(identity) {
        if (!identity) {
            return null;
        }
        return typeof identity.toJSON === 'function' ? identity.toJSON() : identity;
    }
}
