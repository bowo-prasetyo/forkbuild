import { computed } from 'vue';
import { evaluateNewPassphrase } from '../../application/identity/NewPassphrasePolicy.js';

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
        return { evaluation };
    },
    template: `
        <div class="new-passphrase-fields">
            <input :value="passphrase" type="password" class="modal-input" autocomplete="new-password"
                   placeholder="Passphrase (recommended)"
                   @input="$emit('update:passphrase', $event.target.value)" @keydown.enter="$emit('submit')" />
            <input v-if="passphrase" :value="confirmation" type="password" class="modal-input" autocomplete="new-password"
                   placeholder="Repeat the passphrase"
                   @input="$emit('update:confirmation', $event.target.value)" @keydown.enter="$emit('submit')" />
            <p class="form-hint form-hint--neutral">
                At least 8 characters. The passphrase encrypts this identity's private key on this device.
                There is no reset: if you forget it, the key cannot be recovered.
            </p>
            <template v-if="offerUnprotected && !passphrase">
                <p class="form-hint">
                    Without a passphrase the private key is stored unencrypted in this browser, and anything
                    that can read this site's storage can sign as this identity.
                </p>
                <label class="new-passphrase-optout">
                    <input type="checkbox" :checked="allowUnprotected"
                           @change="$emit('update:allowUnprotected', $event.target.checked)" />
                    Create without a passphrase
                </label>
            </template>
            <p v-if="showHint && evaluation.message" class="identity-unlock-error">{{ evaluation.message }}</p>
        </div>
    `
};
