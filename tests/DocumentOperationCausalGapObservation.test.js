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
import {
    RemoteDocumentOperationApplicationUseCase,
    DocumentOperationApplicationOutcome
} from '../application/RemoteDocumentOperationApplicationUseCase.js';
import { CausalGapStatus } from '../core/DocumentOperationCausalGapDetector.js';
import { DocumentOperationCausalGapObservationUseCase } from '../application/DocumentOperationCausalGapObservationUseCase.js';

// 0.9.229 — Causal Gap Observation at the Propagation Boundary.
//
// 0.9.228 built `DocumentOperationCausalGapDetector` as an isolated,
// directly-callable capability. This milestone connects it to the REAL
// receive path — `DocumentCommandPropagationUseCase#onOperationReceived()`
// — so every operation this replica actually accepts over the network
// produces one observable causal-gap result, without changing whether or
// how that operation gets applied. Every section below exercises the new
// `application/DocumentOperationCausalGapObservationUseCase.js` wired the
// SAME way `application/RemoteDocumentOperationApplicationUseCase.js`
// already attaches to that identical feed — two independent subscribers,
// neither one aware of the other.
//
// Deliberately NOT tested here, because it deliberately does not exist:
// buffering, retransmission, automatic predecessor retrieval, retry,
// reordering, or any reaction to a GAP result beyond making it
// observable. See DocumentOperationCausalGapObservationUseCase.js's own
// header.

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
    const received = [];
    const rejected = [];
    const state = { target: null };
    const propagation = new DocumentCommandPropagationUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        identityProvider: device.provider, commandRegistry,
        resolveDocument: (id) => (state.target && state.target.documentId === id ? state.target.document : null)
    });
    propagation.onOperationReceived((documentId, command, authorIdentityId, causalPredecessors) => received.push({ documentId, command, authorIdentityId, causalPredecessors }));
    propagation.onOperationRejected((reason, envelope) => rejected.push({ reason, envelope }));
    return { device, peerMessageBus, connectedPeerRegistry, deviceAuth, propagation, received, rejected, state };
}

function buildBaseDocument({ worldId, authorIdentityId, title }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: 'building-x' });
    building.addBrick(new Brick({ id: 'brick-a', definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
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

async function runTests() {

const network = new LocalPeerNetwork();
const aliceDevice = makeDevice('Alice');
const bobDevice = makeDevice('Bob');
const alice = makeSenderStack(aliceDevice);
const bob = makeReceiverStack(bobDevice);
const { peerA, peerB } = await connectAndAuthenticate(network, 'alice', aliceDevice, 'bob', bobDevice);
alice.connectedPeerRegistry.add(peerA);
bob.connectedPeerRegistry.add(peerB);

function wireBob(target) {
    const gapObservation = new DocumentOperationCausalGapObservationUseCase();
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const observations = [];
    gapObservation.onGapObserved((descriptor) => observations.push(descriptor));
    // 0.9.229 — registered BEFORE the application subscription, exactly
    // the order application/EditorSession.js now wires these two in
    // production (see that file's own 0.9.229 comment).
    const unsubscribeGap = gapObservation.attachToPropagation(bob.propagation);
    const unsubscribeApplication = applicationUseCase.attachToPropagation(bob.propagation, () => target);
    return {
        gapObservation, applicationUseCase, observations,
        dispose: () => { unsubscribeGap(); unsubscribeApplication(); }
    };
}

// ===================================================================
// Section A — Ungapped receive: once a predecessor has actually been
// accepted, a later operation naming it is observed as NO_GAP, and still
// applies exactly as 0.9.223/0.9.224 already do.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-obs-a', aliceDevice.identity.identityId, 'Section A');
    const wired = wireBob(target);

    const opA = moveCommand('doc-obs-a', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-obs-a', command: opA, causalPredecessors: [] });
    await wait(20);
    const opB = moveCommand('doc-obs-a', { x: 2, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-obs-a', command: opB, causalPredecessors: [opA.id] });
    await wait(20);

    assert(wired.observations.length === 2, '1. both accepted operations produced an observation');
    assert(wired.observations[0].causalGap.status === CausalGapStatus.NO_GAP, '2. a genesis operation (no predecessors) is NO_GAP');
    assert(wired.observations[1].causalGap.status === CausalGapStatus.NO_GAP, '3. once A was accepted, B naming A as its predecessor is NO_GAP');
    assert(JSON.stringify(wired.observations[1].causalPredecessors) === JSON.stringify([opA.id]), '4. the descriptor carries B\'s own causal predecessors unchanged');
    assert(Object.keys(wired.observations[1]).sort().join(',') === 'causalGap,causalPredecessors,documentId,operationId', '5. the descriptor is exactly the small, flat shape this milestone specifies — no lifecycle fields');
    assert(target.commandHistory.getExecutedCommands().length === 2, '6. both operations were applied, unaffected by gap observation');
    assert(target.commandHistory.getExecutedCommands()[0].id === opA.id && target.commandHistory.getExecutedCommands()[1].id === opB.id, '7. applied in arrival order — application/CommandHistory.js is untouched');

    wired.dispose();
    console.log('✓ Section A: an operation whose predecessor was already accepted is observed as NO_GAP and applies normally');
}

// ===================================================================
// Section B — Gapped receive: an operation naming a predecessor this
// replica never received is observed as GAP, naming exactly that
// predecessor, while the operation still applies.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-obs-b', aliceDevice.identity.identityId, 'Section B');
    const wired = wireBob(target);

    const opB = moveCommand('doc-obs-b', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-obs-b', command: opB, causalPredecessors: ['operation-bob-never-received'] });
    await wait(20);

    assert(wired.observations.length === 1, '8. the gapped operation still produced exactly one observation');
    assert(wired.observations[0].causalGap.status === CausalGapStatus.GAP, '9. a predecessor this replica never received is a detected gap');
    assert(JSON.stringify(wired.observations[0].causalGap.missingCausalPredecessorIds) === JSON.stringify(['operation-bob-never-received']), '10. the missing predecessor is named exactly');
    assert(target.commandHistory.getExecutedCommands().length === 1, '11. the gapped operation was still applied');
    assert(target.commandHistory.getExecutedCommands()[0].id === opB.id, '12. the applied operation is genuinely the one that was gapped');

    wired.dispose();
    console.log('✓ Section B: an operation naming a never-received predecessor is observed as GAP, exactly naming it, and still applies');
}

// ===================================================================
// Section C — Regression: GAP and application are never coupled. This
// restates Section B's own proof as its own explicit assertion, so a
// future change that accidentally makes GAP gate application fails here
// even if Section B's own assertions are ever relaxed.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-obs-c', aliceDevice.identity.identityId, 'Section C');
    const wired = wireBob(target);

    const gapped = moveCommand('doc-obs-c', { x: 1, y: 0, z: 0 });
    let outcome = null;
    const unsubscribeOutcome = bob.propagation.onOperationReceived((documentId, command) => {
        if (command.id === gapped.id) {
            outcome = wired.applicationUseCase.apply({ documentId, command, authorIdentityId: aliceDevice.identity.identityId }, target);
        }
    });
    alice.propagation.broadcastCommand({ documentId: 'doc-obs-c', command: gapped, causalPredecessors: ['never-arrives'] });
    await wait(20);

    assert(wired.observations[0].causalGap.status === CausalGapStatus.GAP, '13. the operation is genuinely gapped');
    // `apply()` above is a SECOND, independent call — the observations[0]
    // GAP result never reached it, never could: DocumentOperationCausalGapObservationUseCase
    // exposes no method that gates or informs `apply()` in any way.
    assert(outcome === DocumentOperationApplicationOutcome.APPLIED, '14. GAP + immediate application coexist — a GAP result never blocks or delays apply()');

    unsubscribeOutcome();
    wired.dispose();
    console.log('✓ Section C: GAP and application are independent facts — detection never gates the existing apply() path');
}

// ===================================================================
// Section D — A detected gap disappears on a LATER re-query once the
// missing predecessor itself arrives — but nothing here replays or
// re-applies anything automatically; a caller has to ask again.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-obs-d', aliceDevice.identity.identityId, 'Section D');
    const wired = wireBob(target);

    const opA = moveCommand('doc-obs-d', { x: 1, y: 0, z: 0 });
    const opB = moveCommand('doc-obs-d', { x: 2, y: 0, z: 0 });
    // B arrives first, naming A — which has not been sent yet.
    alice.propagation.broadcastCommand({ documentId: 'doc-obs-d', command: opB, causalPredecessors: [opA.id] });
    await wait(20);
    assert(wired.observations.length === 1 && wired.observations[0].causalGap.status === CausalGapStatus.GAP, '15. B arrives with A missing -> GAP');

    // A arrives afterward, as its own, unrelated, genesis operation.
    alice.propagation.broadcastCommand({ documentId: 'doc-obs-d', command: opA, causalPredecessors: [] });
    await wait(20);
    assert(wired.observations.length === 2, '16. A\'s own arrival produces its OWN observation (NO_GAP, a genesis operation) — never a second observation for B');
    assert(wired.observations[1].operationId === opA.id && wired.observations[1].causalGap.status === CausalGapStatus.NO_GAP, '17. A itself is NO_GAP');
    // Confirm B's own gap is still exactly what was reported the moment
    // it arrived — nothing retroactively rewrote it.
    assert(wired.observations[0].causalGap.status === CausalGapStatus.GAP, '18. B\'s ORIGINAL observation is untouched — no automatic replay or retroactive correction');

    // A caller that deliberately asks again, now that A is known, gets
    // the resolved answer — this is the ONLY way the gap "disappears."
    const reChecked = wired.gapObservation.observe({ documentId: 'doc-obs-d', operationId: opB.id, causalPredecessors: [opA.id] });
    assert(reChecked.causalGap.status === CausalGapStatus.NO_GAP, '19. re-querying the SAME operation after its predecessor is known now answers NO_GAP');
    assert(wired.observations.length === 3, '20. the re-query is itself an ordinary observe() call and is observed like any other — never a hidden, privileged replay path');

    wired.dispose();
    console.log('✓ Section D: a gap disappears only when a caller deliberately re-queries, never automatically');
}

// ===================================================================
// Section E — Multiple missing predecessors: a diamond-shaped dependency
// (top -> {left, right} -> bottom) correctly names only the specific
// predecessor this replica never received, even though a sibling and the
// common ancestor are both known.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-obs-e', aliceDevice.identity.identityId, 'Section E');
    const wired = wireBob(target);

    const top = moveCommand('doc-obs-e', { x: 1, y: 0, z: 0 });
    const left = moveCommand('doc-obs-e', { x: 2, y: 0, z: 0 });
    const right = moveCommand('doc-obs-e', { x: 3, y: 0, z: 0 }); // deliberately never sent
    const bottom = moveCommand('doc-obs-e', { x: 4, y: 0, z: 0 });

    alice.propagation.broadcastCommand({ documentId: 'doc-obs-e', command: top, causalPredecessors: [] });
    await wait(20);
    alice.propagation.broadcastCommand({ documentId: 'doc-obs-e', command: left, causalPredecessors: [top.id] });
    await wait(20);
    alice.propagation.broadcastCommand({ documentId: 'doc-obs-e', command: bottom, causalPredecessors: [left.id, right.id] });
    await wait(20);

    assert(wired.observations.length === 3, '21. top, left, and bottom each produced exactly one observation — right was never sent, so it never does');
    assert(wired.observations[2].causalGap.status === CausalGapStatus.GAP, '22. bottom depends on right, which is missing');
    assert(JSON.stringify(wired.observations[2].causalGap.missingCausalPredecessorIds) === JSON.stringify([right.id]), '23. only right is named missing — left and top, both known, are not falsely included');
    assert(target.commandHistory.getExecutedCommands().length === 3, '24. all three received operations were applied — the never-sent right was never received, so it was never applied either');

    wired.dispose();
    console.log('✓ Section E: a diamond-shaped dependency names precisely the one predecessor this replica never received');
}

// ===================================================================
// Section F — Duplicate delivery: ReplayGuard owns deduplication.
// Causal gap observation must never become a second duplicate-delivery
// mechanism — a retransmitted operation is never observed twice.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-obs-f', aliceDevice.identity.identityId, 'Section F');
    const wired = wireBob(target);

    const op = moveCommand('doc-obs-f', { x: 1, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-obs-f', command: op, causalPredecessors: [] });
    await wait(20);
    // Retransmit the IDENTICAL command (same operationId) a second time.
    alice.propagation.broadcastCommand({ documentId: 'doc-obs-f', command: op, causalPredecessors: [] });
    await wait(20);

    assert(bob.rejected.length === 1 && bob.rejected[0].reason === 'DUPLICATE', '25. the retransmission was rejected by ReplayGuard, as expected');
    assert(wired.observations.length === 1, '26. the duplicate never reached onOperationReceived(), so it was never observed a second time');
    assert(target.commandHistory.getExecutedCommands().length === 1, '27. the duplicate was never applied a second time either');

    wired.dispose();
    console.log('✓ Section F: a retransmitted operation is never observed twice — ReplayGuard\'s own deduplication is untouched');
}

// ===================================================================
// Section G — Document isolation: the SAME operationId, used as a
// causal predecessor reference under two different documents, must be
// resolved completely independently in each.
// ===================================================================
{
    const gapObservation = new DocumentOperationCausalGapObservationUseCase();
    gapObservation.observe({ documentId: 'doc-obs-g-x', operationId: 'shared-id', causalPredecessors: [] });

    const sameDocument = gapObservation.observe({ documentId: 'doc-obs-g-x', operationId: 'op-2', causalPredecessors: ['shared-id'] });
    assert(sameDocument.causalGap.status === CausalGapStatus.NO_GAP, '28. within doc-obs-g-x, shared-id is known and satisfies the predecessor reference');

    const otherDocument = gapObservation.observe({ documentId: 'doc-obs-g-y', operationId: 'op-2', causalPredecessors: ['shared-id'] });
    assert(otherDocument.causalGap.status === CausalGapStatus.GAP, '29. the identical operationId recorded only under doc-obs-g-x does not satisfy a reference to it under doc-obs-g-y');
    assert(JSON.stringify(otherDocument.causalGap.missingCausalPredecessorIds) === JSON.stringify(['shared-id']), '30. doc-obs-g-y correctly reports shared-id as missing in its own scope');

    console.log('✓ Section G: causal gap observation stays strictly document-scoped, exactly like the detector underneath it');
}

// ===================================================================
// Section H — Failure isolation: a failure inside the observational
// detector must never become a network failure, an operation rejection,
// or an application failure. Registered BEFORE the application
// subscription (as production wires it), so this also proves a throwing
// FIRST listener cannot silently prevent a working SECOND listener from
// running on the SAME onOperationReceived feed.
// ===================================================================
{
    const target = openReplicaDocument(bob, 'doc-obs-h', aliceDevice.identity.identityId, 'Section H');
    const rejectedBefore = bob.rejected.length; // Section F's own duplicate rejection already accumulated on this shared receiver stack.
    const brokenDetector = {
        detect() { throw new Error('synthetic causal gap detector failure'); },
        record() { throw new Error('synthetic causal gap detector failure'); }
    };
    const gapObservation = new DocumentOperationCausalGapObservationUseCase({ causalGapDetector: brokenDetector });
    const applicationUseCase = new RemoteDocumentOperationApplicationUseCase();
    const unsubscribeGap = gapObservation.attachToPropagation(bob.propagation);
    const unsubscribeApplication = applicationUseCase.attachToPropagation(bob.propagation, () => target);

    const opOne = moveCommand('doc-obs-h', { x: 1, y: 0, z: 0 });
    let threw = false;
    try {
        alice.propagation.broadcastCommand({ documentId: 'doc-obs-h', command: opOne, causalPredecessors: [] });
        await wait(20);
    } catch {
        threw = true;
    }

    assert(!threw, '31. a broken detector never escapes as an unhandled exception on the receive path');
    assert(bob.rejected.length === rejectedBefore, '32. the operation was never rejected — a downstream observer failing is not a reason to refuse an already-accepted operation');
    assert(target.commandHistory.getExecutedCommands().length === 1, '33. the operation was still applied — RemoteDocumentOperationApplicationUseCase\'s own subscription runs independently of the broken one ahead of it');

    // Prove the network/connection itself is unaffected: a second,
    // unrelated operation is still received and applied normally.
    const opTwo = moveCommand('doc-obs-h', { x: 2, y: 0, z: 0 });
    alice.propagation.broadcastCommand({ documentId: 'doc-obs-h', command: opTwo, causalPredecessors: [opOne.id] });
    await wait(20);
    assert(target.commandHistory.getExecutedCommands().length === 2, '34. a subsequent operation still arrives and applies normally — the broken detector never disrupts the shared connection');
    assert(bob.rejected.length === rejectedBefore, '35. still never rejected');

    unsubscribeGap();
    unsubscribeApplication();
    console.log('✓ Section H: a broken causal gap detector is fully isolated — never a network failure, an operation rejection, or an application failure');
}

// ===================================================================
// Section I — Input validation & direct-caller discipline: the same
// closed-vocabulary "throw on malformed input" posture every sibling
// file in this lineage already applies to a DIRECT caller of observe();
// only the propagation-attached path (Section H) isolates failures.
// ===================================================================
{
    assertThrows(() => new DocumentOperationCausalGapObservationUseCase({ causalGapDetector: {} }), '36. an invalid causalGapDetector dependency throws at construction');
    const gapObservation = new DocumentOperationCausalGapObservationUseCase();
    assertThrows(() => gapObservation.observe({ documentId: 'doc-obs-i', operationId: '', causalPredecessors: [] }), '37. observe() throws for a malformed operationId, exactly like detect() would');
    assertThrows(() => gapObservation.attachToPropagation(null), '38. attachToPropagation() requires a real DocumentCommandPropagationUseCase');
    assertThrows(() => gapObservation.attachToPropagation({}), '39. attachToPropagation() rejects an object with no onOperationReceived()');
    console.log('✓ Section I: DocumentOperationCausalGapObservationUseCase enforces the same closed-vocabulary discipline as its sibling files for direct callers');
}

alice.propagation.dispose();
bob.propagation.dispose();

console.log('\n0.9.229 — every operation this replica accepts over the real propagation boundary now produces an observable causal-gap result, precisely scoped and document-isolated, without ever gating, delaying, or duplicating application.');

}

runTests().then(() => {
    console.log('\n✓ All DocumentOperationCausalGapObservation tests passed');
}).catch((error) => {
    console.error('\n✗ DocumentOperationCausalGapObservation tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
