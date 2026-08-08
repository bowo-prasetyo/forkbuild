import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';
import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// Creates a new Document derived from an existing one. The source is
// loaded from storage by its world id (publication.documentId), then
// deeply cloned with fresh instance identities. The result is an
// ordinary editable Document with parentDocumentId set, ready to be
// opened by EditorSession.
export class ForkDocumentUseCase {
    constructor(storageProvider, documentSerializer = new DocumentSerializer()) {
        this._storageProvider = storageProvider;
        this._documentSerializer = documentSerializer;
    }

    execute(sourceDocumentId, identityProvider = null) {
        const json = this._storageProvider.load(sourceDocumentId);
        if (json === null) {
            throw new Error(`ForkDocumentUseCase: no document found with id "${sourceDocumentId}"`);
        }

        const sourceDocument = this._documentSerializer.deserialize(json);
        return this._createFork(sourceDocument, identityProvider);
    }

    _createFork(sourceDocument, identityProvider) {
        const worldJson = sourceDocument.world.toJSON();

        // Strip every instance ID so World, Building, and Brick all
        // regenerate fresh UUIDs. A fork is a new document, not a
        // resurrection of the old one.
        delete worldJson.id;
        for (const buildingJson of worldJson.buildings) {
            delete buildingJson.id;
            for (const brickJson of buildingJson.bricks) {
                delete brickJson.id;
            }
        }

        const forkedWorld = World.fromJSON(worldJson);

        const currentUser = identityProvider ? identityProvider.currentUser() : null;
        const sourceTitle = sourceDocument.metadata.title || 'Untitled';
        const metadata = new DocumentMetadata({
            title: `Fork of ${sourceTitle}`,
            author: currentUser ? currentUser.username : null,
            created: new Date(),
            modified: new Date(),
            parentDocumentId: sourceDocument.world.id
        });

        return new Document({ world: forkedWorld, metadata });
    }
}
