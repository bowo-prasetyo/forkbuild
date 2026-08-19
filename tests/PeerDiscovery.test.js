import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerInvitation } from '../peer/PeerInvitation.js';
import { PeerDiscoveryRecord } from '../peer/PeerDiscoveryRecord.js';
import { PeerDiscoverySource } from '../peer/PeerDiscoverySource.js';
import { LocalPeerDiscoveryProvider } from '../peer/LocalPeerDiscoveryProvider.js';
import { PeerLifecycleState, derivePeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerConnectionState } from '../peer/PeerConnectionState.js';
import { PeerAuthenticationState } from '../peer/PeerAuthenticationState.js';
import { DiscoverPeersUseCase } from '../application/DiscoverPeersUseCase.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';

// 0.2.50 — Peer Discovery & Rendezvous.
//
// "Find peers, not authenticate them." Every test in this file that
// reaches AUTHENTICATED does so through a completely real 0.2.49 handshake
// (peer/PeerAuthenticationSession.js), never through anything discovery
// itself asserts — discovery only ever produces a CANDIDATE endpoint (see
// peer/PeerDiscoveryRecord.js). The flagship (block 4) runs the design
// doc's own scripted scenario end to end: Alice creates an invitation, Bob
// imports it, discovers her candidate endpoint, connects, 0.2.49 mutual
// authentication runs on both sides, and Bob ends up with a proven
// PeerIdentity — never merely "Alice claimed to be Alice."
class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function wait(ms = 10) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. PeerInvitation — pure data, validated construction, expiry
// ---------------------------------------------------------------------
{
    const now = new Date('2026-01-01T00:00:00Z');
    const invitation = PeerInvitation.create({ endpoint: 'alice-address', identityHint: 'did:key:alice', ttlMs: 60000, now });
    assert(invitation.endpoint === 'alice-address', 'carries the endpoint');
    assert(invitation.identityHint === 'did:key:alice', 'carries the (untrusted) identityHint');
    assert(!invitation.isExpired(new Date(now.getTime() + 1000)), 'not yet expired well within its ttl');
    assert(invitation.isExpired(new Date(now.getTime() + 61000)), 'expired once past its own expiresAt');

    const roundTripped = PeerInvitation.fromJSON(invitation.toJSON());
    assert(roundTripped.invitationId === invitation.invitationId, 'round-trips through toJSON/fromJSON');
    assert(roundTripped.endpoint === invitation.endpoint, 'round-trips endpoint');

    let threw = false;
    try {
        PeerInvitation.fromJSON({ invitationId: 'x', endpoint: 'y', createdAt: now.toISOString(), expiresAt: now.toISOString() });
    } catch (e) {
        threw = e.message.includes('expiresAt must be after createdAt');
    }
    assert(threw, 'an invitation whose expiresAt does not follow createdAt is rejected');
    console.log('✓ PeerInvitation: validated pure data, round-trips, expiry is real');
}

// ---------------------------------------------------------------------
// 2. PeerDiscoveryRecord / LocalPeerDiscoveryProvider — importing an
//    invitation produces a candidate, never a proven identity
// ---------------------------------------------------------------------
{
    const provider = new LocalPeerDiscoveryProvider();
    const invitation = PeerInvitation.create({ endpoint: 'alice-address', identityHint: 'did:key:alice' });

    let discovered = null;
    provider.onDiscovered((record) => { discovered = record; });

    const record = provider.importInvitation(invitation);
    assert(record instanceof PeerDiscoveryRecord, 'importInvitation returns a PeerDiscoveryRecord');
    assert(record.candidateEndpoint === 'alice-address', 'candidateEndpoint carries the invitation endpoint');
    assert(record.identityHint === 'did:key:alice', 'identityHint carries through, still untrusted');
    assert(record.source === PeerDiscoverySource.INVITATION, 'source is INVITATION');
    assert(discovered === record, 'onDiscovered fires with the same record');
    assert(provider.list().length === 1 && provider.list()[0] === record, 'list() reflects the imported record');

    provider.forget(record.peerDiscoveryId);
    assert(provider.list().length === 0, 'forget() removes the record');
    console.log('✓ LocalPeerDiscoveryProvider: importing an invitation produces a candidate record, never a proven identity');
}

// ---------------------------------------------------------------------
// 3. Replay after expiry -> discovery rejects it outright
// ---------------------------------------------------------------------
{
    const provider = new LocalPeerDiscoveryProvider();
    const now = new Date('2026-01-01T00:00:00Z');
    const invitation = PeerInvitation.create({ endpoint: 'alice-address', ttlMs: 1000, now });

    // A captured, entirely genuine invitation, replayed long after it
    // expired.
    let threw = false;
    try {
        provider.importInvitation(invitation, { now: new Date(now.getTime() + 999999) });
    } catch (e) {
        threw = e.message.includes('expired');
    }
    assert(threw, 'an expired invitation is rejected at discovery time');
    assert(provider.list().length === 0, 'no record is ever created from an expired invitation');
    console.log('✓ replaying a captured invitation after expiry is rejected by discovery, before any connection is attempted');
}

// ---------------------------------------------------------------------
// 4. FLAGSHIP — Alice creates an invitation, Bob imports it, discovers
//    her candidate endpoint, connects, mutual 0.2.49 authentication runs
//    on BOTH ends, and Bob ends up with a proven PeerIdentity.
// ---------------------------------------------------------------------
let flagshipCleanup;
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');
    const aliceSigning = alice.getSigningIdentity();
    const bobSigning = bob.getSigningIdentity();

    const aliceTransport = new LocalPeerConnectionProvider('alice-address', network);
    const bobTransport = new LocalPeerConnectionProvider('bob-address', network);

    // Alice is discoverable: she is LISTENING for incoming connections
    // before she ever hands out an invitation.
    const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
    const stopListening = aliceConnect.listen();

    // Alice creates a portable invitation naming her own endpoint.
    const aliceDiscovery = new DiscoverPeersUseCase(new LocalPeerDiscoveryProvider());
    const invitation = aliceDiscovery.createInvitation({ endpoint: 'alice-address', identityProvider: alice });
    assert(invitation.identityHint === aliceSigning.id, "the invitation's identityHint is alice's own id, as a courtesy hint");

    // Bob imports/accepts it, and discovers her candidate endpoint.
    const bobDiscovery = new DiscoverPeersUseCase(new LocalPeerDiscoveryProvider());
    const record = bobDiscovery.importInvitation(invitation);
    assert(bobDiscovery.listDiscoveredPeers().length === 1, 'bob now has one discovered candidate');

    // Before connecting, this candidate is DISCOVERED and nothing else.
    assert(derivePeerLifecycleState({}) === PeerLifecycleState.DISCOVERED, 'a bare discovery record, never connected, is DISCOVERED');

    // Bob connects.
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
    const connectedPeer = bobConnect.connect(record);
    assert(connectedPeer.discoveryRecord === record, 'the ConnectedPeer remembers which discovery record led here');
    assert(connectedPeer.remoteIdentity === null, 'no identity is known yet — only a connection exists so far');

    // 0.2.49 mutual authentication runs to completion on both sides.
    await wait(20);

    assert(connectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, "bob's ConnectedPeer reaches AUTHENTICATED");
    assert(connectedPeer.remoteIdentity && connectedPeer.remoteIdentity.identityId === aliceSigning.id,
        "bob's ConnectedPeer records alice's REAL, proven identity — never merely her claimed one");

    const alicesView = aliceConnect.registry.list()[0];
    assert(alicesView, "alice's own registry (the listening side) also tracks the connection");
    assert(alicesView.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, "alice's own side independently reaches AUTHENTICATED");
    assert(alicesView.remoteIdentity.identityId === bobSigning.id, "alice's side proves BOB's identity too — the handshake is mutual");
    console.log('✓ FLAGSHIP: invitation -> discovery -> connection -> mutual 0.2.49 authentication -> proven PeerIdentity, both directions');

    flagshipCleanup = { network, alice, bob, aliceTransport, bobTransport, aliceConnect, bobConnect, bobDiscovery, stopListening, connectedPeer, aliceSigning, bobSigning, invitation };
}

// ---------------------------------------------------------------------
// 5. Modify the invitation's endpoint -> the connection attempt fails
//    outright, before any authentication is even possible
// ---------------------------------------------------------------------
{
    const { network, bob, bobTransport, bobDiscovery } = flagshipCleanup;
    const tamperedInvitation = PeerInvitation.create({ endpoint: 'nobody-registered-at-this-address' });
    const tamperedRecord = bobDiscovery.importInvitation(tamperedInvitation);

    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
    let threw = false;
    try {
        bobConnect.connect(tamperedRecord);
    } catch (e) {
        threw = e.message.includes('no peer registered');
    }
    assert(threw, 'connecting to a tampered/bogus endpoint fails at the transport layer');
    assert(bobConnect.registry.list().length === 0, 'a failed connection attempt never enters the registry');
    console.log('✓ modifying an invitation\'s endpoint makes the connection attempt fail, never a silently-wrong connection');
}

// ---------------------------------------------------------------------
// 6. Replace the identity hint -> authentication still determines the
//    REAL identity, never the (tampered) hint
// ---------------------------------------------------------------------
{
    const { network, bob, bobTransport, bobDiscovery, aliceSigning } = flagshipCleanup;
    const mallory = makeDevice('Mallory');
    const mallorySigning = mallory.getSigningIdentity();

    // A genuine invitation to alice's real endpoint, but with the
    // identityHint swapped to claim it's actually Mallory.
    const forgedInvitation = PeerInvitation.create({ endpoint: 'alice-address', identityHint: mallorySigning.id });
    const forgedRecord = bobDiscovery.importInvitation(forgedInvitation);
    assert(forgedRecord.identityHint === mallorySigning.id, "setup: the discovery record carries mallory's id as an (untrusted) hint");

    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
    const connectedPeer = bobConnect.connect(forgedRecord);
    await wait(20);

    assert(connectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'the handshake still completes — the endpoint itself was genuine');
    assert(connectedPeer.remoteIdentity.identityId === aliceSigning.id, 'the PROVEN identity is alice — whoever actually answered at that endpoint');
    assert(connectedPeer.remoteIdentity.identityId !== mallorySigning.id, 'the tampered identityHint never becomes the authenticated identity');
    console.log('✓ a tampered identityHint never overrides what 0.2.49 authentication actually proves');
}

// ---------------------------------------------------------------------
// 7. Close the connection -> the peer disappears from the registry
// ---------------------------------------------------------------------
{
    const { connectedPeer, bobConnect, aliceConnect } = flagshipCleanup;
    assert(bobConnect.registry.list().some((p) => p.connectionId === connectedPeer.connectionId), 'setup: still present before closing');

    connectedPeer.close();
    await wait(10);

    assert(!bobConnect.registry.list().some((p) => p.connectionId === connectedPeer.connectionId), "closing removes bob's own entry");
    assert(!aliceConnect.registry.list().some((p) => p.connectionId === connectedPeer.connectionId), "closing removes alice's entry too — close is symmetric at the transport layer");
    console.log('✓ closing the connection makes the peer disappear from both sides\' registries');
}

// ---------------------------------------------------------------------
// 8. Reconnect -> a fresh ConnectedPeer, fresh authentication from
//    nothing, nothing carried over from the closed connection
// ---------------------------------------------------------------------
{
    const { bobTransport, bob, bobDiscovery, invitation, aliceSigning } = flagshipCleanup;

    // Bob still holds the original (not-yet-expired) invitation and
    // reconnects using a freshly-imported record from it.
    const record = bobDiscovery.importInvitation(invitation);
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
    const reconnectedPeer = bobConnect.connect(record);
    assert(reconnectedPeer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED,
        'a brand-new connection starts unauthenticated');

    await wait(20);
    assert(reconnectedPeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'the fresh connection re-authenticates from nothing');
    assert(reconnectedPeer.remoteIdentity.identityId === aliceSigning.id, "it's genuinely alice again, proven again, not assumed from before");
    assert(reconnectedPeer.alias === null, 'a brand-new ConnectedPeer carries no alias from any prior connection — nothing persists across reconnects');

    reconnectedPeer.close();
    console.log('✓ reconnecting produces a fresh ConnectedPeer that re-authenticates from nothing');

    flagshipCleanup.stopListening();
    flagshipCleanup.aliceTransport.dispose();
    flagshipCleanup.bobTransport.dispose();
}

// ---------------------------------------------------------------------
// 9. PeerLifecycleState — pure, derived, never a third state machine
// ---------------------------------------------------------------------
{
    assert(derivePeerLifecycleState({}) === PeerLifecycleState.DISCOVERED, 'no connection at all -> DISCOVERED');
    assert(derivePeerLifecycleState({ connectionState: PeerConnectionState.CONNECTING }) === PeerLifecycleState.CONNECTING, 'transport CONNECTING -> CONNECTING');
    assert(derivePeerLifecycleState({ connectionState: PeerConnectionState.CONNECTED, authenticationState: PeerAuthenticationState.IDLE }) === PeerLifecycleState.CONNECTED,
        'transport CONNECTED, handshake not yet started -> CONNECTED');
    assert(derivePeerLifecycleState({ connectionState: PeerConnectionState.CONNECTED, authenticationState: PeerAuthenticationState.AUTHENTICATING }) === PeerLifecycleState.AUTHENTICATING,
        'handshake in progress -> AUTHENTICATING');
    assert(derivePeerLifecycleState({ connectionState: PeerConnectionState.CONNECTED, authenticationState: PeerAuthenticationState.AUTHENTICATED }) === PeerLifecycleState.AUTHENTICATED,
        'handshake succeeded -> AUTHENTICATED');
    assert(derivePeerLifecycleState({ connectionState: PeerConnectionState.CONNECTED, authenticationState: PeerAuthenticationState.FAILED }) === PeerLifecycleState.FAILED,
        'handshake failed even though transport is still CONNECTED -> FAILED');
    assert(derivePeerLifecycleState({ connectionState: PeerConnectionState.FAILED, authenticationState: PeerAuthenticationState.AUTHENTICATED }) === PeerLifecycleState.FAILED,
        'transport FAILED always wins, regardless of a stale authenticationState');
    assert(derivePeerLifecycleState({ connectionState: PeerConnectionState.CLOSED, authenticationState: PeerAuthenticationState.AUTHENTICATED }) === PeerLifecycleState.CLOSED,
        'transport CLOSED always wins too');
    console.log('✓ PeerLifecycleState: a pure, derived composite over the two REAL 0.2.49 state machines, never a third one');
}

// ---------------------------------------------------------------------
// 10. ConnectedPeerRegistry removal is keyed on the connection's own
//     TRANSPORT state, never on the derived lifecycle value a
//     notification happens to carry. An authentication-only failure
//     (peer/PeerAuthenticationSession.js's own handshake timeout among
//     them) leaves an otherwise-live connection in place — see docs/
//     user/07-PeerConnectionsAndFriends.md's own "Authenticated (or
//     Failed)": Failed is meant to be visible, not to flash and vanish
//     in the same tick it appears. Only the transport itself ending
//     (CLOSED/FAILED) still removes immediately.
// ---------------------------------------------------------------------
{
    const registry = new ConnectedPeerRegistry();
    let listener = null;
    const stubConnection = { transportState: PeerConnectionState.CONNECTED };
    const stubPeer = {
        connectionId: 'stub-registry-removal',
        connection: stubConnection,
        onStateChange: (cb) => { listener = cb; return () => { listener = null; }; },
        dispose: () => {}
    };
    registry.add(stubPeer);
    assert(registry.get('stub-registry-removal') === stubPeer, 'setup: present once added');

    // Authentication alone reaches FAILED — the transport underneath is
    // still perfectly CONNECTED (exactly what a handshake timeout, or
    // any other authentication-only rejection, looks like).
    listener(PeerLifecycleState.FAILED);
    assert(registry.get('stub-registry-removal') === stubPeer, 'an authentication-only FAILED, with the transport still CONNECTED, does not remove the peer');
    assert(registry.list().length === 1, 'the card stays in "My Peers" so its failureReason is actually visible');

    // NOW the transport itself ends — this must remove it, exactly like
    // any ordinary close.
    stubConnection.transportState = PeerConnectionState.CLOSED;
    listener(PeerLifecycleState.CLOSED);
    assert(registry.get('stub-registry-removal') === null, 'the transport actually closing still removes the peer');
    assert(registry.list().length === 0, 'My Peers is empty again once the transport is gone');
    console.log('✓ ConnectedPeerRegistry: removal follows the transport, not the derived lifecycle — an authentication-only failure stays visible');
}

console.log('\nAll peer discovery tests passed.');
}

await runTests();
