import { resolveSavedProviderDefault } from '../../application/settings/SavedProviderDefaultChoice.js';
import { RoleProviderRole } from '../../core/RoleProviderRole.js';
import { composePlaceNamingPublicationRuntime } from '../../application/placeNaming/PlaceNamingPublicationRuntimeComposition.js';
import { composeDiscoverSnapshotRuntime } from '../../application/snapshot/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCommand } from '../../application/snapshot/DiscoverSnapshotCommand.js';
import { executeDiscoverSnapshotCandidatesCommand, executeDiscoverSnapshotCandidatesCommandWithOutcome } from '../../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { SnapshotCandidateDiscoveryQueryService } from '../../application/snapshot/SnapshotCandidateDiscoveryQueryService.js';
import { WorldSnapshotDiscoveryMonitor } from '../../application/snapshot/WorldSnapshotDiscoveryMonitor.js';
import { composeSnapshotCandidateDiscoveryRuntime } from '../../application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js';
import { ArweaveSnapshotDiscoveryQueryService } from '../../application/arweave/ArweaveSnapshotDiscoveryQueryService.js';
import { NostrPlaceNamingDiscoverySource } from '../../application/placeNaming/NostrPlaceNamingDiscoverySource.js';
import { NostrMultiRelayPlaceNamingDiscoverySource } from '../../application/placeNaming/NostrMultiRelayPlaceNamingDiscoverySource.js';
import { ArweavePlaceNamingDiscoverySource } from '../../application/placeNaming/ArweavePlaceNamingDiscoverySource.js';
import { composePlaceNamingDiscoveryRuntime } from '../../application/placeNaming/PlaceNamingDiscoveryRuntimeComposition.js';
import { executeResolveSelectedSnapshotCommand } from '../../application/snapshot/ResolveSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../../application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { executeMaterializeSelectedSnapshotCommand } from '../../application/snapshot/materialization/MaterializeSelectedSnapshotCommand.js';
import { AnnouncementKind } from '../../application/announcementIndex/AnnouncementKinds.js';
import { RecordingDiscoverySource, IndexedAnnouncementSource } from '../../application/announcementIndex/IndexedDiscoverySources.js';

// Composition root: the saved content provider default, Place Naming
// publication and discovery, and Snapshot discovery, candidate discovery,
// resolution and materialization commands.
export function composeSnapshotDiscovery({
    publicationSnapshotPlacementCatalog, publicationSnapshotPlacementResolutionStoreRegistry,
    roleProviderPreferenceStore, resolvedAnnouncementDiscoveryProvider, storeSnapshotContentUseCase,
    resolvedArweaveGatewayUrl, resolvedNostrRelayUrls, nostrRelayQueryClient, nostrHostPublisher,
    arweaveAnnouncementUploadTaggedTransaction, snapshotDistributionAvailableStorageTypes, steemRuntime = null,
    announcementIndex = null
}) {
    // Every network discovery result is recorded in the Announcement Index, and
    // the index answers beside the network (docs/AnnouncementIndex.md).
    const recording = (source, kind, origin) => (source && announcementIndex
        ? new RecordingDiscoverySource(source, { index: announcementIndex, kind, origin })
        : source);
    const indexedSource = (kind) => (announcementIndex ? new IndexedAnnouncementSource({ index: announcementIndex, kind }) : null);

    // Seeds the Content/Snapshot pickers from the saved CONTENT preference, never
    // overriding a pick. 'remote-pinning' is added to the eligible list because that
    // store reports its storage as 'ipfs' and so never has its own registry key;
    // without it a saved 'remote-pinning' preference would be silently ignored.
    const contentDistributionProviderPreference = roleProviderPreferenceStore.get(RoleProviderRole.CONTENT);
    const resolvedContentDistributionProvider = resolveSavedProviderDefault(
        contentDistributionProviderPreference ? contentDistributionProviderPreference.providerKey : null,
        [...snapshotDistributionAvailableStorageTypes(), 'remote-pinning'],
        null
    );

    // Supplies no discoveryTag: the publisher derives it from the claim's
    // worldId/regionId. A null publisher makes the command reject with a readable
    // error.
    const { discoveryPublisher: placeNamingDiscoveryPublisher } = composePlaceNamingPublicationRuntime({
        discoveryProvider: resolvedAnnouncementDiscoveryProvider,
        nostrPlaceNamingDiscoveryPublisherOptions: { publishImpl: nostrHostPublisher },
        arweavePlaceNamingDiscoveryPublisherOptions: { gatewayUrl: resolvedArweaveGatewayUrl, uploadTaggedTransaction: arweaveAnnouncementUploadTaggedTransaction },
        steemPlaceNamingDiscoveryPublisher: steemRuntime ? steemRuntime.placeNamingDiscoveryPublisher : null
    });
    const publishPlaceNamingClaimToNostrCommand = (claim) => Promise.resolve().then(() => {
        if (!placeNamingDiscoveryPublisher) {
            throw new Error('Nostr publishing is not available — no compatible browser extension was found');
        }
        return placeNamingDiscoveryPublisher.publish(claim);
    });

    // nostrRelayQueryClient only queries relays (REQ/EVENT/EOSE) and needs no
    // extension; publishing is the separate NIP-07 path. Where it is undefined the
    // resolver is null and the command throws synchronously; callers wrap it.
    const { resolver: snapshotResolver, queryService: snapshotDiscoveryQueryService } = composeDiscoverSnapshotRuntime({
        nostrSnapshotDiscoveryQueryServiceOptions: { queryImpl: nostrRelayQueryClient, relayUrls: resolvedNostrRelayUrls }
    });
    // The resolution registry is keyed by the selected candidate's own `storage`:
    // no ranking, no trying several backends, no fallback.
    const discoverSnapshotCommand = (contentHash) => executeDiscoverSnapshotCommand({
        discoveryTag: 'forkbuild-snapshot',
        contentHash,
        resolver: snapshotResolver,
        storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry
    });

    // Reads Arweave directly: a read-only query needs no signer or wallet.
    const arweaveSnapshotDiscoveryQueryService = new ArweaveSnapshotDiscoveryQueryService({ gatewayUrl: resolvedArweaveGatewayUrl });
    const { queryService: snapshotCandidateDiscoveryQueryService } = composeSnapshotCandidateDiscoveryRuntime({
        nostrSnapshotDiscoveryQueryService: recording(snapshotDiscoveryQueryService, AnnouncementKind.SNAPSHOT, 'nostr'),
        arweaveSnapshotDiscoveryQueryService: recording(arweaveSnapshotDiscoveryQueryService, AnnouncementKind.SNAPSHOT, 'arweave'),
        steemSnapshotDiscoveryQueryService: recording(steemRuntime ? steemRuntime.snapshotDiscoveryQueryService : null, AnnouncementKind.SNAPSHOT, 'steem'),
        announcementIndexSource: indexedSource(AnnouncementKind.SNAPSHOT),
        placementCatalog: publicationSnapshotPlacementCatalog
    });

    // Answers "what was announced under this tag", as opposed to resolving one
    // contentHash. Local catalog entries (including peer announcements) and
    // Nostr/Arweave all reach callers through the one composite service.
    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
        discoveryTag: 'forkbuild-snapshot',
        discoveryQueryService: snapshotCandidateDiscoveryQueryService
    });

    // The index alone: World View shows what earlier searches found before the
    // network answers. Null without an index.
    const indexedSnapshotSource = indexedSource(AnnouncementKind.SNAPSHOT);
    const discoverIndexedSnapshotCandidatesCommand = indexedSnapshotSource
        ? () => executeDiscoverSnapshotCandidatesCommand({
            discoveryTag: 'forkbuild-snapshot',
            discoveryQueryService: new SnapshotCandidateDiscoveryQueryService([indexedSnapshotSource])
        })
        : null;

    // Same service, but searchWithOutcome() lets the explicit button tell an empty
    // result from a failed search. The background monitor keeps the plain command.
    const discoverSnapshotCandidatesWithOutcomeCommand = () => executeDiscoverSnapshotCandidatesCommandWithOutcome({
        discoveryTag: 'forkbuild-snapshot',
        discoveryQueryService: snapshotCandidateDiscoveryQueryService
    });

    // Decides when to ask (movement threshold, stale-request protection); WorldView
    // calls observe() from its refresh tick. The explicit button remains as well.
    const worldSnapshotDiscoveryMonitor = new WorldSnapshotDiscoveryMonitor({ discoverSnapshotCandidatesCommand });

    // Only the transport half: WorldView composes the rest, since only its session
    // knows the World layout. Every substrate a claim can be announced on is
    // read, whatever the saved announcement default is. Arweave is a read-only
    // GraphQL query, so it needs no wallet. With no relay client, Nostr is simply
    // left out rather than throwing.
    const placeNamingDiscoverySources = [
        ...(nostrRelayQueryClient
            ? [recording(resolvedNostrRelayUrls.length > 1
                ? new NostrMultiRelayPlaceNamingDiscoverySource({ queryImpl: nostrRelayQueryClient, relayUrls: resolvedNostrRelayUrls })
                : new NostrPlaceNamingDiscoverySource({ queryImpl: nostrRelayQueryClient, relayUrl: resolvedNostrRelayUrls[0] }), AnnouncementKind.PLACE_NAMING, 'nostr')]
            : []),
        recording(new ArweavePlaceNamingDiscoverySource({ gatewayUrl: resolvedArweaveGatewayUrl }), AnnouncementKind.PLACE_NAMING, 'arweave'),
        ...(steemRuntime ? [recording(steemRuntime.placeNamingDiscoverySource, AnnouncementKind.PLACE_NAMING, 'steem')] : []),
        ...(announcementIndex ? [indexedSource(AnnouncementKind.PLACE_NAMING)] : [])
    ];
    const { queryService: placeNamingDiscoveryQueryService } = composePlaceNamingDiscoveryRuntime({ sources: placeNamingDiscoverySources });
    const indexedPlaceNamingDiscoveryQueryService = announcementIndex
        ? composePlaceNamingDiscoveryRuntime({ sources: [indexedSource(AnnouncementKind.PLACE_NAMING)] }).queryService
        : null;

    // Resolves exactly the selected candidate via resolveCandidate(), through the
    // same resolution registry.
    const resolveSelectedSnapshotCommand = (candidate) => executeResolveSelectedSnapshotCommand({
        candidate,
        resolver: snapshotResolver,
        storeRegistry: publicationSnapshotPlacementResolutionStoreRegistry
    });

    const materializeSnapshotFromSelectedCandidateUseCase = new MaterializeSnapshotFromSelectedCandidateUseCase(storeSnapshotContentUseCase);
    const materializeSelectedSnapshotCommand = (resolution) => executeMaterializeSelectedSnapshotCommand({
        resolution,
        materializer: materializeSnapshotFromSelectedCandidateUseCase
    });

    return {
        resolvedContentDistributionProvider, publishPlaceNamingClaimToNostrCommand, discoverSnapshotCommand,
        snapshotCandidateDiscoveryQueryService, discoverSnapshotCandidatesCommand,
        discoverSnapshotCandidatesWithOutcomeCommand, worldSnapshotDiscoveryMonitor,
        placeNamingDiscoveryQueryService, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand,
        discoverIndexedSnapshotCandidatesCommand, indexedPlaceNamingDiscoveryQueryService
    };
}
