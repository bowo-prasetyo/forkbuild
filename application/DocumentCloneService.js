import { Document } from '../core/Document.js';
import { DocumentMetadata } from '../core/DocumentMetadata.js';
import { World } from '../core/World.js';

// The single cloning mechanism for Documents (0.1.42). Deep-clones with
// fresh identities throughout: a new world.id (the document identity),
// new building ids, new brick ids — structure and geometry preserved,
// the source document never mutated. This is the shared core of both
// "Duplicate" (World View clone) and "Fork": ForkDocumentUseCase (the
// 0.1.24 storage-loading flow) now delegates its cloning here, so the
// two operations cannot drift apart.
//
// Identity rule: independent documents never share brick ids. Cloning
// strips every instance id before rehydration so World/Building/Brick
// each regenerate a fresh UUID — the same mechanism ForkDocumentUseCase
// has used since 0.1.24, extracted here so it lives in exactly one
// place. Lineage is recorded via parentDocumentId by default; pass
// parentDocumentId: null explicitly to create an unlinked copy.
export class DocumentCloneService {
    execute(sourceDocument, { title = null, author = undefined, parentDocumentId = undefined } = {}) {
        if (!sourceDocument) {
            throw new Error('DocumentCloneService: no source document');
        }
        const worldJson = sourceDocument.world.toJSON();
        // Strip every instance ID so World, Building, and Brick all
        // regenerate fresh UUIDs. A clone is a new document, not a
        // resurrection of the old one.
        delete worldJson.id;
        for (const buildingJson of worldJson.buildings) {
            delete buildingJson.id;
            for (const brickJson of buildingJson.bricks) {
                delete brickJson.id;
            }
        }
        const clonedWorld = World.fromJSON(worldJson);
        const sourceTitle = sourceDocument.metadata.title || 'Untitled';
        const metadata = new DocumentMetadata({
            title: title !== null ? title : `Copy of ${sourceTitle}`,
            author: author === undefined ? sourceDocument.metadata.author : author,
            created: new Date(),
            modified: new Date(),
            parentDocumentId: parentDocumentId === undefined
                ? sourceDocument.world.id
                : parentDocumentId
        });
        return new Document({ world: clonedWorld, metadata });
    }
}
