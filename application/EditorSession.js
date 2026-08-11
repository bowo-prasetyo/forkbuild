import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { EditorEvent } from '../core/events/EditorEvent.js';
import { SelectionState } from './editor-state/SelectionState.js';
import { DeleteBrickCommand } from './commands/DeleteBrickCommand.js';
import { CompositeCommand } from './commands/CompositeCommand.js';
import { CreateEventBusUseCase } from './CreateEventBusUseCase.js';
import { CreateDemoWorldUseCase } from './CreateDemoWorldUseCase.js';
import { CreateEmptyWorldUseCase } from './CreateEmptyWorldUseCase.js';
import { CreateDocumentManagerUseCase } from './CreateDocumentManagerUseCase.js';
import { RenderWorldUseCase } from './RenderWorldUseCase.js';
import { InputDispatcher } from './InputDispatcher.js';
import { ToolManager } from './ToolManager.js';
import { CommandHistory } from './CommandHistory.js';
import { CommandHistoryEvent } from './events/CommandHistoryEvent.js';
import { SpatialEditingService } from './SpatialEditingService.js';
import { TransformGizmoUseCase } from './TransformGizmoUseCase.js';
import { TransformSettings } from './TransformSettings.js';
import { ToolId } from './editor-state/ToolId.js';
import { CreateGroupCommand } from './commands/CreateGroupCommand.js';
import { DeleteGroupCommand } from './commands/DeleteGroupCommand.js';
import { RenameGroupCommand } from './commands/RenameGroupCommand.js';
import { AddToGroupCommand } from './commands/AddToGroupCommand.js';
import { RemoveFromGroupCommand } from './commands/RemoveFromGroupCommand.js';
import { DuplicateGroupCommand } from './commands/DuplicateGroupCommand.js';
import { CopySelectionUseCase } from './CopySelectionUseCase.js';
import { PasteClipboardUseCase } from './PasteClipboardUseCase.js';

// Owns the live runtime graph — the render session, World, CommandHistory,
// ToolManager, InputDispatcher — as one unit, so nothing else has to know
// how to tear it down and rebuild it correctly. EditorView only ever
// calls start()/loadDocument()/newDocument()/dispose() and forwards raw
// DOM events to onPointerDown()/onPointerMove()/onPointerUp()/onKeyDown()
// — it never touches a World, Renderer, or ToolManager directly, before
// or after a document is replaced.
//
// 0.1.46 — interactive transform gizmo wiring. 0.1.47 — transform
// precision (TransformSettings + modifier plumbing + gesture feedback).
// 0.1.48 — alignSelection/distributeSelection. 0.1.49 —
// applyNumericTransform. All routed to the same gesture service.
//
// 0.1.50 — the Editor half of the consolidated editing surface:
// selectAll()/clearSelection()/deleteSelection()/getSelectionCount()
// join the session API so the EditorActionRegistry can drive selection
// operations from the command palette, the sidebar, and keyboard
// shortcuts without any Editor-only code paths. Group and clipboard
// surface (0.1.42/0.1.43) belongs wherever this session is extended in
// the deployed tree; the action layer degrades gracefully when those
// methods are absent rather than assuming them.
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
        this._container = null;
        this._session = null;
        this._commandHistory = null;
        this._toolManager = null;
        this._inputDispatcher = null;
        this._untrackDirtyState = null;
        this._editorCommandHistories = new Map();
        this._transformSettings = new TransformSettings();
        this._gestureService = new SpatialEditingService(
            { getDocument: () => this._documentManager.document },
            this._editorCommandHistories,
            registry,
            this._transformSettings
        );
        this._gizmoUseCase = new TransformGizmoUseCase(this._gestureService);
        this._gizmoSubscriptions = [];
        this._copySelectionUseCase = null;
        this._pasteClipboardUseCase = null;
        this._clipboardState = null;
        this._selectedGroupId = null;
    }

    get commandHistory() {
        return this._commandHistory;
    }

    get transformSettings() {
        return this._transformSettings;
    }

    isGestureActive() {
        return this._gestureService.transformGizmoState.active;
    }

    // -------------------------------- 0.1.50 consolidated editing surface

    getSelectionCount() {
        return this._editorContext.selection.items.length;
    }

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

    clearSelection() {
        this._editorContext.clearSelection();
        return true;
    }

    // Mirrors SelectionTool's delete path exactly: one DeleteBrickCommand
    // per brick, wrapped in a CompositeCommand, one undo step, selection
    // cleared afterwards. Session state + existing commands only — the
    // action layer that calls this never touches CommandHistory itself.
    deleteSelection() {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (selection.isEmpty || !document || !this._commandHistory) {
            return false;
        }
        const worldId = document.world.id;
        const commands = selection.items.map((item) => new DeleteBrickCommand({
            worldId,
            buildingId: item.buildingId,
            brickId: item.brickId
        }));
        const command = commands.length === 1
            ? commands[0]
            : commands.reduce((composite, child) => composite.add(child),
                new CompositeCommand({ description: `Delete ${commands.length} Bricks` }));
        this._commandHistory.execute(command);
        this._editorContext.clearSelection();
        return true;
    }

    // ------------------------ alignment / distribution / numeric (0.1.48/49)

    alignSelection(mode) {
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            return false;
        }
        return this._gestureService.alignSelection(this._editorContext.selection, mode);
    }

    distributeSelection(axis) {
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            return false;
        }
        return this._gestureService.distributeSelection(this._editorContext.selection, axis);
    }

    applyNumericTransform(intent, options = {}) {
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            return false;
        }
        return this._gestureService.applyNumericTransform(this._editorContext.selection, intent, options);
    }

    // They close the method-surface gap so the action registry and
    // EditorActionContext.capture() work identically on both surfaces.
    
    // ---------------------------------------------------------------
    // Transform operations (delegate to the gesture service, exactly
    // as WorldNavigationSession does)
    // ---------------------------------------------------------------
    moveSelection(delta, gestureOptions = {}) {
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            return false;
        }
        return this._gestureService.moveSelection(
            this._editorContext.selection, delta, gestureOptions
        );
    }
    
    rotateSelection(deltaRotation, gestureOptions = {}) {
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            return false;
        }
        return this._gestureService.rotateSelection(
            this._editorContext.selection, deltaRotation, gestureOptions
        );
    }
    
    // ---------------------------------------------------------------
    // Clipboard operations (delegate to shared use cases)
    // ---------------------------------------------------------------
    copySelection() {
        if (!this._copySelectionUseCase || !this._documentManager.document) {
            return null;
        }
        return this._copySelectionUseCase.execute(
            this._editorContext.selection,
            this._documentManager.document
        );
    }
    
    paste() {
        if (!this._pasteClipboardUseCase || !this._clipboardState
            || this._clipboardState.isEmpty || !this._documentManager.document
            || !this._commandHistory) {
            return false;
        }
        const document = this._documentManager.document;
        const world = document.world;
        const buildings = world.getBuildings();
        if (buildings.length === 0) {
            return false;
        }
        const buildingId = buildings[0].id;
        const command = this._pasteClipboardUseCase.execute(
            this._clipboardState,
            {
                worldId: world.id,
                buildingId,
                position: { x: 2, y: 0, z: 2 }
            }
        );
        if (!command) {
            return false;
        }
        this._commandHistory.execute(command);
        return true;
    }
    
    // ---------------------------------------------------------------
    // Group operations (delegate to existing group commands)
    // ---------------------------------------------------------------
    createGroupFromSelection(name = null) {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (selection.isEmpty || !document || !this._commandHistory) {
            return null;
        }
        const worldId = document.world.id;
        const brickIds = selection.brickIds;
        if (brickIds.length === 0) {
            return null;
        }
        const command = new CreateGroupCommand({ worldId, brickIds, name });
        this._commandHistory.execute(command);
        return command.executedGroupId;
    }
    
    renameSelectedGroup(name) {
        const groupId = this._selectedGroupId;
        const document = this._documentManager.document;
        if (!groupId || !document || !this._commandHistory) {
            return false;
        }
        this._commandHistory.execute(new RenameGroupCommand({
            worldId: document.world.id,
            groupId,
            name
        }));
        return true;
    }
    
    duplicateSelectedGroup() {
        const groupId = this._selectedGroupId;
        const document = this._documentManager.document;
        if (!groupId || !document || !this._commandHistory) {
            return null;
        }
        const command = new DuplicateGroupCommand({
            worldId: document.world.id,
            groupId
        });
        this._commandHistory.execute(command);
        return command.executedGroupId;
    }
    
    deleteSelectedGroup() {
        const groupId = this._selectedGroupId;
        const document = this._documentManager.document;
        if (!groupId || !document || !this._commandHistory) {
            return false;
        }
        this._commandHistory.execute(new DeleteGroupCommand({
            worldId: document.world.id,
            groupId
        }));
        this._selectedGroupId = null;
        return true;
    }
    
    addSelectionToSelectedGroup() {
        const groupId = this._selectedGroupId;
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (!groupId || selection.isEmpty || !document || !this._commandHistory) {
            return false;
        }
        this._commandHistory.execute(new AddToGroupCommand({
            worldId: document.world.id,
            groupId,
            brickIds: selection.brickIds
        }));
        return true;
    }
    
    removeSelectionFromSelectedGroup() {
        const groupId = this._selectedGroupId;
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (!groupId || selection.isEmpty || !document || !this._commandHistory) {
            return false;
        }
        this._commandHistory.execute(new RemoveFromGroupCommand({
            worldId: document.world.id,
            groupId,
            brickIds: selection.brickIds
        }));
        return true;
    }
    
    selectGroup(groupId) {
        const document = this._documentManager.document;
        if (!document) {
            return false;
        }
        const group = document.world.getGroup(groupId);
        if (!group) {
            return false;
        }
        this._selectedGroupId = groupId;
        const items = [];
        for (const brickId of group.brickIds) {
            for (const building of document.world.getBuildings()) {
                if (building.findBrick(brickId)) {
                    items.push({ type: 'brick', buildingId: building.id, brickId });
                    break;
                }
            }
        }
        if (items.length > 0) {
            this._editorContext.setSelection(new SelectionState({ items }));
        }
        return true;
    }
    
    // ---------------------------------------------------------------
    // Context-query methods (used by EditorActionContext.capture())
    // ---------------------------------------------------------------
    getGroups() {
        const document = this._documentManager.document;
        if (!document) {
            return [];
        }
        return document.world.getGroups().map((group) => ({
            id: group.id,
            name: group.name,
            memberCount: group.memberCount
        }));
    }
    
    getSelectedGroupId() {
        return this._selectedGroupId || null;
    }
    
    getClipboardCount() {
        return this._clipboardState ? this._clipboardState.count : 0;
    }
    
    canUndo() {
        return this._commandHistory ? this._commandHistory.canUndo() : false;
    }
    
    canRedo() {
        return this._commandHistory ? this._commandHistory.canRedo() : false;
    }
    
    getUndoLabel() {
        return this._commandHistory ? this._commandHistory.getUndoLabel() : null;
    }
    
    getRedoLabel() {
        return this._commandHistory ? this._commandHistory.getRedoLabel() : null;
    }
        
    // ------------------------------------------------------ lifecycle

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
        if (event.button === 0 && this._session
            && this._session.gizmoPointerDown(event.clientX, event.clientY, this._editorContext.selection)) {
            return null;
        }
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerDown(event);
        }
        return null;
    }

    onPointerMove(event) {
        if (this._session) {
            const result = this._session.gizmoPointerMove(
                event.clientX,
                event.clientY,
                this._editorContext.selection,
                this._toKeyEvent(event).modifiers
            );
            if (result && result.consumed) {
                return result;
            }
        }
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerMove(event);
        }
        return null;
    }

    onPointerUp(event) {
        if (this._session) {
            const result = this._session.gizmoPointerUp(
                event.clientX,
                event.clientY,
                this._editorContext.selection,
                this._toKeyEvent(event).modifiers
            );
            if (result && result.consumed) {
                this._refreshGizmo();
                return result;
            }
        }
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerUp(event);
        }
        return null;
    }

    onKeyDown(event) {
        const keyEvent = this._toKeyEvent(event);
        if (this._session
            && this._session.gizmoKeyDown(keyEvent, this._editorContext.selection)) {
            this._refreshGizmo();
            return;
        }
        if (this.isGestureActive()) {
            return;
        }
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
            this._editorContext.eventBus,
            { gestureService: this._gestureService }
        );
        const world = populateWorldFn(eventBus);
        this._commandHistory = new CommandHistory({ world });
        this._editorCommandHistories.set(world.id, this._commandHistory);
        this._untrackDirtyState = this._documentManager.trackCommandHistory(this._commandHistory);
        const toolContext = {
            world,
            registry: this._registry,
            editorContext: this._editorContext,
            selectionUseCase: this._selectionUseCase,
            previewUseCase: this._previewUseCase,
            commandHistory: this._commandHistory
        };
        this._toolManager = new ToolManager(this._toolRegistry, toolContext, this._editorContext);
        this._toolManager.start();
        this._inputDispatcher = new InputDispatcher(
            this._toolManager,
            (screenX, screenY) => this._session.pick(screenX, screenY),
            (screenX, screenY) => this._session.pickGround(screenX, screenY)
        );
        const refreshGizmo = () => this._refreshGizmo();
        this._gizmoSubscriptions = [
            this._editorContext.eventBus.subscribe(EditorEvent.SELECTION_CHANGED, refreshGizmo),
            this._editorContext.eventBus.subscribe(EditorEvent.TOOL_CHANGED, refreshGizmo),
            this._commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_EXECUTED, refreshGizmo),
            this._commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_UNDONE, refreshGizmo),
            this._commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_REDONE, refreshGizmo)
        ];
        this._refreshGizmo();
    }

    _teardown() {
        for (const subscription of this._gizmoSubscriptions) {
            subscription.unsubscribe();
        }
        this._gizmoSubscriptions = [];
        this._editorCommandHistories.clear();
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

    _refreshGizmo() {
        if (!this._session) {
            return;
        }
        if (this._gestureService.transformGizmoState.active) {
            return;
        }
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            this._session.hideGizmo();
            return;
        }
        const presentation = this._gizmoUseCase.resolvePresentation(this._editorContext.selection);
        if (!presentation) {
            this._session.hideGizmo();
            return;
        }
        this._session.showGizmo(presentation.pivot, presentation.bounds);
    }

    _toKeyEvent(event) {
        return {
            key: event.key,
            modifiers: {
                ctrl: event.ctrlKey || false,
                shift: event.shiftKey || false,
                alt: event.altKey || false,
                meta: event.metaKey || false
            }
        };
    }
}
