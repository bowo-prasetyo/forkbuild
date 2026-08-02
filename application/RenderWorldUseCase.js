import { Renderer } from '../renderer/Renderer.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { PickingService } from '../renderer/PickingService.js';
import { SelectionRenderer } from '../renderer/SelectionRenderer.js';
import { PreviewRenderer } from '../renderer/PreviewRenderer.js';

// Wires the rendering pipeline up to a container element, the domain
// EventBus, and the editor EventBus, then starts it. Also wires up
// PickingService, SelectionRenderer, and (as of 0.1.13) PreviewRenderer —
// all against the same camera/canvas/MeshRegistry the renderer already
// built. The caller gets pick(screenX, screenY) and
// pickGround(screenX, screenY) on the returned handle and never needs to
// know Renderer, WorldRenderer, or Three.js exist.
export class RenderWorldUseCase {
    execute(container, eventBus, registry, editorEventBus) {
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

        return {
            pick: (screenX, screenY) => pickingService.pick(screenX, screenY),
            pickGround: (screenX, screenY) => pickingService.pickGroundPosition(screenX, screenY),
            dispose() {
                previewRenderer.unsubscribe();
                selectionRenderer.unsubscribe();
                worldRenderer.unsubscribe();
                renderer.dispose();
            }
        };
    }
}
