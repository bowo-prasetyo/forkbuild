// Pure data snapshot of everything the action layer needs to decide
// whether an operation is available right now (0.1.50). Captured fresh
// on every consumption — the palette, the sidebar, and shortcut dispatch
// never cache it, because "what is possible" changes with every
// selection change, history step, and clipboard update.
//
// Deliberately dumb: no session reference, no methods, no reactivity.
// capture() is defensive by design — surfaces expose what they have,
// anything missing falls back to an inert default, so the palette can
// never throw just because one surface predates a capability.
export class EditorActionContext {
    constructor({
        selectionCount = 0,
        clipboardCount = 0,
        groups = [],
        selectedGroupId = null,
        canUndo = false,
        canRedo = false,
        undoLabel = null,
        redoLabel = null,
        gestureActive = false,
        paletteOpen = false,
        activeTool = null,
        capabilities = null // NEW: explicit capability boundary (0.2.4)
    } = {}) {
        this._selectionCount = selectionCount;
        this._clipboardCount = clipboardCount;
        this._groups = groups;
        this._selectedGroupId = selectedGroupId;
        this._canUndo = canUndo;
        this._canRedo = canRedo;
        this._undoLabel = undoLabel;
        this._redoLabel = redoLabel;
        this._gestureActive = gestureActive;
        this._paletteOpen = paletteOpen;
        this._activeTool = activeTool;
        this._capabilities = capabilities;
    }

    get selectionCount() { return this._selectionCount; }
    get clipboardCount() { return this._clipboardCount; }
    get groups() { return this._groups; }
    get selectedGroupId() { return this._selectedGroupId; }
    get canUndo() { return this._canUndo; }
    get canRedo() { return this._canRedo; }
    get undoLabel() { return this._undoLabel; }
    get redoLabel() { return this._redoLabel; }
    get gestureActive() { return this._gestureActive; }
    get paletteOpen() { return this._paletteOpen; }
    get activeTool() { return this._activeTool; }

    get hasSelection() { return this._selectionCount > 0; }
    get hasGroups() { return this._groups.length > 0; }
    get hasSelectedGroup() { return this._selectedGroupId !== null; }
    get clipboardEmpty() { return this._clipboardCount === 0; }
    // 0.2.90: PLACE_STRUCTURE is gated exactly like PLACE — editing
    // shortcuts (align, distribute, numeric transform, move/rotate
    // selection) stay disabled while either placement mode is active,
    // the same "one hardcoded 'place'" spot 0.1.50 already used for the
    // brick ghost.
    get placementMode() { return this._activeTool === 'place' || this._activeTool === 'place-structure'; }
    get capabilities() { return this._capabilities; }

    // session: EditorSession or WorldNavigationSession. selectionCount /
    // paletteOpen / activeTool come from the host view, which already
    // tracks them reactively. Everything else is duck-typed off the
    // session: undo/redo metadata may live on the session itself or on
    // its exposed commandHistory — both are tried, in that order.
    static capture({ session = null, selectionCount = 0, paletteOpen = false, activeTool = null } = {}) {
        const call = (name, fallback) => {
            if (session && typeof session[name] === 'function') {
                try {
                    const value = session[name]();
                    return value === undefined ? fallback : value;
                } catch (error) {
                    return fallback;
                }
            }
            return fallback;
        };
        const historyCall = (name, fallback) => {
            if (session && typeof session[name] === 'function') {
                try {
                    return session[name]();
                } catch (error) {
                    return fallback;
                }
            }
            const history = session ? session.commandHistory : null;
            if (history && typeof history[name] === 'function') {
                try {
                    return history[name]();
                } catch (error) {
                    return fallback;
                }
            }
            return fallback;
        };
        const capabilities = (session && session.capabilities) ? session.capabilities : null;
        return new EditorActionContext({
            selectionCount,
            paletteOpen,
            activeTool,
            clipboardCount: call('getClipboardCount', 0),
            groups: call('getGroups', []),
            selectedGroupId: call('getSelectedGroupId', null),
            canUndo: historyCall('canUndo', false),
            canRedo: historyCall('canRedo', false),
            undoLabel: historyCall('getUndoLabel', null),
            redoLabel: historyCall('getRedoLabel', null),
            gestureActive: call('isGestureActive', false),
            capabilities // NEW
        });
    }
}
