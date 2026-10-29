// World View's seasons: spring, summer, autumn and winter, and how the land
// looks in each. Worked out from the clock alone, as the day and night and
// the weather are (core/nature/DayCycle.js, core/nature/Weather.js), so everyone at a build
// sees the same season with nothing sent or stored.
//
// A year lasts WORLD_YEAR_DAYS of World View's days, SEASON_DAYS to a
// season: one season to each turn of the moon (core/nature/DayCycle.js's
// MOON_CYCLE_DAYS), so every season starts at dawn on the day whose night
// brings a new moon. A season lasts a little over five hours, so a visit of
// an hour or two mostly stays in one, now and then sees it turn, and a player
// coming back finds another; the year doesn't divide a real day, so someone
// who always plays at the same hour sees the seasons go round.
//
// The week's season comes first (docs/Pillars.md, "One clock that matters:
// the week"): while the weekly challenge's theme belongs to a season
// (core/challenge/BuildChallenge.js, a winter cabin, a summer fair), the
// world stays in that season from Monday to Monday, so the week's entries
// are seen in it. It doesn't stand still: it goes from the season's
// HELD_FROM_DAY to its HELD_TO_DAY and back, a season's length there and
// back, so the land keeps changing a little and never shows the next
// season's edge. Every other week the year turns as above. The world's clock
// for all of it is yearSecondsAt(), so the land, the sky, the lakes' ice and
// the weather's rain and snow (core/nature/Weather.js) all keep the same
// season. Monday changes the season and the theme together, at once.
//
// It is the world's year, not the calendar's: the same everywhere, so friends
// walking together share it wherever they live.
//
// The look is continuous: what the season shows (leaves, blossom, ripening
// crops, ...) blends between KEYFRAMES set at points in the year, so the land
// changes a little each day rather than all at once at a season's start. Its
// fields are each 0 to 1 unless said otherwise:
//
//   season         the season under way (SEASON), day its day (0 to
//                  SEASON_DAYS - 1)
//   yearDay        how far through the year, in days (0 up to WORLD_YEAR_DAYS)
//   leaves         how much of a broadleaf tree's foliage it carries: 1 in
//                  full leaf, 0 bare
//   fresh          how fresh and light the new leaves and grass are
//   blossom        how far the flowering trees are in bloom
//   autumn         how far leaves have turned red, orange and yellow
//   fruit          how much ripe fruit hangs on the fruiting trees
//   flowers        how many wild flowers dot the grass
//   groundGrade    [r, g, b] the grass's colour is multiplied by
//   groundSaturation  how saturated the grass is: 1 as it is, below greyer
//   fieldColor     [r, g, b] the crops in the fields, fieldAmount how much
//                  the fields take it on
//   leafDrift      how many leaves are falling, petalDrift petals
//   snowCover      how much snow lies on the ground typically for the time
//                  of year: for a view that doesn't follow the weather
//                  (Always day, a chosen season); the weather's own snow
//                  (core/nature/Weather.js#snowCoverAt()) is what lies otherwise
//   birds          how much birdsong there is, insects how many insects are
//                  heard (core/app/AmbientSoundscape.js#ambientMixInSeason())
//   sky            the sun's and the moon's paths and how long the day is
//                  (core/nature/DayCycle.js#seasonalSky()): a high sun and a long
//                  day at midsummer, a low sun and a short one at midwinter,
//                  the equinoxes in the middle of spring and autumn
//
// Lakes freeze in the depth of winter (lakeIceAt()): that follows the
// world's clock alone, never a season kept on a device, because people walk
// on the ice, and everyone must agree where they can.

import { DAY_CYCLE_SECONDS, MOON_CYCLE_DAYS, seasonalSky } from './DayCycle.js';
import { challengeAt } from '../challenge/BuildChallenge.js';

export const SEASON = Object.freeze({
    SPRING: 'SPRING',
    SUMMER: 'SUMMER',
    AUTUMN: 'AUTUMN',
    WINTER: 'WINTER'
});

export const SEASONS = Object.freeze([SEASON.SPRING, SEASON.SUMMER, SEASON.AUTUMN, SEASON.WINTER]);
export const SEASON_DAYS = MOON_CYCLE_DAYS;
export const WORLD_YEAR_DAYS = SEASON_DAYS * SEASONS.length;
export const SEASON_SECONDS = SEASON_DAYS * DAY_CYCLE_SECONDS;
export const WORLD_YEAR_SECONDS = WORLD_YEAR_DAYS * DAY_CYCLE_SECONDS;

// The year's colours. Muted, like the rest of the land
// (core/nature/TerrainSurface.js's SURFACE_PALETTE): builds stay what is looked at.
const BARE_SOIL = Object.freeze([0.56, 0.46, 0.36]);
const YOUNG_CROPS = Object.freeze([0.50, 0.66, 0.36]);
const GREEN_CROPS = Object.freeze([0.45, 0.60, 0.32]);
const RIPE_CROPS = Object.freeze([0.80, 0.70, 0.40]);
const STUBBLE = Object.freeze([0.70, 0.62, 0.46]);

function look(fields) {
    return Object.freeze({
        leaves: 1,
        fresh: 0,
        blossom: 0,
        autumn: 0,
        fruit: 0,
        flowers: 0,
        groundGrade: Object.freeze([1, 1, 1]),
        groundSaturation: 1,
        fieldColor: GREEN_CROPS,
        fieldAmount: 0,
        leafDrift: 0,
        petalDrift: 0,
        snowCover: 0,
        birds: 1,
        insects: 1,
        ...fields
    });
}

// Late winter going into spring: buds breaking, the first blossom, fields
// ploughed bare.
const THAW = look({
    leaves: 0.15, fresh: 1, blossom: 0.3, flowers: 0.1,
    groundGrade: Object.freeze([1.0, 1.03, 0.92]), groundSaturation: 0.85,
    fieldColor: BARE_SOIL, fieldAmount: 0.7, petalDrift: 0.2, snowCover: 0.1, birds: 1.1, insects: 0.3
});
const BLOSSOM = look({
    leaves: 0.65, fresh: 1, blossom: 1, flowers: 0.6,
    groundGrade: Object.freeze([0.95, 1.1, 0.8]), groundSaturation: 1.3,
    fieldColor: YOUNG_CROPS, fieldAmount: 0.3, petalDrift: 1, birds: 1.3, insects: 0.6
});
const LATE_SPRING = look({
    leaves: 1, fresh: 0.7, blossom: 0.15, flowers: 1,
    groundGrade: Object.freeze([0.93, 1.09, 0.8]), groundSaturation: 1.3,
    fieldColor: YOUNG_CROPS, fieldAmount: 0.6, petalDrift: 0.15, birds: 1.25, insects: 0.9
});
const HIGH_SUMMER = look({
    fresh: 0.1, flowers: 0.6, fruit: 0.3,
    groundGrade: Object.freeze([0.88, 1.0, 0.8]), groundSaturation: 1.25,
    fieldColor: GREEN_CROPS, fieldAmount: 0.7, birds: 1, insects: 1.2
});
const HARVEST = look({
    flowers: 0.25, fruit: 1,
    groundGrade: Object.freeze([0.98, 0.98, 0.78]), groundSaturation: 1.1,
    fieldColor: RIPE_CROPS, fieldAmount: 0.8, birds: 0.9, insects: 1.2
});
const EARLY_AUTUMN = look({
    leaves: 0.95, autumn: 0.35, fruit: 0.6, flowers: 0.1,
    groundGrade: Object.freeze([1.05, 0.97, 0.74]), groundSaturation: 1.0,
    fieldColor: STUBBLE, fieldAmount: 0.7, leafDrift: 0.2, birds: 0.8, insects: 0.8
});
const FALL_COLOURS = look({
    leaves: 0.8, autumn: 1, fruit: 0.15,
    groundGrade: Object.freeze([1.09, 0.95, 0.72]), groundSaturation: 0.95,
    fieldColor: STUBBLE, fieldAmount: 0.7, leafDrift: 0.7, birds: 0.7, insects: 0.5
});
const LEAF_FALL = look({
    leaves: 0.3, autumn: 1,
    groundGrade: Object.freeze([1.06, 0.96, 0.8]), groundSaturation: 0.75,
    fieldColor: BARE_SOIL, fieldAmount: 0.6, leafDrift: 1, birds: 0.6, insects: 0.25
});
const BARE = look({
    leaves: 0, autumn: 1,
    groundGrade: Object.freeze([1.04, 0.98, 0.9]), groundSaturation: 0.5,
    fieldColor: BARE_SOIL, fieldAmount: 0.6, leafDrift: 0.15, snowCover: 0.3, birds: 0.45, insects: 0.05
});
const DEEP_WINTER = look({
    leaves: 0, autumn: 0,
    groundGrade: Object.freeze([1.04, 0.98, 0.92]), groundSaturation: 0.45,
    fieldColor: BARE_SOIL, fieldAmount: 0.6, snowCover: 0.9, birds: 0.4, insects: 0
});
const LATE_WINTER = look({
    leaves: 0, autumn: 0,
    groundGrade: Object.freeze([1.03, 1.0, 0.92]), groundSaturation: 0.55,
    fieldColor: BARE_SOIL, fieldAmount: 0.65, snowCover: 0.6, birds: 0.6, insects: 0
});

// Where in the year, in days, each look is reached; between two, the look
// blends from one to the next. Spring is days 0 to 8, summer 8 to 16,
// autumn 16 to 24 and winter 24 to 32.
const KEYFRAMES = Object.freeze([
    { at: 0, look: THAW },
    { at: 2.5, look: BLOSSOM },
    { at: 5.5, look: LATE_SPRING },
    { at: 10, look: HIGH_SUMMER },
    { at: 14.5, look: HARVEST },
    { at: 17.5, look: EARLY_AUTUMN },
    { at: 20, look: FALL_COLOURS },
    { at: 22.5, look: LEAF_FALL },
    { at: 24.5, look: BARE },
    { at: 27, look: DEEP_WINTER },
    { at: 30, look: LATE_WINTER },
    { at: WORLD_YEAR_DAYS, look: THAW }
]);

// The middle of each season, the look a chosen season (seasonLookOf()) keeps.
const SEASON_MIDDLE_DAY = Object.freeze({
    [SEASON.SPRING]: 3.5,
    [SEASON.SUMMER]: 12,
    [SEASON.AUTUMN]: 20.5,
    [SEASON.WINTER]: 28
});

// A week's season is held between these days of it (of 0 to SEASON_DAYS),
// clear of the turns into the seasons either side: spring in blossom,
// summer's green going to harvest, autumn's colours, winter's snow with the
// lakes frozen hard (LAKE_FREEZE_DAY to LAKE_THAW_DAY) all through.
export const HELD_FROM_DAY = 2;
export const HELD_TO_DAY = 6;
const HELD_SPAN_SECONDS = (HELD_TO_DAY - HELD_FROM_DAY) * DAY_CYCLE_SECONDS;

// The week at `seconds` (Unix time) when it holds a season: { season, start },
// its SEASON and its Monday in Unix seconds; null for a week whose theme has
// none, a remix week, or no clock. The weather asks for every step it follows
// (core/nature/Weather.js#snowCoverAt()), so the last week is kept.
const WEEK_SECONDS = 7 * 24 * 60 * 60;
// Unix time 0 was a Thursday: the first Monday 00:00 UTC is four days on.
const FIRST_MONDAY_SECONDS = 4 * 24 * 60 * 60;
let lastWeek = null;

export function heldWeekAt(seconds) {
    if (!Number.isFinite(seconds)) return null;
    const start = Math.floor((seconds - FIRST_MONDAY_SECONDS) / WEEK_SECONDS) * WEEK_SECONDS + FIRST_MONDAY_SECONDS;
    if (!lastWeek || lastWeek.start !== start) {
        const challenge = challengeAt(start * 1000);
        const season = challenge && SEASON[challenge.season] ? challenge.season : null;
        lastWeek = { start, held: season ? Object.freeze({ season, start }) : null };
    }
    return lastWeek.held;
}

// The season the weekly challenge running at `seconds` belongs to (SEASON),
// or null.
export function weekSeasonAt(seconds) {
    const held = heldWeekAt(seconds);
    return held ? held.season : null;
}

// How far through the world's year `seconds` (Unix time) is, in seconds from
// spring's first dawn, 0 up to, not including, WORLD_YEAR_SECONDS: the
// year's own turn, or, in a week with a season, that season held.
export function yearSecondsAt(seconds) {
    const held = heldWeekAt(seconds);
    if (!held) {
        return ((seconds % WORLD_YEAR_SECONDS) + WORLD_YEAR_SECONDS) % WORLD_YEAR_SECONDS;
    }
    const phase = (seconds - held.start) % (2 * HELD_SPAN_SECONDS);
    const along = phase < HELD_SPAN_SECONDS ? phase : 2 * HELD_SPAN_SECONDS - phase;
    return SEASONS.indexOf(held.season) * SEASON_SECONDS + HELD_FROM_DAY * DAY_CYCLE_SECONDS + along;
}

// How far through the year the world is at `seconds` (Unix time), in days,
// from 0 (spring's first dawn) up to, not including, WORLD_YEAR_DAYS. With
// no clock, the middle of summer.
export function yearDayAt(seconds) {
    if (!Number.isFinite(seconds)) {
        return SEASON_MIDDLE_DAY[SEASON.SUMMER];
    }
    return yearSecondsAt(seconds) / DAY_CYCLE_SECONDS;
}

export function seasonOfYearDay(yearDay) {
    const d = Number.isFinite(yearDay) ? ((yearDay % WORLD_YEAR_DAYS) + WORLD_YEAR_DAYS) % WORLD_YEAR_DAYS : 0;
    return SEASONS[Math.min(SEASONS.length - 1, Math.floor(d / SEASON_DAYS))];
}

// The season under way at `seconds`.
export function seasonAt(seconds) {
    return seasonOfYearDay(yearDayAt(seconds));
}

// When the year's own turn of the season under way at `seconds` began, and
// when the next begins, in Unix seconds (a week with a season holds it past
// these; see weekSeasonAt()).
export function seasonBoundsAt(seconds) {
    const start = Math.floor(seconds / SEASON_SECONDS) * SEASON_SECONDS;
    return { start, end: start + SEASON_SECONDS };
}

// The land's look at `seconds`: a frozen object with the fields above. The
// land changes too slowly to see from one frame to the next, so the look is
// taken every LOOK_STEP_DAYS, and the same object comes back in between.
const LOOK_STEP_DAYS = 1 / 1000;

export function seasonLookAt(seconds) {
    return seasonLookAtYearDay(Math.floor(yearDayAt(seconds) / LOOK_STEP_DAYS) * LOOK_STEP_DAYS);
}

// A chosen season's look, the same all through it (its middle): for a device
// that keeps one season (application/settings/WorldViewSeasonStore.js).
export function seasonLookOf(season) {
    const middle = SEASON_MIDDLE_DAY[season];
    return seasonLookAtYearDay(middle === undefined ? SEASON_MIDDLE_DAY[SEASON.SUMMER] : middle);
}

// The same look comes back for the same moment, so a renderer can tell
// nothing changed.
let lastLook = null;

export function seasonLookAtYearDay(yearDay) {
    const d = Number.isFinite(yearDay) ? ((yearDay % WORLD_YEAR_DAYS) + WORLD_YEAR_DAYS) % WORLD_YEAR_DAYS : SEASON_MIDDLE_DAY[SEASON.SUMMER];
    if (lastLook && lastLook.yearDay === d) return lastLook.result;
    let i = 1;
    while (i < KEYFRAMES.length - 1 && d > KEYFRAMES[i].at) i++;
    const from = KEYFRAMES[i - 1];
    const to = KEYFRAMES[i];
    const t = smooth01((d - from.at) / (to.at - from.at));
    const season = seasonOfYearDay(d);
    const result = Object.freeze({
        season,
        day: Math.floor(d - SEASONS.indexOf(season) * SEASON_DAYS),
        yearDay: d,
        ...blendLooks(from.look, to.look, t),
        sky: seasonalSky(summerAt(d))
    });
    lastLook = { yearDay: d, result };
    return result;
}

// How far towards midsummer (1) or midwinter (-1) the year is on `yearDay`:
// a smooth wave, 0 at the middle of spring and of autumn.
const MIDSUMMER_DAY = 12;

export function summerAt(yearDay) {
    return Math.cos((2 * Math.PI * (yearDay - MIDSUMMER_DAY)) / WORLD_YEAR_DAYS);
}

// How much ice lies on the lakes at `seconds`, 0 (open water) to 1 (frozen
// hard): it forms over the half day before winter's third day, and breaks
// up over the first half of its last. Only frozen hard (isLakeFrozenAt()) can
// it be walked on; while it forms or breaks up it only shows. Never on the
// sea or on rivers (core/nature/Hydrology.js#isLakeAt()).
export const LAKE_FREEZE_DAY = 2;
export const LAKE_THAW_DAY = 7;
const LAKE_ICE_CHANGE_DAYS = 0.5;

export function lakeIceAt(seconds) {
    if (!Number.isFinite(seconds)) return 0;
    const yearDay = yearDayAt(seconds);
    const winterDay = yearDay - 3 * SEASON_DAYS;
    if (winterDay < LAKE_FREEZE_DAY - LAKE_ICE_CHANGE_DAYS || winterDay >= LAKE_THAW_DAY + LAKE_ICE_CHANGE_DAYS) return 0;
    if (winterDay < LAKE_FREEZE_DAY) return smooth01((winterDay - (LAKE_FREEZE_DAY - LAKE_ICE_CHANGE_DAYS)) / LAKE_ICE_CHANGE_DAYS);
    if (winterDay < LAKE_THAW_DAY) return 1;
    return 1 - smooth01((winterDay - LAKE_THAW_DAY) / LAKE_ICE_CHANGE_DAYS);
}

export function isLakeFrozenAt(seconds) {
    return lakeIceAt(seconds) >= 1;
}

function blendLooks(from, to, t) {
    const out = {};
    for (const key of Object.keys(from)) {
        const a = from[key];
        const b = to[key];
        out[key] = Array.isArray(a) ? Object.freeze(a.map((v, i) => lerp(v, b[i], t))) : lerp(a, b, t);
    }
    return out;
}

// How far the precipitation at `seconds` falls as snow rather than rain:
// all of it through winter, none the rest of the year. It turns over the
// last WEATHER_CHANGE_SECONDS-long stretch before winter starts and before
// it ends (`changeSeconds`), as a spell's weather does, so a shower that
// runs across the turn changes from rain to snow, or back, as it falls.
export function snowShareAt(seconds, changeSeconds = 120) {
    if (!Number.isFinite(seconds)) return 0;
    const into = yearSecondsAt(seconds);
    const winterStart = 3 * SEASON_SECONDS;
    if (into >= winterStart) {
        // Winter: snow, until it turns back to rain just before spring.
        return 1 - smooth01((into - (WORLD_YEAR_SECONDS - changeSeconds)) / changeSeconds);
    }
    // Rain, until it turns to snow just before winter.
    return smooth01((into - (winterStart - changeSeconds)) / changeSeconds);
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function smooth01(v) {
    const t = v < 0 ? 0 : v > 1 ? 1 : v;
    return t * t * (3 - 2 * t);
}
