import { Renderer } from '../renderer/Renderer.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { PickingService } from '../renderer/PickingService.js';
import { SpatialSelectionRenderer } from '../renderer/SpatialSelectionRenderer.js';
import { SpatialPreviewRenderer } from '../renderer/SpatialPreviewRenderer.js';

export class RenderWorldViewUseCase {
    execute(container, registry, eventBus = null) {
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

        return {
            pick: (screenX, screenY) => pickingService.pickRich(screenX, screenY),
            pickGround: (screenX, screenY) => {
                const pos = pickingService.pickGroundPosition(screenX, screenY);
                return pos ? { type: 'ground', position: pos } : null;
            },
            getCameraState: () => renderer.cameraController.getState(),
            setCameraState: (state) => renderer.cameraController.setState(state),
            addWorld: (world, documentId, layoutPosition) => worldRenderer.addWorld(world, documentId, layoutPosition),
            removeWorld: (world, documentId) => worldRenderer.removeWorld(world, documentId),
            selectBrick: (brickId) => spatialSelectionRenderer.select(brickId),
            selectBricks: (brickIds, primaryBrickId = null) => spatialSelectionRenderer.selectMany(brickIds, primaryBrickId),
            clearSelection: () => spatialSelectionRenderer.clearSelection(),
            hoverBrick: (brickId) => spatialSelectionRenderer.hover(brickId),
            clearHover: () => spatialSelectionRenderer.clearHover(),
            showPreview: (definitionId, position, rotation) => spatialPreviewRenderer.show(definitionId, position, rotation),
            hidePreview: () => spatialPreviewRenderer.hide(),
            dispose() {
                spatialPreviewRenderer.dispose();
                spatialSelectionRenderer.clear();
                renderer.dispose();
            }
        };
    }
}
