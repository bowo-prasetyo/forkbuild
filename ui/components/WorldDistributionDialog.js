// 0.9.672 — World View Distribution Dialog.
//
// UX-level cleanup only. ui/components/WorldEncounterCanvas.js's own
// "Distribution"/"Snapshot Distribution" panels (a selected marker's own
// Publication) and ui/components/OwnPublicationPanel.js's own identical
// pair (the Wanderer's own active Publication) rendered the same storage/
// substrate pickers, buttons, and result displays inline, permanently on
// screen, whether or not a Wanderer was about to distribute anything.
// This dialog is a PURE PRESENTATION GROUPING — the exact restraint
// OwnPublicationPanel.js's own pre-existing "Diagnostic Tools" popup
// already holds for the Snapshot discover/resolve/materialize pipeline
// (see that file's own 0.9.324 header, "no command, prop, data field,
// method, or disabled/result binding anywhere... changed"), applied here
// to Distribution specifically, as a SEPARATE popup, one caller over.
//
//   WorldEncounterCanvas.js "Distribute" trigger  ─┐
//                                                    ├─► WorldDistributionDialog (THIS)
//   OwnPublicationPanel.js  "Distribute" trigger  ─┘
//
// NEITHER HOST'S STATE, METHODS, OR COMMANDS MOVED HERE. This component
// owns no `distributionExecuting`/`distributionError`/`distributionResult`/
// `snapshotDistribution*` field of its own, calls no distribution command
// directly, and imports nothing from `application/`. Every value it shows
// is a prop; every action it offers ($emit) is handled by whichever host
// mounted it, using that host's own pre-existing, already-tested
// `distributeSelectedPublication()`/`distributeSelectedSnapshot()`/
// `distributeSelectedPublicationAndSnapshot()` (WorldEncounterCanvas.js) or
// `distributeOwnPublication()`/`distributeOwnSnapshot()`/
// `distributeOwnPublicationAndSnapshot()` (OwnPublicationPanel.js) —
// unmodified, still the only callers of their own injected commands, still
// sequencing the combined action exactly as they already do. This dialog
// never introduces a combined result of its own either: closing and
// reopening it shows whatever each host's own result/error state already
// holds, unchanged — the identical "popup visibility has no causal
// relationship with pipeline state" invariant the Diagnostic Tools popup
// already proves for itself, one popup over.
//
// TWO HOSTS, ONE REAL ASYMMETRY, HANDLED BY OPTIONAL PROPS, NEVER BY
// FORKING BEHAVIOR INSIDE A SHARED METHOD. WorldEncounterCanvas.js's own
// `distributeSelectedPublication()` deliberately stores no ad-hoc result
// of its own — see that file's own header, "execution is ephemeral UI
// state — never a third lifecycle value" — relying entirely on
// `distributionLifecycleStore`'s separate subscription instead
// (`distributionMaterialState`/`distributionDiscoveryState`/
// `discoveryObservations`). OwnPublicationPanel.js has no
// `distributionLifecycleStore` of any kind and instead stores and shows
// the resolved `publicationDistributionResult` (normalized to an array —
// see that file's own 0.9.671 fix) directly. `showDistributionLifecycle`
// picks between these two pre-existing, real display shapes; a host
// passes exactly the props its own variant already has, and leaves the
// other's props at their defaults.
//
// Snapshot distribution has no such asymmetry: both hosts already render
// byte-identical Storage/Announcement pickers and a
// `{ contentReference, announcement }` result — one shared section, no
// prop needed to pick between two shapes.
//
// SAME `.modal-overlay`/`.modal-panel`/`.modal-actions` SHELL EVERY OTHER
// DIALOG IN THIS CODEBASE ALREADY USES (ui/components/ForkFailureDialog.js,
// CreateBlueprintDialog.js, MetadataEditorDialog.js, ...) — no new dialog
// pattern invented for this one case. Visibility is controlled entirely by
// the host's own `v-if` around this component's own tag (mirrors
// ForkFailureDialog.js exactly); this component has no internal `open`
// prop of its own to keep in sync with that `v-if`.
export default {
    name: 'WorldDistributionDialog',
    props: {
        canDistributePublication: { type: Boolean, default: false },
        canDistributeSnapshot: { type: Boolean, default: false },
        hasSubject: { type: Boolean, default: false },

        distributionExecuting: { type: Boolean, default: false },
        distributionError: { type: String, default: null },
        showDistributionLifecycle: { type: Boolean, default: false },
        distributionMaterialState: { type: String, default: null },
        distributionDiscoveryState: { type: String, default: null },
        discoveryObservations: { type: Array, default: () => [] },
        distributionResult: { type: Array, default: null },
        discoveryProvider: { type: String, default: 'nostr' },
        materialStorage: { type: String, default: 'ar' },
        materialRemotePinningDraft: {
            type: Object,
            default: () => ({ endpoint: '', credential: '', requestField: '', responseField: '' })
        },

        snapshotDistributionExecuting: { type: Boolean, default: false },
        snapshotDistributionError: { type: String, default: null },
        snapshotDistributionResult: { type: Object, default: null },
        snapshotDistributionStorageTypes: { type: Array, default: () => ['ar'] },
        snapshotStorage: { type: String, default: 'ar' },
        snapshotRemotePinningDraft: {
            type: Object,
            default: () => ({ endpoint: '', credential: '', requestField: '', responseField: '' })
        },
        snapshotDiscoveryProvider: { type: String, default: 'nostr' }
    },
    emits: [
        'close',
        'distribute-both',
        'distribute-publication',
        'distribute-snapshot',
        'update:discoveryProvider',
        'update:materialStorage',
        'update:snapshotStorage',
        'update:snapshotDiscoveryProvider'
    ],
    computed: {
        discoveryProviderModel: {
            get() { return this.discoveryProvider; },
            set(value) { this.$emit('update:discoveryProvider', value); }
        },
        materialStorageModel: {
            get() { return this.materialStorage; },
            set(value) { this.$emit('update:materialStorage', value); }
        },
        snapshotStorageModel: {
            get() { return this.snapshotStorage; },
            set(value) { this.$emit('update:snapshotStorage', value); }
        },
        snapshotDiscoveryProviderModel: {
            get() { return this.snapshotDiscoveryProvider; },
            set(value) { this.$emit('update:snapshotDiscoveryProvider', value); }
        }
    },
    methods: {
        onKeydown(event) {
            if (event.key === 'Escape') {
                event.stopPropagation();
                this.$emit('close');
            }
        }
    },
    template: `
        <div
            role="dialog"
            aria-label="Distribute"
            class="modal-overlay"
            @click.self="$emit('close')"
            @keydown="onKeydown"
        >
            <div class="modal-panel world-distribution-dialog">
                <h3>Distribute</h3>

                <div v-if="canDistributePublication && canDistributeSnapshot" class="world-distribution-dialog-combined">
                    <button
                        type="button"
                        class="action-btn action-btn--primary world-distribution-dialog-combined-action"
                        :disabled="!hasSubject || distributionExecuting || snapshotDistributionExecuting"
                        @click="$emit('distribute-both')"
                    >{{ (distributionExecuting || snapshotDistributionExecuting) ? 'Distributing…' : 'Distribute' }}</button>
                    <p class="world-distribution-dialog-combined-hint form-hint form-hint--neutral">Distributes the Signed Claim and the Snapshot together — each still its own protocol, reported separately below.</p>
                </div>

                <div v-if="canDistributePublication" class="world-distribution-dialog-section world-distribution-dialog-publication-section">
                    <h4 class="world-distribution-dialog-section-title">Distribution</h4>

                    <dl v-if="showDistributionLifecycle" class="world-distribution-dialog-lifecycle-detail">
                        <dt>Material</dt>
                        <dd>{{ distributionMaterialState }}</dd>
                        <template v-if="discoveryObservations.length > 1">
                            <template v-for="observation in discoveryObservations" :key="observation.discoveryProvider + ':' + observation.origin">
                                <dt>Discovery ({{ observation.discoveryProvider }})</dt>
                                <dd>{{ observation.state }}</dd>
                            </template>
                        </template>
                        <template v-else>
                            <dt>Discovery</dt>
                            <dd>{{ distributionDiscoveryState }}</dd>
                        </template>
                    </dl>

                    <label class="form-field world-distribution-dialog-storage-label">
                        <span class="form-label">Material storage</span>
                        <select v-model="materialStorageModel" class="form-select world-distribution-dialog-storage-select" :disabled="distributionExecuting">
                            <option value="ar">Arweave</option>
                            <option value="ipfs">IPFS (Local Kubo)</option>
                            <option value="remote-pinning">IPFS (Remote Pinning)</option>
                        </select>
                    </label>

                    <div v-if="materialStorage === 'remote-pinning'" class="world-distribution-dialog-remote-pinning-draft">
                        <label class="form-field">
                            <span class="form-label">Endpoint</span>
                            <input type="text" class="form-input" v-model="materialRemotePinningDraft.endpoint" placeholder="https://api.pinata.cloud/pinning/pinFileToIPFS" />
                        </label>
                        <label class="form-field">
                            <span class="form-label">Credential (optional)</span>
                            <input type="password" class="form-input" v-model="materialRemotePinningDraft.credential" placeholder="Bearer token" />
                        </label>
                        <label class="form-field">
                            <span class="form-label">Request field (optional)</span>
                            <input type="text" class="form-input" v-model="materialRemotePinningDraft.requestField" placeholder="file" />
                        </label>
                        <label class="form-field">
                            <span class="form-label">Response field (optional)</span>
                            <input type="text" class="form-input" v-model="materialRemotePinningDraft.responseField" placeholder="cid (Pinata: IpfsHash)" />
                        </label>
                        <p class="form-hint form-hint--neutral">Nothing here is saved anywhere — entered fresh each time you click Distribute Publication.</p>
                    </div>

                    <label class="form-field world-distribution-dialog-provider-label">
                        <span class="form-label">Announcement / Discovery substrate</span>
                        <select v-model="discoveryProviderModel" class="form-select world-distribution-dialog-provider-select" :disabled="distributionExecuting">
                            <option value="nostr">Nostr</option>
                            <option value="arweave">Arweave</option>
                        </select>
                    </label>

                    <button
                        type="button"
                        class="action-btn world-distribution-dialog-publication-action"
                        :disabled="!hasSubject || distributionExecuting"
                        @click="$emit('distribute-publication')"
                    >{{ distributionExecuting ? 'Distributing…' : 'Distribute Publication' }}</button>

                    <p v-if="distributionError" class="world-distribution-dialog-publication-error">{{ distributionError }}</p>
                    <dl v-else-if="distributionResult && distributionResult.length" class="world-distribution-dialog-publication-detail">
                        <dt>Publication</dt>
                        <dd>{{ distributionResult[0].publication.objectId }}</dd>
                        <dt>Material</dt>
                        <dd>{{ distributionResult[0].material ? distributionResult[0].material.uri : 'Not yet uploaded' }}</dd>
                        <template v-for="(relayResult, relayIndex) in distributionResult" :key="relayIndex">
                            <dt>{{ distributionResult.length > 1 ? \`Discovery (relay \${relayIndex + 1})\` : 'Discovery' }}</dt>
                            <dd>{{ relayResult.discovery ? relayResult.discovery.id : 'Not yet announced' }}</dd>
                        </template>
                    </dl>
                </div>

                <div v-if="canDistributeSnapshot" class="world-distribution-dialog-section world-distribution-dialog-snapshot-section">
                    <h4 class="world-distribution-dialog-section-title">Snapshot Distribution</h4>

                    <label class="form-field world-distribution-dialog-storage-label">
                        <span class="form-label">Storage</span>
                        <select v-model="snapshotStorageModel" class="form-select world-distribution-dialog-storage-select" :disabled="snapshotDistributionExecuting">
                            <option v-for="storage in snapshotDistributionStorageTypes" :key="storage" :value="storage">{{ storage === 'ipfs' ? 'IPFS (Local Kubo)' : 'Arweave' }}</option>
                            <option value="remote-pinning">IPFS (Remote Pinning)</option>
                        </select>
                    </label>

                    <div v-if="snapshotStorage === 'remote-pinning'" class="world-distribution-dialog-remote-pinning-draft">
                        <label class="form-field">
                            <span class="form-label">Endpoint</span>
                            <input type="text" class="form-input" v-model="snapshotRemotePinningDraft.endpoint" placeholder="https://api.pinata.cloud/pinning/pinFileToIPFS" />
                        </label>
                        <label class="form-field">
                            <span class="form-label">Credential (optional)</span>
                            <input type="password" class="form-input" v-model="snapshotRemotePinningDraft.credential" placeholder="Bearer token" />
                        </label>
                        <label class="form-field">
                            <span class="form-label">Request field (optional)</span>
                            <input type="text" class="form-input" v-model="snapshotRemotePinningDraft.requestField" placeholder="file" />
                        </label>
                        <label class="form-field">
                            <span class="form-label">Response field (optional)</span>
                            <input type="text" class="form-input" v-model="snapshotRemotePinningDraft.responseField" placeholder="cid (Pinata: IpfsHash)" />
                        </label>
                        <p class="form-hint form-hint--neutral">Nothing here is saved anywhere — entered fresh each time you click Distribute Snapshot.</p>
                    </div>

                    <label class="form-field world-distribution-dialog-provider-label">
                        <span class="form-label">Announcement / Discovery substrate</span>
                        <select v-model="snapshotDiscoveryProviderModel" class="form-select world-distribution-dialog-provider-select" :disabled="snapshotDistributionExecuting">
                            <option value="nostr">Nostr</option>
                            <option value="arweave">Arweave</option>
                        </select>
                    </label>

                    <button
                        type="button"
                        class="action-btn world-distribution-dialog-snapshot-action"
                        :disabled="!hasSubject || snapshotDistributionExecuting"
                        @click="$emit('distribute-snapshot')"
                    >{{ snapshotDistributionExecuting ? 'Distributing…' : 'Distribute Snapshot' }}</button>

                    <p v-if="snapshotDistributionError" class="world-distribution-dialog-snapshot-error">{{ snapshotDistributionError }}</p>
                    <dl v-else-if="snapshotDistributionResult" class="world-distribution-dialog-snapshot-detail">
                        <dt>Content hash</dt>
                        <dd>{{ snapshotDistributionResult.contentReference.hash }}</dd>
                        <dt>Locator</dt>
                        <dd>{{ snapshotDistributionResult.contentReference.uri }}</dd>
                        <dt>Announcement</dt>
                        <dd>{{ snapshotDistributionResult.announcement ? snapshotDistributionResult.announcement.id : (snapshotDistributionResult.announcementError || 'No announcement') }}</dd>
                    </dl>
                </div>

                <div class="modal-actions">
                    <button type="button" class="action-btn action-btn--secondary world-distribution-dialog-close-action" @click="$emit('close')">Close</button>
                </div>
            </div>
        </div>
    `
};
