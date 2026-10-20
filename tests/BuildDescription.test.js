import { BUILD_PARTS, brickPart, describeBricks, describeRemixChanges, nearestPaletteColour } from '../core/catalog/BuildDescription.js';
import { buildShape, findReadyMade, withoutReadyMade } from '../core/catalog/BuildSimilarity.js';
import { remixParentPublication } from '../core/publication/RemixLineage.js';
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import { BuildDescriber } from '../application/publication/BuildDescriber.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { createStandardActions } from '../application/editor/EditorActionRegistry.js';
import { buildDescriptionText, remixChangesText } from '../ui/i18n/buildDescriptionText.js';
import { setAppLocale } from '../ui/i18n/i18n.js';
import { LOCALES, SOURCE_LOCALE } from '../ui/i18n/locales.js';
import { assert } from './support/Assert.js';

// What a build is made of, and what a remix changed (core/catalog/BuildDescription.js),
// as facts and as sentences in every language: for a screen reader on a
// build's picture and in the Editor, and under a shared build's "Remixed from".

const brickRegistry = new CreateBrickRegistryUseCase().execute();
const structures = new CreateStructureRegistryUseCase().execute();
const options = {
    definitionOf: (id) => brickRegistry.get(id),
    readyMade: structures.getAll().map((structure) => ({ id: structure.id, shape: buildShape(structure.bricks) }))
};
const bricksOf = (id) => structures.get(id).bricks;
const brick = (definitionId, x, y, z, color = null) => new Brick({ definitionId, position: new Position(x, y, z), color });

// Parts and colours.
{
    assert(brickPart('core:window_round') === 'window' && brickPart('core:door_double') === 'door' && brickPart('core:pine_tree') === 'tree', 'bricks a person would name are parts');
    assert(brickPart('core:wall_1x3') === null && brickPart('core:cube') === null, 'plain bricks are not');
    assert(brickPart('other:big_window', { category: 'window' }) === 'window', 'a brick from another library is named by its category');
    assert(BUILD_PARTS.every((part) => typeof part === 'string') && new Set(BUILD_PARTS).size === BUILD_PARTS.length, 'parts are named once each');
    assert(nearestPaletteColour(0x9a9a9a) === 'stone' && nearestPaletteColour(0xa63a3a) === 'roofRed' && nearestPaletteColour(0x4c8b3a) === 'leaf', 'a colour is named after the nearest palette colour');
    console.log('✓ parts and colours');
}

// Structures are named only when nearly all of one stands there.
{
    const house = findReadyMade(buildShape(bricksOf('village:house')), options.readyMade, { coverageFor: () => 0.95 });
    assert(house.found.length === 1 && house.found[0].id === 'village:house' && house.rest.size === 0, 'the House is found as the House');
    const shape = buildShape(bricksOf('village:house'));
    assert(withoutReadyMade(shape, options.readyMade.map((structure) => structure.shape)).size === findReadyMade(shape, options.readyMade).rest.size, 'withoutReadyMade() takes out what findReadyMade() finds');
    const facts = describeBricks(bricksOf('village:house'), options);
    assert(facts.structures.length === 1 && facts.structures[0].id === 'village:house', 'a House is named as a House, not as the House with a Porch that holds it');
    console.log('✓ structures named only when nearly whole');
}

// A build described.
{
    const empty = describeBricks([], options);
    assert(empty.brickCount === 0 && empty.parts.length === 0, 'an empty build has nothing');
    const bricks = [
        ...bricksOf('village:well').map((b) => b.clone ? b.clone() : b),
        brick('core:window_small', 10, 0, 10), brick('core:window_small', 11, 0, 10),
        brick('core:pine_tree', -6, 0, -6), brick('core:wall_1x3', 12, 0, 10, 0x9a9a9a)
    ];
    const facts = describeBricks(bricks, options);
    assert(facts.brickCount === bricks.length, 'every brick is counted');
    assert(facts.structures.some(({ id }) => id === 'village:well'), 'the Well is named');
    assert(facts.parts.find(({ part }) => part === 'window')?.count === 2 && facts.parts.find(({ part }) => part === 'tree')?.count === 1, 'parts besides the Well\'s own are counted');
    assert(facts.otherBricks === 1, 'the wall is neither a structure nor a part');
    assert(facts.size.width >= 18 && facts.size.height >= 1, 'its size spans every brick');
    assert(facts.colours.length >= 1 && facts.colours.length <= 2, 'one or two main colours');
    console.log('✓ a build described: structures, parts, size, colours');
}

// What a remix changed, on the Collection's own families.
{
    const porch = describeRemixChanges(bricksOf('village:house'), bricksOf('collection:house_with_porch'), options);
    assert(porch.changed && porch.removed.brickCount === 0 && porch.added.brickCount === 6, 'the House with a Porch added six bricks');
    assert(porch.added.parts.some(({ part }) => part === 'furniture'), '…one of them a bench');
    const garden = describeRemixChanges(bricksOf('collection:house_with_porch'), bricksOf('collection:house_with_garden'), options);
    assert(garden.added.parts.find(({ part }) => part === 'bush')?.count === 2 && garden.added.parts.find(({ part }) => part === 'lawn')?.count === 4, 'the garden added bushes and lawns');
    const farm = describeRemixChanges(bricksOf('collection:mill_and_granary'), bricksOf('collection:farmstead'), options);
    assert(farm.added.structures.some(({ id }) => id === 'village:barn'), 'the Farmstead added a Barn');
    const same = describeRemixChanges(bricksOf('village:well'), bricksOf('village:well'), options);
    assert(!same.changed, 'the same bricks changed nothing');
    const before = [brick('core:cube', 0, 0, 0, 0x9a9a9a), brick('core:cube', 1, 0, 0, 0x9a9a9a), brick('core:cube', 2, 0, 0)];
    const after = [brick('core:cube', 0, 0, 0, 0xa63a3a), brick('core:cube', 1, 0, 0, 0x9a9a9a)];
    const painted = describeRemixChanges(before, after, options);
    assert(painted.repainted.brickCount === 1 && painted.repainted.colours[0] === 'roofRed', 'a brick painted another colour is repainted, and its colour named');
    assert(painted.removed.brickCount === 1 && painted.added.brickCount === 0, 'a brick gone is taken away');
    console.log('✓ remix changes: added structures and parts, repainted, taken away');
}

// The version a remix was made from.
{
    const parent = (publishedAt) => ({ documentId: 'p', publishedAt });
    const remix = { documentId: 'r', parentDocumentId: 'p', publishedAt: '2026-10-10T00:00:00Z' };
    const older = parent('2026-10-01T00:00:00Z');
    const newer = parent('2026-10-05T00:00:00Z');
    const later = parent('2026-10-20T00:00:00Z');
    assert(remixParentPublication(remix, [older, newer, later]) === newer, 'the newest version published before the remix');
    assert(remixParentPublication(remix, [later]) === later, 'or the newest, when every version is later');
    assert(remixParentPublication(remix, [{ documentId: 'x' }]) === null && remixParentPublication({ documentId: 'o' }, [older]) === null, 'none for another build, or for an original');
    assert(await new BuildDescriber().remixChangesOf(remix, [], { parentPublications: [] }) === null, 'a remix whose original isn\'t found has no changes to tell');
    console.log('✓ the version a remix was made from');
}

// In English.
{
    await setAppLocale(SOURCE_LOCALE);
    const describer = new BuildDescriber();
    const house = buildDescriptionText(await describer.describe(bricksOf('village:house')));
    assert(house.startsWith('A build of 46 bricks, about 7 by 8 and 5 high. It has a House.'), `the House described (got "${house}")`);
    assert(buildDescriptionText(await describer.describe([])) === 'An empty build: no bricks yet.', 'an empty build');
    const garden = remixChangesText(await describer.remixChanges(bricksOf('collection:house_with_porch'), bricksOf('collection:house_with_garden')));
    assert(garden === 'What changed: Added 2 bushes, 4 patches of lawn, and 6 other bricks.', `the garden's changes (got "${garden}")`);
    const farm = remixChangesText(await describer.remixChanges(bricksOf('collection:mill_and_granary'), bricksOf('collection:farmstead')));
    assert(farm.includes('a Barn'), `the Farmstead's Barn (got "${farm}")`);
    assert(remixChangesText(await describer.remixChanges(bricksOf('village:well'), bricksOf('village:well'))) === 'No bricks changed from the build it remixes.', 'nothing changed');
    assert(remixChangesText(null) === null, 'unknown changes say nothing');
    console.log('✓ English sentences');
}

// In every language, with every placeholder filled.
{
    const describer = new BuildDescriber();
    const village = await describer.describe([...bricksOf('village:well'), brick('core:window_small', 10, 0, 10), brick('core:lantern', 11, 0, 10)]);
    const changes = await describer.remixChanges([brick('core:cube', 0, 0, 0, 0x9a9a9a), brick('core:cube', 5, 0, 0)], [brick('core:cube', 0, 0, 0, 0xa63a3a), brick('core:bed', 1, 0, 0), brick('core:wall_1x3', 2, 0, 0)]);
    for (const { code } of LOCALES) {
        await setAppLocale(code);
        for (const text of [buildDescriptionText(village), remixChangesText(changes), buildDescriptionText(await describer.describe([]))]) {
            assert(typeof text === 'string' && text.length > 10 && !/[{}]/.test(text) && !text.includes('buildDescription.') && !text.includes('remixChanges.'), `${code}: "${text}" is whole`);
        }
    }
    await setAppLocale(SOURCE_LOCALE);
    console.log('✓ every language says it whole');
}

// Describe the Build is an action, on I, when the surface can describe.
{
    const feedback = { show() {} };
    let described = 0;
    const withIt = createStandardActions({ session: {}, feedback, ui: { describeBuild: () => { described += 1; } } }).find((action) => action.id === 'ui.describeBuild');
    assert(withIt && withIt.shortcut === 'I' && withIt.keys[0].key === 'i', 'Describe the Build is on I');
    assert(withIt.enabled({}) === true, 'enabled where the surface describes');
    withIt.execute({ context: {} });
    assert(described === 1, 'and runs the surface\'s description');
    const without = createStandardActions({ session: {}, feedback, ui: {} }).find((action) => action.id === 'ui.describeBuild');
    assert(without.enabled({}) === false, 'unavailable where it can\'t');
    console.log('✓ Describe the Build on I');
}
