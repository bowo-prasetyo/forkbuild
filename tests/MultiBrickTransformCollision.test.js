import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Group } from '../core/Group.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { SpatialEditingService } from '../application/SpatialEditingService.js';
import { SpatialSelectionState } from '../application/spatial-state/SpatialSelectionState.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { CopySelectionUseCase } from '../application/CopySelectionUseCase.js';
import { PasteClipboardUseCase } from '../application/PasteClipboardUseCase.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { EditorContext } from '../application/EditorContext.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { SelectionTransformValidator } from '../core/SelectionTransformValidator.js';

// 0.4.8 — Collision-Aware Multi-Brick Transform.
//
// 0.4.7's own "Deliberately excluded" section named exactly one gap left
// in the multi-brick transform kernel (application/SpatialEditingService.js,
// application/commands/TransformSelectionCommand.js — both already
// shipped in 0.1.42-0.1.50, both otherwise unchanged since): moving or
// rotating a selection had NO collision check at all, unlike single-brick
// placement (core/PlacementValidator.js) and structure placement
// (application/StructurePlacementValidator.js), both of which already
// refuse an overlapping commit. This milestone closes exactly that gap —
// nothing else. There is no new command, no new "group" concept
// (core/Group.js already covers persistent named groups, untouched
// here), and no ghost-mesh renderer: the gesture transaction already
// previews by mutating real bricks live (SpatialEditingService's own
// header), so "collision-aware preview" here means the SAME live preview
// now also computes and exposes validity every frame, and commit refuses
// to turn an invalid candidate into history — the exact posture
// application/StructurePlacementGestureService.js already established
// for structure placements ("releasing over an invalid position cancels
// the whole gesture, never a partial commit").
//
//   Section 1: core/SelectionTransformValidator.js — the pure collision
//              check, in isolation
//   Section 2: SpatialEditingService's gesture transaction — preview
//              feedback carries `valid`, commit is blocked on collision,
//              a blocked gesture leaves bricks exactly where it found
//              them
//   Section 3: keyboard move/rotate (which route through the same
//              commit) inherit the gate for free
//   Section 4: a persistent Group, resolved into a selection, is gated
//              identically — no separate code path to keep honest
//   Section 5 — CAPSTONE: duplicate (0.4.7) then transform (0.4.8) —
//              moving a fresh duplicate exactly back onto its own
//              source is blocked; moving it anywhere else commits as
//              usual; undo/redo both stay exact throughout

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function close(actual, expected, message) {
    assert(Math.abs(actual - expected) < 1e-9, `${message}: expected ${expected}, got ${actual}`);
}

function createWorldWithBricks(specs) {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    const ids = [];
    for (const spec of specs) {
        const brick = new Brick({
            id: spec.id,
            definitionId: spec.definitionId || 'core:cube',
            position: spec.position,
            rotation: spec.rotation || 0
        });
        building.addBrick(brick);
        ids.push(brick.id);
    }
    world.addBuilding(building);
    return { world, building, ids };
}

// ---------------------------------------------------------------------
// 1. SelectionTransformValidator — pure collision check, in isolation
// ---------------------------------------------------------------------

{
    const validator = new SelectionTransformValidator();
    const { world, building } = createWorldWithBricks([
        { id: 'a', position: new Position(0, 0.5, 0) },
        { id: 'b', position: new Position(2, 0.5, 0) }
    ]);

    assert(validator.canApply(world, []) === true, 'empty transform batch is trivially valid');

    // 'a' moving to an empty cell is valid.
    assert(validator.canApply(world, [
        { buildingId: building.id, brickId: 'a', position: { x: 5, y: 0.5, z: 0 }, rotation: 0 }
    ]) === true, 'moving into empty space is valid');

    // 'a' moving onto non-member 'b' is invalid.
    assert(validator.canApply(world, [
        { buildingId: building.id, brickId: 'a', position: { x: 2, y: 0.5, z: 0 }, rotation: 0 }
    ]) === false, 'moving onto a non-member brick is invalid');

    // Both 'a' and 'b' moving together, landing on distinct cells that
    // are neither their own old spots nor each other's — a same-selection
    // "reshuffle" is fine as long as the FINAL cells are all distinct.
    assert(validator.canApply(world, [
        { buildingId: building.id, brickId: 'a', position: { x: 2, y: 0.5, z: 0 }, rotation: 0 },
        { buildingId: building.id, brickId: 'b', position: { x: 0, y: 0.5, z: 0 }, rotation: 0 }
    ]) === true, 'members swapping cells with each other, and nothing outside the selection, is valid');

    // 'a' and 'b' both landing on the SAME cell as each other is invalid,
    // even though neither is a "non-member" of the selection.
    assert(validator.canApply(world, [
        { buildingId: building.id, brickId: 'a', position: { x: 9, y: 0.5, z: 9 }, rotation: 0 },
        { buildingId: building.id, brickId: 'b', position: { x: 9, y: 0.5, z: 9 }, rotation: 0 }
    ]) === false, 'two members landing on the same cell as each other is invalid');

    // A building the transform claims to touch but that no longer
    // exists is conservatively invalid — nothing to validate against.
    assert(validator.canApply(world, [
        { buildingId: 'missing-building', brickId: 'a', position: { x: 0, y: 0, z: 0 }, rotation: 0 }
    ]) === false, 'a missing building is conservatively invalid');

    console.log('✓ SelectionTransformValidator: exact-position collision, self-collision, missing building');
}

// ---------------------------------------------------------------------
// 2. SpatialEditingService: collision-aware preview and commit gating
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a, b, obstacle] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0) },
        { position: new Position(5, 0.5, 0) }
    ]);
    const document = new Document({ world });
    const session = { getDocument: (id) => (id === 'doc' ? document : null) };
    const histories = new Map([[world.id, new CommandHistory({ world })]]);
    const service = new SpatialEditingService(session, histories, brickRegistry);
    const selection = SpatialSelectionState.bricks({
        documentId: 'doc',
        items: [a, b].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    });
    const history = histories.get(world.id);

    // A valid drag: feedback reports valid, commit succeeds.
    service.beginTransformGesture(selection, { mode: 'translate', axis: 'x' });
    service.previewTransformGesture(selection, { translation: { x: 1, y: 0, z: 0 } });
    assert(service.getGestureFeedback().valid === true, 'valid preview reports valid: true');
    assert(service.commitTransformGesture(selection, { translation: { x: 1, y: 0, z: 0 } }) === true, 'valid drag commits');
    assert(history.getExecutedCommands().length === 1, 'valid commit produced one history entry');
    close(building.findBrick(a).position.x, 1, 'A moved');
    close(building.findBrick(b).position.x, 3, 'B moved');

    // A drag that would land A exactly on the obstacle: invalid preview,
    // blocked commit, real bricks left exactly where the gesture began.
    service.beginTransformGesture(selection, { mode: 'translate', axis: 'x' });
    service.previewTransformGesture(selection, { translation: { x: 4, y: 0, z: 0 } });
    assert(service.getGestureFeedback().valid === false, 'colliding preview reports valid: false');
    close(building.findBrick(a).position.x, 5, 'preview still moves the real bricks live (unchanged 0.4.7 behavior)');
    const committed = service.commitTransformGesture(selection, { translation: { x: 4, y: 0, z: 0 } });
    assert(committed === false, 'colliding drag is blocked at commit');
    assert(history.getExecutedCommands().length === 1, 'blocked commit adds no history entry');
    close(building.findBrick(a).position.x, 1, 'A reverted to its pre-gesture position');
    close(building.findBrick(b).position.x, 3, 'B reverted to its pre-gesture position');
    close(building.findBrick(obstacle).position.x, 5, 'obstacle itself never moved');

    console.log('✓ SpatialEditingService: preview reports validity live, commit blocks a colliding candidate, revert is exact');
}

// ---------------------------------------------------------------------
// 3. Keyboard move/rotate inherit the same gate (shared commit path)
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a, b, obstacle] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(4, 0.5, 0) },
        { position: new Position(2, 0.5, -2) }
    ]);
    const document = new Document({ world });
    const session = { getDocument: (id) => (id === 'doc' ? document : null) };
    const histories = new Map([[world.id, new CommandHistory({ world })]]);
    const service = new SpatialEditingService(session, histories, brickRegistry);
    const selection = SpatialSelectionState.bricks({
        documentId: 'doc',
        items: [a, b].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    });
    const history = histories.get(world.id);

    // Rotating 90 degrees around the pivot (2, 0.5, 0) sends A to
    // (2, 0.5, -2) — exactly where the non-member obstacle already sits.
    assert(service.rotateSelection(selection, 90) === false, 'keyboard rotation onto an obstacle is blocked');
    assert(history.getExecutedCommands().length === 0, 'blocked rotation adds no history entry');
    close(building.findBrick(a).position.x, 0, 'A unchanged after blocked rotation');
    close(building.findBrick(a).position.z, 0, 'A unchanged after blocked rotation (z)');

    // A 180-degree rotation swaps A and B's cells with EACH OTHER, not
    // with the obstacle — a same-selection reshuffle, valid per Section 1.
    assert(service.rotateSelection(selection, 180) === true, 'a same-selection swap is not treated as a collision');
    assert(history.getExecutedCommands().length === 1, 'the swap committed as one entry');
    close(building.findBrick(a).position.x, 4, 'A swapped to B\'s old cell');
    close(building.findBrick(b).position.x, 0, 'B swapped to A\'s old cell');

    console.log('✓ keyboard rotateSelection: obstacle blocks, same-selection swap does not');
}

// ---------------------------------------------------------------------
// 4. A persistent Group is gated identically once resolved
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a, b, obstacle] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(2, 0.5, 0) },
        { position: new Position(6, 0.5, 0) }
    ]);
    const group = new Group({ name: 'Wall', brickIds: [a, b] });
    world.addGroup(group);
    const document = new Document({ world });
    const session = { getDocument: (id) => (id === 'doc' ? document : null) };
    const histories = new Map([[world.id, new CommandHistory({ world })]]);
    const service = new SpatialEditingService(session, histories, brickRegistry);
    const selection = SpatialSelectionState.bricks({
        documentId: 'doc',
        items: [a, b].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    });
    const history = histories.get(world.id);

    // Moving the group by +6 lands B exactly on the obstacle.
    assert(service.moveSelection(selection, { x: 6, y: 0, z: 0 }) === false, 'group move onto an obstacle is blocked');
    assert(history.getExecutedCommands().length === 0, 'blocked group move adds no history entry');
    assert(JSON.stringify(group.brickIds) === JSON.stringify([a, b]), 'group membership untouched by a blocked move');

    // A clear move still works, and membership survives it, as before.
    assert(service.moveSelection(selection, { x: 1, y: 0, z: 0 }) === true, 'group move into empty space succeeds');
    close(building.findBrick(a).position.x, 1, 'A moved with the group');
    close(building.findBrick(b).position.x, 3, 'B moved with the group');

    console.log('✓ a resolved Group selection is collision-gated identically to any other selection');
}

// ---------------------------------------------------------------------
// 5. CAPSTONE — duplicate (0.4.7) then transform (0.4.8)
// ---------------------------------------------------------------------

{
    const brickRegistry = new CreateBrickRegistryUseCase().execute();
    const { world, building, ids: [a, b] } = createWorldWithBricks([
        { position: new Position(0, 0.5, 0) },
        { position: new Position(3, 0.5, 0) }
    ]);
    const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Capstone', author: 'tester' }) });
    const editorContext = new EditorContext();
    const documentManager = new DocumentManager();
    documentManager.load(document, 'editor-doc');

    const session = new EditorSession({
        registry: brickRegistry,
        editorContext,
        toolRegistry: null,
        documentManager,
        selectionUseCase: new SelectionUseCase(editorContext),
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null,
        copySelectionUseCase: new CopySelectionUseCase(brickRegistry),
        pasteClipboardUseCase: new PasteClipboardUseCase()
    });
    session._commandHistory = new CommandHistory({ world });
    // moveSelection() routes through SpatialEditingService, which looks
    // its history up from `_editorCommandHistories` (a Map, supporting
    // multi-document editing) rather than the single `_commandHistory`
    // duplicateSelection() writes to directly — normally wired together
    // by EditorSession#start() (which needs a real renderer container,
    // unavailable headless); wiring the Map by hand here is the same
    // shortcut tests/SelectionDuplication.test.js already takes for
    // `_commandHistory` alone, extended to the second transform gets.
    session._editorCommandHistories.set(world.id, session._commandHistory);

    editorContext.setSelection(new SelectionState({
        items: [a, b].map((brickId) => ({ type: 'brick', buildingId: building.id, brickId }))
    }));

    // Ctrl+D: duplicate becomes the active selection, re-anchored per
    // application/EditorSession.js's own DUPLICATE_OFFSET — off its
    // sources, per 0.4.7's own flagship assertion, but not by a fixed
    // world-space delta a test should hard-code. This section derives
    // the actual delta from the real pre/post positions instead of
    // assuming one, so it stays correct however that anchoring works.
    const sourcePositions = [a, b].map((id) => building.findBrick(id).position.toJSON());
    session.duplicateSelection();
    assert(session.commandHistory.getExecutedCommands().length === 1, 'duplicate is one history entry');
    const dupIds = editorContext.selection.brickIds;
    assert(dupIds.length === 2, 'duplicate became the active selection');
    const beforeBlocked = dupIds.map((id) => building.findBrick(id).position.toJSON());
    // Every member of a translated duplicate shares one delta back to
    // its own source — derive it from member 0 and confirm member 1
    // agrees, rather than assuming the anchoring math.
    const backToSource = {
        x: sourcePositions[0].x - beforeBlocked[0].x,
        y: sourcePositions[0].y - beforeBlocked[0].y,
        z: sourcePositions[0].z - beforeBlocked[0].z
    };
    close(sourcePositions[1].x - beforeBlocked[1].x, backToSource.x, 'the source-return delta is uniform across members (x)');
    close(sourcePositions[1].z - beforeBlocked[1].z, backToSource.z, 'the source-return delta is uniform across members (z)');

    // R, Move: dragging the duplicate by exactly that delta would land
    // it precisely back on its own source — the collision-aware gate
    // must refuse this, leaving the duplicate exactly where duplication
    // put it. { snap: false }, the same bypass applyNumericTransform
    // uses (SpatialEditingService's own "explicit intent is respected
    // literally" policy), so the fractional delta lands exactly rather
    // than snapping to the nearest grid increment first.
    assert(session.moveSelection(backToSource, { snap: false }) === false, 'moving the duplicate exactly onto its own source is blocked');
    assert(session.commandHistory.getExecutedCommands().length === 1, 'blocked move adds no history entry');
    dupIds.forEach((id, i) => {
        const pos = building.findBrick(id).position;
        close(pos.x, beforeBlocked[i].x, `duplicate ${i} left exactly where the blocked gesture found it (x)`);
        close(pos.z, beforeBlocked[i].z, `duplicate ${i} left exactly where the blocked gesture found it (z)`);
    });
    assert(building.findBrick(a).position.x === 0 && building.findBrick(b).position.x === 3, 'original bricks were never touched by the blocked move');

    // Move it somewhere with no collision instead: commits normally.
    assert(session.moveSelection({ x: 10, y: 0, z: 0 }, { snap: false }) === true, 'moving the duplicate into open space commits');
    assert(session.commandHistory.getExecutedCommands().length === 2, 'the successful move is exactly one more history entry');
    assert(session.commandHistory.getExecutedCommands()[1].type === 'transform-selection', 'the move uses the unified transform command');

    const afterMove = dupIds.map((id) => building.findBrick(id).position.x);
    session.commandHistory.undo();
    dupIds.forEach((id, i) => close(building.findBrick(id).position.x, beforeBlocked[i].x, `undo restores duplicate ${i} to its post-duplicate position`));
    session.commandHistory.redo();
    dupIds.forEach((id, i) => close(building.findBrick(id).position.x, afterMove[i], `redo restores the exact moved position for duplicate ${i}`));

    console.log('✓ CAPSTONE: duplicate then transform — collision blocks landing on the source, a clear move commits, undo/redo exact');
}

console.log('\nAll multi-brick transform collision tests passed.');
