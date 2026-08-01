const DEFAULT_GRID_SNAP_ENABLED = true;
const DEFAULT_GRID_SNAP_SIZE = 1;

// Pure data: editor-local preferences. gridSnap lives here rather than as
// its own top-level EditorContext field — it's one setting among what will
// likely become several (units, theme, etc.), not a distinct subsystem.
export class EditorSettings {
    constructor({
        gridSnapEnabled = DEFAULT_GRID_SNAP_ENABLED,
        gridSnapSize = DEFAULT_GRID_SNAP_SIZE
    } = {}) {
        this._gridSnapEnabled = gridSnapEnabled;
        this._gridSnapSize = gridSnapSize;
    }

    get gridSnapEnabled() {
        return this._gridSnapEnabled;
    }

    get gridSnapSize() {
        return this._gridSnapSize;
    }
}
