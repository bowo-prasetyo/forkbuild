// The built-in showcase library (core/library/ShowcaseLibrary.js): three
// larger ready-made builds made of ordinary bricks. The per-structure
// integrity checks every built-in structure goes through (unique brick ids,
// known definitions, no duplicate bricks, deterministic serialization,
// rendering, forking) are in tests/VillageLibraryExpansion.test.js; this
// file checks what is particular to these three.
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { libraryCategoryName, libraryItemDescription, libraryItemKey, libraryItemName } from '../ui/i18n/libraryText.js';
import { hasMessage } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

const brickRegistry = new CreateBrickRegistryUseCase().execute();
const structures = ShowcaseLibrary.structures;
const byId = new Map(structures.map((structure) => [structure.id, structure]));
const count = (structure, definitionId) => structure.bricks.filter((brick) => brick.definitionId === definitionId).length;

// The catalog: three showcase structures, registered with the built-in ones,
// each named and described in the app's messages.
{
    assert(ShowcaseLibrary.id === 'showcase', 'the library is namespaced "showcase"');
    assert(structures.map((structure) => structure.id).join() === 'showcase:castle,showcase:harbor_island,showcase:village_square',
        'it holds the castle, the harbor island and the village square');
    const registry = new CreateStructureRegistryUseCase().execute();
    for (const structure of structures) {
        assert(registry.get(structure.id) === structure, `${structure.id} is in the built-in structure registry`);
        assert(structure.category === 'showcase', `${structure.id} is in the showcase category`);
        assert(structure.tags.includes('showcase'), `${structure.id} is tagged showcase`);
        const key = libraryItemKey(structure.id);
        assert(hasMessage(key) && hasMessage(`${key}.description`), `${structure.id} has a name and description message (${key})`);
        assert(libraryItemName(structure) === structure.name && libraryItemDescription(structure) === structure.description,
            `${structure.id}: the English messages match the library's own name and description`);
    }
    assert(libraryCategoryName('showcase') === 'showcase', 'the category has a message');
    console.log('✓ three showcase structures, registered, named and described');
}

// Every build stands on the ground: nothing below it, something on it.
{
    for (const structure of structures) {
        const bounds = SpatialBounds.fromBricks(structure.bricks, brickRegistry);
        assert(Math.abs(bounds.min.y) < 1e-9, `${structure.id} rests on the ground (lowest point ${bounds.min.y})`);
        assert(structure.bricks.every((brick) => brick.position.y > 0), `${structure.id}: every brick's center is above the ground`);
    }
    console.log('✓ every showcase build stands on the ground');
}

// What each one is made of.
{
    const castle = byId.get('showcase:castle');
    const bounds = SpatialBounds.fromBricks(castle.bricks, brickRegistry);
    assert(bounds.size.x === 16 && bounds.size.z === 16, `the castle is 16 × 16 (${bounds.size.x} × ${bounds.size.z})`);
    assert(count(castle, 'core:arch') === 2, 'the castle\'s gate is two arches wide');
    assert(count(castle, 'core:roof_hip') === 8, 'four towers and the keep carry hipped roofs');
    assert(count(castle, 'core:door') === 1, 'the keep has a door');
    const merlons = castle.bricks.filter((brick) => brick.definitionId === 'core:cube');
    assert(merlons.length === 24 && merlons.every((brick) => brick.color === 0x7d7d7d), 'twenty-four battlements, stone-colored');

    const island = byId.get('showcase:harbor_island');
    const sand = island.bricks.filter((brick) => brick.definitionId === 'core:block_2x2' && brick.color === 0xd9c48a);
    const grass = island.bricks.filter((brick) => brick.definitionId === 'core:block_2x2' && brick.color === 0x6fa35a);
    assert(sand.length > grass.length && grass.length > 0, `a beach ring round a grassy middle (${sand.length} sand, ${grass.length} grass)`);
    assert(island.bricks.some((brick) => brick.definitionId === 'core:cube' && brick.color === 0xffd54f), 'the lighthouse has a lit lantern');
    assert(count(island, 'core:door') === 1, 'the cottage stands on it');
    const dock = island.bricks.filter((brick) => brick.definitionId === 'core:plate_2x4' && brick.position.z < -6);
    assert(dock.length === 3, 'two dock plates and the boat run south of the beach');

    const square = byId.get('showcase:village_square');
    const squareBounds = SpatialBounds.fromBricks(square.bricks, brickRegistry);
    assert(squareBounds.size.x === 20 && squareBounds.size.z === 20, `the square is 20 × 20 (${squareBounds.size.x} × ${squareBounds.size.z})`);
    const placed = ['village:house', 'village:small_chapel', 'village:cottage', 'village:well', 'village:market_stall', 'village:market'];
    const villageBricks = placed.reduce((sum, id) => sum + VillageLibrary.structures.find((s) => s.id === id).bricks.length, 0);
    assert(square.bricks.length === 25 + villageBricks, `25 plaza slabs and the six Village structures' bricks (${square.bricks.length})`);
    console.log('✓ the castle, the island and the square have what their descriptions promise');
}

// Village structures are copied in, never shared: the Village library's own
// bricks are neither reused nor moved.
{
    const villageBricks = new Set(VillageLibrary.structures.flatMap((structure) => structure.bricks));
    const villageIds = new Set([...villageBricks].map((brick) => brick.id));
    for (const structure of structures) {
        assert(structure.bricks.every((brick) => !villageBricks.has(brick) && !villageIds.has(brick.id)),
            `${structure.id} holds its own bricks, not the Village's`);
    }
    const house = VillageLibrary.structures.find((structure) => structure.id === 'village:house');
    const floor = house.bricks[0];
    assert(floor.definitionId === 'core:slab_4x4' && floor.position.x === 0 && floor.position.y === 0.125 && floor.position.z === 0,
        'the Village house is where it always was');
    console.log('✓ the Village structures the showcase reuses are copied, not shared or moved');
}

console.log('\n✅ All ShowcaseLibrary tests passed.');
