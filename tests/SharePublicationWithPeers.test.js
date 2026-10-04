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
import { DecentralizedPublication, MAX_CONTENT_TITLE_LENGTH, normalizeContentTitle } from '../core/DecentralizedPublication.js';
import { validateDecentralizedPublication } from '../application/publication/DecentralizedPublicationValidator.js';
import { SharePublicationWithPeersUseCase, LEGACY_CONTENT_HASH } from '../application/publication/sharing/SharePublicationWithPeersUseCase.js';
import { RetrieveSharedPublicationUseCase, SHARE_UNAVAILABLE } from '../application/publication/sharing/RetrieveSharedPublicationUseCase.js';
import { AutoRetrieveSharedPublicationsUseCase } from '../application/publication/sharing/AutoRetrieveSharedPublicationsUseCase.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { StorageEntryNotLoadedError } from '../storage/StorageEntryNotLoadedError.js';
import { ContentReference } from '../core/ContentReference.js';
import { computeFnv1a32 } from '../serializer/contentHash.js';
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
    assert(first.envelope.contentTitle === 'Stair in Half' && pending.title === 'Stair in Half',
        'the share carries the World\'s title, so Edge can tell what it is before retrieving it');
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

// The title in a share: canonical, signed, and checked on retrieval.
{
    assert(normalizeContentTitle('  Stair \n in\tHalf  ') === 'Stair in Half', 'whitespace runs collapse to one space');
    assert(normalizeContentTitle('Evil\u202eflipped') === 'Evil flipped' && normalizeContentTitle('a\u0000b') === 'a b',
        'control characters and bidirectional overrides are removed');
    assert(normalizeContentTitle('x'.repeat(500)).length === MAX_CONTENT_TITLE_LENGTH, 'a title is capped');
    assert(normalizeContentTitle('   ') === null && normalizeContentTitle(42) === null, 'nothing displayable means no title');

    const network = new LocalPeerNetwork();
    const chrome = makeDevice('title-chrome', network);
    const world = await publishWorld(chrome, 'Titled Tower');
    const { envelope } = await chrome.share.share(world);
    const record = envelope.toJSON();
    const verifier = new LocalAuthorizationVerifier();
    assert(verifier.verifyDecentralizedPublication(record).valid, 'a titled share verifies');
    assert(!verifier.verifyDecentralizedPublication({ ...record, contentTitle: 'Something Else' }).valid, 'a changed title breaks the signature');
    const { contentTitle: _dropped, ...stripped } = record;
    assert(!verifier.verifyDecentralizedPublication(stripped).valid, 'so does a removed one');
    validateDecentralizedPublication(record);
    for (const bad of ['', '  padded ', 'two\nlines', 'x'.repeat(MAX_CONTENT_TITLE_LENGTH + 1), 7]) {
        let refused = false;
        try {
            validateDecentralizedPublication({ ...record, contentTitle: bad });
        } catch {
            refused = true;
        }
        assert(refused, `a title that is not canonical is refused (${JSON.stringify(bad).slice(0, 20)})`);
    }
    const untitled = await new PublicationResolver(chrome.contentStore, verifier).publish({
        content: world, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: chrome.identityProvider
    });
    assert(!('contentTitle' in untitled.toJSON()) && verifier.verifyDecentralizedPublication(untitled.toJSON()).valid
        && DecentralizedPublication.fromJSON(untitled.toJSON()).contentTitle === null,
        'an envelope without a title, as before titles existed, still verifies');
    console.log('✓ a share\'s title is canonical and covered by the sharer\'s signature');
    chrome.dispose();
}

// A share from before titles: listed untitled, and replaced by a titled one
// when shared again, as one entry.
{
    const network = new LocalPeerNetwork();
    const chrome = makeDevice('legacy-chrome', network);
    const edge = makeDevice('legacy-edge', network);
    const world = await publishWorld(chrome, 'Old Share');
    const resolver = new PublicationResolver(chrome.contentStore, new LocalAuthorizationVerifier());
    const legacy = await resolver.publish({ content: world, contentKind: PUBLICATION_CONTENT_KIND, identityProvider: chrome.identityProvider });
    chrome.catalog.add(legacy);
    assert(chrome.share.isShared(world), 'the untitled envelope counts as shared');

    const peer = linkTo(edge, chrome);
    await waitFor(() => authenticated(peer), 'Edge connects to Chrome');
    await waitFor(() => edge.catalog.get(legacy.id) !== null, 'the untitled share arrives');
    await wait(50);
    let pending = edge.retrieve.listPending();
    assert(pending.length === 1 && pending[0].title === null, 'it is listed without a title, as before');

    const again = await chrome.share.share(world);
    assert(!again.alreadyShared && again.envelope.id !== legacy.id && again.envelope.contentTitle === 'Old Share',
        'sharing it again makes a titled envelope');
    assert((await chrome.share.share(world)).envelope.id === again.envelope.id, 'which is reused from then on');
    await waitFor(() => edge.catalog.get(again.envelope.id) !== null, 'the titled share arrives');
    pending = edge.retrieve.listPending();
    assert(pending.length === 1 && pending[0].envelopeId === again.envelope.id && pending[0].title === 'Old Share',
        'Edge lists the World once, by its title');
    await edge.retrieve.retrieve(pending[0].envelopeId);
    assert(edge.retrieve.listPending().length === 0 && edge.retrieve.isRetrieved(legacy.id), 'retrieving it settles both envelopes');
    console.log('✓ a World shared before titles is shared again with one, and listed once');

    chrome.dispose();
    edge.dispose();
}

// A sharer who signs a title that is not the World's own: refused on
// retrieval, nothing added.
{
    const network = new LocalPeerNetwork();
    const chrome = makeDevice('lie-chrome', network);
    const edge = makeDevice('lie-edge', network);
    const world = await publishWorld(chrome, 'Actual Name');
    const resolver = new PublicationResolver(chrome.contentStore, new LocalAuthorizationVerifier());
    const lying = await resolver.publish({
        content: world, contentKind: PUBLICATION_CONTENT_KIND, contentTitle: 'Free Prize Inside', identityProvider: chrome.identityProvider
    });
    chrome.catalog.add(lying);

    const peer = linkTo(edge, chrome);
    await waitFor(() => authenticated(peer), 'Edge connects to Chrome');
    await waitFor(() => edge.catalog.get(lying.id) !== null, 'the share arrives');
    assert(edge.retrieve.listPending()[0].title === 'Free Prize Inside', 'it is listed by the title it was signed with');
    await rejects(edge.retrieve.retrieve(lying.id), /not the one its title announced/, 'retrieving a World under someone else\'s title is refused');
    assert(edge.repository.list().length === 0 && !edge.contentStore.has(world.contentReference), 'and nothing is added');
    console.log('✓ a share whose title is not its World\'s is refused on retrieval');

    chrome.dispose();
    edge.dispose();
}

// Content kept on disk and not yet loaded (IndexedDB after a reload): reading
// it synchronously throws, and the pending list must still be answered.
{
    const network = new LocalPeerNetwork();
    const chrome = makeDevice('cold-chrome', network);
    const edge = makeDevice('cold-edge', network);
    const retrieved = await publishWorld(chrome, 'Already Here');
    const waiting = await publishWorld(chrome, 'Still Waiting');
    const peer = linkTo(edge, chrome);
    await waitFor(() => authenticated(peer), 'Edge connects to Chrome');
    const done = await chrome.share.share(retrieved);
    const open = await chrome.share.share(waiting);
    await waitFor(() => edge.catalog.get(done.envelope.id) && edge.catalog.get(open.envelope.id), 'both shares arrive');
    await edge.retrieve.retrieve(done.envelope.id);

    edge.contentStore.getSync = (reference) => { throw new StorageEntryNotLoadedError(`content:${reference.hash}`); };
    assert(edge.retrieve.isRetrieved(done.envelope.id), 'a retrieved World is still known as retrieved while its content is on disk');
    const pending = edge.retrieve.listPending();
    assert(pending.length === 1 && pending[0].envelopeId === open.envelope.id, 'and only the World not retrieved yet is pending');
    console.log('✓ the pending list is answered while shared content is on disk and not loaded');

    chrome.dispose();
    edge.dispose();
}

// A sharer that no longer holds the snapshot: the Publication is added, the
// snapshot is reported unavailable, and the share stays pending.
{
    const network = new LocalPeerNetwork();
    const chrome = makeDevice('nosnap-chrome', network);
    const edge = makeDevice('nosnap-edge', network);
    const world = await publishWorld(chrome, 'Snapshot Gone');
    chrome.contentStore._storageProvider.remove(`content:${world.contentReference.hash}`);
    const peer = linkTo(edge, chrome);
    await waitFor(() => authenticated(peer), 'Edge connects to Chrome');
    const { envelope } = await chrome.share.share(world);
    await waitFor(() => edge.catalog.get(envelope.id) !== null, 'the share arrives');
    const { publication, snapshot } = await edge.retrieve.retrieve(envelope.id);
    assert(publication.id === world.id && snapshot === PeerSnapshotMaterializationOutcome.UNAVAILABLE,
        'Retrieve resolves with the snapshot reported unavailable, for the panel to say so');
    assert(edge.retrieve.listPending().length === 1, 'and the share stays pending, to retry');
    console.log('✓ a snapshot that does not arrive is reported, and the share stays pending');

    chrome.dispose();
    edge.dispose();
}

// A World published before content hashes became SHA-256: its FNV-1a hash
// can't vouch for a peer's bytes, so it is neither shared nor retrieved.
{
    const network = new LocalPeerNetwork();
    const chrome = makeDevice('legacy-chrome', network);
    const edge = makeDevice('legacy-edge', network);
    const snapshot = JSON.stringify({ schemaVersion: 2, world: { name: 'Old World', bricks: [] } });
    const hash = computeFnv1a32(snapshot);
    chrome.contentStore._storageProvider.save(`content:${hash}`, snapshot);
    const signing = chrome.identityProvider.getSigningIdentity();
    const unsigned = new Publication({
        documentId: 'doc-old', title: 'Old World', author: chrome.label, contentHash: hash,
        contentReference: new ContentReference({ hash, algorithm: 'fnv1a-32' }), publisherIdentity: signing.toJSON()
    });
    const world = unsigned.withSignature(chrome.identityProvider.signCanonical(unsigned.getSigningDescriptor()));

    let shareError = null;
    try { await chrome.share.share(world); } catch (e) { shareError = e; }
    assert(shareError && shareError.code === LEGACY_CONTENT_HASH && chrome.catalog.list().length === 0,
        'sharing a World with a legacy content hash is refused, with a code the view explains');

    // One shared anyway, by a device from before this check.
    const resolver = new PublicationResolver(chrome.contentStore, new LocalAuthorizationVerifier());
    const envelope = await resolver.publish({
        content: world, contentKind: PUBLICATION_CONTENT_KIND, contentTitle: 'Old World', identityProvider: chrome.identityProvider
    });
    chrome.catalog.add(envelope);
    const peer = linkTo(edge, chrome);
    await waitFor(() => authenticated(peer), 'Edge connects to Chrome');
    await waitFor(() => edge.catalog.get(envelope.id) !== null, 'the share arrives');
    let retrieveError = null;
    try { await edge.retrieve.retrieve(envelope.id); } catch (e) { retrieveError = e; }
    assert(retrieveError && retrieveError.code === LEGACY_CONTENT_HASH, 'retrieving it is refused with the same code');
    assert(edge.repository.list().length === 0 && !edge.contentStore.has(world.contentReference), 'and nothing is added');
    console.log('✓ a World with a legacy content hash is neither shared nor retrieved');

    chrome.dispose();
    edge.dispose();
}

// A share made before content hashes became SHA-256 (its own content hash is
// FNV-1a): flagged in the pending list and refused without asking anyone.
{
    const network = new LocalPeerNetwork();
    const chrome = makeDevice('oldshare-chrome', network);
    const edge = makeDevice('oldshare-edge', network);
    const world = await publishWorld(chrome, 'Old Hash Share');
    const bytes = JSON.stringify(world.toJSON());
    const hash = computeFnv1a32(bytes);
    chrome.contentStore._storageProvider.save(`content:${hash}`, bytes);
    let envelope = new DecentralizedPublication({
        contentKind: PUBLICATION_CONTENT_KIND,
        contentSchemaVersion: 1,
        contentReference: new ContentReference({ hash, algorithm: 'fnv1a-32' }),
        publisherIdentity: chrome.identityProvider.getSigningIdentity().toJSON()
    });
    envelope = envelope.withSignature(chrome.identityProvider.signCanonical(envelope.getSigningDescriptor()));
    chrome.catalog.add(envelope);

    const peer = linkTo(edge, chrome);
    await waitFor(() => authenticated(peer), 'Edge connects to Chrome');
    await waitFor(() => edge.catalog.get(envelope.id) !== null, 'the old share arrives');
    const [pending] = edge.retrieve.listPending();
    assert(pending && pending.envelopeId === envelope.id && pending.legacy, 'it is listed as a share that can\'t be retrieved');
    let error = null;
    try { await edge.retrieve.retrieve(envelope.id); } catch (e) { error = e; }
    assert(error && error.code === LEGACY_CONTENT_HASH && edge.repository.list().length === 0, 'retrieving it is refused, adding nothing');
    console.log('✓ a share made with a legacy content hash is flagged and refused');

    chrome.dispose();
    edge.dispose();
}

// A sharer whose device no longer holds the shared Publication: refused with
// a code the view explains, not the resolver's internal reason.
{
    const network = new LocalPeerNetwork();
    const chrome = makeDevice('gone-chrome', network);
    const edge = makeDevice('gone-edge', network);
    const world = await publishWorld(chrome, 'Gone Away');
    const peer = linkTo(edge, chrome);
    await waitFor(() => authenticated(peer), 'Edge connects to Chrome');
    const { envelope } = await chrome.share.share(world);
    await waitFor(() => edge.catalog.get(envelope.id) !== null, 'the share arrives');
    chrome.contentStore._storageProvider.remove(`content:${envelope.contentReference.hash}`);
    assert(!edge.retrieve.listPending()[0].legacy, 'a SHA-256 share is not flagged');
    let error = null;
    try { await edge.retrieve.retrieve(envelope.id); } catch (e) { error = e; }
    assert(error && error.code === SHARE_UNAVAILABLE && edge.repository.list().length === 0, 'retrieving it is refused as not sent, adding nothing');
    console.log('✓ a share its sharer no longer holds is reported as not sent');

    chrome.dispose();
    edge.dispose();
}

console.log('\n✅ All SharePublicationWithPeers tests passed.');
