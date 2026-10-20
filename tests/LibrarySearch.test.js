import { normalizeQuery, searchLibrary, splitWordList, textMatches, wordsFound } from '../core/library/LibrarySearch.js';
import { CoreLibrary } from '../core/library/CoreLibrary.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { ShowcaseLibrary } from '../core/library/ShowcaseLibrary.js';
import { CollectionLibrary } from '../core/library/CollectionLibrary.js';
import { BRICK_SEARCH, STRUCTURE_SEARCH, foundIds } from '../ui/components/BuildLibraryPanel.js';
import { librarySearchIgnoredWords } from '../ui/i18n/libraryText.js';
import { setAppLocale } from '../ui/i18n/i18n.js';
import { LOCALES, SOURCE_LOCALE } from '../ui/i18n/locales.js';
import { assert } from './support/Assert.js';

// The Build Library's search: the text typed inside an item's text first,
// and, when that finds nothing, the item's own words inside what was typed
// (core/library/LibrarySearch.js), against the real libraries and each
// language's player words.

const structures = [VillageLibrary, ShowcaseLibrary, CollectionLibrary].flatMap((library) => library.structures);
const bricks = CoreLibrary.definitions;

function findStructures(query) {
    return [...foundIds(query, structures, STRUCTURE_SEARCH, librarySearchIgnoredWords())];
}

function findBricks(query) {
    return [...foundIds(query, bricks, BRICK_SEARCH, librarySearchIgnoredWords())];
}

// The rules on their own.
{
    assert(normalizeQuery('  Bridge ') === 'bridge' && normalizeQuery(null) === '', 'a query is trimmed and lowercased');
    assert(textMatches('', ['x']) && textMatches('idg', ['Bridge']) && !textMatches('well', ['Bridge']), 'rule 1 looks for the text inside the fields');
    assert(splitWordList('river, cross ,stream') .join('|') === 'river|cross|stream' && splitWordList('川、橋').join('|') === '川|橋', 'a word list splits on commas, Japanese ones included');
    assert(splitWordList(undefined).length === 0, 'no word list, no words');

    const items = [
        { id: 'bridge', text: ['Bridge'], words: ['Bridge', 'river', 'cross'] },
        { id: 'dock', text: ['Dock'], words: ['Dock', 'river', 'boat'] },
        { id: 'house', text: ['House and Garden'], words: ['House and Garden'] }
    ];
    const rules = { text: (item) => item.text, words: (item) => item.words, ignoredWords: ['and'] };
    const ids = (query) => searchLibrary(query, items, rules).map((item) => item.id).join(',');
    assert(ids('') === 'bridge,dock,house', 'an empty query finds everything, in order');
    assert(ids('o') === 'dock,house', 'text found as typed wins, as it always did');
    assert(ids('something to cross the river') === 'bridge', 'otherwise the items with the most of their words in it');
    assert(ids('by the river') === 'bridge,dock', 'a tie shows every item that tied');
    assert(ids('rivers') === 'bridge,dock' && ids('Rivers!') === 'bridge,dock', 'a word with a short ending still counts');
    assert(ids('riverside walk') === '', 'a longer word is not the same word');
    assert(ids('cats and dogs') === '', 'an ignored word never counts');
    assert(ids('a garden please') === 'house', 'a word of a name counts on its own');
    assert(wordsFound('to', ['to', 'at']) === 0, 'words shorter than three letters never count');
    assert(wordsFound('la riviere', ['rivière']) === 1 && wordsFound('rivière', ['riviere']) === 1, 'accents are ignored');
    assert(wordsFound('川を渡りたい', ['川', '渡', '橋']) === 2, 'a word in a script without spaces counts anywhere in the text');
    assert(wordsFound('강을 건너고 싶어', ['강', '건너']) === 2, 'Korean particles joined on don\'t stop a word counting');
    assert(wordsFound('the big house', ['big house']) === 3, 'a phrase counts whole, and each of its words on its own');
    assert(wordsFound('a house, big', ['big house']) === 2, '…whole only when its words come in order');
    console.log('✓ search rules: text first, then the most of an item\'s words');
}

// English, against the real libraries.
{
    await setAppLocale(SOURCE_LOCALE);
    assert(findStructures('brid').join() === 'village:bridge', 'typing part of a name still finds it');
    assert(findStructures('something to cross the river').join() === 'village:bridge', 'a sentence about crossing a river finds the Bridge');
    assert(findStructures('somewhere to get water to drink').join() === 'village:well', 'water to drink finds the Well');
    assert(findStructures('I want to sell bread').includes('village:market_stall'), 'selling finds the market');
    assert(findStructures('a place for my horses').join() === 'village:stable', 'horses find the Stable');
    assert(findStructures('a church for a wedding').join() === 'village:small_chapel', 'a church finds the Chapel');
    assert(findStructures('a home for the king and his knights').join() === 'showcase:castle', 'a king and knights find the Castle over any home');
    assert(findStructures('xyzzy').length === 0, 'nonsense finds nothing');
    assert(findBricks('somewhere to sleep').join() === 'core:bed', 'sleeping finds the Bed');
    assert(findBricks('light for the night').join() === 'core:lantern', 'light at night finds the Lantern');
    assert(findBricks('a tall pine in the forest').join() === 'core:pine_tree', 'a pine in the forest finds the Pine Tree');
    console.log('✓ English: sentences find the structure or brick they describe');
}

// Every language has its words, and they find things.
{
    // Each language's user guide (docs/user/<code>/02-TheEditor.md) gives
    // the river sentence and the sleeping word as examples.
    const sleep = { de: 'schlafen', es: 'dormir', fr: 'dormir', id: 'tidur', ja: '寝る', ko: '침실', 'pt-BR': 'dormir' };
    const sentences = {
        de: ['über den Fluss', 'village:bridge'],
        es: ['quiero cruzar el río', 'village:bridge'],
        fr: ['traverser la riviere', 'village:bridge'],
        id: ['saya mau menyeberang sungai', 'village:bridge'],
        ja: ['川を渡りたい', 'village:bridge'],
        ko: ['강을 건너고 싶어요', 'village:bridge'],
        'pt-BR': ['quero atravessar o rio', 'village:bridge']
    };
    for (const locale of LOCALES.map((entry) => entry.code).filter((code) => code !== SOURCE_LOCALE && sentences[code])) {
        await setAppLocale(locale);
        const [sentence, expected] = sentences[locale];
        assert(librarySearchIgnoredWords().length > 0, `${locale} has ignored words`);
        assert(findStructures(sentence).join() === expected, `${locale}: "${sentence}" finds ${expected} (got ${findStructures(sentence).join()})`);
        assert(findBricks(sleep[locale]).join() === 'core:bed', `${locale}: "${sleep[locale]}" finds the Bed (got ${findBricks(sleep[locale]).join()})`);
    }
    await setAppLocale(SOURCE_LOCALE);
    console.log('✓ every language: a sentence about crossing a river finds the Bridge, and sleeping the Bed');
}
