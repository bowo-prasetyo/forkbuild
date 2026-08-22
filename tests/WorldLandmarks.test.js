// 0.3.7 — World Landmarks & Personal Waypoints — Flagship Test
//
// This test validates that landmarks work as persistent, collaborative World content
// while maintaining the architectural principles established in 0.2.96-0.3.6.

import { World } from '../core/World.js';
import { WorldLandmark } from '../core/WorldLandmark.js';
import { Position } from '../core/Position.js';
import { createId } from '../core/createId.js';
import { DomainEvent } from '../core/events/Event.js';
import { EventBus } from '../core/events/EventBus.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { CreateWorldLandmarkCommand } from '../application/commands/CreateWorldLandmarkCommand.js';
import { UpdateWorldLandmarkCommand } from '../application/commands/UpdateWorldLandmarkCommand.js';
import { DeleteWorldLandmarkCommand } from '../application/commands/DeleteWorldLandmarkCommand.js';

export function runWorldLandmarksTest() {
    const results = [];
    
    function assert(condition, message) {
        if (!condition) {
            throw new Error(`Assertion failed: ${message}`);
        }
    }

    // Phase A — Creation
    console.log('Phase A: Creating landmark...');
    const worldId = createId();
    const authorIdentityId = createId();
    const eventBus = new EventBus();
    const world = new World({ id: worldId, eventBus });
    
    const landmark = new WorldLandmark({
        id: createId(),
        worldId,
        authorIdentityId,
        title: 'Old Bridge',
        description: 'Nice view of the river',
        position: new Position(100, 50, 200)
    });
    
    world.addLandmark(landmark);
    assert(world.getLandmarks().length === 1, 'Should have one landmark');
    assert(world.getLandmark(landmark.id).title === 'Old Bridge', 'Landmark title should match');
    results.push('✓ Phase A: Landmark created successfully');

    // Phase B — Propagation via Commands
    console.log('Phase B: Testing command propagation...');
    const registry = new CreateCommandRegistryUseCase().execute();
    const history = new CommandHistory(registry);
    
    const createCmd = new CreateWorldLandmarkCommand({
        worldId,
        authorIdentityId,
        title: 'Great View',
        description: 'Look toward the mountains',
        position: new Position(150, 0, 250)
    });
    
    history.execute(createCmd, { world });
    assert(world.getLandmarks().length === 2, 'Should have two landmarks after command');
    const secondLandmark = world.getLandmarks().find(l => l.title === 'Great View');
    assert(secondLandmark !== null, 'Second landmark should exist');
    results.push('✓ Phase B: Command propagation works');

    // Phase C — Navigation (landmarks appear in World locations)
    console.log('Phase C: Testing landmark navigation...');
    const landmarks = world.getLandmarks();
    assert(landmarks.length === 2, 'Should retrieve all landmarks');
    assert(landmarks[0].position.x === 100, 'First landmark X position correct');
    assert(landmarks[1].position.z === 250, 'Second landmark Z position correct');
    results.push('✓ Phase C: Landmark navigation data available');

    // Phase D — Collaboration (update)
    console.log('Phase D: Testing collaborative update...');
    const updateCmd = new UpdateWorldLandmarkCommand({
        worldId,
        authorIdentityId,
        landmarkId: landmark.id,
        title: 'Old Bridge Updated',
        description: 'Beautiful riverside viewpoint'
    });
    
    history.execute(updateCmd, { world });
    const updatedLandmark = world.getLandmark(landmark.id);
    assert(updatedLandmark.title === 'Old Bridge Updated', 'Landmark title should be updated');
    assert(updatedLandmark.description === 'Beautiful riverside viewpoint', 'Description should be updated');
    results.push('✓ Phase D: Collaborative update works');

    // Phase E — Activity (events published)
    console.log('Phase E: Testing event publication...');
    let landmarkAddedEvent = null;
    let landmarkUpdatedEvent = null;
    
    eventBus.subscribe(DomainEvent.LANDMARK_ADDED, (payload) => {
        landmarkAddedEvent = payload;
    });
    eventBus.subscribe(DomainEvent.LANDMARK_UPDATED, (payload) => {
        landmarkUpdatedEvent = payload;
    });
    
    const testLandmark = new WorldLandmark({
        id: createId(),
        worldId,
        authorIdentityId,
        title: 'Test Landmark',
        position: new Position(0, 0, 0)
    });
    world.addLandmark(testLandmark);
    
    assert(landmarkAddedEvent !== null, 'LANDMARK_ADDED event should be published');
    assert(landmarkUpdatedEvent !== null, 'LANDMARK_UPDATED event should be published');
    results.push('✓ Phase E: Events published correctly');

    // Phase F — Spatial awareness (landmark positions are accessible)
    console.log('Phase F: Testing spatial awareness...');
    const allLandmarks = world.getLandmarks();
    const positions = allLandmarks.map(l => l.position);
    assert(positions.every(p => p instanceof Position), 'All positions should be Position instances');
    results.push('✓ Phase F: Spatial awareness data available');

    // Phase G — Authorization (tested at application layer, not here)
    console.log('Phase G: Authorization check (structural)...');
    assert(typeof world.updateLandmark === 'function', 'updateLandmark method exists');
    assert(typeof world.removeLandmark === 'function', 'removeLandmark method exists');
    results.push('✓ Phase G: Authorization methods available');

    // Phase H — Delete
    console.log('Phase H: Testing deletion...');
    const deleteCmd = new DeleteWorldLandmarkCommand({
        worldId,
        authorIdentityId,
        landmarkId: testLandmark.id
    });
    
    history.execute(deleteCmd, { world });
    assert(world.getLandmarks().length === 3, 'Should have 3 landmarks after deletion');
    assert(world.getLandmark(testLandmark.id) === null, 'Deleted landmark should not be found');
    results.push('✓ Phase H: Deletion works');

    // Phase I — Determinism (same operations = same result)
    console.log('Phase I: Testing determinism...');
    const worldA = new World({ id: worldId, eventBus: new EventBus() });
    const worldB = new World({ id: worldId, eventBus: new EventBus() });
    
    const sharedLandmark = new WorldLandmark({
        id: createId(),
        worldId,
        authorIdentityId,
        title: 'Shared Point',
        position: new Position(50, 25, 75)
    });
    
    worldA.addLandmark(sharedLandmark);
    worldB.addLandmark(new WorldLandmark({
        id: sharedLandmark.id,
        worldId,
        authorIdentityId,
        title: sharedLandmark.title,
        position: new Position(sharedLandmark.position.x, sharedLandmark.position.y, sharedLandmark.position.z)
    }));
    
    const jsonA = JSON.stringify(worldA.toJSON());
    const jsonB = JSON.stringify(worldB.toJSON());
    assert(jsonA === jsonB, 'World replicas should be byte-identical');
    results.push('✓ Phase I: Deterministic replication confirmed');

    // Phase J — Persistence boundary
    console.log('Phase J: Testing persistence boundary...');
    const beforeJSON = world.toJSON();
    const landmarkCount = beforeJSON.landmarks.length;
    assert(landmarkCount > 0, 'Landmarks are persisted in JSON');
    assert(typeof beforeJSON.landmarks[0].title === 'string', 'Landmark title is serialized');
    assert(typeof beforeJSON.landmarks[0].createdAt === 'string', 'Creation timestamp is serialized');
    
    const restoredWorld = World.fromJSON(beforeJSON, new EventBus());
    const afterJSON = restoredWorld.toJSON();
    assert(JSON.stringify(beforeJSON) === JSON.stringify(afterJSON), 'Round-trip serialization preserves all data');
    results.push('✓ Phase J: Persistence boundary validated');

    return {
        name: 'WorldLandmarks',
        passed: true,
        details: results
    };
}

export default runWorldLandmarksTest;
