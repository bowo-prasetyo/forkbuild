import { ref, computed } from 'vue';
import { PlaceNamingClaim } from '../../../core/PlaceNamingClaim.js';
import { buildPlaceNamingClaimPublication } from '../../../application/PlaceNamingClaimPublication.js';

// Explore mode's Nearby sections: places, landmarks, people, World encounters
// and discovered place naming claims (with navigate and adopt).
export function useNearbySections({
    feedback, guarded, refreshSpatialUI, resolveIdentityDisplayName, session, spatialCollaboratorRows,
    spatialContext, worldViewNav
}) {
    // Exactly placeNamingDiscoveryMonitor's last result: never re-ranked,
    // deduplicated or reduced to one name per place. Written only from the
    // monitor's callback; this view does no discovery of its own. The error is a
    // small indicator and never clears the claims.
    const nearbyPlaceNamingClaims = ref([]);
    const placeNamingDiscoveryError = ref(null);

    // -----------------------------------------------------------------
    // Explore mode: collapsible "Nearby" groups
    // -----------------------------------------------------------------
    //
    // Each group reuses data already computed each tick. Collapsed state lives in
    // worldViewNav and is mirrored into a ref.
    const NEARBY_PLACES_SECTION = 'explore:nearby-places';
    const NEARBY_LANDMARKS_SECTION = 'explore:nearby-landmarks';
    const NEARBY_PEOPLE_SECTION = 'explore:nearby-people';
    // Defaults expanded.
    const WORLD_ENCOUNTERS_SECTION = 'explore:world-encounters';
    // Defaults collapsed: an unverified discovered claim should not demand
    // attention.
    const NEARBY_PLACE_NAMING_SECTION = 'explore:nearby-place-naming';
    const nearbySectionsCollapsed = ref({
        places: worldViewNav.isSectionCollapsed(NEARBY_PLACES_SECTION, false),
        landmarks: worldViewNav.isSectionCollapsed(NEARBY_LANDMARKS_SECTION, true),
        people: worldViewNav.isSectionCollapsed(NEARBY_PEOPLE_SECTION, true),
        worldEncounters: worldViewNav.isSectionCollapsed(WORLD_ENCOUNTERS_SECTION, false),
        placeNaming: worldViewNav.isSectionCollapsed(NEARBY_PLACE_NAMING_SECTION, true)
    });

    function setNearbySectionCollapsed(key, sectionId, collapsed) {
        worldViewNav.setSectionCollapsed(sectionId, collapsed);
        nearbySectionsCollapsed.value = { ...nearbySectionsCollapsed.value, [key]: collapsed };
    }

    const nearbyLandmarkRows = computed(() => (
        (spatialContext.value && spatialContext.value.nearbyLandmarks) || []
    ));

    // Joins nearby collaborators with their device ids so "Go" can use
    // followCollaborator().
    const nearbyPeopleRows = computed(() => {
        const contextCollaborators = (spatialContext.value && spatialContext.value.nearbyCollaborators) || [];
        const deviceByIdentity = new Map(spatialCollaboratorRows.value.map((row) => [row.identityId, row.primaryDeviceId]));
        return contextCollaborators.map((c) => ({
            identityId: c.identityId,
            displayName: c.displayName,
            distance: c.distance,
            direction: c.direction,
            deviceId: deviceByIdentity.get(c.identityId) || null
        }));
    });

    // Presentation only, one row per claim in the monitor's order, duplicates of
    // the same place included. Position comes from the monitor; no distance is
    // computed here. An unparseable createdAt formats as ''.
    function formatNearbyPlaceNamingCreatedAt(createdAt) {
        const date = createdAt instanceof Date ? createdAt : new Date(createdAt);
        return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString();
    }

    // Carries every field the claim publication validator needs (regionId,
    // worldId, authorIdentityId, createdAt, signature) so adoption can build a
    // package from a row. The signature is deliberately not displayed: nothing can
    // verify a not-yet-adopted claim without importing it, so showing it would
    // imply assurance nothing backs. `alreadySaved` comes from
    // session.hasPlaceNamingClaim(), keyed by claim id per world.
    const nearbyPlaceNamingClaimRows = computed(() => (
        nearbyPlaceNamingClaims.value.map((entry) => ({
            claimId: entry.claim.id,
            name: entry.claim.name,
            authorDisplayName: resolveIdentityDisplayName(entry.claim.authorIdentityId),
            createdAtLabel: formatNearbyPlaceNamingCreatedAt(entry.claim.createdAt),
            position: entry.position,
            regionId: entry.claim.regionId,
            worldId: entry.claim.worldId,
            authorIdentityId: entry.claim.authorIdentityId,
            createdAt: entry.claim.createdAt,
            signature: entry.claim.signature,
            alreadySaved: session.hasPlaceNamingClaim(entry.claim.worldId, entry.claim.id)
        }))
    ));

    // Moves the camera to the claim's region; navigating is not adopting. Checks
    // the claim's worldId so a stale claim is never sent to another world's region
    // with the same id; a missing region gives feedback, never a fallback.
    function navigateToNearbyPlaceNamingClaim(row) {
        const regionStillExists = session.getRegions()
            .some((region) => region.id === row.regionId && region.worldId === row.worldId);
        if (!regionStillExists) {
            feedback.show('That place no longer exists in this World');
            return false;
        }
        session.focusLocation(row.regionId);
        refreshSpatialUI();
        return true;
    }

    // Adopting a nearby claim: rebuilds the claim from the row's own fields (never
    // the current identity) into the same publication package a manual export
    // produces, and imports it through session.importPlaceNamingClaim(), which
    // does all validation and verification. Only ever an explicit click; a
    // duplicate is an ordinary outcome.
    function adoptNearbyPlaceNamingClaim(row) {
        const rowClaim = PlaceNamingClaim.fromJSON({
            id: row.claimId,
            worldId: row.worldId,
            regionId: row.regionId,
            name: row.name,
            authorIdentityId: row.authorIdentityId,
            createdAt: row.createdAt,
            signature: row.signature
        });
        const pkg = buildPlaceNamingClaimPublication(rowClaim);
        const result = guarded(() => session.importPlaceNamingClaim(pkg));
        if (!result) return;
        const { claim, isNew } = result;
        // Reached only after a successful import. Assigning a new array makes the rows
        // recompute alreadySaved all at once.
        nearbyPlaceNamingClaims.value = [...nearbyPlaceNamingClaims.value];
        if (!isNew) {
            feedback.show(`"${claim.name}" was already known — nothing changed`);
            return;
        }
        feedback.show(`Adopted "${claim.name}"`);
    }

    return {
        nearbyPlaceNamingClaims, placeNamingDiscoveryError, NEARBY_PLACES_SECTION, NEARBY_LANDMARKS_SECTION,
        NEARBY_PEOPLE_SECTION, WORLD_ENCOUNTERS_SECTION, NEARBY_PLACE_NAMING_SECTION, nearbySectionsCollapsed,
        setNearbySectionCollapsed, nearbyLandmarkRows, nearbyPeopleRows, formatNearbyPlaceNamingCreatedAt,
        nearbyPlaceNamingClaimRows, navigateToNearbyPlaceNamingClaim, adoptNearbyPlaceNamingClaim
    };
}
