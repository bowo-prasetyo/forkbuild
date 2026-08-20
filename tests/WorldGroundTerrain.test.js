import {
    terrainHeightAt, DEFAULT_WORLD_SEED, TERRAIN_HEIGHT_BOUND
} from '../core/TerrainHeightField.js';
import {
    tileCoordinateForPosition, tileKey, tileCenter, tilesWithinRadius,
    TERRAIN_TILE_SIZE, DEFAULT_STREAMING_RADIUS
} from '../core/TerrainTiling.js';
import { TerrainStreamingController } from '../renderer/TerrainStreamingController.js';
import { WorldRenderer } from '../renderer/WorldRenderer.js';
import { PreviewRenderer } from '../renderer/PreviewRenderer.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { PreviewState } from '../application/editor-state/PreviewState.js';
import { EventBus } from '../core/events/EventBus.js';
import { EditorEvent } from '../core/events/EditorEvent.js';

// 0.2.76 — World Ground & Terrain Foundation.
//
//   Section A: core/TerrainHeightField.js — pure, deterministic elevation
//   Section B: core/TerrainTiling.js — pure tile-grid math
//   Section C: renderer/TerrainStreamingController.js — camera-follow load/unload
//   Section D: renderer/WorldRenderer.js — building ground placement
//   Section E: FLAGSHIP — the design doc's own scripted scenario
//
// Central architectural claim under test throughout: terrain is a PURE
// function of world coordinates and a single shared world seed, never
// persisted state — see core/TerrainHeightField.js's own header. Nothing
// in this file ever asserts on a hardcoded elevation VALUE (the exact
// noise shape is an implementation detail); every assertion is about
// determinism, continuity, boundedness, and streaming correctness —
// properties that hold regardless of how the noise function itself is
// tuned.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

async function runTests() {
    // -------------------------------------------------------------
    // Section A: core/TerrainHeightField.js
    // -------------------------------------------------------------
    {
        const h1 = terrainHeightAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        const h2 = terrainHeightAt(DEFAULT_WORLD_SEED, 123.456, -789.01);
        assert(h1 === h2, '1. Same seed + same (x, z) always produces the exact same elevation');

        const hOrigin1 = terrainHeightAt(DEFAULT_WORLD_SEED, 0, 0);
        const hOrigin2 = terrainHeightAt(DEFAULT_WORLD_SEED, 0, 0);
        assert(hOrigin1 === hOrigin2, '2. Determinism holds at the origin too, not just an arbitrary point');

        // Boundedness: no sample anywhere exceeds the sum of the
        // octaves' own amplitudes — a real vertical bound, never NaN/Infinity.
        let maxAbs = 0;
        for (let i = 0; i < 200; i++) {
            const x = (i - 100) * 37.3;
            const z = (i - 100) * -19.7;
            const h = terrainHeightAt(DEFAULT_WORLD_SEED, x, z);
            assert(Number.isFinite(h), `3. terrainHeightAt(${x}, ${z}) is a finite number, never NaN/Infinity`);
            maxAbs = Math.max(maxAbs, Math.abs(h));
        }
        assert(maxAbs <= TERRAIN_HEIGHT_BOUND + 1e-9, '4. Every sampled elevation stays within TERRAIN_HEIGHT_BOUND');

        // Large-scale continuity: a 1-unit step never produces a wild
        // jump — "geography, not noise" (docs/Roadmap.md, 0.2.76).
        let maxStepDelta = 0;
        for (let x = 0; x < 500; x += 5) {
            const a = terrainHeightAt(DEFAULT_WORLD_SEED, x, 42);
            const b = terrainHeightAt(DEFAULT_WORLD_SEED, x + 1, 42);
            maxStepDelta = Math.max(maxStepDelta, Math.abs(b - a));
        }
        assert(maxStepDelta < 1.0, `5. FLAGSHIP-adjacent: elevation changes smoothly across a 1-unit step (max delta ${maxStepDelta.toFixed(4)} < 1.0) — this is geography, not spiky noise`);

        // A different seed produces a genuinely different field.
        const otherSeed = DEFAULT_WORLD_SEED ^ 0x5bd1e995;
        let differences = 0;
        for (let i = 0; i < 20; i++) {
            const x = i * 53;
            const z = i * -31;
            if (terrainHeightAt(DEFAULT_WORLD_SEED, x, z) !== terrainHeightAt(otherSeed, x, z)) {
                differences++;
            }
        }
        assert(differences > 15, '6. A different world seed produces a genuinely different terrain field at the same coordinates');
    }

    // -------------------------------------------------------------
    // Section B: core/TerrainTiling.js
    // -------------------------------------------------------------
    {
        assert(
            JSON.stringify(tileCoordinateForPosition(0, 0)) === JSON.stringify({ tx: 0, tz: 0 }),
            '7. The origin belongs to tile (0, 0)'
        );
        assert(
            JSON.stringify(tileCoordinateForPosition(TERRAIN_TILE_SIZE + 1, -1)) === JSON.stringify({ tx: 1, tz: -1 }),
            '8. tileCoordinateForPosition floors correctly on both sides of zero'
        );
        assert(tileKey(3, -4) === '3,-4', '9. tileKey is a stable, human-legible string');

        const center = tileCenter(0, 0);
        assert(center.x === TERRAIN_TILE_SIZE / 2 && center.z === TERRAIN_TILE_SIZE / 2, '10. tileCenter(0,0) sits at half a tile size from the origin');

        const tilesA = tilesWithinRadius(1000, -500, 80);
        const tilesB = tilesWithinRadius(1000, -500, 80);
        assert(JSON.stringify(tilesA) === JSON.stringify(tilesB), '11. tilesWithinRadius is deterministic: identical center+radius always produces an identical ARRAY, element for element');
        assert(tilesA.length > 0, '12. A positive radius always covers at least one tile');
        assert(
            tilesA.some((t) => t.tx === tileCoordinateForPosition(1000, -500).tx && t.tz === tileCoordinateForPosition(1000, -500).tz),
            '13. The tile directly under the query center is always included'
        );

        const smallRing = tilesWithinRadius(0, 0, 40);
        const largeRing = tilesWithinRadius(0, 0, 400);
        assert(largeRing.length > smallRing.length, '14. A larger radius covers strictly more tiles than a smaller one around the same center');
        const smallKeys = new Set(smallRing.map((t) => tileKey(t.tx, t.tz)));
        const largeKeys = new Set(largeRing.map((t) => tileKey(t.tx, t.tz)));
        assert([...smallKeys].every((k) => largeKeys.has(k)),
            '15. Every tile in the smaller ring is also present in the larger ring around the same center — growing the radius never drops a tile');
    }

    // -------------------------------------------------------------
    // Section C: renderer/TerrainStreamingController.js
    // -------------------------------------------------------------
    {
        function fakeSink() {
            const added = new Set();
            return {
                add: (obj) => added.add(obj),
                remove: (obj) => added.delete(obj),
                get size() { return added.size; },
                has: (obj) => added.has(obj)
            };
        }
        function fakeFactory() {
            let calls = 0;
            const fn = (tx, tz) => { calls++; return { tx, tz }; };
            return { fn, get calls() { return calls; } };
        }

        // Initial load matches tilesWithinRadius() exactly.
        const sink1 = fakeSink();
        const factory1 = fakeFactory();
        const controller1 = new TerrainStreamingController(sink1, factory1.fn, { streamingRadius: 80 });
        controller1.update(0, 0, true);
        const expectedInitial = tilesWithinRadius(0, 0, 80, TERRAIN_TILE_SIZE);
        assert(controller1.loadedTileCount === expectedInitial.length, '16. Initial update() loads exactly the tiles tilesWithinRadius() computes for that position/radius');
        assert(sink1.size === expectedInitial.length, '17. Every loaded tile was actually handed to the sink');

        // Moving the camera unloads tiles that fall out of radius and
        // loads new ones that enter it — no leaked "old" tiles.
        controller1.update(2000, 2000, true);
        const expectedAfterMove = tilesWithinRadius(2000, 2000, 80, TERRAIN_TILE_SIZE);
        assert(controller1.loadedTileCount === expectedAfterMove.length, '18. After a large camera move, the loaded set matches the NEW position\'s tile ring exactly');
        assert(sink1.size === expectedAfterMove.length, '19. No stale tile object is left behind in the sink after moving far away');

        // Determinism / no drift: returning to a previous position
        // reproduces the exact same tile set, not a superset or a
        // differently-ordered one.
        controller1.update(0, 0, true);
        assert(controller1.loadedTileCount === expectedInitial.length, '20. FLAGSHIP-adjacent: returning to a previously-visited camera position reproduces the exact same tile COUNT — no accumulation, no leak');
        for (const { tx, tz } of expectedInitial) {
            assert(controller1.isTileLoaded(tx, tz), `21. Tile (${tx},${tz}) is loaded again exactly as it was the first time this position was visited`);
        }

        // Small jitter under the movement threshold does not trigger a
        // reload — a perf-minded skip, proven by the factory call count
        // staying flat.
        const sink2 = fakeSink();
        const factory2 = fakeFactory();
        const controller2 = new TerrainStreamingController(sink2, factory2.fn, { streamingRadius: 80, updateThreshold: 10 });
        controller2.update(500, 500, true);
        const callsAfterFirst = factory2.calls;
        controller2.update(501, 500.5, false); // well under the 10-unit threshold
        assert(factory2.calls === callsAfterFirst, '22. A camera move smaller than updateThreshold is a no-op — no redundant tile factory calls');

        // A move past the threshold DOES trigger a real diff.
        controller2.update(500 + 50, 500, false);
        assert(factory2.calls > callsAfterFirst, '23. A camera move past updateThreshold triggers a real tile diff');

        // dispose() removes every currently-loaded tile from the sink.
        const sink3 = fakeSink();
        const controller3 = new TerrainStreamingController(sink3, (tx, tz) => ({ tx, tz }), { streamingRadius: 60 });
        controller3.update(0, 0, true);
        assert(sink3.size > 0, '24. Setup: controller3 has tiles loaded before dispose()');
        controller3.dispose();
        assert(sink3.size === 0, '25. dispose() removes every loaded tile from the sink, leaving nothing behind');
        assert(controller3.loadedTileCount === 0, '26. dispose() also clears the controller\'s own bookkeeping');
    }

    // -------------------------------------------------------------
    // Section D: renderer/WorldRenderer.js — building ground placement
    // -------------------------------------------------------------
    {
        const registry = new CreateBrickRegistryUseCase().execute();

        function buildOneBrickWorld(y) {
            const world = new World({});
            const building = new Building({});
            building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, y, 0) }));
            world.addBuilding(building);
            return world;
        }

        // D1 — a fake low-level renderer with NO terrainHeightAt() at
        // all (the shape every pre-0.2.76 test in this codebase already
        // uses, e.g. tests/ForkRenderSync.test.js) keeps behaving
        // exactly as before: no ground lift, groundY simply 0.
        {
            const meshes = new Set();
            const fakeRenderer = { add: (m) => meshes.add(m), remove: (m) => meshes.delete(m) };
            const worldRenderer = new WorldRenderer(fakeRenderer, registry);
            const world = buildOneBrickWorld(3);
            worldRenderer.addWorld(world, 'doc-legacy', { x: 10, y: 0, z: 10 });
            const mesh = Array.from(meshes)[0];
            assert(mesh.position.y === 3, '27. A renderer without terrainHeightAt() behaves exactly as before 0.2.76 — no ground offset applied, backward compatible with every existing WorldRenderer test');
        }

        // D2 — a fake renderer WITH terrainHeightAt(x, z) lifts every
        // brick in the document by exactly that one sampled value,
        // sampled at the DOCUMENT's own placement position — proving
        // the whole building rides the terrain as one rigid unit.
        {
            const meshes = new Set();
            const groundSamples = [];
            const fakeRenderer = {
                add: (m) => meshes.add(m),
                remove: (m) => meshes.delete(m),
                terrainHeightAt: (x, z) => { groundSamples.push({ x, z }); return 7.5; }
            };
            const worldRenderer = new WorldRenderer(fakeRenderer, registry);
            const world = new World({});
            const building = new Building({});
            building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0, 0) }));
            building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 1, 0) })); // stacked on top
            world.addBuilding(building);

            worldRenderer.addWorld(world, 'doc-terrain', { x: 120, y: 0, z: -80 });
            const positions = Array.from(meshes).map((m) => m.position.y).sort();
            assert(JSON.stringify(positions) === JSON.stringify([7.5, 8.5]), '28. Every brick in the building is lifted by the SAME 7.5 ground offset — the whole building moves as one rigid unit, never deformed per brick');
            assert(groundSamples.every((s) => s.x === 120 && s.z === -80), '29. The ground is sampled at the DOCUMENT\'s own placement position (120, -80), never per-brick');
        }

        // D3 — brick-level events (event-driven Editor mode) get the
        // same treatment, sampled at the origin (Editor's single world
        // has no document offset).
        {
            const meshes = new Set();
            const fakeRenderer = {
                add: (m) => meshes.add(m),
                remove: (m) => meshes.delete(m),
                terrainHeightAt: (x, z) => (x === 0 && z === 0 ? 4.25 : 0)
            };
            const worldRenderer = new WorldRenderer(fakeRenderer, registry);
            const brick = new Brick({ definitionId: 'core:cube', position: new Position(0, 2, 0) });
            worldRenderer._onBrickAdded('building-x', brick); // buildingId with no known document -> falls back to origin offset
            const mesh = Array.from(meshes)[0];
            assert(mesh.position.y === 6.25, '30. Editor-mode (event-driven, no documentId) brick placement also gets a terrain-based ground lift, sampled at the origin');
        }
    }

    // -------------------------------------------------------------
    // Section E: FLAGSHIP — the design doc's own scripted scenario
    // -------------------------------------------------------------
    //
    // "Enter World View -> Ground exists -> Move camera a long distance
    // -> Ground remains continuously available -> Cross terrain-tile
    // boundary -> No hole/missing ground -> Return toward original
    // position -> Same terrain appears" (docs/Roadmap.md, 0.2.76).
    {
        const sink = new Set();
        const lowLevelRenderer = { add: (m) => sink.add(m), remove: (m) => sink.delete(m) };
        const controller = new TerrainStreamingController(
            lowLevelRenderer,
            (tx, tz) => ({ tx, tz, uid: `${tx}:${tz}:${Math.random()}` }),
            { streamingRadius: DEFAULT_STREAMING_RADIUS }
        );

        // The camera starts at the origin: ground must already exist.
        controller.update(0, 0, true);
        assert(controller.loadedTileCount > 0, '31. FLAGSHIP: entering World View at the origin already has ground loaded — never an empty scene');
        assert(controller.isTileLoaded(...Object.values(tileCoordinateForPosition(0, 0))), '32. FLAGSHIP: the tile directly under the starting camera position is loaded');

        // Walk the camera a long distance in big strides, crossing many
        // tile boundaries, and assert the tile under the camera is
        // ALWAYS loaded after each step — "no hole, no missing ground."
        const path = [];
        for (let step = 0; step <= 40; step++) {
            path.push({ x: step * 25, z: step * 17 });
        }
        for (const p of path) {
            controller.update(p.x, p.z, true);
            const { tx, tz } = tileCoordinateForPosition(p.x, p.z);
            assert(controller.isTileLoaded(tx, tz), `33. FLAGSHIP: after moving to (${p.x}, ${p.z}) — thousands of units from the origin — the ground tile directly beneath the camera is loaded, never missing`);
        }
        assert(sink.size === controller.loadedTileCount, '34. FLAGSHIP: the renderer sink\'s own object count exactly matches the controller\'s bookkeeping throughout a long journey — no leaked, no orphaned tiles');

        // Return toward the original position: the exact same tile key
        // reappears, and its terrain height (computed independently
        // from core/TerrainHeightField.js, not from the streaming
        // controller) is byte-identical to what it was at the start —
        // "same world seed + same coordinates -> same terrain."
        const heightAtOriginBefore = terrainHeightAt(DEFAULT_WORLD_SEED, 5, 5);
        controller.update(0, 0, true);
        assert(controller.isTileLoaded(...Object.values(tileCoordinateForPosition(0, 0))), '35. FLAGSHIP: returning to the origin reloads the exact same starting tile');
        const heightAtOriginAfter = terrainHeightAt(DEFAULT_WORLD_SEED, 5, 5);
        assert(heightAtOriginBefore === heightAtOriginAfter, '36. FLAGSHIP: the terrain height at a fixed coordinate is byte-identical before and after an entire journey across the world — reproducible across any replica, exactly as the design doc requires for a potentially distributed World View');

        controller.dispose();
    }

    // -------------------------------------------------------------
    // Section F: renderer/PreviewRenderer.js — 0.2.87 addition. Before
    // this, the placement GHOST rendered flush with the flat local Y=0
    // plane while the REAL committed brick (Section D3, just above) got
    // lifted by terrainHeightAt(0, 0) — a visible "jump" the instant the
    // user clicked. The ghost must get the EXACT SAME offset, via the
    // exact same duck-typed fallback.
    // -------------------------------------------------------------
    {
        class FakeColor {
            constructor(value) { this.value = value; }
            clone() { return new FakeColor(this.value); }
            copy(other) { this.value = other.value; return this; }
            set(value) { this.value = value; return this; }
        }
        class FakeMaterial {
            constructor(color) { this.color = new FakeColor(color); this.transparent = false; this.opacity = 1; }
            clone() { return new FakeMaterial(this.color.value); }
        }
        class FakeMesh {
            constructor(color) {
                this.material = new FakeMaterial(color);
                this.position = { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } };
                this.rotation = { y: 0 };
                this.userData = {};
            }
        }
        const TRUE_COLOR = 0x4caf7d;
        const fakeBrickFactory = { createMesh: () => new FakeMesh(TRUE_COLOR) };

        const meshes = new Set();
        const fakeRenderer = {
            add: (m) => meshes.add(m),
            remove: (m) => meshes.delete(m),
            terrainHeightAt: (x, z) => (x === 0 && z === 0 ? 4.25 : 0)
        };
        const previewRenderer = new PreviewRenderer(fakeRenderer, fakeBrickFactory);
        const bus = new EventBus();
        previewRenderer.subscribe(bus);

        bus.publish(EditorEvent.PREVIEW_CHANGED, {
            preview: new PreviewState({ visible: true, definitionId: 'core:cube', position: new Position(1, 0.5, 2), rotation: 90, valid: true })
        });
        const mesh = Array.from(meshes)[0];
        assert(mesh, '37. showing a preview adds a ghost mesh to the renderer');
        assert(mesh.position.x === 1 && mesh.position.z === 2,
            '38. the ghost sits at the preview\'s own X/Z, unchanged');
        assert(mesh.position.y === 0.5 + 4.25,
            '39. FLAGSHIP: the ghost\'s Y is lifted by the SAME terrainHeightAt(0, 0) fallback Section D3 proved every committed Editor-mode brick already gets — the ghost and the real brick can never visually disagree again');
        assert(mesh.rotation.y === 90 * (Math.PI / 180), '40. rotation still converts degrees to radians exactly as before');
        assert(mesh.material.color.value === TRUE_COLOR, '41. a valid preview keeps the brick\'s own true color — never a second, fake-looking ghost material');

        bus.publish(EditorEvent.PREVIEW_CHANGED, {
            preview: new PreviewState({ visible: true, definitionId: 'core:cube', position: new Position(1, 0.5, 2), rotation: 90, valid: false })
        });
        assert(mesh.material.color.value === 0xe05252,
            '42. FLAGSHIP: an invalid (occupied) preview tints the SAME mesh red instead of hiding it — the user sees why a click would do nothing');

        bus.publish(EditorEvent.PREVIEW_CHANGED, {
            preview: new PreviewState({ visible: true, definitionId: 'core:cube', position: new Position(1, 0.5, 2), rotation: 90, valid: true })
        });
        assert(mesh.material.color.value === TRUE_COLOR,
            '43. becoming valid again (e.g. hovering off the occupied cell) restores the brick\'s true color exactly — no residual tint');

        bus.publish(EditorEvent.PREVIEW_CHANGED, { preview: PreviewState.hidden() });
        assert(meshes.size === 0, '44. hiding the preview removes the ghost mesh entirely');

        // A renderer without terrainHeightAt() (every pre-0.2.76 fake, and
        // every existing PreviewRenderer-adjacent test) behaves exactly as
        // it always did — no ground lift, matching Section D1's own claim
        // for WorldRenderer.
        const meshes2 = new Set();
        const legacyRenderer = { add: (m) => meshes2.add(m), remove: (m) => meshes2.delete(m) };
        const previewRenderer2 = new PreviewRenderer(legacyRenderer, fakeBrickFactory);
        const bus2 = new EventBus();
        previewRenderer2.subscribe(bus2);
        bus2.publish(EditorEvent.PREVIEW_CHANGED, {
            preview: new PreviewState({ visible: true, definitionId: 'core:cube', position: new Position(0, 0.5, 0), valid: true })
        });
        assert(Array.from(meshes2)[0].position.y === 0.5,
            '45. a renderer without terrainHeightAt() applies no ground offset at all — backward compatible with every pre-0.2.87 caller');
    }

    console.log('✅ All World Ground & Terrain Foundation tests passed.');
}

await runTests();
