import { ref, reactive, computed } from 'vue';
import { formatDuration, stripPrefix, shortId } from './presentation.js';

// Find a Peer (0.2.64) and Be Discoverable (0.2.66).
//
// "Discovered" is never "Authenticated" — see application/
// FindPeerUseCase.js's own header. A candidate below is exactly
// as untrusted as any invitation this device has ever imported;
// clicking Connect starts a REAL connection through the exact
// same WebRTC + 0.2.49 handshake pipeline every other card on
// this page already goes through, and the result shows up in
// "My Peers" like any other pending connection — this
// section never renders a second, competing progression display
// for it.
export function useFindPeer({ findPeerUseCase, peers, now }) {
    const findImportText = ref('');
    const findImportError = ref('');
    const findImportSuccess = ref('');
    function submitFindImport() {
        findImportError.value = '';
        findImportSuccess.value = '';
        if (!findImportText.value.trim()) {
            return;
        }
        try {
            const record = findPeerUseCase.importCandidate(findImportText.value.trim());
            findImportSuccess.value = record.identityHint
                ? `Candidate added — claims to be ${shortId(record.identityHint)}.`
                : 'Candidate added — no identity hint was included.';
            findImportText.value = '';
        } catch (e) {
            findImportError.value = stripPrefix(e.message);
        }
    }

    const findIdentityId = ref('');
    const findCandidates = ref([]);
    const findSearched = ref(false);
    const findError = ref('');
    const findConnectingId = ref(null);
    const findReplies = reactive({});
    // Set by the view's onCandidateRejected subscription.
    const findRejectedError = ref('');

    async function submitFind() {
        findError.value = '';
        findRejectedError.value = '';
        const identityId = findIdentityId.value.trim();
        if (!identityId) {
            return;
        }
        try {
            findCandidates.value = await findPeerUseCase.search(identityId);
            findSearched.value = true;
        } catch (e) {
            findError.value = stripPrefix(e.message);
        }
    }

    // --- Be Discoverable (0.2.66) ----------------------------------------
    // "Publish me to whatever rendezvous network is configured" — see
    // application/peer/FindPeerUseCase.js#publishSelf's own header. Never
    // available unless at least one real rendezvous node is actually
    // configured (ui/main.js) — with none configured, publishSelf()
    // has nothing to publish TO and this section explains that rather
    // than offering a button that would silently do nothing.
    const publishPending = ref(false);
    const publishError = ref('');
    // Read from the app-wide application/peer/FindPeerUseCase.js#isPublishing
    // — never a flag of this view's own, which reset on every remount
    // and never noticed an inbound connection consuming the offer.
    // Re-read whenever the peer list changes (an offer being answered
    // or closed is a peer change), on every one-second tick (expiry),
    // and after this view's own publish/stop (publishRevision).
    const publishRevision = ref(0);
    const isPublished = computed(() => {
        void peers.value;
        void now.value;
        void publishRevision.value;
        return findPeerUseCase.isPublishing();
    });
    async function togglePublish() {
        publishError.value = '';
        publishPending.value = true;
        try {
            if (isPublished.value) {
                await findPeerUseCase.stopPublishing();
            } else {
                const publication = await findPeerUseCase.publishSelf();
                if (!publication) {
                    publishError.value = 'No rendezvous network is configured on this device — see peer/RendezvousConfig.js.';
                }
            }
        } catch (e) {
            publishError.value = stripPrefix(e.message);
        } finally {
            publishRevision.value++;
            publishPending.value = false;
        }
    }

    function candidateExpiry(record) {
        return formatDuration(Math.max(0, record.expiresAt.getTime() - now.value));
    }

    async function connectToCandidate(record) {
        findError.value = '';
        findConnectingId.value = record.peerDiscoveryId;
        try {
            const { reply } = await findPeerUseCase.connect(record, findIdentityId.value.trim());
            findReplies[record.peerDiscoveryId] = reply;
        } catch (e) {
            findError.value = stripPrefix(e.message);
        } finally {
            findConnectingId.value = null;
        }
    }

    return {
        findImportText, findImportError, findImportSuccess, submitFindImport,
        findIdentityId, findCandidates, findSearched, findError, findConnectingId, findReplies,
        findRejectedError, submitFind, candidateExpiry, connectToCandidate,
        publishPending, publishError, isPublished, togglePublish
    };
}
