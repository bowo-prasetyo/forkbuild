// Publications page template: a publication card's Snapshot details tab.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const snapshotTabTemplate = `<div v-show="entry.detailsTab === 'snapshot'">
                    <!-- This replica's own content state, separate from the
                         distributed claims under Decentralization. -->
                    <div v-if="localSnapshotContentAvailabilityUseCase || snapshotContentMaterializationCoordinator || snapshotPeerMaterializationCoordinator" class="decentralization-summary">
                        <span class="evidence-convergence-title">Local Snapshot</span>

                        <!-- Summary of possession and acquisition counts;
                             hidden until something was checked or attempted
                             this session. -->
                        <div v-if="localSnapshotAvailabilityView(entry).checked || snapshotAcquisitionView(entry).acquisition.attemptCount > 0" class="evidence-list">
                            <span class="evidence-convergence-title">Snapshot Acquisition</span>
                            <p class="form-hint form-hint--neutral">
                                Current possession:
                                {{ localSnapshotAvailabilityView(entry).checked ? localSnapshotAvailabilityView(entry).message : 'Not yet checked.' }}
                            </p>
                            <p v-if="snapshotAcquisitionOutcomeCountsSentence(entry)" class="form-hint form-hint--neutral">
                                Acquisition history: {{ snapshotAcquisitionOutcomeCountsSentence(entry) }}
                            </p>
                            <p v-if="materializationSourceCountsSentence(entry)" class="form-hint form-hint--neutral">
                                {{ materializationSourceCountsSentence(entry) }}
                            </p>
                            <p v-if="snapshotAcquisitionNeedsSourceHint(entry)" class="form-hint form-hint--neutral">
                                This replica does not currently possess a valid snapshot. Choose a source below —
                                "Import Snapshot," a placement's own "Materialize Snapshot," or a peer's own "Get
                                Snapshot from Peer" — to try again.
                            </p>

                            <!-- Every acquisition attempt this session,
                                 including rejected ones; a narration, never a
                                 ranking of sources. -->
                            <div v-if="materializationHistoryDetailsView(entry).count > 0" class="evidence-list">
                                <button class="action-btn action-btn--secondary" @click="toggleMaterializationHistory(entry)">
                                    {{ entry.materializationHistoryExpanded ? 'Hide Acquisition History' : 'Show Acquisition History' }}
                                </button>
                                <div v-if="entry.materializationHistoryExpanded">
                                    <ul class="replica-knowledge-claim-list">
                                        <li v-for="(item, index) in materializationHistoryDetailsView(entry).entries" :key="index" class="replica-knowledge-claim">
                                            <button class="action-btn action-btn--secondary" @click="toggleMaterializationHistoryEntry(entry, index)">
                                                {{ formatWhen(item.observedAt) }} — {{ item.sourceLabel }} → {{ item.outcomeShortLabel }}
                                            </button>
                                            <dl v-if="isMaterializationHistoryEntryExpanded(entry, index)" class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>Outcome</dt>
                                                    <dd>{{ item.outcomeLabel }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Publication</dt>
                                                    <dd>{{ item.publicationId }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Content hash</dt>
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
                            Publication: {{ replicaContentKnowledgeView(entry).hasPublication ? 'known locally' : 'not known locally' }}
                            · Snapshot: {{ replicaContentKnowledgeView(entry).hasValidSnapshot ? 'available' : 'not available' }}
                        </p>

                        <div v-if="localSnapshotContentAvailabilityUseCase" class="evidence-discovery-header">
                            <button class="action-btn action-btn--secondary"
                                    :disabled="localSnapshotAvailabilityView(entry).checking"
                                    @click="checkLocalSnapshotAvailability(entry)">
                                {{ localSnapshotAvailabilityButtonLabel(entry) }}
                            </button>
                            <span v-if="localSnapshotAvailabilityView(entry).checked" class="peer-badge" :class="localSnapshotAvailabilityBadgeClass(entry)">
                                {{ localSnapshotAvailabilityView(entry).label }}
                            </span>
                        </div>
                        <p v-if="localSnapshotContentAvailabilityUseCase && localSnapshotAvailabilityView(entry).message" class="form-hint form-hint--neutral">
                            {{ localSnapshotAvailabilityView(entry).message }}
                        </p>

                        <p v-if="localSnapshotMaterializationSourceView(entry).possessed" class="form-hint form-hint--neutral">
                            Source: {{ localSnapshotMaterializationSourceView(entry).sourceLabel }}
                        </p>

                        <!-- Imports only what the person supplies, on an
                             explicit click. -->
                        <div v-if="snapshotContentMaterializationCoordinator" class="evidence-list">
                            <button v-if="!entry.materializationFormOpen" class="action-btn action-btn--secondary"
                                    @click="entry.materializationFormOpen = true">
                                Import Snapshot
                            </button>
                            <template v-else>
                                <label class="form-field">
                                    <span class="form-label">Publication Snapshot Transfer Package</span>
                                    <input type="file" accept="application/json" class="form-input"
                                           @change="onMaterializationFileChosen(entry, $event)" />
                                </label>
                                <textarea v-model="entry.materializationImportText" class="form-input" rows="4"
                                          placeholder="…or paste the exported Publication Snapshot Transfer Package JSON here"></textarea>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="materializationView(entry).importing"
                                            @click="importSnapshotContent(entry)">
                                        {{ materializationButtonLabel(entry) }}
                                    </button>
                                    <span v-if="materializationView(entry).label" class="peer-badge" :class="materializationBadgeClass(entry)">
                                        {{ materializationView(entry).label }}
                                    </span>
                                </div>
                            </template>
                            <p v-if="entry.materializationFormOpen && materializationView(entry).message" class="form-hint form-hint--neutral">
                                {{ materializationView(entry).message }}
                            </p>
                        </div>

                        <!-- The person picks the peer; no ranking and no
                             automatic fallback. -->
                        <div v-if="snapshotPeerMaterializationCoordinator" class="evidence-list">
                            <p v-if="retrievalPeers.length === 0" class="form-hint form-hint--neutral">
                                No authenticated peer is connected right now — connect to one first from
                                <router-link to="/peers">Peers</router-link>.
                            </p>
                            <template v-else>
                                <label class="form-field">
                                    <span class="form-label">Peer</span>
                                    <select v-model="entry.peerMaterializationSelectedPeerId" class="form-input">
                                        <option value="" disabled>Choose an authenticated peer…</option>
                                        <option v-for="peer in retrievalPeerOptions" :key="peer.connectionId" :value="peer.connectionId">
                                            {{ retrievalPeerLabel(peer) }}
                                        </option>
                                    </select>
                                </label>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="peerMaterializationView(entry).requesting || !entry.peerMaterializationSelectedPeerId"
                                            @click="requestSnapshotFromPeer(entry)">
                                        {{ peerMaterializationButtonLabel(entry) }}
                                    </button>
                                    <span v-if="peerMaterializationView(entry).label" class="peer-badge" :class="peerMaterializationBadgeClass(entry)">
                                        {{ peerMaterializationView(entry).label }}
                                    </span>
                                </div>
                            </template>
                            <p v-if="peerMaterializationView(entry).message" class="form-hint form-hint--neutral">
                                {{ peerMaterializationView(entry).message }}
                            </p>
                        </div>

                        <!-- Asking whether a peer has bytes is separate from
                             asking it for them; a check never transfers
                             anything. -->
                        <div v-if="snapshotPeerPossessionCoordinator" class="evidence-list">
                            <span class="evidence-convergence-title">Peer Snapshot Possession</span>
                            <p v-if="retrievalPeers.length === 0" class="form-hint form-hint--neutral">
                                No authenticated peer is connected right now — connect to one first from
                                <router-link to="/peers">Peers</router-link>.
                            </p>
                            <template v-else>
                                <label class="form-field">
                                    <span class="form-label">Peer</span>
                                    <select v-model="entry.peerPossessionSelectedPeerId" class="form-input">
                                        <option value="" disabled>Choose an authenticated peer…</option>
                                        <option v-for="peer in retrievalPeerOptions" :key="peer.connectionId" :value="peer.connectionId">
                                            {{ retrievalPeerLabel(peer) }}
                                        </option>
                                    </select>
                                </label>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="peerPossessionView(entry).checking || !entry.peerPossessionSelectedPeerId"
                                            @click="checkSnapshotPossessionWithPeer(entry)">
                                        {{ peerPossessionButtonLabel(entry) }}
                                    </button>
                                    <span v-if="peerPossessionView(entry).label" class="peer-badge" :class="peerPossessionBadgeClass(entry)">
                                        {{ peerPossessionView(entry).label }}
                                    </span>
                                </div>
                            </template>
                            <p v-if="peerPossessionView(entry).message" class="form-hint form-hint--neutral">
                                {{ peerPossessionView(entry).message }}
                            </p>
                            <p v-if="peerPossessionView(entry).observedAt" class="form-hint form-hint--neutral">
                                Observed: {{ formatWhen(peerPossessionView(entry).observedAt) }}
                            </p>
                        </div>

                        <!-- Several peers at once, with a history; reports what
                             each peer said, never ranks them. -->
                        <div v-if="snapshotPeerPossessionCoordinator" class="evidence-list">
                            <span class="evidence-convergence-title">Peer Snapshot Possession Comparison</span>
                            <p v-if="retrievalPeers.length === 0" class="form-hint form-hint--neutral">
                                No authenticated peer is connected right now — connect to one first from
                                <router-link to="/peers">Peers</router-link>.
                            </p>
                            <template v-else>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="peer in retrievalPeers" :key="peer.connectionId" class="replica-knowledge-claim">
                                        <label>
                                            <input type="checkbox"
                                                   :checked="entry.peerPossessionCompareSelectedPeerIds.includes(peer.connectionId)"
                                                   @change="togglePeerPossessionCompareSelection(entry, peer.connectionId)">
                                            {{ peer.alias || (peer.remoteIdentity ? shortId(peer.remoteIdentity.identityId) : 'Unknown peer') }}
                                        </label>
                                    </li>
                                </ul>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="entry.peerPossessionComparisonChecking || entry.peerPossessionCompareSelectedPeerIds.length === 0"
                                            @click="checkSnapshotPossessionWithSelectedPeers(entry)">
                                        {{ entry.peerPossessionComparisonChecking ? 'Checking…' : (peerPossessionObservationHistoryView(entry).count > 0 ? 'Check Selected Peers Again' : 'Check Selected Peers') }}
                                    </button>
                                </div>
                            </template>

                            <div v-if="peerPossessionComparisonView(entry).peers.length > 0">
                                <p class="form-hint form-hint--neutral">
                                    {{ peerPossessionComparisonView(entry).availableCount }} available ·
                                    {{ peerPossessionComparisonView(entry).notAvailableCount }} not available ·
                                    {{ peerPossessionComparisonView(entry).unavailableCount }} could not determine
                                </p>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="peerRow in peerPossessionComparisonView(entry).peers" :key="peerRow.peerId" class="replica-knowledge-claim">
                                        <dl class="evidence-fields">
                                            <div class="evidence-field">
                                                <dt>Peer</dt>
                                                <dd>{{ peerPossessionRowLabel(peerRow.peerId) }}</dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>Reports</dt>
                                                <dd>
                                                    <span class="peer-badge" :class="peerPossessionComparisonRowBadgeClass(peerRow)">
                                                        {{ peerPossessionComparisonRowLabel(peerRow) }}
                                                    </span>
                                                </dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>Observed</dt>
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
                                                {{ comparisonPeerMaterializationButtonLabel(entry, peerRow) }}
                                            </button>
                                            <span v-if="comparisonPeerMaterializationView(entry, peerRow.peerId).label"
                                                  class="peer-badge" :class="comparisonPeerMaterializationBadgeClass(entry, peerRow.peerId)">
                                                {{ comparisonPeerMaterializationView(entry, peerRow.peerId).label }}
                                            </span>
                                            <p v-if="comparisonPeerMaterializationView(entry, peerRow.peerId).message" class="form-hint form-hint--neutral">
                                                {{ comparisonPeerMaterializationView(entry, peerRow.peerId).message }}
                                            </p>
                                        </template>
                                    </li>
                                </ul>
                            </div>

                            <!-- Every recorded answer, including repeats; a
                                 narration, never a ranking. -->
                            <div v-if="peerPossessionObservationDetailsView(entry).count > 0">
                                <button class="action-btn action-btn--secondary" @click="togglePeerPossessionComparisonHistory(entry)">
                                    {{ entry.peerPossessionComparisonHistoryExpanded ? 'Hide Observation History' : 'Show Observation History' }}
                                </button>
                                <div v-if="entry.peerPossessionComparisonHistoryExpanded">
                                    <ul class="replica-knowledge-claim-list">
                                        <li v-for="(item, index) in peerPossessionObservationDetailsView(entry).entries" :key="index" class="replica-knowledge-claim">
                                            <button class="action-btn action-btn--secondary" @click="togglePeerPossessionObservationHistoryEntry(entry, index)">
                                                {{ formatWhen(item.observedAt) }} — {{ peerPossessionRowLabel(item.peerId) }} → {{ item.stateShortLabel }}
                                            </button>
                                            <dl v-if="isPeerPossessionObservationHistoryEntryExpanded(entry, index)" class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>Reported</dt>
                                                    <dd>{{ item.stateLabel }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Publication</dt>
                                                    <dd>{{ item.publicationId }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Content hash</dt>
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
                        <span class="evidence-convergence-title">Snapshot State</span>

                        <div class="evidence-list">
                            <span class="evidence-convergence-title">Content</span>
                            <dl class="evidence-fields">
                                <div class="evidence-field">
                                    <dt>Publication</dt>
                                    <dd>{{ entry.publication.id }}</dd>
                                </div>
                                <div class="evidence-field">
                                    <dt>Content hash</dt>
                                    <dd>{{ entry.publication.contentReference.hash }}</dd>
                                </div>
                            </dl>
                        </div>

                        <div class="evidence-list">
                            <span class="evidence-convergence-title">Local possession</span>
                            <p class="form-hint form-hint--neutral">
                                {{ localSnapshotAvailabilityView(entry).checked ? localSnapshotAvailabilityView(entry).message : 'Not yet checked.' }}
                            </p>
                        </div>

                        <div v-if="snapshotAcquisitionOutcomeCountsSentence(entry)" class="evidence-list">
                            <span class="evidence-convergence-title">Acquisition</span>
                            <p class="form-hint form-hint--neutral">{{ snapshotAcquisitionOutcomeCountsSentence(entry) }}</p>
                        </div>

                        <div v-if="entry.placementConvergenceView" class="evidence-list">
                            <span class="evidence-convergence-title">Placements</span>
                            <p class="form-hint form-hint--neutral">
                                {{ snapshotStatePlacementRelationshipLabel(snapshotStateInspectionView(entry)) }} ·
                                {{ entry.placementConvergenceView.placementCount }} known placement{{ entry.placementConvergenceView.placementCount === 1 ? '' : 's' }} ·
                                {{ entry.placementConvergenceView.storageTypeCount }} storage backend{{ entry.placementConvergenceView.storageTypeCount === 1 ? '' : 's' }} ·
                                {{ entry.placementConvergenceView.locatorCount }} distinct location{{ entry.placementConvergenceView.locatorCount === 1 ? '' : 's' }}
                            </p>
                        </div>

                        <div v-if="peerPossessionComparisonView(entry).peers.length > 0" class="evidence-list">
                            <span class="evidence-convergence-title">Peer observations</span>
                            <p class="form-hint form-hint--neutral">
                                {{ peerPossessionComparisonView(entry).availableCount }} available ·
                                {{ peerPossessionComparisonView(entry).notAvailableCount }} not available ·
                                {{ peerPossessionComparisonView(entry).unavailableCount }} could not determine
                            </p>
                        </div>
                    </div>
                    </div>`;
