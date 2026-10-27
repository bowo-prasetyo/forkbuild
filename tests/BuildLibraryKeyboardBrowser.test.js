// @environment browser
import { createApp, h, nextTick } from 'vue';
import BuildLibraryPanel from '../ui/components/BuildLibraryPanel.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { PaletteUseCase } from '../application/editor/PaletteUseCase.js';
import { assert } from './support/Assert.js';

// The Build Library from the keyboard (finding P1-7 of
// docs/reviews/EditorPlacementUX-2026-10-27.md): bricks and structures are
// buttons, one per tab is the Tab stop, the arrow keys move between them,
// Down from the search box goes to what it found, and a tile does what a
// click does.

const registry = new CreateBrickRegistryUseCase().execute();
const editorContext = new CreateEditorContextUseCase().execute();
const paletteUseCase = new PaletteUseCase(registry, editorContext);
const structureGroups = new CreateStructureRegistryUseCase().execute().groupByCategory();
const placed = [];
const host = document.createElement('div');
document.body.appendChild(host);
const app = createApp({
    render: () => h(BuildLibraryPanel, {
        paletteUseCase, structureGroups, registry,
        onPlaceStructure: (structure) => placed.push(structure.id)
    })
});
app.mount(host);
await nextTick();

const key = (element, name) => element.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));
const tiles = () => [...host.querySelectorAll('.palette-item')];
const tabStops = (selector) => [...host.querySelectorAll(selector)].filter((element) => element.tabIndex === 0);

// 1. Bricks are buttons, with one Tab stop.
{
    assert(tiles().length > 10 && tiles().every((tile) => tile.tagName === 'BUTTON'), 'every brick tile is a button');
    const stops = tabStops('.palette-item');
    assert(stops.length === 1 && stops[0] === tiles()[0], 'only the first brick is a Tab stop, so Tab doesn\'t walk through them all');
    console.log('✓ brick tiles are buttons with one Tab stop');
}

// 2. The arrow keys move through the grid; Home and End to its ends.
{
    const all = tiles();
    all[0].focus();
    key(all[0], 'ArrowRight');
    assert(document.activeElement === all[1], 'Right goes to the next brick');
    key(all[1], 'ArrowDown');
    assert(document.activeElement === all[3], 'Down goes to the brick below (two columns)');
    key(all[3], 'ArrowLeft');
    assert(document.activeElement === all[2], 'Left goes back one');
    key(all[2], 'End');
    assert(document.activeElement === all[all.length - 1], 'End goes to the last brick');
    key(document.activeElement, 'Home');
    assert(document.activeElement === all[0], 'Home goes to the first');
    key(all[0], 'ArrowRight');
    await nextTick();
    assert(tabStops('.palette-item')[0] === all[1], 'the Tab stop follows focus, so Tab comes back to the same brick');
    console.log('✓ arrow keys, Home and End move through the bricks');
}

// 3. A tile does what a click does: chooses the brick, and says so.
{
    const tile = tiles()[2];
    const id = tile.dataset.brickId;
    tile.click();
    await nextTick();
    assert(paletteUseCase.getSelectedDefinitionId() === id, 'Enter (a click) on a brick chooses it');
    assert(tile.getAttribute('aria-pressed') === 'true' && tiles().filter((t) => t.getAttribute('aria-pressed') === 'true').length === 1,
        'and only that brick reads as pressed');
    console.log('✓ a brick tile chooses its brick');
}

// 4. Down from the search box goes to the first brick it found.
{
    const search = host.querySelector('.build-library-search');
    search.value = 'slope';
    search.dispatchEvent(new Event('input'));
    await nextTick();
    key(search, 'ArrowDown');
    assert(document.activeElement && document.activeElement.classList.contains('palette-item'), 'Down from the search box goes to a brick');
    assert(/slope/i.test(document.activeElement.textContent), `the first one it found (${document.activeElement.textContent.trim()})`);
    search.value = '';
    search.dispatchEvent(new Event('input'));
    await nextTick();
    console.log('✓ Down from the search box goes to what it found');
}

// 5. Structures: each card has a place button, one Tab stop, Up and Down,
//    and the button places it; the ⋮ menu is reachable from the card in focus.
{
    [...host.querySelectorAll('.build-library-tab')].find((tab) => /structures/i.test(tab.textContent)).click();
    await nextTick();
    const cards = () => [...host.querySelectorAll('.structure-item-place')];
    assert(cards().length > 5 && cards().every((card) => card.tagName === 'BUTTON'), 'every structure card has a place button');
    assert(tabStops('.structure-item-place').length === 1, 'one structure card is a Tab stop');
    assert(tabStops('.structure-item-menu-toggle').length === 1, 'and only its ⋮ menu is too');
    cards()[0].focus();
    key(cards()[0], 'ArrowDown');
    assert(document.activeElement === cards()[1], 'Down goes to the next structure');
    key(cards()[1], 'ArrowUp');
    assert(document.activeElement === cards()[0], 'Up goes back');
    key(cards()[0], 'End');
    assert(document.activeElement === cards()[cards().length - 1], 'End goes to the last structure');
    await nextTick();
    const card = cards()[1];
    card.click();
    assert(placed.length === 1, 'Enter (a click) on a card starts placing its structure');
    assert(card.getAttribute('aria-label').startsWith('Place '), `the button says what it does (${card.getAttribute('aria-label')})`);
    console.log('✓ structure cards place from the keyboard');
}

app.unmount();
host.remove();
