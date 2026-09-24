// Document-level actions on the World View: metadata editing, Save and Publish.
export function useDocumentActions({
    activeDocumentInfo, feedback, guarded, metadataEditTarget, refreshSpatialUI, session, showMetadataEditor
}) {
    // Editing a published snapshot's metadata forks it first, so this goes through
    // guarded(). Openable from the inspected document's panel or the header (the
    // active document); metadataEditTarget records which.
    function openMetadataEditor(info) {
        if (!info) return;
        metadataEditTarget.value = info;
        showMetadataEditor.value = true;
    }

    function onSaveMetadata({ title, description, license }) {
        const info = metadataEditTarget.value;
        if (!info) return;
        guarded(() => session.updateDocumentMetadata(info.documentId, { title, description, license }));
        showMetadataEditor.value = false;
        metadataEditTarget.value = null;
        refreshSpatialUI();
    }

    // Bound to the ACTIVE document, never the inspected one: save/publish must be
    // unambiguous about which document it acts on.
    function saveActiveDocument() {
        const info = activeDocumentInfo.value;
        if (!info) return;
        guarded(() => {
            session.saveDocument(info.documentId);
            feedback.show('Saved');
        });
        refreshSpatialUI();
    }

    function publishActiveDocument() {
        const info = activeDocumentInfo.value;
        if (!info) return;
        guarded(() => {
            const publication = session.publishDocument(info.documentId);
            feedback.show(`Published "${publication.title}"`);
        });
        refreshSpatialUI();
    }

    return {
        onSaveMetadata, openMetadataEditor, publishActiveDocument, saveActiveDocument
    };
}
