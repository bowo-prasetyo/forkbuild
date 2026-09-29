import * as THREE from 'three';
import { wildlifeInRegion } from '../core/WildlifeField.js';
import { animalPoseAt, MAX_WANDER_DISTANCE } from '../core/WildlifeMotion.js';
import { wildlifeCollisionGeometryInRegion } from '../core/WildlifeCollisionGeometry.js';
import { isDeterministicAnimalId, animalIdFor } from '../core/AnimalIdentity.js';
import { AnimalPresence } from '../core/AnimalPresence.js';
import { Position } from '../core/Position.js';
import { ANIMAL_INTERACTION_RADIUS } from '../core/AvatarAnimalCatchTarget.js';
import { AVATAR_COLLISION_RADIUS } from '../core/AvatarCollision.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';
import { AvatarWildlifeConstraint } from '../application/avatar/AvatarWildlifeConstraint.js';
import { AvatarAnimalInteractionController } from '../application/avatar/AvatarAnimalInteractionController.js';
import { AnimalRuntimeInstances } from '../application/world/AnimalRuntimeInstances.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { AnimalRuntimeInstancePersistenceStore } from '../storage/AnimalRuntimeInstancePersistenceStore.js';
import { buildWildlifeTileMesh, updateWildlifeTileMesh, SPECIES_PRESET } from '../renderer/WildlifeTileMesh.js';
import { TerrainStreamingController } from '../renderer/TerrainStreamingController.js';
import { disposeOwnedTile, disposeInstancedTile } from '../renderer/TileDisposal.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { AvatarProfileUseCase } from '../application/avatar/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/avatar/AvatarPresenceSession.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Wandering wildlife, end to end: every system that asks where a wild
// animal is gets the same answer from core/WildlifeMotion.js.
//
//   Section A: collision — animals block where they are now, and caught
//              animals stop blocking (the invisible-collider fix)
//   Section B: catching finds an animal where it is now
//   Section C: AnimalRuntimeInstances refreshes wild animals on sync()
//              and persists only released ones
//   Section D: WorldNavigationSession loads and saves only released animals
//   Section E: renderer/WildlifeTileMesh.js — tiles move their animals in place
//   Section F: tile disposal — unloaded tiles free what they own, never what
//              they share

const SEED = DEFAULT_WORLD_SEED;
const T = 1_759_000_000;

const ANIMALS = wildlifeInRegion(SEED, -1200, -1200, 1200, 1200);

// An animal that is, at time T, well away from where it was placed — so a
// system still using placed positions would look in the wrong spot.
function wanderedAnimal() {
    for (const animal of ANIMALS) {
        const pose = animalPoseAt(SEED, animal, T);
        if (Math.hypot(pose.x - animal.x, pose.z - animal.z) > ANIMAL_INTERACTION_RADIUS + 0.2) {
            return { animal, pose };
        }
    }
    throw new Error('No animal has wandered far enough at T — fixture assumption broken');
}

function stubPresenceSession(position) {
    return { current: { position } };
}

function buildSession(extra = {}) {
    return new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(), loadPublicationDocumentUseCase: null, worldLayoutProvider: null,
        ...extra
    });
}

function frameFacade() {
    const listeners = [];
    return {
        onAnimationFrame(callback) {
            listeners.push(callback);
            return () => {};
        },
        fireFrame() {
            for (const callback of listeners) callback(0.016);
        },
        setLocalAvatar() {}, updateLocalAvatarAppearance() {}, updateLocalAvatarPresence() {},
        setLocalAvatarVisible() {}, removeLocalAvatar() {},
        getCameraState: () => ({ position: { x: 10, y: 10, z: 10 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 }),
        setCameraState() {}
    };
}

// Instance matrices are 32-bit floats, good to about 1e-4 at these
// coordinates, so positions read back from them are compared to 1e-3.
function positionOfInstance(mesh, i) {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(i, matrix);
    return new THREE.Vector3().setFromMatrixPosition(matrix);
}

async function runTests() {
    const { animal, pose } = wanderedAnimal();

    // -------------------------------------------------------------
    // Section A — collision
    // -------------------------------------------------------------
    {
        const circle = wildlifeCollisionGeometryInRegion(SEED, pose.x - 0.1, pose.z - 0.1, pose.x + 0.1, pose.z + 0.1, { timeSeconds: T })[0];
        assert(circle && circle.center.x === pose.x && circle.center.z === pose.z,
            '1. With a time, an animal\'s collision circle is centered where the animal is at that time');
        const staticCircles = wildlifeCollisionGeometryInRegion(SEED, pose.x - 0.1, pose.z - 0.1, pose.x + 0.1, pose.z + 0.1);
        assert(!staticCircles.some((c) => c.center.x === pose.x && c.center.z === pose.z),
            '2. Without one, it sits at its placed position instead');
        const excluded = wildlifeCollisionGeometryInRegion(SEED, pose.x - 0.1, pose.z - 0.1, pose.x + 0.1, pose.z + 0.1,
            { timeSeconds: T, isExcluded: (id) => id === animal.id });
        assert(excluded.length === 0, '3. isExcluded() removes an animal\'s collision circle entirely');

        const combined = circle.radius + AVATAR_COLLISION_RADIUS;
        const start = { x: pose.x, y: 0, z: pose.z - (combined + 2) };
        const through = { x: pose.x, y: 0, z: pose.z + (combined + 2) };

        const clocked = new AvatarWildlifeConstraint({ clock: () => T }).apply(start, through);
        assert(clocked.collided === true, '4. A clocked constraint stops an avatar walking into the animal where it is now');
        assert(Math.abs(Math.hypot(clocked.position.x - pose.x, clocked.position.z - pose.z) - combined) < 1e-6,
            '5. ...right at the edge of its current collision circle');

        const caught = new AvatarWildlifeConstraint({ clock: () => T, isExcluded: (id) => id === animal.id }).apply(start, through);
        assert(caught.collided === false && caught.position.z === through.z,
            '6. FIX: once caught, an animal no longer blocks anything — no invisible collider left behind');
    }
    {
        // The same fix through the real session wiring: the constraint the
        // session builds reads the session's own caught set and clock.
        const registry = new AvatarTemplateRegistry();
        registry.register(CoreAvatarTemplateLibrary);
        const storage = new InMemoryStorageProvider();
        const identityProvider = new LocalIdentityProvider(storage);
        identityProvider.login('wanderer');
        const avatarProfileUseCase = new AvatarProfileUseCase(storage, identityProvider, registry);
        const avatarPresenceSession = new AvatarPresenceSession(avatarProfileUseCase.getProfile());
        const session = buildSession({ avatarProfileUseCase, avatarPresenceSession, wildlifeClock: () => T });
        session._session = frameFacade();
        session._setupLocalAvatar();
        const constraint = session._avatarMovementController._wildlifeConstraint;

        const start = { x: pose.x, y: 0, z: pose.z - 3 };
        const through = { x: pose.x, y: 0, z: pose.z + 3 };
        assert(constraint.apply(start, through).collided === true, '7. The session\'s wildlife constraint blocks at the animal\'s current position');
        session._animalRuntimeInstances.discard(animal.id, pose);
        assert(constraint.apply(start, through).collided === false, '8. ...and stops blocking the moment the session records the catch');
    }

    // -------------------------------------------------------------
    // Section B — catching
    // -------------------------------------------------------------
    {
        const atPose = new AvatarAnimalInteractionController(stubPresenceSession({ x: pose.x, y: 0, z: pose.z }),
            { animalRuntimeInstances: new AnimalRuntimeInstances(), clock: () => T });
        assert(atPose.catchInteractionState().targetAnimalId === animal.id,
            '9. Standing where the animal is now, it is the catch target');
        const atSpawn = new AvatarAnimalInteractionController(stubPresenceSession({ x: animal.x, y: 0, z: animal.z }),
            { animalRuntimeInstances: new AnimalRuntimeInstances(), clock: () => T });
        assert(atSpawn.catchInteractionState().targetAnimalId !== animal.id,
            '10. Standing at its empty spawn point, it is not');

        // A stale tracked copy (synced long ago) never shadows the live one.
        const store = new AnimalRuntimeInstances();
        store.sync(SEED, { x: animal.x, y: 0, z: animal.z }, 20, T - 1000);
        const controller = new AvatarAnimalInteractionController(stubPresenceSession({ x: pose.x, y: 0, z: pose.z }),
            { animalRuntimeInstances: store, clock: () => T });
        controller.keyDown('f');
        controller.tick();
        controller.keyUp('f');
        assert(controller.inventory().size === 1 && store.isExcluded(animal.id), '11. Catching takes the animal from where it is now');
        const drained = store.drainRecentlyCaught();
        assert(drained.length === 1 && drained[0].position.x === pose.x && drained[0].position.z === pose.z,
            '12. The catch reports where the animal was caught, which is inside its own tile');
        assert(Math.floor(pose.x / TERRAIN_TILE_SIZE) === Math.floor(animal.x / TERRAIN_TILE_SIZE)
            && Math.floor(pose.z / TERRAIN_TILE_SIZE) === Math.floor(animal.z / TERRAIN_TILE_SIZE),
            '13. ...so the renderer rebuilds the tile that actually draws it');
    }

    // -------------------------------------------------------------
    // Section C — AnimalRuntimeInstances
    // -------------------------------------------------------------
    {
        const store = new AnimalRuntimeInstances();
        const center = { x: animal.x, y: 0, z: animal.z };
        store.sync(SEED, center, 20, T - 500);
        const before = store.get(animal.id);
        store.sync(SEED, center, 20, T);
        const after = store.get(animal.id);
        assert(before && after && after.position.x === pose.x && after.position.z === pose.z,
            '14. sync() moves a tracked wild animal to where it is now');
        assert(before.position.x !== after.position.x || before.position.z !== after.position.z,
            '15. ...rather than keeping the position it was first discovered at');

        const released = new AnimalPresence({ id: 'released-1', species: animal.species, position: new Position(animal.x, 0, animal.z) });
        store.add(released);
        store.sync(SEED, center, 20, T + 30);
        assert(store.get('released-1') === released, '16. A released animal is never replaced by sync()');
        assert(store.releasedInstances.length === 1 && store.releasedInstances[0].id === 'released-1',
            '17. releasedInstances holds only released animals, never discovered wild ones');
        assert(store.instances.length > 1, '18. sanity: the store does track wild animals too');
    }

    // -------------------------------------------------------------
    // Section D — WorldNavigationSession persistence
    // -------------------------------------------------------------
    {
        assert(isDeterministicAnimalId(animalIdFor(SEED, -3, 7)), '19. A lattice-slot id is recognized as a wild animal\'s');
        assert(!isDeterministicAnimalId('9b2f6d1e-5a4c-4f7e-8d2b-1c3a5e7f9b0d') && !isDeterministicAnimalId('animal:released:test-1'),
            '20. A UUID, or anything else merely starting with "animal:", is not');

        const provider = new InMemoryStorageProvider();
        const persistence = new AnimalRuntimeInstancePersistenceStore(provider);
        // What an earlier version saved: a discovered wild animal alongside a released one.
        persistence.save([
            new AnimalPresence({ id: animal.id, species: animal.species, position: new Position(animal.x, 0, animal.z) }),
            new AnimalPresence({ id: 'released-2', species: animal.species, position: new Position(animal.x + 1, 0, animal.z + 2) })
        ], []);
        const session = buildSession({ animalRuntimeInstancePersistenceStore: persistence, wildlifeClock: () => T });
        assert(session._animalRuntimeInstances.get('released-2') !== null, '21. A saved released animal is restored');
        assert(session._animalRuntimeInstances.get(animal.id) === null,
            '22. A saved wild animal is not — it would come back as a frozen "released" copy beside the real one');

        const facade = frameFacade();
        session._session = facade;
        session._setupAnimalRuntimePersistence();
        session._animalRuntimeInstances.sync(SEED, { x: animal.x, y: 0, z: animal.z }, 20, T);
        facade.fireFrame();
        const saved = persistence.load().instances.map((instance) => instance.id);
        assert(saved.length === 1 && saved[0] === 'released-2', '23. The session saves released animals only');
    }

    // -------------------------------------------------------------
    // Section E — renderer/WildlifeTileMesh.js
    // -------------------------------------------------------------
    {
        const tx = Math.floor(animal.x / TERRAIN_TILE_SIZE);
        const tz = Math.floor(animal.z / TERRAIN_TILE_SIZE);
        const tile = buildWildlifeTileMesh(tx, tz, SEED, TERRAIN_TILE_SIZE, new Set(), T);
        const herds = tile.userData.wildlife.herds;
        const herd = herds.find((h) => h.animals.some((a) => a.id === animal.id));
        const index = herd.animals.findIndex((a) => a.id === animal.id);

        const built = positionOfInstance(herd.bodyMesh, index);
        assert(Math.abs(built.x - pose.x) < 1e-3 && Math.abs(built.z - pose.z) < 1e-3 && Math.abs(built.y - pose.y) < 1e-3,
            '24. A tile built with a time draws each animal where it is at that time');
        // The head may be nodding, grazing or looking round, but it is always
        // attached: its neck pivot lands on the same world point through the
        // head's transform as through the body's.
        const matrixOf = (mesh) => { const m = new THREE.Matrix4(); mesh.getMatrixAt(index, m); return m; };
        const neckViaBody = herd.preset.neckPivot.clone().applyMatrix4(matrixOf(herd.bodyMesh));
        const neckViaHead = herd.preset.neckPivot.clone().applyMatrix4(matrixOf(herd.headMesh));
        assert(neckViaBody.distanceTo(neckViaHead) < 1e-3, '25. ...with its head attached to its body at the neck');

        const later = animalPoseAt(SEED, animal, T + 9);
        const bodyVersion = herd.bodyMesh.instanceMatrix.version;
        updateWildlifeTileMesh(tile, T + 9);
        const moved = positionOfInstance(herd.bodyMesh, index);
        assert(Math.abs(moved.x - later.x) < 1e-3 && Math.abs(moved.z - later.z) < 1e-3,
            '26. updateWildlifeTileMesh() moves every animal on to where it is now');
        assert(herd.bodyMesh.instanceMatrix.version > bodyVersion, '27. ...and flags the instance buffer for upload');
        assert(tile.children.length === herds.length * 2, '28. ...without adding a single mesh (draw call)');

        // Frustum culling: every animal stays inside its mesh's bounding
        // sphere wherever it wanders.
        for (const { animals, bodyMesh } of herds) {
            const sphere = bodyMesh.boundingSphere;
            for (let t = T; t < T + 120; t += 0.5) {
                for (const a of animals) {
                    const p = animalPoseAt(SEED, a, t);
                    assert(sphere.containsPoint(new THREE.Vector3(p.x, p.y, p.z)),
                        '29. A wandering animal never leaves its mesh\'s bounding sphere, so it is never culled while in view');
                }
            }
        }

        const withoutCaught = buildWildlifeTileMesh(tx, tz, SEED, TERRAIN_TILE_SIZE, new Set([animal.id]), T);
        assert(!withoutCaught.userData.wildlife?.herds.some((h) => h.animals.some((a) => a.id === animal.id)),
            '30. A caught animal is neither drawn nor moved by its tile');

        const placedTile = buildWildlifeTileMesh(tx, tz, SEED);
        const placed = positionOfInstance(placedTile.userData.wildlife.herds[0].bodyMesh, 0);
        const first = placedTile.userData.wildlife.herds[0].animals[0];
        assert(Math.abs(placed.x - first.x) < 1e-3 && Math.abs(placed.z - first.z) < 1e-3,
            '31. Without a time, a tile starts with its animals at their placed positions');

        const empty = new THREE.Group();
        updateWildlifeTileMesh(empty, T);
        assert(empty.children.length === 0, '32. An empty tile is left alone by updateWildlifeTileMesh()');
        assert(MAX_WANDER_DISTANCE > 0, '33. sanity: animals wander at all');
    }

    // -------------------------------------------------------------
    // Section F — tile disposal
    // -------------------------------------------------------------
    {
        const sink = new Set();
        const disposed = [];
        let built = 0;
        const controller = new TerrainStreamingController(
            { add: (o) => sink.add(o), remove: (o) => sink.delete(o) },
            (tx, tz) => ({ tx, tz, n: built++ }),
            { streamingRadius: 60, disposeTile: (o) => disposed.push(o) }
        );
        controller.update(0, 0, true);
        const initial = controller.loadedTileCount;
        let visited = 0;
        controller.forEachLoadedTile((object, tx, tz) => {
            if (object.tx === tx && object.tz === tz && sink.has(object)) visited++;
        });
        assert(visited === initial, '34. forEachLoadedTile() visits every loaded tile, with its coordinates');

        controller.update(2000, 2000, true);
        assert(disposed.length === initial && disposed.every((o) => !sink.has(o)),
            '35. Every tile that streams out is removed from the scene AND disposed');
        const [anyTile] = sink;
        const before = disposed.length;
        controller.invalidateTile(anyTile.tx, anyTile.tz);
        assert(disposed.length === before + 1 && disposed[disposed.length - 1] === anyTile, '36. invalidateTile() disposes the tile it replaces');
        const loaded = controller.loadedTileCount;
        controller.dispose();
        assert(disposed.length === before + 1 + loaded && sink.size === 0, '37. dispose() disposes every tile still loaded');

        const noHook = new TerrainStreamingController({ add() {}, remove() {} }, () => ({}), { streamingRadius: 40 });
        noHook.update(0, 0, true);
        noHook.update(5000, 0, true);
        noHook.dispose();
        assert(true, '38. Without a disposeTile hook, streaming works exactly as before');
    }
    {
        const events = [];
        const listen = (target, name) => target.addEventListener('dispose', () => events.push(name));

        const tile = buildWildlifeTileMesh(Math.floor(animal.x / TERRAIN_TILE_SIZE), Math.floor(animal.z / TERRAIN_TILE_SIZE), SEED);
        const preset = SPECIES_PRESET[animal.species];
        listen(preset.bodyGeometry, 'shared-geometry');
        listen(preset.bodyMaterial, 'shared-material');
        tile.traverse((node) => { if (node.isInstancedMesh) listen(node, 'instanced-mesh'); });
        disposeInstancedTile(tile);
        assert(events.includes('instanced-mesh'), '39. disposeInstancedTile() frees each InstancedMesh\'s own instance buffers');
        assert(!events.includes('shared-geometry') && !events.includes('shared-material'),
            '40. ...and never the species geometry or material every other tile shares');

        events.length = 0;
        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshStandardMaterial();
        listen(geometry, 'geometry');
        listen(material, 'material');
        disposeOwnedTile(new THREE.Mesh(geometry, material));
        assert(events.includes('geometry') && events.includes('material'), '41. disposeOwnedTile() frees a terrain/water tile\'s own geometry and material');
        disposeOwnedTile(new THREE.Group());
        assert(true, '42. disposeOwnedTile() accepts an empty tile');
    }

    console.log('✅ All Wildlife Motion Integration tests passed.');
}

await runTests();
