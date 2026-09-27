// Own Publication panel template: the Publication's placements list.
// It renders in OwnPublicationPanel's scope, so it uses the component's props, data, computed properties and methods.
export const placementsSectionTemplate = `<!--
                Every placement of the Publication, one row each, with that copy's own
                Move and Remove. Ownership only gates the buttons locally; the signed
                revision is what is authorized.
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
                        <div
                            v-if="(movePlacementCommand || removePlacementCommand) && pendingRemovalPlacementId !== placement.placementId"
                            class="own-publication-placement-row-actions"
                        >
                            <button
                                v-if="movePlacementCommand"
                                type="button"
                                class="action-btn own-publication-placement-move-action"
                                :disabled="!placement.movable"
                                :title="placement.movable ? 'Move this copy to another position' : 'Only the owner of this copy can move it'"
                                @click="movePublicationPlacement(placement)"
                            >Move…</button>
                            <button
                                v-if="removePlacementCommand"
                                type="button"
                                class="action-btn own-publication-placement-remove-request-action"
                                :disabled="!placement.removable"
                                :title="placement.removable ? 'Remove this copy from the World' : 'Only the owner of this copy can remove it'"
                                @click="requestPlacementRemoval(placement)"
                            >Remove…</button>
                        </div>
                        <div
                            v-else-if="removePlacementCommand"
                            class="own-publication-placement-remove-confirm"
                            role="alertdialog"
                            aria-label="Confirm placement removal"
                        >
                            <p class="own-publication-placement-remove-confirm-text">
                                {{ publicationPlacements.length === 1
                                    ? 'Remove the only copy? The build will no longer appear in the World, but stays published and can be placed again.'
                                    : 'Remove this copy from the World? The other copies and the Publication stay.' }}
                            </p>
                            <button
                                type="button"
                                class="action-btn action-btn--danger own-publication-placement-remove-action"
                                @click="confirmPlacementRemoval(placement)"
                            >Remove</button>
                            <button
                                type="button"
                                class="action-btn own-publication-placement-remove-cancel-action"
                                @click="pendingRemovalPlacementId = null"
                            >Cancel</button>
                        </div>
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
                        title="Adds another copy of this build to the World at your current position. To relocate an existing copy, use its Move… button above."
                        @click="placeOwnPublication"
                    >Place Copy Here</button>
                    <!-- The host's own placement actions (World View's Move Placement). -->
                    <slot name="placement-actions"></slot>
                </div>
            </div>`;
