// What a brick's surface is made of, for how it is drawn: masonry courses,
// smooth plaster, wood grain, roof tiles, glass, leaves, rough stone, or
// plain. The look round the 3D view is a small, sunny, hand-built village
// (docs/Pillars.md, "Look"); a brick reads as made of something rather than
// as a flat-coloured box. Drawing only: the brick's colour still tints it,
// and nothing here is stored, signed or sent.
export const BrickSurface = Object.freeze({
    MASONRY: 'masonry',
    PLASTER: 'plaster',
    WOOD: 'wood',
    TILE: 'tile',
    GLASS: 'glass',
    FOLIAGE: 'foliage',
    STONE: 'stone',
    PLAIN: 'plain'
});

const SURFACES = new Map([
    // Laid in courses: bricks, arches, steps and hearths. (The plain blocks
    // are read by their colour: see GENERIC_BLOCKS.)
    ...['core:brick_1x2', 'core:brick_1x4',
        'core:arch', 'core:arch_small', 'core:chimney', 'core:hearth', 'core:pillar', 'core:column',
        'core:stair', 'core:stair_wide'].map((id) => [id, BrickSurface.MASONRY]),
    // Walls are a house's skin: rendered smooth.
    ...['core:wall_1x1', 'core:wall_1x3', 'core:wall_2x3', 'core:wall_half_2x1'].map((id) => [id, BrickSurface.PLASTER]),
    ...['core:beam', 'core:beam_short', 'core:post', 'core:log', 'core:brace_2x2', 'core:trim', 'core:fence',
        'core:bench', 'core:table', 'core:bed', 'core:shelf', 'core:ladder', 'core:door', 'core:door_double',
        'core:shutter', 'core:barrel', 'core:window_frame'].map((id) => [id, BrickSurface.WOOD]),
    // Roofs, and the slopes most often laid as one.
    ...['core:roof_hip', 'core:roof_gable', 'core:roof_cone', 'core:roof_ridge', 'core:roof_hip_4x4',
        'core:roof_hip_4x6', 'core:roof_hip_6x6', 'core:roof_gable_2x4', 'core:slope_45', 'core:slope_shallow',
        'core:slope_inverted'].map((id) => [id, BrickSurface.TILE]),
    ...['core:window_small', 'core:window_large', 'core:window_round'].map((id) => [id, BrickSurface.GLASS]),
    ...['core:bush', 'core:pine_tree', 'core:lawn_2x2'].map((id) => [id, BrickSurface.FOLIAGE]),
    ['core:rock', BrickSurface.STONE]
]);

// Blocks a builder uses for anything, read by their colour: the village's
// grass and leaf greens (core/building/VillagePalette.js) are grass, pale sand and
// plaster colours are smooth, dark brown is timber, and the rest (the cube's
// own mint green included) is laid in courses. The island's lawn and beach
// are cubes too.
const GENERIC_BLOCKS = new Set(['core:cube', 'core:cube_half', 'core:block_2x2', 'core:slab_4x4']);

// The surface a brick of this definition (and colour, 0xRRGGBB) is drawn
// with; plain for anything not listed (plates, round bricks, the lantern, a
// community library's bricks).
export function brickSurfaceOf(definitionId, color = null) {
    if (GENERIC_BLOCKS.has(definitionId)) return surfaceOfColour(color);
    return SURFACES.get(definitionId) || BrickSurface.PLAIN;
}

function surfaceOfColour(color) {
    if (!Number.isInteger(color)) return BrickSurface.MASONRY;
    const r = ((color >> 16) & 0xff) / 255;
    const g = ((color >> 8) & 0xff) / 255;
    const b = (color & 0xff) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lightness = (max + min) / 2;
    const chroma = max - min;
    if (chroma < 0.08) return BrickSurface.MASONRY;
    let hue;
    if (max === r) hue = 60 * (((g - b) / chroma) % 6);
    else if (max === g) hue = 60 * ((b - r) / chroma + 2);
    else hue = 60 * ((r - g) / chroma + 4);
    if (hue < 0) hue += 360;
    if (hue >= 70 && hue <= 135) return BrickSurface.FOLIAGE;
    if (hue >= 15 && hue < 45 && lightness < 0.4) return BrickSurface.WOOD;
    if (hue >= 30 && hue < 70 && lightness >= 0.6) return BrickSurface.PLASTER;
    return BrickSurface.MASONRY;
}

// How rough each surface is to light (MeshStandardMaterial#roughness): glass
// catches a highlight, rough stone none.
export const SURFACE_ROUGHNESS = Object.freeze({
    masonry: 0.95,
    plaster: 0.9,
    wood: 0.8,
    tile: 0.7,
    glass: 0.25,
    foliage: 0.95,
    stone: 1,
    plain: 0.85
});
