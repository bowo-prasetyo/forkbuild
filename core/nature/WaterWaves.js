// How the surface of standing water moves: a slow swell on the sea and small
// ripples on a lake, as a pure function of world (x, z), time and how much
// the water there is sea (core/nature/Hydrology.js#seaShareAt(), 0 on a lake, 1
// out at sea, in between across the shelf, so a coast never shows a seam in
// the motion any more than in the colour).
//
// Each wave is one travelling sine: a direction, a wavelength and a height.
// Its speed is not chosen but follows from its wavelength the way deep-water
// waves do (c = sqrt(g * wavelength / 2π), scaled by WAVE_PACE), so long
// swells roll by faster than short ripples, as on real water.
//
// Two kinds, because the water tiles' grid (renderer/WaterTileMesh.js) has a
// vertex only every few world units and could not hold anything shorter:
//
//   SWELL   long waves that lift and drop the surface itself — the mesh's
//           vertices move, and their normals tilt with the slope.
//   RIPPLE  short waves that only tilt the light (a per-pixel normal), so
//           the surface glints without its shape needing a finer grid.
//
// Purely visual. Swimming, boats, fish and the underwater view all keep the
// one flat LAKE_SURFACE_HEIGHT; the swell is kept low enough
// (MAX_SWELL_HEIGHT) that the difference never shows as an avatar floating
// above the water or a boat sunk into it. The renderer draws these same
// waves in a shader, built from the constants below, so what is tested
// here is what is drawn.

export const WAVE_KIND = Object.freeze({
    SWELL: 'SWELL',
    RIPPLE: 'RIPPLE'
});

const GRAVITY = 9.8;
// Slows every wave alike: the world's units are larger than a metre, and at
// full deep-water speed the sea read as stormy.
export const WAVE_PACE = 0.45;

function wave(kind, directionDegrees, wavelength, amplitude, phase) {
    const radians = directionDegrees * Math.PI / 180;
    return Object.freeze({
        kind,
        directionX: Math.cos(radians),
        directionZ: Math.sin(radians),
        wavelength,
        amplitude,
        phase
    });
}

// A lake: barely any swell, a fine wind ripple. Directions and wavelengths
// are deliberately uneven, so the crossing ripples never line up into a
// regular grid.
export const LAKE_WAVES = Object.freeze([
    wave(WAVE_KIND.SWELL, 20, 17, 0.025, 0.0),
    wave(WAVE_KIND.RIPPLE, 35, 2.3, 0.02, 1.3),
    wave(WAVE_KIND.RIPPLE, -47, 1.7, 0.015, 4.1),
    wave(WAVE_KIND.RIPPLE, 101, 1.25, 0.01, 2.7),
    wave(WAVE_KIND.RIPPLE, 163, 3.7, 0.02, 5.9)
]);

// The sea: a long swell rolling in from one quarter, a shorter cross swell,
// and a choppier ripple than a lake's.
export const SEA_WAVES = Object.freeze([
    wave(WAVE_KIND.SWELL, 15, 28, 0.11, 0.0),
    wave(WAVE_KIND.SWELL, 55, 17, 0.06, 2.1),
    wave(WAVE_KIND.SWELL, -25, 13, 0.03, 4.4),
    wave(WAVE_KIND.RIPPLE, 28, 3.3, 0.035, 0.7),
    wave(WAVE_KIND.RIPPLE, -53, 2.2, 0.025, 3.3),
    wave(WAVE_KIND.RIPPLE, 79, 1.45, 0.015, 5.2),
    wave(WAVE_KIND.RIPPLE, 141, 4.7, 0.03, 1.9)
]);

function swellHeightLimit(waves) {
    return waves
        .filter((w) => w.kind === WAVE_KIND.SWELL)
        .reduce((sum, w) => sum + w.amplitude, 0);
}

// The furthest the surface ever rises above (or sinks below) its still
// level, anywhere: every swell crest lined up at once.
export const MAX_SWELL_HEIGHT = Math.max(swellHeightLimit(LAKE_WAVES), swellHeightLimit(SEA_WAVES));

export function waveNumber(w) {
    return 2 * Math.PI / w.wavelength;
}

// Radians per second: ω = k * c, with c the deep-water speed for this
// wavelength.
export function waveAngularSpeed(w) {
    const k = waveNumber(w);
    return Math.sqrt(GRAVITY * k) * WAVE_PACE;
}

function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

// The surface at (x, z) at `time` seconds, from the waves of one `kind`:
// `height` above the still level and the surface's slope along x and z
// (d height / dx, d height / dz), from which a normal follows as
// normalize(-slopeX, 1, -slopeZ).
export function waterWaveAt(seaShare, x, z, time, kind = WAVE_KIND.SWELL) {
    const sea = clamp01(seaShare);
    let height = 0;
    let slopeX = 0;
    let slopeZ = 0;
    const add = (waves, weight) => {
        if (weight === 0) return;
        for (const w of waves) {
            if (w.kind !== kind) continue;
            const k = waveNumber(w);
            const angle = k * (w.directionX * x + w.directionZ * z) - waveAngularSpeed(w) * time + w.phase;
            const a = w.amplitude * weight;
            height += a * Math.sin(angle);
            const slope = a * k * Math.cos(angle);
            slopeX += slope * w.directionX;
            slopeZ += slope * w.directionZ;
        }
    };
    add(LAKE_WAVES, 1 - sea);
    add(SEA_WAVES, sea);
    return { height, slopeX, slopeZ };
}
