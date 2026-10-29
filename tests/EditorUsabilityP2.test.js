import { EditorActionRegistry, createStandardActions } from '../application/editor/EditorActionRegistry.js';
import { EditorActionContext } from '../application/editor/EditorActionContext.js';
import { InputRouter } from '../application/editor/InputRouter.js';
import { setAppLocale, t } from '../ui/i18n/i18n.js';
import { SOURCE_LOCALE } from '../ui/i18n/locales.js';
import { assert } from './support/Assert.js';

// The P2 findings of docs/reviews/EditorUsability-2026-10-29.md, below the
// view: the Command Palette finds what the toolbar and the view do, by their
// names and by the other words people use for them (P2-5), and Create Group
// and Rename Group ask for the name in the view's own field (P2-6).
// tests/EditorUsabilityP2Browser.test.js covers the sidebar, the overlay and
// the toolbar.

function harness() {
    const calls = [];
    const hook = (name) => (...args) => calls.push([name, ...args]);
    const ui = {
        save: hook('save'), publish: hook('publish'), newDocument: hook('newDocument'),
        exportDocument: hook('exportDocument'), exportModel: hook('exportModel'), importDocument: hook('importDocument'),
        setTool: hook('setTool'), toggleSound: hook('toggleSound'), toggleSeeInside: hook('toggleSeeInside'),
        openShortcuts: hook('openShortcuts'), focusPaint: hook('focusPaint'),
        startNewGroup: hook('startNewGroup'), startRenameGroup: hook('startRenameGroup')
    };
    const session = { showWholeBuild() {}, createGroupFromSelection: hook('createGroupFromSelection') };
    const registry = new EditorActionRegistry(createStandardActions({ session, feedback: { show() {} }, ui }));
    return { registry, calls };
}
const first = (registry, query) => registry.findMatching(query, t)[0]?.id ?? null;

// 1. The palette finds each of them by name and by the words people use (P2-5).
{
    const { registry } = harness();
    const asked = {
        save: 'file.save', publish: 'file.publish', 'new build': 'file.new', export: 'file.export', '3d': 'file.exportModel',
        stl: 'file.exportModel', import: 'file.import', 'select tool': 'tool.select', 'place tool': 'tool.place',
        sound: 'ui.sound', music: 'ui.sound', mute: 'ui.sound', 'see inside': 'ui.seeInside', shortcuts: 'ui.shortcuts',
        camera: 'camera.wholeBuild', zoom: 'camera.wholeBuild', home: 'camera.wholeBuild',
        colour: 'selection.paint', color: 'selection.paint', paint: 'selection.paint'
    };
    for (const [query, id] of Object.entries(asked)) {
        assert(first(registry, query) === id, `1. "${query}" finds ${id} (got ${first(registry, query)})`);
    }
    console.log('✓ the palette finds the toolbar\'s and the view\'s actions, by name and by other words');
}

// 2. In the player's own language too.
{
    const { registry } = harness();
    const asked = { de: { farbe: 'selection.paint', musik: 'ui.sound', speichern: 'file.save' },
        fr: { couleur: 'selection.paint', musique: 'ui.sound', caméra: 'camera.wholeBuild' },
        ja: { 色: 'selection.paint', 保存: 'file.save' },
        'pt-BR': { cor: 'selection.paint', baixar: 'file.export' } };
    for (const [code, queries] of Object.entries(asked)) {
        await setAppLocale(code);
        for (const [query, id] of Object.entries(queries)) {
            assert(first(registry, query) === id, `2. ${code}: "${query}" finds ${id} (got ${first(registry, query)})`);
        }
    }
    await setAppLocale(SOURCE_LOCALE);
    console.log('✓ and in the player\'s language');
}

// 3. Each runs what its button does; off where the view gives no hook.
{
    const { registry, calls } = harness();
    const ctx = new EditorActionContext({ selectionCount: 2 });
    const runs = {
        'file.save': ['save'], 'file.publish': ['publish'], 'file.new': ['newDocument'], 'file.export': ['exportDocument'],
        'file.exportModel': ['exportModel'], 'file.import': ['importDocument'], 'tool.select': ['setTool', 'select'],
        'tool.place': ['setTool', 'place'], 'ui.sound': ['toggleSound'], 'ui.seeInside': ['toggleSeeInside'],
        'ui.shortcuts': ['openShortcuts'], 'selection.paint': ['focusPaint']
    };
    for (const [id, call] of Object.entries(runs)) {
        calls.length = 0;
        assert(registry.execute(id, ctx) === true, `3. ${id} runs`);
        assert(JSON.stringify(calls) === JSON.stringify([call]), `3. ${id} calls ${call.join(' ')} (got ${JSON.stringify(calls)})`);
    }
    assert(!registry.get('selection.paint').enabled(new EditorActionContext({ selectionCount: 0 })), '3. Paint Selected needs bricks selected');
    assert(!registry.get('selection.paint').enabled(new EditorActionContext({ selectionCount: 1, selectionIsStructurePlacement: true })),
        '3. and not a placed build, which has no colour of its own');
    const bare = new EditorActionRegistry(createStandardActions({ session: {}, feedback: { show() {} }, ui: {} }));
    assert(Object.keys(runs).every((id) => !bare.get(id).enabled(ctx)), '3. without the view\'s hooks they are off');
    console.log('✓ each does what its button does');
}

// 4. Their keys stay with the view, which sees them first: the registry
// lists them but matches none, so no key is handled twice.
{
    const { registry } = harness();
    const shown = Object.fromEntries(['file.save', 'tool.select', 'tool.place', 'ui.sound', 'ui.shortcuts'].map((id) => [id, registry.get(id).shortcut]));
    assert(JSON.stringify(shown) === JSON.stringify({ 'file.save': 'Ctrl/Cmd+S', 'tool.select': '1', 'tool.place': '2', 'ui.sound': 'M', 'ui.shortcuts': '?' }),
        `4. the overlay shows their keys (${JSON.stringify(shown)})`);
    for (const event of [{ key: 's', ctrlKey: true }, { key: '1' }, { key: '2' }, { key: 'm' }, { key: '?' }]) {
        assert(InputRouter.matchShortcut(event, registry) === null, `4. the registry leaves ${JSON.stringify(event)} to the view`);
    }
    console.log('✓ their keys stay with the view');
}

// 5. Create Group and Rename Group open the view's naming field (P2-6);
// without one, Create Group still makes the group.
{
    const { registry, calls } = harness();
    registry.execute('group.create', new EditorActionContext({ selectionCount: 3 }));
    registry.execute('group.rename', new EditorActionContext({ selectionCount: 3, selectedGroupId: 'g' }));
    assert(JSON.stringify(calls) === JSON.stringify([['startNewGroup'], ['startRenameGroup']]), `5. both ask in the view's field (${JSON.stringify(calls)})`);

    const made = [];
    const headless = new EditorActionRegistry(createStandardActions({ session: { createGroupFromSelection: () => made.push('g') }, feedback: { show() {} }, ui: {} }));
    headless.execute('group.create', new EditorActionContext({ selectionCount: 3 }));
    assert(made.length === 1, '5. with no field to ask in, Create Group makes it unnamed, as before');
    console.log('✓ a group is named in the view\'s own field');
}

console.log('✅ All Editor usability (P2) tests passed.');
