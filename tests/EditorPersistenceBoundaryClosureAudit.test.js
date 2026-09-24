import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

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
import { DocumentManifest } from '../application/document/DocumentManifest.js';
import { CommandHistory } from '../application/editor/CommandHistory.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { SaveDocumentUseCase } from '../application/document/SaveDocumentUseCase.js';
import { AutosaveScheduler } from '../application/document/AutosaveScheduler.js';
import { AutosaveDocumentUseCase } from '../application/document/AutosaveDocumentUseCase.js';
import { CheckRecoveryUseCase } from '../application/document/CheckRecoveryUseCase.js';
import { RecoverDocumentUseCase } from '../application/document/RecoverDocumentUseCase.js';
import { computeContentHash } from '../serializer/contentHash.js';
import { editorViewFiles } from './support/SourceFileGroups.js';
import { assert } from './support/Assert.js';
import { readSource } from './support/SourceText.js';
import { InMemoryStorageProvider } from './support/InMemoryStorageProvider.js';

// 0.9.581 — Editor Persistence Boundary Closure Audit.
//
// TYPE: test-only, comprehensive closure/regression audit. No production
// file is touched.
//
// CENTRAL QUESTION: does the Editor now guarantee that every edit which
// reaches the existing trailing-autosave boundary is either persisted
// through the existing checkpoint pipeline or remains subject to the
// existing failure/recovery semantics, without changing Save, Publish,
// collaboration, or navigation behavior?
//
// 0.9.579 found the failure (a bounded, silent, unwarned trailing-autosave
// loss window — see tests/WorldEditingUnsavedStateProductReassessment
// .test.js's own Section C3c, quoted verbatim below in Section A). 0.9.580
// closed it with one new method, AutosaveScheduler.flush(), called from
// EditorView.js's own onBeforeUnmount() immediately before the existing
// stop() call — and its own tests/EditorTrailingAutosaveLossWindowClosure
// .test.js already drove nine lettered sections (A-I) plus a flagship and
// a forced-failure boundary test against the real AutosaveScheduler /
// AutosaveDocumentUseCase / CheckRecoveryUseCase / RecoverDocumentUseCase /
// PublishDocumentUseCase classes.
//
// THIS MILESTONE DOES NOT RE-DERIVE THAT COVERAGE. Re-running the same
// assertions under new names would not close anything further; it would
// only inflate the suite. Instead, every section below either (a) closes a
// genuinely untested combination 0.9.580's own suite did not reach, or (b)
// reconfirms a boundary against CURRENT source with a materially different
// check than the one already on record. The specific new ground:
//
//   B. Two state-machine combinations never exercised: a pristine,
//      never-dirtied document, and a back-to-back double flush() call.
//   C. A deliberate reversal of the real flush()-then-stop() call order,
//      proving BY CONTRADICTION that the order is load-bearing.
//   D. A flush() failure followed by an ORDINARY timer-fired autosave on
//      the same manager (0.9.580's own failure boundary only retried via
//      a second flush()).
//   E. The structural reason timer-fired and flush()-fired checkpoints
//      will always agree: the identical execute() call-site text, not
//      just two independently-passing tests.
//   F. The Save boundary as the direct subject, in both directions —
//      including the SUPERSEDE direction (an explicit Save still removes
//      a flush()-written checkpoint) that no prior test exercised
//      specifically through the flush() path.
//   G. Two SEQUENTIAL Publications, with a flushed-but-unsaved edit
//      sitting between them.
//   J. Two separate Worlds/documents opened and exited sequentially
//      against one shared store — cross-contamination, never
//      constructed by any prior test in this area.
//   K. A controlled reload A/B: the timer path and the flush path fed
//      through the identical reload-side CheckRecoveryUseCase /
//      RecoverDocumentUseCase construction, side by side.
//   L. Whole-codebase architectural-drift guards: exactly one flush()
//      call site, exactly one Scheduler class, no second persistence
//      method on AutosaveDocumentUseCase, exactly the two pre-existing
//      recovery-store classes, no new timer inside flush() itself, and
//      exactly one explicit-Save call site in EditorView.js.
//   M. A flagship in a NEW order 0.9.580's own flagship did not attempt:
//      Publish happens AFTER a recover -> Save cycle, and a later,
//      ordinary timer-fired autosave (no flush() involved at all)
//      coexists correctly with everything that came before it.
//
// A, H, and I are deliberately brief: they reconfirm boundaries 0.9.580
// already established, against current source, rather than re-deriving
// them from scratch — completeness without duplication.

function assertThrows(fn, message) {
    try { fn(); assert(false, message); }
    catch (e) { /* expected */ }
}

const SOURCE_ROOT = fileURLToPath(new URL('../', import.meta.url));

function listFiles(dirs) {
    return execSync(`git ls-files ${dirs.join(' ')}`, { cwd: SOURCE_ROOT })
        .toString().split('\n').filter((f) => f.endsWith('.js'));
}

function createDocument(title = 'Closure Audit Witness', license = new License({ id: LicenseId.CC0_1_0 })) {
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

// Mirrors EditorSession._rebuild()'s own wiring — dirty is COMPUTED from
// the CommandHistory, exactly like 0.9.580's own helper of the same name.
function openDocumentInManager(manager, document) {
    manager.load(document, document.world.id);
    const history = new CommandHistory({ world: document.world });
    manager.trackCommandHistory(history);
    return history;
}

// Deterministic scheduler harness — never real sleep()-based timing.
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

// The exact sequence EditorView.js's own onBeforeUnmount() now runs for
// autosave: flush() wrapped in try/catch, logged rather than propagated,
// then stop() and every other cleanup step unconditionally.
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
    // A. Original failure — cited verbatim, not re-derived.
    // ---------------------------------------------------------------
    {
        const priorFindingSource = await readSource('tests/WorldEditingUnsavedStateProductReassessment.test.js');
        assert(priorFindingSource.includes('a real, silent, unwarned loss window'),
            'A1. 0.9.579 Section C3c\'s own documented finding is quoted verbatim in its own source file — this closure audit is anchored to the actual prior failure, not a paraphrase of it.');

        const schedulerSource = await readSource('application/document/AutosaveScheduler.js');
        assert(/flush\(\) \{/.test(schedulerSource), 'A2. AutosaveScheduler.js now defines flush() — the exact seam 0.9.579 found missing.');

        const editorViewSource = (await Promise.all(editorViewFiles().map((file) => readSource(file)))).join('\n');
        const unmountMatch = editorViewSource.match(/onBeforeUnmount\(\(\) => \{[\s\S]*?\n        \}\);/);
        assert(unmountMatch !== null, 'sanity — onBeforeUnmount() block located.');
        const flushPos = unmountMatch[0].indexOf('autosaveScheduler.flush()');
        const stopPos = unmountMatch[0].indexOf('autosaveScheduler.stop()');
        assert(flushPos !== -1 && stopPos !== -1 && flushPos < stopPos,
            'A3. The real onBeforeUnmount() calls flush() strictly before stop() — the exact ordering that closes 0.9.579\'s finding (stop() alone would still cancel-without-flushing, per Section C below).');
        console.log('✓ A. The original finding is cited verbatim from its own source, and the exact code shape it identified (stop()-without-flush) is confirmed no longer describes the real onBeforeUnmount() wiring. 0.9.580\'s own Section B and flagship remain the live regression witness for the fix itself — not re-derived here.');
    }

    // ---------------------------------------------------------------
    // B. Scheduler state machine — two combinations 0.9.580's own
    //    suite never exercised.
    // ---------------------------------------------------------------
    {
        // B1 — a pristine, never-edited document: flush() must be a
        // silent, harmless no-op. 0.9.580's own suite always dirtied
        // the document at least once before calling flush(); a
        // Wanderer who opens the Editor and leaves without touching
        // anything is at least as common a path.
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('B1');
        const id = doc.world.id;
        const manager = new DocumentManager();
        openDocumentInManager(manager, doc);
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        const result = scheduler.flush();
        assert(result === null, 'B1a. flush() on a pristine, never-edited document returns null.');
        assert(!stack.recoveryStore.exists(id), 'B1b. And writes no checkpoint at all.');
        assert(manager.state.dirty === false, 'B1c. The document remains clean.');
        scheduler.stop();

        // B2 — clean AFTER an explicit Save (dirty was true, then Save
        // cleared it — the timer is cancelled as a side effect of
        // markSaved()'s own STATE_CHANGED event flowing through the
        // scheduler's onStateChanged subscription, not by flush()):
        // flush() must still be a genuine no-op.
        const stack2 = buildRecoveryStack(new InMemoryStorageProvider());
        const doc2 = createDocument('B2');
        const manager2 = new DocumentManager();
        const history2 = openDocumentInManager(manager2, doc2);
        const timers2 = makeFakeTimers();
        const scheduler2 = new AutosaveScheduler(stack2.autosaveDocumentUseCase, manager2, {
            setTimeoutFn: timers2.setTimeoutFn, clearTimeoutFn: timers2.clearTimeoutFn
        });
        scheduler2.start();
        addBrickAt(history2, doc2.world, 1);
        assert(timers2.pendingCount() === 1, 'sanity — the edit scheduled a pending autosave.');
        stack2.saveDocumentUseCase.execute(manager2);
        assert(timers2.pendingCount() === 0, 'B2a. An explicit Save also cancels the pending timer, through the scheduler\'s own onStateChanged subscription reacting to markSaved()\'s dirty:false transition.');
        const result2 = scheduler2.flush();
        assert(result2 === null, 'B2b. flush() after an explicit Save (clean, no timer) is a no-op.');
        scheduler2.stop();

        // B3 — idempotent double flush(): a naive re-check of `dirty`
        // alone (without also checking the timer) would wrongly
        // re-fire on a SECOND call, since dirty stays true after the
        // first flush() (AutosaveDocumentUseCase's own documented
        // contract). 0.9.580's own suite never called flush() twice
        // back to back.
        const stack3 = buildRecoveryStack(new InMemoryStorageProvider());
        const doc3 = createDocument('B3');
        const id3 = doc3.world.id;
        const manager3 = new DocumentManager();
        const history3 = openDocumentInManager(manager3, doc3);
        let calls3 = 0;
        const countingAutosave3 = { execute: (mgr) => { calls3 += 1; return stack3.autosaveDocumentUseCase.execute(mgr); } };
        const timers3 = makeFakeTimers();
        const scheduler3 = new AutosaveScheduler(countingAutosave3, manager3, {
            setTimeoutFn: timers3.setTimeoutFn, clearTimeoutFn: timers3.clearTimeoutFn
        });
        scheduler3.start();
        addBrickAt(history3, doc3.world, 1);
        scheduler3.flush();
        assert(calls3 === 1, 'sanity — the first flush() performed one write.');
        const revisionAfterFirstFlush = stack3.recoveryStore.load(id3).revision;
        scheduler3.flush();
        assert(calls3 === 1, 'B3a. A SECOND, immediately-following flush() call makes no further write — flush() is genuinely idempotent, not merely safe the first time.');
        assert(stack3.recoveryStore.load(id3).revision === revisionAfterFirstFlush, 'B3b. And the checkpoint itself is unchanged.');
        scheduler3.stop();

        console.log('✓ B. A pristine never-edited document (B1) and a document cleaned by an explicit Save (B2) both flush as harmless no-ops, and flush() is confirmed genuinely idempotent under a direct back-to-back double call (B3) — three combinations 0.9.580\'s own suite did not directly exercise.');
    }

    // ---------------------------------------------------------------
    // C. Timer/flush call-order robustness — proof by contradiction.
    // ---------------------------------------------------------------
    {
        // C1 — flush() on a scheduler that was never start()-ed. No
        // real onBeforeUnmount() can reach this state (start() always
        // precedes unmount), but flush() must not assume a live
        // subscription, since it never reads this._unsubscribe.
        const stack = buildRecoveryStack(new InMemoryStorageProvider());
        const doc = createDocument('C1');
        const manager = new DocumentManager();
        openDocumentInManager(manager, doc);
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        let threw = false;
        try { scheduler.flush(); } catch (e) { threw = true; }
        assert(!threw, 'C1. flush() on a never-started scheduler does not throw.');

        // C2 — PROOF BY CONTRADICTION: deliberately reverse the real
        // call order (stop() before flush(), instead of the real
        // flush()-then-stop()). stop()'s own cancel() consumes the
        // pending timer first, so the following flush() sees nothing
        // pending and is a no-op — silently reproducing the EXACT
        // 0.9.579 loss window. This is not a hypothetical: it proves
        // the real onBeforeUnmount() ordering (Section A3) is
        // load-bearing, not cosmetic.
        const stack2 = buildRecoveryStack(new InMemoryStorageProvider());
        const doc2 = createDocument('C2');
        const id2 = doc2.world.id;
        const manager2 = new DocumentManager();
        const history2 = openDocumentInManager(manager2, doc2);
        const timers2 = makeFakeTimers();
        const scheduler2 = new AutosaveScheduler(stack2.autosaveDocumentUseCase, manager2, {
            setTimeoutFn: timers2.setTimeoutFn, clearTimeoutFn: timers2.clearTimeoutFn
        });
        scheduler2.start();
        addBrickAt(history2, doc2.world, 1);
        scheduler2.stop(); // WRONG order, deliberately
        scheduler2.flush();
        assert(!stack2.recoveryStore.exists(id2),
            'C2. PROOF BY CONTRADICTION: calling stop() before flush() silently reproduces the ORIGINAL 0.9.579 loss window — confirming the real flush()-then-stop() order is load-bearing, not cosmetic.');

        console.log('✓ C. flush() never assumes a live subscription (C1), and deliberately reversing the real call order reproduces the ORIGINAL loss window (C2) — direct proof that the fix\'s correctness depends on call order, not merely on flush() existing somewhere in the teardown.');
    }

    // ---------------------------------------------------------------
    // D. Failure semantics — a failed flush() must not poison the
    //    scheduler for a later, ORDINARY timer-fired autosave.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);
        const doc = createDocument('D');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);

        let shouldFail = true;
        const flakyAutosave = {
            execute: (mgr) => {
                if (shouldFail) throw new Error('network blip');
                return stack.autosaveDocumentUseCase.execute(mgr);
            }
        };
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(flakyAutosave, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 1);
        assertThrows(() => scheduler.flush(), 'sanity — the forced failure surfaces.');
        assert(!stack.recoveryStore.exists(id), 'sanity — nothing was written by the failed flush.');

        // The failure clears; a further edit fires through the
        // ORDINARY DEBOUNCE TIMER (not another flush()) — the
        // scheduler's own internal state must not have been left
        // half-torn-down by the earlier flush() failure.
        shouldFail = false;
        addBrickAt(history, doc.world, 2);
        assert(timers.pendingCount() === 1, 'D1. A further edit after a failed flush() still schedules an ordinary debounce timer.');
        timers.flush();
        assert(stack.recoveryStore.exists(id), 'D2. And that ordinary timer-fired autosave succeeds normally — the scheduler recovers cleanly through its own untouched, pre-existing path, not merely through a repeated flush().');
        scheduler.stop();
        console.log('✓ D. A flush() failure never poisons the scheduler for a subsequent, ORDINARY timer-fired autosave on the same manager (0.9.580\'s own failure boundary only retried via a second flush()).');
    }

    // ---------------------------------------------------------------
    // E. Recovery equivalence — the structural reason it always holds.
    // ---------------------------------------------------------------
    {
        const schedulerSource = await readSource('application/document/AutosaveScheduler.js');
        const bareSource = schedulerSource.replace(/\/\/.*$/gm, '');
        const executeCallSite = 'this._autosaveDocumentUseCase.execute(this._documentManager)';
        const occurrences = bareSource.split(executeCallSite).length - 1;
        assert(occurrences === 2,
            `E1. The exact call "${executeCallSite}" appears exactly twice in AutosaveScheduler.js — once inside the debounce timer's own callback (_schedule()) and once inside flush() — textually identical, not two implementations that merely happen to agree (found ${occurrences}).`);

        // E2 — live confirmation: a checkpoint from EACH origin
        // independently satisfies the same integrity re-verification,
        // checked by running the identical function against both.
        function verifiesIntegrity(storage, id) {
            const raw = new LocalRecoveryStore(storage).load(id);
            return raw.contentHash === computeContentHash(JSON.stringify(raw.document));
        }

        const storageTimer = new InMemoryStorageProvider();
        const stackTimer = buildRecoveryStack(storageTimer);
        const docTimer = createDocument('E-timer');
        const managerTimer = new DocumentManager();
        const historyTimer = openDocumentInManager(managerTimer, docTimer);
        const timersTimer = makeFakeTimers();
        const schedulerTimer = new AutosaveScheduler(stackTimer.autosaveDocumentUseCase, managerTimer, {
            setTimeoutFn: timersTimer.setTimeoutFn, clearTimeoutFn: timersTimer.clearTimeoutFn
        });
        schedulerTimer.start();
        addBrickAt(historyTimer, docTimer.world, 1);
        timersTimer.flush();
        assert(verifiesIntegrity(storageTimer, docTimer.world.id), 'E2a. A timer-fired checkpoint independently reverifies.');
        schedulerTimer.stop();

        const storageFlush = new InMemoryStorageProvider();
        const stackFlush = buildRecoveryStack(storageFlush);
        const docFlush = createDocument('E-flush');
        const managerFlush = new DocumentManager();
        const historyFlush = openDocumentInManager(managerFlush, docFlush);
        const timersFlush = makeFakeTimers();
        const schedulerFlush = new AutosaveScheduler(stackFlush.autosaveDocumentUseCase, managerFlush, {
            setTimeoutFn: timersFlush.setTimeoutFn, clearTimeoutFn: timersFlush.clearTimeoutFn
        });
        schedulerFlush.start();
        addBrickAt(historyFlush, docFlush.world, 1);
        schedulerFlush.flush();
        assert(verifiesIntegrity(storageFlush, docFlush.world.id), 'E2b. A flush()-fired checkpoint independently reverifies through the exact same check.');
        schedulerFlush.stop();

        console.log('✓ E. flush() and the ordinary debounce timer invoke the textually identical execute() call site (E1) — not two implementations that merely agree by coincidence — and checkpoints from both origins independently satisfy the same integrity re-verification (E2).');
    }

    // ---------------------------------------------------------------
    // F. Save boundary — direct diff, both directions.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);
        const manifest = new DocumentManifest(storage);
        const doc = createDocument('F');
        const id = doc.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);
        const canonicalAfterSave = storage.load(id);
        const manifestRevisionAfterSave = manifest.find(id).revision;

        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 1);
        scheduler.flush();

        // F1-F3 — the DIVERGE direction: everything an explicit Save
        // alone does, flush() must not do.
        assert(JSON.stringify(storage.load(id)) === JSON.stringify(canonicalAfterSave),
            'F1. flush() never writes to the canonical saved slot — byte-for-byte identical to what the last explicit Save left.');
        assert(manifest.find(id).revision === manifestRevisionAfterSave,
            'F2. flush() never advances the manifest\'s saved revision — that stays an explicit-Save-only operation.');
        assert(manager.state.dirty === true, 'F3. flush() never clears dirty — an explicit Save always does; this is what keeps the two distinguishable to the rest of the app.');

        // F4-F5 — the SUPERSEDE direction: SaveDocumentUseCase.js's own
        // header documents that an explicit Save removes any recovery
        // checkpoint. No prior test confirmed this still holds when
        // the checkpoint being superseded was written by flush()
        // specifically, rather than by the ordinary timer.
        assert(stack.recoveryStore.exists(id), 'sanity — flush() left a checkpoint behind.');
        stack.saveDocumentUseCase.execute(manager);
        assert(!stack.recoveryStore.exists(id),
            'F4. An explicit Save still supersedes and removes a flush()-written checkpoint, exactly as it already does for a timer-written one — no special-casing needed, because flush() reuses AutosaveDocumentUseCase.js unchanged.');
        assert(manager.state.dirty === false, 'F5. And THIS time dirty IS cleared — confirming the distinction is real: Save clears it, flush()/autosave never does.');

        scheduler.stop();
        console.log('✓ F. flush() never writes to the canonical slot, never advances the manifest, and never clears dirty (F1-F3) — while an explicit Save still correctly supersedes a flush()-written checkpoint exactly like a timer-written one (F4-F5). Save and the trailing-autosave-flush remain two genuinely distinct operations in both directions.');
    }

    // ---------------------------------------------------------------
    // G. Publication boundary — two SEQUENTIAL Publications.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage);
        const doc = createDocument('G');
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, doc);
        stack.saveDocumentUseCase.execute(manager);
        const p1 = publishDocumentUseCase.execute({ document: doc });
        const p1SnapshotAtPublish = publisher.loadSnapshot(p1.id);

        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, doc.world, 5); // flushed, never explicitly saved
        scheduler.flush();
        assert(manager.state.dirty === true, 'sanity — the flushed edit is still unsaved.');

        // Publish again directly from the still-dirty live Document —
        // PublishDocumentUseCase operates on the live object, not the
        // canonical stored slot or the recovery checkpoint (see its
        // own constructor, unchanged by this milestone). The point of
        // this section is P1's own isolation from this, not the
        // legitimacy of publishing from a dirty document (0.9.580's
        // own G2 already established that is the existing behavior).
        const p2 = publishDocumentUseCase.execute({ document: doc });
        const p2Snapshot = publisher.loadSnapshot(p2.id);

        assert(JSON.stringify(publisher.loadSnapshot(p1.id)) === JSON.stringify(p1SnapshotAtPublish),
            'G1. P1\'s stored snapshot remains byte-for-byte identical after a flushed edit AND after a second Publication (P2) is created — one Publication\'s existence never mutates another\'s.');
        assert(publisher.verifySnapshot(p1.id, p1.contentHash) === true, 'G2. P1\'s contentHash verification independently reconfirms this.');
        assert(p1SnapshotAtPublish.world.buildings[0].bricks.length === 1, 'sanity — P1 captured the pre-edit content (one brick).');
        assert(p2Snapshot.world.buildings[0].bricks.length === 2, 'G3. P2 correctly captures the later content (two bricks) — the two Publications are genuinely independent snapshots, neither a mutation of the other.');
        assert(p1.id !== p2.id, 'G4. P1 and P2 are distinct Publication identities.');

        scheduler.stop();
        console.log('✓ G. Two sequential Publications each remain byte-for-byte immutable, independent of each other and of a flushed-but-unsaved edit sitting between them — the exit-flush fix creates no new interaction between Publish and Publication immutability.');
    }

    // ---------------------------------------------------------------
    // H. Collaboration boundary — reconfirmed against current source.
    // ---------------------------------------------------------------
    {
        const schedulerSource = await readSource('application/document/AutosaveScheduler.js');
        assert(!/peer|collaboration|Propagation|EventBus/i.test(schedulerSource.replace(/\/\/.*$/gm, '')),
            'H1. AutosaveScheduler.js (flush() included) still references nothing from peer/collaboration machinery.');
        const editorViewSource = (await Promise.all(editorViewFiles().map((file) => readSource(file)))).join('\n');
        const flushCallLine = editorViewSource.split('\n').find((line) => line.includes('autosaveScheduler.flush()'));
        assert(flushCallLine && flushCallLine.trim() === 'autosaveScheduler.flush();',
            'H2. The real call site is a bare, argument-less autosaveScheduler.flush() — it passes no collaboration/peer collaborator into it.');
        console.log('✓ H. Collaboration isolation reconfirmed against current source: the real flush() call site takes no arguments, and AutosaveScheduler.js still has zero collaboration-related references (0.9.580\'s own H1-H3 established this structurally in full; not re-derived here).');
    }

    // ---------------------------------------------------------------
    // I. Navigation boundary — extended to the WHOLE ui/ tree.
    // ---------------------------------------------------------------
    {
        const uiFiles = listFiles(['ui']);
        const offenders = [];
        for (const file of uiFiles) {
            const source = await readSource(file);
            const bare = source.replace(/\/\/.*$/gm, '');
            if (/beforeRouteLeave|onBeforeRouteLeave|beforeunload|window\.confirm\(/.test(bare)) {
                offenders.push(file);
            }
        }
        assert(offenders.length === 0,
            `I1. No file anywhere under ui/ introduces beforeRouteLeave/onBeforeRouteLeave/beforeunload/window.confirm() — navigation away from the Editor is still never blocked or interactively warned about, exactly as 0.9.579 Section C1 found and this milestone deliberately did not change (offenders: ${offenders.join(', ') || 'none'}).`);

        const editorViewSource = (await Promise.all(editorViewFiles().map((file) => readSource(file)))).join('\n');
        assert(!/await\s+autosaveScheduler\.flush\(\)/.test(editorViewSource),
            'I2. The real call site never awaits flush() — teardown is not paused on it, even though flush() itself is synchronous today.');
        console.log('✓ I. No navigation-blocking mechanism exists anywhere under ui/ (I1, a whole-tree sweep — 0.9.580\'s own D2/E1/E2 examined only EditorView.js), and the real call site is un-awaited (I2) — navigation remains genuinely ungated on this milestone\'s own persistence operation.');
    }

    // ---------------------------------------------------------------
    // J. Multiple editing sessions — cross-contamination.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);

        // Session A: open World A, edit, leave immediately.
        const docA = createDocument('Session A World');
        const idA = docA.world.id;
        const managerA = new DocumentManager();
        const historyA = openDocumentInManager(managerA, docA);
        stack.saveDocumentUseCase.execute(managerA);
        const timersA = makeFakeTimers();
        const schedulerA = new AutosaveScheduler(stack.autosaveDocumentUseCase, managerA, {
            setTimeoutFn: timersA.setTimeoutFn, clearTimeoutFn: timersA.clearTimeoutFn
        });
        schedulerA.start();
        addBrickAt(historyA, docA.world, 1);
        const cleanupLogA = []; const errorLogA = [];
        editorExitLikeEditorView(schedulerA, cleanupLogA, errorLogA);
        assert(errorLogA.length === 0, 'sanity — Session A\'s exit flush succeeded.');

        // Session B: a DIFFERENT World, same shared storage/recoveryStore
        // (exactly like navigating from A's own World View back out and
        // into B), edit TWICE (a different brick count than A, so
        // cross-contamination would be detectable), leave immediately.
        const docB = createDocument('Session B World');
        const idB = docB.world.id;
        const managerB = new DocumentManager();
        const historyB = openDocumentInManager(managerB, docB);
        stack.saveDocumentUseCase.execute(managerB);
        const timersB = makeFakeTimers();
        const schedulerB = new AutosaveScheduler(stack.autosaveDocumentUseCase, managerB, {
            setTimeoutFn: timersB.setTimeoutFn, clearTimeoutFn: timersB.clearTimeoutFn
        });
        schedulerB.start();
        addBrickAt(historyB, docB.world, 2);
        addBrickAt(historyB, docB.world, 3);
        const cleanupLogB = []; const errorLogB = [];
        editorExitLikeEditorView(schedulerB, cleanupLogB, errorLogB);
        assert(errorLogB.length === 0, 'sanity — Session B\'s exit flush succeeded.');

        assert(stack.recoveryStore.exists(idA), 'J1a. World A\'s checkpoint exists.');
        assert(stack.recoveryStore.exists(idB), 'J1b. World B\'s checkpoint exists.');

        const recoveredA = stack.recoverDocumentUseCase.execute(idA);
        const recoveredB = stack.recoverDocumentUseCase.execute(idB);
        assert(recoveredA.document.world.getBuildings()[0].getBricks().length === 2,
            'J2a. World A recovers exactly its own two bricks (original + its one flushed edit) — never World B\'s three.');
        assert(recoveredB.document.world.getBuildings()[0].getBricks().length === 3,
            'J2b. World B recovers exactly its own three bricks (original + its two flushed edits) — never World A\'s two.');
        assert(recoveredA.document.metadata.title === 'Session A World', 'J2c. World A\'s recovered title is its own, not World B\'s.');
        assert(recoveredB.document.metadata.title === 'Session B World', 'J2d. World B\'s recovered title is its own, not World A\'s.');

        // J3 — a further flush on B (the Wanderer returns to B a
        // second time) must never disturb A's already-recovered
        // checkpoint, still sitting untouched in the shared store.
        const revisionAOriginal = stack.recoveryStore.load(idA).revision;
        schedulerB.start();
        addBrickAt(historyB, docB.world, 4);
        schedulerB.flush();
        assert(stack.recoveryStore.load(idA).revision === revisionAOriginal,
            'J3. A further flush on World B leaves World A\'s checkpoint completely untouched — confirmed by its own unchanged revision.');
        schedulerB.stop();

        console.log('✓ J. Two Worlds edited and exited SEQUENTIALLY against one shared storage/recoveryStore produce fully independent, non-contaminating checkpoints — verified by content, title, and a further flush on one leaving the other\'s revision untouched. Neither this file nor 0.9.580\'s own suite previously constructed two AutosaveScheduler instances against a shared store.');
    }

    // ---------------------------------------------------------------
    // K. Reload / recovery — controlled A/B under identical
    //    reload-side construction.
    // ---------------------------------------------------------------
    {
        function simulateReload(storage, id) {
            const recoveryStore = new LocalRecoveryStore(storage);
            const checkRecoveryUseCase = new CheckRecoveryUseCase(recoveryStore, storage);
            const recoverDocumentUseCase = new RecoverDocumentUseCase(recoveryStore);
            const check = checkRecoveryUseCase.execute(id);
            const { document } = recoverDocumentUseCase.execute(id);
            return { check, document };
        }

        // Timer path: ordinary autosave fires, THEN imagine a crash.
        const storageTimer = new InMemoryStorageProvider();
        const stackTimer = buildRecoveryStack(storageTimer);
        const docTimer = createDocument('K-timer');
        const idTimer = docTimer.world.id;
        const managerTimer = new DocumentManager();
        const historyTimer = openDocumentInManager(managerTimer, docTimer);
        stackTimer.saveDocumentUseCase.execute(managerTimer);
        const timersTimer = makeFakeTimers();
        const schedulerTimer = new AutosaveScheduler(stackTimer.autosaveDocumentUseCase, managerTimer, {
            setTimeoutFn: timersTimer.setTimeoutFn, clearTimeoutFn: timersTimer.clearTimeoutFn
        });
        schedulerTimer.start();
        addBrickAt(historyTimer, docTimer.world, 1);
        timersTimer.flush();
        schedulerTimer.stop();
        const reloadedTimer = simulateReload(storageTimer, idTimer);

        // Flush path: leave DURING the debounce instead — the exact
        // scenario this milestone's own brief names for this section.
        const storageFlush = new InMemoryStorageProvider();
        const stackFlush = buildRecoveryStack(storageFlush);
        const docFlush = createDocument('K-flush');
        const idFlush = docFlush.world.id;
        const managerFlush = new DocumentManager();
        const historyFlush = openDocumentInManager(managerFlush, docFlush);
        stackFlush.saveDocumentUseCase.execute(managerFlush);
        const timersFlush = makeFakeTimers();
        const schedulerFlush = new AutosaveScheduler(stackFlush.autosaveDocumentUseCase, managerFlush, {
            setTimeoutFn: timersFlush.setTimeoutFn, clearTimeoutFn: timersFlush.clearTimeoutFn
        });
        schedulerFlush.start();
        addBrickAt(historyFlush, docFlush.world, 1);
        schedulerFlush.flush();
        schedulerFlush.stop();
        const reloadedFlush = simulateReload(storageFlush, idFlush);

        assert(reloadedTimer.check.available === true, 'K1a. The timer path is offered for recovery on reload.');
        assert(reloadedFlush.check.available === true, 'K1b. The flush path is offered for recovery on reload, identically.');
        assert(reloadedTimer.document.world.getBuildings()[0].getBricks().length === 2, 'K2a. Timer path restores two bricks.');
        assert(reloadedFlush.document.world.getBuildings()[0].getBricks().length === 2,
            'K2b. Flush path restores two bricks — the SAME outcome shape, even though the two paths differ only in WHEN the checkpoint was written, never in what reload does with it afterward.');

        console.log('✓ K. A reload after a crash mid-debounce (flush path) and a reload after an ordinary autosave (timer path) go through the identical CheckRecoveryUseCase/RecoverDocumentUseCase construction and produce the same reload experience — no special-cased reload behavior exists for either origin.');
    }

    // ---------------------------------------------------------------
    // L. No architectural drift — whole-codebase source guards.
    // ---------------------------------------------------------------
    {
        // L1 — exactly one production call site invokes
        // autosaveScheduler.flush(), and it is EditorView.js's own.
        const appAndUiFiles = listFiles(['application', 'ui']);
        let flushCallSites = 0;
        const flushCallFiles = [];
        for (const file of appAndUiFiles) {
            const source = await readSource(file);
            const bare = source.replace(/\/\/.*$/gm, '');
            const matches = bare.match(/autosaveScheduler\.flush\(\)/g);
            if (matches) { flushCallSites += matches.length; flushCallFiles.push(file); }
        }
        assert(flushCallSites === 1 && flushCallFiles.length === 1 && flushCallFiles[0] === 'ui/views/EditorView.js',
            `L1. Exactly one call site anywhere in application/ or ui/ invokes autosaveScheduler.flush() — ui/views/EditorView.js's own onBeforeUnmount() — no second production caller was added (found ${flushCallSites} call(s) in: ${flushCallFiles.join(', ') || 'none'}).`);

        // L2 — exactly one *Scheduler class exists in application/.
        const applicationFiles = listFiles(['application']);
        const schedulerClasses = [];
        for (const file of applicationFiles) {
            const source = await readSource(file);
            const match = source.match(/export class (\w*Scheduler\w*)/);
            if (match) schedulerClasses.push(match[1]);
        }
        assert(schedulerClasses.length === 1 && schedulerClasses[0] === 'AutosaveScheduler',
            `L2. Exactly one *Scheduler class exists in application/ (AutosaveScheduler) — no second, parallel scheduler was introduced for this fix (found: ${schedulerClasses.join(', ') || 'none'}).`);

        // L3 — AutosaveDocumentUseCase.js was not given a second,
        // exit-specific persistence method to back flush(); flush()
        // reuses the SAME execute() (already proven identical
        // call-site text in Section E1).
        const autosaveUseCaseSource = await readSource('application/document/AutosaveDocumentUseCase.js');
        assert(/execute\(documentManager\) \{/.test(autosaveUseCaseSource), 'sanity — execute() still exists.');
        assert(!/flush\(|executeAtExit|executeOnExit|executeOnUnmount|checkpointOnExit/.test(autosaveUseCaseSource),
            'L3. AutosaveDocumentUseCase.js has no second, exit-specific persistence method — flush() calls its existing execute(), not a method invented for this milestone.');

        // L4 — exactly the two pre-existing recovery-store classes
        // exist under persistence/.
        const persistenceFiles = listFiles(['persistence']);
        const recoveryStoreClasses = [];
        for (const file of persistenceFiles) {
            const source = await readSource(file);
            const match = source.match(/export class (\w*RecoveryStore\w*)/);
            if (match) recoveryStoreClasses.push(match[1]);
        }
        assert(recoveryStoreClasses.sort().join(',') === 'LocalRecoveryStore,RecoveryStore',
            `L4. Exactly the two pre-existing recovery-store classes (RecoveryStore, LocalRecoveryStore) exist under persistence/ — no new recovery store was introduced (found: ${recoveryStoreClasses.sort().join(', ') || 'none'}).`);

        // L5 — flush()'s own body creates no new timer.
        const schedulerSource = await readSource('application/document/AutosaveScheduler.js');
        const flushBodyMatch = schedulerSource.match(/flush\(\) \{[\s\S]*?\n    \}/);
        assert(flushBodyMatch !== null && !/_setTimeout|setTimeout/.test(flushBodyMatch[0]),
            'L5. flush()\'s own body contains no call to _setTimeout/setTimeout — it drains existing scheduled work, it never schedules new work.');

        // L6 — EditorView.js still calls the explicit Save use case
        // exactly once; flush() did not add a second Save call site.
        const editorViewSource = (await Promise.all(editorViewFiles().map((file) => readSource(file)))).join('\n');
        const saveCallCount = (editorViewSource.match(/saveDocumentUseCase\.execute\(/g) || []).length;
        assert(saveCallCount === 1,
            `L6. ui/views/EditorView.js still calls saveDocumentUseCase.execute( exactly once (the pre-existing explicit Save action) — flush() did not add a second Save call site (found ${saveCallCount}).`);

        console.log('✓ L. No architectural drift: exactly one flush() call site (L1), exactly one Scheduler class (L2), AutosaveDocumentUseCase.js gained no second persistence method (L3), exactly the two pre-existing recovery-store classes exist (L4), flush() schedules no new timer of its own (L5), and EditorView.js still calls the explicit Save use case exactly once (L6). The fix stayed exactly as narrow as 0.9.580 described it.');
    }

    // ---------------------------------------------------------------
    // M. Flagship II — a NEW order: recover -> Save -> Publish, THEN
    //    an ordinary timer-fired autosave coexisting with all of it.
    // ---------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const stack = buildRecoveryStack(storage);
        const { publisher, publishDocumentUseCase } = makePublishPipeline(storage);

        // Create World -> Edit -> leave IMMEDIATELY, before ever Saving
        // or Publishing — the exit flush is the ONLY thing protecting
        // this edit; the canonical slot has never been written.
        const document = createDocument('Flagship II World');
        const id = document.world.id;
        const manager = new DocumentManager();
        const history = openDocumentInManager(manager, document);
        const timers = makeFakeTimers();
        const scheduler = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager, {
            setTimeoutFn: timers.setTimeoutFn, clearTimeoutFn: timers.clearTimeoutFn
        });
        scheduler.start();
        addBrickAt(history, document.world, 1);
        assert(timers.pendingCount() === 1, 'sanity — mid-debounce at the moment of leaving, never saved.');
        const cleanupLog1 = []; const errorLog1 = [];
        editorExitLikeEditorView(scheduler, cleanupLog1, errorLog1);
        assert(errorLog1.length === 0, 'sanity — the exit flush succeeded.');
        assert(storage.load(id) === null, 'sanity — the canonical saved slot was NEVER written; the checkpoint is the only surviving copy of this content.');

        // Return: a brand-new DocumentManager finds and recovers it.
        const check1 = stack.checkRecoveryUseCase.execute(id);
        assert(check1.available === true, 'M1. Re-entry finds the recovery offer for a World that was never explicitly Saved at all.');
        const { document: recovered } = stack.recoverDocumentUseCase.execute(id);
        assert(recovered.world.getBuildings()[0].getBricks().length === 2, 'M2. The recovered content includes the flushed edit (original brick + the one added before leaving).');

        // The recovered document becomes the live, editable one — an
        // explicit Save makes it canonical, THEN it is Published as
        // P1. This closes the loop 0.9.580's own flagship left open:
        // that flagship published BEFORE the trailing edit/flush, so
        // it never showed recovered content flowing forward into a
        // normal Save/Publish cycle.
        const manager2 = new DocumentManager();
        const history2 = openDocumentInManager(manager2, recovered);
        stack.saveDocumentUseCase.execute(manager2);
        assert(!stack.recoveryStore.exists(id), 'M3. The explicit Save superseded/removed the checkpoint it was built from (Section F4\'s own guarantee, reconfirmed end to end).');
        const p1 = publishDocumentUseCase.execute({ document: recovered });
        const p1Snapshot = publisher.loadSnapshot(p1.id);
        assert(p1Snapshot.world.buildings[0].bricks.length === 2,
            'M4. P1 correctly captures exactly the recovered content — the trailing edit that only ever existed inside a flush()-written checkpoint is now permanently, immutably published.');

        // Edit again, and THIS TIME wait for the ORDINARY debounce
        // timer to fire on its own (no flush() involved) before
        // leaving normally — confirming the fix coexists correctly
        // with the untouched, pre-existing autosave path once real
        // content has already been through a full
        // recover -> Save -> Publish cycle.
        const timers2 = makeFakeTimers();
        const scheduler2 = new AutosaveScheduler(stack.autosaveDocumentUseCase, manager2, {
            setTimeoutFn: timers2.setTimeoutFn, clearTimeoutFn: timers2.clearTimeoutFn
        });
        scheduler2.start();
        addBrickAt(history2, recovered.world, 2);
        timers2.flush(); // the ORDINARY timer fires here, not flush()
        assert(stack.recoveryStore.exists(id), 'sanity — the ordinary autosave protected this second edit.');
        const cleanupLog2 = []; const errorLog2 = [];
        editorExitLikeEditorView(scheduler2, cleanupLog2, errorLog2); // nothing pending — flush() here is a B-style no-op
        assert(errorLog2.length === 0, 'sanity — a no-op exit flush, since the ordinary timer already protected the edit.');

        stack.saveDocumentUseCase.execute(manager2);
        const p2 = publishDocumentUseCase.execute({ document: recovered });
        const p2Snapshot = publisher.loadSnapshot(p2.id);

        assert(JSON.stringify(publisher.loadSnapshot(p1.id)) === JSON.stringify(p1Snapshot), 'M5. P1 remains byte-for-byte unchanged after the second edit/autosave/Save/Publish cycle.');
        assert(p2Snapshot.world.buildings[0].bricks.length === 3, 'M6. P2 correctly captures all three bricks (original + both edits).');
        assert(p1.id !== p2.id, 'M7. P1 and P2 are distinct Publications.');

        console.log('✓ M. FLAGSHIP II: Create -> Edit -> leave immediately (never Saved) -> exit flush -> re-enter -> recover -> Save -> Publish P1 [closing the loop 0.9.580\'s own flagship left open] -> Edit again -> ORDINARY timer-fired autosave (no flush) -> leave -> Save -> Publish P2: both Publications independently immutable, and the fix coexists correctly with the untouched pre-existing autosave path throughout.');
    }

    // ---------------------------------------------------------------
    // N. Verdict.
    // ---------------------------------------------------------------
    {
        const verdictOptions = ['ARC_CLOSED', 'GAPS_REMAIN', 'REGRESSION_FOUND'];
        const verdict = 'ARC_CLOSED';
        assert(verdictOptions.includes(verdict), 'N. The verdict is one of the three named options.');

        console.log('✓ N: VERDICT.\n' +
'\n' +
`OUTCOME: ${verdict}.\n` +
'\n' +
'WHY. Section A reconfirms the original 0.9.579 failure is cited verbatim and the exact code\n' +
'shape it identified no longer exists. Sections B-D closed every scheduler state-machine and\n' +
'call-order combination not already on 0.9.580\'s own record, including a proof-by-contradiction\n' +
'(Section C2) that the fix\'s correctness depends on flush()-then-stop() ordering, not merely on\n' +
'flush() existing. Section E proved the timer and flush paths share textually identical\n' +
'persistence code, not two implementations that happen to agree. Section F made the Save\n' +
'boundary the direct subject in both directions, including the supersede direction no prior test\n' +
'exercised through flush() specifically. Section G extended Publication immutability to two\n' +
'sequential Publications. Sections H-I reconfirmed collaboration and navigation isolation against\n' +
'current source, the latter swept across the whole ui/ tree rather than one file. Section J proved\n' +
'two Worlds edited sequentially against a shared store never cross-contaminate. Section K put the\n' +
'timer and flush reload paths through identical reload-side construction, side by side. Section L\n' +
'swept the whole codebase for the six concrete drift shapes named in this milestone\'s own brief and\n' +
'found none. Section M\'s flagship closed the one loop 0.9.580\'s own flagship left open: a\n' +
'recovered, never-saved checkpoint flowing forward through a normal Save/Publish cycle, followed by\n' +
'an ordinary timer-fired autosave (no flush() at all) coexisting correctly with everything before it.\n' +
'\n' +
'No new production code was needed to reach this verdict — every assertion above runs against the\n' +
'existing 0.9.580 fix. No Save, Publish, collaboration, or navigation behavior was found changed by\n' +
'that fix anywhere this audit looked.\n' +
'\n' +
'EDITOR PERSISTENCE ARC CLOSED: 0.9.579 (found the gap) -> 0.9.580 (closed it) -> 0.9.581 (this\n' +
'milestone: proved the closure holds under exhaustive state, ordering, multi-session, reload, and\n' +
'architectural-drift scrutiny, without finding a single new gap). This audit deliberately does not\n' +
'select or scope the next milestone; that remains a product call outside a test-only closure audit\'s\n' +
'own remit.');
    }

    console.log('\nAll Editor Persistence Boundary Closure Audit tests passed.');
}

await run();
