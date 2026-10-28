// Measures when core/catalog/BuildSimilarity.js#isSimilarBuild() points out two
// builds as looking alike, under the bars it ships with and some others to
// weigh them against: how often builds made independently are pointed out (a
// false hint, which the 🔔 sends to a real person), and how often copies are.
// Run it before changing SIMILAR_BUILD_THRESHOLD, CONTAINED_BUILD_THRESHOLD or
// MIN_SHARED_KINDS, and put its numbers in the pull request.
//
//   node scripts/evaluate-look-alikes.mjs              print the report
//   node scripts/evaluate-look-alikes.mjs --out r.md   write it to r.md
//
// Builds are made up with seeded randomness (scripts/lookAlikeBuilds.mjs), so
// the report is the same on every run. Ready-made structures are not taken
// out here: scripts/evaluate-ready-made-detection.mjs measures that step.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CreateStructureRegistryUseCase } from '../application/editor/CreateStructureRegistryUseCase.js';
import { worldBricks } from '../core/building/PlacedBricks.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import {
    CONTAINED_BUILD_THRESHOLD, MIN_COMPARED_BRICKS, MIN_SHARED_KINDS, SIMILAR_BUILD_THRESHOLD, buildShape, compareBuildShapes, isSimilarBuild
} from '../core/catalog/BuildSimilarity.js';
import { P, handBuilt, inPaletteOf, modify, pick, rng, turnMove } from './lookAlikeBuilds.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outIndex = process.argv.indexOf('--out');
const outPath = outIndex >= 0 ? process.argv[outIndex + 1] : null;
if (outIndex >= 0 && !outPath) {
    console.error('Usage: node scripts/evaluate-look-alikes.mjs [--out report.md]');
    process.exit(2);
}

// ---- Policies ----------------------------------------------------------------
// Each says whether two buildShape()s are pointed out.
const before = (a, b) => a.size >= MIN_COMPARED_BRICKS && b.size >= MIN_COMPARED_BRICKS
    && compareBuildShapes(a, b, { mirror: false }).similarity >= SIMILAR_BUILD_THRESHOLD;
const policy = (bars) => (a, b) => isSimilarBuild(compareBuildShapes(a, b), bars);
const POLICIES = {
    'before (60% the same, turns only)': before,
    shipped: policy({}),
    'no kinds bar': policy({ minKinds: 0 }),
    '3 kinds': policy({ minKinds: 3 }),
    '5 kinds': policy({ minKinds: 5 }),
    'contained 75%': policy({ containedThreshold: 0.75 }),
    'contained 95%': policy({ containedThreshold: 0.95 }),
    'no containment': policy({ containedThreshold: 2 })
};

// ---- Builds ------------------------------------------------------------------
const structures = new CreateStructureRegistryUseCase().execute().getAll();
const serializer = new DocumentSerializer();
const examples = ['harbor-wall-light', 'hay-wain-bridge', 'islet-lighthouse', 'packhorse-arch'].map((name) => {
    const doc = serializer.deserialize(JSON.parse(readFileSync(`${repoRoot}/examples/forkbuild-document-${name}.json`, 'utf8')));
    return worldBricks(doc.world).map((b) => P(b.definitionId, b.position.x, b.position.y, b.position.z));
});
const between = (r, low, high) => low + Math.floor(r() * (high - low + 1));

// Walls of one kind round a w × d floor, h high.
function plainBox(w, d, h, kind = 'core:cube') {
    const bricks = [];
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) {
        if (x === 0 || z === 0 || x === w - 1 || z === d - 1) bricks.push(P(kind, x, y + 0.5, z));
    }
    return bricks;
}

// A wall, a floor or a solid block of one kind.
function plainBlock(r) {
    const kind = pick(r, ['core:cube', 'core:block_2x2', 'core:log']);
    const [w, d, h] = pick(r, [[between(r, 10, 40), 1, between(r, 3, 10)], [between(r, 6, 20), between(r, 6, 20), 1], [between(r, 4, 8), between(r, 4, 8), between(r, 3, 8)]]);
    const bricks = [];
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) for (let y = 0; y < h; y++) bricks.push(P(kind, x, y + 0.5, z));
    return bricks;
}

// A challenge week's tiny home: walls of one kind round a small floor, a door
// somewhere in the front, a few windows anywhere in the walls, and a flat
// roof. Small and alike on purpose: the hardest case for telling chance from
// copying.
function tinyHome(r) {
    const w = between(r, 6, 8);
    const d = between(r, 5, 7);
    const h = between(r, 3, 4);
    const wall = pick(r, ['core:cube', 'core:cube', 'core:log']);
    const bricks = plainBox(w, d, h, wall);
    const replace = (x, y, z, kind) => {
        const at = bricks.findIndex((b) => b.position.x === x && b.position.y === y && b.position.z === z);
        if (at >= 0) bricks[at] = P(kind, x, y, z);
    };
    replace(between(r, 1, w - 2), 0.5, 0, 'core:door');
    for (let i = between(r, 1, 4); i > 0; i--) {
        const side = between(r, 0, 3);
        const y = 1.5;
        if (side === 0) replace(between(r, 1, w - 2), y, 0, 'core:window_small');
        else if (side === 1) replace(between(r, 1, w - 2), y, d - 1, 'core:window_small');
        else if (side === 2) replace(0, y, between(r, 1, d - 2), 'core:window_small');
        else replace(w - 1, y, between(r, 1, d - 2), 'core:window_small');
    }
    for (let x = 0; x < w; x++) for (let z = 0; z < d; z++) bricks.push(P('core:plate_2x2', x, h + 0.5, z));
    return bricks;
}

const mirror = (bricks) => bricks.map((b) => P(b.definitionId, -b.position.x, b.position.y, b.position.z));
const shift = (bricks, dx, dz) => bricks.map((b) => P(b.definitionId, b.position.x + dx, b.position.y, b.position.z + dz));

// The share `rate` of `bricks` nearest one of them: a part of a build.
function part(r, bricks, rate) {
    const seed = pick(r, bricks).position;
    const distance = (b) => Math.hypot(b.position.x - seed.x, b.position.y - seed.y, b.position.z - seed.z);
    return [...bricks].sort((a, b) => distance(a) - distance(b)).slice(0, Math.round(bricks.length * rate));
}

// Bricks of the copier's own, `share` as many as `bricks`, beside them.
function ownBeside(r, bricks, share) {
    return handBuilt(r, Math.max(1, Math.round(bricks.length * share)), { x: 300, z: 300 });
}

// An original worth copying: an example build, a build by hand, a build in a
// library structure's palette, or a tiny home.
function original(r, i) {
    switch (i % 4) {
        case 0: return examples[Math.floor(i / 4) % examples.length];
        case 1: return handBuilt(r, between(r, 40, 150));
        case 2: return inPaletteOf(r, pick(r, structures.filter((s) => s.bricks.length >= 30)));
        default: return tinyHome(r);
    }
}

// ---- Cases -------------------------------------------------------------------
const PAIRS = 160;
const independent = {
    'Plain walled boxes, one kind (same floor half the time)': (r) => {
        const [w, d] = [between(r, 6, 12), between(r, 6, 12)];
        const other = r() < 0.5 ? [w, d] : [between(r, 6, 12), between(r, 6, 12)];
        return [plainBox(w, d, between(r, 2, 6)), plainBox(...other, between(r, 2, 6))];
    },
    'Walls, floors and blocks of one kind': (r) => [plainBlock(r), plainBlock(r)],
    'Tiny homes for the same challenge': (r) => [tinyHome(r), tinyHome(r)],
    'A tiny home and a village of four other tiny homes': (r) => [tinyHome(r), [0, 1, 2, 3].flatMap((i) => shift(tinyHome(r), i * 20, 0))],
    'Builds by hand (20 to 150 bricks)': (r) => { const n = between(r, 20, 150); return [handBuilt(r, n), handBuilt(r, n)]; },
    'Builds by hand in the same library structure\'s palette': (r) => { const s = pick(r, structures.filter((x) => x.bricks.length >= 20)); return [inPaletteOf(r, s), inPaletteOf(r, s)]; }
};
const copies = {
    'Exact copy, turned and moved': (r, o) => turnMove(o, pick(r, [0, 90, 180, 270]), 17, 0, -9),
    'Copy with 10% changed': (r, o) => turnMove(modify(r, o, 0.1).bricks, 90, 5, 0, 5),
    'Copy with 20% changed': (r, o) => turnMove(modify(r, o, 0.2).bricks, 180, 5, 0, 5),
    'Copy with 70% more bricks of their own': (r, o) => [...turnMove(o, 270, 9, 0, 9), ...ownBeside(r, o, 0.7)],
    'Copy with 150% more bricks of their own': (r, o) => [...turnMove(o, 0, 9, 0, 9), ...ownBeside(r, o, 1.5)],
    'Mirrored copy': (r, o) => turnMove(mirror(o), pick(r, [0, 90, 180, 270]), 4, 0, 4),
    'Mirrored copy with 10% changed': (r, o) => turnMove(mirror(modify(r, o, 0.1).bricks), 90, 4, 0, 4),
    'A part (70%) of it with 20% more of their own': (r, o) => { const p = part(r, o, 0.7); return [...turnMove(p, 90, 3, 0, 3), ...ownBeside(r, p, 0.2)]; }
};

const pct = (v) => `${Math.round(v * 100)}%`;
const names = Object.keys(POLICIES);
const report = [];
const log = (line = '') => report.push(line);
const table = (rows) => {
    log(`| Case | ${names.join(' | ')} |`);
    log(`|---|${names.map(() => '---').join('|')}|`);
    for (const [label, cells] of rows) log(`| ${label} | ${cells.join(' | ')} |`);
    log('');
};

log(`Shipped: pointed out at ${pct(SIMILAR_BUILD_THRESHOLD)} the same, or ${pct(CONTAINED_BUILD_THRESHOLD)} of the smaller standing in the larger, with ${MIN_COMPARED_BRICKS}+ shared bricks of ${MIN_SHARED_KINDS}+ kinds, mirrored or not. ${PAIRS} pairs a case.`);
log('');
log('## Builds made independently: pointed out (lower is better)');
log('');
table(Object.entries(independent).map(([label, make], c) => {
    const pairs = Array.from({ length: PAIRS }, (_, i) => make(rng(1000 * (c + 1) + i)).map(buildShape));
    return [label, names.map((name) => pct(pairs.filter(([a, b]) => POLICIES[name](a, b)).length / PAIRS))];
}));

log('## Copies: pointed out (higher is better)');
log('');
log('Originals, in turn: the four example builds, builds by hand (40 to 150 bricks), builds in a library structure\'s palette, and tiny homes.');
log('');
table(Object.entries(copies).map(([label, copy], c) => {
    const pairs = Array.from({ length: PAIRS }, (_, i) => {
        const r = rng(500000 + 1000 * c + i);
        const o = original(r, i);
        return [buildShape(o), buildShape(copy(r, o))];
    });
    return [label, names.map((name) => pct(pairs.filter(([a, b]) => POLICIES[name](a, b)).length / PAIRS))];
}));
{
    const pairs = Array.from({ length: PAIRS }, (_, i) => {
        const r = rng(900000 + i);
        const o = i % 2 ? plainBox(between(r, 6, 12), between(r, 6, 12), between(r, 2, 6)) : plainBlock(r);
        return [buildShape(o), buildShape(turnMove(o, 90, 3, 0, 3))];
    });
    log('Exact copies of plain builds (walls, floors, blocks and walled boxes of one kind), which can\'t be told from chance:');
    log('');
    table([['Exact copy of a plain build', names.map((name) => pct(pairs.filter(([a, b]) => POLICIES[name](a, b)).length / PAIRS))]]);
}

const text = `# Look-alike hints\n\n${report.join('\n')}`;
if (outPath) {
    writeFileSync(outPath, text);
    console.log(`Written to ${outPath}`);
} else {
    process.stdout.write(text);
}
