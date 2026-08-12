import { createId } from './createId.js';
import { Position } from './Position.js';
import { SpatialBounds } from './SpatialBounds.js';

// A lightweight spatial reference to a Publication.
//
// The critical architectural invariant: a WorldPlacement does NOT own
// a world. It points to one via publicationId. This means:
//   - Moving a world never mutates the Publication or Document.
//   - Multiple placements can reference the same Publication.
//   - Coordinates belong to shared world space, not the document.
//
// Distance between worlds is derived from their placements, never
// stored as a property of either world.
export class WorldPlacement {
    constructor({
        id = createId(),
        publicationId,
        position = new Position(),
        rotation = { x: 0, y: 0, z: 0 },
        scale = { x: 1, y: 1, z: 1 },
        bounds = null
    } = {}) {
        if (!publicationId) {
            throw new Error('WorldPlacement requires a publicationId');
        }
        this._id = id;
        this._publicationId = publicationId;
        this._position = position instanceof Position
            ? position
            : new Position(position.x || 0, position.y || 0, position.z || 0);
        this._rotation = { ...rotation };
        this._scale = { ...scale };
        this._bounds = bounds;
    }

    get id() { return this._id; }
    get publicationId() { return this._publicationId; }
    get position() { return this._position; }
    get rotation() { return { ...this._rotation }; }
    get scale() { return { ...this._scale }; }
    get bounds() { return this._bounds; }

    // Returns a new placement with the updated position, preserving
    // identity, publication reference, and bounds.
    withPosition(position) {
        return new WorldPlacement({
            id: this._id,
            publicationId: this._publicationId,
            position,
            rotation: this._rotation,
            scale: this._scale,
            bounds: this._bounds
        });
    }

    toJSON() {
        return {
            id: this._id,
            publicationId: this._publicationId,
            position: this._position.toJSON(),
            rotation: { ...this._rotation },
            scale: { ...this._scale },
            bounds: this._bounds ? this._bounds.toJSON() : null
        };
    }

    static fromJSON(json) {
        return new WorldPlacement({
            id: json.id,
            publicationId: json.publicationId,
            position: Position.fromJSON(json.position),
            rotation: json.rotation,
            scale: json.scale,
            bounds: json.bounds ? SpatialBounds.fromJSON(json.bounds) : null
        });
    }
}
