// 0.2.28 — pure Euclidean distance and radius membership, the
// primitive a spatial (coordinate + radius) query is built on. Kept
// separate from core/SpatialOverlap.js on purpose: overlap asks "is
// this the exact same position," an equality test; a spatial query
// asks "how far apart are two positions, and is that within some
// tolerance" — a genuinely different, continuous question, with its
// own primitive rather than overlap's exact-match one stretched to
// cover it.
export function distanceBetween(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// A plain Euclidean sphere test — origin-to-origin distance, not the
// bounds-aware sphere/AABB intersection LocalSpatialIndexProvider.discover()
// already performs for camera streaming (spatial/LocalSpatialIndexProvider.js).
// The two are deliberately not unified: streaming asks "does this
// world's GEOMETRY reach into view," where clipping in bounds matters;
// a location search reports a `distance` a person can read as "how far
// away is this," which only makes sense as a straight point-to-point
// number. Reusing the bounds-aware test here would silently produce a
// `distance` that doesn't agree with the requested radius.
export function isWithinRadius(position, center, radius) {
    return distanceBetween(position, center) <= radius;
}
