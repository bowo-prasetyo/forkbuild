

// The active World's own publication: the placement editor, unpublish/place,
// commentary and placement commands, and the notification history panel.
export function useOwnPublicationActions({
    feedback, focusWorld, guarded, placementEditTarget, placementOverlapWarning, refreshSpatialUI, session,
    showNotificationHistoryPanel, showPlacementEditor
}) {
    // Moving a placement is not a document mutation (docs/Principles.md, "Moving A
    // Placement Is Not Editing A Document"), so it skips fork-on-write; guarded()
    // only turns failures into messages.
    function openPlacementEditor(info) {
        if (!info) return;
        placementEditTarget.value = info;
        placementOverlapWarning.value = null;
        showPlacementEditor.value = true;
    }

    function closePlacementEditor() {
        showPlacementEditor.value = false;
        placementEditTarget.value = null;
        placementOverlapWarning.value = null;
    }

    // Two-step for an occupied destination: check first, and move only once clear
    // or after the warning was confirmed by a second click. The check never
    // mutates (docs/Principles.md, "Overlap Is A Fact; Collision Is A Policy
    // Decision").
    function onMovePlacement(position) {
        const info = placementEditTarget.value;
        if (!info) return;

        // A warning only confirms the exact position it was computed for.
        const pending = placementOverlapWarning.value;
        const pendingPosition = pending && pending.overlap ? pending.overlap.position : null;
        const warningMatchesRequest = !!pendingPosition
            && pendingPosition.x === position.x && pendingPosition.y === position.y && pendingPosition.z === position.z;

        if (!warningMatchesRequest) {
            const check = guarded(() => session.checkPlacementOverlap(info.documentId, position));
            if (check && check.requiresConfirmation) {
                placementOverlapWarning.value = check;
                return;
            }
            placementOverlapWarning.value = null;
            if (check && !check.allowed) {
                feedback.show('This position is not available.');
                return;
            }
        }

        guarded(() => {
            session.movePlacement(info.documentId, position);
            feedback.show('Placement moved');
        });
        closePlacementEditor();
        refreshSpatialUI();
    }

    // Passes placementId as a compare-and-swap guard, so a placement replaced
    // since the panel rendered is never removed by mistake. No local state: the
    // next refresh derives placementInfo as null.
    function removePlacementFromPanel(info) {
        if (!info) return;
        guarded(() => {
            session.removePlacement(info.documentId, info.placementId);
            feedback.show('Placement removed from World');
        });
        refreshSpatialUI();
    }

    // Passes publication.id as the same compare-and-swap guard. No local state:
    // the next refresh derives ownPublication as null.
    function unpublishOwnPublication(publication) {
        if (!publication) return;
        guarded(() => {
            const removed = session.unpublishDocument(publication.documentId, publication.id);
            if (removed) {
                feedback.show('Publication unpublished');
            }
        });
        refreshSpatialUI();
    }

    // Resolves only where "here" is: avatar position, else camera position, else
    // the World origin.
    function placeOwnPublication(publication) {
        if (!publication) return;
        guarded(() => {
            const position = session.getAvatarPosition() || session.getCameraPosition() || { x: 0, y: 0, z: 0 };
            session.placePublication(publication.id, position);
            feedback.show('Publication placed in World');
        });
        refreshSpatialUI();
    }

    // Errors are deliberately not caught here: the panels render them as their
    // own error state. Also bound to WorldEncounterCanvas.
    function getPublicationCommentariesCommand(publicationId) {
        return session.getPublicationCommentaries(publicationId);
    }

    // Forwards commentaryId/createdAt for idempotent retries.
    function addPublicationCommentaryCommand({ publicationId, content, commentaryId, createdAt }) {
        return session.addPublicationCommentary({ publicationId, content, commentaryId, createdAt });
    }

    // Errors are left for OwnPublicationPanel to show, distinct from an empty [].
    function getPublicationPlacementsCommand(publicationId) {
        return session.getPlacementsForPublication(publicationId);
    }

    // Errors are left for NotificationHistoryPanel to show.
    function getRecipientNotificationEventsCommand() {
        return session.getRecipientNotificationEvents();
    }

    function openNotificationHistoryPanel() {
        showNotificationHistoryPanel.value = true;
    }

    function closeNotificationHistoryPanel() {
        showNotificationHistoryPanel.value = false;
    }

    // Navigates via focusWorld(), the one mechanism that changes the active
    // document inside a live WorldView; a bare router.push() would do nothing here
    // because route changes follow session state, not the reverse. An unknown
    // Publication returns false.
    function viewNotificationPublicationCommand(publicationId) {
        const publication = session.findPublicationById(publicationId);
        if (!publication || !publication.documentId) {
            return false;
        }
        focusWorld(publication.documentId);
        closeNotificationHistoryPanel();
        return true;
    }

    return {
        openPlacementEditor, closePlacementEditor, onMovePlacement, removePlacementFromPanel,
        unpublishOwnPublication, placeOwnPublication, getPublicationCommentariesCommand,
        addPublicationCommentaryCommand, getPublicationPlacementsCommand,
        getRecipientNotificationEventsCommand, openNotificationHistoryPanel, closeNotificationHistoryPanel,
        viewNotificationPublicationCommand
    };
}
