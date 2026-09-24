import { ref } from 'vue';

// The World history panel and Undo/Redo: timeline, preview, restore.
export function useWorldHistoryPanel({
    activeDocumentInfo, feedback, guarded, refreshSpatialUI, session
}) {
    const showHistoryPanel = ref(false);
    const historyPanelDocumentId = ref(null);
    const historyTimeline = ref([]);
    const selectedHistoryEntryId = ref(null);
    // Mirrored only for highlighting; the session's own preview state is the source
    // of truth.
    const historyPreviewCursor = ref(null);

    // Re-read every refresh from the session, never computed here.
    const canUndo = ref(false);
    const canRedo = ref(false);
    const undoLabel = ref(null);
    const redoLabel = ref(null);

    function openHistoryPanel() {
        const info = activeDocumentInfo.value;
        if (!info) return;
        historyPanelDocumentId.value = info.documentId;
        selectedHistoryEntryId.value = null;
        historyPreviewCursor.value = null;
        historyTimeline.value = session.getTimeline(info.documentId);
        showHistoryPanel.value = true;
    }

    function closeHistoryPanel() {
        // Always cancel a preview before its panel closes, or the replay world would
        // stay rendered with no way to end it.
        if (historyPreviewCursor.value !== null) {
            guarded(() => session.cancelHistoryPreview());
        }
        showHistoryPanel.value = false;
        historyPanelDocumentId.value = null;
        historyTimeline.value = [];
        selectedHistoryEntryId.value = null;
        historyPreviewCursor.value = null;
    }

    function selectHistoryEntry(entryId) {
        selectedHistoryEntryId.value = entryId;
    }

    // Re-reads the timeline and resolves the selected entry's id (never a
    // remembered index): edits made while the panel was open can move or remove
    // it. A missing entry clears the selection and is reported. The cursor is
    // entry.index + 1 ("this entry applied").
    function _resolveSelectedHistoryCursor() {
        const docId = historyPanelDocumentId.value;
        if (!docId || !selectedHistoryEntryId.value) return null;
        const fresh = session.getTimeline(docId);
        historyTimeline.value = fresh;
        const entry = fresh.find((candidate) => candidate.id === selectedHistoryEntryId.value);
        if (!entry) {
            selectedHistoryEntryId.value = null;
            feedback.show('That history entry no longer exists — the timeline has changed');
            return null;
        }
        return entry.index + 1;
    }

    function previewSelectedHistoryEntry() {
        const docId = historyPanelDocumentId.value;
        if (!docId || docId !== session.getActiveDocumentId()) {
            feedback.show('The active document changed — reopen History to preview it');
            return;
        }
        const cursor = _resolveSelectedHistoryCursor();
        if (cursor === null) return;
        guarded(() => {
            if (historyPreviewCursor.value === null) {
                session.beginHistoryPreview();
            }
            session.previewHistoryAt(cursor);
            historyPreviewCursor.value = cursor;
        });
    }

    function cancelHistoryPreviewAction() {
        guarded(() => session.cancelHistoryPreview());
        historyPreviewCursor.value = null;
    }

    function restoreSelectedHistoryEntry() {
        const docId = historyPanelDocumentId.value;
        const cursor = _resolveSelectedHistoryCursor();
        if (cursor === null) return;
        // restoreHistoryAt() ends any preview itself.
        const restored = guarded(() => {
            session.restoreHistoryAt(cursor, docId);
            return true;
        });
        if (!restored) return;
        feedback.show('Restored to an earlier point in history');
        closeHistoryPanel();
        refreshSpatialUI();
    }

    // Thin wrappers over the session's undo()/redo(), sharing the History panel's
    // CommandHistory. canUndo/canRedo already read false during a preview.
    function undoAction() {
        const performed = guarded(() => session.undo());
        if (performed) {
            feedback.show('Undone');
        }
        refreshSpatialUI();
    }

    function redoAction() {
        const performed = guarded(() => session.redo());
        if (performed) {
            feedback.show('Redone');
        }
        refreshSpatialUI();
    }

    return {
        showHistoryPanel, historyPanelDocumentId, historyTimeline, selectedHistoryEntryId,
        historyPreviewCursor, canUndo, canRedo, undoLabel, redoLabel, openHistoryPanel, closeHistoryPanel,
        selectHistoryEntry, _resolveSelectedHistoryCursor, previewSelectedHistoryEntry,
        cancelHistoryPreviewAction, restoreSelectedHistoryEntry, undoAction, redoAction
    };
}
