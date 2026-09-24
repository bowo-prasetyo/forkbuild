import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { PlacementPositionService } from '../application/editor/PlacementPositionService.js';
import { StructureDocumentResolver } from '../application/editor/StructureDocumentResolver.js';
import { StructurePlacementValidator } from '../application/editor/StructurePlacementValidator.js';
import { StructurePlacementTool } from '../application/tools/StructurePlacementTool.js';
import { StructurePreviewUseCase } from '../application/editor/StructurePreviewUseCase.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.611 — Add Structure Relative Face Snapping.
//
// Implements the two additive pieces tests/StructureRelativeSnapping
// BoundaryAudit.test.js (0.9.610) recommended, and nothing else:
//   1. renderer/PickingService.js#pickPlacement() now extracts a face
//      normal from the raycast hit, mirroring pickRich()'s own
//      extraction six lines away (verified against real Three.js
//      raycasting in tests/StructureRelativeFaceSnappingRendering.test.js
//      — this file stays renderer-free, per that audit's own Section F
//      note on why PickingService integration lives separately).
//   2. application/editor/PlacementPositionService.js#calculateStructureStack()
//      generalizes calculateStack()'s per-axis half-extent math from
//      BrickDefinition dimensions to SpatialBounds sizes, and
//      application/tools/StructurePlacementTool.js#onPointerMove() now
//      reads pointerEvent.pickedPlacement first, exactly mirroring
//      PlacementTool's existing pickedBrick-first/ground-fallback shape.
//
// SECTIONS:
//   A. calculateStructureStack() — pure per-axis geometry, all four
//      horizontal directions, asymmetric (non-zero-based) bounds.
//   B. calculateStructureStack() — no Y-stacking (returns null on a
//      top/bottom face normal) and defensive null-guards.
//   C. calculateStructureStack() — the exact non-grid-aligned example
//      this milestone was scoped around: a 4.46-wide anchor spanning
//      global x = 10.37..14.83, a 2.50-wide structure snapped against
//      it lands at EXACTLY x = 14.83, never silently rounded to the grid.
//   D. calculateStructureStack() validated against the REAL, unmodified
//      StructurePlacementValidator — flush touching is legal, the
//      slightest overlap is refused — using actual Document/World
//      content (a grid-aligned anchor, a deliberately non-grid-aligned
//      neighbor), not a synthetic bounds object.
//   E. StructurePlacementTool — a pickedPlacement face hit snaps the
//      preview flush against the anchor; every fallback (no pick, no
//      normal, a top/bottom hit) still degrades to the pre-0.9.611
//      global-grid ground snap.
//   F. StructurePlacementTool — preview position equals committed
//      position, and the ANCHOR's own placement is never mutated by
//      computing or committing the new one's position.
//   G. StructurePlacementTool — a snapped position that would overlap a
//      THIRD structure is still caught by StructurePlacementValidator;
//      onPointerDown() refuses to commit it.
//   H. StructurePlacementTool — repeated onPointerMove() calls with an
//      identical pointerEvent are deterministic and never mutate World
//      state merely by hovering.
//   I. Non-interference — brick calculateStack() output is byte-
//      identical to before this milestone; ordinary (no-neighbor)
//      structure placement and SelectionTool's drag-move path are
//      unaffected.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function approxEqual(a, b, eps = 1e-9) {
    return Math.abs(a - b) < eps;
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function saveDocument(storage, serializer, document) {
    storage.save(document.world.id, serializer.serialize(document));
}

// A one-building "structure" Document with a single cube brick at local
// (0.5, 0.5, 0.5) — local AABB [0,1]x[0,1]x[0,1], grid-aligned.
function buildUnitStructureDocument(title) {
    const world = new World({});
    const building = new Building({});
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0.5, 0.5, 0.5) }));
    world.addBuilding(building);
    return { world, document: new Document({ world, metadata: new DocumentMetadata({ title }) }) };
}

// Same idea, but NOT grid-aligned ([0.25, 1.25] on X) — a forked
// structure's bricks have no reason to sum to a whole-number footprint.
function buildOffsetStructureDocument(title) {
    const world = new World({});
    const building = new Building({});
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0.75, 0.5, 0.5) }));
    world.addBuilding(building);
    return { world, document: new Document({ world, metadata: new DocumentMetadata({ title }) }) };
}

async function run() {
    const registry = new CreateBrickRegistryUseCase().execute();
    const positionService = new PlacementPositionService(registry);
    const settings = { gridSnapEnabled: true, gridSnapSize: 1 };

    // ===============================================================
    // Section A — calculateStructureStack(): pure per-axis geometry
    // ===============================================================
    {
        const anchorPosition = new Position(2, 0, 3);
        const anchorBounds = new SpatialBounds({ min: { x: 0, y: 0, z: 0 }, max: { x: 2, y: 1, z: 2 } }); // global [2,4]x[0,1]x[3,5]
        // Deliberately NOT zero-based, to prove both min AND max of the
        // moving structure's bounds are respected, not just its size.
        const movingBounds = new SpatialBounds({ min: { x: -1, y: 0, z: -1 }, max: { x: 1, y: 1, z: 1 } });

        const plusX = positionService.calculateStructureStack(anchorPosition, anchorBounds, { x: 1, y: 0, z: 0 }, movingBounds, settings);
        assert(approxEqual(plusX.x, 5) && plusX.z === 3 && plusX.y === 0,
            '1. +X face: touching x = anchorGlobal.max.x(4) - movingBounds.min.x(-1) = 5; z carried over unchanged');

        const minusX = positionService.calculateStructureStack(anchorPosition, anchorBounds, { x: -1, y: 0, z: 0 }, movingBounds, settings);
        assert(approxEqual(minusX.x, 1) && minusX.z === 3,
            '2. -X face: touching x = anchorGlobal.min.x(2) - movingBounds.max.x(1) = 1');

        const plusZ = positionService.calculateStructureStack(anchorPosition, anchorBounds, { x: 0, y: 0, z: 1 }, movingBounds, settings);
        assert(approxEqual(plusZ.z, 6) && plusZ.x === 2,
            '3. +Z face: touching z = anchorGlobal.max.z(5) - movingBounds.min.z(-1) = 6; x carried over unchanged');

        const minusZ = positionService.calculateStructureStack(anchorPosition, anchorBounds, { x: 0, y: 0, z: -1 }, movingBounds, settings);
        assert(approxEqual(minusZ.z, 2) && minusZ.x === 2,
            '4. -Z face: touching z = anchorGlobal.min.z(3) - movingBounds.max.z(1) = 2');

        // The carried-over (non-touching) axis is grid-snapped, exactly
        // like calculateStructureGround() already does for both axes —
        // only the TOUCHING axis is exempted (Section C proves that).
        const nonIntegerAnchor = new Position(2, 0, 3.6);
        const snappedCarry = positionService.calculateStructureStack(nonIntegerAnchor, anchorBounds, { x: 1, y: 0, z: 0 }, movingBounds, settings);
        assert(snappedCarry.z === 4, '5. the carried-over Z axis (3.6) is grid-snapped to 4, matching calculateStructureGround()\'s own rounding');

        const unsnappedCarry = positionService.calculateStructureStack(nonIntegerAnchor, anchorBounds, { x: 1, y: 0, z: 0 }, movingBounds, { gridSnapEnabled: false });
        assert(unsnappedCarry.z === 3.6, '6. with grid snap disabled, the carried-over axis is left exactly as-is, matching calculateStructureGround()\'s own gridSnapEnabled:false behavior');
    }

    // ===============================================================
    // Section B — no Y-stacking; defensive null guards
    // ===============================================================
    {
        const anchorPosition = new Position(0, 0, 0);
        const anchorBounds = new SpatialBounds({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } });
        const movingBounds = new SpatialBounds({ min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } });

        assert(positionService.calculateStructureStack(anchorPosition, anchorBounds, { x: 0, y: 1, z: 0 }, movingBounds, settings) === null,
            '7. a Y-dominant normal (the anchor\'s top face) resolves to no stacking axis — returns null, matching calculateStructureGround()\'s own "Y always 0, ground-plane only" invariant; the caller is expected to fall back to calculateStructureGround()');
        assert(positionService.calculateStructureStack(anchorPosition, anchorBounds, { x: 0, y: -1, z: 0 }, movingBounds, settings) === null,
            '8. ...same for the anchor\'s bottom face');
        assert(positionService.calculateStructureStack(anchorPosition, anchorBounds, { x: 0.1, y: 0, z: 0.1 }, movingBounds, settings) === null,
            '9. a normal with no axis dominant past the 0.5 threshold (a glancing/corner hit) also resolves to null, matching calculateStack()\'s own thresholding convention');

        assert(positionService.calculateStructureStack(null, anchorBounds, { x: 1, y: 0, z: 0 }, movingBounds, settings) === null,
            '10. a missing anchorPosition returns null rather than throwing');
        assert(positionService.calculateStructureStack(anchorPosition, null, { x: 1, y: 0, z: 0 }, movingBounds, settings) === null,
            '11. a missing anchorBounds returns null rather than throwing');
        assert(positionService.calculateStructureStack(anchorPosition, anchorBounds, { x: 1, y: 0, z: 0 }, null, settings) === null,
            '12. a missing movingBounds returns null rather than throwing');
        assert(positionService.calculateStructureStack(anchorPosition, anchorBounds, null, movingBounds, settings) === null,
            '13. a missing normal returns null rather than throwing');
    }

    // ===============================================================
    // Section C — the milestone's own worked example: exact, non-grid-
    // aligned contact, never silently rounded back onto the grid
    // ===============================================================
    {
        // Structure A's GLOBAL bounds: x = 10.37 .. 14.83 (width 4.46).
        const anchorPosition = new Position(10.37, 0, 0);
        const anchorBounds = new SpatialBounds({ min: { x: 0, y: 0, z: 0 }, max: { x: 4.46, y: 1, z: 1 } });
        // Structure B being placed: width = 2.50.
        const movingBounds = new SpatialBounds({ min: { x: 0, y: 0, z: 0 }, max: { x: 2.50, y: 1, z: 1 } });

        const touching = positionService.calculateStructureStack(anchorPosition, anchorBounds, { x: 1, y: 0, z: 0 }, movingBounds, settings);
        assert(approxEqual(touching.x, 14.83), '14. B snapped against A\'s +X face lands at EXACTLY x = 14.83 (A\'s own max.x), not a grid-rounded approximation');
        assert(touching.x % 1 !== 0, '15. 14.83 is not grid-aligned — a direct consequence of A\'s own non-integer footprint, not a contrived number');

        // Contrast with calculateStructureGround(): no hover position near
        // the true flush position ever reaches it — global-grid-only
        // snapping structurally cannot express 14.83.
        const hoversNearTouching = [14.6, 14.9, 15.1, 14.4];
        const allDiverge = hoversNearTouching.every((hover) =>
            positionService.calculateStructureGround(new Position(hover, 0, 0), settings).x !== touching.x);
        assert(allDiverge, '16. across a spread of hover positions near the true flush position, calculateStructureGround() never once lands on it — confirming the gap calculateStructureStack() closes is real, not cosmetic');
    }

    // ===============================================================
    // Section D — calculateStructureStack() validated against the REAL,
    // unmodified StructurePlacementValidator, using actual Document/
    // World content (not a synthetic bounds object)
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);
        const validator = new StructurePlacementValidator();

        const { world: worldA, document: docA } = buildUnitStructureDocument('A'); // grid-aligned
        const { world: worldB, document: docB } = buildOffsetStructureDocument('B'); // NOT grid-aligned
        saveDocument(storage, serializer, docA);
        saveDocument(storage, serializer, docB);

        const containingWorld = new World({});
        const anchorPosition = new Position(5, 0, 5);
        containingWorld.addStructurePlacement(new StructurePlacement({ documentId: worldA.id, position: anchorPosition }));

        const anchorBounds = SpatialBounds.fromWorld(worldA, registry);
        const movingBounds = SpatialBounds.fromWorld(worldB, registry);

        const touching = positionService.calculateStructureStack(anchorPosition, anchorBounds, { x: 1, y: 0, z: 0 }, movingBounds, settings);
        const touchingGlobal = movingBounds.getGlobalBounds(touching);
        const anchorGlobal = anchorBounds.getGlobalBounds(anchorPosition);
        assert(approxEqual(touchingGlobal.min.x, anchorGlobal.max.x),
            '17. the PRODUCTION method\'s output makes B\'s global bounds meet A\'s EXACTLY on the chosen face');
        assert(validator.canPlace(containingWorld, registry, resolver, { localBounds: movingBounds, position: touching }) === true,
            '18. ...and the real, unmodified StructurePlacementValidator agrees this position is placeable (touching, not overlapping)');

        const overlapping = new Position(touching.x - 0.01, touching.y, touching.z);
        assert(validator.canPlace(containingWorld, registry, resolver, { localBounds: movingBounds, position: overlapping }) === false,
            '19. nudged 1cm into the overlap, the same validator correctly refuses it');
    }

    // ===============================================================
    // Section E — StructurePlacementTool: pickedPlacement-first snapping,
    // with every fallback degrading to the pre-0.9.611 ground snap
    // ===============================================================
    let sharedFixture;
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const { world: worldA, document: docA } = buildUnitStructureDocument('A');
        const { world: worldB, document: docB } = buildOffsetStructureDocument('B');
        saveDocument(storage, serializer, docA);
        saveDocument(storage, serializer, docB);

        const containingWorld = new World({});
        const anchorPosition = new Position(5, 0, 5);
        const anchorPlacement = new StructurePlacement({ documentId: worldA.id, position: anchorPosition });
        containingWorld.addStructurePlacement(anchorPlacement);

        const commandHistory = new CommandHistory({ world: containingWorld });
        const editorContext = new CreateEditorContextUseCase().execute();
        const structurePreviewUseCase = new StructurePreviewUseCase(editorContext);
        editorContext.setActiveStructure(worldB.id, 'B');

        const tool = new StructurePlacementTool({
            world: containingWorld, registry, editorContext, commandHistory,
            structureResolver: resolver, structurePreviewUseCase
        });

        const expected = positionService.calculateStructureStack(
            anchorPosition, SpatialBounds.fromWorld(worldA, registry), { x: 1, y: 0, z: 0 },
            SpatialBounds.fromWorld(worldB, registry), editorContext.settings
        );

        tool.onPointerMove({
            worldPosition: { x: anchorPosition.x + 1.4, y: 0, z: anchorPosition.z + 0.2 },
            pickedPlacement: { placementId: anchorPlacement.id, point: { x: 6, y: 0.5, z: 5.2 }, normal: { x: 1, y: 0, z: 0 }, distance: 4 }
        });
        assert(approxEqual(editorContext.structurePreview.position.x, expected.x) && approxEqual(editorContext.structurePreview.position.z, expected.z),
            '20. a face hit on the anchor drives the preview to the SAME position calculateStructureStack() computes directly — the tool is correctly wired, not reimplementing the math');
        assert(editorContext.structurePreview.valid === true,
            '21. the snapped (touching, non-overlapping) position is reported valid');

        // Fallback 1: no pickedPlacement at all.
        tool.onPointerMove({ worldPosition: { x: 41.7, y: 0, z: -8.2 } });
        assert(editorContext.structurePreview.position.x === 42 && editorContext.structurePreview.position.z === -8,
            '22. with no pickedPlacement, the tool falls back to plain global-grid ground snapping, unchanged from before 0.9.611');

        // Fallback 2: pickedPlacement present but with no normal (an
        // older/partial pointerEvent shape, or a miss).
        tool.onPointerMove({
            worldPosition: { x: anchorPosition.x + 1.4, y: 0, z: anchorPosition.z + 0.2 },
            pickedPlacement: { placementId: anchorPlacement.id, point: { x: 6, y: 0.5, z: 5.2 }, distance: 4 }
        });
        assert(editorContext.structurePreview.position.x === 6 && editorContext.structurePreview.position.z === 5,
            '23. a pickedPlacement with no normal field falls back to ground snapping of the raw worldPosition (6.4 -> 6, 5.2 -> 5)');

        // Fallback 3: the hit face is the anchor's TOP (Y-dominant normal)
        // — no structure-on-structure Y-stacking, so this must not
        // silently collapse the preview onto the anchor's own footprint.
        tool.onPointerMove({
            worldPosition: { x: anchorPosition.x + 0.3, y: 0, z: anchorPosition.z + 0.3 },
            pickedPlacement: { placementId: anchorPlacement.id, point: { x: 5.3, y: 1, z: 5.3 }, normal: { x: 0, y: 1, z: 0 }, distance: 4 }
        });
        assert(editorContext.structurePreview.position.x === 5 && editorContext.structurePreview.position.z === 5,
            '24. a top-face hit falls back to ground snapping too — never a Y-stack, never silently reusing the anchor\'s own X/Z');

        // Fallback 4: the picked placementId no longer resolves (removed
        // between pick and this pointer move) — degrades gracefully.
        tool.onPointerMove({
            worldPosition: { x: 12.3, y: 0, z: 7.8 },
            pickedPlacement: { placementId: 'does-not-exist', point: { x: 12, y: 0.5, z: 8 }, normal: { x: 1, y: 0, z: 0 }, distance: 4 }
        });
        assert(editorContext.structurePreview.position.x === 12 && editorContext.structurePreview.position.z === 8,
            '25. an unresolvable placementId (already removed) falls back to ground snapping rather than throwing');

        sharedFixture = { containingWorld, commandHistory, editorContext, structurePreviewUseCase, tool, resolver, anchorPlacement, anchorPosition, worldA, worldB };
    }

    // ===============================================================
    // Section F — preview position equals committed position; the
    // anchor is never mutated
    // ===============================================================
    {
        const { containingWorld, editorContext, tool, anchorPlacement, anchorPosition } = sharedFixture;

        tool.onPointerMove({
            worldPosition: { x: anchorPosition.x + 1.4, y: 0, z: anchorPosition.z + 0.2 },
            pickedPlacement: { placementId: anchorPlacement.id, point: { x: 6, y: 0.5, z: 5.2 }, normal: { x: 1, y: 0, z: 0 }, distance: 4 }
        });
        const previewedPosition = editorContext.structurePreview.position;
        assert(editorContext.structurePreview.valid === true, '26. sanity: the position about to be committed is valid');

        const beforeCount = containingWorld.getStructurePlacements().length;
        tool.onPointerDown();
        const afterCount = containingWorld.getStructurePlacements().length;
        assert(afterCount === beforeCount + 1, '27. onPointerDown() committed exactly one new placement');

        const committed = containingWorld.getStructurePlacements().find((p) => p.id !== anchorPlacement.id);
        assert(committed.position.x === previewedPosition.x && committed.position.z === previewedPosition.z,
            '28. the committed placement\'s position is EXACTLY the previewed position — preview and commit never diverge');

        const anchorAfter = containingWorld.getStructurePlacement(anchorPlacement.id);
        assert(anchorAfter.position.x === anchorPosition.x && anchorAfter.position.z === anchorPosition.z,
            '29. the ANCHOR structure was never moved or modified by placing the new one against it — snapping only ever moves the structure being placed');
    }

    // ===============================================================
    // Section G — an obstructed snap position is still caught by
    // StructurePlacementValidator
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const { world: worldA, document: docA } = buildUnitStructureDocument('A');
        const { world: worldC, document: docC } = buildUnitStructureDocument('C');
        const { world: worldB, document: docB } = buildUnitStructureDocument('B'); // the one being placed
        saveDocument(storage, serializer, docA);
        saveDocument(storage, serializer, docC);
        saveDocument(storage, serializer, docB);

        const containingWorld = new World({});
        const placementA = new StructurePlacement({ documentId: worldA.id, position: new Position(0, 0, 0) });
        // C already occupies exactly the footprint a B snapped against
        // A's +X face would land on — [1,2]x[0,1]x[0,1].
        const placementC = new StructurePlacement({ documentId: worldC.id, position: new Position(1, 0, 0) });
        containingWorld.addStructurePlacement(placementA);
        containingWorld.addStructurePlacement(placementC);

        const commandHistory = new CommandHistory({ world: containingWorld });
        const editorContext = new CreateEditorContextUseCase().execute();
        const structurePreviewUseCase = new StructurePreviewUseCase(editorContext);
        editorContext.setActiveStructure(worldB.id, 'B');

        const tool = new StructurePlacementTool({
            world: containingWorld, registry, editorContext, commandHistory,
            structureResolver: resolver, structurePreviewUseCase
        });

        tool.onPointerMove({
            worldPosition: { x: 1.2, y: 0, z: 0.5 },
            pickedPlacement: { placementId: placementA.id, point: { x: 1, y: 0.5, z: 0.5 }, normal: { x: 1, y: 0, z: 0 }, distance: 3 }
        });
        assert(editorContext.structurePreview.position.x === 1 && editorContext.structurePreview.position.z === 0,
            '30. the snap correctly computes the geometric touching position against A, regardless of what else occupies it');
        assert(editorContext.structurePreview.valid === false,
            '31. ...but StructurePlacementValidator (unchanged, reused as-is) correctly flags it invalid — that position is already occupied by C');

        const beforeCount = containingWorld.getStructurePlacements().length;
        tool.onPointerDown();
        assert(containingWorld.getStructurePlacements().length === beforeCount,
            '32. onPointerDown() refuses to commit an invalid snapped position, exactly like it already refuses an invalid ground-snapped one');
    }

    // ===============================================================
    // Section H — repeated hover is deterministic and side-effect-free
    // ===============================================================
    {
        const { containingWorld, editorContext, tool, anchorPlacement, anchorPosition } = sharedFixture;
        const pointerEvent = {
            worldPosition: { x: anchorPosition.x + 1.4, y: 0, z: anchorPosition.z + 0.2 },
            pickedPlacement: { placementId: anchorPlacement.id, point: { x: 6, y: 0.5, z: 5.2 }, normal: { x: 1, y: 0, z: 0 }, distance: 4 }
        };
        const countBefore = containingWorld.getStructurePlacements().length;

        tool.onPointerMove(pointerEvent);
        const first = editorContext.structurePreview.position;
        tool.onPointerMove(pointerEvent);
        const second = editorContext.structurePreview.position;
        tool.onPointerMove(pointerEvent);
        const third = editorContext.structurePreview.position;

        assert(first.x === second.x && second.x === third.x && first.z === second.z && second.z === third.z,
            '33. three identical pointer moves in a row produce three identical preview positions — no drift, no accumulating state');
        assert(containingWorld.getStructurePlacements().length === countBefore,
            '34. merely hovering (however many times) never mutates World state — no placement is added, removed, or moved as a side effect of computing a preview');
    }

    // ===============================================================
    // Section I — non-interference: brick snapping, ordinary structure
    // placement, and SelectionTool's drag-move path are all unaffected
    // ===============================================================
    {
        // Brick stacking (calculateStack()) is completely untouched by
        // adding calculateStructureStack() next to it in the same class.
        const existingBrick = new Brick({ definitionId: 'core:cube', position: new Position(2, 0.5, 2) });
        const stackedRight = positionService.calculateStack(existingBrick, { x: 1, y: 0, z: 0 }, 'core:cube', settings);
        assert(stackedRight.x === 3 && stackedRight.y === 0.5 && stackedRight.z === 2,
            '35. ordinary brick face-stacking is byte-identical to pre-0.9.611 behavior');

        // A structure with no neighbor nearby still gets plain grid-only
        // ground snapping, exactly as before.
        const farGround = positionService.calculateStructureGround(new Position(41.7, 0, -8.2), settings);
        assert(farGround.x === 42 && farGround.z === -8 && farGround.y === 0,
            '36. structure placement far from any neighbor is unaffected — same grid-only math as before this milestone');

        // SelectionTool's drag-move path never reads pointerEvent.
        // pickedPlacement.normal (it destructures only placementId, per
        // 0.9.610's own audit) — confirmed here by source, since it is
        // an explicit part of this milestone's "avoid" list ("no changes
        // to already-placed structures' own repositioning behavior").
        const selectionToolSrc = await (await import('node:fs/promises')).readFile(
            new URL('../application/tools/SelectionTool.js', import.meta.url), 'utf8'
        );
        assert(!selectionToolSrc.includes('.pickedPlacement.normal'),
            '37. SelectionTool (the drag-an-existing-placement path) was not touched by this milestone — it still never reads a picked normal, matching the explicit "do not auto-snap already-placed structures" boundary');
    }

    console.log('✅ All StructureRelativeFaceSnapping tests passed.');
}

run().catch((error) => {
    console.error('StructureRelativeFaceSnapping.test.js FAILED:', error);
    process.exitCode = 1;
});
