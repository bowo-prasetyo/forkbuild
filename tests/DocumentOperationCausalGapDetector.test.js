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
    RemoteDocumentOperationApplicationUseCase,
    DocumentOperationApplicationOutcome
} from '../application/RemoteDocumentOperationApplicationUseCase.js';
import {
    CausalGapStatus,
    DocumentOperationCausalGapDetector
} from '../core/DocumentOperationCausalGapDetector.js';

// 0.9.228 — Document Operation Causal Gap Detection Boundary.
//
// 0.9.227 made causal dependency representable and queryable; this
// milestone asks the one question that representation now makes
// meaningful: given one just-arrived (or just-authored) operation, is any
// causal predecessor it names absent from what THIS replica currently
// knows? Sections A-G below exercise `DocumentOperationCausalGapDetector`
// directly, pure, no peers. Section H proves the one thing that matters
// most about this milestone's own restraint: detection running against
// the REAL, unmodified broadcast/receive/apply chain (0.9.222-0.9.227)
// changes nothing about whether an operation gets applied.
//
// Deliberately NOT tested here, because it deliberately does not exist:
// buffering, retransmission, automatic predecessor retrieval, retry,
// synchronization, rollback, reordering, conflict resolution, or any
// claim of convergence. See core/DocumentOperationCausalGapDetector.js's
// own header.

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
// Section A — Complete predecessor: A is known, B names A as its only
// causal predecessor -> NO_GAP.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    detector.record('doc-1', 'A', []);
    const result = detector.detect('doc-1', { operationId: 'B', causalPredecessors: ['A'] });
    assert(result.status === CausalGapStatus.NO_GAP, '1. A is known -> B depending on A alone is NO_GAP');
    assert(Array.isArray(result.missingCausalPredecessorIds) && result.missingCausalPredecessorIds.length === 0, '2. no missing predecessors reported for NO_GAP');

    const genesis = detector.detect('doc-1', { operationId: 'A', causalPredecessors: [] });
    assert(genesis.status === CausalGapStatus.NO_GAP, '3. an operation with no predecessors at all is unconditionally NO_GAP');
    console.log('✓ Section A: a fully-known causal predecessor produces NO_GAP');
}

// ===================================================================
// Section B — Direct gap: B names A as a predecessor, but A was never
// recorded locally -> GAP, naming A as the missing predecessor.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const result = detector.detect('doc-1', { operationId: 'B', causalPredecessors: ['A'] });
    assert(result.status === CausalGapStatus.GAP, '4. an unrecorded predecessor produces GAP');
    assert(JSON.stringify(result.missingCausalPredecessorIds) === JSON.stringify(['A']), '5. the missing predecessor is named exactly');
    assert(!detector.isKnown('doc-1', 'B'), '6. detect() never records the operation it was asked about — B itself stays unknown');
    console.log('✓ Section B: a predecessor this replica never recorded is a detected causal gap');
}

// ===================================================================
// Section C — Transitive gap: A -> B -> C, but B (the middle operation)
// was never recorded. C's own predecessor list only ever names B
// directly, and B's absence must still surface as a gap for C even
// though A, the true root, is known.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    detector.record('doc-1', 'A', []);
    // B is deliberately never recorded — it is the missing link.
    const result = detector.detect('doc-1', { operationId: 'C', causalPredecessors: ['B'] });
    assert(result.status === CausalGapStatus.GAP, '7. C names B, and B was never recorded, even though A (an ancestor of B) is known');
    assert(JSON.stringify(result.missingCausalPredecessorIds) === JSON.stringify(['B']), '8. B, not A, is reported missing — the gap is about the DIRECT predecessor, not the whole ancestry');
    console.log('✓ Section C: a missing middle operation in a causal chain is detected even when its own ancestor is known');
}

// ===================================================================
// Section D — Multiple predecessors: a diamond shape A -> B, A -> C,
// {B, C} -> D. When only B is known, D's gap must name C specifically,
// not merely report "something is missing."
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    detector.record('doc-1', 'A', []);
    detector.record('doc-1', 'B', ['A']);
    // C is deliberately never recorded.
    const result = detector.detect('doc-1', { operationId: 'D', causalPredecessors: ['B', 'C'] });
    assert(result.status === CausalGapStatus.GAP, '9. D depends on both B and C; C is missing, so D has a gap');
    assert(JSON.stringify(result.missingCausalPredecessorIds) === JSON.stringify(['C']), '10. only C is reported missing — B, which IS known, is not falsely included');

    const bothMissing = new DocumentOperationCausalGapDetector();
    bothMissing.record('doc-1', 'A', []);
    const neitherKnown = bothMissing.detect('doc-1', { operationId: 'D', causalPredecessors: ['B', 'C'] });
    assert(JSON.stringify(neitherKnown.missingCausalPredecessorIds.sort()) === JSON.stringify(['B', 'C']), '11. when neither sibling is known, BOTH are reported missing, not just the first');
    console.log('✓ Section D: a diamond-shaped dependency correctly identifies which specific predecessor(s) are absent');
}

// ===================================================================
// Section E — Later arrival: a gap detected now must stop being
// detected once the missing predecessor is itself recorded — but this
// class never replays or re-applies anything on its own; the caller
// must ask again.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    const beforeArrival = detector.detect('doc-1', { operationId: 'B', causalPredecessors: ['A'] });
    assert(beforeArrival.status === CausalGapStatus.GAP, '12. before A arrives, B has a detected gap');
    detector.record('doc-1', 'B', ['A']); // B itself is still recorded, even though its predecessor is unknown — arrival and completeness are separate facts.

    detector.record('doc-1', 'A', []); // A arrives.
    const afterArrival = detector.detect('doc-1', { operationId: 'B', causalPredecessors: ['A'] });
    assert(afterArrival.status === CausalGapStatus.NO_GAP, '13. after A is recorded, re-detecting the SAME operation with the SAME predecessor list answers NO_GAP');
    assert(detector.isKnown('doc-1', 'B'), '14. B was recorded despite its earlier gap — recording an operation and it having a gap are independent facts');
    console.log('✓ Section E: a detected gap disappears on re-query once the missing predecessor is recorded, with no automatic replay');
}

// ===================================================================
// Section F — Duplicate delivery: ReplayGuard owns deduplication.
// Recording and detecting the same operation repeatedly must be
// idempotent and must never become a second dedup mechanism.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    detector.record('doc-1', 'A', []);
    detector.record('doc-1', 'B', ['A']);
    detector.record('doc-1', 'B', ['A']); // identical repeat — must not throw
    const first = detector.detect('doc-1', { operationId: 'B', causalPredecessors: ['A'] });
    const second = detector.detect('doc-1', { operationId: 'B', causalPredecessors: ['A'] });
    assert(first.status === CausalGapStatus.NO_GAP && second.status === CausalGapStatus.NO_GAP, '15. repeated detect() calls for the same operation are stable, not cumulative');
    assertThrows(() => detector.record('doc-1', 'B', []), '16. re-recording a KNOWN operationId with a DIFFERENT predecessor set still throws — this class does not loosen DocumentOperationCausalGraph\'s own contract');
    console.log('✓ Section F: recording/detecting the same operation repeatedly is idempotent, and never substitutes for ReplayGuard\'s own duplicate-delivery role');
}

// ===================================================================
// Section G — Document isolation: an operationId recorded under one
// document must never satisfy a predecessor reference in a different
// document, even when the id strings collide exactly.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    detector.record('doc-X', 'shared-id', []);
    const sameDocument = detector.detect('doc-X', { operationId: 'op-2', causalPredecessors: ['shared-id'] });
    assert(sameDocument.status === CausalGapStatus.NO_GAP, '17. WITHIN doc-X, shared-id is known and satisfies the predecessor reference');

    const otherDocument = detector.detect('doc-Y', { operationId: 'op-2', causalPredecessors: ['shared-id'] });
    assert(otherDocument.status === CausalGapStatus.GAP, '18. the IDENTICAL operationId recorded only under doc-X does not satisfy a reference to it under doc-Y');
    assert(JSON.stringify(otherDocument.missingCausalPredecessorIds) === JSON.stringify(['shared-id']), '19. doc-Y correctly reports shared-id as missing in its own scope');
    console.log('✓ Section G: causal gap detection is strictly document-scoped, exactly like the graph it is built on');
}

// ===================================================================
// Section G2 — Input validation: the same closed-vocabulary discipline
// core/DocumentOperationEnvelope.js and DocumentOperationCausality.js
// already apply.
// ===================================================================
{
    const detector = new DocumentOperationCausalGapDetector();
    assertThrows(() => detector.detect(null, { operationId: 'A', causalPredecessors: [] }), '20. a missing documentId throws');
    assertThrows(() => detector.detect('doc-1', { operationId: '', causalPredecessors: [] }), '21. a missing operationId throws');
    assertThrows(() => detector.detect('doc-1', { operationId: 'A', causalPredecessors: ['A'] }), '22. an operation naming itself as its own predecessor throws');
    assertThrows(() => detector.detect('doc-1', { operationId: 'A', causalPredecessors: 'A' }), '23. a non-array causalPredecessors throws, never coerced');
    assertThrows(() => new DocumentOperationCausalGapDetector({ causalGraph: {} }), '24. an invalid causalGraph dependency throws at construction');
    console.log('✓ Section G2: DocumentOperationCausalGapDetector#detect() enforces the same closed-vocabulary input discipline as its sibling files');
}

// ===================================================================
// Section H — Integration with propagation: the REAL, unmodified
// broadcastCommand() -> DocumentOperationEnvelope -> onOperationReceived()
// chain (0.9.222-0.9.227), feeding a real gap detector, while proving
// detection changes NOTHING about whether
// RemoteDocumentOperationApplicationUseCase actually applies the
// operation — a gapped operation is applied exactly like an ungapped
// one, because this milestone is observation only.
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

    const worldId = 'doc-gap-integration';
    const target = openReplicaDocument(bob, worldId, aliceDevice.identity.identityId, 'Section H');

    const aliceHistory = new CommandHistory({ world: buildBaseDocument({ worldId, authorIdentityId: aliceDevice.identity.identityId, title: 'Alice' }).world });
    const unsubscribePropagation = alice.propagation.attachCommandHistory({ documentId: worldId, commandHistory: aliceHistory });

    const detector = new DocumentOperationCausalGapDetector();
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const observations = [];
    const unsubscribeApplication = bob.propagation.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors) => {
        const gap = detector.detect(documentId, { operationId: command.id, causalPredecessors });
        observations.push({ operationId: command.id, gap: gap.status, missing: gap.missingCausalPredecessorIds });
        detector.record(documentId, command.id, causalPredecessors);
        // The gap observation is recorded and reported; it never gates
        // this call. Applying happens exactly as 0.9.223/0.9.224 already
        // wired it, unconditionally.
        const outcome = applicationUseCase.apply({ documentId, command, authorIdentityId }, target);
        assert(outcome === DocumentOperationApplicationOutcome.APPLIED, 'H-precondition: the operation applies regardless of gap status');
    });

    const first = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 1, y: 0, z: 0 } });
    const second = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 2, y: 0, z: 0 } });
    aliceHistory.execute(first);
    await wait(20);
    aliceHistory.execute(second);
    await wait(20);

    assert(bob.received.length === 2, '25. Bob received both operations over the real chain');
    assert(observations.length === 2, '26. the gap detector observed both operations');
    assert(observations[0].gap === CausalGapStatus.NO_GAP, '27. the FIRST operation (no predecessors) has no gap');
    assert(observations[1].gap === CausalGapStatus.NO_GAP, '28. the SECOND operation names the FIRST as its predecessor, and the first was already recorded by the time the second arrived — no gap');
    assert(target.commandHistory.getExecutedCommands().length === 2, '29. both remote operations were actually applied to Bob\'s own command history');
    assert(target.commandHistory.getExecutedCommands()[0].id === first.id, '30. applied in arrival order — application/CommandHistory.js is untouched, still ARRIVAL_ORDER (0.9.226)');
    assert(target.commandHistory.getExecutedCommands()[1].id === second.id, '31. the second applied operation is genuinely the second command');

    // Now prove the inverse: a genuinely gapped operation still applies.
    // A third command is fabricated with a predecessor Bob never saw.
    const third = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 3, y: 0, z: 0 } });
    const thirdGap = detector.detect(worldId, { operationId: third.id, causalPredecessors: ['operation-bob-never-received'] });
    assert(thirdGap.status === CausalGapStatus.GAP, '32. an operation naming an unrecorded predecessor is a genuine, detected gap');
    detector.record(worldId, third.id, ['operation-bob-never-received']);
    const outcomeDespiteGap = applicationUseCase.apply({ documentId: worldId, command: third, authorIdentityId: aliceDevice.identity.identityId }, target);
    assert(outcomeDespiteGap === DocumentOperationApplicationOutcome.APPLIED, '33. a GAPPED operation is applied exactly like an ungapped one — detection never blocks application (this milestone\'s central rule)');
    assert(target.commandHistory.getExecutedCommands().length === 3, '34. the gapped operation genuinely landed on the command history, arrival-ordered, same as any other');

    unsubscribeApplication();
    unsubscribePropagation();
    alice.propagation.dispose();
    bob.propagation.dispose();
    console.log('✓ Section H: causal gap detection observes the real propagation chain end to end without altering whether or how operations are applied');
}

console.log('\n0.9.228 — causal gap detection distinguishes an absent predecessor from a genuinely unrelated one, names every specific missing predecessor, resolves on re-query without automatic replay, and never blocks application.');

}

runTests().then(() => {
    console.log('\n✓ All DocumentOperationCausalGapDetector tests passed');
}).catch((error) => {
    console.error('\n✗ DocumentOperationCausalGapDetector tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
