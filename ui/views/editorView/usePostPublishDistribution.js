import { ref, inject } from 'vue';
import { sanitizeDistributionErrorMessage } from '../../../application/publication/distribution/DistributionErrorMessageSanitizer.js';
import { IpfsRemotePublicationState } from '../../../application/ipfs/IpfsRemotePublicationState.js';

// Post-publish distribution: after a publish, the Editor offers to distribute that exact
// Publication (announcement/discovery plus content) and its snapshot bytes. Page-local,
// ephemeral state only.
export function usePostPublishDistribution({
    router
}) {
    // Toolbar forwards the exact just-published Publication; nothing here looks up
    // "the latest Publication". ActionFeedback stays passive: this view owns the
    // action.
    const multiRelayNostrPublicationDistributionCommand = inject('multiRelayNostrPublicationDistributionCommand', null);

    // Nostr goes to the multi-relay command, Arweave to the single-relay one, as in
    // WorldView.
    const publicationDistributionCommand = inject('publicationDistributionCommand', null);

    // Snapshot distribution sends the Publication's material bytes, separately
    // from announcing the Publication. Remote Pinning never goes through
    // snapshotDistributionCommand.
    const snapshotDistributionCommand = inject('snapshotDistributionCommand', null);
    const publicationContentStore = inject('publicationContentStore', null);
    const ipfsRemotePublicationCoordinator = inject('ipfsRemotePublicationCoordinator', null);
    const resolveSnapshotDiscoveryPublisher = inject('resolveSnapshotDiscoveryPublisher', null);

    // Substrate choice shared by both actions: page-local, never persisted.
    // Opens on the saved preference, else 'nostr'.
    const defaultAnnouncementDiscoveryProvider = inject('defaultAnnouncementDiscoveryProvider', 'nostr');
    const selectedDiscoveryProvider = ref(defaultAnnouncementDiscoveryProvider);

    // One Storage choice shared by both actions: page-local, never persisted. When
    // Snapshot distribution is available the options are the registered storages
    // plus 'remote-pinning', otherwise the Material storages. Opens on the saved
    // Content preference when eligible, then the first registered storage, then
    // 'ar'.
    const defaultContentDistributionProvider = inject('defaultContentDistributionProvider', null);
    const snapshotDistributionAvailableStorageTypesCommand = inject('snapshotDistributionAvailableStorageTypes', null);
    const snapshotDistributionStorageTypes = snapshotDistributionAvailableStorageTypesCommand
        ? snapshotDistributionAvailableStorageTypesCommand()
        : ['ar', 'ipfs'];
    // Never persisted; discarded on reload.
    const remotePinningDraft = ref({ endpoint: '', credential: '', requestField: '', responseField: '' });

    // A plain boolean: the injected commands never change after mount.
    const canDistributePublication = Boolean(multiRelayNostrPublicationDistributionCommand || publicationDistributionCommand);

    // publicationContentStore is required either way: it turns "which Publication"
    // into "which bytes".
    const canDistributeSnapshot = Boolean(
        publicationContentStore
        && (snapshotDistributionCommand || (ipfsRemotePublicationCoordinator && resolveSnapshotDiscoveryPublisher))
    );

    const distributionStorageEligible = canDistributeSnapshot
        ? [...snapshotDistributionStorageTypes, 'remote-pinning']
        : ['ar', 'ipfs', 'remote-pinning'];
    const selectedDistributionStorage = ref(
        distributionStorageEligible.includes(defaultContentDistributionProvider)
            ? defaultContentDistributionProvider
            : ((canDistributeSnapshot && snapshotDistributionStorageTypes[0]) || 'ar')
    );

    // (publication, discoveryProvider) -> Promise. Adds serializedMaterial to the
    // request. 'arweave' uses the single-relay command; anything else the
    // multi-relay Nostr command, which resolves one result per relay.
    function distributeEditorPublication(publication, discoveryProvider, materialStorage, remotePinningConfiguration) {
        const remotePinningProviderOptions = materialStorage === 'remote-pinning' && remotePinningConfiguration
            ? {
                endpoint: remotePinningConfiguration.endpoint,
                credential: remotePinningConfiguration.credential || null,
                ...(remotePinningConfiguration.requestField ? { fileFieldName: remotePinningConfiguration.requestField } : {}),
                ...(remotePinningConfiguration.responseField ? { cidField: remotePinningConfiguration.responseField } : {})
            }
            : undefined;

        if (discoveryProvider === 'arweave') {
            if (!publicationDistributionCommand) {
                return Promise.reject(new Error('Publication distribution is not available.'));
            }
            return publicationDistributionCommand({
                publication,
                serializedMaterial: JSON.stringify(publication.toJSON()),
                discoveryProvider,
                materialStorage,
                remotePinningProviderOptions
            });
        }
        if (!multiRelayNostrPublicationDistributionCommand) {
            return Promise.reject(new Error('Publication distribution is not available.'));
        }
        return multiRelayNostrPublicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON()),
            materialStorage,
            remotePinningProviderOptions
        });
    }

    // Sends the Publication's raw snapshot bytes. Like WorldView's version, but
    // with no placement here, claimedPosition and publicationId stay undefined.
    function distributeEditorSnapshot(publication, storage, remotePinningConfiguration, discoveryProvider) {
        if (!publicationContentStore || !publication.contentReference) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        const snapshotBytes = publicationContentStore.get(publication.contentReference);
        if (snapshotBytes === null || snapshotBytes === undefined) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        if (storage === 'remote-pinning') {
            if (!ipfsRemotePublicationCoordinator) {
                return Promise.reject(new Error('Snapshot distribution is not available.'));
            }
            return ipfsRemotePublicationCoordinator.publish({ bytes: snapshotBytes, configuration: remotePinningConfiguration })
                .then((outcome) => {
                    if (outcome.state !== IpfsRemotePublicationState.PUBLISHED) {
                        throw new Error(outcome.reason || 'Remote IPFS publish failed.');
                    }
                    const contentReference = { hash: outcome.contentHash, uri: outcome.locator, storage: 'ipfs' };
                    const discoveryPublisher = resolveSnapshotDiscoveryPublisher ? resolveSnapshotDiscoveryPublisher(discoveryProvider) : null;
                    if (!discoveryPublisher) {
                        return { contentReference, announcement: null, announcementError: 'Snapshot distribution is not available.' };
                    }
                    return discoveryPublisher.publish({ contentHash: outcome.contentHash, locator: outcome.locator, storage: 'ipfs' })
                        .then((announcement) => ({ contentReference, announcement }))
                        .catch((error) => {
                            // The content is already pinned, so an announcement failure surfaces as
                            // announcementError rather than failing the whole attempt.
                            console.error('Snapshot Nostr announcement failed:', error);
                            return {
                                contentReference,
                                announcement: null,
                                announcementError: sanitizeDistributionErrorMessage(error) || 'Announcement could not be completed.'
                            };
                        });
                });
        }
        if (!snapshotDistributionCommand) {
            return Promise.reject(new Error('Snapshot distribution is not available.'));
        }
        return snapshotDistributionCommand(snapshotBytes, storage, undefined, undefined, discoveryProvider);
    }

    // Replaced by each successful publish: "Publish A, Publish B, click" must
    // distribute B.
    const publishedPublication = ref(null);
    // Ephemeral only: no persistence, retry queue or history.
    const distributionExecuting = ref(false);
    const distributionError = ref(null);
    const distributionResult = ref(null);

    // Separate state for Snapshot distribution.
    const snapshotDistributionExecuting = ref(false);
    const snapshotDistributionError = ref(null);
    const snapshotDistributionResult = ref(null);
    const distributionRequestIds = { publication: 0, snapshot: 0 };

    // Reset with the rest of this state so a stale dialog never carries over.
    const distributionDialogOpen = ref(false);

    // The only writer of publishedPublication. Publishing never distributes on its
    // own; distribution needs a later explicit click.
    function onDocumentPublished(publication) {
        publishedPublication.value = publication;
        resetDistributionState();
    }

    function dismissPublishAction() {
        publishedPublication.value = null;
        resetDistributionState();
    }

    // Also bumps both request ids so in-flight attempts cannot write stale results.
    function resetDistributionState() {
        distributionExecuting.value = false;
        distributionError.value = null;
        distributionResult.value = null;
        distributionRequestIds.publication += 1;
        snapshotDistributionExecuting.value = false;
        snapshotDistributionError.value = null;
        snapshotDistributionResult.value = null;
        distributionRequestIds.snapshot += 1;
        distributionDialogOpen.value = false;
    }

    // The Arweave branch returns one result, the Nostr branch an array; store both
    // as arrays for display.
    function normalizeDistributionResultForDisplay(result) {
        if (Array.isArray(result)) {
            return result;
        }
        return result ? [result] : null;
    }

    // Shared executing/error/result state machine. Only the latest attempt of a
    // `family` may write its outcome. Full errors go to the console; the UI shows
    // sanitized text or `fallbackMessage`.
    function runDistribution(family, state, attempt, { logLabel, fallbackMessage, toDisplay = (result) => result }) {
        state.executing.value = true;
        state.error.value = null;
        distributionRequestIds[family] += 1;
        const requestId = distributionRequestIds[family];
        const isCurrent = () => requestId === distributionRequestIds[family];
        return Promise.resolve()
            .then(attempt)
            .then((result) => {
                if (isCurrent()) {
                    state.result.value = toDisplay(result);
                }
            })
            .catch((error) => {
                if (isCurrent()) {
                    console.error(`${logLabel} failed:`, error);
                    state.error.value = sanitizeDistributionErrorMessage(error) || fallbackMessage;
                }
            })
            .then(() => {
                if (isCurrent()) {
                    state.executing.value = false;
                }
            });
    }

    function selectedRemotePinningConfiguration() {
        return selectedDistributionStorage.value === 'remote-pinning' ? remotePinningDraft.value : undefined;
    }

    // No-op without a published Publication, a usable command, or while busy.
    function distributePublishedDocument() {
        const publication = publishedPublication.value;
        if (!publication || !canDistributePublication || distributionExecuting.value) {
            return;
        }
        return runDistribution(
            'publication',
            { executing: distributionExecuting, error: distributionError, result: distributionResult },
            () => distributeEditorPublication(
                publication,
                selectedDiscoveryProvider.value,
                selectedDistributionStorage.value,
                selectedRemotePinningConfiguration()
            ),
            {
                logLabel: 'Publication distribution',
                fallbackMessage: 'Publication distribution could not be completed.',
                toDisplay: normalizeDistributionResultForDisplay
            }
        );
    }

    function distributePublishedSnapshot() {
        const publication = publishedPublication.value;
        if (!publication || !canDistributeSnapshot || snapshotDistributionExecuting.value) {
            return;
        }
        return runDistribution(
            'snapshot',
            { executing: snapshotDistributionExecuting, error: snapshotDistributionError, result: snapshotDistributionResult },
            () => distributeEditorSnapshot(
                publication,
                selectedDistributionStorage.value,
                selectedRemotePinningConfiguration(),
                selectedDiscoveryProvider.value
            ),
            {
                logLabel: 'Snapshot distribution',
                fallbackMessage: 'Snapshot distribution could not be completed.'
            }
        );
    }

    // Runs both actions from one click, each keeping its own state and result.
    // Sequential, never concurrent: both may sign through the same extension, and
    // two simultaneous signing requests can silently hang it. Snapshot first,
    // matching the template order.
    function distributePublishedDocumentAndSnapshot() {
        return Promise.resolve(distributePublishedSnapshot())
            .then(() => distributePublishedDocument());
    }

    // Navigates to /world/:documentId using the documentId already held; never a
    // catalog lookup. Without one it does nothing.
    function viewDistributedPublicationInRepository() {
        const publication = publishedPublication.value;
        if (!publication || !publication.documentId) {
            return;
        }
        router.push({ path: `/world/${publication.documentId}` });
    }

    return {
        canDistributePublication, canDistributeSnapshot, dismissPublishAction, distributePublishedDocument,
        distributePublishedDocumentAndSnapshot, distributePublishedSnapshot, distributionDialogOpen,
        distributionError, distributionExecuting, distributionResult, onDocumentPublished, publishedPublication,
        remotePinningDraft, selectedDiscoveryProvider, selectedDistributionStorage, snapshotDistributionError,
        snapshotDistributionExecuting, snapshotDistributionResult, snapshotDistributionStorageTypes,
        viewDistributedPublicationInRepository
    };
}
