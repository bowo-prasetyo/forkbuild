import { Renderer } from '../renderer/Renderer.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';

// Wires the rendering pipeline up to a container element and an EventBus,
// then starts it. Notice this no longer takes a World: the renderer never
// needs a reference to "a world" object, only the events it publishes.
// That's the practical payoff of the event system — rendering and the
// domain model are now connected only by events, not by object references.
export class RenderWorldUseCase {
    execute(container, eventBus, registry) {
        const renderer = new Renderer(container);
        const worldRenderer = new WorldRenderer(renderer, registry);

        worldRenderer.subscribe(eventBus);
        renderer.start();

        return {
            dispose() {
                worldRenderer.unsubscribe();
                renderer.dispose();
            }
        };
    }
}
