import { Position } from './Position.js';
import { RegionKind, isValidRegionKind } from './RegionKind.js';
import { distanceXZ } from './WorldSpatialAnchor.js';

// 0.5.0 — World Regions & Decentralized Place Naming.
//
// A WorldRegion is explicit, persistent World content — a named AREA
// (center + radius, X/Z only, exactly like core/WorldLandmark.js's own
// position) that users intentionally create to answer "what is this
// place called?" It sits directly alongside WorldLandmark (a named
// POINT) as the same kind of exception to 0.3.6's "exploration is
// derived, never stored" rule: a region doesn't derive its name from
// terrain, seed, or geometry — a human chose it, and that choice is
// content, not geometry. See docs/Principles.md, "Users Name Places;
// The World Derives Geography From Names (0.5.0)."
//
// Deliberately NOT a real-world GIS model:
//   - Geometry is a circle (center + radius), never a polygon. Simple
//     enough that "am I in this region?" is one distanceXZ() <= radius
//     comparison — see contains() below. CIRCLE/RECTANGLE/POLYGON
//     geometry kinds remain a future extension, not attempted here.
//   - `kind` (core/RegionKind.js) is a semantic LABEL only. Nothing
//     anywhere hard-codes what a VILLAGE's radius should be, or treats
//     one kind's geometry differently from another's.
//   - Regions may overlap freely, and nesting is NEVER required.
//     `parentRegionId`, if set, is purely informational grouping
//     metadata a UI may use (e.g. "children of Green Valley") — it is
//     never consulted to decide "what contains this position" (see
//     core/WorldRegionGeography.js#regionsContaining(), which is pure
//     geometry) and is never validated against an actually-existing
//     region. A region with no parent at all is exactly as valid as one
//     three levels deep.
//   - There is no "official"/"verified"/"canonical" name concept.
//     `authorIdentityId` records provenance only; editing authority is
//     ordinary World membership (any EDIT member may rename/redescribe/
//     resize/reclassify any region), the same posture 0.3.7 already
//     established for landmarks — never a second ADMIN_NAMING_AUTHORITY.
//
// A region stores only X/Z for its center; Y is derived from terrain at
// render time, following the exact convention core/WorldLandmark.js
// already established.
export class WorldRegion {
    constructor({
        id,
        worldId,
        authorIdentityId,
        name,
        description = '',
        kind = RegionKind.PLACE,
        position,
        radius,
        parentRegionId = null
    } = {}) {
        if (!id) {
            throw new Error('WorldRegion requires an id');
        }
        if (!worldId) {
            throw new Error('WorldRegion requires a worldId');
        }
        if (!authorIdentityId) {
            throw new Error('WorldRegion requires an authorIdentityId');
        }
        if (!name) {
            throw new Error('WorldRegion requires a name');
        }
        if (!position) {
            throw new Error('WorldRegion requires a position');
        }
        if (!isValidRegionKind(kind)) {
            throw new Error(`WorldRegion: invalid kind "${kind}"`);
        }
        if (!Number.isFinite(radius) || radius <= 0) {
            throw new Error('WorldRegion requires a positive, finite radius');
        }

        this._id = id;
        this._worldId = worldId;
        this._authorIdentityId = authorIdentityId;
        this._name = name;
        this._description = description;
        this._kind = kind;
        this._position = position instanceof Position
            ? position
            : new Position(position.x || 0, position.y || 0, position.z || 0);
        this._radius = radius;
        this._parentRegionId = parentRegionId || null;
    }

    get id() { return this._id; }
    get worldId() { return this._worldId; }
    get authorIdentityId() { return this._authorIdentityId; }
    get name() { return this._name; }
    get description() { return this._description; }
    get kind() { return this._kind; }
    get position() { return this._position; }
    get radius() { return this._radius; }
    get parentRegionId() { return this._parentRegionId; }

    // X/Z are authoritative; Y is derived from terrain at render time.
    get x() { return this._position.x; }
    get z() { return this._position.z; }

    setName(name) {
        if (!name) {
            throw new Error('WorldRegion name cannot be empty');
        }
        this._name = name;
    }

    setDescription(description) {
        this._description = description || '';
    }

    setKind(kind) {
        if (!isValidRegionKind(kind)) {
            throw new Error(`WorldRegion: invalid kind "${kind}"`);
        }
        this._kind = kind;
    }

    setRadius(radius) {
        if (!Number.isFinite(radius) || radius <= 0) {
            throw new Error('WorldRegion requires a positive, finite radius');
        }
        this._radius = radius;
    }

    // Pure geometry: is `position` (an { x, z } or Position) within this
    // region's circle? The one containment test every derivation in
    // core/WorldRegionGeography.js is built from.
    contains(position) {
        const distance = distanceXZ(this._position, position);
        return distance !== null && distance <= this._radius;
    }

    toJSON() {
        return {
            id: this._id,
            worldId: this._worldId,
            authorIdentityId: this._authorIdentityId,
            name: this._name,
            description: this._description,
            kind: this._kind,
            position: this._position.toJSON(),
            radius: this._radius,
            parentRegionId: this._parentRegionId
        };
    }

    static fromJSON(json) {
        return new WorldRegion({
            id: json.id,
            worldId: json.worldId,
            authorIdentityId: json.authorIdentityId,
            name: json.name,
            description: json.description || '',
            kind: json.kind || RegionKind.PLACE,
            position: Position.fromJSON(json.position),
            radius: json.radius,
            parentRegionId: json.parentRegionId || null
        });
    }
}
