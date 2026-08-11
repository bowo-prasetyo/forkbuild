import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { CreateEventBusUseCase } from './CreateEventBusUseCase.js';
import { CreateDemoWorldUseCase } from './CreateDemoWorldUseCase.js';
import { CreateEmptyWorldUseCase } from './CreateEmptyWorldUseCase.js';
import { CreateDocumentManagerUseCase } from './CreateDocumentManagerUseCase.js';
import { RenderWorldUseCase } from './RenderWorldUseCase.js';
import { InputDispatcher } from './InputDispatcher.js';
import { ToolManager } from './ToolManager.js';
import { CommandHistory } from './CommandHistory.js';
import { SelectionState } from './editor-state/SelectionState.js';
import { SpatialClipboardState } from './spatial-state/SpatialClipboardState.js';
import { CopySelectionUseCase } from './CopySelectionUseCase.js';
import { PasteClipboardUseCase, PASTE_OFFSET } from './PasteClipboardUseCase.js';
import { TransformSelectionUseCase } from './TransformSelectionUseCase.js';
import { CreateGroupCommand } from './commands/CreateGroupCommand.js';
import { DeleteGroupCommand } from './commands/DeleteGroupCommand.js';
import { RenameGroupCommand } from './commands/RenameGroupCommand.js';
import { AddToGroupCommand } from './commands/AddToGroupCommand.js';
import { RemoveFromGroupCommand } from './commands/RemoveFromGroupCommand.js';
import { DuplicateGroupCommand } from './commands/DuplicateGroupCommand.js';

// Owns the live runtime graph — the render session, World, CommandHistory,
// ToolManager, InputDispatcher — as one unit, so nothing else has to know
// how to tear it down and rebuild it correctly. EditorView only ever
// calls start()/loadDocument()/newDocument()/dispose() and forwards raw
// DOM events to onPointerDown()/onPointerMove()/onKeyDown() — it never
// touches a World, Renderer, or ToolManager directly, before or after a
// document is replaced.
//
// registry/editorContext/toolRegistry/documentManager/selectionUseCase/
// previewUseCase are constructed once, outside EditorSession, and are the
// SAME instances across every document replacement — only the per-world
// runtime gets torn down and rebuilt. DOM listeners (wired once, by
// EditorView) delegate to this.onPointerDown()/etc. at call time rather
// than capturing toolManager/inputDispatcher directly, so they never need
// to be re-attached when the runtime underneath them changes — only the
// instance fields those methods read get swapped.
//
// As of 0.1.43 EditorSession provides copySelection()/pasteClipboard()
// through the SAME clipboard machinery World View uses. As of 0.1.44 it
// exposes TransformSelectionUseCase through toolContext. As of 0.1.45 it
// is the Editor's GROUP SURFACE: the same six group commands World View
// uses, resolved group selection, select-all, and marquee selection —
// completing surface parity without a second implementation of anything.
export class EditorSession {
    constructor({
        registry,
        editorContext,
        toolRegistry,
        documentManager,
        selectionUseCase,
        previewUseCase,
        loadDocumentUseCase,
        identityProvider = null
    }) {
        this._registry = registry;
        this._editorContext = editorContext;
        this._toolRegistry = toolRegistry;
        this._documentManager = documentManager;
        this._selectionUseCase = selectionUseCase;
        this._previewUseCase = previewUseCase;
        this._loadDocumentUseCase = loadDocumentUseCase;
        this._identityProvider = identityProvider;
        this._transformSelectionUseCase = new TransformSelectionUseCase(registry);
        this._copySelectionUseCase = new CopySelectionUseCase(registry);
        this._pasteClipboardUseCase = new PasteClipboardUseCase();
        this._clipboard = SpatialClipboardState.empty();
        this._pasteCount = 0;
        this._container = null;
        this._session = null;
        this._commandHistory = null;
        this._toolManager = null;
        this._inputDispatcher = null;
        this._untrackDirtyState = null;
    }

    get commandHistory() {
        return this._commandHistory;
    }

    getClipboard() {
        return this._clipboard;
    }

    // -----------------------------------------------------------------
    // Clipboard (0.1.43 — shared machinery, Editor parity)
    // -----------------------------------------------------------------

    copySelection() {
        const selection = this._editorContext.selection;
        if (!selection || selection.isEmpty) {
            return SpatialClipboardState.empty();
        }
        const document = this._documentManager.document;
        if (!document) {
            return SpatialClipboardState.empty();
        }
        this._clipboard = this._copySelectionUseCase.execute(selection, document);
        this._pasteCount = 0;
        return this._clipboard;
    }

    pasteClipboard() {
        if (!this._clipboard || this._clipboard.isEmpty || !this._clipboard.origin) {
            return false;
        }
        if (!this._commandHistory) {
            return false;
        }
        const document = this._documentManager.document;
        if (!document) {
            return false;
        }
        const buildings = document.world.getBuildings();
        if (buildings.length === 0) {
            return false;
        }
        this._pasteCount += 1;
        const position = {
            x: this._clipboard.origin.x + PASTE_OFFSET.x * this._pasteCount,
            y: this._clipboard.origin.y + PASTE_OFFSET.y * this._pasteCount,
            z: this._clipboard.origin.z + PASTE_OFFSET.z * this._pasteCount
        };
        const command = this._pasteClipboardUseCase.execute(this._clipboard, {
            worldId: document.world.id,
            buildingId: buildings[0].id,
            position
        });
        if (!command) {
            return false;
        }
        this._commandHistory.execute(command);
        const buildingId = buildings[0].id;
        const items = command.executedBrickIds.map((brickId) => ({
            type: 'brick',
            buildingId,
            brickId
        }));
        if (items.length > 0) {
            this._editorContext.setSelection(new SelectionState({ items }));
        }
        return true;
    }

    // -----------------------------------------------------------------
    // Groups (0.1.45 — the Editor group surface; same commands as
    // World View, no second implementation)
    // -----------------------------------------------------------------

    getGroups() {
        const document = this._documentManager.document;
        if (!document) {
            return [];
        }
        return document.world.getGroups().map((group) => ({
            id: group.id,
            name: group.name || 'Unnamed Group',
            memberCount: group.memberCount
        }));
    }

    createGroupFromSelection(name = null) {
        const document = this._documentManager.document;
        if (!document || !this._commandHistory) {
            return false;
        }
        const selection = this._editorContext.selection;
        if (!selection || selection.isEmpty) {
            return false;
        }
        const brickIds = selection.brickIds;
        if (brickIds.length === 0) {
            return false;
        }
        const command = new CreateGroupCommand({
            worldId: document.world.id,
            brickIds,
            name: name || `Group ${document.world.getGroups().length + 1}`
        });
        this._commandHistory.execute(command);
        return command.executedGroupId;
    }

    deleteGroup(groupId) {
        const document = this._documentManager.document;
        if (!document || !this._commandHistory || !document.world.getGroup(groupId)) {
            return false;
        }
        this._commandHistory.execute(new DeleteGroupCommand({
            worldId: document.world.id,
            groupId
        }));
        return true;
    }

    renameGroup(groupId, name) {
        const document = this._documentManager.document;
        if (!document || !this._commandHistory || !document.world.getGroup(groupId)) {
            return false;
        }
        this._commandHistory.execute(new RenameGroupCommand({
            worldId: document.world.id,
            groupId,
            name
        }));
        return true;
    }

    duplicateGroup(groupId) {
        const document = this._documentManager.document;
        if (!document || !this._commandHistory || !document.world.getGroup(groupId)) {
            return false;
        }
        const command = new DuplicateGroupCommand({
            worldId: document.world.id,
            groupId
        });
        this._commandHistory.execute(command);
        return command.executedGroupId;
    }

    addToGroupWithSelection(groupId) {
        const document = this._documentManager.document;
        if (!document || !this._commandHistory || !document.world.getGroup(groupId)) {
            return false;
        }
        const selection = this._editorContext.selection;
        if (!selection || selection.isEmpty) {
            return false;
        }
        const brickIds = selection.brickIds;
        if (brickIds.length === 0) {
            return false;
        }
        this._commandHistory.execute(new AddToGroupCommand({
            worldId: document.world.id,
            groupId,
            brickIds
        }));
        return true;
    }

    removeFromGroupWithSelection(groupId) {
        const document = this._documentManager.document;
        if (!document || !this._commandHistory || !document.world.getGroup(groupId)) {
            return false;
        }
        const selection = this._editorContext.selection;
        if (!selection || selection.isEmpty) {
            return false;
        }
        const brickIds = selection.brickIds;
        if (brickIds.length === 0) {
            return false;
        }
        this._commandHistory.execute(new RemoveFromGroupCommand({
            worldId: document.world.id,
            groupId,
            brickIds
        }));
        return true;
    }

    // Selecting a group is a SESSION STATE change — it resolves the
    // group's membership into a SelectionState and produces ZERO
    // history entries. There is deliberately no GroupSelectionCommand.
    selectGroup(groupId) {
        const document = this._documentManager.document;
        if (!document) {
            return false;
        }
        const group = document.world.getGroup(groupId);
        if (!group) {
            return false;
        }
        const items = [];
        for (const building of document.world.getBuildings()) {
            for (const brick of building.getBricks()) {
                if (group.hasMember(brick.id)) {
                    items.push({ type: 'brick', buildingId: building.id, brickId: brick.id });
                }
            }
        }
        if (items.length === 0) {
            return false;
        }
        this._editorContext.setSelection(new SelectionState({ items }));
        return true;
    }

    // -----------------------------------------------------------------
    // Advanced selection (0.1.45)
    // -----------------------------------------------------------------

    // Select every brick in the current document. Session state only —
    // zero history entries.
    selectAll() {
        const document = this._documentManager.document;
        if (!document) {
            return false;
        }
        const items = [];
        for (const building of document.world.getBuildings()) {
            for (const brick of building.getBricks()) {
                items.push({ type: 'brick', buildingId: building.id, brickId: brick.id });
            }
        }
        if (items.length === 0) {
            return false;
        }
        this._editorContext.setSelection(new SelectionState({ items }));
        return true;
    }

    // Marquee selection: the VIEW owns the Shift+drag gesture and the
    // rectangle overlay; the RENDERER answers containment
    // (pickRectangle); this method owns the selection semantics.
    // additive=true (Ctrl/Cmd held during the drag) unions the hits
    // with the current selection; otherwise the marquee REPLACES it.
    // Session state only — zero history entries.
    marqueeSelect(rect, { additive = false } = {}) {
        const document = this._documentManager.document;
        if (!document || !this._session || !this._session.pickRectangle) {
            return false;
        }
        const hits = this._session.pickRectangle(rect.x0, rect.y0, rect.x1, rect.y1);
        const items = hits.map((hit) => ({
            type: 'brick',
            buildingId: hit.buildingId,
            brickId: hit.brickId
        }));
        if (items.length === 0) {
            if (!additive) {
                this._editorContext.clearSelection();
            }
            return false;
        }
        const current = this._editorContext.selection;
        const nextItems = additive && !current.isEmpty
            ? [...current.items, ...items]
            : items;
        this._editorContext.setSelection(new SelectionState({ items: nextItems }));
        return true;
    }

    // Suspends/resumes camera interaction during a marquee gesture.
    setControlsEnabled(enabled) {
        if (this._session && this._session.setControlsEnabled) {
            this._session.setControlsEnabled(enabled);
        }
    }

    // -----------------------------------------------------------------
    // Lifecycle
    // -----------------------------------------------------------------

    // Builds the initial runtime graph against the demo world. Called
    // once, from EditorView's onMounted().
    start(container) {
        this._container = container;
        this._rebuild((eventBus) => {
            const world = new CreateDemoWorldUseCase().execute(eventBus);
            new CreateDocumentManagerUseCase().attachWorld(this._documentManager, world, this._identityProvider);
            return world;
        });
    }

    loadDocument(id) {
        this._rebuild((eventBus) => {
            const document = this._loadDocumentUseCase.execute(this._documentManager, id, eventBus);
            return document.world;
        });
    }

    newDocument() {
        this._rebuild((eventBus) => {
            const world = new CreateEmptyWorldUseCase().execute(eventBus);
            new CreateDocumentManagerUseCase().attachWorld(this._documentManager, world, this._identityProvider);
            return world;
        });
    }

    openDocument(document) {
        this._rebuild((eventBus) => {
            const worldJson = document.world.toJSON();
            const world = World.fromJSON(worldJson, eventBus);
            const newDocument = new Document({ world, metadata: document.metadata });
            this._documentManager.newDocument(newDocument);
            return world;
        });
    }

    onPointerDown(event) {
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerDown(event);
        }
    }

    onPointerMove(event) {
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerMove(event);
        }
    }

    onKeyDown(event) {
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchKeyDown(event);
        }
    }

    dispose() {
        this._teardown();
    }

    _rebuild(populateWorldFn) {
        this._teardown();
        this._editorContext.clearSelection();
        this._previewUseCase.hide();
        const eventBus = new CreateEventBusUseCase().execute();
        this._session = new RenderWorldUseCase().execute(
            this._container,
            eventBus,
            this._registry,
            this._editorContext.eventBus
        );
        const world = populateWorldFn(eventBus);
        this._commandHistory = new CommandHistory({ world });
        this._untrackDirtyState = this._documentManager.trackCommandHistory(this._commandHistory);
        const toolContext = {
            world,
            registry: this._registry,
            editorContext: this._editorContext,
            selectionUseCase: this._selectionUseCase,
            previewUseCase: this._previewUseCase,
            commandHistory: this._commandHistory,
            // 0.1.44 — the same unified transform path World View uses.
            transformSelectionUseCase: this._transformSelectionUseCase
        };
        this._toolManager = new ToolManager(this._toolRegistry, toolContext, this._editorContext);
        this._toolManager.start();
        this._inputDispatcher = new InputDispatcher(
            this._toolManager,
            (screenX, screenY) => this._session.pick(screenX, screenY),
            (screenX, screenY) => this._session.pickGround(screenX, screenY)
        );
    }

    _teardown() {
        if (this._untrackDirtyState) {
            this._untrackDirtyState();
            this._untrackDirtyState = null;
        }
        if (this._toolManager) {
            this._toolManager.stop();
            this._toolManager = null;
        }
        if (this._session) {
            this._session.dispose();
            this._session = null;
        }
        this._inputDispatcher = null;
        this._commandHistory = null;
    }
}
