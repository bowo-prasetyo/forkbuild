import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerIdentity } from '../peer/PeerIdentity.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { FriendRelationshipUseCase } from '../application/FriendRelationshipUseCase.js';
import { FriendshipState } from '../core/FriendshipState.js';
import { FriendshipRecord } from '../core/FriendshipRecord.js';
import {
    FriendshipAction,
    isTerminalFriendshipAction,
    FRIENDSHIP_ACTION_SEQUENCE
} from '../core/FriendshipAction.js';
import {
    toFriendshipAdvertisement,
    isValidFriendshipAdvertisement,
    getFriendshipSigningDescriptor
} from '../core/FriendshipAdvertisement.js';
import { LocalAuthorizationVerifier } from '../identity/LocalAuthorizationVerifier.js';
import { PeerBlockRecord } from '../core/PeerBlockRecord.js';
import { PeerBlockUseCase } from '../application/PeerBlockUseCase.js';
import { PresenceTrustBoundary } from '../application/PresenceTrustBoundary.js';
import { AvatarProfileTrustBoundary } from '../application/AvatarProfileTrustBoundary.js';
import { AvatarInteractionTrustBoundary } from '../application/AvatarInteractionTrustBoundary.js';
import { PeerAvatarPresenceBroadcastProvider } from '../presence/PeerAvatarPresenceBroadcastProvider.js';
import { AvatarProfileUseCase } from '../application/AvatarProfileUseCase.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { AvatarTemplateRegistry } from '../core/AvatarTemplateRegistry.js';
import { CoreAvatarTemplateLibrary } from '../core/library/CoreAvatarTemplateLibrary.js';
import { toAvatarPresenceAdvertisement } from '../core/AvatarPresenceAdvertisement.js';
import { signAvatarPresenceAdvertisement } from '../application/PresenceSigning.js';
import { toAvatarProfileAdvertisement } from '../core/AvatarProfileAdvertisement.js';
import { signAvatarProfileAdvertisement } from '../application/AvatarProfileSigning.js';
import { toAvatarInteractionAdvertisement } from '../core/AvatarInteractionAdvertisement.js';
import { signAvatarInteractionAdvertisement } from '../application/AvatarInteractionSigning.js';
import { AvatarInteractionKind } from '../core/AvatarInteractionKind.js';
import { TrustStatus } from '../core/TrustObservation.js';
import { PresenceVisibilityPolicy } from '../core/PresenceVisibilityPolicy.js';

// 0.2.60 — Friendship Revocation, Blocking & Privacy Withdrawal.
//
// "Friendship can be created, but it cannot yet end" — 0.2.57's own
// header named this gap explicitly and declined to close it. This file
// proves the close:
//
//   - REJECT/CANCEL/UNFRIEND: a signed, closed vocabulary extension,
//     each one collapsing a FriendshipRecord straight back to a clean
//     NONE (core/FriendshipRecord.js#withOutgoingAction/withIncomingAction),
//     and each one bound via `inResponseTo` to the SPECIFIC REQUEST
//     instance it answers/ends — proven directly against the exact
//     replay this milestone's own cyclic vocabulary would otherwise
//     reopen (see core/FriendshipAdvertisement.js's own header).
//   - Blocking: a completely separate, LOCAL-ONLY, unilateral store
//     (core/PeerBlockRecord.js/application/PeerBlockUseCase.js) that
//     never sends anything over the network, gating BOTH the sender
//     side (presence/PeerAvatarPresenceBroadcastProvider.js's own
//     isBlocked) and the receiver side (every avatar-social trust
//     boundary's own isBlocked) independently, plus the friendship
//     protocol itself (application/FriendRelationshipUseCase.js).
//
// Deliberately built over peer/LocalPeerConnectionProvider.js (a real,
// in-process, bidirectional transport — see that file's own header)
// rather than a real RTCPeerConnection: this file exercises exactly the
// same authenticated-connection, signed-protocol pipeline
// tests/FriendRelationships.test.js's own flagship does, at the exact
// same rigor, over the transport every other in-process flagship in
// this suite (tests/PeerAvatarSocialTransport.test.js included) already
// trusts for that purpose.

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

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeDevice(label, storage = new InMemoryStorageProvider()) {
    const provider = new LocalIdentityProvider(storage);
    provider.login(label);
    return { storage, provider };
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. core/FriendshipAction.js + core/FriendshipAdvertisement.js — the
//    extended vocabulary and its inResponseTo binding.
// ---------------------------------------------------------------------
{
    assert(isTerminalFriendshipAction(FriendshipAction.REJECT), 'REJECT is terminal');
    assert(isTerminalFriendshipAction(FriendshipAction.CANCEL), 'CANCEL is terminal');
    assert(isTerminalFriendshipAction(FriendshipAction.UNFRIEND), 'UNFRIEND is terminal');
    assert(!isTerminalFriendshipAction(FriendshipAction.REQUEST), 'REQUEST is never terminal');
    assert(!isTerminalFriendshipAction(FriendshipAction.ACCEPT), 'ACCEPT is never terminal');
    assert(FRIENDSHIP_ACTION_SEQUENCE[FriendshipAction.REQUEST] === 1 && FRIENDSHIP_ACTION_SEQUENCE[FriendshipAction.ACCEPT] === 2,
        "0.2.57's own REQUEST/ACCEPT sequence numbers are unchanged");

    const alice = makeDevice('Alice').provider.getSigningIdentity();
    const bob = makeDevice('Bob').provider.getSigningIdentity();

    const request = toFriendshipAdvertisement({ actorIdentity: alice.id, subjectIdentity: bob.id, action: FriendshipAction.REQUEST });
    assert(isValidFriendshipAdvertisement(request), 'a REQUEST with no inResponseTo validates');
    assert(request.inResponseTo === null, 'toFriendshipAdvertisement defaults inResponseTo to null');

    const requestWithReference = { ...request, inResponseTo: 'some-signature' };
    assert(!isValidFriendshipAdvertisement(requestWithReference), 'a REQUEST carrying an inResponseTo is invalid — REQUEST opens a cycle, it never answers one');

    const acceptNoReference = toFriendshipAdvertisement({ actorIdentity: bob.id, subjectIdentity: alice.id, action: FriendshipAction.ACCEPT });
    assert(!isValidFriendshipAdvertisement(acceptNoReference), 'an ACCEPT with no inResponseTo is invalid — it must reference the REQUEST it answers');

    const accept = toFriendshipAdvertisement({ actorIdentity: bob.id, subjectIdentity: alice.id, action: FriendshipAction.ACCEPT, inResponseTo: 'req-sig' });
    assert(isValidFriendshipAdvertisement(accept), 'an ACCEPT with a non-empty inResponseTo validates');

    for (const action of [FriendshipAction.REJECT, FriendshipAction.CANCEL, FriendshipAction.UNFRIEND]) {
        const noRef = toFriendshipAdvertisement({ actorIdentity: bob.id, subjectIdentity: alice.id, action });
        assert(!isValidFriendshipAdvertisement(noRef), `${action} with no inResponseTo is invalid`);
        const withRef = toFriendshipAdvertisement({ actorIdentity: bob.id, subjectIdentity: alice.id, action, inResponseTo: 'req-sig' });
        assert(isValidFriendshipAdvertisement(withRef), `${action} with a non-empty inResponseTo validates`);
    }

    // inResponseTo is COVERED by the signature — tampering it after
    // signing invalidates, exactly like actor/subject/action already do.
    const verifier = new LocalAuthorizationVerifier();
    const aliceDevice = makeDevice('Alice2');
    const aliceSigning = aliceDevice.provider.getSigningIdentity();
    const bobId = makeDevice('Bob2').provider.getSigningIdentity().id;
    const genuineRequest = toFriendshipAdvertisement({ actorIdentity: aliceSigning.id, subjectIdentity: bobId, action: FriendshipAction.REQUEST });
    const genuineSignature = aliceDevice.provider.signCanonical(getFriendshipSigningDescriptor(genuineRequest));
    const signedRequest = { ...genuineRequest, signature: genuineSignature.toJSON() };
    assert(verifier.verifyFriendshipAdvertisement(signedRequest).valid, 'sanity: genuine signed REQUEST verifies');
    const tamperedInResponseTo = { ...signedRequest, inResponseTo: 'forged' };
    assert(!verifier.verifyFriendshipAdvertisement(tamperedInResponseTo).valid, 'tampering inResponseTo after signing invalidates the signature');

    console.log('✓ core/FriendshipAction.js + core/FriendshipAdvertisement.js: REJECT/CANCEL/UNFRIEND vocabulary and inResponseTo binding');
}

// ---------------------------------------------------------------------
// 2. core/FriendshipRecord.js + core/FriendshipState.js — terminal
//    actions collapse BOTH directions to a clean NONE.
// ---------------------------------------------------------------------
{
    const signing = makeDevice('Alice3').provider.getSigningIdentity();
    const peerIdentity = new PeerIdentity({ identityId: signing.id, publicKey: signing.publicKey });
    const record = FriendshipRecord.fromPeerIdentity(peerIdentity);

    const requested = record.withOutgoingAction({ action: FriendshipAction.REQUEST });
    const friended = requested.withIncomingAction({ action: FriendshipAction.ACCEPT });
    assert(friended.status === FriendshipState.FRIEND, 'sanity: REQUEST + ACCEPT is FRIEND');

    const unfriended = friended.withOutgoingAction({ action: FriendshipAction.UNFRIEND });
    assert(unfriended.status === FriendshipState.NONE, 'recording UNFRIEND collapses to NONE');
    assert(unfriended.outgoingAction === null && unfriended.incomingAction === null,
        'UNFRIEND clears BOTH directions, not just the one it was recorded on — no stale evidence survives for a future cycle');

    const rejectedFromIncoming = requested.withIncomingAction({ action: FriendshipAction.REJECT });
    assert(rejectedFromIncoming.status === FriendshipState.NONE, 'recording an incoming REJECT collapses to NONE');
    assert(rejectedFromIncoming.outgoingAction === null, 'REJECT clears the OTHER direction too (our own pending outgoing REQUEST)');

    const cancelledFromOutgoing = requested.withOutgoingAction({ action: FriendshipAction.CANCEL });
    assert(cancelledFromOutgoing.status === FriendshipState.NONE, 'recording our own CANCEL collapses to NONE');

    // A relationship can cycle: NONE -> REQUESTED -> FRIEND -> NONE ->
    // REQUESTED again, exactly like two identities who never knew each
    // other — nothing lingers.
    const requestedAgain = unfriended.withOutgoingAction({ action: FriendshipAction.REQUEST });
    assert(requestedAgain.status === FriendshipState.REQUESTED, 'a fresh REQUEST after UNFRIEND starts a clean new cycle at REQUESTED');

    console.log('✓ core/FriendshipRecord.js: terminal actions collapse both directions; a relationship can cycle cleanly');
}

// ---------------------------------------------------------------------
// 3. core/PeerBlockRecord.js + application/PeerBlockUseCase.js — the
//    local-only, unilateral block store.
// ---------------------------------------------------------------------
{
    const alice = makeDevice('AliceBlocker');
    const bobSigning = makeDevice('BobBlocked').provider.getSigningIdentity();
    const bobIdentity = new PeerIdentity({ identityId: bobSigning.id, publicKey: bobSigning.publicKey });

    let threw = false;
    try {
        new PeerBlockRecord({ identityId: bobSigning.id, publicKey: 'not-the-real-key-'.padEnd(64, '0') });
    } catch { threw = true; }
    assert(threw, 'a forged identityId/publicKey pairing is rejected, same self-consistency guarantee as PeerRelationship/FriendshipRecord');

    const storage = new InMemoryStorageProvider();
    const blocks = new PeerBlockUseCase(storage, alice.provider);
    assert(blocks.getBlocked().length === 0, 'nobody is blocked yet');
    assert(!blocks.isBlocked(bobSigning.id), 'isBlocked is false for an unblocked identity');

    let changeEvents = [];
    const unsubscribe = blocks.onBlockedChanged((list) => changeEvents.push(list));

    const record = blocks.block(bobIdentity);
    assert(record.identityId === bobSigning.id, 'block() returns the new PeerBlockRecord');
    assert(blocks.isBlocked(bobSigning.id), 'isBlocked is true immediately after block()');
    assert(changeEvents.length === 1 && changeEvents[0].length === 1, 'onBlockedChanged fires with the full current list');

    const again = blocks.block(bobIdentity);
    assert(again.identityId === record.identityId, 'blocking an already-blocked identity is idempotent, never a second record');
    assert(blocks.getBlocked().length === 1, 'still exactly one block record');

    // Persistence across a simulated reload.
    const reloaded = new PeerBlockUseCase(storage, alice.provider);
    assert(reloaded.isBlocked(bobSigning.id), 'a block survives a simulated reload (fresh instance, same storage)');

    reloaded.unblock(bobSigning.id);
    assert(!reloaded.isBlocked(bobSigning.id), 'unblock() removes the block');
    assert(!blocks.isBlocked(bobSigning.id), '...visible immediately to every instance sharing the same storage/owner');

    threw = false;
    try { reloaded.unblock(bobSigning.id); } catch (e) { threw = e.message.includes('not blocked'); }
    assert(threw, 'unblocking an identity that is not blocked is a clear error, never silent');

    unsubscribe();
    console.log('✓ core/PeerBlockRecord.js + application/PeerBlockUseCase.js: local-only, idempotent, persistent, never touches the network');
}

// ---------------------------------------------------------------------
// FLAGSHIP A — Reject, Cancel, Unfriend, and the inResponseTo replay
// protection a cyclic vocabulary specifically requires.
// ---------------------------------------------------------------------
{
    const aliceStorage = new InMemoryStorageProvider();
    const bobStorage = new InMemoryStorageProvider();
    const alice = makeDevice('FlagAAlice', aliceStorage).provider;
    const bob = makeDevice('FlagABob', bobStorage).provider;
    const aliceId = alice.getSigningIdentity().id;
    const bobId = bob.getSigningIdentity().id;

    const network = new LocalPeerNetwork();
    const aliceTransport = new LocalPeerConnectionProvider('alice', network);
    const bobTransport = new LocalPeerConnectionProvider('bob', network);
    const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
    const stopBobListening = bobConnect.listen();
    const alicePeer = aliceConnect.connect({ candidateEndpoint: 'bob' });
    await wait(30);
    assert(alicePeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: Alice-Bob authenticates');
    const bobPeer = bobConnect.registry.list()[0];

    const aliceFriends = new FriendRelationshipUseCase(aliceStorage, alice, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aliceConnect.registry });
    const bobFriends = new FriendRelationshipUseCase(bobStorage, bob, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: bobConnect.registry });

    // --- CANCEL: Alice withdraws her own pending request. ---
    aliceFriends.sendFriendRequest(alicePeer);
    assert(aliceFriends.getState(bobId) === FriendshipState.REQUESTED, 'Alice requested');
    await wait(30);
    assert(bobFriends.getState(aliceId) === FriendshipState.REQUESTED, 'Bob sees the pending request');
    aliceFriends.cancelFriendRequest(alicePeer);
    assert(aliceFriends.getState(bobId) === FriendshipState.NONE, 'Alice cancelling collapses her own record to NONE');
    await wait(30);
    assert(bobFriends.getState(aliceId) === FriendshipState.NONE, "Bob's record independently collapses to NONE once the signed CANCEL arrives");
    let threw = false;
    try { bobFriends.acceptFriendRequest(bobPeer); } catch (e) { threw = e.message.includes('no pending'); }
    assert(threw, 'Bob can no longer accept a cancelled request — there is nothing left pending');
    console.log('✓ FLAGSHIP A: CANCEL withdraws a pending request on both devices');

    // --- REJECT: fresh cycle, Bob declines this time. ---
    aliceFriends.sendFriendRequest(alicePeer);
    await wait(30);
    bobFriends.rejectFriendRequest(bobPeer);
    assert(bobFriends.getState(aliceId) === FriendshipState.NONE, 'Bob rejecting collapses his own record to NONE');
    await wait(30);
    assert(aliceFriends.getState(bobId) === FriendshipState.NONE, "Alice's record independently collapses to NONE once the signed REJECT arrives");
    console.log('✓ FLAGSHIP A: REJECT declines a pending request on both devices, and a rejection is never permanent (a fresh request can follow)');

    // --- UNFRIEND, and the replay attack it specifically has to resist. ---
    aliceFriends.sendFriendRequest(alicePeer);
    await wait(30);
    bobFriends.acceptFriendRequest(bobPeer);
    await wait(30);
    assert(aliceFriends.getState(bobId) === FriendshipState.FRIEND && bobFriends.getState(aliceId) === FriendshipState.FRIEND,
        'setup: genuinely FRIEND on both sides (cycle 1)');
    const cycle1AcceptCaptured = bobFriends.getRelationship(aliceId).outgoingAction;

    aliceFriends.unfriend(alicePeer);
    assert(aliceFriends.getState(bobId) === FriendshipState.NONE, "Alice's UNFRIEND collapses her own record");
    await wait(30);
    assert(bobFriends.getState(aliceId) === FriendshipState.NONE, "Bob's record independently collapses once the signed UNFRIEND arrives");
    console.log('✓ FLAGSHIP A: UNFRIEND ends a FRIEND relationship on both devices');

    // Cycle 2: Alice requests again.
    aliceFriends.sendFriendRequest(alicePeer);
    assert(aliceFriends.getState(bobId) === FriendshipState.REQUESTED, "Alice's fresh cycle-2 request is REQUESTED, never silently FRIEND from stale cycle-1 evidence");
    await wait(30);
    assert(bobFriends.getState(aliceId) === FriendshipState.REQUESTED, "Bob's record shows a genuine new pending request, not leftover cycle-1 state");

    // The attack: replay Bob's captured, genuinely-valid cycle-1 ACCEPT
    // directly onto Alice's connection, attempting to short-circuit
    // cycle 2's consent. Without inResponseTo binding this would
    // silently manufacture FRIEND — see core/FriendshipAdvertisement.js's
    // own header.
    const rawBusIntoAlice = new PeerMessageBus();
    rawBusIntoAlice.attach(bobPeer);
    rawBusIntoAlice.send(bobPeer, FriendRelationshipUseCase.DEFAULT_PROTOCOL, cycle1AcceptCaptured);
    await wait(30);
    assert(aliceFriends.getState(bobId) === FriendshipState.REQUESTED,
        "REPLAY DEFEATED: Bob's genuine, validly-signed cycle-1 ACCEPT does NOT satisfy Alice's fresh cycle-2 REQUEST — inResponseTo referenced cycle 1's REQUEST, not cycle 2's");
    console.log("✓ FLAGSHIP A: a captured, genuinely-valid ACCEPT from an ENDED cycle cannot be replayed to manufacture consent in a NEW cycle");

    // And a REAL, fresh accept still works normally.
    bobFriends.acceptFriendRequest(bobPeer);
    await wait(30);
    assert(aliceFriends.getState(bobId) === FriendshipState.FRIEND && bobFriends.getState(aliceId) === FriendshipState.FRIEND,
        'a genuine fresh cycle-2 ACCEPT still establishes FRIEND normally');
    console.log('✓ FLAGSHIP A: a genuine fresh ACCEPT in the new cycle still works');

    stopBobListening();
    aliceFriends.dispose();
    bobFriends.dispose();
    aliceTransport.dispose();
    bobTransport.dispose();
}

// ---------------------------------------------------------------------
// FLAGSHIP B — Blocking: sender gate, receiver gate, friendship-protocol
// gate, persistence, and FRIEND+BLOCKED coexistence.
// ---------------------------------------------------------------------
{
    const registry = new AvatarTemplateRegistry();
    registry.register(CoreAvatarTemplateLibrary);

    const aliceStorage = new InMemoryStorageProvider();
    const bobStorage = new InMemoryStorageProvider();
    const alice = makeDevice('FlagBAlice', aliceStorage).provider;
    const bob = makeDevice('FlagBBob', bobStorage).provider;
    const aliceId = alice.getSigningIdentity().id;
    const bobId = bob.getSigningIdentity().id;

    const network = new LocalPeerNetwork();
    const aliceTransport = new LocalPeerConnectionProvider('alice', network);
    const bobTransport = new LocalPeerConnectionProvider('bob', network);
    const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
    const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
    const stopBobListening = bobConnect.listen();
    const alicePeer = aliceConnect.connect({ candidateEndpoint: 'bob' });
    await wait(30);
    assert(alicePeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'setup: Alice-Bob authenticates');
    const bobPeer = bobConnect.registry.list()[0];

    // Alice and Bob become real, mutual friends first — the flagship
    // scenario the design explicitly asks for: block a CURRENT friend.
    const aliceFriends = new FriendRelationshipUseCase(aliceStorage, alice, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aliceConnect.registry });
    const bobFriends = new FriendRelationshipUseCase(bobStorage, bob, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: bobConnect.registry });
    aliceFriends.sendFriendRequest(alicePeer);
    await wait(30);
    bobFriends.acceptFriendRequest(bobPeer);
    await wait(30);
    assert(aliceFriends.getState(bobId) === FriendshipState.FRIEND, 'setup: genuinely FRIEND');

    const aliceBlocks = new PeerBlockUseCase(aliceStorage, alice);
    const aliceIsBlocked = (identityId) => aliceBlocks.isBlocked(identityId);

    // --- Sender-side gate: Alice's OWN outbound presence transport. ---
    const aliceBus = new PeerMessageBus();
    const bobBus = new PeerMessageBus();
    const alicePresenceOut = new PeerAvatarPresenceBroadcastProvider({
        peerMessageBus: aliceBus, connectedPeerRegistry: aliceConnect.registry,
        getVisibilityPolicy: () => PresenceVisibilityPolicy.default(), isBlocked: aliceIsBlocked
    });
    const bobPresenceIn = new PeerAvatarPresenceBroadcastProvider({ peerMessageBus: bobBus, connectedPeerRegistry: bobConnect.registry });
    let bobReceived = [];
    bobPresenceIn.onAdvertisement((advertisement) => bobReceived.push(advertisement));

    const aliceAvatarProfileUseCase = new AvatarProfileUseCase(aliceStorage, alice, registry);
    const aliceProfile = aliceAvatarProfileUseCase.getProfile();
    const alicePresenceSession = new AvatarPresenceSession(aliceProfile, { position: { x: 0, y: 0, z: 0 } });

    function publishAlicePresence() {
        alicePresenceSession.update({ position: { x: Math.random() * 10, y: 0, z: 0 } });
        const advertisement = toAvatarPresenceAdvertisement(alicePresenceSession.current);
        alicePresenceOut.advertise(signAvatarPresenceAdvertisement(advertisement, alice));
    }

    publishAlicePresence();
    await wait(30);
    assert(bobReceived.length === 1, 'before blocking: Bob receives Alice\'s presence normally (PUBLIC default, real friend)');

    aliceBlocks.block(alicePeer.remoteIdentity); // Alice blocks Bob's identity (alicePeer.remoteIdentity is Bob, from Alice's own connection)
    assert(aliceBlocks.isBlocked(bobId), 'sanity: Bob is now blocked');

    publishAlicePresence();
    await wait(30);
    assert(bobReceived.length === 1, "SENDER GATE: after blocking, Alice's own outbound transport never sends Bob another presence update, even though he is still a FRIEND and PUBLIC would otherwise allow it");
    console.log('✓ FLAGSHIP B: sender-side gate — a blocked peer receives nothing further, overriding an otherwise-permissive visibility policy');

    // --- Receiver-side gate: Bob (unaware, not blocked by his own
    // device) keeps sending; Alice's trust boundary must independently
    // reject him regardless of how the message arrived. ---
    const aliceProfileTrust = new AvatarProfileTrustBoundary({ isBlocked: aliceIsBlocked });
    const aliceInteractionTrust = new AvatarInteractionTrustBoundary({ isBlocked: aliceIsBlocked });
    const alicePresenceTrust = new PresenceTrustBoundary({ isBlocked: aliceIsBlocked });

    const bobAvatarProfileUseCase = new AvatarProfileUseCase(bobStorage, bob, registry);
    const bobProfile = bobAvatarProfileUseCase.getProfile();
    const bobPresenceSession = new AvatarPresenceSession(bobProfile, { position: { x: 1, y: 0, z: 1 } });
    bobPresenceSession.update({ position: { x: 2, y: 0, z: 2 } });
    const bobAdvertisement = signAvatarPresenceAdvertisement(toAvatarPresenceAdvertisement(bobPresenceSession.current), bob);

    // Sanity: the SAME advertisement is accepted by a trust boundary
    // that has NOT blocked Bob.
    const neutralResult = new PresenceTrustBoundary().evaluate(bobAdvertisement, null);
    assert(neutralResult.accepted, "sanity: Bob's genuinely valid presence is accepted by an unrelated (non-blocking) replica");

    const blockedResult = alicePresenceTrust.evaluate(bobAdvertisement, null);
    assert(!blockedResult.accepted, "RECEIVER GATE: Alice's own trust boundary rejects Bob's presence — cryptographically valid, but locally blocked");
    assert(blockedResult.observation.status === TrustStatus.BLOCKED, 'rejected specifically as TrustStatus.BLOCKED, not merely UNAUTHORIZED');
    console.log("✓ FLAGSHIP B: receiver-side gate — a blocked signer's cryptographically valid claim is still rejected, independent of the sender's own behavior");

    // Profile/interaction trust boundaries share the identical gate —
    // proven directly against their own evaluate(), the same shape
    // application/PresenceTrustBoundary.js's own is proven against
    // above (a full peer-transport round trip would only re-exercise
    // byte-identical code).
    const bobProfileAdvertisement = signAvatarProfileAdvertisement(toAvatarProfileAdvertisement(bobProfile), bob);
    assert(new AvatarProfileTrustBoundary().evaluate(bobProfileAdvertisement, null).accepted,
        "sanity: Bob's genuinely valid profile is accepted by an unrelated (non-blocking) replica");
    const profileResult = aliceProfileTrust.evaluate(bobProfileAdvertisement, null);
    assert(!profileResult.accepted && profileResult.observation.status === TrustStatus.BLOCKED,
        "profile trust boundary rejects a blocked signer's genuinely valid profile as BLOCKED");

    const bobInteractionAdvertisement = signAvatarInteractionAdvertisement(
        toAvatarInteractionAdvertisement({ avatarId: bobProfile.avatarId, ownerIdentity: bobId, kind: AvatarInteractionKind.WAVE, targetAvatarId: aliceProfile.avatarId, sequence: 1 }),
        bob
    );
    assert(new AvatarInteractionTrustBoundary().evaluate(bobInteractionAdvertisement).accepted,
        "sanity: Bob's genuinely valid interaction is accepted by an unrelated (non-blocking) replica");
    const interactionResult = aliceInteractionTrust.evaluate(bobInteractionAdvertisement);
    assert(!interactionResult.accepted && interactionResult.observation.status === TrustStatus.BLOCKED,
        "interaction trust boundary rejects a blocked signer's genuinely valid interaction as BLOCKED");
    console.log('✓ FLAGSHIP B: presence, profile, AND interaction trust boundaries all independently enforce the identical receiver-side block gate');

    // And, symmetrically to FLAGSHIP A's own ordering guarantee:
    // blocking is checked strictly AFTER signature verification, never
    // as a shortcut around it — a structurally/cryptographically
    // invalid claim is rejected for THAT reason, never misreported as
    // BLOCKED.
    const garbageProfileAdvertisement = { ...bobProfileAdvertisement, appearance: { tampered: true } };
    const garbageResult = aliceProfileTrust.evaluate(garbageProfileAdvertisement, null);
    assert(!garbageResult.accepted && garbageResult.observation.status !== TrustStatus.BLOCKED,
        'a tampered (signature-invalidating) claim is rejected for signature reasons, never misreported as BLOCKED');
    console.log('✓ FLAGSHIP B: blocking is checked strictly after signature verification, never as a shortcut around it');

    // --- Friendship protocol: block gates both send and ingestion. ---
    const aliceFriendsBlocked = new FriendRelationshipUseCase(aliceStorage, alice, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: aliceConnect.registry, isBlocked: aliceIsBlocked
    });
    let threw = false;
    try { aliceFriendsBlocked.sendFriendRequest(alicePeer); } catch (e) { threw = e.message.includes('blocked'); }
    assert(threw, 'sendFriendRequest refuses a blocked identity with a clear error');

    // --- FRIEND + BLOCKED coexistence, and unblock's own scope. ---
    assert(aliceFriends.getState(bobId) === FriendshipState.FRIEND, 'blocking never touched the underlying friendship record — still genuinely FRIEND');
    aliceBlocks.unblock(bobId);
    assert(!aliceBlocks.isBlocked(bobId), 'unblocked');
    assert(aliceFriends.getState(bobId) === FriendshipState.FRIEND, 'unblocking a friend leaves friendship exactly as it was — FRIEND, never re-derived or reset');

    // Block/unblock a STRANGER (never friends) proves unblocking never
    // MANUFACTURES a friendship that never existed either.
    const strangerStorage = new InMemoryStorageProvider();
    const stranger = makeDevice('FlagBStranger', strangerStorage).provider;
    const strangerId = stranger.getSigningIdentity().id;
    const strangerBlocks = new PeerBlockUseCase(aliceStorage, alice);
    const strangerFriends = new FriendRelationshipUseCase(aliceStorage, alice, { peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: { list: () => [], onChange: () => () => {} } });
    strangerBlocks.block(new PeerIdentity({ identityId: strangerId, publicKey: stranger.getSigningIdentity().publicKey }));
    strangerBlocks.unblock(strangerId);
    assert(strangerFriends.getState(strangerId) === FriendshipState.NONE, 'block -> unblock of a never-friended stranger leaves friendship at NONE, never auto-creating FRIEND');
    console.log('✓ FLAGSHIP B: FRIEND + BLOCKED coexist as independent facts; unblocking restores nothing but the ability to be heard again');

    stopBobListening();
    aliceFriends.dispose();
    bobFriends.dispose();
    aliceFriendsBlocked.dispose();
    strangerFriends.dispose();
    alicePresenceOut.dispose();
    bobPresenceIn.dispose();
    aliceTransport.dispose();
    bobTransport.dispose();
}

console.log('\nAll Friendship Revocation & Blocking (0.2.60) tests passed.');
}

await runTests();
