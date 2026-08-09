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
    }

    get commandHistory() {
        return this._commandHistory;
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
            this._editorContext.eventBus
        );

        const world = populateWorldFn(eventBus);

        this._commandHistory = new CommandHistory({ world });
        this._untrackDirtyState = this._documentManager.trackCommandHistory(this._commandHistory);

        const toolContext = {
            world,
            registry: this._registry,        // ← added for PlacementTool
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
