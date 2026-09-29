// World view template: the coordinates, compass and nearby-marker legend floating over the viewport.
// It renders in WorldView's scope, so it uses the names its setup() returns.
export const navigationHudSectionTemplate = `<!--
                Coordinates and compass float over the viewport, transparent so the World
                stays dominant.
            -->
            <div v-if="cameraPosition" class="world-view-nav-hud">
                <p class="world-view-nav-hud-coords">
                    {{ cameraPosition.x.toFixed(1) }}, {{ cameraPosition.y.toFixed(1) }}, {{ cameraPosition.z.toFixed(1) }}
                </p>
                <div class="world-view-nav-hud-compass">
                    <CompassIndicator :heading="compassHeading" :markers="compassMarkers" />
                </div>
                <!--
                    The human-named place, shown above the derived terrain description and never
                    merged with it (docs/Principles.md, "Users Name Places; The World Derives
                    Geography From Names").
                -->
                <div v-if="spatialContext && spatialContext.placeName" class="world-view-nav-context world-view-nav-context--place">
                    {{ spatialContext.placeName }}
                </div>
                <div v-if="spatialContext && spatialContextDescription(spatialContext)" class="world-view-nav-context">
                    {{ spatialContextDescription(spatialContext) }}
                </div>
                <!-- Readable legend for the compass markers: the dial has no room for labels. -->
                <div v-if="spatialContext && spatialContext.nearbyStructures && spatialContext.nearbyStructures.length > 0" class="world-view-nav-markers">
                    <div v-for="structure in spatialContext.nearbyStructures.slice(0, 3)" :key="structure.id" class="world-view-nav-marker">
                        <span class="marker-direction">{{ compassText(structure.direction) }}</span>
                        <span class="marker-label">{{ structure.title }} ({{ t('units.meters', { distance: structure.distance }) }})</span>
                    </div>
                </div>
                <div v-if="spatialContext && spatialContext.nearbyCollaborators && spatialContext.nearbyCollaborators.length > 0" class="world-view-nav-markers">
                    <div v-for="collab in spatialContext.nearbyCollaborators.slice(0, 3)" :key="collab.identityId" class="world-view-nav-marker collaborator">
                        <span class="marker-direction">{{ compassText(collab.direction) }}</span>
                        <span class="marker-label">{{ collab.displayName }} ({{ t('units.meters', { distance: collab.distance }) }})</span>
                    </div>
                </div>
                <div v-if="spatialContext && spatialContext.nearbyLandmarks && spatialContext.nearbyLandmarks.length > 0" class="world-view-nav-markers">
                    <div v-for="landmark in spatialContext.nearbyLandmarks.slice(0, 3)" :key="landmark.id" class="world-view-nav-marker landmark">
                        <span class="marker-direction">{{ compassText(landmark.direction) }}</span>
                        <span class="marker-label">★ {{ landmark.title }} ({{ t('units.meters', { distance: landmark.distance }) }})</span>
                    </div>
                </div>
                <div v-if="nearbyGeographicPlaces && nearbyGeographicPlaces.length > 0" class="world-view-nav-markers">
                    <div v-for="place in nearbyGeographicPlaces.slice(0, 3)" :key="place.fingerprintKey" class="world-view-nav-marker place">
                        <span class="marker-direction">{{ compassText(place.direction) }}</span>
                        <span class="marker-label">⬢ {{ place.displayName }} ({{ t('units.meters', { distance: place.distance }) }})</span>
                    </div>
                </div>
            </div>`;
