import { describeSteemAnnouncingUnreadiness } from '../../application/steem/SteemAnnouncingReadiness.js';
import { t } from '../i18n/i18n.js';

// Network names, the same in every language.
const PROVIDER_LABELS = { arweave: 'Arweave', nostr: 'Nostr', steem: 'Steem' };

export function commentaryDistributionProviderLabel(provider) {
    return PROVIDER_LABELS[provider] || 'Nostr';
}

// The network a World View comment is distributed to when it's posted: the
// same choice the Repository's comment form offers. The host keeps the value
// (v-model) and sends it as `discoveryProvider` with the comment.
export default {
    name: 'CommentaryDistributionPicker',
    // The account this device posts to Steem as, when set.
    inject: { steemAnnouncingConfigurationStore: { default: null } },
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
        // A Steem post that can't be signed fails silently after the local
        // save, so say why before posting. Checked on each render, since
        // Keychain can appear after load.
        steemUnreadiness() {
            if (this.modelValue !== 'steem') return null;
            return describeSteemAnnouncingUnreadiness({
                account: this.steemAnnouncingConfigurationStore?.get()?.account ?? null,
                keychain: globalThis.steem_keychain
            });
        }
    },
    template: `
        <div class="commentary-distribution-picker">
            <label class="publication-commentary-provider-label">
                {{ t('publicationCommentarySection.distribution') }}
                <select v-model="model" class="form-select commentary-distribution-picker-select" :disabled="disabled">
                    <option value="arweave">Arweave</option>
                    <option value="nostr">Nostr</option>
                    <option value="steem">Steem</option>
                </select>
            </label>
            <p v-if="steemUnreadiness()" class="form-hint publication-commentary-steem-hint">{{ steemUnreadiness() }}</p>
        </div>
    `
};
