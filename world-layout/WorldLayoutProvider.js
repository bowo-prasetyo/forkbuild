// Base class every world layout adapter extends. Answers "Where do
// published worlds exist in a shared spatial coordinate system?"
// It does NOT load Documents — that is LoadPublicationDocumentUseCase's
// job. It only answers spatial questions: given a camera/view region,
// which documents are visible? Given a documentId, where is it?
export class WorldLayoutProvider {
    // viewCenter: core/Position
    // viewRadius: number (world units)
    // Returns: string[] of documentIds
    findVisibleDocuments(viewCenter, viewRadius) {
        throw new Error('WorldLayoutProvider.findVisibleDocuments() must be implemented by a subclass');
    }

    // Returns: core/WorldPosition
    getPosition(documentId) {
        throw new Error('WorldLayoutProvider.getPosition() must be implemented by a subclass');
    }
}
