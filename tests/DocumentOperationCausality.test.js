import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectedPeer } from '../application/ConnectedPeer.js';
import { ConnectedPeerRegistry } from '../application/ConnectedPeerRegistry.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/DeviceAuthorizationPropagationUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { DocumentCommandPropagationUseCase } from '../application/DocumentCommandPropagationUseCase.js';
import {
    toDocumentOperationEnvelope,
    isValidDocumentOperationEnvelope,
    isValidCausalPredecessorList
} from '../core/DocumentOperationEnvelope.js';
import {
    CausalRelationship,
    DocumentOperationCausalGraph
} from '../core/DocumentOperationCausality.js';

// 0.9.227 — Document Operation Identity & Causal Predecessor Boundary.
//
// 0.9.226 named the next decision as an actual product requirement, not
// an algorithm choice, and named "causal delivery" as one of three
// internally-consistent directions — the one this milestone takes,
// deliberately scoped to ONLY the metadata seam: can this codebase
// distinguish "B happened because of A" from "B merely arrived after
// A"? Sections 1-9 below are pure — no peers, no network, no documents
// — and exercise `core/DocumentOperationCausality.js` directly. Section
// 10 proves the one production behavior this milestone actually adds
// (`application/DocumentCommandPropagationUseCase.js`'s own
// `causalPredecessors` stamping and relay) against the REAL, unmodified
// broadcast/receive chain 0.9.222-0.9.226 already built and audited —
// never a hand-rolled substitute.
//
// Deliberately NOT tested here, because it deliberately does not exist:
// reordering `application/CommandHistory.js`, buffering, retransmission,
// missing-operation requests, conflict resolution, or any claim of
// convergence. See `core/DocumentOperationCausality.js`'s own header.

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

function assertThrows(fn, message) {
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
}

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

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

function makeSenderStack(device) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const propagation = new DocumentCommandPropagationUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        identityProvider: device.provider, commandRegistry,
        resolveDocument: () => null
    });
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, propagation };
}

function makeReceiverStack(device) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const received = [];
    const state = { target: null };
    const propagation = new DocumentCommandPropagationUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        identityProvider: device.provider, commandRegistry,
        resolveDocument: (id) => (state.target && state.target.documentId === id ? state.target.document : null)
    });
    propagation.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors) => received.push({ documentId, command, authorIdentityId, causalPredecessors }));
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, propagation, received, state };
}

function buildBaseDocument({ worldId, authorIdentityId, title }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: 'building-x' });
    building.addBrick(new Brick({ id: 'brick-a', definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'owner', authorIdentityId }) });
}

function openReplicaDocument(replica, worldId, authorIdentityId, title) {
    const document = buildBaseDocument({ worldId, authorIdentityId, title });
    const target = { documentId: worldId, document, commandHistory: new CommandHistory({ world: document.world }) };
    replica.state.target = target;
    return target;
}

async function runTests() {

// ===================================================================
// Section 1 — Envelope validation: causalPredecessors is OPTIONAL and
// additive, following the SAME "absent is valid, present-and-malformed
// is refused" discipline core/WorldOperationEnvelope.js's own 0.2.97
// logicalClock field established.
// ===================================================================
{
    const command = { type: 'test:command', payload: 1 };
    const bare = toDocumentOperationEnvelope({ operationId: 'op-1', documentId: 'doc-1', authorIdentityId: 'alice', command });
    assert(Array.isArray(bare.causalPredecessors) && bare.causalPredecessors.length === 0,
        '1. omitting causalPredecessors degrades to [] — a genesis operation, exactly like a pre-0.9.227 envelope');
    assert(isValidDocumentOperationEnvelope(bare), '2. the degraded envelope is still valid');

    const withPredecessors = toDocumentOperationEnvelope({ operationId: 'op-2', documentId: 'doc-1', authorIdentityId: 'alice', command, causalPredecessors: ['op-1'] });
    assert(isValidDocumentOperationEnvelope(withPredecessors), '3. a well-formed causalPredecessors list validates');
    assert(JSON.stringify(withPredecessors.causalPredecessors) === JSON.stringify(['op-1']), '4. the list round-trips unchanged');

    assertThrows(() => toDocumentOperationEnvelope({ operationId: 'op-3', documentId: 'doc-1', authorIdentityId: 'alice', command, causalPredecessors: ['op-3'] }),
        '5. an operation may never list itself as its own causal predecessor');
    assertThrows(() => toDocumentOperationEnvelope({ operationId: 'op-4', documentId: 'doc-1', authorIdentityId: 'alice', command, causalPredecessors: ['op-1', 'op-1'] }),
        '6. duplicate predecessor ids are rejected, not silently deduplicated');
    assertThrows(() => toDocumentOperationEnvelope({ operationId: 'op-5', documentId: 'doc-1', authorIdentityId: 'alice', command, causalPredecessors: ['', 'op-1'] }),
        '7. an empty-string predecessor id is rejected');
    assertThrows(() => toDocumentOperationEnvelope({ operationId: 'op-6', documentId: 'doc-1', authorIdentityId: 'alice', command, causalPredecessors: 'op-1' }),
        '8. a non-array causalPredecessors is rejected, never coerced');

    assert(isValidDocumentOperationEnvelope({ ...bare, causalPredecessors: undefined }), '9. absent (undefined) on a raw payload is still valid — pre-0.9.227 senders are unaffected');
    assert(isValidDocumentOperationEnvelope({ ...bare, causalPredecessors: ['op-0'] }), '10. a well-formed list on a raw payload is valid');
    assert(!isValidDocumentOperationEnvelope({ ...bare, causalPredecessors: [bare.operationId] }), '11. a raw payload naming itself as its own predecessor is invalid');
    assert(!isValidDocumentOperationEnvelope({ ...bare, causalPredecessors: [1, 2] }), '12. a raw payload with non-string entries is invalid');
    assert(!isValidCausalPredecessorList(null), '13. isValidCausalPredecessorList itself refuses a non-array');
    console.log('✓ Section 1: causalPredecessors is optional, additive, closed-vocabulary-shaped validation — identical discipline to 0.2.97\'s logicalClock');
}

// ===================================================================
// Section 2 — Genesis operation: no predecessors is valid, and is
// KNOWN to the graph once recorded even though it depends on nothing.
// ===================================================================
{
    const graph = new DocumentOperationCausalGraph();
    graph.record('doc-1', 'A', []);
    assert(graph.isKnown('doc-1', 'A'), '14. a genesis operation, once recorded, is known');
    assert(graph.compare('doc-1', 'A', 'A') === CausalRelationship.SAME, '15. an operation always relates to itself as SAME');
    console.log('✓ Section 2: a genesis operation (no predecessors) is valid and known');
}

// ===================================================================
// Section 3 — Causal successor: A -> B is recognized as B causally
// depending on A, in both directions of the comparison.
// ===================================================================
{
    const graph = new DocumentOperationCausalGraph();
    graph.record('doc-1', 'A', []);
    graph.record('doc-1', 'B', ['A']);
    assert(graph.compare('doc-1', 'A', 'B') === CausalRelationship.BEFORE, '16. A is BEFORE B');
    assert(graph.compare('doc-1', 'B', 'A') === CausalRelationship.AFTER, '17. B is AFTER A — the exact inverse');
    console.log('✓ Section 3: A -> B is recognized as a genuine causal dependency, not merely arrival order');
}

// ===================================================================
// Section 4 — Independent operations: two operations that reference
// neither each other are CONCURRENT, not merely "unordered."
// ===================================================================
{
    const graph = new DocumentOperationCausalGraph();
    graph.record('doc-1', 'A', []);
    graph.record('doc-1', 'B', []);
    assert(graph.compare('doc-1', 'A', 'B') === CausalRelationship.CONCURRENT, '18. two independent genesis operations are CONCURRENT');
    assert(graph.compare('doc-1', 'B', 'A') === CausalRelationship.CONCURRENT, '19. CONCURRENT is symmetric');
    console.log('✓ Section 4: independent operations are recognized as genuinely CONCURRENT, verifiably — not just "arrived in some order"');
}

// ===================================================================
// Section 5 — Multiple predecessors: a diamond graph
//   A -> B, A -> C, {B, C} -> D
// preserves the shape exactly: B and C are concurrent siblings, D
// causally follows both, and A precedes everything.
// ===================================================================
{
    const graph = new DocumentOperationCausalGraph();
    graph.record('doc-1', 'A', []);
    graph.record('doc-1', 'B', ['A']);
    graph.record('doc-1', 'C', ['A']);
    graph.record('doc-1', 'D', ['B', 'C']);

    assert(graph.compare('doc-1', 'A', 'B') === CausalRelationship.BEFORE, '20. A BEFORE B');
    assert(graph.compare('doc-1', 'A', 'C') === CausalRelationship.BEFORE, '21. A BEFORE C');
    assert(graph.compare('doc-1', 'B', 'C') === CausalRelationship.CONCURRENT, '22. B and C, both descending only from A, are CONCURRENT siblings');
    assert(graph.compare('doc-1', 'B', 'D') === CausalRelationship.BEFORE, '23. B BEFORE D');
    assert(graph.compare('doc-1', 'C', 'D') === CausalRelationship.BEFORE, '24. C BEFORE D');
    assert(graph.compare('doc-1', 'A', 'D') === CausalRelationship.BEFORE, '25. A BEFORE D, transitively, even though D never directly lists A');
    console.log('✓ Section 5: a diamond-shaped causal graph (multiple predecessors) is preserved exactly');
}

// ===================================================================
// Section 6 — Transitivity: A -> B -> C must place A BEFORE C even
// though C's own predecessor list only ever names B.
// ===================================================================
{
    const graph = new DocumentOperationCausalGraph();
    graph.record('doc-1', 'A', []);
    graph.record('doc-1', 'B', ['A']);
    graph.record('doc-1', 'C', ['B']);
    assert(graph.compare('doc-1', 'A', 'C') === CausalRelationship.BEFORE, '26. A BEFORE C, transitively through B, with no direct A->C edge');
    assert(graph.compare('doc-1', 'C', 'A') === CausalRelationship.AFTER, '27. the inverse holds too');
    console.log('✓ Section 6: causal predecessor chains compose transitively without a direct edge');
}

// ===================================================================
// Section 7 — Identity preservation: two operations with IDENTICAL
// command content but distinct operationIds remain distinct nodes —
// the causal graph is keyed by operationId, never by command equality,
// the same discipline replication/ReplayGuard.js already applies.
// ===================================================================
{
    const worldId = 'doc-identity';
    const moveOne = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 1, y: 0, z: 0 } });
    const moveTwo = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 1, y: 0, z: 0 } });
    assert(moveOne.id !== moveTwo.id, '28. two commands with identical parameters still get distinct auto-generated ids');
    assert(JSON.stringify(moveOne.toJSON().delta) === JSON.stringify(moveTwo.toJSON().delta), '29. their serialized command content is genuinely identical');

    const graph = new DocumentOperationCausalGraph();
    graph.record(worldId, moveOne.id, []);
    graph.record(worldId, moveTwo.id, []);
    assert(graph.compare(worldId, moveOne.id, moveTwo.id) === CausalRelationship.CONCURRENT,
        '30. identical-content operations with distinct ids are compared by IDENTITY, not content — two independent genesis operations, CONCURRENT');
    console.log('✓ Section 7: identity, not command equality, is what the causal graph keys on');
}

// ===================================================================
// Section 8 — Document isolation: a predecessor recorded under one
// document can never become a causal predecessor of an operation in a
// DIFFERENT document, even when the two documents happen to use the
// identical operationId string.
// ===================================================================
{
    const graph = new DocumentOperationCausalGraph();
    graph.record('doc-X', 'shared-id', []);
    graph.record('doc-Y', 'shared-id', []);
    graph.record('doc-Y', 'op-2', ['shared-id']);

    assert(graph.compare('doc-Y', 'shared-id', 'op-2') === CausalRelationship.BEFORE,
        '31. WITHIN doc-Y, shared-id (doc-Y\'s own genesis) is BEFORE op-2, which explicitly names it');
    assert(graph.isKnown('doc-X', 'shared-id') && graph.isKnown('doc-Y', 'shared-id'),
        '32. the identical operationId string is independently known in each document\'s own scope');
    assert(graph.compare('doc-mismatch', 'shared-id', 'op-2') === CausalRelationship.UNKNOWN,
        '33. neither operation was ever recorded under "doc-mismatch" — the answer is UNKNOWN, never borrowed from doc-X or doc-Y\'s own scope');
    console.log('✓ Section 8: causal predecessors are strictly document-scoped — an operationId collision across documents cannot cross the boundary');
}

// ===================================================================
// Section 9 — Missing-predecessor tolerance: recording an operation
// whose predecessor was never itself recorded must NOT be rejected —
// exactly this milestone's own "causal metadata != missing-operation
// detection" boundary (see core/DocumentOperationCausality.js's own
// header). It compares as UNKNOWN, never as an error and never as
// CONCURRENT (which would falsely claim independence).
// ===================================================================
{
    const graph = new DocumentOperationCausalGraph();
    graph.record('doc-1', 'B', ['A']); // A was never recorded — B arrived, A did not.
    assert(graph.isKnown('doc-1', 'B'), '34. B is recorded and known even though its predecessor A never was');
    assert(!graph.isKnown('doc-1', 'A'), '35. A itself is not known — this replica has never seen it');
    assert(graph.compare('doc-1', 'A', 'B') === CausalRelationship.UNKNOWN,
        '36. comparing against a never-recorded operation answers UNKNOWN, not CONCURRENT and not an error — this is metadata, not a completeness guarantee');
    console.log('✓ Section 9: an operation whose predecessor is missing is still representable — causal metadata never implies missing-operation detection');
}

// ===================================================================
// Section 9b — record() contract: idempotent for a repeat of the
// identical triple; rejects a mismatched re-record of a KNOWN id, and
// rejects malformed predecessor lists (self-reference, duplicates) at
// the same boundary the envelope itself enforces.
// ===================================================================
{
    const graph = new DocumentOperationCausalGraph();
    graph.record('doc-1', 'A', []);
    graph.record('doc-1', 'B', ['A']);
    graph.record('doc-1', 'B', ['A']); // identical repeat — no-op, must not throw
    assertThrows(() => graph.record('doc-1', 'B', []), '37. re-recording a KNOWN operationId with a DIFFERENT predecessor set is a contract violation');
    assertThrows(() => graph.record('doc-1', 'C', ['C']), '38. an operation may never list itself as its own predecessor');
    assertThrows(() => graph.record('doc-1', 'D', ['A', 'A']), '39. duplicate predecessor ids are rejected');
    console.log('✓ Section 9b: DocumentOperationCausalGraph#record() is idempotent for repeats and rejects mismatched or malformed re-recording');
}

// ===================================================================
// Section 10 — Propagation preservation: the REAL, unmodified
// broadcastCommand()/onOperationReceived() chain (0.9.222-0.9.226,
// completely untouched by this milestone) carries causalPredecessors
// end to end, unmodified, AND attachCommandHistory() derives it
// automatically for consecutive LOCALLY-authored commands — the one
// production behavior this milestone adds.
// ===================================================================
{
    const network = new LocalPeerNetwork();
    const aliceDevice = makeDevice('Alice');
    const bobDevice = makeDevice('Bob');
    const alice = makeSenderStack(aliceDevice);
    const bob = makeReceiverStack(bobDevice);

    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice', aliceDevice, 'bob', bobDevice);
    alice.connectedPeerRegistry.add(peerA);
    bob.connectedPeerRegistry.add(peerB);

    const worldId = 'doc-propagation';
    openReplicaDocument(bob, worldId, aliceDevice.identity.identityId, 'Section 10');

    const aliceHistory = new CommandHistory({ world: buildBaseDocument({ worldId, authorIdentityId: aliceDevice.identity.identityId, title: 'Alice' }).world });
    const unsubscribe = alice.propagation.attachCommandHistory({ documentId: worldId, commandHistory: aliceHistory });

    const first = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 1, y: 0, z: 0 } });
    const second = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 2, y: 0, z: 0 } });
    aliceHistory.execute(first);
    await wait(20);
    aliceHistory.execute(second);
    await wait(20);

    assert(bob.received.length === 2, '40. Bob received both operations');
    assert(JSON.stringify(bob.received[0].causalPredecessors) === JSON.stringify([]),
        '41. the FIRST local command carries no causal predecessor — a genesis operation');
    assert(JSON.stringify(bob.received[1].causalPredecessors) === JSON.stringify([first.id]),
        '42. the SECOND local command carries the FIRST command\'s id as its own causal predecessor — derived automatically from this replica\'s own CommandHistory, never left empty');

    const graph = new DocumentOperationCausalGraph();
    graph.record(worldId, bob.received[0].command.id, bob.received[0].causalPredecessors);
    graph.record(worldId, bob.received[1].command.id, bob.received[1].causalPredecessors);
    assert(graph.compare(worldId, first.id, second.id) === CausalRelationship.BEFORE,
        '43. feeding the RECEIVED envelopes\' own causalPredecessors straight into a fresh DocumentOperationCausalGraph reconstructs the true relationship on the receiving replica');

    unsubscribe();
    alice.propagation.dispose();
    bob.propagation.dispose();
    console.log('✓ Section 10: causalPredecessors survives broadcastCommand() -> onOperationReceived() unmodified, and attachCommandHistory() derives it automatically for local commands');
}

console.log('\n0.9.227 — causal predecessor identity is representable, transitive, document-isolated, and survives the real propagation chain unmodified, without any reordering, queue, or conflict mechanism.');

}

runTests().then(() => {
    console.log('\n✓ All DocumentOperationCausality tests passed');
}).catch((error) => {
    console.error('\n✗ DocumentOperationCausality tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
