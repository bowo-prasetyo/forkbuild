import { RenderWorldViewUseCase } from './RenderWorldViewUseCase.js';
import { Position } from '../core/Position.js';
import { CameraState } from '../renderer/CameraState.js';
import { SpatialSelectionState } from './spatial-state/SpatialSelectionState.js';

const STREAMING_RADIUS = 150;
const NAVIGATION_RADIUS = 80;
const CAMERA_OFFSET = 35;

export class WorldNavigationSession {
    constructor({ registry, loadPublicationDocumentUseCase, worldLayoutProvider }) {
        this._registry = registry;
        this._loadPublicationDocumentUseCase = loadPublicationDocumentUseCase;
        this._worldLayoutProvider = worldLayoutProvider;
        this._session = null;
        this._loadedDocuments = new Map();
        this._failedLoads = new Set();
        this._spatialSelection = SpatialSelectionState.empty();
    }

    start(container) {
        this.dispose();
        this._session = new RenderWorldViewUseCase().execute(
            container,
            this._registry
        );
    }

    // Client-side spatial navigation: move camera to the world's layout
    // coordinate and stream it in. No page reload.
    focusDocument(documentId) {
        const layoutPos = this._worldLayoutProvider.getPosition(documentId);
        const cameraPos = new Position(
            layoutPos.x + CAMERA_OFFSET,
            layoutPos.y + CAMERA_OFFSET,
            layoutPos.z + CAMERA_OFFSET
        );
        const targetPos = new Position(layoutPos.x, layoutPos.y, layoutPos.z);

        this._session.setCameraState(new CameraState({
            position: cameraPos,
            target: targetPos,
            zoom: 1
        }));

        return this.updateSpatialView();
    }

    // Legacy entry point for deep-linking: start session + focus.
    navigateToDocument(documentId) {
        return this.focusDocument(documentId);
    }

    // Reconcile the set of loaded worlds with whatever the layout
    // provider says should be visible from the current camera position.
    // Returns { loaded: string[], visible: string[] }.
    updateSpatialView() {
        if (!this._session) {
            return { loaded: [], visible: [], failed: Array.from(this._failedLoads) };
        }

        const cameraState = this._session.getCameraState();
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
        const toLoad = visibleIds.filter(
            (id) => !currentlyLoaded.has(id) && !this._failedLoads.has(id)
        );
        const toUnload = Array.from(currentlyLoaded).filter(
            (id) => !visibleIds.includes(id)
        );

        for (const id of toUnload) {
            this._unloadWorld(id);
        }

        for (const id of toLoad) {
            try {
                this._loadWorld(id);
            } catch (err) {
                console.warn(`WorldNavigationSession: failed to load world ${id} — ${err.message}`);
                this._failedLoads.add(id);
            }
        }

        return {
            loaded: Array.from(this._loadedDocuments.keys()),
            visible: visibleIds,
            failed: Array.from(this._failedLoads)
        };
    }

    // Spatial picking: translates renderer hits into domain identity.
    pick(screenX, screenY) {
        if (!this._session) {
            return null;
        }

        const brickHit = this._session.pick(screenX, screenY);
        if (brickHit) {
            this._setSpatialSelection(SpatialSelectionState.brick(brickHit));
            this._session.highlightBrick(brickHit.brickId);
            return this._spatialSelection;
        }

        const groundHit = this._session.pickGround(screenX, screenY);
        if (groundHit) {
            this._setSpatialSelection(SpatialSelectionState.ground(groundHit.position));
            this._session.clearHighlight();
            return this._spatialSelection;
        }

        this._setSpatialSelection(SpatialSelectionState.empty());
        this._session.clearHighlight();
        return null;
    }

    clearSelection() {
        this._setSpatialSelection(SpatialSelectionState.empty());
        if (this._session) {
            this._session.clearHighlight();
        }
    }

    getSpatialSelection() {
        return this._spatialSelection;
    }

    // Returns everything the UI needs to render the spatial HUD.
    getSpatialState() {
        if (!this._session) {
            return { loaded: [], visible: [], nearby: [], failed: [], cameraPosition: null };
        }

        const cameraState = this._session.getCameraState();
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
            failed: Array.from(this._failedLoads),
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
        const document = this._loadedDocuments.get(documentId);
        if (document && this._session) {
            this._session.removeWorld(document.world);
        }
        this._loadedDocuments.delete(documentId);
    }

    _setSpatialSelection(selection) {
        this._spatialSelection = selection;
    }

    dispose() {
        if (this._session) {
            this._session.dispose();
            this._session = null;
        }
        this._loadedDocuments.clear();
        this._failedLoads.clear();
        this._spatialSelection = SpatialSelectionState.empty();
    }
}
