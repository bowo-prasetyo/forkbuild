import { resolveSavedProviderDefault } from '../../application/settings/SavedProviderDefaultChoice.js';
import { RoleProviderRole } from '../../core/RoleProviderRole.js';
import { composePlaceNamingPublicationRuntime } from '../../application/placeNaming/PlaceNamingPublicationRuntimeComposition.js';
import { composeDiscoverSnapshotRuntime } from '../../application/snapshot/DiscoverSnapshotRuntimeComposition.js';
import { executeDiscoverSnapshotCommand } from '../../application/snapshot/DiscoverSnapshotCommand.js';
import { executeDiscoverSnapshotCandidatesCommand, executeDiscoverSnapshotCandidatesCommandWithOutcome } from '../../application/snapshot/DiscoverSnapshotCandidatesCommand.js';
import { WorldSnapshotDiscoveryMonitor } from '../../application/snapshot/WorldSnapshotDiscoveryMonitor.js';
import { composeSnapshotCandidateDiscoveryRuntime } from '../../application/snapshot/SnapshotCandidateDiscoveryRuntimeComposition.js';
import { ArweaveSnapshotDiscoveryQueryService } from '../../application/arweave/ArweaveSnapshotDiscoveryQueryService.js';
import { NostrPlaceNamingDiscoverySource } from '../../application/placeNaming/NostrPlaceNamingDiscoverySource.js';
import { NostrMultiRelayPlaceNamingDiscoverySource } from '../../application/placeNaming/NostrMultiRelayPlaceNamingDiscoverySource.js';
import { composePlaceNamingDiscoveryRuntime } from '../../application/placeNaming/PlaceNamingDiscoveryRuntimeComposition.js';
import { executeResolveSelectedSnapshotCommand } from '../../application/snapshot/ResolveSelectedSnapshotCommand.js';
import { MaterializeSnapshotFromSelectedCandidateUseCase } from '../../application/snapshot/materialization/MaterializeSnapshotFromSelectedCandidateUseCase.js';
import { executeMaterializeSelectedSnapshotCommand } from '../../application/snapshot/materialization/MaterializeSelectedSnapshotCommand.js';

// Composition root: the saved content provider default, Place Naming
// publication and discovery, and Snapshot discovery, candidate discovery,
// resolution and materialization commands.
export function composeSnapshotDiscovery({
    publicationSnapshotPlacementCatalog, publicationSnapshotPlacementResolutionStoreRegistry,
    roleProviderPreferenceStore, resolvedAnnouncementDiscoveryProvider, storeSnapshotContentUseCase,
    resolvedArweaveGatewayUrl, resolvedNostrRelayUrls, nostrRelayQueryClient, nostrHostPublisher,
    arweaveAnnouncementUploadTaggedTransaction, snapshotDistributionAvailableStorageTypes
}) {
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
        arweavePlaceNamingDiscoveryPublisherOptions: { gatewayUrl: resolvedArweaveGatewayUrl, uploadTaggedTransaction: arweaveAnnouncementUploadTaggedTransaction }
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
        nostrSnapshotDiscoveryQueryService: snapshotDiscoveryQueryService,
        arweaveSnapshotDiscoveryQueryService,
        placementCatalog: publicationSnapshotPlacementCatalog
    });

    // Answers "what was announced under this tag", as opposed to resolving one
    // contentHash. Local catalog entries (including peer announcements) and
    // Nostr/Arweave all reach callers through the one composite service.
    const discoverSnapshotCandidatesCommand = () => executeDiscoverSnapshotCandidatesCommand({
        discoveryTag: 'forkbuild-snapshot',
        discoveryQueryService: snapshotCandidateDiscoveryQueryService
    });

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
    // knows the World layout. With no relay client, `sources` is an empty but
    // usable roster rather than a throw.
    const placeNamingDiscoverySources = nostrRelayQueryClient
        ? [resolvedNostrRelayUrls.length > 1
            ? new NostrMultiRelayPlaceNamingDiscoverySource({ queryImpl: nostrRelayQueryClient, relayUrls: resolvedNostrRelayUrls })
            : new NostrPlaceNamingDiscoverySource({ queryImpl: nostrRelayQueryClient, relayUrl: resolvedNostrRelayUrls[0] })]
        : [];
    const { queryService: placeNamingDiscoveryQueryService } = composePlaceNamingDiscoveryRuntime({ sources: placeNamingDiscoverySources });

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
        placeNamingDiscoveryQueryService, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand
    };
}
