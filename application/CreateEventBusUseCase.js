import { EventBus } from '../core/events/EventBus.js';

// One EventBus, shared between whoever publishes domain events (World) and
// whoever reacts to them (the renderer today; history/autosave/multiplayer/
// publisher later). application/ is the layer that constructs it and wires
// it to both sides — core/ and renderer/ never know about each other.
export class CreateEventBusUseCase {
    execute() {
        return new EventBus();
    }
}
