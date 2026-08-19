import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { FriendRelationshipUseCase } from '../application/FriendRelationshipUseCase.js';
import { PeerRelationshipUseCase } from '../application/PeerRelationshipUseCase.js';
import { PeerReconnectionUseCase } from '../application/PeerReconnectionUseCase.js';
import { ChatUseCase } from '../application/ChatUseCase.js';
import { ChatOutbox } from '../application/ChatOutbox.js';
import { ConversationStore } from '../application/ConversationStore.js';
import { ConversationReadTracker } from '../application/ConversationReadTracker.js';
import { ConversationReadMarker } from '../core/ConversationReadMarker.js';
import { PeerPresenceUseCase } from '../application/PeerPresenceUseCase.js';
import { toChatMessage, deriveConversationId } from '../core/ChatMessage.js';
import { FriendshipState } from '../core/FriendshipState.js';

// 0.2.70 — Presence & Conversation Lifecycle.
//
// "What does the application know about the other participant when
// there is no active connection?" 0.2.56 through 0.2.69 each built one
// durable or ephemeral piece of that answer, independently. This file
// proves the two new pieces 0.2.70 adds — `application/
// ConversationReadTracker.js` (a THIRD durable per-owner store,
// answering "what have I seen," never folded into the outbox or the
// history store) and `application/PeerPresenceUseCase.js` (a computed
// reconciliation across FIVE independent sources, never a new store of
// its own) — and, in the flagship scenarios, that OFFLINE never implies
// any of the other four facts (identity, relationship, friendship,
// conversation) are also gone, and that a stale/rejected connection
// event can never corrupt the reconciled view, extending 0.2.62's own
// stale-incarnation defense into this new layer.

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

function connectDevices(labels) {
    const network = new LocalPeerNetwork();
    const devices = {};
    for (const label of labels) {
        const { storage, provider } = makeDevice(label);
        const transport = new LocalPeerConnectionProvider(label, network);
        const connect = new ConnectToPeerUseCase({ peerConnectionProvider: transport, identityProvider: provider });
        devices[label] = { storage, identityProvider: provider, transport, connect, id: provider.getSigningIdentity().id };
    }
    return devices;
}

async function authenticate(a, b, options = {}) {
    const stopListening = b.connect.listen();
    const peerFromA = a.connect.connect({ candidateEndpoint: b.transport.address }, options);
    await wait(30);
    assert(peerFromA.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, `setup: ${a.identityProvider.currentUser().username}-${b.identityProvider.currentUser().username} authenticates`);
    const peerFromB = b.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === a.id);
    return { stopListening, peerFromA, peerFromB };
}

async function reconnect(a, b, options = {}) {
    const peerFromA = a.connect.connect({ candidateEndpoint: b.transport.address }, options);
    await wait(30);
    assert(peerFromA.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, `reconnect: ${a.identityProvider.currentUser().username}-${b.identityProvider.currentUser().username} re-authenticates`);
    const peerFromB = b.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === a.id);
    return { peerFromA, peerFromB };
}

function makeFriends(storage, identityProvider, registry) {
    return new FriendRelationshipUseCase(storage, identityProvider, {
        peerMessageBus: new PeerMessageBus(),
        connectedPeerRegistry: registry
    });
}

async function becomeFriends(aFriends, aPeer, bFriends, bPeer) {
    aFriends.sendFriendRequest(aPeer);
    await wait(30);
    bFriends.acceptFriendRequest(bPeer);
    await wait(30);
}

function makeFakeSessionManager(connect, targetAddress) {
    return {
        async createInvitation({ expectedIdentityId } = {}) {
            const connectedPeer = connect.connect({ candidateEndpoint: targetAddress }, { expectedIdentityId });
            return { invitation: { toJSON: () => ({ fake: true }), expiresAt: new Date(Date.now() + 60000) }, connectedPeer };
        },
        onIdentityMismatch(callback) { return connect.onIdentityMismatch(callback); }
    };
}

// A durable "stack" for one owner — chatOutbox/conversationStore/
// conversationReadTracker over the SAME InMemoryStorageProvider, exactly
// the way a real browser tab would share one localStorage across all
// three, plus a PeerPresenceUseCase composing them with the relationship/
// friendship/registry collaborators already built for that device.
function makeChatStack(device, registry, friends) {
    const outbox = new ChatOutbox(device.storage, device.identityProvider);
    const conversations = new ConversationStore(device.storage, device.identityProvider);
    const readTracker = new ConversationReadTracker(device.storage, device.identityProvider);
    const relationships = new PeerRelationshipUseCase(device.storage, device.identityProvider);
    const chat = new ChatUseCase(device.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: registry,
        friendRelationshipUseCase: friends, chatOutbox: outbox, conversationStore: conversations
    });
    const presence = new PeerPresenceUseCase({
        connectedPeerRegistry: registry,
        peerRelationshipUseCase: relationships,
        friendRelationshipUseCase: friends,
        conversationStore: conversations,
        chatOutbox: outbox,
        conversationReadTracker: readTracker
    });
    return { outbox, conversations, readTracker, relationships, chat, presence };
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. core/ConversationReadMarker.js — construction, monotonic
//    withLastReadSequence(), JSON round-trip, graceful degradation.
// ---------------------------------------------------------------------
{
    const marker = new ConversationReadMarker({ peerIdentityId: 'bob' });
    assert(marker.lastReadSequence === 0, 'a freshly-constructed marker defaults to lastReadSequence 0');

    const advanced = marker.withLastReadSequence(5);
    assert(advanced.lastReadSequence === 5 && marker.lastReadSequence === 0, 'withLastReadSequence() returns a NEW marker, never mutates the original');

    const regressed = advanced.withLastReadSequence(2);
    assert(regressed.lastReadSequence === 5, 'withLastReadSequence() never regresses below the current high-water mark');

    const stillAdvancing = advanced.withLastReadSequence(9);
    assert(stillAdvancing.lastReadSequence === 9, 'withLastReadSequence() advances past the current high-water mark when given a larger value');

    const roundTripped = ConversationReadMarker.fromJSON(advanced.toJSON());
    assert(roundTripped.peerIdentityId === 'bob' && roundTripped.lastReadSequence === 5, 'toJSON()/fromJSON() round-trips exactly');
    assert(ConversationReadMarker.fromJSON(null) === null, 'fromJSON(null) degrades to null rather than throwing');
    assert(ConversationReadMarker.fromJSON({ peerIdentityId: 'bob', lastReadSequence: -1 }) === null, 'fromJSON() degrades gracefully on a corrupted stored record (negative sequence)');

    let threw = false;
    try { new ConversationReadMarker({ peerIdentityId: '' }); } catch { threw = true; }
    assert(threw, 'an empty peerIdentityId is refused at construction');
    console.log('✓ core/ConversationReadMarker.js: monotonic transitions, immutability, and graceful degradation on corrupted storage');
}

// ---------------------------------------------------------------------
// 2. application/ConversationReadTracker.js — markRead/getLastReadSequence,
//    monotonic, per-owner scoped, durable.
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const identityProvider = makeDevice('ReadTrackerOwner', storage).provider;
    const tracker = new ConversationReadTracker(storage, identityProvider);

    assert(tracker.getLastReadSequence('bob') === 0, 'an unknown peer reads back as lastReadSequence 0, never null/undefined');

    const first = tracker.markRead('bob', 3);
    assert(first.lastReadSequence === 3, 'markRead() advances a fresh marker to the given sequence');
    assert(tracker.getLastReadSequence('bob') === 3, 'the advance is durably readable back');

    const regressed = tracker.markRead('bob', 1);
    assert(regressed.lastReadSequence === 3, 'markRead() with a LOWER sequence never regresses the stored high-water mark');
    assert(tracker.getLastReadSequence('bob') === 3, 'the durable value is unaffected by an attempted regression');

    tracker.markRead('bob', 7);
    assert(tracker.getLastReadSequence('bob') === 7, 'markRead() with a HIGHER sequence advances the durable high-water mark');
    assert(tracker.getLastReadSequence('dora') === 0, 'a different peer is completely unaffected');

    // A second owner's tracker is completely independent storage.
    const otherStorage = new InMemoryStorageProvider();
    const otherProvider = makeDevice('OtherReadTrackerOwner', otherStorage).provider;
    const otherTracker = new ConversationReadTracker(otherStorage, otherProvider);
    assert(otherTracker.getLastReadSequence('bob') === 0 && tracker.getLastReadSequence('bob') === 7, 'two owners\' read trackers never see each other\'s state');

    // Durability across a fresh instance over the same storage.
    const reloaded = new ConversationReadTracker(storage, identityProvider);
    assert(reloaded.getLastReadSequence('bob') === 7, 'a brand-new ConversationReadTracker over the same storage restores the durable high-water mark');
    console.log('✓ application/ConversationReadTracker.js: monotonic, per-owner, durable across a simulated reload');
}

// ---------------------------------------------------------------------
// 3. application/PeerPresenceUseCase.js — composition correctness over
//    minimal, honestly-labeled fakes for the connection registry and
//    friendship predicate (the same "fake only the protocol-shaped
//    collaborator, use the real store for everything else" posture
//    tests/PeerConnectionResilience.test.js's own makeFakeSessionManager
//    already established), so this section isolates PURE derivation
//    logic from real WebRTC/handshake timing.
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const identityProvider = makeDevice('PresenceOwner', storage).provider;
    const relationships = new PeerRelationshipUseCase(storage, identityProvider);
    const conversations = new ConversationStore(storage, identityProvider);
    const outbox = new ChatOutbox(storage, identityProvider);
    const readTracker = new ConversationReadTracker(storage, identityProvider);

    let connectedIdentityId = null;
    const fakeRegistry = {
        list() {
            return connectedIdentityId
                ? [{ remoteIdentity: { identityId: connectedIdentityId }, getLifecycleState: () => PeerLifecycleState.AUTHENTICATED }]
                : [];
        },
        onChange() { return () => {}; }
    };
    let friendState = FriendshipState.NONE;
    const fakeFriends = {
        getState: (id) => (id === 'bob' ? friendState : FriendshipState.NONE),
        getRelationships: () => (friendState !== FriendshipState.NONE ? [{ identityId: 'bob' }] : []),
        onRelationshipsChanged() { return () => {}; }
    };

    const presence = new PeerPresenceUseCase({
        connectedPeerRegistry: fakeRegistry,
        peerRelationshipUseCase: relationships,
        friendRelationshipUseCase: fakeFriends,
        conversationStore: conversations,
        chatOutbox: outbox,
        conversationReadTracker: readTracker
    });

    // A stranger this device has never remembered, never friended, and
    // never talked to reads back as "nothing on record," never throws.
    const strangerSummary = presence.getSummary('never-heard-of');
    assert(strangerSummary.relationship === null && strangerSummary.friendshipState === FriendshipState.NONE
        && strangerSummary.isConnectedNow === false && strangerSummary.conversation.messageCount === 0
        && strangerSummary.conversation.lastActivityAt === null,
        'getSummary() for a completely unknown identity reads as "nothing on record," never throws');

    // Build up Bob's presence one independent fact at a time.
    friendState = FriendshipState.FRIEND;
    let summary = presence.getSummary('bob');
    assert(summary.friendshipState === FriendshipState.FRIEND && summary.isConnectedNow === false,
        'FRIEND while disconnected: friendship and connection are independent facts');

    connectedIdentityId = 'bob';
    summary = presence.getSummary('bob');
    assert(summary.isConnectedNow === true && summary.lifecycleState === PeerLifecycleState.AUTHENTICATED,
        'a live, AUTHENTICATED connection is reflected as isConnectedNow');

    const outgoing1 = toChatMessage({ conversationId: deriveConversationId('me', 'bob'), senderIdentity: 'me', sequence: 1, body: 'hi' });
    conversations.append('bob', outgoing1, 'outgoing');
    const incoming1 = toChatMessage({ conversationId: deriveConversationId('me', 'bob'), senderIdentity: 'bob', sequence: 1, body: 'hey' });
    conversations.append('bob', incoming1, 'incoming');
    const incoming2 = toChatMessage({ conversationId: deriveConversationId('me', 'bob'), senderIdentity: 'bob', sequence: 2, body: 'you there?' });
    conversations.append('bob', incoming2, 'incoming');
    outbox.enqueue(toChatMessage({ conversationId: deriveConversationId('me', 'bob'), senderIdentity: 'me', sequence: 2, body: 'queued one' }), 'bob');

    summary = presence.getSummary('bob');
    assert(summary.conversation.messageCount === 3, 'messageCount reflects every stored entry for this peer');
    assert(summary.conversation.unreadCount === 2, 'unreadCount counts every INCOMING entry with a sequence above the current read marker (0)');
    assert(summary.conversation.pendingOutboxCount === 1, 'pendingOutboxCount reads straight off the outbox — QUEUED/SENT, not DELIVERED');
    assert(summary.conversation.lastActivityAt !== null, 'lastActivityAt is populated once there is any stored history');

    presence.markRead('bob');
    summary = presence.getSummary('bob');
    assert(summary.conversation.unreadCount === 0, 'markRead() advances the read marker past every currently-stored incoming message');
    assert(readTracker.getLastReadSequence('bob') === 2, 'markRead() durably advances application/ConversationReadTracker.js to the highest incoming sequence actually seen');

    const list = presence.list();
    assert(list.length === 1 && list[0].identityId === 'bob', 'list() unions relationships/friendships/conversation history, deduplicated — here, only "bob" has any signal at all');

    console.log('✓ application/PeerPresenceUseCase.js: getSummary()/markRead()/list() correctly compose relationship, friendship, connection, and conversation facts');
}

// ---------------------------------------------------------------------
// FLAGSHIP — Alice and Bob become friends; presence reconciles online,
// offline, unread, and pending-delivery states correctly across a real
// disconnect/reconnect cycle, on BOTH sides.
// ---------------------------------------------------------------------
{
    const devices = connectDevices(['Alice', 'Bob']);
    const { Alice, Bob } = devices;
    const setup = await authenticate(Alice, Bob);

    const aliceFriends = makeFriends(Alice.storage, Alice.identityProvider, Alice.connect.registry);
    const bobFriends = makeFriends(Bob.storage, Bob.identityProvider, Bob.connect.registry);
    await becomeFriends(aliceFriends, setup.peerFromA, bobFriends, setup.peerFromB);
    assert(aliceFriends.getState(Bob.id) === FriendshipState.FRIEND && bobFriends.getState(Alice.id) === FriendshipState.FRIEND, 'setup: Alice and Bob are FRIEND on both sides');

    const alice = makeChatStack(Alice, Alice.connect.registry, aliceFriends);
    const bob = makeChatStack(Bob, Bob.connect.registry, bobFriends);

    alice.relationships.rememberPeer(setup.peerFromA.remoteIdentity, { alias: 'Bob' });

    // --- A. Both online: Alice's presence sees Bob connected, no
    //        conversation yet. ------------------------------------------
    let aliceSeesBob = alice.presence.getSummary(Bob.id);
    assert(aliceSeesBob.isConnectedNow === true, 'both online: Alice\'s presence reconciliation sees Bob connected');
    assert(aliceSeesBob.relationship !== null && aliceSeesBob.alias === 'Bob', 'the remembered relationship and its alias are reflected');
    assert(aliceSeesBob.conversation.messageCount === 0, 'no conversation yet');

    alice.chat.sendOrQueue(Bob.id, 'Hello Bob');
    await wait(20);
    assert(bob.chat.getConversation(Alice.id).length === 1, 'Bob receives the first message');

    // Bob has not opened the conversation yet — it is genuinely unread.
    let bobSeesAlice = bob.presence.getSummary(Alice.id);
    assert(bobSeesAlice.conversation.unreadCount === 1, 'Bob\'s presence reconciliation shows exactly one unread message he has not yet opened');
    bob.presence.markRead(Alice.id);
    bobSeesAlice = bob.presence.getSummary(Alice.id);
    assert(bobSeesAlice.conversation.unreadCount === 0, 'opening the conversation (markRead) clears the unread count');

    // --- B. Bob goes offline; presence updates on BOTH sides
    //        independently, and Alice's relationship/friendship survive
    //        it untouched — see application/PeerPresenceUseCase.js's own
    //        header, "OFFLINE ≠ conversation/relationship/friendship
    //        unavailable." -------------------------------------------
    Bob.connect.registry.list().forEach((p) => p.close());
    await wait(20);
    aliceSeesBob = alice.presence.getSummary(Bob.id);
    assert(aliceSeesBob.isConnectedNow === false, 'Bob disconnecting flips isConnectedNow to false');
    assert(aliceSeesBob.relationship !== null && aliceSeesBob.alias === 'Bob', 'the remembered relationship survives the disconnect untouched');
    assert(aliceSeesBob.friendshipState === FriendshipState.FRIEND, 'the friendship survives the disconnect untouched');
    assert(aliceSeesBob.conversation.messageCount === 1, 'the conversation history survives the disconnect untouched');
    console.log('✓ FLAGSHIP part 1: presence reconciles online -> offline while relationship, friendship, and conversation all outlive the connection');

    // --- C. Alice queues a second message while Bob is offline; presence
    //        reflects the pending outbox entry. ------------------------
    alice.chat.sendOrQueue(Bob.id, 'Are you there?');
    aliceSeesBob = alice.presence.getSummary(Bob.id);
    assert(aliceSeesBob.conversation.pendingOutboxCount === 1, 'presence reflects one message waiting to send while Bob is offline');

    // --- D. Bob reconnects for real: the outbox flushes, and presence on
    //        BOTH sides reconciles back to online with pending cleared and
    //        the new message counted, unread, on Bob\'s side. -----------
    await reconnect(Alice, Bob);
    await wait(40);
    aliceSeesBob = alice.presence.getSummary(Bob.id);
    assert(aliceSeesBob.isConnectedNow === true, 'presence reconciles back to online once Bob genuinely reconnects');
    assert(aliceSeesBob.conversation.pendingOutboxCount === 0, 'the pending outbox entry clears once delivered and acknowledged');
    assert(aliceSeesBob.conversation.messageCount === 2, 'both messages are reflected in the conversation count');

    bobSeesAlice = bob.presence.getSummary(Alice.id);
    assert(bobSeesAlice.conversation.unreadCount === 1, 'the message Alice sent while Bob was offline arrives as unread once Bob is back online');
    bob.presence.markRead(Alice.id);
    assert(bob.presence.getSummary(Alice.id).conversation.unreadCount === 0, 'opening the conversation again clears the newly-arrived unread message');
    console.log('✓ FLAGSHIP part 2: presence reconciles offline -> online, outbox flush, and per-side unread state correctly');

    setup.stopListening();
    aliceFriends.dispose(); bobFriends.dispose();
    alice.chat.dispose(); bob.chat.dispose();
    alice.presence.dispose(); bob.presence.dispose();
}

// ---------------------------------------------------------------------
// SECURITY / STALE-INCARNATION FLAGSHIP — extending 0.2.62's own
// protection (tests/PeerConnectionResilience.test.js) into this new
// layer: a rejected reconnect that genuinely authenticates as the WRONG
// identity, and a late, stale event from an already-dead OLD connection,
// must never corrupt the reconciled presence view for the identity
// actually expected.
// ---------------------------------------------------------------------
{
    const three = connectDevices(['Alice3', 'Bob3', 'Charlie3']);
    const { Alice3: Alice, Bob3: Bob, Charlie3: Charlie } = three;
    const setup = await authenticate(Alice, Bob);
    Charlie.connect.listen();

    const aliceFriends = makeFriends(Alice.storage, Alice.identityProvider, Alice.connect.registry);
    const bobFriends = makeFriends(Bob.storage, Bob.identityProvider, Bob.connect.registry);
    await becomeFriends(aliceFriends, setup.peerFromA, bobFriends, setup.peerFromB);

    const alice = makeChatStack(Alice, Alice.connect.registry, aliceFriends);
    alice.relationships.rememberPeer(setup.peerFromA.remoteIdentity, { alias: 'Bob' });
    // Bob needs a live ChatUseCase of his own to actually receive and
    // acknowledge Alice's message once he genuinely reconnects — without
    // it nothing would ever ack, and the outbox would stay SENT forever
    // regardless of whether the earlier rejected-Charlie detour behaved
    // correctly, making the final assertion below meaningless.
    const bobChat = new ChatUseCase(Bob.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Bob.connect.registry,
        friendRelationshipUseCase: bobFriends
    });

    // Bob genuinely goes offline FIRST — a message queued afterward is
    // actually QUEUED (never a transient SENT-but-not-yet-acked entry
    // that would happen to also read as "pending"), so the assertions
    // below test the real offline-queueing path, not a timing accident.
    Bob.connect.registry.list().forEach((p) => p.close());
    await wait(20);
    let aliceSeesBob = alice.presence.getSummary(Bob.id);
    assert(aliceSeesBob.isConnectedNow === false, 'Bob is genuinely offline before the message is queued and before the rejected reconnect attempt');

    alice.chat.sendOrQueue(Bob.id, 'Only for Bob');
    aliceSeesBob = alice.presence.getSummary(Bob.id);
    assert(aliceSeesBob.conversation.messageCount === 1 && aliceSeesBob.conversation.pendingOutboxCount === 1, 'setup: a message is durably queued for Bob while he is genuinely offline');

    const rejected = [];
    const fakeSessionManagerToCharlie = makeFakeSessionManager(Alice.connect, Charlie.transport.address);
    const reconnection = new PeerReconnectionUseCase({ peerSessionManager: fakeSessionManagerToCharlie, peerRelationshipUseCase: alice.relationships });
    reconnection.onReconnectRejected((detail) => rejected.push(detail));

    const { connectedPeer } = await reconnection.reconnectAsInviter(Bob.id);
    await wait(30);
    assert(connectedPeer.getLifecycleState() === PeerLifecycleState.CLOSED, 'setup: the connection genuinely authenticates as Charlie and is rejected as a reconnect to Bob');
    assert(rejected.length === 1, 'setup: the rejection fires exactly once');

    // The rejected connection must never leak into Bob's OWN presence
    // summary — Charlie authenticating (honestly, as himself) on a
    // connection this device merely HOPED was Bob can never flip Bob's
    // own isConnectedNow to true, and must never fabricate a Charlie
    // conversation Alice never had.
    aliceSeesBob = alice.presence.getSummary(Bob.id);
    assert(aliceSeesBob.isConnectedNow === false, 'a rejected reconnect (genuinely Charlie) never marks Bob as connected');
    assert(aliceSeesBob.conversation.messageCount === 1 && aliceSeesBob.conversation.pendingOutboxCount === 1, 'Bob\'s durable conversation/outbox state is completely untouched by the rejected attempt');
    const aliceSeesCharlie = alice.presence.getSummary(Charlie.id);
    assert(aliceSeesCharlie.conversation.messageCount === 0 && aliceSeesCharlie.relationship === null,
        'no presence fact was ever fabricated for Charlie — he was never remembered, friended, or messaged');
    console.log('✓ SECURITY FLAGSHIP part 1: a rejected reconnect that genuinely authenticates as the wrong identity never corrupts the presence reconciliation for the identity actually expected');

    // A late, stale close() on the now-dead, already-rejected connection
    // object must not be able to retroactively change anything either —
    // the exact same regression tests/PeerConnectionResilience.test.js's
    // own FLAGSHIP part 2 already covers for the registry itself, checked
    // here one layer up, against the reconciled presence view.
    connectedPeer.close();
    await wait(10);
    aliceSeesBob = alice.presence.getSummary(Bob.id);
    assert(aliceSeesBob.isConnectedNow === false, 'a stale close() on the already-dead, rejected connection has no further effect on Bob\'s presence');

    // Now Bob genuinely reconnects — presence reconciles correctly, and
    // the earlier rejected detour never contaminated any of it.
    await reconnect(Alice, Bob);
    await wait(40);
    aliceSeesBob = alice.presence.getSummary(Bob.id);
    assert(aliceSeesBob.isConnectedNow === true, 'presence reconciles to online once Bob genuinely reconnects, after the earlier rejected attempt');
    assert(aliceSeesBob.conversation.pendingOutboxCount === 0, 'the original message, untouched throughout, is finally delivered and clears the outbox');
    console.log('✓ SECURITY FLAGSHIP part 2: a stale event from an already-rejected connection cannot corrupt presence, and a genuine later reconnect still reconciles correctly');

    setup.stopListening();
    aliceFriends.dispose(); bobFriends.dispose();
    alice.chat.dispose(); bobChat.dispose();
    alice.presence.dispose();
    reconnection.dispose();
}

console.log('\nAll Peer Presence & Conversation Lifecycle (0.2.70) tests passed.');
}

await runTests();
