import { EditorActionRegistry, createStandardActions } from '../application/EditorActionRegistry.js';
import { EditorActionContext } from '../application/EditorActionContext.js';
import { InputRouter } from '../application/InputRouter.js';

// 0.1.50 — Command palette tests. The component (ui/components/
// CommandPalette.js) is a thin visual layer; everything testable
// headlessly lives on EditorActionRegistry and InputRouter, and that is
// what this suite exercises: search behavior, grouping, disabled-state
// surfacing, execution gating, and the palette's place in the Escape
// priority chain.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class MinimalSession {
    constructor(state = {}) {
        this.calls = [];
        this._state = { selectionCount: 3, clipboardCount: 0, canUndo: true, canRedo: true, ...state };
    }
    selectAll() { this.calls.push('selectAll'); }
    clearSelection() { this.calls.push('clearSelection'); }
    deleteSelection() { this.calls.push('deleteSelection'); }
    moveSelection(delta) { this.calls.push(['moveSelection', delta]); }
    rotateSelection(delta) { this.calls.push(['rotateSelection', delta]); }
    alignSelection(mode) { this.calls.push(['alignSelection', mode]); }
    distributeSelection(axis) { this.calls.push(['distributeSelection', axis]); }
    undo() { this.calls.push('undo'); }
    redo() { this.calls.push('redo'); }
    canUndo() { return this._state.canUndo; }
    canRedo() { return this._state.canRedo; }
    getClipboardCount() { return this._state.clipboardCount; }
    getGroups() { return []; }
    getSelectedGroupId() { return null; }
    isGestureActive() { return false; }
}

function harness(sessionState = {}) {
    const session = new MinimalSession(sessionState);
    const feedback = { messages: [], show(message) { this.messages.push(message); } };
    const registry = new EditorActionRegistry(createStandardActions({ session, feedback, ui: {} }));
    return { session, feedback, registry };
}

function contextFor(sessionState = {}) {
    return new EditorActionContext({
        selectionCount: sessionState.selectionCount !== undefined ? sessionState.selectionCount : 3,
        clipboardCount: sessionState.clipboardCount || 0,
        canUndo: sessionState.canUndo !== undefined ? sessionState.canUndo : true,
        canRedo: sessionState.canRedo !== undefined ? sessionState.canRedo : true,
        activeTool: 'select'
    });
}

// ---------------------------------------------------------------------
// 1. Query normalization
// ---------------------------------------------------------------------
{
    assert(EditorActionRegistry.normalizeQuery('  ALIGN  ') === 'align', 'normalize trims and lowercases');
    assert(EditorActionRegistry.normalizeQuery(null) === '', 'normalize handles null');
    assert(EditorActionRegistry.normalizeQuery(undefined) === '', 'normalize handles undefined');
    console.log('✓ query normalization');
}

// ---------------------------------------------------------------------
// 2. Search results drive the palette list
// ---------------------------------------------------------------------
{
    const { registry } = harness();
    const alignResults = registry.findMatching('align');
    assert(alignResults.length === 9, 'palette search finds all nine align actions');
    const leftResults = registry.findMatching('left');
    assert(leftResults.some((action) => action.id === 'transform.alignLeft'), 'label fragments match');
    const historyResults = registry.findMatching('history');
    assert(historyResults.some((action) => action.id === 'history.undo')
        && historyResults.some((action) => action.id === 'history.redo'), 'category text matches');
    const idResults = registry.findMatching('rotatecounter');
    assert(idResults.some((action) => action.id === 'transform.rotateCounterClockwise'), 'id text matches');
    console.log('✓ search results');
}

// ---------------------------------------------------------------------
// 3. Grouped rendering data
// ---------------------------------------------------------------------
{
    const { registry } = harness();
    const groups = EditorActionRegistry.groupByCategory(registry.findMatching(''));
    assert(groups.length >= 5, 'palette shows multiple category sections');
    const transformGroup = groups.find((group) => group.category === 'Transform');
    assert(transformGroup.actions.length >= 18, 'transform section carries the full operation set');
    const order = groups.map((group) => group.category);
    assert(order.indexOf('Selection') < order.indexOf('Interface'), 'section order is stable');
    console.log('✓ grouped rendering data');
}

// ---------------------------------------------------------------------
// 4. Disabled actions stay visible with reasons
// ---------------------------------------------------------------------
{
    const { registry } = harness({ selectionCount: 2 });
    const context = contextFor({ selectionCount: 2 });
    const distributeResults = registry.findMatching('distribute');
    assert(distributeResults.length === 3, 'disabled actions still appear in search');
    for (const action of distributeResults) {
        assert(action.enabled(context) === false, `${action.id} disabled with two bricks`);
        assert(action.disabledReason(context) === 'Select at least 3 bricks', `${action.id} explains why`);
    }
    console.log('✓ disabled visibility with reasons');
}

// ---------------------------------------------------------------------
// 5. Enter executes only enabled actions
// ---------------------------------------------------------------------
{
    const { session, registry } = harness({ selectionCount: 2 });
    const context = contextFor({ selectionCount: 2 });
    assert(registry.execute('transform.distributeX', context) === false, 'Enter on disabled does nothing');
    assert(session.calls.length === 0, 'no session call for disabled execution');
    assert(registry.execute('transform.alignCenterX', context) === true, 'Enter on enabled executes');
    assert(session.calls.some((call) => Array.isArray(call) && call[0] === 'alignSelection' && call[1] === 'x-center'),
        'enabled execution reaches the session');
    console.log('✓ execution gating');
}

// ---------------------------------------------------------------------
// 6. Palette execution empties search-independent state correctly
// ---------------------------------------------------------------------
{
    const { session, registry } = harness();
    const context = contextFor();
    registry.execute('selection.selectAll', context);
    registry.execute('selection.clear', context);
    assert(session.calls.length === 2, 'palette executions run in order');
    console.log('✓ sequential palette executions');
}

// ---------------------------------------------------------------------
// 7. The palette's place in the Escape chain
// ---------------------------------------------------------------------
{
    const resolve = InputRouter.resolveEscapeTarget;
    assert(resolve({ paletteOpen: true, gestureActive: true }) === 'palette',
        'open palette owns Escape over an active gesture');
    assert(resolve({ textInputFocused: true, paletteOpen: true }) === 'input',
        'a focused field inside the palette owns Escape over the palette');
    assert(resolve({ paletteOpen: false, gestureActive: false }) === 'selection',
        'closed palette falls through to selection');
    console.log('✓ palette escape placement');
}

// ---------------------------------------------------------------------
// 8. Palette open action round-trip
// ---------------------------------------------------------------------
{
    const session = new MinimalSession();
    const feedback = { messages: [], show() {} };
    let toggles = 0;
    const ui = { togglePalette() { toggles += 1; } };
    const registry = new EditorActionRegistry(createStandardActions({ session, feedback, ui }));
    registry.execute('ui.commandPalette', contextFor());
    assert(toggles === 1, 'palette action toggles the palette through the ui hook');
    assert(session.calls.length === 0, 'opening the palette touches no session API');
    console.log('✓ palette open action');
}

console.log('\nAll command palette tests passed.');
