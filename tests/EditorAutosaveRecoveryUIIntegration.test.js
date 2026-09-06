import { readFile } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { CommandHistory } from '../application/CommandHistory.js';
import { DocumentManager } from '../application/DocumentManager.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { CreatePersistenceUseCase } from '../application/CreatePersistenceUseCase.js';
import { AutosaveScheduler } from '../application/AutosaveScheduler.js';
import { RecoveryObserver } from '../application/RecoveryObserver.js';
import { LocalRecoveryStore } from '../persistence/LocalRecoveryStore.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { AutosaveDocumentUseCase } from '../application/AutosaveDocumentUseCase.js';
import { CheckRecoveryUseCase } from '../application/CheckRecoveryUseCase.js';
import { RecoverDocumentUseCase } from '../application/RecoverDocumentUseCase.js';
import { DiscardRecoveryUseCase } from '../application/DiscardRecoveryUseCase.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.204 — Editor Autosave & Recovery UI Integration.
//
// 0.9.203 proved AutosaveScheduler/AutosaveDocumentUseCase/
// CheckRecoveryUseCase/RecoverDocumentUseCase/DiscardRecoveryUseCase are
// each individually correct (tests/PersistenceRecovery.test.js) but
// wired to no UI caller at all. This milestone connects them to
// ui/views/EditorView.js through two small additions — AutosaveScheduler
// is unchanged and simply started now, and the new
// application/RecoveryObserver.js gates CheckRecoveryUseCase on document
// identity rather than on every edit.
//
// EditorView.js itself cannot be exercised here: it imports 'vue', which
// this repo's plain `node tests/*.test.js` sweep has no browser/CDN
// runtime to resolve (see index.html's own importmap — Vue is loaded
// from a CDN, never an npm dependency). Every OTHER test file touching a
// View in this repo has the identical constraint and resolves it the
// same way tests/ContextPreservingFork.test.js and
// tests/PersistenceRecovery.test.js already do: exercise the real,
// framework-agnostic application/ collaborators EditorView.js composes,
// in the exact sequence EditorView.js's own new code now runs them.
// Sections A-I below are that sequence; Section J is a structural check
// that the two new UI-facing files never reach around those
// collaborators into storage/persistence directly.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}
function assertThrows(fn, message) {
    try { fn(); assert(false, message); }
    catch (e) { /* expected */ }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() { super(); this._data = new Map(); }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

function createDocument(title = 'Recovery UI Test World') {
    const world = new World();
    const building = new Building({ creator: 'tester' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'tester' }) });
}

function addBrickAt(history, world, x) {
    const buildingId = world.getBuildings()[0].id;
    history.execute(new PlaceBrickCommand({
        worldId: world.id, buildingId,
        definitionId: 'core:cube',
        position: new Position(x, 0.5, 0)
    }));
}

// A DocumentManager wired with a CommandHistory exactly the way
// EditorSession._rebuild() wires one — dirty is computed from the
// history, never set by hand — mirroring tests/PersistenceRecovery.test.js's
// own harness.
function openDocumentInManager(manager, document) {
    manager.load(document, document.world.id);
    const history = new CommandHistory({ world: document.world });
    manager.trackCommandHistory(history);
    return history;
}

function makeFakeTimers() {
    const timers = [];
    const setTimeoutFn = (fn) => { timers.push({ fn, cleared: false }); return timers.length - 1; };
    const clearTimeoutFn = (idx) => { if (timers[idx]) timers[idx].cleared = true; };
    const pendingCount = () => timers.filter((t) => t && !t.cleared).length;
    const flush = () => {
        const pending = timers.filter((t) => t && !t.cleared);
        timers.length = 0;
        pending.forEach((t) => t.fn());
    };
    return { setTimeoutFn, clearTimeoutFn, pendingCount, flush };
}

// The same low-level collaborators CreatePersistenceUseCase composes
// (application/CreatePersistenceUseCase.js), over a caller-owned
// in-memory storage instance instead of the real
// LocalStorageProvider — CreatePersistenceUseCase.execute() itself
// works fine to construct/inspect in plain Node (see Section A), but
// LocalStorageProvider needs `window.localStorage`, which does not
// exist here, so every section that actually EXERCISES autosave/save/
// recover/discard (not merely inspects the composition root's shape)
// uses this instead — the exact same collaborator classes, same
// constructor wiring, just a Node-safe storage backend. Field names
// match CreatePersistenceUseCase.execute()'s own return shape exactly,
// so a caller-owned storage instance also lets a simulated "restart"
// (Section B) reuse the SAME storage across two independent stacks —
// exactly like a fresh page load reusing the browser's own localStorage.
function buildRecoveryStack(storage) {
    const recoveryStore = new LocalRecoveryStore(storage);
    return {
        storageProvider: storage,
        recoveryStore,
        saveDocumentUseCase: new SaveDocumentUseCase(storage, undefined, undefined, recoveryStore),
        autosaveDocumentUseCase: new AutosaveDocumentUseCase(recoveryStore, storage),
        checkRecoveryUseCase: new CheckRecoveryUseCase(recoveryStore, storage),
        recoverDocumentUseCase: new RecoverDocumentUseCase(recoveryStore),
        discardRecoveryUseCase: new DiscardRecoveryUseCase(recoveryStore)
    };
}

async function run() {
    // -------------------------------------------------------------
    // A. Composition-root coherence — CreatePersistenceUseCase returns
    //    one shared recoveryStore/storageProvider, exactly what
    //    EditorView.js now destructures in one call (autosaveDocumentUseCase,
    //    recoverDocumentUseCase, discardRecoveryUseCase, checkRecoveryUseCase
    //    alongside the pre-existing saveDocumentUseCase/loadDocumentUseCase).
    // -------------------------------------------------------------
    {
        // Constructing and inspecting the REAL composition root is safe
        // in plain Node (no localStorage touched yet); actually calling
        // any of its use cases is not — LocalStorageProvider needs
        // `window.localStorage`, which this test environment has no
        // browser/CDN runtime to provide (same reason EditorView.js
        // itself can't be mounted here — see this file's own header).
        // Every section below that needs to actually RUN autosave/save/
        // recover/discard uses buildRecoveryStack() instead, over an
        // in-memory storage — same collaborator classes, same wiring.
        const stack = new CreatePersistenceUseCase().execute();
        for (const key of ['saveDocumentUseCase', 'loadDocumentUseCase', 'autosaveDocumentUseCase',
            'recoverDocumentUseCase', 'discardRecoveryUseCase', 'checkRecoveryUseCase', 'recoveryStore']) {
            assert(stack[key], `CreatePersistenceUseCase exposes ${key}`);
        }
        // Reference equality (not merely "both defined") proves
        // autosaveDocumentUseCase and checkRecoveryUseCase were built
        // over the SAME recoveryStore instance, never two independent
        // ones that happen to agree by coincidence.
        assert(stack.autosaveDocumentUseCase._recoveryStore === stack.recoveryStore,
            'autosaveDocumentUseCase shares the exact recoveryStore instance CreatePersistenceUseCase exposes');
        assert(stack.checkRecoveryUseCase._recoveryStore === stack.recoveryStore,
            'checkRecoveryUseCase shares the exact recoveryStore instance CreatePersistenceUseCase exposes');
        assert(stack.recoverDocumentUseCase._recoveryStore === stack.recoveryStore,
            'recoverDocumentUseCase shares the exact recoveryStore instance CreatePersistenceUseCase exposes');
        assert(stack.discardRecoveryUseCase._recoveryStore === stack.recoveryStore,
            'discardRecoveryUseCase shares the exact recoveryStore instance CreatePersistenceUseCase exposes');
        console.log('✓ A. composition-root coherence');
    }

    // -------------------------------------------------------------
    // B. FLAGSHIP — open -> edit -> autosave (via AutosaveScheduler) ->
    //    simulated app restart -> RecoveryObserver detects it (via
    //    CheckRecoveryUseCase) -> Recover (via RecoverDocumentUseCase +
    //    manager.load + manager.markDirty, exactly EditorView.js's own
    //    recoverDocument()) -> content restored, marked dirty, ready to
    //    Save.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);

        const doc = createDocument('Flagship');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);

        // Explicit save first, so a later "offered" recovery is
        // meaningfully NEWER than a real saved baseline (0.2.6's own
        // "newer than the last save" rule — see CheckRecoveryUseCase).
        stack.saveDocumentUseCase.execute(manager);

        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            delay: 100, setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();

        addBrickAt(history, doc.world, 4);
        assert(manager.state.dirty, 'edit dirties the document');
        timers.flush();
        assert(stack.checkRecoveryUseCase.execute(id).available, 'autosave checkpoint newer than the save is now offered');
        const editedBrickCount = doc.world.getBuildings()[0].getBricks().length;

        scheduler.stop();

        // ---- simulate closing the Editor and reopening it (fresh
        //      DocumentManager + fresh RecoveryObserver, SAME storage) ----
        // Reopen from the CANONICAL SAVED bytes on disk, not the live
        // in-memory `doc` (which the edit above already mutated
        // in-place) — exactly what LoadDocumentUseCase.execute() does:
        // storage -> DocumentSerializer.deserialize() -> a fresh
        // Document that has NOT seen the autosaved edit yet.
        const serializer = new DocumentSerializer();
        const reopenedDoc = serializer.deserialize(storage.load(id));
        const manager2 = new DocumentManager();
        manager2.load(reopenedDoc, id);
        assert(manager2.document.world.getBuildings()[0].getBricks().length === 1,
            'sanity: the reopened document reflects the SAVED state, not the autosaved edit');
        let observedStatus = null;
        const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager2, {
            onChange: (status) => { observedStatus = status; }
        });
        observer.start();
        assert(observedStatus && observedStatus.available, 'RecoveryObserver offers the checkpoint on open');
        assert(observedStatus.documentId === id, 'offered checkpoint names the reopened document');

        // ---- Recover — exactly EditorView.js's own recoverDocument() ----
        const { document: recovered, revision } = stack.recoverDocumentUseCase.execute(observedStatus.documentId);
        assert(revision >= 1, 'recovered a real revision');
        manager2.load(recovered, id);
        manager2.markDirty();
        observer.clear();
        assert(observedStatus === null, 'observer.clear() resolves the offered status immediately');
        assert(manager2.document.world.getBuildings()[0].getBricks().length === editedBrickCount,
            'recovered document carries the autosaved edit');
        assert(manager2.state.dirty === true, 'recovered content is NOT the same as the last save — stays dirty');

        // Explicit save now supersedes the checkpoint, exactly like any
        // ordinary edit -> save.
        stack.saveDocumentUseCase.execute(manager2);
        assert(!stack.checkRecoveryUseCase.execute(id).available, 'saving the recovered content clears the offer for good');
        observer.stop();
        console.log('✓ B. flagship: open -> edit -> autosave -> reopen -> recover -> save');
    }

    // -------------------------------------------------------------
    // C. No autosave without relevant edits — open, close, nothing
    //    written; and no recovery is ever offered for a document that
    //    was never dirtied.
    // -------------------------------------------------------------
    {
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('Untouched');
        const id = doc.world.id;
        const manager = new DocumentManager();
        openDocumentInManager(manager, doc);

        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        let lastStatus = 'unset';
        const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager, {
            onChange: (status) => { lastStatus = status; }
        });
        scheduler.start();
        observer.start();
        // "close" without ever editing.
        scheduler.stop();
        observer.stop();

        assert(timers.pendingCount() === 0, 'no autosave was ever scheduled without a dirtying edit');
        assert(!stack.checkRecoveryUseCase.execute(id).available, 'no checkpoint was ever manufactured');
        assert(lastStatus === null, 'observer never reported a recovery offer for a document with no edits');
        console.log('✓ C. no autosave, no recovery artifact, without edits');
    }

    // -------------------------------------------------------------
    // D. Discard — recovery detected, Discard removes the checkpoint,
    //    the currently open (unrecovered) document is completely
    //    untouched. Mirrors EditorView.js's own discardRecovery().
    // -------------------------------------------------------------
    {
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('Discard Me');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);
        const savedBlobBefore = JSON.stringify(stack.storageProvider.load(id));

        addBrickAt(history, doc.world, 9);
        stack.autosaveDocumentUseCase.execute(manager);
        assert(stack.recoveryStore.exists(id), 'checkpoint exists before discard');

        let status = null;
        const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager, {
            onChange: (s) => { status = s; }
        });
        observer.start();
        assert(status && status.available, 'discard scenario: recovery is offered first');

        stack.discardRecoveryUseCase.execute(status.documentId);
        observer.clear();
        assert(status === null, 'observer status clears on discard');
        assert(!stack.recoveryStore.exists(id), 'checkpoint actually removed from storage');
        assert(JSON.stringify(stack.storageProvider.load(id)) === savedBlobBefore,
            'the saved document itself is byte-for-byte untouched by discard');
        observer.stop();
        console.log('✓ D. discard removes the checkpoint, saved document untouched');
    }

    // -------------------------------------------------------------
    // E. Multiple documents isolated — one RecoveryObserver instance,
    //    switching between two open documents, never confuses which
    //    checkpoint belongs to which id, and checking one never
    //    discards/alters the other's.
    // -------------------------------------------------------------
    {
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const docA = createDocument('Doc A');
        const docB = createDocument('Doc B');
        const idA = docA.world.id;
        const manager = new DocumentManager();

        // Doc A: saved, then autosaved past the save -> recoverable.
        const historyA = openDocumentInManager(manager, docA);
        stack.saveDocumentUseCase.execute(manager);
        addBrickAt(historyA, docA.world, 2);
        stack.autosaveDocumentUseCase.execute(manager);
        assert(stack.recoveryStore.exists(idA), 'Doc A has a checkpoint');

        // Switch to Doc B in the SAME manager (a Load replacing what's
        // open) — Doc B has never been saved or autosaved.
        openDocumentInManager(manager, docB);

        const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager);
        observer.start();
        assert(observer.status === null, 'Doc B (no checkpoint) offers nothing when opened');
        assert(stack.recoveryStore.exists(idA), 'switching to Doc B never touched Doc A checkpoint');

        // Switch back to Doc A — the SAME observer re-probes on the
        // identity change and now offers it.
        openDocumentInManager(manager, docA);
        assert(observer.status && observer.status.available, 'switching back to Doc A offers its own checkpoint');
        assert(observer.status.documentId === idA, 'offered checkpoint names Doc A, not Doc B');
        observer.stop();
        console.log('✓ E. multiple documents stay isolated under one observer');
    }

    // -------------------------------------------------------------
    // F. Repeated "mounting" never creates duplicate schedulers/
    //    observers — start() called multiple times subscribes once; a
    //    single edit still only ever produces ONE scheduled autosave,
    //    and a same-identity state change never re-probes recovery.
    // -------------------------------------------------------------
    {
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('Repeated Mount');
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);

        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        scheduler.start(); // simulates a second onMounted() firing on the same instance
        scheduler.start();

        addBrickAt(history, doc.world, 1);
        assert(timers.pendingCount() === 1, `a single edit must schedule exactly one autosave regardless of repeated start() (got ${timers.pendingCount()})`);
        scheduler.stop();

        let checkCalls = 0;
        const countingCheck = {
            execute: (id) => { checkCalls += 1; return stack.checkRecoveryUseCase.execute(id); }
        };
        const observer = new RecoveryObserver(countingCheck, manager);
        observer.start();
        observer.start();
        observer.start();
        assert(checkCalls === 1, `repeated start() must not re-probe the same document more than once (got ${checkCalls})`);

        manager.markDirty(); // a same-identity state change — must NOT re-probe
        assert(checkCalls === 1, 'a dirty-state change on the SAME document never re-triggers the recovery probe');
        observer.stop();
        console.log('✓ F. repeated start() is idempotent for both scheduler and observer');
    }

    // -------------------------------------------------------------
    // G. Unmount cleanup — stop() on both means an old scheduler/
    //    observer cannot go on producing autosaves or recovery
    //    probes, even though the SAME DocumentManager instance goes on
    //    changing underneath them (a later document swap after
    //    "unmount").
    // -------------------------------------------------------------
    {
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('Unmount Me');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);

        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        let changeCount = 0;
        const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager, {
            onChange: () => { changeCount += 1; }
        });
        scheduler.start();
        observer.start();
        const changeCountAtMount = changeCount;

        // "unmount"
        scheduler.stop();
        observer.stop();

        // Further activity on the SAME manager, as if a stray reference
        // survived — the old scheduler/observer must not react.
        addBrickAt(history, doc.world, 5);
        timers.flush();
        assert(!stack.recoveryStore.exists(id), 'a stopped scheduler writes no checkpoint for a post-unmount edit');

        const otherDoc = createDocument('Swapped In After Unmount');
        openDocumentInManager(manager, otherDoc);
        assert(changeCount === changeCountAtMount, 'a stopped observer never reacts to a later document swap');
        console.log('✓ G. unmount stops both scheduler and observer for good');
    }

    // -------------------------------------------------------------
    // H. Recovery failure isolation — a checkpoint that was offered
    //    (passed CheckRecoveryUseCase's own integrity gate) but becomes
    //    corrupted before Recover actually runs must throw, and must
    //    leave the CURRENTLY open document/manager state completely
    //    untouched — exactly what EditorView.js's own try/catch around
    //    recoverDocumentUseCase.execute() relies on.
    // -------------------------------------------------------------
    {
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('Failure Isolation');
        const id = doc.world.id;
        const manager = new DocumentManager();
        openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);
        manager.markDirty();
        stack.autosaveDocumentUseCase.execute(manager);

        let status = null;
        const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager, {
            onChange: (s) => { status = s; }
        });
        observer.start();
        assert(status && status.available, 'checkpoint offered before it is corrupted');

        // Corrupt the stored checkpoint's content without touching its
        // recorded hash — RecoverDocumentUseCase's own integrity check
        // (unchanged by this milestone) must reject it.
        const raw = stack.storageProvider.load(`recovery:${id}`);
        raw.document.world.buildings[0].bricks[0].position.x = 'NOT-A-NUMBER';
        stack.storageProvider.save(`recovery:${id}`, raw);

        const managerStateBefore = JSON.stringify(manager.state);
        const documentBefore = manager.document;
        assertThrows(() => stack.recoverDocumentUseCase.execute(status.documentId),
            'a corrupted checkpoint must throw rather than silently produce a bad document');
        assert(manager.document === documentBefore, 'the currently open document reference is untouched by the failed recovery');
        assert(JSON.stringify(manager.state) === managerStateBefore, 'manager state is untouched by the failed recovery');
        observer.stop();
        console.log('✓ H. a failed recovery never disturbs the currently open document');
    }

    // -------------------------------------------------------------
    // I. Existing editor save behavior remains unchanged — an explicit
    //    Save still works exactly as before with a scheduler/observer
    //    attached and actively running alongside it.
    // -------------------------------------------------------------
    {
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('Save Still Works');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);

        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager);
        scheduler.start();
        observer.start();

        addBrickAt(history, doc.world, 7);
        stack.saveDocumentUseCase.execute(manager);
        assert(!manager.state.dirty, 'save still clears dirty with the new wiring attached');
        assert(stack.storageProvider.load(id) !== null, 'save still writes the canonical document');
        scheduler.stop();
        observer.stop();
        console.log('✓ I. explicit Save behaves exactly as before');
    }

    // -------------------------------------------------------------
    // J. Structural check — neither RecoveryBanner.js nor
    //    RecoveryObserver.js reaches around the existing use-case
    //    boundary into storage/persistence directly. RecoveryObserver
    //    depends only on a passed-in CheckRecoveryUseCase-shaped
    //    collaborator and DocumentManager; RecoveryBanner is pure
    //    presentation.
    // -------------------------------------------------------------
    {
        const SOURCE_ROOT = new URL('../', import.meta.url);
        async function rawSource(relativePath) {
            return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        }
        function codeOnlyLines(source) {
            return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        }

        const bannerSource = codeOnlyLines(await rawSource('ui/components/RecoveryBanner.js'));
        assert(!/from ['"].*\/(storage|persistence)\//.test(bannerSource),
            'RecoveryBanner.js imports nothing from storage/ or persistence/');
        assert(!bannerSource.includes('RecoverDocumentUseCase') && !bannerSource.includes('DiscardRecoveryUseCase'),
            'RecoveryBanner.js never calls a recovery use case itself — it only emits recover/discard');

        const observerSource = codeOnlyLines(await rawSource('application/RecoveryObserver.js'));
        assert(!/from ['"].*\/(storage|persistence)\//.test(observerSource),
            'RecoveryObserver.js imports nothing from storage/ or persistence/ — only the injected use case');
        assert(!observerSource.includes('import '),
            'RecoveryObserver.js has zero imports — it depends only on constructor-injected collaborators');

        const editorViewSource = codeOnlyLines(await rawSource('ui/views/EditorView.js'));
        assert(!/from ['"].*\/storage\//.test(editorViewSource),
            'EditorView.js still never imports storage/ directly (goes through CreatePersistenceUseCase)');
        console.log('✓ J. no direct storage manipulation from the UI layer');
    }

    console.log('\nAll Editor Autosave & Recovery UI Integration tests passed.');
}

await run();
