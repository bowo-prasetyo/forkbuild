import { RenderWorldViewUseCase } from './RenderWorldViewUseCase.js';
import { Position } from '../core/Position.js';
import { SpatialSelectionState } from './spatial-state/SpatialSelectionState.js';
import { SpatialHoverState } from './spatial-state/SpatialHoverState.js';
import { SpatialClipboardState } from './spatial-state/SpatialClipboardState.js';
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
import { PASTE_OFFSET } from './PasteClipboardUseCase.js';
import { CreateGroupCommand } from './commands/CreateGroupCommand.js';
import { DeleteGroupCommand } from './commands/DeleteGroupCommand.js';
import { RenameGroupCommand } from './commands/RenameGroupCommand.js';
import { AddToGroupCommand } from './commands/AddToGroupCommand.js';
import { DuplicateGroupCommand } from './commands/DuplicateGroupCommand.js';
import { RemoveFromGroupCommand } from './commands/RemoveFromGroupCommand.js';

const STREAMING_RADIUS = 150;
const NAVIGATION_RADIUS = 80;
const RETRY_DELAYS = [2000, 5000, 10000];
// Synthetic renderer documentId for history-preview worlds, so a replay
// world can never collide with a real publication's id.
const REPLAY_DOCUMENT_PREFIX = 'replay:';

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
        pasteClipboardUseCase = null
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
        this._session = null;
        this._spatialCameraController = null;
        this._inspectionService = null;
        this._editingService = null;
        this._placementService = new SpatialPlacementService(registry);
        this._loadedDocuments = new Map();
        this._commandHistories = new Map();
        this._documentManagers = new Map();
        this._retiredHistories = new Map();
        this._failedLoads = new Map();
        this._spatialSelection = SpatialSelectionState.empty();
        this._spatialHover = SpatialHoverState.empty();
        this._spatialInspection = SpatialInspectionState.empty();
        this._spatialEditingContext = SpatialEditingContext.empty();
        this._spatialPlacement = SpatialPlacementState.empty();
        // 0.1.42 — the clipboard is SESSION state: what was copied, and
        // how many times it has been pasted since (for cascade offset).
        this._clipboard = SpatialClipboardState.empty();
        this._pasteCount = 0;
        this._activeDefinitionId = null;
        this._focusedDocumentId = null;
        this._eventBus = null;
        // 0.1.40 — history preview is a VISUAL mode. The live document is
        // never mutated while it is active.
        this._historyPreview = {
            active: false,
            documentId: null,
            cursor: null,
            previewWorld: null,
            previewRendered: false
        };
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
        // Editing is suspended while a history preview is showing.
        if (this._historyPreview.active) {
            return false;
        }
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
    //
    // DIRTY DOCUMENTS ARE PINNED (0.1.39): a document with unsaved edits
    // is never stream-unloaded — silently discarding edits on camera
    // movement would be data loss. Saving unpins it. The document under
    // HISTORY PREVIEW (0.1.40) is pinned too. Restored documents (0.1.41)
    // and fresh clones/forks (0.1.42) are dirty by definition, so they
    // inherit pinning automatically.
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
            (id) => !visibleIds.includes(id)
                && !this.isDocumentDirty(id)
                && !(this._historyPreview.active && this._historyPreview.documentId === id)
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
    // History Preview, Timeline & Restoration (0.1.40 / 0.1.41)
    // -----------------------------------------------------------------

    getTimeline(documentId = null) {
        const history = this._getHistoryForDocument(documentId || this.getActiveDocumentId());
        return history ? history.getTimeline() : [];
    }

    getHistoryPreview() {
        if (!this._historyPreview.active) {
            return null;
        }
        return {
            active: true,
            documentId: this._historyPreview.documentId,
            cursor: this._historyPreview.cursor
        };
    }

    beginHistoryPreview(documentId = null) {
        const id = documentId || this.getActiveDocumentId();
        const history = this._getHistoryForDocument(id);
        if (!id || !this._loadedDocuments.has(id) || !history) {
            throw new Error(`WorldNavigationSession: no loaded document to preview (${id || 'no active document'})`);
        }
        if (this._historyPreview.active) {
            if (this._historyPreview.documentId === id) {
                return id;
            }
            this.cancelHistoryPreview();
        }
        this._historyPreview = {
            active: true,
            documentId: id,
            cursor: null,
            previewWorld: null,
            previewRendered: false
        };
        return id;
    }

    previewHistoryAt(cursor) {
        if (!this._historyPreview.active) {
            throw new Error('WorldNavigationSession: no active history preview');
        }
        if (!this._replayDocumentUseCase) {
            throw new Error('WorldNavigationSession: no replay configured');
        }
        if (!this._session) {
            throw new Error('WorldNavigationSession: renderer not started');
        }
        const id = this._historyPreview.documentId;
        const document = this._loadedDocuments.get(id);
        const history = this._commandHistories.get(document.world.id);
        const replayWorld = this._replayDocumentUseCase.execute(history, { endCursor: cursor });
        const layoutPos = this._worldLayoutProvider.getPosition(id);
        if (this._historyPreview.previewRendered) {
            this._session.removeWorld(this._historyPreview.previewWorld, REPLAY_DOCUMENT_PREFIX + id);
        } else {
            this._session.removeWorld(document.world, id);
        }
        this._session.addWorld(replayWorld, REPLAY_DOCUMENT_PREFIX + id, layoutPos);
        this._historyPreview.previewWorld = replayWorld;
        this._historyPreview.previewRendered = true;
        this._historyPreview.cursor = cursor;
        return true;
    }

    cancelHistoryPreview() {
        if (!this._historyPreview.active) {
            return false;
        }
        const id = this._historyPreview.documentId;
        const document = this._loadedDocuments.get(id);
        if (this._historyPreview.previewRendered && this._historyPreview.previewWorld && this._session) {
            this._session.removeWorld(this._historyPreview.previewWorld, REPLAY_DOCUMENT_PREFIX + id);
        }
        if (document && this._session) {
            this._session.addWorld(document.world, id, this._worldLayoutProvider.getPosition(id));
            if (this._spatialSelection && !this._spatialSelection.isEmpty) {
                this._session.selectBricks(this._spatialSelection.brickIds, this._spatialSelection.brickId);
            }
        }
        this._historyPreview = {
            active: false,
            documentId: null,
            cursor: null,
            previewWorld: null,
            previewRendered: false
        };
        return true;
    }

    // Commits a historical state as the new live document (0.1.41).
    // See the 0.1.41 architecture notes for the full rebase semantics:
    // replay-based reconstruction, fresh history rooted at the restored
    // state, invalidated save point (dirty until saved), retired old
    // history, renderer swap, selection reconciliation. Restoration
    // cannot itself be undone; the retired history is the only record
    // of the pre-restore session. The UI is expected to confirm before
    // calling this.
    restoreHistoryAt(cursor, documentId = null) {
        if (!this._restoreHistoryStateUseCase) {
            throw new Error('WorldNavigationSession: no restore configured');
        }
        const id = documentId
            || (this._historyPreview.active ? this._historyPreview.documentId : this.getActiveDocumentId());
        const document = this._loadedDocuments.get(id);
        if (!document) {
            throw new Error(`WorldNavigationSession: no loaded document to restore (${id || 'no active document'})`);
        }
        const history = this._commandHistories.get(document.world.id);
        const entry = this._documentManagers.get(id);
        if (!history || !entry) {
            throw new Error(`WorldNavigationSession: document ${id} has no editable session`);
        }

        // Reconstruct and rebase. If the replay fails (e.g. invalid
        // cursor), nothing below runs and tracking stays untouched.
        const result = this._restoreHistoryStateUseCase.execute(entry.manager, history, cursor);

        // Retire the old history, then swap tracking over to the new one.
        if (!this._retiredHistories.has(id)) {
            this._retiredHistories.set(id, []);
        }
        this._retiredHistories.get(id).push(result.previousHistory);
        entry.untrack();
        entry.untrack = entry.manager.trackCommandHistory(result.history);

        // Rewire the session onto the restored document/history. The
        // world id is unchanged (replay preserves identities), so the
        // map keys, the storage slot, and publication references all
        // stay valid.
        this._loadedDocuments.set(id, result.document);
        this._commandHistories.set(result.document.world.id, result.history);

        // End any preview of this document.
        if (this._historyPreview.active && this._historyPreview.documentId === id) {
            if (this._historyPreview.previewRendered && this._historyPreview.previewWorld && this._session) {
                this._session.removeWorld(this._historyPreview.previewWorld, REPLAY_DOCUMENT_PREFIX + id);
            }
            this._historyPreview = {
                active: false,
                documentId: null,
                cursor: null,
                previewWorld: null,
                previewRendered: false
            };
        }

        // Swap the renderer onto the restored world. When a preview was
        // active the old world's meshes were already removed, so
        // removeWorld() safely no-ops on brick ids with no registered
        // meshes — this matters because old and restored worlds share
        // brick ids wherever their states overlap.
        if (this._session) {
            this._session.removeWorld(document.world, id);
            this._session.addWorld(result.document.world, id, this._worldLayoutProvider.getPosition(id));
        }

        // Reconcile transient interaction state.
        this.clearSelection();
        this._setSpatialHover(SpatialHoverState.empty());
        if (this._session) {
            this._session.clearHover();
        }
        return id;
    }

    // Histories replaced by restoreHistoryAt(), newest last. Inspectable
    // session artifacts only — never persisted, never re-editable.
    getRetiredHistories(documentId) {
        return this._retiredHistories.get(documentId) || [];
    }

    // -----------------------------------------------------------------
    // Cloning, Forking & Clipboard (0.1.42)
    // -----------------------------------------------------------------

    getClipboard() {
        return this._clipboard;
    }

    // Copy is observation, not mutation: it produces clipboard state and
    // NEVER enters command history. The clipboard carries intent only —
    // definitionId, pivot-relative transform, source metadata — and no
    // brick ids, so a paste can never collide with the copied bricks.
    // Suspended during history preview, like all editing entry points.
    copySelection() {
        if (this._historyPreview.active) {
            return SpatialClipboardState.empty();
        }
        if (!this._copySelectionUseCase) {
            return SpatialClipboardState.empty();
        }
        const selection = this._spatialSelection;
        if (!selection || selection.isEmpty || selection.type === 'ground') {
            return SpatialClipboardState.empty();
        }
        const document = this._loadedDocuments.get(selection.documentId);
        if (!document) {
            return SpatialClipboardState.empty();
        }
        this._clipboard = this._copySelectionUseCase.execute(selection, document);
        this._pasteCount = 0;
        return this._clipboard;
    }

    // Paste is mutation: exactly ONE PasteBricksCommand through
    // CommandHistory — undoable, redoable, serializable, replayable,
    // restorable like any other operation. The paste target is the
    // active document's first building (the V0.1 one-building-per-world
    // simplification), re-anchoring the clipboard's pivot-relative
    // geometry at the copied origin plus a cascading PASTE_OFFSET, so
    // repeated pastes don't overlap. Afterwards the pasted bricks are
    // selected, ready to move.
    pasteClipboard() {
        if (this._historyPreview.active) {
            return false;
        }
        if (!this._pasteClipboardUseCase) {
            return false;
        }
        if (!this._clipboard || this._clipboard.isEmpty || !this._clipboard.origin) {
            return false;
        }
        const targetId = this.getActiveDocumentId();
        const document = this._loadedDocuments.get(targetId);
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
        this._ensureCommandHistory(document.world).execute(command);

        // Select the pasted bricks (the command created their identities).
        const buildingId = buildings[0].id;
        const brickIds = command.executedBrickIds;
        this._setSpatialSelection(SpatialSelectionState.bricks({
            documentId: targetId,
            items: brickIds.map((brickId) => ({ type: 'brick', buildingId, brickId }))
        }));
        if (this._session) {
            this._session.selectBricks(brickIds, brickIds[brickIds.length - 1]);
        }
        this._refreshInspection();
        this._refreshEditingContext();
        return true;
    }

    // Duplicate a loaded document: an independent copy with a new
    // document identity (new world.id = new storage slot) and fresh
    // brick identities, structure preserved, lineage recorded via
    // parentDocumentId. The source document is never mutated and never
    // force-saved — the clone captures the LIVE state, unsaved edits
    // included. The clone is adopted as a fresh dirty session and is
    // never persisted until the user explicitly saves it.
    cloneDocument(documentId = null) {
        if (!this._documentCloneService) {
            throw new Error('WorldNavigationSession: no cloning configured');
        }
        const id = documentId || this.getActiveDocumentId();
        const source = this._loadedDocuments.get(id);
        if (!source) {
            throw new Error(`WorldNavigationSession: no loaded document to clone (${id || 'no active document'})`);
        }
        const currentUser = this._identityProvider ? this._identityProvider.currentUser() : null;
        const clone = this._documentCloneService.execute(source, {
            author: currentUser ? currentUser.username : source.metadata.author
        });
        return this._adoptCreatedDocument(clone);
    }

    // Fork a loaded (typically published) document: the same cloning
    // mechanism with fork metadata — "Fork of <title>", the CURRENT user
    // as author (null when anonymous), lineage via parentDocumentId.
    // Editing the fork never touches the source document or its
    // publications; publishing the fork later creates a NEW publication
    // referencing the fork.
    forkDocument(documentId = null) {
        if (!this._documentCloneService) {
            throw new Error('WorldNavigationSession: no cloning configured');
        }
        const id = documentId || this.getActiveDocumentId();
        const source = this._loadedDocuments.get(id);
        if (!source) {
            throw new Error(`WorldNavigationSession: no loaded document to fork (${id || 'no active document'})`);
        }
        const currentUser = this._identityProvider ? this._identityProvider.currentUser() : null;
        const fork = this._documentCloneService.execute(source, {
            title: `Fork of ${source.metadata.title || 'Untitled'}`,
            author: currentUser ? currentUser.username : null,
            parentDocumentId: source.world.id
        });
        return this._adoptCreatedDocument(fork);
    }

    // Wires a freshly-created (cloned/forked) document into the session:
    // loaded-documents map, renderer, per-document DocumentManager, and
    // a FRESH CommandHistory rooted at the new state — the same rebase
    // shape restoration uses (0.1.41). The history's save point starts
    // INVALIDATED: nothing exists on disk for this document yet, so it
    // is dirty until an explicit Save establishes the save point at
    // cursor 0, and dirty pinning (0.1.39) keeps it loaded meanwhile.
    // Returns the new documentId (= the new world.id).
    _adoptCreatedDocument(document) {
        const documentId = document.world.id;
        const manager = new DocumentManager();
        manager.load(document, null);
        const history = new CommandHistory({ world: document.world });
        history.markUnsaved();
        const untrack = manager.trackCommandHistory(history);
        manager.markDirty();
        this._loadedDocuments.set(documentId, document);
        this._commandHistories.set(document.world.id, history);
        this._documentManagers.set(documentId, { manager, untrack });
        if (this._session) {
            this._session.addWorld(
                document.world,
                documentId,
                this._worldLayoutProvider.getPosition(documentId)
            );
        }
        return documentId;
    }

    // -----------------------------------------------------------------
    // Groups (0.1.43)
    // -----------------------------------------------------------------
    // Groups are DOCUMENT STATE (core/Group, owned by World) — unlike
    // selection, which stays session state. Every group mutation goes
    // through CommandHistory, so groups inherit undo/redo, dirty
    // tracking, persistence, replay, and restoration automatically.
    // All mutations are gated during history preview, like every other
    // editing entry point.

    getGroups(documentId = null) {
        const id = documentId || this.getActiveDocumentId();
        const document = this._loadedDocuments.get(id);
        if (!document) {
            return [];
        }
        return document.world.getGroups().map((group) => ({
            id: group.id,
            name: group.name || 'Unnamed Group',
            memberCount: group.memberCount
        }));
    }

    // Creates a flat group over the current selection. Returns the new
    // group id, or false when nothing can be grouped.
    createGroupFromSelection(name = null) {
        if (this._historyPreview.active) {
            return false;
        }
        const selection = this._spatialSelection;
        if (!selection || selection.isEmpty || selection.type === 'ground') {
            return false;
        }
        const document = this._loadedDocuments.get(selection.documentId);
        if (!document) {
            return false;
        }
        const brickIds = selection.brickIds.filter((brickId) =>
            document.world.getBuildings().some((building) => building.findBrick(brickId))
        );
        if (brickIds.length === 0) {
            return false;
        }
        const command = new CreateGroupCommand({
            worldId: document.world.id,
            brickIds,
            name: name || `Group ${document.world.getGroups().length + 1}`
        });
        this._ensureCommandHistory(document.world).execute(command);
        return command.executedGroupId;
    }

    deleteGroup(groupId, documentId = null) {
        if (this._historyPreview.active) {
            return false;
        }
        const id = documentId || this.getActiveDocumentId();
        const document = this._loadedDocuments.get(id);
        if (!document || !document.world.getGroup(groupId)) {
            return false;
        }
        this._ensureCommandHistory(document.world).execute(
            new DeleteGroupCommand({ worldId: document.world.id, groupId })
        );
        return true;
    }

    renameGroup(groupId, name, documentId = null) {
        if (this._historyPreview.active) {
            return false;
        }
        const id = documentId || this.getActiveDocumentId();
        const document = this._loadedDocuments.get(id);
        if (!document || !document.world.getGroup(groupId)) {
            return false;
        }
        this._ensureCommandHistory(document.world).execute(
            new RenameGroupCommand({ worldId: document.world.id, groupId, name })
        );
        return true;
    }

    // Fresh identities throughout: new bricks (offset), new group.
    // The source group is never mutated.
    duplicateGroup(groupId, documentId = null) {
        if (this._historyPreview.active) {
            return false;
        }
        const id = documentId || this.getActiveDocumentId();
        const document = this._loadedDocuments.get(id);
        if (!document || !document.world.getGroup(groupId)) {
            return false;
        }
        const command = new DuplicateGroupCommand({ worldId: document.world.id, groupId });
        this._ensureCommandHistory(document.world).execute(command);
        return command.executedGroupId;
    }

    addToGroupWithSelection(groupId, documentId = null) {
        if (this._historyPreview.active) {
            return false;
        }
        const id = documentId || this.getActiveDocumentId();
        const document = this._loadedDocuments.get(id);
        const selection = this._spatialSelection;
        if (!document || !document.world.getGroup(groupId)) {
            return false;
        }
        if (!selection || selection.isEmpty || selection.type === 'ground') {
            return false;
        }
        if (selection.documentId !== id) {
            return false;
        }
        const brickIds = selection.brickIds.filter((brickId) =>
            document.world.getBuildings().some((building) => building.findBrick(brickId))
        );
        if (brickIds.length === 0) {
            return false;
        }
        this._ensureCommandHistory(document.world).execute(
            new AddToGroupCommand({ worldId: document.world.id, groupId, brickIds })
        );
        return true;
    }

    removeFromGroupWithSelection(groupId, documentId = null) {
        if (this._historyPreview.active) {
            return false;
        }
        const id = documentId || this.getActiveDocumentId();
        const document = this._loadedDocuments.get(id);
        const selection = this._spatialSelection;
        if (!document || !document.world.getGroup(groupId)) {
            return false;
        }
        if (!selection || selection.isEmpty || selection.type === 'ground') {
            return false;
        }
        if (selection.documentId !== id) {
            return false;
        }
        const brickIds = selection.brickIds.filter((brickId) =>
            document.world.getBuildings().some((building) => building.findBrick(brickId))
        );
        if (brickIds.length === 0) {
            return false;
        }
        this._ensureCommandHistory(document.world).execute(
            new RemoveFromGroupCommand({ worldId: document.world.id, groupId, brickIds })
        );
        return true;
    }
    
    // Resolves a group's membership into SpatialSelectionState — the
    // group is document state; the resulting selection is session state.
    // Missing brick ids are skipped (membership is referential).
    selectGroup(groupId, documentId = null) {
        const id = documentId || this.getActiveDocumentId();
        const document = this._loadedDocuments.get(id);
        if (!document) {
            return false;
        }
        const group = document.world.getGroup(groupId);
        if (!group) {
            return false;
        }
        const items = [];
        for (const building of document.world.getBuildings()) {
            for (const brick of building.getBricks()) {
                if (group.hasMember(brick.id)) {
                    items.push({ type: 'brick', buildingId: building.id, brickId: brick.id });
                }
            }
        }
        if (items.length === 0) {
            return false;
        }
        this._setSpatialSelection(SpatialSelectionState.bricks({ documentId: id, items }));
        if (this._session) {
            this._session.selectBricks(
                items.map((item) => item.brickId),
                items[items.length - 1].brickId
            );
        }
        this._refreshInspection();
        this._refreshEditingContext();
        return true;
    }

    // -----------------------------------------------------------------
    // Advanced selection (0.1.45)
    // -----------------------------------------------------------------

    // Select every brick in the active (or given) document. Session
    // state only — zero history entries.
    selectAll(documentId = null) {
        const id = documentId || this.getActiveDocumentId();
        const document = this._loadedDocuments.get(id);
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
        this._setSpatialSelection(SpatialSelectionState.bricks({ documentId: id, items }));
        if (this._session) {
            this._session.selectBricks(
                items.map((item) => item.brickId),
                items[items.length - 1].brickId
            );
        }
        this._refreshInspection();
        this._refreshEditingContext();
        return true;
    }

    // Marquee selection: the VIEW owns the Shift+drag gesture and the
    // rectangle overlay; the RENDERER answers containment
    // (pickRectangle); this method owns the selection semantics. Hits
    // from other documents are ignored — a marquee selects within the
    // focused document (single-document selection rule). additive=true
    // (Ctrl/Cmd held during the drag) unions hits with the current
    // selection; otherwise the marquee REPLACES it. Session state only
    // — zero history entries.
    marqueeSelect(rect, { additive = false } = {}) {
        if (!this._session || !this._session.pickRectangle) {
            return false;
        }
        const hits = this._session.pickRectangle(rect.x0, rect.y0, rect.x1, rect.y1);
        const documentId = this._focusedDocumentId
            || (hits.length > 0 ? hits[0].documentId : null);
        if (!documentId || !this._loadedDocuments.has(documentId)) {
            return false;
        }
        const items = hits
            .filter((hit) => hit.documentId === documentId)
            .map((hit) => ({ type: 'brick', buildingId: hit.buildingId, brickId: hit.brickId }));
        if (items.length === 0) {
            if (!additive) {
                this.clearSelection();
            }
            return false;
        }
        let nextItems = items;
        if (additive
            && !this._spatialSelection.isEmpty
            && this._spatialSelection.documentId === documentId) {
            nextItems = [...this._spatialSelection.items, ...items];
        }
        const nextSelection = SpatialSelectionState.bricks({ documentId, items: nextItems });
        this._setSpatialSelection(nextSelection);
        this._session.selectBricks(nextSelection.brickIds, nextSelection.brickId);
        this._refreshInspection();
        this._refreshEditingContext();
        return true;
    }

    // Suspends/resumes camera interaction during a marquee gesture.
    setControlsEnabled(enabled) {
        if (this._session && this._session.setControlsEnabled) {
            this._session.setControlsEnabled(enabled);
        }
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
            // 0.1.45 contract: click replaces, Ctrl/Cmd toggles,
            // Shift adds (union). All three are session state changes —
            // zero history entries.
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
        // Editing is suspended while a history preview is showing.
        if (this._historyPreview.active) {
            return false;
        }
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
        if (this._historyPreview.active) {
            return false;
        }
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
        if (this._historyPreview.active) {
            return false;
        }
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
        // Undo/redo would move the cursor the preview is based on — and
        // mutate the live world the user expects to come back to. Both
        // are suspended during preview.
        if (this._historyPreview.active) {
            return false;
        }
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
        if (this._historyPreview.active) {
            return false;
        }
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

    _getHistoryForDocument(documentId) {
        if (!documentId) {
            return null;
        }
        const document = this._loadedDocuments.get(documentId);
        if (!document) {
            return null;
        }
        return this._commandHistories.get(document.world.id) || null;
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
        // move/rotate/delete work even before the first placement. The
        // history's constructor captures the BASELINE snapshot here —
        // the document exactly as loaded, before any edit (0.1.40).
        const history = this._ensureCommandHistory(document.world);
        // Per-document lifecycle + dirty tracking (0.1.39).
        if (!this._documentManagers.has(documentId)) {
            const manager = new DocumentManager();
            manager.load(document, documentId);
            const untrack = manager.trackCommandHistory(history);
            this._documentManagers.set(documentId, { manager, untrack });
        }
    }

    _unloadWorld(documentId) {
        // Defensive: a preview whose document is being unloaded must end
        // first, so cancel can still reach the renderer and the world.
        if (this._historyPreview.active && this._historyPreview.documentId === documentId) {
            this.cancelHistoryPreview();
        }
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
        this._retiredHistories.delete(documentId);
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
        // Nothing is editable while a historical preview is showing.
        if (!this._editingService || this._historyPreview.active) {
            this._spatialEditingContext = SpatialEditingContext.empty();
            return;
        }
        this._spatialEditingContext = this._editingService.getEditingContext(this._spatialSelection);
    }

    _updatePlacementPreview(hitResult) {
        if (this._historyPreview.active) {
            this._clearPlacementPreview();
            return;
        }
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
        if (this._historyPreview.active) {
            this.cancelHistoryPreview();
        }
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
        this._retiredHistories.clear();
        this._loadedDocuments.clear();
        this._failedLoads.clear();
        this._spatialSelection = SpatialSelectionState.empty();
        this._spatialHover = SpatialHoverState.empty();
        this._spatialInspection = SpatialInspectionState.empty();
        this._spatialEditingContext = SpatialEditingContext.empty();
        this._spatialPlacement = SpatialPlacementState.empty();
        this._clipboard = SpatialClipboardState.empty();
        this._pasteCount = 0;
        this._activeDefinitionId = null;
        this._focusedDocumentId = null;
        this._eventBus = null;
    }
}
