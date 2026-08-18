import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerIdentity } from '../peer/PeerIdentity.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { PeerSessionManager } from '../application/PeerSessionManager.js';
import { PeerRelationshipUseCase } from '../application/PeerRelationshipUseCase.js';
import { FriendRelationshipUseCase } from '../application/FriendRelationshipUseCase.js';
import { FriendshipRecord } from '../core/FriendshipRecord.js';
import { FriendshipState, deriveFriendshipState } from '../core/FriendshipState.js';
import {
    FriendshipAction,
    toFriendshipAdvertisement,
    isValidFriendshipAdvertisement,
    getFriendshipSigningDescriptor
} from '../core/FriendshipAdvertisement.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';

// 0.2.57 — Decentralized Friend Relationships & Mutual Consent.
//
// "How can Alice and Bob become friends without a central server
// deciding that they are?" This file proves the answer end to end,
// over a REAL WebRTC connection (application/PeerSessionManager.js,
// 0.2.55, unmodified) — not a mock, matching this codebase's standing
// rule that a real transport is exercised with real code.
//
// The flagship proves the exact invariant the design doc asked for:
// friendship is mutual consent, proven by signatures, anchored to
// identity rather than to any one connection. Alice requests, Bob
// accepts, both independently derive FRIEND, the relationship survives
// disconnect and a simulated reload, reconnecting through a completely
// fresh WebRTC session still recognizes it, and a third identity
// (Charlie) cannot manufacture either half of it — not even by
// replaying Alice's own genuine, validly-signed request over his OWN
// connection.
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

async function connectPeers(inviterSessions, accepterSessions) {
    const { invitation, connectedPeer: inviterPeer } = await inviterSessions.createInvitation();
    const { connectedPeer: accepterPeer, reply } = await accepterSessions.acceptInvitation(JSON.stringify(invitation.toJSON()));
    await inviterSessions.completeConnection(inviterPeer.connectionId, reply);
    await Promise.all([
        waitForState(inviterPeer, [PeerLifecycleState.AUTHENTICATED]),
        waitForState(accepterPeer, [PeerLifecycleState.AUTHENTICATED])
    ]);
    return { inviterPeer, accepterPeer };
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. core/FriendshipRecord.js + core/FriendshipState.js — construction,
//    validation, immutability, and the derived state machine.
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const signing = alice.getSigningIdentity();
    const peerIdentity = new PeerIdentity({ identityId: signing.id, publicKey: signing.publicKey });

    const record = FriendshipRecord.fromPeerIdentity(peerIdentity);
    assert(record.identityId === signing.id, 'fromPeerIdentity carries the proven identityId');
    assert(record.status === FriendshipState.NONE, 'a fresh record with no actions starts NONE');

    let threw = false;
    try {
        new FriendshipRecord({ identityId: signing.id, publicKey: 'not-the-real-key-'.padEnd(64, '0') });
    } catch (e) {
        threw = true;
    }
    assert(threw, 'a forged identityId/publicKey pairing is rejected, exactly like PeerRelationship/PeerIdentity');

    const withRequest = record.withOutgoingAction({ action: FriendshipAction.REQUEST });
    assert(withRequest.status === FriendshipState.REQUESTED, 'one side sending REQUEST alone is REQUESTED, never FRIEND');
    assert(record.status === FriendshipState.NONE, 'withOutgoingAction returns a new instance, the original is untouched');

    const bothRequested = withRequest.withIncomingAction({ action: FriendshipAction.REQUEST });
    assert(bothRequested.status === FriendshipState.REQUESTED, 'simultaneous REQUEST from both sides is still REQUESTED — asking is not agreeing, even mutually');

    const mutual = withRequest.withIncomingAction({ action: FriendshipAction.ACCEPT });
    assert(mutual.status === FriendshipState.FRIEND, 'our REQUEST answered by their ACCEPT is FRIEND');

    const reversed = record.withIncomingAction({ action: FriendshipAction.REQUEST }).withOutgoingAction({ action: FriendshipAction.ACCEPT });
    assert(reversed.status === FriendshipState.FRIEND, 'their REQUEST answered by our ACCEPT is FRIEND too — symmetric regardless of who initiated');

    assert(deriveFriendshipState({}) === FriendshipState.NONE, 'deriveFriendshipState with nothing recorded is NONE');

    const roundTripped = FriendshipRecord.fromJSON(mutual.toJSON());
    assert(roundTripped.identityId === mutual.identityId && roundTripped.status === FriendshipState.FRIEND, 'round-trips through toJSON/fromJSON, including the derived status');

    console.log('✓ core/FriendshipRecord.js + core/FriendshipState.js: construction, validation, and the mutual-consent state machine');
}

// ---------------------------------------------------------------------
// 2. core/FriendshipAdvertisement.js — wire shape validation.
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice').getSigningIdentity();
    const bob = makeDevice('Bob').getSigningIdentity();

    const request = toFriendshipAdvertisement({ actorIdentity: alice.id, subjectIdentity: bob.id, action: FriendshipAction.REQUEST });
    assert(isValidFriendshipAdvertisement(request), 'a well-formed REQUEST advertisement validates');
    assert(request.sequence === 1, 'REQUEST always carries the fixed REQUEST sequence');

    const accept = toFriendshipAdvertisement({ actorIdentity: bob.id, subjectIdentity: alice.id, action: FriendshipAction.ACCEPT });
    assert(accept.sequence === 2, 'ACCEPT always carries the fixed ACCEPT sequence');

    assert(!isValidFriendshipAdvertisement({ ...request, actorIdentity: request.subjectIdentity, subjectIdentity: request.actorIdentity, action: 'REJECT' }), 'an unrecognized action is rejected — REQUEST/ACCEPT is a closed vocabulary');
    assert(!isValidFriendshipAdvertisement({ ...request, actorIdentity: request.subjectIdentity }), 'an advertisement addressed to itself (actor === subject) is rejected');
    assert(!isValidFriendshipAdvertisement({ ...request, sequence: 99 }), 'a sequence that does not match its action is rejected');
    assert(!isValidFriendshipAdvertisement(null), 'a missing advertisement is rejected');

    console.log('✓ core/FriendshipAdvertisement.js: wire shape validation');
}

// ---------------------------------------------------------------------
// 3. identity/LocalAuthorizationVerifier.js#verifyFriendshipAdvertisement
//    — the security boundary: REQUIRED signature, tamper detection,
//    and "the signer must BE the claimed actor."
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');
    const aliceSigning = alice.getSigningIdentity();
    const bobSigning = bob.getSigningIdentity();
    const verifier = new LocalAuthorizationVerifier();

    const advertisement = toFriendshipAdvertisement({ actorIdentity: aliceSigning.id, subjectIdentity: bobSigning.id, action: FriendshipAction.REQUEST });
    const signature = alice.signCanonical(getFriendshipSigningDescriptor(advertisement));
    const signed = { ...advertisement, signature: signature.toJSON() };

    assert(verifier.verifyFriendshipAdvertisement(signed).valid, 'a genuine, correctly signed advertisement verifies');

    const unsigned = verifier.verifyFriendshipAdvertisement(advertisement);
    assert(!unsigned.valid && !unsigned.signed, 'an unsigned friendship advertisement is NEVER tolerated, unlike presence/profile/interaction');

    const tamperedAction = { ...signed, action: FriendshipAction.ACCEPT, sequence: 2 };
    assert(!verifier.verifyFriendshipAdvertisement(tamperedAction).valid, 'changing the action after signing (REQUEST -> ACCEPT) invalidates the signature');

    const tamperedSubject = { ...signed, subjectIdentity: aliceSigning.id };
    assert(!verifier.verifyFriendshipAdvertisement(tamperedSubject).valid, 'changing the subject after signing invalidates the signature');

    // Bob cannot forge a signature claiming to be an action Alice
    // performed — he can only ever validly sign as HIMSELF.
    const forgedDescriptor = getFriendshipSigningDescriptor(advertisement); // still claims actorIdentity = alice
    const bobsSignatureOverAlicesClaim = bob.signCanonical(forgedDescriptor);
    const forged = { ...advertisement, signature: bobsSignatureOverAlicesClaim.toJSON() };
    const forgedResult = verifier.verifyFriendshipAdvertisement(forged);
    assert(!forgedResult.valid && forgedResult.reason.includes('actorIdentity'), 'a signature whose real signer does not match the claimed actorIdentity is rejected outright');

    console.log('✓ identity/LocalAuthorizationVerifier.js#verifyFriendshipAdvertisement: required signature, tamper detection, actor/signer binding');
}

// ---------------------------------------------------------------------
// 4. application/FriendRelationshipUseCase.js — the local security
//    boundary: only a currently AUTHENTICATED connection may send or
//    accept, and acceptance requires a genuinely pending request.
// ---------------------------------------------------------------------
{
    const alice = makeDevice('Alice');
    const bobSigning = makeDevice('Bob').getSigningIdentity();
    const fakeBus = { send() {}, subscribe() { return () => {}; }, attach() {} };
    const fakeRegistry = { list() { return []; }, onChange() { return () => {}; } };
    const useCase = new FriendRelationshipUseCase(new InMemoryStorageProvider(), alice, {
        peerMessageBus: fakeBus,
        connectedPeerRegistry: fakeRegistry
    });

    let threw = false;
    try {
        useCase.sendFriendRequest(null);
    } catch (e) {
        threw = e.message.includes('ConnectedPeer is required');
    }
    assert(threw, 'sendFriendRequest refuses without a ConnectedPeer');

    const notYetAuthenticated = { getLifecycleState: () => PeerLifecycleState.CONNECTING, remoteIdentity: null };
    threw = false;
    try {
        useCase.sendFriendRequest(notYetAuthenticated);
    } catch (e) {
        threw = e.message.includes('authenticated connection');
    }
    assert(threw, 'sendFriendRequest refuses a connection that has not yet authenticated');

    threw = false;
    try {
        useCase.acceptFriendRequest(notYetAuthenticated);
    } catch (e) {
        threw = e.message.includes('authenticated connection');
    }
    assert(threw, 'acceptFriendRequest refuses a connection that has not yet authenticated');

    const authenticatedBob = {
        getLifecycleState: () => PeerLifecycleState.AUTHENTICATED,
        remoteIdentity: new PeerIdentity({ identityId: bobSigning.id, publicKey: bobSigning.publicKey })
    };
    threw = false;
    try {
        useCase.acceptFriendRequest(authenticatedBob);
    } catch (e) {
        threw = e.message.includes('no pending friend request');
    }
    assert(threw, 'acceptFriendRequest refuses when there is no pending incoming request — friendship is never manufactured out of nothing');

    console.log('✓ FriendRelationshipUseCase: refuses to send/accept without a real, currently authenticated connection, or accept with no pending request');
}

// ---------------------------------------------------------------------
// 5. FLAGSHIP — real WebRTC, mutual consent, persistence across
//    disconnect/reload/reconnect, and impersonation resistance.
// ---------------------------------------------------------------------
{
    const aliceStorage = new InMemoryStorageProvider();
    const bobStorage = new InMemoryStorageProvider();
    const alice = makeDevice('Alice', aliceStorage);
    const bob = makeDevice('Bob', bobStorage);
    const charlie = makeDevice('Charlie');
    const aliceSigning = alice.getSigningIdentity();
    const bobSigning = bob.getSigningIdentity();

    const aliceSessions = new PeerSessionManager({ identityProvider: alice });
    const bobSessions = new PeerSessionManager({ identityProvider: bob });
    const charlieSessions = new PeerSessionManager({ identityProvider: charlie });

    // 1. Alice and Bob establish an authenticated WebRTC connection.
    let { inviterPeer: alicePeer, accepterPeer: bobPeer } = await connectPeers(aliceSessions, bobSessions);

    let aliceFriends = new FriendRelationshipUseCase(aliceStorage, alice, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: aliceSessions.registry
    });
    let bobFriends = new FriendRelationshipUseCase(bobStorage, bob, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: bobSessions.registry
    });

    assert(aliceFriends.getState(bobSigning.id) === FriendshipState.NONE, 'no relationship exists before any request');

    // 2. Alice sends Bob a friend request.
    aliceFriends.sendFriendRequest(alicePeer);
    assert(aliceFriends.getState(bobSigning.id) === FriendshipState.REQUESTED, "alice's own record shows REQUESTED the moment she sends it");
    console.log('✓ FLAGSHIP: Alice sends Bob a signed friend request over a real, authenticated WebRTC connection');

    await wait(300);

    // 3/4. Bob receives it; his UI would show a pending request.
    assert(bobFriends.getState(aliceSigning.id) === FriendshipState.REQUESTED, "bob's record shows the pending incoming request");
    const bobPendingRecord = bobFriends.getRelationship(aliceSigning.id);
    assert(bobPendingRecord.incomingAction && bobPendingRecord.incomingAction.action === FriendshipAction.REQUEST, 'bob holds the actual signed REQUEST as evidence, not merely a boolean flag');
    console.log('✓ FLAGSHIP: Bob receives and verifies the signed request, sees it as pending');

    // 5. Bob accepts.
    bobFriends.acceptFriendRequest(bobPeer);
    assert(bobFriends.getState(aliceSigning.id) === FriendshipState.FRIEND, 'bob independently derives FRIEND the instant he accepts');
    console.log('✓ FLAGSHIP: Bob accepts');

    await wait(300);

    // 6/7. Alice receives Bob's signed acceptance.
    assert(aliceFriends.getState(bobSigning.id) === FriendshipState.FRIEND, "alice independently derives FRIEND once bob's signed acceptance arrives");
    console.log('✓ FLAGSHIP: Alice receives the signed acceptance — both devices independently derive FRIEND, mutual consent proven with no server involved');

    // Friendship never implies Known Peer — the two are genuinely
    // independent concepts (see docs/Principles.md, "Friendship Is
    // Mutual Consent, Never A Unilateral Claim"). Nobody clicked
    // "Remember," so PeerRelationshipUseCase stays completely empty.
    const aliceRelationships = new PeerRelationshipUseCase(aliceStorage, alice);
    assert(aliceRelationships.getRelationships().length === 0, "becoming friends never creates a PeerRelationship — it is a completely separate, independently-triggered concept");

    // 8/9. Disconnect both.
    aliceSessions.disconnect(alicePeer.connectionId);
    bobSessions.disconnect(bobPeer.connectionId);
    await Promise.all([
        waitForState(alicePeer, [PeerLifecycleState.CLOSED]),
        waitForState(bobPeer, [PeerLifecycleState.CLOSED])
    ]);
    aliceFriends.dispose();
    bobFriends.dispose();

    // 10. "Reload": brand-new FriendRelationshipUseCase instances (and
    // brand-new PeerMessageBus instances) over the exact same storage —
    // simulating a page reload.
    aliceFriends = new FriendRelationshipUseCase(aliceStorage, alice, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: aliceSessions.registry
    });
    bobFriends = new FriendRelationshipUseCase(bobStorage, bob, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: bobSessions.registry
    });

    // 11. Friendship remains.
    assert(aliceFriends.getState(bobSigning.id) === FriendshipState.FRIEND, "alice's friendship with bob survives disconnect and a simulated reload");
    assert(bobFriends.getState(aliceSigning.id) === FriendshipState.FRIEND, "bob's friendship with alice survives disconnect and a simulated reload");
    console.log('✓ FLAGSHIP: friendship is a durable relationship between identities — it survives disconnect and a simulated reload of the application layer');

    // 12/13/14. Reconnect through a COMPLETELY fresh invitation/
    // connection/authentication — nothing resumed from the earlier,
    // now-closed session.
    const { inviterPeer: alicePeer2, accepterPeer: bobPeer2 } = await connectPeers(aliceSessions, bobSessions);
    assert(alicePeer2.connectionId !== alicePeer.connectionId, 'reconnecting produces a brand-new connectionId — nothing about the old session was resumed');
    assert(aliceFriends.getState(alicePeer2.remoteIdentity.identityId) === FriendshipState.FRIEND, 'the freshly, independently re-proven identity is still recognized as a friend — friendship is a property of the IDENTITY, never the connection');
    console.log('✓ FLAGSHIP: mutual authentication succeeds again over a fresh connection; friendship is recognized from the persisted identities, not the old connection');

    // 15. Charlie cannot manufacture either half of the relationship.
    //
    // First: Charlie cannot forge Alice's signature outright — proven
    // directly in test 3 above (a signature whose real signer isn't
    // the claimed actorIdentity is rejected). Second, and more subtly:
    // Charlie cannot even REPLAY a genuine, validly-signed advertisement
    // Alice actually produced, by relaying it over HIS OWN connection —
    // the ingestion boundary binds the claimed actor to the specific,
    // already-authenticated connection the message arrived on, never
    // merely to what the payload itself claims.
    const { inviterPeer: charliePeer } = await connectPeers(charlieSessions, bobSessions);
    await wait(200);

    const bobRecordBeforeReplay = bobFriends.getRelationship(aliceSigning.id);
    const replayedAdvertisement = toFriendshipAdvertisement({ actorIdentity: aliceSigning.id, subjectIdentity: bobSigning.id, action: FriendshipAction.REQUEST });
    const replaySignature = alice.signCanonical(getFriendshipSigningDescriptor(replayedAdvertisement));
    const replayed = { ...replayedAdvertisement, signature: replaySignature.toJSON() };
    assert(new LocalAuthorizationVerifier().verifyFriendshipAdvertisement(replayed).valid, 'sanity check: the captured advertisement genuinely, validly verifies on its own');

    const charlieBus = new PeerMessageBus();
    charlieBus.attach(charliePeer);
    charlieBus.send(charliePeer, FriendRelationshipUseCase.DEFAULT_PROTOCOL, replayed);
    await wait(300);

    const bobRecordAfterReplay = bobFriends.getRelationship(aliceSigning.id);
    assert(
        JSON.stringify(bobRecordAfterReplay.toJSON()) === JSON.stringify(bobRecordBeforeReplay.toJSON()),
        "Charlie relaying Alice's own genuine, validly-signed request over HIS connection changes nothing on bob's device — the actor must match the AUTHENTICATED connection it actually arrived on, never merely what the payload claims"
    );
    console.log('✓ FLAGSHIP: Charlie cannot manufacture or replay either half of the relationship, even with a captured genuine signature');

    aliceSessions.dispose();
    bobSessions.dispose();
    charlieSessions.dispose();
}

console.log('\nAll decentralized friend relationship (FriendRelationshipUseCase) tests passed.');
}

await runTests();
