// Own Publication panel template: the Publication's placements list.
// It renders in OwnPublicationPanel's scope, so it uses the component's props, data, computed properties and methods.
export const placementsSectionTemplate = `<!--
                Read-only list of every placement (per-placement actions live in
                PlacementInfoPanel).
            -->
            <div v-if="getPublicationPlacementsCommand" class="own-publication-placements">
                <h5 class="own-publication-placements-title">Placements ({{ publicationPlacements.length }})</h5>

                <p v-if="publicationPlacementsError" class="own-publication-placements-error">{{ publicationPlacementsError }}</p>

                <p v-else-if="!publicationPlacements.length" class="own-publication-placements-empty">
                    This Publication has not been placed anywhere yet.
                </p>
                <ul v-else class="own-publication-placements-list">
                    <li
                        v-for="placement in publicationPlacements"
                        :key="placement.placementId"
                        class="own-publication-placement-entry"
                    >
                        <dl class="own-publication-placement-detail">
                            <dt>Position</dt>
                            <dd>{{ placement.position.x.toFixed(1) }}, {{ placement.position.y.toFixed(1) }}, {{ placement.position.z.toFixed(1) }}</dd>
                            <dt>Revision</dt>
                            <dd>{{ placement.revision }}</dd>
                            <dt v-if="placement.owner">Owner</dt>
                            <dd v-if="placement.owner">{{ placement.owner }}</dd>
                        </dl>
                    </li>
                </ul>

                <div class="own-publication-placement-actions">
                    <!--
                        Always enabled with a publication: a Publication can be placed any number of
                        times. Labelled as a copy so it is never mistaken for "show" or "move".
                    -->
                    <button
                        v-if="placePublicationCommand"
                        type="button"
                        class="action-btn own-publication-place-action"
                        :disabled="!publication"
                        title="Adds another copy of this build to the World at your current position. To relocate an existing copy, use Move Placement."
                        @click="placeOwnPublication"
                    >Place Copy Here</button>
                    <!-- The host's own placement actions (World View's Move Placement). -->
                    <slot name="placement-actions"></slot>
                </div>
            </div>`;
