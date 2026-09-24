// World view template: the Explore mode's Nearby section (places, landmarks, people, place names, encounters).
// It renders in WorldView's scope, so it uses the names its setup() returns.
export const nearbySectionTemplate = `<div v-if="cameraPosition && primaryMode === WorldViewPrimaryMode.EXPLORE" class="world-view-section world-view-section--nearby">
                <h4>Nearby</h4>
                <CollapsibleSection
                    title="Nearby Places"
                    :count="nearbyGeographicPlaces.length"
                    :collapsed="nearbySectionsCollapsed.places"
                    @toggle="setNearbySectionCollapsed('places', NEARBY_PLACES_SECTION, $event)"
                >
                    <p v-if="nearbyGeographicPlaces.length === 0" class="world-view-nearby-empty">Nothing nearby yet.</p>
                    <div v-for="place in nearbyGeographicPlaces" :key="place.fingerprintKey" class="world-view-nearby-row">
                        <span class="world-view-nearby-row-label">⬢ {{ place.displayName }}</span>
                        <span class="world-view-nearby-row-distance">{{ place.distance }}m {{ place.direction }}</span>
                        <button class="action-btn world-view-nearby-row-go" @click="openFocusForGeographicPlace(place.fingerprintKey)">Info</button>
                        <button class="action-btn world-view-nearby-row-go" @click="goToGeographicPlace(place.fingerprintKey)">Go</button>
                    </div>
                </CollapsibleSection>
                <CollapsibleSection
                    title="Nearby Landmarks"
                    :count="nearbyLandmarkRows.length"
                    :collapsed="nearbySectionsCollapsed.landmarks"
                    @toggle="setNearbySectionCollapsed('landmarks', NEARBY_LANDMARKS_SECTION, $event)"
                >
                    <p v-if="nearbyLandmarkRows.length === 0" class="world-view-nearby-empty">Nothing nearby yet.</p>
                    <div v-for="landmark in nearbyLandmarkRows" :key="landmark.id" class="world-view-nearby-row">
                        <span class="world-view-nearby-row-label">★ {{ landmark.title }}</span>
                        <span class="world-view-nearby-row-distance">{{ landmark.distance }}m {{ landmark.direction }}</span>
                        <button class="action-btn world-view-nearby-row-go" @click="openFocusForLocation(landmark.id)">Info</button>
                        <button class="action-btn world-view-nearby-row-go" @click="focusLocation(landmark.id)">Go</button>
                    </div>
                </CollapsibleSection>
                <CollapsibleSection
                    title="Nearby People"
                    :count="nearbyPeopleRows.length"
                    :collapsed="nearbySectionsCollapsed.people"
                    @toggle="setNearbySectionCollapsed('people', NEARBY_PEOPLE_SECTION, $event)"
                >
                    <p v-if="nearbyPeopleRows.length === 0" class="world-view-nearby-empty">Nobody nearby yet.</p>
                    <div v-for="person in nearbyPeopleRows" :key="person.identityId" class="world-view-nearby-row">
                        <span class="world-view-nearby-row-label">{{ person.displayName }}</span>
                        <span class="world-view-nearby-row-distance">{{ person.distance }}m {{ person.direction }}</span>
                        <button
                            v-if="person.deviceId"
                            class="action-btn world-view-nearby-row-go"
                            @click="openFocusForCollaborator(person.deviceId)"
                        >Info</button>
                        <button
                            v-if="person.deviceId"
                            class="action-btn world-view-nearby-row-go"
                            @click="followCollaborator(person.deviceId)"
                        >Go</button>
                    </div>
                </CollapsibleSection>
                <!--
                    An empty list means no claims were discovered nearby, never that the place
                    has no name. The error never hides the last successful results.
                -->
                <CollapsibleSection
                    title="Nearby Place Names"
                    :count="nearbyPlaceNamingClaimRows.length"
                    :collapsed="nearbySectionsCollapsed.placeNaming"
                    @toggle="setNearbySectionCollapsed('placeNaming', NEARBY_PLACE_NAMING_SECTION, $event)"
                >
                    <p v-if="placeNamingDiscoveryError" class="world-view-nearby-empty world-view-place-naming-error">
                        Place naming discovery is temporarily unavailable — showing the last known claims, if any.
                    </p>
                    <p v-if="nearbyPlaceNamingClaimRows.length === 0" class="world-view-nearby-empty">No nearby place naming claims were discovered.</p>
                    <div
                        v-for="claim in nearbyPlaceNamingClaimRows"
                        :key="claim.claimId"
                        class="world-view-nearby-row world-view-place-naming-row"
                        :title="claim.claimId"
                    >
                        <span class="world-view-nearby-row-label">✎ {{ claim.name }}</span>
                        <span class="world-view-nearby-row-distance" v-if="claim.position">at ({{ Math.round(claim.position.x) }}, {{ Math.round(claim.position.z) }})</span>
                        <span class="world-view-place-naming-author">claimed by {{ claim.authorDisplayName }}</span>
                        <!-- No signature/verification indicator here (see nearbyPlaceNamingClaimRows). -->
                        <span v-if="claim.createdAtLabel" class="world-view-place-naming-created">Created: {{ claim.createdAtLabel }}</span>
                        <!-- Navigate only moves the camera; it never adopts, verifies or renames. -->
                        <button
                            class="action-btn world-view-nearby-row-go"
                            @click="navigateToNearbyPlaceNamingClaim(claim)"
                        >Navigate</button>
                        <!--
                            Adopt is the only action that imports a claim, and only on this click. Once
                            saved, a passive "Already saved" line replaces the button ("saved", not
                            "adopted": the store also holds the viewer's own claims).
                        -->
                        <button
                            v-if="!claim.alreadySaved"
                            class="action-btn world-view-nearby-row-adopt"
                            @click="adoptNearbyPlaceNamingClaim(claim)"
                        >Adopt</button>
                        <span v-else class="world-view-nearby-row-status">✓ Already saved</span>
                    </div>
                </CollapsibleSection>
                <!--
                    WorldEncounterCanvas mounted inside Explore, with the app-wide collaborators
                    and this view's thin command wrappers passed straight through. All encounter
                    behavior stays inside the canvas; this view constructs and decides nothing.
                -->
                <CollapsibleSection
                    title="World Encounters"
                    :collapsed="nearbySectionsCollapsed.worldEncounters"
                    @toggle="setNearbySectionCollapsed('worldEncounters', WORLD_ENCOUNTERS_SECTION, $event)"
                >
                    <WorldEncounterCanvas
                        :discoveryCommand="discoverWorldEncounterPublicationCommand"
                        :registry="worldDiscoverySourceRegistry"
                        :materialSources="worldEncounterMaterialSources"
                        :materialVerifier="worldEncounterMaterialVerifier"
                        :distributionLifecycleStore="publicationDistributionLifecycleStore"
                        :distributionCommand="distributeWorldEncounterPublication"
                        :snapshotDistributionCommand="distributeWorldEncounterSnapshot"
                        :snapshotDistributionStorageTypes="snapshotDistributionStorageTypes"
                        :defaultDiscoveryDistributionProvider="defaultAnnouncementDiscoveryProvider"
                        :defaultContentDistributionProvider="defaultContentDistributionProvider"
                        :discoverSnapshotCommand="discoverOwnSnapshot"
                        :worldDiscoveryLeadRegistry="worldDiscoveryLeadRegistry"
                        :leadAssociationsQuery="worldEncounterLeadAssociationsQuery"
                        :getPublicationCommentariesCommand="getPublicationCommentariesCommand"
                        :addPublicationCommentaryCommand="addPublicationCommentaryCommand"
                        :viewerIdentityId="myIdentityId"
                        :defaultDiscoveryTag="publicationDiscoveryTag"
                        :publicationAdmissionLog="worldEncounterPublicationAdmissionLog"
                        :decentralizedPublicationDiscoveryProvider="decentralizedDiscoveryProviderForEnrichment"
                        :observerLocalEncounterRegistry="observerLocalEncounterStore"
                        :openPublicationCommand="openEncounteredPublicationCommand"
                        :forkPublicationCommand="forkEncounteredPublicationCommand"
                        :explorePublicationCommand="exploreEncounteredPublicationCommand"
                    />
                </CollapsibleSection>
            </div>`;
