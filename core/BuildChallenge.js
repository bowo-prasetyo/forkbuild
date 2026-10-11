import { normalizeBuildTag } from './BuildTags.js';

// The weekly build challenge: one theme a week, Monday 00:00 UTC to the
// next Monday, taken in turn from CHALLENGE_THEMES starting with the week
// of CHALLENGE_EPOCH. A build enters by carrying the week's tag
// (DocumentMetadata.tags), such as "lighthouse-20261012": the theme and the
// Monday it began, so every week's tag is different and any copy of the
// app works out the same tag for the same week, with no server.
//
// Each theme names built-in structures (core/library/) as ideas: Join opens
// an empty plot with them pinned in the Build Library, so an entry is built
// rather than a ready-made one published, and dropping one in is the
// builder's choice. The UI's text for a theme is
// `challenge.theme.<id>.title`, `.brief` and `.twist` (a constraint that
// makes the week's entries differ).
//
// From CHALLENGE_EPOCH, every fourth week is a remix week instead
// (CHALLENGE_KIND.REMIX, tag "remix-20261102"): an entry starts as a copy of
// one of the week before's entries (`remixOf`), so older builds get a
// second life and the family tree grows. The themes keep their turn around
// it.

export const CHALLENGE_THEMES = Object.freeze([
    Object.freeze({ id: 'lighthouse', starterStructureId: 'collection:lighthouse', ideaStructureIds: Object.freeze(['collection:lighthouse', 'collection:keepers_lighthouse', 'showcase:harbor_island']) }),
    Object.freeze({ id: 'bridge', starterStructureId: 'village:bridge', ideaStructureIds: Object.freeze(['village:bridge', 'village:dock', 'showcase:harbor_island']) }),
    Object.freeze({ id: 'tiny-home', starterStructureId: 'village:cottage', ideaStructureIds: Object.freeze(['village:cottage', 'village:house', 'village:tool_shed']) }),
    Object.freeze({ id: 'castle-gate', starterStructureId: 'village:village_gate', ideaStructureIds: Object.freeze(['village:village_gate', 'showcase:castle', 'village:fence_segment']) }),
    Object.freeze({ id: 'windmill', starterStructureId: 'village:mill', ideaStructureIds: Object.freeze(['village:mill', 'village:granary', 'village:barn']) }),
    Object.freeze({ id: 'market', starterStructureId: 'village:market_stall', ideaStructureIds: Object.freeze(['village:market_stall', 'village:market', 'showcase:village_square']) }),
    Object.freeze({ id: 'tower', starterStructureId: 'village:watchtower', ideaStructureIds: Object.freeze(['village:watchtower', 'village:silo', 'showcase:castle']) }),
    Object.freeze({ id: 'chapel', starterStructureId: 'village:small_chapel', ideaStructureIds: Object.freeze(['village:small_chapel', 'village:pavilion', 'village:village_hall']) }),
    // Added 2026-10-11, so that half a year passes before a theme comes round
    // again; each starts from a build of its own.
    Object.freeze({ id: 'well', starterStructureId: 'village:well', ideaStructureIds: Object.freeze(['village:well', 'showcase:village_square', 'village:pavilion']) }),
    Object.freeze({ id: 'harbor', starterStructureId: 'village:dock', ideaStructureIds: Object.freeze(['village:dock', 'showcase:harbor_island', 'collection:keepers_lighthouse']) }),
    Object.freeze({ id: 'barn', starterStructureId: 'village:barn', ideaStructureIds: Object.freeze(['village:barn', 'collection:farmstead', 'village:fence_segment']) }),
    Object.freeze({ id: 'garden', starterStructureId: 'village:garden_cottage', ideaStructureIds: Object.freeze(['village:garden_cottage', 'collection:house_with_garden', 'village:fence_segment']) }),
    Object.freeze({ id: 'workshop', starterStructureId: 'village:tool_shed', ideaStructureIds: Object.freeze(['village:tool_shed', 'village:barn', 'village:stable']) }),
    Object.freeze({ id: 'fortress', starterStructureId: 'showcase:castle', ideaStructureIds: Object.freeze(['showcase:castle', 'village:round_tower', 'village:village_gate']) }),
    Object.freeze({ id: 'bandstand', starterStructureId: 'village:pavilion', ideaStructureIds: Object.freeze(['village:pavilion', 'village:market', 'showcase:village_square']) }),
    Object.freeze({ id: 'porch', starterStructureId: 'collection:house_with_porch', ideaStructureIds: Object.freeze(['collection:house_with_porch', 'collection:house_with_garden', 'collection:house_with_tower']) }),
    Object.freeze({ id: 'stables', starterStructureId: 'village:stable', ideaStructureIds: Object.freeze(['village:stable', 'village:barn', 'village:fence_segment']) }),
    Object.freeze({ id: 'round-tower', starterStructureId: 'village:round_tower', ideaStructureIds: Object.freeze(['village:round_tower', 'collection:house_with_tower', 'showcase:castle']) }),
    Object.freeze({ id: 'island', starterStructureId: 'showcase:harbor_island', ideaStructureIds: Object.freeze(['showcase:harbor_island', 'village:dock', 'collection:keepers_lighthouse']) }),
    Object.freeze({ id: 'harvest', starterStructureId: 'village:granary', ideaStructureIds: Object.freeze(['village:granary', 'collection:mill_and_granary', 'village:silo']) }),
    Object.freeze({ id: 'village-hall', starterStructureId: 'village:village_hall', ideaStructureIds: Object.freeze(['village:village_hall', 'village:small_chapel', 'showcase:village_square']) }),
    Object.freeze({ id: 'grand-house', starterStructureId: 'village:large_house', ideaStructureIds: Object.freeze(['village:large_house', 'collection:house_with_tower', 'village:house']) }),
    Object.freeze({ id: 'walls', starterStructureId: 'village:fence_segment', ideaStructureIds: Object.freeze(['village:fence_segment', 'village:village_gate', 'collection:house_with_garden']) }),
    Object.freeze({ id: 'village-square', starterStructureId: 'showcase:village_square', ideaStructureIds: Object.freeze(['showcase:village_square', 'village:well', 'village:market']) }),
    Object.freeze({ id: 'silo', starterStructureId: 'village:silo', ideaStructureIds: Object.freeze(['village:silo', 'village:granary', 'village:mill']) }),
    Object.freeze({ id: 'family-home', starterStructureId: 'village:house', ideaStructureIds: Object.freeze(['village:house', 'collection:house_with_garden', 'village:large_house']) })
]);

export const CHALLENGE_KIND = Object.freeze({
    THEME: 'theme',
    REMIX: 'remix'
});

// A remix week's theme id, the start of its tag, and how often one comes
// round: the fourth week of every four from CHALLENGE_EPOCH.
export const REMIX_THEME_ID = 'remix';
export const REMIX_WEEK_EVERY = 4;

// How many themes there were before the 2026-10-11 additions. Weeks before
// CHALLENGE_EPOCH keep the themes they ran with (their entries carry those
// weeks' tags), taken in turn from the first this many.
const ORIGINAL_THEME_COUNT = 8;

// The Monday (UTC) whose week has the first theme.
export const CHALLENGE_EPOCH = '2026-10-12';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const EPOCH_MS = Date.parse(`${CHALLENGE_EPOCH}T00:00:00Z`);
const CHALLENGE_ID_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CHALLENGE_TAG_PATTERN = /^([a-z][a-z0-9-]*)-(\d{4})(\d{2})(\d{2})$/;

function isRemixWeek(weekIndex) {
    return weekIndex >= 0 && weekIndex % REMIX_WEEK_EVERY === REMIX_WEEK_EVERY - 1;
}

// The theme of a themed week: before CHALLENGE_EPOCH the original turn; from
// it, the themes in turn over the weeks that aren't remix weeks.
function themeForWeek(weekIndex) {
    if (weekIndex < 0) {
        return CHALLENGE_THEMES[((weekIndex % ORIGINAL_THEME_COUNT) + ORIGINAL_THEME_COUNT) % ORIGINAL_THEME_COUNT];
    }
    const themedWeeks = weekIndex - Math.floor((weekIndex + 1) / REMIX_WEEK_EVERY);
    return CHALLENGE_THEMES[themedWeeks % CHALLENGE_THEMES.length];
}

function isoDate(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}

// The challenge of the week starting at `startMs`, which must be a Monday
// 00:00 UTC.
function challengeStartingAt(startMs) {
    const weekIndex = Math.round((startMs - EPOCH_MS) / WEEK_MS);
    const id = isoDate(startMs);
    if (isRemixWeek(weekIndex)) {
        return Object.freeze({
            id,
            kind: CHALLENGE_KIND.REMIX,
            themeId: REMIX_THEME_ID,
            tag: `${REMIX_THEME_ID}-${id.replaceAll('-', '')}`,
            startsAt: new Date(startMs),
            endsAt: new Date(startMs + WEEK_MS),
            remixOf: isoDate(startMs - WEEK_MS),
            starterStructureId: null,
            ideaStructureIds: Object.freeze([])
        });
    }
    const theme = themeForWeek(weekIndex);
    return Object.freeze({
        id,
        kind: CHALLENGE_KIND.THEME,
        themeId: theme.id,
        tag: `${theme.id}-${id.replaceAll('-', '')}`,
        startsAt: new Date(startMs),
        endsAt: new Date(startMs + WEEK_MS),
        remixOf: null,
        starterStructureId: theme.starterStructureId,
        ideaStructureIds: theme.ideaStructureIds
    });
}

export function isRemixChallenge(challenge) {
    return challenge?.kind === CHALLENGE_KIND.REMIX;
}

// The structures a themed week pins in the Build Library when Join opens an
// empty plot: its starter, then its ideas, each once. None for a remix week.
export function challengeIdeaStructureIds(challenge) {
    if (!challenge || isRemixChallenge(challenge)) return [];
    return [...new Set([challenge.starterStructureId, ...(challenge.ideaStructureIds || [])].filter(Boolean))];
}

// The challenge running at `now` (a Date or a time in ms).
export function challengeAt(now = Date.now()) {
    const ms = now instanceof Date ? now.getTime() : Number(now);
    if (!Number.isFinite(ms)) return null;
    const weekIndex = Math.floor((ms - EPOCH_MS) / WEEK_MS);
    return challengeStartingAt(EPOCH_MS + weekIndex * WEEK_MS);
}

// The challenge an id ("2026-10-12", its Monday) names, or null when the id
// isn't a Monday's date.
export function challengeById(id) {
    if (typeof id !== 'string') return null;
    const match = CHALLENGE_ID_PATTERN.exec(id);
    if (!match) return null;
    const ms = Date.parse(`${id}T00:00:00Z`);
    if (!Number.isFinite(ms) || isoDate(ms) !== id || (ms - EPOCH_MS) % WEEK_MS !== 0) return null;
    return challengeStartingAt(ms);
}

// The week before `challenge`'s.
export function previousChallenge(challenge) {
    if (!challenge || !(challenge.startsAt instanceof Date)) return null;
    return challengeStartingAt(challenge.startsAt.getTime() - WEEK_MS);
}

// The challenge a build tag names, or null for any other tag (including a
// theme and date that don't belong together).
export function challengeForTag(tag) {
    if (typeof tag !== 'string' || normalizeBuildTag(tag) !== tag) return null;
    const match = CHALLENGE_TAG_PATTERN.exec(tag);
    if (!match) return null;
    const challenge = challengeById(`${match[2]}-${match[3]}-${match[4]}`);
    return challenge && challenge.tag === tag ? challenge : null;
}

// The challenge a build's tags enter, or null. A build carries at most one
// week's tag in practice; the first is taken.
export function challengeOfTags(tags) {
    if (!Array.isArray(tags)) return null;
    for (const tag of tags) {
        const challenge = challengeForTag(tag);
        if (challenge) return challenge;
    }
    return null;
}

// `tags` with `challenge`'s tag first, keeping as many of the others as fit.
export function withChallengeTag(tags, challenge, maxCount) {
    const others = (Array.isArray(tags) ? tags : []).filter((tag) => tag !== challenge.tag);
    const limit = Number.isInteger(maxCount) && maxCount > 0 ? maxCount : others.length + 1;
    return [challenge.tag, ...others].slice(0, limit);
}

// Whole days left before `challenge` ends, counting a part day as one; 0
// once it has ended.
export function challengeDaysLeft(challenge, now = Date.now()) {
    const ms = now instanceof Date ? now.getTime() : Number(now);
    const left = challenge.endsAt.getTime() - ms;
    return left > 0 ? Math.ceil(left / DAY_MS) : 0;
}

export function isChallengeOpen(challenge, now = Date.now()) {
    const ms = now instanceof Date ? now.getTime() : Number(now);
    return ms >= challenge.startsAt.getTime() && ms < challenge.endsAt.getTime();
}
