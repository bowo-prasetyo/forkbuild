// 0.5.0 — World Regions & Decentralized Place Naming.
//
// The closed vocabulary of semantic labels a WorldRegion (core/WorldRegion.js)
// may carry. Deliberately just LABELS, never behavior: nothing in this
// codebase says "a VILLAGE must have radius 50" or treats CONTINENT
// differently from DISTRICT in any geometric or authorization sense — see
// core/WorldRegion.js's own header and docs/Principles.md, "Users Name
// Places; The World Derives Geography From Names (0.5.0)." A World that
// isn't Earth at all (a fantasy kingdom, a Mars colony) uses exactly the
// same kinds; the creator decides what "Village" means in their own World.
//
// PLACE is the generic default for a region whose creator doesn't care to
// pick a more specific kind — never a distinct behavior, only a distinct
// label a UI can render or omit.
export const RegionKind = Object.freeze({
    CONTINENT: 'continent',
    COUNTRY: 'country',
    REGION: 'region',
    CITY: 'city',
    TOWN: 'town',
    VILLAGE: 'village',
    DISTRICT: 'district',
    NEIGHBORHOOD: 'neighborhood',
    PLACE: 'place'
});

export function isValidRegionKind(kind) {
    return Object.values(RegionKind).includes(kind);
}
