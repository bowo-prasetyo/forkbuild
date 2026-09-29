// Actions on the current selection: structure placements (move, rotate, duplicate, delete,
// open source), groups, repeat and recolor, plus the summaries the sidebar shows for it.
import { t } from '../../i18n/i18n.js';
export function useSelectionActions({
    documentVersion, editorContext, editorSession, feedback, selectedPlacementInfo, selectionSummary
}) {
    // Moving or rotating the same selected placement fires no SELECTION_CHANGED,
    // so every such path calls this to keep the inspector's numbers live.
    function refreshSelectedPlacementInfo() {
        if (editorContext.selection.isStructurePlacementSelection) {
            selectedPlacementInfo.value = editorSession.getSelectedPlacementInfo();
        }
    }

    // Same reason, for brick selections.
    function refreshSelectionSummary() {
        if (!editorContext.selection.isEmpty && !editorContext.selection.isStructurePlacementSelection) {
            selectionSummary.value = editorSession.getSelectionSummary();
        }
    }

    function repeatSelection(options) {
        const repeated = editorSession.repeatSelection(options);
        feedback.show(repeated
            ? t('editor.repeated', { count: options.count })
            : t('editor.repeatBlocked'));
        refreshSelectionSummary();
    }

    // Group actions read EditorSession's selected group, which only this sets.
    // selectGroup() runs no command, so documentVersion is bumped to make the
    // sidebar notice.
    function selectGroup(groupId) {
        editorSession.selectGroup(groupId);
        documentVersion.value++;
    }

    function rotateSelectedPlacement(deltaRotation) {
        editorSession.rotateSelection(deltaRotation);
        refreshSelectedPlacementInfo();
    }

    function applySelectedPlacementTransform(payload) {
        const result = editorSession.applyPlacementTransform(payload);
        refreshSelectedPlacementInfo();
        if (result.blocked) {
            feedback.show(t('editor.positionOccupied'));
        } else if (result.moved || result.rotated) {
            feedback.show(t('editor.instanceUpdated'));
        }
    }

    function duplicateSelectedPlacement() {
        const newId = editorSession.duplicateSelection();
        if (newId) {
            feedback.show(t('editorAction.selection.duplicate.done'));
        }
    }

    function deleteSelectedPlacement() {
        if (editorSession.deleteSelection()) {
            feedback.show(t('editor.instanceDeleted'));
        }
    }

    // Called directly by the color swatch: picking a color is a live widget, not a
    // no-argument command.
    function recolorSelection(color) {
        if (editorSession.recolorSelection(color)) {
            feedback.show(t('editor.recolored'));
        }
    }

    // Opens the referenced Document; never mutates the instance.
    function editSelectedPlacementSource() {
        const info = selectedPlacementInfo.value;
        if (!info) {
            return;
        }
        editorSession.editStructurePlacementSource(info.documentId);
        feedback.show(t('editor.editingTitle', { title: info.title }));
    }

    return {
        applySelectedPlacementTransform, deleteSelectedPlacement, duplicateSelectedPlacement,
        editSelectedPlacementSource, recolorSelection, refreshSelectedPlacementInfo, refreshSelectionSummary,
        repeatSelection, rotateSelectedPlacement, selectGroup
    };
}
