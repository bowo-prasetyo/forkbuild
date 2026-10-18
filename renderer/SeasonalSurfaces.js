import * as THREE from 'three';

// The seasons on the land (core/Season.js's look): the grass and the fields
// change colour with them, and the trees come into blossom and leaf, carry
// fruit, turn red, orange and yellow and stand bare.
//
// Nothing streamed is rebuilt, and as little as can be is left to every
// pixel: a GPU without branching (a software one, as the tests film with)
// runs every line of a shader for every pixel, whether it changes anything
// or not.
//
//   makeSeasonalGround()  the terrain (renderer/TerrainTileMesh.js): a patch
//                         sharing one set of uniforms (createSeasonSurfaces(),
//                         setSeason()), reading how much grass and how much
//                         field each vertex is (`groundCover`, core/
//                         TerrainEcology.js#groundCoverAt()); grass dotted
//                         with wild flowers in spring and summer
//   treeSeasonOf(), seasonedTreeColour()
//                         the trees (renderer/TreeForest.js): each tree's
//                         colours for the season, worked out on the CPU
//                         into its instance colour (fresh leaves, autumn,
//                         blossom, a bare crown's twigs), from how much its
//                         species sheds its leaves (DECIDUOUS) and its own
//                         numbers, so each turns, blooms and drops its
//                         leaves a little differently
//   makeSeasonalTree()    what can't be a colour: leaves dropping and fruit
//                         among them, read from each instance's
//                         `treeSeason` and compiled in only while the season
//                         has any (treeSeasonFlags(), setTreeSeasonFlags()).
//                         Patched onto a tree's shadow material too, so a
//                         bare tree casts a bare tree's shadow.
//
// Patch a material after renderer/WetSurfaces.js#makeWet(): this one's
// colour then comes before the wet's darkening and the snow lying on top.

export const DECIDUOUS = Object.freeze({ NEVER: 0, FULLY: 1, PARTLY: 0.6 });
export const TREE_PART = Object.freeze({ LEAVES: 'LEAVES', CROWN: 'CROWN', BARK: 'BARK' });

// Leaves dropped on a solid mid or far crown (renderer/TreeGeometry.js)
// leave this share of it standing, as a haze of twigs.
const BARE_CROWN = 0.18;
const TWIG_COLOUR = Object.freeze([0.40, 0.35, 0.30]);
// What a crop row's colour is measured against, so the fields keep their rows.
const FIELD_LUMINANCE = 0.6;

function glslFloat(v) {
    return v.toPrecision(6);
}

export function createSeasonSurfaces() {
    return {
        flowers: { value: 0 },
        groundGrade: { value: new THREE.Vector3(1, 1, 1) },
        groundSaturation: { value: 1 },
        fieldColor: { value: new THREE.Vector3(1, 1, 1) },
        fieldAmount: { value: 0 }
    };
}

// Shows `look` (core/Season.js#seasonLookAt()) on the ground patched with
// `surfaces`.
export function setSeason(surfaces, look) {
    if (!look) return;
    for (const key of ['flowers', 'groundSaturation', 'fieldAmount']) {
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

// A cheap hash of a grid cell, 0 to 1 (interleaved gradient noise): the
// fragment shaders run it for every pixel of grass and every leaf, so it is
// kept to a few operations.
const CELL_HASH = /* glsl */ `
float seasonCell(vec2 c) {
	return fract(52.9829189 * fract(dot(c, vec2(0.06711056, 0.00583715))));
}`;

// Everything that is the same all over a stretch of ground or a whole tree
// is worked out per vertex, so each pixel only mixes colours.
const GROUND_VERTEX_HEAD = /* glsl */ `
attribute vec2 groundCover;
uniform float uSeasonFlowers;
varying vec2 vGroundCover;
varying vec2 vSeasonWorld;
varying float vSeasonMeadow;
${HASH}`;

// Meadows: a noise of 9 m cells, where flowers grow.
const GROUND_VERTEX_BODY = /* glsl */ `
	{
		vec2 seasonXZ = (modelMatrix * vec4(transformed, 1.0)).xz;
		vGroundCover = groundCover;
		vSeasonWorld = seasonXZ;
		vSeasonMeadow = 0.0;
		if (uSeasonFlowers > 0.0) {
			vec2 meadowCell = floor(seasonXZ / 9.0);
			vec2 meadowT = fract(seasonXZ / 9.0);
			meadowT = meadowT * meadowT * (3.0 - 2.0 * meadowT);
			float m00 = seasonHash(vec3(meadowCell, 7.0));
			float m10 = seasonHash(vec3(meadowCell + vec2(1.0, 0.0), 7.0));
			float m01 = seasonHash(vec3(meadowCell + vec2(0.0, 1.0), 7.0));
			float m11 = seasonHash(vec3(meadowCell + vec2(1.0, 1.0), 7.0));
			float meadow = mix(mix(m00, m10, meadowT.x), mix(m01, m11, meadowT.x), meadowT.y);
			vSeasonMeadow = uSeasonFlowers * smoothstep(0.3, 0.75, meadow) * 0.35 * smoothstep(0.5, 1.0, groundCover.x);
		}
	}
`;

const GROUND_FRAGMENT_HEAD = /* glsl */ `
uniform vec3 uSeasonGroundGrade;
uniform float uSeasonGroundSaturation;
uniform vec3 uSeasonFieldColor;
uniform float uSeasonFieldAmount;
varying vec2 vGroundCover;
varying vec2 vSeasonWorld;
varying float vSeasonMeadow;
${CELL_HASH}`;

// Wild flowers: a dot in some of the cells of a 0.7 m grid, as many as the
// meadow lets through, fading out where a cell gets too small on screen to
// draw cleanly.
const GROUND_FRAGMENT_BODY = /* glsl */ `
	{
		float seasonGrey = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
		vec3 seasonGraded = mix(vec3(seasonGrey), diffuseColor.rgb, uSeasonGroundSaturation) * uSeasonGroundGrade;
		diffuseColor.rgb = mix(diffuseColor.rgb, seasonGraded, vGroundCover.x);
		vec3 seasonCrops = uSeasonFieldColor * (seasonGrey / ${glslFloat(FIELD_LUMINANCE)});
		diffuseColor.rgb = mix(diffuseColor.rgb, seasonCrops, vGroundCover.y * uSeasonFieldAmount);
		vec2 flowerGrid = vSeasonWorld / 0.7;
		vec2 flowerCell = floor(flowerGrid);
		float flowerChance = seasonCell(flowerCell);
		float flowerKind = seasonCell(flowerCell + 17.0);
		vec2 flowerInto = fract(flowerGrid) - 0.5 - (vec2(flowerKind, fract(flowerKind * 7.0)) - 0.5) * 0.5;
		float flowerSize = 0.29 + flowerKind * 0.14;
		float onScreen = 1.0 - smoothstep(0.1, 0.3, length(fwidth(vSeasonWorld)));
		float petal = step(flowerChance, vSeasonMeadow) * (1.0 - smoothstep(flowerSize * 0.6, flowerSize, length(flowerInto))) * onScreen;
		vec3 flower = flowerKind < 0.3 ? vec3(0.92, 0.90, 0.84)
			: flowerKind < 0.55 ? vec3(0.90, 0.78, 0.30)
			: flowerKind < 0.8 ? vec3(0.78, 0.52, 0.72)
			: vec3(0.55, 0.62, 0.86);
		diffuseColor.rgb = mix(diffuseColor.rgb, flower, petal);
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

const LUMA = Object.freeze([0.299, 0.587, 0.114]);
const luma = (c) => c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];
const FRESH = Object.freeze([1.06, 1.16, 0.80]);
const AUTUMN_HUES = Object.freeze([[0.58, 0.16, 0.09], [0.78, 0.42, 0.12], [0.80, 0.66, 0.22]]);
const BLOSSOM_HUES = Object.freeze([[0.98, 0.70, 0.74], [0.97, 0.93, 0.84]]);
const FRUIT_COLOURS = Object.freeze([[0.72, 0.16, 0.10], [0.85, 0.48, 0.10]]);

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// What the season `look` (core/Season.js) does to one tree, `numbers` its
// own three numbers in [0, 1) and `deciduous` how much its species sheds
// its leaves (DECIDUOUS):
//   leaf    how much of its foliage it carries; each drops its leaves (and
//           comes into leaf) a little before or after the season says, all
//           bare in the depth of winter and all dressed in summer
//   fresh   what its colour is multiplied by: new leaves light and
//           yellow-green, a conifer's new shoots barely
//   hue     a hue its leaves take at their own brightness (times the hue's
//           length), and amount how far: its own red, orange or yellow in
//           autumn, at its own time; blossom, pink or white, on two in five
//           broadleaves
//   fruit   the share of its leaves' specks that are fruit, on three in ten
//           broadleaves, and fruitKind which fruit (0 red, 1 orange)
export function treeSeasonOf(look, numbers, deciduous) {
    const [x, y, z] = numbers;
    const leaves = look && Number.isFinite(look.leaves) ? look.leaves : 1;
    const own = leaves <= 0 ? 0 : leaves >= 1 ? 1 : clamp01(leaves + (x - 0.5) * 0.4);
    const freshness = (look?.fresh || 0) * lerp(0.25, 1, deciduous);
    const turn = clamp01((look?.autumn || 0) * 1.4 - y * 0.4) * deciduous;
    const broadleaf = deciduous >= 0.99 ? 1 : 0;
    const bloom = (look?.blossom || 0) * broadleaf * (y <= 0.4 ? 1 : 0) * 0.85;
    let hue;
    let amount;
    if (bloom > turn) {
        const b = BLOSSOM_HUES[x < 0.5 ? 0 : 1];
        hue = b.map((c) => c * 1.7 / luma(b));
        amount = bloom;
    } else {
        const a = AUTUMN_HUES[z < 0.3 ? 0 : z < 0.65 ? 1 : 2];
        hue = a.map((c) => c * (z < 0.3 ? 0.9 : 1.1) / luma(a));
        amount = turn;
    }
    const fruiting = broadleaf && y >= 0.4 && y <= 0.7 ? 1 : 0;
    return {
        leaf: lerp(1, own, deciduous),
        fresh: FRESH.map((c) => lerp(1, c, freshness)),
        hue,
        amount,
        fruit: (look?.fruit || 0) * 0.16 * fruiting,
        fruitKind: z < 0.5 ? 0 : 1
    };
}

// `base`, a tree's leaf (or, with `crown`, solid crown) colour, as
// `season` (treeSeasonOf()) colours it: a bare crown turns twig-brown.
export function seasonedTreeColour(base, season, { crown = false } = {}) {
    const bright = luma(base);
    let colour = base.map((c, i) => lerp(c * season.fresh[i], season.hue[i] * bright, season.amount));
    if (crown && season.leaf < 1) {
        const twig = TWIG_COLOUR.map((c) => c * (luma(colour) * 0.8 / luma(TWIG_COLOUR)));
        colour = colour.map((c, i) => lerp(twig[i], c, season.leaf));
    }
    return colour;
}

// Which of makeSeasonalTree()'s code the season `look` needs: `bare` while
// any tree has dropped leaves, `fruit` while fruit hangs.
export function treeSeasonFlags(look) {
    return {
        bare: Boolean(look && Number.isFinite(look.leaves) && look.leaves < 1),
        fruit: Boolean(look && look.fruit > 0)
    };
}

// Compiles `material` (patched by makeSeasonalTree()) with just what `flags`
// (treeSeasonFlags()) need; nothing happens unless they changed.
export function setTreeSeasonFlags(material, flags) {
    const defines = material.defines || (material.defines = {});
    const bare = Boolean(flags?.bare);
    const fruit = Boolean(flags?.fruit);
    if (('SEASON_BARE' in defines) === bare && ('SEASON_FRUIT' in defines) === fruit) return;
    delete defines.SEASON_BARE;
    delete defines.SEASON_FRUIT;
    if (bare) defines.SEASON_BARE = '';
    if (fruit) defines.SEASON_FRUIT = '';
    material.needsUpdate = true;
}

const TREE_VERTEX_HEAD = /* glsl */ `
attribute vec3 treeSeason;
#if defined( SEASON_BARE ) || defined( SEASON_FRUIT )
varying vec3 vSeasonPos;
varying vec2 vSeasonUv;
varying vec3 vTreeSeason;
#endif`;

const TREE_VERTEX_BODY = /* glsl */ `
#if defined( SEASON_BARE ) || defined( SEASON_FRUIT )
	vSeasonPos = position;
	vSeasonUv = uv;
	vTreeSeason = treeSeason;
#endif
`;

const TREE_FRAGMENT_HEAD = /* glsl */ `
#if defined( SEASON_BARE ) || defined( SEASON_FRUIT )
varying vec3 vSeasonPos;
varying vec2 vSeasonUv;
varying vec3 vTreeSeason;
${CELL_HASH}
#endif`;

// Leaf cards drop whole sprays at a time, so a thinning crown shows its
// boughs; a solid crown thins to a haze of twigs.
const LEAVES_DISCARD = /* glsl */ `
#ifdef SEASON_BARE
	if (vTreeSeason.x < 1.0 && seasonCell(floor(vSeasonPos.xz * 1.3) * 7.0 + floor(vSeasonPos.y * 1.3) * 3.0 + floor(vSeasonUv * 2.0)) >= vTreeSeason.x) discard;
#endif
`;

const CROWN_DISCARD = /* glsl */ `
#ifdef SEASON_BARE
	if (vTreeSeason.x < 1.0 && seasonCell(floor(vSeasonPos.xz * 6.0) + floor(vSeasonPos.y * 6.0) * 5.0) >= mix(${glslFloat(BARE_CROWN)}, 1.0, vTreeSeason.x)) discard;
#endif
`;

// Fruit: red or orange specks among the leaves.
const fruitColour = (speck) => /* glsl */ `
#ifdef SEASON_FRUIT
	if (seasonCell(${speck}) < vTreeSeason.y) diffuseColor.rgb = vTreeSeason.z < 0.5 ? vec3(${FRUIT_COLOURS[0].join(', ')}) : vec3(${FRUIT_COLOURS[1].join(', ')});
#endif
`;

const LEAVES_COLOUR = fruitColour('floor(vSeasonUv * 9.0) + floor(vSeasonPos.xz * 1.7) * 13.0 + floor(vSeasonPos.y * 1.7) * 7.0');
const CROWN_COLOUR = fruitColour('floor(vSeasonPos.xz * 9.0) + floor(vSeasonPos.y * 9.0) * 3.0');

// Patches one of a tree's materials (`part`: TREE_PART) to drop its leaves
// and bear fruit, read from its instances' `treeSeason` (leaf, fruit,
// fruitKind: treeSeasonOf()). `depth`: the part's shadow material, which
// only drops leaves. Bark is left as it is (snow lies on it,
// renderer/WetSurfaces.js). Until setTreeSeasonFlags() asks for some, it
// adds nothing to the shaders. Returns the material.
export function makeSeasonalTree(material, { part = TREE_PART.LEAVES, depth = false } = {}) {
    if (part === TREE_PART.BARK) return material;
    const leaves = part === TREE_PART.LEAVES;
    return chainPatch(material, `forkbuild-season-tree-${leaves ? 'leaves' : 'crown'}${depth ? '-depth' : ''}`, (shader) => {
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

// A tree's own three numbers in [0, 1), from where it stands: the same on
// every device and every visit.
export function treeNumbers(x, z) {
    const h = (salt) => {
        let v = Math.imul(Math.round(x * 16) | 0, 0x27d4eb2d) ^ Math.imul(Math.round(z * 16) | 0, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1);
        v = Math.imul(v ^ (v >>> 15), 0x85ebca6b);
        v = Math.imul(v ^ (v >>> 13), 0xc2b2ae35);
        v ^= v >>> 16;
        return (v >>> 0) / 4294967296;
    };
    return [h(1), h(2), h(3)];
}
