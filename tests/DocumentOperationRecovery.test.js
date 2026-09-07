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
import { RemoteDocumentOperationApplicationUseCase } from '../application/RemoteDocumentOperationApplicationUseCase.js';
import { CausalGapStatus } from '../core/DocumentOperationCausalGapDetector.js';
import { DocumentOperationCausalGapObservationUseCase } from '../application/DocumentOperationCausalGapObservationUseCase.js';
import { DocumentOperationRecoveryUseCase } from '../application/DocumentOperationRecoveryUseCase.js';
import { toDocumentOperationEnvelope } from '../core/DocumentOperationEnvelope.js';
import { toDocumentOperationRecoveryResponseMessage } from '../core/DocumentOperationRecoveryProtocol.js';

// 0.9.230 — Causal Gap Recovery Request Boundary.
//
// docs/Roadmap.md, 0.9.229's own "Recommendation" named the exact seam
// this milestone closes: "a replica can know that it is missing an
// operation, but currently has no way to ask for it." This suite exercises
// the real chain, end to end, over real authenticated peer connections:
//
//   B arrives -> GAP(A) observed (0.9.228/0.9.229, unmodified)
//             -> DocumentOperationRecoveryUseCase requests A
//             -> the peer that authored A answers with A's real envelope
//             -> verifyEnvelope() (DocumentCommandPropagationUseCase,
//                the SAME five-step trust chain, reused not duplicated)
//             -> A becomes KNOWN to the causal graph
//             -> A is NEVER handed to RemoteDocumentOperationApplicationUseCase
//
// Deliberately NOT tested here, because it deliberately does not exist:
// operation buffering, delayed/automatic application, causal reordering,
// retry/backoff, an offline queue, persistence of pending requests, CRDT,
// OT, conflict resolution, or a second deduplication mechanism next to
// ReplayGuard. See DocumentOperationRecoveryUseCase.js's own header.

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
    let threw = false;
    try { fn(); } catch { threw = true; }
    assert(threw, message);
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

// A full replica stack: propagation (0.9.222), gap observation
// (0.9.228/0.9.229), and recovery (0.9.230) wired together exactly the
// way application/EditorSession.js wires them in production — recovery's
// own onOperationReceived() feed attached to gap observation, and gap
// observation's own onGapObserved() feed attached to recovery, but
// recovery NEVER attached to a RemoteDocumentOperationApplicationUseCase.
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
    recovery.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors) => recovered.push({ documentId, command, authorIdentityId, causalPredecessors }));

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

// Opens THIS replica's own local copy of `worldId`, declaring
// `localAuthorIdentityId` as the identity its own WorldAuthorizationService
// check recognizes as authorized — mirrors openReplicaDocument() in
// tests/DocumentOperationCausalGapObservation.test.js. Also wires
// recovery.attachCommandHistory() so anything THIS replica executes into
// the returned commandHistory becomes servable to a later recovery
// REQUEST — this is deliberately independent of whether
// propagation.attachCommandHistory() is ever wired (it never is in this
// suite; every outgoing send is an explicit, controlled
// propagation.broadcastCommand() call, exactly like tests/
// DocumentOperationCausalGapObservation.test.js already does, so a test
// can precisely control which operations actually cross the wire).
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

// alice/bob are ONE session-lifetime stack shared across every section
// below (exactly like application/EditorSession.js wires a single
// detector/exchange for its own whole lifetime) — so their own
// gapObservations/recovered/received/rejected arrays accumulate across
// sections. snapshot()/since() let each section assert only on what IT
// itself produced, without resetting shared state between sections.
function snapshot(replica) {
    return {
        gapObservations: replica.gapObservations.length,
        recovered: replica.recovered.length,
        received: replica.received.length,
        rejected: replica.rejected.length
    };
}

function since(replica, snap) {
    return {
        gapObservations: replica.gapObservations.slice(snap.gapObservations),
        recovered: replica.recovered.slice(snap.recovered),
        received: replica.received.slice(snap.received),
        rejected: replica.rejected.slice(snap.rejected)
    };
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

// Each replica declares the OTHER as its own locally-recognized author —
// Bob's copy of a document expects Alice's operations; Alice's copy
// expects Bob's REQUESTs to be authorized. This is the identical
// ownership-match authorization model tests/
// DocumentOperationCausalGapObservation.test.js and tests/
// DocumentCollaborationBoundary.test.js already exercise; see
// application/DocumentCommandPropagationUseCase.js's own header on why a
// single owner identity's own several authorized devices is exactly what
// this simplified model represents.
function openPair(worldId, title) {
    const bobSide = openDocument(bob, worldId, aliceDevice.identity.identityId, title);
    const aliceSide = openDocument(alice, worldId, bobDevice.identity.identityId, `${title} (alice)`);
    return { bobTarget: bobSide.target, aliceTarget: aliceSide.target };
}

// ===================================================================
// Section A — GAP produces a precise request, the missing operation is
// recovered from the peer that authored it, verified through the SAME
// trust chain a normal receive uses, made known to the causal graph, and
// NEVER automatically applied.
// ===================================================================
{
    const { bobTarget, aliceTarget } = openPair('doc-rec-a', 'Section A');
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const unsubscribeApplication = applicationUseCase.attachToPropagation(bob.propagation, () => bobTarget);

    const opA = moveCommand('doc-rec-a', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-rec-a', { x: 2, y: 0, z: 0 });
    // Alice authors A and B locally (recorded into her OWN recovery
    // store), but only ever BROADCASTS B — simulating "Bob never
    // received A."
    aliceTarget.commandHistory.execute(opA);
    aliceTarget.commandHistory.execute(opB);
    alice.propagation.broadcastCommand({ documentId: 'doc-rec-a', command: opB, causalPredecessors: [opA.id] });
    // A single wait covers the WHOLE round trip: B's receive + gap
    // observation + the recovery REQUEST/RESPONSE + A's own verification
    // and observation — this local simulated network settles all of it
    // well within one macrotask, so there is no meaningful intermediate
    // point between "B observed" and "A recovered" to assert on
    // separately.
    await wait(60);

    const bGap = bob.gapObservations.find((o) => o.operationId === opB.id);
    assert(bGap, '1. B\'s arrival produced an observation');
    assert(bGap.causalGap.status === CausalGapStatus.GAP, '2. B is gapped: A was never received');
    assert(JSON.stringify(bGap.causalGap.missingCausalPredecessorIds) === JSON.stringify([opA.id]), '3. exactly A is named missing');
    assert(bobTarget.commandHistory.getExecutedCommands().length === 1 && bobTarget.commandHistory.getExecutedCommands()[0].id === opB.id, '4. B still applied immediately — gap detection never gates application');

    assert(bob.recovered.length === 1, '5. exactly one recovered operation — A');
    assert(bob.recovered[0].documentId === 'doc-rec-a' && bob.recovered[0].command.id === opA.id, '6. the recovered operation is genuinely A');
    assert(bob.recovered[0].authorIdentityId === aliceDevice.identity.identityId, '7. authorship is preserved unchanged');
    assert(JSON.stringify(bob.recovered[0].causalPredecessors) === '[]', '8. A\'s own (empty) causal predecessors are preserved unchanged');
    assert(typeof bob.recovered[0].command.execute === 'function', '9. the recovered command is a real, deserialized Command instance, not raw JSON');

    // Causal observation happened for the recovered operation too — but
    // application did not.
    const aGap = bob.gapObservations.find((o) => o.operationId === opA.id);
    assert(bob.gapObservations.length === 2, '10. A\'s own arrival (via recovery) produced its own observation');
    assert(aGap && aGap.causalGap.status === CausalGapStatus.NO_GAP, '11. A itself is NO_GAP — a genesis operation');
    assert(bobTarget.commandHistory.getExecutedCommands().length === 1, '12. A was NEVER applied — recovery only makes it known, exactly as this milestone specifies');
    assert(bob.received.length === 1, '13. onOperationReceived() (the feed RemoteDocumentOperationApplicationUseCase is wired to) fired ONLY for B — recovery never publishes onto it');

    // A later, direct re-query now resolves cleanly, proving the recovered
    // operation genuinely satisfies the original gap.
    const reChecked = bob.gapObservation.observe({ documentId: 'doc-rec-a', operationId: opB.id, causalPredecessors: [opA.id] });
    assert(reChecked.causalGap.status === CausalGapStatus.NO_GAP, '14. re-querying B\'s own gap after recovery now answers NO_GAP');

    unsubscribeApplication();
    console.log('✓ Section A: a GAP is answered by a precise recovery request, the response is verified and made known, and the recovered operation is never automatically applied');
}

// ===================================================================
// Section B — NO_GAP produces no request: an operation whose predecessor
// is already known never triggers any recovery traffic.
// ===================================================================
{
    const snap = snapshot(bob);
    const { bobTarget, aliceTarget } = openPair('doc-rec-b', 'Section B');
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const unsubscribeApplication = applicationUseCase.attachToPropagation(bob.propagation, () => bobTarget);
    const opA = moveCommand('doc-rec-b', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-rec-b', { x: 2, y: 0, z: 0 });
    aliceTarget.commandHistory.execute(opA);
    aliceTarget.commandHistory.execute(opB);
    alice.propagation.broadcastCommand({ documentId: 'doc-rec-b', command: opA, causalPredecessors: [] });
    await wait(20);
    alice.propagation.broadcastCommand({ documentId: 'doc-rec-b', command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    const s = since(bob, snap);
    assert(s.gapObservations.length === 2, '15. both A and B produced their own observation');
    assert(s.gapObservations[0].causalGap.status === CausalGapStatus.NO_GAP && s.gapObservations[1].causalGap.status === CausalGapStatus.NO_GAP, '16. both are NO_GAP — A arrived before B needed it');
    assert(s.recovered.length === 0, '17. no recovery ever happens for an ungapped receive');
    assert(bobTarget.commandHistory.getExecutedCommands().length === 2, '18. both operations applied normally');

    unsubscribeApplication();
    console.log('✓ Section B: NO_GAP never produces any recovery request or recovered operation');
}

// ===================================================================
// Section C — Multiple missing predecessors: an operation naming TWO
// distinct missing predecessors is answered with exactly both, in a
// single recovered batch, with no invented or unrelated ids.
// ===================================================================
{
    const snap = snapshot(bob);
    const { aliceTarget } = openPair('doc-rec-c', 'Section C');
    const opB = moveCommand('doc-rec-c', { x: 1, y: 0, z: 0 });
    const opC = moveCommand('doc-rec-c', { x: 2, y: 0, z: 0 });
    const opD = moveCommand('doc-rec-c', { x: 3, y: 0, z: 0 });
    // Alice authors B and C locally (both recorded, neither broadcast),
    // then broadcasts D naming BOTH as its causal predecessors.
    aliceTarget.commandHistory.execute(opB);
    aliceTarget.commandHistory.execute(opC);
    alice.propagation.broadcastCommand({ documentId: 'doc-rec-c', command: opD, causalPredecessors: [opB.id, opC.id] });
    await wait(60);

    const s = since(bob, snap);
    const dGap = s.gapObservations.find((o) => o.operationId === opD.id);
    assert(dGap && dGap.causalGap.status === CausalGapStatus.GAP, '19. D is gapped');
    assert(JSON.stringify([...dGap.causalGap.missingCausalPredecessorIds].sort()) === JSON.stringify([opB.id, opC.id].sort()), '20. exactly B and C are named missing — no invented or unrelated ids');

    const recoveredIds = s.recovered.map((r) => r.command.id).sort();
    assert(JSON.stringify(recoveredIds) === JSON.stringify([opB.id, opC.id].sort()), '21. both B and C were recovered — exactly the missing set, nothing more');

    console.log('✓ Section C: a request for multiple missing predecessors recovers exactly that set');
}

// ===================================================================
// Section D — Duplicate GAP observations: ReplayGuard remains the ONE
// deduplication mechanism. A retransmitted gapped operation is never
// observed twice, and a recovered operation is never recorded twice even
// if a request were ever repeated.
// ===================================================================
{
    const snap = snapshot(bob);
    const { bobTarget, aliceTarget } = openPair('doc-rec-d', 'Section D');
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const unsubscribeApplication = applicationUseCase.attachToPropagation(bob.propagation, () => bobTarget);
    const opA = moveCommand('doc-rec-d', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-rec-d', { x: 2, y: 0, z: 0 });
    aliceTarget.commandHistory.execute(opA);
    aliceTarget.commandHistory.execute(opB);
    alice.propagation.broadcastCommand({ documentId: 'doc-rec-d', command: opB, causalPredecessors: [opA.id] });
    await wait(30);
    // Retransmit the IDENTICAL gapped operation a second time.
    alice.propagation.broadcastCommand({ documentId: 'doc-rec-d', command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    const s = since(bob, snap);
    assert(s.rejected.some((r) => r.reason === 'DUPLICATE' && r.envelope.operationId === opB.id), '22. the retransmission was rejected by ReplayGuard, as expected');
    assert(s.recovered.filter((r) => r.command.id === opA.id).length === 1, '23. A was recovered exactly once, never duplicated by a repeated gap');
    assert(bobTarget.commandHistory.getExecutedCommands().length === 1, '24. B was applied exactly once');

    unsubscribeApplication();
    console.log('✓ Section D: recovery never becomes a second deduplication mechanism — ReplayGuard\'s own guarantee holds end to end');
}

// ===================================================================
// Section E — Document isolation: the SAME operationId, missing under
// two different documents, is resolved and recovered completely
// independently in each — a peer's knowledge of an operation under one
// document must never answer a request naming it under another.
// ===================================================================
{
    const { aliceTarget: aliceX } = openPair('doc-rec-e-x', 'Section E (x)');
    const sharedOp = moveCommand('doc-rec-e-x', { x: 1, y: 0, z: 0 });
    // Alice authors sharedOp — recorded into her recovery store ONLY
    // under doc-rec-e-x.
    aliceX.commandHistory.execute(sharedOp);

    // Bob, working in an entirely different document, receives an
    // operation naming sharedOp's own operationId as a predecessor —
    // under doc-rec-e-y.
    openPair('doc-rec-e-y', 'Section E (y)');
    const opInY = moveCommand('doc-rec-e-y', { x: 2, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-rec-e-y', command: opInY, causalPredecessors: [sharedOp.id] });
    await wait(60);

    assert(!bob.recovered.some((r) => r.documentId === 'doc-rec-e-y' && r.command.id === sharedOp.id), '25. sharedOp, known to Alice only under doc-rec-e-x, must never satisfy a recovery request for it under doc-rec-e-y');

    console.log('✓ Section E: recovery stays strictly document-scoped — an operationId known under one document never answers a request for it under another');
}

// ===================================================================
// Section F — Response preserves the original envelope exactly: no
// reconstruction, no rewriting.
// ===================================================================
{
    const { aliceTarget } = openPair('doc-rec-f', 'Section F');
    const opA = moveCommand('doc-rec-f', { x: 5, y: 1, z: -2 });
    const opB = moveCommand('doc-rec-f', { x: 9, y: 0, z: 0 });
    aliceTarget.commandHistory.execute(opA);
    aliceTarget.commandHistory.execute(opB);
    alice.propagation.broadcastCommand({ documentId: 'doc-rec-f', command: opB, causalPredecessors: [opA.id] });
    await wait(80);

    const recoveredA = bob.recovered.find((r) => r.command.id === opA.id);
    assert(recoveredA, '26. A was recovered');
    assert(recoveredA.documentId === 'doc-rec-f', '27. documentId preserved');
    assert(recoveredA.authorIdentityId === aliceDevice.identity.identityId, '28. authorIdentityId preserved');
    assert(JSON.stringify(recoveredA.causalPredecessors) === '[]', '29. causalPredecessors preserved');
    assert(JSON.stringify(recoveredA.command.toJSON()) === JSON.stringify(opA.toJSON()), '30. the command itself round-trips identically — no reconstruction or rewriting');

    console.log('✓ Section F: a recovery response preserves operationId, documentId, authorIdentityId, command, and causalPredecessors exactly');
}

// ===================================================================
// Section G — Unknown requested operation: nobody has it. This produces
// no recovered operation and no placeholder — an explicit negative
// result IS its own absence, never a fabricated stand-in.
// ===================================================================
{
    const snap = snapshot(bob);
    openPair('doc-rec-g', 'Section G');
    const neverAuthored = moveCommand('doc-rec-g', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-rec-g', { x: 2, y: 0, z: 0 });
    // opB is broadcast naming a predecessor NOBODY ever authored anywhere.
    alice.propagation.broadcastCommand({ documentId: 'doc-rec-g', command: opB, causalPredecessors: [neverAuthored.id] });
    await wait(80);

    const s = since(bob, snap);
    const bGap = s.gapObservations.find((o) => o.operationId === opB.id);
    assert(bGap && bGap.causalGap.status === CausalGapStatus.GAP, '31. still correctly detected as a gap');
    assert(!s.recovered.some((r) => r.command.id === neverAuthored.id), '32. the unknown operation was never recovered');
    assert(!s.recovered.some((r) => r.command.id === undefined || r.command.id === null), '33. no placeholder/empty entry was ever produced for the unknown id');
    assert(s.rejected.every((r) => r.envelope.operationId !== neverAuthored.id), '34. the absence never surfaces as a rejection either — it is simply silence, per this protocol\'s own design');

    console.log('✓ Section G: an unknown requested operation produces no recovered operation and no placeholder — silence is the explicit negative result');
}

// ===================================================================
// Section H — Security: a recovered envelope must survive the EXACT SAME
// verification an ordinarily-received operation would. A peer other than
// an operation's own author cannot successfully relay it — impersonating
// authorship over its OWN connection is rejected exactly like a spoofed
// live operation would be (DocumentCollaborationBoundary.test.js's own
// identity-spoofing coverage, now proven for the recovery channel too).
// ===================================================================
{
    const mallory = makeDevice('Mallory');
    // peerA here is MALLORY's own connection object, representing Bob
    // from HER side; peerB is BOB's own connection object, representing
    // Mallory from HIS side — the identical peerA/peerB convention
    // connectAndAuthenticate() already establishes above for Alice/Bob.
    const { peerA: peerBobAsSeenByMallory, peerB: peerMalloryAsSeenByBob } = await connectAndAuthenticate(network, 'mallory', mallory, 'bob-via-mallory', bobDevice);
    bob.connectedPeerRegistry.add(peerMalloryAsSeenByBob);

    openPair('doc-rec-h', 'Section H');
    // A well-formed envelope, structurally valid, but FORGED: it claims
    // Alice's own authorIdentityId while actually being sent over
    // Mallory's own authenticated connection to Bob.
    const forgedCommand = moveCommand('doc-rec-h', { x: 1, y: 0, z: 0 });
    const forgedEnvelope = toDocumentOperationEnvelope({
        operationId: forgedCommand.id,
        documentId: 'doc-rec-h',
        authorIdentityId: aliceDevice.identity.identityId,
        command: forgedCommand.toJSON(),
        causalPredecessors: []
    });
    const forgedResponse = toDocumentOperationRecoveryResponseMessage({ documentId: 'doc-rec-h', operations: [forgedEnvelope] });

    // Sent over MALLORY's OWN bus and connection — Bob's own bus
    // correctly attributes the incoming message to Mallory's proven
    // connection identity, never to Alice's.
    const mallorysBus = new PeerMessageBus();
    mallorysBus.attach(peerBobAsSeenByMallory);
    mallorysBus.send(peerBobAsSeenByMallory, DocumentOperationRecoveryUseCase.DEFAULT_PROTOCOL, forgedResponse);
    await wait(30);

    assert(!bob.recovered.some((r) => r.command.id === forgedCommand.id), '35. a forged envelope — claiming Alice\'s authorship while arriving over Mallory\'s own connection — is rejected, never recovered');

    console.log('✓ Section H: a recovery response is verified through the SAME identity chain as a live operation — impersonated authorship is rejected, never an alternative trust path');
}

// ===================================================================
// Section I — Failure isolation: a malformed/garbage recovery message
// must never crash the shared peer connection, never affect the
// unrelated DocumentCommandPropagationUseCase channel it shares that
// connection with, and never prevent a subsequent, well-formed operation
// from arriving and applying normally.
// ===================================================================
{
    const snap = snapshot(bob);
    const { bobTarget, aliceTarget } = openPair('doc-rec-i', 'Section I');
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const unsubscribeApplication = applicationUseCase.attachToPropagation(bob.propagation, () => bobTarget);

    let threw = false;
    try {
        // A structurally-garbage recovery message, sent directly over the
        // real, shared bus/connection.
        alice.peerMessageBus.send(peerA, DocumentOperationRecoveryUseCase.DEFAULT_PROTOCOL, { kind: 'NOT_A_REAL_KIND', totally: 'invalid', nested: { a: [1, 2, 3] } });
        await wait(20);
    } catch {
        threw = true;
    }
    assert(!threw, '36. a garbage recovery message never escapes as an unhandled exception');

    // The unrelated document-sync channel, sharing the SAME connection,
    // still works normally afterward.
    const opAfter = moveCommand('doc-rec-i', { x: 1, y: 0, z: 0 });
    aliceTarget.commandHistory.execute(opAfter);
    alice.propagation.broadcastCommand({ documentId: 'doc-rec-i', command: opAfter, causalPredecessors: [] });
    await wait(20);
    assert(bobTarget.commandHistory.getExecutedCommands().length === 1 && bobTarget.commandHistory.getExecutedCommands()[0].id === opAfter.id, '37. a subsequent, well-formed operation still arrives and applies normally over the SAME shared connection');
    assert(since(bob, snap).rejected.length === 0, '38. the garbage recovery message never surfaced as a propagation-level rejection');

    unsubscribeApplication();
    console.log('✓ Section I: a malformed recovery message is fully isolated — never a network failure, an Editor failure, or a CommandHistory failure');
}

// ===================================================================
// Section J — Direct-caller discipline: the same closed-vocabulary
// "throw on malformed input" posture every sibling file in this lineage
// applies to a direct caller's own construction/wiring mistakes.
// ===================================================================
{
    assertThrows(() => new DocumentOperationRecoveryUseCase({}), '39. missing every collaborator throws at construction');
    assertThrows(() => new DocumentOperationRecoveryUseCase({
        peerMessageBus: alice.peerMessageBus, connectedPeerRegistry: alice.connectedPeerRegistry,
        documentCommandPropagation: {}, identityProvider: aliceDevice.provider
    }), '40. a documentCommandPropagation missing verifyEnvelope()/resolveEditAccessFor() throws at construction');
    const recovery = new DocumentOperationRecoveryUseCase({
        peerMessageBus: new PeerMessageBus(), connectedPeerRegistry: new ConnectedPeerRegistry(),
        documentCommandPropagation: alice.propagation, identityProvider: aliceDevice.provider
    });
    assertThrows(() => recovery.attachToGapObservation(null), '41. attachToGapObservation() requires a real DocumentOperationCausalGapObservationUseCase');
    assertThrows(() => recovery.attachCommandHistory({ documentId: 'x' }), '42. attachCommandHistory() requires a real CommandHistory');
    recovery.dispose();

    console.log('✓ Section J: DocumentOperationRecoveryUseCase enforces the same closed-vocabulary discipline as its sibling files for direct callers');
}

alice.dispose();
bob.dispose();

console.log('\n0.9.230 — a replica that knows it is missing a causal predecessor can now precisely request it, receive it through the SAME verification an ordinary operation already survives, and make it known to its own causal graph — without ever buffering, reordering, or automatically applying it.');

}

runTests().then(() => {
    console.log('\n✓ All DocumentOperationRecovery tests passed');
}).catch((error) => {
    console.error('\n✗ DocumentOperationRecovery tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
