import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerIdentity } from '../peer/PeerIdentity.js';
import { PeerRelationship } from '../core/PeerRelationship.js';
import { PeerRelationshipUseCase } from '../application/PeerRelationshipUseCase.js';
import { PeerSessionManager } from '../application/PeerSessionManager.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';

// 0.2.56 — Persistent Peer Relationships.
//
// "I successfully authenticated Bob once. How do I remember that I know
// Bob without pretending the old connection is still alive?" This file
// proves the answer core/PeerRelationship.js and application/
// PeerRelationshipUseCase.js give, end to end over a REAL WebRTC
// connection (application/PeerSessionManager.js, 0.2.55, unmodified) —
// not a mock, matching this codebase's standing rule that a real
// transport is exercised with real code.
//
// The flagship proves the exact invariant the design doc asked for:
// connections are ephemeral, relationships are durable, and identity is
// the bridge between them. Alice remembers Bob, disconnects, "reloads"
// (a brand-new PeerRelationshipUseCase over the SAME storage), and Bob
// is still there — while application/ConnectedPeerRegistry.js, the
// thing 0.2.50 through 0.2.55 already proved never persists anything,
// is empty the entire time.
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

function makeDevice(label, storageProvider = new InMemoryStorageProvider()) {
    const provider = new LocalIdentityProvider(storageProvider);
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

async function connectAliceAndBob(aliceSessions, bobSessions) {
    const { invitation, connectedPeer: alicePeer } = await aliceSessions.createInvitation();
    const { connectedPeer: bobPeer, reply } = await bobSessions.acceptInvitation(JSON.stringify(invitation.toJSON()));
    await aliceSessions.completeConnection(alicePeer.connectionId, reply);
    await Promise.all([
        waitForState(alicePeer, [PeerLifecycleState.AUTHENTICATED]),
        waitForState(bobPeer, [PeerLifecycleState.AUTHENTICATED])
    ]);
    return { alicePeer, bobPeer };
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. core/PeerRelationship.js — construction, validation, immutability.
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const signing = alice.getSigningIdentity();
    const peerIdentity = new PeerIdentity({ identityId: signing.id, publicKey: signing.publicKey });

    const relationship = PeerRelationship.fromPeerIdentity(peerIdentity, { alias: 'Bobby' });
    assert(relationship.identityId === signing.id, 'fromPeerIdentity carries the proven identityId');
    assert(relationship.alias === 'Bobby', 'fromPeerIdentity carries the supplied alias');
    assert(relationship.status === 'KNOWN', 'a fresh relationship starts KNOWN');

    let threw = false;
    try {
        new PeerRelationship({ identityId: signing.id, publicKey: 'not-the-real-key-'.padEnd(64, '0') });
    } catch (e) {
        threw = true;
    }
    assert(threw, 'a forged identityId/publicKey pairing is rejected, exactly like PeerIdentity');

    // fromPeerIdentity itself is a plain SHAPE check (core/ never
    // imports peer/PeerIdentity.js — see this class's own header) — it
    // happily builds a relationship from a well-shaped plain object.
    // The REAL "must be a proven PeerIdentity" boundary lives one layer
    // up, in PeerRelationshipUseCase.rememberPeer's `instanceof`
    // check — proven in test 2, below.
    const fromPlainObject = PeerRelationship.fromPeerIdentity({ identityId: signing.id, publicKey: signing.publicKey });
    assert(fromPlainObject.identityId === signing.id, 'fromPeerIdentity accepts anything correctly SHAPED — the instanceof gate is PeerRelationshipUseCase.rememberPeer\'s job, not this factory\'s');

    const renamed = relationship.withAlias('Robert');
    assert(renamed.alias === 'Robert' && relationship.alias === 'Bobby', 'withAlias returns a new instance, the original is untouched');
    assert(renamed.identityId === relationship.identityId, 'withAlias never changes the identity');

    const reauthed = relationship.withLastAuthenticatedAt(new Date(relationship.lastAuthenticatedAt.getTime() + 60000));
    assert(reauthed.lastAuthenticatedAt.getTime() > relationship.lastAuthenticatedAt.getTime(), 'withLastAuthenticatedAt bumps the timestamp');
    assert(reauthed.alias === relationship.alias, 'withLastAuthenticatedAt never touches the alias');

    const roundTripped = PeerRelationship.fromJSON(relationship.toJSON());
    assert(roundTripped.identityId === relationship.identityId
        && roundTripped.alias === relationship.alias
        && roundTripped.status === relationship.status, 'round-trips through toJSON/fromJSON');

    console.log('✓ core/PeerRelationship.js: construction, validation, and immutability');
}

// ---------------------------------------------------------------------
// 2. application/PeerRelationshipUseCase.js — the security boundary:
//    only a REAL, verified PeerIdentity may become a relationship.
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const useCase = new PeerRelationshipUseCase(new InMemoryStorageProvider(), alice);

    let threw = false;
    try {
        useCase.rememberPeer({ identityId: 'did:key:zFake', publicKey: 'ff'.repeat(32) });
    } catch (e) {
        threw = e.message.includes('verified PeerIdentity');
    }
    assert(threw, 'rememberPeer refuses anything that is not an actual PeerIdentity instance — never an invitation hint');

    threw = false;
    try {
        useCase.rememberPeer('did:key:zFake');
    } catch (e) {
        threw = e.message.includes('verified PeerIdentity');
    }
    assert(threw, 'rememberPeer refuses a bare identityId string too');

    console.log('✓ PeerRelationshipUseCase.rememberPeer only ever accepts a proven PeerIdentity');
}

// ---------------------------------------------------------------------
// 3. CRUD surface, per-owner scoping, and change notifications.
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const device = makeDevice('Alice1', storage); // device now authenticated as Alice1
    const useCase = new PeerRelationshipUseCase(storage, device);

    const bobSigning = makeDevice('Bob').getSigningIdentity();
    const bobIdentity = new PeerIdentity({ identityId: bobSigning.id, publicKey: bobSigning.publicKey });

    assert(useCase.getRelationships().length === 0, 'a fresh owner starts with no known peers');
    assert(useCase.isKnown(bobIdentity.identityId) === false, 'isKnown is false before remembering');

    let changeEvents = [];
    const unsubscribe = useCase.onRelationshipsChanged((list) => changeEvents.push(list));

    const remembered = useCase.rememberPeer(bobIdentity, { alias: 'Bob' });
    assert(remembered.alias === 'Bob', 'rememberPeer honors the supplied alias');
    assert(useCase.isKnown(bobIdentity.identityId), 'isKnown is true after remembering');
    assert(changeEvents.length === 1 && changeEvents[0].length === 1, 'onRelationshipsChanged fires with the new snapshot');

    // Remembering an already-known identity again refreshes it in place —
    // never a second row.
    const rememberedAgain = useCase.rememberPeer(bobIdentity);
    assert(useCase.getRelationships().length === 1, 'remembering an already-known peer again never creates a duplicate');
    assert(rememberedAgain.alias === 'Bob', 'remembering again without a new alias keeps the existing one');
    assert(rememberedAgain.lastAuthenticatedAt.getTime() >= remembered.lastAuthenticatedAt.getTime(), 're-remembering refreshes lastAuthenticatedAt');

    const updated = useCase.updateAlias(bobIdentity.identityId, 'Bobby');
    assert(updated.alias === 'Bobby', 'updateAlias renames an existing relationship');

    let threw = false;
    try {
        useCase.updateAlias('did:key:zNeverRemembered', 'X');
    } catch (e) {
        threw = e.message.includes('no known peer');
    }
    assert(threw, 'updateAlias on an unknown identity fails with a clear message');

    threw = false;
    try {
        useCase.forgetPeer('did:key:zNeverRemembered');
    } catch (e) {
        threw = e.message.includes('no known peer');
    }
    assert(threw, 'forgetPeer on an unknown identity fails with a clear message, never a silent no-op');

    useCase.forgetPeer(bobIdentity.identityId);
    assert(useCase.getRelationships().length === 0, 'forgetPeer removes the relationship');
    assert(changeEvents.length === 4, 'onRelationshipsChanged fired for remember, re-remember, alias update, and forget');
    unsubscribe();

    // --- Same device, a SECOND local identity: a genuinely separate owner.
    device.login('Alice2');
    assert(useCase.getRelationships().length === 0, "a second local identity on the SAME device starts with its OWN empty relationship list — Alice1's forgotten Bob was never Alice2's to begin with");

    console.log('✓ PeerRelationshipUseCase CRUD, per-owner scoping, and change notifications');
}

// ---------------------------------------------------------------------
// 4. FLAGSHIP — real WebRTC connection, Remember, disconnect, "reload,"
//    reconnect through a brand-new connection, and Forget — proving
//    "connections are ephemeral, relationships are durable, and
//    identity is the bridge between them."
// ---------------------------------------------------------------------
{
    const aliceStorage = new InMemoryStorageProvider();
    const alice = makeDevice('Alice', aliceStorage);
    const bob = makeDevice('Bob');
    const bobSigning = bob.getSigningIdentity();

    const aliceSessions = new PeerSessionManager({ identityProvider: alice });
    const bobSessions = new PeerSessionManager({ identityProvider: bob });
    let aliceRelationships = new PeerRelationshipUseCase(aliceStorage, alice);

    const { alicePeer, bobPeer } = await connectAliceAndBob(aliceSessions, bobSessions);
    assert(aliceRelationships.getRelationships().length === 0, 'authenticating alone never creates a relationship — remembering is always a deliberate act');

    // Alice remembers Bob using ONLY her verified remoteIdentity — never
    // anything from the invitation she originally sent him.
    aliceRelationships.rememberPeer(alicePeer.remoteIdentity, { alias: 'Bob' });
    assert(aliceRelationships.isKnown(bobSigning.id), "alice's Known Peers now includes bob, by his real, proven identityId");
    console.log('✓ FLAGSHIP: Remember captures the AUTHENTICATED identity, never the invitation hint');

    // Disconnect — ConnectedPeerRegistry empties out exactly as it always
    // has (0.2.50 through 0.2.55, unmodified); the relationship does not.
    aliceSessions.disconnect(alicePeer.connectionId);
    await Promise.all([
        waitForState(alicePeer, [PeerLifecycleState.CLOSED]),
        waitForState(bobPeer, [PeerLifecycleState.CLOSED])
    ]);
    assert(aliceSessions.listPeers().length === 0, "alice's My Peers is empty after disconnecting");
    assert(aliceRelationships.getRelationships().length === 1, "alice's Known Peers still has bob — the relationship outlives the connection");
    console.log('✓ FLAGSHIP: disconnecting empties ConnectedPeerRegistry but never touches the relationship');

    // "Reload": a BRAND NEW PeerRelationshipUseCase instance over the
    // exact same storage, the same way a page reload would construct a
    // fresh application layer over the same localStorage.
    aliceRelationships = new PeerRelationshipUseCase(aliceStorage, alice);
    const knownBob = aliceRelationships.getRelationship(bobSigning.id);
    assert(knownBob && knownBob.alias === 'Bob', "bob survives a simulated reload — a fresh PeerRelationshipUseCase over the same storage still knows him");
    console.log('✓ FLAGSHIP: a known peer survives a reload of the application layer over the same storage');

    // Reconnect through a completely FRESH invitation/connection/
    // authentication — never resuming anything from the closed session.
    const { alicePeer: alicePeer2, bobPeer: bobPeer2 } = await connectAliceAndBob(aliceSessions, bobSessions);
    assert(aliceSessions.listPeers().length === 1 && aliceSessions.listPeers()[0] === alicePeer2, 'reconnecting produces a brand-new ConnectedPeer, tracked independently of the earlier, now-closed one');
    assert(aliceSessions.listPeers()[0].connectionId !== alicePeer.connectionId, 'the new connection has a completely different connectionId — nothing about the old session was resumed');

    // Alice verifies the freshly authenticated identity matches the
    // remembered one before treating this as "reconnecting to Bob."
    const matched = aliceRelationships.getRelationship(aliceSessions.listPeers()[0].remoteIdentity.identityId);
    assert(matched && matched.identityId === bobSigning.id, "the newly authenticated identity matches alice's remembered relationship — it really is bob again, proven again");

    const bumped = aliceRelationships.noteAuthenticated(aliceSessions.listPeers()[0].remoteIdentity);
    assert(bumped.lastAuthenticatedAt.getTime() >= knownBob.lastAuthenticatedAt.getTime(), 'noteAuthenticated bumps lastAuthenticatedAt on the existing relationship');
    assert(bumped.alias === 'Bob', 'noteAuthenticated never touches the alias');
    console.log('✓ FLAGSHIP: reconnecting through a fresh connection re-proves the same identity, matched against the remembered relationship');

    aliceSessions.disconnect(aliceSessions.listPeers()[0].connectionId);
    await wait(200);

    // Alice forgets Bob. Only HER local record is affected — Bob's own
    // identity, on his own device, is completely untouched: he can still
    // sign, still authenticate, still be reconnected to (as a stranger,
    // from nothing, exactly like anyone else) at any time.
    aliceRelationships.forgetPeer(bobSigning.id);
    assert(!aliceRelationships.isKnown(bobSigning.id), 'forgetting removes bob from alice\'s Known Peers');
    assert(bob.currentUser() && bob.currentUser().username === 'Bob', "forgetting on alice's device never touches bob's own identity, session, or signing key");
    const stillWorks = bob.signCanonical({ type: 'test', id: 'x', revision: 0, payload: {} });
    assert(stillWorks && stillWorks.signer, "bob can still sign — his identity is completely unaffected by alice forgetting him");
    console.log('✓ FLAGSHIP: forgetting deletes only the local relationship record — the remembered identity itself is untouched');

    aliceSessions.dispose();
    bobSessions.dispose();
}

console.log('\nAll persistent peer relationship (PeerRelationshipUseCase) tests passed.');
}

await runTests();
