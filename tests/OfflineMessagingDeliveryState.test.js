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
import { toChatMessage, deriveConversationId } from '../core/ChatMessage.js';
import { ChatOutboxEntry } from '../core/ChatOutboxEntry.js';
import { ChatDeliveryState, isValidChatDeliveryState } from '../core/ChatDeliveryState.js';
import { toChatDeliveryAck, isValidChatDeliveryAck } from '../core/ChatDeliveryAck.js';

// 0.2.63 — Reliable Offline Messaging & Delivery State.
//
// "What happens to a message when the recipient isn't connected?"
// 0.2.61 answered that on purpose with "it fails to send" — this file
// proves the NEW, deliberately separate answer `sendOrQueue()` gives
// without disturbing that original one: `sendMessage()` still throws
// immediately for an offline peer (see Scenario A below, mirroring
// tests/PeerChat.test.js's own Scenario G verbatim), while
// `sendOrQueue()` writes a durable, identity-addressed
// core/ChatOutboxEntry.js instead, and application/ChatUseCase.js's
// own reconnect-triggered flush — riding the SAME
// connectedPeerRegistry.onChange() subscription 0.2.61 already used to
// attach() every peer — delivers it the instant the recipient's
// PROVEN identity is AUTHENTICATED again. Built over
// peer/LocalPeerConnectionProvider.js and the exact
// connectDevices()/authenticate()/makeFriends() harness
// tests/PeerChat.test.js and tests/PeerConnectionResilience.test.js
// already trust for this purpose.

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

// Builds N fully independent devices sharing one LocalPeerNetwork, each
// with its own ConnectToPeerUseCase registry — the same harness
// tests/PeerChat.test.js/tests/PeerConnectionResilience.test.js already
// established.
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

// A SECOND (or third...) connection to an already-`authenticate()`d
// device — deliberately does NOT call `b.connect.listen()` again: `b`'s
// listener from the original `authenticate()` call is still active, and
// starting a second one would double-authenticate every future incoming
// connection on that transport. Only `a.connect.connect()` dials again.
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

// A minimal, honestly-labeled stand-in for application/
// PeerSessionManager.js's own createInvitation()/acceptInvitation()
// surface, identical to tests/PeerConnectionResilience.test.js's own
// makeFakeSessionManager() — see that file's own header for why this
// is enough to drive application/PeerReconnectionUseCase.js's own real
// logic against genuine authentication without needing real WebRTC.
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
// 1. core/ChatDeliveryState.js — closed vocabulary.
// ---------------------------------------------------------------------
{
    assert(isValidChatDeliveryState(ChatDeliveryState.QUEUED), 'QUEUED is a valid delivery state');
    assert(isValidChatDeliveryState(ChatDeliveryState.SENT), 'SENT is a valid delivery state');
    assert(isValidChatDeliveryState(ChatDeliveryState.DELIVERED), 'DELIVERED is a valid delivery state');
    assert(isValidChatDeliveryState(ChatDeliveryState.EXPIRED), 'EXPIRED is a valid delivery state');
    assert(!isValidChatDeliveryState('READ'), 'read receipts are not part of this closed vocabulary');
    assert(!isValidChatDeliveryState(undefined), 'undefined is not a valid delivery state');
    console.log('✓ core/ChatDeliveryState.js: a closed, four-value delivery vocabulary');
}

// ---------------------------------------------------------------------
// 2. core/ChatOutboxEntry.js — construction, expiry, immutable transitions.
// ---------------------------------------------------------------------
{
    const message = toChatMessage({ conversationId: deriveConversationId('alice', 'bob'), senderIdentity: 'alice', sequence: 1, body: 'Hi' });
    const entry = new ChatOutboxEntry({ message, peerIdentityId: 'bob', queuedAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 10000) });
    assert(entry.state === ChatDeliveryState.QUEUED, 'a freshly-constructed entry defaults to QUEUED');
    assert(!entry.isExpired(), 'an entry well within its TTL is not expired');

    const sent = entry.withState(ChatDeliveryState.SENT, { sentAt: new Date() });
    assert(sent.state === ChatDeliveryState.SENT && entry.state === ChatDeliveryState.QUEUED, 'withState() returns a NEW entry, never mutates the original — immutable, like core/PeerRelationship.js');
    assert(sent.message === entry.message, 'withState() never touches the underlying message');

    const alreadyExpired = new ChatOutboxEntry({ message, peerIdentityId: 'bob', queuedAt: new Date(Date.now() - 20000), expiresAt: new Date(Date.now() - 10000) });
    assert(alreadyExpired.isExpired(), 'an entry past its expiresAt is expired');
    const delivered = alreadyExpired.withState(ChatDeliveryState.DELIVERED, { deliveredAt: new Date() });
    assert(!delivered.isExpired(), 'a DELIVERED entry is never considered expired, regardless of its own expiresAt');

    const roundTripped = ChatOutboxEntry.fromJSON(sent.toJSON());
    assert(roundTripped.state === ChatDeliveryState.SENT && roundTripped.peerIdentityId === 'bob' && roundTripped.message.messageId === message.messageId, 'toJSON()/fromJSON() round-trips exactly');

    assert(ChatOutboxEntry.fromJSON(null) === null, 'fromJSON(null) degrades to null rather than throwing');
    assert(ChatOutboxEntry.fromJSON({ message: { not: 'a real chat message' }, peerIdentityId: 'bob' }) === null, 'fromJSON() degrades gracefully on a corrupted stored record — never throws, matching AvatarProfileUseCase\'s own read-path posture');

    let threw = false;
    try { new ChatOutboxEntry({ message, peerIdentityId: 'bob', state: 'READ' }); } catch { threw = true; }
    assert(threw, 'an unrecognized delivery state is refused at construction');
    console.log('✓ core/ChatOutboxEntry.js: immutable transitions, TTL expiry, and graceful degradation on corrupted storage');
}

// ---------------------------------------------------------------------
// 3. core/ChatDeliveryAck.js — the tiny, separate ack vocabulary.
// ---------------------------------------------------------------------
{
    const ack = toChatDeliveryAck({ messageId: 'msg-1', conversationId: 'conv-1', recipientIdentity: 'bob' });
    assert(isValidChatDeliveryAck(ack), 'a freshly-built ack validates');
    assert(!isValidChatDeliveryAck({ ...ack, messageId: '' }), 'empty messageId is invalid');
    assert(!isValidChatDeliveryAck({ ...ack, recipientIdentity: '' }), 'empty recipientIdentity is invalid');
    assert(!isValidChatDeliveryAck({ ...ack, acknowledgedAt: 'not-a-number' }), 'non-finite acknowledgedAt is invalid');
    let threw = false;
    try { toChatDeliveryAck({ conversationId: 'conv-1', recipientIdentity: 'bob' }); } catch { threw = true; }
    assert(threw, 'toChatDeliveryAck refuses a missing messageId');
    console.log('✓ core/ChatDeliveryAck.js: a small, independent wire shape, never folded into ChatMessage');
}

// ---------------------------------------------------------------------
// 4. application/ChatOutbox.js — enqueue/markSent/acknowledge/pruneExpired,
//    scoped per LOCAL owner, addressed by identity.
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const identityProvider = makeDevice('OutboxOwner', storage).provider;
    const outbox = new ChatOutbox(storage, identityProvider);
    const message = toChatMessage({ conversationId: deriveConversationId('me', 'bob'), senderIdentity: 'me', sequence: 1, body: 'Hi Bob' });

    assert(outbox.list().length === 0, 'a fresh outbox starts empty');
    const entry = outbox.enqueue(message, 'bob');
    assert(entry.state === ChatDeliveryState.QUEUED, 'enqueue() starts an entry at QUEUED');
    assert(outbox.list('bob').length === 1, 'list(peerIdentityId) filters to that one peer');
    assert(outbox.list('charlie').length === 0, 'a different peer identity sees nothing');

    assert(outbox.markSent('bob', 'never-queued') === null, 'markSent() on an unknown messageId is a harmless no-op');
    const sent = outbox.markSent('bob', message.messageId);
    assert(sent.state === ChatDeliveryState.SENT, 'markSent() transitions QUEUED -> SENT');
    assert(outbox.markSent('bob', message.messageId) === null, 'markSent() refuses to move an already-SENT entry a second time');

    assert(outbox.acknowledge('bob', 'unknown-message-id') === null, 'acknowledge() on an unknown messageId is a harmless no-op');
    const delivered = outbox.acknowledge('bob', message.messageId);
    assert(delivered.state === ChatDeliveryState.DELIVERED, 'acknowledge() transitions SENT -> DELIVERED');
    assert(outbox.list('bob').length === 0, 'a DELIVERED entry is removed from storage — the outbox is not a message database');
    assert(outbox.acknowledge('bob', message.messageId) === null, 'acknowledging an already-delivered (and now gone) entry is idempotent, never an error');

    // A second owner's outbox is completely independent storage.
    const otherStorage = new InMemoryStorageProvider();
    const otherIdentityProvider = makeDevice('OtherOwner', otherStorage).provider;
    const otherOutbox = new ChatOutbox(otherStorage, otherIdentityProvider);
    otherOutbox.enqueue(message, 'bob');
    assert(otherOutbox.list('bob').length === 1 && outbox.list('bob').length === 0, 'two owners\' outboxes never see each other\'s mail');

    // Expiry — a tiny ttlMs, checked lazily on read.
    const expiringMessage = toChatMessage({ conversationId: deriveConversationId('me', 'dora'), senderIdentity: 'me', sequence: 1, body: 'Soon to expire' });
    outbox.enqueue(expiringMessage, 'dora', { ttlMs: 10 });
    await wait(30);
    const pruned = outbox.pruneExpired('dora');
    assert(pruned.length === 1 && pruned[0].message.messageId === expiringMessage.messageId, 'pruneExpired() returns exactly the entries that just crossed their TTL');
    assert(outbox.list('dora').length === 0, 'an expired entry is removed from storage');
    console.log('✓ application/ChatOutbox.js: enqueue/markSent/acknowledge/pruneExpired, scoped per owner, addressed by identity');
}

// ---------------------------------------------------------------------
// FLAGSHIP — Alice and Bob, friends, over a real authenticated peer
// network. Bob goes offline; Alice queues a message; Bob reconnects;
// the message is delivered and acknowledged automatically.
// ---------------------------------------------------------------------
{
    const devices = await connectDevices(['Alice', 'Bob']);
    const { Alice, Bob } = devices;
    const setup = await authenticate(Alice, Bob);

    const aliceFriends = makeFriends(Alice.storage, Alice.identityProvider, Alice.connect.registry);
    const bobFriends = makeFriends(Bob.storage, Bob.identityProvider, Bob.connect.registry);
    await becomeFriends(aliceFriends, setup.peerFromA, bobFriends, setup.peerFromB);
    assert(aliceFriends.getState(Bob.id) === 'FRIEND' && bobFriends.getState(Alice.id) === 'FRIEND', 'setup: Alice and Bob are FRIEND on both sides');

    const aliceOutbox = new ChatOutbox(new InMemoryStorageProvider(), Alice.identityProvider);
    const aliceChat = new ChatUseCase(Alice.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Alice.connect.registry,
        friendRelationshipUseCase: aliceFriends, chatOutbox: aliceOutbox
    });
    const bobChat = new ChatUseCase(Bob.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Bob.connect.registry,
        friendRelationshipUseCase: bobFriends
    });

    // --- A. sendMessage() is completely unchanged: still fails outright
    //        against an offline peer, exactly like 0.2.61's own Scenario G.
    Bob.connect.registry.list().forEach((p) => p.close());
    await wait(30);
    let liveSendThrew = false;
    try { aliceChat.sendMessage(setup.peerFromA, 'Still live-only'); } catch { liveSendThrew = true; }
    assert(liveSendThrew, 'sendMessage() still throws immediately against a disconnected peer — 0.2.63 never changes what send() means');
    assert(aliceChat.getOutbox(Bob.id).length === 0, 'sendMessage() never touches the outbox at all');
    console.log('✓ SCENARIO A: sendMessage() keeps its exact 0.2.61 live-only meaning, untouched by 0.2.63');

    // --- B. sendOrQueue() while Bob is offline: queued, not delivered. --
    const queuedMessage = aliceChat.sendOrQueue(Bob.id, 'Are you there?');
    assert(aliceChat.getOutbox(Bob.id).length === 1, 'the message is sitting in Alice\'s own durable outbox');
    assert(aliceChat.getOutbox(Bob.id)[0].state === ChatDeliveryState.QUEUED, 'the outbox entry starts QUEUED — Bob is offline, nothing was transmitted');
    const queuedInTranscript = aliceChat.getConversation(Bob.id).find((m) => m.messageId === queuedMessage.messageId);
    assert(queuedInTranscript && queuedInTranscript.deliveryState === ChatDeliveryState.QUEUED, 'Alice\'s own live transcript shows the message as QUEUED immediately');
    assert(bobChat.getConversation(Alice.id).length === 0, 'Bob, being offline, has received nothing at all');
    console.log('✓ SCENARIO B: sendOrQueue() against an offline friend queues durably instead of throwing');

    // --- C. Bob reconnects: the SAME registry firing onChange is what
    //        triggers the automatic flush — no separate "check for mail" call.
    const reconnectA = await reconnect(Alice, Bob);
    await wait(30);
    assert(aliceChat.getOutbox(Bob.id).length === 0, 'the outbox entry is gone once acknowledged — delivered, not merely sent');
    assert(bobChat.getConversation(Alice.id).length === 1, 'Bob received exactly the one queued message, automatically, on reconnect');
    assert(bobChat.getConversation(Alice.id)[0].body === 'Are you there?', 'the delivered body matches exactly what Alice queued');
    const deliveredInTranscript = aliceChat.getConversation(Bob.id).find((m) => m.messageId === queuedMessage.messageId);
    assert(deliveredInTranscript.deliveryState === ChatDeliveryState.DELIVERED, 'Alice\'s own transcript copy progresses all the way to DELIVERED once Bob\'s ack lands');
    console.log('✓ FLAGSHIP: reconnection automatically flushes the outbox, and the sender learns DELIVERED via a real ack round-trip');

    // --- D. Retransmitting the exact same (now-delivered) message is
    //        harmless — Bob's own 0.2.61 replay window, completely
    //        unmodified, still rejects the duplicate content.
    const rawAliceBus = new PeerMessageBus();
    rawAliceBus.attach(reconnectA.peerFromA);
    const beforeRetransmit = bobChat.getConversation(Alice.id).length;
    rawAliceBus.send(reconnectA.peerFromA, ChatUseCase.DEFAULT_PROTOCOL, queuedMessage);
    await wait(30);
    assert(bobChat.getConversation(Alice.id).length === beforeRetransmit, 'a retransmit of an already-delivered message is silently ignored — no duplicate appended');
    console.log('✓ SCENARIO D: retransmitting a queued-then-delivered message after reconnect is harmless, exactly like a live duplicate already was in 0.2.61');

    // --- E. Multiple queued messages flush in this device\'s own sequence
    //        order, not send-call order or arrival order.
    reconnectA.peerFromA.close();
    await wait(20);
    const m1 = aliceChat.sendOrQueue(Bob.id, 'First');
    const m2 = aliceChat.sendOrQueue(Bob.id, 'Second');
    const m3 = aliceChat.sendOrQueue(Bob.id, 'Third');
    assert(aliceChat.getOutbox(Bob.id).length === 3, 'three messages are queued while Bob is offline');
    await reconnect(Alice, Bob);
    await wait(40);
    const bobsNewMessages = bobChat.getConversation(Alice.id).slice(-3);
    assert(bobsNewMessages.map((m) => m.body).join(',') === 'First,Second,Third', 'all three queued messages are delivered, in this device\'s own sequence order');
    assert(aliceChat.getOutbox(Bob.id).length === 0, 'the outbox is empty again once every queued message is acknowledged');
    console.log('✓ SCENARIO E: multiple queued messages flush in sequence order on reconnect');

    setup.stopListening();
    aliceFriends.dispose(); bobFriends.dispose();
    aliceChat.dispose(); bobChat.dispose();
}

// ---------------------------------------------------------------------
// SECURITY FLAGSHIP — Alice queues mail for Bob; a "reconnect" attempt
// actually authenticates as Charlie (0.2.62's own honest-mismatch
// scenario). Bob's queued mail must never be sent to Charlie, and must
// never be lost — see application/ChatUseCase.js's own header, "A
// Durable Outbox Is Addressed To An Identity, Never A Connection."
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

    const aliceOutbox = new ChatOutbox(new InMemoryStorageProvider(), Alice.identityProvider);
    const aliceChat = new ChatUseCase(Alice.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Alice.connect.registry,
        friendRelationshipUseCase: aliceFriends, chatOutbox: aliceOutbox
    });
    // Built up front, exactly like the FLAGSHIP block above, so it is
    // already listening on Bob's own registry when the real reconnect
    // happens at the end of this scenario — a ChatUseCase constructed
    // AFTER a message is already on the wire would simply never see it,
    // the same "attach before you can receive" requirement
    // peer/PeerMessageBus.js has always had.
    const bobChat = new ChatUseCase(Bob.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Bob.connect.registry,
        friendRelationshipUseCase: bobFriends
    });
    const charlieChat = new ChatUseCase(Charlie.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: Charlie.connect.registry,
        friendRelationshipUseCase: charlieFriends
    });

    // Alice remembers Bob WHILE still connected — a closed connection's
    // own peer/PeerAuthenticationSession.js discards remoteIdentity (see
    // application/PeerRelationship.js's own header), so this has to
    // happen before Bob goes offline below, exactly like
    // tests/PeerConnectionResilience.test.js's own FLAGSHIP captures it
    // before closing too.
    const relationships = new PeerRelationshipUseCase(Alice.storage, Alice.identityProvider);
    relationships.rememberPeer(setup.peerFromA.remoteIdentity, { alias: 'Bob' });

    // Bob goes offline; Alice queues a message for him.
    Bob.connect.registry.list().forEach((p) => p.close());
    await wait(20);
    aliceChat.sendOrQueue(Bob.id, 'Only for Bob\'s eyes');
    assert(aliceChat.getOutbox(Bob.id).length === 1, 'setup: a message is genuinely queued, addressed to Bob\'s identity');

    // Alice attempts to "Reconnect" to Bob — but the invitation she
    // actually has leads to Charlie, an entirely honest, unrelated
    // identity (the exact tests/PeerConnectionResilience.test.js
    // SECURITY FLAGSHIP scenario).
    const rejected = [];
    const fakeSessionManagerToCharlie = makeFakeSessionManager(Alice.connect, Charlie.transport.address);
    const reconnection = new PeerReconnectionUseCase({ peerSessionManager: fakeSessionManagerToCharlie, peerRelationshipUseCase: relationships });
    reconnection.onReconnectRejected((detail) => rejected.push(detail));

    const { connectedPeer } = await reconnection.reconnectAsInviter(Bob.id);
    await wait(30);

    assert(connectedPeer.getLifecycleState() === PeerLifecycleState.CLOSED, 'the connection genuinely authenticates as Charlie, and is rejected as a reconnect to Bob — unchanged 0.2.62 behavior');
    assert(rejected.length === 1 && rejected[0].actualIdentityId === Charlie.id, 'setup: the rejection is exactly the honest-mismatch case, not an impersonation of Bob');

    // The security property this milestone adds: Bob's queued mail was
    // never touched by any of this — not sent to Charlie, not lost.
    assert(aliceChat.getOutbox(Bob.id).length === 1, 'Bob\'s queued message is untouched — still QUEUED, never sent to Charlie and never dropped');
    assert(aliceChat.getOutbox(Bob.id)[0].state === ChatDeliveryState.QUEUED, 'the entry never advanced to SENT — no delivery was ever attempted against the wrong identity');
    assert(charlieChat.getConversation(Alice.id).length === 0, 'Charlie never received Alice\'s message content — there was never an outbox entry addressed to his identity in the first place');
    console.log('✓ SECURITY FLAGSHIP: a reconnect that genuinely authenticates as the wrong identity can never trigger delivery of, or lose, mail queued for the identity actually expected');

    // Now the REAL Bob reconnects — the still-QUEUED message is finally
    // delivered, proving nothing about it was corrupted by the detour.
    // bobChat was built up front (see this block's own comment above),
    // so it is already listening and receives it in real time.
    await reconnect(Alice, Bob);
    await wait(30);
    assert(aliceChat.getOutbox(Bob.id).length === 0, 'once Bob genuinely reconnects, the untouched QUEUED entry is finally delivered');
    const bobsMessages = bobChat.getConversation(Alice.id);
    assert(bobsMessages.length === 1 && bobsMessages[0].body === 'Only for Bob\'s eyes', 'Bob receives exactly the original message content, unchanged by the earlier rejected detour');

    setup.stopListening();
    aliceFriends.dispose(); bobFriends.dispose(); charlieFriends.dispose();
    aliceChat.dispose(); bobChat.dispose(); charlieChat.dispose();
    reconnection.dispose();
}

console.log('\nAll Reliable Offline Messaging & Delivery State (0.2.63) tests passed.');
}

await runTests();
