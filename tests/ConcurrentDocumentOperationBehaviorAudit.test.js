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

// 0.9.225 — Concurrent Document Operation Behavior Audit.
//
// 0.9.222 built the trust boundary, 0.9.223 built the explicit
// application seam, 0.9.224 wired both into the real EditorSession
// runtime. All three deliberately left ordering/concurrency unbuilt and
// unanalyzed — 0.9.224's own Recommendation named this exact milestone:
// "audit ACTUAL behavior under concurrent/out-of-order edits against
// this real runtime before deciding whether to reach for logical
// clocks, conflict detection, or something simpler."
//
// This file is that audit, and ONLY that audit. It is TEST-ONLY —
// nothing in application/, core/, peer/, or replication/ changes as
// part of this milestone. It never reopens DocumentCommandPropagationUseCase
// or RemoteDocumentOperationApplicationUseCase, never adds a clock, a
// queue, conflict detection, or any new layer over replication/ReplayGuard.js
// — every delivery in this file goes through the REAL, unmodified
// broadcastCommand()/onOperationReceived()/apply()/attachToPropagation()
// chain those three milestones already built, exactly as EditorSession
// already composes it. The only thing this file controls that a real
// running Editor wouldn't let a user control directly is WHEN and IN
// WHAT ORDER broadcastCommand() is called — the deliberate knob needed
// to observe both delivery orders of the same pair of operations
// against fresh, otherwise-identical replicas.
//
// Topology: one owner identity, Alice, with two authorized devices
// (Alice-Laptop, Alice-Phone — see 0.9.222's own header: "multiple
// authorized editors," for an Editor document with no membership-grant
// model, means one owner's own several devices, never a second,
// independent identity). Alice-Laptop is connected ONLY to Bob;
// Alice-Phone is connected ONLY to Charlie. This is a deliberate test
// topology choice, not a product constraint: it gives this file two
// INDEPENDENT delivery channels (one per receiving replica) so the
// exact same pair of operations can be sent to Bob and to Charlie in
// two different orders without one channel's delivery leaking onto the
// other receiver's connection and silently pre-empting the ordering
// this file means to control. Bob and Charlie are themselves ordinary
// receiving replicas — never authors — mirroring the FLAGSHIP shape of
// every one of 0.9.222/0.9.223/0.9.224's own test files: a receiver's
// own CommandHistory, fed exclusively through the real propagation +
// application seam.
//
// Every receiving replica's own `resolveDocument` mirrors
// ui/views/EditorView.js's own 0.9.224 wiring exactly: it answers ONLY
// for whichever document is that replica's CURRENT target right now
// (never a Map of every document ever seen) — the same "one document
// open at a time" characterization 0.9.224 named for the real Editor.
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

// Mirrors tests/RemoteDocumentOperationApplication.test.js's own
// makeDevice() exactly.
function makeDevice(label) {
    const provider = new LocalIdentityProvider(new InMemoryStorageProvider());
    const identity = provider.createLocalIdentity(label);
    provider.authenticate(identity.identityId);
    return { provider, identity };
}

// Mirrors tests/RemoteDocumentOperationApplication.test.js's own
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

// A pure SENDER stack: broadcasts operations, never receives any (never
// connected to anything that would send it one in this file). Mirrors
// the collaborators tests/EditorRuntimeCollaboration.test.js's own
// makeEditorRuntimeStack() assembles for the outgoing half only.
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

// A receiving replica: real DocumentCommandPropagationUseCase (0.9.222)
// + real RemoteDocumentOperationApplicationUseCase#attachToPropagation()
// (0.9.223), `resolveDocument` bound to a MUTABLE `target` this file
// reassigns per section/document-switch — the exact one-current-document
// shape ui/views/EditorView.js wires for the real Editor (0.9.224).
function makeReceiverStack(device) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const received = [];
    const rejected = [];
    const state = { target: null }; // { documentId, document, commandHistory }
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

function buildBaseDocument({ worldId, authorIdentityId, title, groupName = 'Original' }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: 'building-x' });
    building.addBrick(new Brick({ id: 'brick-a', definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    building.addBrick(new Brick({ id: 'brick-b', definitionId: 'core:cube', position: new Position(10, 0.5, 0) }));
    world.addBuilding(building);
    world.addGroup(new Group({ id: 'group-1', name: groupName, brickIds: ['brick-a', 'brick-b'] }));
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'owner', authorIdentityId }) });
}

// Fresh, independent replica of a document: its own CommandHistory, its
// own World instance, so mutating one never touches the other. Sets
// `replica.state.target` to this new document, mirroring a document
// load/open in the real Editor.
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

const evidence = [];
function record(scenario, deliveryOrder, result) {
    evidence.push({ scenario, deliveryOrder, result });
}

async function runTests() {

const network = new LocalPeerNetwork();
const aliceLaptop = makeDevice('Alice-Laptop');
const alicePhone = makeDevice('Alice-Phone');
const bobDevice = makeDevice('Bob');
const charlieDevice = makeDevice('Charlie');

const laptopStack = makeSenderStack(aliceLaptop);
const phoneStack = makeSenderStack(alicePhone);
const bob = makeReceiverStack(bobDevice);
const charlie = makeReceiverStack(charlieDevice);

// Alice-Laptop <-> Bob (Bob's ONLY connection in this file).
const { peerA: laptopToBob, peerB: bobFromLaptop } = await connectAndAuthenticate(network, 'alice-laptop', aliceLaptop, 'bob', bobDevice);
laptopStack.connectedPeerRegistry.add(laptopToBob);
bob.connectedPeerRegistry.add(bobFromLaptop);

// Alice-Phone <-> Charlie (Charlie's ONLY connection in this file).
const { peerA: phoneToCharlie, peerB: charlieFromPhone } = await connectAndAuthenticate(network, 'alice-phone', alicePhone, 'charlie', charlieDevice);
phoneStack.connectedPeerRegistry.add(phoneToCharlie);
charlie.connectedPeerRegistry.add(charlieFromPhone);

// Alice-Phone is an authorized DEVICE of Alice-Laptop's identity — the
// same real multi-device grant 0.9.223's own flagship exercised. Bob
// never needs to know this (Alice-Laptop's identity IS the document
// owner directly). Charlie DOES need to know it, to authorize
// Alice-Phone's operations against Charlie's own copy of Alice's
// document — and Charlie has no connection to Alice-Laptop at all, so
// the grant must reach Charlie over the ONE connection Charlie actually
// has: Alice-Phone's own. `broadcastAuthorization()` trusts the
// record's OWN signature, never who relayed it (see
// application/DeviceAuthorizationPropagationUseCase.js's own header) —
// a device broadcasting the grant that names itself is exactly as valid
// as the parent identity broadcasting it, so this is real production
// behavior, not a test shortcut.
const grant = aliceLaptop.provider.authorizeDevice(
    aliceLaptop.identity.identityId, alicePhone.identity.identityId, alicePhone.identity.publicKey,
    { deviceLabel: 'Alice-Phone' }
);
phoneStack.deviceAuth.broadcastAuthorization(grant);
await wait(20);

let docCounter = 0;
function nextWorldId(label) { docCounter += 1; return `doc-${label}-${docCounter}`; }

// ===================================================================
// Section A — Sequential remote operations (baseline)
// ===================================================================
{
    const worldId = nextWorldId('a');
    openReplicaDocument(bob, worldId, aliceLaptop.identity.identityId, 'Section A');

    const o1 = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 3, y: 0, z: 0 } });
    const o2 = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 2, y: 0, z: 0 } });

    laptopStack.propagation.broadcastCommand({ documentId: worldId, command: o1 });
    await wait(20);
    laptopStack.propagation.broadcastCommand({ documentId: worldId, command: o2 });
    await wait(20);

    assert(brickX(bob.state.target.document) === 5, '1. Bob: O1 then O2 applied in the order sent, 0+3+2=5');
    assert(JSON.stringify(commandIds(bob.state.target.commandHistory)) === JSON.stringify([o1.id, o2.id]),
        '2. Bob: CommandHistory order matches arrival order exactly (O1 before O2)');

    record('A: sequential O1->O2 (independent-author baseline)', 'O1, O2', `x=5, history=[O1,O2]`);
    console.log('✓ Section A: sequential delivery in send order is the baseline — CommandHistory order == arrival order == send order');
}

// ===================================================================
// Section B — Reverse delivery order
// ===================================================================
{
    const worldId = nextWorldId('b');
    openReplicaDocument(charlie, worldId, aliceLaptop.identity.identityId, 'Section B');

    // Same shape as Section A's O1/O2 (same deltas), fresh instances so
    // undo-state isn't shared with Section A's own already-executed
    // commands.
    const o1 = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 3, y: 0, z: 0 } });
    const o2 = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 2, y: 0, z: 0 } });

    // Deliberately reversed: O2 is SENT (and arrives) before O1.
    phoneStack.propagation.broadcastCommand({ documentId: worldId, command: o2 });
    await wait(20);
    phoneStack.propagation.broadcastCommand({ documentId: worldId, command: o1 });
    await wait(20);

    assert(brickX(charlie.state.target.document) === 5,
        '3. Charlie: reversed delivery (O2 then O1) reaches the SAME numeric value (5) as Section A\'s forward delivery — MoveBrickCommand\'s delta-relative execute() commutes for this pair');
    assert(JSON.stringify(commandIds(charlie.state.target.commandHistory)) === JSON.stringify([o2.id, o1.id]),
        '4. Charlie: CommandHistory order tracks ARRIVAL order, not any causal/send-time order — O2 sits before O1 because it arrived first');

    // The value converged, but the UNDO stack did not: undoing "the top"
    // undoes O1 (the operation that happens to have arrived LAST here),
    // never O2 — a deliberate, honest characterization, not a bug. On
    // Bob's own replica (Section A), the top was O2. Two replicas that
    // reached the identical VALUE disagree about what "undo" means next.
    assert(charlie.state.target.commandHistory.getUndoLabel() === 'Undo Move Brick',
        '5. Charlie: the undo label exists (something is undoable) — this codebase has no per-operation undo label distinct enough to name WHICH move it is, so this assertion only confirms undo is available, not which operation it targets');
    charlie.state.target.commandHistory.undo();
    assert(brickX(charlie.state.target.document) === 2,
        '6. Charlie: undo() removed O1 (arrived last on Charlie), leaving O2\'s own effect (+2) alone — value-convergence and undo-stack-convergence are two DIFFERENT claims, and only the first held here');
    charlie.state.target.commandHistory.redo();
    assert(brickX(charlie.state.target.document) === 5, '7. Charlie: redo restores 5');

    record('B: reversed O2->O1 (same pair as A)', 'O2, O1', 'x=5 (same value as A), history=[O2,O1] (reversed vs A)');
    console.log('✓ Section B: reversed delivery of the SAME operation pair converges on the SAME numeric value as forward delivery, but leaves a DIFFERENT, reversed CommandHistory/undo-stack ordering — value convergence and undo-order convergence are not the same guarantee');
}

// ===================================================================
// Section C — Concurrent independent operations
// ===================================================================
{
    const worldIdBob = nextWorldId('c-bob');
    const worldIdCharlie = nextWorldId('c-charlie');
    openReplicaDocument(bob, worldIdBob, aliceLaptop.identity.identityId, 'Section C (Bob)');
    openReplicaDocument(charlie, worldIdCharlie, aliceLaptop.identity.identityId, 'Section C (Charlie)');

    // Two operations touching DISJOINT state: brick-a and brick-b are
    // independent bricks in the same World.
    const onA_bob = new MoveBrickCommand({ worldId: worldIdBob, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 4, y: 0, z: 0 } });
    const onB_bob = new MoveBrickCommand({ worldId: worldIdBob, buildingId: 'building-x', brickId: 'brick-b', delta: { x: 5, y: 0, z: 0 } });
    const onA_charlie = new MoveBrickCommand({ worldId: worldIdCharlie, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 4, y: 0, z: 0 } });
    const onB_charlie = new MoveBrickCommand({ worldId: worldIdCharlie, buildingId: 'building-x', brickId: 'brick-b', delta: { x: 5, y: 0, z: 0 } });

    // Bob: A then B. Charlie: B then A. Same starting state, same two
    // operations, opposite order.
    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: onA_bob });
    await wait(20);
    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: onB_bob });
    await wait(20);

    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: onB_charlie });
    await wait(20);
    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: onA_charlie });
    await wait(20);

    assert(brickX(bob.state.target.document, 'brick-a') === 4 && brickX(bob.state.target.document, 'brick-b') === 15,
        '8. Bob (A then B): brick-a=4 (0+4), brick-b=15 (10+5)');
    assert(brickX(charlie.state.target.document, 'brick-a') === 4 && brickX(charlie.state.target.document, 'brick-b') === 15,
        '9. Charlie (B then A): IDENTICAL final state to Bob\'s — brick-a=4, brick-b=15');

    record('C: independent objects, A/B on disjoint bricks', 'A,B vs B,A', 'both replicas converge (x_a=4, x_b=15) — order-independent for this pair');
    console.log('✓ Section C: two operations on DISJOINT state commute regardless of delivery order — real evidence that some operations already converge naturally, without any ordering mechanism. This is evidence about THIS pair, not a general commutativity guarantee.');
}

// ===================================================================
// Section D — Concurrent conflicting operations (the central question)
// ===================================================================
{
    // D1 — an ABSOLUTE-SET property on the SAME target: renaming the
    // SAME group to two different names. This is the genuinely
    // non-commuting case the milestone asked for.
    const worldIdBob = nextWorldId('d1-bob');
    const worldIdCharlie = nextWorldId('d1-charlie');
    openReplicaDocument(bob, worldIdBob, aliceLaptop.identity.identityId, 'Section D1 (Bob)');
    openReplicaDocument(charlie, worldIdCharlie, aliceLaptop.identity.identityId, 'Section D1 (Charlie)');

    const renameA_bob = new RenameGroupCommand({ worldId: worldIdBob, groupId: 'group-1', name: 'Renamed-By-Laptop' });
    const renameB_bob = new RenameGroupCommand({ worldId: worldIdBob, groupId: 'group-1', name: 'Renamed-By-Phone' });
    const renameA_charlie = new RenameGroupCommand({ worldId: worldIdCharlie, groupId: 'group-1', name: 'Renamed-By-Laptop' });
    const renameB_charlie = new RenameGroupCommand({ worldId: worldIdCharlie, groupId: 'group-1', name: 'Renamed-By-Phone' });

    // Bob's only connection is Alice-Laptop's — both of "Laptop's" and
    // "Phone's" conceptual edits must ride that one channel to reach
    // him at all (see this file's own header on the segregated-channel
    // topology). Bob: Laptop-authored rename, then Phone-authored
    // rename, both delivered via the channel Bob actually has.
    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: renameA_bob });
    await wait(20);
    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: renameB_bob });
    await wait(20);

    // Charlie's only connection is Alice-Phone's. Charlie: the SAME two
    // renames, opposite order, both via the channel Charlie actually has.
    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: renameB_charlie });
    await wait(20);
    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: renameA_charlie });
    await wait(20);

    assert(groupName(bob.state.target.document) === 'Renamed-By-Phone',
        '10. Bob (Laptop-rename then Phone-rename): final name is Phone\'s — plain last-applied-wins, because CommandHistory.execute() only ever knows "what happened most recently on THIS replica"');
    assert(groupName(charlie.state.target.document) === 'Renamed-By-Laptop',
        '11. Charlie (Phone-rename then Laptop-rename): final name is Laptop\'s — the SAME TWO renames, opposite order, DIVERGENT final state');
    assert(groupName(bob.state.target.document) !== groupName(charlie.state.target.document),
        '12. Bob and Charlie hold PERMANENTLY DIFFERENT names for the same group after seeing the identical two operations — genuine, real divergence, not a hypothetical one. Nothing today detects or reconciles this.');

    // Undo on Bob restores whatever preceded the LAST-arriving rename on
    // BOB'S OWN replica (Laptop's name) — locally correct, still no
    // notion that Charlie disagrees.
    bob.state.target.commandHistory.undo();
    assert(groupName(bob.state.target.document) === 'Renamed-By-Laptop',
        '13. Bob: undo() correctly restores the PRE-Phone-rename name it itself observed — undo is locally sound; it says nothing about, and does nothing to, Charlie\'s divergent state');

    record('D1: conflicting renames of the SAME group (absolute-set)', 'Laptop,Phone vs Phone,Laptop', 'DIVERGENT: Bob="Renamed-By-Phone", Charlie="Renamed-By-Laptop" — last-applied-wins, per replica');

    // D2 — the SAME two devices, but a RELATIVE-DELTA command
    // (MoveBrickCommand) on the SAME brick, as a deliberate contrast. A
    // shared TARGET is not automatically a "conflict": whether an
    // operation pair commutes depends on the command's own semantics
    // (relative delta vs. absolute set), never merely on "do they touch
    // the same object."
    const worldIdBob2 = nextWorldId('d2-bob');
    const worldIdCharlie2 = nextWorldId('d2-charlie');
    openReplicaDocument(bob, worldIdBob2, aliceLaptop.identity.identityId, 'Section D2 (Bob)');
    openReplicaDocument(charlie, worldIdCharlie2, aliceLaptop.identity.identityId, 'Section D2 (Charlie)');

    const moveA_bob = new MoveBrickCommand({ worldId: worldIdBob2, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 3, y: 0, z: 0 } });
    const moveB_bob = new MoveBrickCommand({ worldId: worldIdBob2, buildingId: 'building-x', brickId: 'brick-a', delta: { x: -1, y: 0, z: 0 } });
    const moveA_charlie = new MoveBrickCommand({ worldId: worldIdCharlie2, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 3, y: 0, z: 0 } });
    const moveB_charlie = new MoveBrickCommand({ worldId: worldIdCharlie2, buildingId: 'building-x', brickId: 'brick-a', delta: { x: -1, y: 0, z: 0 } });

    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob2, command: moveA_bob });
    await wait(20);
    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob2, command: moveB_bob });
    await wait(20);

    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie2, command: moveB_charlie });
    await wait(20);
    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie2, command: moveA_charlie });
    await wait(20);

    assert(brickX(bob.state.target.document) === 2 && brickX(charlie.state.target.document) === 2,
        '14. Bob and Charlie: the SAME two SAME-BRICK moves, opposite order, converge to the IDENTICAL value (0+3-1 == 0-1+3 == 2) — same target, but commuting semantics, because the command is delta-relative');

    record('D2: same-brick relative moves (contrast with D1)', 'Laptop,Phone vs Phone,Laptop', 'CONVERGENT: both x=2 — same target, but commutes (delta-relative, unlike D1\'s absolute-set rename)');
    console.log('✓ Section D: the SAME target does not by itself mean "conflicting" — an absolute-set command (rename) on a shared property diverges by delivery order (D1); a relative-delta command (move) on the very same brick still commutes (D2). Divergence is a property of the COMMAND\'S semantics, not merely of shared identity.');
}

// ===================================================================
// Section E — Same operation delivered to multiple replicas
// ===================================================================
{
    const worldIdBob = nextWorldId('e-bob');
    const worldIdCharlie = nextWorldId('e-charlie');
    openReplicaDocument(bob, worldIdBob, aliceLaptop.identity.identityId, 'Section E (Bob)');
    openReplicaDocument(charlie, worldIdCharlie, aliceLaptop.identity.identityId, 'Section E (Charlie)');

    // The identical operation CONTENT (same delta, same command shape),
    // delivered independently to Bob (via Laptop) and Charlie (via
    // Phone) — this harness keeps each receiver on its own channel (see
    // this file's own header), so "delivered to multiple replicas" is
    // proven by identical CONTENT and identical resulting state, not by
    // one literal wire fan-out.
    const move_bob = new MoveBrickCommand({ worldId: worldIdBob, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 7, y: 0, z: 0 } });
    const move_charlie = new MoveBrickCommand({ worldId: worldIdCharlie, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 7, y: 0, z: 0 } });

    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: move_bob });
    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: move_charlie });
    await wait(20);

    assert(brickX(bob.state.target.document) === 7 && brickX(charlie.state.target.document) === 7,
        '15. Bob and Charlie: the identical operation produces the identical resulting state on both replicas');

    record('E: identical operation to two replicas', 'simultaneous', 'both converge (x=7) — baseline equivalence before Section F\'s divergence');
    console.log('✓ Section E: the same operation applied to two independent, identically-started replicas produces identical state — the trivial baseline Section F\'s divergence is contrasted against');
}

// ===================================================================
// Section F — Different operation delivery histories
// ===================================================================
{
    const worldIdBob = nextWorldId('f-bob');
    const worldIdCharlie = nextWorldId('f-charlie');
    openReplicaDocument(bob, worldIdBob, aliceLaptop.identity.identityId, 'Section F (Bob)');
    openReplicaDocument(charlie, worldIdCharlie, aliceLaptop.identity.identityId, 'Section F (Charlie)');

    // A shared O1, then Bob ALSO gets O2 while Charlie ALSO gets O3 — a
    // genuinely different history per replica, not merely a different
    // ORDER of the same set.
    const o1_bob = new MoveBrickCommand({ worldId: worldIdBob, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 1, y: 0, z: 0 } });
    const o2_bob = new MoveBrickCommand({ worldId: worldIdBob, buildingId: 'building-x', brickId: 'brick-b', delta: { x: 2, y: 0, z: 0 } });
    const o1_charlie = new MoveBrickCommand({ worldId: worldIdCharlie, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 1, y: 0, z: 0 } });
    const o3_charlie = new MoveBrickCommand({ worldId: worldIdCharlie, buildingId: 'building-x', brickId: 'brick-b', delta: { x: 9, y: 0, z: 0 } });

    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: o1_bob });
    await wait(20);
    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: o2_bob });
    await wait(20);

    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: o1_charlie });
    await wait(20);
    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: o3_charlie });
    await wait(20);

    assert(brickX(bob.state.target.document, 'brick-b') === 12 && brickX(charlie.state.target.document, 'brick-b') === 19,
        '16. Bob (O1,O2) and Charlie (O1,O3) end up with DIFFERENT brick-b positions (12 vs 19) — they simply never received the same set of operations');
    assert(brickX(bob.state.target.document, 'brick-a') === 1 && brickX(charlie.state.target.document, 'brick-a') === 1,
        '17. brick-a (touched only by the SHARED O1) agrees on both — the divergence is exactly, and only, in what each replica was actually told');
    assert(bob.state.target.commandHistory.getExecutedCommands().length === 2 && charlie.state.target.commandHistory.getExecutedCommands().length === 2,
        '18. Neither replica has any awareness it is missing an operation the other received — no error, no gap indicator, nothing');

    record('F: different histories (O1,O2) vs (O1,O3)', 'divergent op sets', 'DIVERGENT by construction — no mechanism exists today to detect a replica is missing an operation another replica has, let alone reconcile it');
    console.log('✓ Section F: replicas that receive genuinely different operation sets diverge, silently — there is no anti-entropy, gap-detection, or reconciliation mechanism anywhere in this codebase today. This is the sharpest evidence that "collaboration" so far means "propagation," never "eventual consistency."');
}

// ===================================================================
// Section G — Local edit interleaved with remote edit
// ===================================================================
{
    // G1: Bob's own local edit first, remote arrives second.
    const worldId1 = nextWorldId('g-local-first');
    const target1 = openReplicaDocument(bob, worldId1, aliceLaptop.identity.identityId, 'Section G1');
    const local1 = new MoveBrickCommand({ worldId: worldId1, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 1, y: 0, z: 0 } });
    // A "local edit" is simply CommandHistory#execute() called directly
    // — the SAME chokepoint apply() itself uses. This is the whole
    // point of 0.9.224's own wiring: EditorSession never distinguishes
    // the two paths once a Command reaches this method.
    target1.commandHistory.execute(local1);
    const remote1 = new MoveBrickCommand({ worldId: worldId1, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 10, y: 0, z: 0 } });
    laptopStack.propagation.broadcastCommand({ documentId: worldId1, command: remote1 });
    await wait(20);

    assert(brickX(target1.document) === 11, '19. Bob (local then remote): 0+1+10=11');
    assert(JSON.stringify(commandIds(target1.commandHistory)) === JSON.stringify([local1.id, remote1.id]),
        '20. Bob: the local edit and the remote operation sit on the SAME CommandHistory stack, in the order they actually executed — no special precedence for either origin');

    // G2: remote arrives first, Bob's own local edit second.
    const worldId2 = nextWorldId('g-remote-first');
    const target2 = openReplicaDocument(bob, worldId2, aliceLaptop.identity.identityId, 'Section G2');
    const remote2 = new MoveBrickCommand({ worldId: worldId2, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 10, y: 0, z: 0 } });
    laptopStack.propagation.broadcastCommand({ documentId: worldId2, command: remote2 });
    await wait(20);
    const local2 = new MoveBrickCommand({ worldId: worldId2, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 1, y: 0, z: 0 } });
    target2.commandHistory.execute(local2);

    assert(brickX(target2.document) === 11, '21. Bob (remote then local): 0+10+1=11 — same final value as G1, order-independent for this pair');
    assert(JSON.stringify(commandIds(target2.commandHistory)) === JSON.stringify([remote2.id, local2.id]),
        '22. Bob: stack order mirrors ARRIVAL/EXECUTION order (remote first this time) — confirms the chokepoint is origin-blind, not merely coincidentally so');

    record('G: local + remote interleaving', 'local->remote vs remote->local', 'both converge (x=11); CommandHistory ordering always == execution order, regardless of origin');
    console.log('✓ Section G: local and remote operations share ONE undo stack with no origin tag — CommandHistory#execute() genuinely cannot tell, and does not try to tell, a local edit from an applied remote one');
}

// ===================================================================
// Section H — Undo/Redo interaction
// ===================================================================
{
    // H1: a remote operation, applied, then undone locally by Bob.
    // Verify (a) Bob's own state reverts correctly, and (b) Charlie —
    // who received the SAME operation — is completely unaffected by
    // Bob's local undo, because undo() never broadcasts anything
    // (CommandHistory#undo() publishes COMMAND_UNDONE, which
    // DocumentCommandPropagationUseCase#attachCommandHistory() never
    // subscribes to — see that method's own header).
    const worldIdBob = nextWorldId('h1-bob');
    const worldIdCharlie = nextWorldId('h1-charlie');
    const bobTarget = openReplicaDocument(bob, worldIdBob, aliceLaptop.identity.identityId, 'Section H1 (Bob)');
    const charlieTarget = openReplicaDocument(charlie, worldIdCharlie, aliceLaptop.identity.identityId, 'Section H1 (Charlie)');

    const shared = new MoveBrickCommand({ worldId: worldIdBob, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 6, y: 0, z: 0 } });
    const sharedForCharlie = new MoveBrickCommand({ worldId: worldIdCharlie, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 6, y: 0, z: 0 } });
    laptopStack.propagation.broadcastCommand({ documentId: worldIdBob, command: shared });
    phoneStack.propagation.broadcastCommand({ documentId: worldIdCharlie, command: sharedForCharlie });
    await wait(20);

    assert(brickX(bobTarget.document) === 6 && brickX(charlieTarget.document) === 6, '23. both replicas applied the shared operation identically');

    bobTarget.commandHistory.undo();
    assert(brickX(bobTarget.document) === 0, '24. Bob: undoing the applied remote operation reverts HIS OWN state to pre-operation');
    assert(brickX(charlieTarget.document) === 6,
        '25. Charlie: entirely unaffected by Bob\'s local undo — undo is LOCAL-ONLY, never propagated. Two replicas that just converged (Section E-style) can immediately re-diverge the moment either one undoes locally, and neither replica is ever told.');
    bobTarget.commandHistory.redo();
    assert(brickX(bobTarget.document) === 6, '26. Bob: redo restores the applied remote operation');

    // H2: local + remote interleave, then undo twice — undo() only ever
    // looks at "what is on top of MY OWN stack," origin-blind, exactly
    // as Section G characterized.
    const worldId2 = nextWorldId('h2');
    const target2 = openReplicaDocument(bob, worldId2, aliceLaptop.identity.identityId, 'Section H2');
    const local = new MoveBrickCommand({ worldId: worldId2, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 1, y: 0, z: 0 } });
    target2.commandHistory.execute(local);
    const remote = new MoveBrickCommand({ worldId: worldId2, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 10, y: 0, z: 0 } });
    laptopStack.propagation.broadcastCommand({ documentId: worldId2, command: remote });
    await wait(20);
    assert(brickX(target2.document) === 11, '27. Bob: local(+1) then remote(+10) = 11');

    target2.commandHistory.undo();
    assert(brickX(target2.document) === 1, '28. Bob: first undo() removes the REMOTE operation (it executed last, and undo has no origin awareness) — back to the local-only value');
    target2.commandHistory.undo();
    assert(brickX(target2.document) === 0, '29. Bob: second undo() removes the local operation too — fully unwound, in strict reverse-execution order');

    record('H: undo/redo of applied remote operations', 'apply then local undo', 'undo is local-only and origin-blind: it reverts the undoing replica\'s own state, never propagates, and never distinguishes local from remote on its own stack');
    console.log('✓ Section H: an applied remote operation is undoable/redoable through the SAME local mechanism a local edit uses, but undo() is purely local — it neither propagates nor is aware other replicas exist. This is the concrete shape of "no synchronized undo" the prior three milestones already flagged as unbuilt.');
}

// ===================================================================
// Section I — Document isolation under concurrency (interleaved, not
// just switched)
// ===================================================================
{
    const worldX = nextWorldId('i-x');
    const worldY = nextWorldId('i-y');
    const docX = buildBaseDocument({ worldId: worldX, authorIdentityId: aliceLaptop.identity.identityId, title: 'Section I - X' });
    const docY = buildBaseDocument({ worldId: worldY, authorIdentityId: aliceLaptop.identity.identityId, title: 'Section I - Y' });
    const targetX = { documentId: worldX, document: docX, commandHistory: new CommandHistory({ world: docX.world }) };
    const targetY = { documentId: worldY, document: docY, commandHistory: new CommandHistory({ world: docY.world }) };

    // Bob is looking at X throughout this section — exactly the single
    // "current document" constraint 0.9.224 named for the real Editor
    // (see this file's own header on resolveDocument).
    bob.state.target = targetX;

    const x1 = new MoveBrickCommand({ worldId: worldX, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 2, y: 0, z: 0 } });
    const y1 = new MoveBrickCommand({ worldId: worldY, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 100, y: 0, z: 0 } });
    const x2 = new MoveBrickCommand({ worldId: worldX, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 3, y: 0, z: 0 } });
    const y2 = new MoveBrickCommand({ worldId: worldY, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 200, y: 0, z: 0 } });

    // Genuinely interleaved arrival — X, Y, X, Y — never a simple
    // switch-away-then-switch-back.
    laptopStack.propagation.broadcastCommand({ documentId: worldX, command: x1 });
    await wait(20);
    laptopStack.propagation.broadcastCommand({ documentId: worldY, command: y1 });
    await wait(20);
    laptopStack.propagation.broadcastCommand({ documentId: worldX, command: x2 });
    await wait(20);
    laptopStack.propagation.broadcastCommand({ documentId: worldY, command: y2 });
    await wait(20);

    assert(brickX(targetX.document) === 5, '30. X: 0+2+3=5 — only the X-addressed operations ever touched it');
    assert(targetX.commandHistory.getExecutedCommands().length === 2, '31. X: exactly two applied operations (x1, x2)');
    assert(brickX(targetY.document) === 0, '32. Y: completely untouched (still baseline 0) despite two operations for Y arriving WHILE X was interleaved between them');
    assert(targetY.commandHistory.getExecutedCommands().length === 0, '33. Y: zero applied operations — y1/y2 were refused at the trust boundary, never queued');
    assert(bob.rejected.filter((r) => r.reason === DocumentOperationRejectionReason.UNKNOWN_DOCUMENT).length === 2,
        '34. exactly y1 and y2 were rejected UNKNOWN_DOCUMENT — the interleaving never confused an X operation for a Y one or vice versa');

    // Switching to Y now: the two earlier refusals were genuinely
    // forgotten, never queued for replay.
    bob.state.target = targetY;
    const y3 = new MoveBrickCommand({ worldId: worldY, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 5, y: 0, z: 0 } });
    laptopStack.propagation.broadcastCommand({ documentId: worldY, command: y3 });
    await wait(20);
    assert(brickX(targetY.document) === 5, '35. Y: 0+5=5 (never 0+100+200+5) — y1/y2 are permanently gone, not replayed on switch-back');
    assert(targetY.commandHistory.getExecutedCommands().length === 1, '36. Y: exactly one applied operation total');

    record('I: interleaved concurrent operations across two documents', 'X,Y,X,Y (interleaved)', 'isolation holds under interleaving, identical to the sequential-switch case 0.9.223/0.9.224 already proved — refused operations are forgotten, never queued, regardless of interleaving pattern');
    console.log('✓ Section I: document isolation survives genuinely interleaved concurrent delivery across two documents, not merely a sequential switch — same guarantee, stronger evidence');
}

// ===================================================================
// Section J — Operation identity / ReplayGuard
// ===================================================================
{
    const worldId = nextWorldId('j');
    const target = openReplicaDocument(bob, worldId, aliceLaptop.identity.identityId, 'Section J');

    const o1 = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 4, y: 0, z: 0 } });

    // O1 -> Bob, O1 -> Bob (identical operationId, retransmitted).
    laptopStack.propagation.broadcastCommand({ documentId: worldId, command: o1 });
    await wait(20);
    assert(brickX(target.document) === 4 && target.commandHistory.getExecutedCommands().length === 1,
        '37. O1 applied exactly once');
    laptopStack.propagation.broadcastCommand({ documentId: worldId, command: o1 });
    await wait(20);
    assert(brickX(target.document) === 4 && target.commandHistory.getExecutedCommands().length === 1,
        '38. Retransmitting the SAME operationId is rejected by the existing ReplayGuard (replication/ReplayGuard.js, consumed inside DocumentCommandPropagationUseCase — never a second guard) — still exactly one application');
    assert(bob.rejected.some((r) => r.reason === DocumentOperationRejectionReason.DUPLICATE),
        '39. the retransmission was explicitly rejected DUPLICATE, not merely silently ignored');

    // O1, O2, O1 -> must remain [O1, O2], never [O1, O2, O1].
    const o2 = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 2, y: 0, z: 0 } });
    laptopStack.propagation.broadcastCommand({ documentId: worldId, command: o2 });
    await wait(20);
    laptopStack.propagation.broadcastCommand({ documentId: worldId, command: o1 });
    await wait(20);

    assert(brickX(target.document) === 6, '40. 4+2=6 — the second replay of O1 contributed nothing');
    assert(JSON.stringify(commandIds(target.commandHistory)) === JSON.stringify([o1.id, o2.id]),
        '41. CommandHistory is exactly [O1, O2] — never [O1, O2, O1]');

    record('J: operation identity / ReplayGuard', 'O1,O1,O2,O1', 'exactly [O1,O2] applied once each — the EXISTING ReplayGuard (0.9.222) is sufficient, no additional idempotency layer needed');
    console.log('✓ Section J: the existing ReplayGuard, unmodified, already makes duplicate/replayed delivery a no-op — "O1 arriving twice" and "O1, O2, O1" both collapse to the intended sequence with no changes needed');
}

// ===================================================================
// Transport ordering observation (not a protocol guarantee)
// ===================================================================
//
// The central question above was answered by CONTROLLING delivery
// order explicitly (calling broadcastCommand() in a chosen sequence).
// A separate, narrower question: for two operations sent back-to-back
// on the SAME connection with no explicit reordering, does THIS
// transport happen to preserve send order on its own? peer/
// LocalPeerConnectionProvider.js#send() queues each message via a
// SEPARATE queueMicrotask() call (see that file's own header/code) —
// microtasks run FIFO, so two sends issued synchronously, one after
// the other, resolve in the order they were queued. That is an
// IMPLEMENTATION DETAIL of this one in-memory transport, not a
// property core/DocumentOperationEnvelope.js declares or that
// DocumentCommandPropagationUseCase enforces — the envelope carries no
// logicalClock/sequence number (unchanged since 0.9.222), so nothing
// stops a DIFFERENT transport (real WebRTC data channels across
// multiple, differently-congested paths; a relay; anything not a
// single in-order byte stream) from delivering out of send order.
{
    const worldId = nextWorldId('transport');
    const target = openReplicaDocument(bob, worldId, aliceLaptop.identity.identityId, 'Transport observation');

    const p1 = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 1, y: 0, z: 0 } });
    const p2 = new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta: { x: 100, y: 0, z: 0 } });

    // Back-to-back, deliberately with NO await between them.
    laptopStack.propagation.broadcastCommand({ documentId: worldId, command: p1 });
    laptopStack.propagation.broadcastCommand({ documentId: worldId, command: p2 });
    await wait(20);

    assert(JSON.stringify(commandIds(target.commandHistory)) === JSON.stringify([p1.id, p2.id]),
        '42. this transport delivered two back-to-back sends in send order — an OBSERVATION about LocalPeerConnectionProvider\'s own queueMicrotask()-per-send FIFO behavior, never a protocol-level causal-order guarantee');

    record('Transport observation: back-to-back sends, no explicit reordering', 'P1, P2 (sent together)', 'arrived in send order — an accidental transport property (queueMicrotask FIFO), NOT a protocol guarantee (no logicalClock exists to make it one)');
    console.log('✓ Transport observation: LocalPeerConnectionProvider happens to preserve send order for consecutive sends — documented explicitly as an accident of THIS transport, never assumed by anything above it, and never something a future transport is obligated to preserve');
}

laptopStack.propagation.dispose();
phoneStack.propagation.dispose();
bob.propagation.dispose();
charlie.propagation.dispose();

// ===================================================================
// Evidence table
// ===================================================================
console.log('\n0.9.225 — Concurrent Document Operation Behavior Audit: evidence table');
console.table(evidence);

}

runTests().then(() => {
    console.log('\n✓ All ConcurrentDocumentOperationBehaviorAudit tests passed');
}).catch((error) => {
    console.error('\n✗ ConcurrentDocumentOperationBehaviorAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
