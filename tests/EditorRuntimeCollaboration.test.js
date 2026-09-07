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
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/CreateEditorContextUseCase.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { SelectionUseCase } from '../application/SelectionUseCase.js';
import { PreviewUseCase } from '../application/PreviewUseCase.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import {
    DocumentCommandPropagationUseCase,
    DocumentOperationRejectionReason
} from '../application/DocumentCommandPropagationUseCase.js';
import { EditorSession } from '../application/EditorSession.js';

// 0.9.224 — Wire Remote Document Operation Application into the Editor
// Runtime.
//
// 0.9.222 built the trust boundary (DocumentCommandPropagationUseCase);
// 0.9.223 built the explicit application seam
// (RemoteDocumentOperationApplicationUseCase#apply()/attachToPropagation())
// but left it wired ONLY by hand, in that file's own flagship test — never
// by a running Editor. This file proves the seam is now real runtime
// composition: application/EditorSession.js's own constructor and
// _rebuild() connect BOTH halves (attachToPropagation() for incoming,
// attachCommandHistory() for outgoing) automatically, the moment an
// EditorSession is built with a documentCommandPropagation collaborator —
// see ui/views/EditorView.js's own 0.9.224 wiring for the composition
// root. Neither DocumentCommandPropagationUseCase nor
// RemoteDocumentOperationApplicationUseCase is reopened here; this file
// never even imports the latter, and never calls attachToPropagation() or
// apply() directly — proving those calls now happen ENTIRELY inside
// EditorSession's own code is the whole point.
//
//   Section A: FLAGSHIP — Alice performs a normal local edit through her
//              own EditorSession's CommandHistory; Bob's OWN EditorSession,
//              wired to the identical DocumentCommandPropagationUseCase
//              boundary, ends up with the edit applied to his own
//              document/CommandHistory — without this test ever touching
//              RemoteDocumentOperationApplicationUseCase.
//   Section B: document-switch behavior is preserved exactly as 0.9.223
//              left it — Bob viewing a different document when an
//              operation arrives means NOT_APPLIED, and it is never
//              queued or replayed when Bob comes back. Updated by the
//              0.9.239 audit: the NEXT operation, since it causally
//              depends on the one refused while Bob was away, is now
//              (0.9.237) correctly DEFERRED rather than applied on top of
//              a predecessor Bob never received — this section's own
//              openDocumentInSession() helper had quietly fallen out of
//              sync with EditorSession#_rebuild()'s own 0.9.237 deferral
//              attachment, which the audit found and fixed.
//   Section C: execution-path convergence — the remote operation Bob's
//              runtime applied produces the IDENTICAL state transition
//              (same before -> after brick position) the same command
//              produces when executed locally, because both paths end at
//              the same CommandHistory#execute() chokepoint. Updated by
//              the 0.9.239 audit to reopen Document X fresh on both
//              replicas first, so this section's own comparison is never
//              confused by Section B's now-permanently-deferred operation.
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

// A minimal duck-typed render-session facade — the SAME "real logic, fake
// low-level renderer" convention tests/AvatarMovement.test.js and
// tests/WorldEditorContinuity.test.js already establish for
// EditorSession/WorldNavigationSession: this file never calls
// editorSession.start()/loadDocument()/openDocument() (each would build a
// REAL three.js Renderer against a REAL DOM container), so nothing here
// ever needs a browser. What each of those methods' own _rebuild() DOES
// contribute to this milestone — creating a fresh CommandHistory and
// wiring it to documentCommandPropagation#attachCommandHistory() — is
// reproduced directly below in openDocumentInSession(), calling the exact
// same real method on the exact same real collaborator EditorSession's
// own constructor already stored, never a re-implementation of it.
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

// One replica's own full runtime stack — a real EditorSession, composed
// exactly the way ui/views/EditorView.js's own 0.9.224 wiring composes
// one, riding a real peer/authorization stack exactly like
// tests/RemoteDocumentOperationApplication.test.js's own makeStack().
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

    // THIS milestone's own seam: an EditorSession built WITH
    // documentCommandPropagation wires both halves itself — see
    // application/EditorSession.js's own 0.9.224 constructor/_rebuild()
    // comments. Nothing below this call ever touches
    // RemoteDocumentOperationApplicationUseCase.
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

// Reproduces the two lines of EditorSession#_rebuild() 0.9.224 actually
// added (see application/EditorSession.js's own comment there), PLUS
// 0.9.237's own per-document deferral attachment (added by the 0.9.239
// audit, which found this helper had quietly fallen out of sync with
// real _rebuild()/_teardown() — see Section B below) — never the
// renderer/toolManager/input-dispatcher construction around them, which
// needs a real browser and proves nothing about either milestone. Calls
// the SAME real DocumentManager#newDocument(),
// DocumentCommandPropagationUseCase#attachCommandHistory(), and
// DocumentOperationDeferralUseCase#attachCommandHistory() a genuine
// openDocument()/loadDocument() call would.
function openDocumentInSession(session, document) {
    session._documentManager.newDocument(document);
    session._commandHistory = new CommandHistory({ world: document.world });
    session._unattachCommandHistoryPropagation = session._documentCommandPropagation
        ? session._documentCommandPropagation.attachCommandHistory({
            documentId: document.world.id,
            commandHistory: session._commandHistory
        })
        : null;
    if (session._unattachDeferralCommandHistory) {
        session._unattachDeferralCommandHistory();
    }
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

const network = new LocalPeerNetwork();
const alice = makeDevice('Alice');
const bob = makeDevice('Bob');

const aliceStack = makeEditorRuntimeStack(alice);
const bobStack = makeEditorRuntimeStack(bob);

const docXId = 'doc-x', buildingXId = 'building-x', brickXId = 'brick-x';
const docYId = 'doc-y', buildingYId = 'building-y', brickYId = 'brick-y';

const aliceDocX = buildOneBrickDocument({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, authorIdentityId: alice.identity.identityId, title: "Alice's Structure" });
const bobDocX = buildOneBrickDocument({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, authorIdentityId: alice.identity.identityId, title: "Alice's Structure" });
const bobDocY = buildOneBrickDocument({ worldId: docYId, buildingId: buildingYId, brickId: brickYId, authorIdentityId: bob.identity.identityId, title: "Bob's Structure" });

// Alice and Bob each open Document X, through the REAL EditorSession
// runtime path (minus the renderer — see openDocumentInSession()'s own
// header). From this point on, Alice's own aliceStack.editorSession.
// commandHistory is the ONLY thing this test will ever execute a command
// through directly.
openDocumentInSession(aliceStack.editorSession, aliceDocX);
openDocumentInSession(bobStack.editorSession, bobDocX);

const { peerA: aliceToBob, peerB: bobFromAlice } = await connectAndAuthenticate(network, 'alice', alice, 'bob-for-alice', bob);
aliceStack.connectedPeerRegistry.add(aliceToBob);
bobStack.connectedPeerRegistry.add(bobFromAlice);

// ---------------------------------------------------------------------
// Section A — FLAGSHIP
// ---------------------------------------------------------------------
{
    const before = brickPosition(bobStack.documentManager.document, buildingXId, brickXId);
    assert(before.x === 0, '1. Bob: starting position is the untouched baseline');

    // Alice performs a normal Editor action — the SAME public API a
    // toolbar button or a gizmo drag would call, never a manual
    // broadcast/apply.
    const move1 = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 3, y: 0, z: 0 } });
    aliceStack.editorSession.commandHistory.execute(move1);
    await wait(20);

    assert(brickPosition(bobStack.documentManager.document, buildingXId, brickXId).x === 3,
        '2. Bob: his OWN Document X reflects Alice\'s edit — applied by EditorSession\'s own runtime composition, never by this test calling apply()');
    assert(bobStack.editorSession.commandHistory.getExecutedCommands().length === 1,
        '3. Bob: the applied operation landed on his own EditorSession\'s CommandHistory');
    assert(bobStack.editorSession.commandHistory.getExecutedCommands()[0].id === move1.id,
        '4. Bob: operation identity survived the FULL composed runtime path unchanged');
    assert(bobStack.editorSession.canUndo() === true,
        '5. Bob: the applied remote operation is undoable through EditorSession\'s own public undo() — the SAME local mechanism a local edit would use');

    console.log('✓ Section A FLAGSHIP: Alice\'s normal local edit reaches Bob\'s own EditorSession runtime and mutates his Document, with neither replica\'s test code ever touching RemoteDocumentOperationApplicationUseCase');
}

// ---------------------------------------------------------------------
// Section B — document-switch behavior preserved
// ---------------------------------------------------------------------
//
// A note on WHERE the refusal happens: 0.9.223's own flagship kept every
// Document a replica had ever seen in a Map, so its trust boundary could
// authorize an operation for a document that wasn't the CURRENT one, and
// RemoteDocumentOperationApplicationUseCase's own NOT_APPLIED outcome was
// what actually refused it. The Editor deliberately has no second
// document holder (this milestone's own brief: "use the existing Editor
// document/session lifecycle rather than introduce another document
// holder") — documentCommandPropagation's own resolveDocument (wired in
// ui/views/EditorView.js) can only ever answer for the ONE document
// currently open. So here the SAME refusal happens one step earlier, at
// DocumentCommandPropagationUseCase's own trust boundary
// (UNKNOWN_DOCUMENT) — never reaching RemoteDocumentOperationApplicationUseCase
// at all for this case. The user-observable guarantee is identical
// either way: Document X stays untouched while Bob looks at Y, and
// nothing refused is ever queued or replayed — this section proves
// that guarantee, honestly, for the seam as actually composed.
{
    // Bob switches away to Document Y — a real document-switch, through
    // the same minimal _rebuild()-equivalent every openDocumentInSession()
    // call already uses.
    openDocumentInSession(bobStack.editorSession, bobDocY);

    const move2 = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 1, y: 0, z: 0 } });
    aliceStack.editorSession.commandHistory.execute(move2);
    await wait(20);

    assert(brickPosition(bobDocX, buildingXId, brickXId).x === 3,
        '6. Bob: Document X (no longer open) is UNCHANGED while Bob is looking at Document Y');
    assert(bobStack.editorSession.commandHistory.getExecutedCommands().length === 0,
        '7. Bob: Document Y\'s own CommandHistory (the one currently live on his EditorSession) is untouched by an operation for a different document');
    assert(bobStack.rejected.some((r) => r.reason === DocumentOperationRejectionReason.UNKNOWN_DOCUMENT),
        '8. Bob: refused at the trust boundary as UNKNOWN_DOCUMENT — the Editor\'s single-current-document resolveDocument has no record of X while Y is open, so this never even reaches RemoteDocumentOperationApplicationUseCase');

    // Bob switches BACK to Document X: the refused move2 is never queued
    // or replayed on Bobs own behalf.
    //
    // 0.9.239 update: move3, Alice's own very next local edit, causally
    // depends on move2 — DocumentCommandPropagationUseCase's own outgoing
    // wiring always names a local operation's own immediately preceding
    // local command as its causal predecessor (see that method's own
    // header). Before 0.9.237 this applied unconditionally (ARRIVAL_ORDER
    // never consulted causal predecessors at all); as of 0.9.237, Bob
    // correctly recognizes move2 is genuinely missing — never received,
    // never resent — and DEFERS move3 rather than silently stacking it on
    // top of a predecessor he never actually got. This is the SAME
    // boundary tests/DocumentOperationDeferralUseCase.test.js proves
    // directly, now proven wired all the way through the real, composed
    // EditorSession runtime this file exists to exercise.
    openDocumentInSession(bobStack.editorSession, bobDocX);
    const move3 = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 2, y: 0, z: 0 } });
    aliceStack.editorSession.commandHistory.execute(move3);
    await wait(20);

    assert(brickPosition(bobDocX, buildingXId, brickXId).x === 3,
        '9. Bob: back on Document X, still exactly 3 — move3 names the forgotten move2 as its own causal predecessor, so the 0.9.237 deferral boundary retains it rather than applying it out of causal order');
    assert(bobStack.editorSession.getDeferredOperationIds(docXId).includes(move3.id),
        '10. Bob: move3 sits DEFERRED on his fresh CommandHistory for Document X, waiting on a predecessor that will never arrive — never silently applied, and never lost either');
    assert(bobStack.editorSession.commandHistory.getExecutedCommands().length === 0,
        '11. Bob: this fresh CommandHistory (from the second openDocumentInSession() call on Document X) has NOT grown — move2 was genuinely forgotten, never queued or replayed, and move3 is deferred rather than silently applied on top of it');

    console.log('✓ Section B: document-switch isolation survives the full composed runtime — a refused operation is forgotten, never queued or replayed, and an operation that causally depends on it is correctly deferred (0.9.237) rather than silently applied out of order');
}

// ---------------------------------------------------------------------
// Section C — execution-path convergence (not replica convergence)
// ---------------------------------------------------------------------
{
    // A fresh, third-party Document X, edited ONLY locally, as the
    // control: proves the LOCAL command path produces state A -> state B.
    const localWorld = new World({ id: 'doc-x-local-control' });
    const localBuilding = new Building({ id: buildingXId });
    localBuilding.addBrick(new Brick({ id: brickXId, definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    localWorld.addBuilding(localBuilding);
    const localHistory = new CommandHistory({ world: localWorld });

    const localBefore = brickPosition({ world: localWorld }, buildingXId, brickXId);
    const localCommand = new MoveBrickCommand({ worldId: 'doc-x-local-control', buildingId: buildingXId, brickId: brickXId, delta: { x: 4, y: 0, z: 0 } });
    localHistory.execute(localCommand);
    const localAfter = brickPosition({ world: localWorld }, buildingXId, brickXId);

    // The REMOTE path. 0.9.239 update: Document X's own causal chain, on
    // BOTH replicas, still carries move3 sitting DEFERRED on Bobs side
    // behind the permanently-missing move2 (Section B) — genuinely
    // unresolved, exactly as 0.9.237 intends, not a bug this section
    // should route around by pretending it never happened. So this
    // section reopens Document X FRESH on both replicas first (a real
    // document reload, through the SAME openDocumentInSession() every
    // other section already uses) — a clean causal chain on both sides,
    // exactly like a genuine new editing session, so the comparison below
    // is never confused by an unrelated, already-proven finding from
    // Section B.
    openDocumentInSession(aliceStack.editorSession, buildOneBrickDocument({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, authorIdentityId: alice.identity.identityId, title: "Alice's Structure" }));
    const bobDocXFresh = buildOneBrickDocument({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, authorIdentityId: alice.identity.identityId, title: "Alice's Structure" });
    openDocumentInSession(bobStack.editorSession, bobDocXFresh);

    // Alice executes the SAME SHAPE of command (a +4 move) locally; Bob's
    // composed runtime applies it without this test calling apply().
    const remoteBefore = brickPosition(bobStack.documentManager.document, buildingXId, brickXId);
    const move4 = new MoveBrickCommand({ worldId: docXId, buildingId: buildingXId, brickId: brickXId, delta: { x: 4, y: 0, z: 0 } });
    aliceStack.editorSession.commandHistory.execute(move4);
    await wait(20);
    const remoteAfter = brickPosition(bobStack.documentManager.document, buildingXId, brickXId);

    assert(remoteAfter.x - remoteBefore.x === localAfter.x - localBefore.x,
        '12. execution-path convergence: the remote-applied operation produced the IDENTICAL state transition (delta x=4) the same command produces when executed through the local CommandHistory chokepoint');
    assert(bobStack.editorSession.commandHistory.getExecutedCommands().length === 1,
        '13. Bob: the remotely-applied command sits on this fresh CommandHistory for Document X — move4 is a genesis operation on the reopened chain, so this is the only entry');

    console.log('✓ Section C: local and remote commands converge on the SAME execution path (CommandHistory#execute()) — a claim about execution-path convergence only, never about replica convergence under concurrent/ordered edits');
}

aliceStack.documentCommandPropagation.dispose();
bobStack.documentCommandPropagation.dispose();
aliceStack.editorSession.dispose();
bobStack.editorSession.dispose();

}

runTests().then(() => {
    console.log('\n✓ All EditorRuntimeCollaboration tests passed');
}).catch((error) => {
    console.error('\n✗ EditorRuntimeCollaboration tests failed:', error.message);
    console.error(error.stack);
    process.exitCode = 1;
});
