// "Share with Peers" for one Repository entry: shown only on this identity's
// own signed Worlds (application/publication/sharing/SharePublicationWithPeersUseCase.js).
// Sharing offers the World to every connected peer and to peers that
// connect later; it cannot be taken back from those that received it.
import { errorText, t } from '../i18n/i18n.js';
import { LEGACY_CONTENT_HASH } from '../../application/publication/sharing/SharePublicationWithPeersUseCase.js';

export default {
    name: 'SharePublicationButton',
    inject: {
        sharePublicationWithPeersUseCase: { default: null }
    },
    props: {
        publication: { type: Object, required: true }
    },
    data() {
        return { pending: false, message: '', error: '', shared: false };
    },
    computed: {
        available() {
            return Boolean(this.sharePublicationWithPeersUseCase && this.sharePublicationWithPeersUseCase.canShare(this.publication));
        }
    },
    created() {
        this.shared = this.available && this.sharePublicationWithPeersUseCase.isShared(this.publication);
    },
    methods: {
        t,
        async share() {
            this.pending = true;
            this.message = '';
            this.error = '';
            try {
                const { announcedTo } = await this.sharePublicationWithPeersUseCase.share(this.publication);
                this.shared = true;
                this.message = announcedTo > 0
                    ? t('sharePublicationButton.sharedWith', { count: announcedTo })
                    : t('sharePublicationButton.sharedNoPeers');
            } catch (e) {
                this.error = e && e.code === LEGACY_CONTENT_HASH
                    ? t('sharePublicationButton.publishedWithOldHash')
                    : errorText(e, String(e)).replace(/^\w+UseCase:\s*/, '');
            } finally {
                this.pending = false;
            }
        }
    },
    template: `
        <div v-if="available" class="share-publication">
            <button class="action-btn action-btn--share" :disabled="pending" @click="share"
                    :title="shared ? t('sharePublicationButton.announceItAgainToThe') : t('sharePublicationButton.offerThisWorldToConnected')">
                {{ pending ? t('sharePublicationButton.sharing') : (shared ? t('sharePublicationButton.sharedShareAgain') : t('sharePublicationButton.shareWithPeers')) }}
            </button>
            <p v-if="message" class="form-hint form-hint--neutral share-publication-status">{{ message }}</p>
            <p v-if="error" class="identity-unlock-error share-publication-status">{{ error }}</p>
        </div>
    `
};
