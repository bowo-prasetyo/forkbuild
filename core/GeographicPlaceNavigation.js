import { resolveCompassLabel } from './CompassHeading.js';

// 0.5.6 — Geographic Place Navigation & Arrival.
//
// 0.5.5 proved a geographic place could be BROWSED (a directory, a
// place panel showing community names and "why grouped together?").
// This milestone's own design conversation asked a different question:
//
//   "I found a place. Now take me there."
//
// A geographic place still must never become a fourth stored object
// alongside WorldRegion/PlaceFingerprint/PlaceIdentity/GeographicPlaceView
// — see core/GeographicPlaceView.js's own header for that pipeline. So
// rather than inventing a new navigation mechanism (a
// `focusGeographicPlace()`, a second camera system), this module exists
// purely to let a geographic place candidate be addressed through the
// SAME identifier space `application/WorldLocationDirectory.js`
// already resolves for `focusLocation()` — a `WorldLocation` whose kind
// is `GEOGRAPHIC_PLACE` (see core/WorldLocationKind.js), constructed
// fresh on every read, never persisted, and never added to
// core/World.js. See docs/Principles.md, "A Geographic Place Is
// Navigable; It Does Not Become World Content (0.5.6)."
//
// Every function here is pure: no store, no session, no network, no
// World mutation — the same "the caller already has everything it
// needs" posture core/GeographicPlaceResolution.js and
// core/GeographicPlaceView.js already hold to.

// The `WorldLocation#id` prefix a geographic place's derived navigation
// id always carries — `place:<fingerprintKey>`, never a newly generated
// persistent identity. Exported so a caller that already has a
// fingerprintKey (a directory row, a place panel) can build the exact
// id `focusLocation()` expects without duplicating the prefix itself.
export const GEOGRAPHIC_PLACE_LOCATION_PREFIX = 'place:';

export function geographicPlaceLocationId(fingerprintKey) {
    if (!fingerprintKey) {
        return null;
    }
    return `${GEOGRAPHIC_PLACE_LOCATION_PREFIX}${fingerprintKey}`;
}

export function isGeographicPlaceLocationId(locationId) {
    return typeof locationId === 'string' && locationId.startsWith(GEOGRAPHIC_PLACE_LOCATION_PREFIX);
}

// The inverse of geographicPlaceLocationId() — null for anything that
// isn't one of this module's own ids, or whose fingerprintKey half is
// empty, never a throw.
export function geographicPlaceFingerprintKeyFromLocationId(locationId) {
    if (!isGeographicPlaceLocationId(locationId)) {
        return null;
    }
    const fingerprintKey = locationId.slice(GEOGRAPHIC_PLACE_LOCATION_PREFIX.length);
    return fingerprintKey || null;
}

// deriveGeographicPlaceNavigationTarget(place)
//
// "Where is the place?" is a different question from "which region
// represents it?" — a candidate place can span several regions, in
// several Worlds, none of them more authoritative than another. This
// function answers the navigation question the ONLY way this
// architecture is willing to: by reusing the exact deterministic
// representative pick core/GeographicPlaceView.js already made
// (`place.representativeRegion`, itself `group.regions[0]` off the
// `${worldId}:${id}`-sorted regions core/GeographicPlaceResolution.js#
// buildPlaceGroup() already produces) — never re-deriving, re-ranking,
// or re-sorting anything of its own.
//
// Deliberately returns an IDENTITY (`worldId`/`regionId`), never a
// position: a region's own position is layout-dependent (which
// Worlds this replica happens to have loaded, and where its own
// multi-document layout has placed each one — see
// application/WorldLocationDirectory.js's own header), something only
// the application layer that actually knows the current layout can
// resolve. This function's own job ends at "which region," exactly
// where core/GeographicPlaceView.js's representativeRegion pick already
// ends today (see docs/Principles.md, "A Representative Region Is A
// Presentation Choice, Never An Authority (0.5.5)," which this
// restraint extends rather than replaces).
//
// Returns null for a null/placeless input, or a place with no
// representative region at all (buildGeographicPlaceView() never
// actually produces one of those, but this function makes no
// assumption about its caller).
export function deriveGeographicPlaceNavigationTarget(place) {
    if (!place || !place.representativeRegion || !place.representativeRegion.id) {
        return null;
    }
    const region = place.representativeRegion;
    return {
        fingerprintKey: place.fingerprintKey || null,
        worldId: region.worldId || null,
        regionId: region.id,
        title: place.displayName || region.name || 'Untitled Place'
    };
}

// -----------------------------------------------------------------
// Distance-aware place discovery (getNearbyGeographicPlaces)
// -----------------------------------------------------------------
//
// Deliberately its OWN radius, not a reuse of the ~100m proximity
// window core/WorldSpatialContext.js's structures/landmarks/
// collaborators already use: a geographic place candidate is meant to
// be discoverable from much further away than "something right next to
// me" — a viewer standing at one edge of a described settlement should
// still see it listed, not just the landmark sitting on top of them.
export const DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS = 300;

// deriveNearbyGeographicPlaces(entries, viewerPosition, radius)
//
// `entries` is an array the CALLER has already resolved to actual,
// layout-space navigable positions — see
// application/WorldNavigationSession.js#getNearbyGeographicPlaces(),
// the one place that resolution happens (by delegating back to
// application/WorldLocationDirectory.js, the same single source of
// truth focusLocation() itself uses, so "how far away is it" and
// "where does Go To Place actually take me" can never disagree). This
// function does nothing but the pure distance math: filter to `radius`
// (XZ-plane, matching every other proximity query in this codebase —
// see core/WorldSpatialAnchor.js#distanceXZ()'s own convention),
// compute a compass direction for each survivor, and sort — nearest
// first, ties broken by fingerprintKey so the order is deterministic
// even when two places sit at the exact same distance.
//
// No `visitors`/`lastVisited`/`distance` is ever stored anywhere this
// function can reach — every field on the returned rows is recomputed
// fresh from `entries`/`viewerPosition` on every call.
export function deriveNearbyGeographicPlaces(entries = [], viewerPosition, radius = DEFAULT_NEARBY_GEOGRAPHIC_PLACE_RADIUS) {
    if (!viewerPosition || !Array.isArray(entries)) {
        return [];
    }
    const withDistance = [];
    for (const entry of entries) {
        if (!entry || !entry.position || !entry.fingerprintKey) {
            continue;
        }
        const dx = entry.position.x - viewerPosition.x;
        const dz = entry.position.z - viewerPosition.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        if (distance > radius) {
            continue;
        }
        withDistance.push({
            ...entry,
            distance: Math.round(distance * 10) / 10,
            direction: directionLabelBetween(viewerPosition, entry.position)
        });
    }
    withDistance.sort((a, b) => {
        if (a.distance !== b.distance) {
            return a.distance - b.distance;
        }
        return a.fingerprintKey.localeCompare(b.fingerprintKey);
    });
    return withDistance;
}

// The same "which compass sector does this point fall in, seen from
// here" reading core/WorldSpatialContext.js#directionLabel() already
// computes for structures/landmarks/collaborators, reused here rather
// than duplicated a third time in an application-layer method — see
// core/CompassHeading.js#resolveCompassLabel()'s own 8-sector table,
// the ONE place that convention lives.
export function directionLabelBetween(fromPosition, toPosition) {
    if (!fromPosition || !toPosition) {
        return null;
    }
    const dx = toPosition.x - fromPosition.x;
    const dz = toPosition.z - fromPosition.z;
    if (dx === 0 && dz === 0) {
        return null;
    }
    const angle = Math.atan2(dx, dz) * (180 / Math.PI);
    return resolveCompassLabel(angle);
}

// -----------------------------------------------------------------
// Search (searchGeographicPlaces)
// -----------------------------------------------------------------
//
// A lightweight, derived filter over whatever directory the caller
// already built — never a second index, never persisted, never
// wired to anything but the array it's handed. Matches, case-
// insensitively, against: the place's own displayName, EVERY community
// name in its naming view (not just the top-ranked one — someone
// searching "Settlement" should still find "Kawahara Settlement" even
// though "Kawahara Village" currently displays), and every region's own
// WorldRegion.name. An empty/whitespace-only query returns `places`
// unchanged, exactly like every other "no filter applied" default in
// this codebase.
export function searchGeographicPlaces(places = [], query = '') {
    const trimmed = (query || '').trim().toLowerCase();
    if (!trimmed) {
        return Array.isArray(places) ? places.slice() : [];
    }
    if (!Array.isArray(places)) {
        return [];
    }
    return places.filter((place) => placeMatchesQuery(place, trimmed));
}

function placeMatchesQuery(place, trimmedLowerQuery) {
    if (!place) {
        return false;
    }
    if (place.displayName && place.displayName.toLowerCase().includes(trimmedLowerQuery)) {
        return true;
    }
    for (const entry of place.names || []) {
        if (entry && entry.name && entry.name.toLowerCase().includes(trimmedLowerQuery)) {
            return true;
        }
    }
    for (const region of place.regions || []) {
        if (region && region.name && region.name.toLowerCase().includes(trimmedLowerQuery)) {
            return true;
        }
    }
    return false;
}
