import { Structure } from '../Structure.js';
import { Brick } from '../Brick.js';
import { Position } from '../Position.js';
import { VillageLibrary } from './VillageLibrary.js';

// The built-in "showcase" structure library: a few larger, finished builds
// that someone new to ForkBuild can open and change instead of starting from
// an empty plot (Home's ready-made builds, the Editor's New, the
// Repository's Featured builds; see application/home/FeaturedBuilds.js).
// Like core/library/VillageLibrary.js it is content only: every brick is an
// ordinary core:* definition from core/library/CoreLibrary.js, coordinates
// are each structure's own local space (y measured from the ground up, a
// brick's position its center), and a fork of one is an ordinary document.
//
//   showcase:castle          curtain walls, four roofed towers, a gate, a keep
//   showcase:harbor_island   a terraced island, a lighthouse, a cottage, a dock
//   showcase:village_square  a plaza with a well, houses, a chapel and stalls
//
// The village square and the island reuse Village structures by moving
// copies of their bricks into place (placeVillage() below); the library's
// own Village bricks are never shared or changed.

function b(definitionId, x, y, z, rotation = 0, color = null) {
    return new Brick({ definitionId, position: new Position(x, y, z), rotation, color });
}

// Copies of a Village structure's bricks, moved by (dx, dy, dz).
function placeVillage(id, dx, dy, dz) {
    const structure = VillageLibrary.structures.find((candidate) => candidate.id === id);
    return structure.bricks.map((brick) => b(
        brick.definitionId,
        brick.position.x + dx,
        brick.position.y + dy,
        brick.position.z + dz,
        brick.rotation,
        brick.color
    ));
}

const SAND = 0xd9c48a;
const GRASS = 0x6fa35a;
const WOOD = 0x8b5a2b;
const PILING = 0x6b4226;
const WHITE = 0xf2f2f2;
const RED = 0xc0392b;
const LAMP = 0xffd54f;
const SAIL = 0xf5f5f5;
// core:block_2x2's own color, so the battlements read as part of the wall.
const STONE = 0x7d7d7d;

// ---------------------------------------------------------------------------
// Castle: a 16 × 16 courtyard (sixteen slab_4x4, top at y = 0.25) inside two
// layers of block_2x2 curtain wall (top at 4.25) with a stone-colored cube
// merlon on the outer half of every wall block. The front (south, -z) wall leaves a gate
// two blocks wide under arches; four towers of four blocks (top at 8.25)
// carry hipped roofs; a 4 × 4 keep of three layers stands toward the back,
// with a door and two windows facing the gate.
// ---------------------------------------------------------------------------
const FLOOR_TOP = 0.25;
const LAYER = [FLOOR_TOP + 1, FLOOR_TOP + 3, FLOOR_TOP + 5, FLOOR_TOP + 7];
const WALL_SPAN = [-5, -3, -1, 1, 3, 5];
const GATE = new Set([-1, 1]);
const MERLON_Y = FLOOR_TOP + 4 + 0.5;

const castleBricks = [];
for (const x of [-6, -2, 2, 6]) {
    for (const z of [-6, -2, 2, 6]) {
        castleBricks.push(b('core:slab_4x4', x, 0.125, z));
    }
}
for (const along of WALL_SPAN) {
    // Front wall, with the gate's arches in its lower layer.
    castleBricks.push(GATE.has(along)
        ? b('core:arch', along, LAYER[0], -7)
        : b('core:block_2x2', along, LAYER[0], -7));
    castleBricks.push(b('core:block_2x2', along, LAYER[1], -7));
    castleBricks.push(b('core:cube', along, MERLON_Y, -7.5, 0, STONE));
    // Back wall.
    castleBricks.push(b('core:block_2x2', along, LAYER[0], 7));
    castleBricks.push(b('core:block_2x2', along, LAYER[1], 7));
    castleBricks.push(b('core:cube', along, MERLON_Y, 7.5, 0, STONE));
    // West and east walls.
    for (const side of [-7, 7]) {
        castleBricks.push(b('core:block_2x2', side, LAYER[0], along));
        castleBricks.push(b('core:block_2x2', side, LAYER[1], along));
        castleBricks.push(b('core:cube', side + Math.sign(side) * 0.5, MERLON_Y, along, 0, STONE));
    }
}
for (const x of [-7, 7]) {
    for (const z of [-7, 7]) {
        for (const y of LAYER) {
            castleBricks.push(b('core:block_2x2', x, y, z));
        }
        castleBricks.push(b('core:roof_hip', x, FLOOR_TOP + 8 + 0.75, z));
    }
}
// The keep: 4 × 4, front face at z = 0.
for (const x of [-1, 1]) {
    for (const z of [1, 3]) {
        for (const y of LAYER.slice(0, 3)) {
            castleBricks.push(b('core:block_2x2', x, y, z));
        }
        castleBricks.push(b('core:roof_hip', x, FLOOR_TOP + 6 + 0.75, z));
    }
}
castleBricks.push(b('core:door', 0, FLOOR_TOP + 1, -0.05));
castleBricks.push(b('core:window_small', -1, LAYER[1], -0.125));
castleBricks.push(b('core:window_small', 1, LAYER[1], -0.125));

// ---------------------------------------------------------------------------
// Harbor Island: two terraces of block_2x2 on a grid of two-unit cells, a
// sandy beach ring (top at y = 2) round a grassy middle (top at 4). On the
// grass: a striped lighthouse with a lit lantern under a hipped roof, and a
// Village cottage. A wooden dock on cube pilings runs south from the beach,
// with a small sailboat moored beside it.
// ---------------------------------------------------------------------------
const CELLS = [-5, -3, -1, 1, 3, 5];
const BEACH_RADIUS_SQUARED = 34;
const GRASS_RADIUS_SQUARED = 18;

const harborIslandBricks = [];
for (const x of CELLS) {
    for (const z of CELLS) {
        const distance = x * x + z * z;
        if (distance <= BEACH_RADIUS_SQUARED) {
            harborIslandBricks.push(b('core:block_2x2', x, 1, z, 0, SAND));
        }
        if (distance <= GRASS_RADIUS_SQUARED) {
            harborIslandBricks.push(b('core:block_2x2', x, 3, z, 0, GRASS));
        }
    }
}
// The lighthouse, on the grass cell at (-3, 3).
harborIslandBricks.push(
    b('core:block_2x2', -3, 5, 3, 0, WHITE),
    b('core:block_2x2', -3, 7, 3, 0, RED),
    b('core:block_2x2', -3, 9, 3, 0, WHITE),
    b('core:cube', -3, 10.5, 3, 0, LAMP),
    b('core:roof_hip', -3, 11.75, 3)
);
// A cottage on the grass, its door facing the dock.
harborIslandBricks.push(...placeVillage('village:cottage', 1.5, 4, 0));
// The dock: two wooden plates on pilings, level 0.75 below the beach.
for (const z of [-8, -12]) {
    harborIslandBricks.push(b('core:plate_2x4', 1, 1.125, z, 0, WOOD));
}
for (const z of [-7, -9, -11, -13]) {
    for (const x of [0.5, 1.5]) {
        harborIslandBricks.push(b('core:cube', x, 0.5, z, 0, PILING));
    }
}
// The sailboat, moored east of the dock.
harborIslandBricks.push(
    b('core:plate_2x4', 4, 0.125, -11, 0, WOOD),
    b('core:post', 4, 1.75, -11),
    b('core:window_large', 4, 2, -12.25, 90, SAIL)
);

// ---------------------------------------------------------------------------
// Village Square: a 20 × 20 plaza of slab_4x4 (top at y = 0.25) with Village
// structures standing on it, every one facing the plaza's south side: a
// house, a small chapel and a cottage along the back, a well in the middle,
// and a market and a market stall along the front.
// ---------------------------------------------------------------------------
const PLAZA_TOP = 0.25;
const villageSquareBricks = [];
for (const x of [-8, -4, 0, 4, 8]) {
    for (const z of [-8, -4, 0, 4, 8]) {
        villageSquareBricks.push(b('core:slab_4x4', x, 0.125, z));
    }
}
villageSquareBricks.push(
    ...placeVillage('village:house', -6, PLAZA_TOP, 6),
    ...placeVillage('village:small_chapel', 0, PLAZA_TOP, 6),
    ...placeVillage('village:cottage', 6, PLAZA_TOP, 6),
    ...placeVillage('village:well', 0, PLAZA_TOP, 0),
    ...placeVillage('village:market_stall', -6, PLAZA_TOP, -6),
    ...placeVillage('village:market', 5.5, PLAZA_TOP, -6)
);

export const ShowcaseLibrary = {
    id: 'showcase',
    structures: [
        new Structure({
            id: 'showcase:castle',
            name: 'Castle',
            category: 'showcase',
            tags: ['castle', 'fortress', 'tower', 'showcase'],
            description: 'A walled castle with four roofed towers, an arched gate, battlements and a keep in the courtyard.',
            bricks: castleBricks
        }),
        new Structure({
            id: 'showcase:harbor_island',
            name: 'Harbor Island',
            category: 'showcase',
            tags: ['island', 'harbor', 'lighthouse', 'dock', 'boat', 'showcase'],
            description: 'A small island with a sandy beach, a striped lighthouse, a cottage, a wooden dock and a moored sailboat.',
            bricks: harborIslandBricks
        }),
        new Structure({
            id: 'showcase:village_square',
            name: 'Village Square',
            category: 'showcase',
            tags: ['village', 'square', 'plaza', 'market', 'showcase'],
            description: 'A paved square with a well at its center, framed by a house, a chapel, a cottage, a market and a stall.',
            bricks: villageSquareBricks
        })
    ]
};
