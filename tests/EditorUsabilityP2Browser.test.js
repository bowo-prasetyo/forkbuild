// @environment browser
import { createApp, h, nextTick, reactive } from 'vue';
import EditingSidebar from '../ui/components/EditingSidebar.js';
import SelectionInspector from '../ui/components/SelectionInspector.js';
import KeyboardShortcutsOverlay from '../ui/components/KeyboardShortcutsOverlay.js';
import Toolbar from '../ui/components/Toolbar.js';
import { EditorActionRegistry, createStandardActions } from '../application/editor/EditorActionRegistry.js';
import { assert } from './support/Assert.js';

// The Editor after the P2 fixes of docs/reviews/EditorUsability-2026-10-29.md,
// with the shipped CSS: a group is named in a field of its own as it is made,
// and renamed in place (P2-6); the Selection card moves the selection a step
// each way and says Turn right / Turn left (P2-8); the Shortcuts overlay lists
// the selection gestures and every key once (P2-5); and a build never saved
// says "Not saved yet" (P2-8). tests/EditorUsabilityP2.test.js covers the
// palette.

await new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = '/css/main.css';
    link.onload = resolve;
    link.onerror = () => reject(new Error('css/main.css failed to load'));
    document.head.appendChild(link);
});
const settle = async () => {
    await nextTick();
    await nextTick();
};

function mount(render, provide = {}) {
    const host = document.createElement('div');
    host.className = 'sidebar';
    document.body.appendChild(host);
    const app = createApp({ render });
    for (const [key, value] of Object.entries(provide)) app.provide(key, value);
    app.mount(host);
    return { host, unmount: () => { app.unmount(); host.remove(); } };
}

// 1. New group asks for the name, suggests one, and makes it selected (P2-6).
{
    const moved = [];
    const session = { moveSelection: (delta) => moved.push(delta) };
    const ui = {};
    const registry = new EditorActionRegistry(createStandardActions({ session, feedback: { show() {} }, ui }));
    const state = reactive({
        context: { hasSelection: true, selectionCount: 3, clipboardEmpty: true, hasGroups: true, hasSelectedGroup: false, selectedGroupId: null,
            groups: [{ id: 'g1', name: 'Group 1', memberCount: 2 }] }
    });
    const made = [];
    const renamed = [];
    const selected = [];
    const noop = () => {};
    const { host, unmount } = mount(() => h(EditingSidebar, {
        registry, ui, getContext: () => ({ ...state.context }),
        selectionCount: 3, isStructurePlacementSelection: false,
        selectionSummary: { count: 3, bounds: { center: { x: 0, y: 0.5, z: 0 } }, color: null },
        recolor: noop, applyNumeric: noop, align: noop, distribute: noop, repeat: noop,
        selectGroup: (id) => {
            selected.push(id);
            state.context = { ...state.context, selectedGroupId: id, hasSelectedGroup: true };
        },
        createGroup: (name) => made.push(name),
        renameGroup: (name) => renamed.push(name)
    }));
    await settle();
    const button = (label) => [...host.querySelectorAll('button')].find((b) => b.textContent.trim() === label);
    const field = () => host.querySelector('.group-naming-input');

    [...host.querySelectorAll('.collapsible-section-header')].find((header) => header.textContent.includes('Groups & blueprint')).click();
    await settle();
    button('New group').click();
    await settle();
    assert(field() && field().value === 'Group 2', `1. New group suggests the next free name (${field() && field().value})`);
    assert(document.activeElement === field() && field().selectionEnd - field().selectionStart === 'Group 2'.length, '2. selected, so typing replaces it');
    field().value = 'Front wall';
    field().dispatchEvent(new Event('input'));
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    host.querySelector('.group-naming').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    assert(made.join() === 'Front wall' && !field(), `3. Make group makes it with that name (${made})`);

    // A double-click on a group's name renames it in place; Escape lets it be.
    host.querySelector('.editing-sidebar-group').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await settle();
    assert(selected.join() === 'g1' && field() && field().value === 'Group 1', `4. a double-click selects the group and offers its name (${field() && field().value})`);
    field().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    assert(!field() && renamed.length === 0, '5. Escape renames nothing');

    // The palette's Rename Group opens the same field.
    registry.execute('group.rename', { ...state.context, hasSelectedGroup: true });
    await settle();
    field().value = 'Roof';
    field().dispatchEvent(new Event('input'));
    host.querySelector('.group-naming').dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
    assert(renamed.join() === 'Roof', `6. Rename Group from the palette renames it (${renamed})`);
    assert(!host.textContent.includes('(unnamed group)'), '7. no group is left unnamed');
    unmount();
    console.log('✓ a group is named as it is made, and renamed in place');
}

// 2. The Selection card's Move row and its Turn buttons (P2-8).
{
    const moved = [];
    const turned = [];
    const session = { moveSelection: (delta) => moved.push(delta), rotateSelection: (degrees) => turned.push(degrees) };
    const registry = new EditorActionRegistry(createStandardActions({ session, feedback: { show() {} }, ui: {} }));
    const { host, unmount } = mount(() => h(SelectionInspector, {
        registry, getContext: () => ({ hasSelection: true, selectionCount: 1, clipboardEmpty: true }),
        summary: { count: 1, bounds: { center: { x: 0, y: 0.5, z: 0 } }, color: null }, recolor: () => {}
    }));
    await settle();
    const steps = [...host.querySelectorAll('.selection-inspector-move-btn')];
    assert(steps.map((b) => b.textContent.trim()).join() === 'Left,Right,Forward,Back,Up,Down', `8. a step each way (${steps.map((b) => b.textContent.trim())})`);
    assert(steps[0].title === 'Move Left (←)' && steps[4].title === 'Move Up (PgUp)', `9. each titled with its key (${steps[0].title}, ${steps[4].title})`);
    steps[1].click();
    steps[4].click();
    assert(JSON.stringify(moved) === JSON.stringify([{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }]), `10. Right and Up move it as → and PgUp do (${JSON.stringify(moved)})`);
    const turn = [...host.querySelectorAll('.editor-panel-actions button')].slice(0, 2);
    assert(turn.map((b) => b.textContent.trim()).join() === 'Turn right ↻,Turn left ↺', '11. Turn right and Turn left');
    turn[0].click();
    assert(turned.join() === '90', '12. Turn right is R\'s quarter turn');
    unmount();
    console.log('✓ the Selection card moves and turns the selection');
}

// 3. The Shortcuts overlay: the selection gestures, each key once (P2-5).
{
    const registry = new EditorActionRegistry(createStandardActions({ session: {}, feedback: { show() {} }, ui: {} }));
    const { host, unmount } = mount(() => h(KeyboardShortcutsOverlay, { registry }));
    await settle();
    const rows = [...host.querySelectorAll('[role="dialog"] div > span:first-child')]
        .map((label) => `${label.textContent.trim()} | ${label.nextElementSibling ? label.nextElementSibling.textContent.trim() : ''}`);
    for (const row of ['Select everything in a box | Shift+drag (Select)', 'Add a brick to the selection | Shift+click',
        'Move the selection | Drag a selected brick', 'Lay a row of the brick you\'re placing | Shift+drag (Place)',
        'Switch to Select | 1', 'Switch to Place | 2', 'Save | Ctrl/Cmd+S', 'Sound on/off | M', 'Keyboard Shortcuts | ?']) {
        assert(rows.includes(row), `13. the overlay lists "${row}"`);
    }
    for (const key of ['1', '2', 'M', 'Ctrl/Cmd+S', '?']) {
        assert(rows.filter((row) => row.endsWith(`| ${key}`)).length === 1, `14. ${key} is listed once`);
    }
    unmount();
    console.log('✓ the overlay lists the selection gestures and every key once');
}

// 4. A build never saved says so; once saved, it says Saved (P2-8).
{
    let saved = [];
    let onState = () => {};
    const documentManager = {
        document: { world: { id: 'w1' }, metadata: { title: 'House' } },
        state: { dirty: false },
        onStateChanged: (callback) => { onState = callback; return () => {}; },
        markDirty() {}
    };
    const { host, unmount } = mount(() => h(Toolbar, {
        documentManager,
        saveDocumentUseCase: { execute: () => {} },
        loadDocumentUseCase: { listSavedDocuments: () => saved },
        editorSession: {},
        publishDocumentUseCase: { execute: () => ({ title: 'House' }) },
        feedback: { show() {} }
    }), { identityUseCase: null, findabilityStore: { get: () => null, set: (value) => value } });
    await settle();
    const status = () => host.querySelector('.toolbar-dirty').textContent.trim();
    assert(status() === 'Not saved yet', `15. a new build says it isn't saved yet (${status()})`);
    saved = [{ id: 'w1', title: 'House', modified: new Date().toISOString() }];
    onState({ dirty: false });
    await settle();
    assert(status() === 'Saved', `16. once saved, Saved (${status()})`);
    unmount();
    console.log('✓ a build never saved says "Not saved yet"');
}

console.log('✅ All Editor usability (P2) browser tests passed.');
