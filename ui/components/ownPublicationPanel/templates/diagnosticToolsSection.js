// Own Publication panel template: the Diagnostic Tools popup for the manual Snapshot pipeline
// (its trigger is in the More menu).
// It renders in OwnPublicationPanel's scope, so it uses the component's props, data, computed properties and methods.
export const diagnosticToolsSectionTemplate = `<!--
                Groups the manual diagnostic pipeline in a popup, opened from the More menu
                (./publicationActionsSection.js). Presentation only: closing and reopening
                shows the same state.
            -->
            <div
                v-if="diagnosticToolsOpen"
                class="modal-overlay own-publication-diagnostic-overlay"
                @click.self="diagnosticToolsOpen = false"
            >
                <div class="modal-panel own-publication-diagnostic-panel">
                    <h3>{{ t('ownPublicationPanel.diagnosticTools') }}</h3>
                    <p class="own-publication-diagnostic-intro">
                        {{ t('ownPublicationPanel.useTheseToolsToManually') }}
                    </p>

                    <h4 class="own-publication-diagnostic-section-title">{{ t('ownPublicationPanel.snapshots') }}</h4>

            <!-- Needs no Publication; disabled only while busy. -->
            <button
                v-if="discoverSnapshotCandidatesCommand || discoverSnapshotCandidatesWithOutcomeCommand"
                type="button"
                class="action-btn own-publication-candidate-discovery-action"
                :disabled="snapshotCandidateDiscoveryExecuting"
                @click="discoverSnapshotCandidates"
            >{{ snapshotCandidateDiscoveryExecuting ? t('ownPublicationPanel.discovering') : t('ownPublicationPanel.discoverSnapshots') }}</button>

            <p v-if="snapshotCandidateDiscoveryError" class="own-publication-candidate-discovery-error">{{ snapshotCandidateDiscoveryError }}</p>

            <!--
                [] is a real result. 'unavailable' says the search could not complete rather
                than claiming nothing was announced. Shown in discovery order, unranked.
            -->
            <div v-else-if="snapshotCandidateDiscoveryResult" class="own-publication-candidate-list">
                <h5 class="own-publication-candidate-list-title">{{ t('ownPublicationPanel.discoveredSnapshots') }}</h5>
                <p v-if="snapshotCandidateDiscoveryResult.length === 0 && snapshotCandidateDiscoveryOutcome === 'unavailable'" class="own-publication-candidate-list-unavailable">
                    {{ t('ownPublicationPanel.snapshotDiscoveryIsCurrentlyUnavailable') }}
                </p>
                <p v-else-if="snapshotCandidateDiscoveryResult.length === 0" class="own-publication-candidate-list-empty">
                    {{ t('ownPublicationPanel.noSnapshotsHaveBeenAnnounced') }}
                </p>
                <ul v-else class="own-publication-candidate-list-items">
                    <li
                        v-for="(candidate, index) in snapshotCandidateDiscoveryResult"
                        :key="index"
                        class="own-publication-candidate-item"
                        :class="{ 'own-publication-candidate-item-selected': candidate === selectedSnapshotCandidate }"
                        @click="selectSnapshotCandidate(candidate)"
                    >
                        <dl class="own-publication-candidate-detail">
                            <dt>{{ t('ownPublicationPanel.storage') }}</dt>
                            <dd>{{ candidate.storage }}</dd>
                            <dt>{{ t('ownPublicationPanel.contentHash') }}</dt>
                            <dd>{{ candidate.contentHash }}</dd>
                            <dt>{{ t('ownPublicationPanel.locator') }}</dt>
                            <dd>{{ candidate.locator }}</dd>
                        </dl>
                    </li>
                </ul>
            </div>

            <button
                v-if="resolveSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-resolution-action"
                :disabled="!selectedSnapshotCandidate || selectedSnapshotResolutionExecuting"
                @click="resolveSelectedSnapshot"
            >{{ selectedSnapshotResolutionExecuting ? t('ownPublicationPanel.resolving') : t('ownPublicationPanel.resolveSelectedSnapshot') }}</button>

            <p v-if="selectedSnapshotResolutionError" class="own-publication-selected-resolution-error">{{ selectedSnapshotResolutionError }}</p>
            <dl v-else-if="selectedSnapshotResolutionResult" class="own-publication-selected-resolution-detail">
                <dt>{{ t('ownPublicationPanel.selectedSnapshotResolution') }}</dt>
                <dd>{{ describeSnapshotResolutionLabel(selectedSnapshotResolutionResult.outcome) }}</dd>
                <template v-if="selectedSnapshotResolutionResult.reason">
                    <dt>{{ t('ownPublicationPanel.reason') }}</dt>
                    <dd>{{ selectedSnapshotResolutionResult.reason }}</dd>
                </template>
                <template v-if="selectedSnapshotResolutionResult.locator">
                    <dt>{{ t('ownPublicationPanel.locator') }}</dt>
                    <dd>{{ selectedSnapshotResolutionResult.locator }}</dd>
                </template>
            </dl>

            <button
                v-if="resolveSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-attribution-action"
                :disabled="!publication || !publication.contentReference || !selectedSnapshotResolutionResult"
                @click="attributeSelectedSnapshot"
            >{{ t('ownPublicationPanel.attributeSelectedSnapshot') }}</button>

            <dl v-if="selectedSnapshotAttributionResult" class="own-publication-selected-attribution-detail">
                <dt>{{ t('ownPublicationPanel.selectedSnapshotAttribution') }}</dt>
                <dd>{{ describeSnapshotAttributionLabel(selectedSnapshotAttributionResult.outcome) }}</dd>
                <template v-if="selectedSnapshotAttributionResult.reason">
                    <dt>{{ t('ownPublicationPanel.reason') }}</dt>
                    <dd>{{ selectedSnapshotAttributionResult.reason }}</dd>
                </template>
            </dl>

            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-materialization-action"
                :disabled="!selectedSnapshotResolutionResult || selectedSnapshotMaterializationExecuting"
                @click="materializeSelectedSnapshot"
            >{{ selectedSnapshotMaterializationExecuting ? t('ownPublicationPanel.materializing') : t('ownPublicationPanel.materializeSelectedSnapshot') }}</button>

            <p v-if="selectedSnapshotMaterializationError" class="own-publication-selected-materialization-error">{{ selectedSnapshotMaterializationError }}</p>
            <dl v-else-if="selectedSnapshotMaterializationResult" class="own-publication-selected-materialization-detail">
                <dt>{{ t('ownPublicationPanel.selectedSnapshotMaterialization') }}</dt>
                <dd>{{ selectedSnapshotMaterializationResult.outcome }}</dd>
                <template v-if="selectedSnapshotMaterializationResult.reason">
                    <dt>{{ t('ownPublicationPanel.reason') }}</dt>
                    <dd>{{ selectedSnapshotMaterializationResult.reason }}</dd>
                </template>
            </dl>

            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-world-position-claim-action"
                :disabled="!selectedSnapshotCandidate || !publication"
                @click="useClaimedSnapshotPosition"
            >{{ t('ownPublicationPanel.useClaimedPosition') }}</button>

            <dl v-if="selectedSnapshotWorldPositionClaimResult" class="own-publication-selected-world-position-claim-detail">
                <dt>{{ t('ownPublicationPanel.selectedSnapshotPositionClaim') }}</dt>
                <dd>{{ selectedSnapshotWorldPositionClaimResult.outcome }}</dd>
                <template v-if="selectedSnapshotWorldPositionClaimResult.position">
                    <dt>{{ t('ownPublicationPanel.claimedPosition') }}</dt>
                    <dd>{{ selectedSnapshotWorldPositionClaimResult.position.x }}, {{ selectedSnapshotWorldPositionClaimResult.position.y }}, {{ selectedSnapshotWorldPositionClaimResult.position.z }}</dd>
                </template>
            </dl>

            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-world-placement-action"
                :disabled="!selectedSnapshotMaterializationResult"
                @click="placeMaterializedSnapshot"
            >{{ t('ownPublicationPanel.placeMaterializedSnapshot') }}</button>

            <dl v-if="selectedSnapshotWorldPlacementResult" class="own-publication-selected-world-placement-detail">
                <dt>{{ t('ownPublicationPanel.selectedSnapshotWorldPlacement') }}</dt>
                <dd>{{ selectedSnapshotWorldPlacementResult.outcome }}</dd>
                <template v-if="selectedSnapshotWorldPlacementResult.position">
                    <dt>{{ t('ownPublicationPanel.position') }}</dt>
                    <dd>{{ selectedSnapshotWorldPlacementResult.position.x }}, {{ selectedSnapshotWorldPlacementResult.position.y }}, {{ selectedSnapshotWorldPlacementResult.position.z }}</dd>
                </template>
                <template v-if="selectedSnapshotWorldPlacementResult.reason">
                    <dt>{{ t('ownPublicationPanel.reason') }}</dt>
                    <dd>{{ selectedSnapshotWorldPlacementResult.reason }}</dd>
                </template>
            </dl>

            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-world-registration-action"
                :disabled="!selectedSnapshotWorldPlacementResult"
                @click="registerMaterializedSnapshot"
            >{{ t('ownPublicationPanel.registerPlacedSnapshot') }}</button>

            <dl v-if="selectedSnapshotWorldRegistrationResult" class="own-publication-selected-world-registration-detail">
                <dt>{{ t('ownPublicationPanel.selectedSnapshotWorldRegistration') }}</dt>
                <dd>{{ selectedSnapshotWorldRegistrationResult.outcome }}</dd>
                <template v-if="selectedSnapshotWorldRegistrationResult.origin">
                    <dt>{{ t('ownPublicationPanel.origin') }}</dt>
                    <dd>{{ selectedSnapshotWorldRegistrationResult.origin }}</dd>
                </template>
                <template v-if="selectedSnapshotWorldRegistrationResult.reason">
                    <dt>{{ t('ownPublicationPanel.reason') }}</dt>
                    <dd>{{ selectedSnapshotWorldRegistrationResult.reason }}</dd>
                </template>
            </dl>

                    <button
                        type="button"
                        class="action-btn own-publication-diagnostic-close"
                        @click="diagnosticToolsOpen = false"
                    >{{ t('ownPublicationPanel.close') }}</button>
                </div>
            </div>`;
