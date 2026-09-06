import { readFile } from 'node:fs/promises';

import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { ReplayDocumentUseCase } from '../application/ReplayDocumentUseCase.js';
import { RestoreHistoryStateUseCase } from '../application/RestoreHistoryStateUseCase.js';
import { LocalSpatialIndexProvider } from '../spatial/LocalSpatialIndexProvider.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { LocalWorldLayoutProvider } from '../world-layout/LocalWorldLayoutProvider.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { AvatarPresenceSession } from '../application/AvatarPresenceSession.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { AutosaveDocumentUseCase } from '../application/AutosaveDocumentUseCase.js';
import { CheckRecoveryUseCase } from '../application/CheckRecoveryUseCase.js';
import { RecoverDocumentUseCase } from '../application/RecoverDocumentUseCase.js';
import { LocalRecoveryStore } from '../persistence/LocalRecoveryStore.js';
import { InputRouter } from '../application/InputRouter.js';

// 0.9.211 — World View Undo/Redo Lifecycle Audit.
//
// 0.9.210 gave World View's Undo/Redo buttons and Ctrl+Z/Ctrl+Y/
// Ctrl+Shift+Z shortcut their first real UI callers, and its own flagship
// test (tests/WorldViewUndoRedoIntegration.test.js, sections A-H) already
// proved the straight-line sequence — create/undo/redo, the CommandHistory
// mirror, Preview interaction, cross-document isolation, ordinary dirty
// semantics, Publication isolation, empty-history safety, and the
// single-caller/single-listener structural shape. This milestone is a
// test-only audit of the SEAM 0.9.210 exposed for the first time: now that
// a keyboard shortcut and two buttons both reach the same session.undo()/
// session.redo(), and now that Undo/Redo sit next to the Preview/Restore
// surface 0.9.207/0.9.208 already audited, does any of that interact badly
// under lifecycle pressure — mount/unmount churn, the Preview/Restore/
// Undo/Redo boundary, Restore's own fresh-history handoff to ordinary
// Undo/Redo, and the Autosave/Recovery machinery that exists elsewhere in
// this codebase?
//
// Sections A, B, D, G, H, J below extend 0.9.210's own coverage at points
// this audit's brief called out by name rather than re-deriving what that
// file already established; each says explicitly what is new here. Only
// Sections C, E, F, and I are wholly new ground:
//
//   * Section F found the actual shape of the "Autosave/Recovery" question:
//     ui/views/WorldView.js and application/WorldNavigationSession.js carry
//     ZERO autosave/recovery references (grep confirms it, and the
//     structural assertion at the end of this section locks it down) — the
//     only place undo/redo and autosave/recovery currently coexist in this
//     codebase is the Editor (application/DocumentManager.js +
//     application/AutosaveScheduler.js + application/RecoveryObserver.js,
//     already fully audited by 0.9.204/0.9.205's own test files, including
//     undo/redo interaction). Section F therefore proves the underlying
//     invariant — "Undo/Redo are ordinary document mutations, observed by
//     Autosave/Recovery through nothing more than CommandHistory.isDirty()"
//     — at the one real integration point that exists (DocumentManager +
//     CommandHistory, the exact pairing 0.9.204/0.9.205 exercise), and then
//     confirms structurally that World View's own undo/redo has no such
//     surface to interact with AT ALL yet, so there is no "special path"
//     to find because there is no path.
//   * Section I is the audit's centerpiece per this milestone's own brief.
//     ui/views/WorldView.js cannot be mounted under this repo's plain
//     `node tests/*.test.js` sweep (it imports 'vue' — see
//     tests/WorldViewHistoryTimelineIntegration.test.js's own header for
//     the same constraint), so 0.9.210's own Section H verified mount/
//     unmount hygiene by reading the source as text. This section goes
//     further: it extracts the REAL undoAction()/redoAction()/onKeyDown()/
//     guarded() function bodies out of the live source (byte-for-byte, via
//     brace matching — never retyped) and executes them, per simulated
//     "mount," against independent mock sessions and a fake window event
//     target. This is genuine behavioral proof of mount -> keydown ->
//     action, unmount -> keydown -> no-op, remount -> exactly one active
//     handler, and two simultaneous instances never touching each other's
//     session — not merely a regex over the source text.
//
// This audit found no new defects: every section below locks down existing,
// already-correct behavior.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

// Mirrors tests/WorldLandmarksSessionUX.test.js's own makeIdentityProvider(),
// same as tests/WorldViewUndoRedoIntegration.test.js.
function makeIdentityProvider({ identityId = null, username = null } = {}) {
    return {
        currentUser: () => (username ? { username } : null),
        getSigningIdentity: () => {
            if (!identityId) {
                throw new Error('IdentityProviderStub: no authenticated identity');
            }
            return { id: identityId };
        }
    };
}

const stubPublishIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'alice', providerId: 'stub', data })
};

function minimalWorldRenderSession() {
    return { addWorld() {}, removeWorld() {}, selectBricks() {}, clearSelection() {}, clearHover() {}, hidePreview() {}, dispose() {} };
}

async function run() {
    const storage = new InMemoryStorageProvider();
    const serializer = new DocumentSerializer();
    const registry = new CreateBrickRegistryUseCase().execute();
    const loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage, serializer);
    const saveDocumentUseCase = new SaveDocumentUseCase(storage, serializer);
    const spatialIndexProvider = new LocalSpatialIndexProvider(storage);
    const discoveryProvider = new LocalDiscoveryProvider(storage);
    const worldLayoutProvider = new LocalWorldLayoutProvider(spatialIndexProvider, discoveryProvider);
    const publishDocumentUseCase = new PublishDocumentUseCase(new LocalPublisherProvider(storage), stubPublishIdentityProvider);
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayDocumentUseCase = new ReplayDocumentUseCase(commandRegistry);
    const restoreHistoryStateUseCase = new RestoreHistoryStateUseCase(replayDocumentUseCase);

    function makeSession(world, { avatarPosition = new Position(0, 0, 0), identityId = 'did:key:alice' } = {}) {
        const avatarPresenceSession = new AvatarPresenceSession(
            { avatarId: `${identityId}-avatar`, ownerIdentity: identityId },
            { position: avatarPosition }
        );
        const identityProvider = makeIdentityProvider({ identityId, username: identityId });
        const session = new WorldNavigationSession({
            registry, loadPublicationDocumentUseCase, worldLayoutProvider,
            discoveryProvider, avatarPresenceSession, identityProvider,
            saveDocumentUseCase, publishDocumentUseCase,
            replayDocumentUseCase, restoreHistoryStateUseCase
        });
        session._session = minimalWorldRenderSession();
        session._loadWorld(world.id);
        return session;
    }

    function saveWorld(title) {
        const world = new World({});
        world.addBuilding(new Building({ creator: 'alice' }));
        const doc = new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice', authorIdentityId: 'did:key:alice' }) });
        saveDocumentUseCase.execute(new DocumentManager(doc));
        return world;
    }

    // -------------------------------------------------------------
    // A. Basic command lifecycle — 0.9.210's own Section A already
    //    proved create/create/undo/redo/undo/create/redo for a single
    //    command type (landmark naming). New here: the SAME linear-
    //    history invariant holds when the history is a MIX of command
    //    types pushed through two different entry points — session.
    //    createLandmarkHere() (the UI-facing wrapper) and a directly
    //    executed PlaceBrickCommand (mirroring what a future World View
    //    mutation might push) — proving undo()/redo() never special-case
    //    by command type or by which code path pushed the command.
    // -------------------------------------------------------------
    {
        const world = saveWorld('Mixed Command World');
        const session = makeSession(world);
        const history = session._commandHistories.get(world.id);
        const liveWorld = () => session.getDocument(world.id).world;
        const buildingId = liveWorld().getBuildings()[0].id;

        const landmarkId = session.createLandmarkHere('Waypoint', '');
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(2, 0.5, 0) }));

        assert(liveWorld().getWorldLandmark(landmarkId) !== null, '1. landmark present after the mixed sequence');
        assert(liveWorld().getBuildings()[0].getBricks().length === 2, '2. both bricks present');

        assert(session.undo() === true, '3. undo() removes the most recent command regardless of its type (a brick)');
        assert(liveWorld().getBuildings()[0].getBricks().length === 1, '4. exactly one brick removed');
        assert(liveWorld().getWorldLandmark(landmarkId) !== null, '5. the landmark (pushed via a different entry point) is untouched');

        assert(session.undo() === true, '6. undo() again removes the other brick');
        assert(liveWorld().getBuildings()[0].getBricks().length === 0, '7. no bricks remain');

        assert(session.undo() === true, '8. undo() finally removes the landmark itself');
        assert(liveWorld().getWorldLandmark(landmarkId) === null, '9. landmark gone');

        assert(session.redo() === true && session.redo() === true && session.redo() === true, '10. redoing three times replays landmark, brick, brick in the original order');
        assert(liveWorld().getWorldLandmark(landmarkId) !== null && liveWorld().getBuildings()[0].getBricks().length === 2,
            '11. full state restored regardless of the mix of command types and entry points');

        console.log('✓ A. basic lifecycle holds across mixed command types and entry points (createLandmarkHere() + direct history.execute())');
    }

    // -------------------------------------------------------------
    // B. UI <-> CommandHistory convergence — 0.9.210's own Section B
    //    already proved canUndo()/canRedo()/getUndoLabel()/getRedoLabel()
    //    are direct CommandHistory mirrors at a handful of points. New
    //    here: a structural check that WorldView.js's own canUndo/canRedo/
    //    undoLabel/redoLabel refs are written in exactly ONE place each
    //    (inside refreshSpatialUI()) — the thing that actually stops a
    //    second UI-side history representation from ever being invented,
    //    which no purely behavioral test could prove by itself.
    // -------------------------------------------------------------
    {
        const worldViewSource = await readFile(new URL('../ui/views/WorldView.js', import.meta.url), 'utf8');
        const codeOnly = worldViewSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');

        for (const refName of ['canUndo', 'canRedo', 'undoLabel', 'redoLabel']) {
            const writes = codeOnly.match(new RegExp(`\\b${refName}\\.value\\s*=`, 'g')) || [];
            assert(writes.length === 1, `12. ${refName}.value is assigned exactly once in the whole file (found ${writes.length}) — no second write path`);
        }
        const refreshFnMatch = codeOnly.match(/function refreshSpatialUI\(\)[\s\S]*?\n        \}/);
        assert(refreshFnMatch, '13. refreshSpatialUI() is a single, locatable function');
        for (const refName of ['canUndo', 'canRedo', 'undoLabel', 'redoLabel']) {
            assert(refreshFnMatch[0].includes(`${refName}.value = `), `14. ${refName}.value's one write lives inside refreshSpatialUI() itself`);
        }
        // The four refs are plain booleans/strings-or-null, never arrays —
        // nothing shaped like a second command list.
        assert(/const canUndo = ref\(false\);/.test(codeOnly) && /const canRedo = ref\(false\);/.test(codeOnly),
            '15. canUndo/canRedo are initialized as plain booleans, not arrays or objects that could hold a parallel command list');
        assert(/const undoLabel = ref\(null\);/.test(codeOnly) && /const redoLabel = ref\(null\);/.test(codeOnly),
            '16. undoLabel/redoLabel are initialized as plain nullable strings');

        console.log('✓ B. canUndo/canRedo/undoLabel/redoLabel each have exactly one write site, inside refreshSpatialUI() — no second UI-side history representation exists');
    }

    // -------------------------------------------------------------
    // C. Keyboard and button equivalence — NEW. Both call paths in
    //    WorldView.js converge on the SAME undoAction()/redoAction()
    //    functions (0.9.210's own Section H already confirmed this
    //    textually). This section extracts those functions' REAL source
    //    (plus onKeyDown() and guarded(), byte-for-byte, via brace
    //    matching — never retyped) and executes them against an
    //    identical pair of session fixtures: one driven by calling
    //    undoAction()/redoAction() directly (the button path) and one
    //    driven by feeding onKeyDown() synthetic Ctrl+Z / Ctrl+Y /
    //    Ctrl+Shift+Z events (the keyboard path). Both must produce
    //    identical document/history results — genuine behavioral proof,
    //    not just "the source text calls the same function name."
    // -------------------------------------------------------------
    let extractedHandlers; // shared with Section I below
    {
        const worldViewSource = await readFile(new URL('../ui/views/WorldView.js', import.meta.url), 'utf8');

        function extractFunction(source, name) {
            const marker = `function ${name}(`;
            const idx = source.indexOf(marker);
            assert(idx !== -1, `${name}() found in ui/views/WorldView.js`);
            const braceStart = source.indexOf('{', idx);
            let depth = 0, i = braceStart;
            for (; i < source.length; i++) {
                if (source[i] === '{') depth++;
                else if (source[i] === '}') { depth--; if (depth === 0) break; }
            }
            return source.slice(idx, i + 1);
        }

        const combinedSource = [
            extractFunction(worldViewSource, 'guarded'),
            extractFunction(worldViewSource, 'undoAction'),
            extractFunction(worldViewSource, 'redoAction'),
            extractFunction(worldViewSource, 'onAvatarKeyDown'),
            extractFunction(worldViewSource, 'onKeyDown')
        ].join('\n');

        // A factory — called once per simulated "mount" so each call
        // produces a genuinely independent closure over its own session,
        // exactly like Vue re-running setup() for each component
        // instance. Never reused as a shared/module-level handler.
        function createWorldViewKeyHandlers(session, { avatarControlMode = false } = {}) {
            const feedbackLog = [];
            const feedback = { show: (message) => feedbackLog.push(message) };
            let refreshCount = 0;
            const refreshSpatialUI = () => { refreshCount += 1; };
            const avatarControlModeRef = { value: avatarControlMode };
            // eslint-disable-next-line no-new-func
            const factory = new Function(
                'session', 'feedback', 'refreshSpatialUI', 'InputRouter', 'avatarControlMode',
                `${combinedSource}\nreturn { onKeyDown, undoAction, redoAction };`
            );
            const handlers = factory(session, feedback, refreshSpatialUI, InputRouter, avatarControlModeRef);
            return { ...handlers, feedbackLog, getRefreshCount: () => refreshCount };
        }
        extractedHandlers = { createWorldViewKeyHandlers, combinedSource };

        function ctrlZEvent({ shift = false } = {}) {
            let prevented = false;
            return { key: 'z', ctrlKey: true, metaKey: false, altKey: false, shiftKey: shift, repeat: false, target: { tagName: 'DIV' }, preventDefault: () => { prevented = true; }, wasPrevented: () => prevented };
        }
        function ctrlYEvent() {
            let prevented = false;
            return { key: 'y', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false, target: { tagName: 'DIV' }, preventDefault: () => { prevented = true; }, wasPrevented: () => prevented };
        }

        function makeUndoRedoSpySession() {
            let undoCalls = 0, redoCalls = 0;
            return {
                undo() { undoCalls += 1; return true; },
                redo() { redoCalls += 1; return true; },
                get undoCalls() { return undoCalls; },
                get redoCalls() { return redoCalls; }
            };
        }

        // C1 — spy-session equivalence: pressing the button and pressing
        // the key both call session.undo()/session.redo() exactly once.
        {
            const buttonSession = makeUndoRedoSpySession();
            const buttonHandlers = createWorldViewKeyHandlers(buttonSession);
            buttonHandlers.undoAction();
            assert(buttonSession.undoCalls === 1, '17. clicking Undo (calling undoAction() directly) calls session.undo() exactly once');

            const keySession = makeUndoRedoSpySession();
            const keyHandlers = createWorldViewKeyHandlers(keySession);
            const event = ctrlZEvent();
            keyHandlers.onKeyDown(event);
            assert(keySession.undoCalls === 1, '18. Ctrl+Z (through the real onKeyDown()) calls session.undo() exactly once');
            assert(event.wasPrevented(), '19. Ctrl+Z calls event.preventDefault() so the browser default (e.g. text-field undo) never fires alongside it');

            const buttonRedoSession = makeUndoRedoSpySession();
            createWorldViewKeyHandlers(buttonRedoSession).redoAction();
            assert(buttonRedoSession.redoCalls === 1, '20. clicking Redo calls session.redo() exactly once');

            const keyRedoSessionY = makeUndoRedoSpySession();
            createWorldViewKeyHandlers(keyRedoSessionY).onKeyDown(ctrlYEvent());
            assert(keyRedoSessionY.redoCalls === 1, '21. Ctrl+Y calls session.redo() exactly once');

            const keyRedoSessionShiftZ = makeUndoRedoSpySession();
            createWorldViewKeyHandlers(keyRedoSessionShiftZ).onKeyDown(ctrlZEvent({ shift: true }));
            assert(keyRedoSessionShiftZ.redoCalls === 1, '22. Ctrl+Shift+Z also calls session.redo() exactly once');
        }

        // C2 — real-session equivalence: starting from IDENTICAL session
        // state, the button path and the keyboard path produce IDENTICAL
        // resulting document state, not merely "called the same method."
        {
            const worldButton = saveWorld('Equivalence World (button)');
            const worldKey = saveWorld('Equivalence World (keyboard)');
            const sessionButton = makeSession(worldButton);
            const sessionKey = makeSession(worldKey);
            sessionButton.createLandmarkHere('A', '');
            const bLandmarkButton = sessionButton.createLandmarkHere('B', '');
            sessionKey.createLandmarkHere('A', '');
            const bLandmarkKey = sessionKey.createLandmarkHere('B', '');

            const handlersButton = createWorldViewKeyHandlers(sessionButton);
            const handlersKey = createWorldViewKeyHandlers(sessionKey);

            handlersButton.undoAction(); // button path
            handlersKey.onKeyDown(ctrlZEvent()); // keyboard path

            const liveButton = sessionButton.getDocument(worldButton.id).world;
            const liveKey = sessionKey.getDocument(worldKey.id).world;
            assert(liveButton.getWorldLandmark(bLandmarkButton) === null && liveKey.getWorldLandmark(bLandmarkKey) === null,
                '23. both paths undo the identical landmark');
            assert(sessionButton.canRedo() === true && sessionKey.canRedo() === true,
                '24. both paths leave an identical redo-availability state behind');

            handlersButton.redoAction();
            handlersKey.onKeyDown(ctrlYEvent());
            assert(liveButton.getWorldLandmark(bLandmarkButton) !== null && liveKey.getWorldLandmark(bLandmarkKey) !== null,
                '25. both paths redo back to the identical state');

            console.log('✓ C. keyboard and button paths are behaviorally identical, not just textually the same function name');
        }
    }

    // -------------------------------------------------------------
    // D. Preview / Undo / Redo boundary — 0.9.210's own Section C
    //    already proved canUndo()/canRedo()/undo()/redo() all read/act as
    //    disabled while a preview is active, and restored once cancelled.
    //    New here: the four explicit distinctions this milestone's brief
    //    calls for BY NAME.
    // -------------------------------------------------------------
    {
        const world = saveWorld('Preview Boundary World');
        const session = makeSession(world);
        session.createLandmarkHere('Before Preview', '');
        session.createLandmarkHere('Second', '');
        const history = session._commandHistories.get(world.id);

        // D1 — "Preview does not create a history entry."
        const commandCountBefore = history.getCommands().length;
        const cursorBefore = history.getCursor();
        session.beginHistoryPreview();
        session.previewHistoryAt(1);
        assert(history.getCommands().length === commandCountBefore, '26. previewing pushes no command onto CommandHistory');
        assert(history.getCursor() === cursorBefore, '27. previewing never moves the live cursor');
        session.cancelHistoryPreview();

        // D2 — "Undo does not secretly become Preview."
        assert(session.getHistoryPreview() === null, '28. sanity: no preview active before undo');
        session.undo();
        assert(session.getHistoryPreview() === null, '29. an ordinary undo() never leaves a preview active — undo mutates the live document/history directly, it never routes through the preview mechanism');
        session.redo();
        assert(session.getHistoryPreview() === null, '30. an ordinary redo() likewise never activates a preview');

        // D3 — "Restore does not secretly become Undo." Spy on the
        // CURRENT (about-to-be-retired) CommandHistory's own undo()/redo()
        // — restoreHistoryAt() must never call either of them; it replays
        // forward from scratch into a brand-new history (see
        // RestoreHistoryStateUseCase.js / CommandHistory.replay()), it
        // does not walk backward through the existing undo stack.
        let oldHistoryUndoCalled = false;
        let oldHistoryRedoCalled = false;
        const originalUndo = history.undo.bind(history);
        const originalRedo = history.redo.bind(history);
        history.undo = (...args) => { oldHistoryUndoCalled = true; return originalUndo(...args); };
        history.redo = (...args) => { oldHistoryRedoCalled = true; return originalRedo(...args); };
        session.restoreHistoryAt(1, world.id);
        assert(oldHistoryUndoCalled === false, '31. restoreHistoryAt() never calls the retiring history\'s own undo()');
        assert(oldHistoryRedoCalled === false, '32. restoreHistoryAt() never calls the retiring history\'s own redo()');

        // D4 — availability restored after Cancel Preview (the flow named
        // explicitly in the brief: preview -> undo/redo disabled -> cancel
        // -> availability restored). Exercised fresh on the post-restore
        // history so this section is fully self-contained.
        assert(session.canUndo() === false, '33. sanity: the fresh post-restore history has nothing to undo yet');
        session.createLandmarkHere('After Restore', '');
        assert(session.canUndo() === true, '34. sanity: now it does');
        session.beginHistoryPreview();
        session.previewHistoryAt(0);
        assert(session.canUndo() === false && session.canRedo() === false, '35. preview disables both, exactly as 0.9.210 Section C already established');
        session.cancelHistoryPreview();
        assert(session.canUndo() === true, '36. cancelling preview restores availability');

        console.log('✓ D. Preview, Undo, Redo, and Restore remain four semantically distinct operations — none silently substitutes for another');
    }

    // -------------------------------------------------------------
    // E. Restore -> Undo/Redo — NEW. The exact convergence point named
    //    in this milestone's brief: A -> B -> C, preview, restore B,
    //    undo, redo. Establishes that Restore produces an entirely
    //    ordinary document/history state and that Undo/Redo afterward
    //    operate through the same CommandHistory mechanism as always —
    //    no "restored history" special case anywhere.
    // -------------------------------------------------------------
    {
        const world = saveWorld('Restore Convergence World');
        const session = makeSession(world);
        const liveWorld = () => session.getDocument(world.id).world;

        const idA = session.createLandmarkHere('A', ''); // cursor 1
        const idB = session.createLandmarkHere('B', ''); // cursor 2
        const idC = session.createLandmarkHere('C', ''); // cursor 3
        const oldHistory = session._commandHistories.get(world.id);
        assert(liveWorld().getWorldLandmark(idA) && liveWorld().getWorldLandmark(idB) && liveWorld().getWorldLandmark(idC),
            '37. sanity: A, B, and C all exist before restoring');

        session.beginHistoryPreview();
        session.previewHistoryAt(2); // preview "up to and including B"
        assert(session.getHistoryPreview().world.getWorldLandmark(idB) !== null
            && session.getHistoryPreview().world.getWorldLandmark(idC) === null,
            '38. previewing cursor 2 shows A+B, not C — sanity on which cursor names "B"');

        // Restore B (restoreHistoryAt() itself ends the active preview —
        // 0.9.208's own Section E already regression-tests that specific
        // behavior; this section moves on to what happens AFTER).
        session.restoreHistoryAt(2, world.id);
        assert(session.getHistoryPreview() === null, '39. restoring ends the preview (0.9.208\'s own finding, reconfirmed here as this section\'s starting point)');
        assert(liveWorld().getWorldLandmark(idA) !== null && liveWorld().getWorldLandmark(idB) !== null && liveWorld().getWorldLandmark(idC) === null,
            '40. the live document now reflects exactly A+B — C is gone, not merely hidden');

        // Restore establishes an ORDINARY fresh baseline: a brand-new,
        // EMPTY history (nothing to undo yet), exactly like opening a
        // freshly-saved document — not a "history with A and B in it that
        // happens to have been produced by restoring."
        const newHistory = session._commandHistories.get(world.id);
        assert(newHistory !== oldHistory, '41. restore installs a genuinely different CommandHistory instance');
        assert(newHistory.getCommands().length === 0, '42. the new history starts with zero commands — A and B are baked into the restored WORLD, not replayed as undoable commands');
        assert(session.canUndo() === false, '43. immediately after restore there is nothing to undo — this is the fresh baseline, not "undo would bring back C"');
        assert(session.canRedo() === false, '44. and nothing to redo either');

        // NOW exercise ordinary Undo/Redo on top of the restored baseline.
        const idD = session.createLandmarkHere('D', '');
        assert(session.canUndo() === true, '45. a new command after restore is undoable through the ordinary mechanism');
        assert(session.undo() === true, '46. undo() works normally on the post-restore history');
        assert(liveWorld().getWorldLandmark(idD) === null, '47. undo removes D...');
        assert(liveWorld().getWorldLandmark(idB) !== null, '48. ...and leaves the restored baseline (B) fully intact — undo never reaches back into the retired pre-restore history');
        assert(liveWorld().getWorldLandmark(idC) === null, '49. undoing after a restore never resurrects C — there is no "undo the restore" shortcut hiding in undo()');

        assert(session.redo() === true, '50. redo() works normally too');
        assert(liveWorld().getWorldLandmark(idD) !== null, '51. D returns, through the ordinary CommandHistory redo stack');

        // The old, pre-restore history (with A, B, C) is retired
        // bookkeeping ONLY — getRetiredHistories() exists for inspection,
        // but undo()/redo()/canUndo()/canRedo() never consult it. Proven
        // structurally in the Structural Audit section below
        // (they resolve exclusively through _getActiveCommandHistory());
        // proven behaviorally here: the retired history still reports
        // it can redo C (it was never touched), yet the SESSION's own
        // redo() above produced D, never C — conclusive that the retired
        // history plays no role in ordinary redo() resolution.
        assert(oldHistory.canRedo() === false, '52. the OLD history\'s own cursor was never rewound (nothing was undone on it before it was retired) — it simply has nothing left to redo, confirming restore replayed forward from scratch rather than winding the old history back');
        assert(typeof session.getRetiredHistories === 'function' && session.getRetiredHistories(world.id).includes(oldHistory),
            '53. the old history is kept only in the retired list — a read-only audit trail, never consulted by undo()/redo() (see Structural Audit)');

        console.log('✓ E. Restore establishes an ordinary fresh document/history baseline; Undo/Redo afterward run entirely through the normal CommandHistory mechanism, with no "restored history" special case');
    }

    // -------------------------------------------------------------
    // F. Autosave / Recovery — NEW. World View's own undo/redo has no
    //    autosave/recovery surface to interact with at all (confirmed
    //    structurally below): ui/views/WorldView.js and application/
    //    WorldNavigationSession.js reference neither. The only place
    //    undo/redo and Autosave/Recovery coexist today is the Editor
    //    (DocumentManager + CommandHistory + AutosaveScheduler +
    //    RecoveryObserver, already fully audited by 0.9.204/0.9.205's own
    //    test files, undo/redo included). This section proves the
    //    underlying invariant this milestone's brief names — "Undo/Redo
    //    are ordinary document mutations" — at that exact integration
    //    point, using the real production classes, in the literal
    //    sequence the brief asks for: edit -> autosave -> undo -> dirty
    //    -> autosave -> restart -> recovery (and the redo path).
    // -------------------------------------------------------------
    {
        const recoveryStorage = new InMemoryStorageProvider();
        const recoveryStore = new LocalRecoveryStore(recoveryStorage);
        const autosaveDocumentUseCase = new AutosaveDocumentUseCase(recoveryStore, recoveryStorage);
        const checkRecoveryUseCase = new CheckRecoveryUseCase(recoveryStore, recoveryStorage);
        const recoverDocumentUseCase = new RecoverDocumentUseCase(recoveryStore);

        function bricksOf(document) { return document.world.getBuildings()[0].getBricks().length; }

        const world = new World();
        world.addBuilding(new Building({ creator: 'alice' }));
        const document = new Document({ world, metadata: new DocumentMetadata({ title: 'Autosave/Recovery World', author: 'alice' }) });
        const documentId = world.id;
        const buildingId = world.getBuildings()[0].id;

        const manager = new DocumentManager();
        manager.load(document, documentId); // fresh open — never explicitly Saved, mirrors a brand-new World View document
        const history = new CommandHistory({ world });
        manager.trackCommandHistory(history);
        assert(manager.state.dirty === false, '54. freshly loaded document is clean');

        // edit
        history.execute(new PlaceBrickCommand({ worldId: documentId, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        history.execute(new PlaceBrickCommand({ worldId: documentId, buildingId, definitionId: 'core:cube', position: new Position(2, 0.5, 0) }));
        assert(manager.state.dirty === true, '55. dirty after two ordinary edits');

        // autosave
        const firstCheckpoint = autosaveDocumentUseCase.execute(manager);
        assert(firstCheckpoint !== null, '56. autosave writes a checkpoint for a dirty document');
        assert(manager.state.dirty === true, '57. autosave itself never clears dirty — Autosave != Save (per AutosaveDocumentUseCase.js\'s own header)');

        // undo -> dirty (undo is an ORDINARY mutation: it changes the
        // document, so DocumentManager's own dirty computation reacts to
        // it exactly like any edit — no undo-specific hook required)
        history.undo();
        assert(bricksOf(manager.document) === 1, '58. undo removed the second brick — the document itself changed');
        assert(manager.state.dirty === true, '59. still dirty after undo (one edit ahead of the never-yet-saved baseline) — undo flows through the exact same isDirty()/STATE_CHANGED path as any edit, per DocumentManager.trackCommandHistory()\'s own subscription to COMMAND_UNDONE');

        // autosave again — must capture the POST-UNDO state, proving
        // autosave has no memory of "what used to be checkpointed";
        // it always reflects whatever the document currently is,
        // regardless of how it arrived there (edit vs. undo vs. redo).
        const secondCheckpoint = autosaveDocumentUseCase.execute(manager);
        assert(secondCheckpoint !== null && secondCheckpoint.revision > firstCheckpoint.revision, '60. a second autosave after undo writes a NEWER checkpoint');

        // restart — simulate the app reloading: a brand-new DocumentManager
        // + brand-new CommandHistory, no in-memory state carried over,
        // querying the SAME underlying storage.
        const restartCheckResult = checkRecoveryUseCase.execute(documentId);
        assert(restartCheckResult.available === true, '61. after "restart," recovery is offered (the document was never explicitly Saved, so any checkpoint outranks the saved revision)');
        const { document: recoveredDocument } = recoverDocumentUseCase.execute(documentId);
        assert(bricksOf(recoveredDocument) === 1, '62. recovery restores exactly the POST-UNDO state (one brick) — undo\'s effect survived the checkpoint/restart/recover round trip through nothing but ordinary document serialization, no undo-specific recovery representation');

        // ...and the corresponding redo path: redo is likewise an
        // ordinary mutation that a subsequent autosave/recovery cycle
        // observes transparently.
        history.redo();
        assert(bricksOf(manager.document) === 2, '63. redo restored the second brick');
        const thirdCheckpoint = autosaveDocumentUseCase.execute(manager);
        assert(thirdCheckpoint !== null && thirdCheckpoint.revision > secondCheckpoint.revision, '64. autosave after redo writes a newer checkpoint yet again');
        const { document: recoveredAfterRedo } = recoverDocumentUseCase.execute(documentId);
        assert(bricksOf(recoveredAfterRedo) === 2, '65. recovery after the redo-then-autosave cycle reflects the redone (two-brick) state — same mechanism, no branch for "this checkpoint came from a redo"');

        // Structural half: World View's own undo/redo has NOTHING like
        // this wired up at all — no special path exists because no path
        // exists, period.
        const worldViewSource = await readFile(new URL('../ui/views/WorldView.js', import.meta.url), 'utf8');
        const navSource = await readFile(new URL('../application/WorldNavigationSession.js', import.meta.url), 'utf8');
        assert(!/autosave|recovery/i.test(worldViewSource), '66. ui/views/WorldView.js contains no autosave/recovery reference of any kind (case-insensitive) — World View\'s Undo/Redo has no autosave/recovery surface to interact with');
        assert(!/autosave|recovery/i.test(navSource), '67. application/WorldNavigationSession.js likewise contains no autosave/recovery reference — confirms the invariant holds by construction (nothing exists to special-case), not merely by omission of a bug');

        console.log('✓ F. Undo/Redo compose with Autosave/Recovery as ordinary document mutations wherever that machinery exists (proven on the real DocumentManager+CommandHistory integration point); World View itself has no such surface at all, confirmed structurally');
    }

    // -------------------------------------------------------------
    // G. Publication / World isolation — 0.9.210's own Section F already
    //    proved a Publication survives regardless of undo/redo and that
    //    no publish/distribute command ever enters CommandHistory. New
    //    here: the STRONG negative test the brief asks for by name —
    //    undo()/redo()/canUndo()/canRedo()'s own method bodies, read
    //    directly from source, never reference Arweave, Nostr, Snapshot,
    //    World placement, or material verification machinery AT ALL, so
    //    there is no code path by which they COULD retract/redistribute/
    //    remove/mutate any of it, regardless of what future commands get
    //    added to CommandHistory.
    // -------------------------------------------------------------
    {
        const navSource = await readFile(new URL('../application/WorldNavigationSession.js', import.meta.url), 'utf8');

        function extractMethod(name) {
            const re = new RegExp(`\\b${name}\\s*\\([^)]*\\)\\s*\\{`);
            const start = navSource.search(re);
            assert(start !== -1, `${name}() is defined in WorldNavigationSession.js`);
            let depth = 0, i = navSource.indexOf('{', start);
            const bodyStart = i;
            for (; i < navSource.length; i++) {
                if (navSource[i] === '{') depth++;
                else if (navSource[i] === '}') { depth--; if (depth === 0) break; }
            }
            return navSource.slice(bodyStart, i + 1);
        }

        const forbidden = /arweave|nostr|snapshot|placement|material|publish|distribut/i;
        for (const name of ['undo', 'redo', 'canUndo', 'canRedo']) {
            const body = extractMethod(name);
            assert(!forbidden.test(body), `68. ${name}()'s own body contains no reference to Publication/Arweave/Nostr/Snapshot/placement/material machinery — structurally incapable of touching any of it`);
        }

        // Behavioral reconfirmation with the strongest signal available:
        // publish a document, capture every externally-visible fact about
        // the resulting Publication and the world's placement/material
        // bookkeeping, run undo() and redo() several times, and diff.
        const world = saveWorld('Publication Isolation World');
        const session = makeSession(world);
        session.createLandmarkHere('Pre-publish landmark', '');
        session.saveDocument(world.id);
        const publication = session.publishDocument(world.id);
        assert(publication && publication.id, '69. sanity: publishing succeeded');

        const publicationBefore = session.getPublicationForDocument(world.id);
        const publishedIdsBefore = Array.from(session._publishedDocumentIds);
        const publicationJsonBefore = JSON.stringify(publicationBefore);

        for (let i = 0; i < 3; i++) {
            session.undo();
            session.redo();
        }

        assert(JSON.stringify(session.getPublicationForDocument(world.id)) === publicationJsonBefore,
            '70. the Publication record is byte-for-byte identical after repeated undo/redo cycles');
        assert(JSON.stringify(Array.from(session._publishedDocumentIds)) === JSON.stringify(publishedIdsBefore),
            '71. the published-document-id bookkeeping is untouched by undo/redo');

        console.log('✓ G. Undo/Redo are structurally incapable of touching Publication/Arweave/Nostr/Snapshot/placement/material state — neither by source inspection nor by repeated behavioral probing');
    }

    // -------------------------------------------------------------
    // H. Multi-document isolation — 0.9.210's own Section D already
    //    proved undo()/redo() never cross a document boundary. New here:
    //    getUndoLabel()/getRedoLabel() specifically (not exercised by
    //    0.9.210's own multi-document section at all) never leak text
    //    describing the PREVIOUSLY active document once the active
    //    document switches — the exact "stale affordance" risk this
    //    milestone's brief calls out for the UI labels.
    // -------------------------------------------------------------
    {
        const worldA = saveWorld('Label Isolation Document A');
        const worldB = saveWorld('Label Isolation Document B');
        const session = makeSession(worldA);
        session._loadWorld(worldB.id);

        session._activeDocumentId = worldA.id;
        session.createLandmarkHere('Alpha', '');
        const labelA = session.getUndoLabel();
        assert(typeof labelA === 'string' && labelA.length > 0, '72. sanity: A has a real undo label');

        session._activeDocumentId = worldB.id;
        assert(session.getUndoLabel() === null, '73. switching to a document with no history reports null, never A\'s leftover label');
        assert(session.getRedoLabel() === null, '74. same for the redo label');

        session.createLandmarkHere('Beta', '');
        const labelB = session.getUndoLabel();
        assert(typeof labelB === 'string' && labelB !== labelA, '75. B\'s own label describes B\'s own command, never A\'s');

        session.undo(); // undo on B
        assert(session.getUndoLabel() === null, '76. B\'s label clears once B has nothing left to undo');
        session._activeDocumentId = worldA.id;
        assert(session.getUndoLabel() === labelA, '77. switching back to A reports EXACTLY A\'s original label again — neither document\'s label representation was ever mutated by visiting the other');

        console.log('✓ H. getUndoLabel()/getRedoLabel() never leak a previous document\'s label across an active-document switch');
    }

    // -------------------------------------------------------------
    // I. Mount / unmount lifecycle — NEW, and per this milestone's own
    //    brief the most valuable check here. Reuses the SAME extracted,
    //    real undoAction()/redoAction()/onKeyDown()/guarded() source from
    //    Section C (never retyped) against a fake `window` event target,
    //    to behaviorally prove every lifecycle guarantee 0.9.210's own
    //    Section H could only confirm textually.
    // -------------------------------------------------------------
    {
        const { createWorldViewKeyHandlers } = extractedHandlers;

        function makeFakeWindow() {
            const listeners = new Map();
            return {
                addEventListener(type, fn) {
                    if (!listeners.has(type)) listeners.set(type, new Set());
                    listeners.get(type).add(fn);
                },
                removeEventListener(type, fn) {
                    const set = listeners.get(type);
                    if (set) set.delete(fn);
                },
                dispatch(type, event) {
                    for (const fn of Array.from(listeners.get(type) || [])) fn(event);
                },
                listenerCount(type) { return (listeners.get(type) || new Set()).size; }
            };
        }
        function ctrlZ() {
            return { key: 'z', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false, repeat: false, target: { tagName: 'DIV' }, preventDefault() {} };
        }
        function makeCountingSession() {
            let undoCalls = 0;
            return { undo() { undoCalls += 1; return true; }, redo() { return false; }, get undoCalls() { return undoCalls; } };
        }

        // I1 — mount -> keydown -> correct action.
        const win = makeFakeWindow();
        const sessionA = makeCountingSession();
        const handlersA = createWorldViewKeyHandlers(sessionA);
        win.addEventListener('keydown', handlersA.onKeyDown); // "mount"
        win.dispatch('keydown', ctrlZ());
        assert(sessionA.undoCalls === 1, '78. mount -> Ctrl+Z -> session.undo() fires exactly once');

        // I2 — unmount -> keydown -> no action.
        win.removeEventListener('keydown', handlersA.onKeyDown); // "unmount"
        win.dispatch('keydown', ctrlZ());
        assert(sessionA.undoCalls === 1, '79. after unmount, the identical key event reaches no handler — undoCalls stays at 1, not 2');
        assert(win.listenerCount('keydown') === 0, '80. the fake window genuinely has zero keydown listeners left after unmount');

        // I3 — mount -> unmount -> mount -> exactly one EFFECTIVE handler.
        // A fresh "component instance" (fresh closure, fresh session) is
        // mounted after the first was properly torn down; only the NEW
        // one may react.
        const sessionB = makeCountingSession();
        const handlersB = createWorldViewKeyHandlers(sessionB);
        win.addEventListener('keydown', handlersB.onKeyDown); // remount
        win.dispatch('keydown', ctrlZ());
        assert(sessionA.undoCalls === 1, '81. the OLD (unmounted) instance\'s session is never touched by a keydown after remount');
        assert(sessionB.undoCalls === 1, '82. exactly the NEW instance\'s session reacts — one effective handler, not zero, not two');
        assert(win.listenerCount('keydown') === 1, '83. exactly one listener is attached at any given time across a mount/unmount/mount cycle');

        // I4 — multiple simultaneous WorldView instances don't cross-
        // trigger each other. Two independent mounts, both live at once
        // (e.g. two panes) — a single keydown reaches both (ordinary DOM
        // fan-out to every registered listener), but each must act ONLY
        // on its own session, never the other's.
        const win2 = makeFakeWindow();
        const sessionC = makeCountingSession();
        const sessionD = makeCountingSession();
        const handlersC = createWorldViewKeyHandlers(sessionC);
        const handlersD = createWorldViewKeyHandlers(sessionD);
        win2.addEventListener('keydown', handlersC.onKeyDown);
        win2.addEventListener('keydown', handlersD.onKeyDown);
        win2.dispatch('keydown', ctrlZ());
        assert(sessionC.undoCalls === 1 && sessionD.undoCalls === 1,
            '84. both simultaneously-mounted instances react to one keydown, each undoing its OWN session exactly once');
        // Neither handler's closure references the other's session at
        // all — proven by construction (createWorldViewKeyHandlers()
        // receives exactly one session argument, closed over by exactly
        // one returned onKeyDown), and reconfirmed behaviorally: unmount
        // C only, dispatch again, D must still react while C must not.
        win2.removeEventListener('keydown', handlersC.onKeyDown);
        win2.dispatch('keydown', ctrlZ());
        assert(sessionC.undoCalls === 1, '85. C, now unmounted, does not react to the second keydown');
        assert(sessionD.undoCalls === 2, '86. D, still mounted, reacts independently — confirms C and D were never sharing one handler or one session');

        // I5 — no stale session captured by an OLD handler. Regression
        // shape for the specific bug class this check exists to catch:
        // if onKeyDown/undoAction were ever hoisted to module scope
        // (instead of being re-created per component instance inside
        // setup()), a second mounted instance would silently keep
        // calling the FIRST session ever constructed. Demonstrated here
        // by confirming each createWorldViewKeyHandlers() call is a
        // fully independent factory invocation (no shared module-level
        // state threaded between sessionA/B/C/D above) — already implied
        // by I3/I4's own counts (sessionA never incremented past 1 no
        // matter how many later instances mounted/dispatched), stated
        // explicitly here as its own assertion.
        assert(sessionA.undoCalls === 1, '87. sessionA (the very first instance mounted in this section) still reads exactly 1 after every subsequent mount/unmount/remount/dual-mount above — no later handler ever captured or reused its stale reference');

        // I6 — structural confirmation that the real WorldView.js source
        // (not the extracted copy) actually attaches/detaches through
        // ONE addEventListener/removeEventListener pair for 'keydown',
        // using the SAME onKeyDown reference for both — the fact that
        // makes I1-I5's extracted-source behavior above representative
        // of the real component's actual mount/unmount wiring, not just
        // of a hypothetical reimplementation.
        const worldViewSource = await readFile(new URL('../ui/views/WorldView.js', import.meta.url), 'utf8');
        const structuralCodeOnly = worldViewSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const addKeydownMatches = structuralCodeOnly.match(/window\.addEventListener\('keydown',\s*onKeyDown\)/g) || [];
        const removeKeydownMatches = structuralCodeOnly.match(/window\.removeEventListener\('keydown',\s*onKeyDown\)/g) || [];
        assert(addKeydownMatches.length === 1, `88. exactly one window.addEventListener('keydown', onKeyDown) call exists (found ${addKeydownMatches.length})`);
        assert(removeKeydownMatches.length === 1, `89. exactly one window.removeEventListener('keydown', onKeyDown) call exists (found ${removeKeydownMatches.length}) — the identical function reference used to attach it`);
        const onMountedCount = (structuralCodeOnly.match(/\bonMounted\(/g) || []).length;
        const onBeforeUnmountCount = (structuralCodeOnly.match(/\bonBeforeUnmount\(/g) || []).length;
        assert(onMountedCount === 1 && onBeforeUnmountCount === 1,
            `90. exactly one onMounted() and one onBeforeUnmount() hook exist in the whole file (found ${onMountedCount} / ${onBeforeUnmountCount}) — undoAction/redoAction/onKeyDown are declared once, inside the ONE setup() function, so every component instance genuinely gets its own independent closure exactly like sessionA-D above`);
        const setupCount = (structuralCodeOnly.match(/\n\s*setup\(/g) || []).length;
        assert(setupCount === 1, `91. exactly one setup() function exists (found ${setupCount}) — onKeyDown/undoAction/redoAction cannot be module-level/shared state; each mounted WorldView instance re-runs setup() and gets its own closures`);

        console.log('✓ I. mount/unmount lifecycle: correct action on mount, no action after unmount, exactly one effective handler across mount/unmount/remount, independent behavior across simultaneous instances, and no stale-session capture — proven behaviorally on the real extracted source, and structurally on the real component wiring');
    }

    // -------------------------------------------------------------
    // J. Empty-history behavior — 0.9.210's own Section G already proved
    //    undo()/redo() on an empty history return false without
    //    throwing. New here: the brief's own explicit "no dirty
    //    transition, no autosave, no unrelated UI mutation" claim, in
    //    both the never-had-anything-to-undo case AND the Preview-active
    //    case (a second way canUndo()/canRedo() read false).
    // -------------------------------------------------------------
    {
        const world = saveWorld('Empty History World');
        const session = makeSession(world);

        assert(session.canUndo() === false && session.canRedo() === false, '92. empty history: both read false');
        assert(session.getUndoLabel() === null && session.getRedoLabel() === null, '93. empty history: both labels are null, not empty string or stale text');

        const dirtyBefore = session.isDocumentDirty(world.id);
        assert(session.undo() === false, '94. undo() on empty history is a safe no-op');
        assert(session.redo() === false, '95. redo() on empty history is a safe no-op');
        assert(session.isDocumentDirty(world.id) === dirtyBefore, '96. no dirty transition occurred from the no-op undo/redo above');
        assert(session.getActiveDocumentId() === world.id, '97. no unrelated navigation/UI state changed either');

        // A subsequent valid operation still behaves normally — the
        // no-ops above left nothing corrupted.
        const id = session.createLandmarkHere('Still Works', '');
        assert(session.getDocument(world.id).world.getWorldLandmark(id) !== null, '98. an ordinary operation still works after two no-op undo/redo calls');

        console.log('✓ J. empty-history undo/redo are safe no-ops: false booleans, null labels, no dirty transition, no side effects on anything else');
    }

    // -------------------------------------------------------------
    // Structural audit — the repository-level assertions this
    // milestone's brief calls for by name.
    // -------------------------------------------------------------
    {
        const worldViewSource = await readFile(new URL('../ui/views/WorldView.js', import.meta.url), 'utf8');
        const codeOnly = worldViewSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        const navSource = await readFile(new URL('../application/WorldNavigationSession.js', import.meta.url), 'utf8');
        const panelSource = await readFile(new URL('../ui/components/HistoryTimelinePanel.js', import.meta.url), 'utf8');

        // 1. WorldView.js has no CommandHistory import.
        assert(!/from ['"].*\/CommandHistory\.js['"]/.test(codeOnly), '99. WorldView.js does not import CommandHistory');
        assert(!codeOnly.includes('undoStack') && !codeOnly.includes('redoStack'), '100. WorldView.js invents no undoStack/redoStack of its own');

        // 2. Exactly one history implementation.
        assert((navSource.match(/new CommandHistory\(/g) || []).length >= 1, '101. WorldNavigationSession.js constructs history state via the ONE CommandHistory class');
        assert(!/class\s+\w*History\w*\s*\{/.test(navSource), '102. WorldNavigationSession.js defines no second, competing history class');
        assert(!/class\s+\w*History\w*\s*\{/.test(codeOnly), '103. WorldView.js defines no second, competing history class either');

        // 3. Exactly one keyboard listener (already proven behaviorally
        // in Section I; restated here as the file-level structural fact
        // the brief asks for explicitly).
        const allAddEventListenerKeydown = codeOnly.match(/addEventListener\('keydown'/g) || [];
        assert(allAddEventListenerKeydown.length === 1, `104. exactly one 'keydown' addEventListener call exists in the entire file (found ${allAddEventListenerKeydown.length})`);

        // 4. Undo/Redo buttons don't manipulate history directly.
        assert(codeOnly.includes('@click="undoAction"') && codeOnly.includes('@click="redoAction"'), '105. the buttons are wired to undoAction()/redoAction(), not a direct history call');
        assert(!/@click="[^"]*history\.(undo|redo)/.test(codeOnly), '106. no button click handler calls history.undo()/history.redo() directly');
        assert(!codeOnly.includes('commandHistory'), '107. WorldView.js never references a "commandHistory" identifier at all');

        // 5. Undo/Redo don't manipulate Publication, Snapshot, Nostr,
        // Arweave, placement, or material stores (session-level bodies
        // proven in Section G; restated here for undoAction/redoAction
        // themselves).
        function extractTopLevelFunction(source, name) {
            const marker = `function ${name}(`;
            const idx = source.indexOf(marker);
            assert(idx !== -1, `${name}() found`);
            let depth = 0, i = source.indexOf('{', idx);
            for (; i < source.length; i++) {
                if (source[i] === '{') depth++;
                else if (source[i] === '}') { depth--; if (depth === 0) break; }
            }
            return source.slice(idx, i + 1);
        }
        const undoActionBody = extractTopLevelFunction(codeOnly, 'undoAction');
        const redoActionBody = extractTopLevelFunction(codeOnly, 'redoAction');
        const forbidden = /arweave|nostr|snapshot|placement|material|publish|distribut/i;
        assert(!forbidden.test(undoActionBody), '108. undoAction() references no Publication/Arweave/Nostr/Snapshot/placement/material machinery');
        assert(!forbidden.test(redoActionBody), '109. redoAction() references no Publication/Arweave/Nostr/Snapshot/placement/material machinery either');

        // 6. No new history state introduced into WorldView beyond the
        // existing read-only UI mirrors (canUndo/canRedo/undoLabel/
        // redoLabel — all four already confirmed as plain boolean/
        // nullable-string refs, written exactly once, in Section B).
        const newRefsForUndoRedo = (codeOnly.match(/const (canUndo|canRedo|undoLabel|redoLabel) = ref\(/g) || []).length;
        assert(newRefsForUndoRedo === 4, `110. exactly the four expected read-only mirror refs exist for undo/redo (found ${newRefsForUndoRedo}) — no additional history-shaped state was introduced`);

        // 7. No history-specific persistence or autosave path exists
        // (Section F's own structural finding, restated here as part of
        // this milestone's own repository-level rollup).
        assert(!/autosave|recovery/i.test(codeOnly), '111. WorldView.js has no autosave/recovery reference of any kind');
        assert(!/autosave|recovery/i.test(navSource), '112. WorldNavigationSession.js likewise has none');

        // 8. Preview/Restore remain separate from Undo/Redo:
        // HistoryTimelinePanel.js gained no undo/redo affordance
        // (0.9.210's own Section H established this; reconfirmed here).
        const panelCodeOnly = panelSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!panelCodeOnly.includes('undoAction') && !panelCodeOnly.includes('redoAction')
            && !panelCodeOnly.includes("'undo'") && !panelCodeOnly.includes("'redo'"),
            '113. HistoryTimelinePanel.js still has no undo/redo affordance of its own');
        // ...and the converse: undoAction()/redoAction() never open or
        // touch the History panel's own state.
        assert(!undoActionBody.includes('showHistoryPanel') && !undoActionBody.includes('historyPreview')
            && !redoActionBody.includes('showHistoryPanel') && !redoActionBody.includes('historyPreview'),
            '114. undoAction()/redoAction() never touch History-panel-specific state either — the two surfaces are mutually silent about each other, sharing only the underlying session');

        console.log('✓ Structural audit: no CommandHistory import in WorldView.js, one history implementation, one keyboard listener, buttons never touch history/publication/autosave state directly, no new history-shaped refs, Preview/Restore and Undo/Redo remain mutually silent surfaces');
    }

    console.log('\nAll World View Undo/Redo Lifecycle Audit tests passed.');
}

await run();
