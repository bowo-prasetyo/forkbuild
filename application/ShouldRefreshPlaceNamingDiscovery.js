import { distanceXZ } from '../core/WorldSpatialAnchor.js';

// 0.9.256 — Automatic Place Naming Discovery Orchestration.
//
// The pure decision boundary `application/PlaceNamingDiscoveryMonitor.js`'s
// own header names: a way to tell "the Wanderer moved a little" apart from
// "the Wanderer moved far enough that a fresh Place Naming discovery call is
// actually worth making." Kept as its own file, with no I/O and no
// collaborator of any kind, so it is directly testable without a fake
// command or a fake monitor — the identical split
// `application/ShouldRefreshSnapshotDiscovery.js` (0.9.186) already drew for
// Snapshot discovery.
//
// A DELIBERATELY INDEPENDENT FILE, NOT A REUSE OF
// `ShouldRefreshSnapshotDiscovery.js` — Place Naming's own recommendation
// that opened this milestone named this split by name: "Place Naming should
// therefore get its own semantic monitor... potentially reusing only
// generic cadence/trigger infrastructure if such infrastructure actually
// exists independently." No such infrastructure exists independently of
// Snapshot discovery today — `shouldRefreshSnapshotDiscovery()` is a
// perfectly generic function in what it computes, but it lives in, and is
// named for, the Snapshot discovery family, and it compares
// `WorldSpatialContext`-shaped objects (`.position` nested one level down),
// not raw positions. Importing it here would silently couple Place Naming's
// own refresh cadence to a Snapshot-named file for no benefit, and would
// force every caller to wrap a raw Wanderer position in a fake "context"
// object just to satisfy a shape this feature never needed. This file
// compares raw `{x,z}` positions directly, and is free to evolve
// independently of whatever Snapshot discovery's own cadence needs next.
//
// X/Z ONLY, INCLUSIVE BOUNDARY, MATCHING PLACE NAMING'S OWN CONVENTION —
// NOT `ShouldRefreshSnapshotDiscovery.js`'S 3D `distanceBetween()`. Every
// other Place Naming spatial computation in this codebase
// (`core/PlaceNamingProximitySelection.js#selectNearbyPlaceNamingClaims()`,
// `core/WorldRegion.js#contains()`) already ignores Y and uses
// `core/WorldSpatialAnchor.js#distanceXZ()` with a `>=`/`<=` inclusive
// boundary — reused here verbatim rather than reintroducing a fourth X/Z
// distance formula, or a 3D one that would disagree with how "nearby" is
// defined everywhere else in this feature.
//
// THE DEFAULT RADIUS (100) HAPPENS TO MATCH
// `ShouldRefreshSnapshotDiscovery.js#DEFAULT_DISCOVERY_REFRESH_RADIUS` —
// AN INDEPENDENT CONSTANT THAT AGREES TODAY, NOT A SHARED REFERENCE, THE
// EXACT SAME RELATIONSHIP THAT FILE'S OWN HEADER ALREADY DOCUMENTS FOR ITS
// OWN COPY OF THE SAME NUMBER. Both name the same rough intuition — "once
// the Wanderer has moved farther than this, whatever was last discovered
// no longer describes what's actually around them" — without either file
// importing the other's constant.
export const DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS = 100;

function isFiniteXZPosition(position) {
    return Boolean(position) && typeof position === 'object'
        && Number.isFinite(position.x) && Number.isFinite(position.z);
}

// shouldRefreshPlaceNamingDiscovery(previousPosition, currentPosition, radius)
//   -> boolean.
//
// `previousPosition`/`currentPosition` are plain `{x,z}` (a `y` field, if
// present, is ignored) — never a `WorldSpatialContext`-shaped wrapper.
//
//   - `currentPosition` missing, or with a non-finite x/z — nothing to
//     discover around yet. Never refreshes.
//   - `previousPosition` missing, or with a non-finite x/z — nothing has
//     ever been observed before. Always refreshes; there is no prior
//     discovery call that could still be valid.
//   - Otherwise — refreshes only when the X/Z Euclidean distance between
//     the two positions is at least `radius`. A tiny movement inside that
//     radius never refreshes. The boundary is inclusive: a movement of
//     EXACTLY `radius` refreshes.
export function shouldRefreshPlaceNamingDiscovery(previousPosition, currentPosition, radius = DEFAULT_PLACE_NAMING_DISCOVERY_REFRESH_RADIUS) {
    if (!isFiniteXZPosition(currentPosition)) {
        return false;
    }
    if (!isFiniteXZPosition(previousPosition)) {
        return true;
    }
    const distance = distanceXZ(previousPosition, currentPosition);
    return distance !== null && distance >= radius;
}
