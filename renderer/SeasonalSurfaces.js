import * as THREE from 'three';

// The seasons on the land (core/Season.js's look): the grass and the fields
// change colour with them, and the trees come into blossom and leaf, carry
// fruit, turn red, orange and yellow and stand bare.
//
// Patches onto lit materials, like renderer/WetSurfaces.js: every material
// patched by one owner shares its uniforms (createSeasonSurfaces()), so the
// whole land changes with one look a frame, and nothing streamed is rebuilt.
//
//   makeSeasonalGround()  the terrain (renderer/TerrainTileMesh.js), whose
//                         vertices say how much grass and how much field
//                         they are (`groundCover`, core/TerrainEcology.js#
//                         groundCoverAt()); grass dotted with wild flowers
//                         in spring and summer
//   makeSeasonalTree()    the trees (renderer/TreeForest.js), whose vertices
//                         say how much their species sheds its leaves
//                         (`treeDeciduous`: a conifer never, a broadleaf
//                         fully, scrub partly) and whose place makes each
//                         tree turn, bloom and drop its leaves a little
//                         differently. Patched onto a tree's shadow material
//                         too, so a bare tree casts a bare tree's shadow.
//
// Patch a material after renderer/WetSurfaces.js#makeWet(): this one's
// colour then comes before the wet's darkening and the snow lying on top.

export const DECIDUOUS = Object.freeze({ NEVER: 0, FULLY: 1, PARTLY: 0.6 });
export const TREE_PART = Object.freeze({ LEAVES: 'LEAVES', CROWN: 'CROWN', BARK: 'BARK' });

// Leaves dropped on a solid mid or far crown (renderer/TreeGeometry.js)
// leave this share of it standing, as a haze of twigs.
const BARE_CROWN = 0.18;
const TWIG_COLOUR = '0.40, 0.35, 0.30';
// What a crop row's colour is measured against, so the fields keep their rows.
const FIELD_LUMINANCE = 0.6;

function glslFloat(v) {
    return v.toPrecision(6);
}

export function createSeasonSurfaces() {
    return {
        leaves: { value: 1 },
        fresh: { value: 0 },
        blossom: { value: 0 },
        autumn: { value: 0 },
        fruit: { value: 0 },
        flowers: { value: 0 },
        groundGrade: { value: new THREE.Vector3(1, 1, 1) },
        groundSaturation: { value: 1 },
        fieldColor: { value: new THREE.Vector3(1, 1, 1) },
        fieldAmount: { value: 0 }
    };
}

// Shows `look` (core/Season.js#seasonLookAt()) on every material patched
// with `surfaces`.
export function setSeason(surfaces, look) {
    if (!look) return;
    for (const key of ['leaves', 'fresh', 'blossom', 'autumn', 'fruit', 'flowers', 'groundSaturation', 'fieldAmount']) {
        surfaces[key].value = Number.isFinite(look[key]) ? look[key] : surfaces[key].value;
    }
    if (Array.isArray(look.groundGrade)) surfaces.groundGrade.value.fromArray(look.groundGrade);
    if (Array.isArray(look.fieldColor)) surfaces.fieldColor.value.fromArray(look.fieldColor);
}

const HASH = /* glsl */ `
vec3 seasonHash3(vec3 p) {
	p = fract(p * vec3(0.1031, 0.1030, 0.0973));
	p += dot(p, p.yxz + 33.33);
	return fract((p.xxy + p.yxx) * p.zyx);
}
float seasonHash(vec3 p) {
	return seasonHash3(p).x;
}`;

function bindUniforms(shader, surfaces, keys) {
    for (const key of keys) {
        shader.uniforms[`uSeason${key[0].toUpperCase()}${key.slice(1)}`] = surfaces[key];
    }
}

// Chains `patch(shader)` after whatever `material` already does to its
// shaders, under `key`. Patching twice with the same key does nothing.
function chainPatch(material, key, patch) {
    if (!material || material.userData[key]) return material;
    material.userData[key] = true;
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
        if (typeof previous === 'function') previous.call(material, shader, renderer);
        patch(shader);
    };
    material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : ''}|${key}`;
    material.needsUpdate = true;
    return material;
}

const GROUND_VERTEX_HEAD = /* glsl */ `
attribute vec2 groundCover;
varying vec2 vGroundCover;
varying vec3 vSeasonWorld;`;

const GROUND_VERTEX_BODY = /* glsl */ `
	vGroundCover = groundCover;
	vSeasonWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
`;

const GROUND_FRAGMENT_HEAD = /* glsl */ `
uniform vec3 uSeasonGroundGrade;
uniform float uSeasonGroundSaturation;
uniform vec3 uSeasonFieldColor;
uniform float uSeasonFieldAmount;
uniform float uSeasonFlowers;
varying vec2 vGroundCover;
varying vec3 vSeasonWorld;
${HASH}
// Wild flowers: a dot in some of the cells of a fine grid, in meadows a low
// noise lets through, fading out where a cell gets too small on screen to
// draw cleanly.
vec3 seasonFlowers(vec3 colour, float grass) {
	if (uSeasonFlowers <= 0.0 || grass <= 0.5) return colour;
	vec2 cellSize = vec2(0.7);
	vec2 cell = floor(vSeasonWorld.xz / cellSize);
	vec2 meadowCell = floor(vSeasonWorld.xz / 9.0);
	vec2 meadowT = fract(vSeasonWorld.xz / 9.0);
	meadowT = meadowT * meadowT * (3.0 - 2.0 * meadowT);
	float m00 = seasonHash(vec3(meadowCell, 7.0));
	float m10 = seasonHash(vec3(meadowCell + vec2(1.0, 0.0), 7.0));
	float m01 = seasonHash(vec3(meadowCell + vec2(0.0, 1.0), 7.0));
	float m11 = seasonHash(vec3(meadowCell + vec2(1.0, 1.0), 7.0));
	float meadow = mix(mix(m00, m10, meadowT.x), mix(m01, m11, meadowT.x), meadowT.y);
	vec3 h = seasonHash3(vec3(cell, 3.0));
	float chance = uSeasonFlowers * smoothstep(0.3, 0.75, meadow) * 0.35;
	if (h.x > chance) return colour;
	vec2 into = fract(vSeasonWorld.xz / cellSize) - 0.5 - (h.yz - 0.5) * 0.5;
	float dotSize = 0.2 + h.y * 0.1;
	float onScreen = 1.0 - smoothstep(0.1, 0.3, length(fwidth(vSeasonWorld.xz)));
	float petal = (1.0 - smoothstep(dotSize * 0.6, dotSize, length(into))) * onScreen * smoothstep(0.5, 1.0, grass);
	vec3 flower = h.z < 0.3 ? vec3(0.92, 0.90, 0.84)
		: h.z < 0.55 ? vec3(0.90, 0.78, 0.30)
		: h.z < 0.8 ? vec3(0.78, 0.52, 0.72)
		: vec3(0.55, 0.62, 0.86);
	return mix(colour, flower, petal);
}`;

const GROUND_FRAGMENT_BODY = /* glsl */ `
	{
		float seasonGrey = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
		vec3 seasonGraded = mix(vec3(seasonGrey), diffuseColor.rgb, uSeasonGroundSaturation) * uSeasonGroundGrade;
		diffuseColor.rgb = mix(diffuseColor.rgb, seasonGraded, vGroundCover.x);
		vec3 seasonCrops = uSeasonFieldColor * (seasonGrey / ${glslFloat(FIELD_LUMINANCE)});
		diffuseColor.rgb = mix(diffuseColor.rgb, seasonCrops, vGroundCover.y * uSeasonFieldAmount);
		diffuseColor.rgb = seasonFlowers(diffuseColor.rgb, vGroundCover.x);
	}
`;

// Patches the terrain's `material` to take the season's colour, read from
// its geometry's `groundCover` attribute (vec2: grass, field). Returns it.
export function makeSeasonalGround(material, surfaces) {
    return chainPatch(material, 'forkbuild-season-ground', (shader) => {
        bindUniforms(shader, surfaces, ['groundGrade', 'groundSaturation', 'fieldColor', 'fieldAmount', 'flowers']);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>${GROUND_VERTEX_HEAD}`)
            .replace('#include <project_vertex>', `${GROUND_VERTEX_BODY}\n\t#include <project_vertex>`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>${GROUND_FRAGMENT_HEAD}`)
            .replace('#include <color_fragment>', `#include <color_fragment>${GROUND_FRAGMENT_BODY}`);
    });
}

const TREE_VERTEX_HEAD = /* glsl */ `
attribute float treeDeciduous;
varying vec3 vSeasonPos;
varying vec2 vSeasonUv;
varying vec3 vSeasonTree;
varying float vSeasonDeciduous;
${HASH}`;

// The tree's own numbers, from where it stands: the same for every part of
// it and every frame.
const TREE_VERTEX_BODY = /* glsl */ `
	vSeasonPos = position;
	vSeasonUv = uv;
	vSeasonDeciduous = treeDeciduous;
	#ifdef USE_INSTANCING
		vSeasonTree = seasonHash3(vec3(instanceMatrix[3].xz, 1.0) * 1.7);
	#else
		vSeasonTree = vec3(0.5);
	#endif
`;

const TREE_FRAGMENT_HEAD = /* glsl */ `
uniform float uSeasonLeaves;
uniform float uSeasonFresh;
uniform float uSeasonBlossom;
uniform float uSeasonAutumn;
uniform float uSeasonFruit;
varying vec3 vSeasonPos;
varying vec2 vSeasonUv;
varying vec3 vSeasonTree;
varying float vSeasonDeciduous;
${HASH}
// How much of its foliage this tree carries: each drops its leaves (and
// comes into leaf) a little before or after the season says, all bare in
// the depth of winter and all dressed in summer.
float seasonLeavesHere() {
	float own = uSeasonLeaves <= 0.0 ? 0.0 : uSeasonLeaves >= 1.0 ? 1.0
		: clamp(uSeasonLeaves + (vSeasonTree.x - 0.5) * 0.4, 0.0, 1.0);
	return mix(1.0, own, vSeasonDeciduous);
}
// Colour with the hue of 'hue' and the brightness of 'colour'.
vec3 seasonHued(vec3 colour, vec3 hue) {
	float bright = dot(colour, vec3(0.299, 0.587, 0.114));
	return hue * (bright / max(dot(hue, vec3(0.299, 0.587, 0.114)), 1e-3));
}
vec3 seasonFoliage(vec3 colour, vec3 speck) {
	float deciduous = vSeasonDeciduous;
	// New leaves, light and yellow-green; a conifer's new shoots barely.
	colour = mix(colour, colour * vec3(1.06, 1.16, 0.80), uSeasonFresh * mix(0.25, 1.0, deciduous));
	// Autumn: each tree its own red, orange or yellow, and its own time.
	float turn = clamp(uSeasonAutumn * 1.4 - vSeasonTree.y * 0.4, 0.0, 1.0) * deciduous;
	vec3 autumnHue = vSeasonTree.z < 0.3 ? vec3(0.58, 0.16, 0.09)
		: vSeasonTree.z < 0.65 ? vec3(0.78, 0.42, 0.12)
		: vec3(0.80, 0.66, 0.22);
	colour = mix(colour, seasonHued(colour, autumnHue) * mix(0.9, 1.1, step(0.3, vSeasonTree.z)), turn);
	// Blossom on the flowering broadleaf trees, pink or white.
	float flowering = step(0.99, deciduous) * step(vSeasonTree.y, 0.4);
	vec3 blossomHue = vSeasonTree.x < 0.5 ? vec3(0.98, 0.70, 0.74) : vec3(0.97, 0.93, 0.84);
	colour = mix(colour, blossomHue * 0.85 * (0.75 + 0.5 * speck.x), uSeasonBlossom * flowering * 0.85);
	// Fruit on the fruiting ones: red or orange specks among the leaves.
	float fruiting = step(0.99, deciduous) * step(0.4, vSeasonTree.y) * step(vSeasonTree.y, 0.7);
	float fruit = uSeasonFruit > 0.0 ? step(speck.y, uSeasonFruit * 0.16) * fruiting : 0.0;
	colour = mix(colour, vSeasonTree.z < 0.5 ? vec3(0.72, 0.16, 0.10) : vec3(0.85, 0.48, 0.10), fruit);
	return colour;
}`;

const LEAVES_DISCARD = /* glsl */ `
	{
		float seasonLeaf = seasonLeavesHere();
		// Whole sprays at a time, so a thinning crown shows its boughs.
		if (seasonLeaf < 1.0 && seasonHash(floor(vSeasonPos * 1.3) * 7.0 + vec3(floor(vSeasonUv * 2.0), 0.0)) >= seasonLeaf) discard;
	}
`;

const CROWN_DISCARD = /* glsl */ `
	{
		float seasonLeaf = seasonLeavesHere();
		float seasonStanding = mix(${glslFloat(BARE_CROWN)}, 1.0, seasonLeaf);
		if (seasonStanding < 1.0 && seasonHash(floor(vSeasonPos * 6.0)) >= seasonStanding) discard;
	}
`;

const LEAVES_COLOUR = /* glsl */ `
	diffuseColor.rgb = seasonFoliage(diffuseColor.rgb, seasonHash3(vec3(floor(vSeasonUv * 9.0), 5.0) + floor(vSeasonPos * 1.7) * 3.0));
`;

const CROWN_COLOUR = /* glsl */ `
	diffuseColor.rgb = seasonFoliage(diffuseColor.rgb, seasonHash3(floor(vSeasonPos * 9.0) + 11.0));
	diffuseColor.rgb = mix(seasonHued(diffuseColor.rgb, vec3(${TWIG_COLOUR})) * 0.8, diffuseColor.rgb, seasonLeavesHere());
`;

// Patches one of a tree's materials (`part`: TREE_PART) to change with the
// seasons; its geometry carries `treeDeciduous`. `depth`: the part's shadow
// material, which only drops leaves. Bark is left as it is (snow lies on it,
// renderer/WetSurfaces.js). Returns the material.
export function makeSeasonalTree(material, surfaces, { part = TREE_PART.LEAVES, depth = false } = {}) {
    if (part === TREE_PART.BARK) return material;
    const leaves = part === TREE_PART.LEAVES;
    return chainPatch(material, `forkbuild-season-tree-${leaves ? 'leaves' : 'crown'}${depth ? '-depth' : ''}`, (shader) => {
        bindUniforms(shader, surfaces, ['leaves', 'fresh', 'blossom', 'autumn', 'fruit']);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>${TREE_VERTEX_HEAD}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>${TREE_VERTEX_BODY}`);
        let fragment = shader.fragmentShader
            .replace('#include <common>', `#include <common>${TREE_FRAGMENT_HEAD}`)
            .replace('#include <alphatest_fragment>', `${leaves ? LEAVES_DISCARD : CROWN_DISCARD}\n\t#include <alphatest_fragment>`);
        if (!depth) {
            fragment = fragment.replace('#include <color_fragment>', `#include <color_fragment>${leaves ? LEAVES_COLOUR : CROWN_COLOUR}`);
        }
        shader.fragmentShader = fragment;
    });
}

// Gives every geometry in `geometries` a `treeDeciduous` attribute of
// `deciduous` (DECIDUOUS) at every vertex.
export function markDeciduous(geometries, deciduous) {
    for (const geometry of geometries) {
        if (!geometry || geometry.getAttribute('treeDeciduous')) continue;
        const count = geometry.getAttribute('position').count;
        geometry.setAttribute('treeDeciduous', new THREE.Float32BufferAttribute(new Float32Array(count).fill(deciduous), 1));
    }
}
