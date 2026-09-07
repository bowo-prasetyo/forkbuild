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
import { DocumentCommandPropagationUseCase } from '../application/DocumentCommandPropagationUseCase.js';
import { DocumentOperationCausalGapDetector } from '../core/DocumentOperationCausalGapDetector.js';
import { DocumentOperationCausalGapObservationUseCase } from '../application/DocumentOperationCausalGapObservationUseCase.js';
import { DocumentOperationRecoveryUseCase } from '../application/DocumentOperationRecoveryUseCase.js';
import { DocumentOperationProvenance } from '../core/DocumentOperationProvenance.js';
import {
    RecoveredOperationReplayUseCase,
    DocumentOperationReplayOutcome
} from '../application/RecoveredOperationReplayUseCase.js';
import { evaluateApplicationReadiness, DocumentOperationApplicationReadiness } from '../core/DocumentOperationApplicationReadiness.js';

// 0.9.236 — Recovered Operation Replay Boundary.
//
// Proves the seam 0.9.235's own "Recommendation" named: a recovered
// operation stays inert (RECOVERED, never EXECUTED) until a caller
// explicitly calls RecoveredOperationReplayUseCase#replay() — and that
// call is the ONLY way it can ever change document state. See that
// class's own header in application/RecoveredOperationReplayUseCase.js
// for the full reasoning.

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

function buildBaseDocument({ worldId, authorIdentityId, title }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: 'building-x' });
    building.addBrick(new Brick({ id: 'brick-a', definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    world.addGroup(new Group({ id: 'group-1', name: 'Original', brickIds: ['brick-a'] }));
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'owner', authorIdentityId }) });
}

function moveCommand(worldId, delta) {
    return new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta });
}

function brickX(document) {
    return document.world.getBuilding('building-x').findBrick('brick-a').position.x;
}

// A recovery-capable full stack, wired exactly the way
// application/EditorSession.js wires them: recovery's own feed attaches to
// gap observation AND (0.9.236) to a RecoveredOperationReplayUseCase —
// never to RemoteDocumentOperationApplicationUseCase for the recovered
// feed itself. Mirrors tests/CausalReadinessEnforcementDecisionAudit.test.js's
// own makeFullStack() helper, plus this milestone's own replay use case.
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
    const replay = new RecoveredOperationReplayUseCase();
    const recovered = [];
    recovery.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors, provenance) => recovered.push({ documentId, command, provenance }));
    const unsubscribeGapToPropagation = gapObservation.attachToPropagation(propagation);
    const unsubscribeRecoveryRequest = recovery.attachToGapObservation(gapObservation);
    const unsubscribeGapToRecovery = gapObservation.attachToPropagation(recovery);
    const unsubscribeRecoveryToReplay = replay.attachToRecovery(recovery);
    return {
        device, peerMessageBus, connectedPeerRegistry, propagation, recovery, gapObservation, causalGapDetector, replay, state, recovered,
        dispose: () => {
            unsubscribeGapToPropagation(); unsubscribeRecoveryRequest(); unsubscribeGapToRecovery(); unsubscribeRecoveryToReplay();
            propagation.dispose(); recovery.dispose();
        }
    };
}

async function runTests() {

const network = new LocalPeerNetwork();

// ===================================================================
// Sections A/F — Explicit replay, and recovery's own non-applying
// boundary proven alongside it: recovering A leaves the document
// unchanged; only an explicit replay(A) call changes it.
// ===================================================================
{
    const carolDevice = makeDevice('Carol-236a');
    const daveDevice = makeDevice('Dave-236a');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-236a', carolDevice, 'dave-236a', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-236-a';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'Section A (carol)' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'Section A (dave)' });
    const daveHistory = new CommandHistory({ world: daveDoc.world });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: daveHistory };
    dave.state.target = daveTarget;

    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });
    carolHistory.execute(opA);
    carolHistory.execute(opB);
    // Dave never applies B at all in this section (no application use
    // case wired) — the point here is purely: does RECOVERING A, on its
    // own, ever move Dave's brick? It must not.
    carol.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    assert(dave.recovered.some((r) => r.command.id === opA.id && r.provenance === DocumentOperationProvenance.RECOVERED), '1. A was recovered onto Dave\'s replica');
    assert(brickX(daveDoc) === 0, '2. (Section F) recovery alone never moved Dave\'s brick — document unchanged by recovery');
    assert(daveHistory.getExecutedCommands().length === 0, '3. (Section F) nothing has executed on Dave\'s replica yet');

    const outcome = dave.replay.replay({ documentId: worldId, operationId: opA.id }, daveTarget);
    assert(outcome === DocumentOperationReplayOutcome.REPLAYED, '4. explicit replay(A) reports REPLAYED');
    assert(brickX(daveDoc) === 1, '5. (Section A) explicit replay(A) DID move Dave\'s brick — document changed only now');
    assert(daveHistory.getExecutedCommands().some((c) => c.id === opA.id), '6. A is now present in Dave\'s own CommandHistory as EXECUTED');

    unattachRecoveryHistory();
    dave.dispose();
    carol.dispose();
    console.log('✓ Sections A & F: recovery alone never mutates document state; an explicit replay() call is the only thing that does');
}

// ===================================================================
// Section B — Exact command, no reconstruction: the Command instance
// CommandHistory actually executes is reference-identical to the one
// DocumentOperationRecoveryUseCase itself verified and deserialized —
// replay() never re-parses, re-fetches, or substitutes anything.
// ===================================================================
{
    const carolDevice = makeDevice('Carol-236b');
    const daveDevice = makeDevice('Dave-236b');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-236b', carolDevice, 'dave-236b', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-236-b';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'Section B (carol)' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'Section B (dave)' });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: new CommandHistory({ world: daveDoc.world }) };
    dave.state.target = daveTarget;

    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });
    carolHistory.execute(opA);
    carolHistory.execute(opB);
    carol.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    const recoveredEntry = dave.recovered.find((r) => r.command.id === opA.id);
    assert(recoveredEntry, '7. A is available as an already-verified Command instance from the recovery feed');

    dave.replay.replay({ documentId: worldId, operationId: opA.id }, daveTarget);
    const executedA = daveTarget.commandHistory.getExecutedCommands().find((c) => c.id === opA.id);
    assert(executedA === recoveredEntry.command, '8. the Command instance CommandHistory executed is REFERENCE-IDENTICAL to the one recovery itself verified and deserialized — no reconstruction, no substitution');

    unattachRecoveryHistory();
    dave.dispose();
    carol.dispose();
    console.log('✓ Section B: replay() executes the exact recovered Command instance, never a reconstruction or substitute');
}

// ===================================================================
// Section C — Document isolation: a recovered operation for Document A
// cannot be replayed into Document B, even by an operationId collision.
// ===================================================================
{
    const carolDevice = makeDevice('Carol-236c');
    const daveDevice = makeDevice('Dave-236c');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-236c', carolDevice, 'dave-236c', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-236-c';
    const otherWorldId = 'doc-236-c-OTHER';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'Section C (carol)' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'Section C (dave, doc A)' });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: new CommandHistory({ world: daveDoc.world }) };
    // A second, unrelated document open on Dave's own replica.
    const otherDoc = buildBaseDocument({ worldId: otherWorldId, authorIdentityId: daveDevice.identity.identityId, title: 'Section C (dave, doc B)' });
    const otherTarget = { documentId: otherWorldId, document: otherDoc, commandHistory: new CommandHistory({ world: otherDoc.world }) };
    dave.state.target = daveTarget;

    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });
    carolHistory.execute(opA);
    carolHistory.execute(opB);
    carol.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    assert(dave.recovered.some((r) => r.command.id === opA.id), '9. A was recovered for Document A (doc-236-c)');

    // Wrong target document, correct documentId argument mismatch: ask to
    // replay A (recorded under worldId) but pass otherWorldId as the
    // documentId — this must simply not find it.
    const crossDocOutcome = dave.replay.replay({ documentId: otherWorldId, operationId: opA.id }, otherTarget);
    assert(crossDocOutcome === DocumentOperationReplayOutcome.NOT_REPLAYED, '10. replaying A under a DIFFERENT documentId is refused — NOT_REPLAYED');
    assert(brickX(otherDoc) === 0, '11. Document B\'s own brick is completely untouched');

    // Even naming the correct documentId but handing a target for the
    // WRONG document (a caller bug) must still refuse, exactly like
    // RemoteDocumentOperationApplicationUseCase#apply() already does.
    const mismatchedTargetOutcome = dave.replay.replay({ documentId: worldId, operationId: opA.id }, otherTarget);
    assert(mismatchedTargetOutcome === DocumentOperationReplayOutcome.NOT_REPLAYED, '12. replaying A (Document A) against a target whose OWN documentId is Document B is refused');
    assert(brickX(otherDoc) === 0, '13. Document B\'s brick remains untouched by the mismatched-target attempt');

    // The correct call still works, proving the refusals above were
    // genuinely about isolation, not a broken replay path.
    const correctOutcome = dave.replay.replay({ documentId: worldId, operationId: opA.id }, daveTarget);
    assert(correctOutcome === DocumentOperationReplayOutcome.REPLAYED, '14. replaying A against ITS OWN document succeeds');
    assert(brickX(daveDoc) === 1, '15. Document A\'s own brick moved as expected');

    unattachRecoveryHistory();
    dave.dispose();
    carol.dispose();
    console.log('✓ Section C: a recovered operation for Document A can never be replayed into Document B');
}

// ===================================================================
// Section D — Authorization/security: replay() can only ever operate on
// an operationId that already passed DocumentOperationRecoveryUseCase's
// own verification boundary. There is no way to hand replay() a raw
// command payload — its only inputs are (documentId, operationId) — so
// an operationId that was never recovered (never verified) simply cannot
// be replayed, no matter how it is spelled.
// ===================================================================
{
    const dave = makeFullStack(makeDevice('Dave-236d'));
    const worldId = 'doc-236-d';
    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: dave.device.identity.identityId, title: 'Section D' });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: new CommandHistory({ world: daveDoc.world }) };
    dave.state.target = daveTarget;

    const outcome = dave.replay.replay({ documentId: worldId, operationId: 'never-verified-operation-id' }, daveTarget);
    assert(outcome === DocumentOperationReplayOutcome.NOT_REPLAYED, '16. an operationId that never passed recovery\'s own verification cannot be replayed');
    assert(daveTarget.commandHistory.getExecutedCommands().length === 0, '17. nothing executed as a result of the attempt');

    dave.dispose();
    console.log('✓ Section D: replay() only ever operates on operations that already passed recovery\'s own verification boundary — there is no other way in');
}

// ===================================================================
// Section E — Replay idempotency: replaying the same operation twice
// must not silently execute it twice. Verified against real CommandHistory
// execution-history ground truth, not a second "already replayed" flag.
// ===================================================================
{
    const carolDevice = makeDevice('Carol-236e');
    const daveDevice = makeDevice('Dave-236e');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-236e', carolDevice, 'dave-236e', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-236-e';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'Section E (carol)' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'Section E (dave)' });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: new CommandHistory({ world: daveDoc.world }) };
    dave.state.target = daveTarget;

    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });
    carolHistory.execute(opA);
    carolHistory.execute(opB);
    carol.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    const firstOutcome = dave.replay.replay({ documentId: worldId, operationId: opA.id }, daveTarget);
    assert(firstOutcome === DocumentOperationReplayOutcome.REPLAYED, '18. the first replay() call succeeds');
    assert(brickX(daveDoc) === 1, '19. the brick moved exactly once so far');

    const secondOutcome = dave.replay.replay({ documentId: worldId, operationId: opA.id }, daveTarget);
    assert(secondOutcome === DocumentOperationReplayOutcome.NOT_REPLAYED, '20. a second replay() call for the SAME operation reports NOT_REPLAYED');
    assert(brickX(daveDoc) === 1, '21. the brick did NOT move a second time — no double execution');
    assert(daveTarget.commandHistory.getExecutedCommands().filter((c) => c.id === opA.id).length === 1, '22. A appears in CommandHistory exactly once, never twice');

    unattachRecoveryHistory();
    dave.dispose();
    carol.dispose();
    console.log('✓ Section E: replaying the same recovered operation twice executes it exactly once');
}

// ===================================================================
// Section G — Causal readiness: after explicit replay(A), B's own
// readiness (evaluated against Dave's REAL execution history) transitions
// NOT_READY -> READY, without B itself ever being touched again.
// ===================================================================
{
    const carolDevice = makeDevice('Carol-236g');
    const daveDevice = makeDevice('Dave-236g');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-236g', carolDevice, 'dave-236g', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-236-g';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'Section G (carol)' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'Section G (dave)' });
    const daveHistory = new CommandHistory({ world: daveDoc.world });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: daveHistory };
    dave.state.target = daveTarget;
    const executionHistory = { isExecuted: (documentId, operationId) => daveHistory.getExecutedCommands().some((c) => c.id === operationId) };

    // B applies immediately on Dave (today's ARRIVAL_ORDER policy,
    // unaffected by this milestone), even though its own predecessor A
    // is only ever recovered, never (yet) executed.
    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });
    carolHistory.execute(opA);
    carolHistory.execute(opB);
    daveHistory.execute(opB);
    carol.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    const readinessBefore = evaluateApplicationReadiness(worldId, { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: dave.causalGapDetector, executionHistory });
    assert(readinessBefore.readiness === DocumentOperationApplicationReadiness.NOT_READY, '23. before replay, B is NOT_READY — A is known (recovered) but not executed');

    const outcome = dave.replay.replay({ documentId: worldId, operationId: opA.id }, daveTarget);
    assert(outcome === DocumentOperationReplayOutcome.REPLAYED, '24. explicit replay(A) succeeds');

    const readinessAfter = evaluateApplicationReadiness(worldId, { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: dave.causalGapDetector, executionHistory });
    assert(readinessAfter.readiness === DocumentOperationApplicationReadiness.READY, '25. after replay(A), re-querying B\'s readiness now answers READY');
    assert(daveHistory.getExecutedCommands().filter((c) => c.id === opB.id).length === 1, '26. B itself was never re-applied or re-executed by replay(A) — it appears exactly once, from its own original application');

    unattachRecoveryHistory();
    dave.dispose();
    carol.dispose();
    console.log('✓ Section G: explicit replay(A) alone flips a dependent\'s readiness from NOT_READY to READY, without ever touching the dependent itself');
}

console.log('\n0.9.236 — the recovered operation replay boundary holds: recovery never applies; only an explicit, verified, document-scoped, idempotent replay() call ever turns RECOVERED into EXECUTED.');

}

runTests().then(() => {
    console.log('\n✓ All RecoveredOperationReplayUseCase tests passed');
}).catch((error) => {
    console.error('\n✗ RecoveredOperationReplayUseCase tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
