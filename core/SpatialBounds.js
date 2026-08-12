// Pure geometry: the axis-aligned bounding box (AABB) of a published
// world in its LOCAL coordinate system. Calculated once from the
// document's bricks, then translated by the WorldPlacement's global
// position to determine the world's occupied region in shared space.
//
// Rotation and scale are not applied to the bounds in V1 — the AABB
// is translated only. This is a deliberate simplification; a future
// milestone can introduce oriented bounding boxes (OBB) or transformed
// AABBs without changing the SpatialIndexProvider contract.
export class SpatialBounds {
    constructor({ min = { x: 0, y: 0, z: 0 }, max = { x: 0, y: 0, z: 0 } } = {}) {
        this._min = { ...min };
        this._max = { ...max };
    }

    get min() { return { ...this._min }; }
    get max() { return { ...this._max }; }

    get center() {
        return {
            x: (this._min.x + this._max.x) / 2,
            y: (this._min.y + this._max.y) / 2,
            z: (this._min.z + this._max.z) / 2
        };
    }

    get size() {
        return {
            x: this._max.x - this._min.x,
            y: this._max.y - this._min.y,
            z: this._max.z - this._min.z
        };
    }

    // Translates the local bounds to global space using the placement position.
    getGlobalBounds(position) {
        return new SpatialBounds({
            min: {
                x: this._min.x + position.x,
                y: this._min.y + position.y,
                z: this._min.z + position.z
            },
            max: {
                x: this._max.x + position.x,
                y: this._max.y + position.y,
                z: this._max.z + position.z
            }
        });
    }

    toJSON() {
        return { min: { ...this._min }, max: { ...this._max } };
    }

    static fromJSON(json) {
        return new SpatialBounds(json);
    }

    // Calculates the local AABB from a World's bricks using definition
    // dimensions from the registry. Returns a default 1x1x1 bounds if
    // the world is empty.
    static fromWorld(world, registry) {
        let minX = Infinity, minY = Infinity, minZ = Infinity;
        let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
        let hasBricks = false;

        for (const building of world.getBuildings()) {
            for (const brick of building.getBricks()) {
                hasBricks = true;
                const def = registry ? registry.get(brick.definitionId) : null;
                const w = def ? def.width : 1;
                const h = def ? def.height : 1;
                const d = def ? def.depth : 1;

                minX = Math.min(minX, brick.position.x - w / 2);
                maxX = Math.max(maxX, brick.position.x + w / 2);
                minY = Math.min(minY, brick.position.y - h / 2);
                maxY = Math.max(maxY, brick.position.y + h / 2);
                minZ = Math.min(minZ, brick.position.z - d / 2);
                maxZ = Math.max(maxZ, brick.position.z + d / 2);
            }
        }

        if (!hasBricks) {
            return new SpatialBounds({
                min: { x: -0.5, y: 0, z: -0.5 },
                max: { x: 0.5, y: 1, z: 0.5 }
            });
        }

        return new SpatialBounds({
            min: { x: minX, y: minY, z: minZ },
            max: { x: maxX, y: maxY, z: maxZ }
        });
    }
}
