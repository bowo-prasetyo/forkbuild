import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../../core/TerrainHeightField.js';
import { surfaceCategoryAt, SURFACE_CATEGORY } from '../../core/TerrainSurface.js';
import { LAKE_SURFACE_HEIGHT } from '../../core/Hydrology.js';
import { isVehicleWaterStepAllowed, droneFloorHeight } from '../../core/VehicleWaterline.js';

// Real world water for a mounted vehicle, in world heights (vehicle positions
// already carry terrain elevation). The rules are core/VehicleWaterline.js's.
// `heightAt`/`isWaterAt` are injectable for tests.
export class VehicleWaterConstraint {
    constructor({ seed = DEFAULT_WORLD_SEED, heightAt, isWaterAt } = {}) {
        this._heightAt = typeof heightAt === 'function' ? heightAt : (x, z) => terrainHeightAt(seed, x, z);
        this._isWaterAt = typeof isWaterAt === 'function'
            ? isWaterAt
            : (x, z) => surfaceCategoryAt(seed, x, z) === SURFACE_CATEGORY.WATER;
    }

    depthAt(x, z) {
        if (!this._isWaterAt(x, z)) return 0;
        return Math.max(0, LAKE_SURFACE_HEIGHT - this._heightAt(x, z));
    }

    droneFloorAt(x, z) {
        return droneFloorHeight(this._heightAt(x, z), this._isWaterAt(x, z) ? LAKE_SURFACE_HEIGHT : null);
    }

    // Reverts X/Z to where the vehicle stood when the step would take it into
    // water; Y passes through.
    apply(position, desiredPosition) {
        const allowed = isVehicleWaterStepAllowed(
            this.depthAt(position.x, position.z),
            this.depthAt(desiredPosition.x, desiredPosition.z)
        );
        if (allowed) {
            return { position: desiredPosition, blocked: false };
        }
        return { position: { x: position.x, y: desiredPosition.y, z: position.z }, blocked: true };
    }
}
