import { World } from '../../core/World.js';
import { Document } from '../../core/Document.js';
import { EditorEvent } from '../../core/events/EditorEvent.js';
import { CreateDemoWorldUseCase } from '../world/CreateDemoWorldUseCase.js';
import { CreateEmptyWorldUseCase } from '../world/CreateEmptyWorldUseCase.js';
import { CreateDocumentManagerUseCase } from '../document/CreateDocumentManagerUseCase.js';
import { RenderWorldUseCase } from '../world/RenderWorldUseCase.js';
import { InputDispatcher } from './InputDispatcher.js';
import { ToolManager } from './ToolManager.js';
import { CommandHistory } from './CommandHistory.js';
import { CommandHistoryEvent } from '../events/CommandHistoryEvent.js';
import { UndoOperationCommand, RedoOperationCommand, isSharedStepCommand } from '../commands/SharedUndoCommands.js';
import { message } from '../../core/Message.js';
import { EDITOR_ACTIVITY } from '../../core/EditorSoundCues.js';
import { describeCommand } from '../commands/describeCommand.js';
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
import { EventBus } from '../../core/events/EventBus.js';

// Owns the live runtime graph (render session, World, CommandHistory,
// ToolManager, InputDispatcher) as one unit, so nothing else has to know how
// to tear it down and rebuild it. EditorView only calls
// start()/loadDocument()/newDocument()/dispose() and forwards raw DOM events;
// it never touches a World, Renderer or ToolManager.
//
// Most methods live in application/editorSession/, one module per concern,
// and are installed on the prototype as if written in the class body.

// Who made a step this replica made itself (EditorSession#_operationAuthors).
const SELF = Symbol('this replica');
// The own steps a shared Undo can go back through.
const MAX_OWN_STEPS = 200;

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
        // Both seal and judge a build by who is signed in (core/
        // DocumentSeal.js); built from identityProvider unless given.
        exportDocumentUseCase = null,
        importDocumentUseCase = null,
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
        documentOperationRecovery = null,
        // Records the bricks each build starts with (application/document/
        // ReadyMadeBricksStore.js), so publishing can tell them from the
        // builder's own. Optional.
        readyMadeBricks = null,
        // Whether the structure with this id is a ready-made one from the Build
        // Library rather than one of My Structures (saved from a build, maybe
        // someone else's): only a ready-made one's bricks are recorded above.
        isReadyMadeStructure = () => true
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
        this._exportDocumentUseCase = exportDocumentUseCase ?? new ExportDocumentUseCase(undefined, { identityProvider });
        this._importDocumentUseCase = importDocumentUseCase ?? new ImportDocumentUseCase(undefined, undefined, { identityProvider });
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
        this._readyMadeBricks = readyMadeBricks;
        this._isReadyMadeStructure = isReadyMadeStructure;

        this._container = null;
        this._session = null;
        this._commandHistory = null;
        this._commandActivityListeners = new Set();
        this._activitySubscriptions = [];
        this._applyingRemoteOperation = false;
        this._toolManager = null;
        this._inputDispatcher = null;
        this._untrackDirtyState = null;
        this._unattachCommandHistoryPropagation = null;
        this._unattachRecoveryCommandHistory = null;
        this._unattachLocalCausalRecord = null;
        this._unattachOwnSteps = null;
        this._sharedEditing = false;
        // Building together: who made each step (a collaborator's proved
        // identity, or SELF), and this replica's own steps that Undo can
        // take back and Redo put back (application/commands/SharedUndoCommands.js).
        this._operationAuthors = new Map();
        this._ownDone = [];
        this._ownUndone = [];
        // The last shared Undo or Redo: { kind, applied }.
        this.lastSharedStep = null;
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
        this._touchPointerIds = new Set();
        this._touchTap = null;
        this._touchMultiSelect = false;
        this._touchBoxSelect = false;

        this._pasteCount = 0;

        // Incoming operations are wired once, for the session's lifetime. The target
        // is resolved live for each operation, so it always means "what this Editor is
        // looking at now"; an operation for another document is not applied and not
        // queued. Causal-gap observation is registered first (a documented order, not
        // a correctness requirement).
        // Who made each operation that arrives, noted before it is applied, so a
        // shared Undo can check it takes back only its own author's step.
        this._unattachAuthorRecord = this._documentCommandPropagation
            ? this._documentCommandPropagation.onOperationReceived((documentId, command, authorIdentityId) => {
                if (command?.id) this._operationAuthors.set(command.id, authorIdentityId || null);
            })
            : null;
        this._unattachCausalGapObservation = this._documentCommandPropagation
            ? this._documentOperationCausalGapObservation.attachToPropagation(this._documentCommandPropagation)
            : null;
        this._unattachRemoteApplication = this._documentCommandPropagation
            ? this._documentOperationDeferral.attachToPropagation(
                this._documentCommandPropagation,
                () => (this._documentManager.document && this._commandHistory
                    ? { documentId: this._documentManager.document.world.id, commandHistory: this._remoteApplyingHistory() }
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
        if (!this._commandHistory) return false;
        return this.sharedEditing ? Boolean(this._nextOwnStep(this._ownDone)) : this._commandHistory.canUndo();
    }

    canRedo() {
        if (!this._commandHistory) return false;
        return this.sharedEditing ? Boolean(this._nextOwnStep(this._ownUndone)) : this._commandHistory.canRedo();
    }

    getUndoLabel() {
        if (!this._commandHistory) return null;
        if (!this.sharedEditing) return this._commandHistory.getUndoLabel();
        const step = this._nextOwnStep(this._ownDone);
        return step ? message('history.undo', { action: step.describe() }) : null;
    }

    getRedoLabel() {
        if (!this._commandHistory) return null;
        if (!this.sharedEditing) return this._commandHistory.getRedoLabel();
        const step = this._nextOwnStep(this._ownUndone);
        return step ? message('history.redo', { action: step.describe() }) : null;
    }

    // The action registry calls session.undo()/redo() directly, so these must
    // exist even though canUndo()/canRedo() already do. While building
    // together they take back (and put back) only this replica's own steps,
    // as operations every co-builder applies (SharedUndoCommands.js); false
    // when there was none, or it couldn't be undone any more
    // (lastSharedStep says which).
    undo() {
        if (!this._commandHistory) {
            return false;
        }
        if (this.sharedEditing) return this._sharedStep(UndoOperationCommand, this._ownDone, this._ownUndone);
        this._commandHistory.undo();
        return true;
    }

    redo() {
        if (!this._commandHistory) {
            return false;
        }
        if (this.sharedEditing) return this._sharedStep(RedoOperationCommand, this._ownUndone, this._ownDone);
        this._commandHistory.redo();
        return true;
    }

    // Whether an operation `authorIdentityId` sent is one a host passes on to
    // the other co-builders: anything but a shared Undo or Redo of a step
    // someone else made (which every replica that knows the step refuses).
    acceptsSharedStep(command, authorIdentityId) {
        if (!isSharedStepCommand(command)) return true;
        const its = this._operationAuthors.get(command.targetId);
        return its === undefined || its === authorIdentityId;
    }

    // Undo starts again from here: a co-builder who joined now never had the
    // steps made before, so undoing one would change their copy differently.
    // True when it dropped steps Undo could have taken back.
    resetSharedUndo() {
        const dropped = this._ownDone.length > 0 || this._ownUndone.length > 0;
        this._ownDone = [];
        this._ownUndone = [];
        return dropped;
    }

    _sharedStep(StepCommand, from, to) {
        this.lastSharedStep = null;
        while (from.length > 0) {
            const targetId = from.pop();
            if (!this._findOperation(targetId)) continue;
            const step = new StepCommand({ worldId: this._documentManager.document?.world.id, targetId });
            this._commandHistory.execute(step);
            this.lastSharedStep = { kind: StepCommand === UndoOperationCommand ? 'undo' : 'redo', applied: step.applied };
            if (step.applied) to.push(targetId);
            return step.applied;
        }
        return false;
    }

    _nextOwnStep(stack) {
        for (let i = stack.length - 1; i >= 0; i--) {
            const step = this._findOperation(stack[i]);
            if (step) return step;
        }
        return null;
    }

    // The step with this id this Editor executed, newest first.
    _findOperation(id) {
        if (!this._commandHistory || !id) return null;
        const executed = this._commandHistory.getExecutedCommands();
        for (let i = executed.length - 1; i >= 0; i--) {
            if (executed[i].id === id) return executed[i];
        }
        return null;
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

    // Opens a co-builder's copy of their build (Build with me): the same as
    // openDocument(), and `operationIds`, the operations already part of it,
    // count as applied, so the operations that follow them apply as they
    // arrive.
    openSharedDocument(document, operationIds = []) {
        this.openDocument(document);
        const documentId = this._documentManager.document?.world.id;
        if (!documentId) return;
        for (const operationId of operationIds) {
            if (typeof operationId !== 'string' || !operationId || this._causalGapDetector.isKnown(documentId, operationId)) continue;
            try {
                this._causalGapDetector.record(documentId, operationId, []);
            } catch {
                // A malformed id is left out; an operation naming it waits.
            }
        }
        this._documentOperationDeferral.markExecuted(documentId, operationIds);
    }

    // The operations the open build already reflects, to hand a co-builder
    // with a copy of it (openSharedDocument()).
    appliedOperationIds() {
        const documentId = this._documentManager.document?.world.id;
        if (!documentId || !this._commandHistory) return [];
        const ids = new Set(this._documentOperationDeferral.baselineOf(documentId));
        for (const command of this._commandHistory.getExecutedCommands()) ids.add(command.id);
        return [...ids];
    }

    // Where the pointer at screen (x, y) meets the scene, { x, y, z }, or
    // null: shared with co-builders (Build with me).
    pointAt(screenX, screenY) {
        if (!this._session || typeof this._session.pickPoint !== 'function') return null;
        const point = this._session.pickPoint(screenX, screenY);
        return point ? { x: point.x, y: point.y, z: point.z } : null;
    }

    // Draws co-builders' pointers and selections (Build with me).
    showCoBuilders(coBuilders) {
        if (this._session && typeof this._session.showCoBuilders === 'function') this._session.showCoBuilders(coBuilders);
    }

    // The bricks selected in this Editor, by id.
    selectedBrickIds() {
        const selection = this._editorContext?.selection;
        return selection && !selection.isEmpty && Array.isArray(selection.brickIds) ? [...selection.brickIds] : [];
    }

    // While building together (Build with me), Undo and Redo take back only
    // this replica's own steps, as operations every co-builder applies.
    setSharedEditing(shared) {
        this._sharedEditing = Boolean(shared);
    }

    get sharedEditing() {
        return this._sharedEditing === true;
    }

    _recordLocalOperations(documentId, commandHistory, isLocal) {
        const subscription = commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_EXECUTED, ({ command }) => {
            if (!isLocal() || !command?.id || this._causalGapDetector.isKnown(documentId, command.id)) return;
            const executed = commandHistory.getExecutedCommands();
            const preceding = executed.length >= 2 ? executed[executed.length - 2] : null;
            try {
                this._causalGapDetector.record(documentId, command.id, preceding ? [preceding.id] : []);
            } catch {
                // Recording is knowledge, never a precondition for the edit.
            }
        });
        return () => subscription.unsubscribe();
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
        this._commandActivityListeners.clear();
        if (this._unattachAuthorRecord) {
            this._unattachAuthorRecord();
            this._unattachAuthorRecord = null;
        }
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

    // A fresh CommandHistory for `world`, wired to dirty tracking, the
    // command protocol, recovery and deferral; torn down by _teardown().
    _attachCommandHistory(world) {
        // findOperation/operationAuthor: what a shared Undo or Redo looks up
        // (application/commands/SharedUndoCommands.js). An operation that
        // arrives has its author noted before it is applied; one being made
        // here, not yet noted, is this replica's own.
        this._commandHistory = new CommandHistory({
            world,
            findOperation: (id) => this._findOperation(id),
            operationAuthor: (id) => {
                if (this._operationAuthors.has(id)) return this._operationAuthors.get(id);
                return this._applyingRemoteOperation ? undefined : SELF;
            }
        });
        this._operationAuthors = new Map();
        this.resetSharedUndo();
        this._editorCommandHistories.set(world.id, this._commandHistory);
        this._untrackDirtyState = this._documentManager.trackCommandHistory(this._commandHistory);
        // Outgoing broadcast for this CommandHistory; torn down before the next
        // rebuild.
        // A collaborator's operation, applied through this same history, is
        // theirs: never sent on again, nor answered for, as this replica's.
        const isLocal = () => !this._applyingRemoteOperation;
        this._unattachCommandHistoryPropagation = this._documentCommandPropagation
            ? this._documentCommandPropagation.attachCommandHistory({
                documentId: world.id,
                commandHistory: this._commandHistory,
                isLocal
            })
            : null;
        // Records locally authored operations so recovery requests can be answered.
        this._unattachRecoveryCommandHistory = this._documentOperationRecovery
            ? this._documentOperationRecovery.attachCommandHistory({
                documentId: world.id,
                commandHistory: this._commandHistory,
                isLocal
            })
            : null;
        // This replica's own operations are known to its causal graph, as
        // received ones are: a collaborator's next operation, which follows
        // one of ours, is then ready to apply rather than held for ever.
        this._unattachLocalCausalRecord = this._documentCommandPropagation
            ? this._recordLocalOperations(world.id, this._commandHistory, isLocal)
            : null;
        // This replica's own steps: made here (SELF), and the ones a shared
        // Undo can take back. A new step clears what Redo could put back.
        const ownHistory = this._commandHistory;
        const ownSteps = ownHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_EXECUTED, ({ command }) => {
            if (!command?.id || !isLocal()) return;
            this._operationAuthors.set(command.id, SELF);
            if (isSharedStepCommand(command)) return;
            this._ownDone.push(command.id);
            if (this._ownDone.length > MAX_OWN_STEPS) this._ownDone.shift();
            this._ownUndone = [];
        });
        this._unattachOwnSteps = () => ownSteps.unsubscribe();
        // Lets anything executing on this document release deferred operations it
        // just made ready. Always attached: it costs nothing when nothing is deferred.
        this._unattachDeferralCommandHistory = this._documentOperationDeferral.attachCommandHistory({
            documentId: world.id,
            commandHistory: this._commandHistory
        });
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
        const eventBus = new EventBus();
        this._session = new RenderWorldUseCase().execute(
            this._container,
            eventBus,
            this._registry,
            this._editorContext.eventBus,
            { gestureService: this._gizmoGestureRouter, structureResolver: this._structureResolver }
        );
        const world = populateWorldFn(eventBus);
        this._attachCommandHistory(world);
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
        this._subscribeCommandActivity();
    }

    // Relays the current CommandHistory's events to onCommandActivity()
    // listeners; called for each history a rebuild makes.
    _subscribeCommandActivity() {
        for (const subscription of this._activitySubscriptions) {
            subscription.unsubscribe();
        }
        const activity = (kind) => ({ command }) => {
            if (kind === EDITOR_ACTIVITY.EXECUTED) this._noteReadyMadePaste(command);
            this._emitCommandActivity(kind, command);
        };
        this._activitySubscriptions = [
            this._commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_EXECUTED, activity(EDITOR_ACTIVITY.EXECUTED)),
            this._commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_UNDONE, activity(EDITOR_ACTIVITY.UNDONE)),
            this._commandHistory.eventBus.subscribe(CommandHistoryEvent.COMMAND_REDONE, activity(EDITOR_ACTIVITY.REDONE))
        ];
    }

    // The open build was just started from something (a ready-made structure,
    // or a copy of a build): all its bricks are ready-made, not its builder's.
    noteReadyMadeStart() {
        const world = this._documentManager.document?.world;
        if (this._readyMadeBricks && world) this._readyMadeBricks.started(world);
    }

    // A Build Library structure dropped in: its bricks are ready-made too. One
    // of My Structures is not: its bricks count as placed by the builder.
    _noteReadyMadePaste(command) {
        if (!this._readyMadeBricks || !command || !command.isLibraryStructure) return;
        if (!this._isReadyMadeStructure(command.structureId)) return;
        const world = this._documentManager.document?.world;
        if (!world || world.id !== command.worldId) return;
        const building = world.getBuilding(command.buildingId);
        if (!building) return;
        const bricks = command.executedBrickIds.map((id) => building.findBrick(id)).filter(Boolean);
        this._readyMadeBricks.added(world.id, bricks);
    }

    // Calls `listener(activity, command)` for every edit the user makes in this
    // Editor, whichever document is open: an EDITOR_ACTIVITY and the command as
    // { type, children } (children for a composite). Collaborators' edits
    // arriving from peers are left out. Returns an unsubscribe function.
    onCommandActivity(listener) {
        this._commandActivityListeners.add(listener);
        return () => this._commandActivityListeners.delete(listener);
    }

    _emitCommandActivity(activity, command) {
        if (this._applyingRemoteOperation || this._commandActivityListeners.size === 0) {
            return;
        }
        const described = describeCommand(command);
        for (const listener of [...this._commandActivityListeners]) {
            listener(activity, described);
        }
    }

    // The command history as remote operations see it: the same history, but
    // executing through it marks the edit as a collaborator's, so
    // onCommandActivity() leaves it out.
    _remoteApplyingHistory() {
        const history = this._commandHistory;
        return new Proxy(history, {
            get: (target, property) => {
                if (property === 'execute') {
                    return (command) => {
                        this._applyingRemoteOperation = true;
                        try {
                            return target.execute(command);
                        } finally {
                            this._applyingRemoteOperation = false;
                        }
                    };
                }
                const value = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
            }
        });
    }

    _teardown() {
        for (const subscription of this._gizmoSubscriptions) {
            subscription.unsubscribe();
        }
        this._gizmoSubscriptions = [];
        for (const subscription of this._activitySubscriptions) {
            subscription.unsubscribe();
        }
        this._activitySubscriptions = [];
        this._editorCommandHistories.clear();
        if (this._unattachCommandHistoryPropagation) {
            this._unattachCommandHistoryPropagation();
            this._unattachCommandHistoryPropagation = null;
        }
        if (this._unattachLocalCausalRecord) {
            this._unattachLocalCausalRecord();
            this._unattachLocalCausalRecord = null;
        }
        if (this._unattachOwnSteps) {
            this._unattachOwnSteps();
            this._unattachOwnSteps = null;
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
