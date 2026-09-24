// Publications page template: a publication card's Placements details tab.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const placementsTabTemplate = `<div v-show="entry.detailsTab === 'placements'">
                    <!-- Placements answer "where can I retrieve this", anchors
                         "did something record this"; kept as separate lists. -->
                    <div v-if="entry.placementsView" class="evidence-section">
                        <div class="evidence-summary">
                            <span class="evidence-summary-title">Snapshot Placements</span>
                            <span class="form-hint form-hint--neutral">{{ describeKnownPlacementCount(entry.placementsView) }}</span>
                            <button v-if="entry.placementsView.count > 0" class="action-btn action-btn--secondary" @click="togglePlacements(entry)">
                                {{ entry.placementsExpanded ? 'Hide Placements' : 'Show Placements' }}
                            </button>
                        </div>

                        <!-- Resolves the saved Content preference on every
                             click; the per-storage buttons stay unchanged. -->
                        <div v-if="preferredPlacementCreationCoordinator" class="evidence-discovery">
                            <div class="evidence-discovery-header">
                                <button class="action-btn action-btn--secondary"
                                        :disabled="preferredPlacementCreationView(entry).state === 'creating'"
                                        @click="createPreferredPlacement(entry)">
                                    {{ preferredPlacementCreationButtonLabel(entry) }}
                                </button>
                                <span v-if="preferredPlacementCreationView(entry).label" class="peer-badge" :class="preferredPlacementCreationBadgeClass(entry)">
                                    {{ preferredPlacementCreationView(entry).label }}
                                </span>
                            </div>
                            <p v-if="preferredPlacementCreationView(entry).message" class="form-hint form-hint--neutral">
                                {{ preferredPlacementCreationView(entry).message }}
                            </p>
                            <p v-if="preferredPlacementCreationView(entry).reason" class="form-hint form-hint--neutral">
                                {{ preferredPlacementCreationView(entry).reason }}
                            </p>
                            <dl v-if="preferredPlacementCreationView(entry).placement" class="evidence-fields">
                                <div class="evidence-field"><dt>Locator</dt><dd>{{ preferredPlacementCreationView(entry).placement.locator }}</dd></div>
                                <div class="evidence-field"><dt>Content hash</dt><dd>{{ preferredPlacementCreationView(entry).placement.contentHash }}</dd></div>
                            </dl>
                        </div>

                        <!-- Groups are ordered by contentHash, never by size. -->
                        <div v-if="entry.placementsExpanded && entry.placementConvergenceView && entry.placementConvergenceView.placementCount > 1"
                             class="evidence-convergence">
                            <span class="evidence-convergence-title">Placement relationships</span>
                            <p class="form-hint form-hint--neutral">
                                {{ entry.placementConvergenceView.placementCount }} known placements
                                · {{ entry.placementConvergenceView.storageTypeCount }} storage backend{{ entry.placementConvergenceView.storageTypeCount === 1 ? '' : 's' }}
                                · {{ entry.placementConvergenceView.locatorCount }} distinct location{{ entry.placementConvergenceView.locatorCount === 1 ? '' : 's' }}
                            </p>
                            <div class="evidence-convergence-groups">
                                <div v-for="group in entry.placementConvergenceView.contentGroups" :key="group.contentHash"
                                     class="evidence-convergence-group">
                                    <span class="evidence-convergence-hash">{{ shortHash(group.contentHash) }}</span>
                                    <span class="form-hint form-hint--neutral">
                                        {{ group.placementCount }} placement{{ group.placementCount === 1 ? '' : 's' }}
                                    </span>
                                </div>
                            </div>
                            <p class="form-hint form-hint--neutral">Content binding: {{ entry.placementConvergenceView.relationship === 'conflict' ? 'CONFLICT' : 'AGREEMENT' }}</p>
                            <p v-if="entry.placementConvergenceView.hasConflict" class="evidence-convergence-conflict">
                                ⚠ {{ entry.placementConvergenceView.conflictDescription }}
                            </p>
                        </div>

                        <div v-if="entry.placementsExpanded && entry.placementsView.count > 0" class="evidence-list">
                            <div v-for="placementView in entry.placementsView.placements" :key="placementView.placementId" class="evidence-anchor-card">
                                <div class="evidence-anchor-header">
                                    <span class="evidence-anchor-type">{{ humanizeStorageType(placementView.storage) }}</span>
                                    <span class="peer-badge" :class="placementBadgeClass(placementView)">{{ placementView.resolutionLabel }}</span>
                                </div>
                                <p v-if="placementView.resolutionReason" class="form-hint form-hint--neutral">
                                    {{ placementView.resolutionReason }}
                                </p>
                                <p v-if="placementLifecycleNote(entry, placementView)" class="form-hint form-hint--neutral">
                                    {{ placementLifecycleNote(entry, placementView) }}
                                </p>
                                <dl class="evidence-fields">
                                    <div class="evidence-field"><dt>Locator</dt><dd>{{ placementView.locator }}</dd></div>
                                    <div class="evidence-field"><dt>Placed</dt><dd>{{ formatWhen(placementView.placedAt) }}</dd></div>
                                    <div class="evidence-field"><dt>Publication</dt><dd>{{ placementView.publicationId }}</dd></div>
                                    <div class="evidence-field"><dt>Content hash</dt><dd>{{ placementView.contentHash }}</dd></div>
                                    <div v-if="placementView.placerIdentityId" class="evidence-field">
                                        <dt>Placed by</dt><dd>{{ shortId(placementView.placerIdentityId) }}</dd>
                                    </div>
                                </dl>
                                <div class="identity-mgmt-actions">
                                    <button class="action-btn action-btn--secondary" @click="togglePlacementInspect(entry, placementView)">
                                        {{ placementInspectionExpanded(entry, placementView) ? 'Hide Details' : 'Inspect Placement' }}
                                    </button>
                                    <button class="action-btn action-btn--secondary" :disabled="placementView.checking"
                                            @click="resolvePlacement(entry, placementView)">
                                        {{ placementView.checking ? 'Resolving…' : (placementView.resolved ? 'Resolve Again' : 'Resolve Snapshot') }}
                                    </button>
                                    <!-- Resolves and, on success, stores the
                                         bytes locally; explicit click only. -->
                                    <button v-if="snapshotPlacementMaterializationCoordinator" class="action-btn action-btn--primary"
                                            :disabled="placementMaterializationView(entry, placementView).materializing"
                                            @click="materializePlacement(entry, placementView)">
                                        {{ placementMaterializationButtonLabel(entry, placementView) }}
                                    </button>
                                </div>
                                <div v-if="snapshotPlacementMaterializationCoordinator && placementMaterializationView(entry, placementView).label"
                                     class="evidence-discovery-header">
                                    <span class="peer-badge" :class="placementMaterializationBadgeClass(entry, placementView)">
                                        {{ placementMaterializationView(entry, placementView).label }}
                                    </span>
                                </div>
                                <p v-if="snapshotPlacementMaterializationCoordinator && placementMaterializationView(entry, placementView).message"
                                   class="form-hint form-hint--neutral">
                                    {{ placementMaterializationView(entry, placementView).message }}
                                </p>

                                <!-- Local read; inspecting and resolving stay
                                     separate actions. -->
                                <div v-if="placementInspectionExpanded(entry, placementView) && placementInspectionDetail(entry, placementView)"
                                     class="evidence-inspection">
                                    <span class="evidence-inspection-title">Snapshot Placement</span>
                                    <p class="form-hint form-hint--neutral">{{ placementInspectionDetail(entry, placementView).bindingDescription }}</p>
                                    <dl class="evidence-fields">
                                        <div class="evidence-field">
                                            <dt>{{ placementInspectionDetail(entry, placementView).placedAtLabel }}</dt>
                                            <dd>{{ formatWhen(placementInspectionDetail(entry, placementView).placedAt) }}</dd>
                                        </div>
                                        <div class="evidence-field"><dt>Locator</dt><dd>{{ placementInspectionDetail(entry, placementView).locator }}</dd></div>
                                    </dl>

                                    <div v-if="placementInspectionTypeSpecific(entry, placementView)" class="evidence-inspection-adapter">
                                        <span class="evidence-inspection-adapter-title">{{ placementInspectionTypeSpecific(entry, placementView).summary }}</span>
                                        <dl class="evidence-fields">
                                            <div v-for="field in placementInspectionTypeSpecific(entry, placementView).fields" :key="field.label" class="evidence-field">
                                                <dt>{{ field.label }}</dt><dd>{{ field.value }}</dd>
                                            </div>
                                        </dl>
                                        <a v-if="placementInspectionTypeSpecific(entry, placementView).externalLocator"
                                           class="action-btn action-btn--secondary"
                                           :href="placementInspectionTypeSpecific(entry, placementView).externalLocator.url"
                                           target="_blank" rel="noopener noreferrer">
                                            {{ placementInspectionTypeSpecific(entry, placementView).externalLocator.label }}
                                        </a>
                                    </div>

                                    <!-- How this replica learned the claim;
                                         never names a peer or reads as a trust
                                         signal. -->
                                    <div v-if="placementInspectionKnowledge(entry, placementView) && placementInspectionKnowledge(entry, placementView).known"
                                         class="evidence-inspection-knowledge">
                                        <span class="evidence-inspection-title">Local Knowledge</span>
                                        <dl class="evidence-fields">
                                            <div class="evidence-field">
                                                <dt>Acquisition</dt>
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
                            <span class="evidence-summary-title">IPFS Publishing</span>
                            <span class="form-hint form-hint--neutral">
                                Local Kubo can resolve and publish. A remote gateway can only resolve. Remote
                                pinning, configured below, can only publish.
                            </span>
                        </div>

                        <div class="evidence-anchor-card">
                            <div class="evidence-anchor-header">
                                <span class="evidence-anchor-type">Remote pinning</span>
                            </div>
                            <dl class="evidence-fields">
                                <div class="evidence-field"><dt>Endpoint</dt><dd>{{ ipfsRemotePublishingConfigurationView(entry).endpoint || 'not configured' }}</dd></div>
                                <div class="evidence-field"><dt>Credential</dt><dd>{{ ipfsRemotePublishingConfigurationView(entry).hasCredential ? 'configured' : 'not configured' }}</dd></div>
                            </dl>

                            <div class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary"
                                        @click="toggleIpfsRemotePublishingConfigureForm(entry)">
                                    {{ entry.ipfsRemotePublishingConfigureFormOpen ? 'Cancel' : (ipfsRemotePublishingConfigurationView(entry).configured ? 'Reconfigure Remote Publishing' : 'Configure Remote Publishing') }}
                                </button>
                                <button v-if="ipfsRemotePublishingConfigurationView(entry).configured" type="button" class="action-btn action-btn--secondary"
                                        @click="clearIpfsRemotePublishingConfiguration(entry)">
                                    Clear Configuration
                                </button>
                            </div>

                            <!-- Draft fields, kept in memory only until "Save
                                 Configuration". -->
                            <div v-if="entry.ipfsRemotePublishingConfigureFormOpen" class="evidence-inspection-adapter">
                                <label class="form-field">
                                    <span class="form-label">Endpoint</span>
                                    <input type="text" class="form-input" v-model="entry.ipfsRemotePublishingDraft.endpoint"
                                           placeholder="https://your-pinning-service.example/api/pin" />
                                </label>
                                <label class="form-field">
                                    <span class="form-label">Credential (optional)</span>
                                    <input type="password" class="form-input" v-model="entry.ipfsRemotePublishingDraft.credential"
                                           placeholder="Bearer token" />
                                </label>
                                <label class="form-field">
                                    <span class="form-label">Request field (optional)</span>
                                    <input type="text" class="form-input" v-model="entry.ipfsRemotePublishingDraft.requestField" placeholder="file" />
                                </label>
                                <label class="form-field">
                                    <span class="form-label">Response field (optional)</span>
                                    <input type="text" class="form-input" v-model="entry.ipfsRemotePublishingDraft.responseField" placeholder="cid" />
                                </label>
                                <p class="form-hint form-hint--neutral">
                                    Nothing here is saved anywhere. This configuration lives only in this page's
                                    own memory for this browsing session, and is discarded the moment the page
                                    reloads or "Clear Configuration" is clicked.
                                </p>
                                <button type="button" class="action-btn action-btn--primary" @click="saveIpfsRemotePublishingConfiguration(entry)">
                                    Save Configuration
                                </button>
                            </div>

                            <div v-if="ipfsRemotePublishingConfigurationView(entry).configured" class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--primary"
                                        :disabled="isIpfsRemotePublishing(entry)"
                                        @click="publishToRemoteIpfs(entry)">
                                    {{ isIpfsRemotePublishing(entry) ? 'Publishing…' : (ipfsRemotePublicationView(entry).state === IpfsRemotePublicationState.IDLE ? 'Publish to Remote IPFS' : 'Publish Again') }}
                                </button>
                            </div>

                            <!-- PUBLISHED only means the provider accepted the
                                 bytes and returned this locator. -->
                            <div v-if="ipfsRemotePublicationView(entry).state !== IpfsRemotePublicationState.IDLE" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Remote IPFS</span>
                                <span class="peer-badge" :class="ipfsRemotePublicationBadgeClass(entry)">{{ ipfsRemotePublicationView(entry).stateLabel }}</span>
                                <p v-if="ipfsRemotePublicationView(entry).reason" class="form-hint form-hint--neutral">
                                    {{ ipfsRemotePublicationView(entry).reason }}
                                </p>

                                <template v-if="ipfsRemotePublicationView(entry).state === IpfsRemotePublicationState.PUBLISHED">
                                    <dl class="evidence-fields">
                                        <div class="evidence-field"><dt>Content hash</dt><dd>{{ ipfsRemotePublicationView(entry).contentHash }}</dd></div>
                                        <div class="evidence-field"><dt>IPFS locator</dt><dd>{{ ipfsRemotePublicationView(entry).locator }}</dd></div>
                                        <div class="evidence-field"><dt>Provider</dt><dd>{{ ipfsRemotePublicationView(entry).endpoint }}</dd></div>
                                        <div class="evidence-field"><dt>Published at</dt><dd>{{ formatWhen(ipfsRemotePublicationView(entry).publishedAt) }}</dd></div>
                                    </dl>
                                    <p class="form-hint form-hint--neutral">
                                        The configured provider accepted these bytes and returned this locator.
                                        This is an observation of what the provider just said, not a promise
                                        that it will still be retrievable later, and not a cataloged Snapshot
                                        Placement.
                                    </p>
                                    <!-- A missing announcement is not a failed
                                         publish; the content is on IPFS either
                                         way. -->
                                    <p v-if="entry.ipfsRemoteSnapshotAnnouncement" class="form-hint form-hint--neutral">
                                        <span class="peer-badge" :class="entry.ipfsRemoteSnapshotAnnouncement.announced ? 'peer-badge--authenticated' : 'peer-badge--failed'">
                                            {{ entry.ipfsRemoteSnapshotAnnouncement.announced ? 'Nostr: Announced' : 'Nostr: Not announced' }}
                                        </span>
                                        <template v-if="entry.ipfsRemoteSnapshotAnnouncement.error"> — {{ entry.ipfsRemoteSnapshotAnnouncement.error }}</template>
                                    </p>
                                </template>
                            </div>

                            <!-- Publishing is an action, verification an
                                 observation: PUBLISHED next to UNAVAILABLE or
                                 HASH_MISMATCH is shown as is. -->
                            <div v-if="ipfsPublicationContentVerificationCoordinator && entry.ipfsPublicationRecord" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Content retrieval</span>
                                <div class="identity-mgmt-actions">
                                    <button type="button" class="action-btn action-btn--primary"
                                            :disabled="isVerifyingIpfsPublicationContent(entry)"
                                            @click="verifyIpfsPublicationContent(entry)">
                                        {{ ipfsPublicationContentVerifyButtonLabel(entry) }}
                                    </button>
                                </div>
                                <template v-if="entry.ipfsPublicationContentVerification">
                                    <span class="peer-badge" :class="ipfsPublicationContentVerificationBadgeClass(entry)">
                                        {{ ipfsPublicationContentVerificationView(entry).stateLabel }}
                                    </span>
                                    <p v-if="ipfsPublicationContentVerificationView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ ipfsPublicationContentVerificationView(entry).reason }}
                                    </p>
                                    <p v-if="ipfsPublicationContentVerificationView(entry).observedAt" class="form-hint form-hint--neutral">
                                        Observed {{ formatWhen(ipfsPublicationContentVerificationView(entry).observedAt) }}
                                    </p>
                                </template>
                            </div>

                            <!-- Every published record, append-only. -->
                            <div v-if="ipfsPublicationRecordHistoryView(entry).count > 0" class="identity-mgmt-actions">
                                <button type="button" class="action-btn action-btn--secondary"
                                        @click="toggleIpfsPublicationRecordHistory(entry)">
                                    {{ entry.ipfsPublicationRecordHistoryExpanded ? 'Hide Publication History' : 'Show Publication History' }}
                                </button>
                            </div>
                            <div v-if="entry.ipfsPublicationRecordHistoryExpanded" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Publication History</span>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="(item, index) in ipfsPublicationRecordHistoryView(entry).records" :key="index" class="replica-knowledge-claim">
                                        <button class="action-btn action-btn--secondary"
                                                @click="toggleIpfsPublicationRecordInspection(entry, index)">
                                            {{ formatWhen(item.publishedAt) }} — {{ item.locator }}
                                        </button>

                                        <dl v-if="isIpfsPublicationRecordInspectionExpanded(entry, index)" class="evidence-fields">
                                            <div class="evidence-field"><dt>Locator</dt><dd>{{ item.locator }}</dd></div>
                                            <div class="evidence-field"><dt>Content hash</dt><dd>{{ item.contentHash }}</dd></div>
                                            <div class="evidence-field"><dt>Published at</dt><dd>{{ formatWhen(item.publishedAt) }}</dd></div>
                                            <div v-if="item.publicationMethodLabel" class="evidence-field"><dt>Method</dt><dd>{{ item.publicationMethodLabel }}</dd></div>
                                        </dl>

                                        <!-- This record's own append-only
                                             verification history. -->
                                        <div v-if="ipfsPublicationContentVerificationCoordinator" class="evidence-inspection-adapter">
                                            <span class="evidence-inspection-adapter-title">Content retrieval</span>
                                            <span v-if="ipfsPublicationRecordVerificationHistoryView(entry, index).count > 0"
                                                  class="peer-badge" :class="ipfsPublicationRecordVerificationBadgeClass(entry, index)">
                                                Latest: {{ latestIpfsPublicationRecordVerificationView(entry, index).stateLabel }}
                                            </span>

                                            <div class="identity-mgmt-actions">
                                                <button type="button" class="action-btn action-btn--primary"
                                                        :disabled="isVerifyingIpfsPublicationRecordHistoryEntry(entry, index)"
                                                        @click="verifyIpfsPublicationRecordHistoryEntry(entry, index)">
                                                    {{ ipfsPublicationRecordVerifyButtonLabel(entry, index) }}
                                                </button>
                                            </div>

                                            <!-- Opening this only reads memory;
                                                 it never verifies. -->
                                            <div v-if="ipfsPublicationRecordVerificationHistoryView(entry, index).count > 0" class="identity-mgmt-actions">
                                                <button type="button" class="action-btn action-btn--secondary"
                                                        @click="toggleIpfsPublicationRecordVerificationHistory(entry, index)">
                                                    {{ isIpfsPublicationRecordVerificationHistoryExpanded(entry, index) ? 'Hide Verification History' : 'Show Verification History' }}
                                                </button>
                                            </div>
                                            <div v-if="isIpfsPublicationRecordVerificationHistoryExpanded(entry, index)">
                                                <p class="form-hint form-hint--neutral">
                                                    These are observations made at different times. A
                                                    later observation never rewrites or replaces an
                                                    earlier one.
                                                </p>
                                                <ul class="replica-knowledge-claim-list">
                                                    <li v-for="(verification, vIndex) in ipfsPublicationRecordVerificationHistoryView(entry, index).verifications"
                                                        :key="vIndex" class="replica-knowledge-claim">
                                                        <span class="peer-badge" :class="ipfsPublicationVerificationEntryBadgeClass(verification)">
                                                            {{ formatWhen(verification.observedAt) }} — {{ verification.stateLabel }}
                                                        </span>
                                                        <p v-if="verification.reason" class="form-hint form-hint--neutral">
                                                            {{ verification.reason }}
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
                                    {{ entry.ipfsPublicationObservationTimelineExpanded ? 'Hide Timeline' : 'Show Timeline' }}
                                </button>
                            </div>
                            <div v-if="entry.ipfsPublicationObservationTimelineExpanded" class="evidence-inspection-adapter">
                                <span class="evidence-inspection-adapter-title">Observation Timeline</span>
                                <p class="form-hint form-hint--neutral">
                                    Every publication and every content-retrieval observation for
                                    this entry, in true chronological order — never a running
                                    status, and never evidence that one publication record is
                                    preferable to another.
                                </p>
                                <ul class="replica-knowledge-claim-list">
                                    <li v-for="(item, tIndex) in ipfsPublicationObservationTimelineView(entry).entries"
                                        :key="tIndex" class="replica-knowledge-claim">
                                        <span class="peer-badge" :class="ipfsPublicationObservationTimelineEntryBadgeClass(item)">
                                            {{ formatWhen(item.observedAt) }} — {{ item.kind === IpfsPublicationObservationTimelineEntryKind.PUBLICATION ? 'Published' : item.stateLabel }}
                                        </span>
                                        <p class="form-hint form-hint--neutral">{{ item.label }} — {{ item.locator }}</p>
                                        <p v-if="item.kind === IpfsPublicationObservationTimelineEntryKind.CONTENT_VERIFICATION && item.reason" class="form-hint form-hint--neutral">
                                            {{ item.reason }}
                                        </p>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    </div>`;
