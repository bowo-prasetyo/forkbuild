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
    WorldCommandPropagationUseCase,
    WorldOperationRejectionReason
} from '../application/WorldCommandPropagationUseCase.js';
import {
    toWorldOperationEnvelope,
    isValidWorldOperationEnvelope
} from '../core/WorldOperationEnvelope.js';

// 0.2.96 — Shared World Command Propagation.
//
// 0.2.95 proved WHO may edit a World. This file proves the next question
// the design conversation asked, and deliberately nothing more: does an
// authorized mutation made on ONE replica become the SAME durable World
// mutation on another AUTHORIZED replica — without ever turning the
// existing chat/device-conversation-sync protocols into a generic
// synchronization channel, without ever transmitting a World snapshot,
// and without ever solving concurrent/conflicting edits (explicitly
// 0.2.97's question).
//
//   Section A: core/WorldOperationEnvelope.js — the closed wire shape in
//              isolation.
//   Section B: application/WorldCommandPropagationUseCase.js's own
//              constructor — every collaborator is required, exactly like
//              every other protocol use case in this codebase.
//   Section C: FLAGSHIP — Alice and Bob both hold independent replicas of
//              the SAME World; Alice moves a brick and Bob receives the
//              identical mutation; retransmitting the identical operation
//              produces NO second mutation; Alice's Phone, authorized as
//              her device, can operate too — until that authorization is
//              revoked, after which the SAME physical device is refused;
//              Charlie's authenticated connection cannot claim to be
//              Alice; Alice's real EDIT authority on World A does not
//              carry over to World B, which she does not own; and not one
//              accepted remote operation ever lands in the RECEIVER's own
//              local undo/redo history.
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

// Mirrors tests/MultiDeviceConversationSync.test.js's own makeDevice()
// exactly — one independent LocalIdentityProvider instance standing in
// for one physically distinct device/replica.
function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

// Mirrors tests/MultiDeviceConversationSync.test.js's own
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

// One replica's own full stack — device authorization, command registry,
// its own local World documents, and the propagation use case under
// test. Every collaborator that a real ui/main.js would wire in, wired
// the identical way.
function makeStack(device) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const documents = new Map(); // worldDocumentId -> Document
    const persisted = [];
    const applied = [];
    const rejected = [];
    const propagation = new WorldCommandPropagationUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        identityProvider: device.provider, commandRegistry,
        resolveWorldDocument: (id) => documents.get(id) || null,
        persistWorldDocument: (id, doc) => persisted.push({ id, doc })
    });
    propagation.onOperationApplied((worldDocumentId, command, authorIdentityId) => {
        applied.push({ worldDocumentId, command, authorIdentityId });
    });
    propagation.onOperationRejected((reason, envelope) => {
        rejected.push({ reason, envelope });
    });
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, commandRegistry, documents, propagation, persisted, applied, rejected };
}

function buildOneBrickWorld({ worldId, buildingId, brickId, authorIdentityId, title, position = new Position(0, 0.5, 0) }) {
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
// Section A — core/WorldOperationEnvelope.js
// ---------------------------------------------------------------------
{
    const command = { type: 'move-brick', id: 'cmd-1', worldId: 'world-1' };
    const envelope = toWorldOperationEnvelope({
        operationId: 'cmd-1', worldDocumentId: 'world-1', authorIdentityId: 'did:key:alice', command
    });
    assert(isValidWorldOperationEnvelope(envelope), '1. a well-formed envelope validates');
    assert(envelope.kind === 'OPERATION', '2. kind is the single closed OPERATION kind');

    assertThrows(() => toWorldOperationEnvelope({ worldDocumentId: 'w', authorIdentityId: 'a', command }), '3. missing operationId throws');
    assertThrows(() => toWorldOperationEnvelope({ operationId: 'o', authorIdentityId: 'a', command }), '4. missing worldDocumentId throws');
    assertThrows(() => toWorldOperationEnvelope({ operationId: 'o', worldDocumentId: 'w', command }), '5. missing authorIdentityId throws');
    assertThrows(() => toWorldOperationEnvelope({ operationId: 'o', worldDocumentId: 'w', authorIdentityId: 'a' }), '6. missing command throws');
    assertThrows(() => toWorldOperationEnvelope({ operationId: 'o', worldDocumentId: 'w', authorIdentityId: 'a', command: { no: 'type' } }), '7. a command with no type throws');

    assert(isValidWorldOperationEnvelope(null) === false, '8. null is never valid');
    assert(isValidWorldOperationEnvelope({ ...envelope, kind: 'SNAPSHOT' }) === false, '9. an unknown kind is never valid — this protocol never carries a World snapshot');
    assert(isValidWorldOperationEnvelope({ ...envelope, operationId: '' }) === false, '10. an empty operationId is never valid');
    assert(isValidWorldOperationEnvelope({ ...envelope, command: 'not-an-object' }) === false, '11. a non-object command is never valid');
    console.log('✓ Section A: core/WorldOperationEnvelope.js — closed OPERATION shape, required fields, malformed rejection');
}

// ---------------------------------------------------------------------
// Section B — WorldCommandPropagationUseCase constructor
// ---------------------------------------------------------------------
{
    const device = makeDevice('Solo');
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, { peerMessageBus, connectedPeerRegistry });
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const resolveWorldDocument = () => null;

    assertThrows(() => new WorldCommandPropagationUseCase({}), '12. no collaborators at all throws');
    assertThrows(() => new WorldCommandPropagationUseCase({ connectedPeerRegistry, deviceAuthorization: deviceAuth, identityProvider: device.provider, commandRegistry, resolveWorldDocument }), '13. missing peerMessageBus throws');
    assertThrows(() => new WorldCommandPropagationUseCase({ peerMessageBus, deviceAuthorization: deviceAuth, identityProvider: device.provider, commandRegistry, resolveWorldDocument }), '14. missing connectedPeerRegistry throws');
    assertThrows(() => new WorldCommandPropagationUseCase({ peerMessageBus, connectedPeerRegistry, identityProvider: device.provider, commandRegistry, resolveWorldDocument }), '15. missing deviceAuthorization throws');
    assertThrows(() => new WorldCommandPropagationUseCase({ peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth, commandRegistry, resolveWorldDocument }), '16. missing identityProvider throws');
    assertThrows(() => new WorldCommandPropagationUseCase({ peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth, identityProvider: device.provider, resolveWorldDocument }), '17. missing commandRegistry throws');
    assertThrows(() => new WorldCommandPropagationUseCase({ peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth, identityProvider: device.provider, commandRegistry }), '18. missing resolveWorldDocument throws');

    const solo = new WorldCommandPropagationUseCase({ peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth, identityProvider: device.provider, commandRegistry, resolveWorldDocument });
    assert(solo.broadcastCommand({ worldDocumentId: 'w', command: new MoveBrickCommand({ worldId: 'w', buildingId: 'b', brickId: 'k', delta: { x: 1, y: 0, z: 0 } }) }) !== null, '19. broadcasting with zero AUTHENTICATED peers still returns the operationId, reaches nobody, and never throws');
    assertThrows(() => solo.broadcastCommand({ worldDocumentId: 'w' }), '20. broadcastCommand() without a real Command instance throws');
    solo.dispose();
    console.log('✓ Section B: WorldCommandPropagationUseCase constructor — every collaborator required, zero-peer broadcast is safe');
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

    // World A: Alice owns it. Both Alice and Bob hold their own,
    // independent, already-loaded replicas of the identical content —
    // the same worldId/buildingId/brickId, exactly as if both had
    // previously forked/synced the same Document. Nothing about THAT
    // step is this milestone's concern; only what happens to two
    // already-converged replicas next.
    const worldAId = 'world-a', buildingAId = 'building-a', brickAId = 'brick-a';
    aliceStack.documents.set(worldAId, buildOneBrickWorld({ worldId: worldAId, buildingId: buildingAId, brickId: brickAId, authorIdentityId: alice.identity.identityId, title: "Alice's World" }));
    bobStack.documents.set(worldAId, buildOneBrickWorld({ worldId: worldAId, buildingId: buildingAId, brickId: brickAId, authorIdentityId: alice.identity.identityId, title: "Alice's World" }));

    // World B: Bob owns it. Alice has no relationship to it at all.
    const worldBId = 'world-b', buildingBId = 'building-b', brickBId = 'brick-b';
    bobStack.documents.set(worldBId, buildOneBrickWorld({ worldId: worldBId, buildingId: buildingBId, brickId: brickBId, authorIdentityId: bob.identity.identityId, title: "Bob's World" }));

    // Bob's own local CommandHistory for World A — never touched by this
    // milestone's remote application path. Proves the local/remote
    // mutation distinction structurally, not by convention.
    const bobHistoryA = new CommandHistory({ world: bobStack.documents.get(worldAId).world });

    // --- Alice <-> Bob -------------------------------------------------
    const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice', alice, 'bob-for-alice', bob);
    aliceStack.connectedPeerRegistry.add(aliceToBob);
    bobStack.connectedPeerRegistry.add(bobFromAlice);

    // Alice moves the brick LOCALLY first — exactly the "already executed
    // through the authorized local mutation chokepoint" precondition this
    // whole protocol assumes; propagation never decides local authority.
    const aliceDoc = aliceStack.documents.get(worldAId);
    const moveCommand = new MoveBrickCommand({ worldId: worldAId, buildingId: buildingAId, brickId: brickAId, delta: { x: 3, y: 0, z: 0 } });
    moveCommand.execute({ world: aliceDoc.world });
    const aliceAfterMove = brickPosition(aliceDoc, buildingAId, brickAId);
    assert(aliceAfterMove.x === 3, '21. Alice: the brick genuinely moved locally, first');

    aliceStack.propagation.broadcastCommand({ worldDocumentId: worldAId, command: moveCommand });
    await wait(20);

    const bobDoc = bobStack.documents.get(worldAId);
    assert(brickPosition(bobDoc, buildingAId, brickAId).x === 3, '22. Bob: received and applied the SAME mutation — his own independent replica now agrees with Alice\'s');
    assert(bobStack.applied.length === 1, '23. Bob: exactly one applied-operation event fired');
    assert(bobStack.applied[0].authorIdentityId === alice.identity.identityId, '24. Bob: the applied event names Alice\'s own resolved identity as author');
    assert(bobStack.persisted.length === 1 && bobStack.persisted[0].id === worldAId, '25. Bob: the durable-persistence hook was invoked for World A');
    assert(bobHistoryA.canUndo() === false && bobHistoryA.getExecutedCommands().length === 0,
        '26. Bob: his OWN CommandHistory for World A is still completely empty — a remote operation is durable World state, never a local undo-stack entry');

    // --- Idempotency: Alice retransmits the EXACT SAME operation -------
    aliceStack.propagation.broadcastCommand({ worldDocumentId: worldAId, command: moveCommand });
    await wait(20);
    assert(brickPosition(bobDoc, buildingAId, brickAId).x === 3, '27. Bob: after the retransmit, the brick is STILL at x=3 — no second mutation');
    assert(bobStack.applied.length === 1, '28. Bob: still exactly one applied event — the retransmit produced none');
    assert(bobStack.rejected.some((r) => r.reason === WorldOperationRejectionReason.DUPLICATE), '29. Bob: the retransmit was explicitly recognized and rejected as DUPLICATE');

    // --- Device semantics: Alice's Phone, authorized -------------------
    const grant = alice.provider.authorizeDevice(alice.identity.identityId, phone.identity.identityId, phone.identity.publicKey, { deviceLabel: 'Phone' });
    aliceStack.deviceAuth.broadcastAuthorization(grant); // Alice <-> Bob already connected — Bob learns it directly
    await wait(20);

    const { peerA: phoneToBob, peerB: bobFromPhone } = await connectAndAuthenticate(network, 'phone', phone, 'bob-for-phone', bob);
    phoneStack.connectedPeerRegistry.add(phoneToBob);
    bobStack.connectedPeerRegistry.add(bobFromPhone);

    const phoneMove = new MoveBrickCommand({ worldId: worldAId, buildingId: buildingAId, brickId: brickAId, delta: { x: 1, y: 0, z: 0 } });
    // The Phone never held its own replica of World A in this test —
    // only Bob's acceptance of the OPERATION matters here, so the
    // command executes against nothing locally on the Phone's side; it
    // is broadcast exactly the way a real replica that DID hold its own
    // copy would after executing it locally.
    phoneStack.propagation.broadcastCommand({ worldDocumentId: worldAId, command: phoneMove });
    await wait(20);
    assert(brickPosition(bobDoc, buildingAId, brickAId).x === 4, '30. Bob: Alice\'s Phone, an authorized DEVICE, moved the brick too — inherited authority, never a second owner record');
    assert(bobStack.applied.length === 2 && bobStack.applied[1].authorIdentityId === alice.identity.identityId,
        '31. Bob: the applied event for the Phone\'s operation still names ALICE as author, not the Phone\'s own raw device key');

    // --- Device semantics: Alice revokes the Phone ---------------------
    const revocation = alice.provider.revokeDeviceAuthorization(alice.identity.identityId, phone.identity.identityId);
    aliceStack.deviceAuth.broadcastRevocation(revocation);
    await wait(20);

    const revokedMove = new MoveBrickCommand({ worldId: worldAId, buildingId: buildingAId, brickId: brickAId, delta: { x: 1, y: 0, z: 0 } });
    phoneStack.propagation.broadcastCommand({ worldDocumentId: worldAId, command: revokedMove });
    await wait(20);
    assert(brickPosition(bobDoc, buildingAId, brickAId).x === 4, '32. Bob: after revocation, the SAME physical Phone\'s operation left the World untouched');
    assert(bobStack.applied.length === 2, '33. Bob: no third applied event — the revoked Phone\'s operation was refused');
    assert(bobStack.rejected.some((r) => r.reason === WorldOperationRejectionReason.NOT_AUTHORIZED),
        '34. Bob: the revoked Phone\'s operation was explicitly rejected NOT_AUTHORIZED — zero code here ever asked "was this revoked," it just asked the same authorization question again');

    // --- Cross-world security: Alice has no authority over World B -----
    const worldBMove = new MoveBrickCommand({ worldId: worldBId, buildingId: buildingBId, brickId: brickBId, delta: { x: 5, y: 0, z: 0 } });
    aliceStack.propagation.broadcastCommand({ worldDocumentId: worldBId, command: worldBMove });
    await wait(20);
    const worldBDoc = bobStack.documents.get(worldBId);
    assert(brickPosition(worldBDoc, buildingBId, brickBId).x === 0, '35. Bob: World B is byte-identical — Alice\'s real EDIT authority on World A grants her nothing on World B');
    assert(bobStack.rejected.some((r) => r.reason === WorldOperationRejectionReason.NOT_AUTHORIZED && r.envelope.worldDocumentId === worldBId),
        '36. Bob: the World B operation was explicitly rejected NOT_AUTHORIZED');

    // --- Replay protection: an operation for a World Bob never loaded --
    const unknownMove = new MoveBrickCommand({ worldId: 'world-unknown', buildingId: 'x', brickId: 'y', delta: { x: 1, y: 0, z: 0 } });
    aliceStack.propagation.broadcastCommand({ worldDocumentId: 'world-unknown', command: unknownMove });
    await wait(20);
    assert(bobStack.rejected.some((r) => r.reason === WorldOperationRejectionReason.UNKNOWN_WORLD),
        '37. Bob: an operation naming a World he has no local replica of is refused, never silently creates one');

    // --- Identity spoofing: Charlie cannot claim to be Alice -----------
    const { peerA: charlieToBob, peerB: bobFromCharlie } = await connectAndAuthenticate(network, 'charlie', charlie, 'bob-for-charlie', bob);
    charlieStack.connectedPeerRegistry.add(charlieToBob);
    bobStack.connectedPeerRegistry.add(bobFromCharlie);

    const forgedCommand = new MoveBrickCommand({ worldId: worldAId, buildingId: buildingAId, brickId: brickAId, delta: { x: 99, y: 0, z: 0 } });
    const forgedEnvelope = toWorldOperationEnvelope({
        operationId: forgedCommand.id,
        worldDocumentId: worldAId,
        authorIdentityId: alice.identity.identityId, // Charlie CLAIMS to be Alice
        command: forgedCommand.toJSON()
    });
    charlieStack.peerMessageBus.send(charlieToBob, WorldCommandPropagationUseCase.DEFAULT_PROTOCOL, forgedEnvelope);
    await wait(20);
    assert(brickPosition(bobDoc, buildingAId, brickAId).x === 4, '38. Bob: World A is untouched — Charlie\'s authenticated connection could not make itself Alice merely by claiming to be her');
    assert(bobStack.rejected.some((r) => r.reason === WorldOperationRejectionReason.IDENTITY_MISMATCH),
        '39. Bob: the forged envelope was explicitly rejected IDENTITY_MISMATCH');

    // --- Final CommandHistory isolation check, after everything -------
    assert(bobHistoryA.canUndo() === false && bobHistoryA.getExecutedCommands().length === 0,
        '40. Bob: after every accepted AND every refused remote operation, his own local undo/redo history for World A is STILL completely empty');

    aliceStack.propagation.dispose();
    bobStack.propagation.dispose();
    phoneStack.propagation.dispose();
    charlieStack.propagation.dispose();

    console.log('✓ Section C FLAGSHIP: idempotent propagation, device-aware authority, revocation isolation, cross-World rejection, replay protection, identity-spoofing refusal, and undo-stack isolation — all against real authenticated peer connections');
}

}

runTests().then(() => {
    console.log('\n✓ All WorldCommandPropagation tests passed');
}).catch((error) => {
    console.error('\n✗ WorldCommandPropagation tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
