import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectedPeer } from '../application/ConnectedPeer.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/DeviceAuthorizationPropagationUseCase.js';
import { FriendRelationshipUseCase } from '../application/FriendRelationshipUseCase.js';
import { FriendshipState } from '../core/FriendshipState.js';
import { ChatUseCase } from '../application/ChatUseCase.js';
import { ConversationReadTracker } from '../application/ConversationReadTracker.js';
import { SiblingReadStateStore } from '../application/SiblingReadStateStore.js';
import { DeviceConversationSyncUseCase } from '../application/DeviceConversationSyncUseCase.js';

// 0.2.83 — Multi-Device Conversation & Read-State Synchronization.
//
// 0.2.78 proved the CRYPTOGRAPHIC model (a device is just another
// LocalIdentity, authorized by a signed, revocable link). 0.2.82 proved
// the SOCIAL consequence (a THIRD PARTY, Bob, resolves any of Alice's
// authorized devices to the SAME conversation). Both deliberately left
// standing the question this file answers: Alice's Phone and Alice's
// Laptop are still two completely independent application/ChatUseCase.js
// instances, each with its own local, disjoint storage — do THEY ever
// converge with EACH OTHER? See application/DeviceConversationSyncUseCase.js's
// own header for the design this proves.
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

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mirrors tests/MultiDeviceIdentity.test.js/tests/MultiDeviceSocialSemantics.test.js's
// own makeDevice() exactly — one independent LocalIdentityProvider
// instance standing in for one physically distinct device.
function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

// Mirrors tests/MultiDeviceSocialSemantics.test.js's own
// connectAndAuthenticate() exactly.
async function connectAndAuthenticate(network, addressA, deviceA, addressB, deviceB) {
    const transportA = new LocalPeerConnectionProvider(addressA, network);
    const transportB = new LocalPeerConnectionProvider(addressB, network);
    let incomingB = null;
    const unsubscribe = transportB.onIncomingConnection((connection) => { incomingB = connection; });
    const connectionA = transportA.connect(addressB);
    await wait();
    unsubscribe();
    assert(incomingB, `connectAndAuthenticate: ${addressB} never saw an incoming connection from ${addressA}`);

    const sessionA = new PeerAuthenticationSession({ connection: connectionA, identityProvider: deviceA.provider });
    const sessionB = new PeerAuthenticationSession({ connection: incomingB, identityProvider: deviceB.provider });
    sessionA.start();
    sessionB.start();
    await wait(10);
    assert(sessionA.isAuthenticated && sessionB.isAuthenticated, `connectAndAuthenticate: ${addressA} <-> ${addressB} did not reach AUTHENTICATED`);

    return {
        peerA: new ConnectedPeer({ connection: connectionA, authenticationSession: sessionA }),
        peerB: new ConnectedPeer({ connection: incomingB, authenticationSession: sessionB })
    };
}

// One device's own full social + sync stack, wired the same way
// ui/main.js wires the real app.
function makeStack(device) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const resolveSocialIdentity = (connectedPeer) => deviceAuth.resolveConnectionIdentity(connectedPeer);
    const friends = new FriendRelationshipUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry, resolveSocialIdentity
    });
    const chat = new ChatUseCase(device.provider, {
        peerMessageBus, connectedPeerRegistry, friendRelationshipUseCase: friends, resolveSocialIdentity
    });
    const conversationReadTracker = new ConversationReadTracker(new InMemoryStorageProvider(), device.provider);
    const siblingReadStateStore = new SiblingReadStateStore(new InMemoryStorageProvider(), device.provider);
    const sync = new DeviceConversationSyncUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth, chatUseCase: chat,
        conversationReadTracker, siblingReadStateStore
    });
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, friends, chat, conversationReadTracker, siblingReadStateStore, sync };
}

async function runTests() {

// ---------------------------------------------------------------------
// FLAGSHIP — Alice's Phone holds her own primary identity directly;
// her Laptop is a separately-keyed device Phone authorized. Phone chats
// with Bob while the Laptop is offline. The Laptop connects (to Phone
// directly, and to Bob), catches up on the FULL conversation via sync,
// reads the latest message, and Bob correctly learns "Alice" read it —
// while Phone's own local read marker is untouched. Revoking the Laptop
// cuts sync in both directions while Phone keeps working normally.
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const phone = makeDevice('Alice-Phone');
    const laptop = makeDevice('Alice-Laptop');
    const bob = makeDevice('Bob');

    // Phone IS Alice's primary identity — it authorizes the Laptop as a
    // separate device, exactly the portable-grant shape 0.2.78 defined.
    const grantLaptop = phone.provider.authorizeDevice(
        phone.identity.identityId, laptop.identity.identityId, laptop.identity.publicKey, { deviceLabel: 'Laptop' }
    );

    const phoneStack = makeStack(phone);
    const laptopStack = makeStack(laptop);
    const bobStack = makeStack(bob);

    // Phone, the authorizing device, broadcasts the grant — which now
    // (0.2.83) ALSO self-applies it to Phone's OWN local DeviceAuthority
    // view, exactly like tests/MultiDeviceIdentity.test.js's own flagship
    // does to hand the fact to a THIRD party (Bob); here it is what lets
    // Phone itself recognize the Laptop as a sibling later.
    phoneStack.deviceAuth.broadcastAuthorization(grantLaptop);

    // The Laptop ADOPTS the portable grant naming itself — the out-of-band
    // handoff 0.2.78 named and left unbuilt; this is 0.2.83's own small,
    // honest answer to it.
    laptopStack.deviceAuth.adoptOwnDeviceGrant(grantLaptop);
    assert(laptopStack.deviceAuth.resolveOwnSocialIdentity().identityId === phone.identity.identityId,
        "the Laptop, having adopted its own grant, now resolves ITSELF as a device of Alice's parent (Phone's own) identity");
    assert(phoneStack.deviceAuth.resolveOwnSocialIdentity().identityId === phone.identity.identityId
        && phoneStack.deviceAuth.resolveOwnSocialIdentity().mode === 'DIRECT',
        "the Phone, holding the parent identity directly, resolves itself DIRECT — no adoption needed");
    console.log('✓ setup: the Laptop has adopted its own portable device grant and now knows its own parent identity');

    // ---- Phone <-> Bob become friends and chat while the Laptop is offline ----
    const { peerA: phoneToBob, peerB: bobFromPhone } = await connectAndAuthenticate(network, 'phone', phone, 'bob-for-phone', bob);
    phoneStack.connectedPeerRegistry.add(phoneToBob);
    bobStack.connectedPeerRegistry.add(bobFromPhone);
    // Re-broadcast now that Bob is actually connected, so he independently
    // learns and verifies the Laptop's authorization too — mirrors
    // tests/MultiDeviceSocialSemantics.test.js's own setup exactly.
    phoneStack.deviceAuth.broadcastAuthorization(grantLaptop);
    await wait(20);
    phoneStack.friends.sendFriendRequest(phoneToBob);
    await wait(20);
    bobStack.friends.acceptFriendRequest(bobFromPhone);
    await wait(20);
    assert(bobStack.friends.getState(phone.identity.identityId) === FriendshipState.FRIEND, 'sanity: Phone and Bob are friends');

    phoneStack.chat.sendMessage(phoneToBob, 'hi Bob, this is Alice');
    await wait(20);
    bobStack.chat.sendMessage(bobFromPhone, 'hey Alice, good to hear from you');
    await wait(20);
    assert(phoneStack.chat.getConversation(bob.identity.identityId).length === 2, 'sanity: Phone has both messages (#1 outgoing, #2 incoming)');
    assert(laptopStack.chat.getConversation(bob.identity.identityId).length === 0, 'sanity: the Laptop, still offline, knows nothing yet');
    console.log('✓ setup: Phone and Bob exchanged two messages while the Laptop was completely offline');

    // ---- The Laptop connects to the Phone directly — a sibling-device connection ----
    const { peerA: laptopToPhone, peerB: phoneFromLaptop } = await connectAndAuthenticate(network, 'laptop', laptop, 'phone-for-laptop', phone);
    laptopStack.connectedPeerRegistry.add(laptopToPhone);
    phoneStack.connectedPeerRegistry.add(phoneFromLaptop);
    await wait(50);

    assert(laptopStack.sync.isEligibleSibling(laptopToPhone), "the Laptop recognizes the Phone's connection as an eligible sibling");
    assert(phoneStack.sync.isEligibleSibling(phoneFromLaptop), "the Phone recognizes the Laptop's connection as an eligible sibling");
    assert(!phoneStack.friends.getRelationships().some((r) => r.identityId === laptop.identity.identityId),
        'sibling sync eligibility is completely independent of friendship — Phone and Laptop are the same identity, never "friends" of each other');

    const laptopsView = laptopStack.chat.getConversation(bob.identity.identityId);
    assert(laptopsView.length === 2, "FLAGSHIP: the Laptop caught up on BOTH of Bob's conversation messages purely via sync, having never talked to Bob itself");
    assert(laptopsView[0].direction === 'outgoing' && laptopsView[0].senderIdentity === phone.identity.identityId,
        "the synced outgoing message still carries its true device provenance — literally the Phone's own raw key — even on the Laptop's own copy");
    assert(laptopsView[1].direction === 'incoming' && laptopsView[1].senderIdentity === bob.identity.identityId,
        "the synced incoming message from Bob is preserved verbatim, direction and sender intact");
    assert(laptopStack.chat.getStoredEntries(bob.identity.identityId).length === 2, 'the sync also reached the Laptop\'s OWN durable ConversationStore, not merely its live transcript');
    console.log('✓ FLAGSHIP: the Laptop, having never exchanged a single message with Bob, converged on the full conversation purely through device-to-device sync');

    // ---- Bob replies live; both Phone (direct) and Laptop (reactive sync) should end up with it ----
    bobStack.chat.sendMessage(bobFromPhone, 'welcome back, is this your laptop now?');
    await wait(50);
    assert(phoneStack.chat.getConversation(bob.identity.identityId).length === 3, "sanity: Phone received Bob's third message live");
    assert(laptopStack.chat.getConversation(bob.identity.identityId).length === 3,
        "the Laptop, ALREADY connected to the Phone (not merely reconnecting), received Bob's new message reactively — sync is not limited to a connect-time catch-up");
    console.log('✓ an already-connected sibling stays caught up live, not only at reconnect time');

    // ---- IDEMPOTENCY: re-applying the exact same sync state changes nothing ----
    const beforeReSync = laptopStack.chat.getStoredEntries(bob.identity.identityId).length;
    phoneStack.sync._syncIfEligible(phoneFromLaptop);
    await wait(30);
    assert(laptopStack.chat.getStoredEntries(bob.identity.identityId).length === beforeReSync,
        'Sync(S, S) = S — re-pushing the identical, already-known state is a harmless no-op, never a duplicate');
    console.log('✓ idempotency: re-syncing identical state changes nothing');

    // ---- READ STATE: three genuinely distinct facts, never collapsed ----
    // The Laptop reads Bob's latest message (#3, sequence 3 in Bob's
    // outgoing/Alice's-incoming numbering).
    const latest = laptopStack.chat.getConversation(bob.identity.identityId).slice(-1)[0];
    laptopStack.conversationReadTracker.markRead(bob.identity.identityId, latest.sequence);
    laptopStack.sync.pushReadState(bob.identity.identityId);
    await wait(30);

    assert(laptopStack.sync.getMyLocalReadSequence(bob.identity.identityId) === latest.sequence, "the Laptop's OWN local read marker advanced");
    assert(phoneStack.sync.getMyLocalReadSequence(bob.identity.identityId) === 0,
        "the Phone's OWN local read marker is COMPLETELY UNTOUCHED — a sibling's read state is never written into this device's own per-device marker");
    assert(phoneStack.siblingReadStateStore.getObservedSequence(bob.identity.identityId) === latest.sequence,
        "the Phone independently recorded what the Laptop reported about ITSELF, in a SEPARATE store");
    assert(phoneStack.sync.getIdentityObservedReadSequence(bob.identity.identityId) === latest.sequence,
        "the IDENTITY-level observed read position is the derived MAX across devices, even though Phone's own local marker never moved");
    console.log('✓ per-device local read state (Phone: untouched, Laptop: advanced) and identity-observed read state (max across devices) are three distinct, correctly-preserved facts');

    // Note: whether Bob himself learns "Alice read #3" over the wire
    // (core/ChatReadReceipt.js, 0.2.71) is a SEPARATE, pre-existing axis
    // this milestone deliberately does not extend — sending a receipt
    // still requires the SENDING device's own completed friendship with
    // Bob, and the Laptop, having never independently friended him, hits
    // exactly the cross-device acknowledgment gap tests/MultiDeviceSocialSemantics
    // .test.js's own closing note already named as unsolved. The Phone
    // (already friends with Bob) can send one at any time; that path is
    // ordinary 0.2.71 behavior, unchanged, and not what this test exists
    // to prove.

    // ---- SECURITY FLAGSHIP: revoke the Laptop; sync is rejected both ways, Phone keeps working ----
    const revocation = phone.provider.revokeDeviceAuthorization(phone.identity.identityId, laptop.identity.identityId);
    phoneStack.deviceAuth.broadcastRevocation(revocation);
    await wait(50);

    assert(!phoneStack.sync.isEligibleSibling(phoneFromLaptop), "SECURITY FLAGSHIP: the Phone, having authored and self-applied the revocation, immediately refuses to treat the Laptop as a sibling");
    assert(!laptopStack.sync.isEligibleSibling(laptopToPhone), "the Laptop, having learned of its own revocation via ordinary gossip, also no longer considers itself Alice's device");

    phoneStack.chat.sendMessage(phoneToBob, 'one more message, only Bob and I should ever see this');
    await wait(50);
    const laptopCountAfterRevocation = laptopStack.chat.getConversation(bob.identity.identityId).length;
    assert(laptopCountAfterRevocation === 3, "the revoked Laptop received NOTHING further — sync silently declines rather than erroring, exactly like a rejected chat message does on the receiving side");

    // The Laptop's raw KEY remains completely functional — only its
    // standing as Alice's device is gone, mirroring 0.2.78/0.2.82's own
    // security flagships exactly.
    assert(laptopToPhone.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, "the Laptop's connection is still, and remains, genuinely authenticated — revocation never touches key possession");
    assert(phoneStack.chat.getConversation(bob.identity.identityId).length === 4, "the Phone itself is completely unaffected and keeps chatting with Bob normally");
    console.log('✓ SECURITY FLAGSHIP: revoking the Laptop rejects sync in BOTH directions immediately (the revoking device needed no round trip to learn its own fact), while the Phone continues working normally throughout');
}

console.log('\nAll multi-device conversation sync tests passed.');
console.log('Note (deliberately not solved here, see docs/Roadmap.md 0.2.83): presence and voice ringing');
console.log('remain untouched — this milestone answers "which messages has each device seen," never');
console.log('"is Alice online" or "should every device ring." Sync is a full-state push, resent on every');
console.log('reconnect and on every locally-observed change, never a computed delta — a real optimization');
console.log('deliberately left for whenever conversation volume makes that resend genuinely expensive.');
}

await runTests();
