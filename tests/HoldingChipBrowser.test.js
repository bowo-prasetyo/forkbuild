// @environment browser
import { createApp, h, nextTick, reactive } from 'vue';
import HoldingChip from '../ui/components/HoldingChip.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { EditorEvent } from '../core/events/EditorEvent.js';
import { assert } from './support/Assert.js';

// What the Editor is about to place (finding P2-10 of
// docs/reviews/EditorPlacementUX-2026-10-27.md): the chip names it, shows a
// brick's colour, opens the library to change it, and stops placing.

// 1. Choosing a colour is now announced, so the chip can follow it.
{
    const editorContext = new CreateEditorContextUseCase().execute();
    editorContext.setActiveBrick('core:cube');
    const seen = [];
    editorContext.eventBus.subscribe(EditorEvent.ACTIVE_BRICK_COLOR_CHANGED, ({ color }) => seen.push(color));
    let brickEvents = 0;
    editorContext.eventBus.subscribe(EditorEvent.ACTIVE_BRICK_CHANGED, () => { brickEvents += 1; });
    editorContext.setActiveBrickColor(0xa4553b);
    editorContext.setActiveBrickColor(null);
    assert(seen.length === 2 && seen[0] === 0xa4553b && seen[1] === null, `a colour choice publishes ACTIVE_BRICK_COLOR_CHANGED (${seen})`);
    assert(brickEvents === 0 && editorContext.activeBrick.definitionId === 'core:cube', 'without announcing a new brick, which would reset the library\'s colour');
    console.log('✓ a colour choice is announced');
}

// 2. The chip.
{
    const props = reactive({ kind: 'brick', item: { id: 'core:cube', name: 'Cube', category: 'primitive', tags: [] }, name: 'Cube', color: '#a4553b' });
    const events = [];
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
        render: () => h(HoldingChip, { ...props, previewService: null, onOpen: () => events.push('open'), onStop: () => events.push('stop') })
    });
    app.mount(host);
    await nextTick();

    const chip = host.querySelector('.editor-holding');
    assert(chip && chip.getAttribute('role') === 'group' && chip.getAttribute('aria-label') === 'What you\'re placing', 'a named group');
    assert(host.querySelector('.editor-holding-name').textContent === 'Cube', 'naming what is held');
    assert(host.querySelector('.editor-holding-color').style.background !== '', 'with the brick\'s colour');
    assert(host.querySelector('.build-library-preview'), 'and its preview');
    const item = host.querySelector('.editor-holding-item');
    assert(item.tagName === 'BUTTON' && item.getAttribute('aria-label') === 'Placing Cube. Choose something else', `the chip is a button saying what it does (${item.getAttribute('aria-label')})`);
    item.click();
    host.querySelector('.editor-holding-stop').click();
    assert(events.join() === 'open,stop', 'it opens the library, and ✕ stops placing');
    assert(host.querySelector('.editor-holding-stop').getAttribute('aria-label') === 'Stop placing', '✕ is named');

    Object.assign(props, { kind: null, item: null, name: 'My Tower', color: null });
    await nextTick();
    assert(!host.querySelector('.build-library-preview') && !host.querySelector('.editor-holding-color')
        && host.querySelector('.editor-holding-name').textContent === 'My Tower', 'a placed build: its name alone');
    app.unmount();
    host.remove();
    console.log('✓ the holding chip names what a click will place');
}
