
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
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.610 — Structure Relative Snapping Boundary Audit.
//
// TYPE: test-only audit. PRODUCTION CHANGES: none. Every claim below is
// checked either by reading real production source with readFile, or by
// constructing and calling only real production classes.
//
// CENTRAL QUESTION: bricks snap flush against a neighbor when placed
// (PlacementPositionService#calculateStack, fed by PickingService's
// face-hit normal); structures only ever snap to the global grid
// (PlacementPositionService#calculateStructureGround). Is a structure-
// touches-structure placement interaction a missing capability in that
// SAME seam, a structure-geometry gap, or evidence that structures need
// a genuinely different placement model?
//
// SECTIONS:
//   A. Inventory — the structure placement/move path (source trace):
//      confirms it is unconditionally global-grid-only today, with
//      pickedPlacement read only for SELECTION identity, never geometry.
//   B. Inventory — the existing brick relative-snap path (source trace
//      + live calls): confirms it is raycast FACE-HIT driven, not a
//      proximity/neighbor search — determinism comes from "one ray, one
//      nearest mesh," never from a candidate list.
//   C. Geometry compatibility — SpatialBounds already gives a structure
//      a full AABB (min/max/size/center) on demand, already used by
//      StructurePlacementValidator; "touching" (shared face, zero gap)
//      is already the production-legal boundary case, not a new concept.
//   D. The actual gap, isolated — PickingService#pickPlacement() never
//      reads the raycast hit's face normal (pickRich() already does,
//      six lines away); StructurePlacementTool never reads
//      pointerEvent.pickedPlacement at all. Two small, independent,
//      additive gaps — proven live, not just by reading source.
//   E. Feasibility demonstration — a TEST-LOCAL ONLY pure function
//      generalizing calculateStack()'s per-axis half-extent math from
//      BrickDefinition dimensions to SpatialBounds sizes, validated
//      against the REAL StructurePlacementValidator.
//   F. Multi-neighbor determinism — proven to not require a new policy:
//      raycasting can only ever produce one nearest hit.
//   G. Non-interference — brick paths, and the no-neighbor structure
//      path, are unaffected by everything above.
//   H. Classification and recommendation.
//
// SUPERSEDED IN PART BY 0.9.611 — Add Structure Relative Face Snapping.
// This audit's own Section D/H recommendation (extract a face normal in
// PickingService#pickPlacement(), mirroring pickRich(); read it first in
// StructurePlacementTool#onPointerMove(), mirroring PlacementTool's own
// pickedBrick-first/ground-fallback shape; generalize calculateStack()'s
// per-axis half-extent math to SpatialBounds sizes as a new
// calculateStructureStack() method) is exactly what 0.9.611 implemented,
// with the touching axis left UNSNAPPED (Section E's own "explicitly
// left open" note, resolved in favor of always-exact contact — see
// tests/StructureRelativeFaceSnapping.test.js, Section C, for the
// worked non-grid-aligned example that decision was based on). Section
// A's assertions 1 and 3, and Section D's assertion 20, are amended in
// place, per this codebase's own established convention, to assert the
// new, current production fact instead of the now-superseded absence;
// every other section in this file (B, C, E, F, G) was independently
// re-run against the 0.9.611 production code with NO changes needed —
// SpatialBounds, StructurePlacementValidator, and
// StructureDocumentResolver are still completely untouched, exactly as
// this audit's own classification said they would remain. See
// tests/StructureRelativeFaceSnapping.test.js for the dedicated flagship
// coverage of what 0.9.611 closes, and
// tests/StructureRelativeFaceSnappingRendering.test.js for the real-
// raycast proof of the PickingService half.

function saveDocument(storage, serializer, document) {
    storage.save(document.world.id, serializer.serialize(document));
}

// Builds a one-building "structure" Document with a single cube brick at
// local (0.5, 0.5, 0.5) sized so its local AABB is a clean [0,1]x[0,1]x[0,1]
// box — deliberately NOT centered on the local origin, so every assertion
// below is proven against a bounds shape that does not coincide with
// world (0,0,0), the same way a real forked structure's bricks rarely do.
function buildUnitStructureDocument(title) {
    const world = new World({});
    const building = new Building({});
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0.5, 0.5, 0.5) }));
    world.addBuilding(building);
    return { world, document: new Document({ world, metadata: new DocumentMetadata({ title }) }) };
}

// Same idea, but local bounds are deliberately NOT grid-aligned
// ([0.25, 1.25] on X instead of [0, 1]) — a forked structure's bricks
// have no reason to happen to sum to a whole-number footprint, and this
// is what exposes global-grid-only snapping's real limitation in
// Section E below (grid-snapping can only ever land on integer
// coordinates; exact touching against a non-integer-width neighbor
// requires a non-integer coordinate).
function buildOffsetStructureDocument(title) {
    const world = new World({});
    const building = new Building({});
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0.75, 0.5, 0.5) }));
    world.addBuilding(building);
    return { world, document: new Document({ world, metadata: new DocumentMetadata({ title }) }) };
}

async function run() {
    const registry = new CreateBrickRegistryUseCase().execute();

    // ===============================================================
    // Section A — structure placement/move path (source trace)
    // ===============================================================
    {
        const placementToolSrc = await readSource('application/tools/StructurePlacementTool.js');
        // 1/3 AMENDED BY 0.9.611 — Add Structure Relative Face Snapping
        // (see this file's own "SUPERSEDED IN PART BY 0.9.611" header,
        // above). At the time this audit was written, StructurePlacementTool
        // never read pointerEvent.pickedPlacement at all; 0.9.611 closed
        // exactly that gap with a pickedPlacement-first branch mirroring
        // PlacementTool's own pickedBrick-first/ground-fallback shape.
        assert(placementToolSrc.includes('pointerEvent.pickedPlacement'),
            '1. AMENDED BY 0.9.611 — StructurePlacementTool now reads pointerEvent.pickedPlacement, in a NEW _resolvePosition() helper, exactly the route this audit found missing.');
        assert(placementToolSrc.includes('calculateStructureGround('),
            '2. StructurePlacementTool.onPointerMove() still calls calculateStructureGround() — UNCHANGED BY 0.9.611: it is now the FALLBACK for "no usable face hit" rather than the only path (see assertion 1).');
        assert(/calculateStructureStack/.test(placementToolSrc),
            '3. AMENDED BY 0.9.611 — StructurePlacementTool now has a dimension-aware/relative offset call (calculateStructureStack()), the new PlacementPositionService method this audit\'s own Section E prototyped and Section H recommended by name.');

        const positionServiceSrc = await readSource('application/editor/PlacementPositionService.js');
        const structureGroundBody = positionServiceSrc.split('calculateStructureGround(')[1].split('calculateStack(')[0];
        assert(!structureGroundBody.includes('normal') && !structureGroundBody.includes('existing'),
            '4. calculateStructureGround() takes no neighbor/normal/existing-object argument — pure worldPosition -> grid snap');

        // The "move an already-placed structure" path (SelectionTool)
        // reads pickedPlacement too — but only to identify WHICH
        // placement is being dragged, never to compute WHERE it goes.
        const selectionToolSrc = await readSource('application/tools/SelectionTool.js');
        assert(selectionToolSrc.includes('pointerEvent.pickedPlacement'),
            '5. SelectionTool does read pointerEvent.pickedPlacement...');
        assert(/const\s*{\s*placementId\s*}\s*=\s*pointerEvent\.pickedPlacement/.test(selectionToolSrc),
            '6. ...but destructures ONLY placementId from it (selection identity), never a normal/point used for geometry');
        assert(selectionToolSrc.includes('calculateStructureGround('),
            '7. the drag-move position itself is computed by the SAME calculateStructureGround() as fresh placement — global grid only, for both create AND move');
    }

    // ===============================================================
    // Section B — existing brick relative-snap path
    // ===============================================================
    {
        const placementToolSrc = await readSource('application/tools/PlacementTool.js');
        assert(/pickedBrick\s*&&\s*pointerEvent\.pickedBrick\.normal/.test(placementToolSrc),
            '8. PlacementTool only attempts a relative snap when the picking layer actually reports a hit face normal');
        assert(placementToolSrc.includes('calculateStack('),
            '9. ...and falls through to calculateGround() (global grid) whenever it does not');

        const pickingSrc = await readSource('renderer/PickingService.js');
        assert(pickingSrc.includes('intersections[0]'),
            '10. PickingService.pickRich() reads only the NEAREST raycast hit — intersections[0]');
        assert(!/intersections\[1\]|intersections\.sort|intersections\.filter/.test(pickingSrc.split('pickRich(')[1].split('pickPlacement(')[0]),
            '11. ...and pickRich() has no candidate-list logic of any kind (no sort/filter over multiple hits) — determinism comes from THREE.Raycaster already returning hits nearest-first, not from any policy this codebase wrote');

        // Live proof: calculateStack() is a pure, deterministic function
        // of (existing brick, face normal, new definition, settings) —
        // no proximity search, no candidate list, ever enters it.
        const positionService = new PlacementPositionService(registry);
        const existingBrick = new Brick({ definitionId: 'core:cube', position: new Position(2, 0.5, 2) });
        const settings = { gridSnapEnabled: true, gridSnapSize: 1 };

        const stackedRight = positionService.calculateStack(existingBrick, { x: 1, y: 0, z: 0 }, 'core:cube', settings);
        assert(stackedRight.x === 3 && stackedRight.y === 0.5 && stackedRight.z === 2,
            '12. stacking a 1x1x1 cube against the +X face of another places it flush: existing.x + (0.5+0.5) = 3');

        const stackedUp = positionService.calculateStack(existingBrick, { x: 0, y: 1, z: 0 }, 'core:plate_2x4', settings);
        const plate2x4Def = registry.get('core:plate_2x4');
        assert(stackedUp.y === 0.5 + (1 / 2 + plate2x4Def.height / 2),
            '13. a differently-sized brick stacked on +Y sits exactly on the dimensional half-extent sum, not a grid-rounded guess');
        assert(stackedUp.x === 2 && stackedUp.z === 2,
            '14. the non-stacking axes are simply carried over from the existing brick, unchanged');
    }

    // ===============================================================
    // Section C — geometry compatibility: structures already have AABBs,
    // and "touching" is already a legal, non-overlapping boundary case
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const { world: worldA, document: docA } = buildUnitStructureDocument('A');
        const { world: worldB, document: docB } = buildUnitStructureDocument('B');
        saveDocument(storage, serializer, docA);
        saveDocument(storage, serializer, docB);

        const boundsA = SpatialBounds.fromWorld(worldA, registry);
        assert(boundsA.min.x === 0 && boundsA.max.x === 1
            && boundsA.min.y === 0 && boundsA.max.y === 1
            && boundsA.min.z === 0 && boundsA.max.z === 1,
            '15. SpatialBounds.fromWorld() already gives a structure a real local AABB, computed on demand from its bricks');
        assert(boundsA.size.x === 1 && boundsA.center.x === 0.5,
            '16. size/center are derived, not stored — the same "never store dimensions" posture core/Structure.js documents');

        // Place A at the origin, and place B flush against A's +X face:
        // B's local min.x (0) must land exactly on A's global max.x (1).
        const containingWorld = new World({});
        containingWorld.addStructurePlacement(new StructurePlacement({ documentId: worldA.id, position: new Position(0, 0, 0) }));
        const validator = new StructurePlacementValidator();

        const boundsB = SpatialBounds.fromWorld(worldB, registry);
        const touchingPosition = new Position(1 - 0, 0, 0); // A.max.x(1) - B.min.x(0)
        const touchingValid = validator.canPlace(containingWorld, registry, resolver, {
            localBounds: boundsB,
            position: touchingPosition
        });
        assert(touchingValid === true,
            '17. two structures whose bounds share a face EXACTLY are already treated as non-overlapping and placeable by production StructurePlacementValidator — "touching" needs no new collision concept');

        const overlappingPosition = new Position(1 - 0 - 0.001, 0, 0);
        const overlappingValid = validator.canPlace(containingWorld, registry, resolver, {
            localBounds: boundsB,
            position: overlappingPosition
        });
        assert(overlappingValid === false,
            '18. one millimeter into the overlap and the SAME validator correctly refuses it — the touching boundary is exact, not a fuzzy tolerance');
    }

    // ===============================================================
    // Section D — the actual gap, isolated to two small, additive spots
    // ===============================================================
    {
        const pickingSrc = await readSource('renderer/PickingService.js');
        const pickRichBody = pickingSrc.split('pickRich(screenX, screenY) {')[1].split('pickPlacement(screenX, screenY) {')[0];
        const pickPlacementBody = pickingSrc.split('pickPlacement(screenX, screenY) {')[1].split('pickGroundPosition(screenX, screenY) {')[0];

        assert(pickRichBody.includes('hit.face') && pickRichBody.includes('normal,'),
            '19. pickRich() (bricks) extracts and returns a face normal from the raycast hit...');
        // 20 AMENDED BY 0.9.611 — Add Structure Relative Face Snapping
        // (see this file's own "SUPERSEDED IN PART BY 0.9.611" header,
        // above). pickPlacement() now extracts a face normal too, the
        // same ~6-line pattern pickRich() already had — proven against
        // real Three.js raycasting in
        // tests/StructureRelativeFaceSnappingRendering.test.js.
        assert(pickPlacementBody.includes('hit.face') && pickPlacementBody.includes('normal,'),
            '20. AMENDED BY 0.9.611 — ...pickPlacement() (placements) now extracts it too: the same intersections[0] hit pickRich() reads, with the identical hit.face.normal.clone().transformDirection(...) pattern, now also returned as a normal field.');

        // Live proof of what the SECOND, independent gap looked like
        // before 0.9.611: a pointerEvent carrying a pickedPlacement with
        // NO normal field (an older/partial shape, or InputDispatcher
        // reporting a genuine miss) still has zero effect on
        // StructurePlacementTool's output — assertions 21/22 below are
        // UNCHANGED BY 0.9.611 for that reason: this specific pointerEvent
        // never supplies a normal, so it still exercises the (still
        // correct, still necessary) ground-snap fallback, not the new
        // snapping path. See tests/StructureRelativeFaceSnapping.test.js,
        // Section E, for live proof that a pickedPlacement WITH a normal
        // now drives a different, snapped result.
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);
        const { world: worldA, document: docA } = buildUnitStructureDocument('A');
        saveDocument(storage, serializer, docA);

        const world = new World({});
        world.addStructurePlacement(new StructurePlacement({ documentId: worldA.id, position: new Position(0, 0, 0) }));
        const commandHistory = new CommandHistory({ world });
        const editorContext = new CreateEditorContextUseCase().execute();
        const structurePreviewUseCase = new StructurePreviewUseCase(editorContext);
        editorContext.setActiveStructure(worldA.id, 'A');

        const tool = new StructurePlacementTool({
            world, registry, editorContext, commandHistory,
            structureResolver: resolver, structurePreviewUseCase
        });

        // Hover directly "over" the existing placement (worldPosition
        // deliberately inside its footprint) WITH a pickedPlacement
        // present — the exact shape a real pointer move over it would
        // carry once wired through InputDispatcher.
        tool.onPointerMove({
            worldPosition: { x: 0.3, y: 0, z: 0.3 },
            pickedPlacement: { placementId: world.getStructurePlacements()[0].id, point: { x: 0.3, y: 0.5, z: 0.3 }, distance: 4.2 }
        });
        assert(editorContext.structurePreview.position.x === 0 && editorContext.structurePreview.position.z === 0,
            '21. UNCHANGED BY 0.9.611 — a pickedPlacement with NO normal field still changes nothing: the preview is still the plain ground-snapped worldPosition (0.3 rounds to 0). This no longer means "pickedPlacement is never read" (see assertion 1\'s amendment) — it means the fallback for "no usable face hit" is still exactly this ground snap.');
        assert(editorContext.structurePreview.valid === false,
            '22. (it is correctly flagged invalid, since (0,0) overlaps A\'s [0,1]x[0,1] footprint — but that is collision detection, a pre-existing, separate concern from relative SNAPPING, exactly the distinction this audit was asked to keep separate)');
    }

    // ===============================================================
    // Section E — feasibility demonstration (TEST-LOCAL ONLY: this
    // function is never imported by, or copied into, production source;
    // it exists here purely to prove the generalization is mechanical)
    // ===============================================================
    {
        // Generalizes PlacementPositionService#calculateStack()'s own
        // per-axis half-extent branch from BrickDefinition width/height/
        // depth to SpatialBounds sizes. Deliberately keeps structures'
        // existing "Y is always 0, ground-plane only" invariant
        // (PlacementPositionService#calculateStructureGround()'s own
        // header) — there is no structure-on-structure Y-stacking today,
        // so this only ever resolves an X or Z face, never Y.
        //
        // Snaps only the CARRIED-OVER axis, leaving the touching axis
        // exact. calculateStack() itself instead snaps BOTH horizontal
        // axes unconditionally (see Section B, assertion 13's own
        // dimensional-exactness note) — faithfully mirroring that would
        // round the touching axis too, which is exact for grid-multiple
        // dimensions (ordinary cubes) but would reintroduce a small gap
        // for non-grid-multiple structure footprints. Which of these two
        // behaviors production code should pick is a small, genuine
        // design choice — left open here, not decided (Section H).
        function computeStructureTouchingPosition(anchorPosition, anchorBounds, normal, movingBounds, settings = {}) {
            const snapEnabled = settings.gridSnapEnabled !== false;
            const snapSize = settings.gridSnapSize || 1;
            const anchorGlobal = anchorBounds.getGlobalBounds(anchorPosition);

            let x = anchorPosition.x, z = anchorPosition.z;
            if (Math.abs(normal.x) > 0.5) {
                x = Math.sign(normal.x) > 0
                    ? anchorGlobal.max.x - movingBounds.min.x
                    : anchorGlobal.min.x - movingBounds.max.x;
                if (snapEnabled) z = Math.round(z / snapSize) * snapSize;
            } else if (Math.abs(normal.z) > 0.5) {
                z = Math.sign(normal.z) > 0
                    ? anchorGlobal.max.z - movingBounds.min.z
                    : anchorGlobal.min.z - movingBounds.max.z;
                if (snapEnabled) x = Math.round(x / snapSize) * snapSize;
            }
            return new Position(x, 0, z);
        }

        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);
        const validator = new StructurePlacementValidator();

        const { world: worldA, document: docA } = buildUnitStructureDocument('A');
        const { world: worldB, document: docB } = buildOffsetStructureDocument('B');
        saveDocument(storage, serializer, docA);
        saveDocument(storage, serializer, docB);

        const containingWorld = new World({});
        const anchorPosition = new Position(5, 0, 5);
        containingWorld.addStructurePlacement(new StructurePlacement({ documentId: worldA.id, position: anchorPosition }));

        const anchorBounds = SpatialBounds.fromWorld(worldA, registry);
        const movingBounds = SpatialBounds.fromWorld(worldB, registry);
        const settings = { gridSnapEnabled: true, gridSnapSize: 1 };

        const touching = computeStructureTouchingPosition(anchorPosition, anchorBounds, { x: 1, y: 0, z: 0 }, movingBounds, settings);
        const touchingGlobal = movingBounds.getGlobalBounds(touching);
        const anchorGlobal = anchorBounds.getGlobalBounds(anchorPosition);
        assert(touchingGlobal.min.x === anchorGlobal.max.x,
            '23. the computed position makes B\'s global bounds meet A\'s EXACTLY on the chosen face — real SpatialBounds arithmetic, no fudge factor');
        assert(validator.canPlace(containingWorld, registry, resolver, { localBounds: movingBounds, position: touching }) === true,
            '24. ...and the REAL production StructurePlacementValidator agrees this position is placeable (touching, not overlapping)');

        const wrongSide = new Position(touching.x - 0.01, 0, touching.z);
        assert(validator.canPlace(containingWorld, registry, resolver, { localBounds: movingBounds, position: wrongSide }) === false,
            '25. nudged 1cm into the overlap, the same validator correctly refuses it — confirms this is a precise geometric fact, not an approximation');

        // Contrast with TODAY's actual behavior for the same scenario:
        // B's own footprint is NOT grid-aligned (a forked structure has
        // no reason to sum to a whole-number width), so the true flush
        // position (5.75) is not even an integer — global-grid-only
        // snapping can only ever land ON an integer, so it structurally
        // CANNOT reach it, however precisely the user hovers. This is
        // exactly the "adjacent structures can appear slightly
        // separated (or overlapping)" symptom named in the requesting
        // brief, reproduced here against real production code.
        assert(touching.x % 1 !== 0,
            '26. the true flush-touching position is not grid-aligned (5.75) — a direct consequence of B\'s own non-grid-aligned footprint, not a contrived number');
        const positionService = new PlacementPositionService(registry);
        const hoversNearTouching = [5.6, 5.9, 6.1, 6.4];
        const allDiverge = hoversNearTouching.every((hover) =>
            positionService.calculateStructureGround(new Position(hover, 0, 5), settings).x !== touching.x);
        assert(allDiverge,
            '27. across a spread of hover positions near the true flush position, calculateStructureGround() NEVER once lands on it — global-grid snapping cannot express 5.75, confirming the visible gap is real and structural, not cosmetic');
    }

    // ===============================================================
    // Section F — multi-neighbor determinism does not need a new policy
    // ===============================================================
    {
        const pickingSrc = await readSource('renderer/PickingService.js');
        const pickPlacementBody = pickingSrc.split('pickPlacement(screenX, screenY) {')[1].split('pickGroundPosition(screenX, screenY) {')[0];
        assert(pickPlacementBody.includes('intersections[0]'),
            '28. pickPlacement() (0.2.91) already reads only intersections[0] — the single nearest hit — exactly like pickRich()');
        assert(!/intersections\[1\]/.test(pickPlacementBody),
            '29. ...every other intersection along the ray is discarded before this method ever returns, so there is never more than one candidate to choose between');

        // Concretely: build an anchor with TWO candidate neighbors on
        // different sides (the exact "B above, C to the side" shape the
        // requesting brief diagrammed) and confirm a raycast-shaped
        // interaction can only ever resolve to the ONE placement whose
        // mesh the ray actually intersects — never both at once, and
        // never a synthetic "nearest of several" comparison this
        // codebase would need to invent.
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);
        const { world: worldA } = buildUnitStructureDocument('A');
        const { world: worldB } = buildUnitStructureDocument('B');
        const { world: worldC } = buildUnitStructureDocument('C');
        saveDocument(storage, serializer, new Document({ world: worldA, metadata: new DocumentMetadata({ title: 'A' }) }));
        saveDocument(storage, serializer, new Document({ world: worldB, metadata: new DocumentMetadata({ title: 'B' }) }));
        saveDocument(storage, serializer, new Document({ world: worldC, metadata: new DocumentMetadata({ title: 'C' }) }));

        const containingWorld = new World({});
        const placementA = new StructurePlacement({ documentId: worldA.id, position: new Position(0, 0, 0) });
        const placementB = new StructurePlacement({ documentId: worldB.id, position: new Position(0, 0, 1) }); // touches A's +Z face
        const placementC = new StructurePlacement({ documentId: worldC.id, position: new Position(1, 0, 0) }); // touches A's +X face
        containingWorld.addStructurePlacement(placementA);
        containingWorld.addStructurePlacement(placementB);
        containingWorld.addStructurePlacement(placementC);

        // A resolved, geometric "which placement's mesh would this ray
        // hit" is a screen-space/mesh question PickingService alone can
        // answer (it needs Three.js + a DOM element, outside this
        // headless file's scope, per tests/PlacementPreviewUX.test.js's
        // own note on why it stays renderer-free) — but the DATA-side
        // guarantee that makes it deterministic is fully checkable here:
        // each placement occupies a disjoint AABB, so at most one can
        // ever be "the placement under this exact point."
        const boundsA = SpatialBounds.fromWorld(worldA, registry).getGlobalBounds(placementA.position);
        const boundsB = SpatialBounds.fromWorld(worldB, registry).getGlobalBounds(placementB.position);
        const boundsC = SpatialBounds.fromWorld(worldC, registry).getGlobalBounds(placementC.position);
        function overlaps(a, b) {
            return a.min.x < b.max.x && a.max.x > b.min.x
                && a.min.y < b.max.y && a.max.y > b.min.y
                && a.min.z < b.max.z && a.max.z > b.min.z;
        }
        assert(!overlaps(boundsA, boundsB) && !overlaps(boundsA, boundsC) && !overlaps(boundsB, boundsC),
            '30. A, B, and C occupy disjoint volumes (touching, never overlapping) — a single point in space can belong to at most one of them, so a raycast-hit-driven mechanism structurally cannot receive two simultaneous "neighbor" candidates for the same pointer position');
    }

    // ===============================================================
    // Section G — non-interference
    // ===============================================================
    {
        const positionService = new PlacementPositionService(registry);
        const settings = { gridSnapEnabled: true, gridSnapSize: 1 };

        // Brick ground/stack math, called AFTER everything above ran,
        // still produces the exact same output as Section B did in
        // isolation — nothing above mutated PlacementPositionService,
        // SnapMath, or BrickRegistry state.
        const groundBrick = positionService.calculateGround({ x: 3.4, y: 0, z: -2.1 }, 'core:cube', settings);
        assert(groundBrick.x === 3 && groundBrick.z === -2 && groundBrick.y === 0.5,
            '31. ordinary brick ground placement is byte-identical to pre-audit behavior');

        // A structure with no neighbor nearby still gets plain
        // grid-only ground snapping, exactly as today, regardless of
        // whether a pickedPlacement happens to be present on the event.
        const farGround = positionService.calculateStructureGround(new Position(41.7, 0, -8.2), settings);
        assert(farGround.x === 42 && farGround.z === -8 && farGround.y === 0,
            '32. structure placement far from any neighbor is unaffected — same grid-only math as before this audit');

        // No already-placed structure moved as a side effect of any
        // computation in Sections C/E/F.
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);
        const { world: worldA, document: docA } = buildUnitStructureDocument('A');
        saveDocument(storage, serializer, docA);
        const containingWorld = new World({});
        const originalPosition = new Position(2, 0, 2);
        containingWorld.addStructurePlacement(new StructurePlacement({ documentId: worldA.id, position: originalPosition }));
        const validator = new StructurePlacementValidator();
        const boundsA = SpatialBounds.fromWorld(worldA, registry);
        // Merely computing validity/candidate positions must never
        // mutate the existing placement in place.
        validator.canPlace(containingWorld, registry, resolver, { localBounds: boundsA, position: new Position(10, 0, 10) });
        const stillThere = containingWorld.getStructurePlacements()[0];
        assert(stillThere.position.x === 2 && stillThere.position.z === 2,
            '33. an existing placement\'s position is completely unaffected by computing a candidate position for a DIFFERENT, new placement — no automatic repositioning of anything already placed');
    }

    // ===============================================================
    // Section H — Classification and recommendation
    // ===============================================================
    {
        console.log(`
✓ H — PRODUCT CONCLUSION.

  CLASSIFICATION: CAPABILITY_REUSE_CONFIRMED, with a small, precisely
  bounded, ADDITIVE wiring gap — not a structure-geometry gap (Section
  C: SpatialBounds already gives every structure a full, on-demand AABB,
  and "touching" is already the production-legal, non-overlapping
  boundary StructurePlacementValidator treats correctly today), and not
  evidence structures need a second, different placement model (Sections
  B/D/F: the brick mechanism is raycast FACE-HIT driven, not a proximity
  search, and that same mechanism already exists in the picking layer
  for placements — renderer/PickingService.js#pickPlacement() already
  raycasts against placement meshes and already reads only the single
  nearest hit; it just never reads that hit's face normal).

  THE GAP IS EXACTLY TWO SMALL, INDEPENDENT, ADDITIVE PIECES (Section D):
    1. renderer/PickingService.js#pickPlacement() needs the same
       ~6-line face-normal-from-hit.face extraction pickRich() already
       has (Section D, assertions 19-20) — no new raycast, no new mesh
       registry, reusing the exact intersections[0] hit it already
       computes.
    2. application/tools/StructurePlacementTool.js#onPointerMove()
       needs a pickedPlacement-first branch mirroring PlacementTool.
       onPointerMove()'s existing pickedBrick-first/ground-fallback
       shape (Section A, assertion 1-3 vs. Section B, assertion 8-9),
       calling a new PlacementPositionService method (e.g.
       calculateStructureStack()) that generalizes calculateStack()'s
       per-axis half-extent math from BrickDefinition dimensions to
       SpatialBounds sizes — proven mechanically sound in Section E
       against the REAL StructurePlacementValidator, not a sketch.

  MULTI-NEIGHBOR AMBIGUITY (Section F) NEEDS NO NEW RESOLUTION POLICY:
  because the reused mechanism is hit-testing, not a proximity/nearest-
  neighbor search, at most one placement can ever be "the" candidate for
  a given pointer position — determinism is inherited for free, exactly
  as it already is for bricks, never invented.

  INHERITED, PRE-EXISTING SIMPLIFICATIONS THIS WOULD REUSE, NOT
  INTRODUCE: AABB/translate-only geometry (a rotated structure's true
  footprint is smaller than its axis-aligned box — the same V1
  simplification core/SpatialBounds.js and StructurePlacementValidator
  already declared for collision); ground-plane-only (Y always 0,
  matching calculateStructureGround()'s own existing invariant — no
  structure-on-structure Y-stacking, none proposed).

  EXPLICITLY LEFT OPEN, NOT DECIDED BY THIS AUDIT (Section E's own
  note): whether the touching axis itself should be grid-snapped like
  calculateStack() does today for bricks (byte-for-byte precedent
  parity, exact only for grid-multiple footprints) or left unsnapped
  (always exact, a small behavioral divergence from the brick
  precedent) — a genuine, narrow product decision for whoever implements
  this, not a technical blocker.

  PER THE REQUESTING BRIEF'S OWN "AVOID" LIST: none of a
  UniversalSnapEngine, a spatial database, automatic rearrangement,
  new structure-to-structure collision resolution, changed brick
  behavior, arbitrary proximity-based snapping, persistent snapping
  state, or auto-snapping already-placed structures is needed to close
  this gap — every one of those would only be needed for a DIFFERENT
  mechanism (proximity search) this codebase does not use and does not
  need to start using here.

  RECOMMENDED NEXT MILESTONE: implement the two additive pieces above
  as a small production change — reusing SpatialBounds,
  StructurePlacementValidator, and StructureDocumentResolver completely
  unchanged, mirroring PlacementTool/PlacementPositionService's existing
  pickedBrick-first shape for structures.
`);
    }

    console.log('✅ All StructureRelativeSnappingBoundaryAudit tests passed.');
}

run().catch((error) => {
    console.error('StructureRelativeSnappingBoundaryAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
