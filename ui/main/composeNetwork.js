import { CreatePublicationCommentaryDistributionPeerExchangeUseCase } from '../../application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js';
import { createPublicationCommentaryDistributor, createSavedPublicationCommentaryDistributor } from '../../application/publication/commentary/PublicationCommentaryDistributor.js';
import { PublicationCommentaryDistributionLog } from '../../application/publication/commentary/PublicationCommentaryDistributionLog.js';
import { PublicationCommentaryRemoteNotificationBridge } from '../../application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js';
import { NostrMultiRelayPublicationCommentaryDistribution } from '../../application/nostr/NostrMultiRelayPublicationCommentaryDistribution.js';
import { DiscoverPublicationCommentaryFromNostrUseCase } from '../../application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js';
import { PublicationCommentaryArweaveDistribution } from '../../application/publication/commentary/PublicationCommentaryArweaveDistribution.js';
import { DiscoverPublicationCommentaryFromArweaveUseCase } from '../../application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js';
import { DiscoverPublicationCommentaryUseCase } from '../../application/publication/commentary/DiscoverPublicationCommentaryUseCase.js';
import { SetPublicationHeartUseCase } from '../../application/publication/heart/SetPublicationHeartUseCase.js';
import { PublicationHeartDistributionLog, createPublicationHeartDistributor } from '../../application/publication/heart/PublicationHeartDistributor.js';
import { PublicationHeartNotificationBridge } from '../../application/publication/heart/PublicationHeartNotifications.js';
import { NostrPublicationHeartDistribution } from '../../application/nostr/NostrPublicationHeartDistribution.js';
import { HeartDistributionPreferenceStore } from '../../storage/HeartDistributionPreferenceStore.js';
import { createIdentityNames } from '../../application/publication/identityNames.js';
import { CreateDiscoveryUseCase } from '../../application/discovery/CreateDiscoveryUseCase.js';
import { createVerifiedPublisherResolver } from '../../application/publication/FollowingFeed.js';
import { Publication } from '../../publisher/Publication.js';
import { NotificationEventStore } from '../../storage/NotificationEventStore.js';
import { CompositeDiscoveryProvider } from '../../discovery/CompositeDiscoveryProvider.js';
import { FriendshipState } from '../../core/social/FriendshipState.js';
import { SharePublicationWithPeersUseCase } from '../../application/publication/sharing/SharePublicationWithPeersUseCase.js';
import { RetrieveSharedPublicationUseCase } from '../../application/publication/sharing/RetrieveSharedPublicationUseCase.js';
import { AutoRetrieveSharedPublicationsUseCase } from '../../application/publication/sharing/AutoRetrieveSharedPublicationsUseCase.js';
import { CreatePublicationResolverUseCase } from '../../application/publication/CreatePublicationResolverUseCase.js';
import { CreatePublicationPeerExchangeUseCase } from '../../application/publication/CreatePublicationPeerExchangeUseCase.js';
import { CreatePublicationResolutionCoordinatorUseCase } from '../../application/publication/CreatePublicationResolutionCoordinatorUseCase.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../../application/publication/CreatePublicationDisplayKindRegistryUseCase.js';
import { ReconstructPublicationDiscoveryUseCase } from '../../application/publication/ReconstructPublicationDiscoveryUseCase.js';
import { CreateWorldEncounterPublicationAdmissionLogUseCase } from '../../application/worldEncounter/CreateWorldEncounterPublicationAdmissionLogUseCase.js';
import { ReconstructWorldEncounterPublicationDiscoveryUseCase } from '../../application/worldEncounter/ReconstructWorldEncounterPublicationDiscoveryUseCase.js';
import { CreatePublicationAnchorPeerExchangeUseCase } from '../../application/anchoring/CreatePublicationAnchorPeerExchangeUseCase.js';
import { CreatePublicationSnapshotPlacementPeerExchangeUseCase } from '../../application/snapshot/placement/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js';
import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { OwnPublicationDistributionRecord } from '../../application/publication/OwnPublicationDistributionRecord.js';
import { OwnSnapshotDistributionLog } from '../../application/snapshot/OwnSnapshotDistributionLog.js';
import { AnnouncementIndex } from '../../application/announcementIndex/AnnouncementIndex.js';
import { createFollowedAnnouncementRetention } from '../../application/announcementIndex/FollowedAnnouncementRetention.js';
import { FollowingFeed } from '../../application/publication/FollowingFeed.js';
import { FollowedAuthorPublicationNotifier } from '../../application/publication/FollowedAuthorPublicationNotifier.js';
import { RemixedBuildNotifier } from '../../application/publication/RemixedBuildNotifier.js';
import { currentIdentityId } from '../../identity/SigningReadiness.js';
import { composeAnnouncementSync } from './composeAnnouncementSync.js';
import { LocalDiscoveryProvider } from '../../discovery/LocalDiscoveryProvider.js';
import { UnpublishedPublicationLog } from '../../publisher/UnpublishedPublicationLog.js';
import { composeRefreshPublicationCommentaryCommand } from '../../application/publication/commentary/RefreshPublicationCommentaryCommandComposition.js';
import { composeIdentityAndPeers } from './composeIdentityAndPeers.js';
import { composeContentAndSnapshots } from './composeContentAndSnapshots.js';
import { composeWorldDiscovery } from './composeWorldDiscovery.js';
import { composeInjectedWalletServices } from './composeInjectedWalletServices.js';
import { composeBuildNotes } from './composeBuildNotes.js';
import { challengeDiscoveryWithBuildNotes, repositoryDiscoveryWithBuildNotes } from '../../application/buildNotes/WithBuildNotes.js';
import { NetworkWriterSettingsStore } from '../../application/settings/NetworkWriterSettingsStore.js';
import { NetworkWriterLoader } from './NetworkWriterLoader.js';
import { followNetworkWriterSwitches } from './followNetworkWriterSwitches.js';
import { isWritable } from '../../core/publication/NetworkWriters.js';
import { DEFAULT_ANNOUNCEMENT_DISCOVERY_PROVIDER } from '../../core/publication/AnnouncementDiscoveryProvider.js';
import { SteemAnnouncingConfigurationStore } from '../../storage/SteemAnnouncingConfigurationStore.js';
import { BlurtAnnouncingConfigurationStore } from '../../storage/BlurtAnnouncingConfigurationStore.js';
import { ownIdentityIdsOf } from '../../application/document/DocumentImportPolicy.js';
import { SimilarBuildFinder } from '../../application/publication/SimilarBuildFinder.js';
import { LookAlikeBuildNotifier } from '../../application/publication/LookAlikeBuildNotifier.js';
import { LookAlikeWaitingStore } from '../../application/publication/LookAlikeWaitingStore.js';
import { createOwnPublicationCheck } from '../../application/publication/OwnPublicationCheck.js';
import { HelpedBuildsStore } from '../../application/buildTogether/HelpedBuildsStore.js';
import { HelpedBuildsSyncUseCase } from '../../application/buildTogether/HelpedBuildsSyncUseCase.js';
import { verifyClaimedBuildPublication } from '../../application/snapshot/claimed/VerifyClaimedBuildPublication.js';
import { RepositoryNetworkDiscovery } from '../../application/publication/RepositoryNetworkDiscovery.js';
import { ChallengeEntryDiscovery } from '../../application/challenge/ChallengeEntryDiscovery.js';
import { ChallengeEntryLog } from '../../application/challenge/ChallengeEntryLog.js';
import { NetworkPublicationLocatorStore } from '../../application/publication/NetworkPublicationLocatorStore.js';
import { PublisherPlacementClaimLookup } from '../../application/placement/PublisherPlacementClaim.js';
import { LocalPlacementRegistry } from '../../placement/LocalPlacementRegistry.js';
import { FindOwnSharedPublicationUseCase } from '../../application/publication/sharing/FindOwnSharedPublicationUseCase.js';
import { LocalPublisherProvider } from '../../publisher/LocalPublisherProvider.js';
import { PublicationSnapshotPlacementDiscoveryCoordinator } from '../../application/snapshot/placement/PublicationSnapshotPlacementDiscoveryCoordinator.js';
import { PublicationAnchorDiscoveryCoordinator } from '../../application/anchoring/PublicationAnchorDiscoveryCoordinator.js';
import { PeerContentExchange } from '../../application/peer/PeerContentExchange.js';

// The network runtime: everything that talks to other devices and networks,
// built after the app's shell (ui/main.js) has drawn the first page. Peer
// sessions and the stores and exchanges that listen on them, the publication
// catalogs, World discovery over Nostr, Arweave, IPFS, Steem and Blurt,
// comments and hearts, and the announcement index's background sync, each
// provided to the app as it is built. Returns what the service groups
// defined in ui/main.js build on.
export async function composeNetwork({ app, decentralizedPublicationDiscoveryProvider, identityProvider, identityUseCase }) {
    const {
        createPublicationCommentaryCommand, getPublicationCommentariesCommand,
        iceServerConfigurationStore, turnServerConfigurationStore, setTurnServerConfigurationUseCase,
        setIceServerConfigurationUseCase, rendezvousConfigurationStore, setRendezvousConfigurationUseCase,
        bitcoinEsploraConfigurationStore, resolvedBitcoinEsploraApiUrls, setBitcoinEsploraConfigurationUseCase,
        peerSessionManager, peerRelationshipUseCase, peerReconnectionUseCase, findPeerUseCase, peerMessageBus,
        peerBlockUseCase, deviceAuthorizationUseCase, friendRelationshipUseCase,
        identityLifecyclePropagationUseCase, chatUseCase, peerPresenceUseCase, deviceConversationSyncUseCase,
        voiceUseCase, publicLobbyUseCase, followUseCase, peerConnectionProvider, rendezvousTransports
    } = composeIdentityAndPeers({ identityProvider, decentralizedPublicationDiscoveryProvider });

    // The one LocalPublicationCatalog instance; every collaborator below shares it.
    const { publicationResolver, contentStore: publicationContentStore } = new CreatePublicationResolverUseCase().execute();
    // Also starts PublicationPeerConnectionSync (no binding needed): an
    // authenticated peer automatically receives this replica's cataloged
    // Publications.
    const { catalog: publicationCatalog, peerExchange: publicationPeerExchange } = new CreatePublicationPeerExchangeUseCase().execute({
        peerMessageBus,
        connectedPeerRegistry: peerSessionManager.registry
    });
    const publicationPeerContentExchange = new PeerContentExchange(publicationContentStore, peerMessageBus, peerSessionManager.registry, publicationCatalog);
    const { coordinator: publicationResolutionCoordinator } = new CreatePublicationResolutionCoordinatorUseCase().execute({
        publicationResolver,
        peerContentExchange: publicationPeerContentExchange
    });
    // Kept separate from the durable stores: checking what a publication resolves
    // to must never import it into them.
    const { kindPlugins: publicationDisplayKindPlugins, publicationKindPlugin } = new CreatePublicationDisplayKindRegistryUseCase().execute();

    // Rebuilds the in-memory discovery index from the durable catalog before the
    // provider is handed out. Performs no network retrieval.
    await new ReconstructPublicationDiscoveryUseCase(
        publicationCatalog, publicationResolutionCoordinator, publicationDisplayKindPlugins, decentralizedPublicationDiscoveryProvider
    ).execute();

    // World Encounter admissions keep their own durable log (the catalog stores a
    // different envelope shape) and are rebuilt into the same discovery provider.
    const { admissionLog: worldEncounterPublicationAdmissionLog } = new CreateWorldEncounterPublicationAdmissionLogUseCase().execute();
    new ReconstructWorldEncounterPublicationDiscoveryUseCase(
        worldEncounterPublicationAdmissionLog, decentralizedPublicationDiscoveryProvider
    ).execute();

    // Following: a local list, matched against verified Publication signatures.
    // Subscribed only after the rebuild above, so what was already here at startup
    // never notifies again.
    // Reads what the Repository reads: this device's catalog (other identities
    // signed in here) and what was admitted from peers and the network.
    const followingFeed = new FollowingFeed({
        discoveryProvider: new CompositeDiscoveryProvider([
            new LocalDiscoveryProvider(new LocalStorageProvider()),
            decentralizedPublicationDiscoveryProvider
        ]),
        isFollowing: (identityId) => followUseCase.isFollowing(identityId),
        isBlocked: (identityId) => peerBlockUseCase.isBlocked(identityId)
    });
    const followedAuthorPublicationNotifier = new FollowedAuthorPublicationNotifier({
        identityProvider,
        isFollowing: (identityId) => followUseCase.isFollowing(identityId),
        isBlocked: (identityId) => peerBlockUseCase.isBlocked(identityId),
        notificationSink: (notificationEvent) => new NotificationEventStore(new LocalStorageProvider()).save(notificationEvent)
    });
    // A remix of one of the signed-in identity's own builds, found the same way.
    const remixedBuildNotifier = new RemixedBuildNotifier({
        identityProvider,
        findPublicationsOfDocument: (documentId) => new CompositeDiscoveryProvider([
            new LocalDiscoveryProvider(new LocalStorageProvider()),
            decentralizedPublicationDiscoveryProvider
        ]).findByDocumentId(documentId),
        isBlocked: (identityId) => peerBlockUseCase.isBlocked(identityId),
        notificationSink: (notificationEvent) => new NotificationEventStore(new LocalStorageProvider()).save(notificationEvent)
    });
    decentralizedPublicationDiscoveryProvider.onAdded((publication) => {
        followedAuthorPublicationNotifier.handlePublicationAdmitted(publication);
        remixedBuildNotifier.handlePublicationAdmitted(publication);
    });

    // Shares the commentary store's localStorage keys with
    // createPublicationCommentaryCommand. The store keeps no cache, so a saved
    // comment is immediately visible to announce(). Hearts ride the same peer
    // messages and comment readers: `publicationCommentaryDistributionExchange`
    // is the routed exchange, which sends a heart envelope to the heart store
    // (application/publication/heart/withHeartRouting.js).
    const {
        routedExchange: publicationCommentaryDistributionExchange,
        peerExchange: publicationCommentaryDistributionPeerExchange,
        heartStore: publicationHeartStore,
        heartExchange: publicationHeartExchange
    } = new CreatePublicationCommentaryDistributionPeerExchangeUseCase().execute({
        identityProvider,
        peerMessageBus,
        connectedPeerRegistry: peerSessionManager.registry,
        onHeart: (result) => handleHeartReceived(result)
    });

    // Assigned later, once the Nostr host capabilities exist.
    // addPublicationCommentaryCommand reads it only when called.
    let publicationCommentaryNostrDistribution = null;
    // Same, for Arweave.
    let publicationCommentaryArweaveDistribution = null;
    // Same, for Steem.
    let publicationCommentarySteemDistribution = null;
    // Same, for Blurt.
    let publicationCommentaryBlurtDistribution = null;

    // A network's comment distribution, or null when that network isn't set up on
    // this device (Steem and Blurt without a runtime). Never another network in its
    // place: the distribution log records the network that was asked. An unknown
    // value means Nostr. Read on each call: the networks are set up later in this
    // file.
    function publicationCommentarySubstrateFor(provider) {
        const substrates = {
            nostr: publicationCommentaryNostrDistribution,
            arweave: publicationCommentaryArweaveDistribution,
            steem: publicationCommentarySteemDistribution,
            blurt: publicationCommentaryBlurtDistribution
        };
        return provider in substrates ? substrates[provider] : substrates.nostr;
    }

    // Which networks this device has sent each of its comments to.
    const publicationCommentaryDistributionLog = new PublicationCommentaryDistributionLog(new LocalStorageProvider());

    // Sends a saved comment to connected peers and at most one network, chosen per
    // comment or else the saved comment default (which falls back to the
    // Announcement / Discovery preference). World View saves its comments through
    // its own session and hands them here.
    const distributePublicationCommentaryCommand = createPublicationCommentaryDistributor({
        peerExchange: publicationCommentaryDistributionPeerExchange,
        distributionExchange: publicationCommentaryDistributionExchange,
        substrateFor: publicationCommentarySubstrateFor,
        defaultProvider: () => resolvedCommentaryDistributionProvider,
        distributionLog: publicationCommentaryDistributionLog
    });

    // Distribute, on one of your own comments: sends it to one network later and
    // reports the outcome.
    const distributeSavedPublicationCommentaryCommand = createSavedPublicationCommentaryDistributor({
        distributionExchange: publicationCommentaryDistributionExchange,
        substrateFor: publicationCommentarySubstrateFor,
        distributionLog: publicationCommentaryDistributionLog
    });

    // Creates the comment locally first, then distributes it; distribution never
    // undoes or fails the local create.
    function addPublicationCommentaryCommand(input) {
        const result = createPublicationCommentaryCommand(input);
        distributePublicationCommentaryCommand(result.commentary, input && input.discoveryProvider);
        return result;
    }

    // Turns verified remote comment arrivals into the same publication.commented
    // notification that local creation produces.
    const publicationCommentaryRemoteNotificationBridge = new PublicationCommentaryRemoteNotificationBridge(
        new LocalDiscoveryProvider(new LocalStorageProvider()),
        identityProvider,
        (notificationEvent) => new NotificationEventStore(new LocalStorageProvider()).save(notificationEvent)
    );
    // onCommentaryReceived fires inside PeerMessageBus dispatch without subscriber
    // isolation, so a notification failure must not propagate.
    publicationCommentaryDistributionPeerExchange.onCommentaryReceived((result) => {
        try {
            publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result);
        } catch {
        }
    });

    // Hearts (docs/Protocol.md, "Publication Hearts"): one tap gives or takes back
    // this identity's heart, kept here first, then sent to connected peers and to
    // the network chosen for hearts in Settings (Nostr unless changed, as a
    // reaction). Each person's latest record counts.
    const heartDistributionPreferenceStore = new HeartDistributionPreferenceStore(new LocalStorageProvider());
    const publicationHeartDistributionLog = new PublicationHeartDistributionLog(new LocalStorageProvider());
    const setPublicationHeartUseCase = new SetPublicationHeartUseCase(publicationHeartStore, identityProvider);
    // Assigned once the Nostr host capabilities exist, like the comment carriers.
    let publicationHeartNostrDistribution = null;
    // Nostr carries hearts as reactions; every other network carries them as it
    // carries comments, told apart by the record's kind.
    function publicationHeartSubstrateFor(provider) {
        return provider === 'nostr' ? publicationHeartNostrDistribution : publicationCommentarySubstrateFor(provider);
    }
    const distributePublicationHeart = createPublicationHeartDistributor({
        peerExchange: publicationCommentaryDistributionPeerExchange,
        heartExchange: publicationHeartExchange,
        substrateFor: publicationHeartSubstrateFor,
        // A network whose writer is switched off (Steem, Blurt) sends nothing
        // there, like comments; peers still get the heart.
        provider: () => {
            const chosen = heartDistributionPreferenceStore.get();
            return isWritable(chosen, networkWriterSettingsStore.get()) ? chosen : 'nostr';
        },
        distributionLog: publicationHeartDistributionLog
    });
    // Anything showing hearts re-reads them when they change here: a tap, or a
    // heart accepted from a peer or a network.
    const publicationHeartListeners = new Set();
    const publicationHeartsChanges = Object.freeze({
        subscribe(listener) {
            publicationHeartListeners.add(listener);
            return () => publicationHeartListeners.delete(listener);
        }
    });
    function notifyPublicationHeartsChanged(publicationId) {
        for (const listener of publicationHeartListeners) {
            try {
                listener(publicationId);
            } catch {
            }
        }
    }
    // Tells a builder of a new heart on their build.
    const publicationHeartNotificationBridge = new PublicationHeartNotificationBridge(
        new LocalDiscoveryProvider(new LocalStorageProvider()),
        identityProvider,
        publicationHeartStore,
        (notificationEvent) => new NotificationEventStore(new LocalStorageProvider()).save(notificationEvent)
    );
    function handleHeartReceived(result) {
        if (!result || !result.heart) return;
        try {
            publicationHeartNotificationBridge.handleHeartReceived(result);
        } catch {
        }
        if (result.isNew) notifyPublicationHeartsChanged(result.heart.publicationId);
    }
    // The people who love a build as far as this device knows (each person's
    // latest record), and whether this identity is one of them.
    function getPublicationHeartsCommand(publicationId) {
        const hearts = publicationHeartStore.currentHearts(publicationId);
        // A locked name still sees its own heart: reading needs no signature.
        const me = currentIdentityId(identityProvider);
        return Object.freeze({ hearts, mine: Boolean(me) && hearts.some((heart) => heart.authorIdentityId === me), ownIdentityId: me || null });
    }
    // Gives or takes back this identity's heart. Throws (a UserFacingError) when
    // no name can sign (none, locked or revoked); sending it on never fails the tap.
    function setPublicationHeartCommand({ publicationId, hearted }) {
        const heart = setPublicationHeartUseCase.execute({ publicationId, hearted });
        if (heart) {
            notifyPublicationHeartsChanged(publicationId);
            distributePublicationHeart(heart);
        }
        return heart;
    }

    // The one anchor catalog and knowledge store. Anchors from peers are cataloged
    // on arrival; verification only runs on an explicit Verify click.
    const { catalog: publicationAnchorCatalog, peerExchange: publicationAnchorPeerExchange, knowledgeStore: anchorKnowledgeStore } = new CreatePublicationAnchorPeerExchangeUseCase().execute({
        peerMessageBus,
        connectedPeerRegistry: peerSessionManager.registry
    });

    const publicationAnchorDiscoveryCoordinator = new PublicationAnchorDiscoveryCoordinator(publicationAnchorPeerExchange);

    // The one placement catalog. Persisted records that no longer validate are
    // pruned at construction. Resolution stays a separate, on-demand call.
    const {
        catalog: publicationSnapshotPlacementCatalog,
        peerExchange: publicationSnapshotPlacementPeerExchange,
        knowledgeStore: placementKnowledgeStore
    } = new CreatePublicationSnapshotPlacementPeerExchangeUseCase().execute({
        peerMessageBus,
        connectedPeerRegistry: peerSessionManager.registry
    });
    const publicationSnapshotPlacementDiscoveryCoordinator = new PublicationSnapshotPlacementDiscoveryCoordinator(publicationSnapshotPlacementPeerExchange);

    const {
        ipfsGatewayConfigurationStore, ipfsNodeConfigurationStore, ipfsRemotePinningSettingsStore, resolvedIpfsNodeApiUrl, resolvedIpfsGatewayUrls,
        composeIpfsGatewayContentStore, publicationSnapshotPlacementResolutionCoordinator,
        publicationSnapshotPlacementResolutionStoreRegistry, snapshotPlacementViewRegistry,
        publicationCatalogContentResolver, snapshotPlacementStoreRegistry, snapshotPlacementCreationCoordinator,
        roleProviderPreferenceStore, preferredSnapshotPlacementCreationCoordinator,
        setRoleProviderPreferenceUseCase, resolvedAnnouncementDiscoveryProvider,
        commentaryDistributionPreferenceStore, resolvedCommentaryDistributionProvider,
        localSnapshotContentAvailabilityUseCase, storeSnapshotContentUseCase,
        snapshotContentMaterializationCoordinator, exportSnapshotCommand,
        snapshotPlacementMaterializationCoordinator, snapshotPeerMaterializationCoordinator,
        snapshotPeerPossessionCoordinator, snapshotMaterializationSelectionCoordinator,
        publicationEvidenceDiscoveryCoordinator, publicationKnowledgeSynchronizationCoordinator,
        materializeSnapshotFromPeerUseCase
    } = composeContentAndSnapshots({
        identityProvider, peerSessionManager, peerMessageBus, publicationContentStore, publicationCatalog,
        publicationAnchorDiscoveryCoordinator, publicationSnapshotPlacementCatalog, placementKnowledgeStore,
        publicationSnapshotPlacementPeerExchange, publicationSnapshotPlacementDiscoveryCoordinator
    });
    // Share with Peers: this identity's own Worlds offered to peers, and Worlds
    // peers shared, retrieved automatically from Friends, Known Peers and people
    // you follow, and by hand from anyone else. A connection counts as the
    // identity it speaks for, so a friend's authorized device counts as the friend.
    const identityOfConnection = (connectedPeer) => {
        const resolved = deviceAuthorizationUseCase.resolveConnectionIdentity(connectedPeer);
        return resolved ? resolved.identityId : (connectedPeer.remoteIdentity ? connectedPeer.remoteIdentity.identityId : null);
    };
    const sharePublicationWithPeersUseCase = new SharePublicationWithPeersUseCase({
        publicationResolver, publicationCatalog, publicationPeerExchange, identityProvider, publicationKindPlugin
    });
    const retrieveSharedPublicationUseCase = new RetrieveSharedPublicationUseCase({
        publicationCatalog,
        resolutionCoordinator: publicationResolutionCoordinator,
        publicationKindPlugin,
        discoveryProvider: decentralizedPublicationDiscoveryProvider,
        contentStore: publicationContentStore,
        materializeSnapshotFromPeer: materializeSnapshotFromPeerUseCase,
        connectedPeerRegistry: peerSessionManager.registry,
        identityProvider,
        identityOfConnection,
        storageProvider: new LocalStorageProvider()
    });
    const autoRetrieveSharedPublicationsUseCase = new AutoRetrieveSharedPublicationsUseCase({
        retrieveSharedPublicationUseCase,
        publicationPeerExchange,
        connectedPeerRegistry: peerSessionManager.registry,
        identityOfConnection,
        publicationKindPlugin,
        isTrustedSharer: (identityId) => !peerBlockUseCase.isBlocked(identityId)
            && (friendRelationshipUseCase.getState(identityId) === FriendshipState.FRIEND
                || peerRelationshipUseCase.isKnown(identityId)
                || followUseCase.isFollowing(identityId))
    });

    app.provide('peerSessionManager', peerSessionManager);
    app.provide('peerRelationshipUseCase', peerRelationshipUseCase);
    app.provide('peerReconnectionUseCase', peerReconnectionUseCase);
    app.provide('findPeerUseCase', findPeerUseCase);
    app.provide('publicLobbyUseCase', publicLobbyUseCase);
    // Leaving takes a card out of every lobby at once instead of leaving it
    // listed until it expires. Best effort: the page may be gone first.
    window.addEventListener('pagehide', () => { publicLobbyUseCase.leaveAll(); });
    // A lobby card speaks for the identity that signed it; switching identity
    // takes it out rather than leave it listed beside the new identity's offers.
    identityUseCase.onSessionChanged(() => { publicLobbyUseCase.leaveAll(); });
    app.provide('friendRelationshipUseCase', friendRelationshipUseCase);
    app.provide('identityLifecyclePropagationUseCase', identityLifecyclePropagationUseCase);
    app.provide('deviceAuthorizationUseCase', deviceAuthorizationUseCase);
    app.provide('peerBlockUseCase', peerBlockUseCase);
    app.provide('followUseCase', followUseCase);
    app.provide('followingFeed', followingFeed);
    app.provide('chatUseCase', chatUseCase);
    app.provide('peerPresenceUseCase', peerPresenceUseCase);
    app.provide('deviceConversationSyncUseCase', deviceConversationSyncUseCase);
    app.provide('voiceUseCase', voiceUseCase);
    app.provide('peerMessageBus', peerMessageBus);
    app.provide('publicationResolver', publicationResolver);
    app.provide('publicationCatalog', publicationCatalog);
    app.provide('publicationPeerExchange', publicationPeerExchange);
    app.provide('publicationPeerContentExchange', publicationPeerContentExchange);
    app.provide('publicationResolutionCoordinator', publicationResolutionCoordinator);
    app.provide('publicationDisplayKindPlugins', publicationDisplayKindPlugins);
    app.provide('decentralizedPublicationDiscoveryProvider', decentralizedPublicationDiscoveryProvider);
    app.provide('worldEncounterPublicationAdmissionLog', worldEncounterPublicationAdmissionLog);
    app.provide('getPublicationCommentariesCommand', getPublicationCommentariesCommand);
    app.provide('addPublicationCommentaryCommand', addPublicationCommentaryCommand);
    app.provide('distributePublicationCommentaryCommand', distributePublicationCommentaryCommand);
    app.provide('distributeSavedPublicationCommentaryCommand', distributeSavedPublicationCommentaryCommand);
    app.provide('publicationCommentaryDistributionLog', publicationCommentaryDistributionLog);
    app.provide('publicationAnchorCatalog', publicationAnchorCatalog);
    app.provide('publicationAnchorPeerExchange', publicationAnchorPeerExchange);
    app.provide('publicationAnchorDiscoveryCoordinator', publicationAnchorDiscoveryCoordinator);
    app.provide('publicationEvidenceDiscoveryCoordinator', publicationEvidenceDiscoveryCoordinator);
    app.provide('publicationKnowledgeSynchronizationCoordinator', publicationKnowledgeSynchronizationCoordinator);
    app.provide('anchorKnowledgeStore', anchorKnowledgeStore);
    app.provide('publicationCatalogContentResolver', publicationCatalogContentResolver);
    // World Publications' bytes live in publicationContentStore, not in
    // publicationCatalog (which only holds peer-announced envelopes), so readers
    // look them up by contentReference here.
    app.provide('publicationContentStore', publicationContentStore);
    app.provide('sharePublicationWithPeersUseCase', sharePublicationWithPeersUseCase);
    // Which of this device's own Worlds an unresolvable catalog entry shares, for
    // the Publications page's "Open in Editor" on an old, legacy-hash entry.
    app.provide('findOwnSharedPublicationUseCase', new FindOwnSharedPublicationUseCase({ contentStore: publicationContentStore, publisherProvider: new LocalPublisherProvider(new LocalStorageProvider()) }));
    // The publisher's signed placement of a World, announced beside its Snapshot
    // when the Publications page distributes it, as World View does.
    const publisherPlacementClaimLookup = new PublisherPlacementClaimLookup(new LocalPlacementRegistry(new LocalStorageProvider()));
    app.provide('publisherPlacementClaimLookup', publisherPlacementClaimLookup);
    app.provide('retrieveSharedPublicationUseCase', retrieveSharedPublicationUseCase);
    app.provide('autoRetrieveSharedPublicationsUseCase', autoRetrieveSharedPublicationsUseCase);
    app.provide('publicationSnapshotPlacementCatalog', publicationSnapshotPlacementCatalog);
    const ownSnapshotDistributionLog = new OwnSnapshotDistributionLog(new LocalStorageProvider());
    app.provide('publicationDistributionRecord', new OwnPublicationDistributionRecord({
        storageProvider: new LocalStorageProvider(),
        placementCatalog: publicationSnapshotPlacementCatalog,
        snapshotDistributionLog: ownSnapshotDistributionLog
    }));
    app.provide('publicationSnapshotPlacementPeerExchange', publicationSnapshotPlacementPeerExchange);
    app.provide('publicationSnapshotPlacementDiscoveryCoordinator', publicationSnapshotPlacementDiscoveryCoordinator);
    app.provide('publicationSnapshotPlacementResolutionCoordinator', publicationSnapshotPlacementResolutionCoordinator);
    app.provide('snapshotPlacementViewRegistry', snapshotPlacementViewRegistry);
    app.provide('placementKnowledgeStore', placementKnowledgeStore);
    app.provide('snapshotPlacementCreationCoordinator', snapshotPlacementCreationCoordinator);
    app.provide('preferredSnapshotPlacementCreationCoordinator', preferredSnapshotPlacementCreationCoordinator);
    app.provide('roleProviderPreferenceStore', roleProviderPreferenceStore);
    // Network Settings' writer switches (core/publication/NetworkWriters.js): which network
    // writers this device builds. Bitcoin's and Base's wallets are plugins, built
    // after the 'anchoring' group (ui/main.js), only when switched on. Steem's and
    // Blurt's share their readers' runtime: their switches decide what is offered
    // and whether anything is posted, and start on for a device that already has
    // an account saved to post as.
    const networkWriterSettingsStore = new NetworkWriterSettingsStore({
        storageProvider: new LocalStorageProvider(),
        defaults: {
            steem: () => Boolean(new SteemAnnouncingConfigurationStore(new LocalStorageProvider()).get()?.account),
            blurt: () => Boolean(new BlurtAnnouncingConfigurationStore(new LocalStorageProvider()).get()?.account)
        }
    });
    // Kept from now on, whatever later happens to the account.
    networkWriterSettingsStore.adoptDefaults();
    app.provide('networkWriterSettingsStore', networkWriterSettingsStore);
    const networkWriterLoader = new NetworkWriterLoader({
        settingsStore: networkWriterSettingsStore,
        plugins: {
            bitcoin: async (anchoring) => {
                const { composeBitcoinWallet } = await import('./plugins/composeBitcoinWallet.js');
                return composeBitcoinWallet({ anchoring, resolvedBitcoinEsploraApiUrls });
            },
            base: async (anchoring) => {
                const { composeBaseWallet } = await import('./plugins/composeBaseWallet.js');
                return composeBaseWallet({ anchoring });
            }
        },
        provide: (key, value) => app.provide(key, value)
    });
    // Publish, a build's page and World View point out builds that look a lot
    // like another; theirs are read from the same places the Repository lists.
    const similarBuildFinder = new SimilarBuildFinder({
        listPublications: () => new CompositeDiscoveryProvider([
            new LocalDiscoveryProvider(new LocalStorageProvider()),
            decentralizedPublicationDiscoveryProvider
        ]).list(),
        contentStore: publicationContentStore,
        ownIdentityIds: () => ownIdentityIdsOf(identityProvider),
        // The Build Library's structures, whose bricks don't make builds look alike.
        readyMadeStructures: async () => {
            const { CreateStructureRegistryUseCase } = await import('../../application/editor/CreateStructureRegistryUseCase.js');
            return new CreateStructureRegistryUseCase().execute().getAll();
        }
    });
    app.provide('similarBuildFinder', similarBuildFinder);
    // Whether `publication` is the person's own (published here, or signed by an
    // identity this device holds or acts for): its card in Explore lists the
    // look-alikes published after it.
    app.provide('isOwnPublication', createOwnPublicationCheck({
        findPublishedHere: (id) => new LocalDiscoveryProvider(new LocalStorageProvider()).findById(id),
        ownIdentityIds: () => {
            let actingFor = null;
            try {
                actingFor = deviceAuthorizationUseCase?.resolveOwnSocialIdentity?.()?.identityId || null;
            } catch {
                actingFor = null;
            }
            return ownIdentityIdsOf(identityProvider, actingFor ? [actingFor] : []);
        }
    }));
    // A build admitted here that looks like one of the signed-in identity's own,
    // published before it, goes to the 🔔, as a remix of theirs does.
    const lookAlikeBuildNotifier = new LookAlikeBuildNotifier({
        identityProvider,
        similarBuildFinder,
        isBlocked: (identityId) => peerBlockUseCase.isBlocked(identityId),
        notificationSink: (notificationEvent) => new NotificationEventStore(new LocalStorageProvider()).save(notificationEvent),
        waitingStore: new LookAlikeWaitingStore({ storageProvider: new LocalStorageProvider() })
    });
    decentralizedPublicationDiscoveryProvider.onAdded((publication) => {
        lookAlikeBuildNotifier.handlePublicationAdmitted(publication);
    });
    // A build admitted before its bytes is compared when they arrive, by either
    // way incoming bytes are stored: the snapshot store networks, links and
    // packages share, and a connected peer's answer.
    storeSnapshotContentUseCase.onStored(({ contentHash }) => {
        lookAlikeBuildNotifier.handleContentStored(contentHash);
    });
    publicationPeerContentExchange.onContentReceived(({ hash }) => {
        lookAlikeBuildNotifier.handleContentStored(hash);
    });
    // Builds a past visit left waiting for their bytes, from the Publications
    // rebuilt above.
    lookAlikeBuildNotifier.restoreWaiting((publicationId) => decentralizedPublicationDiscoveryProvider.findById(publicationId)
        || new LocalDiscoveryProvider(new LocalStorageProvider()).findById(publicationId));
    // The builds each identity helped make with friends (Build with me).
    const helpedBuildsStore = new HelpedBuildsStore({ storageProvider: new LocalStorageProvider() });
    app.provide('helpedBuildsStore', helpedBuildsStore);
    // ...and on each of your devices: the list goes to your others while connected.
    if (peerMessageBus && peerSessionManager && deviceAuthorizationUseCase) {
        app.provide('helpedBuildsSync', new HelpedBuildsSyncUseCase({
            peerMessageBus, connectedPeerRegistry: peerSessionManager.registry, deviceAuthorization: deviceAuthorizationUseCase, store: helpedBuildsStore
        }));
    }
    app.provide('setRoleProviderPreferenceUseCase', setRoleProviderPreferenceUseCase);
    // The saved default networks, as seeds this device can write to: one naming
    // Steem or Blurt with its writer switched off (core/publication/NetworkWriters.js) seeds
    // Nostr instead. Read once, here, like the preferences themselves.
    const writableAnnouncementDiscoveryProvider = isWritable(resolvedAnnouncementDiscoveryProvider, networkWriterSettingsStore.get())
        ? resolvedAnnouncementDiscoveryProvider
        : DEFAULT_ANNOUNCEMENT_DISCOVERY_PROVIDER;
    const writableCommentaryDistributionProvider = isWritable(resolvedCommentaryDistributionProvider, networkWriterSettingsStore.get())
        ? resolvedCommentaryDistributionProvider
        : writableAnnouncementDiscoveryProvider;
    // Only a seed for each Announcement/Discovery picker's own selection, never
    // read again after the picker mounts.
    app.provide('defaultAnnouncementDiscoveryProvider', writableAnnouncementDiscoveryProvider);
    // The same, for each comment form's network picker.
    app.provide('defaultCommentaryDistributionProvider', writableCommentaryDistributionProvider);
    // The Announcement / Discovery settings page saves the comment default here.
    app.provide('commentaryDistributionPreferenceStore', commentaryDistributionPreferenceStore);
    // And the network for hearts.
    app.provide('heartDistributionPreferenceStore', heartDistributionPreferenceStore);
    app.provide('getPublicationHeartsCommand', getPublicationHeartsCommand);
    app.provide('setPublicationHeartCommand', setPublicationHeartCommand);
    app.provide('publicationHeartsChanges', publicationHeartsChanges);
    // People's names for hearts and comments (application/publication/
    // identityNames.js), from the builds this device knows and verifies.
    const identityNamesPublications = new CreateDiscoveryUseCase().execute({ decentralizedDiscoveryProvider: decentralizedPublicationDiscoveryProvider }).listPublicationsUseCase;
    const verifiedPublisherOf = createVerifiedPublisherResolver();
    app.provide('identityNames', createIdentityNames({
        publications: () => identityNamesPublications.execute() || [],
        signerOf: (publication) => verifiedPublisherOf(publication instanceof Publication ? publication : Publication.fromJSON(publication)),
        ownIdentity: () => {
            const id = currentIdentityId(identityProvider);
            const user = id ? identityProvider.currentUser() : null;
            const name = user && typeof user.username === 'string' ? user.username.trim() : '';
            return id ? { id, name: name && name !== id ? name : null } : null;
        }
    }));
    app.provide('localSnapshotContentAvailabilityUseCase', localSnapshotContentAvailabilityUseCase);
    app.provide('snapshotContentMaterializationCoordinator', snapshotContentMaterializationCoordinator);
    app.provide('exportSnapshotCommand', exportSnapshotCommand);
    app.provide('snapshotPlacementMaterializationCoordinator', snapshotPlacementMaterializationCoordinator);
    app.provide('snapshotPeerMaterializationCoordinator', snapshotPeerMaterializationCoordinator);
    app.provide('snapshotPeerPossessionCoordinator', snapshotPeerPossessionCoordinator);
    app.provide('snapshotMaterializationSelectionCoordinator', snapshotMaterializationSelectionCoordinator);

    // Every announcement this device has discovered (docs/AnnouncementIndex.md).
    // A followed identity's signed records are the last to go when a tag is full.
    const announcementIndex = new AnnouncementIndex({
        storage: new LocalStorageProvider(),
        isKeptFirst: createFollowedAnnouncementRetention({
            isFollowing: (identityId) => followUseCase.isFollowing(identityId),
            isBlocked: (identityId) => peerBlockUseCase.isBlocked(identityId)
        })
    });

    const {
        worldDiscoveryRuntime, worldEncounterMaterialVerifier, arweaveGatewayConfigurationStore,
        resolvedArweaveGatewayUrl, setArweaveGatewayConfigurationUseCase, setIpfsGatewayConfigurationUseCase,
        setIpfsNodeConfigurationUseCase, nostrRelayConfigurationStore, resolvedNostrRelayUrls,
        setNostrRelayConfigurationUseCase, nostrRelayQueryClient, worldDiscoveryLeadRegistry,
        worldEncounterMaterialSources, discoverWorldEncounterPublicationCommand, publicationRecordQueryServices, buildTagQueryServices,
        repositoryNetworkDiscoveryServices, worldEncounterLeadAssociationsQuery, PUBLICATION_DISCOVERY_TAG, publicationDistributionLifecycleStore,
        steemReadingConfigurationStore, setSteemReadingConfigurationUseCase, steemRuntime,
        steemAnnouncingConfigurationStore, setSteemAnnouncingConfigurationUseCase, steemContentUploadProgress,
        steemNoticePictureProblem, publicationDistributionLifecycleRestorer, retrievePublicationClaim,
        blurtReadingConfigurationStore, setBlurtReadingConfigurationUseCase, blurtRuntime,
        blurtAnnouncingConfigurationStore, setBlurtAnnouncingConfigurationUseCase, blurtContentUploadProgress,
        blurtNoticePictureProblem
    } = composeWorldDiscovery({
        peerSessionManager, peerMessageBus, publicationCatalog, ipfsGatewayConfigurationStore,
        ipfsNodeConfigurationStore, publicationContentStore, announcementIndex,
        isNetworkWriterEnabled: (id) => networkWriterSettingsStore.isEnabled(id)
    });
    // Small Snapshots stored in a Steem post, created and resolved like the
    // Arweave store (docs/Protocol.md, "Proposed: Steem Content Storage").
    // Steem anchors are registered with the other anchor services, in the
    // 'anchoring' service group (ui/main.js).
    // Resolving reads them for everyone; storing onto them is offered only while
    // the network's writer is switched on, following the switch as it changes.
    if (steemRuntime) {
        publicationSnapshotPlacementResolutionStoreRegistry.register(steemRuntime.contentStore);
    }
    // Blurt's store likewise (docs/Protocol.md, "Proposed: Blurt Substrate").
    if (blurtRuntime) {
        publicationSnapshotPlacementResolutionStoreRegistry.register(blurtRuntime.contentStore);
    }
    followNetworkWriterSwitches(networkWriterSettingsStore, { steem: steemRuntime, blurt: blurtRuntime }, {
        on: (runtime) => snapshotPlacementStoreRegistry.register(runtime.contentStore),
        off: (runtime) => snapshotPlacementStoreRegistry.unregister(runtime.contentStore.storage)
    });
    // Watches a newly created anchor until its block is final, by anchorType;
    // Steem and Blurt have one.
    app.provide('anchorFinalityObservers', new Map([steemRuntime, blurtRuntime]
        .filter(Boolean)
        .map((runtime) => [runtime.anchorFinalityObserver.anchorType, runtime.anchorFinalityObserver])));
    app.provide('worldDiscoverySourceRegistry', worldDiscoveryRuntime.registry);
    app.provide('steemContentUploadProgress', steemContentUploadProgress);
    app.provide('steemNoticePictureProblem', steemNoticePictureProblem);
    app.provide('blurtContentUploadProgress', blurtContentUploadProgress);
    app.provide('blurtNoticePictureProblem', blurtNoticePictureProblem);
    app.provide('arweaveGatewayConfigurationStore', arweaveGatewayConfigurationStore);
    app.provide('setArweaveGatewayConfigurationUseCase', setArweaveGatewayConfigurationUseCase);
    app.provide('ipfsGatewayConfigurationStore', ipfsGatewayConfigurationStore);
    app.provide('setIpfsGatewayConfigurationUseCase', setIpfsGatewayConfigurationUseCase);
    app.provide('ipfsNodeConfigurationStore', ipfsNodeConfigurationStore);
    app.provide('ipfsRemotePinningSettingsStore', ipfsRemotePinningSettingsStore);
    app.provide('setIpfsNodeConfigurationUseCase', setIpfsNodeConfigurationUseCase);
    app.provide('nostrRelayConfigurationStore', nostrRelayConfigurationStore);
    app.provide('setNostrRelayConfigurationUseCase', setNostrRelayConfigurationUseCase);
    app.provide('steemReadingConfigurationStore', steemReadingConfigurationStore);
    app.provide('setSteemReadingConfigurationUseCase', setSteemReadingConfigurationUseCase);
    app.provide('steemAnnouncingConfigurationStore', steemAnnouncingConfigurationStore);
    app.provide('setSteemAnnouncingConfigurationUseCase', setSteemAnnouncingConfigurationUseCase);
    app.provide('blurtReadingConfigurationStore', blurtReadingConfigurationStore);
    app.provide('setBlurtReadingConfigurationUseCase', setBlurtReadingConfigurationUseCase);
    app.provide('blurtAnnouncingConfigurationStore', blurtAnnouncingConfigurationStore);
    app.provide('setBlurtAnnouncingConfigurationUseCase', setBlurtAnnouncingConfigurationUseCase);
    app.provide('iceServerConfigurationStore', iceServerConfigurationStore);
    app.provide('setIceServerConfigurationUseCase', setIceServerConfigurationUseCase);
    app.provide('turnServerConfigurationStore', turnServerConfigurationStore);
    app.provide('setTurnServerConfigurationUseCase', setTurnServerConfigurationUseCase);
    app.provide('rendezvousConfigurationStore', rendezvousConfigurationStore);
    app.provide('setRendezvousConfigurationUseCase', setRendezvousConfigurationUseCase);
    app.provide('bitcoinEsploraConfigurationStore', bitcoinEsploraConfigurationStore);
    app.provide('setBitcoinEsploraConfigurationUseCase', setBitcoinEsploraConfigurationUseCase);
    app.provide('worldEncounterMaterialSources', worldEncounterMaterialSources);
    app.provide('worldEncounterMaterialVerifier', worldEncounterMaterialVerifier);
    app.provide('worldDiscoveryLeadRegistry', worldDiscoveryLeadRegistry);
    app.provide('discoverWorldEncounterPublicationCommand', discoverWorldEncounterPublicationCommand);
    // Verifies a claimed build's signed Publication from the network and, only when it
    // is valid and names the ghost's own content, admits it like a verified World
    // Encounter, so Accept Position can place it.
    app.provide('verifyClaimedBuildPublicationCommand', ({ publicationId, contentHash }) => verifyClaimedBuildPublication({
        publicationId,
        contentHash,
        services: publicationRecordQueryServices,
        globalDiscoveryTag: PUBLICATION_DISCOVERY_TAG,
        materialSources: worldEncounterMaterialSources,
        verifier: worldEncounterMaterialVerifier,
        // Each sink isolated, as WorldEncounterCanvas's admitToRepositoryDiscovery() does.
        admit: (publication) => {
            try { decentralizedPublicationDiscoveryProvider.add(publication); } catch { /* see above */ }
            try { worldEncounterPublicationAdmissionLog.add(publication); } catch { /* see above */ }
        }
    }));
    // Finds the Publications others distributed on Nostr, Arweave and Steem and
    // admits the verified ones to the Repository, as World Encounters do. Run
    // when the Repository opens (ui/components/PublicationCatalog.js), never at
    // startup: it fetches each new signed record (docs/Privacy.md).
    const networkPublicationLocatorStore = new NetworkPublicationLocatorStore(new LocalStorageProvider());
    // A Publication this device unpublished counts as known, so a copy it
    // distributed earlier is never listed again (publisher/UnpublishedPublicationLog.js).
    function repositoryNetworkDiscoveryIsKnown(publicationId) {
        return Boolean(decentralizedPublicationDiscoveryProvider.findById(publicationId)
            || new LocalDiscoveryProvider(new LocalStorageProvider()).findById(publicationId)
            || new UnpublishedPublicationLog(new LocalStorageProvider()).has(publicationId));
    }
    // Each sink isolated, as WorldEncounterCanvas's admitToRepositoryDiscovery() does.
    function repositoryNetworkDiscoveryAdmit(publication, { locator }) {
        try { networkPublicationLocatorStore.set(publication.id, locator); } catch { /* see above */ }
        try { worldEncounterPublicationAdmissionLog.add(publication); } catch { /* see above */ }
        decentralizedPublicationDiscoveryProvider.add(publication);
    }
    const repositoryNetworkDiscovery = new RepositoryNetworkDiscovery({
        services: repositoryNetworkDiscoveryServices,
        discoveryTag: PUBLICATION_DISCOVERY_TAG,
        materialSources: worldEncounterMaterialSources,
        verifier: worldEncounterMaterialVerifier,
        isKnown: repositoryNetworkDiscoveryIsKnown,
        admit: repositoryNetworkDiscoveryAdmit
    });
    // Builds others sent to everyone as build notes (core/publication/BuildNote.js), found
    // beside what the other networks hold, and this device's own sent the same
    // way when its builder chose so (application/settings/FindabilityStore.js).
    const challengeEntryLog = new ChallengeEntryLog(new LocalStorageProvider());
    const { findabilityStore, findableBuildsStore, publishBuildNoteUseCase, buildNoteDiscovery } = composeBuildNotes({
        relayUrls: resolvedNostrRelayUrls,
        queryRelay: nostrRelayQueryClient,
        publicationContentStore,
        verifier: worldEncounterMaterialVerifier,
        storeSnapshotContentUseCase,
        decentralizedPublicationDiscoveryProvider,
        admissionLog: worldEncounterPublicationAdmissionLog,
        isKnown: repositoryNetworkDiscoveryIsKnown,
        entryLog: challengeEntryLog,
        placementClaimLookup: publisherPlacementClaimLookup
    });
    app.provide('findabilityStore', findabilityStore);
    app.provide('findableBuildsStore', findableBuildsStore);
    app.provide('publishBuildNoteUseCase', publishBuildNoteUseCase);
    app.provide('buildNoteDiscovery', buildNoteDiscovery);
    app.provide('repositoryNetworkDiscovery', repositoryDiscoveryWithBuildNotes(repositoryNetworkDiscovery, buildNoteDiscovery));
    // A week's challenge entries (core/challenge/BuildChallenge.js): found under the week's
    // `forkbuild-tag:` tag on Nostr and Arweave, and by the tags Blurt build posts
    // list, when the challenge page opens,
    // verified and admitted as the Repository's own discovery does.
    app.provide('challengeEntryLog', challengeEntryLog);
    app.provide('challengeEntryDiscovery', challengeDiscoveryWithBuildNotes(new ChallengeEntryDiscovery({
        services: buildTagQueryServices,
        materialSources: worldEncounterMaterialSources,
        verifier: worldEncounterMaterialVerifier,
        isKnown: repositoryNetworkDiscoveryIsKnown,
        admit: repositoryNetworkDiscoveryAdmit,
        entryLog: challengeEntryLog
    }), buildNoteDiscovery));
    app.provide('networkPublicationLocatorStore', networkPublicationLocatorStore);
    app.provide('worldEncounterLeadAssociationsQuery', worldEncounterLeadAssociationsQuery);
    app.provide('publicationDiscoveryTag', PUBLICATION_DISCOVERY_TAG);
    app.provide('publicationDistributionLifecycleStore', publicationDistributionLifecycleStore);
    // Startup restores the records of catalogued Publications only; a view
    // restores another one (such as a build published from the Editor) on demand.
    app.provide('publicationDistributionLifecycleRestorer', publicationDistributionLifecycleRestorer);

    const {
        arweaveHostSigner, nostrHostPublisher, nostrPublicationRuntimeCapabilities
    } = composeInjectedWalletServices({
        publicationSnapshotPlacementResolutionStoreRegistry, snapshotPlacementStoreRegistry, resolvedArweaveGatewayUrl
    });

    // Assigning this turns on the Nostr publish inside
    // addPublicationCommentaryCommand; until then it is a silent no-op. Fans out
    // across the unified relay set under its own 'forkbuild-commentary' tag.
    publicationCommentaryNostrDistribution = new NostrMultiRelayPublicationCommentaryDistribution({
        publishImpl: nostrHostPublisher,
        queryImpl: nostrRelayQueryClient,
        relayUrls: resolvedNostrRelayUrls
    });

    // Hearts on Nostr: reactions on the same relay set, under 'forkbuild-heart'.
    publicationHeartNostrDistribution = new NostrPublicationHeartDistribution({
        publishImpl: nostrHostPublisher,
        queryImpl: nostrRelayQueryClient,
        relayUrls: resolvedNostrRelayUrls
    });
    // One build's hearts from Nostr, each verified and kept through the routed
    // exchange like any heart. Hearts from Arweave, Steem and Blurt arrive with
    // that network's comments.
    function discoverPublicationHeartsFromNostr(publicationId) {
        return publicationHeartNostrDistribution.discover(publicationId).then((records) => {
            for (const record of records) {
                if (!record || record.publicationId !== publicationId) continue;
                try {
                    publicationCommentaryDistributionExchange.importCommentaryEnvelope(record);
                } catch {
                }
            }
        });
    }

    // Separate, explicit acquisition, never part of
    // getPublicationCommentariesCommand.
    const discoverPublicationCommentaryFromNostrUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(
        publicationCommentaryNostrDistribution,
        publicationCommentaryDistributionExchange
    );
    // Feeds admitted comments into the same notification bridge WebRTC uses. One
    // failed notification must not stop the rest of the batch.
    // Checking a build's comments on Nostr also reads its hearts there (they are
    // reactions under their own tag); a failed heart read never fails the
    // comments.
    function discoverPublicationCommentaryFromNostrCommand(publicationId) {
        const hearts = discoverPublicationHeartsFromNostr(publicationId).catch(() => {});
        return Promise.all([discoverPublicationCommentaryFromNostrUseCase.execute({ publicationId }), hearts]).then(([results]) => {
            for (const result of results) {
                try {
                    publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result);
                } catch {
                }
            }
            return results;
        });
    }
    app.provide('discoverPublicationCommentaryFromNostrCommand', discoverPublicationCommentaryFromNostrCommand);

    // Assigning this enables the Arweave publish path of
    // addPublicationCommentaryCommand when a caller selects 'arweave'.
    publicationCommentaryArweaveDistribution = new PublicationCommentaryArweaveDistribution({
        signer: arweaveHostSigner,
        gatewayUrl: resolvedArweaveGatewayUrl
    });

    const discoverPublicationCommentaryFromArweaveUseCase = new DiscoverPublicationCommentaryFromArweaveUseCase(
        publicationCommentaryArweaveDistribution,
        publicationCommentaryDistributionExchange
    );
    // Same notification bridge and best-effort handling as the Nostr command.
    function discoverPublicationCommentaryFromArweaveCommand(publicationId) {
        return discoverPublicationCommentaryFromArweaveUseCase.execute({ publicationId }).then((results) => {
            for (const result of results) {
                try {
                    publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result);
                } catch {
                }
            }
            return results;
        });
    }
    app.provide('discoverPublicationCommentaryFromArweaveCommand', discoverPublicationCommentaryFromArweaveCommand);

    // Assigning this enables the Steem publish path of
    // addPublicationCommentaryCommand when a caller selects 'steem'.
    publicationCommentarySteemDistribution = steemRuntime ? steemRuntime.commentaryDistribution : null;

    const discoverPublicationCommentaryFromSteemUseCase = steemRuntime
        ? new DiscoverPublicationCommentaryUseCase(steemRuntime.commentaryDistribution, publicationCommentaryDistributionExchange)
        : null;
    function discoverPublicationCommentaryFromSteemCommand(publicationId) {
        return discoverPublicationCommentaryFromSteemUseCase.execute({ publicationId }).then((results) => {
            for (const result of results) {
                try {
                    publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result);
                } catch {
                }
            }
            return results;
        });
    }

    // The same for Blurt.
    publicationCommentaryBlurtDistribution = blurtRuntime ? blurtRuntime.commentaryDistribution : null;
    const discoverPublicationCommentaryFromBlurtUseCase = blurtRuntime
        ? new DiscoverPublicationCommentaryUseCase(blurtRuntime.commentaryDistribution, publicationCommentaryDistributionExchange)
        : null;
    function discoverPublicationCommentaryFromBlurtCommand(publicationId) {
        return discoverPublicationCommentaryFromBlurtUseCase.execute({ publicationId }).then((results) => {
            for (const result of results) {
                try {
                    publicationCommentaryRemoteNotificationBridge.handleCommentaryReceived(result);
                } catch {
                }
            }
            return results;
        });
    }

    const refreshPublicationCommentaryCommand = composeRefreshPublicationCommentaryCommand({
        sources: [
            { name: 'Nostr', discover: discoverPublicationCommentaryFromNostrCommand },
            { name: 'Arweave', discover: discoverPublicationCommentaryFromArweaveCommand },
            ...(discoverPublicationCommentaryFromSteemUseCase ? [{ name: 'Steem', discover: discoverPublicationCommentaryFromSteemCommand }] : []),
            ...(discoverPublicationCommentaryFromBlurtUseCase ? [{ name: 'Blurt', discover: discoverPublicationCommentaryFromBlurtCommand }] : [])
        ]
    });
    app.provide('refreshPublicationCommentaryCommand', refreshPublicationCommentaryCommand);

    const { backgroundAnnouncementSync, announcementIndexChanges } = composeAnnouncementSync({
        announcementIndex, nostrRelayQueryClient, resolvedNostrRelayUrls, resolvedArweaveGatewayUrl, steemRuntime, blurtRuntime,
        publicationCommentaryDistributionExchange, publicationCommentaryRemoteNotificationBridge,
        peerMessageBus, connectedPeerRegistry: peerSessionManager.registry
    });
    // Starts with the network runtime: it reads announcements only, never content bytes, so
    // the index is already fuller by the time World View opens (docs/Privacy.md).
    backgroundAnnouncementSync.start();
    app.provide('announcementIndexChanges', announcementIndexChanges);

    // What the service groups in ui/main.js build on.
    return {
        PUBLICATION_DISCOVERY_TAG,
        anchorKnowledgeStore,
        announcementIndex,
        arweaveHostSigner,
        blurtRuntime,
        composeIpfsGatewayContentStore,
        networkWriterLoader,
        networkWriterSettingsStore,
        nostrHostPublisher,
        nostrPublicationRuntimeCapabilities,
        nostrRelayQueryClient,
        ownSnapshotDistributionLog,
        peerConnectionProvider,
        peerSessionManager,
        publicationAnchorCatalog,
        publicationCatalog,
        publicationContentStore,
        publicationDistributionLifecycleStore,
        publicationSnapshotPlacementCatalog,
        publicationSnapshotPlacementResolutionStoreRegistry,
        rendezvousTransports,
        resolvedArweaveGatewayUrl,
        resolvedBitcoinEsploraApiUrls,
        resolvedIpfsGatewayUrls,
        resolvedIpfsNodeApiUrl,
        resolvedNostrRelayUrls,
        retrievePublicationClaim,
        roleProviderPreferenceStore,
        snapshotPlacementStoreRegistry,
        steemRuntime,
        storeSnapshotContentUseCase,
        voiceUseCase,
        worldEncounterMaterialVerifier,
        worldEncounterPublicationAdmissionLog,
        writableAnnouncementDiscoveryProvider
    };
}
