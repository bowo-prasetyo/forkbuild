import { TREE_SPECIES } from './NaturalFeatureField.js';

// What a tree is shaped like: its trunk, its branches and where its leaves
// hang, worked out from a seed alone so every device grows the same trees
// with nothing downloaded or stored (docs/Principles.md, "Natural Features Are
// Sampled, Never Stored"). renderer/TreeGeometry.js turns a form into meshes.
//
// Each species has TREE_FORMS_PER_SPECIES forms, and every tree in the world
// is one of them (treeShapeOf()), stretched, leaned and tinted a little on its
// own, so a forest of thousands of trees costs a dozen shapes on the GPU.
//
// Units are metres, the tree's base at the origin, +Y up. A form's height is
// that of a tree whose feature.scale is 1 (core/NaturalFeatureField.js spreads
// scale over [0.7, 1.3)). Trunks stay inside core/TreeCollisionGeometry.js's
// hitbox, which they were chosen to match.

export const TREE_FORMS_PER_SPECIES = 4;

// How far below the ground a trunk starts, so it never floats on a slope.
export const TRUNK_ROOT_DEPTH = 0.4;

// The most a point can sway, in units of flex (see flexAt()).
export const MAX_FLEX = 1.8;

const SPECIES_SPEC = Object.freeze({
    // Tall and narrow: a straight trunk to the top with whorls of drooping
    // branches, shorter towards the top, under sprays of needles.
    [TREE_SPECIES.CONIFER]: Object.freeze({
        habit: 'whorled',
        height: 9.5,
        trunkRadius: 0.24,
        crownBase: [0.16, 0.26],
        crownRadius: [1.7, 2.1],
        whorlSpacing: 0.62,
        branchesPerWhorl: [5, 7],
        droop: 0.22,
        leafSize: [1.05, 1.45]
    }),
    // A trunk to about a third of its height, then a few limbs forking into a
    // broad, rounded crown of leaf clusters.
    [TREE_SPECIES.BROADLEAF]: Object.freeze({
        habit: 'forking',
        height: 7.5,
        trunkRadius: 0.27,
        trunkShare: [0.26, 0.34],
        leader: true,
        limbs: [3, 5],
        limbAngle: [0.4, 0.7],
        limbLength: 0.46,
        children: [2, 3],
        childAngle: [0.35, 0.65],
        lengthRatio: 0.64,
        maxDepth: 3,
        upPull: 0.2,
        wander: 0.22,
        leavesPerTip: 3,
        leafSize: [1.4, 1.9]
    }),
    // Short and crooked: stems parting low into a small, open crown.
    [TREE_SPECIES.SCRUB]: Object.freeze({
        habit: 'forking',
        height: 3.2,
        trunkRadius: 0.11,
        trunkShare: [0.12, 0.2],
        leader: false,
        limbs: [3, 5],
        limbAngle: [0.45, 0.85],
        limbLength: 0.5,
        children: [2, 3],
        childAngle: [0.4, 0.8],
        lengthRatio: 0.68,
        maxDepth: 2,
        upPull: 0.14,
        wander: 0.3,
        leavesPerTip: 3,
        leafSize: [0.95, 1.25]
    })
});

// A small seeded generator (mulberry32): a form is a function of its seed.
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

function hashString(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    }
    return h >>> 0;
}

const between = (rng, [lo, hi]) => lo + rng() * (hi - lo);
const intBetween = (rng, [lo, hi]) => lo + Math.floor(rng() * (hi - lo + 1));

function normalize(v) {
    const length = Math.hypot(v.x, v.y, v.z) || 1;
    return { x: v.x / length, y: v.y / length, z: v.z / length };
}

function add(a, b, s = 1) {
    return { x: a.x + b.x * s, y: a.y + b.y * s, z: a.z + b.z * s };
}

// Any unit vector at right angles to `d`.
function perpendicular(d) {
    const ref = Math.abs(d.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
    return normalize({
        x: d.y * ref.z - d.z * ref.y,
        y: d.z * ref.x - d.x * ref.z,
        z: d.x * ref.y - d.y * ref.x
    });
}

// `d` turned by `angle` away from itself, towards the side `azimuth` picks.
function turn(d, angle, azimuth) {
    const p = perpendicular(d);
    const q = {
        x: d.y * p.z - d.z * p.y,
        y: d.z * p.x - d.x * p.z,
        z: d.x * p.y - d.y * p.x
    };
    const side = add({ x: p.x * Math.cos(azimuth), y: p.y * Math.cos(azimuth), z: p.z * Math.cos(azimuth) }, q, Math.sin(azimuth));
    return normalize(add({ x: d.x * Math.cos(angle), y: d.y * Math.cos(angle), z: d.z * Math.cos(angle) }, side, Math.sin(angle)));
}

// How far a point sways in the wind, from how far along the tree it is from
// the ground: nothing at the root, most at the tips. Measured along the wood,
// so a branch starts swaying exactly as much as where it joins its parent.
export function flexAt(pathLength, height) {
    return Math.min(MAX_FLEX, Math.pow(Math.max(pathLength, 0) / height, 1.5));
}

function grownForking(spec, rng, height) {
    const branches = [];
    const leaves = [];
    const trunkLength = height * between(rng, spec.trunkShare);
    const crownLength = height - trunkLength;

    function grow(start, direction, length, radius, depth, limb, pathStart) {
        const segments = depth === 0 ? 5 : 3;
        const points = [start];
        const radii = [radius];
        const flex = [flexAt(pathStart, height)];
        const endRadius = radius * (depth === spec.maxDepth ? 0.35 : 0.72);
        let dir = direction;
        let at = start;
        for (let i = 1; i <= segments; i++) {
            if (depth > 0) {
                const wobble = normalize({ x: rng() - 0.5, y: rng() - 0.5, z: rng() - 0.5 });
                dir = normalize(add(add(dir, wobble, spec.wander), { x: 0, y: 1, z: 0 }, spec.upPull));
            } else if (i > 1) {
                dir = normalize(add(dir, { x: rng() - 0.5, y: 0, z: rng() - 0.5 }, 0.06));
            }
            at = add(at, dir, length / segments);
            points.push(at);
            radii.push(radius + (endRadius - radius) * (i / segments));
            flex.push(flexAt(pathStart + (length * i) / segments, height));
        }
        branches.push({ points, radii, flex, depth, limb });

        // The last level carries the leaves; the one before it a few more,
        // so the crown is deep, not a shell.
        const leafCount = depth === spec.maxDepth ? spec.leavesPerTip : depth === spec.maxDepth - 1 ? 1 : 0;
        for (let i = 0; i < leafCount; i++) {
            const along = i === 0 ? 1 : 0.45 + rng() * 0.45;
            const index = Math.min(segments, Math.round(along * segments));
            const centre = add(points[index], normalize({ x: rng() - 0.5, y: rng() * 0.6 - 0.1, z: rng() - 0.5 }), 0.3);
            leaves.push({
                ...centre,
                size: between(rng, spec.leafSize),
                flex: Math.min(MAX_FLEX, flex[index] + 0.05),
                limb,
                dir
            });
        }
        if (depth === spec.maxDepth) return;

        const count = depth === 0 ? intBetween(rng, spec.limbs) : intBetween(rng, spec.children);
        const spin = rng() * Math.PI * 2;
        for (let c = 0; c < count; c++) {
            const azimuth = spin + (c / count) * Math.PI * 2 + (rng() - 0.5) * 0.6;
            let childDir;
            let childLength;
            const leader = depth === 0 && c === 0 && spec.leader;
            if (depth === 0) {
                // One limb may carry the leader on up; the rest spread.
                const angle = leader ? 0.12 + rng() * 0.15 : between(rng, spec.limbAngle);
                childDir = turn({ x: 0, y: 1, z: 0 }, angle, azimuth);
                childLength = crownLength * spec.limbLength * (leader ? 0.9 : 1) * (0.85 + rng() * 0.3);
            } else {
                childDir = turn(dir, between(rng, spec.childAngle), azimuth);
                childLength = length * spec.lengthRatio * (0.85 + rng() * 0.3);
            }
            // Children leave from the end, or a little before it.
            const index = c === 0 || depth === 0 ? segments : Math.max(1, segments - 1);
            // Thinner than the parent where it leaves, as wood is: the
            // children together carry what the parent did.
            const share = leader ? 1 : 0.62;
            grow(points[index], childDir, childLength, radii[index] * share, depth + 1, depth === 0 ? c : limb,
                pathStart + (length * index) / segments);
        }
    }

    grow({ x: 0, y: -TRUNK_ROOT_DEPTH, z: 0 }, { x: 0, y: 1, z: 0 }, trunkLength + TRUNK_ROOT_DEPTH, spec.trunkRadius, 0, 0, -TRUNK_ROOT_DEPTH);
    return { branches, leaves };
}

function grownWhorled(spec, rng, height) {
    const branches = [];
    const leaves = [];
    const crownBase = height * between(rng, spec.crownBase);
    const crownRadius = between(rng, spec.crownRadius);
    const trunkRadiusAt = (y) => spec.trunkRadius * (1 - 0.88 * Math.min(Math.max(y / height, 0), 1));

    const trunkPoints = [];
    const trunkRadii = [];
    const trunkFlex = [];
    const trunkSegments = 8;
    for (let i = 0; i <= trunkSegments; i++) {
        const y = -TRUNK_ROOT_DEPTH + ((height + TRUNK_ROOT_DEPTH) * i) / trunkSegments;
        const lean = i === 0 ? 0 : 0.04 * Math.sin(i * 1.7 + rng() * 2);
        trunkPoints.push({ x: lean, y, z: lean * 0.6 });
        trunkRadii.push(i === trunkSegments ? 0.01 : trunkRadiusAt(y));
        trunkFlex.push(flexAt(y, height));
    }
    branches.push({ points: trunkPoints, radii: trunkRadii, flex: trunkFlex, depth: 0, limb: 0 });

    let whorl = 0;
    for (let y = crownBase; y < height - 0.45; y += spec.whorlSpacing * (0.85 + rng() * 0.3), whorl++) {
        const t = (y - crownBase) / (height - crownBase);
        const reach = 0.3 + crownRadius * Math.pow(1 - t, 0.95);
        const count = intBetween(rng, spec.branchesPerWhorl);
        const spin = rng() * Math.PI * 2;
        for (let c = 0; c < count; c++) {
            const azimuth = spin + (c / count) * Math.PI * 2 + (rng() - 0.5) * 0.5;
            const outward = { x: Math.cos(azimuth), y: 0, z: Math.sin(azimuth) };
            const length = reach * (0.85 + rng() * 0.3);
            const rise = 0.25 - t * 0.1;
            const radius = Math.max(0.014, trunkRadiusAt(y) * 0.26);
            const points = [{ x: outward.x * trunkRadiusAt(y) * 0.5, y, z: outward.z * trunkRadiusAt(y) * 0.5 }];
            const radii = [radius];
            const flex = [flexAt(y, height)];
            const segments = 3;
            for (let i = 1; i <= segments; i++) {
                const s = i / segments;
                // Up a little from the trunk, then drooping towards the tip.
                const drop = rise * length * s - spec.droop * length * s * s;
                points.push({ x: outward.x * length * s, y: y + drop, z: outward.z * length * s });
                radii.push(radius * (1 - 0.75 * s));
                flex.push(flexAt(y + length * s, height));
            }
            branches.push({ points, radii, flex, depth: 1, limb: whorl });
            const tip = points[segments];
            for (const along of [0.45, 0.78, 1]) {
                const index = Math.min(segments, Math.round(along * segments));
                // The last spray reaches past the tip, hiding it.
                const past = along === 1 ? 0.25 : 0;
                const p = points[index];
                leaves.push({
                    x: p.x + outward.x * past, y: p.y + 0.05, z: p.z + outward.z * past,
                    size: between(rng, spec.leafSize) * (0.55 + 0.45 * Math.min(length / crownRadius, 1)),
                    flex: flex[index],
                    limb: whorl,
                    dir: normalize({ x: tip.x - points[0].x, y: tip.y - points[0].y, z: tip.z - points[0].z })
                });
            }
        }
    }
    // The leader's tuft, hiding the trunk's tip.
    for (let i = 0; i < 5; i++) {
        const azimuth = (i / 5) * Math.PI * 2;
        leaves.push({
            x: Math.cos(azimuth) * 0.1, y: height - 0.55 + i * 0.12, z: Math.sin(azimuth) * 0.1,
            size: spec.leafSize[0] * 0.75,
            flex: flexAt(height, height),
            limb: whorl,
            dir: { x: Math.cos(azimuth) * 0.3, y: 0.95, z: Math.sin(azimuth) * 0.3 }
        });
    }
    return { branches, leaves };
}

// The space the leaves fill: for the far-off shapes, which stand in for all of
// them.
function crownOf(leaves) {
    let base = Infinity;
    let top = -Infinity;
    let radius = 0;
    for (const leaf of leaves) {
        base = Math.min(base, leaf.y - leaf.size / 2);
        top = Math.max(top, leaf.y + leaf.size / 2);
        radius = Math.max(radius, Math.hypot(leaf.x, leaf.z) + leaf.size / 2);
    }
    return Object.freeze({ base, top, radius, centreY: (base + top) / 2, halfHeight: (top - base) / 2 });
}

const formCache = new Map();

// Form `index` (0 to TREE_FORMS_PER_SPECIES - 1) of `species`: the same
// frozen object every call.
export function treeForm(species, index) {
    const spec = SPECIES_SPEC[species] ?? SPECIES_SPEC[TREE_SPECIES.CONIFER];
    const key = `${species}:${index}`;
    const cached = formCache.get(key);
    if (cached) return cached;

    const rng = rngFor(hashString(`forkbuild-tree:${key}`));
    const height = spec.height * (0.92 + rng() * 0.16);
    const grown = spec.habit === 'whorled' ? grownWhorled(spec, rng, height) : grownForking(spec, rng, height);
    const form = Object.freeze({
        species: SPECIES_SPEC[species] ? species : TREE_SPECIES.CONIFER,
        index,
        height,
        seed: hashString(`forkbuild-tree-leaves:${key}`),
        branches: grown.branches,
        leaves: grown.leaves,
        crown: crownOf(grown.leaves)
    });
    formCache.set(key, form);
    return form;
}

// Every form of every species.
export function allTreeForms() {
    const forms = [];
    for (const species of Object.values(TREE_SPECIES)) {
        for (let i = 0; i < TREE_FORMS_PER_SPECIES; i++) forms.push(treeForm(species, i));
    }
    return forms;
}

// Hashes a position finely enough that neighbouring trees differ.
function hashPosition(salt, x, z) {
    let h = Math.imul(salt ^ Math.floor(x * 64), 0x27d4eb2d);
    h = Math.imul(h ^ (Math.floor(z * 64) + 0x9e3779b9), 0x165667b1);
    h ^= h >>> 15;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
}

// How one tree (a core/NaturalFeatureField.js feature) wears its species: which
// form, how much taller or wider than the form, which way it leans, and a
// small shift in the shade of its leaves and bark, all from where it stands.
export function treeShapeOf(feature) {
    const { x, z } = feature;
    const scale = Number.isFinite(feature.scale) ? feature.scale : 1;
    const leanAngle = hashPosition(0x4c45414e, x, z) * 0.06;
    const leanAzimuth = hashPosition(0x4c415a49, x, z) * Math.PI * 2;
    return {
        form: Math.min(TREE_FORMS_PER_SPECIES - 1, Math.floor(hashPosition(0x464f524d, x, z) * TREE_FORMS_PER_SPECIES)),
        heightScale: scale * (0.92 + hashPosition(0x48474854, x, z) * 0.16),
        widthScale: scale * (0.9 + hashPosition(0x57494454, x, z) * 0.2),
        leanX: Math.cos(leanAzimuth) * leanAngle,
        leanZ: Math.sin(leanAzimuth) * leanAngle,
        shade: 0.9 + hashPosition(0x53484144, x, z) * 0.18
    };
}
