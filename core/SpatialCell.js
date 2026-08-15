// Deterministic virtual-space partitioning (0.2.15).
//
// A SpatialCell is one cube of a uniform 3D grid over the shared
// virtual coordinate system:
//
//   position (125, 40, -73), cell size 100  ->  cell (1, 0, -1)
//
// The partition is pure math — no storage, no network, no geography.
// The coordinate system is virtual, never latitude/longitude (0.2.10);
// cells are labels for virtual regions, nothing more. Negative
// coordinates use floor division so the grid is symmetric around the
// origin. Cell keys are "x/y/z" strings — stable across every
// implementation and used as the map keys inside SpatialIndexRoot.
//
// Indexing convention: a placement is indexed in EVERY cell its
// global bounds intersect; discovery queries every cell intersecting
// the query sphere. Both directions are deliberately conservative and
// deterministic — false positives are fine, because resolved
// PlacementRecords are re-checked against the actual query before
// anything is returned.
export const DEFAULT_CELL_SIZE = 100;

const INTEGER_PATTERN = /^-?\d+$/;

export class SpatialCell {
    constructor({ x, y, z, cellSize = DEFAULT_CELL_SIZE }) {
        if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
            throw new Error('SpatialCell: x, y, z must be integers');
        }
        if (!cellSize || cellSize <= 0 || !Number.isFinite(cellSize)) {
            throw new Error('SpatialCell: cellSize must be a positive number');
        }
        this._x = x;
        this._y = y;
        this._z = z;
        this._cellSize = cellSize;
    }

    get x() { return this._x; }
    get y() { return this._y; }
    get z() { return this._z; }
    get cellSize() { return this._cellSize; }

    // Stable string identity: "12/-4/7".
    get key() {
        return `${this._x}/${this._y}/${this._z}`;
    }

    getBounds() {
        return {
            min: {
                x: this._x * this._cellSize,
                y: this._y * this._cellSize,
                z: this._z * this._cellSize
            },
            max: {
                x: (this._x + 1) * this._cellSize,
                y: (this._y + 1) * this._cellSize,
                z: (this._z + 1) * this._cellSize
            }
        };
    }

    // Half-open containment: [min, max) on every axis.
    contains(position) {
        const bounds = this.getBounds();
        return position.x >= bounds.min.x && position.x < bounds.max.x
            && position.y >= bounds.min.y && position.y < bounds.max.y
            && position.z >= bounds.min.z && position.z < bounds.max.z;
    }

    // Sphere vs cell AABB — the same test LocalSpatialIndexProvider
    // uses for placements, applied to the cell itself.
    intersectsSphere(center, radius) {
        const bounds = this.getBounds();
        const closestX = Math.max(bounds.min.x, Math.min(center.x, bounds.max.x));
        const closestY = Math.max(bounds.min.y, Math.min(center.y, bounds.max.y));
        const closestZ = Math.max(bounds.min.z, Math.min(center.z, bounds.max.z));
        const dx = center.x - closestX;
        const dy = center.y - closestY;
        const dz = center.z - closestZ;
        return (dx * dx + dy * dy + dz * dz) <= radius * radius;
    }

    equals(other) {
        return other instanceof SpatialCell
            && this._x === other.x
            && this._y === other.y
            && this._z === other.z
            && this._cellSize === other.cellSize;
    }

    toJSON() {
        return { x: this._x, y: this._y, z: this._z };
    }

    static fromPosition(position, cellSize) {
        return new SpatialCell({
            x: Math.floor(position.x / cellSize),
            y: Math.floor(position.y / cellSize),
            z: Math.floor(position.z / cellSize),
            cellSize
        });
    }

    static fromKey(key, cellSize) {
        if (typeof key !== 'string') {
            throw new Error('SpatialCell.fromKey: key must be a string');
        }
        const parts = key.split('/');
        if (parts.length !== 3) {
            throw new Error(`SpatialCell.fromKey: invalid cell key "${key}"`);
        }
        const coordinates = [];
        for (const part of parts) {
            if (!INTEGER_PATTERN.test(part)) {
                throw new Error(`SpatialCell.fromKey: invalid cell key "${key}"`);
            }
            coordinates.push(Number(part));
        }
        return new SpatialCell({
            x: coordinates[0],
            y: coordinates[1],
            z: coordinates[2],
            cellSize
        });
    }

    // Every cell whose cube intersects the closed AABB [min, max].
    static cellsForBounds(min, max, cellSize) {
        const startX = Math.floor(min.x / cellSize);
        const startY = Math.floor(min.y / cellSize);
        const startZ = Math.floor(min.z / cellSize);
        const endX = Math.floor(max.x / cellSize);
        const endY = Math.floor(max.y / cellSize);
        const endZ = Math.floor(max.z / cellSize);
        const cells = [];
        for (let x = startX; x <= endX; x++) {
            for (let y = startY; y <= endY; y++) {
                for (let z = startZ; z <= endZ; z++) {
                    cells.push(new SpatialCell({ x, y, z, cellSize }));
                }
            }
        }
        return cells;
    }

    // Every cell the sphere actually intersects. Starts from the
    // sphere's bounding box and drops cells the sphere misses.
    static cellsForSphere(center, radius, cellSize) {
        const box = {
            min: { x: center.x - radius, y: center.y - radius, z: center.z - radius },
            max: { x: center.x + radius, y: center.y + radius, z: center.z + radius }
        };
        return SpatialCell.cellsForBounds(box.min, box.max, cellSize)
            .filter((cell) => cell.intersectsSphere(center, radius));
    }
}
