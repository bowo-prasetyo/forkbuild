import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';

// TEMPORARY bootstrap use case. Builds a small hardcoded World so the
// rendering pipeline has something to display. Once storage/ (0.1.13) or
// a publisher exist, this gets replaced by a LoadWorldUseCase that reads a
// real World instead of constructing one by hand — callers on the outside
// (ui/) won't need to change at all when that happens.
//
// Note IDs are no longer hand-picked strings — World/Building/Brick all
// generate a real UUID by default now, so this demo data gets the same
// first-class identities real placed bricks will have.
//
// The demo brick is added to the building BEFORE the building is added to
// the world, so world.addBuilding() fires exactly one BuildingAdded event
// carrying a building that already has its brick inside. Whoever is
// subscribed (the renderer) renders it through the same incremental path
// used for every later change — there is no separate "initial render".
export class CreateDemoWorldUseCase {
    execute(eventBus) {
        const world = new World({ eventBus });

        const building = new Building({ creator: 'local' });
        building.addBrick(new Brick({
            definitionId: 'core:cube',
            position: new Position(0, 0.5, 0)
        }));

        world.addBuilding(building);
        return world;
    }
}
