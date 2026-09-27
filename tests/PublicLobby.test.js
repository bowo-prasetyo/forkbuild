import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalRendezvousNetwork } from '../peer/LocalRendezvousNetwork.js';
import { RendezvousDiscoveryProvider } from '../peer/RendezvousDiscoveryProvider.js';
import { DiscoveryBootstrap } from '../peer/DiscoveryBootstrap.js';
import { WebRtcPeerConnectionProvider } from '../peer/WebRtcPeerConnectionProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LobbyCard, PUBLIC_LOBBY, worldLobby } from '../core/LobbyCard.js';
import { PeerSessionManager } from '../application/peer/PeerSessionManager.js';
import { FindPeerUseCase } from '../application/peer/FindPeerUseCase.js';
import { PeerBlockUseCase } from '../application/peer/PeerBlockUseCase.js';
import { PublicLobbyUseCase } from '../application/peer/PublicLobbyUseCase.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { assert } from './support/Assert.js';

// The public lobby over real identities, real WebRTC (node-datachannel) and
// the app's own discovery stack, with an in-memory rendezvous network
// standing in for the server (tests/RendezvousWorkerInterop.test.js checks
// the same cards against the real worker).

function makeDevice(label, network, { turnRequests = null } = {}) {
    const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
    identityProvider.login(label);
    const discovery = new DiscoveryBootstrap({
        bootstrapProviders: [new RendezvousDiscoveryProvider({ transport: network, identityProvider })]
    });
    const peerConnectionProvider = new WebRtcPeerConnectionProvider({
        turnIceServers: async () => {
            if (turnRequests) turnRequests.count++;
            return [];
        }
    });
    const sessions = new PeerSessionManager({ identityProvider, peerConnectionProvider, discoveryProvider: discovery, answerPollIntervalMs: 50 });
    const blocks = new PeerBlockUseCase(new InMemoryStorageProvider(), identityProvider);
    const storage = new InMemoryStorageProvider();
    const lobby = new PublicLobbyUseCase({
        transports: [network],
        identityProvider,
        peerSessionManager: sessions,
        findPeerUseCase: new FindPeerUseCase({ peerSessionManager: sessions }),
        peerBlockUseCase: blocks,
        storageProvider: storage,
        tickIntervalMs: 100
    });
    return { identityProvider, sessions, blocks, lobby, storage, id: identityProvider.getSigningIdentity().id };
}

function authenticatedTo(sessions, identityId) {
    return sessions.listPeers().some((peer) => peer.remoteIdentity
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

async function rejects(promise, pattern, message) {
    try {
        await promise;
    } catch (err) {
        assert(pattern.test(err.message), `${message} (got "${err.message}")`);
        return;
    }
    throw new Error(`ASSERT FAILED: ${message} (it did not throw)`);
}

// Strangers find each other in the public lobby and connect with one click,
// and the lobby keeps the joiner reachable for the next stranger too.
{
    const network = new LocalRendezvousNetwork();
    const aliceTurn = { count: 0 };
    const alice = makeDevice('lobby-alice', network, { turnRequests: aliceTurn });
    const bobTurn = { count: 0 };
    const bob = makeDevice('lobby-bob', network, { turnRequests: bobTurn });
    const carol = makeDevice('lobby-carol', network);

    await alice.lobby.join(PUBLIC_LOBBY, { displayName: '  Alice  ' });
    assert(alice.lobby.isJoined(PUBLIC_LOBBY) && alice.sessions.isPublishing(), 'joining makes Alice discoverable');
    assert(alice.lobby.rememberedDisplayName() === 'Alice', 'her display name is remembered for next time');
    assert(aliceTurn.count === 0, 'a standing lobby offer asks for no TURN relay credential');

    const { members, total } = await bob.lobby.list(PUBLIC_LOBBY);
    assert(total === 1 && members.length === 1 && members[0].identityId === alice.id && members[0].displayName === 'Alice' && !members[0].connected,
        'Bob, who has not joined, sees Alice in the lobby');
    assert((await alice.lobby.list(PUBLIC_LOBBY)).members.length === 0, 'Alice never sees herself');

    await bob.lobby.connect(alice.id);
    assert(bobTurn.count === 1, 'the person who clicks Connect is the one who may use a relay credential');
    await waitFor(() => authenticatedTo(alice.sessions, bob.id) && authenticatedTo(bob.sessions, alice.id), 'Bob and Alice authenticate');
    assert((await bob.lobby.list(PUBLIC_LOBBY)).members[0].connected, 'the listing now marks Alice as connected');
    assert((await bob.lobby.connect(alice.id)).alreadyConnected, 'connecting again reuses the live connection');

    await waitFor(() => alice.sessions.isPublishing(), 'Alice\'s spent publication is replaced');
    await carol.lobby.connect(alice.id);
    await waitFor(() => authenticatedTo(alice.sessions, carol.id) && authenticatedTo(carol.sessions, alice.id), 'a second stranger connects too');
    assert(aliceTurn.count === 0, 'republishing still asks for no relay credential');
    console.log('✓ strangers find each other in the public lobby and connect, and the joiner stays reachable');

    await alice.lobby.leave(PUBLIC_LOBBY);
    assert(!alice.lobby.isJoined(PUBLIC_LOBBY) && !alice.sessions.isPublishing(), 'leaving the last lobby withdraws the lobby\'s publication');
    assert((await bob.lobby.list(PUBLIC_LOBBY)).members.length === 0, '...and Alice is no longer listed');
    console.log('✓ leaving removes the card and stops being discoverable');

    for (const device of [alice, bob, carol]) { device.lobby.dispose(); device.sessions.dispose(); }
}

// Leaving while a spent publication is being replaced returns at once, and
// the replacement is withdrawn instead of left findable.
{
    const network = new LocalRendezvousNetwork();
    const alice = makeDevice('lobby-leave-alice', network);
    const bob = makeDevice('lobby-leave-bob', network);
    await alice.lobby.join(PUBLIC_LOBBY, { displayName: 'Alice' });
    await bob.lobby.connect(alice.id);
    await waitFor(() => authenticatedTo(alice.sessions, bob.id), 'Bob connects');
    await alice.lobby.leave(PUBLIC_LOBBY);
    await waitFor(async () => !alice.sessions.isPublishing(), 'Alice is not left publishing');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert(!alice.sessions.isPublishing() && (await network.lookup(alice.id)).length === 0,
        'no publication outlives leaving the lobby, even one prepared while leaving');
    console.log('✓ leaving mid-republish withdraws the replacement publication');
    for (const device of [alice, bob]) { device.lobby.dispose(); device.sessions.dispose(); }
}

// A junk answer left in the mailbox spends the offer but never strands the
// joiner: the pending connection closes and a fresh offer replaces it.
{
    const network = new LocalRendezvousNetwork();
    const alice = makeDevice('lobby-junk-alice', network);
    const bob = makeDevice('lobby-junk-bob', network);
    await alice.lobby.join(PUBLIC_LOBBY, { displayName: 'Alice' });
    const [spoiled] = await network.lookup(alice.id);
    await network.postAnswer({ identityId: alice.id, publicationId: spoiled.publicationId, answer: { connectionId: 'not-hers', sdp: 'junk' }, answererId: 'did:key:zJunk' });
    await waitFor(() => {
        const current = network._publications.get(alice.id);
        return current && current.publicationId !== spoiled.publicationId && alice.sessions.isPublishing();
    }, 'Alice publishes a fresh offer after the junk answer');
    assert(alice.sessions.listPeers().length === 1, 'the spoiled pending connection was closed, leaving only the fresh one');
    await bob.lobby.connect(alice.id);
    await waitFor(() => authenticatedTo(alice.sessions, bob.id) && authenticatedTo(bob.sessions, alice.id), 'Bob still connects');
    console.log('✓ a junk answer never leaves the joiner unreachable');
    for (const device of [alice, bob]) { device.lobby.dispose(); device.sessions.dispose(); }
}

// World lobbies are separate; blocked, forged and expired cards are never
// listed.
{
    const network = new LocalRendezvousNetwork();
    const alice = makeDevice('lobby-world-alice', network);
    const bob = makeDevice('lobby-world-bob', network);
    const mallory = makeDevice('lobby-world-mallory', network);

    await alice.lobby.join(worldLobby('w-1'), { displayName: 'Alice' });
    await mallory.lobby.join(worldLobby('w-1'), { displayName: 'Mallory' });
    assert((await bob.lobby.list(worldLobby('w-1'))).members.length === 2, 'both are in World w-1\'s lobby');
    assert((await bob.lobby.list(worldLobby('w-2'))).members.length === 0, 'another World\'s lobby is empty');
    assert((await bob.lobby.list(PUBLIC_LOBBY)).members.length === 0, 'joining a World lobby is not joining the public one');

    bob.lobby.block(mallory.id);
    assert(bob.blocks.isBlocked(mallory.id), 'blocking from the lobby records an ordinary block');
    const afterBlock = await bob.lobby.list(worldLobby('w-1'));
    assert(afterBlock.members.length === 1 && afterBlock.members[0].identityId === alice.id, 'Bob never sees someone he blocked');
    await rejects(bob.lobby.connect(mallory.id), /blocked/, 'and cannot connect to them from the lobby');

    await network.joinLobby(LobbyCard.create({ identityId: bob.id, lobby: worldLobby('w-1'), displayName: 'Fake Bob' }));
    const forgedFor = await alice.lobby.list(worldLobby('w-1'));
    assert(!forgedFor.members.some((m) => m.displayName === 'Fake Bob'), 'an unsigned card a server lists anyway is dropped');
    await network.joinLobby(LobbyCard.fromJSON({
        ...LobbyCard.create({ identityId: alice.id, lobby: worldLobby('w-1'), displayName: 'Old', now: new Date(Date.now() - 60 * 60 * 1000) }).toJSON()
    }));
    assert(!(await bob.lobby.list(worldLobby('w-1'))).members.some((m) => m.displayName === 'Old'), 'an expired card is dropped');
    console.log('✓ World lobbies are separate, and blocked, forged or expired cards are never listed');

    for (const device of [alice, bob, mallory]) { device.lobby.dispose(); device.sessions.dispose(); }
}

// Joining needs a signing identity and a rendezvous server.
{
    const network = new LocalRendezvousNetwork();
    const identityProvider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const created = await identityProvider.createProtectedLocalIdentity('locked', 'correct horse battery');
    await identityProvider.unlock(created.identityId, 'correct horse battery');
    identityProvider.authenticate(created.identityId);
    identityProvider.lock(created.identityId);
    const sessions = new PeerSessionManager({ identityProvider });
    const findPeerUseCase = new FindPeerUseCase({ peerSessionManager: sessions });
    const locked = new PublicLobbyUseCase({ transports: [network], identityProvider, peerSessionManager: sessions, findPeerUseCase });
    await rejects(locked.join(PUBLIC_LOBBY), /unlock your identity/, 'a locked identity is asked to unlock');
    const serverless = new PublicLobbyUseCase({ transports: [], identityProvider, peerSessionManager: sessions, findPeerUseCase });
    assert(!serverless.isAvailable(), 'with no rendezvous server the lobby is unavailable');
    await rejects(serverless.join(PUBLIC_LOBBY), /no rendezvous server/, '...and joining says so');
    const oldServer = {
        joinLobby: async () => { throw new Error('WebSocketRendezvousTransport: unknown request type "JOIN_LOBBY"'); },
        listLobby: async () => { throw new Error('WebSocketRendezvousTransport: unknown request type "LIST_LOBBY"'); },
        leaveLobby: async () => false
    };
    const outdated = new PublicLobbyUseCase({ transports: [oldServer], identityProvider, peerSessionManager: sessions, findPeerUseCase });
    await rejects(outdated.list(PUBLIC_LOBBY), /does not offer a lobby yet/, 'a server from before the lobby is named as such, not as unreachable');
    network.setAvailable(false);
    await rejects(locked.list(PUBLIC_LOBBY), /no rendezvous server answered/, 'an unreachable server is reported, not shown as an empty lobby');
    console.log('✓ joining needs an unlocked identity and a reachable rendezvous server');
    sessions.dispose();
}

console.log('\n✅ All PublicLobby tests passed.');
