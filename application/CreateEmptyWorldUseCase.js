import { World } from '../core/World.js';
import { Building } from '../core/Building.js';

// Builds a fresh, empty World — one Building, no bricks. Used for "New
// Document." Mirrors CreateDemoWorldUseCase's shape but adds nothing to
// place inside, and matches the "one building per world" V0.1
// simplification PlacementTool already assumes.
export class CreateEmptyWorldUseCase {
    execute(eventBus) {
        const world = new World({ eventBus });
        world.addBuilding(new Building({ creator: 'local' }));
        return world;
    }
}
