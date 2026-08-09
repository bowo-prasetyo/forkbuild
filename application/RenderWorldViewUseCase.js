import { Renderer } from '../renderer/Renderer.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { PickingService } from '../renderer/PickingService.js';

export class RenderWorldViewUseCase {
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
            pickGround: (screenX, screenY) => pickingService.pickGroundPosition(screenX, screenY),
            getCameraState: () => renderer.cameraController.getState(),
            setCameraState: (state) => renderer.cameraController.setState(state),
            removeWorld: (world) => worldRenderer.removeWorld(world),
            dispose() {
                worldRenderer.unsubscribe();
                renderer.dispose();
            }
        };
    }
}
