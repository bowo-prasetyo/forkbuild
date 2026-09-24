import { ref, reactive, computed } from 'vue';
import { stripPrefix } from './presentation.js';

// Known Peers (0.2.56) and their Reconnect gesture (0.2.62).
export function useKnownPeers({ peerRelationshipUseCase, peerReconnectionUseCase, peerPresenceUseCase }) {
    const relationships = ref(peerRelationshipUseCase.getRelationships());
    const relationshipError = ref('');
    // Per-card lookups read this index, never storage — see the view's
    // own note on the one-second `now` tick.
    const relationshipsById = computed(() => new Map(relationships.value.map((r) => [r.identityId, r])));

    function refreshRelationships(list) {
        relationships.value = list || peerRelationshipUseCase.getRelationships();
    }

    // A relationship is looked up ONLY by a peer's already-verified
    // remoteIdentity — see application/peer/PeerRelationshipUseCase.js's
    // own header on why an invitation hint is never eligible here.
    function relationshipFor(peer) {
        return peer.remoteIdentity ? relationshipsById.value.get(peer.remoteIdentity.identityId) || null : null;
    }

    // "Is this known peer connected right now?" is never stored on
    // the relationship itself — see core/PeerRelationshipStatus.js's
    // own header — it is derived, fresh, from application/
    // PeerPresenceUseCase.js#isIdentityOnline() (0.2.85: the
    // Identity Presence aggregate — true if ANY currently-authorized
    // device of this identity has a live connection, not only one
    // whose own key happens to equal identityId directly).
    function isConnectedNow(identityId) {
        return peerPresenceUseCase.isIdentityOnline(identityId);
    }

    function rememberPeer(peer) {
        relationshipError.value = '';
        try {
            peerRelationshipUseCase.rememberPeer(peer.remoteIdentity, { alias: peer.alias || undefined });
        } catch (e) {
            relationshipError.value = stripPrefix(e.message);
        }
    }

    function forgetKnownPeer(identityId) {
        relationshipError.value = '';
        try {
            peerRelationshipUseCase.forgetPeer(identityId);
        } catch (e) {
            relationshipError.value = stripPrefix(e.message);
        }
    }

    function updateKnownAlias(identityId, event) {
        peerRelationshipUseCase.updateAlias(identityId, event.target.value);
    }

    // --- Reconnect (0.2.62) --------------------------------------------
    // A "Known Peer" that isn't connected right now (isConnectedNow()
    // above) gets a Reconnect gesture — the exact same two-step
    // invitation dance "Invite Someone"/"Connect to Peer" already walk
    // a FIRST connection through, scoped to one remembered identity via
    // application/peer/PeerReconnectionUseCase.js so the fresh handshake is
    // verified against who this device actually expects, not merely
    // accepted because SOMEONE authenticated. Completing the offering
    // side's handshake (pasting the far end's reply) reuses the
    // existing "My Peers" awaitingReply()/startComplete() flow
    // unmodified — a reconnect's pending connection is an ordinary
    // pending ConnectedPeer, nothing more.
    const reconnectTargetId = ref(null);
    const reconnectInvitePending = ref(false);
    const reconnectInviteError = ref('');
    const reconnectInvitation = reactive({ json: '', expiresAt: null });
    const reconnectImportText = ref('');
    const reconnectAcceptError = ref('');
    const reconnectReply = ref('');
    // Set by the view's onReconnectRejected subscription.
    const reconnectRejectedError = ref('');

    function toggleReconnect(identityId) {
        reconnectRejectedError.value = '';
        if (reconnectTargetId.value === identityId) {
            reconnectTargetId.value = null;
            return;
        }
        reconnectTargetId.value = identityId;
        reconnectInviteError.value = '';
        reconnectAcceptError.value = '';
        reconnectInvitation.json = '';
        reconnectInvitation.expiresAt = null;
        reconnectImportText.value = '';
        reconnectReply.value = '';
    }

    async function submitReconnectInvite(identityId) {
        reconnectInviteError.value = '';
        reconnectInvitePending.value = true;
        try {
            const { invitation } = await peerReconnectionUseCase.reconnectAsInviter(identityId);
            reconnectInvitation.json = JSON.stringify(invitation.toJSON(), null, 2);
            reconnectInvitation.expiresAt = invitation.expiresAt;
        } catch (e) {
            reconnectInviteError.value = stripPrefix(e.message);
        } finally {
            reconnectInvitePending.value = false;
        }
    }

    async function submitReconnectAccept(identityId) {
        reconnectAcceptError.value = '';
        if (!reconnectImportText.value.trim()) {
            return;
        }
        try {
            const { reply } = await peerReconnectionUseCase.reconnectViaInvitation(identityId, reconnectImportText.value.trim());
            reconnectReply.value = reply;
            reconnectImportText.value = '';
        } catch (e) {
            reconnectAcceptError.value = stripPrefix(e.message);
        }
    }

    return {
        relationships, relationshipsById, relationshipError, refreshRelationships, relationshipFor, isConnectedNow,
        rememberPeer, forgetKnownPeer, updateKnownAlias,
        reconnectTargetId, reconnectInvitePending, reconnectInviteError, reconnectInvitation,
        reconnectImportText, reconnectAcceptError, reconnectReply, reconnectRejectedError,
        toggleReconnect, submitReconnectInvite, submitReconnectAccept
    };
}
