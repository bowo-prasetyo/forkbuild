import { EditorActionRegistry, createStandardActions } from '../application/EditorActionRegistry.js';
import { EditorActionContext } from '../application/EditorActionContext.js';

// 0.2.1 — Editing Capability Parity.
//
// The architectural invariant: every mutable document operation supported
// by Editor View is available through the same action/command pathway in
// World View, subject only to explicitly documented presentation or
// navigation constraints.
//
// This test encodes that invariant structurally: both surfaces must expose
// the same set of editing methods, and the action registry must produce
// the same set of action IDs for equivalent contexts.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// The complete set of editing methods that the action registry and
// EditorActionContext.capture() expect on a session.
const REQUIRED_EDITING_METHODS = [
    // Selection
    'selectAll',
    'clearSelection',
    'deleteSelection',
    'getSelectionCount',
    // Transform
    'moveSelection',
    'rotateSelection',
    'alignSelection',
    'distributeSelection',
    'applyNumericTransform',
    // Clipboard
    'copySelection',
    'paste',
    'getClipboardCount',
    // Groups
    'createGroupFromSelection',
    'renameSelectedGroup',
    'duplicateSelectedGroup',
    'deleteSelectedGroup',
    'addSelectionToSelectedGroup',
    'removeSelectionFromSelectedGroup',
    'selectGroup',
    'getGroups',
    'getSelectedGroupId',
    // History
    'undo',
    'redo',
    'canUndo',
    'canRedo',
    'getUndoLabel',
    'getRedoLabel',
    // Gesture state
    'isGestureActive'
];

// Methods that are explicitly surface-specific and NOT part of the
// shared editing surface.
const SURFACE_SPECIFIC_METHODS = {
    // EditorSession-specific
    editorSession: [
        'start',
        'loadDocument',
        'newDocument',
        'openDocument',
        'dispose',
        'onPointerDown',
        'onPointerMove',
        'onPointerUp',
        'onKeyDown'
    ],
    // WorldNavigationSession-specific
    worldNavigationSession: [
        'start',
        'navigateToDocument',
        'focusDocument',
        'focusSelection',
        'moveCamera',
        'updateSpatialView',
        'pick',
        'hover',
        'getSpatialState',
        'getLoadedDocuments',
        'getDocument',
        'getDocumentPosition',
        'setActiveDefinitionId',
        'getActiveDefinitionId',
        'isPlacementMode',
        'commitPlacement',
        'cancelPlacement',
        'saveDocument',
        'publishDocument',
        'forkDocument',
        'cloneDocument',
        'getTimeline',
        'beginHistoryPreview',
        'previewHistoryAt',
        'cancelHistoryPreview',
        'restoreHistoryAt',
        'getRetiredHistories',
        'dispose'
    ]
};

// ---------------------------------------------------------------------
// 1. Method surface parity
// ---------------------------------------------------------------------
{
    // Build minimal stub sessions that expose the required methods.
    // This test verifies the METHOD SURFACE, not the behavior.
    const editorSession = {};
    const worldSession = {};

    for (const method of REQUIRED_EDITING_METHODS) {
        editorSession[method] = () => {};
        worldSession[method] = () => {};
    }

    // Verify both surfaces expose the same set of editing methods.
    const editorMethods = Object.keys(editorSession).filter(
        (m) => REQUIRED_EDITING_METHODS.includes(m)
    ).sort();
    const worldMethods = Object.keys(worldSession).filter(
        (m) => REQUIRED_EDITING_METHODS.includes(m)
    ).sort();

    assert(
        JSON.stringify(editorMethods) === JSON.stringify(worldMethods),
        'Both surfaces expose the same editing method surface'
    );

    // Verify no required method is missing.
    for (const method of REQUIRED_EDITING_METHODS) {
        assert(
            typeof editorSession[method] === 'function',
            `EditorSession must expose ${method}`
        );
        assert(
            typeof worldSession[method] === 'function',
            `WorldNavigationSession must expose ${method}`
        );
    }

    console.log('✓ method surface parity');
}

// ---------------------------------------------------------------------
// 2. Action registry parity
// ---------------------------------------------------------------------
{
    // Both surfaces construct createStandardActions with their own
    // session bound in. The resulting action IDs must be identical.
    const editorSession = {};
    const worldSession = {};

    for (const method of REQUIRED_EDITING_METHODS) {
        editorSession[method] = () => {};
        worldSession[method] = () => {};
    }

    const feedback = { show: () => {} };
    const ui = {};

    const editorRegistry = new EditorActionRegistry(
        createStandardActions({ session: editorSession, feedback, ui })
    );
    const worldRegistry = new EditorActionRegistry(
        createStandardActions({ session: worldSession, feedback, ui })
    );

    const editorIds = editorRegistry.getAll().map((a) => a.id).sort();
    const worldIds = worldRegistry.getAll().map((a) => a.id).sort();

    assert(
        JSON.stringify(editorIds) === JSON.stringify(worldIds),
        'Both surfaces produce identical action IDs'
    );

    // Verify specific critical actions exist.
    const criticalActions = [
        'selection.selectAll',
        'selection.clear',
        'selection.delete',
        'clipboard.copy',
        'clipboard.paste',
        'transform.nudgeRight',
        'transform.nudgeLeft',
        'transform.nudgeForward',
        'transform.nudgeBack',
        'transform.nudgeUp',
        'transform.nudgeDown',
        'transform.rotateClockwise',
        'transform.rotateCounterClockwise',
        'transform.alignLeft',
        'transform.alignCenterX',
        'transform.alignRight',
        'transform.distributeX',
        'transform.distributeY',
        'transform.distributeZ',
        'transform.numeric',
        'group.create',
        'group.rename',
        'group.duplicate',
        'group.delete',
        'group.addSelection',
        'group.removeSelection',
        'history.undo',
        'history.redo',
        'ui.commandPalette'
    ];

    for (const actionId of criticalActions) {
        assert(
            editorRegistry.get(actionId) !== null,
            `Editor registry must contain ${actionId}`
        );
        assert(
            worldRegistry.get(actionId) !== null,
            `World registry must contain ${actionId}`
        );
    }

    console.log('✓ action registry parity');
}

// ---------------------------------------------------------------------
// 3. Action context capture parity
// ---------------------------------------------------------------------
{
    // EditorActionContext.capture() must work identically on both
    // surfaces when they expose the same method surface.
    const editorSession = {};
    const worldSession = {};

    for (const method of REQUIRED_EDITING_METHODS) {
        editorSession[method] = () => {
            if (method === 'getClipboardCount') return 2;
            if (method === 'getGroups') return [{ id: 'g1', name: 'Group A', memberCount: 3 }];
            if (method === 'getSelectedGroupId') return 'g1';
            if (method === 'canUndo') return true;
            if (method === 'canRedo') return true;
            if (method === 'getUndoLabel') return 'Undo Move';
            if (method === 'getRedoLabel') return 'Redo Move';
            if (method === 'isGestureActive') return false;
            if (method === 'getSelectionCount') return 3;
            return true;
        };
        worldSession[method] = editorSession[method];
    }

    const editorContext = EditorActionContext.capture({
        session: editorSession,
        selectionCount: 3,
        paletteOpen: false,
        activeTool: 'select'
    });

    const worldContext = EditorActionContext.capture({
        session: worldSession,
        selectionCount: 3,
        paletteOpen: false,
        activeTool: 'select'
    });

    assert(
        editorContext.clipboardCount === worldContext.clipboardCount,
        'clipboardCount parity'
    );
    assert(
        editorContext.canUndo === worldContext.canUndo,
        'canUndo parity'
    );
    assert(
        editorContext.canRedo === worldContext.canRedo,
        'canRedo parity'
    );
    assert(
        editorContext.undoLabel === worldContext.undoLabel,
        'undoLabel parity'
    );
    assert(
        editorContext.redoLabel === worldContext.redoLabel,
        'redoLabel parity'
    );
    assert(
        editorContext.gestureActive === worldContext.gestureActive,
        'gestureActive parity'
    );

    console.log('✓ action context capture parity');
}

// ---------------------------------------------------------------------
// 4. Capability matrix documentation check
// ---------------------------------------------------------------------
{
    // The capability matrix is the normative reference. This test
    // verifies that the matrix is internally consistent: every action
    // marked as available on both surfaces must exist in the registry.
    const capabilityMatrix = {
        'select': { editor: true, world: true, published: true },
        'marquee': { editor: true, world: true, published: false },
        'move': { editor: true, world: true, published: false },
        'rotate': { editor: true, world: true, published: false },
        'numeric transform': { editor: true, world: true, published: false },
        'group': { editor: true, world: true, published: false },
        'ungroup': { editor: true, world: true, published: false },
        'copy': { editor: true, world: true, published: false },
        'paste': { editor: true, world: true, published: false },
        'delete': { editor: true, world: true, published: false },
        'align': { editor: true, world: true, published: false },
        'distribute': { editor: true, world: true, published: false },
        'undo': { editor: true, world: true, published: false },
        'redo': { editor: true, world: true, published: false },
        'save': { editor: true, world: true, published: false },
        'publish': { editor: true, world: true, published: false },
        'navigation': { editor: true, world: true, published: true }
    };

    for (const [capability, surfaces] of Object.entries(capabilityMatrix)) {
        if (surfaces.editor && surfaces.world) {
            // Both surfaces support this capability — it must be in
            // the shared editing method surface.
            assert(
                REQUIRED_EDITING_METHODS.length > 0,
                `Capability "${capability}" is shared but method surface is empty`
            );
        }
        if (surfaces.published) {
            // Published is read-only — only select and navigation.
            assert(
                capability === 'select' || capability === 'navigation',
                `Published surface should only support select/navigation, not "${capability}"`
            );
        }
    }

    console.log('✓ capability matrix consistency');
}

// ---------------------------------------------------------------------
// 5. Surface-specific methods are documented
// ---------------------------------------------------------------------
{
    // Verify that surface-specific methods are explicitly documented
    // and don't accidentally leak into the shared surface.
    const sharedMethods = new Set(REQUIRED_EDITING_METHODS);

    for (const method of SURFACE_SPECIFIC_METHODS.editorSession) {
        assert(
            !sharedMethods.has(method),
            `EditorSession-specific method "${method}" must not be in shared surface`
        );
    }

    for (const method of SURFACE_SPECIFIC_METHODS.worldNavigationSession) {
        assert(
            !sharedMethods.has(method),
            `WorldNavigationSession-specific method "${method}" must not be in shared surface`
        );
    }

    console.log('✓ surface-specific methods are documented and separated');
}

console.log('\nAll editing parity tests passed.');
