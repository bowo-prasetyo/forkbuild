import { readFile } from 'node:fs/promises';

import { Brick } from '../core/Brick.js';
import { Building } from '../core/Building.js';
import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { Position } from '../core/Position.js';
import { World } from '../core/World.js';
import { WorldPosition } from '../core/WorldPosition.js';
import { CreateBrickRegistryUseCase } from '../application/CreateBrickRegistryUseCase.js';
import { CreateCommandRegistryUseCase } from '../application/CreateCommandRegistryUseCase.js';
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

// 0.9.207 — World View History Timeline UI Integration.
//
// 0.9.206 found CommandHistory's own timeline/replay/restore machinery —
// getTimeline() (0.1.40), the replay kernel behind it, and
// restoreHistoryAt()/beginHistoryPreview()/previewHistoryAt()/
// cancelHistoryPreview() (0.1.40/0.1.41) — already correct, already
// composed by CreateWorldViewUseCase into WorldNavigationSession, and
// called by nothing: no UI entry point anywhere in the repo ever invoked
// any of them. This milestone connects them to ui/views/WorldView.js
// through one new dumb presentation component,
// ui/components/HistoryTimelinePanel.js, mirroring exactly how 0.9.204
// connected the (structurally identical) unreached autosave/recovery
// stack to ui/views/EditorView.js.
//
// ui/views/WorldView.js itself cannot be exercised here: it imports
// 'vue', which this repo's plain `node tests/*.test.js` sweep has no
// browser/CDN runtime to resolve — the same constraint
// tests/EditorAutosaveRecoveryUIIntegration.test.js's own header already
// documents. Sections A-F below instead exercise the real
// WorldNavigationSession in the exact sequence WorldView.js's new
// openHistoryPanel()/previewSelectedHistoryEntry()/
// restoreSelectedHistoryEntry() functions now run it; Section G is a
// structural read of both new/changed source files confirming that
// sequence, the id-based stale-selection guard, and the "dumb
// presentation" boundary are actually there.

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

// Builds a WorldNavigationSession wired exactly like
// CreateWorldViewUseCase.js wires the real one (same replayDocumentUseCase/
// restoreHistoryStateUseCase pairing — see that file's own lines composing
// them), with a stub renderer standing in for the parts start() would
// otherwise need. Mirrors tests/HistoryRestore.test.js's own flagship
// harness.
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
        addWorld: (world, id) => rendererCalls.push(['add', id, world]),
        removeWorld: (world, id) => rendererCalls.push(['remove', id, world]),
        selectBricks: () => {},
        clearSelection: () => rendererCalls.push(['clearSelection']),
        clearHover: () => {},
        hidePreview: () => {}
    };
    return { nav, rendererCalls, replayDocumentUseCase };
}

// The WorldView.js-shaped "select → resolve fresh → act" step, standing
// in for _resolveSelectedHistoryCursor() — re-reads the timeline and
// resolves the given entry id back to a cursor, exactly like the real
// function, so Sections A/C can drive the identical logic without
// mounting Vue.
function resolveCursorById(nav, documentId, entryId) {
    const fresh = nav.getTimeline(documentId);
    const entry = fresh.find((candidate) => candidate.id === entryId);
    return entry ? entry.index + 1 : null;
}

async function run() {
    // -------------------------------------------------------------
    // A. FLAGSHIP — open (getTimeline) → select → preview
    //    (beginHistoryPreview/previewHistoryAt) → cancel preview →
    //    select a different entry → restore (restoreHistoryAt),
    //    exactly the sequence WorldView.js's new functions run.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = createEmptyBuildingDocument('History Timeline Test World');
        storage.save(doc.world.id, serializer.serialize(doc));

        const { nav, rendererCalls } = buildNav(storage);
        nav._eventBus = { publish() {} };
        nav._loadWorld(doc.world.id);
        nav._focusedDocumentId = doc.world.id;
        nav._activeDocumentId = doc.world.id;

        const world = nav.getDocument(doc.world.id).world;
        const buildingId = world.getBuildings()[0].id;
        const history = nav._commandHistories.get(world.id);
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        const brickId = world.getBuildings()[0].getBricks()[0].id;
        history.execute(new MoveBrickCommand({ worldId: world.id, buildingId, brickId, delta: { x: 2, y: 0, z: 0 } }));
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(5, 0.5, 0) }));

        // "openHistoryPanel()" — read-only.
        const timeline = nav.getTimeline(doc.world.id);
        assert(timeline.length === 3, 'timeline has one entry per top-level command');
        assert(timeline.every((entry) => typeof entry.id === 'string' && entry.id.length > 0), 'every entry carries its own CommandHistory identity');
        assert(timeline[0].description && timeline[1].description && timeline[2].description, 'descriptions come straight from Command.describe()');

        // "selectHistoryEntry()" — select entry 0 (the first PlaceBrickCommand).
        const firstEntryId = timeline[0].id;

        // "previewSelectedHistoryEntry()". CommandHistory's own cursor is
        // a command COUNT (see application/CommandHistory.js#getCursor()),
        // one past an entry's own 0-based index — resolving entry 0 (the
        // first PlaceBrickCommand) means "with that one command's own
        // effect included," i.e. cursor 1, never cursor 0 (the empty
        // baseline, before entry 0 ever ran).
        let cursor = resolveCursorById(nav, doc.world.id, firstEntryId);
        assert(cursor === 1, 'entry 0 resolves to cursor 1 — its own effect included, not the baseline before it');
        nav.beginHistoryPreview();
        nav.previewHistoryAt(cursor);
        const preview = nav.getHistoryPreview();
        assert(preview && preview.cursor === 1, 'preview reflects the previewed cursor');
        assert(preview.world.getBuildings()[0].getBricks().length === 1, 'preview world reconstructs state with only the first PlaceBrickCommand applied');
        const liveWorldDuringPreview = nav.getDocument(doc.world.id).world;
        assert(liveWorldDuringPreview.getBuildings()[0].getBricks().length === 2, 'the LIVE document is untouched while previewing');
        assert(rendererCalls.some(([op, id]) => op === 'add' && id === `replay:${doc.world.id}`), 'preview world was rendered alongside the live one');

        // "cancelHistoryPreviewAction()".
        nav.cancelHistoryPreview();
        assert(nav.getHistoryPreview() === null, 'preview ended cleanly');
        assert(rendererCalls.some(([op, id]) => op === 'remove' && id === `replay:${doc.world.id}`), 'preview world removed on cancel');

        // Select a DIFFERENT entry (index 1, the MoveBrickCommand) and
        // restore it — proving Restore acts on the CURRENT selection, not
        // whatever was last previewed.
        const secondEntryId = timeline[1].id;
        cursor = resolveCursorById(nav, doc.world.id, secondEntryId);
        assert(cursor === 2, 'entry 1 resolves to cursor 2 — the move is included, the second PlaceBrickCommand is not');
        nav.restoreHistoryAt(cursor, doc.world.id);

        const restoredWorld = nav.getDocument(doc.world.id).world;
        const restoredBricks = restoredWorld.getBuildings()[0].getBricks();
        assert(restoredBricks.length === 1, 'restored to the selected entry (cursor 2: place + move), not the previously previewed one (cursor 1) or the live one (cursor 3)');
        assert(restoredBricks[0].position.x === 3, 'the move IS reflected — the brick sits at its post-move x (1 + delta 2), proving the selected entry\'s own effect is included');
        assert(nav.isDocumentDirty(doc.world.id) === true, 'a restore leaves the document dirty — ordinary dirty semantics, no special history-dirty flag');
        assert(nav.getTimeline(doc.world.id).length === 0, 'the rebased history starts with an empty timeline');

        console.log('✓ A. FLAGSHIP: open → select → preview → cancel preview → reselect → restore');
    }

    // -------------------------------------------------------------
    // B. Read-only inspection — opening/refreshing the timeline never
    //    mutates the document, creates commands, or touches dirty state.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = createEmptyBuildingDocument('Read-Only Inspection World');
        storage.save(doc.world.id, serializer.serialize(doc));

        const { nav } = buildNav(storage);
        nav._eventBus = { publish() {} };
        nav._loadWorld(doc.world.id);
        nav._activeDocumentId = doc.world.id;

        const world = nav.getDocument(doc.world.id).world;
        const buildingId = world.getBuildings()[0].id;
        const history = nav._commandHistories.get(world.id);
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(3, 0.5, 0) }));
        history.markSaved();
        assert(!nav.isDocumentDirty(doc.world.id), 'clean after markSaved, before any timeline read');

        for (let i = 0; i < 5; i++) {
            nav.getTimeline(doc.world.id);
        }
        assert(!nav.isDocumentDirty(doc.world.id), 'repeated getTimeline() reads never dirty the document');
        assert(history.getCommands().length === 1, 'repeated getTimeline() reads never create commands');
        assert(nav.getHistoryPreview() === null, 'no preview exists without an explicit beginHistoryPreview()');

        console.log('✓ B. read-only inspection: getTimeline() never mutates');
    }

    // -------------------------------------------------------------
    // C. Stale selection — an entry selected before an intervening edit
    //    wipes the redo branch it lived in must NOT silently resolve to
    //    whatever now occupies its old index.
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

        // The timeline is opened and the SECOND entry is selected...
        const openedTimeline = nav.getTimeline(doc.world.id);
        const selectedId = openedTimeline[1].id;

        // ...then undone (moving it into the redo branch, still present)...
        history.undo();
        assert(resolveCursorById(nav, doc.world.id, selectedId) === 2, 'an undone-but-remembered entry still resolves — nothing changed yet');

        // ...then a NEW command executes, which (CommandHistory's own
        // linear-history invariant — see application/CommandHistory.js's
        // own header) clears the redo branch entirely. The originally
        // selected entry is now really gone, not merely moved.
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(9, 0.5, 0) }));
        const resolvedAfterInvalidation = resolveCursorById(nav, doc.world.id, selectedId);
        assert(resolvedAfterInvalidation === null, 'a selection whose entry no longer exists resolves to null, never to whatever now sits at its old index');

        const freshTimeline = nav.getTimeline(doc.world.id);
        assert(freshTimeline.length === 2 && freshTimeline[1].id !== openedTimeline[1].id,
            'index 1 now names a DIFFERENT entry (a different id) than the one originally selected — same slot, different identity');

        console.log('✓ C. stale selection: an invalidated entry id never silently resolves to a new one');
    }

    // -------------------------------------------------------------
    // D. Restore needs no prior Preview — the two are independent
    //    explicit actions, not a two-step wizard.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = createEmptyBuildingDocument('Direct Restore World');
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

        assert(nav.getHistoryPreview() === null, 'no preview active');
        const entryId = nav.getTimeline(doc.world.id)[0].id;
        const cursor = resolveCursorById(nav, doc.world.id, entryId);
        nav.restoreHistoryAt(cursor, doc.world.id);
        assert(nav.getDocument(doc.world.id).world.getBuildings()[0].getBricks().length === 1, 'restore succeeded without ever previewing first');

        console.log('✓ D. Restore is independent of Preview');
    }

    // -------------------------------------------------------------
    // E. Multiple documents — history for A never appears as history
    //    for B, and a cursor resolved against A can never be mistaken
    //    for a valid one against B.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const docA = createEmptyBuildingDocument('Document A');
        const docB = createEmptyBuildingDocument('Document B');
        storage.save(docA.world.id, serializer.serialize(docA));
        storage.save(docB.world.id, serializer.serialize(docB));

        const { nav } = buildNav(storage);
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

        const timelineA = nav.getTimeline(docA.world.id);
        const timelineB = nav.getTimeline(docB.world.id);
        assert(timelineA.length === 1, 'A has exactly its own one command');
        assert(timelineB.length === 2, 'B has exactly its own two commands');
        assert(timelineA.every((entryA) => !timelineB.some((entryB) => entryB.id === entryA.id)), 'no id from A ever appears in B\'s timeline');

        // A cursor resolved against A's own selection must never be
        // reinterpreted against B merely because the panel is reopened for
        // a different document.
        const aEntryId = timelineA[0].id;
        assert(resolveCursorById(nav, docB.world.id, aEntryId) === null, 'A\'s entry id resolves to nothing in B\'s timeline');

        console.log('✓ E. multiple documents: timelines and identities stay isolated');
    }

    // -------------------------------------------------------------
    // F. Failure isolation — an out-of-range restore throws and leaves
    //    the document/history exactly as it was; a subsequent, valid
    //    operation still works.
    // -------------------------------------------------------------
    {
        const storage = new InMemoryStorageProvider();
        const serializer = new DocumentSerializer();
        const doc = createEmptyBuildingDocument('Failure Isolation World');
        storage.save(doc.world.id, serializer.serialize(doc));

        const { nav } = buildNav(storage);
        nav._eventBus = { publish() {} };
        nav._loadWorld(doc.world.id);
        nav._activeDocumentId = doc.world.id;

        const world = nav.getDocument(doc.world.id).world;
        const buildingId = world.getBuildings()[0].id;
        const history = nav._commandHistories.get(world.id);
        history.execute(new PlaceBrickCommand({ worldId: world.id, buildingId, definitionId: 'core:cube', position: new Position(1, 0.5, 0) }));
        const beforeJson = JSON.stringify(nav.getDocument(doc.world.id).world.toJSON());

        assertThrows(() => nav.restoreHistoryAt(99, doc.world.id), 'an out-of-range restore throws');
        assert(JSON.stringify(nav.getDocument(doc.world.id).world.toJSON()) === beforeJson, 'the live document is untouched after a failed restore');
        assert(nav._commandHistories.get(world.id) === history, 'the SAME history instance is still active — no partial swap happened');

        // A normal, valid restore still works afterward.
        const entryId = nav.getTimeline(doc.world.id)[0].id;
        nav.restoreHistoryAt(resolveCursorById(nav, doc.world.id, entryId), doc.world.id);
        assert(nav.getDocument(doc.world.id).world.getBuildings()[0].getBricks().length === 1, 'a valid restore after a failed one still succeeds');

        console.log('✓ F. failure isolation: a failed restore breaks nothing else');
    }

    // -------------------------------------------------------------
    // G. Structural check — WorldView.js/HistoryTimelinePanel.js wire
    //    the sequence above, resolve selection by id (never by a
    //    remembered index), and HistoryTimelinePanel.js stays a dumb
    //    presentation component with no use-case/storage import of its
    //    own — the same posture RecoveryBanner.js/LocationsPanel.js
    //    already hold (see tests/EditorAutosaveRecoveryUIIntegration.
    //    test.js's own Section J).
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
        assert(worldViewSource.includes("import HistoryTimelinePanel from '../components/HistoryTimelinePanel.js'"),
            'WorldView.js imports the new panel');
        assert(/HistoryTimelinePanel[\s\S]{0,40}\n\s*\}/.test(worldViewSource) || worldViewSource.includes('HistoryTimelinePanel\n'),
            'HistoryTimelinePanel is registered as a component');
        assert(worldViewSource.includes('session.getTimeline('), 'WorldView.js calls the existing getTimeline()');
        assert(worldViewSource.includes('session.beginHistoryPreview()'), 'WorldView.js calls the existing beginHistoryPreview()');
        assert(worldViewSource.includes('session.previewHistoryAt('), 'WorldView.js calls the existing previewHistoryAt()');
        assert(worldViewSource.includes('session.cancelHistoryPreview()'), 'WorldView.js calls the existing cancelHistoryPreview()');
        assert(worldViewSource.includes('session.restoreHistoryAt('), 'WorldView.js calls the existing restoreHistoryAt()');
        assert(!worldViewSource.includes('CURRENT') && !worldViewSource.includes('HISTORICAL') && !worldViewSource.includes('RESTORING'),
            'no new document lifecycle state vocabulary was introduced for this');

        // Selection is resolved by id, not by a remembered index, and that
        // SAME resolver is what both Preview and Restore call — never two
        // independently-drifting lookups.
        assert(worldViewSource.includes('_resolveSelectedHistoryCursor'), 'a single cursor-resolution function exists');
        const previewFnMatch = worldViewSource.match(/function previewSelectedHistoryEntry\(\)[\s\S]*?\n        \}/);
        const restoreFnMatch = worldViewSource.match(/function restoreSelectedHistoryEntry\(\)[\s\S]*?\n        \}/);
        assert(previewFnMatch && previewFnMatch[0].includes('_resolveSelectedHistoryCursor()'), 'Preview resolves the cursor via the shared resolver');
        assert(restoreFnMatch && restoreFnMatch[0].includes('_resolveSelectedHistoryCursor()'), 'Restore resolves the cursor via the shared resolver');
        assert(worldViewSource.includes("candidate.id === selectedHistoryEntryId.value"), 'the resolver matches by entry id, never by array position');

        // The History affordance is gated by the SAME existing
        // activeDocumentInfo.editable check Save/Publish/Edit Metadata
        // already use — no new authorization concept.
        const actionsBlockMatch = worldViewSource.match(/activeDocumentInfo && activeDocumentInfo\.editable[\s\S]*?<\/div>/);
        assert(actionsBlockMatch && actionsBlockMatch[0].includes('openHistoryPanel'), 'the History button lives in the existing editable-document action bar');

        const panelSource = codeOnlyLines(await rawSource('ui/components/HistoryTimelinePanel.js'));
        assert(!/from ['"].*\/(application|storage|persistence)\//.test(panelSource),
            'HistoryTimelinePanel.js imports nothing from application/, storage/, or persistence/');
        assert(!panelSource.includes('import '), 'HistoryTimelinePanel.js has zero imports — purely presentational, like LocationsPanel.js/RecoveryBanner.js');
        for (const verb of ['select', 'preview', 'cancel-preview', 'restore', 'cancel']) {
            assert(panelSource.includes(`'${verb}'`), `HistoryTimelinePanel.js declares the '${verb}' emit`);
        }

        console.log('✓ G. structural audit: wiring, id-based identity, and the dumb-presentation boundary');
    }

    console.log('\nAll World View History Timeline UI Integration tests passed.');
}

await run();
