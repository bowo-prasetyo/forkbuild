import { EditorEvent } from '../core/events/EditorEvent.js';
import { ThreeBrickFactory } from './ThreeBrickFactory.js';

const PREVIEW_OPACITY = 0.45;
const INVALID_COLOR = 0xe05252;

// 0.2.91 — World Instance Editing & Placement Management: the real 3D
// ghost 0.2.90 deliberately deferred ("0.2.90 deliberately does NOT give
// the structure-placement preview a full multi-brick 3D ghost... a full
// instanced ghost mesh is real, useful, future work" — see 0.2.90's own
// header in docs/Roadmap.md). PreviewState -> StructurePreviewState's
// multi-brick counterpart to renderer/PreviewRenderer.js, one rung up:
// subscribes to EditorEvent.STRUCTURE_PREVIEW_CHANGED and shows, moves,
// or hides a whole set of semi-transparent ghost meshes, one per brick
// in the referenced Document, composed with the preview's own
// position/rotation exactly the way renderer/WorldRenderer.js#
// _renderStructurePlacement() composes a COMMITTED placement — the ghost
// is a preview of that exact composition, not a separate approximation
// of it.
//
// Reused for TWO callers, per the design conversation's own "reuse the
// existing preview infrastructure... wherever possible": placing a NEW
// structure (application/tools/StructurePlacementTool.js, StructurePreviewState/
// StructurePreviewUseCase already existed for this since 0.2.90) AND
// dragging an ALREADY-PLACED instance to move it
// (application/tools/SelectionTool.js's drag-to-move, 0.2.91) — both
// simply call the same StructurePreviewUseCase#show()/hide(), and this
// renderer has no idea which caller it was. Never touches the World,
// never creates a real StructurePlacement.
//
// structureResolver/transformMath are injected (never imported) for the
// exact reason renderer/WorldRenderer.js's own header gives: renderer/
// must never depend on application/.
export class StructurePreviewRenderer {
    constructor(renderer, structureResolver = null, transformMath = null, brickFactory = new ThreeBrickFactory()) {
        this._renderer = renderer;
        this._structureResolver = structureResolver;
        this._transformMath = transformMath;
        this._brickFactory = brickFactory;
        this._meshes = [];
        this._currentDocumentId = null;
        this._subscription = null;
    }

    subscribe(editorEventBus) {
        this._subscription = editorEventBus.subscribe(
            EditorEvent.STRUCTURE_PREVIEW_CHANGED,
            ({ structurePreview }) => this._onPreviewChanged(structurePreview)
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
        if (!preview.visible || !preview.documentId || !this._structureResolver) {
            this._removeMeshes();
            return;
        }

        if (this._currentDocumentId !== preview.documentId) {
            this._removeMeshes();
            const world = this._structureResolver.resolve(preview.documentId);
            if (!world) {
                return;
            }
            this._meshes = this._buildGhostMeshes(world);
            this._currentDocumentId = preview.documentId;
            for (const mesh of this._meshes) {
                this._renderer.add(mesh);
            }
        }

        this._applyTransform(preview);
        this._applyValidity(preview.valid);
    }

    _buildGhostMeshes(world) {
        const meshes = [];
        for (const building of world.getBuildings()) {
            for (const brick of building.getBricks()) {
                const mesh = this._brickFactory.createMesh(brick.definitionId);
                mesh.material = mesh.material.clone();
                mesh.material.transparent = true;
                mesh.material.opacity = PREVIEW_OPACITY;
                mesh.userData.baseColor = mesh.material.color.clone();
                mesh.userData.localPosition = brick.position;
                mesh.userData.localRotation = brick.rotation;
                meshes.push(mesh);
            }
        }
        return meshes;
    }

    // Mirrors WorldRenderer#_renderStructurePlacement()'s own
    // composition exactly: each brick's local position, rotated around
    // the origin by the PREVIEW's rotation, translated by the preview's
    // position, then lifted by terrain sampled at that position — a
    // structure placement transforms its content at render time, never
    // at rest, and the ghost is no exception.
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
        this._currentDocumentId = null;
    }
}
