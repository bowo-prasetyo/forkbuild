import { WorldFocusKind } from '../../../core/WorldFocusContext.js';
import { EditorEntryContext, EditorEntryReason, editorEntryContextToQuery } from '../../../core/EditorEntryContext.js';

// Handing off to the Editor: opening or forking an encountered publication, opening
// a structure's source document, or editing a copy of what the inspection panel shows.
export function useEditorHandoff({
    currentReturnWorld, router, session
}) {
    // Same /editor?load= navigation as PublicationCatalog's Open.
    function openEncounteredPublicationCommand(publication) {
        router.push({ path: '/editor', query: { load: publication.documentId } });
    }

    // Same /editor?fork= navigation as PublicationCatalog's Fork.
    function forkEncounteredPublicationCommand(publication) {
        router.push({ path: '/editor', query: { fork: publication.documentId, publication: publication.id } });
    }

    // "Open Source" loads the structure's document directly in the Editor (no
    // fork), so edits affect every placed instance. Contrast "Edit a Copy".
    function openStructureSource(documentId) {
        if (!documentId) {
            return;
        }
        router.push({ path: '/editor', query: { load: documentId } });
    }

    // "Edit a Copy" from the inspection panel: forks the containing World for a
    // brick or ground, or the structure's own content document for a placement.
    // Builds the EditorEntryContext by hand: camera framing always, and
    // selectAllBricks only for a placement. The return address is the focused
    // document; no focusLocationId is available here.
    function editInspectedCopy(inspection) {
        if (!inspection) {
            return;
        }
        const isPlacement = inspection.type === 'placement';
        const documentId = isPlacement ? inspection.sourceDocumentId : inspection.documentId;
        if (!documentId) {
            return;
        }
        const publication = session.getPublicationIdForDocument(documentId);
        const position = inspection.type === 'ground' ? inspection.position : inspection.worldPosition;
        const title = isPlacement ? inspection.sourceTitle : inspection.worldTitle;
        const returnWorld = currentReturnWorld();
        const entryContext = new EditorEntryContext({
            sourceDocumentId: documentId,
            focusPosition: position || null,
            selectAllBricks: isPlacement,
            title: title || '',
            kind: isPlacement ? WorldFocusKind.STRUCTURE : null,
            reason: EditorEntryReason.WORLD_VIEW_EDIT_COPY,
            returnWorldId: returnWorld.id,
            returnWorldTitle: returnWorld.title
        });
        router.push({
            path: '/editor',
            query: {
                fork: documentId,
                ...(publication ? { publication } : {}),
                ...editorEntryContextToQuery(entryContext)
            }
        });
    }

    return {
        editInspectedCopy, forkEncounteredPublicationCommand, openEncounteredPublicationCommand, openStructureSource
    };
}
