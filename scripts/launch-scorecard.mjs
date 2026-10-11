// Prints how a week's visitor counts stand against the pillars' targets
// (core/LaunchTargets.js; docs/Pillars.md, "Measuring it"), and whether the
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
import { evaluateLaunchTargets, parseCounts, TARGET_STATUS } from '../core/LaunchTargets.js';

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
    const lines = [];
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
    return lines.join('\n').trimStart();
}

const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
    const file = process.argv[2];
    const text = file ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8');
    console.log(formatScorecard(parseCounts(text)));
}
