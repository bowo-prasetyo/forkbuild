import CommentaryDistributionPicker from './CommentaryDistributionPicker.js';
import { resolveSigningIdentityId } from '../../identity/resolveSigningIdentityId.js';
import { LOCAL_AND_PEERS_ONLY } from '../../core/CommentaryDistributionProvider.js';
import { isUserFacingError } from '../../core/UserFacingError.js';
import { sanitizeDistributionErrorMessage } from '../../application/publication/distribution/DistributionErrorMessageSanitizer.js';
import { errorText, t } from '../i18n/i18n.js';

// Network names, the same in every language, in the order "Sent to …" lists them.
const NETWORK_NAMES = { nostr: 'Nostr', arweave: 'Arweave', steem: 'Steem', blurt: 'Blurt' };

// Under one of your own comments, in every comment list (the Repository's, My
// Shared World's and both World Encounter panels'): which networks this device
// has sent it to, and Distribute, to send it to a network later. For a comment
// posted to connected peers only, or to add another network once you have an
// account there. Shows nothing for anyone else's comment, or when signed out:
// only a comment's author can sign it for a network.
//
// It reads and writes nothing itself: `distributeSavedPublicationCommentaryCommand`
// sends and records, and `publicationCommentaryDistributionLog` is read for the
// "Sent to …" line, which knows only what this device sent.
export default {
    name: 'CommentaryNetworkDistribution',
    components: { CommentaryDistributionPicker },
    inject: {
        distributeSavedPublicationCommentaryCommand: { default: null },
        publicationCommentaryDistributionLog: { default: null },
        identityUseCase: { default: null },
        defaultCommentaryDistributionProvider: { default: null },
        defaultAnnouncementDiscoveryProvider: { default: null }
    },
    props: {
        commentary: { type: Object, required: true }
    },
    data() {
        const network = [this.defaultCommentaryDistributionProvider, this.defaultAnnouncementDiscoveryProvider]
            .find((provider) => provider in NETWORK_NAMES);
        return {
            open: false,
            selectedProvider: network || 'nostr',
            sending: false,
            error: null,
            // The network the last Distribute here sent to.
            sentProvider: null,
            // Bumped when the log gains an entry for this comment, so the
            // "Sent to …" line re-reads it (a post's network can answer late).
            logVersion: 0
        };
    },
    mounted() {
        if (this.publicationCommentaryDistributionLog && typeof this.publicationCommentaryDistributionLog.subscribe === 'function') {
            this._unsubscribeLog = this.publicationCommentaryDistributionLog.subscribe((entry) => {
                if (entry && entry.commentaryId === this.commentary.commentaryId) this.logVersion += 1;
            });
        }
    },
    beforeUnmount() {
        this._unmounted = true;
        if (this._unsubscribeLog) this._unsubscribeLog();
    },
    methods: {
        t,
        networkName(provider) {
            return NETWORK_NAMES[provider] || provider;
        },
        // Read on each render: signing in or out isn't reactive.
        isOwn() {
            if (!this.distributeSavedPublicationCommentaryCommand || !this.publicationCommentaryDistributionLog || !this.identityUseCase) return false;
            const viewer = resolveSigningIdentityId(this.identityUseCase.provider);
            return Boolean(viewer) && viewer === this.commentary.authorIdentityId;
        },
        sentProviders() {
            void this.logVersion;
            const sent = new Set(this.publicationCommentaryDistributionLog.findByCommentaryId(this.commentary.commentaryId).map((e) => e.substrate));
            return Object.keys(NETWORK_NAMES).filter((provider) => sent.has(provider));
        },
        statusText() {
            const sent = this.sentProviders();
            return sent.length
                ? t('commentaryNetworkDistribution.sentFromThisDevice', { networks: sent.map((provider) => this.networkName(provider)) })
                : t('commentaryNetworkDistribution.notSentYet');
        },
        alreadySent() {
            return this.sentProviders().includes(this.selectedProvider);
        },
        openForm() {
            this.open = true;
            this.error = null;
            this.sentProvider = null;
        },
        async send() {
            const provider = this.selectedProvider;
            if (this.sending || provider === LOCAL_AND_PEERS_ONLY || this.alreadySent()) return;
            this.sending = true;
            this.error = null;
            this.sentProvider = null;
            try {
                await this.distributeSavedPublicationCommentaryCommand(this.commentary, provider);
                if (this._unmounted) return;
                this.sentProvider = provider;
                this.open = false;
                this.logVersion += 1;
            } catch (error) {
                if (this._unmounted) return;
                const network = this.networkName(provider);
                if (isUserFacingError(error)) {
                    this.error = errorText(error);
                } else {
                    const reason = sanitizeDistributionErrorMessage(error);
                    this.error = reason
                        ? t('commentaryNetworkDistribution.failedWithReason', { network, reason })
                        : t('commentaryNetworkDistribution.failed', { network });
                }
            } finally {
                if (!this._unmounted) this.sending = false;
            }
        }
    },
    template: `
        <div v-if="isOwn()" class="commentary-network-distribution">
            <p class="form-hint form-hint--neutral commentary-network-status">{{ statusText() }}</p>
            <button
                v-if="!open"
                type="button"
                class="action-btn commentary-network-distribute-action"
                @click="openForm"
            >{{ t('commentaryNetworkDistribution.distribute') }}</button>
            <div v-else class="commentary-network-distribute-form">
                <CommentaryDistributionPicker v-model="selectedProvider" :networks-only="true" :disabled="sending" />
                <p v-if="alreadySent()" class="form-hint form-hint--neutral commentary-network-already-sent">
                    {{ t('commentaryNetworkDistribution.alreadySent', { network: networkName(selectedProvider) }) }}
                </p>
                <button
                    type="button"
                    class="action-btn action-btn--primary commentary-network-send-action"
                    :disabled="sending || alreadySent()"
                    @click="send"
                >{{ sending ? t('commentaryNetworkDistribution.sending') : t('commentaryNetworkDistribution.send') }}</button>
                <button
                    type="button"
                    class="action-btn commentary-network-cancel-action"
                    :disabled="sending"
                    @click="open = false"
                >{{ t('commentaryNetworkDistribution.cancel') }}</button>
            </div>
            <p v-if="sentProvider" class="form-hint form-hint--neutral commentary-network-sent">
                {{ t('commentaryNetworkDistribution.sentTo', { network: networkName(sentProvider) }) }}
            </p>
            <p v-if="error" class="form-hint commentary-network-error">{{ error }}</p>
        </div>
    `
};
