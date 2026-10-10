import { inject, ref } from 'vue';
import { t } from '../i18n/i18n.js';

// Network Settings' switch for the Experimental tools (docs/Pillars.md,
// "Infrastructure, kept out of sight"). Saved as soon as it changes; the
// Publications page and this page read it when they open.
export default {
    name: 'ExperimentalToolsSetting',
    emits: ['change'],
    setup(props, { emit }) {
        const store = inject('experimentalToolsSettingsStore', null);
        const shown = ref(store ? store.get().shown : false);

        function toggle(event) {
            if (!store) return;
            shown.value = store.setShown(event.target.checked).shown;
            emit('change', shown.value);
        }

        return { t, shown, toggle, available: Boolean(store) };
    },
    template: `
        <div v-if="available" class="experimental-tools-setting">
            <label class="your-data-checkbox">
                <input type="checkbox" class="experimental-tools-toggle" :checked="shown" @change="toggle">
                {{ t('experimentalTools.label') }}
            </label>
            <p class="form-hint form-hint--neutral">{{ t('experimentalTools.hint') }}</p>
        </div>
    `
};
