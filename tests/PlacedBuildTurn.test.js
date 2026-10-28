import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import { StructurePlacement } from '../core/building/StructurePlacement.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { StructureDocumentResolver } from '../application/editor/StructureDocumentResolver.js';
import { StructurePlacementValidator, placedWorldBounds } from '../application/editor/StructurePlacementValidator.js';
import { StructurePreviewUseCase } from '../application/editor/StructurePreviewUseCase.js';
import { StructurePlacementTool } from '../application/tools/StructurePlacementTool.js';
import { transformMethods } from '../application/editorSession/transformMethods.js';
import { StructurePlacementGestureService } from '../application/editor/StructurePlacementGestureService.js';
import { SelectionTool } from '../application/tools/SelectionTool.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { assert } from './support/Assert.js';

// A placed build (Place Structure) is checked by its turned box, as it is
// drawn: a long build turned a quarter runs along z, so a spot beside it
// is clear and a spot along it is blocked, whether it is the build being
// placed, one already in the world, or one being moved (the rest of
// finding P2-12 of docs/reviews/EditorPlacementUX-2026-10-27.md).

class MemoryStorage extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return [...this._data.keys()]; }
}

const registry = new CreateBrickRegistryUseCase().execute();
const storage = new MemoryStorage();
const serializer = new DocumentSerializer();
const resolver = new StructureDocumentResolver(storage, serializer);

// A build saved as its own document: one 4x1 brick along x, its middle at the origin.
function savedBuild(bricks) {
    const world = new World({});
    const building = new Building({});
    for (const brick of bricks) building.addBrick(brick);
    world.addBuilding(building);
    storage.save(world.id, serializer.serialize(new Document({ world, metadata: new DocumentMetadata({ title: 'Bench' }) })));
    return world;
}
const bench = savedBuild([new Brick({ definitionId: 'core:brick_1x4', position: new Position(0, 0.5, 0) })]);
const box = (bounds) => [bounds.min.x, bounds.max.x, bounds.min.z, bounds.max.z].join(',');

// 1. The turned box.
{
    assert(box(placedWorldBounds(bench, registry, 0)) === '-2,2,-0.5,0.5', '1. unturned, the bench runs 4 along x');
    assert(box(placedWorldBounds(bench, registry, 90)) === '-0.5,0.5,-2,2', '2. turned a quarter, it runs 4 along z');
    assert(box(placedWorldBounds(bench, registry, 270)) === '-0.5,0.5,-2,2' && box(placedWorldBounds(bench, registry, -90)) === '-0.5,0.5,-2,2',
        '3. so does three quarters, or a quarter back');
    assert(box(placedWorldBounds(bench, registry, 180)) === '-2,2,-0.5,0.5', '4. half a turn, along x again');
    const slanted = placedWorldBounds(bench, registry, 45);
    assert(slanted.max.x - slanted.min.x > 2.8 && slanted.max.z - slanted.min.z > 2.8, '5. at 45°, the box holds the whole slanted bench, never less');
    const turnedBrick = savedBuild([new Brick({ definitionId: 'core:brick_1x4', position: new Position(0, 0.5, 0), rotation: 90 })]);
    assert(box(placedWorldBounds(turnedBrick, registry, 0)) === '-0.5,0.5,-2,2', '6. a brick turned inside the build counts by its own turn');
    assert(box(placedWorldBounds(turnedBrick, registry, 90)) === '-2,2,-0.5,0.5', '7. and the two turns add up');
    const offCentre = savedBuild([new Brick({ definitionId: 'core:cube', position: new Position(3, 0.5, 0) })]);
    assert(box(placedWorldBounds(offCentre, registry, 90)) === '-0.5,0.5,2.5,3.5', '8. a build turns round its own origin, as it is drawn');
    console.log('✓ a placed build\'s box turns with it');
}

// 2. A build already in the world is checked by its turned box.
{
    const world = new World({});
    world.addStructurePlacement(new StructurePlacement({ documentId: bench.id, position: new Position(0, 0, 0), rotation: 90 }));
    const validator = new StructurePlacementValidator();
    const cube = placedWorldBounds(savedBuild([new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) })]), registry, 0);
    assert(validator.canPlace(world, registry, resolver, { localBounds: cube, position: new Position(1.5, 0, 0) }) === true,
        '9. beside the turned bench (where its unturned box used to reach) is clear');
    assert(validator.canPlace(world, registry, resolver, { localBounds: cube, position: new Position(0, 0, 1.5) }) === false,
        '10. along it is blocked');
    console.log('✓ a build already placed is checked by its turned box');
}

// 3. Place Structure checks the build in hand by its turn, and sits it flush
// against a turned build.
{
    const world = new World({});
    const building = new Building({});
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(2, 0.5, 0) }));
    world.addBuilding(building);
    const editorContext = new CreateEditorContextUseCase().execute();
    const tool = new StructurePlacementTool({
        world, registry, editorContext, commandHistory: new CommandHistory({ world }),
        structureResolver: resolver, structurePreviewUseCase: new StructurePreviewUseCase(editorContext)
    });
    editorContext.setActiveStructure(bench.id, 'Bench');
    tool.onPointerMove({ worldPosition: { x: 0, y: 0, z: 0 } });
    assert(editorContext.structurePreview.valid === false, '11. the bench along x over the cube is blocked');
    tool.onKeyDown({ key: 'r', modifiers: {} });
    assert(editorContext.structurePreview.rotation === 90 && editorContext.structurePreview.valid === true,
        '12. turned along z, it clears the cube, and says so');
    tool.onPointerDown();
    const placed = world.getStructurePlacements()[0];
    assert(placed && placed.rotation === 90, '13. and places, turned');

    // Pointing at the turned bench's +x face: the next one sits flush beside
    // it, half a unit out, not two units out as if it were unturned.
    tool.onPointerMove({ worldPosition: { x: 5, y: 0, z: 0 }, pickedPlacement: { placementId: placed.id, normal: { x: 1, y: 0, z: 0 } } });
    const flush = editorContext.structurePreview;
    assert(flush.position.x === 1 && flush.rotation === 90, `14. a second turned bench sits flush against the first (x = ${flush.position.x})`);
    assert(flush.valid === true, '15. and is clear there');
    console.log('✓ Place Structure checks and stacks by the turned box');
}

// 4. Moving a turned build is checked by its turned box.
{
    const world = new World({});
    const building = new Building({});
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(11.5, 0.5, 0) }));
    world.addBuilding(building);
    const placement = new StructurePlacement({ documentId: bench.id, position: new Position(0, 0, 0), rotation: 90 });
    world.addStructurePlacement(placement);
    const session = { _structureResolver: resolver, _registry: registry };
    const fits = (x) => transformMethods._structurePlacementFits.call(session, world, placement, new Position(x, 0, 0));
    assert(fits(10.5) === true, '16. moved to just beside the cube, the turned bench (half a unit wide) clears it');
    assert(fits(11) === false, '17. moved onto it, it is blocked');
    console.log('✓ moving a turned build is checked by its turned box');
}

// 5. Turning a build with the gizmo is checked at the turn it would have.
{
    const world = new World({});
    const building = new Building({});
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 1.5) }));
    world.addBuilding(building);
    const placement = new StructurePlacement({ documentId: bench.id, position: new Position(0, 0, 0), rotation: 0 });
    world.addStructurePlacement(placement);
    const gestures = new StructurePlacementGestureService({ getWorld: () => world, getCommandHistory: () => null, registry, structureResolver: resolver });
    assert(gestures._fits(world, placement, placement.position, 0) === true, '18. along x the bench clears the cube beside it');
    assert(gestures._fits(world, placement, placement.position, 90) === false, '19. turned a quarter it would run into the cube, so the turn is blocked');
    const gizmoBox = gestures._boundsForPlacement(new StructurePlacement({ documentId: bench.id, position: new Position(0, 0, 0), rotation: 90 }));
    assert(gizmoBox.size.z === 4 && gizmoBox.size.x === 1, '20. the gizmo frames a turned build by its turned box');
    console.log('✓ turning a build with the gizmo is checked at its new turn');
}

// 6. Turning a placed build from its panel, the touch bar, the keys or R is
// checked at its new turn too: blocked, it stays as it was and says so.
{
    const world = new World({});
    const building = new Building({});
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 1.5) }));
    world.addBuilding(building);
    const placement = new StructurePlacement({ documentId: bench.id, position: new Position(0, 0, 0), rotation: 0 });
    world.addStructurePlacement(placement);
    const commandHistory = new CommandHistory({ world });
    const editorContext = new CreateEditorContextUseCase().execute();
    const blocked = [];
    const noteBlocked = editorContext.notePlacementBlocked.bind(editorContext);
    editorContext.notePlacementBlocked = (kind) => { blocked.push(kind); noteBlocked(kind); };
    const session = {
        ...transformMethods,
        _documentManager: { document: { world } }, _commandHistory: commandHistory, _editorContext: editorContext,
        _structureResolver: resolver, _registry: registry
    };
    assert(session._rotateStructurePlacement(placement.id, 90) === false, '21. a quarter turn into the cube is refused');
    assert(placement.rotation === 0 && commandHistory.getCursor() === 0, '22. the build stays as it was, with nothing to undo');
    assert(blocked.join() === 'turn', '23. and the turn is said to be blocked');
    assert(session._rotateStructurePlacement(placement.id, 180) === true && placement.rotation === 180, '24. half a turn, still along x, clears the cube and turns');
    const numeric = { ...session, _editorContext: { ...editorContext, selection: { isStructurePlacementSelection: true, selectedPlacementId: placement.id }, notePlacementBlocked: editorContext.notePlacementBlocked } };
    const result = transformMethods.applyPlacementTransform.call(numeric, { rotation: 270 });
    assert(result.rotated === false && result.turnBlocked === true && placement.rotation === 180, '25. the panel\'s exact turn, blocked, says turnBlocked and leaves it');

    // R with the build selected in Select.
    const selected = { isStructurePlacementSelection: true, selectedPlacementId: placement.id, isEmpty: false };
    const tool = new SelectionTool({ world, registry, commandHistory, structureResolver: resolver,
        editorContext: { selection: selected, notePlacementBlocked: (kind) => blocked.push(kind) }, selectionUseCase: { clear() {} } });
    tool.onKeyDown({ key: 'r', modifiers: {} });
    assert(placement.rotation === 180 && blocked.at(-1) === 'turn', '26. R into the cube is refused too, and said');
    tool.onKeyDown({ key: 'r', modifiers: {} });
    assert(placement.rotation === 180, '27. as often as it is pressed');
    world.getBuildings()[0].removeBrick(world.getBuildings()[0].getBricks()[0].id);
    tool.onKeyDown({ key: 'r', modifiers: {} });
    assert(placement.rotation === 270, '28. with the cube gone, R turns it');
    console.log('✓ turning a placed build from its panel, the keys or R is checked at its new turn');
}

console.log('✅ All placed-build turn tests passed.');
