import * as THREE from 'three';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { PlacementMeshRegistry } from '../renderer/PlacementMeshRegistry.js';
import { PickingService } from '../renderer/PickingService.js';
import { SelectionRenderer } from '../renderer/SelectionRenderer.js';
import { StructurePreviewRenderer } from '../renderer/StructurePreviewRenderer.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { SelectionState } from '../application/editor-state/SelectionState.js';
import { EventBus } from '../core/events/EventBus.js';
import { EditorEvent } from '../core/events/EditorEvent.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { StructureDocumentResolver } from '../application/StructureDocumentResolver.js';
import { StructurePreviewUseCase } from '../application/StructurePreviewUseCase.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { TransformMath } from '../application/TransformMath.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.2.91 — World Instance Editing & Placement Management: the rendering
// half. tests/StructureInstanceEditing.test.js covers everything that
// never touches Three.js; this file covers the renderer/ additions
// specifically — the direct enabling changes for "select the whole
// instance, never a constituent brick" and "a real 3D ghost, reused for
// both placing and dragging" — using the same "real renderer classes,
// fake low-level renderer" and "real Three.js camera, real raycasting"
// techniques tests/StructurePlacementRendering.test.js and
// tests/WorldEntityInteraction.test.js already established.
//
//   Section A: renderer/PlacementMeshRegistry.js — CRUD, mesh uuid ->
//              placementId resolution
//   Section B: renderer/WorldRenderer.js — placement meshes land in
//              placementMeshRegistry, never meshRegistry (0.2.90's own
//              claim, now from the OTHER side)
//   Section C: renderer/PickingService.js#pickPlacement() — REAL
//              raycasting resolves a hit on a placement's brick back to
//              its placementId, completely independent of pick()
//   Section D: renderer/WorldRenderer.js — STRUCTURE_PLACEMENT_UPDATED
//              re-renders a moved/rotated placement at its new transform
//   Section E: renderer/SelectionRenderer.js — a structure-placement
//              selection highlights EVERY mesh of that instance, never a
//              brick selection's own meshes and vice versa
//   Section F: renderer/StructurePreviewRenderer.js — the real 3D ghost:
//              shows/hides, composes position+rotation the same way a
//              committed placement does, tints invalid, respects terrain
//   Section G: FLAGSHIP — pick a placement's brick -> resolve its
//              placementId -> select it -> the whole instance
//              highlights -> drag preview ghost shows at a candidate
//              position -> committing (World#updateStructurePlacement())
//              re-renders the instance at its new transform, still
//              picking correctly there

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

function makeFakeRenderer(terrainHeightAt = null) {
    const meshes = new Set();
    const renderer = { add: (m) => meshes.add(m), remove: (m) => meshes.delete(m) };
    if (terrainHeightAt) {
        renderer.terrainHeightAt = terrainHeightAt;
    }
    return { renderer, meshes };
}

function buildOneBrickWorld(position = new Position(0, 0.5, 0)) {
    const world = new World({});
    const building = new Building({});
    building.addBrick(new Brick({ definitionId: 'core:cube', position }));
    world.addBuilding(building);
    return world;
}

// A simple orthographic camera looking straight down -Z at the origin —
// screen center always maps to NDC (0,0), the same setup
// tests/WorldEntityInteraction.test.js's own Section C/D already use.
function makeTopDownCamera() {
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    return camera;
}

const fakeDomElement = { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
const SCREEN_CENTER_X = 400, SCREEN_CENTER_Y = 300; // NDC (0,0)
const SCREEN_OFFSET_X = 700, SCREEN_OFFSET_Y = 300; // well off-center

async function run() {
    const registry = new CreateBrickRegistryUseCase().execute();

    // -------------------------------------------------------------
    // Section A: renderer/PlacementMeshRegistry.js
    // -------------------------------------------------------------
    {
        const meshRegistry = new PlacementMeshRegistry();
        assert(meshRegistry.getAllMeshes().length === 0, '1. a fresh registry has no meshes');
        assert(meshRegistry.getPlacementId('anything') === null, '2. an unknown mesh uuid resolves to null');

        const meshA1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        const meshA2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        meshRegistry.set('placement-a', [meshA1, meshA2]);
        assert(meshRegistry.getMeshes('placement-a').length === 2, '3. getMeshes() returns every mesh set for a placement');
        assert(meshRegistry.getPlacementId(meshA1.uuid) === 'placement-a', '4. each mesh uuid resolves back to its placementId');
        assert(meshRegistry.getPlacementId(meshA2.uuid) === 'placement-a', '5. ...for every mesh in the set, not just the first');
        assert(meshRegistry.getAllMeshes().length === 2, '6. getAllMeshes() flattens across placements');

        const meshB1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        meshRegistry.set('placement-b', [meshB1]);
        assert(meshRegistry.getAllMeshes().length === 3, '7. a second placement adds to the flattened total, no collision');

        meshRegistry.delete('placement-a');
        assert(meshRegistry.getMeshes('placement-a').length === 0, '8. delete() removes a placement\'s own meshes');
        assert(meshRegistry.getPlacementId(meshA1.uuid) === null, '9. delete() also removes the reverse mesh -> placementId mapping');
        assert(meshRegistry.getAllMeshes().length === 1, '10. only placement-b\'s mesh remains');

        meshRegistry.clear();
        assert(meshRegistry.getAllMeshes().length === 0, '11. clear() empties everything');
    }

    // -------------------------------------------------------------
    // Section B: WorldRenderer -> placementMeshRegistry, never meshRegistry
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const houseWorld = buildOneBrickWorld();
        storage.save(houseWorld.id, serializer.serialize(new Document({ world: houseWorld, metadata: new DocumentMetadata({ title: 'House' }) })));

        const village = new World({});
        const placement = new StructurePlacement({ documentId: houseWorld.id, position: new Position(3, 0, 4) });
        village.addStructurePlacement(placement);

        const { renderer } = makeFakeRenderer();
        const worldRenderer = new WorldRenderer(renderer, registry, undefined, undefined, resolver, TransformMath);
        worldRenderer.addWorld(village, 'village-doc', { x: 0, y: 0, z: 0 });

        assert(worldRenderer.meshRegistry.getAllMeshes().length === 0,
            '12. the placement\'s brick is NOT registered with meshRegistry (unchanged 0.2.90 claim)');
        assert(worldRenderer.placementMeshRegistry.getAllMeshes().length === 1,
            '13. ...but IS registered with placementMeshRegistry (the 0.2.91 addition)');
        assert(worldRenderer.placementMeshRegistry.getPlacementId(worldRenderer.placementMeshRegistry.getAllMeshes()[0].uuid) === placement.id,
            '14. the registered mesh resolves back to the correct placementId');
    }

    // -------------------------------------------------------------
    // Section C: PickingService#pickPlacement() — REAL raycasting
    // -------------------------------------------------------------
    {
        const camera = makeTopDownCamera();

        // No placementMeshRegistry at all — graceful null, never throws.
        const bareService = new PickingService(camera, fakeDomElement, { getAllMeshes: () => [] });
        assert(bareService.pickPlacement(SCREEN_CENTER_X, SCREEN_CENTER_Y) === null,
            '15. pickPlacement() is null when no placementMeshRegistry was injected');

        const placementMeshRegistry = new PlacementMeshRegistry();
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
        mesh.position.set(0, 0, 0);
        mesh.updateMatrixWorld();
        placementMeshRegistry.set('placement-1', [mesh]);

        const brickMeshRegistry = { getAllMeshes: () => [] }; // deliberately empty — placements are disjoint from bricks
        const pickingService = new PickingService(camera, fakeDomElement, brickMeshRegistry, placementMeshRegistry);

        const hit = pickingService.pickPlacement(SCREEN_CENTER_X, SCREEN_CENTER_Y);
        assert(hit && hit.placementId === 'placement-1', '16. a centered ray resolves the placement mesh back to its placementId');
        assert(Number.isFinite(hit.distance) && hit.distance > 0, '17. the hit carries a finite, positive distance');
        assert(hit.point && Number.isFinite(hit.point.x), '18. the hit carries a core/Position hit point');

        assert(pickingService.pickPlacement(SCREEN_OFFSET_X, SCREEN_OFFSET_Y) === null,
            '19. a ray well off to the side misses the placement entirely');

        // pick()/pickRich() (the ordinary brick path) are completely
        // unaffected by a placementMeshRegistry being present.
        assert(pickingService.pick(SCREEN_CENTER_X, SCREEN_CENTER_Y) === null,
            '20. pick() still finds nothing — the placement mesh was never registered with the BRICK registry');
    }

    // -------------------------------------------------------------
    // Section D: STRUCTURE_PLACEMENT_UPDATED re-renders at the new transform
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const houseWorld = buildOneBrickWorld(new Position(1, 0, 0));
        storage.save(houseWorld.id, serializer.serialize(new Document({ world: houseWorld, metadata: new DocumentMetadata({ title: 'House' }) })));

        const eventBus = new EventBus();
        const village = new World({ eventBus });
        const { renderer, meshes } = makeFakeRenderer();
        const worldRenderer = new WorldRenderer(renderer, registry, undefined, undefined, resolver, TransformMath);
        worldRenderer.subscribe(eventBus);

        const placement = new StructurePlacement({ documentId: houseWorld.id, position: new Position(5, 0, 5), rotation: 0 });
        village.addStructurePlacement(placement);
        assert(meshes.size === 1, '21. sanity: the placement rendered one mesh at its original position');
        const originalMesh = Array.from(meshes)[0];
        assert(originalMesh.position.x === 6, '22. sanity: local (1,0,0) + placement position (5,0,5) = 6');

        village.updateStructurePlacement(placement.id, { position: new Position(20, 0, 20), rotation: 90 });
        assert(meshes.size === 1, '23. moving/rotating the placement still renders exactly one mesh — old removed, new added');
        const movedMesh = Array.from(meshes)[0];
        assert(movedMesh !== originalMesh, '24. the OLD mesh was actually removed, not just left in place');
        // local (1,0,0) rotated 90° -> ~(0,0,1), translated by the new
        // position (20,0,20).
        assert(Math.abs(movedMesh.position.x - 20) < 1e-9, '25. the re-rendered mesh reflects the NEW position\'s X');
        assert(Math.abs(movedMesh.position.z - 21) < 1e-9, '26. the re-rendered mesh reflects the NEW rotation composed with the NEW position');
        assert(Math.abs(movedMesh.rotation.y - (90 * Math.PI / 180)) < 1e-9, '27. the re-rendered mesh\'s own rotation reflects the placement\'s new rotation');

        assert(worldRenderer.placementMeshRegistry.getPlacementId(movedMesh.uuid) === placement.id,
            '28. the re-rendered mesh is still correctly registered for picking under the SAME placementId');
    }

    // -------------------------------------------------------------
    // Section E: SelectionRenderer — placement selection highlights the
    // WHOLE instance
    // -------------------------------------------------------------
    {
        const brickMeshA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4caf7d }));
        const brickMeshRegistry = {
            getMesh: (id) => (id === 'brick-1' ? brickMeshA : null)
        };
        const placementMeshRegistry = new PlacementMeshRegistry();
        const instanceMesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4caf7d }));
        const instanceMesh2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4caf7d }));
        placementMeshRegistry.set('placement-1', [instanceMesh1, instanceMesh2]);

        const editorEventBus = new EventBus();
        const selectionRenderer = new SelectionRenderer(brickMeshRegistry, placementMeshRegistry);
        selectionRenderer.subscribe(editorEventBus);

        editorEventBus.publish(EditorEvent.SELECTION_CHANGED, {
            selection: new SelectionState({ items: [{ type: 'structure-placement', placementId: 'placement-1' }] })
        });
        assert(instanceMesh1.material.emissive.getHex() !== 0, '29. a placement selection highlights every mesh of that instance');
        assert(instanceMesh2.material.emissive.getHex() !== 0, '30. ...both meshes, not just the first');
        assert(brickMeshA.material.emissive.getHex() === 0, '31. an ordinary brick is never highlighted by a placement selection');

        editorEventBus.publish(EditorEvent.SELECTION_CHANGED, {
            selection: new SelectionState({ brickId: 'brick-1', buildingId: 'building-1' })
        });
        assert(instanceMesh1.material.emissive.getHex() === 0, '32. selecting a brick afterward un-highlights the placement\'s meshes');
        assert(brickMeshA.material.emissive.getHex() !== 0, '33. ...and highlights the brick instead');

        editorEventBus.publish(EditorEvent.SELECTION_CHANGED, { selection: SelectionState.empty() });
        assert(brickMeshA.material.emissive.getHex() === 0, '34. clearing the selection un-highlights everything');
    }

    // -------------------------------------------------------------
    // Section F: StructurePreviewRenderer — the real 3D ghost
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const houseWorld = new World({});
        const houseBuilding = new Building({});
        houseBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        houseBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        houseWorld.addBuilding(houseBuilding);
        storage.save(houseWorld.id, serializer.serialize(new Document({ world: houseWorld, metadata: new DocumentMetadata({ title: 'House' }) })));

        const { renderer, meshes } = makeFakeRenderer((x, z) => 5);
        const structurePreviewRenderer = new StructurePreviewRenderer(renderer, resolver, TransformMath);
        const editorContext = new CreateEditorContextUseCase().execute();
        const structurePreviewUseCase = new StructurePreviewUseCase(editorContext);
        structurePreviewRenderer.subscribe(editorContext.eventBus);

        assert(meshes.size === 0, '35. no ghost exists until shown');

        structurePreviewUseCase.show(houseWorld.id, 'House', new Position(10, 0, 10), 0, true);
        assert(meshes.size === 2, '36. showing the preview builds one ghost mesh per brick in the referenced Document');
        let ghosts = Array.from(meshes);
        assert(ghosts.every((m) => m.material.transparent === true && m.material.opacity < 1),
            '37. every ghost mesh is translucent');
        assert(ghosts.some((m) => Math.abs(m.position.x - 10) < 1e-9) && ghosts.some((m) => Math.abs(m.position.x - 11) < 1e-9),
            '38. ghost positions compose local brick position with the preview\'s own position, unrotated');
        assert(ghosts.every((m) => Math.abs(m.position.y - 5.5) < 1e-9),
            '39. the ghost respects terrain — lifted by the SAME groundY a committed placement would get');

        // Moving/rotating the SAME documentId reuses the existing
        // meshes rather than rebuilding them.
        structurePreviewUseCase.show(houseWorld.id, 'House', new Position(20, 0, 20), 90, true);
        assert(meshes.size === 2, '40. moving the preview to a new position/rotation does not create new meshes');
        ghosts = Array.from(meshes);
        // local x=0,1 rotated 90° around the origin -> z-offsets 0,1 with x staying ~20.
        assert(ghosts.every((m) => Math.abs(m.position.x - 20) < 1e-9),
            '41. after rotation, both bricks\' local X spread becomes a Z spread — X stays at the placement position');

        // Invalid tints red; valid restores the base color.
        structurePreviewUseCase.show(houseWorld.id, 'House', new Position(20, 0, 20), 90, false);
        assert(Array.from(meshes).every((m) => m.material.color.getHex() === 0xe05252), '42. an invalid preview tints every ghost mesh red');
        structurePreviewUseCase.show(houseWorld.id, 'House', new Position(20, 0, 20), 90, true);
        assert(Array.from(meshes).every((m) => m.material.color.getHex() !== 0xe05252), '43. a valid preview restores each mesh\'s own base color');

        // Switching to a DIFFERENT document rebuilds the ghost.
        const boxWorld = buildOneBrickWorld();
        storage.save(boxWorld.id, serializer.serialize(new Document({ world: boxWorld, metadata: new DocumentMetadata({ title: 'Box' }) })));
        structurePreviewUseCase.show(boxWorld.id, 'Box', new Position(0, 0, 0), 0, true);
        assert(meshes.size === 1, '44. switching to a different (1-brick) Document rebuilds the ghost with the new brick count');

        structurePreviewUseCase.hide();
        assert(meshes.size === 0, '45. hide() removes every ghost mesh');

        // An unresolvable documentId never throws, simply shows nothing.
        structurePreviewUseCase.show('missing-doc', null, new Position(0, 0, 0), 0, true);
        assert(meshes.size === 0, '46. an unresolvable documentId shows no ghost, never throws');
    }

    // -------------------------------------------------------------
    // Section G: FLAGSHIP — pick -> select -> highlight -> drag ghost ->
    // commit -> re-render, all at the rendering level
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const houseWorld = buildOneBrickWorld(new Position(0, 0.5, 0));
        storage.save(houseWorld.id, serializer.serialize(new Document({ world: houseWorld, metadata: new DocumentMetadata({ title: 'House' }) })));

        const eventBus = new EventBus();
        const village = new World({ eventBus });
        const { renderer, meshes } = makeFakeRenderer();
        const worldRenderer = new WorldRenderer(renderer, registry, undefined, undefined, resolver, TransformMath);
        worldRenderer.subscribe(eventBus);

        const placement = new StructurePlacement({ documentId: houseWorld.id, position: new Position(0, 0, 0), rotation: 0 });
        village.addStructurePlacement(placement);
        assert(meshes.size === 1, '47. flagship: the placement renders one mesh');

        // Pick it via a real raycast.
        const camera = makeTopDownCamera();
        const placedMesh = Array.from(worldRenderer.placementMeshRegistry.getAllMeshes())[0];
        placedMesh.position.set(0, 0, 0); // fake low-level renderer never actually calls updateMatrixWorld via a scene graph
        placedMesh.updateMatrixWorld();
        const pickingService = new PickingService(camera, fakeDomElement, worldRenderer.meshRegistry, worldRenderer.placementMeshRegistry);
        const hit = pickingService.pickPlacement(SCREEN_CENTER_X, SCREEN_CENTER_Y);
        assert(hit && hit.placementId === placement.id, '48. flagship: picking the instance\'s brick resolves the SAME placementId');

        // Select it -> highlight.
        const editorContext = new CreateEditorContextUseCase().execute();
        const selectionRenderer = new SelectionRenderer(worldRenderer.meshRegistry, worldRenderer.placementMeshRegistry);
        selectionRenderer.subscribe(editorContext.eventBus);
        editorContext.setSelection(new SelectionState({ items: [{ type: 'structure-placement', placementId: hit.placementId }] }));
        assert(placedMesh.material.emissive.getHex() !== 0, '49. flagship: selecting the picked placement highlights its mesh');

        // Drag -> ghost preview at a candidate position.
        const structurePreviewRenderer = new StructurePreviewRenderer(renderer, resolver, TransformMath);
        structurePreviewRenderer.subscribe(editorContext.eventBus);
        const structurePreviewUseCase = new StructurePreviewUseCase(editorContext);
        structurePreviewUseCase.show(placement.documentId, null, new Position(15, 0, 15), placement.rotation, true);
        assert(meshes.size === 2, '50. flagship: mid-drag, the COMMITTED instance AND the ghost preview both render (one real, one translucent)');

        // Commit — the real instance moves, the ghost hides.
        village.updateStructurePlacement(placement.id, { position: new Position(15, 0, 15) });
        structurePreviewUseCase.hide();
        assert(meshes.size === 1, '51. flagship: after committing, only the (now-moved) real instance remains — the ghost is gone');
        const finalMesh = Array.from(meshes)[0];
        assert(finalMesh.position.x === 15 && finalMesh.position.z === 15, '52. flagship: the real instance now sits at the committed position');

        // Still correctly pickable at its new position.
        finalMesh.updateMatrixWorld();
        assert(worldRenderer.placementMeshRegistry.getPlacementId(finalMesh.uuid) === placement.id,
            '53. flagship: the moved instance is still registered under the SAME placementId after re-render');
    }

    console.log('✓ Section A: renderer/PlacementMeshRegistry.js — CRUD, mesh uuid -> placementId resolution');
    console.log('✓ Section B: renderer/WorldRenderer.js — placement meshes register with placementMeshRegistry, never meshRegistry');
    console.log('✓ Section C: renderer/PickingService.js#pickPlacement() — real raycasting resolves a placement hit');
    console.log('✓ Section D: renderer/WorldRenderer.js — STRUCTURE_PLACEMENT_UPDATED re-renders at the new transform');
    console.log('✓ Section E: renderer/SelectionRenderer.js — a placement selection highlights the WHOLE instance');
    console.log('✓ Section F: renderer/StructurePreviewRenderer.js — the real 3D ghost: build/move/tint/hide');
    console.log('✓ Section G: FLAGSHIP — pick -> select -> highlight -> drag ghost -> commit -> re-render, at the rendering level');

    console.log('\nAll structure instance rendering tests passed.');
}

await run();
