import { EditorEvent } from '../core/events/EditorEvent.js';
import { ThreeBrickFactory } from './ThreeBrickFactory.js';

const PREVIEW_OPACITY = 0.45;
const INVALID_COLOR = 0xe05252;

// The renderer's second overlay (after SelectionRenderer): PreviewState ->
// ghost mesh. Subscribes to EditorEvent.PREVIEW_CHANGED and shows, moves,
// or hides a single semi-transparent mesh. Never touches the World, never
// creates a real Brick — reuses ThreeBrickFactory so the ghost has the
// exact geometry the real brick would have if placed.
//
// 0.2.87 — two additions, both purely visual, neither touching
// PreviewState/EditorContext:
//   1. A rendering-time terrain offset, sampled once at the origin and
//      added to the ghost's Y — the EXACT fallback
//      renderer/WorldRenderer.js#_terrainOffsetY() already applies to
//      every COMMITTED Editor-mode brick (see its own 0.2.76 comment
//      and tests/WorldGroundTerrain.test.js Section D3: event-driven
//      brick placement has no per-document offset to look up, so it
//      falls back to sampling ground at (0, 0)). Before this, a brick's
//      ghost sat flush with the flat local Y=0 plane while the REAL
//      brick — the instant it committed — visually jumped by whatever
//      terrainHeightAt(0, 0) happens to be. Same duck-typed
//      `typeof terrainHeightAt === 'function'` guard WorldRenderer
//      uses, for the identical reason: tests construct this class with
//      a plain `{ add, remove }` fake low-level renderer.
//   2. `preview.valid` (new field, see PreviewState's own header) tints
//      the ghost red when the position is currently occupied, restoring
//      the brick's own true color the moment it becomes valid again —
//      never a second material, never touching geometry.
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

        const groundY = this._terrainOffsetY();
        this._mesh.position.set(preview.position.x, preview.position.y + groundY, preview.position.z);
        this._mesh.rotation.y = preview.rotation * (Math.PI / 180);
        this._applyValidity(preview.valid);
    }

    _terrainOffsetY() {
        return typeof this._renderer.terrainHeightAt === 'function'
            ? this._renderer.terrainHeightAt(0, 0)
            : 0;
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
}
