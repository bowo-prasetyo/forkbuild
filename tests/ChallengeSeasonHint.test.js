import { challengeAt, challengeById } from '../core/challenge/BuildChallenge.js';
import { challengeSeasonHint } from '../ui/components/challenge/challengeText.js';
import { t } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';

// The challenge page's line for a theme that belongs to a season
// (ui/components/challenge/challengeText.js): while its week runs, the world
// is in that season for everyone (core/nature/Season.js holds it), so the
// line says so; before or after the week, it suggests keeping World View in
// the season. A theme with no season has no line.
{
    const winter = challengeById('2026-11-16');
    assert(winter.season === 'WINTER', 'the winter cabin\'s week');
    const during = Date.parse('2026-11-18T12:00:00Z');
    assert(challengeSeasonHint(winter, during) === t('challenge.seasonNow.winter'), 'during its week: the world is in winter for everyone');
    assert(/this week the world is in winter for everyone/.test(challengeSeasonHint(winter, during)), 'in those words');
    assert(challengeSeasonHint(winter, Date.parse('2026-11-30T12:00:00Z')) === t('challenge.seasonHint.winter'), 'after it: choose Winter under Season');
    assert(challengeSeasonHint(winter, Date.parse('2026-11-10T12:00:00Z')) === t('challenge.seasonHint.winter'), 'and before it');
    const plain = challengeAt(Date.parse('2026-11-25T12:00:00Z'));
    assert(plain.season === null && challengeSeasonHint(plain, Date.parse('2026-11-25T12:00:00Z')) === '', 'a theme with no season has no line');
    assert(challengeSeasonHint(null) === '', 'nor does no challenge');
    console.log('✓ a seasonal week says the world is in its season; other weeks suggest keeping it');
}
