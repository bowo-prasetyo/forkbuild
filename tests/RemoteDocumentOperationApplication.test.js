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
import {
    DocumentCommandPropagationUseCase,
    DocumentOperationRejectionReason
} from '../application/DocumentCommandPropagationUseCase.js';
import {
    RemoteDocumentOperationApplicationUseCase,
    DocumentOperationApplicationOutcome
} from '../application/RemoteDocumentOperationApplicationUseCase.js';

// 0.9.223 — Explicit Remote Document Operation Application Boundary.
//
// 0.9.222 proved an authorized, verified, non-replayed remote operation
// can be OBSERVED without ever being applied — its own flagship's most
// load-bearing assertion was that Bob's World and CommandHistory stayed
// byte-identical after observing Alice's operation. This file proves the
// seam immediately downstream of that one: RemoteDocumentOperationApplicationUseCase
// gives a caller an EXPLICIT, document-scoped way to actually apply an
// observed operation — never automatic, never inferred, always checked
// against whatever document the caller says it is CURRENTLY looking at.
//
//   Section A: apply() in isolation — no peer network, no propagation
//              class, just the application decision itself against a
//              real CommandHistory.
//   Section B: attachToPropagation() wiring contract, against a minimal
//              fake propagation object.
//   Section C: FLAGSHIP — the full loop against real authenticated peer
//              connections: Alice's local CommandHistory execution
//              broadcasts (0.9.222's own attachCommandHistory()), Bob's
//              DocumentCommandPropagationUseCase observes it (0.9.222),
//              and THIS milestone's attachToPropagation() explicitly
//              applies it into Bob's own CommandHistory for the document
//              Bob is currently looking at — and refuses to when Bob is
//              looking at a different document, or at nothing at all,
//              without ever queuing the refused operation for later.
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
    try {
        fn();
    } catch {
        return;
    }
    throw new Error(`ASSERT FAILED (expected throw): ${message}`);
}

function wait(ms = 0) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mirrors tests/DocumentCollaborationBoundary.test.js's own makeDevice() exactly.
function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

// Mirrors tests/DocumentCollaborationBoundary.test.js's own
// connectAndAuthenticate() exactly.
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

// One replica's own full stack — mirrors tests/DocumentCollaborationBoundary
// .test.js's own makeStack() exactly.
function makeStack(device) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const documents = new Map(); // documentId -> Document
    const received = [];
    const rejected = [];
    const propagation = new DocumentCommandPropagationUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        identityProvider: device.provider, commandRegistry,
        resolveDocument: (id) => documents.get(id) || null
    });
    propagation.onOperationReceived((documentId, command, authorIdentityId) => {
        received.push({ documentId, command, authorIdentityId });
    });
    propagation.onOperationRejected((reason, envelope) => {
        rejected.push({ reason, envelope });
    });
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, commandRegistry, documents, propagation, received, rejected };
}

function buildOneBrickDocument({ worldId, buildingId, brickId, authorIdentityId, title, position = new Position(0, 0.5, 0) }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: buildingId });
    building.addBrick(new Brick({ id: brickId, definitionId: 'core:cube', position }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'owner', authorIdentityId }) });
}

function brickPosition(doc, buildingId, brickId) {
    const b = doc.world.getBuilding(buildingId).findBrick(brickId);
    return { x: b.position.x, y: b.position.y, z: b.position.z };
}

function makeFakePropagation() {
    let handler = null;
    return {
        onOperationReceived(callback) {
            handler = callback;
            return () => { handler = null; };
        },
        fire(documentId, command, authorIdentityId) {
            if (handler) handler(documentId, command, authorIdentityId);
        }
    };
}

async function runTests() {

// ---------------------------------------------------------------------
// Section A — apply() in isolation
// ---------------------------------------------------------------------
{
    const useCase = new RemoteDocumentOperationApplicationUseCase();

    const makeFakeCommand = (id = 'op-1') => ({ id, executed: false, execute(ctx) { this.executed = true; this.context = ctx; } });

    // 1. Matching document — applies through the real CommandHistory chokepoint.
    const history = new CommandHistory({});
    const command1 = makeFakeCommand('op-1');
    const outcome1 = useCase.apply({ documentId: 'doc-1', command: command1, authorIdentityId: 'alice' }, { documentId: 'doc-1', commandHistory: history });
    assert(outcome1 === DocumentOperationApplicationOutcome.APPLIED, '1. matching document applies');
    assert(command1.executed === true, '2. the command was actually executed');
    assert(history.getExecutedCommands().length === 1 && history.getExecutedCommands()[0] === command1, '3. the SAME command instance landed on the real CommandHistory undo stack');

    // 2. No target at all.
    const command2 = makeFakeCommand('op-2');
    const outcome2 = useCase.apply({ documentId: 'doc-1', command: command2, authorIdentityId: 'alice' }, null);
    assert(outcome2 === DocumentOperationApplicationOutcome.NOT_APPLIED, '4. no target at all is NOT_APPLIED');
    assert(command2.executed === false, '5. nothing was executed when there is no target');

    // 3. Wrong document — the receiving Editor is looking at something else.
    const otherHistory = new CommandHistory({});
    const command3 = makeFakeCommand('op-3');
    const outcome3 = useCase.apply({ documentId: 'doc-1', command: command3, authorIdentityId: 'alice' }, { documentId: 'doc-2', commandHistory: otherHistory });
    assert(outcome3 === DocumentOperationApplicationOutcome.NOT_APPLIED, '6. a target editing a DIFFERENT document is NOT_APPLIED');
    assert(command3.executed === false && otherHistory.getExecutedCommands().length === 0, '7. the wrong document\'s CommandHistory is completely untouched');

    // 4. Target missing a real CommandHistory.
    const command4 = makeFakeCommand('op-4');
    const outcome4 = useCase.apply({ documentId: 'doc-1', command: command4, authorIdentityId: 'alice' }, { documentId: 'doc-1' });
    assert(outcome4 === DocumentOperationApplicationOutcome.NOT_APPLIED, '8. a target with no real commandHistory is NOT_APPLIED, never throws');

    // 5. Malformed operation — the caller's own contract violation.
    assertThrows(() => useCase.apply({ command: makeFakeCommand() }, { documentId: 'doc-1', commandHistory: history }), '9. missing documentId throws');
    assertThrows(() => useCase.apply({ documentId: 'doc-1' }, { documentId: 'doc-1', commandHistory: history }), '10. missing command throws');
    assertThrows(() => useCase.apply({ documentId: 'doc-1', command: { id: 'x' } }, { documentId: 'doc-1', commandHistory: history }), '11. a command with no execute() throws');

    console.log('✓ Section A: RemoteDocumentOperationApplicationUseCase#apply() — document-scoped application, real CommandHistory chokepoint, no queueing, malformed-operation rejection');
}

// ---------------------------------------------------------------------
// Section B — attachToPropagation() wiring contract
// ---------------------------------------------------------------------
{
    const useCase = new RemoteDocumentOperationApplicationUseCase();
    const fakePropagation = makeFakePropagation();

    assertThrows(() => useCase.attachToPropagation(null, () => null), '12. no propagation throws');
    assertThrows(() => useCase.attachToPropagation({}, () => null), '13. a propagation without onOperationReceived throws');
    assertThrows(() => useCase.attachToPropagation(fakePropagation, null), '14. a non-function resolveTarget throws');

    const history = new CommandHistory({});
    let currentTarget = { documentId: 'doc-1', commandHistory: history };
    const unsubscribe = useCase.attachToPropagation(fakePropagation, () => currentTarget);

    const command = { id: 'op-1', executed: false, execute() { this.executed = true; } };
    fakePropagation.fire('doc-1', command, 'alice');
    assert(command.executed === true, '15. an observed operation for the CURRENT target document is applied automatically once attached');

    unsubscribe();
    const command2 = { id: 'op-2', executed: false, execute() { this.executed = true; } };
    fakePropagation.fire('doc-1', command2, 'alice');
    assert(command2.executed === false, '16. after unsubscribe(), a subsequent observed operation is never applied');

    console.log('✓ Section B: attachToPropagation() — collaborator requirements, live wiring, clean unsubscribe');
}

// ---------------------------------------------------------------------
// Section C — FLAGSHIP
// ---------------------------------------------------------------------
{
    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice');
    const phone = makeDevice('Alice-Phone');
    const charlie = makeDevice('Charlie');
    const bob = makeDevice('Bob');

    const aliceStack = makeStack(alice);
    const bobStack = makeStack(bob);
    const phoneStack = makeStack(phone);
    const charlieStack = makeStack(charlie);

    // Document X: Alice owns it. Document Y: Bob owns it, Alice has no
    // relationship to it at all — mirrors tests/DocumentCollaborationBoundary
    // .test.js's own Document X / Document Y setup exactly.
    const docXId = 'doc-x', buildingXId = 'building-x', brickXId = 'brick-x';
    aliceStack.documents.set(docXId, buildOneBrickDocument({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, authorIdentityId: alice.identity.identityId, title: "Alice's Structure" }));
    bobStack.documents.set(docXId, buildOneBrickDocument({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, authorIdentityId: alice.identity.identityId, title: "Alice's Structure" }));

    const docYId = 'doc-y', buildingYId = 'building-y', brickYId = 'brick-y';
    bobStack.documents.set(docYId, buildOneBrickDocument({ worldId: docYId, buildingId: buildingYId, brickId: brickYId, authorIdentityId: bob.identity.identityId, title: "Bob's Structure" }));

    // Alice's own local CommandHistory for Document X — wired to broadcast
    // (0.9.222's own attachCommandHistory()), so executing a command
    // locally is the ONLY thing that ever sends anything.
    const aliceHistoryX = new CommandHistory({ world: aliceStack.documents.get(docXId).world });
    aliceStack.propagation.attachCommandHistory({ documentId: docXId, commandHistory: aliceHistoryX });

    // Bob's own local CommandHistories — one per Document he has open.
    const bobHistoryX = new CommandHistory({ world: bobStack.documents.get(docXId).world });
    const bobHistoryY = new CommandHistory({ world: bobStack.documents.get(docYId).world });

    // THIS milestone: Bob's explicit application boundary, wired to his
    // own propagation's onOperationReceived() feed. `currentTarget` is
    // Bob's own "what am I looking at right now" — mutated below to
    // simulate switching between open Documents, and to nothing at all.
    let bobCurrentTarget = { documentId: docXId, commandHistory: bobHistoryX };
    const bobApplication = new RemoteDocumentOperationApplicationUseCase();
    bobApplication.attachToPropagation(bobStack.propagation, () => bobCurrentTarget);

    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice', alice, 'bob-for-alice', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);

    // --- Flagship loop: Alice edits -> Bob observes -> Bob explicitly applies
    const bobDocX = bobStack.documents.get(docXId);
    const move1 = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 3, y: 0, z: 0 } });
    aliceHistoryX.execute(move1);
    await wait(20);

    assert(bobStack.received.length === 1, '17. Bob: exactly one operation observed');
    assert(brickPosition(bobDocX, buildingXId, brickXId).x === 3, '18. Bob: his own Document X now REFLECTS Alice\'s operation — explicit application, not mere observation');
    assert(bobHistoryX.getExecutedCommands().length === 1, '19. Bob: the applied operation landed on his own CommandHistory for Document X');
    assert(bobHistoryX.getExecutedCommands()[0].id === move1.id, '20. Bob: operation identity (operationId == command.id) survived propagation AND application unchanged');
    assert(bobHistoryX.canUndo() === true, '21. Bob: the applied remote operation is undoable through the SAME local mechanism a local edit would be — a deliberate, named characterization, never a synchronized undo claim');

    // --- Document isolation: Bob switches to Document Y before the next operation arrives
    bobCurrentTarget = { documentId: docYId, commandHistory: bobHistoryY };
    const move2 = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 1, y: 0, z: 0 } });
    aliceHistoryX.execute(move2);
    await wait(20);

    assert(bobStack.received.length === 2, '22. Bob: the operation was still OBSERVED — propagation itself is unaffected by what Bob is currently looking at');
    assert(brickPosition(bobDocX, buildingXId, brickXId).x === 3, '23. Bob: Document X is UNCHANGED — the operation was never applied while Bob was looking at Document Y');
    assert(bobHistoryX.getExecutedCommands().length === 1, "24. Bob: Document X's own CommandHistory still has exactly the one PRIOR entry");
    assert(bobHistoryY.getExecutedCommands().length === 0, '25. Bob: Document Y is untouched too — a mismatched operation is refused, never redirected onto whatever happens to be open');

    // --- Bob switches back to Document X: the NEXT operation applies normally;
    // the refused one from while he was away is never queued or replayed.
    bobCurrentTarget = { documentId: docXId, commandHistory: bobHistoryX };
    const move3 = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 2, y: 0, z: 0 } });
    aliceHistoryX.execute(move3);
    await wait(20);

    assert(brickPosition(bobDocX, buildingXId, brickXId).x === 5, '26. Bob: back on Document X, the next operation applies (3 + 2, never 3 + 1 + 2) — move2 was genuinely forgotten, not queued');
    assert(bobHistoryX.getExecutedCommands().length === 2, '27. Bob: Document X\'s CommandHistory grew by exactly one — move2 never silently appears later');

    // --- Nothing currently open at all.
    bobCurrentTarget = null;
    const move4 = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 100, y: 0, z: 0 } });
    aliceHistoryX.execute(move4);
    await wait(20);
    assert(brickPosition(bobDocX, buildingXId, brickXId).x === 5, '28. Bob: with nothing open at all, an observed operation is safely NOT_APPLIED — no crash, no partial state');
    assert(bobHistoryX.getExecutedCommands().length === 2, '29. Bob: still exactly two applied operations');
    bobCurrentTarget = { documentId: docXId, commandHistory: bobHistoryX };

    // --- Unauthorized operation: never even observed, therefore never applied.
    const { peerA: charlieToBob, peerB: bobFromCharlie } = await connectAndAuthenticate(network, 'charlie', charlie, 'bob-for-charlie', bob);
    charlieStack.connectedPeerRegistry.add(charlieToBob);
    bobStack.connectedPeerRegistry.add(bobFromCharlie);

    const charlieForgedEdit = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 42, y: 0, z: 0 } });
    charlieStack.propagation.broadcastCommand({ documentId: docXId, command: charlieForgedEdit });
    await wait(20);
    assert(bobStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.NOT_AUTHORIZED), '30. Bob: Charlie\'s operation was rejected at the TRUST boundary (0.9.222), before this milestone\'s application boundary ever sees it');
    assert(brickPosition(bobDocX, buildingXId, brickXId).x === 5, '31. Bob: Document X is unaffected — an unauthorized operation is never observed, therefore never a candidate for application');
    assert(bobHistoryX.getExecutedCommands().length === 2, '32. Bob: still exactly two applied operations after the unauthorized attempt');

    // --- Replay: retransmitting an already-accepted operation produces no
    // second application, leveraging 0.9.222's own ReplayGuard — never a
    // second, application-layer deduplication mechanism.
    aliceStack.propagation.broadcastCommand({ documentId: docXId, command: move3 });
    await wait(20);
    assert(bobStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.DUPLICATE), '33. Bob: the retransmitted operation was rejected DUPLICATE by ReplayGuard, never reaching this milestone\'s apply() a second time');
    assert(brickPosition(bobDocX, buildingXId, brickXId).x === 5, '34. Bob: Document X is unchanged by the replay — no double application');
    assert(bobHistoryX.getExecutedCommands().length === 2, '35. Bob: still exactly two applied operations after the replay');

    // --- Multiple devices: Alice's authorized Phone produces a legitimate
    // operation too, applied identically — authorIdentityId stays the
    // proven SOCIAL identity throughout, never merely the device key.
    const grant = alice.provider.authorizeDevice(alice.identity.identityId, phone.identity.identityId, phone.identity.publicKey, { deviceLabel: 'Phone' });
    aliceStack.deviceAuth.broadcastAuthorization(grant);
    await wait(20);

    const { peerA: phoneToBob, peerB: bobFromPhone } = await connectAndAuthenticate(network, 'phone', phone, 'bob-for-phone', bob);
    phoneStack.connectedPeerRegistry.add(phoneToBob);
    bobStack.connectedPeerRegistry.add(bobFromPhone);

    const phoneMove = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 1, y: 0, z: 0 } });
    phoneStack.propagation.broadcastCommand({ documentId: docXId, command: phoneMove });
    await wait(20);
    assert(brickPosition(bobDocX, buildingXId, brickXId).x === 6, '36. Bob: Alice\'s authorized Phone\'s operation was explicitly applied too (5 + 1) — inherited authority, same application path');
    assert(bobHistoryX.getExecutedCommands().length === 3, '37. Bob: three applied operations total');

    aliceStack.propagation.dispose();
    bobStack.propagation.dispose();
    phoneStack.propagation.dispose();
    charlieStack.propagation.dispose();

    console.log('✓ Section C FLAGSHIP: explicit application of an authorized remote operation into the receiving Editor\'s own CommandHistory, document-scoped isolation across a live document switch, "nothing open" safety, unauthorized/replayed operations never reaching apply(), and multi-device authority — all against real authenticated peer connections');
}

}

runTests().then(() => {
    console.log('\n✓ All RemoteDocumentOperationApplication tests passed');
}).catch((error) => {
    console.error('\n✗ RemoteDocumentOperationApplication tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
