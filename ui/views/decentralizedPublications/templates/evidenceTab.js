import { anchorEvidenceListTemplate } from './anchorEvidenceList.js';
import { anchorTransactionPlansTemplate } from './anchorTransactionPlans.js';

// Publications page template: a publication card's Evidence details tab.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const evidenceTabTemplate = `<div v-show="entry.detailsTab === 'evidence'">
                    <!-- Evidence and placement summaries side by side; neither
                         is ranked above the other. -->
                    <div v-if="entry.decentralization && (entry.decentralization.evidence.anchorCount > 0 || entry.decentralization.placements.placementCount > 0)"
                         class="decentralization-summary">
                        <span class="evidence-convergence-title">Decentralization</span>
                        <p v-if="entry.replicaKnowledge" class="form-hint form-hint--neutral">
                            Publication: {{ entry.replicaKnowledge.hasPublication ? 'known locally' : 'not known locally' }}
                        </p>
                        <div class="decentralization-dimensions">
                            <div class="decentralization-dimension">
                                <span class="decentralization-dimension-title">External Evidence</span>
                                <p class="form-hint form-hint--neutral">
                                    {{ entry.decentralization.evidence.anchorCount }} anchor claim{{ entry.decentralization.evidence.anchorCount === 1 ? '' : 's' }}
                                </p>
                                <p v-if="entry.decentralization.evidence.relationship" class="form-hint form-hint--neutral">
                                    Relationship: {{ entry.decentralization.evidence.relationship === 'conflict' ? 'Conflict' : 'Agreement' }}
                                </p>
                            </div>
                            <div class="decentralization-dimension">
                                <span class="decentralization-dimension-title">Snapshot Placements</span>
                                <p class="form-hint form-hint--neutral">
                                    {{ entry.decentralization.placements.placementCount }} placement claim{{ entry.decentralization.placements.placementCount === 1 ? '' : 's' }}
                                    · {{ entry.decentralization.placements.storageTypeCount }} storage type{{ entry.decentralization.placements.storageTypeCount === 1 ? '' : 's' }}
                                </p>
                                <p v-if="entry.decentralization.placements.relationship" class="form-hint form-hint--neutral">
                                    Relationship: {{ entry.decentralization.placements.relationship === 'conflict' ? 'Conflict' : 'Agreement' }}
                                </p>
                            </div>
                        </div>
                        <p v-if="decentralizationContrast(entry)" class="evidence-convergence-conflict">
                            {{ decentralizationContrast(entry) }}
                        </p>

                        <!-- Explicit click only. -->
                        <div v-if="knowledgeSynchronizationCoordinator" class="evidence-discovery">
                            <div class="evidence-discovery-header">
                                <button class="action-btn action-btn--secondary"
                                        :disabled="entry.synchronizationAttempt && entry.synchronizationAttempt.synchronizing"
                                        @click="synchronizeWithPeers(entry)">
                                    {{ synchronizationButtonLabel(entry) }}
                                </button>
                                <span v-if="synchronizationView(entry).label" class="peer-badge" :class="synchronizationBadgeClass(entry)">
                                    {{ synchronizationView(entry).label }}
                                </span>
                            </div>
                            <p v-if="synchronizationView(entry).message" class="form-hint form-hint--neutral">
                                {{ synchronizationView(entry).message }}
                            </p>
                            <dl v-if="synchronizationView(entry).newAnchorCount !== null" class="evidence-fields replica-sync-breakdown">
                                <div class="evidence-field">
                                    <dt>New claims</dt>
                                    <dd>Evidence: {{ synchronizationView(entry).newAnchorCount }} · Placements: {{ synchronizationView(entry).newPlacementCount }}</dd>
                                </div>
                                <div class="evidence-field">
                                    <dt>Already known</dt>
                                    <dd>Evidence: {{ synchronizationView(entry).alreadyKnownAnchorCount }} · Placements: {{ synchronizationView(entry).alreadyKnownPlacementCount }}</dd>
                                </div>
                            </dl>
                        </div>

                        <!-- How this replica learned each claim, and what it
                             has observed about it: an inventory, not a verdict. -->
                        <div v-if="entry.replicaKnowledgeDetail" class="replica-knowledge">
                            <button class="action-btn action-btn--secondary" @click="toggleReplicaKnowledge(entry)">
                                {{ entry.replicaKnowledgeExpanded ? 'Hide Replica Knowledge' : 'Show Replica Knowledge' }}
                            </button>
                            <div v-if="entry.replicaKnowledgeExpanded" class="replica-knowledge-detail">
                                <div class="replica-knowledge-dimension">
                                    <span class="decentralization-dimension-title">Evidence</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ entry.replicaKnowledgeDetail.evidence.count }} claim{{ entry.replicaKnowledgeDetail.evidence.count === 1 ? '' : 's' }}
                                        <template v-if="acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.evidence.claims)"> · {{ acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.evidence.claims) }}</template>
                                    </p>
                                    <ul v-if="entry.replicaKnowledgeDetail.evidence.claims.length" class="replica-knowledge-claim-list">
                                        <li v-for="claim in entry.replicaKnowledgeDetail.evidence.claims" :key="claim.anchorId" class="replica-knowledge-claim">
                                            <dl class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>Anchor</dt>
                                                    <dd>{{ shortId(claim.anchorId) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Acquisition</dt>
                                                    <dd>{{ claim.acquisitionLabel }}</dd>
                                                </div>
                                                <div class="evidence-field" v-if="claim.firstSeenAt">
                                                    <dt>First seen</dt>
                                                    <dd>{{ formatWhen(claim.firstSeenAt) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Verification</dt>
                                                    <dd>{{ claim.verificationStateLabel }}</dd>
                                                </div>
                                            </dl>
                                        </li>
                                    </ul>
                                </div>
                                <div class="replica-knowledge-dimension">
                                    <span class="decentralization-dimension-title">Placements</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ entry.replicaKnowledgeDetail.placements.count }} claim{{ entry.replicaKnowledgeDetail.placements.count === 1 ? '' : 's' }}
                                        <template v-if="acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.placements.claims)"> · {{ acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.placements.claims) }}</template>
                                    </p>
                                    <ul v-if="entry.replicaKnowledgeDetail.placements.claims.length" class="replica-knowledge-claim-list">
                                        <li v-for="claim in entry.replicaKnowledgeDetail.placements.claims" :key="claim.placementId" class="replica-knowledge-claim">
                                            <dl class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>Placement</dt>
                                                    <dd>{{ shortId(claim.placementId) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Acquisition</dt>
                                                    <dd>{{ claim.acquisitionLabel }}</dd>
                                                </div>
                                                <div class="evidence-field" v-if="claim.firstSeenAt">
                                                    <dt>First seen</dt>
                                                    <dd>{{ formatWhen(claim.firstSeenAt) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>Resolution</dt>
                                                    <dd>{{ claim.resolutionStateLabel }}</dd>
                                                </div>
                                            </dl>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div v-if="entry.evidence" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">External Evidence</span>
                            <span class="form-hint form-hint--neutral">{{ describeKnownEvidenceCount(entry.evidence) }}</span>
                            <button v-if="entry.evidence.count > 0" class="action-btn action-btn--secondary" @click="toggleEvidence(entry)">
                                {{ entry.evidenceExpanded ? 'Hide Evidence' : 'Show Evidence' }}
                            </button>
                        </div>

                        <!-- Explicit click only. -->
                        <div v-if="evidenceDiscoveryCoordinator" class="evidence-discovery">
                            <div class="evidence-discovery-header">
                                <button class="action-btn action-btn--secondary"
                                        :disabled="entry.discoveryAttempt && entry.discoveryAttempt.discovering"
                                        @click="discoverFromPeers(entry)">
                                    {{ discoveryButtonLabel(entry) }}
                                </button>
                                <span v-if="discoveryView(entry).label" class="peer-badge" :class="discoveryBadgeClass(entry)">
                                    {{ discoveryView(entry).label }}
                                </span>
                            </div>
                            <p v-if="discoveryView(entry).message" class="form-hint form-hint--neutral">
                                {{ discoveryView(entry).message }}
                            </p>
                        </div>

                        <!-- Groups are ordered by contentHash, never by size: a
                             bigger group is not more likely correct. -->
                        <div v-if="entry.evidenceExpanded && entry.convergenceView && entry.convergenceView.anchorCount > 1"
                             class="evidence-convergence">
                            <span class="evidence-convergence-title">Content binding</span>
                            <div class="evidence-convergence-groups">
                                <div v-for="group in entry.convergenceView.contentGroups" :key="group.contentHash"
                                     class="evidence-convergence-group">
                                    <span class="evidence-convergence-hash">{{ shortHash(group.contentHash) }}</span>
                                    <span class="form-hint form-hint--neutral">
                                        {{ group.anchorCount }} anchor{{ group.anchorCount === 1 ? '' : 's' }}
                                    </span>
                                </div>
                            </div>
                            <p v-if="entry.convergenceView.hasConflict" class="evidence-convergence-conflict">
                                ⚠ {{ entry.convergenceView.conflictDescription }}
                            </p>
                        </div>

                        ${anchorTransactionPlansTemplate}

                        ${anchorEvidenceListTemplate}
                    </div>

                    </div>`;
