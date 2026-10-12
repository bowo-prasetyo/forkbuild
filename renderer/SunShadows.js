import * as THREE from 'three';

// Shadows cast by World View's sun and moon: the scene's one directional
// light (renderer/Lights.js) casts them, over a square SHADOW_RADIUS each
// way round a focus that follows the camera's target (the avatar, or what
// the camera orbits). Past that nothing casts a shadow, as in most games:
// one shadow map, so the cost stays the same however far the world goes.
//
// What casts and what receives is each mesh's own castShadow/receiveShadow
// (renderer/ShadowRoles.js); this only turns the light's shadows on and
// off and keeps its shadow camera over the focus. Off, nothing is drawn
// twice and the scene looks exactly as it did before shadows.
//
// The focus moves in whole shadow-map texels, measured across the light, so
// shadow edges don't shimmer as the avatar walks.

// Metres from the focus to each side of the shadowed square.
export const SHADOW_RADIUS = 45;
// The shadow map's size in texels: 90 m / 2048, about 4.4 cm a texel.
export const SHADOW_MAP_SIZE = 2048;
// From the light (renderer/Lights.js stands it 120 m towards the sun or the
// moon) to well past the focus, so a tall build or a hill behind it still
// casts and receives.
const SHADOW_NEAR = 1;
const SHADOW_FAR = 300;
// Keep brick faces from shadowing themselves in stripes ("shadow acne")
// without lifting shadows off the ground under them.
const SHADOW_BIAS = -0.0004;
const SHADOW_NORMAL_BIAS = 0.03;

const _lightSpace = new THREE.Matrix4();
const _inverse = new THREE.Matrix4();
const _point = new THREE.Vector3();
const _origin = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _north = new THREE.Vector3(0, 0, 1);
const _away = new THREE.Vector3();

export class SunShadows {
    constructor(webglRenderer, lights) {
        this._webglRenderer = webglRenderer;
        this._lights = lights;
        this._enabled = false;

        const light = lights.directional;
        const camera = light.shadow.camera;
        camera.left = -SHADOW_RADIUS;
        camera.right = SHADOW_RADIUS;
        camera.top = SHADOW_RADIUS;
        camera.bottom = -SHADOW_RADIUS;
        camera.near = SHADOW_NEAR;
        camera.far = SHADOW_FAR;
        camera.updateProjectionMatrix();
        light.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
        light.shadow.bias = SHADOW_BIAS;
        light.shadow.normalBias = SHADOW_NORMAL_BIAS;
        webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    get enabled() {
        return this._enabled;
    }

    // Turns the sun's and the moon's shadows on or off. Both the renderer's
    // shadow map and the light's castShadow change, so three.js rebuilds the
    // lit materials once to add or drop the shadow lookup.
    setEnabled(enabled) {
        const next = enabled === true;
        if (next === this._enabled) {
            return;
        }
        this._enabled = next;
        this._webglRenderer.shadowMap.enabled = next;
        this._lights.directional.castShadow = next;
        if (!next) {
            this._lights.directional.shadow.map?.dispose();
            this._lights.directional.shadow.map = null;
        }
    }

    // Centres the shadowed square on `focus` ({x, y, z}), moved to the
    // nearest whole texel across the light. Called every frame; does
    // nothing while shadows are off.
    follow(focus) {
        if (!this._enabled || !focus) {
            return;
        }
        this._lights.setFocus(snapToTexels(focus, this._lights.direction));
    }
}

// `focus` moved, across the light's direction, to a whole multiple of a
// shadow-map texel; along the light it is left alone, which moves nothing in
// the map.
export function snapToTexels(focus, direction) {
    const texel = (SHADOW_RADIUS * 2) / SHADOW_MAP_SIZE;
    _away.set(direction.x, direction.y, direction.z);
    // A basis looking down the light; with the light straight overhead,
    // `up` would be along it, so any other axis serves.
    const up = Math.abs(_away.y) > 0.999 ? _north : _up;
    _lightSpace.lookAt(_origin, _away, up);
    _inverse.copy(_lightSpace).invert();
    _point.set(focus.x, focus.y, focus.z).applyMatrix4(_inverse);
    _point.x = Math.round(_point.x / texel) * texel;
    _point.y = Math.round(_point.y / texel) * texel;
    _point.applyMatrix4(_lightSpace);
    return { x: _point.x, y: _point.y, z: _point.z };
}
