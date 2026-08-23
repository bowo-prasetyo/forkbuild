import { groupRegionsByPlaceIdentity } from './PlaceIdentity.js';
import { rankClaimsByName } from './PlaceNamingView.js';
import { fingerprintKey } from './PlaceFingerprint.js';

// 0.5.4 — Place Identity & Geographic Claim Resolution.
//
// The "Level 2 — Claim resolution" half of this milestone's own design
// conversation:
//
//   Given claim A -> Region A, claim B -> Region B, the client derives:
//   same geographic place? -> maybe, and groups their names accordingly.
//
// core/PlaceIdentity.js answers "are these two regions candidates for
// the same place?" purely from geometry. This module is the thin next
// step: given every region a client currently has and every
// PlaceNamingClaim it currently knows about, group the CLAIMS by which
// geographic-place candidate group their own region belongs to, and
// rank the names within each group with the exact same distinct-author
// scoring core/PlaceNamingView.js#rankClaimsByName() already established
// for a single region — applied here across every region in the group
// at once.
//
// Still deliberately "maybe," never "yes": a region only ends up in a
// group with another region because their fingerprints matched, and a
// fingerprint match is candidacy, not proof — see core/PlaceIdentity.js's
// own header. This module adds no new evidence of its own; it only
// reshapes what core/PlaceIdentity.js and core/PlaceNamingView.js
// already independently derive.
//
// Pure, deterministic, no network, no persistence, no World mutation —
// this module never looks anything up (no store, no session, no World
// document); every region and every claim it groups is exactly what the
// caller already handed it, the same "the caller already has everything
// it needs" posture core/PlaceNamingView.js#namingView() itself keeps.
export function resolveGeographicPlaces(regions = [], claims = [], options = {}) {
    const groups = groupRegionsByPlaceIdentity(regions, options);
    return groups.map((group) => buildPlaceGroup(group, claims));
}

// The single geographic-place group `regionId` belongs to, or null if
// `regionId` isn't among `regions` at all (unknown geometry — the same
// graceful-absence posture core/WorldRegionGeography.js's own
// nearestRegion() already keeps). A thin convenience over
// resolveGeographicPlaces() above for a caller (a UI panel, a session
// method) that only cares about ONE region's own group rather than the
// full partition.
export function geographicPlaceForRegion(regionId, regions = [], claims = [], options = {}) {
    if (!regionId) {
        return null;
    }
    const groups = resolveGeographicPlaces(regions, claims, options);
    return groups.find((group) => group.regions.some((region) => region.id === regionId)) || null;
}

function buildPlaceGroup(group, claims) {
    const regionIds = new Set(group.regions.map((region) => region.id));
    const groupClaims = (claims || []).filter((claim) => claim && regionIds.has(claim.regionId));
    return {
        fingerprint: group.fingerprint,
        // Stable ordering independent of the order regions/claims were
        // discovered in — the same cross-replica determinism concern
        // core/PlaceIdentity.js#groupRegionsByPlaceIdentity() already
        // documents for its own group ordering, applied here one level
        // down to the regions WITHIN one group.
        regions: group.regions.slice().sort((a, b) => `${a.worldId}:${a.id}`.localeCompare(`${b.worldId}:${b.id}`)),
        claims: groupClaims,
        namingView: rankClaimsByName(groupClaims)
    };
}

// A short, human-readable summary of how many geographic descriptions
// (regions) contribute to one place group — presentation only, never a
// stored fact. '' for a single-region group (nothing "other" to
// mention); 'N geographic descriptions of this place' otherwise. Mirrors
// core/PlaceNamingView.js#describeNamingView()'s own "empty string, not
// a fabricated placeholder" posture for the "nothing to say" case.
export function describeGeographicPlace(group) {
    if (!group || !Array.isArray(group.regions) || group.regions.length <= 1) {
        return '';
    }
    return `${group.regions.length} geographic descriptions of this place`;
}

// Re-exported so a caller that only imports this module can still reach
// the fingerprint key a group is keyed by, without a second import.
export { fingerprintKey };
