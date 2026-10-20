// This device's choice of look (docs/Pillars.md, "Look"): the village by day
// (light), after dark (dark), or whichever the device is set to (auto, the
// default). Read leniently, so a damaged value follows the device.
export const LOOK = Object.freeze({
    AUTO: 'auto',
    LIGHT: 'light',
    DARK: 'dark'
});

export const LOOKS = Object.freeze(Object.values(LOOK));

export function normalizeLookSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.freeze({ look: LOOKS.includes(source.look) ? source.look : LOOK.AUTO });
}

export const DEFAULT_LOOK_SETTINGS = normalizeLookSettings({});
