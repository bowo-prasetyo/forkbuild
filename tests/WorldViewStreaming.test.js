import { WorldViewStreamingSession } from '../world/WorldViewStreamingSession.js';
import { WorldLoadState } from '../world/WorldLoadState.js';
import { LoadedWorld } from '../world/LoadedWorld.js';
import { PublicationContentCache } from '../world/PublicationContentCache.js';
import { ResolvePublicationUseCase } from '../application/ResolvePublicationUseCase.js';
import { DiscoverWorldAreaUseCase } from '../application/DiscoverWorldAreaUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { Document } from '../core/Document.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Publication } from '../publisher/Publication.js';

// ---------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------
class MockSpatialDiscoveryProvider {
    constructor() { this.placements = []; }
    discover(center, radius) {
        return this.placements.filter(p => {
            const dx = p.position.x - center.x;
            const dy = p.position.y - center.y;
            const dz = p.position.z - center.z;
            return (dx*dx + dy*dy + dz*dz) <= radius * radius;
        });
    }
    findByPublicationId() { return []; }
}

class MockDiscoveryProvider {
    constructor() { this.publications = new Map(); }
    findById(id) { return this.publications.get(id); }
}

class MockContentResolver {
    constructor() { 
        this.snapshots = new Map(); 
        this.resolveCount = 0;
        this.failIds = new Set();
    }
    resolve(id) { 
        this.resolveCount++;
        if (this.failIds.has(id)) throw new Error('Mock resolve failed');
        return this.snapshots.get(id); 
    }
    verify() { return true; }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function createTestDocument(title = 'Test World') {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'tester' }) });
}

function buildStack(loadRadius = 500, unloadRadius = 700) {
    const spatialDiscovery = new MockSpatialDiscoveryProvider();
    const discovery = new MockDiscoveryProvider();
    const contentResolver = new MockContentResolver();
    const serializer = new DocumentSerializer();
    const cache = new PublicationContentCache();

    const discoverUseCase = new DiscoverWorldAreaUseCase(spatialDiscovery);
    const resolveUseCase = new ResolvePublicationUseCase(
        contentResolver, discovery, serializer, cache
    );

    const session = new WorldViewStreamingSession({
        discoverWorldAreaUseCase: discoverUseCase,
        resolvePublicationUseCase: resolveUseCase,
        loadRadius,
        unloadRadius
    });

    return {
        spatialDiscovery,
        discovery,
        contentResolver,
        serializer,
        cache,
        session
    };
}

function addPlacement(stack, id, pubId, x, y, z, rev = 1) {
    const pos = new Position(x, y, z);
    stack.spatialDiscovery.placements.push({
        placementId: id, publicationId: pubId, position: pos, revision: rev
    });
    
    if (!stack.discovery.publications.has(pubId)) {
        stack.discovery.publications.set(pubId, new Publication({
            id: pubId, documentId: `doc-${pubId}`, title: `Pub ${pubId}`, author: 'alice'
        }));
        const doc = createTestDocument(`Pub ${pubId}`);
        stack.contentResolver.snapshots.set(pubId, stack.serializer.serialize(doc));
    }
}

// ---------------------------------------------------------------------
// 1. Streaming session discovers nearby placements
// ---------------------------------------------------------------------
{
    const stack = buildStack();
    addPlacement(stack, 'p1', 'pubA', 100, 0, 0);
    
    stack.session.updateView(new Position(0, 0, 0));
    
    assert(stack.session.getRuntimeWorlds().length === 1, 'one runtime world');
    assert(stack.session.getLoadedWorlds().length === 1, 'nearby placement is loaded');
    console.log('✓ Streaming session discovers nearby placements');
}

// ---------------------------------------------------------------------
// 2. Distant placement remains metadata-only
// ---------------------------------------------------------------------
{
    const stack = buildStack(500, 700);
    addPlacement(stack, 'p1', 'pubA', 600, 0, 0); // Between load and unload
    
    stack.session.updateView(new Position(0, 0, 0));
    
    assert(stack.session.getRuntimeWorlds().length === 1, 'tracked in runtime');
    assert(stack.session.getDiscoveredWorlds().length === 1, 'state is DISCOVERED');
    assert(stack.session.getLoadedWorlds().length === 0, 'no session loaded');
    console.log('✓ Distant placement remains metadata-only');
}

// ---------------------------------------------------------------------
// 3. Moving camera loads newly entered placements
// ---------------------------------------------------------------------
{
    const stack = buildStack(500, 700);
    addPlacement(stack, 'p1', 'pubA', 600, 0, 0);
    
    stack.session.updateView(new Position(0, 0, 0));
    assert(stack.session.getLoadedWorlds().length === 0, 'initially unloaded');
    
    stack.session.updateView(new Position(200, 0, 0)); // Distance 400
    assert(stack.session.getLoadedWorlds().length === 1, 'loaded after moving closer');
    console.log('✓ Moving camera loads newly entered placements');
}

// ---------------------------------------------------------------------
// 4. Hysteresis: Moving camera unloads placements outside unload radius
// ---------------------------------------------------------------------
{
    const stack = buildStack(500, 700);
addPlacement(stack, 'p1', 'pubA', 0, 0, 0); // Changed from 400 to 0
    stack.session.updateView(new Position(0, 0, 0));
    assert(stack.session.getLoadedWorlds().length === 1, 'initially loaded');
    
    // Move to 600. Distance is 600. > 500 (load), but <= 700 (unload)
    stack.session.updateView(new Position(600, 0, 0));
    assert(stack.session.getDiscoveredWorlds().length === 1, 'dropped to DISCOVERED');
    assert(stack.session.getLoadedWorlds().length === 0, 'session dropped');
    assert(stack.session.getRuntimeWorlds().length === 1, 'still tracked');
    
    // Move to 800. Distance is 800. > 700 (unload)
    stack.session.updateView(new Position(800, 0, 0));
    assert(stack.session.getRuntimeWorlds().length === 0, 'completely removed from runtime');
    console.log('✓ Hysteresis: Moving camera unloads placements outside unload radius');
}

// ---------------------------------------------------------------------
// 5. Same placement is not loaded twice
// ---------------------------------------------------------------------
{
    const stack = buildStack();
    addPlacement(stack, 'p1', 'pubA', 100, 0, 0);
    
    stack.session.updateView(new Position(0, 0, 0));
    stack.session.updateView(new Position(10, 0, 0));
    
    assert(stack.contentResolver.resolveCount === 1, 'content resolved exactly once');
    console.log('✓ Same placement is not loaded twice');
}

// ---------------------------------------------------------------------
// 6. Newer PlacementRecord revision refreshes runtime placement
// ---------------------------------------------------------------------
{
    const stack = buildStack();
    addPlacement(stack, 'p1', 'pubA', 100, 0, 0, 1);
    
    stack.session.updateView(new Position(0, 0, 0));
    const loaded = stack.session.getWorld('p1');
    assert(loaded.placementRevision === 1, 'initial revision');
    
    // Simulate registry update
    stack.spatialDiscovery.placements[0].position = new Position(200, 0, 0);
    stack.spatialDiscovery.placements[0].revision = 2;
    
    stack.session.updateView(new Position(0, 0, 0));
    assert(loaded.placementRevision === 2, 'revision updated');
    assert(loaded.position.x === 200, 'position updated');
    console.log('✓ Newer PlacementRecord revision refreshes runtime placement');
}

// ---------------------------------------------------------------------
// 7. Older PlacementRecord revision is ignored
// ---------------------------------------------------------------------
{
    const stack = buildStack();
    addPlacement(stack, 'p1', 'pubA', 100, 0, 0, 5);
    
    stack.session.updateView(new Position(0, 0, 0));
    const loaded = stack.session.getWorld('p1');
    
    // Simulate stale registry data
    stack.spatialDiscovery.placements[0].position = new Position(999, 0, 0);
    stack.spatialDiscovery.placements[0].revision = 4; // Older
    
    stack.session.updateView(new Position(0, 0, 0));
    assert(loaded.placementRevision === 5, 'revision ignored');
    assert(loaded.position.x === 100, 'position ignored');
    console.log('✓ Older PlacementRecord revision is ignored');
}

// ---------------------------------------------------------------------
// 8. Multiple placements of same publication share content cache
// ---------------------------------------------------------------------
{
    const stack = buildStack();
    addPlacement(stack, 'p1', 'pubA', 100, 0, 0);
    addPlacement(stack, 'p2', 'pubA', 200, 0, 0);
    addPlacement(stack, 'p3', 'pubA', 300, 0, 0);
    
    stack.session.updateView(new Position(200, 0, 0)); // All within 500
    
    assert(stack.session.getLoadedWorlds().length === 3, 'three instances loaded');
    assert(stack.contentResolver.resolveCount === 1, 'content resolved EXACTLY once');
    assert(stack.cache.size === 1, 'cache holds one publication');
    console.log('✓ Multiple placements of same publication share content cache');
}

// ---------------------------------------------------------------------
// 9. One failed publication does not break other worlds
// ---------------------------------------------------------------------
{
    const stack = buildStack();
    addPlacement(stack, 'p1', 'pubGood', 100, 0, 0);
    addPlacement(stack, 'p2', 'pubBad', 200, 0, 0);
    
    stack.contentResolver.failIds.add('pubBad');
    
    stack.session.updateView(new Position(150, 0, 0));
    
    const good = stack.session.getWorld('p1');
    const bad = stack.session.getWorld('p2');
    
    assert(good.state === WorldLoadState.LOADED, 'good world loaded');
    assert(bad.state === WorldLoadState.FAILED, 'bad world failed');
    assert(bad.error.message === 'Mock resolve failed', 'error captured');
    assert(stack.session.getFailedWorlds().length === 1, 'failed list populated');
    console.log('✓ One failed publication does not break other worlds');
}

// ---------------------------------------------------------------------
// 10. Empty world produces empty runtime set
// ---------------------------------------------------------------------
{
    const stack = buildStack();
    stack.session.updateView(new Position(0, 0, 0));
    assert(stack.session.getRuntimeWorlds().length === 0, 'empty runtime');
    console.log('✓ Empty world produces empty runtime set');
}

// ---------------------------------------------------------------------
// 11. FLAGSHIP: discover -> load -> move -> load new -> unload old
// ---------------------------------------------------------------------
{
    const stack = buildStack(100, 250);
    
    // Setup three worlds along the X axis
    addPlacement(stack, 'pA', 'pubA', 0, 0, 0);
    addPlacement(stack, 'pB', 'pubB', 200, 0, 0);
    addPlacement(stack, 'pC', 'pubC', 400, 0, 0);
    
    // 1. Start at A
    stack.session.updateView(new Position(0, 0, 0));
    assert(stack.session.getLoadedWorlds().length === 1, 'A loaded');
    assert(stack.session.getWorld('pA').state === WorldLoadState.LOADED, 'A is LOADED');
    assert(stack.session.getWorld('pB').state === WorldLoadState.DISCOVERED, 'B is DISCOVERED (dist 200 > 100)');
    
    // 2. Move to B
    stack.session.updateView(new Position(200, 0, 0));
    assert(stack.session.getWorld('pA').state === WorldLoadState.DISCOVERED, 'A dropped to DISCOVERED (dist 200 > 100)');
    assert(stack.session.getWorld('pB').state === WorldLoadState.LOADED, 'B loaded');
    assert(stack.session.getWorld('pC').state === WorldLoadState.DISCOVERED, 'C is DISCOVERED (dist 200 > 100)');
    
    // 3. Move to C
    stack.session.updateView(new Position(400, 0, 0));
    // A is now dist 400 > 150 (unload radius) -> REMOVED
    assert(stack.session.getWorld('pA') === null, 'A completely unloaded');
    assert(stack.session.getWorld('pB').state === WorldLoadState.DISCOVERED, 'B dropped to DISCOVERED (dist 200 > 100)');
    assert(stack.session.getWorld('pC').state === WorldLoadState.LOADED, 'C loaded');
    
    // Verify cache efficiency: 3 unique publications, 3 resolves total
    assert(stack.contentResolver.resolveCount === 3, 'cache prevented redundant resolves during movement');
    
    console.log('✓ FLAGSHIP: discover -> load -> move -> load new -> unload old');
}

console.log('\nAll World View streaming tests passed.');
