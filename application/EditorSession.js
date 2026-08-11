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

// Owns the live runtime graph — the render session, World, CommandHistory,
// ToolManager, InputDispatcher — as one unit, so nothing else has to know
// how to tear it down and rebuild it correctly. EditorView only ever
// calls start()/loadDocument()/newDocument()/dispose() and forwards raw
// DOM events to onPointerDown()/onPointerMove()/onKeyDown() — it never
// touches a World, Renderer, or ToolManager directly, before or after a
// document is replaced.
//
// As of 0.1.43 EditorSession also provides copySelection()/
// pasteClipboard() — EDITOR PARITY with World View through the SAME
// machinery: CopySelectionUseCase / PasteClipboardUseCase /
// PasteBricksCommand, routed through this session's own CommandHistory.
// Copy is observation (clipboard state, no history entry); paste is one
// command (undoable, replayable, restorable). There is deliberately no
// Editor-specific copy/paste implementation.
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
        // 0.1.43 — clipboard is session state, shared machinery.
        this._copySelectionUseCase = new CopySelectionUseCase(registry);
        this._pasteClipboardUseCase = new PasteClipboardUseCase();
        this._clipboard = SpatialClipboardState.empty();
        this._pasteCount = 0;
    }

    get commandHistory() {
        return this._commandHistory;
    }

    getClipboard() {
        return this._clipboard;
    }

    // Copy is observation: produces clipboard state, never a history
    // entry. Works off the Editor's SelectionState unchanged — the
    // shared use case only needs items[] and isEmpty.
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

    // Paste is mutation: one PasteBricksCommand (plus any carried group
    // intent) through CommandHistory — undoable, replayable. The pasted
    // bricks are selected afterwards, ready to move.
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
            commandHistory: this._commandHistory
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
