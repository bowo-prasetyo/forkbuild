// This device's sound preference: whether sound plays, how loud, and whether
// World View places sounds in 3D (`spatial`) or only left and right, and
// whether music plays under the sounds (`music`). Read
// leniently, so a damaged or older stored value falls back to the default
// rather than breaking World View; one saved before 3D or music existed reads as 3D, with music.
export const DEFAULT_SOUND_VOLUME = 0.5;

export function normalizeSoundSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    const volume = Number.isFinite(source.volume)
        ? Math.min(1, Math.max(0, source.volume))
        : DEFAULT_SOUND_VOLUME;
    return Object.freeze({ muted: source.muted === true, volume, spatial: source.spatial !== false, music: source.music !== false });
}

export const DEFAULT_SOUND_SETTINGS = normalizeSoundSettings({});
