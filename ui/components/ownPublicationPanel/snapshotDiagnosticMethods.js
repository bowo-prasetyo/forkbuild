import { resolveSnapshotPublicationAttribution } from '../../../application/snapshot/SnapshotPublicationAttribution.js';
import { describeSnapshotResolutionOutcomeLabel, describeSnapshotAttributionOutcomeLabel } from '../../../application/snapshot/SnapshotOutcomeInspectionView.js';
import { resolveSnapshotWorldPlacement } from '../../../application/snapshot/placement/SnapshotWorldPlacement.js';
import { registerMaterializedSnapshotWorldSource } from '../../../application/snapshot/materialization/MaterializedSnapshotWorldDiscoveryBridge.js';
import { resolveSnapshotWorldPositionClaim } from '../../../application/snapshot/placement/SnapshotWorldPositionClaim.js';
import { SnapshotWorldPositionClaimOutcome } from '../../../application/snapshot/placement/SnapshotWorldPositionClaimOutcome.js';
import { sanitizeDistributionErrorMessage } from '../../../application/publication/distribution/DistributionErrorMessageSanitizer.js';

// OwnPublicationPanel methods: the manual Snapshot diagnostic pipeline
// (discover candidates, select, resolve, attribute, materialize, claim a
// position, place, register) and its outcome labels.
// Spread into the component's `methods`, so `this` is the component instance.
export const snapshotDiagnosticMethods = {
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
    // The template is a runtime-compiled string, so imported functions need these
    // wrappers to be callable from `{{ }}`.
    describeSnapshotResolutionLabel(outcome) {
        return describeSnapshotResolutionOutcomeLabel(outcome);
    },
    describeSnapshotAttributionLabel(outcome) {
        return describeSnapshotAttributionOutcomeLabel(outcome);
    }
};
