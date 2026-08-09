const HIGHLIGHT_COLOR = 0xffaa00;
const NO_HIGHLIGHT_COLOR = 0x000000;

// The renderer's third overlay: SpatialSelectionState -> visual highlight.
// Driven imperatively (highlight/clear methods) rather than by EventBus,
// because spatial selection is session-local and read-only. Keeps the
// renderer ignorant of why something is selected.
export class SpatialSelectionRenderer {
    constructor(meshRegistry) {
        this._meshRegistry = meshRegistry;
        this._highlightedBrickId = null;
    }

    highlight(brickId) {
        this.clear();
        const mesh = this._meshRegistry.getMesh(brickId);
        if (!mesh || !mesh.material || !mesh.material.emissive) {
            return;
        }
        mesh.material.emissive.setHex(HIGHLIGHT_COLOR);
        this._highlightedBrickId = brickId;
    }

    clear() {
        if (this._highlightedBrickId) {
            const mesh = this._meshRegistry.getMesh(this._highlightedBrickId);
            if (mesh && mesh.material && mesh.material.emissive) {
                mesh.material.emissive.setHex(NO_HIGHLIGHT_COLOR);
            }
        }
        this._highlightedBrickId = null;
    }
}
