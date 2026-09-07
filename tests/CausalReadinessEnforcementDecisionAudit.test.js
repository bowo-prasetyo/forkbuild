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
import { RemoteDocumentOperationApplicationUseCase } from '../application/RemoteDocumentOperationApplicationUseCase.js';
import { DocumentOperationCausalGapDetector } from '../core/DocumentOperationCausalGapDetector.js';
import { DocumentOperationCausalGapObservationUseCase } from '../application/DocumentOperationCausalGapObservationUseCase.js';
import { DocumentOperationRecoveryUseCase } from '../application/DocumentOperationRecoveryUseCase.js';
import { DocumentOperationProvenance } from '../core/DocumentOperationProvenance.js';
import {
    DocumentOperationApplicationEligibility,
    evaluateApplicationEligibility
} from '../core/DocumentOperationApplicationEligibility.js';
import {
    DocumentOperationApplicationReadiness,
    evaluateApplicationReadiness
} from '../core/DocumentOperationApplicationReadiness.js';

// 0.9.235 — Causal Readiness Enforcement Decision Audit.
//
// 0.9.234 named Q4 ("have this operation's causal predecessors actually
// been EXECUTED, not merely KNOWN") purely in isolation —
// `evaluateApplicationReadiness()` exercised directly against a synthetic
// detector/execution-history pair, the same posture 0.9.232's own suite
// took before 0.9.233 wired eligibility into the REAL receive chain. This
// milestone is that same next step for readiness. Test-only. No production
// code changes. It answers one question, on the real collaboration
// runtime, not a synthetic one:
//
//   what would actually break, and what would actually improve, if
//   NOT_READY operations were prevented from immediate application?
//
// Every section below wires a FOURTH, independent subscriber onto the same
// `onOperationReceived()` feed `DocumentOperationCausalGapObservationUseCase`
// and `RemoteDocumentOperationApplicationUseCase` already attach to (a
// third, `evaluateApplicationEligibility()`, was 0.9.233's own addition).
// This fourth subscriber calls `evaluateApplicationReadiness()` against the
// SAME `DocumentOperationCausalGapDetector` gap observation records into,
// and against a REAL `executionHistory` backed by the receiving replica's
// own `application/CommandHistory.js` instance — never a private, detached
// copy of either. It only ever observes: it never calls `apply()` and
// never withholds a call to it. `NOT_READY` gates nothing in this
// codebase, before or after this milestone.
//
// Deliberately NOT built here, because 0.9.235 is a decision audit, not
// the decision itself: no pending queue, no buffering, no delayed
// execution, no automatic retry, no reordering, no rollback, no CRDT, no
// OT, no synchronized undo, no conflict resolution, no convergence
// guarantee, no change to `application/CommandHistory.js`, no change to
// `ARRIVAL_ORDER`. See this file's own closing "Recommendation" for the
// evidence this audit produces and the choice it leaves open.

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
    const state = { target: null };
    const propagation = new DocumentCommandPropagationUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        identityProvider: device.provider, commandRegistry,
        resolveDocument: (id) => (state.target && state.target.documentId === id ? state.target.document : null)
    });
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, propagation, state };
}

function buildBaseDocument({ worldId, authorIdentityId, title, groupName = 'Original' }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: 'building-x' });
    building.addBrick(new Brick({ id: 'brick-a', definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    world.addGroup(new Group({ id: 'group-1', name: groupName, brickIds: ['brick-a'] }));
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'owner', authorIdentityId }) });
}

function openReplicaDocument(replica, worldId, authorIdentityId, title) {
    const document = buildBaseDocument({ worldId, authorIdentityId, title });
    const target = { documentId: worldId, document, commandHistory: new CommandHistory({ world: document.world }) };
    replica.state.target = target;
    return target;
}

function moveCommand(worldId, delta) {
    return new MoveBrickCommand({ worldId, buildingId: 'building-x', brickId: 'brick-a', delta });
}

function brickX(document) {
    return document.world.getBuilding('building-x').findBrick('brick-a').position.x;
}

function groupName(document) {
    return document.world.getGroup('group-1').name;
}

// A small, shared, mutable execution-history query — the exact shape
// `evaluateApplicationReadiness()` requires (`isExecuted(documentId,
// operationId)`) — backed by REAL `application/CommandHistory.js`
// instances registered as documents are opened. TEST-ONLY glue, not a
// change to `CommandHistory` itself, mirroring
// `tests/DocumentOperationApplicationReadiness.test.js`'s own
// `executionHistoryFromCommandHistories()` adapter, made register-able so
// one shared instance can serve every section's own freshly-opened
// document.
function makeExecutionHistoryRegistry() {
    const historiesByDocumentId = new Map();
    return {
        register(documentId, commandHistory) { historiesByDocumentId.set(documentId, commandHistory); },
        isExecuted(documentId, operationId) {
            const history = historiesByDocumentId.get(documentId);
            return !!history && history.getExecutedCommands().some((command) => command.id === operationId);
        }
    };
}

// Wires a receiver's real propagation feed with FOUR independent
// subscribers: gap observation (0.9.229), eligibility observation (0.9.233's
// own audit instrument), readiness observation (THIS milestone's own audit
// instrument — test code only, never production), and application
// (0.9.223/0.9.224). All four read the SAME onOperationReceived() feed;
// none is aware of, or able to influence, any of the others.
// `causalGapDetector` is shared between gap observation, eligibility, and
// readiness so every answer reflects this replica's REAL, cumulative
// causal knowledge; `executionHistoryRegistry` is shared with the real
// CommandHistory application actually executes into, so readiness reads
// REAL execution state, never a private copy of it.
function wireReceiver(receiver, target, executionHistoryRegistry, order = ['gap', 'eligibility', 'readiness', 'application']) {
    executionHistoryRegistry.register(target.documentId, target.commandHistory);
    const causalGapDetector = new DocumentOperationCausalGapDetector();
    const gapObservation = new DocumentOperationCausalGapObservationUseCase({ causalGapDetector });
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const gapObservations = [];
    const eligibilityObservations = [];
    const readinessObservations = [];
    gapObservation.onGapObserved((descriptor) => gapObservations.push(descriptor));

    const unsubscribers = [];
    const wire = {
        gap: () => unsubscribers.push(gapObservation.attachToPropagation(receiver.propagation)),
        eligibility: () => unsubscribers.push(receiver.propagation.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors) => {
            eligibilityObservations.push(evaluateApplicationEligibility(documentId, { operationId: command.id, causalPredecessors }, { causalGapDetector }));
        })),
        readiness: () => unsubscribers.push(receiver.propagation.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors) => {
            readinessObservations.push(evaluateApplicationReadiness(documentId, { operationId: command.id, causalPredecessors }, { causalGapDetector, executionHistory: executionHistoryRegistry }));
        })),
        application: () => unsubscribers.push(applicationUseCase.attachToPropagation(receiver.propagation, () => target))
    };
    for (const step of order) {
        wire[step]();
    }

    return {
        causalGapDetector, gapObservation, applicationUseCase, gapObservations, eligibilityObservations, readinessObservations,
        dispose: () => unsubscribers.forEach((unsubscribe) => unsubscribe())
    };
}

// A recovery-capable full stack (propagation + recovery + gap observation,
// wired exactly the way `application/EditorSession.js` wires them:
// recovery's own feed attaches to gap observation, never to application)
// — mirrors `tests/CausalApplicationEligibilityPolicyAudit.test.js`'s own
// Section 5 `makeFullStack()` helper.
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
    const recovered = [];
    recovery.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors, provenance) => recovered.push({ documentId, command, provenance }));
    const unsubscribeGapToPropagation = gapObservation.attachToPropagation(propagation);
    const unsubscribeRecoveryRequest = recovery.attachToGapObservation(gapObservation);
    const unsubscribeGapToRecovery = gapObservation.attachToPropagation(recovery);
    return {
        device, peerMessageBus, connectedPeerRegistry, propagation, recovery, gapObservation, causalGapDetector, state, recovered,
        dispose: () => { unsubscribeGapToPropagation(); unsubscribeRecoveryRequest(); unsubscribeGapToRecovery(); propagation.dispose(); recovery.dispose(); }
    };
}

// The compact behavioral matrix this milestone's own header names as its
// most valuable output — assembled from the REAL observations recorded
// below, never hand-typed. Printed once, at the very end.
const matrixRows = [];
function recordMatrixRow(causalState, eligibility, readiness, currentBehavior) {
    matrixRows.push({ causalState, eligibility, readiness, currentBehavior });
}

async function runTests() {

const network = new LocalPeerNetwork();
const aliceDevice = makeDevice('Alice');
const bobDevice = makeDevice('Bob');
const alice = makeSenderStack(aliceDevice);
const bob = makeReceiverStack(bobDevice);
const { peerA, peerB } = await connectAndAuthenticate(network, 'alice', aliceDevice, 'bob', bobDevice);
alice.connectedPeerRegistry.add(peerA);
bob.connectedPeerRegistry.add(peerB);
const executionHistoryRegistry = makeExecutionHistoryRegistry();

// ===================================================================
// Section A — Fully ready operation: A executes, B depends on A, A has
// actually been EXECUTED (not merely known) by the time B arrives.
// Current behavior — immediate application under ARRIVAL_ORDER — is
// completely unchanged by readiness now being observable alongside it.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-235-a', aliceDevice.identity.identityId, 'Section A');
    const wired = wireReceiver(bob, target, executionHistoryRegistry);

    const opA = moveCommand('doc-235-a', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-235-a', command: opA, causalPredecessors: [] });
    await wait(20);
    const opB = moveCommand('doc-235-a', { x: 2, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-235-a', command: opB, causalPredecessors: [opA.id] });
    await wait(20);

    const bReadiness = wired.readinessObservations.find((o) => o.operationId === opB.id);
    assert(bReadiness.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '1. B is ELIGIBLE — A is known');
    assert(bReadiness.readiness === DocumentOperationApplicationReadiness.READY, '2. B is READY — A was actually executed, not merely known');
    assert(target.commandHistory.getExecutedCommands().length === 2, '3. both A and B applied, exactly as before this milestone');

    recordMatrixRow('All predecessors executed', 'ELIGIBLE', 'READY', 'Apply (unchanged)');
    wired.dispose();
    console.log('✓ Section A: a fully ready operation behaves identically to every milestone before this one');
}

// ===================================================================
// Section B — Causal gap: B names A, A never arrives at all. NOT_ELIGIBLE
// and NOT_READY coincide (an unknown predecessor was, by construction,
// never executed either) — and B STILL applies immediately under today's
// ARRIVAL_ORDER policy, exactly as 0.9.233's own audit already proved for
// eligibility alone.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-235-b', aliceDevice.identity.identityId, 'Section B');
    const wired = wireReceiver(bob, target, executionHistoryRegistry);

    const opB = moveCommand('doc-235-b', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-235-b', command: opB, causalPredecessors: ['never-arrives-235-b'] });
    await wait(20);

    const bReadiness = wired.readinessObservations.find((o) => o.operationId === opB.id);
    assert(bReadiness.eligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE, '4. B, whose predecessor never arrives, is NOT_ELIGIBLE');
    assert(bReadiness.readiness === DocumentOperationApplicationReadiness.NOT_READY, '5. B is also NOT_READY');
    assert(target.commandHistory.getExecutedCommands().length === 1 && target.commandHistory.getExecutedCommands()[0].id === opB.id, '6. B STILL applied immediately — NOT_READY, exactly like NOT_ELIGIBLE before it, gates nothing');

    recordMatrixRow('Missing predecessor', 'NOT_ELIGIBLE', 'NOT_READY', 'Apply (unchanged)');
    wired.dispose();
    console.log('✓ Section B: a genuine causal gap still applies immediately — readiness changes nothing about ARRIVAL_ORDER');
}

// ===================================================================
// Section C — THE CENTRAL CASE. A recovered predecessor: Dave recovers A
// through B's own causal gap (DocumentOperationRecoveryUseCase) — A
// becomes KNOWN, never EXECUTED, on Dave's replica. B, naming A, is
// ELIGIBLE (0.9.232's own answer, unchanged) yet NOT_READY — and B
// currently still applies. This is the coexistence 0.9.234 predicted and
// this milestone now proves against the real recovery + propagation +
// application chain together, not each in isolation.
// ===================================================================
let daveForSectionD = null;
let opAForSectionD = null;
let opBForSectionD = null;
let carolFinalXForSectionD = null;
{
    const carolDevice = makeDevice('Carol-235');
    const daveDevice = makeDevice('Dave-235');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-235', carolDevice, 'dave-235', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-235-c';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'Section C (carol)' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'Section C (dave)' });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: new CommandHistory({ world: daveDoc.world }) };
    dave.state.target = daveTarget;
    executionHistoryRegistry.register(worldId, daveTarget.commandHistory);
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const unsubscribeApplication = applicationUseCase.attachToPropagation(dave.propagation, () => daveTarget);

    // A and B are the SAME MoveBrickCommand delta class used throughout
    // Sections A/B — this class is exercised more deeply in Section G's own
    // command-class comparison.
    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });
    carolHistory.execute(opA);
    carolHistory.execute(opB);
    // Only B is ever broadcast directly — Dave recovers A through B's own gap.
    carol.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    await wait(60);

    assert(dave.recovered.some((r) => r.command.id === opA.id && r.provenance === DocumentOperationProvenance.RECOVERED), '7. A was recovered onto Dave\'s replica, never received normally');
    assert(daveTarget.commandHistory.getExecutedCommands().every((c) => c.id !== opA.id), '8. A was never executed on Dave\'s replica — recovery never applies');
    assert(daveTarget.commandHistory.getExecutedCommands().some((c) => c.id === opB.id), '9. B DID apply on Dave\'s replica — today\'s ARRIVAL_ORDER, unaffected by readiness');

    const bReadiness = evaluateApplicationReadiness(worldId, { operationId: opB.id, causalPredecessors: [opA.id] }, { causalGapDetector: dave.causalGapDetector, executionHistory: executionHistoryRegistry });
    assert(bReadiness.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE, '10. B is ELIGIBLE — A is causally known, via recovery');
    assert(bReadiness.readiness === DocumentOperationApplicationReadiness.NOT_READY, '11. B is NOT_READY — A is known but never actually applied. ELIGIBLE and NOT_READY genuinely coexist on the real chain, exactly as 0.9.234 predicted in isolation');

    recordMatrixRow('Recovered predecessor (known, not executed)', 'ELIGIBLE', 'NOT_READY', 'Apply (unchanged) — see Section H');

    unsubscribeApplication();
    unattachRecoveryHistory();
    // Deliberately NOT disposed yet — Section D continues this exact
    // scenario to observe what happens when A subsequently, actually
    // executes on Dave's replica.
    daveForSectionD = { dave, carol, daveTarget, carolHistory, worldId };
    opAForSectionD = opA;
    opBForSectionD = opB;
    carolFinalXForSectionD = brickX(carolDoc);
    console.log('✓ Section C: a recovered-but-never-executed predecessor makes a dependent ELIGIBLE yet NOT_READY on the real chain — and it still applies today, exactly like every other operation this codebase has ever received');
}

// ===================================================================
// Section D — Recovered predecessor later executed: continuing Section C's
// exact Dave/Carol scenario, A subsequently actually executes on Dave's
// own replica. Re-querying B's readiness now answers READY — but ONLY on
// deliberate re-query. Nothing here automatically replays, reorders, or
// re-applies B; B's own prior application (Section C) and its outcome are
// untouched.
//
// A discovery this section had to route around, and worth recording as
// part of this audit's own evidence: A canNOT be made to execute by simply
// re-broadcasting it over the normal channel, the way Section D was first
// drafted. `DocumentCommandPropagationUseCase._verify()`'s own comment
// explains why — "a retransmit of the SAME operationId, over EITHER this
// class's own protocol or a recovery response naming it, is recognized as
// a duplicate by the ONE ReplayGuard both channels now share." Recovery
// already verified A's envelope once (Section C); a second delivery of the
// identical operationId is silently rejected as DUPLICATE, same as any
// other replay. The only way A can ever actually reach `CommandHistory
// #execute()` on Dave's own replica, having already been recovered, is for
// Dave's own replica to apply the ALREADY-RECOVERED `Command` instance
// directly — exactly the shape a real causal-deferral mechanism
// (0.9.236A, if chosen) would have to take: apply from the recovery
// feed's own payload, never by asking the network to redeliver something
// ReplayGuard has already marked seen.
// ===================================================================
{
    const { dave, carol, daveTarget, worldId } = daveForSectionD;
    const beforeExecutedIds = daveTarget.commandHistory.getExecutedCommands().map((c) => c.id);

    const recoveredA = dave.recovered.find((r) => r.command.id === opAForSectionD.id);
    assert(recoveredA, '12. A is available as an already-verified, already-deserialized Command instance from the recovery feed itself');

    // A deliberate, explicit application — mirroring exactly what
    // RemoteDocumentOperationApplicationUseCase#apply() itself does
    // (`target.commandHistory.execute(command)`), just invoked directly
    // against the recovered Command rather than through propagation, since
    // propagation itself now refuses to redeliver this operationId.
    daveTarget.commandHistory.execute(recoveredA.command);

    assert(daveTarget.commandHistory.getExecutedCommands().some((c) => c.id === opAForSectionD.id), '13. A has now actually executed on Dave\'s replica');
    const afterExecutedIds = daveTarget.commandHistory.getExecutedCommands().map((c) => c.id);
    assert(JSON.stringify(afterExecutedIds) === JSON.stringify([...beforeExecutedIds, opAForSectionD.id]), '14. B was never re-applied and never reordered — A was simply appended after it');

    const bReadinessAfter = evaluateApplicationReadiness(worldId, { operationId: opBForSectionD.id, causalPredecessors: [opAForSectionD.id] }, { causalGapDetector: dave.causalGapDetector, executionHistory: executionHistoryRegistry });
    assert(bReadinessAfter.readiness === DocumentOperationApplicationReadiness.READY, '15. re-querying B now answers READY, now that A has actually executed');

    // Convergence check for THIS command class: MoveBrickCommand applies a
    // relative delta, so the FINAL position converges to the same value
    // regardless of the order the two deltas were actually applied in —
    // Dave applied B (+2) before A (+1); Carol applied A (+1) before B
    // (+2); both replicas land on the identical final x.
    const daveFinalX = brickX(dave.state.target.document);
    assert(daveFinalX === carolFinalXForSectionD, '16. Dave\'s final brick position, despite applying B before A, converges to the SAME value Carol\'s replica reached applying them in true causal order — for this delta-based command class, applying a NOT_READY operation is semantically harmless once its predecessor catches up');

    recordMatrixRow('Recovered predecessor, later actually executed', 'ELIGIBLE', 'READY', 'Apply (unchanged) — readiness transitions only on explicit re-query');

    dave.dispose();
    carol.dispose();
    console.log('✓ Section D: NOT_READY transitions to READY only once the missing execution fact genuinely exists, on deliberate re-query — never automatically — and for a commutative command class the two replicas silently reconverge anyway');
}

// ===================================================================
// Section E — Concurrent operations: A -> {B, C}. B and C each name ONLY
// A, never each other. Both are independently READY once A executes;
// neither's readiness is affected by the other's existence, arrival
// order, or own readiness. Concurrency is never mistaken for mutual
// blocking.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-235-e', aliceDevice.identity.identityId, 'Section E');
    const wired = wireReceiver(bob, target, executionHistoryRegistry);

    const opA = moveCommand('doc-235-e', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-235-e', command: opA, causalPredecessors: [] });
    await wait(20);

    const opC = moveCommand('doc-235-e', { x: 3, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-235-e', command: opC, causalPredecessors: [opA.id] });
    await wait(20);
    const opB = moveCommand('doc-235-e', { x: 2, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-235-e', command: opB, causalPredecessors: [opA.id] });
    await wait(20);

    const bReadiness = wired.readinessObservations.find((o) => o.operationId === opB.id);
    const cReadiness = wired.readinessObservations.find((o) => o.operationId === opC.id);
    assert(bReadiness.readiness === DocumentOperationApplicationReadiness.READY, '16. B, concurrent with C, is READY on its own merits');
    assert(cReadiness.readiness === DocumentOperationApplicationReadiness.READY, '17. C, concurrent with B, is READY on its own merits');
    assert(target.commandHistory.getExecutedCommands().length === 3, '18. all three applied — concurrency never blocks anything');

    recordMatrixRow('Concurrent operations (shared predecessor only)', 'ELIGIBLE', 'READY (independently)', 'Apply (unchanged)');
    wired.dispose();
    console.log('✓ Section E: concurrent operations are independently READY — a sibling\'s existence or readiness never blocks the other');
}

// ===================================================================
// Section F — Conflicting concurrent operations: two RenameGroupCommand
// operations that both name the SAME sole predecessor A (two competing
// renames, modelling "rename to Alice" vs "rename to Bob") are BOTH READY
// once A executes. Readiness is a causal-graph question, not a
// conflict-resolution mechanism — it must never answer which one wins.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-235-f', aliceDevice.identity.identityId, 'Section F');
    const wired = wireReceiver(bob, target, executionHistoryRegistry);

    const opA = moveCommand('doc-235-f', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-235-f', command: opA, causalPredecessors: [] });
    await wait(20);

    const renameToAlice = new RenameGroupCommand({ worldId: 'doc-235-f', groupId: 'group-1', name: 'Alice' });
    const renameToBob = new RenameGroupCommand({ worldId: 'doc-235-f', groupId: 'group-1', name: 'Bob' });
    alice.propagation.broadcastCommand({ documentId: 'doc-235-f', command: renameToAlice, causalPredecessors: [opA.id] });
    await wait(20);
    alice.propagation.broadcastCommand({ documentId: 'doc-235-f', command: renameToBob, causalPredecessors: [opA.id] });
    await wait(20);

    const aliceReadiness = wired.readinessObservations.find((o) => o.operationId === renameToAlice.id);
    const bobReadiness = wired.readinessObservations.find((o) => o.operationId === renameToBob.id);
    assert(aliceReadiness.readiness === DocumentOperationApplicationReadiness.READY, '19. the first conflicting rename is READY');
    assert(bobReadiness.readiness === DocumentOperationApplicationReadiness.READY, '20. the second, semantically conflicting rename is ALSO READY');
    assert(target.commandHistory.getExecutedCommands().length === 3, '21. both conflicting renames applied — readiness never arbitrated a winner');
    assert(groupName(target.document) === 'Bob', '22. the LAST-applied rename won, by ordinary ARRIVAL_ORDER last-write-wins — readiness took no part in deciding this, and never claims to');

    recordMatrixRow('Conflicting concurrent operations (same predecessor)', 'ELIGIBLE (both)', 'READY (both)', 'Apply both — last write wins, unrelated to readiness');
    wired.dispose();
    console.log('✓ Section F: two causally-eligible, causally-ready, but semantically conflicting operations are BOTH READY — readiness never decides a winner; that remains a future conflict-resolution policy\'s job');
}

// ===================================================================
// Section G — Command-class sensitivity: readiness itself must answer
// identically for a commutative command pair (MoveBrickCommand, "position
// += delta") and a non-commutative one (RenameGroupCommand, "name =
// absolute value") — proving readiness(A/B) is computed independently of
// whatever conflict/commutativity properties the underlying Document
// command happens to have.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-235-g', aliceDevice.identity.identityId, 'Section G');
    const wired = wireReceiver(bob, target, executionHistoryRegistry);

    const opA = moveCommand('doc-235-g', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-235-g', command: opA, causalPredecessors: [] });
    await wait(20);

    // A commutative dependent: another position delta.
    const opMoveB = moveCommand('doc-235-g', { x: 5, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-235-g', command: opMoveB, causalPredecessors: [opA.id] });
    await wait(20);
    // A non-commutative dependent: an absolute rename.
    const opRenameB = new RenameGroupCommand({ worldId: 'doc-235-g', groupId: 'group-1', name: 'Renamed' });
    alice.propagation.broadcastCommand({ documentId: 'doc-235-g', command: opRenameB, causalPredecessors: [opA.id] });
    await wait(20);

    const moveReadiness = wired.readinessObservations.find((o) => o.operationId === opMoveB.id);
    const renameReadiness = wired.readinessObservations.find((o) => o.operationId === opRenameB.id);
    assert(moveReadiness.readiness === DocumentOperationApplicationReadiness.READY, '23. the commutative dependent is READY once its predecessor executes');
    assert(renameReadiness.readiness === DocumentOperationApplicationReadiness.READY, '24. the NON-commutative dependent is ALSO READY, by the identical rule — readiness never inspects command type or payload');
    assert(moveReadiness.eligibility === renameReadiness.eligibility && moveReadiness.readiness === renameReadiness.readiness, '25. readiness(A/B) is identical in SHAPE for both command classes: readiness != conflict resolution, and readiness != commutativity analysis');

    wired.dispose();
    console.log('✓ Section G: readiness answers identically for a commutative and a non-commutative command class — it is a pure causal-execution fact, blind to what the command itself does');
}

// ===================================================================
// Section H — THE SEMANTIC-ACCEPTABILITY FINDING. Section D already showed
// that applying a NOT_READY MoveBrickCommand (a commutative, relative
// delta) is harmless: once its predecessor catches up, the two replicas
// silently reconverge. This section runs the IDENTICAL shape of scenario
// against RenameGroupCommand (a non-commutative, absolute overwrite) and
// finds the opposite: applying a NOT_READY dependent, then later letting
// its predecessor catch up, permanently and SILENTLY discards the
// dependent's own edit — a real, observable divergence between replicas
// that pure causal knowledge (ELIGIBLE) never revealed and that today's
// ARRIVAL_ORDER policy never guards against.
// ===================================================================
{
    const carolDevice = makeDevice('Carol-235h');
    const daveDevice = makeDevice('Dave-235h');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-235h', carolDevice, 'dave-235h', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-235-h';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'Section H (carol)', groupName: 'Original' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'Section H (dave)', groupName: 'Original' });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: new CommandHistory({ world: daveDoc.world }) };
    dave.state.target = daveTarget;
    executionHistoryRegistry.register(worldId, daveTarget.commandHistory);
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const unsubscribeApplication = applicationUseCase.attachToPropagation(dave.propagation, () => daveTarget);

    // A: "Original" -> "Draft". B (causally follows A): "Draft" -> "Draft-Reviewed".
    const opA = new RenameGroupCommand({ worldId, groupId: 'group-1', name: 'Draft' });
    const opB = new RenameGroupCommand({ worldId, groupId: 'group-1', name: 'Draft-Reviewed' });
    carolHistory.execute(opA);
    carolHistory.execute(opB);
    assert(groupName(carolDoc) === 'Draft-Reviewed', '26. Carol\'s own replica, applying in true causal order, ends with the intended final name');

    // Only B is ever broadcast — Dave recovers A (KNOWN, never EXECUTED),
    // and B applies immediately on Dave under ARRIVAL_ORDER while NOT_READY
    // — exactly Section C's own central case, now for an absolute-write
    // command.
    carol.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    await wait(60);
    assert(daveTarget.commandHistory.getExecutedCommands().some((c) => c.id === opB.id), '27. B applied on Dave despite being NOT_READY, exactly like Section C');
    assert(groupName(daveDoc) === 'Draft-Reviewed', '28. immediately after B applies, Dave\'s group name matches Carol\'s — no divergence YET');

    // A's already-recovered Command instance now actually executes on
    // Dave's own replica — the SAME "later catch-up" shape, and the SAME
    // ReplayGuard-driven necessity, as Section D: A cannot be redelivered
    // through the normal channel (already recorded as seen the moment
    // recovery verified it), so this applies the recovered Command
    // directly, exactly as a real catch-up mechanism would have to.
    // Nothing in this codebase checks readiness before calling
    // CommandHistory#execute() — this call is unconditional, mirroring
    // exactly what RemoteDocumentOperationApplicationUseCase#apply() does.
    const recoveredA = dave.recovered.find((r) => r.command.id === opA.id);
    assert(recoveredA, '29a. A is available as an already-verified, already-deserialized Command instance from the recovery feed itself');
    daveTarget.commandHistory.execute(recoveredA.command);
    assert(daveTarget.commandHistory.getExecutedCommands().some((c) => c.id === opA.id), '29. A has now also actually executed on Dave\'s replica');

    const daveFinalName = groupName(daveDoc);
    const carolFinalName = groupName(carolDoc);
    assert(daveFinalName === 'Draft', '30. A\'s belated, out-of-causal-order execution SILENTLY OVERWROTE B\'s already-applied edit — Dave\'s group is now named "Draft", the value A itself carries, discarding "Draft-Reviewed" entirely');
    assert(daveFinalName !== carolFinalName, '31. Dave\'s replica has now PERMANENTLY DIVERGED from Carol\'s ("Draft" vs "Draft-Reviewed") — a real, observable data-loss bug, produced entirely by applying a NOT_READY absolute-overwrite operation and only ever visible once readiness is computed against real execution history');

    unsubscribeApplication();
    unattachRecoveryHistory();
    dave.dispose();
    carol.dispose();
    recordMatrixRow('Absolute-write command, applied while NOT_READY, predecessor later catches up', 'ELIGIBLE', 'NOT_READY -> READY', 'Applied — SILENT DIVERGENCE (see Recommendation)');
    console.log('✗ (expected) Section H: for an absolute-overwrite command class, applying a NOT_READY operation is NOT semantically safe — a later-arriving causal predecessor can silently discard an already-applied dependent\'s edit, producing permanent, undetected replica divergence that neither ELIGIBLE nor today\'s ARRIVAL_ORDER policy ever surfaces');
}

// ===================================================================
// Section I — The compact behavioral matrix, assembled from the REAL
// observations recorded in Sections A-H above (never hand-typed), printed
// as this milestone's own most valuable output.
// ===================================================================
{
    console.log('\n0.9.235 — Causal Readiness Enforcement Decision Audit — behavioral matrix:\n');
    const header = '| Causal state | Eligibility | Readiness | Current behavior |';
    const divider = '| --- | --- | --- | --- |';
    console.log(header);
    console.log(divider);
    for (const row of matrixRows) {
        console.log(`| ${row.causalState} | ${row.eligibility} | ${row.readiness} | ${row.currentBehavior} |`);
    }
    assert(matrixRows.length === 7, '32. every flagship scenario (A, B, C, D, E, F, H) contributed exactly one row to the matrix');
    console.log('');
}

alice.propagation.dispose();
bob.propagation.dispose();

console.log('\n0.9.235 — the audit is complete. Q4 (readiness) is now proven, against the REAL recovery + propagation + application chain, to be exactly as diagnostic today as Q3 (eligibility) was proven to be in 0.9.233: NOT_READY gates nothing, defers nothing, and buffers nothing anywhere in this codebase. But this audit also found what 0.9.233\'s own eligibility audit structurally could not: whether that diagnosis is actually SAFE to leave unenforced depends entirely on the command class involved. For a commutative, relative command (MoveBrickCommand) applying while NOT_READY is harmless — the replica reconverges the moment its predecessor catches up (Section D). For an absolute-overwrite command (RenameGroupCommand) it is NOT — a predecessor that catches up AFTER its dependent has already applied silently discards that dependent\'s edit, a real, permanent, currently-undetected divergence (Section H). See this file\'s own closing Recommendation.');

}

runTests().then(() => {
    console.log('\n✓ All CausalReadinessEnforcementDecisionAudit tests passed');
}).catch((error) => {
    console.error('\n✗ CausalReadinessEnforcementDecisionAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
