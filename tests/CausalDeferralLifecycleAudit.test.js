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
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { CommandHistoryEvent } from '../application/events/CommandHistoryEvent.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { RenameGroupCommand } from '../application/commands/RenameGroupCommand.js';
import {
    DocumentCommandPropagationUseCase,
    DocumentOperationRejectionReason
} from '../application/DocumentCommandPropagationUseCase.js';
import { DocumentOperationCausalGapDetector } from '../core/DocumentOperationCausalGapDetector.js';
import { DocumentOperationCausalGapObservationUseCase } from '../application/DocumentOperationCausalGapObservationUseCase.js';
import { DocumentOperationRecoveryUseCase } from '../application/DocumentOperationRecoveryUseCase.js';
import { RecoveredOperationReplayUseCase } from '../application/RecoveredOperationReplayUseCase.js';
import {
    DocumentOperationDeferralUseCase,
    DocumentOperationDeferralOutcome
} from '../application/DocumentOperationDeferralUseCase.js';
import { EditorSession } from '../application/EditorSession.js';
import { DocumentOperationApplicationEligibility } from '../core/DocumentOperationApplicationEligibility.js';
import {
    DocumentOperationApplicationReadiness,
    evaluateApplicationReadiness
} from '../core/DocumentOperationApplicationReadiness.js';

// 0.9.239 — Comprehensive Causal Deferral Lifecycle Audit.
//
// 0.9.237 built the fix (`DocumentOperationDeferralUseCase`): a NOT_READY
// remote operation is retained, never applied, until its named causal
// predecessors actually execute. 0.9.238 brought the policy descriptor
// (`RemoteApplicationTiming.CAUSAL_READINESS`) back in sync with that
// runtime behavior and proved the match on the simplest possible shape,
// `A -> B`. This suite is the stress test 0.9.238's own "Recommendation"
// named: the identical invariant, against collaboration graphs
// substantially more complicated than one edge — chains, diamonds,
// independent branches, recovery/replay matrices, duplicate/replay
// stress, local/remote interleaving on one shared CommandHistory, failure
// isolation under a real cascading release, and session/document
// lifecycle — plus a final conformance matrix proving runtime behavior
// corresponds exactly to what the policy descriptor now claims.
//
// The flagship invariant every section below exists to stress:
//
//   An operation is applied only after every explicitly named causal
//   predecessor has actually EXECUTED, while causally independent
//   operations remain independently applicable.
//
// Test-only, same lineage as 0.9.237/0.9.238: no new policy vocabulary,
// no new provenance, no new recovery mechanism, no retry, no
// retransmission, no queue redesign, no ordering protocol, no conflict
// resolution, no CRDT/OT, no synchronized undo, no convergence guarantee,
// no commutativity classification. Every section runs against the real,
// unmodified 0.9.222-0.9.238 chain — real `DocumentOperationDeferralUseCase`,
// real propagation/recovery/replay stacks, real `CommandHistory`
// instances, a real `EditorSession` for the lifecycle sections — the same
// "never a synthetic stand-in" discipline this whole lineage already
// applies to itself.

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

// A lightweight, direct (no network) harness — the same posture
// tests/DocumentOperationDeferralUseCase.test.js's own
// makeDeferralHarness() already established.
function makeDeferralHarness(worldId, { groupName = 'Original' } = {}) {
    const document = buildBaseDocument({ worldId, authorIdentityId: 'author-1', title: worldId, groupName });
    const commandHistory = new CommandHistory({ world: document.world });
    const causalGapDetector = new DocumentOperationCausalGapDetector();
    const deferral = new DocumentOperationDeferralUseCase({ causalGapDetector });
    const unattach = deferral.attachCommandHistory({ documentId: worldId, commandHistory });
    const target = { documentId: worldId, commandHistory };
    return { document, commandHistory, causalGapDetector, deferral, target, unattach };
}

// Mirrors production ordering exactly (application/EditorSession.js's own
// 0.9.229 comment on receive ordering): a causal-gap OBSERVATION step
// records an arriving operation's own causal identity (Q2) BEFORE
// readiness (Q3/Q4) is ever evaluated for anything naming it as a
// predecessor. Same helper shape as
// tests/DocumentOperationDeferralUseCase.test.js's own receiveOperation().
function receiveOperation(harness, { documentId, command, authorIdentityId = 'alice', causalPredecessors = [] }, target = harness.target) {
    harness.causalGapDetector.record(documentId, command.id, causalPredecessors);
    return harness.deferral.receive({ documentId, command, authorIdentityId, causalPredecessors }, target);
}

// A full, real, peer-authenticated propagation + recovery + replay stack,
// wired exactly the way application/EditorSession.js wires them — the
// same helper shape tests/DocumentOperationDeferralUseCase.test.js's own
// makeFullStack() and tests/CollaborationConsistencyPolicyCausalReadinessAudit.test.js's
// own makeFullStack() already establish.
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

// -----------------------------------------------------------------------
// EditorSession harness (Section 8 only) — mirrors
// tests/EditorRuntimeCollaboration.test.js's own makeEditorRuntimeStack()/
// stubRenderSession()/openDocumentInSession() exactly, extended to ALSO
// reproduce the 0.9.237 deferral half of _rebuild()/_teardown() (that
// file predates 0.9.237, so its own openDocumentInSession() only ever
// reproduced the propagation half) — real _rebuild()/_teardown() always
// wire/tear down both attachments together, never one without the other.
// -----------------------------------------------------------------------

function stubRenderSession() {
    return {
        pick() { return null; }, pickGround() { return null; }, pickPlacement() { return null; },
        setControlsEnabled() {},
        showGizmo() {}, hideGizmo() {},
        gizmoPointerDown() { return null; }, gizmoPointerMove() { return null; }, gizmoPointerUp() { return null; },
        gizmoKeyDown() { return false; },
        getCameraState() { return { position: { x: 0, y: 0, z: 0 }, target: { x: 0, y: 0, z: 0 }, zoom: 1 }; },
        setCameraState() {},
        dispose() {}
    };
}

function makeEditorRuntimeStack(device) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const registry = new CreateBrickRegistryUseCase().execute();
    const editorContext = new CreateEditorContextUseCase().execute();
    const documentManager = new DocumentManager();
    const selectionUseCase = new SelectionUseCase(editorContext);

    const documentCommandPropagation = new DocumentCommandPropagationUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        identityProvider: device.provider, commandRegistry,
        resolveDocument: (id) => (
            documentManager.document && documentManager.document.world.id === id
                ? documentManager.document
                : null
        )
    });
    const rejected = [];
    documentCommandPropagation.onOperationRejected((reason, envelope) => rejected.push({ reason, envelope }));

    const editorSession = new EditorSession({
        registry, editorContext, toolRegistry: null, documentManager, selectionUseCase,
        previewUseCase: new PreviewUseCase(editorContext),
        loadDocumentUseCase: null,
        identityProvider: device.provider,
        documentCommandPropagation
    });
    editorSession._session = stubRenderSession();

    return { device, peerMessageBus, connectedPeerRegistry, documentManager, documentCommandPropagation, editorSession, rejected };
}

// Reproduces the TWO per-document attachments real _rebuild()/_teardown()
// wire/tear down together: propagation's outgoing attachCommandHistory()
// (0.9.224, reproduced by tests/EditorRuntimeCollaboration.test.js's own
// identically-named helper) AND the 0.9.237 deferral boundary's own
// per-document attachCommandHistory() — never one without the other, or a
// stale attachment from a previous document would keep answering Q4
// against the WRONG CommandHistory instance.
function openDocumentInSession(session, document) {
    if (session._unattachCommandHistoryPropagation) {
        session._unattachCommandHistoryPropagation();
        session._unattachCommandHistoryPropagation = null;
    }
    if (session._unattachDeferralCommandHistory) {
        session._unattachDeferralCommandHistory();
        session._unattachDeferralCommandHistory = null;
    }
    session._documentManager.newDocument(document);
    session._commandHistory = new CommandHistory({ world: document.world });
    session._unattachCommandHistoryPropagation = session._documentCommandPropagation
        ? session._documentCommandPropagation.attachCommandHistory({
            documentId: document.world.id,
            commandHistory: session._commandHistory
        })
        : null;
    session._unattachDeferralCommandHistory = session._documentOperationDeferral.attachCommandHistory({
        documentId: document.world.id,
        commandHistory: session._commandHistory
    });
    return session._commandHistory;
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

// ===================================================================
// Section 1 — Linear chain: A -> B -> C -> D, delivered in reverse
// (D, C, B, A). Every dependent is deferred on arrival; A's own arrival
// (genesis) cascades the release through B, C, and D in ONE call, in
// true causal order, despite arriving in the exact opposite order.
// ===================================================================
{
    const worldId = 'doc-239-chain';
    const harness = makeDeferralHarness(worldId);
    const { commandHistory, deferral, document } = harness;
    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });
    const opC = moveCommand(worldId, { x: 4, y: 0, z: 0 });
    const opD = moveCommand(worldId, { x: 8, y: 0, z: 0 });

    const outcomeD = receiveOperation(harness, { documentId: worldId, command: opD, causalPredecessors: [opC.id] });
    const outcomeC = receiveOperation(harness, { documentId: worldId, command: opC, causalPredecessors: [opB.id] });
    const outcomeB = receiveOperation(harness, { documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    assert(outcomeD === DocumentOperationDeferralOutcome.DEFERRED && outcomeC === DocumentOperationDeferralOutcome.DEFERRED && outcomeB === DocumentOperationDeferralOutcome.DEFERRED,
        '1. D, C, and B are each DEFERRED on arrival, delivered in the exact reverse of causal order');
    assert(deferral.getDeferredOperationIds(worldId).length === 3, '2. all three sit retained');
    assert(brickX(document) === 0, '3. the document is completely untouched while every dependent sits deferred');

    const outcomeA = receiveOperation(harness, { documentId: worldId, command: opA, causalPredecessors: [] });
    assert(outcomeA === DocumentOperationDeferralOutcome.APPLIED, '4. A, the genesis operation, applies immediately');

    assert(brickX(document) === 15, '5. A releases B releases C releases D in ONE cascade: 1+2+4+8=15');
    const executedIds = commandHistory.getExecutedCommands().map((c) => c.id);
    assert(executedIds.length === 4 && executedIds[0] === opA.id && executedIds[1] === opB.id && executedIds[2] === opC.id && executedIds[3] === opD.id,
        '6. true causal order A, B, C, D — despite arriving D, C, B, A');
    assert(deferral.getDeferredOperationIds(worldId).length === 0, '7. nothing left retained');
    console.log('✓ Section 1: a linear chain delivered in complete reverse order still executes in true causal order, released by a single cascading release from the one genesis operation');
}

// ===================================================================
// Section 2 — Diamond: A -> {B, C} -> D, delivered in reverse (D, C, B),
// then A. D must remain deferred until BOTH B and C have actually
// executed — proven with a genuine temporal gap between B's own release
// and C's, never merely "eventually all three land." A second,
// simultaneous-release variant then proves B and C never acquire an
// artificial order relative to EACH OTHER when they DO become ready
// together.
// ===================================================================
{
    const worldId = 'doc-239-diamond';
    const harness = makeDeferralHarness(worldId);
    const { commandHistory, deferral, document } = harness;
    // B and C deliberately depend on TWO DIFFERENT predecessors, so they
    // can be released at genuinely different times — the strongest
    // possible proof that D's own gate is a real AND, not an artifact of
    // both predecessors always arriving together.
    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opA2 = moveCommand(worldId, { x: 10, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 100, y: 0, z: 0 });
    const opC = moveCommand(worldId, { x: 1000, y: 0, z: 0 });
    const opD = moveCommand(worldId, { x: 10000, y: 0, z: 0 });

    receiveOperation(harness, { documentId: worldId, command: opD, causalPredecessors: [opB.id, opC.id] });
    receiveOperation(harness, { documentId: worldId, command: opC, causalPredecessors: [opA2.id] });
    receiveOperation(harness, { documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    assert(deferral.getDeferredOperationIds(worldId).length === 3, '8. D, C, and B all deferred, delivered in reverse');
    assert(brickX(document) === 0, '9. document untouched');

    receiveOperation(harness, { documentId: worldId, command: opA, causalPredecessors: [] });
    assert(commandHistory.getExecutedCommands().some((c) => c.id === opB.id), '10. B releases: its own predecessor A executed');
    assert(!commandHistory.getExecutedCommands().some((c) => c.id === opC.id), '11. C is still deferred: its own predecessor A2 has not arrived at all yet');
    assert(deferral.getDeferredOperationIds(worldId).includes(opD.id) && deferral.getDeferredOperationIds(worldId).includes(opC.id),
        '12. D still deferred, naming BOTH B and C, with only B executed so far — a genuine temporal gap, never simultaneous');
    assert(!deferral.getDeferredOperationIds(worldId).includes(opB.id), '13. B itself is no longer retained');

    receiveOperation(harness, { documentId: worldId, command: opA2, causalPredecessors: [] });
    assert(commandHistory.getExecutedCommands().some((c) => c.id === opC.id), '14. C releases once its own predecessor A2 finally executes');
    assert(commandHistory.getExecutedCommands().some((c) => c.id === opD.id), '15. D releases the MOMENT both B and C have executed — never before');

    const executedIds = commandHistory.getExecutedCommands().map((c) => c.id);
    assert(executedIds[0] === opA.id && executedIds[1] === opB.id && executedIds[2] === opA2.id && executedIds[3] === opC.id && executedIds[4] === opD.id,
        '16. A, B, A2, C, D — honestly reflecting the real gap between Bs and Cs own release; nothing here imposes B-before-C as a RULE, only as what actually happened this time');
    assert(deferral.getDeferredOperationIds(worldId).length === 0, '17. nothing left retained');
    assert(brickX(document) === 11111, '18. 1+100+10+1000+10000');

    // Simultaneous variant: B and C share the SAME predecessor, so both
    // become READY together, in ONE release cascade.
    const worldId2 = 'doc-239-diamond-simultaneous';
    const harness2 = makeDeferralHarness(worldId2);
    const sA = moveCommand(worldId2, { x: 1, y: 0, z: 0 });
    const sB = moveCommand(worldId2, { x: 10, y: 0, z: 0 });
    const sC = moveCommand(worldId2, { x: 100, y: 0, z: 0 });
    const sD = moveCommand(worldId2, { x: 1000, y: 0, z: 0 });
    receiveOperation(harness2, { documentId: worldId2, command: sD, causalPredecessors: [sB.id, sC.id] });
    receiveOperation(harness2, { documentId: worldId2, command: sC, causalPredecessors: [sA.id] });
    receiveOperation(harness2, { documentId: worldId2, command: sB, causalPredecessors: [sA.id] });
    receiveOperation(harness2, { documentId: worldId2, command: sA, causalPredecessors: [] });
    assert(brickX(harness2.document) === 1111, '19. 1+10+100+1000, whichever order B and C actually released in');
    const simultaneousIds = harness2.commandHistory.getExecutedCommands().map((c) => c.id);
    assert(simultaneousIds[0] === sA.id, '20. A first');
    assert([simultaneousIds[1], simultaneousIds[2]].includes(sB.id) && [simultaneousIds[1], simultaneousIds[2]].includes(sC.id),
        '21. B and C occupy the next two slots in WHATEVER order this replicas own retained-map iteration happened to produce — never a declared or required order between them');
    assert(simultaneousIds[3] === sD.id, '22. D last, only once both are in');
    console.log('✓ Section 2: a diamond successor stays deferred until EVERY named predecessor has actually executed, proven with a genuine temporal gap between them, and its own two predecessors never acquire an artificial order relative to each other, whether released apart or together');
}

// ===================================================================
// Section 3 — Independent branches: A -> B and X -> Y, in the SAME
// document. A is missing; X is genesis and executes. B must stay
// NOT_READY/deferred while Y (depending on the ALREADY-executed X) is
// READY and applies immediately — proving deferral is never an
// accidental document-wide execution lock.
// ===================================================================
{
    const worldId = 'doc-239-branches';
    const harness = makeDeferralHarness(worldId);
    const { commandHistory, deferral, document } = harness;
    const missingAId = 'missing-predecessor-A';
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });
    const opX = moveCommand(worldId, { x: 5, y: 0, z: 0 });
    const opY = moveCommand(worldId, { x: 9, y: 0, z: 0 });

    const outcomeB = receiveOperation(harness, { documentId: worldId, command: opB, causalPredecessors: [missingAId] });
    assert(outcomeB === DocumentOperationDeferralOutcome.DEFERRED, '23. B is deferred: its own named predecessor A has never arrived');

    const outcomeX = receiveOperation(harness, { documentId: worldId, command: opX, causalPredecessors: [] });
    assert(outcomeX === DocumentOperationDeferralOutcome.APPLIED, '24. X, a wholly unrelated genesis operation, applies immediately — Bs own deferral is not a document-wide execution lock');

    const outcomeY = receiveOperation(harness, { documentId: worldId, command: opY, causalPredecessors: [opX.id] });
    assert(outcomeY === DocumentOperationDeferralOutcome.APPLIED, '25. Y (depends on X, already executed) is READY and applies immediately too');

    assert(brickX(document) === 14, '26. X + Y = 5 + 9 — B never contributed');
    assert(commandHistory.getExecutedCommands().length === 2, '27. exactly two operations executed: X and Y');
    assert(deferral.getDeferredOperationIds(worldId).length === 1 && deferral.getDeferredOperationIds(worldId)[0] === opB.id,
        '28. B alone remains retained, waiting on a predecessor that never arrives — Y never released it, and Ys own success never depended on it');
    console.log('✓ Section 3: independent branches sharing one document never interfere — a deferred B never blocks an unrelated genesis X or its own dependent Y');
}

// ===================================================================
// Section 4 — Recovery/replay matrix.
// ===================================================================

// --- 4a: the base case, restated as this milestone's own foundation ---
{
    const network = new LocalPeerNetwork();
    const carolDevice = makeDevice('Carol-239-recovery-simple');
    const daveDevice = makeDevice('Dave-239-recovery-simple');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-239-recovery-simple', carolDevice, 'dave-239-recovery-simple', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-239-recovery-simple';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'recovery simple (carol)' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'recovery simple (dave)' });
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
    assert(brickX(daveDoc) === 0, '29. B is NOT_READY (A unknown) — Daves document is untouched');

    await wait(80);
    assert(dave.recovered.some((r) => r.documentId === worldId && r.command.id === opA.id), '30. A was recovered (KNOWN) via the real recovery protocol');
    assert(brickX(daveDoc) === 0, '31. A = RECOVERED, B stays NOT_READY, B is not applied');
    assert(dave.deferral.getDeferredOperationIds(worldId).includes(opB.id), '32. B is still retained');

    const replayOutcome = dave.replay.replay({ documentId: worldId, operationId: opA.id }, daveTarget);
    assert(replayOutcome === 'REPLAYED', '33. explicit replay(A) succeeds');
    await wait(20);
    assert(brickX(daveDoc) === 3, '34. A = EXECUTED, B = READY, B executes');

    unattachRecoveryHistory(); unattachDeferralHistory(); carol.dispose(); dave.dispose();
    console.log('✓ Section 4a: the base recovery/replay case — A recovered, B deferred, explicit replay(A) releases B — the foundation for the longer chain below');
}

// --- 4b: a longer chain, with deliberately invalid replay attempts ---
{
    const network = new LocalPeerNetwork();
    const carolDevice = makeDevice('Carol-239-chain-recovery');
    const daveDevice = makeDevice('Dave-239-chain-recovery');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-239-chain-recovery', carolDevice, 'dave-239-chain-recovery', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-239-chain-recovery';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'chain recovery (carol)' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'chain recovery (dave)' });
    const daveHistory = new CommandHistory({ world: daveDoc.world });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: daveHistory };
    dave.state.target = daveTarget;
    const unattachDeferralHistory = dave.deferral.attachCommandHistory({ documentId: worldId, commandHistory: daveHistory });

    // A and B: both executed by Carol, never broadcast individually —
    // Dave will only ever learn of either via recovery.
    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });
    carolHistory.execute(opA);
    carolHistory.execute(opB);

    // opProbeA exists purely to make A's absence a real, OBSERVED causal
    // gap Dave requests recovery for — it is never itself released in
    // this section. C depends on B; D depends on C.
    const opProbeA = moveCommand(worldId, { x: 1000, y: 0, z: 0 });
    const opC = moveCommand(worldId, { x: 4, y: 0, z: 0 });
    const opD = moveCommand(worldId, { x: 8, y: 0, z: 0 });

    carol.propagation.broadcastCommand({ documentId: worldId, command: opProbeA, causalPredecessors: [opA.id] });
    carol.propagation.broadcastCommand({ documentId: worldId, command: opC, causalPredecessors: [opB.id] });
    carol.propagation.broadcastCommand({ documentId: worldId, command: opD, causalPredecessors: [opC.id] });
    await wait(60);
    assert(brickX(daveDoc) === 0, '35. nothing applies yet: opProbeA/opC each name a predecessor Dave has never received');
    assert(dave.deferral.getDeferredOperationIds(worldId).length === 3, '36. all three deferred (opProbeA, opC waiting on B, opD waiting on C)');

    await wait(120); // the gap-observation -> recovery-request -> Carols response round trips for A and B
    assert(dave.recovered.some((r) => r.command.id === opA.id) && dave.recovered.some((r) => r.command.id === opB.id),
        '37. both A and B recovered (KNOWN) via the real recovery protocol');
    assert(brickX(daveDoc) === 0, '38. recovering A and B releases nothing on its own');
    assert(dave.deferral.getDeferredOperationIds(worldId).length === 3, '39. all three still deferred — recovery is knowledge, never execution; the system never infers execution from recovery');

    // Deliberately INVALID replay attempts: C and D were never themselves
    // recovered — they arrived through ordinary propagation and are simply
    // deferred. replay() only ever knows about genuinely RECOVERED
    // operations, so attempting to shortcut a deferred dependent this way
    // must fail cleanly, mutate nothing, and never throw.
    assert(dave.replay.replay({ documentId: worldId, operationId: opC.id }, daveTarget) === 'NOT_REPLAYED',
        '40. replay(C) fails: C was received ordinarily and deferred, never recovered — there is no recovered Command instance to replay');
    assert(dave.replay.replay({ documentId: worldId, operationId: opD.id }, daveTarget) === 'NOT_REPLAYED',
        '41. replay(D) fails for the identical reason');
    assert(brickX(daveDoc) === 0, '42. neither invalid replay attempt mutated Daves document');
    assert(dave.deferral.getDeferredOperationIds(worldId).length === 3, '43. and neither touched the deferred set');

    // The VALID replay: B really was recovered. Replaying it makes B
    // EXECUTED, which cascades through the ordinary deferral release chain
    // — C (names B) releases, and Cs own execution releases D (names C) —
    // all from this ONE explicit call, without C or D ever being replayed
    // directly.
    const replayB = dave.replay.replay({ documentId: worldId, operationId: opB.id }, daveTarget);
    assert(replayB === 'REPLAYED', '44. replay(B) succeeds: B really was recovered');
    await wait(20);

    assert(brickX(daveDoc) === 14, '45. B + C + D = 2 + 4 + 8, all released by replaying B alone');
    let executedIds = daveHistory.getExecutedCommands().map((c) => c.id);
    assert(executedIds.length === 3 && executedIds[0] === opB.id && executedIds[1] === opC.id && executedIds[2] === opD.id,
        '46. true causal order B, C, D — despite C and D having arrived (and been deferred) before B was ever recovered, let alone replayed');
    assert(dave.deferral.getDeferredOperationIds(worldId).length === 1 && dave.deferral.getDeferredOperationIds(worldId)[0] === opProbeA.id,
        '47. only the still-unrelated opProbeA (waiting on A, never replayed yet) remains deferred');

    // A itself can still be replayed afterward, independently — replay()
    // imposes no order of its own relative to B, since nothing here ever
    // declared A a predecessor of B.
    const replayA = dave.replay.replay({ documentId: worldId, operationId: opA.id }, daveTarget);
    assert(replayA === 'REPLAYED', '48. replay(A), called AFTER replay(B)/C/D, still succeeds — replay() enforces no order of its own between independently recovered operations');
    await wait(20);
    assert(brickX(daveDoc) === 1015, '49. A finally lands (+1), and its own dependent opProbeA (+1000) releases through the identical cascade');
    assert(dave.deferral.getDeferredOperationIds(worldId).length === 0, '50. nothing left retained');

    // Duplicate replay attempt, now that B has already executed.
    assert(dave.replay.replay({ documentId: worldId, operationId: opB.id }, daveTarget) === 'NOT_REPLAYED',
        '51. replay(B) a second time is NOT_REPLAYED: B already executed');
    assert(daveHistory.getExecutedCommands().filter((c) => c.id === opB.id).length === 1, '52. B is still in Daves history exactly once');

    unattachRecoveryHistory(); unattachDeferralHistory(); carol.dispose(); dave.dispose();
    console.log('✓ Section 4b: a longer recovered chain (A, B recovered; C depends on B; D depends on C), with deliberately invalid replay attempts against never-recovered operations rejected cleanly — the system never infers execution from recovery, and replay() imposes no order of its own between independently recovered operations');
}

// ===================================================================
// Section 5 — Duplicate and replay stress.
// ===================================================================

// --- 5a: B delivered four times while deferred ---
{
    const worldId = 'doc-239-duplicate-stress';
    const harness = makeDeferralHarness(worldId);
    const { commandHistory, deferral } = harness;
    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const sharedId = 'op-239-duplicate-b';
    const deliveries = [
        moveCommand(worldId, { x: 2, y: 0, z: 0 }, { id: sharedId }),
        moveCommand(worldId, { x: 20, y: 0, z: 0 }, { id: sharedId }),
        moveCommand(worldId, { x: 200, y: 0, z: 0 }, { id: sharedId }),
        moveCommand(worldId, { x: 2000, y: 0, z: 0 }, { id: sharedId })
    ];
    for (const delivery of deliveries) {
        const outcome = receiveOperation(harness, { documentId: worldId, command: delivery, causalPredecessors: [opA.id] });
        assert(outcome === DocumentOperationDeferralOutcome.DEFERRED, '53. every one of the four duplicate deliveries of B is DEFERRED, never an error');
    }
    assert(deferral.getDeferredOperationIds(worldId).filter((id) => id === sharedId).length === 1, '54. only ONE deferred representation survives four deliveries');

    receiveOperation(harness, { documentId: worldId, command: opA, causalPredecessors: [] });
    const executedForShared = commandHistory.getExecutedCommands().filter((c) => c.id === sharedId);
    assert(executedForShared.length === 1, '55. B executes exactly once, regardless of four separate deliveries');
    assert(executedForShared[0] === deliveries[0], '56. the FIRST verified instance is the one that survives and executes');
    console.log('✓ Section 5a: four duplicate deliveries of the same deferred operation still collapse to one retained instance, executed exactly once');
}

// --- 5b: duplicate recovery responses, and a duplicate replay attempt ---
{
    const network = new LocalPeerNetwork();
    const carolDevice = makeDevice('Carol-239-dup-recovery');
    const daveDevice = makeDevice('Dave-239-dup-recovery');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-239-dup-recovery', carolDevice, 'dave-239-dup-recovery', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-239-dup-recovery';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'dup recovery (carol)' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'dup recovery (dave)' });
    const daveHistory = new CommandHistory({ world: daveDoc.world });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: daveHistory };
    dave.state.target = daveTarget;
    const unattachDeferralHistory = dave.deferral.attachCommandHistory({ documentId: worldId, commandHistory: daveHistory });

    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    carolHistory.execute(opA);

    // TWO independent dependents, BOTH naming the SAME missing predecessor
    // A — each of their own arrivals is an independent GAP observation on
    // A, so the pre-existing 0.9.229/0.9.230 machinery may reasonably issue
    // more than one recovery REQUEST for the identical operationId.
    const opDep1 = moveCommand(worldId, { x: 3, y: 0, z: 0 });
    const opDep2 = moveCommand(worldId, { x: 30, y: 0, z: 0 });
    carol.propagation.broadcastCommand({ documentId: worldId, command: opDep1, causalPredecessors: [opA.id] });
    carol.propagation.broadcastCommand({ documentId: worldId, command: opDep2, causalPredecessors: [opA.id] });
    await wait(150);

    assert(dave.deferral.getDeferredOperationIds(worldId).length === 2, '57. both dependents deferred');
    const recoveredACount = dave.recovered.filter((r) => r.command.id === opA.id).length;
    assert(recoveredACount === 1,
        '58. even though BOTH dependents may have triggered their own recovery request for A, ReplayGuard collapses redelivery of the identical operationId to exactly ONE accepted, verified recovery');

    const replayOutcome = dave.replay.replay({ documentId: worldId, operationId: opA.id }, daveTarget);
    assert(replayOutcome === 'REPLAYED', '59. a single explicit replay(A)');
    await wait(20);

    assert(brickX(daveDoc) === 34, '60. A + Dep1 + Dep2 = 1 + 3 + 30, BOTH dependents released by the ONE replay');
    assert(daveHistory.getExecutedCommands().filter((c) => c.id === opA.id).length === 1, '61. A itself executed exactly once, never duplicated by the redundant recovery attempt');
    assert(dave.deferral.getDeferredOperationIds(worldId).length === 0, '62. nothing left retained');

    // Duplicate replay attempt: A already executed.
    const secondReplayOutcome = dave.replay.replay({ documentId: worldId, operationId: opA.id }, daveTarget);
    assert(secondReplayOutcome === 'NOT_REPLAYED', '63. a second explicit replay(A) attempt is NOT_REPLAYED: A already executed');
    assert(daveHistory.getExecutedCommands().filter((c) => c.id === opA.id).length === 1, '64. still exactly one A in Daves history after the duplicate replay attempt');

    unattachRecoveryHistory(); unattachDeferralHistory(); carol.dispose(); dave.dispose();
    console.log('✓ Section 5b: duplicate recovery responses for the same operationId collapse to exactly one accepted recovery, and a duplicate replay attempt on an already-executed operation is a safe no-op');
}

// --- 5c: predecessor execution followed by a late duplicate delivery ---
{
    const network = new LocalPeerNetwork();
    const aliceDevice = makeDevice('Alice-239-late-dup');
    const bobDevice = makeDevice('Bob-239-late-dup');
    const alice = makeFullStack(aliceDevice);
    const bob = makeFullStack(bobDevice);
    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-239-late-dup', aliceDevice, 'bob-239-late-dup', bobDevice);
    alice.connectedPeerRegistry.add(peerA);
    bob.connectedPeerRegistry.add(peerB);

    const worldId = 'doc-239-late-duplicate';
    const bobDoc = buildBaseDocument({ worldId, authorIdentityId: aliceDevice.identity.identityId, title: 'late duplicate' });
    const bobHistory = new CommandHistory({ world: bobDoc.world });
    const bobTarget = { documentId: worldId, document: bobDoc, commandHistory: bobHistory };
    bob.state.target = bobTarget;
    const unattach = bob.deferral.attachCommandHistory({ documentId: worldId, commandHistory: bobHistory });

    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const opB = moveCommand(worldId, { x: 2, y: 0, z: 0 });

    alice.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    await wait(60);
    alice.propagation.broadcastCommand({ documentId: worldId, command: opA, causalPredecessors: [] });
    await wait(60);
    assert(brickX(bobDoc) === 3, '65. A executes, releasing B — the ordinary flagship sequence');
    assert(bobHistory.getExecutedCommands().length === 2, '66. exactly two commands executed so far');

    // A LATE DUPLICATE: Alice's own network layer (a naive retry, a
    // reconnect replay, anything) redelivers the IDENTICAL A a second time,
    // well after it already executed on Bobs replica.
    alice.propagation.broadcastCommand({ documentId: worldId, command: opA, causalPredecessors: [] });
    await wait(60);

    assert(bobHistory.getExecutedCommands().length === 2, '67. still exactly two commands: the redelivered A never reached receive() at all');
    assert(bobHistory.getExecutedCommands().filter((c) => c.id === opA.id).length === 1, '68. A appears exactly once in Bobs history');
    assert(brickX(bobDoc) === 3, '69. Bobs document is unchanged by the late duplicate');
    assert(bob.deferral.getDeferredOperationIds(worldId).length === 0, '70. nothing spuriously retained either');

    // The boundary that actually stopped it is ReplayGuard, at
    // DocumentCommandPropagationUseCase's own trust boundary — never a
    // second deduplication mechanism inside DocumentOperationDeferralUseCase
    // itself, which only ever protects its own DEFERRED map (Section 5a
    // above), not an already-EXECUTED operation redelivered through the
    // ordinary arrival path. ReplayGuard, execution history
    // (CommandHistory#getExecutedCommands(), Section 5b/4b's own duplicate
    // replay checks), and the deferral boundarys own retained-map
    // idempotency are three complementary guards, each covering a
    // DIFFERENT stage of an operations lifecycle, never overlapping.
    unattach(); alice.dispose(); bob.dispose();
    console.log('✓ Section 5c: a predecessor redelivered AFTER it already executed is rejected at ReplayGuard, the trust boundary — never reaching the deferral boundary at all, which only ever protects its own DEFERRED map');
}

// ===================================================================
// Section 6 — Local/remote interleaving. Local edits and remote arrivals
// share the SAME CommandHistory and the SAME COMMAND_EXECUTED event this
// milestones own release cascade listens on. Proves local execution is
// NEVER an implicit causal predecessor for an operation that never named
// it — and, more precisely, that the KNOWN (Q2, gap-observation) and
// EXECUTED (Q4, CommandHistory) gates stay genuinely independent even
// under real interleaving on one shared history: a dependent naming an
// operation this replica only knows about because it locally executed it
// (never separately recorded as causally KNOWN) stays deferred, exactly
// as inert as any other never-satisfied precondition, until BOTH gates
// are actually satisfied.
// ===================================================================
{
    const worldId = 'doc-239-local-remote';
    const harness = makeDeferralHarness(worldId);
    const { commandHistory, deferral, causalGapDetector, document } = harness;

    const remoteA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    receiveOperation(harness, { documentId: worldId, command: remoteA, causalPredecessors: [] });
    assert(brickX(document) === 1, '71. remote A (genesis) applies');

    // A LOCAL edit — executed the SAME way every EditorSession action
    // executes one, DIRECTLY through CommandHistory#execute(), never
    // through DocumentOperationDeferralUseCase#receive(). Nothing in this
    // document currently names localX as a causal predecessor of anything.
    const localX = moveCommand(worldId, { x: 5, y: 0, z: 0 });
    commandHistory.execute(localX);
    assert(brickX(document) === 6, '72. the local edit X applies too, ordinary local editing');

    // A remote dependent naming the REMOTE A (already executed) as its own
    // predecessor — unaffected by localX having executed in between.
    const remoteB = moveCommand(worldId, { x: 10, y: 0, z: 0 });
    const outcomeB = receiveOperation(harness, { documentId: worldId, command: remoteB, causalPredecessors: [remoteA.id] });
    assert(outcomeB === DocumentOperationDeferralOutcome.APPLIED, '73. remote B (depends on remote A, already executed) applies — localXs execution neither helped nor hindered it');

    // A remote dependent naming a MISSING remote predecessor — a purely
    // local operations execution must never satisfy it, since nothing ever
    // named localX (or any other local op) as ITS predecessor.
    const remoteC = moveCommand(worldId, { x: 100, y: 0, z: 0 });
    const outcomeC = receiveOperation(harness, { documentId: worldId, command: remoteC, causalPredecessors: ['a-remote-predecessor-never-sent'] });
    assert(outcomeC === DocumentOperationDeferralOutcome.DEFERRED, '74. C is deferred: its own named predecessor never arrived');

    const localY = moveCommand(worldId, { x: 7, y: 0, z: 0 });
    commandHistory.execute(localY);
    assert(deferral.getDeferredOperationIds(worldId).includes(remoteC.id),
        '75. C is STILL deferred after local Y executes — a local COMMAND_EXECUTED event never turns "something changed" into "my prerequisite changed" for an operation that never named it');

    // The deeper boundary: a remote dependent that names a purely LOCAL
    // operationId as its own causal predecessor. localZ genuinely executes
    // — but it was never separately recorded as causally KNOWN (Q2),
    // since gap-observation only ever records REMOTELY-arriving
    // operations, exactly the same as every other section in this suite.
    // D must stay deferred even AFTER localZ executes: KNOWN and EXECUTED
    // remain two independent gates, neither one alone sufficient, even
    // under real local/remote interleaving on the shared CommandHistory.
    const localZ = moveCommand(worldId, { x: 3, y: 0, z: 0 });
    const remoteD = moveCommand(worldId, { x: 1000, y: 0, z: 0 });
    causalGapDetector.record(worldId, remoteD.id, [localZ.id]);
    const outcomeD = deferral.receive({ documentId: worldId, command: remoteD, authorIdentityId: 'alice', causalPredecessors: [localZ.id] }, harness.target);
    assert(outcomeD === DocumentOperationDeferralOutcome.DEFERRED, '76. D deferred: names localZ, which has not executed yet, as its own explicit predecessor');

    commandHistory.execute(localZ);
    assert(deferral.getDeferredOperationIds(worldId).includes(remoteD.id),
        '77. D is STILL deferred immediately after localZ executes: localZ was never recorded as causally KNOWN, so eligibility (Q2) never cleared, regardless of execution (Q4) — the two gates stay genuinely separate under real interleaving, exactly as 0.9.234 defined them');

    // Only once localZ is ALSO recorded as causally known (mirroring
    // whatever eventually tells a replica about an operation — this
    // codebase never does so automatically for a purely local edit; this
    // line exists to isolate and demonstrate the mechanism precisely, not
    // to claim production performs it) does D become eligible — and even
    // then, only a FRESH COMMAND_EXECUTED event actually re-evaluates it;
    // recording alone triggers no re-scan.
    causalGapDetector.record(worldId, localZ.id, []);
    assert(deferral.getDeferredOperationIds(worldId).includes(remoteD.id), '78. still deferred immediately after the belated record() — recording alone triggers no re-evaluation, only a new COMMAND_EXECUTED event does');
    const unrelatedTrigger = moveCommand(worldId, { x: 1, y: 0, z: 0 }, { id: 'unrelated-reeval-trigger' });
    commandHistory.execute(unrelatedTrigger);
    assert(commandHistory.getExecutedCommands().some((c) => c.id === remoteD.id), '79. D finally releases once BOTH gates are satisfied and a fresh COMMAND_EXECUTED event triggers re-evaluation');

    assert(deferral.getDeferredOperationIds(worldId).length === 1 && deferral.getDeferredOperationIds(worldId)[0] === remoteC.id,
        '80. only C (whose real predecessor genuinely never arrived) remains deferred — never turned into a document-wide lock, and never falsely released, by any of this local/remote interleaving');
    console.log('✓ Section 6: local execution is never an implicit causal predecessor for an operation that never named it, and even an operation that explicitly names a local id stays deferred until it is BOTH causally KNOWN and actually EXECUTED — the two gates stay genuinely independent under real interleaving on one shared CommandHistory');
}

// ===================================================================
// Section 7 — Failure isolation under cascading release. A -> {B, C},
// B poisoned; D depends on [B, C]. C must not be corrupted or dropped
// merely because its sibling B fails, and a diamond successor naming a
// permanently-failed predecessor must stay deferred FOREVER, not
// corrupted, not silently dropped. A second, independent
// COMMAND_EXECUTED subscriber proves the poisoned failure never breaks
// CommandHistory's own fan-out for anyone else.
// ===================================================================
{
    const worldId = 'doc-239-failure-isolation';
    const harness = makeDeferralHarness(worldId);
    const { commandHistory, deferral } = harness;

    const observedExecutions = [];
    const observerSubscription = commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_EXECUTED, ({ command }) => observedExecutions.push(command.id));

    const opA = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    // Names a group that does not exist in this document —
    // RenameGroupCommand#execute() throws "group not found" the moment it
    // is actually applied.
    const poisonedB = new RenameGroupCommand({ worldId, groupId: 'no-such-group', name: 'Whatever' });
    const opC = moveCommand(worldId, { x: 4, y: 0, z: 0 });
    const opD = moveCommand(worldId, { x: 8, y: 0, z: 0 });

    receiveOperation(harness, { documentId: worldId, command: poisonedB, causalPredecessors: [opA.id] });
    receiveOperation(harness, { documentId: worldId, command: opC, causalPredecessors: [opA.id] });
    receiveOperation(harness, { documentId: worldId, command: opD, causalPredecessors: [poisonedB.id, opC.id] });
    assert(deferral.getDeferredOperationIds(worldId).length === 3, '81. B, C, and D all deferred, waiting on A');

    receiveOperation(harness, { documentId: worldId, command: opA, causalPredecessors: [] });

    assert(commandHistory.getExecutedCommands().some((c) => c.id === opA.id), '82. A executed');
    assert(commandHistory.getExecutedCommands().some((c) => c.id === opC.id),
        '83. C, the healthy sibling, released and executed despite B (sharing the SAME predecessor A) failing');
    assert(!commandHistory.getExecutedCommands().some((c) => c.id === poisonedB.id), '84. the poisoned B itself never executed');
    assert(!deferral.getDeferredOperationIds(worldId).includes(poisonedB.id), '85. B is dropped, not retried on every future release');

    // D (the diamond successor) names BOTH B and C. C executed; B never
    // will. D must stay deferred FOREVER — not corrupted, not silently
    // dropped, not released on Cs partial success alone.
    assert(deferral.getDeferredOperationIds(worldId).includes(opD.id), '86. D remains deferred: one of its two named predecessors permanently failed and will never execute');
    assert(!commandHistory.getExecutedCommands().some((c) => c.id === opD.id), '87. D never applied');

    // Prove D really does stay inert forever, not merely "not yet."
    for (let i = 0; i < 3; i += 1) {
        receiveOperation(harness, { documentId: worldId, command: moveCommand(worldId, { x: i, y: 0, z: 0 }, { id: `unrelated-failure-${i}` }), causalPredecessors: [] });
    }
    assert(deferral.getDeferredOperationIds(worldId).includes(opD.id), '88. D still deferred after further unrelated activity — a permanently-failed predecessor is not a timeout, it is simply never satisfied');

    assert(observedExecutions.includes(opA.id) && observedExecutions.includes(opC.id), '89. the unrelated COMMAND_EXECUTED subscriber observed both real executions');
    assert(!observedExecutions.includes(poisonedB.id) && !observedExecutions.includes(opD.id), '90. and never a phantom event for either operation that never actually executed');

    observerSubscription.unsubscribe();
    console.log('✓ Section 7: a poisoned deferred operation never corrupts or blocks release of an unrelated sibling, a diamond successor naming a permanently-failed predecessor stays deferred forever rather than corrupted or dropped, and CommandHistorys own COMMAND_EXECUTED fan-out for every OTHER subscriber survives the failure untouched');
}

// ===================================================================
// Section 8 — Session/document lifecycle, on a real EditorSession.
// ===================================================================

// --- 8a: document switch away and back ---
{
    const network = new LocalPeerNetwork();
    const aliceDevice = makeDevice('Alice-239-lifecycle');
    const bobDevice = makeDevice('Bob-239-lifecycle');
    const aliceStack = makeEditorRuntimeStack(aliceDevice);
    const bobStack = makeEditorRuntimeStack(bobDevice);
    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-239-lifecycle', aliceDevice, 'bob-239-lifecycle', bobDevice);
    aliceStack.connectedPeerRegistry.add(peerA);
    bobStack.connectedPeerRegistry.add(peerB);

    const docAId = 'doc-239-lifecycle-a', buildingAId = 'building-a', brickAId = 'brick-a';
    const docCId = 'doc-239-lifecycle-c', buildingCId = 'building-c', brickCId = 'brick-c';

    const aliceDocA = buildOneBrickDocument({ worldId: docAId, buildingId: buildingAId, brickId: brickAId, authorIdentityId: aliceDevice.identity.identityId, title: 'Doc A' });
    const bobDocA = buildOneBrickDocument({ worldId: docAId, buildingId: buildingAId, brickId: brickAId, authorIdentityId: aliceDevice.identity.identityId, title: 'Doc A' });
    const bobDocC = buildOneBrickDocument({ worldId: docCId, buildingId: buildingCId, brickId: brickCId, authorIdentityId: bobDevice.identity.identityId, title: 'Doc C' });

    openDocumentInSession(aliceStack.editorSession, aliceDocA);
    openDocumentInSession(bobStack.editorSession, bobDocA);

    const predA = new MoveBrickCommand({ worldId: docAId, buildingId: buildingAId, brickId: brickAId, delta: { x: 1, y: 0, z: 0 } });
    const depB = new MoveBrickCommand({ worldId: docAId, buildingId: buildingAId, brickId: brickAId, delta: { x: 2, y: 0, z: 0 } });

    // B (naming predA as its own causal predecessor) arrives first, while
    // Bob is looking at Document A — deferred, exactly as Section 1.
    aliceStack.documentCommandPropagation.broadcastCommand({ documentId: docAId, command: depB, causalPredecessors: [predA.id] });
    await wait(60);
    assert(brickPosition(bobDocA, buildingAId, brickAId).x === 0, '91. B deferred, Document A untouched');
    assert(bobStack.editorSession.getDeferredOperationIds(docAId).includes(depB.id), '92. B retained for Document A');

    // Bob switches to an unrelated Document C, in the SAME session.
    openDocumentInSession(bobStack.editorSession, bobDocC);

    // Alice broadcasts predA — the very predecessor Document As own
    // deferred B is waiting on — WHILE Bob is looking at Document C.
    aliceStack.documentCommandPropagation.broadcastCommand({ documentId: docAId, command: predA, causalPredecessors: [] });
    await wait(60);

    assert(bobStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.UNKNOWN_DOCUMENT),
        '93. predA is refused at the trust boundary while Bob is looking at Document C — resolveDocument only knows the currently-open document');
    assert(brickPosition(bobDocC, buildingCId, brickCId).x === 0, '94. Document C, the currently-open document, is untouched by an operation meant for Document A');
    assert(bobStack.editorSession.commandHistory.getExecutedCommands().length === 0, '95. Document Cs own CommandHistory (the one live on Bobs session) never received anything meant for A');
    assert(bobStack.editorSession.getDeferredOperationIds(docAId).includes(depB.id),
        '96. Document As own deferred B is UNCHANGED — a session-lifetime fact, surviving the switch to Document C untouched');

    // Bob returns to Document A — a genuinely fresh CommandHistory, exactly
    // like a real reload.
    openDocumentInSession(bobStack.editorSession, bobDocA);
    assert(bobStack.editorSession.getDeferredOperationIds(docAId).includes(depB.id), '97. Bs deferred state remains correctly scoped to Document A after returning to it');

    aliceStack.documentCommandPropagation.broadcastCommand({ documentId: docAId, command: predA, causalPredecessors: [] });
    await wait(60);

    assert(brickPosition(bobDocA, buildingAId, brickAId).x === 3, '98. back on Document A, predA applies and automatically releases the SAME B that survived the detour through Document C');
    const executedIds = bobStack.editorSession.commandHistory.getExecutedCommands().map((c) => c.id);
    assert(executedIds.length === 2 && executedIds[0] === predA.id && executedIds[1] === depB.id, '99. true causal order, on the FRESH CommandHistory now backing Document A');
    assert(bobStack.editorSession.getDeferredOperationIds(docAId).length === 0, '100. nothing left retained for Document A');
    assert(brickPosition(bobDocC, buildingCId, brickCId).x === 0, '101. Document C was never touched by any of this');
    console.log('✓ Section 8a: a deferred operation for a document a session switches away from survives the detour, correctly scoped, and releases normally on return — never leaking into, or being disturbed by, the document visited in between');

    // -----------------------------------------------------------------
    // 8b: session teardown — no deferred operation may mutate a dead
    // target.
    // -----------------------------------------------------------------
    const docDId = 'doc-239-lifecycle-d', buildingDId = 'building-d', brickDId = 'brick-d';
    const aliceDocD = buildOneBrickDocument({ worldId: docDId, buildingId: buildingDId, brickId: brickDId, authorIdentityId: aliceDevice.identity.identityId, title: 'Doc D' });
    const bobDocD = buildOneBrickDocument({ worldId: docDId, buildingId: buildingDId, brickId: brickDId, authorIdentityId: aliceDevice.identity.identityId, title: 'Doc D' });
    openDocumentInSession(aliceStack.editorSession, aliceDocD);
    openDocumentInSession(bobStack.editorSession, bobDocD);

    const predD = new MoveBrickCommand({ worldId: docDId, buildingId: buildingDId, brickId: brickDId, delta: { x: 5, y: 0, z: 0 } });
    const depE = new MoveBrickCommand({ worldId: docDId, buildingId: buildingDId, brickId: brickDId, delta: { x: 7, y: 0, z: 0 } });
    aliceStack.documentCommandPropagation.broadcastCommand({ documentId: docDId, command: depE, causalPredecessors: [predD.id] });
    await wait(60);
    assert(bobStack.editorSession.getDeferredOperationIds(docDId).includes(depE.id), '102. E deferred for Document D before teardown');

    const deferralAfterDispose = bobStack.editorSession._documentOperationDeferral;
    bobStack.editorSession.dispose();

    // A stray, late "predecessor executed" signal for the now-torn-down
    // document must never mutate a dead target.
    const releasedAfterDispose = deferralAfterDispose.onOperationExecuted(docDId, predD.id);
    assert(Array.isArray(releasedAfterDispose) && releasedAfterDispose.length === 0, '103. no deferred operation may mutate a dead target — onOperationExecuted() on a torn-down document releases nothing');
    assert(brickPosition(bobDocD, buildingDId, brickDId).x === 0, '104. Document D itself never mutated after session teardown');

    // Even the actual predecessor, broadcast AFTER teardown, changes
    // nothing — the whole incoming seam was unwired by dispose() too.
    aliceStack.documentCommandPropagation.broadcastCommand({ documentId: docDId, command: predD, causalPredecessors: [] });
    await wait(60);
    assert(brickPosition(bobDocD, buildingDId, brickDId).x === 0, '105. Bobs whole runtime is disposed — nothing further ever reaches it');

    aliceStack.documentCommandPropagation.dispose();
    bobStack.documentCommandPropagation.dispose();
    aliceStack.editorSession.dispose();
    console.log('✓ Section 8b: session teardown leaves no deferred operation able to mutate a dead target, and unwires the incoming seam entirely — a stray release signal or a late-arriving predecessor both change nothing');
}

// ===================================================================
// Section 9 — Policy Conformance Matrix. The table this milestone exists
// to prove, row by row, against REAL code — never a static claim. Proves
// runtime behavior (Apply/Defer/Release/Execute-once) corresponds
// exactly to what evaluateApplicationReadiness() (0.9.234) itself
// computes for eligibility and readiness.
// ===================================================================
{
    const worldId = 'doc-239-matrix';
    const harness = makeDeferralHarness(worldId);
    const { commandHistory, deferral, causalGapDetector } = harness;

    // Row 1 — Genesis: ELIGIBLE, READY, Apply.
    const genesis = moveCommand(worldId, { x: 1, y: 0, z: 0 });
    const genesisReadiness = evaluateApplicationReadiness(worldId, { operationId: genesis.id, causalPredecessors: [] },
        { causalGapDetector, executionHistory: { isExecuted: (d, id) => commandHistory.getExecutedCommands().some((c) => c.id === id) } });
    assert(genesisReadiness.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE && genesisReadiness.readiness === DocumentOperationApplicationReadiness.READY,
        '106. Row 1 Genesis: ELIGIBLE, READY');
    assert(receiveOperation(harness, { documentId: worldId, command: genesis, causalPredecessors: [] }) === DocumentOperationDeferralOutcome.APPLIED,
        '107. Row 1 Genesis: Apply');

    // Row 2 — Complete chain: predecessor already executed -> ELIGIBLE, READY, Apply.
    const chained = moveCommand(worldId, { x: 2, y: 0, z: 0 });
    assert(receiveOperation(harness, { documentId: worldId, command: chained, causalPredecessors: [genesis.id] }) === DocumentOperationDeferralOutcome.APPLIED,
        '108. Row 2 Complete chain: Apply');

    // Row 3 — Missing predecessor: never received at all -> NOT_ELIGIBLE, NOT_READY, Defer.
    const missingDependent = moveCommand(worldId, { x: 4, y: 0, z: 0 });
    const missingReadiness = evaluateApplicationReadiness(worldId, { operationId: missingDependent.id, causalPredecessors: ['never-received'] },
        { causalGapDetector, executionHistory: { isExecuted: () => false } });
    assert(missingReadiness.eligibility === DocumentOperationApplicationEligibility.NOT_ELIGIBLE && missingReadiness.readiness === DocumentOperationApplicationReadiness.NOT_READY,
        '109. Row 3 Missing predecessor: NOT_ELIGIBLE, NOT_READY');
    assert(receiveOperation(harness, { documentId: worldId, command: missingDependent, causalPredecessors: ['never-received'] }) === DocumentOperationDeferralOutcome.DEFERRED,
        '110. Row 3 Missing predecessor: Defer');

    // Row 4 — Recovered predecessor: KNOWN (mirroring what gap-observation
    // records for a real RECOVERED operation), never EXECUTED -> ELIGIBLE,
    // NOT_READY, Defer.
    const recoveredPredecessorId = 'recovered-but-unexecuted';
    causalGapDetector.record(worldId, recoveredPredecessorId, []);
    const recoveredDependent = moveCommand(worldId, { x: 8, y: 0, z: 0 });
    const recoveredReadiness = evaluateApplicationReadiness(worldId, { operationId: recoveredDependent.id, causalPredecessors: [recoveredPredecessorId] },
        { causalGapDetector, executionHistory: { isExecuted: () => false } });
    assert(recoveredReadiness.eligibility === DocumentOperationApplicationEligibility.ELIGIBLE && recoveredReadiness.readiness === DocumentOperationApplicationReadiness.NOT_READY,
        '111. Row 4 Recovered predecessor: ELIGIBLE, NOT_READY');
    assert(receiveOperation(harness, { documentId: worldId, command: recoveredDependent, causalPredecessors: [recoveredPredecessorId] }) === DocumentOperationDeferralOutcome.DEFERRED,
        '112. Row 4 Recovered predecessor: Defer');

    // Row 5 — Replayed predecessor: the SAME recovered predecessor, now
    // actually executed (mirroring exactly what
    // RecoveredOperationReplayUseCase#replay() does to CommandHistory,
    // nothing more) -> ELIGIBLE, READY, Release.
    const recoveredPredecessorCommand = moveCommand(worldId, { x: 16, y: 0, z: 0 }, { id: recoveredPredecessorId });
    commandHistory.execute(recoveredPredecessorCommand);
    assert(commandHistory.getExecutedCommands().some((c) => c.id === recoveredDependent.id),
        '113. Row 5 Replayed predecessor: Release — the dependent deferred in Row 4 is now applied');

    // Row 6 — Concurrent operation: no causal relationship named at all ->
    // ELIGIBLE, independent, Apply independently of whatever else is
    // currently deferred in this SAME document.
    assert(deferral.getDeferredOperationIds(worldId).length > 0, '114. precondition: something else is genuinely still deferred in this document right now (Row 3s missingDependent)');
    const concurrentGenesis = moveCommand(worldId, { x: 32, y: 0, z: 0 });
    assert(receiveOperation(harness, { documentId: worldId, command: concurrentGenesis, causalPredecessors: [] }) === DocumentOperationDeferralOutcome.APPLIED,
        '115. Row 6 Concurrent operation: Apply independently, unaffected by a sibling deferred operation');

    // Row 7 — Diamond successor: depends on TWO predecessors -> NOT_READY
    // until BOTH have executed, Defer until then.
    const diamondPred1 = moveCommand(worldId, { x: 64, y: 0, z: 0 });
    const diamondPred2 = moveCommand(worldId, { x: 128, y: 0, z: 0 });
    const diamondSuccessor = moveCommand(worldId, { x: 256, y: 0, z: 0 });
    assert(receiveOperation(harness, { documentId: worldId, command: diamondSuccessor, causalPredecessors: [diamondPred1.id, diamondPred2.id] }) === DocumentOperationDeferralOutcome.DEFERRED,
        '116. Row 7 Diamond successor: Defer — neither predecessor has executed');
    receiveOperation(harness, { documentId: worldId, command: diamondPred1, causalPredecessors: [] });
    assert(deferral.getDeferredOperationIds(worldId).includes(diamondSuccessor.id), '117. Row 7 Diamond successor: still deferred with only ONE of two predecessors executed');
    receiveOperation(harness, { documentId: worldId, command: diamondPred2, causalPredecessors: [] });
    assert(commandHistory.getExecutedCommands().some((c) => c.id === diamondSuccessor.id), '118. Row 7 Diamond successor: released once BOTH have executed');

    // Row 8 — Duplicate operation: delivered twice while deferred ->
    // eligibility/readiness of the retained representation unchanged,
    // Execute once.
    const duplicatePredId = 'row-8-missing-predecessor';
    const duplicateId = 'row-8-duplicate-operation';
    const duplicate1 = moveCommand(worldId, { x: 512, y: 0, z: 0 }, { id: duplicateId });
    const duplicate2 = moveCommand(worldId, { x: 5120, y: 0, z: 0 }, { id: duplicateId });
    assert(receiveOperation(harness, { documentId: worldId, command: duplicate1, causalPredecessors: [duplicatePredId] }) === DocumentOperationDeferralOutcome.DEFERRED,
        '119. Row 8 Duplicate operation: first delivery DEFERRED');
    assert(receiveOperation(harness, { documentId: worldId, command: duplicate2, causalPredecessors: [duplicatePredId] }) === DocumentOperationDeferralOutcome.DEFERRED,
        '120. Row 8 Duplicate operation: the second delivery is unchanged — still simply DEFERRED, not an error, not a second entry');
    assert(deferral.getDeferredOperationIds(worldId).filter((id) => id === duplicateId).length === 1, '121. Row 8 Duplicate operation: exactly one retained representation');
    const duplicatePredCommand = moveCommand(worldId, { x: 1, y: 0, z: 0 }, { id: duplicatePredId });
    receiveOperation(harness, { documentId: worldId, command: duplicatePredCommand, causalPredecessors: [] });
    assert(commandHistory.getExecutedCommands().filter((c) => c.id === duplicateId).length === 1, '122. Row 8 Duplicate operation: Execute once');

    console.log('✓ Section 9: the policy conformance matrix holds, row by row, against real code — Genesis, Complete chain, Missing predecessor, Recovered predecessor, Replayed predecessor, Concurrent operation, Diamond successor, and Duplicate operation all behave exactly as CAUSAL_READINESS claims');
}

console.log('\n0.9.239 — the comprehensive causal deferral lifecycle audit holds: linear chains and diamonds release in true causal order regardless of arrival order (1-2); independent branches never become a document-wide execution lock (3); recovery is knowledge, never execution, across both a simple and a longer recovered chain, and replay() imposes no ordering of its own between independently recovered operations (4); duplicate deliveries, duplicate recovery responses, and duplicate replay attempts all collapse to exactly one effect, and ReplayGuard alone — never the deferral boundary — stops a late duplicate of an already-executed predecessor (5); local execution is never an implicit causal predecessor, and the KNOWN/EXECUTED gates stay genuinely independent under real local/remote interleaving on one shared CommandHistory (6); a poisoned operation never corrupts a sibling or blocks an unrelated release, and a diamond successor naming a permanently-failed predecessor stays deferred forever rather than corrupted (7); a deferred operation survives a document switch away and back, correctly scoped, and session teardown leaves no deferred operation able to mutate a dead target (8); and runtime behavior corresponds exactly, row by row, to what the CAUSAL_READINESS policy descriptor itself claims (9).');

}

runTests().then(() => {
    console.log('\n✓ All CausalDeferralLifecycleAudit tests passed');
}).catch((error) => {
    console.error('\n✗ CausalDeferralLifecycleAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
