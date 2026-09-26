// Publications page template: a publication card's Distribution section.
// It renders in DecentralizedPublicationsView's scope, so it uses the names its setup() returns.
export const distributionSectionTemplate = `<!-- Distribution: the three roles (Announcement/Discovery,
                         Content, Proof/Anchoring) for this publication.
                         Presentation only: each role keeps its own verb and
                         collaborator; a placement is never called "publishing".
                         Open by default because these are the primary actions. -->
                    <details open class="identity-mgmt-card-details identity-mgmt-distribution">
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
                        </div>

                        <!-- Proof / Anchoring: one card per available
                             anchorType. Configure sets the role-wide preferred
                             provider; wallet state still renders inline. -->
                        <div v-if="availableAnchorTypes.length > 0" class="identity-mgmt-distribution-role">
                            <div class="evidence-discovery-header">
                                <span class="evidence-convergence-title">Proof / Anchoring</span>
                                <router-link to="/settings/anchor-provider" class="action-btn action-btn--secondary">Configure</router-link>
                            </div>
                            <!-- The generic loop can't run the wallet-guided
                                 Bitcoin pipeline or Base (which needs a
                                 reviewed plan), so point to those flows further
                                 down. Each half shows only when its
                                 collaborator exists. -->
                            <p v-if="bitcoinWalletConnection || baseAnchorPublisher" class="form-hint form-hint--neutral">
                                <template v-if="bitcoinWalletConnection">Bitcoin anchoring is wallet-guided and multi-step — the button below only
                                succeeds once a transaction has been connected, funded, constructed, reviewed, signed,
                                finalized, and broadcast in the Bitcoin section under &quot;Snapshot, Anchoring, IPFS
                                &amp; Evidence Details&quot; below.</template>
                                <template v-if="baseAnchorPublisher"> Base anchoring is also available, through its own
                                wallet-guided flow — connect a wallet and review a transaction in the Base section under
                                &quot;Snapshot, Anchoring, IPFS &amp; Evidence Details&quot; below to create one.</template>
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

                            <!-- Resolves the saved PROOF_AND_ANCHORING
                                 preference on every click; never offers Base. -->
                            <div v-if="preferredAnchorCreationCoordinator" class="evidence-discovery">
                                <div class="evidence-discovery-header">
                                    <button class="action-btn action-btn--secondary"
                                            :disabled="preferredCreationView(entry).state === 'creating'"
                                            @click="createPreferredAnchor(entry)">
                                        {{ preferredCreationButtonLabel(entry) }}
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
                            </div>
                        </div>
                    </details>`;
