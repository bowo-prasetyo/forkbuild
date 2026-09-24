import {
    AvatarInventoryTransferPeerMessageKind,
    toAvatarInventoryTransferOfferMessage,
    toAvatarInventoryTransferAcceptMessage,
    toAvatarInventoryTransferDeclineMessage,
    isValidAvatarInventoryTransferPeerMessage
} from '../application/avatar/AvatarInventoryTransferPeerProtocol.js';
import { AvatarInventoryTransferPeerExchange } from '../application/avatar/AvatarInventoryTransferPeerExchange.js';
import { AvatarInventoryStore } from '../application/avatar/AvatarInventoryStore.js';
import { createAvatarInventoryEntry, InventoryEntryKind, withEntryAdded } from '../core/AvatarInventory.js';
import { VehicleType } from '../core/VehicleType.js';
import { ANIMAL_SPECIES } from '../core/WildlifeField.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/peer/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { assert } from './support/Assert.js';
import { makeIdentity } from './support/TestIdentity.js';

// Send An Avatar Inventory Entry To Another Avatar's Inventory.
//
//   Section A: AvatarInventoryTransferPeerProtocol — the OFFER/ACCEPT/
//              DECLINE wire shapes, pure data, structural validity only.
//   Section B: AvatarInventoryTransferPeerExchange — routing/gating and
//              the escrow discipline against a stub PeerMessageBus +
//              ConnectedPeerRegistry: sendOffer() removes the entry from
//              the sender's own inventory only once the OFFER is actually
//              sent (and restores it if sending fails), acceptOffer() adds
//              it to the recipient's inventory and sends ACCEPT,
//              declineOffer() sends DECLINE without ever touching the
//              recipient's own inventory, a genuine ACCEPT/DECLINE
//              resolves the sender's own pending record, a peer
//              disconnecting mid-offer withdraws it (restoring an
//              escrowed outgoing entry, forgetting an incoming one), and a
//              malformed/forged/duplicate wire message is always dropped
//              silently.
//   Section C: FLAGSHIP — Alice and Bob over real, live, authenticated
//              connections (peer/LocalPeerConnectionProvider.js +
//              application/peer/ConnectToPeerUseCase.js, unmodified). Alice
//              sends a carried vehicle to Bob and Bob accepts it — the
//              entry actually moves, once, between two independent
//              AvatarInventoryStore instances. A second entry is
//              declined and stays with Alice. A third is offered right
//              before Bob disconnects, and comes back to Alice
//              automatically.

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function vehicleEntry(id, type = VehicleType.BICYCLE) {
    return createAvatarInventoryEntry({ id, kind: InventoryEntryKind.VEHICLE, type });
}

function animalEntry(id, type = ANIMAL_SPECIES.DEER) {
    return createAvatarInventoryEntry({ id, kind: InventoryEntryKind.ANIMAL, type });
}

// A minimal stand-in for peer/PeerMessageBus.js — mirrors
// tests/PublicationAnchorPeerExchange.test.js's own StubPeerMessageBus,
// plus a configurable send failure for exercising sendOffer()'s own
// restore-on-send-failure branch.
class StubPeerMessageBus {
    constructor() {
        this._handlers = new Map();
        this.sent = [];
        this.attached = new Set();
        this._failNextSend = false;
    }
    attach(peer) { this.attached.add(peer.connectionId); }
    failNextSend() { this._failNextSend = true; }
    send(peer, protocol, payload) {
        if (peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            throw new Error('StubPeerMessageBus: cannot send, peer is not AUTHENTICATED');
        }
        if (this._failNextSend) {
            this._failNextSend = false;
            throw new Error('StubPeerMessageBus: simulated send failure');
        }
        this.sent.push({ peer, protocol, payload });
    }
    subscribe(protocol, handler) {
        if (!this._handlers.has(protocol)) this._handlers.set(protocol, new Set());
        this._handlers.get(protocol).add(handler);
        return () => this._handlers.get(protocol).delete(handler);
    }
    deliver(protocol, payload, meta = {}) {
        const handlers = this._handlers.get(protocol);
        if (!handlers) return;
        for (const handler of Array.from(handlers)) handler(payload, meta);
    }
}

class StubConnectedPeerRegistry {
    constructor(peers = []) { this._peers = peers; this._listeners = new Set(); }
    list() { return this._peers; }
    onChange(callback) { this._listeners.add(callback); return () => this._listeners.delete(callback); }
    fireChange() { for (const listener of this._listeners) listener(this._peers); }
}

function stubPeer(connectionId, state) {
    return { connectionId, connection: {}, getLifecycleState: () => state };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — AvatarInventoryTransferPeerProtocol
    // ---------------------------------------------------------------
    {
        const entry = vehicleEntry('vehicle-1').toJSON();
        const offer = toAvatarInventoryTransferOfferMessage('offer-1', entry);
        assert(offer.kind === AvatarInventoryTransferPeerMessageKind.OFFER, '1. toAvatarInventoryTransferOfferMessage() carries the OFFER kind');
        assert(offer.offerId === 'offer-1' && offer.entry === entry, '2. it carries the offerId and entry unchanged');
        assert(Object.keys(offer).length === 3, '3. the wrapper carries exactly kind + offerId + entry');

        expectThrows(() => toAvatarInventoryTransferOfferMessage('', entry), '4. rejects an empty offerId');
        expectThrows(() => toAvatarInventoryTransferOfferMessage('offer-1', null), '5. rejects a missing entry');

        const accept = toAvatarInventoryTransferAcceptMessage('offer-1');
        assert(accept.kind === AvatarInventoryTransferPeerMessageKind.ACCEPT && accept.offerId === 'offer-1', '6. toAvatarInventoryTransferAcceptMessage() carries the ACCEPT kind and offerId');
        assert(Object.keys(accept).length === 2, '7. an ACCEPT carries exactly kind + offerId — no receiver identity, no timestamp');
        expectThrows(() => toAvatarInventoryTransferAcceptMessage(''), '8. rejects an empty offerId');

        const decline = toAvatarInventoryTransferDeclineMessage('offer-1');
        assert(decline.kind === AvatarInventoryTransferPeerMessageKind.DECLINE && decline.offerId === 'offer-1', '9. toAvatarInventoryTransferDeclineMessage() carries the DECLINE kind and offerId');
        expectThrows(() => toAvatarInventoryTransferDeclineMessage(null), '10. rejects a missing offerId');

        assert(isValidAvatarInventoryTransferPeerMessage(offer), '11. a freshly built OFFER validates');
        assert(isValidAvatarInventoryTransferPeerMessage(accept), '12. a freshly built ACCEPT validates');
        assert(isValidAvatarInventoryTransferPeerMessage(decline), '13. a freshly built DECLINE validates');
        assert(!isValidAvatarInventoryTransferPeerMessage(null), '14. null is not valid');
        assert(!isValidAvatarInventoryTransferPeerMessage({ kind: 'OFFER' }), '15. an OFFER missing offerId/entry is rejected');
        assert(!isValidAvatarInventoryTransferPeerMessage({ kind: 'OFFER', offerId: 'x', entry: 'not-an-object' }), '16. an OFFER with a non-object entry is rejected');
        assert(!isValidAvatarInventoryTransferPeerMessage({ kind: 'ACCEPT' }), '17. an ACCEPT missing offerId is rejected');
        assert(!isValidAvatarInventoryTransferPeerMessage({ kind: 'DECLINE', offerId: '' }), '18. a DECLINE with an empty offerId is rejected');
        assert(!isValidAvatarInventoryTransferPeerMessage({ kind: 'SOMETHING_ELSE', offerId: 'x' }), '19. an unknown kind is rejected');
    }
    console.log('✓ Section A: AvatarInventoryTransferPeerProtocol — OFFER/ACCEPT/DECLINE wire shapes, structural validity only');

    // ---------------------------------------------------------------
    // Section B — AvatarInventoryTransferPeerExchange, stub transport
    // ---------------------------------------------------------------
    {
        expectThrows(() => new AvatarInventoryTransferPeerExchange(null, new StubPeerMessageBus(), new StubConnectedPeerRegistry()),
            '1. constructor requires an AvatarInventoryStore');
        expectThrows(() => new AvatarInventoryTransferPeerExchange(new AvatarInventoryStore(), null, new StubConnectedPeerRegistry()),
            '2. constructor requires a PeerMessageBus');
        expectThrows(() => new AvatarInventoryTransferPeerExchange(new AvatarInventoryStore(), new StubPeerMessageBus(), null),
            '3. constructor requires a ConnectedPeerRegistry');

        const authenticatedPeer = stubPeer('conn-authenticated', PeerLifecycleState.AUTHENTICATED);
        const connectingPeer = stubPeer('conn-connecting', PeerLifecycleState.CONNECTING);
        const aliceStore = new AvatarInventoryStore();
        const aliceBus = new StubPeerMessageBus();
        const aliceRegistry = new StubConnectedPeerRegistry([authenticatedPeer, connectingPeer]);
        const aliceExchange = new AvatarInventoryTransferPeerExchange(aliceStore, aliceBus, aliceRegistry);

        assert(aliceBus.attached.has('conn-authenticated') && aliceBus.attached.has('conn-connecting'),
            '4. every peer already in the registry is attached on construction');

        const newPeer = stubPeer('conn-new', PeerLifecycleState.AUTHENTICATED);
        aliceRegistry._peers = [...aliceRegistry._peers, newPeer];
        aliceRegistry.fireChange();
        assert(aliceBus.attached.has('conn-new'), '5. a peer added later (registry onChange) is attached automatically too');

        // --- sendOffer() ---------------------------------------------
        expectThrows(() => aliceExchange.sendOffer(authenticatedPeer, 'no-such-entry'),
            '6. sendOffer() rejects an entryId that names nothing carried');

        const bike = vehicleEntry('bike-1');
        aliceStore.set(withEntryAdded(aliceStore.get(), bike));
        expectThrows(() => aliceExchange.sendOffer(connectingPeer, 'bike-1'),
            '7. sendOffer() rejects a peer that is not AUTHENTICATED');
        assert(aliceStore.get().has('bike-1'), '8. a rejected sendOffer() never touches the sender\'s own inventory');

        const offerId = aliceExchange.sendOffer(authenticatedPeer, 'bike-1');
        assert(typeof offerId === 'string' && offerId.length > 0, '9. sendOffer() returns a real offerId');
        assert(!aliceStore.get().has('bike-1'), '10. sendOffer() escrows the entry OUT of the sender\'s own inventory the moment it is sent');
        assert(aliceBus.sent.length === 1 && aliceBus.sent[0].protocol === AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL,
            '11. the OFFER is sent under this class\'s own namespaced protocol');
        assert(aliceBus.sent[0].payload.kind === AvatarInventoryTransferPeerMessageKind.OFFER && aliceBus.sent[0].payload.entry.id === 'bike-1',
            '12. the sent message wraps the entry under OFFER');

        // A send failure restores the escrowed entry rather than losing it.
        const car = vehicleEntry('car-1', VehicleType.CAR);
        aliceStore.set(withEntryAdded(aliceStore.get(), car));
        aliceBus.failNextSend();
        expectThrows(() => aliceExchange.sendOffer(authenticatedPeer, 'car-1'), '13. sendOffer() propagates a bus send failure');
        assert(aliceStore.get().has('car-1'), '14. a send failure restores the entry to the sender\'s own inventory rather than losing it');

        // --- receiving an OFFER (Bob's side) ---------------------------
        const bobStore = new AvatarInventoryStore();
        const bobBus = new StubPeerMessageBus();
        const bobRegistry = new StubConnectedPeerRegistry([]);
        const bobExchange = new AvatarInventoryTransferPeerExchange(bobStore, bobBus, bobRegistry);

        const receivedOffers = [];
        bobExchange.onOfferReceived((info) => receivedOffers.push(info));

        bobBus.deliver(AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL, { kind: 'SOMETHING_ELSE' });
        assert(receivedOffers.length === 0, '15. a malformed wrapper is silently dropped, never fires onOfferReceived');

        bobBus.deliver(AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL,
            toAvatarInventoryTransferOfferMessage('offer-malformed', { id: 'x', kind: 'not-a-real-kind', type: 'bicycle' }));
        assert(receivedOffers.length === 0, '16. an OFFER whose entry fails to construct is silently dropped');

        const bobPeer = stubPeer('conn-alice-to-bob', PeerLifecycleState.AUTHENTICATED);
        bobBus.deliver(AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL,
            toAvatarInventoryTransferOfferMessage('offer-real', bike.toJSON()), { connectedPeer: bobPeer });
        assert(receivedOffers.length === 1 && receivedOffers[0].offerId === 'offer-real' && receivedOffers[0].entry.id === 'bike-1',
            '17. a genuine OFFER fires onOfferReceived with the real entry');
        assert(!bobStore.get().has('bike-1'), '18. receiving an OFFER never, by itself, adds anything to the recipient\'s own inventory');

        bobBus.deliver(AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL,
            toAvatarInventoryTransferOfferMessage('offer-real', animalEntry('deer-1').toJSON()), { connectedPeer: bobPeer });
        assert(receivedOffers.length === 1, '19. a second OFFER reusing an offerId already pending is dropped, never replacing it');

        // --- acceptOffer() ---------------------------------------------
        expectThrows(() => bobExchange.acceptOffer('no-such-offer'), '20. acceptOffer() rejects an unknown offerId');

        const accepted = bobExchange.acceptOffer('offer-real');
        assert(accepted.id === 'bike-1', '21. acceptOffer() returns the accepted entry');
        assert(bobStore.get().has('bike-1'), '22. acceptOffer() adds the entry to the recipient\'s own inventory');
        assert(bobBus.sent.length === 1 && bobBus.sent[0].payload.kind === AvatarInventoryTransferPeerMessageKind.ACCEPT && bobBus.sent[0].payload.offerId === 'offer-real',
            '23. acceptOffer() sends an ACCEPT back to the sender');
        expectThrows(() => bobExchange.acceptOffer('offer-real'), '24. accepting the same offerId twice fails — it is no longer pending');

        // id-collision guard: Bob is already carrying "bike-1" (from the
        // accept above); a second, distinct offer for the identical id is
        // rejected rather than corrupting the inventory.
        bobBus.deliver(AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL,
            toAvatarInventoryTransferOfferMessage('offer-collision', bike.toJSON()), { connectedPeer: bobPeer });
        expectThrows(() => bobExchange.acceptOffer('offer-collision'), '25. acceptOffer() rejects an entry id already carried');
        expectThrows(() => bobExchange.acceptOffer('offer-collision'), '26. the rejected offer is forgotten, not left pending');

        // --- declineOffer() ---------------------------------------------
        bobBus.deliver(AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL,
            toAvatarInventoryTransferOfferMessage('offer-to-decline', animalEntry('deer-2').toJSON()), { connectedPeer: bobPeer });
        const declined = bobExchange.declineOffer('offer-to-decline');
        assert(declined.id === 'deer-2', '27. declineOffer() returns the declined entry');
        assert(!bobStore.get().has('deer-2'), '28. declineOffer() never adds the entry to the recipient\'s own inventory');
        assert(bobBus.sent.some((s) => s.payload.kind === AvatarInventoryTransferPeerMessageKind.DECLINE && s.payload.offerId === 'offer-to-decline'),
            '29. declineOffer() sends a DECLINE back to the sender');
        expectThrows(() => bobExchange.declineOffer('offer-to-decline'), '30. declining the same offerId twice fails — it is no longer pending');

        // --- receiving ACCEPT/DECLINE (Alice's side) ---------------------
        const acceptedEvents = [];
        aliceExchange.onOfferAccepted((info) => acceptedEvents.push(info));
        const declinedEvents = [];
        aliceExchange.onOfferDeclined((info) => declinedEvents.push(info));

        aliceBus.deliver(AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL, toAvatarInventoryTransferAcceptMessage('no-such-offer'));
        assert(acceptedEvents.length === 0, '31. an ACCEPT for an unknown offerId is silently dropped');

        aliceBus.deliver(AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL, toAvatarInventoryTransferAcceptMessage(offerId));
        assert(acceptedEvents.length === 1 && acceptedEvents[0].offerId === offerId && acceptedEvents[0].entry.id === 'bike-1',
            '32. a genuine ACCEPT fires onOfferAccepted with the real entry');
        assert(!aliceStore.get().has('bike-1'), '33. the entry stays escrowed away from the sender — ACCEPT never restores it');

        aliceBus.deliver(AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL, toAvatarInventoryTransferAcceptMessage(offerId));
        assert(acceptedEvents.length === 1, '34. re-delivering the same ACCEPT (already resolved) is silently dropped, never double-fires');

        const secondOfferId = aliceExchange.sendOffer(authenticatedPeer, 'car-1');
        assert(!aliceStore.get().has('car-1'), '35. setup: the second entry is escrowed for the second offer');
        aliceBus.deliver(AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL, toAvatarInventoryTransferDeclineMessage(secondOfferId));
        assert(declinedEvents.length === 1 && declinedEvents[0].offerId === secondOfferId && declinedEvents[0].entry.id === 'car-1',
            '36. a genuine DECLINE fires onOfferDeclined with the real entry');
        assert(aliceStore.get().has('car-1'), '37. DECLINE restores the escrowed entry to the sender\'s own inventory');

        aliceBus.deliver(AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL, toAvatarInventoryTransferDeclineMessage(secondOfferId));
        assert(declinedEvents.length === 1, '38. re-delivering the same DECLINE (already resolved) is silently dropped, never double-fires');

        // --- disconnect withdraws a pending offer -----------------------
        const scooter = vehicleEntry('scooter-1', VehicleType.MOTORCYCLE);
        aliceStore.set(withEntryAdded(aliceStore.get(), scooter));
        const thirdOfferId = aliceExchange.sendOffer(authenticatedPeer, 'scooter-1');
        assert(!aliceStore.get().has('scooter-1'), '39. setup: the third entry is escrowed for the third offer');

        const withdrawnEvents = [];
        aliceExchange.onOfferWithdrawn((info) => withdrawnEvents.push(info));
        aliceRegistry._peers = aliceRegistry._peers.filter((p) => p.connectionId !== 'conn-authenticated');
        aliceRegistry.fireChange();
        assert(withdrawnEvents.length === 1 && withdrawnEvents[0].offerId === thirdOfferId && withdrawnEvents[0].entry.id === 'scooter-1',
            '40. the recipient disconnecting mid-offer fires onOfferWithdrawn');
        assert(aliceStore.get().has('scooter-1'), '41. and restores the escrowed entry to the sender\'s own inventory');

        const bobWithdrawnEvents = [];
        bobExchange.onOfferWithdrawn((info) => bobWithdrawnEvents.push(info));
        bobBus.deliver(AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL,
            toAvatarInventoryTransferOfferMessage('offer-before-disconnect', animalEntry('deer-3').toJSON()), { connectedPeer: bobPeer });
        bobRegistry.fireChange(); // bobPeer was never added to bobRegistry's own list — simulates it having already disconnected
        assert(bobWithdrawnEvents.length === 1 && bobWithdrawnEvents[0].offerId === 'offer-before-disconnect',
            '42. an incoming offer whose sender is no longer connected is withdrawn too');
        expectThrows(() => bobExchange.acceptOffer('offer-before-disconnect'), '43. a withdrawn incoming offer can no longer be accepted');

        // --- dispose() ---------------------------------------------------
        aliceExchange.dispose();
        const postDisposeEvents = [];
        aliceExchange.onOfferAccepted((info) => postDisposeEvents.push(info));
        aliceBus.deliver(AvatarInventoryTransferPeerExchange.DEFAULT_PROTOCOL, toAvatarInventoryTransferAcceptMessage('anything'));
        assert(postDisposeEvents.length === 0, '44. dispose() unsubscribes from the bus — no further deliveries are handled');
        bobExchange.dispose();
    }
    console.log('✓ Section B: AvatarInventoryTransferPeerExchange — escrow on send, restore on send-failure/DECLINE/disconnect, AUTHENTICATED-only sends, malformed/forged/duplicate/collision drops, dispose()');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: Alice and Bob over real, live, authenticated
    // connections.
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        const aliceTransport = new LocalPeerConnectionProvider('alice-inventory', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-inventory', network);

        const aliceConnect = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceConnect.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const stopBobListening = bobConnect.listen();

        const bobToAlice = bobConnect.connect({ candidateEndpoint: 'alice-inventory' });
        await wait(20);
        assert(bobToAlice.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob authenticates to Alice over a real live connection');
        const aliceToBob = aliceConnect.registry.list()[0];

        const aliceStore = new AvatarInventoryStore();
        const aliceBus = new PeerMessageBus();
        const aliceExchange = new AvatarInventoryTransferPeerExchange(aliceStore, aliceBus, aliceConnect.registry);

        const bobStore = new AvatarInventoryStore();
        const bobBus = new PeerMessageBus();
        const bobExchange = new AvatarInventoryTransferPeerExchange(bobStore, bobBus, bobConnect.registry);

        const bobReceived = [];
        bobExchange.onOfferReceived((info) => bobReceived.push(info));
        const aliceAccepted = [];
        aliceExchange.onOfferAccepted((info) => aliceAccepted.push(info));
        const aliceDeclined = [];
        aliceExchange.onOfferDeclined((info) => aliceDeclined.push(info));
        const aliceWithdrawn = [];
        aliceExchange.onOfferWithdrawn((info) => aliceWithdrawn.push(info));

        // --- Alice sends a bicycle to Bob; Bob accepts it -----------------
        const bike = vehicleEntry('flagship-bike', VehicleType.BICYCLE);
        aliceStore.set(withEntryAdded(aliceStore.get(), bike));

        const bikeOfferId = aliceExchange.sendOffer(aliceToBob, 'flagship-bike');
        assert(!aliceStore.get().has('flagship-bike'), '2. Alice\'s own inventory no longer carries the bicycle the instant she offers it');

        await wait(20);
        assert(bobReceived.length === 1 && bobReceived[0].entry.id === 'flagship-bike', '3. Bob receives the OFFER over the live connection');

        bobExchange.acceptOffer(bikeOfferId);
        assert(bobStore.get().has('flagship-bike'), '4. Bob\'s own inventory now carries the bicycle');

        await wait(20);
        assert(aliceAccepted.length === 1 && aliceAccepted[0].entry.id === 'flagship-bike', '5. Alice is told the offer was accepted');
        assert(!aliceStore.get().has('flagship-bike'), '6. the bicycle never returns to Alice — it genuinely moved, exactly once');

        // --- Alice sends a car to Bob; Bob declines it --------------------
        const car = vehicleEntry('flagship-car', VehicleType.CAR);
        aliceStore.set(withEntryAdded(aliceStore.get(), car));
        const carOfferId = aliceExchange.sendOffer(aliceToBob, 'flagship-car');
        await wait(20);
        assert(bobReceived.length === 2 && bobReceived[1].entry.id === 'flagship-car', '7. Bob receives the second OFFER');

        bobExchange.declineOffer(carOfferId);
        assert(!bobStore.get().has('flagship-car'), '8. Bob never carries the declined car');

        await wait(20);
        assert(aliceDeclined.length === 1 && aliceDeclined[0].entry.id === 'flagship-car', '9. Alice is told the offer was declined');
        assert(aliceStore.get().has('flagship-car'), '10. the car is back in Alice\'s own inventory');

        // --- Alice sends a drone to Bob; Bob disconnects before answering -
        const drone = vehicleEntry('flagship-drone', VehicleType.DRONE);
        aliceStore.set(withEntryAdded(aliceStore.get(), drone));
        aliceExchange.sendOffer(aliceToBob, 'flagship-drone');
        assert(!aliceStore.get().has('flagship-drone'), '11. setup: the drone is escrowed for the third offer');

        aliceConnect.registry.get(aliceToBob.connectionId).connection.close();
        await wait(20);
        assert(aliceWithdrawn.length === 1 && aliceWithdrawn[0].entry.id === 'flagship-drone', '12. Bob disconnecting withdraws the still-pending offer');
        assert(aliceStore.get().has('flagship-drone'), '13. and the drone comes back to Alice automatically — never stranded');

        aliceExchange.dispose();
        bobExchange.dispose();
        stopAliceListening();
        stopBobListening();
        aliceTransport.dispose();
        bobTransport.dispose();
    }
    console.log('✓ Section C: FLAGSHIP — Alice and Bob over live authenticated connections: an accepted offer genuinely moves an entry exactly once, a declined offer returns it, and a disconnect mid-offer withdraws and returns it automatically');

    console.log('\nAll Avatar Inventory Transfer Peer Exchange tests passed.');
}

run().catch((error) => {
    console.error('AvatarInventoryTransferPeerExchange.test.js FAILED:', error);
    process.exitCode = 1;
});
