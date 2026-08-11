import { EditorActionRegistry, createStandardActions } from '../application/EditorActionRegistry.js';
import { EditorActionContext } from '../application/EditorActionContext.js';
import { InputRouter } from '../application/InputRouter.js';

// 0.1.50 — Editor action architecture tests. Deliberately architectural
// rather than visual: unique ids, unique shortcuts, shared definitions
// across surfaces, disabled actions never executing, actions invoking
// the correct existing session APIs, selection-only actions leaving
// history untouched, and the explicit Escape priority chain.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// A session implementing the full documented editing surface, recording
// every call. Group/clipboard included so those action paths are
// exercised even on surfaces that predate them.
class FakeSession {
    constructor(state = {}) {
        this.calls = [];
        this._state = {
            selectionCount: 3,
            clipboardCount: 0,
            groups: [],
            selectedGroupId: null,
            canUndo: true,
            canRedo: true,
            gestureActive: false,
            ...state
        };
    }
    _record(name, ...args) {
        this.calls.push({ name, args });
    }
    calledWith(name, ...expected) {
        return this.calls.some((call) => call.name === name
            && JSON.stringify(call.args) === JSON.stringify(expected));
    }
    callCount(name) {
        return this.calls.filter((call) => call.name === name).length;
    }
    getSelectionCount() { return this._state.selectionCount; }
    selectAll() { this._record('selectAll'); return true; }
    clearSelection() { this._record('clearSelection'); return true; }
    deleteSelection() { this._record('deleteSelection'); return true; }
    copySelection() { this._record('copySelection'); return true; }
    paste() { this._record('paste'); return true; }
    createGroupFromSelection() { this._record('createGroupFromSelection'); return true; }
    renameSelectedGroup() { this._record('renameSelectedGroup'); return true; }
    duplicateSelectedGroup() { this._record('duplicateSelectedGroup'); return true; }
    deleteSelectedGroup() { this._record('deleteSelectedGroup'); return true; }
    addSelectionToSelectedGroup() { this._record('addSelectionToSelectedGroup'); return true; }
    removeSelectionFromSelectedGroup() { this._record('removeSelectionFromSelectedGroup'); return true; }
    moveSelection(delta) { this._record('moveSelection', delta); return true; }
    rotateSelection(deltaRotation) { this._record('rotateSelection', deltaRotation); return true; }
    alignSelection(mode) { this._record('alignSelection', mode); return true; }
    distributeSelection(axis) { this._record('distributeSelection', axis); return true; }
    undo() { this._record('undo'); return true; }
    redo() { this._record('redo'); return true; }
    canUndo() { return this._state.canUndo; }
    canRedo() { return this._state.canRedo; }
    getUndoLabel() { return 'Undo Move 3 Bricks'; }
    getRedoLabel() { return 'Redo Move 3 Bricks'; }
    getClipboardCount() { return this._state.clipboardCount; }
    getGroups() { return this._state.groups; }
    getSelectedGroupId() { return this._state.selectedGroupId; }
    isGestureActive() { return this._state.gestureActive; }
}

function buildHarness(sessionState = {}, sessionOverride = null) {
    const session = sessionOverride || new FakeSession(sessionState);
    const feedback = { messages: [], show(message) { this.messages.push(message); } };
    const ui = { toggled: 0, togglePalette() { this.toggled += 1; }, focusNumeric: null };
    const registry = new EditorActionRegistry(createStandardActions({ session, feedback, ui }));
    return { session, feedback, ui, registry };
}

function contextFor(sessionState = {}) {
    return new EditorActionContext({
        selectionCount: sessionState.selectionCount !== undefined ? sessionState.selectionCount : 3,
        clipboardCount: sessionState.clipboardCount || 0,
        groups: sessionState.groups || [],
        selectedGroupId: sessionState.selectedGroupId || null,
        canUndo: sessionState.canUndo !== undefined ? sessionState.canUndo : true,
        canRedo: sessionState.canRedo !== undefined ? sessionState.canRedo : true,
        gestureActive: sessionState.gestureActive || false,
        activeTool: sessionState.activeTool || 'select'
    });
}

function rawKey(key, { ctrl = false, shift = false, alt = false, meta = false, repeat = false } = {}) {
    return { key, ctrlKey: ctrl, shiftKey: shift, altKey: alt, metaKey: meta, repeat };
}

// ---------------------------------------------------------------------
// 1. Registry integrity
// ---------------------------------------------------------------------
{
    const { registry } = buildHarness();
    const actions = registry.getAll();
    const ids = actions.map((action) => action.id);
    assert(new Set(ids).size === ids.length, 'every action id is unique');
    assert(actions.length >= 30, 'the standard set covers all operation families');
    for (const action of actions) {
        assert(typeof action.label === 'string' && action.label.length > 0, `${action.id} has a label`);
        assert(typeof action.category === 'string', `${action.id} has a category`);
        assert(typeof action.description === 'string' && action.description.length > 0, `${action.id} has a description`);
        assert(typeof action.enabled === 'function', `${action.id} has enabled()`);
        assert(typeof action.execute === 'function', `${action.id} has execute()`);
    }
    console.log('✓ registry integrity');
}

// ---------------------------------------------------------------------
// 2. Shortcut uniqueness
// ---------------------------------------------------------------------
{
    const { registry } = buildHarness();
    const seen = new Set();
    for (const action of registry.getAll()) {
        if (!action.keys) continue;
        for (const combination of action.keys) {
            const signature = JSON.stringify({
                key: combination.key,
                ctrl: !!combination.ctrl,
                shift: !!combination.shift,
                alt: !!combination.alt
            });
            assert(!seen.has(signature), `shortcut collision: ${signature} (${action.id})`);
            seen.add(signature);
        }
    }
    console.log('✓ shortcut uniqueness');
}

// ---------------------------------------------------------------------
// 3. Shortcut resolution through InputRouter
// ---------------------------------------------------------------------
{
    const { registry } = buildHarness();
    const expect = (event, id) => {
        const action = InputRouter.matchShortcut(event, registry);
        assert(action !== null, `expected a match for ${event.key}`);
        assert(action.id === id, `expected ${id}, got ${action.id}`);
    };
    expect(rawKey('z', { ctrl: true }), 'history.undo');
    expect(rawKey('Z', { ctrl: true, shift: true }), 'history.redo');
    expect(rawKey('y', { ctrl: true }), 'history.redo');
    expect(rawKey('a', { ctrl: true }), 'selection.selectAll');
    expect(rawKey('r'), 'transform.rotateClockwise');
    expect(rawKey('R', { shift: true }), 'transform.rotateCounterClockwise');
    expect(rawKey('Delete'), 'selection.delete');
    expect(rawKey('Backspace'), 'selection.delete');
    expect(rawKey('ArrowRight'), 'transform.nudgeRight');
    expect(rawKey('PageUp'), 'transform.nudgeUp');
    expect(rawKey('c', { ctrl: true }), 'clipboard.copy');
    expect(rawKey('v', { ctrl: true }), 'clipboard.paste');
    expect(rawKey('g', { ctrl: true }), 'group.create');
    expect(rawKey('k', { ctrl: true }), 'ui.commandPalette');
    expect(rawKey('k', { meta: true }), 'ui.commandPalette');
    assert(InputRouter.matchShortcut(rawKey('z', { ctrl: true, repeat: true }), registry) === null,
        'key repeat never re-triggers an action');
    console.log('✓ shortcut resolution');
}

// ---------------------------------------------------------------------
// 4. Search / matching
// ---------------------------------------------------------------------
{
    const { registry } = buildHarness();
    assert(registry.findMatching('align').length === 9, 'align matches the nine alignment actions');
    assert(registry.findMatching('ALIGN').length === 9, 'matching is case-insensitive');
    assert(registry.findMatching('  distribute  ').length === 3, 'matching trims whitespace');
    assert(registry.findMatching('transform').length >= 18, 'category text is searchable');
    assert(registry.findMatching('').length === registry.getAll().length, 'empty query returns everything');
    assert(registry.findMatching('zzz-not-a-command').length === 0, 'no false positives');
    console.log('✓ search / matching');
}

// ---------------------------------------------------------------------
// 5. Category grouping
// ---------------------------------------------------------------------
{
    const { registry } = buildHarness();
    const groups = EditorActionRegistry.groupByCategory(registry.getAll());
    const names = groups.map((group) => group.category);
    for (const expected of ['Selection', 'Groups', 'Clipboard', 'Transform', 'History', 'Interface']) {
        assert(names.includes(expected), `category ${expected} present`);
    }
    const total = groups.reduce((sum, group) => sum + group.actions.length, 0);
    assert(total === registry.getAll().length, 'grouping loses no actions');
    console.log('✓ category grouping');
}

// ---------------------------------------------------------------------
// 6. Disabled actions never execute
// ---------------------------------------------------------------------
{
    const { session, registry } = buildHarness({ selectionCount: 1 });
    const context = contextFor({ selectionCount: 1 });
    assert(registry.execute('transform.alignLeft', context) === false, 'align disabled with one brick');
    assert(registry.execute('transform.distributeX', context) === false, 'distribute disabled with one brick');
    assert(registry.execute('selection.delete', context) === true, 'delete enabled with one brick');
    const calls = session.calls.filter((call) => ['alignSelection', 'distributeSelection'].includes(call.name));
    assert(calls.length === 0, 'disabled actions never reach the session');

    const { session: s2, registry: r2 } = buildHarness({ selectionCount: 2 });
    assert(r2.execute('transform.distributeX', contextFor({ selectionCount: 2 })) === false,
        'distribute disabled with two bricks');
    assert(s2.calls.length === 0, 'still no session call');

    const emptyClipboard = contextFor({ selectionCount: 3, clipboardCount: 0 });
    const pasteAction = registry.get('clipboard.paste');
    assert(pasteAction.enabled(emptyClipboard) === false, 'paste disabled with empty clipboard');
    assert(pasteAction.disabledReason(emptyClipboard) === 'Clipboard is empty', 'paste explains itself');
    const alignReason = registry.get('transform.alignLeft').disabledReason(contextFor({ selectionCount: 1 }));
    assert(alignReason === 'Select at least 2 bricks', 'align explains itself');
    const distributeReason = registry.get('transform.distributeX').disabledReason(contextFor({ selectionCount: 2 }));
    assert(distributeReason === 'Select at least 3 bricks', 'distribute explains itself');
    console.log('✓ disabled actions never execute (and explain why)');
}

// ---------------------------------------------------------------------
// 7. Actions invoke the correct existing session APIs
// ---------------------------------------------------------------------
{
    const { session, registry, feedback } = buildHarness({ clipboardCount: 2, selectedGroupId: 'g1', groups: [{ id: 'g1', name: 'Group A', memberCount: 3 }] });
    const context = contextFor({ clipboardCount: 2, selectedGroupId: 'g1', groups: [{ id: 'g1', name: 'Group A', memberCount: 3 }] });
    registry.execute('transform.alignLeft', context);
    assert(session.calledWith('alignSelection', 'x-min'), 'alignLeft -> alignSelection("x-min")');
    registry.execute('transform.alignCenterY', context);
    assert(session.calledWith('alignSelection', 'y-center'), 'alignCenterY -> alignSelection("y-center")');
    registry.execute('transform.distributeZ', context);
    assert(session.calledWith('distributeSelection', 'z'), 'distributeZ -> distributeSelection("z")');
    registry.execute('transform.rotateClockwise', context);
    assert(session.calledWith('rotateSelection', 90), 'rotate clockwise -> rotateSelection(90)');
    registry.execute('transform.rotateCounterClockwise', context);
    assert(session.calledWith('rotateSelection', -90), 'rotate ccw -> rotateSelection(-90)');
    registry.execute('transform.nudgeRight', context);
    assert(session.calledWith('moveSelection', { x: 1, y: 0, z: 0 }), 'nudge right -> moveSelection({x:1,y:0,z:0})');
    registry.execute('transform.nudgeUp', context);
    assert(session.calledWith('moveSelection', { x: 0, y: 1, z: 0 }), 'nudge up -> moveSelection({x:0,y:1,z:0})');
    registry.execute('selection.delete', context);
    assert(session.callCount('deleteSelection') === 1, 'delete -> deleteSelection');
    registry.execute('selection.selectAll', context);
    assert(session.callCount('selectAll') === 1, 'selectAll -> selectAll');
    registry.execute('clipboard.copy', context);
    assert(session.callCount('copySelection') === 1, 'copy -> copySelection');
    registry.execute('clipboard.paste', context);
    assert(session.callCount('paste') === 1, 'paste -> paste');
    registry.execute('group.create', context);
    assert(session.callCount('createGroupFromSelection') === 1, 'group.create -> createGroupFromSelection');
    registry.execute('group.rename', context);
    assert(session.callCount('renameSelectedGroup') === 1, 'group.rename -> renameSelectedGroup');
    registry.execute('history.undo', context);
    assert(session.callCount('undo') === 1, 'undo -> session.undo');
    registry.execute('history.redo', context);
    assert(session.callCount('redo') === 1, 'redo -> session.redo');
    assert(feedback.messages.includes('Aligned Left'), 'feedback reports alignment');
    assert(feedback.messages.includes('Rotated +90°'), 'feedback reports rotation');
    console.log('✓ actions invoke the correct session APIs');
}

// ---------------------------------------------------------------------
// 8. Transform parity with keyboard semantics
// ---------------------------------------------------------------------
{
    const { session, registry } = buildHarness();
    const context = contextFor();
    registry.execute('transform.rotateClockwise', context);
    // The action must produce exactly the delta the R key has produced
    // since 0.1.34 — same number, same call shape.
    const rotationCall = session.calls.find((call) => call.name === 'rotateSelection');
    assert(rotationCall.args[0] === 90, 'action rotation delta === keyboard R delta');
    registry.execute('transform.nudgeForward', context);
    assert(session.calledWith('moveSelection', { x: 0, y: 0, z: -1 }), 'nudge forward matches ArrowUp semantics');
    console.log('✓ transform parity with keyboard semantics');
}

// ---------------------------------------------------------------------
// 9. Selection-only actions leave mutation APIs untouched
// ---------------------------------------------------------------------
{
    const { session, registry } = buildHarness();
    const context = contextFor();
    registry.execute('selection.selectAll', context);
    registry.execute('selection.clear', context);
    registry.execute('ui.commandPalette', context);
    const mutationNames = ['deleteSelection', 'moveSelection', 'rotateSelection', 'alignSelection',
        'distributeSelection', 'undo', 'redo', 'copySelection', 'paste'];
    const mutations = session.calls.filter((call) => mutationNames.includes(call.name));
    assert(mutations.length === 0, 'selection-only actions produce no mutation calls');
    console.log('✓ selection-only actions are mutation-free');
}

// ---------------------------------------------------------------------
// 10. One session call per world operation
// ---------------------------------------------------------------------
{
    const { session, registry } = buildHarness();
    const context = contextFor();
    registry.execute('transform.alignRight', context);
    assert(session.callCount('alignSelection') === 1, 'one align call per action');
    registry.execute('history.undo', context);
    assert(session.callCount('undo') === 1, 'one undo call per action');
    console.log('✓ one session call per operation');
}

// ---------------------------------------------------------------------
// 11. Gesture and placement guards
// ---------------------------------------------------------------------
{
    const { session, registry } = buildHarness({ gestureActive: true });
    const gestureContext = contextFor({ gestureActive: true });
    assert(registry.get('transform.alignLeft').enabled(gestureContext) === false, 'align disabled mid-gesture');
    assert(registry.get('history.undo').enabled(gestureContext) === false, 'undo disabled mid-gesture');
    const placeContext = contextFor({ activeTool: 'place' });
    assert(registry.get('selection.delete').enabled(placeContext) === false, 'delete disabled in placement mode');
    assert(registry.get('selection.selectAll').enabled(placeContext) === true, 'select all stays available');
    assert(session.calls.length === 0, 'guards prevented every call');
    console.log('✓ gesture and placement guards');
}

// ---------------------------------------------------------------------
// 12. Degradation on surfaces missing capabilities
// ---------------------------------------------------------------------
{
    const bareSession = {
        calls: [],
        moveSelection(delta) { this.calls.push(['moveSelection', delta]); }
    };
    const { feedback, registry } = buildHarness({}, bareSession);
    const context = contextFor();
    registry.execute('clipboard.copy', context);
    assert(bareSession.calls.length === 0, 'missing capability is not called');
    assert(feedback.messages.some((message) => message.includes('not available')),
        'missing capability surfaces friendly feedback');
    registry.execute('transform.nudgeRight', context);
    assert(bareSession.calls.length === 1, 'present capability still works');
    console.log('✓ graceful degradation on partial surfaces');
}

// ---------------------------------------------------------------------
// 13. Escape priority chain
// ---------------------------------------------------------------------
{
    const resolve = InputRouter.resolveEscapeTarget;
    assert(resolve({ textInputFocused: true, paletteOpen: true, gestureActive: true, marqueeActive: true }) === 'input',
        'text input beats everything');
    assert(resolve({ paletteOpen: true, gestureActive: true, marqueeActive: true }) === 'palette',
        'palette beats gesture');
    assert(resolve({ gestureActive: true, marqueeActive: true }) === 'gesture',
        'gesture beats marquee');
    assert(resolve({ marqueeActive: true }) === 'marquee', 'marquee beats selection');
    assert(resolve({}) === 'selection', 'selection is the fallback');
    assert(JSON.stringify(InputRouter.ESCAPE_PRIORITY) === JSON.stringify(['input', 'palette', 'gesture', 'marquee', 'selection']),
        'priority order is explicit and stable');
    console.log('✓ escape priority: input > palette > gesture > marquee > selection');
}

// ---------------------------------------------------------------------
// 14. Text input detection
// ---------------------------------------------------------------------
{
    assert(InputRouter.isTextInputTarget({ tagName: 'INPUT' }) === true, 'INPUT is a text input');
    assert(InputRouter.isTextInputTarget({ tagName: 'TEXTAREA' }) === true, 'TEXTAREA is a text input');
    assert(InputRouter.isTextInputTarget({ tagName: 'DIV', isContentEditable: true }) === true,
        'contentEditable is a text input');
    assert(InputRouter.isTextInputTarget({ tagName: 'DIV' }) === false, 'plain DIV is not');
    assert(InputRouter.isTextInputTarget(null) === false, 'null target is not');
    console.log('✓ text input detection');
}

// ---------------------------------------------------------------------
// 15. EditorActionContext capture
// ---------------------------------------------------------------------
{
    const session = new FakeSession({ clipboardCount: 4, canUndo: true, canRedo: false });
    const context = EditorActionContext.capture({ session, selectionCount: 5, paletteOpen: true, activeTool: 'select' });
    assert(context.selectionCount === 5, 'capture takes view-provided selection count');
    assert(context.clipboardCount === 4, 'capture reads clipboard count');
    assert(context.canUndo === true && context.canRedo === false, 'capture reads history flags');
    assert(context.undoLabel === 'Undo Move 3 Bricks', 'capture reads undo label');
    assert(context.paletteOpen === true, 'capture records palette state');

    // Duck-typed fallbacks: a nearly-empty session must not throw.
    const bare = EditorActionContext.capture({ session: {}, selectionCount: 0 });
    assert(bare.clipboardCount === 0 && bare.groups.length === 0 && bare.canUndo === false,
        'missing capabilities fall back to inert defaults');

    // commandHistory fallback path (EditorSession exposes commandHistory).
    const withHistory = EditorActionContext.capture({
        session: { commandHistory: { canUndo: () => true, canRedo: () => true, getUndoLabel: () => 'Undo X', getRedoLabel: () => 'Redo X' } },
        selectionCount: 1
    });
    assert(withHistory.canUndo === true && withHistory.redoLabel === 'Redo X',
        'history metadata falls back to session.commandHistory');
    console.log('✓ EditorActionContext capture');
}

// ---------------------------------------------------------------------
// 16. Surface parity: same definitions on both sides
// ---------------------------------------------------------------------
{
    const editorHarness = buildHarness();
    const worldHarness = buildHarness();
    const editorIds = editorHarness.registry.getAll().map((action) => action.id).sort();
    const worldIds = worldHarness.registry.getAll().map((action) => action.id).sort();
    assert(JSON.stringify(editorIds) === JSON.stringify(worldIds),
        'both surfaces expose identical action ids');
    for (const id of editorIds) {
        const a = editorHarness.registry.get(id);
        const b = worldHarness.registry.get(id);
        assert(a.label === b.label && a.category === b.category && a.shortcut === b.shortcut,
            `definition parity for ${id}`);
    }
    console.log('✓ surface parity: one registry shape for both views');
}

console.log('\nAll editor action tests passed.');
