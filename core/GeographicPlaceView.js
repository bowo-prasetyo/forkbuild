import { fingerprintKey as keyOf } from './PlaceFingerprint.js';

// 0.5.5 — Geographic Place Directory & Identity UX.
//
// 0.5.4 (Place Identity & Geographic Claim Resolution) proved a client
// can GROUP regions into geographic-place candidates and rank their
// names together (core/GeographicPlaceResolution.js), but left the
// result as a shape only a naming panel already scoped to one region
// could read (`{ regions, namingView }`, plumbed through
// `WorldNavigationSession#getGeographicNamingView(regionId)`). This
// milestone's own design conversation named the gap directly:
//
//   A geographic place is a DERIVED VIEW over descriptions, not a new
//   object that owns them.
//
// A GeographicPlaceView is exactly that: a read-only, ephemeral
// RESHAPING of one core/GeographicPlaceResolution.js group into
// something a directory row or a place panel can render directly,
// without either of them re-deriving the ranking or the grouping
// themselves. It is never persisted, never signed, never a fourth thing
// alongside WorldRegion/PlaceFingerprint/PlaceIdentity in this
// pipeline — only the last, presentation-facing step of it:
//
//   WorldRegion -> PlaceFingerprint -> PlaceIdentity -> GeographicPlaceView -> UI
//
// There is deliberately NO `WorldGeographicPlace` stored anywhere in
// core/World.js, and nothing here ever constructs, reaches for, or
// mutates one — see this module's own tests for a direct assertion that
// building a view never touches a WorldRegion, exactly the same
// restraint core/GeographicPlaceResolution.js already held to one layer
// down.
export class GeographicPlaceView {
    constructor({ fingerprintKey, regions, names, representativeRegion, worldCount, authorCount }) {
        this.fingerprintKey = fingerprintKey;
        this.regions = regions;
        this.names = names;
        this.representativeRegion = representativeRegion;
        this.worldCount = worldCount;
        this.authorCount = authorCount;
    }

    // The single name a directory row or place panel should actually
    // DISPLAY for this place: the top-ranked community name if anyone
    // has published one for ANY region in the group (core/
    // GeographicPlaceResolution.js's own combined ranking), falling back
    // to the representative region's own World-authored name otherwise.
    // Exactly the same priority order WorldNavigationSession#
    // getDisplayPlaceName() already established for a single region,
    // one level up — a claimed name always outranks an author's own
    // label, but NEVER becomes a stored, canonical fact. See
    // docs/Principles.md, "A Name Is A Claim, Not A Fact (0.5.2)" — this
    // milestone adds a new place to read that claim, never a new way to
    // make one more official than another.
    get displayName() {
        if (this.names.length > 0) {
            return this.names[0].name;
        }
        return this.representativeRegion ? this.representativeRegion.name : '';
    }

    // How many independent descriptions (regions) make up this place —
    // presentation only, always `regions.length`. A named getter purely
    // so a directory row template reads `place.descriptionCount` rather
    // than reaching into `place.regions.length` itself.
    get descriptionCount() {
        return this.regions.length;
    }

    toJSON() {
        return {
            fingerprintKey: this.fingerprintKey,
            regions: this.regions,
            names: this.names,
            representativeRegion: this.representativeRegion,
            worldCount: this.worldCount,
            authorCount: this.authorCount,
            displayName: this.displayName,
            descriptionCount: this.descriptionCount,
            reasons: describeCandidacyReasons(this),
            caveat: CANDIDACY_CAVEAT
        };
    }
}

// Builds ONE GeographicPlaceView from a core/GeographicPlaceResolution.js
// group (`{ fingerprint, regions, claims, namingView }`) — the exact
// shape resolveGeographicPlaces()/geographicPlaceForRegion() already
// produce. Returns null for a null/undefined group, never throws.
//
// `representativeRegion` is `group.regions[0]` — deliberately NOT
// re-sorted here. `group.regions` arrives ALREADY sorted by
// `${worldId}:${id}` (see core/GeographicPlaceResolution.js#buildPlaceGroup()'s
// own header), the same cross-replica-deterministic tie-break this
// entire pipeline has used since core/PlaceIdentity.js#
// groupRegionsByPlaceIdentity() — so two replicas holding the exact
// same regions always pick the exact same representative, with no
// second sort to accidentally disagree with the first. This selection
// is PRESENTATION ONLY: it decides which region's geometry a "Show on
// Map" button centers on, or which row a UI lists first — it is never
// treated as "the authoritative region," and nothing here (or anywhere
// else in this pipeline) ever writes that distinction back into a
// WorldRegion. See docs/Principles.md, "A Geographic Place Is A Derived
// View, Never A Fourth Stored Object (0.5.5)" — the "representative
// region is a presentation choice, never an authority" restraint lives
// there.
//
// `authorCount` counts every DISTINCT identity who contributed to this
// place in either of the two ways a person can: authoring one of its
// regions, or publishing a naming claim for one — the union of both
// sets, deduplicated. An identity who did both (authored a region AND
// later named it) still counts once, the same "one identity, one point"
// discipline core/PlaceNamingView.js#rankClaimsByName() already
// established for claim scoring, applied here to the group as a whole.
export function buildGeographicPlaceView(group) {
    if (!group || !Array.isArray(group.regions) || group.regions.length === 0) {
        return null;
    }
    const worldIds = new Set();
    const authorIds = new Set();
    for (const region of group.regions) {
        if (region.worldId) {
            worldIds.add(region.worldId);
        }
        if (region.authorIdentityId) {
            authorIds.add(region.authorIdentityId);
        }
    }
    for (const claim of group.claims || []) {
        if (claim && claim.authorIdentityId) {
            authorIds.add(claim.authorIdentityId);
        }
    }
    return new GeographicPlaceView({
        fingerprintKey: keyOf(group.fingerprint),
        regions: group.regions,
        names: group.namingView || [],
        representativeRegion: group.regions[0],
        worldCount: worldIds.size,
        authorCount: authorIds.size
    });
}

// "Why grouped together?" — a short, human-readable checklist a place
// panel can render directly, explaining the ONLY evidence this
// architecture ever acts on: the shared, quantized fingerprint every
// region in the group already matched on to land in it in the first
// place (core/PlaceIdentity.js#groupRegionsByPlaceIdentity()'s exact-key
// partition — see that module's own header on why membership is
// all-or-nothing, never a degree of similarity). [] for a single-region
// group: there is nothing "grouped together" to explain when nothing
// else was found to group with it.
//
// Deliberately static text, never a fabricated confidence score or
// percentage — this milestone has no evidence stronger than "the
// fingerprints matched," and showing anything more precise than that
// would claim a certainty this architecture has never had. See
// CANDIDACY_CAVEAT below, and docs/Principles.md, "Geographic Similarity
// Suggests Identity; It Never Mutates Identity (0.5.4)," which this
// list exists purely to make VISIBLE rather than change.
export function describeCandidacyReasons(place) {
    if (!place || !Array.isArray(place.regions) || place.regions.length <= 1) {
        return [];
    }
    return [
        'Same geographic fingerprint',
        'Same center, within the position quantum',
        'Same radius, within the radius quantum',
        'Same region kind'
    ];
}

// The one sentence that must appear anywhere describeCandidacyReasons()'s
// checklist is shown — see this module's own header, and
// ui/components/GeographicPlacePanel.js, the one renderer that pairs
// them today.
export const CANDIDACY_CAVEAT = 'This is a geographic candidate, not a verified identity.';
