// Publications page template: the References & Achievements tools tab.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const connectionsToolsTabTemplate = `<div v-show="publicationsToolsTab === 'connections'">
            <!-- References are recorded explicitly between known identities,
                 never inferred. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.publicationReferences') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('publications.persistedLocally3') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.anExplicitDurableRecordThat2') }}
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>{{ t('publications.referencesRecorded') }}</dt><dd>{{ publicationReferenceRecordHistoryView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationReferences">
                        {{ publicationReferencesExpanded ? t('publications.hideReferences') : t('publications.showReferences') }}
                    </button>
                </div>
                <div v-if="publicationReferencesExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.recordANewReference') }}</span>
                    <p v-if="knownPublicationIdentityOptions().length < 2" class="form-hint form-hint--neutral">
                        {{ t('publications.atLeastTwoPublicationIdentities') }}
                    </p>
                    <template v-else>
                        <label class="form-field">
                            <span class="form-label">{{ t('publications.sourcePublicationTheOneMaking') }}</span>
                            <select v-model="publicationReferenceSourceKey" class="form-input">
                                <option value="" disabled>{{ t('publications.chooseAPublication') }}</option>
                                <option v-for="option in knownPublicationIdentityOptions()" :key="'src-' + option.key" :value="option.key">
                                    {{ displayText(option.label) }}
                                </option>
                            </select>
                        </label>
                        <label class="form-field">
                            <span class="form-label">{{ t('publications.referencedPublicationTheOneBeing') }}</span>
                            <select v-model="publicationReferenceReferencedKey" class="form-input">
                                <option value="" disabled>{{ t('publications.chooseAPublication') }}</option>
                                <option v-for="option in knownPublicationIdentityOptions()" :key="'ref-' + option.key" :value="option.key">
                                    {{ displayText(option.label) }}
                                </option>
                            </select>
                        </label>
                        <div class="identity-mgmt-actions">
                            <button type="button" class="action-btn action-btn--secondary"
                                    :disabled="!publicationReferenceSourceKey || !publicationReferenceReferencedKey"
                                    @click="recordPublicationReference">
                                {{ t('publications.recordReference') }}
                            </button>
                        </div>
                        <p v-if="publicationReferenceError" class="identity-unlock-error">{{ publicationReferenceError }}</p>
                    </template>

                    <span class="evidence-inspection-adapter-title">{{ t('publications.recordedReferences') }}</span>
                    <p v-if="publicationReferenceRecordHistoryView().count === 0" class="form-hint form-hint--neutral">
                        {{ t('publications.noReferencesRecordedYet') }}
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="(referenceRow, referenceIndex) in publicationReferenceRecordHistoryView().records" :key="referenceIndex" class="replica-knowledge-claim">
                            <span class="peer-badge peer-badge--pending">
                                {{ t('publications.references2', { blockchain: referenceRow.sourcePublicationIdentity.blockchain, chainReference: shortId(referenceRow.sourcePublicationIdentity.chainReference), blockchain2: referenceRow.referencedPublicationIdentity.blockchain, chainReference2: shortId(referenceRow.referencedPublicationIdentity.chainReference) }) }}
                            </span>
                            <p class="form-hint form-hint--neutral">
                                {{ t('publications.sourceContentHashReferencedContent', { contentHash: referenceRow.sourcePublicationIdentity.contentHash, contentHash2: referenceRow.referencedPublicationIdentity.contentHash, createdAt: formatWhen(referenceRow.createdAt) }) }}
                            </p>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Read-only graph of recorded references; counts are facts, not a
                 ranking. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.publicationReferenceGraph') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('publications.persistedLocally3') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.theSameRecordedReferencesAbove') }}
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>{{ t('publications.edges') }}</dt><dd>{{ publicationReferenceGraphView().edgeCount }}</dd></div>
                    <div class="evidence-field"><dt>{{ t('publications.publications4') }}</dt><dd>{{ publicationReferenceGraphView().nodes.length }}</dd></div>
                    <div class="evidence-field"><dt>{{ t('publications.distinctSources') }}</dt><dd>{{ publicationReferenceGraphView().distinctSourcePublicationCount }}</dd></div>
                    <div class="evidence-field"><dt>{{ t('publications.distinctReferenced') }}</dt><dd>{{ publicationReferenceGraphView().distinctReferencedPublicationCount }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationReferenceGraph">
                        {{ publicationReferenceGraphExpanded ? t('publications.hideReferenceGraph') : t('publications.showReferenceGraph') }}
                    </button>
                </div>
                <div v-if="publicationReferenceGraphExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.publicationsInThisGraph') }}</span>
                    <p v-if="publicationReferenceGraphView().nodes.length === 0" class="form-hint form-hint--neutral">
                        {{ t('publications.noReferencesRecordedYetRecord') }}
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="node in publicationReferenceGraphView().nodes" :key="node.identity.blockchain + ':' + node.identity.chainReference" class="replica-knowledge-claim">
                            <button type="button" class="action-btn action-btn--secondary" @click="togglePublicationReferenceGraphNode(node)">
                                {{ node.identity.blockchain }}:{{ shortId(node.identity.chainReference) }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                {{ t('publications.outgoingReferencesIncomingReferences', { outgoingReferenceCount: node.outgoingReferenceCount, incomingReferenceCount: node.incomingReferenceCount }) }}
                            </p>

                            <div v-if="isPublicationReferenceGraphNodeExpanded(node)" class="evidence-list">
                                <p v-if="node.outgoingReferenceCount === 0 && node.incomingReferenceCount === 0" class="form-hint form-hint--neutral">
                                    {{ t('publications.noEdgesTouchThisPublication') }}
                                </p>
                                <template v-if="node.outgoingReferenceCount > 0">
                                    <p class="form-hint form-hint--neutral"><strong>{{ t('publications.references') }}</strong></p>
                                    <p v-for="(edge, edgeIndex) in node.outgoingReferences" :key="'out-' + edgeIndex" class="form-hint form-hint--neutral">
                                        {{ t('publications.recorded2', { blockchain: edge.referencedPublicationIdentity.blockchain, chainReference: shortId(edge.referencedPublicationIdentity.chainReference), createdAt: formatWhen(edge.createdAt) }) }}
                                    </p>
                                </template>
                                <template v-if="node.incomingReferenceCount > 0">
                                    <p class="form-hint form-hint--neutral"><strong>{{ t('publications.referencedBy') }}</strong></p>
                                    <p v-for="(edge, edgeIndex) in node.incomingReferences" :key="'in-' + edgeIndex" class="form-hint form-hint--neutral">
                                        {{ t('publications.recorded2', { blockchain: edge.sourcePublicationIdentity.blockchain, chainReference: shortId(edge.sourcePublicationIdentity.chainReference), createdAt: formatWhen(edge.createdAt) }) }}
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
                    <span class="identity-mgmt-name">{{ t('publications.achievements') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('publications.persistedLocally3') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.aHumanFacingPresentationOf') }}
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>{{ t('publications.badgesEarned') }}</dt><dd>{{ achievementBadgesView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleAchievements">
                        {{ achievementsExpanded ? t('publications.hideAchievements') : t('publications.showAchievements') }}
                    </button>
                </div>
                <div v-if="achievementsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.achievementBadges') }}</span>
                    <p v-if="achievementBadgesView().count === 0" class="form-hint form-hint--neutral">
                        {{ t('publications.noAchievementsEarnedYetPublishing') }}
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="badge in achievementBadgesView().badges" :key="badge.index" class="replica-knowledge-claim">
                            <button type="button" class="action-btn action-btn--secondary" @click="toggleAchievementBadge(badge.index)">
                                {{ badge.icon }} {{ displayText(badge.title) }}
                            </button>
                            <p class="form-hint form-hint--neutral">
                                {{ t('publications.earned', { description: displayText(badge.description), earnedAt: formatWhen(badge.earnedAt) }) }}
                            </p>

                            <div v-if="isAchievementBadgeExpanded(badge.index)" class="evidence-list">
                                <span class="evidence-convergence-title">{{ t('publications.sourcePublication') }}</span>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>{{ t('publications.blockchain') }}</dt><dd>{{ badge.sourcePublicationIdentity.blockchain }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.contentHash5') }}</dt><dd>{{ badge.sourcePublicationIdentity.contentHash }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.chainReference') }}</dt><dd>{{ badge.sourcePublicationIdentity.chainReference }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.created') }}</dt><dd>{{ formatWhen(badge.sourcePublicationIdentity.createdAt) }}</dd></div>
                                </dl>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.thisBadgeIsAPresentation') }}
                                </p>
                                <button v-if="canViewAchievementBadgeLifecycle(badge)" type="button" class="action-btn action-btn--secondary"
                                        @click="viewAchievementBadgeLifecycle(badge)">
                                    {{ t('publications.viewPublicationLifecycleAbove') }}
                                </button>
                                <p v-else class="form-hint form-hint--neutral">
                                    {{ t('publications.thisReplicaCouldNotResolve') }}
                                </p>
                            </div>
                        </li>
                    </ul>
                </div>
            </div>

            <!-- Scoped to a publication identity, never a person or wallet. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.achievementProfile') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('publications.persistedLocally3') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.aPublicationIdentitySOwn') }}
                </p>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="toggleAchievementProfile">
                        {{ achievementProfileExpanded ? t('publications.hideAchievementProfile') : t('publications.showAchievementProfile') }}
                    </button>
                </div>
                <div v-if="achievementProfileExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.chooseAPublication2') }}</span>
                    <p v-if="knownPublicationIdentityOptions().length === 0" class="form-hint form-hint--neutral">
                        {{ t('publications.noPublicationIdentitiesRecordedYet') }}
                    </p>
                    <label v-else class="form-field">
                        <span class="form-label">{{ t('publications.publication2') }}</span>
                        <select v-model="achievementProfileSelectedKey" class="form-input">
                            <option value="" disabled>{{ t('publications.chooseAPublication') }}</option>
                            <option v-for="option in knownPublicationIdentityOptions()" :key="'profile-' + option.key" :value="option.key">
                                {{ displayText(option.label) }}
                            </option>
                        </select>
                    </label>

                    <template v-if="achievementProfileSelectedKey">
                        <span class="evidence-inspection-adapter-title">{{ t('publications.achievementProfile') }}</span>
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>{{ t('publications.publication2') }}</dt><dd>{{ achievementProfileView().publicationIdentity.blockchain }} — {{ shortId(achievementProfileView().publicationIdentity.chainReference) }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.achievements') }}</dt><dd>{{ achievementProfileView().achievementCount }}</dd></div>
                        </dl>
                        <p v-if="achievementProfileView().achievementCount === 0" class="form-hint form-hint--neutral">
                            {{ t('publications.thisPublicationHasNotEarned') }}
                        </p>
                        <ul v-else class="replica-knowledge-claim-list">
                            <li v-for="(achievement, achievementIndex) in achievementProfileView().achievements" :key="achievementIndex" class="replica-knowledge-claim">
                                <span class="peer-badge peer-badge--pending">🏆 {{ displayText(achievement.label) }}</span>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.earned2', { observedAt: formatWhen(achievement.observedAt) }) }}
                                </p>
                            </li>
                        </ul>
                        <p class="form-hint form-hint--neutral">
                            {{ t('publications.theseAchievementsBelongToThis') }}
                        </p>
                    </template>
                </div>
            </div>

            <!-- A publisher identifier is a bare typed label, never a verified
                 identity or ownership claim. -->
            <div class="identity-mgmt-card">
                <div class="identity-mgmt-card-header">
                    <span class="identity-mgmt-name">{{ t('publications.publisherAssociations') }}</span>
                    <span class="peer-badge peer-badge--pending">{{ t('publications.persistedLocally3') }}</span>
                </div>
                <p class="form-hint form-hint--neutral">
                    {{ t('publications.anExplicitDurableRecordThat') }}
                </p>
                <dl class="evidence-fields">
                    <div class="evidence-field"><dt>{{ t('publications.associationsRecorded') }}</dt><dd>{{ publisherPublicationAssociationRecordHistoryView().count }}</dd></div>
                </dl>
                <div class="identity-mgmt-actions">
                    <button type="button" class="action-btn action-btn--secondary" @click="togglePublisherAssociations">
                        {{ publisherAssociationsExpanded ? t('publications.hidePublisherAssociations') : t('publications.showPublisherAssociations') }}
                    </button>
                </div>
                <div v-if="publisherAssociationsExpanded" class="evidence-inspection-adapter">
                    <span class="evidence-inspection-adapter-title">{{ t('publications.associateAPublicationWithA') }}</span>
                    <p v-if="knownPublicationIdentityOptions().length === 0" class="form-hint form-hint--neutral">
                        {{ t('publications.atLeastOnePublicationIdentity') }}
                    </p>
                    <template v-else>
                        <label class="form-field">
                            <span class="form-label">{{ t('publications.publisherIdentifier') }}</span>
                            <input v-model="publisherAssociationPublisherId" type="text" class="form-input"
                                   list="publisher-association-known-identifiers" :placeholder="t('publications.eGPublisherA')">
                            <datalist id="publisher-association-known-identifiers">
                                <option v-for="publisherId in distinctPublisherIdentifiersView()" :key="publisherId" :value="publisherId"></option>
                            </datalist>
                        </label>
                        <label class="form-field">
                            <span class="form-label">{{ t('publications.publication2') }}</span>
                            <select v-model="publisherAssociationPublicationKey" class="form-input">
                                <option value="" disabled>{{ t('publications.chooseAPublication') }}</option>
                                <option v-for="option in knownPublicationIdentityOptions()" :key="'assoc-' + option.key" :value="option.key">
                                    {{ displayText(option.label) }}
                                </option>
                            </select>
                        </label>
                        <div class="identity-mgmt-actions">
                            <button type="button" class="action-btn action-btn--secondary"
                                    :disabled="!publisherAssociationPublisherId.trim() || !publisherAssociationPublicationKey"
                                    @click="recordPublisherAssociation">
                                {{ t('publications.addPublication') }}
                            </button>
                        </div>
                        <p v-if="publisherAssociationError" class="identity-unlock-error">{{ publisherAssociationError }}</p>
                    </template>

                    <span class="evidence-inspection-adapter-title">{{ t('publications.recordedAssociations') }}</span>
                    <p v-if="publisherPublicationAssociationRecordHistoryView().count === 0" class="form-hint form-hint--neutral">
                        {{ t('publications.noAssociationsRecordedYet') }}
                    </p>
                    <ul v-else class="replica-knowledge-claim-list">
                        <li v-for="(associationRow, associationIndex) in publisherPublicationAssociationRecordHistoryView().records" :key="associationIndex" class="replica-knowledge-claim">
                            <span class="peer-badge peer-badge--pending">
                                {{ associationRow.publisherIdentity.publisherId }} —
                                {{ associationRow.publicationIdentity.blockchain }}:{{ shortId(associationRow.publicationIdentity.chainReference) }}
                            </span>
                            <p class="form-hint form-hint--neutral">
                                {{ t('publications.contentHashRecorded', { contentHash: associationRow.publicationIdentity.contentHash, createdAt: formatWhen(associationRow.createdAt) }) }}
                            </p>
                        </li>
                    </ul>

                    <span class="evidence-inspection-adapter-title">{{ t('publications.aPublisherSAssociatedPublications') }}</span>
                    <p v-if="distinctPublisherIdentifiersView().length === 0" class="form-hint form-hint--neutral">
                        {{ t('publications.noPublisherHasBeenAssociated') }}
                    </p>
                    <label v-else class="form-field">
                        <span class="form-label">{{ t('publications.publisher') }}</span>
                        <select v-model="publisherAssociationSelectedPublisherId" class="form-input">
                            <option value="" disabled>{{ t('publications.chooseAPublisher') }}</option>
                            <option v-for="publisherId in distinctPublisherIdentifiersView()" :key="'view-' + publisherId" :value="publisherId">
                                {{ publisherId }}
                            </option>
                        </select>
                    </label>

                    <template v-if="publisherAssociationSelectedPublisherId">
                        <dl class="evidence-fields">
                            <div class="evidence-field"><dt>{{ t('publications.publisher') }}</dt><dd>{{ publisherAssociationProfileView().publisherIdentity.publisherId }}</dd></div>
                            <div class="evidence-field"><dt>{{ t('publications.associatedPublications') }}</dt><dd>{{ publisherAssociationProfileView().associationCount }}</dd></div>
                        </dl>
                        <p v-if="publisherAssociationProfileView().associationCount === 0" class="form-hint form-hint--neutral">
                            {{ t('publications.thisPublisherHasNotBeen') }}
                        </p>
                        <ul v-else class="replica-knowledge-claim-list">
                            <li v-for="(association, associationIndex) in publisherAssociationProfileView().associations" :key="associationIndex" class="replica-knowledge-claim">
                                <span class="peer-badge peer-badge--pending">
                                    {{ association.publicationIdentity.blockchain }} — {{ shortId(association.publicationIdentity.chainReference) }}
                                </span>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.contentHashAssociated', { contentHash: association.publicationIdentity.contentHash, createdAt: formatWhen(association.createdAt) }) }}
                                </p>
                            </li>
                        </ul>
                        <p class="form-hint form-hint--neutral">
                            {{ t('publications.thisIsAnExplicitClaim') }}
                        </p>
                    </template>
                </div>
            </div>

            <!-- Publisher achievement profile, badges and statistics live on
                 ui/views/LeaderboardHubView.js. -->
            </div>`;
