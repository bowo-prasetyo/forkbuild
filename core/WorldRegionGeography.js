// 0.5.0 — World Regions & Decentralized Place Naming.
//
// WorldRegionGeography is a DERIVED, ephemeral reading of a World's own
// named regions — never persisted, never owned, never authoritative.
// It answers: "Given the regions that exist right now, what is THIS
// position actually called?"
//
// Exactly the same "derived, never stored" discipline
// core/WorldCurationContext.js already established for landmark-based
// PlaceContexts, applied here to explicit, user-named areas instead of
// proximity-to-a-point. See docs/Principles.md, "Users Name Places; The
// World Derives Geography From Names (0.5.0)."
//
// Deliberately geometry-only: regionsContaining() below NEVER consults
// `parentRegionId` — a region's own radius decides what it contains,
// full stop. Two independently-authored, non-hierarchical regions nest
// or overlap exactly according to their own geometry, never according to
// who created them first or which one names the other as a parent. This
// is what lets Alice's "Willow Village" and Bob's unrelated "Northern
// Settlement" coexist over the same ground without the system ever
// having to decide which of them is "correct" — both are legitimate
// World content, and a position inside both simply belongs to both.
import { distanceXZ } from './WorldSpatialAnchor.js';

// Every region whose circle contains `position`, ordered smallest-
// radius-first — the most specific place name first, the broadest last,
// e.g. "Willow Village" (radius 30) before "Green Valley" (radius 200)
// before "Kingdom of Eldoria" (radius 2000). This ordering is a
// heuristic, not a claim about authored hierarchy: it falls naturally
// out of the geometry, with zero dependency on `parentRegionId`, which
// is exactly why unrelated overlapping regions never need to agree on
// who is whose parent to still nest sensibly on screen. Ties (equal
// radius) break by name for deterministic ordering across replicas.
export function regionsContaining(position, regions = []) {
    if (!position || !Array.isArray(regions)) {
        return [];
    }
    return regions
        .filter((region) => region && region.contains
            ? region.contains(position)
            : (distanceXZ(region.position, position) ?? Infinity) <= region.radius)
        .slice()
        .sort((a, b) => a.radius - b.radius || a.name.localeCompare(b.name));
}

// A human-readable breadcrumb, innermost place first:
// "Willow Village · Green Valley · Kingdom of Eldoria". Empty string
// when nothing contains the position — a caller falls back to whatever
// it already used before this milestone (e.g.
// core/WorldCurationContext.js#describeLocation()'s nearest-landmark/
// structure reading), never a fabricated placeholder name. Procedural
// fallback naming for an unnamed area (e.g. deterministic "Sector 12"
// labels) remains a possible future presentation layer, deliberately
// not built here — see this module's own header on why a name is
// always either real World content or simply absent.
export function describePlace(containingRegions = []) {
    return containingRegions.map((region) => region.name).join(' · ');
}

// Every region whose `parentRegionId` names `regionId` — informational
// grouping only (see core/WorldRegion.js's own header), never consulted
// by regionsContaining() above. If the named parent was since removed,
// this simply returns whatever regions still claim it — the same
// graceful-absence posture application/WorldLocationDirectory.js already
// applies to a removed StructurePlacement, never a dangling-reference
// error.
export function childRegions(regionId, regions = []) {
    if (!regionId || !Array.isArray(regions)) {
        return [];
    }
    return regions.filter((region) => region.parentRegionId === regionId);
}

// Given a position, the single most specific (smallest-radius)
// containing region, or null. A thin convenience over
// regionsContaining() for callers that only want "what do I call this
// place right now?" rather than the whole breadcrumb.
export function nearestRegion(position, regions = []) {
    const containing = regionsContaining(position, regions);
    return containing.length > 0 ? containing[0] : null;
}
