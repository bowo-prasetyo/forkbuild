// Actions on the current selection: structure placements (move, rotate, duplicate, delete,
// open source), groups, repeat and recolor, plus the summaries the sidebar shows for it.
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
            ? `Repeated ${options.count} ${options.count === 1 ? 'copy' : 'copies'}`
            : 'Repeat blocked — check the count/offset, or that the copies fit');
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
            feedback.show('That position is occupied — X/Z left unchanged');
        } else if (result.moved || result.rotated) {
            feedback.show('Updated instance transform');
        }
    }

    function duplicateSelectedPlacement() {
        const newId = editorSession.duplicateSelection();
        if (newId) {
            feedback.show('Copy created — R to rotate, drag to move');
        }
    }

    function deleteSelectedPlacement() {
        if (editorSession.deleteSelection()) {
            feedback.show('Deleted structure instance');
        }
    }

    // Called directly by the color swatch: picking a color is a live widget, not a
    // no-argument command.
    function recolorSelection(color) {
        if (editorSession.recolorSelection(color)) {
            feedback.show('Recolored selection');
        }
    }

    // Opens the referenced Document; never mutates the instance.
    function editSelectedPlacementSource() {
        const info = selectedPlacementInfo.value;
        if (!info) {
            return;
        }
        editorSession.editStructurePlacementSource(info.documentId);
        feedback.show(`Editing "${info.title}"`);
    }

    return {
        applySelectedPlacementTransform, deleteSelectedPlacement, duplicateSelectedPlacement,
        editSelectedPlacementSource, recolorSelection, refreshSelectedPlacementInfo, refreshSelectionSummary,
        repeatSelection, rotateSelectedPlacement, selectGroup
    };
}
