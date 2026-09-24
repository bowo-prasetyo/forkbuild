import WorldDistributionDialog from './WorldDistributionDialog.js';
import PublicationCommentaryRemoteCheck from './PublicationCommentaryRemoteCheck.js';
import { resolveSnapshotPublicationAttribution } from '../../application/snapshot/SnapshotPublicationAttribution.js';
import { describeSnapshotResolutionOutcomeLabel, describeSnapshotAttributionOutcomeLabel } from '../../application/snapshot/SnapshotOutcomeInspectionView.js';
import { resolveSnapshotWorldPlacement } from '../../application/snapshot/placement/SnapshotWorldPlacement.js';
import { registerMaterializedSnapshotWorldSource } from '../../application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js';
import { resolveSnapshotWorldPositionClaim } from '../../application/snapshot/placement/SnapshotWorldPositionClaim.js';
import { SnapshotWorldPositionClaimOutcome } from '../../application/snapshot/placement/SnapshotWorldPositionClaimOutcome.js';
import { createId } from '../../core/createId.js';
import { sanitizeDistributionErrorMessage } from '../../application/publication/distribution/DistributionErrorMessageSanitizer.js';
import { resolveSavedProviderDefault } from '../../application/settings/SavedProviderDefaultChoice.js';

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

// The Nostr path resolves an array (one per relay) and Arweave a single
// result; normalize to an array, as EditorView does.
function normalizeDistributionResultForDisplay(result) {
    if (Array.isArray(result)) {
        return result;
    }
    return result ? [result] : null;
}

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
        // Synchronous. Success shows up as the `publication` prop becoming null.
        unpublishOwnPublication() {
            const publication = this.publication;
            if (!publication || !this.unpublishCommand) {
                return;
            }
            this.unpublishCommand(publication);
        },
        // Synchronous; re-reads the placement list afterwards.
        placeOwnPublication() {
            const publication = this.publication;
            if (!publication || !this.placePublicationCommand) {
                return;
            }
            this.placePublicationCommand(publication);
            if (typeof this.refreshPublicationPlacements === 'function') {
                this.refreshPublicationPlacements();
            }
        },
        // No-op without a publication or command, or while busy.
        distributeOwnSnapshot() {
            const publication = this.publication;
            if (!publication || !this.snapshotDistributionCommand || this.snapshotDistributionExecuting) {
                return;
            }

            this.snapshotDistributionExecuting = true;
            this.snapshotDistributionError = null;
            this.snapshotDistributionRequestId += 1;
            const requestId = this.snapshotDistributionRequestId;

            const storage = this.distributionStorage;
            const remotePinningConfiguration = storage === 'remote-pinning' ? {
                endpoint: this.remotePinningDraft.endpoint,
                credential: this.remotePinningDraft.credential || null,
                requestField: this.remotePinningDraft.requestField || null,
                responseField: this.remotePinningDraft.responseField || null
            } : undefined;

            return Promise.resolve()
                .then(() => this.snapshotDistributionCommand(publication, storage, remotePinningConfiguration, this.distributionDiscoveryProvider))
                .then((result) => {
                    if (requestId === this.snapshotDistributionRequestId) {
                        this.snapshotDistributionResult = result;
                    }
                })
                .catch((error) => {
                    if (requestId === this.snapshotDistributionRequestId) {
                        console.error('Snapshot distribution failed:', error);
                        this.snapshotDistributionError = sanitizeDistributionErrorMessage(error)
                            || 'Snapshot distribution could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.snapshotDistributionRequestId) {
                        this.snapshotDistributionExecuting = false;
                    }
                });
        },
        distributeOwnPublication() {
            const publication = this.publication;
            if (!publication || !this.publicationDistributionCommand || this.publicationDistributionExecuting) {
                return;
            }

            this.publicationDistributionExecuting = true;
            this.publicationDistributionError = null;
            this.publicationDistributionRequestId += 1;
            const requestId = this.publicationDistributionRequestId;

            return Promise.resolve()
                .then(() => this.publicationDistributionCommand(
                    publication,
                    this.distributionDiscoveryProvider,
                    this.distributionStorage,
                    this.distributionStorage === 'remote-pinning' ? this.remotePinningDraft : undefined
                ))
                .then((result) => {
                    if (requestId === this.publicationDistributionRequestId) {
                        this.publicationDistributionResult = normalizeDistributionResultForDisplay(result);
                    }
                })
                .catch((error) => {
                    if (requestId === this.publicationDistributionRequestId) {
                        console.error('Publication distribution failed:', error);
                        this.publicationDistributionError = sanitizeDistributionErrorMessage(error)
                            || 'Publication distribution could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.publicationDistributionRequestId) {
                        this.publicationDistributionExecuting = false;
                    }
                });
        },
        // Runs both actions from one click, each with its own state. Sequential, never
        // concurrent: both may sign through the same extension, and two simultaneous
        // requests can silently hang it.
        distributeOwnPublicationAndSnapshot() {
            return Promise.resolve(this.distributeOwnSnapshot())
                .then(() => this.distributeOwnPublication());
        },
        discoverOwnSnapshot() {
            const publication = this.publication;
            if (!publication || !this.discoverSnapshotCommand || this.snapshotDiscoveryExecuting) {
                return;
            }

            this.snapshotDiscoveryExecuting = true;
            this.snapshotDiscoveryError = null;
            this.snapshotDiscoveryRequestId += 1;
            const requestId = this.snapshotDiscoveryRequestId;

            Promise.resolve()
                .then(() => this.discoverSnapshotCommand(publication))
                .then((result) => {
                    if (requestId === this.snapshotDiscoveryRequestId) {
                        this.snapshotDiscoveryResult = result;
                        // Computed immediately after a successful discovery, under the same request id.
                        this.snapshotAttributionResult = resolveSnapshotPublicationAttribution(publication, result);
                    }
                })
                .catch((error) => {
                    if (requestId === this.snapshotDiscoveryRequestId) {
                        console.error('Snapshot discovery failed:', error);
                        this.snapshotDiscoveryError = sanitizeDistributionErrorMessage(error)
                            || 'Snapshot discovery could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.snapshotDiscoveryRequestId) {
                        this.snapshotDiscoveryExecuting = false;
                    }
                });
        },
        exportOwnSnapshot() {
            const publication = this.publication;
            if (!publication || !this.exportSnapshotCommand || this.snapshotExportExecuting) {
                return;
            }

            this.snapshotExportExecuting = true;
            this.snapshotExportError = null;
            this.snapshotExportRequestId += 1;
            const requestId = this.snapshotExportRequestId;

            Promise.resolve()
                .then(() => this.exportSnapshotCommand(publication))
                .then((result) => {
                    if (requestId === this.snapshotExportRequestId) {
                        this.snapshotExportResult = result;
                    }
                })
                .catch((error) => {
                    if (requestId === this.snapshotExportRequestId) {
                        console.error('Snapshot export failed:', error);
                        this.snapshotExportError = sanitizeDistributionErrorMessage(error)
                            || 'Snapshot export could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.snapshotExportRequestId) {
                        this.snapshotExportExecuting = false;
                    }
                });
        },
        // Needs no publication. Prefers the outcome-aware command; with only the legacy
        // one, the outcome stays null.
        discoverSnapshotCandidates() {
            if ((!this.discoverSnapshotCandidatesCommand && !this.discoverSnapshotCandidatesWithOutcomeCommand) || this.snapshotCandidateDiscoveryExecuting) {
                return;
            }

            const withOutcome = Boolean(this.discoverSnapshotCandidatesWithOutcomeCommand);

            this.snapshotCandidateDiscoveryExecuting = true;
            this.snapshotCandidateDiscoveryError = null;
            this.snapshotCandidateDiscoveryRequestId += 1;
            const requestId = this.snapshotCandidateDiscoveryRequestId;

            Promise.resolve()
                .then(() => (withOutcome ? this.discoverSnapshotCandidatesWithOutcomeCommand() : this.discoverSnapshotCandidatesCommand()))
                .then((result) => {
                    if (requestId === this.snapshotCandidateDiscoveryRequestId) {
                        this.snapshotCandidateDiscoveryResult = withOutcome ? result.candidates : result;
                        this.snapshotCandidateDiscoveryOutcome = withOutcome ? result.outcome : null;
                    }
                })
                .catch((error) => {
                    if (requestId === this.snapshotCandidateDiscoveryRequestId) {
                        console.error('Snapshot candidate discovery failed:', error);
                        this.snapshotCandidateDiscoveryError = sanitizeDistributionErrorMessage(error)
                            || 'Snapshot candidate discovery could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.snapshotCandidateDiscoveryRequestId) {
                        this.snapshotCandidateDiscoveryExecuting = false;
                    }
                });
        },
        // Selection is a plain assignment. Changing it clears the resolution and
        // everything computed from it.
        selectSnapshotCandidate(candidate) {
            if (candidate === this.selectedSnapshotCandidate) {
                return;
            }
            this.selectedSnapshotCandidate = candidate;
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
        },
        resolveSelectedSnapshot() {
            const candidate = this.selectedSnapshotCandidate;
            if (!candidate || !this.resolveSelectedSnapshotCommand || this.selectedSnapshotResolutionExecuting) {
                return;
            }

            this.selectedSnapshotResolutionExecuting = true;
            this.selectedSnapshotResolutionError = null;
            this.selectedSnapshotResolutionRequestId += 1;
            // A new resolution replaces the old one, so clear what was computed from it.
            this.selectedSnapshotAttributionResult = null;
            this.selectedSnapshotMaterializationExecuting = false;
            this.selectedSnapshotMaterializationError = null;
            this.selectedSnapshotMaterializationResult = null;
            this.selectedSnapshotMaterializationRequestId += 1;
            this.selectedSnapshotWorldPlacementResult = null;
            this.selectedSnapshotWorldRegistrationResult = null;
            const requestId = this.selectedSnapshotResolutionRequestId;

            Promise.resolve()
                .then(() => this.resolveSelectedSnapshotCommand(candidate))
                .then((result) => {
                    if (requestId === this.selectedSnapshotResolutionRequestId) {
                        this.selectedSnapshotResolutionResult = result;
                    }
                })
                .catch((error) => {
                    if (requestId === this.selectedSnapshotResolutionRequestId) {
                        console.error('Selected Snapshot resolution failed:', error);
                        this.selectedSnapshotResolutionError = sanitizeDistributionErrorMessage(error)
                            || 'Selected Snapshot resolution could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.selectedSnapshotResolutionRequestId) {
                        this.selectedSnapshotResolutionExecuting = false;
                    }
                });
        },
        // Synchronous. Reads the resolver's verified result, never the candidate's own
        // contentHash.
        attributeSelectedSnapshot() {
            const publication = this.publication;
            const resolution = this.selectedSnapshotResolutionResult;
            if (!publication || !publication.contentReference || !resolution) {
                return;
            }
            this.selectedSnapshotAttributionResult = resolveSnapshotPublicationAttribution(publication, resolution);
        },
        // Needs no publication: materialization never touches it.
        materializeSelectedSnapshot() {
            const resolution = this.selectedSnapshotResolutionResult;
            if (!resolution || !this.materializeSelectedSnapshotCommand || this.selectedSnapshotMaterializationExecuting) {
                return;
            }

            this.selectedSnapshotMaterializationExecuting = true;
            this.selectedSnapshotMaterializationError = null;
            this.selectedSnapshotMaterializationRequestId += 1;
            this.selectedSnapshotWorldPlacementResult = null;
            this.selectedSnapshotWorldRegistrationResult = null;
            const requestId = this.selectedSnapshotMaterializationRequestId;

            Promise.resolve()
                .then(() => this.materializeSelectedSnapshotCommand(resolution))
                .then((result) => {
                    if (requestId === this.selectedSnapshotMaterializationRequestId) {
                        this.selectedSnapshotMaterializationResult = result;
                    }
                })
                .catch((error) => {
                    if (requestId === this.selectedSnapshotMaterializationRequestId) {
                        console.error('Selected Snapshot materialization failed:', error);
                        this.selectedSnapshotMaterializationError = sanitizeDistributionErrorMessage(error)
                            || 'Selected Snapshot materialization could not be completed.';
                    }
                })
                .then(() => {
                    if (requestId === this.selectedSnapshotMaterializationRequestId) {
                        this.selectedSnapshotMaterializationExecuting = false;
                    }
                });
        },
        // Synchronous. A separate explicit click; checks candidate.publicationId ===
        // publication.id.
        useClaimedSnapshotPosition() {
            const candidate = this.selectedSnapshotCandidate;
            const publication = this.publication;
            if (!candidate || !publication) {
                return;
            }
            this.selectedSnapshotWorldPlacementResult = null;
            this.selectedSnapshotWorldRegistrationResult = null;
            this.selectedSnapshotWorldPositionClaimResult = resolveSnapshotWorldPositionClaim(candidate, publication.id);
        },
        // Uses the consumed claim's position when its outcome is CLAIMED, otherwise the
        // local placementInfo.
        placeMaterializedSnapshot() {
            const materialization = this.selectedSnapshotMaterializationResult;
            if (!materialization) {
                return;
            }
            this.selectedSnapshotWorldRegistrationResult = null;

            const claim = this.selectedSnapshotWorldPositionClaimResult;
            const effectivePlacementInfo = (claim && claim.outcome === SnapshotWorldPositionClaimOutcome.CLAIMED && this.publication)
                ? Object.freeze({
                    placementId: `claim:${materialization.contentHash}:${this.publication.id}`,
                    publicationId: this.publication.id,
                    position: claim.position
                })
                : this.placementInfo;
            this.selectedSnapshotWorldPlacementResult = resolveSnapshotWorldPlacement(materialization, effectivePlacementInfo);
        },
        registerMaterializedSnapshot() {
            const placement = this.selectedSnapshotWorldPlacementResult;
            if (!placement || !this.worldDiscoverySourceRegistry) {
                return;
            }
            this.selectedSnapshotWorldRegistrationResult = registerMaterializedSnapshotWorldSource(this.worldDiscoverySourceRegistry, placement, this.publication);
        },
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
        // The template is a runtime-compiled string, so imported functions need these
        // wrappers to be callable from `{{ }}`.
        describeSnapshotResolutionLabel(outcome) {
            return describeSnapshotResolutionOutcomeLabel(outcome);
        },
        describeSnapshotAttributionLabel(outcome) {
            return describeSnapshotAttributionOutcomeLabel(outcome);
        }
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

            <!--
                Read-only list of every placement (per-placement actions live in
                PlacementInfoPanel).
            -->
            <div v-if="getPublicationPlacementsCommand" class="own-publication-placements">
                <h5 class="own-publication-placements-title">Placements ({{ publicationPlacements.length }})</h5>

                <p v-if="publicationPlacementsError" class="own-publication-placements-error">{{ publicationPlacementsError }}</p>

                <p v-else-if="!publicationPlacements.length" class="own-publication-placements-empty">
                    This Publication has not been placed anywhere yet.
                </p>
                <ul v-else class="own-publication-placements-list">
                    <li
                        v-for="placement in publicationPlacements"
                        :key="placement.placementId"
                        class="own-publication-placement-entry"
                    >
                        <dl class="own-publication-placement-detail">
                            <dt>Position</dt>
                            <dd>{{ placement.position.x.toFixed(1) }}, {{ placement.position.y.toFixed(1) }}, {{ placement.position.z.toFixed(1) }}</dd>
                            <dt>Revision</dt>
                            <dd>{{ placement.revision }}</dd>
                            <dt v-if="placement.owner">Owner</dt>
                            <dd v-if="placement.owner">{{ placement.owner }}</dd>
                        </dl>
                    </li>
                </ul>

                <!--
                    Always enabled with a publication: a Publication can be placed any number of
                    times.
                -->
                <button
                    v-if="placePublicationCommand"
                    type="button"
                    class="action-btn own-publication-place-action"
                    :disabled="!publication"
                    @click="placeOwnPublication"
                >Place</button>
            </div>

            <!--
                Retracts the Publication from the catalog only; never a placement, the
                Document or distributed material.
            -->
            <button
                v-if="unpublishCommand"
                type="button"
                class="action-btn own-publication-unpublish-action"
                :disabled="!publication"
                @click="unpublishOwnPublication"
            >Unpublish</button>

            <!-- Opens WorldDistributionDialog, which holds every storage/substrate choice. -->
            <button
                v-if="snapshotDistributionCommand || publicationDistributionCommand"
                type="button"
                class="action-btn own-publication-distribution-trigger-action"
                :disabled="!publication"
                @click="distributionDialogOpen = true"
            >Distribute</button>

            <WorldDistributionDialog
                v-if="distributionDialogOpen"
                :can-distribute-publication="Boolean(publicationDistributionCommand)"
                :can-distribute-snapshot="Boolean(snapshotDistributionCommand)"
                :has-subject="Boolean(publication)"
                :distribution-executing="publicationDistributionExecuting"
                :distribution-error="publicationDistributionError"
                :distribution-result="publicationDistributionResult"
                v-model:storage="distributionStorage"
                v-model:discovery-provider="distributionDiscoveryProvider"
                :remote-pinning-draft="remotePinningDraft"
                :snapshot-distribution-storage-types="snapshotDistributionStorageTypes"
                :snapshot-distribution-executing="snapshotDistributionExecuting"
                :snapshot-distribution-error="snapshotDistributionError"
                :snapshot-distribution-result="snapshotDistributionResult"
                @close="distributionDialogOpen = false"
                @distribute-both="distributeOwnPublicationAndSnapshot"
                @distribute-publication="distributeOwnPublication"
                @distribute-snapshot="distributeOwnSnapshot"
            />

            <!-- Shows the exported package's identity facts only. Deliberately no file save, download, or copy-to-clipboard. -->
            <button
                v-if="exportSnapshotCommand"
                type="button"
                class="action-btn own-publication-export-action"
                :disabled="!publication || snapshotExportExecuting"
                @click="exportOwnSnapshot"
            >{{ snapshotExportExecuting ? 'Exporting…' : 'Export Snapshot' }}</button>

            <p v-if="snapshotExportError" class="own-publication-export-error">{{ snapshotExportError }}</p>
            <dl v-else-if="snapshotExportResult" class="own-publication-export-detail">
                <dt>Publication</dt>
                <dd>{{ snapshotExportResult.publicationId }}</dd>
                <dt>Content hash</dt>
                <dd>{{ snapshotExportResult.contentHash }}</dd>
            </dl>

            <!-- Checks whether this Publication's own contentHash resolves. -->
            <button
                v-if="discoverSnapshotCommand"
                type="button"
                class="action-btn own-publication-discovery-action"
                :disabled="!publication || !publication.contentReference || snapshotDiscoveryExecuting"
                @click="discoverOwnSnapshot"
            >{{ snapshotDiscoveryExecuting ? 'Checking…' : 'Check Snapshot Match' }}</button>

            <p v-if="snapshotDiscoveryError" class="own-publication-discovery-error">{{ snapshotDiscoveryError }}</p>
            <dl v-else-if="snapshotDiscoveryResult" class="own-publication-discovery-detail">
                <dt>Outcome</dt>
                <dd>{{ describeSnapshotResolutionLabel(snapshotDiscoveryResult.outcome) }}</dd>
                <template v-if="snapshotDiscoveryResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ snapshotDiscoveryResult.reason }}</dd>
                </template>
                <template v-if="snapshotDiscoveryResult.locator">
                    <dt>Locator</dt>
                    <dd>{{ snapshotDiscoveryResult.locator }}</dd>
                </template>
            </dl>

            <!-- "Confirmed to match" means two hashes correspond, never authorship or trust. -->
            <dl v-if="snapshotAttributionResult" class="own-publication-attribution-detail">
                <dt>Snapshot Attribution</dt>
                <dd>{{ describeSnapshotAttributionLabel(snapshotAttributionResult.outcome) }}</dd>
            </dl>

            <!--
                Groups the manual diagnostic pipeline in a popup. Presentation only: closing
                and reopening shows the same state.
            -->
            <button
                v-if="discoverSnapshotCandidatesCommand || resolveSelectedSnapshotCommand || materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-diagnostic-trigger"
                @click="diagnosticToolsOpen = true"
            >Diagnostic Tools</button>

            <div
                v-if="diagnosticToolsOpen"
                class="modal-overlay own-publication-diagnostic-overlay"
                @click.self="diagnosticToolsOpen = false"
            >
                <div class="modal-panel own-publication-diagnostic-panel">
                    <h3>Diagnostic Tools</h3>
                    <p class="own-publication-diagnostic-intro">
                        Use these tools to manually inspect or recover decentralized content
                        when automatic discovery or placement does not produce the expected
                        result.
                    </p>

                    <h4 class="own-publication-diagnostic-section-title">Snapshots</h4>

            <!-- Needs no Publication; disabled only while busy. -->
            <button
                v-if="discoverSnapshotCandidatesCommand || discoverSnapshotCandidatesWithOutcomeCommand"
                type="button"
                class="action-btn own-publication-candidate-discovery-action"
                :disabled="snapshotCandidateDiscoveryExecuting"
                @click="discoverSnapshotCandidates"
            >{{ snapshotCandidateDiscoveryExecuting ? 'Discovering…' : 'Discover Snapshots' }}</button>

            <p v-if="snapshotCandidateDiscoveryError" class="own-publication-candidate-discovery-error">{{ snapshotCandidateDiscoveryError }}</p>

            <!--
                [] is a real result. 'unavailable' says the search could not complete rather
                than claiming nothing was announced. Shown in discovery order, unranked.
            -->
            <div v-else-if="snapshotCandidateDiscoveryResult" class="own-publication-candidate-list">
                <h5 class="own-publication-candidate-list-title">Discovered Snapshots</h5>
                <p v-if="snapshotCandidateDiscoveryResult.length === 0 && snapshotCandidateDiscoveryOutcome === 'unavailable'" class="own-publication-candidate-list-unavailable">
                    Snapshot discovery is currently unavailable.
                </p>
                <p v-else-if="snapshotCandidateDiscoveryResult.length === 0" class="own-publication-candidate-list-empty">
                    No Snapshots have been announced under this discoveryTag yet.
                </p>
                <ul v-else class="own-publication-candidate-list-items">
                    <li
                        v-for="(candidate, index) in snapshotCandidateDiscoveryResult"
                        :key="index"
                        class="own-publication-candidate-item"
                        :class="{ 'own-publication-candidate-item-selected': candidate === selectedSnapshotCandidate }"
                        @click="selectSnapshotCandidate(candidate)"
                    >
                        <dl class="own-publication-candidate-detail">
                            <dt>Storage</dt>
                            <dd>{{ candidate.storage }}</dd>
                            <dt>Content hash</dt>
                            <dd>{{ candidate.contentHash }}</dd>
                            <dt>Locator</dt>
                            <dd>{{ candidate.locator }}</dd>
                        </dl>
                    </li>
                </ul>
            </div>

            <button
                v-if="resolveSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-resolution-action"
                :disabled="!selectedSnapshotCandidate || selectedSnapshotResolutionExecuting"
                @click="resolveSelectedSnapshot"
            >{{ selectedSnapshotResolutionExecuting ? 'Resolving…' : 'Resolve Selected Snapshot' }}</button>

            <p v-if="selectedSnapshotResolutionError" class="own-publication-selected-resolution-error">{{ selectedSnapshotResolutionError }}</p>
            <dl v-else-if="selectedSnapshotResolutionResult" class="own-publication-selected-resolution-detail">
                <dt>Selected Snapshot Resolution</dt>
                <dd>{{ describeSnapshotResolutionLabel(selectedSnapshotResolutionResult.outcome) }}</dd>
                <template v-if="selectedSnapshotResolutionResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotResolutionResult.reason }}</dd>
                </template>
                <template v-if="selectedSnapshotResolutionResult.locator">
                    <dt>Locator</dt>
                    <dd>{{ selectedSnapshotResolutionResult.locator }}</dd>
                </template>
            </dl>

            <button
                v-if="resolveSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-attribution-action"
                :disabled="!publication || !publication.contentReference || !selectedSnapshotResolutionResult"
                @click="attributeSelectedSnapshot"
            >Attribute Selected Snapshot</button>

            <dl v-if="selectedSnapshotAttributionResult" class="own-publication-selected-attribution-detail">
                <dt>Selected Snapshot Attribution</dt>
                <dd>{{ describeSnapshotAttributionLabel(selectedSnapshotAttributionResult.outcome) }}</dd>
                <template v-if="selectedSnapshotAttributionResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotAttributionResult.reason }}</dd>
                </template>
            </dl>

            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-materialization-action"
                :disabled="!selectedSnapshotResolutionResult || selectedSnapshotMaterializationExecuting"
                @click="materializeSelectedSnapshot"
            >{{ selectedSnapshotMaterializationExecuting ? 'Materializing…' : 'Materialize Selected Snapshot' }}</button>

            <p v-if="selectedSnapshotMaterializationError" class="own-publication-selected-materialization-error">{{ selectedSnapshotMaterializationError }}</p>
            <dl v-else-if="selectedSnapshotMaterializationResult" class="own-publication-selected-materialization-detail">
                <dt>Selected Snapshot Materialization</dt>
                <dd>{{ selectedSnapshotMaterializationResult.outcome }}</dd>
                <template v-if="selectedSnapshotMaterializationResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotMaterializationResult.reason }}</dd>
                </template>
            </dl>

            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-world-position-claim-action"
                :disabled="!selectedSnapshotCandidate || !publication"
                @click="useClaimedSnapshotPosition"
            >Use Claimed Position</button>

            <dl v-if="selectedSnapshotWorldPositionClaimResult" class="own-publication-selected-world-position-claim-detail">
                <dt>Selected Snapshot Position Claim</dt>
                <dd>{{ selectedSnapshotWorldPositionClaimResult.outcome }}</dd>
                <template v-if="selectedSnapshotWorldPositionClaimResult.position">
                    <dt>Claimed Position</dt>
                    <dd>{{ selectedSnapshotWorldPositionClaimResult.position.x }}, {{ selectedSnapshotWorldPositionClaimResult.position.y }}, {{ selectedSnapshotWorldPositionClaimResult.position.z }}</dd>
                </template>
            </dl>

            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-world-placement-action"
                :disabled="!selectedSnapshotMaterializationResult"
                @click="placeMaterializedSnapshot"
            >Place Materialized Snapshot</button>

            <dl v-if="selectedSnapshotWorldPlacementResult" class="own-publication-selected-world-placement-detail">
                <dt>Selected Snapshot World Placement</dt>
                <dd>{{ selectedSnapshotWorldPlacementResult.outcome }}</dd>
                <template v-if="selectedSnapshotWorldPlacementResult.position">
                    <dt>Position</dt>
                    <dd>{{ selectedSnapshotWorldPlacementResult.position.x }}, {{ selectedSnapshotWorldPlacementResult.position.y }}, {{ selectedSnapshotWorldPlacementResult.position.z }}</dd>
                </template>
                <template v-if="selectedSnapshotWorldPlacementResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotWorldPlacementResult.reason }}</dd>
                </template>
            </dl>

            <button
                v-if="materializeSelectedSnapshotCommand"
                type="button"
                class="action-btn own-publication-selected-world-registration-action"
                :disabled="!selectedSnapshotWorldPlacementResult"
                @click="registerMaterializedSnapshot"
            >Register Placed Snapshot</button>

            <dl v-if="selectedSnapshotWorldRegistrationResult" class="own-publication-selected-world-registration-detail">
                <dt>Selected Snapshot World Registration</dt>
                <dd>{{ selectedSnapshotWorldRegistrationResult.outcome }}</dd>
                <template v-if="selectedSnapshotWorldRegistrationResult.origin">
                    <dt>Origin</dt>
                    <dd>{{ selectedSnapshotWorldRegistrationResult.origin }}</dd>
                </template>
                <template v-if="selectedSnapshotWorldRegistrationResult.reason">
                    <dt>Reason</dt>
                    <dd>{{ selectedSnapshotWorldRegistrationResult.reason }}</dd>
                </template>
            </dl>

                    <button
                        type="button"
                        class="action-btn own-publication-diagnostic-close"
                        @click="diagnosticToolsOpen = false"
                    >Close</button>
                </div>
            </div>

            <div v-if="getPublicationCommentariesCommand" class="own-publication-commentary">
                <h5 class="own-publication-commentary-title">Commentary ({{ publicationCommentaries.length }})</h5>

                <p v-if="publicationCommentaryError" class="own-publication-commentary-error">{{ publicationCommentaryError }}</p>

                <PublicationCommentaryRemoteCheck
                    v-if="publication"
                    :publication-id="publication.id"
                    @refreshed="refreshPublicationCommentaries"
                />

                <p v-if="!publicationCommentaries.length" class="own-publication-commentary-empty">No commentary yet.</p>
                <ul v-else class="own-publication-commentary-list">
                    <li
                        v-for="commentary in publicationCommentaries"
                        :key="commentary.commentaryId"
                        class="own-publication-commentary-entry"
                    >
                        <span class="own-publication-commentary-author">{{ commentary.authorIdentityId }}</span>
                        <p class="own-publication-commentary-content">{{ commentary.content }}</p>
                    </li>
                </ul>

                <p v-if="addPublicationCommentaryCommand && !viewerIdentityId" class="own-publication-commentary-signin-hint">
                    Sign in to add commentary.
                </p>
                <form
                    v-else-if="addPublicationCommentaryCommand"
                    class="own-publication-commentary-form"
                    @submit.prevent="submitPublicationCommentary"
                >
                    <textarea
                        v-model="newCommentaryText"
                        class="own-publication-commentary-input"
                        :disabled="!publication || publicationCommentarySubmitting"
                        placeholder="Add a comment…"
                    ></textarea>
                    <button
                        type="submit"
                        class="action-btn own-publication-commentary-submit-action"
                        :disabled="!publication || !newCommentaryText.trim() || publicationCommentarySubmitting"
                    >{{ publicationCommentarySubmitting ? 'Posting…' : 'Post Comment' }}</button>
                </form>
            </div>
        </div>
    `
};
