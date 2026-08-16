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
//
// 0.2.24 — two coordinate systems, not one (see docs/Principles.md,
// "World Coordinates Are Absolute; Documents Are Local"):
//   - A brick's `position` (core/Brick.js) is DOCUMENT-LOCAL — it
//     describes where the brick sits within its own World, with no
//     knowledge that the document might ever be published or placed
//     anywhere.
//   - This WorldPlacement's `position` is the document's origin in
//     GLOBAL shared-world space.
// A brick's effective, renderable world position is the sum of the
// two — see effectiveWorldPosition() below. Nothing about a document's
// own content ever needs to know its placement to be valid; nothing
// about a placement ever needs to know the document's content to be
// valid. That independence is what lets the SAME document appear
// placed in more than one location at once.
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

    // Composes a document-local position (e.g. a brick's own
    // position within its World) with this placement's global
    // position, producing the effective position that content
    // actually renders at in shared world space. Example (see
    // docs/Principles.md): a tower at document-local (10, 5, 0)
    // inside a document placed at (500, 0, -200) renders at
    // (510, 5, -200). Accepts any {x,y,z}-shaped value; always
    // returns a Position.
    effectiveWorldPosition(localPosition) {
        const local = localPosition instanceof Position
            ? localPosition
            : new Position(localPosition.x || 0, localPosition.y || 0, localPosition.z || 0);
        return local.add(this._position);
    }

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
