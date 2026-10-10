import { SetArweaveGatewayConfigurationUseCase } from '../../application/settings/SetArweaveGatewayConfigurationUseCase.js';
import { bootstrapWorldDiscoveryRuntime } from '../../application/discovery/WorldDiscoveryRuntimeBootstrap.js';
import { LocalStorageProvider } from '../../storage/LocalStorageProvider.js';
import { DEFAULT_ARWEAVE_GATEWAY_URLS } from '../../core/ArweaveGatewayConfiguration.js';
import { ArweaveGatewayConfigurationStore } from '../../storage/ArweaveGatewayConfigurationStore.js';
import { SetIpfsGatewayConfigurationUseCase } from '../../application/settings/SetIpfsGatewayConfigurationUseCase.js';
import { SetIpfsNodeConfigurationUseCase } from '../../application/settings/SetIpfsNodeConfigurationUseCase.js';
import { DEFAULT_NOSTR_RELAY_URLS } from '../../core/NostrRelayConfiguration.js';
import { NostrRelayConfigurationStore } from '../../storage/NostrRelayConfigurationStore.js';
import { SetNostrRelayConfigurationUseCase } from '../../application/settings/SetNostrRelayConfigurationUseCase.js';
import { SteemReadingConfiguration } from '../../core/SteemReadingConfiguration.js';
import { SteemReadingConfigurationStore } from '../../storage/SteemReadingConfigurationStore.js';
import { SetSteemReadingConfigurationUseCase } from '../../application/settings/SetSteemReadingConfigurationUseCase.js';
import { composeSteemRuntime } from '../../application/steem/SteemRuntimeComposition.js';
import { publishedBuildTags } from '../../application/challenge/PublishedBuildTags.js';
import { composeSteemPublicationNoticeDescriber } from '../../application/steem/SteemPublicationNoticeComposition.js';
import { DISCOVERY_CLAIM_IPFS_TIMEOUT_MS, buildIpfsWorldEncounterMaterialResolver, composePublicationClaimRetriever } from '../../application/publication/PublicationClaimRetriever.js';
import { DEFAULT_IPFS_GATEWAY_URLS } from '../../core/IpfsGatewayConfiguration.js';
import { SteemAnnouncingConfigurationStore } from '../../storage/SteemAnnouncingConfigurationStore.js';
import { SetSteemAnnouncingConfigurationUseCase } from '../../application/settings/SetSteemAnnouncingConfigurationUseCase.js';
import { createSteemKeychainBroadcaster } from '../../steem/SteemKeychainBroadcaster.js';
import { SteemContentUploadStore } from '../../storage/SteemContentUploadStore.js';
import { BlurtReadingConfiguration } from '../../core/BlurtReadingConfiguration.js';
import { BlurtReadingConfigurationStore } from '../../storage/BlurtReadingConfigurationStore.js';
import { BlurtAnnouncingConfigurationStore } from '../../storage/BlurtAnnouncingConfigurationStore.js';
import { BlurtContentUploadStore } from '../../storage/BlurtContentUploadStore.js';
import { BlurtKnownAuthorStore } from '../../storage/BlurtKnownAuthorStore.js';
import { BlurtPostRecordStore } from '../../storage/BlurtPostRecordStore.js';
import { SetBlurtReadingConfigurationUseCase } from '../../application/settings/SetBlurtReadingConfigurationUseCase.js';
import { SetBlurtAnnouncingConfigurationUseCase } from '../../application/settings/SetBlurtAnnouncingConfigurationUseCase.js';
import { composeBlurtRuntime } from '../../application/blurt/BlurtRuntimeComposition.js';
import { createBlurtKeychainBroadcaster, uploadBlurtImage } from '../../blurt/BlurtKeychain.js';
import { shallowRef } from 'vue';
import { LocalWorldEncounterMaterialSource } from '../../application/worldEncounter/LocalWorldEncounterMaterialSource.js';
import { PeerWorldEncounterMaterialSource } from '../../application/worldEncounter/PeerWorldEncounterMaterialSource.js';
import { composeWorldEncounterMaterialVerifier } from '../../application/worldEncounter/WorldEncounterMaterialVerifierRuntimeComposition.js';
import { PublicationDistributionLifecycleMemoryStore } from '../../application/publication/distribution/PublicationDistributionLifecycleStore.js';
import { PublicationDistributionLifecyclePersistence } from '../../application/publication/distribution/PublicationDistributionLifecyclePersistence.js';
import { PublicationDistributionLifecyclePersistenceBridge } from '../../application/publication/distribution/PublicationDistributionLifecyclePersistenceBridge.js';
import { PublicationDistributionLifecycleRestorer } from '../../application/publication/distribution/PublicationDistributionLifecycleRestorer.js';
import { hydratePublicationDistributionLifecycles } from '../../application/publication/distribution/PublicationDistributionLifecycleHydration.js';
import { createNostrRelayQueryClient } from '../../nostr/NostrRelayQueryClient.js';
import { LocalDiscoveryProvider } from '../../discovery/LocalDiscoveryProvider.js';
import { AnnouncementKind } from '../../application/announcementIndex/AnnouncementKinds.js';
import { IndexBackedPublicationDiscoveryService } from '../../application/announcementIndex/IndexedDiscoverySources.js';
import { composeDecentralizedWorldEncounterMaterialDiscoveryServices, composeDecentralizedWorldEncounterMaterialDiscoveryRuntime } from '../../application/worldEncounter/DecentralizedWorldEncounterMaterialDiscoveryRuntimeComposition.js';
import { composeDiscoverWorldEncounterPublicationCommand } from '../../application/worldEncounter/DiscoverWorldEncounterPublicationCommandComposition.js';
import { composeWorldEncounterLeadAssociationsQuery } from '../../application/worldEncounter/WorldEncounterLeadAssociationsQueryComposition.js';

// Composition root: the World discovery registry, World Encounter material
// sources and verification, the Arweave gateway, IPFS and Nostr relay
// settings, decentralized encounter discovery, and the restored publication
// distribution lifecycles.
export function composeWorldDiscovery({
    peerSessionManager, peerMessageBus, publicationCatalog, ipfsGatewayConfigurationStore,
    ipfsNodeConfigurationStore, publicationContentStore = null, announcementIndex = null,
    // Whether this device's writer for a network is switched on
    // (core/NetworkWriters.js): Steem and Blurt post nothing while theirs is off.
    isNetworkWriterEnabled = () => true
}) {
    // The one World discovery registry. A peer's World contribution registers when
    // it sends and unregisters automatically when the peer disconnects.
    const worldDiscoveryRuntime = bootstrapWorldDiscoveryRuntime({
        connectedPeerRegistry: peerSessionManager.registry,
        peerMessageBus
    });

    // Material sources for World Encounters: local publications, peers, and (below)
    // decentralized retrieval. An unanswered peer request resolves to null
    // (UNAVAILABLE).
    const worldEncounterMaterialPeerSource = new PeerWorldEncounterMaterialSource(peerMessageBus, peerSessionManager.registry);
    const { verifier: worldEncounterMaterialVerifier } = composeWorldEncounterMaterialVerifier();

    // A saved gateway list overrides DEFAULT_ARWEAVE_GATEWAY_URLS; the default is
    // never saved as if it were a preference. It applies only to reading published
    // content, never to where this replica writes. nostrRelayQueryClient may be
    // undefined where no WebSocket exists; discovery then degrades to no Nostr.
    const arweaveGatewayConfigurationStore = new ArweaveGatewayConfigurationStore(new LocalStorageProvider());
    // Every configured gateway in priority order, used only by the retrieval
    // sites (World Encounter material, Snapshot and Signed Claim retrieval).
    // Arweave Anchor's publish/verify pair keeps using the single first gateway.
    const resolvedArweaveGatewayUrls = (arweaveGatewayConfigurationStore.get() || { gatewayUrls: DEFAULT_ARWEAVE_GATEWAY_URLS }).gatewayUrls;
    const resolvedArweaveGatewayUrl = resolvedArweaveGatewayUrls[0];
    const setArweaveGatewayConfigurationUseCase = new SetArweaveGatewayConfigurationUseCase({ arweaveGatewayConfigurationStore });

    const setIpfsGatewayConfigurationUseCase = new SetIpfsGatewayConfigurationUseCase({ ipfsGatewayConfigurationStore });

    const setIpfsNodeConfigurationUseCase = new SetIpfsNodeConfigurationUseCase({ ipfsNodeConfigurationStore });

    // The one Nostr relay set for the whole app: discovery, Place Naming, Snapshot
    // and Publication announcement, and Commentary all use it. A saved list
    // overrides DEFAULT_NOSTR_RELAY_URLS. Publishing fans out to every relay; it
    // never fails over in order.
    const nostrRelayConfigurationStore = new NostrRelayConfigurationStore(new LocalStorageProvider());
    const resolvedNostrRelayUrls = (nostrRelayConfigurationStore.get() || { relayUrls: DEFAULT_NOSTR_RELAY_URLS }).relayUrls;
    const resolvedNostrRelayUrl = resolvedNostrRelayUrls[0];
    const setNostrRelayConfigurationUseCase = new SetNostrRelayConfigurationUseCase({ nostrRelayConfigurationStore });





    // Steem announcements are read with the saved settings, or the defaults
    // (api.steemit.com, @forkbuild's threads from 2026-09). Changes apply on
    // the next load, like the other network settings. Announcing reads the
    // saved account and looks for Steem Keychain each time, since an
    // extension can inject itself after the page loads.
    const steemReadingConfigurationStore = new SteemReadingConfigurationStore(new LocalStorageProvider());
    const setSteemReadingConfigurationUseCase = new SetSteemReadingConfigurationUseCase({ steemReadingConfigurationStore });
    const steemAnnouncingConfigurationStore = new SteemAnnouncingConfigurationStore(new LocalStorageProvider());
    const setSteemAnnouncingConfigurationUseCase = new SetSteemAnnouncingConfigurationUseCase({ steemAnnouncingConfigurationStore });
    // The Steem content store's latest upload progress, shown by the
    // Distribute dialogs and the Publications page while it stores a
    // Snapshot; unfinished uploads are remembered so a retry resumes them.
    const steemContentUploadProgress = shallowRef(null);
    // The latest Steem notice that went without its build's picture,
    // `{ title, reason, at }`, so the Distribute dialogs and the
    // Publications page can say so (application/steem/SteemContentUploadProgressText.js).
    const steemNoticePictureProblem = shallowRef(null);
    const steemRuntime = composeSteemRuntime({
        configuration: steemReadingConfigurationStore.get() || new SteemReadingConfiguration(),
        getAccount: () => steemAnnouncingConfigurationStore.get()?.account ?? null,
        getBroadcaster: () => createSteemKeychainBroadcaster({ keychain: globalThis.steem_keychain }),
        isWriterEnabled: () => isNetworkWriterEnabled('steem'),
        contentUploads: new SteemContentUploadStore(new LocalStorageProvider()),
        contentUploadProgress: { report: (state) => { steemContentUploadProgress.value = state; } },
        // A publication's announcement carries its build's tags, so the weekly
        // challenge can find it among the thread's replies.
        buildTagsFor: (publicationId) => publishedBuildTags(new LocalStorageProvider(), publicationId),
        // A Signed Claim's notice shows its build: title, description and a
        // thumbnail uploaded to the Steem image host.
        describePublication: publicationContentStore
            ? composeSteemPublicationNoticeDescriber({
                contentStore: publicationContentStore,
                // No picture is uploaded while the writer is off.
                getAccount: () => (isNetworkWriterEnabled('steem') ? steemAnnouncingConfigurationStore.get()?.account ?? null : null),
                onPictureMissing: ({ title, reason }) => { steemNoticePictureProblem.value = { title, reason, at: Date.now() }; }
            })
            : null
    });

    // Blurt, the same way (docs/Protocol.md, "Proposed: Blurt Substrate"):
    // read with the saved settings or the defaults, posted from the saved
    // account through Blurt Keychain, looked up each time. Its uploads, and
    // its waits for the chain's interval between top-level posts, are
    // reported like Steem's.
    const blurtReadingConfigurationStore = new BlurtReadingConfigurationStore(new LocalStorageProvider());
    const setBlurtReadingConfigurationUseCase = new SetBlurtReadingConfigurationUseCase({ blurtReadingConfigurationStore });
    const blurtAnnouncingConfigurationStore = new BlurtAnnouncingConfigurationStore(new LocalStorageProvider());
    const setBlurtAnnouncingConfigurationUseCase = new SetBlurtAnnouncingConfigurationUseCase({ blurtAnnouncingConfigurationStore });
    const blurtAccount = () => blurtAnnouncingConfigurationStore.get()?.account ?? null;
    const blurtContentUploadProgress = shallowRef(null);
    const blurtNoticePictureProblem = shallowRef(null);
    const blurtRuntime = composeBlurtRuntime({
        configuration: blurtReadingConfigurationStore.get() || new BlurtReadingConfiguration(),
        getAccount: blurtAccount,
        getBroadcaster: () => createBlurtKeychainBroadcaster(),
        isWriterEnabled: () => isNetworkWriterEnabled('blurt'),
        knownAuthors: new BlurtKnownAuthorStore(new LocalStorageProvider()),
        postRecords: new BlurtPostRecordStore(new LocalStorageProvider()),
        contentUploads: new BlurtContentUploadStore(new LocalStorageProvider()),
        contentUploadProgress: { report: (state) => { blurtContentUploadProgress.value = state; } },
        onWaiting: ({ untilMs }) => { blurtContentUploadProgress.value = { phase: 'waiting', untilMs }; },
        describePublication: publicationContentStore
            ? composeSteemPublicationNoticeDescriber({
                contentStore: publicationContentStore,
                getAccount: () => (isNetworkWriterEnabled('blurt') ? blurtAccount() : null),
                chainName: 'Blurt',
                upload: async ({ account, bytes }) => (await uploadBlurtImage({ account, bytes, fileName: 'forkbuild-build.png' })).url,
                onPictureMissing: ({ title, reason }) => { blurtNoticePictureProblem.value = { title, reason, at: Date.now() }; }
            })
            : null
    });

    const nostrRelayQueryClient = createNostrRelayQueryClient({});
    // Each service records the leads it finds in the Announcement Index and
    // returns the ones it found before (docs/AnnouncementIndex.md).
    const networkWorldDiscoveryServices = {
        ...composeDecentralizedWorldEncounterMaterialDiscoveryServices({
            nostrQueryImpl: nostrRelayQueryClient,
            nostrRelayUrls: resolvedNostrRelayUrls
        }),
        steem: steemRuntime ? steemRuntime.publicationDiscoveryQueryService : null,
        blurt: blurtRuntime ? blurtRuntime.publicationDiscoveryQueryService : null
    };
    const decentralizedWorldDiscoveryServices = Object.fromEntries(Object.entries(networkWorldDiscoveryServices).map(([name, service]) => [
        name,
        service && announcementIndex
            ? new IndexBackedPublicationDiscoveryService(service, { index: announcementIndex, kind: AnnouncementKind.PUBLICATION })
            : service
    ]));
    const resolvedIpfsGatewayUrls = (ipfsGatewayConfigurationStore.get() || { gatewayUrls: DEFAULT_IPFS_GATEWAY_URLS }).gatewayUrls;
    const decentralizedWorldEncounterMaterialDiscoveryRuntime = composeDecentralizedWorldEncounterMaterialDiscoveryRuntime({
        discoveryServices: decentralizedWorldDiscoveryServices,
        local: new LocalWorldEncounterMaterialSource(new LocalStorageProvider()),
        peer: worldEncounterMaterialPeerSource,
        verifier: worldEncounterMaterialVerifier,
        arweaveResolverOptions: { gatewayUrls: resolvedArweaveGatewayUrls },
        steemMaterialResolver: steemRuntime ? steemRuntime.publicationMaterialResolver : null,
        blurtMaterialResolver: blurtRuntime ? blurtRuntime.publicationMaterialResolver : null,
        // Signed Claims distributed with IPFS storage (`ipfs://`), read as links read them.
        ipfsMaterialResolver: buildIpfsWorldEncounterMaterialResolver({ gatewayUrls: resolvedIpfsGatewayUrls, timeoutMs: DISCOVERY_CLAIM_IPFS_TIMEOUT_MS })
    });
    const worldDiscoveryLeadRegistry = decentralizedWorldEncounterMaterialDiscoveryRuntime.registry;
    const worldEncounterMaterialSources = decentralizedWorldEncounterMaterialDiscoveryRuntime.materialSources;

    // Reads the same 'forkbuild-publications' key as LocalWorldEncounterMaterialSource,
    // listed fresh on every call so evidence reflects current local publications.
    const worldEncounterPublicationEvidenceProvider = new LocalDiscoveryProvider(new LocalStorageProvider());
    const discoverWorldEncounterPublicationCommand = composeDiscoverWorldEncounterPublicationCommand({
        runtime: decentralizedWorldEncounterMaterialDiscoveryRuntime,
        discoveryProvider: worldEncounterPublicationEvidenceProvider
    });
    // Uses the same runtime and publication source as the discovery command above,
    // so the Location panel and discovery always agree.
    const worldEncounterLeadAssociationsQuery = composeWorldEncounterLeadAssociationsQuery({
        runtime: decentralizedWorldEncounterMaterialDiscoveryRuntime,
        discoveryProvider: worldEncounterPublicationEvidenceProvider
    });

    // Shared with createPublicationDistributionRuntimeProvider() below. Passed to
    // the canvas as the Discovery-tag field's initial value, never baked into the
    // command, so the field stays editable per call.
    // Reads a Signed Claim named by a link (#/view/steem|blurt|ar|ipfs/…) from where
    // it is stored, through the configured Arweave and IPFS gateways.
    const retrievePublicationClaim = composePublicationClaimRetriever({
        steemResolver: steemRuntime ? steemRuntime.publicationMaterialResolver : null,
        blurtResolver: blurtRuntime ? blurtRuntime.publicationMaterialResolver : null,
        arweaveGatewayUrls: resolvedArweaveGatewayUrls,
        ipfsGatewayUrls: resolvedIpfsGatewayUrls
    });

    const PUBLICATION_DISCOVERY_TAG = 'forkbuild-publication';

    // The one distribution lifecycle store: restored from what this replica
    // persisted for its cataloged publications, then bridged so later changes are
    // persisted too.
    const publicationDistributionLifecycleStore = new PublicationDistributionLifecycleMemoryStore();
    const publicationDistributionLifecyclePersistence = new PublicationDistributionLifecyclePersistence(new LocalStorageProvider());
    const publicationDistributionLifecycleRestorer = new PublicationDistributionLifecycleRestorer(
        publicationDistributionLifecyclePersistence,
        publicationDistributionLifecycleStore
    );
    const publicationDistributionLifecyclePersistenceBridge = new PublicationDistributionLifecyclePersistenceBridge(
        publicationDistributionLifecycleStore,
        publicationDistributionLifecyclePersistence
    );
    hydratePublicationDistributionLifecycles(
        publicationDistributionLifecycleRestorer,
        publicationCatalog.list().map((publication) => publication.id)
    );
    // Every Publication's lifecycle is persisted, not only the catalogued
    // ones restored above: a build published from the Editor isn't in the
    // catalog, and its distribution would otherwise be lost on reload.
    publicationDistributionLifecyclePersistenceBridge.observeAll();

    return {
        worldDiscoveryRuntime, worldEncounterMaterialVerifier, arweaveGatewayConfigurationStore,
        resolvedArweaveGatewayUrl, setArweaveGatewayConfigurationUseCase, setIpfsGatewayConfigurationUseCase,
        setIpfsNodeConfigurationUseCase, nostrRelayConfigurationStore, resolvedNostrRelayUrls,
        setNostrRelayConfigurationUseCase, nostrRelayQueryClient, worldDiscoveryLeadRegistry,
        worldEncounterMaterialSources, discoverWorldEncounterPublicationCommand,
        // The unwrapped Nostr/Arweave announcement queries, for looking up one
        // Publication's signed record (application/snapshot/claimed/VerifyClaimedBuildPublication.js).
        publicationRecordQueryServices: [networkWorldDiscoveryServices.nostr, networkWorldDiscoveryServices.arweave],
        // The announcement queries that can be asked for one build tag
        // (application/challenge/ChallengeEntryDiscovery.js): Nostr and Arweave
        // by narrow tag, Steem and Blurt by the tags their announcements list.
        buildTagQueryServices: [
            networkWorldDiscoveryServices.nostr, networkWorldDiscoveryServices.arweave, networkWorldDiscoveryServices.steem,
            networkWorldDiscoveryServices.blurt
        ],
        // Every substrate's unwrapped announcement query, for finding the
        // Publications others distributed (application/publication/RepositoryNetworkDiscovery.js).
        repositoryNetworkDiscoveryServices: [
            networkWorldDiscoveryServices.nostr, networkWorldDiscoveryServices.arweave, networkWorldDiscoveryServices.steem,
            networkWorldDiscoveryServices.blurt
        ],
        worldEncounterLeadAssociationsQuery, PUBLICATION_DISCOVERY_TAG, publicationDistributionLifecycleStore,
        steemReadingConfigurationStore, setSteemReadingConfigurationUseCase, steemRuntime,
        steemAnnouncingConfigurationStore, setSteemAnnouncingConfigurationUseCase, steemContentUploadProgress,
        steemNoticePictureProblem, publicationDistributionLifecycleRestorer, retrievePublicationClaim,
        blurtReadingConfigurationStore, setBlurtReadingConfigurationUseCase, blurtRuntime,
        blurtAnnouncingConfigurationStore, setBlurtAnnouncingConfigurationUseCase, blurtContentUploadProgress,
        blurtNoticePictureProblem
    };
}
