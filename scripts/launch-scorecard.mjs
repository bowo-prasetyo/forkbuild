// Prints how a week's visitor counts stand against the pillars' targets
// (core/app/LaunchTargets.js; docs/Pillars.md, "Measuring it"), and whether the
// gate on new networks is open.
//
//   node scripts/launch-scorecard.mjs counts.json
//   node scripts/launch-scorecard.mjs goatcounter-export.csv
//   node scripts/launch-scorecard.mjs < counts.txt
//
// The counts are one week's totals from https://forkbuild.goatcounter.com/:
// a JSON object of { "/e/<event>": total }, GoatCounter's CSV export (one row
// per hit), or lines of "/e/<event> total". Exits 0 whatever the numbers say.
import { readFileSync } from 'node:fs';
import { evaluateFirstSteps, evaluateLaunchTargets, evaluateSideSystems, parseCounts, SIDE_SYSTEM_STATUS, TARGET_STATUS } from '../core/app/LaunchTargets.js';

const SIDE_MARK = { [SIDE_SYSTEM_STATUS.USED]: '✓ used', [SIDE_SYSTEM_STATUS.RARELY_USED]: '! rarely used', [SIDE_SYSTEM_STATUS.TOO_FEW]: '… too few' };
const MARK = { [TARGET_STATUS.MET]: '✓ met', [TARGET_STATUS.MISSED]: '✗ below', [TARGET_STATUS.TOO_FEW]: '… too few' };
const GATE = {
    open: 'OPEN: both building targets are met.',
    closed: 'CLOSED: a building target is below where it should be.',
    unknown: 'NOT YET KNOWN: too few builds were counted to say.'
};

function show(result) {
    if (result.value === null) return '—';
    return result.kind === 'median-range' ? `${result.value}+ bricks` : `${Math.round(result.value * 100)}%`;
}

function goal(result) {
    return result.kind === 'median-range' ? `${result.target}+ bricks` : `${Math.round(result.target * 100)}%`;
}

export function formatScorecard(counts) {
    const { results, gate } = evaluateLaunchTargets(counts);
    // Where newcomers stop between arriving and publishing (FIRST_STEPS).
    const steps = evaluateFirstSteps(counts);
    const lines = [`FIRST STEPS (out of ${steps[0].visits} daily visits)`];
    for (const step of steps) {
        const share = step.share === null ? '—' : `${(step.share * 100).toFixed(1)}%`;
        lines.push(`  ${step.id.padEnd(11)} ${String(step.count).padStart(6)} ${share.padStart(7)}  ${step.question}`);
    }
    let pillar = null;
    for (const result of results) {
        if (result.pillar !== pillar) {
            pillar = result.pillar;
            lines.push('', pillar.toUpperCase());
        }
        lines.push(`  ${MARK[result.status].padEnd(10)} ${result.id.padEnd(18)} ${show(result).padStart(11)}  (target ${goal(result)}, from ${result.sample}; needs ${result.minimum})`);
        lines.push(`             ${result.question}`);
    }
    lines.push('', `New networks: ${GATE[gate]}`);
    // The side systems the owner kept (docs/Pillars.md, "The side systems"):
    // watched, not aimed at; one rarely used is for the owner to look at again.
    lines.push('', 'SIDE SYSTEMS (kept; looked at again when rarely used)');
    for (const result of evaluateSideSystems(counts)) {
        const share = result.value === null ? '—' : `${(result.value * 100).toFixed(1)}%`;
        lines.push(`  ${SIDE_MARK[result.status].padEnd(13)} ${result.id.padEnd(11)} ${share.padStart(7)} of ${result.sample} visits  (looked at again below ${(result.reevaluateBelow * 100).toFixed(0)}%; needs ${result.minimum})`);
        lines.push(`                ${result.question}`);
    }
    return lines.join('\n').trimStart();
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
    const file = process.argv[2];
    const text = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');
    console.log(formatScorecard(parseCounts(text)));
}
