// What shines after dark in World View (core/DayCycle.js): a brick type's
// BrickDefinition#nightGlow says whether its bricks do, and in what light.
// A lantern shines in its own color; a window glows with lamplight from
// inside, whatever color its glass is.

export const NIGHT_GLOW = Object.freeze({
    OWN_COLOR: 'own-color',
    WINDOW: 'window'
});

export const WINDOW_LIGHT = 0xffc46b;

// The light a brick of `definition`, colored `color` (0xRRGGBB), gives off
// at full night, or 0 when it gives off none.
export function nightGlowColor(definition, color) {
    switch (definition ? definition.nightGlow : null) {
        case NIGHT_GLOW.OWN_COLOR:
            return Number.isInteger(color) ? color : definition.color;
        case NIGHT_GLOW.WINDOW:
            return WINDOW_LIGHT;
        default:
            return 0;
    }
}
