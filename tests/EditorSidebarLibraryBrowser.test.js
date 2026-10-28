// @environment browser
import { createApp, h, nextTick } from 'vue';
import BuildLibraryPanel from '../ui/components/BuildLibraryPanel.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { PaletteUseCase } from '../application/editor/PaletteUseCase.js';
import { assert } from './support/Assert.js';

// The Build Library in the Editor's sidebar, with the shipped CSS (finding
// P2-8 of docs/reviews/EditorPlacementUX-2026-10-27.md): the tool switch
// and its hint stay above the scroll, the library's tabs and search stay
// pinned while its list scrolls, a tile reached from the keyboard comes
// into view clear of them, and (P2-9) previews are big enough to tell
// pieces apart, with each brick's size and each structure's whole name.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});

const registry = new CreateBrickRegistryUseCase().execute();
const editorContext = new CreateEditorContextUseCase().execute();
const paletteUseCase = new PaletteUseCase(registry, editorContext);
const structureGroups = new CreateStructureRegistryUseCase().execute().groupByCategory();

// The sidebar as EditorView draws it: head, then the scroll with what sits
// above the library (here a stand-in for the build's info panel).
const host = document.createElement('div');
host.className = 'sidebar';
host.style.height = '600px';
document.body.appendChild(host);
const app = createApp({
    render: () => [
        h('div', { class: 'sidebar-head' }, [
            h('div', { class: 'tool-switcher tool-switcher--editor' }, [h('button', { class: 'tool-btn' }, 'Select'), h('button', { class: 'tool-btn' }, 'Place')]),
            h('p', { class: 'placement-hint' }, 'Hover the ground, R to rotate, click to place.')
        ]),
        h('div', { class: 'sidebar-scroll' }, [
            h('div', { class: 'above-library', style: 'height: 150px' }),
            h(BuildLibraryPanel, { paletteUseCase, structureGroups, registry })
        ])
    ]
});
app.mount(host);
await nextTick();

const box = (selector) => host.querySelector(selector).getBoundingClientRect();
const scroller = host.querySelector('.sidebar-scroll');

// 1. The sidebar fits its height: only the part under the head scrolls.
{
    const sidebar = host.getBoundingClientRect();
    assert(Math.round(box('.sidebar-head').top) === Math.round(sidebar.top + 16), 'the head sits at the top of the sidebar');
    assert(Math.round(box('.sidebar-scroll').top) === Math.round(box('.sidebar-head').bottom), 'the scroll starts under the head');
    assert(Math.round(box('.sidebar-scroll').bottom) === Math.round(sidebar.bottom - 16), 'and ends at the sidebar\'s foot');
    assert(scroller.scrollHeight > scroller.clientHeight * 2, 'the library is long enough to scroll');
    console.log('✓ the tool switch and hint sit above the sidebar\'s scroll');
}

// 2. Scrolled down the bricks, the tool switch, tabs and search stay in view.
{
    const switcherTop = box('.tool-switcher--editor').top;
    scroller.scrollTop = 1200;
    await new Promise((resolve) => requestAnimationFrame(resolve));
    assert(box('.tool-switcher--editor').top === switcherTop, 'the tool switch doesn\'t scroll away');
    assert(Math.round(box('.build-library-head').top) === Math.round(box('.sidebar-scroll').top), 'the tabs and search are pinned to the top of the scroll');
    assert(box('.build-library').top < box('.sidebar-scroll').top, 'while the library under them has scrolled');
    const search = host.querySelector('.build-library-search').getBoundingClientRect();
    const hit = document.elementFromPoint(search.left + 10, search.top + search.height / 2);
    assert(hit === host.querySelector('.build-library-search'), 'the search box is on top of the tiles scrolled under it');
    console.log('✓ the tabs and search stay pinned while the bricks scroll');
}

// 3. A tile above the visible list, reached from the keyboard, scrolls in
// below the pinned tabs and search, not under them.
{
    const tiles = [...host.querySelectorAll('.palette-item')];
    const target = tiles.find((tile) => tile.getBoundingClientRect().bottom < box('.sidebar-scroll').top);
    assert(target, 'a tile has scrolled out above');
    target.focus();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    assert(target.getBoundingClientRect().top >= box('.build-library-head').bottom - 1,
        `the focused tile is clear of the pinned head (${Math.round(target.getBoundingClientRect().top)} < ${Math.round(box('.build-library-head').bottom)})`);
    console.log('✓ a focused tile comes into view clear of the pinned head');
}

// 4. Previews big enough to tell pieces apart, each brick's size under its
// name, and structure names whole (finding P2-9).
{
    const tile = host.querySelector('.palette-item[data-brick-id="core:cube_half"]');
    const preview = tile.querySelector('.build-library-preview').getBoundingClientRect();
    assert(preview.width >= 56 && preview.height >= 56, `a brick's preview is at least 56px (${preview.width}×${preview.height})`);
    assert(tile.querySelector('.palette-item-size').textContent.trim() === '1×1×½', 'the Half Cube says its size');
    assert([...host.querySelectorAll('.palette-item')].every((item) => item.scrollWidth <= item.clientWidth + 1), 'no brick tile overflows');

    [...host.querySelectorAll('.build-library-tab')][1].click();
    await nextTick();
    const names = [...host.querySelectorAll('.structure-item-name')];
    assert(names.length > 10, 'the structures are listed');
    const cut = names.filter((name) => name.scrollWidth > name.clientWidth + 1 || name.scrollHeight > name.clientHeight + 1);
    assert(cut.length === 0, `no structure name is cut off (${cut.map((name) => name.textContent).join(', ')})`);
    const garden = names.find((name) => name.textContent.trim() === 'Garden Cottage');
    assert(garden, 'Garden Cottage shows its whole name');
    const card = host.querySelector('.structure-item .build-library-preview').getBoundingClientRect();
    assert(card.width >= 56, `a structure's preview is at least 56px (${card.width})`);
    console.log('✓ larger previews, brick sizes, and whole structure names');
}

app.unmount();
host.remove();
console.log('✅ All Editor sidebar library tests passed.');
