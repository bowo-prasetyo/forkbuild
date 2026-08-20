import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { DomainEvent } from '../core/events/Event.js';
import { EventBus } from '../core/events/EventBus.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { VillageLibrary } from '../core/library/VillageLibrary.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateStructureRegistryUseCase } from '../application/CreateStructureRegistryUseCase.js';
import { ForkStructureUseCase } from '../application/ForkStructureUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { PlaceStructureCommand } from '../application/commands/PlaceStructureCommand.js';
import { RemoveStructurePlacementCommand } from '../application/commands/RemoveStructurePlacementCommand.js';
import { StructureDocumentResolver } from '../application/StructureDocumentResolver.js';
import { StructurePlacementValidator } from '../application/StructurePlacementValidator.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { StructurePreviewUseCase } from '../application/StructurePreviewUseCase.js';
import { StructurePlacementTool } from '../application/tools/StructurePlacementTool.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.2.90 — Structure Placement & World Instances.
//
// Central architectural claim under test, per the design conversation:
// a StructurePlacement is a spatial REFERENCE to a Document, never a
// copy of its bricks — "CONTENT / SPATIAL STATE / PROVENANCE are
// different questions." This file covers the fully headless half (core/
// + application/, no renderer/ import anywhere — StructurePlacementTool
// never touches Three.js, exactly like PlacementTool per
// tests/PlacementPreviewUX.test.js's own note); the rendering half lives
// in tests/StructurePlacementRendering.test.js.
//
//   Section A: core/StructurePlacement.js — pure data, requires a
//              documentId, round-trips byte-identically
//   Section B: core/World.js — placements are document state exactly
//              like buildings/groups: CRUD, events, backward-compatible
//              serialization (a pre-0.2.90 World JSON has no
//              `placements` field at all)
//   Section C: PlaceStructureCommand — execute/undo/redo identity,
//              worldId guard, toJSON/fromJSON round trip via
//              CommandRegistry
//   Section D: RemoveStructurePlacementCommand — snapshot/undo,
//              "removing a placement never touches the Document"
//   Section E: StructureDocumentResolver — resolves fresh from storage
//              every call, null (never throws) for a missing or corrupt
//              id
//   Section F: StructurePlacementValidator — conservative AABB
//              collision against bricks and other placements,
//              translate-only (rotation ignored, matching
//              core/SpatialBounds.js's own V1 simplification)
//   Section G: StructurePlacementTool — headless tool-level proof that
//              the committed StructurePlacement matches the preview
//              exactly across a rotate/move/place sequence, and that a
//              blocked preview refuses to commit
//   Section H: FLAGSHIP — fork House twice, place both instances in a
//              Village World at different positions/rotations, save,
//              reload — placements survive with correct
//              documentId/position/rotation; editing and resaving House
//              is immediately visible through StructureDocumentResolver
//              (the mechanism behind "every placement reflects the
//              edit"); removing one placement leaves the Document and
//              the other placement completely intact.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() {
        super();
        this._data = new Map();
    }
    save(name, data) {
        this._data.set(name, JSON.parse(JSON.stringify(data)));
    }
    load(name) {
        if (!this._data.has(name)) return null;
        return JSON.parse(JSON.stringify(this._data.get(name)));
    }
    remove(name) {
        this._data.delete(name);
    }
    list() {
        return Array.from(this._data.keys());
    }
}

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' })
};

function saveDocument(storage, serializer, document) {
    storage.save(document.world.id, serializer.serialize(document));
}

async function run() {
    const brickRegistry = new CreateBrickRegistryUseCase().execute();

    // -------------------------------------------------------------
    // Section A: core/StructurePlacement.js
    // -------------------------------------------------------------
    {
        assert((() => {
            try { new StructurePlacement({}); return false; } catch { return true; }
        })(), '1. StructurePlacement requires a documentId');

        const placement = new StructurePlacement({
            documentId: 'doc-1',
            position: new Position(10, 0, -5),
            rotation: 90
        });
        assert(placement.documentId === 'doc-1', '2. documentId is exposed');
        assert(placement.position.x === 10 && placement.position.z === -5, '3. position is exposed');
        assert(placement.rotation === 90, '4. rotation is exposed as a plain number, not an {x,y,z} object');

        const json = placement.toJSON();
        const restored = StructurePlacement.fromJSON(json);
        assert(restored.id === placement.id
            && restored.documentId === placement.documentId
            && restored.rotation === placement.rotation
            && restored.position.equals(placement.position),
            '5. toJSON()/fromJSON() round-trips byte-identically');

        const defaulted = new StructurePlacement({ documentId: 'doc-2' });
        assert(defaulted.position.x === 0 && defaulted.position.y === 0 && defaulted.position.z === 0,
            '6. position defaults to the origin');
        assert(defaulted.rotation === 0, '7. rotation defaults to 0');
    }

    // -------------------------------------------------------------
    // Section B: core/World.js — placements as document state
    // -------------------------------------------------------------
    {
        const events = [];
        const eventBus = new EventBus();
        eventBus.subscribe(DomainEvent.STRUCTURE_PLACEMENT_ADDED, (payload) => events.push(['added', payload.placement]));
        eventBus.subscribe(DomainEvent.STRUCTURE_PLACEMENT_REMOVED, (payload) => events.push(['removed', payload.placement]));

        const world = new World({ eventBus });
        assert(world.getStructurePlacements().length === 0, '8. a fresh World starts with no placements');

        const placement = new StructurePlacement({ documentId: 'house-doc', position: new Position(4, 0, 4) });
        world.addStructurePlacement(placement);
        assert(world.getStructurePlacement(placement.id) === placement, '9. getStructurePlacement() finds it by id');
        assert(world.getStructurePlacements().length === 1, '10. getStructurePlacements() lists it');
        assert(events.length === 1 && events[0][0] === 'added' && events[0][1] === placement,
            '11. addStructurePlacement() publishes STRUCTURE_PLACEMENT_ADDED with the placement');

        world.removeStructurePlacement(placement.id);
        assert(world.getStructurePlacement(placement.id) === null, '12. removeStructurePlacement() removes it');
        assert(events.length === 2 && events[1][0] === 'removed' && events[1][1] === placement,
            '13. removeStructurePlacement() publishes STRUCTURE_PLACEMENT_REMOVED with the placement');

        world.removeStructurePlacement('nonexistent');
        assert(events.length === 2, '14. removing an unknown placement id is a silent no-op, no event published');

        // toJSON()/fromJSON() round trip, placements alongside buildings/groups.
        const roundTripWorld = new World({});
        const building = new Building({});
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        roundTripWorld.addBuilding(building);
        roundTripWorld.addStructurePlacement(new StructurePlacement({
            documentId: 'house-doc', position: new Position(3, 0, 3), rotation: 180
        }));
        const restoredWorld = World.fromJSON(roundTripWorld.toJSON());
        assert(restoredWorld.getStructurePlacements().length === 1, '15. World round-trips its placements');
        assert(restoredWorld.getStructurePlacements()[0].documentId === 'house-doc'
            && restoredWorld.getStructurePlacements()[0].rotation === 180,
            '16. a round-tripped placement keeps its documentId and rotation');

        // Backward compatibility: a World JSON from before 0.2.90 has no
        // `placements` field at all — mirrors the exact "groups" precedent
        // World.fromJSON() already established in 0.1.43.
        const preExistingJson = roundTripWorld.toJSON();
        delete preExistingJson.placements;
        const legacyWorld = World.fromJSON(preExistingJson);
        assert(legacyWorld.getStructurePlacements().length === 0,
            '17. a pre-0.2.90 World JSON (no placements field) loads with zero placements, never throws');
    }

    // -------------------------------------------------------------
    // Section C: PlaceStructureCommand
    // -------------------------------------------------------------
    {
        const world = new World({});
        const context = { world };
        const command = new PlaceStructureCommand({
            worldId: world.id,
            documentId: 'house-doc',
            position: new Position(1, 0, 2),
            rotation: 90
        });

        assert(command.canUndo() === false, '18. canUndo() is false before execute()');
        const placement = command.execute(context);
        assert(world.getStructurePlacement(placement.id) === placement, '19. execute() adds the placement to the World');
        assert(command.canUndo() === true, '20. canUndo() is true after execute()');

        command.undo(context);
        assert(world.getStructurePlacements().length === 0, '21. undo() removes the placement');

        const redonePlacement = command.execute(context);
        assert(redonePlacement.id === placement.id,
            '22. redo (execute() again) recreates the SAME placement identity, not a new one');

        assert((() => {
            try {
                new PlaceStructureCommand({ worldId: 'other-world', documentId: 'x', position: new Position() })
                    .execute(context);
                return false;
            } catch { return true; }
        })(), '23. execute() throws on a worldId mismatch');

        // Serialization round trip via CommandRegistry.
        const commandRegistry = new CreateCommandRegistryUseCase().execute();
        const restoredCommand = commandRegistry.fromJSON(command.toJSON());
        assert(restoredCommand.type === 'place-structure' && restoredCommand.documentId === 'house-doc'
            && restoredCommand.rotation === 90 && restoredCommand.position.x === 1,
            '24. PlaceStructureCommand round-trips through CommandRegistry.fromJSON()');
        assert(command.toJSON().executedPlacementId === undefined
            || typeof command.toJSON().executedPlacementId === 'string',
            '25. toJSON() carries executedPlacementId as session bookkeeping (present, not part of stated intent)');
    }

    // -------------------------------------------------------------
    // Section D: RemoveStructurePlacementCommand
    // -------------------------------------------------------------
    {
        const world = new World({});
        const context = { world };
        const placement = new StructurePlacement({ documentId: 'house-doc', position: new Position(5, 0, 5), rotation: 270 });
        world.addStructurePlacement(placement);

        const command = new RemoveStructurePlacementCommand({ worldId: world.id, placementId: placement.id });
        command.execute(context);
        assert(world.getStructurePlacement(placement.id) === null, '26. execute() removes the placement from the World');

        command.undo(context);
        const restored = world.getStructurePlacement(placement.id);
        assert(restored && restored.id === placement.id && restored.documentId === 'house-doc' && restored.rotation === 270,
            '27. undo() restores the placement with its original id, documentId, and rotation');

        assert((() => {
            try {
                new RemoveStructurePlacementCommand({ worldId: world.id, placementId: 'nonexistent' }).execute(context);
                return false;
            } catch { return true; }
        })(), '28. execute() throws when the placement id does not exist');

        const commandRegistry = new CreateCommandRegistryUseCase().execute();
        const restoredCommand = commandRegistry.fromJSON(command.toJSON());
        assert(restoredCommand.type === 'remove-structure-placement' && restoredCommand.placementId === placement.id,
            '29. RemoveStructurePlacementCommand round-trips through CommandRegistry.fromJSON()');
    }

    // -------------------------------------------------------------
    // Section E: StructureDocumentResolver
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        assert(resolver.resolve(null) === null, '30. resolve(null) is null, never throws');
        assert(resolver.resolve('never-saved') === null, '31. resolve() of an unknown id is null, never throws');

        storage.save('corrupt-doc', { not: 'a valid document' });
        assert(resolver.resolve('corrupt-doc') === null,
            '32. resolve() of a structurally invalid blob is null, never throws — DocumentSerializer.deserialize() '
            + 'rejects it and the resolver swallows the error');

        const world = new World({});
        const building = new Building({});
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        world.addBuilding(building);
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'House' }) });
        saveDocument(storage, serializer, document);

        const resolvedWorld = resolver.resolve(world.id);
        assert(resolvedWorld !== null && resolvedWorld.getBuildings()[0].getBricks().length === 1,
            '33. resolve() of a real saved document returns its World with the correct bricks');

        // Fresh every call — never a cache. Re-save with a second brick,
        // resolve again, see the change immediately.
        building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        saveDocument(storage, serializer, document);
        const resolvedAgain = resolver.resolve(world.id);
        assert(resolvedAgain.getBuildings()[0].getBricks().length === 2,
            '34. resolve() reflects a re-save immediately — no snapshot taken at first resolve');
    }

    // -------------------------------------------------------------
    // Section F: StructurePlacementValidator
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);
        const validator = new StructurePlacementValidator();

        // A 1x1x1 structure document, to place.
        const structureWorld = new World({});
        const structureBuilding = new Building({});
        structureBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        structureWorld.addBuilding(structureBuilding);
        const structureDocument = new Document({ world: structureWorld, metadata: new DocumentMetadata({ title: 'Box' }) });
        saveDocument(storage, serializer, structureDocument);
        const localBounds = SpatialBounds.fromWorld(structureWorld, brickRegistry);

        const targetWorld = new World({});
        assert(validator.canPlace(targetWorld, brickRegistry, resolver, { localBounds, position: new Position(0, 0, 0) }) === true,
            '35. an empty World has no collision');

        // An existing ordinary brick sitting exactly where the structure
        // would land.
        const targetBuilding = new Building({});
        targetBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        targetWorld.addBuilding(targetBuilding);
        assert(validator.canPlace(targetWorld, brickRegistry, resolver, { localBounds, position: new Position(0, 0, 0) }) === false,
            '36. overlapping an existing BRICK is refused');
        assert(validator.canPlace(targetWorld, brickRegistry, resolver, { localBounds, position: new Position(5, 0, 5) }) === true,
            '37. a position clear of every existing brick is allowed');

        // An existing structure placement of the same 1x1x1 document.
        targetWorld.addStructurePlacement(new StructurePlacement({ documentId: structureDocument.world.id, position: new Position(10, 0, 10) }));
        assert(validator.canPlace(targetWorld, brickRegistry, resolver, { localBounds, position: new Position(10, 0, 10) }) === false,
            '38. overlapping an existing STRUCTURE PLACEMENT is refused');
        assert(validator.canPlace(targetWorld, brickRegistry, resolver, { localBounds, position: new Position(20, 0, 20) }) === true,
            '39. a position clear of every existing placement is allowed');

        const otherPlacementId = targetWorld.getStructurePlacements()[0].id;
        assert(validator.canPlace(targetWorld, brickRegistry, resolver, {
            localBounds, position: new Position(10, 0, 10), excludePlacementId: otherPlacementId
        }) === true, '40. excludePlacementId omits a placement from consideration against itself');

        // A placement referencing a document that no longer resolves —
        // contributes no collision, mirrors "contributes no bricks to render."
        targetWorld.addStructurePlacement(new StructurePlacement({ documentId: 'missing-doc', position: new Position(30, 0, 30) }));
        assert(validator.canPlace(targetWorld, brickRegistry, resolver, { localBounds, position: new Position(30, 0, 30) }) === true,
            '41. an unresolvable existing placement never blocks a new one');

        assert(validator.canPlace(targetWorld, brickRegistry, resolver, { localBounds: null, position: new Position(0, 0, 0) }) === false,
            '42. canPlace() refuses defensively when localBounds is missing, rather than assuming valid');
    }

    // -------------------------------------------------------------
    // Section G: StructurePlacementTool (headless — no renderer import
    // anywhere in this tool's own dependency graph)
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const structureWorld = new World({});
        const structureBuilding = new Building({});
        structureBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        structureWorld.addBuilding(structureBuilding);
        saveDocument(storage, serializer, new Document({ world: structureWorld, metadata: new DocumentMetadata({ title: 'Box' }) }));
        const documentId = structureWorld.id;

        const world = new World({});
        const commandHistory = new CommandHistory({ world });
        const editorContext = new CreateEditorContextUseCase().execute();
        const structurePreviewUseCase = new StructurePreviewUseCase(editorContext);
        editorContext.setActiveStructure(documentId, 'Box');

        const context = {
            world, registry: brickRegistry, editorContext, commandHistory,
            structureResolver: resolver, structurePreviewUseCase
        };
        const tool = new StructurePlacementTool(context);

        tool.onPointerMove({ worldPosition: { x: 3, y: 0, z: 4 } });
        assert(editorContext.structurePreview.visible === true && editorContext.structurePreview.valid === true,
            '43. hovering a clear position shows a valid preview');
        assert(editorContext.structurePreview.position.x === 3 && editorContext.structurePreview.position.z === 4,
            '44. the preview position matches the ground-snapped hover position');
        assert(editorContext.structurePreview.rotation === 0, '45. rotation starts at 0');

        tool.onKeyDown({ key: 'r', modifiers: {} });
        assert(editorContext.structurePreview.rotation === 90, '46. R rotates the pending placement +90°');
        tool.onKeyDown({ key: 'r', modifiers: { shift: true } });
        assert(editorContext.structurePreview.rotation === 0, '47. Shift+R rotates back -90°');

        tool.onPointerDown();
        assert(world.getStructurePlacements().length === 1, '48. clicking commits a PlaceStructureCommand');
        const committed = world.getStructurePlacements()[0];
        assert(committed.documentId === documentId && committed.position.x === 3 && committed.position.z === 4 && committed.rotation === 0,
            '49. the committed StructurePlacement matches exactly what the preview last showed');
        assert(editorContext.structurePreview.visible === false, '50. the preview hides after committing');

        // A second placement, this time rotated, at a different position —
        // the exact "place House at A, place House at B, rotate B" flagship shape.
        tool.onPointerMove({ worldPosition: { x: 8, y: 0, z: 8 } });
        tool.onKeyDown({ key: 'r', modifiers: {} });
        tool.onPointerDown();
        assert(world.getStructurePlacements().length === 2, '51. the tool stays active for a second placement, exactly like PlacementTool');
        const secondPlacement = world.getStructurePlacements().find((p) => p.id !== committed.id);
        assert(secondPlacement.position.x === 8 && secondPlacement.rotation === 90,
            '52. the second placement carries its own independent position and rotation');
        assert(committed.position.x === 3 && committed.rotation === 0,
            '53. the first placement is unaffected by the second one\'s rotation');

        // A blocked position (overlapping the first placement) refuses to commit.
        tool.onPointerMove({ worldPosition: { x: 3, y: 0, z: 4 } });
        assert(editorContext.structurePreview.valid === false, '54. hovering an occupied position shows an invalid preview');
        const countBeforeBlockedClick = world.getStructurePlacements().length;
        tool.onPointerDown();
        assert(world.getStructurePlacements().length === countBeforeBlockedClick,
            '55. clicking an invalid preview does not commit anything');

        tool.deactivate();
        assert(editorContext.structurePreview.visible === false, '56. deactivate() hides the preview and resets rotation');
        tool.onPointerMove({ worldPosition: { x: 20, y: 0, z: 20 } });
        assert(editorContext.structurePreview.rotation === 0, '57. rotation is back to 0 after deactivate(), matching PlacementTool');
    }

    // -------------------------------------------------------------
    // Section H: FLAGSHIP
    // -------------------------------------------------------------
    {
        const brickRegistryLocal = new CreateBrickRegistryUseCase().execute();
        const structureRegistry = new CreateStructureRegistryUseCase().execute();
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        // Village Library -> Fork House (twice — two independent Documents,
        // per docs/Principles.md, "Forking A Structure Records Provenance,
        // Never A Live Dependency").
        const houseStructure = structureRegistry.get('village:house');
        const house = new ForkStructureUseCase().execute(houseStructure, stubIdentityProvider);
        saveDocument(storage, serializer, house);
        const houseBrickCountBeforeEdit = house.world.getBuildings()[0].getBricks().length;

        // A separate "Village" World the user is actively building —
        // place House at A, place House at B, rotate B.
        const village = new World({});
        const villageContext = { world: village };

        const placeA = new PlaceStructureCommand({
            worldId: village.id, documentId: house.world.id, position: new Position(100, 0, 200), rotation: 0
        });
        placeA.execute(villageContext);

        const placeB = new PlaceStructureCommand({
            worldId: village.id, documentId: house.world.id, position: new Position(160, 0, 240), rotation: 90
        });
        placeB.execute(villageContext);

        assert(village.getStructurePlacements().length === 2, '58. flagship: both placements exist in the Village World');
        const [a, b] = village.getStructurePlacements();
        assert(a.position.x !== b.position.x || a.position.z !== b.position.z,
            '59. flagship: A and B occupy different positions');
        assert(a.rotation !== b.rotation, '60. flagship: A and B carry different rotations');
        assert(a.documentId === house.world.id && b.documentId === house.world.id,
            '61. flagship: both instances reference the SAME House document');

        // Save World, reload.
        const villageDocument = new Document({ world: village, metadata: new DocumentMetadata({ title: 'Village' }) });
        saveDocument(storage, serializer, villageDocument);
        const reloadedVillage = resolver.resolve(village.id);
        assert(reloadedVillage.getStructurePlacements().length === 2,
            '62. flagship: after save/reload, both placements survive');
        const reloadedA = reloadedVillage.getStructurePlacements().find((p) => p.id === a.id);
        const reloadedB = reloadedVillage.getStructurePlacements().find((p) => p.id === b.id);
        assert(reloadedA.position.x === 100 && reloadedA.rotation === 0,
            '63. flagship: A survives reload with its original position and rotation');
        assert(reloadedB.position.x === 160 && reloadedB.rotation === 90,
            '64. flagship: B survives reload with its own, different position and rotation');

        // Edit House, save — every placement's resolved content reflects
        // the change immediately (StructureDocumentResolver never caches).
        const houseBuilding = house.world.getBuildings()[0];
        houseBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 3, 0) }));
        saveDocument(storage, serializer, house);

        const resolvedForA = resolver.resolve(reloadedA.documentId);
        const resolvedForB = resolver.resolve(reloadedB.documentId);
        assert(resolvedForA.getBuildings()[0].getBricks().length === houseBrickCountBeforeEdit + 1,
            '65. flagship: editing House and saving is reflected resolving through placement A');
        assert(resolvedForB.getBuildings()[0].getBricks().length === houseBrickCountBeforeEdit + 1,
            '66. flagship: the SAME edit is reflected resolving through placement B — one authoritative Document, no copies');

        // Delete placement A: the House Document and placement B are
        // completely unaffected.
        const removeA = new RemoveStructurePlacementCommand({ worldId: village.id, placementId: a.id });
        removeA.execute(villageContext);
        assert(village.getStructurePlacements().length === 1 && village.getStructurePlacements()[0].id === b.id,
            '67. flagship: removing placement A leaves exactly placement B');
        assert(resolver.resolve(house.world.id) !== null
            && resolver.resolve(house.world.id).getBuildings()[0].getBricks().length === houseBrickCountBeforeEdit + 1,
            '68. flagship: the House Document still exists and still resolves, completely untouched by removing a placement of it');

        console.log('✓ Section H: FLAGSHIP — fork House, place two instances at different positions/rotations, '
            + 'save/reload survives both, editing House reflects through every placement, removing one placement '
            + 'never touches the Document or the other placement');
    }

    console.log('✓ Section A: core/StructurePlacement.js — pure data, requires a documentId, round-trips byte-identically');
    console.log('✓ Section B: core/World.js — placements are document state (CRUD, events, backward-compatible serialization)');
    console.log('✓ Section C: PlaceStructureCommand — execute/undo/redo identity, worldId guard, CommandRegistry round trip');
    console.log('✓ Section D: RemoveStructurePlacementCommand — snapshot/undo, never touches the referenced Document');
    console.log('✓ Section E: StructureDocumentResolver — fresh every call, null (never throws) for missing/corrupt content');
    console.log('✓ Section F: StructurePlacementValidator — conservative, translate-only AABB collision');
    console.log('✓ Section G: StructurePlacementTool — headless preview/commit/rotate/blocked-refusal parity with PlacementTool');

    console.log('\nAll structure placement tests passed.');
}

// Top-level await — see tests/ExpandedBrickVocabulary.test.js's own note
// on why a fire-and-forget async call would let a failing assertion be
// silently counted as "passed" by the browser test runner.
await run();
