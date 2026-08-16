// 0.2.25 — a spatial overlap is a derived OBSERVATION, never persisted
// state. A shared world can legitimately hold more than one publication
// at the same position — an interior view, a historical version,
// deliberately layered exhibits — so "two placements share a
// coordinate" is a plain geometric fact, not an error and not
// something that needs its own stored entity. Whether that fact is
// ACCEPTABLE is a separate, later decision — see
// SpatialAllocationPolicy.js. See docs/Principles.md, "Overlap Is A
// Fact; Collision Is A Policy Decision."
//
// Deliberately origin-only for 0.2.25: "overlap" here means two
// placements sit at the EXACT SAME coordinate, not that their (future)
// spatial bounds intersect. core/SpatialBounds.js already carries per-
// publication bounds, but wiring bounds-based intersection into this
// check is explicitly deferred — see docs/Principles.md.
export class SpatialOverlap {
    constructor({ position, occupants = [] } = {}) {
        this._position = position;
        this._occupants = occupants.slice();
    }

    get position() { return this._position; }
    get occupants() { return this._occupants.slice(); }
    get count() { return this._occupants.length; }
    get isEmpty() { return this._occupants.length === 0; }
}

function positionsEqual(a, b) {
    return !!a && !!b && a.x === b.x && a.y === b.y && a.z === b.z;
}

// `existingRecords` is any array of {placementId, publicationId, position}
// -shaped values — PlacementRecord and WorldPlacement both qualify
// without conversion. `excludePlacementId` omits a placement from
// consideration against itself, e.g. when checking whether MOVING a
// placement to a new position would overlap something else — the
// placement being moved is not "occupying" its own destination.
export function detectSpatialOverlap(position, existingRecords, { excludePlacementId = null } = {}) {
    const occupants = (existingRecords || []).filter((record) =>
        record.placementId !== excludePlacementId && positionsEqual(record.position, position));
    return new SpatialOverlap({ position, occupants });
}
