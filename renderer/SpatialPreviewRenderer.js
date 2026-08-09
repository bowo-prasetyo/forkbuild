import { ThreeBrickFactory } from './ThreeBrickFactory.js';

const PREVIEW_OPACITY = 0.45;

// World View counterpart to PreviewRenderer: driven imperatively
// rather than by EventBus. Adds/removes a single ghost mesh directly
// to the renderer scene, never touching domain state.
export class SpatialPreviewRenderer {
    constructor(renderer, brickFactory = new ThreeBrickFactory()) {
        this._renderer = renderer;
        this._brickFactory = brickFactory;
        this._mesh = null;
        this._currentDefinitionId = null;
    }

    show(definitionId, position, rotation = 0) {
        if (!this._mesh || this._currentDefinitionId !== definitionId) {
            this._removeMesh();
            this._mesh = this._createGhostMesh(definitionId);
            this._currentDefinitionId = definitionId;
            this._renderer.add(this._mesh);
        }

        this._mesh.position.set(position.x, position.y, position.z);
        this._mesh.rotation.y = rotation;
    }

    hide() {
        this._removeMesh();
    }

    _createGhostMesh(definitionId) {
        const mesh = this._brickFactory.createMesh(definitionId);
        mesh.material = mesh.material.clone();
        mesh.material.transparent = true;
        mesh.material.opacity = PREVIEW_OPACITY;
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
