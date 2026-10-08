// Publications page template: a publication card's Snapshot details tab.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const snapshotTabTemplate = `<div v-show="entry.detailsTab === 'snapshot'">
                    <!-- This replica's own content state, separate from the
                         distributed claims under Decentralization. -->
                    <div v-if="localSnapshotContentAvailabilityUseCase || snapshotContentMaterializationCoordinator || snapshotPeerMaterializationCoordinator" class="decentralization-summary">
                        <span class="evidence-convergence-title">{{ t('publications.localSnapshot') }}</span>

                        <!-- Summary of possession and acquisition counts;
                             hidden until something was checked or attempted
                             this session. -->
                        <div v-if="localSnapshotAvailabilityView(entry).checked || snapshotAcquisitionView(entry).acquisition.attemptCount > 0" class="evidence-list">
                            <span class="evidence-convergence-title">{{ t('publications.snapshotAcquisition') }} <span class="experimental-badge">{{ t('publications.experimental') }}</span></span>
                            <p class="form-hint form-hint--neutral">
                                {{ t('publications.currentPossession', { possession: localSnapshotAvailabilityView(entry).checked ? displayText(localSnapshotAvailabilityView(entry).message) : t('publications.notYetChecked') }) }}
                            </p>
                            <p v-if="snapshotAcquisitionOutcomeCountsSentence(entry)" class="form-hint form-hint--neutral">
                                {{ t('publications.acquisitionHistory', { history: snapshotAcquisitionOutcomeCountsSentence(entry) }) }}
                            </p>
                            <p v-if="materializationSourceCountsSentence(entry)" class="form-hint form-hint--neutral">
                                {{ displayText(materializationSourceCountsSentence(entry)) }}
                            </p>
                            <p v-if="snapshotAcquisitionNeedsSourceHint(entry)" class="form-hint form-hint--neutral">
                                {{ t('publications.thisReplicaDoesNotCurrently') }}
                            </p>

                            <!-- Every acquisition attempt this session,
                                 including rejected ones; a narration, never a
                                 ranking of sources. -->
                            <div v-if="materializationHistoryDetailsView(entry).count > 0" class="evidence-list">
                                <button class="action-btn action-btn--secondary" @click="toggleMaterializationHistory(entry)">
                                    {{ entry.materializationHistoryExpanded ? t('publications.hideAcquisitionHistory') : t('publications.showAcquisitionHistory') }}
                                </button>
                                <div v-if="entry.materializationHistoryExpanded">
                                    <ul class="replica-knowledge-claim-list">
                                        <li v-for="(item, index) in materializationHistoryDetailsView(entry).entries" :key="index" class="replica-knowledge-claim">
                                            <button class="action-btn action-btn--secondary" @click="toggleMaterializationHistoryEntry(entry, index)">
                                                {{ formatWhen(item.observedAt) }} — {{ displayText(item.sourceLabel) }} → {{ displayText(item.outcomeShortLabel) }}
                                            </button>
                                            <dl v-if="isMaterializationHistoryEntryExpanded(entry, index)" class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>{{ t('publications.outcome') }}</dt>
                                                    <dd>{{ displayText(item.outcomeLabel) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>{{ t('publications.publication5') }}</dt>
                                                    <dd>{{ item.publicationId }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>{{ t('publications.contentHash8') }}</dt>
                                                    <dd>{{ item.contentHash }}</dd>
                                                </div>
                                            </dl>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>

                        <!-- Shown once a local check has completed; evidence
                             and placement counts stay on the Decentralization
                             card. -->
                        <p v-if="localSnapshotContentAvailabilityUseCase && localSnapshotAvailabilityView(entry).checked" class="form-hint form-hint--neutral">
                            {{ t('publications.publicationKnowledge', { state: replicaContentKnowledgeView(entry).hasPublication ? t('publications.knownLocally') : t('publications.notKnownLocally') }) }}
                            · {{ t('publications.snapshotKnowledge', { state: replicaContentKnowledgeView(entry).hasValidSnapshot ? t('publications.availableLower') : t('publications.notAvailable') }) }}
                        </p>

                        <div v-if="localSnapshotContentAvailabilityUseCase" class="evidence-discovery-header">
                            <button class="action-btn action-btn--secondary"
                                    :disabled="localSnapshotAvailabilityView(entry).checking"
                                    @click="checkLocalSnapshotAvailability(entry)">
                                {{ displayText(localSnapshotAvailabilityButtonLabel(entry)) }}
                            </button>
                            <span v-if="localSnapshotAvailabilityView(entry).checked" class="peer-badge" :class="localSnapshotAvailabilityBadgeClass(entry)">
                                {{ displayText(localSnapshotAvailabilityView(entry).label) }}
                            </span>
                        </div>
                        <p v-if="localSnapshotContentAvailabilityUseCase && localSnapshotAvailabilityView(entry).message" class="form-hint form-hint--neutral">
                            {{ displayText(localSnapshotAvailabilityView(entry).message) }}
                        </p>

                        <p v-if="localSnapshotMaterializationSourceView(entry).possessed" class="form-hint form-hint--neutral">
                            {{ t('publications.source', { source: localSnapshotMaterializationSourceView(entry).sourceLabel }) }}
                        </p>

                        <!-- Imports only what the person supplies, on an
                             explicit click. -->
                        <div v-if="snapshotContentMaterializationCoordinator" class="evidence-list">
                            <button v-if="!entry.materializationFormOpen" class="action-btn action-btn--secondary"
                                    @click="entry.materializationFormOpen = true">
                                {{ t('publications.importSnapshot') }}
                            </button>
                            <template v-else>
                                <label class="form-field">
                                    <span class="form-label">{{ t('publications.publicationSnapshotTransferPackage') }}</span>
                                    <input type="file" accept="application/json" class="form-input"
                                           @change="onMaterializationFileChosen(entry, $event)" />
                                </label>
                                <textarea v-model="entry.materializationImportText" class="form-input" rows="4"
                                          :placeholder="t('publications.orPasteTheExportedPublication')"></textarea>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="materializationView(entry).importing"
                                            @click="importSnapshotContent(entry)">
                                        {{ displayText(materializationButtonLabel(entry)) }}
                                    </button>
                                    <span v-if="materializationView(entry).label" class="peer-badge" :class="materializationBadgeClass(entry)">
                                        {{ displayText(materializationView(entry).label) }}
                                    </span>
                                </div>
                            </template>
                            <p v-if="entry.materializationFormOpen && materializationView(entry).message" class="form-hint form-hint--neutral">
                                {{ displayText(materializationView(entry).message) }}
                            </p>
                        </div>

                        <!-- One notice for the three peer sections below,
                             which then show only what they already found. -->
                        <p v-if="retrievalPeers.length === 0 && (snapshotPeerMaterializationCoordinator || snapshotPeerPossessionCoordinator)" class="form-hint form-hint--neutral">
                            <I18nText keypath="publications.noPeerIsConnectedSo"><template #peers><router-link to="/peers">{{ t('publications.peers2') }}</router-link></template></I18nText>
                        </p>

                        <!-- The person picks the peer; no ranking and no
                             automatic fallback. -->
                        <div v-if="snapshotPeerMaterializationCoordinator && (retrievalPeers.length > 0 || peerMaterializationView(entry).message)" class="evidence-list">
                            <template v-if="retrievalPeers.length > 0">
                                <label class="form-field">
                                    <span class="form-label">{{ t('publications.peer2') }}</span>
                                    <select v-model="entry.peerMaterializationSelectedPeerId" class="form-input">
                                        <option value="" disabled>{{ t('publications.chooseAnAuthenticatedPeer') }}</option>
                                        <option v-for="peer in retrievalPeerOptions" :key="peer.connectionId" :value="peer.connectionId">
                                            {{ displayText(retrievalPeerLabel(peer)) }}
                                        </option>
                                    </select>
                                </label>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="peerMaterializationView(entry).requesting || !entry.peerMaterializationSelectedPeerId"
                                            @click="requestSnapshotFromPeer(entry)">
                                        {{ displayText(peerMaterializationButtonLabel(entry)) }}
                                    </button>
                                    <span v-if="peerMaterializationView(entry).label" class="peer-badge" :class="peerMaterializationBadgeClass(entry)">
                                        {{ displayText(peerMaterializationView(entry).label) }}
                                    </span>
                                </div>
                            </template>
                            <p v-if="peerMaterializationView(entry).message" class="form-hint form-hint--neutral">
                                {{ displayText(peerMaterializationView(entry).message) }}
                            </p>
                        </div>

                        <!-- Asking whether a peer has bytes is separate from
                             asking it for them; a check never transfers
                             anything. -->
                        <div v-if="snapshotPeerPossessionCoordinator && (retrievalPeers.length > 0 || peerPossessionView(entry).message)" class="evidence-list">
                            <span class="evidence-convergence-title">{{ t('publications.peerSnapshotPossession') }} <span class="experimental-badge">{{ t('publications.experimental') }}</span></span>
                            <template v-if="retrievalPeers.length > 0">
                                <label class="form-field">
                                    <span class="form-label">{{ t('publications.peer2') }}</span>
                                    <select v-model="entry.peerPossessionSelectedPeerId" class="form-input">
                                        <option value="" disabled>{{ t('publications.chooseAnAuthenticatedPeer') }}</option>
                                        <option v-for="peer in retrievalPeerOptions" :key="peer.connectionId" :value="peer.connectionId">
                                            {{ displayText(retrievalPeerLabel(peer)) }}
                                        </option>
                                    </select>
                                </label>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="peerPossessionView(entry).checking || !entry.peerPossessionSelectedPeerId"
                                            @click="checkSnapshotPossessionWithPeer(entry)">
                                        {{ displayText(peerPossessionButtonLabel(entry)) }}
                                    </button>
                                    <span v-if="peerPossessionView(entry).label" class="peer-badge" :class="peerPossessionBadgeClass(entry)">
                                        {{ displayText(peerPossessionView(entry).label) }}
                                    </span>
                                </div>
                            </template>
                            <p v-if="peerPossessionView(entry).message" class="form-hint form-hint--neutral">
                                {{ displayText(peerPossessionView(entry).message) }}
                            </p>
                            <p v-if="peerPossessionView(entry).observedAt" class="form-hint form-hint--neutral">
                                {{ t('publications.observedColon', { when: formatWhen(peerPossessionView(entry).observedAt) }) }}
                            </p>
                        </div>

                        <!-- Several peers at once, with a history; reports what
                             each peer said, never ranks them. -->
                        <div v-if="snapshotPeerPossessionCoordinator && (retrievalPeers.length > 0 || peerPossessionComparisonView(entry).peers.length > 0 || peerPossessionObservationDetailsView(entry).count > 0)" class="evidence-list">
                            <span class="evidence-convergence-title">{{ t('publications.peerSnapshotPossessionComparison') }} <span class="experimental-badge">{{ t('publications.experimental') }}</span></span>
                            <template v-if="retrievalPeers.length > 0">
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="peer in retrievalPeers" :key="peer.connectionId" class="replica-knowledge-claim">
                                        <label>
                                            <input type="checkbox"
                                                   :checked="entry.peerPossessionCompareSelectedPeerIds.includes(peer.connectionId)"
                                                   @change="togglePeerPossessionCompareSelection(entry, peer.connectionId)">
                                            {{ peer.alias || (peer.remoteIdentity ? shortId(peer.remoteIdentity.identityId) : t('publications.unknownPeer')) }}
                                        </label>
                                    </li>
                                </ul>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="entry.peerPossessionComparisonChecking || entry.peerPossessionCompareSelectedPeerIds.length === 0"
                                            @click="checkSnapshotPossessionWithSelectedPeers(entry)">
                                        {{ entry.peerPossessionComparisonChecking ? t('publications.checking') : (peerPossessionObservationHistoryView(entry).count > 0 ? t('publications.checkSelectedPeersAgain') : t('publications.checkSelectedPeers')) }}
                                    </button>
                                </div>
                            </template>

                            <div v-if="peerPossessionComparisonView(entry).peers.length > 0">
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.possessionCounts', { available: peerPossessionComparisonView(entry).availableCount, notAvailable: peerPossessionComparisonView(entry).notAvailableCount, unknown: peerPossessionComparisonView(entry).unavailableCount }) }}
                                </p>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="peerRow in peerPossessionComparisonView(entry).peers" :key="peerRow.peerId" class="replica-knowledge-claim">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field">
                                                <dt>{{ t('publications.peer2') }}</dt>
                                                <dd>{{ displayText(peerPossessionRowLabel(peerRow.peerId)) }}</dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>{{ t('publications.reports') }}</dt>
                                                <dd>
                                                    <span class="peer-badge" :class="peerPossessionComparisonRowBadgeClass(peerRow)">
                                                        {{ displayText(peerPossessionComparisonRowLabel(peerRow)) }}
                                                    </span>
                                                </dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>{{ t('publications.observed2') }}</dt>
                                                <dd>{{ formatWhen(peerRow.observedAt) }}</dd>
                                            </div>
                                        </dl>
                                        <!-- A new attempt to fetch from this
                                             peer; it never changes the row's
                                             earlier report. -->
                                        <template v-if="snapshotMaterializationSelectionCoordinator && peerRow.possessed">
                                            <button class="action-btn action-btn--secondary"
                                                    :disabled="comparisonPeerMaterializationView(entry, peerRow.peerId).requesting"
                                                    @click="materializeFromComparisonPeer(entry, peerRow.peerId)">
                                                {{ displayText(comparisonPeerMaterializationButtonLabel(entry, peerRow)) }}
                                            </button>
                                            <span v-if="comparisonPeerMaterializationView(entry, peerRow.peerId).label"
                                                  class="peer-badge" :class="comparisonPeerMaterializationBadgeClass(entry, peerRow.peerId)">
                                                {{ displayText(comparisonPeerMaterializationView(entry, peerRow.peerId).label) }}
                                            </span>
                                            <p v-if="comparisonPeerMaterializationView(entry, peerRow.peerId).message" class="form-hint form-hint--neutral">
                                                {{ displayText(comparisonPeerMaterializationView(entry, peerRow.peerId).message) }}
                                            </p>
                                        </template>
                                    </li>
                                </ul>
                            </div>

                            <!-- Every recorded answer, including repeats; a
                                 narration, never a ranking. -->
                            <div v-if="peerPossessionObservationDetailsView(entry).count > 0">
                                <button class="action-btn action-btn--secondary" @click="togglePeerPossessionComparisonHistory(entry)">
                                    {{ entry.peerPossessionComparisonHistoryExpanded ? t('publications.hideObservationHistory') : t('publications.showObservationHistory') }}
                                </button>
                                <div v-if="entry.peerPossessionComparisonHistoryExpanded">
                                    <ul class="replica-knowledge-claim-list">
                                        <li v-for="(item, index) in peerPossessionObservationDetailsView(entry).entries" :key="index" class="replica-knowledge-claim">
                                            <button class="action-btn action-btn--secondary" @click="togglePeerPossessionObservationHistoryEntry(entry, index)">
                                                {{ formatWhen(item.observedAt) }} — {{ displayText(peerPossessionRowLabel(item.peerId)) }} → {{ displayText(item.stateShortLabel) }}
                                            </button>
                                            <dl v-if="isPeerPossessionObservationHistoryEntryExpanded(entry, index)" class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>{{ t('publications.reported') }}</dt>
                                                    <dd>{{ displayText(item.stateLabel) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>{{ t('publications.publication5') }}</dt>
                                                    <dd>{{ item.publicationId }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>{{ t('publications.contentHash8') }}</dt>
                                                    <dd>{{ item.contentHash }}</dd>
                                                </div>
                                            </dl>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Independent facts side by side, never combined into one
                         verdict; each hides until observed. -->
                    <div v-if="localSnapshotAvailabilityView(entry).checked || snapshotAcquisitionOutcomeCountsSentence(entry) || entry.placementConvergenceView || peerPossessionComparisonView(entry).peers.length > 0"
                         class="decentralization-summary">
                        <span class="evidence-convergence-title">{{ t('publications.snapshotState') }} <span class="experimental-badge">{{ t('publications.experimental') }}</span></span>

                        <div class="evidence-list">
                            <span class="evidence-convergence-title">{{ t('publications.content2') }}</span>
                            <dl class="evidence-fields">
                                <div class="evidence-field">
                                    <dt>{{ t('publications.publication5') }}</dt>
                                    <dd>{{ entry.publication.id }}</dd>
                                </div>
                                <div class="evidence-field">
                                    <dt>{{ t('publications.contentHash8') }}</dt>
                                    <dd>{{ entry.publication.contentReference.hash }}</dd>
                                </div>
                            </dl>
                        </div>

                        <div class="evidence-list">
                            <span class="evidence-convergence-title">{{ t('publications.localPossession') }}</span>
                            <p class="form-hint form-hint--neutral">
                                {{ localSnapshotAvailabilityView(entry).checked ? displayText(localSnapshotAvailabilityView(entry).message) : t('publications.notYetChecked') }}
                            </p>
                        </div>

                        <div v-if="snapshotAcquisitionOutcomeCountsSentence(entry)" class="evidence-list">
                            <span class="evidence-convergence-title">{{ t('publications.acquisition4') }}</span>
                            <p class="form-hint form-hint--neutral">{{ displayText(snapshotAcquisitionOutcomeCountsSentence(entry)) }}</p>
                        </div>

                        <div v-if="entry.placementConvergenceView" class="evidence-list">
                            <span class="evidence-convergence-title">{{ t('publications.placements2') }}</span>
                            <p class="form-hint form-hint--neutral">
                                {{ displayText(snapshotStatePlacementRelationshipLabel(snapshotStateInspectionView(entry))) }} ·
                                {{ t('publications.knownPlacementsPlural', { count: entry.placementConvergenceView.placementCount }) }} ·
                                {{ t('publications.storageBackends', { count: entry.placementConvergenceView.storageTypeCount }) }} ·
                                {{ t('publications.distinctLocations', { count: entry.placementConvergenceView.locatorCount }) }}
                            </p>
                        </div>

                        <div v-if="peerPossessionComparisonView(entry).peers.length > 0" class="evidence-list">
                            <span class="evidence-convergence-title">{{ t('publications.peerObservations') }}</span>
                            <p class="form-hint form-hint--neutral">
                                {{ t('publications.possessionCounts', { available: peerPossessionComparisonView(entry).availableCount, notAvailable: peerPossessionComparisonView(entry).notAvailableCount, unknown: peerPossessionComparisonView(entry).unavailableCount }) }}
                            </p>
                        </div>
                    </div>
                    </div>`;
