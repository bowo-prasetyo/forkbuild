import * as THREE from 'three';
import { World } from '../core/document/World.js';
import { Building } from '../core/building/Building.js';
import { Brick } from '../core/building/Brick.js';
import { Document } from '../core/document/Document.js';
import { DocumentMetadata } from '../core/document/DocumentMetadata.js';
import { Position } from '../core/document/Position.js';
import { isTreeDisplaced } from '../core/nature/TreeDisplacement.js';
import { treeCollisionGeometryInRegion } from '../core/nature/TreeCollisionGeometry.js';
import { DEFAULT_WORLD_SEED } from '../core/nature/TerrainHeightField.js';
import { TERRAIN_TILE_SIZE } from '../core/nature/TerrainTiling.js';
import { TreeDisplacement } from '../application/world/TreeDisplacement.js';
import { AvatarTreeConstraint } from '../application/avatar/AvatarTreeConstraint.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { TreeForest } from '../renderer/TreeForest.js';
import { assert } from './support/Assert.js';

// Wild trees give way to what people build
// (core/nature/TreeDisplacement.js, application/world/TreeDisplacement.js).
//
//   Section A: the pure rule — a trunk overlapping a brick's footprint
//   Section B: TreeDisplacement — bricks gathered once per tile, refreshed, and
//              a version that moves on when an answer changes
//   Section C: WorldNavigationSession — a real World built over a tree: not
//              bumped into, not drawn, and back once the World is gone
//   Section D: renderer/TreeForest.js — a hidden tree is not drawn, and comes
//              back when the answer changes

const SEED = DEFAULT_WORLD_SEED;
const TREES = treeCollisionGeometryInRegion(SEED, 0, 0, 400, 400);
const TREE = TREES[0];

function box(minX, minZ, maxX, maxZ, minY = 0, maxY = 1) {
    return { min: { x: minX, y: minY, z: minZ }, max: { x: maxX, y: maxY, z: maxZ } };
}

assert(TREE && TREES.length > 10, '0. Setup: the sample holds trees');

// -------------------------------------------------------------
// Section A — the pure rule
// -------------------------------------------------------------
{
    const { x, z } = TREE.center;
    const r = TREE.radius;
    assert(isTreeDisplaced(TREE, [box(x - 1, z - 1, x + 1, z + 1)]), '1. A brick where the trunk stands displaces it');
    assert(isTreeDisplaced(TREE, [box(x - 1, z - 1, x + 1, z + 1, 0, 0.1)]), '2. ...a floor tile as much as a wall');
    assert(isTreeDisplaced(TREE, [box(x - 1, z - 1, x + 1, z + 1, 4, 4.3)]), '3. ...and a deck high above it: no trunk grows through one');
    assert(isTreeDisplaced(TREE, [box(x + r * 0.5, z - 1, x + 3, z + 1)]), '4. A brick overlapping the trunk\'s edge does');
    assert(!isTreeDisplaced(TREE, [box(x + r, z - 1, x + 3, z + 1)]), '5. One just touching it does not');
    const corner = r / Math.SQRT2 + 0.01;
    assert(!isTreeDisplaced(TREE, [box(x + corner, z + corner, x + 3, z + 3)]), '6. Nor one whose corner only nears the round trunk');
    assert(!isTreeDisplaced(TREE, [box(x + 20, z + 20, x + 21, z + 21)]) && !isTreeDisplaced(TREE, []) && !isTreeDisplaced(null, [box(0, 0, 1, 1)]),
        '7. Nor one well away, nor nothing built');
    console.log('✓ a trunk overlapping a brick\'s footprint gives way to it');
}

// -------------------------------------------------------------
// Section B — TreeDisplacement
// -------------------------------------------------------------
{
    let now = 0;
    let built = [];
    const gathered = [];
    const displacement = new TreeDisplacement({
        obstaclesNear: (center) => { gathered.push(center); return built; },
        now: () => now
    });
    const { x, z } = TREE.center;
    const sameTile = TREES.find((tree) => tree !== TREE
        && Math.floor(tree.center.x / TERRAIN_TILE_SIZE) === Math.floor(x / TERRAIN_TILE_SIZE)
        && Math.floor(tree.center.z / TERRAIN_TILE_SIZE) === Math.floor(z / TERRAIN_TILE_SIZE));

    assert(displacement.isDisplaced(TREE) === false && gathered.length === 1, '8. With nothing built, the tree stands; its tile\'s bricks are gathered');
    assert(gathered[0].x === (Math.floor(x / TERRAIN_TILE_SIZE) + 0.5) * TERRAIN_TILE_SIZE, '9. ...round the middle of its tile');
    if (sameTile) {
        displacement.isDisplaced(sameTile);
        assert(gathered.length === 1, '10. Another tree of the same tile asks for nothing more');
    }
    const before = displacement.version();
    built = [box(x - 1, z - 1, x + 1, z + 1)];
    assert(displacement.isDisplaced(TREE) === false, '11. An answer is kept until the tile is gathered again');
    now = 2500;
    const after = displacement.version();
    assert(displacement.isDisplaced(TREE) === true && after === before + 1, '12. Once refreshed, the build takes the tree, and the version moves on');
    assert(displacement.version() === after, '13. Nothing more changed, nor does the version');
    assert(displacement.standing([TREE, ...(sameTile ? [sameTile] : [])]).every((tree) => tree !== TREE), '14. standing() leaves it out');

    built = [];
    displacement.invalidate();
    assert(displacement.isDisplaced(TREE) === false, '15. After invalidate(), the next question gathers again at once: the build is gone, the tree is back');
    console.log('✓ trees are judged once per tile, refreshed, and say when an answer changes');
}

// -------------------------------------------------------------
// Section C — WorldNavigationSession, end to end
// -------------------------------------------------------------
{
    const registry = new CreateBrickRegistryUseCase().execute();
    const session = new WorldNavigationSession({ registry, loadPublicationDocumentUseCase: null, worldLayoutProvider: null });
    let hidden = null;
    let version = null;
    session._session = {
        onAnimationFrame() { return () => {}; },
        setHiddenTrees(isHidden, versionOf) { hidden = isHidden; version = versionOf; },
        removeWorld() {},
        getCameraState: () => ({ position: { x: 0, y: 10, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 }),
        setCameraState() {}
    };
    session._setupTreeDisplacementRendering();
    const far = TREES.find((tree) => Math.hypot(tree.center.x - TREE.center.x, tree.center.z - TREE.center.z) > 100);
    assert(session._standingTrees([TREE]).length === 1, '16. sanity: with nothing built, the tree stands');

    // A shed, three cubes square, built right where the tree grows.
    const world = new World({ id: 'w-shed' });
    const shed = new Building({ creator: 'alice' });
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            shed.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(dx, 0.5, dz) }));
        }
    }
    world.addBuilding(shed);
    session._loadedDocuments.set('w-shed', new Document({ world, metadata: new DocumentMetadata({ title: 'Shed', author: 'alice' }) }));
    session._localPositions.set('w-shed', { x: TREE.center.x, y: 0, z: TREE.center.z });
    session._treeDisplacement().invalidate();

    assert(session._standingTrees([TREE, far]).length === 1 && session._standingTrees([far])[0] === far,
        '17. A World built over a tree takes it, and no tree far from it');
    assert(typeof hidden === 'function' && hidden(TREE) === true && hidden(far) === false && typeof version === 'function',
        '18. The renderer is told not to draw it, by the same answer');

    const walk = session._buildAvatarTreeConstraint().apply(
        { x: TREE.center.x, y: 0, z: TREE.center.z - 3 },
        { x: TREE.center.x, y: 0, z: TREE.center.z + 3 }
    );
    assert(walk.collided === false, '19. Nobody bumps into a tree that is not there');
    const plain = new AvatarTreeConstraint().apply({ x: TREE.center.x, y: 0, z: TREE.center.z - 1 }, { x: TREE.center.x, y: 0, z: TREE.center.z });
    assert(plain.collided === true, '20. sanity: without the build, walking into it collides');

    const seen = version();
    session._unloadWorld('w-shed');
    let after = version();
    for (let i = 0; i < 1000 && after === seen; i++) after = version();
    assert(session._standingTrees([TREE]).length === 1 && hidden(TREE) === false && after !== seen,
        '21. Once the World is gone the tree grows back, and the renderer hears of it');
    console.log('✓ a World built over a tree takes it away from collision and drawing, and gives it back');
}

// -------------------------------------------------------------
// Section D — renderer/TreeForest.js
// -------------------------------------------------------------
{
    const forest = new TreeForest(new THREE.Group(), { seed: SEED });
    const tx = Math.floor(TREE.center.x / TERRAIN_TILE_SIZE);
    const tz = Math.floor(TREE.center.z / TERRAIN_TILE_SIZE);
    forest.loadTile(tx, tz);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(TREE.center.x, 2, TREE.center.z - 15);
    camera.lookAt(TREE.center.x, 2, TREE.center.z);
    const drawn = () => Object.values(forest.lodCounts).reduce((sum, n) => sum + n, 0);
    forest.update(camera);
    const all = drawn();
    assert(all > 0, '22. sanity: the tile\'s trees are drawn');

    let answer = 0;
    forest.setHidden((trunk) => trunk.center.x === TREE.center.x && trunk.center.z === TREE.center.z, () => answer);
    assert(forest.update(camera) === true && drawn() === all - 1, '23. A hidden tree is not drawn, and only that one');
    assert(forest.update(camera) === false, '24. With nothing moved and the same answer, nothing is sorted again');
    forest.setHidden(() => false, () => answer);
    forest.update(camera);
    answer = 1;
    assert(forest.update(camera) === true && drawn() === all, '25. When the answer changes the trees are sorted again, and it comes back');
    forest.dispose();
    console.log('✓ the forest leaves out a tree that gives way, and brings it back');
}
