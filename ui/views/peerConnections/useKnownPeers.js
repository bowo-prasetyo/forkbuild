import { ref, computed } from 'vue';
import { PeerIdentity } from '../../../peer/PeerIdentity.js';
import { stripPrefix } from './presentation.js';
import { errorText } from '../../i18n/i18n.js';

// Known Peers (local notes about an identity, with an alias) and
// Reconnect, which works for a Known Peer or a current friend.
export function useKnownPeers({ peerRelationshipUseCase, peerReconnectionUseCase, peerPresenceUseCase }) {
    const relationships = ref(peerRelationshipUseCase.getRelationships());
    const relationshipError = ref('');
    // Per-card lookups read this index, never storage — see the view's
    // own note on the one-second `now` tick.
    const relationshipsById = computed(() => new Map(relationships.value.map((r) => [r.identityId, r])));

    function refreshRelationships(list) {
        relationships.value = list || peerRelationshipUseCase.getRelationships();
    }

    // Derived live from presence, never stored on the relationship: true if
    // any authorized device of this identity is connected right now.
    function isConnectedNow(identityId) {
        return peerPresenceUseCase.isIdentityOnline(identityId);
    }

    // Remembering is always a deliberate click (docs/Principles.md,
    // "Remembering A Peer Is A Deliberate Act, Never A Side Effect Of
    // Authentication"). `identity` is a live peer's verified remoteIdentity
    // or a friendship record; a PeerIdentity refuses an identityId that
    // doesn't match its public key, so either is self-certifying.
    function rememberIdentity(identity, alias) {
        relationshipError.value = '';
        try {
            const peerIdentity = identity instanceof PeerIdentity
                ? identity
                : new PeerIdentity({ identityId: identity.identityId, publicKey: identity.publicKey, algorithm: identity.algorithm });
            peerRelationshipUseCase.rememberPeer(peerIdentity, alias !== undefined ? { alias } : {});
        } catch (e) {
            relationshipError.value = stripPrefix(errorText(e));
        }
    }

    function forgetKnownPeer(identityId) {
        relationshipError.value = '';
        try {
            peerRelationshipUseCase.forgetPeer(identityId);
        } catch (e) {
            relationshipError.value = stripPrefix(errorText(e));
        }
    }

    function updateKnownAlias(identityId, alias) {
        relationshipError.value = '';
        try {
            peerRelationshipUseCase.updateAlias(identityId, alias);
        } catch (e) {
            relationshipError.value = stripPrefix(errorText(e));
        }
    }

    // InvitationExchange's create/accept for one expected identity: the
    // fresh handshake must prove that identity or the connection is closed.
    function reconnectCreate(identityId) {
        return async () => (await peerReconnectionUseCase.reconnectAsInviter(identityId)).invitation;
    }
    function reconnectAccept(identityId) {
        return async (text) => (await peerReconnectionUseCase.reconnectViaInvitation(identityId, text)).reply;
    }
    // Set by the view's onReconnectRejected subscription.
    const reconnectRejectedError = ref('');

    return {
        relationships, relationshipsById, relationshipError, refreshRelationships, isConnectedNow,
        rememberIdentity, forgetKnownPeer, updateKnownAlias,
        reconnectCreate, reconnectAccept, reconnectRejectedError
    };
}
