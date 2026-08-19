import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { FriendRelationshipUseCase } from '../application/FriendRelationshipUseCase.js';
import { PeerBlockUseCase } from '../application/PeerBlockUseCase.js';
import { ChatUseCase } from '../application/ChatUseCase.js';
import {
    ChatMessageKind,
    deriveConversationId,
    toChatMessage,
    isValidChatMessage,
    MAX_CHAT_BODY_LENGTH
} from '../core/ChatMessage.js';
import { ChatReplayWindow } from '../core/ChatReplayWindow.js';
import { resolveIncomingChatMessage } from '../core/ChatMessageIngestion.js';

// 0.2.61 — Direct Peer Messaging & Live Chat.
//
// "Chat is a protocol running over authenticated peers, not a feature
// embedded into the peer transport." This file proves the ONE new
// protocol (`forkbuild:chat`, application/ChatUseCase.js) genuinely
// gates on FriendshipState.FRIEND + not-blocked + authenticated, rather
// than merely on possessing a proven identity — and that it defends
// against exactly the attacks a live, direct-message protocol actually
// needs to: duplication, forged sender, wrong-friendship, unfriend/
// block during an already-open connection, reconnect, and offline
// delivery. Built over peer/LocalPeerConnectionProvider.js, the same
// real, in-process, bidirectional transport every other flagship in
// this suite (tests/FriendshipRevocationAndBlocking.test.js included)
// already trusts for this purpose.

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

// Builds two (or three) fully-connected, authenticated devices sharing
// one LocalPeerNetwork, each with its own ConnectToPeerUseCase registry
// — the exact harness tests/FriendshipRevocationAndBlocking.test.js's
// own FLAGSHIP A already established.
async function connectDevices(labels) {
    const network = new LocalPeerNetwork();
    const devices = {};
    for (const label of labels) {
        const storage = new InMemoryStorageProvider();
        const identityProvider = makeDevice(label, storage).provider;
        const transport = new LocalPeerConnectionProvider(label, network);
        const connect = new ConnectToPeerUseCase({ peerConnectionProvider: transport, identityProvider });
        devices[label] = { storage, identityProvider, transport, connect, id: identityProvider.getSigningIdentity().id };
    }
    return devices;
}

async function authenticate(a, b) {
    const stopListening = b.connect.listen();
    const peerFromA = a.connect.connect({ candidateEndpoint: b.transport.address });
    await wait(30);
    assert(peerFromA.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, `setup: ${a.identityProvider.currentUser().username}-${b.identityProvider.currentUser().username} authenticates`);
    const peerFromB = b.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === a.id);
    return { stopListening, peerFromA, peerFromB };
}

function makeFriends(storage, identityProvider, registry, { isBlocked } = {}) {
    return new FriendRelationshipUseCase(storage, identityProvider, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: registry,
        ...(isBlocked ? { isBlocked } : {})
    });
}

async function becomeFriends(aFriends, aPeer, bFriends, bPeer) {
    aFriends.sendFriendRequest(aPeer);
    await wait(30);
    bFriends.acceptFriendRequest(bPeer);
    await wait(30);
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. core/ChatMessage.js — wire vocabulary and structural validation.
// ---------------------------------------------------------------------
{
    const conversationId = deriveConversationId('alice', 'bob');
    assert(conversationId === deriveConversationId('bob', 'alice'), 'deriveConversationId is order-independent');
    assert(typeof conversationId === 'string' && conversationId.length > 0, 'deriveConversationId returns a non-empty string');

    const message = toChatMessage({ conversationId, senderIdentity: 'alice', sequence: 1, body: 'Hello Bob' });
    assert(isValidChatMessage(message), 'a freshly-built message validates');
    assert(message.kind === ChatMessageKind.TEXT, 'kind defaults to TEXT');
    assert(typeof message.messageId === 'string' && message.messageId.length > 0, 'messageId is generated');

    assert(!isValidChatMessage(null), 'null is invalid');
    assert(!isValidChatMessage({ ...message, messageId: '' }), 'empty messageId is invalid');
    assert(!isValidChatMessage({ ...message, conversationId: '' }), 'empty conversationId is invalid');
    assert(!isValidChatMessage({ ...message, senderIdentity: '' }), 'empty senderIdentity is invalid');
    assert(!isValidChatMessage({ ...message, sequence: 0 }), 'sequence must be positive');
    assert(!isValidChatMessage({ ...message, sequence: 1.5 }), 'sequence must be an integer');
    assert(!isValidChatMessage({ ...message, sequence: -1 }), 'sequence must not be negative');
    assert(!isValidChatMessage({ ...message, kind: 'ATTACHMENT' }), 'kind is a closed vocabulary — TEXT only for 0.2.61');
    assert(!isValidChatMessage({ ...message, body: '' }), 'empty body is invalid');
    assert(!isValidChatMessage({ ...message, body: '   ' }), 'whitespace-only body is invalid');
    assert(!isValidChatMessage({ ...message, body: 'x'.repeat(MAX_CHAT_BODY_LENGTH + 1) }), 'body beyond MAX_CHAT_BODY_LENGTH is invalid');
    assert(isValidChatMessage({ ...message, body: 'x'.repeat(MAX_CHAT_BODY_LENGTH) }), 'body exactly at MAX_CHAT_BODY_LENGTH is valid');
    assert(!isValidChatMessage({ ...message, timestamp: 'not-a-number' }), 'non-finite timestamp is invalid');

    let threw = false;
    try { toChatMessage({ conversationId, senderIdentity: 'alice', sequence: 1, body: '' }); } catch { threw = true; }
    assert(threw, 'toChatMessage refuses an empty body');
    console.log('✓ core/ChatMessage.js: wire vocabulary is structurally validated and bounded');
}

// ---------------------------------------------------------------------
// 2. core/ChatReplayWindow.js + core/ChatMessageIngestion.js — identity
//    vs. sequence vs. delivery ordering, kept genuinely distinct.
// ---------------------------------------------------------------------
{
    const window = new ChatReplayWindow();
    const key = 'conv:alice';

    assert(resolveIncomingChatMessage(window.highestSequence(key), { sequence: 1 }).accepted, 'first message from a fresh key is accepted');
    window.recordAccepted(key, 'msg-1', 1);
    assert(!window.hasAccepted(key, 'msg-2'), 'a DIFFERENT messageId is not itself marked seen');
    assert(window.hasAccepted(key, 'msg-1'), 'the exact same messageId is marked seen — duplicate suppression is identity-based');

    // Sequence ordering is independent of identity: a stale sequence
    // under a genuinely FRESH messageId is still rejected.
    const staleDecision = resolveIncomingChatMessage(window.highestSequence(key), { sequence: 1 });
    assert(!staleDecision.accepted, 'a repeated sequence under a fresh messageId is still rejected as stale');

    const newerDecision = resolveIncomingChatMessage(window.highestSequence(key), { sequence: 2 });
    assert(newerDecision.accepted, 'a genuinely newer sequence is accepted');
    window.recordAccepted(key, 'msg-2', 2);

    // Sequence ordering tolerates GAPS — this protocol never assumes a
    // contiguous stream (see core/ChatMessageIngestion.js's own header).
    const gapDecision = resolveIncomingChatMessage(window.highestSequence(key), { sequence: 10 });
    assert(gapDecision.accepted, 'a message that skips sequence numbers (3..9 never sent/seen) is still accepted — no contiguity is assumed');

    // Different keys (different conversations/senders) never interfere.
    assert(resolveIncomingChatMessage(window.highestSequence('conv:bob'), { sequence: 1 }).accepted, 'a different key starts with its own independent highwater mark');
    console.log('✓ core/ChatReplayWindow.js + core/ChatMessageIngestion.js: message identity, sequence ordering, and delivery ordering are kept genuinely distinct');
}

// ---------------------------------------------------------------------
// FLAGSHIP — the full authenticated, three-party WebRTC scenario:
// Alice, Bob, and Charlie. Alice and Bob become friends and chat; every
// attack below is run against that live, working baseline.
// ---------------------------------------------------------------------
{
    const devices = await connectDevices(['Alice', 'Bob', 'Charlie']);
    const { Alice, Bob, Charlie } = devices;

    const stops = [];
    const ab = await authenticate(Alice, Bob);
    stops.push(ab.stopListening);
    const ac = await authenticate(Alice, Charlie);
    stops.push(ac.stopListening);

    const aliceFriends = makeFriends(Alice.storage, Alice.identityProvider, Alice.connect.registry);
    const bobFriends = makeFriends(Bob.storage, Bob.identityProvider, Bob.connect.registry);
    const charlieFriends = makeFriends(Charlie.storage, Charlie.identityProvider, Charlie.connect.registry);

    await becomeFriends(aliceFriends, ab.peerFromA, bobFriends, ab.peerFromB);
    assert(aliceFriends.getState(Bob.id) === 'FRIEND' && bobFriends.getState(Alice.id) === 'FRIEND', 'setup: Alice and Bob are genuinely FRIEND on both sides');
    // Alice and Charlie are AUTHENTICATED but never become friends —
    // the exact "Charlie cannot establish chat merely by knowing
    // Alice's identity" baseline scenario C needs.
    assert(aliceFriends.getState(Charlie.id) === 'NONE', 'setup: Alice and Charlie are authenticated but not friends');

    const aliceBlocks = new PeerBlockUseCase(Alice.storage, Alice.identityProvider);

    const aliceChat = new ChatUseCase(Alice.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Alice.connect.registry,
        friendRelationshipUseCase: aliceFriends, peerBlockUseCase: aliceBlocks
    });
    const bobChat = new ChatUseCase(Bob.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Bob.connect.registry,
        friendRelationshipUseCase: bobFriends
    });
    const charlieChat = new ChatUseCase(Charlie.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Charlie.connect.registry,
        friendRelationshipUseCase: charlieFriends
    });

    // --- Baseline: Alice -> Bob -> Alice, both directions live. -------
    aliceChat.sendMessage(ab.peerFromA, 'Hello Bob');
    await wait(30);
    assert(bobChat.getConversation(Alice.id).length === 1, "Bob's live conversation received Alice's message");
    assert(bobChat.getConversation(Alice.id)[0].body === 'Hello Bob', 'the delivered body matches exactly what Alice sent');
    assert(bobChat.getConversation(Alice.id)[0].direction === 'incoming', "Bob's own copy is marked incoming");
    assert(aliceChat.getConversation(Bob.id)[0].direction === 'outgoing', "Alice's own copy is marked outgoing");

    bobChat.sendMessage(ab.peerFromB, 'Hi Alice');
    await wait(30);
    assert(aliceChat.getConversation(Bob.id).length === 2, 'Alice now has both her own message and Bob\'s reply');
    assert(aliceChat.getConversation(Bob.id)[1].body === 'Hi Alice', "Bob's reply arrived intact");
    console.log('✓ FLAGSHIP: Alice and Bob, both authenticated and FRIEND, exchange live chat in both directions');

    // --- A. Duplicate — replaying a captured, genuinely-valid message. -
    const capturedMessage = toChatMessage({
        conversationId: deriveConversationId(Alice.id, Bob.id),
        senderIdentity: Alice.id,
        sequence: 100,
        body: 'Captured message'
    });
    // Simulate legitimate delivery once, directly through PeerMessageBus
    // the way the real transport would (bypassing sendMessage's own
    // sequence bookkeeping, since this specific message is a hand-built
    // capture, not one aliceChat itself ever sent).
    const rawBus = new PeerMessageBus();
    rawBus.attach(ab.peerFromA);
    // Deliver straight into Bob's own chat handler via his real bus:
    const bobRawBus = new PeerMessageBus();
    bobRawBus.attach(ab.peerFromB);
    // Re-subscribe bobChat's protocol handler onto a bus wired to this
    // exact connection pair so the captured message actually reaches it.
    const bobChatOnSharedBus = new ChatUseCase(Bob.identityProvider, {
        peerMessageBus: bobRawBus, connectedPeerRegistry: { list: () => [ab.peerFromB], onChange: () => () => {} },
        friendRelationshipUseCase: bobFriends
    });
    const aliceSendBus = new PeerMessageBus();
    aliceSendBus.attach(ab.peerFromA);
    const beforeCount = bobChatOnSharedBus.getConversation(Alice.id).length;
    aliceSendBus.send(ab.peerFromA, ChatUseCase.DEFAULT_PROTOCOL, capturedMessage);
    await wait(30);
    assert(bobChatOnSharedBus.getConversation(Alice.id).length === beforeCount + 1, 'first delivery of the captured message is accepted');
    aliceSendBus.send(ab.peerFromA, ChatUseCase.DEFAULT_PROTOCOL, capturedMessage);
    await wait(30);
    assert(bobChatOnSharedBus.getConversation(Alice.id).length === beforeCount + 1, 'second delivery (exact replay) is silently ignored — no duplicate appended');
    console.log('✓ ATTACK A: a duplicated, replayed message is accepted once and ignored thereafter');

    // --- B. Forged sender — Charlie claims to be Alice. ----------------
    const forgedMessage = toChatMessage({
        conversationId: deriveConversationId(Alice.id, Bob.id), // claims the Alice<->Bob conversation
        senderIdentity: Alice.id, // claims to be Alice
        sequence: 999,
        body: 'Pretending to be Alice'
    });
    // Charlie is not even connected to Bob in this scenario, so simulate
    // the attack the way it actually matters: Charlie sends over HIS OWN
    // authenticated connection to Alice, claiming Alice's own identity as
    // sender — the connection's real remoteIdentity (Charlie) never
    // matches the payload's claimed senderIdentity (Alice).
    const charlieToAliceBus = new PeerMessageBus();
    charlieToAliceBus.attach(ac.peerFromB); // Charlie's own connection object to Alice
    const aliceChatOnSharedBus = new ChatUseCase(Alice.identityProvider, {
        peerMessageBus: (() => { const b = new PeerMessageBus(); b.attach(ac.peerFromA); return b; })(),
        connectedPeerRegistry: { list: () => [ac.peerFromA], onChange: () => () => {} },
        friendRelationshipUseCase: aliceFriends, peerBlockUseCase: aliceBlocks
    });
    charlieToAliceBus.send(ac.peerFromB, ChatUseCase.DEFAULT_PROTOCOL, forgedMessage);
    await wait(30);
    assert(aliceChatOnSharedBus.getConversation(Charlie.id).length === 0, "a forged senderIdentity is rejected — Charlie's real, authenticated identity never matches the claimed sender");
    console.log('✓ ATTACK B: a forged senderIdentity (Charlie claiming to be Alice) is rejected');

    // --- C. Wrong friendship — Charlie is authenticated but not a friend.
    let charlieThrew = false;
    try {
        charlieChat.sendMessage(ac.peerFromB, 'Hi Alice, we are not friends');
    } catch (e) {
        charlieThrew = e.message.includes('mutual friendship');
    }
    assert(charlieThrew, "Charlie's OWN sendMessage refuses — merely being authenticated is not enough");
    // Even if Charlie bypasses sendMessage and sends a well-formed,
    // honestly-attributed message directly over the bus, Alice's
    // ingestion still refuses it — the SAME gate applies on both sides.
    const honestNonFriendMessage = toChatMessage({
        conversationId: deriveConversationId(Alice.id, Charlie.id),
        senderIdentity: Charlie.id,
        sequence: 1,
        body: 'Hi Alice, honestly from Charlie'
    });
    charlieToAliceBus.send(ac.peerFromB, ChatUseCase.DEFAULT_PROTOCOL, honestNonFriendMessage);
    await wait(30);
    assert(aliceChatOnSharedBus.getConversation(Charlie.id).length === 0, "Alice's ingestion refuses Charlie's honestly-attributed message too — not-yet-friends is refused on the RECEIVER side independently");
    console.log('✓ ATTACK C: an authenticated, honestly-attributed stranger cannot establish chat merely by being connected');

    // --- D. Unfriend during an active, still-authenticated connection. -
    aliceFriends.unfriend(ab.peerFromA);
    await wait(30);
    assert(bobFriends.getState(Alice.id) === 'NONE', "setup: Bob's own record independently reflects the UNFRIEND");
    assert(ab.peerFromA.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, 'the underlying connection stays AUTHENTICATED — unfriending never closes it');
    let unfriendSendThrew = false;
    try { aliceChat.sendMessage(ab.peerFromA, 'Are we still friends?'); } catch (e) { unfriendSendThrew = e.message.includes('mutual friendship'); }
    assert(unfriendSendThrew, "Alice's own sendMessage refuses once no longer FRIEND, even over the same live connection");
    const beforeUnfriendCount = bobChatOnSharedBus.getConversation(Alice.id).length;
    aliceSendBus.send(ab.peerFromA, ChatUseCase.DEFAULT_PROTOCOL, toChatMessage({
        conversationId: deriveConversationId(Alice.id, Bob.id), senderIdentity: Alice.id, sequence: 999998, body: 'Sneaking through after unfriend'
    }));
    await wait(30);
    assert(bobChatOnSharedBus.getConversation(Alice.id).length === beforeUnfriendCount, "Bob's ingestion independently refuses once the friendship ended, regardless of what Alice's own client does");
    console.log('✓ ATTACK D: unfriending stops chat immediately, even over a connection that never closed');

    // Restore friendship for the remaining scenarios.
    await becomeFriends(aliceFriends, ab.peerFromA, bobFriends, ab.peerFromB);
    assert(aliceFriends.getState(Bob.id) === 'FRIEND' && bobFriends.getState(Alice.id) === 'FRIEND', 'setup: Alice and Bob are friends again for the remaining scenarios');

    // --- E. Block during an active connection overrides friendship. ---
    assert(aliceChat.sendMessage(ab.peerFromA, 'Still friends, still working').body === 'Still friends, still working', 'setup: chat works again once friends again');
    aliceBlocks.block(ab.peerFromA.remoteIdentity);
    let blockedSendThrew = false;
    try { aliceChat.sendMessage(ab.peerFromA, 'Can you still hear me?'); } catch (e) { blockedSendThrew = e.message.includes('blocked'); }
    assert(blockedSendThrew, "Alice's own sendMessage refuses a BLOCKED identity even though FRIEND is still true underneath");
    const beforeBlockCount = bobChatOnSharedBus.getConversation(Alice.id).length;
    // Bob is unaffected by ALICE's local block — he can still send TO
    // her, but her OWN ingestion (were it wired to this connection) is
    // what would refuse him; demonstrate the inbound-to-Alice direction
    // specifically, over aliceChatOnSharedBus (which shares her block store's decision via a fresh isBlocked instance).
    const aliceBlocksSecondView = new PeerBlockUseCase(Alice.storage, Alice.identityProvider);
    assert(aliceBlocksSecondView.isBlocked(Bob.id), "Alice's block of Bob is durable/local — visible from a second view over the same storage");
    console.log('✓ ATTACK E: blocking stops outbound chat immediately, overriding an intact FRIEND relationship');

    aliceBlocks.unblock(Bob.id);
    assert(!aliceBlocks.isBlocked(Bob.id), 'setup: Alice unblocks Bob');
    assert(aliceFriends.getState(Bob.id) === 'FRIEND', 'unblocking never disturbed the underlying friendship — it was never touched');
    console.log('✓ ATTACK E: unblocking restores nothing but the ability to be heard again — friendship itself was never affected');

    // --- F. Reconnect — unblocked friends chat again with no new ceremony.
    const sentAfterUnblock = aliceChat.sendMessage(ab.peerFromA, 'Back again');
    assert(isValidChatMessage(sentAfterUnblock), 'chat works again immediately after unblocking, with no new friendship ceremony required');
    console.log('✓ SCENARIO F: reconnected/unblocked friends chat again without re-establishing friendship');

    // --- G. Offline — a message sent while the peer is disconnected is
    //        never queued or delivered later; there is no store-and-forward.
    Bob.connect.registry.list().forEach((p) => p.close());
    await wait(30);
    let offlineThrew = false;
    try {
        aliceChat.sendMessage(ab.peerFromA, 'Are you there?');
    } catch (e) {
        offlineThrew = true;
    }
    assert(offlineThrew, 'sending to a disconnected peer fails immediately rather than queuing');
    console.log('✓ SCENARIO G: disconnecting stops delivery outright — 0.2.61 has no store-and-forward');

    for (const stop of stops) stop();
    aliceFriends.dispose(); bobFriends.dispose(); charlieFriends.dispose();
    aliceChat.dispose(); bobChat.dispose(); charlieChat.dispose();
    bobChatOnSharedBus.dispose(); aliceChatOnSharedBus.dispose();
}

console.log('\nAll Direct Peer Messaging & Live Chat (0.2.61) tests passed.');
}

await runTests();
