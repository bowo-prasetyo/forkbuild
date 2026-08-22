import { EditorEvent } from '../core/events/EditorEvent.js';
import { ThreeBrickFactory } from './ThreeBrickFactory.js';

const PREVIEW_OPACITY = 0.45;
const INVALID_COLOR = 0xe05252;

// 0.4.1 — Interactive Structure Composition UX: the real 3D ghost for
// composing a library Structure, mirroring
// renderer/StructurePreviewRenderer.js's own shape almost line for line
// (subscribe to a *_PREVIEW_CHANGED editor event, show/move/hide a set
// of semi-transparent ghost meshes) — see that renderer's own header
// for the general pattern this reuses.
//
// The one real difference is WHERE the ghost geometry comes from: a
// StructurePreviewRenderer resolves a documentId through
// StructureDocumentResolver on every preview change, because a
// StructurePlacement references a Document that can change out from
// under it. A composed Structure has no such reference to resolve —
// CompositionPreviewState carries the Structure INSTANCE itself
// (application/editor-state/CompositionPreviewState.js's own header),
// so this renderer builds ghost meshes straight from structure.bricks,
// no resolver, no I/O, no "unresolvable" case to degrade from.
//
// Never touches the World, never creates a real Brick — the ghost is a
// preview of the ONE PasteBricksCommand
// application/CopyStructureIntoDocumentUseCase.js will eventually
// build (via application/StructureCompositionTransform.js, the exact
// composition this renderer's own _applyTransform() mirrors), not an
// approximation of it.
//
// brickFactory is injected (never imported as a singleton) for the
// exact reason StructurePreviewRenderer's own constructor already
// takes one — this stays test-constructible without a live renderer.
export class CompositionPreviewRenderer {
    constructor(renderer, transformMath = null, brickFactory = new ThreeBrickFactory()) {
        this._renderer = renderer;
        this._transformMath = transformMath;
        this._brickFactory = brickFactory;
        this._meshes = [];
        this._currentStructureId = null;
        this._subscription = null;
    }

    subscribe(editorEventBus) {
        this._subscription = editorEventBus.subscribe(
            EditorEvent.COMPOSITION_PREVIEW_CHANGED,
            ({ compositionPreview }) => this._onPreviewChanged(compositionPreview)
        );
    }

    unsubscribe() {
        if (this._subscription) {
            this._subscription.unsubscribe();
            this._subscription = null;
        }
        this._removeMeshes();
    }

    _onPreviewChanged(preview) {
        if (!preview.visible || !preview.structure) {
            this._removeMeshes();
            return;
        }

        if (this._currentStructureId !== preview.structure.id) {
            this._removeMeshes();
            this._meshes = this._buildGhostMeshes(preview.structure);
            this._currentStructureId = preview.structure.id;
            for (const mesh of this._meshes) {
                this._renderer.add(mesh);
            }
        }

        this._applyTransform(preview);
        this._applyValidity(preview.valid);
    }

    _buildGhostMeshes(structure) {
        const meshes = [];
        for (const brick of structure.bricks) {
            const mesh = this._brickFactory.createMesh(brick.definitionId);
            mesh.material = mesh.material.clone();
            mesh.material.transparent = true;
            mesh.material.opacity = PREVIEW_OPACITY;
            mesh.userData.baseColor = mesh.material.color.clone();
            mesh.userData.localPosition = brick.position;
            mesh.userData.localRotation = brick.rotation;
            meshes.push(mesh);
        }
        return meshes;
    }

    // Mirrors StructurePreviewRenderer#_applyTransform() exactly — each
    // brick's local position, rotated around the origin by the
    // preview's own rotation, translated by the preview's position,
    // lifted by terrain sampled at that position. The SAME math
    // application/StructureCompositionTransform.js#transformStructureBricks()
    // applies at commit time, so what the ghost shows is exactly what
    // PasteBricksCommand will insert.
    _applyTransform(preview) {
        const groundY = this._terrainOffsetY(preview.position.x, preview.position.z);
        for (const mesh of this._meshes) {
            const localPoint = this._rotateAroundOrigin(mesh.userData.localPosition, preview.rotation);
            mesh.position.set(
                localPoint.x + preview.position.x,
                localPoint.y + preview.position.y + groundY,
                localPoint.z + preview.position.z
            );
            mesh.rotation.y = (mesh.userData.localRotation + preview.rotation) * (Math.PI / 180);
        }
    }

    _rotateAroundOrigin(point, degrees) {
        if (!degrees || !this._transformMath) {
            return point;
        }
        return this._transformMath.rotatePointAroundPivotY(point, { x: 0, y: 0, z: 0 }, degrees);
    }

    _terrainOffsetY(x, z) {
        return typeof this._renderer.terrainHeightAt === 'function'
            ? this._renderer.terrainHeightAt(x, z)
            : 0;
    }

    _applyValidity(valid) {
        for (const mesh of this._meshes) {
            const baseColor = mesh.userData.baseColor;
            if (!baseColor) {
                continue;
            }
            if (valid) {
                mesh.material.color.copy(baseColor);
            } else {
                mesh.material.color.set(INVALID_COLOR);
            }
        }
    }

    _removeMeshes() {
        for (const mesh of this._meshes) {
            this._renderer.remove(mesh);
        }
        this._meshes = [];
        this._currentStructureId = null;
    }
}
