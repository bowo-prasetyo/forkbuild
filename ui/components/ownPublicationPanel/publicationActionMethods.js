import { resolveSnapshotPublicationAttribution } from '../../../application/snapshot/SnapshotPublicationAttribution.js';
import { sanitizeDistributionErrorMessage } from '../../../application/publication/distribution/DistributionErrorMessageSanitizer.js';

// The Nostr path resolves an array (one per relay) and Arweave a single
// result; normalize to an array, as EditorView does.
function normalizeDistributionResultForDisplay(result) {
    if (Array.isArray(result)) {
        return result;
    }
    return result ? [result] : null;
}

// OwnPublicationPanel methods: unpublish, place, distribute, export and
// discover the local user's own Publication and its Snapshot.
// Spread into the component's `methods`, so `this` is the component instance.
export const publicationActionMethods = {
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
    }
};
