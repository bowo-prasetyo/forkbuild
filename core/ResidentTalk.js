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
    // A structure placed in a loaded World: nearby, named by the document
    // it places.
    STRUCTURE: 'STRUCTURE',
    PLACE: 'PLACE'
});

// Which kinds of thing stay where they are, so the viewer can be offered a
// Focus on them (a camera-only look, see focusTargetsFor()). Animals and
// people move, so a look at where they were would miss them.
export const FOCUSABLE_FACT_KINDS = Object.freeze([
    RESIDENT_FACT_KIND.VEHICLE,
    RESIDENT_FACT_KIND.LANDMARK,
    RESIDENT_FACT_KIND.STRUCTURE,
    RESIDENT_FACT_KIND.BUILD
]);

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

// A vehicle's name on its own, for a Focus button.
const VEHICLE_NAMES = Object.freeze({
    bicycle: 'bicycle', motorcycle: 'motorcycle', car: 'car', drone: 'drone'
});

const ANIMAL_WORDS = Object.freeze({
    DEER: 'a deer', RABBIT: 'a rabbit'
});

// Things close enough that a number would be fussy.
const A_FEW_STEPS = 15;

// Control characters, and the bidirectional overrides and isolates that
// could make a title read differently from what it is.
const UNSPEAKABLE = /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

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
    case RESIDENT_FACT_KIND.STRUCTURE: {
        const title = sanitizeSpokenText(fact.title, MAX_SPOKEN_TITLE_LENGTH);
        if (!title) return null;
        const author = sanitizeSpokenText(fact.author, MAX_SPOKEN_NAME_LENGTH);
        const byline = author ? ` by ${author}` : '';
        return `“${title}”${byline} stands ${where(fact)}.`;
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
    RESIDENT_FACT_KIND.STRUCTURE,
    RESIDENT_FACT_KIND.PERSON
]);

function byDistance(a, b) {
    return (a.distance - b.distance) || String(a.key || '').localeCompare(String(b.key || ''));
}

// How many of each kind (and how many builds) a resident takes turns
// mentioning: the nearest few.
const MENTIONED_PER_KIND = 3;

// Which facts a resident mentions on the `turn`th conversation (0, 1, 2,
// ...) given `facts` ({ kind, distance, direction, ... } each): at most two.
// The first is something nearby: the kinds take turns (nearest kind first,
// then the next, and the place it lives in last), and each time a kind comes
// round again it names its next-nearest thing, so talking again always
// moves on. The second is another build, the nearest few taking turns.
// Only facts with something speakable are ever picked.
export function pickResidentRemarkFacts(facts, { turn = 0 } = {}) {
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

    const picked = [];
    if (groups.length > 0) {
        const group = groups[index % groups.length];
        picked.push(group[Math.floor(index / groups.length) % group.length]);
    }
    if (builds.length > 0) {
        picked.push(builds[index % builds.length]);
    }
    return picked;
}

// What a resident says on the `turn`th conversation: the picked facts
// (pickResidentRemarkFacts()) as sentences, or QUIET_REMARK when there is
// nothing to say.
export function composeResidentRemarks(facts, { turn = 0 } = {}) {
    const remarks = pickResidentRemarkFacts(facts, { turn }).map(phraseFact);
    return remarks.length > 0 ? remarks : [QUIET_REMARK];
}

// What the viewer may choose to look at after hearing about `facts` (as
// picked): one { kind, label, position } per mentioned thing that stays put
// (FOCUSABLE_FACT_KINDS) and has a position. `label` is plain text for a
// Focus button — the title as spoken, or the vehicle's name.
export function focusTargetsFor(facts) {
    const targets = [];
    for (const fact of facts || []) {
        if (!FOCUSABLE_FACT_KINDS.includes(fact.kind) || !fact.position) continue;
        if (!Number.isFinite(fact.position.x) || !Number.isFinite(fact.position.z)) continue;
        const label = fact.kind === RESIDENT_FACT_KIND.VEHICLE
            ? (VEHICLE_NAMES[fact.vehicleType] || null)
            : sanitizeSpokenText(fact.title, MAX_SPOKEN_TITLE_LENGTH);
        if (!label) continue;
        targets.push({ kind: fact.kind, label, position: { x: fact.position.x, z: fact.position.z } });
    }
    return targets;
}

// How long what a resident said stays up (its bubble, and the Focus buttons
// beside it): long enough to read at an easy pace, between
// SPEECH_MIN_SECONDS and SPEECH_MAX_SECONDS.
export const SPEECH_MIN_SECONDS = 5;
export const SPEECH_MAX_SECONDS = 14;
const SPEECH_SECONDS_PER_WORD = 0.4;

export function speechSecondsFor(remarks) {
    const words = (remarks || []).join(' ').split(/\s+/).filter(Boolean).length;
    return Math.min(SPEECH_MAX_SECONDS, Math.max(SPEECH_MIN_SECONDS, 2 + words * SPEECH_SECONDS_PER_WORD));
}
