import { createId } from './createId.js';
import { Position } from './Position.js';
import { SpatialBounds } from './SpatialBounds.js';
import { computeContentHash } from '../serializer/contentHash.js';

// A publishable spatial record (0.2.10).
//
// PlacementRecord is the decentralized counterpart of WorldPlacement.
// Where WorldPlacement is pure domain data (id, publicationId, position,
// rotation, scale, bounds), PlacementRecord adds:
//
//   owner        — who placed it (separate from Publication author)
//   revision     — monotonic counter for this placement
//   contentHash  — integrity hash over the canonical placement data
//   createdAt    — when it was first placed
//   updatedAt    — when it was last moved/modified
//
// A PlacementRecord can be stored in IPFS, Arweave, a blockchain, or
// any content-addressed store. The PlacementRegistry adapter handles
// storage and discovery; the SpatialIndexProvider handles spatial
// queries. These are separate concerns.
//
// Ownership hierarchy:
//   Document author   — who created the content
//   Publication author — who published it
//   Placement owner   — who placed it in the virtual world
//
// These three can be different people. Moving a placement changes the
// PlacementRecord, not the Publication, not the Document.
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
        updatedAt = new Date()
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
        this._bounds = bounds;
        this._revision = revision;
        this._contentHash = contentHash;
        this._createdAt = createdAt instanceof Date ? createdAt : new Date(createdAt);
        this._updatedAt = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
        this._bounds = bounds instanceof SpatialBounds ? bounds : (bounds ? SpatialBounds.fromJSON(bounds) : null);
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

    // Computes the content hash over the canonical placement data.
    // This covers everything except the hash itself, so any tampering
    // with position, owner, revision, etc. will be detected.
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

    // Verifies the integrity of this record against its stored hash.
    verifyIntegrity() {
        if (!this._contentHash) {
            return false;
        }
        return this.computeContentHash() === this._contentHash;
    }

    // Creates a new revision of this record with an updated position.
    // The revision counter increments, updatedAt is refreshed, and a
    // new contentHash is computed.
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
            contentHash: null, // will be computed by caller
            createdAt: this._createdAt,
            updatedAt: new Date()
        });
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
            updatedAt: this._updatedAt.toISOString()
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
            updatedAt: new Date(json.updatedAt)
        });
    }
}
