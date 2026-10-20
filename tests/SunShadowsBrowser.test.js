// @environment browser
import * as THREE from 'three';
import { Lights } from '../renderer/Lights.js';
import { SunShadows, SHADOW_RADIUS, SHADOW_MAP_SIZE, snapToTexels } from '../renderer/SunShadows.js';
import { receiveShadows } from '../renderer/ShadowRoles.js';
import { BrickInstanceRegistry } from '../renderer/BrickInstanceRegistry.js';
import { BrickRenderer } from '../renderer/BrickRenderer.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { Brick } from '../core/building/Brick.js';
import { Position } from '../core/document/Position.js';
import { DAY } from '../core/nature/DayCycle.js';
import { assert } from './support/Assert.js';

// The sun's and the moon's shadows, drawn with real WebGL
// (renderer/SunShadows.js): a brick casts one on the ground only while
// shadows are on, instanced and standalone bricks alike, the light's
// strength fades it, and the shaders still compile with the night glow.

const SIZE = 64;
const VIEW = 4;
const shaderErrors = [];
const originalError = console.error;
console.error = (...args) => { shaderErrors.push(args.join(' ')); originalError(...args); };

const canvas = document.createElement('canvas');
canvas.width = SIZE;
canvas.height = SIZE;
document.body.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true });
renderer.setSize(SIZE, SIZE, false);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const sceneManager = { add: (o) => scene.add(o), remove: (o) => scene.remove(o) };
const lights = new Lights(sceneManager);
lights.applyLook(DAY);
const shadows = new SunShadows(renderer, lights);

// Looking straight down on a grey ground; x to the right, z down the picture.
const camera = new THREE.OrthographicCamera(-VIEW, VIEW, VIEW, -VIEW, 0.1, 100);
camera.position.set(0, 50, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);
const ground = receiveShadows(new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x999999 })));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// The light from up and to the right (+x), at 45°: a 1-high brick's shadow
// reaches 1 to its left.
lights.setDirection({ x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 });

// Brightness of the ground at (x, z).
function brightnessAt(x, z) {
    shadows.follow({ x: 0, y: 0, z: 0 });
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const out = new Uint8Array(4);
    const px = Math.round(((x + VIEW) / (2 * VIEW)) * SIZE);
    const py = Math.round(((VIEW - z) / (2 * VIEW)) * SIZE);
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out[0] + out[1] + out[2];
}

const registry = new CreateBrickRegistryUseCase().execute();
const instances = new BrickInstanceRegistry(scene);
instances.add('cube', 'doc', 'b', { definitionId: 'core:cube', x: 0, y: 0.5, z: -2, rotationY: 0, color: 0x888888, glow: 0 });
// A lantern among them: its night glow and the shadow lookup share a shader.
instances.add('lantern', 'doc', 'b', { definitionId: 'core:lantern', x: 3, y: 0.5, z: 3, rotationY: 0, color: 0xffd54f, glow: 0xffd54f });
instances.setNightGlow(1);
const standalone = new BrickRenderer(registry).createMesh(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 2), color: 0x888888 }));
scene.add(standalone);

const SHADED = [-1, -2];
const STANDALONE_SHADED = [-1, 2];
const OPEN = [-1, 0];

const openOff = brightnessAt(...OPEN);
const shadedOff = brightnessAt(...SHADED);
assert(Math.abs(openOff - shadedOff) < 6, `with shadows off, the ground beside a brick is as lit as open ground (${shadedOff} vs ${openOff})`);
assert(!shadows.enabled && !renderer.shadowMap.enabled && !lights.directional.castShadow, 'shadows start off');

shadows.setEnabled(true);
const openOn = brightnessAt(...OPEN);
const shadedOn = brightnessAt(...SHADED);
const standaloneOn = brightnessAt(...STANDALONE_SHADED);
assert(shadedOn < openOn * 0.8, `turned on, an instanced brick casts a shadow on the ground (${shadedOn} vs ${openOn})`);
assert(standaloneOn < openOn * 0.8, `and so does a standalone brick (${standaloneOn} vs ${openOn})`);
assert(Math.abs(openOn - openOff) < 6, `open ground looks the same either way (${openOn} vs ${openOff})`);
assert(brightnessAt(1, -2) > openOn * 0.9, 'nothing falls on the sunny side');

lights.setDirection({ x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 }, 0);
const faded = brightnessAt(...SHADED);
assert(Math.abs(faded - brightnessAt(...OPEN)) < 8, `with the light handed over to fill, the shadow is gone (${faded})`);
lights.setDirection({ x: Math.SQRT1_2, y: Math.SQRT1_2, z: 0 }, 1);

shadows.setEnabled(false);
assert(Math.abs(brightnessAt(...SHADED) - shadedOff) < 6, 'turned off again, the shadow goes');
assert(!renderer.shadowMap.enabled && !lights.directional.castShadow, 'and nothing draws one');
console.log('✓ bricks cast shadows from the sun while shadows are on, and only then');

// The shadowed square follows the focus in whole texels across the light.
{
    const texel = (SHADOW_RADIUS * 2) / SHADOW_MAP_SIZE;
    const direction = { x: 0.3, y: 0.8, z: -0.52 };
    const along = new THREE.Vector3(direction.x, direction.y, direction.z).normalize();
    // How far apart two points are across the light (moving along it moves
    // nothing in the shadow map).
    const across = (p, q) => {
        const d = new THREE.Vector3(p.x - q.x, p.y - q.y, p.z - q.z);
        return d.sub(along.clone().multiplyScalar(d.dot(along))).length();
    };
    const a = snapToTexels({ x: 10, y: 2, z: -7 }, direction);
    assert(across(a, snapToTexels(a, direction)) < 1e-9, 'a snapped point stays put');
    const b = snapToTexels({ x: a.x + texel * 0.2, y: a.y, z: a.z }, direction);
    assert(across(a, b) < 1e-9, 'a step smaller than half a texel leaves the shadows where they are');
    const far = snapToTexels({ x: a.x + texel * 10, y: a.y, z: a.z }, direction);
    assert(across(far, a) > texel * 5, 'a longer one moves them');
    const overhead = snapToTexels({ x: 4.01, y: 0, z: 1 }, { x: 0, y: 1, z: 0 });
    assert(Number.isFinite(overhead.x) && Math.abs(overhead.x - 4.01) <= texel, 'with the light straight overhead it still works');
    shadows.setEnabled(true);
    shadows.follow({ x: 100, y: 3, z: -50 });
    const target = lights.directional.target.position;
    assert(Math.hypot(target.x - 100, target.z + 50) < texel * 2, 'the light shines on the focus');
    const away = lights.directional.position.clone().sub(target).normalize();
    assert(away.angleTo(new THREE.Vector3(Math.SQRT1_2, Math.SQRT1_2, 0)) < 1e-6, 'from the sun\'s direction');
    shadows.setEnabled(false);
    const before = target.clone();
    shadows.follow({ x: 0, y: 0, z: 0 });
    assert(target.equals(before), 'while off, following moves nothing');
    console.log('✓ the shadowed square follows the focus in whole texels');
}

assert(!shaderErrors.some((e) => /Shader|WebGLProgram/.test(e)), `the shaders compile with shadows (${shaderErrors.join(' | ')})`);
console.error = originalError;
renderer.dispose();
