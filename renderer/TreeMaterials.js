import * as THREE from 'three';

// The look of World View's trees (renderer/TreeForest.js): bark, leaves and
// the solid crowns that stand in for leaves farther off, and the wind that
// sways them all.
//
// Textures are painted here, pixel by pixel from a fixed seed, never
// downloaded: a cluster of broad leaves, a spray of needles and a strip of
// bark. They are near-grey; each tree's instance colour gives the hue, so the
// muted palette stays in one place (TreeForest.js's SPECIES_LOOK).
//
// The wind is a vertex patch on every tree material and its shadow material,
// so a swaying tree's shadow sways with it: each vertex is pushed downwind by
// its flex (renderer/TreeGeometry.js's `treeWind`), in gusts that roll across
// the forest, and leaves flutter on top. The push is worked out in world
// space and turned back into the tree's own space, so it is the same for
// every tree whichever way it was turned, leaned or stretched.

export const LEAF_TEXTURE_SIZE = 128;
const BARK_TEXTURE_WIDTH = 64;
const BARK_TEXTURE_HEIGHT = 128;
// How far, in metres, a point of flex 1 is pushed in the strongest wind.
const SWAY_METRES = 0.35;

function rngFor(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

class Canvas {
    constructor(width, height, fill) {
        this.width = width;
        this.height = height;
        this.data = new Uint8Array(width * height * 4);
        // Transparent pixels keep a leaf colour so mipmaps don't fringe dark.
        for (let i = 0; i < width * height; i++) {
            this.data.set([fill[0], fill[1], fill[2], 0], i * 4);
        }
    }

    plot(x, y, rgb, alpha = 255) {
        const px = Math.round(x);
        const py = Math.round(y);
        if (px < 0 || py < 0 || px >= this.width || py >= this.height) return;
        const i = (py * this.width + px) * 4;
        this.data[i] = rgb[0];
        this.data[i + 1] = rgb[1];
        this.data[i + 2] = rgb[2];
        this.data[i + 3] = alpha;
    }

    // A line `width` pixels thick.
    line(x0, y0, x1, y1, width, rgb) {
        const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
        const r = width / 2;
        for (let s = 0; s <= steps; s++) {
            const x = x0 + ((x1 - x0) * s) / steps;
            const y = y0 + ((y1 - y0) * s) / steps;
            for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) {
                for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
                    if (dx * dx + dy * dy <= r * r + 0.25) this.plot(x + dx, y + dy, rgb);
                }
            }
        }
    }

    texture({ repeat = false } = {}) {
        const texture = new THREE.DataTexture(this.data, this.width, this.height, THREE.RGBAFormat);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.magFilter = THREE.LinearFilter;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
        texture.needsUpdate = true;
        return texture;
    }
}

const shadeOf = (lum, hue) => [
    Math.round(255 * Math.min(1, lum * (0.9 + hue * 0.1))),
    Math.round(255 * Math.min(1, lum)),
    Math.round(255 * Math.min(1, lum * (0.84 - hue * 0.06)))
];

// A cluster of broad leaves on a few twigs, filling most of the card.
export function paintBroadLeaves(seed = 0x4c454146) {
    const size = LEAF_TEXTURE_SIZE;
    const rng = rngFor(seed);
    const canvas = new Canvas(size, size, shadeOf(0.75, 0));
    const mid = size / 2;
    const twig = [92, 84, 70];
    const tips = [];
    for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2 + rng() * 0.6;
        const reach = size * (0.32 + rng() * 0.1);
        const tip = [mid + Math.cos(angle) * reach, mid + Math.sin(angle) * reach];
        canvas.line(mid, mid, tip[0], tip[1], 1.6, twig);
        tips.push({ angle, reach });
    }
    for (let i = 0; i < 64; i++) {
        const along = tips[i % tips.length];
        const t = 0.15 + rng() * 0.9;
        const cx = mid + Math.cos(along.angle) * along.reach * t + (rng() - 0.5) * 14;
        const cy = mid + Math.sin(along.angle) * along.reach * t + (rng() - 0.5) * 14;
        const angle = along.angle + (rng() - 0.5) * 1.8;
        const length = 8 + rng() * 5;
        const width = length * (1.1 + rng() * 0.3);
        const lum = 0.58 + rng() * 0.38;
        const hue = rng() * 2 - 1;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const reach = Math.ceil(length) + 1;
        for (let dy = -reach; dy <= reach; dy++) {
            for (let dx = -reach; dx <= reach; dx++) {
                const u = (dx * cos + dy * sin) / length;
                const v = -dx * sin + dy * cos;
                if (u < -1 || u > 1) continue;
                // Pointed at both ends, widest a little before the middle.
                const half = (width / 2) * Math.pow(Math.sin((Math.PI * (u + 1)) / 2), 0.8) * (1 - 0.15 * u);
                if (Math.abs(v) > half) continue;
                const side = v / (half || 1);
                const vein = Math.abs(v) < 0.7 ? 0.82 : 1;
                canvas.plot(cx + dx, cy + dy, shadeOf(lum * (0.92 + 0.12 * side) * vein, hue));
            }
        }
    }
    return canvas;
}

// A spray of needles: a stem with side shoots, each bristling both ways.
export function paintNeedles(seed = 0x4e45454c) {
    const size = LEAF_TEXTURE_SIZE;
    const rng = rngFor(seed);
    const canvas = new Canvas(size, size, shadeOf(0.7, -0.5));
    const stem = [86, 78, 66];
    const shoots = [{ x0: 6, y0: size / 2, angle: 0, length: size - 14 }];
    for (let i = 0; i < 7; i++) {
        const t = 0.15 + (i / 7) * 0.7;
        const side = i % 2 === 0 ? 1 : -1;
        shoots.push({ x0: 6 + (size - 14) * t, y0: size / 2, angle: side * (0.55 + rng() * 0.3), length: (size / 2 - 10) * (1 - t * 0.5) });
    }
    for (const shoot of shoots) {
        const x1 = shoot.x0 + Math.cos(shoot.angle) * shoot.length;
        const y1 = shoot.y0 + Math.sin(shoot.angle) * shoot.length;
        canvas.line(shoot.x0, shoot.y0, x1, y1, 1.5, stem);
        for (let s = 2; s < shoot.length; s += 1.6) {
            const x = shoot.x0 + Math.cos(shoot.angle) * s;
            const y = shoot.y0 + Math.sin(shoot.angle) * s;
            const needle = 6 + rng() * 5 * (1 - (s / shoot.length) * 0.4);
            const lum = 0.55 + rng() * 0.4;
            for (const side of [1, -1]) {
                const a = shoot.angle + side * (0.85 + rng() * 0.35);
                canvas.line(x, y, x + Math.cos(a) * needle, y + Math.sin(a) * needle, 1.2, shadeOf(lum, -0.5));
            }
        }
    }
    return canvas;
}

// Bark: ridges running up the trunk with darker furrows between, tiling both ways.
export function paintBark(seed = 0x4241524b) {
    const rng = rngFor(seed);
    const w = BARK_TEXTURE_WIDTH;
    const h = BARK_TEXTURE_HEIGHT;
    const canvas = new Canvas(w, h, [180, 180, 180]);
    const cellsX = 8;
    const cellsY = 6;
    const grid = Array.from({ length: cellsX * cellsY }, () => rng());
    const at = (cx, cy) => grid[((cy % cellsY) + cellsY) % cellsY * cellsX + (((cx % cellsX) + cellsX) % cellsX)];
    const noise = (x, y) => {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const tx = x - x0;
        const ty = y - y0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        return top + (bottom - top) * sy;
    };
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const ridge = noise((x / w) * cellsX, (y / h) * cellsY);
            const fine = noise((x / w) * cellsX * 2 + 3.1, (y / h) * cellsY * 0.5);
            const furrow = Math.abs(Math.sin(((x / w) * 8 + ridge * 0.45) * Math.PI));
            const lum = 0.52 + 0.22 * ridge + 0.16 * fine - 0.2 * Math.pow(1 - furrow, 4);
            const v = Math.round(255 * Math.min(1, Math.max(0.2, lum)));
            canvas.plot(x, y, [v, Math.round(v * 0.97), Math.round(v * 0.93)]);
        }
    }
    return canvas;
}

// The wind every tree material reads. `strength` is 0 (still) to 1 (a gale);
// `direction` the way it blows, on the ground.
export function createTreeWind() {
    return {
        time: { value: 0 },
        strength: { value: 0.3 },
        direction: { value: new THREE.Vector2(0.92, 0.39).normalize() }
    };
}

const WIND_HEAD = /* glsl */ `
attribute vec2 treeWind;
uniform float uTreeTime;
uniform float uTreeWind;
uniform vec2 uTreeWindDir;`;

const WIND_BODY = /* glsl */ `
#ifdef USE_INSTANCING
	{
		vec3 treeOrigin = vec3( instanceMatrix[ 3 ] );
		float treePhase = dot( treeOrigin.xz, vec2( 0.071, 0.113 ) );
		float gust = 0.65 + 0.35 * sin( uTreeTime * 0.31 + treePhase * 0.5 );
		float bend = 0.55 + 0.45 * sin( uTreeTime * 1.1 + treePhase ) + 0.18 * sin( uTreeTime * 2.3 + treePhase * 1.7 );
		float sway = treeWind.x * uTreeWind * gust * bend * ${SWAY_METRES.toFixed(3)};
		vec3 treePush = vec3( uTreeWindDir.x, 0.0, uTreeWindDir.y ) * sway;
		treePush.y -= sway * sway * 0.15;
		float flutter = treeWind.y * 0.12 * uTreeWind
			* sin( uTreeTime * 6.5 + dot( position, vec3( 3.1, 2.3, 1.7 ) ) + treePhase * 3.0 );
		treePush += vec3( flutter, flutter * 1.4, - flutter * 0.8 );
		mat3 treeBasis = mat3( instanceMatrix );
		transformed += vec3(
			dot( treeBasis[ 0 ], treePush ) / dot( treeBasis[ 0 ], treeBasis[ 0 ] ),
			dot( treeBasis[ 1 ], treePush ) / dot( treeBasis[ 1 ], treeBasis[ 1 ] ),
			dot( treeBasis[ 2 ], treePush ) / dot( treeBasis[ 2 ], treeBasis[ 2 ] ) );
	}
#endif`;

// Patches `material` to sway with `wind` (createTreeWind()). With `leaves`, a
// card lit from behind isn't shaded as if it faced away: its normal points out
// of the crown (renderer/TreeGeometry.js), whichever side is seen.
export function makeSwaying(material, wind, { leaves = false } = {}) {
    material.onBeforeCompile = (shader) => {
        shader.uniforms.uTreeTime = wind.time;
        shader.uniforms.uTreeWind = wind.strength;
        shader.uniforms.uTreeWindDir = wind.direction;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', `#include <common>${WIND_HEAD}`)
            .replace('#include <begin_vertex>', `#include <begin_vertex>${WIND_BODY}`);
        if (leaves) {
            shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
#if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
	normal *= faceDirection;
#endif`);
        }
    };
    material.customProgramCacheKey = () => `forkbuild-tree-wind${leaves ? '-leaves' : ''}`;
    return material;
}

// Every material World View's trees are drawn with, sharing `wind`.
// { bark, broadLeaves, needles, crown } each { material, depth }, where depth
// is the shadow pass's material (Object3D#customDepthMaterial).
export function createTreeMaterials(wind) {
    const textures = {
        bark: paintBark().texture({ repeat: true }),
        broadLeaves: paintBroadLeaves().texture(),
        needles: paintNeedles().texture()
    };
    // A leaf card's shadow is cut out by its leaves, as the card is.
    const depth = (map = null) => makeSwaying(new THREE.MeshDepthMaterial(map
        ? { depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.5 }
        : { depthPacking: THREE.RGBADepthPacking }), wind);
    const leafMaterial = (map) => makeSwaying(new THREE.MeshStandardMaterial({
        map,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
        roughness: 0.82
    }), wind, { leaves: true });
    return {
        textures,
        bark: { material: makeSwaying(new THREE.MeshStandardMaterial({ map: textures.bark, roughness: 0.95 }), wind), depth: depth() },
        broadLeaves: { material: leafMaterial(textures.broadLeaves), depth: depth(textures.broadLeaves) },
        needles: { material: leafMaterial(textures.needles), depth: depth(textures.needles) },
        // About as bright as the leaf textures are on average, so a tree
        // doesn't change shade as it changes detail.
        crown: { material: makeSwaying(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.58, 0.58, 0.58), roughness: 0.9 }), wind), depth: depth() }
    };
}

export function disposeTreeMaterials(materials) {
    for (const texture of Object.values(materials.textures)) texture.dispose();
    for (const key of ['bark', 'broadLeaves', 'needles', 'crown']) {
        materials[key].material.dispose();
        materials[key].depth.dispose();
    }
}
