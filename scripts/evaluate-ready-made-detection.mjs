// Measures how well core/catalog/BuildSimilarity.js#withoutReadyMade() takes out of
// a build the ready-made structures from the Build Library its builder
// changed, and what that costs, under the coverage it ships with
// (readyMadeCoverage()) and some others to weigh it against. Run it before
// changing readyMadeCoverage(), and put its numbers in the pull request.
//
//   node scripts/evaluate-ready-made-detection.mjs              print the report
//   node scripts/evaluate-ready-made-detection.mjs --out r.md   write it to r.md
//
// Builds are changed and made by hand with seeded randomness, so the report is
// the same on every run. It takes a few minutes. What it measures:
//
//   E1  how much of its base each Collection remix keeps
//   E2  a structure changed by a share of its bricks (scattered, and in one
//       region): how often it is still found
//   E3  builds made by hand (the example builds at the repository root, and
//       generated ones): bricks wrongly taken out
//   E4  end to end, at SIMILAR_BUILD_THRESHOLD: two builds on the same
//       changed structure wrongly flagged, and real copies still found
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { COLLECTION_REMIXED_FROM } from '../core/library/CollectionLibrary.js';
import { worldBricks } from '../core/building/PlacedBricks.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import {
    MIN_COMPARED_BRICKS,
    MIN_READY_MADE_POINTS,
    SIMILAR_BUILD_THRESHOLD,
    buildShape,
    compareBuildShapes,
    readyMadeCoverage,
    withoutReadyMade
} from '../core/catalog/BuildSimilarity.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : null;
if (outIndex >= 0 && !outPath) {
    console.error('Usage: node scripts/evaluate-ready-made-detection.mjs [--out report.md]');
    process.exit(2);
}

// ---- Policies: the share of a structure's bricks needed, by its size -------
const flat = (share) => (n) => (n < MIN_READY_MADE_POINTS ? null : share);
const scaled = (small, medium, large) => (n) => (n < MIN_READY_MADE_POINTS ? null : n < 12 ? small : n < 30 ? medium : large);
const POLICIES = {
    'shipped (readyMadeCoverage)': readyMadeCoverage,
    'flat 0.9 (before)': flat(0.9),
    'flat 0.8': flat(0.8),
    'flat 0.7': flat(0.7),
    'scaled 1.0/0.9/0.6': scaled(1.0, 0.9, 0.6),
    'scaled 1.0/0.8/0.5': scaled(1.0, 0.8, 0.5),
    'flat 0.6': flat(0.6)
};
let coverageFor = readyMadeCoverage;
const usePolicy = (name) => { coverageFor = POLICIES[name]; };
const strip = (shape, readyMadeShapes) => withoutReadyMade(shape, readyMadeShapes, { coverageFor });

// ---- Library ---------------------------------------------------------------
const structures = new CreateStructureRegistryUseCase().execute().getAll();
const byId = new Map(structures.map((s) => [s.id, s]));
const libraryShapes = structures.map((s) => ({ id: s.id, shape: buildShape(s.bricks) }));
const shapesWithout = (excludedIds) => libraryShapes.filter((entry) => !excludedIds.has(entry.id)).map((entry) => entry.shape);
const ALL = libraryShapes.map((entry) => entry.shape);

// ---- Seeded randomness -----------------------------------------------------
function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const KINDS = ['core:cube', 'core:block_2x2', 'core:plate_2x4', 'core:beam', 'core:window_small', 'core:door', 'core:slab_4x4', 'core:roof_cone'];
const P = (definitionId, x, y, z) => ({ definitionId, position: { x, y, z } });

function turnMove(bricks, turn, dx, dy, dz) {
    return bricks.map((b) => {
        const { x, y, z } = b.position;
        const [tx, tz] = turn === 90 ? [-z, x] : turn === 180 ? [-x, -z] : turn === 270 ? [z, -x] : [x, z];
        return P(b.definitionId, tx + dx, y + dy, tz + dz);
    });
}

// Changes `rate` of a structure's bricks: a third removed, a third swapped for
// another kind, a third moved one stud. Returns { bricks, kept }: `kept` the
// bricks left as they were.
function modify(r, bricks, rate) {
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
function handBuilt(r, n, origin = { x: 0, z: 0 }) {
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
function inPaletteOf(r, structure, origin = { x: 0, z: 0 }) {
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

const keyOf = (b) => `${b.definitionId}|${b.position.x}|${b.position.y}|${b.position.z}`;
const pct = (v) => `${Math.round(v * 100)}%`;
const report = [];
const log = (line = '') => { report.push(line); };

// ---- E1: how much real remixes change their base ---------------------------
log('## E1. Collection remixes: how much of the base structure survives');
log('');
log('| Remix | Base | Base bricks | Base bricks still in place | Survives |');
log('|---|---|---|---|---|');
const e1 = [];
for (const [child, parent] of Object.entries(COLLECTION_REMIXED_FROM)) {
    const base = buildShape(byId.get(parent).bricks);
    const remix = buildShape(byId.get(child).bricks);
    const shared = compareBuildShapes(remix, base).shared;
    e1.push({ child, parent, survives: shared / base.size });
    log(`| ${child} | ${parent} | ${base.size} | ${shared} | ${pct(shared / base.size)} |`);
}
log('');
// Grandparents too: a remix of a remix still stands on the first base.
for (const [child, parent] of Object.entries(COLLECTION_REMIXED_FROM)) {
    const grand = COLLECTION_REMIXED_FROM[parent];
    if (!grand) continue;
    const base = buildShape(byId.get(grand).bricks);
    const shared = compareBuildShapes(buildShape(byId.get(child).bricks), base).shared;
    log(`- ${child} keeps ${pct(shared / base.size)} of ${grand} (${shared}/${base.size}).`);
}
log('');

// E1b: with the remix chain itself left out of the library (as for a builder
// who made those changes by hand), which bases does each policy take out?
log('### E1b. Each Collection build, its own family left out of the library: bricks taken out');
log('');
log(`| Build | Bricks | ${Object.keys(POLICIES).join(' | ')} |`);
log(`|---|---|${Object.keys(POLICIES).map(() => '---').join('|')}|`);
const familyOf = (id) => { const ids = new Set([id]); for (const [c, p] of Object.entries(COLLECTION_REMIXED_FROM)) if (p === id || c === id) { ids.add(c); } return ids; };
for (const child of Object.keys(COLLECTION_REMIXED_FROM)) {
    const excluded = new Set(Object.keys(COLLECTION_REMIXED_FROM));
    excluded.add(child);
    const shape = buildShape(byId.get(child).bricks);
    const cells = Object.keys(POLICIES).map((name) => { usePolicy(name); const rest = strip(shape, shapesWithout(excluded)); return `${shape.size - rest.size}`; });
    log(`| ${child} | ${shape.size} | ${cells.join(' | ')} |`);
}
log('');

// ---- E2: modified ready-made structures, detection by change rate --------
const RATES = [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.5];
const TRIALS = 6;
log('## E2. A ready-made structure changed by a share of its bricks, beside 40 hand-built bricks');
log('');
log('Detected: at least half of its unchanged bricks taken out. Own lost: hand-built bricks (40, in another structure\'s palette) wrongly taken out (mean per build).');
log('');
const e2 = {};
for (const name of Object.keys(POLICIES)) {
    usePolicy(name);
    e2[name] = {};
    for (const rate of RATES) {
        let detected = 0; let trials = 0; let ownLost = 0; let keptRemoved = 0; let keptTotal = 0;
        const bySize = { small: [0, 0], medium: [0, 0], large: [0, 0] };
        for (const s of structures) {
            const size = buildShape(s.bricks).size;
            if (size < 6) continue;
            const cls = size < 12 ? 'small' : size < 30 ? 'medium' : 'large';
            for (let t = 0; t < TRIALS; t++) {
                const r = rng(1000 * t + size * 7 + Math.round(rate * 100));
                const { bricks: changed, kept } = modify(r, s.bricks, rate);
                const turn = pick(r, [0, 90, 180, 270]);
                const placed = turnMove(changed, turn, 13, 0, -7);
                const keptPlaced = new Set(turnMove(kept, turn, 13, 0, -7).map(keyOf));
                const own = inPaletteOf(r, pick(r, structures.filter((x) => x.bricks.length >= 30)), { x: 60, z: 60 }).slice(0, 40);
                const shape = buildShape([...placed, ...own]);
                const rest = strip(shape, ALL);
                const restKeys = rest.keys;
                const removedKept = [...keptPlaced].filter((k) => !restKeys.has(k)).length;
                const ownKeys = new Set(buildShape(own).keys);
                ownLost += [...ownKeys].filter((k) => !restKeys.has(k)).length;
                keptRemoved += removedKept; keptTotal += keptPlaced.size;
                const hit = keptPlaced.size > 0 && removedKept >= keptPlaced.size / 2;
                detected += hit ? 1 : 0; trials += 1;
                bySize[cls][0] += hit ? 1 : 0; bySize[cls][1] += 1;
            }
        }
        e2[name][rate] = { detected: detected / trials, removedShare: keptRemoved / keptTotal, ownLost: ownLost / trials, bySize };
    }
}
log(`| Change | ${Object.keys(POLICIES).join(' | ')} |`);
log(`|---|${Object.keys(POLICIES).map(() => '---').join('|')}|`);
for (const rate of RATES) {
    log(`| ${pct(rate)} | ${Object.keys(POLICIES).map((n) => `${pct(e2[n][rate].detected)} (own lost ${e2[n][rate].ownLost.toFixed(1)})`).join(' | ')} |`);
}
log('');
log('Detected, by structure size (small 6-11, medium 12-29, large 30+), at 20% and 30% changed:');
log('');
for (const rate of [0.2, 0.3]) {
    log(`- ${pct(rate)}: ${Object.keys(POLICIES).map((n) => { const b = e2[n][rate].bySize; return `${n}: ${['small', 'medium', 'large'].map((c) => pct(b[c][0] / b[c][1])).join('/')}`; }).join('; ')}`);
}
log('');

// ---- E2b: the change made in one region, as real remixes do --------------
function modifyRegion(r, bricks, rate) {
    const seed = pick(r, bricks).position;
    const dist = (b) => Math.hypot(b.position.x - seed.x, b.position.y - seed.y, b.position.z - seed.z);
    const order = [...bricks].sort((a, b) => dist(a) - dist(b));
    const changedCount = Math.round(bricks.length * rate);
    const changed = new Set(order.slice(0, changedCount));
    const out = []; const kept = [];
    for (const b of bricks) {
        if (!changed.has(b)) { out.push(b); kept.push(b); continue; }
        const how = r();
        if (how < 1 / 3) continue;
        if (how < 2 / 3) { out.push(P(pick(r, KINDS.filter((k) => k !== b.definitionId)), b.position.x, b.position.y, b.position.z)); continue; }
        out.push(P(b.definitionId, b.position.x, b.position.y + 1, b.position.z));
    }
    return { bricks: out, kept };
}
log('### E2b. The same, with the change made in one region (the bricks nearest one spot), as real remixes do');
log('');
log(`| Change | ${Object.keys(POLICIES).join(' | ')} |`);
log(`|---|${Object.keys(POLICIES).map(() => '---').join('|')}|`);
for (const rate of [0.1, 0.2, 0.3, 0.4, 0.5]) {
    const cells = Object.keys(POLICIES).map((name) => {
        usePolicy(name);
        let detected = 0; let trials = 0;
        for (const s of structures) {
            if (buildShape(s.bricks).size < 6) continue;
            for (let t = 0; t < 6; t++) {
                const r = rng(31000 + 1000 * t + buildShape(s.bricks).size * 7 + Math.round(rate * 100));
                const { bricks: changed, kept } = modifyRegion(r, s.bricks, rate);
                const turn = pick(r, [0, 90, 180, 270]);
                const keptPlaced = new Set(turnMove(kept, turn, 13, 0, -7).map(keyOf));
                const own = inPaletteOf(r, pick(r, structures.filter((x) => x.bricks.length >= 30)), { x: 60, z: 60 }).slice(0, 40);
                const rest = strip(buildShape([...turnMove(changed, turn, 13, 0, -7), ...own]), ALL);
                const removedKept = [...keptPlaced].filter((k) => !rest.keys.has(k)).length;
                if (keptPlaced.size > 0 && removedKept >= keptPlaced.size / 2) detected += 1;
                trials += 1;
            }
        }
        return pct(detected / trials);
    });
    log(`| ${pct(rate)} | ${cells.join(' | ')} |`);
}
log('');

// ---- E3: hand-made builds, bricks wrongly taken out -----------------------
log('## E3. Builds made by hand: bricks wrongly taken out');
log('');
const serializer = new DocumentSerializer();
const examples = ['harbor-wall-light', 'hay-wain-bridge', 'islet-lighthouse', 'packhorse-arch'].map((name) => {
    const doc = serializer.deserialize(JSON.parse(readFileSync(`${repoRoot}/examples/forkbuild-document-${name}.json`, 'utf8')));
    return { name, shape: buildShape(worldBricks(doc.world)) };
});
log(`| Example build | Bricks | ${Object.keys(POLICIES).join(' | ')} |`);
log(`|---|---|${Object.keys(POLICIES).map(() => '---').join('|')}|`);
for (const { name, shape } of examples) {
    log(`| ${name} | ${shape.size} | ${Object.keys(POLICIES).map((n) => { usePolicy(n); return `${shape.size - strip(shape, ALL).size}`; }).join(' | ')} |`);
}
log('');
const HAND = 300;
log(`Synthetic hand-built builds (${HAND}, 20 to 150 bricks): share of builds that lose any brick, and bricks lost in all:`);
log('');
for (const name of Object.keys(POLICIES)) {
    usePolicy(name);
    let builds = 0; let lost = 0; let total = 0;
    for (let i = 0; i < HAND; i++) {
        const r = rng(50000 + i);
        const shape = buildShape(handBuilt(r, 20 + Math.floor(r() * 130)));
        const removed = shape.size - strip(shape, ALL).size;
        if (removed > 0) builds += 1;
        lost += removed; total += shape.size;
    }
    log(`- ${name}: ${pct(builds / HAND)} of builds lose bricks; ${lost} of ${total} bricks (${(100 * lost / total).toFixed(2)}%).`);
}
log('');

log('Builds by hand in a library structure\'s own palette (same kinds and counts, same footprint, placed by hand), 10 per structure: share of builds that lose any brick, and bricks lost in all:');
log('');
for (const name of Object.keys(POLICIES)) {
    usePolicy(name);
    let builds = 0; let lost = 0; let total = 0; let n = 0;
    const worst = [];
    for (const s of structures) {
        if (buildShape(s.bricks).size < 6) continue;
        for (let i = 0; i < 10; i++) {
            const r = rng(80000 + i * 97 + buildShape(s.bricks).size);
            const shape = buildShape(inPaletteOf(r, s));
            const removed = shape.size - strip(shape, ALL).size;
            n += 1; if (removed > 0) { builds += 1; worst.push(`${s.id}:${removed}/${shape.size}`); }
            lost += removed; total += shape.size;
        }
    }
    log(`- ${name}: ${pct(builds / n)} of ${n} builds lose bricks; ${lost} of ${total} bricks (${(100 * lost / total).toFixed(2)}%)${worst.length ? `; e.g. ${worst.slice(0, 4).join(', ')}` : ''}.`);
}
log('');

// ---- E4: end to end ---------------------------------------------------------
log('## E4. End to end: flagged at the 60% threshold');
log('');
log('False hint: two builds that each changed the same ready-made structure their own way (20% or 30%), plus different hand-built bricks. Real copy: a hand-built build and a copy of it with 10% changed, one of them beside a ready-made structure.');
log('');
const E4_RATES = [0.05, 0.1, 0.15, 0.2, 0.3];
for (const ownCount of [5, 25]) {
    log(`False hints with ${ownCount} hand-built bricks of their own on each side, by how much each changed the shared structure:`);
    log('');
    log(`| Policy | ${E4_RATES.map((r) => `${pct(r)} changed`).join(' | ')} |`);
    log(`|---|${E4_RATES.map(() => '---').join('|')}|`);
    for (const name of Object.keys(POLICIES)) {
        usePolicy(name);
        const cells = E4_RATES.map((rate) => {
            let flagged = 0; let pairs = 0;
            for (const s of structures) {
                if (buildShape(s.bricks).size < 12) continue;
                for (let t = 0; t < 6; t++) {
                    const r = rng(9000 + t * 31 + buildShape(s.bricks).size + Math.round(rate * 1000));
                    const a = buildShape([...turnMove(modify(r, s.bricks, rate).bricks, 0, 0, 0, 0), ...handBuilt(r, ownCount, { x: 80, z: 0 })]);
                    const b = buildShape([...turnMove(modify(r, s.bricks, rate).bricks, 90, 40, 0, 9), ...handBuilt(r, ownCount, { x: -80, z: 0 })]);
                    const ra = strip(a, ALL); const rb = strip(b, ALL);
                    pairs += 1;
                    if (ra.size >= MIN_COMPARED_BRICKS && rb.size >= MIN_COMPARED_BRICKS && compareBuildShapes(ra, rb).similarity >= SIMILAR_BUILD_THRESHOLD) flagged += 1;
                }
            }
            return pct(flagged / pairs);
        });
        log(`| ${name} | ${cells.join(' | ')} |`);
    }
    log('');
}
{
    // Baseline: two independent hand-built builds with no structure at all.
    let flagged = 0; const pairs = 600;
    for (let i = 0; i < pairs; i++) {
        const r = rng(120000 + i);
        const n = 20 + Math.floor(r() * 20);
        const a = buildShape(handBuilt(r, n)); const b = buildShape(handBuilt(r, n));
        if (compareBuildShapes(a, b).similarity >= SIMILAR_BUILD_THRESHOLD) flagged += 1;
    }
    log(`Baseline, no structure at all: ${pct(flagged / pairs)} of ${pairs} pairs of independent small hand-built builds (20 to 39 bricks, the test generator's plain walled boxes) are flagged.`);
    log('');
}
log('Real copies found (a hand-built build of 30 to 120 bricks and a copy with 10% changed, one beside a ready-made structure; and the same in a library structure\'s palette):');
log('');
for (const name of Object.keys(POLICIES)) {
    usePolicy(name);
    let found = 0; let foundPalette = 0; const copies = 120;
    for (let i = 0; i < copies; i++) {
        const r = rng(70000 + i);
        const beside = turnMove(pick(r, structures.filter((s) => s.bricks.length >= 12)).bricks, 0, 200, 0, 200);
        for (const palette of [false, true]) {
            const original = palette ? inPaletteOf(r, pick(r, structures.filter((s) => s.bricks.length >= 30))) : handBuilt(r, 30 + Math.floor(r() * 90));
            const copy = turnMove(modify(r, original, 0.1).bricks, 180, 20, 0, 20);
            const a = strip(buildShape(i % 2 ? [...original, ...beside] : original), ALL);
            const b = strip(buildShape(i % 2 ? copy : [...copy, ...beside]), ALL);
            const hit = a.size >= MIN_COMPARED_BRICKS && b.size >= MIN_COMPARED_BRICKS && compareBuildShapes(a, b).similarity >= SIMILAR_BUILD_THRESHOLD;
            if (hit && palette) foundPalette += 1; else if (hit) found += 1;
        }
    }
    log(`- ${name}: ${pct(found / copies)} of hand-built copies, ${pct(foundPalette / copies)} of copies built in a library palette.`);
}
log('');
const text = `# Ready-made structure detection\n\n${report.join('\n')}\n`;
if (outPath) {
    writeFileSync(outPath, text);
    console.log(`Written to ${outPath}`);
} else {
    process.stdout.write(text);
}
