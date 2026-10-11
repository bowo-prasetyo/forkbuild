import { usePostPublishDistribution } from '../ui/views/editorView/usePostPublishDistribution.js';
import { PublishDestinationStore, normalizePublishDestination } from '../application/settings/PublishDestinationStore.js';
import { normalizeNetworkWriterSettings } from '../core/NetworkWriters.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { mountComponent } from './support/MinimalVueCompositionApiShim.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Distribute folded into Publish (docs/Pillars.md, "one verb, Publish"): a send
// that works with "Send here every time I publish" ticked keeps where it went,
// and each signed publish after that sends there by itself. Until then,
// Publish keeps the build on this device and in its links.

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function publication(id, { signed = true } = {}) {
    return {
        id,
        documentId: `doc-${id}`,
        title: `Build ${id}`,
        signature: signed ? { value: 'sig' } : null,
        contentReference: { hash: `h-${id}` },
        toJSON() { return { id }; }
    };
}

// Fake commands that record what they sent and answer as the networks would.
function networks({ failSnapshot = false } = {}) {
    const sent = [];
    return {
        sent,
        injections: {
            snapshotDistributionCommand: (bytes, storage, publicationId, claimedPosition, discoveryProvider) => {
                sent.push({ kind: 'snapshot', storage, discoveryProvider });
                return failSnapshot
                    ? Promise.reject(new Error('relay refused'))
                    : Promise.resolve({ contentReference: { hash: 'h', uri: 'ar://x', storage }, announcement: { id: 'a1' } });
            },
            multiRelayNostrPublicationDistributionCommand: ({ publication: sentPublication, materialStorage }) => {
                sent.push({ kind: 'claim', publicationId: sentPublication.id, materialStorage });
                return Promise.resolve([{ publication: { objectId: sentPublication.id }, material: { uri: 'ar://y' }, discovery: { id: 'd1' } }]);
            },
            publicationDistributionCommand: ({ publication: sentPublication, discoveryProvider }) => {
                sent.push({ kind: 'claim', publicationId: sentPublication.id, discoveryProvider });
                return Promise.resolve({ publication: { objectId: sentPublication.id }, material: { uri: 'ar://y' }, discovery: { id: 'd1' } });
            },
            publicationContentStore: { get: async () => '{"snapshot":true}' }
        }
    };
}

function mount(injections, options = { rememberDestination: true }) {
    return mountComponent({ setup: () => usePostPublishDistribution({ router: null, ...options }) }, injections);
}

// Nothing kept: Publish sends nothing and says so.
{
    const net = networks();
    const store = new PublishDestinationStore({ storageProvider: new InMemoryStorageProvider() });
    const editor = mount({ ...net.injections, publishDestinationStore: store });
    assert(editor.onDocumentPublished(publication('a')) === undefined, 'with nothing kept, publishing starts no send');
    await flush();
    assert(net.sent.length === 0, 'nothing leaves the device');
    assert(editor.sendStatus.value === 'local', `the notice offers to choose where it goes — got ${editor.sendStatus.value}`);
    console.log('✓ with no destination kept, Publish keeps the build here and offers the choice');
}

// A send that works, with the box ticked, is kept; the next publish sends there by itself.
{
    const net = networks();
    const store = new PublishDestinationStore({ storageProvider: new InMemoryStorageProvider() });
    const editor = mount({ ...net.injections, publishDestinationStore: store });
    editor.onDocumentPublished(publication('a'));
    assert(editor.canRemember.value === true && editor.rememberChoice.value === true, 'the box can be ticked, and starts ticked');
    await editor.distributePublishedDocumentAndSnapshot();
    assert(editor.sendStatus.value === 'sent', `the first send worked — got ${editor.sendStatus.value}`);
    const kept = store.get();
    assert(kept && kept.discoveryProvider === 'nostr' && kept.storage === 'ar', `where it went is kept — got ${JSON.stringify(kept)}`);

    net.sent.length = 0;
    const sending = editor.onDocumentPublished(publication('b'));
    assert(sending && typeof sending.then === 'function', 'the next publish starts a send');
    assert(editor.sendStatus.value === 'sending', `the notice says it is sending — got ${editor.sendStatus.value}`);
    await sending;
    assert(net.sent.length === 2 && net.sent[0].kind === 'snapshot' && net.sent[1].kind === 'claim',
        `the build and its claim go out, the build first — got ${JSON.stringify(net.sent)}`);
    assert(net.sent[0].storage === 'ar' && net.sent[0].discoveryProvider === 'nostr' && net.sent[1].publicationId === 'b',
        'to the kept destination, for the build just published');
    assert(editor.sendStatus.value === 'sent' && editor.sendDestinationName.value === 'Nostr',
        'the notice says it went to Nostr');
    console.log('✓ a working send is kept, and the next Publish sends there by itself');
}

// A failed send keeps the published build, says what went wrong and offers Try again.
{
    const failing = networks({ failSnapshot: true });
    const storage = new InMemoryStorageProvider();
    const store = new PublishDestinationStore({ storageProvider: storage });
    store.save({ discoveryProvider: 'arweave', storage: 'ar' });
    const editor = mount({ ...failing.injections, publishDestinationStore: store });
    await editor.onDocumentPublished(publication('c'));
    assert(editor.sendStatus.value === 'failed', `a failed send is reported — got ${editor.sendStatus.value}`);
    assert(editor.sendError.value && editor.sendDestinationName.value === 'Arweave', 'with its reason and where it was going');
    assert(editor.publishedPublication.value.id === 'c', 'the build stays published');
    assert(store.get().discoveryProvider === 'arweave', 'the kept destination stays as it was');
    console.log('✓ a send that fails leaves the build published and says why');
}

// Unsigned builds, unticking the box, a switched-off network and the authorship
// claim's notice never send on their own.
{
    const net = networks();
    const store = new PublishDestinationStore({ storageProvider: new InMemoryStorageProvider() });
    store.save({ discoveryProvider: 'nostr', storage: 'ar' });
    const editor = mount({ ...net.injections, publishDestinationStore: store });
    assert(editor.onDocumentPublished(publication('u', { signed: false })) === undefined, 'an unsigned build is not sent');

    editor.setRememberChoice(false);
    assert(store.get() === null, 'unticking forgets where it goes at once');
    assert(editor.onDocumentPublished(publication('d')) === undefined, 'and the next publish sends nothing');

    store.save({ discoveryProvider: 'steem', storage: 'steem' });
    const switchedOff = {
        get: () => normalizeNetworkWriterSettings({ steem: false }),
        onChange: () => () => {}
    };
    const steemless = mount({ ...net.injections, publishDestinationStore: store, networkWriterSettingsStore: switchedOff,
        snapshotDistributionAvailableStorageTypes: () => ['ar', 'ipfs', 'steem'] });
    assert(steemless.onDocumentPublished(publication('e')) === undefined, 'a destination whose network was switched off is not used');

    store.save({ discoveryProvider: 'nostr', storage: 'ar' });
    const claimNotice = mount({ ...net.injections, publishDestinationStore: store }, { rememberDestination: false, includeSnapshot: false });
    assert(claimNotice.onDocumentPublished(publication('f')) === undefined, 'the authorship claim\'s notice never sends by itself');
    await flush();
    assert(net.sent.length === 0, `nothing was sent — got ${JSON.stringify(net.sent)}`);
    console.log('✓ unsigned builds, an unticked box, a switched-off network and authorship claims send nothing');
}

// Remote pinning keeps its token only for the visit, so it is never kept.
{
    const net = networks();
    const store = new PublishDestinationStore({ storageProvider: new InMemoryStorageProvider() });
    const editor = mount({ ...net.injections, publishDestinationStore: store,
        ipfsRemotePublicationCoordinator: { publish: async () => ({ state: 'published', contentHash: 'c', locator: 'ipfs://c' }) },
        resolveSnapshotDiscoveryPublisher: () => ({ publish: async () => ({ id: 'n1' }) }) });
    editor.onDocumentPublished(publication('g'));
    editor.selectedDistributionStorage.value = 'remote-pinning';
    assert(editor.canRemember.value === false, 'the box is not offered for remote pinning');
    await editor.distributePublishedDocumentAndSnapshot();
    assert(store.get() === null, 'and nothing is kept');
    console.log('✓ remote pinning is never kept as where Publish sends');
}

// The store reads leniently and keeps only known destinations.
{
    const storage = new InMemoryStorageProvider();
    const store = new PublishDestinationStore({ storageProvider: storage });
    assert(store.get() === null, 'nothing kept reads as null');
    assert(store.save({ discoveryProvider: 'nostr', storage: 'remote-pinning' }) === null && store.get() === null, 'remote pinning is refused');
    assert(store.save({ discoveryProvider: 'myspace', storage: 'ar' }) === null, 'an unknown network is refused');
    storage.save('publish-destination', 'garbage');
    assert(store.get() === null, 'a damaged entry reads as null');
    assert(normalizePublishDestination({ discoveryProvider: 'blurt', storage: 'blurt' }).storage === 'blurt', 'a known destination is kept as given');

    class ThrowingStorage extends StorageProvider {
        load() { throw new Error('not loaded'); }
        remove() { throw new Error('locked'); }
    }
    const throwing = new PublishDestinationStore({ storageProvider: new ThrowingStorage() });
    assert(throwing.get() === null, 'a storage error reads as nothing kept');
    throwing.clear();
    let threw = false;
    try {
        new PublishDestinationStore({ storageProvider: {} });
    } catch {
        threw = true;
    }
    assert(threw, 'a StorageProvider is required');
    console.log('✓ PublishDestinationStore keeps only known destinations and tolerates damage');
}
