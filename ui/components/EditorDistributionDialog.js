import { sortOptionsByLabel } from '../../utils/sortOptionsByLabel.js';

// 0.9.672 — Editor View Distribution Dialog.
//
// UX-level cleanup only — the direct sibling of
// ui/components/WorldDistributionDialog.js, one host over. ui/views/
// EditorView.js's own post-publish "Distribute Snapshot"/"Distribute now"
// sections rendered their storage/substrate pickers, buttons, and result
// displays inline inside the post-publish overlay, permanently on screen
// the moment a publish succeeded. This dialog is a PURE PRESENTATION
// GROUPING, the identical restraint WorldDistributionDialog.js's own
// header already documents: no command, prop, or ephemeral state field
// moved here. `distributePublishedSnapshot()`/`distributePublishedDocument()`/
// `distributePublishedDocumentAndSnapshot()` remain exactly where they
// are, in EditorView.js's own `setup()`, still the only callers of their
// own injected commands, still sequencing the combined action exactly as
// they already do (Snapshot, then Publication — this dialog's own section
// order below matches that sequencing, one caller over, since this
// component has exactly one host and no cross-host ordering conflict to
// reconcile).
//
// A VISUALLY-MATCHING SIBLING OF WorldDistributionDialog.js, NEVER A
// SHARED COMPONENT WITH IT. Deliberately a SEPARATE file, deliberately
// near-identical markup/class-naming shape — see this codebase's own
// established "mirrors X exactly, one caller over" convention (already
// held between OwnPublicationPanel.js/WorldEncounterCanvas.js's own
// distribution sections, and between EditorView.js's/WorldView.js's own
// post-publish actions) rather than one abstraction serving both a
// selected-marker flow and a post-publish overlay that share no other
// state or lifecycle. The one genuine structural difference from
// WorldDistributionDialog.js: EditorView.js has no
// `distributionLifecycleStore` of any kind (see that file's own header)
// and always stores its own resolved Publication result directly, so
// this dialog carries no `showDistributionLifecycle` prop at all — it
// unconditionally shows the resolved `distributionResult`, mirroring
// EditorView.js's own pre-existing template exactly. It also carries the
// one EditorView-specific affordance WorldDistributionDialog.js has no
// equivalent for: the 0.9.381 "Repository -> Explore" navigation link,
// forwarded here as a plain `view-in-repository` emit — this component
// itself never imports or calls `router`.
//
// SAME `.modal-overlay`/`.modal-panel`/`.modal-actions` SHELL EVERY OTHER
// DIALOG IN THIS CODEBASE ALREADY USES — see
// ui/components/WorldDistributionDialog.js's own identical header note.
// Visibility is controlled entirely by the host's own `v-if` around this
// component's own tag; this component has no internal `open` prop.
//
// ONE SHARED SETTINGS BLOCK FOR BOTH PROTOCOLS — the identical cleanup
// ui/components/WorldDistributionDialog.js's own header documents, one
// host over: a single Storage picker, a single Remote Pinning draft (this
// host already shared one draft between both actions), and a single
// Announcement/Discovery picker, read by the combined "Distribute" action
// and by each per-protocol retry button alike. Results and errors stay
// per-protocol. Storage options are the Snapshot-eligible list
// (`snapshotDistributionStorageTypes` plus Remote Pinning) whenever
// Snapshot distribution is available; a Publication-only dialog offers
// all three Material storages.
export default {
    name: 'EditorDistributionDialog',
    props: {
        canDistributePublication: { type: Boolean, default: false },
        canDistributeSnapshot: { type: Boolean, default: false },

        storage: { type: String, default: 'ar' },
        discoveryProvider: { type: String, default: 'nostr' },
        remotePinningDraft: {
            type: Object,
            default: () => ({ endpoint: '', credential: '', requestField: '', responseField: '' })
        },
        snapshotDistributionStorageTypes: { type: Array, default: () => ['ar', 'ipfs'] },

        snapshotDistributionExecuting: { type: Boolean, default: false },
        snapshotDistributionError: { type: String, default: null },
        snapshotDistributionResult: { type: Object, default: null },

        distributionExecuting: { type: Boolean, default: false },
        distributionError: { type: String, default: null },
        distributionResult: { type: Array, default: null },

        documentId: { type: String, default: null }
    },
    emits: [
        'close',
        'distribute-both',
        'distribute-publication',
        'distribute-snapshot',
        'view-in-repository',
        'update:storage',
        'update:discoveryProvider'
    ],
    computed: {
        storageModel: {
            get() { return this.storage; },
            set(value) { this.$emit('update:storage', value); }
        },
        discoveryProviderModel: {
            get() { return this.discoveryProvider; },
            set(value) { this.$emit('update:discoveryProvider', value); }
        },
        anyExecuting() {
            return this.snapshotDistributionExecuting || this.distributionExecuting;
        },
        // Display order only — see utils/sortOptionsByLabel.js.
        storageOptions() {
            // An empty registry list falls back to 'ar', matching the
            // hosts' own storage default, so the select never shows blank.
            const registryStorages = !this.canDistributeSnapshot
                ? ['ar', 'ipfs']
                : (this.snapshotDistributionStorageTypes.length ? this.snapshotDistributionStorageTypes : ['ar']);
            return sortOptionsByLabel([
                ...registryStorages.map((storage) => ({
                    value: storage,
                    label: storage === 'ipfs' ? 'IPFS (Local Kubo)' : 'Arweave'
                })),
                { value: 'remote-pinning', label: 'IPFS (Remote Pinning)' }
            ]);
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
            <div class="modal-panel editor-distribution-dialog">
                <h3>Distribute</h3>

                <div class="editor-distribution-dialog-settings">
                    <label class="form-field editor-distribution-dialog-storage-label">
                        <span class="form-label">Storage</span>
                        <select v-model="storageModel" class="form-select editor-distribution-dialog-storage-select" :disabled="anyExecuting">
                            <option v-for="option in storageOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                        </select>
                    </label>

                    <div v-if="storage === 'remote-pinning'" class="editor-distribution-dialog-remote-pinning-draft">
                        <label class="form-field">
                            <span class="form-label">Endpoint</span>
                            <input type="text" class="form-input" v-model="remotePinningDraft.endpoint" placeholder="https://api.pinata.cloud/pinning/pinFileToIPFS" />
                        </label>
                        <label class="form-field">
                            <span class="form-label">Credential (optional)</span>
                            <input type="password" class="form-input" v-model="remotePinningDraft.credential" placeholder="Bearer token" />
                        </label>
                        <label class="form-field">
                            <span class="form-label">Request field (optional)</span>
                            <input type="text" class="form-input" v-model="remotePinningDraft.requestField" placeholder="file" />
                        </label>
                        <label class="form-field">
                            <span class="form-label">Response field (optional)</span>
                            <input type="text" class="form-input" v-model="remotePinningDraft.responseField" placeholder="cid (Pinata: IpfsHash)" />
                        </label>
                        <p class="form-hint form-hint--neutral">Nothing here is saved anywhere — entered fresh each time you distribute.</p>
                    </div>

                    <label class="form-field editor-distribution-dialog-provider-label">
                        <span class="form-label">Announcement / Discovery substrate</span>
                        <select v-model="discoveryProviderModel" class="form-select editor-distribution-dialog-provider-select" :disabled="anyExecuting">
                            <option value="arweave">Arweave</option>
                            <option value="nostr">Nostr</option>
                        </select>
                    </label>
                </div>

                <div v-if="canDistributeSnapshot && canDistributePublication" class="editor-distribution-dialog-combined">
                    <button
                        type="button"
                        class="action-btn action-btn--primary editor-distribution-dialog-combined-action"
                        :disabled="anyExecuting"
                        @click="$emit('distribute-both')"
                    >{{ anyExecuting ? 'Distributing…' : 'Distribute' }}</button>
                    <p class="editor-distribution-dialog-combined-hint form-hint form-hint--neutral">Distributes the Signed Claim and the Snapshot together with the settings above — each still its own protocol, reported separately below.</p>
                </div>

                <div v-if="canDistributeSnapshot" class="editor-distribution-dialog-section editor-distribution-dialog-snapshot-section">
                    <h4 class="editor-distribution-dialog-section-title">Snapshot</h4>

                    <button
                        type="button"
                        :class="['action-btn', canDistributePublication ? 'action-btn--secondary' : 'action-btn--primary', 'editor-distribution-dialog-distribute-snapshot-btn']"
                        :disabled="anyExecuting"
                        @click="$emit('distribute-snapshot')"
                    >{{ snapshotDistributionExecuting ? 'Distributing…' : (canDistributePublication ? 'Distribute Snapshot only' : 'Distribute Snapshot') }}</button>

                    <p v-if="snapshotDistributionError" class="editor-distribution-dialog-distribution-error">{{ snapshotDistributionError }}</p>
                    <dl v-else-if="snapshotDistributionResult" class="editor-distribution-dialog-distribution-detail">
                        <dt>Content hash</dt>
                        <dd>{{ snapshotDistributionResult.contentReference.hash }}</dd>
                        <dt>Locator</dt>
                        <dd>{{ snapshotDistributionResult.contentReference.uri }}</dd>
                        <dt>Announcement</dt>
                        <dd>{{ snapshotDistributionResult.announcement ? snapshotDistributionResult.announcement.id : (snapshotDistributionResult.announcementError || 'No announcement') }}</dd>
                    </dl>
                </div>

                <div v-if="canDistributePublication" class="editor-distribution-dialog-section editor-distribution-dialog-publication-section">
                    <h4 class="editor-distribution-dialog-section-title">Publication</h4>

                    <button
                        type="button"
                        :class="['action-btn', canDistributeSnapshot ? 'action-btn--secondary' : 'action-btn--primary', 'editor-distribution-dialog-distribute-btn']"
                        :disabled="anyExecuting"
                        @click="$emit('distribute-publication')"
                    >{{ distributionExecuting ? 'Distributing…' : (canDistributeSnapshot ? 'Distribute Publication only' : 'Distribute Publication') }}</button>

                    <p v-if="distributionError" class="editor-distribution-dialog-distribution-error">{{ distributionError }}</p>
                    <dl v-else-if="distributionResult && distributionResult.length" class="editor-distribution-dialog-distribution-detail">
                        <dt>Publication</dt>
                        <dd>{{ distributionResult[0].publication.objectId }}</dd>
                        <dt>Material</dt>
                        <dd>{{ distributionResult[0].material ? distributionResult[0].material.uri : 'Not yet uploaded' }}</dd>
                        <template v-for="(relayResult, relayIndex) in distributionResult" :key="relayIndex">
                            <dt>{{ distributionResult.length > 1 ? \`Discovery (relay \${relayIndex + 1})\` : 'Discovery' }}</dt>
                            <dd>{{ relayResult.discovery ? relayResult.discovery.id : 'Not yet announced' }}</dd>
                        </template>
                        <template v-if="documentId">
                            <dt>Repository</dt>
                            <dd>
                                <button
                                    type="button"
                                    class="action-btn action-btn--secondary editor-distribution-dialog-view-btn"
                                    @click="$emit('view-in-repository')"
                                >Explore</button>
                            </dd>
                        </template>
                    </dl>
                </div>

                <div class="modal-actions">
                    <button type="button" class="action-btn action-btn--secondary editor-distribution-dialog-close-action" @click="$emit('close')">Close</button>
                </div>
            </div>
        </div>
    `
};
