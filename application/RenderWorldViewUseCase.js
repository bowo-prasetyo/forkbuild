import { Renderer } from '../renderer/Renderer.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { PickingService } from '../renderer/PickingService.js';
import { SpatialSelectionRenderer } from '../renderer/SpatialSelectionRenderer.js';
import { SpatialPreviewRenderer } from '../renderer/SpatialPreviewRenderer.js';
import { TransformGizmoRenderer } from '../renderer/TransformGizmoRenderer.js';
import { TransformGizmoController } from '../renderer/TransformGizmoController.js';
import { TransformMath } from './TransformMath.js';

// World View's render wiring. Exposes the same narrow gizmo surface
// RenderWorldUseCase does — one shared TransformGizmoController design,
// one shared gesture contract, no second gizmo implementation.
// WorldNavigationSession passes its SpatialEditingService as
// gestureService; TransformMath is injected so the gizmo drag preview
// and the committed TransformSelectionCommand are computed from
// identical definitions. As of 0.1.47 the pointer move/up functions
// carry modifier state down (precision mode) and gesture feedback up.
export class RenderWorldViewUseCase {
    execute(container, registry, eventBus = null, { gestureService = null } = {}) {
        const renderer = new Renderer(container);
        const worldRenderer = new WorldRenderer(renderer, registry);
        if (eventBus) {
            worldRenderer.subscribe(eventBus);
        }
        renderer.start();
        const pickingService = new PickingService(
            renderer.camera,
            renderer.domElement,
            worldRenderer.meshRegistry
        );
        const spatialSelectionRenderer = new SpatialSelectionRenderer(
            worldRenderer.meshRegistry
        );
        const spatialPreviewRenderer = new SpatialPreviewRenderer(renderer);
        const transformGizmoRenderer = new TransformGizmoRenderer(renderer);
        const transformGizmoController = new TransformGizmoController({
            camera: renderer.camera,
            domElement: renderer.domElement,
            gizmoRenderer: transformGizmoRenderer,
            gestureService,
            controlsEnabler: renderer.cameraController,
            transformMath: TransformMath
        });
        return {
            pick: (screenX, screenY) => pickingService.pickRich(screenX, screenY),
            pickGround: (screenX, screenY) => {
                const pos = pickingService.pickGroundPosition(screenX, screenY);
                return pos ? { type: 'ground', position: pos } : null;
            },
            getCameraState: () => renderer.cameraController.getState(),
            setCameraState: (state) => renderer.cameraController.setState(state),
            setControlsEnabled: (enabled) => renderer.cameraController.setEnabled(enabled),
            addWorld: (world, documentId, layoutPosition) => worldRenderer.addWorld(world, documentId, layoutPosition),
            removeWorld: (world, documentId) => worldRenderer.removeWorld(world, documentId),
            selectBrick: (brickId) => spatialSelectionRenderer.select(brickId),
            selectBricks: (brickIds, primaryBrickId = null) => spatialSelectionRenderer.selectMany(brickIds, primaryBrickId),
            clearSelection: () => spatialSelectionRenderer.clearSelection(),
            hoverBrick: (brickId) => spatialSelectionRenderer.hover(brickId),
            clearHover: () => spatialSelectionRenderer.clearHover(),
            showPreview: (definitionId, position, rotation) => spatialPreviewRenderer.show(definitionId, position, rotation),
            hidePreview: () => spatialPreviewRenderer.hide(),
            showGizmo: (pivot, bounds) => transformGizmoController.show(pivot, bounds),
            hideGizmo: () => transformGizmoController.hide(),
            gizmoHitTest: (screenX, screenY) =>
                transformGizmoController.hitTest(screenX, screenY),
            gizmoPointerDown: (screenX, screenY, selection) =>
                transformGizmoController.onPointerDown(screenX, screenY, selection),
            gizmoPointerMove: (screenX, screenY, selection, modifiers = null) =>
                transformGizmoController.onPointerMove(screenX, screenY, selection, modifiers),
            gizmoPointerUp: (screenX, screenY, selection, modifiers = null) =>
                transformGizmoController.onPointerUp(screenX, screenY, selection, modifiers),
            gizmoKeyDown: (keyEvent, selection) =>
                transformGizmoController.onKeyDown(keyEvent, selection),
            cancelGizmoGesture: () => transformGizmoController.cancelGesture(),
            isGizmoDragging: () => transformGizmoController.isDragging,
            dispose() {
                transformGizmoController.dispose();
                transformGizmoRenderer.dispose();
                spatialPreviewRenderer.dispose();
                spatialSelectionRenderer.clear();
                renderer.dispose();
            }
        };
    }
}
