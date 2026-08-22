import { Position } from './Position.js';

// 0.3.7 — World Landmarks & Personal Waypoints.
//
// A WorldLandmark is explicit, persistent World content — a named point
// that users intentionally create to mark a place of interest. Unlike
// WorldLocation (core/WorldLocation.js), which is DERIVED from existing
// identity (a StructurePlacement's position, or the world origin), a
// WorldLandmark has its own durable identity stored in the World itself.
//
// Key distinctions:
//   - WorldLocation: ephemeral, derived, read-only view of navigable points
//   - WorldLandmark: persistent, intentional, editable World content
//
// A landmark stores only X/Z; Y is derived from terrain/walkability at
// render time, following the same convention as StructurePlacement.
// This makes landmarks robust if terrain representation changes.
//
// The authorIdentityId records provenance (who created it), but editing
// authority is governed by World membership: any identity with EDIT
// access to the World can modify any landmark in it.
export class WorldLandmark {
    constructor({ id, worldId, authorIdentityId, title, description = '', position } = {}) {
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
        this._position = position instanceof Position
            ? position
            : new Position(position.x || 0, position.y || 0, position.z || 0);
    }

    get id() { return this._id; }
    get worldId() { return this._worldId; }
    get authorIdentityId() { return this._authorIdentityId; }
    get title() { return this._title; }
    get description() { return this._description; }
    get position() { return this._position; }

    // X/Z are authoritative; Y is derived from terrain at render time.
    get x() { return this._position.x; }
    get z() { return this._position.z; }

    setTitle(title) {
        if (!title) {
            throw new Error('WorldLandmark title cannot be empty');
        }
        this._title = title;
    }

    setDescription(description) {
        this._description = description || '';
    }

    toJSON() {
        return {
            id: this._id,
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            title: this._title,
            description: this._description,
            position: this._position.toJSON()
        };
    }

    static fromJSON(json) {
        return new WorldLandmark({
            id: json.id,
            worldId: json.worldId,
            authorIdentityId: json.authorIdentityId,
            title: json.title,
            description: json.description || '',
            position: Position.fromJSON(json.position)
        });
    }
}
