import { Renderer } from '../renderer/Renderer.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { PickingService } from '../renderer/PickingService.js';
import { SpatialSelectionRenderer } from '../renderer/SpatialSelectionRenderer.js';

export class RenderWorldViewUseCase {
    execute(container, registry) {
        const renderer = new Renderer(container);
        const worldRenderer = new WorldRenderer(renderer, registry);
        // NOTE: Not subscribed to EventBus — WorldNavigationSession drives
        // addWorld/removeWorld imperatively for multi-world spatial streaming.

        renderer.start();

        const pickingService = new PickingService(
            renderer.camera,
            renderer.domElement,
            worldRenderer.meshRegistry
        );

        const spatialSelectionRenderer = new SpatialSelectionRenderer(
            worldRenderer.meshRegistry
        );

        return {
            pick: (screenX, screenY) => pickingService.pickRich(screenX, screenY),
            pickGround: (screenX, screenY) => {
                const pos = pickingService.pickGroundPosition(screenX, screenY);
                return pos ? { type: 'ground', position: pos } : null;
            },
            getCameraState: () => renderer.cameraController.getState(),
            setCameraState: (state) => renderer.cameraController.setState(state),
            addWorld: (world, documentId) => worldRenderer.addWorld(world, documentId),
            removeWorld: (world) => worldRenderer.removeWorld(world),
            highlightBrick: (brickId) => spatialSelectionRenderer.highlight(brickId),
            clearHighlight: () => spatialSelectionRenderer.clear(),
            dispose() {
                spatialSelectionRenderer.clear();
                renderer.dispose();
            }
        };
    }
}
