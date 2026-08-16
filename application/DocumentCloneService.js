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
    // Hardening (post-0.2.22): `eventBus` — pass the LIVE session's event bus (the same
    // one the active WorldRenderer/EditorSession already subscribed
    // to) so the clone's bricks stay wired for live rendering. Without
    // it, World.fromJSON builds bricks with no eventBus at all, so any
    // later mutation (moveSelection, rotate, ...) never publishes a
    // BRICK_UPDATED event — the domain model updates correctly, but no
    // renderer ever hears about it, and the mesh freezes at wherever
    // addWorld first placed it. EditorSession's own openDocument() has
    // always re-hydrated a fork/duplicate with a fresh eventBus before
    // handing it to the renderer for exactly this reason; World View's
    // fork-on-edit (WorldNavigationSession._forkForEdit) hands this
    // method's result straight to the renderer with no such rebuild
    // step, so it — not the caller — has to be the one that wires it
    // correctly. Defaults to null (no live updates) so callers that
    // genuinely don't have a session-level bus yet (e.g. a document
    // about to be serialized straight back to storage) are unaffected.
    execute(sourceDocument, { title = null, description = undefined, author = undefined, parentDocumentId = undefined, license = undefined, eventBus = null } = {}) {
        if (!sourceDocument) throw new Error('DocumentCloneService: no source document');

        const worldJson = sourceDocument.world.toJSON();
        delete worldJson.id;
        for (const buildingJson of worldJson.buildings) {
            delete buildingJson.id;
            for (const brickJson of buildingJson.bricks) {
                delete brickJson.id;
            }
        }
        const clonedWorld = World.fromJSON(worldJson, eventBus);
        const sourceTitle = sourceDocument.metadata.title || 'Untitled';

        // Determine license: explicit option > source license > default
        const nextLicense = license !== undefined ? license : sourceDocument.metadata.license;

        const metadata = new DocumentMetadata({
            title: title !== null ? title : `Copy of ${sourceTitle}`,
            // 0.2.21: a description is part of what "the same content,
            // fresh identity" means — carried through exactly like
            // license, not reset to empty just because the ids are new.
            description: description === undefined ? sourceDocument.metadata.description : description,
            author: author === undefined ? sourceDocument.metadata.author : author,
            created: new Date(),
            modified: new Date(),
            parentDocumentId: parentDocumentId === undefined ? sourceDocument.world.id : parentDocumentId,
            license: nextLicense
        });
        return new Document({ world: clonedWorld, metadata });
    }
}
