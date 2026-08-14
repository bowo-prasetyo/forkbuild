import { RenderWorldViewUseCase } from './RenderWorldViewUseCase.js';
import { Position } from '../core/Position.js';
import { SpatialSelectionState } from './spatial-state/SpatialSelectionState.js';
import { SpatialHoverState } from './spatial-state/SpatialHoverState.js';
import { SpatialCameraController } from './SpatialCameraController.js';
import { SpatialInspectionService } from './SpatialInspectionService.js';
import { SpatialInspectionState } from './spatial-state/SpatialInspectionState.js';
import { SpatialEditingService } from './SpatialEditingService.js';
import { SpatialEditingContext } from './spatial-state/SpatialEditingContext.js';
import { SpatialPlacementService } from './SpatialPlacementService.js';
import { SpatialPlacementState } from './spatial-state/SpatialPlacementState.js';
import { PlaceBrickCommand } from './commands/PlaceBrickCommand.js';
import { CommandHistory } from './CommandHistory.js';
import { PlacementValidator } from '../core/PlacementValidator.js';
import { EventBus } from '../core/events/EventBus.js';
import { TransformGizmoUseCase } from './TransformGizmoUseCase.js';
import { TransformSettings } from './TransformSettings.js';
import { License } from '../core/License.js';
import { SpatialClipboardState } from './spatial-state/SpatialClipboardState.js';
import { CreateGroupCommand } from './commands/CreateGroupCommand.js';
import { DeleteGroupCommand } from './commands/DeleteGroupCommand.js';
import { RenameGroupCommand } from './commands/RenameGroupCommand.js';
import { AddToGroupCommand } from './commands/AddToGroupCommand.js';
import { RemoveFromGroupCommand } from './commands/RemoveFromGroupCommand.js';
import { DuplicateGroupCommand } from './commands/DuplicateGroupCommand.js';
import { Document } from '../core/Document.js';

const STREAMING_RADIUS = 150;
const NAVIGATION_RADIUS = 80;
const RETRY_DELAYS = [2000, 5000, 10000];

// 0.1.46: gizmo wiring. 0.1.47: precision + modifier plumbing + gesture
// feedback; keyboard transforms route through the gesture transaction.
// 0.1.48: alignSelection/distributeSelection. 0.1.49:
// applyNumericTransform. One gateway, one command type, byte-identical
// behavior to the Editor for the same selection.
//
// 0.1.50: the World View half of the consolidated editing surface —
// selectAll()/getSelectionCount() join the session API so the shared
// EditorActionRegistry can drive World View operations exactly as it
// drives the Editor. Group and clipboard surface (0.1.42/0.1.43)
// belongs wherever this session is extended in the deployed tree; the
// action layer degrades gracefully when those methods are absent.
export class WorldNavigationSession {
	constructor({
	    registry,
	    loadPublicationDocumentUseCase,
	    worldLayoutProvider,
	    saveDocumentUseCase = null,
	    publishDocumentUseCase = null,
	    replayDocumentUseCase = null,
	    restoreHistoryStateUseCase = null,
	    identityProvider = null,
	    documentCloneService = null,
	    copySelectionUseCase = null,
	    pasteClipboardUseCase = null,
    	discoveryProvider = null // <-- Fixed: Added missing parameter
	}) {
	    this._registry = registry;
	    this._loadPublicationDocumentUseCase = loadPublicationDocumentUseCase;
	    this._worldLayoutProvider = worldLayoutProvider;
	    this._saveDocumentUseCase = saveDocumentUseCase;
	    this._publishDocumentUseCase = publishDocumentUseCase;
	    this._replayDocumentUseCase = replayDocumentUseCase;
	    this._restoreHistoryStateUseCase = restoreHistoryStateUseCase;
	    this._identityProvider = identityProvider;
	    this._documentCloneService = documentCloneService;
	    this._copySelectionUseCase = copySelectionUseCase;
	    this._pasteClipboardUseCase = pasteClipboardUseCase;
	    
	    this._container = null;
	    this._session = null;
        this._spatialCameraController = null;
        this._transformSettings = new TransformSettings();
        this._placementService = new SpatialPlacementService(registry);
        this._loadedDocuments = new Map();
        this._commandHistories = new Map();
        this._inspectionService = new SpatialInspectionService(this);
        this._editingService = new SpatialEditingService(
            this,
            this._commandHistories,
            this._registry,
            this._transformSettings
        );
        this._gizmoUseCase = new TransformGizmoUseCase(this._editingService);
        this._failedLoads = new Map();
        this._spatialSelection = SpatialSelectionState.empty();
        this._spatialHover = SpatialHoverState.empty();
        this._spatialInspection = SpatialInspectionState.empty();
        this._spatialEditingContext = SpatialEditingContext.empty();
        this._spatialPlacement = SpatialPlacementState.empty();
        this._activeDefinitionId = null;
        this._focusedDocumentId = null;
        this._eventBus = null;
	    this._discoveryProvider = discoveryProvider;

		this._pasteCount = 0;
    }

    get transformSettings() {
        return this._transformSettings;
    }

    start(container) {
        this.dispose();
        this._container = container;
        this._eventBus = new EventBus();
        this._transformSettings = new TransformSettings();
        this._editingService = new SpatialEditingService(
            this,
            this._commandHistories,
            this._registry,
            this._transformSettings
        );
        this._gizmoUseCase = new TransformGizmoUseCase(this._editingService);
        this._session = new RenderWorldViewUseCase().execute(
            container,
            this._registry,
            this._eventBus,
            { gestureService: this._editingService }
        );
        this._spatialCameraController = new SpatialCameraController(this._session);
        this._inspectionService = new SpatialInspectionService(this);
        this._placementService = new SpatialPlacementService(this._registry);
    }

    // -----------------------------------------------------------------
    // Placement Mode
    // -----------------------------------------------------------------

    setActiveDefinitionId(definitionId) {
        this._activeDefinitionId = definitionId;
        if (!definitionId) {
            this._spatialPlacement = SpatialPlacementState.empty();
            this._session.hidePreview();
        }
        this._refreshGizmo();
    }

    getActiveDefinitionId() {
        return this._activeDefinitionId;
    }

    isPlacementMode() {
        return this._activeDefinitionId !== null;
    }

    isGestureActive() {
        return this._editingService ? this._editingService.transformGizmoState.active : false;
    }

    getSpatialPlacement() {
        return this._spatialPlacement;
    }

    commitPlacement() {
        if (!this._spatialPlacement || !this._spatialPlacement.valid) {
            return false;
        }
        const placement = this._spatialPlacement;
        const targetDocumentId = placement.targetDocumentId || this._focusedDocumentId;
        const document = this._loadedDocuments.get(targetDocumentId);
        if (!document) {
            return false;
        }
        const world = document.world;
        const buildings = world.getBuildings();
        if (buildings.length === 0) {
            return false;
        }
        const buildingId = placement.targetBuildingId || buildings[0].id;
        const validator = new PlacementValidator();
        if (!validator.canPlace(world, buildingId, placement.position)) {
            return false;
        }
        const command = new PlaceBrickCommand({
            worldId: world.id,
            buildingId,
            definitionId: placement.definitionId,
            position: placement.position,
            rotation: placement.rotation
        });
        let history = this._commandHistories.get(world.id);
        if (!history) {
            history = new CommandHistory({ world });
            this._commandHistories.set(world.id, history);
        }
        history.execute(command);
        this._spatialPlacement = SpatialPlacementState.empty();
        return true;
    }

    cancelPlacement() {
        this.setActiveDefinitionId(null);
    }

    // -----------------------------------------------------------------
    // Gizmo interaction (0.1.46; modifiers + feedback in 0.1.47)
    // -----------------------------------------------------------------

    gizmoPointerDown(rawEvent) {
        if (!this._session || rawEvent.button !== 0) {
            return false;
        }
        if (this.isPlacementMode() || this._spatialSelection.isEmpty) {
            return false;
        }
        return this._session.gizmoPointerDown(
            rawEvent.clientX,
            rawEvent.clientY,
            this._spatialSelection,
            this._toModifiers(rawEvent)
        ) === true;
    }

    gizmoPointerMove(rawEvent) {
        if (!this._session) {
            return { consumed: false, hovered: false, feedback: null };
        }
        return this._session.gizmoPointerMove(
            rawEvent.clientX,
            rawEvent.clientY,
            this._spatialSelection,
            this._toModifiers(rawEvent)
        ) || { consumed: false, hovered: false, feedback: null };
    }

    gizmoPointerUp(rawEvent) {
        if (!this._session) {
            return { consumed: false, committed: false, feedback: null };
        }
        const result = this._session.gizmoPointerUp(
            rawEvent.clientX,
            rawEvent.clientY,
            this._spatialSelection,
            this._toModifiers(rawEvent)
        );
        if (result && result.consumed) {
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return result;
        }
        return { consumed: false, committed: false, feedback: null };
    }

    gizmoKeyDown(keyEvent) {
        if (!this._session) {
            return false;
        }
        const consumed = this._session.gizmoKeyDown(keyEvent, this._spatialSelection);
        if (consumed) {
            this._refreshGizmo();
        }
        return consumed;
    }

    // -----------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------

    focusDocument(documentId) {
        this._focusedDocumentId = documentId;
        const layoutPos = this._worldLayoutProvider.getPosition(documentId);
        this._spatialCameraController.focusDocument(documentId, layoutPos);
        return this.updateSpatialView();
    }

    focusSelection() {
        if (!this._spatialInspection || this._spatialInspection.isEmpty) {
            return;
        }
        const data = this._spatialInspection.data;
        if (data?.worldPosition) {
            this._spatialCameraController.focusTarget(
                {
                    x: data.worldPosition.x,
                    y: data.worldPosition.y,
                    z: data.worldPosition.z
                },
                { x: 12, y: 12, z: 12 }
            );
        }
    }

    navigateToDocument(documentId) {
        return this.focusDocument(documentId);
    }

    moveCamera(delta) {
        this._spatialCameraController.moveCamera(delta);
        return this.updateSpatialView();
    }

    updateSpatialView() {
        if (!this._session) {
            return { loaded: [], visible: [], failed: this._getFailedIds() };
        }
        const cameraState = this._spatialCameraController.getSpatialCameraState();
        const cameraPos = new Position(
            cameraState.position.x,
            cameraState.position.y,
            cameraState.position.z
        );
        const visibleIds = this._worldLayoutProvider.findVisibleDocuments(
            cameraPos,
            STREAMING_RADIUS
        );
        const currentlyLoaded = new Set(this._loadedDocuments.keys());
		const toUnload = Array.from(currentlyLoaded).filter((id) => {
		    if (visibleIds.includes(id)) return false;
		    // Pin dirty documents against streaming unload
		    if (this.isDocumentDirty(id)) return false;
		    return true;
		});
        const now = Date.now();
        const toLoad = visibleIds.filter((id) => {
            if (currentlyLoaded.has(id)) {
                return false;
            }
            const failure = this._failedLoads.get(id);
            if (!failure) {
                return true;
            }
            if (failure.attempts > RETRY_DELAYS.length) {
                return false;
            }
            return now - failure.lastAttemptAt >= RETRY_DELAYS[failure.attempts - 1];
        });
        for (const id of toUnload) {
            this._unloadWorld(id);
        }
        for (const id of toLoad) {
            try {
                this._loadWorld(id);
                this._failedLoads.delete(id);
            } catch (err) {
                console.warn(`WorldNavigationSession: failed to load world ${id} — ${err.message}`);
                const existing = this._failedLoads.get(id);
                this._failedLoads.set(id, {
                    attempts: existing ? existing.attempts + 1 : 1,
                    lastAttemptAt: now
                });
            }
        }
        this._refreshGizmo();
        return {
            loaded: Array.from(this._loadedDocuments.keys()),
            visible: visibleIds,
            failed: this._getFailedIds()
        };
    }

    // -----------------------------------------------------------------
    // Interaction
    // -----------------------------------------------------------------
	
	pick(screenX, screenY, { toggle = false, additive = false } = {}) {
	    if (!this._session) {
	        return null;
	    }
	    const brickHit = this._session.pick(screenX, screenY);
	    if (brickHit) {
	        let nextSelection;
	        if (additive) {
	            nextSelection = this._spatialSelection.addBrick(brickHit);
	        } else if (toggle) {
	            nextSelection = this._spatialSelection.toggleBrick(brickHit);
	        } else {
	            nextSelection = SpatialSelectionState.brick(brickHit);
	        }
	        this._setSpatialSelection(nextSelection);
			this._session.selectBricks(nextSelection.brickIds, nextSelection.brickId);
            this._session.clearHover();
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return this._spatialSelection;
        }
        const groundHit = this._session.pickGround(screenX, screenY);
        if (groundHit) {
            this._setSpatialSelection(SpatialSelectionState.ground(groundHit.position));
            this._session.clearSelection();
            this._session.clearHover();
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return this._spatialSelection;
        }
        this._setSpatialSelection(SpatialSelectionState.empty());
        this._session.clearSelection();
        this._session.clearHover();
        this._refreshInspection();
        this._refreshEditingContext();
        this._refreshGizmo();
        return null;
    }

    hover(screenX, screenY) {
        if (!this._session) {
            this._setSpatialHover(SpatialHoverState.empty());
            return null;
        }
        const brickHit = this._session.pick(screenX, screenY);
        if (brickHit) {
            const hover = SpatialHoverState.brick(brickHit);
            this._setSpatialHover(hover);
            this._session.hoverBrick(brickHit.brickId);
            this._updatePlacementPreview(brickHit);
            return hover;
        }
        const groundHit = this._session.pickGround(screenX, screenY);
        if (groundHit) {
            const hover = SpatialHoverState.ground(groundHit.position);
            this._setSpatialHover(hover);
            this._session.clearHover();
            this._updatePlacementPreview(groundHit);
            return hover;
        }
        this._setSpatialHover(SpatialHoverState.empty());
        this._session.clearHover();
        this._clearPlacementPreview();
        return null;
    }

    clearSelection() {
        this._setSpatialSelection(SpatialSelectionState.empty());
        this._spatialInspection = SpatialInspectionState.empty();
        this._spatialEditingContext = SpatialEditingContext.empty();
        if (this._session) {
            this._session.clearSelection();
        }
        this._refreshGizmo();
        return true;
    }

    // 0.1.50 — select every brick in the document the current selection
    // belongs to (or the focused document when nothing is selected).
    // Multi-document select-all is deliberately undefined: a spatial
    // selection references exactly one document.
    selectAll() {
        const documentId = (!this._spatialSelection.isEmpty && this._spatialSelection.documentId)
            || this._focusedDocumentId;
        const document = documentId ? this._loadedDocuments.get(documentId) : null;
        if (!document || !this._session) {
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
        this._setSpatialSelection(SpatialSelectionState.bricks({ documentId, items }));
        this._session.selectBricks(items.map((item) => item.brickId), items[items.length - 1].brickId);
        this._refreshInspection();
        this._refreshEditingContext();
        this._refreshGizmo();
        return true;
    }

    getSelectionCount() {
        return this._spatialSelection.isEmpty ? 0 : this._spatialSelection.items.length;
    }

    moveSelection(delta, modifiers = null) {
	    if (this._historyPreview && this._historyPreview.active) return false;
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const ctx = this._spatialEditingContext;
        if (!ctx.can('move')) {
            return false;
        }
        const success = this._editingService.moveSelection(this._spatialSelection, delta, { modifiers });
        if (success) {
            this._refreshInspection();
            this._refreshGizmo();
        }
        return success;
    }

    deleteSelection() {
	    if (this._historyPreview && this._historyPreview.active) return false;
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const ctx = this._spatialEditingContext;
        if (!ctx.can('delete')) {
            return false;
        }
        const success = this._editingService.deleteSelection(this._spatialSelection);
        if (success) {
            this.clearSelection();
        }
        return success;
    }

    rotateSelection(deltaRotation, modifiers = null) {
	    if (this._historyPreview && this._historyPreview.active) return false;
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const ctx = this._spatialEditingContext;
        if (!ctx.can('rotate')) {
            return false;
        }
        const success = this._editingService.rotateSelection(this._spatialSelection, deltaRotation, { modifiers });
        if (success) {
            this._refreshInspection();
            this._refreshGizmo();
        }
        return success;
    }

    alignSelection(mode) {
	    if (this._historyPreview && this._historyPreview.active) return false;
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const success = this._editingService.alignSelection(this._spatialSelection, mode);
        if (success) {
            this._refreshInspection();
            this._refreshGizmo();
        }
        return success;
    }

    distributeSelection(axis) {
	    if (this._historyPreview && this._historyPreview.active) return false;
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const success = this._editingService.distributeSelection(this._spatialSelection, axis);
        if (success) {
            this._refreshInspection();
            this._refreshGizmo();
        }
        return success;
    }

    applyNumericTransform(intent, options = {}) {
	    if (this._historyPreview && this._historyPreview.active) return false;
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const success = this._editingService.applyNumericTransform(this._spatialSelection, intent, options);
        if (success) {
            this._refreshInspection();
            this._refreshGizmo();
        }
        return success;
    }

    undo() {
	    if (this._historyPreview && this._historyPreview.active) return false;
        const history = this._getActiveCommandHistory();
        if (history && history.canUndo()) {
            history.undo();
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return true;
        }
        return false;
    }

    redo() {
	    if (this._historyPreview && this._historyPreview.active) return false;
        const history = this._getActiveCommandHistory();
        if (history && history.canRedo()) {
            history.redo();
            this._refreshInspection();
            this._refreshEditingContext();
            this._refreshGizmo();
            return true;
        }
        return false;
    }

    getSpatialSelection() {
        return this._spatialSelection;
    }

    getSpatialHover() {
        return this._spatialHover;
    }

    getSpatialInspection() {
        return this._spatialInspection;
    }

    getSpatialEditingContext() {
        return this._spatialEditingContext;
    }

    getSpatialState() {
        if (!this._session) {
            return {
                loaded: [],
                visible: [],
                nearby: [],
                failed: [],
                cameraPosition: null
            };
        }
        const cameraState = this._spatialCameraController.getSpatialCameraState();
        const cameraPos = new Position(
            cameraState.position.x,
            cameraState.position.y,
            cameraState.position.z
        );
        const visible = this._worldLayoutProvider.findVisibleDocuments(
            cameraPos,
            STREAMING_RADIUS
        );
        const nearby = this._worldLayoutProvider.findVisibleDocuments(
            cameraPos,
            NAVIGATION_RADIUS
        );
        return {
            loaded: Array.from(this._loadedDocuments.keys()),
            visible,
            nearby,
            failed: this._getFailedIds(),
            cameraPosition: cameraPos
        };
    }

    getLoadedDocuments() {
        return Array.from(this._loadedDocuments.values());
    }

    getDocument(documentId) {
        return this._loadedDocuments.get(documentId) || null;
    }

    getDocumentPosition(documentId) {
        return this._worldLayoutProvider.getPosition(documentId);
    }

	forkDocument(documentId) {
	    const doc = this.getDocument(documentId || this._focusedDocumentId);
	    if (!doc) throw new Error('no loaded document');
	    const user = this._identityProvider ? this._identityProvider.currentUser() : null;
	    const fork = this._documentCloneService.execute(doc, {
	        title: `Fork of ${doc.metadata.title || 'Untitled'}`,
	        author: user ? user.username : null,
	        parentDocumentId: doc.world.id
	    });
	    this._loadedDocuments.set(fork.world.id, fork);
	    const history = new CommandHistory({ world: fork.world });
	    history.markUnsaved();
	    this._commandHistories.set(fork.world.id, history);
	    if (this._session) this._session.addWorld(fork.world, fork.world.id, this._worldLayoutProvider.getPosition(fork.world.id));
	    
	    this._focusedDocumentId = fork.world.id; // Add this line to focus on the new fork
	    
	    return fork.world.id;
	}	

    // -----------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------

    _getActiveCommandHistory() {
        if (this._spatialSelection && !this._spatialSelection.isEmpty) {
            const document = this._loadedDocuments.get(this._spatialSelection.documentId);
            if (document) {
                return this._commandHistories.get(document.world.id) || null;
            }
        }
        if (this._focusedDocumentId) {
            const document = this._loadedDocuments.get(this._focusedDocumentId);
            if (document) {
                return this._commandHistories.get(document.world.id) || null;
            }
        }
        return null;
    }

	_loadWorld(documentId) {
	    const document = this._loadPublicationDocumentUseCase.execute(documentId, this._eventBus);
	    this._loadedDocuments.set(documentId, document);
	    if (!this._focusedDocumentId) {
	        this._focusedDocumentId = documentId; // Set focus on first load
	    }
        const layoutPos = this._worldLayoutProvider.getPosition(documentId);
        this._session.addWorld(document.world, documentId, layoutPos);
        if (!this._commandHistories.has(document.world.id)) {
            this._commandHistories.set(document.world.id, new CommandHistory({ world: document.world }));
        }
    }

    _unloadWorld(documentId) {
        if (this._focusedDocumentId === documentId) {
            this._focusedDocumentId = null;
        }
        if (this._spatialSelection.documentId === documentId) {
            this.clearSelection();
        }
        if (this._spatialHover.documentId === documentId) {
            this._setSpatialHover(SpatialHoverState.empty());
            if (this._session) {
                this._session.clearHover();
            }
        }
        const document = this._loadedDocuments.get(documentId);
        if (document) {
            this._commandHistories.delete(document.world.id);
        }
        if (document && this._session) {
            this._session.removeWorld(document.world, documentId);
        }
        this._loadedDocuments.delete(documentId);
        this._refreshGizmo();
    }

	_setSpatialSelection(selection) {
	    this._spatialSelection = selection;
	    this._refreshEditingContext();
	    this._refreshInspection();
	}
	
	_setSpatialHover(hover) {
        this._spatialHover = hover;
    }

    _refreshInspection() {
        if (!this._inspectionService) {
            this._spatialInspection = SpatialInspectionState.empty();
            return;
        }
        this._spatialInspection = this._inspectionService.inspect(this._spatialSelection);
    }

    _refreshEditingContext() {
        if (!this._editingService) {
            this._spatialEditingContext = SpatialEditingContext.empty();
            return;
        }
        this._spatialEditingContext = this._editingService.getEditingContext(this._spatialSelection);
    }

    _refreshGizmo() {
        if (!this._session || !this._editingService || !this._gizmoUseCase) {
            return;
        }
        if (this._editingService.transformGizmoState.active) {
            return;
        }
        if (this.isPlacementMode()) {
            this._hideGizmo();
            return;
        }
        const presentation = this._gizmoUseCase.resolvePresentation(this._spatialSelection);
        if (!presentation) {
            this._hideGizmo();
            return;
        }
        const offset = this._worldLayoutProvider.getPosition(this._spatialSelection.documentId);
        const worldPivot = {
            x: presentation.pivot.x + offset.x,
            y: presentation.pivot.y + offset.y,
            z: presentation.pivot.z + offset.z
        };
        const worldBounds = {
            min: {
                x: presentation.bounds.min.x + offset.x,
                y: presentation.bounds.min.y + offset.y,
                z: presentation.bounds.min.z + offset.z
            },
            max: {
                x: presentation.bounds.max.x + offset.x,
                y: presentation.bounds.max.y + offset.y,
                z: presentation.bounds.max.z + offset.z
            },
            center: worldPivot,
            size: presentation.bounds.size
        };
        this._showGizmo(worldPivot, worldBounds);
    }

    _hideGizmo() {
        if (typeof this._session?.hideGizmo === 'function') {
            this._session.hideGizmo();
        }
    }

    _showGizmo(pivot, bounds) {
        if (typeof this._session?.showGizmo === 'function') {
            this._session.showGizmo(pivot, bounds);
        }
    }

    _updatePlacementPreview(hitResult) {
        if (!this._activeDefinitionId || !this._session) {
            return;
        }
        let existingBrick = null;
        let layoutOffset = null;
        let targetDocumentId = this._focusedDocumentId;
        if (hitResult.type === 'brick') {
            targetDocumentId = hitResult.documentId;
            const document = this._loadedDocuments.get(targetDocumentId);
            if (document) {
                const building = document.world.getBuilding(hitResult.buildingId);
                existingBrick = building?.findBrick(hitResult.brickId);
                layoutOffset = this._worldLayoutProvider.getPosition(targetDocumentId);
            }
        } else if (hitResult.type === 'ground') {
            if (targetDocumentId) {
                layoutOffset = this._worldLayoutProvider.getPosition(targetDocumentId);
            }
        }
        if (!targetDocumentId || !layoutOffset) {
            this._clearPlacementPreview();
            return;
        }
        const placement = this._placementService.calculateFromHit(
            hitResult,
            this._activeDefinitionId,
            existingBrick,
            layoutOffset,
            { gridSnapEnabled: true, gridSnapSize: 1 }
        );
        this._spatialPlacement = placement;
        if (placement.valid) {
            const worldPos = {
                x: placement.position.x + layoutOffset.x,
                y: placement.position.y + layoutOffset.y,
                z: placement.position.z + layoutOffset.z
            };
            this._session.showPreview(placement.definitionId, worldPos, placement.rotation);
        } else {
            this._session.hidePreview();
        }
    }

    _clearPlacementPreview() {
        this._spatialPlacement = SpatialPlacementState.empty();
        if (this._session) {
            this._session.hidePreview();
        }
    }

    _toModifiers(rawEvent) {
        return {
            ctrl: rawEvent.ctrlKey || false,
            shift: rawEvent.shiftKey || false,
            alt: rawEvent.altKey || false,
            meta: rawEvent.metaKey || false
        };
    }

    _getFailedIds() {
        return Array.from(this._failedLoads.keys());
    }

	// --- Parity Methods for Tests ---
	getActiveDocumentId() { return this._focusedDocumentId; }
	isDocumentDirty(documentId) {
	    const doc = this.getDocument(documentId || this._focusedDocumentId);
	    if (!doc) return false;
	    const history = this._commandHistories.get(doc.world.id);
	    return history ? history.isDirty() : false;
	}
	saveDocument(documentId) {
	    const doc = this.getDocument(documentId || this._focusedDocumentId);
	    if (!doc) throw new Error('no loaded document');
	    this._saveDocumentUseCase.execute({ document: doc, state: { dirty: true }, markSaved: () => {} });
	    const history = this._commandHistories.get(doc.world.id);
	    if (history) history.markSaved();
	}
	publishDocument(documentId) {
	    const doc = this.getDocument(documentId || this._focusedDocumentId);
	    if (!doc) throw new Error('no loaded document');
	    if (this.isDocumentDirty(doc.world.id)) this.saveDocument(doc.world.id);
	    return this._publishDocumentUseCase.execute({ document: doc });
	}
	getTimeline(documentId) {
	    const doc = this.getDocument(documentId || this._focusedDocumentId);
	    const history = doc ? this._commandHistories.get(doc.world.id) : null;
	    return history ? history.getTimeline() : [];
	}		
	
	restoreHistoryAt(cursor, documentId) {
	    if (!this._replayDocumentUseCase) {
	        throw new Error('no restore configured'); // <--- ADD GUARD
	    }
	    const docId = documentId || this._focusedDocumentId;
	    const doc = this.getDocument(docId);
	    if (!doc) throw new Error('no loaded document');
	    
	    const history = this._commandHistories.get(doc.world.id);
	    if (!history) throw new Error('no history');
	
	    // 1. Rebuild the world and document
	    const restoredWorld = this._replayDocumentUseCase.execute(history, { endCursor: cursor });
	    const restoredDocument = new Document({
	        world: restoredWorld,
	        metadata: doc.metadata
	    });
	    
	    // 2. Rebuild the history
	    const restoredHistory = new CommandHistory({ world: restoredWorld });
	    restoredHistory.markUnsaved();
	
	    // 3. Update session state
	    this._loadedDocuments.set(docId, restoredDocument);
	    this._commandHistories.set(restoredWorld.id, restoredHistory);
	
	    // 4. Retire the old history
	    if (!this._retiredHistories) this._retiredHistories = new Map();
	    if (!this._retiredHistories.has(doc.world.id)) this._retiredHistories.set(doc.world.id, []);
	    this._retiredHistories.get(doc.world.id).push(history);
	
	    // 5. Update Renderer
	    if (this._session) {
	        if (this._historyPreview && this._historyPreview.active) {
	            this._session.removeWorld(this._historyPreview.world, `replay:${docId}`);
	            this._historyPreview = null;
	        } else {
	            this._session.removeWorld(doc.world, docId);
	        }
	        this._session.addWorld(restoredWorld, docId, this._worldLayoutProvider.getPosition(docId));
	    }
	
	    this.clearSelection();
	}
	
	copySelection() {
	    if (this._historyPreview && this._historyPreview.active) return SpatialClipboardState.empty(); // <-- ADD THIS
	    if (!this._copySelectionUseCase || !this._focusedDocumentId) return SpatialClipboardState.empty();
	    
	    // FIX: Prefer the document ID from the selection, fall back to focused
	    const docId = (this._spatialSelection && this._spatialSelection.documentId) || this._focusedDocumentId;
	    if (!docId) return SpatialClipboardState.empty();
	    
	    const doc = this.getDocument(docId);
	    if (!doc) return SpatialClipboardState.empty();
	    
	    this._pasteCount = 0; // Reset cascade count on new copy
	    this._clipboardState = this._copySelectionUseCase.execute(this._spatialSelection, doc);
	    return this._clipboardState;
	}
	
	// 3. Fix pasteClipboard to cascade offsets
	pasteClipboard() {
	    if (this._historyPreview && this._historyPreview.active) return false; // ADD THIS LINE
	    if (!this._pasteClipboardUseCase || !this._clipboardState || this._clipboardState.isEmpty) return false;
	    const doc = this.getDocument(this._focusedDocumentId);
	    if (!doc) return false;
	    const buildingId = doc.world.getBuildings()[0]?.id;
	    if (!buildingId) return false;
	    if (!this._pasteCount) this._pasteCount = 0;
	    this._pasteCount++;
	    const offset = { x: 2 * this._pasteCount, y: 0, z: 2 * this._pasteCount };
	    const command = this._pasteClipboardUseCase.execute(this._clipboardState, {
	        worldId: doc.world.id, buildingId, position: offset
	    });
	    if (command) {
	        this._commandHistories.get(doc.world.id).execute(command);
	        
	        // Automatically select the newly pasted bricks
	        if (command.executedBrickIds && command.executedBrickIds.length > 0) {
	            const items = command.executedBrickIds.map(brickId => ({ type: 'brick', buildingId, brickId }));
	            this._setSpatialSelection(SpatialSelectionState.bricks({
	                documentId: doc.world.id,
	                items
	            }));
	        }
	        return true;
	    }
	    return false;
	}
	
	cloneDocument(documentId) {
	    const doc = this.getDocument(documentId || this._focusedDocumentId);
	    if (!doc) throw new Error('no loaded document');
	    const clone = this._documentCloneService.execute(doc);
	    this._loadedDocuments.set(clone.world.id, clone);
	    
	    const history = new CommandHistory({ world: clone.world });
	    history.markUnsaved(); // <--- ADD THIS LINE (matches forkDocument behavior)
	    
	    this._commandHistories.set(clone.world.id, history);
	    if (this._session) this._session.addWorld(clone.world, clone.world.id, this._worldLayoutProvider.getPosition(clone.world.id));
	    return clone.world.id;
	}
	
	forkDocument(documentId) {
	    const doc = this.getDocument(documentId || this._focusedDocumentId);
	    if (!doc) throw new Error('no loaded document');
	    const user = this._identityProvider ? this._identityProvider.currentUser() : null;
	    const fork = this._documentCloneService.execute(doc, {
	        title: `Fork of ${doc.metadata.title || 'Untitled'}`,
	        author: user ? user.username : null,
	        parentDocumentId: doc.world.id
	    });
	    this._loadedDocuments.set(fork.world.id, fork);
	    const history = new CommandHistory({ world: fork.world });
	    history.markUnsaved();
	    this._commandHistories.set(fork.world.id, history);
	    if (this._session) this._session.addWorld(fork.world, fork.world.id, this._worldLayoutProvider.getPosition(fork.world.id));
	    this._focusedDocumentId = fork.world.id;
	    return fork.world.id;
	}
	getRetiredHistories(documentId) {
	    return this._retiredHistories ? (this._retiredHistories.get(documentId || this._focusedDocumentId) || []) : [];
	}
	// 1. Fix restoreHistoryAt (Update the fake documentManager to include load/state)
	getGroups() {
	    const doc = this.getDocument(this._focusedDocumentId);
	    if (!doc) return [];
	    const world = doc.world || doc;
	    const groups = typeof world.getGroups === 'function' ? world.getGroups() : (world.groups || []);
	    return groups.map(g => ({ id: g.id, name: g.name, memberCount: g.memberCount || (g.brickIds ? g.brickIds.length : 0) }));
	}
	createGroupFromSelection(name) {
	    const doc = this.getDocument(this._focusedDocumentId);
	    if (!doc || this._spatialSelection.isEmpty) return null;
	    const cmd = new CreateGroupCommand({ worldId: doc.world.id, brickIds: this._spatialSelection.brickIds, name });
	    this._commandHistories.get(doc.world.id).execute(cmd);
	    return cmd.executedGroupId;
	}
	selectGroup(groupId) {
	    const doc = this.getDocument(this._focusedDocumentId);
	    if (!doc) return false;
	    const group = doc.world.getGroup(groupId);
	    if (!group) return false;
	    const items = [];
	    for (const brickId of group.brickIds) {
	        for (const building of doc.world.getBuildings()) {
	            if (building.findBrick(brickId)) {
	                items.push({ type: 'brick', buildingId: building.id, brickId });
	                break;
	            }
	        }
	    }
	    this._setSpatialSelection(SpatialSelectionState.bricks({ documentId: doc.world.id, items }));
	    return true;
	}
	addSelectionToSelectedGroup(groupId) {
	    const doc = this.getDocument(this._focusedDocumentId);
	    if (!doc || this._spatialSelection.isEmpty) return false;
	    const cmd = new AddToGroupCommand({ worldId: doc.world.id, groupId, brickIds: this._spatialSelection.brickIds });
	    this._commandHistories.get(doc.world.id).execute(cmd);
	    return true;
	}
	removeSelectionFromSelectedGroup(groupId) {
	    const doc = this.getDocument(this._focusedDocumentId);
	    if (!doc || this._spatialSelection.isEmpty) return false;
	    const cmd = new RemoveFromGroupCommand({ worldId: doc.world.id, groupId, brickIds: this._spatialSelection.brickIds });
	    this._commandHistories.get(doc.world.id).execute(cmd);
	    return true;
	}
	renameGroup(groupId, name) {
	    const doc = this.getDocument(this._focusedDocumentId);
	    if (!doc) return false;
	    this._commandHistories.get(doc.world.id).execute(new RenameGroupCommand({ worldId: doc.world.id, groupId, name }));
	    return true;
	}
	duplicateGroup(groupId) {
	    const doc = this.getDocument(this._focusedDocumentId);
	    if (!doc) return null;
	    const cmd = new DuplicateGroupCommand({ worldId: doc.world.id, groupId });
	    this._commandHistories.get(doc.world.id).execute(cmd);
	    return cmd.executedGroupId;
	}
	deleteGroup(groupId) {
	    const doc = this.getDocument(this._focusedDocumentId);
	    if (!doc) return false;
	    this._commandHistories.get(doc.world.id).execute(new DeleteGroupCommand({ worldId: doc.world.id, groupId }));
	    return true;
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
	
	// --- History Preview & Restore (0.1.39 / 0.1.41) ---
	beginHistoryPreview() {
	    this._historyPreview = { active: true, cursor: null, world: null };
	    return true;
	}
	
	previewHistoryAt(cursor) {
	    if (!this._historyPreview || !this._historyPreview.active) {
	        throw new Error('no active history preview');
	    }
	    const history = this._getActiveCommandHistory();
	    if (!history) throw new Error('no history');
	    
	    const replayWorld = this._replayDocumentUseCase.execute(history, { endCursor: cursor });
	    this._historyPreview.cursor = cursor;
	    this._historyPreview.world = replayWorld;
	
	    // Renderer integration: hide live world, show replay world
	    const docId = this._focusedDocumentId;
	    if (this._session && docId) {
	        const doc = this.getDocument(docId);
	        if (doc) {
	            this._session.removeWorld(doc.world, docId);
	            this._session.addWorld(replayWorld, `replay:${docId}`, this._worldLayoutProvider.getPosition(docId));
	        }
	    }
	    return true;
	}
	
	cancelHistoryPreview() {
	    if (!this._historyPreview || !this._historyPreview.active) return false;
	    
	    const docId = this._focusedDocumentId;
	    if (this._session && docId) {
	        const doc = this.getDocument(docId);
	        if (doc) {
	            this._session.removeWorld(this._historyPreview.world, `replay:${docId}`);
	            this._session.addWorld(doc.world, docId, this._worldLayoutProvider.getPosition(docId));
	        }
	    }
	    this._historyPreview = null;
	    return true;
	}
	
	getHistoryPreview() {
	    if (!this._historyPreview || !this._historyPreview.active) return null;
	    return { cursor: this._historyPreview.cursor, world: this._historyPreview.world };
	}
	getRetiredHistories(documentId) {
	    return this._retiredHistories ? (this._retiredHistories.get(documentId || this._focusedDocumentId) || []) : [];
	}
	
	// Add getDocumentManager alias for WorldViewPersistence tests
	getDocumentManager(documentId) {
	    return this.getDocument(documentId);
	}
	
    dispose() {
        if (this._session) {
            this._session.dispose();
            this._session = null;
        }
        this._container = null;
        this._spatialCameraController = null;
        this._inspectionService = null;
        this._editingService = null;
        this._gizmoUseCase = null;
        this._placementService = null;
        this._commandHistories.clear();
        this._loadedDocuments.clear();
        this._failedLoads.clear();
        this._spatialSelection = SpatialSelectionState.empty();
        this._spatialHover = SpatialHoverState.empty();
        this._spatialInspection = SpatialInspectionState.empty();
        this._spatialEditingContext = SpatialEditingContext.empty();
        this._spatialPlacement = SpatialPlacementState.empty();
        this._activeDefinitionId = null;
        this._focusedDocumentId = null;
        this._eventBus = null;
    }
}
