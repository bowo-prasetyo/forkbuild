import { distanceXZ } from './WorldSpatialAnchor.js';

// 0.9.255 — Place Naming Proximity Selection.
//
// 0.9.253 (Place Naming Discovery Boundary) and 0.9.254 (Nostr Place
// Naming Discovery Source) together answer "what Place Naming claims
// exist?" — deliberately without ever consulting the Wanderer's own
// position. This milestone answers the next, separate question:
//
//   discovered PlaceNamingClaims + currentPosition + radius
//                    │
//                    ▼
//   core/PlaceNamingProximitySelection.js   ★ (THIS)
//        selectNearbyPlaceNamingClaims(claims, currentPosition, radius)
//                    │
//                    ▼
//   the SAME claims, in the SAME order, minus whichever are too far
//   away (or too malformed) to place spatially at all
//
// A PURE SPATIAL FILTER, NEVER A SECOND DISCOVERY OR RANKING ALGORITHM.
// This file contains no notion of "better," "closer," "newest," or
// "more trusted" — see "no ranking," below. It performs exactly one
// job: keep the claims a Wanderer standing at `currentPosition` could
// plausibly be looking at, in the exact order discovery already
// produced them.
//
// THE SPATIAL RULE IS THE IDENTICAL ONE `core/WorldRegion.js#contains()`
// AND `core/GeographicPlaceNavigation.js#deriveNearbyGeographicPlaces()`
// ALREADY ESTABLISHED — plain X/Z Euclidean distance
// (`core/WorldSpatialAnchor.js#distanceXZ()`, reused verbatim, never
// reimplemented a third time), boundary INCLUSIVE (`distance <= radius`,
// the same `<=` `WorldRegion#contains()` already uses). A claim sitting
// exactly `radius` away is relevant; one a fraction beyond it is not.
//
// EACH ENTRY IN `claims` MUST ALREADY CARRY ITS OWN `.position` ({ x, z })
// — THIS FILE NEVER RESOLVES ONE. A `PlaceNamingClaim` (core/
// PlaceNamingClaim.js) and a discovery envelope (core/
// PlaceNamingDiscoveryEnvelope.js) both carry a `regionId`, never a
// position — resolving "where is this region, in THIS Wanderer's
// current layout" is exactly the caller-side concern
// `core/GeographicPlaceNavigation.js`'s own header already refuses to
// take on for itself ("a region's own position is layout-dependent...
// something only the application layer that actually knows the current
// layout can resolve"). A future orchestration milestone (see "what
// comes after," below) attaches a resolved `position` to each discovered
// claim before ever calling this function; this file trusts that
// attachment completely and does not care whether the rest of an entry
// looks like a raw `PlaceNamingClaim`, a discovery envelope, or anything
// else — it reads `.position` and nothing more, and returns the exact
// entry it was given, untouched.
//
// NO RANKING, NO DEDUPLICATION, NO REORDERING. Multiple relevant claims
// for the same region (Alice's "Old Oak", Bob's "Ancient Tree", Charlie's
// "Oak Crossing") are ALL returned when all three are within `radius` —
// this function never picks a winner, never sorts by distance, and never
// prefers one author over another. Discovery order in, discovery order
// out: survivors keep the exact relative order `claims` arrived in. A
// duplicate entry (the same claim appearing twice — deduplication is
// `application/PlaceNamingDiscoveryQueryService.js#search()`'s own job,
// unchanged by this milestone) is not this file's concern either: if
// both copies satisfy the spatial rule, both survive, exactly as given.
// See docs/Principles.md, "Proximity Filtering Is Not Ranking, Is Not
// Conflict Resolution (0.9.255)."
//
// MALFORMED INPUT DEGRADES GRACEFULLY, NEVER THROWS. A non-array
// `claims` returns `[]`. An invalid `currentPosition` (missing, or a
// non-finite x/z) or an invalid `radius` (non-finite, or negative)
// returns `[]` for the WHOLE call — with no trustworthy vantage point or
// tolerance to measure from, no claim can be honestly called "nearby."
// A single malformed CLAIM (missing `position`, or a non-finite x/z) is
// excluded on its own, without discarding any other, otherwise-valid
// claim in the same array — the identical "one bad entry never poisons
// its neighbors" restraint every aggregation boundary in this codebase
// already holds (see `application/PlaceNamingDiscoveryQueryService.js#
// search()`'s own "one failing source never discards another's
// results").
//
// IMMUTABLE. Neither `claims` nor any entry inside it is ever mutated;
// `selectNearbyPlaceNamingClaims()` returns a freshly-filtered array of
// the SAME entry references it was given — never a copy, never a
// reshaped row carrying a derived `distance` field a caller might
// mistake for a ranking signal.
//
// A NEARBY CLAIM IS STILL JUST A CLAIM. Surviving this filter changes
// nothing about a claim's own truth — see docs/Principles.md, "A
// Discovered Naming Claim Is Still Just A Claim (0.9.253)," which this
// milestone extends rather than weakens: discovered + nearby is still
// never verified, authoritative, or adopted. This file never imports
// `identity/LocalAuthorizationVerifier.js`, `application/
// LocalPlaceNamingClaimStore.js`, or anything that could be mistaken for
// a trust decision.
//
// SYNCHRONOUS, PURE, NO STORAGE, NO NETWORK. This file never imports a
// Nostr/peer/relay class, `application/PlaceNamingDiscoveryQueryService.js`,
// `application/DiscoverPlaceNamingClaimsCommand.js`, any World View or
// rendering module, or anything Snapshot-shaped (`application/
// WorldSnapshotDiscoveryMonitor.js` included) — it depends on nothing
// but its own `distanceXZ()` import and the plain data it is handed.
//
// DELIBERATELY EXCLUDED — NOT THIS MILESTONE.
// - **Resolving a claim's `regionId` into a position.** See "each entry
//   in `claims` must already carry its own `.position`," above.
// - **Any automatic refresh, polling, or "the Wanderer moved, re-run
//   this" orchestration.** This is a pure function a caller invokes,
//   as often or as rarely as it likes — see docs/Roadmap.md,
//   "0.9.256 — Automatic Place Naming Discovery Orchestration."
// - **Ranking, deduplication, trust scoring, or conflict resolution**
//   between multiple relevant claims. See "no ranking," above.
// - **World View presentation of any kind** — how a relevant claim
//   should actually be drawn (label, marker, stack of names) is a
//   separate, later, unscheduled concern.
//
// See docs/Roadmap.md, "0.9.255 — Place Naming Proximity Selection," for
// the full milestone entry.

function isFiniteXZPosition(position) {
    return Boolean(position)
        && typeof position === 'object'
        && Number.isFinite(position.x)
        && Number.isFinite(position.z);
}

// A valid radius is a finite, non-negative number — a radius of `0`
// (only a claim positioned exactly at `currentPosition` is relevant) is
// explicitly valid, never treated as "no radius given."
export function isValidPlaceNamingProximityRadius(radius) {
    return Number.isFinite(radius) && radius >= 0;
}

// selectNearbyPlaceNamingClaims(claims, currentPosition, radius) ->
// Array<claim>.
//
// Returns the subset of `claims` whose own `.position` lies within
// `radius` of `currentPosition` (X/Z Euclidean distance, boundary
// inclusive), in the exact order they appear in `claims` — see this
// file's own header for the full contract. Never throws: a non-array
// `claims`, an invalid `currentPosition`, or an invalid `radius`
// degrades to `[]`; a malformed individual claim is silently excluded
// without affecting any other entry.
export function selectNearbyPlaceNamingClaims(claims, currentPosition, radius) {
    if (!Array.isArray(claims)) {
        return [];
    }
    if (!isFiniteXZPosition(currentPosition) || !isValidPlaceNamingProximityRadius(radius)) {
        return [];
    }

    return claims.filter((claim) => {
        if (!claim || !isFiniteXZPosition(claim.position)) {
            return false;
        }
        const distance = distanceXZ(claim.position, currentPosition);
        return distance !== null && distance <= radius;
    });
}
