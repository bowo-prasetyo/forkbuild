import { ref, onMounted, onBeforeUnmount, inject } from 'vue';

function stripPrefix(message) {
    return String(message || '').replace(/^\w+UseCase:\s*/, '');
}

// Worlds peers shared with this device that it has not retrieved yet
// (application/publication/sharing/RetrieveSharedPublicationUseCase.js).
// Shares from Friends and Known Peers are retrieved on their own; anyone
// else's wait here for a Retrieve click, which fetches the World only from
// the person who shared it, while they are connected. Emits `retrieved`
// whenever a World joins the Repository, by hand or automatically.
export default {
    name: 'SharedWithYouPanel',
    emits: ['retrieved'],
    setup(props, { emit }) {
        const retrieveUseCase = inject('retrieveSharedPublicationUseCase', null);
        const autoRetrieveUseCase = inject('autoRetrieveSharedPublicationsUseCase', null);
        const publicationPeerExchange = inject('publicationPeerExchange', null);
        const peerSessionManager = inject('peerSessionManager', null);
        const peerRelationshipUseCase = inject('peerRelationshipUseCase', null);

        const pending = ref([]);
        const retrievingId = ref(null);
        const error = ref('');

        function refresh() {
            pending.value = retrieveUseCase ? retrieveUseCase.listPending() : [];
        }

        function sharerLabel(item) {
            const relationship = peerRelationshipUseCase ? peerRelationshipUseCase.getRelationship(item.sharerId) : null;
            return (relationship && relationship.alias) || `…${item.sharerId.slice(-14)}`;
        }

        function receivedLabel(item) {
            return item.receivedAt ? new Date(item.receivedAt).toLocaleString() : '';
        }

        async function retrieve(item) {
            error.value = '';
            retrievingId.value = item.envelopeId;
            try {
                const { publication } = await retrieveUseCase.retrieve(item.envelopeId);
                emit('retrieved', publication);
            } catch (e) {
                error.value = stripPrefix(e.message);
            } finally {
                retrievingId.value = null;
                refresh();
            }
        }

        const unsubscribes = [];
        onMounted(() => {
            refresh();
            if (publicationPeerExchange) unsubscribes.push(publicationPeerExchange.onPublicationReceived(refresh));
            if (peerSessionManager) unsubscribes.push(peerSessionManager.onPeersChanged(refresh));
            if (autoRetrieveUseCase) {
                unsubscribes.push(autoRetrieveUseCase.onRetrieved(({ publication }) => {
                    refresh();
                    emit('retrieved', publication);
                }));
            }
        });
        onBeforeUnmount(() => { for (const unsubscribe of unsubscribes) unsubscribe(); });

        return { pending, retrievingId, error, retrieve, sharerLabel, receivedLabel, available: Boolean(retrieveUseCase) };
    },
    template: `
        <div v-if="available && pending.length" class="peer-signal-box shared-with-you">
            <h3>Shared with you</h3>
            <p class="form-hint form-hint--neutral">
                Worlds peers offered to you. Shares from your Friends and Known Peers are retrieved on their own;
                these are from others. <strong>Retrieve</strong> fetches a World only from the person who shared
                it, and only while they are connected, then adds it here.
            </p>
            <p v-if="error" class="identity-unlock-error">{{ error }}</p>
            <div class="identity-mgmt-list">
                <div v-for="item in pending" :key="item.envelopeId" class="identity-mgmt-card">
                    <div class="identity-mgmt-card-header">
                        <span class="identity-mgmt-name">A World shared by {{ sharerLabel(item) }}</span>
                        <span class="peer-badge" :class="item.sharerConnected ? 'peer-badge--authenticated' : 'peer-badge--pending'">
                            {{ item.sharerConnected ? 'Connected' : 'Not connected' }}
                        </span>
                    </div>
                    <p v-if="receivedLabel(item)" class="identity-mgmt-status">received {{ receivedLabel(item) }}</p>
                    <div class="identity-mgmt-actions">
                        <button class="action-btn action-btn--primary"
                                :disabled="!item.sharerConnected || retrievingId === item.envelopeId"
                                :title="item.sharerConnected ? '' : 'They need to be connected'"
                                @click="retrieve(item)">
                            {{ retrievingId === item.envelopeId ? 'Retrieving…' : 'Retrieve' }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `
};
