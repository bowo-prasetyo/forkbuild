import { sortOptionsByLabel } from '../../utils/sortOptionsByLabel.js';
import { useWritableNetworks } from './networkWriters/useWritableNetworks.js';
import { describeSteemContentUploadProgress, describeSteemNoticePictureProblem } from '../../application/steem/SteemContentUploadProgressText.js';
import { describeBlurtContentUploadProgress, describeBlurtNoticePictureProblem } from '../../application/blurt/BlurtContentUploadProgressText.js';
import PublicationShareLink from './PublicationShareLink.js';
import { displayText, t } from '../i18n/i18n.js';

// Steem and Blurt hold both the Snapshot and the Signed Claim
// (docs/Protocol.md, "Proposed: Steem Content Storage" and "Proposed: Blurt
// Substrate").
const STORAGE_OPTION_LABELS = {
    ipfs: 'storage.ipfsLocal',
    ar: 'storage.arweave',
    steem: 'storage.steem',
    blurt: 'storage.blurt'
};

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
//
// ONE SHARED SETTINGS BLOCK FOR BOTH PROTOCOLS. The dialog used to render
// two full Storage/Announcement picker sets (and two Remote Pinning
// drafts) — one per section — even though both always opened on the same
// saved preferences and a Wanderer almost never wants them to differ.
// It now renders exactly one Storage picker, one Remote Pinning draft,
// and one Announcement/Discovery picker, above both sections; every
// action (the combined "Distribute" and each per-protocol retry button)
// reads that one choice. The two protocols still execute, report, and
// fail independently — only the settings are shared. Storage options are
// the Snapshot-eligible list (`snapshotDistributionStorageTypes` plus
// Remote Pinning) whenever Snapshot distribution is available, since a
// storage choice the Snapshot leg cannot honor would only fail later;
// a Publication-only dialog offers all three Material storages.
export default {
    name: 'WorldDistributionDialog',
    components: { PublicationShareLink },
    // Steem and Blurt storage report each post while they store a Snapshot.
    inject: {
        steemContentUploadProgress: { default: null },
        steemNoticePictureProblem: { default: null },
        blurtContentUploadProgress: { default: null },
        blurtNoticePictureProblem: { default: null }
    },
    // Only a picture problem from after the dialog opened is shown.
    data() {
        return { openedAt: Date.now() };
    },
    props: {
        // The Publication being distributed, for its share link; the id also
        // comes from a distribution result.
        publicationId: { type: String, default: null },
        publicationTitle: { type: String, default: null },
        canDistributePublication: { type: Boolean, default: false },
        canDistributeSnapshot: { type: Boolean, default: false },
        hasSubject: { type: Boolean, default: false },

        storage: { type: String, default: 'ar' },
        discoveryProvider: { type: String, default: 'nostr' },
        remotePinningDraft: {
            type: Object,
            default: () => ({ endpoint: '', credential: '', requestField: '', responseField: '' })
        },
        snapshotDistributionStorageTypes: { type: Array, default: () => ['ar'] },

        distributionExecuting: { type: Boolean, default: false },
        distributionError: { type: String, default: null },
        showDistributionLifecycle: { type: Boolean, default: false },
        distributionMaterialState: { type: String, default: null },
        distributionDiscoveryState: { type: String, default: null },
        discoveryObservations: { type: Array, default: () => [] },
        distributionResult: { type: Array, default: null },

        snapshotDistributionExecuting: { type: Boolean, default: false },
        snapshotDistributionError: { type: String, default: null },
        snapshotDistributionResult: { type: Object, default: null }
    },
    emits: [
        'close',
        'distribute-both',
        'distribute-publication',
        'distribute-snapshot',
        'update:storage',
        'update:discoveryProvider'
    ],
    // The announcing networks this device can write to (core/NetworkWriters.js):
    // Steem and Blurt only while switched on.
    setup() {
        const { steemOn, blurtOn } = useWritableNetworks();
        return { steemOn, blurtOn };
    },
    computed: {
        // Only while this dialog's Snapshot is being distributed, so another
        // page's upload never shows here.
        steemUploadProgressText() {
            // Options API injections arrive with the ref already unwrapped.
            if (!this.snapshotDistributionExecuting) return null;
            return displayText(describeSteemContentUploadProgress(this.steemContentUploadProgress));
        },
        // A Steem notice posted from this dialog without its build's picture.
        steemNoticePictureText() {
            return displayText(describeSteemNoticePictureProblem(this.steemNoticePictureProblem, this.openedAt));
        },
        // Blurt also reports waiting for its interval between top-level
        // posts, which an announcement can need too, so it shows while
        // anything distributes.
        blurtUploadProgressText() {
            if (!this.anyExecuting) return null;
            return displayText(describeBlurtContentUploadProgress(this.blurtContentUploadProgress));
        },
        blurtNoticePictureText() {
            return displayText(describeBlurtNoticePictureProblem(this.blurtNoticePictureProblem, this.openedAt));
        },
        storageModel: {
            get() { return this.storage; },
            set(value) { this.$emit('update:storage', value); }
        },
        discoveryProviderModel: {
            get() { return this.discoveryProvider; },
            set(value) { this.$emit('update:discoveryProvider', value); }
        },
        anyExecuting() {
            return this.distributionExecuting || this.snapshotDistributionExecuting;
        },
        // Display order only — `snapshotDistributionStorageTypes` itself
        // stays in registry order, since callers fall back to its first
        // entry as a default. See utils/sortOptionsByLabel.js.
        storageOptions() {
            // An empty registry list falls back to 'ar', matching the
            // hosts' own storage default, so the select never shows blank.
            const registryStorages = !this.canDistributeSnapshot
                ? ['ar', 'ipfs']
                : (this.snapshotDistributionStorageTypes.length ? this.snapshotDistributionStorageTypes : ['ar']);
            return sortOptionsByLabel([
                ...registryStorages.map((storage) => ({
                    value: storage,
                    label: t(STORAGE_OPTION_LABELS[storage] || 'storage.arweave')
                })),
                { value: 'remote-pinning', label: t('storage.remotePinning') }
            ]);
        }
    },
    methods: {
        t,
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
            :aria-label="t('worldDistributionDialog.distribute')"
            class="modal-overlay"
            @click.self="$emit('close')"
            @keydown="onKeydown"
        >
            <div class="modal-panel world-distribution-dialog">
                <h3>{{ t('worldDistributionDialog.distribute') }}</h3>

                <div class="world-distribution-dialog-settings">
                    <label class="form-field world-distribution-dialog-storage-label">
                        <span class="form-label">{{ t('worldDistributionDialog.storage') }}</span>
                        <select v-model="storageModel" class="form-select world-distribution-dialog-storage-select" :disabled="anyExecuting">
                            <option v-for="option in storageOptions" :key="option.value" :value="option.value">{{ option.label }}</option>
                        </select>
                    </label>

                    <div v-if="storage === 'remote-pinning'" class="world-distribution-dialog-remote-pinning-draft">
                        <label class="form-field">
                            <span class="form-label">{{ t('worldDistributionDialog.endpoint') }}</span>
                            <input type="text" class="form-input" v-model="remotePinningDraft.endpoint" placeholder="https://api.pinata.cloud/pinning/pinFileToIPFS" />
                        </label>
                        <label class="form-field">
                            <span class="form-label">{{ t('worldDistributionDialog.credentialOptional') }}</span>
                            <input type="password" class="form-input" v-model="remotePinningDraft.credential" :placeholder="t('worldDistributionDialog.bearerToken')" />
                        </label>
                        <label class="form-field">
                            <span class="form-label">{{ t('worldDistributionDialog.requestFieldOptional') }}</span>
                            <input type="text" class="form-input" v-model="remotePinningDraft.requestField" placeholder="file" />
                        </label>
                        <label class="form-field">
                            <span class="form-label">{{ t('worldDistributionDialog.responseFieldOptional') }}</span>
                            <input type="text" class="form-input" v-model="remotePinningDraft.responseField" :placeholder="t('worldDistributionDialog.cidPinataIpfshash')" />
                        </label>
                        <p class="form-hint form-hint--neutral">{{ t('worldDistributionDialog.nothingHereIsSavedAnywhere') }}</p>
                    </div>

                    <label class="form-field world-distribution-dialog-provider-label">
                        <span class="form-label">{{ t('worldDistributionDialog.announcementDiscoverySubstrate') }}</span>
                        <select v-model="discoveryProviderModel" class="form-select world-distribution-dialog-provider-select" :disabled="anyExecuting">
                            <option value="arweave">Arweave</option>
                            <option v-if="blurtOn" value="blurt">Blurt</option>
                            <option value="nostr">Nostr</option>
                            <option v-if="steemOn" value="steem">Steem</option>
                        </select>
                    </label>
                </div>

                <div v-if="canDistributePublication && canDistributeSnapshot" class="world-distribution-dialog-combined">
                    <button
                        type="button"
                        class="action-btn action-btn--primary world-distribution-dialog-combined-action"
                        :disabled="!hasSubject || anyExecuting"
                        @click="$emit('distribute-both')"
                    >{{ anyExecuting ? t('distribution.distributing') : t('distribution.distribute') }}</button>
                    <p class="world-distribution-dialog-combined-hint form-hint form-hint--neutral">{{ t('worldDistributionDialog.distributesTheSignedClaimAnd') }}</p>
                </div>

                <div v-if="canDistributePublication" class="world-distribution-dialog-section world-distribution-dialog-publication-section">
                    <h4 class="world-distribution-dialog-section-title">{{ t('worldDistributionDialog.signedClaim') }}</h4>

                    <dl v-if="showDistributionLifecycle" class="world-distribution-dialog-lifecycle-detail">
                        <dt>{{ t('worldDistributionDialog.material') }}</dt>
                        <dd>{{ distributionMaterialState }}</dd>
                        <template v-if="discoveryObservations.length > 1">
                            <template v-for="observation in discoveryObservations" :key="observation.discoveryProvider + ':' + observation.origin">
                                <dt>{{ t('distribution.discoveryVia', { provider: observation.discoveryProvider }) }}</dt>
                                <dd>{{ observation.state }}</dd>
                            </template>
                        </template>
                        <template v-else>
                            <dt>{{ t('worldDistributionDialog.discovery') }}</dt>
                            <dd>{{ distributionDiscoveryState }}</dd>
                        </template>
                    </dl>

                    <button
                        type="button"
                        :class="['action-btn', canDistributeSnapshot ? 'action-btn--secondary' : 'action-btn--primary', 'world-distribution-dialog-publication-action']"
                        :disabled="!hasSubject || anyExecuting"
                        @click="$emit('distribute-publication')"
                    >{{ distributionExecuting ? t('distribution.distributing') : t(canDistributeSnapshot ? 'distribution.publicationOnly' : 'distribution.distributePublication') }}</button>

                    <p v-if="distributionError" class="world-distribution-dialog-publication-error">{{ distributionError }}</p>
                    <dl v-else-if="distributionResult && distributionResult.length" class="world-distribution-dialog-publication-detail">
                        <dt>{{ t('worldDistributionDialog.publication') }}</dt>
                        <dd>{{ distributionResult[0].publication.objectId }}</dd>
                        <dt>{{ t('worldDistributionDialog.material') }}</dt>
                        <dd>{{ distributionResult[0].material ? distributionResult[0].material.uri : t('distribution.notUploaded') }}</dd>
                        <template v-for="(relayResult, relayIndex) in distributionResult" :key="relayIndex">
                            <dt>{{ distributionResult.length > 1 ? t('distribution.discoveryRelay', { number: relayIndex + 1 }) : t('distribution.discovery') }}</dt>
                            <dd>{{ relayResult.discovery ? relayResult.discovery.id : t('distribution.notAnnounced') }}</dd>
                        </template>
                    </dl>
                    <PublicationShareLink
                        v-if="!distributionError && (publicationId || (distributionResult && distributionResult.length))"
                        :publication-id="publicationId || distributionResult[0].publication.objectId"
                        :title="publicationTitle"
                    />
                </div>

                <div v-if="canDistributeSnapshot" class="world-distribution-dialog-section world-distribution-dialog-snapshot-section">
                    <h4 class="world-distribution-dialog-section-title">{{ t('worldDistributionDialog.snapshot') }}</h4>

                    <button
                        type="button"
                        :class="['action-btn', canDistributePublication ? 'action-btn--secondary' : 'action-btn--primary', 'world-distribution-dialog-snapshot-action']"
                        :disabled="!hasSubject || anyExecuting"
                        @click="$emit('distribute-snapshot')"
                    >{{ snapshotDistributionExecuting ? t('distribution.distributing') : t(canDistributePublication ? 'distribution.snapshotOnly' : 'distribution.distributeSnapshot') }}</button>

                    <p v-if="steemUploadProgressText" class="form-hint form-hint--neutral world-distribution-dialog-steem-progress" role="status">{{ steemUploadProgressText }}</p>
                    <p v-if="steemNoticePictureText" class="form-hint steem-notice-picture-warning world-distribution-dialog-steem-picture" role="status">{{ steemNoticePictureText }}</p>
                    <p v-if="blurtUploadProgressText" class="form-hint form-hint--neutral world-distribution-dialog-blurt-progress" role="status">{{ blurtUploadProgressText }}</p>
                    <p v-if="blurtNoticePictureText" class="form-hint steem-notice-picture-warning world-distribution-dialog-blurt-picture" role="status">{{ blurtNoticePictureText }}</p>
                    <p v-if="snapshotDistributionError" class="world-distribution-dialog-snapshot-error">{{ snapshotDistributionError }}</p>
                    <dl v-else-if="snapshotDistributionResult" class="world-distribution-dialog-snapshot-detail">
                        <dt>{{ t('worldDistributionDialog.contentHash') }}</dt>
                        <dd>{{ snapshotDistributionResult.contentReference.hash }}</dd>
                        <dt>{{ t('worldDistributionDialog.locator') }}</dt>
                        <dd>{{ snapshotDistributionResult.contentReference.uri }}</dd>
                        <dt>{{ t('worldDistributionDialog.announcement') }}</dt>
                        <dd>{{ snapshotDistributionResult.announcement ? snapshotDistributionResult.announcement.id : (snapshotDistributionResult.announcementError || t('distribution.noAnnouncement')) }}</dd>
                    </dl>
                </div>

                <div class="modal-actions">
                    <button type="button" class="action-btn action-btn--secondary world-distribution-dialog-close-action" @click="$emit('close')">{{ t('worldDistributionDialog.close') }}</button>
                </div>
            </div>
        </div>
    `
};
