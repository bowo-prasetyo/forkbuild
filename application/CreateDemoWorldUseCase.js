import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';

// TEMPORARY bootstrap use case. Builds a small hardcoded World so the
// rendering pipeline has something to display. Once storage/ (0.1.10) or
// a publisher exist, this gets replaced by a LoadWorldUseCase that reads a
// real World instead of constructing one by hand — callers on the outside
// (ui/) won't need to change at all when that happens.
export class CreateDemoWorldUseCase {
    execute() {
        const world = new World();

        const building = new Building({ id: 'demo-building', creator: 'local' });
        building.addBrick(new Brick({
            id: 'demo-brick-1',
            definitionId: 'core:cube',
            position: new Position(0, 0.5, 0)
        }));

        world.addBuilding(building);
        return world;
    }
}
