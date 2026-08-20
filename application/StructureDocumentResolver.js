import { DocumentSerializer } from '../serializer/DocumentSerializer.js';

// Resolves a StructurePlacement's documentId to the live core/World.js
// content it currently points to — reading FRESH from storage every
// call, never a cache taken at placement time. This is the whole
// mechanism behind "edit the Document, every placement reflects it":
// there is exactly one authoritative representation of a structure's
// bricks (the Document itself), and a placement never holds a second
// one. See core/StructurePlacement.js's own header and docs/Principles.md,
// "A Structure Placement References Content, It Never Copies It."
//
// Deliberately ONE level of indirection: resolve() returns the
// referenced Document's own Buildings/Bricks. It does NOT recursively
// resolve that Document's own StructurePlacements (a structure placed
// inside a structure placed inside a structure...). Nothing composes
// nested placements here — a structure-within-a-structure is not
// rendered, not a rejected position, simply not built yet. This is what
// keeps resolution cycle-free by construction: even a Document that
// (accidentally or deliberately) places itself only ever contributes its
// own direct bricks once, never an infinite regress.
//
// Mirrors application/LoadDocumentUseCase.js's dependency shape
// (StorageProvider + DocumentSerializer) but stays read-only and never
// throws — a placement whose Document has been removed from storage (or
// never existed) is not this resolver's error to raise; resolve()
// answers null and the caller (renderer/WorldRenderer.js,
// application/StructurePlacementValidator.js) decides what "nothing to
// render here" means. See docs/Principles.md, "A Missing Placement
// Target Is Absence, Not An Error" — ForkBuild has no Document deletion
// feature yet, so the only way to reach this path today is a placement
// pointing at an id that was never saved (or storage was cleared
// underneath it); the graceful-null behavior stands in for real
// delete-time placement handling until that feature exists.
export class StructureDocumentResolver {
    constructor(storageProvider, documentSerializer = new DocumentSerializer()) {
        this._storageProvider = storageProvider;
        this._documentSerializer = documentSerializer;
    }

    // Returns the referenced Document's core/World.js, or null if
    // documentId is falsy, unknown to storage, or fails to deserialize
    // (a corrupt/foreign blob under that id is treated exactly like
    // "not found," not thrown).
    resolve(documentId) {
        if (!documentId) {
            return null;
        }
        const json = this._storageProvider.load(documentId);
        if (!json) {
            return null;
        }
        try {
            return this._documentSerializer.deserialize(json).world;
        } catch (error) {
            return null;
        }
    }
}
