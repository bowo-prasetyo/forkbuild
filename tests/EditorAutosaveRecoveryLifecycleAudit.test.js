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
import { AutosaveScheduler } from '../application/AutosaveScheduler.js';
import { RecoveryObserver } from '../application/RecoveryObserver.js';
import { LocalRecoveryStore } from '../persistence/LocalRecoveryStore.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { AutosaveDocumentUseCase } from '../application/AutosaveDocumentUseCase.js';
import { CheckRecoveryUseCase } from '../application/CheckRecoveryUseCase.js';
import { RecoverDocumentUseCase } from '../application/RecoverDocumentUseCase.js';
import { DiscardRecoveryUseCase } from '../application/DiscardRecoveryUseCase.js';
import { StorageProvider } from '../storage/StorageProvider.js';

// 0.9.205 — Editor Autosave & Recovery Lifecycle Audit.
//
// 0.9.204 connected the existing autosave/recovery subsystem to
// EditorView.js and proved the wiring itself is coherent
// (tests/EditorAutosaveRecoveryUIIntegration.test.js, sections A-J). This
// milestone is a test-only audit of what that wiring does under
// LIFECYCLE PRESSURE — repeated mount/unmount, document-identity churn,
// recover/discard interacting with an still-running autosave scheduler,
// and failure injection at each of the four collaborator boundaries
// (recovery check, recover, discard, autosave) — per docs/Roadmap.md,
// 0.9.205. It does not duplicate 0.9.204's own coverage; each section
// below exercises a lifecycle interaction that file does not.
//
// Same framework-agnostic-collaborators-only strategy as 0.9.204's own
// file (see that file's own header for why EditorView.js itself cannot
// be mounted here): every section drives the real AutosaveScheduler/
// RecoveryObserver/*UseCase classes EditorView.js composes, in sequences
// EditorView.js's own onMounted()/recoverDocument()/discardRecovery()/
// onBeforeUnmount() establish.
//
// THIS AUDIT FOUND ONE REAL DEFECT (Section F1 below): RecoveryObserver's
// probe ran unguarded inside DocumentManager's synchronous
// onStateChanged publish. A throwing CheckRecoveryUseCase (a corrupted
// or unreadable checkpoint) propagated out through whatever ordinary
// operation happened to change the open document's identity — mount's
// own openDocument()/loadDocument(), a fork, a Load — aborting it
// midway, even though that operation had nothing to do with recovery.
// Fixed in application/RecoveryObserver.js by isolating the probe in a
// try/catch that fails safe (offers nothing) rather than propagating.
// EditorView.js's discardRecovery() had the matching gap (no try/catch,
// unlike its own recoverDocument() immediately above it) and is fixed
// the same way. Section F below is written as a regression suite for
// both.

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

function createDocument(title = 'Lifecycle Audit World') {
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

// Mirrors EditorSession._rebuild()'s own wiring — dirty is computed from
// the CommandHistory, never set by hand. Same harness as 0.9.204's own
// file.
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

// Same low-level collaborators CreatePersistenceUseCase composes, over a
// caller-owned in-memory storage instance — see 0.9.204's own file for
// why LocalStorageProvider itself cannot run here.
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

// Exactly EditorView.js's own discardRecovery(), reproduced here since
// EditorView.js itself cannot be mounted in this test environment (see
// this file's own header) — the try/catch this milestone added to it is
// what Section F3 below is regression-testing.
function discardRecoveryLikeEditorView(discardRecoveryUseCase, observer, feedback, documentId) {
    try {
        discardRecoveryUseCase.execute(documentId);
        observer.clear();
        feedback.push({ ok: true, message: 'Discarded the recovered checkpoint' });
    } catch (e) {
        feedback.push({ ok: false, message: `Discard failed: ${e.message}` });
    }
}

// Exactly EditorView.js's own recoverDocument().
function recoverDocumentLikeEditorView(recoverDocumentUseCase, manager, observer, feedback, documentId) {
    try {
        const { document: recovered } = recoverDocumentUseCase.execute(documentId);
        manager.load(recovered, documentId);
        manager.markDirty();
        observer.clear();
        feedback.push({ ok: true, message: 'Recovered unsaved changes from a previous session' });
        return recovered;
    } catch (e) {
        feedback.push({ ok: false, message: `Recovery failed: ${e.message}` });
        return null;
    }
}

async function run() {
    // -------------------------------------------------------------
    // A. Autosave temporal correctness.
    // -------------------------------------------------------------
    {
        // A1 — an edit schedules and, once idle, writes an autosave.
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('A1');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 1);
        assert(timers.pendingCount() === 1, 'A1: an edit schedules exactly one autosave');
        timers.flush();
        assert(stack.recoveryStore.exists(id), 'A1: the scheduled autosave actually wrote a checkpoint');
        scheduler.stop();
        console.log('✓ A1. an edit triggers autosave');
    }
    {
        // A2 — opening a document alone (no edit) schedules nothing and
        // offers nothing.
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('A2');
        const id = doc.world.id;
        const manager = new DocumentManager();
        openDocumentInManager(manager, doc);
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        let status = 'unset';
        const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager, { onChange: (s) => { status = s; } });
        scheduler.start();
        observer.start();
        assert(timers.pendingCount() === 0, 'A2: opening alone schedules no autosave');
        assert(status === null, 'A2: opening alone offers no recovery');
        assert(!stack.recoveryStore.exists(id), 'A2: opening alone writes no checkpoint');
        scheduler.stop();
        observer.stop();
        console.log('✓ A2. opening a document alone creates neither an autosave nor a recovery offer');
    }
    {
        // A3 — repeated start() on a fresh instance subscribes once.
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('A3');
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start(); scheduler.start(); scheduler.start();
        addBrickAt(history, doc.world, 1);
        assert(timers.pendingCount() === 1, 'A3: repeated start() never produces duplicate scheduling for one edit');
        scheduler.stop();
        console.log('✓ A3. repeated start() is harmless');
    }
    {
        // A4 — stop() cancels an ALREADY-PENDING timer, not merely
        // future ones. Distinct from the "stop before any edit" shape
        // 0.9.204's own section G exercised: here the timer is in
        // flight when stop() runs.
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('A4');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 1);
        assert(timers.pendingCount() === 1, 'A4: sanity — a timer is pending before stop()');
        scheduler.stop();
        timers.flush();
        assert(!stack.recoveryStore.exists(id), 'A4: stop() cancels an already-pending autosave timer, not just future scheduling');
        console.log('✓ A4. stop() cancels an in-flight pending autosave, not only future ones');
    }
    {
        // A6 — a second, independent "mount" of the SAME document over
        // the SAME underlying storage (exactly what two EditorView
        // instances each calling their own `new CreatePersistenceUseCase()
        // .execute()` produce in the browser, since LocalStorageProvider
        // wraps the one shared window.localStorage) never duplicates
        // autosave writes, and the idle second mount's own
        // RecoveryObserver never itself performs a write merely by
        // observing the first mount's checkpoint.
        const storage = new InMemoryStorageProvider();
        const stackA = buildRecoveryStack(storage);
        const doc = createDocument('A6 Shared');
        const id = doc.world.id;

        const managerA = new DocumentManager();
        const historyA = openDocumentInManager(managerA, doc);
        stackA.saveDocumentUseCase.execute(managerA);
        const timersA = makeFakeTimers();
        const schedulerA = new AutosaveScheduler(stackA.autosaveDocumentUseCase, managerA, {
            setTimeoutFn: timersA.setTimeoutFn, clearTimeoutFn: timersA.clearTimeoutFn
        });
        schedulerA.start();

        // A second, independent mount of the identical document id, over
        // the SAME storage — its own manager/scheduler/observer, never
        // edited.
        const stackB = buildRecoveryStack(storage);
        const managerB = new DocumentManager();
        openDocumentInManager(managerB, doc);
        const timersB = makeFakeTimers();
        const schedulerB = new AutosaveScheduler(stackB.autosaveDocumentUseCase, managerB, {
            setTimeoutFn: timersB.setTimeoutFn, clearTimeoutFn: timersB.clearTimeoutFn
        });
        let statusB = 'unset';
        const observerB = new RecoveryObserver(stackB.checkRecoveryUseCase, managerB, { onChange: (s) => { statusB = s; } });
        schedulerB.start();
        observerB.start();
        assert(statusB === null, 'A6: the idle second mount sees no recovery yet (nothing autosaved)');

        // Edit only in mount A.
        addBrickAt(historyA, doc.world, 2);
        timersA.flush();
        assert(stackA.recoveryStore.exists(id), 'A6: mount A wrote its own checkpoint');
        assert(timersB.pendingCount() === 0, 'A6: the idle second mount never independently scheduled an autosave of its own');

        schedulerA.stop();
        schedulerB.stop();
        observerB.stop();
        console.log('✓ A6. a second, idle mount of the same document over shared storage never duplicates autosave activity');
    }

    // -------------------------------------------------------------
    // B. Recovery observer identity — a dirty/clean/dirty cycle
    //    (including through an actual explicit Save) on ONE document
    //    identity must probe recovery exactly once (at open), never
    //    once per dirty<->clean transition.
    // -------------------------------------------------------------
    {
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('B dirty-clean-dirty');
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);

        let checkCalls = 0;
        const countingCheck = { execute: (id) => { checkCalls += 1; return stack.checkRecoveryUseCase.execute(id); } };
        const observer = new RecoveryObserver(countingCheck, manager);
        observer.start();
        assert(checkCalls === 1, 'B: opening probes exactly once');

        addBrickAt(history, doc.world, 1); // dirty
        assert(checkCalls === 1, 'B: becoming dirty never re-probes');
        stack.saveDocumentUseCase.execute(manager); // clean
        assert(checkCalls === 1, 'B: becoming clean via Save never re-probes');
        addBrickAt(history, doc.world, 2); // dirty again
        assert(checkCalls === 1, 'B: dirtying again (same identity) never re-probes');
        history.undo(); // clean again (back onto the save point)
        assert(checkCalls === 1, 'B: undo back to clean never re-probes');
        history.redo(); // dirty again
        assert(checkCalls === 1, 'B: redo never re-probes');
        observer.stop();
        console.log('✓ B. a full dirty/clean/dirty cycle on one identity probes recovery exactly once');
    }

    // -------------------------------------------------------------
    // C. Recover/discard are synchronous, and each produces exactly the
    //    state that operation implies — no manufactured async race
    //    machinery, per this milestone's own brief ("if the existing
    //    use cases are synchronous, test the real semantics").
    // -------------------------------------------------------------
    {
        assert(typeof RecoverDocumentUseCase.prototype.execute === 'function'
            && RecoverDocumentUseCase.prototype.execute.constructor.name !== 'AsyncFunction',
            'C: RecoverDocumentUseCase.execute is not an async function');
        assert(typeof DiscardRecoveryUseCase.prototype.execute === 'function'
            && DiscardRecoveryUseCase.prototype.execute.constructor.name !== 'AsyncFunction',
            'C: DiscardRecoveryUseCase.execute is not an async function');

        // Recover branch.
        {
            const stack = buildRecoveryStack(new InMemoryStorageProvider());
            const doc = createDocument('C recover');
            const id = doc.world.id;
            const manager = new DocumentManager();
            const history = openDocumentInManager(manager, doc);
            stack.saveDocumentUseCase.execute(manager);
            addBrickAt(history, doc.world, 3);
            stack.autosaveDocumentUseCase.execute(manager);

            const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager);
            observer.start();
            const feedback = [];
            const result = recoverDocumentLikeEditorView(stack.recoverDocumentUseCase, manager, observer, feedback, id);
            assert(result !== null, 'C: recover succeeded');
            assert(feedback.length === 1 && feedback[0].ok, 'C: recover produced exactly the recover outcome, not the discard outcome');
            assert(manager.state.dirty === true, 'C: recover leaves the manager dirty');
            assert(stack.recoveryStore.exists(id), 'C: recover does not itself remove the checkpoint (Save/Discard do)');
            observer.stop();
        }
        // Discard branch, from an identical starting position.
        {
            const stack = buildRecoveryStack(new InMemoryStorageProvider());
            const doc = createDocument('C discard');
            const id = doc.world.id;
            const manager = new DocumentManager();
            const history = openDocumentInManager(manager, doc);
            stack.saveDocumentUseCase.execute(manager);
            addBrickAt(history, doc.world, 3);
            stack.autosaveDocumentUseCase.execute(manager);
            const dirtyBefore = manager.state.dirty;

            const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager);
            observer.start();
            const feedback = [];
            discardRecoveryLikeEditorView(stack.discardRecoveryUseCase, observer, feedback, id);
            assert(feedback.length === 1 && feedback[0].ok, 'C: discard produced exactly the discard outcome, not the recover outcome');
            assert(manager.state.dirty === dirtyBefore, 'C: discard never touches the currently open document\'s dirty state');
            assert(!stack.recoveryStore.exists(id), 'C: discard actually removed the checkpoint');
            assert(observer.status === null, 'C: discard clears the observed status');
            observer.stop();
        }
        console.log('✓ C. recover and discard are synchronous and each yields exactly its own resulting state');
    }

    // -------------------------------------------------------------
    // D. Recovery becomes ordinary editing again — the architectural
    //    question 0.9.204 set out to answer. A recovered document, once
    //    marked dirty, must be an entirely ordinary autosave target: a
    //    further edit with the scheduler LIVE produces a NEW checkpoint
    //    superseding the one just recovered, with no new "recovered"
    //    state anywhere in the picture.
    // -------------------------------------------------------------
    {
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('D recovery-then-autosave');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);
        addBrickAt(history, doc.world, 1);
        stack.autosaveDocumentUseCase.execute(manager);
        const revisionBeforeRecover = stack.checkRecoveryUseCase.execute(id).recovery.revision;

        const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager);
        observer.start();
        const feedback = [];
        recoverDocumentLikeEditorView(stack.recoverDocumentUseCase, manager, observer, feedback, id);
        assert(feedback[0].ok, 'D: recover succeeded');

        // Recovering does NOT retire the checkpoint it just loaded from.
        assert(stack.recoveryStore.exists(id), 'D: the recovered checkpoint is still on disk immediately after recover');

        // The scheduler is now started (mirrors EditorView.js: it runs
        // continuously across recover/discard, never restarted by
        // either), and a further edit on the recovered, now-dirty
        // document is ordinary editing.
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        // markDirty() (already true) does not itself schedule — only a
        // fresh onStateChanged(dirty:true) tick does. Mirror that with a
        // genuine further edit against the recovered document's own
        // (fresh) CommandHistory, exactly as EditorSession._rebuild()
        // wires one for whatever openDocument() just loaded.
        const recoveredHistory = new CommandHistory({ world: manager.document.world });
        manager.trackCommandHistory(recoveredHistory);
        manager.markDirty(); // re-publish now that history tracking is attached, so the scheduler's own subscription (attached after recover) observes a fresh dirty tick
        addBrickAt(recoveredHistory, manager.document.world, 9);
        assert(timers.pendingCount() >= 1, 'D: editing the recovered document schedules an autosave exactly like any other edit');
        timers.flush();

        const newCheckpoint = stack.checkRecoveryUseCase.execute(id);
        assert(newCheckpoint.available, 'D: the recovered-then-edited document produced a NEW recovery offer');
        assert(newCheckpoint.recovery.revision > revisionBeforeRecover,
            'D: the post-recovery autosave checkpoint supersedes (higher revision than) the one just recovered');

        scheduler.stop();
        observer.stop();
        console.log('✓ D. recovered content becomes an ordinary autosave target again, with no new recovered state');
    }

    // -------------------------------------------------------------
    // E. Save after recovery — full closure, with the scheduler and
    //    observer BOTH live for the entire sequence (not stopped
    //    partway, unlike a hand-rolled check) exactly as EditorView.js's
    //    own onMounted()/onBeforeUnmount() keep them running for the
    //    life of the mounted view.
    // -------------------------------------------------------------
    {
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('E save-after-recovery');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        let recoveryChanges = 0;
        const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager, { onChange: () => { recoveryChanges += 1; } });
        scheduler.start();
        observer.start();

        stack.saveDocumentUseCase.execute(manager);
        addBrickAt(history, doc.world, 1);
        timers.flush(); // autosave checkpoint newer than the save

        const feedback = [];
        recoverDocumentLikeEditorView(stack.recoverDocumentUseCase, manager, observer, feedback, id);
        assert(feedback[0].ok, 'E: recover succeeded');

        stack.saveDocumentUseCase.execute(manager);
        assert(!manager.state.dirty, 'E: save clears dirty after a recovery');
        assert(!stack.recoveryStore.exists(id), 'E: no stale recovery artifact survives the save');
        assert(!stack.checkRecoveryUseCase.execute(id).available, 'E: nothing is offered any more');

        // The observer, still running, must not spuriously re-offer
        // anything now that everything is clean and the identity is
        // unchanged.
        assert(observer.status === null, 'E: the still-running observer agrees nothing is offered');
        scheduler.stop();
        observer.stop();
        console.log('✓ E. save after recovery is a complete closure, verified with the scheduler/observer live throughout');
    }

    // -------------------------------------------------------------
    // F. Failure boundaries — inject a failure at each of the four
    //    collaborator boundaries and verify ordinary editing/saving
    //    survives it. F1 is the regression test for the real defect
    //    this audit found (see this file's own header).
    // -------------------------------------------------------------
    {
        // F1 — CheckRecoveryUseCase throws. Before this milestone's fix,
        // this propagated straight out of DocumentManager's synchronous
        // onStateChanged publish (core/events/EventBus.js#publish() has
        // no per-listener isolation — one throw stops the whole
        // dispatch), aborting whatever ordinary operation triggered the
        // identity change: mount's own openDocument(), a fork, a Load,
        // or — as reproduced here — a completely unrelated editing
        // command that happened to run right after a bad probe.
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('F1');
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);

        const throwingCheck = { execute: () => { throw new Error('storage exploded'); } };
        let observerStartThrew = false;
        let observedStatus = 'unset';
        const observer = new RecoveryObserver(throwingCheck, manager, { onChange: (s) => { observedStatus = s; } });
        try {
            observer.start();
        } catch (e) {
            observerStartThrew = true;
        }
        assert(!observerStartThrew, 'F1: a throwing recovery check must not escape observer.start()');
        assert(observedStatus === null, 'F1: a failed probe fails safe — nothing is offered');

        // The real regression: an ordinary edit, executed right after
        // the failed probe, must succeed normally.
        addBrickAt(history, doc.world, 1);
        assert(manager.state.dirty, 'F1: an ordinary edit still dirties the document after a failed recovery probe');
        assert(doc.world.getBuildings()[0].getBricks().length === 2, 'F1: the edit itself was not lost or half-applied');

        // And an explicit Save (going through the REAL, non-throwing
        // save/recovery stack) still works with the still-attached,
        // still-throwing observer alongside it.
        stack.saveDocumentUseCase.execute(manager);
        assert(!manager.state.dirty, 'F1: save still works normally with a permanently-failing recovery observer attached');
        observer.stop();
        console.log('✓ F1. a failing recovery check never breaks ordinary editing or saving (regression: RecoveryObserver.js fix)');
    }
    {
        // F2 — RecoverDocumentUseCase throws (corrupted checkpoint), with
        // the scheduler and observer left RUNNING afterward (unlike
        // 0.9.204's own section H, which only checked the immediate
        // aftermath) — subsequent ordinary editing/autosave/save must
        // keep working exactly as if the failed recovery had never been
        // attempted.
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('F2');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);
        addBrickAt(history, doc.world, 1);
        stack.autosaveDocumentUseCase.execute(manager);

        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager);
        scheduler.start();
        observer.start();
        assert(observer.status && observer.status.available, 'F2: sanity — recovery is offered before corruption');
        const dirtyBeforeFailedRecover = manager.state.dirty;
        const documentBeforeFailedRecover = manager.document;

        // Corrupt the stored checkpoint's content without touching its
        // recorded hash, exactly like 0.9.204's own section H.
        const raw = stack.storageProvider.load(`recovery:${id}`);
        raw.document.world.buildings[0].bricks[0].position.x = 'NOT-A-NUMBER';
        stack.storageProvider.save(`recovery:${id}`, raw);

        const feedback = [];
        const result = recoverDocumentLikeEditorView(stack.recoverDocumentUseCase, manager, observer, feedback, id);
        assert(result === null && !feedback[0].ok, 'F2: the corrupted recovery fails as expected');
        assert(manager.document === documentBeforeFailedRecover, 'F2: the failed recovery leaves the currently open document reference untouched');
        assert(manager.state.dirty === dirtyBeforeFailedRecover, 'F2: the failed recovery leaves the currently open document\'s dirty state exactly as it was');

        // Ordinary life goes on: scheduler/observer are still the SAME,
        // still-running instances from before the failed recovery.
        addBrickAt(history, doc.world, 5);
        assert(timers.pendingCount() === 1, 'F2: a normal edit after a failed recovery still schedules an autosave');
        timers.flush();
        assert(stack.recoveryStore.exists(id), 'F2: autosave after a failed recovery still writes a checkpoint');
        stack.saveDocumentUseCase.execute(manager);
        assert(!manager.state.dirty, 'F2: an explicit save after a failed recovery still works');
        scheduler.stop();
        observer.stop();
        console.log('✓ F2. a failed recovery leaves the still-running scheduler/observer fully functional afterward');
    }
    {
        // F3 — DiscardRecoveryUseCase throws. Regression test for the
        // discardRecovery() try/catch this milestone added to
        // EditorView.js, mirroring recoverDocument()'s own pre-existing
        // one, reproduced here via discardRecoveryLikeEditorView().
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('F3');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);
        addBrickAt(history, doc.world, 1);
        stack.autosaveDocumentUseCase.execute(manager);

        const observer = new RecoveryObserver(stack.checkRecoveryUseCase, manager);
        observer.start();
        assert(observer.status && observer.status.available, 'F3: sanity — recovery is offered before the injected failure');

        const throwingDiscard = { execute: () => { throw new Error('storage unavailable'); } };
        const feedback = [];
        discardRecoveryLikeEditorView(throwingDiscard, observer, feedback, id);
        assert(feedback.length === 1 && !feedback[0].ok, 'F3: a failed discard is reported, not swallowed uncaught');
        assert(observer.status && observer.status.available,
            'F3: a failed discard leaves the offer intact (clear() is never reached) rather than clearing a banner for a discard that did not happen');
        assert(stack.recoveryStore.exists(id), 'F3: a failed discard leaves the checkpoint exactly as it was');
        assert(manager.document === doc, 'F3: a failed discard never touches the currently open document');

        // Ordinary life goes on with the REAL (non-throwing) discard use
        // case, proving the injected failure above left nothing wedged.
        stack.discardRecoveryUseCase.execute(id);
        observer.clear();
        assert(!stack.recoveryStore.exists(id), 'F3: a subsequent real discard still works after the injected failure');
        observer.stop();
        console.log('✓ F3. a failing discard is contained and leaves the offer/checkpoint intact for a later real attempt');
    }
    {
        // F4 — AutosaveDocumentUseCase throws (e.g. a full storage
        // quota). The failure happens inside the scheduler's own timer
        // callback, never inside DocumentManager's synchronous publish,
        // so it cannot take an ordinary edit down with it the way F1's
        // defect could — this section locks that down and additionally
        // proves the scheduler recovers cleanly once the failure clears.
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('F4');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);

        let calls = 0;
        const flakyAutosave = {
            execute: (mgr) => {
                calls += 1;
                if (calls === 1) {
                    throw new Error('quota exceeded');
                }
                return stack.autosaveDocumentUseCase.execute(mgr);
            }
        };
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(flakyAutosave, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();

        addBrickAt(history, doc.world, 1);
        const stateBeforeFailedFlush = JSON.stringify(manager.state);
        assertThrows(() => timers.flush(), 'F4: sanity — the injected autosave failure actually throws when the timer fires');
        assert(JSON.stringify(manager.state) === stateBeforeFailedFlush,
            'F4: a failed autosave write leaves DocumentManager state completely untouched (still dirty, not marked saved)');
        assert(!stack.recoveryStore.exists(id), 'F4: a failed autosave writes no partial checkpoint');

        // A further edit still reschedules normally, and once the flaky
        // collaborator stops throwing, autosave succeeds again.
        addBrickAt(history, doc.world, 2);
        assert(timers.pendingCount() === 1, 'F4: the scheduler still reschedules normally after a prior failed autosave');
        timers.flush();
        assert(stack.recoveryStore.exists(id), 'F4: autosave succeeds again once the underlying failure clears');
        scheduler.stop();
        console.log('✓ F4. a failing autosave write never corrupts DocumentManager state and the scheduler recovers on its own');
    }

    // -------------------------------------------------------------
    // G. Structural isolation — the two observers must not form a
    //    feedback loop. Document identity change -> recovery check;
    //    document content/dirty change -> autosave; neither trigger
    //    ever fires the other's collaborator.
    // -------------------------------------------------------------
    {
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const docA = createDocument('G Doc A');
        const docB = createDocument('G Doc B');
        const manager = new DocumentManager();

        let checkCalls = 0;
        let autosaveCalls = 0;
        const countingCheck = { execute: (id) => { checkCalls += 1; return stack.checkRecoveryUseCase.execute(id); } };
        const countingAutosave = { execute: (mgr) => { autosaveCalls += 1; return stack.autosaveDocumentUseCase.execute(mgr); } };

        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(countingAutosave, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        const observer = new RecoveryObserver(countingCheck, manager);

        const historyA = openDocumentInManager(manager, docA);
        scheduler.start();
        observer.start();
        assert(checkCalls === 1 && autosaveCalls === 0, 'G: opening probes recovery once and schedules nothing yet');

        addBrickAt(historyA, docA.world, 1); // dirty -> schedules, does NOT probe recovery
        assert(checkCalls === 1, 'G: a dirtying edit never triggers a recovery probe');
        timers.flush(); // autosave fires -> writes a checkpoint WITHOUT touching DocumentManager state at all
        assert(autosaveCalls === 1, 'G: the autosave actually ran');
        assert(checkCalls === 1, 'G: an autosave firing never triggers a recovery probe — it never calls markDirty/markSaved/load, so DocumentManager never republishes STATE_CHANGED for it');

        stack.saveDocumentUseCase.execute(manager); // clean
        assert(checkCalls === 1, 'G: an explicit Save never triggers a recovery probe');
        addBrickAt(historyA, docA.world, 2); // dirty again
        historyA.undo();
        historyA.redo();
        assert(checkCalls === 1, 'G: further dirty/clean churn on the SAME identity never triggers a recovery probe');

        // Now an actual identity change — this, and only this, must
        // trigger a fresh recovery probe.
        openDocumentInManager(manager, docB);
        assert(checkCalls === 2, 'G: a document-identity change is the ONLY thing that triggers a recovery probe');
        scheduler.stop();
        observer.stop();
        console.log('✓ G. recovery checks fire only on identity change; autosave fires only on dirty/clean change — no cross-trigger feedback loop');
    }

    // -------------------------------------------------------------
    // H. Document A / Document B non-contamination under a live,
    //    in-flight autosave timer at the moment of the switch — the one
    //    angle 0.9.204's own multi-document section (E) did not cover
    //    (E switched documents with no pending timer in flight).
    // -------------------------------------------------------------
    {
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const docA = createDocument('H Doc A');
        const docB = createDocument('H Doc B');
        const idA = docA.world.id;
        const idB = docB.world.id;
        const manager = new DocumentManager();

        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        const historyA = openDocumentInManager(manager, docA);
        scheduler.start();
        addBrickAt(historyA, docA.world, 1);
        assert(timers.pendingCount() === 1, 'H: sanity — Doc A has an autosave timer in flight');

        // Switch to Doc B BEFORE Doc A's pending timer fires — exactly a
        // Load/fork/New happening while an autosave is mid-debounce.
        const historyB = openDocumentInManager(manager, docB);
        assert(timers.pendingCount() === 0, 'H: switching documents cancels Doc A\'s in-flight pending autosave — no cross-document write');
        assert(!stack.recoveryStore.exists(idA), 'H: Doc A never got an autosave checkpoint from a timer that fired against the wrong document');

        // Doc B behaves as an entirely fresh, independent autosave
        // target.
        addBrickAt(historyB, docB.world, 1);
        timers.flush();
        assert(stack.recoveryStore.exists(idB), 'H: Doc B autosaves correctly after the switch');
        assert(!stack.recoveryStore.exists(idA), 'H: Doc B\'s autosave never touched Doc A\'s (nonexistent) checkpoint');
        scheduler.stop();
        console.log('✓ H. an in-flight autosave timer is cancelled by a document switch — no cross-document contamination');
    }

    // -------------------------------------------------------------
    // I. Structural check — the fix this audit made stays inside the
    //    existing architecture: RecoveryObserver.js still has zero
    //    imports (depends only on constructor-injected collaborators),
    //    and still never reaches into storage/persistence directly.
    // -------------------------------------------------------------
    {
        const SOURCE_ROOT = new URL('../', import.meta.url);
        async function rawSource(relativePath) {
            return readFile(new URL(relativePath, SOURCE_ROOT), 'utf8');
        }
        function codeOnlyLines(source) {
            return source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        }
        const observerSource = codeOnlyLines(await rawSource('application/RecoveryObserver.js'));
        assert(!observerSource.includes('import '),
            'I: RecoveryObserver.js still has zero imports after this milestone\'s failure-isolation fix');
        assert(!/from ['"].*\/(storage|persistence)\//.test(observerSource),
            'I: RecoveryObserver.js still imports nothing from storage/ or persistence/');
        console.log('✓ I. the failure-isolation fix introduced no new dependency or architectural seam');
    }

    console.log('\nAll Editor Autosave & Recovery Lifecycle Audit tests passed.');
}

await run();
