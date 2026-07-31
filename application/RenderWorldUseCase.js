import { Renderer } from '../renderer/Renderer.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';

// Wires a World up to the rendering pipeline and starts displaying it inside
// a given container element. This is the seam between "UI wants to show a
// world" and the renderer/core internals: ui/ code only ever talks to this
// use case, never to Renderer or WorldRenderer directly. A future non-Vue
// client (desktop, CLI preview, etc.) could call this exact same class.
export class RenderWorldUseCase {
    execute(container, world) {
        const renderer = new Renderer(container);
        const worldRenderer = new WorldRenderer(renderer);

        worldRenderer.render(world);
        renderer.start();

        return {
            dispose() {
                renderer.dispose();
            }
        };
    }
}
