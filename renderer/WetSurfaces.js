import * as THREE from 'three';

// Wet ground and bricks in the rain (core/Weather.js's wetness): a surface
// gets darker as it soaks up the rain, and what faces the sky gets a sheen,
// its roughness falling as if a film of water lay on it; once the rain stops
// it dries back, as slowly as core/Weather.js#wetnessAt() says. And snow
// lying (core/Weather.js#snowCoverAt()): on what faces the sky it settles in
// patches that grow into a blanket as the cover deepens, and melts back the
// same way; walls stay clear.
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
// it (renderer/RainFall.js). Its roof is above that, and gets wet. Snow
// keeps out of the room the same way.

// How much darker a soaked surface is, the roughness of a film of water,
// and how much of what faces the sky snow can cover: bricks never wholly, so
// a build's roof still shows its colour under snow.
export const TERRAIN_WET = Object.freeze({ darken: 0.32, roughness: 0.62, snow: 1 });
export const BRICK_WET = Object.freeze({ darken: 0.2, roughness: 0.42, snow: 0.45 });
// Snow, a little blue in its shadows, and how rough it is.
const SNOW_COLOUR = '0.80, 0.83, 0.88';
const SNOW_ROUGHNESS = 0.9;
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
        snowCover: { value: 0 },
        // Whether the shaders carry the snow's code: only while any lies,
        // since a GPU without branching (a software one) would otherwise
        // pay for it in every pixel all year. Every material patched with
        // these, so they can be rebuilt when it changes.
        snowCompiled: false,
        materials: new Set(),
        // (minX, maxX, minZ, maxZ) and the height below which it is dry.
        shelter: { value: new THREE.Vector4(0, 0, 0, 0) },
        shelterBelow: { value: NO_SHELTER_TOP }
    };
}

export function setWetness(surfaces, wetness) {
    surfaces.wetness.value = Number.isFinite(wetness) ? Math.min(Math.max(wetness, 0), 1) : 0;
}

// How much snow lies, 0 to 1. The first snow, and the last of it melting,
// rebuild the patched materials' shaders: about twice a world year.
export function setSnowCover(surfaces, cover) {
    surfaces.snowCover.value = Number.isFinite(cover) ? Math.min(Math.max(cover, 0), 1) : 0;
    const lying = surfaces.snowCover.value > 0;
    if (lying === surfaces.snowCompiled) return;
    surfaces.snowCompiled = lying;
    for (const material of surfaces.materials) material.needsUpdate = true;
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
uniform float uSnowCover;
uniform vec4 uWetShelter;
uniform float uWetShelterBelow;
varying vec3 vWetWorld;
varying float vWetUp;
bool wetSheltered() {
	return vWetWorld.y < uWetShelterBelow && vWetWorld.x > uWetShelter.x && vWetWorld.x < uWetShelter.y
		&& vWetWorld.z > uWetShelter.z && vWetWorld.z < uWetShelter.w;
}
float wetHere() {
	if (uWetness <= 0.0 || wetSheltered()) return 0.0;
	return uWetness;
}
float snowCell(vec2 c) {
	return fract(52.9829189 * fract(dot(c, vec2(0.06711056, 0.00583715))));
}
float snowNoise(vec2 p) {
	vec2 i = floor(p);
	vec2 f = fract(p);
	f = f * f * (3.0 - 2.0 * f);
	return mix(mix(snowCell(i), snowCell(i + vec2(1.0, 0.0)), f.x), mix(snowCell(i + vec2(0.0, 1.0)), snowCell(i + vec2(1.0, 1.0)), f.x), f.y);
}
// How much snow lies here, 0 to 1, out of 'most' at the deepest: on what
// faces the sky, first in patches, which grow and join as it deepens.
float snowHere(float most) {
	if (uSnowCover <= 0.0 || wetSheltered()) return 0.0;
	float up = smoothstep(0.45, 0.8, vWetUp);
	if (up <= 0.0) return 0.0;
	float patches = snowNoise(mat2(0.8, -0.6, 0.6, 0.8) * vWetWorld.xz * 0.45) * 0.6 + snowNoise(mat2(0.6, 0.8, -0.8, 0.6) * vWetWorld.xz * 1.9 + 17.0) * 0.4;
	return up * most * smoothstep(patches - 0.08, patches + 0.08, uSnowCover * 1.2 - 0.1);
}`;

// Patches `material` to soak and dry with `surfaces` (createWetSurfaces()),
// `look` saying how dark and glossy it gets and how much snow can cover it
// (TERRAIN_WET or BRICK_WET).
// Patching twice does nothing. Returns it.
export function makeWet(material, surfaces, look = BRICK_WET) {
    if (!material || material.userData.wet) return material;
    material.userData.wet = true;
    const snow = Number.isFinite(look.snow) ? look.snow : 1;
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    if (surfaces.materials) {
        surfaces.materials.add(material);
        material.addEventListener('dispose', () => surfaces.materials.delete(material));
    }
    material.onBeforeCompile = (shader, renderer) => {
        if (typeof previous === 'function') previous.call(material, shader, renderer);
        const snowing = surfaces.snowCompiled === true;
        shader.uniforms.uWetness = surfaces.wetness;
        shader.uniforms.uSnowCover = surfaces.snowCover;
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
	diffuseColor.rgb *= 1.0 - ${glslFloat(look.darken)} * wetNow * mix(${glslFloat(WALL_SHARE)}, 1.0, wetSky);
	float snowLying = ${snowing ? `snowHere(${glslFloat(snow)})` : '0.0'};
	diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${SNOW_COLOUR}), snowLying);`)
            .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
	roughnessFactor = mix(roughnessFactor, min(roughnessFactor, ${glslFloat(look.roughness)}), wetNow * wetSky);
	roughnessFactor = mix(roughnessFactor, ${glslFloat(SNOW_ROUGHNESS)}, snowLying);`);
    };
    material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : ''}|forkbuild-wet-${look.darken}-${snow}${surfaces.snowCompiled ? '-snow' : ''}`;
    material.needsUpdate = true;
    return material;
}
