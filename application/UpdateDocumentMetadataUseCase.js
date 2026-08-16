// 0.2.21: the Editor-side entry point for editing a document's
// title/description/license through the Document Properties UI. The
// World View equivalent is WorldNavigationSession.updateDocumentMetadata
// — that one also has to decide whether the target needs to fork
// first (0.2.20), which the Editor's single always-mutable document
// never does, so the two aren't merged into one class.
//
// Deliberately thin: DocumentMetadata's setters already do the actual
// mutation (0.2.21) — this only orchestrates "apply the fields the
// caller actually passed, stamp modified once, mark the document
// dirty" exactly the way SaveDocumentUseCase orchestrates
// documentManager.markSaved() rather than folding it into a setter.
export class UpdateDocumentMetadataUseCase {
    execute(documentManager, { title, description, license } = {}) {
        const document = documentManager.document;
        if (!document) {
            throw new Error('UpdateDocumentMetadataUseCase: no document is currently open');
        }
        const metadata = document.metadata;
        if (title !== undefined) metadata.title = title;
        if (description !== undefined) metadata.description = description;
        if (license !== undefined) metadata.license = license;
        metadata.touch();
        documentManager.markDirty();
        return metadata;
    }
}
