import { RenderWorldViewUseCase } from './RenderWorldViewUseCase.js';
import { Position } from '../core/Position.js';
import { SpatialSelectionState } from './spatial-state/SpatialSelectionState.js';
import { SpatialHoverState } from './spatial-state/SpatialHoverState.js';
import { SpatialCameraController } from './SpatialCameraController.js';

const STREAMING_RADIUS = 150;
const NAVIGATION_RADIUS = 80;

const RETRY_DELAYS = [2000, 5000, 10000];

export class WorldNavigationSession {
    constructor({ registry, loadPublicationDocumentUseCase, worldLayoutProvider }) {
        this._registry = registry;
        this._loadPublicationDocumentUseCase = loadPublicationDocumentUseCase;
        this._worldLayoutProvider = worldLayoutProvider;
        this._session = null;
        this._spatialCameraController = null;
        this._loadedDocuments = new Map();
        this._failedLoads = new Map(); // documentId -> { attempts, lastAttemptAt }
        this._spatialSelection = SpatialSelectionState.empty();
        this._spatialHover = SpatialHoverState.empty();
    }

    start(container) {
        this.dispose();
        this._session = new RenderWorldViewUseCase().execute(
            container,
            this._registry
        );
        this._spatialCameraController = new SpatialCameraController(this._session);
    }

    // Client-side spatial navigation: move camera to the world's layout
    // coordinate and stream it in. No page reload.
    focusDocument(documentId) {
        const layoutPos = this._worldLayoutProvider.getPosition(documentId);
        this._spatialCameraController.focusDocument(documentId, layoutPos);
        return this.updateSpatialView();
    }

    // Legacy entry point for deep-linking: start session + focus.
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
    updateSpatialView() {
        if (!this._session) {
            return { loaded: [], visible: [], failed: this._getFailedIds() };
        }

        const cameraState = this._spatialCameraController.getSpatialCameraState();
        const cameraPos = new Position(cameraState.position.x, cameraState.position.y, cameraState.position.z);

        const visibleIds = this._worldLayoutProvider.findVisibleDocuments(
            cameraPos,
            STREAMING_RADIUS
        );

        const currentlyLoaded = new Set(this._loadedDocuments.keys());
        const toUnload = Array.from(currentlyLoaded).filter(
            (id) => !visibleIds.includes(id)
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

    pick(screenX, screenY) {
        if (!this._session) {
            return null;
        }

        const brickHit = this._session.pick(screenX, screenY);
        if (brickHit) {
            this._setSpatialSelection(SpatialSelectionState.brick(brickHit));
            this._session.selectBrick(brickHit.brickId);
            this._session.clearHover();
            return this._spatialSelection;
        }

        const groundHit = this._session.pickGround(screenX, screenY);
        if (groundHit) {
            this._setSpatialSelection(SpatialSelectionState.ground(groundHit.position));
            this._session.clearSelection();
            this._session.clearHover();
            return this._spatialSelection;
        }

        this._setSpatialSelection(SpatialSelectionState.empty());
        this._session.clearSelection();
        this._session.clearHover();
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
            return hover;
        }

        const groundHit = this._session.pickGround(screenX, screenY);
        if (groundHit) {
            const hover = SpatialHoverState.ground(groundHit.position);
            this._setSpatialHover(hover);
            this._session.clearHover();
            return hover;
        }

        this._setSpatialHover(SpatialHoverState.empty());
        this._session.clearHover();
        return null;
    }

    clearSelection() {
        this._setSpatialSelection(SpatialSelectionState.empty());
        if (this._session) {
            this._session.clearSelection();
        }
    }

    getSpatialSelection() {
        return this._spatialSelection;
    }

    getSpatialHover() {
        return this._spatialHover;
    }

    // Returns everything the UI needs to render the spatial HUD.
    getSpatialState() {
        if (!this._session) {
            return { loaded: [], visible: [], nearby: [], failed: [], cameraPosition: null };
        }

        const cameraState = this._spatialCameraController.getSpatialCameraState();
        const cameraPos = new Position(cameraState.position.x, cameraState.position.y, cameraState.position.z);

        const visible = this._worldLayoutProvider.findVisibleDocuments(cameraPos, STREAMING_RADIUS);
        const nearby = this._worldLayoutProvider.findVisibleDocuments(cameraPos, NAVIGATION_RADIUS);

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

    _loadWorld(documentId) {
        const document = this._loadPublicationDocumentUseCase.execute(documentId);
        this._loadedDocuments.set(documentId, document);
        this._session.addWorld(document.world, documentId);
    }

    _unloadWorld(documentId) {
        // Spatial Selection Invariant: clear selection/hover if they
        // reference the document that is being unloaded.
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
        if (document && this._session) {
            this._session.removeWorld(document.world);
        }
        this._loadedDocuments.delete(documentId);
    }

    _setSpatialSelection(selection) {
        this._spatialSelection = selection;
    }

    _setSpatialHover(hover) {
        this._spatialHover = hover;
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
        this._loadedDocuments.clear();
        this._failedLoads.clear();
        this._spatialSelection = SpatialSelectionState.empty();
        this._spatialHover = SpatialHoverState.empty();
    }
}
