import { RegionKind } from './RegionKind.js';

// 0.5.1 — World Maps & Geographic Navigation.
//
// A pure, derived PRESENTATION layer answering "given a window onto the
// World's ground plane, where does this position/region draw on a flat
// 2D map?" Exactly the same "derived, never stored" discipline every
// other core/World*.js reading module already holds — see
// core/WorldSpatialContext.js and core/WorldRegionGeography.js's own
// headers. This module never touches a Document, a Command, Vue, or
// Three.js: it is arithmetic only, on plain { x, z } numbers, so the
// SAME projection can back a full-screen map panel, a minimap, or a
// thumbnail without a second implementation — see
// ui/components/WorldMapPanel.js, the one renderer built on top of it
// today, and docs/Principles.md, "A World Map Is A Derived View, Never
// A Second World (0.5.1)."
//
// A map is never another representation of World CONTENT — it reads
// exactly the regions/landmarks/structures/collaborators that already
// exist (see application/WorldNavigationSession.js#getMapContent()) and
// projects them. Nothing here invents geography, and nothing a viewer
// does to the map (panning, zooming) ever reaches the World or even the
// 3D camera — see WorldMapPanel's own header.
//
// A WorldMapViewport is a SQUARE window onto the ground plane: `span`
// meters of World space, centered at (centerX, centerZ), drawn across
// `width` x `height` map units (pixels, SVG units — this module has no
// opinion). `scale` is uniform (min(width, height) / span) rather than
// separate X/Y scales, so a circular WorldRegion always projects as a
// circle, never an ellipse, regardless of the viewport's own aspect
// ratio. North (+Z — exactly core/CompassHeading.js's own "0° faces
// +Z" convention, the same fixed reference direction, not a real-world
// bearing) is drawn UP, meaning increasing Z maps to DECREASING map Y.
export function createMapViewport({ centerX = 0, centerZ = 0, span, width, height } = {}) {
    if (!Number.isFinite(span) || span <= 0) {
        throw new Error('createMapViewport requires a positive, finite span');
    }
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        throw new Error('createMapViewport requires a positive, finite width and height');
    }
    const scale = Math.min(width, height) / span;
    return Object.freeze({ centerX, centerZ, span, width, height, scale });
}

// World (x, z) → map (x, y), plus whether that point falls within the
// viewport's own width/height rectangle. `visible` is a plain rectangle
// test, never clipped to a margin or a circle — a caller decides what
// "off map" means to it (skip rendering, clamp to the edge, etc.).
export function projectPosition(position, viewport) {
    const x = (position.x - viewport.centerX) * viewport.scale + viewport.width / 2;
    const y = viewport.height / 2 - (position.z - viewport.centerZ) * viewport.scale;
    const visible = x >= 0 && x <= viewport.width && y >= 0 && y <= viewport.height;
    return { x, y, visible };
}

// The inverse of projectPosition() above: a clicked/dragged map point →
// the World (x, z) it corresponds to. Y is never resolved here (see
// core/WorldRegion.js's own header on Y being terrain-derived at render
// time) — a caller that needs a full ground position resolves Y itself.
export function unprojectPoint(mapX, mapY, viewport) {
    return {
        x: viewport.centerX + (mapX - viewport.width / 2) / viewport.scale,
        z: viewport.centerZ - (mapY - viewport.height / 2) / viewport.scale
    };
}

// A WorldRegion's own circle, projected: the SAME center projection as
// projectPosition() above, plus a map-space radius scaled by the
// viewport's own uniform `scale` — a region drawn at twice the zoom is
// drawn at twice the radius, always, never independently derived.
// `visible` uses a circle-vs-rectangle test rather than
// projectPosition()'s point-in-rect test, since a large region's own
// CENTER can sit outside the current viewport while its edge still
// crosses into it.
export function projectRegion(region, viewport) {
    const { x, y } = projectPosition(region.position, viewport);
    const radius = region.radius * viewport.scale;
    const visible = x + radius >= 0 && x - radius <= viewport.width
        && y + radius >= 0 && y - radius <= viewport.height;
    return { x, y, radius, visible };
}

// A purely PRESENTATIONAL tier for a region's `kind` (core/RegionKind.js)
// — never a behavior, never consulted by any geometry or authorization
// in this codebase. 1 (broadest/most prominent — CONTINENT/COUNTRY)
// through 4 (most local/smallest — PLACE and anything unrecognized),
// letting a map give a CONTINENT a larger label than a NEIGHBORHOOD
// without either of them having a different actual radius rule. See
// core/RegionKind.js's own header: "just labels only, never behavior."
const PRESENTATION_TIER = Object.freeze({
    [RegionKind.CONTINENT]: 1,
    [RegionKind.COUNTRY]: 1,
    [RegionKind.REGION]: 2,
    [RegionKind.CITY]: 2,
    [RegionKind.TOWN]: 2,
    [RegionKind.VILLAGE]: 3,
    [RegionKind.DISTRICT]: 3,
    [RegionKind.NEIGHBORHOOD]: 3,
    [RegionKind.PLACE]: 4
});

export function regionPresentationTier(kind) {
    return PRESENTATION_TIER[kind] || 4;
}

// The narrowest/widest span (in meters) a map viewport may ever be
// asked to show — shared between suggestMapExtent()'s own clamp below
// and ui/components/WorldMapPanel.js's zoom in/out buttons, so "as far
// as the zoom control will go" and "as far as an auto-fit will ever
// pick" are always the exact same bound, never two numbers that happen
// to agree today.
export const MIN_MAP_SPAN = 40;
export const MAX_MAP_SPAN = 8000;

const DEFAULT_EXTENT_PADDING = 1.3;

// A sensible STARTING viewport for a set of map points: centered on the
// viewer (or the World origin, if there is no viewer position yet),
// with a span wide enough to fit every point with `padding` headroom,
// clamped to [MIN_MAP_SPAN, MAX_MAP_SPAN] so a World with a single
// nearby landmark doesn't zoom in to a meaningless few meters, and a
// sprawling one doesn't open already needing to be panned before
// anything is visible. Presentation only — never persisted, recomputed
// fresh every time a map is opened; panning/zooming afterward is
// entirely local viewer state (see WorldMapPanel's own header).
export function suggestMapExtent(viewerPosition, points = [], { padding = DEFAULT_EXTENT_PADDING } = {}) {
    const centerX = viewerPosition ? viewerPosition.x : 0;
    const centerZ = viewerPosition ? viewerPosition.z : 0;
    let farthest = 0;
    for (const point of points) {
        if (!point) {
            continue;
        }
        const dx = point.x - centerX;
        const dz = point.z - centerZ;
        farthest = Math.max(farthest, Math.sqrt(dx * dx + dz * dz));
    }
    const span = Math.min(MAX_MAP_SPAN, Math.max(MIN_MAP_SPAN, farthest * 2 * padding));
    return { centerX, centerZ, span };
}
