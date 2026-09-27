import { ref, reactive, computed } from 'vue';
import { formatDuration, stripPrefix, shortId } from './presentation.js';

// Find by ID and Be Discoverable. A found candidate is as untrusted as
// any imported invitation (see application/peer/FindPeerUseCase.js):
// Connect runs the full handshake, and the connection then shows under
// Needs your attention like any other pending one.
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
    const findDelivered = reactive({});
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
                    publishError.value = 'No rendezvous server is configured on this device. Add one under Network Settings → Rendezvous Servers.';
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
            const { reply, delivered } = await findPeerUseCase.connect(record, findIdentityId.value.trim());
            if (delivered) {
                findDelivered[record.peerDiscoveryId] = true;
            } else {
                findReplies[record.peerDiscoveryId] = reply;
            }
        } catch (e) {
            findError.value = stripPrefix(e.message);
        } finally {
            findConnectingId.value = null;
        }
    }

    return {
        findImportText, findImportError, findImportSuccess, submitFindImport,
        findIdentityId, findCandidates, findSearched, findError, findConnectingId, findReplies, findDelivered,
        findRejectedError, submitFind, candidateExpiry, connectToCandidate,
        publishPending, publishError, isPublished, togglePublish
    };
}
