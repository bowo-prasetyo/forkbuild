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

// 0.9.210 — World View Undo/Redo UI Integration.
//
// 0.9.209 found a narrow, specific gap: WorldNavigationSession.undo()/
// redo() (present since 0.5.9, for exactly the landmark/region naming
// commands World View pushes onto CommandHistory) had no UI caller
// anywhere in World View — the same "correctly composed, zero callers"
// shape 0.9.203 found for autosave/recovery and 0.9.206 found for the
// history/replay/restore stack. This milestone closes it the same way
// 0.9.207 closed the history-timeline gap: WorldView.js gets Undo/Redo
// buttons and a Ctrl+Z/Ctrl+Y/Ctrl+Shift+Z keyboard shortcut, both
// thin callers of session.undo()/session.redo() — no new undo/redo
// engine, no second undoStack/redoStack, no history-specific autosave.
//
// ui/views/WorldView.js itself cannot be exercised here: it imports
// 'vue', which this repo's plain `node tests/*.test.js` sweep has no
// browser/CDN runtime to resolve — the same constraint
// tests/WorldViewHistoryTimelineIntegration.test.js's own header
// documents. Sections A-G instead exercise the real
// WorldNavigationSession in the exact sequence WorldView.js's new
// undoAction()/redoAction() functions now run it; Section H is a
// structural read of the changed source files confirming the wiring,
// the keyboard convention, and the "no second history mechanism"
// boundary are actually there.

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

// Mirrors tests/WorldLandmarksSessionUX.test.js's own makeIdentityProvider().
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

// PublishDocumentUseCase/LocalPublisherProvider want a DIFFERENT
// identity provider shape (currentUser()/sign()) than the one
// WorldNavigationSession's own identityProvider constructor param
// wants (getSigningIdentity(), via resolveSigningIdentityId — see
// makeIdentityProvider above) — mirrors
// WorldViewHistoryTimelineIntegration.test.js's own stubIdentityProvider.
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

    // Mirrors WorldLandmarksSessionUX.test.js's own makeSession() —
    // a REAL WorldNavigationSession, avatar-positioned so
    // createLandmarkHere() (the one mutation World View's UI actually
    // drives through CommandHistory) works exactly like it does for a
    // live viewer.
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
        // A building is required for publishDocument() (Section F) —
        // PublishDocumentUseCase refuses to publish an empty world.
        world.addBuilding(new Building({ creator: 'alice' }));
        const doc = new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice', authorIdentityId: 'did:key:alice' }) });
        saveDocumentUseCase.execute(new DocumentManager(doc));
        return world;
    }

    // -------------------------------------------------------------
    // A. FLAGSHIP — Create landmark A, Create landmark B, Undo (B
    //    disappears), Redo (B returns), Undo, Create landmark C (the
    //    CommandHistory linear-history invariant wipes the old redo
    //    branch), Redo — proving the UI layer never manages the
    //    stack itself; whatever CommandHistory already defines for
    //    "undo -> new command -> redo" stays authoritative.
    // -------------------------------------------------------------
    {
        const world = saveWorld('Flagship World');
        const session = makeSession(world);
        const liveWorld = () => session.getDocument(world.id).world;

        assert(session.canUndo() === false, '1. nothing to undo on a fresh session');
        assert(session.canRedo() === false, '2. nothing to redo on a fresh session');

        const landmarkAId = session.createLandmarkHere('Landmark A', '');
        assert(liveWorld().getWorldLandmark(landmarkAId) !== null, '3. Landmark A exists');
        assert(session.canUndo() === true, '4. canUndo becomes true after a create');

        const landmarkBId = session.createLandmarkHere('Landmark B', '');
        assert(liveWorld().getWorldLandmark(landmarkBId) !== null, '5. Landmark B exists');

        assert(session.undo() === true, '6. undo() reports success');
        assert(liveWorld().getWorldLandmark(landmarkBId) === null, '7. B disappears after undo');
        assert(liveWorld().getWorldLandmark(landmarkAId) !== null, '8. A is untouched by undoing B');
        assert(session.canRedo() === true, '9. canRedo becomes true after an undo');

        assert(session.redo() === true, '10. redo() reports success');
        assert(liveWorld().getWorldLandmark(landmarkBId) !== null, '11. B returns after redo');

        assert(session.undo() === true, '12. undo again removes B');
        assert(liveWorld().getWorldLandmark(landmarkBId) === null, '13. B gone again');

        const landmarkCId = session.createLandmarkHere('Landmark C', '');
        assert(liveWorld().getWorldLandmark(landmarkCId) !== null, '14. Landmark C exists');
        // CommandHistory's own linear-history invariant: executing a new
        // command after an undo clears the redo branch entirely — the
        // undone "Landmark B" create is now permanently gone, not merely
        // hidden. See application/CommandHistory.js's own header.
        assert(session.canRedo() === false, '15. redo is unavailable — B\'s create was wiped by C\'s execute, exactly like CommandHistory always does for every other command');
        assert(session.redo() === false, '16. redo() itself is a safe no-op, not a throw');
        assert(liveWorld().getWorldLandmark(landmarkBId) === null, '17. B never comes back');

        console.log('✓ A. FLAGSHIP: create A, create B, undo, redo, undo, create C, redo — CommandHistory stays authoritative');
    }

    // -------------------------------------------------------------
    // B. canUndo()/canRedo() are a direct mirror of CommandHistory's
    //    own canUndo()/canRedo() at every step — no second
    //    undoStack/redoStack representation invented in the session.
    // -------------------------------------------------------------
    {
        const world = saveWorld('Mirror World');
        const session = makeSession(world);
        const history = session._commandHistories.get(world.id);

        assert(session.canUndo() === history.canUndo(), '18. canUndo mirrors history.canUndo() (both false)');
        session.createLandmarkHere('X', '');
        assert(session.canUndo() === history.canUndo() && session.canUndo() === true, '19. canUndo mirrors history.canUndo() (both true)');
        session.undo();
        assert(session.canRedo() === history.canRedo() && session.canRedo() === true, '20. canRedo mirrors history.canRedo() (both true)');
        assert(session.getUndoLabel() === history.getUndoLabel(), '21. getUndoLabel() is exactly CommandHistory\'s own label');
        assert(session.getRedoLabel() === history.getRedoLabel(), '22. getRedoLabel() is exactly CommandHistory\'s own label');

        console.log('✓ B. canUndo/canRedo/getUndoLabel/getRedoLabel are direct CommandHistory mirrors');
    }

    // -------------------------------------------------------------
    // C. History Preview interaction — Preview is a separate
    //    authority from Undo/Redo. While a preview is active,
    //    canUndo()/canRedo() read false and undo()/redo() are no-ops,
    //    exactly mirroring the guard undo()/redo() already carried
    //    since 0.5.9/0.9.208 — this milestone invents no new rule.
    // -------------------------------------------------------------
    {
        const world = saveWorld('Preview World');
        const session = makeSession(world);
        session.createLandmarkHere('Before Preview', '');
        assert(session.canUndo() === true, '23. sanity: undo is available before any preview');

        session.beginHistoryPreview();
        session.previewHistoryAt(1);
        assert(session.canUndo() === false, '24. canUndo() is false while a history preview is active');
        assert(session.canRedo() === false, '25. canRedo() is false while a history preview is active');
        assert(session.undo() === false, '26. undo() itself is refused (no-op) while previewing');
        assert(session.redo() === false, '27. redo() itself is refused (no-op) while previewing');

        session.cancelHistoryPreview();
        assert(session.canUndo() === true, '28. canUndo() is available again once the preview ends');

        console.log('✓ C. History Preview and Undo/Redo stay two separate authorities');
    }

    // -------------------------------------------------------------
    // D. Cross-document isolation — undo/redo on Document A never
    //    reaches Document B, whichever one is currently active.
    // -------------------------------------------------------------
    {
        const worldA = saveWorld('Document A');
        const worldB = saveWorld('Document B');
        const session = makeSession(worldA);
        session._loadWorld(worldB.id);

        session._activeDocumentId = worldA.id;
        const landmarkA = session.createLandmarkHere('A landmark', '');
        session._activeDocumentId = worldB.id;
        const landmarkB1 = session.createLandmarkHere('B landmark 1', '');
        const landmarkB2 = session.createLandmarkHere('B landmark 2', '');

        // Undoing while B is active must only ever touch B.
        assert(session.undo() === true, '29. undo() targets the active document (B)');
        const liveA = session.getDocument(worldA.id).world;
        const liveB = session.getDocument(worldB.id).world;
        assert(liveA.getWorldLandmark(landmarkA) !== null, '30. A\'s landmark is untouched by undoing on B');
        assert(liveB.getWorldLandmark(landmarkB1) !== null && liveB.getWorldLandmark(landmarkB2) === null, '31. only B\'s most recent command was undone');

        // Switch back to A and undo there — B must stay exactly as it
        // was left, and A's own history must not have been silently
        // advanced/rewound by any of the B operations above.
        session._activeDocumentId = worldA.id;
        assert(session.canUndo() === true, '32. A still has its own undoable command');
        session.undo();
        assert(session.getDocument(worldA.id).world.getWorldLandmark(landmarkA) === null, '33. undo on A removes A\'s own landmark');
        assert(session.getDocument(worldB.id).world.getWorldLandmark(landmarkB1) !== null, '34. B is completely unaffected by undoing on A');

        console.log('✓ D. cross-document isolation: undo/redo never cross a document boundary');
    }

    // -------------------------------------------------------------
    // E. Ordinary dirty/autosave semantics — undo/redo change
    //    isDocumentDirty() through CommandHistory's own isDirty(),
    //    no history-specific dirty/autosave representation.
    // -------------------------------------------------------------
    {
        const world = saveWorld('Dirty World');
        const session = makeSession(world);
        assert(session.isDocumentDirty(world.id) === false, '35. clean immediately after load');

        session.createLandmarkHere('Dirty Landmark', '');
        assert(session.isDocumentDirty(world.id) === true, '36. an ordinary mutation dirties the document');
        session.saveDocument(world.id);
        assert(session.isDocumentDirty(world.id) === false, '37. saving clears dirty, ordinary semantics');

        session.undo();
        assert(session.isDocumentDirty(world.id) === true, '38. undoing PAST the save point dirties the document again — the same isDirty() every other mutation already uses');

        session.redo();
        assert(session.isDocumentDirty(world.id) === false, '39. redoing back onto the save point is clean again — no special history-dirty flag, just CommandHistory.isDirty()');

        console.log('✓ E. undo/redo use the ordinary dirty/autosave path, nothing history-specific');
    }

    // -------------------------------------------------------------
    // F. Publication isolation — undo of a World command only
    //    changes what that command says it changes. A Publication
    //    created from a document is never rolled back by undo()
    //    because it was never itself represented as a Command.
    // -------------------------------------------------------------
    {
        const world = saveWorld('Publication World');
        const session = makeSession(world);
        session.createLandmarkHere('Published-with Landmark', '');
        session.saveDocument(world.id);
        const publication = session.publishDocument(world.id);
        assert(publication && publication.id, '40. sanity: publishing produced a Publication');

        // The World is now the published id itself in this session's
        // bookkeeping; further edits to it would need to fork first.
        // The point here is narrower: undo/redo never had, and still
        // don't have, any notion of "roll back a publish" — nothing on
        // CommandHistory represents it, so there is nothing for undo()
        // to find or touch.
        const history = session._commandHistories.get(world.id);
        assert(history.getCommands().every((cmd) => cmd.type !== 'publish' && cmd.type !== 'distribute'), '41. no publish/distribute command ever entered CommandHistory');
        assert(session.getPublicationForDocument(world.id) !== null, '42. the Publication still exists — undo/redo have no path to it at all');

        console.log('✓ F. Publication distribution is structurally outside undo/redo\'s reach');
    }

    // -------------------------------------------------------------
    // G. Failure isolation — undo()/redo() on an empty/exhausted
    //    history are safe no-ops (never throw), and a subsequent
    //    valid operation still works normally afterward.
    // -------------------------------------------------------------
    {
        const world = saveWorld('Failure Isolation World');
        const session = makeSession(world);

        let threw = false;
        try {
            assert(session.undo() === false, '43. undo() on empty history returns false');
            assert(session.redo() === false, '44. redo() on empty history returns false');
        } catch (e) {
            threw = true;
        }
        assert(!threw, '45. undo()/redo() never throw on an empty history');

        const landmarkId = session.createLandmarkHere('Still Works', '');
        assert(session.getDocument(world.id).world.getWorldLandmark(landmarkId) !== null, '46. an ordinary operation still works after the no-op undo/redo above');
        assert(session.undo() === true && session.redo() === true, '47. undo/redo still function normally afterward');

        console.log('✓ G. failure isolation: empty-history undo/redo never corrupts subsequent operations');
    }

    // -------------------------------------------------------------
    // H. Structural audit — WorldView.js/WorldNavigationSession.js
    //    wire Undo/Redo the way this milestone intends: reachable
    //    through session.undo()/session.redo() only, via a button
    //    AND the existing keydown handler, with canUndo/canRedo
    //    refreshed on the existing polling cadence, no import of
    //    CommandHistory/storage/persistence in the UI layer, and no
    //    stale event listener surviving unmount.
    // -------------------------------------------------------------
    {
        const SOURCE_ROOT = new URL('../', import.meta.url);
        async function rawSource(relativePath) {
            return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        }
        function codeOnlyLines(source) {
            return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        }

        const worldViewSource = codeOnlyLines(await rawSource('ui/views/WorldView.js'));

        // No second history mechanism, no direct CommandHistory access.
        assert(!/from ['"].*\/CommandHistory\.js['"]/.test(worldViewSource), 'WorldView.js does not import CommandHistory directly');
        assert(!worldViewSource.includes('undoStack') && !worldViewSource.includes('redoStack'), 'WorldView.js invents no undoStack/redoStack of its own');

        // The buttons call session.undo()/session.redo(), nothing deeper.
        assert(worldViewSource.includes('function undoAction()'), 'undoAction() exists');
        assert(worldViewSource.includes('function redoAction()'), 'redoAction() exists');
        const undoFnMatch = worldViewSource.match(/function undoAction\(\)[\s\S]*?\n        \}/);
        const redoFnMatch = worldViewSource.match(/function redoAction\(\)[\s\S]*?\n        \}/);
        assert(undoFnMatch && undoFnMatch[0].includes('session.undo()'), 'undoAction() calls session.undo()');
        assert(redoFnMatch && redoFnMatch[0].includes('session.redo()'), 'redoAction() calls session.redo()');

        // Both the keyboard shortcut and the buttons converge on the same
        // two functions — never a separate keyboard-only or button-only
        // path.
        const onKeyDownMatch = worldViewSource.match(/function onKeyDown\(event\)[\s\S]*?\n        \}/);
        assert(onKeyDownMatch && onKeyDownMatch[0].includes('undoAction()') && onKeyDownMatch[0].includes('redoAction()'),
            'the existing onKeyDown handler invokes the SAME undoAction()/redoAction() the buttons use');
        assert(onKeyDownMatch[0].includes("key === 'z'") && (onKeyDownMatch[0].includes("key === 'y'") || onKeyDownMatch[0].includes('shiftKey')),
            'onKeyDown recognizes Ctrl+Z and a redo variant (Ctrl+Y / Ctrl+Shift+Z)');

        assert(worldViewSource.includes('@click="undoAction"'), 'an Undo button is wired to undoAction');
        assert(worldViewSource.includes('@click="redoAction"'), 'a Redo button is wired to redoAction');

        // canUndo/canRedo are read from the session, on the existing
        // refreshSpatialUI() cadence, never computed locally.
        assert(worldViewSource.includes('session.canUndo()') && worldViewSource.includes('session.canRedo()'),
            'canUndo/canRedo are read straight from the session');
        const refreshFnMatch = worldViewSource.match(/function refreshSpatialUI\(\)[\s\S]*/);
        assert(refreshFnMatch && refreshFnMatch[0].includes('canUndo.value = ') && refreshFnMatch[0].includes('canRedo.value = '),
            'canUndo/canRedo are refreshed inside the existing refreshSpatialUI(), not a separate poll loop');

        // Undo/Redo live in the SAME action bar as Save/Publish/History —
        // no separate surface, and not merged into the History panel
        // itself (Preview/Restore stay a distinct surface from Undo/Redo).
        const actionsBlockMatch = worldViewSource.match(/activeDocumentInfo && activeDocumentInfo\.editable[\s\S]*?<\/div>/);
        assert(actionsBlockMatch && actionsBlockMatch[0].includes('undoAction') && actionsBlockMatch[0].includes('redoAction') && actionsBlockMatch[0].includes('openHistoryPanel'),
            'Undo, Redo, and History buttons all live in the existing editable-document action bar');

        const panelSource = codeOnlyLines(await rawSource('ui/components/HistoryTimelinePanel.js'));
        assert(!panelSource.includes('undoAction') && !panelSource.includes('redoAction') && !panelSource.includes("'undo'") && !panelSource.includes("'redo'"),
            'HistoryTimelinePanel.js gains no undo/redo affordance of its own — Preview/Restore and Undo/Redo remain distinct surfaces');

        // The undo/redo keydown handling is removed on unmount exactly
        // like every other window listener this view installs — the
        // SAME onKeyDown reference used in both addEventListener and
        // removeEventListener, no separate listener installed for this
        // milestone.
        assert(worldViewSource.includes("window.addEventListener('keydown', onKeyDown)"), 'keydown is attached through the existing single listener');
        assert(worldViewSource.includes("window.removeEventListener('keydown', onKeyDown)"), 'the same listener is torn down on unmount — no stale undo/redo shortcut survives');

        const sessionSource = codeOnlyLines(await rawSource('application/WorldNavigationSession.js'));
        assert(/canUndo\(\)\s*\{[\s\S]*?_getActiveCommandHistory\(\)/.test(sessionSource), 'canUndo() delegates to _getActiveCommandHistory(), not a duplicated stack');
        assert(/canRedo\(\)\s*\{[\s\S]*?_getActiveCommandHistory\(\)/.test(sessionSource), 'canRedo() delegates to _getActiveCommandHistory(), not a duplicated stack');
        const canUndoMatch = sessionSource.match(/canUndo\(\)\s*\{[\s\S]*?\n    \}/);
        assert(canUndoMatch && canUndoMatch[0].includes('_historyPreview') && canUndoMatch[0].includes('.active'),
            'canUndo() carries the same _historyPreview.active guard as undo() itself');

        console.log('✓ H. structural audit: single caller path, no duplicated history machinery, listener hygiene');
    }

    console.log('\nAll World View Undo/Redo UI Integration tests passed.');
}

await run();
