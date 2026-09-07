import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Group } from '../core/Group.js';
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
import { DocumentCommandPropagationUseCase } from '../application/DocumentCommandPropagationUseCase.js';
import { DocumentOperationCausalGapDetector } from '../core/DocumentOperationCausalGapDetector.js';
import { DocumentOperationCausalGapObservationUseCase } from '../application/DocumentOperationCausalGapObservationUseCase.js';
import { DocumentOperationRecoveryUseCase } from '../application/DocumentOperationRecoveryUseCase.js';
import { RecoveredOperationReplayUseCase } from '../application/RecoveredOperationReplayUseCase.js';
import {
    DocumentOperationDeferralUseCase,
    DocumentOperationDeferralOutcome
} from '../application/DocumentOperationDeferralUseCase.js';
import {
    DOCUMENT_COLLABORATION_CONSISTENCY_POLICY,
    RemoteApplicationTiming,
    HistoryOrderingBasis,
    ConcurrentConflictResolution,
    ReplicaConvergenceGuarantee,
    LocalUndoScope,
    LocalUndoPropagation
} from '../core/DocumentCollaborationConsistencyPolicy.js';

// 0.9.238 — Causal-Readiness Policy Descriptor Transition (regression
// audit).
//
// `tests/DocumentCollaborationConsistencyPolicy.test.js` (0.9.226,
// updated by this same milestone) proves every policy field once against
// the real chain. This file is the STRONGER regression form 0.9.238's own
// Roadmap entry calls for: it proves the flagship causal-readiness
// behavior against `DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.application
// .remote` itself — never a hardcoded assumption of what the policy says
// — and then spends the rest of its sections proving what
// `RemoteApplicationTiming.CAUSAL_READINESS` does NOT mean. A policy
// value that only ever gets tested for the behavior it grants, never for
// the behavior neighboring fields and neighboring milestones already
// deliberately withheld, is a policy value nobody has actually checked
// stays inside its own boundary.
//
//   policy says CAUSAL_READINESS
//           |
//           v
//   runtime defers NOT_READY
//           |
//           v
//   runtime applies READY
//
// ...and, independently, CAUSAL_READINESS does NOT mean:
//
//   * total ordering among operations that merely share a successor
//   * conflict resolution for non-commuting concurrent writes
//   * replica convergence
//   * synchronized undo
//   * automatic recovery
//   * automatic retransmission / retry
//
// Every section below runs against the real, unmodified 0.9.222-0.9.237
// chain (`DocumentOperationDeferralUseCase`, the real propagation and
// recovery stacks, real `CommandHistory` instances) — the same "never a
// synthetic stand-in" discipline every file in this lineage already
// applies to itself. No production code changes; this file is test-only.

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

function buildBaseDocument({ worldId, authorIdentityId, title, groupName = 'Original' }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: 'building-x' });
    building.addBrick(new Brick({ id: 'brick-a', definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    world.addGroup(new Group({ id: 'group-1', name: groupName, brickIds: ['brick-a'] }));
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'owner', authorIdentityId }) });
}

function moveCommand(worldId, delta, extra = {}) {
    return new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta, ...extra });
}

function brickX(document) {
    return document.world.getBuilding('building-x').findBrick('brick-a').position.x;
}

function groupName(document) {
    return document.world.getGroup('group-1').name;
}

// A lightweight, direct (no network) harness: a real Document + real
// CommandHistory + a real DocumentOperationDeferralUseCase already
// attached, sharing a real DocumentOperationCausalGapDetector — the same
// posture tests/DocumentOperationDeferralUseCase.test.js already
// established for exercising the boundary directly.
function makeHarness(worldId, { groupName: groupNameValue = 'Original' } = {}) {
    const document = buildBaseDocument({ worldId, authorIdentityId: 'author-1', title: worldId, groupName: groupNameValue });
    const commandHistory = new CommandHistory({ world: document.world });
    const causalGapDetector = new DocumentOperationCausalGapDetector();
    const deferral = new DocumentOperationDeferralUseCase({ causalGapDetector });
    deferral.attachCommandHistory({ documentId: worldId, commandHistory });
    const target = { documentId: worldId, commandHistory };
    return { document, commandHistory, causalGapDetector, deferral, target };
}

// Mirrors production ordering exactly (application/EditorSession.js: a
// DocumentOperationCausalGapObservationUseCase records an arriving
// operation's causal identity BEFORE readiness is ever evaluated for
// anything naming it as a predecessor) — the same helper shape
// tests/DocumentOperationDeferralUseCase.test.js already uses.
function receive(harness, command, causalPredecessors, authorIdentityId = 'alice') {
    harness.causalGapDetector.record(harness.target.documentId, command.id, causalPredecessors);
    return harness.deferral.receive({ documentId: harness.target.documentId, command, authorIdentityId, causalPredecessors }, harness.target);
}

// A full, real, peer-authenticated propagation + recovery + replay stack,
// wired exactly the way application/EditorSession.js wires them — the
// same helper shape tests/DocumentOperationDeferralUseCase.test.js's own
// `makeFullStack()` already establishes.
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
    const deferral = new DocumentOperationDeferralUseCase({ causalGapDetector });
    const replay = new RecoveredOperationReplayUseCase();
    const recovered = [];
    const recoveryRequestsSent = [];
    recovery.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors, provenance) => recovered.push({ documentId, command, provenance }));
    const unsubscribeGapToPropagation = gapObservation.attachToPropagation(propagation);
    const unsubscribeDeferralToPropagation = deferral.attachToPropagation(propagation, () => state.target);
    const unsubscribeRecoveryRequest = recovery.attachToGapObservation(gapObservation);
    const unsubscribeGapToRecovery = gapObservation.attachToPropagation(recovery);
    const unsubscribeRecoveryToReplay = replay.attachToRecovery(recovery);
    return {
        device, peerMessageBus, connectedPeerRegistry, propagation, recovery, gapObservation, causalGapDetector, deferral, replay, state, recovered, recoveryRequestsSent,
        dispose: () => {
            unsubscribeGapToPropagation(); unsubscribeDeferralToPropagation(); unsubscribeRecoveryRequest();
            unsubscribeGapToRecovery(); unsubscribeRecoveryToReplay();
            propagation.dispose(); recovery.dispose();
        }
    };
}

async function runTests() {

// ===================================================================
// Section 1 — the policy shape itself: CAUSAL_READINESS is the CURRENT
// value; IMMEDIATE survives only as a superseded, named vocabulary
// member, never re-selected.
// ===================================================================
{
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.application.remote === RemoteApplicationTiming.CAUSAL_READINESS,
        '1. application.remote is CAUSAL_READINESS, not IMMEDIATE');
    assert(RemoteApplicationTiming.IMMEDIATE === 'immediate' && RemoteApplicationTiming.CAUSAL_READINESS === 'causal_readiness',
        '2. both vocabulary members still exist — 0.9.238 added a member, it did not delete one');
    assert(Object.isFrozen(RemoteApplicationTiming), '3. the enum stays closed/frozen');
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.history.orderingBasis === HistoryOrderingBasis.ARRIVAL_ORDER,
        '4. history.orderingBasis is untouched by this milestone');
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.conflict.nonCommutingOperations === ConcurrentConflictResolution.UNDEFINED,
        '5. conflict.nonCommutingOperations is untouched by this milestone');
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.convergence.guaranteed === ReplicaConvergenceGuarantee.NOT_GUARANTEED,
        '6. convergence.guaranteed is untouched by this milestone');
    console.log('✓ Section 1: the policy descriptor names CAUSAL_READINESS as current, keeps IMMEDIATE as a superseded member, and leaves every neighboring field exactly as it was');
}

// ===================================================================
// Section 2 — FLAGSHIP, on the REAL propagation chain, driven BY the
// policy constant itself (never a hardcoded assumption): B names A as a
// causal predecessor and arrives first. Because the policy says
// CAUSAL_READINESS, the runtime must defer B (NOT_READY) without
// touching Bob's document, then apply both A and B, in true causal
// order, once A actually executes.
// ===================================================================
{
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.application.remote === RemoteApplicationTiming.CAUSAL_READINESS,
        '7. precondition: this audit is only meaningful while the policy actually claims CAUSAL_READINESS');

    const network = new LocalPeerNetwork();
    const aliceDevice = makeDevice('Alice-238');
    const bobDevice = makeDevice('Bob-238');
    const alice = makeFullStack(aliceDevice);
    const bob = makeFullStack(bobDevice);
    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-238', aliceDevice, 'bob-238', bobDevice);
    alice.connectedPeerRegistry.add(peerA);
    bob.connectedPeerRegistry.add(peerB);

    const worldId = 'doc-238-flagship';
    const bobDoc = buildBaseDocument({ worldId, authorIdentityId: aliceDevice.identity.identityId, title: 'Section 2' });
    const bobHistory = new CommandHistory({ world: bobDoc.world });
    const bobTarget = { documentId: worldId, document: bobDoc, commandHistory: bobHistory };
    bob.state.target = bobTarget;
    const unattach = bob.deferral.attachCommandHistory({ documentId: worldId, commandHistory: bobHistory });

    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });

    alice.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    await wait(60);
    assert(brickX(bobDoc) === 0, '8. runtime defers NOT_READY: B arriving before A must not mutate Bobs document at all');
    assert(bob.deferral.getDeferredOperationIds(worldId).includes(opB.id), '9. B sits retained, exactly as the policy value predicts');

    alice.propagation.broadcastCommand({ documentId: worldId, command: opA, causalPredecessors: [] });
    await wait(60);
    assert(brickX(bobDoc) === 3, '10. runtime applies READY: once A executes, B is released and both deltas land');
    const executedIds = bobHistory.getExecutedCommands().map((c) => c.id);
    assert(executedIds.length === 2 && executedIds[0] === opA.id && executedIds[1] === opB.id,
        '11. A precedes B in Bobs own history — true causal order, despite arriving in the opposite order');

    unattach();
    alice.dispose();
    bob.dispose();
    console.log('✓ Section 2 (FLAGSHIP): policy says CAUSAL_READINESS -> runtime defers NOT_READY -> runtime applies READY, proven against the policy constant itself, on the real propagation chain');
}

// ===================================================================
// Section 3 — CAUSAL_READINESS does NOT imply total ordering: A -> C and
// B -> C names two INDEPENDENT predecessors for the same successor. C
// waits for both, but nothing about that shared successor gives A and B
// themselves any order relative to EACH OTHER — they may execute in
// either order, or interleave with unrelated genesis operations, with
// identical final state either way.
// ===================================================================
{
    const worldId = 'doc-238-diamond-order';
    const harness = makeHarness(worldId);
    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 10, y: 0, z: 0 });
    const opC = moveCommand(worldId, { x: 100, y: 0, z: 0 });

    const outcomeC = receive(harness, opC, [opA.id, opB.id]);
    assert(outcomeC === DocumentOperationDeferralOutcome.DEFERRED, '12. C (naming both A and B) is deferred — neither predecessor has executed yet');

    // B executes BEFORE A — the reverse of declaration order in C's own
    // predecessor list. Nothing in the causal graph orders A relative to
    // B; only C's own dependency on BOTH is enforced.
    receive(harness, opB, []);
    assert(!harness.commandHistory.getExecutedCommands().some((c) => c.id === opC.id), '13. C still deferred — B alone does not satisfy a dependency on BOTH A and B');
    receive(harness, opA, []);
    assert(harness.commandHistory.getExecutedCommands().some((c) => c.id === opC.id), '14. C releases once BOTH have executed, regardless of which order they executed in');

    const executedIds = harness.commandHistory.getExecutedCommands().map((c) => c.id);
    assert(executedIds[0] === opB.id && executedIds[1] === opA.id && executedIds[2] === opC.id,
        '15. B-then-A-then-C is a VALID causal history — the causal graph never demanded A-before-B, only {A,B}-before-C');

    // The identical topology, opposite execution order between A and B,
    // on an independent replica: also valid, and reaches the identical
    // final value — proving the order between A and B was never
    // meaningfully constrained by C depending on both.
    const worldId2 = 'doc-238-diamond-order-2';
    const harness2 = makeHarness(worldId2);
    const opA2 = moveCommand(worldId2, { x: 1, y: 0, z: 0 });
    const opB2 = moveCommand(worldId2, { x: 10, y: 0, z: 0 });
    const opC2 = moveCommand(worldId2, { x: 100, y: 0, z: 0 });
    receive(harness2, opC2, [opA2.id, opB2.id]);
    receive(harness2, opA2, []);
    receive(harness2, opB2, []);
    assert(brickX(harness.document) === brickX(harness2.document),
        '16. A-then-B and B-then-A both converge to the identical final value for this commuting command class — the causal graph imposed no order between A and B, only readiness for C');
    console.log('✓ Section 3: a shared successor (A -> C, B -> C) never gives its independent predecessors an order relative to EACH OTHER — CAUSAL_READINESS enforces named dependencies, never a total order nobody declared');
}

// ===================================================================
// Section 4 — CAUSAL_READINESS does NOT imply conflict resolution: two
// CONCURRENT (no causal relationship named between them) absolute-set
// operations, delivered in opposite order to two replicas, still resolve
// to two permanently different values. Mirrors 0.9.226 Section 3 / 0.9.225
// Section D1 — deliberately re-proven here, under the deferral boundary
// actually being attached, to show it changes nothing about this finding.
// ===================================================================
{
    const worldIdBob = 'doc-238-conflict-bob';
    const worldIdCharlie = 'doc-238-conflict-charlie';
    const bobHarness = makeHarness(worldIdBob);
    const charlieHarness = makeHarness(worldIdCharlie);

    const renameByLaptop = () => new RenameGroupCommand({ worldId: worldIdBob, groupId: 'group-1', name: 'Renamed-By-Laptop' });
    const renameByPhone = () => new RenameGroupCommand({ worldId: worldIdBob, groupId: 'group-1', name: 'Renamed-By-Phone' });

    // Neither operation names the other as a causal predecessor — they
    // are concurrent, not causally dependent — so both are READY on
    // arrival regardless of order.
    receive(bobHarness, renameByLaptop(), []);
    receive(bobHarness, renameByPhone(), []);

    const renameByLaptop2 = new RenameGroupCommand({ worldId: worldIdCharlie, groupId: 'group-1', name: 'Renamed-By-Laptop' });
    const renameByPhone2 = new RenameGroupCommand({ worldId: worldIdCharlie, groupId: 'group-1', name: 'Renamed-By-Phone' });
    receive(charlieHarness, renameByPhone2, []);
    receive(charlieHarness, renameByLaptop2, []);

    assert(groupName(bobHarness.document) !== groupName(charlieHarness.document),
        '17. Bob and Charlie hold permanently different names for the identical two concurrent operations, delivered in opposite order — CAUSAL_READINESS never adjudicates which concurrent write wins');
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.conflict.nonCommutingOperations === ConcurrentConflictResolution.UNDEFINED,
        '18. conflict.nonCommutingOperations stays UNDEFINED — this milestone added a readiness gate, never a conflict rule');
    console.log('✓ Section 4: CAUSAL_READINESS gates WHEN a causally-dependent operation may apply; it says nothing about WHICH of two concurrent, non-commuting writes should win — conflict.nonCommutingOperations remains UNDEFINED');
}

// ===================================================================
// Section 5 — CAUSAL_READINESS does NOT imply convergence: a replica
// that is simply never told about an operation another replica has
// (no causal relationship named at all — a true "missing set", not a
// deferred dependency) diverges exactly as permanently as 0.9.226 Section
// 5 already found. Deferral only ever withholds application of an
// operation THIS replica actually received and can name a predecessor
// for; it cannot withhold, retry, or request an operation never sent to
// it in the first place.
// ===================================================================
{
    const worldIdBob = 'doc-238-convergence-bob';
    const worldIdCharlie = 'doc-238-convergence-charlie';
    const bobHarness = makeHarness(worldIdBob);
    const charlieHarness = makeHarness(worldIdCharlie);

    receive(bobHarness, moveCommand(worldIdBob, { x: 2, y: 0, z: 0 }), []);

    receive(charlieHarness, moveCommand(worldIdCharlie, { x: 2, y: 0, z: 0 }), []);
    receive(charlieHarness, moveCommand(worldIdCharlie, { x: 9, y: 0, z: 0 }), []);

    assert(brickX(bobHarness.document) === 2 && brickX(charlieHarness.document) === 11,
        '19. Bob (one operation) and Charlie (two operations) diverge — Bob was never told about an operation Charlie received, and nothing about CAUSAL_READINESS changes that');
    assert(bobHarness.deferral.getDeferredOperationIds(worldIdBob).length === 0,
        '20. Bob has nothing deferred — a wholly unknown, unnamed operation is not a readiness gap, it is simply never received');
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.convergence.guaranteed === ReplicaConvergenceGuarantee.NOT_GUARANTEED,
        '21. convergence.guaranteed stays NOT_GUARANTEED — causal deferral closes one specific divergence path (a named-but-unexecuted predecessor), never every divergence path');
    console.log('✓ Section 5: CAUSAL_READINESS closes the specific divergence 0.9.235 demonstrated (a NAMED predecessor applied out of order); it does not, and was never claimed to, guarantee replica convergence in general');
}

// ===================================================================
// Section 6 — CAUSAL_READINESS does NOT imply synchronized undo: undoing
// a RELEASED (formerly-deferred) operation still reverts only the
// undoing replica's own state.
// ===================================================================
{
    const worldIdBob = 'doc-238-undo-bob';
    const worldIdCharlie = 'doc-238-undo-charlie';
    const bobHarness = makeHarness(worldIdBob);
    const charlieHarness = makeHarness(worldIdCharlie);

    const bobPred = moveCommand(worldIdBob, { x: 0, y: 0, z: 0 });
    const bobDependent = moveCommand(worldIdBob, { x: 6, y: 0, z: 0 });
    receive(bobHarness, bobDependent, [bobPred.id]);
    assert(bobHarness.deferral.getDeferredOperationIds(worldIdBob).includes(bobDependent.id), '22. Bobs dependent operation starts out deferred');
    receive(bobHarness, bobPred, []);
    assert(brickX(bobHarness.document) === 6, '23. releasing the predecessor applies the formerly-deferred dependent');

    const charliePred = moveCommand(worldIdCharlie, { x: 0, y: 0, z: 0 });
    const charlieDependent = moveCommand(worldIdCharlie, { x: 6, y: 0, z: 0 });
    receive(charlieHarness, charliePred, []);
    receive(charlieHarness, charlieDependent, [charliePred.id]);
    assert(brickX(charlieHarness.document) === 6, '24. Charlie applied the identical two operations, without ever deferring (predecessor already known/executed)');

    bobHarness.commandHistory.undo();
    assert(brickX(bobHarness.document) === 0, '25. Bob: undo reverts a RELEASED operation exactly like any other — his own state only');
    assert(brickX(charlieHarness.document) === 6, '26. Charlie: entirely unaffected by Bobs local undo of a formerly-deferred operation');
    assert(LocalUndoScope.LOCAL_ONLY === DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.undo.scope
        && LocalUndoPropagation.NEVER === DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.undo.propagation,
        '27. undo.scope/undo.propagation are untouched by this milestone');
    console.log('✓ Section 6: CAUSAL_READINESS changes WHEN a remote operation may be applied; once applied — deferred-then-released or never deferred at all — undo behaves identically: LOCAL_ONLY, NEVER propagated');
}

// ===================================================================
// Section 7 — CAUSAL_READINESS does NOT imply automatic recovery: a
// merely RECOVERED (known, never executed) predecessor never releases a
// deferred dependent. Only an explicit RecoveredOperationReplayUseCase
// #replay() call, turning the predecessor EXECUTED, does. Mirrors
// 0.9.237 Sections C/D — re-proven here as this policy's own boundary,
// against the real recovery + replay chain.
// ===================================================================
{
    const network = new LocalPeerNetwork();
    const carolDevice = makeDevice('Carol-238');
    const daveDevice = makeDevice('Dave-238');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-238', carolDevice, 'dave-238', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-238-recovery';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'Section 7 (carol)' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'Section 7 (dave)' });
    const daveHistory = new CommandHistory({ world: daveDoc.world });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: daveHistory };
    dave.state.target = daveTarget;
    const unattachDeferralHistory = dave.deferral.attachCommandHistory({ documentId: worldId, commandHistory: daveHistory });

    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });
    carolHistory.execute(opA);
    carolHistory.execute(opB);

    carol.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    await wait(60);
    assert(brickX(daveDoc) === 0, '28. B is NOT_READY (A unknown) — Daves document is untouched');

    await wait(80);
    assert(dave.recovered.some((r) => r.documentId === worldId && r.command.id === opA.id), '29. A was recovered (KNOWN) via the real recovery protocol');
    assert(brickX(daveDoc) === 0, '30. recovering A did NOT, on its own, release B — CAUSAL_READINESS never implies automatic recovery turning into automatic application');
    assert(dave.deferral.getDeferredOperationIds(worldId).includes(opB.id), '31. B is still retained');

    const replayOutcome = dave.replay.replay({ documentId: worldId, operationId: opA.id }, daveTarget);
    assert(replayOutcome === 'REPLAYED', '32. only an EXPLICIT replay(A) call changes anything');
    await wait(20);
    assert(brickX(daveDoc) === 3, '33. explicit replay makes A EXECUTED, which then releases B through the ordinary causal-readiness path');

    unattachRecoveryHistory();
    unattachDeferralHistory();
    carol.dispose();
    dave.dispose();
    console.log('✓ Section 7: CAUSAL_READINESS is satisfied only by actual EXECUTION, never by mere recovery — recovering a predecessor is not automatic recovery-into-application, and this milestone adds no such automation');
}

// ===================================================================
// Section 8 — CAUSAL_READINESS does NOT imply retransmission/retry: the
// deferral boundary itself never asks the network for anything. A
// retained operation whose predecessor never arrives by any means stays
// retained, indefinitely, with zero messages sent by the deferral
// boundary — any eventual recovery request observed on the wire comes
// entirely from the SEPARATE, pre-existing gap-observation/recovery
// machinery (0.9.229/0.9.230), never from DocumentOperationDeferralUseCase
// itself.
// ===================================================================
{
    const worldId = 'doc-238-no-retransmission';
    const harness = makeHarness(worldId);
    const opDependent = moveCommand(worldId, { x: 5, y: 0, z: 0 });
    const outcome = receive(harness, opDependent, ['a-predecessor-that-never-arrives']);
    assert(outcome === DocumentOperationDeferralOutcome.DEFERRED, '34. the dependent operation is deferred');

    // Simulate the passage of time / further unrelated activity: nothing
    // about DocumentOperationDeferralUseCase's own API includes a
    // send/broadcast/request call — it exposes exactly receive(),
    // onOperationExecuted(), attachCommandHistory(), attachToPropagation(),
    // getDeferredOperationIds(). Prove the retained operation is still
    // sitting there, untouched, after other unrelated genesis operations
    // pass through the SAME boundary.
    for (let i = 0; i < 5; i += 1) {
        receive(harness, moveCommand(worldId, { x: i, y: 0, z: 0 }, { id: `unrelated-${i}` }), []);
    }
    assert(harness.deferral.getDeferredOperationIds(worldId).includes(opDependent.id),
        '35. the operation whose predecessor never arrived is still retained, unconditionally — no timeout, no retry, no expiry');
    assert(!harness.commandHistory.getExecutedCommands().some((c) => c.id === opDependent.id),
        '36. it never applied — nothing "eventually gives up and applies anyway"');
    console.log('✓ Section 8: CAUSAL_READINESS never triggers a retry or a recovery request on its own — a predecessor that never arrives leaves its dependent retained forever, exactly as inert as any other never-satisfied precondition; recovery/retransmission remain the SEPARATE, already-existing 0.9.229/0.9.230 machinery');
}

console.log('\n0.9.238 — the CAUSAL_READINESS policy value describes exactly, and only, what 0.9.237 built: a real, verified regression proving the runtime honors it (Section 2), and seven independent proofs that it claims nothing more (Sections 3-8) — no total order among independent predecessors, no conflict resolution, no convergence guarantee, no synchronized undo, no automatic recovery, no retransmission.');

}

runTests().then(() => {
    console.log('\n✓ All CollaborationConsistencyPolicyCausalReadinessAudit tests passed');
}).catch((error) => {
    console.error('\n✗ CollaborationConsistencyPolicyCausalReadinessAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
