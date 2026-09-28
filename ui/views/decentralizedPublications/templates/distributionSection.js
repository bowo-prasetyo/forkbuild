// Publications page template: a publication card's Distribution section.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const distributionSectionTemplate = `<!-- Distribution: the three roles (Announcement/Discovery,
                         Content, Proof/Anchoring) for this publication.
                         Presentation only: each role keeps its own verb and
                         collaborator; a placement is never called "publishing".
                         Folded, like the details below, so a long list stays
                         scannable. -->
                    <details class="identity-mgmt-card-details identity-mgmt-distribution">
                        <summary class="identity-mgmt-card-details-summary">Distribution</summary>

                        <div v-if="publicationDistributionCommand || multiRelayNostrPublicationDistributionCommand || snapshotDistributionCommand" class="identity-mgmt-distribution-role">
                            <span class="evidence-convergence-title">Announcement / Discovery</span>
                            <div class="evidence-list">
                                <!-- Either command is enough;
                                     distributeEntryPublication() picks one per
                                     substrate. -->
                                <div v-if="publicationDistributionCommand || multiRelayNostrPublicationDistributionCommand" class="evidence-anchor-card">
                                    <div class="evidence-anchor-header">
                                        <span class="evidence-anchor-type">Publication</span>
                                    </div>
                                    <p class="form-hint form-hint--neutral">
                                        Distributes this Publication's own signed envelope — uploading its
                                        material and announcing it via the chosen substrate in one call.
                                    </p>
                                    <label class="form-label">
                                        Substrate
                                        <select v-model="entry.discoveryDistributionProvider" class="form-select"
                                                :disabled="entry.discoveryDistributionAttempt && entry.discoveryDistributionAttempt.distributing">
                                            <option value="arweave">Arweave</option>
                                            <option value="nostr">Nostr</option>
                                            <option value="steem">Steem</option>
                                        </select>
                                    </label>
                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="entry.discoveryDistributionAttempt && entry.discoveryDistributionAttempt.distributing"
                                                @click="distributePublicationForEntry(entry)">
                                            {{ discoveryDistributionButtonLabel(entry) }}
                                        </button>
                                        <!-- Where to configure the chosen
                                             substrate; says nothing about
                                             whether it is reachable. -->
                                        <router-link :to="discoveryDistributionConfigurationRoute(entry)" class="action-btn action-btn--secondary">
                                            Configure {{ entry.discoveryDistributionProvider === 'arweave' ? 'Arweave' : (entry.discoveryDistributionProvider === 'steem' ? 'Steem' : 'Nostr') }}
                                        </router-link>
                                    </div>
                                    <p v-if="entry.discoveryDistributionAttempt && entry.discoveryDistributionAttempt.error" class="form-hint form-hint--neutral">
                                        {{ entry.discoveryDistributionAttempt.error }}
                                    </p>
                                    <!-- One row per substrate, never collapsed
                                         into one status. -->
                                    <dl v-if="discoveryObservationsView(entry).length > 0" class="evidence-fields">
                                        <!-- Keyed by provider and origin:
                                             several Nostr relay observations
                                             can coexist. -->
                                        <div v-for="observation in discoveryObservationsView(entry)" :key="observation.discoveryProvider + ':' + observation.origin" class="evidence-field">
                                            <dt>Discovery ({{ observation.discoveryProvider }})</dt>
                                            <dd>{{ observation.state }}</dd>
                                        </div>
                                    </dl>
                                    <PublicationShareLink :publication-id="entry.publication.id" :title="entry.publication.title" />
                                </div>

                                <div v-if="snapshotDistributionCommand" class="evidence-anchor-card">
                                    <div class="evidence-anchor-header">
                                        <span class="evidence-anchor-type">Snapshot</span>
                                    </div>
                                    <p class="form-hint form-hint--neutral">
                                        Distributes this replica's own locally held Snapshot bytes — never
                                        available when this replica does not currently possess them.
                                    </p>
                                    <!-- Where the snapshot's bytes are stored;
                                         announcement stays on Nostr. Only
                                         eligible, registered backends are
                                         offered. -->
                                    <label v-if="snapshotDistributionStorageTypes.length > 0" class="form-label">
                                        Content
                                        <select v-model="entry.snapshotDistributionStorage" class="form-select"
                                                :disabled="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.distributing">
                                            <option v-for="storage in snapshotDistributionStorageOptions" :key="storage" :value="storage">{{ humanizeStorageType(storage) }}</option>
                                        </select>
                                    </label>
                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.distributing"
                                                @click="distributeSnapshot(entry)">
                                            {{ snapshotDistributionButtonLabel(entry) }}
                                        </button>
                                        <router-link :to="snapshotDistributionConfigurationRoute(entry)" class="action-btn action-btn--secondary">
                                            Configure {{ humanizeStorageType(entry.snapshotDistributionStorage) }}
                                        </router-link>
                                        <router-link to="/settings/nostr-relay" class="action-btn action-btn--secondary">Configure Nostr</router-link>
                                    </div>
                                    <p v-if="steemUploadProgressText(entry)" class="form-hint form-hint--neutral" role="status">{{ steemUploadProgressText(entry) }}</p>
                                    <p v-if="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.error" class="form-hint form-hint--neutral">
                                        {{ entry.snapshotDistributionAttempt.error }}
                                    </p>
                                    <dl v-if="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.result" class="evidence-fields">
                                        <div class="evidence-field"><dt>Content</dt><dd>{{ entry.snapshotDistributionAttempt.result.contentReference }}</dd></div>
                                    </dl>
                                    <!-- A null announcement is
                                         SnapshotDistributionCommand's ordinary
                                         decline, not a failure; the content is
                                         placed either way. -->
                                    <p v-if="entry.snapshotDistributionAttempt && entry.snapshotDistributionAttempt.result" class="form-hint form-hint--neutral">
                                        <span class="peer-badge" :class="entry.snapshotDistributionAttempt.result.announcement ? 'peer-badge--authenticated' : 'peer-badge--failed'">
                                            {{ entry.snapshotDistributionAttempt.result.announcement ? 'Nostr: Announced' : 'Nostr: Not announced' }}
                                        </span>
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
                                <span class="evidence-convergence-title">Content</span>
                                <router-link to="/settings/content-provider" class="action-btn action-btn--secondary">Configure</router-link>
                            </div>
                            <!-- One button for the saved preferred storage
                                 (the person's own choice, named); the
                                 per-backend cards fold below it. Without a
                                 usable preference the cards show open and
                                 the hint says why. -->
                            <div v-if="contentPreference.providerKey" class="evidence-discovery">
                                <p class="form-hint form-hint--neutral">
                                    Stores this publication's content on <strong>{{ humanizeStorageType(contentPreference.providerKey) }}</strong>,
                                    your preferred storage.
                                </p>
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--primary"
                                            :disabled="preferredPlacementCreationView(entry).state === 'creating'"
                                            @click="createPreferredPlacement(entry)">
                                        {{ preferredStoreButtonLabel(entry) }}
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
                            <p v-else class="form-hint form-hint--neutral">{{ contentPreferenceHint }}</p>
                            <details class="identity-mgmt-distribution-options" :open="!contentPreference.providerKey">
                                <summary class="identity-mgmt-card-details-summary">
                                    {{ contentPreference.providerKey ? 'Other storage options' : 'Storage options' }} ({{ availableStorageTypes.length }})
                                </summary>
                            <div class="evidence-list">
                                <div v-for="storage in availableStorageTypes" :key="storage" class="evidence-anchor-card">
                                    <div class="evidence-anchor-header">
                                        <span class="evidence-anchor-type">{{ humanizeStorageType(storage) }}</span>
                                        <span v-if="placementCreationView(entry, storage).label" class="peer-badge" :class="placementCreationBadgeClass(entry, storage)">
                                            {{ placementCreationView(entry, storage).label }}
                                        </span>
                                    </div>
                                    <p v-if="placementCreationView(entry, storage).message" class="form-hint form-hint--neutral">
                                        {{ placementCreationView(entry, storage).message }}
                                    </p>
                                    <p v-if="placementCreationView(entry, storage).reason" class="form-hint form-hint--neutral">
                                        {{ placementCreationView(entry, storage).reason }}
                                    </p>
                                    <dl v-if="placementCreationView(entry, storage).placement" class="evidence-fields">
                                        <div class="evidence-field"><dt>Locator</dt><dd>{{ placementCreationView(entry, storage).placement.locator }}</dd></div>
                                        <div class="evidence-field"><dt>Content hash</dt><dd>{{ placementCreationView(entry, storage).placement.contentHash }}</dd></div>
                                    </dl>
                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="placementCreationView(entry, storage).state === 'creating'"
                                                @click="createPlacement(entry, storage)">
                                            {{ placementCreationButtonLabel(entry, storage) }}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            </details>
                        </div>

                        <!-- Proof / Anchoring: one button for the saved
                             preferred provider (the person's own choice,
                             named; never Bitcoin or Base, which take wallet
                             steps), then one card per available anchorType,
                             folded when that button is shown. -->
                        <div v-if="availableAnchorTypes.length > 0" class="identity-mgmt-distribution-role">
                            <div class="evidence-discovery-header">
                                <span class="evidence-convergence-title">Proof / Anchoring</span>
                                <router-link to="/settings/anchor-provider" class="action-btn action-btn--secondary">Configure</router-link>
                            </div>
                            <!-- Resolves the saved PROOF_AND_ANCHORING
                                 preference on every click; never offers Base. -->
                            <div v-if="preferredAnchorCreationCoordinator" class="evidence-discovery">
                                <template v-if="anchorPreference.providerKey">
                                    <p class="form-hint form-hint--neutral">
                                        Records this publication's content hash on <strong>{{ humanizeAnchorType(anchorPreference.providerKey) }}</strong>,
                                        your preferred anchoring provider.
                                    </p>
                                    <div class="evidence-discovery-header">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="preferredCreationView(entry).state === 'creating'"
                                                @click="createPreferredAnchor(entry)">
                                            {{ preferredAnchorButtonLabel(entry) }}
                                        </button>
                                        <span v-if="preferredCreationView(entry).label" class="peer-badge" :class="preferredCreationBadgeClass(entry)">
                                            {{ preferredCreationView(entry).label }}
                                        </span>
                                    </div>
                                    <p v-if="preferredCreationView(entry).message" class="form-hint form-hint--neutral">
                                        {{ preferredCreationView(entry).message }}
                                    </p>
                                    <p v-if="preferredCreationView(entry).reason" class="form-hint form-hint--neutral">
                                        {{ preferredCreationView(entry).reason }}
                                    </p>
                                    <p v-if="preferredCreationFinality(entry)" class="form-hint form-hint--neutral">
                                        <strong>{{ preferredCreationFinality(entry).label }}:</strong> {{ preferredCreationFinality(entry).message }}
                                    </p>
                                    <dl v-if="preferredCreationView(entry).anchor" class="evidence-fields">
                                        <div class="evidence-field"><dt>Transaction</dt><dd>{{ preferredCreationView(entry).anchor.locator }}</dd></div>
                                        <div class="evidence-field"><dt>Content hash</dt><dd>{{ preferredCreationView(entry).anchor.contentHash }}</dd></div>
                                    </dl>
                                </template>
                                <p v-else class="form-hint form-hint--neutral">{{ anchorPreferenceHint }}</p>
                            </div>
                            <details class="identity-mgmt-distribution-options" :open="!anchorPreference.providerKey">
                                <summary class="identity-mgmt-card-details-summary">
                                    {{ anchorPreference.providerKey ? 'Other anchoring options' : 'Anchoring options' }} ({{ availableAnchorTypes.length }})
                                </summary>
                            <!-- The generic loop can't run the wallet-guided
                                 Bitcoin pipeline or Base (which needs a
                                 reviewed plan), so point to those flows in the
                                 card's Details. Each half shows only when its
                                 collaborator exists. -->
                            <p v-if="bitcoinWalletConnection || baseAnchorPublisher" class="form-hint form-hint--neutral">
                                <template v-if="bitcoinWalletConnection">Create Bitcoin Anchor works only after you've
                                built, signed and broadcast its transaction in this card's <strong>Details → Decentralization
                                &amp; Evidence</strong> tab.</template>
                                <template v-if="baseAnchorPublisher"> Base anchors are made through their own wallet
                                steps<template v-if="bitcoinWalletConnection"> in the same tab</template><template v-else> in
                                this card's <strong>Details → Decentralization &amp; Evidence</strong> tab</template>.</template>
                            </p>
                            <div class="evidence-list">
                                <div v-for="anchorType in availableAnchorTypes" :key="anchorType" class="evidence-anchor-card">
                                    <div class="evidence-anchor-header">
                                        <span class="evidence-anchor-type">{{ humanizeAnchorType(anchorType) }}</span>
                                        <span v-if="creationView(entry, anchorType).label" class="peer-badge" :class="creationBadgeClass(entry, anchorType)">
                                            {{ creationView(entry, anchorType).label }}
                                        </span>
                                    </div>
                                    <p v-if="creationView(entry, anchorType).message" class="form-hint form-hint--neutral">
                                        {{ creationView(entry, anchorType).message }}
                                    </p>
                                    <p v-if="creationView(entry, anchorType).reason" class="form-hint form-hint--neutral">
                                        {{ creationView(entry, anchorType).reason }}
                                    </p>
                                    <p v-if="creationFinality(entry, anchorType)" class="form-hint form-hint--neutral">
                                        <strong>{{ creationFinality(entry, anchorType).label }}:</strong> {{ creationFinality(entry, anchorType).message }}
                                    </p>
                                    <dl v-if="creationView(entry, anchorType).anchor" class="evidence-fields">
                                        <div class="evidence-field"><dt>Transaction</dt><dd>{{ creationView(entry, anchorType).anchor.locator }}</dd></div>
                                        <div class="evidence-field"><dt>Content hash</dt><dd>{{ creationView(entry, anchorType).anchor.contentHash }}</dd></div>
                                    </dl>
                                    <div class="identity-mgmt-actions">
                                        <button class="action-btn action-btn--primary"
                                                :disabled="creationView(entry, anchorType).state === 'creating'"
                                                @click="createAnchor(entry, anchorType)">
                                            {{ creationButtonLabel(entry, anchorType) }}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            </details>
                        </div>
                    </details>`;
