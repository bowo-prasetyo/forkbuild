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
import { ConversationStore, MAX_STORED_MESSAGES_PER_PEER } from '../application/ConversationStore.js';
import { ConversationEntry, ChatMessageDirection, isValidChatMessageDirection } from '../core/ConversationEntry.js';
import { toChatMessage, deriveConversationId } from '../core/ChatMessage.js';
import { ChatDeliveryState } from '../core/ChatDeliveryState.js';

// 0.2.69 — Reliable Offline Conversations.
//
// "What did Alice and Bob actually talk about?" — 0.2.61 deliberately
// deferred that question (application/LiveConversation.js's own
// header, "0.2.61 Ships Live Chat, Not A Message Database"). This file
// proves the narrow, purely-local answer 0.2.69 gives it: a NEW durable
// store (application/ConversationStore.js) that application/ChatUseCase.js
// writes through to on every message and every delivery-state
// transition, and rehydrates FROM on construction — so a simulated
// reload (a brand-new ChatUseCase instance over the SAME storage)
// continues the exact same conversation rather than starting a blank
// one, including its outgoing sequence numbering (so the recipient's
// own unmodified replay window doesn't reject a post-reload message as
// stale) and its delivery-state history (QUEUED/SENT/DELIVERED/EXPIRED
// survive the reload too). Built over the exact same
// peer/LocalPeerConnectionProvider.js harness
// tests/OfflineMessagingDeliveryState.test.js already established.

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

async function runTests() {

// ---------------------------------------------------------------------
// 1. core/ConversationEntry.js — construction, immutability, JSON round-trip.
// ---------------------------------------------------------------------
{
    assert(isValidChatMessageDirection(ChatMessageDirection.OUTGOING), 'outgoing is a valid direction');
    assert(isValidChatMessageDirection(ChatMessageDirection.INCOMING), 'incoming is a valid direction');
    assert(!isValidChatMessageDirection('sideways'), 'an unrecognized direction is invalid');

    const message = toChatMessage({ conversationId: deriveConversationId('alice', 'bob'), senderIdentity: 'alice', sequence: 1, body: 'Hi' });
    const entry = new ConversationEntry({ message, peerIdentityId: 'bob', direction: ChatMessageDirection.OUTGOING });
    assert(entry.deliveryState === null, 'a freshly-constructed entry defaults to no delivery state');

    const queued = entry.withDeliveryState(ChatDeliveryState.QUEUED);
    assert(queued.deliveryState === ChatDeliveryState.QUEUED && entry.deliveryState === null, 'withDeliveryState() returns a NEW entry, never mutates the original');
    assert(queued.message === entry.message, 'withDeliveryState() never touches the underlying message');

    const roundTripped = ConversationEntry.fromJSON(queued.toJSON());
    assert(roundTripped.deliveryState === ChatDeliveryState.QUEUED && roundTripped.peerIdentityId === 'bob' && roundTripped.direction === ChatMessageDirection.OUTGOING && roundTripped.message.messageId === message.messageId, 'toJSON()/fromJSON() round-trips exactly');

    assert(ConversationEntry.fromJSON(null) === null, 'fromJSON(null) degrades to null rather than throwing');
    assert(ConversationEntry.fromJSON({ message: { not: 'a real chat message' }, peerIdentityId: 'bob', direction: 'outgoing' }) === null, 'fromJSON() degrades gracefully on a corrupted stored record');

    let threw = false;
    try { new ConversationEntry({ message, peerIdentityId: 'bob', direction: 'sideways' }); } catch { threw = true; }
    assert(threw, 'an unrecognized direction is refused at construction');
    console.log('✓ core/ConversationEntry.js: immutable transitions and graceful degradation on corrupted storage');
}

// ---------------------------------------------------------------------
// 2. application/ConversationStore.js — append/list/updateDeliveryState/
//    conversations(), scoped per owner, idempotent, bounded.
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const identityProvider = makeDevice('StoreOwner', storage).provider;
    const store = new ConversationStore(storage, identityProvider);
    const message = toChatMessage({ conversationId: deriveConversationId('me', 'bob'), senderIdentity: 'me', sequence: 1, body: 'Hi Bob' });

    assert(store.list('bob').length === 0, 'a fresh store starts empty');
    const entry = store.append('bob', message, ChatMessageDirection.OUTGOING, ChatDeliveryState.QUEUED);
    assert(entry.deliveryState === ChatDeliveryState.QUEUED, 'append() stores the delivery state it was given');
    assert(store.list('bob').length === 1, 'list(peerIdentityId) filters to that one peer');
    assert(store.list('charlie').length === 0, 'a different peer identity sees nothing');

    const again = store.append('bob', message, ChatMessageDirection.OUTGOING, ChatDeliveryState.SENT);
    assert(again.deliveryState === ChatDeliveryState.QUEUED && store.list('bob').length === 1, 'append() is idempotent by messageId — a re-append of the same message never creates a duplicate or overwrites the stored state');

    const sent = store.updateDeliveryState('bob', message.messageId, ChatDeliveryState.SENT);
    assert(sent.deliveryState === ChatDeliveryState.SENT, 'updateDeliveryState() transitions the stored entry');
    assert(store.updateDeliveryState('bob', 'unknown-message-id', ChatDeliveryState.DELIVERED) === null, 'updateDeliveryState() on an unknown messageId is a harmless no-op, never throws');

    const incoming = toChatMessage({ conversationId: deriveConversationId('me', 'dora'), senderIdentity: 'dora', sequence: 1, body: 'Hello from Dora' });
    store.append('dora', incoming, ChatMessageDirection.INCOMING);
    const summaries = store.conversations();
    assert(summaries.length === 2, 'conversations() lists one summary per peer with any stored history');
    assert(summaries[0].peerIdentityId === 'dora', 'conversations() orders by most recently active first');
    assert(summaries.find((s) => s.peerIdentityId === 'bob').lastEntry.message.messageId === message.messageId, 'each summary carries that peer\'s own last entry');

    // A second owner's store is completely independent storage.
    const otherStorage = new InMemoryStorageProvider();
    const otherIdentityProvider = makeDevice('OtherStoreOwner', otherStorage).provider;
    const otherStore = new ConversationStore(otherStorage, otherIdentityProvider);
    assert(otherStore.list('bob').length === 0 && store.list('bob').length === 1, 'two owners\' conversation stores never see each other\'s history');

    // Per-peer cap — oldest entries for the SAME peer are dropped once
    // the cap is exceeded; a different peer's own history is untouched.
    const capStorage = new InMemoryStorageProvider();
    const capIdentityProvider = makeDevice('CapOwner', capStorage).provider;
    const capStore = new ConversationStore(capStorage, capIdentityProvider);
    for (let i = 1; i <= MAX_STORED_MESSAGES_PER_PEER + 10; i++) {
        capStore.append('eve', toChatMessage({ conversationId: deriveConversationId('me', 'eve'), senderIdentity: 'me', sequence: i, body: `msg ${i}` }), ChatMessageDirection.OUTGOING);
    }
    capStore.append('frank', toChatMessage({ conversationId: deriveConversationId('me', 'frank'), senderIdentity: 'me', sequence: 1, body: 'unrelated' }), ChatMessageDirection.OUTGOING);
    const evesHistory = capStore.list('eve');
    assert(evesHistory.length === MAX_STORED_MESSAGES_PER_PEER, 'a per-peer history beyond the cap is trimmed to the cap');
    assert(evesHistory[0].message.body === 'msg 11', 'the OLDEST entries are the ones dropped, never the newest');
    assert(capStore.list('frank').length === 1, 'a different peer\'s own history is completely unaffected by another peer\'s cap');
    console.log('✓ application/ConversationStore.js: append/list/updateDeliveryState/conversations(), idempotent, per-owner, per-peer bounded');
}

// ---------------------------------------------------------------------
// FLAGSHIP — Alice and Bob become friends; a full conversation
// (delivered, queued, reconnect-flushed) survives a simulated reload
// (a brand-new ChatUseCase over the SAME durable stores) intact —
// content, direction, delivery state, and outgoing sequence numbering.
// ---------------------------------------------------------------------
{
    const devices = connectDevices(['Alice', 'Bob']);
    const { Alice, Bob } = devices;
    const setup = await authenticate(Alice, Bob);

    const aliceFriends = makeFriends(Alice.storage, Alice.identityProvider, Alice.connect.registry);
    const bobFriends = makeFriends(Bob.storage, Bob.identityProvider, Bob.connect.registry);
    await becomeFriends(aliceFriends, setup.peerFromA, bobFriends, setup.peerFromB);
    assert(aliceFriends.getState(Bob.id) === 'FRIEND' && bobFriends.getState(Alice.id) === 'FRIEND', 'setup: Alice and Bob are FRIEND on both sides');

    // Alice's durable stores — SEPARATE storage keys, same underlying
    // InMemoryStorageProvider instance, the same way a real browser tab
    // would share one localStorage across both application/ChatOutbox.js
    // and application/ConversationStore.js.
    const aliceStorage = new InMemoryStorageProvider();
    const aliceOutbox = new ChatOutbox(aliceStorage, Alice.identityProvider);
    const aliceConversations = new ConversationStore(aliceStorage, Alice.identityProvider);
    let aliceChat = new ChatUseCase(Alice.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Alice.connect.registry,
        friendRelationshipUseCase: aliceFriends, chatOutbox: aliceOutbox, conversationStore: aliceConversations
    });
    let bobChat = new ChatUseCase(Bob.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Bob.connect.registry,
        friendRelationshipUseCase: bobFriends
    });

    // --- A. A delivered exchange while both are online. Uses
    //        sendOrQueue() — the same operation ui/views/ChatView.js's
    //        own compose box actually calls — so this message gets a
    //        real DELIVERED transition to persist and later verify,
    //        unlike sendMessage(), which never tracks delivery state at
    //        all (see application/ChatUseCase.js's own header).
    aliceChat.sendOrQueue(Bob.id, 'Hello Bob');
    await wait(20);
    assert(bobChat.getConversation(Alice.id).length === 1, 'Bob receives the first message');
    assert(aliceChat.getConversation(Bob.id)[0].deliveryState === ChatDeliveryState.DELIVERED, 'setup: the first message reaches DELIVERED while both are online');
    console.log('✓ SETUP: a delivered message precedes the reload scenario');

    // --- B. Bob goes offline; Alice queues a second message. ----------
    Bob.connect.registry.list().forEach((p) => p.close());
    await wait(20);
    const queuedMessage = aliceChat.sendOrQueue(Bob.id, 'Are you there?');
    assert(aliceChat.getOutbox(Bob.id).length === 1, 'the second message is genuinely queued, Bob is offline');
    const beforeReload = aliceChat.getConversation(Bob.id);
    assert(beforeReload.length === 2 && beforeReload[1].deliveryState === ChatDeliveryState.QUEUED, 'before reload: Alice sees both messages, the second one QUEUED');

    // --- C. Simulated reload: Alice's OWN process restarts. A brand-new
    //        ChatUseCase, over the exact SAME durable storage, with NO
    //        messages exchanged in between — proving persistence, not
    //        merely in-memory continuity.
    aliceChat.dispose();
    aliceChat = new ChatUseCase(Alice.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Alice.connect.registry,
        friendRelationshipUseCase: aliceFriends, chatOutbox: aliceOutbox, conversationStore: aliceConversations
    });
    const afterReload = aliceChat.getConversation(Bob.id);
    assert(afterReload.length === 2, 'after reload: the full conversation is restored, not lost');
    assert(afterReload[0].body === 'Hello Bob' && afterReload[0].deliveryState === ChatDeliveryState.DELIVERED, 'after reload: the first message keeps its content and its DELIVERED state');
    assert(afterReload[1].body === 'Are you there?' && afterReload[1].deliveryState === ChatDeliveryState.QUEUED, 'after reload: the second message keeps its content and its QUEUED state — nothing was silently marked delivered');
    assert(aliceChat.getConversations().length === 1, 'getConversations() lists the rehydrated conversation with zero messages exchanged yet THIS session');
    console.log('✓ RELOAD: a brand-new ChatUseCase over the same durable storage restores content, direction, and delivery state exactly');

    // --- D. The reloaded instance sends a THIRD message — proving
    //        `_nextSequence` was correctly re-seeded from durable
    //        history, not restarted at 1 (which Bob's own unmodified
    //        replay window would silently reject as stale, since it
    //        already accepted sequence 1 from Alice before the reload).
    const thirdMessage = aliceChat.sendOrQueue(Bob.id, 'Still there?');
    assert(thirdMessage.sequence === 3, 'the reloaded instance continues Alice\'s own outgoing sequence count (already at 2 from before reload) rather than restarting it at 1');
    console.log('✓ RELOAD: outgoing sequence numbering continues correctly after reload — no restart-at-1 replay hazard');

    // --- E. Bob reconnects for real: BOTH still-queued messages flush,
    //        and Alice's DURABLE copy — not merely her in-memory one —
    //        reaches DELIVERED.
    await reconnect(Alice, Bob);
    await wait(40);
    assert(aliceChat.getOutbox(Bob.id).length === 0, 'both queued messages are delivered and acknowledged');
    const bobsMessages = bobChat.getConversation(Alice.id);
    assert(bobsMessages.map((m) => m.body).join(',') === 'Hello Bob,Are you there?,Still there?', 'Bob receives all three messages, content and order intact');
    const finalHistory = aliceConversations.list(Bob.id);
    assert(finalHistory.every((entry) => entry.deliveryState === ChatDeliveryState.DELIVERED), 'the DURABLE conversation store itself — not just the live transcript — reflects DELIVERED for every message once acknowledged');
    console.log('✓ FLAGSHIP: a full conversation — delivered, queued, and reconnect-flushed — survives a reload with correct content, delivery state, and sequence numbering throughout');

    setup.stopListening();
    aliceFriends.dispose(); bobFriends.dispose();
    aliceChat.dispose(); bobChat.dispose();
}

// ---------------------------------------------------------------------
// SECURITY FLAGSHIP — a message queued for Bob is durably addressed to
// BOB'S IDENTITY, never a connection. A "reconnect" that genuinely
// authenticates as Charlie instead (0.2.62's own honest-mismatch
// scenario) must never write anything into Charlie's own conversation
// history, and must never corrupt or lose Bob's still-QUEUED entry —
// see application/ConversationStore.js's own header, "A Durable
// Conversation Store Is Addressed To An Identity, Never A Connection."
// ---------------------------------------------------------------------
{
    const three = connectDevices(['Alice3', 'Bob3', 'Charlie3']);
    const { Alice3: Alice, Bob3: Bob, Charlie3: Charlie } = three;
    const setup = await authenticate(Alice, Bob);
    Charlie.connect.listen();

    const aliceFriends = makeFriends(Alice.storage, Alice.identityProvider, Alice.connect.registry);
    const bobFriends = makeFriends(Bob.storage, Bob.identityProvider, Bob.connect.registry);
    const charlieFriends = makeFriends(Charlie.storage, Charlie.identityProvider, Charlie.connect.registry);
    await becomeFriends(aliceFriends, setup.peerFromA, bobFriends, setup.peerFromB);

    const aliceStorage = new InMemoryStorageProvider();
    const aliceOutbox = new ChatOutbox(aliceStorage, Alice.identityProvider);
    const aliceConversations = new ConversationStore(aliceStorage, Alice.identityProvider);
    const aliceChat = new ChatUseCase(Alice.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Alice.connect.registry,
        friendRelationshipUseCase: aliceFriends, chatOutbox: aliceOutbox, conversationStore: aliceConversations
    });
    const bobChat = new ChatUseCase(Bob.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Bob.connect.registry,
        friendRelationshipUseCase: bobFriends
    });
    const charlieChat = new ChatUseCase(Charlie.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Charlie.connect.registry,
        friendRelationshipUseCase: charlieFriends
    });

    const relationships = new PeerRelationshipUseCase(Alice.storage, Alice.identityProvider);
    relationships.rememberPeer(setup.peerFromA.remoteIdentity, { alias: 'Bob' });

    Bob.connect.registry.list().forEach((p) => p.close());
    await wait(20);
    aliceChat.sendOrQueue(Bob.id, 'Only for Bob\'s eyes');
    assert(aliceConversations.list(Bob.id).length === 1 && aliceConversations.list(Bob.id)[0].deliveryState === ChatDeliveryState.QUEUED, 'setup: the message is durably recorded, addressed to Bob\'s identity, still QUEUED');

    const rejected = [];
    const fakeSessionManagerToCharlie = makeFakeSessionManager(Alice.connect, Charlie.transport.address);
    const reconnection = new PeerReconnectionUseCase({ peerSessionManager: fakeSessionManagerToCharlie, peerRelationshipUseCase: relationships });
    reconnection.onReconnectRejected((detail) => rejected.push(detail));

    const { connectedPeer } = await reconnection.reconnectAsInviter(Bob.id);
    await wait(30);

    assert(connectedPeer.getLifecycleState() === PeerLifecycleState.CLOSED, 'the connection genuinely authenticates as Charlie, and is rejected as a reconnect to Bob');
    assert(rejected.length === 1 && rejected[0].actualIdentityId === Charlie.id, 'setup: the rejection is the honest-mismatch case');

    assert(aliceConversations.list(Bob.id).length === 1 && aliceConversations.list(Bob.id)[0].deliveryState === ChatDeliveryState.QUEUED, 'Bob\'s durable conversation entry is untouched — still exactly one message, still QUEUED');
    assert(aliceConversations.list(Charlie.id).length === 0, 'nothing was ever written to a conversation addressed to Charlie — there was no outbox entry addressed to him to flush in the first place');
    assert(charlieChat.getConversation(Alice.id).length === 0, 'Charlie never received Alice\'s message content');
    console.log('✓ SECURITY FLAGSHIP: a reconnect that genuinely authenticates as the wrong identity can never write into, corrupt, or lose the durable conversation history addressed to the identity actually expected');

    await reconnect(Alice, Bob);
    await wait(30);
    assert(aliceConversations.list(Bob.id)[0].deliveryState === ChatDeliveryState.DELIVERED, 'once Bob genuinely reconnects, the untouched durable entry is finally marked DELIVERED');
    const bobsMessages = bobChat.getConversation(Alice.id);
    assert(bobsMessages.length === 1 && bobsMessages[0].body === 'Only for Bob\'s eyes', 'Bob receives exactly the original message content, unchanged by the earlier rejected detour');

    setup.stopListening();
    aliceFriends.dispose(); bobFriends.dispose(); charlieFriends.dispose();
    aliceChat.dispose(); bobChat.dispose(); charlieChat.dispose();
    reconnection.dispose();
}

console.log('\nAll Reliable Offline Conversations (0.2.69) tests passed.');
}

await runTests();
