import { ref, reactive } from 'vue';
import { PeerLifecycleState } from '../../../peer/PeerLifecycleState.js';
import { stripPrefix } from './presentation.js';

// The manual invitation handshake: Invite Someone, Connect to Peer, and
// the inviter's closing Complete Connection step.
export function useConnectionFlow({ peerSessionManager }) {
    // --- Invite Someone ---------------------------------------------
    const invitePending = ref(false);
    const inviteError = ref('');
    const pendingInvitation = reactive({ json: '', expiresAt: null });

    async function startInvite() {
        inviteError.value = '';
        pendingInvitation.json = '';
        invitePending.value = true;
        try {
            const { invitation } = await peerSessionManager.createInvitation();
            pendingInvitation.json = JSON.stringify(invitation.toJSON(), null, 2);
            pendingInvitation.expiresAt = invitation.expiresAt;
        } catch (e) {
            inviteError.value = stripPrefix(e.message);
        } finally {
            invitePending.value = false;
        }
    }
    function dismissInvitation() {
        pendingInvitation.json = '';
        pendingInvitation.expiresAt = null;
    }

    // --- Connect to Peer ----------------------------------------------
    const showAcceptForm = ref(false);
    const importText = ref('');
    const acceptError = ref('');
    const acceptReply = ref('');
    async function submitAcceptInvitation() {
        acceptError.value = '';
        if (!importText.value.trim()) {
            return;
        }
        try {
            const { reply } = await peerSessionManager.acceptInvitation(importText.value.trim());
            acceptReply.value = reply;
            importText.value = '';
        } catch (e) {
            acceptError.value = stripPrefix(e.message);
        }
    }
    function closeAcceptForm() {
        showAcceptForm.value = false;
        importText.value = '';
        acceptError.value = '';
        acceptReply.value = '';
    }

    // --- Complete Connection (the inviter's second, closing step) ------
    const completingConnectionId = ref(null);
    const completeReplyText = ref('');
    const completeError = ref('');
    function startComplete(peer) {
        completingConnectionId.value = peer.connectionId;
        completeReplyText.value = '';
        completeError.value = '';
    }
    async function submitComplete(peer) {
        completeError.value = '';
        if (!completeReplyText.value.trim()) {
            return;
        }
        try {
            await peerSessionManager.completeConnection(peer.connectionId, completeReplyText.value.trim());
            completingConnectionId.value = null;
            completeReplyText.value = '';
        } catch (e) {
            completeError.value = stripPrefix(e.message);
        }
    }
    function awaitingReply(peer) {
        // Only the offering side of a real WebRTC handshake ever needs
        // a second, manual paste — see peer/WebRtcPeerConnection.js's
        // own header. Bob's side (role "answerer") completes the moment
        // ICE finds a path; there is nothing for him to paste.
        return peer.connection && peer.connection.role === 'offerer' && peer.getLifecycleState() === PeerLifecycleState.CONNECTING;
    }

    return {
        invitePending, inviteError, pendingInvitation, startInvite, dismissInvitation,
        showAcceptForm, importText, acceptError, acceptReply, submitAcceptInvitation, closeAcceptForm,
        completingConnectionId, completeReplyText, completeError, startComplete, submitComplete, awaitingReply
    };
}
