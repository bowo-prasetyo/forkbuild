import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerSessionManager } from '../application/PeerSessionManager.js';

// 0.2.55 — Peer Connections & Rendezvous UI.
//
// This file tests application/PeerSessionManager.js — the one new
// application-layer class this milestone adds — end to end over a REAL
// WebRTC transport (peer/WebRtcPeerConnectionProvider.js, unmodified),
// proving the exact flow the design doc's own flagship scenario asked
// for, right up to the point where a UI takes over: Alice creates an
// invitation, Bob imports it and connects, Alice completes the
// handshake with Bob's relayed reply, and BOTH sides reach a real,
// mutually-proven 0.2.49 AUTHENTICATED peer — never anything this
// milestone invented itself. ui/views/PeerConnectionsView.js is pure
// presentation over this class and is exercised manually in a browser
// (see docs/Architecture.md, "Peer Connections & Rendezvous UI
// (0.2.55)"), the same division every other view in this codebase
// already keeps from its own use case.
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

function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function waitForState(peer, targetStates, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
        const current = peer.getLifecycleState();
        if (targetStates.includes(current)) { resolve(current); return; }
        const timeout = setTimeout(() => {
            unsubscribe();
            reject(new Error(`timed out waiting for state in [${targetStates.join(', ')}], last state was ${peer.getLifecycleState()}`));
        }, timeoutMs);
        const unsubscribe = peer.onStateChange((state) => {
            if (targetStates.includes(state)) {
                clearTimeout(timeout);
                unsubscribe();
                resolve(state);
            }
        });
    });
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. FLAGSHIP — Alice creates an invitation, Bob accepts it, Alice
//    completes the connection with Bob's relayed reply, and BOTH sides
//    reach a real, mutually-proven AUTHENTICATED peer, each showing up
//    in the OTHER's own "My Peers" list.
// ---------------------------------------------------------------------
let flagshipCleanup;
{
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');
    const aliceSigning = alice.getSigningIdentity();
    const bobSigning = bob.getSigningIdentity();

    const aliceSessions = new PeerSessionManager({ identityProvider: alice });
    const bobSessions = new PeerSessionManager({ identityProvider: bob });

    // Alice: "Invite Someone."
    const { invitation, connectedPeer: alicePendingPeer } = await aliceSessions.createInvitation();
    assert(invitation.identityHint === aliceSigning.id, "the invitation carries alice's own id as a courtesy hint, unchanged from 0.2.50");
    assert(alicePendingPeer.getLifecycleState() === PeerLifecycleState.CONNECTING, "alice's own pending connection shows up in her registry immediately, CONNECTING");
    assert(aliceSessions.listPeers().some((p) => p.connectionId === alicePendingPeer.connectionId), "alice's My Peers list already carries the pending connection");

    // The invitation travels as plain, JSON-round-tripped text — exactly
    // as if copy/pasted between two browser tabs.
    const invitationText = JSON.stringify(invitation.toJSON());

    // Bob: "Connect to Peer."
    const { connectedPeer: bobPeer, reply } = await bobSessions.acceptInvitation(invitationText);
    assert(bobPeer.remoteIdentity === null, 'bob has no proven identity yet — only signaling has happened so far');
    assert(typeof reply === 'string' && reply.length > 0, 'accepting an invitation produces a reply bob must relay back');

    // Alice: pastes bob's reply to complete the connection.
    await aliceSessions.completeConnection(alicePendingPeer.connectionId, reply);

    await Promise.all([
        waitForState(alicePendingPeer, [PeerLifecycleState.AUTHENTICATED]),
        waitForState(bobPeer, [PeerLifecycleState.AUTHENTICATED])
    ]);

    assert(bobPeer.remoteIdentity && bobPeer.remoteIdentity.identityId === aliceSigning.id, "bob's peer records alice's REAL, proven identity");
    assert(alicePendingPeer.remoteIdentity && alicePendingPeer.remoteIdentity.identityId === bobSigning.id, "alice's peer independently proves bob's identity too — mutual, unchanged from 0.2.49");

    assert(aliceSessions.listPeers().length === 1 && aliceSessions.listPeers()[0] === alicePendingPeer, "alice's My Peers shows exactly bob");
    assert(bobSessions.listPeers().length === 1 && bobSessions.listPeers()[0] === bobPeer, "bob's My Peers shows exactly alice");
    console.log('✓ FLAGSHIP: invitation -> accept -> complete -> mutual AUTHENTICATED peers, each visible in the other\'s My Peers');

    // A local alias never travels anywhere and never affects authentication.
    alicePendingPeer.setAlias('Bobby');
    assert(alicePendingPeer.alias === 'Bobby', 'a local alias can be set on an authenticated peer');
    assert(bobPeer.alias === null, "setting an alias on alice's OWN view of the connection never reaches bob's side");
    console.log('✓ a local alias is exactly that — local, and never a claim sent to the peer');

    // Alice disconnects — the peer disappears from BOTH sides' registries,
    // the fundamental rule the design doc insisted on: no persistent
    // trust, ever.
    aliceSessions.disconnect(alicePendingPeer.connectionId);
    await Promise.all([
        waitForState(alicePendingPeer, [PeerLifecycleState.CLOSED]),
        waitForState(bobPeer, [PeerLifecycleState.CLOSED])
    ]);
    assert(aliceSessions.listPeers().length === 0, "closing removes alice's own entry");
    assert(bobSessions.listPeers().length === 0, "closing removes bob's entry too — a real network close, not merely a local one");
    console.log('✓ disconnecting makes the peer disappear from both sides\' My Peers — closed, not merely hidden');

    flagshipCleanup = { alice, bob, aliceSigning, bobSigning, aliceSessions, bobSessions, invitation };
}

// ---------------------------------------------------------------------
// 2. Reconnect using a fresh invitation -> a brand-new peer, fresh
//    authentication from nothing, no alias carried over.
// ---------------------------------------------------------------------
{
    const { aliceSessions, bobSessions, aliceSigning } = flagshipCleanup;

    const { invitation, connectedPeer: alicePeer } = await aliceSessions.createInvitation();
    const { connectedPeer: bobPeer, reply } = await bobSessions.acceptInvitation(JSON.stringify(invitation.toJSON()));
    await aliceSessions.completeConnection(alicePeer.connectionId, reply);

    await Promise.all([
        waitForState(alicePeer, [PeerLifecycleState.AUTHENTICATED]),
        waitForState(bobPeer, [PeerLifecycleState.AUTHENTICATED])
    ]);
    assert(bobPeer.remoteIdentity.identityId === aliceSigning.id, "it's genuinely alice again, proven again over a brand-new connection");
    assert(bobPeer.alias === null, 'a brand-new ConnectedPeer carries no alias from any prior connection');

    bobSessions.disconnect(bobPeer.connectionId);
    await wait(300);
    console.log('✓ reconnecting through a fresh invitation produces a fresh peer, re-authenticated from nothing');

    aliceSessions.dispose();
    bobSessions.dispose();
}

// ---------------------------------------------------------------------
// 3. Friendly errors: garbage input never crashes past a clear message.
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const sessions = new PeerSessionManager({ identityProvider: alice });

    let threw = false;
    try {
        await sessions.acceptInvitation('not json at all');
    } catch (e) {
        threw = e.message.includes('not valid JSON');
    }
    assert(threw, 'pasting garbage as an invitation fails with a clear, friendly message');

    threw = false;
    try {
        await sessions.completeConnection('no-such-connection-id', '{}');
    } catch (e) {
        threw = e.message.includes('no pending connection');
    }
    assert(threw, 'completing a connection id that does not exist fails with a clear, friendly message, never a silent no-op');

    const { connectedPeer } = await sessions.createInvitation();
    threw = false;
    try {
        await sessions.completeConnection(connectedPeer.connectionId, 'also not json');
    } catch (e) {
        threw = e.message.includes('not valid JSON');
    }
    assert(threw, 'a malformed reply is rejected before ever reaching the transport');

    sessions.dispose();
    console.log('✓ malformed invitations, unknown connection ids, and malformed replies all fail with clear, friendly messages');
}

// ---------------------------------------------------------------------
// 4. A captured invitation replayed after its own expiry is rejected by
//    the unmodified 0.2.50 discovery layer, before any connection is
//    even attempted.
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');
    const aliceSessions = new PeerSessionManager({ identityProvider: alice });
    const bobSessions = new PeerSessionManager({ identityProvider: bob });

    const { invitation } = await aliceSessions.createInvitation({ ttlMs: 50 });
    await wait(80);

    let threw = false;
    try {
        await bobSessions.acceptInvitation(JSON.stringify(invitation.toJSON()));
    } catch (e) {
        threw = e.message.includes('expired');
    }
    assert(threw, 'an expired invitation is rejected outright, never silently attempted');
    assert(bobSessions.listPeers().length === 0, 'no connection attempt ever entered the registry for an expired invitation');

    aliceSessions.dispose();
    bobSessions.dispose();
    console.log('✓ a captured invitation replayed after its own expiry is rejected before any connection is attempted');
}

console.log('\nAll peer connections UI (PeerSessionManager) tests passed.');
}

await runTests();
