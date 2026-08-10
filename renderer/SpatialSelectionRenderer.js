const SELECTION_COLOR = 0xffaa00;
const PRIMARY_SELECTION_COLOR = 0xffdd33;
const HOVER_COLOR = 0x44aaff;
const COMBINED_COLOR = 0xffcc00; // Distinct when both states apply
const NO_HIGHLIGHT_COLOR = 0x000000;

// The renderer's third overlay: spatial selection and hover highlights.
// Multi-selection tracks all selected brick ids while preserving a primary
// brick with a brighter highlight for inspection/editing affordances.
export class SpatialSelectionRenderer {
    constructor(meshRegistry) {
        this._meshRegistry = meshRegistry;
        this._selectedBrickIds = new Set();
        this._primaryBrickId = null;
        this._hoveredBrickId = null;
    }

    select(brickId) {
        this.selectMany(brickId ? [brickId] : [], brickId);
    }

    selectMany(brickIds, primaryBrickId = null) {
        const previous = new Set(this._selectedBrickIds);
        const previousPrimary = this._primaryBrickId;
        this._selectedBrickIds = new Set(brickIds || []);
        this._primaryBrickId = primaryBrickId || (brickIds && brickIds.length ? brickIds[brickIds.length - 1] : null);
        for (const brickId of previous) this._applyHighlight(brickId);
        for (const brickId of this._selectedBrickIds) this._applyHighlight(brickId);
        if (previousPrimary) this._applyHighlight(previousPrimary);
    }

    hover(brickId) {
        if (this._hoveredBrickId === brickId) return;
        const previousHover = this._hoveredBrickId;
        this._hoveredBrickId = brickId;
        if (previousHover) this._applyHighlight(previousHover);
        this._applyHighlight(brickId);
    }

    clearSelection() {
        const previous = new Set(this._selectedBrickIds);
        const previousPrimary = this._primaryBrickId;
        this._selectedBrickIds.clear();
        this._primaryBrickId = null;
        for (const brickId of previous) this._applyHighlight(brickId);
        if (previousPrimary) this._applyHighlight(previousPrimary);
    }

    clearHover() {
        const previous = this._hoveredBrickId;
        this._hoveredBrickId = null;
        if (previous) this._applyHighlight(previous);
    }

    clear() {
        const previousSelected = new Set(this._selectedBrickIds);
        const previousHover = this._hoveredBrickId;
        this._selectedBrickIds.clear();
        this._primaryBrickId = null;
        this._hoveredBrickId = null;
        for (const brickId of previousSelected) this._applyHighlight(brickId);
        if (previousHover) this._applyHighlight(previousHover);
    }

    _applyHighlight(brickId) {
        const mesh = this._meshRegistry.getMesh(brickId);
        if (!mesh || !mesh.material || !mesh.material.emissive) return;

        const isSelected = this._selectedBrickIds.has(brickId);
        const isPrimary = this._primaryBrickId === brickId;
        const isHovered = this._hoveredBrickId === brickId;

        if (isSelected && isHovered) mesh.material.emissive.setHex(COMBINED_COLOR);
        else if (isPrimary) mesh.material.emissive.setHex(PRIMARY_SELECTION_COLOR);
        else if (isSelected) mesh.material.emissive.setHex(SELECTION_COLOR);
        else if (isHovered) mesh.material.emissive.setHex(HOVER_COLOR);
        else mesh.material.emissive.setHex(NO_HIGHLIGHT_COLOR);
    }
}
