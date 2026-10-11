import { Structure } from '../Structure.js';
import { Brick } from '../Brick.js';
import { Position } from '../Position.js';

// The built-in "village" structure library — the first, deliberately
// curated Structure collection, per the 0.2.81 design conversation
// ("Forkable Structure Library"). 0.2.81 shipped six structures across
// six different corners of 0.2.80's expanded brick vocabulary; 0.4.4
// (Village Library Expansion) grows the same library to twenty —
// content and packaging, never new architecture, never a new brick
// primitive. See docs/Roadmap.md, 0.4.4.
//
//   Residential    House, Cottage, Large House, Tool Shed
//   Agricultural   Barn, Mill, Stable, Granary, Silo
//   Commercial     Market, Market Stall
//   Community      Village Hall, Pavilion, Small Chapel
//   Infrastructure Well, Bridge, Village Gate, Watchtower,
//                  Fence Segment, Dock
//
// Every brick placed below is one of the fifteen ORDINARY definitions
// core/library/CoreLibrary.js already registers — nothing here is a
// special "House" or "Barn" brick, and nothing here needs a new
// definitionId, a new mesh factory, or a new renderer code path. A
// Structure composes bricks; it does not add to the brick vocabulary —
// including the five new structures below built ONLY from bricks and
// beams and columns and arches with no walls at all (Market Stall,
// Pavilion, Village Gate, Fence Segment, Dock): a Structure is a
// reusable spatial composition, never a synonym for "building". See
// docs/Principles.md, "A Brick Is A Primitive, Never A Preassembled
// Structure," and its 0.2.81 companion, "A Library Structure Is An
// Ordinary Document Waiting To Be Forked."
//
// Coordinates are each Structure's own LOCAL space — position (0,0,0) is
// ground level at the structure's own footprint center. Y is measured
// from the ground up (brick.position.y is a brick's CENTER, matching
// every other Brick in the engine — see core/Brick.js). None of this
// knows or cares where a fork of it eventually gets edited or placed;
// see docs/Principles.md, "A Structure Is The Next Rung On The Brick
// Ladder, Not An Escape From It (0.2.81)."
//
// Vertical stacking convention (unchanged since 0.2.81): each layer's
// brick CENTER sits at (previous layer's top) + (this brick's own
// height / 2), so adjacent layers always meet exactly at one shared
// plane, never gap and never interpenetrate as solid mass. A door,
// window, or trim piece is the one deliberate exception — the same
// idiom core:mill's own windows already established: it sits flush
// against (or, on a segmented wall, entirely inside an otherwise-empty
// slot of) the surface it opens, never floating free of it.
function b(definitionId, x, y, z, rotation = 0, color = null, tilt = 0) {
    return new Brick({ definitionId, position: new Position(x, y, z), rotation, color, tilt });
}

// core:slope_45's own color, for the cubes that raise a stepped roof row so
// they read as part of the roof.
const ROOF_COLOR = 0xd08a3e;

// Floors and platforms of oak, paths and steps of stone (core/VillagePalette.js).
const OAK = 0x8b5a2b;
const STONE = 0x9a9a9a;

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

    // Chimney — a brick stack rising through the south-east roof cap, its
    // foot below the slope all round so it never floats above the roof.
    b('core:chimney', 1.25, 4.5, -1.25)
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

// Sandstone for the Mill's tower and cream sailcloth (core/VillagePalette.js).
const SANDSTONE = 0xd9c08c;
const SAILCLOTH = 0xf2ead3;

const millBricks = [
    // Three block_2x2 stacked into a sandstone tower.
    b('core:block_2x2', 0, 1, 0, 0, SANDSTONE),
    b('core:block_2x2', 0, 3, 0, 0, SANDSTONE),
    b('core:block_2x2', 0, 5, 0, 0, SANDSTONE),

    // A hipped cap on top.
    b('core:roof_hip', 0, 6.75, 0),

    // Windows on three faces of the tower.
    b('core:window_small', 1, 3, 0, 90),
    b('core:window_small', -1, 3, 0, 90),
    b('core:window_small', 0, 5, 1),

    // Sails on the south (front) face: a round hub laid on its side, four timber
    // stocks three long (the side ones are posts tilted and turned to lie
    // along X), and a sail of cloth along the outer two thirds of each
    // stock, each on the stock's clockwise side so the four read as a
    // pinwheel.
    b('core:round_1x1', 0, 4, -1.5, 0, OAK, 90),
    b('core:post', 0, 5.5, -2.125),
    b('core:post', 0, 2.5, -2.125),
    b('core:post', 1.5, 4, -2.125, 90, null, 90),
    b('core:post', -1.5, 4, -2.125, 90, null, 90),
    b('core:wall_1x1', -0.625, 5.5, -2.125, 0, SAILCLOTH),
    b('core:wall_1x1', -0.625, 6.5, -2.125, 0, SAILCLOTH),
    b('core:wall_half_2x1', 2, 4.625, -2.125, 0, SAILCLOTH),
    b('core:wall_1x1', 0.625, 1.5, -2.125, 0, SAILCLOTH),
    b('core:wall_1x1', 0.625, 2.5, -2.125, 0, SAILCLOTH),
    b('core:wall_half_2x1', -2, 3.375, -2.125, 0, SAILCLOTH)
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

// ---------------------------------------------------------------------
// 0.4.4 — Village Library Expansion
// ---------------------------------------------------------------------

// Cottage — a narrow 2x4 residential footprint (not House's 4x4 square),
// a single door and a single window rather than one on every wall, and a
// gable roof built from core:slope_45 — the primitive's first use
// anywhere in this library — running its ridge lengthwise instead of
// House's hipped pyramid. Also core:plate_2x4's first use as a floor.
const cottageBricks = [
    b('core:plate_2x4', 0, 0.125, 0),

    // South wall — one segment plus the door.
    b('core:wall_1x3', -0.5, 1.75, -2),
    b('core:door', 0.5, 1.25, -2),

    // North wall — one segment plus a single window.
    b('core:wall_1x3', -0.5, 1.75, 2),
    b('core:window_small', 0.5, 1.75, 2),

    // East/west walls — solid, four segments each, no openings.
    b('core:wall_1x3', 1, 1.75, -1.5, 90),
    b('core:wall_1x3', 1, 1.75, -0.5, 90),
    b('core:wall_1x3', 1, 1.75, 0.5, 90),
    b('core:wall_1x3', 1, 1.75, 1.5, 90),
    b('core:wall_1x3', -1, 1.75, -1.5, 90),
    b('core:wall_1x3', -1, 1.75, -0.5, 90),
    b('core:wall_1x3', -1, 1.75, 0.5, 90),
    b('core:wall_1x3', -1, 1.75, 1.5, 90),

    // Gable roof — a west row and an east row of slope_45, each rising
    // toward the ridge along Z (slope_45 rises along its local +X).
    b('core:slope_45', -0.5, 3.75, -1.5),
    b('core:slope_45', -0.5, 3.75, -0.5),
    b('core:slope_45', -0.5, 3.75, 0.5),
    b('core:slope_45', -0.5, 3.75, 1.5),
    b('core:slope_45', 0.5, 3.75, -1.5, 180),
    b('core:slope_45', 0.5, 3.75, -0.5, 180),
    b('core:slope_45', 0.5, 3.75, 0.5, 180),
    b('core:slope_45', 0.5, 3.75, 1.5, 180)
];

// Large House — a 6x4 two-story residential footprint, genuinely bigger
// than House rather than a cosmetic recolor: a full second story of
// wall_1x3 above a trim floor band, window_large downstairs and up, a
// 3x2 hipped roof, and a chimney — the library's largest single
// structure, proving the existing vocabulary scales up as well as out.
const largeHouseBricks = [
    b('core:slab_4x4', -1, 0.125, 0),
    b('core:plate_2x4', 2, 0.125, 0),

    // Ground floor — south wall (door + stair entry).
    b('core:wall_1x3', -2.5, 1.75, -2),
    b('core:wall_1x3', -1.5, 1.75, -2),
    b('core:wall_1x3', -0.5, 1.75, -2),
    b('core:wall_1x3', 1.5, 1.75, -2),
    b('core:wall_1x3', 2.5, 1.75, -2),
    b('core:door', 0.5, 1.25, -2),
    b('core:stair', 0.5, 0.5, -2.5),

    // Ground floor — north wall with a large window.
    b('core:wall_1x3', -2.5, 1.75, 2),
    b('core:wall_1x3', -1.5, 1.75, 2),
    b('core:wall_1x3', 1.5, 1.75, 2),
    b('core:wall_1x3', 2.5, 1.75, 2),
    b('core:window_large', 0, 1.75, 2),

    // Ground floor — east/west walls, solid.
    b('core:wall_1x3', 3, 1.75, -1.5, 90),
    b('core:wall_1x3', 3, 1.75, -0.5, 90),
    b('core:wall_1x3', 3, 1.75, 0.5, 90),
    b('core:wall_1x3', 3, 1.75, 1.5, 90),
    b('core:wall_1x3', -3, 1.75, -1.5, 90),
    b('core:wall_1x3', -3, 1.75, -0.5, 90),
    b('core:wall_1x3', -3, 1.75, 0.5, 90),
    b('core:wall_1x3', -3, 1.75, 1.5, 90),

    // Floor band marking the second story, corners only.
    b('core:trim', -2.5, 3.375, -2),
    b('core:trim', 2.5, 3.375, -2),
    b('core:trim', -2.5, 3.375, 2),
    b('core:trim', 2.5, 3.375, 2),

    // Second story — south wall with a large window.
    b('core:wall_1x3', -2.5, 5.0, -2),
    b('core:wall_1x3', -1.5, 5.0, -2),
    b('core:wall_1x3', 1.5, 5.0, -2),
    b('core:wall_1x3', 2.5, 5.0, -2),
    b('core:window_large', 0, 5.0, -2),

    // Second story — north wall with a large window.
    b('core:wall_1x3', -2.5, 5.0, 2),
    b('core:wall_1x3', -1.5, 5.0, 2),
    b('core:wall_1x3', 1.5, 5.0, 2),
    b('core:wall_1x3', 2.5, 5.0, 2),
    b('core:window_large', 0, 5.0, 2),

    // Second story — east/west walls with a small window each.
    b('core:wall_1x3', 3, 5.0, -1.5, 90),
    b('core:wall_1x3', 3, 5.0, -0.5, 90),
    b('core:wall_1x3', 3, 5.0, 1.5, 90),
    b('core:window_small', 3, 5.0, 0.5, 90),
    b('core:wall_1x3', -3, 5.0, -1.5, 90),
    b('core:wall_1x3', -3, 5.0, -0.5, 90),
    b('core:wall_1x3', -3, 5.0, 1.5, 90),
    b('core:window_small', -3, 5.0, 0.5, 90),

    // Hipped roof, 3x2 tiling over the 6x4 footprint.
    b('core:roof_hip', -2, 7.25, -1),
    b('core:roof_hip', -2, 7.25, 1),
    b('core:roof_hip', 0, 7.25, -1),
    b('core:roof_hip', 0, 7.25, 1),
    b('core:roof_hip', 2, 7.25, -1),
    b('core:roof_hip', 2, 7.25, 1),

    // Chimney — through the south-east cap, as on House.
    b('core:chimney', 2.25, 7.75, -1.25)
];

// Tool Shed — deliberately tiny: an open, doorless front (a lean-to,
// not an enclosed room), three solid walls, and a single-pitch
// slope_45 roof rather than House/Cottage's own roof shapes. No floor —
// it sits directly on the ground, the same convention Barn already
// established for a utility structure rather than a dwelling.
const toolShedBricks = [
    b('core:door', 0, 1, -1),

    b('core:wall_1x3', -0.5, 1.5, 1),
    b('core:wall_1x3', 0.5, 1.5, 1),

    b('core:wall_1x3', 1, 1.5, -0.5, 90),
    b('core:wall_1x3', 1, 1.5, 0.5, 90),
    b('core:wall_1x3', -1, 1.5, -0.5, 90),
    b('core:wall_1x3', -1, 1.5, 0.5, 90),

    // One pitch rising from the open front to the back wall: each row
    // back sits a step higher on a roof-colored cube.
    b('core:slope_45', -0.5, 3.5, -0.5, 270),
    b('core:slope_45', 0.5, 3.5, -0.5, 270),
    b('core:cube', -0.5, 3.5, 0.5, 0, ROOF_COLOR),
    b('core:cube', 0.5, 3.5, 0.5, 0, ROOF_COLOR),
    b('core:slope_45', -0.5, 4.5, 0.5, 270),
    b('core:slope_45', 0.5, 4.5, 0.5, 270)
];

// Stable — a long, low agricultural building with open stall fronts
// (core:arch used as functional stall openings, not decoration) behind
// a solid block_2x2 rear wall, under a single-pitch slope_45 roof. No
// beams, no roof_hip — a genuinely different combination from Barn.
const stableBricks = [
    b('core:block_2x2', -2, 1, 0.5),
    b('core:block_2x2', 0, 1, 0.5),
    b('core:block_2x2', 2, 1, 0.5),

    b('core:arch', -2, 1, -1.25),
    b('core:arch', 0, 1, -1.25),
    b('core:arch', 2, 1, -1.25),

    // One pitch rising from the open stalls to the rear wall, each row
    // back a step higher on roof-colored cubes.
    b('core:slope_45', -2.5, 2.5, -1, 270),
    b('core:slope_45', -1.5, 2.5, -1, 270),
    b('core:slope_45', -0.5, 2.5, -1, 270),
    b('core:slope_45', 0.5, 2.5, -1, 270),
    b('core:slope_45', 1.5, 2.5, -1, 270),
    b('core:slope_45', 2.5, 2.5, -1, 270),
    b('core:cube', -2.5, 2.5, 0, 0, ROOF_COLOR),
    b('core:slope_45', -2.5, 3.5, 0, 270),
    b('core:cube', -1.5, 2.5, 0, 0, ROOF_COLOR),
    b('core:slope_45', -1.5, 3.5, 0, 270),
    b('core:cube', -0.5, 2.5, 0, 0, ROOF_COLOR),
    b('core:slope_45', -0.5, 3.5, 0, 270),
    b('core:cube', 0.5, 2.5, 0, 0, ROOF_COLOR),
    b('core:slope_45', 0.5, 3.5, 0, 270),
    b('core:cube', 1.5, 2.5, 0, 0, ROOF_COLOR),
    b('core:slope_45', 1.5, 3.5, 0, 270),
    b('core:cube', 2.5, 2.5, 0, 0, ROOF_COLOR),
    b('core:slope_45', 2.5, 3.5, 0, 270),
    b('core:cube', -2.5, 2.5, 1, 0, ROOF_COLOR),
    b('core:cube', -2.5, 3.5, 1, 0, ROOF_COLOR),
    b('core:slope_45', -2.5, 4.5, 1, 270),
    b('core:cube', -1.5, 2.5, 1, 0, ROOF_COLOR),
    b('core:cube', -1.5, 3.5, 1, 0, ROOF_COLOR),
    b('core:slope_45', -1.5, 4.5, 1, 270),
    b('core:cube', -0.5, 2.5, 1, 0, ROOF_COLOR),
    b('core:cube', -0.5, 3.5, 1, 0, ROOF_COLOR),
    b('core:slope_45', -0.5, 4.5, 1, 270),
    b('core:cube', 0.5, 2.5, 1, 0, ROOF_COLOR),
    b('core:cube', 0.5, 3.5, 1, 0, ROOF_COLOR),
    b('core:slope_45', 0.5, 4.5, 1, 270),
    b('core:cube', 1.5, 2.5, 1, 0, ROOF_COLOR),
    b('core:cube', 1.5, 3.5, 1, 0, ROOF_COLOR),
    b('core:slope_45', 1.5, 4.5, 1, 270),
    b('core:cube', 2.5, 2.5, 1, 0, ROOF_COLOR),
    b('core:cube', 2.5, 3.5, 1, 0, ROOF_COLOR),
    b('core:slope_45', 2.5, 4.5, 1, 270)
];

// Granary — a storage building raised on four column stilts, keeping
// grain off the ground. core:column used as structural support rather
// than Well/Market's decorative framing — the same primitive, a
// genuinely different role.
const granaryBricks = [
    b('core:column', -1, 1.5, -1),
    b('core:column', 1, 1.5, -1),
    b('core:column', -1, 1.5, 1),
    b('core:column', 1, 1.5, 1),

    b('core:slab_4x4', 0, 3.125, 0),

    b('core:wall_1x3', -1.5, 4.75, -2),
    b('core:wall_1x3', 0.5, 4.75, -2),
    b('core:wall_1x3', 1.5, 4.75, -2),
    b('core:door', -0.5, 4.25, -2),

    b('core:wall_1x3', -1.5, 4.75, 2),
    b('core:wall_1x3', -0.5, 4.75, 2),
    b('core:wall_1x3', 0.5, 4.75, 2),
    b('core:wall_1x3', 1.5, 4.75, 2),

    b('core:wall_1x3', 2, 4.75, -1.5, 90),
    b('core:wall_1x3', 2, 4.75, -0.5, 90),
    b('core:wall_1x3', 2, 4.75, 0.5, 90),
    b('core:wall_1x3', 2, 4.75, 1.5, 90),
    b('core:wall_1x3', -2, 4.75, -1.5, 90),
    b('core:wall_1x3', -2, 4.75, -0.5, 90),
    b('core:wall_1x3', -2, 4.75, 0.5, 90),
    b('core:wall_1x3', -2, 4.75, 1.5, 90),

    b('core:roof_hip', -1, 7.0, -1),
    b('core:roof_hip', -1, 7.0, 1),
    b('core:roof_hip', 1, 7.0, -1),
    b('core:roof_hip', 1, 7.0, 1)
];

// Silo — a tall, slender, sealed agricultural tower: two block_2x2
// tiers (shorter than Mill's three), no windows at all, an exterior
// column ladder standing clear of the tower, and a double roof_hip cap
// for a pointed silhouette Mill never uses.
const siloBricks = [
    b('core:block_2x2', 0, 1, 0),
    b('core:block_2x2', 0, 3, 0),

    b('core:door', 0, 1, -1),

    b('core:column', 1.25, 1.5, 0),
    b('core:column', 1.25, 4.5, 0),

    b('core:roof_hip', 0, 4.75, 0),
    b('core:roof_hip', 0, 6.25, 0)
];

// Market Stall — a single open-air stall: two columns, a flat
// plate_2x4 canopy (never Market's own hipped roof), a crate of goods,
// and a trim valance. No walls at all — smaller and simpler than
// Market itself, never just Market with a brick swapped out.
const marketStallBricks = [
    b('core:column', -1, 1.5, 0),
    b('core:column', 1, 1.5, 0),

    b('core:plate_2x4', 0, 3.125, 0),

    b('core:cube', 0, 0.5, 1),

    b('core:trim', -0.5, 2.875, -2),
    b('core:trim', 0.5, 2.875, -2)
];

// core:wall_1x3's own colour, for the Village Hall's cupola.
const HALL_WALL = 0xc9b896;

// Village Hall — the largest COMMUNITY structure: a wide single-story
// hall with a double door, a large window on every wall, a 3x3 hipped
// roof, and a small bell cupola — deliberately not a second Large
// House: one tall story with a grand facade rather than two ordinary
// ones, and a roof topper neither House variant has.
const villageHallBricks = [
    b('core:wall_1x3', -2.5, 1.5, -3),
    b('core:wall_1x3', -1.5, 1.5, -3),
    b('core:wall_1x3', 1.5, 1.5, -3),
    b('core:wall_1x3', 2.5, 1.5, -3),
    b('core:door', -0.5, 1, -3),
    b('core:door', 0.5, 1, -3),

    b('core:wall_1x3', -2.5, 1.5, 3),
    b('core:wall_1x3', -1.5, 1.5, 3),
    b('core:wall_1x3', 1.5, 1.5, 3),
    b('core:wall_1x3', 2.5, 1.5, 3),
    b('core:window_large', 0, 1.5, 3),

    b('core:wall_1x3', 3, 1.5, -2.5, 90),
    b('core:wall_1x3', 3, 1.5, -1.5, 90),
    b('core:wall_1x3', 3, 1.5, 1.5, 90),
    b('core:wall_1x3', 3, 1.5, 2.5, 90),
    b('core:window_large', 3, 1.5, 0, 90),

    b('core:wall_1x3', -3, 1.5, -2.5, 90),
    b('core:wall_1x3', -3, 1.5, -1.5, 90),
    b('core:wall_1x3', -3, 1.5, 1.5, 90),
    b('core:wall_1x3', -3, 1.5, 2.5, 90),
    b('core:window_large', -3, 1.5, 0, 90),

    b('core:roof_hip', -2, 3.75, -2),
    b('core:roof_hip', -2, 3.75, 0),
    b('core:roof_hip', -2, 3.75, 2),
    b('core:roof_hip', 0, 3.75, -2),
    b('core:roof_hip', 0, 3.75, 0),
    b('core:roof_hip', 0, 3.75, 2),
    b('core:roof_hip', 2, 3.75, -2),
    b('core:roof_hip', 2, 3.75, 0),
    b('core:roof_hip', 2, 3.75, 2),

    // The cupola: two wall-coloured cubes rising from inside the centre
    // cap, so it stands in the roof rather than balancing on its peak, and
    // a cap of its own.
    b('core:cube', 0, 4.25, 0, 0, HALL_WALL),
    b('core:cube', 0, 5.25, 0, 0, HALL_WALL),
    b('core:roof_hip', 0, 6.5, 0)
];

// Pavilion — an open gazebo: four columns and a hipped roof, nothing
// else. No walls, no arch, no beams — the simplest possible
// demonstration that a Structure is a reusable spatial composition, not
// a synonym for "building".
const pavilionBricks = [
    b('core:column', -1.5, 1.5, -1.5),
    b('core:column', 1.5, 1.5, -1.5),
    b('core:column', -1.5, 1.5, 1.5),
    b('core:column', 1.5, 1.5, 1.5),

    b('core:roof_hip', -1, 3.75, -1),
    b('core:roof_hip', -1, 3.75, 1),
    b('core:roof_hip', 1, 3.75, -1),
    b('core:roof_hip', 1, 3.75, 1)
];

// Small Chapel — a narrow, tall community building: a full-width
// core:arch as the entrance itself (a functional doorway, not
// decoration, following Stable's own precedent), a steep slope_45
// gable roof, and a column spire — the only structure in the library
// with a vertical column used as a rooftop ornament.
const smallChapelBricks = [
    b('core:plate_2x4', 0, 0.125, 0),

    b('core:arch', 0, 1.25, -2),

    b('core:wall_1x3', -0.5, 1.75, 2),
    b('core:window_small', 0.5, 1.75, 2),

    b('core:wall_1x3', 1, 1.75, -1.5, 90),
    b('core:wall_1x3', 1, 1.75, -0.5, 90),
    b('core:wall_1x3', 1, 1.75, 0.5, 90),
    b('core:wall_1x3', 1, 1.75, 1.5, 90),
    b('core:wall_1x3', -1, 1.75, -1.5, 90),
    b('core:wall_1x3', -1, 1.75, -0.5, 90),
    b('core:wall_1x3', -1, 1.75, 0.5, 90),
    b('core:wall_1x3', -1, 1.75, 1.5, 90),

    b('core:slope_45', -0.5, 3.75, -1.5),
    b('core:slope_45', -0.5, 3.75, -0.5),
    b('core:slope_45', -0.5, 3.75, 0.5),
    b('core:slope_45', -0.5, 3.75, 1.5),
    b('core:slope_45', 0.5, 3.75, -1.5, 180),
    b('core:slope_45', 0.5, 3.75, -0.5, 180),
    b('core:slope_45', 0.5, 3.75, 0.5, 180),
    b('core:slope_45', 0.5, 3.75, 1.5, 180),

    b('core:column', 0, 5.75, 0)
];

// Village Gate — two flanking towers (block_2x2 + roof_hip, unlike
// anything else in the library) around an open core:arch passage. No
// enclosed interior at all — a gate is a passage, not a room.
const villageGateBricks = [
    b('core:block_2x2', -2.5, 1, 0),
    b('core:block_2x2', -2.5, 3, 0),
    b('core:roof_hip', -2.5, 4.75, 0),
    b('core:trim', -2.5, 3.9, -1),

    b('core:block_2x2', 2.5, 1, 0),
    b('core:block_2x2', 2.5, 3, 0),
    b('core:roof_hip', 2.5, 4.75, 0),
    b('core:trim', 2.5, 3.9, -1),

    b('core:arch', 0, 1, 0)
];

// Watchtower — a tall, spare block_2x2 tower with an open top
// (deliberately no roof cap, unlike Mill or Silo) ringed with trim
// crenellations, window slits on two faces, and an approach stair.
const watchtowerBricks = [
    b('core:block_2x2', 0, 1, 0),
    b('core:block_2x2', 0, 3, 0),
    b('core:block_2x2', 0, 5, 0),

    b('core:door', 0, 1, -1),
    b('core:stair', 0, 0.5, -1.5),

    b('core:window_small', 1, 3, 0, 90),
    b('core:window_small', 0, 5, 1),

    b('core:trim', 0, 6.25, -1),
    b('core:trim', 0, 6.25, 1),
    b('core:trim', 1, 6.25, 0, 90),
    b('core:trim', -1, 6.25, 0, 90)
];

// Fence Segment — the smallest structure in the library: two cube posts
// and a beam rail. Not a building at all; a modular piece meant to be
// composed in a row alongside others. The beam's own width (4)
// deliberately overhangs each post by 1 unit, so adjacent fence
// segments meet edge to edge when placed end to end.
const fenceSegmentBricks = [
    b('core:cube', -1, 0.5, 0),
    b('core:cube', 1, 0.5, 0),
    b('core:beam', 0, 1.25, 0)
];

// Dock — a flat plank platform on column stilts extending out over
// open water. Like Fence Segment, deliberately not a building: no
// walls, no roof, just a walkable surface raised above the ground.
const dockBricks = [
    b('core:column', -1, 1.5, -1),
    b('core:column', 1, 1.5, -1),
    b('core:column', -1, 1.5, 1),
    b('core:column', 1, 1.5, 1),
    b('core:column', -1, 1.5, 4),
    b('core:column', 1, 1.5, 4),

    // Cross-braced stilts on both long sides, and two square posts under
    // the plank's far end, past the last stilts.
    b('core:brace_2x2', -1, 1.75, 0, 90),
    b('core:brace_2x2', -1, 1.75, 0, 270),
    b('core:brace_2x2', 1, 1.75, 0, 90),
    b('core:brace_2x2', 1, 1.75, 0, 270),
    b('core:post', -0.75, 1.5, 5.75),
    b('core:post', 0.75, 1.5, 5.75),

    b('core:slab_4x4', 0, 3.125, 0),
    b('core:plate_2x4', 0, 3.125, 4)
];

// Garden Cottage — the Builder's kit (2026-10-10) in one small home: plastered
// walls of several widths, round and framed windows with shutters, a double
// door under a gabled porch, a shallow-pitched roof with ridge caps and a
// chimney, and a fenced front garden with a lawn, a path, a bench, a bush, a
// rock and a pine.
const gardenCottageBricks = [
    b('core:plate_2x2', -1, 0.125, -1, 0, OAK),
    b('core:plate_2x2', 1, 0.125, -1, 0, OAK),
    b('core:plate_2x2', -1, 0.125, 1, 0, OAK),
    b('core:plate_2x2', 1, 0.125, 1, 0, OAK),

    // Front: a double door between two stacks with round windows.
    b('core:wall_1x1', -1.5, 0.75, 1.875),
    b('core:window_round', -1.5, 1.75, 1.875),
    b('core:wall_1x1', -1.5, 2.75, 1.875),
    b('core:wall_1x1', 1.5, 0.75, 1.875),
    b('core:window_round', 1.5, 1.75, 1.875),
    b('core:wall_1x1', 1.5, 2.75, 1.875),
    b('core:door_double', 0, 1.25, 1.9),
    b('core:wall_half_2x1', 0, 2.75, 1.875),

    b('core:wall_2x3', -1, 1.75, -1.875),
    b('core:wall_2x3', 1, 1.75, -1.875),
    b('core:wall_2x3', -1.875, 1.75, -1, 90),
    b('core:wall_2x3', -1.875, 1.75, 1, 90),

    // East side: a pair of framed windows with a shutter at each side.
    b('core:wall_2x3', 1.875, 1.75, -1, 90),
    b('core:wall_half_2x1', 1.875, 0.75, 1, 90),
    b('core:window_frame', 1.875, 1.75, 0.5, 90),
    b('core:window_frame', 1.875, 1.75, 1.5, 90),
    b('core:wall_half_2x1', 1.875, 2.75, 1, 90),
    b('core:shutter', 2.05, 1.75, -0.25, 90),
    b('core:shutter', 2.05, 1.75, 2.25, 90),

    // Corbels under the west eave.
    b('core:slope_inverted', -2.5, 2.75, -1.5, 0, OAK),
    b('core:slope_inverted', -2.5, 2.75, 1.5, 0, OAK),

    // Roof: two shallow pitches meeting at a capped ridge.
    b('core:slope_shallow', -1, 3.75, -1.5),
    b('core:slope_shallow', -1, 3.75, -0.5),
    b('core:slope_shallow', -1, 3.75, 0.5),
    b('core:slope_shallow', -1, 3.75, 1.5),
    b('core:slope_shallow', 1, 3.75, -1.5, 180),
    b('core:slope_shallow', 1, 3.75, -0.5, 180),
    b('core:slope_shallow', 1, 3.75, 0.5, 180),
    b('core:slope_shallow', 1, 3.75, 1.5, 180),
    b('core:roof_ridge', 0, 4.5, -1.5),
    b('core:roof_ridge', 0, 4.5, -0.5),
    b('core:roof_ridge', 0, 4.5, 0.5),
    b('core:roof_ridge', 0, 4.5, 1.5),
    b('core:chimney', -1, 4.5, -1),

    // Porch roof over the door, and a threshold stone.
    b('core:roof_gable', 0, 2.75, 3),
    b('core:cube_half', 0, 0.25, 2.5, 0, STONE),

    // Front garden.
    b('core:lawn_2x2', -3, 0.05, 5),
    b('core:lawn_2x2', -1, 0.05, 5),
    b('core:lawn_2x2', 1, 0.05, 5),
    b('core:lawn_2x2', 3, 0.05, 5),
    b('core:lawn_2x2', -3, 0.05, 7),
    b('core:lawn_2x2', -1, 0.05, 7),
    b('core:lawn_2x2', 1, 0.05, 7),
    b('core:lawn_2x2', 3, 0.05, 7),
    b('core:plate_1x1', 0, 0.225, 3.5, 0, STONE),
    b('core:plate_1x1', 0, 0.225, 4.5, 0, STONE),
    b('core:plate_1x1', 0, 0.225, 5.5, 0, STONE),
    b('core:plate_1x1', 0, 0.225, 6.5, 0, STONE),
    b('core:plate_1x1', 0, 0.225, 7.5, 0, STONE),
    b('core:brick_1x4', -4, 0.5, 6, 90),
    b('core:brick_1x2', -2.5, 0.5, 8),
    b('core:fence', 3, 0.5, 8),
    b('core:fence', 4, 0.5, 5, 90),
    b('core:fence', 4, 0.5, 7, 90),
    b('core:bench', -2.5, 0.35, 6),
    b('core:bush', 2.5, 0.6, 6.5),
    b('core:rock', 3.2, 0.6, 4.6),
    b('core:pine_tree', -3.2, 1.35, 3)
];

// Round Tower — a lookout on a brick plinth: four round pillars, an arched
// doorway under a lintel, a ladder up to a plank platform, a turret of
// round bricks under a cone roof, and barrels and a log at its foot.
const roundTowerBricks = [
    b('core:brick_1x4', 0, 0.5, -1.5),
    b('core:brick_1x4', 0, 0.5, -0.5),
    b('core:brick_1x4', 0, 0.5, 0.5),
    b('core:brick_1x4', 0, 0.5, 1.5),
    b('core:stair_wide', 2.5, 0.5, 0, 180),
    b('core:round_plate_2x2', 0, 1.125, 0),

    b('core:pillar', -1.5, 2.5, -1.5),
    b('core:pillar', 1.5, 2.5, -1.5),
    b('core:pillar', -1.5, 2.5, 1.5),
    b('core:pillar', 1.5, 2.5, 1.5),
    b('core:arch_small', 0, 1.75, -1.5),
    b('core:beam_short', 0, 2.75, -1.5),
    b('core:ladder', 0, 2.5, 1.9),

    b('core:plate_2x2', -1, 4.125, -1, 0, OAK),
    b('core:plate_2x2', 1, 4.125, -1, 0, OAK),
    b('core:plate_2x2', -1, 4.125, 1, 0, OAK),
    b('core:plate_2x2', 1, 4.125, 1, 0, OAK),
    b('core:round_1x1', -1.5, 4.75, -1.5),
    b('core:round_1x1', 1.5, 4.75, -1.5),
    b('core:round_1x1', -1.5, 4.75, 1.5),
    b('core:round_1x1', 1.5, 4.75, 1.5),
    b('core:round_plate_2x2', 0, 5.375, 0),
    b('core:roof_cone', 0, 6.5, 0),

    b('core:barrel', -2.7, 0.5, 1),
    b('core:barrel', -2.7, 0.5, -0.2),
    b('core:log', 0, 0.25, -2.8)
];

export const VillageLibrary = {
    id: 'village',
    structures: [
        // Residential
        new Structure({
            id: 'village:house',
            name: 'House',
            category: 'residential',
            tags: ['house', 'residential', 'dwelling'],
            description: 'A small hipped-roof cottage with a raised entry step, a chimney, a door, and windows on every wall.',
            bricks: houseBricks
        }),
        new Structure({
            id: 'village:garden_cottage',
            name: 'Garden Cottage',
            category: 'residential',
            tags: ['cottage', 'residential', 'garden', 'dwelling'],
            description: 'A plastered cottage with round windows, shutters and a porch, and a fenced front garden with a bench.',
            bricks: gardenCottageBricks
        }),
        new Structure({
            id: 'village:cottage',
            name: 'Cottage',
            category: 'residential',
            tags: ['cottage', 'residential', 'dwelling'],
            description: 'A narrow gable-roofed cottage with a single door and a single window.',
            bricks: cottageBricks
        }),
        new Structure({
            id: 'village:large_house',
            name: 'Large House',
            category: 'residential',
            tags: ['house', 'residential', 'dwelling', 'large'],
            description: 'A two-story house with a floor band, large windows on both levels, a wide hipped roof, and a chimney.',
            bricks: largeHouseBricks
        }),
        new Structure({
            id: 'village:tool_shed',
            name: 'Tool Shed',
            category: 'residential',
            tags: ['shed', 'residential', 'storage', 'utility'],
            description: 'A tiny open-fronted lean-to shed with a single-pitch roof.',
            bricks: toolShedBricks
        }),

        // Agricultural
        new Structure({
            id: 'village:barn',
            name: 'Barn',
            category: 'agricultural',
            tags: ['barn', 'agricultural', 'structural'],
            description: 'A post-and-beam barn frame carrying a hipped roof.',
            bricks: barnBricks
        }),
        new Structure({
            id: 'village:mill',
            name: 'Mill',
            category: 'agricultural',
            tags: ['mill', 'agricultural', 'tower'],
            description: 'A three-tier sandstone mill tower with a hipped cap, window openings and four sails.',
            bricks: millBricks
        }),
        new Structure({
            id: 'village:stable',
            name: 'Stable',
            category: 'agricultural',
            tags: ['stable', 'agricultural', 'animals'],
            description: 'A long low stable with open archway stalls behind a solid rear wall, under a single-pitch roof.',
            bricks: stableBricks
        }),
        new Structure({
            id: 'village:granary',
            name: 'Granary',
            category: 'agricultural',
            tags: ['granary', 'agricultural', 'storage'],
            description: 'A grain store raised on four column stilts, with a hipped roof.',
            bricks: granaryBricks
        }),
        new Structure({
            id: 'village:silo',
            name: 'Silo',
            category: 'agricultural',
            tags: ['silo', 'agricultural', 'storage', 'tower'],
            description: 'A tall, sealed storage tower with an exterior ladder and a double-pointed cap.',
            bricks: siloBricks
        }),

        // Commercial
        new Structure({
            id: 'village:market',
            name: 'Market',
            category: 'commercial',
            tags: ['market', 'commercial', 'stall'],
            description: 'An open-air market stall — four columns, a beamed frame, a hipped roof, and trim detailing.',
            bricks: marketBricks
        }),
        new Structure({
            id: 'village:market_stall',
            name: 'Market Stall',
            category: 'commercial',
            tags: ['market', 'commercial', 'stall', 'small'],
            description: 'A single open-air vendor stall with a flat canopy and a crate of goods.',
            bricks: marketStallBricks
        }),

        // Community
        new Structure({
            id: 'village:village_hall',
            name: 'Village Hall',
            category: 'community',
            tags: ['hall', 'community', 'civic'],
            description: 'A grand single-story hall with a double door, large windows, a wide hipped roof, and a bell cupola.',
            bricks: villageHallBricks
        }),
        new Structure({
            id: 'village:pavilion',
            name: 'Pavilion',
            category: 'community',
            tags: ['pavilion', 'community', 'gazebo'],
            description: 'An open gazebo — four columns and a hipped roof, no walls.',
            bricks: pavilionBricks
        }),
        new Structure({
            id: 'village:small_chapel',
            name: 'Small Chapel',
            category: 'community',
            tags: ['chapel', 'community', 'religious'],
            description: 'A narrow chapel with a full-width archway entrance, a steep gable roof, and a spire.',
            bricks: smallChapelBricks
        }),

        // Infrastructure
        new Structure({
            id: 'village:well',
            name: 'Well',
            category: 'infrastructure',
            tags: ['well', 'infrastructure'],
            description: 'A stone well ring with two columns supporting an arched well-house frame.',
            bricks: wellBricks
        }),
        new Structure({
            id: 'village:bridge',
            name: 'Bridge',
            category: 'infrastructure',
            tags: ['bridge', 'infrastructure', 'crossing'],
            description: 'A short slab-deck bridge resting on two arched piers, with beam railings.',
            bricks: bridgeBricks
        }),
        new Structure({
            id: 'village:village_gate',
            name: 'Village Gate',
            category: 'infrastructure',
            tags: ['gate', 'infrastructure', 'entrance'],
            description: 'Two flanking towers around an open archway passage.',
            bricks: villageGateBricks
        }),
        new Structure({
            id: 'village:watchtower',
            name: 'Watchtower',
            category: 'infrastructure',
            tags: ['watchtower', 'infrastructure', 'defensive', 'tower'],
            description: 'A tall open-topped tower with crenellations, window slits, and an approach stair.',
            bricks: watchtowerBricks
        }),
        new Structure({
            id: 'village:fence_segment',
            name: 'Fence Segment',
            category: 'infrastructure',
            tags: ['fence', 'infrastructure', 'modular'],
            description: 'A modular fence rail on two posts, sized to meet edge to edge with another segment.',
            bricks: fenceSegmentBricks
        }),
        new Structure({
            id: 'village:dock',
            name: 'Dock',
            category: 'infrastructure',
            tags: ['dock', 'pier', 'infrastructure'],
            description: 'A plank platform on column stilts, extending out over open water.',
            bricks: dockBricks
        }),
        new Structure({
            id: 'village:round_tower',
            name: 'Round Tower',
            category: 'infrastructure',
            tags: ['tower', 'lookout', 'infrastructure'],
            description: 'A lookout on a brick plinth: round pillars, an arched doorway, a ladder to a platform and a turret under a cone roof.',
            bricks: roundTowerBricks
        })
    ]
};
