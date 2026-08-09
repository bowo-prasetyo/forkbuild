import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

export class LoadPublicationDocumentUseCase {
    constructor(storageProvider, documentSerializer = new DocumentSerializer()) {
        this._storageProvider = storageProvider;
        this._documentSerializer = documentSerializer;
    }

    execute(documentId, eventBus = null) {
        const json = this._storageProvider.load(documentId);
        if (json === null) {
            throw new Error(`LoadPublicationDocumentUseCase: no document found with id "${documentId}"`);
        }
        return this._documentSerializer.deserialize(json, eventBus);
    }
}
