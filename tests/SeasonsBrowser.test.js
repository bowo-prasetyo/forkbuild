// @environment browser
import * as THREE from 'three';
import { seasonLookAtYearDay } from '../core/nature/Season.js';
import { TERRAIN_WET, BRICK_WET, createWetSurfaces, makeWet, setSnowCover } from '../renderer/WetSurfaces.js';
import {
    DECIDUOUS, TREE_PART, createSeasonSurfaces, makeSeasonalGround, makeSeasonalTree, seasonedTreeColour, setSeason, setTreeSeasonFlags, treeSeasonFlags, treeSeasonOf
} from '../renderer/SeasonalSurfaces.js';
import { Drift, DRIFT } from '../renderer/SeasonDrift.js';
import { assert } from './support/Assert.js';

// The seasons drawn with real WebGL (renderer/SeasonalSurfaces.js,
// renderer/WetSurfaces.js' snow, renderer/SeasonDrift.js): the shaders
// compile, shadows included; until a season is given everything looks as it
// did; grass is greener in spring, warmer in autumn and greyer in winter;
// leaves turn in autumn and are gone in winter, and a conifer keeps its
// needles; snow whitens the ground but not walls, and less of a roof; and
// snowflakes fall.

const SIZE = 64;
const shaderErrors = [];
const originalError = console.error;
console.error = (...args) => { shaderErrors.push(args.join(' ')); originalError(...args); };

const canvas = document.createElement('canvas');
canvas.width = SIZE;
canvas.height = SIZE;
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE, false);
renderer.shadowMap.enabled = true;
const BACKGROUND = new THREE.Color(0x000000);

// The mean colour (0 to 255 a channel) of what is drawn, and how many pixels
// aren't the black background.
function mean(scene, camera) {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const out = new Uint8Array(SIZE * SIZE * 4);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, out);
    let r = 0;
    let g = 0;
    let b = 0;
    let drawn = 0;
    for (let i = 0; i < out.length; i += 4) {
        r += out[i];
        g += out[i + 1];
        b += out[i + 2];
        if (out[i] + out[i + 1] + out[i + 2] > 6) drawn++;
    }
    const n = SIZE * SIZE;
    return { r: r / n, g: g / n, b: b / n, drawn };
}

function lit(scene) {
    scene.background = BACKGROUND;
    scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x4a3d2e, 1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    sun.position.set(2, 10, 6);
    sun.castShadow = true;
    scene.add(sun);
}

// A flat patch of ground filling the view, every vertex `cover` grass and field.
function groundScene(material, cover = [1, 0]) {
    const scene = new THREE.Scene();
    lit(scene);
    const geometry = new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2);
    const covers = new Float32Array(geometry.getAttribute('position').count * 2);
    for (let i = 0; i < covers.length; i += 2) covers.set(cover, i);
    geometry.setAttribute('groundCover', new THREE.BufferAttribute(covers, 2));
    const plane = new THREE.Mesh(geometry, material);
    plane.position.set(300, 2, -500);
    plane.receiveShadow = true;
    scene.add(plane);
    return scene;
}
const groundCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
groundCamera.position.set(300, 8, -496);
groundCamera.lookAt(300, 2, -500);

const GRASS = 0x94ab82;

// The grass through the year.
{
    const plain = mean(groundScene(new THREE.MeshStandardMaterial({ color: GRASS })), groundCamera);
    const wet = createWetSurfaces();
    const season = createSeasonSurfaces();
    const material = makeSeasonalGround(makeWet(new THREE.MeshStandardMaterial({ color: GRASS }), wet, TERRAIN_WET), season);
    const scene = groundScene(material);
    const before = mean(scene, groundCamera);
    assert(Math.abs(before.r - plain.r) < 0.6 && Math.abs(before.g - plain.g) < 0.6 && Math.abs(before.b - plain.b) < 0.6,
        `until a season is given, the ground looks just as before (${JSON.stringify(before)} vs ${JSON.stringify(plain)})`);
    const look = (day) => {
        setSeason(season, seasonLookAtYearDay(day));
        return mean(scene, groundCamera);
    };
    const spring = look(5.5);
    const autumn = look(20);
    const winter = look(27);
    const greenness = (c) => c.g / (c.r + c.b);
    const warmth = (c) => c.r / c.g;
    const saturation = (c) => Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    assert(greenness(spring) > greenness(before) && greenness(spring) > greenness(autumn), 'spring\'s grass is fresh and green');
    assert(warmth(autumn) > warmth(before) && warmth(autumn) > warmth(spring), 'autumn\'s is warmer, browner');
    assert(saturation(winter) < saturation(spring) * 0.75, 'winter\'s is dull');

    // Rock and water take no season.
    setSeason(season, seasonLookAtYearDay(20));
    const rock = mean(groundScene(material.clone(), [0, 0]), groundCamera);
    assert(Math.abs(rock.r - plain.r) < 1.5 && Math.abs(rock.g - plain.g) < 1.5, 'what isn\'t grass or field keeps its colour');

    // A field ripens gold.
    const field = groundScene(material, [0, 1]);
    setSeason(season, seasonLookAtYearDay(11));
    const green = mean(field, groundCamera);
    setSeason(season, seasonLookAtYearDay(14.5));
    const ripe = mean(field, groundCamera);
    assert(warmth(ripe) > warmth(green) * 1.1, `a field ripens gold (${warmth(green).toFixed(2)} to ${warmth(ripe).toFixed(2)})`);
    console.log('✓ the grass greens, browns and dulls, and the fields ripen');
}

// Snow lies on the ground, less on a roof, not on walls; and not in the room
// the avatar stands in.
{
    const wet = createWetSurfaces();
    const ground = groundScene(makeWet(new THREE.MeshStandardMaterial({ color: GRASS }), wet, TERRAIN_WET));
    const bare = mean(ground, groundCamera);
    setSnowCover(wet, 1);
    const snowy = mean(ground, groundCamera);
    assert(snowy.r > bare.r * 1.3 && snowy.b > bare.b * 1.3 && Math.abs(snowy.r - snowy.g) < 25, `a blanket of snow whitens the ground (${JSON.stringify(snowy)})`);
    setSnowCover(wet, 0.35);
    const patchy = mean(ground, groundCamera);
    assert(patchy.r > bare.r && patchy.r < snowy.r, 'a little snow lies in patches');

    // A wall, square on.
    const wallScene = new THREE.Scene();
    lit(wallScene);
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), makeWet(new THREE.MeshStandardMaterial({ color: 0x8a5a44 }), wet, BRICK_WET));
    wall.position.set(300, 2, -520);
    wallScene.add(wall);
    const wallCamera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
    wallCamera.position.set(300, 2, -510);
    wallCamera.lookAt(300, 2, -520);
    setSnowCover(wet, 0);
    const dryWall = mean(wallScene, wallCamera);
    setSnowCover(wet, 1);
    const snowedWall = mean(wallScene, wallCamera);
    assert(Math.abs(snowedWall.r - dryWall.r) < 1 && Math.abs(snowedWall.b - dryWall.b) < 1, 'walls stay clear');

    // A brick roof never wholly white.
    const roof = groundScene(makeWet(new THREE.MeshStandardMaterial({ color: 0xb04030 }), wet, BRICK_WET));
    const roofSnow = mean(roof, groundCamera);
    assert(roofSnow.r - roofSnow.b > 5, `a roof under snow still shows its colour (${JSON.stringify(roofSnow)})`);

    // Inside the avatar's build, none.
    wet.shelter.value.set(280, 320, -520, -480);
    wet.shelterBelow.value = 4;
    const sheltered = mean(ground, groundCamera);
    assert(Math.abs(sheltered.r - bare.r) < 1, 'no snow in the room the avatar stands in');
    console.log('✓ snow lies on the ground and roofs, not on walls or indoors');
}

// Leaves: they turn in autumn, are gone in winter; a conifer's stay; fruit
// hangs among them.
{
    const BASE = [0.37, 0.54, 0.24];
    const NUMBERS = [0.5, 0.1, 0.1];
    const leafScene = (deciduous, day) => {
        const look = day === null ? null : seasonLookAtYearDay(day);
        const season = treeSeasonOf(look, NUMBERS, deciduous);
        const scene = new THREE.Scene();
        lit(scene);
        const geometry = new THREE.PlaneGeometry(40, 40, 8, 8).rotateX(-Math.PI / 2);
        const count = geometry.getAttribute('position').count;
        const treeSeason = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) treeSeason.set([season.leaf, season.fruit, season.fruitKind], i * 3);
        geometry.setAttribute('treeSeason', new THREE.BufferAttribute(treeSeason, 3));
        const colour = seasonedTreeColour(BASE, season);
        const material = makeSeasonalTree(new THREE.MeshStandardMaterial({ color: new THREE.Color(...colour), side: THREE.DoubleSide }), { part: TREE_PART.LEAVES });
        const depth = makeSeasonalTree(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }), { part: TREE_PART.LEAVES, depth: true });
        setTreeSeasonFlags(material, treeSeasonFlags(look));
        setTreeSeasonFlags(depth, treeSeasonFlags(look));
        const leaves = new THREE.Mesh(geometry, material);
        leaves.position.set(300, 2, -500);
        leaves.castShadow = true;
        leaves.customDepthMaterial = depth;
        scene.add(leaves);
        return mean(scene, groundCamera);
    };
    const plain = leafScene(DECIDUOUS.FULLY, null);
    const autumn = leafScene(DECIDUOUS.FULLY, 20);
    assert(autumn.r / autumn.g > (plain.r / plain.g) * 1.3, `autumn turns the leaves (${JSON.stringify(plain)} to ${JSON.stringify(autumn)})`);
    const thinning = leafScene(DECIDUOUS.FULLY, 22.5);
    assert(thinning.drawn < SIZE * SIZE * 0.85 && thinning.drawn > 0, `then they fall (${thinning.drawn} of ${SIZE * SIZE} pixels)`);
    assert(leafScene(DECIDUOUS.FULLY, 27).drawn === 0, 'in winter a broadleaf is bare');
    const needles = leafScene(DECIDUOUS.NEVER, 27);
    assert(needles.drawn === SIZE * SIZE && Math.abs(needles.g - plain.g) < 12, 'a conifer keeps its needles, green');
    const scrub = leafScene(DECIDUOUS.PARTLY, 27);
    assert(scrub.drawn > 0 && scrub.drawn < SIZE * SIZE, 'scrub keeps some');

    // Fruit: on a fruiting tree at harvest, red specks among the leaves.
    const harvest = seasonLookAtYearDay(14.5);
    const fruiting = treeSeasonOf(harvest, [0.2, 0.5, 0.2], DECIDUOUS.FULLY);
    assert(fruiting.fruit > 0.1, 'setup: a fruiting tree');
    const withFruit = (() => {
        const scene = new THREE.Scene();
        lit(scene);
        const geometry = new THREE.PlaneGeometry(40, 40).rotateX(-Math.PI / 2);
        const count = geometry.getAttribute('position').count;
        geometry.setAttribute('treeSeason', new THREE.BufferAttribute(new Float32Array(count * 3).map((_, i) => [1, 1, 0][i % 3]), 3));
        const material = makeSeasonalTree(new THREE.MeshStandardMaterial({ color: new THREE.Color(...BASE) }), { part: TREE_PART.LEAVES });
        setTreeSeasonFlags(material, treeSeasonFlags(harvest));
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(300, 2, -500);
        scene.add(mesh);
        return mean(scene, groundCamera);
    })();
    assert(withFruit.r > withFruit.g * 1.5, `where every speck is fruit, it is red (${JSON.stringify(withFruit)})`);
    console.log('✓ leaves turn and fall; conifers stay green; fruit hangs');
}

// Snowflakes, leaves and petals fall.
{
    for (const kind of Object.values(DRIFT)) {
        const scene = new THREE.Scene();
        scene.background = BACKGROUND;
        const drift = new Drift({ add: (o) => scene.add(o), remove: (o) => scene.remove(o) }, kind);
        const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
        camera.position.set(120, 5, -40);
        camera.lookAt(120, 5, -50);
        camera.updateMatrixWorld();
        drift.update(camera, 4, undefined, false, { pixelHeight: SIZE });
        assert(mean(scene, camera).drawn === 0, `${kind}: nothing falling, nothing drawn`);
        drift.set(1);
        drift.update(camera, 4, undefined, false, { pixelHeight: SIZE * 4 });
        const falling = mean(scene, camera);
        assert(falling.drawn > 4, `${kind} falls (${falling.drawn} pixels)`);
        drift.dispose();
    }
    console.log('✓ snowflakes, leaves and petals fall');
}

assert(!shaderErrors.some((e) => /Shader|WebGLProgram/.test(e)), `the seasons' shaders compile (${shaderErrors.join(' | ')})`);
console.error = originalError;
renderer.dispose();
