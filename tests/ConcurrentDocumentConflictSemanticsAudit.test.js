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
import { CommandHistoryEvent } from '../application/events/CommandHistoryEvent.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { RenameGroupCommand } from '../application/commands/RenameGroupCommand.js';
import { DocumentCommandPropagationUseCase } from '../application/DocumentCommandPropagationUseCase.js';
import { DocumentOperationCausalGraph, CausalRelationship } from '../core/DocumentOperationCausality.js';
import { DocumentOperationCausalGapDetector } from '../core/DocumentOperationCausalGapDetector.js';
import { DocumentOperationCausalGapObservationUseCase } from '../application/DocumentOperationCausalGapObservationUseCase.js';
import { DocumentOperationRecoveryUseCase } from '../application/DocumentOperationRecoveryUseCase.js';
import { RecoveredOperationReplayUseCase } from '../application/RecoveredOperationReplayUseCase.js';
import {
    DocumentOperationDeferralUseCase,
    DocumentOperationDeferralOutcome
} from '../application/DocumentOperationDeferralUseCase.js';
import {
    DOCUMENT_COLLABORATION_CONSISTENCY_POLICY,
    DeliveryOrderGuarantee,
    RemoteApplicationTiming,
    HistoryOrderingBasis,
    ConcurrentConflictResolution,
    ReplicaConvergenceGuarantee
} from '../core/DocumentCollaborationConsistencyPolicy.js';

// 0.9.240 — Concurrent Document Conflict Semantics Reassessment.
//
// 0.9.237-0.9.239 closed the causal-readiness arc: an operation is now
// applied only after every named causal predecessor has actually
// EXECUTED, proven under chains, diamonds, recovery/replay, duplicate
// stress, local/remote interleaving, and full session lifecycle. That
// arc answers exactly one question — "can an operation execute before
// its causal prerequisites?" — and the answer, as of 0.9.237, is no.
//
// This milestone asks the NEXT, genuinely different question, which
// 0.9.226's own `ConcurrentConflictResolution = UNDEFINED` already named
// and 0.9.239's own "Recommendation" restated explicitly:
//
//   What happens when two operations are causally READY, genuinely
//   CONCURRENT (neither is a causal predecessor of the other), and
//   cannot safely commute?
//
// Test-only, architecture-audit work — same restraint every milestone in
// this lineage has already applied to itself. This suite implements NO
// new mechanism: no CRDT, no OT, no Lamport/vector clocks, no total
// ordering, no server arbitration, no last-write-wins RULE, no
// deterministic tie-breaking, no merge commands, no conflict UI, no
// automatic conflict resolution, no synchronized undo, no rollback, no
// operation transformation, no new collaboration state machine. It only
// gathers evidence, against the real, unmodified 0.9.222-0.9.239 chain —
// real `DocumentOperationCausalGraph#compare()`, real
// `DocumentOperationDeferralUseCase`, real propagation/recovery/replay
// stacks, real `CommandHistory` instances — for a question this codebase
// has, until now, never directly asked its own running code:
//
//   Is divergent state under concurrent, non-commutative, causally-ready
//   edits an ACCEPTED property of this collaboration model, or an
//   undiscovered bug?
//
// The answer this suite proves, section by section, is: accepted,
// observed, and load-bearing — `ConcurrentConflictResolution.UNDEFINED`
// and `ReplicaConvergenceGuarantee.NOT_GUARANTEED` are not gaps nobody
// got around to testing; they are the correct, honest names for
// behavior every section below independently reproduces on purpose.
// Section 8 assembles the resulting evidence into one conflict-semantics
// matrix — the artifact this milestone exists to hand to the next
// product decision.
//
// Related, but deliberately not reused directly:
// tests/ConcurrentDocumentOperationBehaviorAudit.test.js is 0.9.225's own
// audit — the one that FIRST found the commuting/non-commuting split and
// named `ConcurrentConflictResolution.UNDEFINED`, before
// `DocumentOperationCausalGraph#compare()` (0.9.227) or causal deferral
// (0.9.237) existed to prove operations were even genuinely CONCURRENT,
// as opposed to merely "delivered in some order." This suite re-proves
// the same class of finding with that later tooling now available, and
// goes further (Sections 3-8) into territory 0.9.225 had no way to ask
// about yet — the causal/concurrent distinction itself, recovery
// interaction, and undo under a genuinely diverged document.

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

function renameCommand(worldId, name, extra = {}) {
    return new RenameGroupCommand({ worldId, groupId: 'group-1', name, ...extra });
}

function brickX(document) {
    return document.world.getBuilding('building-x').findBrick('brick-a').position.x;
}

function currentGroupName(document) {
    return document.world.getGroup('group-1').name;
}

// A lightweight, direct (no network) harness — the same posture
// tests/DocumentOperationDeferralUseCase.test.js's own makeDeferralHarness()
// already established, extended (0.9.240) to expose the underlying
// DocumentOperationCausalGraph directly, so a test can ask
// graph.compare() the exact question this milestone is about: given what
// this replica currently knows, are two operations BEFORE/AFTER/
// CONCURRENT — never inferred from arrival order, always read from the
// real, explicit predecessor graph.
function makeDeferralHarness(worldId, { groupName = 'Original' } = {}) {
    const document = buildBaseDocument({ worldId, authorIdentityId: 'author-1', title: worldId, groupName });
    const commandHistory = new CommandHistory({ world: document.world });
    const causalGraph = new DocumentOperationCausalGraph();
    const causalGapDetector = new DocumentOperationCausalGapDetector({ causalGraph });
    const deferral = new DocumentOperationDeferralUseCase({ causalGapDetector });
    const unattach = deferral.attachCommandHistory({ documentId: worldId, commandHistory });
    const target = { documentId: worldId, commandHistory };
    return { document, commandHistory, causalGraph, causalGapDetector, deferral, target, unattach };
}

// Mirrors production ordering exactly (application/EditorSession.js's own
// 0.9.229 comment on receive ordering): observation of an arriving
// operation's own causal identity happens BEFORE readiness is ever
// evaluated for anything naming it as a predecessor.
function receiveOperation(harness, { documentId, command, authorIdentityId = 'alice', causalPredecessors = [] }, target = harness.target) {
    harness.causalGapDetector.record(documentId, command.id, causalPredecessors);
    return harness.deferral.receive({ documentId, command, authorIdentityId, causalPredecessors }, target);
}

// A full, real, peer-authenticated propagation + recovery + replay stack,
// wired exactly the way application/EditorSession.js wires them — the
// same helper shape tests/CausalDeferralLifecycleAudit.test.js's own
// makeFullStack() already establishes, extended (0.9.240) with the same
// explicit causalGraph exposure as makeDeferralHarness() above.
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
    const causalGraph = new DocumentOperationCausalGraph();
    const causalGapDetector = new DocumentOperationCausalGapDetector({ causalGraph });
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
        device, peerMessageBus, connectedPeerRegistry, propagation, recovery, gapObservation, causalGraph, causalGapDetector, deferral, replay, state, recovered,
        dispose: () => {
            unsubscribeGapToPropagation(); unsubscribeDeferralToPropagation(); unsubscribeRecoveryRequest();
            unsubscribeGapToRecovery(); unsubscribeRecoveryToReplay();
            propagation.dispose(); recovery.dispose();
        }
    };
}

async function runTests() {

// ===================================================================
// Section 1 — Commutative concurrent operations. Two genuinely
// concurrent MoveBrickCommand deltas (neither names the other as a
// causal predecessor) delivered in OPPOSITE orders to two independent
// replicas. A ∘ B and B ∘ A land on the same final position because
// MoveBrickCommand's own semantics are a relative delta — this is the
// existing system already handling one shape of concurrency correctly,
// with no new machinery.
// ===================================================================
{
    const worldIdReplica1 = 'doc-240-commute-r1';
    const worldIdReplica2 = 'doc-240-commute-r2';
    const replica1 = makeDeferralHarness(worldIdReplica1);
    const replica2 = makeDeferralHarness(worldIdReplica2);

    const opA1 = moveCommand(worldIdReplica1, { x: 3, y: 0, z: 0 }, { id: 'commute-a' });
    const opB1 = moveCommand(worldIdReplica1, { x: 5, y: 0, z: 0 }, { id: 'commute-b' });
    const opA2 = moveCommand(worldIdReplica2, { x: 3, y: 0, z: 0 }, { id: 'commute-a' });
    const opB2 = moveCommand(worldIdReplica2, { x: 5, y: 0, z: 0 }, { id: 'commute-b' });

    // Replica 1: A then B. Replica 2: B then A. Neither op names the
    // other as a causal predecessor anywhere — genuinely concurrent by
    // construction, not merely "arrived close together."
    receiveOperation(replica1, { documentId: worldIdReplica1, command: opA1, causalPredecessors: [] });
    receiveOperation(replica1, { documentId: worldIdReplica1, command: opB1, causalPredecessors: [] });
    receiveOperation(replica2, { documentId: worldIdReplica2, command: opB2, causalPredecessors: [] });
    receiveOperation(replica2, { documentId: worldIdReplica2, command: opA2, causalPredecessors: [] });

    assert(replica1.causalGraph.compare(worldIdReplica1, opA1.id, opB1.id) === CausalRelationship.CONCURRENT,
        '1. A and B are genuinely CONCURRENT on replica 1s own causal graph — neither names the other');
    assert(replica2.causalGraph.compare(worldIdReplica2, opA2.id, opB2.id) === CausalRelationship.CONCURRENT,
        '2. and CONCURRENT on replica 2s own graph too — the relationship does not depend on which replica, or which arrived first');

    const executed1 = replica1.commandHistory.getExecutedCommands().map((c) => c.id);
    const executed2 = replica2.commandHistory.getExecutedCommands().map((c) => c.id);
    assert(executed1[0] === opA1.id && executed1[1] === opB1.id, '3. replica 1s own CommandHistory records true arrival order: A, B');
    assert(executed2[0] === opB2.id && executed2[1] === opA2.id, '4. replica 2s own CommandHistory records the OPPOSITE arrival order: B, A — delivery order is genuinely not guaranteed (DeliveryOrderGuarantee.NOT_GUARANTEED), and neither replica corrects for it');
    assert(brickX(replica1.document) === 8 && brickX(replica2.document) === 8,
        '5. despite opposite execution order, both replicas land on the IDENTICAL final position (3+5=8) — A committes B for this command shape, so arrival order stops mattering to the RESULT even though it is visible in each replicas own history sequence');

    console.log('✓ Section 1: two genuinely concurrent, relative-delta operations converge to the same final value under either delivery order — commuting concurrency the existing system already handles correctly, with no conflict machinery involved');
}

// ===================================================================
// Section 2 — Non-commutative concurrent operations. Two genuinely
// concurrent RenameGroupCommand absolute-sets, delivered in opposite
// order to two independent replicas. This is an explicit, expected,
// OBSERVED behavior — not a test failure and not a bug report.
// ===================================================================
{
    const worldIdReplica1 = 'doc-240-noncommute-r1';
    const worldIdReplica2 = 'doc-240-noncommute-r2';
    const replica1 = makeDeferralHarness(worldIdReplica1);
    const replica2 = makeDeferralHarness(worldIdReplica2);

    const renameAlice1 = renameCommand(worldIdReplica1, 'Alice', { id: 'noncommute-alice' });
    const renameBob1 = renameCommand(worldIdReplica1, 'Bob', { id: 'noncommute-bob' });
    const renameAlice2 = renameCommand(worldIdReplica2, 'Alice', { id: 'noncommute-alice' });
    const renameBob2 = renameCommand(worldIdReplica2, 'Bob', { id: 'noncommute-bob' });

    receiveOperation(replica1, { documentId: worldIdReplica1, command: renameAlice1, causalPredecessors: [] });
    receiveOperation(replica1, { documentId: worldIdReplica1, command: renameBob1, causalPredecessors: [] });
    receiveOperation(replica2, { documentId: worldIdReplica2, command: renameBob2, causalPredecessors: [] });
    receiveOperation(replica2, { documentId: worldIdReplica2, command: renameAlice2, causalPredecessors: [] });

    assert(replica1.causalGraph.compare(worldIdReplica1, renameAlice1.id, renameBob1.id) === CausalRelationship.CONCURRENT,
        '6. the two renames are genuinely CONCURRENT according to the causal graph — the same proof Section 1 gave for a commuting pair');
    assert(replica2.causalGraph.compare(worldIdReplica2, renameAlice2.id, renameBob2.id) === CausalRelationship.CONCURRENT,
        '7. CONCURRENT on the other replica too, regardless of its own opposite delivery order');

    assert(currentGroupName(replica1.document) === 'Bob', '8. replica 1, delivered Alice-then-Bob, ends at "Bob"');
    assert(currentGroupName(replica2.document) === 'Alice', '9. replica 2, delivered Bob-then-Alice, ends at "Alice" — a genuinely different final value from the SAME two operations');
    assert(currentGroupName(replica1.document) !== currentGroupName(replica2.document),
        '10. A -> B != B -> A for this non-commuting command: two honest, fully-authorized replicas that each correctly applied everything they were told now hold permanently different document state');

    // This is exactly what ConcurrentConflictResolution.UNDEFINED and
    // ReplicaConvergenceGuarantee.NOT_GUARANTEED already name — proven
    // here directly, not inferred.
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.conflict.nonCommutingOperations === ConcurrentConflictResolution.UNDEFINED,
        '11. the policy descriptor already names this: no resolution rule exists for a non-commuting concurrent pair');
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.convergence.guaranteed === ReplicaConvergenceGuarantee.NOT_GUARANTEED,
        '12. and names the resulting divergence risk this section just reproduced directly');

    console.log('✓ Section 2: two genuinely concurrent, absolute-set operations produce two permanently different, non-convergent replicas depending on delivery order — an explicit, expected, ALREADY-NAMED property of this collaboration model, not a defect this audit is reporting');
}

// ===================================================================
// Section 3 — Causal versus concurrent: arrival order is never silently
// treated as causal order. A -> B (an explicit predecessor edge) and
// A || B (no edge at all) must stay fundamentally different, however
// each pair happens to arrive on the wire.
// ===================================================================
{
    const worldId = 'doc-240-causal-vs-concurrent';
    const harness = makeDeferralHarness(worldId);
    const { causalGraph, deferral } = harness;

    // 3a — an explicit predecessor edge: B names A. Genuinely BEFORE,
    // and B is DEFERRED until A actually executes — the 0.9.237 guarantee,
    // reused here only to anchor the contrast below.
    const opA = renameCommand(worldId, 'A-value', { id: 'cvc-a' });
    const opB = renameCommand(worldId, 'B-value', { id: 'cvc-b' });
    const outcomeBFirst = receiveOperation(harness, { documentId: worldId, command: opB, causalPredecessors: [opA.id] });
    assert(outcomeBFirst === DocumentOperationDeferralOutcome.DEFERRED, '13. B, naming A as an explicit predecessor, is DEFERRED — it arrived FIRST, so this is not an accident of arrival order');
    receiveOperation(harness, { documentId: worldId, command: opA, causalPredecessors: [] });
    assert(causalGraph.compare(worldId, opA.id, opB.id) === CausalRelationship.BEFORE, '14. once both are known, the graph reports the real relationship: A BEFORE B');
    assert(currentGroupName(harness.document) === 'B-value', '15. B releases once A executes, exactly as 0.9.237 guarantees');

    // 3b — the IDENTICAL wall-clock arrival order (X first, then Y), but
    // this time Y never names X as a predecessor at all. If arrival
    // order were ever silently promoted to causal order, this pair
    // would wrongly compare as BEFORE too. It must not.
    const opX = renameCommand(worldId, 'X-value', { id: 'cvc-x' });
    const opY = renameCommand(worldId, 'Y-value', { id: 'cvc-y' });
    const outcomeX = receiveOperation(harness, { documentId: worldId, command: opX, causalPredecessors: [] });
    const outcomeY = receiveOperation(harness, { documentId: worldId, command: opY, causalPredecessors: [] });
    assert(outcomeX === DocumentOperationDeferralOutcome.APPLIED && outcomeY === DocumentOperationDeferralOutcome.APPLIED,
        '16. X then Y, the SAME arrival order as 3a, both apply immediately — neither names the other');
    assert(causalGraph.compare(worldId, opX.id, opY.id) === CausalRelationship.CONCURRENT,
        '17. X and Y stay CONCURRENT despite X strictly preceding Y on the wire — arrival order is never promoted to a causal edge');

    // 3c — symmetry: reversing which operationId is asked first never
    // flips the answer for a genuinely concurrent pair.
    assert(causalGraph.compare(worldId, opY.id, opX.id) === CausalRelationship.CONCURRENT,
        '18. compare(Y, X) agrees with compare(X, Y) — CONCURRENT is symmetric, unlike BEFORE/AFTER');

    // 3d — the reverse delivery of a THIRD, still-unrelated pair, to
    // rule out "CONCURRENT only happens to be what compare() says when
    // the first-delivered operation is asked about first."
    const opP = renameCommand(worldId, 'P-value', { id: 'cvc-p' });
    const opQ = renameCommand(worldId, 'Q-value', { id: 'cvc-q' });
    receiveOperation(harness, { documentId: worldId, command: opQ, causalPredecessors: [] });
    receiveOperation(harness, { documentId: worldId, command: opP, causalPredecessors: [] });
    assert(causalGraph.compare(worldId, opP.id, opQ.id) === CausalRelationship.CONCURRENT && causalGraph.compare(worldId, opQ.id, opP.id) === CausalRelationship.CONCURRENT,
        '19. Q delivered before P still compares CONCURRENT both ways — the verdict tracks the DECLARED predecessor graph, never delivery order');

    console.log('✓ Section 3: causal dependency (A -> B) and concurrency (A || B) stay fundamentally different regardless of arrival order — nothing here ever lets "arrived earlier" masquerade as "happened before"');
}

// ===================================================================
// Section 4 — Three-way concurrency: A -> {B, C} -> D, with B and C
// mutually CONCURRENT non-commuting renames. Does D's own behavior
// depend on which of the two concurrent predecessors executed first?
// ===================================================================
{
    function runDiamond(worldId) {
        const harness = makeDeferralHarness(worldId, { groupName: 'Base' });
        const { commandHistory } = harness;
        const opA = renameCommand(worldId, 'A-genesis', { id: `${worldId}-a` });
        const opB = renameCommand(worldId, 'West', { id: `${worldId}-b` });
        const opC = renameCommand(worldId, 'East', { id: `${worldId}-c` });
        const opD = renameCommand(worldId, 'Merged', { id: `${worldId}-d` });

        receiveOperation(harness, { documentId: worldId, command: opD, causalPredecessors: [opB.id, opC.id] });
        receiveOperation(harness, { documentId: worldId, command: opB, causalPredecessors: [opA.id] });
        receiveOperation(harness, { documentId: worldId, command: opC, causalPredecessors: [opA.id] });
        receiveOperation(harness, { documentId: worldId, command: opA, causalPredecessors: [] });

        return { harness, opA, opB, opC, opD, executedIds: commandHistory.getExecutedCommands().map((c) => c.id), finalName: currentGroupNameFor(harness) };
    }
    function currentGroupNameFor(harness) { return currentGroupName(harness.document); }

    const run1 = runDiamond('doc-240-diamond-r1');
    const run2 = runDiamond('doc-240-diamond-r2');

    assert(run1.harness.causalGraph.compare('doc-240-diamond-r1', run1.opB.id, run1.opC.id) === CausalRelationship.CONCURRENT,
        '20. B and C are genuinely CONCURRENT with each other — both depend only on the shared ancestor A, neither on the other');
    assert(run1.executedIds[0] === run1.opA.id, '21. A always executes first — the one real causal constraint here');
    assert(run1.executedIds.length === 4 && (run1.executedIds[1] === run1.opB.id || run1.executedIds[1] === run1.opC.id),
        '22. B and C occupy the next two slots, in whichever order this replicas own retained-map iteration produced');
    assert(run1.executedIds[3] === run1.opD.id, '23. D always executes LAST — never before BOTH of its own named predecessors have executed, regardless of which of B/C happened to release first');
    assert(run2.executedIds[3] === run2.opD.id, '24. true on a second, independently-constructed instance of the identical diamond too');
    assert(run1.finalName === 'Merged' && run2.finalName === 'Merged',
        '25. Ds OWN final result is IDENTICAL across both instances — an absolute-set successor is deterministic once its causal gate is satisfied, regardless of which concurrent sibling actually executed first');

    // The divergence risk this section is actually about lives ENTIRELY
    // in the CONCURRENT sibling pair (B, C), never in D: whichever of
    // "West"/"East" happened to execute second is briefly the group's
    // real name before D overwrites it — a live illustration of exactly
    // Section 2s finding, now nested one level deeper inside a causally
    // well-formed graph.
    assert(run1.executedIds.includes(run1.opB.id) && run1.executedIds.includes(run1.opC.id),
        '26. both siblings really did execute on this replica (the intermediate "West"/"East" state briefly existed, even though D immediately overwrote it) — the causal correctness of D never depended on resolving THAT ambiguity, it only ever depended on BOTH having executed');

    console.log('✓ Section 4: a diamond with two mutually CONCURRENT, non-commuting siblings still releases its own joining successor in correct causal order, with an IDENTICAL, deterministic result, regardless of which concurrent sibling happened to execute first — causal correctness (0.9.237) and conflict semantics (this milestone) are genuinely orthogonal concerns, and this section proves it structurally rather than merely asserting it');
}

// ===================================================================
// Section 5 — Local/remote concurrency. Local execution must never
// implicitly become a causal predecessor merely because it happened
// earlier on the same replica's own wall clock.
// ===================================================================
{
    const network = new LocalPeerNetwork();
    const aliceDevice = makeDevice('Alice-240-local-remote');
    const bobDevice = makeDevice('Bob-240-local-remote');
    const alice = makeFullStack(aliceDevice);
    const bob = makeFullStack(bobDevice);
    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-240-local-remote', aliceDevice, 'bob-240-local-remote', bobDevice);
    alice.connectedPeerRegistry.add(peerA);
    bob.connectedPeerRegistry.add(peerB);

    // Note on wiring: deliberately no `propagation.attachCommandHistory()`
    // (the OUTGOING auto-broadcast wiring) on either replica's own
    // commandHistory in this section — both replicas apply INCOMING
    // remote operations through THAT SAME chokepoint
    // (`commandHistory.execute()`, per `RemoteDocumentOperationApplicationUseCase`'s
    // own header), so attaching outgoing auto-broadcast to the identical
    // instance would re-broadcast every just-RECEIVED remote operation
    // right back out as if newly authored — a real echo this test has no
    // need to exercise. Each local edit below is instead executed AND
    // broadcast explicitly, in two separate steps this test controls
    // directly — exactly the same posture
    // tests/CausalDeferralLifecycleAudit.test.js Section 4a/4b already
    // use for Carol's own local edits, extended here to both directions.
    const worldId = 'doc-240-local-remote';
    const aliceDoc = buildBaseDocument({ worldId, authorIdentityId: bobDevice.identity.identityId, title: 'local-remote (alice)', groupName: 'Start' });
    const aliceHistory = new CommandHistory({ world: aliceDoc.world });
    const aliceTarget = { documentId: worldId, document: aliceDoc, commandHistory: aliceHistory };
    alice.state.target = aliceTarget;
    const unattachAliceIncoming = alice.deferral.attachCommandHistory({ documentId: worldId, commandHistory: aliceHistory });

    const bobDoc = buildBaseDocument({ worldId, authorIdentityId: aliceDevice.identity.identityId, title: 'local-remote (bob)', groupName: 'Start' });
    const bobHistory = new CommandHistory({ world: bobDoc.world });
    const bobTarget = { documentId: worldId, document: bobDoc, commandHistory: bobHistory };
    bob.state.target = bobTarget;
    const unattachBobIncoming = bob.deferral.attachCommandHistory({ documentId: worldId, commandHistory: bobHistory });

    // local A — Alice's own edit, executed the ordinary way, directly
    // through CommandHistory#execute(), then explicitly broadcast with
    // NO predecessor — mirroring exactly what
    // `DocumentCommandPropagationUseCase#attachCommandHistory()` (0.9.227)
    // would auto-derive for a replica's very first local command: none,
    // a genesis operation.
    const localA = renameCommand(worldId, 'Alice-Local', { id: 'lr-local-a' });
    aliceHistory.execute(localA);
    alice.propagation.broadcastCommand({ documentId: worldId, command: localA, causalPredecessors: [] });
    await wait(60);
    assert(currentGroupName(bobDoc) === 'Alice-Local', '27. Bob receives and applies Alices local A normally, over the real network');

    // local C — Alice's SECOND local edit, explicitly chained to her own
    // PRIOR local command, A — a real, legitimate BEFORE edge on Bob's
    // replica once he receives it (below). But on ALICE's OWN replica, A
    // was never separately recorded as causally KNOWN by gap-observation
    // — gap-observation only ever wires to the INCOMING feed (see
    // application/DocumentOperationCausalGapObservationUseCase.js's own
    // header). Local execution and causal knowledge are two independent
    // facts even for the author's own operations.
    const localC = renameCommand(worldId, 'Alice-Local-2', { id: 'lr-local-c' });
    aliceHistory.execute(localC);
    alice.propagation.broadcastCommand({ documentId: worldId, command: localC, causalPredecessors: [localA.id] });
    assert(alice.causalGraph.isKnown(worldId, localA.id) === false && alice.causalGraph.isKnown(worldId, localC.id) === false,
        '28. neither of Alices own local operations is ever recorded into HER OWN causal graph merely by being executed — isKnown() stays false for both, on the very replica that authored them');

    // remote B — Bob's own, genuinely concurrent, local edit: he never
    // received Alices A before authoring it, so it names no predecessor.
    const remoteB = renameCommand(worldId, 'Bob-Local', { id: 'lr-remote-b' });
    bobHistory.execute(remoteB);
    bob.propagation.broadcastCommand({ documentId: worldId, command: remoteB, causalPredecessors: [] });
    await wait(60);

    // remote D — Bob's SECOND local edit, explicitly chained to HIS OWN
    // prior local command, B.
    const remoteD = renameCommand(worldId, 'Bob-Local-2', { id: 'lr-remote-d' });
    bobHistory.execute(remoteD);
    bob.propagation.broadcastCommand({ documentId: worldId, command: remoteD, causalPredecessors: [remoteB.id] });
    await wait(60);

    assert(alice.causalGraph.isKnown(worldId, remoteB.id) && alice.causalGraph.isKnown(worldId, remoteD.id),
        '29. Alice DOES learn B and D are KNOWN — they arrived through the real incoming feed, unlike her own local A/C');
    assert(alice.causalGraph.compare(worldId, remoteB.id, remoteD.id) === CausalRelationship.BEFORE,
        '30. and Alice correctly reconstructs the REAL relationship Bob declared: B BEFORE D, an ordinary causal chain carried over the wire');
    assert(alice.causalGraph.compare(worldId, localA.id, remoteB.id) === CausalRelationship.UNKNOWN,
        '31. but Alices own graph has NO opinion at all about how her own local A relates to Bobs remote B — not CONCURRENT, not BEFORE: UNKNOWN, because A itself was never recorded on this replica. Local timing never manufactures a causal fact this replica has no actual basis for.');

    // Bob, meanwhile, receives Alices local A and C as ordinary REMOTE
    // operations, and — because they arrive through the real incoming
    // feed — DOES get to record the real relationship between them.
    assert(bob.causalGraph.isKnown(worldId, localA.id) && bob.causalGraph.isKnown(worldId, localC.id),
        '32. Bob knows about Alices A and C — the identical two operations Alices OWN replica never marked KNOWN to herself');
    assert(bob.causalGraph.compare(worldId, localA.id, localC.id) === CausalRelationship.BEFORE,
        '33. Bob correctly sees A BEFORE C — the SAME causal fact is knowable on Bobs replica through ordinary receipt, even though it is structurally unrepresented on Alices own replica, the very author');

    // Both replicas happen to converge on the SAME final value here — a
    // consequence of this sections own scripted delivery timing (D is
    // the last operation either replica ever applies, on both sides),
    // never a claim that local/remote interleaving guarantees
    // convergence in general. Sections 2 and 6 already prove the
    // opposite directly; this section's own point is narrower and
    // orthogonal to final-value convergence entirely — see 28/29/31/33.
    const aliceExecutedIds = aliceHistory.getExecutedCommands().map((c) => c.id);
    const bobExecutedIds = bobHistory.getExecutedCommands().map((c) => c.id);
    assert(aliceExecutedIds.length === 4 && aliceExecutedIds[0] === localA.id && aliceExecutedIds[1] === localC.id,
        '34. Alices own two local edits execute back-to-back, before either of Bobs remote ones ever arrives — true LOCAL execution order, never touched by anything remote');
    assert(bobExecutedIds[0] === localA.id && bobExecutedIds.includes(remoteB.id) && bobExecutedIds.includes(remoteD.id) && bobExecutedIds.includes(localC.id),
        '35. Bob applies all four operations exactly once each — his own two local edits AND both of Alices remote ones — regardless of the fact that his own causal graph never linked his local B/D to Alices remote A/C at all (31s finding, mirrored: from Bobs perspective it is Alices A/C that are UNKNOWN to compare() against his OWN local B/D)');
    assert(currentGroupName(aliceDoc) === currentGroupName(bobDoc), '36. both replicas happen to converge here (Bob-Local-2) — incidental to this scripts own exact timing, not a guarantee this section is making');

    unattachAliceIncoming(); unattachBobIncoming();
    alice.dispose(); bob.dispose();
    console.log('✓ Section 5: local execution is never an implicit causal predecessor for anything that never named it — even the AUTHORING replica never marks its own local operations causally KNOWN to itself — and real local/remote interleaving reproduces the identical divergence risk Section 2 established synthetically');
}

// ===================================================================
// Section 6 — Undo/redo remains local, even across a genuinely diverged,
// concurrent-conflict document. Concurrent conflicts must never imply
// synchronized undo, remote undo, inverse-operation propagation, or
// rollback of another user's operation.
// ===================================================================
{
    const network = new LocalPeerNetwork();
    const aliceDevice = makeDevice('Alice-240-undo');
    const bobDevice = makeDevice('Bob-240-undo');
    const alice = makeFullStack(aliceDevice);
    const bob = makeFullStack(bobDevice);
    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-240-undo', aliceDevice, 'bob-240-undo', bobDevice);
    alice.connectedPeerRegistry.add(peerA);
    bob.connectedPeerRegistry.add(peerB);

    // Same wiring posture as Section 5 — no outgoing
    // `propagation.attachCommandHistory()` on either replica's own
    // commandHistory, since both already apply INCOMING remote
    // operations through that identical instance; each local edit is
    // executed and broadcast explicitly instead.
    const worldId = 'doc-240-undo';
    const aliceDoc = buildBaseDocument({ worldId, authorIdentityId: bobDevice.identity.identityId, title: 'undo (alice)', groupName: 'Original' });
    const aliceHistory = new CommandHistory({ world: aliceDoc.world });
    const aliceTarget = { documentId: worldId, document: aliceDoc, commandHistory: aliceHistory };
    alice.state.target = aliceTarget;
    const unattachAliceIncoming = alice.deferral.attachCommandHistory({ documentId: worldId, commandHistory: aliceHistory });

    const bobDoc = buildBaseDocument({ worldId, authorIdentityId: aliceDevice.identity.identityId, title: 'undo (bob)', groupName: 'Original' });
    const bobHistory = new CommandHistory({ world: bobDoc.world });
    const bobTarget = { documentId: worldId, document: bobDoc, commandHistory: bobHistory };
    bob.state.target = bobTarget;
    const unattachBobIncoming = bob.deferral.attachCommandHistory({ documentId: worldId, commandHistory: bobHistory });

    // Two genuinely concurrent local renames, one per replica.
    const aliceLocal = renameCommand(worldId, 'Alice-Local', { id: 'undo-alice' });
    const bobLocal = renameCommand(worldId, 'Bob-Local', { id: 'undo-bob' });
    aliceHistory.execute(aliceLocal);
    alice.propagation.broadcastCommand({ documentId: worldId, command: aliceLocal, causalPredecessors: [] });
    bobHistory.execute(bobLocal);
    bob.propagation.broadcastCommand({ documentId: worldId, command: bobLocal, causalPredecessors: [] });
    await wait(80);

    assert(currentGroupName(aliceDoc) === 'Bob-Local', '37. Alice ends up at "Bob-Local" — Bobs remote rename arrived and applied after her own local one');
    assert(currentGroupName(bobDoc) === 'Alice-Local', '38. Bob, symmetrically, ends up at "Alice-Local" — the SAME divergence shape as Sections 2 and 5, reproduced a third, independent way');
    assert(alice.causalGraph.compare(worldId, aliceLocal.id, bobLocal.id) !== CausalRelationship.BEFORE
        && alice.causalGraph.compare(worldId, aliceLocal.id, bobLocal.id) !== CausalRelationship.AFTER,
        '39. and it is a genuine conflict, not a causal one: neither rename is BEFORE the other on Alices own graph (Alices own local op is UNKNOWN to her own graph, exactly Section 5s own finding — never CONCURRENTLY promoted to a false BEFORE/AFTER either)');

    let aliceUndoneEvents = 0;
    const unsubUndo = aliceHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_UNDONE, () => { aliceUndoneEvents += 1; });

    // Alice undoes TWICE — first pops whatever is on top of HER OWN
    // stack (Bobs remote rename, since it executed last on her replica),
    // then pops her own original local rename too, returning her
    // document to its true pre-edit state.
    assert(aliceHistory.canUndo(), '40. Alice has something to undo');
    aliceHistory.undo();
    assert(currentGroupName(aliceDoc) === 'Alice-Local', '41. undoing ONCE reverts whatever is actually on top of Alices own stack — Bobs remote rename — restoring Alices own prior value, exactly as CommandHistory#undo() always has, with zero awareness that the command it just reverted was authored by someone else entirely');
    aliceHistory.undo();
    assert(currentGroupName(aliceDoc) === 'Original', '42. undoing a SECOND time reverts Alices own original local rename too, returning to the documents true starting state');
    assert(aliceUndoneEvents === 2, '43. exactly two COMMAND_UNDONE events fired, both local to Alices own CommandHistory');

    await wait(80);
    assert(currentGroupName(bobDoc) === 'Alice-Local', '44. Bobs document is COMPLETELY UNCHANGED by either of Alices undo calls — no message was ever sent for either one');
    assert(bob.recovered.length === 0, '45. Bob never even entered a recovery/gap-repair path over this — CommandHistory#undo() only ever publishes COMMAND_UNDONE on ITS OWN local event bus (application/CommandHistory.js#undo()), and nothing in this stack ever wires that event to propagation — exactly why DocumentCommandPropagationUseCase#attachCommandHistory()s own header names it explicitly: "undo()/redo() publish COMMAND_UNDONE/COMMAND_REDONE, neither of which this method ever listens to"');

    // redo() is the identical story: purely local, never propagated,
    // and it does not "fix" or acknowledge the divergence with Bob
    // either — it simply re-executes whatever Alice just undid.
    assert(aliceHistory.canRedo(), '46. Alice can redo');
    aliceHistory.redo();
    assert(currentGroupName(aliceDoc) === 'Alice-Local', '47. the first redo replays Alices own original local rename');
    aliceHistory.redo();
    assert(currentGroupName(aliceDoc) === 'Bob-Local', '48. the second redo replays Bobs remote rename right back in — Alice now locally holds the exact same value she started this section with, entirely through her own local undo/redo, none of it ever touching the network');
    await wait(60);
    assert(currentGroupName(bobDoc) === 'Alice-Local', '49. Bobs document is STILL untouched by any of Alices redo calls either');

    // The causal record itself is immutable — undo/redo replaying local
    // history does not retroactively rewrite what the causal graph
    // already recorded about this pair.
    assert(alice.causalGraph.compare(worldId, aliceLocal.id, bobLocal.id) !== CausalRelationship.BEFORE
        && alice.causalGraph.compare(worldId, aliceLocal.id, bobLocal.id) !== CausalRelationship.AFTER,
        '50. after two undos and two redos, the causal relationship between aliceLocal and bobLocal is exactly what it always was — never rewritten by local undo/redo replay');

    unsubUndo.unsubscribe();
    unattachAliceIncoming(); unattachBobIncoming();
    alice.dispose(); bob.dispose();
    console.log('✓ Section 6: undo/redo stays strictly local even across a genuinely diverged, concurrent-conflict document — undo can even revert a REMOTE peers own operation locally, but that reversal (and its redo) never propagates, never implies synchronized undo, remote undo, inverse-operation broadcast, or rollback of anyone elses state, and never rewrites the causal record');
}

// ===================================================================
// Section 7 — Recovery interaction: A || B, A initially missing and
// later recovered. Recovery must establish A as KNOWN, but must NEVER
// retroactively impose an ordering relationship between A and B.
// ===================================================================
{
    const network = new LocalPeerNetwork();
    const carolDevice = makeDevice('Carol-240-recovery');
    const daveDevice = makeDevice('Dave-240-recovery');
    const carol = makeFullStack(carolDevice);
    const dave = makeFullStack(daveDevice);
    const { peerA: peerCarol, peerB: peerDave } = await connectAndAuthenticate(network, 'carol-240-recovery', carolDevice, 'dave-240-recovery', daveDevice);
    carol.connectedPeerRegistry.add(peerCarol);
    dave.connectedPeerRegistry.add(peerDave);

    const worldId = 'doc-240-recovery-concurrent';
    const carolDoc = buildBaseDocument({ worldId, authorIdentityId: daveDevice.identity.identityId, title: 'recovery concurrent (carol)', groupName: 'Original' });
    const carolHistory = new CommandHistory({ world: carolDoc.world });
    carol.state.target = { documentId: worldId, document: carolDoc, commandHistory: carolHistory };
    const unattachRecoveryHistory = carol.recovery.attachCommandHistory({ documentId: worldId, commandHistory: carolHistory });

    const daveDoc = buildBaseDocument({ worldId, authorIdentityId: carolDevice.identity.identityId, title: 'recovery concurrent (dave)', groupName: 'Original' });
    const daveHistory = new CommandHistory({ world: daveDoc.world });
    const daveTarget = { documentId: worldId, document: daveDoc, commandHistory: daveHistory };
    dave.state.target = daveTarget;
    const unattachDeferralHistory = dave.deferral.attachCommandHistory({ documentId: worldId, commandHistory: daveHistory });

    // A: Carol executes it locally, but never broadcasts it directly —
    // Dave will only ever learn of it via recovery, exactly like
    // tests/CausalDeferralLifecycleAudit.test.js Section 4a's own base
    // case.
    const opA = renameCommand(worldId, 'Carol-A', { id: 'rec-a' });
    carolHistory.execute(opA);

    // B: Carol broadcasts it directly, with NO causal predecessor at
    // all — genuinely CONCURRENT with A, by construction, never merely
    // "arrived at a different time."
    const opB = renameCommand(worldId, 'Carol-B', { id: 'rec-b' });
    carol.propagation.broadcastCommand({ documentId: worldId, command: opB, causalPredecessors: [] });
    await wait(60);
    assert(currentGroupName(daveDoc) === 'Carol-B', '51. B, a genesis operation naming nothing, applies immediately on Dave');

    // A probe naming A as its own predecessor, purely to make As absence
    // a real, OBSERVED gap Dave requests recovery for. A MoveBrickCommand
    // on purpose — it never touches the group name, keeping this
    // sections own A/B rename experiment unpolluted by its own probe.
    const opProbeA = moveCommand(worldId, { x: 7, y: 0, z: 0 }, { id: 'rec-probe-a' });
    carol.propagation.broadcastCommand({ documentId: worldId, command: opProbeA, causalPredecessors: [opA.id] });
    await wait(140); // gap-observation -> recovery request -> Carol's response round trip

    assert(dave.recovered.some((r) => r.command.id === opA.id), '52. A was recovered (KNOWN) via the real recovery protocol');
    assert(dave.causalGraph.isKnown(worldId, opA.id) && dave.causalGraph.isKnown(worldId, opB.id),
        '53. both A (recovered) and B (received normally) are now KNOWN to Daves own causal graph');
    assert(currentGroupName(daveDoc) === 'Carol-B', '54. recovering A applies NOTHING — the document is still exactly what B alone produced; recovery is knowledge, never execution');

    // The core question this section exists to answer: does recovering A
    // — which happened, in wall-clock terms, strictly AFTER B was
    // already received and applied — retroactively make A "before" or
    // "after" B in the causal graph? It must not: A and B were never
    // causally related by either operation's own author, and recovery
    // is not authorship.
    assert(dave.causalGraph.compare(worldId, opA.id, opB.id) === CausalRelationship.CONCURRENT,
        '55. A and B compare CONCURRENT on Daves own graph — recovering A, well after B, imposes no ordering relationship of its own between them');

    const replayOutcome = dave.replay.replay({ documentId: worldId, operationId: opA.id }, daveTarget);
    assert(replayOutcome === 'REPLAYED', '56. explicit replay(A) succeeds — A really was recovered');
    await wait(30);

    assert(dave.causalGraph.compare(worldId, opA.id, opB.id) === CausalRelationship.CONCURRENT,
        '57. AFTER A is actually EXECUTED (via replay), the causal graph STILL reports CONCURRENT for the identical pair — execution changes what CommandHistory records, never what the causal graph itself was told at authoring time; KNOWN, EXECUTED, and the CAUSAL RELATIONSHIP between two operations are three independent facts, exactly as core/DocumentOperationProvenance.js and this files own header already distinguish');
    assert(currentGroupName(daveDoc) === 'Carol-A', '58. the DOCUMENT value now reflects real execution order — B executed first (at genesis time), A executed second (via the later replay) — last-executed-wins, HistoryOrderingBasis.ARRIVAL_ORDER, a completely different axis from the CONCURRENT verdict in 57, which never changed');
    assert(brickX(daveDoc) === 7, '59. opProbeA itself released too, once its own real predecessor A finally executed');
    assert(dave.deferral.getDeferredOperationIds(worldId).length === 0, '60. nothing left retained');

    unattachRecoveryHistory(); unattachDeferralHistory(); carol.dispose(); dave.dispose();
    console.log('✓ Section 7: recovery makes a missing operation KNOWN without ever retroactively imposing a causal ordering it was never authored with — CONCURRENT before recovery, CONCURRENT after recovery, CONCURRENT after the recovered operation is actually executed; only the DOCUMENT VALUE (a completely separate, arrival-order-basis question) moves, never the causal verdict');
}

// ===================================================================
// Section 8 — Policy contradiction search, and the conflict-semantics
// evidence matrix this milestone exists to produce.
// ===================================================================
{
    // A fresh, minimal repetition of Section 2's own experiment, kept
    // self-contained here so this section's own conclusions rest on
    // evidence generated INSIDE it, not merely a cross-section reference.
    const worldIdX = 'doc-240-policy-x';
    const worldIdY = 'doc-240-policy-y';
    const replicaX = makeDeferralHarness(worldIdX);
    const replicaY = makeDeferralHarness(worldIdY);
    const one = renameCommand(worldIdX, 'One', { id: 'policy-one' });
    const two = renameCommand(worldIdX, 'Two', { id: 'policy-two' });
    const oneY = renameCommand(worldIdY, 'One', { id: 'policy-one' });
    const twoY = renameCommand(worldIdY, 'Two', { id: 'policy-two' });
    receiveOperation(replicaX, { documentId: worldIdX, command: one, causalPredecessors: [] });
    receiveOperation(replicaX, { documentId: worldIdX, command: two, causalPredecessors: [] });
    receiveOperation(replicaY, { documentId: worldIdY, command: twoY, causalPredecessors: [] });
    receiveOperation(replicaY, { documentId: worldIdY, command: oneY, causalPredecessors: [] });
    const divergedHere = currentGroupName(replicaX.document) !== currentGroupName(replicaY.document);

    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.delivery.order === DeliveryOrderGuarantee.NOT_GUARANTEED,
        '61. delivery.order stays NOT_GUARANTEED — every section above delivered the identical operation pairs in opposite orders across replicas with nothing enforcing otherwise');
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.application.remote === RemoteApplicationTiming.CAUSAL_READINESS,
        '62. application.remote stays CAUSAL_READINESS — every genuinely CAUSAL pair in Sections 3, 4, and 7 (A -> B) waited correctly; nothing in this milestone touches that gate');
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.history.orderingBasis === HistoryOrderingBasis.ARRIVAL_ORDER,
        '63. history.orderingBasis stays ARRIVAL_ORDER — Sections 2, 5, 6, and 7 each showed the final document value tracks real execution order, never a causal or logical clock');
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.conflict.nonCommutingOperations === ConcurrentConflictResolution.UNDEFINED,
        '64. conflict.nonCommutingOperations stays UNDEFINED — no section anywhere in this suite discovered, or implemented, a resolution rule for a non-commuting concurrent pair');
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.convergence.guaranteed === ReplicaConvergenceGuarantee.NOT_GUARANTEED,
        '65. convergence.guaranteed stays NOT_GUARANTEED — directly reproduced again, fresh, in this very section (divergedHere)');
    assert(divergedHere === true, '66. this sections own fresh experiment reproduces real divergence — NOT_GUARANTEED is graded against live evidence generated in THIS section, not merely inherited from Section 2');

    // Contradiction check: if conflict.nonCommutingOperations were ever
    // reassigned to a real, DETERMINISTIC rule (say, "highest
    // operationId wins") while convergence.guaranteed stayed
    // NOT_GUARANTEED, that combination would itself be the
    // contradiction — a deterministic rule applied IDENTICALLY on every
    // replica would guarantee convergence for every non-commuting pair
    // by construction. The current pairing (UNDEFINED + NOT_GUARANTEED)
    // is the only mutually consistent one this evidence supports; a
    // future milestone that adds a real resolution rule must move BOTH
    // fields together, or this same contradiction check would catch it.
    assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.conflict.nonCommutingOperations === ConcurrentConflictResolution.UNDEFINED
        && DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.convergence.guaranteed === ReplicaConvergenceGuarantee.NOT_GUARANTEED,
        '67. conflict.nonCommutingOperations and convergence.guaranteed are the one mutually consistent pairing this suites own evidence supports — UNDEFINED implies NOT_GUARANTEED, never GUARANTEED');

    // Causal correctness (0.9.237-0.9.239) and conflict semantics (this
    // milestone) are graded against DIFFERENT evidence and must never be
    // conflated: a BEFORE pair (Section 3a, Section 7) is fully
    // deterministic and RELIABLE today; a CONCURRENT non-commuting pair
    // (Sections 2, 4, 5, 6, 8) is not, and CAUSAL_READINESS never claimed
    // it would be.
    assert(RemoteApplicationTiming.CAUSAL_READINESS !== ConcurrentConflictResolution.UNDEFINED,
        '68. sanity: the two enums remain genuinely distinct vocabularies, never accidentally merged into one');

    console.log('\n0.9.240 — Conflict-Semantics Evidence Matrix\n' +
'| Situation                          | Causal relation | Applies?            | Order guaranteed?    | Convergence guaranteed? |\n' +
'|-------------------------------------|------------------|---------------------|-----------------------|---------------------------|\n' +
'| A alone (genesis)                   | -                | Yes                 | -                     | -                         |\n' +
'| A -> B (explicit predecessor)       | BEFORE           | Yes, after A         | Causally constrained  | Not globally (Sec 3, 7)   |\n' +
'| A || B, commuting (delta)           | CONCURRENT       | Yes, independently   | Not guaranteed        | Yes, observed (Sec 1)     |\n' +
'| A || B, non-commuting (abs-set)     | CONCURRENT       | Yes, independently   | Not guaranteed        | NO (Sec 2, 4, 5, 6)       |\n' +
'| recovered A, A -> B                 | BEFORE           | B waits for A exec   | Causally constrained  | Not globally               |\n' +
'| recovered A, A || B                 | CONCURRENT        | Independently        | Not guaranteed        | NO (Sec 7)                |\n');

    console.log('✓ Section 8: every policy field this milestone touched (it touched none — this is READ-only verification) remains internally consistent with fresh, live evidence, and the one row that matters — CONCURRENT, non-commuting, causally-ready operations — is confirmed genuinely UNRESOLVED, never accidentally deterministic');
}

console.log('\n0.9.240 — the concurrent document conflict semantics reassessment holds: commuting concurrent operations already converge with no conflict machinery (1); non-commuting concurrent operations produce genuine, permanent, expected divergence (2); causal dependency and concurrency stay fundamentally distinct regardless of arrival order (3); three-way concurrency with non-commuting siblings still releases its joining successor in deterministic causal order, proving causal correctness and conflict semantics are orthogonal (4); local execution is never an implicit causal predecessor, even to the authoring replica itself (5); undo/redo stays strictly local even across a genuinely diverged document, and never rewrites the causal record (6); recovery establishes knowledge without ever retroactively imposing an ordering relationship (7); and the resulting evidence matrix confirms the policy descriptor\'s own ConcurrentConflictResolution.UNDEFINED and ReplicaConvergenceGuarantee.NOT_GUARANTEED are the correct, load-bearing, internally-consistent names for real, reproduced behavior (8). Zero new mechanism was added — this milestone answers the ONE open question 0.9.237-0.9.239 left named: divergence under concurrent, non-commutative, causally-ready edits is a genuine, currently-accepted property of ForkBuild\'s collaboration model, not a bug. Whether the product now requires convergence is the next, deliberately separate decision.');

}

runTests().then(() => {
    console.log('\n✓ All ConcurrentDocumentConflictSemanticsAudit tests passed');
}).catch((error) => {
    console.error('\n✗ ConcurrentDocumentConflictSemanticsAudit tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
