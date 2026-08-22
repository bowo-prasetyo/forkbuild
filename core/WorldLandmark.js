// 0.3.7 — World Landmarks & Personal Waypoints.
//
// A persistent, named point in the World created intentionally by a user.
// Unlike WorldLocation (which is derived from existing structures or origin),
// a WorldLandmark is explicit World content that users create to mark
// meaningful places.
//
// Key distinctions:
// - WorldLocation: derived, ephemeral, read-only navigation aid
// - WorldLandmark: persisted, collaborative, editable World content
//
// The landmark's position stores X/Z explicitly, but Y is derived from
// the walkable surface at execution time. This keeps landmarks robust if
// terrain or structures change.
//
// Authorization: Any identity with EDIT permission on the World can
// create/modify/delete landmarks. The authorIdentityId records provenance
// but does not grant exclusive editing rights.
export class WorldLandmark {
    constructor({ id, worldId, authorIdentityId, title, description = '', position, createdAt } = {}) {
        if (!id) {
            throw new Error('WorldLandmark requires an id');
        }
        if (!worldId) {
            throw new Error('WorldLandmark requires a worldId');
        }
        if (!authorIdentityId) {
            throw new Error('WorldLandmark requires an authorIdentityId');
        }
        if (!title) {
            throw new Error('WorldLandmark requires a title');
        }
        if (!position) {
            throw new Error('WorldLandmark requires a position');
        }

        this._id = id;
        this._worldId = worldId;
        this._authorIdentityId = authorIdentityId;
        this._title = title;
        this._description = description;
        this._position = position;
        this._createdAt = createdAt || new Date();
    }

    get id() { return this._id; }
    get worldId() { return this._worldId; }
    get authorIdentityId() { return this._authorIdentityId; }
    get title() { return this._title; }
    get description() { return this._description; }
    get position() { return this._position; }
    get createdAt() { return this._createdAt; }

    setTitle(title) {
        if (!title || title.trim() === '') {
            throw new Error('Landmark title cannot be empty');
        }
        this._title = title.trim();
    }

    setDescription(description) {
        this._description = description || '';
    }

    // Update position (typically only X/Z, Y is derived)
    setPosition(position) {
        this._position = position;
    }

    toJSON() {
        return {
            id: this._id,
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            title: this._title,
            description: this._description,
            position: this._position.toJSON(),
            createdAt: this._createdAt.toISOString()
        };
    }

    static fromJSON(json) {
        return new WorldLandmark({
            id: json.id,
            worldId: json.worldId,
            authorIdentityId: json.authorIdentityId,
            title: json.title,
            description: json.description,
            position: { x: json.position.x, y: json.position.y, z: json.position.z },
            createdAt: new Date(json.createdAt)
        });
    }
}
