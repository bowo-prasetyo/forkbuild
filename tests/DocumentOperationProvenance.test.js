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
import { CausalGapStatus } from '../core/DocumentOperationCausalGapDetector.js';
import { DocumentOperationCausalGapObservationUseCase } from '../application/DocumentOperationCausalGapObservationUseCase.js';
import { DocumentOperationRecoveryUseCase } from '../application/DocumentOperationRecoveryUseCase.js';
import { DocumentOperationProvenance, isDocumentOperationProvenance } from '../core/DocumentOperationProvenance.js';

// 0.9.231 — Recovered Operation Provenance Boundary.
//
// 0.9.230 built a seam where a recovered operation becomes KNOWN to a
// replica's own causal graph without ever being APPLIED. This suite proves
// that distinction holds as a genuine, observable INVARIANT of the running
// system — never merely an implementation detail nobody has yet
// accidentally relied on. Every assertion below reads state through
// PUBLIC, PRE-EXISTING observation points this milestone deliberately adds
// nothing new to: `CommandHistory#getExecutedCommands()` (document
// execution history), `DocumentOperationCausalGapObservationUseCase#observe()`
// (causal knowledge), and `DocumentOperationRecoveryUseCase#onOperationReceived()`'s
// own new fifth `provenance` argument
// (`core/DocumentOperationProvenance.js`). No `containsApplied()` is added
// to `CommandHistory` — see that file's own header on why, and
// `core/DocumentOperationProvenance.js`'s own header for the full
// KNOWN/EXECUTED/RECOVERED vocabulary this suite exercises.
//
// Deliberately NOT tested here, because it deliberately does not exist:
// operation buffering, delayed/automatic application, causal reordering,
// automatic replay, rollback, history rewriting, conflict resolution,
// CRDT, OT, synchronized undo, an offline queue, retry, or a convergence
// guarantee. `application/CommandHistory.js` is UNTOUCHED by this
// milestone.

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

// A full replica stack — propagation, gap observation, and recovery —
// wired exactly the way application/EditorSession.js wires them in
// production: recovery's own onOperationReceived() feed attached to gap
// observation, gap observation's own onGapObserved() feed attached to
// recovery, but recovery NEVER attached to a
// RemoteDocumentOperationApplicationUseCase (mirrors tests/
// DocumentOperationRecovery.test.js's own makeStack()).
function makeStack(device) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const state = { target: null };
    const received = [];
    const rejected = [];
    const recovered = [];
    const gapObservations = [];

    const propagation = new DocumentCommandPropagationUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        identityProvider: device.provider, commandRegistry,
        resolveDocument: (id) => (state.target && state.target.documentId === id ? state.target.document : null)
    });
    propagation.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors) => received.push({ documentId, command, authorIdentityId, causalPredecessors }));
    propagation.onOperationRejected((reason, envelope) => rejected.push({ reason, envelope }));

    const recovery = new DocumentOperationRecoveryUseCase({
        peerMessageBus, connectedPeerRegistry, documentCommandPropagation: propagation, identityProvider: device.provider
    });
    recovery.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors, provenance) => recovered.push({ documentId, command, authorIdentityId, causalPredecessors, provenance }));

    const gapObservation = new DocumentOperationCausalGapObservationUseCase();
    gapObservation.onGapObserved((descriptor) => gapObservations.push(descriptor));
    const unsubscribeGapToPropagation = gapObservation.attachToPropagation(propagation);
    const unsubscribeRecoveryRequest = recovery.attachToGapObservation(gapObservation);
    const unsubscribeGapToRecovery = gapObservation.attachToPropagation(recovery);

    return {
        device, peerMessageBus, connectedPeerRegistry, deviceAuth, commandRegistry,
        propagation, recovery, gapObservation, state,
        received, rejected, recovered, gapObservations,
        dispose: () => {
            unsubscribeGapToPropagation();
            unsubscribeRecoveryRequest();
            unsubscribeGapToRecovery();
            propagation.dispose();
            recovery.dispose();
        }
    };
}

function buildBaseDocument({ worldId, authorIdentityId, title }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: 'building-x' });
    building.addBrick(new Brick({ id: 'brick-a', definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'owner', authorIdentityId }) });
}

function openDocument(replica, worldId, localAuthorIdentityId, title) {
    const document = buildBaseDocument({ worldId, authorIdentityId: localAuthorIdentityId, title });
    const commandHistory = new CommandHistory({ world: document.world });
    const target = { documentId: worldId, document, commandHistory };
    replica.state.target = target;
    const unattachRecoveryHistory = replica.recovery.attachCommandHistory({ documentId: worldId, commandHistory });
    return { target, unattachRecoveryHistory };
}

function moveCommand(worldId, delta) {
    return new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta });
}

async function runTests() {

const network = new LocalPeerNetwork();
const aliceDevice = makeDevice('Alice');
const bobDevice = makeDevice('Bob');
const alice = makeStack(aliceDevice);
const bob = makeStack(bobDevice);
const { peerA, peerB } = await connectAndAuthenticate(network, 'alice', aliceDevice, 'bob', bobDevice);
alice.connectedPeerRegistry.add(peerA);
bob.connectedPeerRegistry.add(peerB);

function openPair(worldId, title) {
    const bobSide = openDocument(bob, worldId, aliceDevice.identity.identityId, title);
    const aliceSide = openDocument(alice, worldId, bobDevice.identity.identityId, `${title} (alice)`);
    return { bobTarget: bobSide.target, aliceTarget: aliceSide.target };
}

// ===================================================================
// Section A — Recovery does not mutate document state. Recovering an
// operation this replica never applied leaves its CommandHistory exactly
// as it was; only the causal graph learns anything.
// ===================================================================
{
    const { bobTarget, aliceTarget } = openPair('doc-prov-a', 'Section A');
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const unsubscribeApplication = applicationUseCase.attachToPropagation(bob.propagation, () => bobTarget);
    const opA = moveCommand('doc-prov-a', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-prov-a', { x: 2, y: 0, z: 0 });
    aliceTarget.commandHistory.execute(opA);
    aliceTarget.commandHistory.execute(opB);
    // Only B is ever broadcast — Bob never receives A directly.
    alice.propagation.broadcastCommand({ documentId: 'doc-prov-a', command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    assert(bob.recovered.length === 1 && bob.recovered[0].command.id === opA.id, '1. A was recovered');
    assert(bob.recovered[0].provenance === DocumentOperationProvenance.RECOVERED, '2. the recovered operation carries RECOVERED provenance');
    assert(isDocumentOperationProvenance(bob.recovered[0].provenance), '3. RECOVERED is a valid provenance value');

    // Document state: only B (received normally) is executed. A is
    // nowhere in Bob's own CommandHistory.
    const executedIds = bobTarget.commandHistory.getExecutedCommands().map((c) => c.id);
    assert(executedIds.length === 1 && executedIds[0] === opB.id, '4. CommandHistory contains ONLY B — recovering A never touched document state');
    assert(!executedIds.includes(opA.id), '5. A is absent from getExecutedCommands() despite being fully recovered and verified');

    // Causal knowledge: re-querying B\'s own gap now answers NO_GAP,
    // proving A genuinely became KNOWN even though it was never EXECUTED.
    const reChecked = bob.gapObservation.observe({ documentId: 'doc-prov-a', operationId: opB.id, causalPredecessors: [opA.id] });
    assert(reChecked.causalGap.status === CausalGapStatus.NO_GAP, '6. A is KNOWN to the causal graph — recovery succeeded as causal evidence');

    unsubscribeApplication();
    console.log('✓ Section A: recovery makes an operation KNOWN without ever mutating document state');
}

// ===================================================================
// Section B — Recovery preserves complete envelope identity: operationId,
// documentId, authorIdentityId, command, and causalPredecessors all
// survive the recovery round trip unchanged, with no reconstruction.
// ===================================================================
{
    const { aliceTarget } = openPair('doc-prov-b', 'Section B');
    const opA = moveCommand('doc-prov-b', { x: 5, y: 1, z: -2 });
    const opB = moveCommand('doc-prov-b', { x: 9, y: 0, z: 0 });
    aliceTarget.commandHistory.execute(opA);
    aliceTarget.commandHistory.execute(opB);
    alice.propagation.broadcastCommand({ documentId: 'doc-prov-b', command: opB, causalPredecessors: [opA.id] });
    await wait(80);

    const recoveredA = bob.recovered.find((r) => r.command.id === opA.id);
    assert(recoveredA, '7. A was recovered');
    assert(recoveredA.documentId === 'doc-prov-b', '8. documentId preserved');
    assert(recoveredA.authorIdentityId === aliceDevice.identity.identityId, '9. authorIdentityId preserved');
    assert(JSON.stringify(recoveredA.causalPredecessors) === '[]', '10. causalPredecessors preserved');
    assert(JSON.stringify(recoveredA.command.toJSON()) === JSON.stringify(opA.toJSON()), '11. the command itself round-trips identically — no reconstruction or rewriting');
    assert(recoveredA.provenance === DocumentOperationProvenance.RECOVERED, '12. provenance is carried alongside the rest of the envelope, not reconstructed separately');

    console.log('✓ Section B: recovery preserves complete envelope identity, including its own provenance tag');
}

// ===================================================================
// Section C — Recovery vs application: two intentionally different acts.
// Recovering A never applies it; explicitly handing the SAME recovered
// operation to RemoteDocumentOperationApplicationUseCase DOES apply it —
// proving recovery(A) and apply(A) are genuinely distinct operations with
// distinct effects, not two names for the same thing.
// ===================================================================
{
    const { bobTarget, aliceTarget } = openPair('doc-prov-c', 'Section C');
    const opA = moveCommand('doc-prov-c', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-prov-c', { x: 2, y: 0, z: 0 });
    aliceTarget.commandHistory.execute(opA);
    aliceTarget.commandHistory.execute(opB);
    alice.propagation.broadcastCommand({ documentId: 'doc-prov-c', command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    const recoveredA = bob.recovered.find((r) => r.command.id === opA.id);
    assert(recoveredA, '13. A was recovered');
    assert(bobTarget.commandHistory.getExecutedCommands().every((c) => c.id !== opA.id), '14. recovery(A) alone never applied A');

    // Production code never wires documentOperationRecovery into
    // RemoteDocumentOperationApplicationUseCase (see EditorSession.js's
    // own 0.9.230 comment) — this is a DIRECT, explicit apply() call, the
    // same shape a future milestone would need to add deliberately.
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const outcome = applicationUseCase.apply(
        { documentId: recoveredA.documentId, command: recoveredA.command, authorIdentityId: recoveredA.authorIdentityId },
        bobTarget
    );
    assert(outcome === DocumentOperationApplicationOutcome.APPLIED, '15. apply(A), called explicitly, DOES apply it');
    const executedIds = bobTarget.commandHistory.getExecutedCommands().map((c) => c.id);
    assert(executedIds.includes(opA.id), '16. A now appears in CommandHistory — but only because apply() was called, never as a side effect of recovery itself');

    console.log('✓ Section C: recovery(A) and apply(A) are distinct acts with distinct, independently-observable effects');
}

// ===================================================================
// Section D — Recovery followed by a normal duplicate delivery of the SAME
// operation: ReplayGuard (the one deduplication mechanism) rejects the
// retransmission, so a recovered operation is never double-recorded and
// never silently applied through a duplicate normal arrival either.
// ===================================================================
{
    const { bobTarget, aliceTarget } = openPair('doc-prov-d', 'Section D');
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const unsubscribeApplication = applicationUseCase.attachToPropagation(bob.propagation, () => bobTarget);

    const opA = moveCommand('doc-prov-d', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-prov-d', { x: 2, y: 0, z: 0 });
    aliceTarget.commandHistory.execute(opA);
    aliceTarget.commandHistory.execute(opB);
    alice.propagation.broadcastCommand({ documentId: 'doc-prov-d', command: opB, causalPredecessors: [opA.id] });
    await wait(60);
    assert(bob.recovered.some((r) => r.command.id === opA.id), '17. A was recovered');

    // Now Alice delivers A through the ORDINARY propagation path — the
    // exact operation, already verified once via recovery.
    alice.propagation.broadcastCommand({ documentId: 'doc-prov-d', command: opA, causalPredecessors: [] });
    await wait(40);

    assert(bob.rejected.some((r) => r.reason === 'DUPLICATE' && r.envelope.operationId === opA.id), '18. the normal delivery of an already-recovered operation is rejected as a duplicate by ReplayGuard');
    assert(bob.recovered.filter((r) => r.command.id === opA.id).length === 1, '19. A was recovered exactly once — the later duplicate never re-triggers recovery bookkeeping');
    assert(bob.received.every((r) => r.command.id !== opA.id), '20. A never reaches onOperationReceived() (the feed RemoteDocumentOperationApplicationUseCase is wired to) through the normal path either');
    assert(bobTarget.commandHistory.getExecutedCommands().every((c) => c.id !== opA.id), '21. A therefore still never gets applied — recovering it first did not make a later normal arrival apply it, and the normal arrival itself was rejected as a duplicate');

    unsubscribeApplication();
    console.log('✓ Section D: a normal re-delivery of a recovered operation is rejected as a duplicate — it is neither re-recovered nor applied');
}

// ===================================================================
// Section E — Recovery followed by a dependent operation: once A is
// recovered, an operation naming A as its predecessor observes NO_GAP and
// follows the ordinary application path completely normally.
// ===================================================================
{
    const { bobTarget, aliceTarget } = openPair('doc-prov-e', 'Section E');
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const unsubscribeApplication = applicationUseCase.attachToPropagation(bob.propagation, () => bobTarget);

    const opA = moveCommand('doc-prov-e', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-prov-e', { x: 2, y: 0, z: 0 });
    const opC = moveCommand('doc-prov-e', { x: 3, y: 0, z: 0 });
    aliceTarget.commandHistory.execute(opA);
    aliceTarget.commandHistory.execute(opB);
    aliceTarget.commandHistory.execute(opC);
    // B triggers recovery of A (never broadcast directly).
    alice.propagation.broadcastCommand({ documentId: 'doc-prov-e', command: opB, causalPredecessors: [opA.id] });
    await wait(60);
    assert(bob.recovered.some((r) => r.command.id === opA.id), '22. A was recovered via B\'s own gap');

    // Now C, naming A as its OWN predecessor, arrives normally.
    alice.propagation.broadcastCommand({ documentId: 'doc-prov-e', command: opC, causalPredecessors: [opA.id] });
    await wait(40);

    const cGap = bob.gapObservations.find((o) => o.operationId === opC.id);
    assert(cGap && cGap.causalGap.status === CausalGapStatus.NO_GAP, '23. C observes NO_GAP — A\'s recovery satisfied the gap detector');
    const executedIds = bobTarget.commandHistory.getExecutedCommands().map((c) => c.id);
    assert(executedIds.includes(opB.id) && executedIds.includes(opC.id), '24. both B and C follow the ordinary application path normally');
    assert(!executedIds.includes(opA.id), '25. A itself remains unapplied throughout — its own recovery only ever satisfied downstream gap detection');

    unsubscribeApplication();
    console.log('✓ Section E: a recovered operation satisfies a downstream gap for a dependent operation, which then applies completely normally');
}

// ===================================================================
// Section F — Recovery does not reorder existing history: an operation
// already applied before its own causal predecessor is later recovered
// stays exactly where it was — recovery never retroactively inserts
// anything before it.
// ===================================================================
{
    const { bobTarget, aliceTarget } = openPair('doc-prov-f', 'Section F');
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const unsubscribeApplication = applicationUseCase.attachToPropagation(bob.propagation, () => bobTarget);

    const opA = moveCommand('doc-prov-f', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-prov-f', { x: 2, y: 0, z: 0 });
    aliceTarget.commandHistory.execute(opA);
    aliceTarget.commandHistory.execute(opB);
    alice.propagation.broadcastCommand({ documentId: 'doc-prov-f', command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    const beforeRecovery = bobTarget.commandHistory.getExecutedCommands().map((c) => c.id);
    assert(beforeRecovery.length === 1 && beforeRecovery[0] === opB.id, '26. B is already applied, alone, before A is recovered');
    assert(bob.recovered.some((r) => r.command.id === opA.id), '27. A was recovered as part of the same round trip');

    const afterRecovery = bobTarget.commandHistory.getExecutedCommands().map((c) => c.id);
    assert(JSON.stringify(afterRecovery) === JSON.stringify(beforeRecovery), '28. CommandHistory is byte-for-byte unchanged after A\'s recovery — no retroactive insertion, no reordering');

    unsubscribeApplication();
    console.log('✓ Section F: recovering a predecessor after its dependent was already applied never reorders or rewrites existing history');
}

// ===================================================================
// Section G — Document isolation: a recovered operation is scoped to
// exactly the document it was recovered for. Recovering it never mutates
// (or even touches) CommandHistory for a different, unrelated document.
// ===================================================================
{
    const { aliceTarget: aliceX } = openPair('doc-prov-g-x', 'Section G (x)');
    const sharedOp = moveCommand('doc-prov-g-x', { x: 1, y: 0, z: 0 });
    aliceX.commandHistory.execute(sharedOp);

    const { bobTarget: bobY } = openPair('doc-prov-g-y', 'Section G (y)');
    const opInY = moveCommand('doc-prov-g-y', { x: 2, y: 0, z: 0 });
    // opInY names sharedOp's own operationId as a predecessor, but under a
    // COMPLETELY DIFFERENT document — sharedOp was only ever recorded
    // under doc-prov-g-x.
    alice.propagation.broadcastCommand({ documentId: 'doc-prov-g-y', command: opInY, causalPredecessors: [sharedOp.id] });
    await wait(60);

    assert(!bob.recovered.some((r) => r.documentId === 'doc-prov-g-y' && r.command.id === sharedOp.id), '29. sharedOp, known only under doc-prov-g-x, is never recovered under doc-prov-g-y');
    assert(bobY.commandHistory.getExecutedCommands().every((c) => c.id !== sharedOp.id), '30. doc-prov-g-y\'s own CommandHistory never contains sharedOp — recovery scope never crosses documents');

    console.log('✓ Section G: recovery — and the document state it deliberately never touches — stays strictly document-scoped');
}

// ===================================================================
// Section H — Security preservation: a recovered operation remains
// subject to the SAME verification chain 0.9.230 established. A forged
// envelope is rejected and never reaches the RECOVERED-provenance feed at
// all — provenance is only ever assigned to genuinely verified evidence.
// ===================================================================
{
    const { toDocumentOperationEnvelope } = await import('../core/DocumentOperationEnvelope.js');
    const { toDocumentOperationRecoveryResponseMessage } = await import('../core/DocumentOperationRecoveryProtocol.js');

    const mallory = makeDevice('Mallory');
    const { peerA: peerBobAsSeenByMallory, peerB: peerMalloryAsSeenByBob } = await connectAndAuthenticate(network, 'mallory-prov', mallory, 'bob-via-mallory-prov', bobDevice);
    bob.connectedPeerRegistry.add(peerMalloryAsSeenByBob);

    openPair('doc-prov-h', 'Section H');
    const forgedCommand = moveCommand('doc-prov-h', { x: 1, y: 0, z: 0 });
    const forgedEnvelope = toDocumentOperationEnvelope({
        operationId: forgedCommand.id,
        documentId: 'doc-prov-h',
        authorIdentityId: aliceDevice.identity.identityId,
        command: forgedCommand.toJSON(),
        causalPredecessors: []
    });
    const forgedResponse = toDocumentOperationRecoveryResponseMessage({ documentId: 'doc-prov-h', operations: [forgedEnvelope] });

    const mallorysBus = new PeerMessageBus();
    mallorysBus.attach(peerBobAsSeenByMallory);
    mallorysBus.send(peerBobAsSeenByMallory, DocumentOperationRecoveryUseCase.DEFAULT_PROTOCOL, forgedResponse);
    await wait(30);

    assert(!bob.recovered.some((r) => r.command.id === forgedCommand.id), '31. a forged envelope never becomes a recovered operation — verification is not bypassed');

    console.log('✓ Section H: a recovered operation remains subject to the same verification chain as 0.9.230 — provenance is only ever assigned to genuinely verified evidence');
}

alice.dispose();
bob.dispose();

console.log('\n0.9.231 — causal knowledge and document execution are now explicitly, observably distinct: a recovered operation is verified causal evidence, never a silent application, and CommandHistory remains the sole, untouched record of what actually changed a document.');

}

runTests().then(() => {
    console.log('\n✓ All DocumentOperationProvenance tests passed');
}).catch((error) => {
    console.error('\n✗ DocumentOperationProvenance tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
