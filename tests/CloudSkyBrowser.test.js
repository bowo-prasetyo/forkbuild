// @environment browser
import * as THREE from 'three';
import { CloudSky } from '../renderer/CloudSky.js';
import { DAY, NIGHT } from '../core/nature/DayCycle.js';
import { FAIR_WEATHER, weatherOfCover, overcastLook } from '../core/nature/Weather.js';
import { assert } from './support/Assert.js';

// The clouds drawn with real WebGL (renderer/CloudSky.js): the shader
// compiles; a clear sky has none; they hide about as much of the sky as the
// weather says, more the cloudier it is; they drift by the clock, the same
// for the same moment; they stay above the horizon; and something in front,
// a build or a hill, covers them.

const SIZE = 96;
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
scene.background = new THREE.Color(DAY.sky);
const clouds = new CloudSky({ add: (o) => scene.add(o), remove: (o) => scene.remove(o) });
// Looking straight up.
const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 1000);
camera.position.set(120, 2, -340);
camera.up.set(0, 0, 1);
camera.lookAt(120, 3, -340);

function pixels() {
    renderer.render(scene, camera);
    const gl = renderer.getContext();
    const out = new Uint8Array(SIZE * SIZE * 4);
    gl.readPixels(0, 0, SIZE, SIZE, gl.RGBA, gl.UNSIGNED_BYTE, out);
    return out;
}

// The share of the picture that is not the bare sky.
// The sky's colour as it lands on the canvas: sRGB bytes.
function rgb(hex) {
    return { r: ((hex >> 16) & 0xff) / 255, g: ((hex >> 8) & 0xff) / 255, b: (hex & 0xff) / 255 };
}

function clouded(look = DAY) {
    const sky = rgb(look.sky);
    const out = pixels();
    let changed = 0;
    for (let i = 0; i < out.length; i += 4) {
        const d = Math.abs(out[i] - sky.r * 255) + Math.abs(out[i + 1] - sky.g * 255) + Math.abs(out[i + 2] - sky.b * 255);
        if (d > 12) changed++;
    }
    return changed / (SIZE * SIZE);
}

function show(weather, seconds = 1000, look = DAY, hidden = false) {
    scene.background.setHex(look.sky);
    clouds.set(weather);
    clouds.update(camera, seconds, look, hidden);
}

{
    show(FAIR_WEATHER);
    assert(!clouds.mesh.visible && clouded() === 0, 'a clear sky has no clouds, and nothing is drawn for them');

    // Averaged over places far apart: under any one spot a cloud may
    // hang overhead, or none.
    const spots = Array.from({ length: 12 }, (_, k) => ({ x: k * 997.3, z: k * -613.1 }));
    const averageClouded = (weather, look = DAY) => {
        let sum = 0;
        for (const spot of spots) {
            camera.position.set(spot.x, 2, spot.z);
            camera.lookAt(spot.x, 3, spot.z);
            show(weather, 1000, look);
            sum += clouded(look);
        }
        camera.position.set(120, 2, -340);
        camera.lookAt(120, 3, -340);
        return sum / spots.length;
    };
    const fair = averageClouded(weatherOfCover(0.15));
    const cloudy = averageClouded(weatherOfCover(0.5));
    const grey = weatherOfCover(1);
    const overcast = averageClouded(grey, overcastLook(DAY, grey.overcast));
    assert(fair > 0.05 && fair < 0.3, `a fair sky has a few clouds (${fair.toFixed(2)})`);
    assert(cloudy > fair && cloudy > 0.3 && cloudy < 0.7, `a cloudy one has more (${cloudy.toFixed(2)})`);
    assert(overcast > 0.97, `and an overcast one is covered (${overcast.toFixed(2)})`);
    console.log(`✓ the clouds cover as much of the sky as the weather says (${fair.toFixed(2)}, ${cloudy.toFixed(2)}, ${overcast.toFixed(2)})`);
}

{
    // By day they are brighter than the sky; at night, dim.
    show(weatherOfCover(0.5), 1000, DAY);
    const day = pixels();
    show(weatherOfCover(0.5), 1000, NIGHT);
    const night = pixels();
    let dayBright = 0;
    let nightBright = 0;
    for (let i = 0; i < day.length; i += 4) {
        dayBright = Math.max(dayBright, day[i] + day[i + 1] + day[i + 2]);
        nightBright = Math.max(nightBright, night[i] + night[i + 1] + night[i + 2]);
    }
    const daySky = rgb(DAY.sky);
    assert(dayBright > (daySky.r + daySky.g + daySky.b) * 255 + 40, 'by day clouds are white against the blue');
    assert(nightBright < 330, `at night they are dim (${nightBright})`);
    console.log('✓ white clouds by day, dim ones at night');
}

{
    const cloudy = weatherOfCover(0.5);
    show(cloudy, 5000);
    const a = pixels();
    show(cloudy, 5000);
    const again = pixels();
    show(cloudy, 5060);
    const later = pixels();
    let same = true;
    let moved = 0;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== again[i]) same = false;
        if (Math.abs(a[i] - later[i]) > 6) moved++;
    }
    assert(same, 'the same moment shows the same clouds');
    assert(moved > 50, `a minute later the wind has moved them (${moved} channels)`);
    // At a far-off time the clock's size costs no precision: they still
    // change smoothly from one second to the next.
    show(cloudy, 1_800_000_000);
    const far = pixels();
    show(cloudy, 1_800_000_001);
    const farNext = pixels();
    let jump = 0;
    for (let i = 0; i < far.length; i++) jump = Math.max(jump, Math.abs(far[i] - farNext[i]));
    assert(jump < 40, `years on from 1970 they still drift smoothly (${jump})`);
    console.log('✓ the clouds drift with the wind by the clock');
}

{
    // Looking level, the lower half of the view (below the horizon) has none.
    camera.up.set(0, 1, 0);
    camera.lookAt(120, 2, -400);
    show(weatherOfCover(1), 1000, DAY);
    const out = pixels();
    const sky = rgb(DAY.sky);
    let below = 0;
    for (let y = 0; y < SIZE / 2 - 2; y++) {
        for (let x = 0; x < SIZE; x++) {
            const i = (y * SIZE + x) * 4;
            if (Math.abs(out[i] - sky.r * 255) + Math.abs(out[i + 1] - sky.g * 255) + Math.abs(out[i + 2] - sky.b * 255) > 12) below++;
        }
    }
    assert(below === 0, `no clouds below the horizon (${below})`);
    camera.up.set(0, 0, 1);
    camera.lookAt(120, 3, -340);

    // Something in front, a build or a hill, covers them.
    const cover = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshBasicMaterial({ color: 0x000000 }));
    cover.position.set(120, 60, -340);
    cover.rotation.x = Math.PI / 2;
    scene.add(cover);
    scene.background.setHex(0x000000);
    clouds.update(camera, 1000, DAY, false);
    const covered = pixels();
    let lit = 0;
    for (let i = 0; i < covered.length; i += 4) if (covered[i] + covered[i + 1] + covered[i + 2] > 0) lit++;
    assert(lit === 0, 'anything in front hides them');
    scene.remove(cover);

    show(weatherOfCover(1), 1000, DAY, true);
    assert(!clouds.mesh.visible, 'under water they don\'t show');
    console.log('✓ the clouds stay in the sky, behind whatever is in front');
}

assert(!shaderErrors.some((e) => /Shader|WebGLProgram/.test(e)), `the clouds' shader compiles (${shaderErrors.join(' | ')})`);
console.error = originalError;
clouds.dispose();
renderer.dispose();
