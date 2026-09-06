import { readFile } from 'node:fs/promises';

import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
import { CreateWorldLandmarkCommand } from '../application/commands/CreateWorldLandmarkCommand.js';
import { MoveBrickCommand } from '../application/commands/MoveBrickCommand.js';
import { PlaceBrickCommand } from '../application/commands/PlaceBrickCommand.js';
import { ReplayDocumentUseCase } from '../application/ReplayDocumentUseCase.js';
import { RestoreHistoryStateUseCase } from '../application/RestoreHistoryStateUseCase.js';
import { SaveDocumentUseCase } from '../application/SaveDocumentUseCase.js';
import { PublishDocumentUseCase } from '../application/PublishDocumentUseCase.js';
import { LoadPublicationDocumentUseCase } from '../application/LoadPublicationDocumentUseCase.js';
import { WorldNavigationSession } from '../application/WorldNavigationSession.js';
import { LocalPublisherProvider } from '../publisher/LocalPublisherProvider.js';
import { StorageProvider } from '../storage/StorageProvider.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// 0.9.208 — World View History Preview/Restore Lifecycle Audit.
//
// 0.9.207 connected CommandHistory's timeline/replay/restore machinery to
// an actual UI entry point for the first time (HistoryTimelinePanel.js +
// WorldView.js) and its own flagship test proved the straight-line
// sequence: open -> select -> preview -> cancel -> reselect -> restore.
// This milestone does not add a feature — it stress-tests the SEAM that
// exposes for the first time, now that preview and restore sit side by
// side: can temporary historical inspection (preview) remain completely
// separate from permanent restoration (restore), ordinary World state,
// and WorldView's own lifecycle?
//
// The audit found three concrete defects in WorldNavigationSession's
// existing beginHistoryPreview()/previewHistoryAt()/cancelHistoryPreview()/
// restoreHistoryAt()/dispose() — all pre-existing, unreached until 0.9.207
// gave them a caller, exactly the shape of defect 0.9.207 itself caught in
// CommandHistory's cursor semantics per its own design record. Each is
// fixed narrowly (a scoping condition, not a new mechanism) and locked
// down by a dedicated section below:
//
//   * Section C — previewHistoryAt() called a second time while already
//     previewing (switching the selected entry without cancelling first,
//     exactly what WorldView.js's previewSelectedHistoryEntry() does) used
//     to remove the LIVE world again (a harmless no-op — it was already
//     hidden) instead of the world actually on screen: the PREVIOUS
//     preview. The previous preview's rendered world was never removed
//     before the new one landed on the same render slot.
//   * Section F — restoreHistoryAt(cursor, documentId) checked only
//     `this._historyPreview.active`, true regardless of WHICH document the
//     preview belonged to. Restoring document B while previewing an
//     unrelated document A wiped A's preview out from under it (no render
//     call ever brought A's live world back) while B's own live world was
//     never removed before the restored one was added on top of it.
//   * Section E (teardown half) — dispose() reset every other piece of
//     history-adjacent session state (commandHistories, loadedDocuments,
//     selection) but not _historyPreview. A stale `active: true` left
//     behind by dispose() permanently blocks undo()/redo() on whatever
//     session state comes next, since both check `_historyPreview.active`
//     before doing anything (see application/WorldNavigationSession.js's
//     own undo()/redo()).
//
// Everything else below found the existing machinery already correct and
// simply locks it down with a test, exactly as this milestone's own brief
// asked for.
//
// Like tests/WorldViewHistoryTimelineIntegration.test.js, ui/views/
// WorldView.js itself cannot be mounted here (it imports 'vue' — no
// browser/CDN runtime under plain `node tests/*.test.js`). Sections that
// are genuinely about WorldView's own lifecycle (panel-close cancelling
// preview, onUnmounted disposing the session) are verified structurally,
// by reading the source directly, exactly like that file's own Section G.

function assert(condition, message) {
    if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

function assertThrows(fn, message) {
    try {
        fn();
        assert(false, message);
    } catch (e) {
        // expected
    }
}

class InMemoryStorageProvider extends StorageProvider {
    constructor() {
        super();
        this._data = new Map();
    }
    save(name, data) { this._data.set(name, JSON.parse(JSON.stringify(data))); }
    load(name) { return this._data.has(name) ? JSON.parse(JSON.stringify(this._data.get(name))) : null; }
    remove(name) { this._data.delete(name); }
    list() { return Array.from(this._data.keys()); }
}

const stubIdentityProvider = {
    currentUser: () => ({ username: 'alice', displayName: 'alice', providerId: 'stub' }),
    sign: (data) => ({ signedBy: 'alice', providerId: 'stub', data })
};

const stubLayoutProvider = {
    getPosition: () => new WorldPosition(0, 0, 0),
    findVisibleDocuments: () => []
};

function createEmptyBuildingDocument(title) {
    const world = new World();
    world.addBuilding(new Building({ creator: 'alice' }));
    return new Document({
        world,
        metadata: new DocumentMetadata({ title, author: 'alice' })
    });
}

// Same harness as tests/WorldViewHistoryTimelineIntegration.test.js —
// wired exactly like CreateWorldViewUseCase.js wires the real session,
// with a stub renderer that records every add/remove call so this suite
// can assert on render-slot bookkeeping directly (which entries got
// shown/hidden, and — critically for Section C/F — whether every add was
// eventually paired with a remove, so nothing was left rendered with no
// way to reach it again).
function buildNav(storage) {
    const commandRegistry = new CreateCommandRegistryUseCase().execute();
    const replayDocumentUseCase = new ReplayDocumentUseCase(commandRegistry);
    const restoreHistoryStateUseCase = new RestoreHistoryStateUseCase(replayDocumentUseCase);
    const rendererCalls = [];
    const nav = new WorldNavigationSession({
        registry: new CreateBrickRegistryUseCase().execute(),
        loadPublicationDocumentUseCase: new LoadPublicationDocumentUseCase(storage),
        worldLayoutProvider: stubLayoutProvider,
        saveDocumentUseCase: new SaveDocumentUseCase(storage),
        publishDocumentUseCase: new PublishDocumentUseCase(new LocalPublisherProvider(storage), stubIdentityProvider),
        replayDocumentUseCase,
        restoreHistoryStateUseCase
    });
    nav._session = {
        addWorld: (world, id) => rendererCalls.push(['add', id]),
        removeWorld: (world, id) => rendererCalls.push(['remove', id]),
        selectBricks: () => {},
        clearSelection: () => rendererCalls.push(['clearSelection']),
        clearHover: () => {},
        hidePreview: () => {},
        dispose: () => rendererCalls.push(['dispose'])
    };
    return { nav, rendererCalls };
}

// Mirrors WorldView.js's _resolveSelectedHistoryCursor(): re-reads the
// timeline fresh and resolves an entry's OWN id back to a cursor, never a
// remembered index.
function resolveCursorById(nav, documentId, entryId) {
    const fresh = nav.getTimeline(documentId);
    const entry = fresh.find((candidate) => candidate.id === entryId);
    return entry ? entry.index + 1 : null;
}

// Every 'add' render call for a given slot prefix must eventually be
// matched by exactly one 'remove' for that same slot — a slot rendered
// twice in a row with no remove in between means something was left on
// screen with no way to reach it again (the Section C/F defects both
// manifested exactly this way). Returns the set of slot ids that are
// currently STILL rendered (net adds outnumber removes) so a test can
// assert precisely which slots, if any, should remain visible.
function stillRendered(rendererCalls) {
    const counts = new Map();
    for (const [op, id] of rendererCalls) {
        if (op !== 'add' && op !== 'remove') continue;
        const delta = op === 'add' ? 1 : -1;
        counts.set(id, (counts.get(id) || 0) + delta);
    }
    const leaked = new Set();
    for (const [id, count] of counts) {
        if (count > 1) {
            throw new Error(`render slot "${id}" was added ${count} times more than it was removed — an orphaned world was left in the renderer`);
        }
        if (count === 1) leaked.add(id);
        if (count < 0) {
            throw new Error(`render slot "${id}" was removed more times than it was added`);
        }
    }
    return leaked;
}

async function run() {
    // -------------------------------------------------------------
    // A. Preview purity — previewing several entries (first, an inner
    //    one, and the CURRENT/latest one) never mutates the live
    //    document, the live CommandHistory, or dirty state. Repeated
    //    open/preview/cancel cycles leave no renderer residue.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = createEmptyBuildingDocument('Preview Purity World');
        storage.save(doc.world.id, serializer.serialize(doc));

        const { nav, rendererCalls } = buildNav(storage);
        nav._eventBus = { publish() {} };
        nav._loadWorld(doc.world.id);
        nav._activeDocumentId = doc.world.id;

        const world = nav.getDocument(doc.world.id).world;
        const buildingId = world.getBuildings()[0].id;
        const history = nav._commandHistories.get(world.id);
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(2, 0.5, 0) }));
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(3, 0.5, 0) }));
        history.markSaved();

        const liveJsonBefore = JSON.stringify(nav.getDocument(doc.world.id).world.toJSON());
        const cursorBefore = history.getCursor();

        for (const cursor of [1, 2, 3]) {
            nav.beginHistoryPreview();
            nav.previewHistoryAt(cursor);
            const preview = nav.getHistoryPreview();
            assert(preview.cursor === cursor, `preview reports cursor ${cursor}`);
            assert(preview.world.getBuildings()[0].getBricks().length === cursor, `preview world reconstructs exactly ${cursor} brick(s)`);

            // The live document/history are untouched by ANY of these,
            // including previewing the CURRENT/latest entry (cursor 3 —
            // the exact state already live) and the first one.
            assert(JSON.stringify(nav.getDocument(doc.world.id).world.toJSON()) === liveJsonBefore, `live document unchanged while previewing cursor ${cursor}`);
            assert(history.getCursor() === cursorBefore, `live history cursor unchanged while previewing cursor ${cursor}`);
            assert(!nav.isDocumentDirty(doc.world.id), `document stays clean while previewing cursor ${cursor} (no command was executed)`);
            assert(nav._loadedDocuments.get(doc.world.id).world === world, 'the SAME live World instance is still installed — preview never swaps it');

            nav.cancelHistoryPreview();
            assert(nav.getHistoryPreview() === null, `preview ${cursor} ends cleanly`);
        }

        // Three full open/preview/cancel cycles: every render slot this
        // ran through is fully balanced — nothing left rendered.
        const leaked = stillRendered(rendererCalls);
        // Only the ORIGINAL live-world "add" from _loadWorld should
        // remain (it was never cancelled/unloaded) — no replay: slot
        // should still be showing.
        assert(leaked.size === 1 && leaked.has(doc.world.id), `only the live world's original render slot remains after 3 preview/cancel cycles — got ${JSON.stringify([...leaked])}`);

        console.log('✓ A. preview purity: first/inner/current entries all preview without touching live state; repeated cycles leave no residue');
    }

    // -------------------------------------------------------------
    // B. Preview vs Restore — the two verbs never overlap in what they
    //    do. Preview never advances the cursor, creates a command, or
    //    marks the document dirty; only Restore does.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = createEmptyBuildingDocument('Preview Is Not Restore World');
        storage.save(doc.world.id, serializer.serialize(doc));

        const { nav } = buildNav(storage);
        nav._eventBus = { publish() {} };
        nav._loadWorld(doc.world.id);
        nav._activeDocumentId = doc.world.id;

        const world = nav.getDocument(doc.world.id).world;
        const buildingId = world.getBuildings()[0].id;
        const history = nav._commandHistories.get(world.id);
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(2, 0.5, 0) }));
        history.markSaved();

        nav.beginHistoryPreview();
        nav.previewHistoryAt(1);
        assert(history.getCommands().length === 2, 'preview creates no new command');
        assert(history.getCursor() === 2, 'preview never advances the cursor');
        assert(!nav.isDocumentDirty(doc.world.id), 'preview never marks the document dirty');
        assert(nav._commandHistories.get(world.id) === history, 'preview never installs a new CommandHistory');
        nav.cancelHistoryPreview();

        // Restore, by contrast, does every one of those things.
        nav.restoreHistoryAt(1, doc.world.id);
        assert(nav.getTimeline(doc.world.id).length === 0, 'restore rebases onto a brand-new, empty timeline (a real mutation of session state)');
        assert(nav.isDocumentDirty(doc.world.id), 'restore leaves the document dirty');
        assert(nav._commandHistories.get(nav.getDocument(doc.world.id).world.id) !== history, 'restore installs a genuinely new CommandHistory');

        console.log('✓ B. Preview ≠ Restore: preview mutates nothing; restore is an ordinary, real mutation');
    }

    // -------------------------------------------------------------
    // C. Preview switching — regression test for the fix: selecting a
    //    DIFFERENT historical entry while already previewing (the exact
    //    sequence WorldView.js's previewSelectedHistoryEntry() runs: it
    //    calls beginHistoryPreview() only once, then previewHistoryAt()
    //    again for every subsequent selection) must not leave the
    //    previous preview's world rendered with no way to reach it.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = createEmptyBuildingDocument('Preview Switching World');
        storage.save(doc.world.id, serializer.serialize(doc));

        const { nav, rendererCalls } = buildNav(storage);
        nav._eventBus = { publish() {} };
        nav._loadWorld(doc.world.id);
        nav._activeDocumentId = doc.world.id;

        const world = nav.getDocument(doc.world.id).world;
        const buildingId = world.getBuildings()[0].id;
        const history = nav._commandHistories.get(world.id);
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(2, 0.5, 0) }));
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(3, 0.5, 0) }));

        nav.beginHistoryPreview();
        nav.previewHistoryAt(1);
        nav.previewHistoryAt(2); // switch selection WITHOUT cancelling first
        nav.previewHistoryAt(3); // switch again
        // At every point, exactly the CURRENT preview cursor's world is
        // the only replay: slot left rendered — the prior two were each
        // swapped out in turn, not stacked up.
        const leakedMidPreview = stillRendered(rendererCalls);
        assert(leakedMidPreview.size === 1 && leakedMidPreview.has(`replay:${doc.world.id}`),
            `only the CURRENT preview's render slot remains after switching entries twice — got ${JSON.stringify([...leakedMidPreview])}`);
        assert(nav.getHistoryPreview().cursor === 3, 'the session reports the LAST previewed cursor, not an earlier one');

        nav.cancelHistoryPreview();
        const leakedAfterCancel = stillRendered(rendererCalls);
        assert(leakedAfterCancel.size === 1 && leakedAfterCancel.has(doc.world.id), 'cancelling after several switches restores exactly the live world, nothing else left rendered');

        console.log('✓ C. preview switching: reselecting an entry mid-preview swaps the render slot instead of stacking orphaned worlds');
    }

    // -------------------------------------------------------------
    // D. Panel-close / lifecycle cleanup — every way the panel or the
    //    preview can end must leave no preview alive. Cancel, selecting
    //    another entry, and restoring are exercised directly above;
    //    this section covers the remaining two: closing the panel and
    //    unmounting WorldView (structural, since WorldView.js itself
    //    can't be mounted here — see this file's own header) and the
    //    session-level half of unmount, dispose().
    // -------------------------------------------------------------
    {
        // --- session-level: dispose() while a preview is active ---
        // (regression test for the fix — see this file's own header)
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = createEmptyBuildingDocument('Teardown World');
        storage.save(doc.world.id, serializer.serialize(doc));

        const { nav } = buildNav(storage);
        nav._eventBus = { publish() {} };
        nav._loadWorld(doc.world.id);
        nav._activeDocumentId = doc.world.id;
        const world = nav.getDocument(doc.world.id).world;
        const buildingId = world.getBuildings()[0].id;
        nav._commandHistories.get(world.id).execute(
            new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) })
        );

        nav.beginHistoryPreview();
        nav.previewHistoryAt(1);
        assert(nav.getHistoryPreview() !== null, 'preview is active before dispose');

        nav.dispose();
        assert(nav._historyPreview === null, 'dispose() clears _historyPreview outright — no stale "active" flag survives it');
        assert(nav.getHistoryPreview() === null, 'getHistoryPreview() reports none after dispose');
        assert(nav.getRetiredHistories(doc.world.id).length === 0, 'getRetiredHistories() is safe and empty after dispose (no throw on the reset field)');

        // A fresh start() after dispose() must never find undo()/redo()
        // gated by a stale preview flag left over from before — the
        // symptom this defect actually caused (see undo()/redo()'s own
        // `_historyPreview.active` guard in WorldNavigationSession.js).
        const storage2 = new InMemoryStorageProvider();
        const doc2 = createEmptyBuildingDocument('Post-Dispose World');
        storage2.save(doc2.world.id, serializer.serialize(doc2));
        nav._loadPublicationDocumentUseCase = new LoadPublicationDocumentUseCase(storage2);
        nav._eventBus = { publish() {} };
        nav._session = { addWorld() {}, removeWorld() {}, selectBricks() {}, clearSelection() {}, clearHover() {}, hidePreview() {}, dispose() {} };
        nav._loadWorld(doc2.world.id);
        nav._activeDocumentId = doc2.world.id;
        const world2 = nav.getDocument(doc2.world.id).world;
        nav._commandHistories.get(world2.id).execute(
            new PlaceBrickCommand({ worldId: world2.id, buildingId: world2.getBuildings()[0].id, definitionId: 'core:cube', position: new Position(5, 0.5, 0) })
        );
        assert(nav.undo() === true, 'undo() works normally on a session reused after dispose() — never permanently blocked by a stale preview');

        // --- structural: WorldView.js's own panel-close/unmount cleanup ---
        const SOURCE_ROOT = new URL('../', import.meta.url);
        const worldViewSource = await readFile(new URL('ui/views/WorldView.js', SOURCE_ROOT), 'utf8');
        const closePanelFn = worldViewSource.match(/function closeHistoryPanel\(\)[\s\S]*?\n        \}/);
        assert(closePanelFn && closePanelFn[0].includes('session.cancelHistoryPreview()'),
            'closeHistoryPanel() cancels an active preview before the panel disappears');
        assert(/onBeforeUnmount\(\(\) => \{[\s\S]*?session\.cancelHistoryPreview\(\)[\s\S]*?session\.dispose\(\);/.test(worldViewSource),
            'onBeforeUnmount ends any active preview before disposing the session — belt-and-suspenders with the dispose() fix above');

        console.log('✓ D. panel-close/lifecycle cleanup: cancel, close, dispose, and WorldView unmount all end an active preview');
    }

    // -------------------------------------------------------------
    // E. Preview immediately followed by Restore of the SAME entry —
    //    does restore naturally terminate the preview, or can a preview
    //    representation remain active after the document underneath it
    //    has already been restored?
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = createEmptyBuildingDocument('Preview Then Restore World');
        storage.save(doc.world.id, serializer.serialize(doc));

        const { nav, rendererCalls } = buildNav(storage);
        nav._eventBus = { publish() {} };
        nav._loadWorld(doc.world.id);
        nav._activeDocumentId = doc.world.id;

        const world = nav.getDocument(doc.world.id).world;
        const buildingId = world.getBuildings()[0].id;
        const history = nav._commandHistories.get(world.id);
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(2, 0.5, 0) }));

        nav.beginHistoryPreview();
        nav.previewHistoryAt(1);
        assert(nav.getHistoryPreview() !== null, 'previewing entry 0');

        nav.restoreHistoryAt(1, doc.world.id); // restore the SAME cursor just previewed

        assert(nav.getHistoryPreview() === null, 'restoring the previewed entry itself ends the preview — no preview representation survives its own restore');
        const leaked = stillRendered(rendererCalls);
        assert(leaked.size === 1 && leaked.has(doc.world.id), `only the (now-restored) document's live slot remains rendered — got ${JSON.stringify([...leaked])}`);
        assert(nav.getDocument(doc.world.id).world.getBuildings()[0].getBricks().length === 1, 'the document reflects the restored state, not the live pre-restore one');

        console.log('✓ E. preview -> restore(same entry): restore cleanly terminates the preview, nothing left showing the old preview representation');
    }

    // -------------------------------------------------------------
    // F. Multiple-document isolation — regression test for the fix:
    //    previewing document A must survive restoring an UNRELATED
    //    document B untouched. A's preview keeps its own render slot and
    //    its own hidden live world; B's restore only ever touches B.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const docA = createEmptyBuildingDocument('Isolation Document A');
        const docB = createEmptyBuildingDocument('Isolation Document B');
        storage.save(docA.world.id, serializer.serialize(docA));
        storage.save(docB.world.id, serializer.serialize(docB));

        const { nav, rendererCalls } = buildNav(storage);
        nav._eventBus = { publish() {} };
        nav._loadWorld(docA.world.id);
        nav._loadWorld(docB.world.id);

        const worldA = nav.getDocument(docA.world.id).world;
        const worldB = nav.getDocument(docB.world.id).world;
        const historyA = nav._commandHistories.get(worldA.id);
        const historyB = nav._commandHistories.get(worldB.id);
        historyA.execute(new PlaceBrickCommand({ worldId: worldA.id, buildingId: worldA.getBuildings()[0].id, definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        historyB.execute(new PlaceBrickCommand({ worldId: worldB.id, buildingId: worldB.getBuildings()[0].id, definitionId: 'core:cube', position: new Position(9, 0.5, 0) }));
        historyB.execute(new PlaceBrickCommand({ worldId: worldB.id, buildingId: worldB.getBuildings()[0].id, definitionId: 'core:cube', position: new Position(9, 1.5, 0) }));

        // Preview A.
        nav._activeDocumentId = docA.world.id;
        nav.beginHistoryPreview();
        nav.previewHistoryAt(1);
        const previewSnapshot = nav.getHistoryPreview();
        assert(previewSnapshot.world.getBuildings()[0].getBricks().length === 1, 'previewing A shows A\'s own reconstructed state');

        // Switch the active document and restore B — a document that has
        // NOTHING to do with the preview currently open on A.
        nav._activeDocumentId = docB.world.id;
        nav.restoreHistoryAt(1, docB.world.id);

        // A's preview must be completely unaffected: still active, still
        // reporting the same cursor/world, still occupying its own slot.
        const previewAfter = nav.getHistoryPreview();
        assert(previewAfter !== null, 'A\'s preview is still active after restoring the unrelated document B');
        assert(previewAfter.cursor === previewSnapshot.cursor && previewAfter.world === previewSnapshot.world, 'A\'s preview object is untouched — not recomputed, not discarded');

        // B's restore did exactly what a restore should: B now reflects
        // cursor 1, dirty, rebased history — and NONE of that touched A.
        assert(nav.getDocument(docB.world.id).world.getBuildings()[0].getBricks().length === 1, 'B is restored to its own selected cursor');
        assert(nav.isDocumentDirty(docB.world.id), 'B is dirty after its own restore');
        assert(nav._commandHistories.get(worldA.id) === historyA, 'A\'s CommandHistory instance is completely untouched by restoring B');
        assert(!nav.isDocumentDirty(docA.world.id) || nav.isDocumentDirty(docA.world.id) === historyA.isDirty(), 'A\'s own dirty state still comes from A\'s own (untouched) history, never from B\'s restore');

        // A's live world was hidden by previewHistoryAt() and must still
        // be exactly the one slot the fix keeps track of — cancelling A's
        // preview now must correctly bring A's live world back, proving
        // the preview record for A was never corrupted by B's restore.
        nav.cancelHistoryPreview();
        assert(nav.getHistoryPreview() === null, 'A\'s preview can still be cancelled cleanly after an unrelated restore happened in between');
        const leaked = stillRendered(rendererCalls);
        assert(!leaked.has(`replay:${docA.world.id}`), 'no orphaned preview slot for A remains after cancelling');
        assert(leaked.has(docA.world.id), 'A\'s live world is visible again after cancelling its preview');
        assert(leaked.has(docB.world.id), 'B\'s restored world is visible (B was never part of the preview at all)');

        console.log('✓ F. multiple-document isolation: previewing A survives restoring an unrelated B untouched, and A\'s preview can still be cancelled correctly afterward');
    }

    // -------------------------------------------------------------
    // G. Stale selection — an entry id resolved before an intervening
    //    edit invalidated it must never resolve to whatever now sits at
    //    its old index, for BOTH preview and restore. Also documents,
    //    structurally, WHERE that guarantee actually lives: CommandHistory
    //    itself only ever deals in numeric cursors — it has no concept of
    //    entry identity — so a caller handing it a stale cursor number
    //    directly gets no protection at all. WorldView.js's id-based
    //    re-resolution (already covered by tests/
    //    WorldViewHistoryTimelineIntegration.test.js's own Sections C/G)
    //    is therefore not optional scaffolding; it is the ONLY place this
    //    invariant can be enforced, and this section proves why.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = createEmptyBuildingDocument('Stale Selection World');
        storage.save(doc.world.id, serializer.serialize(doc));

        const { nav } = buildNav(storage);
        nav._eventBus = { publish() {} };
        nav._loadWorld(doc.world.id);
        nav._activeDocumentId = doc.world.id;

        const world = nav.getDocument(doc.world.id).world;
        const buildingId = world.getBuildings()[0].id;
        const history = nav._commandHistories.get(world.id);
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(2, 0.5, 0) }));

        const opened = nav.getTimeline(doc.world.id);
        const staleId = opened[1].id;
        const staleCursor = resolveCursorById(nav, doc.world.id, staleId); // 2, captured BEFORE the edit below

        // An edit clears the redo branch (CommandHistory's own linear
        // history invariant) — a DIFFERENT entry now occupies index 1.
        history.undo();
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(99, 0.5, 0) }));
        const freshTimeline = nav.getTimeline(doc.world.id);
        assert(freshTimeline.length === 2 && freshTimeline[1].id !== staleId, 'index 1 now names a genuinely different entry');

        // The re-resolution step WorldView.js runs before EVERY Preview
        // and Restore click correctly reports "gone."
        assert(resolveCursorById(nav, doc.world.id, staleId) === null, 're-resolving the stale id finds nothing — never the new occupant of its old index');

        // Structural fact: the raw numeric cursor captured before the
        // edit is NOT, by itself, invalid — CommandHistory has no
        // identity concept, so previewing/restoring at that stale numeric
        // cursor "succeeds" against whatever the timeline looks like NOW.
        // This is exactly why the guarantee has to live in the id-based
        // re-resolution step (proven above), not in CommandHistory itself.
        nav.beginHistoryPreview();
        nav.previewHistoryAt(staleCursor);
        assert(nav.getHistoryPreview().world.getBuildings()[0].getBricks().length === staleCursor, 'a raw stale cursor number is accepted by the session layer — it has no way to know it used to name a different entry');
        nav.cancelHistoryPreview();

        console.log('✓ G. stale selection: the id-based guard is what protects Preview/Restore, and lives exactly where it must — the numeric cursor API offers none itself');
    }

    // -------------------------------------------------------------
    // H. Restore -> ordinary dirty/autosave semantics — no history-
    //    specific autosave path, no new RESTORED/HISTORICAL document
    //    lifecycle state.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = createEmptyBuildingDocument('Restore Autosave World');
        storage.save(doc.world.id, serializer.serialize(doc));

        const { nav } = buildNav(storage);
        nav._eventBus = { publish() {} };
        nav._loadWorld(doc.world.id);
        nav._activeDocumentId = doc.world.id;

        const world = nav.getDocument(doc.world.id).world;
        const buildingId = world.getBuildings()[0].id;
        const historyH = nav._commandHistories.get(world.id);
        historyH.execute(
            new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) })
        );
        historyH.markSaved();

        assert(!nav.isDocumentDirty(doc.world.id), 'clean after markSaved, before restore');
        nav.restoreHistoryAt(1, doc.world.id);
        assert(nav.isDocumentDirty(doc.world.id) === true, 'restore leaves the document dirty via the EXACT SAME isDocumentDirty()/history.isDirty() path any ordinary edit uses');

        // A subsequent ordinary save clears it exactly like any other
        // dirty document — no special "un-restore" step required.
        nav.saveDocument(doc.world.id);
        assert(!nav.isDocumentDirty(doc.world.id), 'an ordinary saveDocument() clears restored-dirty state exactly like any other dirty state');

        // Structural: no history-specific autosave path exists anywhere,
        // and no new document lifecycle vocabulary was introduced.
        const SOURCE_ROOT = new URL('../', import.meta.url);
        const navSource = await readFile(new URL('application/WorldNavigationSession.js', SOURCE_ROOT), 'utf8');
        assert(!/Autosave|Recovery/.test(navSource), 'WorldNavigationSession.js references neither Autosave nor Recovery machinery — restore rides on ordinary dirty state alone');
        assert(!/\bRESTORED\b|\bHISTORICAL\b/.test(navSource), 'no new RESTORED/HISTORICAL document lifecycle state was introduced for history restore');

        const lifecycleSource = await readFile(new URL('application/DocumentLifecycleStatus.js', SOURCE_ROOT), 'utf8');
        assert(!/\bRESTORED\b|\bHISTORICAL\b/.test(lifecycleSource), 'DocumentLifecycleStatus.js itself carries no history-specific status either');

        console.log('✓ H. restore rides on ordinary dirty/autosave/lifecycle machinery — no parallel history-specific path exists');
    }

    // -------------------------------------------------------------
    // I. Recovery independence — RecoveryObserver/CheckRecoveryUseCase
    //    (0.9.204/0.9.205) and history preview/restore (0.1.40/0.1.41,
    //    wired by 0.9.207) are, and remain, two independent observers/
    //    mechanisms with zero cross-references.
    // -------------------------------------------------------------
    {
        const SOURCE_ROOT = new URL('../', import.meta.url);
        const recoveryObserverSource = await readFile(new URL('application/RecoveryObserver.js', SOURCE_ROOT), 'utf8');
        const checkRecoverySource = await readFile(new URL('application/CheckRecoveryUseCase.js', SOURCE_ROOT), 'utf8');
        assert(!/CommandHistory|HistoryPreview|historyPreview|restoreHistoryAt/i.test(recoveryObserverSource), 'RecoveryObserver.js has no idea history preview/restore exist');
        assert(!/CommandHistory|HistoryPreview|historyPreview|restoreHistoryAt/i.test(checkRecoverySource), 'CheckRecoveryUseCase.js has no idea history preview/restore exist');

        const restoreUseCaseSource = await readFile(new URL('application/RestoreHistoryStateUseCase.js', SOURCE_ROOT), 'utf8');
        assert(!/Recovery|Autosave/.test(restoreUseCaseSource), 'RestoreHistoryStateUseCase.js has no idea recovery/autosave exist, and vice versa — genuinely independent mechanisms, not one built to know about the other');

        console.log('✓ I. recovery interaction: recovery and history restore remain two independent mechanisms with no cross-references either direction');
    }

    // -------------------------------------------------------------
    // J. Failure isolation — an invalid preview cursor throws and leaves
    //    _historyPreview exactly as it was (never half-updated), and a
    //    subsequent valid operation still works normally.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = createEmptyBuildingDocument('Preview Failure Isolation World');
        storage.save(doc.world.id, serializer.serialize(doc));

        const { nav } = buildNav(storage);
        nav._eventBus = { publish() {} };
        nav._loadWorld(doc.world.id);
        nav._activeDocumentId = doc.world.id;

        const world = nav.getDocument(doc.world.id).world;
        const buildingId = world.getBuildings()[0].id;
        nav._commandHistories.get(world.id).execute(
            new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) })
        );

        nav.beginHistoryPreview();
        nav.previewHistoryAt(1);
        const goodPreview = nav.getHistoryPreview();

        assertThrows(() => nav.previewHistoryAt(99), 'an out-of-range preview cursor throws');
        // The failed call must not have clobbered the previously GOOD
        // preview state (ReplayDocumentUseCase throws before this._historyPreview
        // is ever written to for the failed attempt).
        assert(nav.getHistoryPreview().cursor === goodPreview.cursor && nav.getHistoryPreview().world === goodPreview.world,
            'a failed previewHistoryAt() leaves the previous, still-valid preview completely intact');

        nav.cancelHistoryPreview();
        assert(nav.getHistoryPreview() === null, 'cancel still works cleanly after an intervening failed preview attempt');

        // Ordinary undo/redo and a subsequent valid preview both still
        // work — a failed preview attempt breaks nothing else.
        assert(nav.undo() === true, 'undo works normally after a failed preview attempt');
        assert(nav.redo() === true, 'redo works normally after a failed preview attempt');
        nav.beginHistoryPreview();
        nav.previewHistoryAt(1);
        assert(nav.getHistoryPreview() !== null, 'a subsequent valid preview still works after the earlier failure');
        nav.cancelHistoryPreview();

        console.log('✓ J. failure isolation: an invalid preview cursor throws cleanly and breaks nothing else');
    }

    // -------------------------------------------------------------
    // K. Cross-subsystem isolation — preview/restore reproduce exactly
    //    what CommandHistory says happened (bricks AND landmarks, via
    //    CommandHistory's own generic replay), never more. No Publication/
    //    Placement registry is touched by either verb.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = createEmptyBuildingDocument('Cross-Subsystem World');
        storage.save(doc.world.id, serializer.serialize(doc));

        const { nav } = buildNav(storage);
        nav._eventBus = { publish() {} };
        nav._loadWorld(doc.world.id);
        nav._activeDocumentId = doc.world.id;

        const world = nav.getDocument(doc.world.id).world;
        const buildingId = world.getBuildings()[0].id;
        const history = nav._commandHistories.get(world.id);
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        history.execute(new CreateWorldLandmarkCommand({ worldId: world.id, authorIdentityId: 'alice', title: 'Waypoint', position: new Position(1, 0.5, 0) }));

        // Preview BEFORE the landmark: it must not exist in the preview
        // world, but the live world (untouched) still has it.
        nav.beginHistoryPreview();
        nav.previewHistoryAt(1);
        assert(nav.getHistoryPreview().world.getWorldLandmarks().length === 0, 'previewing before the landmark command shows a world without it');
        assert(world.getWorldLandmarks().length === 1, 'the LIVE world still has the landmark — preview never touched it');
        nav.cancelHistoryPreview();

        // This document was never published — restoring must not
        // magically publish/unpublish it, and must not touch the
        // placement/publication bookkeeping at all.
        assert(!nav.isPublished || !nav.isPublished(doc.world.id), 'restore is never asked to and never touches publication state');
        nav.restoreHistoryAt(1, doc.world.id);
        assert(nav.getDocument(doc.world.id).world.getWorldLandmarks().length === 0, 'restore reproduces exactly the command sequence up to the chosen cursor — the landmark command is excluded, same as preview showed');
        assert(!nav._publishedDocumentIds.has(doc.world.id), 'restoring never adds the document to _publishedDocumentIds — no accidental publish');

        // Structural: neither method body reaches into publish/placement/
        // storage machinery directly.
        const SOURCE_ROOT = new URL('../', import.meta.url);
        const navSource = await readFile(new URL('application/WorldNavigationSession.js', SOURCE_ROOT), 'utf8');
        const extractMethod = (name) => {
            const re = new RegExp(`\\b${name}\\s*\\([^)]*\\)\\s*\\{`);
            const start = navSource.search(re);
            assert(start !== -1, `${name}() is defined`);
            // Walk braces to find this method's own closing brace.
            let depth = 0, i = navSource.indexOf('{', start);
            const bodyStart = i;
            for (; i < navSource.length; i++) {
                if (navSource[i] === '{') depth++;
                else if (navSource[i] === '}') { depth--; if (depth === 0) break; }
            }
            return navSource.slice(bodyStart, i + 1);
        };
        for (const name of ['previewHistoryAt', 'restoreHistoryAt', 'beginHistoryPreview', 'cancelHistoryPreview']) {
            const body = extractMethod(name);
            assert(!/_saveDocumentUseCase|_publishDocumentUseCase|storage\./.test(body), `${name}() never calls storage/publish machinery directly — only replay + in-memory session/renderer bookkeeping`);
            assert(!/_publishedDocumentIds\.(add|delete)/.test(body), `${name}() never mutates publication bookkeeping`);
        }

        console.log('✓ K. cross-subsystem isolation: preview/restore reproduce exactly what CommandHistory recorded — never more, and never reach into publish/placement machinery directly');
    }

    // -------------------------------------------------------------
    // L. Structural audit — a single CommandHistory implementation is
    //    used throughout (no competing/duplicate history mechanism), and
    //    HistoryTimelinePanel.js (0.9.207) is still a dumb, import-free
    //    presentation component with no direct storage access of its own.
    // -------------------------------------------------------------
    {
        const SOURCE_ROOT = new URL('../', import.meta.url);
        const navSource = await readFile(new URL('application/WorldNavigationSession.js', SOURCE_ROOT), 'utf8');
        assert((navSource.match(/new CommandHistory\(/g) || []).length >= 1, 'WorldNavigationSession.js constructs history state via the ONE CommandHistory class');
        assert(!/class\s+\w*History\w*\s*\{/.test(navSource), 'WorldNavigationSession.js defines no second, competing history class of its own');

        const panelSource = await readFile(new URL('ui/components/HistoryTimelinePanel.js', SOURCE_ROOT), 'utf8');
        const panelCodeOnly = panelSource.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
        assert(!panelCodeOnly.includes('import '), 'HistoryTimelinePanel.js still has zero imports — purely presentational');
        assert(!/from ['"].*\/(application|storage|persistence)\//.test(panelCodeOnly), 'HistoryTimelinePanel.js still imports nothing from application/, storage/, or persistence/');

        console.log('✓ L. structural audit: one CommandHistory implementation, and HistoryTimelinePanel.js remains a dumb presentation component');
    }

    console.log('\nAll World View History Preview/Restore Lifecycle Audit tests passed.');
}

await run();
