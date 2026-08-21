const SELECTION_COLOR = 0xffaa00;
const PRIMARY_SELECTION_COLOR = 0xffdd33;
const HOVER_COLOR = 0x44aaff;
const COMBINED_COLOR = 0xffcc00; // Distinct when both states apply
const NO_HIGHLIGHT_COLOR = 0x000000;

// The renderer's third overlay: spatial selection and hover highlights.
// Multi-selection tracks all selected brick ids while preserving a primary
// brick with a brighter highlight for inspection/editing affordances.
//
// 0.2.93 — World View Instance Inspection adds a SECOND, independent
// highlight track: a whole StructurePlacement instance, via the
// optional `placementMeshRegistry` constructor param — the World View
// counterpart to renderer/SelectionRenderer.js's own highlightPlacement()
// (the Editor's equivalent). Kept as its own `_selectedPlacementId`
// field rather than folded into `_selectedBrickIds`, mirroring the same
// separation application/spatial-state/SpatialSelectionState.js's own
// header establishes at the selection-state layer: a placement
// selection is never a brick selection, so the two highlight tracks are
// always mutually exclusive by construction — selecting one clears the
// other (see selectMany/select/selectPlacement below), and clear()/
// clearSelection() always clear both.
export class SpatialSelectionRenderer {
    constructor(meshRegistry, placementMeshRegistry = null) {
        this._meshRegistry = meshRegistry;
        this._placementMeshRegistry = placementMeshRegistry;
        this._selectedBrickIds = new Set();
        this._primaryBrickId = null;
        this._hoveredBrickId = null;
        this._selectedPlacementId = null;
    }

    select(brickId) {
        this.selectMany(brickId ? [brickId] : [], brickId);
    }

    selectMany(brickIds, primaryBrickId = null) {
        this._clearPlacementHighlight();
        const previous = new Set(this._selectedBrickIds);
        const previousPrimary = this._primaryBrickId;
        this._selectedBrickIds = new Set(brickIds || []);
        this._primaryBrickId = primaryBrickId || (brickIds && brickIds.length ? brickIds[brickIds.length - 1] : null);
        for (const brickId of previous) this._applyHighlight(brickId);
        for (const brickId of this._selectedBrickIds) this._applyHighlight(brickId);
        if (previousPrimary) this._applyHighlight(previousPrimary);
    }

    // 0.2.93 — highlights every mesh belonging to ONE StructurePlacement
    // instance, "the whole house glows, never one brick of it" — see
    // this class's own header. Passing null (or an id with no registered
    // meshes) just clears the previous placement highlight. A no-op if
    // this renderer wasn't built with a placementMeshRegistry.
    selectPlacement(placementId) {
        if (!this._placementMeshRegistry) {
            return;
        }
        this.clearSelection();
        this._selectedPlacementId = placementId || null;
        this._applyPlacementHighlight();
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
        this._clearPlacementHighlight();
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
        this._clearPlacementHighlight();
    }

    _applyPlacementHighlight() {
        if (!this._placementMeshRegistry || !this._selectedPlacementId) {
            return;
        }
        for (const mesh of this._placementMeshRegistry.getMeshes(this._selectedPlacementId)) {
            if (!mesh || !mesh.material || !mesh.material.emissive) continue;
            mesh.material.emissive.setHex(PRIMARY_SELECTION_COLOR);
        }
    }

    _clearPlacementHighlight() {
        if (!this._placementMeshRegistry || !this._selectedPlacementId) {
            this._selectedPlacementId = null;
            return;
        }
        for (const mesh of this._placementMeshRegistry.getMeshes(this._selectedPlacementId)) {
            if (mesh && mesh.material && mesh.material.emissive) {
                mesh.material.emissive.setHex(NO_HIGHLIGHT_COLOR);
            }
        }
        this._selectedPlacementId = null;
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
