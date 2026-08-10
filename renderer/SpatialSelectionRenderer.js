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
        this._selectedBrickId = null;
        this._hoveredBrickId = null;
    }

    select(brickId) {
        this.clearSelection();
        this._selectedBrickId = brickId;
        this._applyHighlight(brickId);
    }

    hover(brickId) {
        if (this._hoveredBrickId === brickId) {
            return;
        }
        const previousHover = this._hoveredBrickId;
        this._hoveredBrickId = brickId;
        if (previousHover) {
            this._applyHighlight(previousHover);
        }
        this._applyHighlight(brickId);
    }

    clearSelection() {
        const previous = this._selectedBrickId;
        this._selectedBrickId = null;
        if (previous) {
            this._applyHighlight(previous);
        }
    }

    clearHover() {
        const previous = this._hoveredBrickId;
        this._hoveredBrickId = null;
        if (previous) {
            this._applyHighlight(previous);
        }
    }

    clear() {
        const previousSelected = this._selectedBrickId;
        const previousHover = this._hoveredBrickId;
        this._selectedBrickId = null;
        this._hoveredBrickId = null;
        if (previousSelected) {
            this._applyHighlight(previousSelected);
        }
        if (previousHover && previousHover !== previousSelected) {
            this._applyHighlight(previousHover);
        }
    }

    _applyHighlight(brickId) {
        const mesh = this._meshRegistry.getMesh(brickId);
        if (!mesh || !mesh.material || !mesh.material.emissive) {
            return;
        }

        const isSelected = this._selectedBrickId === brickId;
        const isHovered = this._hoveredBrickId === brickId;

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
