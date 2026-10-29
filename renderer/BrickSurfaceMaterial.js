import * as THREE from 'three';
import { BrickSurface, SURFACE_ROUGHNESS } from '../core/building/BrickSurface.js';

// The brick look (docs/Pillars.md, "Look"): every brick gets a soft dark
// line along its edges, so a wall reads as bricks laid together rather than
// one flat panel, a slight shade of its own, so no two bricks are quite the
// same, and the grain of what it is made of (core/building/BrickSurface.js): masonry
// courses, plaster, wood grain, roof tiles, glass, leaves, rough stone.
//
// All of it is drawn by the shader from the brick's own (object-space)
// position, multiplied into its colour: no images to download, nothing that
// depends on a geometry's UVs, and a brick looks the same wherever it is
// placed and however it is turned. Each geometry carries its bounding box
// (withBrickBounds()) so the edges are found per brick, instanced or not.

const SURFACE_INDEX = Object.freeze({
    [BrickSurface.MASONRY]: 1,
    [BrickSurface.PLASTER]: 2,
    [BrickSurface.WOOD]: 3,
    [BrickSurface.TILE]: 4,
    [BrickSurface.GLASS]: 5,
    [BrickSurface.FOLIAGE]: 6,
    [BrickSurface.STONE]: 7,
    [BrickSurface.PLAIN]: 0
});

// Leaves and rock are lumps, not laid pieces: no edge lines.
const WITHOUT_EDGES = new Set([BrickSurface.FOLIAGE, BrickSurface.STONE]);

// Gives `geometry` its bounding box as two constant attributes, `brickCenter`
// and `brickHalf`, which the shader measures the edges from. Returns it.
export function withBrickBounds(geometry) {
    if (geometry.getAttribute('brickCenter')) return geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    const center = box.getCenter(new THREE.Vector3());
    const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const count = geometry.getAttribute('position').count;
    const centers = new Float32Array(count * 3);
    const halves = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        centers.set([center.x, center.y, center.z], i * 3);
        halves.set([half.x, half.y, half.z], i * 3);
    }
    geometry.setAttribute('brickCenter', new THREE.BufferAttribute(centers, 3));
    geometry.setAttribute('brickHalf', new THREE.BufferAttribute(halves, 3));
    return geometry;
}

const VERTEX_DECLARATIONS = `
attribute vec3 brickCenter;
attribute vec3 brickHalf;
varying vec3 vSurfacePos;
varying vec3 vSurfaceNormal;
varying vec3 vSurfaceCenter;
varying vec3 vSurfaceHalf;
varying vec3 vSurfaceSeed;`;

const VERTEX_ASSIGNMENTS = `
	vSurfacePos = position;
	vSurfaceNormal = normal;
	vSurfaceCenter = brickCenter;
	vSurfaceHalf = brickHalf;
	#ifdef USE_INSTANCING
		vSurfaceSeed = vec3(instanceMatrix[3]);
	#else
		vSurfaceSeed = vec3(modelMatrix[3]);
	#endif`;

const FRAGMENT_FUNCTIONS = `
varying vec3 vSurfacePos;
varying vec3 vSurfaceNormal;
varying vec3 vSurfaceCenter;
varying vec3 vSurfaceHalf;
varying vec3 vSurfaceSeed;

float bsHash(vec3 p) {
	p = fract(p * 0.3183099 + 0.1);
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float bsNoise(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(mix(bsHash(i), bsHash(i + vec3(1.0, 0.0, 0.0)), f.x),
			mix(bsHash(i + vec3(0.0, 1.0, 0.0)), bsHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
		mix(mix(bsHash(i + vec3(0.0, 0.0, 1.0)), bsHash(i + vec3(1.0, 0.0, 1.0)), f.x),
			mix(bsHash(i + vec3(0.0, 1.0, 1.0)), bsHash(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
		f.z);
}

// How near this point is to one of the brick's edges: 1 on an edge, falling
// to 0 a band in from it (the band a share of the brick's smallest half-size).
// BrickInstanceRegistry draws a selected brick's outline with it.
float brickEdgeNearness(float band) {
	vec3 hs = max(vSurfaceHalf, vec3(0.0001));
	vec3 d = hs - abs(vSurfacePos - vSurfaceCenter);
	float lo = min(d.x, min(d.y, d.z));
	float hi = max(d.x, max(d.y, d.z));
	float mid = d.x + d.y + d.z - lo - hi;
	float width = clamp(min(hs.x, min(hs.y, hs.z)) * band, 0.03, 0.12);
	return 1.0 - smoothstep(0.0, width, mid);
}

// How much this point of the brick darkens or lightens its colour.
float brickSurfaceShade() {
	vec3 p = vSurfacePos;
	vec3 hs = max(vSurfaceHalf, vec3(0.0001));
	vec3 rel = p - (vSurfaceCenter - hs);
	vec3 n = normalize(vSurfaceNormal);
	// Each brick a little lighter or darker than its neighbours.
	float shade = 1.0 + (bsHash(floor(vSurfaceSeed * 2.0) + 0.5) - 0.5) * 0.08;
	#ifdef BRICK_SURFACE_EDGES
		// Near an edge is near two of the box's faces at once.
		vec3 d = hs - abs(p - vSurfaceCenter);
		float lo = min(d.x, min(d.y, d.z));
		float hi = max(d.x, max(d.y, d.z));
		float mid = d.x + d.y + d.z - lo - hi;
		float width = clamp(min(hs.x, min(hs.y, hs.z)) * 0.5, 0.015, 0.06);
		shade *= 1.0 - 0.28 * (1.0 - smoothstep(0.0, width, mid));
	#endif
	// Across a side face, horizontally.
	float along = abs(n.x) > abs(n.z) ? rel.z : rel.x;
	#if BRICK_SURFACE == 1
		// Masonry: courses half a unit high, joints staggered a unit apart.
		if (abs(n.y) < 0.5) {
			float row = floor(rel.y / 0.5);
			float u = along + mod(row, 2.0) * 0.5;
			float jy = min(fract(rel.y / 0.5), 1.0 - fract(rel.y / 0.5)) * 0.5;
			float jx = min(fract(u), 1.0 - fract(u));
			float joint = 1.0 - smoothstep(0.012, 0.03, min(jy, jx));
			shade *= mix(1.0 + (bsHash(vec3(floor(u), row, 3.0)) - 0.5) * 0.1, 0.8, joint);
		} else {
			shade *= 0.96 + 0.08 * bsNoise(p * 6.0);
		}
	#elif BRICK_SURFACE == 2
		// Plaster: smooth, a little uneven.
		shade *= 0.95 + 0.06 * bsNoise(p * 2.5) + 0.03 * bsNoise(p * 11.0);
	#elif BRICK_SURFACE == 3
		// Wood: grain along the piece's longest side.
		float g;
		if (hs.x >= hs.y && hs.x >= hs.z) g = p.y * 3.0 + p.z * 5.0 + bsNoise(p * vec3(0.6, 4.0, 4.0)) * 1.6;
		else if (hs.y >= hs.z) g = p.x * 5.0 + p.z * 3.0 + bsNoise(p * vec3(4.0, 0.6, 4.0)) * 1.6;
		else g = p.x * 5.0 + p.y * 3.0 + bsNoise(p * vec3(4.0, 4.0, 0.6)) * 1.6;
		shade *= 0.9 + 0.1 * (0.5 + 0.5 * sin(g * 6.2831853));
	#elif BRICK_SURFACE == 4
		// Roof tiles: rows a quarter unit high, each shadowed by the one
		// above, the tiles half a unit wide and staggered.
		float course = floor(rel.y / 0.25);
		float t = fract(rel.y / 0.25);
		float u = along / 0.5 + mod(course, 2.0) * 0.5;
		float seam = min(fract(u), 1.0 - fract(u));
		shade *= mix(0.8, 1.02, smoothstep(0.0, 0.4, t));
		shade *= 1.0 - 0.12 * (1.0 - smoothstep(0.02, 0.06, seam));
		shade *= 1.0 + (bsHash(vec3(floor(u), course, 7.0)) - 0.5) * 0.08;
	#elif BRICK_SURFACE == 5
		// Glass: a sheen brighter towards the top.
		shade *= 0.92 + 0.12 * clamp(rel.y / (2.0 * hs.y), 0.0, 1.0);
	#elif BRICK_SURFACE == 6
		// Leaves: clumps of light and shade.
		shade *= 0.85 + 0.25 * bsNoise(p * 5.0);
	#elif BRICK_SURFACE == 7
		// Rough stone.
		shade *= 0.82 + 0.18 * bsNoise(p * 3.0) + 0.08 * bsNoise(p * 12.0);
	#else
		shade *= 0.97 + 0.05 * bsNoise(p * 8.0);
	#endif
	return shade;
}`;

// Gives `material` the look of `surface` (core/building/BrickSurface.js), on top of
// whatever its own onBeforeCompile already does (the instanced highlight,
// the night glow, which call it in turn). Sets its roughness. Returns it.
export function applyBrickSurface(material, surface = BrickSurface.PLAIN) {
    if (!material || material.userData.brickSurface) return material;
    const index = SURFACE_INDEX[surface] ?? 0;
    material.userData.brickSurface = surface;
    material.roughness = SURFACE_ROUGHNESS[surface] ?? SURFACE_ROUGHNESS.plain;
    material.defines = { ...(material.defines || {}), BRICK_SURFACE: index };
    if (!WITHOUT_EDGES.has(surface)) material.defines.BRICK_SURFACE_EDGES = '';
    const previous = material.onBeforeCompile;
    const previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderer) => {
        if (typeof previous === 'function') previous.call(material, shader, renderer);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>${VERTEX_DECLARATIONS}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>${VERTEX_ASSIGNMENTS}`);
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>${FRAGMENT_FUNCTIONS}`)
            .replace('#include <color_fragment>', '#include <color_fragment>\n\tdiffuseColor.rgb *= brickSurfaceShade();');
    };
    material.customProgramCacheKey = () => `${previousKey ? previousKey.call(material) : ''}|brick-surface-${surface}`;
    material.needsUpdate = true;
    return material;
}
