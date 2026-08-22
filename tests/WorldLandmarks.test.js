import { World } from '../core/World.js';
import { WorldLandmark } from '../core/WorldLandmark.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { WorldLocationDirectory, ORIGIN_LOCATION_ID } from '../application/WorldLocationDirectory.js';
import { WorldLocationKind } from '../core/WorldLocationKind.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { CreateWorldLandmarkCommand } from '../application/commands/CreateWorldLandmarkCommand.js';
import { UpdateWorldLandmarkCommand } from '../application/commands/UpdateWorldLandmarkCommand.js';
import { RemoveWorldLandmarkCommand } from '../application/commands/RemoveWorldLandmarkCommand.js';

// 0.3.7 — World Landmarks & Personal Waypoints.
//
// This flagship test suite proves that landmarks are:
//   - Persistent World content (not ephemeral spatial presence)
//   - Properly serialized/deserialized with backward compatibility
//   - Accessible via Commands with full undo/redo support
//   - Propagated deterministically across replicas
//   - Integrated into WorldLocationDirectory for navigation
//   - Distinguished from derived locations (STRUCTURE vs LANDMARK)
//
// See docs/Principles.md: "A Landmark Is World Content, Not Spatial Presence (0.3.7)"
// and "Derived Place Describes the World; Landmarks Deliberately Modify Its Meaning (0.3.7)".

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

async function run() {
    // -------------------------------------------------------------
    // Section A: core/WorldLandmark.js
    // -------------------------------------------------------------
    {
        const landmark = new WorldLandmark({
            id: 'lm-1',
            worldId: 'world-abc',
            authorIdentityId: 'identity-alice',
            title: 'Old Bridge',
            description: 'Nice place overlooking the river.',
            position: new Position(50, 0, 100)
        });

        assert(landmark.id === 'lm-1', '1. landmark id is exposed');
        assert(landmark.worldId === 'world-abc', '2. worldId is exposed');
        assert(landmark.authorIdentityId === 'identity-alice', '3. authorIdentityId is exposed');
        assert(landmark.title === 'Old Bridge', '4. title is exposed');
        assert(landmark.description === 'Nice place overlooking the river.', '5. description is exposed');
        assert(landmark.position.x === 50 && landmark.position.z === 100, '6. position is correct');
        assert(landmark.x === 50 && landmark.z === 100, '7. x/z convenience getters work');

        landmark.setTitle('Great View');
        assert(landmark.title === 'Great View', '8. setTitle updates the title');
        landmark.setDescription('Look toward the mountains.');
        assert(landmark.description === 'Look toward the mountains.', '9. setDescription updates the description');

        const json = landmark.toJSON();
        assert(json.id === 'lm-1' && json.worldId === 'world-abc', '10. toJSON includes id and worldId');
        assert(json.authorIdentityId === 'identity-alice', '11. toJSON includes authorIdentityId');
        assert(json.title === 'Great View', '12. toJSON includes updated title');
        assert(json.position.x === 50, '13. toJSON includes position');

        const restored = WorldLandmark.fromJSON(json);
        assert(restored.id === 'lm-1', '14. fromJSON restores id');
        assert(restored.title === 'Great View', '15. fromJSON restores title');
        assert(restored.description === 'Look toward the mountains.', '16. fromJSON restores description');

        let threwNoId = false;
        try { new WorldLandmark({ worldId: 'w', authorIdentityId: 'a', title: 't', position: new Position(0, 0, 0) }); } catch (e) { threwNoId = true; }
        assert(threwNoId, '17. constructing without id throws');

        let threwNoWorldId = false;
        try { new WorldLandmark({ id: 'x', authorIdentityId: 'a', title: 't', position: new Position(0, 0, 0) }); } catch (e) { threwNoWorldId = true; }
        assert(threwNoWorldId, '18. constructing without worldId throws');

        let threwNoAuthor = false;
        try { new WorldLandmark({ id: 'x', worldId: 'w', title: 't', position: new Position(0, 0, 0) }); } catch (e) { threwNoAuthor = true; }
        assert(threwNoAuthor, '19. constructing without authorIdentityId throws');

        let threwNoTitle = false;
        try { new WorldLandmark({ id: 'x', worldId: 'w', authorIdentityId: 'a', position: new Position(0, 0, 0) }); } catch (e) { threwNoTitle = true; }
        assert(threwNoTitle, '20. constructing without title throws');

        let threwEmptyTitle = false;
        try { landmark.setTitle(''); } catch (e) { threwEmptyTitle = true; }
        assert(threwEmptyTitle, '21. setting empty title throws');
    }

    // -------------------------------------------------------------
    // Section B: World.addWorldLandmark / getWorldLandmarks / removeWorldLandmark
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'test-world' });
        const landmark = new WorldLandmark({
            id: 'lm-bridge',
            worldId: 'test-world',
            authorIdentityId: 'alice',
            title: 'Old Bridge',
            description: 'A scenic spot',
            position: new Position(100, 0, 200)
        });

        world.addWorldLandmark(landmark);
        const landmarks = world.getWorldLandmarks();
        assert(landmarks.length === 1, '22. addWorldLandmark adds to the collection');
        assert(world.getWorldLandmark('lm-bridge') === landmark, '23. getWorldLandmark retrieves by id');

        world.removeWorldLandmark('lm-bridge');
        assert(world.getWorldLandmarks().length === 0, '24. removeWorldLandmark removes from collection');
        assert(world.getWorldLandmark('lm-bridge') === null, '25. getWorldLandmark returns null after removal');

        // Removing non-existent landmark is a no-op
        world.removeWorldLandmark('does-not-exist');
        assert(world.getWorldLandmarks().length === 0, '26. removing non-existent landmark is a no-op');
    }

    // -------------------------------------------------------------
    // Section C: World.updateWorldLandmark
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'test-world' });
        const landmark = new WorldLandmark({
            id: 'lm-update',
            worldId: 'test-world',
            authorIdentityId: 'bob',
            title: 'Initial Title',
            description: 'Initial description',
            position: new Position(10, 0, 20)
        });
        world.addWorldLandmark(landmark);

        world.updateWorldLandmark('lm-update', { title: 'Updated Title' });
        assert(landmark.title === 'Updated Title', '27. updateWorldLandmark updates title');
        assert(landmark.description === 'Initial description', '28. updateWorldLandmark leaves description unchanged when not specified');

        world.updateWorldLandmark('lm-update', { description: 'New description' });
        assert(landmark.description === 'New description', '29. updateWorldLandmark updates description');

        world.updateWorldLandmark('lm-update', { title: 'Final Title', description: 'Final description' });
        assert(landmark.title === 'Final Title' && landmark.description === 'Final description', '30. updateWorldLandmark can update both at once');

        // Updating non-existent landmark is a no-op
        world.updateWorldLandmark('does-not-exist', { title: 'Should not work' });
        assert(landmark.title === 'Final Title', '31. updating non-existent landmark is a no-op');
    }

    // -------------------------------------------------------------
    // Section D: World serialization with landmarks
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'serial-world', metadata: { title: 'Test World' } });
        world.addWorldLandmark(new WorldLandmark({
            id: 'lm-1',
            worldId: 'serial-world',
            authorIdentityId: 'alice',
            title: 'Bridge',
            description: 'River crossing',
            position: new Position(50, 0, 100)
        }));
        world.addWorldLandmark(new WorldLandmark({
            id: 'lm-2',
            worldId: 'serial-world',
            authorIdentityId: 'bob',
            title: 'Viewpoint',
            description: 'Mountain view',
            position: new Position(200, 0, 300)
        }));

        const json = world.toJSON();
        assert(json.landmarks && json.landmarks.length === 2, '32. toJSON includes landmarks array');
        assert(json.landmarks[0].id === 'lm-1' && json.landmarks[1].id === 'lm-2', '33. landmarks serialize with correct ids');

        const restored = World.fromJSON(json);
        assert(restored.getWorldLandmarks().length === 2, '34. fromJSON restores landmark count');
        const lm1 = restored.getWorldLandmark('lm-1');
        assert(lm1.title === 'Bridge' && lm1.position.x === 50, '35. fromJSON restores landmark properties');
    }

    // -------------------------------------------------------------
    // Section E: Backward compatibility (worlds without landmarks)
    // -------------------------------------------------------------
    {
        const oldJson = {
            id: 'old-world',
            metadata: { title: 'Old World' },
            buildings: [],
            groups: [],
            placements: []
            // No landmarks field (pre-0.3.7 world)
        };

        const world = World.fromJSON(oldJson);
        assert(world.id === 'old-world', '36. fromJSON loads world without landmarks field');
        assert(world.getWorldLandmarks().length === 0, '37. pre-0.3.7 worlds have empty landmarks');
    }

    // -------------------------------------------------------------
    // Section F: CreateWorldLandmarkCommand
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'cmd-world' });
        const cmd = new CreateWorldLandmarkCommand({
            worldId: 'cmd-world',
            authorIdentityId: 'alice',
            title: 'Test Landmark',
            description: 'Created by command',
            position: new Position(25, 0, 75)
        });

        assert(cmd.type === 'create-world-landmark', '38. command type is correct');
        assert(cmd.canUndo() === false, '39. cannot undo before execute');

        const result = cmd.execute({ world });
        assert(result.id, '40. execute returns the created landmark with an id');
        assert(cmd.canUndo() === true, '41. can undo after execute');
        assert(world.getWorldLandmarks().length === 1, '42. execute adds landmark to world');

        cmd.undo({ world });
        assert(world.getWorldLandmarks().length === 0, '43. undo removes landmark');
        assert(cmd.canUndo() === true, '44. canUndo still true after undo (command was executed)');

        cmd.execute({ world });
        const json = cmd.toJSON();
        const restoredCmd = CreateWorldLandmarkCommand.fromJSON(json);
        assert(restoredCmd.type === 'create-world-landmark', '45. fromJSON restores command type');
        assert(restoredCmd.title === 'Test Landmark', '46. fromJSON restores title');

        restoredCmd.undo({ world });
        assert(world.getWorldLandmarks().length === 0, '47. restored command undo works');
    }

    // -------------------------------------------------------------
    // Section G: UpdateWorldLandmarkCommand
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'update-cmd-world' });
        const landmark = new WorldLandmark({
            id: 'lm-update-cmd',
            worldId: 'update-cmd-world',
            authorIdentityId: 'bob',
            title: 'Original',
            description: 'Original desc',
            position: new Position(0, 0, 0)
        });
        world.addWorldLandmark(landmark);

        const cmd = new UpdateWorldLandmarkCommand({
            worldId: 'update-cmd-world',
            landmarkId: 'lm-update-cmd',
            title: 'Updated',
            description: 'Updated desc'
        });

        cmd.execute({ world });
        assert(landmark.title === 'Updated', '48. UpdateWorldLandmarkCommand updates title');
        assert(landmark.description === 'Updated desc', '49. UpdateWorldLandmarkCommand updates description');

        cmd.undo({ world });
        assert(landmark.title === 'Original', '50. undo restores original title');
        assert(landmark.description === 'Original desc', '51. undo restores original description');
    }

    // -------------------------------------------------------------
    // Section H: RemoveWorldLandmarkCommand
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'remove-cmd-world' });
        const landmark = new WorldLandmark({
            id: 'lm-remove-cmd',
            worldId: 'remove-cmd-world',
            authorIdentityId: 'charlie',
            title: 'To Remove',
            description: 'Will be removed',
            position: new Position(10, 0, 10)
        });
        world.addWorldLandmark(landmark);

        const cmd = new RemoveWorldLandmarkCommand({
            worldId: 'remove-cmd-world',
            landmarkId: 'lm-remove-cmd'
        });

        cmd.execute({ world });
        assert(world.getWorldLandmarks().length === 0, '52. RemoveWorldLandmarkCommand removes landmark');

        cmd.undo({ world });
        assert(world.getWorldLandmarks().length === 1, '53. undo restores landmark');
        const restored = world.getWorldLandmark('lm-remove-cmd');
        assert(restored.title === 'To Remove', '54. undo restores landmark with original properties');
    }

    // -------------------------------------------------------------
    // Section I: CommandRegistry integration
    // -------------------------------------------------------------
    {
        const registry = new CreateCommandRegistryUseCase().execute();

        const createJson = {
            type: 'create-world-landmark',
            worldId: 'reg-world',
            authorIdentityId: 'alice',
            title: 'Registry Test',
            position: { x: 5, y: 0, z: 10 },
            timestamp: new Date().toISOString()
        };
        const createCmd = registry.fromJSON(createJson);
        assert(createCmd instanceof CreateWorldLandmarkCommand, '55. registry deserializes create-world-landmark');

        const updateJson = {
            type: 'update-world-landmark',
            worldId: 'reg-world',
            landmarkId: 'lm-reg',
            title: 'Updated',
            timestamp: new Date().toISOString()
        };
        const updateCmd = registry.fromJSON(updateJson);
        assert(updateCmd instanceof UpdateWorldLandmarkCommand, '56. registry deserializes update-world-landmark');

        const removeJson = {
            type: 'remove-world-landmark',
            worldId: 'reg-world',
            landmarkId: 'lm-reg',
            timestamp: new Date().toISOString()
        };
        const removeCmd = registry.fromJSON(removeJson);
        assert(removeCmd instanceof RemoveWorldLandmarkCommand, '57. registry deserializes remove-world-landmark');
    }

    // -------------------------------------------------------------
    // Section J: WorldLocationDirectory integration
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const registry = new CreateBrickRegistryUseCase().execute();
        const loadDocumentUseCase = new LoadDocumentUseCase(storage, serializer);
        const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);

        // Create a world with a landmark
        const landmarkWorld = new World({ id: 'landmark-world' });
        landmarkWorld.addWorldLandmark(new WorldLandmark({
            id: 'lm-nav',
            worldId: 'landmark-world',
            authorIdentityId: 'alice',
            title: 'Scenic Overlook',
            description: 'Beautiful view',
            position: new Position(150, 0, 250)
        }));

        const doc = new Document({
            world: landmarkWorld,
            metadata: new DocumentMetadata({ title: 'Landmark World' })
        });
        saveDocumentUseCase.execute(new DocumentManager(doc));

        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase: null, worldLayoutProvider,
            discoveryProvider, loadDocumentUseCase
        });
        session._session = { addWorld() {}, removeWorld() {}, dispose() {} };
        session._loadWorld('landmark-world');

        const directory = new WorldLocationDirectory(session);
        const locations = directory.list();

        // Should have: Origin + Landmark (no structures in this world)
        assert(locations.length >= 2, '58. locations include origin and landmark');
        
        const landmarkLoc = locations.find(l => l.kind === WorldLocationKind.LANDMARK);
        assert(landmarkLoc, '59. landmark location is present in directory');
        assert(landmarkLoc.id === 'lm-nav', '60. landmark location has correct id');
        assert(landmarkLoc.title === 'Scenic Overlook', '61. landmark location has correct title');
        assert(landmarkLoc.position.x === 150 && landmarkLoc.position.z === 250, '62. landmark location has correct position');
        assert(landmarkLoc.isLandmark === true, '63. isLandmark getter returns true');

        const found = directory.find('lm-nav');
        assert(found === landmarkLoc, '64. find() locates landmark by id');
    }

    // -------------------------------------------------------------
    // Section K: Multi-replica determinism
    // -------------------------------------------------------------
    {
        const worldA = new World({ id: 'replica-world' });
        const worldB = new World({ id: 'replica-world' });

        // Apply same commands to both worlds
        const createCmd = new CreateWorldLandmarkCommand({
            worldId: 'replica-world',
            authorIdentityId: 'alice',
            title: 'Shared Landmark',
            position: new Position(100, 0, 200)
        });

        createCmd.execute({ world: worldA });
        createCmd.execute({ world: worldB });

        const jsonA = worldA.toJSON();
        const jsonB = worldB.toJSON();

        assert(JSON.stringify(jsonA) === JSON.stringify(jsonB), '65. replicas produce identical JSON after same commands');

        // Now apply an update
        const landmarkId = worldA.getWorldLandmarks()[0].id;
        const updateCmd = new UpdateWorldLandmarkCommand({
            worldId: 'replica-world',
            landmarkId: landmarkId,
            title: 'Updated Shared'
        });

        updateCmd.execute({ world: worldA });
        updateCmd.execute({ world: worldB });

        const jsonA2 = worldA.toJSON();
        const jsonB2 = worldB.toJSON();

        assert(JSON.stringify(jsonA2) === JSON.stringify(jsonB2), '66. replicas remain identical after update commands');
    }

    // -------------------------------------------------------------
    // Section L: World serialization round-trip through storage
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer);
        const loadDocumentUseCase = new LoadDocumentUseCase(storage, serializer);

        const world = new World({ id: 'persist-world' });
        world.addWorldLandmark(new WorldLandmark({
            id: 'lm-persist',
            worldId: 'persist-world',
            authorIdentityId: 'dave',
            title: 'Persistent Landmark',
            description: 'Should survive storage',
            position: new Position(75, 0, 125)
        }));

        const doc = new Document({
            world: world,
            metadata: new DocumentMetadata({ title: 'Persist Test' })
        });
        const manager = new DocumentManager(doc);
        saveDocumentUseCase.execute(manager);

        // Load fresh from storage
        const loadedManager = loadDocumentUseCase.execute('persist-world');
        const loadedWorld = loadedManager.document.world;

        const loadedLandmark = loadedWorld.getWorldLandmark('lm-persist');
        assert(loadedLandmark, '67. landmark survives storage round-trip');
        assert(loadedLandmark.title === 'Persistent Landmark', '68. landmark title preserved');
        assert(loadedLandmark.description === 'Should survive storage', '69. landmark description preserved');
        assert(loadedLandmark.position.x === 75 && loadedLandmark.position.z === 125, '70. landmark position preserved');
    }

    console.log('✓ Section A: core/WorldLandmark.js — value object, validation, mutation');
    console.log('✓ Section B: World.addWorldLandmark/getWorldLandmarks/removeWorldLandmark');
    console.log('✓ Section C: World.updateWorldLandmark');
    console.log('✓ Section D: World serialization with landmarks');
    console.log('✓ Section E: Backward compatibility (pre-0.3.7 worlds)');
    console.log('✓ Section F: CreateWorldLandmarkCommand — execute, undo, serialization');
    console.log('✓ Section G: UpdateWorldLandmarkCommand');
    console.log('✓ Section H: RemoveWorldLandmarkCommand');
    console.log('✓ Section I: CommandRegistry integration');
    console.log('✓ Section J: WorldLocationDirectory integration');
    console.log('✓ Section K: Multi-replica determinism');
    console.log('✓ Section L: Storage round-trip persistence');

    console.log('\nAll World Landmarks tests passed.');
}

await run();
