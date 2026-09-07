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
    DocumentOperationDeferralOutcome,
    isDocumentOperationDeferralOutcome
} from '../application/DocumentOperationDeferralUseCase.js';

// 0.9.237 — Causal Application Deferral Boundary.
//
// 0.9.235's own audit proved the failure mode (Section H: an
// absolute-write dependent applied while NOT_READY silently, permanently
// diverges once its predecessor later catches up); 0.9.236 built the one
// seam any fix has to route through (`RecoveredOperationReplayUseCase
// #replay()`, the only way a recovered operation ever becomes EXECUTED).
// This suite proves the fix: `DocumentOperationDeferralUseCase` retains a
// NOT_READY operation's exact, verified `Command` instance instead of
// applying it, and releases it — through the existing
// `RemoteDocumentOperationApplicationUseCase#apply()` /
// `CommandHistory#execute()` chokepoint, never a second mutation path —
// the moment its causal predecessors actually execute.
//
// Section A runs the flagship scenario against the REAL propagation
// chain (real authenticated peers, real DocumentCommandPropagationUseCase),
// the same "never synthetic" discipline this milestone's own lineage
// insists on. Sections C/D run against the REAL recovery + replay chain,
// for the exact "recovered predecessor must not release" interaction
// 0.9.236's own header calls out. Every other section exercises
// DocumentOperationDeferralUseCase directly against real
// `application/CommandHistory.js` instances — the same "pure class,
// exercised directly" posture `tests/DocumentOperationApplicationReadiness.test.js`
// already established for its own sibling file.

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

// A lightweight, direct (no network) harness: a real Document + real
// CommandHistory + a real DocumentOperationDeferralUseCase already
// attached to it, sharing a real DocumentOperationCausalGapDetector. Used
// by every section that exercises the deferral boundary's own API
// directly, mirroring tests/DocumentOperationApplicationReadiness.test.js's
// own posture for its pure sibling function.
function makeDeferralHarness(worldId, { groupName = 'Original' } = {}) {
    const document = buildBaseDocument({ worldId, authorIdentityId: 'author-1', title: worldId, groupName });
    const commandHistory = new CommandHistory({ world: document.world });
    const causalGapDetector = new DocumentOperationCausalGapDetector();
    const deferral = new DocumentOperationDeferralUseCase({ causalGapDetector });
    const unattach = deferral.attachCommandHistory({ documentId: worldId, commandHistory });
    const target = { documentId: worldId, commandHistory };
    return { document, commandHistory, causalGapDetector, deferral, target, unattach };
}

// Production always wires a DocumentOperationCausalGapObservationUseCase
// AHEAD of the deferral boundary on the same onOperationReceived() feed
// (see application/EditorSession.js's own 0.9.229 comment on receive
// ordering) — its job, not this class's own (see
// DocumentOperationDeferralUseCase's own header, "Composition, not
// duplication"), is recording each arriving operation's causal identity
// (Q2) BEFORE readiness (Q3/Q4) is ever evaluated for anything naming it
// as a predecessor. This test-only helper reproduces exactly that
// ordering directly against a harness's own shared causalGapDetector,
// without needing a full gap-observation instance for tests that don't
// otherwise care about it.
function receiveOperation(harness, { documentId, command, authorIdentityId = 'alice', causalPredecessors = [] }, target = harness.target) {
    harness.causalGapDetector.record(documentId, command.id, causalPredecessors);
    return harness.deferral.receive({ documentId, command, authorIdentityId, causalPredecessors }, target);
}

// A full, real, peer-authenticated propagation + recovery + replay stack,
// wired exactly the way application/EditorSession.js wires them: one
// shared causalGapDetector feeds gap observation AND the deferral
// boundary, recovery's own feed is attached to gap observation only
// (never to the deferral boundary — see DocumentOperationDeferralUseCase's
// own header, "Recovery sits beside this boundary"), and replay is the
// ONE explicit way a recovered operation can ever change document state.
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
    recovery.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors, provenance) => recovered.push({ documentId, command, provenance }));
    const unsubscribeGapToPropagation = gapObservation.attachToPropagation(propagation);
    const unsubscribeDeferralToPropagation = deferral.attachToPropagation(propagation, () => state.target);
    const unsubscribeRecoveryRequest = recovery.attachToGapObservation(gapObservation);
    const unsubscribeGapToRecovery = gapObservation.attachToPropagation(recovery);
    const unsubscribeRecoveryToReplay = replay.attachToRecovery(recovery);
    return {
        device, peerMessageBus, connectedPeerRegistry, propagation, recovery, gapObservation, causalGapDetector, deferral, replay, state, recovered,
        dispose: () => {
            unsubscribeGapToPropagation(); unsubscribeDeferralToPropagation(); unsubscribeRecoveryRequest();
            unsubscribeGapToRecovery(); unsubscribeRecoveryToReplay();
            propagation.dispose(); recovery.dispose();
        }
    };
}

async function runTests() {

// ===================================================================
// Section A — FLAGSHIP, on the REAL propagation chain. B (naming A as
// its own causal predecessor) arrives before A: NOT_READY, retained,
// Bob's document untouched. A then arrives, applies immediately (READY,
// genesis), and its own execution automatically releases B through
// nothing but the existing CommandHistory#execute() -> COMMAND_EXECUTED
// cascade — no polling, no second delivery of B.
// ===================================================================
{
    const network = new LocalPeerNetwork();
    const aliceDevice = makeDevice('Alice-237a');
    const bobDevice = makeDevice('Bob-237a');
    const alice = makeFullStack(aliceDevice);
    const bob = makeFullStack(bobDevice);
    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-237a', aliceDevice, 'bob-237a', bobDevice);
    alice.connectedPeerRegistry.add(peerA);
    bob.connectedPeerRegistry.add(peerB);

    const worldId = 'doc-237-a';
    const bobDoc = buildBaseDocument({ worldId, authorIdentityId: aliceDevice.identity.identityId, title: 'Section A' });
    const bobHistory = new CommandHistory({ world: bobDoc.world });
    const bobTarget = { documentId: worldId, document: bobDoc, commandHistory: bobHistory };
    bob.state.target = bobTarget;
    const unattachDeferralHistory = bob.deferral.attachCommandHistory({ documentId: worldId, commandHistory: bobHistory });

    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });

    alice.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    assert(brickX(bobDoc) === 0, '1. B arriving NOT_READY must not mutate Bobs document at all');
    assert(bobHistory.getExecutedCommands().length === 0, '2. nothing executed yet on Bob');
    assert(bob.deferral.getDeferredOperationIds(worldId).includes(opB.id), '3. B is retained, waiting on A');

    alice.propagation.broadcastCommand({ documentId: worldId, command: opA, causalPredecessors: [] });
    await wait(60);

    assert(brickX(bobDoc) === 3, '4. once A executes, B is automatically released and both deltas land (1 + 2)');
    const executedIds = bobHistory.getExecutedCommands().map((c) => c.id);
    assert(executedIds.length === 2 && executedIds[0] === opA.id && executedIds[1] === opB.id, '5. A executed before B, in true causal order, despite arriving in the OPPOSITE order');
    assert(bob.deferral.getDeferredOperationIds(worldId).length === 0, '6. nothing left retained once B is released');

    unattachDeferralHistory();
    alice.dispose();
    bob.dispose();
    console.log('✓ Section A (FLAGSHIP): a NOT_READY operation is deferred without touching document state, and is released automatically, in true causal order, the moment its predecessor actually executes — on the real propagation chain');
}

// ===================================================================
// Section B — a READY operation (no predecessors, or predecessors
// already EXECUTED) still applies immediately: no regression versus
// every milestone before this one.
// ===================================================================
{
    const harness = makeDeferralHarness('doc-237-b');
    const { commandHistory, deferral, target } = harness;
    const opA = moveCommand('doc-237-b', { x: 1, y: 0, z: 0 });
    const outcomeA = receiveOperation(harness, { documentId: 'doc-237-b', command: opA, authorIdentityId: 'alice', causalPredecessors: [] }, target);
    assert(outcomeA === DocumentOperationDeferralOutcome.APPLIED, '7. a genesis operation (no predecessors) applies immediately');
    assert(commandHistory.getExecutedCommands().some((c) => c.id === opA.id), '8. it is actually in CommandHistory');

    const opB = moveCommand('doc-237-b', { x: 2, y: 0, z: 0 });
    const outcomeB = receiveOperation(harness, { documentId: 'doc-237-b', command: opB, authorIdentityId: 'alice', causalPredecessors: [opA.id] }, target);
    assert(outcomeB === DocumentOperationDeferralOutcome.APPLIED, '9. an operation whose predecessor already EXECUTED applies immediately too');
    assert(deferral.getDeferredOperationIds('doc-237-b').length === 0, '10. nothing was ever retained');
    console.log('✓ Section B: a READY operation still applies immediately — no regression');
}

// ===================================================================
// Sections C/D — Recovery interaction, on the REAL recovery + replay
// chain. A recovered predecessor (KNOWN, never EXECUTED) must NOT
// release a deferred dependent; only an explicit replay() call may.
// ===================================================================
{
    const network = new LocalPeerNetwork();
    const carolDevice = makeDevice('Carol-237cd');
    const daveDevice = makeDevice('Dave-237cd');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-237cd', carolDevice, 'dave-237cd', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-237-cd';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'Section C/D (carol)' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'Section C/D (dave)' });
    const daveHistory = new CommandHistory({ world: daveDoc.world });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: daveHistory };
    dave.state.target = daveTarget;
    const unattachDeferralHistory = dave.deferral.attachCommandHistory({ documentId: worldId, commandHistory: daveHistory });

    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });
    carolHistory.execute(opA);
    carolHistory.execute(opB);

    // Dave only ever receives B directly — A is never broadcast to him,
    // only recoverable FROM Carol, who authored it.
    carol.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    assert(brickX(daveDoc) === 0, '11. B is NOT_READY (A unknown) — Daves document is untouched');
    assert(dave.deferral.getDeferredOperationIds(worldId).includes(opB.id), '12. B is retained');

    // The gap-observation -> recovery-request -> Carols response round
    // trip runs automatically off the wire this replica already shares —
    // give it time to complete.
    await wait(80);
    assert(dave.recovered.some((r) => r.documentId === worldId && r.command.id === opA.id), '13. A was recovered (KNOWN) via the real recovery protocol');
    assert(brickX(daveDoc) === 0, '14. recovering A must NOT, on its own, release B — Daves document is still untouched');
    assert(dave.deferral.getDeferredOperationIds(worldId).includes(opB.id), '15. B is still retained — a recovered-but-unexecuted predecessor never releases a dependent');

    const replayOutcome = dave.replay.replay({ documentId: worldId, operationId: opA.id }, daveTarget);
    assert(replayOutcome === 'REPLAYED', '16. explicit replay(A) succeeds');
    await wait(20);

    assert(brickX(daveDoc) === 3, '17. explicit replay(A) makes A EXECUTED, which automatically releases and applies B');
    const executedIds = daveHistory.getExecutedCommands().map((c) => c.id);
    assert(executedIds.length === 2 && executedIds[0] === opA.id && executedIds[1] === opB.id, '18. A precedes B in Daves own history, true causal order');
    assert(dave.deferral.getDeferredOperationIds(worldId).length === 0, '19. nothing left retained');

    unattachRecoveryHistory();
    unattachDeferralHistory();
    carol.dispose();
    dave.dispose();
    console.log('✓ Sections C/D: a recovered-but-unexecuted predecessor never releases a deferred dependent — only an explicit replay() call, turning it EXECUTED, does');
}

// ===================================================================
// Section E — the retained item is the EXACT verified Command instance,
// never a reconstruction: once released, the object CommandHistory
// executes is === the one originally handed to receive().
// ===================================================================
{
    const harness = makeDeferralHarness('doc-237-e');
    const { commandHistory, deferral, target } = harness;
    const opA = moveCommand('doc-237-e', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-237-e', { x: 2, y: 0, z: 0 });

    const outcomeB = receiveOperation(harness, { documentId: 'doc-237-e', command: opB, authorIdentityId: 'alice', causalPredecessors: [opA.id] }, target);
    assert(outcomeB === DocumentOperationDeferralOutcome.DEFERRED, '20. B is deferred (A unknown)');

    receiveOperation(harness, { documentId: 'doc-237-e', command: opA, authorIdentityId: 'alice', causalPredecessors: [] }, target);

    const executedB = commandHistory.getExecutedCommands().find((c) => c.id === opB.id);
    assert(executedB === opB, '21. the exact Command instance originally received is what CommandHistory executed — never a re-parse or substitute');
    console.log('✓ Section E: a deferred operation eventually executes the exact verified Command instance it arrived as');
}

// ===================================================================
// Section F — Duplicate delivery: the same operationId arrives twice
// while deferred. Only one deferred representation survives, and it
// executes exactly once.
// ===================================================================
{
    const harness = makeDeferralHarness('doc-237-f');
    const { commandHistory, deferral, target } = harness;
    const opA = moveCommand('doc-237-f', { x: 1, y: 0, z: 0 });
    const sharedId = 'op-237-f-shared';
    const opB1 = moveCommand('doc-237-f', { x: 2, y: 0, z: 0 }, { id: sharedId });
    const opB2 = moveCommand('doc-237-f', { x: 999, y: 0, z: 0 }, { id: sharedId });

    const outcome1 = receiveOperation(harness, { documentId: 'doc-237-f', command: opB1, authorIdentityId: 'alice', causalPredecessors: [opA.id] }, target);
    assert(outcome1 === DocumentOperationDeferralOutcome.DEFERRED, '22. first delivery of B is deferred');
    const outcome2 = receiveOperation(harness, { documentId: 'doc-237-f', command: opB2, authorIdentityId: 'alice', causalPredecessors: [opA.id] }, target);
    assert(outcome2 === DocumentOperationDeferralOutcome.DEFERRED, '23. second delivery of the identical operationId is a no-op, not an error');
    const deferredIds = deferral.getDeferredOperationIds('doc-237-f');
    assert(deferredIds.filter((id) => id === sharedId).length === 1, '24. only one deferred representation survives');

    receiveOperation(harness, { documentId: 'doc-237-f', command: opA, authorIdentityId: 'alice', causalPredecessors: [] }, target);

    const executedForShared = commandHistory.getExecutedCommands().filter((c) => c.id === sharedId);
    assert(executedForShared.length === 1, '25. B executes exactly once');
    assert(executedForShared[0] === opB1, '26. the FIRST verified instance is the one that survives and executes');
    console.log('✓ Section F: duplicate delivery of the same deferred operation collapses to one retained instance, executed exactly once');
}

// ===================================================================
// Section G — Multiple dependencies: C depends on [A, B]. C remains
// deferred until BOTH have actually executed.
// ===================================================================
{
    const harness = makeDeferralHarness('doc-237-g');
    const { commandHistory, deferral, target } = harness;
    const opA = moveCommand('doc-237-g', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-237-g', { x: 2, y: 0, z: 0 });
    const opC = moveCommand('doc-237-g', { x: 4, y: 0, z: 0 });

    const outcomeC = receiveOperation(harness, { documentId: 'doc-237-g', command: opC, authorIdentityId: 'alice', causalPredecessors: [opA.id, opB.id] }, target);
    assert(outcomeC === DocumentOperationDeferralOutcome.DEFERRED, '27. C is deferred — neither A nor B is known/executed yet');

    receiveOperation(harness, { documentId: 'doc-237-g', command: opA, authorIdentityId: 'alice', causalPredecessors: [] }, target);
    assert(deferral.getDeferredOperationIds('doc-237-g').includes(opC.id), '28. C stays deferred — A alone is not enough, B is still missing');
    assert(!commandHistory.getExecutedCommands().some((c) => c.id === opC.id), '29. C has not executed');

    receiveOperation(harness, { documentId: 'doc-237-g', command: opB, authorIdentityId: 'alice', causalPredecessors: [] }, target);
    assert(commandHistory.getExecutedCommands().some((c) => c.id === opC.id), '30. once BOTH A and B have executed, C is released');
    assert(!deferral.getDeferredOperationIds('doc-237-g').includes(opC.id), '31. C is no longer retained');
    console.log('✓ Section G: an operation naming multiple predecessors stays deferred until every one of them has actually executed');
}

// ===================================================================
// Section H — Concurrent operations: A -> {B, C}. B and C are
// independently deferred and independently released; neither's
// readiness depends on the other, and an unrelated genesis operation is
// never blocked by either being deferred.
// ===================================================================
{
    const harness = makeDeferralHarness('doc-237-h');
    const { commandHistory, deferral, target } = harness;
    const opA = moveCommand('doc-237-h', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-237-h', { x: 2, y: 0, z: 0 });
    const opC = moveCommand('doc-237-h', { x: 8, y: 0, z: 0 });
    const opD = moveCommand('doc-237-h', { x: 16, y: 0, z: 0 });

    receiveOperation(harness, { documentId: 'doc-237-h', command: opB, authorIdentityId: 'alice', causalPredecessors: [opA.id] }, target);
    receiveOperation(harness, { documentId: 'doc-237-h', command: opC, authorIdentityId: 'alice', causalPredecessors: [opA.id] }, target);
    assert(deferral.getDeferredOperationIds('doc-237-h').length === 2, '32. both B and C are deferred, independently');

    // A fully independent genesis operation is not blocked by B/C sitting
    // deferred for the SAME document.
    const outcomeD = receiveOperation(harness, { documentId: 'doc-237-h', command: opD, authorIdentityId: 'alice', causalPredecessors: [] }, target);
    assert(outcomeD === DocumentOperationDeferralOutcome.APPLIED, '33. an unrelated genesis operation applies immediately, unaffected by other deferred operations in the same document');

    receiveOperation(harness, { documentId: 'doc-237-h', command: opA, authorIdentityId: 'alice', causalPredecessors: [] }, target);
    assert(commandHistory.getExecutedCommands().some((c) => c.id === opB.id), '34. B released once A executed');
    assert(commandHistory.getExecutedCommands().some((c) => c.id === opC.id), '35. C released once A executed, independently of B');
    assert(deferral.getDeferredOperationIds('doc-237-h').length === 0, '36. nothing left retained');
    console.log('✓ Section H: concurrent operations sharing one predecessor are deferred and released independently of each other and of unrelated operations');
}

// ===================================================================
// Section I — Document isolation: one DocumentOperationDeferralUseCase
// serving two documents never lets a deferred operation for Document X
// interfere with Document Y, even when the two share the identical
// operationId string.
// ===================================================================
{
    const docXId = 'doc-237-i-x';
    const docYId = 'doc-237-i-y';
    const docX = buildBaseDocument({ worldId: docXId, authorIdentityId: 'author-1', title: docXId });
    const docY = buildBaseDocument({ worldId: docYId, authorIdentityId: 'author-1', title: docYId });
    const historyX = new CommandHistory({ world: docX.world });
    const historyY = new CommandHistory({ world: docY.world });
    // One shared causalGapDetector across both documents — mirrors
    // application/EditorSession.js's own single, session-lifetime
    // detector shared across every document it opens (0.9.237's own
    // constructor wiring) — so this section proves isolation is a real
    // property of DocumentOperationDeferralUseCase itself, not an
    // artifact of giving each document its own private detector.
    const causalGapDetector = new DocumentOperationCausalGapDetector();
    const deferral = new DocumentOperationDeferralUseCase({ causalGapDetector });
    deferral.attachCommandHistory({ documentId: docXId, commandHistory: historyX });
    deferral.attachCommandHistory({ documentId: docYId, commandHistory: historyY });

    const predecessorXId = 'pred-x';
    const sharedId = 'shared-operation-id';
    const opXDependent = moveCommand(docXId, { x: 5, y: 0, z: 0 }, { id: sharedId });
    const opYGenesis = moveCommand(docYId, { x: 7, y: 0, z: 0 }, { id: sharedId });

    causalGapDetector.record(docXId, opXDependent.id, [predecessorXId]);
    const outcomeX = deferral.receive({ documentId: docXId, command: opXDependent, authorIdentityId: 'alice', causalPredecessors: [predecessorXId] }, { documentId: docXId, commandHistory: historyX });
    assert(outcomeX === DocumentOperationDeferralOutcome.DEFERRED, '37. X-document operation is deferred (its own predecessor is unknown)');

    causalGapDetector.record(docYId, opYGenesis.id, []);
    const outcomeY = deferral.receive({ documentId: docYId, command: opYGenesis, authorIdentityId: 'alice', causalPredecessors: [] }, { documentId: docYId, commandHistory: historyY });
    assert(outcomeY === DocumentOperationDeferralOutcome.APPLIED, '38. Y-document operation, sharing the SAME operationId, applies immediately — unaffected by Xs own deferred entry');
    assert(historyY.getExecutedCommands().some((c) => c.id === sharedId), '39. Y actually executed');
    assert(!historyX.getExecutedCommands().some((c) => c.id === sharedId), '40. X did not — its own deferred entry is untouched');
    assert(deferral.getDeferredOperationIds(docXId).includes(sharedId), '41. X-document deferred set still holds its own entry');
    assert(!deferral.getDeferredOperationIds(docYId).includes(sharedId), '42. Y-document deferred set was never touched — it never deferred anything');

    const predecessorX = moveCommand(docXId, { x: 1, y: 0, z: 0 }, { id: predecessorXId });
    causalGapDetector.record(docXId, predecessorX.id, []);
    deferral.receive({ documentId: docXId, command: predecessorX, authorIdentityId: 'alice', causalPredecessors: [] }, { documentId: docXId, commandHistory: historyX });
    assert(historyX.getExecutedCommands().some((c) => c.id === sharedId), '43. releasing Xs own predecessor releases Xs own dependent, without ever touching Y again');
    assert(historyY.getExecutedCommands().length === 1, '44. Y-documents history is exactly as it was — one operation, no duplicate, no cross-document leakage');
    console.log('✓ Section I: deferred operations for one document never interfere with another, even across an identical operationId');
}

// ===================================================================
// Section J — Failure isolation: a retained operation whose Command
// throws when finally applied must not prevent release of any OTHER
// retained operation.
// ===================================================================
{
    const harness = makeDeferralHarness('doc-237-j');
    const { commandHistory, deferral, target } = harness;
    const opPredecessor = moveCommand('doc-237-j', { x: 1, y: 0, z: 0 });
    // Names a group that does not exist in this document — RenameGroupCommand#execute()
    // throws "group not found" the moment it is actually applied.
    const poisoned = new RenameGroupCommand({ worldId: 'doc-237-j', groupId: 'no-such-group', name: 'Whatever' });
    const healthy = moveCommand('doc-237-j', { x: 2, y: 0, z: 0 });

    receiveOperation(harness, { documentId: 'doc-237-j', command: poisoned, authorIdentityId: 'alice', causalPredecessors: [opPredecessor.id] }, target);
    receiveOperation(harness, { documentId: 'doc-237-j', command: healthy, authorIdentityId: 'alice', causalPredecessors: [opPredecessor.id] }, target);
    assert(deferral.getDeferredOperationIds('doc-237-j').length === 2, '45. both are deferred, waiting on the same predecessor');

    // Releasing the predecessor must not throw out of receive() itself —
    // the poisoned commands own failure is isolated internally.
    receiveOperation(harness, { documentId: 'doc-237-j', command: opPredecessor, authorIdentityId: 'alice', causalPredecessors: [] }, target);

    assert(commandHistory.getExecutedCommands().some((c) => c.id === healthy.id), '46. the healthy sibling still applied despite the poisoned operations own failure');
    assert(!commandHistory.getExecutedCommands().some((c) => c.id === poisoned.id), '47. the poisoned operation itself never executed');
    assert(!deferral.getDeferredOperationIds('doc-237-j').includes(poisoned.id), '48. the poisoned operation is dropped, not retried on every future execution');
    console.log('✓ Section J: a malformed/failing deferred operation is isolated — it never prevents release of an unrelated deferred operation');
}

// ===================================================================
// Section K — closed-vocabulary discipline, same posture every sibling
// enum in this lineage already applies to itself.
// ===================================================================
{
    assert(isDocumentOperationDeferralOutcome(DocumentOperationDeferralOutcome.APPLIED), '49. APPLIED is a valid outcome');
    assert(isDocumentOperationDeferralOutcome(DocumentOperationDeferralOutcome.DEFERRED), '50. DEFERRED is a valid outcome');
    assert(isDocumentOperationDeferralOutcome(DocumentOperationDeferralOutcome.NOT_APPLIED), '51. NOT_APPLIED is a valid outcome');
    assert(!isDocumentOperationDeferralOutcome('PENDING'), '52. no PENDING/BLOCKED/WAITING lifecycle value ever sneaks into this vocabulary');
    console.log('✓ Section K: DocumentOperationDeferralOutcome stays a closed, three-value vocabulary — APPLIED, DEFERRED, NOT_APPLIED, nothing else');
}

console.log('\n0.9.237 — the causal application deferral boundary holds: a NOT_READY operation never mutates document state on arrival; it is retained, exactly as verified, until its causal predecessors actually execute — at which point it applies through the SAME CommandHistory#execute() chokepoint every other operation already uses, exactly once, regardless of duplicate delivery, unrelated failures, or which other document this replica has open.');

}

runTests().then(() => {
    console.log('\n✓ All DocumentOperationDeferralUseCase tests passed');
}).catch((error) => {
    console.error('\n✗ DocumentOperationDeferralUseCase tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
