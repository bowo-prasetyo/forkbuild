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
import { computeLifecycleStatus, describeLifecycleStatus } from './DocumentLifecycleStatus.js';
import { detectSpatialOverlap } from '../core/SpatialOverlap.js';
import { SpatialAllocationPolicy, evaluateSpatialAllocation } from '../core/SpatialAllocationPolicy.js';
import { distanceBetween, isWithinRadius } from '../core/SpatialQuery.js';

const STREAMING_RADIUS = 150;
const NAVIGATION_RADIUS = 80;
const RETRY_DELAYS = [2000, 5000, 10000];

// 0.2.29 — defaults for the two location-browser entry points.
// DEFAULT_EXPLORE_RADIUS matches the design doc's own example ("radius
// 25 of (100, 50, 250)") — a reasonable starting neighborhood to look
// around the camera without the caller having to pick a number first.
// NEARBY_RADIUS is deliberately much smaller: "What's Here?" reads as
// an exact-location query, but the camera's world position is
// continuous and essentially never lands exactly on a recorded
// PlacementRecord's position — not even immediately after Focus, whose
// orbit-style framing (SpatialCameraController) parks the camera a
// fixed offset away from the target, never on top of it. A small
// tolerance radius is what makes "What's here?" answerable at all from
// camera position; see exploreHere/whatsHere below.
const DEFAULT_EXPLORE_RADIUS = 25;
const NEARBY_RADIUS = 5;

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
    	discoveryProvider = null, // <-- Fixed: Added missing parameter
	    placementRegistry = null,
	    moveWorldPlacementUseCase = null,
	    spatialAllocationPolicy = SpatialAllocationPolicy.WARN,
	    searchWorldUseCase = null
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
	    // 0.2.23: WHERE a published world sits in shared space — a
	    // separate concern from the document/publication itself (see
	    // docs/Principles.md, "A Publication Is What; A Placement Is
	    // Where"). Both optional: a session built without them (most
	    // existing tests) simply can't resolve/move a placement,
	    // exactly the same "enforce/offer only when the collaborator is
	    // actually wired" pattern discoveryProvider already follows.
	    this._placementRegistry = placementRegistry;
	    this._moveWorldPlacementUseCase = moveWorldPlacementUseCase;
	    // 0.2.25: the policy applied to EXPLICIT, interactive placement
	    // (checkPlacementOverlap/movePlacement) — see
	    // core/SpatialAllocationPolicy.js. Automatic initial placement
	    // (PlacePublicationUseCase, via GridPlacementStrategy) is
	    // deliberately NOT routed through this — it always behaves as
	    // ALLOW, matching 0.2.23's "placement never blocks a publish."
	    this._spatialAllocationPolicy = spatialAllocationPolicy;
	    // 0.2.26: optional, same "enforce/offer only when the
	    // collaborator is actually wired" rule everything else in this
	    // constructor follows — a session built without it (most
	    // existing tests) simply can't search.
	    this._searchWorldUseCase = searchWorldUseCase;

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
        // 0.2.27: two independent concepts that used to be one field —
        // see docs/Principles.md, "Camera Focus, Active Document, and
        // Selection Are Three Different Things."
        //   _focusedDocumentId — where the CAMERA is navigated to.
        //   _activeDocumentId  — which document receives document-level
        //                        actions and mutation fallbacks.
        // They usually change together (focusDocument() sets both, by
        // default) but are never assumed to be equal — every mutation
        // path in this file reads _activeDocumentId, never
        // _focusedDocumentId, so "where the camera happens to be
        // pointed" can never silently decide what gets edited.
        this._focusedDocumentId = null;
        this._activeDocumentId = null;
        this._eventBus = null;
	    this._discoveryProvider = discoveryProvider;

		this._pasteCount = 0;

        // 0.2.20: documentIds currently loaded straight from a
        // publication — immutable as far as this session is concerned,
        // exactly like PublishedWorldSession's canEdit:false, except
        // enforced here by intercepting mutation entry points rather
        // than by omitting them. A documentId leaves this set the
        // moment it is superseded by a fork (_forkForEdit) or created
        // fresh by forkDocument()/cloneDocument(). See
        // docs/Principles.md, "A published snapshot is never mutated
        // in place (0.2.20)".
        this._publishedDocumentIds = new Set();

        // 0.2.20 follow-up: a lazily-created fork is, by definition, a
        // document the discovery/layout providers have never heard of
        // (it has not been published). Two things break if that's not
        // accounted for:
        //   1. updateSpatialView()'s streaming unload only protects
        //      "dirty" documents; once a fork is saved (dirty clears)
        //      it silently vanishes from the view on the next camera
        //      move, because it can never appear in
        //      findVisibleDocuments()'s results again.
        //   2. worldLayoutProvider.getPosition(forkId) has nothing to
        //      look up and falls back to (0,0,0)/a wrong grid slot —
        //      fine for the bricks themselves (addWorld was called
        //      with the correct inherited position once, at fork
        //      time), but every *subsequent* position lookup (the
        //      transform gizmo's pivot, chiefly) recomputes from
        //      scratch and drifts away from where the bricks actually
        //      are, so the gizmo can no longer be grabbed.
        // _localOnlyDocumentIds pins a fork against streaming unload
        // unconditionally; _localPositions remembers the position it
        // inherited from its source so lookups stay correct even after
        // the document stops being "dirty".
        this._localOnlyDocumentIds = new Set();
        this._localPositions = new Map();

        // 0.2.21: set by _forkForEdit right before it returns, cleared
        // by the next consumeForkNotice() call. A drain, not an event
        // subscription — the UI already polls session state once per
        // interaction (refreshSpatialUI), so a flag it can check right
        // after a guarded call is simpler than wiring a new EventBus
        // topic for something that fires at most once per interaction.
        this._pendingForkNotice = null;
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
        let targetDocumentId = placement.targetDocumentId || this._activeDocumentId;
        let targetBuildingId = placement.targetBuildingId || null;
        // 0.2.20: placing a brick is a mutation — fork first if the
        // target is still a published, unforked snapshot. The target
        // building (if any was resolved before the fork) is remapped
        // positionally, same as a selection would be.
        if (this._publishedDocumentIds.has(targetDocumentId)) {
            const sourceDoc = this._loadedDocuments.get(targetDocumentId);
            const buildingIndex = (targetBuildingId && sourceDoc)
                ? sourceDoc.world.getBuildings().findIndex((b) => b.id === targetBuildingId)
                : -1;
            targetDocumentId = this._ensureEditableDocumentId(targetDocumentId);
            const forkedDoc = this._loadedDocuments.get(targetDocumentId);
            targetBuildingId = (buildingIndex !== -1 && forkedDoc)
                ? (forkedDoc.world.getBuildings()[buildingIndex]?.id || null)
                : null;
        }
        const document = this._loadedDocuments.get(targetDocumentId);
        if (!document) {
            return false;
        }
        const world = document.world;
        const buildings = world.getBuildings();
        if (buildings.length === 0) {
            return false;
        }
        const buildingId = targetBuildingId || buildings[0].id;
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
        // gizmoPointerDown runs on EVERY pointer-down while something
        // is selected — that's the "gizmo-first" pattern (try the
        // gizmo, fall back to a plain click-select on pointer-up), not
        // a signal that this particular click is a drag. A fork must
        // stay lazy on the actual first mutation, so hit-test BEFORE
        // forking: a click that lands anywhere but a handle (e.g.
        // re-selecting a different brick) must never fork on its own.
        if (typeof this._session.gizmoHitTest === 'function'
            && !this._session.gizmoHitTest(rawEvent.clientX, rawEvent.clientY)) {
            return false;
        }
        // This IS a genuine grab: it commits to a mutation the moment
        // the drag ends. Fork now, before the renderer arms the drag
        // against `this._spatialSelection` — every subsequent gizmo
        // callback (move/up) reads that same (now-forked) selection
        // reference.
        this._ensureEditableSelection();
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

    // 0.2.27: moves the camera AND, by default, makes `documentId` the
    // active (editing) document too — the common case (search/Nearby
    // Worlds/Documents-Here "Focus") really does mean both at once,
    // and every pre-0.2.27 caller of focusDocument already expected
    // that combined behavior. Pass `{ setActive: false }` for a pure
    // camera move that must not change what mutations target — see
    // docs/Principles.md, "Navigation Never Implies Editing."
    focusDocument(documentId, { setActive = true } = {}) {
        this._focusedDocumentId = documentId;
        if (setActive) {
            this.setActiveDocument(documentId);
        }
        const layoutPos = this._getWorldPosition(documentId);
        this._spatialCameraController.focusDocument(documentId, layoutPos);
        return this.updateSpatialView();
    }

    // 0.2.27: makes `documentId` the active document WITHOUT touching
    // the camera — the missing half of "Editing: Bob" while "Camera:
    // Alice" stays put (e.g. two publications sharing a coordinate;
    // switching which one is the editing target never needs to move
    // anything). A selection that belongs to a DIFFERENT document is
    // cleared — carrying it forward would mean the next transform
    // silently forks a document that isn't the one this call just
    // said should be active (see docs/Principles.md, "Only The Active
    // Document Is An Editing Target"). A selection already inside
    // `documentId` (or no selection at all) is left exactly as it was.
    setActiveDocument(documentId) {
        if (this._spatialSelection && !this._spatialSelection.isEmpty
            && this._spatialSelection.documentId !== documentId) {
            this.clearSelection();
        }
        this._activeDocumentId = documentId;
        return this._activeDocumentId;
    }

    // Where the camera is currently navigated to — see getActiveDocumentId()
    // for "which document would an edit land on," a genuinely different
    // question as of 0.2.27.
    getFocusedDocumentId() {
        return this._focusedDocumentId;
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
		    // 0.2.20: a lazily-forked document is never a publication,
		    // so it can never re-enter `visibleIds` on its own — unlike
		    // a dirty flag, this pin does not clear on save. Without it,
		    // saving a fork (which clears dirty) would make the very
		    // next camera move stream it out permanently: unloadable
		    // and undiscoverable in the same breath.
		    if (this._localOnlyDocumentIds.has(id)) return false;
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
    // belongs to (or the ACTIVE document when nothing is selected —
    // 0.2.27: never the camera-focused one, see docs/Principles.md).
    // Multi-document select-all is deliberately undefined: a spatial
    // selection references exactly one document.
    selectAll() {
        const documentId = (!this._spatialSelection.isEmpty && this._spatialSelection.documentId)
            || this._activeDocumentId;
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

    marqueeSelect({ x0, y0, x1, y1 } = {}, { additive = false } = {}) {
        if (!this._session || typeof this._session.pickRectangle !== 'function') {
            return false;
        }
        const hits = this._session.pickRectangle(x0, y0, x1, y1) || [];
        const documentId = this._resolveMarqueeDocumentId(hits);
        if (!documentId) {
            if (!additive) {
                this.clearSelection();
            }
            return true;
        }

        let nextSelection = additive && this._spatialSelection.documentId === documentId
            ? this._spatialSelection
            : SpatialSelectionState.empty();
        for (const hit of hits) {
            if (!hit || hit.documentId !== documentId || !hit.buildingId || !hit.brickId) {
                continue;
            }
            nextSelection = nextSelection.addBrick(hit);
        }

        this._setSpatialSelection(nextSelection);
        this._session.selectBricks(nextSelection.brickIds, nextSelection.brickId);
        this._session.clearHover();
        this._refreshInspection();
        this._refreshEditingContext();
        this._refreshGizmo();
        return true;
    }

    getSelectionCount() {
        return this._spatialSelection.isEmpty ? 0 : this._spatialSelection.items.length;
    }

    setControlsEnabled(enabled) {
        if (!this._session || typeof this._session.setControlsEnabled !== 'function') {
            return false;
        }
        this._session.setControlsEnabled(enabled);
        return true;
    }

    moveSelection(delta, modifiers = null) {
	    if (this._historyPreview && this._historyPreview.active) return false;
        this._ensureEditableSelection();
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
        this._ensureEditableSelection();
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
        this._ensureEditableSelection();
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
        this._ensureEditableSelection();
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
        this._ensureEditableSelection();
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
        this._ensureEditableSelection();
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
        return this._getWorldPosition(documentId);
    }

    // -----------------------------------------------------------------
    // Fork-on-write (0.2.20)
    //
    // A published World View is immutable; a World View SESSION is
    // editable. Opening a published snapshot never makes the snapshot
    // itself editable — the first mutation crosses the publication
    // boundary and creates a new Document derived from it (Copy-on-
    // Write / Fork-on-Edit). Navigation, camera, selection, hover, and
    // inspection never call any of this; only an actual document
    // mutation does. See docs/Principles.md, 0.2.20.
    // -----------------------------------------------------------------

    // True while `documentId` is still a straight, unforked view of a
    // published snapshot — i.e. still immutable as far as this session
    // is concerned.
    isDocumentPublished(documentId) {
        return this._publishedDocumentIds.has(documentId);
    }

    // Proactive counterpart to the guards below: tells the UI what
    // WOULD happen on the first edit of `documentId`, before the user
    // attempts one, so it can explain itself instead of only reacting
    // after a blocked action throws. Returns null for anything that
    // isn't a still-published snapshot (already editable — nothing to
    // say). Otherwise:
    //   { blocked: false, message } — editable; first edit forks silently
    //   { blocked: true,  message } — fork policy (0.2.13) forbids it
    getEditabilityNotice(documentId) {
        if (!documentId || !this._publishedDocumentIds.has(documentId)) {
            return null;
        }
        const { allowed, license } = this._checkForkPolicy(documentId);
        if (!allowed) {
            const licenseLabel = license ? license.id : 'UNSPECIFIED';
            return {
                blocked: true,
                message: `Published under "${licenseLabel}" — the author has not allowed forking, so this world can be viewed but not edited.`
            };
        }
        return {
            blocked: false,
            message: 'Published snapshot — your first edit creates your own editable fork; the original is never changed.'
        };
    }

    // 0.2.21: the World View entry point for the Document Properties
    // editor. Editing metadata is a mutation exactly like moving a
    // brick — it must not land on a published snapshot — so it goes
    // through the SAME fork-on-first-mutation gate
    // (_ensureEditableDocumentId) every other guard in this file uses,
    // rather than a bespoke "throw if published" check of its own.
    // Returns the documentId the edit actually landed on (the fork's
    // id, if one was just created) so the caller can re-focus/re-select
    // it.
    updateDocumentMetadata(documentId, { title, description, license } = {}) {
        const id = this._ensureEditableDocumentId(documentId || this._activeDocumentId);
        const doc = this.getDocument(id);
        if (!doc) {
            throw new Error(`WorldNavigationSession: no loaded document "${id}"`);
        }
        const metadata = doc.metadata;
        if (title !== undefined) metadata.title = title;
        if (description !== undefined) metadata.description = description;
        if (license !== undefined) metadata.license = license;
        metadata.touch();
        let history = this._commandHistories.get(id);
        if (!history) {
            history = new CommandHistory({ world: doc.world });
            this._commandHistories.set(id, history);
        }
        history.markUnsaved();
        return id;
    }

    // Normalized data for the Document Info panel — the same shape
    // for a published snapshot, a fork, or an ordinary loaded
    // document, so the UI component doesn't need to know which one
    // it's looking at. `hasBeenSaved` is approximated as "not dirty":
    // every fork starts dirty the instant it's created (_forkForEdit
    // always calls history.markUnsaved()), so a clean history reliably
    // means an explicit saveDocument() happened since.
    getDocumentInfo(documentId) {
        const id = documentId || this._activeDocumentId;
        const doc = this.getDocument(id);
        if (!doc) return null;
        const isPublished = this.isDocumentPublished(id);
        const dirty = this.isDocumentDirty(id);
        const status = computeLifecycleStatus({ hasBeenSaved: !dirty, isPublished });
        return {
            documentId: id,
            title: doc.metadata.title || 'Untitled',
            description: doc.metadata.description || '',
            author: doc.metadata.author,
            license: doc.metadata.license,
            parentDocumentId: doc.metadata.parentDocumentId,
            status,
            statusLabel: describeLifecycleStatus(status, { dirty }),
            dirty,
            editable: !isPublished,
            editabilityNotice: this.getEditabilityNotice(id)
        };
    }

    // 0.2.23: the Publication a loaded document's placement(s) belong
    // to — a document only HAS a placement once it (or a document
    // sharing its documentId, for a document that hasn't been
    // published itself) has been published; a fork you haven't
    // published yet has none. Separate from _isKnownPublication/
    // _findPublications (0.2.20), which answer "is this a published
    // snapshot" for the fork-on-edit boundary — this answers "which
    // Publication row does the spatial layer key placements under",
    // used regardless of whether the document is currently the
    // read-only source or an already-forked, still-editable copy that
    // happens to share history with one.
    _resolvePublicationForPlacement(documentId) {
        const publications = this._findPublications(documentId);
        if (publications.length === 0) return null;
        return publications.reduce((latest, p) => (!latest || p.publishedAt > latest.publishedAt) ? p : latest, null);
    }

    // A document can have more than one placement (the same
    // publication exhibited in several places — see docs/Principles.md,
    // "A Publication Is What; A Placement Is Where"). Picking the most
    // recently updated one is a deliberate simplification for this
    // milestone, matching WorldLayoutProvider.getPosition's same
    // choice; browsing/choosing among several is future scope, not
    // something the current data model prevents.
    _resolvePlacementRecord(documentId) {
        if (!this._placementRegistry) return null;
        const publication = this._resolvePublicationForPlacement(documentId);
        if (!publication) return null;
        const records = this._placementRegistry.findByPublicationId(publication.id);
        if (records.length === 0) return null;
        return records.reduce((latest, r) => (!latest || r.updatedAt > latest.updatedAt) ? r : latest, null);
    }

    // Normalized data for a Placement Info panel — position, revision,
    // owner, and whether THIS identity is (as far as this session can
    // tell, locally) the one who may move it. Returns null when the
    // document has no known placement yet (never published, or
    // placementRegistry isn't wired) rather than a placement-shaped
    // object full of nulls.
    getPlacementInfo(documentId) {
        const id = documentId || this._activeDocumentId;
        const record = this._resolvePlacementRecord(id);
        if (!record) return null;
        const currentUser = this._identityProvider ? this._identityProvider.currentUser() : null;
        const currentUsername = currentUser ? (currentUser.username || currentUser.id) : null;
        // Best-effort, LOCAL ownership signal for the UI only — never
        // the actual authorization boundary. A move this session
        // allows still gets signed as the CURRENT user (0.2.16); if
        // that doesn't match the placement's real owner (or a valid
        // 0.2.17 delegation), the revision fails verification wherever
        // it's actually checked, the same "the writer doesn't gate
        // itself, the reader verifies" decentralized posture 0.2.19's
        // trust layer already established. No owner recorded at all
        // (a legacy/never-signed placement) is treated as movable,
        // matching "enforce only when the information is actually
        // available" (0.2.13/0.2.20's fork policy checks use the same
        // rule).
        const ownerName = record.owner || (record.ownerIdentity ? (record.ownerIdentity.username || record.ownerIdentity.id) : null);
        const ownedByCurrentUser = !ownerName || (currentUsername !== null && ownerName === currentUsername);
        // 0.2.25: passive overlap visibility — how many OTHER placements
        // (local knowledge only, same "best-effort" posture as `movable`
        // above) currently sit at this exact position. Shown regardless
        // of how this placement got here (automatic or explicit) — see
        // docs/Principles.md, "Overlap Is A Fact; Collision Is A Policy
        // Decision." Never blocks or alters anything by itself.
        const overlap = this._placementRegistry
            ? detectSpatialOverlap(record.position, this._placementRegistry.list(), { excludePlacementId: record.placementId })
            : null;
        return {
            documentId: id,
            placementId: record.placementId,
            publicationId: record.publicationId,
            position: { x: record.position.x, y: record.position.y, z: record.position.z },
            rotation: record.rotation,
            revision: record.revision,
            owner: ownerName,
            movable: ownedByCurrentUser,
            overlapCount: overlap ? overlap.count : 0
        };
    }

    // Pre-flight query for an EXPLICIT placement request — "if I moved
    // this placement to newPosition right now, what would I find
    // there, and does my configured policy require confirming first?"
    // Purely a query: it never mutates anything, and movePlacement()
    // below does not call it — the caller (the UI) is expected to call
    // this FIRST, get a decision, and only invoke movePlacement() once
    // that decision is satisfied (allowed, and confirmed if required).
    // See docs/Principles.md, "Overlap Is A Fact; Collision Is A Policy
    // Decision" — MoveWorldPlacementUseCase remains the sole authority
    // for actually creating a new placement revision; this method never
    // touches it.
    //
    // Returns null when there is nothing to check against (no
    // placementRegistry wired, or the document has no placement of its
    // own to move) rather than a decision-shaped object full of
    // defaults — the same "null when the question doesn't apply" rule
    // getPlacementInfo already follows.
    checkPlacementOverlap(documentId, newPosition) {
        const id = documentId || this._activeDocumentId;
        if (!this._placementRegistry) return null;
        const record = this._resolvePlacementRecord(id);
        if (!record) return null;
        const overlap = detectSpatialOverlap(newPosition, this._placementRegistry.list(), { excludePlacementId: record.placementId });
        const decision = evaluateSpatialAllocation(this._spatialAllocationPolicy, overlap);
        return {
            ...decision,
            occupants: overlap.occupants.map((occupant) => this._describeSpatialOccupant(occupant))
        };
    }

    // 0.2.26 — "what's actually here?", independent of any move in
    // progress. Unlike checkPlacementOverlap (which excludes the
    // placement being moved, because it's asking "would I collide with
    // something ELSE"), this includes every placement at the position,
    // the currently-inspected one included — it answers the World
    // Navigation design's "Documents at this location" list, not a
    // move's pre-flight check. Read-only: never touches
    // MoveWorldPlacementUseCase, never mutates anything.
    //
    // Only PUBLISHED placements (backed by a PlacementRecord) can ever
    // appear here — an editing fork has no placement of its own (it
    // inherits its source's position locally and non-authoritatively,
    // see _localPositions below), so it deliberately never shows up in
    // a "documents at this position" query. Making forks independently
    // placeable would mean giving something that BY DESIGN has no
    // publication yet a position anyway — a bigger question this
    // milestone does not attempt to answer.
    getDocumentsAtPosition(position) {
        if (!this._placementRegistry) return [];
        const overlap = detectSpatialOverlap(position, this._placementRegistry.list());
        return overlap.occupants.map((occupant) => this._describeSpatialOccupant(occupant));
    }

    // Resolves a placement record into the shape a UI actually wants
    // to show a person: a title and a documentId to focus, not a raw
    // publicationId. Best-effort — falls back to the publicationId
    // itself when discovery can't resolve it (no discoveryProvider
    // wired, or the publication isn't locally known), matching how
    // every other best-effort local lookup in this file degrades.
    // Shared by checkPlacementOverlap (0.2.25) and getDocumentsAtPosition
    // (0.2.26) — both are "who else is at this position," just with
    // different self-inclusion rules upstream.
    _describeSpatialOccupant(record) {
        const publication = this._discoveryProvider ? this._discoveryProvider.findById(record.publicationId) : null;
        return {
            documentId: publication ? publication.documentId : null,
            publicationId: record.publicationId,
            title: publication ? publication.title : record.publicationId,
            owner: record.owner || null
        };
    }

    // 0.2.26 — search over the SAME discovery machinery everything
    // else reads from (see application/SearchWorldUseCase.js), enriched
    // with what the World View actually needs to show a result and
    // act on it: a resolved position (Focus needs somewhere to send
    // the camera) and whether that position came from a real,
    // recorded PlacementRecord or the deterministic fallback grid
    // (0.2.24) — a real, meaningful distinction (see docs/Principles.md,
    // "Publication Found Is Not The Same As Placement Found"), not an
    // error state. Read-only, like every other navigation method here:
    // searching never loads, forks, or mutates anything by itself.
    //
    // 0.2.28: accepts either the original plain string (text-only,
    // unchanged) or an options object `{ text, center, radius }` —
    // `searchWorldByLocation` below is a thin convenience wrapper for
    // the center/radius-only case. The spatial filter runs HERE, after
    // enrichment, not inside SearchWorldUseCase: position resolution
    // already lives in this method (see _describeSearchResult), and a
    // pure discovery-layer use case has no reason to know about
    // placements at all — see docs/Principles.md, "A Spatial Query Is
    // Authoritative Over Placement, Not A Local-Cache Scan," for why
    // this still returns a real answer over whatever this node can
    // discover rather than merely "whatever happens to be nearby the
    // camera." Results are sorted nearest-first when a spatial filter
    // ran — the natural reading of a radius query — and left in
    // whatever order discovery returned them for a text-only one
    // (matching 0.2.26 — no ordering guarantee of its own).
    searchWorld(queryOrOptions) {
        if (!this._searchWorldUseCase) return [];
        const options = typeof queryOrOptions === 'string' ? { text: queryOrOptions } : (queryOrOptions || {});
        const candidates = this._searchWorldUseCase.execute(options);
        let results = candidates.map((publication) => this._describeSearchResult(publication, options.center));
        if (options.center && Number.isFinite(options.radius)) {
            results = results
                .filter((r) => r.position && isWithinRadius(r.position, options.center, options.radius))
                .sort((a, b) => a.distance - b.distance);
        }
        return results;
    }

    // Convenience for a PURE spatial query — "what's within `radius`
    // World Units of `center`," no text criterion at all. Equivalent
    // to `searchWorld({ center, radius })`; exists because "find
    // everything near this point" reads more clearly as its own named
    // operation than as a text search with the text left out (see
    // docs/Principles.md — spatial and text discovery are two kinds of
    // the same underlying query, not one shoehorned into the other).
    searchWorldByLocation({ center, radius }) {
        return this.searchWorld({ center, radius });
    }

    // `center` is optional — only passed when a spatial query is in
    // progress, so `distance` is computed (and included) ONLY when it
    // actually means something; a plain text search never carries a
    // `distance` field implying a query that was never made.
    _describeSearchResult(publication, center = null) {
        const explicit = this._placementRegistry
            ? this._placementRegistry.findByPublicationId(publication.id)
                .reduce((latest, r) => (!latest || r.revision > latest.revision) ? r : latest, null)
            : null;
        const resolved = this._worldLayoutProvider
            ? this._worldLayoutProvider.getPosition(publication.documentId)
            : null;
        const position = explicit
            ? { x: explicit.position.x, y: explicit.position.y, z: explicit.position.z }
            : (resolved ? { x: resolved.x, y: resolved.y, z: resolved.z } : null);
        return {
            documentId: publication.documentId,
            publicationId: publication.id,
            title: publication.title,
            author: publication.author,
            hasPlacement: !!explicit,
            position,
            distance: (center && position) ? distanceBetween(position, center) : null
        };
    }

    // -----------------------------------------------------------------
    // World Location Browser (0.2.29)
    //
    // Lets a person explore a region of the world directly — by camera
    // position — instead of requiring they already know a document's
    // name or manually type coordinates into the Search panel. This is
    // deliberately NOT a second discovery mechanism: every method here
    // is a thin wrapper over searchWorldByLocation/searchWorld (0.2.28),
    // so there remains exactly one path — text/spatial query ->
    // discoveryProvider -> position enrichment -> distance/radius test
    // — and the location browser just gives it a camera-driven entry
    // point and a couple of read-only conveniences on top. Nothing in
    // this section moves a placement, edits a document, forks anything,
    // or publishes — it only ever looks (see docs/Principles.md,
    // "Navigation Never Implies Editing," 0.2.27, which this section
    // extends to exploration as well as to focus/select).
    // -----------------------------------------------------------------

    // Explicit center/radius exploration — the same enriched spatial
    // result shape 0.2.28 established (position, hasPlacement,
    // distance), just under a name that reads as "look around this
    // location" rather than "search." `searchWorldByLocation` already
    // is this; `exploreLocation` exists so the World Location Browser's
    // call sites say what they mean without re-implementing anything.
    exploreLocation({ center, radius }) {
        return this.searchWorldByLocation({ center, radius });
    }

    // "Explore Here" — the query center is the CAMERA's current world
    // position, not the active document's placement. Per 0.2.27, camera
    // focus and active document are independent: the user may be
    // looking at empty space between two documents, with no active
    // document at all (or one that has nothing to do with where the
    // camera happens to be pointed), and still want to explore right
    // there. Returns [] if the session has no camera state yet (nothing
    // loaded) rather than falling back to some other position — there
    // is no "camera position" to explore from before a world session
    // exists.
    exploreHere(radius = DEFAULT_EXPLORE_RADIUS) {
        const center = this.getSpatialState().cameraPosition;
        if (!center) return [];
        return this.exploreLocation({ center, radius });
    }

    // "What's Here?" — a small-tolerance version of exploreHere, for
    // "what, if anything, is essentially at the camera's current
    // position" rather than "what's in the neighborhood." The design
    // doc suggested reusing getDocumentsAtPosition()'s exact-match
    // semantics directly; that method tests literal position equality
    // (via detectSpatialOverlap), which works for "what else occupies
    // this placement's exact spot" but never matches a continuous
    // camera coordinate — so this adapts the same intent to a radius
    // query with a deliberately small radius (NEARBY_RADIUS) instead of
    // reusing getDocumentsAtPosition() verbatim. It still shares
    // exploreHere/exploreLocation's single code path, so the adaptation
    // costs nothing in duplicated logic.
    whatsHere() {
        return this.exploreHere(NEARBY_RADIUS);
    }

    // Read-only bundle for the Location Browser's "Inspect" action:
    // Document Info + Placement Info for `documentId`, exactly as
    // getDocumentInfo/getPlacementInfo already compute them — inspect
    // never forces a load. A location-browser result is, by definition,
    // usually a document this session hasn't loaded (that's the point
    // of finding it via search/explore rather than already having it
    // open), and getDocumentInfo only has data for a document current
    // loaded in this session (`getDocument(id)` must resolve) — loading
    // it just to inspect it would be a real side effect (renderer work,
    // network/storage reads) that a strictly read-only action should
    // not trigger on its own. So documentInfo may legitimately be null
    // here; the caller (WorldLocationBrowser) falls back to the
    // search/explore result's own already-known fields (title, author,
    // position, hasPlacement) when that happens. placementInfo is
    // independent of whether the document is loaded — it comes from
    // the placement registry — so it is often available even when
    // documentInfo is not.
    inspectDocument(documentId) {
        return {
            documentId,
            documentInfo: this.getDocumentInfo(documentId),
            placementInfo: this.getPlacementInfo(documentId)
        };
    }

    // Moves a placement to a new position — this is NOT a document
    // mutation: it never touches the Document/Publication, never
    // forks anything (see docs/Principles.md, "Moving A Placement Is
    // Not Editing A Document"), and applies even to a still-published,
    // un-forked snapshot's placement. Delegates the actual revision
    // (signed, causally-stamped — 0.2.10/0.2.16/0.2.18) to
    // MoveWorldPlacementUseCase; this method's job is purely resolving
    // WHICH placement "the document currently showing as documentId"
    // means.
    movePlacement(documentId, newPosition) {
        const id = documentId || this._activeDocumentId;
        if (!this._moveWorldPlacementUseCase) {
            throw new Error('WorldNavigationSession: placement cannot be moved — no MoveWorldPlacementUseCase wired');
        }
        const record = this._resolvePlacementRecord(id);
        if (!record) {
            throw new Error(`WorldNavigationSession: "${id}" has no known placement to move`);
        }
        return this._moveWorldPlacementUseCase.execute(record.placementId, newPosition);
    }

    // Guard for selection-driven mutations (move/rotate/delete/align/
    // distribute/numeric transform/gizmo drags). Forks the CURRENT
    // selection's document in place when it is still published, and
    // updates `this._spatialSelection` (by reference, so every caller
    // already holding it — including a renderer gizmo drag armed via
    // gizmoPointerDown — sees the forked selection) to the equivalent
    // selection in the fork. A no-op when there is no selection or the
    // selection's document is already editable.
    _ensureEditableSelection() {
        if (!this._spatialSelection || this._spatialSelection.isEmpty) {
            return;
        }
        const sourceId = this._spatialSelection.documentId;
        if (!sourceId || !this._publishedDocumentIds.has(sourceId)) {
            return;
        }
        this._forkForEdit(sourceId);
    }

    // Guard for document-scoped mutations that are not selection-driven
    // (placement, groups, paste). Returns the documentId to actually
    // operate against — unchanged when already editable, the new
    // fork's id otherwise.
    _ensureEditableDocumentId(documentId) {
        if (!documentId || !this._publishedDocumentIds.has(documentId)) {
            return documentId;
        }
        return this._forkForEdit(documentId);
    }

    // The actual Copy-on-Write: forks `sourceDocumentId`, swaps this
    // session's view of it for the fork (the published source is
    // unloaded from this session — the mutation the caller is about to
    // perform must land on the fork, never on the source), and remaps
    // any live references (selection, focus, hover) that pointed at
    // the source. Returns the fork's documentId.
    //
    // Throws if the publication's fork policy forbids forking — the
    // mutation the caller is attempting is rejected, exactly like
    // ForkDocumentUseCase's existing enforcement (0.2.13), rather than
    // silently allowed or silently dropped.
    _forkForEdit(sourceDocumentId) {
        const sourceDoc = this._loadedDocuments.get(sourceDocumentId);
        if (!sourceDoc) {
            throw new Error(`WorldNavigationSession: no loaded document "${sourceDocumentId}" to fork`);
        }

        const policy = this._checkForkPolicy(sourceDocumentId);
        if (!policy.allowed) {
            throw new Error(
                `WorldNavigationSession: forking is not permitted under license `
                + `${policy.license ? policy.license.id : 'UNSPECIFIED'} for document "${sourceDocumentId}"`
            );
        }

        const user = this._identityProvider ? this._identityProvider.currentUser() : null;
        const fork = this._documentCloneService.execute(sourceDoc, {
            title: `Fork of ${sourceDoc.metadata.title || 'Untitled'}`,
            author: user ? user.username : null,
            parentDocumentId: sourceDoc.world.id,
            // Hardening (post-0.2.22): without this, the fork's bricks have no wired
            // eventBus, so every mutation after this one updates the
            // domain model correctly but never tells the renderer —
            // the mesh freezes wherever addWorld first placed it. Same
            // bus _loadWorld already passes to loadPublicationDocumentUseCase
            // for the source, and the one the active WorldRenderer
            // subscribed to in start().
            eventBus: this._eventBus
        });
        const forkId = fork.world.id;

        this._loadedDocuments.set(forkId, fork);
        const history = new CommandHistory({ world: fork.world });
        history.markUnsaved();
        this._commandHistories.set(forkId, history);

        // The fork inherits the source's position permanently: it is
        // not discoverable (never published), so the layout/discovery
        // providers can never resolve a position for `forkId` on their
        // own — every later lookup must come back here, not fall
        // through to their "unknown document" default.
        const pos = this._getWorldPosition(sourceDocumentId);
        this._localPositions.set(forkId, pos);
        this._localOnlyDocumentIds.add(forkId);

        if (this._session) {
            this._session.removeWorld(sourceDoc.world, sourceDocumentId);
            this._session.addWorld(fork.world, forkId, pos);
        }

        // The published source is superseded in THIS session's view —
        // it was never mutated (a fresh reload of the same publication
        // elsewhere still resolves it byte-for-byte unchanged), but
        // this session now works against the fork exclusively.
        this._loadedDocuments.delete(sourceDocumentId);
        this._commandHistories.delete(sourceDocumentId);
        this._publishedDocumentIds.delete(sourceDocumentId);

        this._remapReferencesAfterFork(sourceDocumentId, sourceDoc, forkId, fork);

        // 0.2.21: so the UI can say what just happened instead of the
        // document id silently changing underneath the user — see
        // consumeForkNotice() / WorldView's guarded().
        this._pendingForkNotice = {
            sourceDocumentId,
            sourceTitle: sourceDoc.metadata.title || 'Untitled',
            forkId,
            forkTitle: fork.metadata.title
        };

        return forkId;
    }

    // Drains the notice _forkForEdit leaves behind, if any. Returns
    // null (not just falsy) when nothing forked since the last call —
    // callers can `if (notice) ...` without worrying about undefined.
    consumeForkNotice() {
        const notice = this._pendingForkNotice;
        this._pendingForkNotice = null;
        return notice;
    }

    // The world position to render/pivot `documentId` at. Prefers a
    // remembered local position (set at fork time — see _forkForEdit)
    // over the layout provider, because the provider can only resolve
    // positions for documents it can discover, and a fork never is
    // one. Used everywhere a position is needed for a document that
    // might be a fork, not just inside _forkForEdit itself.
    _getWorldPosition(documentId) {
        if (this._localPositions.has(documentId)) {
            return this._localPositions.get(documentId);
        }
        return this._worldLayoutProvider.getPosition(documentId);
    }

    // Every Publication on record for `documentId`, or [] when there is
    // no discoveryProvider wired to ask at all. The one lookup shared by
    // _isKnownPublication (is this world published at all?) and
    // _checkForkPolicy (may it be forked?).
    _findPublications(documentId) {
        if (!this._discoveryProvider || typeof this._discoveryProvider.findByDocumentId !== 'function') {
            return [];
        }
        return this._discoveryProvider.findByDocumentId(documentId) || [];
    }

    // Is `documentId` a real, published world — the actual condition
    // fork-on-write exists to protect? A session with no
    // discoveryProvider wired cannot tell, and does not claim to (see
    // _loadWorld).
    _isKnownPublication(documentId) {
        return this._findPublications(documentId).length > 0;
    }

    // fork policy (0.2.13): does the license governing `documentId`
    // permit forking at all? Enforced only when a Publication can
    // actually be resolved for it — no matching publication allows the
    // fork rather than introducing a new capability regression where
    // none existed before (matches ForkDocumentUseCase's own "only
    // enforce when a sourcePublication is known" behavior). In
    // practice this is only ever reached for documentIds
    // _isKnownPublication already confirmed, so the "no publication"
    // branch is defensive, not a live path.
    _checkForkPolicy(documentId) {
        const publications = this._findPublications(documentId);
        if (publications.length === 0) {
            return { allowed: true, license: null };
        }
        // Most recent publication of this document governs.
        const publication = publications.reduce((latest, p) =>
            (!latest || p.publishedAt > latest.publishedAt) ? p : latest, null);
        const license = publication.license instanceof License
            ? publication.license
            : new License(publication.license || {});
        return { allowed: license.forkAllowed, license };
    }

    // Remaps this session's live references — selection, focus, active
    // document, hover — from the just-superseded source document onto
    // its fork. Bricks get fresh ids on clone (DocumentCloneService),
    // so brick references are remapped POSITIONALLY (same building
    // index, same brick index within it) rather than by id; the clone
    // preserves structure and order exactly, so position is a stable
    // identity across the fork boundary.
    _remapReferencesAfterFork(sourceDocumentId, sourceDoc, forkId, forkDoc) {
        if (this._focusedDocumentId === sourceDocumentId) {
            this._focusedDocumentId = forkId;
        }
        // 0.2.27: a fork only ever happens because a mutation targeted
        // sourceDocumentId — and every mutation path resolves its
        // target from _activeDocumentId (or a selection that itself
        // gets remapped below). Whichever one caused this fork, if it
        // was the active document, the fork must become the new active
        // document too — otherwise the very next mutation would
        // silently target a document that no longer exists in this
        // session's view (it was just superseded and unloaded).
        if (this._activeDocumentId === sourceDocumentId) {
            this._activeDocumentId = forkId;
        }
        if (this._spatialSelection && this._spatialSelection.documentId === sourceDocumentId) {
            if (this._spatialSelection.type === 'ground') {
                this._spatialSelection = SpatialSelectionState.ground(this._spatialSelection.position);
            } else {
                const items = this._spatialSelection.items
                    .map((item) => item.type === 'brick'
                        ? this._remapBrickReference(sourceDoc, forkDoc, item.buildingId, item.brickId)
                        : null)
                    .filter((item) => item !== null);
                this._spatialSelection = items.length > 0
                    ? SpatialSelectionState.bricks({ documentId: forkId, items })
                    : SpatialSelectionState.empty();
            }
            // The renderer's own selection highlight and the transform
            // gizmo were both set up against the source document's
            // (now-removed) brick meshes. Without this, the visuals
            // stay pinned to whatever was on screen before the fork —
            // typically nothing, since removeWorld just tore those
            // meshes down — and the gizmo can no longer be grabbed even
            // though the (correct, forked) selection state says
            // something is selected.
            if (this._session) {
                this._session.selectBricks(this._spatialSelection.brickIds, this._spatialSelection.brickId);
            }
            this._refreshEditingContext();
            this._refreshInspection();
            this._refreshGizmo();
        }
        if (this._spatialHover && this._spatialHover.documentId === sourceDocumentId) {
            this._setSpatialHover(SpatialHoverState.empty());
        }
    }

    // Positional remap: same building index, same brick index within
    // it. Returns null if the source reference cannot be resolved
    // (defensive — should not happen for a fresh, unedited clone).
    _remapBrickReference(sourceDoc, forkDoc, buildingId, brickId) {
        const sourceBuildings = sourceDoc.world.getBuildings();
        const buildingIndex = sourceBuildings.findIndex((b) => b.id === buildingId);
        if (buildingIndex === -1) return null;
        const sourceBricks = sourceBuildings[buildingIndex].getBricks();
        const brickIndex = sourceBricks.findIndex((b) => b.id === brickId);
        if (brickIndex === -1) return null;

        const forkBuildings = forkDoc.world.getBuildings();
        const forkBuilding = forkBuildings[buildingIndex];
        if (!forkBuilding) return null;
        const forkBrick = forkBuilding.getBricks()[brickIndex];
        if (!forkBrick) return null;
        return { type: 'brick', buildingId: forkBuilding.id, brickId: forkBrick.id };
    }

    // -----------------------------------------------------------------
    // Internal
    // -----------------------------------------------------------------

    // 0.2.27: "which document would the next mutation land on" —
    // shared by _getActiveCommandHistory (undo/redo) and the history-
    // replay preview below, so both agree with every other mutation
    // path in this file instead of each independently guessing (the
    // group-ops methods above had exactly this kind of drift before
    // this milestone: two call sites resolving "the" document
    // differently, and disagreeing whenever selection and active
    // diverged). A non-empty selection wins — it's the more specific
    // answer — falling back to the active document, never the
    // camera-focused one.
    _resolveMutationTargetId() {
        if (this._spatialSelection && !this._spatialSelection.isEmpty && this._spatialSelection.documentId) {
            return this._spatialSelection.documentId;
        }
        return this._activeDocumentId;
    }

    _getActiveCommandHistory() {
        const id = this._resolveMutationTargetId();
        if (!id) return null;
        const document = this._loadedDocuments.get(id);
        if (!document) return null;
        return this._commandHistories.get(document.world.id) || null;
    }

	_loadWorld(documentId) {
	    const document = this._loadPublicationDocumentUseCase.execute(documentId, this._eventBus);
	    this._loadedDocuments.set(documentId, document);
	    // 0.2.20: a world streamed in this way is a published snapshot,
	    // immutable until (and unless) an edit forks it — see
	    // _ensureEditableSelection/_ensureEditableDocumentId — but only
	    // when a real Publication can be resolved for it. In real
	    // streaming usage (updateSpatialView) that is always true: a
	    // documentId only becomes visible/loadable in the first place
	    // because WorldLayoutProvider/discoveryProvider already know it
	    // as published. Without a discoveryProvider wired at all, this
	    // session has no way to tell a published world from any other
	    // loaded document, so it does not claim to — exactly the same
	    // "enforce only when we can" rule _checkForkPolicy already
	    // follows for license checks.
	    if (this._isKnownPublication(documentId)) {
	        this._publishedDocumentIds.add(documentId);
	    }
	    if (!this._focusedDocumentId) {
	        this._focusedDocumentId = documentId; // Set focus on first load
	    }
	    // 0.2.27: bootstrap the active document the same way — the very
	    // first thing streamed in has nothing else to be "instead of."
	    if (!this._activeDocumentId) {
	        this._activeDocumentId = documentId;
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
        // 0.2.27: a document that just left this session's view can't
        // remain the active (editing) document either — nothing would
        // be there for a mutation to land on.
        if (this._activeDocumentId === documentId) {
            this._activeDocumentId = null;
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

	// 0.2.27: whenever a real (non-ground, non-empty) selection is set,
	// the document it belongs to BECOMES the active document — see
	// docs/Principles.md, "Camera Focus, Active Document, and Selection
	// Are Three Different Things." This is what makes "select a brick
	// in a different loaded document" and "editing always targets the
	// active document" the same guarantee instead of two separate
	// invariants that could drift apart: picking, marquee-select,
	// select-all, and selecting a group all funnel through this one
	// setter, so there is exactly one place this sync can happen, not
	// one per call site to keep in sync by hand.
	_setSpatialSelection(selection) {
	    this._spatialSelection = selection;
	    if (selection && !selection.isEmpty && selection.documentId) {
	        this._activeDocumentId = selection.documentId;
	    }
	    this._refreshEditingContext();
	    this._refreshInspection();
	}

    _resolveMarqueeDocumentId(hits) {
        const firstHit = (hits || []).find((hit) => hit && hit.documentId);
        if (firstHit) {
            return firstHit.documentId;
        }
        if (!this._spatialSelection.isEmpty && this._spatialSelection.documentId) {
            return this._spatialSelection.documentId;
        }
        return this._activeDocumentId;
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
        const offset = this._getWorldPosition(this._spatialSelection.documentId);
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
        // 0.2.27: ground-hover preview targets the ACTIVE document —
        // must agree with commitPlacement's own fallback, or the
        // preview would show a brick landing in one document while the
        // actual commit lands in another.
        let targetDocumentId = this._activeDocumentId;
        if (hitResult.type === 'brick') {
            targetDocumentId = hitResult.documentId;
            const document = this._loadedDocuments.get(targetDocumentId);
            if (document) {
                const building = document.world.getBuilding(hitResult.buildingId);
                existingBrick = building?.findBrick(hitResult.brickId);
                layoutOffset = this._getWorldPosition(targetDocumentId);
            }
        } else if (hitResult.type === 'ground') {
            if (targetDocumentId) {
                layoutOffset = this._getWorldPosition(targetDocumentId);
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
	getActiveDocumentId() { return this._activeDocumentId; }
	isDocumentDirty(documentId) {
	    const doc = this.getDocument(documentId || this._activeDocumentId);
	    if (!doc) return false;
	    const history = this._commandHistories.get(doc.world.id);
	    return history ? history.isDirty() : false;
	}
	saveDocument(documentId) {
	    const id = documentId || this._activeDocumentId;
	    // 0.2.20: defense in depth — every guarded mutation already forks
	    // before marking a document dirty, so a still-published document
	    // should never reach here with anything to save. Refuse rather
	    // than silently persisting over the published source's storage
	    // slot (see docs/Principles.md, "A published snapshot is never
	    // mutated in place").
	    if (this._publishedDocumentIds.has(id)) {
	        throw new Error(`WorldNavigationSession: "${id}" is a published snapshot and cannot be saved directly — edit it to fork first`);
	    }
	    const doc = this.getDocument(id);
	    if (!doc) throw new Error('no loaded document');
	    this._saveDocumentUseCase.execute({ document: doc, state: { dirty: true }, markSaved: () => {} });
	    const history = this._commandHistories.get(doc.world.id);
	    if (history) history.markSaved();
	}
	publishDocument(documentId) {
	    const id = documentId || this._activeDocumentId;
	    if (this._publishedDocumentIds.has(id)) {
	        throw new Error(`WorldNavigationSession: "${id}" is already a published snapshot — fork it to publish an edited copy`);
	    }
	    const doc = this.getDocument(id);
	    if (!doc) throw new Error('no loaded document');
	    if (this.isDocumentDirty(doc.world.id)) this.saveDocument(doc.world.id);
	    return this._publishDocumentUseCase.execute({ document: doc });
	}
	getTimeline(documentId) {
	    const doc = this.getDocument(documentId || this._activeDocumentId);
	    const history = doc ? this._commandHistories.get(doc.world.id) : null;
	    return history ? history.getTimeline() : [];
	}		
	
	restoreHistoryAt(cursor, documentId) {
	    if (!this._replayDocumentUseCase) {
	        throw new Error('no restore configured'); // <--- ADD GUARD
	    }
	    const docId = documentId || this._activeDocumentId;
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
	    if (!this._copySelectionUseCase || !this._activeDocumentId) return SpatialClipboardState.empty();

	    // Prefer the document ID from the selection, fall back to the
	    // active document (0.2.27: never the camera-focused one).
	    const docId = (this._spatialSelection && this._spatialSelection.documentId) || this._activeDocumentId;
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
	    this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
	    const doc = this.getDocument(this._activeDocumentId);
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
	    const doc = this.getDocument(documentId || this._activeDocumentId);
	    if (!doc) throw new Error('no loaded document');
	    const clone = this._documentCloneService.execute(doc, { eventBus: this._eventBus });
	    this._loadedDocuments.set(clone.world.id, clone);
	    
	    const history = new CommandHistory({ world: clone.world });
	    history.markUnsaved(); // <--- ADD THIS LINE (matches forkDocument behavior)
	    
	    this._commandHistories.set(clone.world.id, history);
	    if (this._session) this._session.addWorld(clone.world, clone.world.id, this._worldLayoutProvider.getPosition(clone.world.id));
	    return clone.world.id;
	}
	
	forkDocument(documentId) {
	    const doc = this.getDocument(documentId || this._activeDocumentId);
	    if (!doc) throw new Error('no loaded document');
	    const user = this._identityProvider ? this._identityProvider.currentUser() : null;
	    const fork = this._documentCloneService.execute(doc, {
	        title: `Fork of ${doc.metadata.title || 'Untitled'}`,
	        author: user ? user.username : null,
	        parentDocumentId: doc.world.id,
	        eventBus: this._eventBus
	    });
	    this._loadedDocuments.set(fork.world.id, fork);
	    const history = new CommandHistory({ world: fork.world });
	    history.markUnsaved();
	    this._commandHistories.set(fork.world.id, history);
	    if (this._session) this._session.addWorld(fork.world, fork.world.id, this._worldLayoutProvider.getPosition(fork.world.id));
	    // An explicit "Fork" action means the person wants to work on
	    // the fork next — camera AND active document both move to it,
	    // same combined behavior focusDocument()'s default gives.
	    this._focusedDocumentId = fork.world.id;
	    this._activeDocumentId = fork.world.id;
	    return fork.world.id;
	}
	// 1. Fix restoreHistoryAt (Update the fake documentManager to include load/state)
	getGroups() {
	    const doc = this.getDocument(this._activeDocumentId);
	    if (!doc) return [];
	    const world = doc.world || doc;
	    const groups = typeof world.getGroups === 'function' ? world.getGroups() : (world.groups || []);
	    return groups.map(g => ({ id: g.id, name: g.name, memberCount: g.memberCount || (g.brickIds ? g.brickIds.length : 0) }));
	}
	// 0.2.27: resolves the target document from the SELECTION itself
	// (already forked/remapped by _ensureEditableSelection above, if
	// it needed to be), never from a separately, independently forked
	// _activeDocumentId. Before this milestone these could be two
	// DIFFERENT documents — a selection in Bob's world while Alice's
	// happened to be active — and this method would fork BOTH
	// (needlessly forking Alice's) and then build the group command
	// from Alice's worldId with Bob's brick ids: a real, silent
	// cross-document corruption bug. Group membership is a selection-
	// scoped operation exactly like move/rotate/delete; it must use
	// the same source of truth they do.
	createGroupFromSelection(name) {
	    this._ensureEditableSelection();
	    if (this._spatialSelection.isEmpty) return null;
	    const doc = this.getDocument(this._spatialSelection.documentId);
	    if (!doc) return null;
	    const cmd = new CreateGroupCommand({ worldId: doc.world.id, brickIds: this._spatialSelection.brickIds, name });
	    this._commandHistories.get(doc.world.id).execute(cmd);
	    return cmd.executedGroupId;
	}
	selectGroup(groupId) {
	    const doc = this.getDocument(this._activeDocumentId);
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
	    this._ensureEditableSelection();
	    if (this._spatialSelection.isEmpty) return false;
	    const doc = this.getDocument(this._spatialSelection.documentId);
	    if (!doc) return false;
	    const cmd = new AddToGroupCommand({ worldId: doc.world.id, groupId, brickIds: this._spatialSelection.brickIds });
	    this._commandHistories.get(doc.world.id).execute(cmd);
	    return true;
	}
	removeSelectionFromSelectedGroup(groupId) {
	    this._ensureEditableSelection();
	    if (this._spatialSelection.isEmpty) return false;
	    const doc = this.getDocument(this._spatialSelection.documentId);
	    if (!doc) return false;
	    const cmd = new RemoveFromGroupCommand({ worldId: doc.world.id, groupId, brickIds: this._spatialSelection.brickIds });
	    this._commandHistories.get(doc.world.id).execute(cmd);
	    return true;
	}
	// groupId-targeted operations below have no selection of their own
	// to resolve a document from — they operate on the ACTIVE document
	// (0.2.27: never the camera-focused one).
	renameGroup(groupId, name) {
	    this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
	    const doc = this.getDocument(this._activeDocumentId);
	    if (!doc) return false;
	    this._commandHistories.get(doc.world.id).execute(new RenameGroupCommand({ worldId: doc.world.id, groupId, name }));
	    return true;
	}
	duplicateGroup(groupId) {
	    this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
	    const doc = this.getDocument(this._activeDocumentId);
	    if (!doc) return null;
	    const cmd = new DuplicateGroupCommand({ worldId: doc.world.id, groupId });
	    this._commandHistories.get(doc.world.id).execute(cmd);
	    return cmd.executedGroupId;
	}
	deleteGroup(groupId) {
	    this._activeDocumentId = this._ensureEditableDocumentId(this._activeDocumentId);
	    const doc = this.getDocument(this._activeDocumentId);
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
	
	    // Renderer integration: hide live world, show replay world.
	    // Must resolve the SAME document _getActiveCommandHistory() just
	    // built `history` from above — otherwise the replay could swap
	    // out one document's live world while showing a different
	    // document's history.
	    // Remembered on _historyPreview itself (not re-resolved at cancel
	    // time) so a selection/active-document change WHILE the preview
	    // is open can never make cancelHistoryPreview restore the wrong
	    // document.
	    const docId = this._resolveMutationTargetId();
	    this._historyPreview.documentId = docId;
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
	    
	    const docId = this._historyPreview.documentId;
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
	    return this._retiredHistories ? (this._retiredHistories.get(documentId || this._activeDocumentId) || []) : [];
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
        this._activeDocumentId = null;
        this._eventBus = null;
    }
}
