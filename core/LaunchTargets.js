// The numbers each pillar aims for (docs/Pillars.md, "Measuring it"), read
// from the visitor counter's totals (core/VisitorCount.js, FunnelEvent): a
// target is met, missed, or not yet known while too few have been counted to
// say. The gate on new networks (docs/Pillars.md, "Networks: readers and
// writers") opens only when the building targets are both met.
//
// Pure: `counts` is { '/e/<event>': total } for one stretch of time (a week,
// as docs/launch/README.md reads them), and the same counts always give the
// same answer. scripts/launch-scorecard.mjs prints it.
import { FunnelEvent } from './VisitorCount.js';

const path = (event) => `/e/${event}`;

// The brick ranges, smallest first, with the lowest count each starts at.
export const BRICK_RANGES = Object.freeze([
    Object.freeze({ lowest: 0, path: path(FunnelEvent.PUBLISH_BRICKS_0) }),
    Object.freeze({ lowest: 1, path: path(FunnelEvent.PUBLISH_BRICKS_1) }),
    Object.freeze({ lowest: 10, path: path(FunnelEvent.PUBLISH_BRICKS_10) }),
    Object.freeze({ lowest: 50, path: path(FunnelEvent.PUBLISH_BRICKS_50) }),
    Object.freeze({ lowest: 200, path: path(FunnelEvent.PUBLISH_BRICKS_200) })
]);

// The same ranges for the bricks a build's builder placed or changed, its
// ready-made bricks left out (core/PlacedBricks.js).
export const PLACED_RANGES = Object.freeze([
    Object.freeze({ lowest: 0, path: path(FunnelEvent.PUBLISH_PLACED_0) }),
    Object.freeze({ lowest: 1, path: path(FunnelEvent.PUBLISH_PLACED_1) }),
    Object.freeze({ lowest: 10, path: path(FunnelEvent.PUBLISH_PLACED_10) }),
    Object.freeze({ lowest: 50, path: path(FunnelEvent.PUBLISH_PLACED_50) }),
    Object.freeze({ lowest: 200, path: path(FunnelEvent.PUBLISH_PLACED_200) })
]);

export const TARGET_STATUS = Object.freeze({
    MET: 'met',
    MISSED: 'missed',
    TOO_FEW: 'too-few'
});

// Each target: which pillar it answers for, what it measures (a ratio of two
// totals, or the median build's brick range), the value to reach, and the
// fewest the denominator must hold before the answer means anything.
export const LAUNCH_TARGETS = Object.freeze([
    Object.freeze({
        id: 'median-placed',
        pillar: 'building',
        question: 'Does the median published build hold 10 bricks its builder placed, not only ready-made ones?',
        kind: 'median-range',
        ranges: 'placed',
        target: 10,
        minimum: 50
    }),
    Object.freeze({
        id: 'median-build',
        pillar: 'building',
        question: 'Is the median published build a real build, not a first try (ready-made bricks included)?',
        kind: 'median-range',
        ranges: 'bricks',
        target: 10,
        minimum: 50
    }),
    Object.freeze({
        id: 'second-build',
        pillar: 'building',
        question: 'Do builders come back and publish a second build?',
        kind: 'ratio',
        numerator: [path(FunnelEvent.SECOND_BUILD)],
        denominator: BRICK_RANGES.map((range) => range.path),
        target: 0.2,
        minimum: 50
    }),
    Object.freeze({
        id: 'opened-per-link',
        pillar: 'family',
        question: 'Is each shared link opened by someone, on average?',
        kind: 'ratio',
        numerator: [path(FunnelEvent.OPENED_SHARED_LINK)],
        denominator: [path(FunnelEvent.SHARE_LINK)],
        target: 1,
        minimum: 20
    }),
    Object.freeze({
        id: 'copied-from-link',
        pillar: 'family',
        question: 'Do people who open a link make their own copy?',
        kind: 'ratio',
        numerator: [path(FunnelEvent.REMIX_FROM_LINK)],
        denominator: [path(FunnelEvent.OPENED_SHARED_LINK)],
        target: 0.1,
        minimum: 50
    }),
    Object.freeze({
        id: 'remixes-published',
        pillar: 'family',
        question: 'Are published builds remixes of someone else\'s?',
        kind: 'ratio',
        numerator: [path(FunnelEvent.REMIX_PUBLISHED)],
        denominator: BRICK_RANGES.map((range) => range.path),
        target: 0.15,
        minimum: 50
    }),
    Object.freeze({
        id: 'walk-joined',
        pillar: 'world',
        question: 'Does a "Walk here with me" link bring a friend?',
        kind: 'ratio',
        numerator: [path(FunnelEvent.WALK_JOINED)],
        denominator: [path(FunnelEvent.WALK_LINK)],
        target: 0.5,
        minimum: 20
    }),
    Object.freeze({
        id: 'build-joined',
        pillar: 'world',
        question: 'Does a "Build with me" link bring a friend to build?',
        kind: 'ratio',
        numerator: [path(FunnelEvent.BUILD_JOINED)],
        denominator: [path(FunnelEvent.BUILD_LINK)],
        target: 0.5,
        minimum: 20
    }),
    Object.freeze({
        id: 'published-together',
        pillar: 'world',
        question: 'Do builds made together get published, crediting everyone?',
        kind: 'ratio',
        numerator: [path(FunnelEvent.PUBLISH_TOGETHER)],
        denominator: [path(FunnelEvent.BUILD_JOINED)],
        target: 0.3,
        minimum: 20
    }),
    Object.freeze({
        id: 'plaza-visits',
        pillar: 'world',
        question: 'Do challenge entrants walk the plaza to see each other\'s builds?',
        kind: 'ratio',
        numerator: [path(FunnelEvent.PLAZA_VISIT)],
        denominator: [path(FunnelEvent.CHALLENGE_JOIN)],
        target: 0.25,
        minimum: 20
    })
]);

// The targets that must all be met before a new network or chain joins: the
// bricks builders placed themselves, so a ready-made build published
// untouched never opens it.
export const NETWORK_GATE_TARGETS = Object.freeze(['median-placed', 'second-build']);

function total(counts, paths) {
    return paths.reduce((sum, key) => {
        const value = Number(counts && counts[key]);
        return sum + (Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
    }, 0);
}

// The lowest brick count of the range holding the median published build,
// and how many builds were published; the median is null with none.
export function medianBrickRange(counts) {
    return medianRange(counts, BRICK_RANGES);
}

// The same, for the bricks builders placed themselves.
export function medianPlacedRange(counts) {
    return medianRange(counts, PLACED_RANGES);
}

function medianRange(counts, ranges) {
    const totals = ranges.map((range) => total(counts, [range.path]));
    const builds = totals.reduce((sum, value) => sum + value, 0);
    if (builds === 0) return { median: null, builds };
    // The middle build in size order (the lower middle for an even count).
    const middle = Math.ceil(builds / 2);
    let seen = 0;
    for (let index = 0; index < ranges.length; index += 1) {
        seen += totals[index];
        if (seen >= middle) return { median: ranges[index].lowest, builds };
    }
    return { median: ranges[ranges.length - 1].lowest, builds };
}

// One target against `counts`: { id, pillar, question, value, target,
// sample, minimum, status }. `value` is the ratio, or the median range's
// lowest brick count; `sample` is the denominator (builds, links, joins).
export function evaluateTarget(target, counts) {
    let value;
    let sample;
    if (target.kind === 'median-range') {
        const { median, builds } = target.ranges === 'placed' ? medianPlacedRange(counts) : medianBrickRange(counts);
        value = median;
        sample = builds;
    } else {
        sample = total(counts, target.denominator);
        value = sample > 0 ? total(counts, target.numerator) / sample : null;
    }
    const status = sample < target.minimum || value === null
        ? TARGET_STATUS.TOO_FEW
        : (value >= target.target ? TARGET_STATUS.MET : TARGET_STATUS.MISSED);
    return Object.freeze({
        id: target.id,
        pillar: target.pillar,
        question: target.question,
        kind: target.kind,
        value,
        target: target.target,
        sample,
        minimum: target.minimum,
        status
    });
}

// Every target, and the gate: { results, gate } where gate is 'open' (every
// gate target met), 'closed' (one missed) or 'unknown' (one not yet known).
export function evaluateLaunchTargets(counts) {
    const results = LAUNCH_TARGETS.map((target) => evaluateTarget(target, counts));
    const gating = results.filter((result) => NETWORK_GATE_TARGETS.includes(result.id));
    const gate = gating.some((result) => result.status === TARGET_STATUS.MISSED)
        ? 'closed'
        : (gating.every((result) => result.status === TARGET_STATUS.MET) ? 'open' : 'unknown');
    return { results, gate };
}

// Counts from the forms a person is likely to have: a JSON object of
// { path: total }; GoatCounter's CSV export, one row per hit with a "Path"
// column (counted per path); or plain lines of "path total" or "path,total".
// Only funnel paths (/e/...) are kept.
export function parseCounts(text) {
    const source = String(text || '').trim();
    const counts = {};
    const add = (key, amount) => {
        const name = String(key || '').trim().replace(/^"|"$/g, '');
        if (!name.startsWith('/e/') || !Number.isFinite(amount) || amount < 0) return;
        counts[name] = (counts[name] || 0) + amount;
    };
    if (!source) return counts;
    if (source.startsWith('{')) {
        const parsed = JSON.parse(source);
        for (const [key, value] of Object.entries(parsed)) add(key, Number(value));
        return counts;
    }
    const lines = source.split(/\r?\n/).filter((line) => line.trim());
    const header = lines[0].split(',').map((cell) => cell.trim().replace(/^"|"$/g, '').toLowerCase());
    const pathColumn = header.indexOf('path');
    if (pathColumn >= 0) {
        for (const line of lines.slice(1)) add(splitCsv(line)[pathColumn], 1);
        return counts;
    }
    for (const line of lines) {
        const [key, value] = line.trim().split(/[\s,]+/);
        add(key, Number(value));
    }
    return counts;
}

// One CSV line's cells, honouring quotes.
function splitCsv(line) {
    const cells = [];
    let cell = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const char = line[index];
        if (char === '"') {
            if (quoted && line[index + 1] === '"') {
                cell += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (char === ',' && !quoted) {
            cells.push(cell);
            cell = '';
        } else {
            cell += char;
        }
    }
    cells.push(cell);
    return cells;
}
