import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Group } from '../core/Group.js';
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
import { RenameGroupCommand } from '../application/commands/RenameGroupCommand.js';
import {
    DocumentCommandPropagationUseCase,
    DocumentOperationRejectionReason
} from '../application/DocumentCommandPropagationUseCase.js';
import { RemoteDocumentOperationApplicationUseCase } from '../application/RemoteDocumentOperationApplicationUseCase.js';
import {
    DOCUMENT_COLLABORATION_CONSISTENCY_POLICY,
    DeliveryOrderGuarantee,
    RemoteApplicationTiming,
    HistoryOrderingBasis,
    ConcurrentConflictResolution,
    MissingOperationDetection,
    DuplicateOperationSuppression,
    LocalUndoScope,
    LocalUndoPropagation,
    DocumentIsolationGuarantee,
    ReplicaConvergenceGuarantee
} from '../core/DocumentCollaborationConsistencyPolicy.js';
import {
    DocumentOperationDeferralUseCase,
    DocumentOperationDeferralOutcome
} from '../application/DocumentOperationDeferralUseCase.js';
import { DocumentOperationCausalGapDetector } from '../core/DocumentOperationCausalGapDetector.js';

// 0.9.226 — Document Collaboration Consistency Policy Boundary.
//
// This file has one job: prove that `core/DocumentCollaborationConsistencyPolicy.js`
// describes the REAL, currently-running behavior of the 0.9.222-0.9.225
// chain, never an aspiration. It is deliberately much smaller than
// `tests/ConcurrentDocumentOperationBehaviorAudit.test.js` (0.9.225) — that
// file is the exhaustive audit; this file exercises only enough of the
// SAME real, unmodified chain (`broadcastCommand()`/`onOperationReceived()`/
// `apply()`/`attachToPropagation()`, the real ReplayGuard, the real
// CommandHistory) to demonstrate each policy field once, then points back
// at 0.9.225's own section letters for the full evidence. No production
// code changes as part of this milestone; this file and
// core/DocumentCollaborationConsistencyPolicy.js are the entire diff.
//
// Topology mirrors 0.9.225's own exactly, for the same reason: one owner
// identity (Alice) with two authorized devices (Laptop, Phone), each
// wired to its own independent receiving replica (Bob, Charlie) so the
// same operation pair can be delivered in two different orders without
// one channel's delivery pre-empting the other's.

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
    const received = [];
    const rejected = [];
    const state = { target: null };
    const propagation = new DocumentCommandPropagationUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        identityProvider: device.provider, commandRegistry,
        resolveDocument: (id) => (state.target && state.target.documentId === id ? state.target.document : null)
    });
    propagation.onOperationReceived((documentId, command, authorIdentityId) => received.push({ documentId, command, authorIdentityId }));
    propagation.onOperationRejected((reason, envelope) => rejected.push({ reason, envelope }));
    const application = new RemoteDocumentOperationApplicationUseCase();
    application.attachToPropagation(propagation, () => (state.target
        ? { documentId: state.target.documentId, commandHistory: state.target.commandHistory }
        : null));
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, propagation, application, received, rejected, state };
}

function buildBaseDocument({ worldId, authorIdentityId, title }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: 'building-x' });
    building.addBrick(new Brick({ id: 'brick-a', definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    building.addBrick(new Brick({ id: 'brick-b', definitionId: 'core:cube', position: new Position(10, 0.5, 0) }));
    world.addBuilding(building);
    world.addGroup(new Group({ id: 'group-1', name: 'Original', brickIds: ['brick-a', 'brick-b'] }));
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'owner', authorIdentityId }) });
}

function openReplicaDocument(replica, worldId, authorIdentityId, title) {
    const document = buildBaseDocument({ worldId, authorIdentityId, title });
    const target = { documentId: worldId, document, commandHistory: new CommandHistory({ world: document.world }) };
    replica.state.target = target;
    return target;
}

function brickX(document, brickId = 'brick-a') {
    return document.world.getBuilding('building-x').findBrick(brickId).position.x;
}

function groupName(document) {
    return document.world.getGroup('group-1').name;
}

function commandIds(commandHistory) {
    return commandHistory.getExecutedCommands().map((c) => c.id);
}

async function runTests() {

// ===================================================================
// Section 1 — Policy shape: a closed vocabulary, frozen, single source
// of truth. Pure — no harness, no peers, no documents.
// ===================================================================
{
    assert(Object.isFrozen(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY), '1. the policy object itself is frozen');
    for (const key of Object.keys(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY)) {
        assert(Object.isFrozen(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY[key]), `2. policy.${key} is frozen`);
    }
    for (const enumObject of [
        DeliveryOrderGuarantee, RemoteApplicationTiming, HistoryOrderingBasis,
        ConcurrentConflictResolution, MissingOperationDetection, DuplicateOperationSuppression,
        LocalUndoScope, LocalUndoPropagation, DocumentIsolationGuarantee, ReplicaConvergenceGuarantee
    ]) {
        assert(Object.isFrozen(enumObject), '3. every exported vocabulary enum is frozen (closed, not an open string)');
    }
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.delivery.order === DeliveryOrderGuarantee.NOT_GUARANTEED,
        '4. delivery.order names NOT_GUARANTEED — no logicalClock exists anywhere in core/DocumentOperationEnvelope.js');
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.convergence.guaranteed === ReplicaConvergenceGuarantee.NOT_GUARANTEED,
        '5. convergence.guaranteed names NOT_GUARANTEED — the composite finding of 0.9.225 Sections D1 and F');
    console.log('✓ Section 1: the policy is a closed, frozen vocabulary, not a mutable config object');
}

const network = new LocalPeerNetwork();
const aliceLaptop = makeDevice('Alice-Laptop');
const alicePhone = makeDevice('Alice-Phone');
const bobDevice = makeDevice('Bob');
const charlieDevice = makeDevice('Charlie');

const laptopStack = makeSenderStack(aliceLaptop);
const phoneStack = makeSenderStack(alicePhone);
const bob = makeReceiverStack(bobDevice);
const charlie = makeReceiverStack(charlieDevice);

const { peerA: laptopToBob, peerB: bobFromLaptop } = await connectAndAuthenticate(network, 'alice-laptop', aliceLaptop, 'bob', bobDevice);
laptopStack.connectedPeerRegistry.add(laptopToBob);
bob.connectedPeerRegistry.add(bobFromLaptop);

const { peerA: phoneToCharlie, peerB: charlieFromPhone } = await connectAndAuthenticate(network, 'alice-phone', alicePhone, 'charlie', charlieDevice);
phoneStack.connectedPeerRegistry.add(phoneToCharlie);
charlie.connectedPeerRegistry.add(charlieFromPhone);

const grant = aliceLaptop.provider.authorizeDevice(
    aliceLaptop.identity.identityId, alicePhone.identity.identityId, alicePhone.identity.publicKey,
    { deviceLabel: 'Alice-Phone' }
);
phoneStack.deviceAuth.broadcastAuthorization(grant);
await wait(20);

let docCounter = 0;
function nextWorldId(label) { docCounter += 1; return `doc-${label}-${docCounter}`; }

// ===================================================================
// Section 2 — application.remote is CAUSAL_READINESS (0.9.238, updated
// from 0.9.226's own IMMEDIATE): a READY operation (no causal
// predecessors, or predecessors already executed) still applies
// synchronously — the same fact 0.9.226 named IMMEDIATE remains true of
// RemoteDocumentOperationApplicationUseCase#apply() itself (see
// RemoteApplicationTiming.IMMEDIATE's own, now-superseded, comment). But
// a NOT_READY operation — one naming a causal predecessor this replica
// has not yet recorded as executed — is retained instead of applied, and
// released automatically, through the SAME apply() chokepoint, only once
// that predecessor actually executes. Proven directly against
// DocumentOperationDeferralUseCase, 0.9.237's own mechanism for this
// guarantee, with no transport and no `await` at all: the release itself
// is a synchronous CommandHistory#execute() -> COMMAND_EXECUTED cascade.
// ===================================================================
{
    const worldId = nextWorldId('causal-readiness');
    const document = buildBaseDocument({ worldId, authorIdentityId: aliceLaptop.identity.identityId, title: 'Section 2' });
    const commandHistory = new CommandHistory({ world: document.world });
    const causalGapDetector = new DocumentOperationCausalGapDetector();
    const deferral = new DocumentOperationDeferralUseCase({ causalGapDetector });
    deferral.attachCommandHistory({ documentId: worldId, commandHistory });
    const target = { documentId: worldId, commandHistory };
    // Mirrors application/EditorSession.js's own wiring: a
    // DocumentOperationCausalGapObservationUseCase always records an
    // arriving operation's causal identity BEFORE readiness is evaluated
    // for anything naming it as a predecessor (see
    // tests/DocumentOperationDeferralUseCase.test.js's own
    // `receiveOperation()` helper for the identical ordering).
    function receive(command, causalPredecessors) {
        causalGapDetector.record(worldId, command.id, causalPredecessors);
        return deferral.receive({ documentId: worldId, command, authorIdentityId: 'irrelevant', causalPredecessors }, target);
    }

    const opA = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 9, y: 0, z: 0 } });
    const outcomeA = receive(opA, []);
    assert(outcomeA === DocumentOperationDeferralOutcome.APPLIED, '6. a READY (genesis) operation still applies synchronously — apply() reports APPLIED');
    assert(brickX(document) === 9, '7. the effect is visible immediately on return — no microtask, no queue, no deferred window, for a READY operation');

    const opB = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 1, y: 0, z: 0 } });
    const opPredecessor = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 0, y: 0, z: 0 } });
    const outcomeB = receive(opB, [opPredecessor.id]);
    assert(outcomeB === DocumentOperationDeferralOutcome.DEFERRED, '8. a NOT_READY operation (its own named predecessor not yet executed) is retained, not applied');
    assert(brickX(document) === 9, '9. Bs effect is not visible — deferral never mutates document state for a retained operation');
    assert(deferral.getDeferredOperationIds(worldId).includes(opB.id), '10. B sits in the deferral boundarys own retained set');

    receive(opPredecessor, []);
    assert(brickX(document) === 10, '11. once the named predecessor actually executes, B is automatically released through the SAME apply() chokepoint');
    assert(deferral.getDeferredOperationIds(worldId).length === 0, '12. nothing left retained once B is released');

    assert(RemoteApplicationTiming.CAUSAL_READINESS === DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.application.remote,
        '13. matches the declared policy: application.remote === CAUSAL_READINESS');
    console.log('✓ Section 2: application.remote = CAUSAL_READINESS — a READY operation still applies synchronously; a NOT_READY operation is retained and released only once its causal predecessors actually execute (see 0.9.237 for the full evidence, and 0.9.238\'s own audit for the stronger regression form of this same proof)');
}

// ===================================================================
// Section 3 — history.orderingBasis is ARRIVAL_ORDER, and
// conflict.nonCommutingOperations is UNDEFINED: the same two
// ABSOLUTE-SET operations, delivered in opposite order to two
// independent replicas, produce two permanently different final
// values. Mirrors 0.9.225 Section D1.
// ===================================================================
{
    const worldIdBob = nextWorldId('conflict-bob');
    const worldIdCharlie = nextWorldId('conflict-charlie');
    openReplicaDocument(bob, worldIdBob, aliceLaptop.identity.identityId, 'Section 3 (Bob)');
    openReplicaDocument(charlie, worldIdCharlie, aliceLaptop.identity.identityId, 'Section 3 (Charlie)');

    const renameA_bob = new RenameGroupCommand({ worldId: worldIdBob, groupId: 'group-1', name: 'Renamed-By-Laptop' });
    const renameB_bob = new RenameGroupCommand({ worldId: worldIdBob, groupId: 'group-1', name: 'Renamed-By-Phone' });
    const renameA_charlie = new RenameGroupCommand({ worldId: worldIdCharlie, groupId: 'group-1', name: 'Renamed-By-Laptop' });
    const renameB_charlie = new RenameGroupCommand({ worldId: worldIdCharlie, groupId: 'group-1', name: 'Renamed-By-Phone' });

    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: renameA_bob });
    await wait(20);
    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: renameB_bob });
    await wait(20);

    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: renameB_charlie });
    await wait(20);
    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: renameA_charlie });
    await wait(20);

    assert(JSON.stringify(commandIds(bob.state.target.commandHistory)) === JSON.stringify([renameA_bob.id, renameB_bob.id]),
        '9. Bob: CommandHistory order tracks ARRIVAL order (Laptop, then Phone) — history.orderingBasis = ARRIVAL_ORDER');
    assert(JSON.stringify(commandIds(charlie.state.target.commandHistory)) === JSON.stringify([renameB_charlie.id, renameA_charlie.id]),
        '10. Charlie: the SAME two operations, opposite arrival order, opposite history order');
    assert(groupName(bob.state.target.document) !== groupName(charlie.state.target.document),
        '11. Bob and Charlie hold permanently different names for the identical two operations — conflict.nonCommutingOperations = UNDEFINED, no detection, no reconciliation');
    assert(HistoryOrderingBasis.ARRIVAL_ORDER === DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.history.orderingBasis
        && ConcurrentConflictResolution.UNDEFINED === DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.conflict.nonCommutingOperations,
        '12. matches the declared policy');
    console.log('✓ Section 3: history.orderingBasis = ARRIVAL_ORDER; conflict.nonCommutingOperations = UNDEFINED (see 0.9.225 Section D1 for the full evidence)');
}

// ===================================================================
// Section 4 — deliberate contrast, not a new policy field: a
// RELATIVE-DELTA command on the very same shared brick still commutes.
// A shared target is not, by itself, "conflicting" — this codebase's
// own D1/D2 distinction (0.9.225) is exactly why
// conflict.nonCommutingOperations describes an ABSENCE OF A RULE, never
// a claim that every concurrent pair diverges.
// ===================================================================
{
    const worldIdBob = nextWorldId('commute-bob');
    const worldIdCharlie = nextWorldId('commute-charlie');
    openReplicaDocument(bob, worldIdBob, aliceLaptop.identity.identityId, 'Section 4 (Bob)');
    openReplicaDocument(charlie, worldIdCharlie, aliceLaptop.identity.identityId, 'Section 4 (Charlie)');

    const moveA_bob = new MoveBrickCommand({ worldId: worldIdBob, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 3, y: 0, z: 0 } });
    const moveB_bob = new MoveBrickCommand({ worldId: worldIdBob, buildingId: 'building-x', brickId: 'brick-a', delta: { x: -1, y: 0, z: 0 } });
    const moveA_charlie = new MoveBrickCommand({ worldId: worldIdCharlie, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 3, y: 0, z: 0 } });
    const moveB_charlie = new MoveBrickCommand({ worldId: worldIdCharlie, buildingId: 'building-x', brickId: 'brick-a', delta: { x: -1, y: 0, z: 0 } });

    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: moveA_bob });
    await wait(20);
    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: moveB_bob });
    await wait(20);

    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: moveB_charlie });
    await wait(20);
    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: moveA_charlie });
    await wait(20);

    assert(brickX(bob.state.target.document) === 2 && brickX(charlie.state.target.document) === 2,
        '13. same target, opposite delivery order, IDENTICAL value — commuting semantics need no conflict rule to converge');
    console.log('✓ Section 4: contrast only — a shared target is not automatically a conflict; whether Section 3\'s UNDEFINED result actually bites depends on the command\'s own semantics');
}

// ===================================================================
// Section 5 — missingOperations.detection is NONE: two replicas that
// never receive the same SET of operations diverge permanently, with
// no error, no gap counter, nothing. Mirrors 0.9.225 Section F.
// ===================================================================
{
    const worldIdBob = nextWorldId('missing-bob');
    const worldIdCharlie = nextWorldId('missing-charlie');
    openReplicaDocument(bob, worldIdBob, aliceLaptop.identity.identityId, 'Section 5 (Bob)');
    openReplicaDocument(charlie, worldIdCharlie, aliceLaptop.identity.identityId, 'Section 5 (Charlie)');

    const o1_bob = new MoveBrickCommand({ worldId: worldIdBob, buildingId: 'building-x', brickId: 'brick-b', delta: { x: 2, y: 0, z: 0 } });
    const o1_charlie = new MoveBrickCommand({ worldId: worldIdCharlie, buildingId: 'building-x', brickId: 'brick-b', delta: { x: 2, y: 0, z: 0 } });
    const onlyCharlie = new MoveBrickCommand({ worldId: worldIdCharlie, buildingId: 'building-x', brickId: 'brick-b', delta: { x: 9, y: 0, z: 0 } });

    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: o1_bob });
    await wait(20);

    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: o1_charlie });
    await wait(20);
    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: onlyCharlie });
    await wait(20);

    assert(brickX(bob.state.target.document, 'brick-b') === 12 && brickX(charlie.state.target.document, 'brick-b') === 21,
        '14. Bob (one operation) and Charlie (two operations) diverge — Bob was simply never told about the operation Charlie received');
    assert(bob.state.target.commandHistory.getExecutedCommands().length === 1,
        '15. Bob has no counter, no flag, no event indicating a peer received something it did not — missingOperations.detection = NONE');
    assert(MissingOperationDetection.NONE === DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.missingOperations.detection,
        '16. matches the declared policy');
    console.log('✓ Section 5: missingOperations.detection = NONE (see 0.9.225 Section F for the full evidence)');
}

// ===================================================================
// Section 6 — duplicateOperations.suppression is GUARANTEED: the
// EXISTING ReplayGuard already makes a retransmitted operationId a
// no-op. Deliberately contrasted with Section 5: "already seen this
// exact operation" and "missing an operation someone else has" are
// different questions, answered by different (in one case, no)
// mechanisms. Mirrors 0.9.225 Section J.
// ===================================================================
{
    const worldId = nextWorldId('duplicate');
    const target = openReplicaDocument(bob, worldId, aliceLaptop.identity.identityId, 'Section 6');
    const o1 = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 4, y: 0, z: 0 } });

    laptopStack.propagation.broadcastCommand({ documentId: worldId, command: o1 });
    await wait(20);
    laptopStack.propagation.broadcastCommand({ documentId: worldId, command: o1 });
    await wait(20);

    assert(brickX(target.document) === 4 && target.commandHistory.getExecutedCommands().length === 1,
        '17. the retransmitted operation was applied exactly once');
    assert(bob.rejected.some((r) => r.reason === DocumentOperationRejectionReason.DUPLICATE),
        '18. explicitly rejected DUPLICATE, not merely silently ignored — duplicateOperations.suppression = GUARANTEED');
    assert(DuplicateOperationSuppression.GUARANTEED === DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.duplicateOperations.suppression,
        '19. matches the declared policy');
    console.log('✓ Section 6: duplicateOperations.suppression = GUARANTEED — the existing, unmodified ReplayGuard is sufficient (see 0.9.225 Section J)');
}

// ===================================================================
// Section 7 — undo.scope is LOCAL_ONLY and undo.propagation is NEVER:
// undoing an applied remote operation reverts only the undoing
// replica's own state; a peer who received the identical operation is
// completely unaffected. Mirrors 0.9.225 Section H.
// ===================================================================
{
    const worldIdBob = nextWorldId('undo-bob');
    const worldIdCharlie = nextWorldId('undo-charlie');
    const bobTarget = openReplicaDocument(bob, worldIdBob, aliceLaptop.identity.identityId, 'Section 7 (Bob)');
    const charlieTarget = openReplicaDocument(charlie, worldIdCharlie, aliceLaptop.identity.identityId, 'Section 7 (Charlie)');

    const shared_bob = new MoveBrickCommand({ worldId: worldIdBob, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 6, y: 0, z: 0 } });
    const shared_charlie = new MoveBrickCommand({ worldId: worldIdCharlie, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 6, y: 0, z: 0 } });
    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: shared_bob });
    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: shared_charlie });
    await wait(20);

    assert(brickX(bobTarget.document) === 6 && brickX(charlieTarget.document) === 6, '20. both replicas applied the shared operation identically');

    bobTarget.commandHistory.undo();
    assert(brickX(bobTarget.document) === 0, '21. Bob: undo reverts HIS OWN state');
    assert(brickX(charlieTarget.document) === 6,
        '22. Charlie: entirely unaffected by Bob\'s local undo — undo.scope = LOCAL_ONLY, undo.propagation = NEVER');
    assert(LocalUndoScope.LOCAL_ONLY === DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.undo.scope
        && LocalUndoPropagation.NEVER === DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.undo.propagation,
        '23. matches the declared policy');
    console.log('✓ Section 7: undo.scope = LOCAL_ONLY; undo.propagation = NEVER (see 0.9.225 Sections G/H for the full evidence)');
}

// ===================================================================
// Section 8 — isolation.acrossDocuments is GUARANTEED: an operation
// addressed at a document the receiver is not currently looking at is
// refused, never silently misapplied and never queued. 0.9.225 Section
// I already proved this under genuine interleaving; this is the
// minimal single-switch form of the same guarantee.
// ===================================================================
{
    const worldX = nextWorldId('isolation-x');
    const worldY = nextWorldId('isolation-y');
    const targetX = openReplicaDocument(bob, worldX, aliceLaptop.identity.identityId, 'Section 8 (X)');

    const forY = new MoveBrickCommand({ worldId: worldY, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 100, y: 0, z: 0 } });
    laptopStack.propagation.broadcastCommand({ documentId: worldY, command: forY });
    await wait(20);

    assert(targetX.commandHistory.getExecutedCommands().length === 0,
        '24. Bob (looking at X): an operation for Y touched nothing');
    assert(bob.rejected.some((r) => r.reason === DocumentOperationRejectionReason.UNKNOWN_DOCUMENT),
        '25. refused UNKNOWN_DOCUMENT, not silently dropped and not misapplied to X');
    assert(DocumentIsolationGuarantee.GUARANTEED === DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.isolation.acrossDocuments,
        '26. matches the declared policy');
    console.log('✓ Section 8: isolation.acrossDocuments = GUARANTEED (see 0.9.225 Section I for the interleaved, stronger form of the same evidence)');
}

laptopStack.propagation.dispose();
phoneStack.propagation.dispose();
bob.propagation.dispose();
charlie.propagation.dispose();

console.log('\n0.9.226 — every DOCUMENT_COLLABORATION_CONSISTENCY_POLICY field checked against the real, unmodified 0.9.222-0.9.225 chain.');

}

runTests().then(() => {
    console.log('\n✓ All DocumentCollaborationConsistencyPolicy tests passed');
}).catch((error) => {
    console.error('\n✗ DocumentCollaborationConsistencyPolicy tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
