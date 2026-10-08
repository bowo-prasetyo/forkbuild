// IPFS (Remote Pinning) uses one service saved under Content Provider: its
// endpoint and field names are kept on this device, never a token; every
// remote-pinning form starts on it, with this visit's token if one was typed;
// and a saved IPFS (Remote Pinning) Content preference places through it,
// recording an ordinary IPFS placement, or says that no service is set up.
import { IpfsRemotePinningSettings, isValidIpfsRemotePinningEndpoint } from '../core/IpfsRemotePinningSettings.js';
import { IpfsRemotePinningSettingsStore } from '../storage/IpfsRemotePinningSettingsStore.js';
import { remotePinningDraftFromSettings, remotePinningConfigurationFromSettings } from '../application/ipfs/IpfsRemotePinningDraft.js';
import { rememberIpfsRemotePublishingCredential } from '../application/ipfs/IpfsRemotePublishingCredentialMemory.js';
import { SavedRemotePinningContentStore } from '../application/ipfs/SavedRemotePinningContentStore.js';
import { backupEntryGroupOf, BackupEntryGroup } from '../application/backup/BackupEntryGroups.js';
import { RoleProviderRole } from '../core/RoleProviderRole.js';
import { RoleProviderPreference } from '../core/RoleProviderPreference.js';
import { RoleProviderPreferenceStore } from '../storage/RoleProviderPreferenceStore.js';
import { RoleProviderResolutionStatus } from '../application/settings/RoleAwareProviderResolver.js';
import { LocalPublicationCatalog } from '../application/publication/LocalPublicationCatalog.js';
import { LocalPublicationSnapshotPlacementCatalog } from '../application/snapshot/placement/LocalPublicationSnapshotPlacementCatalog.js';
import { PublicationResolver } from '../application/publication/PublicationResolver.js';
import { PublicationCatalogDiscoveryProvider } from '../discovery/PublicationCatalogDiscoveryProvider.js';
import { PublicationCatalogContentResolver } from '../discovery/PublicationCatalogContentResolver.js';
import { CreateSnapshotPlacementOrchestratorUseCase } from '../application/snapshot/placement/CreateSnapshotPlacementOrchestratorUseCase.js';
import { CreateSnapshotPlacementCreationCoordinatorUseCase } from '../application/snapshot/placement/CreateSnapshotPlacementCreationCoordinatorUseCase.js';
import { CreatePreferredSnapshotPlacementCreationCoordinatorUseCase } from '../application/snapshot/placement/CreatePreferredSnapshotPlacementCreationCoordinatorUseCase.js';
import { SnapshotPlacementCreationOutcome } from '../application/snapshot/placement/SnapshotPlacementCreationOutcome.js';
import { SnapshotPlacementCreationUiState } from '../application/snapshot/placement/SnapshotPlacementCreationUiState.js';
import { describeCreationAttempt } from '../application/snapshot/placement/SnapshotPlacementCreationView.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { displayText } from '../ui/i18n/i18n.js';
import { assert } from './support/Assert.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { makeIdentity } from './support/TestIdentity.js';

// The saved settings.
const backing = new InMemoryStorageProvider();
const settingsStore = new IpfsRemotePinningSettingsStore(backing);
assert(settingsStore.get() === null, 'nothing saved at first');
assert(isValidIpfsRemotePinningEndpoint('https://api.example/pin') && !isValidIpfsRemotePinningEndpoint('ftp://x') && !isValidIpfsRemotePinningEndpoint(''),
    'only an http(s) endpoint is accepted');
let refused = false;
try { new IpfsRemotePinningSettings({ endpoint: 'https://api.example/pin', requestField: 'two words' }); } catch { refused = true; }
assert(refused, 'a field name has no spaces');
settingsStore.save(new IpfsRemotePinningSettings({ endpoint: ' https://api.example/pin ', requestField: 'file', responseField: 'IpfsHash' }));
const saved = settingsStore.get();
assert(saved.endpoint === 'https://api.example/pin' && saved.requestField === 'file' && saved.responseField === 'IpfsHash', 'it is saved and read back');
const raw = backing.load('ipfs-remote-pinning-settings');
assert(JSON.stringify(Object.keys(raw).sort()) === JSON.stringify(['endpoint', 'requestField', 'responseField']), 'only the endpoint and field names are kept, never a token');
backing.save('ipfs-remote-pinning-settings', { endpoint: 'not a url' });
assert(settingsStore.get() === null, 'something unusable on disk reads as nothing saved');
assert(backupEntryGroupOf('ipfs-remote-pinning-settings') === BackupEntryGroup.SETTINGS, 'Your Data backs it up with the settings');
console.log('✓ the remote pinning service is saved without its token');

// The forms start on it.
settingsStore.save(new IpfsRemotePinningSettings({ endpoint: 'https://api.example/pin', responseField: 'IpfsHash' }));
const draft = remotePinningDraftFromSettings(settingsStore.get());
assert(draft.endpoint === 'https://api.example/pin' && draft.requestField === '' && draft.responseField === 'IpfsHash' && draft.credential === '',
    'a form starts on the saved service, with no token before one is typed');
assert(JSON.stringify(remotePinningDraftFromSettings(null)) === JSON.stringify({ endpoint: '', credential: '', requestField: '', responseField: '' }),
    'and empty with nothing saved');
assert(remotePinningConfigurationFromSettings(null) === null, 'no saved service is no configuration');
rememberIpfsRemotePublishingCredential('visit-token');
assert(remotePinningDraftFromSettings(settingsStore.get()).credential === 'visit-token'
    && remotePinningConfigurationFromSettings(settingsStore.get()).credential === 'visit-token', "this visit's token fills in");
console.log('✓ every form starts on the saved service and this visit\'s token');

// The saved Content preference.
function makeCenter() {
    const publicationCatalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const placementCatalog = new LocalPublicationSnapshotPlacementCatalog(new InMemoryStorageProvider());
    const publicationContentStore = new LocalContentStore(new InMemoryStorageProvider());
    const publicationResolver = new PublicationResolver(publicationContentStore, new LocalAuthorizationVerifier());
    const identityProvider = makeIdentity('Alice');
    const discoveryProvider = new PublicationCatalogDiscoveryProvider(publicationCatalog);
    const contentResolver = new PublicationCatalogContentResolver(publicationCatalog, publicationContentStore);
    const preferenceStore = new RoleProviderPreferenceStore(new InMemoryStorageProvider());
    const shared = { discoveryProvider, contentResolver, placementCatalog, identityProvider };

    const { createExternalSnapshotPlacementUseCase, storeRegistry } = new CreateSnapshotPlacementOrchestratorUseCase().execute({ ...shared, stores: [] });
    const { coordinator: creationCoordinator } = new CreateSnapshotPlacementCreationCoordinatorUseCase().execute({ createExternalSnapshotPlacementUseCase, storeRegistry });

    // As ui/main/composeContentAndSnapshots.js builds it.
    const pinned = [];
    const store = new SavedRemotePinningContentStore({
        settingsStore,
        createPinningProvider: (options) => ({
            put: async (text) => { pinned.push({ options, text }); return { cid: 'bafyPINNED' + computeContentHash(text).slice(0, 8) }; }
        })
    });
    const { createExternalSnapshotPlacementUseCase: remoteUseCase } = new CreateSnapshotPlacementOrchestratorUseCase().execute({ ...shared, stores: [store] });
    const remotePinning = { isConfigured: () => store.isConfigured(), create: (id) => remoteUseCase.execute(id, store.storage) };
    const { coordinator } = new CreatePreferredSnapshotPlacementCreationCoordinatorUseCase().execute({
        snapshotPlacementCreationCoordinator: creationCoordinator, contentRegistry: storeRegistry, preferenceStore, remotePinning
    });
    return { publicationCatalog, publicationResolver, identityProvider, placementCatalog, preferenceStore, coordinator, pinned };
}

const center = makeCenter();
center.preferenceStore.save(new RoleProviderPreference({ role: RoleProviderRole.CONTENT, providerKey: 'remote-pinning' }));
assert(center.coordinator.preferableStorageTypes().includes('remote-pinning'), 'IPFS (Remote Pinning) can be the preferred storage');
const publication = await center.publicationResolver.publish({ content: { bricks: [1, 2, 3] }, contentKind: 'forkbuild.structure', identityProvider: center.identityProvider });
center.publicationCatalog.add(publication);

const created = await center.coordinator.create(publication.id);
assert(created.outcome === SnapshotPlacementCreationOutcome.CREATED, `the saved preference places through the saved service (got ${created.outcome}: ${created.reason})`);
assert(created.placement.storage === 'ipfs' && created.placement.locator.startsWith('ipfs://bafyPINNED'), 'as an ordinary IPFS placement');
const call = center.pinned[0].options;
assert(call.endpoint === 'https://api.example/pin' && call.cidField === 'IpfsHash' && call.credential === 'visit-token' && !('fileFieldName' in call),
    "with the saved endpoint and fields and this visit's token");
console.log('✓ a saved IPFS (Remote Pinning) preference places through the saved service');

settingsStore.clear();
const notSetUp = await center.coordinator.create(publication.id);
assert(notSetUp.outcome === RoleProviderResolutionStatus.PROVIDER_NOT_FOUND && notSetUp.remotePinningNotSetUp && center.pinned.length === 1,
    'with no service saved it uploads nothing and says so');
const view = describeCreationAttempt({ creating: false, ...notSetUp, error: null });
assert(view.state === SnapshotPlacementCreationUiState.PROVIDER_NOT_FOUND
    && displayText(view.message) === 'No remote pinning service is set up. Set one up under Network Settings → Content Provider.',
    'in words that say where to set one up');
console.log('✓ with no service saved, the preference says where to set one up');
