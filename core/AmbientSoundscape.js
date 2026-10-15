// What the World sounds like where the listener stands: a level from 0 to 1
// for each ambient layer, derived from the same terrain functions that draw
// the land and its trees, so a place always sounds the same and nothing is
// stored.
import { ecologyZoneAt, ECOLOGY_ZONE } from './TerrainEcology.js';
import { isRiverAt } from './Hydrology.js';
import { riverSpringAt } from './RiverFlow.js';
import { naturalFeaturesInRegion, TREE_SPECIES } from './NaturalFeatureField.js';

export const AMBIENT_LAYER = Object.freeze({
    WIND: 'wind',
    BIRDS: 'birds',
    INSECTS: 'insects',
    WATER: 'water',
    STREAM: 'stream',
    // Leaves rustling in broadleaf trees and scrub, and wind sighing through
    // conifers, from the trees actually standing around the listener.
    LEAVES: 'leaves',
    PINES: 'pines',
    // A spring bubbling up where a river rises (core/RiverFlow.js), heard
    // only close by.
    SPRING: 'spring',
    // Rain falling (core/Weather.js): the same wherever the listener stands,
    // set by ambientMixInRain(), never by the place.
    RAIN: 'rain',
    // Rain drumming on the roof over the listener's head, under shelter.
    ROOF: 'roof'
});

// A spring is heard within this distance of its centre, loudest at it.
const SPRING_EARSHOT = 16;
// Where around the listener a spring is looked for: the spot underfoot and
// two rings, near enough to find any pool a spring is heard from.
const SPRING_SAMPLES = Object.freeze([
    [0, 0],
    ...[6, 12].flatMap((radius) => Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    }))
]);

// Trees within this distance are heard, the nearest loudest.
const TREE_EARSHOT = 20;
// This much nearness-weighted tree (a few close trees, or a forest around
// you) is a full layer.
const TREES_FOR_FULL_LAYER = 6;
// A scrub bush rustles less than a broadleaf tree.
const TREE_RUSTLE = Object.freeze({
    [TREE_SPECIES.BROADLEAF]: { leaves: 1 },
    [TREE_SPECIES.SCRUB]: { leaves: 0.4 },
    [TREE_SPECIES.CONIFER]: { pines: 1 }
});

export const AMBIENT_LAYERS = Object.freeze(Object.values(AMBIENT_LAYER));

// Each zone's contribution to each layer. Open, high ground is windy; trees
// shelter from wind and hold birds; fields and grass hum with insects; lakes
// lap, and more faintly at a beach. Unlisted layers are 0.
const ZONE_LEVELS = Object.freeze({
    [ECOLOGY_ZONE.WATER]: { wind: 0.45, water: 1 },
    [ECOLOGY_ZONE.BEACH]: { wind: 0.5, birds: 0.1, water: 0.3 },
    [ECOLOGY_ZONE.ROCK]: { wind: 1 },
    [ECOLOGY_ZONE.HIGHLAND]: { wind: 0.8, birds: 0.15, insects: 0.1 },
    [ECOLOGY_ZONE.FOREST]: { wind: 0.2, birds: 1, insects: 0.2 },
    [ECOLOGY_ZONE.FIELD]: { wind: 0.35, birds: 0.3, insects: 0.8 },
    [ECOLOGY_ZONE.GRASSLAND]: { wind: 0.35, birds: 0.45, insects: 0.6 }
});

// The spot underfoot counts most, then a near ring, then a far ring, so a
// lake or forest is heard before it is reached and fades in as you approach.
const RINGS = Object.freeze([
    { radius: 0, samples: 1, weight: 0.4 },
    { radius: 12, samples: 8, weight: 0.4 },
    { radius: 30, samples: 8, weight: 0.2 }
]);

export function silentAmbientMix() {
    return Object.fromEntries(AMBIENT_LAYERS.map((layer) => [layer, 0]));
}

export function ambientMixAt(seed, x, z) {
    const mix = silentAmbientMix();
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
        return mix;
    }
    for (const ring of RINGS) {
        const sampleWeight = ring.weight / ring.samples;
        for (let i = 0; i < ring.samples; i++) {
            const angle = (i / ring.samples) * Math.PI * 2;
            const sx = x + Math.cos(angle) * ring.radius;
            const sz = z + Math.sin(angle) * ring.radius;
            const levels = ZONE_LEVELS[ecologyZoneAt(seed, sx, sz)] || {};
            for (const layer of AMBIENT_LAYERS) {
                mix[layer] += (levels[layer] || 0) * sampleWeight;
            }
            if (isRiverAt(seed, sx, sz)) {
                mix[AMBIENT_LAYER.STREAM] += sampleWeight;
            }
        }
    }
    mix[AMBIENT_LAYER.SPRING] = springLevelAt(seed, x, z);
    const trees = naturalFeaturesInRegion(seed, x - TREE_EARSHOT, z - TREE_EARSHOT, x + TREE_EARSHOT, z + TREE_EARSHOT);
    for (const tree of trees) {
        const nearness = 1 - Math.hypot(tree.x - x, tree.z - z) / TREE_EARSHOT;
        if (nearness <= 0) continue;
        const rustle = TREE_RUSTLE[tree.species] || {};
        mix[AMBIENT_LAYER.LEAVES] += ((rustle.leaves || 0) * nearness) / TREES_FOR_FULL_LAYER;
        mix[AMBIENT_LAYER.PINES] += ((rustle.pines || 0) * nearness) / TREES_FOR_FULL_LAYER;
    }
    for (const layer of AMBIENT_LAYERS) {
        mix[layer] = Math.min(1, Math.max(0, mix[layer]));
    }
    return mix;
}

// How loudly a spring bubbles at (x, z): its strength, falling away with
// distance from its centre; the loudest spring heard wins.
function springLevelAt(seed, x, z) {
    let level = 0;
    for (const [dx, dz] of SPRING_SAMPLES) {
        const spring = riverSpringAt(seed, x + dx, z + dz);
        if (!spring) continue;
        const nearness = 1 - Math.hypot(spring.centreX - x, spring.centreZ - z) / SPRING_EARSHOT;
        if (nearness > 0) level = Math.max(level, spring.strength * nearness);
    }
    return level;
}

// The same mix after dark (core/DayCycle.js): `nightLevel` from 0 (day) to 1
// (night). Birds fall nearly silent and crickets take over, on land more than
// over open water.
export function ambientMixAtNight(mix, nightLevel) {
    const night = Number.isFinite(nightLevel) ? Math.min(Math.max(nightLevel, 0), 1) : 0;
    if (night === 0) {
        return mix;
    }
    const next = { ...mix };
    next[AMBIENT_LAYER.BIRDS] = mix[AMBIENT_LAYER.BIRDS] * (1 - 0.9 * night);
    next[AMBIENT_LAYER.INSECTS] = Math.min(1,
        mix[AMBIENT_LAYER.INSECTS] * (1 + night) + 0.3 * night * (1 - mix[AMBIENT_LAYER.WATER]));
    return next;
}

// The same mix in the rain (core/Weather.js): `rain` from 0 (dry) to 1 (a
// downpour) is heard as it falls, and birds and insects mostly fall quiet.
// `sheltered` under a roof, it drums on the roof instead, and the rain
// outside is heard only faintly, through the walls.
const RAIN_THROUGH_WALLS = 0.3;

export function ambientMixInRain(mix, rain, sheltered = false) {
    const wet = Number.isFinite(rain) ? Math.min(Math.max(rain, 0), 1) : 0;
    if (wet === 0) {
        return mix;
    }
    const next = { ...mix };
    next[AMBIENT_LAYER.RAIN] = sheltered ? wet * RAIN_THROUGH_WALLS : wet;
    next[AMBIENT_LAYER.ROOF] = sheltered ? wet : 0;
    next[AMBIENT_LAYER.BIRDS] = mix[AMBIENT_LAYER.BIRDS] * (1 - 0.85 * wet);
    next[AMBIENT_LAYER.INSECTS] = mix[AMBIENT_LAYER.INSECTS] * (1 - 0.8 * wet);
    return next;
}
