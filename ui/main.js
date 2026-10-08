import { createApp } from 'vue';
import App from './App.js';
import { router } from './router/index.js';
import { CreatePublicationCommentaryDistributionPeerExchangeUseCase } from '../application/publication/commentary/CreatePublicationCommentaryDistributionPeerExchangeUseCase.js';
import { createPublicationCommentaryDistributor, createSavedPublicationCommentaryDistributor } from '../application/publication/commentary/PublicationCommentaryDistributor.js';
import { PublicationCommentaryDistributionLog } from '../application/publication/commentary/PublicationCommentaryDistributionLog.js';
import { PublicationCommentaryRemoteNotificationBridge } from '../application/publication/commentary/PublicationCommentaryRemoteNotificationBridge.js';
import { NostrMultiRelayPublicationCommentaryDistribution } from '../application/nostr/NostrMultiRelayPublicationCommentaryDistribution.js';
import { DiscoverPublicationCommentaryFromNostrUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromNostrUseCase.js';
import { PublicationCommentaryArweaveDistribution } from '../application/publication/commentary/PublicationCommentaryArweaveDistribution.js';
import { DiscoverPublicationCommentaryFromArweaveUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryFromArweaveUseCase.js';
import { DiscoverPublicationCommentaryUseCase } from '../application/publication/commentary/DiscoverPublicationCommentaryUseCase.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { GetRecipientNotificationEventsUseCase } from '../application/chat/GetRecipientNotificationEventsUseCase.js';
import { NotificationHistoryAccess } from '../application/chat/NotificationHistoryAccess.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { FriendshipState } from '../core/FriendshipState.js';
import { SharePublicationWithPeersUseCase } from '../application/publication/sharing/SharePublicationWithPeersUseCase.js';
import { RetrieveSharedPublicationUseCase } from '../application/publication/sharing/RetrieveSharedPublicationUseCase.js';
import { AutoRetrieveSharedPublicationsUseCase } from '../application/publication/sharing/AutoRetrieveSharedPublicationsUseCase.js';
import { CreatePublicationResolverUseCase } from '../application/publication/CreatePublicationResolverUseCase.js';
import { CreateFindOwnSharedPublicationUseCase } from '../application/publication/sharing/CreateFindOwnSharedPublicationUseCase.js';
import { CreatePublisherPlacementClaimLookupUseCase } from '../application/placement/CreatePublisherPlacementClaimLookupUseCase.js';
import { CreatePublicationPeerExchangeUseCase } from '../application/publication/CreatePublicationPeerExchangeUseCase.js';
import { CreatePeerContentExchangeUseCase } from '../application/peer/CreatePeerContentExchangeUseCase.js';
import { CreatePublicationResolutionCoordinatorUseCase } from '../application/publication/CreatePublicationResolutionCoordinatorUseCase.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/publication/CreatePublicationDisplayKindRegistryUseCase.js';
import { ReconstructPublicationDiscoveryUseCase } from '../application/publication/ReconstructPublicationDiscoveryUseCase.js';
import { CreateWorldEncounterPublicationAdmissionLogUseCase } from '../application/worldEncounter/CreateWorldEncounterPublicationAdmissionLogUseCase.js';
import { ReconstructWorldEncounterPublicationDiscoveryUseCase } from '../application/worldEncounter/ReconstructWorldEncounterPublicationDiscoveryUseCase.js';
import { CreatePublicationAnchorPeerExchangeUseCase } from '../application/anchoring/CreatePublicationAnchorPeerExchangeUseCase.js';
import { CreatePublicationAnchorDiscoveryCoordinatorUseCase } from '../application/anchoring/CreatePublicationAnchorDiscoveryCoordinatorUseCase.js';
import { CreatePublicationSnapshotPlacementPeerExchangeUseCase } from '../application/snapshot/placement/CreatePublicationSnapshotPlacementPeerExchangeUseCase.js';
import { CreatePublicationSnapshotPlacementDiscoveryCoordinatorUseCase } from '../application/snapshot/placement/CreatePublicationSnapshotPlacementDiscoveryCoordinatorUseCase.js';
import { LocalStorageProvider, flushLocalStorage } from '../storage/LocalStorageProvider.js';
import { DeviceBackupUseCase } from '../application/backup/DeviceBackupUseCase.js';
import { BackupStatusStore } from '../application/backup/BackupStatusStore.js';
import { BackupReminder } from '../application/backup/BackupReminder.js';
import { BackupDestinations, startAutomaticBackups } from '../application/backup/BackupDestinations.js';
import { IndexedDbValueStore } from '../storage/IndexedDbValueStore.js';
import { OwnPublicationDistributionRecord } from '../application/publication/OwnPublicationDistributionRecord.js';
import { OwnSnapshotDistributionLog } from '../application/snapshot/OwnSnapshotDistributionLog.js';
import { AnnouncementIndex } from '../application/announcementIndex/AnnouncementIndex.js';
import { createFollowedAnnouncementRetention } from '../application/announcementIndex/FollowedAnnouncementRetention.js';
import { FollowingFeed } from '../application/publication/FollowingFeed.js';
import { FollowedAuthorPublicationNotifier } from '../application/publication/FollowedAuthorPublicationNotifier.js';
import { composeAnnouncementSync } from './main/composeAnnouncementSync.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { UnpublishedPublicationLog } from '../publisher/UnpublishedPublicationLog.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { composeRefreshPublicationCommentaryCommand } from '../application/publication/commentary/RefreshPublicationCommentaryCommandComposition.js';
// The composition root's larger subsystems are built in ./main/, in the order
// they are called below.
import { composeIdentityAndPeers } from './main/composeIdentityAndPeers.js';
import { composeContentAndSnapshots } from './main/composeContentAndSnapshots.js';
import { composeWorldDiscovery } from './main/composeWorldDiscovery.js';
import { composeInjectedWalletServices } from './main/composeInjectedWalletServices.js';
import { LanguageSettingsStore } from '../application/settings/LanguageSettingsStore.js';
import { VisitorCountSettingsStore } from '../application/settings/VisitorCountSettingsStore.js';
import { FunnelEventCounter } from '../application/settings/FunnelEventCounter.js';
import { FirstBuildChecklistStore } from '../application/onboarding/FirstBuildChecklistStore.js';
import { browserPrivacySignals, sendCounterHit } from './counterHit.js';
import { verifyClaimedBuildPublication } from '../application/snapshot/claimed/VerifyClaimedBuildPublication.js';
import { RepositoryNetworkDiscovery } from '../application/publication/RepositoryNetworkDiscovery.js';
import { NetworkPublicationLocatorStore } from '../application/publication/NetworkPublicationLocatorStore.js';
import { setDocumentTitles } from '../application/document/DocumentTitles.js';
import { t } from './i18n/i18n.js';
import { defineServiceGroup } from './serviceGroups.js';

// A new World, a fork or a copy gets its title in the chosen language, saved
// like any other title (application/document/DocumentTitles.js).
setDocumentTitles({
    untitledWorld: () => t('document.untitledWorld'),
    forkOf: (title) => t('document.forkOf', { title }),
    copyOf: (title) => t('document.copyOf', { title })
});

// One app-wide instance: a per-view accumulator would lose admitted candidates
// whenever a person navigated away. Created before the identity composition
// because comments may be posted on any publication it holds; its index is
// rebuilt from the durable catalog below.
const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();

const {
    identityProvider, identityUseCase, createPublicationCommentaryCommand, getPublicationCommentariesCommand,
    iceServerConfigurationStore, turnServerConfigurationStore, setTurnServerConfigurationUseCase,
    setIceServerConfigurationUseCase, rendezvousConfigurationStore, setRendezvousConfigurationUseCase,
    bitcoinEsploraConfigurationStore, resolvedBitcoinEsploraApiUrls, setBitcoinEsploraConfigurationUseCase,
    peerSessionManager, peerRelationshipUseCase, peerReconnectionUseCase, findPeerUseCase, peerMessageBus,
    peerBlockUseCase, deviceAuthorizationUseCase, friendRelationshipUseCase,
    identityLifecyclePropagationUseCase, chatUseCase, peerPresenceUseCase, deviceConversationSyncUseCase,
    voiceUseCase, publicLobbyUseCase, followUseCase
} = composeIdentityAndPeers({ decentralizedPublicationDiscoveryProvider });

// The one LocalPublicationCatalog instance; every collaborator below shares it.
const { publicationResolver, contentStore: publicationContentStore } = new CreatePublicationResolverUseCase().execute();
// Also starts PublicationPeerConnectionSync (no binding needed): an
// authenticated peer automatically receives this replica's cataloged
// Publications.
const { catalog: publicationCatalog, peerExchange: publicationPeerExchange } = new CreatePublicationPeerExchangeUseCase().execute({
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry
});
const { peerContentExchange: publicationPeerContentExchange } = new CreatePeerContentExchangeUseCase().execute({
    contentStore: publicationContentStore,
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry,
    publicationCatalog
});
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
decentralizedPublicationDiscoveryProvider.onAdded((publication) => {
    followedAuthorPublicationNotifier.handlePublicationAdmitted(publication);
});

// Shares the commentary store's localStorage keys with
// createPublicationCommentaryCommand. The store keeps no cache, so a saved
// comment is immediately visible to announce().
const {
    exchange: publicationCommentaryDistributionExchange,
    peerExchange: publicationCommentaryDistributionPeerExchange
} = new CreatePublicationCommentaryDistributionPeerExchangeUseCase().execute({
    identityProvider,
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry
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

// The one anchor catalog and knowledge store. Anchors from peers are cataloged
// on arrival; verification only runs on an explicit Verify click.
const { catalog: publicationAnchorCatalog, peerExchange: publicationAnchorPeerExchange, knowledgeStore: anchorKnowledgeStore } = new CreatePublicationAnchorPeerExchangeUseCase().execute({
    peerMessageBus,
    connectedPeerRegistry: peerSessionManager.registry
});

const { discoveryCoordinator: publicationAnchorDiscoveryCoordinator } = new CreatePublicationAnchorDiscoveryCoordinatorUseCase().execute({
    peerExchange: publicationAnchorPeerExchange
});

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
const { discoveryCoordinator: publicationSnapshotPlacementDiscoveryCoordinator } = new CreatePublicationSnapshotPlacementDiscoveryCoordinatorUseCase().execute({
    peerExchange: publicationSnapshotPlacementPeerExchange
});

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

const app = createApp(App);
const backupStatusStore = new BackupStatusStore(new LocalStorageProvider());
const deviceBackupUseCase = new DeviceBackupUseCase({ storageProvider: new LocalStorageProvider(), flush: flushLocalStorage, statusStore: backupStatusStore });
const backupDestinations = new BackupDestinations({
    deviceBackup: deviceBackupUseCase,
    statusStore: backupStatusStore,
    valueStore: new IndexedDbValueStore({ databaseName: 'forkbuild-backup' })
});
startAutomaticBackups(backupDestinations);
app.provide('deviceBackupUseCase', deviceBackupUseCase);
app.provide('backupStatusStore', backupStatusStore);
app.provide('backupReminder', new BackupReminder({ statusStore: backupStatusStore, deviceBackup: deviceBackupUseCase }));
app.provide('backupDestinations', backupDestinations);
app.provide('identityUseCase', identityUseCase);
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
// The app header's Notifications panel, open on every page. Reads the
// same storage World View's session reads, and resolves a notification's
// Publication the way that session does (local catalog, then Repository-admitted).
app.provide('notificationHistoryAccess', new NotificationHistoryAccess({
    getRecipientNotificationEventsUseCase: identityProvider
        ? new GetRecipientNotificationEventsUseCase(new NotificationEventStore(new LocalStorageProvider()), identityProvider)
        : null,
    publicationLookup: new CompositeDiscoveryProvider([
        new LocalDiscoveryProvider(new LocalStorageProvider()),
        decentralizedPublicationDiscoveryProvider
    ])
}));
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
app.provide('findOwnSharedPublicationUseCase', new CreateFindOwnSharedPublicationUseCase().execute({ contentStore: publicationContentStore }));
// The publisher's signed placement of a World, announced beside its Snapshot
// when the Publications page distributes it, as World View does.
app.provide('publisherPlacementClaimLookup', new CreatePublisherPlacementClaimLookupUseCase().execute());
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
// Read once by ui/boot.js before the app loads; the Language page saves to it.
app.provide('languageSettingsStore', new LanguageSettingsStore({ storageProvider: new LocalStorageProvider() }));
// Counted once a day by ui/start.js; Your Data turns it off.
const visitorCountSettingsStore = new VisitorCountSettingsStore({ storageProvider: new LocalStorageProvider() });
app.provide('visitorCountSettingsStore', visitorCountSettingsStore);
// The Editor's guided first build: this device's progress through it.
app.provide('firstBuildChecklistStore', new FirstBuildChecklistStore({ storageProvider: new LocalStorageProvider() }));
// A share link made, a shared link opened, a build from one copied: counted
// under the same setting (docs/Privacy.md, "Visitor count").
app.provide('funnelEventCounter', new FunnelEventCounter({
    settingsStore: visitorCountSettingsStore,
    origin: window.location.origin,
    privacySignals: browserPrivacySignals(),
    sendHit: sendCounterHit
}));
app.provide('setRoleProviderPreferenceUseCase', setRoleProviderPreferenceUseCase);
// Only a seed for each Announcement/Discovery picker's own selection, never
// read again after the picker mounts.
app.provide('defaultAnnouncementDiscoveryProvider', resolvedAnnouncementDiscoveryProvider);
// The same, for each comment form's network picker.
app.provide('defaultCommentaryDistributionProvider', resolvedCommentaryDistributionProvider);
// The Announcement / Discovery settings page saves the comment default here.
app.provide('commentaryDistributionPreferenceStore', commentaryDistributionPreferenceStore);
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
    worldEncounterMaterialSources, discoverWorldEncounterPublicationCommand, publicationRecordQueryServices,
    repositoryNetworkDiscoveryServices, worldEncounterLeadAssociationsQuery, PUBLICATION_DISCOVERY_TAG, publicationDistributionLifecycleStore,
    steemReadingConfigurationStore, setSteemReadingConfigurationUseCase, steemRuntime,
    steemAnnouncingConfigurationStore, setSteemAnnouncingConfigurationUseCase, steemContentUploadProgress,
    steemNoticePictureProblem, publicationDistributionLifecycleRestorer, retrievePublicationClaim,
    blurtReadingConfigurationStore, setBlurtReadingConfigurationUseCase, blurtRuntime,
    blurtAnnouncingConfigurationStore, setBlurtAnnouncingConfigurationUseCase, blurtContentUploadProgress,
    blurtNoticePictureProblem
} = composeWorldDiscovery({
    peerSessionManager, peerMessageBus, publicationCatalog, ipfsGatewayConfigurationStore,
    ipfsNodeConfigurationStore, publicationContentStore, announcementIndex
});
// Small Snapshots stored in a Steem post, created and resolved like the
// Arweave store (docs/Protocol.md, "Proposed: Steem Content Storage").
// Steem anchors are registered with the other anchor services, in the
// 'anchoring' service group below.
if (steemRuntime) {
    snapshotPlacementStoreRegistry.register(steemRuntime.contentStore);
    publicationSnapshotPlacementResolutionStoreRegistry.register(steemRuntime.contentStore);
}
// Blurt's store likewise (docs/Protocol.md, "Proposed: Blurt Substrate").
if (blurtRuntime) {
    snapshotPlacementStoreRegistry.register(blurtRuntime.contentStore);
    publicationSnapshotPlacementResolutionStoreRegistry.register(blurtRuntime.contentStore);
}
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
const repositoryNetworkDiscovery = new RepositoryNetworkDiscovery({
    services: repositoryNetworkDiscoveryServices,
    discoveryTag: PUBLICATION_DISCOVERY_TAG,
    materialSources: worldEncounterMaterialSources,
    verifier: worldEncounterMaterialVerifier,
    // A Publication this device unpublished counts as known, so a copy it
    // distributed earlier is never listed again (publisher/UnpublishedPublicationLog.js).
    isKnown: (publicationId) => Boolean(decentralizedPublicationDiscoveryProvider.findById(publicationId)
        || new LocalDiscoveryProvider(new LocalStorageProvider()).findById(publicationId)
        || new UnpublishedPublicationLog(new LocalStorageProvider()).has(publicationId)),
    // Each sink isolated, as WorldEncounterCanvas's admitToRepositoryDiscovery() does.
    admit: (publication, { locator }) => {
        try { networkPublicationLocatorStore.set(publication.id, locator); } catch { /* see above */ }
        try { worldEncounterPublicationAdmissionLog.add(publication); } catch { /* see above */ }
        decentralizedPublicationDiscoveryProvider.add(publication);
    }
});
app.provide('repositoryNetworkDiscovery', repositoryNetworkDiscovery);
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

// Separate, explicit acquisition, never part of
// getPublicationCommentariesCommand.
const discoverPublicationCommentaryFromNostrUseCase = new DiscoverPublicationCommentaryFromNostrUseCase(
    publicationCommentaryNostrDistribution,
    publicationCommentaryDistributionExchange
);
// Feeds admitted comments into the same notification bridge WebRTC uses. One
// failed notification must not stop the rest of the batch.
function discoverPublicationCommentaryFromNostrCommand(publicationId) {
    return discoverPublicationCommentaryFromNostrUseCase.execute({ publicationId }).then((results) => {
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
// Starts with the app: it reads announcements only, never content bytes, so
// the index is already fuller by the time World View opens (docs/Privacy.md).
backgroundAnnouncementSync.start();
app.provide('announcementIndexChanges', announcementIndexChanges);

// Services only some pages use are built the first time one of those pages
// opens, not with the app (ui/serviceGroups.js); ui/router/index.js names the
// groups each page needs. Everything above runs at startup: the stores and
// peer exchanges that must listen from the start, and what the header shows
// on every page.

// Publication evidence and external anchoring (Bitcoin, Base, Arweave, Steem, Blurt)
// and their wallets, for the Publications page and the Proof & Anchoring
// settings.
defineServiceGroup('anchoring', async () => {
    const { composeAnchoring } = await import('./main/composeAnchoring.js');
    const {
        publicationEvidenceCoordinator,
        publicationAnchorCreationCoordinator, preferredPublicationAnchorCreationCoordinator,
        externalAnchorEvidenceViewRegistry, bitcoinAnchorProofReconciliationView, bitcoinWalletConnection,
        bitcoinWalletFundingObserver, baseWalletConnection, baseNetworkObserver,
        basePublicationTransactionPlanCoordinator, baseInjectedProviderWalletTransactionSigner,
        baseReviewedSigningCoordinator, baseSignedTransactionFinalizationCoordinator,
        baseTransactionBroadcastCoordinator, baseAnchorPublisher, baseTransactionInclusionObservationCoordinator,
        bitcoinAnchorTransactionConstructionCoordinator, bitcoinAnchorTransactionReviewCoordinator,
        bitcoinAnchorReviewedSigningCoordinator, bitcoinAnchorSignedPsbtFinalizationCoordinator,
        bitcoinAnchorBroadcastCoordinator, bitcoinAnchorPublicationCoordinator,
        bitcoinAnchorConfirmationCoordinator
    } = composeAnchoring({
        identityProvider, resolvedBitcoinEsploraApiUrls, publicationCatalog, publicationAnchorCatalog,
        anchorKnowledgeStore, roleProviderPreferenceStore, arweaveHostSigner, resolvedArweaveGatewayUrl, steemRuntime, blurtRuntime
    });

    app.provide('publicationEvidenceCoordinator', publicationEvidenceCoordinator);
    app.provide('publicationAnchorCreationCoordinator', publicationAnchorCreationCoordinator);
    app.provide('preferredPublicationAnchorCreationCoordinator', preferredPublicationAnchorCreationCoordinator);
    app.provide('externalAnchorEvidenceViewRegistry', externalAnchorEvidenceViewRegistry);
    app.provide('bitcoinAnchorProofReconciliationView', bitcoinAnchorProofReconciliationView);
    app.provide('bitcoinWalletConnection', bitcoinWalletConnection);
    app.provide('bitcoinWalletFundingObserver', bitcoinWalletFundingObserver);
    app.provide('baseWalletConnection', baseWalletConnection);
    app.provide('baseNetworkObserver', baseNetworkObserver);
    app.provide('basePublicationTransactionPlanCoordinator', basePublicationTransactionPlanCoordinator);
    app.provide('baseInjectedProviderWalletTransactionSigner', baseInjectedProviderWalletTransactionSigner);
    app.provide('baseReviewedSigningCoordinator', baseReviewedSigningCoordinator);
    app.provide('baseSignedTransactionFinalizationCoordinator', baseSignedTransactionFinalizationCoordinator);
    app.provide('baseTransactionBroadcastCoordinator', baseTransactionBroadcastCoordinator);
    app.provide('baseTransactionInclusionObservationCoordinator', baseTransactionInclusionObservationCoordinator);
    app.provide('baseAnchorPublisher', baseAnchorPublisher);
    app.provide('bitcoinAnchorTransactionConstructionCoordinator', bitcoinAnchorTransactionConstructionCoordinator);
    app.provide('bitcoinAnchorTransactionReviewCoordinator', bitcoinAnchorTransactionReviewCoordinator);
    app.provide('bitcoinAnchorReviewedSigningCoordinator', bitcoinAnchorReviewedSigningCoordinator);
    app.provide('bitcoinAnchorSignedPsbtFinalizationCoordinator', bitcoinAnchorSignedPsbtFinalizationCoordinator);
    app.provide('bitcoinAnchorBroadcastCoordinator', bitcoinAnchorBroadcastCoordinator);
    app.provide('bitcoinAnchorPublicationCoordinator', bitcoinAnchorPublicationCoordinator);
    app.provide('bitcoinAnchorConfirmationCoordinator', bitcoinAnchorConfirmationCoordinator);
});

// Distributing publications and Snapshots (Arweave, Nostr, IPFS, Steem, Blurt),
// finding Snapshots and place names, remote IPFS pinning and IPFS content
// checks, and opening a Publication link: what the Editor, World View and the
// Publications page publish and search with.
defineServiceGroup('distribution', async () => {
    const [
        { composePublicationDistribution }, { composeSnapshotDiscovery }, { openPublicationLink },
        { CreateIpfsRemotePublicationCoordinatorUseCase }, { CreateIpfsPublicationContentVerifierUseCase },
        { CreateIpfsPublicationContentVerificationCoordinatorUseCase }, { createLinkedPublisherPlacement }
    ] = await Promise.all([
        import('./main/composePublicationDistribution.js'),
        import('./main/composeSnapshotDiscovery.js'),
        import('../application/publication/OpenPublicationLink.js'),
        import('../application/ipfs/CreateIpfsRemotePublicationCoordinatorUseCase.js'),
        import('../application/ipfs/CreateIpfsPublicationContentVerifierUseCase.js'),
        import('../application/ipfs/CreateIpfsPublicationContentVerificationCoordinatorUseCase.js'),
        import('../application/placement/LinkedPublisherPlacement.js')
    ]);

    // Holds no credential between calls: it builds a fresh pinning provider from
    // the configuration supplied on each explicit publish.
    const { coordinator: ipfsRemotePublicationCoordinator } = new CreateIpfsRemotePublicationCoordinatorUseCase().execute();

    const { ipfsPublicationContentVerifier } = new CreateIpfsPublicationContentVerifierUseCase().execute({
        contentStore: composeIpfsGatewayContentStore(resolvedIpfsGatewayUrls)
    });
    const { coordinator: ipfsPublicationContentVerificationCoordinator } =
        new CreateIpfsPublicationContentVerificationCoordinatorUseCase().execute({ ipfsPublicationContentVerifier });
    app.provide('ipfsRemotePublicationCoordinator', ipfsRemotePublicationCoordinator);
    app.provide('ipfsPublicationContentVerificationCoordinator', ipfsPublicationContentVerificationCoordinator);

    const {
        arweaveAnnouncementUploadTaggedTransaction, publicationDistributionCommand,
        multiRelayNostrPublicationDistributionCommand, resolveSnapshotDiscoveryPublisher,
        snapshotDistributionCommand, snapshotDiscoveryPublisher, snapshotDistributionAvailableStorageTypes,
        announcementDiscoveryProviderRegistry
    } = composePublicationDistribution({
        resolvedIpfsNodeApiUrl, snapshotPlacementStoreRegistry, resolvedAnnouncementDiscoveryProvider,
        resolvedArweaveGatewayUrl, resolvedNostrRelayUrls, PUBLICATION_DISCOVERY_TAG,
        publicationDistributionLifecycleStore, arweaveHostSigner, nostrHostPublisher,
        nostrPublicationRuntimeCapabilities, steemRuntime, blurtRuntime, snapshotDistributionLog: ownSnapshotDistributionLog
    });
    app.provide('publicationDistributionCommand', publicationDistributionCommand);
    app.provide('multiRelayNostrPublicationDistributionCommand', multiRelayNostrPublicationDistributionCommand);
    app.provide('resolveSnapshotDiscoveryPublisher', resolveSnapshotDiscoveryPublisher);
    app.provide('snapshotDistributionCommand', snapshotDistributionCommand);
    app.provide('snapshotDiscoveryPublisher', snapshotDiscoveryPublisher);
    app.provide('snapshotDistributionAvailableStorageTypes', snapshotDistributionAvailableStorageTypes);

    const {
        resolvedContentDistributionProvider, distributePlaceNamingClaimCommand, discoverSnapshotCommand,
        snapshotCandidateDiscoveryQueryService, discoverSnapshotCandidatesCommand,
        discoverSnapshotCandidatesWithOutcomeCommand, worldSnapshotDiscoveryMonitor,
        placeNamingDiscoveryQueryService, resolveSelectedSnapshotCommand, materializeSelectedSnapshotCommand,
        discoverIndexedSnapshotCandidatesCommand, indexedPlaceNamingDiscoveryQueryService
    } = composeSnapshotDiscovery({
        publicationSnapshotPlacementCatalog, publicationSnapshotPlacementResolutionStoreRegistry,
        roleProviderPreferenceStore, resolvedAnnouncementDiscoveryProvider, storeSnapshotContentUseCase,
        resolvedArweaveGatewayUrl, resolvedNostrRelayUrls, nostrRelayQueryClient, nostrHostPublisher,
        arweaveAnnouncementUploadTaggedTransaction, snapshotDistributionAvailableStorageTypes, steemRuntime, blurtRuntime,
        announcementIndex, publicationContentStore, announcementDiscoveryProviderRegistry
    });
    app.provide('defaultContentDistributionProvider', resolvedContentDistributionProvider);
    app.provide('distributePlaceNamingClaimCommand', distributePlaceNamingClaimCommand);
    app.provide('discoverSnapshotCommand', discoverSnapshotCommand);
    app.provide('snapshotCandidateDiscoveryQueryService', snapshotCandidateDiscoveryQueryService);
    app.provide('discoverSnapshotCandidatesCommand', discoverSnapshotCandidatesCommand);
    app.provide('discoverSnapshotCandidatesWithOutcomeCommand', discoverSnapshotCandidatesWithOutcomeCommand);
    app.provide('worldSnapshotDiscoveryMonitor', worldSnapshotDiscoveryMonitor);
    app.provide('placeNamingDiscoveryQueryService', placeNamingDiscoveryQueryService);
    app.provide('discoverIndexedSnapshotCandidatesCommand', discoverIndexedSnapshotCandidatesCommand);
    app.provide('indexedPlaceNamingDiscoveryQueryService', indexedPlaceNamingDiscoveryQueryService);
    app.provide('resolveSelectedSnapshotCommand', resolveSelectedSnapshotCommand);
    app.provide('materializeSelectedSnapshotCommand', materializeSelectedSnapshotCommand);

    // A link to a Publication (ui/views/PublicationLinkView.js: the "see
    // it in 3D" link on a Steem or Blurt post, or one shared with Share): the Signed Claim
    // is read from Steem, Blurt, Arweave or IPFS, or carried in a link-only share, and
    // verified, its build found by content hash, and the Publication admitted as World
    // discovery admits one.
    // The publisher's signed placement for a linked Publication, kept where World
    // View reads placements, so the build stands where its publisher put it.
    const linkedPublisherPlacement = createLinkedPublisherPlacement({
        storageProvider: new LocalStorageProvider(),
        findPublicationById: (id) => decentralizedPublicationDiscoveryProvider.findById(id) || new LocalDiscoveryProvider(new LocalStorageProvider()).findById(id)
    });
    app.provide('openPublicationLink', ({ locator = null, linkOnly = null }) => openPublicationLink({
        locator,
        linkOnly,
        retrieveClaim: retrievePublicationClaim,
        verifier: worldEncounterMaterialVerifier,
        hasLocalContent: async (reference) => publicationContentStore.has(reference),
        findSnapshotCandidates: discoverSnapshotCandidatesWithOutcomeCommand,
        resolveSnapshotCandidate: resolveSelectedSnapshotCommand,
        storeSnapshotContent: (request) => storeSnapshotContentUseCase.execute(request),
        // A Publication the Repository already lists (one network discovery
        // found, then Explore opened here) is not listed a second time.
        discoveryProvider: {
            add: (publication) => {
                if (!decentralizedPublicationDiscoveryProvider.findById(publication.id)) decentralizedPublicationDiscoveryProvider.add(publication);
            }
        },
        admissionLog: worldEncounterPublicationAdmissionLog,
        publisherPlacement: linkedPublisherPlacement
    }));
});

// Every observation of a publication this device has recorded, for the
// Publications page's history and the leaderboards; a single shared instance
// app-wide.
defineServiceGroup('observationArchive', async () => {
    const { LocalStoragePublicationObservationArchive } = await import('../storage/LocalStoragePublicationObservationArchive.js');
    app.provide('publicationObservationArchiveStorage', new LocalStoragePublicationObservationArchive());
});

// World View's sound, one per visit, and the Editor's edit sounds, one per
// Editor visit, sharing this device's sound preference.
defineServiceGroup('sound', async () => {
    const [{ SoundSettingsStore }, { WorldSoundscapeService }, { EditorSoundService }, { WebAudioSoundscapeProvider }] = await Promise.all([
        import('../application/settings/SoundSettingsStore.js'),
        import('../application/world/WorldSoundscapeService.js'),
        import('../application/editor/EditorSoundService.js'),
        import('../audio/WebAudioSoundscapeProvider.js')
    ]);
    const soundSettingsStore = new SoundSettingsStore({ storageProvider: new LocalStorageProvider() });
    app.provide('createWorldSoundscape', (options) => new WorldSoundscapeService({
        ...options,
        provider: new WebAudioSoundscapeProvider(),
        settingsStore: soundSettingsStore
    }));
    app.provide('createEditorSound', ({ editorSession }) => new EditorSoundService({
        provider: new WebAudioSoundscapeProvider({ ambience: false }),
        settingsStore: soundSettingsStore,
        editorSession
    }));
});

app.use(router);
app.mount('#app');
