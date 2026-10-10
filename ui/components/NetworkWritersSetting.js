import { inject, ref } from 'vue';
import { NetworkWriter } from '../../core/NetworkWriters.js';
import { t } from '../i18n/i18n.js';

// Network Settings' wallet switches: which network writers this device
// builds (core/NetworkWriters.js, docs/Pillars.md "Networks: readers and
// writers"). Each is saved as soon as it changes; the Publications page reads
// it when it opens. Turning one off stops the Publications page offering its
// wallet steps; what it built stays loaded until the page is reloaded.
const WRITERS = Object.freeze([
    Object.freeze({ id: NetworkWriter.BITCOIN, label: 'networkWriters.bitcoin', hint: 'networkWriters.bitcoinHint' }),
    Object.freeze({ id: NetworkWriter.BASE, label: 'networkWriters.base', hint: 'networkWriters.baseHint' })
]);

export default {
    name: 'NetworkWritersSetting',
    setup() {
        const store = inject('networkWriterSettingsStore', null);
        const enabled = ref(store ? { ...store.get() } : {});

        function toggle(id, event) {
            if (!store) return;
            enabled.value = { ...store.setEnabled(id, event.target.checked) };
        }

        return { t, writers: WRITERS, enabled, toggle, available: Boolean(store) };
    },
    template: `
        <div v-if="available" class="network-writers-setting">
            <h2 class="network-writers-title">{{ t('networkWriters.title') }} <span class="experimental-badge">{{ t('networkSettingsView.experimental') }}</span></h2>
            <p class="form-hint form-hint--neutral">{{ t('networkWriters.intro') }}</p>
            <div v-for="writer in writers" :key="writer.id" class="network-writer">
                <label class="your-data-checkbox">
                    <input type="checkbox" :class="'network-writer-toggle network-writer-toggle--' + writer.id" :checked="enabled[writer.id] === true" @change="toggle(writer.id, $event)">
                    {{ t(writer.label) }}
                </label>
                <p class="form-hint form-hint--neutral">{{ t(writer.hint) }}</p>
            </div>
        </div>
    `
};
