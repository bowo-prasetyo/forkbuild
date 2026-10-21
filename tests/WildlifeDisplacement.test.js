import * as THREE from 'three';
import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { Position } from '../core/document/Position.js';
import { wildlifeInRegion, WILDLIFE_LATTICE_SPACING, ANIMAL_SPECIES } from '../core/nature/WildlifeField.js';
import { animalPoseAt, ANIMAL_MOTION } from '../core/nature/WildlifeMotion.js';
import { AnimalPresence } from '../core/nature/AnimalPresence.js';
import {
    animalCellOf,
    wildAnimalById,
    animalRangeOf,
    isAnimalDisplaced,
    ANIMAL_HEADROOM
} from '../core/nature/WildlifeDisplacement.js';
import { DEFAULT_WORLD_SEED } from '../core/nature/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE } from '../core/nature/TerrainTiling.js';
import { WildlifeDisplacement } from '../application/world/WildlifeDisplacement.js';
import { AnimalRuntimeInstances } from '../application/world/AnimalRuntimeInstances.js';
import { AvatarWildlifeConstraint } from '../application/avatar/AvatarWildlifeConstraint.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { buildWildlifeTileMesh, updateWildlifeTileMesh, WILDLIFE_FADE_SECONDS } from '../renderer/WildlifeTileMesh.js';
import { assert } from './support/Assert.js';

// Wild animals keep away from what people build
// (core/nature/WildlifeDisplacement.js, application/world/WildlifeDisplacement.js).
//
//   Section A: the pure rule — an animal's reachable ground, and which bricks
//              displace it
//   Section B: WildlifeDisplacement — bricks gathered once per tile, refreshed,
//              only wild animals asked about
//   Section C: AnimalRuntimeInstances — a displaced animal is left out as a
//              caught one is, but never remembered as caught
//   Section D: WorldNavigationSession — a real World built over an animal:
//              not caught, not bumped into, not drawn
//   Section E: renderer/WildlifeTileMesh.js — a hidden animal is shrunk to
//              nothing, and comes back

const SEED = DEFAULT_WORLD_SEED;
// A daytime moment (a quarter of the way into the World's day): by night
// animals and residents settle down (core/nature/Nightfall.js).
const T = 1_758_999_000;
const ANIMALS = wildlifeInRegion(SEED, -1200, -1200, 1200, 1200);
const DEER = ANIMALS.find((a) => a.species === ANIMAL_SPECIES.DEER);
const RABBIT = ANIMALS.find((a) => a.species === ANIMAL_SPECIES.RABBIT);

function box(minX, minZ, maxX, maxZ, minY = 0, maxY = 1) {
    return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

function scaleOfInstance(mesh, i) {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(i, matrix);
    return new THREE.Vector3().setFromMatrixScale(matrix).x;
}

function runTests() {
    assert(DEER && RABBIT, '0. Setup: the sample holds a deer and a rabbit');

    // -------------------------------------------------------------
    // Section A — the pure rule
    // -------------------------------------------------------------
    {
        const cell = animalCellOf(DEER.id);
        assert(cell && cell.seed === SEED && cell.cellX === Math.floor(DEER.x / WILDLIFE_LATTICE_SPACING),
            '1. A wild animal\'s id names its lattice cell');
        assert(animalCellOf('9b2f6d1e-5a4c-4f7e-8d2b-1c3a5e7f9b0d') === null, '2. A released animal\'s id names none');
        const found = wildAnimalById(SEED, DEER.id);
        assert(found && found.x === DEER.x && found.z === DEER.z, '3. The id finds the animal exactly as it was placed');
        assert(wildAnimalById(SEED ^ 1, DEER.id) === null, '4. ...in its own World seed only');

        for (const animal of [DEER, RABBIT]) {
            const range = animalRangeOf(animal);
            for (let t = T; t < T + 600; t += 0.5) {
                const pose = animalPoseAt(SEED, animal, t);
                assert(pose.x > range.minX && pose.x < range.maxX && pose.z > range.minZ && pose.z < range.maxZ,
                    '5. An animal never walks beyond the range displacement checks');
            }
            const cellX = Math.floor(animal.x / WILDLIFE_LATTICE_SPACING);
            assert(range.maxX - range.minX <= 2 * ANIMAL_MOTION[animal.species].wanderRadius + 2,
                '6. The range is only as wide as the animal\'s wander, plus its body');
            assert(range.minX >= cellX * WILDLIFE_LATTICE_SPACING - 1, '7. ...and stays within its own cell, plus its body');
        }

        const { x, z } = DEER;
        assert(isAnimalDisplaced(DEER, [box(x - 0.5, z - 0.5, x + 0.5, z + 0.5)]), '8. A brick where it stands displaces it');
        assert(isAnimalDisplaced(DEER, [box(x - 0.5, z - 0.5, x + 0.5, z + 0.5, 0, 0.2)]), '9. ...a floor tile as much as a wall');
        const range = animalRangeOf(DEER);
        assert(!isAnimalDisplaced(DEER, [box(range.maxX, z - 1, range.maxX + 2, z + 1)]), '10. A brick just touching its range does not');
        assert(!isAnimalDisplaced(DEER, [box(x + 20, z + 20, x + 21, z + 21)]), '11. Nor does one well away');
        assert(!isAnimalDisplaced(DEER, [box(x - 2, z - 2, x + 2, z + 2, ANIMAL_HEADROOM, ANIMAL_HEADROOM + 0.3)]),
            '12. Nor a deck high enough to walk under');
        assert(!isAnimalDisplaced(DEER, []), '13. Nothing built, nothing displaced');
    }

    // -------------------------------------------------------------
    // Section B — WildlifeDisplacement
    // -------------------------------------------------------------
    {
        let now = 0;
        let gathered = 0;
        let boxes = [box(DEER.x - 0.5, DEER.z - 0.5, DEER.x + 0.5, DEER.z + 0.5)];
        const centers = [];
        const displacement = new WildlifeDisplacement({
            seed: SEED,
            now: () => now,
            obstaclesNear: (center) => {
                gathered++;
                centers.push(center);
                return boxes;
            }
        });
        assert(displacement.isDisplaced(DEER.id) === true, '14. A deer under a brick is displaced');
        assert(displacement.isDisplaced(DEER.id) === true && gathered === 1, '15. Asking again gathers nothing again');
        const tx = Math.floor(DEER.x / TERRAIN_TILE_SIZE);
        assert(centers[0].x === (tx + 0.5) * TERRAIN_TILE_SIZE, '16. Bricks are gathered around the centre of the animal\'s tile');
        const sameTile = ANIMALS.find((a) => a !== DEER
            && Math.floor(a.x / TERRAIN_TILE_SIZE) === tx && Math.floor(a.z / TERRAIN_TILE_SIZE) === Math.floor(DEER.z / TERRAIN_TILE_SIZE));
        if (sameTile) {
            displacement.isDisplaced(sameTile.id);
            assert(gathered === 1, '17. Every animal in one tile shares one gathering');
        }
        assert(displacement.isDisplaced('9b2f6d1e-5a4c-4f7e-8d2b-1c3a5e7f9b0d') === false, '18. A released animal is never displaced');
        assert(displacement.isDisplaced('not an animal') === false, '19. Nor is anything else');

        boxes = [];
        now = 1000;
        assert(displacement.isDisplaced(DEER.id) === true, '20. A build taken down counts only once the bricks are gathered again');
        now = 2500;
        assert(displacement.isDisplaced(DEER.id) === false && gathered === 2, '21. ...which happens within seconds: the deer is back');
        boxes = [box(DEER.x - 0.5, DEER.z - 0.5, DEER.x + 0.5, DEER.z + 0.5)];
        displacement.invalidate();
        assert(displacement.isDisplaced(DEER.id) === true, '22. invalidate() takes a fresh look at once');
    }

    // -------------------------------------------------------------
    // Section C — AnimalRuntimeInstances
    // -------------------------------------------------------------
    {
        const store = new AnimalRuntimeInstances();
        const center = { x: DEER.x, y: 0, z: DEER.z };
        store.sync(SEED, center, 20, T);
        assert(store.get(DEER.id) !== null && !store.isExcluded(DEER.id), '23. sanity: a wild deer is tracked');
        let displaced = true;
        store.setDisplacement((id) => displaced && id === DEER.id);
        assert(store.isExcluded(DEER.id), '24. A displaced animal is excluded, as a caught one is');
        store.sync(SEED, center, 20, T + 1);
        assert(store.get(DEER.id) === null, '25. sync() drops it');
        assert(!store.excludedIds.includes(DEER.id), '26. ...but never remembers it as caught');

        const released = new AnimalPresence({ id: DEER.id.replace('animal:', 'r-'), species: DEER.species, position: new Position(DEER.x, 0, DEER.z) });
        store.add(released);
        store.sync(SEED, center, 20, T + 2);
        assert(store.get(released.id) === released, '27. A released animal stays where it was let go');

        displaced = false;
        store.sync(SEED, center, 20, T + 3);
        assert(store.get(DEER.id) !== null && !store.isExcluded(DEER.id), '28. Once the build is gone, the deer is back');
    }

    // -------------------------------------------------------------
    // Section D — WorldNavigationSession, end to end
    // -------------------------------------------------------------
    {
        const registry = new CreateBrickRegistryUseCase().execute();
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null, wildlifeClock: () => T
        });
        let hidden = null;
        session._session = {
            onAnimationFrame() { return () => {}; },
            setHiddenWildlife(isHidden) { hidden = isHidden; },
            getCameraState: () => ({ position: { x: 0, y: 10, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 }),
            setCameraState() {}
        };
        session._setupWildlifeDisplacementRendering();

        const far = ANIMALS.find((a) => Math.hypot(a.x - DEER.x, a.z - DEER.z) > 200);
        assert(!session._animalRuntimeInstances.isExcluded(DEER.id), '29. sanity: with nothing built, the deer is there');

        // A shed, three cubes square, built right where the deer grazes.
        const world = new World({ id: 'w-shed' });
        const shed = new Building({ creator: 'alice' });
        for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
                shed.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(dx, 0.5, dz) }));
            }
        }
        world.addBuilding(shed);
        session._loadedDocuments.set('w-shed', new Document({ world, metadata: new DocumentMetadata({ title: 'Shed', author: 'alice' }) }));
        session._localPositions.set('w-shed', { x: DEER.x, y: 0, z: DEER.z });
        session._wildlifeDisplacement().invalidate();

        assert(session._animalRuntimeInstances.isExcluded(DEER.id), '30. A World built over a deer displaces it');
        assert(!session._animalRuntimeInstances.isExcluded(far.id), '31. ...and no animal far from it');
        assert(typeof hidden === 'function' && hidden(DEER.id) === true && hidden(far.id) === false,
            '32. The renderer is told not to draw it, by the same answer');

        const pose = animalPoseAt(SEED, DEER, T);
        const constraint = new AvatarWildlifeConstraint({ clock: () => T, isExcluded: (id) => session._animalRuntimeInstances.isExcluded(id) });
        const walk = constraint.apply({ x: pose.x, y: 0, z: pose.z - 3 }, { x: pose.x, y: 0, z: pose.z + 3 });
        assert(walk.collided === false, '33. Nobody bumps into a deer that is not there');
        const facts = session._animalRuntimeInstances.sync(SEED, { x: DEER.x, y: 0, z: DEER.z }, 20, T);
        assert(!facts.some((presence) => presence.id === DEER.id), '34. Nor can it be caught');
    }

    // -------------------------------------------------------------
    // Section E — renderer/WildlifeTileMesh.js
    // -------------------------------------------------------------
    {
        const tx = Math.floor(DEER.x / TERRAIN_TILE_SIZE);
        const tz = Math.floor(DEER.z / TERRAIN_TILE_SIZE);
        const tile = buildWildlifeTileMesh(tx, tz, SEED, TERRAIN_TILE_SIZE, new Set(), T);
        const herd = tile.userData.wildlife.herds.find((h) => h.animals.some((a) => a.id === DEER.id));
        const index = herd.animals.findIndex((a) => a.id === DEER.id);
        assert(scaleOfInstance(herd.bodyMesh, index) > 0.5, '35. sanity: the deer is drawn');
        updateWildlifeTileMesh(tile, T + 1, null, (id) => id === DEER.id);
        assert(scaleOfInstance(herd.bodyMesh, index) === 0 && scaleOfInstance(herd.headMesh, index) === 0,
            '36. A hidden animal is shrunk to nothing, head and all');
        const others = herd.animals.map((a, i) => i).filter((i) => i !== index);
        assert(others.every((i) => scaleOfInstance(herd.bodyMesh, i) > 0.5), '37. ...and only that one');
        updateWildlifeTileMesh(tile, T + 2, null, () => false);
        assert(Math.abs(scaleOfInstance(herd.bodyMesh, index) - DEER.scale) < 1e-4, '38. Once it is not hidden, it comes back');

        // The fade: shrinking away and growing back over WILDLIFE_FADE_SECONDS.
        const hideDeer = (id) => id === DEER.id;
        const half = WILDLIFE_FADE_SECONDS / 2;
        updateWildlifeTileMesh(tile, T + 3, null, () => false);
        updateWildlifeTileMesh(tile, T + 3, null, hideDeer);
        const shrinking = scaleOfInstance(herd.bodyMesh, index);
        assert(shrinking === DEER.scale || Math.abs(shrinking - DEER.scale) < 1e-4,
            '38b. Hidden on this very frame, it has not shrunk yet: no time has passed');
        updateWildlifeTileMesh(tile, T + 3 + half, null, hideDeer);
        const midway = scaleOfInstance(herd.bodyMesh, index);
        assert(midway > 0.1 * DEER.scale && midway < 0.9 * DEER.scale, `38c. Halfway through the fade it is part way gone (${midway.toFixed(3)})`);
        updateWildlifeTileMesh(tile, T + 3 + half - 1, null, hideDeer);
        assert(Math.abs(scaleOfInstance(herd.bodyMesh, index) - midway) < 1e-6, '38d. A clock set back fades nothing');
        const gone = T + 3 + WILDLIFE_FADE_SECONDS + 0.01;
        updateWildlifeTileMesh(tile, gone, null, hideDeer);
        assert(scaleOfInstance(herd.bodyMesh, index) === 0, '38e. ...and when the fade is over, it is gone');
        updateWildlifeTileMesh(tile, gone + half, null, () => false);
        const growing = scaleOfInstance(herd.bodyMesh, index);
        assert(growing > 0 && growing < DEER.scale, '38f. Unhidden, it grows back over the fade too');
        assert(others.every((i) => Math.abs(scaleOfInstance(herd.bodyMesh, i) - herd.animals[i].scale) < 1e-4),
            '38g. ...and the others never fade at all');

        // A tile streamed in with the deer already hidden: gone from its first
        // frame, never seen shrinking.
        const fresh = buildWildlifeTileMesh(tx, tz, SEED, TERRAIN_TILE_SIZE, new Set());
        const freshHerd = fresh.userData.wildlife.herds.find((h) => h.animals.some((a) => a.id === DEER.id));
        updateWildlifeTileMesh(fresh, T, null, hideDeer);
        assert(scaleOfInstance(freshHerd.bodyMesh, index) === 0, '38h. A tile streamed in draws a hidden animal as gone at once, no fade');
        const posed = buildWildlifeTileMesh(tx, tz, SEED, TERRAIN_TILE_SIZE, new Set(), T);
        const posedHerd = posed.userData.wildlife.herds.find((h) => h.animals.some((a) => a.id === DEER.id));
        updateWildlifeTileMesh(posed, T + 1 / 60, null, hideDeer);
        assert(scaleOfInstance(posedHerd.bodyMesh, index) === 0, '38i. ...also when it was built posed at the clock, as Renderer builds it');
    }

    console.log('WildlifeDisplacement tests passed');
}

runTests();
