import WorldDistributionDialog from './WorldDistributionDialog.js';
import PublicationCommentaryRemoteCheck from './PublicationCommentaryRemoteCheck.js';
import { createId } from '../../core/createId.js';
import { resolveSavedProviderDefault } from '../../application/settings/SavedProviderDefaultChoice.js';
// Most methods live in ./ownPublicationPanel/, grouped by concern.
import { publicationActionMethods } from './ownPublicationPanel/publicationActionMethods.js';
import { snapshotDiagnosticMethods } from './ownPublicationPanel/snapshotDiagnosticMethods.js';
import { placementsSectionTemplate } from './ownPublicationPanel/templates/placementsSection.js';
import { publicationActionsSectionTemplate } from './ownPublicationPanel/templates/publicationActionsSection.js';
import { diagnosticToolsSectionTemplate } from './ownPublicationPanel/templates/diagnosticToolsSection.js';
import { commentarySectionTemplate } from './ownPublicationPanel/templates/commentarySection.js';

// Actions on the local user's own current Publication in World View:
// distribute it and its Snapshot, export the Snapshot, place or unpublish it,
// list its placements, and read and write its Commentary. Also hosts the
// manual Snapshot diagnostic pipeline.
//
// Needs no peer, World Encounter or selection: the `publication` prop comes
// from the host view, so a solo user can still distribute their own work.
// Every capability is an injected, app-wide command (the same ones
// WorldEncounterCanvas uses); this component builds no commands of its own. An
// absent (null) command hides its feature.
//
// Every action is an explicit click, never automatic, and keeps its own
// executing/error/result state. Async actions use a request id so duplicate
// and stale responses are dropped; changing `publication` (and unmounting)
// resets everything.
//
// Diagnostic pipeline (manual counterpart of AutomaticSnapshotEncounterCascade,
// for walking the stages by hand when the automatic path fails):
// discover candidates -> select -> resolve -> attribute / materialize ->
// use claimed position -> place -> register in the World runtime. Each stage
// reads only the previous stage's result (resolution uses the candidate
// object, attribution and materialization use the resolver's verified result,
// never the candidate's self-declared hash), and clearing a result clears
// everything computed from it. Candidates and lists are shown verbatim, with no
// ranking, dedup or "trusted" label. Attribution is identity correspondence
// between hashes, never authorship.
//
// Commentary and placements are loaded on mount and on publication change,
// never polled. A failed read keeps the current list and only sets the error,
// so "none" and "failed" stay distinguishable. Authorship is never supplied by
// the UI.

export default {
    name: 'OwnPublicationPanel',
    components: { WorldDistributionDialog, PublicationCommentaryRemoteCheck },
    props: {
        // Supplied by the host view; null when the active document is unpublished.
        publication: {
            type: Object,
            default: null
        },
        // `(publication) -> boolean`. Synchronous: unpublishing does no network I/O.
        unpublishCommand: {
            type: Function,
            default: null
        },
        // `(publication, storage) -> Promise<{ contentReference, announcement }>`.
        snapshotDistributionCommand: {
            type: Function,
            default: null
        },
        // Registered Snapshot distribution backends ('ipfs'/'ar'). Empty means no
        // picker, and distributeOwnSnapshot() uses 'ar'.
        snapshotDistributionStorageTypes: {
            type: Array,
            default: () => []
        },
        // Seeds distributionStorage's initial choice only.
        defaultContentDistributionProvider: {
            type: String,
            default: null
        },
        // The saved Announcement/Discovery preference; seeds the shared substrate
        // choice once and never overrides a pick.
        defaultDiscoveryDistributionProvider: {
            type: String,
            default: 'nostr'
        },
        // `(publication) -> Promise<PublicationDistributionResult | null>`.
        publicationDistributionCommand: {
            type: Function,
            default: null
        },
        // `(publication) -> Promise<{ outcome, bytes, candidates, locator, storage, reason }>`.
        discoverSnapshotCommand: {
            type: Function,
            default: null
        },
        // `(publication) -> Promise<PublicationSnapshotTransferPackage>`.
        exportSnapshotCommand: {
            type: Function,
            default: null
        },
        // `() -> Promise<candidate[]>`; takes no publication.
        discoverSnapshotCandidatesCommand: {
            type: Function,
            default: null
        },
        // `() -> Promise<{ outcome, candidates }>`. Preferred when supplied, so an
        // unavailable search is not reported as "nothing announced".
        discoverSnapshotCandidatesWithOutcomeCommand: {
            type: Function,
            default: null
        },
        // `(candidate) -> Promise<resolution>`; takes the candidate object, never a bare
        // contentHash.
        resolveSelectedSnapshotCommand: {
            type: Function,
            default: null
        },
        // `(resolution) -> Promise<materialization>`; takes the verified resolution
        // result.
        materializeSelectedSnapshotCommand: {
            type: Function,
            default: null
        },
        // The active document's single placement, or null. A data prop.
        placementInfo: {
            type: Object,
            default: null
        },
        // The app-wide WorldDiscoverySourceRegistry (a collaborator, not a command).
        worldDiscoverySourceRegistry: {
            type: Object,
            default: null
        },
        // `(publicationId) -> PublicationCommentary[]`. Synchronous.
        getPublicationCommentariesCommand: {
            type: Function,
            default: null
        },
        // `({ publicationId, content }) -> { commentary, isNew }`. Synchronous. Never
        // takes an author: the use case resolves it.
        addPublicationCommentaryCommand: {
            type: Function,
            default: null
        },
        // Only decides whether to show the compose form or a sign-in hint.
        viewerIdentityId: {
            type: String,
            default: null
        },
        // `(publicationId) -> PlacementInfo[]`: every placement of the Publication,
        // called fresh, never derived from `placementInfo`.
        getPublicationPlacementsCommand: {
            type: Function,
            default: null
        },
        // `(publication) -> WorldPlacement`. Synchronous.
        placePublicationCommand: {
            type: Function,
            default: null
        }
    },
    data() {
        return {
            // Visibility only; never touches pipeline state.
            diagnosticToolsOpen: false,
            snapshotDistributionExecuting: false,
            snapshotDistributionError: null,
            snapshotDistributionResult: null,
            snapshotDistributionRequestId: 0,
            // One substrate choice shared by both distribution actions. Page-local.
            distributionDiscoveryProvider: this.defaultDiscoveryDistributionProvider || 'nostr',
            // null until a storage is picked; the computed supplies the default.
            distributionStorageChoice: null,
            // Shared by both actions; never persisted.
            remotePinningDraft: { endpoint: '', credential: '', requestField: '', responseField: '' },
            publicationDistributionExecuting: false,
            publicationDistributionError: null,
            publicationDistributionResult: null,
            publicationDistributionRequestId: 0,
            distributionDialogOpen: false,
            snapshotDiscoveryExecuting: false,
            snapshotDiscoveryError: null,
            snapshotDiscoveryResult: null,
            snapshotDiscoveryRequestId: 0,
            snapshotExportExecuting: false,
            snapshotExportError: null,
            snapshotExportResult: null,
            snapshotExportRequestId: 0,
            snapshotAttributionResult: null,
            snapshotCandidateDiscoveryExecuting: false,
            snapshotCandidateDiscoveryError: null,
            // [] (nothing announced) is a real result, distinct from null (not run).
            snapshotCandidateDiscoveryResult: null,
            snapshotCandidateDiscoveryRequestId: 0,
            // found/empty/unavailable; stays null with the legacy command.
            snapshotCandidateDiscoveryOutcome: null,
            selectedSnapshotCandidate: null,
            selectedSnapshotResolutionExecuting: false,
            selectedSnapshotResolutionError: null,
            selectedSnapshotResolutionResult: null,
            selectedSnapshotResolutionRequestId: 0,
            selectedSnapshotAttributionResult: null,
            selectedSnapshotMaterializationExecuting: false,
            selectedSnapshotMaterializationError: null,
            selectedSnapshotMaterializationResult: null,
            selectedSnapshotMaterializationRequestId: 0,
            selectedSnapshotWorldPlacementResult: null,
            selectedSnapshotWorldRegistrationResult: null,
            selectedSnapshotWorldPositionClaimResult: null,
            // In the order returned (never re-sorted); [] is a real result.
            publicationCommentaries: [],
            // Cleared only on success, so a failed submit never loses the text.
            newCommentaryText: '',
            // Guards against double-submit.
            publicationCommentarySubmitting: false,
            // A failed refresh sets only this, keeping the displayed list.
            publicationCommentaryError: null,
            // `{ content, commentaryId, createdAt }` of the current attempt. Retrying the
            // same text reuses the id so the store's idempotent retry applies; editing
            // mints a new one.
            pendingCommentaryDraft: null,
            // PLACEMENT RECORDS, NEVER WORLD VISIBILITY OR OCCUPANCY: whether it has been
            // placed, not whether anyone can see it or something occupies the spot. In
            // the order returned, never sorted, deduplicated or reduced; [] is a real
            // result.
            publicationPlacements: [],
            // NO_PLACEMENTS ≠ DISCOVERY_FAILED: a failed refresh sets only this, so []
            // with no error stays distinct from a failed read.
            publicationPlacementsError: null
        };
    },
    computed: {
        // The shared Storage choice for both actions. With Snapshot distribution
        // available the options are its registered backends plus 'remote-pinning'
        // (which never has its own registry key), otherwise all three Material
        // storages. The saved Content preference wins when eligible, then the first
        // registered backend, then 'ar'.
        distributionStorage: {
            get() {
                const eligible = this.snapshotDistributionCommand
                    ? [...this.snapshotDistributionStorageTypes, 'remote-pinning']
                    : ['ar', 'ipfs', 'remote-pinning'];
                return this.distributionStorageChoice
                    || resolveSavedProviderDefault(this.defaultContentDistributionProvider, eligible, null)
                    || (this.snapshotDistributionCommand ? this.snapshotDistributionStorageTypes[0] : null)
                    || 'ar';
            },
            set(value) {
                this.distributionStorageChoice = value;
            }
        }
    },
    watch: {
        // A different Publication resets every family below: in-flight calls, errors
        // and results all belonged to the previous one.
        publication(next, prev) {
            const nextId = next ? next.id : null;
            const prevId = prev ? prev.id : null;
            if (nextId === prevId) {
                return;
            }
            this.snapshotDistributionExecuting = false;
            this.snapshotDistributionError = null;
            this.snapshotDistributionResult = null;
            this.snapshotDistributionRequestId += 1;
            this.publicationDistributionExecuting = false;
            this.publicationDistributionError = null;
            this.publicationDistributionResult = null;
            this.publicationDistributionRequestId += 1;
            this.distributionDialogOpen = false;
            this.snapshotDiscoveryExecuting = false;
            this.snapshotDiscoveryError = null;
            this.snapshotDiscoveryResult = null;
            this.snapshotDiscoveryRequestId += 1;
            this.snapshotExportExecuting = false;
            this.snapshotExportError = null;
            this.snapshotExportResult = null;
            this.snapshotExportRequestId += 1;
            this.snapshotAttributionResult = null;
            this.snapshotCandidateDiscoveryExecuting = false;
            this.snapshotCandidateDiscoveryError = null;
            this.snapshotCandidateDiscoveryResult = null;
            this.snapshotCandidateDiscoveryOutcome = null;
            this.snapshotCandidateDiscoveryRequestId += 1;
            this.selectedSnapshotCandidate = null;
            this.selectedSnapshotResolutionExecuting = false;
            this.selectedSnapshotResolutionError = null;
            this.selectedSnapshotResolutionResult = null;
            this.selectedSnapshotResolutionRequestId += 1;
            this.selectedSnapshotAttributionResult = null;
            this.selectedSnapshotMaterializationExecuting = false;
            this.selectedSnapshotMaterializationError = null;
            this.selectedSnapshotMaterializationResult = null;
            this.selectedSnapshotMaterializationRequestId += 1;
            this.selectedSnapshotWorldPlacementResult = null;
            this.selectedSnapshotWorldRegistrationResult = null;
            this.selectedSnapshotWorldPositionClaimResult = null;
            this.publicationCommentaries = [];
            this.newCommentaryText = '';
            this.publicationCommentarySubmitting = false;
            this.publicationCommentaryError = null;
            this.pendingCommentaryDraft = null;
            this.publicationPlacements = [];
            this.publicationPlacementsError = null;
            // Test contexts for other families call this watcher without these methods.
            if (typeof this.refreshPublicationCommentaries === 'function') {
                this.refreshPublicationCommentaries();
            }
            if (typeof this.refreshPublicationPlacements === 'function') {
                this.refreshPublicationPlacements();
            }
        }
    },
    mounted() {
        // Watchers only fire on later changes, so load once on mount.
        this.refreshPublicationCommentaries();
        this.refreshPublicationPlacements();
    },
    beforeUnmount() {
        // Invalidate in-flight calls.
        this.snapshotDistributionRequestId += 1;
        this.publicationDistributionRequestId += 1;
        this.snapshotDiscoveryRequestId += 1;
        this.snapshotExportRequestId += 1;
        this.snapshotCandidateDiscoveryRequestId += 1;
        this.selectedSnapshotResolutionRequestId += 1;
        this.selectedSnapshotMaterializationRequestId += 1;
    },
    methods: {
        // Called on mount, on publication change and after a successful submit, never
        // on a timer. Keeps the returned order.
        refreshPublicationCommentaries() {
            const publication = this.publication;
            if (!publication || !this.getPublicationCommentariesCommand) {
                this.publicationCommentaries = [];
                this.publicationCommentaryError = null;
                return;
            }
            try {
                const commentaries = this.getPublicationCommentariesCommand(publication.id);
                this.publicationCommentaries = Array.isArray(commentaries) ? commentaries : [];
                this.publicationCommentaryError = null;
            } catch (error) {
                this.publicationCommentaryError = 'Commentary could not be loaded.';
            }
        },
        // Sends only { publicationId, content }. On success, clears the draft and
        // re-reads (one source of truth) instead of appending. On failure, keeps the
        // text and the list. A retry of unchanged text reuses the same
        // commentaryId/createdAt, so it lands on the store's idempotent no-op instead
        // of creating a duplicate.
        submitPublicationCommentary() {
            const publication = this.publication;
            const content = this.newCommentaryText.trim();
            if (!publication || !this.addPublicationCommentaryCommand || !content || this.publicationCommentarySubmitting) {
                return;
            }
            if (!this.pendingCommentaryDraft || this.pendingCommentaryDraft.content !== content) {
                this.pendingCommentaryDraft = { content, commentaryId: createId(), createdAt: new Date() };
            }
            const { commentaryId, createdAt } = this.pendingCommentaryDraft;
            this.publicationCommentarySubmitting = true;
            try {
                this.addPublicationCommentaryCommand({ publicationId: publication.id, content, commentaryId, createdAt });
                this.newCommentaryText = '';
                this.publicationCommentaryError = null;
                this.pendingCommentaryDraft = null;
                this.refreshPublicationCommentaries();
            } catch (error) {
                this.publicationCommentaryError = (error && error.message) ? error.message : 'Commentary could not be created.';
            } finally {
                this.publicationCommentarySubmitting = false;
            }
        },
        // Same shape as refreshPublicationCommentaries(). A failed read keeps the list
        // and only sets the error.
        refreshPublicationPlacements() {
            const publication = this.publication;
            if (!publication || !this.getPublicationPlacementsCommand) {
                this.publicationPlacements = [];
                this.publicationPlacementsError = null;
                return;
            }
            try {
                const placements = this.getPublicationPlacementsCommand(publication.id);
                this.publicationPlacements = Array.isArray(placements) ? placements : [];
                this.publicationPlacementsError = null;
            } catch (error) {
                this.publicationPlacementsError = 'Placements could not be loaded.';
            }
        },
        ...publicationActionMethods,
        ...snapshotDiagnosticMethods
    },
    template: `
        <div v-if="snapshotDistributionCommand" class="own-publication-panel">
            <h4 class="own-publication-panel-title">My Publication</h4>

            <dl v-if="publication" class="own-publication-detail">
                <dt>Title</dt>
                <dd>{{ publication.title || 'Untitled' }}</dd>
                <dt>Author</dt>
                <dd>{{ publication.author || 'anonymous' }}</dd>
            </dl>
            <p v-else class="own-publication-empty-hint">
                Publish your current World to distribute its Snapshot.
            </p>

            ${placementsSectionTemplate}

            ${publicationActionsSectionTemplate}

            ${diagnosticToolsSectionTemplate}

            ${commentarySectionTemplate}
        </div>
    `
};
