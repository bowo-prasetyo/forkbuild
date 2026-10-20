import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { orientedSize } from '../core/building/BrickOrientation.js';
import { assert } from './support/Assert.js';

// Nothing in a built-in structure floats above a hipped roof. A hip roof
// (core:roof_hip, and the spanning core:roof_hip_4x4, _4x6 and _6x6) slopes
// to its eaves on every side, so a brick resting on its bounding box, like
// a chimney set on a roof cap, can stand in mid-air over the lower part of
// the slope. Every brick that stands on or through a hip roof must reach
// down to the slope at the lowest point under it, unless it stands on
// another brick.

const brickRegistry = new CreateBrickRegistryUseCase().execute();
const structureRegistry = new CreateStructureRegistryUseCase().execute();
const EPSILON = 1e-6;

// A brick's box in its structure: footprint x/z extents and its bottom.
// Built-in structures turn bricks by quarter turns only.
function box(brick) {
    const size = orientedSize(brickRegistry.get(brick.definitionId), brick.tilt);
    const turned = Math.round(brick.rotation / 90) % 2 !== 0;
    const halfX = (turned ? size.depth : size.width) / 2;
    const halfZ = (turned ? size.width : size.depth) / 2;
    const { x, y, z } = brick.position;
    return { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ, bottom: y - size.height / 2, top: y + size.height / 2 };
}

const HIP_ROOFS = new Set(['core:roof_hip', 'core:roof_hip_4x4', 'core:roof_hip_4x6', 'core:roof_hip_6x6']);

// The height of a hip roof's slope above (x, z), inside its footprint: every
// slope has one pitch, rising from the nearest eave to the ridge, which is
// as far in from each eave as half the shorter side.
function roofSurface(roof, x, z) {
    const halfX = (roof.maxX - roof.minX) / 2;
    const halfZ = (roof.maxZ - roof.minZ) / 2;
    const fromEave = Math.min(halfX - Math.abs(x - (roof.minX + halfX)), halfZ - Math.abs(z - (roof.minZ + halfZ)));
    return roof.bottom + (roof.top - roof.bottom) * Math.min(1, fromEave / Math.min(halfX, halfZ));
}

function overlaps(a, b) {
    return Math.max(a.minX, b.minX) < Math.min(a.maxX, b.maxX) - EPSILON
        && Math.max(a.minZ, b.minZ) < Math.min(a.maxZ, b.maxZ) - EPSILON;
}

function floatingBricks(structure) {
    const roofs = structure.bricks.filter((brick) => HIP_ROOFS.has(brick.definitionId)).map(box);
    const others = structure.bricks.filter((brick) => !HIP_ROOFS.has(brick.definitionId)).map(box);
    const problems = [];
    for (const brick of structure.bricks) {
        if (HIP_ROOFS.has(brick.definitionId)) continue;
        const b = box(brick);
        if (others.some((o) => o !== b && Math.abs(o.top - b.bottom) < EPSILON && overlaps(o, b))) continue;
        for (const roof of roofs) {
            const minX = Math.max(b.minX, roof.minX);
            const maxX = Math.min(b.maxX, roof.maxX);
            const minZ = Math.max(b.minZ, roof.minZ);
            const maxZ = Math.min(b.maxZ, roof.maxZ);
            if (minX >= maxX - EPSILON || minZ >= maxZ - EPSILON) continue;
            if (b.bottom < roof.bottom - EPSILON) continue;
            const lowest = Math.min(...[[minX, minZ], [minX, maxZ], [maxX, minZ], [maxX, maxZ]].map(([x, z]) => roofSurface(roof, x, z)));
            if (b.bottom > lowest + EPSILON) {
                problems.push(`${brick.definitionId} at (${brick.position.x}, ${brick.position.y}, ${brick.position.z}) floats ${(b.bottom - lowest).toFixed(2)} above the roof`);
            }
        }
    }
    return problems;
}

// The check finds the chimney House used to have: a cube set on top of a
// roof cap's box, off its peak.
{
    const cap = { definitionId: 'core:roof_hip', position: { x: 1, y: 4.0, z: -1 }, rotation: 0, tilt: 0 };
    const old = { bricks: [cap, { definitionId: 'core:cube', position: { x: 1.5, y: 5.25, z: -1.5 }, rotation: 0, tilt: 0 }] };
    assert(floatingBricks(old).length === 1, 'a cube resting on a hip roof cap\'s box floats');
    // And on a spanning roof, off its ridge.
    const spanning = { bricks: [
        { definitionId: 'core:roof_hip_4x6', position: { x: 0, y: 4.25, z: 0 }, rotation: 0, tilt: 0 },
        { definitionId: 'core:cube', position: { x: 1.5, y: 5.75, z: 2.5 }, rotation: 0, tilt: 0 },
        { definitionId: 'core:chimney', position: { x: 1, y: 4.5, z: 1 }, rotation: 0, tilt: 0 }
    ] };
    const found = floatingBricks(spanning);
    assert(found.length === 1 && found[0].startsWith('core:cube'), `a cube on a spanning roof's box floats, a chimney through its slope doesn't (${found})`);
    console.log('✓ a brick standing on a hip roof\'s box, off its peak, is found');
}

// No built-in structure has one.
{
    const structures = structureRegistry.getAll();
    assert(structures.length > 20, 'the built-in structures are checked');
    for (const structure of structures) {
        const problems = floatingBricks(structure);
        assert(problems.length === 0, `${structure.id}: ${problems.join('; ')}`);
    }
    console.log('✓ nothing in a built-in structure floats above a hip roof');
}

// House and Large House have a real chimney, not a cube.
{
    for (const id of ['village:house', 'village:large_house']) {
        const bricks = structureRegistry.get(id).bricks;
        assert(bricks.some((brick) => brick.definitionId === 'core:chimney'), `${id} has a chimney brick`);
        assert(!bricks.some((brick) => brick.definitionId === 'core:cube'), `${id} has no cube left on its roof`);
    }
    console.log('✓ House and Large House have chimney bricks');
}
