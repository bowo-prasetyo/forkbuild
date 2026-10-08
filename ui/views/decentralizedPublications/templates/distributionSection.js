// Publications page template: a publication card's Distribution section.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const distributionSectionTemplate = `<!-- Distribution: the three roles (Announcement/Discovery,
                         Content, Proof/Anchoring) for this publication.
                         Presentation only: each role keeps its own verb and
                         collaborator; a placement is never called "publishing".
                         Folded, like the details below, so a long list stays
                         scannable. -->
                    <details class="identity-mgmt-card-details identity-mgmt-distribution">
                        <summary class="identity-mgmt-card-details-summary">{{ t('publications.distribution') }}</summary>

                        <div v-if="publicationDistributionCommand || multiRelayNostrPublicationDistributionCommand || snapshotDistributionCommand" class="identity-mgmt-distribution-role">
                            <span class="evidence-convergence-title">{{ t('publications.announcementDiscovery') }}</span>
                            <div class="evidence-list">
                                <!-- Either command is enough;
                                     distributeEntryPublication() picks one per
                                     substrate. -->
                                <div v-if="publicationDistributionCommand || multiRelayNostrPublicationDistributionCommand" class="evidence-anchor-card">
                                    <div class="evidence-anchor-header">
                                        <span class="evidence-anchor-type">{{ t('publications.publication3') }}</span>
                                    </div>
                                    <p class="form-hint form-hint--neutral">
                                        {{ t('publications.distributesThisPublicationSOwn') }}
                                    </p>
                                    <label class="form-label">
                                        {{ t('publications.substrate') }}
                                        <select v-model="entry.discoveryDistributionProvider" class="form-select"
                                                :disabled="entry.discoveryDistributionAttempt && entry.discoveryDistributionAttempt.distributing">
                                            <option value="arweave">Arweave</option>
                                            <option value="blurt">{{ t('publications.blurtExperimental') }}</option>
                                            <option value="nostr">Nostr</option>
                                            <option value="steem">{{ t('publications.steemExperimental') }}</option>
                                        </select>
                                    </label>
                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="entry.discoveryDistributionAttempt && entry.discoveryDistributionAttempt.distributing"
                                                @click="distributePublicationForEntry(entry)">
                                            {{ displayText(discoveryDistributionButtonLabel(entry)) }}
                                        </button>
                                        <!-- Where to configure the chosen
                                             substrate; says nothing about
                                             whether it is reachable. -->
                                        <router-link :to="discoveryDistributionConfigurationRoute(entry)" class="action-btn action-btn--secondary">
                                            {{ t('publications.configureProvider', { provider: humanizeDiscoveryProvider(entry.discoveryDistributionProvider) }) }}
                                        </router-link>
                                    </div>
                                    <p v-if="entry.discoveryDistributionAttempt && entry.discoveryDistributionAttempt.error" class="form-hint form-hint--neutral">
                                        {{ entry.discoveryDistributionAttempt.error }}
                                    </p>
                                    <p v-if="steemNoticePictureText(entry)" class="form-hint steem-notice-picture-warning" role="status">{{ steemNoticePictureText(entry) }}</p>
                                    <!-- One row per substrate, never collapsed
                                         into one status. -->
                                    <dl v-if="discoveryObservationsView(entry).length > 0" class="evidence-fields">
                                        <!-- Keyed by provider and origin:
                                             several Nostr relay observations
                                             can coexist. -->
                                        <div v-for="observation in discoveryObservationsView(entry)" :key="observation.discoveryProvider + ':' + observation.origin" class="evidence-field">
                                            <dt>{{ t('publications.discoveryProvider', { provider: observation.discoveryProvider }) }}</dt>
                                            <dd>{{ observation.state }}</dd>
                                        </div>
                                    </dl>
                                    <PublicationShareLink :publication-id="entry.publication.id" :title="entry.publication.title" />
                                </div>

                                <div v-if="snapshotDistributionCommand" class="evidence-anchor-card">
                                    <div class="evidence-anchor-header">
                                        <span class="evidence-anchor-type">{{ t('publications.snapshot2') }}</span>
                                    </div>
                                    <p v-if="entryWorld(entry)" class="form-hint form-hint--neutral">
                                        {{ t('publications.storesThisWorldSSnapshot') }}
                                    </p>
                                    <p v-else class="form-hint form-hint--neutral">
                                        {{ t('publications.storesThisPublicationSContent') }}
                                    </p>
                                    <!-- Where the snapshot's bytes are stored and
                                         where it is announced. Only eligible,
                                         registered backends are offered. -->
                                    <label v-if="snapshotDistributionStorageTypes.length > 0" class="form-label">
                                        {{ t('publications.content') }}
                                        <select v-model="entry.snapshotDistributionStorage" class="form-select"
                                                :disabled="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.distributing">
                                            <option v-for="storage in snapshotDistributionStorageOptions" :key="storage" :value="storage">{{ displayText(storageTypeOptionLabel(storage)) }}</option>
                                        </select>
                                    </label>
                                    <label class="form-label">
                                        {{ t('publications.substrate') }}
                                        <select v-model="entry.snapshotDiscoveryProvider" class="form-select"
                                                :disabled="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.distributing">
                                            <option value="arweave">Arweave</option>
                                            <option value="blurt">{{ t('publications.blurtExperimental') }}</option>
                                            <option value="nostr">Nostr</option>
                                            <option value="steem">{{ t('publications.steemExperimental') }}</option>
                                        </select>
                                    </label>
                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.distributing"
                                                @click="distributeSnapshot(entry)">
                                            {{ displayText(snapshotDistributionButtonLabel(entry)) }}
                                        </button>
                                        <router-link :to="snapshotDistributionConfigurationRoute(entry)" class="action-btn action-btn--secondary">
                                            {{ t('publications.configureProvider', { provider: humanizeStorageType(entry.snapshotDistributionStorage) }) }}
                                        </router-link>
                                        <router-link :to="snapshotDiscoveryConfigurationRoute(entry)" class="action-btn action-btn--secondary">
                                            {{ t('publications.configureProvider', { provider: humanizeDiscoveryProvider(entry.snapshotDiscoveryProvider) }) }}
                                        </router-link>
                                    </div>
                                    <p v-if="steemUploadProgressText(entry)" class="form-hint form-hint--neutral" role="status">{{ displayText(steemUploadProgressText(entry)) }}</p>
                                    <p v-if="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.error" class="form-hint form-hint--neutral">
                                        {{ entry.snapshotDistributionAttempt.error }}
                                    </p>
                                    <dl v-if="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.result" class="evidence-fields">
                                        <div class="evidence-field"><dt>{{ t('publications.content') }}</dt><dd>{{ entry.snapshotDistributionAttempt.result.contentReference }}</dd></div>
                                    </dl>
                                    <!-- A null announcement is
                                         SnapshotDistributionCommand's ordinary
                                         decline, not a failure; the content is
                                         placed either way. Named for the
                                         substrate this attempt used. -->
                                    <p v-if="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.result" class="form-hint form-hint--neutral">
                                        <span class="peer-badge" :class="entry.snapshotDistributionAttempt.result.announcement ? 'peer-badge--authenticated' : 'peer-badge--failed'">
                                            {{ humanizeDiscoveryProvider(entry.snapshotDistributionAttempt.result.discoveryProvider) }}:
                                            {{ entry.snapshotDistributionAttempt.result.announcement ? t('publications.announced') : t('publications.notAnnounced') }}
                                        </span>
                                        <template v-if="entry.snapshotDistributionAttempt.result.announcement && entryWorld(entry)">
                                            {{ entry.snapshotDistributionAttempt.result.positioned ? t('publications.withPublisherPlacement') : t('publications.withoutAPositionThisDevice') }}
                                        </template>
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Content: one card per available storage type. A
                             placement says where bytes can be retrieved; it is
                             never called publishing. -->
                        <div v-if="availableStorageTypes.length > 0" class="identity-mgmt-distribution-role">
                            <!-- One Configure link for the role: the Content
                                 preference is role-wide, not per storage type. -->
                            <div class="evidence-discovery-header">
                                <span class="evidence-convergence-title">{{ t('publications.content') }}</span>
                                <router-link to="/settings/content-provider" class="action-btn action-btn--secondary">{{ t('publications.configure') }}</router-link>
                            </div>
                            <!-- One button for the saved preferred storage
                                 (the person's own choice, named); the
                                 per-backend cards fold below it. Without a
                                 usable preference the cards show open and
                                 the hint says why. -->
                            <div v-if="contentPreference.providerKey" class="evidence-discovery">
                                <p class="form-hint form-hint--neutral">
                                    <I18nText keypath="publications.storesThisPublicationSContent2"><template #provider><strong>{{ humanizeStorageType(contentPreference.providerKey) }}</strong></template></I18nText>
                                    <span v-if="isExperimentalStorageType(contentPreference.providerKey)" class="experimental-badge">{{ t('publications.experimental') }}</span>
                                </p>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="preferredPlacementCreationView(entry).state === 'creating'"
                                            @click="createPreferredPlacement(entry)">
                                        {{ displayText(preferredStoreButtonLabel(entry)) }}
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
                                    <div class="evidence-field"><dt>{{ t('publications.locator2') }}</dt><dd>{{ preferredPlacementCreationView(entry).placement.locator }}</dd></div>
                                    <div class="evidence-field"><dt>{{ t('publications.contentHash6') }}</dt><dd>{{ preferredPlacementCreationView(entry).placement.contentHash }}</dd></div>
                                </dl>
                            </div>
                            <p v-else class="form-hint form-hint--neutral">{{ contentPreferenceHint }}</p>
                            <details class="identity-mgmt-distribution-options" :open="!contentPreference.providerKey">
                                <summary class="identity-mgmt-card-details-summary">
                                    {{ contentPreference.providerKey ? t('publications.otherStorageOptions') : t('publications.storageOptions') }} ({{ availableStorageTypes.length }})
                                </summary>
                            <div class="evidence-list">
                                <div v-for="storage in availableStorageTypes" :key="storage" class="evidence-anchor-card">
                                    <div class="evidence-anchor-header">
                                        <span class="evidence-anchor-type">{{ humanizeStorageType(storage) }}</span>
                                        <span v-if="isExperimentalStorageType(storage)" class="experimental-badge">{{ t('publications.experimental') }}</span>
                                        <span v-if="placementCreationView(entry, storage).label" class="peer-badge" :class="placementCreationBadgeClass(entry, storage)">
                                            {{ displayText(placementCreationView(entry, storage).label) }}
                                        </span>
                                    </div>
                                    <p v-if="placementCreationView(entry, storage).message" class="form-hint form-hint--neutral">
                                        {{ displayText(placementCreationView(entry, storage).message) }}
                                    </p>
                                    <p v-if="placementCreationView(entry, storage).reason" class="form-hint form-hint--neutral">
                                        {{ displayText(placementCreationView(entry, storage).reason) }}
                                    </p>
                                    <dl v-if="placementCreationView(entry, storage).placement" class="evidence-fields">
                                        <div class="evidence-field"><dt>{{ t('publications.locator2') }}</dt><dd>{{ placementCreationView(entry, storage).placement.locator }}</dd></div>
                                        <div class="evidence-field"><dt>{{ t('publications.contentHash6') }}</dt><dd>{{ placementCreationView(entry, storage).placement.contentHash }}</dd></div>
                                    </dl>
                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="placementCreationView(entry, storage).state === 'creating'"
                                                @click="createPlacement(entry, storage)">
                                            {{ displayText(placementCreationButtonLabel(entry, storage)) }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            </details>
                        </div>

                        <!-- Proof / Anchoring: one button for the saved
                             preferred provider (the person's own choice,
                             named; never Bitcoin or Base, which take wallet
                             steps), then one card per anchorType a click can
                             make, folded when that button is shown. Each
                             Experimental type is badged; the block is too
                             while every type it offers is. -->
                        <div v-if="oneClickAnchorTypes.length > 0 || bitcoinWalletConnection || baseAnchorPublisher" class="identity-mgmt-distribution-role">
                            <div class="evidence-discovery-header">
                                <span class="evidence-convergence-title">{{ t('publications.proofAnchoring') }}</span>
                                <span v-if="proofAnchoringExperimental" class="experimental-badge">{{ t('publications.experimental') }}</span>
                                <router-link to="/settings/anchor-provider" class="action-btn action-btn--secondary">{{ t('publications.configure') }}</router-link>
                            </div>
                            <!-- Resolves the saved PROOF_AND_ANCHORING
                                 preference on every click; never offers Base. -->
                            <div v-if="preferredAnchorCreationCoordinator" class="evidence-discovery">
                                <template v-if="anchorPreference.providerKey">
                                    <p class="form-hint form-hint--neutral">
                                        <I18nText keypath="publications.recordsThisPublicationSContent"><template #provider><strong>{{ humanizeAnchorType(anchorPreference.providerKey) }}</strong></template></I18nText>
                                        <span v-if="isExperimentalAnchorType(anchorPreference.providerKey)" class="experimental-badge">{{ t('publications.experimental') }}</span>
                                    </p>
                                    <div class="evidence-discovery-header">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="preferredCreationView(entry).state === 'creating'"
                                                @click="createPreferredAnchor(entry)">
                                            {{ displayText(preferredAnchorButtonLabel(entry)) }}
                                        </button>
                                        <span v-if="preferredCreationView(entry).label" class="peer-badge" :class="preferredCreationBadgeClass(entry)">
                                            {{ displayText(preferredCreationView(entry).label) }}
                                        </span>
                                    </div>
                                    <p v-if="preferredCreationView(entry).message" class="form-hint form-hint--neutral">
                                        {{ displayText(preferredCreationView(entry).message) }}
                                    </p>
                                    <p v-if="preferredCreationView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ displayText(preferredCreationView(entry).reason) }}
                                    </p>
                                    <p v-if="preferredCreationFinality(entry)" class="form-hint form-hint--neutral">
                                        <strong>{{ displayText(preferredCreationFinality(entry).label) }}:</strong> {{ displayText(preferredCreationFinality(entry).message) }}
                                    </p>
                                    <dl v-if="preferredCreationView(entry).anchor" class="evidence-fields">
                                        <div class="evidence-field"><dt>{{ t('publications.transaction2') }}</dt><dd>{{ preferredCreationView(entry).anchor.locator }}</dd></div>
                                        <div class="evidence-field"><dt>{{ t('publications.contentHash6') }}</dt><dd>{{ preferredCreationView(entry).anchor.contentHash }}</dd></div>
                                    </dl>
                                </template>
                                <p v-else class="form-hint form-hint--neutral">{{ anchorPreferenceHint }}</p>
                            </div>
                            <details class="identity-mgmt-distribution-options" :open="!anchorPreference.providerKey">
                                <summary class="identity-mgmt-card-details-summary">
                                    {{ anchorPreference.providerKey ? t('publications.otherAnchoringOptions') : t('publications.anchoringOptions') }} ({{ oneClickAnchorTypes.length }})
                                </summary>
                            <!-- The generic loop can't run the wallet-guided
                                 Bitcoin pipeline or Base (which needs a
                                 reviewed plan), so they get no card here, only
                                 a pointer to those flows in the card's
                                 Details. -->
                            <p v-if="bitcoinWalletConnection || baseAnchorPublisher" class="form-hint form-hint--neutral">
                                <I18nText :keypath="bitcoinWalletConnection && baseAnchorPublisher ? 'publications.walletStepsBitcoinAndBase' : (bitcoinWalletConnection ? 'publications.walletStepsBitcoin' : 'publications.walletStepsBase')">
                                    <template #tab><strong>{{ t('publications.detailsDecentralizationEvidence') }}</strong></template>
                                </I18nText>
                            </p>
                            <div class="evidence-list">
                                <div v-for="anchorType in oneClickAnchorTypes" :key="anchorType" class="evidence-anchor-card">
                                    <div class="evidence-anchor-header">
                                        <span class="evidence-anchor-type">{{ humanizeAnchorType(anchorType) }}</span>
                                        <span v-if="isExperimentalAnchorType(anchorType)" class="experimental-badge">{{ t('publications.experimental') }}</span>
                                        <span v-if="creationView(entry, anchorType).label" class="peer-badge" :class="creationBadgeClass(entry, anchorType)">
                                            {{ displayText(creationView(entry, anchorType).label) }}
                                        </span>
                                    </div>
                                    <p v-if="creationView(entry, anchorType).message" class="form-hint form-hint--neutral">
                                        {{ displayText(creationView(entry, anchorType).message) }}
                                    </p>
                                    <p v-if="creationView(entry, anchorType).reason" class="form-hint form-hint--neutral">
                                        {{ displayText(creationView(entry, anchorType).reason) }}
                                    </p>
                                    <p v-if="creationFinality(entry, anchorType)" class="form-hint form-hint--neutral">
                                        <strong>{{ displayText(creationFinality(entry, anchorType).label) }}:</strong> {{ displayText(creationFinality(entry, anchorType).message) }}
                                    </p>
                                    <dl v-if="creationView(entry, anchorType).anchor" class="evidence-fields">
                                        <div class="evidence-field"><dt>{{ t('publications.transaction2') }}</dt><dd>{{ creationView(entry, anchorType).anchor.locator }}</dd></div>
                                        <div class="evidence-field"><dt>{{ t('publications.contentHash6') }}</dt><dd>{{ creationView(entry, anchorType).anchor.contentHash }}</dd></div>
                                    </dl>
                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="creationView(entry, anchorType).state === 'creating'"
                                                @click="createAnchor(entry, anchorType)">
                                            {{ displayText(creationButtonLabel(entry, anchorType)) }}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            </details>
                        </div>
                    </details>`;
