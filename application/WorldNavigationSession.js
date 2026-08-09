import { CreateEventBusUseCase } from './CreateEventBusUseCase.js';
import { RenderWorldViewUseCase } from './RenderWorldViewUseCase.js';
import { Position } from '../core/Position.js';
import { CameraState } from '../renderer/CameraState.js';

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
        this._sharedEventBus = null;
    }

    start(container) {
        this.dispose();
        this._sharedEventBus = new CreateEventBusUseCase().execute();
        this._session = new RenderWorldViewUseCase().execute(
            container,
            this._sharedEventBus,
            this._registry
        );
    }

    // Position the camera at the world's layout coordinate and stream
    // everything visible from that vantage point.
    navigateToDocument(documentId) {
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

    // Reconcile the set of loaded worlds with whatever the layout
    // provider says should be visible from the current camera position.
    // Returns { loaded: string[], visible: string[] }.
    updateSpatialView() {
        if (!this._session) {
            return { loaded: [], visible: [] };
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
        const toLoad = visibleIds.filter((id) => !currentlyLoaded.has(id));
        const toUnload = Array.from(currentlyLoaded).filter(
            (id) => !visibleIds.includes(id)
        );

        for (const id of toUnload) {
            this._unloadWorld(id);
        }

        for (const id of toLoad) {
            this._loadWorld(id);
        }

        return {
            loaded: Array.from(this._loadedDocuments.keys()),
            visible: visibleIds
        };
    }

    // Returns everything the UI needs to render the spatial HUD.
    getSpatialState() {
        if (!this._session) {
            return { loaded: [], visible: [], nearby: [], cameraPosition: null };
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
            cameraPosition: cameraPos
        };
    }

    getLoadedDocuments() {
        return Array.from(this._loadedDocuments.values());
    }

    getDocumentPosition(documentId) {
        return this._worldLayoutProvider.getPosition(documentId);
    }

    _loadWorld(documentId) {
        const document = this._loadPublicationDocumentUseCase.execute(
            documentId,
            this._sharedEventBus
        );
        this._loadedDocuments.set(documentId, document);
    }

    _unloadWorld(documentId) {
        const document = this._loadedDocuments.get(documentId);
        if (document && this._session) {
            this._session.removeWorld(document.world);
        }
        this._loadedDocuments.delete(documentId);
    }

    dispose() {
        if (this._session) {
            this._session.dispose();
            this._session = null;
        }
        this._loadedDocuments.clear();
        this._sharedEventBus = null;
    }
}
