
import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Building } from '../core/Building.js';
import { Brick } from '../core/Brick.js';
import { Position } from '../core/Position.js';
import { License, LicenseId } from '../core/License.js';
import { LocalContentStore } from '../content/LocalContentStore.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { LocalRecoveryStore } from '../persistence/LocalRecoveryStore.js';
import { PublishDocumentUseCase } from '../application/publication/PublishDocumentUseCase.js';
import { DocumentManager } from '../application/document/DocumentManager.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import { AutosaveScheduler } from '../application/document/AutosaveScheduler.js';
import { AutosaveDocumentUseCase } from '../application/document/AutosaveDocumentUseCase.js';
import { CheckRecoveryUseCase } from '../application/document/CheckRecoveryUseCase.js';
import { RecoverDocumentUseCase } from '../application/document/RecoverDocumentUseCase.js';
import { LocalDiscoveryProvider } from '../discovery/LocalDiscoveryProvider.js';
import { editorViewFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.580 — Close Editor Trailing-Autosave Loss Window.
//
// 0.9.579 Section C proved a real, bounded, silent loss window: leaving
// the Editor unmounts it, and EditorView.js's own onBeforeUnmount() calls
// autosaveScheduler.stop() — cancel()-then-unsubscribe, never a flush —
// so an edit still inside its autosave debounce delay at the exact
// moment of exit was discarded with no warning of any kind (0.9.579
// Section C1 already confirmed no navigation-blocking guard exists
// anywhere in this view).
//
// THE FIX, deliberately the narrowest one available: AutosaveScheduler
// gains one new method, flush() (application/document/AutosaveScheduler.js),
// called from EditorView.js's own onBeforeUnmount() immediately before
// the existing stop() call. flush() fires the SAME AutosaveDocumentUseCase
// checkpoint stop() would otherwise let go unfired — never a Save, never
// a Publish, never a new timer, never a shorter debounce. Autosave's own
// existing semantics (checkpoint-only, dirty flag untouched, no
// Publication) are completely unchanged; see application/
// AutosaveDocumentUseCase.js's own header, unmodified by this milestone.
//
// This file drives the real AutosaveScheduler/AutosaveDocumentUseCase/
// CheckRecoveryUseCase/RecoverDocumentUseCase/SaveDocumentUseCase/
// PublishDocumentUseCase classes live, with a deterministic
// (fake-timer) scheduler — never real sleep()-based timing — so the
// vulnerable window this milestone closes is exercised exactly, not
// merely approximated. EditorView.js's own wiring (imports 'vue'/
// 'three' transitively, so it cannot be mounted here) is proven by
// direct, verbatim source citation, the same discipline 0.9.579's own
// Section C3 already used for AutosaveScheduler.js.

function assertThrows(fn, message) {
    try { fn(); assert(false, message); }
    catch (e) { /* expected */ }
}

function createDocument(title = 'Loss Window Witness', license = new License({ id: LicenseId.CC0_1_0 })) {
    const world = new World();
    const building = new Building({ creator: 'alice' });
    building.addBrick(new Brick({ definitionId: 'core:cube', position: new Position(0, 0.5, 0) }));
    world.addBuilding(building);
    return new Document({ world, metadata: new DocumentMetadata({ title, author: 'alice', license }) });
}

function addBrickAt(history, world, x) {
    const buildingId = world.getBuildings()[0].id;
    history.execute(new PlaceBrickCommand({
        worldId: world.id, buildingId,
        definitionId: 'core:cube',
        position: new Position(x, 0.5, 0)
    }));
}

// Mirrors EditorSession._rebuild()'s own wiring, exactly like
// tests/EditorAutosaveRecoveryLifecycleAudit.test.js's own helper —
// dirty is COMPUTED from the CommandHistory, never set by hand.
function openDocumentInManager(manager, document) {
    manager.load(document, document.world.id);
    const history = new CommandHistory({ world: document.world });
    manager.trackCommandHistory(history);
    return history;
}

// Deterministic scheduler harness — the "deliberately controlled
// scheduler" the milestone's own brief asks for, so the vulnerable
// window is exact rather than timing-dependent.
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
// caller-owned in-memory storage instance.
function buildRecoveryStack(storage) {
    const recoveryStore = new LocalRecoveryStore(storage);
    return {
        storageProvider: storage,
        recoveryStore,
        saveDocumentUseCase: new SaveDocumentUseCase(storage, undefined, undefined, recoveryStore),
        autosaveDocumentUseCase: new AutosaveDocumentUseCase(recoveryStore, storage),
        checkRecoveryUseCase: new CheckRecoveryUseCase(recoveryStore, storage),
        recoverDocumentUseCase: new RecoverDocumentUseCase(recoveryStore)
    };
}

function makePublishPipeline(storage, author = 'alice') {
    const contentStore = new LocalContentStore(storage);
    const publisher = new LocalPublisherProvider(storage, contentStore);
    const identityProvider = { currentUser: () => ({ username: author }), sign: () => null };
    const publishDocumentUseCase = new PublishDocumentUseCase(publisher, identityProvider, null, null);
    return { publisher, publishDocumentUseCase };
}

// The EXACT sequence EditorView.js's own onBeforeUnmount() now runs for
// autosave (see this file's own header + that view's 0.9.580 comment):
// flush() wrapped in try/catch, logged rather than propagated, then
// stop() and every other cleanup step unconditionally. `cleanupLog`
// lets a test observe that every later step still ran regardless of
// whether flush() threw.
function editorExitLikeEditorView(scheduler, cleanupLog, errorLog) {
    try {
        scheduler.flush();
    } catch (e) {
        errorLog.push(e);
    }
    cleanupLog.push('autosaveScheduler.stop');
    scheduler.stop();
    cleanupLog.push('recoveryObserver.stop');
    cleanupLog.push('removeEventListener');
    cleanupLog.push('editorSession.dispose');
}

async function run() {
    // ---------------------------------------------------------------
    // A. Existing autosave behavior is completely unchanged.
    // ---------------------------------------------------------------
    {
        // A1 — ordinary edit -> wait -> autosave, byte-for-byte the same
        // shape as pre-0.9.580 (tests/EditorAutosaveRecoveryLifecycleAudit
        // .test.js's own A1), with flush() never called.
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
        assert(timers.pendingCount() === 1, 'A1a. An edit still schedules exactly one autosave — no second, shorter timer added.');
        timers.flush();
        assert(stack.recoveryStore.exists(id), 'A1b. The scheduled autosave still fires normally when flush() is never invoked.');
        scheduler.stop();
        console.log('✓ A1. ordinary debounced autosave is byte-for-byte unchanged when flush() is never called');
    }
    {
        // A2 — the production default delay is untouched; flush() is a
        // pure addition, not a reimplementation of the debounce.
        assert(AutosaveScheduler.DEFAULT_DELAY_MS === 2000, 'A2. AutosaveScheduler.DEFAULT_DELAY_MS is still 2000ms — no shorter default debounce was introduced.');
        const schedulerSource = await readSource('application/document/AutosaveScheduler.js');
        assert(/_schedule\(\) \{\s*this\.cancel\(\);\s*this\._timer = this\._setTimeout\(/.test(schedulerSource),
            'A2b. _schedule()\'s own real body is unchanged — one timer, cancel-then-reschedule, no second scheduling path.');
        assert((schedulerSource.match(/_setTimeout\(/g) || []).length === 1,
            'A2c. There is still exactly one call site that ever starts a timer — flush() never starts one of its own.');
        console.log('✓ A2. the debounce mechanism itself (delay, single timer, cancel-then-reschedule) is untouched by this milestone');
    }
    {
        // A3 — flush() itself never leaves a new timer pending, and
        // never re-subscribes — it is a one-shot drain, not a second
        // autosave path.
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('A3');
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 1);
        scheduler.flush();
        assert(timers.pendingCount() === 0, 'A3. flush() leaves no timer pending — it drains the existing one, it does not schedule a new one.');
        scheduler.stop();
        console.log('✓ A3. flush() is a one-shot drain, never a second, independent autosave path');
    }

    // ---------------------------------------------------------------
    // B. Pending edits are flushed on genuine exit — THE CENTRAL FIX.
    // ---------------------------------------------------------------
    {
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('B');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager); // revision 1, clean

        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();

        addBrickAt(history, doc.world, 9); // "the last edit before navigating away"
        assert(timers.pendingCount() === 1, 'B0. sanity — the edit scheduled a pending autosave, exactly 0.9.579 Section C3\'s own starting position.');

        // Leave IMMEDIATELY — no wait, exactly the vulnerable window
        // 0.9.579 Section C3 proved. flush() replaces the bare stop().
        scheduler.flush();
        assert(timers.pendingCount() === 0, 'B1. flush() consumes the pending timer — nothing is left for a subsequent stop() to merely cancel.');

        const checkpoint = stack.recoveryStore.load(id);
        assert(checkpoint !== null, 'B2. THE FIX: the trailing edit, never idle long enough to autosave on its own, is now protected by a checkpoint written at exit.');
        assert(checkpoint.document.world.buildings[0].bricks.length === 2,
            'B3. The checkpoint captures the actual trailing edit (two bricks: the original plus the one added right before leaving).');
        assert(manager.state.dirty === true, 'B4. Exactly like an ordinary timer-fired autosave, flush() never clears dirty — AutosaveDocumentUseCase.js\'s own contract is unchanged (0.9.579 Section C3d\'s own observation still holds).');

        scheduler.stop();
        console.log('✓ B. an edit immediately followed by leaving the Editor is now protected by a flushed checkpoint — the loss window 0.9.579 Section C proved is closed');
    }

    // ---------------------------------------------------------------
    // C. No duplicate save when the autosave already fired.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);
        const doc = createDocument('C');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);

        let calls = 0;
        const countingAutosave = { execute: (mgr) => { calls += 1; return stack.autosaveDocumentUseCase.execute(mgr); } };
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(countingAutosave, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();

        addBrickAt(history, doc.world, 1);
        timers.flush(); // the autosave fires normally, BEFORE the exit
        assert(calls === 1, 'C0. sanity — the ordinary autosave fired exactly once.');
        const revisionAfterNormalFire = stack.recoveryStore.load(id).revision;

        // Leave AFTER the autosave already ran — dirty is still true
        // (AutosaveDocumentUseCase never clears it), so a naive
        // `if (dirty) autosave()` flush would wrongly re-fire here.
        assert(manager.state.dirty === true, 'C0b. sanity — dirty is still true after the normal autosave, matching AutosaveDocumentUseCase.js\'s own documented contract.');
        scheduler.flush();

        assert(calls === 1, 'C1. flush() after an autosave already fired makes NO further call to the underlying use case — no unnecessary second persistence operation.');
        assert(stack.recoveryStore.load(id).revision === revisionAfterNormalFire, 'C2. The checkpoint\'s own revision is unchanged — nothing was rewritten.');

        scheduler.stop();
        console.log('✓ C. flush() after the autosave already fired is a genuine no-op — no duplicate write, confirmed by both a call count and an unchanged revision');
    }

    // ---------------------------------------------------------------
    // D. Save failure is visible — the existing failure semantics
    //    decide what happens, no new vocabulary invented.
    // ---------------------------------------------------------------
    {
        // D1 — flush() itself propagates a failing autosave exactly like
        // AutosaveDocumentUseCase already does when its own timer fires
        // (tests/EditorAutosaveRecoveryLifecycleAudit.test.js's own F4),
        // and leaves state exactly as untouched.
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);
        const doc = createDocument('D1');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);

        const failingAutosave = { execute: () => { throw new Error('storage quota exceeded'); } };
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(failingAutosave, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 1);

        const stateBeforeFlush = JSON.stringify(manager.state);
        assertThrows(() => scheduler.flush(), 'D1a. flush() propagates the underlying AutosaveDocumentUseCase failure — no new, swallowed failure vocabulary invented.');
        assert(JSON.stringify(manager.state) === stateBeforeFlush, 'D1b. A failed flush leaves DocumentManager state completely untouched — never a false "saved."');
        assert(!stack.recoveryStore.exists(id), 'D1c. A failed flush writes no partial/corrupt checkpoint.');
        assert(timers.pendingCount() === 0, 'D1d. flush() still consumes the pending timer even though the write itself failed — stop() right after it has nothing stale left to cancel.');
        scheduler.stop();
        console.log('✓ D1. flush() propagates a failing autosave exactly like the existing timer-fired path, and never claims a save that did not happen');
    }
    {
        // D2 — EditorView.js's own real call site: flush() is wrapped in
        // try/catch (logged, not thrown further) so a failure here can
        // never abort the rest of onBeforeUnmount's teardown — quoted
        // verbatim from the real source, the same discipline 0.9.579's
        // own Section C3 used for AutosaveScheduler.js.
        const editorViewSource = (await Promise.all(editorViewFiles().map((file) => readSource(file)))).join('\n');
        const unmountMatch = editorViewSource.match(/onBeforeUnmount\(\(\) => \{[\s\S]*?\n        \}\);/);
        assert(unmountMatch !== null, 'sanity — onBeforeUnmount() block located.');
        // Comment lines stripped before searching for call-site order —
        // this milestone's own explanatory comment names several of
        // these same calls in prose, which would otherwise confuse a
        // plain indexOf() against the raw source.
        const unmountBody = unmountMatch[0].split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(/try \{\s*autosaveScheduler\.flush\(\);\s*\} catch \(e\) \{\s*console\.error\(/.test(unmountBody),
            'D2a. EditorView.js\'s own onBeforeUnmount() calls autosaveScheduler.flush() inside a try/catch that logs rather than rethrows, quoted verbatim.');
        const flushIndex = unmountBody.indexOf('autosaveScheduler.flush()');
        const stopIndex = unmountBody.indexOf('autosaveScheduler.stop()');
        const disposeIndex = unmountBody.indexOf('editorSession.dispose()');
        assert(flushIndex !== -1 && stopIndex !== -1 && disposeIndex !== -1 && flushIndex < stopIndex && stopIndex < disposeIndex,
            'D2b. flush() runs before stop(), which runs before editorSession.dispose() — the catch around flush() cannot skip any later cleanup step, since it is not inside the same try block.');
        console.log('✓ D2. the real onBeforeUnmount() wiring isolates a flush failure without skipping any later teardown step (verified by direct source citation)');
    }

    // ---------------------------------------------------------------
    // E. Navigation safety.
    // ---------------------------------------------------------------
    {
        // E1 — successful flush -> the reconstructed exit sequence
        // completes every cleanup step, exactly as it would before
        // whatever navigation already triggered the unmount proceeds.
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('E1');
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 1);

        const cleanupLog = [];
        const errorLog = [];
        editorExitLikeEditorView(scheduler, cleanupLog, errorLog);
        assert(errorLog.length === 0, 'E1a. A successful flush logs no error.');
        assert(cleanupLog.length === 4, 'E1b. Every teardown step still ran after a successful flush.');
        assert(stack.recoveryStore.exists(doc.world.id), 'E1c. And the checkpoint the flush wrote is actually there.');
        console.log('✓ E1. a successful exit flush never interferes with the rest of teardown (the navigation-equivalent path)');
    }
    {
        // E2 — flush fails -> per Section C1's own finding (0.9.579),
        // this codebase has no navigation-blocking contract anywhere;
        // the reconstructed exit sequence must therefore still complete
        // every OTHER teardown step (never hang, never leak listeners
        // or peer subscriptions) even though the checkpoint write itself
        // failed — the "existing product contract" the milestone's own
        // brief asks this section to defer to.
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);
        const doc = createDocument('E2');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);

        const failingAutosave = { execute: () => { throw new Error('disk full'); } };
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(failingAutosave, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 1);

        const cleanupLog = [];
        const errorLog = [];
        editorExitLikeEditorView(scheduler, cleanupLog, errorLog);
        assert(errorLog.length === 1 && errorLog[0].message === 'disk full', 'E2a. The flush failure is captured (visible), not silently discarded.');
        assert(cleanupLog.length === 4, 'E2b. Every other teardown step still ran despite the flush failure — navigation/unmount is never blocked or left half-finished by a failed flush.');
        assert(!stack.recoveryStore.exists(id), 'E2c. No checkpoint was written — the failure never pretended to succeed.');
        console.log('✓ E2. a failing exit flush is visible but never blocks or half-completes the rest of teardown — matching the existing "navigation is never gated" contract Section C1 established');
    }

    // ---------------------------------------------------------------
    // F. Recovery remains intact.
    // ---------------------------------------------------------------
    {
        // F1 — a checkpoint written by an ORDINARY timer firing (i.e.
        // the crash/interruption case this milestone must not disturb —
        // it happens entirely before any exit flush) is still offered
        // and still recoverable exactly as before.
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('F1');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 1);
        timers.flush(); // ordinary autosave fires — simulates a crash right after this, BEFORE any exit flush

        const check = stack.checkRecoveryUseCase.execute(id);
        assert(check.available === true, 'F1a. A checkpoint from an ordinary timer firing is still offered — untouched by this milestone.');
        const { document: recovered } = stack.recoverDocumentUseCase.execute(id);
        assert(recovered.world.getBuildings()[0].getBricks().length === 2, 'F1b. Recovery still restores the actual edit.');
        scheduler.stop();
        console.log('✓ F1. a checkpoint written before any exit flush (the crash/interruption case) is still fully recoverable');
    }
    {
        // F2 — a checkpoint written BY the new flush() path is
        // indistinguishable from an ordinary one: same store, same
        // shape, same CheckRecoveryUseCase/RecoverDocumentUseCase
        // pipeline, no second recovery mechanism introduced.
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('F2');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 1);
        scheduler.flush(); // exit-time checkpoint, never idle-fired

        const check = stack.checkRecoveryUseCase.execute(id);
        assert(check.available === true, 'F2a. A flush()-written checkpoint is offered through the SAME CheckRecoveryUseCase, no special-casing.');
        const { document: recovered } = stack.recoverDocumentUseCase.execute(id);
        assert(recovered.world.getBuildings()[0].getBricks().length === 2, 'F2b. And restores correctly through the SAME RecoverDocumentUseCase.');
        scheduler.stop();
        console.log('✓ F2. an exit-flushed checkpoint is recovered through the exact same pipeline as an ordinary one — no second recovery mechanism was created');
    }

    // ---------------------------------------------------------------
    // G. Publication isolation.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage);
        const doc = createDocument('G');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);

        // G1. edit -> exit flush -> must not publish anything.
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 1);
        scheduler.flush();
        assert(new LocalDiscoveryProvider(storage).list().length === 0, 'G1a. An exit flush never creates a Publication or a Repository entry.');
        assert(storage.load(id).world.buildings.length === 1, 'G1b. The canonical saved slot is untouched by the flush — still exactly what the last explicit Save left (one building), never advanced to the checkpointed two.');
        scheduler.stop();

        // G2. P1 already published -> edit World -> exit flush -> must
        // not modify P1.
        const p1 = publishDocumentUseCase.execute({ document: doc });
        const snapshotAtPublish = publisher.loadSnapshot(p1.id);

        const scheduler2 = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler2.start();
        doc.world.addBuilding(new Building({ creator: 'alice' })); // "edit World" — not tracked by `history`, mirrors a fresh command in a real session
        manager.markDirty();
        scheduler2.flush();

        const snapshotAfter = publisher.loadSnapshot(p1.id);
        assert(JSON.stringify(snapshotAtPublish) === JSON.stringify(snapshotAfter), 'G2a. P1\'s stored snapshot is byte-for-byte unchanged after an exit flush of a further edit.');
        assert(publisher.verifySnapshot(p1.id, p1.contentHash) === true, 'G2b. contentHash verification independently confirms P1\'s immutability.');
        scheduler2.stop();
        console.log('✓ G. an exit flush never publishes anything, never touches the canonical saved slot, and never modifies an already-published Publication');
    }

    // ---------------------------------------------------------------
    // H. Collaboration isolation — structural, by direct source
    //    citation: the flush() path adds no new dependency at all.
    // ---------------------------------------------------------------
    {
        const schedulerSource = await readSource('application/document/AutosaveScheduler.js');
        assert(!/peer|collaboration|Propagation|EventBus/i.test(schedulerSource.replace(/\/\/.*$/gm, '')),
            'H1. application/document/AutosaveScheduler.js (flush() included) imports and references nothing from peer/collaboration machinery, and constructs no EventBus of its own — its only imports are DocumentManager itself (a type import, unused by flush()).');
        const autosaveUseCaseSource = await readSource('application/document/AutosaveDocumentUseCase.js');
        assert(!/peer|collaboration|Propagation/i.test(autosaveUseCaseSource.replace(/\/\/.*$/gm, '')),
            'H2. application/document/AutosaveDocumentUseCase.js — the SAME collaborator flush() calls — is completely unmodified by this milestone and still has zero collaboration-related references.');
        // H3. Live confirmation alongside the structural one: flushing
        // never touches documentCommandPropagation/peerMessageBus at
        // all — there is no such collaborator passed into
        // AutosaveScheduler's constructor in the first place, so there
        // is nothing for flush() to reach into even accidentally.
        assert(AutosaveScheduler.length === 2, 'H3. AutosaveScheduler\'s own constructor still takes exactly (autosaveDocumentUseCase, documentManager[, options]) — no collaboration collaborator was added as a parameter for this fix.');
        console.log('✓ H. flush() introduces no new dependency on collaboration/peer machinery — confirmed both structurally (source citation) and by the unchanged constructor shape');
    }

    // ---------------------------------------------------------------
    // I. Race conditions — the most important technical guarantee.
    // ---------------------------------------------------------------
    {
        // I1. edit -> autosave scheduled -> leave -> exit flush ->
        // scheduled autosave fires. The ORIGINAL timer must never fire
        // a second time after flush() already drained it.
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);
        const doc = createDocument('I1');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);

        let calls = 0;
        const countingAutosave = { execute: (mgr) => { calls += 1; return stack.autosaveDocumentUseCase.execute(mgr); } };
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(countingAutosave, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 1);
        assert(timers.pendingCount() === 1, 'I1a. sanity — the edit scheduled a pending autosave.');

        scheduler.flush(); // "leave -> exit flush"
        assert(calls === 1, 'I1b. flush() itself performed the one checkpoint write.');
        timers.flush(); // "scheduled autosave fires" — must be a no-op: the timer was cleared by flush()
        assert(calls === 1, 'I1c. THE RACE GUARANTEE: the originally-scheduled timer never fires a second time after flush() already drained it — no duplicate/corrupt persistence.');
        scheduler.stop();
        console.log('✓ I1. flush() then the original timer attempting to fire: no duplicate write — the timer was already cancelled');
    }
    {
        // I2. The reverse ordering: edit -> autosave fires -> leave ->
        // exit flush. Already covered in full by Section C above
        // (same guarantee, framed there as "no duplicate save"); this
        // reconfirms it under the race-condition framing with an
        // explicit call-count witness, completing both orderings this
        // section's own brief asks for.
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);
        const doc = createDocument('I2');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);

        let calls = 0;
        const countingAutosave = { execute: (mgr) => { calls += 1; return stack.autosaveDocumentUseCase.execute(mgr); } };
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(countingAutosave, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 1);
        timers.flush(); // "autosave fires"
        assert(calls === 1, 'I2a. sanity — the autosave fired exactly once.');

        scheduler.flush(); // "leave -> exit flush"
        assert(calls === 1, 'I2b. THE RACE GUARANTEE (reverse ordering): an exit flush arriving after the autosave already fired performs no further write — no duplicate/corrupt persistence, confirmed by call count.');
        scheduler.stop();
        console.log('✓ I2. autosave fires then flush() on exit: no duplicate write — both orderings around the race are now proven corruption-free');
    }

    // ---------------------------------------------------------------
    // Permanent regression test — the flagship witness.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage);

        // Create World -> Edit -> Publish P1.
        const document = createDocument('Flagship World');
        const id = document.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, document);
        addBrickAt(history, document.world, 1);
        stack.saveDocumentUseCase.execute(manager);
        const p1 = publishDocumentUseCase.execute({ document });
        const snapshotAtPublish = publisher.loadSnapshot(p1.id);

        // Edit again -> do NOT wait for autosave -> Leave Editor
        // immediately -> exit lifecycle flush.
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, document.world, 2); // the never-autosaved-on-its-own trailing edit
        assert(timers.pendingCount() === 1, 'sanity — the trailing edit is mid-debounce, exactly the vulnerable window.');
        const cleanupLog = [];
        const errorLog = [];
        editorExitLikeEditorView(scheduler, cleanupLog, errorLog); // "Leave Editor immediately -> exit lifecycle flush"
        assert(errorLog.length === 0, 'sanity — the flush succeeded.');

        // Re-enter World: a brand-new DocumentManager, exactly what a
        // fresh mount of the Editor (or World View's own re-entry) would
        // construct, discovers the checkpoint through the ordinary
        // recovery pipeline and restores it.
        const check = stack.checkRecoveryUseCase.execute(id);
        assert(check.available === true, 'Re-entry finds a recovery offer — the trailing edit was NOT silently lost.');
        const { document: recovered } = stack.recoverDocumentUseCase.execute(id);

        // Latest edit is present.
        assert(recovered.world.getBuildings()[0].getBricks().length === 3,
            'FLAGSHIP: re-entering World after the exit flush recovers all three bricks (initial + the two edits) — the trailing edit that 0.9.579 proved would be silently lost is present.');

        // P1 remains original immutable snapshot.
        const snapshotAfter = publisher.loadSnapshot(p1.id);
        assert(JSON.stringify(snapshotAtPublish) === JSON.stringify(snapshotAfter),
            'FLAGSHIP: P1 remains the original, byte-for-byte immutable snapshot taken at publish time — completely unaffected by either the trailing edit or the exit flush that protected it.');
        assert(publisher.verifySnapshot(p1.id, p1.contentHash) === true, 'FLAGSHIP: contentHash verification independently reconfirms P1\'s immutability.');

        console.log('✓ FLAGSHIP: Create World -> Edit -> Publish P1 -> Edit again -> leave immediately (no wait) -> exit flush -> re-enter World: the latest edit is present AND P1 remains untouched — the exact scenario 0.9.579 Section C proved was silently lossy is now closed.');
    }

    // ---------------------------------------------------------------
    // Original failure boundary — forced save failure at exit.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);
        const doc = createDocument('Failure Boundary');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);

        // An EARLIER, successful autosave already protects an older
        // edit — the crash/interruption case Section F proved survives
        // this milestone untouched.
        let shouldFail = false;
        const flakyAutosave = {
            execute: (mgr) => {
                if (shouldFail) {
                    throw new Error('forced save failure');
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
        timers.flush(); // the earlier, successful checkpoint
        const revisionBeforeFailure = stack.recoveryStore.load(id).revision;

        // Edit -> leave during the autosave window -> forced save
        // failure at the exit flush itself.
        shouldFail = true;
        addBrickAt(history, doc.world, 2); // the trailing edit that WOULD have been protected, if the flush could succeed
        assert(timers.pendingCount() === 1, 'sanity — the trailing edit is mid-debounce.');

        // The SAME try/catch shape EditorView.js's own onBeforeUnmount()
        // uses (Section D2), applied directly here — Section E already
        // proved the full teardown sequence survives a flush failure,
        // so this section stays focused on the failure/recovery
        // semantics themselves, without also tearing the scheduler down
        // (which would make the "ordinary life goes on" tail below
        // meaningless — an unsubscribed scheduler schedules nothing).
        let caught = null;
        try {
            scheduler.flush();
        } catch (e) {
            caught = e;
        }
        assert(caught !== null && caught.message === 'forced save failure', 'The forced failure at exit is visible (existing failure semantics: caught, per Section D/E, never silently swallowed).');

        // Existing failure/recovery behavior: the checkpoint from the
        // EARLIER, successful autosave is left exactly as it was — a
        // failed exit flush never corrupts or discards a prior, valid
        // recovery offer.
        const checkpointAfter = stack.recoveryStore.load(id);
        assert(checkpointAfter !== null && checkpointAfter.revision === revisionBeforeFailure,
            'The prior, successfully-autosaved checkpoint survives a failed exit flush completely untouched — the existing recovery guarantee (an older checkpoint protects older edits, per 0.9.579 Section C2) holds exactly as before.');
        assert(checkpointAfter.document.world.buildings[0].bricks.length === 2, 'That surviving checkpoint still only reflects the edit that WAS successfully checkpointed — never a partial/corrupt write of the failed trailing edit.');
        assert(manager.state.dirty === true, 'The document correctly still reads dirty — nothing here ever claims the trailing edit was saved.');

        // Once the underlying failure clears, ordinary life goes on —
        // matching tests/EditorAutosaveRecoveryLifecycleAudit.test.js's
        // own F4 guarantee, now reconfirmed through the exit-flush path.
        shouldFail = false;
        addBrickAt(history, doc.world, 3);
        assert(timers.pendingCount() === 1, 'A further edit after the failure still schedules normally.');
        scheduler.flush();
        const finalCheckpoint = stack.recoveryStore.load(id);
        assert(finalCheckpoint.revision > revisionBeforeFailure, 'Once the failure clears, a further exit flush succeeds and supersedes the old checkpoint — the scheduler recovers cleanly, exactly like an ordinary timer-fired autosave would.');
        scheduler.stop();
        console.log('✓ FAILURE BOUNDARY: a forced save failure at the exact moment of exit is visible, never corrupts state or the checkpoint left by an earlier successful autosave, blocks nothing, and the scheduler recovers cleanly once the failure clears.');
    }

    console.log('\nAll Editor Trailing-Autosave Loss Window Closure tests passed.');
}

await run();
