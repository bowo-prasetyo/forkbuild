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
import { ConversationReadOutbox } from '../application/ConversationReadOutbox.js';
import { RemoteReadReceiptStore } from '../application/RemoteReadReceiptStore.js';
import { ConversationReadOutboxEntry, ReadReceiptOutboxState } from '../core/ConversationReadOutboxEntry.js';
import { RemoteReadReceipt } from '../core/RemoteReadReceipt.js';
import { toChatReadReceipt, isValidChatReadReceipt } from '../core/ChatReadReceipt.js';
import { toChatMessage, deriveConversationId } from '../core/ChatMessage.js';

// 0.2.71 — Explicit Read Acknowledgement.
//
// 0.2.70's `application/ConversationReadTracker.js` deliberately only
// ever answered "what has THIS device seen" — a local, unsigned,
// never-transmitted note. This file proves the genuinely different
// question 0.2.71 adds on top of it, without ever touching that
// class: "what does the OTHER participant know that I have seen?" —
// a real, authenticated, peer-bound network fact, carried on its own
// wire protocol (`ChatUseCase.READ_PROTOCOL`), queued through its own
// coalescing outbox (`application/ConversationReadOutbox.js`) when the
// recipient isn't reachable yet, and recorded on arrival in its own
// store (`application/RemoteReadReceiptStore.js`) — never derived from,
// and never a transmission of, the local marker. See
// application/ChatUseCase.js's own header, and docs/Principles.md, "A
// Read Receipt Is Computed Independently From The Local Read Marker,
// Never Transmitted From It" (0.2.71).

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

// A durable chat stack for one device: outbox/conversationStore/
// conversationReadOutbox/remoteReadReceiptStore all over the SAME
// InMemoryStorageProvider, exactly the way a real browser tab would
// share one localStorage across all four — mirrors
// tests/PeerPresenceConversationLifecycle.test.js's own makeChatStack().
function makeChatStack(device, registry, friends) {
    const outbox = new ChatOutbox(device.storage, device.identityProvider);
    const conversations = new ConversationStore(device.storage, device.identityProvider);
    const readOutbox = new ConversationReadOutbox(device.storage, device.identityProvider);
    const remoteReadReceipts = new RemoteReadReceiptStore(device.storage, device.identityProvider);
    const chat = new ChatUseCase(device.identityProvider, {
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: registry,
        friendRelationshipUseCase: friends, chatOutbox: outbox, conversationStore: conversations,
        conversationReadOutbox: readOutbox, remoteReadReceiptStore: remoteReadReceipts
    });
    return { outbox, conversations, readOutbox, remoteReadReceipts, chat };
}

async function runTests() {

// ---------------------------------------------------------------------
// 1. core/ChatReadReceipt.js — construction and structural validity.
// ---------------------------------------------------------------------
{
    const receipt = toChatReadReceipt({ conversationId: 'alice|bob', readerIdentity: 'alice', readThroughSequence: 5 });
    assert(isValidChatReadReceipt(receipt), 'a well-formed receipt validates');
    assert(receipt.readThroughSequence === 5, 'readThroughSequence is carried verbatim');

    assert(!isValidChatReadReceipt(null), 'null is never valid');
    assert(!isValidChatReadReceipt({ ...receipt, readThroughSequence: 0 }), 'a zero readThroughSequence is invalid — there is nothing to acknowledge');
    assert(!isValidChatReadReceipt({ ...receipt, readThroughSequence: -1 }), 'a negative readThroughSequence is invalid');
    assert(!isValidChatReadReceipt({ ...receipt, readerIdentity: '' }), 'an empty readerIdentity is invalid');
    assert(!isValidChatReadReceipt({ ...receipt, conversationId: '' }), 'an empty conversationId is invalid');

    let threw = false;
    try { toChatReadReceipt({ conversationId: 'alice|bob', readerIdentity: 'alice', readThroughSequence: 0 }); } catch { threw = true; }
    assert(threw, 'toChatReadReceipt() refuses a non-positive readThroughSequence at construction');
    console.log('✓ core/ChatReadReceipt.js: construction and structural validity, independent of core/ChatMessage.js and core/ChatDeliveryAck.js');
}

// ---------------------------------------------------------------------
// 2. core/ConversationReadOutboxEntry.js — coalescing, never a per-
//    message log.
// ---------------------------------------------------------------------
{
    const entry = new ConversationReadOutboxEntry({ peerIdentityId: 'bob', readThroughSequence: 5 });
    assert(entry.state === ReadReceiptOutboxState.PENDING, 'a freshly-constructed entry starts PENDING');

    const same = entry.withReadThroughSequence(5);
    assert(same === entry, 'an equal sequence coalesces to the SAME entry — no new object, no state change');

    const lower = entry.withReadThroughSequence(3);
    assert(lower === entry, 'a LOWER sequence never regresses — the entry is returned unchanged');

    const sent = entry.withState(ReadReceiptOutboxState.SENT);
    assert(sent.state === ReadReceiptOutboxState.SENT && entry.state === ReadReceiptOutboxState.PENDING, 'withState() returns a NEW entry, never mutates the original');

    const advancedAfterSent = sent.withReadThroughSequence(9);
    assert(advancedAfterSent.readThroughSequence === 9 && advancedAfterSent.state === ReadReceiptOutboxState.PENDING,
        'a genuinely HIGHER sequence returns to PENDING even from an already-SENT entry — new information always needs (re)sending');

    const roundTripped = ConversationReadOutboxEntry.fromJSON(sent.toJSON());
    assert(roundTripped.peerIdentityId === 'bob' && roundTripped.readThroughSequence === 5 && roundTripped.state === ReadReceiptOutboxState.SENT, 'toJSON()/fromJSON() round-trips exactly');
    assert(ConversationReadOutboxEntry.fromJSON(null) === null, 'fromJSON(null) degrades to null rather than throwing');
    assert(ConversationReadOutboxEntry.fromJSON({ peerIdentityId: 'bob', readThroughSequence: 0 }) === null, 'fromJSON() degrades gracefully on a corrupted stored record (non-positive sequence)');
    console.log('✓ core/ConversationReadOutboxEntry.js: coalesces rather than accumulates, and immutability holds across every transition');
}

// ---------------------------------------------------------------------
// 3. core/RemoteReadReceipt.js — the mirror-image, opposite-direction
//    value object; monotonic, never regresses.
// ---------------------------------------------------------------------
{
    const receipt = new RemoteReadReceipt({ peerIdentityId: 'alice' });
    assert(receipt.readThroughSequence === 0, 'a freshly-constructed receipt defaults to readThroughSequence 0');

    const advanced = receipt.withReadThroughSequence(4);
    assert(advanced.readThroughSequence === 4 && receipt.readThroughSequence === 0, 'withReadThroughSequence() returns a NEW receipt, never mutates the original');

    const regressed = advanced.withReadThroughSequence(1);
    assert(regressed.readThroughSequence === 4, 'withReadThroughSequence() never regresses below the current high-water mark');

    const roundTripped = RemoteReadReceipt.fromJSON(advanced.toJSON());
    assert(roundTripped.peerIdentityId === 'alice' && roundTripped.readThroughSequence === 4, 'toJSON()/fromJSON() round-trips exactly');
    assert(RemoteReadReceipt.fromJSON({ peerIdentityId: 'alice', readThroughSequence: -1 }) === null, 'fromJSON() degrades gracefully on a corrupted stored record');
    console.log('✓ core/RemoteReadReceipt.js: monotonic, immutable, and structurally independent from core/ConversationReadMarker.js');
}

// ---------------------------------------------------------------------
// 4. application/ConversationReadOutbox.js — one entry per peer,
//    coalescing, PENDING/SENT, durable, per-owner scoped.
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const identityProvider = makeDevice('ReadOutboxOwner', storage).provider;
    const outbox = new ConversationReadOutbox(storage, identityProvider);

    assert(outbox.list('bob').length === 0, 'a peer with nothing queued reads back as an empty list, never throws');

    outbox.enqueue('bob', 5);
    outbox.enqueue('bob', 3); // lower — must not regress or add a second entry
    outbox.enqueue('bob', 9); // higher — coalesces into the SAME single entry
    const bobEntries = outbox.list('bob');
    assert(bobEntries.length === 1, 'repeated enqueue() calls for one peer never accumulate more than ONE entry');
    assert(bobEntries[0].readThroughSequence === 9, 'the single entry always reflects the HIGHEST sequence ever enqueued');
    assert(outbox.pending('bob').length === 1, 'a freshly-enqueued entry is PENDING');

    const sent = outbox.markSent('bob', 9);
    assert(sent.state === ReadReceiptOutboxState.SENT, 'markSent() transitions the matching entry to SENT');
    assert(outbox.pending('bob').length === 0, 'a SENT entry no longer appears in pending()');
    assert(outbox.markSent('bob', 9) === null, 'markSent() is a no-op against an entry that is no longer PENDING — never double-transitions');
    assert(outbox.markSent('bob', 5) === null, 'markSent() refuses to transition an entry whose CURRENT sequence no longer matches (stale call)');

    outbox.enqueue('bob', 12);
    assert(outbox.pending('bob').length === 1 && outbox.list('bob')[0].readThroughSequence === 12, 'a genuinely newer value returns the SAME peer entry to PENDING');

    outbox.enqueue('dora', 2);
    assert(outbox.list().length === 2, 'a different peer gets its OWN independent entry');
    assert(outbox.pending().length === 2, 'pending() with no filter returns every PENDING entry across all peers');

    const otherStorage = new InMemoryStorageProvider();
    const otherProvider = makeDevice('OtherReadOutboxOwner', otherStorage).provider;
    const otherOutbox = new ConversationReadOutbox(otherStorage, otherProvider);
    assert(otherOutbox.list().length === 0 && outbox.list().length === 2, "two owners' read outboxes never see each other's state");

    const reloaded = new ConversationReadOutbox(storage, identityProvider);
    assert(reloaded.list('bob')[0].readThroughSequence === 12, 'a brand-new ConversationReadOutbox over the same storage restores durable state');
    console.log('✓ application/ConversationReadOutbox.js: coalescing, PENDING/SENT, durable, per-owner scoped');
}

// ---------------------------------------------------------------------
// 5. application/RemoteReadReceiptStore.js — durable, monotonic,
//    per-owner, the opposite-direction store from
//    application/ConversationReadTracker.js.
// ---------------------------------------------------------------------
{
    const storage = new InMemoryStorageProvider();
    const identityProvider = makeDevice('RemoteReceiptOwner', storage).provider;
    const store = new RemoteReadReceiptStore(storage, identityProvider);

    assert(store.getReadThroughSequence('alice') === 0, 'an unknown peer reads back as 0, never null/undefined');

    store.recordReadThrough('alice', 4);
    assert(store.getReadThroughSequence('alice') === 4, 'recordReadThrough() advances a fresh record');

    store.recordReadThrough('alice', 1);
    assert(store.getReadThroughSequence('alice') === 4, 'recordReadThrough() with a LOWER sequence never regresses the durable high-water mark');

    store.recordReadThrough('alice', 8);
    assert(store.getReadThroughSequence('alice') === 8, 'recordReadThrough() with a HIGHER sequence advances the durable high-water mark');
    assert(store.getReadThroughSequence('charlie') === 0, 'a different peer is completely unaffected');

    const reloaded = new RemoteReadReceiptStore(storage, identityProvider);
    assert(reloaded.getReadThroughSequence('alice') === 8, 'a brand-new RemoteReadReceiptStore over the same storage restores durable state');
    console.log('✓ application/RemoteReadReceiptStore.js: durable, monotonic, per-owner — the received-claim counterpart to the local read marker');
}

// ---------------------------------------------------------------------
// FLAGSHIP — Bob sends three messages; Alice reads them while offline;
// her queued, coalesced read acknowledgement survives the disconnect
// and reaches Bob correctly once she genuinely reconnects.
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

    // --- A. Bob sends three messages; Alice receives all three. -------
    bob.chat.sendMessage(setup.peerFromB, 'one');
    bob.chat.sendMessage(setup.peerFromB, 'two');
    bob.chat.sendMessage(setup.peerFromB, 'three');
    await wait(30);
    assert(alice.chat.getConversation(Bob.id).length === 3, 'Alice receives all three messages');
    assert(alice.chat.getPeerReadThroughSequence(Bob.id) === 0, "getPeerReadThroughSequence() reads what BOB has told Alice about HER OWN messages — Alice hasn't sent Bob anything yet, so this reads 0, unrelated to the three messages Bob just sent her");

    // --- B. Alice goes offline, THEN marks the conversation read — the
    //        acknowledgement must be genuinely QUEUED, not a lucky
    //        SENT-before-disconnect timing accident. ------------------
    Alice.connect.registry.list().forEach((p) => p.close());
    await wait(20);
    const acknowledged = alice.chat.sendReadReceipt(Bob.id);
    assert(acknowledged === 3, 'sendReadReceipt() returns the highest incoming sequence it computed, independent of connectivity');
    assert(alice.readOutbox.pending(Bob.id).length === 1 && alice.readOutbox.pending(Bob.id)[0].readThroughSequence === 3,
        'the acknowledgement is durably QUEUED while Alice is offline, coalesced to a single entry');
    assert(bob.remoteReadReceipts.getReadThroughSequence(Alice.id) === 0, 'Bob has received nothing yet — his own store is untouched while Alice is offline');

    // Calling it again (e.g. the UI re-rendering) must not pile up a
    // second queued entry — see application/ConversationReadOutbox.js's
    // own coalescing guarantee.
    alice.chat.sendReadReceipt(Bob.id);
    assert(alice.readOutbox.list(Bob.id).length === 1, 'a repeated sendReadReceipt() call for the same peer never accumulates a second queued entry');
    console.log('✓ FLAGSHIP part 1: a read acknowledgement is genuinely queued, coalesced, and independent of connectivity');

    // --- C. Alice genuinely reconnects: the queued acknowledgement
    //        flushes and Bob durably records it. ----------------------
    await reconnect(Alice, Bob);
    await wait(40);
    assert(alice.readOutbox.pending(Bob.id).length === 0, 'the queued acknowledgement is flushed once Alice reconnects');
    assert(bob.chat.getPeerReadThroughSequence(Alice.id) === 3, "Bob's ChatUseCase now reports Alice has read through sequence 3");
    assert(bob.remoteReadReceipts.getReadThroughSequence(Alice.id) === 3, 'the durable RemoteReadReceiptStore reflects the same fact');
    console.log('✓ FLAGSHIP part 2: reconnect flushes the coalesced acknowledgement, and the recipient durably records it');

    // --- D. Out-of-order/duplicate arrival is harmless by construction
    //        — a lower or equal receipt sent directly never regresses
    //        what Bob already recorded. ---------------------------------
    const bobPeerFromA = Bob.connect.registry.list().find((p) => p.remoteIdentity && p.remoteIdentity.identityId === Alice.id);
    const rawBus = new PeerMessageBus();
    rawBus.attach(bobPeerFromA);
    const staleConversationId = deriveConversationId(Alice.id, Bob.id);
    rawBus.send(bobPeerFromA, ChatUseCase.READ_PROTOCOL, toChatReadReceipt({ conversationId: staleConversationId, readerIdentity: Alice.id, readThroughSequence: 1 }));
    await wait(20);
    assert(bob.chat.getPeerReadThroughSequence(Alice.id) === 3, 'a stale/lower read receipt arriving late never regresses the recorded high-water mark');
    console.log('✓ FLAGSHIP part 3: a stale or duplicate read receipt is absorbed harmlessly, with no replay window needed');

    setup.stopListening();
    aliceFriends.dispose(); bobFriends.dispose();
    alice.chat.dispose(); bob.chat.dispose();
}

// ---------------------------------------------------------------------
// SECURITY FLAGSHIP — forged sender, and a rejected wrong-identity
// reconnect, must never let a read acknowledgement reach or be
// attributed to the wrong party.
// ---------------------------------------------------------------------
{
    const three = connectDevices(['Alice2', 'Bob2', 'Charlie2']);
    const { Alice2: Alice, Bob2: Bob, Charlie2: Charlie } = three;
    Charlie.connect.listen(); // Charlie also answers on his own address — needed both for his honest connection to Bob below, and for part B's "Alice dials what she hopes is Bob, but it's genuinely Charlie" scenario
    const setup = await authenticate(Alice, Bob);
    // Charlie also genuinely, honestly authenticates to Bob as himself —
    // deliberately using reconnect() here, not authenticate(): Bob is
    // ALREADY listening from the call above, and a second listen() call
    // would register a SECOND incoming-connection handler that double-
    // authenticates every future connection to Bob, corrupting his
    // registry — reconnect() dials only, reusing the one listener
    // already active, the same way a real app calls listen() exactly
    // once per identity.
    const acSetup = await reconnect(Charlie, Bob, {});

    const aliceFriends = makeFriends(Alice.storage, Alice.identityProvider, Alice.connect.registry);
    const bobFriends = makeFriends(Bob.storage, Bob.identityProvider, Bob.connect.registry);
    const charlieFriends = makeFriends(Charlie.storage, Charlie.identityProvider, Charlie.connect.registry);
    await becomeFriends(aliceFriends, setup.peerFromA, bobFriends, setup.peerFromB);
    // Charlie is honestly connected to Bob but NEVER becomes a friend —
    // exactly the posture the forged-sender attack below needs.

    const alice = makeChatStack(Alice, Alice.connect.registry, aliceFriends);
    const bob = makeChatStack(Bob, Bob.connect.registry, bobFriends);
    const aliceRelationships = new PeerRelationshipUseCase(Alice.storage, Alice.identityProvider);
    // Remembered WHILE the connection is still live — closing Bob's end
    // below (part B) closes Alice's own connection object right along
    // with it, per the same bidirectional close semantics
    // tests/PeerConnectionResilience.test.js already exercises.
    aliceRelationships.rememberPeer(setup.peerFromA.remoteIdentity, { alias: 'Bob' });

    bob.chat.sendMessage(setup.peerFromB, 'hello alice');
    await wait(20);
    assert(alice.chat.getConversation(Bob.id).length === 1, 'setup: Alice has one message from Bob to acknowledge');

    // --- A. Forged sender — Charlie, genuinely authenticated to Bob AS
    //        HIMSELF, crafts a read receipt CLAIMING to be Alice. -------
    const forgedReceipt = toChatReadReceipt({
        conversationId: deriveConversationId(Alice.id, Bob.id), // claims the Alice<->Bob conversation
        readerIdentity: Alice.id, // claims to be Alice
        readThroughSequence: 1
    });
    const charlieRawBus = new PeerMessageBus();
    charlieRawBus.attach(acSetup.peerFromA); // Charlie's own, genuinely-authenticated connection to Bob
    charlieRawBus.send(acSetup.peerFromA, ChatUseCase.READ_PROTOCOL, forgedReceipt);
    await wait(20);
    assert(bob.chat.getPeerReadThroughSequence(Alice.id) === 0, "a forged readerIdentity is rejected — Charlie's real, authenticated identity never matches the claimed reader");
    assert(bob.remoteReadReceipts.getReadThroughSequence(Charlie.id) === 0, 'the forged claim is not attributed to Charlie either — it is simply dropped, not silently re-addressed');
    console.log('✓ SECURITY FLAGSHIP part 1: a forged readerIdentity (Charlie claiming to be Alice) is rejected outright');

    // --- B. Alice queues a read acknowledgement for Bob while Bob is
    //        genuinely offline, THEN a "reconnect" attempt actually
    //        authenticates as Charlie instead — extending 0.2.62's own
    //        stale-incarnation defense into this new layer. -----------
    Bob.connect.registry.list().forEach((p) => p.close());
    await wait(20);
    alice.chat.sendReadReceipt(Bob.id);
    assert(alice.readOutbox.pending(Bob.id).length === 1, 'setup: a read acknowledgement is durably queued for Bob while he is genuinely offline');

    const fakeSessionManagerToCharlie = makeFakeSessionManager(Alice.connect, Charlie.transport.address);
    const reconnection = new PeerReconnectionUseCase({ peerSessionManager: fakeSessionManagerToCharlie, peerRelationshipUseCase: aliceRelationships });
    const rejected = [];
    reconnection.onReconnectRejected((detail) => rejected.push(detail));
    const { connectedPeer } = await reconnection.reconnectAsInviter(Bob.id);
    await wait(30);
    assert(connectedPeer.getLifecycleState() === PeerLifecycleState.CLOSED, 'setup: the connection genuinely authenticates as Charlie and is rejected as a reconnect to Bob');
    assert(rejected.length === 1, 'setup: the rejection fires exactly once');
    assert(alice.readOutbox.pending(Bob.id).length === 1, "Bob's queued read acknowledgement survives the rejected detour, completely untouched");
    assert(charlieFriends.getState(Alice.id) !== 'FRIEND', 'Charlie was never friended, so even a live connection could never have received it');
    console.log('✓ SECURITY FLAGSHIP part 2: a rejected reconnect that genuinely authenticates as the wrong identity never leaks a queued read acknowledgement');

    // --- C. Bob genuinely reconnects afterward — the earlier rejected
    //        detour never contaminated anything, and the original
    //        acknowledgement finally reaches him correctly. -----------
    await reconnect(Alice, Bob);
    await wait(40);
    assert(alice.readOutbox.pending(Bob.id).length === 0, "Bob's genuine reconnect flushes the original, untouched acknowledgement");
    assert(bob.chat.getPeerReadThroughSequence(Alice.id) === 1, 'Bob correctly records Alice having read through sequence 1, after the earlier rejected attempt');
    console.log('✓ SECURITY FLAGSHIP part 3: a genuine later reconnect still reconciles the read acknowledgement correctly');

    setup.stopListening();
    aliceFriends.dispose(); bobFriends.dispose(); charlieFriends.dispose();
    alice.chat.dispose(); bob.chat.dispose();
    reconnection.dispose();
}

console.log('\nAll Message Read State & Read Synchronization (0.2.71) tests passed.');
}

await runTests();
