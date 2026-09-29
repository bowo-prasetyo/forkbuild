// World view template: the Explore mode's Nearby section (Explore Here / What's Here?, then places,
// landmarks, people, place names and encounters).
// It renders in WorldView's scope, so it uses the names its setup() returns.
export const nearbySectionTemplate = `<div v-if="cameraPosition && primaryMode === WorldViewPrimaryMode.EXPLORE" class="world-view-section world-view-section--nearby">
                <h4>{{ t('worldView.nearby') }}</h4>
                <!--
                    Browse by camera position (docs/Principles.md, "Exploring A Location Is Not
                    A Second Search").
                -->
                <div class="world-view-actions world-view-actions--explore">
                    <button class="action-btn" @click="exploreHere">{{ t('worldView.exploreHere') }}</button>
                    <button class="action-btn" @click="whatsHere">{{ t('worldView.whatSHere') }}</button>
                </div>
                <!--
                    Places, Landmarks and People show only when they have something; while all
                    three are empty, one line says so. Place Names and World Encounters always
                    show: their emptiness is a discovery result of its own.
                -->
                <p
                    v-if="nearbyGeographicPlaces.length === 0 && nearbyLandmarkRows.length === 0 && nearbyPeopleRows.length === 0"
                    class="world-view-nearby-empty"
                >{{ t('worldView.noPlacesLandmarksOrPeople') }}</p>
                <CollapsibleSection
                    v-if="nearbyGeographicPlaces.length > 0"
                    :title="t('worldView.places')"
                    :count="nearbyGeographicPlaces.length"
                    :collapsed="nearbySectionsCollapsed.places"
                    @toggle="setNearbySectionCollapsed('places', NEARBY_PLACES_SECTION, $event)"
                >
                    <div v-for="place in nearbyGeographicPlaces" :key="place.fingerprintKey" class="world-view-nearby-row">
                        <span class="world-view-nearby-row-label">⬢ {{ place.displayName }}</span>
                        <span class="world-view-nearby-row-distance">{{ t('units.metersToward', { distance: place.distance, direction: compassText(place.direction) }) }}</span>
                        <button class="action-btn world-view-nearby-row-go" @click="openFocusForGeographicPlace(place.fingerprintKey)">{{ t('worldView.info') }}</button>
                        <button class="action-btn world-view-nearby-row-go" @click="goToGeographicPlace(place.fingerprintKey)">{{ t('worldView.go') }}</button>
                    </div>
                </CollapsibleSection>
                <CollapsibleSection
                    v-if="nearbyLandmarkRows.length > 0"
                    :title="t('worldView.landmarks')"
                    :count="nearbyLandmarkRows.length"
                    :collapsed="nearbySectionsCollapsed.landmarks"
                    @toggle="setNearbySectionCollapsed('landmarks', NEARBY_LANDMARKS_SECTION, $event)"
                >
                    <div v-for="landmark in nearbyLandmarkRows" :key="landmark.id" class="world-view-nearby-row">
                        <span class="world-view-nearby-row-label">★ {{ landmark.title }}</span>
                        <span class="world-view-nearby-row-distance">{{ t('units.metersToward', { distance: landmark.distance, direction: compassText(landmark.direction) }) }}</span>
                        <button class="action-btn world-view-nearby-row-go" @click="openFocusForLocation(landmark.id)">{{ t('worldView.info') }}</button>
                        <button class="action-btn world-view-nearby-row-go" @click="focusLocation(landmark.id)">{{ t('worldView.go') }}</button>
                    </div>
                </CollapsibleSection>
                <CollapsibleSection
                    v-if="nearbyPeopleRows.length > 0"
                    :title="t('worldView.people')"
                    :count="nearbyPeopleRows.length"
                    :collapsed="nearbySectionsCollapsed.people"
                    @toggle="setNearbySectionCollapsed('people', NEARBY_PEOPLE_SECTION, $event)"
                >
                    <div v-for="person in nearbyPeopleRows" :key="person.identityId" class="world-view-nearby-row">
                        <span class="world-view-nearby-row-label">{{ person.displayName }}</span>
                        <span class="world-view-nearby-row-distance">{{ t('units.metersToward', { distance: person.distance, direction: compassText(person.direction) }) }}</span>
                        <button
                            v-if="person.deviceId"
                            class="action-btn world-view-nearby-row-go"
                            @click="openFocusForCollaborator(person.deviceId)"
                        >{{ t('worldView.info') }}</button>
                        <button
                            v-if="person.deviceId"
                            class="action-btn world-view-nearby-row-go"
                            @click="followCollaborator(person.deviceId)"
                        >{{ t('worldView.go') }}</button>
                    </div>
                </CollapsibleSection>
                <!--
                    An empty list means no claims were discovered nearby, never that the place
                    has no name. The error never hides the last successful results.
                -->
                <CollapsibleSection
                    :title="t('worldView.placeNames')"
                    :count="nearbyPlaceNamingClaimRows.length"
                    :collapsed="nearbySectionsCollapsed.placeNaming"
                    @toggle="setNearbySectionCollapsed('placeNaming', NEARBY_PLACE_NAMING_SECTION, $event)"
                >
                    <p v-if="placeNamingDiscoveryError" class="world-view-nearby-empty world-view-place-naming-error">
                        {{ t('worldView.placeNamingDiscoveryIsTemporarily') }}
                    </p>
                    <p v-if="nearbyPlaceNamingClaimRows.length === 0" class="world-view-nearby-empty">{{ t('worldView.noNearbyPlaceNamingClaims') }}</p>
                    <div
                        v-for="claim in nearbyPlaceNamingClaimRows"
                        :key="claim.claimId"
                        class="world-view-nearby-row world-view-place-naming-row"
                        :title="claim.claimId"
                    >
                        <span class="world-view-nearby-row-label">✎ {{ claim.name }}</span>
                        <span class="world-view-nearby-row-distance" v-if="claim.position">{{ t('worldView.atPosition', { x: Math.round(claim.position.x), z: Math.round(claim.position.z) }) }}</span>
                        <span class="world-view-place-naming-author">{{ t('worldView.claimedBy', { author: claim.authorDisplayName }) }}</span>
                        <!-- No signature/verification indicator here (see nearbyPlaceNamingClaimRows). -->
                        <span v-if="claim.createdAtLabel" class="world-view-place-naming-created">{{ t('worldView.created', { when: claim.createdAtLabel }) }}</span>
                        <!-- Navigate only moves the camera; it never adopts, verifies or renames. -->
                        <button
                            class="action-btn world-view-nearby-row-go"
                            @click="navigateToNearbyPlaceNamingClaim(claim)"
                        >{{ t('worldView.navigate') }}</button>
                        <!--
                            Adopt is the only action that imports a claim, and only on this click. Once
                            saved, a passive "Already saved" line replaces the button ("saved", not
                            "adopted": the store also holds the viewer's own claims).
                        -->
                        <button
                            v-if="!claim.alreadySaved"
                            class="action-btn world-view-nearby-row-adopt"
                            @click="adoptNearbyPlaceNamingClaim(claim)"
                        >{{ t('worldView.adopt') }}</button>
                        <span v-else class="world-view-nearby-row-status">{{ t('worldView.alreadySaved') }}</span>
                    </div>
                </CollapsibleSection>
                <!--
                    Other people's builds whose publishers claim a position near here, drawn as
                    translucent ghosts. A claim is unverified: title and author come from the
                    build's own content. Accept Position is the only step that trusts it, and
                    places the Wanderer's own copy there.
                -->
                <CollapsibleSection
                    v-if="claimedBuildRows.length > 0"
                    :title="t('worldView.claimedBuilds')"
                    :count="claimedBuildRows.length"
                    :collapsed="nearbySectionsCollapsed.claimedBuilds"
                    @toggle="setNearbySectionCollapsed('claimedBuilds', NEARBY_CLAIMED_BUILDS_SECTION, $event)"
                >
                    <div
                        v-for="build in claimedBuildRows"
                        :key="build.key"
                        class="world-view-nearby-row world-view-claimed-build-row"
                        :title="build.publicationId"
                    >
                        <span class="world-view-nearby-row-label">◌ {{ build.title }}</span>
                        <span class="world-view-nearby-row-distance">{{ t('worldView.distanceAt', { distance: build.distance, x: Math.round(build.position.x), z: Math.round(build.position.z) }) }}</span>
                        <span v-if="build.publisherKey" class="world-view-claimed-build-author">
                            {{ t('worldView.signedByUnverified', { publisher: build.signedBy || t('worldView.anUnnamedPublisher'), key: build.publisherKey }) }}
                        </span>
                        <span v-else class="world-view-claimed-build-author">{{ build.author ? t('worldView.claimedByUnverified', { author: build.author }) : t('worldView.claimedUnverified') }}</span>
                        <button
                            class="action-btn world-view-nearby-row-go"
                            @click="navigateToClaimedBuild(build)"
                        >{{ t('worldView.navigate') }}</button>
                        <!-- Fetches and checks the signed Publication; never accepts by itself. -->
                        <button
                            v-if="build.canVerify"
                            class="action-btn world-view-claimed-build-verify"
                            :disabled="build.verifying"
                            :title="t('worldView.fetchThisBuildSSigned')"
                            @click="verifyClaimedBuild(build)"
                        >{{ build.verifying ? t('worldView.verifying') : t('worldView.verify') }}</button>
                        <button
                            class="action-btn world-view-claimed-build-accept"
                            :disabled="!build.acceptable"
                            :title="build.acceptanceHint"
                            @click="acceptClaimedBuild(build)"
                        >{{ t('worldView.acceptPosition') }}</button>
                        <button
                            class="action-btn world-view-claimed-build-hide"
                            :title="t('worldView.hideThisGhostForThe')"
                            @click="dismissClaimedBuild(build)"
                        >{{ t('worldView.hide') }}</button>
                        <span v-if="build.verificationMessage" class="world-view-claimed-build-hint">{{ build.verificationMessage }}</span>
                        <span v-else-if="!build.acceptable" class="world-view-claimed-build-hint">{{ build.acceptanceHint }}</span>
                    </div>
                </CollapsibleSection>
                <!--
                    WorldEncounterCanvas mounted inside Explore, with the app-wide collaborators
                    and this view's thin command wrappers passed straight through. All encounter
                    behavior stays inside the canvas; this view constructs and decides nothing.
                -->
                <CollapsibleSection
                    :title="t('worldView.worldEncounters')"
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
