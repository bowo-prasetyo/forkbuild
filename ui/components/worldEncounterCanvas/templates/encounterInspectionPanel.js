// World Encounter canvas template: the selected encounter's inspection panel, with its snapshot
// actions and commentary.
// It renders in WorldEncounterCanvas's scope, so it uses the component's props, data, computed properties and methods.
export const encounterInspectionPanelTemplate = `<div v-if="selectedEncounter" class="world-encounter-inspection-panel">
                <h4 class="world-encounter-inspection-title">World Encounter</h4>

                <dl v-if="selectedEncounterInspection && selectedEncounterInspection.kind === 'PUBLICATION'" class="world-encounter-inspection-detail">
                    <dt>Kind</dt>
                    <dd>Publication</dd>
                    <dt>Source</dt>
                    <dd class="world-encounter-inspection-source" :class="'world-encounter-inspection-source--' + selectedEncounterPresentationSourceLabel.toLowerCase()">{{ selectedEncounterPresentationSourceLabel }}</dd>
                    <dt>Title</dt>
                    <dd>{{ selectedEncounterInspection.title }}</dd>
                    <dt>Publisher</dt>
                    <dd>{{ selectedEncounterInspectionPublisherIdentityLabel }}</dd>
                    <dt>Signed</dt>
                    <dd>{{ selectedEncounterInspection.isSigned ? 'Yes' : 'No' }}</dd>
                    <dt>Position</dt>
                    <dd>{{ selectedEncounterInspection.x }}, {{ selectedEncounterInspection.y }}, {{ selectedEncounterInspection.z }}</dd>
                    <dt>Anchors</dt>
                    <dd>{{ selectedEncounterInspection.anchorCount }}</dd>
                    <dt>Placements</dt>
                    <dd>{{ selectedEncounterInspection.placementCount }}</dd>
                    <template v-if="selectedEncounterSnapshotInspection">
                        <dt>Content Hash</dt>
                        <dd class="world-encounter-inspection-content-hash">{{ selectedEncounterSnapshotInspection.contentHash || 'Unknown' }}</dd>
                    </template>
                </dl>

                <dl v-else-if="selectedEncounterInspection && selectedEncounterInspection.kind === 'AVATAR'" class="world-encounter-inspection-detail">
                    <dt>Kind</dt>
                    <dd>Avatar</dd>
                    <dt>Source</dt>
                    <dd class="world-encounter-inspection-source" :class="'world-encounter-inspection-source--' + selectedEncounterPresentationSourceLabel.toLowerCase()">{{ selectedEncounterPresentationSourceLabel }}</dd>
                    <dt>Name</dt>
                    <dd>{{ selectedEncounterInspection.displayName }}</dd>
                    <dt>Owner</dt>
                    <dd>{{ selectedEncounterInspection.ownerIdentity }}</dd>
                    <dt>Position</dt>
                    <dd>{{ selectedEncounterInspection.x }}, {{ selectedEncounterInspection.y }}, {{ selectedEncounterInspection.z }}</dd>
                </dl>

                <p v-else class="world-encounter-inspection-unavailable">
                    This encounter is no longer part of the World.
                </p>

                <div v-if="selectedEncounterSnapshotInspection" class="world-encounter-inspection-actions">
                    <button
                        type="button"
                        class="world-encounter-unregister-snapshot"
                        @click="unregisterSelectedSnapshot"
                    >Remove Snapshot from World</button>
                </div>

                <!-- Commentary for a live PUBLICATION selection. Not gated on ownership. -->
                <div v-if="encounterCommentaryPublicationId && getPublicationCommentariesCommand" class="world-encounter-commentary-panel">
                    <h4 class="world-encounter-commentary-title">Commentary</h4>

                    <button
                        type="button"
                        class="action-btn world-encounter-commentary-toggle"
                        @click="toggleEncounterCommentary"
                    >{{ encounterCommentaryOpen ? 'Hide Comments' : 'Comment' }}</button>

                    <div v-if="encounterCommentaryOpen" class="world-encounter-commentary-body">
                        <p v-if="encounterCommentaryError" class="world-encounter-commentary-error">{{ encounterCommentaryError }}</p>

                        <PublicationCommentaryRemoteCheck :publication-id="encounterCommentaryPublicationId" @refreshed="refreshEncounterCommentaries" />

                        <p v-if="!encounterCommentaries.length" class="world-encounter-commentary-empty">No commentary yet.</p>
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
                            Sign in to add commentary.
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
                                placeholder="Add a comment…"
                            ></textarea>
                            <button
                                type="submit"
                                class="action-btn world-encounter-commentary-submit-action"
                                :disabled="!newEncounterCommentaryText.trim() || encounterCommentarySubmitting"
                            >{{ encounterCommentarySubmitting ? 'Posting…' : 'Post Comment' }}</button>
                        </form>
                    </div>
                </div>
            </div>`;
