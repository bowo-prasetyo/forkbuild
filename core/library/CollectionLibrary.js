import { Structure } from '../Structure.js';
import { Brick } from '../Brick.js';
import { Position } from '../Position.js';
import { VillageLibrary } from './VillageLibrary.js';

// The built-in "collection" library: ready-made builds that are remixes of
// other built-in ones, a step at a time, so a new player can see what a
// family of remixes looks like before anyone has published one
// (COLLECTION_REMIXED_FROM below; the Repository shows them as example
// family trees). Each build is literally its parent's bricks with more
// added or changed, as a remix in the Editor would be. Like
// core/library/ShowcaseLibrary.js it is content only: ordinary core:*
// bricks, each structure in its own local space (y from the ground up, a
// brick's position its center), and a copy of one is an ordinary document.
//
//   village:house ─ house_with_porch ─┬ house_with_garden
//                                     └ house_with_tower
//   village:watchtower ─ lighthouse ─ keepers_lighthouse
//   village:mill ─ mill_and_granary ─ farmstead
//
// A Structure never stores where it came from (core/Structure.js), so the
// family lives here, beside the library, and nowhere in the bricks.

function b(definitionId, x, y, z, rotation = 0, color = null) {
    return new Brick({ definitionId, position: new Position(x, y, z), rotation, color });
}

// Copies of a structure's bricks, moved by (dx, dy, dz); `recolor` may
// change a copy's color by its index.
function copyOf(bricks, dx = 0, dy = 0, dz = 0, recolor = null) {
    return bricks.map((brick, index) => b(
        brick.definitionId,
        brick.position.x + dx,
        brick.position.y + dy,
        brick.position.z + dz,
        brick.rotation,
        recolor ? recolor(brick, index) : brick.color
    ));
}

function village(id) {
    return VillageLibrary.structures.find((structure) => structure.id === id).bricks;
}

const OAK = 0x8b5a2b;
const WHITE = 0xf2f2f2;
const RED = 0xc0392b;
const LAMP = 0xffd54f;
const SLATE = 0x55606e;
const GRASS = 0x6fa35a;

// ---------------------------------------------------------------------------
// The house family. The Village House's door faces south (-z).
// ---------------------------------------------------------------------------

// A porch out front: an oak deck, two posts carrying a beam, and a bench.
// The House's front wall stands at z = -3, its doorstep just outside.
const houseWithPorchBricks = [
    ...copyOf(village('village:house')),
    b('core:plate_2x2', -1, 0.125, -5, 0, OAK),
    b('core:plate_2x2', 1, 0.125, -5, 0, OAK),
    b('core:post', -1.75, 1.75, -5.75),
    b('core:post', 1.75, 1.75, -5.75),
    b('core:beam', 0, 3.5, -5.75, 0, OAK),
    b('core:bench', 1, 0.5, -4.5)
];

// The porch house, with lawns either side, bushes by the door and a fence
// along the back.
const houseWithGardenBricks = [
    ...copyOf(houseWithPorchBricks),
    b('core:lawn_2x2', -5, 0.05, -1, 0, GRASS),
    b('core:lawn_2x2', -5, 0.05, 1, 0, GRASS),
    b('core:lawn_2x2', 5, 0.05, -1, 0, GRASS),
    b('core:lawn_2x2', 5, 0.05, 1, 0, GRASS),
    b('core:bush', -3, 0.5, -4.5),
    b('core:bush', 3, 0.5, -4.5),
    ...copyOf(village('village:fence_segment'), -2, 0, 4.5),
    ...copyOf(village('village:fence_segment'), 2, 0, 4.5)
];

// The porch house, with a round stone tower built on to its east.
const houseWithTowerBricks = [
    ...copyOf(houseWithPorchBricks),
    ...copyOf(village('village:round_tower'), 7, 0, 0)
];

// ---------------------------------------------------------------------------
// The lighthouse family: the Watchtower, one storey taller.
// ---------------------------------------------------------------------------

// The Watchtower's three blocks, door, stair and windows, striped red and
// white, with a fourth block, a gallery, a lamp and a cone roof on top. Its
// crown of trim gives way to the new storey.
const watchtower = village('village:watchtower').filter((brick) => brick.definitionId !== 'core:trim');
const lighthouseBricks = [
    ...copyOf(watchtower, 0, 0, 0, (brick) => {
        if (brick.definitionId !== 'core:block_2x2') return brick.color;
        return Math.round(brick.position.y) === 3 ? RED : WHITE;
    }),
    b('core:block_2x2', 0, 7, 0, 0, RED),
    b('core:round_plate_2x2', 0, 8.125, 0, 0, WHITE),
    b('core:round_1x1', 0, 8.75, 0, 0, LAMP),
    b('core:roof_cone', 0, 10.25, 0, 0, SLATE)
];

// The lighthouse with the keeper's cottage at its foot.
const keepersLighthouseBricks = [
    ...copyOf(lighthouseBricks),
    ...copyOf(village('village:cottage'), 4.5, 0, 0)
];

// ---------------------------------------------------------------------------
// The mill family. The Mill's sails face south (-z).
// ---------------------------------------------------------------------------

// The Mill, with a granary to its east to keep the flour.
const millAndGranaryBricks = [
    ...copyOf(village('village:mill')),
    ...copyOf(village('village:granary'), 6.5, 0, 0)
];

// The mill and granary, with a barn to the west, a fence along the front
// and barrels by the barn.
const farmsteadBricks = [
    ...copyOf(millAndGranaryBricks),
    ...copyOf(village('village:barn'), -6, 0, 0),
    ...[-6, -2, 2, 6].flatMap((x) => copyOf(village('village:fence_segment'), x, 0, -5.5)),
    b('core:barrel', -3.5, 0.5, -2.5),
    b('core:barrel', -3.5, 0.5, -1.4)
];

export const CollectionLibrary = {
    id: 'collection',
    structures: [
        new Structure({
            id: 'collection:house_with_porch',
            name: 'House with a Porch',
            category: 'collection',
            tags: ['house', 'porch', 'remix', 'collection'],
            description: 'The House, remixed: a wooden porch out front, a bench, and a beam on two posts.',
            bricks: houseWithPorchBricks
        }),
        new Structure({
            id: 'collection:house_with_garden',
            name: 'House with a Garden',
            category: 'collection',
            tags: ['house', 'garden', 'remix', 'collection'],
            description: 'The House with a Porch, remixed again: lawns on both sides, bushes by the door and a fence along the back.',
            bricks: houseWithGardenBricks
        }),
        new Structure({
            id: 'collection:house_with_tower',
            name: 'House with a Tower',
            category: 'collection',
            tags: ['house', 'tower', 'remix', 'collection'],
            description: 'Another remix of the House with a Porch: a round stone tower built on beside it.',
            bricks: houseWithTowerBricks
        }),
        new Structure({
            id: 'collection:lighthouse',
            name: 'Lighthouse',
            category: 'collection',
            tags: ['lighthouse', 'tower', 'remix', 'collection'],
            description: 'The Watchtower, remixed into a lighthouse: one more storey, red and white stripes, a gallery and a lamp under a cone roof.',
            bricks: lighthouseBricks
        }),
        new Structure({
            id: 'collection:keepers_lighthouse',
            name: 'Lighthouse and Keeper\'s Cottage',
            category: 'collection',
            tags: ['lighthouse', 'cottage', 'remix', 'collection'],
            description: 'The Lighthouse, remixed: the keeper\'s cottage now stands at its foot.',
            bricks: keepersLighthouseBricks
        }),
        new Structure({
            id: 'collection:mill_and_granary',
            name: 'Mill and Granary',
            category: 'collection',
            tags: ['mill', 'granary', 'farm', 'remix', 'collection'],
            description: 'The Mill, remixed: a granary beside it to keep the flour.',
            bricks: millAndGranaryBricks
        }),
        new Structure({
            id: 'collection:farmstead',
            name: 'Farmstead',
            category: 'collection',
            tags: ['farm', 'barn', 'mill', 'remix', 'collection'],
            description: 'The Mill and Granary, remixed into a farm: a barn, a fence along the front and barrels by the door.',
            bricks: farmsteadBricks
        })
    ]
};

// What each collection build was remixed from: a built-in structure id.
export const COLLECTION_REMIXED_FROM = Object.freeze({
    'collection:house_with_porch': 'village:house',
    'collection:house_with_garden': 'collection:house_with_porch',
    'collection:house_with_tower': 'collection:house_with_porch',
    'collection:lighthouse': 'village:watchtower',
    'collection:keepers_lighthouse': 'collection:lighthouse',
    'collection:mill_and_granary': 'village:mill',
    'collection:farmstead': 'collection:mill_and_granary'
});

// The example families, each from its original: { id, remixes: [...] },
// remixes in library order.
export function collectionFamilies() {
    const children = (parentId) => CollectionLibrary.structures
        .filter((structure) => COLLECTION_REMIXED_FROM[structure.id] === parentId)
        .map((structure) => ({ id: structure.id, remixes: children(structure.id) }));
    const roots = [...new Set(Object.values(COLLECTION_REMIXED_FROM))]
        .filter((id) => !Object.prototype.hasOwnProperty.call(COLLECTION_REMIXED_FROM, id));
    return roots.map((id) => ({ id, remixes: children(id) }));
}
