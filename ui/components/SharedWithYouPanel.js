import { ref, onMounted, onBeforeUnmount, inject } from 'vue';
import { errorText, t } from '../i18n/i18n.js';
import I18nText from '../i18n/I18nText.js';
import { LEGACY_CONTENT_HASH } from '../../application/publication/sharing/SharePublicationWithPeersUseCase.js';
import { SHARE_UNAVAILABLE } from '../../application/publication/sharing/RetrieveSharedPublicationUseCase.js';
import { PeerSnapshotMaterializationOutcome } from '../../application/snapshot/materialization/PeerSnapshotMaterializationOutcome.js';

function stripPrefix(message) {
    return String(message || '').replace(/^\w+UseCase:\s*/, '');
}

// Worlds peers shared with this device that it has not retrieved yet
// (application/publication/sharing/RetrieveSharedPublicationUseCase.js).
// Shares from Friends and Known Peers are retrieved on their own; anyone
// else's wait here for a Retrieve click, which fetches the World only from
// the person who shared it, while they are connected. Each is named by the
// title its sharer signed into the share, so a person can choose; a share
// from before shares carried titles falls back to "A World shared by …".
// Emits `retrieved` whenever a World joins the Repository, by hand or
// automatically.
export default {
    name: 'SharedWithYouPanel',
    components: { I18nText },
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
                const { publication, snapshot } = await retrieveUseCase.retrieve(item.envelopeId);
                emit('retrieved', publication);
                // The Publication is in the Repository, but the World cannot
                // be explored without its snapshot, so the share stays listed.
                if (snapshot === PeerSnapshotMaterializationOutcome.UNAVAILABLE) {
                    error.value = t('sharedWithYouPanel.snapshotUnavailable');
                } else if (snapshot === PeerSnapshotMaterializationOutcome.HASH_MISMATCH) {
                    error.value = t('sharedWithYouPanel.snapshotMismatch');
                }
            } catch (e) {
                if (e && e.code === LEGACY_CONTENT_HASH) {
                    error.value = t('sharedWithYouPanel.publishedWithOldHash');
                } else if (e && e.code === SHARE_UNAVAILABLE) {
                    error.value = t('sharedWithYouPanel.shareUnavailable');
                } else {
                    error.value = stripPrefix(errorText(e));
                }
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

        return { t, pending, retrievingId, error, retrieve, sharerLabel, receivedLabel, available: Boolean(retrieveUseCase) };
    },
    template: `
        <div v-if="available && pending.length" class="peer-signal-box shared-with-you">
            <h3>{{ t('sharedWithYouPanel.sharedWithYou') }}</h3>
            <p class="form-hint form-hint--neutral">
                <I18nText keypath="sharedWithYouPanel.worldsPeersOfferedToYou"><template #retrieve><strong>{{ t('sharedWithYouPanel.retrieve') }}</strong></template></I18nText>
            </p>
            <p v-if="error" class="identity-unlock-error">{{ error }}</p>
            <div class="identity-mgmt-list">
                <div v-for="item in pending" :key="item.envelopeId" class="identity-mgmt-card">
                    <div class="identity-mgmt-card-header">
                        <span class="identity-mgmt-name">{{ item.title || t('sharedWithYouPanel.sharedBy', { sharer: sharerLabel(item) }) }}</span>
                        <span class="peer-badge" :class="item.sharerConnected ? 'peer-badge--authenticated' : 'peer-badge--pending'">
                            {{ item.sharerConnected ? t('sharedWithYouPanel.connected') : t('sharedWithYouPanel.notConnected') }}
                        </span>
                    </div>
                    <p v-if="item.title" class="identity-mgmt-status">{{ t('sharedWithYouPanel.sharedByLine', { sharer: sharerLabel(item) }) }}</p>
                    <p v-if="receivedLabel(item)" class="identity-mgmt-status">{{ t('sharedWithYouPanel.received', { when: receivedLabel(item) }) }}</p>
                    <p v-if="item.legacy" class="form-hint form-hint--neutral">{{ t('sharedWithYouPanel.sharedBeforeSha256') }}</p>
                    <div v-else class="identity-mgmt-actions">
                        <button class="action-btn action-btn--primary"
                                :disabled="!item.sharerConnected || retrievingId === item.envelopeId"
                                :title="item.sharerConnected ? '' : t('sharedWithYouPanel.theyNeedToBeConnected')"
                                @click="retrieve(item)">
                            {{ retrievingId === item.envelopeId ? t('sharedWithYouPanel.retrieving') : t('sharedWithYouPanel.retrieve2') }}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `
};
