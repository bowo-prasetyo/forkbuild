import { ref, computed } from 'vue';
import { stripPrefix } from './presentation.js';

// Blocking is entirely local and never needs a live connection (see
// core/PeerBlockRecord.js). `identity` is duck-typed (identityId,
// publicKey, algorithm), so a live peer's remoteIdentity, a Known Peer or
// a friendship record all work.
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

    return { blocked, blockedIds, blockError, isBlockedIdentity, blockIdentity, unblockIdentity, refreshBlocked };
}
