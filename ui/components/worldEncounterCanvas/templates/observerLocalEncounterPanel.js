// World Encounter canvas template: the inspection panel for a discovered (observer-local)
// publication, with its actions and commentary.
// It renders in WorldEncounterCanvas's scope, so it uses the component's props, data, computed properties and methods.
export const observerLocalEncounterPanelTemplate = `<!--
                A separate inspection panel for an observer-local encounter: a
                session-local observation with no World placement, never merged into the
                World Encounter panel. Both can be open at once.
            -->
            <div v-if="selectedObserverLocalEncounter" class="world-encounter-inspection-panel world-encounter-observer-local-inspection-panel">
                <h4 class="world-encounter-inspection-title">Discovered Publication</h4>

                <!-- Answers "is it temporary?" explicitly — see this
                     milestone's own product brief, item 3: "The UI can
                     explain that... This accurately reflects the
                     session-scoped store without implying World
                     placement." -->
                <p class="world-encounter-observer-local-inspection-note">
                    This was discovered during your current World session. It has not been placed
                    anywhere in the shared World, and will not be found here again after you leave
                    or reload.
                </p>

                <dl class="world-encounter-inspection-detail">
                    <dt>Publication</dt>
                    <dd>{{ selectedObserverLocalEncounter.publicationId }}</dd>
                    <dt>Content Hash</dt>
                    <dd class="world-encounter-inspection-content-hash">{{ selectedObserverLocalEncounter.contentHash }}</dd>
                </dl>

                <!-- Same Material/Verification labels as the primary panel. -->
                <template v-if="observerLocalEncounterInspection">
                    <h4 class="world-encounter-material-title">Material</h4>
                    <dl class="world-encounter-material-detail">
                        <dt>Status</dt>
                        <dd>{{ describeMaterialLoadStatusLabel(observerLocalEncounterInspection.loading.status) }}</dd>
                    </dl>

                    <h4 class="world-encounter-verification-title">Verification</h4>
                    <dl class="world-encounter-verification-detail">
                        <dt>Status</dt>
                        <dd>{{ describeMaterialVerificationStatusLabel(observerLocalEncounterInspection.verification.status) }}</dd>
                    </dl>
                </template>
                <p v-else class="world-encounter-inspection-unavailable">
                    This publication's material could not be inspected.
                </p>

                <!--
                    Only once observerLocalEncounterActionablePublication exists (AVAILABLE +
                    VERIFIED); every action gets that resolved object. Presented with the
                    Publication's title and plain verbs; ids stay in the detail list above.
                -->
                <div v-if="observerLocalEncounterActionablePublication" class="world-encounter-observer-local-actions">
                    <h4 class="world-encounter-observer-local-actions-title">{{ observerLocalEncounterActionablePublication.title || 'This publication' }}</h4>
                    <button
                        v-if="openPublicationCommand"
                        type="button"
                        class="action-btn world-encounter-observer-local-open"
                        @click="openObserverLocalEncounterPublication"
                    >Open</button>
                    <button
                        v-if="explorePublicationCommand"
                        type="button"
                        class="action-btn world-encounter-observer-local-explore"
                        @click="exploreObserverLocalEncounterPublication"
                    >Explore</button>
                    <button
                        v-if="forkPublicationCommand"
                        type="button"
                        class="action-btn world-encounter-observer-local-fork"
                        @click="forkObserverLocalEncounterPublication"
                    >Fork</button>
                </div>

                <!--
                    Commentary for an observer-local encounter, mirroring the primary panel
                    with separate observerLocalEncounterCommentary* state (never
                    encounterCommentary*). Not gated on actionability; commentary never waits
                    on material.
                -->
                <div v-if="observerLocalEncounterCommentaryPublicationId && getPublicationCommentariesCommand" class="world-encounter-observer-local-commentary-panel">
                    <h4 class="world-encounter-observer-local-commentary-title">Commentary</h4>

                    <button
                        type="button"
                        class="action-btn world-encounter-observer-local-commentary-toggle"
                        @click="toggleObserverLocalEncounterCommentary"
                    >{{ observerLocalEncounterCommentaryOpen ? 'Hide Comments' : 'Comment' }}</button>

                    <div v-if="observerLocalEncounterCommentaryOpen" class="world-encounter-observer-local-commentary-body">
                        <p v-if="observerLocalEncounterCommentaryError" class="world-encounter-observer-local-commentary-error">{{ observerLocalEncounterCommentaryError }}</p>

                        <PublicationCommentaryRemoteCheck :publication-id="observerLocalEncounterCommentaryPublicationId" @refreshed="refreshObserverLocalEncounterCommentaries" />

                        <p v-if="!observerLocalEncounterCommentaries.length" class="world-encounter-observer-local-commentary-empty">No commentary yet.</p>
                        <ul v-else class="world-encounter-observer-local-commentary-list">
                            <li
                                v-for="commentary in observerLocalEncounterCommentaries"
                                :key="commentary.commentaryId"
                                class="world-encounter-observer-local-commentary-entry"
                            >
                                <span class="world-encounter-observer-local-commentary-author">{{ commentary.authorIdentityId }}</span>
                                <p class="world-encounter-observer-local-commentary-content">{{ commentary.content }}</p>
                            </li>
                        </ul>

                        <p v-if="addPublicationCommentaryCommand && !viewerIdentityId" class="world-encounter-observer-local-commentary-signin-hint">
                            Sign in to add commentary.
                        </p>
                        <form
                            v-else-if="addPublicationCommentaryCommand"
                            class="world-encounter-observer-local-commentary-form"
                            @submit.prevent="submitObserverLocalEncounterCommentary"
                        >
                            <textarea
                                v-model="newObserverLocalEncounterCommentaryText"
                                class="world-encounter-observer-local-commentary-input"
                                :disabled="observerLocalEncounterCommentarySubmitting"
                                placeholder="Add a comment…"
                            ></textarea>
                            <button
                                type="submit"
                                class="action-btn world-encounter-observer-local-commentary-submit-action"
                                :disabled="!newObserverLocalEncounterCommentaryText.trim() || observerLocalEncounterCommentarySubmitting"
                            >{{ observerLocalEncounterCommentarySubmitting ? 'Posting…' : 'Post Comment' }}</button>
                        </form>
                    </div>
                </div>

                <button
                    type="button"
                    class="action-btn world-encounter-observer-local-inspection-close"
                    @click="dismissObserverLocalEncounterInspection"
                >Close</button>
            </div>`;
