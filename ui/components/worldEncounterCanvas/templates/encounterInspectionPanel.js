// World Encounter canvas template: the selected encounter's inspection panel, with its snapshot
// actions and commentary.
// It renders in WorldEncounterCanvas's scope, so it uses the component's props, data, computed properties and methods.
export const encounterInspectionPanelTemplate = `<div v-if="selectedEncounter" class="world-encounter-inspection-panel">
                <h4 class="world-encounter-inspection-title">{{ t('worldEncounterCanvas.worldEncounter') }}</h4>

                <dl v-if="selectedEncounterInspection && selectedEncounterInspection.kind === 'PUBLICATION'" class="world-encounter-inspection-detail">
                    <dt>{{ t('worldEncounterCanvas.kind') }}</dt>
                    <dd>{{ t('worldEncounterCanvas.publication') }}</dd>
                    <dt>{{ t('worldEncounterCanvas.source') }}</dt>
                    <dd class="world-encounter-inspection-source" :class="'world-encounter-inspection-source--' + selectedEncounterPresentationSourceLabel.toLowerCase()">{{ selectedEncounterPresentationSourceLabel }}</dd>
                    <dt>{{ t('worldEncounterCanvas.title') }}</dt>
                    <dd>{{ selectedEncounterInspection.title }}</dd>
                    <dt>{{ t('worldEncounterCanvas.publisher') }}</dt>
                    <dd>{{ selectedEncounterInspectionPublisherIdentityLabel }}</dd>
                    <dt>{{ t('worldEncounterCanvas.signed') }}</dt>
                    <dd>{{ selectedEncounterInspection.isSigned ? t('worldEncounterCanvas.yes') : t('worldEncounterCanvas.no') }}</dd>
                    <dt>{{ t('worldEncounterCanvas.position') }}</dt>
                    <dd>{{ selectedEncounterInspection.x }}, {{ selectedEncounterInspection.y }}, {{ selectedEncounterInspection.z }}</dd>
                    <dt>{{ t('worldEncounterCanvas.anchors') }}</dt>
                    <dd>{{ selectedEncounterInspection.anchorCount }}</dd>
                    <dt>{{ t('worldEncounterCanvas.placements') }}</dt>
                    <dd>{{ selectedEncounterInspection.placementCount }}</dd>
                    <template v-if="selectedEncounterSnapshotInspection">
                        <dt>{{ t('worldEncounterCanvas.contentHash') }}</dt>
                        <dd class="world-encounter-inspection-content-hash">{{ selectedEncounterSnapshotInspection.contentHash || t('worldEncounterCanvas.unknown') }}</dd>
                    </template>
                </dl>

                <dl v-else-if="selectedEncounterInspection && selectedEncounterInspection.kind === 'AVATAR'" class="world-encounter-inspection-detail">
                    <dt>{{ t('worldEncounterCanvas.kind') }}</dt>
                    <dd>{{ t('worldEncounterCanvas.avatar') }}</dd>
                    <dt>{{ t('worldEncounterCanvas.source') }}</dt>
                    <dd class="world-encounter-inspection-source" :class="'world-encounter-inspection-source--' + selectedEncounterPresentationSourceLabel.toLowerCase()">{{ selectedEncounterPresentationSourceLabel }}</dd>
                    <dt>{{ t('worldEncounterCanvas.name') }}</dt>
                    <dd>{{ selectedEncounterInspection.displayName }}</dd>
                    <dt>{{ t('worldEncounterCanvas.owner') }}</dt>
                    <dd>{{ selectedEncounterInspection.ownerIdentity }}</dd>
                    <dt>{{ t('worldEncounterCanvas.position') }}</dt>
                    <dd>{{ selectedEncounterInspection.x }}, {{ selectedEncounterInspection.y }}, {{ selectedEncounterInspection.z }}</dd>
                </dl>

                <p v-else class="world-encounter-inspection-unavailable">
                    {{ t('worldEncounterCanvas.thisEncounterIsNoLonger') }}
                </p>

                <div v-if="selectedEncounterSnapshotInspection" class="world-encounter-inspection-actions">
                    <button
                        type="button"
                        class="world-encounter-unregister-snapshot"
                        @click="unregisterSelectedSnapshot"
                    >{{ t('worldEncounterCanvas.removeSnapshotFromWorld') }}</button>
                </div>

                <!-- Commentary for a live PUBLICATION selection. Not gated on ownership. -->
                <div v-if="encounterCommentaryPublicationId && getPublicationCommentariesCommand" class="world-encounter-commentary-panel">
                    <h4 class="world-encounter-commentary-title">{{ t('worldEncounterCanvas.commentary') }}</h4>

                    <button
                        type="button"
                        class="action-btn world-encounter-commentary-toggle"
                        @click="toggleEncounterCommentary"
                    >{{ encounterCommentaryOpen ? t('worldEncounterCanvas.hideComments') : t('worldEncounterCanvas.comment') }}</button>

                    <div v-if="encounterCommentaryOpen" class="world-encounter-commentary-body">
                        <p v-if="encounterCommentaryError" class="world-encounter-commentary-error">{{ encounterCommentaryError }}</p>

                        <PublicationCommentaryRemoteCheck :publication-id="encounterCommentaryPublicationId" @refreshed="refreshEncounterCommentaries" />

                        <p v-if="!encounterCommentaries.length" class="world-encounter-commentary-empty">{{ t('worldEncounterCanvas.noCommentaryYet') }}</p>
                        <ul v-else class="world-encounter-commentary-list">
                            <li
                                v-for="commentary in encounterCommentaries"
                                :key="commentary.commentaryId"
                                class="world-encounter-commentary-entry"
                            >
                                <span class="world-encounter-commentary-author">{{ commentary.authorIdentityId }}</span>
                                <p class="world-encounter-commentary-content">{{ commentary.content }}</p>
                            </li>
                        </ul>

                        <p v-if="addPublicationCommentaryCommand && !viewerIdentityId" class="world-encounter-commentary-signin-hint">
                            {{ t('worldEncounterCanvas.signInToAddCommentary') }}
                        </p>
                        <form
                            v-else-if="addPublicationCommentaryCommand"
                            class="world-encounter-commentary-form"
                            @submit.prevent="submitEncounterCommentary"
                        >
                            <textarea
                                v-model="newEncounterCommentaryText"
                                class="world-encounter-commentary-input"
                                :disabled="encounterCommentarySubmitting"
                                :placeholder="t('worldEncounterCanvas.addAComment')"
                            ></textarea>
                            <button
                                type="submit"
                                class="action-btn world-encounter-commentary-submit-action"
                                :disabled="!newEncounterCommentaryText.trim() || encounterCommentarySubmitting"
                            >{{ encounterCommentarySubmitting ? t('worldEncounterCanvas.posting') : t('worldEncounterCanvas.postComment') }}</button>
                        </form>
                    </div>
                </div>
            </div>`;
