import { orientedSize } from './BrickOrientation.js';

// Where a brick put on top of another comes to rest: on the tallest brick
// under its footprint, not inside it. Stacking (application/tools/
// PlacementTool.js) starts a new brick on the face that was clicked; a brick
// wider than that one (a roof over a house, a slab over a room, a beam
// across two posts) would otherwise sink into the walls round it. It is
// lifted until nothing it overlaps from the side is in its way, so a 6x6
// roof dropped on the middle of a house's floor rests on top of its walls
// (docs/reviews/CreativeDirection-2026-10-12b.md, finding 2).
//
// Pure: the pending brick's center, size and turn, and the bricks already
// standing with a way to read their definitions; returns the center height
// to place it at. Footprints are axis-aligned boxes (a quarter turn swaps
// width and depth); bricks only touching don't count.

const EPSILON = 1e-3;
// Enough for any stack a person builds; a pathological one stops here.
const MAX_LIFTS = 64;

export function footprintOf(definition, { x, z }, rotation = 0, tilt = 0) {
    const size = orientedSize(definition, tilt);
    const turned = Math.round((Number(rotation) || 0) / 90) % 2 !== 0;
    const halfX = (turned ? size.depth : size.width) / 2;
    const halfZ = (turned ? size.width : size.depth) / 2;
    return { minX: x - halfX, maxX: x + halfX, minZ: z - halfZ, maxZ: z + halfZ, height: size.height };
}

export function restingHeight({ definition, position, rotation = 0, tilt = 0 }, bricks, definitionOf) {
    const pending = footprintOf(definition, position, rotation, tilt);
    const boxes = [];
    for (const brick of bricks || []) {
        const existing = definitionOf(brick.definitionId);
        if (!existing) continue;
        const box = footprintOf(existing, brick.position, brick.rotation, brick.tilt);
        if (Math.min(box.maxX, pending.maxX) - Math.max(box.minX, pending.minX) <= EPSILON) continue;
        if (Math.min(box.maxZ, pending.maxZ) - Math.max(box.minZ, pending.minZ) <= EPSILON) continue;
        boxes.push({ bottom: brick.position.y - box.height / 2, top: brick.position.y + box.height / 2 });
    }
    let bottom = position.y - pending.height / 2;
    for (let lift = 0; lift < MAX_LIFTS; lift++) {
        const top = bottom + pending.height;
        const inTheWay = boxes.filter((box) => box.top - bottom > EPSILON && top - box.bottom > EPSILON);
        if (inTheWay.length === 0) break;
        bottom = Math.max(...inTheWay.map((box) => box.top));
    }
    return bottom + pending.height / 2;
}
