// When the World's living things settle for the night: residents go home
// (core/world/ResidentMotion.js) and wild animals bed down
// (core/nature/WildlifeMotion.js) from a little after the sun goes down until
// dawn.
//
// The World's own night, never a device's: it follows the same day and the
// same seasons as the sky (core/nature/DayCycle.js, core/nature/Season.js), on
// the World clock, so every replica sees the same resident home and the same
// deer lying down. A device that keeps Always day or a season of its own
// changes how its sky looks, not where anyone is, as with the lakes' ice.
//
// Pure: a time in, a yes or no out.
import { dayFractionAt, seasonalFraction, SEASON_DAY_SHIFT } from './DayCycle.js';
import { yearDayAt, summerAt } from './Season.js';

// Where in an equinox day (core/nature/DayCycle.js's fractions, 0 at dawn)
// the World settles: as the dusk deepens toward night (dusk is at 0.64,
// full night at 0.72), so a resident is seen walking home in the evening
// light. It stays settled until dawn, the start of the next day.
export const NIGHTFALL_FRACTION = 0.63;

// Whether the World is settled for the night at `seconds` (World time).
// A longer summer day ends later, so summer nights start later, as the sky's
// do.
export function isNightfallAt(seconds) {
    if (!Number.isFinite(seconds)) return false;
    const summer = summerAt(yearDayAt(seconds));
    const fraction = seasonalFraction(dayFractionAt(seconds), SEASON_DAY_SHIFT * summer);
    return fraction >= NIGHTFALL_FRACTION;
}
