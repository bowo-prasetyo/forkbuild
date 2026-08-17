// 0.2.32 — deterministic camera framing for a document thumbnail,
// entirely pure geometry: given a document's bounding box (see
// core/SpatialBounds.js), decide where a camera should sit and what it
// should look at so the whole document fits in frame. No Three.js, no
// rendering, no randomness, no wall-clock time — testable exactly like
// core/SpatialQuery.js's distance math, and reused unchanged by
// renderer/DocumentThumbnailRenderer.js (the one place that actually
// turns this into pixels).
//
// The guarantee this makes is deliberately narrower than it might
// sound: SAME CONTENT -> SAME INTENDED CAMERA SHOT, every time, on
// every client. It does NOT guarantee same content -> byte-identical
// PNG — GPU, driver, antialiasing implementation, device pixel ratio,
// and Three.js version can all still make the actual rendered pixels
// differ between two people's machines even when they're looking at
// the exact same document from the exact same computed position. That
// is fine: a preview is a derived VISUALIZATION (see
// docs/Principles.md, "Previews Are Derived Client State"), not a
// cryptographic artifact — it was never signed, and nothing depends on
// two renders matching byte-for-byte, only on them showing the same
// thing from the same angle.
const DEFAULT_FOV_DEGREES = 40;
// Headroom so the object doesn't touch the frame's edge — 1.0 would
// mean the bounding sphere exactly touches the frustum at its widest.
const DEFAULT_PADDING = 1.35;
// A fixed "true isometric" viewing angle (45° azimuth around Y, the
// elevation where a cube's three visible faces appear equal-sized) —
// not because it's the only reasonable choice, but because it's ONE
// fixed choice, applied identically to every document, which is the
// only property that actually matters here.
const AZIMUTH_RADIANS = Math.PI / 4;
const ELEVATION_RADIANS = Math.atan(1 / Math.sqrt(2));
// A document with essentially no volume (a single brick, or an empty
// world — SpatialBounds.fromWorld already returns a small non-zero
// default for the latter) must never collapse to a zero-distance
// camera sitting on top of its own target.
const MIN_RADIUS = 0.5;

export function computeThumbnailCamera(bounds, { fovDegrees = DEFAULT_FOV_DEGREES, padding = DEFAULT_PADDING } = {}) {
    const size = bounds.size;
    const center = bounds.center;

    // The radius of the sphere that CIRCUMSCRIBES the AABB — using the
    // bounding sphere rather than the box itself means the whole
    // object fits in frame regardless of which angle it's viewed from,
    // without needing to special-case the viewing azimuth against the
    // box's own orientation.
    const radius = Math.max(
        Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z) / 2,
        MIN_RADIUS
    );

    const fovRadians = (fovDegrees * Math.PI) / 180;
    const distance = (radius * padding) / Math.sin(fovRadians / 2);

    const horizontal = distance * Math.cos(ELEVATION_RADIANS);
    const position = {
        x: center.x + horizontal * Math.cos(AZIMUTH_RADIANS),
        y: center.y + distance * Math.sin(ELEVATION_RADIANS),
        z: center.z + horizontal * Math.sin(AZIMUTH_RADIANS)
    };

    return {
        position,
        target: { x: center.x, y: center.y, z: center.z },
        fovDegrees,
        distance
    };
}
