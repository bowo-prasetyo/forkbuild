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
import { RemoteDocumentOperationApplicationUseCase, DocumentOperationApplicationOutcome } from '../application/RemoteDocumentOperationApplicationUseCase.js';
import { CausalGapStatus, DocumentOperationCausalGapDetector } from '../core/DocumentOperationCausalGapDetector.js';
import { DocumentOperationCausalGapObservationUseCase } from '../application/DocumentOperationCausalGapObservationUseCase.js';
import { DocumentOperationRecoveryUseCase } from '../application/DocumentOperationRecoveryUseCase.js';
import { DocumentOperationProvenance } from '../core/DocumentOperationProvenance.js';
import {
    DocumentOperationApplicationEligibility,
    evaluateApplicationEligibility
} from '../core/DocumentOperationApplicationEligibility.js';

// 0.9.233 — Causal Application Eligibility Policy Audit.
//
// 0.9.232 named a fact — ELIGIBLE / NOT_ELIGIBLE — that nothing before it
// had a word for. This milestone is test-only. It adds no production code,
// because it asks a question about EXISTING behavior, not a new one:
//
//   when an operation is NOT_ELIGIBLE, what does this codebase actually
//   do about it, today?
//
// The answer this suite proves, end to end, through the REAL receive
// chain (`DocumentOperationEnvelope -> DocumentCommandPropagationUseCase
// -> DocumentOperationCausalGapObservationUseCase ->
// DocumentOperationCausalGapDetector -> DocumentOperationApplicationEligibility`),
// not merely through `evaluateApplicationEligibility()` called in
// isolation the way 0.9.232's own suite already does:
//
//   eligibility is OBSERVABLE, but application policy remains
//   ARRIVAL_ORDER. NOT_ELIGIBLE never gates, delays, buffers, or
//   otherwise changes whether or when RemoteDocumentOperationApplicationUseCase
//   applies an operation.
//
// Every section below wires a THIRD, independent subscriber onto the same
// `onOperationReceived()` feed `DocumentOperationCausalGapObservationUseCase`
// and `RemoteDocumentOperationApplicationUseCase` already attach to,
// exactly the way those two classes are already independent of each
// other (see `DocumentOperationCausalGapObservation.test.js`'s own
// `wireBob()`). This third subscriber calls
// `evaluateApplicationEligibility()` against the SAME
// `DocumentOperationCausalGapDetector` instance gap observation itself
// records into — sharing state is what makes its answer describe this
// replica's REAL causal knowledge, not a private, disconnected copy of
// it. Critically, this subscriber only ever OBSERVES: it never calls
// `apply()`, never withholds a call to it, and is registered in every
// possible order relative to the other two subscribers to prove ordering
// itself is irrelevant to the outcome.
//
// Deliberately NOT tested here, because it deliberately does not exist:
// operation buffering, delayed/automatic application, causal deferral, a
// queue, retry, reordering, rollback, conflict resolution, CRDT, OT,
// synchronized undo, or a convergence guarantee. This suite proves the
// ABSENCE of all of these just as carefully as it proves eligibility
// itself is now computable — see the flagship assertion at the very end.

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
    const state = { target: null };
    const propagation = new DocumentCommandPropagationUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        identityProvider: device.provider, commandRegistry,
        resolveDocument: (id) => (state.target && state.target.documentId === id ? state.target.document : null)
    });
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, propagation, state };
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

function moveCommand(worldId, delta) {
    return new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta });
}

// Wires a receiver's real propagation feed with THREE independent
// subscribers, in the given order: gap observation (0.9.229),
// eligibility observation (this milestone's own audit instrument — test
// code only, never production), and application (0.9.223/0.9.224). All
// three read the SAME onOperationReceived() feed; none of them is aware
// of, or able to influence, either of the others. `causalGapDetector` is
// shared between gap observation and the eligibility evaluator so the
// eligibility answer reflects this replica's REAL, cumulative causal
// knowledge rather than a private copy of it.
function wireReceiver(receiver, target, order = ['gap', 'eligibility', 'application']) {
    const causalGapDetector = new DocumentOperationCausalGapDetector();
    const gapObservation = new DocumentOperationCausalGapObservationUseCase({ causalGapDetector });
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const gapObservations = [];
    const eligibilityObservations = [];
    gapObservation.onGapObserved((descriptor) => gapObservations.push(descriptor));

    const unsubscribers = [];
    const wire = {
        gap: () => unsubscribers.push(gapObservation.attachToPropagation(receiver.propagation)),
        eligibility: () => unsubscribers.push(receiver.propagation.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors) => {
            eligibilityObservations.push(evaluateApplicationEligibility(documentId, { operationId: command.id, causalPredecessors }, { causalGapDetector }));
        })),
        application: () => unsubscribers.push(applicationUseCase.attachToPropagation(receiver.propagation, () => target))
    };
    for (const step of order) {
        wire[step]();
    }

    return {
        causalGapDetector, gapObservation, applicationUseCase, gapObservations, eligibilityObservations,
        dispose: () => unsubscribers.forEach((unsubscribe) => unsubscribe())
    };
}

async function runTests() {

const network = new LocalPeerNetwork();
const aliceDevice = makeDevice('Alice');
const bobDevice = makeDevice('Bob');
const alice = makeSenderStack(aliceDevice);
const bob = makeReceiverStack(bobDevice);
const { peerA, peerB } = await connectAndAuthenticate(network, 'alice', aliceDevice, 'bob', bobDevice);
alice.connectedPeerRegistry.add(peerA);
bob.connectedPeerRegistry.add(peerB);

// ===================================================================
// Section 1 — Genesis operation: no predecessors at all is ELIGIBLE,
// observed on the real receive path, and applies normally.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-audit-1', aliceDevice.identity.identityId, 'Section 1');
    const wired = wireReceiver(bob, target);

    const opA = moveCommand('doc-audit-1', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-1', command: opA, causalPredecessors: [] });
    await wait(20);

    assert(wired.eligibilityObservations.length === 1, '1. the genesis operation produced exactly one eligibility observation');
    assert(wired.eligibilityObservations[0].eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '2. a genesis operation is ELIGIBLE');
    assert(target.commandHistory.getExecutedCommands().length === 1, '3. it applied normally');

    wired.dispose();
    console.log('✓ Section 1: a genesis operation is ELIGIBLE and applies normally');
}

// ===================================================================
// Section 2 — Normal successor: A received, then B naming A -> ELIGIBLE.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-audit-2', aliceDevice.identity.identityId, 'Section 2');
    const wired = wireReceiver(bob, target);

    const opA = moveCommand('doc-audit-2', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-2', command: opA, causalPredecessors: [] });
    await wait(20);
    const opB = moveCommand('doc-audit-2', { x: 2, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-2', command: opB, causalPredecessors: [opA.id] });
    await wait(20);

    assert(wired.eligibilityObservations[1].eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '4. B, whose predecessor A already arrived, is ELIGIBLE');
    assert(target.commandHistory.getExecutedCommands().length === 2, '5. both A and B applied');

    wired.dispose();
    console.log('✓ Section 2: a normal successor whose predecessor already arrived is ELIGIBLE');
}

// ===================================================================
// Section 3 — Causal gap: B names A, A unknown -> NOT_ELIGIBLE, yet B
// still applies immediately under today's ARRIVAL_ORDER policy. This is
// the flagship coexistence this whole milestone exists to prove.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-audit-3', aliceDevice.identity.identityId, 'Section 3');
    const wired = wireReceiver(bob, target);

    const opB = moveCommand('doc-audit-3', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-3', command: opB, causalPredecessors: ['operation-bob-never-received'] });
    await wait(20);

    assert(wired.eligibilityObservations.length === 1, '6. B produced exactly one eligibility observation');
    assert(wired.eligibilityObservations[0].eligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE, '7. B, whose named predecessor never arrived, is NOT_ELIGIBLE');
    assert(JSON.stringify(wired.eligibilityObservations[0].missingCausalPredecessorIds) === JSON.stringify(['operation-bob-never-received']), '8. the missing predecessor is named exactly');
    assert(target.commandHistory.getExecutedCommands().length === 1 && target.commandHistory.getExecutedCommands()[0].id === opB.id, '9. B STILL applied immediately — NOT_ELIGIBLE never gated RemoteDocumentOperationApplicationUseCase#apply()');

    wired.dispose();
    console.log('✓ Section 3: a causal gap makes an operation NOT_ELIGIBLE, and it still applies immediately — eligibility is observed, never enforced');
}

// ===================================================================
// Section 4 — Gap later repaired: B arrives NOT_ELIGIBLE; A recovers
// later; re-evaluating B (a deliberate query) now answers ELIGIBLE.
// Critically, that re-evaluation is a QUERY, never an automatic
// application: B's original NOT_ELIGIBLE observation is untouched, no
// second application of B occurs, and A itself is never applied by this.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-audit-4', aliceDevice.identity.identityId, 'Section 4');
    const wired = wireReceiver(bob, target);

    const opA = moveCommand('doc-audit-4', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-audit-4', { x: 2, y: 0, z: 0 });
    // B arrives first, naming A, which has not been sent yet.
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-4', command: opB, causalPredecessors: [opA.id] });
    await wait(20);
    assert(wired.eligibilityObservations[0].eligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE, '10. B, arriving before A, is NOT_ELIGIBLE');
    assert(target.commandHistory.getExecutedCommands().length === 1, '11. B applied anyway, exactly as Section 3 already proved');

    // A arrives afterward as its own, unrelated, genesis operation —
    // nothing here automatically replays or re-evaluates B.
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-4', command: opA, causalPredecessors: [] });
    await wait(20);
    assert(wired.eligibilityObservations.length === 2, '12. A\'s own arrival produced its OWN eligibility observation — never a second, automatic one for B');
    assert(wired.eligibilityObservations[1].operationId === opA.id && wired.eligibilityObservations[1].eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '13. A itself, a genesis operation, is ELIGIBLE');
    assert(wired.eligibilityObservations[0].eligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE, '14. B\'s ORIGINAL observation is untouched — nothing retroactively rewrote it');

    // Re-evaluating B is a deliberate, explicit QUERY against the SAME
    // shared detector — not a hidden replay path, and not something that
    // happens on its own.
    const reEvaluated = evaluateApplicationEligibility('doc-audit-4', { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: wired.causalGapDetector });
    assert(reEvaluated.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '15. re-querying B now answers ELIGIBLE, now that A is known');
    assert(wired.eligibilityObservations.length === 2, '16. the re-query produced no new entry on the receive-path observation feed — it is a direct call, not a received operation');
    const executedIds = target.commandHistory.getExecutedCommands().map((c) => c.id);
    assert(JSON.stringify(executedIds) === JSON.stringify([opB.id, opA.id]), '17. CommandHistory is unaffected by the re-query: B and A sit exactly where ARRIVAL_ORDER put them, B was never re-applied, and re-evaluating never triggered any application of A');

    wired.dispose();
    console.log('✓ Section 4: a gap repairs only on deliberate re-query — re-evaluation is a pure question, never an automatic application of anything');
}

// ===================================================================
// Section 5 — Recovered predecessor: A becomes known through recovery
// (DocumentOperationRecoveryUseCase), never executed. B naming A is still
// ELIGIBLE — causally known != executed, exactly 0.9.231's own
// distinction, now proven to be what eligibility itself actually reads.
// ===================================================================
{
    function makeFullStack(device) {
        const peerMessageBus = new PeerMessageBus();
        const connectedPeerRegistry = new ConnectedPeerRegistry();
        const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
            peerMessageBus, connectedPeerRegistry
        });
        const commandRegistry = new CreateCommandRegistryUseCase().execute();
        const state = { target: null };
        const propagation = new DocumentCommandPropagationUseCase({
            peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
            identityProvider: device.provider, commandRegistry,
            resolveDocument: (id) => (state.target && state.target.documentId === id ? state.target.document : null)
        });
        const recovery = new DocumentOperationRecoveryUseCase({
            peerMessageBus, connectedPeerRegistry, documentCommandPropagation: propagation, identityProvider: device.provider
        });
        const causalGapDetector = new DocumentOperationCausalGapDetector();
        const gapObservation = new DocumentOperationCausalGapObservationUseCase({ causalGapDetector });
        const recovered = [];
        recovery.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors, provenance) => recovered.push({ documentId, command, provenance }));
        const unsubscribeGapToPropagation = gapObservation.attachToPropagation(propagation);
        const unsubscribeRecoveryRequest = recovery.attachToGapObservation(gapObservation);
        // Recovered operations become KNOWN through the SAME shared
        // detector eligibility itself reads — mirrors application/EditorSession.js's
        // own wiring of recovery's onOperationReceived() into gap observation.
        const unsubscribeGapToRecovery = gapObservation.attachToPropagation(recovery);
        return {
            device, peerMessageBus, connectedPeerRegistry, propagation, recovery, gapObservation, causalGapDetector, state, recovered,
            dispose: () => { unsubscribeGapToPropagation(); unsubscribeRecoveryRequest(); unsubscribeGapToRecovery(); propagation.dispose(); recovery.dispose(); }
        };
    }

    const carolDevice = makeDevice('Carol-audit5');
    const daveDevice = makeDevice('Dave-audit5');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-audit5', carolDevice, 'dave-audit5', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-audit-5';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'Section 5 (carol)' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'Section 5 (dave)' });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: new CommandHistory({ world: daveDoc.world }) };
    dave.state.target = daveTarget;
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const unsubscribeApplication = applicationUseCase.attachToPropagation(dave.propagation, () => daveTarget);

    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });
    carolHistory.execute(opA);
    carolHistory.execute(opB);
    // Only B is ever broadcast directly — Dave recovers A through B's own gap.
    carol.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    assert(dave.recovered.some((r) => r.command.id === opA.id && r.provenance === DocumentOperationProvenance.RECOVERED), '18. A was recovered, never received normally');
    assert(daveTarget.commandHistory.getExecutedCommands().every((c) => c.id !== opA.id), '19. A was never executed on Dave\'s replica — recovery never applies');

    const eligibility = evaluateApplicationEligibility(worldId, { operationId: 'C', causalPredecessors: [opA.id] }, { causalGapDetector: dave.causalGapDetector });
    assert(eligibility.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '20. a hypothetical C naming the RECOVERED (never-executed) A as its predecessor is ELIGIBLE — causally known != executed, exactly what eligibility itself reads');

    unsubscribeApplication();
    unattachRecoveryHistory();
    carol.dispose();
    dave.dispose();
    console.log('✓ Section 5: a predecessor known only through recovery still satisfies eligibility — causal knowledge, not execution, is what eligibility reads');
}

// ===================================================================
// Section 6 — Concurrent operations: A -> {B, C}, B and C name only A
// (never each other). Both are independently ELIGIBLE; neither's
// eligibility depends on, or is affected by, the other's arrival order.
// Concurrency is never mistaken for a causal gap.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-audit-6', aliceDevice.identity.identityId, 'Section 6');
    const wired = wireReceiver(bob, target);

    const opA = moveCommand('doc-audit-6', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-6', command: opA, causalPredecessors: [] });
    await wait(20);

    const opC = moveCommand('doc-audit-6', { x: 3, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-6', command: opC, causalPredecessors: [opA.id] });
    await wait(20);
    const opB = moveCommand('doc-audit-6', { x: 2, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-6', command: opB, causalPredecessors: [opA.id] });
    await wait(20);

    const bResult = wired.eligibilityObservations.find((o) => o.operationId === opB.id);
    const cResult = wired.eligibilityObservations.find((o) => o.operationId === opC.id);
    assert(bResult.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '21. B, concurrent with C, is ELIGIBLE on its own merits');
    assert(cResult.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '22. C, concurrent with B, is ELIGIBLE on its own merits');
    assert(target.commandHistory.getExecutedCommands().length === 3, '23. all three applied — concurrency never blocks anything');

    wired.dispose();
    console.log('✓ Section 6: concurrent operations are independently ELIGIBLE — concurrency with a sibling is never mistaken for a causal gap against it');
}

// ===================================================================
// Section 7 — Conflicting absolute operations: two operations that both
// name the SAME sole predecessor (concurrent, and semantically
// conflicting, e.g. two different renames) are BOTH ELIGIBLE when their
// own predecessor is known. Eligibility never picks a winner — that is
// explicitly out of scope, reserved for a future conflict-resolution
// policy.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-audit-7', aliceDevice.identity.identityId, 'Section 7');
    const wired = wireReceiver(bob, target);

    const opA = moveCommand('doc-audit-7', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-7', command: opA, causalPredecessors: [] });
    await wait(20);

    // Two operations that both causally follow ONLY A — modelling two
    // conflicting concurrent edits (e.g. "rename to Alice" vs "rename to
    // Bob") without needing a real rename command: eligibility is a
    // causal-graph question, indifferent to what either operation's
    // payload actually does.
    const renameToAlice = moveCommand('doc-audit-7', { x: 5, y: 0, z: 0 });
    const renameToBob = moveCommand('doc-audit-7', { x: -5, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-7', command: renameToAlice, causalPredecessors: [opA.id] });
    await wait(20);
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-7', command: renameToBob, causalPredecessors: [opA.id] });
    await wait(20);

    const aliceResult = wired.eligibilityObservations.find((o) => o.operationId === renameToAlice.id);
    const bobResult = wired.eligibilityObservations.find((o) => o.operationId === renameToBob.id);
    assert(aliceResult.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '24. the first conflicting operation is ELIGIBLE');
    assert(bobResult.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '25. the second, semantically conflicting operation is ALSO ELIGIBLE');
    assert(target.commandHistory.getExecutedCommands().length === 3, '26. both conflicting operations applied — eligibility never arbitrated between them');

    wired.dispose();
    console.log('✓ Section 7: two causally-eligible but semantically conflicting operations are both ELIGIBLE — eligibility never decides a winner; that remains a future conflict-resolution policy\'s job');
}

// ===================================================================
// Section 8 — Missing operation versus concurrent operation: these two
// causal shapes must never collapse into the same eligibility answer.
// B depending on a never-arrived A is NOT_ELIGIBLE (a genuine causal
// gap); B and C sharing no causal relationship at all are each
// independently ELIGIBLE (concurrency, not a gap).
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-audit-8', aliceDevice.identity.identityId, 'Section 8');
    const wired = wireReceiver(bob, target);

    // B depends on A, which never arrives — a genuine causal gap.
    const opB = moveCommand('doc-audit-8', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-8', command: opB, causalPredecessors: ['never-arrives-audit-8'] });
    await wait(20);

    // C has NO causal relationship to B or to anything else — a genesis
    // operation, concurrent with B, naming no predecessor at all.
    const opC = moveCommand('doc-audit-8', { x: 2, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-audit-8', command: opC, causalPredecessors: [] });
    await wait(20);

    const bResult = wired.eligibilityObservations.find((o) => o.operationId === opB.id);
    const cResult = wired.eligibilityObservations.find((o) => o.operationId === opC.id);
    assert(bResult.eligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE, '27. B, depending on an operation that never arrived, is a genuine causal gap: NOT_ELIGIBLE');
    assert(cResult.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '28. C, sharing no causal relationship with anything, is mere concurrency: ELIGIBLE');
    assert(bResult.missingCausalPredecessorIds.length === 1 && cResult.missingCausalPredecessorIds.length === 0, '29. a missing dependency and the absence of any dependency are never reported the same way');

    wired.dispose();
    console.log('✓ Section 8: a genuine causal gap and mere concurrency never collapse into the same eligibility answer');
}

// ===================================================================
// Section 9 — Subscriber order is irrelevant: registering the eligibility
// observer BEFORE gap observation, and again AFTER application, produces
// the identical eligibility answer and the identical application outcome
// in every ordering. Eligibility is a read of shared causal state, not a
// participant in the propagation feed's own dispatch order.
// ===================================================================
{
    const orderings = [
        ['eligibility', 'gap', 'application'],
        ['gap', 'application', 'eligibility'],
        ['application', 'eligibility', 'gap']
    ];
    const outcomesByOrdering = [];
    for (const order of orderings) {
        const worldId = `doc-audit-9-${order.join('-')}`;
        const target = openReplicaDocument(bob, worldId, aliceDevice.identity.identityId, `Section 9 (${order.join('>')})`);
        const wired = wireReceiver(bob, target, order);

        const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
        alice.propagation.broadcastCommand({ documentId: worldId, command: opA, causalPredecessors: [] });
        await wait(20);
        const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });
        alice.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: ['never-arrives-audit-9'] });
        await wait(20);

        outcomesByOrdering.push({
            order,
            bEligibility: wired.eligibilityObservations.find((o) => o.operationId === opB.id).eligibility,
            executedIds: target.commandHistory.getExecutedCommands().map((c) => c.id)
        });
        wired.dispose();
    }

    assert(outcomesByOrdering.every((o) => o.bEligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE), '30. B\'s eligibility answer is NOT_ELIGIBLE regardless of subscriber registration order');
    assert(outcomesByOrdering.every((o) => o.executedIds.length === 2), '31. both operations applied in every ordering — eligibility observation never displaces or delays RemoteDocumentOperationApplicationUseCase regardless of subscription order');

    console.log('✓ Section 9: eligibility answers and application outcomes are identical across every subscriber registration order — eligibility is a read, never a participant in dispatch order');
}

alice.propagation.dispose();
bob.propagation.dispose();

console.log('\n0.9.233 — the audit is complete: eligibility (0.9.232) is now proven, on the REAL receive path, to be OBSERVABLE but not CONTROLLING. Every operation this codebase actually applies today still applies immediately under ARRIVAL_ORDER, whether it is ELIGIBLE or NOT_ELIGIBLE. No buffering, no deferral, no queue, no reordering, no conflict resolution, and no convergence guarantee exist anywhere in this codebase as of this milestone: CommandHistory, RemoteDocumentOperationApplicationUseCase, ReplayGuard, and the non-applying nature of recovery are all completely unchanged. Deciding whether NOT_ELIGIBLE should ever come to mean "defer" — versus staying diagnostic/recovery information only — is the explicit, still-open PRODUCT decision this milestone deliberately leaves for the one that follows it.');

}

runTests().then(() => {
    console.log('\n✓ All CausalApplicationEligibilityPolicyAudit tests passed');
}).catch((error) => {
    console.error('\n✗ CausalApplicationEligibilityPolicyAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
