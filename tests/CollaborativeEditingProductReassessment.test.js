import { readFile } from 'node:fs/promises';
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
import {
    DOCUMENT_COLLABORATION_CONSISTENCY_POLICY,
    RemoteApplicationTiming,
    DeliveryOrderGuarantee,
    ConcurrentConflictResolution,
    ReplicaConvergenceGuarantee,
    DocumentIsolationGuarantee,
    DuplicateOperationSuppression,
    LocalUndoScope,
    LocalUndoPropagation
} from '../core/DocumentCollaborationConsistencyPolicy.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';

// 0.9.545 — Collaborative Editing Product Reassessment.
//
// 0.9.241 (Post-Collaboration Product Reassessment) closed the Editor's
// own shared-document-editing arc COMPLETE: real-time propagation, causal
// ordering (0.9.238's own CAUSAL_READINESS regression), and a deliberately
// UNDEFINED conflict-resolution policy. Nothing in that verdict has been
// touched since. What HAS happened since is a full arc of Publication work
// this reassessment never had in view: Publication Catalog, Commentary,
// and Notification Lifecycle (0.9.538-0.9.544) all landed on top of a
// Publication identity/immutability model that predates 0.9.241 but was
// never once cross-examined AGAINST live document collaboration. This
// milestone is that cross-examination — test/document-only, no production
// changes, exactly like every "Product Reassessment" before it:
//
//   Section A — Entry-point census, freshly re-verified.
//   Section B — TWO distinct Document-collaboration surfaces this milestone's
//               own brief conflated into one ("the Editor"), plus Document
//               identity vs Publication identity kept genuinely separate.
//   Section C — Local/remote edit semantics: the frozen policy, re-cited.
//   Section D — Concurrent editing: same field, different fields, rapid
//               local edits, remote-arrival-while-local-pending.
//   Section E — THE LOAD-BEARING SECTION. The Publication boundary: fresh
//               identity per publish, immutable snapshot untouched by
//               later edits, identical content -> distinct Publications,
//               and structural isolation from the collaboration wire.
//   Section F — Disconnect / reconnect.
//   Section G — Failure isolation, extended to the Publication boundary.
//   Section H — Session lifecycle: join -> edit -> leave -> rejoin.
//   Section I — UI/application/core ownership.
//   Section J — FLAGSHIP: the full adversarial sequence, modeled on the
//               REAL contract Section B establishes, not the brief's own
//               "Editor A / Editor B" assumption.
//   Section K — Verdict.
//
// Every section runs against real, unmodified production source and real
// object graphs — the same "never a synthetic stand-in" discipline this
// entire reassessment lineage already applies to itself.

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

const SOURCE_ROOT = new URL('../', import.meta.url);

async function rawSource(relativePath) {
    return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
}

function codeOnlyLines(source) {
    return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
}

async function grepCount(pattern, dirs, { excludeSuffix = null } = {}) {
    const { execSync } = await import('node:child_process');
    let hits = '';
    try {
        const exclude = excludeSuffix ? ` | grep -v "${excludeSuffix}"` : '';
        hits = execSync(`grep -rl "${pattern}" ${dirs.join(' ')} --include="*.js"${exclude} || true`,
            { cwd: SOURCE_ROOT.pathname }).toString();
    } catch { /* zero hits */ }
    return hits.trim() ? hits.trim().split('\n').length : 0;
}

// Mirrors tests/CollaborationConsistencyPolicyCausalReadinessAudit.test.js's
// own makeDevice()/connectAndAuthenticate()/makeFullStack() exactly.
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

function buildBaseDocument({ worldId, authorIdentityId, title, groupName: groupNameValue = 'Original' }) {
    const world = new World({ id: worldId });
    const building = new Building({ id: 'building-x' });
    building.addBrick(new Brick({ id: 'brick-a', definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    world.addGroup(new Group({ id: 'group-1', name: groupNameValue, brickIds: ['brick-a'] }));
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

function groupName(document) {
    return document.world.getGroup('group-1').name;
}

// A lightweight, direct (no network) harness — mirrors
// tests/CollaborationConsistencyPolicyCausalReadinessAudit.test.js's own
// makeHarness()/receive() exactly.
function makeHarness(worldId, { groupName: groupNameValue = 'Original' } = {}) {
    const document = buildBaseDocument({ worldId, authorIdentityId: 'author-1', title: worldId, groupName: groupNameValue });
    const commandHistory = new CommandHistory({ world: document.world });
    const causalGapDetector = new DocumentOperationCausalGapDetector();
    const deferral = new DocumentOperationDeferralUseCase({ causalGapDetector });
    deferral.attachCommandHistory({ documentId: worldId, commandHistory });
    const target = { documentId: worldId, commandHistory };
    return { document, commandHistory, causalGapDetector, deferral, target };
}

function receive(harness, command, causalPredecessors, authorIdentityId = 'alice') {
    harness.causalGapDetector.record(harness.target.documentId, command.id, causalPredecessors);
    return harness.deferral.receive({ documentId: harness.target.documentId, command, authorIdentityId, causalPredecessors }, harness.target);
}

// A full, real, peer-authenticated propagation + recovery + replay stack —
// mirrors tests/CollaborationConsistencyPolicyCausalReadinessAudit.test.js's
// own makeFullStack() exactly.
function makeFullStack(device) {
    const peerMessageBus = new PeerMessageBus();
    const connectedPeerRegistry = new ConnectedPeerRegistry();
    const deviceAuth = new DeviceAuthorizationPropagationUseCase(new InMemoryStorageProvider(), device.provider, {
        peerMessageBus, connectedPeerRegistry
    });
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const state = { target: null };
    const received = [];
    const rejected = [];
    const propagation = new DocumentCommandPropagationUseCase({
        peerMessageBus, connectedPeerRegistry, deviceAuthorization: deviceAuth,
        identityProvider: device.provider, commandRegistry,
        resolveDocument: (id) => (state.target && state.target.documentId === id ? state.target.document : null)
    });
    propagation.onOperationReceived((documentId, command, authorIdentityId) => received.push({ documentId, command, authorIdentityId }));
    propagation.onOperationRejected((reason, envelope) => rejected.push({ reason, envelope }));
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
        device, peerMessageBus, connectedPeerRegistry, deviceAuth, propagation, recovery, gapObservation, causalGapDetector, deferral, replay, state, received, rejected, recovered,
        dispose: () => {
            unsubscribeGapToPropagation(); unsubscribeDeferralToPropagation(); unsubscribeRecoveryRequest();
            unsubscribeGapToRecovery(); unsubscribeRecoveryToReplay();
            propagation.dispose(); recovery.dispose();
        }
    };
}

function attachReplica(stack, worldId, doc) {
    const history = new CommandHistory({ world: doc.world });
    const target = { documentId: worldId, document: doc, commandHistory: history };
    stack.state.target = target;
    const unattachDeferral = stack.deferral.attachCommandHistory({ documentId: worldId, commandHistory: history });
    const unattachRecovery = stack.recovery.attachCommandHistory({ documentId: worldId, commandHistory: history });
    return { doc, history, target, dispose: () => { unattachDeferral(); unattachRecovery(); } };
}

async function runTests() {
    console.log('Running Collaborative Editing Product Reassessment tests...\n');

    // ---------------------------------------------------------------
    // Section A — Entry-point census, freshly re-verified.
    // ---------------------------------------------------------------
    {
        const editorView = await rawSource('ui/views/EditorView.js');
        const editorSession = await rawSource('application/EditorSession.js');
        const propagation = await rawSource('application/DocumentCommandPropagationUseCase.js');
        const publishUseCase = await rawSource('application/PublishDocumentUseCase.js');

        assert(/new\s+EditorSession\s*\(/.test(editorView),
            'A1. OPEN — ui/views/EditorView.js still constructs the real EditorSession composition root.');
        assert(propagation.includes('PeerLifecycleState.AUTHENTICATED'),
            'A2. JOIN — application/DocumentCommandPropagationUseCase.js still gates every incoming operation on the connection having reached AUTHENTICATED.');
        const commandHistorySource = await rawSource('application/CommandHistory.js');
        assert(/command\.execute\(this\._context\)/.test(commandHistorySource),
            'A3. EDIT — application/CommandHistory.js still executes every command directly against the real World it was constructed with — the one local-mutation chokepoint.');
        assert(editorSession.includes('this._documentOperationDeferral.attachToPropagation('),
            'A4. RECEIVE REMOTE — application/EditorSession.js still attaches DocumentOperationDeferralUseCase directly to the propagation feed as the real application chokepoint.');
        const registrySource = await rawSource('application/ConnectedPeerRegistry.js');
        assert(/transportState === PeerConnectionState\.CLOSED \|\| transportState === PeerConnectionState\.FAILED/.test(codeOnlyLines(registrySource)),
            'A5. LEAVE/REJOIN — application/ConnectedPeerRegistry.js still removes a peer automatically the moment its own transport reaches CLOSED/FAILED, with no separate cleanup call required.');
        assert(publishUseCase.includes('PublishDocumentUseCase'), 'A6a. (sanity) the loaded source is genuinely application/PublishDocumentUseCase.js.');
        assert(!/peerMessageBus|connectedPeerRegistry|DocumentCommandPropagation/.test(publishUseCase),
            'A6. SAVE/PUBLISH — application/PublishDocumentUseCase.js still names none of the collaboration wire\'s own vocabulary — publishing remains a separate entry point from live editing, exactly as 0.2.3\'s own header first drew that line.');

        console.log('✓ A: All six real production entry points this milestone\'s own brief named — open (1), join (2), edit (3), receive-remote (4), leave/rejoin (5), save/publish (6) — still hold their one representative wiring signal in the real, unmodified source. Nothing regressed since 0.9.241.');
    }

    // ---------------------------------------------------------------
    // Section B — Two distinct Document-collaboration surfaces, and
    // Document identity vs Publication identity kept genuinely separate.
    // ---------------------------------------------------------------
    {
        // B1. The Editor's own Structure/blueprint surface
        // (DocumentCommandPropagationUseCase, 0.9.222+) deliberately takes
        // NO resolveWorldEditGrant collaborator — EDIT access there
        // degrades to ownership (+ authorized devices) ONLY. The World's
        // OWN Document surface (WorldCommandPropagationUseCase, 0.2.96-
        // 0.2.98) DOES accept one, backed by a real signed-grant registry
        // (WorldMembershipUseCase#hasActiveGrant/#grantEdit). These are
        // two different product surfaces; this milestone's own brief
        // ("Editor A joins, Editor B joins... A makes change X, B makes
        // change Y") describes the SECOND one while naming "the Editor" —
        // the first genuinely absent case, this reassessment's own real
        // finding, verified fresh below rather than assumed either way.
        const documentPropagationSource = await rawSource('application/DocumentCommandPropagationUseCase.js');
        const worldPropagationSource = await rawSource('application/WorldCommandPropagationUseCase.js');
        const worldMembershipSource = await rawSource('application/WorldMembershipUseCase.js');
        // codeOnlyLines() strips comments first — DocumentCommandPropagationUseCase.js's
        // own header/step-4 PROSE names "resolveWorldEditGrant" twice, always
        // to say it is deliberately absent from this file's own CODE; a
        // plain substring search would be fooled by that same prose.
        assert(!codeOnlyLines(documentPropagationSource).includes('resolveWorldEditGrant'),
            'B1a. application/DocumentCommandPropagationUseCase.js (the Editor\'s Structure-Document surface) still accepts no resolveWorldEditGrant collaborator in its own CODE — EDIT there is ownership(+device)-only.');
        assert(codeOnlyLines(worldPropagationSource).includes('resolveWorldEditGrant'),
            'B1b. application/WorldCommandPropagationUseCase.js (the World\'s own shared-Document surface) still accepts resolveWorldEditGrant in its own CODE — genuine multi-owner EDIT access is a real, SEPARATE, already-shipped capability.');
        assert(worldMembershipSource.includes('grantEdit(') && worldMembershipSource.includes('hasActiveGrant('),
            'B1c. application/WorldMembershipUseCase.js still exposes grantEdit()/hasActiveGrant() as the real backing mechanism for that separate surface\'s multi-owner grants.');

        // B2. Direct, fresh re-confirmation (not a full flagship replay —
        // DocumentCollaborationBoundary Section C already owns that) that
        // a genuinely different identity, holding a fully converged
        // replica but no ownership and no device grant, is refused EDIT
        // on the Editor's own surface.
        const network = new LocalPeerNetwork();
        const alice = makeDevice('Alice-B2');
        const bob = makeDevice('Bob-B2');
        const aliceStack = makeFullStack(alice);
        const bobStack = makeFullStack(bob);
        const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-b2', alice, 'bob-b2', bob);
        aliceStack.connectedPeerRegistry.add(peerA);
        bobStack.connectedPeerRegistry.add(peerB);
        const worldId = 'doc-545-b2';
        const aliceReplica = attachReplica(aliceStack, worldId, buildBaseDocument({ worldId, authorIdentityId: alice.identity.identityId, title: 'B2' }));
        const bobsCopy = buildBaseDocument({ worldId, authorIdentityId: alice.identity.identityId, title: 'B2' });
        bobStack.state.target = { documentId: worldId, document: bobsCopy };

        const bobsForgedEdit = moveCommand(worldId, { x: 50, y: 0, z: 0 });
        bobStack.propagation.broadcastCommand({ documentId: worldId, command: bobsForgedEdit });
        await wait(30);
        assert(brickX(aliceReplica.doc) === 0, 'B2a. Alice: Bob merely holding a converged replica of her Document grants him zero EDIT authority over it — reconfirmed fresh, on this milestone\'s own object graph.');
        assert(aliceStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.NOT_AUTHORIZED),
            'B2b. Alice: Bob\'s attempt was explicitly rejected NOT_AUTHORIZED — this codebase\'s own "multi-editor" vocabulary, on THIS surface, still means multi-DEVICE-of-one-owner, never multi-user.');

        aliceReplica.dispose();
        aliceStack.dispose();
        bobStack.dispose();

        // B3. documentId (World.id) and publicationId (Publication.id) are
        // two independently-generated identity spaces — never conflated
        // anywhere in the real collaboration chain.
        const collaborationChainFiles = [
            'application/EditorSession.js',
            'application/DocumentCommandPropagationUseCase.js',
            'application/DocumentOperationDeferralUseCase.js',
            'application/DocumentOperationCausalGapObservationUseCase.js',
            'application/DocumentOperationRecoveryUseCase.js',
            'application/RecoveredOperationReplayUseCase.js',
            'core/DocumentOperationCausality.js',
            'core/DocumentCollaborationConsistencyPolicy.js'
        ];
        for (const path of collaborationChainFiles) {
            const source = await rawSource(path);
            assert(!source.includes('Publication'), `B3. ${path} still names "Publication" nowhere at all — publicationId cannot leak into this surface's own notion of Document identity.`);
        }

        // B4. Production census: the only real, non-self-referential
        // production call site that ever constructs `new Publication(` is
        // publisher/LocalPublisherProvider.js's own publish() method.
        const publicationConstructorCount = await grepCount('new Publication(', ['application', 'ui', 'collaboration', 'core']);
        assert(publicationConstructorCount === 0,
            `B4. Zero files in application/, ui/, collaboration/, or core/ ever construct "new Publication(" (found ${publicationConstructorCount}) — the sole production identity-assignment site remains publisher/LocalPublisherProvider.js's own publish() method.`);

        console.log('✓ B: Two real Document-collaboration surfaces exist — the Editor\'s own Structure-Document chain (ownership+device only, B1a/B2) and the World\'s shared-Document chain (real multi-owner grants, B1b/B1c), a distinction this milestone\'s own brief did not draw. documentId and publicationId stay two independently-generated identity spaces: zero cross-references anywhere in the real collaboration chain (B3), and exactly one production site ever mints a Publication identity (B4).');
    }

    // ---------------------------------------------------------------
    // Section C — Local/remote edit semantics: the frozen policy,
    // re-cited fresh. 0.9.238/0.9.241 already proved every field below
    // against the real chain; this section exists only to timestamp that
    // nothing regressed, never to re-derive it.
    // ---------------------------------------------------------------
    {
        const P = DOCUMENT_COLLABORATION_CONSISTENCY_POLICY;
        assert(P.application.remote === RemoteApplicationTiming.CAUSAL_READINESS, 'C1. application.remote is still CAUSAL_READINESS.');
        assert(P.delivery.order === DeliveryOrderGuarantee.NOT_GUARANTEED, 'C2. delivery.order is still NOT_GUARANTEED.');
        assert(P.conflict.nonCommutingOperations === ConcurrentConflictResolution.UNDEFINED, 'C3. conflict.nonCommutingOperations is still UNDEFINED.');
        assert(P.convergence.guaranteed === ReplicaConvergenceGuarantee.NOT_GUARANTEED, 'C4. convergence.guaranteed is still NOT_GUARANTEED.');
        assert(P.isolation.acrossDocuments === DocumentIsolationGuarantee.GUARANTEED, 'C5. isolation.acrossDocuments is still GUARANTEED.');
        assert(P.duplicateOperations.suppression === DuplicateOperationSuppression.GUARANTEED, 'C6. duplicateOperations.suppression is still GUARANTEED.');
        assert(P.undo.scope === LocalUndoScope.LOCAL_ONLY && P.undo.propagation === LocalUndoPropagation.NEVER, 'C7. undo remains LOCAL_ONLY / NEVER propagated.');
        console.log('✓ C: The frozen DOCUMENT_COLLABORATION_CONSISTENCY_POLICY object is unchanged since 0.9.238/0.9.241 — causal readiness, unguaranteed delivery order, undefined conflict resolution, unguaranteed convergence, guaranteed document isolation, guaranteed duplicate suppression, and local-only undo all still hold. Re-cited, not re-derived.');
    }

    // ---------------------------------------------------------------
    // Section D — Concurrent editing: same field, different fields,
    // rapid local edits, and a remote update arriving while a local
    // change is pending.
    // ---------------------------------------------------------------
    {
        // D1. Same field, concurrent, non-commuting: two renames of the
        // SAME group, delivered in opposite order to two replicas ->
        // permanently different results (0.9.226/0.9.238's own finding,
        // reconfirmed once, briefly, as this section's own baseline).
        const bobH = makeHarness('doc-545-d1-bob');
        const charlieH = makeHarness('doc-545-d1-charlie');
        receive(bobH, renameCommand('doc-545-d1-bob', 'By-Laptop'), []);
        receive(bobH, renameCommand('doc-545-d1-bob', 'By-Phone'), []);
        receive(charlieH, renameCommand('doc-545-d1-charlie', 'By-Phone'), []);
        receive(charlieH, renameCommand('doc-545-d1-charlie', 'By-Laptop'), []);
        assert(groupName(bobH.document) !== groupName(charlieH.document),
            'D1. Same field, concurrent, non-commuting: two replicas receiving the identical two renames in opposite order hold permanently different names — SAME FIELD concurrency stays a genuine, undefined conflict.');

        // D2. Different fields, concurrent and commuting: a rename and an
        // unrelated brick move, delivered in OPPOSITE order to two
        // replicas -> both converge to the IDENTICAL final state. Fresh
        // finding: this exact "disjoint fields always converge" contrast
        // against D1 was never made explicit before.
        const daveH = makeHarness('doc-545-d2-dave');
        const erinH = makeHarness('doc-545-d2-erin');
        receive(daveH, renameCommand('doc-545-d2-dave', 'Renamed'), []);
        receive(daveH, moveCommand('doc-545-d2-dave', { x: 4, y: 0, z: 0 }), []);
        receive(erinH, moveCommand('doc-545-d2-erin', { x: 4, y: 0, z: 0 }), []);
        receive(erinH, renameCommand('doc-545-d2-erin', 'Renamed'), []);
        assert(groupName(daveH.document) === groupName(erinH.document) && brickX(daveH.document) === brickX(erinH.document),
            'D2. Different fields, concurrent: a rename and a brick move (disjoint state) delivered in opposite order converge to the byte-identical final state on both replicas — concurrency is only a genuine conflict when it touches the SAME field (contrast with D1).');

        // D3. Rapid successive local edits: five immediate local commands
        // through the one real chokepoint (CommandHistory#execute) — no
        // batching, no coalescing, five real undo steps.
        const rapidHarness = makeHarness('doc-545-d3');
        for (let i = 1; i <= 5; i += 1) {
            rapidHarness.commandHistory.execute(moveCommand('doc-545-d3', { x: i, y: 0, z: 0 }, { id: `rapid-${i}` }));
        }
        assert(brickX(rapidHarness.document) === 15, 'D3a. Five rapid local moves (1+2+3+4+5) all landed — no batching swallowed one.');
        assert(rapidHarness.commandHistory.getExecutedCommands().length === 5, 'D3b. Exactly five distinct executed commands — no coalescing merged any two into one.');
        let undone = 0;
        while (rapidHarness.commandHistory.canUndo()) { rapidHarness.commandHistory.undo(); undone += 1; }
        assert(undone === 5, 'D3c. Exactly five individual undo steps were available — rapid succession never collapses the undo stack.');

        // D4. A remote update arrives while a LOCAL change is pending
        // (the remote op's own causal predecessor is not yet known, so it
        // sits DEFERRED): the local edit, executed directly through
        // CommandHistory (never through receive()), lands immediately and
        // is left completely undisturbed by the later release.
        const d4 = makeHarness('doc-545-d4');
        const outcome = receive(d4, moveCommand('doc-545-d4', { x: 7, y: 0, z: 0 }), ['not-yet-known']);
        assert(outcome === DocumentOperationDeferralOutcome.DEFERRED, 'D4a. The remote op is DEFERRED — its predecessor is unknown.');
        d4.commandHistory.execute(renameCommand('doc-545-d4', 'Local-While-Pending'));
        assert(groupName(d4.document) === 'Local-While-Pending', 'D4b. The LOCAL edit, made through the real local chokepoint, lands immediately — a pending deferred remote op never blocks or delays it.');
        assert(brickX(d4.document) === 0, 'D4c. The deferred remote op still has not touched the brick — pending, not applied.');
        receive(d4, moveCommand('doc-545-d4', { x: 0, y: 0, z: 0 }, { id: 'not-yet-known' }), []);
        assert(brickX(d4.document) === 7, 'D4d. Releasing the predecessor applies the formerly-deferred remote op cleanly.');
        assert(groupName(d4.document) === 'Local-While-Pending', 'D4e. ...and the earlier LOCAL edit, made while it was pending, is completely undisturbed by that later release.');

        console.log('✓ D: Same-field concurrency stays a genuine, undefined conflict (D1); different-field concurrency always converges regardless of arrival order (D2, a fresh contrast); rapid local edits never batch or coalesce (D3); and a remote op deferred behind an unmet predecessor never blocks, delays, or is disturbed by an interleaved local edit (D4).');
    }

    // ---------------------------------------------------------------
    // Section E — THE LOAD-BEARING SECTION. The Publication boundary.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const owner = new LocalIdentityProvider(storage);
        owner.login('owner-545e');
        const publisher = new LocalPublisherProvider(storage);
        const publishUseCase = new PublishDocumentUseCase(publisher, owner);

        const worldId = 'doc-545-e';
        const world = new World({ id: worldId });
        const building = new Building({ id: 'b' });
        building.addBrick(new Brick({ id: 'brick-1', definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
        world.addBuilding(building);
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Section E Document', author: 'owner-545e' }) });
        const documentManager = { document };

        // E1. Identical content, republished with no edit in between,
        // produces two Publications with distinct ids, the SAME
        // documentId, and the SAME contentHash — extends 0.9.544 Section
        // F's notification-layer finding all the way down to the publish
        // call itself.
        const p1 = publishUseCase.execute(documentManager);
        const p1Repeat = publishUseCase.execute(documentManager);
        assert(p1.id !== p1Repeat.id, 'E1a. Two publishes of byte-identical content still get two distinct Publication identities.');
        assert(p1.documentId === p1Repeat.documentId && p1.documentId === worldId, 'E1b. Both share the SAME documentId — the Document being published never changed.');
        assert(p1.contentHash === p1Repeat.contentHash, 'E1c. Both share the SAME contentHash — the content genuinely did not change between publishes.');

        // E2. Editing the Document AFTER a publish never mutates that
        // Publication's already-stored, immutable snapshot.
        const beforeSnapshot = publisher.loadSnapshot(p1.id);
        const commandHistory = new CommandHistory({ world: document.world });
        commandHistory.execute(new MoveBrickCommand({ worldId, buildingId: 'b', brickId: 'brick-1', delta: { x: 9, y: 0, z: 0 } }));
        const afterEditSnapshot = publisher.loadSnapshot(p1.id);
        assert(JSON.stringify(beforeSnapshot) === JSON.stringify(afterEditSnapshot),
            'E2a. p1\'s own stored snapshot is byte-identical before and after a real, subsequent edit to the live Document object — editing D never mutates a historical Publication.');
        const p2 = publishUseCase.execute(documentManager);
        assert(p2.id !== p1.id && p2.documentId === p1.documentId,
            'E2b. Publishing the EDITED Document gets a brand-new Publication identity, the SAME documentId, and never reuses p1\'s own id.');
        assert(p2.contentHash !== p1.contentHash, 'E2c. p2\'s contentHash genuinely differs — the edit really did change the published content.');
        const p2Snapshot = publisher.loadSnapshot(p2.id);
        assert(JSON.stringify(p2Snapshot) !== JSON.stringify(beforeSnapshot),
            'E2d. p2\'s own snapshot reflects the NEW content, distinct from p1\'s — the two Publications are two genuinely different immutable records, not one record silently rewritten in place.');
        assert(JSON.stringify(publisher.loadSnapshot(p1.id)) === JSON.stringify(beforeSnapshot),
            'E2e. After the second publish exists, p1\'s own snapshot is STILL exactly what it was at p1\'s own publish time — a later publish of the same lineage never reaches back and touches an earlier one.');

        // E3. Publishing is structurally isolated from the collaboration
        // wire: none of the real publish-path files ever reference any
        // collaboration-wire vocabulary.
        const publisherProviderSource = await rawSource('publisher/LocalPublisherProvider.js');
        const publicationSource = await rawSource('publisher/Publication.js');
        const publishUseCaseSource = await rawSource('application/PublishDocumentUseCase.js');
        const wireVocabulary = /peerMessageBus|connectedPeerRegistry|DocumentCommandPropagation|CollaborationSession|CollaborationEnvelope/;
        assert(!wireVocabulary.test(publisherProviderSource), 'E3a. publisher/LocalPublisherProvider.js references none of the collaboration wire\'s own vocabulary.');
        assert(!wireVocabulary.test(publicationSource), 'E3b. publisher/Publication.js references none of the collaboration wire\'s own vocabulary.');
        assert(!wireVocabulary.test(publishUseCaseSource), 'E3c. application/PublishDocumentUseCase.js references none of the collaboration wire\'s own vocabulary — publishing never broadcasts anything to a collaborator, and nothing a collaborator does over the wire can reach the publish path.');

        console.log('✓ E: publicationId is always freshly minted, per publish, at the one real production call site (E1) — including when content is byte-identical to a previous publish (E1). A Publication\'s own stored snapshot is immutable: a real, subsequent edit to the live Document never reaches it (E2a/E2e), and each new publish gets its own new identity and its own new snapshot rather than rewriting an old one (E2b-d). Publishing is structurally isolated from the entire collaboration wire in both directions (E3).');
    }

    // ---------------------------------------------------------------
    // Section F — Disconnect / reconnect.
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const aliceDevice = makeDevice('Alice-F545');
        const bobDevice = makeDevice('Bob-F545');
        const alice = makeFullStack(aliceDevice);
        const bob = makeFullStack(bobDevice);
        const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-f545-1', aliceDevice, 'bob-f545-1', bobDevice);
        alice.connectedPeerRegistry.add(peerA);
        bob.connectedPeerRegistry.add(peerB);

        const worldId = 'doc-545-f';
        const bobReplica = attachReplica(bob, worldId, buildBaseDocument({ worldId, authorIdentityId: aliceDevice.identity.identityId, title: 'Section F' }));

        const op1 = moveCommand(worldId, { x: 1, y: 0, z: 0 });
        alice.propagation.broadcastCommand({ documentId: worldId, command: op1, causalPredecessors: [] });
        await wait(60);
        assert(brickX(bobReplica.doc) === 1, 'F1. JOIN + EDIT: op1 applied on Bob\'s replica while he is connected.');
        assert(bob.connectedPeerRegistry.list().length === 1 && alice.connectedPeerRegistry.list().length === 1,
            'F1b. Both registries show exactly one connected peer while joined.');

        peerB.connection.close();
        await wait(20);
        assert(bob.connectedPeerRegistry.list().length === 0, 'F2. LEAVE: Bob\'s own registry auto-removed the peer the instant its transport closed — zero explicit cleanup call.');
        assert(alice.connectedPeerRegistry.list().length === 0, 'F2b. Alice\'s own registry auto-removed the same peer too — close() ends both sides of the pair.');

        const op2 = moveCommand(worldId, { x: 2, y: 0, z: 0 });
        const opId2 = alice.propagation.broadcastCommand({ documentId: worldId, command: op2, causalPredecessors: [op1.id] });
        await wait(60);
        assert(brickX(bobReplica.doc) === 1, 'F3. Bob never received op2 while offline — his own document is completely untouched.');
        assert(!!opId2, 'F3b. Broadcasting with zero connected peers still returns an operationId and never throws.');
        const propagationSource = await rawSource('application/DocumentCommandPropagationUseCase.js');
        assert(!/\bqueue\b|\boutbox\b|storeAndForward|\bbacklog\b/i.test(codeOnlyLines(propagationSource)),
            'F3c. application/DocumentCommandPropagationUseCase.js\'s own CODE still names no queue/outbox/store-and-forward vocabulary — an operation that reaches zero peers is simply gone, never buffered for a later reconnect.');

        // F4/F5. Bob REJOINS on a fresh connection.
        const { peerA: peerA2, peerB: peerB2 } = await connectAndAuthenticate(network, 'alice-f545-2', aliceDevice, 'bob-f545-2', bobDevice);
        alice.connectedPeerRegistry.add(peerA2);
        bob.connectedPeerRegistry.add(peerB2);
        await wait(20);
        assert(bob.connectedPeerRegistry.list().length === 1 && alice.connectedPeerRegistry.list().length === 1,
            'F4. REJOIN: both registries show exactly one connected peer again — no leftover entry from the closed connection, no duplicate.');
        assert(bobReplica.doc.world.id === worldId, 'F4b. Bob\'s own Document identity (world.id) is completely unchanged by disconnecting and reconnecting — no second Document was created.');

        const op3 = moveCommand(worldId, { x: 3, y: 0, z: 0 });
        alice.propagation.broadcastCommand({ documentId: worldId, command: op3, causalPredecessors: [op2.id] });
        await wait(60);
        assert(brickX(bobReplica.doc) === 1, 'F5. Reconnecting delivers nothing retroactively: op3 still can\'t apply (its own predecessor op2 was never received), and op2 itself was never resent merely because Bob rejoined — no resync/backfill exists on peer (re)connection.');
        assert(bob.deferral.getDeferredOperationIds(worldId).includes(op3.id), 'F5b. op3 sits genuinely deferred, waiting on a predecessor that reconnecting alone can never supply.');

        bobReplica.dispose();
        alice.dispose();
        bob.dispose();
        console.log('✓ F: A peer\'s transport closing removes it from BOTH registries automatically, with zero explicit cleanup (F2); an operation broadcast to zero peers is simply gone, never queued (F3); rejoining re-registers cleanly with no duplicate entry and no second Document identity (F4); and — an honest, pre-existing limitation, not silently assumed away — reconnecting delivers nothing retroactively (F5), exactly consistent with convergence.guaranteed staying NOT_GUARANTEED.');
    }

    // ---------------------------------------------------------------
    // Section G — Failure isolation, extended to the Publication
    // boundary.
    // ---------------------------------------------------------------
    {
        // G1. Re-confirm DocumentIsolationGuarantee.GUARANTEED with one
        // direct, fresh forged-operation case.
        assert(DOCUMENT_COLLABORATION_CONSISTENCY_POLICY.isolation.acrossDocuments === DocumentIsolationGuarantee.GUARANTEED,
            'G1. isolation.acrossDocuments is still GUARANTEED.');

        const network = new LocalPeerNetwork();
        const alice = makeDevice('Alice-G545');
        const charlie = makeDevice('Charlie-G545');
        const aliceStack = makeFullStack(alice);
        const charlieStack = makeFullStack(charlie);
        const { peerA, peerB } = await connectAndAuthenticate(network, 'alice-g545', alice, 'charlie-g545', charlie);
        aliceStack.connectedPeerRegistry.add(peerA);
        charlieStack.connectedPeerRegistry.add(peerB);

        const worldId = 'doc-545-g';
        const aliceReplica = attachReplica(aliceStack, worldId, buildBaseDocument({ worldId, authorIdentityId: alice.identity.identityId, title: 'Section G' }));

        // G2. Publish the pristine Document, THEN let Charlie forge an
        // operation claiming to be Alice — the forged operation must
        // corrupt neither Alice's own live Document NOR the already-
        // published, immutable snapshot.
        const storage = new InMemoryStorageProvider();
        const owner = new LocalIdentityProvider(storage);
        owner.login('alice-g545-owner');
        const publisher = new LocalPublisherProvider(storage);
        const publishUseCase = new PublishDocumentUseCase(publisher, owner);
        const publication = publishUseCase.execute({ document: aliceReplica.doc });
        const snapshotBeforeForgery = publisher.loadSnapshot(publication.id);

        const { toDocumentOperationEnvelope } = await import('../core/DocumentOperationEnvelope.js');
        const forgedCommand = moveCommand(worldId, { x: 999, y: 0, z: 0 });
        const forgedEnvelope = toDocumentOperationEnvelope({
            operationId: forgedCommand.id, documentId: worldId,
            authorIdentityId: alice.identity.identityId, // Charlie CLAIMS to be Alice
            command: forgedCommand.toJSON()
        });
        charlieStack.peerMessageBus.send(peerB, DocumentCommandPropagationUseCase.DEFAULT_PROTOCOL, forgedEnvelope);
        await wait(30);

        assert(brickX(aliceReplica.doc) === 0, 'G2a. Alice: her own live Document is byte-identical after Charlie\'s forged, identity-spoofed operation — a rejected operation corrupts nothing local.');
        assert(aliceStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.IDENTITY_MISMATCH),
            'G2b. Alice: the forgery was explicitly rejected IDENTITY_MISMATCH.');
        const snapshotAfterForgery = publisher.loadSnapshot(publication.id);
        assert(JSON.stringify(snapshotBeforeForgery) === JSON.stringify(snapshotAfterForgery),
            'G2c. The already-published, immutable snapshot is byte-identical before and after the forged operation arrived — a rejected remote operation cannot corrupt a Publication any more than it can corrupt the live Document (a fresh combination: no prior milestone tested a forged operation arriving AFTER a publish).');

        // G3. A second identity-spoofing attempt, this time naming a
        // DIFFERENT, unrelated document, must not corrupt that document
        // OR leak back into the first. (resolveDocument's own state.target
        // in this harness only ever names one "current" document, exactly
        // like production's single-open-document EditorSession — but
        // _verify()'s own step 2, the identity check, runs BEFORE step 4's
        // document resolution, so this rejection fires on identity alone,
        // regardless of which document is "current" at the time.)
        const worldIdOther = 'doc-545-g-other';
        const otherReplica = attachReplica(aliceStack, worldIdOther, buildBaseDocument({ worldId: worldIdOther, authorIdentityId: alice.identity.identityId, title: 'Unrelated' }));
        const forgedCommand2 = moveCommand(worldIdOther, { x: 777, y: 0, z: 0 });
        const forgedEnvelope2 = toDocumentOperationEnvelope({
            operationId: forgedCommand2.id, documentId: worldIdOther,
            authorIdentityId: alice.identity.identityId, // Charlie CLAIMS to be Alice, again
            command: forgedCommand2.toJSON()
        });
        charlieStack.peerMessageBus.send(peerB, DocumentCommandPropagationUseCase.DEFAULT_PROTOCOL, forgedEnvelope2);
        await wait(30);
        assert(aliceStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.IDENTITY_MISMATCH && r.envelope.documentId === worldIdOther),
            'G3a. The second forgery, naming the unrelated document, is independently rejected IDENTITY_MISMATCH.');
        assert(brickX(otherReplica.doc) === 0 && groupName(otherReplica.doc) === 'Original',
            'G3b. The unrelated document\'s own state is completely untouched by the attempt against it.');
        assert(brickX(aliceReplica.doc) === 0, 'G3c. ...and the FIRST document (worldId) stays untouched too — a rejection on one document never leaks into another.');

        aliceReplica.dispose();
        otherReplica.dispose();
        aliceStack.dispose();
        charlieStack.dispose();
        console.log('✓ G: DocumentIsolationGuarantee.GUARANTEED reconfirmed fresh (G1). A forged, identity-spoofed operation corrupts neither the live Document it targets (G2a) nor an already-published, immutable Publication of that same Document (G2c) — the fresh combination this section exists to add. A second forgery naming an unrelated document is independently rejected and corrupts neither that document nor the first one (G3).');
    }

    // ---------------------------------------------------------------
    // Section H — Session lifecycle: join -> edit -> leave -> rejoin,
    // on the REAL single-owner-plus-authorized-device model Section B
    // established for this surface.
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeDevice('Alice-H545');
        const phone = makeDevice('Alice-Phone-H545');
        const bob = makeDevice('Bob-H545');
        const aliceStack = makeFullStack(alice);
        const phoneStack = makeFullStack(phone);
        const bobStack = makeFullStack(bob);

        const worldId = 'doc-545-h';
        const bobReplica = attachReplica(bobStack, worldId, buildBaseDocument({ worldId, authorIdentityId: alice.identity.identityId, title: 'Section H' }));

        const grant = alice.provider.authorizeDevice(alice.identity.identityId, phone.identity.identityId, phone.identity.publicKey, { deviceLabel: 'Phone' });
        aliceStack.deviceAuth.broadcastAuthorization(grant);

        // H1. JOIN: the Phone connects and authenticates against Bob.
        const { peerA: phoneToBob, peerB: bobFromPhone } = await connectAndAuthenticate(network, 'phone-h545-1', phone, 'bob-h545-1', bob);
        phoneStack.connectedPeerRegistry.add(phoneToBob);
        bobStack.connectedPeerRegistry.add(bobFromPhone);
        // Bob must independently learn of the grant to resolve the
        // Phone's connection as Alice's own authority — connect Alice to
        // Bob too, exactly as production requires a real relationship
        // between the owner and whoever is meant to trust the device.
        const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice-h545-1', alice, 'bob-h545-2', bob);
        aliceStack.connectedPeerRegistry.add(aliceToBob);
        bobStack.connectedPeerRegistry.add(bobFromAlice);
        aliceStack.deviceAuth.broadcastAuthorization(grant);
        await wait(30);

        // H1b. EDIT: the Phone's operation reaches Bob as a distinctly
        // identified, ALICE-authored operation.
        const phoneMove = moveCommand(worldId, { x: 1, y: 0, z: 0 });
        phoneStack.propagation.broadcastCommand({ documentId: worldId, command: phoneMove });
        await wait(30);
        assert(brickX(bobReplica.doc) === 1, 'H1. JOIN + EDIT: the Phone, an authorized device, produced an operation Bob actually applied.');
        assert(bobStack.received.some((r) => r.authorIdentityId === alice.identity.identityId),
            'H1b. The applied operation still names ALICE as its author, not the Phone\'s own raw device key.');

        // H2. LEAVE: the Phone's connection to Bob closes. This is a
        // TRANSPORT-level fact (ConnectedPeerRegistry membership); it is
        // NOT the same fact as Alice's own device-authorization grant,
        // which lives in a completely separate lifecycle.
        bobFromPhone.connection.close();
        await wait(20);
        assert(bobStack.connectedPeerRegistry.list().some((p) => p.connectionId === phoneToBob.connectionId) === false,
            'H2a. LEAVE: Bob\'s registry no longer lists the Phone\'s (now-closed) connection.');

        // H3. REJOIN: the Phone reconnects on a FRESH connection and is
        // STILL recognized as Alice's authorized device — the earlier
        // disconnect never touched the grant itself, because nothing in
        // H2 revoked it (a connection dropping and a device being
        // revoked are two independently-controlled facts).
        const { peerA: phoneToBob2, peerB: bobFromPhone2 } = await connectAndAuthenticate(network, 'phone-h545-2', phone, 'bob-h545-3', bob);
        phoneStack.connectedPeerRegistry.add(phoneToBob2);
        bobStack.connectedPeerRegistry.add(bobFromPhone2);
        await wait(20);
        const phoneMoveAfterRejoin = moveCommand(worldId, { x: 1, y: 0, z: 0 });
        phoneStack.propagation.broadcastCommand({ documentId: worldId, command: phoneMoveAfterRejoin });
        await wait(30);
        assert(brickX(bobReplica.doc) === 2, 'H3a. REJOIN: the Phone\'s authority survived the earlier disconnect with zero re-authorization step — Bob applied its new operation immediately.');
        assert(bobReplica.doc.world.id === worldId, 'H3b. Rejoining created no second Document identity — still the same world.id throughout join, edit, leave, and rejoin.');
        assert(bobStack.connectedPeerRegistry.list().filter((p) => p.remoteIdentity && p.remoteIdentity.identityId === phone.identity.identityId).length === 1,
            'H3c. Bob\'s registry holds exactly ONE entry for the Phone after rejoining — no duplicate collaboration state left over from the connection that already closed.');

        bobReplica.dispose();
        aliceStack.dispose();
        phoneStack.dispose();
        bobStack.dispose();
        console.log('✓ H: join -> edit -> leave -> rejoin, exercised on the real single-owner-plus-device model — a device\'s authority survives its own connection closing (H2/H3a) because connection membership and authorization are two separate lifecycles, and rejoining creates neither a second Document identity nor duplicate registry state (H3b/H3c).');
    }

    // ---------------------------------------------------------------
    // Section I — UI/application/core ownership.
    // ---------------------------------------------------------------
    {
        const { execSync } = await import('node:child_process');
        const decisionVocabulary = 'WorldAccessLevel\\.|evaluateApplicationEligibility|evaluateApplicationReadiness|resolveSigningIdentityId';
        let hits = '';
        try {
            hits = execSync(`grep -rl "${decisionVocabulary}" ui --include="*.js" || true`, { cwd: SOURCE_ROOT.pathname }).toString().trim();
        } catch { /* zero hits */ }
        assert(hits === '', `I1. ui/ still contains zero references to EDIT-authorization/causal-eligibility/readiness decision vocabulary (WorldAccessLevel/evaluateApplicationEligibility/evaluateApplicationReadiness/resolveSigningIdentityId) — found in: ${hits || 'nothing'}. The UI observes and forwards collaboration state; it never re-decides it.`);

        const peerConnectionsView = await rawSource('ui/views/PeerConnectionsView.js');
        assert(peerConnectionsView.includes('PeerLifecycleState') && !peerConnectionsView.includes('WorldAccessLevel'),
            'I2. ui/views/PeerConnectionsView.js reads PeerLifecycleState (for connection/authentication BADGES and display copy) but imports no WorldAccessLevel at all — lifecycle display is not the same code path as an edit-authorization decision, and this file never blends the two.');

        console.log('✓ I: The UI layer observes and forwards collaboration state (peer lifecycle for display, e.g. ui/views/PeerConnectionsView.js) but contains zero occurrences of this codebase\'s own authorization/eligibility/readiness decision vocabulary — those decisions stay exactly where Section A/B already found them, in application/core.');
    }

    // ---------------------------------------------------------------
    // Section J — FLAGSHIP. Modeled on the REAL contract Section B
    // established: one owner (Alice), two of her own authorized devices
    // (Laptop, Phone) — NOT two unrelated people, because Section B
    // proved that second shape belongs to a different product surface
    // entirely. Every step below is the milestone brief's own proposed
    // sequence, corrected against real evidence rather than assumption.
    // ---------------------------------------------------------------
    {
        const network = new LocalPeerNetwork();
        const alice = makeDevice('Alice-J545-Laptop');
        const phone = makeDevice('Alice-J545-Phone');
        const laptopStack = makeFullStack(alice);
        const phoneStack = makeFullStack(phone);

        const { peerA: laptopToPhone, peerB: phoneToLaptop } = await connectAndAuthenticate(network, 'laptop-j545-1', alice, 'phone-j545-1', phone);
        laptopStack.connectedPeerRegistry.add(laptopToPhone);
        phoneStack.connectedPeerRegistry.add(phoneToLaptop);

        const grant = alice.provider.authorizeDevice(alice.identity.identityId, phone.identity.identityId, phone.identity.publicKey, { deviceLabel: 'Phone' });
        laptopStack.deviceAuth.broadcastAuthorization(grant); // self-applies AND reaches the connected Phone

        const worldId = 'doc-545-j-flagship';
        const laptopReplica = attachReplica(laptopStack, worldId, buildBaseDocument({ worldId, authorIdentityId: alice.identity.identityId, title: 'Flagship Document D' }));
        const phoneReplica = attachReplica(phoneStack, worldId, buildBaseDocument({ worldId, authorIdentityId: alice.identity.identityId, title: 'Flagship Document D' }));

        // --- "Editor A joins, Editor B joins" -> Laptop and Phone, both
        // already connected and authorized above.
        // --- "A makes change X, B makes change Y" — different fields,
        // no causal edge declared between them: genuinely concurrent.
        const changeX = moveCommand(worldId, { x: 5, y: 0, z: 0 }); // Laptop
        const changeY = renameCommand(worldId, 'Renamed-By-Phone'); // Phone

        // Each device executes its own change LOCALLY first, through the
        // real chokepoint (CommandHistory#execute) — broadcastCommand()
        // only ever propagates an already-locally-executed command, it
        // never applies anything itself (DocumentCollaborationBoundary
        // Section C's own precondition, reused here).
        laptopReplica.history.execute(changeX);
        phoneReplica.history.execute(changeY);

        // --- "updates cross in flight" — both broadcast before either
        // observes the other's.
        laptopStack.propagation.broadcastCommand({ documentId: worldId, command: changeX });
        phoneStack.propagation.broadcastCommand({ documentId: worldId, command: changeY });
        await wait(60);

        assert(brickX(laptopReplica.doc) === 5 && groupName(laptopReplica.doc) === 'Renamed-By-Phone',
            'J1. Laptop: converged on BOTH changes — its own X, and Phone\'s Y, received while in flight.');
        assert(brickX(phoneReplica.doc) === 5 && groupName(phoneReplica.doc) === 'Renamed-By-Phone',
            'J2. Phone: converged on BOTH changes too — disjoint-field concurrent edits converge identically on both replicas (D2\'s own finding, reconfirmed inside the flagship).');

        // --- "B temporarily disconnects" ---
        phoneToLaptop.connection.close();
        await wait(20);
        assert(laptopStack.connectedPeerRegistry.list().length === 0 && phoneStack.connectedPeerRegistry.list().length === 0,
            'J3. Phone disconnects: both registries auto-removed the peer.');

        // --- "A publishes" — Publication P1 captures exactly X+Y. ---
        const storage = new InMemoryStorageProvider();
        const ownerIdentity = new LocalIdentityProvider(storage);
        ownerIdentity.login('alice-j545-owner');
        const publisher = new LocalPublisherProvider(storage);
        const publishUseCase = new PublishDocumentUseCase(publisher, ownerIdentity);
        const p1 = publishUseCase.execute({ document: laptopReplica.doc });
        const p1Snapshot = publisher.loadSnapshot(p1.id);
        assert(p1Snapshot.world.buildings[0].bricks[0].position.x === 5, 'J4a. P1\'s own snapshot captures X.');
        assert(p1Snapshot.world.groups[0].name === 'Renamed-By-Phone', 'J4b. P1\'s own snapshot captures Y.');

        // Meanwhile, Laptop keeps working: change Z, made and broadcast
        // while Phone is still offline.
        const changeZ = moveCommand(worldId, { x: 2, y: 0, z: 0 });
        laptopReplica.history.execute(changeZ);
        laptopStack.propagation.broadcastCommand({ documentId: worldId, command: changeZ, causalPredecessors: [changeX.id] });
        await wait(30);
        assert(brickX(laptopReplica.doc) === 7, 'J5. Laptop applied its own further local change Z (5 + 2) — publishing never blocks or is blocked by further local editing.');

        // --- "B reconnects" ---
        const { peerA: laptopToPhone2, peerB: phoneToLaptop2 } = await connectAndAuthenticate(network, 'laptop-j545-2', alice, 'phone-j545-2', phone);
        laptopStack.connectedPeerRegistry.add(laptopToPhone2);
        phoneStack.connectedPeerRegistry.add(phoneToLaptop2);
        await wait(30);

        // --- "both inspect current Document" ---
        assert(brickX(laptopReplica.doc) === 7 && groupName(laptopReplica.doc) === 'Renamed-By-Phone',
            'J6. Laptop\'s current Document: X, Y, and Z.');
        assert(brickX(phoneReplica.doc) === 5 && groupName(phoneReplica.doc) === 'Renamed-By-Phone',
            'J7. Phone\'s current Document: X and Y only — Z was broadcast while it was offline, and reconnecting delivered nothing retroactively (F5\'s own finding, reconfirmed here at the full flagship scale). An honest divergence, exactly consistent with convergence.guaranteed staying NOT_GUARANTEED — never silently hidden or assumed away.');

        // --- "existing Publications remain immutable" ---
        const p1SnapshotAfterEverything = publisher.loadSnapshot(p1.id);
        assert(JSON.stringify(p1Snapshot) === JSON.stringify(p1SnapshotAfterEverything),
            'J8. P1\'s own snapshot is still exactly X+Y — untouched by change Z, by Phone\'s disconnect/reconnect, or by anything Phone\'s own replica does or does not know.');

        // --- "new Publication identity remains distinct" — including
        // the identical-content case, proven twice over.
        const p2 = publishUseCase.execute({ document: laptopReplica.doc }); // captures X+Y+Z
        assert(p2.id !== p1.id && p2.documentId === p1.documentId && p2.contentHash !== p1.contentHash,
            'J9. P2 (X+Y+Z) is a distinct Publication identity from P1 (X+Y), same documentId, genuinely different content.');
        const p3 = publishUseCase.execute({ document: laptopReplica.doc }); // still X+Y+Z, no edit in between
        assert(p3.id !== p2.id && p3.contentHash === p2.contentHash,
            'J10. P3, published with zero further edits, still gets its OWN distinct identity from P2 despite byte-identical content — identical content never collapses Publication identity, reconfirmed at the true end-to-end publish boundary.');

        // --- Final isolation check, after everything. ---
        assert(JSON.stringify(publisher.loadSnapshot(p1.id)) === JSON.stringify(p1Snapshot), 'J11a. P1 is still exactly X+Y.');
        assert(JSON.stringify(publisher.loadSnapshot(p2.id)).length === JSON.stringify(publisher.loadSnapshot(p3.id)).length
            && publisher.loadSnapshot(p2.id).world.buildings[0].bricks[0].position.x === 7,
            'J11b. P2 and P3 both hold X+Y+Z.');
        assert(phoneReplica.doc.world.id === worldId && laptopReplica.doc.world.id === worldId,
            'J11c. One Document identity throughout the entire sequence — three distinct Publications, zero duplicate or mutated Documents.');

        laptopReplica.dispose();
        phoneReplica.dispose();
        laptopStack.dispose();
        phoneStack.dispose();
        console.log('✓ J FLAGSHIP: join, concurrent disjoint-field edits crossing in flight, disconnect, publish, further local editing, reconnect, and a final inspection — all against real production classes. Both replicas converge on X+Y before the disconnect (J1/J2); the disconnected replica honestly stays behind, with no retroactive delivery, after reconnecting (J7); the Publication taken mid-sequence stays byte-identical through everything that happens after it (J8); and two more Publications — one with new content, one with content identical to the first — each still mint their own distinct identity (J9/J10). One Document, three Publications, zero cross-contamination.');
    }

    // ---------------------------------------------------------------
    // Section K — Verdict.
    // ---------------------------------------------------------------
    {
        console.log(
'\n0.9.545 — Collaborative Editing Product Reassessment — Verdict\n' +
'\n' +
'EDITOR STRUCTURE-DOCUMENT COLLABORATION (0.9.222-0.9.241)\n' +
'    COMPLETE — unchanged, re-verified fresh (Sections A, C)\n' +
'    Model: single owner + authorized devices, NOT multi-user (Section B)\n' +
'\n' +
'WORLD SHARED-DOCUMENT COLLABORATION (0.2.96-0.2.98)\n' +
'    The real multi-owner concurrent-editing capability this milestone\'s\n' +
'    own brief was actually describing — a DIFFERENT surface, named but\n' +
'    deliberately not re-audited here (out of scope; has its own tests)\n' +
'\n' +
'CONCURRENT EDITING\n' +
'    Same field: genuine, undefined conflict (Section D1)\n' +
'    Different fields: always converges (Section D2, J1/J2)\n' +
'    Rapid local edits: never batched or coalesced (Section D3)\n' +
'    Remote-while-local-pending: neither interferes with the other (D4)\n' +
'\n' +
'PUBLICATION BOUNDARY (Section E — the load-bearing finding)\n' +
'    Publication identity: always fresh, even for identical content\n' +
'    Publication snapshot: immutable, structurally unreachable from D\n' +
'    Publish path: structurally isolated from the collaboration wire\n' +
'\n' +
'DISCONNECT / RECONNECT / FAILURE ISOLATION\n' +
'    Peer removal on transport close: automatic, both sides (Section F)\n' +
'    Reconnect: clean, no duplicate Document or registry state (F/H)\n' +
'    No retroactive delivery on reconnect — honest, pre-existing limit\n' +
'    Forged/rejected operations corrupt neither the live Document nor an\n' +
'    already-published Publication of it (Section G, a fresh combination)\n' +
'\n' +
'PRODUCT GAPS\n' +
'    None newly discovered. This milestone\'s own brief conflated two real\n' +
'    but DIFFERENT surfaces under "the Editor" — a naming/documentation\n' +
'    clarity opportunity, never a code defect.\n' +
'\n' +
'RECOMMENDATION\n' +
'    STOP this arc, per this milestone\'s own instruction to close an arc\n' +
'    that comes back clean. No CRDT/OT, no new conflict-resolution policy,\n' +
'    no offline-sync, no new Document/Publication identity mechanism was\n' +
'    introduced or found missing.\n');

        console.log('✓ Section K: Verdict recorded. Both real Document-collaboration surfaces confirmed and correctly distinguished; concurrent editing behaves exactly as the frozen policy already promised; the Publication boundary — this milestone\'s own genuinely new territory — holds under direct construction and under the full flagship; disconnect/reconnect/failure isolation all hold, with one honest, pre-existing limitation restated rather than hidden. No implementation happens in this milestone, and none is recommended next.');
    }

    console.log('\n✅ All CollaborativeEditingProductReassessment tests passed.');
}

runTests().then(() => {
    console.log('\n✓ All CollaborativeEditingProductReassessment tests passed');
}).catch((error) => {
    console.error('\n✗ CollaborativeEditingProductReassessment tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
