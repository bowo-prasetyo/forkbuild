import { describeSteemAnnouncingUnreadiness } from '../../application/steem/SteemAnnouncingReadiness.js';
import { describeBlurtAnnouncingUnreadiness } from '../../application/blurt/BlurtAnnouncingReadiness.js';
import { LOCAL_AND_PEERS_ONLY } from '../../core/CommentaryDistributionProvider.js';
import { t } from '../i18n/i18n.js';

// Network names, the same in every language.
const PROVIDER_LABELS = { arweave: 'Arweave', blurt: 'Blurt', nostr: 'Nostr', steem: 'Steem' };

export function commentaryDistributionProviderLabel(provider) {
    if (provider === LOCAL_AND_PEERS_ONLY) return t('publicationCommentarySection.localAndPeersOnly');
    return PROVIDER_LABELS[provider] || 'Nostr';
}

// The line shown after a comment is saved. It names what was requested, never
// a delivery: distribution reports nothing back.
export function commentarySavedText(provider) {
    if (provider === LOCAL_AND_PEERS_ONLY) return t('publicationCommentarySection.savedPeersOnly');
    return t('publicationCommentarySection.savedDistributionRequested', { provider: commentaryDistributionProviderLabel(provider) });
}

// Where a comment goes when it's posted: one network, or none (connected peers
// only). Every comment form uses it: the Repository's and World View's. The
// host keeps the value (v-model) and sends it as `discoveryProvider` with the
// comment.
export default {
    name: 'CommentaryDistributionPicker',
    // The accounts this device posts to Steem and Blurt as, when set.
    inject: { steemAnnouncingConfigurationStore: { default: null }, blurtAnnouncingConfigurationStore: { default: null } },
    props: {
        modelValue: { type: String, default: 'nostr' },
        disabled: { type: Boolean, default: false }
    },
    emits: ['update:modelValue'],
    computed: {
        model: {
            get() { return this.modelValue; },
            set(value) { this.$emit('update:modelValue', value); }
        }
    },
    methods: {
        t,
        peersOnly() {
            return this.modelValue === LOCAL_AND_PEERS_ONLY;
        },
        // A Steem post that can't be signed fails silently after the local
        // save, so say why before posting. Checked on each render, since
        // Keychain can appear after load.
        steemUnreadiness() {
            if (this.modelValue !== 'steem') return null;
            return describeSteemAnnouncingUnreadiness({
                account: this.steemAnnouncingConfigurationStore?.get()?.account ?? null,
                keychain: globalThis.steem_keychain
            });
        },
        blurtUnreadiness() {
            if (this.modelValue !== 'blurt') return null;
            return describeBlurtAnnouncingUnreadiness({
                account: this.blurtAnnouncingConfigurationStore?.get()?.account ?? null,
                keychain: globalThis.blurt_keychain
            });
        }
    },
    template: `
        <div class="commentary-distribution-picker">
            <label class="publication-commentary-provider-label">
                {{ t('publicationCommentarySection.distribution') }}
                <select v-model="model" class="form-select commentary-distribution-picker-select" :disabled="disabled">
                    <option value="arweave">Arweave</option>
                    <option value="blurt">Blurt</option>
                    <option value="nostr">Nostr</option>
                    <option value="steem">Steem</option>
                    <option value="${LOCAL_AND_PEERS_ONLY}">{{ t('publicationCommentarySection.localAndPeersOnly') }}</option>
                </select>
            </label>
            <p v-if="steemUnreadiness()" class="form-hint publication-commentary-steem-hint">{{ steemUnreadiness() }}</p>
            <p v-if="blurtUnreadiness()" class="form-hint publication-commentary-blurt-hint">{{ blurtUnreadiness() }}</p>
            <p v-if="peersOnly()" class="form-hint publication-commentary-peers-hint">{{ t('publicationCommentarySection.peersOnlyHint') }}</p>
        </div>
    `
};
