import { anchorEvidenceListTemplate } from './anchorEvidenceList.js';
import { anchorTransactionPlansTemplate } from './anchorTransactionPlans.js';

// Publications page template: a publication card's Evidence details tab.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const evidenceTabTemplate = `<div v-show="entry.detailsTab === 'evidence'">
                    <!-- Evidence and placement summaries side by side; neither
                         is ranked above the other. -->
                    <div v-if="entry.decentralization && (entry.decentralization.evidence.anchorCount > 0 || entry.decentralization.placements.placementCount > 0)"
                         class="decentralization-summary">
                        <span class="evidence-convergence-title">{{ t('publications.decentralization') }}</span>
                        <p v-if="entry.replicaKnowledge" class="form-hint form-hint--neutral">
                            {{ t('publications.publicationKnowledge', { state: entry.replicaKnowledge.hasPublication ? t('publications.knownLocally') : t('publications.notKnownLocally') }) }}
                        </p>
                        <div class="decentralization-dimensions">
                            <div class="decentralization-dimension">
                                <span class="decentralization-dimension-title">{{ t('publications.externalEvidence2') }}</span>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.anchorClaims', { count: entry.decentralization.evidence.anchorCount }) }}
                                </p>
                                <p v-if="entry.decentralization.evidence.relationship" class="form-hint form-hint--neutral">
                                    {{ t('publications.relationship', { relationship: describeClaimRelationship(entry.decentralization.evidence.relationship, entry.decentralization.evidence.anchorCount) }) }}
                                </p>
                            </div>
                            <div class="decentralization-dimension">
                                <span class="decentralization-dimension-title">{{ t('publications.snapshotPlacements') }}</span>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.placementClaims', { count: entry.decentralization.placements.placementCount }) }}
                                    · {{ t('publications.storageTypes', { count: entry.decentralization.placements.storageTypeCount }) }}
                                </p>
                                <p v-if="entry.decentralization.placements.relationship" class="form-hint form-hint--neutral">
                                    {{ t('publications.relationship', { relationship: describeClaimRelationship(entry.decentralization.placements.relationship, entry.decentralization.placements.placementCount) }) }}
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
                                    {{ displayText(synchronizationButtonLabel(entry)) }}
                                </button>
                                <span v-if="synchronizationView(entry).label" class="peer-badge" :class="synchronizationBadgeClass(entry)">
                                    {{ displayText(synchronizationView(entry).label) }}
                                </span>
                            </div>
                            <p v-if="synchronizationView(entry).message" class="form-hint form-hint--neutral">
                                {{ displayText(synchronizationView(entry).message) }}
                            </p>
                            <dl v-if="synchronizationView(entry).newAnchorCount !== null" class="evidence-fields replica-sync-breakdown">
                                <div class="evidence-field">
                                    <dt>{{ t('publications.newClaims') }}</dt>
                                    <dd>{{ t('publications.evidenceAndPlacements', { evidence: synchronizationView(entry).newAnchorCount, placements: synchronizationView(entry).newPlacementCount }) }}</dd>
                                </div>
                                <div class="evidence-field">
                                    <dt>{{ t('publications.alreadyKnown') }}</dt>
                                    <dd>{{ t('publications.evidenceAndPlacements', { evidence: synchronizationView(entry).alreadyKnownAnchorCount, placements: synchronizationView(entry).alreadyKnownPlacementCount }) }}</dd>
                                </div>
                            </dl>
                        </div>

                        <!-- How this replica learned each claim, and what it
                             has observed about it: an inventory, not a verdict. -->
                        <div v-if="entry.replicaKnowledgeDetail" class="replica-knowledge">
                            <button class="action-btn action-btn--secondary" @click="toggleReplicaKnowledge(entry)">
                                {{ entry.replicaKnowledgeExpanded ? t('publications.hideReplicaKnowledge') : t('publications.showReplicaKnowledge') }}
                            </button>
                            <div v-if="entry.replicaKnowledgeExpanded" class="replica-knowledge-detail">
                                <div class="replica-knowledge-dimension">
                                    <span class="decentralization-dimension-title">{{ t('publications.evidence') }}</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ t('publications.claims', { count: entry.replicaKnowledgeDetail.evidence.count }) }}
                                        <template v-if="acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.evidence.claims)"> · {{ displayText(acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.evidence.claims)) }}</template>
                                    </p>
                                    <ul v-if="entry.replicaKnowledgeDetail.evidence.claims.length" class="replica-knowledge-claim-list">
                                        <li v-for="claim in entry.replicaKnowledgeDetail.evidence.claims" :key="claim.anchorId" class="replica-knowledge-claim">
                                            <dl class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>{{ t('publications.anchor') }}</dt>
                                                    <dd>{{ shortId(claim.anchorId) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>{{ t('publications.acquisition2') }}</dt>
                                                    <dd>{{ displayText(claim.acquisitionLabel) }}</dd>
                                                </div>
                                                <div class="evidence-field" v-if="claim.firstSeenAt">
                                                    <dt>{{ t('publications.firstSeen') }}</dt>
                                                    <dd>{{ formatWhen(claim.firstSeenAt) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>{{ t('publications.verification') }}</dt>
                                                    <dd>{{ displayText(claim.verificationStateLabel) }}</dd>
                                                </div>
                                            </dl>
                                        </li>
                                    </ul>
                                </div>
                                <div class="replica-knowledge-dimension">
                                    <span class="decentralization-dimension-title">{{ t('publications.placements') }}</span>
                                    <p class="form-hint form-hint--neutral">
                                        {{ t('publications.claims', { count: entry.replicaKnowledgeDetail.placements.count }) }}
                                        <template v-if="acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.placements.claims)"> · {{ displayText(acquisitionBreakdownSentence(entry.replicaKnowledgeDetail.placements.claims)) }}</template>
                                    </p>
                                    <ul v-if="entry.replicaKnowledgeDetail.placements.claims.length" class="replica-knowledge-claim-list">
                                        <li v-for="claim in entry.replicaKnowledgeDetail.placements.claims" :key="claim.placementId" class="replica-knowledge-claim">
                                            <dl class="evidence-fields">
                                                <div class="evidence-field">
                                                    <dt>{{ t('publications.placement') }}</dt>
                                                    <dd>{{ shortId(claim.placementId) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>{{ t('publications.acquisition2') }}</dt>
                                                    <dd>{{ displayText(claim.acquisitionLabel) }}</dd>
                                                </div>
                                                <div class="evidence-field" v-if="claim.firstSeenAt">
                                                    <dt>{{ t('publications.firstSeen') }}</dt>
                                                    <dd>{{ formatWhen(claim.firstSeenAt) }}</dd>
                                                </div>
                                                <div class="evidence-field">
                                                    <dt>{{ t('publications.resolution') }}</dt>
                                                    <dd>{{ displayText(claim.resolutionStateLabel) }}</dd>
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
                            <span class="evidence-summary-title">{{ t('publications.externalEvidence2') }}</span>
                            <span class="form-hint form-hint--neutral">{{ describeKnownEvidenceCount(entry.evidence) }}</span>
                            <button v-if="entry.evidence.count > 0" class="action-btn action-btn--secondary" @click="toggleEvidence(entry)">
                                {{ entry.evidenceExpanded ? t('publications.hideEvidence') : t('publications.showEvidence') }}
                            </button>
                        </div>

                        <!-- Explicit click only. -->
                        <div v-if="evidenceDiscoveryCoordinator" class="evidence-discovery">
                            <div class="evidence-discovery-header">
                                <button class="action-btn action-btn--secondary"
                                        :disabled="entry.discoveryAttempt && entry.discoveryAttempt.discovering"
                                        @click="discoverFromPeers(entry)">
                                    {{ displayText(discoveryButtonLabel(entry)) }}
                                </button>
                                <span v-if="discoveryView(entry).label" class="peer-badge" :class="discoveryBadgeClass(entry)">
                                    {{ displayText(discoveryView(entry).label) }}
                                </span>
                            </div>
                            <p v-if="discoveryView(entry).message" class="form-hint form-hint--neutral">
                                {{ displayText(discoveryView(entry).message) }}
                            </p>
                        </div>

                        <!-- Groups are ordered by contentHash, never by size: a
                             bigger group is not more likely correct. -->
                        <div v-if="entry.evidenceExpanded && entry.convergenceView && entry.convergenceView.anchorCount > 1"
                             class="evidence-convergence">
                            <span class="evidence-convergence-title">{{ t('publications.contentBinding') }}</span>
                            <div class="evidence-convergence-groups">
                                <div v-for="group in entry.convergenceView.contentGroups" :key="group.contentHash"
                                     class="evidence-convergence-group">
                                    <span class="evidence-convergence-hash">{{ shortHash(group.contentHash) }}</span>
                                    <span class="form-hint form-hint--neutral">
                                        {{ t('publications.anchorCount', { count: group.anchorCount }) }}
                                    </span>
                                </div>
                            </div>
                            <p v-if="entry.convergenceView.hasConflict" class="evidence-convergence-conflict">
                                ⚠ {{ displayText(entry.convergenceView.conflictDescription) }}
                            </p>
                        </div>

                        ${anchorTransactionPlansTemplate}

                        ${anchorEvidenceListTemplate}
                    </div>

                    </div>`;
