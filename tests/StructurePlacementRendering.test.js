import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { StructurePlacement } from '../core/StructurePlacement.js';
import { EventBus } from '../core/events/EventBus.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { StructureDocumentResolver } from '../application/StructureDocumentResolver.js';
import { TransformMath } from '../application/TransformMath.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.2.90 — Structure Placement & World Instances: the rendering half.
// tests/StructurePlacement.test.js covers everything that never touches
// Three.js; this file covers renderer/WorldRenderer.js specifically,
// using the exact "real WorldRenderer, minimal fake low-level renderer"
// technique tests/ForkRenderSync.test.js and tests/WorldGroundTerrain.test.js
// already established — real Three.js meshes with assertable positions,
// no WebGL/browser required.
//
//   Section A: addWorld() renders a placement's bricks composed with its
//              own position/rotation, THEN the containing document's
//              own offset/terrain groundY — "the placement transforms
//              the entire structure," one rigid unit
//   Section B: the SAME document placed twice never collides — two
//              independent sets of meshes, proving the composite
//              placementId-keyed tracking (never brick-id-keyed) works
//   Section C: placement meshes are added to the low-level renderer but
//              deliberately NEVER registered with meshRegistry — not
//              pickable yet, named and deferred to 0.2.91
//   Section D: removeWorld() removes every placement mesh it added
//   Section E: event-driven (Editor) mode — STRUCTURE_PLACEMENT_ADDED/
//              REMOVED render and remove meshes the same way
//              BUILDING_ADDED/REMOVED already do
//   Section F: graceful absence — no resolver, or a resolver that can't
//              resolve the documentId, renders nothing and never throws
//   Section G: FLAGSHIP — a Village World with House placed at A and at
//              B with different rotations renders two independent,
//              correctly transformed instances, matching
//              tests/StructurePlacement.test.js's own Section H at the
//              domain level

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

async function run() {
    const registry = new CreateBrickRegistryUseCase().execute();

    // -------------------------------------------------------------
    // Section A: addWorld() — position + rotation composition
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const houseWorld = buildOneBrickWorld(new Position(1, 0, 0));
        storage.save(houseWorld.id, serializer.serialize(new Document({ world: houseWorld, metadata: new DocumentMetadata({ title: 'House' }) })));

        const village = new World({});
        village.addStructurePlacement(new StructurePlacement({
            documentId: houseWorld.id, position: new Position(50, 0, 50), rotation: 90
        }));

        const { renderer, meshes } = makeFakeRenderer();
        const worldRenderer = new WorldRenderer(renderer, registry, undefined, undefined, resolver, TransformMath);
        worldRenderer.addWorld(village, 'village-doc', { x: 0, y: 0, z: 0 });

        assert(meshes.size === 1, '1. one placement, one brick -> one mesh added');
        const mesh = Array.from(meshes)[0];
        // Local brick position (1, 0, 0) rotated 90° around the origin
        // (TransformMath.rotatePointAroundPivotY) lands at ~(0, 0, 1),
        // then translated by the placement's own position (50, 0, 50).
        assert(Math.abs(mesh.position.x - 50) < 1e-9, '2. rotated brick X composes correctly with the placement position');
        assert(Math.abs(mesh.position.z - 51) < 1e-9, '3. rotated brick Z composes correctly with the placement position');
        assert(Math.abs(mesh.rotation.y - (90 * Math.PI / 180)) < 1e-9,
            '4. mesh rotation is brick.rotation (0) + placement.rotation (90), converted to radians');
    }

    // -------------------------------------------------------------
    // Section B: the same Document placed twice
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const houseWorld = buildOneBrickWorld(new Position(0, 0.5, 0));
        storage.save(houseWorld.id, serializer.serialize(new Document({ world: houseWorld, metadata: new DocumentMetadata({ title: 'House' }) })));

        const village = new World({});
        village.addStructurePlacement(new StructurePlacement({ documentId: houseWorld.id, position: new Position(0, 0, 0) }));
        village.addStructurePlacement(new StructurePlacement({ documentId: houseWorld.id, position: new Position(20, 0, 0) }));

        const { renderer, meshes } = makeFakeRenderer();
        const worldRenderer = new WorldRenderer(renderer, registry, undefined, undefined, resolver, TransformMath);
        worldRenderer.addWorld(village, 'village-doc', { x: 0, y: 0, z: 0 });

        assert(meshes.size === 2, '5. the same Document placed twice renders TWO independent mesh sets, no id collision');
        const xs = Array.from(meshes).map((m) => m.position.x).sort((a, b) => a - b);
        assert(xs[0] === 0 && xs[1] === 20, '6. each instance sits at its own placement position');
    }

    // -------------------------------------------------------------
    // Section C: placement meshes are not pickable via meshRegistry
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const houseWorld = buildOneBrickWorld();
        storage.save(houseWorld.id, serializer.serialize(new Document({ world: houseWorld, metadata: new DocumentMetadata({ title: 'House' }) })));

        const village = new World({});
        const villageBuilding = new Building({});
        villageBuilding.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(9, 0.5, 9) }));
        village.addBuilding(villageBuilding);
        village.addStructurePlacement(new StructurePlacement({ documentId: houseWorld.id, position: new Position(0, 0, 0) }));

        const { renderer, meshes } = makeFakeRenderer();
        const worldRenderer = new WorldRenderer(renderer, registry, undefined, undefined, resolver, TransformMath);
        worldRenderer.addWorld(village, 'village-doc', { x: 0, y: 0, z: 0 });

        assert(meshes.size === 2, '7. sanity: one ordinary brick + one placement brick were both added to the scene');
        assert(worldRenderer.meshRegistry.getAllMeshes().length === 1,
            '8. only the ORDINARY building brick is registered with meshRegistry — the placement brick is visible but not pickable (0.2.91)');
    }

    // -------------------------------------------------------------
    // Section D: removeWorld() cleans up placement meshes
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const houseWorld = buildOneBrickWorld();
        storage.save(houseWorld.id, serializer.serialize(new Document({ world: houseWorld, metadata: new DocumentMetadata({ title: 'House' }) })));

        const village = new World({});
        village.addStructurePlacement(new StructurePlacement({ documentId: houseWorld.id, position: new Position(0, 0, 0) }));

        const { renderer, meshes } = makeFakeRenderer();
        const worldRenderer = new WorldRenderer(renderer, registry, undefined, undefined, resolver, TransformMath);
        worldRenderer.addWorld(village, 'village-doc', { x: 0, y: 0, z: 0 });
        assert(meshes.size === 1, '9. sanity: the placement rendered one mesh');

        worldRenderer.removeWorld(village, 'village-doc');
        assert(meshes.size === 0, '10. removeWorld() removes every placement mesh it added, not just building meshes');
    }

    // -------------------------------------------------------------
    // Section E: event-driven (Editor) mode
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const resolver = new StructureDocumentResolver(storage, serializer);

        const houseWorld = buildOneBrickWorld(new Position(2, 0, 0));
        storage.save(houseWorld.id, serializer.serialize(new Document({ world: houseWorld, metadata: new DocumentMetadata({ title: 'House' }) })));

        const eventBus = new EventBus();
        const village = new World({ eventBus });
        const { renderer, meshes } = makeFakeRenderer();
        const worldRenderer = new WorldRenderer(renderer, registry, undefined, undefined, resolver, TransformMath);
        worldRenderer.subscribe(eventBus);

        const placement = new StructurePlacement({ documentId: houseWorld.id, position: new Position(5, 0, 5) });
        village.addStructurePlacement(placement);
        assert(meshes.size === 1, '11. STRUCTURE_PLACEMENT_ADDED (event-driven mode) renders the placement\'s bricks');
        const mesh = Array.from(meshes)[0];
        assert(mesh.position.x === 7 && mesh.position.z === 5,
            '12. event-driven rendering composes the same way as addWorld() — local (2,0,0) + placement position (5,0,5)');

        village.removeStructurePlacement(placement.id);
        assert(meshes.size === 0, '13. STRUCTURE_PLACEMENT_REMOVED removes the rendered meshes');
    }

    // -------------------------------------------------------------
    // Section F: graceful absence
    // -------------------------------------------------------------
    {
        const village = new World({});
        village.addStructurePlacement(new StructurePlacement({ documentId: 'anything', position: new Position(0, 0, 0) }));

        // No resolver at all.
        {
            const { renderer, meshes } = makeFakeRenderer();
            const worldRenderer = new WorldRenderer(renderer, registry);
            worldRenderer.addWorld(village, 'village-doc', { x: 0, y: 0, z: 0 });
            assert(meshes.size === 0, '14. no structureResolver injected -> no placement meshes, no throw');
        }

        // A resolver that cannot resolve the documentId.
        {
            const storage = new InMemoryStorageProvider();
            const resolver = new StructureDocumentResolver(storage, new DocumentSerializer());
            const { renderer, meshes } = makeFakeRenderer();
            const worldRenderer = new WorldRenderer(renderer, registry, undefined, undefined, resolver, TransformMath);
            worldRenderer.addWorld(village, 'village-doc', { x: 0, y: 0, z: 0 });
            assert(meshes.size === 0, '15. an unresolvable documentId -> no placement meshes, no throw');
        }
    }

    // -------------------------------------------------------------
    // Section G: FLAGSHIP — rendering-level counterpart to
    // tests/StructurePlacement.test.js's own Section H
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

        const village = new World({});
        village.addStructurePlacement(new StructurePlacement({ documentId: houseWorld.id, position: new Position(100, 0, 200), rotation: 0 }));
        village.addStructurePlacement(new StructurePlacement({ documentId: houseWorld.id, position: new Position(160, 0, 240), rotation: 90 }));

        const { renderer, meshes } = makeFakeRenderer((x, z) => 5); // flat, nonzero terrain everywhere
        const worldRenderer = new WorldRenderer(renderer, registry, undefined, undefined, resolver, TransformMath);
        worldRenderer.addWorld(village, 'village-doc', { x: 0, y: 0, z: 0 });

        assert(meshes.size === 4, '16. flagship: two House instances (2 bricks each) render 4 meshes total');
        const allY = Array.from(meshes).map((m) => m.position.y);
        assert(allY.every((y) => Math.abs(y - 5.5) < 1e-9),
            '17. flagship: every brick (Y=0.5 locally) is lifted by the SAME terrain groundY (5), rigidly, matching 0.2.76\'s own rigid-whole-building rule');

        const xsSorted = Array.from(meshes).map((m) => m.position.x).sort((a, b) => a - b);
        // Instance A (rotation 0): bricks at local x=0,1 -> world x=100,101.
        // Instance B (rotation 90): bricks at local x=0,1 -> rotated to
        // z-offsets 0,1 with x staying ~160 -> world x=160,160.
        assert(xsSorted[0] === 100 && xsSorted[1] === 101, '18. flagship: instance A\'s two bricks sit at its own unrotated X positions');
        assert(Math.abs(xsSorted[2] - 160) < 1e-9 && Math.abs(xsSorted[3] - 160) < 1e-9,
            '19. flagship: instance B\'s two bricks share the same X — rotated 90°, their local X spread became a Z spread instead');
    }

    console.log('✓ Section A: addWorld() — position + rotation composition against the containing document\'s own offset/terrain');
    console.log('✓ Section B: the same Document placed twice renders two independent instances, no id collision');
    console.log('✓ Section C: placement meshes render but are deliberately not registered with meshRegistry (not pickable yet)');
    console.log('✓ Section D: removeWorld() cleans up every placement mesh it added');
    console.log('✓ Section E: event-driven (Editor) mode renders/removes placements via STRUCTURE_PLACEMENT_ADDED/REMOVED');
    console.log('✓ Section F: graceful absence — no resolver, or an unresolvable documentId, never throws');
    console.log('✓ Section G: FLAGSHIP — two House instances at different positions/rotations render correctly and independently');

    console.log('\nAll structure placement rendering tests passed.');
}

await run();
