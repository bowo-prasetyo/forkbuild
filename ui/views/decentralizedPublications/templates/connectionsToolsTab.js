// Publications page template: the References & Achievements tools tab.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const connectionsToolsTabTemplate = `<div v-show="publicationsToolsTab === 'connections'">
            <!-- References are recorded explicitly between known identities,
                 never inferred. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Publication References</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    An explicit, durable record that one publication references another — never inferred
                    from matching content, timestamps, or authors. Both publications must already have a
                    durable identity above; a reference is never a "fork" classification, only a plain,
                    attributable fact: this publication points at that one.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>References recorded</dt><dd>{{ publicationReferenceRecordHistoryView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationReferences">
                        {{ publicationReferencesExpanded ? 'Hide References' : 'Show References' }}
                    </button>
                </div>
                <div v-if="publicationReferencesExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Record A New Reference</span>
                    <p v-if="knownPublicationIdentityOptions().length < 2" class="form-hint form-hint--neutral">
                        At least two publication identities (Bitcoin or Base, above) are needed before a
                        reference can be recorded.
                    </p>
                    <template v-else>
                        <label class="form-field">
                            <span class="form-label">Source publication (the one making the reference)</span>
                            <select v-model="publicationReferenceSourceKey" class="form-input">
                                <option value="" disabled>Choose a publication…</option>
                                <option v-for="option in knownPublicationIdentityOptions()" :key="'src-' + option.key" :value="option.key">
                                    {{ option.label }}
                                </option>
                            </select>
                        </label>
                        <label class="form-field">
                            <span class="form-label">Referenced publication (the one being pointed at)</span>
                            <select v-model="publicationReferenceReferencedKey" class="form-input">
                                <option value="" disabled>Choose a publication…</option>
                                <option v-for="option in knownPublicationIdentityOptions()" :key="'ref-' + option.key" :value="option.key">
                                    {{ option.label }}
                                </option>
                            </select>
                        </label>
                        <div class="identity-mgmt-actions">
                            <button type="button" class="action-btn action-btn--secondary"
                                    :disabled="!publicationReferenceSourceKey || !publicationReferenceReferencedKey"
                                    @click="recordPublicationReference">
                                Record Reference
                            </button>
                        </div>
                        <p v-if="publicationReferenceError" class="identity-unlock-error">{{ publicationReferenceError }}</p>
                    </template>

                    <span class="evidence-inspection-adapter-title">Recorded References</span>
                    <p v-if="publicationReferenceRecordHistoryView().count === 0" class="form-hint form-hint--neutral">
                        No references recorded yet.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="(referenceRow, referenceIndex) in publicationReferenceRecordHistoryView().records" :key="referenceIndex" class="replica-knowledge-claim">
                            <span class="peer-badge peer-badge--pending">
                                {{ referenceRow.sourcePublicationIdentity.blockchain }}:{{ shortId(referenceRow.sourcePublicationIdentity.chainReference) }}
                                references
                                {{ referenceRow.referencedPublicationIdentity.blockchain }}:{{ shortId(referenceRow.referencedPublicationIdentity.chainReference) }}
                            </span>
                            <p class="form-hint form-hint--neutral">
                                Source content hash: {{ referenceRow.sourcePublicationIdentity.contentHash }} ·
                                Referenced content hash: {{ referenceRow.referencedPublicationIdentity.contentHash }} ·
                                Recorded: {{ formatWhen(referenceRow.createdAt) }}
                            </p>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Read-only graph of recorded references; counts are facts, not a
                 ranking. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Publication Reference Graph</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    The same recorded references above, grouped by publication so this replica's own
                    reference graph is inspectable at a glance. A publication's outgoing/incoming counts
                    are plain, attributable facts — never a score, a rank, or a claim that one
                    publication is more valuable than another.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Edges</dt><dd>{{ publicationReferenceGraphView().edgeCount }}</dd></div>
                    <div class="evidence-field"><dt>Publications</dt><dd>{{ publicationReferenceGraphView().nodes.length }}</dd></div>
                    <div class="evidence-field"><dt>Distinct sources</dt><dd>{{ publicationReferenceGraphView().distinctSourcePublicationCount }}</dd></div>
                    <div class="evidence-field"><dt>Distinct referenced</dt><dd>{{ publicationReferenceGraphView().distinctReferencedPublicationCount }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationReferenceGraph">
                        {{ publicationReferenceGraphExpanded ? 'Hide Reference Graph' : 'Show Reference Graph' }}
                    </button>
                </div>
                <div v-if="publicationReferenceGraphExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Publications In This Graph</span>
                    <p v-if="publicationReferenceGraphView().nodes.length === 0" class="form-hint form-hint--neutral">
                        No references recorded yet — record one above and it appears here.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="node in publicationReferenceGraphView().nodes" :key="node.identity.blockchain + ':' + node.identity.chainReference" class="replica-knowledge-claim">
                            <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationReferenceGraphNode(node)">
                                {{ node.identity.blockchain }}:{{ shortId(node.identity.chainReference) }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                Outgoing references: {{ node.outgoingReferenceCount }} ·
                                Incoming references: {{ node.incomingReferenceCount }}
                            </p>

                            <div v-if="isPublicationReferenceGraphNodeExpanded(node)" class="evidence-list">
                                <p v-if="node.outgoingReferenceCount === 0 && node.incomingReferenceCount === 0" class="form-hint form-hint--neutral">
                                    No edges touch this publication.
                                </p>
                                <template v-if="node.outgoingReferenceCount > 0">
                                    <p class="form-hint form-hint--neutral"><strong>References →</strong></p>
                                    <p v-for="(edge, edgeIndex) in node.outgoingReferences" :key="'out-' + edgeIndex" class="form-hint form-hint--neutral">
                                        {{ edge.referencedPublicationIdentity.blockchain }}:{{ shortId(edge.referencedPublicationIdentity.chainReference) }}
                                        — recorded {{ formatWhen(edge.createdAt) }}
                                    </p>
                                </template>
                                <template v-if="node.incomingReferenceCount > 0">
                                    <p class="form-hint form-hint--neutral"><strong>← Referenced by</strong></p>
                                    <p v-for="(edge, edgeIndex) in node.incomingReferences" :key="'in-' + edgeIndex" class="form-hint form-hint--neutral">
                                        {{ edge.sourcePublicationIdentity.blockchain }}:{{ shortId(edge.sourcePublicationIdentity.chainReference) }}
                                        — recorded {{ formatWhen(edge.createdAt) }}
                                    </p>
                                </template>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Badges present achievement events; no points, scores or ranks. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Achievements</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    A human-facing presentation of this replica's own achievement events, each one
                    attributed to the exact durable publication record that earned it. A badge is
                    never a score, a rank, or a statement about a person's worth — only a threshold
                    this replica's own publications have crossed, and when.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Badges earned</dt><dd>{{ achievementBadgesView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleAchievements">
                        {{ achievementsExpanded ? 'Hide Achievements' : 'Show Achievements' }}
                    </button>
                </div>
                <div v-if="achievementsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Achievement Badges</span>
                    <p v-if="achievementBadgesView().count === 0" class="form-hint form-hint--neutral">
                        No achievements earned yet. Publishing a blockchain-anchored record elsewhere on
                        this page earns one automatically, the moment its own threshold is crossed.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="badge in achievementBadgesView().badges" :key="badge.index" class="replica-knowledge-claim">
                            <button type="button" class="action-btn action-btn--secondary" @click="toggleAchievementBadge(badge.index)">
                                {{ badge.icon }} {{ badge.title }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                {{ badge.description }} — earned {{ formatWhen(badge.earnedAt) }}
                            </p>

                            <div v-if="isAchievementBadgeExpanded(badge.index)" class="evidence-list">
                                <span class="evidence-convergence-title">Source Publication</span>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>Blockchain</dt><dd>{{ badge.sourcePublicationIdentity.blockchain }}</dd></div>
                                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ badge.sourcePublicationIdentity.contentHash }}</dd></div>
                                    <div class="evidence-field"><dt>Chain reference</dt><dd>{{ badge.sourcePublicationIdentity.chainReference }}</dd></div>
                                    <div class="evidence-field"><dt>Created</dt><dd>{{ formatWhen(badge.sourcePublicationIdentity.createdAt) }}</dd></div>
                                </dl>
                                <p class="form-hint form-hint--neutral">
                                    This badge is a presentation of one achievement event — it names the exact
                                    publication identity that earned it, never a score or a rank.
                                </p>
                                <button v-if="canViewAchievementBadgeLifecycle(badge)" type="button" class="action-btn action-btn--secondary"
                                        @click="viewAchievementBadgeLifecycle(badge)">
                                    View Publication Lifecycle Above
                                </button>
                                <p v-else class="form-hint form-hint--neutral">
                                    This replica could not resolve this badge's own source anchor to a publication
                                    lifecycle timeline above.
                                </p>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Scoped to a publication identity, never a person or wallet. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Achievement Profile</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    A publication identity's own slice of this replica's achievement events — never a
                    human or wallet profile. ForkBuild can state that a publication earned an
                    achievement; it cannot yet state that a person did, because no durable record here
                    links a publication identity to a human identity.
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleAchievementProfile">
                        {{ achievementProfileExpanded ? 'Hide Achievement Profile' : 'Show Achievement Profile' }}
                    </button>
                </div>
                <div v-if="achievementProfileExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Choose A Publication</span>
                    <p v-if="knownPublicationIdentityOptions().length === 0" class="form-hint form-hint--neutral">
                        No publication identities recorded yet — publish a Bitcoin or Base anchor above
                        first.
                    </p>
                    <label v-else class="form-field">
                        <span class="form-label">Publication</span>
                        <select v-model="achievementProfileSelectedKey" class="form-input">
                            <option value="" disabled>Choose a publication…</option>
                            <option v-for="option in knownPublicationIdentityOptions()" :key="'profile-' + option.key" :value="option.key">
                                {{ option.label }}
                            </option>
                        </select>
                    </label>

                    <template v-if="achievementProfileSelectedKey">
                        <span class="evidence-inspection-adapter-title">Achievement Profile</span>
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Publication</dt><dd>{{ achievementProfileView().publicationIdentity.blockchain }} — {{ shortId(achievementProfileView().publicationIdentity.chainReference) }}</dd></div>
                            <div class="evidence-field"><dt>Achievements</dt><dd>{{ achievementProfileView().achievementCount }}</dd></div>
                        </dl>
                        <p v-if="achievementProfileView().achievementCount === 0" class="form-hint form-hint--neutral">
                            This publication has not earned any achievements yet.
                        </p>
                        <ul v-else class="replica-knowledge-claim-list">
                            <li v-for="(achievement, achievementIndex) in achievementProfileView().achievements" :key="achievementIndex" class="replica-knowledge-claim">
                                <span class="peer-badge peer-badge--pending">🏆 {{ achievement.label }}</span>
                                <p class="form-hint form-hint--neutral">
                                    Earned {{ formatWhen(achievement.observedAt) }}
                                </p>
                            </li>
                        </ul>
                        <p class="form-hint form-hint--neutral">
                            These achievements belong to this publication identity — not necessarily to
                            any particular person.
                        </p>
                    </template>
                </div>
            </div>

            <!-- A publisher identifier is a bare typed label, never a verified
                 identity or ownership claim. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">Publisher Associations</span>
                    <span class="peer-badge peer-badge--pending">Persisted locally</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    An explicit, durable record that a publisher identity claims a publication — never
                    inferred from matching wallets, matching content, or matching names. A publisher
                    identifier is a bare, explicit label, never a cryptographic proof of ownership or of
                    the human behind it.
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>Associations recorded</dt><dd>{{ publisherPublicationAssociationRecordHistoryView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublisherAssociations">
                        {{ publisherAssociationsExpanded ? 'Hide Publisher Associations' : 'Show Publisher Associations' }}
                    </button>
                </div>
                <div v-if="publisherAssociationsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">Associate A Publication With A Publisher</span>
                    <p v-if="knownPublicationIdentityOptions().length === 0" class="form-hint form-hint--neutral">
                        At least one publication identity (Bitcoin or Base, above) is needed before an
                        association can be recorded.
                    </p>
                    <template v-else>
                        <label class="form-field">
                            <span class="form-label">Publisher identifier</span>
                            <input v-model="publisherAssociationPublisherId" type="text" class="form-input"
                                   list="publisher-association-known-identifiers" placeholder="e.g. Publisher A">
                            <datalist id="publisher-association-known-identifiers">
                                <option v-for="publisherId in distinctPublisherIdentifiersView()" :key="publisherId" :value="publisherId"></option>
                            </datalist>
                        </label>
                        <label class="form-field">
                            <span class="form-label">Publication</span>
                            <select v-model="publisherAssociationPublicationKey" class="form-input">
                                <option value="" disabled>Choose a publication…</option>
                                <option v-for="option in knownPublicationIdentityOptions()" :key="'assoc-' + option.key" :value="option.key">
                                    {{ option.label }}
                                </option>
                            </select>
                        </label>
                        <div class="identity-mgmt-actions">
                            <button type="button" class="action-btn action-btn--secondary"
                                    :disabled="!publisherAssociationPublisherId.trim() || !publisherAssociationPublicationKey"
                                    @click="recordPublisherAssociation">
                                Add Publication
                            </button>
                        </div>
                        <p v-if="publisherAssociationError" class="identity-unlock-error">{{ publisherAssociationError }}</p>
                    </template>

                    <span class="evidence-inspection-adapter-title">Recorded Associations</span>
                    <p v-if="publisherPublicationAssociationRecordHistoryView().count === 0" class="form-hint form-hint--neutral">
                        No associations recorded yet.
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="(associationRow, associationIndex) in publisherPublicationAssociationRecordHistoryView().records" :key="associationIndex" class="replica-knowledge-claim">
                            <span class="peer-badge peer-badge--pending">
                                {{ associationRow.publisherIdentity.publisherId }} —
                                {{ associationRow.publicationIdentity.blockchain }}:{{ shortId(associationRow.publicationIdentity.chainReference) }}
                            </span>
                            <p class="form-hint form-hint--neutral">
                                Content hash: {{ associationRow.publicationIdentity.contentHash }} ·
                                Recorded: {{ formatWhen(associationRow.createdAt) }}
                            </p>
                        </li>
                    </ul>

                    <span class="evidence-inspection-adapter-title">A Publisher's Associated Publications</span>
                    <p v-if="distinctPublisherIdentifiersView().length === 0" class="form-hint form-hint--neutral">
                        No publisher has been associated with anything yet — record one above and it
                        appears here.
                    </p>
                    <label v-else class="form-field">
                        <span class="form-label">Publisher</span>
                        <select v-model="publisherAssociationSelectedPublisherId" class="form-input">
                            <option value="" disabled>Choose a publisher…</option>
                            <option v-for="publisherId in distinctPublisherIdentifiersView()" :key="'view-' + publisherId" :value="publisherId">
                                {{ publisherId }}
                            </option>
                        </select>
                    </label>

                    <template v-if="publisherAssociationSelectedPublisherId">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>Publisher</dt><dd>{{ publisherAssociationProfileView().publisherIdentity.publisherId }}</dd></div>
                            <div class="evidence-field"><dt>Associated publications</dt><dd>{{ publisherAssociationProfileView().associationCount }}</dd></div>
                        </dl>
                        <p v-if="publisherAssociationProfileView().associationCount === 0" class="form-hint form-hint--neutral">
                            This publisher has not been associated with any publication.
                        </p>
                        <ul v-else class="replica-knowledge-claim-list">
                            <li v-for="(association, associationIndex) in publisherAssociationProfileView().associations" :key="associationIndex" class="replica-knowledge-claim">
                                <span class="peer-badge peer-badge--pending">
                                    {{ association.publicationIdentity.blockchain }} — {{ shortId(association.publicationIdentity.chainReference) }}
                                </span>
                                <p class="form-hint form-hint--neutral">
                                    Content hash: {{ association.publicationIdentity.contentHash }} ·
                                    Associated: {{ formatWhen(association.createdAt) }}
                                </p>
                            </li>
                        </ul>
                        <p class="form-hint form-hint--neutral">
                            This is an explicit claim, not a verified fact — it states that this publisher
                            identity was associated with these publications, never that this replica has
                            proven who controls them.
                        </p>
                    </template>
                </div>
            </div>

            <!-- Publisher achievement profile, badges and statistics live on
                 ui/views/LeaderboardHubView.js. -->
            </div>`;
