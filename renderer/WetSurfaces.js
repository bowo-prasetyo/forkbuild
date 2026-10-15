import * as THREE from 'three';

// Wet ground and bricks in the rain (core/Weather.js's wetness): a surface
// gets darker as it soaks up the rain, and what faces the sky gets a sheen,
// its roughness falling as if a film of water lay on it; once the rain stops
// it dries back, as slowly as core/Weather.js#wetnessAt() says.
//
// A patch onto a lit material (MeshStandardMaterial), on top of whatever it
// already does (a brick's surface, its night glow): the terrain
// (renderer/TerrainTileMesh.js) and every brick, instanced or not
// (renderer/BrickInstanceRegistry.js, renderer/Renderer.js#add()). Every
// material patched by one owner shares its uniforms (createWetSurfaces()), so
// the whole world soaks and dries with one number a frame.
//
// Under the roof over the avatar (its shelter: the build's footprint, below
// the roof's underside, application/worldNavigation/avatarPresenceMethods.js)
// nothing is wet: the room it stands in stays dry, as the rain stays out of
// it (renderer/RainFall.js). Its roof is above that, and gets wet.

// How much darker a soaked surface is, and the roughness of a film of water.
export const TERRAIN_WET = Object.freeze({ darken: 0.32, roughness: 0.62 });
export const BRICK_WET = Object.freeze({ darken: 0.2, roughness: 0.42 });
// Walls get wet too, but less than what faces the sky, and take no sheen.
const WALL_SHARE = 0.45;
const NO_SHELTER_TOP = -1e9;

function glslFloat(v) {
    return v.toPrecision(6);
}

// The uniforms every material one owner patches shares.
export function createWetSurfaces() {
    return {
        wetness: { value: 0 },
        // (minX, maxX, minZ, maxZ) and the height below which it is dry.
        shelter: { value: new THREE.Vector4(0, 0, 0, 0) },
        shelterBelow: { value: NO_SHELTER_TOP }
    };
}

export function setWetness(surfaces, wetness) {
    surfaces.wetness.value = Number.isFinite(wetness) ? Math.min(Math.max(wetness, 0), 1) : 0;
}

// `shelter`: `{ minX, maxX, minZ, maxZ, ceiling }` in world coordinates, the
// build the avatar stands in and the underside of its roof; null for none.
export function setWetShelter(surfaces, shelter) {
    const valid = shelter && [shelter.minX, shelter.maxX, shelter.minZ, shelter.maxZ, shelter.ceiling].every(Number.isFinite);
    if (valid) {
        surfaces.shelter.value.set(shelter.minX, shelter.maxX, shelter.minZ, shelter.maxZ);
        surfaces.shelterBelow.value = shelter.ceiling;
    } else {
        surfaces.shelter.value.set(0, 0, 0, 0);
        surfaces.shelterBelow.value = NO_SHELTER_TOP;
    }
}

const VERTEX_HEAD = /* glsl */ `
varying vec3 vWetWorld;
varying float vWetUp;`;

// Where the vertex is in the world, and how much it faces the sky, through
// its instance's place when instanced.
const VERTEX_BODY = /* glsl */ `
	vec4 wetWorld = vec4(transformed, 1.0);
	vec3 wetNormal = objectNormal;
	#ifdef USE_INSTANCING
		wetWorld = instanceMatrix * wetWorld;
		wetNormal = mat3(instanceMatrix) * wetNormal;
	#endif
	wetWorld = modelMatrix * wetWorld;
	vWetWorld = wetWorld.xyz;
	vWetUp = normalize(mat3(modelMatrix) * wetNormal).y;
`;

const FRAGMENT_HEAD = /* glsl */ `
uniform float uWetness;
uniform vec4 uWetShelter;
uniform float uWetShelterBelow;
varying vec3 vWetWorld;
varying float vWetUp;
float wetHere() {
	if (uWetness <= 0.0) return 0.0;
	if (vWetWorld.y < uWetShelterBelow && vWetWorld.x > uWetShelter.x && vWetWorld.x < uWetShelter.y
		&& vWetWorld.z > uWetShelter.z && vWetWorld.z < uWetShelter.w) return 0.0;
	return uWetness;
}`;

// Patches `material` to soak and dry with `surfaces` (createWetSurfaces()),
// `look` saying how dark and glossy it gets (TERRAIN_WET or BRICK_WET).
// Patching twice does nothing. Returns it.
export function makeWet(material, surfaces, look = BRICK_WET) {
    if (!material || material.userData.wet) return material;
    material.userData.wet = true;
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
        if (typeof previous === 'function') previous.call(material, shader, renderer);
        shader.uniforms.uWetness = surfaces.wetness;
        shader.uniforms.uWetShelter = surfaces.shelter;
        shader.uniforms.uWetShelterBelow = surfaces.shelterBelow;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>${VERTEX_HEAD}`)
            .replace('#include <project_vertex>', `${VERTEX_BODY}\n\t#include <project_vertex>`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>${FRAGMENT_HEAD}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
	float wetNow = wetHere();
	float wetSky = smoothstep(0.3, 0.8, vWetUp);
	diffuseColor.rgb *= 1.0 - ${glslFloat(look.darken)} * wetNow * mix(${glslFloat(WALL_SHARE)}, 1.0, wetSky);`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = mix(roughnessFactor, min(roughnessFactor, ${glslFloat(look.roughness)}), wetNow * wetSky);`);
    };
    material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : ''}|forkbuild-wet-${look.darken}`;
    material.needsUpdate = true;
    return material;
}
