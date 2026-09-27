// "Share with Peers" for one Repository entry: shown only on this identity's
// own signed Worlds (application/publication/sharing/SharePublicationWithPeersUseCase.js).
// Sharing offers the World to every connected peer and to peers that
// connect later; it cannot be taken back from those that received it.
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
        async share() {
            this.pending = true;
            this.message = '';
            this.error = '';
            try {
                const { announcedTo } = await this.sharePublicationWithPeersUseCase.share(this.publication);
                this.shared = true;
                this.message = announcedTo > 0
                    ? `Shared with ${announcedTo} connected ${announcedTo === 1 ? 'peer' : 'peers'}, and with peers who connect later.`
                    : 'Shared. No peers are connected right now; peers who connect later receive it.';
            } catch (e) {
                this.error = String(e.message || e).replace(/^\w+UseCase:\s*/, '');
            } finally {
                this.pending = false;
            }
        }
    },
    template: `
        <div v-if="available" class="share-publication">
            <button class="action-btn action-btn--share" :disabled="pending" @click="share"
                    :title="shared ? 'Announce it again to the peers connected now' : 'Offer this World to connected peers'">
                {{ pending ? 'Sharing…' : (shared ? 'Shared ✓ · Share Again' : 'Share with Peers') }}
            </button>
            <p v-if="message" class="form-hint form-hint--neutral share-publication-status">{{ message }}</p>
            <p v-if="error" class="identity-unlock-error share-publication-status">{{ error }}</p>
        </div>
    `
};
