import { AvatarWaterConstraint } from '../application/avatar/AvatarWaterConstraint.js';
import { waterDepthSpeedFactor } from '../core/AvatarWaterWalkability.js';
import { riverWaterDepthAt, RIVER_FILL } from '../core/RiverFlow.js';
import { riverProximityAt } from '../core/Hydrology.js';
import { RIVER_BED_DEPTH, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { AVATAR_SWIM_DEPTH, AvatarSwimMode } from '../core/AvatarSwimming.js';
import { AvatarVisual } from '../renderer/AvatarVisual.js';
import { POOL_DEPTH } from '../core/RiverBed.js';
import { assert } from './support/Assert.js';

// Wading through a river slows an avatar by the water in its carved bed,
// as wading into a lake does, but a river is never deep enough to swim;
// and a swimmer at the surface rides the swell where it is drawn
// (renderer/AvatarVisual.js#setFloat()), without its presence moving.

const SEED = DEFAULT_WORLD_SEED;

async function runTests() {
    {
        // A deep stretch of river, and dry ground beside it.
        let river = null;
        for (let x = -900; x < 900 && !river; x += 3) {
            for (let z = -900; z < 900 && !river; z += 3) {
                if (riverProximityAt(SEED, x, z) > 0.95 && riverWaterDepthAt(SEED, x, z) > 0.4) river = { x, z };
            }
        }
        assert(river, 'a deep stretch of river was found');
        const water = new AvatarWaterConstraint();
        const depth = riverWaterDepthAt(SEED, river.x, river.z);
        assert(Math.abs(water.depthAt(river.x, river.z) - depth) < 1e-12, 'a river is as deep as the water in its bed');
        assert(water.speedFactorAt(river.x, river.z) < 1, 'wading through a river slows the avatar');
        assert(water.speedFactorAt(river.x, river.z) === waterDepthSpeedFactor(depth), 'by the same rule as wading into a lake');
        assert(water.waterSurfaceAt(river.x, river.z) === null, 'a river has no surface to swim at');
        assert(Math.max(RIVER_BED_DEPTH, POOL_DEPTH) * RIVER_FILL < AVATAR_SWIM_DEPTH, 'no river, nor the pool it ends in, is deep enough to swim');

        let dry = null;
        for (let x = river.x; x < river.x + 60 && !dry; x += 0.5) {
            if (riverWaterDepthAt(SEED, x, river.z) === 0) dry = { x, z: river.z };
        }
        assert(dry && water.speedFactorAt(dry.x, dry.z) === 1, 'out of the river, full speed again');
        console.log('✓ wading through a river slows an avatar, by its depth, and never makes it swim');

        // A made-up ground has no rivers unless it is given some.
        const synthetic = new AvatarWaterConstraint({ heightAt: () => 0, isWaterAt: () => false });
        assert(synthetic.depthAt(river.x, river.z) === 0, 'a synthetic ground has no real rivers in it');
        const given = new AvatarWaterConstraint({ heightAt: () => 0, isWaterAt: () => false, riverDepthAt: () => 0.3 });
        assert(given.depthAt(0, 0) === 0.3, 'but wades through a river it is given');
        console.log('✓ a synthetic ground has only the rivers it is given');
    }

    {
        // Bobbing: the drawn avatar rides the swell above where presence puts it.
        const visual = new AvatarVisual();
        visual.setPose({ x: 1, y: 2, z: 3 }, { y: 0 });
        assert(visual.root.position.y === 2, 'with no swell, the avatar is where presence says');
        visual.setFloat(0.15);
        assert(Math.abs(visual.root.position.y - 2.15) < 1e-12, 'the swell lifts it');
        visual.setPose({ x: 1, y: 2.5, z: 3 }, { y: 0 });
        assert(Math.abs(visual.root.position.y - 2.65) < 1e-12, 'a new presence keeps riding the same swell');
        visual.setFloat(-0.1);
        assert(Math.abs(visual.root.position.y - 2.4) < 1e-12, 'and drops it in a trough');
        visual.setFloat(NaN);
        assert(visual.root.position.y === 2.5, 'a meaningless swell is no swell');
        visual.setSwimMode(AvatarSwimMode.SURFACE);
        assert(visual.swimMode === AvatarSwimMode.SURFACE, 'it says how it is in the water');
        console.log('✓ a swimmer rides the swell where it is drawn, its presence unchanged');
    }
}

await runTests();
