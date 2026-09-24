// Own Publication panel template: the Diagnostic Tools popup for the manual Snapshot pipeline.
// It renders in OwnPublicationPanel's scope, so it uses the component's props, data, computed properties and methods.
export const diagnosticToolsSectionTemplate = `<!--
                Groups the manual diagnostic pipeline in a popup. Presentation only: closing
                and reopening shows the same state.
            -->
            <button
                v-if="discoverSnapshotCandidatesCommand || resolveSelectedSnapshotCommand || materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-diagnostic-trigger"
                @click="diagnosticToolsOpen = true"
            >Diagnostic Tools</button>

            <div
                v-if="diagnosticToolsOpen"
                class="modal-overlay own-publication-diagnostic-overlay"
                @click.self="diagnosticToolsOpen = false"
            >
                <div class="modal-panel own-publication-diagnostic-panel">
                    <h3>Diagnostic Tools</h3>
                    <p class="own-publication-diagnostic-intro">
                        Use these tools to manually inspect or recover decentralized content
                        when automatic discovery or placement does not produce the expected
                        result.
                    </p>

                    <h4 class="own-publication-diagnostic-section-title">Snapshots</h4>

            <!-- Needs no Publication; disabled only while busy. -->
            <button
                v-if="discoverSnapshotCandidatesCommand || discoverSnapshotCandidatesWithOutcomeCommand"
                type="button"
                class="action-btn own-publication-candidate-discovery-action"
                :disabled="snapshotCandidateDiscoveryExecuting"
                @click="discoverSnapshotCandidates"
            >{{ snapshotCandidateDiscoveryExecuting ? 'Discovering…' : 'Discover Snapshots' }}</button>

            <p v-if="snapshotCandidateDiscoveryError" class="own-publication-candidate-discovery-error">{{ snapshotCandidateDiscoveryError }}</p>

            <!--
                [] is a real result. 'unavailable' says the search could not complete rather
                than claiming nothing was announced. Shown in discovery order, unranked.
            -->
            <div v-else-if="snapshotCandidateDiscoveryResult" class="own-publication-candidate-list">
                <h5 class="own-publication-candidate-list-title">Discovered Snapshots</h5>
                <p v-if="snapshotCandidateDiscoveryResult.length === 0 && snapshotCandidateDiscoveryOutcome === 'unavailable'" class="own-publication-candidate-list-unavailable">
                    Snapshot discovery is currently unavailable.
                </p>
                <p v-else-if="snapshotCandidateDiscoveryResult.length === 0" class="own-publication-candidate-list-empty">
                    No Snapshots have been announced under this discoveryTag yet.
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
                            <dt>Storage</dt>
                            <dd>{{ candidate.storage }}</dd>
                            <dt>Content hash</dt>
                            <dd>{{ candidate.contentHash }}</dd>
                            <dt>Locator</dt>
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
            >{{ selectedSnapshotResolutionExecuting ? 'Resolving…' : 'Resolve Selected Snapshot' }}</button>

            <p v-if="selectedSnapshotResolutionError" class="own-publication-selected-resolution-error">{{ selectedSnapshotResolutionError }}</p>
            <dl v-else-if="selectedSnapshotResolutionResult" class="own-publication-selected-resolution-detail">
                <dt>Selected Snapshot Resolution</dt>
                <dd>{{ describeSnapshotResolutionLabel(selectedSnapshotResolutionResult.outcome) }}</dd>
                <template v-if="selectedSnapshotResolutionResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotResolutionResult.reason }}</dd>
                </template>
                <template v-if="selectedSnapshotResolutionResult.locator">
                    <dt>Locator</dt>
                    <dd>{{ selectedSnapshotResolutionResult.locator }}</dd>
                </template>
            </dl>

            <button
                v-if="resolveSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-attribution-action"
                :disabled="!publication || !publication.contentReference || !selectedSnapshotResolutionResult"
                @click="attributeSelectedSnapshot"
            >Attribute Selected Snapshot</button>

            <dl v-if="selectedSnapshotAttributionResult" class="own-publication-selected-attribution-detail">
                <dt>Selected Snapshot Attribution</dt>
                <dd>{{ describeSnapshotAttributionLabel(selectedSnapshotAttributionResult.outcome) }}</dd>
                <template v-if="selectedSnapshotAttributionResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotAttributionResult.reason }}</dd>
                </template>
            </dl>

            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-materialization-action"
                :disabled="!selectedSnapshotResolutionResult || selectedSnapshotMaterializationExecuting"
                @click="materializeSelectedSnapshot"
            >{{ selectedSnapshotMaterializationExecuting ? 'Materializing…' : 'Materialize Selected Snapshot' }}</button>

            <p v-if="selectedSnapshotMaterializationError" class="own-publication-selected-materialization-error">{{ selectedSnapshotMaterializationError }}</p>
            <dl v-else-if="selectedSnapshotMaterializationResult" class="own-publication-selected-materialization-detail">
                <dt>Selected Snapshot Materialization</dt>
                <dd>{{ selectedSnapshotMaterializationResult.outcome }}</dd>
                <template v-if="selectedSnapshotMaterializationResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotMaterializationResult.reason }}</dd>
                </template>
            </dl>

            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-world-position-claim-action"
                :disabled="!selectedSnapshotCandidate || !publication"
                @click="useClaimedSnapshotPosition"
            >Use Claimed Position</button>

            <dl v-if="selectedSnapshotWorldPositionClaimResult" class="own-publication-selected-world-position-claim-detail">
                <dt>Selected Snapshot Position Claim</dt>
                <dd>{{ selectedSnapshotWorldPositionClaimResult.outcome }}</dd>
                <template v-if="selectedSnapshotWorldPositionClaimResult.position">
                    <dt>Claimed Position</dt>
                    <dd>{{ selectedSnapshotWorldPositionClaimResult.position.x }}, {{ selectedSnapshotWorldPositionClaimResult.position.y }}, {{ selectedSnapshotWorldPositionClaimResult.position.z }}</dd>
                </template>
            </dl>

            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-world-placement-action"
                :disabled="!selectedSnapshotMaterializationResult"
                @click="placeMaterializedSnapshot"
            >Place Materialized Snapshot</button>

            <dl v-if="selectedSnapshotWorldPlacementResult" class="own-publication-selected-world-placement-detail">
                <dt>Selected Snapshot World Placement</dt>
                <dd>{{ selectedSnapshotWorldPlacementResult.outcome }}</dd>
                <template v-if="selectedSnapshotWorldPlacementResult.position">
                    <dt>Position</dt>
                    <dd>{{ selectedSnapshotWorldPlacementResult.position.x }}, {{ selectedSnapshotWorldPlacementResult.position.y }}, {{ selectedSnapshotWorldPlacementResult.position.z }}</dd>
                </template>
                <template v-if="selectedSnapshotWorldPlacementResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotWorldPlacementResult.reason }}</dd>
                </template>
            </dl>

            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-world-registration-action"
                :disabled="!selectedSnapshotWorldPlacementResult"
                @click="registerMaterializedSnapshot"
            >Register Placed Snapshot</button>

            <dl v-if="selectedSnapshotWorldRegistrationResult" class="own-publication-selected-world-registration-detail">
                <dt>Selected Snapshot World Registration</dt>
                <dd>{{ selectedSnapshotWorldRegistrationResult.outcome }}</dd>
                <template v-if="selectedSnapshotWorldRegistrationResult.origin">
                    <dt>Origin</dt>
                    <dd>{{ selectedSnapshotWorldRegistrationResult.origin }}</dd>
                </template>
                <template v-if="selectedSnapshotWorldRegistrationResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotWorldRegistrationResult.reason }}</dd>
                </template>
            </dl>

                    <button
                        type="button"
                        class="action-btn own-publication-diagnostic-close"
                        @click="diagnosticToolsOpen = false"
                    >Close</button>
                </div>
            </div>`;
