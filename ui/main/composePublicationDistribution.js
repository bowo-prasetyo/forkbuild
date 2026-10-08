import { composePublicationDistributionCommand, composeMultiRelayNostrPublicationDistributionCommand } from '../../application/publication/distribution/PublicationDistributionCommandComposition.js';
import { resolvePublicationDistributionRuntimeConfiguration } from '../../application/publication/distribution/PublicationDistributionRuntimeConfiguration.js';
import { createPublicationDistributionRuntimeProvider } from '../../application/publication/distribution/PublicationDistributionRuntimeProvider.js';
import { createArweavePublicationDistributionRuntimeAdapter } from '../../application/arweave/ArweavePublicationDistributionRuntimeAdapter.js';
import { createArweaveTaggedTransactionUpload } from '../../application/arweave/ArweaveTaggedTransactionUpload.js';
import { composeSnapshotDistributionRuntime } from '../../application/snapshot/SnapshotDistributionRuntimeComposition.js';
import { AnnouncementDiscoveryProviderRegistry, AnnouncementDiscoveryServiceKind } from '../../application/discovery/AnnouncementDiscoveryProviderRegistry.js';
import { announcementDiscoveryProviderOrDefault } from '../../core/AnnouncementDiscoveryProvider.js';
import { executeSnapshotDistributionCommand } from '../../application/snapshot/SnapshotDistributionCommand.js';
import { availableSnapshotDistributionStorageTypes, resolveSnapshotDistributionContentStore } from '../../application/snapshot/SnapshotDistributionContentBackendSelection.js';

// Composition root: publication and Snapshot distribution across Arweave,
// Nostr and IPFS, and the Snapshot discovery publishers.
export function composePublicationDistribution({
    resolvedIpfsNodeApiUrl, snapshotPlacementStoreRegistry, resolvedAnnouncementDiscoveryProvider,
    resolvedArweaveGatewayUrl, resolvedNostrRelayUrls, PUBLICATION_DISCOVERY_TAG,
    publicationDistributionLifecycleStore, arweaveHostSigner, nostrHostPublisher,
    nostrPublicationRuntimeCapabilities, steemRuntime = null, blurtRuntime = null, snapshotDistributionLog = null,
    buildTagsFor = null
}) {
    const arweavePublicationRuntimeCapabilities = createArweavePublicationDistributionRuntimeAdapter({ signer: arweaveHostSigner });
    const arweaveAnnouncementUploadTaggedTransaction = createArweaveTaggedTransactionUpload({
        signer: arweaveHostSigner,
        gatewayUrl: resolvedArweaveGatewayUrl
    });
    const publicationDistributionRuntimeProvider = createPublicationDistributionRuntimeProvider({
        ...arweavePublicationRuntimeCapabilities,
        ...nostrPublicationRuntimeCapabilities,
        uploadTaggedTransaction: arweaveAnnouncementUploadTaggedTransaction,
        discoveryTag: PUBLICATION_DISCOVERY_TAG
    });
    const resolvedOptions = resolvePublicationDistributionRuntimeConfiguration(publicationDistributionRuntimeProvider.resolveRuntimeCapabilities());
    const { arweaveUploaderOptions } = resolvedOptions;
    // A Publication's announcement also names its build's own tags, so the
    // builds with one tag (a week's challenge entries) can be found. An
    // unconfigured substrate's options stay undefined.
    const withBuildTags = (options) => (options && buildTagsFor ? { ...options, buildTagsFor } : options);
    const nostrPublisherOptions = withBuildTags(resolvedOptions.nostrPublisherOptions);
    const arweaveAnnouncementPublisherOptions = withBuildTags(resolvedOptions.arweaveAnnouncementPublisherOptions);
    // Material storage and remote pinning options stay a per-request choice, so
    // they are not resolved here.
    const ipfsNodeOptions = { apiUrl: resolvedIpfsNodeApiUrl };
    const publicationDistributionCommand = composePublicationDistributionCommand({
        lifecycleStore: publicationDistributionLifecycleStore,
        arweaveUploaderOptions,
        ipfsNodeOptions,
        nostrPublisherOptions,
        arweaveAnnouncementPublisherOptions,
        steemPublicationDiscoveryPublisher: steemRuntime ? steemRuntime.publicationDiscoveryPublisher : null,
        steemMaterialStore: steemRuntime ? steemRuntime.contentStore : null,
        blurtPublicationDiscoveryPublisher: blurtRuntime ? blurtRuntime.publicationDiscoveryPublisher : null,
        blurtMaterialStore: blurtRuntime ? blurtRuntime.contentStore : null
    });

    const multiRelayNostrPublicationDistributionCommand = composeMultiRelayNostrPublicationDistributionCommand({
        lifecycleStore: publicationDistributionLifecycleStore,
        arweaveUploaderOptions,
        ipfsNodeOptions,
        nostrRelayUrls: resolvedNostrRelayUrls,
        nostrPublisherOptions,
        steemMaterialStore: steemRuntime ? steemRuntime.contentStore : null,
        blurtMaterialStore: blurtRuntime ? blurtRuntime.contentStore : null
    });

    // Snapshots use their own 'forkbuild-snapshot' tag, a separate discovery
    // stream from publications on the same relays. Composed once per substrate so
    // each call can pick Nostr or Arweave. Content comes from
    // snapshotPlacementStoreRegistry: one shared Arweave store, and only
    // 'ipfs'/'ar' are distribution targets. A null publisher makes the command
    // throw synchronously; callers wrap it in a promise.
    const { discoveryPublisher: nostrSnapshotDiscoveryPublisher } = composeSnapshotDistributionRuntime({
        discoveryProvider: 'nostr',
        nostrSnapshotDiscoveryPublisherOptions: { publishImpl: nostrHostPublisher, discoveryTag: 'forkbuild-snapshot', relayUrls: resolvedNostrRelayUrls }
    });
    const { discoveryPublisher: arweaveSnapshotDiscoveryPublisher } = composeSnapshotDistributionRuntime({
        discoveryProvider: 'arweave',
        arweaveSnapshotDiscoveryPublisherOptions: { discoveryTag: 'forkbuild-snapshot', gatewayUrl: resolvedArweaveGatewayUrl, uploadTaggedTransaction: arweaveAnnouncementUploadTaggedTransaction }
    });
    // The Announcement & Discovery registry: each substrate's Snapshot
    // publisher, when this device has one. composeSnapshotDiscovery() adds the
    // place-naming publishers to the same registry.
    const announcementDiscoveryProviderRegistry = new AnnouncementDiscoveryProviderRegistry()
        .register({ providerKey: 'nostr', snapshotDiscoveryPublisher: nostrSnapshotDiscoveryPublisher })
        .register({ providerKey: 'arweave', snapshotDiscoveryPublisher: arweaveSnapshotDiscoveryPublisher })
        .register({ providerKey: 'steem', snapshotDiscoveryPublisher: steemRuntime ? steemRuntime.snapshotDiscoveryPublisher : null })
        .register({ providerKey: 'blurt', snapshotDiscoveryPublisher: blurtRuntime ? blurtRuntime.snapshotDiscoveryPublisher : null });
    // The publisher for a substrate, defaulting to the saved preference; null
    // when this device can't announce there. An unknown key means the default.
    const snapshotProviderKey = (discoveryProvider) => announcementDiscoveryProviderOrDefault(discoveryProvider || resolvedAnnouncementDiscoveryProvider);
    const resolveSnapshotDiscoveryPublisher = (discoveryProvider) => (
        announcementDiscoveryProviderRegistry.serviceFor(snapshotProviderKey(discoveryProvider), AnnouncementDiscoveryServiceKind.SNAPSHOT)
    );
    // Every completed distribution is logged (application/snapshot/OwnSnapshotDistributionLog.js),
    // so the Repository can say where your publications went after a reload.
    const snapshotDistributionCommand = (bytes, storage = 'ar', publicationId, claimedPosition, discoveryProvider, placementRecord) => executeSnapshotDistributionCommand({
        bytes,
        contentStore: resolveSnapshotDistributionContentStore(snapshotPlacementStoreRegistry, storage),
        // A substrate not set up on this device is named as such.
        discoveryPublisher: announcementDiscoveryProviderRegistry.requireServiceFor(snapshotProviderKey(discoveryProvider), AnnouncementDiscoveryServiceKind.SNAPSHOT),
        publicationId,
        claimedPosition,
        placementRecord
    }).then((result) => {
        if (snapshotDistributionLog) {
            try {
                snapshotDistributionLog.record({ result, substrate: discoveryProvider || resolvedAnnouncementDiscoveryProvider || 'nostr', publicationId });
            } catch (error) {
                console.warn('Snapshot distribution: could not log the result', error);
            }
        }
        return result;
    });
    // Lets a Remote IPFS CID be announced without re-uploading the bytes through
    // contentStore.put(). May be null.
    const snapshotDiscoveryPublisher = resolveSnapshotDiscoveryPublisher();
    const snapshotDistributionAvailableStorageTypes = () => availableSnapshotDistributionStorageTypes(snapshotPlacementStoreRegistry);

    return {
        arweaveAnnouncementUploadTaggedTransaction, publicationDistributionCommand,
        multiRelayNostrPublicationDistributionCommand, resolveSnapshotDiscoveryPublisher,
        snapshotDistributionCommand, snapshotDiscoveryPublisher, snapshotDistributionAvailableStorageTypes,
        announcementDiscoveryProviderRegistry
    };
}
