import * as THREE from 'three';
import { TREE_SPECIES } from '../core/NaturalFeatureField.js';

// Turns a core/TreeForm.js form into geometry at three levels of detail
// (renderer/TreeForest.js picks one per tree by distance):
//
//   near  every branch as a tapered tube, and the leaves as clusters of
//         crossed cards cut out by a leaf texture (renderer/TreeMaterials.js)
//   mid   the trunk and main limbs, under a few solid lumps where the leaf
//         clusters are (tiers of cones for a conifer)
//   far   one tube for the trunk under one shape for the whole crown
//
// Every vertex carries `treeWind` (flex, flutter): how far it sways with the
// trunk (core/TreeForm.js#flexAt()) and, for leaves, how much it flutters on
// its own. The shader in renderer/TreeMaterials.js reads them.

const NEAR_RADIAL_SEGMENTS = Object.freeze([8, 5, 4, 3]);
// Branches thinner than this aren't drawn at all close up: their leaves hide them.
const MIN_NEAR_RADIUS = 0.012;
const CARDS_PER_CLUSTER = { needle: 2, broad: 3 };

class GeometryWriter {
    constructor() {
        this.positions = [];
        this.normals = [];
        this.uvs = [];
        this.wind = [];
        this.indices = [];
    }

    get vertexCount() {
        return this.positions.length / 3;
    }

    vertex(p, n, u, v, flex, flutter) {
        this.positions.push(p.x, p.y, p.z);
        this.normals.push(n.x, n.y, n.z);
        this.uvs.push(u, v);
        this.wind.push(flex, flutter);
    }

    build() {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
        geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
        geometry.setAttribute('treeWind', new THREE.Float32BufferAttribute(this.wind, 2));
        geometry.setIndex(this.indices);
        geometry.computeBoundingSphere();
        return geometry;
    }
}

const sub = (a, b) => new THREE.Vector3(a.x - b.x, a.y - b.y, a.z - b.z);

// A tube along `points`, `radii` wide, `sides` round, its frame carried along
// so it doesn't twist. Bark texture repeats about every metre along it.
function writeTube(writer, points, radii, flex, sides) {
    const start = writer.vertexCount;
    let along = 0;
    let normal = null;
    for (let i = 0; i < points.length; i++) {
        const tangent = sub(points[Math.min(i + 1, points.length - 1)], points[Math.max(i - 1, 0)]).normalize();
        if (!normal) {
            const ref = Math.abs(tangent.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
            normal = new THREE.Vector3().crossVectors(tangent, ref).normalize();
        } else {
            normal.sub(tangent.clone().multiplyScalar(normal.dot(tangent))).normalize();
        }
        const binormal = new THREE.Vector3().crossVectors(tangent, normal);
        if (i > 0) along += sub(points[i], points[i - 1]).length();
        for (let s = 0; s <= sides; s++) {
            const angle = (s / sides) * Math.PI * 2;
            const n = normal.clone().multiplyScalar(Math.cos(angle)).addScaledVector(binormal, Math.sin(angle));
            const p = new THREE.Vector3(points[i].x, points[i].y, points[i].z).addScaledVector(n, radii[i]);
            writer.vertex(p, n, s / sides, along, flex[i], 0);
        }
    }
    const ring = sides + 1;
    for (let i = 0; i < points.length - 1; i++) {
        for (let s = 0; s < sides; s++) {
            const a = start + i * ring + s;
            const b = a + ring;
            writer.indices.push(a, a + 1, b, a + 1, b + 1, b);
        }
    }
    // A blunt point closes the end, so a thinner branch leaving it never
    // shows the tube's open mouth.
    const last = points.length - 1;
    const tangent = sub(points[last], points[last - 1]).normalize();
    const tip = new THREE.Vector3(points[last].x, points[last].y, points[last].z).addScaledVector(tangent, radii[last] * 0.6);
    const apex = writer.vertexCount;
    writer.vertex(tip, tangent, 0.5, along, flex[last], 0);
    const lastRing = start + last * ring;
    for (let s = 0; s < sides; s++) {
        writer.indices.push(lastRing + s, lastRing + s + 1, apex);
    }
}

// The same seeded generator core/TreeForm.js grows forms with, so the cards'
// turns are the same on every device.
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

// What a leaf faces for lighting: out from the middle of the crown and a
// little up, rather than the card's own facing, so a crown of flat cards
// shades like a rounded mass of leaves.
function leafNormal(p, form) {
    const conifer = form.species === TREE_SPECIES.CONIFER;
    const centre = new THREE.Vector3(0, conifer ? p.y - 0.4 : form.crown.centreY - form.crown.halfHeight * 0.3, 0);
    return p.clone().sub(centre).normalize().add(new THREE.Vector3(0, 0.35, 0)).normalize();
}

function writeCard(writer, centre, u, v, size, flex, form) {
    const start = writer.vertexCount;
    const corners = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
    for (const [a, b, tu, tv] of corners) {
        const p = centre.clone().addScaledVector(u, (a * size) / 2).addScaledVector(v, (b * size) / 2);
        // The card's own corners flutter; its middle hangs with the branch.
        writer.vertex(p, leafNormal(p, form), tu, tv, flex, 1);
    }
    writer.indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
}

function writeLeafCards(writer, form) {
    const rng = rngFor(form.seed);
    const conifer = form.species === TREE_SPECIES.CONIFER;
    for (const leaf of form.leaves) {
        const centre = new THREE.Vector3(leaf.x, leaf.y, leaf.z);
        const cards = conifer ? CARDS_PER_CLUSTER.needle : CARDS_PER_CLUSTER.broad;
        if (conifer) {
            // A spray lies along its branch, nearly flat, with a second one
            // across it so it never vanishes edge-on.
            const along = new THREE.Vector3(leaf.dir.x, leaf.dir.y * 0.3, leaf.dir.z).normalize();
            const across = new THREE.Vector3().crossVectors(along, new THREE.Vector3(0, 1, 0)).normalize();
            const tilt = (rng() - 0.5) * 0.6;
            const flat = across.clone().applyAxisAngle(along, tilt);
            writeCard(writer, centre, along, flat, leaf.size, leaf.flex, form);
            const upright = new THREE.Vector3().crossVectors(along, flat).normalize().applyAxisAngle(along, 0.5 + rng() * 0.4);
            writeCard(writer, centre, along, upright, leaf.size * 0.8, leaf.flex, form);
        } else {
            const spin = rng() * Math.PI;
            for (let c = 0; c < cards; c++) {
                // Three cards turned evenly about a tilted axis: a ball of leaves
                // from any side.
                const axis = new THREE.Vector3(rng() - 0.5, 1.4, rng() - 0.5).normalize();
                const turnAngle = spin + (c / cards) * Math.PI;
                const u = new THREE.Vector3(Math.cos(turnAngle), 0, Math.sin(turnAngle));
                const v = new THREE.Vector3().crossVectors(u, axis).normalize();
                const tilt = new THREE.Quaternion().setFromAxisAngle(u, (rng() - 0.5) * 0.9);
                writeCard(writer, centre, u, v.applyQuaternion(tilt), leaf.size, leaf.flex, form);
            }
        }
    }
}

function writeBark(writer, form, { maxDepth, sides }) {
    for (const branch of form.branches) {
        if (branch.depth > maxDepth) continue;
        if (branch.radii[0] < MIN_NEAR_RADIUS && branch.depth > 0) continue;
        writeTube(writer, branch.points, branch.radii, branch.flex, sides[Math.min(branch.depth, sides.length - 1)]);
    }
}

// A lump of foliage: a low-poly ball stretched to `radii`, its surface pushed
// in and out a little so neighbouring lumps don't look stamped.
function writeLump(writer, centre, radii, flex, rng, form, detail = 1) {
    const ball = new THREE.IcosahedronGeometry(1, detail);
    const position = ball.getAttribute('position');
    // IcosahedronGeometry is non-indexed; weld its corners so the lump stays
    // closed when pushed in and out.
    const welded = new Map();
    const index = [];
    for (let i = 0; i < position.count; i++) {
        const p = new THREE.Vector3().fromBufferAttribute(position, i);
        const key = `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
        let at = welded.get(key);
        if (at === undefined) {
            at = writer.vertexCount;
            welded.set(key, at);
            const bump = 0.86 + rng() * 0.28;
            const world = new THREE.Vector3(p.x * radii.x * bump, p.y * radii.y * bump, p.z * radii.z * bump).add(centre);
            const n = leafNormal(world, form).add(p.clone().multiplyScalar(0.8)).normalize();
            writer.vertex(world, n, 0, 0, flex, 0);
        }
        index.push(at);
    }
    writer.indices.push(...index);
    ball.dispose();
}

// A cone from `base` to `top`, `radius` wide at its foot, closed underneath.
function writeCone(writer, baseY, topY, radius, flexBase, flexTop, sides, rng) {
    const start = writer.vertexCount;
    const slope = radius / (topY - baseY);
    for (let s = 0; s <= sides; s++) {
        const angle = (s / sides) * Math.PI * 2 + (rng() - 0.5) * 0.25;
        const r = radius * (0.88 + rng() * 0.24);
        const n = new THREE.Vector3(Math.cos(angle), slope, Math.sin(angle)).normalize();
        writer.vertex(new THREE.Vector3(Math.cos(angle) * r, baseY, Math.sin(angle) * r), n, s / sides, 0, flexBase, 0);
    }
    const apex = writer.vertexCount;
    writer.vertex(new THREE.Vector3(0, topY, 0), new THREE.Vector3(0, 1, 0), 0.5, 1, flexTop, 0);
    const bottom = writer.vertexCount;
    writer.vertex(new THREE.Vector3(0, baseY + (topY - baseY) * 0.12, 0), new THREE.Vector3(0, -1, 0), 0.5, 0, flexBase, 0);
    for (let s = 0; s < sides; s++) {
        writer.indices.push(start + s, apex, start + s + 1);
        writer.indices.push(start + s + 1, bottom, start + s);
    }
}

function writeConiferCrown(writer, form, tiers, sides, rng) {
    const { base, top } = form.crown;
    const height = top - base;
    for (let t = 0; t < tiers; t++) {
        // Overlapping tiers, each narrower than the one below.
        const tierBase = base + (height * t) / (tiers + 0.6);
        const tierTop = t === tiers - 1 ? top : tierBase + (height / (tiers + 0.6)) * 1.9;
        const reach = form.leaves
            .filter((leaf) => leaf.y >= tierBase - 0.3 && leaf.y <= tierBase + height / tiers)
            .reduce((most, leaf) => Math.max(most, Math.hypot(leaf.x, leaf.z) + leaf.size * 0.35), 0.4);
        writeCone(writer, tierBase, tierTop, reach, form.leaves[0].flex, Math.min(1.8, 1 + t * 0.1), sides, rng);
    }
}

function writeBroadCrown(writer, form, rng) {
    const byLimb = new Map();
    for (const leaf of form.leaves) {
        const list = byLimb.get(leaf.limb);
        if (list) list.push(leaf);
        else byLimb.set(leaf.limb, [leaf]);
    }
    for (const leaves of byLimb.values()) {
        const centre = new THREE.Vector3();
        let flex = 0;
        for (const leaf of leaves) {
            centre.add(new THREE.Vector3(leaf.x, leaf.y, leaf.z));
            flex += leaf.flex;
        }
        centre.divideScalar(leaves.length);
        flex /= leaves.length;
        const spread = new THREE.Vector3(0.2, 0.2, 0.2);
        let size = 0;
        for (const leaf of leaves) {
            spread.x = Math.max(spread.x, Math.abs(leaf.x - centre.x));
            spread.y = Math.max(spread.y, Math.abs(leaf.y - centre.y));
            spread.z = Math.max(spread.z, Math.abs(leaf.z - centre.z));
            size += leaf.size;
        }
        size /= leaves.length;
        const radii = spread.addScalar(size * 0.38);
        // Scrub is small enough on screen for the plainest ball.
        writeLump(writer, centre, radii, flex, rng, form, form.species === TREE_SPECIES.SCRUB ? 0 : 1);
    }
}

function writeEllipsoidCrown(writer, form, rng) {
    const { centreY, radius, halfHeight } = form.crown;
    const centre = new THREE.Vector3(0, centreY, 0);
    const flex = form.leaves.reduce((sum, leaf) => sum + leaf.flex, 0) / form.leaves.length;
    writeLump(writer, centre, new THREE.Vector3(radius * 0.86, halfHeight * 1.05, radius * 0.86), flex, rng, form);
}

// The trunk alone, from the root up to `topY`, as one tube.
function writeTrunk(writer, form, topY, sides) {
    const trunk = form.branches[0];
    const points = [];
    const radii = [];
    const flex = [];
    for (let i = 0; i < trunk.points.length; i++) {
        if (trunk.points[i].y > topY && points.length >= 2) break;
        points.push(trunk.points[i]);
        radii.push(trunk.radii[i]);
        flex.push(trunk.flex[i]);
    }
    writeTube(writer, points, radii, flex, sides);
}

// Every geometry a form needs: { near: { bark, leaves }, mid: { bark, crown },
// far: { bark, crown } }.
export function buildTreeGeometries(form) {
    const conifer = form.species === TREE_SPECIES.CONIFER;
    const rng = rngFor(form.seed ^ 0x5a5a5a5a);

    const nearBark = new GeometryWriter();
    writeBark(nearBark, form, { maxDepth: Infinity, sides: NEAR_RADIAL_SEGMENTS });
    const nearLeaves = new GeometryWriter();
    writeLeafCards(nearLeaves, form);

    const midBark = new GeometryWriter();
    if (conifer) writeTrunk(midBark, form, form.height, 5);
    else writeBark(midBark, form, { maxDepth: 1, sides: [5, 4] });
    const midCrown = new GeometryWriter();
    if (conifer) writeConiferCrown(midCrown, form, 3, 8, rng);
    else writeBroadCrown(midCrown, form, rng);

    const farBark = new GeometryWriter();
    writeTrunk(farBark, form, conifer ? form.crown.base + 1 : form.crown.base + form.crown.halfHeight * 0.5, 3);
    const farCrown = new GeometryWriter();
    if (conifer) writeConiferCrown(farCrown, form, 1, 6, rng);
    else writeEllipsoidCrown(farCrown, form, rng);

    return {
        near: { bark: nearBark.build(), leaves: nearLeaves.build() },
        mid: { bark: midBark.build(), crown: midCrown.build() },
        far: { bark: farBark.build(), crown: farCrown.build() }
    };
}
