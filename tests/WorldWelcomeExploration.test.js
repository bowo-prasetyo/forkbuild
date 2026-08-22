import { World } from '../core/World.js';
import { WorldLandmark } from '../core/WorldLandmark.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { derivePlaceContexts } from '../core/WorldCurationContext.js';
import { 
    WorldWelcomeContext, 
    WorldExplorationSuggestion, 
    deriveWorldWelcomeContext 
} from '../core/WorldWelcomeContext.js';

// 0.3.9 — World Welcome & Guided Exploration.
//
// This flagship test suite proves that:
//   - WorldWelcomeContext is DERIVED from existing World state and presence
//   - No new persistence or storage is introduced
//   - Exploration suggestions are ephemeral presentation hints only
//   - focusLocation()/focusCollaborator() remain the navigation primitives
//   - World serialization is byte-identical before and after welcome context derivation
//   - Activity summaries reflect live spatial presence without mutation
//
// See docs/Principles.md: "Exploration Guides Attention, Never Ownership or Mutation (0.3.9)"
// and "A Welcome Context Describes the World; It Does Not Become Part of the World (0.3.9)".

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertDeepEqual(actual, expected, message) {
    const actualStr = JSON.stringify(actual);
    const expectedStr = JSON.stringify(expected);
    if (actualStr !== expectedStr) {
        throw new Error(`ASSERT FAILED (${message}): expected ${expectedStr}, got ${actualStr}`);
    }
}

// Helper to create a simple structure document
function createStructureDocument({ id, title, authorIdentityId, brickPosition = new Position(0, 0.5, 0) }) {
    const world = new World({ id });
    const building = new Building({ id: `building-${id}` });
    building.addBrick(new Brick({ id: `brick-${id}`, definitionId: 'core:cube', position: brickPosition }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'builder', authorIdentityId }) });
}

async function runTests() {

// ---------------------------------------------------------------------
// Section A — WorldExplorationSuggestion value object
// ---------------------------------------------------------------------
console.log('Section A — WorldExplorationSuggestion value object');

{
    // Test landmark suggestion
    const landmark = new WorldLandmark({
        id: 'lm-well',
        worldId: 'world-1',
        authorIdentityId: 'alice',
        title: 'Old Well',
        description: 'A historic water source',
        position: new Position(50, 0, 100)
    });
    
    const suggestion = new WorldExplorationSuggestion({
        location: { landmark },
        reason: 'Nearby landmark',
        kind: 'landmark'
    });
    
    assert(suggestion.kind === 'landmark', 'A1.1: suggestion kind is preserved');
    assert(suggestion.reason === 'Nearby landmark', 'A1.2: suggestion reason is preserved');
    assert(suggestion.label === 'Old Well', 'A1.3: label derives from landmark title');
    assert(suggestion.position.x === 50 && suggestion.position.z === 100, 'A1.4: position derives from landmark');
    
    const json = suggestion.toJSON();
    assert(json.kind === 'landmark', 'A1.5: toJSON includes kind');
    assert(json.label === 'Old Well', 'A1.6: toJSON includes computed label');
    assert(json.position.x === 50, 'A1.7: toJSON includes position');
}

{
    // Test collaborator suggestion
    const collab = {
        identityId: 'bob-id',
        label: 'Bob',
        activity: 'BUILDING',
        position: new Position(30, 0, 60)
    };
    
    const suggestion = new WorldExplorationSuggestion({
        location: { collaborator: collab },
        reason: 'Bob is building',
        kind: 'collaborator'
    });
    
    assert(suggestion.kind === 'collaborator', 'A2.1: kind is collaborator');
    assert(suggestion.label === 'Bob', 'A2.2: label derives from collaborator');
    assert(suggestion.position.x === 30, 'A2.3: position derives from collaborator');
}

{
    // Test validation
    let threwNoLocation = false;
    try { new WorldExplorationSuggestion({ reason: 'test' }); } catch (e) { threwNoLocation = true; }
    assert(threwNoLocation, 'A3.1: constructing without location throws');
    
    let threwNoReason = false;
    try { new WorldExplorationSuggestion({ location: {} }); } catch (e) { threwNoReason = true; }
    assert(threwNoReason, 'A3.2: constructing without reason throws');
    
    let threwInvalidKind = false;
    try { new WorldExplorationSuggestion({ location: {}, reason: 'test', kind: 'invalid' }); } catch (e) { threwInvalidKind = true; }
    assert(threwInvalidKind, 'A3.3: constructing with invalid kind throws');
}

// ---------------------------------------------------------------------
// Section B — WorldWelcomeContext value object
// ---------------------------------------------------------------------
console.log('Section B — WorldWelcomeContext value object');

{
    const world = new World({ id: 'world-1', metadata: { title: 'Riverside Village' } });
    
    const context = new WorldWelcomeContext({
        world,
        nearbyLandmarks: [
            { id: 'lm-1', title: 'Village Square', position: new Position(0, 0, 0), distance: 10 }
        ],
        nearbyStructures: [
            { id: 'sp-1', title: 'Market', position: new Position(20, 0, 10), distance: 25 },
            { id: 'sp-2', title: 'House', position: new Position(-15, 0, 30), distance: 35 }
        ],
        nearbyCollaborators: [
            { identityId: 'bob', label: 'Bob', activity: 'BUILDING', position: new Position(20, 0, 10), distance: 25 }
        ]
    });
    
    assert(context.worldId === 'world-1', 'B1.1: worldId is exposed');
    assert(context.worldTitle === 'Riverside Village', 'B1.2: worldTitle is derived');
    assert(context.landmarkCount === 1, 'B1.3: landmarkCount is correct');
    assert(context.structureCount === 2, 'B1.4: structureCount is correct');
    assert(context.collaboratorCount === 1, 'B1.5: collaboratorCount is correct');
    assert(context.hasContent === true, 'B1.6: hasContent is true when there is content');
    assert(context.suggestedDestinations.length === 0, 'B1.7: suggestions empty when not provided');
}

{
    // Test summary generation
    const world = new World({ id: 'w1', metadata: { title: 'Test World' } });
    
    const context = new WorldWelcomeContext({
        world,
        nearbyLandmarks: [{ id: 'l1', title: 'Landmark', position: new Position(0, 0, 0), distance: 5 }],
        nearbyStructures: [{ id: 's1', title: 'Structure', position: new Position(10, 0, 0), distance: 15 }],
        nearbyCollaborators: [
            { identityId: 'a', label: 'Alice', activity: 'WALKING', position: new Position(5, 0, 5), distance: 8 },
            { identityId: 'b', label: 'Bob', activity: 'BUILDING', position: new Position(10, 0, 10), distance: 12 }
        ]
    });
    
    const summary = context.summary;
    assert(summary.includes('Test World'), 'B2.1: summary includes world title');
    assert(summary.includes('1 landmark'), 'B2.2: summary includes landmark count');
    assert(summary.includes('1 structure'), 'B2.3: summary includes structure count');
    assert(summary.includes('2 people here now'), 'B2.4: summary includes plural collaborator count');
}

{
    // Test empty context
    const world = new World({ id: 'empty-world' });
    const context = new WorldWelcomeContext({ world });
    
    assert(context.hasContent === false, 'B3.1: hasContent is false when empty');
    assert(context.landmarkCount === 0, 'B3.2: landmarkCount is zero');
    assert(context.structureCount === 0, 'B3.3: structureCount is zero');
    assert(context.collaboratorCount === 0, 'B3.4: collaboratorCount is zero');
}

// ---------------------------------------------------------------------
// Section C — deriveWorldWelcomeContext function
// ---------------------------------------------------------------------
console.log('Section C — deriveWorldWelcomeContext function');

{
    // Create a world with landmarks and structures
    const world = new World({ id: 'village', metadata: { title: 'Riverside Village' } });
    
    const landmark = new WorldLandmark({
        id: 'lm-village',
        worldId: 'village',
        authorIdentityId: 'alice',
        title: 'Village',
        description: 'A collaborative settlement',
        position: new Position(0, 0, 0)
    });
    world.addWorldLandmark(landmark);
    
    const marketDoc = createStructureDocument({
        id: 'doc-market',
        title: 'Market',
        authorIdentityId: 'bob',
        brickPosition: new Position(0, 0.5, 0)
    });
    const marketPlacement = new StructurePlacement({
        id: 'sp-market',
        documentId: 'doc-market',
        worldId: 'village',
        authorDeviceId: 'bob-device',
        position: new Position(20, 0, 10)
    });
    world.addStructurePlacement(marketPlacement);
    
    const houseDoc = createStructureDocument({
        id: 'doc-house',
        title: 'House',
        authorIdentityId: 'charlie',
        brickPosition: new Position(0, 0.5, 0)
    });
    const housePlacement = new StructurePlacement({
        id: 'sp-house',
        documentId: 'doc-house',
        worldId: 'village',
        authorDeviceId: 'charlie-device',
        position: new Position(-15, 0, 30)
    });
    world.addStructurePlacement(housePlacement);
    
    const wellDoc = createStructureDocument({
        id: 'doc-well',
        title: 'Well',
        authorIdentityId: 'alice',
        brickPosition: new Position(0, 0.5, 0)
    });
    const wellPlacement = new StructurePlacement({
        id: 'sp-well',
        documentId: 'doc-well',
        worldId: 'village',
        authorDeviceId: 'alice-device',
        position: new Position(5, 0, -20)
    });
    world.addStructurePlacement(wellPlacement);
    
    // Derive place contexts
    const structureTitles = new Map([
        ['doc-market', 'Market'],
        ['doc-house', 'House'],
        ['doc-well', 'Well']
    ]);
    
    const placeContexts = derivePlaceContexts({
        landmarks: [landmark],
        structurePlacements: [marketPlacement, housePlacement, wellPlacement],
        structureTitles
    });
    
    assert(placeContexts.length > 0, 'C1.1: place contexts derived');
    
    // Derive welcome context at origin
    const welcomeContext = deriveWorldWelcomeContext({
        world,
        position: new Position(0, 1.5, 0),
        landmarks: [landmark],
        structurePlacements: [marketPlacement, housePlacement, wellPlacement],
        structureTitles,
        collaborators: [],
        placeContexts
    });
    
    assert(welcomeContext.worldId === 'village', 'C1.2: worldId is correct');
    assert(welcomeContext.worldTitle === 'Riverside Village', 'C1.3: worldTitle is correct');
    assert(welcomeContext.landmarkCount >= 1, 'C1.4: landmarks found');
    assert(welcomeContext.structureCount >= 1, 'C1.5: structures found');
    assert(welcomeContext.currentPlace !== null, 'C1.6: current place identified');
    assert(welcomeContext.suggestedDestinations.length > 0, 'C1.7: suggestions generated');
}

// ---------------------------------------------------------------------
// Section D — FLAGSHIP TEST: Alice enters, Bob connects, Bob builds
// ---------------------------------------------------------------------
console.log('Section D — FLAGSHIP: Full arrival and exploration scenario');

{
    // Phase A — World creation
    const world = new World({ id: 'flagship-world', metadata: { title: 'Flagship Village' } });
    
    const villageLandmark = new WorldLandmark({
        id: 'lm-village',
        worldId: 'flagship-world',
        authorIdentityId: 'alice',
        title: 'Village',
        description: 'Main settlement area',
        position: new Position(0, 0, 0)
    });
    world.addWorldLandmark(villageLandmark);
    
    const marketDoc = createStructureDocument({ id: 'doc-market', title: 'Market', authorIdentityId: 'bob' });
    const marketPlacement = new StructurePlacement({
        id: 'sp-market',
        documentId: 'doc-market',
        worldId: 'flagship-world',
        authorDeviceId: 'bob-device',
        position: new Position(25, 0, 15)
    });
    world.addStructurePlacement(marketPlacement);
    
    const houseDoc = createStructureDocument({ id: 'doc-house', title: 'House', authorIdentityId: 'alice' });
    const housePlacement = new StructurePlacement({
        id: 'sp-house',
        documentId: 'doc-house',
        worldId: 'flagship-world',
        authorDeviceId: 'alice-device',
        position: new Position(-20, 0, 25)
    });
    world.addStructurePlacement(housePlacement);
    
    const wellDoc = createStructureDocument({ id: 'doc-well', title: 'Well', authorIdentityId: 'alice' });
    const wellPlacement = new StructurePlacement({
        id: 'sp-well',
        documentId: 'doc-well',
        worldId: 'flagship-world',
        authorDeviceId: 'alice-device',
        position: new Position(10, 0, -25)
    });
    world.addStructurePlacement(wellPlacement);
    
    // Serialize world BEFORE any welcome context derivation
    const worldBefore = JSON.stringify(world.toJSON());
    
    // Phase B — Derived context (both replicas derive identically)
    const structureTitles = new Map([
        ['doc-market', 'Market'],
        ['doc-house', 'House'],
        ['doc-well', 'Well']
    ]);
    
    const placeContexts = derivePlaceContexts({
        landmarks: [villageLandmark],
        structurePlacements: [marketPlacement, housePlacement, wellPlacement],
        structureTitles
    });
    
    // Replica 1 derives welcome context
    const welcome1 = deriveWorldWelcomeContext({
        world,
        position: new Position(0, 1.5, 0),
        landmarks: [villageLandmark],
        structurePlacements: [marketPlacement, housePlacement, wellPlacement],
        structureTitles,
        collaborators: [],
        placeContexts
    });
    
    // Replica 2 derives welcome context (should be identical)
    const welcome2 = deriveWorldWelcomeContext({
        world,
        position: new Position(0, 1.5, 0),
        landmarks: [villageLandmark],
        structurePlacements: [marketPlacement, housePlacement, wellPlacement],
        structureTitles,
        collaborators: [],
        placeContexts
    });
    
    assertDeepEqual(welcome1.toJSON(), welcome2.toJSON(), 'D1.1: both replicas derive identical welcome context');
    
    // Phase C — Alice enters
    assert(welcome1.hasContent === true, 'D1.2: Alice sees content');
    assert(welcome1.landmarkCount >= 1, 'D1.3: Alice sees landmarks');
    assert(welcome1.structureCount >= 1, 'D1.4: Alice sees structures');
    assert(welcome1.currentPlace !== null, 'D1.5: Alice has current place context');
    
    // Phase D — Bob connects (appears in contextual information)
    const bobPresence = {
        identityId: 'bob',
        label: 'Bob',
        activity: 'WALKING',
        position: new Position(20, 1.5, 10)
    };
    
    const welcomeWithBob = deriveWorldWelcomeContext({
        world,
        position: new Position(0, 1.5, 0),
        landmarks: [villageLandmark],
        structurePlacements: [marketPlacement, housePlacement, wellPlacement],
        structureTitles,
        collaborators: [bobPresence],
        placeContexts
    });
    
    assert(welcomeWithBob.collaboratorCount === 1, 'D2.1: Bob appears in welcome context');
    assert(welcomeWithBob.nearbyCollaborators[0].label === 'Bob', 'D2.2: Bob\'s label is correct');
    
    // Phase E — Bob starts building (activity changes)
    const bobBuilding = {
        identityId: 'bob',
        label: 'Bob',
        activity: 'BUILDING',
        activityTarget: 'Market',
        position: new Position(25, 1.5, 15)
    };
    
    const welcomeBobBuilding = deriveWorldWelcomeContext({
        world,
        position: new Position(0, 1.5, 0),
        landmarks: [villageLandmark],
        structurePlacements: [marketPlacement, housePlacement, wellPlacement],
        structureTitles,
        collaborators: [bobBuilding],
        placeContexts
    });
    
    assert(welcomeBobBuilding.activitySummary.length > 0, 'D3.1: activity summary reflects Bob\'s action');
    assert(welcomeBobBuilding.activitySummary[0].includes('building'), 'D3.2: activity shows building');
    
    // Verify suggestion includes Bob's activity
    const bobSuggestion = welcomeBobBuilding.suggestedDestinations.find(s => s.kind === 'collaborator');
    assert(bobSuggestion !== undefined, 'D3.3: Bob appears in suggestions');
    assert(bobSuggestion.reason.includes('building'), 'D3.4: suggestion reason includes activity');
    
    // Phase F — Alice chooses a destination (focusLocation simulation)
    // Note: We don't actually call focusLocation here since that requires
    // a full WorldNavigationSession. Instead we verify the suggestion exists.
    const landmarkSuggestion = welcomeBobBuilding.suggestedDestinations.find(s => s.kind === 'landmark');
    assert(landmarkSuggestion !== undefined, 'D4.1: landmark suggestion available');
    assert(landmarkSuggestion.position !== null, 'D4.2: suggestion has target position');
    
    // Phase G — Alice follows Bob (focusCollaborator simulation)
    const collabSuggestion = welcomeBobBuilding.suggestedDestinations.find(s => s.kind === 'collaborator');
    assert(collabSuggestion !== undefined, 'D5.1: collaborator suggestion available');
    assert(collabSuggestion.position.x === 25 && collabSuggestion.position.z === 15, 'D5.2: follow target is Bob\'s position');
    
    // Phase H — Bob disconnects
    const welcomeBobGone = deriveWorldWelcomeContext({
        world,
        position: new Position(0, 1.5, 0),
        landmarks: [villageLandmark],
        structurePlacements: [marketPlacement, housePlacement, wellPlacement],
        structureTitles,
        collaborators: [],
        placeContexts
    });
    
    assert(welcomeBobGone.collaboratorCount === 0, 'D6.1: Bob disappears from context');
    assert(welcomeBobGone.activitySummary.length === 0, 'D6.2: activity summary clears');
    
    // Phase I — World serialization (byte-identical before and after)
    const worldAfter = JSON.stringify(world.toJSON());
    assert(worldBefore === worldAfter, 'D7.1: World is byte-identical after all welcome context operations');
    
    // Additional verification: no properties were added to World
    const worldObj = JSON.parse(worldAfter);
    assert(!worldObj.welcomeMessage, 'D7.2: No welcomeMessage added to World');
    assert(!worldObj.visitCount, 'D7.3: No visitCount added to World');
    assert(!worldObj.lastVisited, 'D7.4: No lastVisited added to World');
    assert(!worldObj.recommendedLocation, 'D7.5: No recommendedLocation added to World');
}

// ---------------------------------------------------------------------
// Section E — Exploration suggestions prioritize correctly
// ---------------------------------------------------------------------
console.log('Section E — Exploration suggestion prioritization

{
    const world = new World({ id: 'test-world' });

    const landmark = new WorldLandmark({
        id: 'lm-test',
        worldId: 'test-world',
        authorIdentityId: 'alice',
        title: 'Test Landmark',
        description: 'A test landmark',
        position: new Position(0, 0, 0)
    });

    const structure = {
        id: 'sp-test',
        documentId: 'doc-test',
        title: 'Test Structure',
        position: new Position(10, 0, 10)
    };

    // Bob is closer to origin so he'll appear first in sorted suggestions
    const activeCollab = {
        identityId: 'bob',
        label: 'Bob',
        activity: 'BUILDING',
        activityTarget: 'Structure',
        position: new Position(5, 1.5, 5)
    };

    const idleCollab = {
        identityId: 'charlie',
        label: 'Charlie',
        activity: 'WALKING',
        position: new Position(20, 1.5, 20)
    };

    const context = deriveWorldWelcomeContext({
        world,
        position: new Position(0, 1.5, 0),
        landmarks: [landmark],
        structurePlacements: [structure],
        structureTitles: new Map([['doc-test', 'Test Structure']]),
        collaborators: [activeCollab, idleCollab],
        placeContexts: []
    });

    // Active collaborator who is closer should appear first
    const firstSuggestion = context.suggestedDestinations[0];
    assert(firstSuggestion.kind === 'collaborator', 'E1.1: active collaborator is first suggestion');
    assert(firstSuggestion.reason.includes('building'), 'E1.2: reason describes activity');
    
    // Verify all suggestion kinds are present
    const kinds = context.suggestedDestinations.map(s => s.kind);
    assert(kinds.includes('collaborator'), 'E1.3: collaborator suggestions exist');
    assert(kinds.includes('landmark'), 'E1.4: landmark suggestions exist');
    assert(kinds.includes('structure'), 'E1.5: structure suggestions exist');
}

// ---------------------------------------------------------------------
// Section F — "What's happening?" activity summary
// ---------------------------------------------------------------------
console.log('Section F — Activity summary ("What\'s happening?")');

{
    const world = new World({ id: 'activity-world' });

    const collaborators = [
        { identityId: 'bob', label: 'Bob', activity: 'BUILDING', activityTarget: 'Market', position: new Position(10, 0, 10) },
        { identityId: 'alice', label: 'Alice', activity: 'WALKING', position: new Position(5, 0, 5) },
        { identityId: 'charlie', label: 'Charlie', activity: 'INSPECTING', activityTarget: 'Bridge', position: new Position(20, 0, 20) }
    ];

    const context = deriveWorldWelcomeContext({
        world,
        position: new Position(0, 1.5, 0),
        landmarks: [],
        structurePlacements: [],
        structureTitles: new Map(),
        collaborators,
        placeContexts: []
    });

    assert(context.activitySummary.length === 3, 'F1.1: all three collaborators in summary');
    assert(context.activitySummary.some(s => s.includes('Bob') && s.includes('building')), 'F1.2: Bob building mentioned');
    assert(context.activitySummary.some(s => s.includes('Alice') && s.includes('exploring')), 'F1.3: Alice exploring mentioned');
    assert(context.activitySummary.some(s => s.includes('Charlie') && s.includes('inspecting')), 'F1.4: Charlie inspecting mentioned');
}

{
    // Test with no activity
    const world = new World({ id: 'quiet-world' });

    const context = deriveWorldWelcomeContext({
        world,
        collaborators: [],
        landmarks: [],
        structurePlacements: [],
        structureTitles: new Map(),
        placeContexts: []
    });

    assert(context.activitySummary.length === 0, 'F2.1: empty summary when no collaborators');
}

// ---------------------------------------------------------------------
// Section G — Edge cases and boundary conditions
// ---------------------------------------------------------------------
console.log('Section G — Edge cases and boundary conditions');

{
    // Test with world outside radius
    const world = new World({ id: 'far-world' });

    const farLandmark = new WorldLandmark({
        id: 'lm-far',
        worldId: 'far-world',
        authorIdentityId: 'alice',
        title: 'Far Landmark',
        description: 'Very far away',
        position: new Position(500, 0, 500) // Well outside WELCOME_CONTEXT_RADIUS (80)
    });

    const context = deriveWorldWelcomeContext({
        world,
        position: new Position(0, 1.5, 0),
        landmarks: [farLandmark],
        structurePlacements: [],
        structureTitles: new Map(),
        collaborators: [],
        placeContexts: []
    });

    assert(context.landmarkCount === 0, 'G1.1: far landmarks filtered out');
    assert(context.hasContent === false, 'G1.2: no content when everything is far');
}

{
    // Test with no position (show everything)
    const world = new World({ id: 'no-pos-world' });

    const landmark = new WorldLandmark({
        id: 'lm-test',
        worldId: 'no-pos-world',
        authorIdentityId: 'alice',
        title: 'Test',
        description: 'Test landmark',
        position: new Position(100, 0, 100)
    });

    const context = deriveWorldWelcomeContext({
        world,
        position: null, // No position filtering
        landmarks: [landmark],
        structurePlacements: [],
        structureTitles: new Map(),
        collaborators: [],
        placeContexts: []
    });

    assert(context.landmarkCount === 1, 'G2.1: all landmarks included without position');
}

{
    // Test validation
    let threwNoWorld = false;
    try { deriveWorldWelcomeContext({}); } catch (e) { threwNoWorld = true; }
    assert(threwNoWorld, 'G3.1: deriving without world throws');
}

console.log('\nAll 0.3.9 tests passed!');

}

await runTests();
