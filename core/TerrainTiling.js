// Pure tile-grid math for streaming terrain around a moving camera — see
// docs/Roadmap.md, 0.2.76. Deliberately its own small module, separate
// from core/SpatialCell.js: SpatialCell answers a DIFFERENT question
// (which 100-unit discovery bucket does a PlacementRecord fall into, for
// the decentralized spatial index) at a different, larger scale. Terrain
// tiling answers "which ground tiles does the renderer need loaded right
// now," a purely local, purely presentational concern that has nothing
// to do with SpatialIndexRoot/Manifest or discovery at all — conflating
// the two would make a rendering decision (how far can the camera see)
// silently depend on a decentralized-systems constant it has no business
// touching, and vice versa.

// 40 units — the same scale core/DeterministicGridPlacement.js's own
// GRID_SPACING already uses for document placement, so a tile boundary
// and a document's own placement grid line up at a glance. Not a hard
// coupling (nothing here imports DeterministicGridPlacement, and
// changing one independently of the other is always safe) — just a
// deliberate visual-coherence choice.
export const TERRAIN_TILE_SIZE = 40;

// A little beyond application/WorldNavigationSession.js's own
// STREAMING_RADIUS (150, for published document content) so the ground
// itself is never the thing that runs out first.
export const DEFAULT_STREAMING_RADIUS = 160;

export function tileCoordinateForPosition(x, z, tileSize = TERRAIN_TILE_SIZE) {
    return { tx: Math.floor(x / tileSize), tz: Math.floor(z / tileSize) };
}

export function tileKey(tx, tz) {
    return `${tx},${tz}`;
}

export function tileCenter(tx, tz, tileSize = TERRAIN_TILE_SIZE) {
    return { x: (tx + 0.5) * tileSize, z: (tz + 0.5) * tileSize };
}

// Every tile whose CENTER lies within `radius` of (centerX, centerZ) —
// deliberately a center test, the same V0 simplification
// renderer/PickingService.js's own pickInRectangle() already uses for
// marquee selection (see its header), not full tile-bounds/circle
// intersection. Returns tiles in a fixed, deterministic order (sorted by
// tx then tz) so two callers computing the same radius around the same
// center always get an identical ARRAY, element for element — never
// merely an identical set in whatever order a Map/object happened to
// iterate it, which is what makes revisiting a position after roaming
// away reproduce byte-identical streaming behavior (see
// tests/WorldGroundTerrain.test.js's own determinism section).
export function tilesWithinRadius(centerX, centerZ, radius, tileSize = TERRAIN_TILE_SIZE) {
    const tileSpan = Math.ceil(radius / tileSize) + 1;
    const { tx: centerTx, tz: centerTz } = tileCoordinateForPosition(centerX, centerZ, tileSize);
    const radiusSquared = radius * radius;
    const tiles = [];
    for (let tx = centerTx - tileSpan; tx <= centerTx + tileSpan; tx++) {
        for (let tz = centerTz - tileSpan; tz <= centerTz + tileSpan; tz++) {
            const center = tileCenter(tx, tz, tileSize);
            const dx = center.x - centerX;
            const dz = center.z - centerZ;
            if (dx * dx + dz * dz <= radiusSquared) {
                tiles.push({ tx, tz });
            }
        }
    }
    tiles.sort((a, b) => (a.tx - b.tx) || (a.tz - b.tz));
    return tiles;
}
