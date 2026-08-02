import { EditorEvent } from '../core/events/EditorEvent.js';
import { ThreeBrickFactory } from './ThreeBrickFactory.js';

const PREVIEW_OPACITY = 0.45;

// The renderer's second overlay (after SelectionRenderer): PreviewState ->
// ghost mesh. Subscribes to EditorEvent.PREVIEW_CHANGED and shows, moves,
// or hides a single semi-transparent mesh. Never touches the World, never
// creates a real Brick — reuses ThreeBrickFactory so the ghost has the
// exact geometry the real brick would have if placed.
export class PreviewRenderer {
    constructor(renderer, brickFactory = new ThreeBrickFactory()) {
        this._renderer = renderer;
        this._brickFactory = brickFactory;
        this._mesh = null;
        this._currentDefinitionId = null;
        this._subscription = null;
    }

    subscribe(editorEventBus) {
        this._subscription = editorEventBus.subscribe(
            EditorEvent.PREVIEW_CHANGED,
            ({ preview }) => this._onPreviewChanged(preview)
        );
    }

    unsubscribe() {
        if (this._subscription) {
            this._subscription.unsubscribe();
            this._subscription = null;
        }
        this._removeMesh();
    }

    _onPreviewChanged(preview) {
        if (!preview.visible || !preview.definitionId) {
            this._removeMesh();
            return;
        }

        if (!this._mesh || this._currentDefinitionId !== preview.definitionId) {
            this._removeMesh();
            this._mesh = this._createGhostMesh(preview.definitionId);
            this._currentDefinitionId = preview.definitionId;
            this._renderer.add(this._mesh);
        }

        this._mesh.position.set(preview.position.x, preview.position.y, preview.position.z);
        this._mesh.rotation.y = preview.rotation;
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
}
