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
    toDocumentOperationEnvelope,
    isValidDocumentOperationEnvelope
} from '../core/DocumentOperationEnvelope.js';

// 0.9.222 — Shared Document Edit Operation Boundary.
//
// docs/Roadmap.md, 0.9.221 Section C named "live multi-editor co-editing
// of one Document" as absent. Re-auditing that claim found it only half
// true: World View's own Documents already have full live propagation,
// ordering, and conflict resolution (0.2.96-0.2.98,
// tests/WorldCommandPropagation.test.js, tests/SharedWorldConflictResolution.test.js)
// — the genuinely absent half is the Editor's own Structure/blueprint
// Documents (ui/views/EditorView.js), which had no propagation protocol
// of any kind. This file proves the boundary this milestone adds for
// THAT surface, deliberately narrower than World's own answer — see
// application/DocumentCommandPropagationUseCase.js's own header for the
// full "boundary, not convergence" argument:
//
//   Section A: core/DocumentOperationEnvelope.js — the closed wire shape
//              in isolation.
//   Section B: application/DocumentCommandPropagationUseCase.js's own
//              constructor — every collaborator required.
//   Section C: FLAGSHIP — Alice and Bob each independently hold the same
//              Structure Document (Alice owns it); an operation Alice's
//              Laptop (and, inheriting her authority, her authorized
//              Phone) executes locally and broadcasts is OBSERVED by Bob
//              as an explicit, identified remote operation — and
//              critically, is NEVER applied to Bob's own World or pushed
//              onto anyone's CommandHistory merely by arriving. Bob's own
//              attempt to edit Alice's Document is refused; an operation
//              for a Document Bob has not opened is refused; Charlie
//              cannot claim to be Alice; a command whose own payload
//              targets a different Document than the envelope claims is
//              refused; retransmitting the identical operation produces
//              no second observation; and two independently authored
//              operations, even identical in every other respect, carry
//              two distinct operation identities.
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

// Mirrors tests/WorldCommandPropagation.test.js's own makeDevice() exactly.
function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

// Mirrors tests/WorldCommandPropagation.test.js's own connectAndAuthenticate()
// exactly.
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

// One replica's own full stack, the Editor-document-collaboration
// analogue of tests/WorldCommandPropagation.test.js's own makeStack().
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

async function runTests() {

// ---------------------------------------------------------------------
// Section A — core/DocumentOperationEnvelope.js
// ---------------------------------------------------------------------
{
    const command = { type: 'move-brick', id: 'cmd-1', worldId: 'doc-1' };
    const envelope = toDocumentOperationEnvelope({
        operationId: 'cmd-1', documentId: 'doc-1', authorIdentityId: 'did:key:alice', command
    });
    assert(isValidDocumentOperationEnvelope(envelope), '1. a well-formed envelope validates');
    assert(envelope.kind === 'OPERATION', '2. kind is the single closed OPERATION kind');
    assert(envelope.logicalClock === undefined, '3. this envelope deliberately carries no ordering metadata — see this file\'s own header');

    assertThrows(() => toDocumentOperationEnvelope({ documentId: 'd', authorIdentityId: 'a', command }), '4. missing operationId throws');
    assertThrows(() => toDocumentOperationEnvelope({ operationId: 'o', authorIdentityId: 'a', command }), '5. missing documentId throws');
    assertThrows(() => toDocumentOperationEnvelope({ operationId: 'o', documentId: 'd', command }), '6. missing authorIdentityId throws');
    assertThrows(() => toDocumentOperationEnvelope({ operationId: 'o', documentId: 'd', authorIdentityId: 'a' }), '7. missing command throws');
    assertThrows(() => toDocumentOperationEnvelope({ operationId: 'o', documentId: 'd', authorIdentityId: 'a', command: { no: 'type' } }), '8. a command with no type throws');

    assert(isValidDocumentOperationEnvelope(null) === false, '9. null is never valid');
    assert(isValidDocumentOperationEnvelope({ ...envelope, kind: 'SNAPSHOT' }) === false, '10. an unknown kind is never valid — this protocol never carries a Document snapshot');
    assert(isValidDocumentOperationEnvelope({ ...envelope, operationId: '' }) === false, '11. an empty operationId is never valid');
    assert(isValidDocumentOperationEnvelope({ ...envelope, command: 'not-an-object' }) === false, '12. a non-object command is never valid');
    console.log('✓ Section A: core/DocumentOperationEnvelope.js — closed OPERATION shape, required fields, malformed rejection');
}

// ---------------------------------------------------------------------
// Section B — DocumentCommandPropagationUseCase constructor
// ---------------------------------------------------------------------
{
    const device = makeDevice('Solo');
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, { peerMessageBus, connectedPeerRegistry });
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const resolveDocument = () => null;

    assertThrows(() => new DocumentCommandPropagationUseCase({}), '13. no collaborators at all throws');
    assertThrows(() => new DocumentCommandPropagationUseCase({ connectedPeerRegistry, deviceAuthorization: deviceAuth, identityProvider: device.provider, commandRegistry, resolveDocument }), '14. missing peerMessageBus throws');
    assertThrows(() => new DocumentCommandPropagationUseCase({ peerMessageBus, deviceAuthorization: deviceAuth, identityProvider: device.provider, commandRegistry, resolveDocument }), '15. missing connectedPeerRegistry throws');
    assertThrows(() => new DocumentCommandPropagationUseCase({ peerMessageBus, connectedPeerRegistry, identityProvider: device.provider, commandRegistry, resolveDocument }), '16. missing deviceAuthorization throws');
    assertThrows(() => new DocumentCommandPropagationUseCase({ peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth, commandRegistry, resolveDocument }), '17. missing identityProvider throws');
    assertThrows(() => new DocumentCommandPropagationUseCase({ peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth, identityProvider: device.provider, resolveDocument }), '18. missing commandRegistry throws');
    assertThrows(() => new DocumentCommandPropagationUseCase({ peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth, identityProvider: device.provider, commandRegistry }), '19. missing resolveDocument throws');

    const solo = new DocumentCommandPropagationUseCase({ peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth, identityProvider: device.provider, commandRegistry, resolveDocument });
    assert(solo.broadcastCommand({ documentId: 'd', command: new MoveBrickCommand({ worldId: 'd', buildingId: 'b', brickId: 'k', delta: { x: 1, y: 0, z: 0 } }) }) !== null, '20. broadcasting with zero AUTHENTICATED peers still returns the operationId, reaches nobody, and never throws');
    assertThrows(() => solo.broadcastCommand({ documentId: 'd' }), '21. broadcastCommand() without a real Command instance throws');
    solo.dispose();
    console.log('✓ Section B: DocumentCommandPropagationUseCase constructor — every collaborator required, zero-peer broadcast is safe');
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

    // Document X: Alice owns it. Both Alice and Bob hold their own,
    // independent, already-opened replicas of the identical Structure
    // content — as if both had previously received the same blueprint.
    // Nothing about how they each got their own copy is this milestone's
    // concern; only what happens between two already-converged replicas
    // next.
    const docXId = 'doc-x', buildingXId = 'building-x', brickXId = 'brick-x';
    aliceStack.documents.set(docXId, buildOneBrickDocument({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, authorIdentityId: alice.identity.identityId, title: "Alice's Structure" }));
    bobStack.documents.set(docXId, buildOneBrickDocument({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, authorIdentityId: alice.identity.identityId, title: "Alice's Structure" }));

    // Document Y: Bob owns it. Alice has no relationship to it at all.
    const docYId = 'doc-y', buildingYId = 'building-y', brickYId = 'brick-y';
    bobStack.documents.set(docYId, buildOneBrickDocument({ worldId: docYId, buildingId: buildingYId, brickId: brickYId, authorIdentityId: bob.identity.identityId, title: "Bob's Structure" }));

    // Bob's own local CommandHistory for Document X — never touched by
    // this milestone's receive path, since nothing here ever applies a
    // remote operation to anything.
    const bobHistoryX = new CommandHistory({ world: bobStack.documents.get(docXId).world });

    // --- Alice <-> Bob -------------------------------------------------
    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice', alice, 'bob-for-alice', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);

    // Alice moves the brick LOCALLY first — the "already executed through
    // the authorized local mutation chokepoint" precondition this whole
    // protocol assumes; propagation never decides local authority.
    const aliceDoc = aliceStack.documents.get(docXId);
    const moveCommand = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 3, y: 0, z: 0 } });
    moveCommand.execute({ world: aliceDoc.world });
    assert(brickPosition(aliceDoc, buildingXId, brickXId).x === 3, '22. Alice: the brick genuinely moved locally, first');

    const sentOperationId = aliceStack.propagation.broadcastCommand({ documentId: docXId, command: moveCommand });
    await wait(20);

    const bobDoc = bobStack.documents.get(docXId);
    assert(bobStack.received.length === 1, '23. Bob: exactly one operation observed');
    assert(bobStack.received[0].documentId === docXId, '24. Bob: the observed operation names Document X');
    assert(bobStack.received[0].command.id === sentOperationId, '25. Bob: the observed operation carries the SAME operation identity Alice sent');
    assert(bobStack.received[0].authorIdentityId === alice.identity.identityId, '26. Bob: the observed operation names Alice\'s own resolved identity as author');
    assert(brickPosition(bobDoc, buildingXId, brickXId).x === 0, '27. Bob: his OWN World is COMPLETELY UNTOUCHED — observing an authorized operation is never automatic application');
    assert(bobHistoryX.canUndo() === false && bobHistoryX.getExecutedCommands().length === 0,
        '28. Bob: his own local undo/redo history for Document X is still completely empty');

    // --- Idempotency: Alice retransmits the EXACT SAME operation -------
    aliceStack.propagation.broadcastCommand({ documentId: docXId, command: moveCommand });
    await wait(20);
    assert(bobStack.received.length === 1, '29. Bob: still exactly one observed operation — the retransmit produced none');
    assert(bobStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.DUPLICATE), '30. Bob: the retransmit was explicitly recognized and rejected as DUPLICATE');

    // --- Device semantics: Alice's Phone, authorized, inherits her authority
    const grant = alice.provider.authorizeDevice(alice.identity.identityId, phone.identity.identityId, phone.identity.publicKey, { deviceLabel: 'Phone' });
    aliceStack.deviceAuth.broadcastAuthorization(grant); // Alice <-> Bob already connected — Bob learns it directly
    await wait(20);

    const { peerA: phoneToBob, peerB: bobFromPhone } = await connectAndAuthenticate(network, 'phone', phone, 'bob-for-phone', bob);
    phoneStack.connectedPeerRegistry.add(phoneToBob);
    bobStack.connectedPeerRegistry.add(bobFromPhone);

    const phoneMove = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 1, y: 0, z: 0 } });
    phoneStack.propagation.broadcastCommand({ documentId: docXId, command: phoneMove });
    await wait(20);
    assert(bobStack.received.length === 2, '31. Bob: Alice\'s Phone, an authorized DEVICE, produced a second observed operation — inherited authority, never a second owner record');
    assert(bobStack.received[1].authorIdentityId === alice.identity.identityId, '32. Bob: the observed operation for the Phone\'s command still names ALICE as author, not the Phone\'s own raw device key');
    assert(moveCommand.id !== phoneMove.id && bobStack.received[0].command.id !== bobStack.received[1].command.id,
        '33. Bob: two independently authored operations — even same Document, same eventual author, same command TYPE — carry two distinct operation identities');

    // --- Device semantics: Alice revokes the Phone ---------------------
    const revocation = alice.provider.revokeDeviceAuthorization(alice.identity.identityId, phone.identity.identityId);
    aliceStack.deviceAuth.broadcastRevocation(revocation);
    await wait(20);

    const revokedMove = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 1, y: 0, z: 0 } });
    phoneStack.propagation.broadcastCommand({ documentId: docXId, command: revokedMove });
    await wait(20);
    assert(bobStack.received.length === 2, '34. Bob: no third observed operation — the revoked Phone\'s operation was refused');
    assert(bobStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.NOT_AUTHORIZED),
        '35. Bob: the revoked Phone\'s operation was explicitly rejected NOT_AUTHORIZED — zero code here ever asked "was this revoked," it just asked the same authorization question again');

    // --- Unauthorized editor: Bob has no authority over Alice's Document
    const bobsForgedEdit = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 99, y: 0, z: 0 } });
    bobStack.propagation.broadcastCommand({ documentId: docXId, command: bobsForgedEdit });
    await wait(20);
    assert(brickPosition(aliceDoc, buildingXId, brickXId).x === 3, '36. Alice: her Document is untouched — Bob merely holding a read replica grants him no edit authority over it');
    assert(aliceStack.received.length === 0, '37. Alice: Bob\'s unauthorized attempt produced zero observed operations');
    assert(aliceStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.NOT_AUTHORIZED),
        '38. Alice: Bob\'s attempt was explicitly rejected NOT_AUTHORIZED');

    // --- Cross-document security: Alice has no authority over Document Y
    // (Bob's own Document, which HE has open — unlike the truly unknown
    // case below, this proves ownership is per-Document, never "Alice is
    // authorized somewhere, therefore authorized everywhere").
    const docYMove = new MoveBrickCommand({ worldId: docYId, buildingId: buildingYId, brickId: brickYId, delta: { x: 5, y: 0, z: 0 } });
    aliceStack.propagation.broadcastCommand({ documentId: docYId, command: docYMove });
    await wait(20);
    const docYDoc = bobStack.documents.get(docYId);
    assert(brickPosition(docYDoc, buildingYId, brickYId).x === 0, '39a. Bob: Document Y is byte-identical — Alice\'s real EDIT authority on Document X grants her nothing on Document Y');
    assert(bobStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.NOT_AUTHORIZED && r.envelope.documentId === docYId),
        '39b. Bob: the Document Y operation was explicitly rejected NOT_AUTHORIZED');

    // --- Cross-document isolation: an operation for a Document Bob never opened at all
    const unknownMove = new MoveBrickCommand({ worldId: 'doc-unknown', buildingId: 'x', brickId: 'y', delta: { x: 1, y: 0, z: 0 } });
    aliceStack.propagation.broadcastCommand({ documentId: 'doc-unknown', command: unknownMove });
    await wait(20);
    assert(bobStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.UNKNOWN_DOCUMENT && r.envelope.documentId === 'doc-unknown'),
        '39c. Bob: an operation naming a Document he has never opened is refused, never silently creates one — the "currently on a different Document" case');

    // --- Payload/envelope cross-document mismatch -----------------------
    const mismatchedCommand = new MoveBrickCommand({ worldId: docYId, buildingId: buildingYId, brickId: brickYId, delta: { x: 1, y: 0, z: 0 } });
    aliceStack.propagation.broadcastCommand({ documentId: docXId, command: mismatchedCommand });
    await wait(20);
    assert(bobStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.DOCUMENT_MISMATCH),
        '40. Bob: an envelope claiming Document X while its own serialized command targets Document Y is refused as DOCUMENT_MISMATCH');

    // --- Identity spoofing: Charlie cannot claim to be Alice ------------
    const { peerA: charlieToBob, peerB: bobFromCharlie } = await connectAndAuthenticate(network, 'charlie', charlie, 'bob-for-charlie', bob);
    charlieStack.connectedPeerRegistry.add(charlieToBob);
    bobStack.connectedPeerRegistry.add(bobFromCharlie);

    const forgedCommand = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 42, y: 0, z: 0 } });
    const forgedEnvelope = toDocumentOperationEnvelope({
        operationId: forgedCommand.id,
        documentId: docXId,
        authorIdentityId: alice.identity.identityId, // Charlie CLAIMS to be Alice
        command: forgedCommand.toJSON()
    });
    charlieStack.peerMessageBus.send(charlieToBob, DocumentCommandPropagationUseCase.DEFAULT_PROTOCOL, forgedEnvelope);
    await wait(20);
    assert(bobStack.received.length === 2, '41. Bob: Charlie\'s forged envelope produced no new observed operation');
    assert(bobStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.IDENTITY_MISMATCH),
        '42. Bob: the forged envelope was explicitly rejected IDENTITY_MISMATCH — Charlie\'s authenticated connection could not make itself Alice merely by claiming to be her');

    // --- Final isolation check, after everything ------------------------
    assert(brickPosition(bobDoc, buildingXId, brickXId).x === 0, '43. Bob: after every accepted-and-observed AND every refused remote operation, his own World is STILL byte-identical to how it started');
    assert(bobHistoryX.canUndo() === false && bobHistoryX.getExecutedCommands().length === 0,
        '44. Bob: his own local undo/redo history for Document X is STILL completely empty');

    aliceStack.propagation.dispose();
    bobStack.propagation.dispose();
    phoneStack.propagation.dispose();
    charlieStack.propagation.dispose();

    console.log('✓ Section C FLAGSHIP: authorized-operation observation without automatic application, idempotency, device-aware authority, revocation isolation, unauthorized-editor rejection, cross-Document isolation, envelope/payload mismatch rejection, identity-spoofing refusal, distinct operation identities, and undo-stack isolation — all against real authenticated peer connections');
}

}

runTests().then(() => {
    console.log('\n✓ All DocumentCollaborationBoundary tests passed');
}).catch((error) => {
    console.error('\n✗ DocumentCollaborationBoundary tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
