// 0.3.7 — World Landmarks & Personal Waypoints.
//
// A WorldLandmark is a named, persistent point in the world worth
// remembering — "★ Old Bridge", "★ Village Center", "★ Great View".
// Unlike WorldLocation (core/WorldLocation.js), which is DERIVED from
// existing identity (a StructurePlacement's id/position, or the world's
// origin) and never persisted, a WorldLandmark is EXPLICIT durable state:
// it has its own id, title, description, and position that survives
// session boundaries. See docs/Principles.md, "A Landmark Is A Named
// Point Worth Remembering (0.3.7)."
//
// A landmark is deliberately NOT:
//   - a geometric region (no polygon, no boundary, no collision)
//   - an ownership boundary (no permission implications)
//   - a teleport target (navigation uses existing focusLocation machinery)
//   - a new network protocol (stored as part of the World's serialized state)
//
// Instead, a landmark is SEMANTIC: a human-meaningful label attached to
// a position, so that "Village" can be more than just coordinates.
// Multiple landmarks can exist at similar positions; they do not partition
// space or conflict. Deleting a landmark does NOT delete any structures,
// placements, or other content near it — curation organizes content;
// it does not own content.
//
// See also: core/WorldLocationKind.js's comment about LANDMARK being
// "named in the design conversation as the eventual richer vocabulary" —
// 0.3.7 makes that vocabulary real.
export class WorldLandmark {
    constructor({ id, title, description = '', position = { x: 0, y: 0, z: 0 } } = {}) {
        if (!id) {
            throw new Error('WorldLandmark requires an id');
        }
        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            throw new Error('WorldLandmark requires a non-empty title');
        }
        this._id = id;
        this._title = title.trim();
        this._description = typeof description === 'string' ? description : '';
        this._position = {
            x: Number.isFinite(position.x) ? position.x : 0,
            y: Number.isFinite(position.y) ? position.y : 0,
            z: Number.isFinite(position.z) ? position.z : 0
        };
    }

    get id() { return this._id; }
    get title() { return this._title; }
    get description() { return this._description; }
    get position() { return { ...this._position }; }

    toJSON() {
        return {
            id: this._id,
            title: this._title,
            description: this._description,
            position: this._position
        };
    }

    static fromJSON(json) {
        return new WorldLandmark({
            id: json.id,
            title: json.title,
            description: json.description || '',
            position: json.position || { x: 0, y: 0, z: 0 }
        });
    }
}
