import { normalizeBuildTag } from './BuildTags.js';

// The weekly build challenge: one theme a week, Monday 00:00 UTC to the
// next Monday, taken in turn from CHALLENGE_THEMES starting with the week
// of CHALLENGE_EPOCH. A build enters by carrying the week's tag
// (DocumentMetadata.tags), such as "lighthouse-20261012": the theme and the
// Monday it began, so every week's tag is different and any copy of the
// app works out the same tag for the same week, with no server.
//
// Each theme names built-in structures (core/library/) to start from: the
// one Join opens, and a few more shown as ideas. The UI's text for a theme
// is `challenge.theme.<id>.title` and `.brief`.

export const CHALLENGE_THEMES = Object.freeze([
    Object.freeze({ id: 'lighthouse', starterStructureId: 'village:watchtower', ideaStructureIds: Object.freeze(['showcase:harbor_island', 'village:watchtower', 'village:dock']) }),
    Object.freeze({ id: 'bridge', starterStructureId: 'village:bridge', ideaStructureIds: Object.freeze(['village:bridge', 'village:dock', 'showcase:harbor_island']) }),
    Object.freeze({ id: 'tiny-home', starterStructureId: 'village:cottage', ideaStructureIds: Object.freeze(['village:cottage', 'village:house', 'village:tool_shed']) }),
    Object.freeze({ id: 'castle-gate', starterStructureId: 'village:village_gate', ideaStructureIds: Object.freeze(['village:village_gate', 'showcase:castle', 'village:fence_segment']) }),
    Object.freeze({ id: 'windmill', starterStructureId: 'village:mill', ideaStructureIds: Object.freeze(['village:mill', 'village:granary', 'village:barn']) }),
    Object.freeze({ id: 'market', starterStructureId: 'village:market_stall', ideaStructureIds: Object.freeze(['village:market_stall', 'village:market', 'showcase:village_square']) }),
    Object.freeze({ id: 'tower', starterStructureId: 'village:watchtower', ideaStructureIds: Object.freeze(['village:watchtower', 'village:silo', 'showcase:castle']) }),
    Object.freeze({ id: 'chapel', starterStructureId: 'village:small_chapel', ideaStructureIds: Object.freeze(['village:small_chapel', 'village:pavilion', 'village:village_hall']) })
]);

// The Monday (UTC) whose week has the first theme.
export const CHALLENGE_EPOCH = '2026-10-12';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const EPOCH_MS = Date.parse(`${CHALLENGE_EPOCH}T00:00:00Z`);
const CHALLENGE_ID_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const CHALLENGE_TAG_PATTERN = /^([a-z][a-z0-9-]*)-(\d{4})(\d{2})(\d{2})$/;

function themeForWeek(weekIndex) {
    const count = CHALLENGE_THEMES.length;
    return CHALLENGE_THEMES[((weekIndex % count) + count) % count];
}

function isoDate(ms) {
    return new Date(ms).toISOString().slice(0, 10);
}

// The challenge of the week starting at `startMs`, which must be a Monday
// 00:00 UTC.
function challengeStartingAt(startMs) {
    const weekIndex = Math.round((startMs - EPOCH_MS) / WEEK_MS);
    const theme = themeForWeek(weekIndex);
    const id = isoDate(startMs);
    return Object.freeze({
        id,
        themeId: theme.id,
        tag: `${theme.id}-${id.replaceAll('-', '')}`,
        startsAt: new Date(startMs),
        endsAt: new Date(startMs + WEEK_MS),
        starterStructureId: theme.starterStructureId,
        ideaStructureIds: theme.ideaStructureIds
    });
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
