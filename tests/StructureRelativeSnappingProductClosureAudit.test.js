import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { PlacementPositionService } from '../application/PlacementPositionService.js';
import { StructureDocumentResolver } from '../application/StructureDocumentResolver.js';
import { StructurePlacementValidator } from '../application/StructurePlacementValidator.js';
import { StructurePlacementTool } from '../application/tools/StructurePlacementTool.js';
import { SelectionTool } from '../application/tools/SelectionTool.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { StructurePreviewUseCase } from '../application/StructurePreviewUseCase.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.612 — Structure Relative Snapping Product Closure Audit.
//
// 0.9.610 (test-only) found the gap; 0.9.611 (production) closed it with
// two additive pieces and 37 headless assertions plus a real-Three.js
// rendering suite. This milestone does not touch production code. It asks
// one question against the CURRENT, unmodified 0.9.611 code: can a user
// now reliably place structures flush against existing structures while
// preserving grid, validation, preview, and brick-placement behavior end
// to end — and does the actual user journey (not just the pure math
// 0.9.611's own Section A already covered) expose anything left over?
//
// This file deliberately does NOT re-prove what 0.9.611 already proved at
// the pure-function level (calculateStructureStack()'s per-axis geometry
// in all four directions, its null-guards, its non-grid-aligned worked
// example). Instead it drives the exact same scenarios through the REAL
// StructurePlacementTool/SelectionTool integration — the layer a user
// actually touches — closing the gap between "the formula is correct" and
// "the feature works," and adds three integration branches 0.9.611 never
// exercised: an anchor placement whose OWN document has become
// unresolvable, an ACTIVE structure whose document is unresolvable, and a
// live (not source-grep) proof that dragging an already-placed structure
// next to a neighbor still never relative-snaps.
//
// SECTIONS (mirroring the requesting brief's own lettering):
//   A. End-to-end flagship — a deliberately non-grid-aligned ANCHOR (not
//      just a non-grid-aligned mover, which 0.9.611 already covered),
//      driven through the real StructurePlacementTool, preview position
//      equals committed position equals exact geometric face contact.
//   B. All four horizontal faces (+X/-X/+Z/-Z) AND a glancing corner hit,
//      all driven through StructurePlacementTool.onPointerMove(), not the
//      bare position-service function.
//   C. Grid interaction at the tool level: touching axis exact, carried
//      axis grid-snapped. Also confirms, live, a real inherited invariant
//      worth stating explicitly: the carried axis tracks the ANCHOR's own
//      placement coordinate (rounded), never the hover position along the
//      anchor's face — exact precedent parity with calculateStack()'s own
//      brick-stacking behavior, not a new limitation.
//   D. Fallback behavior — two branches 0.9.611's own test file never
//      drove: the anchor placement resolves but ITS document no longer
//      does (removed from storage), and the ACTIVE structure's own
//      document doesn't resolve. Both must degrade to ground snap, never
//      throw. Ordinary no-neighbor ground placement is reconfirmed.
//   E. Validation boundary — the touching axis (exact) and the carried
//      axis (grid-rounded) combine to overlap a THIRD structure; the
//      validator (unchanged) still catches it and onPointerDown() still
//      refuses to commit.
//   F. Existing behavior preservation, verified at RUNTIME rather than by
//      source grep: dragging an already-placed structure via SelectionTool
//      past a neighbor's face never relative-snaps to it — it stays
//      plain-grid, exactly as before 0.9.611.
//   G. State and side effects — hovering with a resolved relative snap
//      creates no new persisted fields on StructurePlacement/World, and
//      the committed placement round-trips through DocumentSerializer
//      with nothing extra attached.
//   H. Product truthfulness across all four directions — preview always
//      equals committed position (0.9.611 proved this for +X only).
//
// On the "subtle point" the requesting brief raised — whether the
// raycast's single-hit determinism is the INTENDED target, not just A
// target — no new proof is added here: it is already fully answered by
// tests/StructureRelativeFaceSnappingRendering.test.js Section B
// (assertions 7-8), which places two real THREE.Mesh placements on one
// ray and shows the nearer one is the one reported, with its normal
// pointing away from the anchor toward where the new structure belongs —
// exactly the semantics calculateStructureStack() assumes. That test uses
// real Three.js raycasting and cannot be meaningfully duplicated in this
// headless file; re-reading it satisfies this audit's obligation to
// confirm it rather than take "single hit" on faith.

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

// A wider, deliberately NOT grid-aligned footprint: local AABB
// [-0.23, 4.23] on X (width 4.46) — used as the ANCHOR in Section A,
// unlike 0.9.611's own worked example which only ever made the MOVING
// structure non-grid-aligned.
function buildWideOffsetStructureDocument(title) {
    const world = new World({});
    const building = new Building({});
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(-0.5, 0.5, 0.5) }));
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(3.5, 0.5, 0.5) }));
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(3.73, 0.5, 0.5) }));
    world.addBuilding(building);
    return { world, document: new Document({ world, metadata: new DocumentMetadata({ title }) }) };
}

function makeToolFixture({ registry, containingWorld, activeDocumentId, activeTitle, resolver }) {
    const commandHistory = new CommandHistory({ world: containingWorld });
    const editorContext = new CreateEditorContextUseCase().execute();
    const structurePreviewUseCase = new StructurePreviewUseCase(editorContext);
    editorContext.setActiveStructure(activeDocumentId, activeTitle);
    const tool = new StructurePlacementTool({
        world: containingWorld, registry, editorContext, commandHistory,
        structureResolver: resolver, structurePreviewUseCase
    });
    return { commandHistory, editorContext, structurePreviewUseCase, tool };
}

async function run() {
    const registry = new CreateBrickRegistryUseCase().execute();
    const positionService = new PlacementPositionService(registry);
    const settings = { gridSnapEnabled: true, gridSnapSize: 1 };

    // ===============================================================
    // Section A — end-to-end flagship: a non-grid-aligned ANCHOR, driven
    // through the real StructurePlacementTool
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);
        const validator = new StructurePlacementValidator();

        const { world: worldAnchor, document: docAnchor } = buildWideOffsetStructureDocument('Anchor'); // NOT grid-aligned
        const { world: worldMover, document: docMover } = buildUnitStructureDocument('Mover'); // grid-aligned
        saveDocument(storage, serializer, docAnchor);
        saveDocument(storage, serializer, docMover);

        const containingWorld = new World({});
        const anchorPosition = new Position(10, 0, 5); // grid-aligned placement of a non-grid-aligned footprint
        const anchorPlacement = new StructurePlacement({ documentId: worldAnchor.id, position: anchorPosition });
        containingWorld.addStructurePlacement(anchorPlacement);

        const { editorContext, tool, commandHistory } = makeToolFixture({
            registry, containingWorld, activeDocumentId: worldMover.id, activeTitle: 'Mover', resolver
        });

        const anchorBounds = SpatialBounds.fromWorld(worldAnchor, registry);
        const anchorGlobal = anchorBounds.getGlobalBounds(anchorPosition);
        assert(anchorGlobal.max.x % 1 !== 0, '1. sanity: the anchor\'s actual global +X face is not grid-aligned (a real, not contrived, forked-structure footprint)');

        tool.onPointerMove({
            worldPosition: { x: anchorGlobal.max.x + 0.4, y: 0, z: anchorPosition.z + 0.1 },
            pickedPlacement: { placementId: anchorPlacement.id, point: { x: anchorGlobal.max.x, y: 0.5, z: 5.1 }, normal: { x: 1, y: 0, z: 0 }, distance: 3 }
        });
        const preview = editorContext.structurePreview;
        assert(approxEqual(preview.position.x, anchorGlobal.max.x),
            '2. hovering near a NON-grid-aligned anchor face snaps the mover\'s preview to EXACTLY that face through the real tool, not an approximation');
        assert(preview.valid === true, '3. that flush position is reported valid');

        const movingBounds = SpatialBounds.fromWorld(worldMover, registry);
        const committedGlobal = movingBounds.getGlobalBounds(preview.position);
        assert(approxEqual(committedGlobal.min.x, anchorGlobal.max.x),
            '4. the PREVIEWED mover\'s own global bounds meet the anchor\'s global bounds with zero gap and zero overlap');

        tool.onPointerDown();
        const committed = containingWorld.getStructurePlacements().find((p) => p.id !== anchorPlacement.id);
        assert(committed && approxEqual(committed.position.x, preview.position.x) && approxEqual(committed.position.z, preview.position.z),
            '5. the COMMITTED placement is at exactly the previewed position — no preview/commit divergence for a non-grid-aligned anchor');
        assert(validator.canPlace(containingWorld, registry, resolver, { localBounds: movingBounds, position: committed.position, excludePlacementId: committed.id }) === true,
            '6. the real, unmodified validator agrees the final committed position is legal (touching, not overlapping)');
        assert(commandHistory.canUndo, '7. the commit went through the normal command history, like any other placement');
    }

    // ===============================================================
    // Section B — all four horizontal faces, AND a glancing corner hit,
    // driven through StructurePlacementTool.onPointerMove()
    // ===============================================================
    let dirFixture;
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const { world: worldA, document: docA } = buildUnitStructureDocument('A');
        const { world: worldB, document: docB } = buildUnitStructureDocument('B');
        saveDocument(storage, serializer, docA);
        saveDocument(storage, serializer, docB);

        const containingWorld = new World({});
        const anchorPosition = new Position(20, 0, 20);
        const anchorPlacement = new StructurePlacement({ documentId: worldA.id, position: anchorPosition });
        containingWorld.addStructurePlacement(anchorPlacement);

        const { editorContext, tool } = makeToolFixture({
            registry, containingWorld, activeDocumentId: worldB.id, activeTitle: 'B', resolver
        });
        const anchorGlobal = SpatialBounds.fromWorld(worldA, registry).getGlobalBounds(anchorPosition);

        const directions = [
            { normal: { x: 1, y: 0, z: 0 }, expected: { x: anchorGlobal.max.x, z: anchorPosition.z }, label: '+X' },
            { normal: { x: -1, y: 0, z: 0 }, expected: { x: anchorGlobal.min.x - 1, z: anchorPosition.z }, label: '-X' },
            { normal: { x: 0, y: 0, z: 1 }, expected: { x: anchorPosition.x, z: anchorGlobal.max.z }, label: '+Z' },
            { normal: { x: 0, y: 0, z: -1 }, expected: { x: anchorPosition.x, z: anchorGlobal.min.z - 1 }, label: '-Z' }
        ];
        let index = 8;
        for (const dir of directions) {
            tool.onPointerMove({
                worldPosition: { x: anchorPosition.x, y: 0, z: anchorPosition.z },
                pickedPlacement: { placementId: anchorPlacement.id, point: { x: anchorPosition.x, y: 0.5, z: anchorPosition.z }, normal: dir.normal, distance: 1 }
            });
            const pos = editorContext.structurePreview.position;
            assert(approxEqual(pos.x, dir.expected.x) && approxEqual(pos.z, dir.expected.z),
                `${index}. ${dir.label} face hit drives the real tool's preview to exact flush contact on that face`);
            assert(editorContext.structurePreview.valid === true, `${index + 1}. ...and it is reported valid (empty space on all four sides of a lone anchor)`);
            index += 2;
        }

        // A glancing/corner hit (no axis dominant past the 0.5 threshold)
        // must fall back to ground snap through the TOOL, not just the
        // bare calculateStructureStack() function 0.9.611's Section B
        // already proved returns null for this normal.
        tool.onPointerMove({
            worldPosition: { x: 41.7, y: 0, z: -8.2 },
            pickedPlacement: { placementId: anchorPlacement.id, point: { x: 20.5, y: 0.5, z: 20.5 }, normal: { x: 0.3, y: 0, z: 0.3 }, distance: 1 }
        });
        assert(editorContext.structurePreview.position.x === 42 && editorContext.structurePreview.position.z === -8,
            '16. a glancing corner-hit normal (no axis dominant) falls back to plain ground snapping through the real tool, exactly like a top/bottom hit does');

        dirFixture = { containingWorld, anchorPlacement, anchorPosition, worldA, worldB, tool, editorContext };
    }

    // ===============================================================
    // Section C — grid interaction at the tool level: touching axis
    // exact, carried axis grid-snapped. This section also surfaces and
    // confirms a real, non-obvious invariant inherited unchanged from
    // calculateStack()'s own brick precedent: the carried axis tracks
    // the ANCHOR's own placement coordinate on that axis, never the
    // hover position along the anchor's face (calculateStructureStack()
    // literally initializes `z = anchorPosition.z` / `x = anchorPosition.x`
    // before branching — see application/PlacementPositionService.js).
    // A user cannot slide a new structure to different points along a
    // wide anchor face by hovering at different points along it; every
    // hover along that face resolves to the same carried-axis value. This
    // is not a regression 0.9.611 introduced — core/Brick.js stacking has
    // always worked identically (a brick stacked against an existing
    // brick's face keeps that brick's OWN X/Z, not the raycast hit
    // point's) — so it is confirmed here as EXPECTED_BOUNDARY precedent
    // parity, not flagged as a gap.
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const { world: worldA, document: docA } = buildUnitStructureDocument('A');
        const { world: worldB, document: docB } = buildUnitStructureDocument('B');
        saveDocument(storage, serializer, docA);
        saveDocument(storage, serializer, docB);

        const containingWorld = new World({});
        const anchorPosition = new Position(5, 0, 20.6); // deliberately non-integer Z
        const anchorPlacement = new StructurePlacement({ documentId: worldA.id, position: anchorPosition });
        containingWorld.addStructurePlacement(anchorPlacement);

        const { editorContext, tool } = makeToolFixture({
            registry, containingWorld, activeDocumentId: worldB.id, activeTitle: 'B', resolver
        });

        tool.onPointerMove({
            worldPosition: { x: anchorPosition.x + 1.4, y: 0, z: 20.83 },
            pickedPlacement: { placementId: anchorPlacement.id, point: { x: anchorPosition.x + 1, y: 0.5, z: 20.83 }, normal: { x: 1, y: 0, z: 0 }, distance: 1 }
        });
        const first = editorContext.structurePreview.position;
        assert(first.z === 21, '17. the CARRIED axis (Z) grid-snaps the ANCHOR\'s own coordinate (20.6 -> 21), matching calculateStructureGround()\'s own rounding convention');
        assert(approxEqual(first.x, 6), '18. the touching axis (X) lands at exact flush contact (A\'s local width 1, position.x 5 -> global max.x 6)');

        // Hover at a very different point along the same face — the
        // carried axis must NOT track the hover position; it stays
        // pinned to the anchor's own (rounded) coordinate.
        tool.onPointerMove({
            worldPosition: { x: anchorPosition.x + 1.4, y: 0, z: 200.1 },
            pickedPlacement: { placementId: anchorPlacement.id, point: { x: anchorPosition.x + 1, y: 0.5, z: 200.1 }, normal: { x: 1, y: 0, z: 0 }, distance: 1 }
        });
        assert(editorContext.structurePreview.position.z === 21,
            '19. hovering at a wildly different point along the SAME anchor face still resolves to the same carried Z (21) — the carried axis is anchor-driven, never hover-driven, confirmed live rather than assumed from the pure-function tests alone');

        // Disabling grid snap must leave the carried axis at the anchor's
        // own RAW coordinate, still independent of hover. EditorSettings
        // is immutable data (getter-only) — the real way to change it,
        // used identically by whatever UI eventually wires a grid-snap
        // toggle, is EditorContext#setSettings() with a fresh instance.
        const { EditorSettings } = await import('../application/editor-state/EditorSettings.js');
        editorContext.setSettings(new EditorSettings({ gridSnapEnabled: false, gridSnapSize: 1 }));
        tool.onPointerMove({
            worldPosition: { x: anchorPosition.x + 1.4, y: 0, z: 200.1 },
            pickedPlacement: { placementId: anchorPlacement.id, point: { x: anchorPosition.x + 1, y: 0.5, z: 200.1 }, normal: { x: 1, y: 0, z: 0 }, distance: 1 }
        });
        assert(editorContext.structurePreview.position.z === 20.6,
            '20. with grid snap disabled via the real EditorContext#setSettings(), the carried axis is the anchor\'s own exact (unrounded) coordinate — 20.6, not the hovered 200.1 — the tool reads live settings, not a cached copy, and the carried-axis source is confirmed to be the anchor throughout');
        editorContext.setSettings(new EditorSettings({ gridSnapEnabled: true, gridSnapSize: 1 }));
    }

    // ===============================================================
    // Section D — fallback behavior: an unresolvable ANCHOR document, an
    // unresolvable ACTIVE (moving) document, and ordinary no-neighbor
    // ground placement
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const { world: worldA, document: docA } = buildUnitStructureDocument('A');
        const { world: worldB, document: docB } = buildUnitStructureDocument('B');
        saveDocument(storage, serializer, docA);
        // docB deliberately NEVER saved — the active structure being
        // placed has an id but its Document can't be resolved.
        const missingMoverDocId = worldB.id;

        const containingWorld = new World({});
        const anchorPosition = new Position(30, 0, 30);
        const anchorPlacement = new StructurePlacement({ documentId: worldA.id, position: anchorPosition });
        containingWorld.addStructurePlacement(anchorPlacement);

        {
            const { editorContext, tool } = makeToolFixture({
                registry, containingWorld, activeDocumentId: missingMoverDocId, activeTitle: 'B (unsaved)', resolver
            });
            tool.onPointerMove({
                worldPosition: { x: anchorPosition.x + 0.4, y: 0, z: anchorPosition.z + 0.4 },
                pickedPlacement: { placementId: anchorPlacement.id, point: { x: anchorPosition.x, y: 0.5, z: anchorPosition.z + 0.4 }, normal: { x: 1, y: 0, z: 0 }, distance: 1 }
            });
            assert(editorContext.structurePreview.position.x === 30 && editorContext.structurePreview.position.z === 30,
                '21. an ACTIVE structure whose own Document cannot be resolved falls back to plain ground snapping rather than throwing');
        }

        // Now the reverse: the ANCHOR placement itself resolves (it's a
        // real StructurePlacement in the World), but ITS document has
        // since been removed from storage — a stale reference, exactly
        // the scenario StructureDocumentResolver's own header documents
        // as "the only way to reach this path today."
        {
            const { world: worldC, document: docC } = buildUnitStructureDocument('C');
            saveDocument(storage, serializer, docC);
            const staleAnchorPosition = new Position(50, 0, 50);
            const staleAnchorPlacement = new StructurePlacement({ documentId: 'removed-document-id', position: staleAnchorPosition });
            containingWorld.addStructurePlacement(staleAnchorPlacement);

            const { editorContext, tool } = makeToolFixture({
                registry, containingWorld, activeDocumentId: worldC.id, activeTitle: 'C', resolver
            });
            tool.onPointerMove({
                worldPosition: { x: staleAnchorPosition.x + 0.4, y: 0, z: staleAnchorPosition.z + 0.4 },
                pickedPlacement: { placementId: staleAnchorPlacement.id, point: { x: staleAnchorPosition.x, y: 0.5, z: staleAnchorPosition.z + 0.4 }, normal: { x: 1, y: 0, z: 0 }, distance: 1 }
            });
            assert(editorContext.structurePreview.position.x === 50 && editorContext.structurePreview.position.z === 50,
                '22. an ANCHOR placement whose Document has been removed from storage falls back to plain ground snapping rather than throwing');
        }

        // Ordinary ground placement — no neighbor at all — is unaffected.
        {
            const { world: worldD, document: docD } = buildUnitStructureDocument('D');
            saveDocument(storage, serializer, docD);
            const { editorContext, tool } = makeToolFixture({
                registry, containingWorld, activeDocumentId: worldD.id, activeTitle: 'D', resolver
            });
            tool.onPointerMove({ worldPosition: { x: 100.6, y: 0, z: -55.4 } });
            assert(editorContext.structurePreview.position.x === 101 && editorContext.structurePreview.position.z === -55,
                '23. plain ground placement, with no pickedPlacement at all, is byte-identical to pre-0.9.611 behavior');
        }
    }

    // ===============================================================
    // Section E — validation boundary: exact touching axis + grid-
    // rounded carried axis together still get caught by the unchanged
    // validator when they land on a THIRD structure
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const { world: worldA, document: docA } = buildUnitStructureDocument('A');
        const { world: worldC, document: docC } = buildUnitStructureDocument('C');
        const { world: worldB, document: docB } = buildUnitStructureDocument('B');
        saveDocument(storage, serializer, docA);
        saveDocument(storage, serializer, docC);
        saveDocument(storage, serializer, docB);

        const containingWorld = new World({});
        const anchorPosition = new Position(0, 0, 3.6); // non-integer Z, so the carried axis must round
        const placementA = new StructurePlacement({ documentId: worldA.id, position: anchorPosition });
        // C occupies exactly the footprint the carried axis will round
        // ONTO: touching X = 1 (A's own max.x), carried Z rounds 3.6 -> 4,
        // and C sits at Z=4 — a spot only reachable because BOTH axes
        // landed where they did, not either one alone.
        const placementC = new StructurePlacement({ documentId: worldC.id, position: new Position(1, 0, 4) });
        containingWorld.addStructurePlacement(placementA);
        containingWorld.addStructurePlacement(placementC);

        const { editorContext, tool } = makeToolFixture({
            registry, containingWorld, activeDocumentId: worldB.id, activeTitle: 'B', resolver
        });

        tool.onPointerMove({
            worldPosition: { x: 1.2, y: 0, z: 3.7 },
            pickedPlacement: { placementId: placementA.id, point: { x: 1, y: 0.5, z: 3.7 }, normal: { x: 1, y: 0, z: 0 }, distance: 1 }
        });
        assert(editorContext.structurePreview.position.x === 1 && editorContext.structurePreview.position.z === 4,
            '24. the snap computes exact touching X and grid-rounded carried Z exactly as designed, regardless of what occupies the result');
        assert(editorContext.structurePreview.valid === false,
            '25. the unchanged validator still refuses it — occupied by C — proving relative snapping never bypasses obstruction validation just because the position came from a snap rather than a raw hover');

        const beforeCount = containingWorld.getStructurePlacements().length;
        tool.onPointerDown();
        assert(containingWorld.getStructurePlacements().length === beforeCount,
            '26. onPointerDown() refuses to commit the invalid snapped position');
    }

    // ===============================================================
    // Section F — existing behavior preservation, proven at RUNTIME:
    // SelectionTool dragging an already-placed structure past a
    // neighbor's face never relative-snaps to it
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        // The neighbor is deliberately the NON-grid-aligned wide footprint
        // (global bounds x = 9.77..14.23 at position 10) — if relative
        // snapping ever leaked into the drag path, the candidate would
        // land on the non-integer 14.23. Plain grid snapping cannot ever
        // produce that value, so any INTEGER candidate near it proves the
        // drag path took the grid route, not a relative-snap route.
        const { world: worldA, document: docA } = buildWideOffsetStructureDocument('A');
        const { world: worldB, document: docB } = buildUnitStructureDocument('B');
        saveDocument(storage, serializer, docA);
        saveDocument(storage, serializer, docB);

        const containingWorld = new World({});
        const neighborPosition = new Position(10, 0, 10);
        const neighborPlacement = new StructurePlacement({ documentId: worldA.id, position: neighborPosition });
        const draggedPosition = new Position(0, 0, 0);
        const draggedPlacement = new StructurePlacement({ documentId: worldB.id, position: draggedPosition });
        containingWorld.addStructurePlacement(neighborPlacement);
        containingWorld.addStructurePlacement(draggedPlacement);

        const commandHistory = new CommandHistory({ world: containingWorld });
        const editorContext = new CreateEditorContextUseCase().execute();
        const structurePreviewUseCase = new StructurePreviewUseCase(editorContext);
        const selectionTool = new SelectionTool({
            world: containingWorld, registry, editorContext, commandHistory,
            structureResolver: resolver, structurePreviewUseCase,
            selectionUseCase: new SelectionUseCase(editorContext)
        });

        // Select, then click again to begin dragging (SelectionTool's own
        // documented "click the already-selected instance a second time"
        // gesture).
        selectionTool.onPointerDown({ pickedPlacement: { placementId: draggedPlacement.id }, modifiers: {} });
        selectionTool.onPointerDown({ pickedPlacement: { placementId: draggedPlacement.id }, modifiers: {} });

        // Drag the pointer to a hover right next to the neighbor's true
        // (non-integer) +X face at 14.23. Note: SelectionTool never
        // receives pickedPlacement.normal for the drag itself in
        // production (InputDispatcher only raycasts pointer position, and
        // the drag path only ever reads worldPosition — see
        // SelectionTool.onPointerMove's own source), so this exercises
        // exactly the real call shape.
        selectionTool.onPointerMove({ worldPosition: { x: 14.6, y: 0, z: 10.4 } });

        const preview = editorContext.structurePreview;
        assert(preview.position.x === 15 && preview.position.z === 10,
            '27. dragging an already-placed structure right next to a non-grid-aligned neighbor face (true flush contact at 14.23) still produces a plain GRID-snapped candidate (15, 10), never the relative-snap value 14.23 — SelectionTool\'s drag path is unaffected by 0.9.611, confirmed by actually running the drag, not just by reading its source');
        assert(preview.valid === true, '28. that plain-grid candidate does not overlap the neighbor (15 > 14.23) and is reported valid');

        selectionTool.onPointerUp();
        const movedPlacement = containingWorld.getStructurePlacement(draggedPlacement.id);
        assert(movedPlacement.position.x === 15 && movedPlacement.position.z === 10,
            '29. the committed drag lands at the same plain-grid position (15, 10), matching pre-0.9.611 behavior exactly — never the neighbor\'s own exact face');
    }

    // ===============================================================
    // Section G — state and side effects: no new persisted shape, no
    // extra fields survive a save/load round trip
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const { world: worldA, document: docA } = buildUnitStructureDocument('A');
        const { world: worldB, document: docB } = buildUnitStructureDocument('B');
        saveDocument(storage, serializer, docA);
        saveDocument(storage, serializer, docB);

        const containingWorld = new World({});
        const anchorPosition = new Position(60, 0, 60);
        const anchorPlacement = new StructurePlacement({ documentId: worldA.id, position: anchorPosition });
        containingWorld.addStructurePlacement(anchorPlacement);

        const { editorContext, tool } = makeToolFixture({
            registry, containingWorld, activeDocumentId: worldB.id, activeTitle: 'B', resolver
        });

        const pointerEvent = {
            worldPosition: { x: anchorPosition.x + 1.4, y: 0, z: anchorPosition.z + 0.2 },
            pickedPlacement: { placementId: anchorPlacement.id, point: { x: 61, y: 0.5, z: 60.2 }, normal: { x: 1, y: 0, z: 0 }, distance: 1 }
        };
        const anchorJsonBefore = JSON.stringify(anchorPlacement);
        for (let i = 0; i < 5; i++) {
            tool.onPointerMove(pointerEvent);
        }
        assert(JSON.stringify(anchorPlacement) === anchorJsonBefore,
            '30. repeated hovering against an anchor leaves the anchor StructurePlacement instance itself byte-identical — no snap-relationship field is ever attached to it');
        assert(containingWorld.getStructurePlacements().length === 1,
            '31. hovering alone never adds a placement — only onPointerDown() does');

        tool.onPointerDown();
        const containingDocument = new Document({ world: containingWorld, metadata: new DocumentMetadata({ title: 'container' }) });
        const roundTripped = serializer.deserialize(serializer.serialize(containingDocument));
        const committed = roundTripped.world.getStructurePlacements().find((p) => p.id !== anchorPlacement.id);
        assert(committed && typeof committed.position.x === 'number' && typeof committed.position.z === 'number',
            '32. the committed placement survives a real serialize/deserialize round trip as an ordinary StructurePlacement — position/rotation/documentId/id only, nothing snap-specific persisted');
        const committedKeys = Object.keys(committed.toJSON()).sort();
        const anchorKeys = Object.keys(anchorPlacement.toJSON()).sort();
        assert(JSON.stringify(committedKeys) === JSON.stringify(anchorKeys) && JSON.stringify(committedKeys) === JSON.stringify(['documentId', 'id', 'position', 'rotation']),
            '33. StructurePlacement\'s own serialized shape is exactly {id, documentId, position, rotation} for a relative-snapped placement, identical to the anchor\'s — no new snap-specific field (an "attachedTo", "snappedFace", or similar) was added to accommodate this feature');
    }

    // ===============================================================
    // Section H — product truthfulness across all four directions:
    // preview always equals committed position
    // ===============================================================
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const { world: worldA, document: docA } = buildUnitStructureDocument('A');
        saveDocument(storage, serializer, docA);

        const directions = [
            { normal: { x: 1, y: 0, z: 0 }, label: '+X' },
            { normal: { x: -1, y: 0, z: 0 }, label: '-X' },
            { normal: { x: 0, y: 0, z: 1 }, label: '+Z' },
            { normal: { x: 0, y: 0, z: -1 }, label: '-Z' }
        ];

        let n = 34;
        for (const dir of directions) {
            const { world: worldB, document: docB } = buildUnitStructureDocument(`mover-${dir.label}`);
            saveDocument(storage, serializer, docB);

            const containingWorld = new World({});
            const anchorPosition = new Position(70, 0, 70);
            const anchorPlacement = new StructurePlacement({ documentId: worldA.id, position: anchorPosition });
            containingWorld.addStructurePlacement(anchorPlacement);

            const { editorContext, tool } = makeToolFixture({
                registry, containingWorld, activeDocumentId: worldB.id, activeTitle: `mover-${dir.label}`, resolver
            });

            tool.onPointerMove({
                worldPosition: { x: anchorPosition.x, y: 0, z: anchorPosition.z },
                pickedPlacement: { placementId: anchorPlacement.id, point: { x: anchorPosition.x, y: 0.5, z: anchorPosition.z }, normal: dir.normal, distance: 1 }
            });
            const previewed = editorContext.structurePreview.position;
            tool.onPointerDown();
            const committed = containingWorld.getStructurePlacements().find((p) => p.id !== anchorPlacement.id);
            assert(committed.position.x === previewed.x && committed.position.z === previewed.z,
                `${n}. ${dir.label}: committed position exactly equals previewed position — no "looks flush, moves on click" discrepancy`);
            n++;
        }
    }

    console.log('✅ All StructureRelativeSnappingProductClosureAudit tests passed.');
    console.log('');
    console.log('CLASSIFICATION: ARC_CLOSED');
    console.log('');
    console.log('  Every user-journey branch the requesting brief named — flagship');
    console.log('  non-grid-aligned contact, all four horizontal faces, the grid/');
    console.log('  exact-contact hybrid, every fallback (including two 0.9.611');
    console.log('  itself never drove: an unresolvable anchor document and an');
    console.log('  unresolvable active document), the validation boundary under a');
    console.log('  combined exact+rounded overlap, existing SelectionTool drag');
    console.log('  behavior verified live rather than by source grep, absence of');
    console.log('  any new persisted state, and preview/commit truthfulness in all');
    console.log('  four directions — holds against the real, unmodified 0.9.611');
    console.log('  production code. The raycast single-hit-determinism question is');
    console.log('  already answered by StructureRelativeFaceSnappingRendering.');
    console.log('  test.js Section B and needed no new proof here.');
    console.log('');
    console.log('  No SNAPPING_GAP_REMAINS and no VALIDATION_BOUNDARY_GAP were');
    console.log('  found. Vertical (Y) structure-on-structure stacking remains an');
    console.log('  EXPECTED_BOUNDARY — calculateStructureStack() returns null for a');
    console.log('  top/bottom normal by design (PlacementPositionService.js\'s own');
    console.log('  0.9.611 header), matching calculateStructureGround()\'s standing');
    console.log('  "Y always 0, ground-plane only" invariant, and no user-facing');
    console.log('  problem surfaced here argues for changing that. This gap is');
    console.log('  CLOSED. Recommend no further milestone against it absent a new,');
    console.log('  independently observed product problem.');
}

run().catch((error) => {
    console.error('StructureRelativeSnappingProductClosureAudit.test.js FAILED:', error);
    process.exitCode = 1;
});
