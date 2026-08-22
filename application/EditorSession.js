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
import { ForkStructureUseCase } from './ForkStructureUseCase.js';
import { CopyStructureIntoDocumentUseCase } from './CopyStructureIntoDocumentUseCase.js';
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
        identityProvider = null,
        copySelectionUseCase = null,    // <--- ADD
        pasteClipboardUseCase = null,    // <--- ADD
        forkStructureUseCase = new ForkStructureUseCase(),
        // 0.4.0 — Structure Composition & Blueprint Library.
        copyStructureIntoDocumentUseCase = new CopyStructureIntoDocumentUseCase(),
        // 0.2.90 — Structure Placement & World Instances. Both optional
        // so an EditorSession built without them (older call sites,
        // test harnesses that never enter PLACE_STRUCTURE mode) keeps
        // working — StructurePlacementTool already degrades gracefully
        // when either is missing (its own header explains why).
        structureResolver = null,
        structurePreviewUseCase = null
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
        this._structureResolver = structureResolver;
        this._structurePreviewUseCase = structurePreviewUseCase;

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
        // 0.2.92 — World Instance Transform UX. A structure-placement
        // selection gets its OWN gesture service (never widens
        // SpatialEditingService — see that class's own 0.2.91 header),
        // and a small router so the ONE TransformGizmoController this
        // session constructs (application/RenderWorldUseCase.js) can
        // drive either kind of selection through the SAME shared visual
        // gizmo. See application/StructurePlacementGestureService.js and
        // application/GizmoGestureRouter.js for the full reasoning.
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

        this._pasteCount = 0;
    }

    get commandHistory() {
        return this._commandHistory;
    }

    get transformSettings() {
        return this._transformSettings;
    }

    // 0.2.92 — checks BOTH gesture services: a placement drag now sets
    // this._placementGestureService's own gizmo state active, exactly
    // parallel to how a brick drag sets this._gestureService's. Neither
    // service can be active while the other is (the gizmo controller
    // only ever drives one drag at a time), so this is simply "is either
    // one mid-gesture right now."
    isGestureActive() {
        return this._gestureService.transformGizmoState.active
            || this._placementGestureService.transformGizmoState.active;
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

    // Mirrors SelectionTool's delete path exactly: one DeleteBrickCommand
    // per brick, wrapped in a CompositeCommand, one undo step, selection
    // cleared afterwards. Session state + existing commands only — the
    // action layer that calls this never touches CommandHistory itself.
    //
    // 0.2.91 — a structure-placement selection branches to
    // removeStructurePlacement() instead: "the UI should finally expose
    // the existing [0.2.90] removal operation" via the SAME
    // selection.delete action (Delete/Backspace, the sidebar, the
    // palette) bricks already use, rather than a second delete pathway.
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
    //
    // 0.2.91 — a structure-placement selection branches BEFORE reaching
    // SpatialEditingService: that service (and TransformSelectionCommand
    // underneath it) is shaped entirely around brick/group selection
    // items — SelectionBoundsService, per-brick gesture math — and
    // deliberately stays that way rather than being widened to also
    // understand a StructurePlacement. Instead, a placement selection
    // gets its OWN small commands (MoveStructurePlacementCommand /
    // RotateStructurePlacementCommand), the exact same "mirrors X one
    // rung up, as its own small focused thing" precedent 0.2.90 already
    // set for PlaceStructureCommand vs. PlaceBrickCommand. The SELECTION
    // model, the ACTION registry (nudge/rotate/delete), and CommandHistory
    // are the abstractions this reuses; the gesture kernel is not one of
    // them.
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

    // 0.2.91 — "Duplicate" for a structure-placement selection: a new
    // StructurePlacement referencing the SAME documentId, never a new
    // Document (see application/commands/DuplicateStructurePlacementCommand.js's
    // own header). Returns the new placement's id (truthy) or null.
    // Deliberately not offered for a brick selection here — copy/paste
    // already covers that, and this action is gated on
    // ctx.selectionIsStructurePlacement in the registry (see
    // application/EditorActionRegistry.js, 'selection.duplicate').
    duplicateSelection() {
        const selection = this._editorContext.selection;
        const document = this._documentManager.document;
        if (!selection.isStructurePlacementSelection || !document || !this._commandHistory) {
            return null;
        }
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

    // 0.2.91 — everything a UI panel needs to show "Selected House
    // Instance": the placement's own id/documentId/position/rotation
    // plus the referenced Document's title, resolved via the SAME
    // Recent Documents listing Toolbar's own Place/Load buttons already
    // read (application/LoadDocumentUseCase.js#listSavedDocuments()) —
    // no second title-lookup mechanism. Returns null when nothing (or a
    // non-placement) is selected, or the document/history aren't ready.
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
            // 0.2.92 — the numeric inspector's read-only elevation
            // display (docs/Principles.md, "A Placement's Elevation Is
            // Never A Gizmo Or Numeric Target"). Computed fresh, the same
            // pure function renderer/WorldRenderer.js's own
            // _renderStructurePlacement() calls at render time — never a
            // stored fact, never editable here.
            groundY: terrainHeightAt(DEFAULT_WORLD_SEED, placement.position.x, placement.position.z)
        };
    }

    // 0.2.92 — World Instance Transform UX. The numeric inspector's
    // counterpart to dragging the gizmo: absolute X/Z/rotation TARGETS
    // for the selected placement, translated into the exact same
    // delta-shaped calls moveSelection()/rotateSelection() already make
    // — no third mutation path, per the design conversation ("Don't
    // create a second mutation path merely for mouse interaction" — the
    // same rule applies to a numeric one). `x`/`z`/`rotation` are each
    // optional; omitting one leaves that axis unchanged. Y is
    // deliberately not a parameter — see getSelectedPlacementInfo()'s own
    // `groundY` note just above.
    //
    // Returns { moved, blocked, rotated }: `moved`/`rotated` report
    // whether that half of the request actually changed anything (a
    // no-op target commits nothing, same as everywhere else in this
    // engine); `blocked` distinguishes "X/Z were requested but the
    // target position collides with something" from "nothing was
    // requested" so the UI can say which.
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

    // 0.2.91 — "Edit Source Document": reuses the EXISTING loadDocument()
    // path (Toolbar's own Load button), never a new mutation surface —
    // "editing a placed structure's bricks should still happen by
    // opening/editing its Document, not by modifying the instance."
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

    // Shared by _moveStructurePlacement() and application/tools/SelectionTool.js's
    // own drag-to-move — "reuse the existing placement-validation
    // machinery," StructurePlacementValidator, with excludePlacementId
    // set to the placement's own id so it never collides with itself
    // (its own header explains why that parameter exists at all).
    // Gracefully permissive (true) when there's no resolver or the
    // Document can't be resolved — the same posture StructurePlacementTool
    // already takes toward a preview it can't validate.
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
        this._clipboardState = result; // Add this line to update internal state
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

    // 0.2.81 — Forkable Structure Library. Forks `structure` (a
    // core/Structure.js instance, typically from the StructureRegistry)
    // into a brand-new, independent Document via ForkStructureUseCase,
    // then opens it through the SAME openDocument() path a published-
    // world fork or a Load already uses — there is no separate
    // "structure editing mode." The library Structure itself is never
    // touched; see application/ForkStructureUseCase.js's own header.
    // Returns false (and does nothing) if `structure` is falsy, so
    // callers can wire this straight to a UI action without a guard.
    forkStructure(structure) {
        if (!structure) {
            return false;
        }
        const forkedDocument = this._forkStructureUseCase.execute(structure, this._identityProvider);
        this.openDocument(forkedDocument);
        return true;
    }

    // 0.4.0 — Structure Composition & Blueprint Library. Copies
    // `structure`'s bricks into the CURRENTLY OPEN Document's own
    // (single, per CreateEmptyWorldUseCase's "one building per world" V0.1
    // simplification) building, as ONE PasteBricksCommand via
    // CopyStructureIntoDocumentUseCase — see that use case's own header
    // for why composing reuses PasteBricksCommand instead of a parallel
    // command class. Mirrors paste() immediately above it: same
    // "document + commandHistory must exist, document must have a
    // building" guard, same execute-through-CommandHistory path, so
    // undo/redo, replay, and CommandRegistry serialization all work for
    // free. Unlike paste()'s clipboard, positioning is NOT a fixed
    // per-call cascade — CopyStructureIntoDocumentUseCase places the
    // copy past whatever the document already contains, so composing
    // House + Well + Barn into one blueprint never overlaps without the
    // caller picking coordinates. Returns false (and does nothing) if
    // `structure` is falsy or there's nothing to copy into, so callers
    // can wire this straight to a UI action without a guard.
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

    // 0.2.90 — Structure Placement & World Instances. Enters
    // PLACE_STRUCTURE mode targeting `documentId` — the "put this
    // already-created structure here" entry point, wired from Toolbar's
    // existing Recent Documents list (a Place button beside Load).
    // Deliberately does NOT load/open `documentId` as the current
    // document — placing is a spatial operation on the CURRENTLY OPEN
    // document, exactly the separation ForkStructureUseCase's own
    // header draws between forking (a content operation) and placing (a
    // spatial one). Refuses to target the currently open document
    // itself — see core/StructurePlacement.js's own header on why a
    // Document referencing itself isn't rejected at the domain level,
    // but there's no legitimate reason for THIS entry point to offer it.
    // Returns false (and does nothing) if documentId is falsy or matches
    // the open document, so callers can wire this straight to a UI
    // action without a guard.
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

    // Mirrors deleteSelection()'s shape for a single StructurePlacement
    // — one RemoveStructurePlacementCommand, one undo step. Never
    // touches the referenced Document (RemoveStructurePlacementCommand's
    // own header explains why).
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

    // Add these to EditorSession.js and WorldNavigationSession.js
    // They bridge the gap between the UI/Tests (which pass a groupId)
    // and the Action Registry (which relies on the internal selected state).

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
    }

    _rebuild(populateWorldFn) {
        this._teardown();
        this._editorContext.clearSelection();
        this._previewUseCase.hide();
        if (this._structurePreviewUseCase) {
            this._structurePreviewUseCase.hide();
        }
        const eventBus = new CreateEventBusUseCase().execute();
        this._session = new RenderWorldUseCase().execute(
            this._container,
            eventBus,
            this._registry,
            this._editorContext.eventBus,
            // 0.2.92 — the router, not the brick service directly, so the
            // interactive gizmo also works for a structure-placement
            // selection. See application/GizmoGestureRouter.js.
            { gestureService: this._gizmoGestureRouter, structureResolver: this._structureResolver }
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
            commandHistory: this._commandHistory,
            // 0.2.90 — read by StructurePlacementTool only.
            structureResolver: this._structureResolver,
            structurePreviewUseCase: this._structurePreviewUseCase
        };
        this._toolManager = new ToolManager(this._toolRegistry, toolContext, this._editorContext);
        this._toolManager.start();
        this._inputDispatcher = new InputDispatcher(
            this._toolManager,
            (screenX, screenY) => this._session.pick(screenX, screenY),
            (screenX, screenY) => this._session.pickGround(screenX, screenY),
            // 0.2.91 — degrades to null when the render session predates
            // pickPlacement (an older test double), never throws.
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

    // 0.2.92 — the presentation-resolution counterpart to
    // GizmoGestureRouter: a structure-placement selection is anchored
    // via StructurePlacementGestureService#getSelectionBounds() (the
    // whole placed structure's resolved bounds), never through
    // TransformGizmoUseCase — which stays exactly the brick/group-shaped
    // use case it always was (see its own header). Same { pivot, bounds }
    // shape either way, so _refreshGizmo() above never needs to know
    // which kind of selection it just resolved.
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
