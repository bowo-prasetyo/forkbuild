import { reactive } from 'vue';
import { PeerLifecycleState } from '../../../peer/PeerLifecycleState.js';
import { stripPrefix } from './presentation.js';
import { errorText } from '../../i18n/i18n.js';

// First-time connections: the create/accept calls InvitationExchange runs,
// and completing an invitation you created by pasting the other side's
// reply onto its pending connection.
export function useConnectionFlow({ peerSessionManager }) {
    async function createInvitation() {
        const { invitation } = await peerSessionManager.createInvitation();
        return invitation;
    }

    async function acceptInvitation(text) {
        const { reply } = await peerSessionManager.acceptInvitation(text);
        return reply;
    }

    // Keyed by connectionId, since several connections can be waiting at once.
    const replyTexts = reactive({});
    const completeErrors = reactive({});
    async function submitComplete(peer) {
        const text = (replyTexts[peer.connectionId] || '').trim();
        completeErrors[peer.connectionId] = '';
        if (!text) {
            return;
        }
        try {
            await peerSessionManager.completeConnection(peer.connectionId, text);
            delete replyTexts[peer.connectionId];
        } catch (e) {
            completeErrors[peer.connectionId] = stripPrefix(errorText(e));
        }
    }
    // The offering side of a manual exchange, still waiting for the reply.
    function awaitingReply(peer) {
        return peer.connection && peer.connection.role === 'offerer' && peer.getLifecycleState() === PeerLifecycleState.CONNECTING;
    }

    return {
        createInvitation, acceptInvitation,
        replyTexts, completeErrors, submitComplete, awaitingReply
    };
}
