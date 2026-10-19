// My Worlds' shelves (ui/views/RecentWorldsView.js): the World visited
// last, offered on its own to pick up where you left off, and the rest
// grouped by when they were visited. Days are counted the way the cards
// word them (ui/i18n/dateText.js's relativeVisitText), so a World under
// "Today" never says "yesterday".
const DAY_MS = 24 * 60 * 60 * 1000;

export const VISIT_GROUPS = Object.freeze([
    Object.freeze({ id: 'today', titleKey: 'recentWorldsView.group.today', maxDays: 0 }),
    Object.freeze({ id: 'week', titleKey: 'recentWorldsView.group.thisWeek', maxDays: 6 }),
    Object.freeze({ id: 'earlier', titleKey: 'recentWorldsView.group.earlier', maxDays: Infinity })
]);

function visitGroupOf(lastVisitedAt, now) {
    // No timestamp, or one in the future: nothing to say how recent, so
    // "Earlier" rather than "Today".
    if (typeof lastVisitedAt !== 'number' || now - lastVisitedAt < 0) {
        return VISIT_GROUPS[VISIT_GROUPS.length - 1];
    }
    const days = Math.floor((now - lastVisitedAt) / DAY_MS);
    return VISIT_GROUPS.find((group) => days <= group.maxDays);
}

// `worlds` most recent first, as LocalWorldExperienceStore lists them.
// Returns the latest World (null for none) and the non-empty groups of
// the rest, in VISIT_GROUPS' order, each keeping that recency order.
export function groupRecentWorlds(worlds, now = Date.now()) {
    const [latest = null, ...rest] = worlds;
    const groups = VISIT_GROUPS
        .map((group) => ({ id: group.id, titleKey: group.titleKey, worlds: rest.filter((world) => visitGroupOf(world.lastVisitedAt, now) === group) }))
        .filter((group) => group.worlds.length > 0);
    return { latest, groups };
}
