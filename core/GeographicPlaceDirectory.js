import { resolveGeographicPlaces, geographicPlaceForRegion } from './GeographicPlaceResolution.js';
import { buildGeographicPlaceView } from './GeographicPlaceView.js';

// 0.5.5 — Geographic Place Directory & Identity UX.
//
// The world-wide counterpart to application/WorldLocationDirectory.js —
// and deliberately a DIFFERENT question from the one that directory
// answers:
//
//   World Location Directory  -> locations inside ONE loaded World
//   Geographic Place Directory -> candidate geographic identities
//                                 spanning EVERY loaded World
//
// Exactly like core/GeographicPlaceResolution.js, this module is pure,
// deterministic, and reads nothing but what its caller already handed
// it — no store, no session, no World document, no network. It only
// reshapes core/GeographicPlaceResolution.js#resolveGeographicPlaces()'s
// own groups into core/GeographicPlaceView.js rows, then decides the
// one thing that module leaves unopinionated: what ORDER a directory
// should list them in.
export function buildGeographicPlaceDirectory(regions = [], claims = [], options = {}) {
    const groups = resolveGeographicPlaces(regions, claims, options);
    return groups
        .map((group) => buildGeographicPlaceView(group))
        .filter(Boolean)
        .sort(compareDirectoryEntries);
}

// A single place by its fingerprint key — the id a directory row itself
// carries (GeographicPlaceView#fingerprintKey), so clicking a row can
// re-fetch the exact same place without the caller needing to remember
// which region it came from. Returns null for an unknown key, never a
// throw — the same graceful-absence posture every other *ForRegion()/
// *ByKey() lookup in this pipeline already holds to.
export function geographicPlaceByKey(fingerprintKey, regions = [], claims = [], options = {}) {
    if (!fingerprintKey) {
        return null;
    }
    return buildGeographicPlaceDirectory(regions, claims, options)
        .find((place) => place.fingerprintKey === fingerprintKey) || null;
}

// The convenience a naming panel (already scoped to one region) uses to
// reach that SAME region's own place-directory entry, without building
// the whole directory or knowing its fingerprint key up front. A thin
// composition of core/GeographicPlaceResolution.js#geographicPlaceForRegion()
// + core/GeographicPlaceView.js#buildGeographicPlaceView() — null when
// the region is unknown, exactly like geographicPlaceForRegion() itself.
export function geographicPlaceForRegionId(regionId, regions = [], claims = [], options = {}) {
    const group = geographicPlaceForRegion(regionId, regions, claims, options);
    return buildGeographicPlaceView(group);
}

// A directory reads best browsed like a phone book: alphabetically by
// whatever name it's actually showing (GeographicPlaceView#displayName),
// case-insensitive, ties broken by fingerprint key for a total,
// deterministic order. Deliberately NOT the fingerprint-key ordering
// core/PlaceIdentity.js#groupRegionsByPlaceIdentity() itself uses — that
// order exists purely so replicas agree on GROUPING, and is meaningless
// to a person browsing by name; this is the presentation-only re-sort a
// directory is allowed to apply on top of it. Still fully deterministic
// for a given (regions, claims) input, the same guarantee every other
// derivation in this pipeline already offers — it is not "the same
// order on every replica regardless of what that replica knows," which
// this architecture has never promised (two replicas that haven't
// exchanged the same claims yet may rank a place's top name, and so its
// display position, differently — exactly as own claims already can
// today; see core/PlaceNamingView.js's own header).
function compareDirectoryEntries(a, b) {
    const nameA = (a.displayName || '').toLowerCase();
    const nameB = (b.displayName || '').toLowerCase();
    if (nameA !== nameB) {
        return nameA < nameB ? -1 : 1;
    }
    return a.fingerprintKey.localeCompare(b.fingerprintKey);
}
