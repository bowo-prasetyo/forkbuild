// Publications page template: a publication card's Placements details tab.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const placementsTabTemplate = `<div v-show="entry.detailsTab === 'placements'">
                    <!-- Placements answer "where can I retrieve this", anchors
                         "did something record this"; kept as separate lists. -->
                    <div v-if="entry.placementsView" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">{{ t('publications.snapshotPlacements2') }}</span>
                            <span class="form-hint form-hint--neutral">{{ describeKnownPlacementCount(entry.placementsView) }}</span>
                            <button v-if="entry.placementsView.count > 0" class="action-btn action-btn--secondary" @click="togglePlacements(entry)">
                                {{ entry.placementsExpanded ? t('publications.hidePlacements') : t('publications.showPlacements') }}
                            </button>
                        </div>

                        <!-- Resolves the saved Content preference on every
                             click; the per-storage buttons stay unchanged. -->
                        <div v-if="preferredPlacementCreationCoordinator" class="evidence-discovery">
                            <div class="evidence-discovery-header">
                                <button class="action-btn action-btn--secondary"
                                        :disabled="preferredPlacementCreationView(entry).state === 'creating'"
                                        @click="createPreferredPlacement(entry)">
                                    {{ displayText(preferredPlacementCreationButtonLabel(entry)) }}
                                </button>
                                <span v-if="preferredPlacementCreationView(entry).label" class="peer-badge" :class="preferredPlacementCreationBadgeClass(entry)">
                                    {{ displayText(preferredPlacementCreationView(entry).label) }}
                                </span>
                            </div>
                            <p v-if="preferredPlacementCreationView(entry).message" class="form-hint form-hint--neutral">
                                {{ displayText(preferredPlacementCreationView(entry).message) }}
                            </p>
                            <p v-if="preferredPlacementCreationView(entry).reason" class="form-hint form-hint--neutral">
                                {{ displayText(preferredPlacementCreationView(entry).reason) }}
                            </p>
                            <dl v-if="preferredPlacementCreationView(entry).placement" class="evidence-fields">
                                <div class="evidence-field"><dt>{{ t('publications.locator3') }}</dt><dd>{{ preferredPlacementCreationView(entry).placement.locator }}</dd></div>
                                <div class="evidence-field"><dt>{{ t('publications.contentHash7') }}</dt><dd>{{ preferredPlacementCreationView(entry).placement.contentHash }}</dd></div>
                            </dl>
                        </div>

                        <!-- Groups are ordered by contentHash, never by size. -->
                        <div v-if="entry.placementsExpanded && entry.placementConvergenceView && entry.placementConvergenceView.placementCount > 1"
                             class="evidence-convergence">
                            <span class="evidence-convergence-title">{{ t('publications.placementRelationships') }}</span>
                            <p class="form-hint form-hint--neutral">
                                {{ t('publications.knownPlacementsPlural', { count: entry.placementConvergenceView.placementCount }) }}
                                · {{ t('publications.storageBackends', { count: entry.placementConvergenceView.storageTypeCount }) }}
                                · {{ t('publications.distinctLocations', { count: entry.placementConvergenceView.locatorCount }) }}
                            </p>
                            <div class="evidence-convergence-groups">
                                <div v-for="group in entry.placementConvergenceView.contentGroups" :key="group.contentHash"
                                     class="evidence-convergence-group">
                                    <span class="evidence-convergence-hash">{{ shortHash(group.contentHash) }}</span>
                                    <span class="form-hint form-hint--neutral">
                                        {{ t('publications.placementCount', { count: group.placementCount }) }}
                                    </span>
                                </div>
                            </div>
                            <p class="form-hint form-hint--neutral">{{ t('publications.contentBindingValue', { relationship: describeClaimRelationship(entry.placementConvergenceView.relationship, entry.placementConvergenceView.placementCount) }) }}</p>
                            <p v-if="entry.placementConvergenceView.hasConflict" class="evidence-convergence-conflict">
                                ⚠ {{ displayText(entry.placementConvergenceView.conflictDescription) }}
                            </p>
                        </div>

                        <div v-if="entry.placementsExpanded && entry.placementsView.count > 0" class="evidence-list">
                            <div v-for="placementView in entry.placementsView.placements" :key="placementView.placementId" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ humanizeStorageType(placementView.storage) }}</span>
                                    <span class="peer-badge" :class="placementBadgeClass(placementView)">{{ displayText(placementView.resolutionLabel) }}</span>
                                </div>
                                <p v-if="placementView.resolutionReason" class="form-hint form-hint--neutral">
                                    {{ displayText(placementView.resolutionReason) }}
                                </p>
                                <p v-if="placementLifecycleNote(entry, placementView)" class="form-hint form-hint--neutral">
                                    {{ displayText(placementLifecycleNote(entry, placementView)) }}
                                </p>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>{{ t('publications.locator3') }}</dt><dd>{{ placementView.locator }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.placed') }}</dt><dd>{{ formatWhen(placementView.placedAt) }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.publication4') }}</dt><dd>{{ placementView.publicationId }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.contentHash7') }}</dt><dd>{{ placementView.contentHash }}</dd></div>
                                    <div v-if="placementView.placerIdentityId" class="evidence-field">
                                        <dt>{{ t('publications.placedBy') }}</dt><dd>{{ shortId(placementView.placerIdentityId) }}</dd>
                                    </div>
                                </dl>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--secondary" @click="togglePlacementInspect(entry, placementView)">
                                        {{ placementInspectionExpanded(entry, placementView) ? t('publications.hideDetails') : t('publications.inspectPlacement') }}
                                    </button>
                                    <button class="action-btn action-btn--secondary" :disabled="placementView.checking"
                                            @click="resolvePlacement(entry, placementView)">
                                        {{ placementView.checking ? t('publications.resolving') : (placementView.resolved ? t('publications.resolveAgain') : t('publications.resolveSnapshot')) }}
                                    </button>
                                    <!-- Resolves and, on success, stores the
                                         bytes locally; explicit click only. -->
                                    <button v-if="snapshotPlacementMaterializationCoordinator" class="action-btn action-btn--primary"
                                            :disabled="placementMaterializationView(entry, placementView).materializing"
                                            @click="materializePlacement(entry, placementView)">
                                        {{ displayText(placementMaterializationButtonLabel(entry, placementView)) }}
                                    </button>
                                </div>
                                <div v-if="snapshotPlacementMaterializationCoordinator && placementMaterializationView(entry, placementView).label"
                                     class="evidence-discovery-header">
                                    <span class="peer-badge" :class="placementMaterializationBadgeClass(entry, placementView)">
                                        {{ displayText(placementMaterializationView(entry, placementView).label) }}
                                    </span>
                                </div>
                                <p v-if="snapshotPlacementMaterializationCoordinator && placementMaterializationView(entry, placementView).message"
                                   class="form-hint form-hint--neutral">
                                    {{ displayText(placementMaterializationView(entry, placementView).message) }}
                                </p>

                                <!-- Local read; inspecting and resolving stay
                                     separate actions. -->
                                <div v-if="placementInspectionExpanded(entry, placementView) && placementInspectionDetail(entry, placementView)"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">{{ t('publications.snapshotPlacement') }}</span>
                                    <p class="form-hint form-hint--neutral">{{ displayText(placementInspectionDetail(entry, placementView).bindingDescription) }}</p>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field">
                                            <dt>{{ displayText(placementInspectionDetail(entry, placementView).placedAtLabel) }}</dt>
                                            <dd>{{ formatWhen(placementInspectionDetail(entry, placementView).placedAt) }}</dd>
                                        </div>
                                        <div class="evidence-field"><dt>{{ t('publications.locator3') }}</dt><dd>{{ displayText(placementInspectionDetail(entry, placementView).locator) }}</dd></div>
                                    </dl>

                                    <div v-if="placementInspectionTypeSpecific(entry, placementView)" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">{{ displayText(placementInspectionTypeSpecific(entry, placementView).summary) }}</span>
                                        <dl class="evidence-fields">
                                            <div v-for="field in placementInspectionTypeSpecific(entry, placementView).fields" :key="field.label" class="evidence-field">
                                                <dt>{{ displayText(field.label) }}</dt><dd>{{ field.value }}</dd>
                                            </div>
                                        </dl>
                                        <a v-if="placementInspectionTypeSpecific(entry, placementView).externalLocator"
                                           class="action-btn action-btn--secondary"
                                           :href="placementInspectionTypeSpecific(entry, placementView).externalLocator.url"
                                           target="_blank" rel="noopener noreferrer">
                                            {{ displayText(placementInspectionTypeSpecific(entry, placementView).externalLocator.label) }}
                                        </a>
                                    </div>

                                    <!-- How this replica learned the claim;
                                         never names a peer or reads as a trust
                                         signal. -->
                                    <div v-if="placementInspectionKnowledge(entry, placementView) && placementInspectionKnowledge(entry, placementView).known"
                                         class="evidence-inspection-knowledge">
                                        <span class="evidence-inspection-title">{{ t('publications.localKnowledge2') }}</span>
                                        <dl class="evidence-fields">
                                            <div class="evidence-field">
                                                <dt>{{ t('publications.acquisition3') }}</dt>
                                                <dd>{{ placementInspectionKnowledge(entry, placementView).acquisitionLabel }}</dd>
                                            </div>
                                            <div class="evidence-field">
                                                <dt>{{ placementInspectionKnowledge(entry, placementView).firstSeenAtLabel }}</dt>
                                                <dd>{{ formatWhen(placementInspectionKnowledge(entry, placementView).firstSeenAt) }}</dd>
                                            </div>
                                        </dl>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Remote IPFS publishing is not a placement: nothing here
                         catalogs or signs a placement claim. Shows the most
                         recent attempt only. -->
                    <div v-if="ipfsRemotePublicationCoordinator && publicationContentStore" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">{{ t('publications.ipfsPublishing') }}</span>
                            <span class="form-hint form-hint--neutral">
                                {{ t('publications.localKuboCanResolveAnd') }}
                            </span>
                        </div>

                        <div class="evidence-anchor-card">
                            <div class="evidence-anchor-header">
                                <span class="evidence-anchor-type">{{ t('publications.remotePinning') }}</span>
                            </div>
                            <dl class="evidence-fields">
                                <div class="evidence-field"><dt>{{ t('publications.endpoint') }}</dt><dd>{{ ipfsRemotePublishingConfigurationView(entry).endpoint || t('publications.notConfigured') }}</dd></div>
                                <div class="evidence-field"><dt>{{ t('publications.credential') }}</dt><dd>{{ ipfsRemotePublishingConfigurationView(entry).hasCredential ? 'configured' : t('publications.notConfigured') }}</dd></div>
                            </dl>

                            <div class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary"
                                        @click="toggleIpfsRemotePublishingConfigureForm(entry)">
                                    {{ entry.ipfsRemotePublishingConfigureFormOpen ? t('publications.cancel3') : (ipfsRemotePublishingConfigurationView(entry).configured ? t('publications.reconfigureRemotePublishing') : t('publications.configureRemotePublishing')) }}
                                </button>
                                <button v-if="ipfsRemotePublishingConfigurationView(entry).configured" type="button" class="action-btn action-btn--secondary"
                                        @click="clearIpfsRemotePublishingConfiguration(entry)">
                                    {{ t('publications.clearConfiguration') }}
                                </button>
                            </div>

                            <!-- Draft fields, kept in memory only until "Save
                                 Configuration". -->
                            <div v-if="entry.ipfsRemotePublishingConfigureFormOpen" class="evidence-inspection-adapter">
                                <label class="form-field">
                                    <span class="form-label">{{ t('publications.endpoint') }}</span>
                                    <input type="text" class="form-input" v-model="entry.ipfsRemotePublishingDraft.endpoint"
                                           placeholder="https://your-pinning-service.example/api/pin" />
                                </label>
                                <label class="form-field">
                                    <span class="form-label">{{ t('publications.credentialOptional') }}</span>
                                    <input type="password" class="form-input" v-model="entry.ipfsRemotePublishingDraft.credential"
                                           :placeholder="t('publications.bearerToken')" />
                                </label>
                                <label class="form-field">
                                    <span class="form-label">{{ t('publications.requestFieldOptional') }}</span>
                                    <input type="text" class="form-input" v-model="entry.ipfsRemotePublishingDraft.requestField" placeholder="file" />
                                </label>
                                <label class="form-field">
                                    <span class="form-label">{{ t('publications.responseFieldOptional') }}</span>
                                    <input type="text" class="form-input" v-model="entry.ipfsRemotePublishingDraft.responseField" placeholder="cid" />
                                </label>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.nothingHereIsSavedAnywhere') }}
                                </p>
                                <button type="button" class="action-btn action-btn--primary" @click="saveIpfsRemotePublishingConfiguration(entry)">
                                    {{ t('publications.saveConfiguration') }}
                                </button>
                            </div>

                            <div v-if="ipfsRemotePublishingConfigurationView(entry).configured" class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--primary"
                                        :disabled="isIpfsRemotePublishing(entry)"
                                        @click="publishToRemoteIpfs(entry)">
                                    {{ isIpfsRemotePublishing(entry) ? t('publications.publishing') : (ipfsRemotePublicationView(entry).state === IpfsRemotePublicationState.IDLE ? t('publications.publishToRemoteIpfs') : t('publications.publishAgain')) }}
                                </button>
                            </div>

                            <!-- PUBLISHED only means the provider accepted the
                                 bytes and returned this locator. -->
                            <div v-if="ipfsRemotePublicationView(entry).state !== IpfsRemotePublicationState.IDLE" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">{{ t('publications.remoteIpfs') }}</span>
                                <span class="peer-badge" :class="ipfsRemotePublicationBadgeClass(entry)">{{ displayText(ipfsRemotePublicationView(entry).stateLabel) }}</span>
                                <p v-if="ipfsRemotePublicationView(entry).reason" class="form-hint form-hint--neutral">
                                    {{ displayText(ipfsRemotePublicationView(entry).reason) }}
                                </p>

                                <template v-if="ipfsRemotePublicationView(entry).state === IpfsRemotePublicationState.PUBLISHED">
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dt>{{ t('publications.contentHash7') }}</dt><dd>{{ ipfsRemotePublicationView(entry).contentHash }}</dd></div>
                                        <div class="evidence-field"><dt>{{ t('publications.ipfsLocator') }}</dt><dd>{{ ipfsRemotePublicationView(entry).locator }}</dd></div>
                                        <div class="evidence-field"><dt>{{ t('publications.provider') }}</dt><dd>{{ ipfsRemotePublicationView(entry).endpoint }}</dd></div>
                                        <div class="evidence-field"><dt>{{ t('publications.publishedAt') }}</dt><dd>{{ formatWhen(ipfsRemotePublicationView(entry).publishedAt) }}</dd></div>
                                    </dl>
                                    <p class="form-hint form-hint--neutral">
                                        {{ t('publications.theConfiguredProviderAcceptedThese') }}
                                    </p>
                                    <!-- A missing announcement is not a failed
                                         publish; the content is on IPFS either
                                         way. -->
                                    <p v-if="entry.ipfsRemoteSnapshotAnnouncement" class="form-hint form-hint--neutral">
                                        <span class="peer-badge" :class="entry.ipfsRemoteSnapshotAnnouncement.announced ? 'peer-badge--authenticated' : 'peer-badge--failed'">
                                            {{ humanizeDiscoveryProvider(entry.ipfsRemoteSnapshotAnnouncement.discoveryProvider) }}: {{ entry.ipfsRemoteSnapshotAnnouncement.announced ? t('publications.announced') : t('publications.notAnnounced') }}
                                        </span>
                                        <template v-if="entry.ipfsRemoteSnapshotAnnouncement.error"> — {{ entry.ipfsRemoteSnapshotAnnouncement.error }}</template>
                                    </p>
                                </template>
                            </div>

                            <!-- Publishing is an action, verification an
                                 observation: PUBLISHED next to UNAVAILABLE or
                                 HASH_MISMATCH is shown as is. -->
                            <div v-if="ipfsPublicationContentVerificationCoordinator && entry.ipfsPublicationRecord" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">{{ t('publications.contentRetrieval') }}</span>
                                <div class="identity-mgmt-actions">
                                    <button type="button" class="action-btn action-btn--primary"
                                            :disabled="isVerifyingIpfsPublicationContent(entry)"
                                            @click="verifyIpfsPublicationContent(entry)">
                                        {{ displayText(ipfsPublicationContentVerifyButtonLabel(entry)) }}
                                    </button>
                                </div>
                                <template v-if="entry.ipfsPublicationContentVerification">
                                    <span class="peer-badge" :class="ipfsPublicationContentVerificationBadgeClass(entry)">
                                        {{ displayText(ipfsPublicationContentVerificationView(entry).stateLabel) }}
                                    </span>
                                    <p v-if="ipfsPublicationContentVerificationView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ displayText(ipfsPublicationContentVerificationView(entry).reason) }}
                                    </p>
                                    <p v-if="ipfsPublicationContentVerificationView(entry).observedAt" class="form-hint form-hint--neutral">
                                        {{ t('publications.observedWhen', { when: formatWhen(ipfsPublicationContentVerificationView(entry).observedAt) }) }}
                                    </p>
                                </template>
                            </div>

                            <!-- Every published record, append-only. -->
                            <div v-if="ipfsPublicationRecordHistoryView(entry).count > 0" class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary"
                                        @click="toggleIpfsPublicationRecordHistory(entry)">
                                    {{ entry.ipfsPublicationRecordHistoryExpanded ? t('publications.hidePublicationHistory') : t('publications.showPublicationHistory') }}
                                </button>
                            </div>
                            <div v-if="entry.ipfsPublicationRecordHistoryExpanded" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">{{ t('publications.publicationHistory') }}</span>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="(item, index) in ipfsPublicationRecordHistoryView(entry).records" :key="index" class="replica-knowledge-claim">
                                        <button class="action-btn action-btn--secondary"
                                                @click="toggleIpfsPublicationRecordInspection(entry, index)">
                                            {{ formatWhen(item.publishedAt) }} — {{ item.locator }}
                                        </button>

                                        <dl v-if="isIpfsPublicationRecordInspectionExpanded(entry, index)" class="evidence-fields">
                                            <div class="evidence-field"><dt>{{ t('publications.locator3') }}</dt><dd>{{ item.locator }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.contentHash7') }}</dt><dd>{{ item.contentHash }}</dd></div>
                                            <div class="evidence-field"><dt>{{ t('publications.publishedAt') }}</dt><dd>{{ formatWhen(item.publishedAt) }}</dd></div>
                                            <div v-if="item.publicationMethodLabel" class="evidence-field"><dt>{{ t('publications.method') }}</dt><dd>{{ displayText(item.publicationMethodLabel) }}</dd></div>
                                        </dl>

                                        <!-- This record's own append-only
                                             verification history. -->
                                        <div v-if="ipfsPublicationContentVerificationCoordinator" class="evidence-inspection-adapter">
                                            <span class="evidence-inspection-adapter-title">{{ t('publications.contentRetrieval') }}</span>
                                            <span v-if="ipfsPublicationRecordVerificationHistoryView(entry, index).count > 0"
                                                  class="peer-badge" :class="ipfsPublicationRecordVerificationBadgeClass(entry, index)">
                                                {{ t('publications.latest', { state: latestIpfsPublicationRecordVerificationView(entry, index).stateLabel }) }}
                                            </span>

                                            <div class="identity-mgmt-actions">
                                                <button type="button" class="action-btn action-btn--primary"
                                                        :disabled="isVerifyingIpfsPublicationRecordHistoryEntry(entry, index)"
                                                        @click="verifyIpfsPublicationRecordHistoryEntry(entry, index)">
                                                    {{ displayText(ipfsPublicationRecordVerifyButtonLabel(entry, index)) }}
                                                </button>
                                            </div>

                                            <!-- Opening this only reads memory;
                                                 it never verifies. -->
                                            <div v-if="ipfsPublicationRecordVerificationHistoryView(entry, index).count > 0" class="identity-mgmt-actions">
                                                <button type="button" class="action-btn action-btn--secondary"
                                                        @click="toggleIpfsPublicationRecordVerificationHistory(entry, index)">
                                                    {{ isIpfsPublicationRecordVerificationHistoryExpanded(entry, index) ? t('publications.hideVerificationHistory') : t('publications.showVerificationHistory') }}
                                                </button>
                                            </div>
                                            <div v-if="isIpfsPublicationRecordVerificationHistoryExpanded(entry, index)">
                                                <p class="form-hint form-hint--neutral">
                                                    {{ t('publications.theseAreObservationsMadeAt') }}
                                                </p>
                                                <ul class="replica-knowledge-claim-list">
                                                    <li v-for="(verification, vIndex) in ipfsPublicationRecordVerificationHistoryView(entry, index).verifications"
                                                        :key="vIndex" class="replica-knowledge-claim">
                                                        <span class="peer-badge" :class="ipfsPublicationVerificationEntryBadgeClass(verification)">
                                                            {{ formatWhen(verification.observedAt) }} — {{ displayText(verification.stateLabel) }}
                                                        </span>
                                                        <p v-if="verification.reason" class="form-hint form-hint--neutral">
                                                            {{ displayText(verification.reason) }}
                                                        </p>
                                                    </li>
                                                </ul>
                                            </div>
                                        </div>
                                    </li>
                                </ul>
                            </div>

                            <!-- Chronological read of the publication and
                                 verification histories; no network access. -->
                            <div v-if="ipfsPublicationObservationTimelineView(entry).count > 0" class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary"
                                        @click="toggleIpfsPublicationObservationTimeline(entry)">
                                    {{ entry.ipfsPublicationObservationTimelineExpanded ? t('publications.hideTimeline') : t('publications.showTimeline') }}
                                </button>
                            </div>
                            <div v-if="entry.ipfsPublicationObservationTimelineExpanded" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">{{ t('publications.observationTimeline') }}</span>
                                <p class="form-hint form-hint--neutral">
                                    {{ t('publications.everyPublicationAndEveryContent') }}
                                </p>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="(item, tIndex) in ipfsPublicationObservationTimelineView(entry).entries"
                                        :key="tIndex" class="replica-knowledge-claim">
                                        <span class="peer-badge" :class="ipfsPublicationObservationTimelineEntryBadgeClass(item)">
                                            {{ formatWhen(item.observedAt) }} — {{ item.kind === IpfsPublicationObservationTimelineEntryKind.PUBLICATION ? t('publications.published') : item.stateLabel }}
                                        </span>
                                        <p class="form-hint form-hint--neutral">{{ displayText(item.label) }} — {{ item.locator }}</p>
                                        <p v-if="item.kind === IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION && item.reason" class="form-hint form-hint--neutral">
                                            {{ displayText(item.reason) }}
                                        </p>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    </div>`;
