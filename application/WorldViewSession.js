import { CreateEventBusUseCase } from './CreateEventBusUseCase.js';
import { RenderWorldViewUseCase } from './RenderWorldViewUseCase.js';

export class WorldViewSession {
    constructor({ registry, loadPublicationDocumentUseCase }) {
        this._registry = registry;
        this._loadPublicationDocumentUseCase = loadPublicationDocumentUseCase;
        this._session = null;
    }

    viewDocument(container, documentId) {
        this.dispose();

        const eventBus = new CreateEventBusUseCase().execute();
        this._session = new RenderWorldViewUseCase().execute(container, eventBus, this._registry);

        const document = this._loadPublicationDocumentUseCase.execute(documentId, eventBus);
        return document;
    }

    dispose() {
        if (this._session) {
            this._session.dispose();
            this._session = null;
        }
    }
}
