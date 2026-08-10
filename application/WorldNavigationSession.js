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
import { DocumentManager } from './DocumentManager.js';
import { PlacementValidator } from '../core/PlacementValidator.js';
import { EventBus } from '../core/events/EventBus.js';

const STREAMING_RADIUS = 150;
const NAVIGATION_RADIUS = 80;
const RETRY_DELAYS = [2000, 5000, 10000];

export class WorldNavigationSession {
    constructor({
        registry,
        loadPublicationDocumentUseCase,
        worldLayoutProvider,
        saveDocumentUseCase = null,
        publishDocumentUseCase = null
    }) {
        this._registry = registry;
        this._loadPublicationDocumentUseCase = loadPublicationDocumentUseCase;
        this._worldLayoutProvider = worldLayoutProvider;
        this._saveDocumentUseCase = saveDocumentUseCase;
        this._publishDocumentUseCase = publishDocumentUseCase;
        this._session = null;
        this._spatialCameraController = null;
        this._inspectionService = null;
        this._editingService = null;
        this._placementService = new SpatialPlacementService(registry);
        this._loadedDocuments = new Map();
        this._commandHistories = new Map();
        this._documentManagers = new Map();
        this._failedLoads = new Map();
        this._spatialSelection = SpatialSelectionState.empty();
        this._spatialHover = SpatialHoverState.empty();
        this._spatialInspection = SpatialInspectionState.empty();
        this._spatialEditingContext = SpatialEditingContext.empty();
        this._spatialPlacement = SpatialPlacementState.empty();
        this._activeDefinitionId = null;
        this._focusedDocumentId = null;
        this._eventBus = null;
    }

    start(container) {
        this.dispose();
        this._eventBus = new EventBus();
        this._session = new RenderWorldViewUseCase().execute(
            container,
            this._registry,
            this._eventBus
        );
        this._spatialCameraController = new SpatialCameraController(this._session);
        this._inspectionService = new SpatialInspectionService(this);
        this._editingService = new SpatialEditingService(this, this._commandHistories, this._registry);
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
    }

    getActiveDefinitionId() {
        return this._activeDefinitionId;
    }

    isPlacementMode() {
        return this._activeDefinitionId !== null;
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
        this._ensureCommandHistory(world).execute(command);
        this._spatialPlacement = SpatialPlacementState.empty();
        return true;
    }

    cancelPlacement() {
        this.setActiveDefinitionId(null);
    }

    // -----------------------------------------------------------------
    // Navigation
    // -----------------------------------------------------------------

    // Client-side spatial navigation: move camera to the world's layout
    // coordinate and stream it in. No page reload.
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

    // Reconcile the set of loaded worlds with whatever the layout
    // provider says should be visible from the current camera position.
    // Returns { loaded: string[], visible: string[] }.
    //
    // As of 0.1.39, DIRTY DOCUMENTS ARE PINNED: a document with unsaved
    // edits is never stream-unloaded, even when it leaves the streaming
    // radius — silently discarding edits on camera movement would be
    // data loss. Saving unpins it.
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
        const toUnload = Array.from(currentlyLoaded).filter(
            (id) => !visibleIds.includes(id) && !this.isDocumentDirty(id)
        );
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
        return {
            loaded: Array.from(this._loadedDocuments.keys()),
            visible: visibleIds,
            failed: this._getFailedIds()
        };
    }

    // -----------------------------------------------------------------
    // Persistence & Publication (0.1.39)
    // -----------------------------------------------------------------

    getDocumentManager(documentId) {
        const entry = this._documentManagers.get(documentId);
        return entry ? entry.manager : null;
    }

    isDocumentDirty(documentId) {
        const entry = this._documentManagers.get(documentId);
        return entry ? entry.manager.state.dirty : false;
    }

    getDirtyDocumentIds() {
        return Array.from(this._documentManagers.entries())
            .filter(([, entry]) => entry.manager.state.dirty)
            .map(([id]) => id);
    }

    // The document Save/Publish act on: the selection's document when
    // something is selected, otherwise the focused document, otherwise
    // the sole loaded document (unambiguous). Null when nothing applies.
    getActiveDocumentId() {
        const selectedId = this._spatialSelection ? this._spatialSelection.documentId : null;
        if (selectedId && this._loadedDocuments.has(selectedId)) {
            return selectedId;
        }
        if (this._focusedDocumentId && this._loadedDocuments.has(this._focusedDocumentId)) {
            return this._focusedDocumentId;
        }
        if (this._loadedDocuments.size === 1) {
            return this._loadedDocuments.keys().next().value;
        }
        return null;
    }

    // Persists the canonical Document through SaveDocumentUseCase —
    // selection, hover, gizmo, editing-context, and command-history state
    // are Spatial/Editor State and are never part of what gets saved.
    saveDocument(documentId = null) {
        if (!this._saveDocumentUseCase) {
            throw new Error('WorldNavigationSession: no persistence configured');
        }
        const id = documentId || this.getActiveDocumentId();
        const entry = id ? this._documentManagers.get(id) : null;
        if (!entry) {
            throw new Error(`WorldNavigationSession: no loaded document to save (${id || 'no active document'})`);
        }
        this._saveDocumentUseCase.execute(entry.manager);
        return id;
    }

    // Publishes the canonical current Document through
    // PublishDocumentUseCase. Rule: never publish a stale saved version —
    // if the live document has unsaved edits, save first, so the
    // Publication references exactly what the user is looking at.
    publishDocument(documentId = null) {
        if (!this._publishDocumentUseCase) {
            throw new Error('WorldNavigationSession: no publisher configured');
        }
        const id = documentId || this.getActiveDocumentId();
        const entry = id ? this._documentManagers.get(id) : null;
        if (!entry) {
            throw new Error(`WorldNavigationSession: no loaded document to publish (${id || 'no active document'})`);
        }
        if (entry.manager.state.dirty) {
            this.saveDocument(id);
        }
        return this._publishDocumentUseCase.execute(entry.manager);
    }

    // -----------------------------------------------------------------
    // Interaction
    // -----------------------------------------------------------------

    pick(screenX, screenY, { toggle = false } = {}) {
        if (!this._session) {
            return null;
        }
        const brickHit = this._session.pick(screenX, screenY);
        if (brickHit) {
            const nextSelection = toggle
                ? this._spatialSelection.toggleBrick(brickHit)
                : SpatialSelectionState.brick(brickHit);
            this._setSpatialSelection(nextSelection);
            this._session.selectBricks(nextSelection.brickIds, nextSelection.brickId);
            this._session.clearHover();
            this._refreshInspection();
            this._refreshEditingContext();
            return this._spatialSelection;
        }
        const groundHit = this._session.pickGround(screenX, screenY);
        if (groundHit) {
            this._setSpatialSelection(SpatialSelectionState.ground(groundHit.position));
            this._session.clearSelection();
            this._session.clearHover();
            this._refreshInspection();
            this._refreshEditingContext();
            return this._spatialSelection;
        }
        this._setSpatialSelection(SpatialSelectionState.empty());
        this._session.clearSelection();
        this._session.clearHover();
        this._refreshInspection();
        this._refreshEditingContext();
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
    }

    moveSelection(delta) {
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const ctx = this._spatialEditingContext;
        if (!ctx.can('move')) {
            return false;
        }
        const success = this._editingService.moveSelection(this._spatialSelection, delta);
        if (success) {
            this._refreshInspection();
        }
        return success;
    }

    deleteSelection() {
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

    rotateSelection(deltaRotation) {
        if (!this._spatialEditingContext || this._spatialEditingContext.isEmpty) {
            return false;
        }
        const ctx = this._spatialEditingContext;
        if (!ctx.can('rotate')) {
            return false;
        }
        const success = this._editingService.rotateSelection(this._spatialSelection, deltaRotation);
        if (success) {
            this._refreshInspection();
        }
        return success;
    }

    undo() {
        const history = this._getActiveCommandHistory();
        if (history && history.canUndo()) {
            history.undo();
            this._refreshInspection();
            this._refreshEditingContext();
            return true;
        }
        return false;
    }

    redo() {
        const history = this._getActiveCommandHistory();
        if (history && history.canRedo()) {
            history.redo();
            this._refreshInspection();
            this._refreshEditingContext();
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

    // -----------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------

    _getActiveCommandHistory() {
        // Prefer the selected brick's world, then the focused world.
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

    _ensureCommandHistory(world) {
        let history = this._commandHistories.get(world.id);
        if (!history) {
            history = new CommandHistory({ world });
            this._commandHistories.set(world.id, history);
        }
        return history;
    }

    _loadWorld(documentId) {
        const document = this._loadPublicationDocumentUseCase.execute(documentId, this._eventBus);
        this._loadedDocuments.set(documentId, document);
        const layoutPos = this._worldLayoutProvider.getPosition(documentId);
        this._session.addWorld(document.world, documentId, layoutPos);
        // Ensure a CommandHistory exists for every loaded world so that
        // move/rotate/delete work even before the first placement.
        const history = this._ensureCommandHistory(document.world);
        // Per-document lifecycle + dirty tracking (0.1.39). One
        // DocumentManager per loaded document — World View keeps several
        // documents alive at once, and each one's dirty state must
        // survive the camera focusing elsewhere. load() starts clean;
        // trackCommandHistory() keeps dirty in sync with the history's
        // save point from here on.
        if (!this._documentManagers.has(documentId)) {
            const manager = new DocumentManager();
            manager.load(document, documentId);
            const untrack = manager.trackCommandHistory(history);
            this._documentManagers.set(documentId, { manager, untrack });
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
        const managerEntry = this._documentManagers.get(documentId);
        if (managerEntry) {
            managerEntry.untrack();
            this._documentManagers.delete(documentId);
        }
        if (document && this._session) {
            this._session.removeWorld(document.world, documentId);
        }
        this._loadedDocuments.delete(documentId);
    }

    _setSpatialSelection(selection) {
        this._spatialSelection = selection;
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

    _getFailedIds() {
        return Array.from(this._failedLoads.keys());
    }

    dispose() {
        if (this._session) {
            this._session.dispose();
            this._session = null;
        }
        this._spatialCameraController = null;
        this._inspectionService = null;
        this._editingService = null;
        this._placementService = null;
        for (const [, entry] of this._documentManagers) {
            entry.untrack();
        }
        this._documentManagers.clear();
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
