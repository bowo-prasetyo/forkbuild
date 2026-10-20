import {
    FIRST_STEPS, LAUNCH_TARGETS, evaluateFirstSteps, NETWORK_GATE_TARGETS, TARGET_STATUS, evaluateLaunchTargets, medianBrickRange, medianPlacedRange, parseCounts
} from '../core/app/LaunchTargets.js';
import { FunnelEvent } from '../core/app/VisitorCount.js';
import { formatScorecard } from '../scripts/launch-scorecard.mjs';
import { assert } from './support/Assert.js';

// The pillars' number targets (core/app/LaunchTargets.js; docs/Pillars.md,
// "Measuring it"), read from a week of the visitor counter's totals.

const byId = (results) => Object.fromEntries(results.map((result) => [result.id, result]));

// Every target reads paths the app actually counts, and has a goal and a minimum.
{
    const paths = new Set(Object.values(FunnelEvent).map((event) => `/e/${event}`));
    for (const target of LAUNCH_TARGETS) {
        for (const key of [...(target.numerator || []), ...(target.denominator || [])]) {
            assert(paths.has(key), `${target.id} reads ${key}, a path the app counts`);
        }
        assert(target.target > 0 && target.minimum > 0, `${target.id} has a goal and a minimum`);
        assert(['building', 'family', 'world'].includes(target.pillar), `${target.id} answers for a pillar`);
    }
    assert(NETWORK_GATE_TARGETS.every((id) => LAUNCH_TARGETS.some((target) => target.id === id && target.pillar === 'building')),
        'the gate on new networks is the building targets');
    console.log('✓ every target reads counted paths and answers for a pillar');
}

// The first steps, in a newcomer's order, read against the daily visits.
{
    const paths = new Set(Object.values(FunnelEvent).map((event) => `/e/${event}`));
    assert(FIRST_STEPS.every((step) => step.paths.every((key) => paths.has(key))), 'every first step reads paths the app counts');
    const steps = evaluateFirstSteps({ '/': 40, '/e/editor-open': 20, '/e/starter-open': 12, '/e/editor-edit': 8, '/e/publish-bricks-1': 2, '/e/publish-bricks-50': 1 });
    assert(steps.map((step) => step.id).join() === 'editor,ready-made,edit,publish', 'in the order a newcomer takes them');
    assert(steps.map((step) => step.count).join() === '20,12,8,3' && steps[0].share === 0.5 && steps[3].share === 3 / 40,
        `each step's total and share of the daily visits, publishing the builds published (${JSON.stringify(steps)})`);
    assert(evaluateFirstSteps({ '/e/editor-open': 3 })[0].share === null, 'no daily visits, no share');
    console.log('✓ the first steps are read in order against the daily visits');
}

// The median build's range: the middle build in size order.
{
    assert(medianBrickRange({}).median === null, 'no builds, no median');
    assert(medianBrickRange({ '/e/publish-bricks-1': 3, '/e/publish-bricks-10': 2 }).median === 1, '3 small and 2 bigger: the middle one is small');
    assert(medianBrickRange({ '/e/publish-bricks-1': 2, '/e/publish-bricks-10': 3 }).median === 10, '2 small and 3 bigger: the middle one is bigger');
    assert(medianBrickRange({ '/e/publish-bricks-0': 1, '/e/publish-bricks-200': 1 }).median === 0, 'an even count takes the lower middle');
    assert(medianBrickRange({ '/e/publish-bricks-50': 4, '/e/publish-bricks-1': -3, '/e/other': 99 }).builds === 4, 'nonsense totals count as nothing');
    console.log('✓ the median build is the middle one in size order');
}

// Met, missed, or too few to say; and the gate follows the building targets.
{
    const builds = {
        '/e/publish-bricks-1': 30, '/e/publish-bricks-10': 25, '/e/publish-bricks-50': 10,
        '/e/publish-placed-1': 30, '/e/publish-placed-10': 25, '/e/publish-placed-50': 10
    };
    const good = evaluateLaunchTargets({ ...builds, '/e/second-build': 15 });
    assert(byId(good.results)['median-build'].status === TARGET_STATUS.MET && byId(good.results)['median-build'].value === 10, 'a median of 10+ bricks is met');
    assert(byId(good.results)['median-placed'].status === TARGET_STATUS.MET && byId(good.results)['median-placed'].value === 10, 'and of 10+ placed bricks');
    assert(byId(good.results)['second-build'].status === TARGET_STATUS.MET, '15 second builds in 65 (23%) meets 20%');
    assert(good.gate === 'open', 'both building targets met: the gate is open');

    const few = evaluateLaunchTargets({ ...builds, '/e/second-build': 5 });
    assert(byId(few.results)['second-build'].status === TARGET_STATUS.MISSED && few.gate === 'closed', '5 in 65 misses, and the gate is closed');

    const small = evaluateLaunchTargets({ '/e/publish-bricks-1': 10, '/e/second-build': 9 });
    assert(byId(small.results)['second-build'].status === TARGET_STATUS.TOO_FEW && small.gate === 'unknown', 'ten builds are too few to say');
    assert(byId(small.results)['plaza-visits'].value === null && byId(small.results)['plaza-visits'].status === TARGET_STATUS.TOO_FEW,
        'nothing counted at all is too few, with no value');
    // Ready-made builds published untouched: plenty of bricks, none placed.
    const readyMade = evaluateLaunchTargets({
        '/e/publish-bricks-10': 65, '/e/publish-placed-0': 50, '/e/publish-placed-1': 15, '/e/second-build': 15
    });
    assert(byId(readyMade.results)['median-build'].status === TARGET_STATUS.MET, 'their bricks meet the old measure');
    assert(byId(readyMade.results)['median-placed'].status === TARGET_STATUS.MISSED && readyMade.gate === 'closed',
        'but nothing placed misses the gate\'s, and it stays closed');
    assert(medianPlacedRange({ '/e/publish-placed-0': 2, '/e/publish-placed-50': 1 }).median === 0, 'the placed median reads the placed ranges');
    assert(NETWORK_GATE_TARGETS.includes('median-placed') && !NETWORK_GATE_TARGETS.includes('median-build'), 'the gate counts placed bricks');
    console.log('✓ each target is met, missed or too few to say, and the gate follows the building ones');
}

// Counts come as JSON, as GoatCounter's CSV export, or as plain lines.
{
    const json = parseCounts('{"/e/share-link": 4, "/e/opened-shared-link": "6", "/": 900, "/about": 3}');
    assert(json['/e/share-link'] === 4 && json['/e/opened-shared-link'] === 6 && !('/about' in json), 'JSON keeps the funnel paths');
    // The daily visit count too: the side systems are read against it.
    assert(json['/'] === 900, 'and the daily visit count');
    const csv = parseCounts([
        '2,Path,Title,Event,UserAgent,Browser,System,Session,Bot,Referrer,Referrer scheme,Screen size,Location,FirstVisit,Date',
        '2,/e/walk-link,,true,"Mozilla/5.0 (X11, Linux)",Chrome,Linux,1,0,,,,,0,2026-10-12',
        '2,/e/walk-link,,true,ua,Chrome,Linux,2,0,,,,,0,2026-10-12',
        '2,"/e/walk-joined",,true,ua,Chrome,Linux,3,0,,,,,0,2026-10-13'
    ].join('\n'));
    assert(csv['/e/walk-link'] === 2 && csv['/e/walk-joined'] === 1, `an export is counted a row per hit (got ${JSON.stringify(csv)})`);
    const plain = parseCounts('/e/challenge-join 12\n/e/plaza-visit,5\n\n');
    assert(plain['/e/challenge-join'] === 12 && plain['/e/plaza-visit'] === 5, 'plain lines, with a space or a comma');
    assert(Object.keys(parseCounts('')).length === 0, 'nothing given, nothing counted');
    console.log('✓ counts are read from JSON, a GoatCounter export or plain lines');
}

// The scorecard names each target and says where the gate stands.
{
    const text = formatScorecard({ '/e/publish-bricks-1': 60, '/e/publish-placed-1': 60, '/e/second-build': 3 });
    assert(text.includes('BUILDING') && text.includes('FAMILY') && text.includes('WORLD'), 'grouped by pillar');
    assert(/✗ below\s+median-placed/.test(text) && /✗ below\s+second-build/.test(text), 'a missed target says so');
    const gateAt = text.indexOf('New networks: CLOSED: a building target is below where it should be.');
    assert(text.startsWith('FIRST STEPS (out of 0 daily visits)') && /publish\s+60\s+—/.test(text), 'it starts with the first steps');
    assert(gateAt > 0 && text.indexOf('SIDE SYSTEMS') > gateAt, 'and ends with the gate, then the side systems it watches (tests/SideSystems.test.js)');
    console.log('✓ the scorecard groups targets by pillar and ends with the gate, then the side systems');
}
