const SELECTION_COLOR = 0xffaa00;
const HOVER_COLOR = 0x44aaff;
const COMBINED_COLOR = 0xffcc00; // Distinct when both states apply
const NO_HIGHLIGHT_COLOR = 0x000000;

// The renderer's third overlay: spatial selection and hover highlights.
// Driven imperatively rather than by EventBus. Selection (orange) and
// hover (blue) are independent — one does not clear the other.
//
// 0.1.31 fix: a single _applyHighlight compositor ensures that hover
// never overwrites selection and clearHover never erases a selected brick.
export class SpatialSelectionRenderer {
    constructor(meshRegistry) {
        this._meshRegistry = meshRegistry;
        this._selectedIds = new Set();
        this._hoveredId = null;
    }

    select(brickIds) {
        const previous = new Set(this._selectedIds);
        this._selectedIds = new Set(brickIds);
        
        // Refresh everything that changed
        for (const id of previous) this._applyHighlight(id);
        for (const id of this._selectedIds) this._applyHighlight(id);
    }

    hover(brickId) {
        if (this._hoveredId === brickId) return;
        const prev = this._hoveredId;
        this._hoveredId = brickId;
        if (prev) this._applyHighlight(prev);
        if (brickId) this._applyHighlight(brickId);
    }

    clearSelection() {
        const prev = Array.from(this._selectedIds);
        this._selectedIds.clear();
        for (const id of prev) this._applyHighlight(id);
    }

    clearHover() {
        const prev = this._hoveredId;
        this._hoveredId = null;
        if (prev) this._applyHighlight(prev);
    }

    _applyHighlight(brickId) {
        const mesh = this._meshRegistry.getMesh(brickId);
        if (!mesh || !mesh.material || !mesh.material.emissive) return;

        const isSelected = this._selectedIds.has(brickId);
        const isHovered = this._hoveredId === brickId;

        if (isSelected && isHovered) {
            mesh.material.emissive.setHex(COMBINED_COLOR);
        } else if (isSelected) {
            mesh.material.emissive.setHex(SELECTION_COLOR);
        } else if (isHovered) {
            mesh.material.emissive.setHex(HOVER_COLOR);
        } else {
            mesh.material.emissive.setHex(NO_HIGHLIGHT_COLOR);
        }
    }
}
