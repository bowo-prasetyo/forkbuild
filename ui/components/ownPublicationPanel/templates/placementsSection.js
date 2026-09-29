// Own Publication panel template: the Publication's placements list.
// It renders in OwnPublicationPanel's scope, so it uses the component's props, data, computed properties and methods.
export const placementsSectionTemplate = `<!--
                Every placement of the Publication, one row each, with that placement's own
                Move and Remove. Ownership only gates the buttons locally; the signed
                revision is what is authorized.
            -->
            <div v-if="getPublicationPlacementsCommand" class="own-publication-placements">
                <h5 class="own-publication-placements-title">{{ t('ownPublicationPanel.placementsCount', { count: publicationPlacements.length }) }}</h5>

                <p v-if="publicationPlacementsError" class="own-publication-placements-error">{{ publicationPlacementsError }}</p>

                <p v-else-if="!publicationPlacements.length" class="own-publication-placements-empty">
                    {{ t('ownPublicationPanel.thisPublicationHasNotBeen') }}
                </p>
                <ul v-else class="own-publication-placements-list">
                    <li
                        v-for="placement in publicationPlacements"
                        :key="placement.placementId"
                        class="own-publication-placement-entry"
                    >
                        <dl class="own-publication-placement-detail">
                            <dt>{{ t('ownPublicationPanel.position') }}</dt>
                            <dd>{{ placement.position.x.toFixed(1) }}, {{ placement.position.y.toFixed(1) }}, {{ placement.position.z.toFixed(1) }}</dd>
                            <dt>{{ t('ownPublicationPanel.revision') }}</dt>
                            <dd>{{ placement.revision }}</dd>
                            <dt v-if="placement.owner">{{ t('ownPublicationPanel.owner') }}</dt>
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
                                :title="placement.movable ? t('ownPublicationPanel.moveThisPlacementToAnother') : t('ownPublicationPanel.onlyTheOwnerOfThis')"
                                @click="movePublicationPlacement(placement)"
                            >{{ t('ownPublicationPanel.move') }}</button>
                            <button
                                v-if="removePlacementCommand"
                                type="button"
                                class="action-btn own-publication-placement-remove-request-action"
                                :disabled="!placement.removable"
                                :title="placement.removable ? t('ownPublicationPanel.removeThisPlacementFromThe2') : t('ownPublicationPanel.onlyTheOwnerOfThis2')"
                                @click="requestPlacementRemoval(placement)"
                            >{{ t('ownPublicationPanel.remove') }}</button>
                        </div>
                        <div
                            v-else-if="removePlacementCommand"
                            class="own-publication-placement-remove-confirm"
                            role="alertdialog"
                            :aria-label="t('ownPublicationPanel.confirmPlacementRemoval')"
                        >
                            <p class="own-publication-placement-remove-confirm-text">
                                {{ publicationPlacements.length === 1
                                    ? t('ownPublicationPanel.removeTheOnlyPlacementThe')
                                    : t('ownPublicationPanel.removeThisPlacementFromThe') }}
                            </p>
                            <button
                                type="button"
                                class="action-btn action-btn--danger own-publication-placement-remove-action"
                                @click="confirmPlacementRemoval(placement)"
                            >{{ t('ownPublicationPanel.remove2') }}</button>
                            <button
                                type="button"
                                class="action-btn own-publication-placement-remove-cancel-action"
                                @click="pendingRemovalPlacementId = null"
                            >{{ t('ownPublicationPanel.cancel') }}</button>
                        </div>
                    </li>
                </ul>

                <div class="own-publication-placement-actions">
                    <!--
                        Always enabled with a publication: a Publication can be placed any number of
                        times. Labelled "Add" so it is never mistaken for "show" or "move".
                    -->
                    <button
                        v-if="placePublicationCommand"
                        type="button"
                        class="action-btn own-publication-place-action"
                        :disabled="!publication"
                        :title="t('ownPublicationPanel.placesThisSameBuildAgain')"
                        @click="placeOwnPublication"
                    >{{ t('ownPublicationPanel.addPlacementHere') }}</button>
                    <!-- The host's own placement actions (World View's Move Placement). -->
                    <slot name="placement-actions"></slot>
                </div>
            </div>`;
