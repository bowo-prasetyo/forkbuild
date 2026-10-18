import * as THREE from 'three';
import { naturalFeaturesInRegion, TREE_SPECIES } from '../core/NaturalFeatureField.js';
import { treeForm, allTreeForms, treeShapeOf, flexAt, TREE_FORMS_PER_SPECIES, TRUNK_ROOT_DEPTH, MAX_FLEX } from '../core/TreeForm.js';
import { TREE_TRUNK_COLLISION_RADIUS } from '../core/TreeCollisionGeometry.js';
import { SETTLEMENT_TREE_CLEARANCE } from '../core/BuildSettlement.js';
import { DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { tilesWithinRadius, DEFAULT_STREAMING_RADIUS, TERRAIN_TILE_SIZE } from '../core/TerrainTiling.js';
import { buildTreeGeometries } from '../renderer/TreeGeometry.js';
import { paintBroadLeaves, paintNeedles, paintBark, LEAF_TEXTURE_SIZE } from '../renderer/TreeMaterials.js';
import { TreeForest, TREE_DETAIL, TREE_LOD, TREE_LOD_DISTANCES, treeLodAt } from '../renderer/TreeForest.js';
import { TerrainStreamingController } from '../renderer/TerrainStreamingController.js';
import { WorldViewTreeDetailStore } from '../application/settings/WorldViewTreeDetailStore.js';
import { WorldNavigationSession } from '../application/world/WorldNavigationSession.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// World View's trees: grown from a seed (core/TreeForm.js), built at three
// levels of detail (renderer/TreeGeometry.js), drawn from one pool
// (renderer/TreeForest.js), in as much detail as this device chose
// (application/settings/WorldViewTreeDetailStore.js).
//
//   Section A: forms — the same every time, whole, rooted, sized like trees
//   Section B: each tree wears its form its own way, the same everywhere
//   Section C: geometry — every level, swaying from a still root
//   Section D: textures — leaves with gaps between them, bark that tiles
//   Section E: the pool — levels by distance, culling, few draw calls, streaming
//   Section F: the device's choice reaches the renderer

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// ---------------------------------------------------------------
// Section A — forms
// ---------------------------------------------------------------
{
    const forms = allTreeForms();
    assert(forms.length === Object.keys(TREE_SPECIES).length * TREE_FORMS_PER_SPECIES, 'every species has its forms');
    assert(treeForm(TREE_SPECIES.BROADLEAF, 2) === treeForm(TREE_SPECIES.BROADLEAF, 2), 'a form is grown once and kept');
    assert(JSON.stringify(treeForm(TREE_SPECIES.CONIFER, 1).branches) !== JSON.stringify(treeForm(TREE_SPECIES.CONIFER, 2).branches),
        'forms of one species differ');

    const heights = {};
    for (const form of forms) {
        const trunk = form.branches[0];
        assert(trunk.depth === 0 && Math.abs(trunk.points[0].y + TRUNK_ROOT_DEPTH) < 1e-9 && trunk.points[0].x === 0 && trunk.points[0].z === 0,
            `${form.species} ${form.index}: the trunk starts below the ground, under the tree's own base`);
        assert(trunk.radii[0] <= TREE_TRUNK_COLLISION_RADIUS * 0.95, `${form.species} ${form.index}: the trunk fits inside its hitbox`);
        assert(form.leaves.length >= 20, `${form.species} ${form.index}: it has a crown of leaves`);

        // Every branch but the trunk leaves from a point on another branch:
        // the tree is one piece.
        const allPoints = form.branches.flatMap((branch) => branch.points);
        for (const branch of form.branches.slice(1)) {
            const start = branch.points[0];
            const nearest = Math.min(...form.branches.filter((b) => b !== branch)
                .flatMap((b) => b.points).map((p) => distance(p, start)));
            assert(nearest < 0.35, `${form.species} ${form.index}: a branch grows from the tree, not the air`);
            for (let i = 1; i < branch.radii.length; i++) {
                assert(branch.radii[i] <= branch.radii[i - 1] + 1e-9, 'a branch never thickens towards its tip');
                assert(branch.flex[i] >= branch.flex[i - 1] - 1e-9 && branch.flex[i] <= MAX_FLEX, 'it sways more towards its tip, within the limit');
            }
        }
        assert(allPoints.every((p) => p.y >= -TRUNK_ROOT_DEPTH - 1e-9), 'nothing grows below the root');
        for (const leaf of form.leaves) {
            assert(leaf.y > 0 && leaf.size > 0 && leaf.flex > 0, 'leaves hang above the ground and sway');
            assert(leaf.y - leaf.size / 2 >= form.crown.base - 1e-9 && leaf.y + leaf.size / 2 <= form.crown.top + 1e-9
                && Math.hypot(leaf.x, leaf.z) + leaf.size / 2 <= form.crown.radius + 1e-9, 'the crown holds every leaf');
        }
        (heights[form.species] ||= []).push(form.height);
        // A crown never reaches a settlement spot's house from a tree the
        // clearance let stand (core/BuildSettlement.js), even at the largest scale.
        assert(form.crown.radius * 1.3 * 1.1 < SETTLEMENT_TREE_CLEARANCE, `${form.species} ${form.index}: the crown keeps clear of a house spot`);
    }
    const mean = (list) => list.reduce((a, b) => a + b, 0) / list.length;
    assert(mean(heights[TREE_SPECIES.CONIFER]) > mean(heights[TREE_SPECIES.BROADLEAF])
        && mean(heights[TREE_SPECIES.BROADLEAF]) > mean(heights[TREE_SPECIES.SCRUB]) * 1.8,
        'conifers stand tallest, scrub lowest by far');
    assert(heights[TREE_SPECIES.CONIFER].every((h) => h > 8 && h < 11) && heights[TREE_SPECIES.SCRUB].every((h) => h > 2.5 && h < 4),
        'trees are tree-sized next to a 1.6 m eye height');
    assert(flexAt(0, 9) === 0 && flexAt(-1, 9) === 0 && Math.abs(flexAt(9, 9) - 1) < 1e-9 && flexAt(100, 9) === MAX_FLEX,
        'nothing sways at the root, a tree\'s height sways one unit, and no more than the limit');
    console.log('✓ A: forms are the same every time, whole, rooted and tree-sized');
}

// ---------------------------------------------------------------
// Section B — each tree's own shape
// ---------------------------------------------------------------
{
    const trees = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, -600, -600, 600, 600);
    assert(trees.length > 200, 'there are trees to look at');
    const used = new Set();
    for (const tree of trees) {
        const shape = treeShapeOf(tree);
        assert(JSON.stringify(shape) === JSON.stringify(treeShapeOf({ ...tree })), 'a tree wears its form the same way on every device');
        assert(Number.isInteger(shape.form) && shape.form >= 0 && shape.form < TREE_FORMS_PER_SPECIES, 'it is one of its species\' forms');
        assert(shape.heightScale >= tree.scale * 0.92 - 1e-9 && shape.heightScale <= tree.scale * 1.08 + 1e-9, 'its height follows its scale');
        assert(shape.widthScale >= tree.scale * 0.9 - 1e-9 && shape.widthScale <= tree.scale * 1.1 + 1e-9, 'and so does its width');
        assert(Math.hypot(shape.leanX, shape.leanZ) <= 0.06 + 1e-9, 'it leans only a little');
        assert(shape.shade >= 0.9 && shape.shade <= 1.08, 'its shade shifts only a little');
        used.add(`${tree.species}:${shape.form}`);
    }
    assert(used.size >= 10, 'neighbouring trees use many forms');
    console.log('✓ B: each tree wears its form its own way, the same everywhere');
}

// ---------------------------------------------------------------
// Section C — geometry
// ---------------------------------------------------------------
{
    for (const form of allTreeForms()) {
        const geometries = buildTreeGeometries(form);
        const triangles = (geometry) => geometry.index.count / 3;
        for (const [level, parts] of Object.entries(geometries)) {
            for (const [part, geometry] of Object.entries(parts)) {
                const position = geometry.getAttribute('position');
                const wind = geometry.getAttribute('treeWind');
                assert(position.count > 0 && wind && wind.count === position.count && geometry.getAttribute('normal') && geometry.getAttribute('uv'),
                    `${form.species} ${level} ${part}: every vertex has a place, a normal, a texture spot and its sway`);
                for (let i = 0; i < geometry.index.count; i++) {
                    assert(geometry.index.getX(i) < position.count, 'every triangle uses real vertices');
                }
                let lowest = Infinity;
                for (let i = 0; i < position.count; i++) {
                    const flex = wind.getX(i);
                    assert(flex >= 0 && flex <= MAX_FLEX && Number.isFinite(position.getX(i) + position.getY(i) + position.getZ(i)), 'sway and place are sane');
                    if (position.getY(i) < 0.05) assert(flex < 0.02, 'what is at the ground hardly sways');
                    lowest = Math.min(lowest, position.getY(i));
                }
                if (part === 'bark') assert(lowest < -TRUNK_ROOT_DEPTH * 0.5, `${form.species} ${level}: the trunk reaches into the ground`);
            }
        }
        const leafFlutter = geometries.near.leaves.getAttribute('treeWind');
        const barkFlutter = geometries.near.bark.getAttribute('treeWind');
        let leafFlutters = true;
        for (let i = 0; i < leafFlutter.count; i++) leafFlutters &&= leafFlutter.getY(i) === 1;
        let barkStill = true;
        for (let i = 0; i < barkFlutter.count; i++) barkStill &&= barkFlutter.getY(i) === 0;
        assert(leafFlutters && barkStill, 'leaves flutter, wood doesn\'t');
        const near = triangles(geometries.near.bark) + triangles(geometries.near.leaves);
        const mid = triangles(geometries.mid.bark) + triangles(geometries.mid.crown);
        const far = triangles(geometries.far.bark) + triangles(geometries.far.crown);
        assert(near > mid * 1.5 && mid > far && far <= 120 && near <= 4000, `${form.species} ${form.index}: each level is lighter than the one before (${near}, ${mid}, ${far})`);
        assert(geometries.near.leaves.index.count / 6 >= form.leaves.length * 2, 'close up, every leaf cluster is crossed cards');
        for (const level of Object.values(geometries)) for (const geometry of Object.values(level)) geometry.dispose();
    }

    // Wood faces outwards: a tube's normals point away from its own axis.
    const form = treeForm(TREE_SPECIES.BROADLEAF, 0);
    const bark = buildTreeGeometries(form).near.bark;
    const position = bark.getAttribute('position');
    const normal = bark.getAttribute('normal');
    let outward = 0;
    let checked = 0;
    const trunk = form.branches[0];
    for (let i = 0; i < position.count; i++) {
        const y = position.getY(i);
        if (y < 0.2 || y > trunk.points[trunk.points.length - 1].y - 0.3) continue;
        checked++;
        if (position.getX(i) * normal.getX(i) + position.getZ(i) * normal.getZ(i) > 0) outward++;
    }
    assert(checked > 10 && outward / checked > 0.9, 'the trunk\'s surface faces outwards');
    // ...and its triangles are wound to face the same way, so they aren't culled.
    let wound = 0;
    let triangleCount = 0;
    const a = new THREE.Vector3(); const b = new THREE.Vector3(); const c = new THREE.Vector3(); const n = new THREE.Vector3();
    for (let t = 0; t < bark.index.count; t += 3) {
        a.fromBufferAttribute(position, bark.index.getX(t));
        b.fromBufferAttribute(position, bark.index.getX(t + 1));
        c.fromBufferAttribute(position, bark.index.getX(t + 2));
        const face = new THREE.Vector3().crossVectors(b.clone().sub(a), c.clone().sub(a));
        if (face.lengthSq() < 1e-12) continue;
        n.fromBufferAttribute(normal, bark.index.getX(t));
        triangleCount++;
        if (face.dot(n) > 0) wound++;
    }
    assert(wound / triangleCount > 0.95, 'bark triangles are wound outwards');
    console.log('✓ C: every level is built, lighter with distance, swaying from a still root');
}

// ---------------------------------------------------------------
// Section D — textures
// ---------------------------------------------------------------
{
    for (const [name, canvas] of [['broad leaves', paintBroadLeaves()], ['needles', paintNeedles()]]) {
        assert(canvas.width === LEAF_TEXTURE_SIZE && canvas.height === LEAF_TEXTURE_SIZE, `${name}: a power of two, for mipmaps`);
        let solid = 0;
        for (let i = 3; i < canvas.data.length; i += 4) if (canvas.data[i] > 127) solid++;
        const share = solid / (canvas.width * canvas.height);
        assert(share > 0.2 && share < 0.85, `${name}: leaves with gaps between them (${share.toFixed(2)} solid)`);
        assert(JSON.stringify(Array.from(canvas.data.slice(0, 4096))) === JSON.stringify(Array.from((name === 'needles' ? paintNeedles() : paintBroadLeaves()).data.slice(0, 4096))),
            `${name}: painted the same every time`);
        // Corners are empty, so a card's square never shows.
        for (const [x, y] of [[0, 0], [canvas.width - 1, 0], [0, canvas.height - 1], [canvas.width - 1, canvas.height - 1]]) {
            assert(canvas.data[(y * canvas.width + x) * 4 + 3] === 0, `${name}: the card's corners are see-through`);
        }
    }
    const bark = paintBark();
    let opaque = true;
    for (let i = 3; i < bark.data.length; i += 4) opaque &&= bark.data[i] === 255;
    assert(opaque, 'bark is solid');
    let seam = 0;
    for (let y = 0; y < bark.height; y++) {
        const left = bark.data[(y * bark.width) * 4];
        const right = bark.data[(y * bark.width + bark.width - 1) * 4];
        seam += Math.abs(left - right);
    }
    assert(seam / bark.height < 30, 'bark wraps round the trunk without a seam');
    console.log('✓ D: leaves have gaps and empty corners; bark is solid and tiles');
}

// ---------------------------------------------------------------
// Section E — the pool
// ---------------------------------------------------------------
{
    assert(treeLodAt(10) === TREE_LOD.NEAR && treeLodAt(60) === TREE_LOD.MID && treeLodAt(150) === TREE_LOD.FAR, 'near, mid and far by distance');
    assert(treeLodAt(10, TREE_DETAIL.LOW) === TREE_LOD.MID && treeLodAt(60, TREE_DETAIL.LOW) === TREE_LOD.FAR, 'LOW never draws full detail');
    assert(TREE_LOD_DISTANCES[TREE_DETAIL.HIGH].near === 45, 'full detail reaches as far as the sun\'s shadows');

    const sink = new THREE.Group();
    const forest = new TreeForest(sink, { seed: DEFAULT_WORLD_SEED });
    assert(sink.children.length === 1 && sink.children[0] === forest.group, 'the forest is one thing in the scene');

    // A thick forest: the busiest place to stand.
    let best = null;
    for (let x = -1600; x < 1600; x += 160) {
        for (let z = -1600; z < 1600; z += 160) {
            const n = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, x, z, x + 40, z + 40).length;
            if (!best || n > best.n) best = { n, x: x + 20, z: z + 20 };
        }
    }
    const streaming = new TerrainStreamingController({ add() {}, remove() {} }, (tx, tz) => forest.loadTile(tx, tz),
        { disposeTile: (token) => forest.unloadTile(token) });
    streaming.update(best.x, best.z, true);
    const expected = tilesWithinRadius(best.x, best.z, DEFAULT_STREAMING_RADIUS)
        .reduce((sum, { tx, tz }) => sum + naturalFeaturesInRegion(DEFAULT_WORLD_SEED, tx * TERRAIN_TILE_SIZE, tz * TERRAIN_TILE_SIZE,
            (tx + 1) * TERRAIN_TILE_SIZE, (tz + 1) * TERRAIN_TILE_SIZE).length, 0);
    assert(forest.treeCount === expected && expected > 800, `every streamed tree is in the pool (${expected})`);

    const camera = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 2000);
    camera.position.set(best.x, 12, best.z);
    camera.lookAt(best.x + 30, 4, best.z);
    assert(forest.update(camera) === true, 'the first update sorts the trees');
    const counts = forest.lodCounts;
    assert(counts.NEAR > 20 && counts.MID > 0 && counts.FAR > 0, 'trees are drawn at every level');
    assert(counts.NEAR + counts.MID + counts.FAR < forest.treeCount, 'mid and far trees out of view are skipped');
    assert(forest.drawnMeshCount <= 12 * 6 && forest.drawnMeshCount >= 6, `a few dozen draw calls however many trees (${forest.drawnMeshCount})`);

    // Every near tree within reach is drawn, in view or not: it may cast a
    // shadow into view.
    let nearAround = 0;
    forest.group.traverse((node) => {
        if (node.isInstancedMesh && node.visible && node.name.endsWith('-near') && node.material.alphaTest > 0) nearAround += node.count;
    });
    assert(nearAround === counts.NEAR, 'near trees are drawn as leaves and bark');
    camera.lookAt(best.x - 30, 4, best.z);
    camera.updateMatrixWorld();
    forest.update(camera);
    assert(forest.lodCounts.NEAR === counts.NEAR, 'near trees stay drawn whichever way the camera turns');

    // Small moves and turns change nothing; a real one re-sorts.
    camera.position.x += 0.5;
    assert(forest.update(camera) === false, 'a half-metre step doesn\'t re-sort');
    camera.rotateY(THREE.MathUtils.degToRad(3));
    assert(forest.update(camera) === false, 'nor does a small turn');
    camera.rotateY(THREE.MathUtils.degToRad(20));
    assert(forest.update(camera) === true, 'a real turn does');
    camera.position.x += 5;
    assert(forest.update(camera) === true, 'and so does a real step');

    // Instances are where the trees stand, coloured by species.
    const someMesh = forest.group.children.find((node) => node.isInstancedMesh && node.visible && node.count > 0);
    const m = new THREE.Matrix4();
    someMesh.getMatrixAt(0, m);
    const at = new THREE.Vector3().setFromMatrixPosition(m);
    const feature = naturalFeaturesInRegion(DEFAULT_WORLD_SEED, at.x - 0.01, at.z - 0.01, at.x + 0.01, at.z + 0.01)[0];
    assert(feature && Math.abs(feature.y - at.y) < 1e-3, 'an instance stands on a real tree\'s spot');
    assert(someMesh.customDepthMaterial && someMesh.frustumCulled === false, 'its shadow sways with it, and the pool culls it itself');
    const colour = new THREE.Color();
    someMesh.getColorAt(0, colour);
    assert(colour.r > 0 && colour.g > 0 && colour.b > 0, 'it has a colour');

    // LOW: no leaf cards at all.
    forest.setDetail(TREE_DETAIL.LOW);
    assert(forest.detail === TREE_DETAIL.LOW && forest.update(camera) === true, 'a new detail re-sorts at once');
    assert(forest.lodCounts.NEAR === 0 && forest.lodCounts.MID > 0, 'LOW draws nothing in full detail');
    let cards = 0;
    forest.group.traverse((node) => {
        if (node.isInstancedMesh && node.visible && node.material.alphaTest > 0) cards += node.count;
    });
    assert(cards === 0, 'so no leaf cards are drawn over each other');
    forest.setDetail('NONSENSE');
    assert(forest.detail === TREE_DETAIL.HIGH, 'an unknown detail is HIGH');

    forest.setWind(3);
    assert(forest.windStrength === 1, 'the wind is at most a gale');
    forest.setWind(Number.NaN);
    assert(forest.windStrength === 0, 'and still when unknown');

    // Walking away unloads tiles and their trees.
    streaming.update(best.x + 5000, best.z, true);
    camera.position.set(best.x + 5000, 12, best.z);
    forest.update(camera);
    const expectedThere = tilesWithinRadius(best.x + 5000, best.z, DEFAULT_STREAMING_RADIUS)
        .reduce((sum, { tx, tz }) => sum + naturalFeaturesInRegion(DEFAULT_WORLD_SEED, tx * TERRAIN_TILE_SIZE, tz * TERRAIN_TILE_SIZE,
            (tx + 1) * TERRAIN_TILE_SIZE, (tz + 1) * TERRAIN_TILE_SIZE).length, 0);
    assert(forest.treeCount === expectedThere, 'walking away swaps the old tiles\' trees for the new ones\'');
    const stillDrawn = forest.lodCounts.NEAR + forest.lodCounts.MID + forest.lodCounts.FAR;
    assert(stillDrawn <= forest.treeCount, 'only trees still streamed are drawn');

    streaming.dispose();
    assert(forest.treeCount === 0, 'every tile unloaded leaves the pool empty');
    forest.update(camera);
    assert(forest.drawnMeshCount === 0, 'and nothing is drawn');
    forest.dispose();
    assert(sink.children.length === 0, 'disposing takes the forest out of the scene');
    console.log('✓ E: the pool draws every tree at its level, culls what is out of view, in few draw calls');
}

// ---------------------------------------------------------------
// Section F — the device's choice
// ---------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    assert(new WorldViewTreeDetailStore({ storageProvider: storage }).areDetailedTreesOn() === true, 'on by default where that is cheap');
    const phone = new WorldViewTreeDetailStore({ storageProvider: storage, onByDefault: false });
    assert(phone.areDetailedTreesOn() === false, 'off by default on a phone');
    assert(phone.setDetailedTreesOn(true) === true && phone.areDetailedTreesOn() === true, 'turning them on is remembered');
    assert(new WorldViewTreeDetailStore({ storageProvider: storage }).setDetailedTreesOn('yes') === false
        && new WorldViewTreeDetailStore({ storageProvider: storage }).areDetailedTreesOn() === false,
        'and so is turning them off; only true turns them on');
    storage.save('world-view-tree-detail', 'garbage');
    assert(phone.areDetailedTreesOn() === false, 'a damaged entry falls back to the default');
    class ThrowingStorage extends StorageProvider {
        load() { throw new Error('not loaded'); }
        save() { throw new Error('full'); }
    }
    const throwing = new WorldViewTreeDetailStore({ storageProvider: new ThrowingStorage() });
    assert(throwing.areDetailedTreesOn() === true && throwing.setDetailedTreesOn(false) === false, 'a storage error is tolerated');
    let threw = false;
    try {
        new WorldViewTreeDetailStore({ storageProvider: {} });
    } catch {
        threw = true;
    }
    assert(threw, 'a StorageProvider is required');

    const nav = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => 0 });
    const details = [];
    nav._session = { setSkyLook() {}, setSkyBodies() {}, setShadowsEnabled() {}, setTreesDetailed: (on) => details.push(on), onAnimationFrame: () => () => {} };
    nav._setupDayCycle();
    assert(details.length === 0, 'until told, the renderer keeps its own default');
    nav.setDetailedTreesOn(false);
    assert(details.length === 1 && details[0] === false && nav.areDetailedTreesOn() === false, 'the choice reaches the renderer at once');
    const early = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute(), wildlifeClock: () => 0 });
    early.setDetailedTreesOn(true);
    const earlyDetails = [];
    early._session = { setSkyLook() {}, setSkyBodies() {}, setShadowsEnabled() {}, setTreesDetailed: (on) => earlyDetails.push(on), onAnimationFrame: () => () => {} };
    early._setupDayCycle();
    assert(earlyDetails.length === 1 && earlyDetails[0] === true, 'a choice made before World View drew anything reaches it when it opens');
    const old = new WorldNavigationSession({ registry: new CreateBrickRegistryUseCase().execute() });
    old._session = { onAnimationFrame: () => () => {}, setSkyLook() {} };
    old._setupDayCycle();
    old.setDetailedTreesOn(true);
    console.log('✓ F: detailed trees are this device\'s choice, handed to the renderer');
}
