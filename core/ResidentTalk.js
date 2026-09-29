// What a World Resident says when you talk to it: one or two remarks about
// what's around, built from facts a caller has already gathered
// (application/world/ResidentSurroundings.js). Pure: no clock, no session,
// no randomness — the same facts and turn always give the same words.
//
// A resident tells you what exists, never what to do (see
// docs/principles/vehicles.md, "A Resident Tells You What's Around, Never
// What To Do"): every remark is a plain statement of where something is,
// with a rounded distance and a compass direction seen from the resident.
// No remark asks, urges or rewards anything.
//
// Titles and names come from other people (a publication's title and
// author, a presence display name), so they are spoken as plain text:
// control and bidirectional-override characters removed, whitespace
// collapsed, length capped. Nothing here produces markup, and callers draw
// the words as text.

// What a fact is about.
export const RESIDENT_FACT_KIND = Object.freeze({
    VEHICLE: 'VEHICLE',
    ANIMAL: 'ANIMAL',
    LANDMARK: 'LANDMARK',
    PERSON: 'PERSON',
    BUILD: 'BUILD',
    PLACE: 'PLACE'
});

// Longest title or name spoken in full.
export const MAX_SPOKEN_TITLE_LENGTH = 60;
export const MAX_SPOKEN_NAME_LENGTH = 40;

// Said when a resident knows of nothing around.
export const QUIET_REMARK = "It's quiet around here. I don't know of anything nearby.";

const COMPASS_WORDS = Object.freeze({
    N: 'north', NE: 'north-east', E: 'east', SE: 'south-east',
    S: 'south', SW: 'south-west', W: 'west', NW: 'north-west'
});

const VEHICLE_WORDS = Object.freeze({
    bicycle: 'a bicycle', motorcycle: 'a motorcycle', car: 'a car', drone: 'a drone'
});

const ANIMAL_WORDS = Object.freeze({
    DEER: 'a deer', RABBIT: 'a rabbit'
});

// Things close enough that a number would be fussy.
const A_FEW_STEPS = 15;

// Control characters, and the bidirectional overrides and isolates that
// could make a title read differently from what it is.
const UNSPEAKABLE = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;

// `text` as plain, speakable text of at most `maxLength` characters (an
// ellipsis marks a cut), or null when nothing speakable is left.
export function sanitizeSpokenText(text, maxLength) {
    if (typeof text !== 'string') return null;
    const clean = text.replace(UNSPEAKABLE, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length === 0) return null;
    const characters = Array.from(clean);
    if (characters.length <= maxLength) return clean;
    return `${characters.slice(0, maxLength - 1).join('').trimEnd()}…`;
}

// "about 80 m", "about 350 m", "about 3.2 km", "about 12 km", or "just a
// few steps" — never falsely precise.
export function describeDistance(meters) {
    if (!Number.isFinite(meters) || meters < A_FEW_STEPS) return 'just a few steps';
    if (meters < 100) return `about ${Math.round(meters / 10) * 10} m`;
    if (meters < 950) return `about ${Math.round(meters / 50) * 50} m`;
    const km = meters / 1000;
    if (km < 9.95) return `about ${Math.round(km * 10) / 10} km`;
    return `about ${Math.round(km)} km`;
}

// A compass sector label (N, NE, ...) as words, or null.
export function compassWord(label) {
    return COMPASS_WORDS[label] || null;
}

// "about 80 m to the east", "about 80 m away" (no direction known), or
// "just a few steps away".
function where(fact) {
    if (!(fact.distance >= A_FEW_STEPS)) return 'just a few steps away';
    const direction = compassWord(fact.direction);
    const distance = describeDistance(fact.distance);
    return direction ? `${distance} to the ${direction}` : `${distance} away`;
}

function capitalize(text) {
    return text.charAt(0).toUpperCase() + text.slice(1);
}

// One fact as one sentence, or null when it has nothing speakable.
export function phraseFact(fact) {
    if (!fact) return null;
    switch (fact.kind) {
    case RESIDENT_FACT_KIND.VEHICLE: {
        const thing = VEHICLE_WORDS[fact.vehicleType];
        return thing ? `There's ${thing} ${where(fact)}.` : null;
    }
    case RESIDENT_FACT_KIND.ANIMAL: {
        const thing = ANIMAL_WORDS[fact.species];
        return thing ? `There's ${thing} ${where(fact)}.` : null;
    }
    case RESIDENT_FACT_KIND.LANDMARK: {
        const title = sanitizeSpokenText(fact.title, MAX_SPOKEN_TITLE_LENGTH);
        return title ? `The landmark “${title}” is ${where(fact)}.` : null;
    }
    case RESIDENT_FACT_KIND.PERSON: {
        const name = sanitizeSpokenText(fact.displayName, MAX_SPOKEN_NAME_LENGTH);
        return name ? `${name} is ${where(fact)}.` : null;
    }
    case RESIDENT_FACT_KIND.BUILD: {
        const title = sanitizeSpokenText(fact.title, MAX_SPOKEN_TITLE_LENGTH);
        if (!title) return null;
        const author = sanitizeSpokenText(fact.author, MAX_SPOKEN_NAME_LENGTH);
        const byline = author ? ` by ${author}` : '';
        return `${capitalize(where(fact))}, there's a build called “${title}”${byline}.`;
    }
    case RESIDENT_FACT_KIND.PLACE: {
        const name = sanitizeSpokenText(fact.name, MAX_SPOKEN_TITLE_LENGTH);
        return name ? `This is ${name}.` : null;
    }
    default:
        return null;
    }
}

const NEARBY_KINDS = Object.freeze([
    RESIDENT_FACT_KIND.VEHICLE,
    RESIDENT_FACT_KIND.ANIMAL,
    RESIDENT_FACT_KIND.LANDMARK,
    RESIDENT_FACT_KIND.PERSON
]);

function byDistance(a, b) {
    return (a.distance - b.distance) || String(a.key || '').localeCompare(String(b.key || ''));
}

// How many of each kind (and how many builds) a resident takes turns
// mentioning: the nearest few.
const MENTIONED_PER_KIND = 3;

// What a resident says on the `turn`th conversation (0, 1, 2, ...) given
// `facts` ({ kind, distance, direction, ... } each): an array of one or two
// sentences. The first is about something nearby: the kinds take turns
// (nearest kind first, then the next, and the place it lives in last), and
// each time a kind comes round again it names its next-nearest thing, so
// talking again always moves on. The second is about another build, the
// nearest few taking turns. With nothing speakable at all, QUIET_REMARK.
export function composeResidentRemarks(facts, { turn = 0 } = {}) {
    const speakable = (facts || []).filter((fact) => phraseFact(fact) !== null);
    const index = Math.max(0, Math.floor(Number.isFinite(turn) ? turn : 0));

    // Each kind's nearest few, kinds ordered by their nearest; the place last.
    const groups = NEARBY_KINDS
        .map((kind) => speakable.filter((fact) => fact.kind === kind).sort(byDistance).slice(0, MENTIONED_PER_KIND))
        .filter((group) => group.length > 0)
        .sort((a, b) => byDistance(a[0], b[0]));
    const place = speakable.find((fact) => fact.kind === RESIDENT_FACT_KIND.PLACE);
    if (place) groups.push([place]);
    const builds = speakable.filter((fact) => fact.kind === RESIDENT_FACT_KIND.BUILD).sort(byDistance).slice(0, MENTIONED_PER_KIND);

    const remarks = [];
    if (groups.length > 0) {
        const group = groups[index % groups.length];
        remarks.push(phraseFact(group[Math.floor(index / groups.length) % group.length]));
    }
    if (builds.length > 0) {
        remarks.push(phraseFact(builds[index % builds.length]));
    }
    return remarks.length > 0 ? remarks : [QUIET_REMARK];
}
