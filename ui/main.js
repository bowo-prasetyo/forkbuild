// The composition root, in two parts. This module is the app's shell: what
// the header and Home need, built before the first render. Everything that
// talks to other devices and networks (peers, the publication catalogs and
// their exchanges, World discovery, Nostr, Arweave, IPFS, Steem and Blurt,
// the announcement index's background sync) is built by
// ./main/composeNetwork.js, imported once Home is on screen, or as soon as a
// page that needs it opens: its modules are most of the app's code, and none
// of them are needed to draw Home. It is the "network" service group, and
// every other group waits for it (ui/serviceGroups.js,
// ui/router/pageServiceGroups.js).
import { createApp, shallowRef } from 'vue';
import App from './App.js';
import { router } from './router/index.js';
import { NotificationEventStore } from '../storage/NotificationEventStore.js';
import { GetRecipientNotificationEventsUseCase } from '../application/chat/GetRecipientNotificationEventsUseCase.js';
import { NotificationHistoryAccess } from '../application/chat/NotificationHistoryAccess.js';
import { CompositeDiscoveryProvider } from '../discovery/CompositeDiscoveryProvider.js';
import { LocalStorageProvider, flushLocalStorage } from '../storage/LocalStorageProvider.js';
import { DeviceBackupUseCase } from '../application/backup/DeviceBackupUseCase.js';
import { BackupStatusStore } from '../application/backup/BackupStatusStore.js';
import { BackupReminder } from '../application/backup/BackupReminder.js';
import { BackupDestinations, startAutomaticBackups } from '../application/backup/BackupDestinations.js';
import { IndexedDbValueStore } from '../storage/IndexedDbValueStore.js';
import { DeviceNotificationSettingsStore } from '../application/settings/DeviceNotificationSettingsStore.js';
import { DeviceNotificationRelay } from '../application/notification/DeviceNotificationRelay.js';
import { resolveSigningIdentityId } from '../identity/resolveSigningIdentityId.js';
import { registerServiceWorker, showDeviceNotification } from './pwa/serviceWorkerClient.js';
import { browserNotificationPermission } from './components/DeviceNotificationSetting.js';
import { describeNotification } from './notifications/notificationText.js';
import { createCallAudio } from './voice/callAudio.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { LanguageSettingsStore } from '../application/settings/LanguageSettingsStore.js';
import { LookSettingsStore } from '../application/settings/LookSettingsStore.js';
import { VisitorCountSettingsStore } from '../application/settings/VisitorCountSettingsStore.js';
import { ExperimentalToolsSettingsStore } from '../application/settings/ExperimentalToolsSettingsStore.js';
import { WorldViewDetailStore } from '../application/settings/WorldViewDetailStore.js';
import { EditorBuildInfoStore } from '../application/settings/EditorBuildInfoStore.js';
import { RecentBricksStore } from '../application/settings/RecentBricksStore.js';
import { WorldViewSkyStore } from '../application/settings/WorldViewSkyStore.js';
import { WorldViewSeasonStore } from '../application/settings/WorldViewSeasonStore.js';
import { WorldViewShadowStore } from '../application/settings/WorldViewShadowStore.js';
import { WorldViewTreeDetailStore } from '../application/settings/WorldViewTreeDetailStore.js';
import { PublishDestinationStore } from '../application/settings/PublishDestinationStore.js';
import { BuildPlotStore } from '../application/plot/BuildPlotStore.js';
import { FunnelEventCounter } from '../application/settings/FunnelEventCounter.js';
import { FirstBuildChecklistStore } from '../application/onboarding/FirstBuildChecklistStore.js';
import { ReadyMadeBricksStore } from '../application/document/ReadyMadeBricksStore.js';
import { browserPrivacySignals, sendCounterHit } from './counterHit.js';
import { publishedBuildTags } from '../application/challenge/PublishedBuildTags.js';
import { setDocumentTitles } from '../application/document/DocumentTitles.js';
import { t } from './i18n/i18n.js';
import { defineServiceGroup } from './serviceGroups.js';
import { importWithRetry } from './importWithRetry.js';
import { IdentityUseCase } from '../application/identity/IdentityUseCase.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';

// A new World, a fork or a copy gets its title in the chosen language, saved
// like any other title (application/document/DocumentTitles.js).
setDocumentTitles({
    untitledWorld: () => t('document.untitledWorld'),
    forkOf: (title) => t('document.forkOf', { title }),
    copyOf: (title) => t('document.copyOf', { title })
});

// One app-wide instance: a per-view accumulator would lose admitted candidates
// whenever a person navigated away. Created here because the header's
// notifications look publications up in it; ./main/composeNetwork.js rebuilds
// its index from the durable catalog.
const decentralizedPublicationDiscoveryProvider = new DecentralizedPublicationDiscoveryProvider();
// The local identity: the header shows who is signed in on every page.
const identityProvider = new LocalIdentityProvider(new LocalStorageProvider());
const identityUseCase = new IdentityUseCase(identityProvider);
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
// World View's visitor's view or every tool, chosen per device.
// Where Publish sends each build on this device, once chosen.
app.provide('publishDestinationStore', new PublishDestinationStore({ storageProvider: new LocalStorageProvider() }));
app.provide('worldViewDetailStore', new WorldViewDetailStore({ storageProvider: new LocalStorageProvider() }));
// Whether the Editor shows the open build's details folded or unfolded, per device.
app.provide('editorBuildInfoStore', new EditorBuildInfoStore({ storageProvider: new LocalStorageProvider() }));
app.provide('recentBricksStore', new RecentBricksStore({ storageProvider: new LocalStorageProvider() }));
app.provide('worldViewSkyStore', new WorldViewSkyStore({ storageProvider: new LocalStorageProvider() }));
app.provide('worldViewSeasonStore', new WorldViewSeasonStore({ storageProvider: new LocalStorageProvider() }));
// Shadows start off where the main pointer is a finger (phones, tablets),
// whose GPUs feel a second pass over the scene most, and on elsewhere.
const touchFirst = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
app.provide('worldViewShadowStore', new WorldViewShadowStore({ storageProvider: new LocalStorageProvider(), onByDefault: !touchFirst }));
// Every branch and leaf close by, likewise: leaves drawn over each other cost
// a phone's GPU most.
app.provide('worldViewTreeDetailStore', new WorldViewTreeDetailStore({ storageProvider: new LocalStorageProvider(), onByDefault: !touchFirst }));
app.provide('identityUseCase', identityUseCase);
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
// Read once by ui/boot.js before the app loads; the Language page saves to it.
app.provide('languageSettingsStore', new LanguageSettingsStore({ storageProvider: new LocalStorageProvider() }));
app.provide('lookSettingsStore', new LookSettingsStore({ storageProvider: new LocalStorageProvider() }));
// Counted once a day by ui/start.js; Your Data turns it off.
const visitorCountSettingsStore = new VisitorCountSettingsStore({ storageProvider: new LocalStorageProvider() });
app.provide('visitorCountSettingsStore', visitorCountSettingsStore);
// Network Settings' Show experimental tools: off until turned on (docs/Pillars.md).
app.provide('experimentalToolsSettingsStore', new ExperimentalToolsSettingsStore({ storageProvider: new LocalStorageProvider() }));
// Build here's plots: World View records one, the Editor publishes onto it.
app.provide('buildPlotStore', new BuildPlotStore({ storageProvider: new LocalStorageProvider() }));
// The Editor's guided first build: this device's progress through it.
app.provide('firstBuildChecklistStore', new FirstBuildChecklistStore({ storageProvider: new LocalStorageProvider() }));
// The bricks each build started with, so publishing counts only the builder's own.
app.provide('readyMadeBricksStore', new ReadyMadeBricksStore({ storageProvider: new LocalStorageProvider() }));
// A share link made, a shared link opened, a build from one copied, a build
// published: counted under the same setting (docs/Privacy.md, "Visitor count").
const funnelEventCounter = new FunnelEventCounter({
    settingsStore: visitorCountSettingsStore,
    origin: window.location.origin,
    privacySignals: browserPrivacySignals(),
    sendHit: sendCounterHit,
    // A build's first publish from this device: its brick range, a second
    // build, a remix.
    listOwnPublications: () => new LocalDiscoveryProvider(new LocalStorageProvider()).list()
});
app.provide('funnelEventCounter', funnelEventCounter);
// ForkBuild installed as an app: counted the same way.
window.addEventListener('appinstalled', () => funnelEventCounter.installed());

// The network runtime (./main/composeNetwork.js), built once: started below
// once the first page is on screen, or first by a page that needs it. Its
// services are provided as it is built, so every page created after it
// injects them. A failed download is forgotten, so the next page that needs
// it tries again; a failure while building it is not, since half of it would
// already be running.
let networkStarting = null;
let network = null;
// Run once the network runtime is built, with what it returns.
const whenNetworkBuilt = [];
function startNetwork() {
    if (!networkStarting) {
        const loading = importWithRetry(() => import('./main/composeNetwork.js'), [500, 1500]);
        loading.catch(() => { networkStarting = null; });
        networkStarting = loading.then(({ composeNetwork }) => composeNetwork({
            app, identityProvider, identityUseCase, decentralizedPublicationDiscoveryProvider
        })).then((services) => {
            network = services;
            for (const callback of whenNetworkBuilt) callback(services);
            return services;
        });
    }
    return networkStarting;
}
defineServiceGroup('network', startNetwork);
// The header warns that reloading would end a call in progress
// (ui/components/PageLoadFailureNotice.js); there is none before the network
// runtime is built.
app.provide('activeVoiceCall', () => (network ? network.voiceUseCase.getActiveCall() : null));
// A call goes on wherever you are: its voice plays through one app-wide
// element (ui/voice/callAudio.js), and its bar (ui/components/CallBar.js)
// shows on every page but that friend's own Chat page.
const callServices = shallowRef(null);
app.provide('callServices', callServices);
whenNetworkBuilt.push(({ voiceUseCase, peerRelationshipUseCase }) => {
    const callAudio = createCallAudio(voiceUseCase);
    app.provide('callAudio', callAudio);
    callServices.value = { voiceUseCase, peerRelationshipUseCase, callAudio };
});

// Services only some pages use are built the first time one of those pages
// opens, not with the app (ui/serviceGroups.js); ui/router/pageServiceGroups.js
// names the groups each page needs. Each of these builds on the network
// runtime, waiting for it first.

// Publication evidence and external anchoring (Bitcoin, Base, Arweave, Steem,
// Blurt), for the Publications page and the Proof & Anchoring settings, and
// the Bitcoin and Base wallets switched on in Network Settings.
defineServiceGroup('anchoring', async () => {
    const {
        resolvedBitcoinEsploraApiUrls, publicationCatalog, publicationAnchorCatalog, anchorKnowledgeStore,
        roleProviderPreferenceStore, arweaveHostSigner, resolvedArweaveGatewayUrl, steemRuntime, blurtRuntime,
        networkWriterSettingsStore, networkWriterLoader
    } = await startNetwork();
    const { composeAnchoring } = await import('./main/composeAnchoring.js');
    const anchoring = composeAnchoring({
        identityProvider, resolvedBitcoinEsploraApiUrls, publicationCatalog, publicationAnchorCatalog,
        anchorKnowledgeStore, roleProviderPreferenceStore, arweaveHostSigner, resolvedArweaveGatewayUrl, steemRuntime, blurtRuntime,
        networkWriterSettingsStore
    });

    app.provide('publicationEvidenceCoordinator', anchoring.publicationEvidenceCoordinator);
    app.provide('publicationAnchorCreationCoordinator', anchoring.publicationAnchorCreationCoordinator);
    app.provide('preferredPublicationAnchorCreationCoordinator', anchoring.preferredPublicationAnchorCreationCoordinator);
    app.provide('externalAnchorEvidenceViewRegistry', anchoring.externalAnchorEvidenceViewRegistry);
    app.provide('bitcoinAnchorProofReconciliationView', anchoring.bitcoinAnchorProofReconciliationView);

    // The wallets switched on (Bitcoin's and Base's writers), before a page
    // that injects them renders.
    await networkWriterLoader.attach(anchoring);
});

// Distributing publications and Snapshots (Arweave, Nostr, IPFS, Steem, Blurt),
// finding Snapshots and place names, remote IPFS pinning and IPFS content
// checks, and opening a Publication link: what the Editor, World View and the
// Publications page publish and search with.
defineServiceGroup('distribution', async () => {
    const {
        composeIpfsGatewayContentStore, resolvedIpfsGatewayUrls, resolvedIpfsNodeApiUrl, snapshotPlacementStoreRegistry,
        writableAnnouncementDiscoveryProvider, resolvedArweaveGatewayUrl, resolvedNostrRelayUrls, PUBLICATION_DISCOVERY_TAG,
        publicationDistributionLifecycleStore, arweaveHostSigner, nostrHostPublisher, nostrPublicationRuntimeCapabilities,
        steemRuntime, blurtRuntime, ownSnapshotDistributionLog, publicationSnapshotPlacementCatalog,
        publicationSnapshotPlacementResolutionStoreRegistry, roleProviderPreferenceStore, storeSnapshotContentUseCase,
        nostrRelayQueryClient, announcementIndex, publicationContentStore, retrievePublicationClaim,
        worldEncounterMaterialVerifier, worldEncounterPublicationAdmissionLog
    } = await startNetwork();
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
        resolvedIpfsNodeApiUrl, snapshotPlacementStoreRegistry, resolvedAnnouncementDiscoveryProvider: writableAnnouncementDiscoveryProvider,
        resolvedArweaveGatewayUrl, resolvedNostrRelayUrls, PUBLICATION_DISCOVERY_TAG,
        publicationDistributionLifecycleStore, arweaveHostSigner, nostrHostPublisher,
        nostrPublicationRuntimeCapabilities, steemRuntime, blurtRuntime, snapshotDistributionLog: ownSnapshotDistributionLog,
        buildTagsFor: (publicationId) => publishedBuildTags(new LocalStorageProvider(), publicationId)
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
        roleProviderPreferenceStore, resolvedAnnouncementDiscoveryProvider: writableAnnouncementDiscoveryProvider, storeSnapshotContentUseCase,
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

// "Walk here with me": a link that connects a friend's peer session to this
// one through a one-off meeting on the same rendezvous servers, for World
// View, the Editor's Build with me, and the page the link opens.
defineServiceGroup('walkTogether', async () => {
    const { peerSessionManager, peerConnectionProvider, rendezvousTransports } = await startNetwork();
    const { WalkTogether } = await import('../application/walkTogether/WalkTogether.js');
    app.provide('walkTogether', new WalkTogether({ peerSessionManager, identityProvider, peerConnectionProvider, rendezvousTransports }));
});

// Copies everything to another device through a one-off code, over the same
// peer connections and rendezvous servers as Peers.
defineServiceGroup('devicePairing', async () => {
    const { peerConnectionProvider, rendezvousTransports } = await startNetwork();
    const { DevicePairing } = await import('../application/devicePairing/DevicePairing.js');
    app.provide('devicePairing', new DevicePairing({ deviceBackup: deviceBackupUseCase, peerConnectionProvider, rendezvousTransports }));
});

// Every observation of a publication this device has recorded, for the
// Publications page's history; a single shared instance
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

// Whether notifications are also shown by the operating system; turned on in
// the bell's panel (ui/components/DeviceNotificationSetting.js).
const deviceNotificationSettingsStore = new DeviceNotificationSettingsStore({ storageProvider: new LocalStorageProvider() });
app.provide('deviceNotificationSettingsStore', deviceNotificationSettingsStore);

app.use(router);
app.mount('#app');

// The network runtime starts once the first page has been drawn, so building
// it never holds Home back (a page that needs it has started it already), or
// after a second at most: a tab opened in the background draws nothing until
// it is shown, and its peers, notifications and announcement sync shouldn't
// wait for that. A failure is left for the next page that needs it.
let networkScheduled = false;
function startNetworkSoon() {
    if (networkScheduled) return;
    networkScheduled = true;
    startNetwork().catch(() => {});
}
router.isReady().catch(() => {}).then(() => requestAnimationFrame(() => setTimeout(startNetworkSoon, 0)));
setTimeout(startNetworkSoon, 1000);

// Installing and working offline: the published site's service worker
// (ui/pwa/serviceWorkerClient.js; none in the unbundled repository). A
// clicked notification opens where it points.
const navigateTo = (path) => {
    router.push(path).catch(() => {});
};
registerServiceWorker({ navigate: navigateTo });

// Notifications on this device (core/social/DeviceNotifications.js): the signed-in
// identity's new notifications, shown by the operating system while
// ForkBuild is open but not in view, once turned on in the bell's panel.
const deviceNotificationEvents = identityProvider
    ? new GetRecipientNotificationEventsUseCase(new NotificationEventStore(new LocalStorageProvider()), identityProvider)
    : null;
const deviceNotificationLookup = new CompositeDiscoveryProvider([
    new LocalDiscoveryProvider(new LocalStorageProvider()),
    decentralizedPublicationDiscoveryProvider
]);
const deviceNotificationRelay = new DeviceNotificationRelay({
    recipient: () => resolveSigningIdentityId(identityProvider),
    loadEvents: () => (deviceNotificationEvents ? deviceNotificationEvents.execute() : []),
    settings: () => deviceNotificationSettingsStore.get(),
    permission: browserNotificationPermission,
    isVisible: () => document.visibilityState === 'visible',
    describe: (event) => {
        const described = describeNotification(event);
        if (!described) return null;
        const publicationId = event.payload?.publicationId;
        const documentId = typeof publicationId === 'string' ? deviceNotificationLookup.findById(publicationId)?.documentId : null;
        return { ...described, path: documentId ? `/world/${documentId}` : '/', tag: event.notificationId };
    },
    show: (described) => showDeviceNotification(described, { navigate: navigateTo })
});
deviceNotificationRelay.start();
// After a Publication is admitted (its notifiers, subscribed by the network
// runtime once it has rebuilt what was already here, have stored theirs by
// then), and now and then for the rest (comments, other tabs).
whenNetworkBuilt.push(() => decentralizedPublicationDiscoveryProvider.onAdded(() => {
    setTimeout(() => deviceNotificationRelay.check(), 0);
}));
setInterval(() => deviceNotificationRelay.check(), 20_000);

