import { Renderer } from '../renderer/Renderer.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { PickingService } from '../renderer/PickingService.js';
import { SelectionRenderer } from '../renderer/SelectionRenderer.js';
import { PreviewRenderer } from '../renderer/PreviewRenderer.js';
import { TransformGizmoRenderer } from '../renderer/TransformGizmoRenderer.js';
import { TransformGizmoController } from '../renderer/TransformGizmoController.js';
import { TransformMath } from './TransformMath.js';

// Wires the rendering pipeline up to a container element, the domain
// EventBus, and the editor EventBus, then starts it. Also wires up
// PickingService, SelectionRenderer, PreviewRenderer, and the interactive
// transform gizmo, all against the same camera/canvas/MeshRegistry the
// renderer already built. The caller gets pick(screenX, screenY),
// pickGround(screenX, screenY), and a narrow gizmo surface on the
// returned handle and never needs to know Renderer, WorldRenderer, or
// Three.js exist.
//
// Gizmo wiring: gestureService implements the gesture contract
// (begin/preview/commit/cancelTransformGesture + getSelectionBounds +
// getGestureFeedback) — the EditorSession's SpatialEditingService today.
// TransformMath is injected into the controller here so renderer/ never
// imports application/. As of 0.1.47 the pointer move/up functions also
// carry modifier state down to the gesture transaction (precision mode)
// and return the service's gesture feedback up to the views.
export class RenderWorldUseCase {
    execute(container, eventBus, registry, editorEventBus, { gestureService = null } = {}) {
        const renderer = new Renderer(container);
        const worldRenderer = new WorldRenderer(renderer, registry);
        worldRenderer.subscribe(eventBus);
        renderer.start();
        const pickingService = new PickingService(
            renderer.camera,
            renderer.domElement,
            worldRenderer.meshRegistry
        );
        const selectionRenderer = new SelectionRenderer(worldRenderer.meshRegistry);
        selectionRenderer.subscribe(editorEventBus);
        const previewRenderer = new PreviewRenderer(renderer);
        previewRenderer.subscribe(editorEventBus);
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
            pick: (screenX, screenY) => pickingService.pick(screenX, screenY),
            pickGround: (screenX, screenY) => pickingService.pickGroundPosition(screenX, screenY),
            setControlsEnabled: (enabled) => renderer.cameraController.setEnabled(enabled),
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
                previewRenderer.unsubscribe();
                selectionRenderer.unsubscribe();
                worldRenderer.unsubscribe();
                renderer.dispose();
            }
        };
    }
}
