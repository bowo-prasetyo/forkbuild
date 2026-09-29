import { ref } from 'vue';
import { detectSpatialOverlap } from '../../../core/SpatialOverlap.js';
import { formatNumber, t } from '../../i18n/i18n.js';

function formatPosition(position) {
    return t('units.coordinates', { x: formatNumber(position.x, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }), y: formatNumber(position.y, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }), z: formatNumber(position.z, { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }) });
}

// The active World's own publication: the placement editor, unpublish/place,
// and commentary and placement commands. (Notification History lives in the app's
// header: ui/App.js.)
export function useOwnPublicationActions({
    feedback, guarded, placementEditTarget, placementOverlapWarning, refreshSpatialUI, session,
    showPlacementEditor
}) {
    // Bumped after every placement change made here, so OwnPublicationPanel
    // re-reads its Placements list (a move finishes in a dialog it never sees).
    const placementsRevision = ref(0);

    // A target from the Placements list carries no documentId: it names its
    // placement by publicationId + placementId, which a Publication placed
    // several times needs. The inspection panel's target keeps the documentId path.
    function checkMove(info, position) {
        return info.documentId
            ? session.checkPlacementOverlap(info.documentId, position)
            : session.checkPublicationPlacementOverlap(info.publicationId, info.placementId, position);
    }

    function applyMove(info, position) {
        return info.documentId
            ? session.movePlacement(info.documentId, position)
            : session.movePublicationPlacement(info.publicationId, info.placementId, position);
    }

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
            const check = guarded(() => checkMove(info, position));
            if (check && check.requiresConfirmation) {
                placementOverlapWarning.value = check;
                return;
            }
            placementOverlapWarning.value = null;
            if (check && !check.allowed) {
                feedback.show(t('worldView.thisPositionIsNotAvailable'));
                return;
            }
        }

        guarded(() => {
            applyMove(info, position);
            feedback.show(t('worldView.placementMoved'));
        });
        placementsRevision.value += 1;
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
            feedback.show(t('worldView.placementRemovedFromWorld'));
        });
        placementsRevision.value += 1;
        refreshSpatialUI();
    }

    // One row of the Placements list: removes exactly that placement.
    function removePublicationPlacement(placement) {
        if (!placement) return;
        guarded(() => {
            session.removePublicationPlacement(placement.publicationId, placement.placementId);
            feedback.show(t('worldView.placementRemovedFromWorld'));
        });
        placementsRevision.value += 1;
        refreshSpatialUI();
    }

    // Passes publication.id as the same compare-and-swap guard. No local state:
    // the next refresh derives ownPublication as null.
    function unpublishOwnPublication(publication) {
        if (!publication) return;
        guarded(() => {
            const removed = session.unpublishDocument(publication.documentId, publication.id);
            if (removed) {
                feedback.show(t('worldView.publicationUnpublished'));
            }
        });
        refreshSpatialUI();
    }

    // Resolves only where "here" is: avatar position, else camera position, else
    // the World origin. Each click adds another placement, so a click where a
    // placement of this Publication already sits is refused: without moving, repeated
    // clicks would only stack invisible duplicates on one spot.
    function placeOwnPublication(publication) {
        if (!publication) return;
        guarded(() => {
            const position = session.getAvatarPosition() || session.getCameraPosition() || { x: 0, y: 0, z: 0 };
            const existing = session.getPlacementsForPublication(publication.id);
            if (!detectSpatialOverlap(position, existing).isEmpty) {
                feedback.show(t('worldView.thisBuildIsAlreadyPlaced'));
                return;
            }
            session.placePublication(publication.id, position);
            const count = existing.length + 1;
            feedback.show(t('worldView.placedAt', { position: formatPosition(position), count }));
        });
        placementsRevision.value += 1;
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

    return {
        openPlacementEditor, closePlacementEditor, onMovePlacement, removePlacementFromPanel,
        removePublicationPlacement, placementsRevision, unpublishOwnPublication, placeOwnPublication, getPublicationCommentariesCommand,
        addPublicationCommentaryCommand, getPublicationPlacementsCommand
    };
}
