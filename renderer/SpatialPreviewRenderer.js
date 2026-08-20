import { ThreeBrickFactory } from './ThreeBrickFactory.js';

const PREVIEW_OPACITY = 0.45;
const INVALID_COLOR = 0xe05252;

// World View counterpart to PreviewRenderer: driven imperatively
// rather than by EventBus. Adds/removes a single ghost mesh directly
// to the renderer scene, never touching domain state.
//
// 0.2.87 — `valid` (new 4th param, default true) tints the ghost red
// when WorldNavigationSession has determined the hovered position is
// occupied (SpatialPlacementState#blocked) — mirrors
// renderer/PreviewRenderer.js's own identical addition for the Editor.
// Deliberately NO terrain awareness here, unlike PreviewRenderer: the
// `position` this class receives has already had the document's own
// terrain offset folded in by WorldNavigationSession#_presentPlacementPreview()
// (application/ calling core/TerrainHeightField.js's pure function
// directly, the same discipline AvatarTerrainConstraint already
// established) — this class stays exactly what its own header always
// said: an imperative mesh mover, never a second place that decides
// what "the ground" means.
export class SpatialPreviewRenderer {
    constructor(renderer, brickFactory = new ThreeBrickFactory()) {
        this._renderer = renderer;
        this._brickFactory = brickFactory;
        this._mesh = null;
        this._currentDefinitionId = null;
    }

    show(definitionId, position, rotation = 0, valid = true) {
        if (!this._mesh || this._currentDefinitionId !== definitionId) {
            this._removeMesh();
            this._mesh = this._createGhostMesh(definitionId);
            this._currentDefinitionId = definitionId;
            this._renderer.add(this._mesh);
        }

        this._mesh.position.set(position.x, position.y, position.z);
        this._mesh.rotation.y = rotation * (Math.PI / 180);
        this._applyValidity(valid);
    }

    hide() {
        this._removeMesh();
    }

    _applyValidity(valid) {
        const baseColor = this._mesh.userData.baseColor;
        if (!baseColor) {
            return;
        }
        if (valid) {
            this._mesh.material.color.copy(baseColor);
        } else {
            this._mesh.material.color.set(INVALID_COLOR);
        }
    }

    _createGhostMesh(definitionId) {
        const mesh = this._brickFactory.createMesh(definitionId);
        mesh.material = mesh.material.clone();
        mesh.material.transparent = true;
        mesh.material.opacity = PREVIEW_OPACITY;
        mesh.userData.baseColor = mesh.material.color.clone();
        return mesh;
    }

    _removeMesh() {
        if (this._mesh) {
            this._renderer.remove(this._mesh);
            this._mesh = null;
            this._currentDefinitionId = null;
        }
    }

    dispose() {
        this._removeMesh();
    }
}
