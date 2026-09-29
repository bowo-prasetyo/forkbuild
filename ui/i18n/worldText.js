// World View words that core/ keeps as ids: compass directions ("NE"), region
// kinds ("village") and what a collaborator is doing ("building"). core/ uses
// them as values, so they are translated here, where they reach the screen.
// A value without a message (one a newer client sent) is shown as it came.
import { WorldSpatialActivity } from '../../core/WorldSpatialActivity.js';
import { hasMessage, t } from './i18n.js';

function textFor(key, fallback) {
    return hasMessage(key) ? t(key) : fallback;
}

// The derived reading of where the camera is, e.g. "Forest · lake · near
// House": the same parts core/WorldSpatialContext.js#description joins, in
// the chosen language.
export function spatialContextDescription(context) {
    if (!context) {
        return '';
    }
    const parts = [];
    if (context.terrainZone) {
        parts.push(textFor(`terrainZone.${context.terrainZone.toLowerCase()}`, context.terrainZone));
    }
    if (context.hydrologyFeature === 'LAKE' || context.hydrologyFeature === 'RIVER') {
        parts.push(t(`hydrologyFeature.${context.hydrologyFeature.toLowerCase()}`));
    }
    const nearest = (context.nearbyStructures || [])[0];
    if (nearest && nearest.distance < 50) {
        parts.push(t('worldSpatialContext.nearStructure', { title: nearest.title }));
    }
    return parts.join(' · ');
}

// "N", "NE" … "NW", the abbreviations the chosen language uses.
export function compassText(direction) {
    return typeof direction === 'string' && direction ? textFor(`compass.${direction.toLowerCase()}`, direction) : direction;
}

export function regionKindText(kind) {
    return typeof kind === 'string' && kind ? textFor(`regionKind.${kind}`, kind) : kind;
}

const ACTIVITY_KEYS = {
    [WorldSpatialActivity.BUILDING]: 'building',
    [WorldSpatialActivity.MOVING_STRUCTURE]: 'movingStructure',
    [WorldSpatialActivity.ROTATING_STRUCTURE]: 'rotatingStructure',
    [WorldSpatialActivity.INSPECTING]: 'inspecting',
    [WorldSpatialActivity.WALKING]: 'walking'
};

// The words core/WorldSpatialAnchor.js#describeSpatialActivity() uses for
// the 3D marker, in the chosen language: "Building", or "Building House"
// when what they are working on is known. Walking never names a target,
// and anything else reads "Here".
export function spatialActivityText(activity, contextualLabel = null) {
    const key = ACTIVITY_KEYS[activity];
    if (!key) {
        return t('spatialActivity.idle');
    }
    const target = typeof contextualLabel === 'string' && contextualLabel.length > 0 ? contextualLabel : null;
    return target && activity !== WorldSpatialActivity.WALKING
        ? t(`spatialActivity.${key}.target`, { target })
        : t(`spatialActivity.${key}`);
}
