// Document-level actions on the World View: metadata editing, Save and Publish.
import { inject } from 'vue';
import { t } from '../../i18n/i18n.js';
import { worldBrickCount } from '../../../core/BuilderStamps.js';
export function useDocumentActions({
    activeDocumentInfo, feedback, guarded, metadataEditTarget, refreshSpatialUI, session, showMetadataEditor,
    funnelEventCounter = null
}) {
    // The bricks each build started with, to count the builder's own at publish.
    const readyMadeBricks = inject('readyMadeBricksStore', null);
    // Editing a published snapshot's metadata forks it first, so this goes through
    // guarded(). Openable from the inspected document's panel or the header (the
    // active document); metadataEditTarget records which.
    function openMetadataEditor(info) {
        if (!info) return;
        metadataEditTarget.value = info;
        showMetadataEditor.value = true;
    }

    function onSaveMetadata({ title, description, tags, license, placementPolicy }) {
        const info = metadataEditTarget.value;
        if (!info) return;
        guarded(() => session.updateDocumentMetadata(info.documentId, { title, description, tags, license, placementPolicy }));
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
            feedback.show(t('toolbar.saved'));
        });
        refreshSpatialUI();
    }

    function publishActiveDocument() {
        const info = activeDocumentInfo.value;
        if (!info) return;
        guarded(() => {
            const publication = session.publishDocument(info.documentId);
            const world = session.getDocument(info.documentId)?.world;
            funnelEventCounter?.publishedBuild(publication, worldBrickCount(world), readyMadeBricks?.placedCount(world));
            feedback.show(t('worldView.published2', { title: publication.title }));
        });
        refreshSpatialUI();
    }

    return {
        onSaveMetadata, openMetadataEditor, publishActiveDocument, saveActiveDocument
    };
}
