import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { EditorEvent } from '../core/events/EditorEvent.js';
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
import { ToolId } from './editor-state/ToolId.js';

// Owns the live runtime graph — the render session, World, CommandHistory,
// ToolManager, InputDispatcher — as one unit, so nothing else has to know
// how to tear it down and rebuild it correctly. EditorView only ever
// calls start()/loadDocument()/newDocument()/dispose() and forwards raw
// DOM events to onPointerDown()/onPointerMove()/onPointerUp()/onKeyDown()
// — it never touches a World, Renderer, or ToolManager directly, before
// or after a document is replaced.
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
// 0.1.46 — Interactive transform gizmo. EditorSession now owns the
// Editor's gesture service and gizmo presentation:
//   * The gesture service is a SpatialEditingService wired to the open
//     document through a trivial getDocument() shim and a world-id ->
//     CommandHistory map refreshed on every _rebuild(). It satisfies the
//     exact gesture contract the gizmo drives (begin/preview/commit/
//     cancelTransformGesture) — the same contract World View's editing
//     service implements, which is the parity: one gesture transaction,
//     one math source (TransformMath), one TransformSelectionCommand per
//     completed drag, in BOTH views. If a dedicated
//     TransformSelectionUseCase exists in the tree, it can be swapped in
//     right here without the gizmo noticing — the contract is the point.
//   * Input routing is exclusive: every pointer/key event is offered to
//     the gizmo FIRST; while a gesture is active the gesture owns the
//     pointer and the keyboard (only Escape cancels), OrbitControls is
//     disabled by the controller, and nothing reaches the tools.
//   * Gizmo presentation is refreshed from state, never from gesture
//     internals: selection changes, tool changes, and every command
//     executed/undone/redone re-resolve { pivot, bounds } through
//     TransformGizmoUseCase and reposition (or hide) the gizmo.
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
        this._gestureService = new SpatialEditingService(
            { getDocument: () => this._documentManager.document },
            this._editorCommandHistories,
            registry
        );
        this._gizmoUseCase = new TransformGizmoUseCase(this._gestureService);
        this._gizmoSubscriptions = [];
    }

    get commandHistory() {
        return this._commandHistory;
    }

    isGestureActive() {
        return this._gestureService.transformGizmoState.active;
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

    // Loads a previously-saved document, replacing the entire runtime
    // graph with one built against it.
    loadDocument(id) {
        this._rebuild((eventBus) => {
            const document = this._loadDocumentUseCase.execute(this._documentManager, id, eventBus);
            return document.world;
        });
    }

    // Starts a brand-new, empty document, replacing the runtime graph
    // the same way loadDocument() does.
    newDocument() {
        this._rebuild((eventBus) => {
            const world = new CreateEmptyWorldUseCase().execute(eventBus);
            new CreateDocumentManagerUseCase().attachWorld(this._documentManager, world, this._identityProvider);
            return world;
        });
    }

    // Opens an already-constructed Document (e.g. from ForkDocumentUseCase)
    // by re-hydrating its world against a fresh EventBus so the renderer
    // subscribes correctly. Used when the document is already in memory
    // rather than loaded from storage by id.
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
        // The gizmo gets first refusal — but only on the primary button;
        // orbit/pan gestures keep their mouse buttons.
        if (event.button === 0 && this._session
            && this._session.gizmoPointerDown(event.clientX, event.clientY, this._editorContext.selection)) {
            return;
        }
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerDown(event);
        }
    }

    onPointerMove(event) {
        if (this._session) {
            const result = this._session.gizmoPointerMove(event.clientX, event.clientY, this._editorContext.selection);
            if (result && result.consumed) {
                return;
            }
        }
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerMove(event);
        }
    }

    onPointerUp(event) {
        if (this._session) {
            const result = this._session.gizmoPointerUp(event.clientX, event.clientY, this._editorContext.selection);
            if (result && result.consumed) {
                // Repositions the gizmo on the committed transforms (or
                // snaps it back after an exact no-op drag).
                this._refreshGizmo();
                return;
            }
        }
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerUp(event);
        }
    }

    onKeyDown(event) {
        const keyEvent = this._toKeyEvent(event);
        if (this._session
            && this._session.gizmoKeyDown(keyEvent, this._editorContext.selection)) {
            this._refreshGizmo();
            return;
        }
        if (this.isGestureActive()) {
            // An active gesture owns the keyboard: swallow everything
            // that isn't the Escape handled above. No tool shortcuts,
            // no deletes, no undo mid-drag.
            return;
        }
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchKeyDown(event);
        }
    }

    dispose() {
        this._teardown();
    }

    // Shared by start()/loadDocument()/newDocument() — there is exactly
    // one way the runtime graph gets built, whether it's the first time
    // or the fifth. Tears down whatever currently exists, wires a fresh
    // render session (subscribed BEFORE any world content exists — the
    // same ordering constraint the engine has followed since the Event
    // System milestone), then calls populateWorldFn(eventBus) to actually
    // build/populate the World, whose events land on an
    // already-listening renderer. Only after that does the rest of the
    // per-world runtime (CommandHistory, ToolManager, InputDispatcher)
    // get built against the real world.
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

    // Selection changes reposition the gizmo; clearing it (or switching
    // to the Place tool) hides it. During an active gesture the gesture
    // owns presentation, so this is a no-op mid-drag.
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
