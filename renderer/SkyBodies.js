import * as THREE from 'three';

// The sun and the moon in World View's sky (core/nature/DayCycle.js#skyBodiesAt()):
// a disc each, with a soft halo round the sun, drawn as far off as the
// camera sees and kept there as it moves, so they hang in the sky like the
// sky itself instead of being walked up to. Builds and hills in front hide
// them. Nothing else in the scene is lit or shaded by them: the scene's
// directional light (renderer/Lights.js) is aimed separately.
//
// Their size is a matter of looks, not astronomy: about five times the real
// sun's and moon's half a degree, enough to read as a sun on a phone.
//
// The moon shows its phase (core/nature/DayCycle.js's MOON_PHASES): each point of
// its disc stands for a point on a ball facing the viewer, lit where that
// ball faces bodies.moonLitFrom, with a soft edge between light and dark,
// darker seas on the lit side, and the dark side only a little paler than
// the sky behind it (earthshine), so a new moon is barely there but still
// hides the stars behind it. A faint halo round it grows with how much of
// it is lit.

const SUN_RADIUS = Math.tan((1.25 * Math.PI) / 180);
const SUN_HALO_RADIUS = SUN_RADIUS * 2.6;
const MOON_RADIUS = SUN_RADIUS * 0.9;
// The sun is pale gold high up and turns orange near the horizon.
const SUN_HIGH = new THREE.Color(0xfff4d6);
const SUN_LOW = new THREE.Color(0xffa257);
const MOON_COLOR = 0xe4ebff;
const MOON_HALO_RADIUS = MOON_RADIUS * 2.4;
// The halo's opacity under a full moon, less as less of it is lit.
const MOON_HALO_OPACITY = 0.12;
// The moon's dark side: the sky behind it, this far towards EARTHSHINE (as
// the colours are written, so it reads as faint on a dark sky as on a light).
const EARTHSHINE = new THREE.Color(0x7d8fc0);
const EARTHSHINE_SHARE = 0.07;
// Behind the moon until the first sky is set.
const DEFAULT_SKY = 0x1b2a4e;

const MOON_VERTEX = /* glsl */ `
    varying vec2 vDisc;
    void main() {
        vDisc = uv * 2.0 - 1.0;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

// uLight: where the light falls on the moon from, in the disc's own frame
// (x right, y up, z towards the viewer). The seas are soft patches where the
// real near side's largest maria are, as seen from the north.
const MOON_FRAGMENT = /* glsl */ `
    uniform vec3 uLight;
    uniform vec3 uLit;
    uniform vec3 uDark;
    varying vec2 vDisc;
    float sea(vec2 at, float radius) {
        float d = length(vDisc - at) / radius;
        return 1.0 - smoothstep(0.35, 1.0, d);
    }
    void main() {
        float r2 = min(dot(vDisc, vDisc), 1.0);
        vec3 normal = vec3(vDisc, sqrt(1.0 - r2));
        float lit = smoothstep(-0.07, 0.07, dot(normal, uLight));
        float seas = sea(vec2(-0.32, 0.42), 0.3) + sea(vec2(0.18, 0.4), 0.2) + sea(vec2(0.34, 0.08), 0.24)
            + sea(vec2(-0.55, -0.02), 0.36) + sea(vec2(-0.14, -0.42), 0.2) + sea(vec2(0.68, 0.3), 0.12)
            + sea(vec2(0.52, -0.2), 0.15);
        vec3 day = uLit * (1.0 - 0.2 * min(seas, 1.4)) * (0.86 + 0.14 * normal.z);
        gl_FragColor = vec4(mix(uDark, day, lit), 1.0);
        #include <colorspace_fragment>
    }
`;
// As a share of the camera's far plane, so the discs stay inside it.
const DISTANCE_SHARE = 0.8;

export class SkyBodies {
    constructor(sceneManager) {
        this._sceneManager = sceneManager;
        this._bodies = null;
        this._sun = disc(SUN_RADIUS, SUN_HIGH.getHex(), 1, -2);
        this._sunHalo = disc(SUN_HALO_RADIUS, SUN_HIGH.getHex(), 0.22, -3);
        this._moon = moonDisc();
        this._moonHalo = disc(MOON_HALO_RADIUS, MOON_COLOR, MOON_HALO_OPACITY, -3);
        this._sky = new THREE.Color(DEFAULT_SKY);
        for (const mesh of this._meshes()) {
            mesh.visible = false;
            sceneManager.add(mesh);
        }
    }

    // `bodies` shaped like core/nature/DayCycle.js#skyBodiesAt()'s result.
    set(bodies) {
        this._bodies = bodies || null;
    }

    // Places the sun and the moon round `camera` for this frame; `hidden`
    // (under water) puts both out of sight. `sky` is the sky's colour behind
    // them (core/nature/DayCycle.js's look.sky), which the moon's dark side is
    // drawn from.
    update(camera, hidden = false, sky = null) {
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
        const moon = bodies ? bodies.moon : null;
        place(this._moon, camera, moon, distance);
        place(this._moonHalo, camera, moon, distance);
        if (moon) {
            this._shadeMoon(camera, moon, bodies.moonLitFrom, sky);
        }
    }

    get sun() {
        return this._sun;
    }

    get moon() {
        return this._moon;
    }

    get moonHalo() {
        return this._moonHalo;
    }

    dispose() {
        for (const mesh of this._meshes()) {
            this._sceneManager.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
    }

    _meshes() {
        return [this._sunHalo, this._sun, this._moonHalo, this._moon];
    }

    // Faces the moon's disc straight at the viewer, upright as the camera is,
    // so its ball is seen as from where the camera stands; then lights it from
    // `litFrom` (a full moon with none) and darkens its dark side to the sky.
    _shadeMoon(camera, direction, litFrom, sky) {
        const towards = scratchTowards.set(-direction.x, -direction.y, -direction.z).normalize();
        const up = scratchUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
        const right = scratchRight.crossVectors(up, towards);
        if (right.lengthSq() > 1e-10) {
            right.normalize();
            up.crossVectors(towards, right);
            this._moon.quaternion.setFromRotationMatrix(scratchBasis.makeBasis(right, up, towards));
        } else {
            right.set(1, 0, 0).applyQuaternion(camera.quaternion);
            up.set(0, 1, 0).applyQuaternion(camera.quaternion);
            towards.set(0, 0, 1).applyQuaternion(camera.quaternion);
        }
        const light = litFrom ? scratchLight.set(litFrom.x, litFrom.y, litFrom.z) : scratchLight.copy(towards);
        const uniforms = this._moon.material.uniforms;
        uniforms.uLight.value.set(light.dot(right), light.dot(up), light.dot(towards)).normalize();
        if (Number.isInteger(sky)) {
            this._sky.setHex(sky);
        }
        const behind = this._sky.getRGB(scratchSky, THREE.SRGBColorSpace);
        const shine = EARTHSHINE.getRGB(scratchShine, THREE.SRGBColorSpace);
        uniforms.uDark.value.setRGB(
            behind.r + (shine.r - behind.r) * EARTHSHINE_SHARE,
            behind.g + (shine.g - behind.g) * EARTHSHINE_SHARE,
            behind.b + (shine.b - behind.b) * EARTHSHINE_SHARE,
            THREE.SRGBColorSpace
        );
        const illumination = this._bodies && this._bodies.moonPhase && Number.isFinite(this._bodies.moonPhase.illumination)
            ? this._bodies.moonPhase.illumination
            : 1;
        this._moonHalo.material.opacity = MOON_HALO_OPACITY * illumination;
        this._moonHalo.visible = illumination > 0.01;
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

// The moon's disc, shaded by its phase (MOON_FRAGMENT), unlit otherwise and
// untouched by fog like the sun's.
function moonDisc() {
    const material = new THREE.ShaderMaterial({
        vertexShader: MOON_VERTEX,
        fragmentShader: MOON_FRAGMENT,
        uniforms: {
            uLight: { value: new THREE.Vector3(0, 0, 1) },
            uLit: { value: new THREE.Color(MOON_COLOR) },
            uDark: { value: new THREE.Color(DEFAULT_SKY) }
        },
        fog: false,
        depthWrite: false
    });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(MOON_RADIUS, 48), material);
    mesh.renderOrder = -2;
    mesh.frustumCulled = false;
    mesh.userData.skyBody = true;
    return mesh;
}

const scratchTowards = new THREE.Vector3();
const scratchUp = new THREE.Vector3();
const scratchRight = new THREE.Vector3();
const scratchLight = new THREE.Vector3();
const scratchBasis = new THREE.Matrix4();
const scratchSky = { r: 0, g: 0, b: 0 };
const scratchShine = { r: 0, g: 0, b: 0 };

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
