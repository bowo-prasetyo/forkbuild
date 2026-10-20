import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../../core/nature/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../../core/nature/TerrainSurface.js';
import { LAKE_SURFACE_HEIGHT } from '../../core/nature/Hydrology.js';
import { isVehicleWaterStepAllowed, droneFloorHeight } from '../../core/vehicles/VehicleWaterline.js';

// Real world water for a mounted vehicle, in world heights (vehicle positions
// already carry terrain elevation). The rules are core/vehicles/VehicleWaterline.js's.
// `heightAt`/`isWaterAt` are injectable for tests.
export class VehicleWaterConstraint {
    constructor({ seed = DEFAULT_WORLD_SEED, heightAt, isWaterAt } = {}) {
        this._heightAt = typeof heightAt === 'function' ? heightAt : (x, z) => terrainHeightAt(seed, x, z);
        this._isWaterAt = typeof isWaterAt === 'function'
            ? isWaterAt
            : (x, z) => surfaceCategoryAt(seed, x, z) === SURFACE_CATEGORY.WATER;
    }

    // `lift` is how high above the ground the vehicle stands (a bridge deck),
    // so the depth is measured from its wheels, not the bed.
    depthAt(x, z, lift = 0) {
        if (!this._isWaterAt(x, z)) return 0;
        return Math.max(0, LAKE_SURFACE_HEIGHT - this._heightAt(x, z) - lift);
    }

    droneFloorAt(x, z) {
        return droneFloorHeight(this._heightAt(x, z), this._isWaterAt(x, z) ? LAKE_SURFACE_HEIGHT : null);
    }

    // Reverts X/Z to where the vehicle stood when the step would take it into
    // water; Y passes through. `fromLift`/`toLift` are how high above the ground
    // the vehicle stands before and after the step (see depthAt()).
    apply(position, desiredPosition, { fromLift = 0, toLift = 0 } = {}) {
        const allowed = isVehicleWaterStepAllowed(
            this.depthAt(position.x, position.z, fromLift),
            this.depthAt(desiredPosition.x, desiredPosition.z, toLift)
        );
        if (allowed) {
            return { position: desiredPosition, blocked: false };
        }
        return { position: { x: position.x, y: desiredPosition.y, z: position.z }, blocked: true };
    }
}
