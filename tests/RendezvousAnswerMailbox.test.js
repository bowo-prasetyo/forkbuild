import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalRendezvousNetwork } from '../peer/LocalRendezvousNetwork.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { DiscoveryBootstrap } from '../peer/DiscoveryBootstrap.js';
import { PeerIdentity } from '../peer/PeerIdentity.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerSessionManager } from '../application/peer/PeerSessionManager.js';
import { FindPeerUseCase } from '../application/peer/FindPeerUseCase.js';
import { PeerRelationshipUseCase } from '../application/peer/PeerRelationshipUseCase.js';
import { AutoConnectKnownPeersUseCase } from '../application/peer/AutoConnectKnownPeersUseCase.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// Connecting through rendezvous with nothing copied by hand: the finder's
// PeerSessionManager leaves its WebRTC answer in the rendezvous mailbox, and
// the publisher's PeerSessionManager collects it and completes the
// connection. Real identities, real WebRTC (node-datachannel), and the app's
// own discovery stack over an in-memory rendezvous network.

function makeDevice(label, network, { answerPollIntervalMs = 50, answerWatchIntervalMs = 50 } = {}) {
    const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
    identityProvider.login(label);
    const discovery = new DiscoveryBootstrap({
        bootstrapProviders: [new RendezvousDiscoveryProvider({ transport: network, identityProvider })]
    });
    const sessions = new PeerSessionManager({ identityProvider, discoveryProvider: discovery, answerPollIntervalMs, answerWatchIntervalMs });
    return { identityProvider, sessions, id: identityProvider.getSigningIdentity().id };
}

function authenticatedTo(sessions, identityId) {
    return sessions.listPeers().find((peer) => peer.remoteIdentity
        && peer.remoteIdentity.identityId === identityId
        && peer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED);
}

async function waitFor(condition, message, timeoutMs = 15000) {
    const started = Date.now();
    while (!condition()) {
        if (Date.now() - started > timeoutMs) throw new Error(`ASSERT FAILED: ${message} (timed out)`);
        await new Promise((resolve) => setTimeout(resolve, 50));
    }
}

// Find Someone: Bob connects to Alice's publication and the reply travels
// through the mailbox.
{
    const network = new LocalRendezvousNetwork();
    const alice = makeDevice('mailbox-alice', network);
    const bob = makeDevice('mailbox-bob', network);

    assert(await alice.sessions.publishSelf(), 'Alice publishes herself');
    assert(alice.sessions.isPublishing(), '...and is waiting for someone');

    const bobFind = new FindPeerUseCase({ peerSessionManager: bob.sessions });
    const [candidate] = await bobFind.search(alice.id);
    assert(candidate, 'Bob finds Alice\'s candidate');
    const { delivered } = await bobFind.connect(candidate, alice.id);
    assert(delivered === true, 'Bob\'s reply is delivered through the rendezvous mailbox');

    await waitFor(() => authenticatedTo(alice.sessions, bob.id) && authenticatedTo(bob.sessions, alice.id),
        'both sides authenticate without anything copied by hand');
    assert(!alice.sessions.isPublishing(), 'Alice\'s publication is spent once answered');
    assert((await network.lookup(alice.id)).length === 0, 'and the network offers nobody else the spent publication');
    console.log('✓ Find Someone completes through the answer mailbox');

    alice.sessions.dispose();
    bob.sessions.dispose();
}

// Known Peers connect automatically, end to end.
{
    const network = new LocalRendezvousNetwork();
    const alice = makeDevice('mailbox-auto-alice', network);
    const bob = makeDevice('mailbox-auto-bob', network);
    await bob.sessions.publishSelf();

    const relationships = new PeerRelationshipUseCase(new InMemoryStorageProvider(), alice.identityProvider);
    const bobSigning = bob.identityProvider.getSigningIdentity();
    relationships.rememberPeer(new PeerIdentity({ identityId: bob.id, publicKey: bobSigning.publicKey, algorithm: bobSigning.algorithm }));
    const autoConnect = new AutoConnectKnownPeersUseCase({
        findPeerUseCase: new FindPeerUseCase({ peerSessionManager: alice.sessions }),
        peerRelationshipUseCase: relationships,
        connectedPeerRegistry: alice.sessions.registry
    });

    await waitFor(() => authenticatedTo(alice.sessions, bob.id) && authenticatedTo(bob.sessions, alice.id),
        'Alice\'s automatic connection to her Known Peer completes on both sides');
    console.log('✓ an automatic Known Peer connection completes through the answer mailbox');

    autoConnect.dispose();
    alice.sessions.dispose();
    bob.sessions.dispose();
}

// Without a mailbox, or when the finder cannot sign, the reply falls back
// to being handed over by hand.
{
    const network = new LocalRendezvousNetwork();
    const alice = makeDevice('mailbox-fallback-alice', network);
    await alice.sessions.publishSelf();

    const carolIdentity = new LocalIdentityProvider(new InMemoryStorageProvider());
    const created = await carolIdentity.createProtectedLocalIdentity('carol', 'correct horse battery');
    await carolIdentity.unlock(created.identityId, 'correct horse battery');
    carolIdentity.authenticate(created.identityId);
    const carolDiscovery = new DiscoveryBootstrap({
        bootstrapProviders: [new RendezvousDiscoveryProvider({ transport: network, identityProvider: carolIdentity })]
    });
    const carolSessions = new PeerSessionManager({ identityProvider: carolIdentity, discoveryProvider: carolDiscovery });
    const [candidate] = await carolDiscovery.discover(alice.id);
    carolIdentity.lock(created.identityId);
    const { reply, delivered } = await carolSessions.connectToDiscovered(candidate);
    assert(delivered === false && typeof reply === 'string' && reply.length > 0,
        'a locked identity cannot sign an answer, so the reply is returned to hand over');
    assert(alice.sessions.isPublishing(), 'Alice\'s publication is still waiting');
    console.log('✓ the reply falls back to being handed over when the mailbox cannot be used');

    alice.sessions.dispose();
    carolSessions.dispose();
}

// The answer is pushed: with every check an hour apart, only the push can
// complete the connection promptly, and Alice checks the mailbox once.
{
    const network = new LocalRendezvousNetwork();
    const fetches = [];
    const fetchAnswer = network.fetchAnswer.bind(network);
    network.fetchAnswer = (request) => { fetches.push(request); return fetchAnswer(request); };
    const hourly = { answerPollIntervalMs: 60 * 60 * 1000, answerWatchIntervalMs: 60 * 60 * 1000 };
    const alice = makeDevice('mailbox-push-alice', network, hourly);
    const bob = makeDevice('mailbox-push-bob', network, hourly);

    await alice.sessions.publishSelf();
    await waitFor(() => fetches.length === 1, 'Alice registers her watch straight away');
    assert(fetches[0].watch === true && fetches[0].identityId === alice.id, 'the first check asks the network to push');
    const bobFind = new FindPeerUseCase({ peerSessionManager: bob.sessions });
    const [candidate] = await bobFind.search(alice.id);
    await bobFind.connect(candidate, alice.id);
    await waitFor(() => authenticatedTo(alice.sessions, bob.id) && authenticatedTo(bob.sessions, alice.id),
        'the pushed answer completes the connection', 10000);
    assert(fetches.length === 1, 'no further check was needed');
    console.log('✓ a pushed answer completes the connection without polling');

    alice.sessions.dispose();
    bob.sessions.dispose();
}

// A network that never pushes (a server from before pushes) is still
// checked at the frequent rate, never the slow one.
{
    const network = new LocalRendezvousNetwork();
    const fetchAnswer = network.fetchAnswer.bind(network);
    network.fetchAnswer = ({ watch, ...rest }) => fetchAnswer(rest);
    network.onAnswerPushed = () => () => {};
    const settings = { answerPollIntervalMs: 50, answerWatchIntervalMs: 60 * 60 * 1000 };
    const alice = makeDevice('mailbox-nopush-alice', network, settings);
    const bob = makeDevice('mailbox-nopush-bob', network, settings);
    await alice.sessions.publishSelf();
    const bobFind = new FindPeerUseCase({ peerSessionManager: bob.sessions });
    const [candidate] = await bobFind.search(alice.id);
    await bobFind.connect(candidate, alice.id);
    await waitFor(() => authenticatedTo(alice.sessions, bob.id) && authenticatedTo(bob.sessions, alice.id),
        'polling completes the connection when no server pushes', 10000);
    console.log('✓ without pushes, the mailbox is still polled frequently');

    alice.sessions.dispose();
    bob.sessions.dispose();
}

// Two Known Peers, both already running: the one who clicks Be Discoverable
// second connects to the first, and the lobby's own republishing never
// triggers a lookup.
{
    const network = new LocalRendezvousNetwork();
    const alice = makeDevice('mailbox-both-alice', network);
    const bob = makeDevice('mailbox-both-bob', network);
    const lookups = [];
    const lookup = network.lookup.bind(network);
    network.lookup = (identityId) => { lookups.push(identityId); return lookup(identityId); };
    const knowEachOther = (device, other) => {
        const relationships = new PeerRelationshipUseCase(new InMemoryStorageProvider(), device.identityProvider);
        const signing = other.identityProvider.getSigningIdentity();
        relationships.rememberPeer(new PeerIdentity({ identityId: other.id, publicKey: signing.publicKey, algorithm: signing.algorithm }));
        const find = new FindPeerUseCase({ peerSessionManager: device.sessions });
        const auto = new AutoConnectKnownPeersUseCase({ findPeerUseCase: find, peerRelationshipUseCase: relationships, connectedPeerRegistry: device.sessions.registry });
        return { find, auto };
    };
    const aliceSide = knowEachOther(alice, bob);
    const bobSide = knowEachOther(bob, alice);
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert(!authenticatedTo(alice.sessions, bob.id), 'at startup neither is discoverable, so nothing connects');

    const before = lookups.length;
    await alice.sessions.publishSelf();
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert(lookups.length === before, 'publishing directly (as the lobby does) looks nobody up');

    await aliceSide.find.stopPublishing();
    await aliceSide.find.publishSelf();
    await waitFor(() => lookups.filter((id) => id === bob.id).length > 0, 'Alice\'s Be Discoverable looks her Known Peer up once');
    assert(!authenticatedTo(alice.sessions, bob.id), 'Bob is not discoverable yet, so nothing connects');

    await bobSide.find.publishSelf();
    await waitFor(() => authenticatedTo(alice.sessions, bob.id) && authenticatedTo(bob.sessions, alice.id),
        'Bob\'s Be Discoverable finds Alice, and they connect with nothing copied');
    console.log('✓ two Known Peers who both click Be Discoverable connect');

    aliceSide.auto.dispose();
    bobSide.auto.dispose();
    alice.sessions.dispose();
    bob.sessions.dispose();
}

console.log('\n✅ All RendezvousAnswerMailbox tests passed.');
