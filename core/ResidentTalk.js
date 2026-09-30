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
//
// Every remark is a message (core/Message.js), not an English sentence: the
// caller turns it into the viewer's language (setResidentSpeechTranslator()
// in application/worldNavigation/residentMethods.js) before the renderer
// draws it. A title or name is a parameter and is never translated.
import { message } from './Message.js';

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
export const QUIET_REMARK = message('resident.quiet');

// Compass sectors a direction can be given in, and each one's "{distance}
// to the north" message, so a language can word each one its own way.
const WHERE_KEYS = Object.freeze({
    N: 'resident.where.north', NE: 'resident.where.northEast', E: 'resident.where.east', SE: 'resident.where.southEast',
    S: 'resident.where.south', SW: 'resident.where.southWest', W: 'resident.where.west', NW: 'resident.where.northWest'
});

// Vehicles and animals a resident can mention: each has a whole-sentence
// message ("There's a bicycle {where}.") and a name for a Focus button, so a
// language can make the article and sentence agree with the thing.
const VEHICLE_TYPES = Object.freeze(['bicycle', 'motorcycle', 'car', 'drone']);
const ANIMAL_SPECIES = Object.freeze({ DEER: 'deer', RABBIT: 'rabbit' });

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
// few steps" — never falsely precise. A message; the number is a parameter,
// so it is written the viewer's way ("3,2 km").
export function describeDistance(meters) {
    if (!Number.isFinite(meters) || meters < A_FEW_STEPS) return message('resident.distance.fewSteps');
    if (meters < 100) return message('resident.distance.meters', { meters: Math.round(meters / 10) * 10 });
    if (meters < 950) return message('resident.distance.meters', { meters: Math.round(meters / 50) * 50 });
    const km = meters / 1000;
    if (km < 9.95) return message('resident.distance.kilometers', { kilometers: Math.round(km * 10) / 10 });
    return message('resident.distance.kilometers', { kilometers: Math.round(km) });
}

// "about 80 m to the east", "about 80 m away" (no direction known), or
// "just a few steps away".
function where(fact) {
    if (!(fact.distance >= A_FEW_STEPS)) return message('resident.where.fewSteps');
    const distance = describeDistance(fact.distance);
    return Object.hasOwn(WHERE_KEYS, fact.direction)
        ? message(WHERE_KEYS[fact.direction], { distance })
        : message('resident.where.away', { distance });
}

// One fact as one sentence (a message), or null when it has nothing
// speakable.
export function phraseFact(fact) {
    if (!fact) return null;
    switch (fact.kind) {
    case RESIDENT_FACT_KIND.VEHICLE:
        return VEHICLE_TYPES.includes(fact.vehicleType)
            ? message(`resident.vehicleNearby.${fact.vehicleType}`, { where: where(fact) })
            : null;
    case RESIDENT_FACT_KIND.ANIMAL: {
        const species = ANIMAL_SPECIES[fact.species];
        return species ? message(`resident.animalNearby.${species}`, { where: where(fact) }) : null;
    }
    case RESIDENT_FACT_KIND.LANDMARK: {
        const title = sanitizeSpokenText(fact.title, MAX_SPOKEN_TITLE_LENGTH);
        return title ? message('resident.landmark', { title, where: where(fact) }) : null;
    }
    case RESIDENT_FACT_KIND.PERSON: {
        const name = sanitizeSpokenText(fact.displayName, MAX_SPOKEN_NAME_LENGTH);
        return name ? message('resident.person', { name, where: where(fact) }) : null;
    }
    case RESIDENT_FACT_KIND.BUILD: {
        const title = sanitizeSpokenText(fact.title, MAX_SPOKEN_TITLE_LENGTH);
        if (!title) return null;
        const author = sanitizeSpokenText(fact.author, MAX_SPOKEN_NAME_LENGTH);
        return author
            ? message('resident.buildBy', { title, author, where: where(fact) })
            : message('resident.build', { title, where: where(fact) });
    }
    case RESIDENT_FACT_KIND.STRUCTURE: {
        const title = sanitizeSpokenText(fact.title, MAX_SPOKEN_TITLE_LENGTH);
        if (!title) return null;
        const author = sanitizeSpokenText(fact.author, MAX_SPOKEN_NAME_LENGTH);
        return author
            ? message('resident.structureBy', { title, author, where: where(fact) })
            : message('resident.structure', { title, where: where(fact) });
    }
    case RESIDENT_FACT_KIND.PLACE: {
        const name = sanitizeSpokenText(fact.name, MAX_SPOKEN_TITLE_LENGTH);
        return name ? message('resident.place', { name }) : null;
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
// (pickResidentRemarkFacts()) as messages, or QUIET_REMARK when there is
// nothing to say.
export function composeResidentRemarks(facts, { turn = 0 } = {}) {
    const remarks = pickResidentRemarkFacts(facts, { turn }).map(phraseFact);
    return remarks.length > 0 ? remarks : [QUIET_REMARK];
}

// What the viewer may choose to look at after hearing about `facts` (as
// picked): one { kind, label, position } per mentioned thing that stays put
// (FOCUSABLE_FACT_KINDS) and has a position. `label` is for a Focus button:
// the title as spoken (plain text), or the vehicle's name (a message).
export function focusTargetsFor(facts) {
    const targets = [];
    for (const fact of facts || []) {
        if (!FOCUSABLE_FACT_KINDS.includes(fact.kind) || !fact.position) continue;
        if (!Number.isFinite(fact.position.x) || !Number.isFinite(fact.position.z)) continue;
        const label = fact.kind === RESIDENT_FACT_KIND.VEHICLE
            ? (VEHICLE_TYPES.includes(fact.vehicleType) ? message(`resident.vehicleName.${fact.vehicleType}`) : null)
            : sanitizeSpokenText(fact.title, MAX_SPOKEN_TITLE_LENGTH);
        if (!label) continue;
        targets.push({ kind: fact.kind, label, position: { x: fact.position.x, z: fact.position.z } });
    }
    return targets;
}

// How long what a resident said stays up (its bubble, and the Focus buttons
// beside it): long enough to read at an easy pace, between
// SPEECH_MIN_SECONDS and SPEECH_MAX_SECONDS. `remarks` are the words as
// shown, in whatever language they were translated into.
export const SPEECH_MIN_SECONDS = 5;
export const SPEECH_MAX_SECONDS = 14;
const SPEECH_SECONDS_PER_WORD = 0.4;

export function speechSecondsFor(remarks) {
    const words = (remarks || []).join(' ').split(/\s+/).filter(Boolean).length;
    return Math.min(SPEECH_MAX_SECONDS, Math.max(SPEECH_MIN_SECONDS, 2 + words * SPEECH_SECONDS_PER_WORD));
}
