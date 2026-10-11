import { ref, inject, computed } from 'vue';
import { useWritableNetworks } from '../../components/networkWriters/useWritableNetworks.js';
import { sanitizeDistributionErrorMessage } from '../../../application/publication/distribution/DistributionErrorMessageSanitizer.js';
import { IpfsRemotePublicationState } from '../../../application/ipfs/IpfsRemotePublicationState.js';
import { remotePinningDraftFromSettings } from '../../../application/ipfs/IpfsRemotePinningDraft.js';
import { PUBLISH_STORAGES } from '../../../application/settings/PublishDestinationStore.js';
import { t } from '../../i18n/i18n.js';

// The networks' own names, in every language.
const NETWORK_NAMES = Object.freeze({ nostr: 'Nostr', arweave: 'Arweave', steem: 'Steem', blurt: 'Blurt' });

// Post-publish distribution: after a publish, the Editor offers to distribute that exact
// Publication (announcement/discovery plus content) and its snapshot bytes. Page-local,
// ephemeral state only. `includeSnapshot: false` is for a Publication that has no
// Snapshot of its own (an authorship claim): only its Signed Claim is offered.
//
// `rememberDestination: true` folds sending into Publish (docs/Pillars.md, "one
// verb, Publish"): a send that works with "Send here every time I publish"
// ticked keeps where it went (application/settings/PublishDestinationStore.js),
// and each signed publish after that sends there on its own, reporting in the
// same notice. Without a kept destination, Publish stays on this device and in
// its links until the person chooses where it goes.
export function usePostPublishDistribution({
    router,
    includeSnapshot = true,
    rememberDestination = false
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
    // The publisher's own signed placement, made when publishing, announced beside
    // the Snapshot as the Publications page and World View do, so other devices
    // (a link, a nearby visitor) show the build where it was placed.
    const publisherPlacementClaimLookup = inject('publisherPlacementClaimLookup', null);

    // Substrate choice shared by both actions: page-local, never persisted.
    // Opens on the saved preference, else 'nostr', and on 'nostr' too when the
    // saved one is a network whose writer is switched off (core/NetworkWriters.js).
    const defaultAnnouncementDiscoveryProvider = inject('defaultAnnouncementDiscoveryProvider', 'nostr');
    const { writableOr, writable } = useWritableNetworks();
    const selectedDiscoveryProvider = ref(writableOr(defaultAnnouncementDiscoveryProvider));

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
    // Starts on the service saved under Content Provider, if any.
    const ipfsRemotePinningSettingsStore = inject('ipfsRemotePinningSettingsStore', null);
    const remotePinningDraft = ref(remotePinningDraftFromSettings(ipfsRemotePinningSettingsStore ? ipfsRemotePinningSettingsStore.get() : null));

    // A plain boolean: the injected commands never change after mount.
    const canDistributePublication = Boolean(multiRelayNostrPublicationDistributionCommand || publicationDistributionCommand);

    // publicationContentStore is required either way: it turns "which Publication"
    // into "which bytes".
    const canDistributeSnapshot = Boolean(
        includeSnapshot
        && publicationContentStore
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

        if (['arweave', 'steem', 'blurt'].includes(discoveryProvider)) {
            if (!publicationDistributionCommand) {
                return Promise.reject(new Error(t('distribution.publicationUnavailable')));
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
            return Promise.reject(new Error(t('distribution.publicationUnavailable')));
        }
        return multiRelayNostrPublicationDistributionCommand({
            publication,
            serializedMaterial: JSON.stringify(publication.toJSON()),
            materialStorage,
            remotePinningProviderOptions
        });
    }

    // Sends the Publication's raw snapshot bytes, with its publisher's signed
    // placement when this device holds one (`{}` otherwise: publicationId,
    // claimedPosition and placementRecord travel together or not at all).
    async function distributeEditorSnapshot(publication, storage, remotePinningConfiguration, discoveryProvider) {
        if (!publicationContentStore || !publication.contentReference) {
            return Promise.reject(new Error(t('distribution.snapshotUnavailable')));
        }
        const claim = publisherPlacementClaimLookup ? publisherPlacementClaimLookup.claimFor(publication) : {};
        const snapshotBytes = await publicationContentStore.get(publication.contentReference);
        if (snapshotBytes === null || snapshotBytes === undefined) {
            return Promise.reject(new Error(t('distribution.snapshotUnavailable')));
        }
        if (storage === 'remote-pinning') {
            if (!ipfsRemotePublicationCoordinator) {
                return Promise.reject(new Error(t('distribution.snapshotUnavailable')));
            }
            return ipfsRemotePublicationCoordinator.publish({ bytes: snapshotBytes, configuration: remotePinningConfiguration })
                .then((outcome) => {
                    if (outcome.state !== IpfsRemotePublicationState.PUBLISHED) {
                        throw new Error(outcome.reason || t('distribution.remotePinFailed'));
                    }
                    const contentReference = { hash: outcome.contentHash, uri: outcome.locator, storage: 'ipfs' };
                    const discoveryPublisher = resolveSnapshotDiscoveryPublisher ? resolveSnapshotDiscoveryPublisher(discoveryProvider) : null;
                    if (!discoveryPublisher) {
                        return { contentReference, announcement: null, announcementError: t('distribution.snapshotUnavailable') };
                    }
                    return discoveryPublisher.publish({ contentHash: outcome.contentHash, locator: outcome.locator, storage: 'ipfs', ...claim })
                        .then((announcement) => ({ contentReference, announcement }))
                        .catch((error) => {
                            // The content is already pinned, so an announcement failure surfaces as
                            // announcementError rather than failing the whole attempt.
                            console.error('Snapshot Nostr announcement failed:', error);
                            return {
                                contentReference,
                                announcement: null,
                                announcementError: sanitizeDistributionErrorMessage(error) || t('distribution.announcementFailed')
                            };
                        });
                });
        }
        if (!snapshotDistributionCommand) {
            return Promise.reject(new Error(t('distribution.snapshotUnavailable')));
        }
        return snapshotDistributionCommand(snapshotBytes, storage, claim.publicationId, claim.claimedPosition, discoveryProvider, claim.placementRecord);
    }

    // Where Publish sends on its own; null without a store (a test, the
    // authorship claim's notice) or before anything is kept.
    const destinationStore = rememberDestination ? inject('publishDestinationStore', null) : null;
    const rememberChoice = ref(true);
    // Remembering needs a store and a storage that can be kept.
    const canRemember = computed(() => Boolean(destinationStore) && PUBLISH_STORAGES.includes(selectedDistributionStorage.value));

    // The kept destination when this device can still send there: its network
    // still switched on and its storage still offered.
    function usableDestination() {
        if (!destinationStore || !canDistributeSnapshot || !canDistributePublication) return null;
        const destination = destinationStore.get();
        if (!destination) return null;
        if (!writable(destination.discoveryProvider) || !distributionStorageEligible.includes(destination.storage)) return null;
        return destination;
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

    // The only writer of publishedPublication. A signed publish goes on to send
    // where this device keeps sending (usableDestination()); otherwise nothing
    // leaves the device until the person chooses where it goes. Returns the
    // send's promise, or undefined when nothing is sent.
    function onDocumentPublished(publication) {
        publishedPublication.value = publication;
        resetDistributionState();
        const destination = publication && publication.signature ? usableDestination() : null;
        if (!destination) return undefined;
        selectedDiscoveryProvider.value = destination.discoveryProvider;
        selectedDistributionStorage.value = destination.storage;
        return distributePublishedDocumentAndSnapshot();
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
                fallbackMessage: t('distribution.publicationFailed'),
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
                fallbackMessage: t('distribution.snapshotFailed')
            }
        );
    }

    // Runs both actions from one click, each keeping its own state and result.
    // Sequential, never concurrent: both may sign through the same extension, and
    // two simultaneous signing requests can silently hang it. Snapshot first,
    // matching the template order.
    function distributePublishedDocumentAndSnapshot() {
        return Promise.resolve(distributePublishedSnapshot())
            .then(() => distributePublishedDocument())
            .then(() => {
                if (rememberChoice.value) keepDestinationIfSent();
            });
    }

    // Both halves arrived, with nothing failed.
    function lastSendSucceeded() {
        return Boolean(snapshotDistributionResult.value && !snapshotDistributionError.value
            && distributionResult.value && distributionResult.value.length && !distributionError.value);
    }

    function keepDestinationIfSent() {
        if (!canRemember.value || !lastSendSucceeded()) return;
        try {
            destinationStore.save({
                discoveryProvider: selectedDiscoveryProvider.value,
                storage: selectedDistributionStorage.value
            });
        } catch (error) {
            // Unsaved, the build is still sent; the next Publish asks again.
            console.warn('Publish: could not keep where it goes', error);
        }
    }

    // Unticking stops sending on Publish at once; ticking keeps a send that
    // already worked here, or the next one that does.
    function setRememberChoice(value) {
        rememberChoice.value = value === true;
        if (!destinationStore) return;
        if (rememberChoice.value) keepDestinationIfSent();
        else destinationStore.clear();
    }

    // What the notice under Publish says: 'local' (nothing sent yet),
    // 'sending', 'sent' or 'failed'.
    const sendStatus = computed(() => {
        if (snapshotDistributionExecuting.value || distributionExecuting.value) return 'sending';
        if (snapshotDistributionError.value || distributionError.value) return 'failed';
        if (lastSendSucceeded()) return 'sent';
        return 'local';
    });
    const sendDestinationName = computed(() => NETWORK_NAMES[selectedDiscoveryProvider.value] || selectedDiscoveryProvider.value);
    const sendError = computed(() => snapshotDistributionError.value || distributionError.value || null);

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
        viewDistributedPublicationInRepository,
        canRemember, rememberChoice, setRememberChoice, sendStatus, sendDestinationName, sendError
    };
}
