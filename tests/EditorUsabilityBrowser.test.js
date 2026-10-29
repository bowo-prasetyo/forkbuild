// @environment browser
import { createApp, h, nextTick, reactive } from 'vue';
import SelectionInspector from '../ui/components/SelectionInspector.js';
import BuildLibraryPanel from '../ui/components/BuildLibraryPanel.js';
import KeyboardShortcutsOverlay from '../ui/components/KeyboardShortcutsOverlay.js';
import { bringToTop, SELECTION_CARD } from '../ui/views/editorView/sidebarScroll.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { PaletteUseCase } from '../application/editor/PaletteUseCase.js';
import { EditorActionRegistry, createStandardActions } from '../application/editor/EditorActionRegistry.js';
import { assert } from './support/Assert.js';

// The Editor's sidebar after the P1 fixes of
// docs/reviews/EditorUsability-2026-10-29.md, with the shipped CSS: a new
// selection brings its card into view (P1-1); the card's colours paint the
// selection and show its colour, while the library's colour for new bricks
// steps aside (P1-2); and the Shortcuts overlay lists Home once (P1-4).
// tests/EditorUsability.test.js covers the rest.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});
const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
const registry = new EditorActionRegistry(createStandardActions({ session: {}, feedback: { show() {} }, ui: {} }));
const getContext = () => ({ clipboardEmpty: true });

// 1. The sidebar scrolled down to the library: a selection brings its card up,
// and only when its top is out of view (P1-1).
{
    const host = document.createElement('div');
    host.className = 'sidebar';
    host.style.height = '600px';
    document.body.appendChild(host);
    const app = createApp({
        render: () => [
            h('div', { class: 'sidebar-head' }, [h('div', { class: 'tool-switcher tool-switcher--editor' }, 'Select · Place')]),
            h('div', { class: 'sidebar-scroll' }, [
                h('div', { style: 'height: 300px' }, 'the build\'s info'),
                h('section', { class: 'editor-panel selection-inspector', style: 'height: 250px' }, '5 bricks selected'),
                h('div', { class: 'build-library', style: 'height: 3000px' }, 'the library')
            ])
        ]
    });
    app.mount(host);
    await nextTick();
    const scroller = host.querySelector('.sidebar-scroll');
    const top = (selector) => Math.round(host.querySelector(selector).getBoundingClientRect().top - scroller.getBoundingClientRect().top);

    assert(bringToTop(scroller, '.build-library', { onlyDown: true }) === true && top('.build-library') === 0, '1. Place brings the library up');
    assert(top('.selection-inspector') < 0, '2. which leaves the Selection card out of view above');
    assert(bringToTop(scroller, SELECTION_CARD, { onlyIfHidden: true }) === true, '3. a selection brings it back');
    await frame();
    assert(top('.selection-inspector') === 0, `4. to the top of the scroll (${top('.selection-inspector')})`);
    assert(bringToTop(scroller, SELECTION_CARD, { onlyIfHidden: true }) === false, '5. already in view, it stays put');
    scroller.scrollTop += 20;
    assert(bringToTop(scroller, '.build-library', { onlyDown: true }) === true && top('.build-library') === 0, '6. and Place brings the library up again');
    assert(bringToTop(scroller, '.build-library', { onlyDown: true }) === false, '7. but never pulls back a library already scrolled into');
    assert(bringToTop(scroller, '.structure-instance-panel') === false, '8. a card that isn\'t there moves nothing');
    app.unmount();
    host.remove();
    console.log('✓ a new selection brings its card into view');
}

// 2. The Selection card paints the selection and shows its colour (P1-2).
{
    const host = document.createElement('div');
    host.className = 'sidebar';
    document.body.appendChild(host);
    const props = reactive({
        summary: { count: 5, bounds: { center: { x: 4, y: 0.5, z: 5 } }, color: 0xa63a3a },
        touch: false
    });
    const painted = [];
    const app = createApp({ render: () => h(SelectionInspector, { registry, getContext, recolor: (color) => painted.push(color), ...props }) });
    app.mount(host);
    await nextTick();
    const label = host.querySelector('.selection-inspector-color');
    assert(label.textContent.trim() === 'Paint selected', `9. its colour row says it paints the selection (${label.textContent.trim()})`);
    assert(host.querySelector('.selection-inspector-color-input').value === '#a63a3a', '10. the colour input opens on the bricks\' colour');
    const pressed = [...host.querySelectorAll('.village-palette-swatch[aria-pressed="true"]')].map((swatch) => swatch.title);
    assert(pressed.join() === 'Roof red', `11. and the village colour they are is marked (${pressed})`);
    host.querySelector('.village-palette-swatch[title="Harbor blue"]').click();
    assert(painted.length === 1, '12. a village colour paints them');
    assert(host.querySelector('.selection-inspector-next').textContent.trim() === 'Drag it, or an arrow, to move · R turns it', '13. the hint says a drag moves it');

    props.summary = { ...props.summary, color: null };
    props.touch = true;
    await nextTick();
    assert(host.querySelectorAll('.village-palette-swatch[aria-pressed="true"]').length === 0, '14. bricks of several colours mark none');
    assert(host.querySelector('.selection-inspector-next').textContent.trim() === 'Drag an arrow to move · Rotate turns it', '15. on a touch screen, the hint names the arrows and Rotate');
    app.unmount();
    host.remove();
    console.log('✓ the Selection card paints the selection and shows its colour');
}

// 3. While bricks are selected, the library's colour for new bricks steps aside (P1-2).
{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const paletteUseCase = new PaletteUseCase(brickRegistry, new CreateEditorContextUseCase().execute());
    paletteUseCase.selectDefinition('core:cube');
    const structureGroups = new CreateStructureRegistryUseCase().execute().groupByCategory();
    const host = document.createElement('div');
    host.className = 'sidebar';
    document.body.appendChild(host);
    const props = reactive({ selectionActive: false });
    const app = createApp({ render: () => h(BuildLibraryPanel, { paletteUseCase, structureGroups, registry: brickRegistry, ...props }) });
    app.mount(host);
    await nextTick();
    const color = () => host.querySelector('.brick-palette-color');
    assert(color() && color().textContent.trim() === 'Color for new bricks', `16. with nothing selected, the library's colour names what it colours (${color() && color().textContent.trim()})`);
    assert(host.querySelector('.brick-palette .village-palette'), '17. with its village colours');
    props.selectionActive = true;
    await nextTick();
    assert(!color() && !host.querySelector('.brick-palette .village-palette'), '18. with bricks selected, both step aside');
    app.unmount();
    host.remove();
    console.log('✓ the colour for new bricks steps aside while bricks are selected');
}

// 4. The Shortcuts overlay lists Home once, as See the Whole Build (P1-4).
{
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(KeyboardShortcutsOverlay, { registry });
    app.mount(host);
    const rows = [...host.querySelectorAll('[role="dialog"] div > span:first-child')]
        .map((label) => `${label.textContent.trim()} | ${label.nextElementSibling ? label.nextElementSibling.textContent.trim() : ''}`);
    const home = rows.filter((row) => row.endsWith('| Home'));
    assert(home.length === 1 && home[0] === 'See the Whole Build | Home', `19. Home is listed once, as See the Whole Build (${home.join('; ')})`);
    app.unmount();
    host.remove();
    console.log('✓ the Shortcuts overlay lists Home as See the Whole Build');
}

console.log('✅ All Editor usability browser tests passed.');
