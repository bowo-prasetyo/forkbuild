import { Publication } from '../publisher/Publication.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectToPeerUseCase } from '../application/peer/ConnectToPeerUseCase.js';
import { PeerContentExchange } from '../application/peer/PeerContentExchange.js';
import { LocalPublicationCatalog } from '../application/publication/LocalPublicationCatalog.js';
import { PublicationExchange } from '../application/publication/PublicationExchange.js';
import { PublicationPeerExchange } from '../application/publication/PublicationPeerExchange.js';
import { PublicationPeerConnectionSync } from '../application/publication/PublicationPeerConnectionSync.js';
import { PublicationResolver } from '../application/publication/PublicationResolver.js';
import { PublicationResolutionCoordinator } from '../application/publication/PublicationResolutionCoordinator.js';
import { CreatePublicationDisplayKindRegistryUseCase } from '../application/publication/CreatePublicationDisplayKindRegistryUseCase.js';
import { PUBLICATION_CONTENT_KIND } from '../application/publication/PublicationContentValidator.js';
import { PublicationSnapshotContentPeerExchange } from '../application/snapshot/materialization/PublicationSnapshotContentPeerExchange.js';
import { StoreSnapshotContentUseCase } from '../application/snapshot/materialization/StoreSnapshotContentUseCase.js';
import { MaterializeSnapshotFromPeerUseCase } from '../application/snapshot/materialization/MaterializeSnapshotFromPeerUseCase.js';
import { PeerSnapshotMaterializationOutcome } from '../application/snapshot/materialization/PeerSnapshotMaterializationOutcome.js';
import { DecentralizedPublicationDiscoveryProvider } from '../discovery/DecentralizedPublicationDiscoveryProvider.js';
import { SharePublicationWithPeersUseCase } from '../application/publication/sharing/SharePublicationWithPeersUseCase.js';
import { RetrieveSharedPublicationUseCase } from '../application/publication/sharing/RetrieveSharedPublicationUseCase.js';
import { AutoRetrieveSharedPublicationsUseCase } from '../application/publication/sharing/AutoRetrieveSharedPublicationsUseCase.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// "Share with Peers": a World published on one device reaches another
// device's Repository over the peer connection, with its snapshot, so it can
// be explored. Real identities, signatures, catalogs and exchanges over the
// in-process peer network.

const wait = (ms = 30) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition, message, timeoutMs = 5000) {
    const started = Date.now();
    while (!(await condition())) {
        if (Date.now() - started > timeoutMs) throw new Error(`ASSERT FAILED: ${message} (timed out)`);
        await wait(20);
    }
}

async function rejects(promise, pattern, message) {
    try {
        await promise;
    } catch (err) {
        assert(pattern.test(err.message), `${message} (got "${err.message}")`);
        return;
    }
    throw new Error(`ASSERT FAILED: ${message} (it did not throw)`);
}

// One device: an identity and everything the sharing path touches, wired
// as ui/main.js wires it.
function makeDevice(label, network, { trusted = () => false } = {}) {
    const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
    identityProvider.login(label);
    const connect = new ConnectToPeerUseCase({ peerConnectionProvider: new LocalPeerConnectionProvider(label, network), identityProvider });
    const stopListening = connect.listen();
    const registry = connect.registry;
    const bus = new PeerMessageBus();
    const verifier = new LocalAuthorizationVerifier();
    const contentStore = new LocalContentStore(new InMemoryStorageProvider());
    const catalog = new LocalPublicationCatalog(new InMemoryStorageProvider());
    const peerExchange = new PublicationPeerExchange(new PublicationExchange(catalog, verifier), bus, registry);
    const sync = new PublicationPeerConnectionSync(catalog, peerExchange, registry);
    const resolver = new PublicationResolver(contentStore, verifier);
    const contentExchange = new PeerContentExchange(contentStore, bus, registry, catalog);
    const coordinator = new PublicationResolutionCoordinator(resolver, contentExchange);
    const { publicationKindPlugin } = new CreatePublicationDisplayKindRegistryUseCase().execute();
    const snapshotExchange = new PublicationSnapshotContentPeerExchange(contentStore, bus, registry);
    const materialize = new MaterializeSnapshotFromPeerUseCase(snapshotExchange, new StoreSnapshotContentUseCase(contentStore), catalog, { timeoutMs: 1000 });
    const repository = new DecentralizedPublicationDiscoveryProvider();
    const share = new SharePublicationWithPeersUseCase({ publicationResolver: resolver, publicationCatalog: catalog, publicationPeerExchange: peerExchange, identityProvider, publicationKindPlugin });
    const retrieve = new RetrieveSharedPublicationUseCase({
        publicationCatalog: catalog,
        resolutionCoordinator: coordinator,
        publicationKindPlugin,
        discoveryProvider: repository,
        contentStore,
        materializeSnapshotFromPeer: materialize,
        connectedPeerRegistry: registry,
        identityProvider,
        timeoutMs: 1000
    });
    const auto = new AutoRetrieveSharedPublicationsUseCase({
        retrieveSharedPublicationUseCase: retrieve,
        publicationPeerExchange: peerExchange,
        connectedPeerRegistry: registry,
        publicationKindPlugin,
        isTrustedSharer: trusted
    });
    return {
        label, identityProvider, connect, registry, contentStore, catalog, peerExchange, repository, share, retrieve, auto,
        id: identityProvider.getSigningIdentity().id,
        dispose() { auto.dispose(); sync.dispose(); stopListening(); }
    };
}

// A World published on `device`: snapshot bytes in its content store and a
// Publication signed by its identity, as LocalPublisherProvider makes one.
async function publishWorld(device, title) {
    const snapshot = JSON.stringify({ schemaVersion: 2, world: { name: title, bricks: [] } });
    const contentReference = await device.contentStore.put(snapshot);
    const signing = device.identityProvider.getSigningIdentity();
    const unsigned = new Publication({
        documentId: `doc-${title}`,
        title,
        author: device.label,
        contentHash: contentReference.hash,
        contentReference,
        publisherIdentity: signing.toJSON()
    });
    return unsigned.withSignature(device.identityProvider.signCanonical(unsigned.getSigningDescriptor()));
}

function linkTo(from, to) {
    return from.connect.connect({ candidateEndpoint: to.label });
}

function authenticated(peer) {
    return peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED;
}

// Sharing: only your own signed World, idempotent, and announced to peers.
{
    const network = new LocalPeerNetwork();
    const chrome = makeDevice('share-chrome', network);
    const edge = makeDevice('share-edge', network);
    const world = await publishWorld(chrome, 'Stair in Half');
    const someoneElses = await publishWorld(edge, 'Not Yours');

    assert(chrome.share.canShare(world) && !chrome.share.isShared(world), 'Chrome can share its own World, not shared yet');
    assert(!chrome.share.canShare(someoneElses), 'but not a World someone else published');
    await rejects(chrome.share.share(someoneElses), /only your own/, 'sharing someone else\'s World is refused');

    const first = await chrome.share.share(world);
    assert(first.announcedTo === 0 && !first.alreadyShared && chrome.share.isShared(world), 'sharing with nobody connected still shares it');
    assert(chrome.catalog.findByContentKind(PUBLICATION_CONTENT_KIND).length === 1, 'one envelope is cataloged');
    const again = await chrome.share.share(world);
    assert(again.alreadyShared && again.envelope.id === first.envelope.id && chrome.catalog.list().length === 1, 'sharing again reuses the same envelope');

    const peer = linkTo(edge, chrome);
    await waitFor(() => authenticated(peer), 'Edge connects to Chrome');
    await waitFor(() => edge.catalog.get(first.envelope.id) !== null, 'the share reaches a peer that connects later');
    const [pending] = edge.retrieve.listPending();
    assert(pending && pending.envelopeId === first.envelope.id && pending.sharerId === chrome.id && pending.sharerConnected,
        'Edge lists it as shared with it, from Chrome, who is connected');
    assert(edge.repository.list().length === 0, 'an untrusted share is not retrieved on its own');
    console.log('✓ only your own World can be shared; a share reaches peers, including later ones');

    // Manual retrieval by a stranger.
    const { publication, snapshot } = await edge.retrieve.retrieve(first.envelope.id);
    assert(publication.id === world.id && publication.title === 'Stair in Half' && edge.repository.findById(world.id), 'Retrieve adds the World to Edge\'s Repository');
    assert(snapshot === PeerSnapshotMaterializationOutcome.STORED && edge.contentStore.has(world.contentReference), '...with its snapshot, so it can be explored');
    assert(edge.retrieve.isRetrieved(first.envelope.id) && edge.retrieve.listPending().length === 0, 'and it is no longer pending');
    const repeat = await edge.retrieve.retrieve(first.envelope.id);
    assert(repeat.snapshot === PeerSnapshotMaterializationOutcome.ALREADY_AVAILABLE && edge.repository.list().length === 1, 'retrieving again adds nothing twice');
    console.log('✓ a stranger retrieves a shared World by hand, with its snapshot');

    chrome.dispose();
    edge.dispose();
}

// Friends and Known Peers: retrieved automatically, as soon as the share
// arrives or the sharer reconnects; a blocked or untrusted sharer never is.
{
    const network = new LocalPeerNetwork();
    const chrome = makeDevice('auto-chrome', network);
    let edgeTrusts = new Set();
    const edge = makeDevice('auto-edge', network, { trusted: (id) => edgeTrusts.has(id) });
    edgeTrusts = new Set([chrome.id]);
    const retrieved = [];
    edge.auto.onRetrieved((event) => retrieved.push(event));

    const peer = linkTo(edge, chrome);
    await waitFor(() => authenticated(peer), 'Edge connects to its friend Chrome');
    const world = await publishWorld(chrome, 'Friendly Tower');
    await chrome.share.share(world);
    await waitFor(() => edge.repository.findById(world.id) && edge.contentStore.has(world.contentReference),
        'a friend\'s share is retrieved automatically, with its snapshot');
    assert(retrieved.length === 1 && retrieved[0].publication.id === world.id, 'and the retrieval is reported so a view can refresh');
    console.log('✓ a trusted sharer\'s World is retrieved automatically when it arrives');

    // Shared while Edge was away: retrieved when Chrome is back.
    peer.close();
    await wait(50);
    const later = await publishWorld(chrome, 'Shared While Away');
    await chrome.share.share(later);
    const again = linkTo(edge, chrome);
    await waitFor(() => authenticated(again), 'Edge reconnects');
    await waitFor(() => edge.repository.findById(later.id) && edge.contentStore.has(later.contentReference),
        'a share made while Edge was away is retrieved on reconnection');
    console.log('✓ a share made while disconnected is retrieved when the sharer reconnects');

    // No longer trusted (blocked): nothing is fetched.
    edgeTrusts = new Set();
    const ignored = await publishWorld(chrome, 'After The Block');
    await chrome.share.share(ignored);
    await waitFor(() => edge.retrieve.listPending().some((p) => p.sharerId === chrome.id), 'the share still arrives');
    await wait(200);
    assert(!edge.repository.findById(ignored.id) && !edge.contentStore.has(ignored.contentReference), 'an untrusted or blocked sharer\'s World is never fetched on its own');
    console.log('✓ nobody else\'s share is fetched automatically');

    chrome.dispose();
    edge.dispose();
}

// Retrieval refuses an absent sharer, and a share whose World is not the
// sharer's own; nothing is added either way.
{
    const network = new LocalPeerNetwork();
    const chrome = makeDevice('guard-chrome', network);
    const mallory = makeDevice('guard-mallory', network);
    const edge = makeDevice('guard-edge', network);
    const world = await publishWorld(chrome, 'Original');
    const { envelope } = await chrome.share.share(world);

    // Mallory relays Chrome's genuine share to Edge; Chrome is not connected.
    const malloryToChrome = linkTo(mallory, chrome);
    await waitFor(() => authenticated(malloryToChrome), 'Mallory connects to Chrome');
    await waitFor(() => mallory.catalog.get(envelope.id) !== null, 'Mallory receives Chrome\'s share');
    const edgeToMallory = linkTo(edge, mallory);
    await waitFor(() => authenticated(edgeToMallory), 'Edge connects to Mallory');
    await waitFor(() => edge.catalog.get(envelope.id) !== null, 'Mallory relays the share to Edge');
    assert(!edge.retrieve.listPending()[0].sharerConnected, 'Edge sees that the sharer is not connected');
    await rejects(edge.retrieve.retrieve(envelope.id), /not connected/, 'bytes are never fetched from anyone but the sharer');
    assert(edge.repository.list().length === 0 && !edge.contentStore.has(world.contentReference), 'nothing was added');

    // Mallory, connected to Chrome, retrieves the World legitimately, then
    // shares Chrome's Publication under her own signature.
    const { publication: copy } = await mallory.retrieve.retrieve(envelope.id);
    assert(copy.id === world.id, 'Mallory, connected to Chrome, can retrieve it');
    assert(!mallory.share.canShare(copy), 'her own device will not offer to share a World she did not publish');
    const resolver = new PublicationResolver(mallory.contentStore, new LocalAuthorizationVerifier());
    const forged = await resolver.publish({ content: world, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: mallory.identityProvider });
    mallory.catalog.add(forged);
    mallory.peerExchange.announce(forged);
    await waitFor(() => edge.catalog.get(forged.id) !== null, 'Mallory\'s re-signed share reaches Edge');
    await rejects(edge.retrieve.retrieve(forged.id), /not signed by the person who shared it/, 'a World shared by someone other than its publisher is refused');
    assert(edge.repository.list().length === 0, 'and not added');
    console.log('✓ bytes come only from the sharer, and only the publisher\'s own World is accepted');

    chrome.dispose();
    mallory.dispose();
    edge.dispose();
}

console.log('\n✅ All SharePublicationWithPeers tests passed.');
