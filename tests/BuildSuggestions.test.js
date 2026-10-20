import { BuildDescriber } from '../application/publication/BuildDescriber.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { descriptionSuggestion, titleSuggestions } from '../ui/i18n/buildSuggestionText.js';
import { familyChangesText } from '../ui/components/remix/familyChangesText.js';
import { setAppLocale } from '../ui/i18n/i18n.js';
import { LOCALES, SOURCE_LOCALE } from '../ui/i18n/locales.js';
import { assert } from './support/Assert.js';

// Build Properties' suggested titles and description (ui/i18n/buildSuggestionText.js),
// and what each remix in a family tree changed (BuildDescriber#familyChanges()).

const structures = new CreateStructureRegistryUseCase().execute();
const bricksOf = (id) => structures.get(id).bricks;
const describer = new BuildDescriber();

// Titles and a description, in English.
{
    await setAppLocale(SOURCE_LOCALE);
    const facts = await describer.describe(bricksOf('collection:farmstead'));
    const changes = await describer.remixChanges(bricksOf('collection:mill_and_granary'), bricksOf('collection:farmstead'));
    const titles = titleSuggestions({ facts, changes, parentTitle: 'Mill and Granary', currentTitle: 'Farmstead' });
    assert(titles[0] === 'Mill and Granary with a Barn', `a remix is first suggested as the original with what it added (got ${titles[0]})`);
    assert(!titles.includes('Farmstead'), 'the title it already has is not suggested');
    assert(titles.includes('The Sandstone Build'), 'nor are colours forgotten');
    assert(new Set(titles).size === titles.length && titles.length <= 5, 'up to five, each once');
    const pair = titleSuggestions({ facts: await describer.describe([...bricksOf('village:well'), ...bricksOf('village:bridge')]) });
    assert(pair[0] === 'Well and Bridge', `an original is named after its structures (got ${pair[0]})`);
    const trees = titleSuggestions({ facts: { brickCount: 3, structures: [], parts: [{ part: 'tree', count: 3 }], colours: [] } });
    assert(trees[0] === 'The Little Wood', 'a build of trees is a little wood');
    const description = descriptionSuggestion({ facts, changes, parentTitle: 'Mill and Granary' });
    assert(description === 'Built with a Farmstead. Mostly Sandstone and Oak. A remix of Mill and Granary. Added a Barn, 2 pieces of furniture, and 12 other bricks.', `the description (got "${description}")`);
    assert(descriptionSuggestion({ facts: await describer.describe([]) }) === '' && titleSuggestions({ facts: await describer.describe([]) }).length === 0, 'an empty build has nothing to suggest');
    console.log('✓ suggested titles and description');
}

// Every language, every placeholder filled.
{
    const facts = await describer.describe(bricksOf('collection:farmstead'));
    const changes = await describer.remixChanges(bricksOf('collection:mill_and_granary'), bricksOf('collection:farmstead'));
    const parts = { brickCount: 30, structures: [], parts: ['window', 'door', 'roof', 'stairs', 'arch', 'fence', 'chimney', 'furniture', 'lantern', 'tree', 'bush', 'rock', 'lawn'].map((part, i) => ({ part, count: 13 - i })), colours: ['leaf'] };
    for (const { code } of LOCALES) {
        await setAppLocale(code);
        const texts = [
            ...titleSuggestions({ facts, changes, parentTitle: 'Mill' }),
            ...titleSuggestions({ facts: parts }),
            descriptionSuggestion({ facts, changes, parentTitle: 'Mill' })
        ];
        for (const part of ['window', 'door', 'roof', 'stairs', 'arch', 'fence', 'chimney', 'furniture', 'lantern', 'tree', 'bush', 'rock', 'lawn']) {
            texts.push(...titleSuggestions({ facts: { brickCount: 1, structures: [], parts: [{ part, count: 1 }], colours: [] }, changes: { changed: true, added: { brickCount: 1, structures: [], parts: [{ part, count: 1 }] } }, parentTitle: 'Mill' }));
        }
        for (const text of texts) assert(text && !/[{}]/.test(text) && !/titleSuggestion\.|descriptionSuggestion\./.test(text), `${code}: "${text}" is whole`);
    }
    await setAppLocale(SOURCE_LOCALE);
    console.log('✓ every language suggests whole titles and descriptions');
}

// What each remix in a family tree changed.
{
    const store = new Map(['village:house', 'collection:house_with_porch', 'collection:house_with_garden', 'collection:house_with_tower'].map((id) => [id, bricksOf(id)]));
    const member = (id, remixes = []) => ({ documentId: id, title: id, publication: { id }, remixes });
    const family = {
        ancestors: [member('village:house')],
        build: member('collection:house_with_porch'),
        remixes: [member('collection:house_with_garden'), member('collection:house_with_tower')]
    };
    const changes = await describer.familyChanges(family, { readBricks: (one) => store.get(one.documentId) || null });
    assert(changes.size === 3 && changes.get('collection:house_with_porch').added.brickCount === 6, 'each remix is compared with the build above it');
    const fake = { familyChanges: async () => changes };
    const texts = await familyChangesText(fake, [family]);
    assert(texts.get('collection:house_with_garden') === 'Added 2 bushes, 4 patches of lawn, and 6 other bricks.', `the garden's line (got "${texts.get('collection:house_with_garden')}")`);
    assert(texts.has('collection:house_with_porch') && texts.has('collection:house_with_tower'), 'every remix whose bricks were read has a line');
    assert(!texts.has('village:house'), 'the original has none');
    assert((await familyChangesText(null, [family])).size === 0, 'no describer, no lines');
    const none = await new BuildDescriber().familyChanges(family, { contentStore: null });
    assert(none.size === 0, 'familyChanges() says nothing for builds it cannot read');
    assert((await new BuildDescriber().familyChanges(null)).size === 0, 'or for no family');
    console.log('✓ what each remix in a family changed');
}
