import { Structure } from '../Structure.js';
import { Brick } from '../Brick.js';
import { Position } from '../Position.js';

// The built-in "village" structure library — the first, deliberately
// curated Structure collection, per the 0.2.81 design conversation
// ("Forkable Structure Library"). Six structures, six different corners
// of 0.2.80's expanded brick vocabulary:
//
//   House   — wall_1x3, slab_4x4, roof_hip, door, window_large/small,
//             stair, cube (chimney)
//   Barn    — block_2x2, beam, roof_hip
//   Well    — cube, column, arch
//   Market  — column, beam, roof_hip, trim
//   Mill    — block_2x2, roof_hip, window_small
//   Bridge  — slab_4x4, beam, arch
//
// Every brick placed below is one of the fifteen ORDINARY definitions
// core/library/CoreLibrary.js already registers — nothing here is a
// special "House" or "Barn" brick, and nothing here needs a new
// definitionId, a new mesh factory, or a new renderer code path. A
// Structure composes bricks; it does not add to the brick vocabulary.
// See docs/Principles.md, "A Brick Is A Primitive, Never A Preassembled
// Structure," and its 0.2.81 companion, "A Library Structure Is An
// Ordinary Document Waiting To Be Forked."
//
// Coordinates are each Structure's own LOCAL space — position (0,0,0) is
// ground level at the structure's own footprint center. Y is measured
// from the ground up (brick.position.y is a brick's CENTER, matching
// every other Brick in the engine — see core/Brick.js). None of this
// knows or cares where a fork of it eventually gets edited or placed;
// see docs/Principles.md, "A Structure Is Reusable Content; Where It's
// Placed Is A Separate Question."
function b(definitionId, x, y, z, rotation = 0) {
    return new Brick({ definitionId, position: new Position(x, y, z), rotation });
}

const houseBricks = [
    // Floor — one slab_4x4, top surface at y = 0.25.
    b('core:slab_4x4', 0, 0.125, 0),

    // South (front) wall — three wall_1x3 segments, one gap left open
    // for the door.
    b('core:wall_1x3', -1.5, 1.75, -2),
    b('core:wall_1x3', 0.5, 1.75, -2),
    b('core:wall_1x3', 1.5, 1.75, -2),
    b('core:door', -0.5, 1.25, -2),
    b('core:stair', -0.5, 0.5, -2.5),

    // North (back) wall — four full segments plus a large window.
    b('core:wall_1x3', -1.5, 1.75, 2),
    b('core:wall_1x3', -0.5, 1.75, 2),
    b('core:wall_1x3', 0.5, 1.75, 2),
    b('core:wall_1x3', 1.5, 1.75, 2),
    b('core:window_large', 0, 1.75, 2),

    // East wall — four segments plus a small window, rotated 90° so
    // the wall's own width axis runs along Z instead of X.
    b('core:wall_1x3', 2, 1.75, -1.5, 90),
    b('core:wall_1x3', 2, 1.75, -0.5, 90),
    b('core:wall_1x3', 2, 1.75, 0.5, 90),
    b('core:wall_1x3', 2, 1.75, 1.5, 90),
    b('core:window_small', 2, 1.75, 0, 90),

    // West wall — mirrored.
    b('core:wall_1x3', -2, 1.75, -1.5, 90),
    b('core:wall_1x3', -2, 1.75, -0.5, 90),
    b('core:wall_1x3', -2, 1.75, 0.5, 90),
    b('core:wall_1x3', -2, 1.75, 1.5, 90),
    b('core:window_small', -2, 1.75, 0, 90),

    // Hipped roof — four roof_hip caps tiled 2x2 to cover the 4x4
    // footprint, walls top out at y = 3.25.
    b('core:roof_hip', -1, 4.0, -1),
    b('core:roof_hip', -1, 4.0, 1),
    b('core:roof_hip', 1, 4.0, -1),
    b('core:roof_hip', 1, 4.0, 1),

    // Chimney — one ordinary cube, resting on a roof cap.
    b('core:cube', 1.5, 5.25, -1.5)
];

const barnBricks = [
    // Four block_2x2 corner posts tile the 4x4 footprint solid.
    b('core:block_2x2', -1, 1, -1),
    b('core:block_2x2', -1, 1, 1),
    b('core:block_2x2', 1, 1, -1),
    b('core:block_2x2', 1, 1, 1),

    // Two beams span the footprint, carrying the roof above the posts.
    b('core:beam', 0, 2.25, -1),
    b('core:beam', 0, 2.25, 1),

    // Hipped roof, same 2x2 tiling the house uses.
    b('core:roof_hip', -1, 3.25, -1),
    b('core:roof_hip', -1, 3.25, 1),
    b('core:roof_hip', 1, 3.25, -1),
    b('core:roof_hip', 1, 3.25, 1)
];

const wellBricks = [
    // A ring of eight cubes around an open 1x1 shaft at the origin.
    b('core:cube', -1, 0.5, -1),
    b('core:cube', 0, 0.5, -1),
    b('core:cube', 1, 0.5, -1),
    b('core:cube', -1, 0.5, 0),
    b('core:cube', 1, 0.5, 0),
    b('core:cube', -1, 0.5, 1),
    b('core:cube', 0, 0.5, 1),
    b('core:cube', 1, 0.5, 1),

    // Two columns rise from the ring to carry the well-house frame.
    b('core:column', -1, 2.5, 0),
    b('core:column', 1, 2.5, 0),

    // An arch spans the two columns as the well-house's own lintel.
    b('core:arch', 0, 5.0, 0)
];

const marketBricks = [
    // Four corner columns.
    b('core:column', -1.5, 1.5, -1.5),
    b('core:column', -1.5, 1.5, 1.5),
    b('core:column', 1.5, 1.5, -1.5),
    b('core:column', 1.5, 1.5, 1.5),

    // Four beams frame the top of the columns.
    b('core:beam', 0, 3.25, -1.5),
    b('core:beam', 0, 3.25, 1.5),
    b('core:beam', -1.5, 3.25, 0, 90),
    b('core:beam', 1.5, 3.25, 0, 90),

    // Hipped roof over the frame.
    b('core:roof_hip', -1, 4.25, -1),
    b('core:roof_hip', -1, 4.25, 1),
    b('core:roof_hip', 1, 4.25, -1),
    b('core:roof_hip', 1, 4.25, 1),

    // Decorative trim along the beam edges.
    b('core:trim', 0, 3.625, -1.5),
    b('core:trim', 0, 3.625, 1.5),
    b('core:trim', -1.5, 3.625, 0, 90),
    b('core:trim', 1.5, 3.625, 0, 90)
];

const millBricks = [
    // Three block_2x2 stacked into a tower.
    b('core:block_2x2', 0, 1, 0),
    b('core:block_2x2', 0, 3, 0),
    b('core:block_2x2', 0, 5, 0),

    // A hipped cap on top.
    b('core:roof_hip', 0, 6.75, 0),

    // Windows on three faces of the tower.
    b('core:window_small', 1, 3, 0, 90),
    b('core:window_small', -1, 3, 0, 90),
    b('core:window_small', 0, 5, 1)
];

const bridgeBricks = [
    // Two arches serve as the bridge's own piers.
    b('core:arch', -2, 1, 0, 90),
    b('core:arch', 2, 1, 0, 90),

    // Two slab_4x4 deck segments span end to end across the piers.
    b('core:slab_4x4', -2, 2.125, 0),
    b('core:slab_4x4', 2, 2.125, 0),

    // Four beams form railings along both edges of the deck.
    b('core:beam', -2, 2.5, -2),
    b('core:beam', -2, 2.5, 2),
    b('core:beam', 2, 2.5, -2),
    b('core:beam', 2, 2.5, 2)
];

export const VillageLibrary = {
    id: 'village',
    structures: [
        new Structure({
            id: 'village:house',
            name: 'House',
            category: 'residential',
            tags: ['house', 'residential', 'dwelling'],
            description: 'A small hipped-roof cottage with a raised entry step, a chimney, a door, and windows on every wall.',
            bricks: houseBricks
        }),
        new Structure({
            id: 'village:barn',
            name: 'Barn',
            category: 'agricultural',
            tags: ['barn', 'agricultural', 'structural'],
            description: 'A post-and-beam barn frame carrying a hipped roof.',
            bricks: barnBricks
        }),
        new Structure({
            id: 'village:well',
            name: 'Well',
            category: 'infrastructure',
            tags: ['well', 'infrastructure'],
            description: 'A stone well ring with two columns supporting an arched well-house frame.',
            bricks: wellBricks
        }),
        new Structure({
            id: 'village:market',
            name: 'Market',
            category: 'commercial',
            tags: ['market', 'commercial', 'stall'],
            description: 'An open-air market stall — four columns, a beamed frame, a hipped roof, and trim detailing.',
            bricks: marketBricks
        }),
        new Structure({
            id: 'village:mill',
            name: 'Mill',
            category: 'agricultural',
            tags: ['mill', 'agricultural', 'tower'],
            description: 'A three-tier mill tower with a hipped cap and window openings.',
            bricks: millBricks
        }),
        new Structure({
            id: 'village:bridge',
            name: 'Bridge',
            category: 'infrastructure',
            tags: ['bridge', 'infrastructure', 'crossing'],
            description: 'A short slab-deck bridge resting on two arched piers, with beam railings.',
            bricks: bridgeBricks
        })
    ]
};
