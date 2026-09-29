import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { LocalIdentityProvider } from '../identity/LocalIdentityProvider.js';
import { LocalPeerNetwork, LocalPeerConnectionProvider } from '../peer/LocalPeerConnectionProvider.js';
import { PeerAuthenticationSession } from '../peer/PeerAuthenticationSession.js';
import { PeerMessageBus } from '../peer/PeerMessageBus.js';
import { ConnectedPeer } from '../application/peer/ConnectedPeer.js';
import { ConnectedPeerRegistry } from '../application/peer/ConnectedPeerRegistry.js';
import { DeviceAuthorizationPropagationUseCase } from '../application/identity/DeviceAuthorizationPropagationUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/editor/CreateCommandRegistryUseCase.js';
import { CreateBrickRegistryUseCase } from '../application/editor/CreateBrickRegistryUseCase.js';
import { CreateEditorContextUseCase } from '../application/editor/CreateEditorContextUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { SelectionUseCase } from '../application/editor/SelectionUseCase.js';
import { PreviewUseCase } from '../application/editor/PreviewUseCase.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import {
    DocumentCommandPropagationUseCase,
    DocumentOperationRejectionReason
} from '../application/document/DocumentCommandPropagationUseCase.js';
import { EditorSession } from '../application/editor/EditorSession.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';
import { EditorSoundService } from '../application/editor/EditorSoundService.js';
import { SoundSettingsStore } from '../application/settings/SoundSettingsStore.js';
import { EDITOR_ACTIVITY, EDITOR_SOUND_CUE, editorSoundCueFor } from '../core/EditorSoundCues.js';
import { CompositeCommand } from '../application/commands/CompositeCommand.js';
import { CommandRegistry } from '../application/commands/CommandRegistry.js';
import { assert } from './support/Assert.js';

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
    // application/editor/EditorSession.js's own 0.9.224 constructor/_rebuild()
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
// added (see application/editor/EditorSession.js's own comment there), PLUS
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
    session._subscribeCommandActivity();
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


// The Editor's edit sounds: which edit makes which sound, that the Editor
// session reports the user's own edits (never a collaborator's arriving from
// a peer), and EditorSoundService playing them with the shared preference.
// The session fixture is tests/EditorRuntimeCollaboration.test.js's.

class RecordingProvider {
    constructor() { this.cues = []; this.volume = null; this.muted = null; this.resumed = 0; this.disposed = false; }
    resume() { this.resumed++; }
    setVolume(volume) { this.volume = volume; }
    setMuted(muted) { this.muted = muted; }
    setSpatial(spatial) { this.spatial = spatial; }
    setListener(pose) { this.listener = pose; }
    playEditorCue(cue) { this.cues.push(cue); }
    dispose() { this.disposed = true; }
}

async function runTests() {
    // Which edit sounds like what.
    {
        const executed = (type, children = []) => editorSoundCueFor(EDITOR_ACTIVITY.EXECUTED, { type, children });
        assert(executed('place-brick') === EDITOR_SOUND_CUE.PLACE, 'placing a brick');
        assert(executed('place-structure') === EDITOR_SOUND_CUE.PLACE, 'placing a structure');
        assert(executed('delete-brick') === EDITOR_SOUND_CUE.REMOVE, 'deleting');
        assert(executed('transform-selection') === EDITOR_SOUND_CUE.MOVE, 'moving a selection');
        assert(executed('rotate-brick') === EDITOR_SOUND_CUE.ROTATE, 'rotating');
        assert(executed('paste-bricks') === EDITOR_SOUND_CUE.PASTE, 'pasting');
        assert(executed('set-brick-color') === EDITOR_SOUND_CUE.COLOR, 'recoloring');
        assert(executed('create-group') === EDITOR_SOUND_CUE.GROUP, 'grouping');
        assert(executed('create-world-landmark') === EDITOR_SOUND_CUE.MARK, 'naming a place');
        assert(executed('composite', [{ type: 'rename-group', children: [] }, { type: 'delete-brick', children: [] }]) === EDITOR_SOUND_CUE.GROUP,
            'a composite sounds like its first child that has a sound');
        assert(executed('composite', [{ type: 'composite', children: [{ type: 'place-brick', children: [] }] }]) === EDITOR_SOUND_CUE.PLACE,
            'nested composites are looked into');
        assert(executed('something-new') === null, 'an unknown edit is silent');
        assert(editorSoundCueFor(EDITOR_ACTIVITY.UNDONE, { type: 'place-brick', children: [] }) === EDITOR_SOUND_CUE.UNDO, 'undo has its own sound');
        assert(editorSoundCueFor(EDITOR_ACTIVITY.REDONE, { type: 'delete-brick', children: [] }) === EDITOR_SOUND_CUE.REDO, 'redo has its own sound');
        assert(editorSoundCueFor('other', { type: 'place-brick' }) === null, 'unknown activity is silent');

        // Every edit the app registers has a sound (a new command type needs one).
        const registered = [];
        const register = CommandRegistry.prototype.register;
        CommandRegistry.prototype.register = function (type, CommandClass) {
            registered.push(type);
            return register.call(this, type, CommandClass);
        };
        try {
            new CreateCommandRegistryUseCase().execute();
        } finally {
            CommandRegistry.prototype.register = register;
        }
        assert(registered.length > 10, `setup: the registry registered its commands (${registered.length})`);
        const silent = registered.filter((type) => type !== 'composite' && executed(type) === null);
        assert(silent.length === 0, `every registered edit has a sound (silent: ${silent.join(', ')})`);
        console.log('✓ each kind of edit has its own sound');
    }

    const network = new LocalPeerNetwork();
    const alice = makeDevice('Alice');
    const bob = makeDevice('Bob');
    const aliceStack = makeEditorRuntimeStack(alice);
    const bobStack = makeEditorRuntimeStack(bob);
    const docId = 'doc-sound', buildingId = 'building-sound', brickId = 'brick-sound';
    const aliceDoc = buildOneBrickDocument({ worldId: docId, buildingId, brickId, authorIdentityId: alice.identity.identityId, title: 'Sound' });
    const bobDoc = buildOneBrickDocument({ worldId: docId, buildingId, brickId, authorIdentityId: alice.identity.identityId, title: 'Sound' });
    openDocumentInSession(aliceStack.editorSession, aliceDoc);
    openDocumentInSession(bobStack.editorSession, bobDoc);
    const { peerA, peerB } = await connectAndAuthenticate(network, 'alice', alice, 'bob-for-alice', bob);
    aliceStack.connectedPeerRegistry.add(peerA);
    bobStack.connectedPeerRegistry.add(peerB);

    // The session reports your own edits, undo and redo; not a collaborator's.
    {
        const aliceHeard = [];
        const bobHeard = [];
        aliceStack.editorSession.onCommandActivity((activity, command) => aliceHeard.push([activity, command.type]));
        const unsubscribeBob = bobStack.editorSession.onCommandActivity((activity, command) => bobHeard.push([activity, command.type]));

        aliceStack.editorSession.commandHistory.execute(new MoveBrickCommand({ worldId: docId, buildingId, brickId, delta: { x: 2, y: 0, z: 0 } }));
        await wait(20);
        assert(brickPosition(bobStack.documentManager.document, buildingId, brickId).x === 2, 'setup: Alice\'s edit reached Bob');
        assert(aliceHeard.length === 1 && aliceHeard[0][0] === EDITOR_ACTIVITY.EXECUTED && aliceHeard[0][1] === 'move-brick', 'Alice hears her own move');
        assert(bobHeard.length === 0, 'Bob does not hear Alice\'s edit arriving');

        aliceStack.editorSession.undo();
        aliceStack.editorSession.redo();
        assert(aliceHeard[1][0] === EDITOR_ACTIVITY.UNDONE && aliceHeard[2][0] === EDITOR_ACTIVITY.REDONE, 'undo and redo are reported');

        bobStack.editorSession.commandHistory.execute(new MoveBrickCommand({ worldId: docId, buildingId, brickId, delta: { x: 0, y: 0, z: 1 } }));
        assert(bobHeard.length === 1, 'Bob hears his own edit after a remote one was applied');

        const composite = new CompositeCommand();
        composite.add(new MoveBrickCommand({ worldId: docId, buildingId, brickId, delta: { x: 1, y: 0, z: 0 } }));
        aliceStack.editorSession.commandHistory.execute(composite);
        const last = [];
        const unsubscribe = aliceStack.editorSession.onCommandActivity((activity, command) => last.push(command));
        aliceStack.editorSession.undo();
        assert(last.length === 1 && last[0].type === 'composite' && last[0].children[0].type === 'move-brick', 'a composite reports its children');
        unsubscribe();
        unsubscribeBob();
        bobStack.editorSession.commandHistory.execute(new MoveBrickCommand({ worldId: docId, buildingId, brickId, delta: { x: 0, y: 0, z: 1 } }));
        assert(bobHeard.length === 1, 'an unsubscribed listener hears nothing more');
        console.log('✓ the Editor reports the user\'s own edits, not collaborators\'');
    }

    // EditorSoundService plays them, with the shared preference.
    {
        const storage = new InMemoryStorageProvider();
        storage.save('sound-settings', { muted: false, volume: 0.7 });
        const provider = new RecordingProvider();
        const service = new EditorSoundService({
            provider, settingsStore: new SoundSettingsStore({ storageProvider: storage }), editorSession: aliceStack.editorSession
        });
        service.start();
        service.start();
        assert(provider.volume === 0.7 && provider.muted === false, 'the saved preference reaches the provider');
        assert(provider.resumed === 0, 'nothing resumes before a gesture');
        aliceStack.editorSession.commandHistory.execute(new MoveBrickCommand({ worldId: docId, buildingId, brickId, delta: { x: 1, y: 0, z: 0 } }));
        aliceStack.editorSession.undo();
        assert(JSON.stringify(provider.cues) === JSON.stringify(['move', 'undo']), `a move then an undo (${provider.cues})`);
        service.saved();
        assert(provider.cues[provider.cues.length - 1] === 'save', 'saving has its sound');
        service.unlock();
        assert(provider.resumed === 1, 'unlock() resumes audio');
        service.toggleMuted();
        assert(provider.muted === true && new SoundSettingsStore({ storageProvider: storage }).get().muted === true, 'muting is shared and remembered');
        service.setVolume(0.2);
        assert(provider.volume === 0.2 && service.settings().volume === 0.2, 'volume');
        service.dispose();
        service.dispose();
        assert(provider.disposed, 'dispose() releases audio');
        const count = provider.cues.length;
        aliceStack.editorSession.redo();
        service.saved();
        assert(provider.cues.length === count, 'a disposed service plays nothing');
        let threw = false;
        try {
            new EditorSoundService({ provider, settingsStore: new SoundSettingsStore({ storageProvider: storage }), editorSession: {} });
        } catch {
            threw = true;
        }
        assert(threw, 'an Editor session is required');
        console.log('✓ EditorSoundService plays edits with the shared preference');
    }
}

await runTests();
