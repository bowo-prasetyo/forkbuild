import { computed } from 'vue';
import { evaluateNewPassphrase } from '../../application/identity/NewPassphrasePolicy.js';
import { t } from '../i18n/i18n.js';

// The passphrase part of "create an identity" and "protect an identity":
// a passphrase and its confirmation, and, when offerUnprotected is set, an
// explicit opt-out for creating an unprotected identity. The parent owns
// the values (v-model:passphrase, v-model:confirmation,
// v-model:allow-unprotected) and asks evaluateNewPassphrase() whether it
// may submit.
export default {
    name: 'NewPassphraseFields',
    props: {
        passphrase: { type: String, default: '' },
        confirmation: { type: String, default: '' },
        allowUnprotected: { type: Boolean, default: false },
        offerUnprotected: { type: Boolean, default: true },
        // Only show the hint once the user has tried to submit.
        showHint: { type: Boolean, default: false }
    },
    emits: ['update:passphrase', 'update:confirmation', 'update:allowUnprotected', 'submit'],
    setup(props) {
        const evaluation = computed(() => evaluateNewPassphrase(props));
        return { t, evaluation };
    },
    template: `
        <div class="new-passphrase-fields">
            <input :value="passphrase" type="password" class="modal-input" autocomplete="new-password"
                   :placeholder="t('newPassphraseFields.passphraseRecommended')"
                   @input="$emit('update:passphrase', $event.target.value)" @keydown.enter="$emit('submit')" />
            <input v-if="passphrase" :value="confirmation" type="password" class="modal-input" autocomplete="new-password"
                   :placeholder="t('newPassphraseFields.repeatThePassphrase')"
                   @input="$emit('update:confirmation', $event.target.value)" @keydown.enter="$emit('submit')" />
            <p class="form-hint form-hint--neutral">
                {{ t('newPassphraseFields.atLeast8CharactersThe') }}
            </p>
            <template v-if="offerUnprotected && !passphrase">
                <p class="form-hint">
                    {{ t('newPassphraseFields.withoutAPassphraseThePrivate') }}
                </p>
                <label class="new-passphrase-optout">
                    <input type="checkbox" :checked="allowUnprotected"
                           @change="$emit('update:allowUnprotected', $event.target.checked)" />
                    {{ t('newPassphraseFields.createWithoutAPassphrase') }}
                </label>
            </template>
            <p v-if="showHint && evaluation.message" class="identity-unlock-error">{{ t(evaluation.message) }}</p>
        </div>
    `
};
