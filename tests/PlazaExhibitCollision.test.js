import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { PLAZA_CENTER } from '../core/ChallengePlaza.js';
import { DEFAULT_WORLD_SEED, terrainHeightAt } from '../core/TerrainHeightField.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { assert } from './support/Assert.js';

// The challenge plaza's exhibits (core/ChallengePlaza.js) are solid to walk
// into while they stand: the avatar's collision, its step-up and the
// residents' obstacles read them beside the loaded documents, at the ground
// height they are drawn at, and stop once they are hidden.

function exhibitWorld() {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    // A wall three cubes high along x, at local z = 0.
    for (let x = 0; x < 5; x += 1) {
        for (let y = 0; y < 3; y += 1) {
            building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(x, y + 0.5, 0) }));
        }
    }
    // A plate to step onto, in front of the wall.
    building.addBrick(new Brick({ definitionId: 'core:plate_2x4', position: new Position(10, 0.125, 0) }));
    world.addBuilding(building);
    return world;
}

function session() {
    return new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null
    });
}

const origin = { x: PLAZA_CENTER.x, y: 0, z: PLAZA_CENTER.z };
const ground = terrainHeightAt(DEFAULT_WORLD_SEED, origin.x, origin.z);
// Walking straight through the wall's middle, from in front of it to behind it.
const before = { x: origin.x + 2, y: ground, z: origin.z - 2 };
const through = { x: origin.x + 2, y: ground, z: origin.z + 1.2 };

// Shown, an exhibit blocks the avatar; hidden, it no longer does.
{
    const s = session();
    const walking = s._buildAvatarMovementConstraint();
    assert(walking.apply(before, through).collided === false, 'nothing stands there before the exhibit is shown');

    s.showPlazaExhibit('doc-wall', exhibitWorld(), origin);
    const blocked = walking.apply(before, through);
    assert(blocked.collided === true, 'the wall blocks the avatar once it is shown');
    assert(blocked.position.z < origin.z - 0.5, `the avatar stops in front of it (z ${blocked.position.z.toFixed(2)})`);

    s.hidePlazaExhibit('doc-wall');
    assert(walking.apply(before, through).collided === false, 'and stops blocking once it is hidden');
    console.log('✓ a standing exhibit blocks the avatar, and a hidden one no longer does');
}

// The exhibit stands at the ground height it is drawn at, so its low bricks
// are steps the avatar climbs and its tall ones are walls.
{
    const s = session();
    s.showPlazaExhibit('doc-wall', exhibitWorld(), origin);
    const steps = s._buildAvatarStepConstraint();
    // Standing on the wall, its top is the surface underfoot: three cubes
    // above the ground the exhibit is drawn on.
    const onWall = steps.supportHeightAt(origin.x + 2, origin.z, ground + 3);
    assert(Math.abs(onWall - (ground + 3)) < 0.01, `the wall's top is underfoot at the ground plus its height (${onWall.toFixed(2)} vs ${(ground + 3).toFixed(2)})`);
    const walking = s._buildAvatarMovementConstraint();
    const toPlate = walking.apply({ x: origin.x + 10, y: ground, z: origin.z - 3 }, { x: origin.x + 10, y: ground, z: origin.z }, { supportHeight: ground });
    assert(toPlate.collided === false, 'a low brick is stepped onto, not walked into');
    console.log('✓ an exhibit stands on the ground it is drawn on: low bricks are steps, tall ones walls');
}

// Residents are kept out of exhibits the same way, and exhibits never become
// documents or placements of the session.
{
    const s = session();
    s.showPlazaExhibit('doc-wall', exhibitWorld(), origin);
    const ids = Array.from(s._solidDocuments(), ([id]) => id);
    assert(ids.length === 1 && ids[0] !== 'doc-wall', 'the exhibit is a solid under an id of its own');
    assert(!s._loadedDocuments || s._loadedDocuments.size === 0, 'it is never a loaded document');
    assert(s.listKnownPlacements().length === 0, 'nor a placement');
    console.log('✓ exhibits are solid without becoming documents or placements');
}
