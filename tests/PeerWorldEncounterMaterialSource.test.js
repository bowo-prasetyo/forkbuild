import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { PeerLifecycleState } from '../peer/PeerLifecycleState.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { ConnectToPeerUseCase } from '../application/ConnectToPeerUseCase.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';

import {
    PeerWorldEncounterMaterialMessageKind,
    MAX_WORLD_ENCOUNTER_MATERIAL_BYTES,
    isValidWorldEncounterObjectId,
    toWorldEncounterMaterialRequestMessage,
    toWorldEncounterMaterialResponseMessage,
    isValidPeerWorldEncounterMaterialMessage
} from '../application/PeerWorldEncounterMaterialProtocol.js';
import { PeerWorldEncounterMaterialSource } from '../application/PeerWorldEncounterMaterialSource.js';
import { WorldEncounterMaterialSource, loadWorldEncounterMaterial } from '../application/WorldEncounterMaterialLoading.js';
import { WorldEncounterKind } from '../core/WorldEncounter.js';
import { Publication } from '../publisher/Publication.js';
import { AvatarProfile } from '../core/AvatarProfile.js';

// 0.9.23 — Peer World Encounter Material Source.
//
//   Section A: PeerWorldEncounterMaterialProtocol — REQUEST/RESPONSE wire
//              shapes, encounterKind + objectId validation, size ceiling
//              enforced on both the sending and the receiving side.
//   Section B: PeerWorldEncounterMaterialSource — routing/gating against a
//              stub PeerMessageBus + ConnectedPeerRegistry: a local-origin
//              or malformed selection never sends anything; an unknown
//              peer origin resolves to null; a matching RESPONSE from the
//              REQUESTED peer resolves load(); a matching RESPONSE from a
//              DIFFERENT peer is never accepted as a substitute; a
//              mismatched objectId is ignored; an unanswered request times
//              out to null; an incoming REQUEST is silently ignored
//              (requester-only, this milestone); no caching; dispose().
//   Section C: FLAGSHIP — a real, live, authenticated connection. Bob
//              explicitly selects Alice (by the exact identity his own
//              connection already proved) and receives her material over
//              a real round trip; Alice's own reply is hand-assembled with
//              this file's own protocol module, standing in for the
//              still-unscheduled 0.9.24 responder.
//
// See docs/Roadmap.md, "0.9.23 — Peer World Encounter Material Source."

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function expectThrows(fn, message) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    assert(threw, message);
}

function wait(ms = 20) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function makeIdentity(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    provider.login(label);
    return provider;
}

function selectionOf({ kind, objectId, origin }) {
    return Object.freeze({ kind, objectId, origin });
}

class StubPeerMessageBus {
    constructor() {
        this._handlers = new Map();
        this.sent = [];
        this.attached = new Set();
    }
    attach(peer) { this.attached.add(peer.connectionId); }
    send(peer, protocol, payload) {
        if (peer.getLifecycleState() !== PeerLifecycleState.AUTHENTICATED) {
            throw new Error('StubPeerMessageBus: cannot send, peer is not AUTHENTICATED');
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

function stubPeer(connectionId, identityId, state = PeerLifecycleState.AUTHENTICATED) {
    return {
        connectionId,
        remoteIdentity: identityId ? { identityId } : null,
        getLifecycleState: () => state
    };
}

async function run() {
    // ---------------------------------------------------------------
    // Section A — PeerWorldEncounterMaterialProtocol
    // ---------------------------------------------------------------
    {
        assert(isValidWorldEncounterObjectId('pub-1'), '1. a plain objectId is valid');
        assert(!isValidWorldEncounterObjectId(''), '2. an empty objectId is invalid');
        assert(!isValidWorldEncounterObjectId(null), '3. a null objectId is invalid');

        const request = toWorldEncounterMaterialRequestMessage(WorldEncounterKind.PUBLICATION, 'pub-1');
        assert(request.kind === PeerWorldEncounterMaterialMessageKind.REQUEST
            && request.encounterKind === WorldEncounterKind.PUBLICATION && request.objectId === 'pub-1',
            '4. toWorldEncounterMaterialRequestMessage() builds a REQUEST carrying encounterKind + objectId');
        expectThrows(() => toWorldEncounterMaterialRequestMessage('NOT_A_KIND', 'pub-1'), '5. rejects an unknown encounterKind');
        expectThrows(() => toWorldEncounterMaterialRequestMessage(WorldEncounterKind.PUBLICATION, ''), '6. rejects a missing objectId');

        const response = toWorldEncounterMaterialResponseMessage(WorldEncounterKind.AVATAR, 'avatar-1', { displayName: 'Alice' });
        assert(response.kind === PeerWorldEncounterMaterialMessageKind.RESPONSE
            && response.encounterKind === WorldEncounterKind.AVATAR
            && response.objectId === 'avatar-1'
            && response.material.displayName === 'Alice',
            '7. toWorldEncounterMaterialResponseMessage() builds a RESPONSE carrying the material verbatim');
        expectThrows(() => toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, 'pub-1', null), '8. rejects null material');
        expectThrows(() => toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, 'pub-1', 'not-an-object'), '9. rejects non-object material');
        expectThrows(() => toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, 'pub-1', ['array']), '10. rejects array material');
        expectThrows(() => toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, 'pub-1', { title: 'x'.repeat(MAX_WORLD_ENCOUNTER_MATERIAL_BYTES) }),
            '11. rejects material over MAX_WORLD_ENCOUNTER_MATERIAL_BYTES');

        assert(isValidPeerWorldEncounterMaterialMessage(request), '12. a freshly built REQUEST validates');
        assert(isValidPeerWorldEncounterMaterialMessage(response), '13. a freshly built RESPONSE validates');
        assert(!isValidPeerWorldEncounterMaterialMessage(null), '14. null is not a valid message');
        assert(!isValidPeerWorldEncounterMaterialMessage({ kind: 'REQUEST', encounterKind: 'NOT_A_KIND', objectId: 'pub-1' }),
            '15. a REQUEST with an unknown encounterKind is rejected');
        assert(!isValidPeerWorldEncounterMaterialMessage({ kind: 'RESPONSE', encounterKind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', material: { title: 'x'.repeat(MAX_WORLD_ENCOUNTER_MATERIAL_BYTES) } }),
            '16. a hand-crafted oversized RESPONSE is rejected, bypassing the sending-side check entirely');
        assert(!isValidPeerWorldEncounterMaterialMessage({ kind: 'NOT_FOUND', encounterKind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1' }),
            '17. there is no NOT_FOUND kind — an unknown kind is rejected');
    }
    console.log('✓ Section A: PeerWorldEncounterMaterialProtocol — REQUEST/RESPONSE wire shapes, encounterKind + objectId + size validation');

    // ---------------------------------------------------------------
    // Section B — PeerWorldEncounterMaterialSource, stub transport
    // ---------------------------------------------------------------
    {
        expectThrows(() => new PeerWorldEncounterMaterialSource(null, new StubConnectedPeerRegistry()),
            '1. constructor requires a PeerMessageBus');
        expectThrows(() => new PeerWorldEncounterMaterialSource(new StubPeerMessageBus(), null),
            '2. constructor requires a ConnectedPeerRegistry');

        const alicePeer = stubPeer('conn-alice', 'did:key:zAlice');
        const bus = new StubPeerMessageBus();
        const registry = new StubConnectedPeerRegistry([alicePeer]);
        const source = new PeerWorldEncounterMaterialSource(bus, registry, { timeoutMs: 60 });

        assert(source instanceof WorldEncounterMaterialSource, '3. PeerWorldEncounterMaterialSource extends the 0.9.21 WorldEncounterMaterialSource contract');
        assert(bus.attached.has('conn-alice'), '4. every peer already in the registry is attached on construction');

        // --- local-origin and malformed selections never send anything ---
        for (const resolvedSelection of [
            undefined, null, {},
            selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'local' }),
            selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: '', origin: 'peer:did:key:zAlice' }),
            selectionOf({ kind: 'NOT_A_KIND', objectId: 'pub-1', origin: 'peer:did:key:zAlice' }),
            selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'peer:' }),
            selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'not-a-peer-origin' })
        ]) {
            const result = await source.load(resolvedSelection);
            assert(result === null, `5. a malformed/local-origin selection ${JSON.stringify(resolvedSelection)} resolves to null`);
        }
        assert(bus.sent.length === 0, '6. none of the malformed/local-origin selections above ever sent a message');

        // --- an origin naming no currently-connected peer resolves null, still never sends ---
        const unknownPeerResult = await source.load(selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'peer:did:key:zStranger' }));
        assert(unknownPeerResult === null, '7. an origin naming no currently-connected peer resolves to null');
        assert(bus.sent.length === 0, '8. an unknown peer origin never sends a request');

        // --- a well-formed selection sends exactly one REQUEST to the named peer ---
        const publicationJSON = new Publication({ id: 'pub-1', documentId: 'doc-1', title: 'Alice\'s Publication', author: 'alice' }).toJSON();
        {
            const pending = source.load(selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-1', origin: 'peer:did:key:zAlice' }));
            await wait(5);
            assert(bus.sent.length === 1, '9. a well-formed peer-origin selection sends exactly one REQUEST');
            assert(bus.sent[0].peer === alicePeer, '10. the REQUEST is sent to exactly the peer the origin named');
            assert(bus.sent[0].protocol === PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL, '11. the REQUEST is sent under this class\'s own namespaced protocol');
            assert(bus.sent[0].payload.kind === PeerWorldEncounterMaterialMessageKind.REQUEST
                && bus.sent[0].payload.encounterKind === WorldEncounterKind.PUBLICATION
                && bus.sent[0].payload.objectId === 'pub-1',
                '12. the REQUEST carries the exact encounterKind + objectId asked for');

            // A DIFFERENT, unrelated peer answering with a matching kind/objectId is never accepted.
            const eve = stubPeer('conn-eve', 'did:key:zEve');
            bus.deliver(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL,
                toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, 'pub-1', { title: 'Forged, from Eve' }),
                { connectedPeer: eve });
            await wait(5);

            // A mismatched objectId from the CORRECT peer is also ignored.
            bus.deliver(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL,
                toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, 'pub-2', { title: 'Wrong object' }),
                { connectedPeer: alicePeer });
            await wait(5);

            // The genuine RESPONSE, from the exact peer requested, resolves load().
            bus.deliver(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL,
                toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, 'pub-1', publicationJSON),
                { connectedPeer: alicePeer });

            const result = await pending;
            assert(result instanceof Publication, '13. a genuine RESPONSE from the requested peer resolves load() to a real Publication instance');
            assert(result.id === 'pub-1' && result.title === 'Alice\'s Publication', '14. the resolved Publication carries the material the peer actually supplied');
        }

        // --- a RESPONSE that never arrives from a DIFFERENT peer alone times out to null ---
        {
            bus.sent.length = 0;
            const bob = stubPeer('conn-bob', 'did:key:zBob');
            registry._peers = [alicePeer, bob];
            const pending = source.load(selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-3', origin: 'peer:did:key:zBob' }));
            await wait(5);
            // Alice answers instead of Bob — never accepted, because the selection named Bob.
            bus.deliver(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL,
                toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, 'pub-3', { title: 'Alice answering for Bob' }),
                { connectedPeer: alicePeer });
            const result = await pending;
            assert(result === null, '15. a RESPONSE from a peer other than the one explicitly selected is never substituted — the request times out to null instead');
        }

        // --- an unanswered request times out to null ---
        {
            const pending = source.load(selectionOf({ kind: WorldEncounterKind.AVATAR, objectId: 'avatar-nobody-answers', origin: 'peer:did:key:zAlice' }));
            const result = await pending;
            assert(result === null, '16. a request nobody answers times out to null');
        }

        // --- AVATAR kind deserializes to a real AvatarProfile ---
        {
            const avatarJSON = new AvatarProfile({ avatarId: 'avatar-1', ownerIdentity: 'alice', displayName: 'Alice' }).toJSON();
            const pending = source.load(selectionOf({ kind: WorldEncounterKind.AVATAR, objectId: 'avatar-1', origin: 'peer:did:key:zAlice' }));
            await wait(5);
            bus.deliver(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL,
                toWorldEncounterMaterialResponseMessage(WorldEncounterKind.AVATAR, 'avatar-1', avatarJSON),
                { connectedPeer: alicePeer });
            const result = await pending;
            assert(result instanceof AvatarProfile && result.avatarId === 'avatar-1' && result.displayName === 'Alice',
                '17. an AVATAR-kind selection deserializes to a real AvatarProfile instance');
        }

        // --- a malformed RESPONSE is silently dropped, never crashes ---
        {
            const pending = source.load(selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-4', origin: 'peer:did:key:zAlice' }));
            await wait(5);
            bus.deliver(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL, { kind: 'SOMETHING_ELSE', encounterKind: WorldEncounterKind.PUBLICATION, objectId: 'pub-4' }, { connectedPeer: alicePeer });
            await wait(5);
            bus.deliver(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL,
                toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, 'pub-4', { title: 'Real one' }),
                { connectedPeer: alicePeer });
            const result = await pending;
            assert(result instanceof Publication && result.title === 'Real one', '18. a malformed message is dropped without disrupting the still-pending, genuine RESPONSE that follows it');
        }

        // --- requester-only: an incoming REQUEST is silently ignored, never answered ---
        {
            const responderBus = new StubPeerMessageBus();
            const responderRegistry = new StubConnectedPeerRegistry([]);
            const responderSource = new PeerWorldEncounterMaterialSource(responderBus, responderRegistry, { timeoutMs: 60 });
            const requester = stubPeer('conn-requester', 'did:key:zRequester');
            responderBus.deliver(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL,
                toWorldEncounterMaterialRequestMessage(WorldEncounterKind.PUBLICATION, 'pub-1'),
                { connectedPeer: requester });
            await wait(5);
            assert(responderBus.sent.length === 0, '19. an incoming REQUEST is never answered — answering is deliberately not this milestone\'s job (0.9.24)');
            responderSource.dispose();
        }

        // --- no caching: two calls against the same selection each send a fresh REQUEST ---
        {
            bus.sent.length = 0;
            const publicationJSON2 = new Publication({ id: 'pub-5', documentId: 'doc-5', title: 'Fresh Every Time', author: 'alice' }).toJSON();
            const first = source.load(selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-5', origin: 'peer:did:key:zAlice' }));
            await wait(5);
            bus.deliver(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL, toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, 'pub-5', publicationJSON2), { connectedPeer: alicePeer });
            await first;

            const second = source.load(selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-5', origin: 'peer:did:key:zAlice' }));
            await wait(5);
            bus.deliver(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL, toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, 'pub-5', publicationJSON2), { connectedPeer: alicePeer });
            await second;

            assert(bus.sent.length === 2, '20. no caching — the identical selection sends a fresh REQUEST on every call');
        }

        // --- dispose() stops handling incoming messages ---
        {
            const disposalBus = new StubPeerMessageBus();
            const disposalRegistry = new StubConnectedPeerRegistry([alicePeer]);
            const disposalSource = new PeerWorldEncounterMaterialSource(disposalBus, disposalRegistry, { timeoutMs: 60 });
            const pending = disposalSource.load(selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-6', origin: 'peer:did:key:zAlice' }));
            await wait(5);
            disposalSource.dispose();
            disposalBus.deliver(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL,
                toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, 'pub-6', { title: 'Too late' }),
                { connectedPeer: alicePeer });
            const result = await pending;
            assert(result === null, '21. dispose() unsubscribes from the bus — a RESPONSE delivered afterward is never observed, and the pending load() still resolves null via its own timeout');
        }

        // --- integration with the unmodified 0.9.21 loading boundary ---
        {
            const integrationBus = new StubPeerMessageBus();
            const integrationRegistry = new StubConnectedPeerRegistry([alicePeer]);
            const integrationSource = new PeerWorldEncounterMaterialSource(integrationBus, integrationRegistry, { timeoutMs: 500 });
            const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-7', origin: 'peer:did:key:zAlice' });

            const pending = loadWorldEncounterMaterial({ resolvedSelection, materialSources: { peer: integrationSource } });
            await wait(5);
            integrationBus.deliver(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL,
                toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, 'pub-7', new Publication({ id: 'pub-7', documentId: 'doc-7', title: 'Via The Boundary', author: 'alice' }).toJSON()),
                { connectedPeer: alicePeer });
            const result = await pending;
            assert(result.status === 'AVAILABLE', '22. a resolved peer-origin selection loads through the unmodified 0.9.21 boundary');
            assert(result.material instanceof Publication && result.material.title === 'Via The Boundary', '23. the 0.9.21 boundary forwards this source\'s own material unchanged');
            assert(result.resolvedSelection === resolvedSelection, '24. resolvedSelection is still forwarded by reference through the full chain');
            integrationSource.dispose();
        }
    }
    console.log('✓ Section B: PeerWorldEncounterMaterialSource — single-peer request/timeout shape, no substitution across peers, requester-only, no caching, dispose(), 0.9.21 integration');

    // ---------------------------------------------------------------
    // Section C — FLAGSHIP: a real, live, authenticated connection. Bob
    // explicitly selects Alice (the identity his own connection already
    // proved) and receives her material over a genuine round trip; Alice's
    // reply is hand-assembled with this file's own protocol module,
    // standing in for the still-unscheduled 0.9.24 responder.
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeIdentity('Alice');
        const bob = makeIdentity('Bob');

        const aliceTransport = new LocalPeerConnectionProvider('alice-world-material', network);
        const bobTransport = new LocalPeerConnectionProvider('bob-to-alice-world-material', network);
        const aliceListen = new ConnectToPeerUseCase({ peerConnectionProvider: aliceTransport, identityProvider: alice });
        const stopAliceListening = aliceListen.listen();
        const bobConnect = new ConnectToPeerUseCase({ peerConnectionProvider: bobTransport, identityProvider: bob });
        const bobToAlicePeer = bobConnect.connect({ candidateEndpoint: 'alice-world-material' });
        await wait(20);
        assert(bobToAlicePeer.getLifecycleState() === PeerLifecycleState.AUTHENTICATED, '1. setup: Bob authenticates to Alice');

        const aliceBus = new PeerMessageBus();
        const bobBus = new PeerMessageBus();
        const bobSource = new PeerWorldEncounterMaterialSource(bobBus, bobConnect.registry, { timeoutMs: 2000 });

        // Alice hand-answers REQUESTs using this file's own protocol module
        // directly against her own raw PeerMessageBus — standing in for
        // the still-unscheduled 0.9.24 responder, never for
        // PeerWorldEncounterMaterialSource itself (which never answers a
        // REQUEST — see Section B, "requester-only").
        const alicePublication = new Publication({ id: 'pub-alice-1', documentId: 'doc-alice-1', title: 'From Alice, For Real', author: 'alice' });
        for (const peer of aliceListen.registry.list()) {
            aliceBus.attach(peer);
        }
        aliceListen.registry.onChange((peers) => { for (const peer of peers) aliceBus.attach(peer); });
        aliceBus.subscribe(PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL, (payload, meta) => {
            if (payload.kind !== PeerWorldEncounterMaterialMessageKind.REQUEST) return;
            if (payload.encounterKind === WorldEncounterKind.PUBLICATION && payload.objectId === alicePublication.id) {
                aliceBus.send(meta.connectedPeer, PeerWorldEncounterMaterialSource.DEFAULT_PROTOCOL,
                    toWorldEncounterMaterialResponseMessage(WorldEncounterKind.PUBLICATION, alicePublication.id, alicePublication.toJSON()));
            }
            // Anything else: Alice, like a real future responder answering
            // only what it actually holds, simply says nothing.
        });

        // --- Bob explicitly selects Alice, by the exact identity his own connection proved ---
        {
            const origin = `peer:${bobToAlicePeer.remoteIdentity.identityId}`;
            const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: alicePublication.id, origin });
            const result = await bobSource.load(resolvedSelection);
            assert(result instanceof Publication, '2. Bob receives a real Publication instance over a genuine peer connection');
            assert(result.id === alicePublication.id && result.title === 'From Alice, For Real', '3. the received material is exactly what Alice supplied');
        }

        // --- an object Alice does not hold: she never answers, Bob observes the honest null ---
        {
            const origin = `peer:${bobToAlicePeer.remoteIdentity.identityId}`;
            const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: 'pub-alice-does-not-have-this', origin });
            const result = await bobSource.load(resolvedSelection);
            assert(result === null, '4. an object the selected peer does not hold resolves to null — silence, never a forwarded or fabricated answer');
        }

        // --- a peer identity nobody is connected to resolves to null without ever touching the wire ---
        {
            const resolvedSelection = selectionOf({ kind: WorldEncounterKind.PUBLICATION, objectId: alicePublication.id, origin: 'peer:did:key:zSomeoneNeverConnected' });
            const result = await bobSource.load(resolvedSelection);
            assert(result === null, '5. an origin naming a peer this device is not connected to resolves to null');
        }

        bobSource.dispose();
        stopAliceListening();
        aliceTransport.dispose();
        bobTransport.dispose();
    }
    console.log('✓ Section C: FLAGSHIP — a real, live, authenticated connection; Bob explicitly selects Alice and receives her material over a genuine round trip; an object she does not hold answers with honest silence');

    console.log('\nAll Peer World Encounter Material Source tests passed.');
}

run().catch((error) => {
    console.error('PeerWorldEncounterMaterialSource.test.js FAILED:', error);
    process.exitCode = 1;
});
