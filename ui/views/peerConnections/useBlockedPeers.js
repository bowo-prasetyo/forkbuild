import { ref, computed } from 'vue';
import { stripPrefix } from './presentation.js';

// Blocked (0.2.60). Entirely local, never requires a live connection —
// see core/PeerBlockRecord.js's own header. Available from any card
// this device already holds identityId/publicKey for: an
// AUTHENTICATED "My Peers" entry, a Known Peer, or a Friend —
// `identity` is duck-typed (identityId/publicKey[/algorithm]),
// so all three shapes work unmodified.
export function useBlockedPeers({ peerBlockUseCase }) {
    const blocked = ref(peerBlockUseCase.getBlocked());
    const blockError = ref('');
    const blockedIds = computed(() => new Set(blocked.value.map((b) => b.identityId)));

    function isBlockedIdentity(identityId) {
        return blockedIds.value.has(identityId);
    }

    function blockIdentity(identity) {
        blockError.value = '';
        try {
            peerBlockUseCase.block(identity);
        } catch (e) {
            blockError.value = stripPrefix(e.message);
        }
    }

    function unblockIdentity(identityId) {
        blockError.value = '';
        try {
            peerBlockUseCase.unblock(identityId);
        } catch (e) {
            blockError.value = stripPrefix(e.message);
        }
    }

    function refreshBlocked(list) {
        blocked.value = list || peerBlockUseCase.getBlocked();
    }

    return { blocked, blockError, isBlockedIdentity, blockIdentity, unblockIdentity, refreshBlocked };
}
