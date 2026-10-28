// Builds made up for the measuring scripts (scripts/evaluate-ready-made-
// detection.mjs, scripts/evaluate-look-alikes.mjs): seeded, so a report is the
// same on every run. Not part of the app.
import { buildShape } from '../core/catalog/BuildSimilarity.js';

export function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
export const pick = (r, list) => list[Math.floor(r() * list.length)];
export const KINDS = ['core:cube', 'core:block_2x2', 'core:plate_2x4', 'core:beam', 'core:window_small', 'core:door', 'core:slab_4x4', 'core:roof_cone'];
export const P = (definitionId, x, y, z) => ({ definitionId, position: { x, y, z } });

export function turnMove(bricks, turn, dx, dy, dz) {
    return bricks.map((b) => {
        const { x, y, z } = b.position;
        const [tx, tz] = turn === 90 ? [-z, x] : turn === 180 ? [-x, -z] : turn === 270 ? [z, -x] : [x, z];
        return P(b.definitionId, tx + dx, y + dy, tz + dz);
    });
}

// Changes `rate` of a structure's bricks: a third removed, a third swapped for
// another kind, a third moved one stud. Returns { bricks, kept }: `kept` the
// bricks left as they were.
export function modify(r, bricks, rate) {
    const out = [];
    const kept = [];
    for (const b of bricks) {
        if (r() >= rate) { out.push(b); kept.push(b); continue; }
        const how = r();
        if (how < 1 / 3) continue;
        if (how < 2 / 3) { out.push(P(pick(r, KINDS.filter((k) => k !== b.definitionId)), b.position.x, b.position.y, b.position.z)); continue; }
        out.push(P(b.definitionId, b.position.x + (r() < 0.5 ? 1 : -1), b.position.y, b.position.z));
    }
    return { bricks: out, kept };
}

// A hand-built build of `n` bricks: walls, a tower and scattered pieces,
// grown brick by brick next to what is there, as people build.
export function handBuilt(r, n, origin = { x: 0, z: 0 }) {
    const bricks = [];
    const taken = new Set();
    const add = (k, x, y, z) => { const key = `${x}|${y}|${z}`; if (taken.has(key)) return false; taken.add(key); bricks.push(P(k, x + origin.x, y, z + origin.z)); return true; };
    const w = 3 + Math.floor(r() * 6);
    const d = 3 + Math.floor(r() * 5);
    const h = 1 + Math.floor(r() * 3);
    const wallKind = pick(r, ['core:cube', 'core:block_2x2']);
    for (let y = 0; y < h && bricks.length < n; y++) {
        for (let x = 0; x < w && bricks.length < n; x++) for (const z of [0, d]) add(r() < 0.1 ? 'core:window_small' : wallKind, x, y + 0.5, z);
        for (let z = 1; z < d && bricks.length < n; z++) for (const x of [0, w - 1]) add(wallKind, x, y + 0.5, z);
    }
    let guard = 0;
    while (bricks.length < n && guard++ < n * 20) {
        const from = pick(r, bricks).position;
        add(pick(r, KINDS), from.x - origin.x + Math.floor(r() * 3) - 1, Math.max(0.5, from.y + Math.floor(r() * 3) - 1), from.z - origin.z + Math.floor(r() * 3) - 1);
    }
    return bricks;
}

// A build by hand in a structure's own palette: the same kinds of brick, as
// many of each, within the same footprint, but placed by hand (each next to
// one already there), so it is that structure's style without being it.
export function inPaletteOf(r, structure, origin = { x: 0, z: 0 }) {
    const pts = buildShape(structure.bricks).points;
    const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y); const zs = pts.map((p) => p.z);
    const [x0, x1, y0, y1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), Math.min(...zs), Math.max(...zs)];
    const kinds = pts.map((p) => p.definitionId).sort(() => r() - 0.5);
    const out = []; const taken = new Set();
    let guard = 0;
    while (kinds.length && guard++ < 50000) {
        const anchor = out.length ? pick(r, out).position : { x: x0, y: y0, z: z0 };
        const x = out.length ? Math.min(x1, Math.max(x0, anchor.x + Math.floor(r() * 3) - 1)) : anchor.x;
        const y = out.length ? Math.min(y1, Math.max(y0, anchor.y + Math.floor(r() * 3) - 1)) : anchor.y;
        const z = out.length ? Math.min(z1, Math.max(z0, anchor.z + Math.floor(r() * 3) - 1)) : anchor.z;
        const key = `${x}|${y}|${z}`;
        if (taken.has(key)) continue;
        taken.add(key);
        out.push(P(kinds.pop(), x, y, z));
    }
    return out.map((b) => P(b.definitionId, b.position.x + origin.x, b.position.y, b.position.z + origin.z));
}
