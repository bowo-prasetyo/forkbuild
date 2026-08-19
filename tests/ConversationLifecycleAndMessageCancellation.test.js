import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { FriendRelationshipUseCase } from '../application/FriendRelationshipUseCase.js';
import { PeerBlockUseCase } from '../application/PeerBlockUseCase.js';
import { ChatUseCase } from '../application/ChatUseCase.js';
import { ChatOutbox } from '../application/ChatOutbox.js';
import { ConversationStore } from '../application/ConversationStore.js';
import { ConversationReadOutbox } from '../application/ConversationReadOutbox.js';
import { RemoteReadReceiptStore } from '../application/RemoteReadReceiptStore.js';
import { ChatDeliveryState } from '../core/ChatDeliveryState.js';
import { toChatMessage } from '../core/ChatMessage.js';

// 0.2.72 — Conversation Lifecycle & Message Cancellation.
//
// "What happens when a message is no longer merely delivered or seen,
// but the local authorization for the conversation itself changes
// underneath it?" This file proves two genuinely different claims:
//
//   1. Social authorization controls what may happen NEXT; it never
//      rewrites what already happened. Blocking or unfriending a peer
//      never deletes conversation history, never un-reads an already-
//      read message, and never erases a peer's already-recorded read
//      receipt of THIS device's own messages — see
//      application/ChatUseCase.js's own header. This is proven directly
//      rather than merely assumed, because nothing NEW enforces it: the
//      guarantee already fell out of 0.2.69/0.2.70/0.2.71's own write-
//      ordering, and this milestone's job is to demonstrate that stays
//      true, not to add new code that makes it true.
//   2. A message already sitting QUEUED when its recipient's
//      eligibility is proactively withdrawn (block OR unfriend — see
//      this file's own FLAGSHIP for why both are treated identically,
//      never one strictly and the other loosely) is cancelled
//      IMMEDIATELY, never left to linger until an unrelated 7-day TTL
//      happens to expire it — core/ChatDeliveryState.js's new
//      CANCELLED value, kept genuinely distinct from EXPIRED.

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

// A full durable chat stack for one device — outbox/conversationStore/
// conversationReadOutbox/remoteReadReceiptStore/peerBlockUseCase all
// over the SAME InMemoryStorageProvider, mirroring
// tests/MessageReadStateSync.test.js's own makeChatStack().
function makeChatStack(device, registry, friends) {
    const outbox = new ChatOutbox(device.storage, device.identityProvider);
    const conversations = new ConversationStore(device.storage, device.identityProvider);
    const readOutbox = new ConversationReadOutbox(device.storage, device.identityProvider);
    const remoteReadReceipts = new RemoteReadReceiptStore(device.storage, device.identityProvider);
    const blocks = new PeerBlockUseCase(device.storage, device.identityProvider);
    const chat = new ChatUseCase(device.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: registry,
        friendRelationshipUseCase: friends, peerBlockUseCase: blocks, chatOutbox: outbox,
        conversationStore: conversations, conversationReadOutbox: readOutbox, remoteReadReceiptStore: remoteReadReceipts
    });
    return { outbox, conversations, readOutbox, remoteReadReceipts, blocks, chat };
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. core/ChatDeliveryState.js — CANCELLED is part of the vocabulary,
//    genuinely distinct from EXPIRED.
// ---------------------------------------------------------------------
{
    assert(ChatDeliveryState.CANCELLED === 'CANCELLED', 'CANCELLED is a real value in the vocabulary');
    assert(ChatDeliveryState.CANCELLED !== ChatDeliveryState.EXPIRED, 'CANCELLED and EXPIRED are genuinely different values — authorization vs. time');
    console.log('✓ core/ChatDeliveryState.js: CANCELLED is a fifth, distinct terminal value');
}

// ---------------------------------------------------------------------
// 2. application/ChatOutbox.js#cancel() — cancels only QUEUED entries
//    for the given peer, leaves SENT and every other peer untouched,
//    and is idempotent.
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const identityProvider = makeDevice('OutboxCancelOwner', storage).provider;
    const outbox = new ChatOutbox(storage, identityProvider);

    assert(outbox.cancel('bob').length === 0, 'cancelling a peer with nothing queued is a harmless no-op, never throws');

    const msg1 = toChatMessage({ conversationId: 'me|bob', senderIdentity: 'me', sequence: 1, body: 'one' });
    const msg2 = toChatMessage({ conversationId: 'me|bob', senderIdentity: 'me', sequence: 2, body: 'two' });
    const msg3 = toChatMessage({ conversationId: 'me|dora', senderIdentity: 'me', sequence: 1, body: 'hi dora' });
    outbox.enqueue(msg1, 'bob');
    outbox.enqueue(msg2, 'bob');
    outbox.enqueue(msg3, 'dora');
    outbox.markSent('bob', msg1.messageId);

    const cancelled = outbox.cancel('bob');
    assert(cancelled.length === 1 && cancelled[0].message.messageId === msg2.messageId, 'cancel() only ever matches QUEUED entries — a SENT one already reached the wire and is left alone');
    assert(outbox.list('bob').length === 1 && outbox.list('bob')[0].state === ChatDeliveryState.SENT, "bob's remaining SENT entry survives cancel() untouched");
    assert(outbox.list('dora').length === 1, "dora's own independent entry is completely unaffected by bob's cancellation");

    assert(outbox.cancel('bob').length === 0, 'cancelling the same peer again finds nothing left to cancel — idempotent, never throws or double-reports');
    console.log('✓ application/ChatOutbox.js#cancel(): QUEUED-only, per-peer scoped, idempotent');
}

// ---------------------------------------------------------------------
// 3. application/ConversationReadOutbox.js#cancel() — discards a
//    PENDING entry, leaves a SENT one alone, per-peer scoped.
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const identityProvider = makeDevice('ReadOutboxCancelOwner', storage).provider;
    const readOutbox = new ConversationReadOutbox(storage, identityProvider);

    assert(readOutbox.cancel('bob') === null, 'cancelling a peer with nothing pending is a harmless no-op, never throws');

    readOutbox.enqueue('bob', 5);
    readOutbox.enqueue('dora', 2);
    readOutbox.markSent('dora', 2);

    const cancelled = readOutbox.cancel('bob');
    assert(cancelled !== null && cancelled.readThroughSequence === 5, 'cancel() returns the discarded PENDING entry');
    assert(readOutbox.list('bob').length === 0, "bob's entry is gone entirely — a coalescing outbox has no history to preserve, unlike the message outbox");
    assert(readOutbox.cancel('dora') === null, 'cancel() never touches an entry that is already SENT — it already reached the wire');
    assert(readOutbox.list('dora').length === 1 && readOutbox.list('dora')[0].state === 'SENT', "dora's already-SENT entry is completely untouched");
    console.log('✓ application/ConversationReadOutbox.js#cancel(): PENDING-only, per-peer scoped');
}

// ---------------------------------------------------------------------
// FLAGSHIP — Alice queues a message for an offline Bob, then blocks
// him: the queued mail is cancelled IMMEDIATELY, never delivered even
// once Bob genuinely reconnects, while conversation history, "Seen"
// state, and Bob's own remote read receipt of Alice's PRIOR messages
// all survive completely untouched. A second scenario proves unfriend
// treats a queued message identically, and a post-block incoming
// message from Bob is rejected outright on Alice's side.
// ---------------------------------------------------------------------
{
    const devices = connectDevices(['Alice', 'Bob']);
    const { Alice, Bob } = devices;
    const setup = await authenticate(Alice, Bob);

    const aliceFriends = makeFriends(Alice.storage, Alice.identityProvider, Alice.connect.registry);
    const bobFriends = makeFriends(Bob.storage, Bob.identityProvider, Bob.connect.registry);
    await becomeFriends(aliceFriends, setup.peerFromA, bobFriends, setup.peerFromB);

    const alice = makeChatStack(Alice, Alice.connect.registry, aliceFriends);
    const bob = makeChatStack(Bob, Bob.connect.registry, bobFriends);
    // Captured while the connection is still live — PeerBlockRecord.fromIdentity()
    // only needs identityId/publicKey/algorithm, already proven by the real
    // handshake above, but a CLOSED connection's remoteIdentity goes null,
    // per the same bidirectional close semantics
    // tests/PeerConnectionResilience.test.js already exercises.
    const bobIdentity = { identityId: Bob.id, publicKey: setup.peerFromA.remoteIdentity.publicKey, algorithm: setup.peerFromA.remoteIdentity.algorithm };

    // --- A. Bob sends Alice #42 first, delivered and read, BEFORE any
    //        block happens — this is the history that must survive. ---
    bob.chat.sendMessage(setup.peerFromB, 'hello alice, this is #42');
    await wait(30);
    assert(alice.chat.getConversation(Bob.id).length === 1, 'setup: Alice received #42 from Bob');
    alice.chat.sendReadReceipt(Bob.id);
    await wait(30);
    assert(bob.chat.getPeerReadThroughSequence(Alice.id) === 1, "setup: Bob's own ChatUseCase reports Alice has read #42 — the 'Seen' fact this scenario must preserve");

    // --- B. Bob goes offline; Alice queues #57 for him. ----------------
    Bob.connect.registry.list().forEach((p) => p.close());
    await wait(20);
    const queued = alice.chat.sendOrQueue(Bob.id, 'this is #57, queued while Bob is offline');
    assert(alice.outbox.list(Bob.id).some((e) => e.message.messageId === queued.messageId && e.state === ChatDeliveryState.QUEUED),
        'setup: #57 sits QUEUED in the durable outbox — Bob never saw it');
    assert(alice.chat.getConversation(Bob.id).find((m) => m.messageId === queued.messageId).deliveryState === ChatDeliveryState.QUEUED,
        'setup: the conversation history itself also shows #57 as QUEUED');

    // --- C. Alice blocks Bob. #57 is cancelled IMMEDIATELY — no
    //        reconnect attempt required at all. ------------------------
    alice.blocks.block(bobIdentity);
    assert(alice.outbox.list(Bob.id).length === 0, '#57 is removed from the outbox the instant Alice blocks Bob, never waiting for a reconnect that may never come');
    const cancelledEntry = alice.chat.getConversation(Bob.id).find((m) => m.messageId === queued.messageId);
    assert(cancelledEntry.deliveryState === ChatDeliveryState.CANCELLED, '#57 is durably marked CANCELLED in conversation history — a fact about Alice\'s own withdrawn authorization, never about time');
    console.log('✓ FLAGSHIP part 1: blocking a peer with a QUEUED message cancels it proactively, the instant the block happens');

    // --- D. Bob genuinely reconnects as himself — #57 is still never
    //        delivered, because it no longer exists to flush. ----------
    await reconnect(Alice, Bob);
    await wait(40);
    assert(bob.chat.getConversation(Alice.id).every((m) => m.body !== queued.body), 'Bob never receives #57, even after genuinely reconnecting as himself');
    console.log('✓ FLAGSHIP part 2: a cancelled message is never delivered, even to a peer who genuinely reconnects afterward');

    // --- E. Everything that already happened stays exactly as it was:
    //        #42's content and delivery state, and Bob's own recorded
    //        knowledge that Alice read it. ------------------------------
    const preservedMsg42 = alice.chat.getConversation(Bob.id).find((m) => m.body.includes('#42'));
    assert(preservedMsg42 && preservedMsg42.deliveryState === null, "#42 (incoming, never queued) is completely untouched — Alice's conversation history with Bob is retained, never deleted by blocking");
    assert(bob.chat.getPeerReadThroughSequence(Alice.id) === 1, "Bob's own durable record that Alice read #42 survives the block untouched — historical truth is never rewritten by current authorization");
    assert(bob.remoteReadReceipts.getReadThroughSequence(Alice.id) === 1, 'the durable RemoteReadReceiptStore itself also stays exactly as it was');
    console.log('✓ FLAGSHIP part 3: conversation history and prior read state survive blocking completely untouched — social authorization never rewrites what already happened');

    // --- F. A message Bob sends AFTER the block is rejected outright on
    //        Alice's side — never stored, never shown. ------------------
    bob.chat.sendMessage(Bob.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === Alice.id), 'this is #43, sent after the block');
    await wait(30);
    assert(alice.chat.getConversation(Bob.id).every((m) => !m.body.includes('#43')), "#43 is refused outright on Alice's own ingestion boundary — blocking is checked fresh on every incoming message, exactly as it always was");
    console.log('✓ FLAGSHIP part 4: an incoming message from a now-blocked peer is refused, never stored');

    setup.stopListening();
    aliceFriends.dispose(); bobFriends.dispose();
    alice.chat.dispose(); bob.chat.dispose();
}

// ---------------------------------------------------------------------
// FLAGSHIP — Unfriending treats a QUEUED message identically to
// blocking: both proactively withdraw the SAME `canChat()` eligibility
// a fresh send is checked against, so a message already queued for a
// peer answers to that SAME check, never a softer one that only a
// block enforces. Unlike block(), `FriendRelationshipUseCase#unfriend()`
// itself REQUIRES a currently-authenticated connectedPeer (it is a real
// signed protocol message, not a unilateral local note) — so this
// scenario is scripted the one way it can actually happen: Ann's first
// chat session queues mail for an offline Bert and then ends (exactly
// like a closed browser tab) BEFORE Bert ever reconnects; only once
// he's back does Ann unfriend him, with no live ChatUseCase subscribed
// to react in the moment — proving `_reconcileCancellationsOnStartup()`
// closes an unfriend gap exactly the way it already does for a block.
// ---------------------------------------------------------------------
{
    const devices = connectDevices(['Ann', 'Bert']);
    const { Ann, Bert } = devices;
    const setup = await authenticate(Ann, Bert);

    const annFriends = makeFriends(Ann.storage, Ann.identityProvider, Ann.connect.registry);
    const bertFriends = makeFriends(Bert.storage, Bert.identityProvider, Bert.connect.registry);
    await becomeFriends(annFriends, setup.peerFromA, bertFriends, setup.peerFromB);

    const annOutbox = new ChatOutbox(Ann.storage, Ann.identityProvider);
    const annConversations = new ConversationStore(Ann.storage, Ann.identityProvider);
    const annReadOutbox = new ConversationReadOutbox(Ann.storage, Ann.identityProvider);
    const annRemoteReceipts = new RemoteReadReceiptStore(Ann.storage, Ann.identityProvider);
    const annBlocks = new PeerBlockUseCase(Ann.storage, Ann.identityProvider);
    const annChatSession1 = new ChatUseCase(Ann.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Ann.connect.registry,
        friendRelationshipUseCase: annFriends, peerBlockUseCase: annBlocks, chatOutbox: annOutbox,
        conversationStore: annConversations, conversationReadOutbox: annReadOutbox, remoteReadReceiptStore: annRemoteReceipts
    });

    Ann.connect.registry.list().forEach((p) => p.close());
    await wait(20);
    const queued = annChatSession1.sendOrQueue(Bert.id, 'queued before unfriending');
    assert(annOutbox.list(Bert.id).length === 1, 'setup: a message sits QUEUED for the now-offline Bert');

    // Ann's session ends — like closing the chat tab — unsubscribing
    // annChatSession1 from annFriends' change events entirely.
    annChatSession1.dispose();

    // Bert reconnects. No ChatUseCase is currently subscribed to
    // anything, so the QUEUED message stays exactly QUEUED — it is
    // never auto-flushed just because a connection exists.
    await reconnect(Ann, Bert);
    assert(annOutbox.list(Bert.id).length === 1, 'setup: reconnecting alone never flushes anything — only a live ChatUseCase subscription does that');
    const bertPeerFromAnn = Ann.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === Bert.id);

    // NOW Ann unfriends Bert, while he's genuinely connected — this is
    // the one shape `unfriend()` actually supports.
    annFriends.unfriend(bertPeerFromAnn);

    // A brand-new session, over the SAME durable storage: startup
    // reconciliation finds the still-QUEUED message addressed to a peer
    // who is no longer a friend, and cancels it — exactly the same
    // mechanism, and exactly the same outcome, as the block scenario
    // above.
    const annChatSession2 = new ChatUseCase(Ann.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Ann.connect.registry,
        friendRelationshipUseCase: annFriends, peerBlockUseCase: annBlocks, chatOutbox: annOutbox,
        conversationStore: annConversations, conversationReadOutbox: annReadOutbox, remoteReadReceiptStore: annRemoteReceipts
    });
    assert(annOutbox.list(Bert.id).length === 0, 'unfriending cancels the QUEUED message exactly like blocking does — canChat() eligibility was withdrawn either way');
    const entry = annChatSession2.getConversation(Bert.id).find((m) => m.messageId === queued.messageId);
    assert(entry.deliveryState === ChatDeliveryState.CANCELLED, 'the message is durably marked CANCELLED, not left QUEUED forever or silently dropped');
    console.log('✓ FLAGSHIP: unfriending a peer with a QUEUED message cancels it exactly like blocking — one eligibility check, never two');

    setup.stopListening();
    annFriends.dispose(); bertFriends.dispose();
    annChatSession2.dispose();
}

// ---------------------------------------------------------------------
// SECURITY FLAGSHIP — startup reconciliation catches a block/unfriend
// that happened in a PRIOR session with no live subscriber around to
// react to it, and cancellation is always addressed by identity, never
// leaking across peers.
// ---------------------------------------------------------------------
{
    const devices = connectDevices(['Xena', 'Yusuf', 'Zeke']);
    const { Xena, Yusuf, Zeke } = devices;
    const setupY = await authenticate(Xena, Yusuf);
    const setupZ = await authenticate(Xena, Zeke);

    const xenaFriends = makeFriends(Xena.storage, Xena.identityProvider, Xena.connect.registry);
    const yusufFriends = makeFriends(Yusuf.storage, Yusuf.identityProvider, Yusuf.connect.registry);
    const zekeFriends = makeFriends(Zeke.storage, Zeke.identityProvider, Zeke.connect.registry);
    await becomeFriends(xenaFriends, setupY.peerFromA, yusufFriends, setupY.peerFromB);
    await becomeFriends(xenaFriends, setupZ.peerFromA, zekeFriends, setupZ.peerFromB);
    // Captured while both connections are still live — see this file's
    // own earlier note on why a CLOSED connection's remoteIdentity goes
    // null.
    const yusufIdentity = { identityId: Yusuf.id, publicKey: setupY.peerFromA.remoteIdentity.publicKey, algorithm: setupY.peerFromA.remoteIdentity.algorithm };

    // First session: Xena's full chat stack, over durable storage she'll
    // reuse below. She queues mail for both Yusuf and Zeke while both are
    // offline, then this SESSION ends (disposed) WITHOUT ever blocking
    // anyone — so nothing here has cancelled anything yet.
    const xenaOutbox = new ChatOutbox(Xena.storage, Xena.identityProvider);
    const xenaConversations = new ConversationStore(Xena.storage, Xena.identityProvider);
    const xenaReadOutbox = new ConversationReadOutbox(Xena.storage, Xena.identityProvider);
    const xenaRemoteReceipts = new RemoteReadReceiptStore(Xena.storage, Xena.identityProvider);
    const xenaBlocks = new PeerBlockUseCase(Xena.storage, Xena.identityProvider);
    const xenaChatSession1 = new ChatUseCase(Xena.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Xena.connect.registry,
        friendRelationshipUseCase: xenaFriends, peerBlockUseCase: xenaBlocks, chatOutbox: xenaOutbox,
        conversationStore: xenaConversations, conversationReadOutbox: xenaReadOutbox, remoteReadReceiptStore: xenaRemoteReceipts
    });

    Xena.connect.registry.list().forEach((p) => p.close());
    await wait(20);
    const forYusuf = xenaChatSession1.sendOrQueue(Yusuf.id, 'queued for yusuf');
    const forZeke = xenaChatSession1.sendOrQueue(Zeke.id, 'queued for zeke');
    assert(xenaOutbox.list(Yusuf.id).length === 1 && xenaOutbox.list(Zeke.id).length === 1, 'setup: both peers have a QUEUED message');

    // The session ends — this is the moment a "prior session" ends,
    // unsubscribing xenaChatSession1 from xenaBlocks' change events.
    xenaChatSession1.dispose();

    // Xena blocks Yusuf ONLY, with no live ChatUseCase subscribed to
    // react to it — exactly the gap `_reconcileCancellationsOnStartup()`
    // exists for.
    xenaBlocks.block(yusufIdentity);
    assert(xenaOutbox.list(Yusuf.id).length === 1, "setup: Yusuf's mail is still QUEUED — nothing was subscribed to react to the block");

    // A brand-new session, over the SAME durable storage, reconciles on
    // construction: Yusuf's stale QUEUED mail is cancelled immediately,
    // while Zeke's — never blocked — is completely untouched.
    const xenaChatSession2 = new ChatUseCase(Xena.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Xena.connect.registry,
        friendRelationshipUseCase: xenaFriends, peerBlockUseCase: xenaBlocks, chatOutbox: xenaOutbox,
        conversationStore: xenaConversations, conversationReadOutbox: xenaReadOutbox, remoteReadReceiptStore: xenaRemoteReceipts
    });
    assert(xenaOutbox.list(Yusuf.id).length === 0, "a NEW session's startup reconciliation cancels Yusuf's stale QUEUED mail from a block that happened while no one was subscribed");
    const yusufEntry = xenaChatSession2.getConversation(Yusuf.id).find((m) => m.messageId === forYusuf.messageId);
    assert(yusufEntry.deliveryState === ChatDeliveryState.CANCELLED, "Yusuf's message is durably marked CANCELLED by the startup reconciliation pass");
    assert(xenaOutbox.list(Zeke.id).length === 1, "Zeke's own independent QUEUED mail is completely unaffected — cancellation is addressed by identity, never leaked across peers");
    const zekeEntry = xenaChatSession2.getConversation(Zeke.id).find((m) => m.messageId === forZeke.messageId);
    assert(zekeEntry.deliveryState === ChatDeliveryState.QUEUED, "Zeke's message is still genuinely QUEUED — startup reconciliation never touches a peer who was never blocked or unfriended");
    console.log('✓ SECURITY FLAGSHIP: a block from a prior session with no live subscriber is caught by startup reconciliation, addressed strictly by identity — never leaking to an unrelated peer');

    xenaChatSession2.dispose();
    xenaFriends.dispose(); yusufFriends.dispose(); zekeFriends.dispose();
}

console.log('\nAll Conversation Lifecycle & Message Cancellation (0.2.72) tests passed.');
}

await runTests();
