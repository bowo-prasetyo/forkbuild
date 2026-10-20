import { hydrologyFeatureAt, HYDROLOGY_FEATURE, LAKE_SURFACE_HEIGHT } from './Hydrology.js';

// Whether a camera at `position` (world units) looks out from under the water,
// and which water: the renderer tints and fogs the view accordingly. A river is
// ground color only, so it never counts.
export const UNDERWATER_VIEW = Object.freeze({
    NONE: 'none',
    LAKE: 'lake',
    SEA: 'sea'
});

export function underwaterViewAt(seed, position) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) {
        return UNDERWATER_VIEW.NONE;
    }
    if (position.y >= LAKE_SURFACE_HEIGHT) {
        return UNDERWATER_VIEW.NONE;
    }
    const feature = hydrologyFeatureAt(seed, position.x, position.z);
    if (feature === HYDROLOGY_FEATURE.SEA) return UNDERWATER_VIEW.SEA;
    if (feature === HYDROLOGY_FEATURE.LAKE) return UNDERWATER_VIEW.LAKE;
    return UNDERWATER_VIEW.NONE;
}
