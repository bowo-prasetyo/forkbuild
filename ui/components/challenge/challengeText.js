import { challengeDaysLeft, isChallengeOpen, isRemixChallenge } from '../../../core/challenge/BuildChallenge.js';
import { formatDate, t } from '../../i18n/i18n.js';

// The words a challenge (core/challenge/BuildChallenge.js) is shown with.

// Message keys are camelCase; theme ids are tags, so hyphenated.
function themeKey(challenge) {
    return challenge.themeId.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

export function challengeThemeTitle(challenge) {
    return t(`challenge.theme.${themeKey(challenge)}.title`);
}

export function challengeThemeBrief(challenge) {
    return t(`challenge.theme.${themeKey(challenge)}.brief`);
}

// The week's twist (a constraint that makes entries differ), or '' for a
// remix week, whose twist is starting from someone else's entry.
export function challengeThemeTwist(challenge) {
    return isRemixChallenge(challenge) ? '' : t(`challenge.theme.${themeKey(challenge)}.twist`);
}

// For a theme that belongs to a season, a suggestion to keep World View in
// it to see the entries as they are meant to be seen; '' otherwise.
const SEASON_HINT = Object.freeze({
    SPRING: 'challenge.seasonHint.spring',
    SUMMER: 'challenge.seasonHint.summer',
    AUTUMN: 'challenge.seasonHint.autumn',
    WINTER: 'challenge.seasonHint.winter'
});

export function challengeSeasonHint(challenge) {
    const key = challenge && SEASON_HINT[challenge.season];
    return key ? t(key) : '';
}

// The week's last day, such as "Sunday, 18 October": the week ends at the
// next Monday 00:00 UTC, so the day is read in UTC.
export function challengeLastDayText(challenge) {
    return formatDate(new Date(challenge.endsAt.getTime() - 1), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

export function challengeDatesText(challenge) {
    const first = formatDate(challenge.startsAt, { day: 'numeric', month: 'long', timeZone: 'UTC' });
    return t('challenge.dates', { start: first, end: challengeLastDayText(challenge) });
}

// "3 days left", or "Ended" once the week is over, or "Starts …" before.
export function challengeTimeText(challenge, now = Date.now()) {
    if (isChallengeOpen(challenge, now)) return t('challenge.daysLeft', { count: challengeDaysLeft(challenge, now) });
    return now < challenge.startsAt.getTime() ? t('challenge.notStarted') : t('challenge.ended');
}

// Where Join goes. A themed week: an empty plot tagged for the week, with the
// theme's structures pinned in the Build Library (ui/views/EditorView.js);
// given a `structureId` (an idea picked on the challenge page), a copy of
// that structure instead. A remix week: its page, at last week's entries, one
// of which an entry starts as.
export function challengeJoinRoute(challenge, structureId = null) {
    if (isRemixChallenge(challenge)) return { path: `/challenge/${challenge.id}`, hash: '#challenge-remix-from' };
    return { path: '/editor', query: structureId ? { start: structureId, challenge: challenge.id } : { challenge: challenge.id } };
}

// A remix week's entry: a copy of `publication`, tagged for `challenge`.
export function challengeRemixRoute(challenge, publication) {
    return { path: '/editor', query: { fork: publication.documentId, publication: publication.id, challenge: challenge.id } };
}
