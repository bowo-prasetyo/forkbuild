// The built-in collection library (core/library/CollectionLibrary.js): ready-
// made builds that are remixes of other built-in ones, a step at a time, and
// the example families they make. The integrity checks every built-in
// structure goes through are in tests/VillageLibraryExpansion.test.js; this
// file checks what is particular to these.
import { CollectionLibrary, COLLECTION_REMIXED_FROM, collectionFamilies } from '../core/library/CollectionLibrary.js';
import { SpatialBounds } from '../core/world/SpatialBounds.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { CHALLENGE_THEMES } from '../core/challenge/BuildChallenge.js';
import { libraryCategoryName, libraryItemDescription, libraryItemKey, libraryItemName } from '../ui/i18n/libraryText.js';
import { hasMessage } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

const brickRegistry = new CreateBrickRegistryUseCase().execute();
const registry = new CreateStructureRegistryUseCase().execute();
const structures = CollectionLibrary.structures;

// Registered, named and described, in the collection category.
{
    assert(CollectionLibrary.id === 'collection' && structures.length === 7, 'seven collection builds');
    for (const structure of structures) {
        assert(registry.get(structure.id) === structure, `${structure.id} is in the built-in structure registry`);
        assert(structure.category === 'collection' && structure.tags.includes('remix'), `${structure.id} is a collection remix`);
        const key = libraryItemKey(structure.id);
        assert(hasMessage(key) && hasMessage(`${key}.description`), `${structure.id} has a name and description message (${key})`);
        assert(libraryItemName(structure) === structure.name && libraryItemDescription(structure) === structure.description,
            `${structure.id}: the English messages match the library's own name and description`);
        const bounds = SpatialBounds.fromBricks(structure.bricks, brickRegistry);
        assert(Math.abs(bounds.min.y) < 1e-9, `${structure.id} rests on the ground (lowest point ${bounds.min.y})`);
    }
    assert(libraryCategoryName('collection') === 'collection', 'the category has a message');
    console.log('✓ seven collection builds, registered, named and described, on the ground');
}

// Each is a remix of what it came from: every brick of the original is still
// there (the lighthouse recolors its blocks and gives up the watchtower's
// crown of trim for a new storey), with more added.
{
    const same = (a, b) => a.definitionId === b.definitionId && a.rotation === b.rotation
        && a.position.x === b.position.x && a.position.y === b.position.y && a.position.z === b.position.z;
    for (const structure of structures) {
        const parent = registry.get(COLLECTION_REMIXED_FROM[structure.id]);
        assert(parent, `${structure.id} was remixed from a built-in structure (${COLLECTION_REMIXED_FROM[structure.id]})`);
        const kept = parent.bricks.filter((brick) => !(structure.id === 'collection:lighthouse' && brick.definitionId === 'core:trim'));
        const missing = kept.filter((brick) => !structure.bricks.some((other) => same(brick, other)));
        assert(missing.length === 0, `${structure.id} keeps every brick of ${parent.id} (missing ${missing.length})`);
        assert(structure.bricks.length > kept.length, `${structure.id} adds to ${parent.id}`);
    }
    const lighthouse = registry.get('collection:lighthouse');
    const colors = new Set(lighthouse.bricks.filter((brick) => brick.definitionId === 'core:block_2x2').map((brick) => brick.color));
    assert(colors.size === 2, 'the lighthouse is striped in two colors');
    console.log('✓ every collection build keeps what it was remixed from and adds to it');
}

// The families: three originals, each with its remixes underneath.
{
    const families = collectionFamilies();
    const shape = (node) => `${node.id}(${node.remixes.map(shape).join(',')})`;
    assert(families.map(shape).join(' ') === [
        'village:house(collection:house_with_porch(collection:house_with_garden(),collection:house_with_tower()))',
        'village:watchtower(collection:lighthouse(collection:keepers_lighthouse()))',
        'village:mill(collection:mill_and_granary(collection:farmstead()))'
    ].join(' '), `three families, a step at a time (got ${families.map(shape).join(' ')})`);
    console.log('✓ the house, the lighthouse and the mill each make a family of remixes');
}

// Every challenge theme starts from, and suggests, builds the registry has.
{
    for (const theme of CHALLENGE_THEMES) {
        for (const id of [theme.starterStructureId, ...theme.ideaStructureIds]) {
            assert(registry.has(id), `${theme.id}: ${id} is a built-in structure`);
        }
        const key = theme.id.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());
        assert(hasMessage(`challenge.theme.${key}.title`) && hasMessage(`challenge.theme.${key}.brief`), `${theme.id} has a title and a brief`);
    }
    assert(CHALLENGE_THEMES.find((theme) => theme.id === 'lighthouse').starterStructureId === 'collection:lighthouse',
        'the lighthouse week starts from a lighthouse, not the watchtower the tower week has');
    console.log('✓ every challenge theme starts from, and suggests, built-in builds, and has its words');
}
