import { World } from '../core/World.js';
import { Document } from '../core/Document.js';
import { EditorEvent } from '../core/events/EditorEvent.js';
import { SelectionState } from './editor-state/SelectionState.js';
import { DeleteBrickCommand } from './commands/DeleteBrickCommand.js';
import { SetBrickColorCommand } from './commands/SetBrickColorCommand.js';
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
import { RemoteDocumentOperationApplicationUseCase } from './RemoteDocumentOperationApplicationUseCase.js';
import { DocumentOperationCausalGapObservationUseCase } from './DocumentOperationCausalGapObservationUseCase.js';
import { DocumentOperationCausalGapDetector } from '../core/DocumentOperationCausalGapDetector.js';
import { DocumentOperationDeferralUseCase } from './DocumentOperationDeferralUseCase.js';
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
import { PASTE_OFFSET as DUPLICATE_OFFSET } from './PasteClipboardUseCase.js';
import { ForkStructureUseCase } from './ForkStructureUseCase.js';
import { CopyStructureIntoDocumentUseCase } from './CopyStructureIntoDocumentUseCase.js';
import { CreateStructureFromSelectionUseCase } from './CreateStructureFromSelectionUseCase.js';
import { ExportBlueprintUseCase } from './ExportBlueprintUseCase.js';
import { ExportDocumentUseCase } from './ExportDocumentUseCase.js';
import { ImportBlueprintUseCase } from './ImportBlueprintUseCase.js';
import { ImportDocumentUseCase } from './ImportDocumentUseCase.js';
import { deriveBlueprintFingerprint } from '../core/BlueprintFingerprint.js';
import { ForkStructureToLibraryUseCase } from './ForkStructureToLibraryUseCase.js';
import { RemoveStructurePlacementCommand } from './commands/RemoveStructurePlacementCommand.js';
import { MoveStructurePlacementCommand } from './commands/MoveStructurePlacementCommand.js';
import { RotateStructurePlacementCommand } from './commands/RotateStructurePlacementCommand.js';
import { DuplicateStructurePlacementCommand } from './commands/DuplicateStructurePlacementCommand.js';
import { StructurePlacementValidator } from './StructurePlacementValidator.js';
import { SpatialBounds } from '../core/SpatialBounds.js';
import { Position } from '../core/Position.js';
import { StructurePlacementGestureService } from './StructurePlacementGestureService.js';
import { GizmoGestureRouter } from './GizmoGestureRouter.js';
import { terrainHeightAt, DEFAULT_WORLD_SEED } from '../core/TerrainHeightField.js';
import { CameraState } from '../renderer/CameraState.js';
import { SelectionBoundsService } from './SelectionBoundsService.js';

// Owns the live runtime graph (render session, World, CommandHistory,
// ToolManager, InputDispatcher) as one unit, so nothing else has to know how
// to tear it down and rebuild it. EditorView only calls
// start()/loadDocument()/newDocument()/dispose() and forwards raw DOM events;
// it never touches a World, Renderer or ToolManager.
//
// Same camera offset as WorldNavigationSession#focusLocation(), so both views
// frame locations the same way.

const ENTRY_CAMERA_OFFSET = { x: 12, y: 12, z: 12 };

// Shift+Click adds one brick; Shift+Drag draws a box. Movement under this many
// pixels counts as a click.
const MARQUEE_DRAG_THRESHOLD_PX = 6;

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

    // ------------------------------------------ consolidated editing surface

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

    // Frames the camera on `position` (layout position plus a fixed offset,
    // looking at it), so "Edit a Copy" opens on what the viewer was looking at.
    // Returns false before a render session exists or without a position.
    frameCameraOn(position) {
        if (!this._session || !position) {
            return false;
        }
        const { x, y, z } = position;
        this._session.setCameraState(new CameraState({
            position: new Position(x + ENTRY_CAMERA_OFFSET.x, y + ENTRY_CAMERA_OFFSET.y, z + ENTRY_CAMERA_OFFSET.z),
            target: new Position(x, y, z),
            zoom: 1
        }));
        return true;
    }

    // Applies an EditorEntryContext after a fork opens: frames the camera and,
    // only when the opened document is the focused object's own content (a
    // Structure), selects everything. A null context leaves camera and selection
    // as they are.
    applyEntryContext(entryContext) {
        if (!entryContext) {
            return false;
        }
        if (entryContext.focusPosition) {
            this.frameCameraOn(entryContext.focusPosition);
        }
        if (entryContext.selectAllBricks) {
            this.selectAll();
        }
        return true;
    }

    marqueeSelect({ x0, y0, x1, y1 } = {}, { additive = false } = {}) {
        if (!this._session || typeof this._session.pickRectangle !== 'function') {
            return false;
        }
        const hits = this._session.pickRectangle(x0, y0, x1, y1) || [];
        const items = hits
            .filter((hit) => hit && hit.buildingId && hit.brickId)
            .map((hit) => ({
                type: 'brick',
                buildingId: hit.buildingId,
                brickId: hit.brickId
            }));
        const nextSelection = additive
            ? items.reduce(
                (selection, item) => selection.add(item.brickId, item.buildingId),
                this._editorContext.selection
            )
            : new SelectionState({ items });

        this._editorContext.setSelection(nextSelection);
        if (typeof this._session.selectBricks === 'function') {
            this._session.selectBricks(nextSelection.brickIds, nextSelection.brickId);
        }
        return true;
    }

    // One DeleteBrickCommand per brick in one CompositeCommand (a single undo
    // step). A structure-placement selection removes the placement instead, via
    // the same action.
    deleteSelection() {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (selection.isEmpty || !document || !this._commandHistory) {
            return false;
        }
        if (selection.isStructurePlacementSelection) {
            const removed = this.removeStructurePlacement(selection.selectedPlacementId);
            if (removed) {
                this._editorContext.clearSelection();
            }
            return removed;
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

    // One undo step for any number of bricks. Brick selections only: a placement
    // has no single color.
    recolorSelection(color) {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (selection.isEmpty || !document || !this._commandHistory) {
            return false;
        }
        if (selection.isStructurePlacementSelection) {
            return false;
        }
        const worldId = document.world.id;
        const commands = selection.items.map((item) => new SetBrickColorCommand({
            worldId,
            buildingId: item.buildingId,
            brickId: item.brickId,
            color
        }));
        const command = commands.length === 1
            ? commands[0]
            : commands.reduce((composite, child) => composite.add(child),
                new CompositeCommand({ description: `Recolor ${commands.length} Bricks` }));
        this._commandHistory.execute(command);
        return true;
    }

    // ------------------------ alignment / distribution / numeric

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

    // ---------------------------------------------------------------
    // Transform operations (delegate to the gesture service, as
    // WorldNavigationSession does)
    //
    // Placement selections branch off before SpatialEditingService, which stays
    // brick/group-shaped; placements have their own move/rotate commands.
    // ---------------------------------------------------------------
    moveSelection(delta, gestureOptions = {}) {
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            return false;
        }
        const selection = this._editorContext.selection;
        if (selection.isStructurePlacementSelection) {
            return this._moveStructurePlacement(selection.selectedPlacementId, delta);
        }
        return this._gestureService.moveSelection(selection, delta, gestureOptions);
    }

    rotateSelection(deltaRotation, gestureOptions = {}) {
        if (this._editorContext.tool.activeTool === ToolId.PLACE) {
            return false;
        }
        const selection = this._editorContext.selection;
        if (selection.isStructurePlacementSelection) {
            return this._rotateStructurePlacement(selection.selectedPlacementId, deltaRotation);
        }
        return this._gestureService.rotateSelection(selection, deltaRotation, gestureOptions);
    }

    // For a placement: a new placement of the same document (never a new
    // Document); returns its id or null. For bricks: one PasteBricksCommand with
    // fresh ids.
    duplicateSelection() {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (selection.isEmpty || !document || !this._commandHistory) {
            return null;
        }
        if (selection.isStructurePlacementSelection) {
            const command = new DuplicateStructurePlacementCommand({
                worldId: document.world.id,
                placementId: selection.selectedPlacementId
            });
            this._commandHistory.execute(command);
            if (command.executedPlacementId && this._selectionUseCase) {
                this._selectionUseCase.selectPlacement(command.executedPlacementId);
            }
            return command.executedPlacementId;
        }
        return this._duplicateBrickSelection(selection, document);
    }

    // A duplicate is a copy pasted at an offset, so this reuses the copy/paste use
    // cases with a throwaway clipboard: the user's real clipboard is never touched.
    // The copy becomes the selection.
    _duplicateBrickSelection(selection, document) {
        if (!this._copySelectionUseCase || !this._pasteClipboardUseCase) {
            return null;
        }
        const clipboard = this._copySelectionUseCase.execute(selection, document);
        if (!clipboard || clipboard.isEmpty) {
            return null;
        }
        const buildingId = selection.buildingId;
        const command = this._pasteClipboardUseCase.execute(clipboard, {
            worldId: document.world.id,
            buildingId,
            position: DUPLICATE_OFFSET
        });
        if (!command) {
            return null;
        }
        this._commandHistory.execute(command);
        if (command.executedBrickIds.length > 0) {
            const items = command.executedBrickIds.map((brickId) => ({ type: 'brick', buildingId, brickId }));
            this._editorContext.setSelection(new SelectionState({ items }));
        }
        return command.executedBrickIds[0] || null;
    }

    // options: { count, offset: {x,y,z} }. One history entry with an atomic
    // collision check: null means nothing changed. The new bricks become the
    // selection.
    repeatSelection(options = {}) {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (!this._repeatSelectionUseCase || selection.isEmpty || !document || !this._commandHistory) {
            return false;
        }
        const buildingId = selection.buildingId;
        const command = this._repeatSelectionUseCase.execute(selection, document, options);
        if (!command) {
            return false;
        }
        this._commandHistory.execute(command);
        const items = command.commands
            .flatMap((child) => child.executedBrickIds)
            .map((brickId) => ({ type: 'brick', buildingId, brickId }));
        if (items.length > 0) {
            this._editorContext.setSelection(new SelectionState({ items }));
        }
        return true;
    }

    // Count and live bounds of a brick selection, for SelectionInspector. Null for
    // no document, an empty selection, or a placement selection (which has
    // getSelectedPlacementInfo(); the two shapes are kept apart so a UI cannot
    // wire placement editing to brick bounds).
    getSelectionSummary() {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (selection.isEmpty || selection.isStructurePlacementSelection || !document) {
            return null;
        }
        const bounds = this._boundsService.calculate(selection, document);
        if (!bounds) {
            return null;
        }
        return {
            count: selection.items.length,
            bounds
        };
    }

    // Null when nothing (or a non-placement) is selected, or the document or
    // history is not ready.
    getSelectedPlacementInfo() {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (!selection.isStructurePlacementSelection || !document) {
            return null;
        }
        const placement = document.world.getStructurePlacement(selection.selectedPlacementId);
        if (!placement) {
            return null;
        }
        let title = placement.documentId;
        if (this._loadDocumentUseCase && typeof this._loadDocumentUseCase.listSavedDocuments === 'function') {
            const entry = this._loadDocumentUseCase.listSavedDocuments()
                .find((doc) => doc.id === placement.documentId);
            if (entry) {
                title = entry.title;
            }
        }
        return {
            placementId: placement.id,
            documentId: placement.documentId,
            title,
            position: placement.position,
            rotation: placement.rotation,
            // Read-only (docs/Principles.md, "A Placement's Elevation Is Never A Gizmo Or
            // Numeric Target"), computed like the renderer does.
            groundY: terrainHeightAt(DEFAULT_WORLD_SEED, placement.position.x, placement.position.z)
        };
    }

    // Numeric targets for the selected placement, turned into the same delta calls
    // as dragging; omitted axes are unchanged and Y is never a target. Returns
    // { moved, blocked, rotated }; `blocked` means X/Z were requested but collide.
    applyPlacementTransform({ x = null, z = null, rotation = null } = {}) {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (!selection.isStructurePlacementSelection || !document) {
            return { moved: false, blocked: false, rotated: false };
        }
        const placementId = selection.selectedPlacementId;
        const placement = document.world.getStructurePlacement(placementId);
        if (!placement) {
            return { moved: false, blocked: false, rotated: false };
        }

        let moved = false;
        let blocked = false;
        if (x !== null || z !== null) {
            const targetX = x !== null ? Number(x) : placement.position.x;
            const targetZ = z !== null ? Number(z) : placement.position.z;
            const delta = { x: targetX - placement.position.x, y: 0, z: targetZ - placement.position.z };
            if (delta.x !== 0 || delta.z !== 0) {
                moved = this._moveStructurePlacement(placementId, delta);
                blocked = !moved;
            }
        }

        let rotated = false;
        if (rotation !== null) {
            const deltaRotation = Number(rotation) - placement.rotation;
            if (deltaRotation !== 0) {
                rotated = this._rotateStructurePlacement(placementId, deltaRotation);
            }
        }

        return { moved, blocked, rotated };
    }

    // Edits happen by opening the placement's Document, never by modifying the
    // instance.
    editStructurePlacementSource(documentId) {
        if (!documentId) {
            return false;
        }
        this.loadDocument(documentId);
        return true;
    }

    _moveStructurePlacement(placementId, delta) {
        const document = this._documentManager.document;
        if (!document || !this._commandHistory) {
            return false;
        }
        const world = document.world;
        const placement = world.getStructurePlacement(placementId);
        if (!placement) {
            return false;
        }
        const candidate = new Position(
            placement.position.x + delta.x,
            placement.position.y + delta.y,
            placement.position.z + delta.z
        );
        if (!this._structurePlacementFits(world, placement, candidate)) {
            return false;
        }
        this._commandHistory.execute(new MoveStructurePlacementCommand({
            worldId: world.id, placementId, delta
        }));
        return true;
    }

    _rotateStructurePlacement(placementId, deltaRotation) {
        const document = this._documentManager.document;
        if (!document || !this._commandHistory) {
            return false;
        }
        const world = document.world;
        if (!world.getStructurePlacement(placementId)) {
            return false;
        }
        this._commandHistory.execute(new RotateStructurePlacementCommand({
            worldId: world.id, placementId, deltaRotation
        }));
        return true;
    }

    // Excludes the placement's own id so it never collides with itself. Permissive
    // (true) without a resolver or a resolvable document.
    _structurePlacementFits(world, placement, candidatePosition) {
        if (!this._structureResolver) {
            return true;
        }
        const placedWorld = this._structureResolver.resolve(placement.documentId);
        if (!placedWorld) {
            return true;
        }
        const validator = new StructurePlacementValidator();
        return validator.canPlace(world, this._registry, this._structureResolver, {
            localBounds: SpatialBounds.fromWorld(placedWorld, this._registry),
            position: candidatePosition,
            excludePlacementId: placement.id
        });
    }

    // ---------------------------------------------------------------
    // Clipboard operations (delegate to shared use cases)
    // ---------------------------------------------------------------
    copySelection() {
        if (!this._copySelectionUseCase || !this._documentManager.document) return null;
        const result = this._copySelectionUseCase.execute(this._editorContext.selection, this._documentManager.document);
        this._clipboardState = result;
        this._pasteCount = 0; // Reset cascade counter
        return result;
    }

    paste() {
        if (!this._pasteClipboardUseCase || !this._clipboardState || this._clipboardState.isEmpty || !this._documentManager.document || !this._commandHistory) return false;
        const document = this._documentManager.document;
        const world = document.world;
        const buildings = world.getBuildings();
        if (buildings.length === 0) return false;
        const buildingId = buildings[0].id;

        this._pasteCount = (this._pasteCount || 0) + 1;
        const offset = { x: 2 * this._pasteCount, y: 0, z: 2 * this._pasteCount };

        const command = this._pasteClipboardUseCase.execute(this._clipboardState, {
            worldId: world.id, buildingId, position: offset
        });
        if (!command) return false;
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

    renameGroup(groupId, name) {
        if (!groupId) {
            return false;
        }
        this._selectedGroupId = groupId;
        return this.renameSelectedGroup(name);
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

    duplicateGroup(groupId) {
        if (!groupId) {
            return null;
        }
        this._selectedGroupId = groupId;
        return this.duplicateSelectedGroup();
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

    deleteGroup(groupId) {
        if (!groupId) {
            return false;
        }
        this._selectedGroupId = groupId;
        return this.deleteSelectedGroup();
    }

    addSelectionToSelectedGroup(groupId = null) {
        groupId = groupId || this._selectedGroupId;
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

    removeSelectionFromSelectedGroup(groupId = null) {
        groupId = groupId || this._selectedGroupId;
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

    // Forks a library Structure into a new Document and opens it through the same
    // path as a Load; the library Structure is never touched. Returns false for a
    // falsy structure.
    forkStructure(structure) {
        if (!structure) {
            return false;
        }
        const forkedDocument = this._forkStructureUseCase.execute(structure, this._identityProvider);
        this.openDocument(forkedDocument);
        return true;
    }

    // Copies the Structure's bricks into the open document as one
    // PasteBricksCommand (undo, replay and serialization for free), placed past
    // what the document already contains so compositions never overlap. Returns
    // false if there is nothing to copy or copy into.
    copyStructureIntoDocument(structure) {
        if (!structure || !this._copyStructureIntoDocumentUseCase || !this._documentManager.document || !this._commandHistory) {
            return false;
        }
        const document = this._documentManager.document;
        const world = document.world;
        const buildings = world.getBuildings();
        if (buildings.length === 0) {
            return false;
        }
        const command = this._copyStructureIntoDocumentUseCase.execute(structure, {
            worldId: world.id,
            buildingId: buildings[0].id,
            world,
            registry: this._registry
        });
        if (!command) {
            return false;
        }
        this._commandHistory.execute(command);
        return true;
    }

    // Enters COMPOSE_STRUCTURE mode; the copy only happens when the tool commits.
    // Checks up front that there is a document to compose into.
    beginStructureComposition(structure) {
        if (!structure || !this._documentManager.document) {
            return false;
        }
        if (this._documentManager.document.world.getBuildings().length === 0) {
            return false;
        }
        this._editorContext.setActiveComposition(structure);
        this._editorContext.setActiveTool(ToolId.COMPOSE_STRUCTURE);
        return true;
    }

    // Extracts the selected bricks into a new, unsaved Structure. Observation only:
    // no document change and no undo entry. Returns null with nothing to extract;
    // throws for a non-brick selection or a missing name.
    createStructureFromSelection(metadata = {}) {
        const document = this._documentManager.document;
        if (!this._createStructureFromSelectionUseCase || !document) {
            return null;
        }
        return this._createStructureFromSelectionUseCase.execute(this._editorContext.selection, document, {
            ...metadata,
            registry: this._registry
        });
    }

    // Saving is a separate step from extraction.
    saveStructureToPersonalLibrary(structure) {
        if (!structure || !this._personalStructureLibraryStore) {
            return false;
        }
        this._personalStructureLibraryStore.addStructure(structure);
        return true;
    }

    // Always exports the document open in this session, as the serializer's exact
    // JSON.
    exportDocument() {
        if (!this._exportDocumentUseCase) {
            return null;
        }
        return this._exportDocumentUseCase.execute(this._documentManager.document);
    }

    // `json` is untrusted. A malformed import throws before openDocument(), so the
    // open document and storage are untouched. On success it opens like a fork;
    // nothing is saved until the user saves.
    importDocument(json) {
        if (!this._importDocumentUseCase) {
            return null;
        }
        const importedDocument = this._importDocumentUseCase.execute(json);
        this.openDocument(importedDocument);
        return importedDocument;
    }

    exportBlueprint(structure, attributions = [], lineageClaims = []) {
        if (!this._exportBlueprintUseCase) {
            return null;
        }
        return this._exportBlueprintUseCase.execute(structure, { attributions, lineageClaims });
    }

    // Validates, constructs and saves in one call: an imported blueprint carries
    // its own metadata. Throws BlueprintPackageError on bad input; returns null
    // if nothing is wired.
    importBlueprint(pkg) {
        if (!this._importBlueprintUseCase || !this._personalStructureLibraryStore) {
            return null;
        }
        const structure = this._importBlueprintUseCase.execute(pkg, { registry: this._registry });
        this._personalStructureLibraryStore.addStructure(structure);
        return structure;
    }

    exportBlueprintAttribution(attribution) {
        if (!this._blueprintAttributionExchange) {
            return null;
        }
        return this._blueprintAttributionExchange.exportAttribution(attribution);
    }

    // When `structure` is given, its fingerprint is computed here and checked
    // against the package, never trusted from it. Without one, the cross-check is
    // skipped.
    importBlueprintAttribution(pkg, structure = null) {
        if (!this._blueprintAttributionExchange) {
            return null;
        }
        const expectedFingerprint = structure ? deriveBlueprintFingerprint(structure) : null;
        return this._blueprintAttributionExchange.importAttribution(pkg, { expectedFingerprint });
    }

    exportBlueprintLineageClaim(claim) {
        if (!this._blueprintLineageExchange) {
            return null;
        }
        return this._blueprintLineageExchange.exportClaim(claim);
    }

    // Same rule with two optional local Structures (source and derived).
    importBlueprintLineageClaim(pkg, { sourceStructure = null, derivedStructure = null } = {}) {
        if (!this._blueprintLineageExchange) {
            return null;
        }
        const expectedSourceFingerprint = sourceStructure ? deriveBlueprintFingerprint(sourceStructure) : null;
        const expectedDerivedFingerprint = derivedStructure ? deriveBlueprintFingerprint(derivedStructure) : null;
        return this._blueprintLineageExchange.importClaim(pkg, { expectedSourceFingerprint, expectedDerivedFingerprint });
    }

    // Forks a Structure into a new personal Structure (no Document). Returns null
    // if nothing is wired.
    forkStructureToPersonalLibrary(structure) {
        if (!structure || !this._forkStructureToLibraryUseCase || !this._personalStructureLibraryStore) {
            return null;
        }
        const forked = this._forkStructureToLibraryUseCase.execute(structure);
        this._personalStructureLibraryStore.addStructure(forked);
        return forked;
    }

    // Places `documentId` into the currently open document; it does not open it.
    // Refuses the open document itself.
    placeDocument(documentId, title = null) {
        if (!documentId) {
            return false;
        }
        const document = this._documentManager.document;
        if (document && document.world.id === documentId) {
            return false;
        }
        this._editorContext.setActiveStructure(documentId, title);
        this._editorContext.setActiveTool(ToolId.PLACE_STRUCTURE);
        return true;
    }

    removeStructurePlacement(placementId) {
        const document = this._documentManager.document;
        if (!placementId || !document || !this._commandHistory) {
            return false;
        }
        this._commandHistory.execute(new RemoveStructurePlacementCommand({
            worldId: document.world.id,
            placementId
        }));
        return true;
    }

    onPointerDown(event) {
        if (event.button === 0 && this._session
            && this._session.gizmoPointerDown(event.clientX, event.clientY, this._editorContext.selection)) {
            return null;
        }
        // A Shift-held left button starts a marquee instead of reaching SelectionTool.
        // Checked after the gizmo so Shift on a gizmo handle still means precision.
        // Click or marquee is decided on release.
        if (event.button === 0 && event.shiftKey) {
            this._marqueeState = {
                additive: !!(event.ctrlKey || event.metaKey),
                x0: event.clientX,
                y0: event.clientY,
                x1: event.clientX,
                y1: event.clientY,
                moved: false
            };
            // The marquee must own the pointer like the gizmo does, or orbit pans the
            // scene under the rectangle.
            if (this._session) {
                this._session.setControlsEnabled(false);
            }
            return null;
        }
        if (this._inputDispatcher) {
            this._inputDispatcher.dispatchPointerDown(event);
        }
        return null;
    }

    onPointerMove(event) {
        if (this._marqueeState) {
            this._marqueeState.x1 = event.clientX;
            this._marqueeState.y1 = event.clientY;
            const dx = this._marqueeState.x1 - this._marqueeState.x0;
            const dy = this._marqueeState.y1 - this._marqueeState.y0;
            if (Math.hypot(dx, dy) > MARQUEE_DRAG_THRESHOLD_PX) {
                this._marqueeState.moved = true;
            }
            return null;
        }
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
        if (this._marqueeState) {
            const { x0, y0, x1, y1, additive, moved } = this._marqueeState;
            this._marqueeState = null;
            if (this._session) {
                this._session.setControlsEnabled(true);
            }
            if (moved) {
                this.marqueeSelect({ x0, y0, x1, y1 }, { additive });
            } else if (this._inputDispatcher) {
                // Never passed the threshold: replay as an ordinary Shift-click.
                this._inputDispatcher.dispatchPointerDown(event);
                this._inputDispatcher.dispatchPointerUp(event);
            }
            return null;
        }
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

    // ------------------------------------------------------- marquee UI
    // Read by EditorView to draw the overlay and to route Escape (gesture >
    // marquee > selection).

    isMarqueeActive() {
        return !!this._marqueeState;
    }

    getMarqueeRect() {
        if (!this._marqueeState) {
            return null;
        }
        const { x0, y0, x1, y1 } = this._marqueeState;
        return { x0, y0, x1, y1 };
    }

    cancelMarquee() {
        if (!this._marqueeState) {
            return false;
        }
        this._marqueeState = null;
        if (this._session) {
            this._session.setControlsEnabled(true);
        }
        return true;
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

    // Bridge between callers that pass a groupId and the action registry, which
    // works on the current selection.

    addToGroupWithSelection(groupId) {
        this._selectedGroupId = groupId;
        return this.addSelectionToSelectedGroup(groupId);
    }

    removeFromGroupWithSelection(groupId) {
        this._selectedGroupId = groupId;
        return this.removeSelectionFromSelectedGroup(groupId);
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
