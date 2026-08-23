import { World } from '../core/World.js';
import { WorldRegion } from '../core/WorldRegion.js';
import { RegionKind, isValidRegionKind } from '../core/RegionKind.js';
import { regionsContaining, describePlace, childRegions, nearestRegion } from '../core/WorldRegionGeography.js';
import { deriveSpatialContext } from '../core/WorldSpatialContext.js';
import { deriveWorldWelcomeContext } from '../core/WorldWelcomeContext.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { LoadDocumentUseCase } from '../application/LoadDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { WorldLocationDirectory } from '../application/WorldLocationDirectory.js';
import { WorldLocationKind } from '../core/WorldLocationKind.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { CreateWorldRegionCommand } from '../application/commands/CreateWorldRegionCommand.js';
import { UpdateWorldRegionCommand } from '../application/commands/UpdateWorldRegionCommand.js';
import { RemoveWorldRegionCommand } from '../application/commands/RemoveWorldRegionCommand.js';

// 0.5.0 — World Regions & Decentralized Place Naming.
//
// This flagship test suite proves that regions are:
//   - Persistent World content (a named AREA, not derived geometry)
//   - Properly serialized/deserialized with backward compatibility
//   - Accessible via Commands with full undo/redo support
//   - Propagated deterministically across replicas
//   - Geometrically derived containment/breadcrumbs, NEVER dependent on
//     parentRegionId — two unrelated, overlapping, non-hierarchical
//     regions still nest sensibly by radius alone
//   - Integrated into WorldLocationDirectory/WorldSpatialContext/
//     WorldWelcomeContext exactly like WorldLandmark was in 0.3.7
//
// See docs/Principles.md: "Users Name Places; The World Derives
// Geography From Names (0.5.0)."

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
    // Section A: core/WorldRegion.js
    // -------------------------------------------------------------
    {
        const region = new WorldRegion({
            id: 'rg-1',
            worldId: 'world-abc',
            authorIdentityId: 'identity-alice',
            name: 'Willow Village',
            description: 'A quiet farming settlement.',
            kind: RegionKind.VILLAGE,
            position: new Position(50, 0, 100),
            radius: 30
        });

        assert(region.id === 'rg-1', '1. region id is exposed');
        assert(region.worldId === 'world-abc', '2. worldId is exposed');
        assert(region.authorIdentityId === 'identity-alice', '3. authorIdentityId is exposed');
        assert(region.name === 'Willow Village', '4. name is exposed');
        assert(region.description === 'A quiet farming settlement.', '5. description is exposed');
        assert(region.kind === RegionKind.VILLAGE, '6. kind is exposed');
        assert(region.position.x === 50 && region.position.z === 100, '7. position is correct');
        assert(region.x === 50 && region.z === 100, '8. x/z convenience getters work');
        assert(region.radius === 30, '9. radius is exposed');
        assert(region.parentRegionId === null, '10. parentRegionId defaults to null');

        region.setName('Willow Hamlet');
        assert(region.name === 'Willow Hamlet', '11. setName updates the name');
        region.setDescription('Renamed settlement.');
        assert(region.description === 'Renamed settlement.', '12. setDescription updates the description');
        region.setKind(RegionKind.TOWN);
        assert(region.kind === RegionKind.TOWN, '13. setKind updates the kind');
        region.setRadius(45);
        assert(region.radius === 45, '14. setRadius updates the radius');

        assert(region.contains(new Position(60, 0, 100)) === true, '15. contains() true within radius');
        assert(region.contains(new Position(200, 0, 200)) === false, '16. contains() false outside radius');

        const json = region.toJSON();
        assert(json.id === 'rg-1' && json.worldId === 'world-abc', '17. toJSON includes id and worldId');
        assert(json.kind === RegionKind.TOWN, '18. toJSON includes updated kind');
        assert(json.radius === 45, '19. toJSON includes updated radius');

        const restored = WorldRegion.fromJSON(json);
        assert(restored.id === 'rg-1', '20. fromJSON restores id');
        assert(restored.name === 'Willow Hamlet', '21. fromJSON restores name');
        assert(restored.radius === 45, '22. fromJSON restores radius');

        let threwNoId = false;
        try { new WorldRegion({ worldId: 'w', authorIdentityId: 'a', name: 'n', position: new Position(0, 0, 0), radius: 10 }); } catch (e) { threwNoId = true; }
        assert(threwNoId, '23. constructing without id throws');

        let threwNoName = false;
        try { new WorldRegion({ id: 'x', worldId: 'w', authorIdentityId: 'a', position: new Position(0, 0, 0), radius: 10 }); } catch (e) { threwNoName = true; }
        assert(threwNoName, '24. constructing without name throws');

        let threwBadRadius = false;
        try { new WorldRegion({ id: 'x', worldId: 'w', authorIdentityId: 'a', name: 'n', position: new Position(0, 0, 0), radius: 0 }); } catch (e) { threwBadRadius = true; }
        assert(threwBadRadius, '25. constructing with a zero radius throws');

        let threwBadKind = false;
        try { new WorldRegion({ id: 'x', worldId: 'w', authorIdentityId: 'a', name: 'n', position: new Position(0, 0, 0), radius: 10, kind: 'not-a-kind' }); } catch (e) { threwBadKind = true; }
        assert(threwBadKind, '26. constructing with an invalid kind throws');

        let threwEmptyName = false;
        try { region.setName(''); } catch (e) { threwEmptyName = true; }
        assert(threwEmptyName, '27. setting empty name throws');

        let threwBadSetRadius = false;
        try { region.setRadius(-5); } catch (e) { threwBadSetRadius = true; }
        assert(threwBadSetRadius, '28. setRadius rejects a non-positive value');

        // Defaulted kind
        const defaultKindRegion = new WorldRegion({ id: 'x2', worldId: 'w', authorIdentityId: 'a', name: 'Somewhere', position: new Position(0, 0, 0), radius: 5 });
        assert(defaultKindRegion.kind === RegionKind.PLACE, '29. kind defaults to PLACE');
        assert(isValidRegionKind(RegionKind.CONTINENT), '30. RegionKind values are all valid');
        assert(!isValidRegionKind('nonsense'), '31. isValidRegionKind rejects unknown strings');
    }

    // -------------------------------------------------------------
    // Section B: core/WorldRegionGeography.js — geometric containment,
    // deliberately independent of parentRegionId (overlapping,
    // non-hierarchical regions still nest correctly by radius alone).
    // -------------------------------------------------------------
    {
        // Alice's nested hierarchy: Kingdom > Green Valley > Willow Village.
        const kingdom = new WorldRegion({ id: 'kingdom', worldId: 'w', authorIdentityId: 'alice', name: 'Kingdom of Eldoria', kind: RegionKind.COUNTRY, position: new Position(0, 0, 0), radius: 2000 });
        const valley = new WorldRegion({ id: 'valley', worldId: 'w', authorIdentityId: 'alice', name: 'Green Valley', kind: RegionKind.REGION, position: new Position(0, 0, 0), radius: 200 });
        const village = new WorldRegion({ id: 'village', worldId: 'w', authorIdentityId: 'alice', name: 'Willow Village', kind: RegionKind.VILLAGE, position: new Position(10, 0, 10), radius: 30 });
        // Bob's completely unrelated, overlapping region — no parentRegionId,
        // no relationship to Alice's regions, yet still nests correctly by
        // pure geometry.
        const bobSettlement = new WorldRegion({ id: 'bob-1', worldId: 'w', authorIdentityId: 'bob', name: 'Northern Settlement', kind: RegionKind.TOWN, position: new Position(15, 0, 15), radius: 60 });

        const allRegions = [kingdom, valley, village, bobSettlement];

        const insideVillage = regionsContaining(new Position(12, 0, 12), allRegions);
        assert(insideVillage.length === 4, '32. a position inside all four regions returns all four');
        assert(insideVillage[0].name === 'Willow Village', '33. innermost (smallest radius) region sorts first');
        assert(insideVillage[1].name === 'Northern Settlement', '34. second-smallest sorts next, regardless of authorship');
        assert(insideVillage[2].name === 'Green Valley', '35. third-smallest sorts next');
        assert(insideVillage[3].name === 'Kingdom of Eldoria', '36. broadest region sorts last');

        assert(describePlace(insideVillage) === 'Willow Village · Northern Settlement · Green Valley · Kingdom of Eldoria', '37. describePlace joins innermost-first with a middle dot');

        const outsideEverything = regionsContaining(new Position(9999, 0, 9999), allRegions);
        assert(outsideEverything.length === 0, '38. a position outside every region returns an empty array');
        assert(describePlace(outsideEverything) === '', '39. describePlace of an empty array is the empty string');

        const onlyInVillage = regionsContaining(new Position(10, 0, 10), [village]);
        assert(onlyInVillage.length === 1 && onlyInVillage[0].id === 'village', '40. a single-region check works in isolation');

        assert(nearestRegion(new Position(12, 0, 12), allRegions).name === 'Willow Village', '41. nearestRegion returns the single most specific region');
        assert(nearestRegion(new Position(9999, 0, 9999), allRegions) === null, '42. nearestRegion returns null when nothing contains the position');

        assert(regionsContaining(null, allRegions).length === 0, '43. regionsContaining gracefully handles a null position');

        // parentRegionId is purely informational — set it and prove it is
        // NEVER consulted by regionsContaining().
        const child = new WorldRegion({ id: 'child', worldId: 'w', authorIdentityId: 'alice', name: 'Market District', position: new Position(3000, 0, 3000), radius: 20, parentRegionId: 'valley' });
        const containingChildPos = regionsContaining(new Position(3000, 0, 3000), [...allRegions, child]);
        assert(containingChildPos.length === 1 && containingChildPos[0].id === 'child', '44. a distant child region contains only itself, despite naming a faraway parent (well outside every other region\'s own radius)');
        assert(childRegions('valley', [...allRegions, child]).length === 1 && childRegions('valley', [...allRegions, child])[0].id === 'child', '45. childRegions() is a purely informational grouping lookup');
        assert(childRegions('does-not-exist', allRegions).length === 0, '46. childRegions() for an unknown parent is gracefully empty');
    }

    // -------------------------------------------------------------
    // Section C: World.addWorldRegion / getWorldRegions / removeWorldRegion
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'test-world' });
        const region = new WorldRegion({
            id: 'rg-market',
            worldId: 'test-world',
            authorIdentityId: 'alice',
            name: 'Market District',
            description: 'Bustling market square',
            position: new Position(100, 0, 200),
            radius: 25
        });

        world.addWorldRegion(region);
        const regions = world.getWorldRegions();
        assert(regions.length === 1, '47. addWorldRegion adds to the collection');
        assert(world.getWorldRegion('rg-market') === region, '48. getWorldRegion retrieves by id');

        world.removeWorldRegion('rg-market');
        assert(world.getWorldRegions().length === 0, '49. removeWorldRegion removes from collection');
        assert(world.getWorldRegion('rg-market') === null, '50. getWorldRegion returns null after removal');

        world.removeWorldRegion('does-not-exist');
        assert(world.getWorldRegions().length === 0, '51. removing non-existent region is a no-op');
    }

    // -------------------------------------------------------------
    // Section D: World.updateWorldRegion
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'test-world' });
        const region = new WorldRegion({
            id: 'rg-update',
            worldId: 'test-world',
            authorIdentityId: 'bob',
            name: 'Initial Name',
            description: 'Initial description',
            kind: RegionKind.PLACE,
            position: new Position(10, 0, 20),
            radius: 15
        });
        world.addWorldRegion(region);

        world.updateWorldRegion('rg-update', { name: 'Updated Name' });
        assert(region.name === 'Updated Name', '52. updateWorldRegion updates name');
        assert(region.description === 'Initial description', '53. updateWorldRegion leaves description unchanged when not specified');

        world.updateWorldRegion('rg-update', { radius: 40 });
        assert(region.radius === 40, '54. updateWorldRegion updates radius');
        assert(region.position.x === 10, '55. updateWorldRegion never touches center');

        world.updateWorldRegion('rg-update', { kind: RegionKind.CITY, description: 'A growing city' });
        assert(region.kind === RegionKind.CITY && region.description === 'A growing city', '56. updateWorldRegion can update kind and description together');

        world.updateWorldRegion('does-not-exist', { name: 'Should not work' });
        assert(region.name === 'Updated Name', '57. updating non-existent region is a no-op');
    }

    // -------------------------------------------------------------
    // Section E: World serialization with regions
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'serial-world', metadata: { title: 'Test World' } });
        world.addWorldRegion(new WorldRegion({
            id: 'rg-1', worldId: 'serial-world', authorIdentityId: 'alice',
            name: 'Green Valley', kind: RegionKind.REGION, position: new Position(50, 0, 100), radius: 200
        }));
        world.addWorldRegion(new WorldRegion({
            id: 'rg-2', worldId: 'serial-world', authorIdentityId: 'bob',
            name: 'Willow Village', kind: RegionKind.VILLAGE, position: new Position(60, 0, 110), radius: 30, parentRegionId: 'rg-1'
        }));

        const json = world.toJSON();
        assert(json.regions && json.regions.length === 2, '58. toJSON includes regions array');
        assert(json.regions[0].id === 'rg-1' && json.regions[1].id === 'rg-2', '59. regions serialize with correct ids');
        assert(json.regions[1].parentRegionId === 'rg-1', '60. parentRegionId is serialized');

        const restored = World.fromJSON(json);
        assert(restored.getWorldRegions().length === 2, '61. fromJSON restores region count');
        const rg2 = restored.getWorldRegion('rg-2');
        assert(rg2.name === 'Willow Village' && rg2.radius === 30 && rg2.parentRegionId === 'rg-1', '62. fromJSON restores region properties');
    }

    // -------------------------------------------------------------
    // Section F: Backward compatibility (worlds without regions)
    // -------------------------------------------------------------
    {
        const oldJson = {
            id: 'old-world',
            metadata: { title: 'Old World' },
            buildings: [],
            groups: [],
            placements: [],
            landmarks: []
            // No regions field (pre-0.5.0 world)
        };

        const world = World.fromJSON(oldJson);
        assert(world.id === 'old-world', '63. fromJSON loads world without regions field');
        assert(world.getWorldRegions().length === 0, '64. pre-0.5.0 worlds have empty regions');
    }

    // -------------------------------------------------------------
    // Section G: CreateWorldRegionCommand
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'cmd-world' });
        const cmd = new CreateWorldRegionCommand({
            worldId: 'cmd-world',
            authorIdentityId: 'alice',
            name: 'Test Region',
            description: 'Created by command',
            kind: RegionKind.DISTRICT,
            position: new Position(25, 0, 75),
            radius: 40
        });

        assert(cmd.type === 'create-world-region', '65. command type is correct');
        assert(cmd.canUndo() === false, '66. cannot undo before execute');

        const result = cmd.execute({ world });
        assert(result.id, '67. execute returns the created region with an id');
        assert(cmd.canUndo() === true, '68. can undo after execute');
        assert(world.getWorldRegions().length === 1, '69. execute adds region to world');

        cmd.undo({ world });
        assert(world.getWorldRegions().length === 0, '70. undo removes region');
        assert(cmd.canUndo() === true, '71. canUndo still true after undo (command was executed)');

        cmd.execute({ world });
        const firstExecutedId = cmd.executedRegionId;
        const json = cmd.toJSON();
        const restoredCmd = CreateWorldRegionCommand.fromJSON(json);
        assert(restoredCmd.type === 'create-world-region', '72. fromJSON restores command type');
        assert(restoredCmd.name === 'Test Region', '73. fromJSON restores name');
        assert(restoredCmd.executedRegionId === firstExecutedId, '74. fromJSON restores executedRegionId (redo recreates the SAME identity)');

        restoredCmd.undo({ world });
        assert(world.getWorldRegions().length === 0, '75. restored command undo works');
    }

    // -------------------------------------------------------------
    // Section H: UpdateWorldRegionCommand
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'update-cmd-world' });
        const region = new WorldRegion({
            id: 'rg-update-cmd', worldId: 'update-cmd-world', authorIdentityId: 'bob',
            name: 'Original', description: 'Original desc', kind: RegionKind.PLACE,
            position: new Position(0, 0, 0), radius: 20
        });
        world.addWorldRegion(region);

        const cmd = new UpdateWorldRegionCommand({
            worldId: 'update-cmd-world',
            regionId: 'rg-update-cmd',
            name: 'Updated',
            description: 'Updated desc',
            kind: RegionKind.TOWN,
            radius: 55
        });

        cmd.execute({ world });
        assert(region.name === 'Updated', '76. UpdateWorldRegionCommand updates name');
        assert(region.description === 'Updated desc', '77. UpdateWorldRegionCommand updates description');
        assert(region.kind === RegionKind.TOWN, '78. UpdateWorldRegionCommand updates kind');
        assert(region.radius === 55, '79. UpdateWorldRegionCommand updates radius');

        cmd.undo({ world });
        assert(region.name === 'Original', '80. undo restores original name');
        assert(region.radius === 20, '81. undo restores original radius');
    }

    // -------------------------------------------------------------
    // Section I: RemoveWorldRegionCommand
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'remove-cmd-world' });
        const region = new WorldRegion({
            id: 'rg-remove-cmd', worldId: 'remove-cmd-world', authorIdentityId: 'charlie',
            name: 'To Remove', position: new Position(10, 0, 10), radius: 12
        });
        world.addWorldRegion(region);

        const cmd = new RemoveWorldRegionCommand({ worldId: 'remove-cmd-world', regionId: 'rg-remove-cmd' });

        cmd.execute({ world });
        assert(world.getWorldRegions().length === 0, '82. RemoveWorldRegionCommand removes region');

        cmd.undo({ world });
        assert(world.getWorldRegions().length === 1, '83. undo restores region');
        const restored = world.getWorldRegion('rg-remove-cmd');
        assert(restored.name === 'To Remove' && restored.radius === 12, '84. undo restores region with original properties');
    }

    // -------------------------------------------------------------
    // Section J: CommandRegistry integration
    // -------------------------------------------------------------
    {
        const registry = new CreateCommandRegistryUseCase().execute();

        const createJson = {
            type: 'create-world-region',
            worldId: 'reg-world',
            authorIdentityId: 'alice',
            name: 'Registry Test',
            position: { x: 5, y: 0, z: 10 },
            radius: 30,
            timestamp: new Date().toISOString()
        };
        const createCmd = registry.fromJSON(createJson);
        assert(createCmd instanceof CreateWorldRegionCommand, '85. registry deserializes create-world-region');

        const updateJson = {
            type: 'update-world-region',
            worldId: 'reg-world',
            regionId: 'rg-reg',
            name: 'Updated',
            timestamp: new Date().toISOString()
        };
        const updateCmd = registry.fromJSON(updateJson);
        assert(updateCmd instanceof UpdateWorldRegionCommand, '86. registry deserializes update-world-region');

        const removeJson = {
            type: 'remove-world-region',
            worldId: 'reg-world',
            regionId: 'rg-reg',
            timestamp: new Date().toISOString()
        };
        const removeCmd = registry.fromJSON(removeJson);
        assert(removeCmd instanceof RemoveWorldRegionCommand, '87. registry deserializes remove-world-region');
    }

    // -------------------------------------------------------------
    // Section K: WorldLocationDirectory + WorldNavigationSession#getRegions()
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const registry = new CreateBrickRegistryUseCase().execute();
        const loadDocumentUseCase = new LoadDocumentUseCase(storage, serializer);
        const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage, serializer);
        const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer);
        const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
        const discoveryProvider = new LocalDiscoveryProvider(storage);
        const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);

        const regionWorld = new World({ id: 'region-world' });
        regionWorld.addWorldRegion(new WorldRegion({
            id: 'rg-nav', worldId: 'region-world', authorIdentityId: 'alice',
            name: 'Scenic District', kind: RegionKind.DISTRICT,
            position: new Position(150, 0, 250), radius: 35
        }));

        const doc = new Document({
            world: regionWorld,
            metadata: new DocumentMetadata({ title: 'Region World' })
        });
        saveDocumentUseCase.execute(new DocumentManager(doc));

        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            discoveryProvider, loadDocumentUseCase
        });
        session._session = { addWorld() {}, removeWorld() {}, dispose() {} };
        session._loadWorld('region-world');

        const directory = new WorldLocationDirectory(session);
        const locations = directory.list();

        const regionLoc = locations.find(l => l.kind === WorldLocationKind.REGION);
        assert(regionLoc, '88. region location is present in directory');
        assert(regionLoc.id === 'rg-nav', '89. region location has correct id');
        assert(regionLoc.title === 'Scenic District', '90. region location has correct title (region name)');
        assert(regionLoc.position.x === 150 && regionLoc.position.z === 250, '91. region location has correct position (its own center)');
        assert(regionLoc.isRegion === true, '92. isRegion getter returns true');

        const found = directory.find('rg-nav');
        assert(found !== null && found.id === regionLoc.id, '93. find() locates region by id');

        // WorldNavigationSession#getRegions() — the region counterpart to
        // getWorldLocations(), used by the "Places" panel.
        const sessionRegions = session.getRegions();
        assert(sessionRegions.length === 1 && sessionRegions[0].id === 'rg-nav', '94. session.getRegions() lists regions across loaded documents');
        assert(sessionRegions[0].name === 'Scenic District', '95. session.getRegions() carries the region name');

        // getCurrentRegionPath()/getCurrentPlaceName() gracefully degrade
        // with no live avatar/camera position — never throw.
        const path = session.getCurrentRegionPath();
        assert(Array.isArray(path) && path.length === 0, '96. getCurrentRegionPath() is empty with no live position');
        const placeName = session.getCurrentPlaceName();
        assert(typeof placeName === 'string', '97. getCurrentPlaceName() gracefully returns a string with no live position');
    }

    // -------------------------------------------------------------
    // Section L: core/WorldSpatialContext.js — containingRegions/placeName
    // -------------------------------------------------------------
    {
        const valley = new WorldRegion({ id: 'valley', worldId: 'w', authorIdentityId: 'alice', name: 'Green Valley', position: new Position(0, 0, 0), radius: 200 });
        const village = new WorldRegion({ id: 'village', worldId: 'w', authorIdentityId: 'alice', name: 'Willow Village', position: new Position(0, 0, 0), radius: 30 });

        const context = deriveSpatialContext({
            position: new Position(5, 0, 5),
            seed: 42,
            regions: [valley, village]
        });

        assert(context.containingRegions.length === 2, '98. WorldSpatialContext derives containingRegions from regions');
        assert(context.containingRegions[0].name === 'Willow Village', '99. containingRegions is innermost-first');
        assert(context.placeName === 'Willow Village · Green Valley', '100. WorldSpatialContext.placeName is the human breadcrumb');

        const jsonCtx = context.toJSON();
        assert(jsonCtx.placeName === 'Willow Village · Green Valley', '101. toJSON includes placeName');
        assert(jsonCtx.containingRegions.length === 2, '102. toJSON includes containingRegions');

        const contextOutside = deriveSpatialContext({
            position: new Position(9999, 0, 9999),
            seed: 42,
            regions: [valley, village]
        });
        assert(contextOutside.containingRegions.length === 0, '103. a position outside every region has no containingRegions');
        assert(contextOutside.placeName === '', '104. placeName is empty outside every region');
        // `description` (the DERIVED terrain reading) is completely
        // unaffected by regions existing or not — the two stay separate.
        assert(typeof contextOutside.description === 'string', '105. description remains a plain derived string, untouched by regions');
    }

    // -------------------------------------------------------------
    // Section M: core/WorldWelcomeContext.js — optional, additive
    // -------------------------------------------------------------
    {
        const world = new World({ id: 'welcome-world' });
        const valley = new WorldRegion({ id: 'valley', worldId: 'welcome-world', authorIdentityId: 'alice', name: 'Green Valley', position: new Position(0, 0, 0), radius: 200 });

        // A caller that never passes `regions` (every pre-0.5.0 call
        // site) gets byte-identical behavior: an empty currentRegionPath
        // and an empty placeName.
        const legacyContext = deriveWorldWelcomeContext({ world, position: new Position(5, 0, 5) });
        assert(legacyContext.currentRegionPath.length === 0, '106. deriveWorldWelcomeContext without regions has an empty currentRegionPath');
        assert(legacyContext.placeName === '', '107. deriveWorldWelcomeContext without regions has an empty placeName');

        const withRegions = deriveWorldWelcomeContext({ world, position: new Position(5, 0, 5), regions: [valley] });
        assert(withRegions.currentRegionPath.length === 1 && withRegions.currentRegionPath[0].name === 'Green Valley', '108. deriveWorldWelcomeContext derives currentRegionPath when regions are passed');
        assert(withRegions.placeName === 'Green Valley', '109. deriveWorldWelcomeContext derives placeName when regions are passed');

        const jsonWelcome = withRegions.toJSON();
        assert(jsonWelcome.placeName === 'Green Valley', '110. WorldWelcomeContext.toJSON() includes placeName');
    }

    // -------------------------------------------------------------
    // Section N: Multi-replica determinism
    // -------------------------------------------------------------
    {
        const worldA = new World({ id: 'replica-world' });
        const worldB = new World({ id: 'replica-world' });

        const createCmd = new CreateWorldRegionCommand({
            worldId: 'replica-world',
            authorIdentityId: 'alice',
            name: 'Shared Region',
            kind: RegionKind.VILLAGE,
            position: new Position(100, 0, 200),
            radius: 40
        });

        createCmd.execute({ world: worldA });
        createCmd.execute({ world: worldB });

        assert(JSON.stringify(worldA.toJSON()) === JSON.stringify(worldB.toJSON()), '111. replicas produce identical JSON after the same create command');

        const regionId = worldA.getWorldRegions()[0].id;
        const updateCmd = new UpdateWorldRegionCommand({
            worldId: 'replica-world',
            regionId,
            name: 'Updated Shared',
            radius: 60
        });

        updateCmd.execute({ world: worldA });
        updateCmd.execute({ world: worldB });

        assert(JSON.stringify(worldA.toJSON()) === JSON.stringify(worldB.toJSON()), '112. replicas remain identical after an update command');
    }

    // -------------------------------------------------------------
    // Section O: World serialization round-trip through storage
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer);
        const loadDocumentUseCase = new LoadDocumentUseCase(storage, serializer);

        const world = new World({ id: 'persist-world' });
        world.addWorldRegion(new WorldRegion({
            id: 'rg-persist', worldId: 'persist-world', authorIdentityId: 'dave',
            name: 'Persistent Region', description: 'Should survive storage',
            kind: RegionKind.NEIGHBORHOOD, position: new Position(75, 0, 125), radius: 22
        }));

        const doc = new Document({ world, metadata: new DocumentMetadata({ title: 'Persist Test' }) });
        saveDocumentUseCase.execute(new DocumentManager(doc));

        const loadedDocument = loadDocumentUseCase.execute(new DocumentManager(), 'persist-world');
        const loadedRegion = loadedDocument.world.getWorldRegion('rg-persist');
        assert(loadedRegion, '113. region survives storage round-trip');
        assert(loadedRegion.name === 'Persistent Region', '114. region name preserved');
        assert(loadedRegion.kind === RegionKind.NEIGHBORHOOD, '115. region kind preserved');
        assert(loadedRegion.radius === 22, '116. region radius preserved');
        assert(loadedRegion.position.x === 75 && loadedRegion.position.z === 125, '117. region position preserved');
    }

    // -------------------------------------------------------------
    // Section P — CAPSTONE: Green Valley -> Willow Village -> Market
    // District, two independent replicas converge, overlapping
    // non-hierarchical regions, rename/remove, byte-identical
    // serialization throughout.
    // -------------------------------------------------------------
    {
        const alice = new World({ id: 'capstone-world' });
        const bob = new World({ id: 'capstone-world' });
        // Bob applies the exact same command instance independently —
        // the same simplification tests/WorldLandmarks.test.js's own
        // "Multi-replica determinism" section already uses in place of a
        // full peer-transport harness: a Command carries no world
        // reference of its own, so executing the SAME instance against
        // two different World objects is equivalent to each replica
        // receiving and applying an identical propagated command.
        const applyToBoth = (cmd) => {
            cmd.execute({ world: alice });
            cmd.execute({ world: bob });
            return cmd;
        };

        // Phase A: Alice creates "Green Valley".
        const createValley = applyToBoth(new CreateWorldRegionCommand({
            worldId: 'capstone-world', authorIdentityId: 'alice',
            name: 'Green Valley', kind: RegionKind.REGION,
            position: new Position(0, 0, 0), radius: 200
        }));
        const valleyId = createValley.executedRegionId;

        // Phase B: Alice creates "Willow Village" inside Green Valley
        // (parentRegionId is informational only — never required).
        const createVillage = applyToBoth(new CreateWorldRegionCommand({
            worldId: 'capstone-world', authorIdentityId: 'alice',
            name: 'Willow Village', kind: RegionKind.VILLAGE,
            position: new Position(10, 0, 10), radius: 30,
            parentRegionId: valleyId
        }));
        const villageId = createVillage.executedRegionId;

        // Phase C: Alice creates "Market District" inside Willow Village.
        const createMarket = applyToBoth(new CreateWorldRegionCommand({
            worldId: 'capstone-world', authorIdentityId: 'alice',
            name: 'Market District', kind: RegionKind.DISTRICT,
            position: new Position(12, 0, 12), radius: 8,
            parentRegionId: villageId
        }));

        // Phase D: two collaborators (both replicas) independently derive
        // the SAME hierarchy for a position deep inside the nesting.
        const observePath = (world) => describePlace(regionsContaining(new Position(12, 0, 12), world.getWorldRegions()));
        assert(observePath(alice) === 'Market District · Willow Village · Green Valley', '118. Alice observes the full nested breadcrumb');
        assert(observePath(bob) === observePath(alice), '119. Bob independently observes the IDENTICAL breadcrumb');

        // Phase E: camera moving through the World derives progressively
        // narrower place names, exactly the "Welcome to Green Valley" ->
        // "Willow Village" -> "Old Mill" narrative this milestone names.
        const atValleyEdge = describePlace(regionsContaining(new Position(150, 0, 0), alice.getWorldRegions()));
        assert(atValleyEdge === 'Green Valley', '120. a position only inside the valley names just the valley');

        // Phase F: overlapping, non-hierarchical regions — Bob names his
        // own "Northern Settlement" over the same ground, with no
        // relationship whatsoever to Alice's hierarchy.
        const createBobRegion = applyToBoth(new CreateWorldRegionCommand({
            worldId: 'capstone-world', authorIdentityId: 'bob',
            name: 'Northern Settlement', kind: RegionKind.TOWN,
            position: new Position(11, 0, 11), radius: 50
        }));
        const overlapPath = observePath(alice);
        assert(overlapPath === 'Market District · Willow Village · Northern Settlement · Green Valley', '121. an unrelated overlapping region slots in purely by radius');
        assert(observePath(bob) === overlapPath, '122. both replicas agree on the overlapping breadcrumb too');

        // Phase G: two collaborators concurrently create regions — both
        // eventually apply both commands (deterministic convergence
        // regardless of arrival order is CommandHistory's own contract,
        // already proven for every other World content type; this proves
        // regions add no exception).
        const jsonAfterConcurrent = JSON.stringify(alice.toJSON()) === JSON.stringify(bob.toJSON());
        assert(jsonAfterConcurrent, '123. replicas stay byte-identical after concurrent, independently-authored regions');

        // Phase H (disconnect/reconnect convergence): a THIRD replica that
        // only ever hydrates from Alice's serialized World reaches the
        // exact same state — the same guarantee World.fromJSON() already
        // gives every other content type.
        const rehydrated = World.fromJSON(alice.toJSON());
        assert(JSON.stringify(rehydrated.toJSON()) === JSON.stringify(alice.toJSON()), '124. a rehydrated replica is byte-identical after "reconnecting"');

        // Phase I: rename Willow Village, then remove Bob's settlement.
        const renameCmd = applyToBoth(new UpdateWorldRegionCommand({
            worldId: 'capstone-world', regionId: villageId, name: 'Willow Hamlet'
        }));
        assert(alice.getWorldRegion(villageId).name === 'Willow Hamlet', '125. rename applies on Alice\'s replica');
        assert(bob.getWorldRegion(villageId).name === 'Willow Hamlet', '126. rename applies identically on Bob\'s replica');

        const removeCmd = applyToBoth(new RemoveWorldRegionCommand({
            worldId: 'capstone-world', regionId: createBobRegion.executedRegionId
        }));
        assert(alice.getWorldRegions().length === 3, '127. removal leaves exactly the three Alice-authored regions');
        assert(observePath(alice) === 'Market District · Willow Hamlet · Green Valley', '128. breadcrumb reflects both the rename and the removal');

        // Phase J: final serialization equality across replicas, one more
        // time, after the full scripted scenario.
        assert(JSON.stringify(alice.toJSON()) === JSON.stringify(bob.toJSON()), '129. replicas remain byte-identical after the entire capstone scenario');

        // Undo, too, stays exact through the whole chain.
        removeCmd.undo({ world: alice });
        renameCmd.undo({ world: alice });
        assert(alice.getWorldRegion(villageId).name === 'Willow Village', '130. undoing the rename restores the original name');
        assert(alice.getWorldRegions().length === 4, '131. undoing the removal restores the fourth region');
    }

    console.log('✓ Section A: core/WorldRegion.js — value object, validation, mutation, contains()');
    console.log('✓ Section B: core/WorldRegionGeography.js — geometric containment, independent of parentRegionId');
    console.log('✓ Section C: World.addWorldRegion/getWorldRegions/removeWorldRegion');
    console.log('✓ Section D: World.updateWorldRegion');
    console.log('✓ Section E: World serialization with regions');
    console.log('✓ Section F: Backward compatibility (pre-0.5.0 worlds)');
    console.log('✓ Section G: CreateWorldRegionCommand — execute, undo, serialization');
    console.log('✓ Section H: UpdateWorldRegionCommand');
    console.log('✓ Section I: RemoveWorldRegionCommand');
    console.log('✓ Section J: CommandRegistry integration');
    console.log('✓ Section K: WorldLocationDirectory + WorldNavigationSession#getRegions()');
    console.log('✓ Section L: WorldSpatialContext — containingRegions/placeName');
    console.log('✓ Section M: WorldWelcomeContext — optional, additive region breadcrumb');
    console.log('✓ Section N: Multi-replica determinism');
    console.log('✓ Section O: Storage round-trip persistence');
    console.log('✓ Section P: CAPSTONE — nested naming, overlap, concurrent authorship, rename/remove, byte-identical convergence');

    console.log('\nAll World Regions tests passed.');
}

await run();
