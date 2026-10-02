// World Encounter canvas template: the inspection panel for a discovered (observer-local)
// publication, with its actions and commentary.
// It renders in WorldEncounterCanvas's scope, so it uses the component's props, data, computed properties and methods.
export const observerLocalEncounterPanelTemplate = `<!--
                A separate inspection panel for an observer-local encounter: a
                session-local observation with no World placement, never merged into the
                World Encounter panel. Both can be open at once.
            -->
            <div v-if="selectedObserverLocalEncounter" class="world-encounter-inspection-panel world-encounter-observer-local-inspection-panel">
                <h4 class="world-encounter-inspection-title">{{ t('worldEncounterCanvas.discoveredPublication') }}</h4>

                <!-- Answers "is it temporary?" explicitly — see this
                     milestone's own product brief, item 3: "The UI can
                     explain that... This accurately reflects the
                     session-scoped store without implying World
                     placement." -->
                <p class="world-encounter-observer-local-inspection-note">
                    {{ t('worldEncounterCanvas.thisWasDiscoveredDuringYour') }}
                </p>

                <dl class="world-encounter-inspection-detail">
                    <dt>{{ t('worldEncounterCanvas.publication') }}</dt>
                    <dd>{{ selectedObserverLocalEncounter.publicationId }}</dd>
                    <dt>{{ t('worldEncounterCanvas.contentHash') }}</dt>
                    <dd class="world-encounter-inspection-content-hash">{{ selectedObserverLocalEncounter.contentHash }}</dd>
                </dl>

                <!-- Same Material/Verification labels as the primary panel. -->
                <template v-if="observerLocalEncounterInspection">
                    <h4 class="world-encounter-material-title">{{ t('worldEncounterCanvas.material') }}</h4>
                    <dl class="world-encounter-material-detail">
                        <dt>{{ t('worldEncounterCanvas.status') }}</dt>
                        <dd>{{ describeMaterialLoadStatusLabel(observerLocalEncounterInspection.loading.status) }}</dd>
                    </dl>

                    <h4 class="world-encounter-verification-title">{{ t('worldEncounterCanvas.verification') }}</h4>
                    <dl class="world-encounter-verification-detail">
                        <dt>{{ t('worldEncounterCanvas.status') }}</dt>
                        <dd>{{ describeMaterialVerificationStatusLabel(observerLocalEncounterInspection.verification.status) }}</dd>
                    </dl>
                </template>
                <p v-else class="world-encounter-inspection-unavailable">
                    {{ t('worldEncounterCanvas.thisPublicationSMaterialCould') }}
                </p>

                <!--
                    Only once observerLocalEncounterActionablePublication exists (AVAILABLE +
                    VERIFIED); every action gets that resolved object. Presented with the
                    Publication's title and plain verbs; ids stay in the detail list above.
                -->
                <div v-if="observerLocalEncounterActionablePublication" class="world-encounter-observer-local-actions">
                    <h4 class="world-encounter-observer-local-actions-title">{{ observerLocalEncounterActionablePublication.title || t('worldEncounterCanvas.thisPublication') }}</h4>
                    <button
                        v-if="openPublicationCommand"
                        type="button"
                        class="action-btn world-encounter-observer-local-open"
                        @click="openObserverLocalEncounterPublication"
                    >{{ t('worldEncounterCanvas.open') }}</button>
                    <button
                        v-if="explorePublicationCommand"
                        type="button"
                        class="action-btn world-encounter-observer-local-explore"
                        @click="exploreObserverLocalEncounterPublication"
                    >{{ t('worldEncounterCanvas.explore') }}</button>
                    <button
                        v-if="forkPublicationCommand"
                        type="button"
                        class="action-btn world-encounter-observer-local-fork"
                        @click="forkObserverLocalEncounterPublication"
                    >{{ t('worldEncounterCanvas.fork') }}</button>
                </div>

                <!--
                    Commentary for an observer-local encounter, mirroring the primary panel
                    with separate observerLocalEncounterCommentary* state (never
                    encounterCommentary*). Not gated on actionability; commentary never waits
                    on material.
                -->
                <div v-if="observerLocalEncounterCommentaryPublicationId && getPublicationCommentariesCommand" class="world-encounter-observer-local-commentary-panel">
                    <h4 class="world-encounter-observer-local-commentary-title">{{ t('worldEncounterCanvas.commentary') }}</h4>

                    <button
                        type="button"
                        class="action-btn world-encounter-observer-local-commentary-toggle"
                        @click="toggleObserverLocalEncounterCommentary"
                    >{{ observerLocalEncounterCommentaryOpen ? t('worldEncounterCanvas.hideComments') : t('worldEncounterCanvas.comment') }}</button>

                    <div v-if="observerLocalEncounterCommentaryOpen" class="world-encounter-observer-local-commentary-body">
                        <p v-if="observerLocalEncounterCommentaryError" class="world-encounter-observer-local-commentary-error">{{ observerLocalEncounterCommentaryError }}</p>

                        <PublicationCommentaryRemoteCheck :publication-id="observerLocalEncounterCommentaryPublicationId" @refreshed="refreshObserverLocalEncounterCommentaries" />

                        <p v-if="!observerLocalEncounterCommentaries.length" class="world-encounter-observer-local-commentary-empty">{{ t('worldEncounterCanvas.noCommentaryYet') }}</p>
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
                            {{ t('worldEncounterCanvas.signInToAddCommentary') }}
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
                                :placeholder="t('worldEncounterCanvas.addAComment')"
                            ></textarea>
                            <CommentaryDistributionPicker v-model="commentaryDiscoveryProvider" :disabled="observerLocalEncounterCommentarySubmitting" />
                            <button
                                type="submit"
                                class="action-btn world-encounter-observer-local-commentary-submit-action"
                                :disabled="!newObserverLocalEncounterCommentaryText.trim() || observerLocalEncounterCommentarySubmitting"
                            >{{ observerLocalEncounterCommentarySubmitting ? t('worldEncounterCanvas.posting') : t('worldEncounterCanvas.postComment') }}</button>
                        </form>
                        <p v-if="addPublicationCommentaryCommand && observerLocalEncounterCommentaryDistributionProvider" class="publication-commentary-distribution-status">
                            {{ t('publicationCommentarySection.savedDistributionRequested', { provider: discoveryProviderLabel(observerLocalEncounterCommentaryDistributionProvider) }) }}
                        </p>
                    </div>
                </div>

                <button
                    type="button"
                    class="action-btn world-encounter-observer-local-inspection-close"
                    @click="dismissObserverLocalEncounterInspection"
                >{{ t('worldEncounterCanvas.close') }}</button>
            </div>`;
