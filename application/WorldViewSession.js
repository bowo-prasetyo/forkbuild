import { CreateEventBusUseCase } from './CreateEventBusUseCase.js';
import { RenderWorldViewUseCase } from './RenderWorldViewUseCase.js';
import { Position } from '../core/Position.js';
import { CameraState } from '../renderer/CameraState.js';

const CAMERA_HEIGHT_OFFSET = 25;
const CAMERA_DISTANCE_OFFSET = 30;

export class WorldViewSession {
    constructor({ registry, loadPublicationDocumentUseCase, worldLayoutProvider }) {
        this._registry = registry;
        this._loadPublicationDocumentUseCase = loadPublicationDocumentUseCase;
        this._worldLayoutProvider = worldLayoutProvider;
        this._session = null;
        this._loadedWorlds = new Map();
    }

    viewDocument(container, documentId) {
        this.dispose();

        const eventBus = new CreateEventBusUseCase().execute();
        this._session = new RenderWorldViewUseCase().execute(container, eventBus, this._registry);

        const document = this._loadPublicationDocumentUseCase.execute(documentId, eventBus);
        this._loadedWorlds.set(documentId, document.world);

        const layoutPos = this._worldLayoutProvider.getPosition(documentId);
        const cameraPos = new Position(
            layoutPos.x + CAMERA_DISTANCE_OFFSET,
            layoutPos.y + CAMERA_HEIGHT_OFFSET,
            layoutPos.z + CAMERA_DISTANCE_OFFSET
        );
        const targetPos = new Position(layoutPos.x, layoutPos.y, layoutPos.z);

        this._session.setCameraState(new CameraState({
            position: cameraPos,
            target: targetPos,
            zoom: 1
        }));

        return document;
    }

    getNearbyDocuments(documentId, radius = 100) {
        const pos = this._worldLayoutProvider.getPosition(documentId);
        const viewCenter = new Position(pos.x, pos.y, pos.z);
        return this._worldLayoutProvider.findVisibleDocuments(viewCenter, radius)
            .filter((id) => id !== documentId);
    }

    getDocumentPosition(documentId) {
        return this._worldLayoutProvider.getPosition(documentId);
    }

    dispose() {
        if (this._session) {
            this._session.dispose();
            this._session = null;
        }
        this._loadedWorlds.clear();
    }
}
