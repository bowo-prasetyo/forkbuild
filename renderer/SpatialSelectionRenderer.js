const SELECTION_COLOR = 0xffaa00;
const HOVER_COLOR = 0x44aaff;
const NO_HIGHLIGHT_COLOR = 0x000000;

// The renderer's third overlay: spatial selection and hover highlights.
// Driven imperatively rather than by EventBus. Selection (orange) and
// hover (blue) are independent — one does not clear the other.
export class SpatialSelectionRenderer {
    constructor(meshRegistry) {
        this._meshRegistry = meshRegistry;
        this._selectedBrickId = null;
        this._hoveredBrickId = null;
    }

    select(brickId) {
        this.clearSelection();
        const mesh = this._meshRegistry.getMesh(brickId);
        if (!mesh || !mesh.material || !mesh.material.emissive) {
            return;
        }
        mesh.material.emissive.setHex(SELECTION_COLOR);
        this._selectedBrickId = brickId;
    }

    hover(brickId) {
        if (this._hoveredBrickId === brickId) {
            return;
        }
        this.clearHover();
        const mesh = this._meshRegistry.getMesh(brickId);
        if (!mesh || !mesh.material || !mesh.material.emissive) {
            return;
        }
        mesh.material.emissive.setHex(HOVER_COLOR);
        this._hoveredBrickId = brickId;
    }

    clearSelection() {
        if (this._selectedBrickId) {
            const mesh = this._meshRegistry.getMesh(this._selectedBrickId);
            if (mesh && mesh.material && mesh.material.emissive) {
                mesh.material.emissive.setHex(NO_HIGHLIGHT_COLOR);
            }
        }
        this._selectedBrickId = null;
    }

    clearHover() {
        if (this._hoveredBrickId) {
            const mesh = this._meshRegistry.getMesh(this._hoveredBrickId);
            if (mesh && mesh.material && mesh.material.emissive) {
                mesh.material.emissive.setHex(NO_HIGHLIGHT_COLOR);
            }
        }
        this._hoveredBrickId = null;
    }

    clear() {
        this.clearSelection();
        this.clearHover();
    }
}
