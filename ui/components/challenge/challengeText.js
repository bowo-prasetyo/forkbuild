import { challengeDaysLeft, isChallengeOpen } from '../../../core/BuildChallenge.js';
import { formatDate, t } from '../../i18n/i18n.js';

// The words a challenge (core/BuildChallenge.js) is shown with.

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

// Where Join goes: the theme's starting build, opened as the visitor's own
// copy and tagged for the week (ui/views/EditorView.js).
export function challengeJoinRoute(challenge, structureId = challenge.starterStructureId) {
    return { path: '/editor', query: { start: structureId, challenge: challenge.id } };
}
