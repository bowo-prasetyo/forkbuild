import { IpfsRemotePublicationState } from '../../../application/ipfs/IpfsRemotePublicationState.js';
import { sanitizeDistributionErrorMessage } from '../../../application/publication/distribution/DistributionErrorMessageSanitizer.js';
import { t } from '../../i18n/i18n.js';

// Distribution and Snapshot commands handed to WorldEncounterCanvas and
// OwnPublicationPanel: each wraps an app-wide command with this World's material.
export function useWorldEncounterCommands({
    discoverSnapshotCommand, exportSnapshotCommand, ipfsRemotePublicationCoordinator,
    multiRelayNostrPublicationDistributionCommand, publicationContentStore, publicationDistributionCommand,
    resolveSnapshotDiscoveryPublisher, session, snapshotDistributionCommand
}) {
    // Adds serializedMaterial (this replica's signed JSON record of the
    // Publication) to the distribution request; everything else is the injected
    // commands' business. 'arweave' calls the single-relay command with
    // `discoveryProvider`; anything else (including omitted) calls the multi-relay
    // Nostr command, which resolves one result per relay. `materialStorage`
    // ('ar' default | 'ipfs' | 'remote-pinning') and remotePinningConfiguration
    // are forwarded as given; storage and announcement substrate are independent
    // choices. Never builds a client or calls the orchestrator itself.
    function distributeWorldEncounterPublication(publication, discoveryProvider, materialStorage, remotePinningConfiguration) {
        const remotePinningProviderOptions = materialStorage === 'remote-pinning' && remotePinningConfiguration
            ? {
                endpoint: remotePinningConfiguration.endpoint,
                credential: remotePinningConfiguration.credential || null,
                ...(remotePinningConfiguration.requestField ? { fileFieldName: remotePinningConfiguration.requestField } : {}),
                ...(remotePinningConfiguration.responseField ? { cidField: remotePinningConfiguration.responseField } : {})
            }
            : undefined;

        if (discoveryProvider === 'arweave' || discoveryProvider === 'steem') {
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

    // Turns "which publication" into "which bytes": reads the stored snapshot bytes
    // via publicationContentStore.get(publication.contentReference), exactly as
    // published (never re-serialized; the content store is the only place a hash
    // is computed). Forwards the Publication's authoritative placement as
    // claimedPosition, or nothing if it was never placed (never a substitute
    // position). `storage` is forwarded explicitly; 'remote-pinning' is a separate
    // path through ipfsRemotePublicationCoordinator, with a per-attempt
    // configuration, normalized to the same `{ contentReference, announcement }`
    // shape. `discoveryProvider` applies to every storage path.
    async function distributeWorldEncounterSnapshot(publication, storage, remotePinningConfiguration, discoveryProvider) {
        if (!publicationContentStore || !publication.contentReference) {
            return Promise.reject(new Error(t('distribution.snapshotUnavailable')));
        }
        const claim = placementClaimFor(publication);
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
                        throw new Error(outcome.reason || 'Remote IPFS publish failed.');
                    }
                    const contentReference = { hash: outcome.contentHash, uri: outcome.locator, storage: 'ipfs' };
                    const discoveryPublisher = resolveSnapshotDiscoveryPublisher ? resolveSnapshotDiscoveryPublisher(discoveryProvider) : null;
                    if (!discoveryPublisher) {
                        return { contentReference, announcement: null, announcementError: t('distribution.snapshotUnavailable') };
                    }
                    return discoveryPublisher.publish({ contentHash: outcome.contentHash, locator: outcome.locator, storage: 'ipfs', ...claim })
                        .then((announcement) => ({ contentReference, announcement }))
                        .catch((error) => {
                            // An announcement failure never fails the attempt (the content is already
                            // pinned); announcementError carries the sanitized cause.
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
        return snapshotDistributionCommand(
            snapshotBytes,
            storage,
            claim.publicationId,
            claim.claimedPosition,
            discoveryProvider,
            claim.placementRecord
        );
    }

    // What an announcement says about where the build is. The publisher's own
    // signed placement, when this device holds it, so receivers can verify the
    // position; otherwise this device's own placement, as an unsigned claim.
    // Empty when it was never placed (never a substitute position).
    function placementClaimFor(publication) {
        const publisherRecord = typeof session.getPublisherPlacementRecord === 'function'
            ? session.getPublisherPlacementRecord(publication.id)
            : null;
        if (publisherRecord) {
            return { publicationId: publication.id, claimedPosition: { ...publisherRecord.position }, placementRecord: publisherRecord };
        }
        const placementInfo = session.getPlacementInfoForPublication(publication.id);
        return placementInfo ? { publicationId: placementInfo.publicationId, claimedPosition: placementInfo.position } : {};
    }

    // Turns "which publication" into "which contentHash", using the Publication's
    // own contentReference.hash, never a search. An unplaced Publication rejects.
    // Also bound to WorldEncounterCanvas: it works for any Publication despite the
    // name.
    function discoverOwnSnapshot(publication) {
        if (!discoverSnapshotCommand || !publication || !publication.contentReference) {
            return Promise.reject(new Error(t('distribution.snapshotDiscoveryUnavailable')));
        }
        return discoverSnapshotCommand(publication.contentReference.hash);
    }

    // Passes publication.id; the use case resolves what to export. Resolves to a
    // transfer package or rejects; the panel handles display.
    function exportOwnSnapshot(publication) {
        if (!exportSnapshotCommand || !publication) {
            return Promise.reject(new Error(t('distribution.snapshotExportUnavailable')));
        }
        return exportSnapshotCommand(publication.id);
    }

    return {
        distributeWorldEncounterPublication, distributeWorldEncounterSnapshot, discoverOwnSnapshot,
        exportOwnSnapshot
    };
}
