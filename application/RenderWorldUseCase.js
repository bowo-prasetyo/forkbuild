import { Renderer } from '../renderer/Renderer.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { PickingService } from '../renderer/PickingService.js';

// Wires the rendering pipeline up to a container element and an EventBus,
// then starts it. Also wires up PickingService against the same camera,
// canvas, and MeshRegistry the renderer already built — the caller gets a
// pick(screenX, screenY) function on the returned handle and never needs
// to know Renderer, WorldRenderer, or Three.js exist.
export class RenderWorldUseCase {
    execute(container, eventBus, registry) {
        const renderer = new Renderer(container);
        const worldRenderer = new WorldRenderer(renderer, registry);

        worldRenderer.subscribe(eventBus);
        renderer.start();

        const pickingService = new PickingService(
            renderer.camera,
            renderer.domElement,
            worldRenderer.meshRegistry
        );

        return {
            pick: (screenX, screenY) => pickingService.pick(screenX, screenY),
            dispose() {
                worldRenderer.unsubscribe();
                renderer.dispose();
            }
        };
    }
}
