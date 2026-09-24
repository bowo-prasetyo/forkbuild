// World Encounter canvas template: selection and decentralized-lead outcomes, the material panel,
// and the distribution trigger and dialog.
// It renders in WorldEncounterCanvas's scope, so it uses the component's props, data, computed properties and methods.
export const outcomeAndMaterialPanelsTemplate = `<div v-if="selectedEncounter && selectionOutcome && selectionOutcome.status !== 'UNAVAILABLE'" class="world-encounter-selection-origin-panel">
                <template v-if="selectionOutcome.status === 'AMBIGUOUS'">
                    <h4 class="world-encounter-selection-origin-title">Choose Source</h4>
                    <p v-if="!resolvedEncounterSelection" class="world-encounter-selection-origin-hint">
                        This encounter is offered by more than one source.
                    </p>
                    <ul class="world-encounter-selection-origin-list">
                        <li v-for="candidate in selectionOutcome.candidates" :key="candidate.origin">
                            <button
                                type="button"
                                class="world-encounter-selection-origin-choice"
                                :class="{ 'world-encounter-selection-origin-choice-active': resolvedEncounterSelection && resolvedEncounterSelection.origin === candidate.origin }"
                                @click="chooseSelectionOrigin(candidate)"
                            >{{ describeSelectionOriginLabel(candidate.origin) }}</button>
                        </li>
                    </ul>
                </template>

                <p v-else-if="selectionOutcome.status === 'RESOLVED'" class="world-encounter-selection-origin-resolved">
                    Source: {{ describeSelectionOriginLabel(selectionOutcome.resolvedSelection.origin) }}
                </p>
            </div>

            <div v-if="selectedEncounter && decentralizedLeadOutcome && decentralizedLeadOutcome.status !== 'UNAVAILABLE'" class="world-encounter-lead-panel">
                <template v-if="decentralizedLeadOutcome.status === 'AMBIGUOUS'">
                    <h4 class="world-encounter-lead-title">Choose Location</h4>
                    <p v-if="!resolvedLead" class="world-encounter-lead-hint">
                        More than one decentralized lead is currently associated with this encounter.
                    </p>
                    <ul class="world-encounter-lead-list">
                        <li v-for="candidate in decentralizedLeadOutcome.candidates" :key="candidate.origin + '|' + candidate.discoveryTag + '|' + candidate.uri">
                            <button
                                type="button"
                                class="world-encounter-lead-choice"
                                :class="{ 'world-encounter-lead-choice-active': resolvedLead && resolvedLead.origin === candidate.origin && resolvedLead.discoveryTag === candidate.discoveryTag && resolvedLead.uri === candidate.uri }"
                                @click="chooseDecentralizedLead(candidate)"
                            >{{ describeDecentralizedLeadUriLabel(candidate.uri) }}</button>
                        </li>
                    </ul>
                </template>

                <p v-else-if="decentralizedLeadOutcome.status === 'RESOLVED'" class="world-encounter-lead-resolved">
                    Location: {{ describeDecentralizedLeadUriLabel(decentralizedLeadOutcome.resolvedLead.uri) }}
                </p>
            </div>

            <!--
                Statuses go through WorldEncounterMaterialInspectionView.js labels rather
                than raw enum constants: a bare "VERIFIED" would suggest authorship or
                trust, when it only means identity correspondence to the selection.
            -->
            <div v-if="selectedEncounter && materialInspection" class="world-encounter-material-panel">
                <h4 class="world-encounter-material-title">Material</h4>
                <dl class="world-encounter-material-detail">
                    <dt>Status</dt>
                    <dd>{{ describeMaterialLoadStatusLabel(materialInspection.loading.status) }}</dd>
                </dl>

                <!--
                    Where this observation's material came from (see
                    application/publication/distribution/PublicationMaterialProvenance.js).
                -->
                <dl v-if="materialProvenance" class="world-encounter-provenance-detail">
                    <dt>Source</dt>
                    <dd>{{ materialProvenance.origin }}</dd>
                </dl>

                <h4 class="world-encounter-verification-title">Verification</h4>
                <dl class="world-encounter-verification-detail">
                    <dt>Status</dt>
                    <dd>{{ describeMaterialVerificationStatusLabel(materialInspection.verification.status) }}</dd>
                </dl>
            </div>

            <!--
                One "Distribute" trigger opens WorldDistributionDialog.js, which holds
                every distribution control. Shown when either protocol is usable.
            -->
            <button
                v-if="selectedEncounter && selectedEncounter.kind === 'PUBLICATION' && (distributionCommand || snapshotDistributionCommand)"
                type="button"
                class="action-btn world-encounter-distribution-trigger-action"
                :disabled="!distributablePublication"
                @click="distributionDialogOpen = true"
            >Distribute</button>

            <WorldDistributionDialog
                v-if="distributionDialogOpen"
                :can-distribute-publication="Boolean(distributionCommand)"
                :can-distribute-snapshot="Boolean(snapshotDistributionCommand)"
                :has-subject="Boolean(distributablePublication)"
                :distribution-executing="distributionExecuting"
                :distribution-error="distributionError"
                :show-distribution-lifecycle="Boolean(distributionLifecycleStore)"
                :distribution-material-state="distributionMaterialState"
                :distribution-discovery-state="distributionDiscoveryState"
                :discovery-observations="discoveryObservations"
                v-model:storage="selectedDistributionStorage"
                v-model:discovery-provider="selectedDiscoveryProvider"
                :remote-pinning-draft="remotePinningDraft"
                :snapshot-distribution-storage-types="snapshotDistributionStorageTypes"
                :snapshot-distribution-executing="snapshotDistributionExecuting"
                :snapshot-distribution-error="snapshotDistributionError"
                :snapshot-distribution-result="snapshotDistributionResult"
                @close="distributionDialogOpen = false"
                @distribute-both="distributeSelectedPublicationAndSnapshot"
                @distribute-publication="distributeSelectedPublication"
                @distribute-snapshot="distributeSelectedSnapshot"
            />`;
