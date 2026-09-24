

// The World Members panel: open/close, and granting or revoking a member.
export function useWorldMembersPanel({
    activeDocumentInfo, collaborationPendingIdentityId, feedback, refreshCollaborationRoster, session,
    showMembersPanel
}) {
    function openMembersPanel() {
        if (activeDocumentInfo.value) {
            refreshCollaborationRoster(activeDocumentInfo.value.documentId);
        }
        showMembersPanel.value = true;
    }

    function closeMembersPanel() {
        showMembersPanel.value = false;
    }

    // Shows "Granting…"/"Revoking…" inline, then a success message or the error.
    function grantWorldMember(identityId) {
        const documentId = activeDocumentInfo.value ? activeDocumentInfo.value.documentId : null;
        if (!documentId || !identityId) {
            return;
        }
        collaborationPendingIdentityId.value = identityId;
        try {
            session.grantWorldEdit(documentId, identityId);
            feedback.show('Grant propagated — now an Editor');
        } catch (err) {
            feedback.show(err.message);
        } finally {
            collaborationPendingIdentityId.value = null;
            refreshCollaborationRoster(documentId);
        }
    }

    function revokeWorldMember(identityId) {
        const documentId = activeDocumentInfo.value ? activeDocumentInfo.value.documentId : null;
        if (!documentId || !identityId) {
            return;
        }
        collaborationPendingIdentityId.value = identityId;
        try {
            session.revokeWorldEdit(documentId, identityId);
            feedback.show('Revocation propagated — now Read only');
        } catch (err) {
            feedback.show(err.message);
        } finally {
            collaborationPendingIdentityId.value = null;
            refreshCollaborationRoster(documentId);
        }
    }

    return {
        openMembersPanel, closeMembersPanel, grantWorldMember, revokeWorldMember
    };
}
