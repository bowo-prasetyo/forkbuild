import * as THREE from 'three';

// The sun and the moon in World View's sky (core/DayCycle.js#skyBodiesAt()):
// a disc each, with a soft halo round the sun, drawn as far off as the
// camera sees and kept there as it moves, so they hang in the sky like the
// sky itself instead of being walked up to. Builds and hills in front hide
// them. Nothing else in the scene is lit or shaded by them: the scene's
// directional light (renderer/Lights.js) is aimed separately.
//
// Their size is a matter of looks, not astronomy: about five times the real
// sun's and moon's half a degree, enough to read as a sun on a phone.

const SUN_RADIUS = Math.tan((1.25 * Math.PI) / 180);
const SUN_HALO_RADIUS = SUN_RADIUS * 2.6;
const MOON_RADIUS = SUN_RADIUS * 0.9;
// The sun is pale gold high up and turns orange near the horizon.
const SUN_HIGH = new THREE.Color(0xfff4d6);
const SUN_LOW = new THREE.Color(0xffa257);
const MOON_COLOR = 0xe4ebff;
// As a share of the camera's far plane, so the discs stay inside it.
const DISTANCE_SHARE = 0.8;

export class SkyBodies {
    constructor(sceneManager) {
        this._sceneManager = sceneManager;
        this._bodies = null;
        this._sun = disc(SUN_RADIUS, SUN_HIGH.getHex(), 1, -2);
        this._sunHalo = disc(SUN_HALO_RADIUS, SUN_HIGH.getHex(), 0.22, -3);
        this._moon = disc(MOON_RADIUS, MOON_COLOR, 1, -2);
        for (const mesh of this._meshes()) {
            mesh.visible = false;
            sceneManager.add(mesh);
        }
    }

    // `bodies` shaped like core/DayCycle.js#skyBodiesAt()'s result.
    set(bodies) {
        this._bodies = bodies || null;
    }

    // Places the sun and the moon round `camera` for this frame; `hidden`
    // (under water) puts both out of sight.
    update(camera, hidden = false) {
        const bodies = hidden ? null : this._bodies;
        const distance = camera.far * DISTANCE_SHARE;
        const sun = bodies ? bodies.sun : null;
        place(this._sun, camera, sun, distance);
        place(this._sunHalo, camera, sun, distance);
        if (sun) {
            const color = SUN_LOW.clone().lerp(SUN_HIGH, Math.min(Math.max(sun.y / 0.35, 0), 1));
            this._sun.material.color.copy(color);
            this._sunHalo.material.color.copy(color);
        }
        place(this._moon, camera, bodies ? bodies.moon : null, distance);
    }

    get sun() {
        return this._sun;
    }

    get moon() {
        return this._moon;
    }

    dispose() {
        for (const mesh of this._meshes()) {
            this._sceneManager.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
    }

    _meshes() {
        return [this._sunHalo, this._sun, this._moon];
    }
}

// A disc of unit-distance `radius`, unlit and untouched by fog, drawn before
// everything else so a build in front always covers it.
function disc(radius, color, opacity, renderOrder) {
    const material = new THREE.MeshBasicMaterial({
        color,
        fog: false,
        depthWrite: false,
        transparent: opacity < 1,
        opacity
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), material);
    mesh.renderOrder = renderOrder;
    mesh.frustumCulled = false;
    mesh.userData.skyBody = true;
    return mesh;
}

function place(mesh, camera, direction, distance) {
    if (!direction) {
        mesh.visible = false;
        return;
    }
    mesh.visible = true;
    mesh.position.set(
        camera.position.x + direction.x * distance,
        camera.position.y + direction.y * distance,
        camera.position.z + direction.z * distance
    );
    mesh.scale.setScalar(distance);
    mesh.quaternion.copy(camera.quaternion);
}
