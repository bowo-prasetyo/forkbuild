// This device's sound preference: whether World View plays sound and how
// loud. Read leniently, so a damaged or older stored value falls back to the
// default rather than breaking World View.
export const DEFAULT_SOUND_VOLUME = 0.5;

export function normalizeSoundSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    const volume = Number.isFinite(source.volume)
        ? Math.min(1, Math.max(0, source.volume))
        : DEFAULT_SOUND_VOLUME;
    return Object.freeze({ muted: source.muted === true, volume });
}

export const DEFAULT_SOUND_SETTINGS = normalizeSoundSettings({});
