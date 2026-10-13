import { inject, ref } from 'vue';
import { LOOK } from '../../core/LookSettings.js';
import { applyLook } from '../look.js';
import { t } from '../i18n/i18n.js';

// The look, in the More menu: like this device, light, or dark. Takes effect
// at once and is kept on this device (application/settings/LookSettingsStore.js).
export default {
    name: 'LookChoice',
    setup() {
        const store = inject('lookSettingsStore', null);
        const documentRef = inject('documentRef', globalThis.document);
        const look = ref(store ? store.get().look : LOOK.AUTO);
        const options = [
            { value: LOOK.AUTO, label: 'look.auto', hint: 'look.autoHint' },
            { value: LOOK.LIGHT, label: 'look.light', hint: 'look.lightHint' },
            { value: LOOK.DARK, label: 'look.dark', hint: 'look.darkHint' }
        ];

        function choose(value) {
            look.value = store ? store.save({ look: value }).look : value;
            applyLook(documentRef, look.value);
        }

        return { t, look, options, choose, available: Boolean(store) };
    },
    template: `
        <div v-if="available" class="look-choice" role="group" :aria-label="t('look.label')">
            <span class="look-choice-label" aria-hidden="true">{{ t('look.label') }}</span>
            <button
                v-for="option in options"
                :key="option.value"
                type="button"
                :class="['look-choice-option', { 'look-choice-option--chosen': look === option.value }]"
                :aria-pressed="look === option.value ? 'true' : 'false'"
                :title="t(option.hint)"
                @click="choose(option.value)"
            >{{ t(option.label) }}</button>
        </div>
    `
};
