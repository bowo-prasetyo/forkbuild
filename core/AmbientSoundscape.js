// What the World sounds like where the listener stands: a level from 0 to 1
// for each ambient layer, derived from the same terrain functions that draw
// the land, so a place always sounds the same and nothing is stored.
import { ecologyZoneAt, ECOLOGY_ZONE } from './TerrainEcology.js';
import { isRiverAt } from './Hydrology.js';

export const AMBIENT_LAYER = Object.freeze({
    WIND: 'wind',
    BIRDS: 'birds',
    INSECTS: 'insects',
    WATER: 'water',
    STREAM: 'stream'
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
    for (const layer of AMBIENT_LAYERS) {
        mix[layer] = Math.min(1, Math.max(0, mix[layer]));
    }
    return mix;
}
