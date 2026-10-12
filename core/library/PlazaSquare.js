import { Brick } from '../Brick.js';
import { Building } from '../Building.js';
import { World } from '../World.js';
import { Position } from '../Position.js';
import { VillageLibrary } from './VillageLibrary.js';

// The challenge plaza's own square (core/ChallengePlaza.js): a rounded paving
// of sandstone slabs in the open middle, with a well to the north, benches
// facing in, a lamp post on each diagonal and bushes round the edge. It
// stands whenever someone visits the plaza, entries or none, so an empty week
// is still a place. Content only, in the square's own coordinates with the
// plaza's middle at the origin (y from the ground up, a brick's position its
// center); every brick stays inside PLAZA_OPEN_RADIUS, so it never meets an
// exhibit, and the middle stays clear for the visitor to arrive on.

const PAVING_TOP = 0.25;
const SANDSTONE = 0xd8c7a0;
const SANDSTONE_DARK = 0xc9b48a;
const LAMP = 0xffd54f;

function b(definitionId, x, y, z, rotation = 0, color = null) {
    return new Brick({ definitionId, position: new Position(x, y, z), rotation, color });
}

// Furthest a paving slab's corner may reach from the middle.
const PAVING_RADIUS = 13.6;

function pavingBricks() {
    const bricks = [];
    const centers = [-10, -6, -2, 2, 6, 10];
    for (const x of centers) {
        for (const z of centers) {
            if (Math.hypot(Math.abs(x) + 2, Math.abs(z) + 2) > PAVING_RADIUS) continue;
            // A soft checker, so the square reads as laid stone.
            const color = ((x + z) / 4) % 2 === 0 ? SANDSTONE : SANDSTONE_DARK;
            bricks.push(b('core:slab_4x4', x, PAVING_TOP / 2, z, 0, color));
        }
    }
    return bricks;
}

function wellBricks(dx, dz) {
    const well = VillageLibrary.structures.find((structure) => structure.id === 'village:well');
    return well.bricks.map((brick) => b(
        brick.definitionId,
        brick.position.x + dx,
        brick.position.y + PAVING_TOP,
        brick.position.z + dz,
        brick.rotation,
        brick.color
    ));
}

function lampPost(x, z) {
    return [
        b('core:post', x, PAVING_TOP + 1.5, z),
        b('core:lantern', x, PAVING_TOP + 3.5, z, 0, LAMP)
    ];
}

export function plazaSquareBricks() {
    return [
        ...pavingBricks(),
        ...wellBricks(0, -7),
        b('core:bench', -7, PAVING_TOP + 0.25, 0, 90),
        b('core:bench', 7, PAVING_TOP + 0.25, 0, 90),
        b('core:bench', 0, PAVING_TOP + 0.25, 7),
        ...lampPost(-7.5, -7.5),
        ...lampPost(7.5, -7.5),
        ...lampPost(-7.5, 7.5),
        ...lampPost(7.5, 7.5),
        b('core:bush', -11, PAVING_TOP + 0.5, -2),
        b('core:bush', -11, PAVING_TOP + 0.5, 2),
        b('core:bush', 11, PAVING_TOP + 0.5, -2),
        b('core:bush', 11, PAVING_TOP + 0.5, 2),
        b('core:bush', -2, PAVING_TOP + 0.5, 11),
        b('core:bush', 2, PAVING_TOP + 0.5, 11)
    ];
}

// The square as a World of one building, the shape a plaza exhibit is drawn from.
export function plazaSquareWorld() {
    const building = new Building({ id: 'plaza-square' });
    for (const brick of plazaSquareBricks()) building.addBrick(brick);
    const world = new World({ id: 'plaza-square' });
    world.addBuilding(building);
    return world;
}
