import { World } from '../../core/World.js';
import { Document } from '../../core/Document.js';
import { EditorEvent } from '../../core/events/EditorEvent.js';
import { CreateEventBusUseCase } from '../CreateEventBusUseCase.js';
import { CreateDemoWorldUseCase } from '../world/CreateDemoWorldUseCase.js';
import { CreateEmptyWorldUseCase } from '../world/CreateEmptyWorldUseCase.js';
import { CreateDocumentManagerUseCase } from '../document/CreateDocumentManagerUseCase.js';
import { RenderWorldUseCase } from '../world/RenderWorldUseCase.js';
import { InputDispatcher } from './InputDispatcher.js';
import { ToolManager } from './ToolManager.js';
import { CommandHistory } from './CommandHistory.js';
import { CommandHistoryEvent } from '../events/CommandHistoryEvent.js';
import { RemoteDocumentOperationApplicationUseCase } from '../document/RemoteDocumentOperationApplicationUseCase.js';
import { DocumentOperationCausalGapObservationUseCase } from '../document/DocumentOperationCausalGapObservationUseCase.js';
import { DocumentOperationCausalGapDetector } from '../../core/DocumentOperationCausalGapDetector.js';
import { DocumentOperationDeferralUseCase } from '../document/DocumentOperationDeferralUseCase.js';
import { SpatialEditingService } from './SpatialEditingService.js';
import { TransformGizmoUseCase } from './TransformGizmoUseCase.js';
import { TransformSettings } from './TransformSettings.js';
import { ToolId } from '../editor-state/ToolId.js';
import { ForkStructureUseCase } from './ForkStructureUseCase.js';
import { CopyStructureIntoDocumentUseCase } from './CopyStructureIntoDocumentUseCase.js';
import { CreateStructureFromSelectionUseCase } from './CreateStructureFromSelectionUseCase.js';
import { ExportBlueprintUseCase } from '../blueprint/ExportBlueprintUseCase.js';
import { ExportDocumentUseCase } from '../document/ExportDocumentUseCase.js';
import { ImportBlueprintUseCase } from '../blueprint/ImportBlueprintUseCase.js';
import { ImportDocumentUseCase } from '../document/ImportDocumentUseCase.js';
import { ForkStructureToLibraryUseCase } from './ForkStructureToLibraryUseCase.js';
import { StructurePlacementGestureService } from './StructurePlacementGestureService.js';
import { GizmoGestureRouter } from './GizmoGestureRouter.js';
import { SelectionBoundsService } from './SelectionBoundsService.js';
import { installMethods } from '../../utils/installMethods.js';
import { selectionEditingMethods } from '../editorSession/selectionEditingMethods.js';
import { transformMethods } from '../editorSession/transformMethods.js';
import { clipboardAndGroupMethods } from '../editorSession/clipboardAndGroupMethods.js';
import { structureAndBlueprintMethods } from '../editorSession/structureAndBlueprintMethods.js';
import { pointerInputMethods } from '../editorSession/pointerInputMethods.js';

// Owns the live runtime graph (render session, World, CommandHistory,
// ToolManager, InputDispatcher) as one unit, so nothing else has to know how
// to tear it down and rebuild it. EditorView only calls
// start()/loadDocument()/newDocument()/dispose() and forwards raw DOM events;
// it never touches a World, Renderer or ToolManager.
//
// Most methods live in application/editorSession/, one module per concern,
// and are installed on the prototype as if written in the class body.

export class EditorSession {
    constructor({
        registry,
        editorContext,
        toolRegistry,
        documentManager,
        selectionUseCase,
        previewUseCase,
        loadDocumentUseCase,
        identityProvider = null,
        copySelectionUseCase = null,
        pasteClipboardUseCase = null,
        forkStructureUseCase = new ForkStructureUseCase(),
        copyStructureIntoDocumentUseCase = new CopyStructureIntoDocumentUseCase(),
        createStructureFromSelectionUseCase = new CreateStructureFromSelectionUseCase(),
        // The optional collaborators below simply disable their own methods when
        // missing; nothing else depends on them.
        personalStructureLibraryStore = null,
        exportBlueprintUseCase = new ExportBlueprintUseCase(),
        importBlueprintUseCase = new ImportBlueprintUseCase(),
        exportDocumentUseCase = new ExportDocumentUseCase(),
        importDocumentUseCase = new ImportDocumentUseCase(),
        blueprintAttributionExchange = null,
        blueprintLineageExchange = null,
        forkStructureToLibraryUseCase = new ForkStructureToLibraryUseCase(),
        repeatSelectionUseCase = null,
        structureResolver = null,
        structurePreviewUseCase = null,
        compositionPreviewUseCase = null,
        // When supplied, connects document command propagation to the Editor:
        // outgoing is wired per CommandHistory in _rebuild(), incoming once in the
        // constructor.
        documentCommandPropagation = null,
        documentOperationRecovery = null
    }) {
        this._registry = registry;
        this._editorContext = editorContext;
        this._toolRegistry = toolRegistry;
        this._documentManager = documentManager;
        this._selectionUseCase = selectionUseCase;
        this._previewUseCase = previewUseCase;
        this._loadDocumentUseCase = loadDocumentUseCase;
        this._identityProvider = identityProvider;
        this._copySelectionUseCase = copySelectionUseCase;
        this._pasteClipboardUseCase = pasteClipboardUseCase;
        this._forkStructureUseCase = forkStructureUseCase;
        this._copyStructureIntoDocumentUseCase = copyStructureIntoDocumentUseCase;
        this._createStructureFromSelectionUseCase = createStructureFromSelectionUseCase;
        this._personalStructureLibraryStore = personalStructureLibraryStore;
        this._exportBlueprintUseCase = exportBlueprintUseCase;
        this._importBlueprintUseCase = importBlueprintUseCase;
        this._exportDocumentUseCase = exportDocumentUseCase;
        this._importDocumentUseCase = importDocumentUseCase;
        this._blueprintAttributionExchange = blueprintAttributionExchange;
        this._blueprintLineageExchange = blueprintLineageExchange;
        this._forkStructureToLibraryUseCase = forkStructureToLibraryUseCase;
        this._repeatSelectionUseCase = repeatSelectionUseCase;
        this._structureResolver = structureResolver;
        this._structurePreviewUseCase = structurePreviewUseCase;
        this._compositionPreviewUseCase = compositionPreviewUseCase;
        this._documentCommandPropagation = documentCommandPropagation;
        this._remoteDocumentOperationApplication = new RemoteDocumentOperationApplicationUseCase();
        // One detector for the session's lifetime: its graph is already keyed by
        // document. The deferral boundary shares it, so readiness uses the real
        // causal knowledge.
        this._causalGapDetector = new DocumentOperationCausalGapDetector();
        this._documentOperationCausalGapObservation = new DocumentOperationCausalGapObservationUseCase({
            causalGapDetector: this._causalGapDetector
        });
        // Sits between propagation and application: READY operations apply
        // immediately, NOT_READY ones are retained.
        this._documentOperationDeferral = new DocumentOperationDeferralUseCase({
            applicationUseCase: this._remoteDocumentOperationApplication,
            causalGapDetector: this._causalGapDetector
        });
        this._documentOperationRecovery = documentOperationRecovery;

        this._container = null;
        this._session = null;
        this._commandHistory = null;
        this._toolManager = null;
        this._inputDispatcher = null;
        this._untrackDirtyState = null;
        this._unattachCommandHistoryPropagation = null;
        this._unattachRecoveryCommandHistory = null;
        this._unattachDeferralCommandHistory = null;
        this._editorCommandHistories = new Map();
        this._transformSettings = new TransformSettings();
        this._gestureService = new SpatialEditingService(
            { getDocument: () => this._documentManager.document },
            this._editorCommandHistories,
            registry,
            this._transformSettings
        );
        this._gizmoUseCase = new TransformGizmoUseCase(this._gestureService);
        this._boundsService = new SelectionBoundsService(registry);
        // Placement selections get their own gesture service, and a router lets the
        // one gizmo drive either kind of selection.
        this._placementGestureService = new StructurePlacementGestureService({
            getWorld: () => (this._documentManager.document ? this._documentManager.document.world : null),
            getCommandHistory: () => this._commandHistory,
            registry,
            structureResolver: this._structureResolver,
            structurePreviewUseCase: this._structurePreviewUseCase,
            transformSettings: this._transformSettings
        });
        this._gizmoGestureRouter = new GizmoGestureRouter(this._gestureService, this._placementGestureService);
        this._gizmoSubscriptions = [];
        this._clipboardState = null;
        this._selectedGroupId = null;
        this._marqueeState = null;

        this._pasteCount = 0;

        // Incoming operations are wired once, for the session's lifetime. The target
        // is resolved live for each operation, so it always means "what this Editor is
        // looking at now"; an operation for another document is not applied and not
        // queued. Causal-gap observation is registered first (a documented order, not
        // a correctness requirement).
        this._unattachCausalGapObservation = this._documentCommandPropagation
            ? this._documentOperationCausalGapObservation.attachToPropagation(this._documentCommandPropagation)
            : null;
        this._unattachRemoteApplication = this._documentCommandPropagation
            ? this._documentOperationDeferral.attachToPropagation(
                this._documentCommandPropagation,
                () => (this._documentManager.document && this._commandHistory
                    ? { documentId: this._documentManager.document.world.id, commandHistory: this._commandHistory }
                    : null)
            )
            : null;
        // A detected gap sends a recovery request; a recovered operation is recorded
        // in the causal graph. Recovered operations are never applied automatically.
        this._unattachGapToRecoveryRequest = this._documentOperationRecovery
            ? this._documentOperationRecovery.attachToGapObservation(this._documentOperationCausalGapObservation)
            : null;
        this._unattachRecoveryToGapObservation = this._documentOperationRecovery
            ? this._documentOperationCausalGapObservation.attachToPropagation(this._documentOperationRecovery)
            : null;
    }

    // Read-only: which operations are retained for `documentId`.
    getDeferredOperationIds(documentId) {
        return this._documentOperationDeferral.getDeferredOperationIds(documentId);
    }

    get commandHistory() {
        return this._commandHistory;
    }

    // Only one gesture service can be active at a time.
    isGestureActive() {
        return this._gestureService.transformGizmoState.active
            || this._placementGestureService.transformGizmoState.active;
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

    // The action registry calls session.undo()/redo() directly, so these must
    // exist even though canUndo()/canRedo() already do.
    undo() {
        if (!this._commandHistory) {
            return false;
        }
        this._commandHistory.undo();
        return true;
    }

    redo() {
        if (!this._commandHistory) {
            return false;
        }
        this._commandHistory.redo();
        return true;
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

    openDocument(document, entryContext = null) {
        this._rebuild((eventBus) => {
            const worldJson = document.world.toJSON();
            const world = World.fromJSON(worldJson, eventBus);
            const newDocument = new Document({ world, metadata: document.metadata });
            this._documentManager.newDocument(newDocument);
            return world;
        });
        this.applyEntryContext(entryContext);
    }

    dispose() {
        this._teardown();
        if (this._unattachRemoteApplication) {
            this._unattachRemoteApplication();
            this._unattachRemoteApplication = null;
        }
        if (this._unattachCausalGapObservation) {
            this._unattachCausalGapObservation();
            this._unattachCausalGapObservation = null;
        }
        if (this._unattachGapToRecoveryRequest) {
            this._unattachGapToRecoveryRequest();
            this._unattachGapToRecoveryRequest = null;
        }
        if (this._unattachRecoveryToGapObservation) {
            this._unattachRecoveryToGapObservation();
            this._unattachRecoveryToGapObservation = null;
        }
    }

    _rebuild(populateWorldFn) {
        this._teardown();
        this._editorContext.clearSelection();
        this._previewUseCase.hide();
        if (this._structurePreviewUseCase) {
            this._structurePreviewUseCase.hide();
        }
        if (this._compositionPreviewUseCase) {
            this._compositionPreviewUseCase.hide();
        }
        const eventBus = new CreateEventBusUseCase().execute();
        this._session = new RenderWorldUseCase().execute(
            this._container,
            eventBus,
            this._registry,
            this._editorContext.eventBus,
            { gestureService: this._gizmoGestureRouter, structureResolver: this._structureResolver }
        );
        const world = populateWorldFn(eventBus);
        this._commandHistory = new CommandHistory({ world });
        this._editorCommandHistories.set(world.id, this._commandHistory);
        this._untrackDirtyState = this._documentManager.trackCommandHistory(this._commandHistory);
        // Outgoing broadcast for this CommandHistory; torn down before the next
        // rebuild.
        this._unattachCommandHistoryPropagation = this._documentCommandPropagation
            ? this._documentCommandPropagation.attachCommandHistory({
                documentId: world.id,
                commandHistory: this._commandHistory
            })
            : null;
        // Records locally authored operations so recovery requests can be answered.
        this._unattachRecoveryCommandHistory = this._documentOperationRecovery
            ? this._documentOperationRecovery.attachCommandHistory({
                documentId: world.id,
                commandHistory: this._commandHistory
            })
            : null;
        // Lets anything executing on this document release deferred operations it
        // just made ready. Always attached: it costs nothing when nothing is deferred.
        this._unattachDeferralCommandHistory = this._documentOperationDeferral.attachCommandHistory({
            documentId: world.id,
            commandHistory: this._commandHistory
        });
        const toolContext = {
            world,
            registry: this._registry,
            editorContext: this._editorContext,
            selectionUseCase: this._selectionUseCase,
            previewUseCase: this._previewUseCase,
            commandHistory: this._commandHistory,
            structureResolver: this._structureResolver,
            structurePreviewUseCase: this._structurePreviewUseCase,
            compositionPreviewUseCase: this._compositionPreviewUseCase,
            copyStructureIntoDocumentUseCase: this._copyStructureIntoDocumentUseCase
        };
        this._toolManager = new ToolManager(this._toolRegistry, toolContext, this._editorContext);
        this._toolManager.start();
        this._inputDispatcher = new InputDispatcher(
            this._toolManager,
            (screenX, screenY) => this._session.pick(screenX, screenY),
            (screenX, screenY) => this._session.pickGround(screenX, screenY),
            (screenX, screenY) => (this._session.pickPlacement ? this._session.pickPlacement(screenX, screenY) : null)
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
        if (this._unattachCommandHistoryPropagation) {
            this._unattachCommandHistoryPropagation();
            this._unattachCommandHistoryPropagation = null;
        }
        if (this._unattachRecoveryCommandHistory) {
            this._unattachRecoveryCommandHistory();
            this._unattachRecoveryCommandHistory = null;
        }
        if (this._unattachDeferralCommandHistory) {
            this._unattachDeferralCommandHistory();
            this._unattachDeferralCommandHistory = null;
        }
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
        if (this.isGestureActive()) {
            return;
        }
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            this._session.hideGizmo();
            return;
        }
        const presentation = this._resolveGizmoPresentation(this._editorContext.selection);
        if (!presentation) {
            this._session.hideGizmo();
            return;
        }
        this._session.showGizmo(presentation.pivot, presentation.bounds);
    }

    // Placement selections anchor the gizmo on the placed structure's bounds;
    // same { pivot, bounds } shape either way.
    _resolveGizmoPresentation(selection) {
        if (!selection || selection.isEmpty) {
            return null;
        }
        if (selection.isStructurePlacementSelection) {
            const bounds = this._placementGestureService.getSelectionBounds(selection);
            return bounds ? { bounds, pivot: { ...bounds.center } } : null;
        }
        return this._gizmoUseCase.resolvePresentation(selection);
    }
}

installMethods(
    EditorSession,
    selectionEditingMethods,
    transformMethods,
    clipboardAndGroupMethods,
    structureAndBlueprintMethods,
    pointerInputMethods
);
