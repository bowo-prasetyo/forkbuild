// 0.5.4 — Place Identity & Geographic Claim Resolution.
//
// 0.5.2/0.5.3 built the whole naming MODEL and its EXCHANGE transport,
// and both drew the exact same boundary around the same open question,
// named directly in both milestones' own "Deliberately excluded" lists:
// a `PlaceNamingClaim#regionId` is an exact reference to ONE
// `WorldRegion`, and two authors' regions covering the same real ground
// but created independently are, for naming purposes, still two
// separate places. This module is the first half of closing that gap —
// see core/PlaceIdentity.js for the second half, and this milestone's
// own docs/Roadmap.md entry for the full design.
//
// A PlaceFingerprint is a normalized, DERIVED geographic descriptor for
// one WorldRegion — never persisted, never signed, never itself a claim
// about anything. It answers a narrow, deliberately modest question:
// "if I round this region's own geometry to a coarse grid, what does it
// look like?" Two regions whose fingerprints are IDENTICAL are
// candidates for describing the same place; two regions whose
// fingerprints differ are NOT — but a matching fingerprint is never
// treated as proof (see core/PlaceIdentity.js's own header for exactly
// what a match is, and is not, allowed to mean).
//
// Deliberately built from exactly the three inputs the design
// conversation named — center X/Z, radius, and `kind` — after
// deterministic QUANTIZATION (rounding each value to the nearest
// multiple of a small "quantum"). Quantization exists to absorb
// floating-point noise between two authors' independently-typed
// geometry (100.00001 vs 100.00002 should plainly be "the same
// number"), while staying fine-grained enough that two genuinely
// different, intentionally-authored values (100 vs 180) never collapse
// together. The DEFAULT quantum (1 world unit) is deliberately tight —
// this milestone would rather under-match (two authors describing the
// same ground with meaningfully different geometry stay separate
// candidates) than over-match (two authors describing different ground
// get treated as the same place). See docs/Principles.md, "Geographic
// Similarity Suggests Identity; It Never Mutates Identity (0.5.4)."
//
// `kind` participates in the fingerprint EXACTLY as the design
// conversation specified, and it is a HARD gate, not a soft signal: a
// Village and a District covering the identical center and radius do
// NOT fingerprint-match. This is a deliberate, named limitation, not an
// oversight — see this milestone's own docs/Roadmap.md "Deliberately
// excluded" list for the future refinement (treating `kind` as a
// secondary signal rather than a hard gate) this leaves on the table.
//
// Pure, deterministic, no network, no persistence, no World mutation —
// exactly the "Level 1" discipline this milestone's own design
// conversation asked for.
export const DEFAULT_POSITION_QUANTUM = 1;
export const DEFAULT_RADIUS_QUANTUM = 1;

function quantize(value, quantum) {
    if (!Number.isFinite(value) || !Number.isFinite(quantum) || quantum <= 0) {
        return null;
    }
    // Math.round(-0 / q) * q can produce -0, which stringifies as "0" in
    // a template literal but compares unequal to +0 via Object.is — not
    // a concern here since fingerprintKey() below always stringifies via
    // template literals, but the +0 keeps a defensive equality check
    // (e.g. `Object.is`) from ever surprising a future caller.
    return Math.round(value / quantum) * quantum + 0;
}

// Extracts a region-like object's raw geometry, tolerant of either a
// core/WorldRegion.js instance or a plain duck-typed object (e.g.
// application/WorldNavigationSession.js#_collectRawRegions()'s own
// shape) — the same tolerance core/WorldRegionGeography.js#
// regionsContaining() already keeps for `region.contains`.
function regionGeometry(region) {
    if (!region || !region.position) {
        return null;
    }
    const x = region.position.x;
    const z = region.position.z;
    const radius = region.radius;
    if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius)) {
        return null;
    }
    return { x, z, radius, kind: region.kind || null };
}

// Derives a PlaceFingerprint for `region` — `{ x, z, radius, kind }`,
// each coordinate/radius quantized to the nearest multiple of its own
// quantum. Returns null for a region with no usable geometry (mirrors
// core/WorldRegionGeography.js's own "nothing to derive, return the
// empty/null case" posture, never a thrown error for malformed input).
export function deriveFingerprint(region, {
    positionQuantum = DEFAULT_POSITION_QUANTUM,
    radiusQuantum = DEFAULT_RADIUS_QUANTUM
} = {}) {
    const geometry = regionGeometry(region);
    if (!geometry) {
        return null;
    }
    return {
        x: quantize(geometry.x, positionQuantum),
        z: quantize(geometry.z, positionQuantum),
        radius: quantize(geometry.radius, radiusQuantum),
        kind: geometry.kind
    };
}

// A stable string key for a fingerprint — used both for equality (two
// fingerprints match iff their keys are identical strings) and as a
// deterministic sort/group key so replicas that discovered regions in a
// different order still converge on the same grouping. Returns null for
// a null fingerprint so a caller never accidentally treats "no
// geometry" as a match against another "no geometry."
export function fingerprintKey(fingerprint) {
    if (!fingerprint) {
        return null;
    }
    return `${fingerprint.kind || ''}:${fingerprint.x}:${fingerprint.z}:${fingerprint.radius}`;
}

// True iff both fingerprints are non-null and carry the identical key.
// This is the ENTIRE matching rule this milestone commits to — see this
// module's own header on why it is deliberately this simple.
export function fingerprintsEqual(a, b) {
    const keyA = fingerprintKey(a);
    const keyB = fingerprintKey(b);
    return keyA !== null && keyA === keyB;
}

// A short, human-readable summary of a fingerprint — presentation only,
// never a stored or signed fact. E.g. "village @ (100, 200), radius 50".
export function describeFingerprint(fingerprint) {
    if (!fingerprint) {
        return '';
    }
    return `${fingerprint.kind || 'place'} @ (${fingerprint.x}, ${fingerprint.z}), radius ${fingerprint.radius}`;
}
