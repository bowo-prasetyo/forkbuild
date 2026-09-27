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

function makeDevice(label, network) {
    const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
    identityProvider.login(label);
    const discovery = new DiscoveryBootstrap({
        bootstrapProviders: [new RendezvousDiscoveryProvider({ transport: network, identityProvider })]
    });
    const sessions = new PeerSessionManager({ identityProvider, discoveryProvider: discovery, answerPollIntervalMs: 50 });
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

console.log('\n✅ All RendezvousAnswerMailbox tests passed.');
