// The Announcement & Discovery role's keyed registry: substrates are
// registered kind by kind, a kind a device can't do is left out and asked
// for as "not set up", and the role resolver takes it like the Content and
// Proof registries. The app's composition roots announce through it.
import {
    ANNOUNCEMENT_DISCOVERY_PROVIDER_KEYS,
    announcementDiscoveryProviderOrDefault,
    isAnnouncementDiscoveryProviderKey
} from '../core/AnnouncementDiscoveryProvider.js';
import { COMMENTARY_DISTRIBUTION_PROVIDER_KEYS, LOCAL_AND_PEERS_ONLY } from '../core/CommentaryDistributionProvider.js';
import { AnnouncementDiscoveryProviderRegistry, AnnouncementDiscoveryServiceKind } from '../application/discovery/AnnouncementDiscoveryProviderRegistry.js';
import { RoleAwareProviderResolver, RoleProviderResolutionStatus } from '../application/settings/RoleAwareProviderResolver.js';
import { SnapshotPlacementStoreRegistry } from '../application/snapshot/placement/SnapshotPlacementStoreRegistry.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { UserFacingError } from '../core/UserFacingError.js';
import { errorText } from '../ui/i18n/i18n.js';
import { ArweaveContentStore } from '../content/ArweaveContentStore.js';
import { composePublicationDistribution } from '../ui/main/composePublicationDistribution.js';
import { composeSnapshotDiscovery } from '../ui/main/composeSnapshotDiscovery.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/snapshot/placement/LocalPublicationSnapshotPlacementCatalog.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

const { SNAPSHOT, PLACE_NAMING } = AnnouncementDiscoveryServiceKind;
const publisher = (name) => ({ name, discoveryTag: 'forkbuild-snapshot', publish: async () => ({ published: name }) });

async function rejection(promise) {
    try {
        await promise;
    } catch (error) {
        return error;
    }
    return null;
}

function rejectionOf(fn) {
    try {
        fn();
    } catch (error) {
        return error;
    }
    return null;
}

// The vocabulary, shared by every list of substrates.
{
    assert(ANNOUNCEMENT_DISCOVERY_PROVIDER_KEYS.join() === 'nostr,arweave,steem,blurt', 'four substrates announce');
    assert(isAnnouncementDiscoveryProviderKey('blurt') && !isAnnouncementDiscoveryProviderKey('ipfs'), 'IPFS stores content but does not announce');
    assert(announcementDiscoveryProviderOrDefault('steem') === 'steem', 'a known key is kept');
    assert(announcementDiscoveryProviderOrDefault('hive') === 'nostr' && announcementDiscoveryProviderOrDefault(undefined) === 'nostr', 'an unknown or missing key means Nostr');
    assert(COMMENTARY_DISTRIBUTION_PROVIDER_KEYS.join() === [...ANNOUNCEMENT_DISCOVERY_PROVIDER_KEYS, LOCAL_AND_PEERS_ONLY].join(), 'comments can go to every announcing substrate, or to none');
    console.log('✓ the provider keys');
}

// Registering, kind by kind.
{
    const nostrSnapshots = publisher('nostr-snapshots');
    const nostrPlaces = publisher('nostr-places');
    const registry = new AnnouncementDiscoveryProviderRegistry()
        .register({ providerKey: 'nostr', snapshotDiscoveryPublisher: nostrSnapshots })
        .register({ providerKey: 'steem', snapshotDiscoveryPublisher: null });
    registry.register({ providerKey: 'nostr', placeNamingDiscoveryPublisher: nostrPlaces });
    assert(registry.serviceFor('nostr', SNAPSHOT) === nostrSnapshots && registry.serviceFor('nostr', PLACE_NAMING) === nostrPlaces, 'a later registration adds a kind and keeps the earlier one');
    assert(registry.get('nostr').providerKey === 'nostr' && Object.isFrozen(registry.get('nostr')), 'a provider names its own key and can\'t be changed from outside');
    assert(registry.has('steem') && registry.serviceFor('steem', SNAPSHOT) === null, 'a kind registered as null is left out');
    assert(registry.get('arweave') === null && registry.serviceFor('arweave', SNAPSHOT) === null, 'an unregistered substrate is null, never a throw');
    const replacement = publisher('replacement');
    registry.register({ providerKey: 'nostr', snapshotDiscoveryPublisher: replacement });
    assert(registry.serviceFor('nostr', SNAPSHOT) === replacement && registry.serviceFor('nostr', PLACE_NAMING) === nostrPlaces, 'registering a kind again replaces only that kind');
    assert(registry.providerKeys.join() === 'nostr,steem', 'the keys registered, in order');

    assert(/unknown providerKey "ipfs"/.test(rejectionOf(() => registry.register({ providerKey: 'ipfs', snapshotDiscoveryPublisher: publisher('x') }))?.message), 'only announcing substrates can be registered');
    assert(/unknown service commentary/.test(rejectionOf(() => registry.register({ providerKey: 'nostr', commentary: publisher('x') }))?.message), 'only known kinds of service');
    assert(/must implement publish\(\)/.test(rejectionOf(() => registry.register({ providerKey: 'nostr', snapshotDiscoveryPublisher: {} }))?.message), 'a service must be able to publish');
    console.log('✓ registering');
}

// Asking for what a device hasn't set up names the substrate.
{
    const registry = new AnnouncementDiscoveryProviderRegistry().register({ providerKey: 'arweave', snapshotDiscoveryPublisher: publisher('a') });
    assert(registry.requireServiceFor('arweave', SNAPSHOT).name === 'a', 'a registered service is returned');
    const steem = rejectionOf(() => registry.requireServiceFor('steem', SNAPSHOT));
    assert(steem instanceof UserFacingError && errorText(steem) === 'Steem isn\'t set up on this device. Check its settings, or choose another network.', `Steem is named as not set up (got "${errorText(steem)}")`);
    const arweavePlaces = rejectionOf(() => registry.requireServiceFor('arweave', PLACE_NAMING));
    assert(arweavePlaces instanceof UserFacingError && errorText(arweavePlaces).startsWith('Arweave isn\'t set up'), 'so is a substrate missing just that kind');
    const nostr = rejectionOf(() => registry.requireServiceFor('nostr', SNAPSHOT));
    assert(nostr instanceof UserFacingError && /no compatible browser extension/.test(errorText(nostr)), 'Nostr points at the missing extension');
    console.log('✓ not set up');
}

// The role resolver takes it as the Announcement & Discovery registry.
{
    const preferenceStore = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
    const discoveryRegistry = new AnnouncementDiscoveryProviderRegistry().register({ providerKey: 'blurt', snapshotDiscoveryPublisher: publisher('b') });
    const resolver = new RoleAwareProviderResolver({ preferenceStore, discoveryRegistry, contentRegistry: new SnapshotPlacementStoreRegistry(), proofRegistry: { get: () => null } });
    const role = RoleProviderRole.ANNOUNCEMENT_AND_DISCOVERY;
    assert(resolver.resolve(role).status === RoleProviderResolutionStatus.NO_PREFERENCE, 'nothing saved');
    preferenceStore.save(new RoleProviderPreference({ role, providerKey: 'blurt' }));
    const resolved = resolver.resolve(role);
    assert(resolved.status === RoleProviderResolutionStatus.RESOLVED && resolved.provider.snapshotDiscoveryPublisher.name === 'b', 'a saved substrate this device has resolves to its services');
    preferenceStore.save(new RoleProviderPreference({ role, providerKey: 'steem' }));
    assert(resolver.resolve(role).status === RoleProviderResolutionStatus.PROVIDER_NOT_FOUND, 'a saved substrate this device lacks is not found');
    console.log('✓ the role resolver');
}

// The app's composition roots fill one registry and announce through it.
{
    const announced = [];
    const nostrHostPublisher = async (relayUrl, template) => {
        announced.push(template);
        return { published: true, id: String(announced.length).padStart(64, '0') };
    };
    const stores = new SnapshotPlacementStoreRegistry();
    stores.register(new ArweaveContentStore({ signer: { sign: async () => { throw new Error('no wallet in this test'); } }, fetchImpl: async () => { throw new Error('offline'); } }));
    const distribution = composePublicationDistribution({
        resolvedIpfsNodeApiUrl: 'http://127.0.0.1:5001',
        snapshotPlacementStoreRegistry: stores,
        resolvedAnnouncementDiscoveryProvider: 'nostr',
        resolvedArweaveGatewayUrl: 'https://arweave.invalid',
        resolvedNostrRelayUrls: ['wss://relay.invalid'],
        PUBLICATION_DISCOVERY_TAG: 'forkbuild-publication',
        publicationDistributionLifecycleStore: null,
        arweaveHostSigner: { sign: async () => { throw new Error('no wallet in this test'); } },
        nostrHostPublisher,
        nostrPublicationRuntimeCapabilities: null
    });
    const registry = distribution.announcementDiscoveryProviderRegistry;
    assert(registry.providerKeys.join() === 'nostr,arweave,steem,blurt', 'every substrate is registered');
    assert(distribution.resolveSnapshotDiscoveryPublisher() === registry.serviceFor('nostr', SNAPSHOT) && registry.serviceFor('nostr', SNAPSHOT), 'Snapshots announce on the saved substrate by default');
    assert(distribution.resolveSnapshotDiscoveryPublisher('arweave') === registry.serviceFor('arweave', SNAPSHOT), 'or on the one chosen');
    assert(distribution.resolveSnapshotDiscoveryPublisher('hive') === registry.serviceFor('nostr', SNAPSHOT), 'an unknown choice means the default');
    assert(distribution.resolveSnapshotDiscoveryPublisher('steem') === null, 'Steem without a runtime has no publisher to offer');
    const steem = rejectionOf(() => distribution.snapshotDistributionCommand(new Uint8Array([1, 2, 3]), 'ar', 'pub-1', null, 'steem'));
    assert(steem instanceof UserFacingError && errorText(steem).startsWith('Steem isn\'t set up'), `distributing to Steem without a runtime says it isn't set up (got "${errorText(steem)}")`);

    const snapshotDiscovery = composeSnapshotDiscovery({
        publicationSnapshotPlacementCatalog: new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider()),
        publicationSnapshotPlacementResolutionStoreRegistry: stores,
        roleProviderPreferenceStore: new RoleProviderPreferenceStore(new InMemoryStorageProvider()),
        resolvedAnnouncementDiscoveryProvider: 'nostr',
        storeSnapshotContentUseCase: new StoreSnapshotContentUseCase(new LocalContentStore()),
        resolvedArweaveGatewayUrl: 'https://arweave.invalid',
        resolvedNostrRelayUrls: ['wss://relay.invalid'],
        nostrRelayQueryClient: async () => [],
        nostrHostPublisher,
        arweaveAnnouncementUploadTaggedTransaction: distribution.arweaveAnnouncementUploadTaggedTransaction,
        snapshotDistributionAvailableStorageTypes: distribution.snapshotDistributionAvailableStorageTypes,
        announcementDiscoveryProviderRegistry: registry
    });
    assert(registry.serviceFor('nostr', PLACE_NAMING) && registry.serviceFor('arweave', PLACE_NAMING) && !registry.serviceFor('blurt', PLACE_NAMING), 'place naming joins the same registry, for the substrates this device has');
    assert(registry.serviceFor('nostr', SNAPSHOT), 'without dropping the Snapshot publishers');
    const blurt = await rejection(snapshotDiscovery.distributePlaceNamingClaimCommand({}, 'blurt'));
    assert(blurt instanceof UserFacingError && errorText(blurt).startsWith('Blurt isn\'t set up'), `naming a place on Blurt without a runtime says it isn't set up (got "${errorText(blurt)}")`);
    console.log('✓ the composition roots');
}
