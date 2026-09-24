import { ref, computed } from 'vue';
import { FriendshipState } from '../../../core/FriendshipState.js';
import { FriendshipAction } from '../../../core/FriendshipAdvertisement.js';
import { stripPrefix, shortId } from './presentation.js';

// Friends (0.2.57), friendship revocation (0.2.60), and the remote
// identity lifecycle shown beside Known Peers and Friends (0.2.68).
export function useFriendships({ friendRelationshipUseCase, identityLifecyclePropagationUseCase, peerPresenceUseCase, relationshipsById, now }) {
    const friendships = ref(friendRelationshipUseCase.getRelationships());
    const friendshipError = ref('');
    const friendshipsById = computed(() => new Map(friendships.value.map((f) => [f.identityId, f])));
    // application/identity/IdentityLifecyclePropagationUseCase.js publishes no
    // change event, so a newly received revocation/succession has
    // only ever appeared on the next one-second redraw. Kept that
    // way on purpose — `now` is read here so this re-reads storage
    // once per tick in total, instead of once per call per card.
    const remoteLifecyclesById = computed(() => {
        void now.value;
        return new Map(identityLifecyclePropagationUseCase.listRemoteLifecycle().map((l) => [l.identityId, l]));
    });

    // Looked up ONLY by a peer's already-verified remoteIdentity —
    // the exact same discipline relationshipFor() already
    // applies, for the exact same reason: an unauthenticated
    // invitation hint is never eligible to stand in for a proven
    // identity.
    // 0.2.68 — what THIS device has, second-hand, verified, learned
    // about `identityId`'s lifecycle (see core/
    // RemoteIdentityLifecycle.js's own header on why this is a purely
    // DISPLAY cross-reference, never a mutation of the Known Peer or
    // Friend record it's shown alongside).
    function remoteLifecycleFor(identityId) {
        return remoteLifecyclesById.value.get(identityId) || null;
    }

    function friendshipFor(peer) {
        return peer.remoteIdentity ? friendshipsById.value.get(peer.remoteIdentity.identityId) || null : null;
    }

    function friendStatus(peer) {
        const record = friendshipFor(peer);
        return record ? record.status : FriendshipState.NONE;
    }

    function hasPendingIncomingRequest(peer) {
        const record = friendshipFor(peer);
        return Boolean(record && !record.outgoingAction
            && record.incomingAction && record.incomingAction.action === FriendshipAction.REQUEST);
    }

    function hasSentRequest(peer) {
        const record = friendshipFor(peer);
        return Boolean(record && record.status !== FriendshipState.FRIEND
            && record.outgoingAction && record.outgoingAction.action === FriendshipAction.REQUEST);
    }

    function sendFriendRequest(peer) {
        friendshipError.value = '';
        try {
            friendRelationshipUseCase.sendFriendRequest(peer);
        } catch (e) {
            friendshipError.value = stripPrefix(e.message);
        }
    }

    function acceptFriendRequest(peer) {
        friendshipError.value = '';
        try {
            friendRelationshipUseCase.acceptFriendRequest(peer);
        } catch (e) {
            friendshipError.value = stripPrefix(e.message);
        }
    }

    // 0.2.60 — the terminal counterpart to acceptFriendRequest:
    // declines a pending incoming request instead of answering it.
    function rejectFriendRequest(peer) {
        friendshipError.value = '';
        try {
            friendRelationshipUseCase.rejectFriendRequest(peer);
        } catch (e) {
            friendshipError.value = stripPrefix(e.message);
        }
    }

    // 0.2.60 — withdraws OUR OWN pending outgoing request.
    function cancelFriendRequest(peer) {
        friendshipError.value = '';
        try {
            friendRelationshipUseCase.cancelFriendRequest(peer);
        } catch (e) {
            friendshipError.value = stripPrefix(e.message);
        }
    }

    // 0.2.60 — ends a currently-FRIEND relationship. `peer` must be
    // a live, AUTHENTICATED ConnectedPeer — see
    // application/identity/FriendRelationshipUseCase.js#unfriend's own
    // header: the other side has to actually receive the signed
    // UNFRIEND for the relationship to end on both devices, not
    // just this one.
    function unfriendPeer(peer) {
        friendshipError.value = '';
        try {
            friendRelationshipUseCase.unfriend(peer);
        } catch (e) {
            friendshipError.value = stripPrefix(e.message);
        }
    }

    // The "Friends" list's own Unfriend button needs a real,
    // AUTHENTICATED ConnectedPeer to send through — 0.2.85: application/
    // PeerPresenceUseCase.js#findConnectedPeer(), the same resolved-
    // identity lookup isConnectedNow() uses, so this never
    // duplicates that lookup's logic.
    function unfriendByIdentity(identityId) {
        const peer = peerPresenceUseCase.findConnectedPeer(identityId);
        if (peer) {
            unfriendPeer(peer);
        }
    }

    function refreshFriendships(list) {
        friendships.value = list || friendRelationshipUseCase.getRelationships();
    }

    // A friend never carries its own alias — see core/
    // FriendshipRecord.js's own header on why it stores only signed
    // evidence, never a local note. This cross-references the SAME
    // application/peer/PeerRelationshipUseCase.js alias "Known Peers"
    // already renders, falling back to a shortened identityId for a
    // friend this device never separately chose to "Remember."
    function friendDisplayName(identityId) {
        const relationship = relationshipsById.value.get(identityId);
        return (relationship && relationship.alias) || shortId(identityId);
    }

    const friends = computed(() => friendships.value.filter((f) => f.status === FriendshipState.FRIEND));

    return {
        friendshipError, refreshFriendships, remoteLifecycleFor, friends, friendStatus, hasPendingIncomingRequest, hasSentRequest,
        sendFriendRequest, acceptFriendRequest, rejectFriendRequest, cancelFriendRequest, unfriendPeer, unfriendByIdentity,
        friendDisplayName
    };
}
